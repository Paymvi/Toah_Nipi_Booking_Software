-- Portal corrections and retry-safe assignment (AUDIT-038, AUDIT-050).
--
-- portal_checklist_items and portal_documents are not defined anywhere in
-- this repository (AUDIT-021), so every change below is guarded with
-- "if exists" / "if not exists" and only ADDS things:
--
--   portal_removed_uploads                 record of a guest upload kept when
--                                          its task is removed (staff only)
--   portal_checklist_items.staff_review_note  note sent with "request changes"
--   portal_checklist_items.client_request_id  } one id per assignment click; a
--   portal_documents.client_request_id        } retried click cannot add a copy
--   portal_documents.storage_path          where a staff-uploaded file lives
--
-- The client_request_id indexes are unique only per request id. They do
-- NOT forbid assigning the same task or document twice on purpose (Q-018).
--
-- Not changed here: the access rules (RLS) of the two existing portal
-- tables. If Portal Admin's new Remove / Reopen / Due date / Request
-- changes actions report "your account cannot edit portal tasks", review
-- supabase/optional/20261028000310_portal_staff_write_policies.sql (run the V-003
-- diagnostics first).

create table if not exists public.portal_removed_uploads (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null,
  checklist_item_id text not null,
  item_id text,
  title text,
  uploaded_file_name text,
  original_file_path text not null,
  current_file_path text not null,
  uploaded_file_mime text,
  uploaded_file_size bigint,
  response_text text,
  removed_by uuid default auth.uid(),
  removed_at timestamptz not null default now()
);

comment on table public.portal_removed_uploads is
  'Guest uploads kept when staff removed the task. Staff only; the guest portal does not read this table.';

create index if not exists portal_removed_uploads_booking_idx
on public.portal_removed_uploads (booking_id);

alter table public.portal_removed_uploads enable row level security;

drop policy if exists "Active staff can read removed uploads" on public.portal_removed_uploads;
create policy "Active staff can read removed uploads"
on public.portal_removed_uploads for select to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can record removed uploads" on public.portal_removed_uploads;
create policy "Staff can record removed uploads"
on public.portal_removed_uploads for insert to authenticated
with check (public.can_manage_bookings());

alter table if exists public.portal_checklist_items
  add column if not exists staff_review_note text,
  add column if not exists client_request_id uuid;

alter table if exists public.portal_documents
  add column if not exists client_request_id uuid,
  add column if not exists storage_path text;

do $$
begin
  if to_regclass('public.portal_checklist_items') is not null then
    execute 'create unique index if not exists portal_checklist_items_client_request_id_key
             on public.portal_checklist_items (client_request_id)';
  end if;

  if to_regclass('public.portal_documents') is not null then
    execute 'create unique index if not exists portal_documents_client_request_id_key
             on public.portal_documents (client_request_id)';
  end if;
end
$$;
