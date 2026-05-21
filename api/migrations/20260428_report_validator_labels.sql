-- Relax the predicted_label check on app.report_ml_predictions to support
-- the new SIARA report-validator labels.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'report_ml_predictions_predicted_label_check'
      and conrelid = 'app.report_ml_predictions'::regclass
  ) then
    alter table app.report_ml_predictions
      drop constraint report_ml_predictions_predicted_label_check;
  end if;

  alter table app.report_ml_predictions
    add constraint report_ml_predictions_predicted_label_check
    check (
      predicted_label is null
      or predicted_label in (
        'real',
        'spam',
        'out_of_context',
        'invalid_location',
        'suspicious'
      )
    );
end $$;
