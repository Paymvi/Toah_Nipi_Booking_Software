// End-to-end checks of online signing against a LOCAL Supabase stack (Docker):
// the real migration, row-level security, storage policies and the portal-sign
// function running in the Supabase Edge runtime. FICTIONAL DATA ONLY.
//
// Setup and run: docs/portal-signing/SETUP.md ("Local test stack").
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//     node supabase/tests/portal-sign.local.mjs
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

import { AGREEMENT_VERSION, sha256Hex } from "../functions/portal-sign/signing.js";
import { drawingDataUrl, largeScannedPdf, manyPages, sampleContract, samplePolicyA4 } from "../../tests/fixtures/signingFixtures.js";

const url = process.env.LOCAL_SUPABASE_URL || "";
const anonKey = process.env.LOCAL_ANON_KEY || "";
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !anonKey || !serviceKey) {
  console.error("Set LOCAL_SUPABASE_URL (http://127.0.0.1:<port>), LOCAL_ANON_KEY and LOCAL_SERVICE_ROLE_KEY for the LOCAL stack.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anon = createClient(url, anonKey, options);
const run = Date.now().toString(36);
const results = [];

async function check(name, body) {
  const started = Date.now();
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}\n     ${error?.stack?.split("\n").slice(0, 3).join("\n     ") || error}`);
  }
}

async function callFunction(body) {
  const response = await fetch(`${url}/functions/v1/portal-sign`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", "user-agent": "portal-sign local test" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const token = () => crypto.randomUUID().replaceAll("-", "");

// Inside Docker the function signs links with the stack's internal host; hosted Supabase uses the project URL.
const reachable = (link) => {
  const parsed = new URL(link);
  return `${url}${parsed.pathname}${parsed.search}`;
};

/* ---------- Fictional data ---------- */

async function makeStaff(role) {
  const email = `staff-${role}-${run}@example.test`;
  const password = `pw-${run}-${role}-Local1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const { error: profileError } = await admin
    .from("staff_profiles")
    .insert({ user_id: data.user.id, email, full_name: `Fictional ${role}`, role, is_active: true });
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return client;
}

async function makeBooking(label, { enabled = true, pdf } = {}) {
  const id = `local-test-${run}-${label}`;
  const portalToken = token();
  let { error } = await admin.from("bookings").insert({
    id,
    portal_token: portalToken,
    organization_name: `Fictional ${label} Fellowship`,
    contact_name: "Fictional Contact",
    status: "Confirmed",
  });
  if (error) throw error;
  const document = await addDocument(id, portalToken, pdf || (await sampleContract()), "Sample Agreement (fictional)");
  const { data: item, error: itemError } = await admin
    .from("portal_checklist_items")
    .insert({
      booking_id: id,
      item_id: "contract",
      title: "Sign and return contract",
      status: "notStarted",
      required: true,
      guest_action: "upload_file",
      sort_order: 1,
      sign_document_id: document.id,
    })
    .select("id")
    .single();
  if (itemError) throw itemError;
  if (enabled) await allowBooking(id);
  return { id, portalToken, document, itemId: item.id };
}

async function addDocument(bookingId, portalToken, bytes, title) {
  const { data: document, error } = await admin
    .from("portal_documents")
    .insert({ booking_id: bookingId, title, document_type: "Staff Document", file_name: "sample-agreement.pdf", status: "ready", uploaded_by_guest: false })
    .select("id")
    .single();
  if (error) throw error;
  const path = `${portalToken}/staff-documents/${document.id}/sample-agreement.pdf`;
  const upload = await admin.storage.from("portal-uploads").upload(path, bytes, { contentType: "application/pdf" });
  if (upload.error) throw upload.error;
  await admin.from("portal_documents").update({ storage_path: path }).eq("id", document.id);
  return { id: document.id, path };
}

async function allowBooking(id) {
  const { data } = await admin.from("portal_signing_settings").select("test_booking_ids").eq("id", true).single();
  await admin.from("portal_signing_settings").update({ test_booking_ids: [...data.test_booking_ids, id] }).eq("id", true);
}

function signBody(booking, opened, overrides = {}) {
  return {
    action: "sign",
    token: booking.portalToken,
    itemKey: "contract",
    documentId: opened.document.id,
    documentSha256: opened.document.sha256,
    requestKey: crypto.randomUUID(),
    agreementVersion: AGREEMENT_VERSION,
    agreed: true,
    signerName: "Jordan Fictional",
    signerTitle: "Coordinator",
    organizationName: "Fictional Fellowship",
    signsForOrganization: true,
    authorityConfirmed: true,
    signatureType: "typed",
    ...overrides,
  };
}

async function openTask(booking) {
  const result = await callFunction({ action: "open", token: booking.portalToken, itemKey: "contract" });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function itemStatus(booking) {
  const { data } = await admin.from("portal_checklist_items").select("status").eq("id", booking.itemId).single();
  return data.status;
}

async function signatureRows(booking) {
  const { data } = await admin.from("portal_signatures").select("*").eq("booking_id", booking.id).order("signed_at");
  return data;
}

async function signedFileCount() {
  const { data: keys } = await admin.storage.from("portal-signed").list("signatures", { limit: 1000 });
  let count = 0;
  for (const key of keys || []) {
    const { data: attempts } = await admin.storage.from("portal-signed").list(`signatures/${key.name}`);
    for (const attempt of attempts || []) {
      const { data: files } = await admin.storage.from("portal-signed").list(`signatures/${key.name}/${attempt.name}`);
      count += files?.length || 0;
    }
  }
  return count;
}

async function paperUpload(booking) {
  const path = `${booking.portalToken}/contract/${crypto.randomUUID()}-signed-scan.pdf`;
  const bytes = await sampleContract();
  const upload = await anon.storage.from("portal-uploads").upload(path, bytes, { contentType: "application/pdf" });
  if (upload.error) return { ok: false, stage: "storage", error: upload.error.message };
  const { error } = await anon.rpc("portal_submit_checklist_upload", {
    p_portal_token: booking.portalToken,
    p_item_id: "contract",
    p_file_name: "signed-scan.pdf",
    p_storage_path: path,
    p_mime_type: "application/pdf",
    p_file_size: bytes.length,
  });
  if (error) {
    await anon.storage.from("portal-uploads").remove([path]);
    return { ok: false, stage: "rpc", error: error.message };
  }
  return { ok: true };
}

/* ---------- Checks ---------- */

const staffAdmin = await makeStaff("admin");
const staffViewer = await makeStaff("viewer");

await check("Edge runtime: sample contract, typed and drawn signatures", async () => {
  const booking = await makeBooking("contract");
  const opened = await openTask(booking);
  const started = Date.now();
  const signed = await callFunction(signBody(booking, opened, { signatureType: "drawn", drawing: drawingDataUrl() }));
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  console.log(`     sign took ${Date.now() - started} ms`);
  assert.equal(await itemStatus(booking), "needsReview");
  const [row] = await signatureRows(booking);
  assert.equal(row.signature_type, "drawn");
  assert.equal(row.client_ip !== undefined, true);
  const file = await fetch(reachable(signed.body.downloadUrl));
  assert.equal(file.status, 200);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.equal(await sha256Hex(bytes), row.signed_sha256);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 5);
});

for (const [label, make] of [
  ["9.3 MB scanned-style PDF", () => largeScannedPdf()],
  ["400-page PDF", () => manyPages(400)],
  ["A4 form", () => samplePolicyA4()],
]) {
  await check(`Edge runtime: ${label} stays inside the CPU limit`, async () => {
    const pdf = await make();
    const booking = await makeBooking(label.replace(/\W+/g, "-"), { pdf });
    const opened = await openTask(booking);
    const started = Date.now();
    const signed = await callFunction(signBody(booking, opened));
    assert.equal(signed.status, 200, JSON.stringify(signed.body));
    console.log(`     ${(pdf.length / 1048576).toFixed(1)} MB: open+sign round trip ${Date.now() - started} ms (wall clock)`);
    const [row] = await signatureRows(booking);
    assert.equal(row.original_sha256, await sha256Hex(pdf));
  });
}

await check("signing is off for bookings not enabled or listed", async () => {
  const booking = await makeBooking("off", { enabled: false });
  const result = await callFunction({ action: "open", token: booking.portalToken, itemKey: "contract" });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "SIGNING_OFF");
  const { data } = await anon.rpc("get_portal_record", { p_portal_token: booking.portalToken });
  assert.equal(data.checklistItems[0].signDocumentId, null);
});

await check("cross-booking access is refused", async () => {
  const a = await makeBooking("cross-a");
  const b = await makeBooking("cross-b");
  const openedA = await openTask(a);
  const signedA = await callFunction(signBody(a, openedA));
  assert.equal(signedA.status, 200);
  const download = await callFunction({ action: "download", token: b.portalToken, signatureId: signedA.body.signature.id });
  assert.equal(download.status, 404);
  const replay = await callFunction(signBody(b, openedA, { requestKey: (await signatureRows(a))[0].request_key }));
  assert.equal(replay.status, 404);
  const wrongDoc = await callFunction(signBody(b, openedA));
  assert.equal(wrongDoc.status, 409);
  assert.equal(await itemStatus(b), "notStarted");
  const { data } = await anon.rpc("get_portal_record", { p_portal_token: b.portalToken });
  assert.equal(data.signedDocuments.length, 0);
});

await check("guests and staff cannot write signing records or files directly", async () => {
  const booking = await makeBooking("writes");
  await callFunction(signBody(booking, await openTask(booking)));
  const [row] = await signatureRows(booking);
  const fake = { ...row, id: crypto.randomUUID(), request_key: crypto.randomUUID() };

  for (const [who, client] of [["anon", anon], ["staff admin", staffAdmin], ["staff viewer", staffViewer]]) {
    const insert = await client.from("portal_signatures").insert(fake);
    assert.ok(insert.error, `${who} insert must fail`);
    const update = await client.from("portal_signatures").update({ signer_name: "Changed" }).eq("id", row.id).select("id");
    assert.ok(update.error || update.data.length === 0, `${who} update must change nothing`);
    const remove = await client.from("portal_signatures").delete().eq("id", row.id).select("id");
    assert.ok(remove.error || remove.data.length === 0, `${who} delete must change nothing`);
    const rpc = await client.rpc("portal_record_signature", { p: fake });
    assert.ok(rpc.error, `${who} cannot call the recording function`);
    const upload = await client.storage.from("portal-signed").upload(`signatures/${crypto.randomUUID()}/x/signed.pdf`, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf" });
    assert.ok(upload.error, `${who} cannot upload signed files`);
    const overwrite = await client.storage.from("portal-signed").upload(row.signed_path, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf", upsert: true });
    assert.ok(overwrite.error, `${who} cannot overwrite a signed file`);
    await client.storage.from("portal-signed").remove([row.signed_path, row.original_path]);
    const statusChange = await client.from("portal_checklist_items").update({ status: "completed" }).eq("id", booking.itemId).select("id");
    if (who === "anon") assert.ok(statusChange.error || statusChange.data.length === 0, "anon cannot change a task");
  }
  // Even the service role cannot edit a signature row.
  const serviceUpdate = await admin.from("portal_signatures").update({ signer_name: "Changed" }).eq("id", row.id);
  assert.ok(serviceUpdate.error, "the database itself refuses edits");
  const stillThere = await admin.storage.from("portal-signed").download(row.signed_path);
  assert.equal(await sha256Hex(new Uint8Array(await stillThere.data.arrayBuffer())), row.signed_sha256);
  const anonRead = await anon.storage.from("portal-signed").createSignedUrl(row.signed_path, 60);
  assert.ok(anonRead.error, "guests cannot read the bucket directly");
  const staffRead = await staffViewer.storage.from("portal-signed").createSignedUrl(row.signed_path, 60);
  assert.ok(staffRead.data?.signedUrl, "staff can open signed copies");
  const deleteBooking = await staffAdmin.from("bookings").delete().eq("id", booking.id).select("id");
  assert.ok(deleteBooking.error, "a booking with signatures cannot be deleted");
});

await check("a document replaced during signing is detected", async () => {
  const booking = await makeBooking("replace");
  const opened = await openTask(booking);
  // Staff upload a replacement and link the task to it.
  const replacement = await addDocument(booking.id, booking.portalToken, await samplePolicyA4(), "Replacement (fictional)");
  await staffAdmin.from("portal_checklist_items").update({ sign_document_id: replacement.id }).eq("id", booking.itemId);
  const stale = await callFunction(signBody(booking, opened));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "DOCUMENT_CHANGED");
  // Same document row, file bytes swapped underneath.
  const reopened = await openTask(booking);
  await admin.storage.from("portal-uploads").upload(replacement.path, await sampleContract(), { upsert: true, contentType: "application/pdf" });
  const swapped = await callFunction(signBody(booking, reopened));
  assert.equal(swapped.status, 409);
  assert.equal(await itemStatus(booking), "notStarted");
  assert.equal((await signatureRows(booking)).length, 0);
});

await check("simultaneous submissions with different request keys record one signature", async () => {
  const booking = await makeBooking("concurrent");
  const opened = await openTask(booking);
  const filesBefore = await signedFileCount();
  const responses = await Promise.all(
    Array.from({ length: 6 }, (_, index) => callFunction(signBody(booking, opened, { signerName: `Signer ${index}` })))
  );
  const ok = responses.filter((response) => response.status === 200);
  assert.equal(ok.length, 1, JSON.stringify(responses.map((response) => response.status)));
  assert.ok(responses.filter((response) => response.status !== 200).every((response) => response.body.code === "TASK_NOT_OPEN"));
  assert.equal((await signatureRows(booking)).length, 1);
  assert.equal((await signedFileCount()) - filesBefore, 2, "losing attempts removed their files");
});

await check("simultaneous submissions with the same request key return the same saved signature", async () => {
  const booking = await makeBooking("same-key");
  const body = signBody(booking, await openTask(booking));
  const responses = await Promise.all([callFunction(body), callFunction(body), callFunction(body)]);
  assert.ok(responses.every((response) => response.status === 200), JSON.stringify(responses.map((r) => r.body)));
  assert.equal(new Set(responses.map((response) => response.body.signature.id)).size, 1);
  assert.equal((await signatureRows(booking)).length, 1);
  // A later retry of the same request (lost response) also returns it.
  const retry = await callFunction(body);
  assert.equal(retry.body.repeated, true);
});

await check("a paper upload racing an online signature never completes both", async () => {
  let paperWins = 0;
  let signWins = 0;
  // Staggered starts so the paper upload lands before, during and after the signature's file writes.
  const delays = [0, 40, 80, 120, 160, 200, 260, 320, 400, 600];
  for (const [round, delay] of delays.entries()) {
    const booking = await makeBooking(`race-${round}`);
    const opened = await openTask(booking);
    const [signed, paper] = await Promise.all([
      callFunction(signBody(booking, opened)),
      new Promise((resolve) => setTimeout(resolve, delay)).then(() => paperUpload(booking)),
    ]);
    const rows = await signatureRows(booking);
    const { data: item } = await admin.from("portal_checklist_items").select("status, uploaded_file_path").eq("id", booking.itemId).single();
    assert.equal(item.status, "needsReview");
    assert.ok((signed.status === 200) !== paper.ok, `exactly one wins (sign ${signed.status}, paper ${paper.ok})`);
    if (paper.ok) {
      paperWins += 1;
      assert.equal(rows.length, 0);
      assert.ok(item.uploaded_file_path);
    } else {
      signWins += 1;
      assert.equal(rows.length, 1);
      assert.equal(item.uploaded_file_path, null);
    }
  }
  console.log(`     online won ${signWins}, paper won ${paperWins}`);
});

await check("earlier signatures are kept through changes, replacement and task removal", async () => {
  const booking = await makeBooking("history");
  await callFunction(signBody(booking, await openTask(booking)));
  // Staff: Send back for changes, then replace the document.
  const sentBack = await staffAdmin.from("portal_checklist_items").update({ status: "waitingOnGuest" }).eq("id", booking.itemId).eq("status", "needsReview").select("id");
  assert.equal(sentBack.data.length, 1);
  const replacement = await addDocument(booking.id, booking.portalToken, await samplePolicyA4(), "Revised agreement (fictional)");
  await staffAdmin.from("portal_checklist_items").update({ sign_document_id: replacement.id }).eq("id", booking.itemId);
  const second = await callFunction(signBody(booking, await openTask(booking), { signerName: "Second Fictional Signer" }));
  assert.equal(second.status, 200);
  // Staff remove the task entirely.
  const removed = await staffAdmin.from("portal_checklist_items").delete().eq("id", booking.itemId).select("id");
  assert.equal(removed.data.length, 1);
  const rows = await signatureRows(booking);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].original_sha256, rows[1].original_sha256);
  for (const row of rows) {
    const { data } = await staffViewer.storage.from("portal-signed").download(row.signed_path);
    assert.equal(await sha256Hex(new Uint8Array(await data.arrayBuffer())), row.signed_sha256);
  }
  const { data: record } = await anon.rpc("get_portal_record", { p_portal_token: booking.portalToken });
  assert.equal(record.signedDocuments.length, 2, "the guest still sees both signed copies");
  const { data: bookingRow } = await admin.from("bookings").select("status").eq("id", booking.id).single();
  assert.equal(bookingRow.status, "Confirmed", "booking status is not changed by signing");
});

await check("downloads work for the booking's own copies only, with short-lived links", async () => {
  const booking = await makeBooking("download");
  const signed = await callFunction(signBody(booking, await openTask(booking)));
  const download = await callFunction({ action: "download", token: booking.portalToken, signatureId: signed.body.signature.id });
  assert.equal(download.status, 200);
  const link = new URL(download.body.downloadUrl);
  const jwt = link.searchParams.get("token");
  const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  assert.ok(claims.exp - claims.iat <= 600, "link lasts at most 10 minutes");
  const file = await fetch(reachable(download.body.downloadUrl));
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.match(file.headers.get("content-disposition") || "", /signed\.pdf/);
  const bad = await callFunction({ action: "download", token: booking.portalToken, signatureId: crypto.randomUUID() });
  assert.equal(bad.status, 404);
});

await check("existing paper upload tasks keep working unchanged", async () => {
  const booking = await makeBooking("paper-only");
  await admin.from("portal_checklist_items").update({ sign_document_id: null }).eq("id", booking.itemId);
  const notSignable = await callFunction({ action: "open", token: booking.portalToken, itemKey: "contract" });
  assert.equal(notSignable.status, 409);
  const paper = await paperUpload(booking);
  assert.ok(paper.ok, JSON.stringify(paper));
  assert.equal(await itemStatus(booking), "needsReview");
  const { data } = await anon.rpc("get_portal_record", { p_portal_token: booking.portalToken });
  assert.equal(data.checklistItems[0].uploadedFileName, "signed-scan.pdf");
  assert.equal(data.checklistItems[0].signature, null);
});

await check("bad input never reaches the database", async () => {
  const booking = await makeBooking("bad-input");
  const opened = await openTask(booking);
  for (const overrides of [
    { agreed: false },
    { signsForOrganization: true, authorityConfirmed: false },
    { signerName: "x" },
    { signatureType: "drawn", drawing: "data:image/png;base64,AAAA" },
    { agreementVersion: "something-else" },
    { documentSha256: "0".repeat(64) },
  ]) {
    const result = await callFunction(signBody(booking, opened, overrides));
    assert.ok(result.status >= 400 && result.status < 500, JSON.stringify(overrides));
  }
  const tooBig = await callFunction(signBody(booking, opened, { signatureType: "drawn", drawing: `data:image/png;base64,${"A".repeat(500000)}` }));
  assert.equal(tooBig.status, 413);
  assert.equal(await itemStatus(booking), "notStarted");
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
