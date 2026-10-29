-- READ-ONLY diagnostics. Nothing here changes data.
-- Run each block in the Supabase SQL editor and keep the results.
-- Numbers refer to the Part C checks (V-xxx) in AUDIT_QUESTIONS_ANSWERED.md
-- and to the repair scripts in this folder.

-- V-001 / V-021: bookings columns, types and defaults
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'bookings'
order by ordinal_position;

-- V-002 / V-021: every table and column the app uses outside bookings
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('guest_inquiries', 'portal_checklist_items', 'portal_documents', 'staff_profiles')
order by table_name, ordinal_position;

-- V-002: foreign keys that point at bookings, and what happens on delete
select con.conrelid::regclass as child_table, con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.contype = 'f' and con.confrelid = 'public.bookings'::regclass;

-- V-003: access rules (RLS) on every public table, and storage rules
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- V-003 / Q-023: which staff accounts have which role
select role, is_active, count(*) from public.staff_profiles group by role, is_active order by role;

-- Helper functions the migrations rely on (must all exist)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('set_updated_at', 'current_staff_role', 'is_active_staff', 'can_manage_bookings', 'is_staff_admin');

-- AUDIT-045: the updated_at trigger the conflict check relies on
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.bookings'::regclass and not tgisinternal;

-- V-004: guest_inquiries.submitted_at default
select column_default from information_schema.columns
where table_schema = 'public' and table_name = 'guest_inquiries' and column_name = 'submitted_at';

-- V-018: unique indexes on the portal tables (a unique (booking_id, item_id)
-- index would block the intentional repeats Q-018 allows; report it)
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('portal_checklist_items', 'portal_documents');

-- V-008 / V-017: functions the guest portal may use (look for writes to bookings)
select proname, prosecdef as security_definer, pg_get_function_identity_arguments(oid) as args
from pg_proc where pronamespace = 'public'::regnamespace order by proname;

-- V-009 / repair 02: Master bookings whose hidden copy differs from the column
select id, organization_name,
  email is distinct from raw_data->'rentalFormDetails'->>'email' as email_differs,
  contact_name is distinct from raw_data->'rentalFormDetails'->>'contactName' as contact_differs,
  nights is distinct from raw_data->'rentalFormDetails'->>'numberOfNights' as nights_differs,
  attendee_count is distinct from raw_data->'rentalFormDetails'->>'approxTotalGuests' as guests_differs
from public.bookings
where source_type ilike 'master%'
  and raw_data ? 'rentalFormDetails'
  and (
    (nullif(trim(email), '') is not null and email is distinct from raw_data->'rentalFormDetails'->>'email')
    or (nullif(trim(contact_name), '') is not null and contact_name is distinct from raw_data->'rentalFormDetails'->>'contactName')
    or (nullif(trim(nights), '') is not null and nights is distinct from raw_data->'rentalFormDetails'->>'numberOfNights')
    or (nullif(trim(attendee_count), '') is not null and attendee_count is distinct from raw_data->'rentalFormDetails'->>'approxTotalGuests')
  );

-- V-010 / repair 07: status and waitlist disagree, or status "Imported"
select id, organization_name, source_type, status, waitlist from public.bookings
where status = 'Imported' or ((waitlist = 'Yes') <> (status ilike '%wait%'));

-- V-011 / repair 03: activities stored as JSON-like text
select id, organization_name, left(activities, 80) as activities
from public.bookings where activities ~ '^\s*\[';

-- V-012: records still holding raw-only keys (now restored by name)
select count(*) filter (where raw_data ? 'inquiryDisposition') as inquiry_disposition,
       count(*) filter (where raw_data ? 'facilities') as facilities,
       count(*) filter (where raw_data ? 'linenPieces') as linen_pieces
from public.bookings;

-- V-013: was a Replace restore ever run? Many rows created in the same minute
select date_trunc('minute', created_at) as minute, count(*)
from public.bookings group by 1 having count(*) > 20 order by 2 desc limit 10;

-- V-013: portal rows whose booking no longer exists (only if the tables exist)
-- select 'tasks' as kind, count(*) from public.portal_checklist_items p
--   where not exists (select 1 from public.bookings b where b.id = p.booking_id)
-- union all
-- select 'documents', count(*) from public.portal_documents p
--   where not exists (select 1 from public.bookings b where b.id = p.booking_id);

-- V-014 / repair 06: website inquiries left pending although a booking says
-- it came from them
select gi.id, gi.organization_name, gi.status, b.id as booking_id, b.organization_name as booking_name
from public.guest_inquiries gi
join public.bookings b
  on b.raw_data->'rentalFormDetails'->>'sourceInquiryId' = gi.id::text
 and b.raw_data->'rentalFormDetails'->>'sourceInquirySheet' = 'Guest Web Form'
where gi.status = 'pending';

-- V-014 (review only, never repaired automatically): inquiries marked
-- converted to a booking that does not record that inquiry as its source
select gi.id, gi.organization_name, gi.converted_booking_id, b.organization_name as linked_booking,
       b.raw_data->'rentalFormDetails'->>'sourceInquiryId' as booking_says_source
from public.guest_inquiries gi
left join public.bookings b on b.id = gi.converted_booking_id::text
where gi.status = 'converted'
  and (b.id is null or b.raw_data->'rentalFormDetails'->>'sourceInquiryId' is distinct from gi.id::text);

-- V-016 / repair 05: guest-group inquiry dates one day before the sheet's date
select id, organization_name, submitted_at, raw_data->'rawSpreadsheetData'->>'Date' as sheet_date
from public.bookings
where source_type ilike 'guest group inquiry%'
  and raw_data->'rawSpreadsheetData'->>'Date' ~ '^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$'
  and (submitted_at at time zone 'UTC')::date
      = (left(raw_data->'rawSpreadsheetData'->>'Date', 10))::date - 1;

-- V-019 (Q-040: leave them): test bookings made with Fill Test Data
select id, created_at from public.bookings where organization_name = 'Test Community Church';

-- V-020 (Q-026 kept the loose rule; for information): deposit text values
select deposit_received, count(*) from public.bookings
where source_type ilike 'master%' group by 1 order by 2 desc;

-- Repair 04 (review list): staff bookings whose lodging text lost room or
-- camping detail. Fix by opening the booking's Housing tab and saving.
select id, organization_name, buildings_rooms
from public.bookings
where source_type = 'Staff Booking'
  and (
    (raw_data->'rentalFormDetails' ?| array['lodgingCampingTent', 'lodgingCampingRV']
      and coalesce(raw_data->'rentalFormDetails'->>'lodgingCampingTent', '') || coalesce(raw_data->'rentalFormDetails'->>'lodgingCampingRV', '') <> ''
      and buildings_rooms not ilike '%camping%')
  );
