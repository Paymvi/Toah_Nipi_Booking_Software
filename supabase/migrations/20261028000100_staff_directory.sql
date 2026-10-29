-- Shared staff directory (AUDIT-017).
--
-- One list of people for checklist, Facilities and staff assignments, the
-- same on every computer. It is separate from sign-in accounts (everyone
-- currently shares one login). Additive only: nothing existing changes.
--
-- Requires the helper functions from src/docs/SQL_SETUP.md Script 05:
-- public.is_active_staff() and public.can_manage_bookings().

create extension if not exists pgcrypto;

create table if not exists public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text not null default '',
  phone text not null default '',
  role_label text not null default 'Staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_directory is
  'People staff can assign work to. Not sign-in accounts; see staff_profiles for access.';

create index if not exists staff_directory_name_idx on public.staff_directory (lower(name));

-- Reuses the updated_at trigger function from SQL_SETUP Script 04.
drop trigger if exists set_staff_directory_updated_at on public.staff_directory;
create trigger set_staff_directory_updated_at
before update on public.staff_directory
for each row execute function public.set_updated_at();

alter table public.staff_directory enable row level security;

drop policy if exists "Active staff can read the staff directory" on public.staff_directory;
create policy "Active staff can read the staff directory"
on public.staff_directory for select to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can add to the staff directory" on public.staff_directory;
create policy "Staff can add to the staff directory"
on public.staff_directory for insert to authenticated
with check (public.can_manage_bookings());

drop policy if exists "Staff can edit the staff directory" on public.staff_directory;
create policy "Staff can edit the staff directory"
on public.staff_directory for update to authenticated
using (public.can_manage_bookings())
with check (public.can_manage_bookings());

drop policy if exists "Staff can remove from the staff directory" on public.staff_directory;
create policy "Staff can remove from the staff directory"
on public.staff_directory for delete to authenticated
using (public.can_manage_bookings());
