/*
  Shared staff directory (AUDIT-017, Q-019/Q-020).

  Everyone signs in with one shared login, so the login account cannot say
  which person did something. The directory is a list of people kept in
  Supabase (table staff_directory, see the migration), the same on every
  computer and separate from login accounts. Attribution ("completed by")
  uses the person chosen under "Working as" on that computer.

  Names typed on bookings are never matched or added automatically; User
  Admin lists them so staff can add the ones that are real people.

  The client is a parameter so the change logic can be tested.
*/

export const STAFF_DIRECTORY_TABLE = "staff_directory";

export function rowToStaffUser(row) {
  return {
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    role: row.role_label || "Staff",
    active: row.active !== false,
  };
}

export function staffUserToRow(user) {
  return {
    id: user.id,
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim(),
    phone: String(user.phone || "").trim(),
    role_label: user.role || "Staff",
    active: user.active !== false,
  };
}

function isMissingTable(error) {
  return ["42P01", "PGRST205"].includes(error?.code);
}

export async function loadStaffDirectory(client) {
  const { data, error } = await client
    .from(STAFF_DIRECTORY_TABLE)
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return {
      available: false,
      users: [],
      reason: isMissingTable(error)
        ? "The shared staff directory table has not been created yet."
        : error.message || "The shared staff directory could not be read.",
    };
  }

  return { available: true, users: (data || []).map(rowToStaffUser), reason: "" };
}

// Rows to write and ids to delete to turn `previous` into `next`.
export function getStaffDirectoryChanges(previousUsers, nextUsers) {
  const previousById = new Map(previousUsers.map((user) => [user.id, staffUserToRow(user)]));
  const nextIds = new Set(nextUsers.map((user) => user.id));

  const upserts = nextUsers
    .map(staffUserToRow)
    .filter((row) => JSON.stringify(previousById.get(row.id)) !== JSON.stringify(row));
  const deletes = previousUsers.filter((user) => !nextIds.has(user.id)).map((user) => user.id);

  return { upserts, deletes };
}

export async function saveStaffDirectoryChanges(client, previousUsers, nextUsers) {
  const { upserts, deletes } = getStaffDirectoryChanges(previousUsers, nextUsers);

  if (upserts.length) {
    const { error } = await client.from(STAFF_DIRECTORY_TABLE).upsert(upserts, { onConflict: "id" });
    if (error) throw error;
  }

  if (deletes.length) {
    const { error } = await client.from(STAFF_DIRECTORY_TABLE).delete().in("id", deletes);
    if (error) throw error;
  }

  return { upserted: upserts.length, deleted: deletes.length };
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/*
  Names used on bookings that are not in the directory. Matching is exact
  (ignoring case and spacing) on purpose: "Sam" and "Sam Lee" stay
  separate rather than being guessed into one person.
*/
export function getUnlistedStaffNames(assignedNames, staffUsers) {
  const known = new Set(staffUsers.map((user) => normalizeName(user.name)));
  return [...new Set(assignedNames.map((name) => String(name || "").trim()).filter(Boolean))]
    .filter((name) => !known.has(normalizeName(name)))
    .sort((a, b) => a.localeCompare(b));
}

export function createStaffDirectoryId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
  );
}
