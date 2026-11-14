-- Staff app, version one: limited staff access, staff-safe booking reads and
-- a change history for operational fields. Review before running; safe to
-- run more than once. Run in the SQL editor, never `db push`.
--
-- Requires, in this order: 20261110000100_role_helpers_never_null.sql and
-- 20261111000100_hosting_records.sql (public.is_hosting_booking).
--
-- What this changes
--   1. staff_profiles gains a fourth role, 'limited', and a departments list
--      (only 'kitchen' for now). 'viewer' keeps its meaning: an office
--      account that reads everything.
--   2. is_active_staff() now means "office account" (admin, staff, viewer).
--      Every existing read policy (bookings, guest inquiries, portal tables,
--      email tables, staff directory, contact stars, storage files) uses it,
--      so a limited account can read none of those tables directly.
--   3. Limited accounts (and office accounts) read bookings only through the
--      staff_app_* functions below. They return an explicit allowlist of
--      fields: never contacts, notes, rates, payments, contracts, portal
--      tokens or raw booking JSON. Dietary text goes to kitchen and office
--      accounts only.
--   4. booking_change_log records changes to the operational fields the staff
--      app shows, from every save path (trigger on bookings), with the
--      signed-in actor when there is one. Nothing is backfilled: history
--      starts when this runs.
--   5. Admins assign access to individual Auth accounts with
--      staff_app_admin_set_access (also used by User Admin in the app).
--
-- Hosting records stay out of the staff app unless the office ticks
-- "Kitchen should plan for this" on the hosting record
-- (rentalFormDetails.kitchenInternalMeals = true); they then show as Internal.
--
-- Rollback (in this order):
--   drop trigger if exists bookings_log_operational_changes on public.bookings;
--   drop function if exists public.staff_app_admin_set_access(text, text, text, text[], boolean),
--     public.staff_app_admin_list(), public.staff_app_booking(text), public.staff_app_bookings(date, date),
--     public.staff_app_me(), public.staff_app_project(public.bookings, boolean, text, integer),
--     public.bookings_log_operational_changes(), public.staff_app_operational_values(public.bookings),
--     public.staff_app_record_kind(public.bookings), public.staff_app_can_see_dietary(),
--     public.staff_app_access(), public.staff_app_truthy(jsonb), public.staff_app_unknown_text(text);
--   drop table if exists public.booking_change_log;
--   -- then restore is_active_staff() (definition in the live schema copy) and, once
--   -- no profile uses 'limited', the old role check and the departments column.

do $$
begin
  if to_regprocedure('public.is_hosting_booking(text, text)') is null then
    raise exception 'Run supabase/migrations/20261111000100_hosting_records.sql first.';
  end if;
end $$;

-- 1. Roles and departments -------------------------------------------------

alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;
alter table public.staff_profiles add constraint staff_profiles_role_check
  check (role in ('admin', 'staff', 'viewer', 'limited'));

alter table public.staff_profiles add column if not exists departments text[] not null default '{}';
alter table public.staff_profiles drop constraint if exists staff_profiles_departments_check;
alter table public.staff_profiles add constraint staff_profiles_departments_check
  check (departments <@ array['kitchen']::text[]);

-- 2. Office-only reads ------------------------------------------------------

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in ('admin', 'staff', 'viewer'), false)
$$;

-- 'office' | 'limited' | null (no active profile).
create or replace function public.staff_app_access()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when role in ('admin', 'staff', 'viewer') then 'office'
    when role = 'limited' then 'limited'
  end
  from public.staff_profiles
  where user_id = auth.uid() and is_active = true
  limit 1
$$;

create or replace function public.staff_app_can_see_dietary()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role in ('admin', 'staff', 'viewer') or (role = 'limited' and 'kitchen' = any (departments))
    from public.staff_profiles
    where user_id = auth.uid() and is_active = true
    limit 1
  ), false)
$$;

-- 3. Which bookings the staff app shows -------------------------------------
-- Mirrors src/utils/bookingClassification.js (getRecordKind, isActiveBooking)
-- and dbRowToBooking defaults; tests/staffAppSql.test.js and
-- supabase/tests/staff-app.pglite.mjs keep the two in step.

create or replace function public.staff_app_unknown_text(p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(btrim(p_value) ~* '^(n/?a|none|unknown|tbd|\?|[-–—])$', false)
$$;

-- JavaScript truthiness of a JSON value.
create or replace function public.staff_app_truthy(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case jsonb_typeof(p_value)
    when 'string' then p_value #>> '{}' <> ''
    when 'number' then (p_value #>> '{}')::numeric <> 0
    when 'boolean' then (p_value #>> '{}')::boolean
    when 'object' then true
    when 'array' then true
    else false
  end
$$;

-- 'booking', 'internal' (hosting the kitchen should plan for), or null (not shown).
create or replace function public.staff_app_record_kind(b public.bookings)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_source_type text := lower(btrim(coalesce(nullif(b.source_type, ''), 'Form')));
  v_import text := lower(btrim(coalesce(b.detected_import_type, '')));
  v_sheet text := lower(btrim(coalesce(b.source_sheet, '')));
  v_source text := concat_ws(' ', nullif(v_source_type, ''), nullif(v_import, ''), nullif(v_sheet, ''));
  v_status text := lower(btrim(coalesce(nullif(b.status, ''), 'Inquiry')));
  v_details jsonb := case when jsonb_typeof(b.raw_data -> 'rentalFormDetails') = 'object'
                          then b.raw_data -> 'rentalFormDetails' else '{}'::jsonb end;
  v_cancelled boolean;
  v_waitlisted boolean;
begin
  v_cancelled := v_status like '%cancel%'
    or (btrim(coalesce(b.date_of_cancellation, '')) <> ''
        and not public.staff_app_unknown_text(b.date_of_cancellation)
        and not public.staff_app_truthy(v_details -> 'reinstatedAt'));
  v_waitlisted := v_status like '%wait%' or lower(btrim(coalesce(nullif(b.waitlist, ''), 'No'))) = 'yes';

  if public.is_hosting_booking(b.organization_name, b.retreat_type) then
    return case
      when not v_cancelled and (v_details -> 'kitchenInternalMeals') = 'true'::jsonb then 'internal'
    end;
  end if;

  if v_cancelled or v_waitlisted then return null; end if;
  if v_source_type = 'archive' or v_import = 'archive' or v_status like '%archive%' then return null; end if;
  if v_source_type = 'staff booking' or v_import = 'staff booking' or v_source ~ '\mmaster\M' then
    return 'booking';
  end if;
  if v_source like '%guest group%' and v_source like '%inquir%' then return null; end if;
  if (v_source_type in ('', 'form'))
     and not public.staff_app_truthy(v_details -> 'sourceInquiryId')
     and v_status in ('', 'inquiry') then
    return null;
  end if;
  return 'booking';
end;
$$;

-- 4. Change history -----------------------------------------------------------

create table if not exists public.booking_change_log (
  id bigint generated always as identity primary key,
  booking_id text not null references public.bookings (id) on delete cascade,
  changed_at timestamptz not null default now(),
  actor_id uuid,          -- auth.uid() of the session that saved; null for system writes
  actor_name text,        -- staff_profiles.full_name at the time, when known
  field text not null,
  old_value jsonb,
  new_value jsonb
);

create index if not exists booking_change_log_booking_idx on public.booking_change_log (booking_id, changed_at desc);
create index if not exists booking_change_log_time_idx on public.booking_change_log (changed_at desc);

alter table public.booking_change_log enable row level security;
revoke all on public.booking_change_log from public, anon, authenticated;
grant select on public.booking_change_log to authenticated;
drop policy if exists "Office staff read booking changes" on public.booking_change_log;
create policy "Office staff read booking changes" on public.booking_change_log
  for select to authenticated using (public.is_active_staff());

-- The operational values the staff app shows, by field name. Empty text is null.
create or replace function public.staff_app_operational_values(b public.bookings)
returns jsonb
language sql
stable
set search_path = public
as $$
  with d as (
    select case when jsonb_typeof(b.raw_data -> 'rentalFormDetails') = 'object'
                then b.raw_data -> 'rentalFormDetails' else '{}'::jsonb end as r
  ),
  v as (
    select jsonb_build_object(
      'organizationName', nullif(btrim(b.organization_name), ''),
      'startDate', b.start_date,
      'endDate', b.end_date,
      'showsInStaffApp', public.staff_app_record_kind(b),
      'attendeeCount', nullif(btrim(b.attendee_count), ''),
      'meals', nullif(btrim(b.meals), ''),
      'foodAllergies', nullif(btrim(b.food_allergies), ''),
      'lodging', nullif(btrim(b.buildings_rooms), ''),
      'activitiesText', nullif(btrim(b.activities), '')
    ) || (
      select coalesce(jsonb_object_agg(k, d.r -> k), '{}'::jsonb)
      from unnest(array[
        'arrivalTime', 'departureTime', 'breakfastTime', 'lunchTime', 'dinnerTime',
        'mealSchedule', 'mealNotes', 'approxTotalGuests', 'approxAdultGuests',
        'approxChildrenUnder3', 'approxChildren3to17', 'actualAdultGuests',
        'actualChildrenUnder3', 'actualChildren3to17', 'dayCamperCount', 'dayCamperMeals',
        'activities', 'activityNotes', 'facilities', 'facilityNotes', 'kitchenInternalMeals'
      ]) as k
      where d.r -> k is not null
        and d.r -> k <> 'null'::jsonb
        and d.r -> k <> '""'::jsonb
        and d.r -> k <> '{}'::jsonb
        and d.r -> k <> '[]'::jsonb
    ) as values
    from d
  )
  select jsonb_strip_nulls(values) from v
$$;

create or replace function public.bookings_log_operational_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.booking_change_log (booking_id, actor_id, actor_name, field, old_value, new_value)
  select new.id,
         v_actor,
         (select full_name from public.staff_profiles where user_id = v_actor),
         coalesce(n.key, o.key),
         o.value,
         n.value
  from jsonb_each(public.staff_app_operational_values(new)) n
  full join jsonb_each(public.staff_app_operational_values(old)) o on o.key = n.key
  where o.value is distinct from n.value;
  return null;
end;
$$;

drop trigger if exists bookings_log_operational_changes on public.bookings;
create trigger bookings_log_operational_changes
after update on public.bookings
for each row
when (old.* is distinct from new.*)
execute function public.bookings_log_operational_changes();

-- 5. Staff-safe projection ------------------------------------------------------
-- Every key is listed. Nested arrays and objects are rebuilt field by field.

create or replace function public.staff_app_project(b public.bookings, p_dietary boolean, p_kind text, p_change_days integer)
returns jsonb
language sql
stable
set search_path = public
as $$
  with d as (
    select case when jsonb_typeof(b.raw_data -> 'rentalFormDetails') = 'object'
                then b.raw_data -> 'rentalFormDetails' else '{}'::jsonb end as r,
           case when jsonb_typeof(b.raw_data -> 'rawSpreadsheetData') = 'object'
                then b.raw_data -> 'rawSpreadsheetData' else '{}'::jsonb end as sheet
  )
  select jsonb_build_object(
    'id', b.id,
    'kind', p_kind,
    'organizationName', b.organization_name,
    'retreatType', b.retreat_type,
    'sourceType', coalesce(nullif(b.source_type, ''), 'Form'),
    'startDate', b.start_date,
    'endDate', b.end_date,
    'updatedAt', b.updated_at,
    'attendeeCount', b.attendee_count,
    'persons', b.persons,
    'meals', b.meals,
    'mealCount', b.meal_count,
    'foodAllergies', case when p_dietary then b.food_allergies end,
    'buildingsRooms', b.buildings_rooms,
    'roomName', b.room_name,
    'activities', b.activities,
    'facilities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', f ->> 'date', 'time', f ->> 'time', 'task', f ->> 'task',
        'assignedTo', f ->> 'assignedTo', 'notes', f ->> 'notes')), '[]'::jsonb)
      from jsonb_array_elements(case
        when jsonb_typeof(d.r -> 'facilities') = 'array' then d.r -> 'facilities'
        when jsonb_typeof(b.raw_data -> 'facilities') = 'array' then b.raw_data -> 'facilities'
        else '[]'::jsonb end) f
      where jsonb_typeof(f) = 'object'
    ),
    'rawSpreadsheetData', (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      from jsonb_each(d.sheet) e
      where lower(regexp_replace(e.key, '[^A-Za-z0-9]+', '', 'g')) in ('meals', 'mealplan', 'snackforarrival')
        and jsonb_typeof(e.value) in ('string', 'number')
    ),
    'rentalFormDetails', (
      select coalesce(jsonb_object_agg(k, d.r -> k), '{}'::jsonb)
      from unnest(array[
        'arrivalTime', 'departureTime', 'breakfastTime', 'lunchTime', 'dinnerTime',
        'firstMeal', 'lastMeal', 'numberOfMeals', 'numberOfNights', 'mealNotes', 'importedMealText',
        'approxTotalGuests', 'approxAdultGuests', 'approxChildrenUnder3', 'approxChildren3to17',
        'approxChildrenGuests', 'actualAdultGuests', 'actualChildrenUnder3', 'actualChildren3to17',
        'actualChildrenGuests', 'importedGuestCountKind', 'importedGuestCountText',
        'dayCamperCount', 'dayCamperMeals', 'activityNotes', 'facilityNotes', 'kitchenInternalMeals',
        -- Lodging counts (src/constants/lodgingConstants.js; tests/staffAppSql.test.js checks this list).
        'lodgingBethel', 'lodgingBethelUpperRoom1', 'lodgingBethelUpperRoom2', 'lodgingBethelMiddleRoom3',
        'lodgingBethelMiddleRoom4', 'lodgingBethelMiddleRoom5', 'lodgingBethelMiddleRoom6',
        'lodgingBethelLowerRoom11', 'lodgingBethelLowerRoom7', 'lodgingBethelLowerRoom8',
        'lodgingBethelLowerRoom9', 'lodgingBethelLowerRoom10', 'lodgingHebronThird',
        'lodgingHebronThirdRoom1', 'lodgingHebronThirdRoom2', 'lodgingHebronThirdRoom3',
        'lodgingHebronThirdRoom4', 'lodgingHebronBunks', 'lodgingHebronBunksMens',
        'lodgingHebronBunksWomens', 'lodgingDothan', 'lodgingDothanUpperRoom1', 'lodgingDothanUpperRoom2',
        'lodgingDothanMiddleRoom3', 'lodgingDothanMiddleRoom4', 'lodgingDothanMiddleRoom5',
        'lodgingDothanMiddleRoom6', 'lodgingAjalon', 'lodgingCapernaum', 'lodgingGuestHouse',
        'lodgingCamping', 'lodgingCampingTent', 'lodgingCampingRV'
      ]) as k
      where jsonb_typeof(d.r -> k) in ('string', 'number', 'boolean')
    ) || jsonb_build_object(
      'mealSchedule', (
        select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
          'breakfast', coalesce(e.value -> 'breakfast' = 'true'::jsonb, false),
          'lunch', coalesce(e.value -> 'lunch' = 'true'::jsonb, false),
          'dinner', coalesce(e.value -> 'dinner' = 'true'::jsonb, false))), '{}'::jsonb)
        from jsonb_each(case when jsonb_typeof(d.r -> 'mealSchedule') = 'object' then d.r -> 'mealSchedule' else '{}'::jsonb end) e
        where e.key ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(e.value) = 'object'
      ),
      'activities', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', a ->> 'date', 'time', a ->> 'time', 'activity', a ->> 'activity')), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(d.r -> 'activities') = 'array' then d.r -> 'activities' else '[]'::jsonb end) a
        where jsonb_typeof(a) = 'object'
      ),
      -- Absent (null) unless the Housing tab saved it: its presence alone marks Housing values as the lodging record.
      'housingUsage', case when jsonb_typeof(d.r -> 'housingUsage') = 'object' then (
        select coalesce(jsonb_object_agg(k, (d.r -> 'housingUsage' -> k) = 'true'::jsonb), '{}'::jsonb)
        from unnest(array['lodgingBethel', 'lodgingHebronThird', 'lodgingHebronBunks', 'lodgingDothan',
                          'lodgingAjalon', 'lodgingCapernaum', 'lodgingGuestHouse', 'lodgingCamping']) as k
        where d.r -> 'housingUsage' ? k
      ) end,
      'housingSavedAt', case when public.staff_app_truthy(d.r -> 'housingSavedAt') then true end,
      'staffEditedFields', jsonb_build_object(
        'lodging', public.staff_app_truthy(d.r -> 'staffEditedFields' -> 'lodging'))
    ),
    'guestCountConfirmed', exists (
      select 1 from public.portal_checklist_items i
      where i.booking_id = b.id and i.item_id = 'guest-count' and i.status = 'completed'
    ),
    'guestCountConfirmedAt', (
      select max(coalesce(i.last_changed_at, i.updated_at)) from public.portal_checklist_items i
      where i.booking_id = b.id and i.item_id = 'guest-count' and i.status = 'completed'
    ),
    'lastChangedAt', (select max(c.changed_at) from public.booking_change_log c where c.booking_id = b.id),
    'changes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field', c.field, 'at', c.changed_at, 'by', c.actor_name, 'bySignedInUser', c.actor_id is not null,
        'old', c.old_value, 'new', c.new_value) order by c.changed_at desc, c.id desc), '[]'::jsonb)
      from (
        select * from public.booking_change_log c
        where c.booking_id = b.id
          and c.changed_at >= now() - make_interval(days => p_change_days)
          and (p_dietary or c.field <> 'foodAllergies')
        order by c.changed_at desc, c.id desc
        limit 50
      ) c
    )
  )
  from d
$$;

-- 6. Functions the app calls ----------------------------------------------------

create or replace function public.staff_app_me()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'access', public.staff_app_access(),
    'role', p.role,
    'departments', case when p.role = 'limited' then to_jsonb(p.departments) else '["kitchen"]'::jsonb end,
    'fullName', p.full_name,
    'canSeeDietary', public.staff_app_can_see_dietary(),
    'historySince', (select min(changed_at) from public.booking_change_log)
  )
  from (select 1) one
  left join public.staff_profiles p on p.user_id = auth.uid() and p.is_active = true
$$;

create or replace function public.staff_app_bookings(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dietary boolean := public.staff_app_can_see_dietary();
begin
  if public.staff_app_access() is null then
    raise exception 'This account does not have staff app access.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 120 then
    raise exception 'Choose a date range of up to 120 days.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'canSeeDietary', v_dietary,
    'bookings', coalesce((
      select jsonb_agg(public.staff_app_project(b, v_dietary, k.kind, 14) order by b.start_date, b.organization_name, b.id)
      from public.bookings b
      cross join lateral (select public.staff_app_record_kind(b) as kind) k
      where k.kind is not null
        and b.start_date is not null
        and b.start_date <= p_to
        and coalesce(b.end_date, b.start_date) >= p_from
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_app_booking(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dietary boolean := public.staff_app_can_see_dietary();
  v_result jsonb;
begin
  if public.staff_app_access() is null then
    raise exception 'This account does not have staff app access.' using errcode = '42501';
  end if;

  select public.staff_app_project(b, v_dietary, k.kind, 60) into v_result
  from public.bookings b
  cross join lateral (select public.staff_app_record_kind(b) as kind) k
  where b.id = p_id and k.kind is not null;

  return jsonb_build_object('generatedAt', now(), 'canSeeDietary', v_dietary, 'booking', v_result);
end;
$$;

-- Admin: every Auth account with its staff access (or none).
create or replace function public.staff_app_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_staff_admin() then
    raise exception 'Only administrators can view staff access.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', u.id,
      'email', coalesce(p.email, u.email),
      'fullName', p.full_name,
      'role', p.role,
      'departments', coalesce(to_jsonb(p.departments), '[]'::jsonb),
      'isActive', coalesce(p.is_active, false),
      'hasProfile', p.user_id is not null,
      'lastSignInAt', u.last_sign_in_at,
      'isBanned', coalesce(u.banned_until > now(), false)
    ) order by p.user_id is null, lower(coalesce(p.full_name, u.email)))
    from auth.users u
    left join public.staff_profiles p on p.user_id = u.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.staff_app_admin_set_access(
  p_email text, p_full_name text, p_role text, p_departments text[], p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_row public.staff_profiles;
begin
  if not public.is_staff_admin() then
    raise exception 'Only administrators can change staff access.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'staff', 'viewer', 'limited') then
    raise exception 'Choose a role: admin, staff, viewer or limited.' using errcode = '22023';
  end if;
  if not coalesce(p_departments, '{}') <@ array['kitchen']::text[] then
    raise exception 'Unknown department. Available: kitchen.' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = v_email order by created_at limit 1;
  if v_user is null then
    raise exception 'No sign-in account uses %. Create or invite the person in Supabase Authentication first.', v_email
      using errcode = 'P0002';
  end if;
  if v_user = auth.uid() then
    raise exception 'You cannot change your own access. Ask another administrator.' using errcode = '42501';
  end if;

  insert into public.staff_profiles (user_id, email, full_name, role, departments, is_active)
  values (
    v_user, v_email,
    coalesce(nullif(btrim(p_full_name), ''), split_part(v_email, '@', 1)),
    p_role,
    case when p_role = 'limited' then coalesce(p_departments, '{}') else '{}' end,
    coalesce(p_is_active, true)
  )
  on conflict (user_id) do update set
    full_name = coalesce(nullif(btrim(p_full_name), ''), public.staff_profiles.full_name),
    role = excluded.role,
    departments = excluded.departments,
    is_active = excluded.is_active,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'userId', v_row.user_id, 'email', v_row.email, 'fullName', v_row.full_name,
    'role', v_row.role, 'departments', to_jsonb(v_row.departments), 'isActive', v_row.is_active
  );
end;
$$;

-- 7. Grants -----------------------------------------------------------------------
-- Internal helpers: nobody calls them directly.
revoke all on function public.staff_app_unknown_text(text) from public, anon, authenticated;
revoke all on function public.staff_app_truthy(jsonb) from public, anon, authenticated;
revoke all on function public.staff_app_record_kind(public.bookings) from public, anon, authenticated;
revoke all on function public.staff_app_operational_values(public.bookings) from public, anon, authenticated;
revoke all on function public.staff_app_project(public.bookings, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.bookings_log_operational_changes() from public, anon, authenticated;

-- Signed-in users only; each function checks the account itself.
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;
revoke all on function public.staff_app_access() from public, anon;
grant execute on function public.staff_app_access() to authenticated;
revoke all on function public.staff_app_can_see_dietary() from public, anon;
grant execute on function public.staff_app_can_see_dietary() to authenticated;
revoke all on function public.staff_app_me() from public, anon;
grant execute on function public.staff_app_me() to authenticated;
revoke all on function public.staff_app_bookings(date, date) from public, anon;
grant execute on function public.staff_app_bookings(date, date) to authenticated;
revoke all on function public.staff_app_booking(text) from public, anon;
grant execute on function public.staff_app_booking(text) to authenticated;
revoke all on function public.staff_app_admin_list() from public, anon;
grant execute on function public.staff_app_admin_list() to authenticated;
revoke all on function public.staff_app_admin_set_access(text, text, text, text[], boolean) from public, anon;
grant execute on function public.staff_app_admin_set_access(text, text, text, text[], boolean) to authenticated;

-- Verify (read-only), signed in as each kind of account:
--   select public.staff_app_me();
--   select jsonb_array_length(public.staff_app_bookings(current_date, current_date + 7) -> 'bookings');
--   select count(*) from public.bookings;   -- a limited account sees 0 rows
