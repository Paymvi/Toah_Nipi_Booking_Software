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

// Minimal in-memory Supabase stand-in for the tables a restore touches.
function fakeClient(tables) {
  const calls = [];
  return {
    tables,
    calls,
    from(table) {
      const rows = tables[table] || (tables[table] = []);
      let op = "select";
      let payload = null;
      let options = {};
      const builder = {
        select() { return builder; },
        order() { return builder; },
        range(start, end) { builder.window = [start, end]; return builder; },
        insert(values) { op = "insert"; payload = values; return builder; },
        upsert(values, opts = {}) { op = "upsert"; payload = values; options = opts; return builder; },
        then(resolve) {
          calls.push({ table, op, options });
          if (op === "select") {
            const [start, end] = builder.window || [0, rows.length];
            resolve({ data: rows.slice(start, end + 1), error: null });
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
