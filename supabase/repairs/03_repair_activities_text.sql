-- Repair AUDIT-002: turn activities stored as JSON text back into the
-- readable summary the app now writes ("2026-09-18 19:00 - Fire pit; ...").
-- Uses the structured rows in rentalFormDetails.activities when present,
-- else the rows in the text itself. Text that is not a JSON list of
-- activity objects is left alone. Undo:
--   select public.audit_repair_rollback('002-activities-text');

begin;

create or replace function pg_temp.try_jsonb(value text) returns jsonb
language plpgsql as $$ begin return value::jsonb; exception when others then return null; end $$;

create or replace function pg_temp.activities_summary(rows jsonb) returns text
language sql as $$
  select coalesce(string_agg(
    concat_ws(' - ',
      nullif(trim(concat_ws(' ', nullif(trim(r->>'date'), ''), nullif(trim(r->>'time'), ''))), ''),
      nullif(trim(r->>'activity'), '')),
    '; ' order by ord), '')
  from jsonb_array_elements(rows) with ordinality as e(r, ord)
  where coalesce(r->>'date', '') <> '' or coalesce(r->>'time', '') <> '' or coalesce(r->>'activity', '') <> ''
$$;

create temporary table repair_002 on commit drop as
select b.id, b.activities as old_text,
       pg_temp.activities_summary(
         case when jsonb_typeof(b.raw_data->'rentalFormDetails'->'activities') = 'array'
                   and jsonb_array_length(b.raw_data->'rentalFormDetails'->'activities') > 0
              then b.raw_data->'rentalFormDetails'->'activities'
              else pg_temp.try_jsonb(b.activities) end) as new_text
from public.bookings b
where b.activities ~ '^\s*\['
  and jsonb_typeof(pg_temp.try_jsonb(b.activities)) = 'array'
  and not exists (
    select 1 from jsonb_array_elements(pg_temp.try_jsonb(b.activities)) r
    where jsonb_typeof(r) <> 'object' or not (r ? 'activity' or r ? 'date' or r ? 'time'));

select count(*) as rows_to_repair from repair_002;

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '002-activities-text', 'bookings', id, 'activities', to_jsonb(old_text), to_jsonb(new_text)
from repair_002 where new_text is distinct from old_text;

select public.audit_repair_apply('002-activities-text') as rows_changed;

select count(*) as json_like_rows_remaining from public.bookings where activities ~ '^\s*\[';

commit;
