do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'app'
      and table_name = 'report_ml_predictions'
      and column_name = 'predicted_label'
  ) and not exists (
    select 1
    from app.report_ml_predictions
    where predicted_label is null
  ) then
    alter table app.report_ml_predictions
      alter column predicted_label set not null;
  end if;
end $$;
