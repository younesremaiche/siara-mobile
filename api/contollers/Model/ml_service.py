from flask import Flask, Response, jsonify, request, stream_with_context
import json
import joblib
import numpy as np
import pandas as pd
import requests
import shap
import os
import sys
import time
import traceback
import warnings
from bisect import bisect_right

# LightGBM emits a cosmetic UserWarning ("X does not have valid feature names")
# when the model was trained with NumPy-typed feature names. The Pipeline still
# predicts correctly; the warning is noise in production logs. Suppress only
# this specific message — keep every other warning loud.
warnings.filterwarnings(
    "ignore",
    message=r"X does not have valid feature names.*",
    category=UserWarning,
)
warnings.filterwarnings(
    "ignore",
    message=r"X has feature names, but .* was fitted without feature names.*",
    category=UserWarning,
)

app = Flask(__name__)

# Base directory (api folder)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)
ANOMALY_DETECTION_DIR = os.path.join(BASE_DIR, "anomaly-detection")
if ANOMALY_DETECTION_DIR not in sys.path:
    sys.path.append(ANOMALY_DETECTION_DIR)

from report_spam_model import classify_report_payload
from report_validator import validate_report as siara_validate_report
from services.quiz_explainer import (
    build_template_explanation,
    explain_quiz_result,
    stream_quiz_explanation,
    structure_quiz_explanation,
)

# Driver mentality model artifacts
MODEL_PATH = os.path.join(BASE_DIR, "driver-quiz-model", "driver_model.joblib")
RAW_MODEL_PATH = os.path.join(BASE_DIR, "driver-quiz-model", "driver_model_raw.joblib")
META_PATH = os.path.join(BASE_DIR, "driver-quiz-model", "metadata.json")

# Danger-zone model artifacts (production-safe, no bundle class dependency)
CAL_MODEL_PATH = os.path.join(BASE_DIR, "danger-zone-model", "siara_v1_artifacts", "siara_severe_model.joblib")
BASE_MODEL_PATH = os.path.join(BASE_DIR, "danger-zone-model", "siara_v1_artifacts", "base_lightgbm.joblib")
DANGER_META_PATH = os.path.join(BASE_DIR, "danger-zone-model", "siara_v1_artifacts", "siara_severe_metadata.json")
SENTINEL_PATH = os.path.join(
    BASE_DIR, "anomaly-detection", "SiaraSentinelDZ_v2.joblib"
)
REPORT_SPAM_MODEL_PATH = os.getenv(
    "REPORT_SPAM_MODEL_PATH",
    os.path.join(BASE_DIR, "anomaly-detection", "best_fakeddit_model.pt"),
)

# ---- Load driver-quiz artifacts
model = joblib.load(MODEL_PATH)
rf_raw = joblib.load(RAW_MODEL_PATH)
with open(META_PATH, "r", encoding="utf-8") as f:
    meta = json.load(f)

FEATURES = meta["features"]
ordered_labels = meta["ordered_labels"]
explainer = shap.TreeExplainer(rf_raw)

# ---- Load danger-zone artifacts
DANGER_MODEL = joblib.load(CAL_MODEL_PATH)
BASE_MODEL = joblib.load(BASE_MODEL_PATH)
with open(DANGER_META_PATH, "r", encoding="utf-8") as f:
    DANGER_META = json.load(f)

DANGER_FEATURES = DANGER_META["features"]
DANGER_NUMERIC_FEATURES = DANGER_FEATURES["numeric"]
DANGER_CATEGORICAL_FEATURES = DANGER_FEATURES["categorical"]
DANGER_BOOLEAN_FEATURES = DANGER_FEATURES["boolean"]
DANGER_FEATURE_ORDER = (
    DANGER_NUMERIC_FEATURES + DANGER_CATEGORICAL_FEATURES + DANGER_BOOLEAN_FEATURES
)

DANGER_PREPROCESS = DANGER_META.get("preprocess", {})
DANGER_NUMERIC_MEDIANS = DANGER_PREPROCESS.get("numeric_median", {})
DANGER_NUMERIC_CLIP = DANGER_PREPROCESS.get("numeric_clip_p01_p99", {})
DANGER_CATEGORICAL_LEVELS = DANGER_META.get("categorical_levels", {})
DANGER_THRESHOLDS = DANGER_META.get("thresholds", {})
DANGER_BASELINE_BY_HD = DANGER_META.get("baseline_dynamic_by_hour_dow", {})

DANGER_SHAP_EXPLAINER = shap.TreeExplainer(BASE_MODEL)

# ---- Load sentinel artifact (graceful fallback if unavailable)
SENTINEL_ENABLED = False
SENTINEL_LOAD_ERROR = None
SENTINEL_PIPELINE = None
SENTINEL_THRESHOLD_NORM = None
SENTINEL_FEATURE_COLUMNS = []
SENTINEL_NORM_SORTED = np.asarray([], dtype=float)
SENTINEL_WEATHER_COLS = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "pressure_msl",
    "windspeed_10m",
    "winddirection_10m",
    "cloudcover",
]
try:
    sentinel_blob = joblib.load(SENTINEL_PATH)
    if not isinstance(sentinel_blob, dict):
        raise TypeError("Sentinel artifact must be a dict")

    SENTINEL_PIPELINE = sentinel_blob["pipeline"]
    SENTINEL_THRESHOLD_NORM = float(sentinel_blob["threshold_norm"])
    SENTINEL_FEATURE_COLUMNS = list(sentinel_blob["feature_columns"])
    SENTINEL_NORM_SORTED = np.asarray(sentinel_blob["norm_sorted"], dtype=float).reshape(-1)
    if SENTINEL_NORM_SORTED.size == 0:
        raise ValueError("norm_sorted is empty")
    SENTINEL_WEATHER_COLS = list(sentinel_blob.get("weather_cols", SENTINEL_WEATHER_COLS))
    SENTINEL_ENABLED = True
except Exception as exc:
    SENTINEL_LOAD_ERROR = str(exc)
    SENTINEL_ENABLED = False

SENTINEL_WEATHER_REQUIRED_COLS = [c for c in SENTINEL_WEATHER_COLS if c != "cloudcover"]

# ---- Load accident-occurrence artifacts (occurrence_beta_v1)
#
# The deployed bundle is a single sklearn Pipeline saved as calibrator.joblib —
# preprocessor + LightGBM + isotonic calibration all baked in. Prediction is
# `calibrator.predict_proba(df)[:, 1]`; no separate preprocessor/model joblibs
# are needed. The fail-clearly contract is enforced: if calibrator.joblib or
# feature_list.json are missing, OCCURRENCE_ENABLED stays False and every
# request returns 503 with a clear "artifacts missing" message. The rest of
# the ML service (severity overlay, quiz, spam) keeps running.
OCCURRENCE_DIR = os.path.join(
    BASE_DIR, "occurrence-model", "occurrence_betav1_final"
)
OCCURRENCE_CALIBRATOR = None
OCCURRENCE_FEATURE_LIST = []
OCCURRENCE_METRICS = {}
OCCURRENCE_TRAINING_MANIFEST = {}
OCCURRENCE_SHAP_TOP_FEATURES = []
OCCURRENCE_FEATURE_IMPORTANCE = []
OCCURRENCE_RISK_THRESHOLDS = {
    "low": 0.0,
    "moderate": 0.05,
    "high": 0.2,
    "critical": 0.5,
}
OCCURRENCE_DECISION_THRESHOLD = 0.2
OCCURRENCE_MODEL_VERSION = "occurrence_beta_v1"
OCCURRENCE_SELECTED_MODEL = "lightgbm"
OCCURRENCE_CALIBRATION_METHOD = "isotonic"
OCCURRENCE_LOAD_ERROR = None
OCCURRENCE_ENABLED = False


def _read_csv_rows(path, limit=None):
    """Lightweight CSV reader without bringing pandas just for two small files."""
    import csv

    rows = []
    with open(path, "r", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for idx, row in enumerate(reader):
            if limit is not None and idx >= limit:
                break
            rows.append(row)
    return rows


try:
    occ_calibrator_path = os.path.join(OCCURRENCE_DIR, "calibrator.joblib")
    occ_features_path = os.path.join(OCCURRENCE_DIR, "feature_list.json")
    occ_metrics_path = os.path.join(OCCURRENCE_DIR, "metrics.json")
    occ_manifest_path = os.path.join(OCCURRENCE_DIR, "training_manifest.json")
    occ_shap_path = os.path.join(OCCURRENCE_DIR, "shap_top_features.csv")
    occ_importance_path = os.path.join(OCCURRENCE_DIR, "feature_importance.csv")

    if not os.path.exists(occ_calibrator_path):
        raise FileNotFoundError(occ_calibrator_path)
    if not os.path.exists(occ_features_path):
        raise FileNotFoundError(occ_features_path)

    OCCURRENCE_CALIBRATOR = joblib.load(occ_calibrator_path)
    if not hasattr(OCCURRENCE_CALIBRATOR, "predict_proba"):
        raise RuntimeError(
            "calibrator.joblib does not expose predict_proba — expected a "
            "sklearn Pipeline that bundles preprocessor + LightGBM + isotonic."
        )

    with open(occ_features_path, "r", encoding="utf-8") as f:
        OCCURRENCE_FEATURE_LIST = list(json.load(f))
    if not OCCURRENCE_FEATURE_LIST:
        raise RuntimeError("feature_list.json is empty")

    if os.path.exists(occ_metrics_path):
        with open(occ_metrics_path, "r", encoding="utf-8") as f:
            OCCURRENCE_METRICS = json.load(f)

    if os.path.exists(occ_manifest_path):
        with open(occ_manifest_path, "r", encoding="utf-8") as f:
            OCCURRENCE_TRAINING_MANIFEST = json.load(f)

    OCCURRENCE_RISK_THRESHOLDS = OCCURRENCE_TRAINING_MANIFEST.get(
        "risk_level_thresholds", OCCURRENCE_RISK_THRESHOLDS
    )
    OCCURRENCE_MODEL_VERSION = OCCURRENCE_TRAINING_MANIFEST.get(
        "model_version", OCCURRENCE_MODEL_VERSION
    )
    OCCURRENCE_SELECTED_MODEL = OCCURRENCE_TRAINING_MANIFEST.get(
        "selected_model", OCCURRENCE_SELECTED_MODEL
    )
    OCCURRENCE_CALIBRATION_METHOD = OCCURRENCE_TRAINING_MANIFEST.get(
        "calibration_method", OCCURRENCE_CALIBRATION_METHOD
    )

    if os.path.exists(occ_shap_path):
        OCCURRENCE_SHAP_TOP_FEATURES = _read_csv_rows(occ_shap_path, limit=20)
    if os.path.exists(occ_importance_path):
        OCCURRENCE_FEATURE_IMPORTANCE = _read_csv_rows(occ_importance_path, limit=40)

    OCCURRENCE_ENABLED = True
    print(
        f"[occurrence] loaded {OCCURRENCE_MODEL_VERSION} "
        f"{OCCURRENCE_SELECTED_MODEL} + {OCCURRENCE_CALIBRATION_METHOD} "
        f"({len(OCCURRENCE_FEATURE_LIST)} features) from {OCCURRENCE_DIR}",
        flush=True,
    )
except FileNotFoundError as exc:
    OCCURRENCE_LOAD_ERROR = f"missing artifact: {exc}"
    OCCURRENCE_ENABLED = False
    print(
        f"[occurrence] {OCCURRENCE_MODEL_VERSION} artifacts missing at "
        f"{OCCURRENCE_DIR}: {exc}",
        flush=True,
    )
except Exception as exc:  # noqa: BLE001 — log & disable, never crash startup
    OCCURRENCE_LOAD_ERROR = f"{type(exc).__name__}: {exc}"
    OCCURRENCE_ENABLED = False
    print(
        f"[occurrence] failed to load {OCCURRENCE_MODEL_VERSION}: "
        f"{type(exc).__name__}: {exc}",
        flush=True,
    )
    traceback.print_exc()


def _occurrence_risk_level(probability):
    """Resolve risk level from the calibrated probability using manifest thresholds."""
    thresholds = OCCURRENCE_RISK_THRESHOLDS or {}
    critical = float(thresholds.get("critical", 0.5))
    high = float(thresholds.get("high", 0.2))
    moderate = float(thresholds.get("moderate", 0.05))

    if probability is None or not np.isfinite(probability):
        return "unknown"
    if probability >= critical:
        return "critical"
    if probability >= high:
        return "high"
    if probability >= moderate:
        return "moderate"
    return "low"


def _occurrence_confidence(probability):
    """Confidence proxy: how far the calibrated probability is from 0.5."""
    if probability is None or not np.isfinite(probability):
        return None
    return float(min(1.0, max(0.0, 1.0 - 2.0 * abs(probability - 0.5))))


def _occurrence_global_top_factors():
    """Static fallback when SHAP is unavailable: use shap_top_features.csv."""
    factors = []
    source = OCCURRENCE_SHAP_TOP_FEATURES or OCCURRENCE_FEATURE_IMPORTANCE
    for row in source[:5]:
        feature_name = row.get("feature") or row.get("name") or ""
        raw_importance = (
            row.get("mean_abs_shap")
            or row.get("importance")
            or row.get("gain")
            or row.get("weight")
        )
        try:
            importance_value = float(raw_importance) if raw_importance is not None else None
        except (TypeError, ValueError):
            importance_value = None
        factors.append(
            {
                "feature": feature_name,
                "value": None,
                "importance": importance_value,
                "direction": "increases_risk",
            }
        )
    return factors


def _occurrence_coerce_value(value):
    """JSON-safe coercion: NaN/inf -> None, numpy scalars -> Python scalars."""
    if value is None:
        return None
    if isinstance(value, (np.floating, float)):
        scalar = float(value)
        if not np.isfinite(scalar):
            return None
        return scalar
    if isinstance(value, (np.integer,)):
        return int(value)
    return value


def _occurrence_extract_row_features(raw):
    """Accept either {'features': {...}} or a bare {column: value} dict."""
    if not isinstance(raw, dict):
        raise ValueError("rows[] entries must be objects")
    inner = raw.get("features")
    if isinstance(inner, dict):
        return inner
    return raw


def _occurrence_normalize_value(value):
    """JSON null / Python None must become NaN before hitting the Pipeline."""
    if value is None:
        return np.nan
    # Cheap finite check for floats; lets through int / str / bool unchanged.
    if isinstance(value, float) and not np.isfinite(value):
        return np.nan
    return value


def _occurrence_build_frame(rows):
    """Normalize rows against feature_list.json.

    Returns (DataFrame, missing_by_row). For each input row, columns missing
    from the payload become NaN, extra columns are dropped, and a per-row
    list of missing required columns is captured so the response can carry
    it back to the caller (helps Node spot upstream feature-builder gaps).
    """
    columns = list(OCCURRENCE_FEATURE_LIST)
    if not columns:
        raise RuntimeError(
            "OCCURRENCE_FEATURE_LIST is empty — feature_list.json was not loaded"
        )
    normalized_rows = []
    missing_by_row = []
    for raw in rows or []:
        feature_dict = _occurrence_extract_row_features(raw)
        if not isinstance(feature_dict, dict):
            raise ValueError("rows[] entries must contain a features object or be feature dicts")
        normalized = {}
        missing = []
        for col in columns:
            if col not in feature_dict:
                normalized[col] = np.nan
                missing.append(col)
            else:
                normalized[col] = _occurrence_normalize_value(feature_dict[col])
        normalized_rows.append(normalized)
        missing_by_row.append(missing)
    frame = pd.DataFrame(normalized_rows, columns=columns)
    return frame, missing_by_row


def _occurrence_predict_calibrated(frame):
    """Returns (raw_scores, calibrated_probabilities) via the Pipeline.

    The deployed bundle is a single sklearn Pipeline (preprocessor + LightGBM +
    isotonic) saved as calibrator.joblib, so `predict_proba(df)[:, 1]` gives
    us the calibrated positive-class probability end-to-end. The same array
    is returned twice (raw == calibrated) to keep the surrounding response
    code shape-stable.
    """
    if OCCURRENCE_CALIBRATOR is None:
        raise RuntimeError("Occurrence calibrator is not loaded")
    calibrated = np.asarray(OCCURRENCE_CALIBRATOR.predict_proba(frame)[:, 1], dtype=float)
    return calibrated, calibrated


TRUE_STRINGS = {"1", "true", "t", "yes", "y", "on"}
FALSE_STRINGS = {"0", "false", "f", "no", "n", "off"}


def _log_incoming(route, payload):
    try:
        preview = json.dumps(payload, default=str)
    except TypeError:
        preview = str(payload)
    if len(preview) > 1200:
        preview = preview[:1200] + "...(truncated)"
    print(f"[Flask] {route} body: {preview}")


# -----------------------------
# Driver advice helpers
# -----------------------------
def _human_label(s):
    return str(s).replace("_", " ").strip()


FEATURE_EXPLANATIONS = {
    "errors": "driving mistakes that may force sudden braking or late reactions",
    "violations": "breaking traffic rules (speeding, phone use, signals) which increases crash risk",
    "lapses": "attention lapses and distraction that reduce your reaction time",
    "angry": "anger and aggressive reactions to other drivers",
    "risky": "risk-taking decisions like unsafe overtakes or late lane changes",
    "high_velocity": "a tendency to drive at higher speeds, leaving less time to react",
    "anxious": "driving anxiety, which can affect decision-making under pressure",
    "patient": "patience and calmness in traffic, which reduces risky reactions",
    "careful": "careful, safety-focused driving behavior",
    "distress_reduction": "using driving as stress relief, which can increase risk if emotions are intense",
    "dissociative": "mind-wandering while driving, which can reduce awareness of hazards",
}

FEATURE_ACTIONS = {
    "errors": "Focus on scanning mirrors/blind spots and keeping a larger safety distance to avoid last-second reactions.",
    "violations": "Reduce violations by respecting speed limits/signals and avoiding phone use while driving.",
    "lapses": "Minimize distractions (phone, multitasking) and take breaks if tired to avoid autopilot driving.",
    "angry": "When irritated, increase following distance, slow down, and avoid engaging with other drivers.",
    "risky": "Avoid risky overtakes and last-second moves. If you are unsure, do not overtake.",
    "high_velocity": "Cap your speed even on empty roads; use cruise control where possible to stabilize speed.",
    "anxious": "Start with simpler routes and gradually increase difficulty to build confidence and reduce tension.",
    "patient": "Keep the calm approach; leaving earlier and accepting delays prevents impulsive decisions.",
    "careful": "Keep maintaining safety habits (seatbelt, signaling, distance) because they strongly reduce risk.",
    "distress_reduction": "If you drive to reduce stress, avoid driving when emotions are intense; use safer stress relief first.",
    "dissociative": "Stay mentally present (narrate road events to yourself) and avoid driving when mentally overloaded.",
}


def _sorted_impacts(shap_per_feature):
    items = [(k, float(v)) for k, v in shap_per_feature.items()]
    return sorted(items, key=lambda kv: abs(kv[1]), reverse=True)


def generate_advice_paragraph(
    risk_label, risk_percent, shap_per_feature, top_k_pos=3, top_k_neg=2
):
    impacts = _sorted_impacts(shap_per_feature)
    pos = [(f, v) for f, v in impacts if v > 0][:top_k_pos]
    neg = [(f, v) for f, v in impacts if v < 0][:top_k_neg]

    label_txt = _human_label(risk_label)
    paragraph = f"Your driving profile shows a {label_txt} level of risk ({risk_percent:.2f}%). "

    if pos:
        reasons = [FEATURE_EXPLANATIONS.get(feat, _human_label(feat)) for feat, _ in pos]
        if len(reasons) == 1:
            reasons_txt = reasons[0]
        elif len(reasons) == 2:
            reasons_txt = f"{reasons[0]} and {reasons[1]}"
        else:
            reasons_txt = ", ".join(reasons[:-1]) + f", and {reasons[-1]}"
        paragraph += f"This result is mainly influenced by {reasons_txt}. "

    if neg:
        protects = [FEATURE_EXPLANATIONS.get(feat, _human_label(feat)) for feat, _ in neg]
        if len(protects) == 1:
            protects_txt = protects[0]
        else:
            protects_txt = " and ".join(protects[:2])
        paragraph += f"On the positive side, {protects_txt} helps reduce your overall risk. "

    actions = [FEATURE_ACTIONS.get(feat) for feat, _ in pos[:2] if FEATURE_ACTIONS.get(feat)]
    if actions:
        paragraph += "To lower your risk, " + " ".join(actions)
    else:
        paragraph += (
            "To lower your risk, focus on staying attentive, respecting traffic rules, "
            "and keeping a safe speed and distance."
        )

    return paragraph.strip()


def _feature_factor_payload(feature, impact):
    return {
        "name": feature,
        "description": FEATURE_EXPLANATIONS.get(feature, _human_label(feature)),
        "impact": round(float(impact), 6),
        "advice": FEATURE_ACTIONS.get(feature),
    }


def _top_quiz_factors(shap_per_feature, positive=True, limit=3):
    impacts = _sorted_impacts(shap_per_feature)
    if positive:
        filtered = [(feature, impact) for feature, impact in impacts if impact > 0]
    else:
        filtered = [(feature, impact) for feature, impact in impacts if impact < 0]
    return [_feature_factor_payload(feature, impact) for feature, impact in filtered[:limit]]


def build_quiz_result_data(risk_label, risk_percent, shap_per_feature, factor_scores):
    top_risk_factors = _top_quiz_factors(shap_per_feature, positive=True, limit=3)
    top_protective_factors = _top_quiz_factors(shap_per_feature, positive=False, limit=3)
    advice_focus = [
        factor["advice"]
        for factor in top_risk_factors
        if factor.get("advice")
    ][:3]

    if not advice_focus:
        advice_focus = [
            "Stay attentive, keep a safe speed and distance, and follow traffic rules consistently."
        ]

    return {
        "overall_risk_label": risk_label,
        "overall_risk_score": round(float(risk_percent), 2),
        "score_scale": "0-100 percent. This score is computed deterministically by the Python quiz model.",
        "top_risk_factors": top_risk_factors,
        "top_protective_factors": top_protective_factors,
        "questionnaire_sources": [
            "SIARA driver quiz questionnaire",
            "Deterministic Python model output",
            "SHAP feature contribution summary",
        ],
        "factor_scores": factor_scores,
        "advice_focus": advice_focus,
    }


# -----------------------------
# Danger-zone helpers
# -----------------------------
def _dedupe_preserve_order(items):
    return list(dict.fromkeys(items))


def _safe_float(value):
    if value is None:
        return np.nan
    if isinstance(value, (float, np.floating)):
        return float(value)
    if isinstance(value, (int, np.integer)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return np.nan
        try:
            return float(text)
        except ValueError:
            return np.nan
    try:
        return float(value)
    except (TypeError, ValueError):
        return np.nan


def _to_bool_int(value):
    if value is None:
        return 0
    if isinstance(value, (bool, np.bool_)):
        return int(value)
    if isinstance(value, (int, np.integer)):
        return int(value != 0)
    if isinstance(value, (float, np.floating)):
        if np.isnan(value):
            return 0
        return int(value != 0.0)

    text = str(value).strip().lower()
    if text in TRUE_STRINGS:
        return 1
    if text in FALSE_STRINGS:
        return 0

    num = _safe_float(value)
    if np.isnan(num):
        return 0
    return int(num != 0.0)


def _danger_level_from_thresholds(danger_percent):
    q50 = float(DANGER_THRESHOLDS.get("q50", 25.0))
    q75 = float(DANGER_THRESHOLDS.get("q75", 50.0))
    q90 = float(DANGER_THRESHOLDS.get("q90", 75.0))

    if danger_percent < q50:
        return "low"
    if danger_percent < q75:
        return "moderate"
    if danger_percent < q90:
        return "high"
    return "extreme"


def _build_quality_payload(quality, include_details=True):
    missing_count = len(quality["missing_features"])
    ood_count = len(quality["ood_features"])

    score = 1.0
    score -= 0.06 * missing_count
    score -= 0.04 * ood_count
    if quality.get("invalid_start_time"):
        score -= 0.08
    confidence = float(np.clip(score, 0.05, 1.0)) * 100.0

    if confidence >= 85:
        quality_label = "high"
    elif confidence >= 65:
        quality_label = "medium"
    else:
        quality_label = "low"

    payload = {
        "confidence": round(confidence, 2),
        "quality": quality_label,
        "missing_count": missing_count,
        "ood_count": ood_count,
    }

    if include_details:
        payload["missing_features"] = quality["missing_features"]
        payload["ood_features"] = quality["ood_features"]
        payload["imputed_features"] = quality["imputed_features"]
        payload["clipped_features"] = quality["clipped_features"]
        payload["invalid_start_time"] = bool(quality["invalid_start_time"])

    return payload


def _extract_row_payload(payload):
    if not isinstance(payload, dict):
        return None
    row = payload.get("row")
    if isinstance(row, dict):
        return row
    return payload


def _preprocess_danger_row(raw_row):
    row = dict(raw_row or {})
    quality = {
        "missing_features": [],
        "ood_features": [],
        "imputed_features": [],
        "clipped_features": [],
        "invalid_start_time": False,
    }

    start_time_raw = row.get("Start_Time")
    parsed_ts = pd.to_datetime(start_time_raw, errors="coerce")
    if not pd.isna(parsed_ts):
        row["hour"] = int(parsed_ts.hour)
        row["dow"] = int(parsed_ts.dayofweek)
        row["month"] = int(parsed_ts.month)
    elif start_time_raw not in (None, ""):
        quality["invalid_start_time"] = True

    time_defaults = {"hour": 12.0, "dow": 2.0, "month": 6.0}
    time_bounds = {"hour": (0.0, 23.0), "dow": (0.0, 6.0), "month": (1.0, 12.0)}
    numeric_values = {}

    for feat in DANGER_NUMERIC_FEATURES:
        if feat in {"hour", "dow", "month"}:
            val = _safe_float(row.get(feat))
            if np.isnan(val):
                val = time_defaults[feat]
                quality["missing_features"].append(feat)
                quality["imputed_features"].append(feat)
            low, high = time_bounds[feat]
            if val < low or val > high:
                quality["ood_features"].append(
                    {"feature": feat, "reason": "out_of_range", "value": float(val)}
                )
                quality["clipped_features"].append(feat)
            numeric_values[feat] = float(np.clip(val, low, high))
            continue

        val = _safe_float(row.get(feat))
        if np.isnan(val):
            val = float(DANGER_NUMERIC_MEDIANS.get(feat, 0.0))
            quality["missing_features"].append(feat)
            quality["imputed_features"].append(feat)

        clip_cfg = DANGER_NUMERIC_CLIP.get(feat, {})
        low = _safe_float(clip_cfg.get("p01"))
        high = _safe_float(clip_cfg.get("p99"))
        if not np.isnan(low) and not np.isnan(high):
            if val < low or val > high:
                quality["ood_features"].append(
                    {
                        "feature": feat,
                        "reason": "clipped_to_training_range",
                        "value": float(val),
                    }
                )
                quality["clipped_features"].append(feat)
            val = float(np.clip(val, low, high))

        numeric_values[feat] = float(val)

    categorical_values = {}
    for feat in DANGER_CATEGORICAL_FEATURES:
        levels = DANGER_CATEGORICAL_LEVELS.get(feat, [])
        fallback = "Unknown" if "Unknown" in levels else (levels[0] if levels else "Unknown")

        raw_value = row.get(feat)
        if raw_value is None or (isinstance(raw_value, str) and not raw_value.strip()):
            value = fallback
            quality["missing_features"].append(feat)
            quality["imputed_features"].append(feat)
        else:
            value = str(raw_value).strip()

        if feat == "Weather_Condition" and value not in levels:
            mapped = "Other" if "Other" in levels else fallback
            quality["ood_features"].append(
                {"feature": feat, "reason": "mapped_to_other", "value": value}
            )
            value = mapped
        elif levels and value not in levels:
            quality["ood_features"].append(
                {"feature": feat, "reason": "unknown_category", "value": value}
            )
            value = fallback

        categorical_values[feat] = value

    boolean_values = {}
    for feat in DANGER_BOOLEAN_FEATURES:
        raw_value = row.get(feat)
        if raw_value is None or (isinstance(raw_value, str) and not raw_value.strip()):
            quality["missing_features"].append(feat)
            quality["imputed_features"].append(feat)
        boolean_values[feat] = int(_to_bool_int(raw_value))

    prepared = {}
    prepared.update(numeric_values)
    prepared.update(categorical_values)
    prepared.update(boolean_values)
    frame = pd.DataFrame([prepared], columns=DANGER_FEATURE_ORDER)

    for feat in DANGER_NUMERIC_FEATURES:
        frame[feat] = pd.to_numeric(frame[feat], errors="coerce").astype(float)

    for feat in DANGER_BOOLEAN_FEATURES:
        frame[feat] = pd.to_numeric(frame[feat], errors="coerce").fillna(0).astype(np.int8)

    for feat in DANGER_CATEGORICAL_FEATURES:
        levels = DANGER_CATEGORICAL_LEVELS.get(feat)
        if levels:
            frame[feat] = pd.Categorical(frame[feat], categories=levels)
        else:
            frame[feat] = frame[feat].astype("category")

    for key in ["missing_features", "imputed_features", "clipped_features"]:
        quality[key] = _dedupe_preserve_order(quality[key])

    return frame, quality


def _positive_prob_from_model(model_obj, frame):
    proba = np.asarray(model_obj.predict_proba(frame))
    if proba.ndim == 1:
        return np.clip(proba, 0.0, 1.0)

    if proba.ndim != 2 or proba.shape[1] == 0:
        raise ValueError(f"Unexpected predict_proba shape: {proba.shape}")

    positive_idx = proba.shape[1] - 1
    classes = getattr(model_obj, "classes_", None)
    if classes is not None:
        class_list = list(np.asarray(classes))
        if 1 in class_list:
            positive_idx = class_list.index(1)
        elif True in class_list:
            positive_idx = class_list.index(True)

    return np.clip(proba[:, positive_idx], 0.0, 1.0)


def _predict_danger_percent(frame):
    positive_prob = _positive_prob_from_model(DANGER_MODEL, frame)[0]
    return float(np.clip(positive_prob * 100.0, 0.0, 100.0))


def _build_baseline_input(scored_frame):
    row = scored_frame.iloc[0].to_dict()
    hour = int(np.clip(round(float(row["hour"])), 0, 23))
    dow = int(np.clip(round(float(row["dow"])), 0, 6))
    month = int(np.clip(round(float(row["month"])), 1, 12))

    baseline_key = f"{hour}_{dow}"
    baseline_snapshot = DANGER_BASELINE_BY_HD.get(baseline_key)
    if baseline_snapshot is None:
        return None, baseline_key

    baseline_row = {}
    for feat in DANGER_NUMERIC_FEATURES:
        if feat == "hour":
            baseline_row[feat] = hour
        elif feat == "dow":
            baseline_row[feat] = dow
        elif feat == "month":
            baseline_row[feat] = month
        else:
            baseline_row[feat] = baseline_snapshot.get(feat, DANGER_NUMERIC_MEDIANS.get(feat, 0.0))

    for feat in DANGER_CATEGORICAL_FEATURES:
        levels = DANGER_CATEGORICAL_LEVELS.get(feat, [])
        fallback = "Unknown" if "Unknown" in levels else (levels[0] if levels else "Unknown")
        baseline_row[feat] = baseline_snapshot.get(feat, fallback)

    for feat in DANGER_BOOLEAN_FEATURES:
        baseline_row[feat] = 0

    return baseline_row, baseline_key


def _compute_baseline_percent(scored_frame):
    baseline_row, baseline_key = _build_baseline_input(scored_frame)
    if baseline_row is None:
        return None, baseline_key

    baseline_frame, _ = _preprocess_danger_row(baseline_row)
    baseline_percent = _predict_danger_percent(baseline_frame)
    return baseline_percent, baseline_key


def _extract_binary_shap_vector(shap_values):
    if isinstance(shap_values, list):
        if not shap_values:
            raise ValueError("Empty SHAP values")
        candidate = shap_values[1] if len(shap_values) > 1 else shap_values[0]
        arr = np.asarray(candidate)
        if arr.ndim == 2:
            return arr[0]
        if arr.ndim == 1:
            return arr
        raise ValueError(f"Unsupported SHAP list-array shape: {arr.shape}")

    arr = np.asarray(shap_values)
    if arr.ndim == 1:
        return arr
    if arr.ndim == 2:
        return arr[0]
    if arr.ndim == 3 and arr.shape[1] == len(DANGER_FEATURE_ORDER):
        return arr[0, :, -1]
    raise ValueError(f"Unsupported SHAP shape: {arr.shape}")


def _danger_top_reasons(scored_frame, top_k=8):
    shap_values = DANGER_SHAP_EXPLAINER.shap_values(scored_frame)
    shap_vector = _extract_binary_shap_vector(shap_values)

    expected = DANGER_SHAP_EXPLAINER.expected_value
    if isinstance(expected, (list, tuple, np.ndarray)):
        expected_arr = np.asarray(expected).reshape(-1)
        base_value = float(expected_arr[-1])
    else:
        base_value = float(expected)

    row_dict = scored_frame.iloc[0].to_dict()
    order = np.argsort(np.abs(shap_vector))[::-1]
    reasons = []

    for idx in order[: max(1, int(top_k))]:
        feat = DANGER_FEATURE_ORDER[int(idx)]
        impact = float(shap_vector[int(idx)])
        raw_value = row_dict.get(feat)
        if isinstance(raw_value, (np.integer, np.floating)):
            value = float(raw_value)
        else:
            value = None if pd.isna(raw_value) else raw_value
        reasons.append(
            {
                "feature": feat,
                "impact": impact,
                "direction": "increases_risk" if impact > 0 else "decreases_risk",
                "value": value,
            }
        )

    return {"base_value": base_value, "top_reasons": reasons}


def _score_danger_row(raw_row, include_quality_details=True):
    scored_frame, quality = _preprocess_danger_row(raw_row)

    danger_percent = _predict_danger_percent(scored_frame)
    danger_level = _danger_level_from_thresholds(danger_percent)

    baseline_percent, baseline_key = _compute_baseline_percent(scored_frame)
    delta_percent = None
    if baseline_percent is not None:
        delta_percent = danger_percent - baseline_percent

    quality_payload = _build_quality_payload(
        quality, include_details=include_quality_details
    )

    payload = {
        "danger_percent": round(danger_percent, 2),
        "danger_level": danger_level,
        "baseline_percent": None if baseline_percent is None else round(baseline_percent, 2),
        "delta_percent": None if delta_percent is None else round(delta_percent, 2),
        "confidence": quality_payload["confidence"],
        "quality": quality_payload["quality"],
        "quality_signals": {
            "missing_count": quality_payload["missing_count"],
            "ood_count": quality_payload["ood_count"],
        },
        "thresholds": {
            "q50": float(DANGER_THRESHOLDS.get("q50", 25.0)),
            "q75": float(DANGER_THRESHOLDS.get("q75", 50.0)),
            "q90": float(DANGER_THRESHOLDS.get("q90", 75.0)),
        },
        "baseline_key": baseline_key,
    }

    if include_quality_details:
        payload["quality_signals"]["missing_features"] = quality_payload["missing_features"]
        payload["quality_signals"]["ood_features"] = quality_payload["ood_features"]
        payload["quality_signals"]["imputed_features"] = quality_payload["imputed_features"]
        payload["quality_signals"]["clipped_features"] = quality_payload["clipped_features"]
        payload["quality_signals"]["invalid_start_time"] = quality_payload["invalid_start_time"]

    return payload, scored_frame


# -----------------------------
# Sentinel helpers
# -----------------------------
_WIND_CARDINAL_TO_DEG = {
    "N": 0.0,
    "NNE": 22.5,
    "NE": 45.0,
    "ENE": 67.5,
    "E": 90.0,
    "ESE": 112.5,
    "SE": 135.0,
    "SSE": 157.5,
    "S": 180.0,
    "SSW": 202.5,
    "SW": 225.0,
    "WSW": 247.5,
    "W": 270.0,
    "WNW": 292.5,
    "NW": 315.0,
    "NNW": 337.5,
}

_SENTINEL_WEATHER_RANGES = {
    "temperature_2m": (-10.0, 55.0),
    "relative_humidity_2m": (0.0, 100.0),
    "precipitation": (0.0, 200.0),
    "pressure_msl": (850.0, 1085.0),
    "windspeed_10m": (0.0, 150.0),
    "winddirection_10m": (0.0, 360.0),
    "cloudcover": (0.0, 100.0),
}


def _pick_value(row, *keys):
    for key in keys:
        if key in row:
            value = row.get(key)
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            return value
    return None


def _parse_wind_direction_degrees(raw_value):
    deg = _safe_float(raw_value)
    if not np.isnan(deg):
        return float(deg)

    if raw_value is None:
        return np.nan
    text = str(raw_value).strip().upper()
    if not text:
        return np.nan
    return float(_WIND_CARDINAL_TO_DEG[text]) if text in _WIND_CARDINAL_TO_DEG else np.nan


def _extract_time_features_for_sentinel(row):
    parsed_ts = pd.to_datetime(row.get("Start_Time"), errors="coerce")
    if not pd.isna(parsed_ts):
        hour = int(parsed_ts.hour)
        dow = int(parsed_ts.dayofweek)
        month = int(parsed_ts.month)
    else:
        hour = 12
        dow = 2
        month = 6
    return hour, dow, month, int(dow >= 5)


def _sentinel_row_from_payload(raw_row):
    row = dict(raw_row or {})

    lat = _safe_float(_pick_value(row, "lat", "Start_Lat"))
    lng = _safe_float(_pick_value(row, "lng", "Start_Lng"))

    highway_raw = _pick_value(row, "highway")
    highway = "Unknown" if highway_raw is None or not str(highway_raw).strip() else str(highway_raw).strip()

    length_m = _safe_float(_pick_value(row, "length_m"))
    if np.isnan(length_m):
        distance_mi = _safe_float(_pick_value(row, "Distance(mi)"))
        if not np.isnan(distance_mi):
            length_m = distance_mi * 1609.34
    if np.isnan(length_m):
        length_m = 0.0

    hour, dayofweek, month, is_weekend = _extract_time_features_for_sentinel(row)

    temperature_2m = _safe_float(_pick_value(row, "temperature_2m"))
    if np.isnan(temperature_2m):
        f_val = _safe_float(_pick_value(row, "Temperature(F)"))
        if not np.isnan(f_val):
            temperature_2m = (f_val - 32.0) * (5.0 / 9.0)

    relative_humidity_2m = _safe_float(_pick_value(row, "relative_humidity_2m", "Humidity(%)"))

    precipitation = _safe_float(_pick_value(row, "precipitation"))
    if np.isnan(precipitation):
        precip_in = _safe_float(_pick_value(row, "Precipitation(in)"))
        if not np.isnan(precip_in):
            precipitation = precip_in * 25.4

    pressure_msl = _safe_float(_pick_value(row, "pressure_msl"))
    if np.isnan(pressure_msl):
        pressure_in = _safe_float(_pick_value(row, "Pressure(in)"))
        if not np.isnan(pressure_in):
            pressure_msl = pressure_in * 33.8639

    windspeed_10m = _safe_float(_pick_value(row, "windspeed_10m"))
    if np.isnan(windspeed_10m):
        wind_mph = _safe_float(_pick_value(row, "Wind_Speed(mph)"))
        if not np.isnan(wind_mph):
            windspeed_10m = wind_mph * 1.60934

    winddirection_10m = _safe_float(_pick_value(row, "winddirection_10m"))
    if np.isnan(winddirection_10m):
        winddirection_10m = _parse_wind_direction_degrees(_pick_value(row, "Wind_Direction"))

    cloudcover = _safe_float(_pick_value(row, "cloudcover"))

    weather_values = {
        "temperature_2m": temperature_2m,
        "relative_humidity_2m": relative_humidity_2m,
        "precipitation": precipitation,
        "pressure_msl": pressure_msl,
        "windspeed_10m": windspeed_10m,
        "winddirection_10m": winddirection_10m,
        "cloudcover": cloudcover,
    }

    missing_flags = {}
    for feat in SENTINEL_WEATHER_COLS:
        value = weather_values.get(feat, np.nan)
        missing_flags[f"miss_{feat}"] = int(np.isnan(_safe_float(value)))
    miss_weather_any = int(any(v == 1 for v in missing_flags.values()))

    if np.isnan(winddirection_10m):
        wind_dir_sin = 0.0
        wind_dir_cos = 0.0
    else:
        radians = np.deg2rad(winddirection_10m)
        wind_dir_sin = float(np.sin(radians))
        wind_dir_cos = float(np.cos(radians))

    sentinel_row = {
        "lat": float(lat) if not np.isnan(lat) else np.nan,
        "lng": float(lng) if not np.isnan(lng) else np.nan,
        "highway": highway,
        "log_length_m": float(np.log1p(max(float(length_m), 0.0))),
        "hour": int(hour),
        "dayofweek": int(dayofweek),
        "month": int(month),
        "is_weekend": int(is_weekend),
        "temperature_2m": float(temperature_2m) if not np.isnan(temperature_2m) else np.nan,
        "relative_humidity_2m": float(relative_humidity_2m)
        if not np.isnan(relative_humidity_2m)
        else np.nan,
        "precipitation": float(precipitation) if not np.isnan(precipitation) else np.nan,
        "pressure_msl": float(pressure_msl) if not np.isnan(pressure_msl) else np.nan,
        "windspeed_10m": float(windspeed_10m) if not np.isnan(windspeed_10m) else np.nan,
        "winddirection_10m": float(winddirection_10m) if not np.isnan(winddirection_10m) else np.nan,
        "cloudcover": float(cloudcover) if not np.isnan(cloudcover) else np.nan,
        "wind_dir_sin": wind_dir_sin,
        "wind_dir_cos": wind_dir_cos,
        "miss_weather_any": miss_weather_any,
    }
    sentinel_row.update(missing_flags)

    return sentinel_row


def _sentinel_hard_reasons(sentinel_row):
    reasons = []
    lat = _safe_float(sentinel_row.get("lat"))
    lng = _safe_float(sentinel_row.get("lng"))

    outside_dz = (
        np.isnan(lat)
        or np.isnan(lng)
        or not (18.5 <= float(lat) <= 37.5 and -9.5 <= float(lng) <= 12.5)
    )
    if outside_dz:
        reasons.append("outside_dz")

    missing_weather = any(
        np.isnan(_safe_float(sentinel_row.get(col)))
        for col in SENTINEL_WEATHER_REQUIRED_COLS
    )
    if missing_weather:
        reasons.append("missing_weather")

    for field, (low, high) in _SENTINEL_WEATHER_RANGES.items():
        value = _safe_float(sentinel_row.get(field))
        if not np.isnan(value) and (value < low or value > high):
            reasons.append(f"bad_{field}")

    return reasons


def _sentinel_ood_percent(norm):
    sorted_vals = SENTINEL_NORM_SORTED
    rank = bisect_right(sorted_vals.tolist(), float(norm))
    cdf = rank / float(sorted_vals.size)
    return float(np.clip(100.0 * (1.0 - cdf), 0.0, 100.0))


def _sentinel_banner_from_reasons(reasons):
    if "outside_dz" in reasons:
        return {
            "title": "Low confidence",
            "detail": "Location appears outside Algeria (or GPS is inaccurate).",
        }
    if "missing_weather" in reasons:
        return {
            "title": "Low confidence",
            "detail": "Weather data is unavailable right now, so risk estimates may be unreliable.",
        }

    bad_reasons = [r for r in reasons if r.startswith("bad_")]
    if bad_reasons:
        bad_field = bad_reasons[0].replace("bad_", "")
        return {
            "title": "Low confidence",
            "detail": f"Weather data looks corrupted ({bad_field} out of expected range).",
        }
    if "model_ood_high" in reasons:
        return {
            "title": "Unusual conditions",
            "detail": "Conditions are rare compared to typical Algeria patterns. Treat the estimate with caution.",
        }
    if "model_ood_medium" in reasons:
        return {
            "title": "Somewhat unusual conditions",
            "detail": "Conditions are less common than usual. The estimate may be less reliable.",
        }
    return None


def _score_sentinel(raw_row):
    if not SENTINEL_ENABLED:
        raise RuntimeError(SENTINEL_LOAD_ERROR or "Sentinel is not available")

    sentinel_row = _sentinel_row_from_payload(raw_row)
    hard_reasons = _sentinel_hard_reasons(sentinel_row)

    model_row = {}
    for col in SENTINEL_FEATURE_COLUMNS:
        model_row[col] = sentinel_row.get(col, np.nan)
    model_frame = pd.DataFrame([model_row], columns=SENTINEL_FEATURE_COLUMNS)

    norm = float(np.asarray(SENTINEL_PIPELINE.decision_function(model_frame)).reshape(-1)[0])
    ood_percent = _sentinel_ood_percent(norm)

    reasons = list(hard_reasons)
    if ood_percent >= 99.0:
        reasons.append("model_ood_high")
    elif ood_percent >= 95.0:
        reasons.append("model_ood_medium")
    elif norm <= SENTINEL_THRESHOLD_NORM:
        reasons.append("model_ood_low")

    is_ood = bool((norm <= SENTINEL_THRESHOLD_NORM) or len(hard_reasons) > 0)
    has_bad = any(r.startswith("bad_") for r in reasons)

    if (
        "outside_dz" in reasons
        or "missing_weather" in reasons
        or has_bad
        or "model_ood_high" in reasons
    ):
        confidence = "low"
    elif "model_ood_medium" in reasons:
        confidence = "medium"
    else:
        confidence = "high"

    banner = _sentinel_banner_from_reasons(reasons) if is_ood else None
    return {
        "ood_percent": round(float(ood_percent), 2),
        "is_ood": is_ood,
        "confidence": confidence,
        "reasons": reasons,
        "banner": banner,
    }


EXAMPLE_QUIZ_EXPLAINER_PAYLOAD = {
    "overall_risk_label": "moderate",
    "overall_risk_score": 48.75,
    "score_scale": "0-100 percent. This score is computed deterministically by the Python quiz model.",
    "top_risk_factors": [
        {
            "name": "lapses",
            "description": FEATURE_EXPLANATIONS["lapses"],
            "impact": 0.0842,
            "advice": FEATURE_ACTIONS["lapses"],
        },
        {
            "name": "high_velocity",
            "description": FEATURE_EXPLANATIONS["high_velocity"],
            "impact": 0.0521,
            "advice": FEATURE_ACTIONS["high_velocity"],
        },
    ],
    "top_protective_factors": [
        {
            "name": "careful",
            "description": FEATURE_EXPLANATIONS["careful"],
            "impact": -0.0415,
            "advice": FEATURE_ACTIONS["careful"],
        }
    ],
    "questionnaire_sources": [
        "SIARA driver quiz questionnaire",
        "Deterministic Python model output",
        "SHAP feature contribution summary",
    ],
    "factor_scores": {
        "dissociative": 2,
        "anxious": 3,
        "risky": 2,
        "angry": 2,
        "high_velocity": 4,
        "distress_reduction": 2,
        "patient": 3,
        "careful": 5,
        "errors": 2,
        "violations": 1,
        "lapses": 4,
    },
    "advice_focus": [
        FEATURE_ACTIONS["lapses"],
        FEATURE_ACTIONS["high_velocity"],
    ],
}


class QuizInputError(ValueError):
    def __init__(self, payload, status_code=400):
        super().__init__(payload.get("error", "Invalid quiz payload"))
        self.payload = payload
        self.status_code = status_code


def build_driver_quiz_prediction(data):
    missing = [f for f in FEATURES if f not in data]
    if missing:
        raise QuizInputError({"error": "Missing required features", "missing": missing}, 400)

    try:
        x = pd.DataFrame([[float(data[f]) for f in FEATURES]], columns=FEATURES)
    except (TypeError, ValueError):
        raise QuizInputError({"error": "All feature values must be numeric"}, 400)

    probs = model.predict_proba(x)[0]
    pred_class = int(np.argmax(probs))
    risk_label = ordered_labels[pred_class]

    weights = np.arange(len(ordered_labels), dtype=float)
    severity = float((probs * weights).sum())
    risk_percent = float(np.clip(severity / weights.max() * 100.0, 0.0, 100.0))

    shap_values = explainer.shap_values(x)
    if isinstance(shap_values, list):
        shap_for_pred = shap_values[pred_class][0]
    else:
        sv = np.array(shap_values)
        if sv.ndim == 3 and sv.shape[1] == len(FEATURES) and sv.shape[2] == len(ordered_labels):
            shap_for_pred = sv[0, :, pred_class]
        elif sv.ndim == 2 and sv.shape[1] == len(FEATURES):
            shap_for_pred = sv[0]
        else:
            raise QuizInputError(
                {"error": "Unexpected SHAP output shape", "shape": list(sv.shape)},
                500,
            )

    base_value = explainer.expected_value
    if isinstance(base_value, (list, np.ndarray)) and len(np.atleast_1d(base_value)) == len(
        ordered_labels
    ):
        base_value_pred = float(np.atleast_1d(base_value)[pred_class])
    else:
        base_value_pred = float(np.array(base_value).reshape(-1)[0])

    shap_per_feature = {FEATURES[i]: float(shap_for_pred[i]) for i in range(len(FEATURES))}
    factor_scores = {feature: float(x.iloc[0][feature]) for feature in FEATURES}
    quiz_result_data = build_quiz_result_data(
        risk_label=risk_label,
        risk_percent=risk_percent,
        shap_per_feature=shap_per_feature,
        factor_scores=factor_scores,
    )
    advice_text = generate_advice_paragraph(
        risk_label=risk_label, risk_percent=risk_percent, shap_per_feature=shap_per_feature
    )

    return {
        "risk_label": risk_label,
        "risk_percent": round(risk_percent, 2),
        "risk_score": round(risk_percent, 2),
        "class_probabilities": {
            ordered_labels[i]: float(round(probs[i], 6)) for i in range(len(ordered_labels))
        },
        "xai": {
            "predicted_class_index": pred_class,
            "base_value": base_value_pred,
            "shap_per_feature": shap_per_feature,
        },
        "advice_text": advice_text,
        "quiz_result_data": quiz_result_data,
    }


def sse_event(event_name, payload):
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


# -----------------------------
# Routes
# -----------------------------
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True) or {}

    try:
        response_payload = build_driver_quiz_prediction(data)
    except QuizInputError as exc:
        return jsonify(exc.payload), exc.status_code

    quiz_result_data = response_payload["quiz_result_data"]
    try:
        explanation_text = explain_quiz_result(quiz_result_data)
    except Exception as exc:
        print(f"[quiz-explainer] Unexpected fallback: {exc}")
        explanation_text = build_template_explanation(quiz_result_data)

    return jsonify(
        {
            **response_payload,
            "explanation_text": explanation_text,
            "structured_explanation": structure_quiz_explanation(explanation_text),
        }
    )


@app.route("/predict/stream", methods=["POST"])
def predict_stream():
    request_started_at = time.monotonic()
    print("[quiz-stream] request started")
    data = request.get_json(silent=True) or {}

    try:
        response_payload = build_driver_quiz_prediction(data)
    except QuizInputError as exc:
        return jsonify(exc.payload), exc.status_code

    quiz_result_data = response_payload["quiz_result_data"]

    @stream_with_context
    def generate():
        explanation_parts = []
        yield sse_event(
            "result",
            {
                **response_payload,
                "explanation_text": "",
            },
        )
        for event in stream_quiz_explanation(quiz_result_data):
            event_name = event.get("event", "message")
            payload = {k: v for k, v in event.items() if k != "event"}
            if event_name == "chunk":
                explanation_parts.append(str(payload.get("content") or ""))
            if event_name == "done":
                explanation_text = payload.get("explanation_text") or "".join(explanation_parts).strip()
                final_payload = {
                    **response_payload,
                    "explanation_text": explanation_text,
                    "structured_explanation": payload.get("structured_explanation")
                    or structure_quiz_explanation(explanation_text),
                }
                payload["result"] = final_payload
                payload["elapsed_ms"] = int((time.monotonic() - request_started_at) * 1000)
                print(
                    "[quiz-stream] stream completed "
                    f"in {payload['elapsed_ms']} ms"
                )
            yield sse_event(event_name, payload)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/quiz/explanation/test", methods=["GET", "POST"])
def quiz_explanation_test():
    payload = request.get_json(silent=True) or EXAMPLE_QUIZ_EXPLAINER_PAYLOAD
    try:
        explanation_text = explain_quiz_result(payload)
    except Exception as exc:
        print(f"[quiz-explainer] Test route fallback: {exc}")
        explanation_text = build_template_explanation(payload)

    return jsonify(
        {
            "example_payload": EXAMPLE_QUIZ_EXPLAINER_PAYLOAD,
            "input_used": payload,
            "example_response": {
                "risk_label": payload.get("overall_risk_label"),
                "risk_score": payload.get("overall_risk_score"),
                "explanation_text": explanation_text,
                "structured_explanation": structure_quiz_explanation(explanation_text),
            },
        }
    )


@app.route("/quiz/explanation/stream", methods=["POST"])
def quiz_explanation_stream():
    payload = request.get_json(silent=True) or {}

    @stream_with_context
    def generate():
        for event in stream_quiz_explanation(payload):
            event_name = event.get("event", "message")
            yield sse_event(event_name, {k: v for k, v in event.items() if k != "event"})

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/risk/current", methods=["POST"])
def risk_current():
    payload = request.get_json(silent=True) or {}
    _log_incoming("/risk/current", payload)
    row = _extract_row_payload(payload)
    if row is None:
        return jsonify({"error": "Request body must be a JSON object (or {\"row\": {...}})."}), 400

    try:
        result, _ = _score_danger_row(row, include_quality_details=True)
        if SENTINEL_ENABLED:
            try:
                result["sentinel"] = _score_sentinel(row)
            except Exception as exc:
                result["sentinel"] = {
                    "enabled": True,
                    "error": "Sentinel scoring failed",
                    "details": str(exc),
                }
        else:
            result["sentinel"] = {
                "enabled": False,
                "error": "Sentinel disabled",
                "details": SENTINEL_LOAD_ERROR,
            }
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": "Risk scoring failed", "details": str(exc)}), 500


@app.route("/risk/overlay", methods=["POST"])
def risk_overlay():
    payload = request.get_json(silent=True)
    _log_incoming("/risk/overlay", payload)
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("rows")
    else:
        rows = None

    if not isinstance(rows, list) or len(rows) == 0:
        return jsonify({"error": "Request body must include a non-empty rows array."}), 400

    invalid = [idx for idx, row in enumerate(rows) if not isinstance(row, dict)]
    if invalid:
        return jsonify({"error": "Every row must be a JSON object.", "invalid_indices": invalid}), 400

    results = []
    for idx, row in enumerate(rows):
        result, _ = _score_danger_row(row, include_quality_details=False)
        out = {"index": idx}
        if "segment_id" in row:
            out["segment_id"] = row["segment_id"]
        out.update(result)
        results.append(out)

    return jsonify({"count": len(results), "results": results})


@app.route("/risk/explain", methods=["POST"])
def risk_explain():
    payload = request.get_json(silent=True) or {}
    _log_incoming("/risk/explain", payload)
    row = _extract_row_payload(payload)
    if row is None:
        return jsonify({"error": "Request body must be a JSON object (or {\"row\": {...}})."}), 400

    top_k = 8
    if isinstance(payload, dict) and "top_k" in payload:
        top_k_val = _safe_float(payload.get("top_k"))
        if not np.isnan(top_k_val):
            top_k = int(np.clip(round(top_k_val), 1, len(DANGER_FEATURE_ORDER)))

    try:
        result, scored_frame = _score_danger_row(row, include_quality_details=True)
        result["xai"] = _danger_top_reasons(scored_frame, top_k=top_k)
        if SENTINEL_ENABLED:
            try:
                result["sentinel"] = _score_sentinel(row)
            except Exception as exc:
                result["sentinel"] = {
                    "enabled": True,
                    "error": "Sentinel scoring failed",
                    "details": str(exc),
                }
        else:
            result["sentinel"] = {
                "enabled": False,
                "error": "Sentinel disabled",
                "details": SENTINEL_LOAD_ERROR,
            }
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": "Risk explain failed", "details": str(exc)}), 500


@app.route("/risk/confidence", methods=["POST"])
def risk_confidence():
    payload = request.get_json(silent=True) or {}
    _log_incoming("/risk/confidence", payload)
    row = _extract_row_payload(payload)
    if row is None:
        return jsonify({"error": "Request body must be a JSON object (or {\"row\": {...}})."}), 400

    if not SENTINEL_ENABLED:
        return (
            jsonify(
                {
                    "enabled": False,
                    "error": "Sentinel confidence gating is disabled",
                    "details": SENTINEL_LOAD_ERROR or f"Artifact unavailable at {SENTINEL_PATH}",
                }
            ),
            503,
        )

    try:
        sentinel_payload = _score_sentinel(row)
        return jsonify({"enabled": True, "sentinel": sentinel_payload})
    except Exception as exc:
        return jsonify({"enabled": True, "error": "Sentinel scoring failed", "details": str(exc)}), 500


@app.route("/report/validate", methods=["POST"])
def report_validate():
    payload = request.get_json(silent=True) or {}
    _log_incoming("/report/validate", payload)

    try:
        result = siara_validate_report(
            title=payload.get("title"),
            description=payload.get("description"),
            incident_type=payload.get("incident_type") or payload.get("incidentType"),
            lat=payload.get("lat"),
            lon=payload.get("lon") or payload.get("lng"),
            near_road=payload.get("near_road"),
            distance_to_road_m=payload.get("distance_to_road_m"),
            has_image=bool(payload.get("has_image", False)),
            image_related=payload.get("image_related"),
        )
        return jsonify(result)
    except FileNotFoundError as exc:
        return (
            jsonify(
                {
                    "error": "Report validator model is not trained",
                    "details": str(exc),
                }
            ),
            503,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": "Report validation failed", "details": str(exc)}), 500


@app.route("/report-spam/classify", methods=["POST"])
def report_spam_classify():
    payload = request.get_json(silent=True) or {}
    _log_incoming("/report-spam/classify", payload)

    text = payload.get("text")
    image_url = payload.get("image_url")
    image_path = payload.get("image_path")

    if text is None:
        return jsonify({"error": "text is required"}), 400
    if not image_url and not image_path:
        return jsonify({"error": "image_url or image_path is required"}), 400

    try:
        result = classify_report_payload(
            text=text,
            image_url=image_url,
            image_path=image_path,
            model_path=payload.get("model_path") or REPORT_SPAM_MODEL_PATH,
            model_name=payload.get("model_name"),
            model_version=payload.get("model_version"),
            threshold_percent=payload.get("threshold_percent"),
        )
        return jsonify(result)
    except FileNotFoundError as exc:
        return jsonify({"error": "Spam model file is unavailable", "details": str(exc)}), 503
    except requests.RequestException as exc:
        return jsonify({"error": "Failed to fetch report image", "details": str(exc)}), 502
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": "Spam classification failed", "details": str(exc)}), 500


# Quick test snippet:
# curl -X POST http://localhost:8000/risk/confidence \
#   -H "Content-Type: application/json" \
#   -d "{\"row\":{\"Start_Lat\":36.75,\"Start_Lng\":3.06,\"Start_Time\":\"2026-03-04T10:15:00\",\"Distance(mi)\":0.5,\"Temperature(F)\":77,\"Humidity(%)\":45,\"Pressure(in)\":30.0,\"Wind_Speed(mph)\":8,\"Wind_Direction\":\"NW\",\"Precipitation(in)\":0.0}}"


@app.route("/risk/occurrence/predict", methods=["POST"])
def risk_occurrence_predict():
    if not OCCURRENCE_ENABLED:
        return (
            jsonify(
                {
                    "error": "Occurrence model is not loaded",
                    "message": OCCURRENCE_LOAD_ERROR
                    or "Occurrence model artifacts missing or failed to load.",
                    "type": "ModelNotLoaded",
                    "model_version": OCCURRENCE_MODEL_VERSION,
                }
            ),
            503,
        )

    payload = request.get_json(silent=True) or {}
    _log_incoming("/risk/occurrence/predict", payload)

    # Accept three shapes:
    #   1) { "features": {...} }                     — single row, top-level
    #   2) { "rows": [{ "features": {...} }, ...] }  — array of row wrappers
    #   3) { "rows": [{ raw feature columns }, ...] } — array of bare dicts
    single_row_mode = False
    if isinstance(payload.get("features"), dict):
        rows = [payload]
        single_row_mode = True
    else:
        rows = payload.get("rows")
    if not isinstance(rows, list) or len(rows) == 0:
        return (
            jsonify(
                {
                    "error": "rows[] is required and must be a non-empty list (or send 'features' for a single row)",
                    "type": "InvalidRequest",
                }
            ),
            400,
        )

    try:
        frame, missing_by_row = _occurrence_build_frame(rows)
    except ValueError as exc:
        return (
            jsonify({"error": str(exc), "type": "InvalidRequest"}),
            400,
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"[occurrence] frame_build_failed: {type(exc).__name__}: {exc!r}",
            flush=True,
        )
        traceback.print_exc()
        return (
            jsonify(
                {
                    "error": "Occurrence feature normalization failed",
                    "message": str(exc),
                    "type": type(exc).__name__,
                    "model_version": OCCURRENCE_MODEL_VERSION,
                }
            ),
            400,
        )

    try:
        raw_scores, calibrated = _occurrence_predict_calibrated(frame)
    except Exception as exc:  # noqa: BLE001
        # Full traceback to stderr so the operator can see the actual sklearn
        # failure (e.g. unknown category in a OneHotEncoder column, dtype
        # mismatch). The HTTP body includes the exception type + repr so the
        # Node side can log a useful one-liner without parsing stderr.
        print(
            f"[occurrence] predict_failed: {type(exc).__name__}: {exc!r}",
            flush=True,
        )
        traceback.print_exc()
        return (
            jsonify(
                {
                    "error": "Occurrence prediction failed",
                    "message": str(exc),
                    "type": type(exc).__name__,
                    "model_version": OCCURRENCE_MODEL_VERSION,
                    "feature_list": OCCURRENCE_FEATURE_LIST,
                    "missing_required_features": missing_by_row,
                }
            ),
            500,
        )

    fallback_factors = _occurrence_global_top_factors()

    predictions = []
    for raw_score, prob, missing in zip(raw_scores, calibrated, missing_by_row):
        coerced_raw = _occurrence_coerce_value(raw_score)
        coerced_prob = _occurrence_coerce_value(prob)
        predictions.append(
            {
                "risk_score": coerced_raw,
                "calibrated_probability": coerced_prob,
                "risk_level": _occurrence_risk_level(coerced_prob),
                "confidence_score": _occurrence_confidence(coerced_prob),
                "model_version": OCCURRENCE_MODEL_VERSION,
                "top_factors": fallback_factors,
                "explanation_source": "global_importance_fallback",
                "missing_required_features": missing,
            }
        )

    response_body = {
        "model_version": OCCURRENCE_MODEL_VERSION,
        "selected_model": OCCURRENCE_SELECTED_MODEL,
        "calibration_method": OCCURRENCE_CALIBRATION_METHOD,
        "decision_threshold": OCCURRENCE_DECISION_THRESHOLD,
        "risk_level_thresholds": OCCURRENCE_RISK_THRESHOLDS,
        "feature_list": OCCURRENCE_FEATURE_LIST,
        "predictions": predictions,
    }
    # Convenience: single-row callers get the first prediction's fields hoisted
    # to the top of the response so they don't have to index predictions[0].
    if single_row_mode or len(predictions) == 1:
        first = predictions[0]
        response_body.update(
            {
                "risk_score": first["risk_score"],
                "calibrated_probability": first["calibrated_probability"],
                "risk_level": first["risk_level"],
                "confidence_score": first["confidence_score"],
                "top_factors": first["top_factors"],
                "missing_required_features": first["missing_required_features"],
            }
        )

    return jsonify(response_body)


@app.route("/risk/occurrence/status", methods=["GET"])
def risk_occurrence_status():
    """Lightweight liveness check for the occurrence model.

    Used by Node and by the smoke script to verify the Pipeline loaded and to
    confirm the artifact directory + feature count in one round trip.
    """
    return jsonify(
        {
            "model_loaded": OCCURRENCE_ENABLED,
            "artifact_dir": OCCURRENCE_DIR,
            "feature_count": len(OCCURRENCE_FEATURE_LIST),
            "model_version": OCCURRENCE_MODEL_VERSION,
            "selected_model": OCCURRENCE_SELECTED_MODEL,
            "calibration_method": OCCURRENCE_CALIBRATION_METHOD,
            "load_error": OCCURRENCE_LOAD_ERROR,
        }
    )


@app.route("/risk/occurrence/metadata", methods=["GET"])
def risk_occurrence_metadata():
    """Returns the metadata an Admin UI / Node proxy needs without joblib payload."""
    return jsonify(
        {
            "enabled": OCCURRENCE_ENABLED,
            "load_error": OCCURRENCE_LOAD_ERROR,
            "model_version": OCCURRENCE_MODEL_VERSION,
            "selected_model": OCCURRENCE_SELECTED_MODEL,
            "calibration_method": OCCURRENCE_CALIBRATION_METHOD,
            "decision_threshold": OCCURRENCE_DECISION_THRESHOLD,
            "risk_level_thresholds": OCCURRENCE_RISK_THRESHOLDS,
            "feature_list": OCCURRENCE_FEATURE_LIST,
            "metrics": OCCURRENCE_METRICS,
            "training_manifest": OCCURRENCE_TRAINING_MANIFEST,
            "shap_top_features": OCCURRENCE_SHAP_TOP_FEATURES,
            "feature_importance": OCCURRENCE_FEATURE_IMPORTANCE,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)

