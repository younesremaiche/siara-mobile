from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from .calibrate import risk_level_from_thresholds
from .features import FeatureProcessor


class SiaraInferenceEngine:
    def __init__(self, artifact_dir: str | Path, logger: logging.Logger | None = None) -> None:
        self.artifact_dir = Path(artifact_dir)
        self.logger = logger or logging.getLogger(__name__)

        self.raw_model = joblib.load(self.artifact_dir / "model_raw.joblib")
        self.cal_model = joblib.load(self.artifact_dir / "model_calibrated.joblib")
        self.metadata = json.loads((self.artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        self.processor = FeatureProcessor.from_metadata(self.metadata, self.logger)

    def predict_rows(
        self,
        rows: list[dict[str, Any]],
        mode: str | None = None,
    ) -> list[dict[str, Any]]:
        if not rows:
            return []

        selected_mode = mode or self.metadata["deployment"]["algeria_mode_default"]
        frame = pd.DataFrame(rows)
        x, _, quality = self.processor.transform(frame, include_label=False)
        score = self.cal_model.predict_proba(x)[:, 1]

        thresholds = self.metadata["thresholds"]
        validated_on_target = bool(self.metadata["calibration"]["validated_on_target_domain"])
        is_prob = bool(validated_on_target and selected_mode == "severity_probability")
        domain_warning = self.metadata["deployment"]["domain_warning"] if not is_prob else None

        outputs = []
        for p in score:
            danger_percent = 100.0 * float(p)
            outputs.append(
                {
                    "model_score": float(p),
                    "danger_percent": danger_percent,
                    "risk_level": risk_level_from_thresholds(danger_percent, thresholds),
                    "is_calibrated_probability": is_prob,
                    "domain_warning": domain_warning,
                    "mode": selected_mode,
                }
            )

        if quality["missing_columns_filled"] or quality["unknown_category_counts"]:
            self.logger.warning("Inference preprocessing quality notes: %s", quality)

        return outputs

    def predict_one(self, row: dict[str, Any], mode: str | None = None) -> dict[str, Any]:
        return self.predict_rows([row], mode=mode)[0]


def _load_rows_from_args(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.row_json:
        parsed = json.loads(args.row_json)
        return [parsed]

    if args.input_json:
        parsed = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
        if isinstance(parsed, dict):
            return [parsed]
        if isinstance(parsed, list):
            return parsed
        raise ValueError("--input-json must contain an object or list of objects.")

    raise ValueError("Provide --row-json or --input-json.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Siara inference using saved artifacts.")
    parser.add_argument("--artifact-dir", required=True, help="Artifact directory containing model + metadata files.")
    parser.add_argument("--row-json", default="", help="Single-row JSON payload.")
    parser.add_argument("--input-json", default="", help="Path to JSON file containing one row or list of rows.")
    parser.add_argument(
        "--mode",
        default="relative_risk",
        choices=["relative_risk", "severity_probability"],
        help="Output interpretation mode.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    engine = SiaraInferenceEngine(args.artifact_dir)
    rows = _load_rows_from_args(args)
    preds = engine.predict_rows(rows, mode=args.mode)
    print(json.dumps(preds, indent=2))


if __name__ == "__main__":
    main()

