-- OPTIONAL — review before running. It is kept outside
-- supabase/migrations so `supabase db push` never applies it by itself.
--
-- Portal Admin's correction actions (AUDIT-038) update and delete rows in
-- portal_checklist_items and portal_documents. The live access rules for
-- those tables are not in this repository. Run the V-003 query in
-- supabase/repairs/01_diagnostics.sql first:
--
--   * If staff already have UPDATE and DELETE policies there, do not run
--     this file.
--   * If they do not, this adds them for active staff/admin accounts only
--     (the same rule bookings use). It does not change what guests can do,
--     and it does not touch any existing policy.

do $$
declare
  target text;
begin
  foreach target in array array['portal_checklist_items', 'portal_documents'] loop
    if to_regclass('public.' || target) is null then
      raise notice 'Skipping %: table not found', target;
      continue;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target and cmd in ('UPDATE', 'ALL')
        and roles @> array['authenticated']::name[]
    ) then
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.can_manage_bookings()) with check (public.can_manage_bookings())',
        'Staff can correct ' || target, target
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target and cmd in ('DELETE', 'ALL')
        and roles @> array['authenticated']::name[]
    ) then
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.can_manage_bookings())',
        'Staff can remove ' || target, target
      );
    end if;
  end loop;
end
$$;
