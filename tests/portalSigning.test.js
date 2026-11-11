import test from "node:test";
import assert from "node:assert/strict";
import * as PDFLib from "pdf-lib";

import {
  AGREEMENT_VERSION,
  MAX_ORIGINAL_BYTES,
  buildSignedPdf,
  createSigningService,
  formatSignedAt,
  isPrintableText,
  sha256Hex,
  validateSignInput,
} from "../supabase/functions/portal-sign/signing.js";
import { drawingDataUrl, largeScannedPdf, rotatedLastPage, sampleContract, samplePolicyA4 } from "./fixtures/signingFixtures.js";

/*
  In-memory stand-ins for the database and storage. recordSignature follows
  portal_record_signature in the migration: same-key repeat returns the saved
  row; otherwise the task must still be open and linked to the same document.
  (The real row lock and races are tested against a local Supabase stack in
  supabase/tests/portal-sign.local.mjs.)
*/
const TOKEN_A = "a".repeat(32);
const TOKEN_B = "b".repeat(32);
const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";

async function makeWorld({ enabled = true } = {}) {
  const contract = await sampleContract();
  const world = {
    bookings: [
      { id: "booking-a", portal_token: TOKEN_A, organization_name: "Fictional Fellowship" },
      { id: "booking-b", portal_token: TOKEN_B, organization_name: "Other Fictional Group" },
    ],
    enabled: new Set(enabled ? ["booking-a", "booking-b"] : []),
    items: [
      { id: "item-a", booking_id: "booking-a", item_id: "contract", title: "Sign and return contract", status: "notStarted", guest_action: "upload_file", sign_document_id: DOC_A },
      { id: "item-b", booking_id: "booking-b", item_id: "contract", title: "Sign and return contract", status: "notStarted", guest_action: "upload_file", sign_document_id: DOC_B },
    ],
    documents: [
      { id: DOC_A, booking_id: "booking-a", title: "Sample Agreement", file_name: "sample.pdf", storage_path: `${TOKEN_A}/staff-documents/${DOC_A}/sample.pdf`, uploaded_by_guest: false },
      { id: DOC_B, booking_id: "booking-b", title: "Other Agreement", file_name: "other.pdf", storage_path: `${TOKEN_B}/staff-documents/${DOC_B}/other.pdf`, uploaded_by_guest: false },
    ],
    signatures: [],
    files: new Map(),
    faults: {},
  };
  world.files.set(`portal-uploads/${world.documents[0].storage_path}`, contract);
  world.files.set(`portal-uploads/${world.documents[1].storage_path}`, contract);

  const db = {
    async findBookingByToken(token) {
      return world.bookings.find((booking) => booking.portal_token === token) || null;
    },
    async isSigningEnabled(id) {
      return world.enabled.has(id);
    },
    async findItem(bookingId, key) {
      return world.items.find((item) => item.booking_id === bookingId && item.item_id === key) || null;
    },
    async findDocument(bookingId, id) {
      return world.documents.find((document) => document.booking_id === bookingId && document.id === id) || null;
    },
    async findSignatureByRequestKey(key) {
      return world.signatures.find((row) => row.request_key === key) || null;
    },
    async findSignature(bookingId, id) {
      return world.signatures.find((row) => row.booking_id === bookingId && row.id === id) || null;
    },
    async findSignatureByPath(path) {
      return world.signatures.find((row) => row.original_path === path || row.signed_path === path) || null;
    },
    async recordSignature(p) {
      const race = world.faults.beforeRecord;
      if (race) {
        world.faults.beforeRecord = null;
        await race();
      }
      if (world.faults.recordThrows) throw new Error(world.faults.recordThrows);
      const item = world.items.find((row) => row.id === p.checklist_item_id && row.booking_id === p.booking_id);
      if (!item) throw new Error("TASK_NOT_FOUND");
      const existing = world.signatures.find((row) => row.request_key === p.request_key);
      if (existing) return { status: "existing", signature: existing };
      if (item.sign_document_id !== p.document_id) throw new Error("DOCUMENT_CHANGED");
      if (!["notStarted", "waitingOnGuest"].includes(item.status)) throw new Error("TASK_NOT_OPEN");
      const row = { id: crypto.randomUUID(), ...p };
      world.signatures.push(row);
      item.status = "needsReview";
      if (world.faults.loseResponse) {
        world.faults.loseResponse = false;
        throw new Error("record failed");
      }
      return { status: "created", signature: row };
    },
  };
  const storage = {
    async download(bucket, path) {
      return world.files.get(`${bucket}/${path}`) || null;
    },
    async upload(bucket, path, bytes) {
      if (world.faults.uploadFails) throw new Error("upload failed");
      const key = `${bucket}/${path}`;
      if (world.files.has(key)) throw new Error("exists");
      world.files.set(key, bytes);
    },
    async remove(bucket, paths) {
      paths.forEach((path) => world.files.delete(`${bucket}/${path}`));
    },
    async signedUrl(bucket, path) {
      return `https://files.test/${bucket}/${path}`;
    },
  };
  world.service = createSigningService({ db, storage, PDFLib, now: () => new Date("2026-11-07T19:30:00Z") });
  return world;
}

async function validSign(world, overrides = {}) {
  const opened = await world.service.open({ token: TOKEN_A, itemKey: "contract" });
  return {
    action: "sign",
    itemKey: "contract",
    documentId: opened.document.id,
    documentSha256: opened.document.sha256,
    requestKey: crypto.randomUUID(),
    agreementVersion: AGREEMENT_VERSION,
    agreed: true,
    signerName: "Jordan Fictional",
    signerTitle: "Retreat coordinator",
    organizationName: "Fictional Fellowship",
    signsForOrganization: true,
    authorityConfirmed: true,
    signatureType: "typed",
    ...overrides,
  };
}

const signedFiles = (world) => [...world.files.keys()].filter((key) => key.startsWith("portal-signed/"));

test("open returns the exact document fingerprint and the draft wording", async () => {
  const world = await makeWorld();
  const opened = await world.service.open({ token: TOKEN_A, itemKey: "contract" });
  assert.equal(opened.document.sha256, await sha256Hex(world.files.get(`portal-uploads/${world.documents[0].storage_path}`)));
  assert.equal(opened.agreement.version, AGREEMENT_VERSION);
  assert.match(opened.agreement.text, /sign it electronically/);
});

test("signing stores the original and a signed copy, then moves the task to Needs Review", async () => {
  const world = await makeWorld();
  const result = await world.service.sign({ token: TOKEN_A, input: await validSign(world), clientIp: "203.0.113.5", userAgent: "test" });
  assert.equal(result.repeated, false);
  assert.equal(world.items[0].status, "needsReview");
  const [row] = world.signatures;
  const original = world.files.get(`portal-signed/${row.original_path}`);
  const signed = world.files.get(`portal-signed/${row.signed_path}`);
  assert.equal(await sha256Hex(original), row.original_sha256);
  assert.equal(await sha256Hex(signed), row.signed_sha256);
  assert.notEqual(row.original_sha256, row.signed_sha256);
  assert.equal(row.original_page_count, 4);
  assert.equal((await PDFLib.PDFDocument.load(signed)).getPageCount(), 5);
  assert.equal(row.agreement_version, AGREEMENT_VERSION);
  assert.match(row.authority_text, /on behalf of Fictional Fellowship/);
  assert.equal(row.client_ip, "203.0.113.5");
  assert.ok(!row.original_path.includes(TOKEN_A) && !row.signed_path.includes(TOKEN_A), "no portal token in stored paths");
});

test("one booking's link cannot open, sign or download another booking's documents", async () => {
  const world = await makeWorld();
  const input = await validSign(world, { documentId: DOC_A });
  await world.service.sign({ token: TOKEN_A, input: await validSign(world) });
  const [row] = world.signatures;
  await assert.rejects(world.service.download({ token: TOKEN_B, signatureId: row.id }), { code: "NOT_FOUND" });
  // Booking B's link with booking A's document id: B's own task is linked to B's document.
  await assert.rejects(world.service.sign({ token: TOKEN_B, input }), { code: "DOCUMENT_CHANGED" });
  // A replayed request key from booking A, sent with booking B's link.
  await assert.rejects(world.service.sign({ token: TOKEN_B, input: { ...input, requestKey: row.request_key } }), { code: "NOT_FOUND" });
  await assert.rejects(world.service.open({ token: "x".repeat(32), itemKey: "contract" }), { code: "NOT_FOUND" });
  assert.equal(world.items[1].status, "notStarted");
});

test("signing stays off unless enabled for the booking", async () => {
  const world = await makeWorld({ enabled: false });
  await assert.rejects(world.service.open({ token: TOKEN_A, itemKey: "contract" }), { code: "SIGNING_OFF" });
});

test("a replaced document or changed task link is detected before accepting a signature", async () => {
  const world = await makeWorld();
  const input = await validSign(world);
  // Staff replace the file's bytes after the guest opened it.
  world.files.set(`portal-uploads/${world.documents[0].storage_path}`, await samplePolicyA4());
  await assert.rejects(world.service.sign({ token: TOKEN_A, input }), { code: "DOCUMENT_CHANGED" });
  // Staff link the task to a different document.
  world.files.set(`portal-uploads/${world.documents[0].storage_path}`, await sampleContract());
  const fresh = await validSign(world);
  world.items[0].sign_document_id = DOC_B;
  await assert.rejects(world.service.sign({ token: TOKEN_A, input: fresh }), { code: "DOCUMENT_CHANGED" });
  assert.equal(world.signatures.length, 0);
  assert.equal(signedFiles(world).length, 0);
});

test("inputs are validated on the server", async () => {
  const base = {
    itemKey: "contract",
    documentId: DOC_A,
    documentSha256: "a".repeat(64),
    requestKey: crypto.randomUUID(),
    agreementVersion: AGREEMENT_VERSION,
    agreed: true,
    signerName: "Jordan Fictional",
    signatureType: "typed",
  };
  assert.equal(validateSignInput(base).signerName, "Jordan Fictional");
  assert.throws(() => validateSignInput({ ...base, agreed: "true" }), /agree to sign electronically/);
  assert.throws(() => validateSignInput({ ...base, signerName: " J " }), /full name/);
  assert.throws(() => validateSignInput({ ...base, signerName: "x".repeat(121) }), /too long/);
  assert.throws(() => validateSignInput({ ...base, signsForOrganization: true, organizationName: "Group" }), /authorized/);
  assert.throws(() => validateSignInput({ ...base, signsForOrganization: true, authorityConfirmed: true }), /organization name/);
  assert.throws(() => validateSignInput({ ...base, agreementVersion: "old" }), /wording has changed/);
  assert.throws(() => validateSignInput({ ...base, signatureType: "drawn", drawing: "data:image/jpeg;base64,AAAA" }), /drawn signature/);
  assert.throws(() => validateSignInput({ ...base, signatureType: "drawn", drawing: "data:image/png;base64,AAAAAAAAAAAA" }), /drawn signature/);
  const huge = `data:image/png;base64,${Buffer.alloc(300 * 1024).toString("base64")}`;
  assert.throws(() => validateSignInput({ ...base, signatureType: "drawn", drawing: huge }), /too large/);
  assert.throws(() => validateSignInput({ ...base, signerName: "李小龍" }), /cannot print/);
  assert.equal(validateSignInput({ ...base, signerName: "  Zoë   O’Brien-Núñez " }).signerName, "Zoë O’Brien-Núñez");
  assert.equal(isPrintableText("Ångström — “quoted”"), true);
  assert.equal(isPrintableText("tab\there"), false);
});

test("a retry after a lost response returns the saved signature instead of signing twice", async () => {
  const world = await makeWorld();
  const input = await validSign(world);
  world.faults.loseResponse = true; // the row commits, but the reply is lost
  const first = await world.service.sign({ token: TOKEN_A, input });
  assert.equal(first.repeated, true, "the service looked again and found the saved row");
  const retry = await world.service.sign({ token: TOKEN_A, input });
  assert.equal(retry.repeated, true);
  assert.equal(retry.signature.id, first.signature.id);
  assert.equal(world.signatures.length, 1);
});

test("a different request key cannot add a second signature to the same task", async () => {
  const world = await makeWorld();
  const first = await validSign(world);
  const second = await validSign(world, { signerName: "Someone Else" });
  // Both pass the early checks; the first is saved just before the second reaches the database step.
  world.faults.beforeRecord = () => world.service.sign({ token: TOKEN_A, input: first });
  await assert.rejects(world.service.sign({ token: TOKEN_A, input: second }), { code: "TASK_NOT_OPEN" });
  assert.equal(world.signatures.length, 1);
  assert.equal(world.signatures[0].signer_name, "Jordan Fictional");
  assert.equal(signedFiles(world).length, 2, "the rejected attempt's files are removed");
  // Once the task is in review, a new attempt is refused before any file is written.
  await assert.rejects(world.service.sign({ token: TOKEN_A, input: { ...second, requestKey: crypto.randomUUID() } }), {
    code: "TASK_NOT_OPEN",
  });
});

test("storage and database failures never report success or leave a half-signed task", async () => {
  const world = await makeWorld();
  const input = await validSign(world);

  world.faults.uploadFails = true;
  await assert.rejects(world.service.sign({ token: TOKEN_A, input }), { code: "SAVE_FAILED" });
  assert.equal(world.items[0].status, "notStarted");
  assert.equal(signedFiles(world).length, 0);

  world.faults.uploadFails = false;
  world.faults.recordThrows = "connection reset";
  await assert.rejects(world.service.sign({ token: TOKEN_A, input }), { code: "SAVE_FAILED" });
  assert.equal(world.items[0].status, "notStarted");
  assert.equal(world.signatures.length, 0);
  assert.equal(signedFiles(world).length, 2, "files from an unknown-outcome save are kept, never deleted");

  delete world.faults.recordThrows;
  const retry = await world.service.sign({ token: TOKEN_A, input });
  assert.equal(retry.repeated, false);
  assert.equal(world.items[0].status, "needsReview");
  assert.equal(world.signatures.length, 1);
});

test("earlier signatures are kept when the task is reopened and signed again", async () => {
  const world = await makeWorld();
  await world.service.sign({ token: TOKEN_A, input: await validSign(world) });
  world.items[0].status = "waitingOnGuest"; // staff: Send back for changes
  await world.service.sign({ token: TOKEN_A, input: await validSign(world, { signerName: "Second Signer" }) });
  assert.equal(world.signatures.length, 2);
  for (const row of world.signatures) {
    assert.ok(world.files.get(`portal-signed/${row.signed_path}`), "each signed copy is still stored");
  }
});

test("downloads only work for this booking's signature ids", async () => {
  const world = await makeWorld();
  const { signature } = await world.service.sign({ token: TOKEN_A, input: await validSign(world) });
  const { downloadUrl } = await world.service.download({ token: TOKEN_A, signatureId: signature.id });
  assert.match(downloadUrl, /^https:\/\/files\.test\/portal-signed\/signatures\//);
  await assert.rejects(world.service.download({ token: TOKEN_A, signatureId: "not-a-uuid" }), { code: "NOT_FOUND" });
});

test("restore puts back only files whose fingerprint matches the record, without overwriting", async () => {
  const world = await makeWorld();
  await world.service.sign({ token: TOKEN_A, input: await validSign(world) });
  const [row] = world.signatures;
  const signed = world.files.get(`portal-signed/${row.signed_path}`);
  assert.deepEqual(await world.service.restoreFile({ path: row.signed_path, bytes: signed }), { status: "present" });
  world.files.delete(`portal-signed/${row.signed_path}`);
  await assert.rejects(world.service.restoreFile({ path: row.signed_path, bytes: new Uint8Array([1, 2, 3]) }), { code: "FINGERPRINT_MISMATCH" });
  assert.deepEqual(await world.service.restoreFile({ path: row.signed_path, bytes: signed }), { status: "restored" });
  await assert.rejects(world.service.restoreFile({ path: "../etc/passwd", bytes: signed }), { code: "NOT_FOUND" });
});

test("signature pages handle typed and drawn signatures, long entries, A4, rotation and big files", async () => {
  const details = {
    documentTitle: "Sample Agreement - not a real contract",
    documentFileName: "sample.pdf",
    signerName: "Maximiliana Alessandra Bartholomew-Featherstonehaugh Vanderbilt-Montgomery de la Cruz",
    signerTitle: "Director of Retreat Planning, Spiritual Formation and Youth Ministries",
    organizationName:
      "The First Fictional Congregational Church of the Greater Monadnock Region Youth and Family Ministry Partnership Association",
    signsForOrganization: true,
    signatureType: "typed",
    signedAt: new Date("2026-11-07T19:30:00Z"),
    agreementText: "I agree.",
    authorityText: "I am authorized to sign this document on behalf of the fictional organization.",
    agreementVersion: AGREEMENT_VERSION,
    bookingName: "Fictional Fellowship",
    itemTitle: "Sign and return contract",
    recordKey: crypto.randomUUID(),
    originalSha256: "f".repeat(64),
  };
  for (const original of [await sampleContract(), await samplePolicyA4(), await rotatedLastPage()]) {
    const { bytes, originalPageCount } = await buildSignedPdf({ PDFLib, originalBytes: original, details });
    const loaded = await PDFLib.PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), originalPageCount + 1);
  }
  const drawn = await buildSignedPdf({
    PDFLib,
    originalBytes: await sampleContract(),
    details: { ...details, signatureType: "drawn", drawing: Buffer.from(drawingDataUrl().split(",")[1], "base64") },
  });
  assert.equal((await PDFLib.PDFDocument.load(drawn.bytes)).getPageCount(), 5);

  const large = await largeScannedPdf();
  assert.ok(large.length < MAX_ORIGINAL_BYTES);
  const started = Date.now();
  const big = await buildSignedPdf({ PDFLib, originalBytes: large, details });
  assert.equal(big.originalPageCount, 12);
  assert.ok(big.bytes.length >= large.length);
  console.log(`  large PDF (${(large.length / 1048576).toFixed(1)} MB) signed in Node in ${Date.now() - started} ms`);
});

test("the printed date contains only characters the PDF fonts can print", () => {
  const text = formatSignedAt(new Date("2026-11-07T19:30:12Z"));
  assert.equal(isPrintableText(text), true);
  assert.match(text, /2026-11-07 19:30:12 UTC/);
});

test("document titles with characters the fonts cannot print still produce a signed copy", async () => {
  const { bytes } = await buildSignedPdf({
    PDFLib,
    originalBytes: await sampleContract(),
    details: {
      documentTitle: "Agreement 合同 (fictional)",
      documentFileName: "agreement.pdf",
      signerName: "Jordan Fictional",
      signatureType: "typed",
      signedAt: new Date(),
      agreementText: "I agree.",
      agreementVersion: AGREEMENT_VERSION,
      bookingName: "Fictional",
      itemTitle: "Sign",
      recordKey: crypto.randomUUID(),
      originalSha256: "0".repeat(64),
    },
  });
  assert.ok(bytes.length > 0);
});

test("files that are not readable PDFs are refused with a paper-upload message", async () => {
  await assert.rejects(
    buildSignedPdf({ PDFLib, originalBytes: new TextEncoder().encode("%PDF-1.7 broken"), details: {} }),
    { code: "DOCUMENT_UNREADABLE" }
  );
});

test("a hosting record's portal link cannot open, sign or download, even if it still resolved", async () => {
  const world = await makeWorld();
  const input = await validSign(world); // prepared while it was still a booking
  world.bookings[0].retreat_type = "Hosting";
  await assert.rejects(world.service.open({ token: TOKEN_A, itemKey: "contract" }), { code: "NOT_FOUND" });
  await assert.rejects(world.service.sign({ token: TOKEN_A, input }), { code: "NOT_FOUND" });
  world.bookings[0].retreat_type = "";
  world.bookings[0].organization_name = "Host: Fictional Fellowship";
  await assert.rejects(world.service.open({ token: TOKEN_A, itemKey: "contract" }), { code: "NOT_FOUND" });
  assert.equal(signedFiles(world).length, 0);
});
