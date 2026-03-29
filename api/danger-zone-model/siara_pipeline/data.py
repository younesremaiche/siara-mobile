from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator
import logging

import numpy as np
import pandas as pd

from .config import PipelineConfig


@dataclass
class TimeSplitSamples:
    train_raw: pd.DataFrame
    val_raw: pd.DataFrame
    geo_eval_raw: pd.DataFrame | None
    time_cutoff: pd.Timestamp
    stats: dict


def iter_csv_chunks(
    csv_path: Path,
    usecols: list[str],
    chunksize: int,
) -> Iterator[pd.DataFrame]:
    for chunk in pd.read_csv(csv_path, usecols=usecols, chunksize=chunksize):
        yield chunk


def _reservoir_sample_records(
    chunks: Iterable[pd.DataFrame],
    n_rows: int,
    seed: int,
) -> tuple[pd.DataFrame, int]:
    rng = np.random.default_rng(seed)
    reservoir: list[dict] = []
    seen = 0

    for chunk in chunks:
        cols = list(chunk.columns)
        for row in chunk.itertuples(index=False, name=None):
            rec = dict(zip(cols, row))
            seen += 1
            if len(reservoir) < n_rows:
                reservoir.append(rec)
                continue

            j = int(rng.integers(0, seen))
            if j < n_rows:
                reservoir[j] = rec

    if not reservoir:
        return pd.DataFrame(), seen
    return pd.DataFrame(reservoir), seen


def estimate_time_cutoff(cfg: PipelineConfig, logger: logging.Logger) -> pd.Timestamp:
    rng = np.random.default_rng(cfg.runtime.seed)
    samples: list[np.ndarray] = []

    for chunk in iter_csv_chunks(cfg.dataset_path, [cfg.label.time_col, cfg.label.target_col], cfg.runtime.chunksize):
        chunk = chunk[chunk[cfg.label.target_col].isin(cfg.label.allowed_severity_values)]
        if chunk.empty:
            continue

        t = pd.to_datetime(chunk[cfg.label.time_col], errors="coerce", utc=True).dropna()
        if t.empty:
            continue

        take = min(len(t), cfg.sampling.time_samples_per_chunk)
        idx = rng.choice(len(t), size=take, replace=False)
        samples.append(t.iloc[idx].to_numpy(dtype="datetime64[ns]"))

    if not samples:
        raise RuntimeError("Could not estimate time cutoff: no valid timestamps found.")

    all_times = np.concatenate(samples)
    cutoff_ns = np.quantile(all_times.astype("datetime64[ns]").astype(np.int64), cfg.sampling.time_cutoff_quantile)
    cutoff = pd.to_datetime(int(cutoff_ns), unit="ns", utc=True)
    logger.info("Estimated time cutoff at quantile %.2f: %s", cfg.sampling.time_cutoff_quantile, cutoff)
    return cutoff


def _filter_for_split(
    chunk: pd.DataFrame,
    cfg: PipelineConfig,
    cutoff: pd.Timestamp,
    mode: str,
    holdout_states: set[str] | None = None,
) -> pd.DataFrame:
    label_col = cfg.label.target_col
    time_col = cfg.label.time_col
    state_col = cfg.features.geo_state_col

    chunk = chunk[chunk[label_col].isin(cfg.label.allowed_severity_values)].copy()
    if chunk.empty:
        return chunk

    t = pd.to_datetime(chunk[time_col], errors="coerce", utc=True)
    valid_time = t.notna()
    if not valid_time.any():
        return chunk.iloc[0:0]

    chunk = chunk.loc[valid_time].copy()
    t = t.loc[valid_time]

    if mode == "train":
        mask = t < cutoff
    elif mode in {"val", "geo_eval"}:
        mask = t >= cutoff
    else:
        raise ValueError(f"Unsupported split mode: {mode}")

    chunk = chunk.loc[mask].copy()
    if chunk.empty:
        return chunk

    if holdout_states and state_col in chunk.columns:
        normalized = chunk[state_col].astype(str).str.upper().str.strip()
        if mode == "train":
            chunk = chunk.loc[~normalized.isin(holdout_states)].copy()
        elif mode == "geo_eval":
            chunk = chunk.loc[normalized.isin(holdout_states)].copy()

    return chunk


def build_time_split_samples(cfg: PipelineConfig, logger: logging.Logger) -> TimeSplitSamples:
    cutoff = estimate_time_cutoff(cfg, logger)
    holdout = set(s.upper() for s in cfg.evaluation.holdout_states) if cfg.runtime.use_geographic_holdout_eval else None

    def _stream(mode: str) -> Iterator[pd.DataFrame]:
        for chunk in iter_csv_chunks(cfg.dataset_path, cfg.csv_usecols, cfg.runtime.chunksize):
            filtered = _filter_for_split(chunk, cfg, cutoff, mode=mode, holdout_states=holdout)
            if not filtered.empty:
                yield filtered

    train_raw, train_seen = _reservoir_sample_records(_stream("train"), cfg.sampling.train_rows, cfg.runtime.seed + 1)
    val_raw, val_seen = _reservoir_sample_records(_stream("val"), cfg.sampling.val_rows, cfg.runtime.seed + 2)

    geo_eval_raw = None
    geo_seen = 0
    if cfg.runtime.use_geographic_holdout_eval:
        geo_eval_raw, geo_seen = _reservoir_sample_records(
            _stream("geo_eval"), cfg.sampling.geo_eval_rows, cfg.runtime.seed + 3
        )
        if geo_eval_raw.empty:
            logger.warning(
                "Geographic holdout requested but no rows found for states=%s using column %s.",
                cfg.evaluation.holdout_states,
                cfg.features.geo_state_col,
            )
            geo_eval_raw = None

    if train_raw.empty or val_raw.empty:
        raise RuntimeError("Train/validation sampling failed; verify dataset path and split filters.")

    def _severe_rate(df: pd.DataFrame) -> float:
        return float((pd.to_numeric(df[cfg.label.target_col], errors="coerce") >= cfg.label.severe_threshold).mean())

    stats = {
        "cutoff_utc": str(cutoff),
        "train_seen_after_filters": int(train_seen),
        "val_seen_after_filters": int(val_seen),
        "geo_seen_after_filters": int(geo_seen),
        "train_sample_rows": int(len(train_raw)),
        "val_sample_rows": int(len(val_raw)),
        "geo_eval_rows": int(len(geo_eval_raw)) if geo_eval_raw is not None else 0,
        "train_severe_rate": _severe_rate(train_raw),
        "val_severe_rate": _severe_rate(val_raw),
        "geo_severe_rate": _severe_rate(geo_eval_raw) if geo_eval_raw is not None else None,
    }
    logger.info("Sampling stats: %s", stats)

    return TimeSplitSamples(
        train_raw=train_raw.reset_index(drop=True),
        val_raw=val_raw.reset_index(drop=True),
        geo_eval_raw=geo_eval_raw.reset_index(drop=True) if geo_eval_raw is not None else None,
        time_cutoff=cutoff,
        stats=stats,
    )
