# Siara Severity/Risk Pipeline

## What This Model Predicts
- `Severity-given-accident` mode: predicts `P(severe | accident record)` where `severe = (Severity >= 3)`.
- `Algeria relative-risk` mode: reports `Danger% = 100 * model_score` as a ranking index, **not** a target-domain calibrated probability unless Algeria calibration labels are available and validated.

## Domain-Shift Disclaimer
- Training data is US-based (`US_Accidents`).
- For Algeria deployment without labeled Algerian accidents, outputs are treated as relative risk only.
- In inference responses: `is_calibrated_probability=false` and `domain_warning` explains this.

## Notebook Findings Refactored
- Removed artifact path drift (`siara_v2` vs `siara_v3`) by enforcing one source of truth: `artifact_root/model_version`.
- Enforced strict schema (`NUM_COLS`, `CAT_COLS`, `BOOL_COLS`) with `validate_schema`.
- Added config flag `use_time_features` with timezone-aware extraction (`Africa/Algiers`) and hard-disable path.
- Locked categorical levels from train split only: top-k + `__OTHER__`.
- Replaced biased chunk sampling with reproducible reservoir sampling.
- Default validation rows fixed to `500000`.
- Added robust evaluation and report generation (ROC-AUC, PR-AUC, Brier, calibration, top-k capture, stability).
- Added optional geographic holdout evaluation by US states.
- OSM handling is explicit:
  - Option A: offline join from precomputed `osm_features.parquet` by `cell_id`.
  - Option B: disable OSM and remove OSM columns from schema.

## File Layout
- `run_pipeline.py`: end-to-end entrypoint.
- `configs/siara.yaml`: configuration (dataset path, artifacts, features, sampling, calibration, deployment mode).
- `siara_pipeline/config.py`: config schema + active feature resolution.
- `siara_pipeline/data.py`: chunked reads, cutoff estimation, reservoir sampling, split sampling.
- `siara_pipeline/features.py`: preprocessing, schema validation, category locking, OSM join.
- `siara_pipeline/train.py`: LightGBM training + early stopping.
- `siara_pipeline/calibrate.py`: calibration + threshold utilities.
- `siara_pipeline/evaluate.py`: metrics, tables, plots, model report.
- `siara_pipeline/infer.py`: artifact loading + inference CLI.
- `siara_pipeline/explain.py`: SHAP from raw model.

## Run Training + Calibration
```bash
cd api/danger-zone-model
python run_pipeline.py --config configs/siara.yaml
```

## Artifacts Produced
Under `artifact_root/model_version`:
- `model_raw.joblib`
- `model_calibrated.joblib`
- `metadata.json`
- `model_report.md`
- `evaluation/metrics.json`
- `evaluation/calibration_table.csv`
- `evaluation/stability_by_period.csv`
- `evaluation/*.png` (if plotting enabled)

## Inference (Single Row JSON)
```bash
cd api/danger-zone-model
python -m siara_pipeline.infer \
  --artifact-dir artifacts/siara_v4 \
  --row-json "{\"Start_Time\":\"2024-01-01T08:00:00Z\",\"Temperature(F)\":70,\"Humidity(%)\":40,\"Pressure(in)\":29.9,\"Visibility(mi)\":10,\"Wind_Speed(mph)\":5,\"Precipitation(in)\":0,\"Wind_Direction\":\"N\",\"Weather_Condition\":\"Clear\",\"Sunrise_Sunset\":\"Day\",\"Civil_Twilight\":\"Day\",\"Nautical_Twilight\":\"Day\",\"Astronomical_Twilight\":\"Day\",\"Amenity\":0,\"Bump\":0,\"Crossing\":1,\"Give_Way\":0,\"Junction\":1,\"No_Exit\":0,\"Railway\":0,\"Roundabout\":0,\"Station\":0,\"Stop\":0,\"Traffic_Calming\":0,\"Traffic_Signal\":1,\"Turning_Loop\":0}" \
  --mode relative_risk
```

## Example Output Shape
```json
[
  {
    "model_score": 0.4123,
    "danger_percent": 41.23,
    "risk_level": "high",
    "is_calibrated_probability": false,
    "domain_warning": "Model trained on US data; outputs are relative risk only for Algeria.",
    "mode": "relative_risk"
  }
]
```

