from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from siara_pipeline.calibrate import compute_thresholds, fit_calibrator
from siara_pipeline.config import load_config
from siara_pipeline.data import build_time_split_samples
from siara_pipeline.evaluate import (
    calibration_table,
    classification_metrics,
    save_plots,
    stability_by_period,
    topk_capture,
    write_model_report,
)
from siara_pipeline.features import FeatureProcessor
from siara_pipeline.train import train_lightgbm
from siara_pipeline.utils import ensure_dir, file_sha256, json_dump, set_global_seeds, setup_logging, utc_now_iso


def _safe_stratify(y: np.ndarray) -> np.ndarray | None:
    unique = np.unique(y)
    if len(unique) < 2:
        return None
    return y


def _build_baseline_table(x_train: pd.DataFrame, categorical_cols: list[str], numeric_cols: list[str]) -> dict:
    if "hour" not in x_train.columns or "dow" not in x_train.columns:
        return {}
    out = {}
    grouped = x_train.groupby(["hour", "dow"], observed=True, sort=False)
    for (hour, dow), grp in grouped:
        row = {}
        for col in numeric_cols:
            row[col] = float(np.nanmedian(pd.to_numeric(grp[col], errors="coerce")))
        for col in categorical_cols:
            mode = grp[col].astype(str).mode(dropna=True)
            row[col] = "__OTHER__" if mode.empty else str(mode.iloc[0])
        out[f"{int(hour)}_{int(dow)}"] = row
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Siara severity + risk pipeline.")
    parser.add_argument("--config", required=True, help="Path to YAML/JSON config.")
    args = parser.parse_args()

    cfg = load_config(args.config)
    setup_logging(cfg.runtime.log_level)
    logger = __import__("logging").getLogger("siara_pipeline")

    set_global_seeds(cfg.runtime.seed)
    artifact_dir = ensure_dir(cfg.artifact_dir)
    eval_dir = ensure_dir(artifact_dir / "evaluation")

    logger.info("Artifact directory: %s", artifact_dir)
    logger.info("Dataset: %s", cfg.dataset_path)

    dataset_sha = file_sha256(cfg.dataset_path)
    samples = build_time_split_samples(cfg, logger)

    processor = FeatureProcessor.from_config(cfg, logger)
    processor.fit(samples.train_raw)

    x_train, y_train, train_quality = processor.transform(samples.train_raw, include_label=True)
    x_val, y_val, val_quality = processor.transform(samples.val_raw, include_label=True)

    val_df = x_val.copy()
    val_df["__y__"] = y_val
    raw_val = samples.val_raw.copy()
    raw_val = raw_val.iloc[: len(val_df)].reset_index(drop=True)
    val_df = val_df.reset_index(drop=True)

    val_rest, test_df, raw_rest, raw_test = train_test_split(
        val_df,
        raw_val,
        test_size=cfg.sampling.test_size,
        random_state=cfg.runtime.seed,
        stratify=_safe_stratify(val_df["__y__"].to_numpy()),
    )

    early_df, calib_df, _, _ = train_test_split(
        val_rest,
        raw_rest,
        test_size=cfg.sampling.calib_fraction_of_rest,
        random_state=cfg.runtime.seed,
        stratify=_safe_stratify(val_rest["__y__"].to_numpy()),
    )

    x_early = early_df.drop(columns=["__y__"])
    y_early = early_df["__y__"].to_numpy().astype(np.int8)
    x_calib = calib_df.drop(columns=["__y__"])
    y_calib = calib_df["__y__"].to_numpy().astype(np.int8)
    x_test = test_df.drop(columns=["__y__"])
    y_test = test_df["__y__"].to_numpy().astype(np.int8)

    train_result = train_lightgbm(cfg, x_train, y_train, x_early, y_early, logger)
    raw_model = train_result.model
    calibrator = fit_calibrator(raw_model, x_calib, y_calib, method=cfg.calibration.method)

    p_test_base = raw_model.predict_proba(x_test)[:, 1]
    p_test_cal = calibrator.predict_proba(x_test)[:, 1]

    metrics_base = classification_metrics(y_test, p_test_base)
    metrics_cal = classification_metrics(y_test, p_test_cal)
    topk_rows = topk_capture(y_test, p_test_cal, cfg.evaluation.top_k_fracs)

    calib_tbl = calibration_table(y_test, p_test_cal, cfg.evaluation.calibration_bins)
    calib_tbl.to_csv(eval_dir / "calibration_table.csv", index=False)

    stability_tbl = stability_by_period(raw_test.reset_index(drop=True), y_test, p_test_cal, cfg.label.time_col, cfg.evaluation.stability_freq)
    stability_tbl.to_csv(eval_dir / "stability_by_period.csv", index=False)

    if cfg.evaluation.plot:
        save_plots(eval_dir, y_test, p_test_cal, cfg.evaluation.calibration_bins, logger)

    if cfg.calibration.threshold_source == "calib":
        p_threshold_src = calibrator.predict_proba(x_calib)[:, 1]
    else:
        p_threshold_src = calibrator.predict_proba(x_train)[:, 1]

    thresholds = compute_thresholds(100.0 * p_threshold_src, cfg.calibration.threshold_quantiles)
    baseline = _build_baseline_table(x_train, cfg.active_categorical_cols, cfg.active_numeric_cols)

    geo_eval = {}
    if samples.geo_eval_raw is not None:
        x_geo, y_geo, _ = processor.transform(samples.geo_eval_raw, include_label=True)
        p_geo = calibrator.predict_proba(x_geo)[:, 1]
        geo_eval = {
            "rows": int(len(y_geo)),
            "states": cfg.evaluation.holdout_states,
            "metrics": classification_metrics(y_geo, p_geo),
        }

    warnings = []
    if cfg.deployment.target_domain.lower() == "algeria" and not cfg.calibration.validated_on_target_domain:
        warnings.append("Model trained on US data; outputs are relative risk only for Algeria.")
    if train_quality["missing_columns_filled"]:
        warnings.append(f"Train sample missing columns were filled: {train_quality['missing_columns_filled']}")
    if val_quality["missing_columns_filled"]:
        warnings.append(f"Validation sample missing columns were filled: {val_quality['missing_columns_filled']}")

    metadata = {
        "model_version": cfg.paths.model_version,
        "created_at_utc": utc_now_iso(),
        "goal": "Binary severe classifier: severe = (Severity >= 3). Danger% = 100 * model score.",
        "label_definition": f"severe = ({cfg.label.target_col} >= {cfg.label.severe_threshold})",
        "dataset": {
            "path": str(cfg.dataset_path),
            "sha256": dataset_sha,
            "time_cutoff_utc": str(samples.time_cutoff),
        },
        "features": {
            "numeric": cfg.active_numeric_cols,
            "categorical": cfg.active_categorical_cols,
            "boolean": cfg.active_boolean_cols,
            "feature_order": cfg.model_feature_order,
        },
        "thresholds": thresholds,
        "risk_levels": {"low": f"<q50", "moderate": "q50-q75", "high": "q75-q90", "extreme": ">=q90"},
        "baseline_dynamic_by_hour_dow": baseline,
        "calibration": {
            "method": cfg.calibration.method,
            "validated_on_target_domain": cfg.calibration.validated_on_target_domain,
            "is_calibrated_probability_default": bool(cfg.calibration.validated_on_target_domain),
        },
        "deployment": {
            "source_domain": cfg.deployment.source_domain,
            "target_domain": cfg.deployment.target_domain,
            "algeria_mode_default": cfg.deployment.algeria_mode_default,
            "domain_warning": "Model trained on US data; outputs are relative risk only for Algeria.",
        },
        "training": {
            "train_sampling": samples.stats,
            "lightgbm": train_result.info,
            "metrics_base_test": metrics_base,
            "metrics_calibrated_test": metrics_cal,
            "topk_capture_test": topk_rows,
            "geo_holdout_eval": geo_eval,
        },
        "splits": {
            "train_rows": int(len(y_train)),
            "train_severe_rate": float(np.mean(y_train)),
            "early_rows": int(len(y_early)),
            "early_severe_rate": float(np.mean(y_early)),
            "calib_rows": int(len(y_calib)),
            "calib_severe_rate": float(np.mean(y_calib)),
            "test_rows": int(len(y_test)),
            "test_severe_rate": float(np.mean(y_test)),
        },
        "feature_processor": processor.feature_metadata(),
        "config_snapshot": cfg.to_dict(),
        "warnings": warnings,
    }

    joblib.dump(raw_model, artifact_dir / "model_raw.joblib")
    joblib.dump(calibrator, artifact_dir / "model_calibrated.joblib")
    json_dump(metadata, artifact_dir / "metadata.json")

    json_dump({"base": metrics_base, "calibrated": metrics_cal, "topk_capture": topk_rows}, eval_dir / "metrics.json")
    if not calib_tbl.empty:
        calib_tbl.to_csv(eval_dir / "calibration_table.csv", index=False)
    if not stability_tbl.empty:
        stability_tbl.to_csv(eval_dir / "stability_by_period.csv", index=False)

    write_model_report(
        artifact_dir / "model_report.md",
        metadata,
        metrics_base=metrics_base,
        metrics_cal=metrics_cal,
        topk_rows=topk_rows,
        warnings=warnings,
    )

    logger.info("Saved artifacts:")
    logger.info(" - %s", artifact_dir / "model_raw.joblib")
    logger.info(" - %s", artifact_dir / "model_calibrated.joblib")
    logger.info(" - %s", artifact_dir / "metadata.json")
    logger.info(" - %s", artifact_dir / "model_report.md")

    print(json.dumps({"artifact_dir": str(artifact_dir), "model_version": cfg.paths.model_version}, indent=2))


if __name__ == "__main__":
    main()

