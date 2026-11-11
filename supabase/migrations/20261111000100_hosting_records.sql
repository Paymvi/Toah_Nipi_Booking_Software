-- Hosting records: no guest portal access. Review before running; safe to run more than once.
-- Run with the SQL editor (or `npx supabase db query --linked -f <this file>`), never `db push`.
--
-- Hosting is internal use of the property, not a guest booking. The app
-- classifies it with one rule (src/utils/bookingClassification.js,
-- isHostRecord); public.is_hosting_booking below is the same rule for the
-- database. A record is hosting when:
--   * organization_name starts "Host" or "Hosting" followed by ":", "-", "–" or "—"
--     (the staff naming convention, for example "Host: Board retreat"), or
--   * retreat_type is exactly "Host" or "Hosting" (new entries and conversions).
--
-- What this changes:
--   1. A hosting row never holds a guest portal link. bookings_hosting_guard
--      clears portal_token on every insert and update of a hosting row:
--      staff edits, conversion from a booking, backup restores and imports
--      alike. Every guest path (get_portal_record and the other portal_* RPCs,
--      guest uploads through portal_upload_path_is_allowed, and the
--      portal-sign function) finds the booking by portal_token, so an old
--      hosting link resolves to nothing and accepts nothing.
--      A record converted back to a booking stays without a link; staff create
--      a new one on purpose ("Create Guest Portal Link"), so an old link is
--      never reactivated.
--   2. One-time backfill: clears the link on hosting rows that already have
--      one, and stops any portal email automation still on for them.
--
-- Nothing is deleted. Portal tasks, documents, signatures, email history and
-- uploaded files keep their rows and storage paths and stay readable by staff.
--
-- Preview before running (read-only):
--   select id, organization_name, retreat_type, portal_token is not null as has_link
--   from public.bookings
--   where public.is_hosting_booking(organization_name, retreat_type)    -- after step 1 exists
--   order by start_date nulls last;
--
-- Rollback: drop trigger bookings_hosting_guard on public.bookings;
--           drop function public.bookings_hosting_guard(); drop function public.is_hosting_booking(text, text);
--   Cleared links cannot be restored by rollback (they are not kept; a backup
--   file made before running still has them).

-- 1. The classification rule.
create or replace function public.is_hosting_booking(p_organization_name text, p_retreat_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_organization_name ~* '^\s*host(ing)?\s*[:–—-]', false)
      or coalesce(p_retreat_type ~* '^\s*host(ing)?\s*$', false)
$$;

-- 2. Hosting rows never hold a guest portal link.
create or replace function public.bookings_hosting_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_hosting_booking(new.organization_name, new.retreat_type) then
    new.portal_token := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_hosting_guard on public.bookings;
create trigger bookings_hosting_guard
before insert or update on public.bookings
for each row execute function public.bookings_hosting_guard();

-- 3. Backfill (repeatable: touches only hosting rows that still have a link).
update public.bookings
set portal_token = null
where portal_token is not null
  and public.is_hosting_booking(organization_name, retreat_type);

do $$
begin
  if to_regclass('public.portal_email_bookings') is not null then
    update public.portal_email_bookings a
    set stopped_reason = 'ineligible', stopped_at = now(), updated_at = now()
    from public.bookings b
    where b.id = a.booking_id
      and a.enabled
      and a.stopped_reason is null
      and public.is_hosting_booking(b.organization_name, b.retreat_type);
  end if;
end
$$;

-- Verify (expect 0 and 0):
--   select count(*) from public.bookings
--   where portal_token is not null and public.is_hosting_booking(organization_name, retreat_type);
--   select count(*) from public.portal_email_bookings a join public.bookings b on b.id = a.booking_id
--   where a.enabled and a.stopped_reason is null and public.is_hosting_booking(b.organization_name, b.retreat_type);
