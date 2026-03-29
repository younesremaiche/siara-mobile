from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV


def fit_calibrator(
    raw_model,
    x_calib: pd.DataFrame,
    y_calib: np.ndarray,
    method: str = "sigmoid",
):
    calibrator = CalibratedClassifierCV(raw_model, method=method, cv="prefit")
    calibrator.fit(x_calib, y_calib)
    return calibrator


def compute_thresholds(
    scores: np.ndarray,
    quantiles: list[float],
) -> dict[str, float]:
    out = {}
    for q in quantiles:
        key = f"q{int(round(q * 100))}"
        out[key] = float(np.quantile(scores, q))
    return out


def risk_level_from_thresholds(danger_percent: float, thresholds: dict[str, float]) -> str:
    q50 = float(thresholds.get("q50", 25.0))
    q75 = float(thresholds.get("q75", 50.0))
    q90 = float(thresholds.get("q90", 75.0))
    if danger_percent < q50:
        return "low"
    if danger_percent < q75:
        return "moderate"
    if danger_percent < q90:
        return "high"
    return "extreme"

