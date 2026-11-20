import { bookingToDbRow, bookingToRestoreRow } from "./bookingMapping.js";
import { buildStorageManifest, getRowsMissingFromLive } from "../utils/backupFormat.js";

/*
  Reads and restores everything a version 2 backup holds (AUDIT-010).

  Reading: each table is read page by page. A table that cannot be read
  (missing in this database, or not readable by this account) is recorded
  in sectionErrors instead of failing the whole backup.

  Restoring: parents before children (bookings, then website inquiries,
  then portal tasks and documents). For the supporting tables only rows
  whose id is not already live are inserted, so nothing guests or staff
  changed after the backup is overwritten.

  No Supabase import: the client is passed in (backupService.js), so the
  restore rules can be tested.
*/

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const INSERT_CHUNK_SIZE = 150;

async function fetchAllRows(table, client) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
  throw new Error(`Stopped reading ${table} after ${MAX_PAGES} pages; the backup would be incomplete.`);
}

// The table does not exist yet (online signing migration not run).
export function isMissingTable(error) {
  return ["42P01", "PGRST205"].includes(error?.code);
}

export async function fetchBackupSections({ client, fetchBookings }) {
  const sectionErrors = {};
  const bookings = await fetchBookings();

  const readOptional = async (key, table, { missingIsEmpty = false } = {}) => {
    try {
      return await fetchAllRows(table, client);
    } catch (error) {
      if (missingIsEmpty && isMissingTable(error)) return [];
      sectionErrors[key] = error?.message || String(error);
      return [];
    }
  };

  const guestInquiries = await readOptional("guestInquiries", "guest_inquiries");
  const portalChecklistItems = await readOptional("portalChecklistItems", "portal_checklist_items");
  const portalDocuments = await readOptional("portalDocuments", "portal_documents");
  const portalSignatures = await readOptional("portalSignatures", "portal_signatures", { missingIsEmpty: true });
  // Empty until the staff app migration runs.
  const bookingChangeLog = await readOptional("bookingChangeLog", "booking_change_log", { missingIsEmpty: true });
  const { organizations, organizationNameLinks } = await readGroupMap(client, sectionErrors);
  const storageManifest = buildStorageManifest({ portalChecklistItems, portalDocuments, portalSignatures, bookings });

  return {
    sections: {
      bookings, guestInquiries, portalChecklistItems, portalDocuments, portalSignatures, bookingChangeLog,
      organizations, organizationNameLinks, storageManifest,
    },
    sectionErrors,
  };
}

// Group Map not set up in this database (its migration has not run).
const isMissingGroupMap = (error) => isMissingTable(error) || ["PGRST202", "42883"].includes(error?.code);

/*
  Groups and links in one database statement (group_map_export), so a group
  edited mid-backup can't leave a link pointing at a group the file lacks.
  Empty, with no warning, until the Group Map migration runs.
*/
async function readGroupMap(client, sectionErrors) {
  const { data, error } = await client.rpc("group_map_export");
  if (error) {
    if (!isMissingGroupMap(error)) sectionErrors.organizations = error.message || String(error);
    return { organizations: [], organizationNameLinks: [] };
  }
  return {
    organizations: Array.isArray(data?.organizations) ? data.organizations : [],
    organizationNameLinks: Array.isArray(data?.links) ? data.links : [],
  };
}

/*
  Version 5 backups: the Group Map, in one database transaction
  (group_map_restore). Adds missing groups and links only; current ones are
  never changed or deleted, whichever restore mode is used. Throws when
  nothing was restored, so the caller can say so.
*/
export async function restoreGroupMapSection(sections, { client }) {
  const organizations = Array.isArray(sections?.organizations) ? sections.organizations : [];
  const organizationNameLinks = Array.isArray(sections?.organizationNameLinks) ? sections.organizationNameLinks : [];
  if (organizations.length === 0 && organizationNameLinks.length === 0) {
    return { groupsInBackup: 0, groupsInserted: 0, groupsAlreadyPresent: 0, groupsKeptCurrent: 0, groupsSkipped: 0,
      linksInBackup: 0, linksInserted: 0, linksAlreadyPresent: 0, linksKeptCurrent: 0, linksSkipped: 0, notes: [] };
  }
  const { data, error } = await client.rpc("group_map_restore", {
    p_organizations: organizations,
    p_links: organizationNameLinks,
  });
  if (error) {
    if (isMissingGroupMap(error)) {
      throw new Error("This database doesn't have the Group Map yet. Run supabase/migrations/20261119000100_group_map.sql, then restore this file again with Merge.");
    }
    throw new Error(error.message || String(error));
  }
  return { ...data, notes: Array.isArray(data?.notes) ? data.notes : [] };
}

/*
  Online signing records are never deleted, and a booking that has them
  cannot be deleted, so Full Replace (which deletes every booking) is
  refused while any exist. 0 when the signing migration has not been run.
*/
export async function countLiveSignatures(client) {
  const { count, error } = await client.from("portal_signatures").select("id", { count: "exact", head: true });
  if (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
  return count || 0;
}

/*
  Signing records come back through an admin-only database function that
  only inserts rows that are missing (and whose booking exists). Signing
  rows are never updated or deleted by a restore.
*/
const SIGNATURE_RESTORE_CHUNK = 100;

export async function restoreSignatureRows(rows, { client }) {
  const live = await fetchAllRows("portal_signatures", client);
  const missing = getRowsMissingFromLive(rows, live.map((row) => row.id));
  let inserted = 0;
  for (let index = 0; index < missing.length; index += SIGNATURE_RESTORE_CHUNK) {
    const { data, error } = await client.rpc("portal_restore_signatures", {
      p_rows: missing.slice(index, index + SIGNATURE_RESTORE_CHUNK),
    });
    if (error) throw error;
    inserted += Number(data) || 0;
  }
  return { inserted, alreadyPresent: rows.length - missing.length, skipped: missing.length - inserted };
}

/*
  Booking change history (version 4 backups) goes through an admin-only
  database function that inserts only rows not already present, matched
  by content, so restoring the same backup twice adds nothing.
*/
const CHANGE_LOG_RESTORE_CHUNK = 500;

export async function restoreChangeLogRows(rows, { client }) {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += CHANGE_LOG_RESTORE_CHUNK) {
    const { data, error } = await client.rpc("staff_app_restore_change_log", {
      p_rows: rows.slice(index, index + CHANGE_LOG_RESTORE_CHUNK),
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) {
        throw new Error("This database cannot restore change history yet. Run supabase/migrations/20261117000100_booking_change_log_keep_history.sql.");
      }
      throw error;
    }
    inserted += Number(data?.inserted) || 0;
  }
  return { inserted, alreadyPresent: rows.length - inserted };
}

// Restored portal rows come back with email options off (and their
// assignment time reset), so a restore can never re-enable or replay emails.
export function withoutEmailOptions(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("email_")));
}

async function insertInChunks(table, rows, client, onProgress) {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows
      .slice(index, index + INSERT_CHUNK_SIZE)
      .map((row) => (table.startsWith("portal_") ? withoutEmailOptions(row) : row));
    const { data, error } = await client
      .from(table)
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    inserted += Array.isArray(data) ? data.length : 0;
    onProgress?.(Math.min(index + chunk.length, rows.length), rows.length);
  }
  return inserted;
}

/*
  Bookings: live rows are updated with the backup's values (that is what
  a restore is for); rows missing from the live table are inserted with
  their original portal token and creation date.
*/
export async function restoreBookingRows(bookings, liveIds, { client, onProgress }) {
  const live = new Set([...liveIds].map(String));
  const existing = bookings.filter((booking) => live.has(String(booking.id)));
  const missing = bookings.filter((booking) => !live.has(String(booking.id)));
  let done = 0;
  const total = bookings.length;

  for (let index = 0; index < existing.length; index += INSERT_CHUNK_SIZE) {
    const chunk = existing.slice(index, index + INSERT_CHUNK_SIZE).map(bookingToDbRow);
    const { error } = await client.from("bookings").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
    done += chunk.length;
    onProgress?.(done, total);
  }

  for (let index = 0; index < missing.length; index += INSERT_CHUNK_SIZE) {
    const chunk = missing.slice(index, index + INSERT_CHUNK_SIZE).map(bookingToRestoreRow);
    const { error } = await client.from("bookings").insert(chunk);
    if (error) throw error;
    done += chunk.length;
    onProgress?.(done, total);
  }

  return { updated: existing.length, inserted: missing.length };
}

/*
  Website inquiries, portal tasks and portal documents: insert only the
  rows that are missing. Each table is reported separately; one failing
  does not stop the others.
*/
// Documents before tasks: a task can point at the document it is signed with.
const SUPPORTING_TABLES = [
  { key: "guestInquiries", table: "guest_inquiries" },
  { key: "portalDocuments", table: "portal_documents" },
  { key: "portalChecklistItems", table: "portal_checklist_items" },
];

export const SUPPORTING_SECTION_KEYS = SUPPORTING_TABLES.map(({ key }) => key);

export async function restoreSupportingSections(sections, { client }) {
  const results = {};

  // Version 3 backups: signing records, after the tasks and documents.
  // Version 4 backups: booking change history.
  const finish = async () => {
    const restoreOptional = async (key, restore) => {
      const rows = Array.isArray(sections[key]) ? sections[key] : [];
      if (rows.length === 0) {
        results[key] = { inserted: 0, alreadyPresent: 0 };
        return;
      }
      try {
        results[key] = await restore(rows, { client });
      } catch (error) {
        results[key] = { error: error?.message || String(error) };
      }
    };
    await restoreOptional("portalSignatures", restoreSignatureRows);
    await restoreOptional("bookingChangeLog", restoreChangeLogRows);
    return results;
  };

  for (const { key, table } of SUPPORTING_TABLES) {
    const rows = Array.isArray(sections[key]) ? sections[key] : [];
    if (rows.length === 0) {
      results[key] = { inserted: 0, alreadyPresent: 0 };
      continue;
    }
    try {
      const liveRows = await fetchAllRows(table, client);
      const missing = getRowsMissingFromLive(rows, liveRows.map((row) => row.id));
      const inserted = await insertInChunks(table, missing, client);
      results[key] = { inserted, alreadyPresent: rows.length - missing.length };
    } catch (error) {
      results[key] = { error: error?.message || String(error) };
    }
  }

  return finish();
}

/*
  Puts back what deleting bookings removed during a Full Replace.

  In the live database, deleting a booking cascades to its
  portal_checklist_items and portal_documents rows and sets
  guest_inquiries.converted_booking_id to null. snapshot is the live data
  read just before the delete (the pre-restore safety backup), so the
  latest portal state wins:

  - portal rows whose booking is back and whose id is missing are
    inserted again; rows that are still live are left as they are;
  - an inquiry link is set again only while the live link is empty.

  Rows whose booking is not back are counted, not inserted (the database
  would refuse them); they stay in the downloaded safety file. Any write
  failure throws, so the caller can roll back, including an inquiry
  update the database silently refused (row-level security returns zero
  rows, not an error).
*/
export async function restorePortalSnapshot(snapshot, bookingIds, { client }) {
  const restoredIds = new Set([...bookingIds].map(String));
  const isLinked = (id) => id !== null && id !== undefined && String(id) !== "";
  // A table read page by page while rows change can return one row twice; keep the first.
  const sectionRows = (key) => {
    const seen = new Set();
    return (Array.isArray(snapshot?.[key]) ? snapshot[key] : []).filter((row) => {
      const id = String(row?.id ?? "");
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const results = {};

  for (const { key, table } of SUPPORTING_TABLES.filter(({ table }) => table.startsWith("portal_"))) {
    const rows = sectionRows(key);
    const restorable = rows.filter((row) => restoredIds.has(String(row.booking_id)));
    const liveRows = await fetchAllRows(table, client);
    const missing = getRowsMissingFromLive(restorable, liveRows.map((row) => row.id));
    const restored = await insertInChunks(table, missing, client);
    if (restored !== missing.length) {
      throw new Error(`Only ${restored} of ${missing.length} ${table} rows could be put back.`);
    }
    results[key] = {
      restored,
      skipped: rows.filter((row) => isLinked(row.booking_id) && !restoredIds.has(String(row.booking_id))).length,
    };
  }

  // shortcut: one update per converted inquiry; fine for hundreds, batch it if this reaches many thousands.
  const linked = sectionRows("guestInquiries").filter((row) => isLinked(row.converted_booking_id));
  const toRelink = linked.filter((row) => restoredIds.has(String(row.converted_booking_id)));
  let relinked = 0;
  for (const row of toRelink) {
    const { data, error } = await client
      .from("guest_inquiries")
      .update({ converted_booking_id: row.converted_booking_id })
      .eq("id", row.id)
      .is("converted_booking_id", null)
      .select("id");
    if (error) throw error;
    relinked += Array.isArray(data) ? data.length : 0;
  }
  // Every link to a deleted booking was just emptied, so each attempt must update one row.
  if (relinked < toRelink.length) {
    throw new Error(
      `Website-inquiry links could not be restored: only ${relinked} of ${toRelink.length} were re-linked to their bookings. ` +
        "This account may not be allowed to update website inquiries."
    );
  }
  results.guestInquiries = {
    relinked,
    skipped: linked.filter((row) => !restoredIds.has(String(row.converted_booking_id))).length,
  };

  return results;
}

