-- =====================================================================
-- REFERENCE SNAPSHOT ONLY. NOT A MIGRATION. DO NOT RUN.
-- Live Supabase project, read 2026-11-07 with catalog-only SELECT queries
-- (supabase db query --linked). No row data, tokens, keys or personal
-- details. Limited to objects relevant to online signing. Generated from
-- pg_catalog output, so it is descriptive DDL, not a restorable dump.
-- =====================================================================

-- ---------- Tables (relevant columns) ----------
-- public.bookings: 67 columns; only those used by the portal are listed.
--   id text primary key, portal_token text unique, organization_name text not null,
--   contact_name text, email text, status text, start_date date, end_date date, ...

create table public.portal_checklist_items (
  id uuid not null default gen_random_uuid(),
  booking_id text not null,
  item_id text not null,
  title text not null,
  description text,
  status text not null default 'notStarted'::text,
  required boolean not null default true,
  due_date date,
  helper_text text,
  guest_action text not null default 'none'::text,
  uploaded_file_name text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_changed_at timestamp with time zone,
  response_text text,
  uploaded_file_path text,
  uploaded_file_mime text,
  uploaded_file_size bigint,
  email_assign boolean not null default false,
  email_reminders ARRAY not null default '{}'::text[],
  email_changes boolean not null default false,
  email_assigned_at timestamp with time zone not null default now(),
  email_changes_requested_at timestamp with time zone
);

create table public.portal_documents (
  id uuid not null default gen_random_uuid(),
  booking_id text not null,
  item_id text,
  title text not null,
  document_type text not null default 'Document'::text,
  file_name text,
  status text not null default 'ready'::text,
  note text,
  storage_bucket text,
  storage_path text,
  uploaded_by_guest boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_changed_at timestamp with time zone,
  email_assign boolean not null default false,
  email_assigned_at timestamp with time zone not null default now()
);

create table public.portal_email_recipients (
  id uuid not null default gen_random_uuid(),
  booking_id text not null,
  email text not null,
  selected boolean not null default false,
  added_by_staff boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.staff_profiles (
  user_id uuid not null,
  email text not null,
  full_name text not null,
  role text not null default 'staff'::text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- ---------- Constraints ----------
alter table public.bookings add constraint bookings_pkey PRIMARY KEY (id);
alter table public.bookings add constraint bookings_portal_token_key UNIQUE (portal_token);
alter table public.portal_checklist_items add constraint portal_checklist_items_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.portal_checklist_items add constraint portal_checklist_items_booking_id_item_id_key UNIQUE (booking_id, item_id);
alter table public.portal_checklist_items add constraint portal_checklist_items_email_reminders_check CHECK ((email_reminders <@ ARRAY['7d'::text, '2d'::text, 'overdue'::text]));
alter table public.portal_checklist_items add constraint portal_checklist_items_guest_action_check CHECK ((guest_action = ANY (ARRAY['none'::text, 'mark_ready'::text, 'upload_file'::text])));
alter table public.portal_checklist_items add constraint portal_checklist_items_pkey PRIMARY KEY (id);
alter table public.portal_checklist_items add constraint portal_checklist_items_status_check CHECK ((status = ANY (ARRAY['notStarted'::text, 'waitingOnGuest'::text, 'needsReview'::text, 'completed'::text, 'ready'::text])));
alter table public.portal_documents add constraint portal_documents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.portal_documents add constraint portal_documents_pkey PRIMARY KEY (id);
alter table public.portal_documents add constraint portal_documents_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'needsReview'::text, 'completed'::text, 'notStarted'::text])));
alter table public.portal_email_recipients add constraint portal_email_recipients_booking_id_email_key UNIQUE (booking_id, email);
alter table public.portal_email_recipients add constraint portal_email_recipients_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.portal_email_recipients add constraint portal_email_recipients_email_check CHECK (((email = lower(btrim(email))) AND (length(email) <= 254) AND (email ~ '^[^[:space:]@<>,;"]+@[a-z0-9.-]+\.[a-z]{2,}$'::text)));
alter table public.portal_email_recipients add constraint portal_email_recipients_pkey PRIMARY KEY (id);
alter table public.staff_profiles add constraint staff_profiles_email_key UNIQUE (email);
alter table public.staff_profiles add constraint staff_profiles_pkey PRIMARY KEY (user_id);
alter table public.staff_profiles add constraint staff_profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text, 'viewer'::text])));
alter table public.staff_profiles add constraint staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------- Row-level security: enabled on every public table ----------
-- ---------- Policies (public portal/staff tables and storage.objects) ----------
create policy "Active staff can read bookings" on public.bookings for select to authenticated
  using (is_active_staff());
create policy "Admins can delete bookings" on public.bookings for delete to authenticated
  using (is_staff_admin());
create policy "Staff can insert bookings" on public.bookings for insert to authenticated
  with check (can_manage_bookings());
create policy "Staff can update bookings" on public.bookings for update to authenticated
  using (can_manage_bookings())
  with check (can_manage_bookings());
create policy "Active staff can read portal checklist items" on public.portal_checklist_items for select to authenticated
  using (is_active_staff());
create policy "Staff can manage portal checklist items" on public.portal_checklist_items for all to authenticated
  using (can_manage_bookings())
  with check (can_manage_bookings());
create policy "Active staff can read portal documents" on public.portal_documents for select to authenticated
  using (is_active_staff());
create policy "Authenticated staff can delete portal documents" on public.portal_documents for delete to authenticated
  using (can_manage_bookings());
create policy "Authenticated staff can insert portal documents" on public.portal_documents for insert to authenticated
  with check (can_manage_bookings());
create policy "Staff can manage portal documents" on public.portal_documents for all to authenticated
  using (can_manage_bookings())
  with check (can_manage_bookings());
create policy "Staff add email recipients" on public.portal_email_recipients for insert to authenticated
  with check (can_manage_bookings());
create policy "Staff read email recipients" on public.portal_email_recipients for select to authenticated
  using (is_active_staff());
create policy "Staff remove email recipients" on public.portal_email_recipients for delete to authenticated
  using (can_manage_bookings());
create policy "Staff select email recipients" on public.portal_email_recipients for update to authenticated
  using (can_manage_bookings())
  with check (can_manage_bookings());
create policy "Admins can read all staff profiles" on public.staff_profiles for select to authenticated
  using (is_staff_admin());
create policy "Admins can update staff profiles" on public.staff_profiles for update to authenticated
  using (is_staff_admin())
  with check (is_staff_admin());
create policy "Staff can read own profile" on public.staff_profiles for select to authenticated
  using ((user_id = auth.uid()));
create policy "Authenticated staff can delete portal staff documents" on storage.objects for delete to authenticated
  using (((bucket_id = 'portal-uploads'::text) AND ((storage.foldername(name))[2] = 'staff-documents'::text) AND can_manage_bookings()));
create policy "Authenticated staff can upload portal staff documents" on storage.objects for insert to authenticated
  with check (((bucket_id = 'portal-uploads'::text) AND ((storage.foldername(name))[2] = 'staff-documents'::text) AND can_manage_bookings()));
create policy "portal uploads guest cleanup" on storage.objects for delete to anon
  using (((bucket_id = 'portal-uploads'::text) AND portal_upload_path_is_allowed(name)));
create policy "portal uploads guest insert" on storage.objects for insert to anon,authenticated
  with check (((bucket_id = 'portal-uploads'::text) AND portal_upload_path_is_allowed(name)));
create policy "portal uploads staff delete" on storage.objects for delete to authenticated
  using (((bucket_id = 'portal-uploads'::text) AND can_manage_bookings()));
create policy "portal uploads staff read" on storage.objects for select to authenticated
  using (((bucket_id = 'portal-uploads'::text) AND is_active_staff()));
-- NOTE: no anon SELECT or UPDATE policy exists on storage.objects. No policy of any kind
-- exists for anon on public tables; guests act only through the functions below.

-- ---------- Table grants to anon / authenticated (RLS still applies) ----------
--   bookings                 anon           REFERENCES,TRIGGER,TRUNCATE
--   bookings                 authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   portal_checklist_items   anon           REFERENCES,TRIGGER,TRUNCATE
--   portal_checklist_items   authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   portal_documents         anon           REFERENCES,TRIGGER,TRUNCATE
--   portal_documents         authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   portal_email_recipients  authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE
--   staff_profiles           anon           REFERENCES,TRIGGER,TRUNCATE
--   staff_profiles           authenticated  REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE

-- ---------- Storage bucket ----------
-- bucket portal-uploads: public=False, file_size_limit=10485760, allowed_mime_types={application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg}

-- ---------- Function inventory (security definer / execute grants) ----------
--   audit_repair_apply(p_repair text)  secdef=False  anon_exec=True  authenticated_exec=True
--   audit_repair_rollback(p_repair text)  secdef=False  anon_exec=True  authenticated_exec=True
--   can_manage_bookings()  secdef=True  anon_exec=False  authenticated_exec=True
--   current_staff_role()  secdef=True  anon_exec=False  authenticated_exec=True
--   get_portal_record(p_portal_token text)  secdef=True  anon_exec=True  authenticated_exec=True
--   is_active_staff()  secdef=True  anon_exec=False  authenticated_exec=True
--   is_staff_admin()  secdef=True  anon_exec=False  authenticated_exec=True
--   portal_email_claim(p_limit integer, p_ids uuid[])  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_enqueue(p_message jsonb)  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_finish(p_id uuid, p_status text, p_detail text, p_provider_id text, p_subject text, p_exhausted_status text)  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_item_status_change()  secdef=False  anon_exec=True  authenticated_exec=True
--   portal_email_latch_booking_change()  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_latch_complete()  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_load(p_booking_ids text[])  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_requeue(p_id uuid)  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_set_automation(p_booking_id text, p_action text, p_user uuid, p_reason text)  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_email_settings_guard()  secdef=False  anon_exec=True  authenticated_exec=True
--   portal_email_template_ok(p_text text)  secdef=False  anon_exec=True  authenticated_exec=True
--   portal_email_webhook(p_provider_id text, p_status text, p_detail text)  secdef=True  anon_exec=False  authenticated_exec=False
--   portal_get_booking_reference(p_portal_token text)  secdef=True  anon_exec=True  authenticated_exec=True
--   portal_get_checklist_item_response(p_portal_token text, p_item_id text)  secdef=True  anon_exec=True  authenticated_exec=True
--   portal_mark_checklist_item_ready(p_portal_token text, p_item_id text)  secdef=True  anon_exec=True  authenticated_exec=True
--   portal_submit_checklist_item_response(p_portal_token text, p_item_id text, p_response_text text)  secdef=True  anon_exec=True  authenticated_exec=True
--   portal_submit_checklist_upload(p_portal_token text, p_item_id text, p_file_name text, p_storage_path text, p_mime_type text, p_file_size bigint)  secdef=True  anon_exec=True  authenticated_exec=True
--   portal_unmark_checklist_item_ready(p_portal_token text, p_item_id text)  secdef=True  anon_exec=True  authenticated_exec=True
--   portal_upload_path_is_allowed(p_object_name text)  secdef=True  anon_exec=True  authenticated_exec=True
--   rls_auto_enable()  secdef=True  anon_exec=True  authenticated_exec=True
--   set_updated_at()  secdef=False  anon_exec=True  authenticated_exec=True

-- ---------- Guest RPC and staff-role function bodies ----------
CREATE OR REPLACE FUNCTION public.get_portal_record(p_portal_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking public.bookings%rowtype;
  v_checklist_items jsonb;
  v_documents jsonb;
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
        'id', item_id,
        'title', title,
        'description', coalesce(description, ''),
        'status', status,
        'required', required,
        'lastChanged', coalesce(to_char(last_changed_at, 'Mon FMDD, YYYY'), 'Not changed yet'),
        'dueDate', coalesce(to_char(due_date, 'Mon FMDD, YYYY'), 'No due date'),
        'helperText', coalesce(helper_text, ''),
        'uploadedFileName', uploaded_file_name,
        'guestAction', guest_action
      )
      order by sort_order, created_at
    ),
    '[]'::jsonb
  )
  into v_checklist_items
  from public.portal_checklist_items
  where booking_id = v_booking.id;

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
    'documents', v_documents
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_get_booking_reference(p_portal_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attendee_count text;
  v_food_allergies text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return jsonb_build_object(
      'guestCount', '',
      'foodAllergies', ''
    );
  end if;

  select
    coalesce(attendee_count::text, ''),
    coalesce(food_allergies, '')
  into
    v_attendee_count,
    v_food_allergies
  from public.bookings
  where portal_token = trim(p_portal_token)
  limit 1;

  if not found then
    return jsonb_build_object(
      'guestCount', '',
      'foodAllergies', ''
    );
  end if;

  return jsonb_build_object(
    'guestCount', coalesce(v_attendee_count, ''),
    'foodAllergies', coalesce(v_food_allergies, '')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_get_checklist_item_response(p_portal_token text, p_item_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select id
  into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
  limit 1;

  if v_booking_id is null then
    return '';
  end if;

  select coalesce(response_text, '')
  into v_response_text
  from public.portal_checklist_items
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
  limit 1;

  return coalesce(v_response_text, '');
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_mark_checklist_item_ready(p_portal_token text, p_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking_id text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return null;
  end if;

  select id
  into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
  limit 1;

  if v_booking_id is null then
    return null;
  end if;

  update public.portal_checklist_items
  set
    status = 'needsReview',
    last_changed_at = now(),
    updated_at = now()
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
    and status not in ('completed', 'needsReview');

  return public.get_portal_record(p_portal_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_unmark_checklist_item_ready(p_portal_token text, p_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking_id text;
begin
  if p_portal_token is null or length(trim(p_portal_token)) < 20 then
    return null;
  end if;

  select id
  into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
  limit 1;

  if v_booking_id is null then
    return null;
  end if;

  update public.portal_checklist_items
  set
    status = 'notStarted',
    last_changed_at = now(),
    updated_at = now()
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
    and status = 'needsReview';

  return public.get_portal_record(p_portal_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_submit_checklist_item_response(p_portal_token text, p_item_id text, p_response_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking_id text;
  v_clean_response text;
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

  select id
  into v_booking_id
  from public.bookings
  where portal_token = trim(p_portal_token)
  limit 1;

  if v_booking_id is null then
    return null;
  end if;

  update public.portal_checklist_items
  set
    response_text = v_clean_response,
    status = 'needsReview',
    last_changed_at = now(),
    updated_at = now()
  where booking_id = v_booking_id
    and item_id = p_item_id
    and guest_action = 'mark_ready'
    and status <> 'completed';

  return public.get_portal_record(p_portal_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_submit_checklist_upload(p_portal_token text, p_item_id text, p_file_name text, p_storage_path text, p_mime_type text, p_file_size bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and pci.item_id = p_item_id
    and pci.guest_action = 'upload_file'
    and pci.status in ('notStarted', 'waitingOnGuest');

  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    raise exception 'This upload task was not found or is no longer open';
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_upload_path_is_allowed(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.bookings b
    join public.portal_checklist_items pci
      on pci.booking_id = b.id
    where b.portal_token = split_part(p_object_name, '/', 1)
      and pci.item_id = split_part(p_object_name, '/', 2)
      and nullif(split_part(p_object_name, '/', 3), '') is not null
      and pci.guest_action = 'upload_file'
      and pci.status in ('notStarted', 'waitingOnGuest')
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role
  from public.staff_profiles
  where user_id = auth.uid()
    and is_active = true
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.is_active_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.current_staff_role() is not null
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_bookings()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.current_staff_role() in ('admin', 'staff')
$function$;

CREATE OR REPLACE FUNCTION public.is_staff_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.current_staff_role() = 'admin'
$function$;

-- ---------- Triggers on relevant tables ----------
--   bookings: portal_email_latch_booking_change AFTER UPDATE -> EXECUTE FUNCTION portal_email_latch_booking_change()
--   portal_checklist_items: portal_email_item_status_change BEFORE UPDATE -> EXECUTE FUNCTION portal_email_item_status_change()
--   portal_checklist_items: portal_email_latch_complete AFTER UPDATE -> EXECUTE FUNCTION portal_email_latch_complete()
--   portal_checklist_items: portal_email_latch_complete AFTER DELETE -> EXECUTE FUNCTION portal_email_latch_complete()
--   portal_checklist_items: portal_email_latch_complete AFTER INSERT -> EXECUTE FUNCTION portal_email_latch_complete()
--   portal_checklist_items: set_portal_checklist_items_updated_at BEFORE UPDATE -> EXECUTE FUNCTION set_updated_at()
--   portal_documents: set_portal_documents_updated_at BEFORE UPDATE -> EXECUTE FUNCTION set_updated_at()
--   portal_email_recipients: set_portal_email_recipients_updated_at BEFORE UPDATE -> EXECUTE FUNCTION set_updated_at()
