-- Which repository migrations are on this database? READ-ONLY: catalog lookups
-- only, no data is read or changed. Safe to run in the SQL editor at any time.
--
-- One row per migration file. "applied" is yes / no / partial:
--   yes      every object the file creates (or changes) is there
--   partial  some are there; usually an older copy of the file was run
--   no       none are there
-- "missing" lists what was not found. Share this output freely: it holds
-- no guest data, tokens or keys.

with checks(sort, migration, label, present) as (
  values
  -- base setup (src/docs/SQL_SETUP.md), not a migration file
  (0, 'SQL_SETUP Script 04 (bookings updated_at trigger)', 'trigger set_bookings_updated_at',
     exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'set_bookings_updated_at')),

  (1, '20261028000100_staff_directory', 'table staff_directory', to_regclass('public.staff_directory') is not null),
  (1, '20261028000100_staff_directory', 'staff can use it (grant)', coalesce(has_table_privilege('authenticated', to_regclass('public.staff_directory'), 'INSERT'), false)),

  (2, '20261028000200_contact_preferences', 'table contact_hidden', to_regclass('public.contact_hidden') is not null),
  (2, '20261028000200_contact_preferences', 'table contact_stars', to_regclass('public.contact_stars') is not null),
  (2, '20261028000200_contact_preferences', 'staff can use them (grant)', coalesce(has_table_privilege('authenticated', to_regclass('public.contact_hidden'), 'INSERT'), false)),

  (3, '20261028000300_portal_corrections', 'table portal_removed_uploads', to_regclass('public.portal_removed_uploads') is not null),
  (3, '20261028000300_portal_corrections', 'column portal_checklist_items.staff_review_note',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'portal_checklist_items' and column_name = 'staff_review_note')),
  (3, '20261028000300_portal_corrections', 'column portal_documents.client_request_id',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'portal_documents' and column_name = 'client_request_id')),
  (3, '20261028000300_portal_corrections', 'staff can use portal_removed_uploads (grant)', coalesce(has_table_privilege('authenticated', to_regclass('public.portal_removed_uploads'), 'INSERT'), false)),

  (4, '20261029000100_inquiry_hidden', 'table inquiry_hidden', to_regclass('public.inquiry_hidden') is not null),
  (4, '20261029000100_inquiry_hidden', 'staff can use it (grant)', coalesce(has_table_privilege('authenticated', to_regclass('public.inquiry_hidden'), 'INSERT'), false)),

  (5, '20261104000100_portal_email', 'table portal_email_messages', to_regclass('public.portal_email_messages') is not null),
  (5, '20261104000100_portal_email', 'trigger portal_email_latch_booking_change',
     exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'portal_email_latch_booking_change')),

  (6, '20261107000100_portal_signing', 'table portal_signatures', to_regclass('public.portal_signatures') is not null),
  (6, '20261107000100_portal_signing', 'column portal_checklist_items.sign_document_id',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'portal_checklist_items' and column_name = 'sign_document_id')),
  (6, '20261107000100_portal_signing', 'function portal_record_signature', to_regprocedure('public.portal_record_signature(jsonb)') is not null),
  (6, '20261107000100_portal_signing', 'storage bucket portal-signed', exists (select 1 from storage.buckets where id = 'portal-signed')),

  (7, '20261110000100_role_helpers_never_null', 'can_manage_bookings never returns null',
     coalesce(pg_get_functiondef(to_regprocedure('public.can_manage_bookings()')) ilike '%coalesce%', false)),
  (7, '20261110000100_role_helpers_never_null', 'is_staff_admin never returns null',
     coalesce(pg_get_functiondef(to_regprocedure('public.is_staff_admin()')) ilike '%coalesce%', false)),

  (8, '20261110000200_revoke_unused_table_privileges', 'anon has no TRUNCATE on bookings',
     not has_table_privilege('anon', 'public.bookings', 'TRUNCATE')),

  (9, '20261110000300_lock_repair_functions', 'anon cannot run audit_repair_apply',
     coalesce(not has_function_privilege('anon', to_regprocedure('public.audit_repair_apply(text)'), 'EXECUTE'), true)),

  (10, '20261111000100_hosting_records', 'function is_hosting_booking', to_regprocedure('public.is_hosting_booking(text,text)') is not null),
  (10, '20261111000100_hosting_records', 'trigger bookings_hosting_guard',
     exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_hosting_guard')),

  (11, '20261113000100_staff_app', 'column staff_profiles.departments',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'staff_profiles' and column_name = 'departments')),
  (11, '20261113000100_staff_app', 'function staff_app_access', exists (select 1 from pg_proc where proname = 'staff_app_access' and pronamespace = 'public'::regnamespace)),

  (12, '20261114000100_staff_orders', 'table staff_order_requests', to_regclass('public.staff_order_requests') is not null),

  (13, '20261117000100_booking_change_log_keep_history', 'function staff_app_restore_change_log', to_regprocedure('public.staff_app_restore_change_log(jsonb)') is not null),

  (14, '20261119000100_group_map', 'table organizations', to_regclass('public.organizations') is not null),
  (14, '20261119000100_group_map', 'table organization_name_links', to_regclass('public.organization_name_links') is not null),

  (15, '20261119000200_group_map_build', 'table group_map_builds', to_regclass('public.group_map_builds') is not null),

  (16, '20261120000100_portal_cancelled_and_private_status', 'function portal_booking_is_cancelled',
     to_regprocedure('public.portal_booking_is_cancelled(text,text,jsonb)') is not null),
  (16, '20261120000100_portal_cancelled_and_private_status', 'guest portal record hides the booking status',
     coalesce(pg_get_functiondef(to_regprocedure('public.get_portal_record(text)')) ilike '%''cancelled'', true%', false))
)
select
  migration,
  case
    when bool_and(present) then 'yes'
    when bool_or(present) then 'partial'
    else 'no'
  end as applied,
  coalesce(string_agg(label, '; ') filter (where not present), '') as missing
from checks
group by sort, migration
order by sort;
