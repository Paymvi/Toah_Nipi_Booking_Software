# SQL_SETUP.md

# Toah Nipi Booking Dashboard: Supabase SQL Setup

**System:** Toah Nipi Staff Dashboard / Booking Management
**Database:** Supabase PostgreSQL
**Primary table:** `public.bookings`
**Staff permission table:** `public.staff_profiles`
**Security model:** Supabase Auth + Row Level Security
**Document status:** Internal technical setup guide
**Last updated:** June 14, 2026

---

## 1. Purpose

This file contains the SQL needed to set up the Toah Nipi Supabase database for the booking dashboard.

It includes:

* The main `bookings` table
* The `staff_profiles` permission table
* Helper functions for staff-role checks
* Row Level Security policies
* Cleanup for temporary development policies
* Verification queries
* First-admin setup
* Optional fake-data cleanup

This file is meant to be run through the Supabase SQL Editor.

---

## 2. Important Safety Warning

Do **not** import real booking data until all temporary anonymous policies are removed.

During development, temporary policies may have existed with names like:

```txt
TEMP DEV allow anon select bookings
TEMP DEV allow anon insert bookings
TEMP DEV allow anon update bookings
TEMP DEV allow anon delete bookings
```

Those policies allowed anonymous users to access the `bookings` table.

That was acceptable only for fake/test data.

Before real data goes in, the system should follow this rule:

```txt
No login = no booking data.
Logged in but not approved staff = no booking data.
Approved viewer = read only.
Approved staff = read, add, edit.
Approved admin = read, add, edit, delete.
```

---

## 3. How To Use This File

Recommended order:

1. Confirm Supabase Auth settings.
2. Run Script 01 to create extensions/helpers.
3. Run Script 02 to create the `bookings` table.
4. Run Script 03 to create the `staff_profiles` table.
5. Run Script 04 to create updated-at triggers.
6. Run Script 05 to create staff security helper functions.
7. Run Script 06 to remove old anonymous development access.
8. Run Script 07 to add secure RLS policies for staff profiles.
9. Run Script 08 to add secure RLS policies for bookings.
10. Create your first Supabase Auth user.
11. Run Script 09 to make that user an admin.
12. Run Script 10 to verify policies and permissions.
13. Only after verification, delete fake data and import real data.

---

## 4. Required Supabase Auth Settings

These are not SQL settings. Configure these in the Supabase dashboard.

Go to:

```txt
Authentication
  → Providers / Sign In
```

or:

```txt
Authentication
  → Configuration
  → General
```

Recommended settings before real data:

```txt
Allow new users to sign up: OFF
Allow anonymous sign-ins: OFF
```

Staff accounts should be created manually by an admin.

---

# SCRIPT 01: Extensions and Basic Setup

Run this first.

```sql
create extension if not exists pgcrypto;
```

---

# SCRIPT 02: Create the Bookings Table

This creates the main cloud table for dashboard booking data.

Safe to run more than once because it uses `create table if not exists`.

```sql
create table if not exists public.bookings (
  id text primary key,

  portal_token text unique default encode(gen_random_bytes(16), 'hex'),

  source_type text default 'Form',
  source_sheet text,
  source_row_number text,
  detected_import_type text,

  organization_name text not null default 'Unnamed Organization',
  contact_name text,
  email text,
  phone text,

  start_date date,
  end_date date,
  desired_dates_text text,

  attendee_count text,
  retreat_type text,
  promo_code text,
  notes text,
  waitlist text default 'No',
  status text default 'Inquiry',

  room_name text,
  returning_status text,
  buildings_rooms text,
  meals text,
  food_allergies text,
  need_to_know text,
  linen_sets text,
  activities text,

  persons text,
  nights text,
  meal_count text,
  camper_days text,
  usage_fee text,
  lodging_cost text,
  food_cost text,
  misc_cost text,

  stage_of_group text,
  schedule text,
  min_paying_guests text,
  max_paying_guests text,
  guest_rate text,
  expected_minimum_revenue text,
  invoice_lodging_meals text,
  deposit text,
  deposit_received text,
  date_of_cancellation text,
  reason_for_cancellation text,
  vacancy_filled text,
  monthly_projected_income text,

  archive_address text,
  archive_city text,
  archive_state text,
  archive_zip text,
  archive_guest_group text,
  archive_visit_date text,
  archive_all_prior_visit_dates text,
  archive_visit_count text,
  archive_source_pdf_link text,
  archive_prior_visit_links jsonb default '[]'::jsonb,
  archive_confidence jsonb,

  program_logistics_assignments jsonb default '[]'::jsonb,
  checklists jsonb,
  raw_data jsonb,

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 02-B: Add Missing Columns If the Table Already Existed

If an older version of the `bookings` table already existed, run this to make sure all expected columns exist.

```sql
alter table public.bookings
add column if not exists portal_token text unique default encode(gen_random_bytes(16), 'hex'),

add column if not exists source_type text default 'Form',
add column if not exists source_sheet text,
add column if not exists source_row_number text,
add column if not exists detected_import_type text,

add column if not exists organization_name text not null default 'Unnamed Organization',
add column if not exists contact_name text,
add column if not exists email text,
add column if not exists phone text,

add column if not exists start_date date,
add column if not exists end_date date,
add column if not exists desired_dates_text text,

add column if not exists attendee_count text,
add column if not exists retreat_type text,
add column if not exists promo_code text,
add column if not exists notes text,
add column if not exists waitlist text default 'No',
add column if not exists status text default 'Inquiry',

add column if not exists room_name text,
add column if not exists returning_status text,
add column if not exists buildings_rooms text,
add column if not exists meals text,
add column if not exists food_allergies text,
add column if not exists need_to_know text,
add column if not exists linen_sets text,
add column if not exists activities text,

add column if not exists persons text,
add column if not exists nights text,
add column if not exists meal_count text,
add column if not exists camper_days text,
add column if not exists usage_fee text,
add column if not exists lodging_cost text,
add column if not exists food_cost text,
add column if not exists misc_cost text,

add column if not exists stage_of_group text,
add column if not exists schedule text,
add column if not exists min_paying_guests text,
add column if not exists max_paying_guests text,
add column if not exists guest_rate text,
add column if not exists expected_minimum_revenue text,
add column if not exists invoice_lodging_meals text,
add column if not exists deposit text,
add column if not exists deposit_received text,
add column if not exists date_of_cancellation text,
add column if not exists reason_for_cancellation text,
add column if not exists vacancy_filled text,
add column if not exists monthly_projected_income text,

add column if not exists archive_address text,
add column if not exists archive_city text,
add column if not exists archive_state text,
add column if not exists archive_zip text,
add column if not exists archive_guest_group text,
add column if not exists archive_visit_date text,
add column if not exists archive_all_prior_visit_dates text,
add column if not exists archive_visit_count text,
add column if not exists archive_source_pdf_link text,
add column if not exists archive_prior_visit_links jsonb default '[]'::jsonb,
add column if not exists archive_confidence jsonb,

add column if not exists program_logistics_assignments jsonb default '[]'::jsonb,
add column if not exists checklists jsonb,
add column if not exists raw_data jsonb,

add column if not exists submitted_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();
```

---

## 02-C: Recommended Indexes for Bookings

These indexes help common dashboard queries perform better.

```sql
create index if not exists bookings_start_date_idx
on public.bookings (start_date);

create index if not exists bookings_end_date_idx
on public.bookings (end_date);

create index if not exists bookings_status_idx
on public.bookings (status);

create index if not exists bookings_waitlist_idx
on public.bookings (waitlist);

create index if not exists bookings_email_idx
on public.bookings (email);

create index if not exists bookings_organization_name_idx
on public.bookings (organization_name);

create index if not exists bookings_source_type_idx
on public.bookings (source_type);

create index if not exists bookings_created_at_idx
on public.bookings (created_at);
```

---

# SCRIPT 03: Create the Staff Profiles Table

This table controls who is considered approved staff.

A user being logged in through Supabase Auth is not enough.

The user also needs an active row in `public.staff_profiles`.

```sql
create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'staff'
    check (role in ('admin', 'staff', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Recommended index:

```sql
create index if not exists staff_profiles_email_idx
on public.staff_profiles (email);

create index if not exists staff_profiles_role_idx
on public.staff_profiles (role);

create index if not exists staff_profiles_is_active_idx
on public.staff_profiles (is_active);
```

---

# SCRIPT 04: Updated-At Trigger

This automatically updates the `updated_at` column whenever a row changes.

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

Apply it to `bookings`:

```sql
drop trigger if exists set_bookings_updated_at on public.bookings;

create trigger set_bookings_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();
```

Apply it to `staff_profiles`:

```sql
drop trigger if exists set_staff_profiles_updated_at on public.staff_profiles;

create trigger set_staff_profiles_updated_at
before update on public.staff_profiles
for each row
execute function public.set_updated_at();
```

---

# SCRIPT 05: Staff Security Helper Functions

These functions are used by RLS policies.

They answer questions like:

```txt
Is this logged-in user active staff?
Is this user allowed to manage bookings?
Is this user an admin?
```

```sql
create or replace function public.current_staff_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.staff_profiles
  where user_id = auth.uid()
    and is_active = true
  limit 1
$$;
```

```sql
create or replace function public.is_active_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() is not null
$$;
```

```sql
create or replace function public.can_manage_bookings()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() in ('admin', 'staff')
$$;
```

```sql
create or replace function public.is_staff_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() = 'admin'
$$;
```

Lock down direct function access and then grant execution only to authenticated users.

```sql
revoke all on function public.current_staff_role() from public;
revoke all on function public.is_active_staff() from public;
revoke all on function public.can_manage_bookings() from public;
revoke all on function public.is_staff_admin() from public;

grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.can_manage_bookings() to authenticated;
grant execute on function public.is_staff_admin() to authenticated;
```

---

# SCRIPT 06: Remove Temporary Anonymous Development Access

This is one of the most important scripts.

Run this before importing real data.

It removes old fake-data development policies and revokes anonymous access to the `bookings` table.

```sql
drop policy if exists "TEMP DEV allow anon select bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon insert bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon update bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon delete bookings" on public.bookings;

drop policy if exists "Staff can read bookings" on public.bookings;
drop policy if exists "Staff can insert bookings" on public.bookings;
drop policy if exists "Staff can update bookings" on public.bookings;
drop policy if exists "Staff can delete bookings" on public.bookings;

drop policy if exists "Active staff can read bookings" on public.bookings;
drop policy if exists "Staff can insert bookings" on public.bookings;
drop policy if exists "Staff can update bookings" on public.bookings;
drop policy if exists "Admins can delete bookings" on public.bookings;

revoke select, insert, update, delete on table public.bookings from anon;

alter table public.bookings enable row level security;
```

Plain-English result:

```txt
Anonymous users should no longer be able to read, add, edit, or delete bookings.
```

---

# SCRIPT 07: Staff Profiles RLS Policies

Enable RLS on the staff profiles table.

```sql
alter table public.staff_profiles enable row level security;
```

Grant base access to authenticated users.

RLS policies still decide what they can actually see or update.

```sql
grant usage on schema public to authenticated;
grant select, update on table public.staff_profiles to authenticated;
```

Remove old policies if they exist.

```sql
drop policy if exists "Staff can read own profile" on public.staff_profiles;
drop policy if exists "Admins can read all staff profiles" on public.staff_profiles;
drop policy if exists "Admins can update staff profiles" on public.staff_profiles;
```

Allow staff to read their own profile.

```sql
create policy "Staff can read own profile"
on public.staff_profiles
for select
to authenticated
using (user_id = auth.uid());
```

Allow admins to read all staff profiles.

```sql
create policy "Admins can read all staff profiles"
on public.staff_profiles
for select
to authenticated
using (public.is_staff_admin());
```

Allow admins to update staff profiles.

```sql
create policy "Admins can update staff profiles"
on public.staff_profiles
for update
to authenticated
using (public.is_staff_admin())
with check (public.is_staff_admin());
```

Notes:

* This does not allow normal staff to edit their own role.
* This does not allow random logged-in users to become staff.
* New staff profiles should be inserted manually through Supabase SQL Editor for now.
* Later, an admin-only staff management screen can be added.

---

# SCRIPT 08: Bookings RLS Policies

Grant base access to authenticated users.

RLS policies still decide what they can actually do.

```sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.bookings to authenticated;
```

Make sure RLS is enabled.

```sql
alter table public.bookings enable row level security;
```

Remove old booking policies if they exist.

```sql
drop policy if exists "Active staff can read bookings" on public.bookings;
drop policy if exists "Staff can insert bookings" on public.bookings;
drop policy if exists "Staff can update bookings" on public.bookings;
drop policy if exists "Admins can delete bookings" on public.bookings;
```

Allow active staff to read bookings.

```sql
create policy "Active staff can read bookings"
on public.bookings
for select
to authenticated
using (public.is_active_staff());
```

Allow active `staff` and `admin` users to insert/import bookings.

```sql
create policy "Staff can insert bookings"
on public.bookings
for insert
to authenticated
with check (public.can_manage_bookings());
```

Allow active `staff` and `admin` users to update bookings.

```sql
create policy "Staff can update bookings"
on public.bookings
for update
to authenticated
using (public.can_manage_bookings())
with check (public.can_manage_bookings());
```

Allow only active admins to delete bookings.

```sql
create policy "Admins can delete bookings"
on public.bookings
for delete
to authenticated
using (public.is_staff_admin());
```

Final intended booking permissions:

| Role                    | Read | Insert / Import | Update | Delete |
| ----------------------- | ---: | --------------: | -----: | -----: |
| Anonymous               |   No |              No |     No |     No |
| Logged in but not staff |   No |              No |     No |     No |
| Inactive staff          |   No |              No |     No |     No |
| Viewer                  |  Yes |              No |     No |     No |
| Staff                   |  Yes |             Yes |    Yes |     No |
| Admin                   |  Yes |             Yes |    Yes |    Yes |

---

# SCRIPT 09: Create the First Admin Staff Profile

Before running this script, create a user in Supabase Auth.

Go to:

```txt
Authentication
  → Users
  → Add user
```

Create yourself as a user.

Then find your user ID:

```sql
select id, email, created_at
from auth.users
order by created_at desc;
```

Copy the user ID.

Then replace the placeholder values below.

```sql
insert into public.staff_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active
)
values (
  'PASTE-YOUR-AUTH-USER-UUID-HERE',
  'your-email@example.com',
  'Your Name',
  'admin',
  true
)
on conflict (user_id)
do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

Example role options:

```txt
viewer
staff
admin
```

---

# SCRIPT 10: Add Additional Staff Users

Create each staff member in Supabase Auth first.

Then add them to `staff_profiles`.

Example for a normal staff user:

```sql
insert into public.staff_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active
)
values (
  'PASTE-STAFF-AUTH-USER-UUID-HERE',
  'staff@example.com',
  'Staff Name',
  'staff',
  true
)
on conflict (user_id)
do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

Example for a read-only viewer:

```sql
insert into public.staff_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active
)
values (
  'PASTE-VIEWER-AUTH-USER-UUID-HERE',
  'viewer@example.com',
  'Viewer Name',
  'viewer',
  true
)
on conflict (user_id)
do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

---

# SCRIPT 11: Remove or Disable a Staff Member

Recommended approach:

Do not delete staff profiles unless necessary.

Instead, set `is_active = false`.

```sql
update public.staff_profiles
set is_active = false
where email = 'staff@example.com';
```

Optional: confirm they are inactive.

```sql
select user_id, email, full_name, role, is_active
from public.staff_profiles
where email = 'staff@example.com';
```

Recommended additional step:

Disable or delete the user in Supabase Auth if they should no longer be able to log in at all.

---

# SCRIPT 12: Verification Queries

Use these before importing real data.

## 12-A: Confirm RLS Is Enabled

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('bookings', 'staff_profiles');
```

Expected result:

```txt
bookings        rowsecurity = true
staff_profiles  rowsecurity = true
```

---

## 12-B: Confirm No Temporary Development Policies Remain

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'bookings'
order by policyname;
```

Expected booking policies:

```txt
Active staff can read bookings
Staff can insert bookings
Staff can update bookings
Admins can delete bookings
```

Bad policies that should not appear:

```txt
TEMP DEV allow anon select bookings
TEMP DEV allow anon insert bookings
TEMP DEV allow anon update bookings
TEMP DEV allow anon delete bookings
```

---

## 12-C: Confirm Anonymous Users Do Not Have Booking Table Grants

```sql
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'bookings'
  and grantee = 'anon'
order by privilege_type;
```

Expected result:

```txt
No rows
```

If this returns `SELECT`, `INSERT`, `UPDATE`, or `DELETE`, anonymous access still exists and must be removed.

---

## 12-D: Confirm Authenticated Booking Grants Exist

```sql
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'bookings'
  and grantee = 'authenticated'
order by privilege_type;
```

Expected result:

```txt
authenticated DELETE
authenticated INSERT
authenticated SELECT
authenticated UPDATE
```

This is okay because RLS still limits who can actually use those privileges.

---

## 12-E: Confirm Staff Profiles Exist

```sql
select
  email,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
from public.staff_profiles
order by created_at;
```

Expected result:

```txt
At least one active admin exists.
```

---

## 12-F: Confirm There Is At Least One Admin

```sql
select
  email,
  full_name,
  role,
  is_active
from public.staff_profiles
where role = 'admin'
  and is_active = true;
```

Expected result:

```txt
At least one row.
```

Do not remove the final active admin unless another active admin exists.

---

## 12-G: Inspect All Public Policies

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Use this as a general policy audit.

---

# SCRIPT 13: Optional Fake Data Cleanup

Only run this when the `bookings` table contains fake/test data.

Do not run this after real data has been imported unless you intentionally want to delete all bookings.

```sql
delete from public.bookings;
```

Confirm the table is empty:

```sql
select count(*) as booking_count
from public.bookings;
```

Expected result:

```txt
0
```

---

# SCRIPT 14: Optional Test Insert

Only use this for fake data testing.

This test insert should only work when run in SQL Editor as the project owner.

Frontend inserts should only work after a valid staff user logs in.

```sql
insert into public.bookings (
  id,
  organization_name,
  contact_name,
  email,
  phone,
  start_date,
  end_date,
  attendee_count,
  retreat_type,
  status,
  source_type
)
values (
  'test-booking-001',
  'Fake Test Church',
  'Test Contact',
  'test@example.com',
  '555-555-5555',
  '2026-07-01',
  '2026-07-03',
  '25',
  'Retreat',
  'Inquiry',
  'Manual Test'
)
on conflict (id)
do update set
  organization_name = excluded.organization_name,
  contact_name = excluded.contact_name,
  email = excluded.email,
  phone = excluded.phone,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  attendee_count = excluded.attendee_count,
  retreat_type = excluded.retreat_type,
  status = excluded.status,
  source_type = excluded.source_type,
  updated_at = now();
```

To remove the test row:

```sql
delete from public.bookings
where id = 'test-booking-001';
```

---

# SCRIPT 15: Emergency Lockdown

Use this if real data was imported too early or if there is concern that anonymous access is still open.

This immediately removes anonymous booking access and removes known temporary policies.

```sql
drop policy if exists "TEMP DEV allow anon select bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon insert bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon update bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon delete bookings" on public.bookings;

revoke select, insert, update, delete on table public.bookings from anon;

alter table public.bookings enable row level security;
```

Then inspect policies:

```sql
select
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'bookings'
order by policyname;
```

Then inspect anonymous grants:

```sql
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'bookings'
  and grantee = 'anon';
```

Expected anonymous grant result:

```txt
No rows
```

---

# SCRIPT 16: Full Policy Reset for Bookings

Use this only if booking policies become messy and need to be rebuilt.

This does not delete booking data.

```sql
drop policy if exists "TEMP DEV allow anon select bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon insert bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon update bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon delete bookings" on public.bookings;

drop policy if exists "Staff can read bookings" on public.bookings;
drop policy if exists "Staff can insert bookings" on public.bookings;
drop policy if exists "Staff can update bookings" on public.bookings;
drop policy if exists "Staff can delete bookings" on public.bookings;

drop policy if exists "Active staff can read bookings" on public.bookings;
drop policy if exists "Staff can insert bookings" on public.bookings;
drop policy if exists "Staff can update bookings" on public.bookings;
drop policy if exists "Admins can delete bookings" on public.bookings;

revoke select, insert, update, delete on table public.bookings from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.bookings to authenticated;

alter table public.bookings enable row level security;

create policy "Active staff can read bookings"
on public.bookings
for select
to authenticated
using (public.is_active_staff());

create policy "Staff can insert bookings"
on public.bookings
for insert
to authenticated
with check (public.can_manage_bookings());

create policy "Staff can update bookings"
on public.bookings
for update
to authenticated
using (public.can_manage_bookings())
with check (public.can_manage_bookings());

create policy "Admins can delete bookings"
on public.bookings
for delete
to authenticated
using (public.is_staff_admin());
```

---

# SCRIPT 17: Full Policy Reset for Staff Profiles

Use this only if staff profile policies become messy and need to be rebuilt.

This does not delete staff profiles.

```sql
drop policy if exists "Staff can read own profile" on public.staff_profiles;
drop policy if exists "Admins can read all staff profiles" on public.staff_profiles;
drop policy if exists "Admins can update staff profiles" on public.staff_profiles;

grant usage on schema public to authenticated;
grant select, update on table public.staff_profiles to authenticated;

alter table public.staff_profiles enable row level security;

create policy "Staff can read own profile"
on public.staff_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can read all staff profiles"
on public.staff_profiles
for select
to authenticated
using (public.is_staff_admin());

create policy "Admins can update staff profiles"
on public.staff_profiles
for update
to authenticated
using (public.is_staff_admin())
with check (public.is_staff_admin());
```

---

# SCRIPT 18: Check Table Columns

Use this if the frontend errors because a column is missing.

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
order by ordinal_position;
```

Check staff profile columns:

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'staff_profiles'
order by ordinal_position;
```

---

# SCRIPT 19: Check Current Booking Count

```sql
select count(*) as booking_count
from public.bookings;
```

---

# SCRIPT 20: Check Recent Bookings

```sql
select
  id,
  organization_name,
  contact_name,
  email,
  start_date,
  end_date,
  status,
  source_type,
  created_at,
  updated_at
from public.bookings
order by created_at desc
limit 25;
```

---

# SCRIPT 21: Check Staff List

```sql
select
  user_id,
  email,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
from public.staff_profiles
order by full_name;
```

---

# SCRIPT 22: Promote a Staff User to Admin

Use carefully.

```sql
update public.staff_profiles
set role = 'admin'
where email = 'staff@example.com';
```

Verify:

```sql
select email, full_name, role, is_active
from public.staff_profiles
where email = 'staff@example.com';
```

---

# SCRIPT 23: Demote an Admin to Staff

Use carefully.

Make sure this does not remove the last active admin.

```sql
update public.staff_profiles
set role = 'staff'
where email = 'admin@example.com';
```

Check active admins:

```sql
select email, full_name, role, is_active
from public.staff_profiles
where role = 'admin'
  and is_active = true;
```

---

# SCRIPT 24: Make a User Read-Only

```sql
update public.staff_profiles
set role = 'viewer'
where email = 'staff@example.com';
```

---

# SCRIPT 25: Reactivate a Staff User

```sql
update public.staff_profiles
set is_active = true
where email = 'staff@example.com';
```

---

# SCRIPT 26: Final Pre-Real-Data SQL Checklist

Run these before importing real booking/contact data.

## Confirm RLS

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('bookings', 'staff_profiles');
```

Expected:

```txt
bookings = true
staff_profiles = true
```

## Confirm no anonymous booking grants

```sql
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'bookings'
  and grantee = 'anon';
```

Expected:

```txt
No rows
```

## Confirm no TEMP DEV policies

```sql
select
  policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'bookings'
  and policyname ilike '%TEMP DEV%';
```

Expected:

```txt
No rows
```

## Confirm secure booking policies

```sql
select
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'bookings'
order by policyname;
```

Expected:

```txt
Active staff can read bookings
Admins can delete bookings
Staff can insert bookings
Staff can update bookings
```

## Confirm active admin exists

```sql
select
  email,
  full_name,
  role,
  is_active
from public.staff_profiles
where role = 'admin'
  and is_active = true;
```

Expected:

```txt
At least one row
```

---

# 27. Production Security Notes

Before real data:

```txt
[ ] Public signup is disabled in Supabase Auth.
[ ] Anonymous sign-ins are disabled in Supabase Auth.
[ ] TEMP DEV anon policies are deleted.
[ ] anon has no SELECT/INSERT/UPDATE/DELETE grants on bookings.
[ ] RLS is enabled on bookings.
[ ] RLS is enabled on staff_profiles.
[ ] Staff users exist in Supabase Auth.
[ ] Staff users exist in staff_profiles.
[ ] At least one active admin exists.
[ ] React dashboard requires Supabase login.
[ ] Incognito browser cannot see booking data.
[ ] Logged-in non-staff user cannot see booking data.
[ ] Inactive staff user cannot see booking data.
[ ] Viewer can read only.
[ ] Staff can read/add/edit but not delete.
[ ] Admin can read/add/edit/delete.
[ ] No service_role key exists in frontend code.
[ ] No secret key exists in frontend code.
[ ] .env.local is not committed.
```

---

# 28. Plain-English Security Summary

The frontend React app uses a publishable Supabase key.

That key may be visible in the browser.

That is normal.

The database is protected by:

```txt
Supabase Auth
+ staff_profiles table
+ Row Level Security policies
```

The intended final rule is:

```txt
Anonymous users get nothing.
Logged-in users get nothing unless they are active staff.
Viewers can read.
Staff can read, add, and edit.
Admins can read, add, edit, and delete.
```

---

# 29. Emergency Reminder

If something seems wrong, run the emergency lockdown first:

```sql
drop policy if exists "TEMP DEV allow anon select bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon insert bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon update bookings" on public.bookings;
drop policy if exists "TEMP DEV allow anon delete bookings" on public.bookings;

revoke select, insert, update, delete on table public.bookings from anon;

alter table public.bookings enable row level security;
```

Then verify:

```sql
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'bookings'
  and grantee = 'anon';
```

Expected:

```txt
No rows
```

---

# 30. Recommended Git Commit

After adding this file to the repo:

```bash
git add SQL_SETUP.md
git commit -m "Document Supabase SQL setup"
```

If the file is placed inside a docs folder:

```bash
git add docs/SQL_SETUP.md
git commit -m "Document Supabase SQL setup"
```
