begin;

alter table if exists app.report_media
  add column if not exists storage_key text;

alter table if exists app.report_media
  add column if not exists mime_type text;

alter table if exists app.report_media
  add column if not exists file_size integer;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname, con.confdeltype
    from pg_constraint con
    where con.conrelid = 'app.report_media'::regclass
      and con.confrelid = 'app.accident_reports'::regclass
      and con.contype = 'f'
  loop
    if constraint_record.confdeltype <> 'c' then
      execute format(
        'alter table app.report_media drop constraint %I',
        constraint_record.conname
      );
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'app.report_media'::regclass
      and con.confrelid = 'app.accident_reports'::regclass
      and con.contype = 'f'
      and con.confdeltype = 'c'
  ) then
    alter table app.report_media
      add constraint report_media_report_id_fkey
      foreign key (report_id)
      references app.accident_reports (id)
      on delete cascade;
  end if;
end $$;

commit;
