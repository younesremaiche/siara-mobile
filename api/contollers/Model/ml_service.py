from flask import Flask, jsonify, request
import json
import joblib
import numpy as np
import pandas as pd
import shap
import os
from bisect import bisect_right

app = Flask(__name__)

# Base directory (api folder)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

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


# -----------------------------
# Routes
# -----------------------------
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True) or {}

    missing = [f for f in FEATURES if f not in data]
    if missing:
        return jsonify({"error": "Missing required features", "missing": missing}), 400

    try:
        x = pd.DataFrame([[float(data[f]) for f in FEATURES]], columns=FEATURES)
    except (TypeError, ValueError):
        return jsonify({"error": "All feature values must be numeric"}), 400

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
            return jsonify({"error": "Unexpected SHAP output shape", "shape": list(sv.shape)}), 500

    base_value = explainer.expected_value
    if isinstance(base_value, (list, np.ndarray)) and len(np.atleast_1d(base_value)) == len(
        ordered_labels
    ):
        base_value_pred = float(np.atleast_1d(base_value)[pred_class])
    else:
        base_value_pred = float(np.array(base_value).reshape(-1)[0])

    shap_per_feature = {FEATURES[i]: float(shap_for_pred[i]) for i in range(len(FEATURES))}
    advice_text = generate_advice_paragraph(
        risk_label=risk_label, risk_percent=risk_percent, shap_per_feature=shap_per_feature
    )

    return jsonify(
        {
            "risk_label": risk_label,
            "risk_percent": round(risk_percent, 2),
            "class_probabilities": {
                ordered_labels[i]: float(round(probs[i], 6)) for i in range(len(ordered_labels))
            },
            "xai": {
                "predicted_class_index": pred_class,
                "base_value": base_value_pred,
                "shap_per_feature": shap_per_feature,
            },
            "advice_text": advice_text,
        }
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


# Quick test snippet:
# curl -X POST http://localhost:8000/risk/confidence \
#   -H "Content-Type: application/json" \
#   -d "{\"row\":{\"Start_Lat\":36.75,\"Start_Lng\":3.06,\"Start_Time\":\"2026-03-04T10:15:00\",\"Distance(mi)\":0.5,\"Temperature(F)\":77,\"Humidity(%)\":45,\"Pressure(in)\":30.0,\"Wind_Speed(mph)\":8,\"Wind_Direction\":\"NW\",\"Precipitation(in)\":0.0}}"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)

