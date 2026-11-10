-- SEC-03 (docs/audit/SECURITY_AUDIT_2026-11-10.md). Review before running; safe to run more than once.
--
-- For a signed-in user with no active staff profile, current_staff_role() is
-- NULL, so is_staff_admin() and can_manage_bookings() return NULL instead of
-- false. Row-level security treats NULL as "no", but a PL/pgSQL check such as
-- `if not public.is_staff_admin() then raise ...` does NOT raise on NULL. That
-- is how portal_restore_signatures could be called by non-staff (fixed in that
-- function too). Returning a real false closes the trap for any future check.
--
-- Same signatures, owner, search_path and grants as live; only the result
-- changes from NULL to false. RLS behaviour is identical.
--
-- Rollback: run the previous definitions (docs/audit/ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql,
-- functions can_manage_bookings and is_staff_admin).

create or replace function public.can_manage_bookings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in ('admin', 'staff'), false)
$$;

create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() = 'admin', false)
$$;

-- Verify (expect: false, false for a signed-in non-staff user; unchanged for staff):
--   select public.can_manage_bookings(), public.is_staff_admin();
