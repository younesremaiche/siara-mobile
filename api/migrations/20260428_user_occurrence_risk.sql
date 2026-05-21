-- SIARA accident occurrence-risk (prototype)
-- Global predictions stay in ml.risk_predictions.
-- Personalized predictions are private and stored in app.user_occurrence_risk_predictions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_existing_id uuid;
BEGIN
  SELECT id
    INTO v_existing_id
    FROM ml.model_versions
   WHERE model_name = 'siara_occurrence_rule_fusion'
     AND target_type = 'accident_occurrence'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO ml.model_versions (
      model_name,
      target_type,
      algorithm,
      feature_set_name,
      data_source,
      training_start_date,
      training_end_date,
      calibration_method,
      metrics_json,
      training_params_json,
      artifact_path,
      notes,
      status,
      is_active,
      created_at
    )
    VALUES (
      'siara_occurrence_rule_fusion',
      'accident_occurrence',
      'rule_fusion',
      'segment_time_context_driver_optional',
      'SIARA_DB',
      CURRENT_DATE,
      CURRENT_DATE,
      'not_calibrated',
      '{}'::jsonb,
      '{}'::jsonb,
      'internal://rule-fusion/occurrence_v1',
      'Prototype occurrence model. Global road risk excludes private driver behavior. Personalized risk is stored separately.',
      'active',
      true,
      now()
    );
  ELSE
    UPDATE ml.model_versions
       SET status = 'active',
           is_active = true,
           notes = COALESCE(
             notes,
             'Prototype occurrence model. Global road risk excludes private driver behavior. Personalized risk is stored separately.'
           )
     WHERE id = v_existing_id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.user_occurrence_risk_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  road_segment_id bigint NOT NULL
    REFERENCES gis.road_segments(id) ON DELETE CASCADE,

  global_prediction_id bigint
    REFERENCES ml.risk_predictions(id) ON DELETE SET NULL,

  time_bucket timestamptz NOT NULL,

  global_occurrence_score numeric(6, 4) NOT NULL,
  personalized_occurrence_score numeric(6, 4) NOT NULL,

  global_risk_level text NOT NULL,
  personalized_risk_level text NOT NULL,

  driver_risk_score numeric(6, 2),
  driver_result_label text,
  driver_category_scores jsonb NOT NULL DEFAULT '{}'::jsonb,

  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,

  model_version text NOT NULL DEFAULT 'occurrence_v1_rule_fusion',

  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_user_occurrence_risk_user_segment_bucket_model'
       AND conrelid = 'app.user_occurrence_risk_predictions'::regclass
  ) THEN
    ALTER TABLE app.user_occurrence_risk_predictions
      ADD CONSTRAINT uq_user_occurrence_risk_user_segment_bucket_model
      UNIQUE (user_id, road_segment_id, time_bucket, model_version);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_occurrence_risk_user_id_idx
  ON app.user_occurrence_risk_predictions (user_id, time_bucket DESC);

CREATE INDEX IF NOT EXISTS user_occurrence_risk_segment_idx
  ON app.user_occurrence_risk_predictions (road_segment_id, time_bucket DESC);