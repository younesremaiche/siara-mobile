from __future__ import annotations

from dataclasses import dataclass
import logging

import lightgbm as lgb
import numpy as np
import pandas as pd

from .config import PipelineConfig


@dataclass
class TrainResult:
    model: lgb.LGBMClassifier
    info: dict


def _scale_pos_weight(y: np.ndarray) -> float:
    pos = float(np.mean(y))
    return float((1.0 - pos) / max(pos, 1e-9))


def train_lightgbm(
    cfg: PipelineConfig,
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_early: pd.DataFrame,
    y_early: np.ndarray,
    logger: logging.Logger,
) -> TrainResult:
    params = dict(cfg.model.params)
    params["random_state"] = cfg.runtime.seed
    params["scale_pos_weight"] = _scale_pos_weight(y_train)

    logger.info("Training LightGBM with %d rows, scale_pos_weight=%.4f", len(y_train), params["scale_pos_weight"])
    model = lgb.LGBMClassifier(**params)
    model.fit(
        x_train,
        y_train,
        eval_set=[(x_early, y_early)],
        eval_metric="auc",
        callbacks=[
            lgb.early_stopping(cfg.model.early_stopping_rounds, first_metric_only=True),
            lgb.log_evaluation(cfg.model.eval_log_period),
        ],
    )

    info = {
        "name": "lightgbm",
        "best_iteration": int(getattr(model, "best_iteration_", -1) or -1),
        "n_train": int(len(y_train)),
        "train_severe_rate": float(np.mean(y_train)),
    }
    return TrainResult(model=model, info=info)

