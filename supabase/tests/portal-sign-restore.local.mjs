// Restore drill for online signing against a LOCAL Supabase stack. FICTIONAL DATA ONLY.
//
//   1. Signs fictional documents, then exports a version 3 JSON backup and a
//      signed-documents .zip with the same code the Backups page uses.
//   2. Wipes the local database (supabase db reset: every row and stored-file
//      record is gone).
//   3. Restores the JSON backup (Merge) and the .zip as an admin.
//   4. Checks every record and every file fingerprint, a guest download, and
//      that signing records then block booking deletion and Full Replace.
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SUPABASE_WORKDIR=<folder holding the local supabase/ config> LOCAL_DRILL_DIR=<scratch folder> \
//     node supabase/tests/portal-sign-restore.local.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

import { AGREEMENT_VERSION, sha256Hex } from "../functions/portal-sign/signing.js";
import { drawingDataUrl, sampleContract, samplePolicyA4 } from "../../tests/fixtures/signingFixtures.js";
import { dbRowToBooking } from "../../src/services/bookingMapping.js";
import { countLiveSignatures, fetchBackupSections, restoreBookingRows, restoreSupportingSections } from "../../src/services/backupData.js";
import { createBackupEnvelope, verifyBackupIntegrity } from "../../src/utils/backupFormat.js";
import { buildSignedDocumentsArchive, restoreSignedDocumentsArchive } from "../../src/services/signingBackup.js";

const url = process.env.LOCAL_SUPABASE_URL || "";
const anonKey = process.env.LOCAL_ANON_KEY || "";
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY || "";
const workdir = process.env.LOCAL_SUPABASE_WORKDIR || "";
const drillDir = process.env.LOCAL_DRILL_DIR || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !anonKey || !serviceKey || !workdir || !drillDir) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY, LOCAL_SUPABASE_WORKDIR and LOCAL_DRILL_DIR.");
  process.exit(2);
}
fs.mkdirSync(drillDir, { recursive: true });

const options = { auth: { persistSession: false, autoRefreshToken: false } };
// LOCAL_SEEDER_KEY (optional): a fixture role, so the stack's service_role can keep the live grants the function gets.
const admin = () => createClient(url, process.env.LOCAL_SEEDER_KEY || serviceKey, options);
const authAdmin = () => createClient(url, serviceKey, options);
const step = (text) => console.log(`\n== ${text}`);

// After a reset the API and storage services restart; wait until both answer.
async function resetAndWait() {
  execSync(`npx --no-install supabase db reset --local --workdir "${workdir}"`, { stdio: "ignore" });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const { error: dbError } = await admin().from("portal_signing_settings").select("id").limit(1);
      const { error: storageError } = await admin().storage.from("portal-signed").list("", { limit: 1 });
      if (!dbError && !storageError) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("The local stack did not come back after the reset.");
}

async function signIn() {
  const service = admin();
  const email = "drill-admin@example.test";
  const password = "drill-Local-Only-1!";
  const { data: list } = await authAdmin().auth.admin.listUsers();
  let user = list.users.find((candidate) => candidate.email === email);
  if (!user) {
    const created = await authAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  await service.from("staff_profiles").upsert({ user_id: user.id, email, full_name: "Drill Admin", role: "admin", is_active: true });
  const client = createClient(url, anonKey, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, accessToken: data.session.access_token };
}

async function callFunction(body) {
  const response = await fetch(`${url}/functions/v1/portal-sign`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function seedSignedBooking(label, signatureType) {
  const service = admin();
  const id = `drill-${label}`;
  const token = crypto.randomUUID().replaceAll("-", "");
  await service.from("bookings").insert({ id, portal_token: token, organization_name: `Fictional ${label} Group`, status: "Confirmed", start_date: "2027-06-01", end_date: "2027-06-03" });
  const { data: document } = await service
    .from("portal_documents")
    .insert({ booking_id: id, title: "Sample Agreement (fictional)", document_type: "Staff Document", file_name: "sample.pdf", status: "ready", uploaded_by_guest: false })
    .select("id")
    .single();
  const storagePath = `${token}/staff-documents/${document.id}/sample.pdf`;
  await service.storage.from("portal-uploads").upload(storagePath, label === "a4" ? await samplePolicyA4() : await sampleContract(), { contentType: "application/pdf" });
  await service.from("portal_documents").update({ storage_path: storagePath }).eq("id", document.id);
  await service.from("portal_checklist_items").insert({ booking_id: id, item_id: "contract", title: "Sign and return contract", status: "notStarted", required: true, guest_action: "upload_file", sort_order: 1, sign_document_id: document.id });
  const { data: settings } = await service.from("portal_signing_settings").select("test_booking_ids").single();
  await service.from("portal_signing_settings").update({ test_booking_ids: [...settings.test_booking_ids, id] }).eq("id", true);

  const opened = await callFunction({ action: "open", token, itemKey: "contract" });
  const signed = await callFunction({
    action: "sign",
    token,
    itemKey: "contract",
    documentId: opened.body.document.id,
    documentSha256: opened.body.document.sha256,
    requestKey: crypto.randomUUID(),
    agreementVersion: AGREEMENT_VERSION,
    agreed: true,
    signerName: `Fictional Signer ${label}`,
    organizationName: `Fictional ${label} Group`,
    signsForOrganization: true,
    authorityConfirmed: true,
    signatureType,
    drawing: signatureType === "drawn" ? drawingDataUrl() : undefined,
  });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  return { id, token };
}

async function snapshot(client) {
  const read = async (table) => (await client.from(table).select("*").order("id")).data;
  return {
    bookings: await read("bookings"),
    portal_documents: await read("portal_documents"),
    portal_checklist_items: await read("portal_checklist_items"),
    portal_signatures: await read("portal_signatures"),
  };
}

/* ---------- 1. Sign and export ---------- */
step("1. Sign fictional documents and export");
await resetAndWait();
const bookings = [await seedSignedBooking("typed", "typed"), await seedSignedBooking("drawn", "drawn"), await seedSignedBooking("a4", "typed")];
let { client, accessToken } = await signIn();
const before = await snapshot(client);
assert.equal(before.portal_signatures.length, 3);

const fetchBookings = async () => (await client.from("bookings").select("*").order("id")).data.map(dbRowToBooking);
const { sections, sectionErrors } = await fetchBackupSections({ client, fetchBookings });
assert.deepEqual(sectionErrors, {});
const backup = await createBackupEnvelope(sections, { reason: "drill" });
assert.equal(backup.schemaVersion, 3);
assert.equal(backup.payload.portalSignatures.length, 3);
fs.writeFileSync(path.join(drillDir, "drill-backup.json"), JSON.stringify(backup, null, 2));
const archive = await buildSignedDocumentsArchive({ client, JSZip });
assert.deepEqual(archive.manifest.problems, []);
assert.equal(archive.manifest.fileCount, 6);
fs.writeFileSync(path.join(drillDir, "drill-signed-documents.zip"), archive.bytes);
console.log(`exported ${backup.payload.bookings.length} bookings, ${backup.payload.portalSignatures.length} signing records, ${archive.manifest.fileCount} PDFs`);

/* ---------- 2. Lose everything ---------- */
step("2. Wipe the local database");
await resetAndWait();
({ client, accessToken } = await signIn());
const empty = await snapshot(client);
assert.equal(empty.bookings.length, 0);
assert.equal(empty.portal_signatures.length, 0);
const gone = await admin().storage.from("portal-signed").download(before.portal_signatures[0].signed_path);
assert.ok(gone.error && !/fetch failed/i.test(gone.error.message), `signed files are gone (${gone.error?.message})`);
const { data: remaining } = await admin().storage.from("portal-signed").list("signatures");
assert.equal(remaining.length, 0, "no signed files are listed");
console.log("database empty; signed files unreachable");

/* ---------- 3. Restore from the two files on disk ---------- */
step("3. Restore the JSON backup (Merge) and the signed-documents .zip");
const savedBackup = JSON.parse(fs.readFileSync(path.join(drillDir, "drill-backup.json"), "utf8"));
assert.equal((await verifyBackupIntegrity(savedBackup)).ok, true);
await restoreBookingRows(savedBackup.payload.bookings, new Set(), { client });
const supporting = await restoreSupportingSections(savedBackup.payload, { client });
console.log("records:", JSON.stringify(supporting));
assert.ok(Object.values(supporting).every((result) => !result.error), JSON.stringify(supporting));

const restoreFile = async (filePath, bytes) => {
  const response = await fetch(`${url}/functions/v1/portal-sign?action=restore_file`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${accessToken}`, "x-restore-path": filePath, "content-type": "application/pdf" },
    body: bytes,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
};
const files = await restoreSignedDocumentsArchive({ bytes: fs.readFileSync(path.join(drillDir, "drill-signed-documents.zip")), JSZip, client, restoreFile });
console.log(`files: ${files.restored} restored, ${files.present} already present; rows: ${JSON.stringify(files.rows)}`);
assert.equal(files.ok, true);
assert.equal(files.restored, 6);

/* ---------- 4. Verify ---------- */
step("4. Verify records, files, guest access and protections");
const after = await snapshot(client);
for (const table of ["bookings", "portal_documents", "portal_checklist_items", "portal_signatures"]) {
  assert.equal(after[table].length, before[table].length, `${table} count`);
}
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["recorded_at"].includes(key)));
assert.deepEqual(after.portal_signatures.map(strip), before.portal_signatures.map(strip), "signing records restored exactly");
for (const row of after.portal_signatures) {
  for (const [filePath, expected] of [[row.original_path, row.original_sha256], [row.signed_path, row.signed_sha256]]) {
    const { data, error } = await client.storage.from("portal-signed").download(filePath);
    assert.ok(!error, `staff can read ${filePath}`);
    assert.equal(await sha256Hex(new Uint8Array(await data.arrayBuffer())), expected);
  }
}
console.log("all 3 records equal the originals; all 6 files match their fingerprints");

const guest = await callFunction({ action: "download", token: bookings[0].token, signatureId: after.portal_signatures.find((row) => row.booking_id === bookings[0].id).id });
assert.equal(guest.status, 200);
const { data: record } = await createClient(url, anonKey, options).rpc("get_portal_record", { p_portal_token: bookings[1].token });
assert.equal(record.signedDocuments.length, 1);
assert.equal(record.checklistItems[0].status, "needsReview");
console.log("guest portal shows the restored signed copy and can download it");

const deleteAll = await client.from("bookings").delete().neq("id", "__never__").select("id");
assert.ok(deleteAll.error, "Full Replace's delete-all is refused while signing records exist");
assert.equal(await countLiveSignatures(client), 3);
assert.equal((await snapshot(client)).bookings.length, before.bookings.length, "no booking was deleted");
const replay = await restoreSignedDocumentsArchive({ bytes: fs.readFileSync(path.join(drillDir, "drill-signed-documents.zip")), JSZip, client, restoreFile });
assert.equal(replay.rows.inserted, 0);
assert.equal(replay.present, 6);
console.log("delete-all refused; restoring again changes nothing");
console.log("\nRestore drill passed.");
