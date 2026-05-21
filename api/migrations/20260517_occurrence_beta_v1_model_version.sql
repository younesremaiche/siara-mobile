-- Migration: 20260517_occurrence_beta_v1_model_version
-- Purpose: Register the trained accident-occurrence model 'occurrence_beta_v1'
-- in ml.model_versions and mark older occurrence models inactive.
-- IMPORTANT: only rows with target_type = 'accident_occurrence' are deactivated.
-- Severity / driver-quiz / spam / anomaly models are NOT touched.

DO $$
DECLARE
  v_existing_id uuid;
BEGIN
  SELECT id
    INTO v_existing_id
    FROM ml.model_versions
   WHERE model_name = 'occurrence_beta_v1'
     AND target_type = 'accident_occurrence'
   ORDER BY created_at DESC
   LIMIT 1;

  -- Deactivate any other active occurrence model first. Scoped to occurrence
  -- only so the danger-zone / severity active row stays intact.
  UPDATE ml.model_versions
     SET is_active = false,
         status = CASE WHEN status = 'active' THEN 'deprecated' ELSE status END
   WHERE target_type = 'accident_occurrence'
     AND (v_existing_id IS NULL OR id <> v_existing_id);

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
      'occurrence_beta_v1',
      'accident_occurrence',
      'lightgbm',
      'occurrence_beta_v1_23_features',
      'US_Accidents + OSM/weather cache',
      DATE '2016-06-21',
      DATE '2023-03-31',
      'isotonic',
      jsonb_build_object(
        'roc_auc', 0.7228047902601904,
        'pr_auc', 0.22550758817917194,
        'brier', 0.09888798963905225,
        'log_loss', 0.33199845506898507,
        'precision_at_top_1pct', 0.40779824718297264,
        'precision_at_top_5pct', 0.29814708828158537,
        'precision_at_top_10pct', 0.25128324361060933,
        'recall_at_top_1pct', 0.03430222061743997,
        'recall_at_top_5pct', 0.12539868809050972,
        'recall_at_top_10pct', 0.21137991213817175,
        'confusion_matrix_at_threshold',
          jsonb_build_object(
            'threshold', 0.2,
            'tn', 419132,
            'fp', 73530,
            'fn', 44002,
            'tp', 22466
          ),
        'weather_available_rate', 0.7407442937785196,
        'weather_cache_hit_rate', 0.7410540501805372
      ),
      jsonb_build_object(
        'time_window_hours', 1,
        'decision_threshold', 0.2,
        'risk_level_thresholds',
          jsonb_build_object(
            'low', 0.0,
            'moderate', 0.05,
            'high', 0.2,
            'critical', 0.5
          ),
        'explanation_source', 'shap',
        'used_shap', true,
        'feature_count', 23,
        'training_prevalence', 0.19402350955406053,
        'training_prevalence_note',
          'Sampled training prevalence is artificial because of negative sampling. Calibrated probabilities reflect this sampled prior and should be interpreted as relative operational risk until recalibrated against realistic exposure.'
      ),
      'api/occurrence-model/occurrence_betav1_final',
      'Trained accident-occurrence model. LightGBM + isotonic calibration. Trained on US Accidents 2016-2023 with sampled negatives; use as relative operational risk in Algeria deployment until locally recalibrated.',
      'deployed',
      true,
      now()
    );
  ELSE
    UPDATE ml.model_versions
       SET status = 'deployed',
           is_active = true,
           algorithm = 'lightgbm',
           calibration_method = 'isotonic',
           artifact_path = 'api/occurrence-model/occurrence_betav1_final'
     WHERE id = v_existing_id;
  END IF;
END $$;
