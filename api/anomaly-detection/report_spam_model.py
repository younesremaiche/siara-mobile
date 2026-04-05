import os
from collections import OrderedDict
from io import BytesIO

import clip
import requests
import torch
import torch.nn as nn
from PIL import Image
from clip.model import build_model

DEFAULT_MODEL_NAME = "fakeddit-clip"
DEFAULT_LABELS = ("real", "spam")
DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_THRESHOLD_PERCENT = 50.0

_MODEL_CACHE = {}


def _resolve_model_path(model_path=None):
    if model_path:
        return os.path.abspath(model_path)

    base_dir = os.path.abspath(os.path.dirname(__file__))
    return os.path.join(base_dir, "best_fakeddit_model.pt")


def _normalize_percent(value, fallback):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return float(fallback)

    if numeric <= 1.0:
        numeric *= 100.0

    return max(0.0, min(100.0, numeric))


def _build_classifier():
    return nn.Sequential(
        nn.Linear(1024, 512),
        nn.ReLU(),
        nn.Dropout(p=0.1),
        nn.Linear(512, 2),
    )


def _load_model_bundle(model_path):
    state_dict = torch.load(model_path, map_location="cpu", weights_only=False)
    if not isinstance(state_dict, (dict, OrderedDict)):
        raise TypeError("Expected a checkpoint state_dict")

    clip_state = OrderedDict(
        (key[len("clip_model."):], value.float())
        for key, value in state_dict.items()
        if key.startswith("clip_model.")
    )
    classifier_state = OrderedDict(
        (key[len("classifier."):], value.float())
        for key, value in state_dict.items()
        if key.startswith("classifier.")
    )

    if not clip_state:
        raise KeyError("Missing clip_model.* weights in checkpoint")
    if not classifier_state:
        raise KeyError("Missing classifier.* weights in checkpoint")

    clip_model = build_model(clip_state).float().eval()
    classifier = _build_classifier()
    classifier.load_state_dict(classifier_state)
    classifier.float().eval()

    return {
        "clip_model": clip_model,
        "classifier": classifier,
        "input_resolution": int(clip_model.visual.input_resolution),
    }


def load_report_spam_model(model_path=None):
    resolved_path = _resolve_model_path(model_path)
    cache_key = os.path.abspath(resolved_path)
    modified_at = os.path.getmtime(cache_key)

    cached = _MODEL_CACHE.get(cache_key)
    if cached and cached.get("modified_at") == modified_at:
        return cached["bundle"]

    bundle = _load_model_bundle(cache_key)
    _MODEL_CACHE[cache_key] = {
        "modified_at": modified_at,
        "bundle": bundle,
    }
    return bundle


def _load_image(image_url=None, image_path=None, timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
    if image_path:
        with Image.open(image_path) as local_image:
            return local_image.convert("RGB")

    if not image_url:
        raise ValueError("image_url or image_path is required")

    response = requests.get(image_url, timeout=timeout_seconds)
    response.raise_for_status()
    with Image.open(BytesIO(response.content)) as remote_image:
        return remote_image.convert("RGB")


def classify_report_payload(
    *,
    text,
    image_url=None,
    image_path=None,
    model_path=None,
    model_name=None,
    model_version=None,
    threshold_percent=None,
):
    normalized_text = str(text or "").strip()
    if not normalized_text:
        raise ValueError("text is required")

    resolved_model_path = _resolve_model_path(model_path)
    resolved_model_name = str(model_name or os.getenv("REPORT_SPAM_MODEL_NAME") or DEFAULT_MODEL_NAME)
    resolved_model_version = str(
        model_version
        or os.getenv("REPORT_SPAM_MODEL_VERSION")
        or os.path.basename(resolved_model_path)
    )
    resolved_threshold_percent = _normalize_percent(
        threshold_percent or os.getenv("REPORT_SPAM_THRESHOLD"),
        DEFAULT_THRESHOLD_PERCENT,
    )

    bundle = load_report_spam_model(resolved_model_path)
    image = _load_image(image_url=image_url, image_path=image_path)
    image_tensor = clip.clip._transform(bundle["input_resolution"])(image).unsqueeze(0)
    text_tensor = clip.tokenize([normalized_text], truncate=True)

    with torch.no_grad():
        image_features = bundle["clip_model"].encode_image(image_tensor).float()
        text_features = bundle["clip_model"].encode_text(text_tensor).float()
        fused_features = torch.cat([text_features, image_features], dim=-1)
        logits = bundle["classifier"](fused_features)
        probabilities = torch.softmax(logits, dim=-1)[0].tolist()

    real_score = _normalize_percent(probabilities[0], 0.0)
    spam_score = _normalize_percent(probabilities[1], 0.0)
    confidence_score = _normalize_percent(max(probabilities), 0.0)
    predicted_label = DEFAULT_LABELS[1] if spam_score >= resolved_threshold_percent else DEFAULT_LABELS[0]

    return {
        "model_name": resolved_model_name,
        "model_version": resolved_model_version,
        "predicted_label": predicted_label,
        "spam_score": round(spam_score, 4),
        "real_score": round(real_score, 4),
        "confidence_score": round(confidence_score, 4),
        "threshold_used": round(resolved_threshold_percent, 4),
        "inference_status": "completed",
        "raw_scores": {
            DEFAULT_LABELS[0]: round(float(probabilities[0]), 6),
            DEFAULT_LABELS[1]: round(float(probabilities[1]), 6),
        },
        "inputs": {
            "text_length": len(normalized_text),
            "image_source": image_url or image_path,
            "input_resolution": bundle["input_resolution"],
        },
    }
