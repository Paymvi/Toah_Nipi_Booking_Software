-- Repair AUDIT-013 (Q-032 A): dates read one day early from Excel.
--
-- Evidence per record, never a blanket shift. A record is changed only when
-- the sheet cell saved with it (rawSpreadsheetData) is an Excel date at UTC
-- midnight AND the stored date is exactly one day before it. Rows imported
-- on a computer outside U.S. time zones, dates typed as text, and rows
-- edited since all fail that test and are left alone.
-- Undo:
--   select public.audit_repair_rollback('013-inquiry-dates');
--   select public.audit_repair_rollback('013-archive-dates');

begin;

-- Guest Group Inquiry "Date" (stored as submitted_at at 12:00 UTC)
insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '013-inquiry-dates', 'bookings', id, 'submitted_at', to_jsonb(submitted_at),
       to_jsonb((left(raw_data->'rawSpreadsheetData'->>'Date', 10) || 'T12:00:00Z')::timestamptz)
from public.bookings
where source_type ilike 'guest group inquiry%'
  and raw_data->'rawSpreadsheetData'->>'Date' ~ '^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$'
  and (submitted_at at time zone 'UTC')::date
      = (left(raw_data->'rawSpreadsheetData'->>'Date', 10))::date - 1;

select public.audit_repair_apply('013-inquiry-dates') as inquiry_rows_changed;

-- Archive "Visit Date" (start_date, end_date, archive_visit_date)
create temporary table repair_013_archive on commit drop as
select id, start_date, end_date, archive_visit_date,
       (left(raw_data->'rawSpreadsheetData'->>'Visit Date', 10))::date as sheet_date
from public.bookings
where source_type = 'Archive'
  and raw_data->'rawSpreadsheetData'->>'Visit Date' ~ '^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$'
  and start_date = (left(raw_data->'rawSpreadsheetData'->>'Visit Date', 10))::date - 1;

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '013-archive-dates', 'bookings', id, 'start_date', to_jsonb(start_date), to_jsonb(sheet_date)
from repair_013_archive
union all
select '013-archive-dates', 'bookings', id, 'end_date', to_jsonb(end_date), to_jsonb(sheet_date)
from repair_013_archive where end_date = sheet_date - 1
union all
select '013-archive-dates', 'bookings', id, 'archive_visit_date', to_jsonb(archive_visit_date), to_jsonb(sheet_date::text)
from repair_013_archive where archive_visit_date = (sheet_date - 1)::text;

select public.audit_repair_apply('013-archive-dates') as archive_values_changed;

commit;
