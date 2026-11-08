import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";

import {
  buildStorageManifest,
  validateBackupShape,
  verifyBackupIntegrity,
} from "../src/utils/backupFormat.js";
import {
  countLiveSignatures,
  fetchBackupSections,
  restoreSupportingSections,
} from "../src/services/backupData.js";
import {
  buildSignedDocumentsArchive,
  readSignedDocumentsArchive,
  restoreSignedDocumentsArchive,
  sha256OfBytes,
} from "../src/services/signingBackup.js";

const sha = async (text) => createHash("sha256").update(text).digest("hex");

/* A small stand-in for the Supabase client: tables, an RPC log and storage. */
function fakeClient({ tables = {}, files = {}, missing = [] } = {}) {
  const calls = { rpc: [], writes: [] };
  const client = {
    calls,
    from(table) {
      const query = {
        filters: [],
        select(_columns, options) {
          query.head = options?.head;
          return query;
        },
        order() {
          return query;
        },
        gte(column, value) {
          query.filters.push((row) => String(row[column]) >= value);
          return query;
        },
        range(from, to) {
          if (missing.includes(table)) return Promise.resolve({ data: null, error: { code: "PGRST205", message: "missing" } });
          const rows = (tables[table] || []).filter((row) => query.filters.every((keep) => keep(row)));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        then(resolve) {
          // count queries: select(..., { head: true })
          if (missing.includes(table)) return resolve({ count: null, error: { code: "42P01" } });
          return resolve({ count: (tables[table] || []).length, error: null });
        },
        upsert(rows) {
          calls.writes.push({ table, rows });
          return { select: () => Promise.resolve({ data: rows.map((row) => ({ id: row.id })), error: null }) };
        },
        insert(rows) {
          calls.writes.push({ table, rows });
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
    rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === "portal_restore_signatures") {
        const known = new Set((tables.bookings || []).map((booking) => booking.id));
        const added = args.p_rows.filter((row) => known.has(row.booking_id));
        tables.portal_signatures = [...(tables.portal_signatures || []), ...added];
        return Promise.resolve({ data: added.length, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unknown" } });
    },
    storage: {
      from: () => ({
        download: async (path) =>
          files[path] ? { data: new Blob([files[path]]), error: null } : { data: null, error: { message: "not found" } },
      }),
    },
  };
  return client;
}

async function signatureRow(id, bookingId, originalBytes, signedBytes) {
  return {
    id,
    booking_id: bookingId,
    signer_name: "Fictional Signer",
    signed_at: "2026-11-07T19:30:00Z",
    original_path: `signatures/${id}/a/original.pdf`,
    original_sha256: await sha256OfBytes(originalBytes),
    original_size: originalBytes.length,
    signed_path: `signatures/${id}/a/signed.pdf`,
    signed_sha256: await sha256OfBytes(signedBytes),
    signed_size: signedBytes.length,
  };
}

test("backups made by the previous app version (version 2) still verify and restore", async () => {
  // Exactly what the version 2 app wrote: these five keys, in this order.
  const payload = {
    bookings: [{ id: "b1" }],
    guestInquiries: [],
    portalChecklistItems: [{ id: 10, booking_id: "b1" }],
    portalDocuments: [],
    storageManifest: [],
  };
  const backup = {
    format: "toah-nipi-booking-backup",
    schemaVersion: 2,
    integrity: { algorithm: "SHA-256", checksum: await sha(JSON.stringify(payload)) },
    payload,
  };
  assert.deepEqual(validateBackupShape(backup).errors, []);
  assert.ok(validateBackupShape(backup).warnings.some((warning) => /before online signing/.test(warning)));
  assert.equal((await verifyBackupIntegrity(backup, sha)).ok, true);

  const client = fakeClient({ tables: { bookings: [{ id: "b1" }] } });
  const results = await restoreSupportingSections(payload, { client });
  assert.deepEqual(results.portalSignatures, { inserted: 0, alreadyPresent: 0 });
  assert.equal(client.calls.rpc.length, 0);
});

test("the file manifest lists every signed PDF with its recorded fingerprint", () => {
  const manifest = buildStorageManifest({
    portalSignatures: [
      { id: "s1", booking_id: "b1", original_path: "signatures/k/a/original.pdf", original_sha256: "a".repeat(64), original_size: 10, signed_path: "signatures/k/a/signed.pdf", signed_sha256: "b".repeat(64), signed_size: 12 },
    ],
  });
  assert.deepEqual(
    manifest.map((entry) => [entry.bucket, entry.kind, entry.sha256]),
    [
      ["portal-signed", "original", "a".repeat(64)],
      ["portal-signed", "signed", "b".repeat(64)],
    ]
  );
});

test("signing rows are restored only through the insert-missing database function", async () => {
  const live = { id: "s-live", booking_id: "b1" };
  const client = fakeClient({ tables: { bookings: [{ id: "b1" }], portal_signatures: [live] } });
  const results = await restoreSupportingSections(
    { portalSignatures: [live, { id: "s-missing", booking_id: "b1" }, { id: "s-orphan", booking_id: "gone" }] },
    { client }
  );
  assert.deepEqual(results.portalSignatures, { inserted: 1, alreadyPresent: 1, skipped: 1 });
  assert.equal(client.calls.rpc.length, 1);
  assert.deepEqual(client.calls.rpc[0].args.p_rows.map((row) => row.id), ["s-missing", "s-orphan"]);
  assert.ok(!client.calls.writes.some((write) => write.table === "portal_signatures"), "never written directly");
});

test("before the signing migration, backups and the Replace check treat signing as empty", async () => {
  const client = fakeClient({ tables: {}, missing: ["portal_signatures"] });
  const { sections, sectionErrors } = await fetchBackupSections({ client, fetchBookings: async () => [] });
  assert.deepEqual(sections.portalSignatures, []);
  assert.equal("portalSignatures" in sectionErrors, false);
  assert.equal(await countLiveSignatures(client), 0);
});

test("Full Replace sees live signing records", async () => {
  const client = fakeClient({ tables: { portal_signatures: [{ id: "s1" }, { id: "s2" }] } });
  assert.equal(await countLiveSignatures(client), 2);
});

test("the signed-documents export round-trips and refuses tampered files", async () => {
  const original = new TextEncoder().encode("%PDF-fictional original");
  const signed = new TextEncoder().encode("%PDF-fictional signed copy");
  const row = await signatureRow("s1", "b1", original, signed);
  const client = fakeClient({
    tables: { bookings: [{ id: "b1" }], portal_signatures: [row] },
    files: { [row.original_path]: original, [row.signed_path]: signed },
  });

  const { bytes, manifest } = await buildSignedDocumentsArchive({ client, JSZip });
  assert.equal(manifest.signatureCount, 1);
  assert.equal(manifest.fileCount, 2);
  assert.deepEqual(manifest.problems, []);

  const checked = await readSignedDocumentsArchive({ bytes, JSZip });
  assert.equal(checked.files.length, 2);
  assert.deepEqual(checked.problems, []);

  // Altering one PDF inside the export is caught before anything is restored.
  const zip = await JSZip.loadAsync(bytes);
  zip.file(`files/${row.signed_path}`, new TextEncoder().encode("%PDF-altered"));
  const tampered = await zip.generateAsync({ type: "uint8array" });
  let uploads = 0;
  const refused = await restoreSignedDocumentsArchive({
    bytes: tampered,
    JSZip,
    client,
    restoreFile: async () => {
      uploads += 1;
      return { status: "restored" };
    },
  });
  assert.equal(refused.ok, false);
  assert.equal(uploads, 0);
  assert.equal(client.calls.rpc.length, 0);
});

test("restoring an export into an empty database adds the records and every file", async () => {
  const original = new TextEncoder().encode("%PDF-fictional original");
  const signed = new TextEncoder().encode("%PDF-fictional signed copy");
  const row = await signatureRow("s1", "b1", original, signed);
  const source = fakeClient({
    tables: { portal_signatures: [row] },
    files: { [row.original_path]: original, [row.signed_path]: signed },
  });
  const { bytes } = await buildSignedDocumentsArchive({ client: source, JSZip });

  const target = fakeClient({ tables: { bookings: [{ id: "b1" }], portal_signatures: [] } });
  const stored = {};
  const outcome = await restoreSignedDocumentsArchive({
    bytes,
    JSZip,
    client: target,
    restoreFile: async (path, fileBytes) => {
      if (stored[path]) return { status: "present" };
      stored[path] = fileBytes;
      return { status: "restored" };
    },
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.rows.inserted, 1);
  assert.equal(outcome.restored, 2);
  assert.equal(await sha256OfBytes(stored[row.signed_path]), row.signed_sha256);

  // Running it again changes nothing.
  const again = await restoreSignedDocumentsArchive({ bytes, JSZip, client: target, restoreFile: async () => ({ status: "present" }) });
  assert.equal(again.rows.inserted, 0);
  assert.equal(again.present, 2);
});

test("files altered in storage are reported at export and never restored", async () => {
  const original = new TextEncoder().encode("%PDF-fictional original");
  const signed = new TextEncoder().encode("%PDF-fictional signed copy");
  const row = await signatureRow("s1", "b1", original, signed);
  const client = fakeClient({
    tables: { portal_signatures: [row] },
    files: { [row.original_path]: original, [row.signed_path]: new TextEncoder().encode("%PDF-changed in storage") },
  });
  const { bytes, manifest } = await buildSignedDocumentsArchive({ client, JSZip });
  assert.equal(manifest.problems.length, 1);
  const checked = await readSignedDocumentsArchive({ bytes, JSZip });
  assert.equal(checked.files.length, 1);
  assert.equal(checked.skipped.length, 1);
});
