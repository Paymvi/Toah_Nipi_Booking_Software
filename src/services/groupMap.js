import { isMissingTable } from "./backupData.js";

/*
  Group Map data access (supabase/migrations/20261119000100_group_map.sql).
  Reads are plain selects; every change goes through a group_map_* function,
  which checks permission and that the screen saw the latest version.
*/

export class GroupMapError extends Error {
  constructor(message, { code = "", stale = false, setupNeeded = false } = {}) {
    super(message);
    this.name = "GroupMapError";
    this.code = code;
    // The screen was out of date: reload before trying again.
    this.stale = stale;
    this.setupNeeded = setupNeeded;
  }
}

function toGroupMapError(error) {
  if (isMissingTable(error) || error?.code === "PGRST202" || error?.code === "42883") {
    return new GroupMapError("The Group Map needs its database update first (docs/GROUP_MAP.md).", {
      code: error.code,
      setupNeeded: true,
    });
  }
  // The database's own messages are written for staff (22023, 42501, 55000, P0002).
  const known = ["22023", "42501", "55000", "P0002"].includes(error?.code);
  return new GroupMapError(known ? error.message : `Could not save: ${error?.message || "unknown error"}`, {
    code: error?.code || "",
    stale: error?.code === "55000" || error?.code === "P0002",
  });
}

async function readAll(client, table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).order(table === "organizations" ? "id" : "name").range(from, from + 999);
    if (error) throw toGroupMapError(error);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export async function loadGroupMap(client) {
  const [groups, links] = await Promise.all([
    readAll(client, "organizations", "id, name, parent_id, version, updated_at"),
    readAll(client, "organization_name_links", "name, organization_id"),
  ]);
  return { groups, links };
}

async function call(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw toGroupMapError(error);
  return data;
}

export const createGroup = (client, name, parentId = null) =>
  call(client, "group_map_create", { p_name: name, p_parent_id: parentId });

export const renameGroup = (client, group, name) =>
  call(client, "group_map_rename", { p_id: group.id, p_version: group.version, p_name: name });

// parentId null makes the group top-level; it is never deleted.
export const setGroupParent = (client, group, parentId) =>
  call(client, "group_map_set_parent", { p_id: group.id, p_version: group.version, p_parent_id: parentId });

export const deleteGroup = (client, group) =>
  call(client, "group_map_delete", { p_id: group.id, p_version: group.version });

export const linkGroupName = (client, name, groupId) =>
  call(client, "group_map_link_name", { p_name: name, p_organization_id: groupId });

export const unlinkGroupName = (client, name, groupId) =>
  call(client, "group_map_unlink_name", { p_name: name, p_organization_id: groupId });
