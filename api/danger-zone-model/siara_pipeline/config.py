from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
import json

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


@dataclass
class PathsConfig:
    dataset_path: str = "REPLACE_WITH_DATASET_PATH/US_Accidents_March23.csv"
    artifact_root: str = "artifacts"
    model_version: str = "siara_v4"
    osm_features_path: str = ""
    notebook_path: str = "NOTEBOOK_PATH"


@dataclass
class RuntimeConfig:
    seed: int = 42
    chunksize: int = 500_000
    strict_schema: bool = True
    use_time_features: bool = True
    include_month_feature: bool = False
    timezone: str = "Africa/Algiers"
    use_osm_features: bool = False
    use_geographic_holdout_eval: bool = True
    log_level: str = "INFO"


@dataclass
class LabelConfig:
    target_col: str = "Severity"
    severe_threshold: int = 3
    allowed_severity_values: list[int] = field(default_factory=lambda: [1, 2, 3, 4])
    time_col: str = "Start_Time"


@dataclass
class SamplingConfig:
    time_cutoff_quantile: float = 0.80
    time_samples_per_chunk: int = 20_000
    train_rows: int = 1_500_000
    val_rows: int = 500_000
    geo_eval_rows: int = 200_000
    test_size: float = 0.20
    calib_fraction_of_rest: float = 0.60


@dataclass
class FeatureConfig:
    numeric_base: list[str] = field(
        default_factory=lambda: [
            "Temperature(F)",
            "Humidity(%)",
            "Pressure(in)",
            "Visibility(mi)",
            "Wind_Speed(mph)",
            "Precipitation(in)",
        ]
    )
    categorical_base: list[str] = field(
        default_factory=lambda: [
            "Wind_Direction",
            "Weather_Condition",
            "Sunrise_Sunset",
            "Civil_Twilight",
            "Nautical_Twilight",
            "Astronomical_Twilight",
        ]
    )
    boolean_base: list[str] = field(
        default_factory=lambda: [
            "Amenity",
            "Bump",
            "Crossing",
            "Give_Way",
            "Junction",
            "No_Exit",
            "Railway",
            "Roundabout",
            "Station",
            "Stop",
            "Traffic_Calming",
            "Traffic_Signal",
            "Turning_Loop",
        ]
    )
    osm_numeric: list[str] = field(
        default_factory=lambda: [
            "road_class_count",
            "intersection_density",
            "roundabout_density",
            "maxspeed_mean_kmh",
            "maxspeed_p90_kmh",
        ]
    )
    osm_categorical: list[str] = field(default_factory=lambda: ["dominant_road_class"])
    geo_lat_col: str = "Start_Lat"
    geo_lng_col: str = "Start_Lng"
    geo_state_col: str = "State"
    top_k_categories: dict[str, int] = field(
        default_factory=lambda: {"Weather_Condition": 120, "Wind_Direction": 32}
    )
    category_other_token: str = "__OTHER__"
    category_missing_token: str = "__MISSING__"
    osm_cell_decimals: int = 3


@dataclass
class ModelConfig:
    type: str = "lightgbm"
    params: dict[str, Any] = field(
        default_factory=lambda: {
            "objective": "binary",
            "n_estimators": 12000,
            "learning_rate": 0.03,
            "num_leaves": 96,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "reg_lambda": 1.0,
            "min_child_samples": 40,
            "max_bin": 255,
            "n_jobs": -1,
            "metric": "auc",
        }
    )
    early_stopping_rounds: int = 300
    eval_log_period: int = 200


@dataclass
class CalibrationConfig:
    method: str = "sigmoid"
    threshold_quantiles: list[float] = field(default_factory=lambda: [0.50, 0.75, 0.90])
    threshold_source: str = "train"
    validated_on_target_domain: bool = False


@dataclass
class EvaluationConfig:
    top_k_fracs: list[float] = field(default_factory=lambda: [0.05, 0.10])
    calibration_bins: int = 10
    stability_freq: str = "Q"
    plot: bool = True
    holdout_states: list[str] = field(default_factory=lambda: ["CA", "TX", "FL"])


@dataclass
class DeploymentConfig:
    source_domain: str = "US"
    target_domain: str = "Algeria"
    algeria_mode_default: str = "relative_risk"


@dataclass
class PipelineConfig:
    paths: PathsConfig = field(default_factory=PathsConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)
    label: LabelConfig = field(default_factory=LabelConfig)
    sampling: SamplingConfig = field(default_factory=SamplingConfig)
    features: FeatureConfig = field(default_factory=FeatureConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    calibration: CalibrationConfig = field(default_factory=CalibrationConfig)
    evaluation: EvaluationConfig = field(default_factory=EvaluationConfig)
    deployment: DeploymentConfig = field(default_factory=DeploymentConfig)
    _config_path: Path | None = None

    @property
    def artifact_dir(self) -> Path:
        return Path(self.paths.artifact_root) / self.paths.model_version

    @property
    def dataset_path(self) -> Path:
        return Path(self.paths.dataset_path)

    @property
    def osm_features_path(self) -> Path | None:
        if not self.paths.osm_features_path:
            return None
        return Path(self.paths.osm_features_path)

    @property
    def active_numeric_cols(self) -> list[str]:
        cols = list(self.features.numeric_base)
        if self.runtime.use_time_features:
            cols.extend(["hour", "dow"])
            if self.runtime.include_month_feature:
                cols.append("month")
        if self.runtime.use_osm_features:
            cols.extend(self.features.osm_numeric)
        return cols

    @property
    def active_categorical_cols(self) -> list[str]:
        cols = list(self.features.categorical_base)
        if self.runtime.use_osm_features:
            cols.extend(self.features.osm_categorical)
        return cols

    @property
    def active_boolean_cols(self) -> list[str]:
        return list(self.features.boolean_base)

    @property
    def model_feature_order(self) -> list[str]:
        return self.active_numeric_cols + self.active_categorical_cols + self.active_boolean_cols

    @property
    def csv_usecols(self) -> list[str]:
        cols = {
            self.label.target_col,
            self.label.time_col,
            *self.features.numeric_base,
            *self.features.categorical_base,
            *self.features.boolean_base,
        }
        if self.runtime.use_osm_features:
            cols.update([self.features.geo_lat_col, self.features.geo_lng_col])
        if self.runtime.use_geographic_holdout_eval:
            cols.add(self.features.geo_state_col)
        return sorted(cols)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("_config_path", None)
        data["artifact_dir"] = str(self.artifact_dir)
        return data


def _deep_merge(base: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in update.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _dataclass_to_dict(dc: Any) -> dict[str, Any]:
    return asdict(dc)


def _resolve_paths(cfg: PipelineConfig, config_path: Path) -> PipelineConfig:
    base_dir = config_path.parent.resolve()

    def _resolve(p: str) -> str:
        path = Path(p)
        if path.is_absolute():
            return str(path)
        return str((base_dir / path).resolve())

    cfg.paths.dataset_path = _resolve(cfg.paths.dataset_path)
    cfg.paths.artifact_root = _resolve(cfg.paths.artifact_root)
    if cfg.paths.osm_features_path:
        cfg.paths.osm_features_path = _resolve(cfg.paths.osm_features_path)
    cfg._config_path = config_path
    return cfg


def default_config_dict() -> dict[str, Any]:
    return {
        "paths": _dataclass_to_dict(PathsConfig()),
        "runtime": _dataclass_to_dict(RuntimeConfig()),
        "label": _dataclass_to_dict(LabelConfig()),
        "sampling": _dataclass_to_dict(SamplingConfig()),
        "features": _dataclass_to_dict(FeatureConfig()),
        "model": _dataclass_to_dict(ModelConfig()),
        "calibration": _dataclass_to_dict(CalibrationConfig()),
        "evaluation": _dataclass_to_dict(EvaluationConfig()),
        "deployment": _dataclass_to_dict(DeploymentConfig()),
    }


def load_config(path: str | Path) -> PipelineConfig:
    config_path = Path(path).resolve()
    raw_text = config_path.read_text(encoding="utf-8")

    if config_path.suffix.lower() in {".yaml", ".yml"}:
        if yaml is None:
            raise RuntimeError("PyYAML is required to load YAML configs.")
        raw = yaml.safe_load(raw_text) or {}
    elif config_path.suffix.lower() == ".json":
        raw = json.loads(raw_text)
    else:
        raise ValueError("Config file must be .yaml, .yml, or .json")

    merged = _deep_merge(default_config_dict(), raw)

    cfg = PipelineConfig(
        paths=PathsConfig(**merged["paths"]),
        runtime=RuntimeConfig(**merged["runtime"]),
        label=LabelConfig(**merged["label"]),
        sampling=SamplingConfig(**merged["sampling"]),
        features=FeatureConfig(**merged["features"]),
        model=ModelConfig(**merged["model"]),
        calibration=CalibrationConfig(**merged["calibration"]),
        evaluation=EvaluationConfig(**merged["evaluation"]),
        deployment=DeploymentConfig(**merged["deployment"]),
    )
    return _resolve_paths(cfg, config_path)
