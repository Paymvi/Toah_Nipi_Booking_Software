-- Guest portal: cancelled bookings, private booking status, two small fixes.
-- Review before running; safe to run more than once. Nothing is deleted.
--
-- Prerequisite: 20261107000100_portal_signing.sql (get_portal_record below is
-- its version, which reads portal_signatures). The check at the top stops
-- this file if signing has not been installed. If the signing migration is
-- ever run again AFTER this file, run this file again too, or the portal
-- goes back to showing the booking status and has no cancelled page.
--
-- What changes (INTEGRATION_DATA_INTEGRITY_AUDIT.md):
--   * A cancelled booking's link opens a "this booking was cancelled" page
--     instead of the checklist (decision, 2026-11-20). get_portal_record
--     returns only the group name, dates and office email for it, and every
--     guest write (mark ready, answers, uploads) is refused. Cancelled uses
--     the staff app's rule (isClearlyCancelled): status contains "cancel",
--     or a real cancellation date without a later reinstatement.
--   * Guests no longer receive the internal booking status (decision,
--     2026-11-20): get_portal_record drops the 'status' field.
--   * INT-11: a booking with a departure date but no arrival date shows that
--     date instead of nothing.
--   * INT-09: a guest answer that changed nothing (the task was already
--     confirmed) returns null, so the portal says it was not saved.
--
-- Rollback: run 20261107000100_portal_signing.sql's get_portal_record again and
-- the live function bodies in docs/audit/ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql,
-- then: drop function public.portal_booking_is_cancelled(text, text, jsonb);

do $$
begin
  if to_regclass('public.portal_signatures') is null
     or to_regprocedure('public.portal_signing_enabled_for(text)') is null then
    raise exception 'Run 20261107000100_portal_signing.sql first.';
  end if;
end
$$;

-- Same rule as isClearlyCancelled in src/utils/bookingClassification.js.
create or replace function public.portal_booking_is_cancelled(
  p_status text, p_date_of_cancellation text, p_raw_data jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_status, '') ~* 'cancel'
      or (
        btrim(coalesce(p_date_of_cancellation, '')) <> ''
        and btrim(p_date_of_cancellation) !~* '^(n/?a|none|unknown|tbd|\?|[-–—])$'
        and coalesce(p_raw_data -> 'rentalFormDetails' ->> 'reinstatedAt', '') = ''
      )
$$;

revoke all on function public.portal_booking_is_cancelled(text, text, jsonb) from public, anon, authenticated;

-- ---------- Portal record ----------
create or replace function public.get_portal_record(p_portal_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_checklist_items jsonb;
  v_documents jsonb;
  v_signed_documents jsonb;
  v_signing_on boolean;
  v_retreat_dates text;
  v_guest_count text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return null;
  end if;

  select *
  into v_booking
  from public.bookings
  where portal_token = trim(p_portal_token)
  limit 1;

  if not found then
    return null;
  end if;

  if v_booking.start_date is null and v_booking.end_date is null then
    v_retreat_dates := 'Dates not set';
  elsif v_booking.start_date is null then
    v_retreat_dates := to_char(v_booking.end_date, 'Mon FMDD, YYYY');
  elsif v_booking.end_date is null or v_booking.start_date = v_booking.end_date then
    v_retreat_dates := to_char(v_booking.start_date, 'Mon FMDD, YYYY');
  elsif date_trunc('month', v_booking.start_date) = date_trunc('month', v_booking.end_date)
    and date_trunc('year', v_booking.start_date) = date_trunc('year', v_booking.end_date) then
    v_retreat_dates :=
      to_char(v_booking.start_date, 'Mon FMDD') ||
      '–' ||
      to_char(v_booking.end_date, 'FMDD, YYYY');
  else
    v_retreat_dates :=
      to_char(v_booking.start_date, 'Mon FMDD, YYYY') ||
      '–' ||
      to_char(v_booking.end_date, 'Mon FMDD, YYYY');
  end if;

  -- Cancelled: enough for the "this booking was cancelled" page, nothing else.
  if public.portal_booking_is_cancelled(v_booking.status, v_booking.date_of_cancellation, v_booking.raw_data) then
    return jsonb_build_object(
      'cancelled', true,
      'groupName', coalesce(nullif(v_booking.organization_name, ''), 'Unnamed Organization'),
      'staffEmail', 'office@toahnipi.org',
      'retreatDates', v_retreat_dates,
      'checklistItems', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'signedDocuments', '[]'::jsonb
    );
  end if;

  v_signing_on := public.portal_signing_enabled_for(v_booking.id);
  v_guest_count := coalesce(nullif(v_booking.attendee_count, ''), 'Guest count not set');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.item_id,
        'title', i.title,
        'description', coalesce(i.description, ''),
        'status', i.status,
        'required', i.required,
        'lastChanged', coalesce(to_char(i.last_changed_at, 'Mon FMDD, YYYY'), 'Not changed yet'),
        'dueDate', coalesce(to_char(i.due_date, 'Mon FMDD, YYYY'), 'No due date'),
        'helperText', coalesce(i.helper_text, ''),
        'uploadedFileName', i.uploaded_file_name,
        'guestAction', i.guest_action,
        'signDocumentId',
          case when v_signing_on and i.guest_action = 'upload_file' then i.sign_document_id end,
        'signature', (
          select jsonb_build_object(
            'id', s.id,
            'signedAt', s.signed_at,
            'signerName', s.signer_name,
            'documentTitle', s.document_title
          )
          from public.portal_signatures s
          where s.checklist_item_id = i.id
          order by s.signed_at desc
          limit 1
        )
      )
      order by i.sort_order, i.created_at
    ),
    '[]'::jsonb
  )
  into v_checklist_items
  from public.portal_checklist_items i
  where i.booking_id = v_booking.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'itemId', item_id,
        'title', title,
        'type', document_type,
        'fileName', coalesce(file_name, ''),
        'status', status,
        'lastChanged', coalesce(to_char(last_changed_at, 'Mon FMDD, YYYY'), to_char(updated_at, 'Mon FMDD, YYYY')),
        'note', coalesce(note, ''),
        'uploadedByGuest', uploaded_by_guest
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  into v_documents
  from public.portal_documents
  where booking_id = v_booking.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'title', s.document_title,
        'itemTitle', s.item_title,
        'signerName', s.signer_name,
        'signedAt', s.signed_at
      )
      order by s.signed_at desc
    ),
    '[]'::jsonb
  )
  into v_signed_documents
  from public.portal_signatures s
  where s.booking_id = v_booking.id;

  -- No 'status': the booking status is internal to staff.
  return jsonb_build_object(
    'id', v_booking.id,
    'portalToken', v_booking.portal_token,
    'cancelled', false,
    'groupName', coalesce(nullif(v_booking.organization_name, ''), 'Unnamed Organization'),
    'contactName', coalesce(v_booking.contact_name, ''),
    'contactEmail', coalesce(v_booking.email, ''),
    'staffEmail', 'office@toahnipi.org',
    'retreatDates', v_retreat_dates,
    'guestCount', v_guest_count,
    'lastUpdated', coalesce(to_char(v_booking.updated_at, 'Mon FMDD, YYYY'), ''),
    'checklistItems', v_checklist_items,
    'documents', v_documents,
    'signedDocuments', v_signed_documents
  );
end;
$$;

-- ---------- Reads used by the checklist ----------
create or replace function public.portal_get_booking_reference(p_portal_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendee_count text;
  v_food_allergies text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return jsonb_build_object('guestCount', '', 'foodAllergies', '');
  end if;

  select coalesce(attendee_count::text, ''), coalesce(food_allergies, '')
  into v_attendee_count, v_food_allergies
  from public.bookings
  where portal_token = trim(p_portal_token)
    and not public.portal_booking_is_cancelled(status, date_of_cancellation, raw_data)
  limit 1;

  if not found then
    return jsonb_build_object('guestCount', '', 'foodAllergies', '');
  end if;

  return jsonb_build_object(
    'guestCount', coalesce(v_attendee_count, ''),
    'foodAllergies', coalesce(v_food_allergies, '')
  );
end;
$$;

create or replace function public.portal_get_checklist_item_response(p_portal_token text, p_item_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id text;
  v_response_text text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return '';
  end if;

  if p_item_id not in ('food-allergy-information', 'guest-count') then
    return '';
  end if;

  select id into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
    and not public.portal_booking_is_cancelled(status, date_of_cancellation, raw_data)
  limit 1;

  if v_booking_id is null then
    return '';
  end if;

  select coalesce(response_text, '') into v_response_text
  from public.portal_checklist_items
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
  limit 1;

  return coalesce(v_response_text, '');
end;
$$;

-- ---------- Guest writes: refused for cancelled bookings ----------
create or replace function public.portal_mark_checklist_item_ready(p_portal_token text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return null;
  end if;

  select id into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
    and not public.portal_booking_is_cancelled(status, date_of_cancellation, raw_data)
  limit 1;

  if v_booking_id is null then
    return null;
  end if;

  update public.portal_checklist_items
  set status = 'needsReview', last_changed_at = now(), updated_at = now()
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
    and status not in ('completed', 'needsReview');

  return public.get_portal_record(p_portal_token);
end;
$$;

create or replace function public.portal_unmark_checklist_item_ready(p_portal_token text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return null;
  end if;

  select id into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
    and not public.portal_booking_is_cancelled(status, date_of_cancellation, raw_data)
  limit 1;

  if v_booking_id is null then
    return null;
  end if;

  update public.portal_checklist_items
  set status = 'notStarted', last_changed_at = now(), updated_at = now()
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
    and status = 'needsReview';

  return public.get_portal_record(p_portal_token);
end;
$$;

create or replace function public.portal_submit_checklist_item_response(p_portal_token text, p_item_id text, p_response_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id text;
  v_clean_response text;
  v_rows integer := 0;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return null;
  end if;

  if p_item_id not in ('food-allergy-information', 'guest-count') then
    return null;
  end if;

  v_clean_response := trim(coalesce(p_response_text, ''));

  if length(v_clean_response) = 0 then
    return null;
  end if;

  select id into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
    and not public.portal_booking_is_cancelled(status, date_of_cancellation, raw_data)
  limit 1;

  if v_booking_id is null then
    return null;
  end if;

  update public.portal_checklist_items
  set response_text = v_clean_response, status = 'needsReview', last_changed_at = now(), updated_at = now()
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
    and status <> 'completed';

  -- Nothing saved (for example staff confirmed the task meanwhile): say so (INT-09).
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return null;
  end if;

  return public.get_portal_record(p_portal_token);
end;
$$;

create or replace function public.portal_submit_checklist_upload(p_portal_token text, p_item_id text, p_file_name text, p_storage_path text, p_mime_type text, p_file_size bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer := 0;
begin
  if nullif(trim(p_portal_token), '') is null then
    raise exception 'Missing portal token';
  end if;

  if nullif(trim(p_item_id), '') is null then
    raise exception 'Missing checklist item';
  end if;

  if nullif(trim(p_file_name), '') is null then
    raise exception 'Missing file name';
  end if;

  if nullif(trim(p_storage_path), '') is null then
    raise exception 'Missing storage path';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 10485760 then
    raise exception 'File must be between 1 byte and 10 MB';
  end if;

  if coalesce(p_mime_type, '') not in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ) then
    raise exception 'Unsupported file type';
  end if;

  if split_part(p_storage_path, '/', 1) <> p_portal_token
     or split_part(p_storage_path, '/', 2) <> p_item_id
     or nullif(split_part(p_storage_path, '/', 3), '') is null then
    raise exception 'Upload path does not match this portal task';
  end if;

  update public.portal_checklist_items pci
  set
    uploaded_file_name = trim(p_file_name),
    uploaded_file_path = trim(p_storage_path),
    uploaded_file_mime = p_mime_type,
    uploaded_file_size = p_file_size,
    status = 'needsReview',
    last_changed_at = now(),
    updated_at = now()
  from public.bookings b
  where pci.booking_id = b.id
    and b.portal_token = p_portal_token
    and not public.portal_booking_is_cancelled(b.status, b.date_of_cancellation, b.raw_data)
    and pci.item_id = p_item_id
    and pci.guest_action = 'upload_file'
    and pci.status in ('notStarted', 'waitingOnGuest');

  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    raise exception 'This upload task was not found or is no longer open';
  end if;

  return true;
end;
$$;

-- Storage insert policy for guest uploads: cancelled bookings accept no files.
create or replace function public.portal_upload_path_is_allowed(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.bookings b
    join public.portal_checklist_items pci
      on pci.booking_id = b.id
    where b.portal_token = split_part(p_object_name, '/', 1)
      and not public.portal_booking_is_cancelled(b.status, b.date_of_cancellation, b.raw_data)
      and pci.item_id = split_part(p_object_name, '/', 2)
      and nullif(split_part(p_object_name, '/', 3), '') is not null
      and pci.guest_action = 'upload_file'
      and pci.status in ('notStarted', 'waitingOnGuest')
  );
$$;

-- Verify (read-only), with a cancelled and an active booking's link in hand:
--   select public.get_portal_record('<cancelled link token>') ->> 'cancelled';   -- true
--   select public.get_portal_record('<active link token>') ? 'status';           -- false
