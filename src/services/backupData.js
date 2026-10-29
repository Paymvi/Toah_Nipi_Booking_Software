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
export async function restoreSupportingSections(sections, { client }) {
  const tables = [
    { key: "guestInquiries", table: "guest_inquiries" },
    { key: "portalChecklistItems", table: "portal_checklist_items" },
    { key: "portalDocuments", table: "portal_documents" },
  ];
  const results = {};

  for (const { key, table } of tables) {
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

