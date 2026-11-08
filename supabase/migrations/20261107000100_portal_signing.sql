-- =====================================================================
-- Online signing in the guest portal (version 1)
-- docs/audit/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md
-- docs/portal-signing/SETUP.md (review and deployment steps)
--
-- Review before running. Safe to run more than once. Adds:
--   * portal_signing_settings  one row; signing is OFF for every booking
--                              until an admin turns it on (or lists test
--                              bookings). Changed by SQL only.
--   * portal_checklist_items.sign_document_id  the PDF a task is signed with
--   * portal_signatures        one row per signature; read-only for staff,
--                              never updated or deleted by anyone
--   * storage bucket portal-signed  originals and signed PDFs; staff read
--                              only, written only by the portal-sign
--                              function (service role)
--   * portal_record_signature  the single transaction that records a
--                              signature and moves the task to needsReview
--   * portal_restore_signatures  admin-only, insert-missing restore
--   * get_portal_record        same as live, plus signing fields
--
-- Retention: nothing here deletes signing records. Keep everything until an
-- approved retention policy exists.
-- =====================================================================

-- ---------- Settings (default: off) ----------
create table if not exists public.portal_signing_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  test_booking_ids text[] not null default '{}',
  agreement_approved boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.portal_signing_settings (id) values (true) on conflict (id) do nothing;

alter table public.portal_signing_settings enable row level security;
revoke all on public.portal_signing_settings from anon, authenticated;
grant select on public.portal_signing_settings to authenticated;

drop policy if exists "Staff read signing settings" on public.portal_signing_settings;
create policy "Staff read signing settings"
on public.portal_signing_settings for select to authenticated
using (public.is_active_staff());

create or replace function public.portal_signing_enabled_for(p_booking_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.enabled or p_booking_id = any (s.test_booking_ids)
     from public.portal_signing_settings s where s.id),
    false
  );
$$;

revoke all on function public.portal_signing_enabled_for(text) from public, anon;
grant execute on function public.portal_signing_enabled_for(text) to authenticated, service_role;

-- ---------- Task -> document link ----------
alter table public.portal_checklist_items
  add column if not exists sign_document_id uuid
  references public.portal_documents (id) on delete set null;

-- ---------- Signature records ----------
create table if not exists public.portal_signatures (
  id uuid primary key default gen_random_uuid(),
  -- Deleting a booking that has signatures is refused.
  booking_id text not null references public.bookings (id) on delete restrict,
  -- No foreign keys below: removing a task or a shared document keeps the record.
  checklist_item_id uuid not null,
  item_key text not null,
  item_title text not null,
  document_id uuid not null,
  document_title text not null,
  document_file_name text not null,
  request_key uuid not null unique,
  signer_name text not null check (length(signer_name) between 2 and 120),
  signer_title text check (signer_title is null or length(signer_title) <= 120),
  organization_name text check (organization_name is null or length(organization_name) <= 200),
  signs_for_organization boolean not null,
  signature_type text not null check (signature_type in ('typed', 'drawn')),
  agreement_version text not null,
  agreement_text text not null,
  authority_text text,
  signed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_ip text,
  user_agent text,
  original_path text not null,
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  original_size bigint not null,
  original_page_count integer not null,
  signed_path text not null,
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signed_size bigint not null,
  check (not signs_for_organization or authority_text is not null)
);

create index if not exists portal_signatures_booking_idx on public.portal_signatures (booking_id);
create index if not exists portal_signatures_item_idx on public.portal_signatures (checklist_item_id);

comment on table public.portal_signatures is
  'Online signatures from the guest portal. Written only by the portal-sign function; never updated or deleted. The signer details are as entered: the portal link is shared, so they are not verified.';

alter table public.portal_signatures enable row level security;
revoke all on public.portal_signatures from anon, authenticated;
grant select on public.portal_signatures to authenticated;

drop policy if exists "Staff read signatures" on public.portal_signatures;
create policy "Staff read signatures"
on public.portal_signatures for select to authenticated
using (public.is_active_staff());

create or replace function public.portal_signatures_block_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Signed records cannot be changed or deleted.' using errcode = '42501';
end;
$$;

drop trigger if exists portal_signatures_no_update_delete on public.portal_signatures;
create trigger portal_signatures_no_update_delete
before update or delete on public.portal_signatures
for each row execute function public.portal_signatures_block_changes();

drop trigger if exists portal_signatures_no_truncate on public.portal_signatures;
create trigger portal_signatures_no_truncate
before truncate on public.portal_signatures
for each statement execute function public.portal_signatures_block_changes();

-- ---------- Recording a signature (service role only) ----------
/*
  Called by the portal-sign function after both PDFs are stored. Locks the
  task row, so a second signature (any request key) or a paper upload that
  races it waits here and then finds the task no longer open. A repeat of
  the same request key returns the record already saved.
*/
create or replace function public.portal_record_signature(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.portal_checklist_items%rowtype;
  v_existing public.portal_signatures%rowtype;
  v_signature public.portal_signatures%rowtype;
begin
  select * into v_item
  from public.portal_checklist_items
  where id = (p ->> 'checklist_item_id')::uuid
    and booking_id = p ->> 'booking_id'
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  -- After the lock, so a same-key retry that lost the race still sees the saved row.
  select * into v_existing from public.portal_signatures
  where request_key = (p ->> 'request_key')::uuid;

  if found then
    if v_existing.booking_id <> p ->> 'booking_id' then
      raise exception 'TASK_NOT_FOUND';
    end if;
    return jsonb_build_object('status', 'existing', 'signature', to_jsonb(v_existing));
  end if;

  if not public.portal_signing_enabled_for(v_item.booking_id) then
    raise exception 'SIGNING_OFF';
  end if;

  if v_item.guest_action <> 'upload_file'
     or v_item.sign_document_id is distinct from (p ->> 'document_id')::uuid then
    raise exception 'DOCUMENT_CHANGED';
  end if;

  if not exists (
    select 1 from public.portal_documents d
    where d.id = v_item.sign_document_id
      and d.booking_id = v_item.booking_id
      and not d.uploaded_by_guest
  ) then
    raise exception 'DOCUMENT_CHANGED';
  end if;

  if v_item.status not in ('notStarted', 'waitingOnGuest') then
    raise exception 'TASK_NOT_OPEN';
  end if;

  insert into public.portal_signatures (
    booking_id, checklist_item_id, item_key, item_title,
    document_id, document_title, document_file_name, request_key,
    signer_name, signer_title, organization_name, signs_for_organization,
    signature_type, agreement_version, agreement_text, authority_text,
    signed_at, client_ip, user_agent,
    original_path, original_sha256, original_size, original_page_count,
    signed_path, signed_sha256, signed_size
  ) values (
    v_item.booking_id, v_item.id, v_item.item_id, v_item.title,
    (p ->> 'document_id')::uuid, p ->> 'document_title', p ->> 'document_file_name', (p ->> 'request_key')::uuid,
    p ->> 'signer_name', nullif(p ->> 'signer_title', ''), nullif(p ->> 'organization_name', ''),
    (p ->> 'signs_for_organization')::boolean,
    p ->> 'signature_type', p ->> 'agreement_version', p ->> 'agreement_text', nullif(p ->> 'authority_text', ''),
    (p ->> 'signed_at')::timestamptz, left(p ->> 'client_ip', 100), left(p ->> 'user_agent', 300),
    p ->> 'original_path', p ->> 'original_sha256', (p ->> 'original_size')::bigint, (p ->> 'original_page_count')::integer,
    p ->> 'signed_path', p ->> 'signed_sha256', (p ->> 'signed_size')::bigint
  )
  returning * into v_signature;

  update public.portal_checklist_items
  set status = 'needsReview', last_changed_at = now(), updated_at = now()
  where id = v_item.id;

  return jsonb_build_object('status', 'created', 'signature', to_jsonb(v_signature));
end;
$$;

revoke all on function public.portal_record_signature(jsonb) from public, anon, authenticated;
grant execute on function public.portal_record_signature(jsonb) to service_role;

-- ---------- Restore (admins; insert missing rows only) ----------
create or replace function public.portal_restore_signatures(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  if not public.is_staff_admin() then
    raise exception 'Only administrators can restore signing records.' using errcode = '42501';
  end if;

  insert into public.portal_signatures
  select r.*
  from jsonb_populate_recordset(null::public.portal_signatures, p_rows) r
  where exists (select 1 from public.bookings b where b.id = r.booking_id)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.portal_restore_signatures(jsonb) from public, anon;
grant execute on function public.portal_restore_signatures(jsonb) to authenticated;

-- ---------- Storage: signed records ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-signed', 'portal-signed', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "portal signed staff read" on storage.objects;
create policy "portal signed staff read"
on storage.objects for select to authenticated
using (bucket_id = 'portal-signed' and public.is_active_staff());
-- No insert, update or delete policies: only the service role writes here.

-- ---------- Guest portal record: live definition plus signing fields ----------
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

  v_signing_on := public.portal_signing_enabled_for(v_booking.id);

  if v_booking.start_date is null and v_booking.end_date is null then
    v_retreat_dates := 'Dates not set';
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

  return jsonb_build_object(
    'id', v_booking.id,
    'portalToken', v_booking.portal_token,
    'groupName', coalesce(nullif(v_booking.organization_name, ''), 'Unnamed Organization'),
    'contactName', coalesce(v_booking.contact_name, ''),
    'contactEmail', coalesce(v_booking.email, ''),
    'staffEmail', 'office@toahnipi.org',
    'retreatDates', v_retreat_dates,
    'guestCount', v_guest_count,
    'status', coalesce(nullif(v_booking.status, ''), 'Inquiry'),
    'lastUpdated', coalesce(to_char(v_booking.updated_at, 'Mon FMDD, YYYY'), ''),
    'checklistItems', v_checklist_items,
    'documents', v_documents,
    'signedDocuments', v_signed_documents
  );
end;
$$;
