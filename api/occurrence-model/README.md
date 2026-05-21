# Accident Occurrence Model — `occurrence_beta_v1`

LightGBM + isotonic-calibrated classifier that estimates the probability of an
accident occurring on a given road segment within a 1-hour window.

## Artifact layout

```
api/occurrence-model/occurrence_betav1_final/
├── model.joblib              # LightGBM classifier
├── preprocessor.joblib       # sklearn ColumnTransformer (categorical OHE + numeric imputer)
├── calibrator.joblib         # Isotonic calibrator over base scores
├── feature_list.json         # 23 feature names in inference order — source of truth
├── feature_mapping.json      # pipeline → DB column mapping for feature engineering
├── metrics.json              # calibrated/uncalibrated metrics, threshold tables, comparison
├── training_manifest.json    # training config, splits, weather coverage, risk thresholds
├── inference_sample.json     # example rows + expected response shape (NaN tokens in JSON)
├── feature_importance.csv    # global gain importance (fallback explanations)
├── shap_top_features.csv     # SHAP mean absolute importance per feature
└── calibration_curve.png     # reliability plot
```

The same PNG is mirrored to
`client/public/model-assets/occurrence_beta_v1/calibration_curve.png` so Vite
serves it directly in dev. Express also serves the artifact folder under
`/model-assets/occurrence_betav1_final/*` as a backend-side fallback.

## Required input features (23)

```
month, weekday, hour, hour_of_week, is_weekend, is_night,
road_class, segment_length_m, oneway, bridge, tunnel,
weather_temp, weather_dwpt, weather_rhum, weather_prcp,
weather_wdir, weather_wspd, weather_pres,
past_segment_positive_count, past_segment_positive_count_7d,
past_segment_positive_count_30d, past_road_class_positive_count,
past_segment_hourofweek_count
```

Categorical: `road_class, oneway, bridge, tunnel`. All others numeric. Missing
weather/historical values can be `null` — the preprocessor imputes them.

`feature_list.json` is the canonical order. The Node feature builder
(deferred to a follow-up PR) MUST produce rows in this exact order.

## Endpoints

### Flask (internal)

- `POST /risk/occurrence/predict` — body `{ "rows": [ {feature_map}, ... ] }`,
  returns `{ model_version, selected_model, calibration_method, decision_threshold,
  risk_level_thresholds, feature_list, predictions: [...] }`.
- `GET /risk/occurrence/metadata` — returns metrics + manifest + SHAP global
  features (used by the Admin page).

Returns **HTTP 503** with `Occurrence model is not loaded` if the joblib files
were missing at startup; the rest of the Flask service (driver-quiz, danger
zone, sentinel, spam) keeps working.

### Node (public)

- `POST /api/risk/occurrence/predict` — thin proxy with payload validation.
- `POST /api/model/risk/occurrence/predict` — alias (matches the existing
  `/api/model/*` compatibility layer).
- `GET /api/risk/occurrence/metadata` — proxies the Flask metadata endpoint.
- `GET /api/admin/models/occurrence-beta-v1` — admin-only; merges
  `ml.model_versions` row + on-disk metrics + live Flask metadata. Used by the
  Admin → AI Monitoring → **Occurrence Model (Beta)** tab.

## Headline metrics (calibrated, validation split)

| Metric | Value |
|---|---|
| ROC-AUC | 0.7228 |
| PR-AUC | 0.2255 |
| Brier | 0.0989 |
| Log loss | 0.3320 |
| Precision @ top 1% | 0.4078 |
| Recall @ top 1% | 0.0343 |
| Precision @ top 5% | 0.2981 |
| Recall @ top 5% | 0.1254 |
| Precision @ top 10% | 0.2513 |
| Recall @ top 10% | 0.2114 |

Confusion matrix at `threshold=0.2`:

| | Pred 0 | Pred 1 |
|---|---|---|
| Actual 0 | TN 419 132 | FP 73 530 |
| Actual 1 | FN 44 002 | TP 22 466 |

Risk-level thresholds (calibrated probability):

| Level | Lower bound |
|---|---|
| low | 0.0 |
| moderate | 0.05 |
| high | 0.2 |
| critical | 0.5 |

## Probability interpretation — important caveat

The training set was constructed with sampled negatives (≈4–7 negatives per
positive). The calibrated probability therefore reflects this artificial
sampled prior, **not** the real-world base rate.

> Sampled training prevalence is artificial because of negative sampling.
> Calibrated probabilities reflect this sampled prior and should be interpreted
> as relative operational risk until recalibrated against realistic exposure.

Additionally, training data is US Accidents 2016–2023. For Algeria deployment,
treat the output as **relative operational risk** unless and until the model is
recalibrated on local exposure data.

## Smoke test

```bash
# 1. Start the Flask ML service in one shell:
cd api/contollers/Model
python ml_service.py
# Expect: [occurrence] loaded occurrence_beta_v1 lightgbm + isotonic

# 2. Run the smoke test (direct Flask):
cd api
node scripts/testOccurrenceModel.js

# Or, with the Node API also running, exercise the full proxy chain:
node scripts/testOccurrenceModel.js --via-node
```

The script reads `inference_sample.json`, POSTs the rows, and asserts that
`model_version === occurrence_beta_v1`, that `calibrated_probability` lies in
[0, 1], that `risk_level` ∈ {low, moderate, high, critical}, and that the
response contains no `NaN` tokens.

## Model-only vs personalized (user-facing contract)

Every request to `POST /api/occurrence-risk/segment` (authenticated) now
returns **both** values so the UI can render them side by side:

```jsonc
{
  "scoring_source": "trained_model",   // or "rule_fusion" if Flask is down
  "model_version": "occurrence_beta_v1",
  "probability_warning": "The model was trained with sampled negatives. …",
  "modelOnly": {
    "calibrated_probability": 0.12,
    "risk_level": "moderate",
    "risk_score": 0.41,
    "confidence_score": 0.63,
    "top_factors": [ … ]
  },
  "personalized": {
    "calibrated_probability": 0.15,
    "risk_level": "high",
    "driver_behavior_applied": true,
    "behavior_multiplier": 1.22,
    "behavior_delta": 0.03,
    "driver_risk_score": 72,
    "driver_result_label": "risky",
    "explanation": {
      "base_model": "…",
      "driver_effect": "…"
    }
  },
  "driver_meta": { … },
  "persisted": {
    "model_version": "occurrence_beta_v1",
    "global_prediction_id": 1234,
    "personalized_prediction_id": 5678
  }
}
```

Rules enforced server-side:

- `modelOnly` is **always** the raw occurrence_beta_v1 output. It is never
  overwritten by personalization.
- `personalized` is derived from `modelOnly` × the driver-behavior multiplier.
- If the user has no `app.user_driver_quiz_profile` row, `personalized`
  equals `modelOnly`, `driver_behavior_applied` is `false`, and
  `behavior_multiplier` is `1.0`.

## Driver-behavior formula

```
behavior_multiplier  = clamp(1 + (driver_risk_score - 50)/100, 0.70, 1.50)
personalized_prob    = clamp(modelOnly.calibrated_probability × multiplier, 0, 1)
personalized_level   = thresholds(personalized_prob)   // moderate ≥ 0.05, …
```

Examples: quiz score `20` → ×0.70 (clamped), `50` → ×1.00, `80` → ×1.30,
`100` → ×1.50 (clamped). Risk-level thresholds are pulled from
`training_manifest.json` and applied identically to model and personalized
probabilities.

## Route guidance (`POST /api/risk/route`)

Severity overlay scoring is unchanged. After the severity pass the route
response is enriched with an additional occurrence pass:

- Each segment with a numeric `segment_id` gets an `occurrence` block:
  `{ modelOnly, personalized, driver_meta }`.
- Each route gets a `route.occurrence_summary` with the average modelOnly
  and personalized probabilities/levels and the highest-risk segment for each.
- The response root carries `occurrence_model` with `available`,
  `model_version`, and the sampled-negatives warning.

If Flask is unreachable, occurrence enrichment is skipped silently — severity
scoring (the primary navigation signal) is never blocked.

## Trained-model + rule-fusion coexistence

`api/services/occurrenceRiskService.js` exposes a single entry point —
`predictOccurrenceRisk()` — that:

1. Calls the trained occurrence_beta_v1 model via Flask first.
2. Persists results into `ml.risk_predictions` and (for authenticated calls)
   `app.user_occurrence_risk_predictions`. Persistence failure does **not**
   fail the response.
3. Falls back to the rule-fusion scorer only on 5xx / network failure.
4. Tags the response with `scoring_source: "trained_model" | "rule_fusion"`.

4xx errors (bad input, segment not found) bubble up — they are not silently
hidden behind the rule-based fallback.

## Smoke test

```bash
cd api
node scripts/testOccurrenceRisk.js              # JS helpers (no network needed)
node scripts/testOccurrenceModel.js             # Flask only, direct
node scripts/testOccurrenceModel.js --via-node  # via Node proxy
```

`testOccurrenceRisk.js` covers:
- Rule-fusion baseline (5 cases).
- Trained-model JS-side helpers: risk thresholds, level mapping, and the
  driver-behavior multiplier across risky/safe/no-quiz scenarios.
- Optional network checks against Flask `POST /risk/occurrence/predict` and
  Node `POST /api/risk/occurrence/predict`. These skip cleanly when the
  services aren't reachable (or pass `--skip-network` to skip explicitly).
