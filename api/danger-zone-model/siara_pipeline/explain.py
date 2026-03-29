from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .features import FeatureProcessor

try:
    import shap
except ImportError:  # pragma: no cover
    shap = None


def _extract_binary_shap_vector(shap_values: Any) -> np.ndarray:
    if isinstance(shap_values, list):
        if not shap_values:
            raise ValueError("Empty SHAP values list.")
        candidate = shap_values[1] if len(shap_values) > 1 else shap_values[0]
        return np.asarray(candidate)[0]

    arr = np.asarray(shap_values)
    if arr.ndim == 3:
        # shape can be (rows, features, classes)
        return arr[0, :, -1]
    if arr.ndim == 2:
        return arr[0]
    raise ValueError(f"Unsupported SHAP shape: {arr.shape}")


class SiaraExplainer:
    def __init__(self, artifact_dir: str | Path, logger: logging.Logger | None = None) -> None:
        self.artifact_dir = Path(artifact_dir)
        self.logger = logger or logging.getLogger(__name__)
        if shap is None:
            raise RuntimeError("SHAP is not installed.")

        self.raw_model = joblib.load(self.artifact_dir / "model_raw.joblib")
        self.metadata = json.loads((self.artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        self.processor = FeatureProcessor.from_metadata(self.metadata, self.logger)
        self.explainer = shap.TreeExplainer(self.raw_model)

    def explain_one(self, row: dict[str, Any], top_k: int = 10) -> dict[str, Any]:
        x, _, _ = self.processor.transform(pd.DataFrame([row]), include_label=False)
        shap_values = self.explainer.shap_values(x)
        vector = _extract_binary_shap_vector(shap_values)

        names = x.columns.tolist()
        values = x.iloc[0].to_dict()
        idx = np.argsort(np.abs(vector))[::-1][: max(1, int(top_k))]

        reasons = []
        for i in idx:
            impact = float(vector[int(i)])
            reasons.append(
                {
                    "feature": names[int(i)],
                    "value": values.get(names[int(i)]),
                    "impact": impact,
                    "direction": "increases_risk" if impact > 0 else "decreases_risk",
                }
            )

        base_prob = float(self.raw_model.predict_proba(x)[:, 1][0])
        return {"base_model_score": base_prob, "top_reasons": reasons}

