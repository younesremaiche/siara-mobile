"""SIARA report-validation pipeline.

This module replaces the legacy `report_spam_model.py` (Fakeddit/CLIP) with a
SIARA-specific validator. It does NOT try to make a single AI model decide
everything. Instead it combines:

    1. A scikit-learn text classifier trained on title/description/incident_type
    2. Deterministic location validation passed in by the caller
       (lat/lon ranges + PostGIS near-road check)
    3. An optional image hint passed in by the caller
    4. A rule-based fusion stage

The runtime entry point is :func:`validate_report`. Training lives in
``train_report_validator.py``.

All scores returned here are decimal probabilities in ``[0, 1]``. The frontend
is responsible for converting to percentages for display.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import joblib

LABELS = ("real", "spam", "out_of_context", "invalid_location", "suspicious")

DEFAULT_NEAR_ROAD_STRICT_M = 100.0
DEFAULT_NEAR_ROAD_RELAXED_M = 250.0

DEFAULT_MODEL_NAME = "siara-report-validator"
DEFAULT_MODEL_VERSION = "1.0.0"

_BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DEFAULT_MODEL_PATH = os.path.join(_BASE_DIR, "report_validator_model.joblib")
DEFAULT_METADATA_PATH = os.path.join(_BASE_DIR, "report_validator_metadata.json")

_MODEL_CACHE: Dict[str, Any] = {}


def _resolve_model_path(path: Optional[str] = None) -> str:
    return os.path.abspath(path) if path else DEFAULT_MODEL_PATH


def _resolve_metadata_path(path: Optional[str] = None) -> str:
    return os.path.abspath(path) if path else DEFAULT_METADATA_PATH


def load_validator(
    model_path: Optional[str] = None,
    metadata_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Load the trained validator pipeline + metadata. Cached by mtime."""

    resolved_model = _resolve_model_path(model_path)
    resolved_meta = _resolve_metadata_path(metadata_path)

    if not os.path.exists(resolved_model):
        raise FileNotFoundError(
            f"Report validator model not found at {resolved_model}. "
            "Run `python train_report_validator.py` first."
        )

    mtime = os.path.getmtime(resolved_model)
    cached = _MODEL_CACHE.get(resolved_model)
    if cached and cached.get("mtime") == mtime:
        return cached["bundle"]

    pipeline = joblib.load(resolved_model)

    metadata: Dict[str, Any] = {}
    if os.path.exists(resolved_meta):
        with open(resolved_meta, "r", encoding="utf-8") as fh:
            metadata = json.load(fh)

    bundle = {
        "pipeline": pipeline,
        "metadata": metadata,
        "labels": tuple(metadata.get("labels") or LABELS),
        "model_name": metadata.get("model_name") or DEFAULT_MODEL_NAME,
        "model_version": metadata.get("model_version") or DEFAULT_MODEL_VERSION,
    }
    _MODEL_CACHE[resolved_model] = {"mtime": mtime, "bundle": bundle}
    return bundle


def build_text_input(title: Any, description: Any, incident_type: Any) -> str:
    parts = [str(value or "").strip() for value in (title, description, incident_type)]
    return " ".join(part for part in parts if part)


def _clip01(value: float) -> float:
    if value is None:
        return 0.0
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return float(value)


def _round4(value: float) -> float:
    return round(_clip01(value), 4)


def _safe_number(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _coords_valid(lat: Any, lon: Any) -> bool:
    lat_num = _safe_number(lat)
    lon_num = _safe_number(lon)
    if lat_num is None or lon_num is None:
        return False
    if not (-90.0 <= lat_num <= 90.0):
        return False
    if not (-180.0 <= lon_num <= 180.0):
        return False
    return True


def predict_text(
    bundle: Dict[str, Any],
    title: Any,
    description: Any,
    incident_type: Any,
) -> Dict[str, Any]:
    """Run only the text classifier and return per-label probabilities."""

    pipeline = bundle["pipeline"]
    labels = list(bundle.get("labels") or LABELS)
    text = build_text_input(title, description, incident_type)

    if not text:
        # Empty text is suspicious by definition; surface that to the fusion stage.
        return {
            "text": "",
            "probabilities": {label: 0.0 for label in labels},
            "top_label": "suspicious" if "suspicious" in labels else labels[0],
            "top_score": 0.0,
            "is_empty": True,
        }

    probas = pipeline.predict_proba([text])[0]
    pipeline_classes = list(getattr(pipeline, "classes_", labels))
    proba_map = {
        str(label): float(probas[idx]) for idx, label in enumerate(pipeline_classes)
    }
    # Keep ordering in metadata even if classes_ is missing some labels.
    for label in labels:
        proba_map.setdefault(label, 0.0)

    top_label = max(proba_map.items(), key=lambda item: item[1])
    return {
        "text": text,
        "probabilities": proba_map,
        "top_label": top_label[0],
        "top_score": float(top_label[1]),
        "is_empty": False,
    }


def fuse(
    *,
    text_result: Dict[str, Any],
    lat: Any,
    lon: Any,
    near_road: Optional[bool],
    distance_to_road_m: Any,
    has_image: bool = False,
    image_related: Optional[bool] = None,
    near_road_strict_m: float = DEFAULT_NEAR_ROAD_STRICT_M,
    near_road_relaxed_m: float = DEFAULT_NEAR_ROAD_RELAXED_M,
    text_high_confidence: float = 0.50,
    text_argmax_margin: float = 0.05,
) -> Dict[str, Any]:
    """Combine the text classifier output with deterministic checks.

    All inputs are decimal probabilities in ``[0, 1]``. The result is the same.
    """

    reasons: List[str] = []
    probas = dict(text_result.get("probabilities") or {})
    for label in LABELS:
        probas.setdefault(label, 0.0)
    is_empty_text = bool(text_result.get("is_empty"))

    text_real = _clip01(probas.get("real", 0.0))
    text_spam = _clip01(probas.get("spam", 0.0))
    text_ooc = _clip01(probas.get("out_of_context", 0.0))
    text_susp = _clip01(probas.get("suspicious", 0.0))
    text_invalid = _clip01(probas.get("invalid_location", 0.0))

    coords_valid = _coords_valid(lat, lon)
    distance_value = _safe_number(distance_to_road_m)
    near_road_strict = (
        bool(near_road)
        and distance_value is not None
        and distance_value <= near_road_strict_m
    )
    near_road_relaxed = (
        bool(near_road)
        or (distance_value is not None and distance_value <= near_road_relaxed_m)
    )

    final_label = "real"
    text_top_label = max(probas.items(), key=lambda item: item[1])[0]
    text_top_score = float(probas[text_top_label])

    if not coords_valid:
        final_label = "invalid_location"
        reasons.append("Invalid latitude/longitude")
    elif is_empty_text:
        final_label = "suspicious"
        reasons.append("Empty title/description")
    elif text_top_label == "out_of_context" and text_ooc - text_real >= text_argmax_margin:
        final_label = "out_of_context"
        reasons.append(f"Text classifier flagged out_of_context ({text_ooc:.2f})")
    elif text_top_label == "spam" and text_spam - text_real >= text_argmax_margin:
        final_label = "spam"
        reasons.append(f"Text classifier flagged spam ({text_spam:.2f})")
    elif text_ooc >= text_high_confidence:
        final_label = "out_of_context"
        reasons.append(f"Text classifier high out_of_context probability ({text_ooc:.2f})")
    elif text_spam >= text_high_confidence:
        final_label = "spam"
        reasons.append(f"Text classifier high spam probability ({text_spam:.2f})")
    elif text_top_label == "suspicious" and text_top_score - text_real >= text_argmax_margin:
        final_label = "suspicious"
        reasons.append(f"Text classifier flagged suspicious ({text_top_score:.2f})")
    else:
        # Text looks road-related; let the location decide whether it is real.
        if not near_road_relaxed:
            final_label = "suspicious"
            if distance_value is not None:
                reasons.append(
                    f"Location is far from any road segment ({distance_value:.0f} m)"
                )
            else:
                reasons.append("No road segment found near the report location")
        elif not near_road_strict:
            final_label = "real"
            reasons.append(
                "Location near a road but outside strict 100 m radius"
            )
        else:
            final_label = "real"
            reasons.append("Text is road-related and location is on a known road")

    # Image hint: missing image must NOT penalise the report.
    if has_image and image_related is False:
        if final_label == "real":
            final_label = "suspicious"
        text_spam = max(text_spam, 0.6)
        reasons.append("Image attached but appears unrelated to the report")
    elif has_image and image_related is True:
        reasons.append("Image attached and appears consistent with the report")

    # Build final scores in [0, 1].
    if final_label == "invalid_location":
        spam_score = 0.0
        real_score = 0.0
        confidence_score = 1.0
    elif final_label == "spam":
        spam_score = max(text_spam, 0.6)
        real_score = max(0.0, 1.0 - spam_score)
        confidence_score = max(text_spam, 0.6)
    elif final_label == "out_of_context":
        spam_score = max(text_ooc, text_spam)
        real_score = max(0.0, 1.0 - spam_score)
        confidence_score = max(text_ooc, 0.6)
    elif final_label == "suspicious":
        spam_score = max(text_spam, text_susp, 0.4)
        real_score = max(0.0, 1.0 - spam_score)
        confidence_score = max(text_susp, text_spam, 0.4)
    else:  # real
        spam_score = text_spam
        real_score = max(text_real, 1.0 - text_spam)
        confidence_score = max(text_real, 0.5)

    return {
        "label": final_label,
        "spam_score": _round4(spam_score),
        "real_score": _round4(real_score),
        "confidence_score": _round4(confidence_score),
        "reasons": reasons,
        "raw_probabilities": {key: _round4(value) for key, value in probas.items()},
        "context": {
            "coords_valid": coords_valid,
            "near_road_strict": near_road_strict,
            "near_road_relaxed": near_road_relaxed,
            "distance_to_road_m": distance_value,
            "has_image": bool(has_image),
            "image_related": image_related,
            "is_empty_text": is_empty_text,
        },
    }


def validate_report(
    *,
    title: Any,
    description: Any,
    incident_type: Any,
    lat: Any,
    lon: Any,
    near_road: Optional[bool] = None,
    distance_to_road_m: Any = None,
    has_image: bool = False,
    image_related: Optional[bool] = None,
    model_path: Optional[str] = None,
    metadata_path: Optional[str] = None,
    near_road_strict_m: float = DEFAULT_NEAR_ROAD_STRICT_M,
    near_road_relaxed_m: float = DEFAULT_NEAR_ROAD_RELAXED_M,
) -> Dict[str, Any]:
    """End-to-end report validation. Returns the SIARA-standard payload."""

    bundle = load_validator(model_path=model_path, metadata_path=metadata_path)
    text_result = predict_text(bundle, title, description, incident_type)
    fusion = fuse(
        text_result=text_result,
        lat=lat,
        lon=lon,
        near_road=near_road,
        distance_to_road_m=distance_to_road_m,
        has_image=has_image,
        image_related=image_related,
        near_road_strict_m=near_road_strict_m,
        near_road_relaxed_m=near_road_relaxed_m,
    )

    return {
        "model_name": bundle["model_name"],
        "model_version": bundle["model_version"],
        "predicted_label": fusion["label"],
        "label": fusion["label"],
        "spam_score": fusion["spam_score"],
        "real_score": fusion["real_score"],
        "confidence_score": fusion["confidence_score"],
        "reasons": fusion["reasons"],
        "raw_probabilities": fusion["raw_probabilities"],
        "context": fusion["context"],
        "inference_status": "completed",
        "predicted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


__all__ = (
    "LABELS",
    "DEFAULT_NEAR_ROAD_STRICT_M",
    "DEFAULT_NEAR_ROAD_RELAXED_M",
    "DEFAULT_MODEL_NAME",
    "DEFAULT_MODEL_VERSION",
    "DEFAULT_MODEL_PATH",
    "DEFAULT_METADATA_PATH",
    "build_text_input",
    "load_validator",
    "predict_text",
    "fuse",
    "validate_report",
)
