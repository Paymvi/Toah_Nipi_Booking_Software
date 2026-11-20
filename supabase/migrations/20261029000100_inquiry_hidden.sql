-- Inquiry rows hidden from the Inquiry Spreadsheet, shared by all staff.
--
-- inquiry_id is the inquiry booking's id (stable across re-imports, which
-- match rows by content). snapshot keeps the name, group and dates so the
-- Deleted panel can list the row.
--
-- Hiding a row never deletes the inquiry record. Additive only.

create table if not exists public.inquiry_hidden (
  inquiry_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  hidden_by uuid default auth.uid(),
  hidden_at timestamptz not null default now()
);

alter table public.inquiry_hidden enable row level security;

drop policy if exists "Active staff can read hidden inquiries" on public.inquiry_hidden;
create policy "Active staff can read hidden inquiries"
on public.inquiry_hidden for select to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can hide inquiries" on public.inquiry_hidden;
create policy "Staff can hide inquiries"
on public.inquiry_hidden for insert to authenticated
with check (public.can_manage_bookings());

drop policy if exists "Staff can update hidden inquiries" on public.inquiry_hidden;
create policy "Staff can update hidden inquiries"
on public.inquiry_hidden for update to authenticated
using (public.can_manage_bookings())
with check (public.can_manage_bookings());

drop policy if exists "Staff can restore hidden inquiries" on public.inquiry_hidden;
create policy "Staff can restore hidden inquiries"
on public.inquiry_hidden for delete to authenticated
using (public.can_manage_bookings());

-- Table grants (INT-05). New tables get no privileges by default on the live
-- project, so without these the policies above can never apply. RLS still
-- decides which rows each role may touch.
grant select, insert, update, delete on public.inquiry_hidden to authenticated;
