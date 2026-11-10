-- SEC-09 (docs/audit/SECURITY_AUDIT_2026-11-10.md). Review before running; safe to run more than once.
--
-- anon and authenticated hold TRUNCATE, TRIGGER and REFERENCES on every public
-- table (live catalog, 2026-11-10). Nothing uses them, and TRUNCATE is not
-- subject to row-level security. They are not reachable through the API today,
-- but one future SECURITY INVOKER function with dynamic SQL would make
-- "empty the bookings table" a single call. Remove them, and stop new tables
-- from getting them.
--
-- service_role keeps what it has. SELECT/INSERT/UPDATE/DELETE grants are untouched.
--
-- Rollback:
--   grant references, trigger, truncate on all tables in schema public to anon, authenticated;
--   alter default privileges for role postgres in schema public grant references, trigger, truncate on tables to anon, authenticated;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- Verify (expect no rows):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon','authenticated')
--     and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES');
