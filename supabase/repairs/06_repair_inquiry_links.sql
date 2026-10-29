-- Repair AUDIT-004 / AUDIT-008: website inquiries left "pending" although
-- exactly one booking records that inquiry as its source. They are marked
-- converted to that booking. Inquiries with two or more such bookings, and
-- inquiries linked to a booking that does not name them, are NOT changed;
-- they are in the review lists of 01_diagnostics.sql.
-- Undo: select public.audit_repair_rollback('004-inquiry-links');

begin;

create temporary table repair_004 on commit drop as
select gi.id::text as inquiry_id, min(b.id) as booking_id
from public.guest_inquiries gi
join public.bookings b
  on b.raw_data->'rentalFormDetails'->>'sourceInquiryId' = gi.id::text
 and b.raw_data->'rentalFormDetails'->>'sourceInquirySheet' = 'Guest Web Form'
where gi.status = 'pending'
group by gi.id
having count(*) = 1;

select count(*) as inquiries_to_mark from repair_004;

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '004-inquiry-links', 'guest_inquiries', gi.id::text, 'converted_booking_id',
       to_jsonb(gi.converted_booking_id), to_jsonb(r.booking_id)
from repair_004 r join public.guest_inquiries gi on gi.id::text = r.inquiry_id
union all
select '004-inquiry-links', 'guest_inquiries', gi.id::text, 'status', to_jsonb(gi.status), to_jsonb('converted'::text)
from repair_004 r join public.guest_inquiries gi on gi.id::text = r.inquiry_id;

select public.audit_repair_apply('004-inquiry-links') as values_changed;

commit;
