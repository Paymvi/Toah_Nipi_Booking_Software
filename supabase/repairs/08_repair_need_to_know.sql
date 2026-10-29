-- Repair AUDIT-040 (Q-037 A): staff bookings used to copy their meal notes
-- into need_to_know. Where need_to_know is exactly the meal notes still kept
-- in rentalFormDetails.mealNotes, it is cleared. The meal notes are not
-- lost: they stay in rentalFormDetails and are shown with the meals.
-- Undo: select public.audit_repair_rollback('040-need-to-know');

begin;

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '040-need-to-know', 'bookings', id, 'need_to_know', to_jsonb(need_to_know), to_jsonb(''::text)
from public.bookings
where source_type = 'Staff Booking'
  and nullif(trim(need_to_know), '') is not null
  and need_to_know = raw_data->'rentalFormDetails'->>'mealNotes';

select public.audit_repair_apply('040-need-to-know') as rows_changed;

commit;
