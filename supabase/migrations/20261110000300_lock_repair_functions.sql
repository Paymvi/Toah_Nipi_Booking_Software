-- SEC-10 (docs/audit/SECURITY_AUDIT_2026-11-10.md). Review before running; safe to run more than once.
--
-- audit_repair_apply / audit_repair_rollback (supabase/repairs/00_repair_log.sql)
-- run dynamic UPDATEs on any public table and are executable by anon and
-- authenticated. Today they fail for those roles (they cannot read
-- audit_repair_log), but they are meant only for the SQL editor (database
-- owner). Make that explicit so a later grant change cannot expose them.
--
-- Rollback: grant execute on function public.audit_repair_apply(text), public.audit_repair_rollback(text) to anon, authenticated;

revoke all on function public.audit_repair_apply(text) from public, anon, authenticated;
revoke all on function public.audit_repair_rollback(text) from public, anon, authenticated;

-- Verify (expect false, false):
--   select has_function_privilege('anon', 'public.audit_repair_apply(text)', 'execute'),
--          has_function_privilege('authenticated', 'public.audit_repair_rollback(text)', 'execute');
