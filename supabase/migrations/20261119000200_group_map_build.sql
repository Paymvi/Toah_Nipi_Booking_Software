-- Group Map automatic build: save a reviewed draft in one step, and undo it.
-- docs/GROUP_MAP.md ("Build automatically"). Review before running; safe to run
-- more than once. Run in the SQL editor, never `db push`.
--
-- Requires 20261119000100_group_map.sql.
--
-- group_map_apply_build(groups, links)
--   Creates the draft's new groups (with the ids the screen gave them) and
--   links booking names, all or nothing. If anything changed since the draft
--   was made (a name now taken at that level, a booking name linked meanwhile,
--   a chosen parent deleted), nothing is saved and staff build the draft again.
--   Existing groups are never changed: a draft can only add groups under them
--   and link unlinked names to them. Each build is recorded for undo.
-- group_map_undo_build(id)
--   Unlinks the names that build linked (if still linked to the same group),
--   then deletes the groups it created that are now empty. A group that has
--   since been given subgroups or names by hand is kept, and listed.
--   Bookings are never touched.
--
-- Who: admin and staff (can_manage_bookings), like every Group Map change.
--
-- Rollback (loses the undo history only; groups stay):
--   drop function if exists public.group_map_apply_build(jsonb, jsonb), public.group_map_undo_build(uuid);
--   drop table if exists public.group_map_builds;

do $$
begin
  if to_regprocedure('public.group_map_require_editor()') is null then
    raise exception 'Run supabase/migrations/20261119000100_group_map.sql first.';
  end if;
end $$;

create table if not exists public.group_map_builds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  group_ids uuid[] not null default '{}',
  links jsonb not null default '[]'::jsonb,
  undone_at timestamptz,
  undone_by uuid
);

create index if not exists group_map_builds_created_at_idx on public.group_map_builds (created_at desc);

alter table public.group_map_builds enable row level security;
revoke all on public.group_map_builds from public, anon, authenticated;
grant select on public.group_map_builds to authenticated;

drop policy if exists "Active staff can read group map builds" on public.group_map_builds;
create policy "Active staff can read group map builds"
on public.group_map_builds for select to authenticated
using (public.is_active_staff());

create or replace function public.group_map_apply_build(p_groups jsonb, p_links jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
  v_group record;
  v_count integer;
  v_build uuid;
  v_links integer;
begin
  perform public.group_map_require_editor();
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_typeof(p_links) is distinct from 'array' then
    raise exception 'The draft is not in the expected form.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.organizations parent change'));

  drop table if exists pg_temp.gm_build_groups, pg_temp.gm_build_links;
  create temp table gm_build_groups (id uuid primary key, name text not null, parent_id uuid, depth integer) on commit drop;
  create temp table gm_build_links (name text primary key, organization_id uuid not null) on commit drop;

  begin
    insert into gm_build_groups (id, name, parent_id)
    select (g->>'id')::uuid, public.group_map_clean_name(g->>'name'), nullif(g->>'parent_id', '')::uuid
    from jsonb_array_elements(p_groups) g;
    insert into gm_build_links (name, organization_id)
    select l->>'name', (l->>'organization_id')::uuid
    from jsonb_array_elements(p_links) l;
  exception
    when unique_violation then
      raise exception 'The draft lists the same group or booking name twice.' using errcode = '22023';
    when invalid_text_representation or not_null_violation then
      raise exception 'The draft has a malformed group or name (%).', sqlerrm using errcode = '22023';
  end;

  -- Everything below describes a change since the draft was made: 55000.
  select count(*) into v_count from gm_build_groups g join public.organizations o on o.id = g.id;
  if v_count > 0 then
    raise exception 'This draft was already saved. Build a new draft.' using errcode = '55000';
  end if;

  select count(*) into v_count from gm_build_groups g
  where g.parent_id is not null
    and not exists (select 1 from gm_build_groups p where p.id = g.parent_id)
    and not exists (select 1 from public.organizations o where o.id = g.parent_id);
  if v_count > 0 then
    raise exception '% parent group(s) in the draft no longer exist. Nothing was saved; build the draft again.', v_count
      using errcode = '55000';
  end if;

  -- Depth among the new groups; a new group never sits under itself.
  with recursive tree as (
    select g.id, 0 as depth from gm_build_groups g
    where g.parent_id is null or not exists (select 1 from gm_build_groups p where p.id = g.parent_id)
    union all
    select g.id, tree.depth + 1 from gm_build_groups g join tree on g.parent_id = tree.id
  )
  update gm_build_groups g set depth = tree.depth from tree where g.id = tree.id;
  if exists (select 1 from gm_build_groups where depth is null) then
    raise exception 'The draft puts a group inside its own subgroup.' using errcode = '22023';
  end if;

  select count(*) into v_count from (
    select 1 from gm_build_groups group by coalesce(parent_id, v_nil), lower(name) having count(*) > 1
  ) duplicates;
  if v_count > 0 then
    raise exception 'The draft has two groups with the same name at one level.' using errcode = '22023';
  end if;

  select count(*) into v_count from gm_build_groups g
  where exists (
    select 1 from public.organizations o
    where coalesce(o.parent_id, v_nil) = coalesce(g.parent_id, v_nil) and lower(o.name) = lower(g.name)
  );
  if v_count > 0 then
    raise exception '% group name(s) in the draft are now used by another group at that level. Nothing was saved; build the draft again.', v_count
      using errcode = '55000';
  end if;

  select count(*) into v_count from gm_build_links l
  where char_length(l.name) not between 1 and 500
     or (not exists (select 1 from gm_build_groups g where g.id = l.organization_id)
         and not exists (select 1 from public.organizations o where o.id = l.organization_id));
  if v_count > 0 then
    raise exception '% booking name(s) in the draft point to a group that no longer exists. Nothing was saved; build the draft again.', v_count
      using errcode = '55000';
  end if;

  select count(*) into v_count from gm_build_links l join public.organization_name_links x on x.name = l.name;
  if v_count > 0 then
    raise exception '% booking name(s) in the draft were linked to a group since. Nothing was saved; build the draft again.', v_count
      using errcode = '55000';
  end if;

  begin
    for v_group in select * from gm_build_groups order by depth, lower(name) loop
      insert into public.organizations (id, name, parent_id) values (v_group.id, v_group.name, v_group.parent_id);
    end loop;
    insert into public.organization_name_links (name, organization_id)
    select name, organization_id from gm_build_links;
    get diagnostics v_links = row_count;
  exception when unique_violation or foreign_key_violation then
    raise exception 'The Group Map changed while the draft was being saved. Nothing was saved; build the draft again.'
      using errcode = '55000';
  end;

  insert into public.group_map_builds (group_ids, links)
  values (
    coalesce((select array_agg(id) from gm_build_groups), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object('name', name, 'organization_id', organization_id)) from gm_build_links), '[]'::jsonb)
  )
  returning id into v_build;

  return jsonb_build_object(
    'buildId', v_build,
    'groupsCreated', (select count(*) from gm_build_groups),
    'namesLinked', v_links
  );
end;
$$;

create or replace function public.group_map_undo_build(p_build_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_build public.group_map_builds;
  v_unlinked integer;
  v_deleted integer := 0;
  v_round integer;
  v_kept jsonb;
begin
  perform public.group_map_require_editor();
  perform pg_advisory_xact_lock(hashtext('public.organizations parent change'));
  select * into v_build from public.group_map_builds where id = p_build_id for update;
  if not found then
    raise exception 'That automatic build no longer exists.' using errcode = 'P0002';
  end if;
  if v_build.undone_at is not null then
    raise exception 'That automatic build was already undone.' using errcode = '55000';
  end if;

  -- Only links that still point where this build put them.
  delete from public.organization_name_links x
  using jsonb_array_elements(v_build.links) l
  where x.name = l->>'name' and x.organization_id = (l->>'organization_id')::uuid;
  get diagnostics v_unlinked = row_count;

  -- Empty groups from this build, deepest first, until none are left to remove.
  loop
    delete from public.organizations o
    where o.id = any (v_build.group_ids)
      and not exists (select 1 from public.organizations c where c.parent_id = o.id)
      and not exists (select 1 from public.organization_name_links x where x.organization_id = o.id);
    get diagnostics v_round = row_count;
    exit when v_round = 0;
    v_deleted := v_deleted + v_round;
  end loop;

  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) into v_kept
  from public.organizations o where o.id = any (v_build.group_ids);

  update public.group_map_builds set undone_at = now(), undone_by = auth.uid() where id = p_build_id;

  return jsonb_build_object('namesUnlinked', v_unlinked, 'groupsDeleted', v_deleted, 'groupsKept', v_kept);
end;
$$;

revoke all on function public.group_map_apply_build(jsonb, jsonb) from public, anon;
revoke all on function public.group_map_undo_build(uuid) from public, anon;
grant execute on function public.group_map_apply_build(jsonb, jsonb) to authenticated;
grant execute on function public.group_map_undo_build(uuid) to authenticated;

-- Verify (expect one row, rowsecurity = true):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'group_map_builds';
