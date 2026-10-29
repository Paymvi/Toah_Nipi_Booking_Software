-- Contact preferences stored online (AUDIT-049, Q-038 A).
--
-- contact_hidden: contacts hidden from Contacts View, shared by all staff.
--   identity_keys lists every email / phone / name+organization key of the
--   contact, so adding another email to a booking does not bring it back.
-- contact_stars: stars, one set per sign-in account (auth.uid()). Everyone
--   currently shares one login, so in practice stars are shared too.
--
-- Hiding a contact never deletes bookings. Additive only.

create table if not exists public.contact_hidden (
  contact_key text primary key,
  identity_keys text[] not null default '{}',
  snapshot jsonb not null default '{}'::jsonb,
  hidden_by uuid default auth.uid(),
  hidden_at timestamptz not null default now()
);

create index if not exists contact_hidden_identity_keys_idx
on public.contact_hidden using gin (identity_keys);

create table if not exists public.contact_stars (
  user_id uuid not null default auth.uid(),
  contact_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_key)
);

alter table public.contact_hidden enable row level security;
alter table public.contact_stars enable row level security;

drop policy if exists "Active staff can read hidden contacts" on public.contact_hidden;
create policy "Active staff can read hidden contacts"
on public.contact_hidden for select to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can hide contacts" on public.contact_hidden;
create policy "Staff can hide contacts"
on public.contact_hidden for insert to authenticated
with check (public.can_manage_bookings());

drop policy if exists "Staff can update hidden contacts" on public.contact_hidden;
create policy "Staff can update hidden contacts"
on public.contact_hidden for update to authenticated
using (public.can_manage_bookings())
with check (public.can_manage_bookings());

drop policy if exists "Staff can restore hidden contacts" on public.contact_hidden;
create policy "Staff can restore hidden contacts"
on public.contact_hidden for delete to authenticated
using (public.can_manage_bookings());

-- Each account sees and changes only its own stars.
drop policy if exists "Staff manage their own stars" on public.contact_stars;
create policy "Staff manage their own stars"
on public.contact_stars for all to authenticated
using (user_id = auth.uid() and public.is_active_staff())
with check (user_id = auth.uid() and public.is_active_staff());
