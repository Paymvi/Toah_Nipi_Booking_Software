-- Guest portal emails (welcome, task notices, deadline reminders).
--
-- Safe defaults, all enforced here rather than in the browser:
--   * global mode starts 'disabled' (dry run: zero provider calls) and
--     automatic emails start off;
--   * no booking is enrolled: existing and new bookings have no
--     portal_email_bookings row, and no recipient is selected;
--   * every item email option starts off;
--   * changing the mode bumps mode_epoch, turns automatic emails off,
--     cancels queued mail and makes every booking's activation stale, so
--     nothing queued or activated under one mode can be sent under another;
--   * the outbox, its event ledger and the delivery RPCs are reachable only
--     by the portal-email Edge Function (service_role). Staff can read them;
--     the public portal (anon) gets no access to any table here.
--
-- Requires SQL_SETUP.md Script 05 helpers (is_active_staff,
-- can_manage_bookings, is_staff_admin) and set_updated_at (Script 04).
-- portal_checklist_items / portal_documents are not defined in this
-- repository, so their changes are guarded with "if exists" and compare
-- ids as text.

-- ---------------------------------------------------------------------------
-- Global settings (one row)
-- ---------------------------------------------------------------------------
create table if not exists public.portal_email_settings (
  id smallint primary key default 1 check (id = 1),
  mode text not null default 'disabled' check (mode in ('disabled', 'test', 'live')),
  mode_epoch integer not null default 1,
  automation_enabled boolean not null default false,
  live_cap_per_day integer not null default 20 check (live_cap_per_day between 1 and 200),
  batch_size integer not null default 10 check (batch_size between 1 and 25),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

insert into public.portal_email_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.portal_email_settings_guard()
returns trigger language plpgsql as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.mode is distinct from old.mode then
    new.mode_epoch := old.mode_epoch + 1;
    new.automation_enabled := false;
  else
    new.mode_epoch := old.mode_epoch;
  end if;
  return new;
end;
$$;

drop trigger if exists portal_email_settings_guard on public.portal_email_settings;
create trigger portal_email_settings_guard
before update on public.portal_email_settings
for each row execute function public.portal_email_settings_guard();

-- ---------------------------------------------------------------------------
-- Shared templates. Placeholders are checked here too, not only in the UI.
-- ---------------------------------------------------------------------------
create or replace function public.portal_email_template_ok(p_text text)
returns boolean language sql immutable as $$
  select p_text is not null
    and not exists (
      select 1
      from regexp_matches(p_text, '\{\{\s*([^{}]*?)\s*\}\}', 'g') as m
      where m[1] not in ('group_name', 'contact_name', 'retreat_dates')
    )
    and regexp_replace(p_text, '\{\{\s*[a-z_]+\s*\}\}', '', 'g') !~ '[{}]{2}'
$$;

create table if not exists public.portal_email_templates (
  key text primary key check (key in ('welcome', 'update')),
  subject text not null check (length(btrim(subject)) between 1 and 200 and subject !~ '[\r\n]'),
  body text not null check (length(btrim(body)) between 1 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (public.portal_email_template_ok(subject) and public.portal_email_template_ok(body))
);

insert into public.portal_email_templates (key, subject, body) values
  ('welcome',
   'Your Toah Nipi group portal for {{group_name}}',
   E'Hello,\n\nThe group portal for {{group_name}} ({{retreat_dates}}) is ready. It is where you complete pre-arrival tasks, upload documents, and see what Toah Nipi has shared with your group.\n\nNext steps: open the portal with the button below, review each task, and submit what you can before its due date.'),
  ('update',
   'Portal update for {{group_name}}',
   E'Hello,\n\nHere is an update on the group portal for {{group_name}} ({{retreat_dates}}).')
on conflict (key) do nothing;

drop trigger if exists set_portal_email_templates_updated_at on public.portal_email_templates;
create trigger set_portal_email_templates_updated_at
before update on public.portal_email_templates
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-booking automation. No row = off. Writes only through the Edge
-- Function (portal_email_set_automation), so activation and the welcome
-- email are one server-side action.
--
-- stopped_reason is a latch: once set (portal 100% complete, booking no
-- longer eligible, classification changed), automatic emails stay stopped
-- until staff explicitly resume, even if the booking changes back.
-- ---------------------------------------------------------------------------
create table if not exists public.portal_email_bookings (
  booking_id text primary key references public.bookings (id) on delete cascade,
  enabled boolean not null default false,
  paused boolean not null default false,
  mode_epoch integer,
  active_since timestamptz,
  stopped_reason text check (stopped_reason in ('complete', 'ineligible', 'booking_changed')),
  stopped_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Recipients chosen by staff. Adding one never changes bookings.email.
-- ---------------------------------------------------------------------------
create table if not exists public.portal_email_recipients (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings (id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and length(email) <= 254
    and email ~ '^[^[:space:]@<>,;"]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ),
  selected boolean not null default false,
  added_by_staff boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, email)
);

drop trigger if exists set_portal_email_recipients_updated_at on public.portal_email_recipients;
create trigger set_portal_email_recipients_updated_at
before update on public.portal_email_recipients
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Outbox: one row per recipient delivery, bound to the mode and epoch it
-- was created in. dedupe_key makes every trigger idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.portal_email_messages (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  booking_id text,
  booking_label text,
  trigger text not null check (trigger in ('welcome', 'automatic', 'manual_welcome', 'manual_reminder', 'test')),
  template_key text not null check (template_key in ('welcome', 'update')),
  is_manual boolean not null default false,
  use_real_data boolean not null default false,
  confirm_completed boolean not null default false,
  mode text not null check (mode in ('disabled', 'test', 'live')),
  mode_epoch integer not null,
  recipient text not null,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'accepted', 'delivered', 'bounced', 'simulated',
    'blocked', 'suppressed', 'cancelled', 'expired', 'failed', 'uncertain'
  )),
  status_detail text,
  subject text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists portal_email_messages_queue_idx
on public.portal_email_messages (status, next_attempt_at);
create index if not exists portal_email_messages_booking_idx
on public.portal_email_messages (booking_id, created_at desc);
create index if not exists portal_email_messages_provider_idx
on public.portal_email_messages (provider_message_id);

-- Each (item, trigger, schedule version, recipient, epoch) can be emailed once.
create table if not exists public.portal_email_item_events (
  event_key text primary key,
  booking_id text not null,
  message_id uuid not null references public.portal_email_messages (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists portal_email_item_events_booking_idx
on public.portal_email_item_events (booking_id);

-- ---------------------------------------------------------------------------
-- Item email options. Restores strip email_* columns (backupData.js), so a
-- restored item comes back with emails off.
-- email_assigned_at defaults to now(), so items that exist when this runs
-- count as assigned before any activation and never get "new" notices.
-- ---------------------------------------------------------------------------
alter table if exists public.portal_checklist_items
  add column if not exists email_assign boolean not null default false,
  add column if not exists email_reminders text[] not null default '{}'
    check (email_reminders <@ array['7d', '2d', 'overdue']::text[]),
  add column if not exists email_changes boolean not null default false,
  add column if not exists email_assigned_at timestamptz not null default now(),
  add column if not exists email_changes_requested_at timestamptz;

alter table if exists public.portal_documents
  add column if not exists email_assign boolean not null default false,
  add column if not exists email_assigned_at timestamptz not null default now();

-- Records when staff send a submission back, whichever screen did it.
create or replace function public.portal_email_item_status_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'needsReview' and new.status = 'waitingOnGuest' then
    new.email_changes_requested_at := now();
  end if;
  return new;
end;
$$;

-- Latch: a portal that reaches 100% (every task confirmed) stops automatic
-- emails until staff resume, even if a task is reopened later.
create or replace function public.portal_email_latch_complete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_booking text := coalesce(new.booking_id, old.booking_id)::text;
begin
  update public.portal_email_bookings b
  set stopped_reason = 'complete', stopped_at = now(), updated_at = now()
  where b.booking_id = v_booking
    and b.enabled and b.stopped_reason is null
    and exists (select 1 from public.portal_checklist_items i where i.booking_id::text = v_booking)
    and not exists (
      select 1 from public.portal_checklist_items i
      where i.booking_id::text = v_booking and i.status is distinct from 'completed'
    );
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.portal_checklist_items') is not null then
    execute 'drop trigger if exists portal_email_item_status_change on public.portal_checklist_items';
    execute 'create trigger portal_email_item_status_change before update of status on public.portal_checklist_items
             for each row execute function public.portal_email_item_status_change()';
    execute 'drop trigger if exists portal_email_latch_complete on public.portal_checklist_items';
    execute 'create trigger portal_email_latch_complete after insert or update of status or delete on public.portal_checklist_items
             for each row execute function public.portal_email_latch_complete()';
  end if;
end
$$;

-- Latch: any change to the fields the shared classification reads
-- (cancel, waitlist, reinstate, host/archive, re-import, restore) stops
-- automatic emails until staff review and resume.
create or replace function public.portal_email_latch_booking_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status, old.waitlist, old.date_of_cancellation, old.source_type, old.detected_import_type,
      old.source_sheet, old.retreat_type, old.organization_name ~* '^host',
      old.raw_data -> 'rentalFormDetails' -> 'reinstatedAt')
     is distinct from
     (new.status, new.waitlist, new.date_of_cancellation, new.source_type, new.detected_import_type,
      new.source_sheet, new.retreat_type, new.organization_name ~* '^host',
      new.raw_data -> 'rentalFormDetails' -> 'reinstatedAt') then
    update public.portal_email_bookings
    set stopped_reason = 'booking_changed', stopped_at = now(), updated_at = now()
    where booking_id = new.id and enabled and stopped_reason is null;
  end if;
  return null;
end;
$$;

drop trigger if exists portal_email_latch_booking_change on public.bookings;
create trigger portal_email_latch_booking_change
after update on public.bookings
for each row execute function public.portal_email_latch_booking_change();

-- ---------------------------------------------------------------------------
-- Access. Staff read everything here; staff edit recipients; admins edit
-- settings and templates. No anon access. Outbox, ledger and automation
-- rows are written only by the service role (Edge Function).
-- ---------------------------------------------------------------------------
alter table public.portal_email_settings enable row level security;
alter table public.portal_email_templates enable row level security;
alter table public.portal_email_bookings enable row level security;
alter table public.portal_email_recipients enable row level security;
alter table public.portal_email_messages enable row level security;
alter table public.portal_email_item_events enable row level security;

revoke all on public.portal_email_settings, public.portal_email_templates, public.portal_email_bookings,
  public.portal_email_recipients, public.portal_email_messages, public.portal_email_item_events from anon;

grant select on public.portal_email_settings, public.portal_email_templates, public.portal_email_bookings,
  public.portal_email_recipients, public.portal_email_messages to authenticated;
grant update (mode, automation_enabled, live_cap_per_day, batch_size) on public.portal_email_settings to authenticated;
grant update (subject, body) on public.portal_email_templates to authenticated;
grant insert, update (selected), delete on public.portal_email_recipients to authenticated;

drop policy if exists "Staff read email settings" on public.portal_email_settings;
create policy "Staff read email settings" on public.portal_email_settings
for select to authenticated using (public.is_active_staff());
drop policy if exists "Admins change email settings" on public.portal_email_settings;
create policy "Admins change email settings" on public.portal_email_settings
for update to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());

drop policy if exists "Staff read email templates" on public.portal_email_templates;
create policy "Staff read email templates" on public.portal_email_templates
for select to authenticated using (public.is_active_staff());
drop policy if exists "Admins edit email templates" on public.portal_email_templates;
create policy "Admins edit email templates" on public.portal_email_templates
for update to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());

drop policy if exists "Staff read booking email state" on public.portal_email_bookings;
create policy "Staff read booking email state" on public.portal_email_bookings
for select to authenticated using (public.is_active_staff());

drop policy if exists "Staff read email recipients" on public.portal_email_recipients;
create policy "Staff read email recipients" on public.portal_email_recipients
for select to authenticated using (public.is_active_staff());
drop policy if exists "Staff add email recipients" on public.portal_email_recipients;
create policy "Staff add email recipients" on public.portal_email_recipients
for insert to authenticated with check (public.can_manage_bookings());
drop policy if exists "Staff select email recipients" on public.portal_email_recipients;
create policy "Staff select email recipients" on public.portal_email_recipients
for update to authenticated using (public.can_manage_bookings()) with check (public.can_manage_bookings());
drop policy if exists "Staff remove email recipients" on public.portal_email_recipients;
create policy "Staff remove email recipients" on public.portal_email_recipients
for delete to authenticated using (public.can_manage_bookings());

drop policy if exists "Staff read email history" on public.portal_email_messages;
create policy "Staff read email history" on public.portal_email_messages
for select to authenticated using (public.is_active_staff());

-- ---------------------------------------------------------------------------
-- Service-role RPCs used by the portal-email Edge Function.
-- ---------------------------------------------------------------------------

-- Current state for the given bookings (null = every enabled booking).
create or replace function public.portal_email_load(p_booking_ids text[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from public.portal_email_settings s where id = 1),
    'templates', (select coalesce(jsonb_object_agg(t.key, jsonb_build_object('subject', t.subject, 'body', t.body)), '{}'::jsonb)
                  from public.portal_email_templates t),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'row', jsonb_build_object(
          'id', b.id, 'portal_token', b.portal_token, 'organization_name', b.organization_name,
          'contact_name', b.contact_name, 'email', b.email, 'start_date', b.start_date,
          'end_date', b.end_date, 'status', b.status, 'waitlist', b.waitlist,
          'source_type', b.source_type, 'detected_import_type', b.detected_import_type,
          'source_sheet', b.source_sheet, 'retreat_type', b.retreat_type,
          'date_of_cancellation', b.date_of_cancellation,
          'rental_form_details', b.raw_data -> 'rentalFormDetails'),
        'automation', (select to_jsonb(a) from public.portal_email_bookings a where a.booking_id = b.id),
        'recipients', coalesce((select jsonb_agg(jsonb_build_object('email', r.email, 'selected', r.selected, 'added_by_staff', r.added_by_staff) order by r.email)
                                from public.portal_email_recipients r where r.booking_id = b.id), '[]'::jsonb),
        'bounced', coalesce((select jsonb_agg(distinct m.recipient) from public.portal_email_messages m
                             where m.booking_id = b.id and m.status = 'bounced'), '[]'::jsonb),
        'event_keys', coalesce((select jsonb_agg(e.event_key) from public.portal_email_item_events e
                                where e.booking_id = b.id), '[]'::jsonb),
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', i.id::text, 'title', i.title, 'status', i.status, 'guest_action', i.guest_action,
                    'due_date', i.due_date, 'sort_order', i.sort_order,
                    'email_assign', i.email_assign, 'email_reminders', to_jsonb(i.email_reminders),
                    'email_changes', i.email_changes, 'email_assigned_at', i.email_assigned_at,
                    'email_changes_requested_at', i.email_changes_requested_at) order by i.sort_order)
                  from public.portal_checklist_items i where i.booking_id::text = b.id), '[]'::jsonb),
        'documents', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', d.id::text, 'title', d.title, 'uploaded_by_guest', d.uploaded_by_guest,
                    'email_assign', d.email_assign, 'email_assigned_at', d.email_assigned_at))
                  from public.portal_documents d where d.booking_id::text = b.id), '[]'::jsonb)
      ))
      from public.bookings b
      where (p_booking_ids is null and b.id in (select booking_id from public.portal_email_bookings where enabled))
         or b.id = any(p_booking_ids)
    ), '[]'::jsonb)
  )
$$;

-- Activate / deactivate / pause / resume / stop. Re-activating an already
-- active booking in the same epoch changes nothing (no new welcome).
create or replace function public.portal_email_set_automation(
  p_booking_id text, p_action text, p_user uuid default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_epoch integer := (select mode_epoch from public.portal_email_settings where id = 1);
  v_row public.portal_email_bookings;
begin
  insert into public.portal_email_bookings (booking_id) values (p_booking_id)
  on conflict (booking_id) do nothing;
  select * into v_row from public.portal_email_bookings where booking_id = p_booking_id for update;

  if p_action = 'activate' then
    if not (v_row.enabled and v_row.mode_epoch = v_epoch) then
      update public.portal_email_bookings
      set enabled = true, paused = false, mode_epoch = v_epoch, active_since = now(),
          stopped_reason = null, stopped_at = null
      where booking_id = p_booking_id;
    end if;
  elsif p_action = 'deactivate' then
    update public.portal_email_bookings set enabled = false where booking_id = p_booking_id;
  elsif p_action = 'pause' then
    update public.portal_email_bookings set paused = true where booking_id = p_booking_id;
  elsif p_action = 'resume' then
    if not v_row.enabled or v_row.mode_epoch is distinct from v_epoch then
      raise exception 'Portal emails must be enabled again for the current email mode.';
    end if;
    -- A new start time: nothing that happened while stopped is sent.
    update public.portal_email_bookings
    set paused = false, stopped_reason = null, stopped_at = null, active_since = now()
    where booking_id = p_booking_id;
  elsif p_action = 'stop' then
    update public.portal_email_bookings
    set stopped_reason = p_reason, stopped_at = now()
    where booking_id = p_booking_id and stopped_reason is null;
  else
    raise exception 'Unknown action %', p_action;
  end if;

  update public.portal_email_bookings set updated_at = now(), updated_by = p_user
  where booking_id = p_booking_id
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- Adds a message and claims its item events. Items whose event was already
-- claimed are dropped; a message left with no items is not created.
create or replace function public.portal_email_enqueue(p_message jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_items jsonb := coalesce(p_message -> 'items', '[]'::jsonb);
  v_kept jsonb;
begin
  insert into public.portal_email_messages (
    dedupe_key, booking_id, booking_label, trigger, template_key, is_manual, use_real_data,
    confirm_completed, mode, mode_epoch, recipient, items, created_by)
  -- Automatic messages are keyed by their events: concurrent planners
  -- building the same email collide here, different events never do.
  select coalesce(p_message ->> 'dedupe_key',
      'automatic|' || md5((select string_agg(item ->> 'key', ',' order by item ->> 'key')
                           from jsonb_array_elements(v_items) item))),
    p_message ->> 'booking_id', p_message ->> 'booking_label',
    p_message ->> 'trigger', p_message ->> 'template_key',
    coalesce((p_message ->> 'is_manual')::boolean, false),
    coalesce((p_message ->> 'use_real_data')::boolean, false),
    coalesce((p_message ->> 'confirm_completed')::boolean, false),
    s.mode, s.mode_epoch, lower(btrim(p_message ->> 'recipient')), v_items,
    nullif(p_message ->> 'created_by', '')::uuid
  from public.portal_email_settings s where s.id = 1
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null or p_message ->> 'trigger' <> 'automatic' then
    return v_id;
  end if;

  with inserted as (
    insert into public.portal_email_item_events (event_key, booking_id, message_id)
    select item ->> 'key', p_message ->> 'booking_id', v_id
    from jsonb_array_elements(v_items) item
    on conflict (event_key) do nothing
    returning event_key
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_kept
  from jsonb_array_elements(v_items) item
  where item ->> 'key' in (select event_key from inserted);

  if jsonb_array_length(v_kept) = 0 then
    delete from public.portal_email_messages where id = v_id;
    return null;
  end if;
  update public.portal_email_messages set items = v_kept where id = v_id;
  return v_id;
end;
$$;

-- Atomically claims due messages. Serialised by an advisory lock so the
-- live cap cannot be overrun by concurrent workers. Also:
--   * 'sending' rows older than 15 minutes become 'uncertain' (the
--     provider may have accepted them); they are never resent automatically;
--   * queued rows from another mode/epoch are cancelled;
--   * queued rows older than 24 hours expire (no catch-up);
--   * live rows over the rolling 24-hour cap are blocked, not deferred.
create or replace function public.portal_email_claim(p_limit integer, p_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.portal_email_settings;
  v_room integer;
  v_claimed jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('portal_email_claim'));
  select * into s from public.portal_email_settings where id = 1;

  update public.portal_email_messages
  set status = 'uncertain', updated_at = now(),
      status_detail = 'No result was recorded after sending started. Check the provider log before retrying.'
  where status = 'sending' and claimed_at < now() - interval '15 minutes';

  update public.portal_email_messages
  set status = 'cancelled', updated_at = now(), status_detail = 'The email mode changed after this was queued.'
  where status = 'queued' and mode_epoch <> s.mode_epoch;

  update public.portal_email_messages
  set status = 'expired', updated_at = now(), status_detail = 'Not sent within 24 hours; old messages are never sent late.'
  where status = 'queued' and next_attempt_at < now() - interval '24 hours';

  v_room := greatest(0, s.live_cap_per_day - (
    select count(*) from public.portal_email_messages
    where mode = 'live' and claimed_at > now() - interval '24 hours'
      and status in ('sending', 'accepted', 'delivered', 'bounced', 'uncertain')));

  with locked as (
    select id, mode, created_at
    from public.portal_email_messages
    where status = 'queued' and next_attempt_at <= now() and mode_epoch = s.mode_epoch
      and (p_ids is null or id = any(p_ids))
    order by created_at, id
    limit greatest(1, least(coalesce(p_limit, s.batch_size), 25))
    for update skip locked
  ),
  due as (
    select id, mode, row_number() over (partition by (mode = 'live') order by created_at, id) as live_rank
    from locked
  ),
  over_cap as (
    update public.portal_email_messages m
    set status = 'blocked', updated_at = now(),
        status_detail = 'Daily live sending cap reached. Not sent; use a manual resend if it is still needed.'
    from due where m.id = due.id and due.mode = 'live' and due.live_rank > v_room
    returning m.id
  ),
  claimed as (
    update public.portal_email_messages m
    set status = 'sending', claimed_at = now(), attempts = m.attempts + 1, updated_at = now()
    from due where m.id = due.id and not (due.mode = 'live' and due.live_rank > v_room)
    returning m.*
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into v_claimed from claimed c;

  return v_claimed;
end;
$$;

-- Records the outcome of one claimed message. 'retry' requeues with backoff
-- up to 3 attempts, then becomes p_exhausted_status ('failed' or 'uncertain').
create or replace function public.portal_email_finish(
  p_id uuid, p_status text, p_detail text default null, p_provider_id text default null,
  p_subject text default null, p_exhausted_status text default 'failed'
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  update public.portal_email_messages m
  set status = case
        when p_status <> 'retry' then p_status
        when m.attempts >= 3 then p_exhausted_status
        else 'queued' end,
      next_attempt_at = now() + make_interval(mins => 5 * m.attempts),
      status_detail = left(p_detail, 500),
      provider_message_id = coalesce(p_provider_id, m.provider_message_id),
      subject = coalesce(p_subject, m.subject),
      sent_at = case when p_status = 'accepted' then now() else m.sent_at end,
      updated_at = now()
  where m.id = p_id and m.status = 'sending'
  returning status into v_status;
  return v_status;
end;
$$;

-- Staff retry of a failed or uncertain message: same id, so the provider's
-- idempotency key (24 hours) prevents a duplicate if it was in fact sent.
create or replace function public.portal_email_requeue(p_id uuid)
returns boolean language sql security definer set search_path = public as $$
  update public.portal_email_messages
  set status = 'queued', attempts = 0, next_attempt_at = now(), updated_at = now(),
      status_detail = 'Retried by staff.'
  where id = p_id and status in ('failed', 'uncertain')
    and mode_epoch = (select mode_epoch from public.portal_email_settings where id = 1)
  returning true
$$;

-- Delivery results from the provider webhook.
create or replace function public.portal_email_webhook(p_provider_id text, p_status text, p_detail text default null)
returns boolean language sql security definer set search_path = public as $$
  update public.portal_email_messages
  set status = p_status, status_detail = coalesce(left(p_detail, 500), status_detail), updated_at = now()
  where provider_message_id = p_provider_id and p_status in ('delivered', 'bounced')
    and status in ('accepted', 'delivered', 'uncertain')
  returning true
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'portal_email_load(text[])', 'portal_email_set_automation(text,text,uuid,text)',
    'portal_email_enqueue(jsonb)', 'portal_email_claim(integer,uuid[])',
    'portal_email_finish(uuid,text,text,text,text,text)', 'portal_email_requeue(uuid)',
    'portal_email_webhook(text,text,text)', 'portal_email_latch_complete()',
    'portal_email_latch_booking_change()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
  end loop;
  grant execute on function public.portal_email_load(text[]), public.portal_email_set_automation(text,text,uuid,text),
    public.portal_email_enqueue(jsonb), public.portal_email_claim(integer,uuid[]),
    public.portal_email_finish(uuid,text,text,text,text,text), public.portal_email_requeue(uuid),
    public.portal_email_webhook(text,text,text) to service_role;
end
$$;
