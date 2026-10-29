-- Repair undo log (run once, before any repair script).
--
-- Every repair first writes each value it is about to change into
-- public.audit_repair_log, then changes it. Nothing is deleted.
-- public.audit_repair_rollback('<repair name>') puts the logged old
-- values back, newest first, and marks those log rows as rolled back.
--
-- Safe to run more than once.

create table if not exists public.audit_repair_log (
  id bigserial primary key,
  repair text not null,
  table_name text not null,
  row_id text not null,
  column_name text not null,
  old_value jsonb,
  new_value jsonb,
  logged_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz
);

create index if not exists audit_repair_log_repair_idx
on public.audit_repair_log (repair, applied_at, rolled_back_at);

-- Only the database owner (SQL editor) uses this table.
alter table public.audit_repair_log enable row level security;

/*
  Applies logged rows for one repair that are not applied yet. Values are
  stored as jsonb and cast back to the column's own type.
*/
create or replace function public.audit_repair_apply(p_repair text)
returns integer
language plpgsql
as $$
declare
  entry record;
  column_type text;
  changed integer := 0;
begin
  for entry in
    select * from public.audit_repair_log
    where repair = p_repair and applied_at is null and rolled_back_at is null
    order by id
  loop
    select data_type into column_type
    from information_schema.columns
    where table_schema = 'public' and table_name = entry.table_name and column_name = entry.column_name;

    if column_type is null then
      raise exception 'Column %.% not found', entry.table_name, entry.column_name;
    end if;

    if column_type = 'jsonb' then
      execute format('update public.%I set %I = $1 where id::text = $2', entry.table_name, entry.column_name)
      using entry.new_value, entry.row_id;
    else
      execute format('update public.%I set %I = ($1 #>> ''{}'')::%s where id::text = $2',
                     entry.table_name, entry.column_name, column_type)
      using entry.new_value, entry.row_id;
    end if;

    update public.audit_repair_log set applied_at = now() where id = entry.id;
    changed := changed + 1;
  end loop;

  return changed;
end;
$$;

create or replace function public.audit_repair_rollback(p_repair text)
returns integer
language plpgsql
as $$
declare
  entry record;
  column_type text;
  restored integer := 0;
begin
  for entry in
    select * from public.audit_repair_log
    where repair = p_repair and applied_at is not null and rolled_back_at is null
    order by id desc
  loop
    select data_type into column_type
    from information_schema.columns
    where table_schema = 'public' and table_name = entry.table_name and column_name = entry.column_name;

    if column_type = 'jsonb' then
      execute format('update public.%I set %I = $1 where id::text = $2', entry.table_name, entry.column_name)
      using entry.old_value, entry.row_id;
    else
      execute format('update public.%I set %I = ($1 #>> ''{}'')::%s where id::text = $2',
                     entry.table_name, entry.column_name, column_type)
      using entry.old_value, entry.row_id;
    end if;

    update public.audit_repair_log set rolled_back_at = now() where id = entry.id;
    restored := restored + 1;
  end loop;

  return restored;
end;
$$;
