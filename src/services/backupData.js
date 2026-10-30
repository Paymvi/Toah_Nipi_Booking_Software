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

export async function fetchBackupSections({ client, fetchBookings }) {
  const sectionErrors = {};
  const bookings = await fetchBookings();

  const readOptional = async (key, table) => {
    try {
      return await fetchAllRows(table, client);
    } catch (error) {
      sectionErrors[key] = error?.message || String(error);
      return [];
    }
  };

  const guestInquiries = await readOptional("guestInquiries", "guest_inquiries");
  const portalChecklistItems = await readOptional("portalChecklistItems", "portal_checklist_items");
  const portalDocuments = await readOptional("portalDocuments", "portal_documents");
  const storageManifest = buildStorageManifest({ portalChecklistItems, portalDocuments, bookings });

  return {
    sections: { bookings, guestInquiries, portalChecklistItems, portalDocuments, storageManifest },
    sectionErrors,
  };
}

async function insertInChunks(table, rows, client, onProgress) {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
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
const SUPPORTING_TABLES = [
  { key: "guestInquiries", table: "guest_inquiries" },
  { key: "portalChecklistItems", table: "portal_checklist_items" },
  { key: "portalDocuments", table: "portal_documents" },
];

export const SUPPORTING_SECTION_KEYS = SUPPORTING_TABLES.map(({ key }) => key);

export async function restoreSupportingSections(sections, { client }) {
  const results = {};

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

  return results;
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

