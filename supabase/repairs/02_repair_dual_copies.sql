-- Repair AUDIT-003: copy Master bookings' column values into the hidden
-- copies in raw_data->rentalFormDetails, where they differ.
--
-- Deterministic: every edit path writes the column, and only the Master
-- import writes the hidden copy, so the column is always the newer value.
-- Only keys the record already has are touched; a blank column never
-- overwrites anything. Requires 00_repair_log.sql. Undo:
--   select public.audit_repair_rollback('003-dual-copies');

begin;

create or replace function pg_temp.mirrored_details(b public.bookings)
returns jsonb language plpgsql as $$
declare
  details jsonb := b.raw_data->'rentalFormDetails';
  pair text[];
  column_value text;
begin
  foreach pair slice 1 in array array[
    ['organizationName', b.organization_name], ['contactName', b.contact_name],
    ['email', b.email], ['phone', b.phone],
    ['startDate', b.start_date::text], ['endDate', b.end_date::text],
    ['retreatType', b.retreat_type], ['status', b.status],
    ['approxTotalGuests', b.attendee_count], ['numberOfNights', b.nights],
    ['numberOfMeals', b.meal_count], ['depositAmount', b.deposit],
    ['adultRateQuoted', b.guest_rate], ['minimumGuarantee', b.min_paying_guests],
    ['maximumGuarantee', b.max_paying_guests], ['notes', b.notes]
  ] loop
    column_value := nullif(trim(coalesce(pair[2], '')), '');
    if column_value is not null and details ? pair[1]
       and (details->>pair[1]) is distinct from column_value then
      details := jsonb_set(details, array[pair[1]], to_jsonb(column_value));
    end if;
  end loop;
  return details;
end $$;

select count(*) as master_rows_to_repair_before
from public.bookings b
where b.source_type ilike 'master%' and jsonb_typeof(b.raw_data->'rentalFormDetails') = 'object'
  and pg_temp.mirrored_details(b) is distinct from b.raw_data->'rentalFormDetails';

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '003-dual-copies', 'bookings', b.id, 'raw_data', b.raw_data,
       jsonb_set(b.raw_data, '{rentalFormDetails}', pg_temp.mirrored_details(b))
from public.bookings b
where b.source_type ilike 'master%' and jsonb_typeof(b.raw_data->'rentalFormDetails') = 'object'
  and pg_temp.mirrored_details(b) is distinct from b.raw_data->'rentalFormDetails';

select public.audit_repair_apply('003-dual-copies') as rows_changed;

select count(*) as master_rows_to_repair_after
from public.bookings b
where b.source_type ilike 'master%' and jsonb_typeof(b.raw_data->'rentalFormDetails') = 'object'
  and pg_temp.mirrored_details(b) is distinct from b.raw_data->'rentalFormDetails';

commit;
