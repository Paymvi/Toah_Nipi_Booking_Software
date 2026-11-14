-- Staff app Orders: staff request supplies or equipment; purchasing tracks
-- each item through Requested -> Ordered -> Received (or Cancelled).
-- Submitting records a request only; nothing is bought. Review before
-- running; safe to run more than once. Run in the SQL editor, never `db push`.
--
-- Requires 20261113000100_staff_app.sql (staff_app_access, the limited role).
--
-- Who may do what (enforced here; the UI only mirrors it)
--   Read:      any active staff app account (office or limited).
--   Request:   the same, except viewer (office read-only) accounts.
--   Edit / cancel a request: its requester, only while every item is still
--              Requested ("unprocessed"); purchasing may edit unprocessed
--              requests too.
--   Status:    purchasing = can_manage_bookings() (admin and staff office
--              accounts), any item, any status, with a short note.
--
-- Who did it: the signed-in account (auth.uid()) is always recorded. Limited
-- accounts are individual, so their profile name is used. Office accounts may
-- be the shared login (SEC-02), so they must also give the person's name,
-- like "Working as" in the office app; the app remembers it per device.
--
-- Nothing is ever deleted: cancelled and received requests stay as history,
-- and every request, edit and status change is in staff_order_events.
-- The tables have no API grants at all: only the functions below read or
-- write them, so guest portal (anon) and direct table access see nothing.
--
-- Rollback (loses every request):
--   drop function if exists public.staff_app_order_set_status(uuid[], text, text, text),
--     public.staff_app_order_save(uuid, text, date, text, text, boolean, jsonb, text),
--     public.staff_app_orders(boolean), public.staff_app_order_json(public.staff_order_requests),
--     public.staff_app_order_status(uuid), public.staff_app_order_actor(text);
--   drop table if exists public.staff_order_events, public.staff_order_items, public.staff_order_requests;

do $$
begin
  if to_regprocedure('public.staff_app_access()') is null then
    raise exception 'Run supabase/migrations/20261113000100_staff_app.sql first.';
  end if;
end $$;

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.staff_order_requests (
  id uuid primary key,                -- made by the app, so a retried submit cannot create a duplicate
  department text not null check (department in ('kitchen', 'turnover', 'maintenance', 'other')),
  needed_by date,
  notes text not null default '' check (char_length(notes) <= 1000),
  product_link text not null default '' check (char_length(product_link) <= 500),
  urgent boolean not null default false,
  requested_by uuid not null,         -- auth.uid() of the account that sent it
  requested_by_name text not null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_order_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.staff_order_requests (id) on delete cascade,
  position integer not null,
  name text not null check (char_length(name) between 1 and 120),
  quantity text not null check (char_length(quantity) between 1 and 40),
  status text not null default 'requested' check (status in ('requested', 'ordered', 'received', 'cancelled')),
  status_note text not null default '' check (char_length(status_note) <= 300),
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_changed_by_name text
);

create table if not exists public.staff_order_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.staff_order_requests (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  action text not null check (action in ('requested', 'edited', 'status')),
  item_name text,                     -- copied, so history reads the same after an edit
  status text,
  note text not null default ''
);

create index if not exists staff_order_items_request_idx on public.staff_order_items (request_id, position);
create index if not exists staff_order_events_request_idx on public.staff_order_events (request_id, at);
create index if not exists staff_order_requests_updated_idx on public.staff_order_requests (updated_at desc);

alter table public.staff_order_requests enable row level security;
alter table public.staff_order_items enable row level security;
alter table public.staff_order_events enable row level security;
revoke all on public.staff_order_requests from public, anon, authenticated;
revoke all on public.staff_order_items from public, anon, authenticated;
revoke all on public.staff_order_events from public, anon, authenticated;

-- 2. Helpers --------------------------------------------------------------------

-- The person to record: the profile name for limited accounts, the typed name for office accounts.
create or replace function public.staff_app_order_actor(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.staff_profiles;
  v_name text;
begin
  select * into v_profile from public.staff_profiles where user_id = auth.uid() and is_active = true limit 1;
  if v_profile.user_id is null then
    raise exception 'This account does not have staff app access.' using errcode = '42501';
  end if;
  v_name := case when v_profile.role = 'limited' then v_profile.full_name else btrim(coalesce(p_name, '')) end;
  if coalesce(v_name, '') = '' then
    raise exception 'Enter your name so others know who did this.' using errcode = '22023';
  end if;
  return left(v_name, 80);
end;
$$;

-- Overall progress from the items: cancelled when all are; received when nothing
-- is left open; ordered when every open item is at least ordered; else requested.
create or replace function public.staff_app_order_status(p_request uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when count(*) = count(*) filter (where status = 'cancelled') then 'cancelled'
    when count(*) filter (where status in ('requested', 'ordered')) = 0 then 'received'
    when count(*) filter (where status = 'requested') = 0 then 'ordered'
    else 'requested'
  end
  from public.staff_order_items
  where request_id = p_request
$$;

create or replace function public.staff_app_order_json(r public.staff_order_requests)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'department', r.department,
    'neededBy', r.needed_by,
    'notes', r.notes,
    'productLink', r.product_link,
    'urgent', r.urgent,
    'requestedByName', r.requested_by_name,
    'mine', r.requested_by = auth.uid(),
    'requestedAt', r.requested_at,
    'updatedAt', r.updated_at,
    'status', public.staff_app_order_status(r.id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'quantity', i.quantity, 'status', i.status,
        'note', i.status_note, 'changedAt', i.status_changed_at, 'changedBy', i.status_changed_by_name)
        order by i.position), '[]'::jsonb)
      from public.staff_order_items i where i.request_id = r.id
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', e.at, 'by', e.actor_name, 'action', e.action, 'itemName', e.item_name,
        'status', e.status, 'note', e.note) order by e.at, e.id), '[]'::jsonb)
      from public.staff_order_events e where e.request_id = r.id
    )
  )
$$;

-- 3. Functions the app calls -----------------------------------------------------

-- p_history = false: every open request. true: finished ones (received or cancelled), newest first.
create or replace function public.staff_app_orders(p_history boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_requests jsonb;
begin
  if public.staff_app_access() is null then
    raise exception 'This account does not have staff app access.' using errcode = '42501';
  end if;

  if coalesce(p_history, false) then
    -- shortcut: history shows the 200 most recently finished; add paging if that stops being enough.
    select jsonb_agg(h.j order by h.u desc) into v_requests
    from (
      select public.staff_app_order_json(r) j, r.updated_at u
      from public.staff_order_requests r
      where public.staff_app_order_status(r.id) in ('received', 'cancelled')
      order by r.updated_at desc
      limit 200
    ) h;
  else
    select jsonb_agg(public.staff_app_order_json(r) order by r.urgent desc, r.needed_by nulls last, r.requested_at)
      into v_requests
    from public.staff_order_requests r
    where public.staff_app_order_status(r.id) in ('requested', 'ordered');
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'canRequest', public.current_staff_role() is distinct from 'viewer',
    'canPurchase', public.can_manage_bookings(),
    'nameRequired', public.staff_app_access() = 'office',
    'requests', coalesce(v_requests, '[]'::jsonb)
  );
end;
$$;

-- Create (new p_id) or edit (existing p_id). Items: [{ "name": "...", "quantity": "..." }, ...].
-- Sending the same request again changes nothing, so a retry after a lost response is safe.
create or replace function public.staff_app_order_save(
  p_id uuid, p_department text, p_needed_by date, p_notes text, p_product_link text,
  p_urgent boolean, p_items jsonb, p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_notes text := btrim(coalesce(p_notes, ''));
  v_link text := btrim(coalesce(p_product_link, ''));
  v_items jsonb;
  v_row public.staff_order_requests;
  v_old jsonb;
begin
  if public.staff_app_access() is null or public.current_staff_role() = 'viewer' then
    raise exception 'This account cannot make requests.' using errcode = '42501';
  end if;
  v_actor := public.staff_app_order_actor(p_actor_name);

  if p_id is null then
    raise exception 'Missing request id.' using errcode = '22023';
  end if;
  if p_department is null or p_department not in ('kitchen', 'turnover', 'maintenance', 'other') then
    raise exception 'Choose a department: Kitchen, Turnover, Maintenance or Other.' using errcode = '22023';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Notes are limited to 1,000 characters.' using errcode = '22023';
  end if;
  if v_link <> '' and (v_link !~* '^https?://[^\s]+$' or char_length(v_link) > 500) then
    raise exception 'The product link must be a web address starting with http:// or https://.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Add between 1 and 30 items.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', btrim(coalesce(e.value ->> 'name', '')),
           'quantity', btrim(coalesce(e.value ->> 'quantity', ''))) order by e.ordinality), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(p_items) with ordinality e;
  if exists (
    select 1 from jsonb_array_elements(v_items) i
    where char_length(i ->> 'name') not between 1 and 120 or char_length(i ->> 'quantity') not between 1 and 40
  ) then
    raise exception 'Each item needs a name (up to 120 characters) and a quantity (up to 40).' using errcode = '22023';
  end if;

  insert into public.staff_order_requests (id, department, needed_by, notes, product_link, urgent, requested_by, requested_by_name)
  values (p_id, p_department, p_needed_by, v_notes, v_link, coalesce(p_urgent, false), auth.uid(), v_actor)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is not null then
    insert into public.staff_order_items (request_id, position, name, quantity)
    select p_id, i.ordinality, i.value ->> 'name', i.value ->> 'quantity'
    from jsonb_array_elements(v_items) with ordinality i;
    insert into public.staff_order_events (request_id, actor_id, actor_name, action)
    values (p_id, auth.uid(), v_actor, 'requested');
    return public.staff_app_order_json(v_row);
  end if;

  -- Edit.
  select * into v_row from public.staff_order_requests where id = p_id for update;
  if not (v_row.requested_by = auth.uid() or public.can_manage_bookings()) then
    raise exception 'You can only change your own requests.' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_order_items where request_id = p_id and status <> 'requested') then
    raise exception 'Purchasing has already started on this request, so it can no longer be edited. Ask them to change it.'
      using errcode = '55000';
  end if;

  select jsonb_build_object(
    'department', v_row.department, 'neededBy', v_row.needed_by, 'notes', v_row.notes,
    'link', v_row.product_link, 'urgent', v_row.urgent,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity) order by position), '[]'::jsonb)
              from public.staff_order_items where request_id = p_id))
    into v_old;
  if v_old = jsonb_build_object(
    'department', p_department, 'neededBy', p_needed_by, 'notes', v_notes,
    'link', v_link, 'urgent', coalesce(p_urgent, false), 'items', v_items) then
    return public.staff_app_order_json(v_row);
  end if;

  update public.staff_order_requests
     set department = p_department, needed_by = p_needed_by, notes = v_notes, product_link = v_link,
         urgent = coalesce(p_urgent, false), updated_at = now()
   where id = p_id
  returning * into v_row;
  -- Every item is still Requested, so replacing them loses no status history.
  delete from public.staff_order_items where request_id = p_id;
  insert into public.staff_order_items (request_id, position, name, quantity)
  select p_id, i.ordinality, i.value ->> 'name', i.value ->> 'quantity'
  from jsonb_array_elements(v_items) with ordinality i;
  insert into public.staff_order_events (request_id, actor_id, actor_name, action)
  values (p_id, auth.uid(), v_actor, 'edited');
  return public.staff_app_order_json(v_row);
end;
$$;

-- Set the status of some items (one request or several). Purchasing: any change.
-- A requester: only 'cancelled', only on their own unprocessed requests.
create or replace function public.staff_app_order_set_status(
  p_item_ids uuid[], p_status text, p_note text, p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_note text := btrim(coalesce(p_note, ''));
  v_requests uuid[];
begin
  if public.staff_app_access() is null or public.current_staff_role() = 'viewer' then
    raise exception 'This account cannot change requests.' using errcode = '42501';
  end if;
  v_actor := public.staff_app_order_actor(p_actor_name);
  if p_status is null or p_status not in ('requested', 'ordered', 'received', 'cancelled') then
    raise exception 'Choose a status: requested, ordered, received or cancelled.' using errcode = '22023';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'The note is limited to 300 characters.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_item_ids), 0) not between 1 and 100 then
    raise exception 'Choose at least one item.' using errcode = '22023';
  end if;

  select array_agg(distinct request_id) into v_requests from public.staff_order_items where id = any (p_item_ids);
  if (select count(*) from public.staff_order_items where id = any (p_item_ids)) <> cardinality(array(select distinct unnest(p_item_ids))) then
    raise exception 'Some of these items no longer exist. Refresh and try again.' using errcode = 'P0002';
  end if;
  perform 1 from public.staff_order_requests where id = any (v_requests) order by id for update;

  if not public.can_manage_bookings() then
    if p_status <> 'cancelled' then
      raise exception 'Only purchasing can mark items ordered or received.' using errcode = '42501';
    end if;
    if exists (select 1 from public.staff_order_requests where id = any (v_requests) and requested_by is distinct from auth.uid())
       or exists (select 1 from public.staff_order_items where request_id = any (v_requests) and status <> 'requested') then
      raise exception 'You can cancel only your own requests, before purchasing has started on them.' using errcode = '42501';
    end if;
  end if;

  with changed as (
    update public.staff_order_items
       set status = p_status, status_note = v_note, status_changed_at = now(),
           status_changed_by = auth.uid(), status_changed_by_name = v_actor
     where id = any (p_item_ids) and (status is distinct from p_status or status_note is distinct from v_note)
    returning request_id, name
  ), logged as (
    insert into public.staff_order_events (request_id, actor_id, actor_name, action, item_name, status, note)
    select request_id, auth.uid(), v_actor, 'status', name, p_status, v_note from changed
    returning request_id
  )
  update public.staff_order_requests set updated_at = now()
   where id in (select request_id from logged);

  return coalesce((
    select jsonb_agg(public.staff_app_order_json(r)) from public.staff_order_requests r where r.id = any (v_requests)
  ), '[]'::jsonb);
end;
$$;

-- 4. Grants -----------------------------------------------------------------------
revoke all on function public.staff_app_order_actor(text) from public, anon, authenticated;
revoke all on function public.staff_app_order_status(uuid) from public, anon, authenticated;
revoke all on function public.staff_app_order_json(public.staff_order_requests) from public, anon, authenticated;

revoke all on function public.staff_app_orders(boolean) from public, anon;
grant execute on function public.staff_app_orders(boolean) to authenticated;
revoke all on function public.staff_app_order_save(uuid, text, date, text, text, boolean, jsonb, text) from public, anon;
grant execute on function public.staff_app_order_save(uuid, text, date, text, text, boolean, jsonb, text) to authenticated;
revoke all on function public.staff_app_order_set_status(uuid[], text, text, text) from public, anon;
grant execute on function public.staff_app_order_set_status(uuid[], text, text, text) to authenticated;

-- Verify (read-only), signed in as an office account:
--   select jsonb_array_length(public.staff_app_orders(false) -> 'requests');
--   select count(*) from public.staff_order_requests;   -- the API cannot read this table at all
