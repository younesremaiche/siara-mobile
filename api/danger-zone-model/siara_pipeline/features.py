from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .config import PipelineConfig


@dataclass
class SchemaValidationResult:
    missing_columns: list[str]
    unexpected_columns: list[str]


def validate_schema(
    df: pd.DataFrame,
    expected_columns: list[str],
    defaults: dict[str, Any],
    strict_schema: bool,
    logger: logging.Logger,
    allowed_extra_columns: list[str] | None = None,
) -> tuple[pd.DataFrame, SchemaValidationResult]:
    allowed_extra = set(allowed_extra_columns or [])
    out = df.copy()
    expected = set(expected_columns)

    missing = [c for c in expected_columns if c not in out.columns]
    for col in missing:
        out[col] = defaults.get(col)

    unexpected = [c for c in out.columns if c not in expected and c not in allowed_extra]

    if missing:
        logger.warning("Schema missing columns filled with defaults: %s", missing)
    if unexpected and strict_schema:
        raise ValueError(f"Unexpected columns under STRICT_SCHEMA=True: {unexpected}")
    if unexpected:
        logger.warning("Unexpected columns ignored: %s", unexpected)

    return out, SchemaValidationResult(missing_columns=missing, unexpected_columns=unexpected)


def _to_bool_int_series(series: pd.Series) -> pd.Series:
    true_values = {"1", "true", "t", "yes", "y", "on"}
    false_values = {"0", "false", "f", "no", "n", "off", ""}

    if series.dtype == bool:
        return series.astype("int8")

    if pd.api.types.is_numeric_dtype(series):
        return (series.fillna(0) != 0).astype("int8")

    s = series.fillna("").astype(str).str.strip().str.lower()
    out = pd.Series(np.zeros(len(s), dtype=np.int8), index=series.index)
    out[s.isin(true_values)] = 1
    out[s.isin(false_values)] = 0
    return out


def _build_cell_id(lat: pd.Series, lng: pd.Series, decimals: int) -> pd.Series:
    lat_num = pd.to_numeric(lat, errors="coerce").round(decimals)
    lng_num = pd.to_numeric(lng, errors="coerce").round(decimals)
    lat_str = lat_num.map(lambda v: f"{v:.{decimals}f}" if pd.notna(v) else "")
    lng_str = lng_num.map(lambda v: f"{v:.{decimals}f}" if pd.notna(v) else "")
    return lat_str.str.cat(lng_str, sep=":")


class FeatureProcessor:
    def __init__(
        self,
        numeric_cols: list[str],
        categorical_cols: list[str],
        boolean_cols: list[str],
        label_col: str,
        severe_threshold: int,
        time_col: str,
        geo_lat_col: str,
        geo_lng_col: str,
        geo_state_col: str,
        strict_schema: bool,
        use_time_features: bool,
        include_month_feature: bool,
        timezone_name: str,
        use_osm_features: bool,
        osm_features_path: Path | None,
        osm_cell_decimals: int,
        top_k_categories: dict[str, int],
        category_other_token: str,
        category_missing_token: str,
        logger: logging.Logger,
    ) -> None:
        self.numeric_cols = numeric_cols
        self.categorical_cols = categorical_cols
        self.boolean_cols = boolean_cols
        self.feature_order = numeric_cols + categorical_cols + boolean_cols

        self.label_col = label_col
        self.severe_threshold = severe_threshold
        self.time_col = time_col
        self.geo_lat_col = geo_lat_col
        self.geo_lng_col = geo_lng_col
        self.geo_state_col = geo_state_col

        self.strict_schema = strict_schema
        self.use_time_features = use_time_features
        self.include_month_feature = include_month_feature
        self.timezone_name = timezone_name
        self.use_osm_features = use_osm_features
        self.osm_features_path = osm_features_path
        self.osm_cell_decimals = osm_cell_decimals

        self.top_k_categories = top_k_categories
        self.category_other_token = category_other_token
        self.category_missing_token = category_missing_token

        self.logger = logger
        self.numeric_median: dict[str, float] = {}
        self.numeric_clip: dict[str, dict[str, float]] = {}
        self.categorical_levels: dict[str, list[str]] = {}
        self._osm_table: pd.DataFrame | None = None

    @classmethod
    def from_config(cls, cfg: PipelineConfig, logger: logging.Logger) -> "FeatureProcessor":
        return cls(
            numeric_cols=cfg.active_numeric_cols,
            categorical_cols=cfg.active_categorical_cols,
            boolean_cols=cfg.active_boolean_cols,
            label_col=cfg.label.target_col,
            severe_threshold=cfg.label.severe_threshold,
            time_col=cfg.label.time_col,
            geo_lat_col=cfg.features.geo_lat_col,
            geo_lng_col=cfg.features.geo_lng_col,
            geo_state_col=cfg.features.geo_state_col,
            strict_schema=cfg.runtime.strict_schema,
            use_time_features=cfg.runtime.use_time_features,
            include_month_feature=cfg.runtime.include_month_feature,
            timezone_name=cfg.runtime.timezone,
            use_osm_features=cfg.runtime.use_osm_features,
            osm_features_path=cfg.osm_features_path,
            osm_cell_decimals=cfg.features.osm_cell_decimals,
            top_k_categories=cfg.features.top_k_categories,
            category_other_token=cfg.features.category_other_token,
            category_missing_token=cfg.features.category_missing_token,
            logger=logger,
        )

    @classmethod
    def from_metadata(cls, metadata: dict[str, Any], logger: logging.Logger) -> "FeatureProcessor":
        proc_cfg = metadata["feature_processor"]
        processor = cls(
            numeric_cols=proc_cfg["numeric_cols"],
            categorical_cols=proc_cfg["categorical_cols"],
            boolean_cols=proc_cfg["boolean_cols"],
            label_col=proc_cfg["label_col"],
            severe_threshold=int(proc_cfg["severe_threshold"]),
            time_col=proc_cfg["time_col"],
            geo_lat_col=proc_cfg["geo_lat_col"],
            geo_lng_col=proc_cfg["geo_lng_col"],
            geo_state_col=proc_cfg["geo_state_col"],
            strict_schema=bool(proc_cfg["strict_schema"]),
            use_time_features=bool(proc_cfg["use_time_features"]),
            include_month_feature=bool(proc_cfg["include_month_feature"]),
            timezone_name=proc_cfg["timezone_name"],
            use_osm_features=bool(proc_cfg["use_osm_features"]),
            osm_features_path=Path(proc_cfg["osm_features_path"]) if proc_cfg["osm_features_path"] else None,
            osm_cell_decimals=int(proc_cfg["osm_cell_decimals"]),
            top_k_categories=proc_cfg["top_k_categories"],
            category_other_token=proc_cfg["category_other_token"],
            category_missing_token=proc_cfg["category_missing_token"],
            logger=logger,
        )
        processor.numeric_median = proc_cfg["numeric_median"]
        processor.numeric_clip = proc_cfg["numeric_clip"]
        processor.categorical_levels = proc_cfg["categorical_levels"]
        return processor

    def _defaults(self) -> dict[str, Any]:
        defaults = {}
        for col in self.numeric_cols:
            defaults[col] = self.numeric_median.get(col, 0.0)
        for col in self.categorical_cols:
            defaults[col] = self.category_missing_token
        for col in self.boolean_cols:
            defaults[col] = 0
        return defaults

    def _load_osm_table(self) -> pd.DataFrame:
        if self._osm_table is not None:
            return self._osm_table
        if not self.osm_features_path:
            raise RuntimeError("USE_OSM_FEATURES=True but osm_features_path is not configured.")
        if not self.osm_features_path.exists():
            raise FileNotFoundError(f"OSM feature table not found: {self.osm_features_path}")
        self._osm_table = pd.read_parquet(self.osm_features_path)
        if "cell_id" not in self._osm_table.columns:
            raise ValueError("OSM feature table must include 'cell_id'.")
        self._osm_table = self._osm_table.drop_duplicates(subset=["cell_id"], keep="last").reset_index(drop=True)
        return self._osm_table

    def _join_osm(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.use_osm_features:
            return df
        if self.geo_lat_col not in df.columns or self.geo_lng_col not in df.columns:
            self.logger.warning(
                "OSM join requested but %s or %s missing. OSM columns will be null and imputed.",
                self.geo_lat_col,
                self.geo_lng_col,
            )
            for col in self.numeric_cols + self.categorical_cols:
                if col.startswith("road_") or col.startswith("intersection_") or col.startswith("maxspeed_"):
                    df[col] = np.nan
            return df

        osm = self._load_osm_table()
        out = df.copy()
        out["cell_id"] = _build_cell_id(out[self.geo_lat_col], out[self.geo_lng_col], self.osm_cell_decimals)
        out = out.merge(osm, how="left", on="cell_id")
        return out

    def _add_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.use_time_features:
            return df
        out = df.copy()
        t = pd.to_datetime(out.get(self.time_col), errors="coerce", utc=True)
        local = t.dt.tz_convert(self.timezone_name)
        out["hour"] = local.dt.hour.astype("float32")
        out["dow"] = local.dt.dayofweek.astype("float32")
        if self.include_month_feature:
            out["month"] = local.dt.month.astype("float32")
        return out

    def _fit_numeric_stats(self, df: pd.DataFrame) -> None:
        for col in self.numeric_cols:
            v = pd.to_numeric(df.get(col), errors="coerce")
            finite = v[np.isfinite(v)]
            if finite.empty:
                self.numeric_median[col] = 0.0
                self.numeric_clip[col] = {"p01": 0.0, "p99": 0.0}
                continue

            self.numeric_median[col] = float(np.nanmedian(finite))
            self.numeric_clip[col] = {
                "p01": float(np.nanpercentile(finite, 1)),
                "p99": float(np.nanpercentile(finite, 99)),
            }

    def _fit_categorical_levels(self, df: pd.DataFrame) -> None:
        for col in self.categorical_cols:
            s = df.get(col, pd.Series([self.category_missing_token] * len(df), index=df.index))
            s = s.fillna(self.category_missing_token).astype(str).str.strip()
            top_k = int(self.top_k_categories.get(col, max(1, s.nunique())))
            levels = s.value_counts().head(top_k).index.tolist()
            if self.category_other_token not in levels:
                levels.append(self.category_other_token)
            self.categorical_levels[col] = levels

    def _prepare_frame(self, raw_df: pd.DataFrame) -> pd.DataFrame:
        out = raw_df.copy()
        out = self._join_osm(out)
        out = self._add_time_features(out)
        return out

    def fit(self, train_raw: pd.DataFrame) -> None:
        prepared = self._prepare_frame(train_raw)
        self._fit_numeric_stats(prepared)
        self._fit_categorical_levels(prepared)
        self.logger.info("Fitted numeric stats for %d columns.", len(self.numeric_cols))
        self.logger.info("Locked categorical levels for %d columns.", len(self.categorical_cols))

    def transform(
        self,
        raw_df: pd.DataFrame,
        include_label: bool = False,
    ) -> tuple[pd.DataFrame, np.ndarray | None, dict[str, Any]]:
        prepared = self._prepare_frame(raw_df)
        allowed_extra = [self.label_col, self.time_col, self.geo_lat_col, self.geo_lng_col, self.geo_state_col, "cell_id"]

        validated, schema_info = validate_schema(
            prepared,
            expected_columns=self.feature_order,
            defaults=self._defaults(),
            strict_schema=self.strict_schema,
            logger=self.logger,
            allowed_extra_columns=allowed_extra,
        )

        x = validated[self.feature_order].copy()
        quality = {
            "missing_columns_filled": schema_info.missing_columns,
            "unexpected_columns": schema_info.unexpected_columns,
            "unknown_category_counts": {},
        }

        for col in self.numeric_cols:
            v = pd.to_numeric(x[col], errors="coerce")
            med = float(self.numeric_median.get(col, 0.0))
            lo = float(self.numeric_clip.get(col, {}).get("p01", med))
            hi = float(self.numeric_clip.get(col, {}).get("p99", med))
            x[col] = v.fillna(med).clip(lower=lo, upper=hi).astype("float32")

        for col in self.categorical_cols:
            levels = self.categorical_levels.get(col, [self.category_other_token])
            allowed = set(levels)
            s = x[col].fillna(self.category_missing_token).astype(str).str.strip()
            unknown_mask = ~s.isin(allowed)
            unknown_count = int(unknown_mask.sum())
            if unknown_count > 0:
                quality["unknown_category_counts"][col] = unknown_count
                self.logger.warning("Column %s: mapped %d unknown categories to %s", col, unknown_count, self.category_other_token)
            s = s.where(s.isin(allowed), other=self.category_other_token)
            x[col] = pd.Categorical(s, categories=levels)

        for col in self.boolean_cols:
            x[col] = _to_bool_int_series(x[col])

        y = None
        if include_label:
            if self.label_col not in raw_df.columns:
                raise ValueError(f"Missing label column: {self.label_col}")
            y = (pd.to_numeric(raw_df[self.label_col], errors="coerce") >= self.severe_threshold).astype(np.int8).to_numpy()

        return x, y, quality

    def feature_metadata(self) -> dict[str, Any]:
        return {
            "numeric_cols": self.numeric_cols,
            "categorical_cols": self.categorical_cols,
            "boolean_cols": self.boolean_cols,
            "label_col": self.label_col,
            "severe_threshold": self.severe_threshold,
            "time_col": self.time_col,
            "geo_lat_col": self.geo_lat_col,
            "geo_lng_col": self.geo_lng_col,
            "geo_state_col": self.geo_state_col,
            "strict_schema": self.strict_schema,
            "use_time_features": self.use_time_features,
            "include_month_feature": self.include_month_feature,
            "timezone_name": self.timezone_name,
            "use_osm_features": self.use_osm_features,
            "osm_features_path": str(self.osm_features_path) if self.osm_features_path else "",
            "osm_cell_decimals": self.osm_cell_decimals,
            "top_k_categories": self.top_k_categories,
            "category_other_token": self.category_other_token,
            "category_missing_token": self.category_missing_token,
            "numeric_median": self.numeric_median,
            "numeric_clip": self.numeric_clip,
            "categorical_levels": self.categorical_levels,
        }
