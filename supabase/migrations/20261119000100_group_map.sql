-- Group Map: organizations, their parent organization, and which booking
-- organization names belong to each one. docs/GROUP_MAP.md explains the feature.
-- Review before running; safe to run more than once. Run in the SQL editor,
-- never `db push`.
--
-- Requires the role helpers from src/docs/SQL_SETUP.md Script 05
-- (current_staff_role, is_active_staff, can_manage_bookings) and staff_profiles.
-- It does not need the staff app or SEC-03 migrations: every permission check
-- here treats a NULL helper result as "no", so it is safe whether or not
-- 20261110000100_role_helpers_never_null.sql has run. If the staff app
-- migration (20261113000100) has run, its is_active_staff() also keeps
-- limited (staff app) accounts out; before it, no limited role exists.
--
-- Additive only. Bookings, contacts, reports and the guest portal are not
-- touched: a booking belongs to a group when its organization_name text is one
-- of that group's linked names. Linking never rewrites a booking, and nothing
-- here creates groups or links on its own.
--
-- Who may do what (enforced here; the UI only mirrors it)
--   Read:   active office staff (admin, staff, viewer), table SELECT + RLS.
--   Change: admin and staff (can_manage_bookings), only through the
--           group_map_* functions below. The tables have no write grants.
--   Guests (anon) and limited staff app accounts see nothing.
--
-- Rules the database enforces, whoever writes:
--   * a group is never its own parent and the tree never loops (trigger);
--   * a parent must exist (foreign key);
--   * one parent per group (a column, so no duplicate parent links);
--   * one group per linked name (primary key on the name);
--   * sibling names are unique, ignoring case;
--   * a group with subgroups or linked names cannot be deleted (ON DELETE
--     RESTRICT), so nothing ever cascades.
-- Stale screens: rename, move and delete take the version the screen showed and
-- refuse (55000) if someone changed the group since.
--
-- Backups (docs/BACKUP_AND_RECOVERY.md, backup format version 5):
--   group_map_export()  both tables in one consistent read, for backup files.
--   group_map_restore() adds what a backup has and the database lacks, in one
--                       transaction. It never changes or deletes a current group
--                       or link, refuses the whole section if the file's groups
--                       or links don't hold together, and reports every clash.
--
-- Rollback (loses every group and link; bookings are unaffected):
--   drop function if exists public.group_map_create(text, uuid),
--     public.group_map_rename(uuid, integer, text),
--     public.group_map_set_parent(uuid, integer, uuid),
--     public.group_map_delete(uuid, integer),
--     public.group_map_link_name(text, uuid),
--     public.group_map_unlink_name(text, uuid),
--     public.group_map_export(), public.group_map_restore(jsonb, jsonb),
--     public.group_map_lock(uuid, integer), public.group_map_clean_name(text),
--     public.group_map_require_editor();
--   drop table if exists public.organization_name_links, public.organizations;
--   drop function if exists public.organizations_check_parent();

do $$
begin
  if to_regprocedure('public.is_active_staff()') is null
     or to_regprocedure('public.can_manage_bookings()') is null then
    raise exception 'The role helpers are missing. Run src/docs/SQL_SETUP.md Script 05 first.';
  end if;
end $$;

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 200),
  parent_id uuid references public.organizations (id) on delete restrict,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint organizations_not_own_parent check (parent_id is distinct from id)
);

create index if not exists organizations_parent_id_idx on public.organizations (parent_id);

-- Siblings (including all top-level groups) can't share a name.
create unique index if not exists organizations_sibling_name_key
on public.organizations (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table if not exists public.organization_name_links (
  name text primary key check (char_length(name) between 1 and 500),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid default auth.uid()
);

create index if not exists organization_name_links_organization_id_idx
on public.organization_name_links (organization_id);

-- 2. No loops, whoever writes -------------------------------------------------

create or replace function public.organizations_check_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cursor uuid := new.parent_id;
  v_steps integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'A group cannot be its own parent.' using errcode = '22023';
  end if;

  -- One tree change at a time: two moves that are each fine alone (A under B,
  -- B under A) can't both pass by checking the tree before the other commits.
  perform pg_advisory_xact_lock(hashtext('public.organizations parent change'));

  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'That would put the group inside its own subgroup.' using errcode = '22023';
    end if;
    v_steps := v_steps + 1;
    if v_steps > 1000 then
      raise exception 'The group tree is too deep or already loops.' using errcode = '22023';
    end if;
    select parent_id into v_cursor from public.organizations where id = v_cursor;
  end loop;

  return new;
end;
$$;

drop trigger if exists organizations_check_parent on public.organizations;
create trigger organizations_check_parent
before insert or update of parent_id on public.organizations
for each row execute function public.organizations_check_parent();

-- 3. Access -------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_name_links enable row level security;

revoke all on public.organizations from public, anon, authenticated;
revoke all on public.organization_name_links from public, anon, authenticated;
grant select on public.organizations to authenticated;
grant select on public.organization_name_links to authenticated;

drop policy if exists "Active staff can read groups" on public.organizations;
create policy "Active staff can read groups"
on public.organizations for select to authenticated
using (public.is_active_staff());

drop policy if exists "Active staff can read group name links" on public.organization_name_links;
create policy "Active staff can read group name links"
on public.organization_name_links for select to authenticated
using (public.is_active_staff());

-- 4. Changes, only through these functions -------------------------------------

create or replace function public.group_map_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- coalesce: before SEC-03 the helper returns NULL for non-staff, and NOT NULL never raises.
  if not coalesce(public.can_manage_bookings(), false) then
    raise exception 'Only admin and staff accounts can change groups.' using errcode = '42501';
  end if;
end;
$$;

-- Clean name or a clear error.
create or replace function public.group_map_clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_name = '' then
    raise exception 'Give the group a name.' using errcode = '22023';
  end if;
  if char_length(v_name) > 200 then
    raise exception 'Group names can be at most 200 characters.' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- Locks the group and checks the screen saw its latest version.
create or replace function public.group_map_lock(p_id uuid, p_version integer)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organizations;
begin
  select * into v_row from public.organizations where id = p_id for update;
  if not found then
    raise exception 'This group no longer exists. The map has been refreshed.' using errcode = 'P0002';
  end if;
  if p_version is distinct from v_row.version then
    raise exception 'Someone else changed "%" a moment ago. The map has been refreshed; check it and try again.', v_row.name
      using errcode = '55000';
  end if;
  return v_row;
end;
$$;

create or replace function public.group_map_create(p_name text, p_parent_id uuid default null)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organizations;
begin
  perform public.group_map_require_editor();
  if p_parent_id is not null then
    perform 1 from public.organizations where id = p_parent_id for share;
    if not found then
      raise exception 'The parent group no longer exists. The map has been refreshed.' using errcode = 'P0002';
    end if;
  end if;
  insert into public.organizations (name, parent_id)
  values (public.group_map_clean_name(p_name), p_parent_id)
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'There is already a group called "%" at that level.', public.group_map_clean_name(p_name)
    using errcode = '22023';
end;
$$;

create or replace function public.group_map_rename(p_id uuid, p_version integer, p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organizations;
begin
  perform public.group_map_require_editor();
  perform public.group_map_lock(p_id, p_version);
  update public.organizations
  set name = public.group_map_clean_name(p_name), version = version + 1,
      updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'There is already a group called "%" at that level.', public.group_map_clean_name(p_name)
    using errcode = '22023';
end;
$$;

-- p_parent_id null makes the group top-level; the group itself is kept.
create or replace function public.group_map_set_parent(p_id uuid, p_version integer, p_parent_id uuid)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organizations;
begin
  perform public.group_map_require_editor();
  perform public.group_map_lock(p_id, p_version);
  if p_parent_id is not null then
    perform 1 from public.organizations where id = p_parent_id for share;
    if not found then
      raise exception 'The chosen parent group no longer exists. The map has been refreshed.' using errcode = 'P0002';
    end if;
  end if;
  update public.organizations
  set parent_id = p_parent_id, version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'The new parent already has a subgroup with this name. Rename one of them first.'
    using errcode = '22023';
end;
$$;

-- Only an empty group: no subgroups and no linked names. Nothing cascades.
create or replace function public.group_map_delete(p_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organizations;
  v_children integer;
  v_names integer;
begin
  perform public.group_map_require_editor();
  v_row := public.group_map_lock(p_id, p_version);
  select count(*) into v_children from public.organizations where parent_id = p_id;
  select count(*) into v_names from public.organization_name_links where organization_id = p_id;
  if v_children > 0 or v_names > 0 then
    raise exception '"%" still has % subgroup(s) and % linked name(s). Move or unlink them first.',
      v_row.name, v_children, v_names using errcode = '55000';
  end if;
  delete from public.organizations where id = p_id;
exception when foreign_key_violation then
  raise exception '"%" gained a subgroup or linked name a moment ago. The map has been refreshed.', v_row.name
    using errcode = '55000';
end;
$$;

-- Links an exact booking organization name to a group. A name already linked
-- elsewhere is refused, never moved silently.
create or replace function public.group_map_link_name(p_name text, p_organization_id uuid)
returns public.organization_name_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organization_name_links;
  v_existing text;
begin
  perform public.group_map_require_editor();
  if coalesce(p_name, '') = '' or char_length(p_name) > 500 then
    raise exception 'Choose an organization name from the bookings.' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = p_organization_id for share;
  if not found then
    raise exception 'This group no longer exists. The map has been refreshed.' using errcode = 'P0002';
  end if;
  select o.name into v_existing
  from public.organization_name_links l join public.organizations o on o.id = l.organization_id
  where l.name = p_name;
  if found then
    raise exception '"%" is already linked to "%". Unlink it there first.', p_name, v_existing
      using errcode = '55000';
  end if;
  insert into public.organization_name_links (name, organization_id)
  values (p_name, p_organization_id)
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception '"%" was linked to another group a moment ago. The map has been refreshed.', p_name
    using errcode = '55000';
end;
$$;

-- Unlinks only if the name is still linked to the group the screen showed.
create or replace function public.group_map_unlink_name(p_name text, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.group_map_require_editor();
  delete from public.organization_name_links where name = p_name and organization_id = p_organization_id;
  if not found then
    raise exception '"%" is no longer linked to this group. The map has been refreshed.', p_name
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.organizations_check_parent() from public, anon, authenticated;
revoke all on function public.group_map_require_editor() from public, anon, authenticated;
revoke all on function public.group_map_clean_name(text) from public, anon, authenticated;
revoke all on function public.group_map_lock(uuid, integer) from public, anon, authenticated;

revoke all on function public.group_map_create(text, uuid) from public, anon;
revoke all on function public.group_map_rename(uuid, integer, text) from public, anon;
revoke all on function public.group_map_set_parent(uuid, integer, uuid) from public, anon;
revoke all on function public.group_map_delete(uuid, integer) from public, anon;
revoke all on function public.group_map_link_name(text, uuid) from public, anon;
revoke all on function public.group_map_unlink_name(text, uuid) from public, anon;
grant execute on function public.group_map_create(text, uuid) to authenticated;
grant execute on function public.group_map_rename(uuid, integer, text) to authenticated;
grant execute on function public.group_map_set_parent(uuid, integer, uuid) to authenticated;
grant execute on function public.group_map_delete(uuid, integer) to authenticated;
grant execute on function public.group_map_link_name(text, uuid) to authenticated;
grant execute on function public.group_map_unlink_name(text, uuid) to authenticated;

-- 5. Backups ------------------------------------------------------------------

-- One statement, so groups and links come from the same moment.
create or replace function public.group_map_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_active_staff(), false) then
    raise exception 'Only office staff accounts can back up groups.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'parent_id', o.parent_id, 'version', o.version,
        'created_at', o.created_at, 'updated_at', o.updated_at) order by o.id)
      from public.organizations o), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', l.name, 'organization_id', l.organization_id, 'linked_at', l.linked_at) order by l.name)
      from public.organization_name_links l), '[]'::jsonb)
  );
end;
$$;

/*
  Restores a backup's groups and links, for both restore modes.

  1. Checks the whole section first: ids and names valid, no duplicate ids or
     linked names, every parent and every linked group inside the backup, no
     loops, unique sibling names. Any problem: nothing changes (22023).
  2. Parents before children. A group whose id is already here is left exactly
     as it is (current wins). A missing group is added with its original id,
     unless its parent wasn't restored or a current group at that level has
     its name (never merged automatically); both are reported, never forced.
  3. Links: added when the name is free and its group exists. A name already
     linked stays with its current group (reported if that differs).
  All in this one call, so a failure leaves nothing half-restored.
*/
create or replace function public.group_map_restore(p_organizations jsonb, p_links jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
  v_group record;
  v_link record;
  v_live public.organizations;
  v_live_group uuid;
  v_count integer;
  v_notes jsonb := '[]'::jsonb;
  v_groups_inserted integer := 0;
  v_groups_present integer := 0;
  v_groups_kept integer := 0;
  v_groups_skipped integer := 0;
  v_links_inserted integer := 0;
  v_links_present integer := 0;
  v_links_kept integer := 0;
  v_links_skipped integer := 0;
begin
  perform public.group_map_require_editor();
  if jsonb_typeof(p_organizations) is distinct from 'array' or jsonb_typeof(p_links) is distinct from 'array' then
    raise exception 'The backup''s Group Map section is not in the expected form.' using errcode = '22023';
  end if;
  -- Same lock as tree changes: nobody moves groups while this runs.
  perform pg_advisory_xact_lock(hashtext('public.organizations parent change'));

  drop table if exists pg_temp.gm_restore_groups, pg_temp.gm_restore_links;
  create temp table gm_restore_groups (
    id uuid primary key, name text not null, parent_id uuid, version integer,
    created_at timestamptz, updated_at timestamptz, depth integer
  ) on commit drop;
  create temp table gm_restore_links (
    name text primary key, organization_id uuid not null, linked_at timestamptz
  ) on commit drop;

  begin
    insert into gm_restore_groups (id, name, parent_id, version, created_at, updated_at)
    select (g->>'id')::uuid, g->>'name', nullif(g->>'parent_id', '')::uuid,
           coalesce((g->>'version')::integer, 1), (g->>'created_at')::timestamptz, (g->>'updated_at')::timestamptz
    from jsonb_array_elements(p_organizations) g;
  exception
    when unique_violation then
      raise exception 'The backup lists the same group twice. Nothing in the Group Map was restored.' using errcode = '22023';
    when others then
      raise exception 'The backup has a group with a missing or malformed id or name (%). Nothing in the Group Map was restored.', sqlerrm
        using errcode = '22023';
  end;

  begin
    insert into gm_restore_links (name, organization_id, linked_at)
    select l->>'name', (l->>'organization_id')::uuid, (l->>'linked_at')::timestamptz
    from jsonb_array_elements(p_links) l;
  exception
    when unique_violation then
      raise exception 'The backup links the same booking name twice. Nothing in the Group Map was restored.' using errcode = '22023';
    when others then
      raise exception 'The backup has a malformed linked name (%). Nothing in the Group Map was restored.', sqlerrm
        using errcode = '22023';
  end;

  select count(*) into v_count from gm_restore_groups
  where name <> btrim(name) or char_length(name) not between 1 and 200;
  if v_count > 0 then
    raise exception '% group name(s) in the backup are empty, padded or longer than 200 characters. Nothing in the Group Map was restored.', v_count
      using errcode = '22023';
  end if;

  select count(*) into v_count from gm_restore_groups g
  where g.parent_id is not null and not exists (select 1 from gm_restore_groups p where p.id = g.parent_id);
  if v_count > 0 then
    raise exception '% group(s) in the backup point to a parent that is not in the backup. Nothing in the Group Map was restored.', v_count
      using errcode = '22023';
  end if;

  with recursive tree as (
    select id, 0 as depth from gm_restore_groups where parent_id is null
    union all
    select g.id, tree.depth + 1 from gm_restore_groups g join tree on g.parent_id = tree.id
  )
  update gm_restore_groups g set depth = tree.depth from tree where g.id = tree.id;
  select count(*) into v_count from gm_restore_groups where depth is null;
  if v_count > 0 then
    raise exception '% group(s) in the backup are their own parent or sit in a loop. Nothing in the Group Map was restored.', v_count
      using errcode = '22023';
  end if;

  select count(*) into v_count from (
    select 1 from gm_restore_groups group by coalesce(parent_id, v_nil), lower(name) having count(*) > 1
  ) duplicates;
  if v_count > 0 then
    raise exception 'The backup has % set(s) of groups with the same name and parent. Nothing in the Group Map was restored.', v_count
      using errcode = '22023';
  end if;

  select count(*) into v_count from gm_restore_links l
  where char_length(l.name) not between 1 and 500
     or not exists (select 1 from gm_restore_groups g where g.id = l.organization_id);
  if v_count > 0 then
    raise exception '% linked name(s) in the backup are empty or point to a group that is not in the backup. Nothing in the Group Map was restored.', v_count
      using errcode = '22023';
  end if;

  begin
    for v_group in select * from gm_restore_groups order by depth, lower(name), id loop
      select * into v_live from public.organizations where id = v_group.id;
      if found then
        v_groups_present := v_groups_present + 1;
        if v_live.name is distinct from v_group.name or v_live.parent_id is distinct from v_group.parent_id then
          v_groups_kept := v_groups_kept + 1;
          v_notes := v_notes || jsonb_build_object('kind', 'group', 'name', v_group.name, 'current', v_live.name,
            'outcome', 'kept-current');
        end if;
      elsif v_group.parent_id is not null and not exists (select 1 from public.organizations where id = v_group.parent_id) then
        v_groups_skipped := v_groups_skipped + 1;
        v_notes := v_notes || jsonb_build_object('kind', 'group', 'name', v_group.name, 'outcome', 'parent-not-restored');
      elsif exists (
        select 1 from public.organizations
        where coalesce(parent_id, v_nil) = coalesce(v_group.parent_id, v_nil) and lower(name) = lower(v_group.name)
      ) then
        v_groups_skipped := v_groups_skipped + 1;
        v_notes := v_notes || jsonb_build_object('kind', 'group', 'name', v_group.name, 'outcome', 'name-in-use');
      else
        insert into public.organizations (id, name, parent_id, version, created_at, updated_at)
        values (v_group.id, v_group.name, v_group.parent_id, greatest(coalesce(v_group.version, 1), 1),
                coalesce(v_group.created_at, now()), coalesce(v_group.updated_at, now()));
        v_groups_inserted := v_groups_inserted + 1;
      end if;
    end loop;

    for v_link in select * from gm_restore_links order by name loop
      select organization_id into v_live_group from public.organization_name_links where name = v_link.name;
      if found then
        if v_live_group = v_link.organization_id then
          v_links_present := v_links_present + 1;
        else
          v_links_kept := v_links_kept + 1;
          v_notes := v_notes || jsonb_build_object('kind', 'link', 'name', v_link.name, 'outcome', 'kept-current',
            'current', (select name from public.organizations where id = v_live_group));
        end if;
      elsif not exists (select 1 from public.organizations where id = v_link.organization_id) then
        v_links_skipped := v_links_skipped + 1;
        v_notes := v_notes || jsonb_build_object('kind', 'link', 'name', v_link.name, 'outcome', 'group-not-restored');
      else
        insert into public.organization_name_links (name, organization_id, linked_at)
        values (v_link.name, v_link.organization_id, coalesce(v_link.linked_at, now()));
        v_links_inserted := v_links_inserted + 1;
      end if;
    end loop;
  exception when unique_violation or foreign_key_violation then
    -- Someone created a group or link at the same moment; this block's changes are undone.
    raise exception 'The Group Map changed while it was being restored, so nothing in it was restored. Try again.'
      using errcode = '55000';
  end;

  return jsonb_build_object(
    'groupsInBackup', (select count(*) from gm_restore_groups),
    'groupsInserted', v_groups_inserted,
    'groupsAlreadyPresent', v_groups_present,
    'groupsKeptCurrent', v_groups_kept,
    'groupsSkipped', v_groups_skipped,
    'linksInBackup', (select count(*) from gm_restore_links),
    'linksInserted', v_links_inserted,
    'linksAlreadyPresent', v_links_present,
    'linksKeptCurrent', v_links_kept,
    'linksSkipped', v_links_skipped,
    'notes', v_notes
  );
end;
$$;

revoke all on function public.group_map_export() from public, anon;
grant execute on function public.group_map_export() to authenticated;
revoke all on function public.group_map_restore(jsonb, jsonb) from public, anon;
grant execute on function public.group_map_restore(jsonb, jsonb) to authenticated;

-- Verify (expect two rows, both with rowsecurity = true):
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('organizations', 'organization_name_links');
