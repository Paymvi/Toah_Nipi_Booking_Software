-- Keep booking change history when bookings are deleted or restored.
-- Review before running; safe to run more than once. Run in the SQL editor,
-- never `db push`. Requires 20261113000100_staff_app.sql.
--
-- Why: booking_change_log.booking_id referenced bookings ON DELETE CASCADE.
-- A Full Replace restore deletes every booking and inserts them again with
-- the same ids, so the cascade erased all history the staff app shows.
--
-- What this changes
--   1. Drops every foreign key from booking_change_log to bookings. The log
--      keeps the booking id as plain text, so history survives a delete and
--      lines up again when a restore brings the booking back with its id.
--      History of a deleted booking stays readable by office accounts only
--      (the existing is_active_staff() policy); the staff app shows history
--      only for bookings that exist.
--   2. staff_app_restore_change_log(rows): admin-only, insert-only restore of
--      history rows from a backup file. A row already present (same booking,
--      time, field, actor and values) is skipped, so importing the same
--      backup twice adds nothing. A row keeps its original id when that id
--      is free.
--
-- The 20261113000100 file is left as it was (it may already have run); this
-- file brings both fresh and existing databases to the same schema.
--
-- Rollback (only if no history row points at a missing booking):
--   drop function if exists public.staff_app_restore_change_log(jsonb);
--   alter table public.booking_change_log add constraint booking_change_log_booking_id_fkey
--     foreign key (booking_id) references public.bookings (id) on delete cascade;

do $$
declare
  v_constraint text;
begin
  if to_regclass('public.booking_change_log') is null then
    raise exception 'Run supabase/migrations/20261113000100_staff_app.sql first.';
  end if;

  for v_constraint in
    select conname from pg_constraint
    where conrelid = 'public.booking_change_log'::regclass
      and contype = 'f'
      and confrelid = 'public.bookings'::regclass
  loop
    execute format('alter table public.booking_change_log drop constraint %I', v_constraint);
  end loop;
end $$;

create or replace function public.staff_app_restore_change_log(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_inserted integer := 0;
  v_count integer;
  v_seq text := pg_get_serial_sequence('public.booking_change_log', 'id');
  v_max bigint;
begin
  if not public.is_staff_admin() then
    raise exception 'Only administrators can restore booking change history.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Expected a list of change history rows.' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total > 1000 then
    raise exception 'Send at most 1,000 change history rows at a time.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(btrim(e ->> 'booking_id'), '') = ''
       or coalesce(btrim(e ->> 'field'), '') = ''
       or coalesce(e ->> 'changed_at', '') = ''
  ) then
    raise exception 'A change history row is missing its booking, field or time.' using errcode = '22023';
  end if;

  -- Saves write history from a trigger; keep them out while ids and duplicates are decided.
  lock table public.booking_change_log in share row exclusive mode;

  drop table if exists pg_temp.change_log_incoming;
  create temporary table pg_temp.change_log_incoming on commit drop as
  select distinct on (booking_id, changed_at, field, actor_id, actor_name, old_value, new_value)
         id, booking_id, changed_at, actor_id, actor_name, field, old_value, new_value
  from (
    select case when (e ->> 'id') ~ '^\d{1,18}$' then (e ->> 'id')::bigint end as id,
           e ->> 'booking_id' as booking_id,
           (e ->> 'changed_at')::timestamptz as changed_at,
           nullif(e ->> 'actor_id', '')::uuid as actor_id,
           e ->> 'actor_name' as actor_name,
           e ->> 'field' as field,
           -- Stored values are never JSON null (jsonb_strip_nulls), so JSON null means "no value".
           nullif(e -> 'old_value', 'null'::jsonb) as old_value,
           nullif(e -> 'new_value', 'null'::jsonb) as new_value
    from jsonb_array_elements(p_rows) e
  ) parsed
  order by booking_id, changed_at, field, actor_id, actor_name, old_value, new_value, id;

  delete from pg_temp.change_log_incoming n
  using public.booking_change_log l
  where l.booking_id = n.booking_id
    and l.changed_at = n.changed_at
    and l.field = n.field
    and l.actor_id is not distinct from n.actor_id
    and l.actor_name is not distinct from n.actor_name
    and l.old_value is not distinct from n.old_value
    and l.new_value is not distinct from n.new_value;

  -- Original id when it is free; otherwise a new one.
  insert into public.booking_change_log (id, booking_id, changed_at, actor_id, actor_name, field, old_value, new_value)
  overriding system value
  select distinct on (n.id) n.id, n.booking_id, n.changed_at, n.actor_id, n.actor_name, n.field, n.old_value, n.new_value
  from pg_temp.change_log_incoming n
  where n.id is not null
    and not exists (select 1 from public.booking_change_log l where l.id = n.id)
  order by n.id;
  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  insert into public.booking_change_log (booking_id, changed_at, actor_id, actor_name, field, old_value, new_value)
  select n.booking_id, n.changed_at, n.actor_id, n.actor_name, n.field, n.old_value, n.new_value
  from pg_temp.change_log_incoming n
  where not exists (
    select 1 from public.booking_change_log l
    where l.booking_id = n.booking_id
      and l.changed_at = n.changed_at
      and l.field = n.field
      and l.actor_id is not distinct from n.actor_id
      and l.actor_name is not distinct from n.actor_name
      and l.old_value is not distinct from n.old_value
      and l.new_value is not distinct from n.new_value
  );
  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Ids inserted by hand must never be handed out again by the identity sequence.
  select max(id) into v_max from public.booking_change_log;
  if v_max is not null and v_max >= nextval(v_seq) then
    perform setval(v_seq, v_max);
  end if;

  return jsonb_build_object('inserted', v_inserted, 'alreadyPresent', v_total - v_inserted);
end;
$$;

revoke all on function public.staff_app_restore_change_log(jsonb) from public, anon;
grant execute on function public.staff_app_restore_change_log(jsonb) to authenticated;

-- Verify (read-only):
--   select conname from pg_constraint where conrelid = 'public.booking_change_log'::regclass and contype = 'f';  -- no rows
