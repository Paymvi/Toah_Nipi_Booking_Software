-- Repair AUDIT-032 (Q-010 A): the retired "Imported" status.
-- Master and staff bookings are bookings (Q-007, Q-015) -> "Confirmed".
-- Guest Group Inquiry records -> "Inquiry". Anything else is listed for
-- review and not changed. Undo:
--   select public.audit_repair_rollback('032-imported-status');

begin;

-- Review list (not changed)
select id, organization_name, source_type from public.bookings
where status = 'Imported'
  and not (source_type ilike 'master%' or source_type = 'Staff Booking' or source_type ilike 'guest group inquiry%');

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '032-imported-status', 'bookings', id, 'status', to_jsonb(status),
       to_jsonb(case when source_type ilike 'guest group inquiry%' then 'Inquiry' else 'Confirmed' end)
from public.bookings
where status = 'Imported'
  and (source_type ilike 'master%' or source_type = 'Staff Booking' or source_type ilike 'guest group inquiry%');

select public.audit_repair_apply('032-imported-status') as rows_changed;

commit;
