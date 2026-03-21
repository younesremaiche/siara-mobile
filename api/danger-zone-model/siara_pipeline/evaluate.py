from __future__ import annotations

from pathlib import Path
from typing import Any
import logging

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score


def classification_metrics(y_true: np.ndarray, y_score: np.ndarray) -> dict[str, float]:
    return {
        "roc_auc": float(roc_auc_score(y_true, y_score)),
        "pr_auc": float(average_precision_score(y_true, y_score)),
        "brier": float(brier_score_loss(y_true, y_score)),
        "logloss": float(log_loss(y_true, y_score, labels=[0, 1])),
        "base_rate": float(np.mean(y_true)),
        "rows": int(len(y_true)),
    }


def topk_capture(y_true: np.ndarray, y_score: np.ndarray, fracs: list[float]) -> list[dict[str, float]]:
    y = np.asarray(y_true).astype(int)
    p = np.asarray(y_score).astype(float)
    severe_total = max(1, int(y.sum()))
    rows = []
    for frac in fracs:
        k = max(1, int(round(frac * len(y))))
        idx = np.argsort(p)[::-1][:k]
        captured = int(y[idx].sum())
        rows.append(
            {
                "top_frac": float(frac),
                "k": int(k),
                "capture_rate": float(captured / severe_total),
                "precision": float(y[idx].mean()),
            }
        )
    return rows


def calibration_table(y_true: np.ndarray, y_score: np.ndarray, n_bins: int) -> pd.DataFrame:
    df = pd.DataFrame({"y": y_true.astype(int), "p": y_score.astype(float)})
    df["bin"] = pd.qcut(df["p"], q=n_bins, duplicates="drop")
    out = (
        df.groupby("bin", observed=True)
        .agg(n=("y", "size"), avg_pred=("p", "mean"), empirical_rate=("y", "mean"))
        .reset_index()
    )
    return out


def stability_by_period(
    raw_df: pd.DataFrame,
    y_true: np.ndarray,
    y_score: np.ndarray,
    time_col: str,
    freq: str = "Q",
) -> pd.DataFrame:
    t = pd.to_datetime(raw_df[time_col], errors="coerce", utc=True)
    out = pd.DataFrame({"period": t.dt.to_period(freq).astype(str), "y": y_true, "p": y_score})
    out = out.dropna(subset=["period"])
    if out.empty:
        return pd.DataFrame(columns=["period", "rows", "severe_rate", "avg_score"])
    return (
        out.groupby("period", observed=True)
        .agg(rows=("y", "size"), severe_rate=("y", "mean"), avg_score=("p", "mean"))
        .reset_index()
        .sort_values("period")
    )


def save_plots(
    output_dir: Path,
    y_true: np.ndarray,
    y_score: np.ndarray,
    calibration_bins: int,
    logger: logging.Logger,
) -> None:
    try:
        import matplotlib.pyplot as plt
        from sklearn.metrics import PrecisionRecallDisplay, RocCurveDisplay
    except Exception as exc:  # pragma: no cover
        logger.warning("Plotting skipped (matplotlib/sklearn display unavailable): %s", exc)
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(6, 5))
    RocCurveDisplay.from_predictions(y_true, y_score, ax=ax)
    ax.set_title("ROC Curve")
    fig.tight_layout()
    fig.savefig(output_dir / "roc_curve.png", dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 5))
    PrecisionRecallDisplay.from_predictions(y_true, y_score, ax=ax)
    ax.set_title("Precision-Recall Curve")
    fig.tight_layout()
    fig.savefig(output_dir / "pr_curve.png", dpi=150)
    plt.close(fig)

    prob_true, prob_pred = calibration_curve(y_true, y_score, n_bins=calibration_bins, strategy="quantile")
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(prob_pred, prob_true, marker="o", label="model")
    ax.plot([0, 1], [0, 1], linestyle="--", color="gray", label="perfect")
    ax.set_xlabel("Mean predicted")
    ax.set_ylabel("Empirical severe rate")
    ax.set_title("Calibration Curve")
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_dir / "calibration_curve.png", dpi=150)
    plt.close(fig)


def write_model_report(
    path: Path,
    metadata: dict[str, Any],
    metrics_base: dict[str, float],
    metrics_cal: dict[str, float],
    topk_rows: list[dict[str, float]],
    warnings: list[str],
) -> None:
    lines = [
        "# Model Report",
        "",
        f"- Model version: `{metadata['model_version']}`",
        f"- Timestamp (UTC): `{metadata['created_at_utc']}`",
        f"- Dataset hash (sha256): `{metadata['dataset']['sha256']}`",
        "",
        "## Split Summary",
        f"- Train rows: {metadata['splits']['train_rows']:,} | severe rate: {metadata['splits']['train_severe_rate']:.4f}",
        f"- Early-stop rows: {metadata['splits']['early_rows']:,} | severe rate: {metadata['splits']['early_severe_rate']:.4f}",
        f"- Calib rows: {metadata['splits']['calib_rows']:,} | severe rate: {metadata['splits']['calib_severe_rate']:.4f}",
        f"- Test rows: {metadata['splits']['test_rows']:,} | severe rate: {metadata['splits']['test_severe_rate']:.4f}",
        "",
        "## Metrics",
        f"- Base ROC-AUC: {metrics_base['roc_auc']:.6f}",
        f"- Base PR-AUC: {metrics_base['pr_auc']:.6f}",
        f"- Base Brier: {metrics_base['brier']:.6f}",
        f"- Calibrated ROC-AUC: {metrics_cal['roc_auc']:.6f}",
        f"- Calibrated PR-AUC: {metrics_cal['pr_auc']:.6f}",
        f"- Calibrated Brier: {metrics_cal['brier']:.6f}",
        "",
        "## Top-K Capture",
    ]

    for row in topk_rows:
        lines.append(
            f"- Top {int(row['top_frac'] * 100)}%: capture={row['capture_rate']:.4f}, precision={row['precision']:.4f}"
        )

    lines.extend(["", "## Warnings"])
    if warnings:
        lines.extend([f"- {w}" for w in warnings])
    else:
        lines.append("- None")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

