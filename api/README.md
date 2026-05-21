# SIARA API Notes

## Police module

The police domain now uses `/api/police/*` routes for officer profile, work-zone selection, live location updates, dashboard data, incidents, alerts, and operation history.

Key implementation notes:

- Officer role support is handled through shared auth middleware with police role arrays instead of admin-only checks.
- First login requires work-zone selection through Wilaya then Commune before normal police mode access.
- Nearby incidents are backed by PostGIS `ST_DWithin` with a 500 meter radius and return `locationRequired=true` when no live officer location exists.
- Police actions such as verify, reject, assign self, request backup, status updates, notes, and alert reads write to `app.police_operation_history`.
- The police SQL migration lives in `api/migrations/20260422_police_module.sql` and adds the new police tables plus incident assignment and verification columns on `app.accident_reports`.

## Local driver quiz explanations

The driver quiz score remains deterministic in Python. The local LLM layer only turns the structured quiz result into a natural-language explanation.

### Ollama setup

Install Ollama, then pull the default free local model:

```bash
ollama pull gemma3:4b
```

Optional stronger model if your hardware allows it:

```bash
ollama pull llama3.1:8b
```

Environment defaults:

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=gemma3:4b
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT_SECONDS=60
OLLAMA_STREAM_READ_TIMEOUT_SECONDS=300
ML_SERVICE_STREAM_TIMEOUT_MS=300000
```

To switch to the stronger model, set:

```env
OLLAMA_MODEL=llama3.1:8b
```

If Ollama is unavailable, the Flask service returns a deterministic template explanation and does not crash.

### Streaming quiz explanations

Use the Node API proxy for the live quiz experience:

```bash
curl -N -X POST http://localhost:5000/api/model/predict/stream \
  -H "Content-Type: application/json" \
  -d '{"dissociative":2,"anxious":3,"risky":2,"angry":2,"high_velocity":4,"distress_reduction":2,"patient":3,"careful":5,"errors":2,"violations":1,"lapses":4}'
```

The Flask service also exposes:

```text
POST /predict/stream
POST /quiz/explanation/stream
```

The stream uses Server-Sent Events:

```text
event: status
data: {"status":"loading_model","message":"Loading local language model..."}

event: chunk
data: {"content":"partial explanation text"}

event: done
data: {"explanation_text":"final text","metadata":{"eval_count":123}}
```

Progress is stage-based rather than an exact percentage: preparing, loading the local model, generating, and finalizing. The final `done` event includes the complete explanation text; save that final text rather than partial chunks.

### Example quiz payload

`POST /api/model/predict`

```json
{
  "dissociative": 2,
  "anxious": 3,
  "risky": 2,
  "angry": 2,
  "high_velocity": 4,
  "distress_reduction": 2,
  "patient": 3,
  "careful": 5,
  "errors": 2,
  "violations": 1,
  "lapses": 4
}
```

### Example response shape

```json
{
  "risk_label": "moderate",
  "risk_percent": 48.75,
  "risk_score": 48.75,
  "explanation_text": "1. Short summary\n...",
  "advice_text": "Your driving profile shows...",
  "class_probabilities": {
    "very_low": 0.01,
    "low": 0.12,
    "moderate": 0.54,
    "elevated": 0.22,
    "high": 0.09,
    "extreme": 0.02
  },
  "xai": {
    "predicted_class_index": 2,
    "base_value": 0.0,
    "shap_per_feature": {
      "lapses": 0.0842
    }
  },
  "quiz_result_data": {
    "overall_risk_label": "moderate",
    "overall_risk_score": 48.75,
    "score_scale": "0-100 percent. This score is computed deterministically by the Python quiz model.",
    "top_risk_factors": [],
    "top_protective_factors": [],
    "questionnaire_sources": [],
    "factor_scores": {},
    "advice_focus": []
  }
}
```

### Local explanation test

Use the Node API proxy:

```bash
curl http://localhost:5000/api/model/quiz/explanation/test
```

Or call Flask directly:

```bash
curl http://localhost:8000/quiz/explanation/test
```
