import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildStorageManifest,
  createBackupEnvelope,
  validateBackupShape,
  verifyBackupIntegrity,
} from "../src/utils/backupFormat.js";
import {
  fetchBackupSections,
  restoreBookingRows,
  restorePortalSnapshot,
  restoreSupportingSections,
} from "../src/services/backupData.js";
import { dbRowToBooking } from "../src/services/bookingMapping.js";

const sha = async (text) => createHash("sha256").update(text).digest("hex");

/*
  A version 1 file exactly as README says the Apps Script writes it:
  checksum = SHA-256 of JSON.stringify({ bookings }).
*/
async function appsScriptStyleV1(bookings) {
  return {
    format: "toah-nipi-booking-backup",
    schemaVersion: 1,
    createdAt: "2026-10-27T06:00:00.000Z",
    reason: "scheduled-daily",
    summary: { bookingCount: bookings.length },
    integrity: { algorithm: "SHA-256", checksum: await sha(JSON.stringify({ bookings })) },
    payload: { bookings },
  };
}

test("existing version 1 backups (Apps Script format) still validate and verify", async () => {
  const backup = await appsScriptStyleV1([{ id: "b1", organizationName: "Camp" }]);
  const shape = validateBackupShape(backup);
  assert.deepEqual(shape.errors, []);
  assert.ok(shape.warnings.some((warning) => /version 1 backup/.test(warning)));
  assert.equal((await verifyBackupIntegrity(backup, sha)).ok, true);

  backup.payload.bookings[0].organizationName = "Edited";
  assert.equal((await verifyBackupIntegrity(backup, sha)).ok, false);
});

test("version 2 backups cover every section and detect tampering in any of them", async () => {
  const backup = await createBackupEnvelope(
    {
      bookings: [{ id: "b1", portalToken: "tok1", createdAt: "2026-01-01T00:00:00+00:00" }],
      guestInquiries: [{ id: "gi1", status: "converted", converted_booking_id: "b1" }],
      portalChecklistItems: [{ id: 10, booking_id: "b1", item_id: "contract", uploaded_file_path: "tok1/contract.pdf" }],
      portalDocuments: [{ id: 20, booking_id: "b1", file_name: "map.pdf", uploaded_by_guest: false }],
      storageManifest: [{ path: "tok1/contract.pdf" }],
    },
    { hash: sha, createdAt: "2026-10-28T00:00:00.000Z" }
  );
  assert.equal(backup.schemaVersion, 2);
  assert.deepEqual(validateBackupShape(backup).errors, []);
  assert.equal((await verifyBackupIntegrity(backup, sha)).ok, true);

  backup.payload.portalChecklistItems[0].status = "completed";
  assert.equal((await verifyBackupIntegrity(backup, sha)).ok, false);
});

test("unreadable sections are named, not silently dropped", async () => {
  const backup = await createBackupEnvelope({ bookings: [{ id: "b1" }] }, {
    hash: sha,
    sectionErrors: { portalDocuments: "permission denied for table portal_documents" },
  });
  const { warnings } = validateBackupShape(backup);
  assert.ok(warnings.some((warning) => /Portal documents could not be read/.test(warning)));
});

test("the file manifest lists locations only and keeps relationships", () => {
  const manifest = buildStorageManifest({
    bookings: [{ id: "b1", portalToken: "tok1" }],
    portalChecklistItems: [{ id: 10, booking_id: "b1", uploaded_file_path: "tok1/items/insurance.pdf", uploaded_file_name: "insurance.pdf" }],
    portalDocuments: [
      { id: 20, booking_id: "b1", file_name: "rules.pdf", uploaded_by_guest: false },
      { id: 21, booking_id: "b1", file_name: "x.pdf", storage_path: "tok1/staff-documents/21/x.pdf" },
    ],
  });
  assert.deepEqual(manifest.map((entry) => entry.path), [
    "tok1/items/insurance.pdf",
    "tok1/staff-documents/20/rules.pdf",
    "tok1/staff-documents/21/x.pdf",
  ]);
  assert.equal(manifest[1].pathIsDerived, true);
  assert.equal(manifest[2].pathIsDerived, false);
  assert.ok(manifest.every((entry) => entry.bookingId === "b1"));
});

/*
  Minimal in-memory Supabase stand-in for the tables a restore touches.
  refuseUpdates lists tables whose updates match zero rows without an
  error, as row-level security does for a write it does not allow.
*/
function fakeClient(tables, { refuseUpdates = [] } = {}) {
  const calls = [];
  return {
    tables,
    calls,
    from(table) {
      const rows = tables[table] || (tables[table] = []);
      let op = "select";
      let payload = null;
      let options = {};
      const filters = [];
      const builder = {
        select() { return builder; },
        order() { return builder; },
        range(start, end) { builder.window = [start, end]; return builder; },
        insert(values) { op = "insert"; payload = values; return builder; },
        upsert(values, opts = {}) { op = "upsert"; payload = values; options = opts; return builder; },
        update(values) { op = "update"; payload = values; return builder; },
        eq(column, value) { filters.push((row) => String(row[column]) === String(value)); return builder; },
        is(column, value) { filters.push((row) => (row[column] ?? null) === value); return builder; },
        then(resolve) {
          calls.push({ table, op, options });
          if (op === "select") {
            const [start, end] = builder.window || [0, rows.length];
            resolve({ data: rows.slice(start, end + 1), error: null });
            return;
          }
          if (op === "update") {
            const matched = refuseUpdates.includes(table)
              ? []
              : rows.filter((row) => filters.every((filter) => filter(row)));
            matched.forEach((row) => Object.assign(row, payload));
            resolve({ data: matched.map((row) => ({ id: row.id })), error: null });
            return;
          }
          const written = [];
          payload.forEach((row) => {
            const index = rows.findIndex((existing) => String(existing.id) === String(row.id));
            if (op === "insert" && index !== -1) {
              resolve({ data: null, error: { code: "23505", message: "duplicate" } });
              return;
            }
            if (index !== -1 && options.ignoreDuplicates) return;
            if (index !== -1) rows[index] = { ...rows[index], ...row };
            else rows.push({ created_at: "restore-time", portal_token: `new-${row.id}`, ...row });
            written.push(row);
          });
          resolve({ data: written.map((row) => ({ id: row.id })), error: null });
        },
      };
      return builder;
    },
  };
}

test("a replace-style restore keeps booking IDs, portal tokens and creation dates", async () => {
  const backupBookings = [
    { id: "b1", organizationName: "Camp", portalToken: "tok1", createdAt: "2025-02-01T10:00:00+00:00" },
    { id: "b2", organizationName: "Church", portalToken: "tok2", createdAt: "2025-03-01T10:00:00+00:00" },
  ];
  const client = fakeClient({ bookings: [] });
  const result = await restoreBookingRows(backupBookings, new Set(), { client });
  assert.deepEqual(result, { updated: 0, inserted: 2 });

  const restored = client.tables.bookings.map(dbRowToBooking);
  assert.deepEqual(restored.map((booking) => [booking.id, booking.portalToken, booking.createdAt]), [
    ["b1", "tok1", "2025-02-01T10:00:00+00:00"],
    ["b2", "tok2", "2025-03-01T10:00:00+00:00"],
  ]);
});

test("a merge restore never rewrites the token or creation date of live bookings", async () => {
  const client = fakeClient({
    bookings: [{ id: "b1", organization_name: "Live", portal_token: "live-token", created_at: "2025-01-01T00:00:00+00:00" }],
  });
  await restoreBookingRows(
    [{ id: "b1", organizationName: "From backup", portalToken: "other", createdAt: "1999-01-01" }],
    new Set(["b1"]),
    { client }
  );
  const row = client.tables.bookings[0];
  assert.equal(row.organization_name, "From backup");
  assert.equal(row.portal_token, "live-token");
  assert.equal(row.created_at, "2025-01-01T00:00:00+00:00");
});

test("portal and inquiry rows are restored only when missing, with their links intact", async () => {
  const client = fakeClient({
    guest_inquiries: [{ id: "gi1", status: "pending" }],
    portal_checklist_items: [{ id: 10, booking_id: "b1", status: "completed" }],
    portal_documents: [],
  });
  const results = await restoreSupportingSections(
    {
      guestInquiries: [{ id: "gi1", status: "converted" }, { id: "gi2", status: "pending" }],
      portalChecklistItems: [{ id: 10, booking_id: "b1", status: "notStarted" }, { id: 11, booking_id: "b1", status: "needsReview" }],
      portalDocuments: [{ id: 20, booking_id: "b1", file_name: "map.pdf" }],
    },
    { client }
  );
  assert.deepEqual(results.guestInquiries, { inserted: 1, alreadyPresent: 1 });
  assert.deepEqual(results.portalChecklistItems, { inserted: 1, alreadyPresent: 1 });
  assert.equal(client.tables.guest_inquiries.find((row) => row.id === "gi1").status, "pending");
  assert.equal(client.tables.portal_checklist_items.find((row) => row.id === 10).status, "completed");
  assert.equal(client.tables.portal_checklist_items.find((row) => row.id === 11).booking_id, "b1");
  assert.equal(client.tables.portal_documents[0].booking_id, "b1");

  const order = client.calls.filter((call) => call.op === "upsert").map((call) => call.table);
  assert.deepEqual(order, ["guest_inquiries", "portal_checklist_items", "portal_documents"]);
});

/*
  Full Replace against the live foreign-key rules: deleting bookings
  cascades to portal_checklist_items and portal_documents and sets
  guest_inquiries.converted_booking_id to null.
*/
function liveDatabase(options) {
  return fakeClient({
    bookings: [
      { id: "b1", portal_token: "tok1" },
      { id: "b2", portal_token: "tok2" },
      { id: "b3", portal_token: "tok3" },
    ],
    portal_checklist_items: [
      { id: 10, booking_id: "b1", status: "completed" },
      { id: 30, booking_id: "b3", status: "completed" },
      { id: 99, booking_id: null, status: "notStarted" },
    ],
    portal_documents: [{ id: 20, booking_id: "b2", file_name: "map.pdf" }],
    guest_inquiries: [
      { id: "gi1", status: "converted", converted_booking_id: "b1" },
      { id: "gi3", status: "converted", converted_booking_id: "b3" },
    ],
  }, options);
}

function deleteAllBookingsWithCascade(client) {
  const { tables } = client;
  tables.bookings.length = 0;
  tables.portal_checklist_items = tables.portal_checklist_items.filter((row) => row.booking_id === null);
  tables.portal_documents = tables.portal_documents.filter((row) => row.booking_id === null);
  tables.guest_inquiries.forEach((row) => { row.converted_booking_id = null; });
}

const snapshotOf = (client) => structuredClone({
  portalChecklistItems: client.tables.portal_checklist_items,
  portalDocuments: client.tables.portal_documents,
  guestInquiries: client.tables.guest_inquiries,
});

test("Full Replace puts back cascade-deleted portal rows and inquiry links, live data winning", async () => {
  const client = liveDatabase();
  const snapshot = snapshotOf(client);
  deleteAllBookingsWithCascade(client);
  assert.equal(client.tables.portal_checklist_items.length, 1);

  // A v2 backup without b3, holding an older copy of task 10 and a task deleted since.
  const backup = {
    bookings: [{ id: "b1", portalToken: "tok1" }, { id: "b2", portalToken: "tok2" }],
    portalChecklistItems: [
      { id: 10, booking_id: "b1", status: "notStarted" },
      { id: 11, booking_id: "b1", status: "needsReview" },
    ],
    portalDocuments: [],
    guestInquiries: [{ id: "gi1", status: "pending", converted_booking_id: null }],
  };
  await restoreBookingRows(backup.bookings, new Set(), { client });
  const portal = await restorePortalSnapshot(snapshot, backup.bookings.map((b) => b.id), { client });
  await restoreSupportingSections(backup, { client });

  assert.deepEqual(portal, {
    portalChecklistItems: { restored: 1, skipped: 1 },
    portalDocuments: { restored: 1, skipped: 0 },
    guestInquiries: { relinked: 1, skipped: 1 },
  });
  const items = Object.fromEntries(client.tables.portal_checklist_items.map((row) => [row.id, row]));
  assert.equal(items[10].status, "completed", "the live copy wins over the backup");
  assert.equal(items[11].status, "needsReview", "missing backup rows are still added");
  assert.equal(items[30], undefined, "a task of a booking not in the backup is not inserted");
  assert.ok(items[99], "an unlinked task was never deleted and is left alone");
  assert.equal(client.tables.portal_documents[0].id, 20);
  const inquiries = Object.fromEntries(client.tables.guest_inquiries.map((row) => [row.id, row]));
  assert.equal(inquiries.gi1.converted_booking_id, "b1");
  assert.equal(inquiries.gi1.status, "converted");
  assert.equal(inquiries.gi3.converted_booking_id, null);

  // A version 1 backup (bookings only) relies on the snapshot alone.
  const v1 = liveDatabase();
  const v1Snapshot = snapshotOf(v1);
  deleteAllBookingsWithCascade(v1);
  await restoreBookingRows([{ id: "b1" }, { id: "b2" }], new Set(), { client: v1 });
  await restorePortalSnapshot(v1Snapshot, ["b1", "b2"], { client: v1 });
  assert.deepEqual(v1.tables.portal_checklist_items.map((row) => row.id).sort(), [10, 99]);
  assert.deepEqual(v1.tables.portal_documents.map((row) => row.id), [20]);
});

test("a rollback after a failed Replace returns every portal row and inquiry link", async () => {
  const client = liveDatabase();
  const original = structuredClone(client.tables);
  const snapshot = snapshotOf(client);
  const originalBookings = client.tables.bookings.map(dbRowToBooking);

  deleteAllBookingsWithCascade(client);
  await restoreBookingRows([{ id: "b1" }], new Set(), { client });
  // Restore failed here; rollback deletes again and re-inserts the originals.
  deleteAllBookingsWithCascade(client);
  await restoreBookingRows(originalBookings, new Set(), { client });
  await restorePortalSnapshot(snapshot, originalBookings.map((b) => b.id), { client });

  // Compares the rows' own fields; the fake client adds booking defaults to inserts.
  const portalRows = (rows) => rows
    .map(({ id, booking_id, status, file_name }) => ({ id, booking_id, status, file_name }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  assert.deepEqual(portalRows(client.tables.portal_checklist_items), portalRows(original.portal_checklist_items));
  assert.deepEqual(portalRows(client.tables.portal_documents), portalRows(original.portal_documents));
  assert.deepEqual(client.tables.guest_inquiries, original.guest_inquiries);
});

/*
  Same order as handleRestore in DashboardBackups.jsx: delete, restore
  bookings, put back the snapshot; on any throw, delete again, re-insert
  the original bookings and put back the snapshot again.
*/
async function fullReplaceWithRollback(client, backupBookings) {
  const snapshot = snapshotOf(client);
  const originalBookings = client.tables.bookings.map(dbRowToBooking);
  deleteAllBookingsWithCascade(client);
  try {
    await restoreBookingRows(backupBookings, new Set(), { client });
    await restorePortalSnapshot(snapshot, backupBookings.map((b) => b.id), { client });
    return { replaceError: null, rollbackError: null };
  } catch (replaceError) {
    deleteAllBookingsWithCascade(client);
    await restoreBookingRows(originalBookings, new Set(), { client });
    try {
      await restorePortalSnapshot(snapshot, originalBookings.map((b) => b.id), { client });
      return { replaceError, rollbackError: null };
    } catch (rollbackError) {
      return { replaceError, rollbackError };
    }
  }
}

test("an inquiry re-link the database silently refuses fails the Replace and starts the rollback", async () => {
  const client = liveDatabase({ refuseUpdates: ["guest_inquiries"] });
  const { replaceError, rollbackError } = await fullReplaceWithRollback(client, [{ id: "b1" }, { id: "b2" }]);

  assert.match(replaceError?.message, /Website-inquiry links could not be restored: only 0 of 1 /);

  // The rollback brings every booking and portal row back first...
  assert.deepEqual(client.tables.bookings.map((row) => row.id), ["b1", "b2", "b3"]);
  assert.deepEqual(client.tables.portal_checklist_items.map((row) => row.id).sort(), [10, 30, 99]);
  assert.deepEqual(client.tables.portal_documents.map((row) => row.id), [20]);
  // ...but the same refusal stops its own re-link step, so it reports failure too.
  assert.match(rollbackError?.message, /only 0 of 2 /);
  assert.ok(client.tables.guest_inquiries.every((row) => row.converted_booking_id === null));
});

test("a successful Replace through the same path does not roll back", async () => {
  const client = liveDatabase();
  const result = await fullReplaceWithRollback(client, [{ id: "b1" }, { id: "b2" }]);
  assert.deepEqual(result, { replaceError: null, rollbackError: null });
  assert.deepEqual(client.tables.bookings.map((row) => row.id), ["b1", "b2"]);
  assert.equal(client.tables.guest_inquiries.find((row) => row.id === "gi1").converted_booking_id, "b1");
});

test("duplicate ids in the snapshot are put back once, keeping the first copy", async () => {
  const client = liveDatabase();
  const snapshot = snapshotOf(client);
  snapshot.portalChecklistItems.push({ id: 10, booking_id: "b1", status: "stale second read" });
  snapshot.portalDocuments.push({ ...snapshot.portalDocuments[0], file_name: "second.pdf" });
  snapshot.guestInquiries.push({ ...snapshot.guestInquiries[0] });
  deleteAllBookingsWithCascade(client);
  await restoreBookingRows([{ id: "b1" }, { id: "b2" }, { id: "b3" }], new Set(), { client });

  const result = await restorePortalSnapshot(snapshot, ["b1", "b2", "b3"], { client });

  assert.deepEqual(result, {
    portalChecklistItems: { restored: 2, skipped: 0 },
    portalDocuments: { restored: 1, skipped: 0 },
    guestInquiries: { relinked: 2, skipped: 0 },
  });
  const tasks = client.tables.portal_checklist_items.filter((row) => row.id === 10);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "completed");
  assert.deepEqual(client.tables.portal_documents.map((row) => row.file_name), ["map.pdf"]);
});

test("a section that cannot be read is reported, and the rest of the backup is kept", async () => {
  const client = fakeClient({ guest_inquiries: [{ id: "gi1" }], portal_documents: [] });
  const originalFrom = client.from.bind(client);
  client.from = (table) => {
    if (table === "portal_checklist_items") {
      return { select: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: "relation does not exist" } }) }) }) };
    }
    return originalFrom(table);
  };
  const { sections, sectionErrors } = await fetchBackupSections({
    client,
    fetchBookings: async () => [{ id: "b1", portalToken: "tok1" }],
  });
  assert.equal(sections.guestInquiries.length, 1);
  assert.deepEqual(sections.portalChecklistItems, []);
  assert.match(sectionErrors.portalChecklistItems, /does not exist/);
});
