/*
  portal-sign core (plain JavaScript, shared by the Deno function and the
  Node tests). See docs/portal-signing/SETUP.md.

  Every guest action starts from the portal token and re-derives the booking,
  task and document on the server. Nothing the browser sends is trusted
  except as the signer's own entries and the fingerprint of the file it was
  shown, which must match the file the server reads now.

  Dependencies are passed in:
    db       booking / task / document lookups and the record RPC
    storage  download / upload / remove / signedUrl
    PDFLib   the pdf-lib module
    now      () => Date (tests control the clock)

  Never log or return portal tokens, file contents or signer entries.
*/

import { isHostRecord } from "../../../src/utils/bookingClassification.js";

export const ORIGINALS_BUCKET = "portal-uploads";
export const SIGNED_BUCKET = "portal-signed";
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const MAX_DRAWING_BYTES = 200 * 1024;
export const MAX_REQUEST_BYTES = 400 * 1024;
export const URL_SECONDS = 10 * 60;

// DRAFT wording: not approved by Toah Nipi's lawyer (plan, Q-3). Changing it
// means a new version label; every record keeps the exact text it was signed with.
export const AGREEMENT_VERSION = "draft-2026-11-07";
export const AGREEMENT_TEXT =
  "I have reviewed this document. I agree to sign it electronically, and I intend the typed or drawn signature I provide to be my signature on this document, with the same effect as a handwritten signature.";
export function authorityText(organization) {
  return `I am authorized to sign this document on behalf of ${organization}.`;
}

export class SigningError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = {
  NOT_FOUND: "This portal link or task could not be found.",
  SIGNING_OFF: "Online signing is not available for this booking yet. You can still print, sign and upload the document.",
  NOT_SIGNABLE: "This task is not set up for online signing.",
  TASK_NOT_OPEN: "This task has already been signed or submitted. Refresh the page to see its status.",
  DOCUMENT_CHANGED: "This document was changed or replaced by Toah Nipi staff after you opened it. Please review it again before signing.",
  DOCUMENT_UNREADABLE: "This document cannot be signed online. Please print, sign and upload it instead, or contact Toah Nipi staff.",
};

function fail(code, status, message = MESSAGES[code]) {
  throw new SigningError(code, message, status);
}

/* ---------- Input validation ---------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

// Characters the PDF's standard fonts can print (Windows-1252).
const CP1252_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("")
);
export function isPrintableText(text) {
  for (const character of text) {
    const code = character.codePointAt(0);
    const ok =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CP1252_EXTRAS.has(character);
    if (!ok) return false;
  }
  return true;
}

export function cleanText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function checkText(value, label, { min = 0, max }) {
  const text = cleanText(value);
  if (text.length < min) fail("INVALID", 400, `Please enter ${label}.`);
  if (text.length > max) fail("INVALID", 400, `${label[0].toUpperCase()}${label.slice(1)} is too long (${max} characters at most).`);
  if (!isPrintableText(text)) {
    fail(
      "INVALID",
      400,
      `${label[0].toUpperCase()}${label.slice(1)} contains characters the signed PDF cannot print yet. Please use Latin letters, or contact Toah Nipi staff.`
    );
  }
  return text;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodeDrawing(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) fail("INVALID", 400, "The drawn signature could not be read. Please draw it again or type your name.");
  const binary = atob(match[1]);
  if (binary.length > MAX_DRAWING_BYTES) fail("INVALID", 400, "The drawn signature is too large. Please clear it and draw again.");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    fail("INVALID", 400, "The drawn signature could not be read. Please draw it again or type your name.");
  }
  return bytes;
}

export function validateSignInput(input) {
  const itemKey = cleanText(input?.itemKey);
  if (!itemKey || itemKey.length > 100) fail("INVALID", 400, "The task is missing.");
  if (!UUID.test(String(input?.documentId || ""))) fail("INVALID", 400, "The document is missing.");
  if (!UUID.test(String(input?.requestKey || ""))) fail("INVALID", 400, "Please reload the page and try again.");
  if (!SHA256.test(String(input?.documentSha256 || ""))) fail("INVALID", 400, "Please open the document again before signing.");
  if (input?.agreementVersion !== AGREEMENT_VERSION) {
    fail("INVALID", 409, "The signing wording has changed. Please reload the page and review it again.");
  }
  if (input?.agreed !== true) fail("INVALID", 400, "Please confirm that you agree to sign electronically.");

  const signerName = checkText(input?.signerName, "your full name", { min: 2, max: 120 });
  const signerTitle = checkText(input?.signerTitle, "your title or role", { max: 120 });
  const signsForOrganization = input?.signsForOrganization === true;
  const organizationName = checkText(input?.organizationName, "the organization name", {
    min: signsForOrganization ? 2 : 0,
    max: 200,
  });
  if (signsForOrganization && input?.authorityConfirmed !== true) {
    fail("INVALID", 400, "Please confirm that you are authorized to sign for your organization.");
  }

  const signatureType = input?.signatureType;
  if (signatureType !== "typed" && signatureType !== "drawn") fail("INVALID", 400, "Choose a typed or drawn signature.");
  const drawing = signatureType === "drawn" ? decodeDrawing(input?.drawing) : null;

  return {
    itemKey,
    documentId: String(input.documentId).toLowerCase(),
    requestKey: String(input.requestKey).toLowerCase(),
    documentSha256: String(input.documentSha256),
    signerName,
    signerTitle,
    organizationName: signsForOrganization ? organizationName : organizationName || "",
    signsForOrganization,
    signatureType,
    drawing,
  };
}

/* ---------- Fingerprints ---------- */

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isPdf(bytes) {
  return bytes?.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

/* ---------- The signed PDF ---------- */

export function formatSignedAt(date) {
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "long",
    timeStyle: "long",
  }).format(date);
  // Newer ICU versions (Deno) put narrow no-break spaces before "PM"; the PDF fonts cannot print them.
  return `${local.replace(/[\u00a0\u2007\u2009\u202f]/g, " ")} (${date.toISOString().slice(0, 19).replace("T", " ")} UTC)`;
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the line (a long fingerprint or name) is split by characters.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/*
  Appends one signature page (more only if a very small page size forces it)
  to the exact original bytes. The original pages are copied unchanged.
*/
export async function buildSignedPdf({ PDFLib, originalBytes, details }) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  let pdf;
  let originalPageCount;
  let lastPage;
  try {
    // Encrypted or damaged files throw here or while reading their pages.
    pdf = await PDFDocument.load(originalBytes, { updateMetadata: false });
    originalPageCount = pdf.getPageCount();
    lastPage = pdf.getPage(originalPageCount - 1);
  } catch {
    fail("DOCUMENT_UNREADABLE", 422);
  }
  if (!(originalPageCount >= 1)) fail("DOCUMENT_UNREADABLE", 422);

  let { width, height } = lastPage.getSize();
  const rotation = ((lastPage.getRotation().angle % 360) + 360) % 360;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  // Very small or odd page boxes would make an unreadable signature page.
  if (width < 400 || height < 500) [width, height] = [612, 792];

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ink = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.38, 0.38, 0.45);
  const rule = rgb(0.75, 0.75, 0.8);

  const margin = Math.min(54, width * 0.08);
  const contentWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const ensureSpace = (needed) => {
    if (y - needed < margin) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }
  };
  const write = (text, { font = regular, size = 10.5, color = ink, gap = 4, indent = 0 } = {}) => {
    // Signer entries are already checked; this only guards fixed text (titles, file names) from other sources.
    const printable = Array.from(String(text), (character) => (isPrintableText(character) ? character : "?")).join("");
    for (const line of wrapText(printable, font, size, contentWidth - indent)) {
      ensureSpace(size + gap);
      y -= size;
      page.drawText(line, { x: margin + indent, y, size, font, color });
      y -= gap;
    }
  };
  const space = (amount) => {
    y -= amount;
  };
  const field = (label, value) => {
    if (!value) return;
    ensureSpace(30);
    write(label, { font: bold, size: 8.5, color: muted, gap: 2 });
    write(value, { size: 11, gap: 6 });
  };

  write("Electronic signature page", { font: bold, size: 17, gap: 6 });
  write(
    `This page records an electronic signature for "${details.documentTitle}" (file ${details.documentFileName}), ` +
      `the ${originalPageCount}-page document before this page. It was signed through the Toah Nipi guest portal.`,
    { size: 10, color: muted, gap: 3 }
  );
  space(14);

  // Signature box
  const boxHeight = 96;
  ensureSpace(boxHeight + 30);
  const boxTop = y;
  page.drawRectangle({
    x: margin,
    y: boxTop - boxHeight,
    width: contentWidth,
    height: boxHeight,
    borderColor: rule,
    borderWidth: 1,
  });
  if (details.signatureType === "drawn" && details.drawing) {
    const image = await pdf.embedPng(details.drawing);
    const scale = Math.min((contentWidth - 24) / image.width, (boxHeight - 20) / image.height, 1);
    page.drawImage(image, {
      x: margin + 12,
      y: boxTop - boxHeight + (boxHeight - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale,
    });
  } else {
    let size = 30;
    while (size > 12 && script.widthOfTextAtSize(details.signerName, size) > contentWidth - 24) size -= 1;
    const lines = wrapText(details.signerName, script, size, contentWidth - 24).slice(0, 2);
    let lineY = boxTop - boxHeight / 2 + (lines.length === 1 ? -size / 3 : size / 2);
    for (const line of lines) {
      page.drawText(line, { x: margin + 12, y: lineY, size, font: script, color: ink });
      lineY -= size + 4;
    }
  }
  y = boxTop - boxHeight - 4;
  write(details.signatureType === "drawn" ? "Signature (drawn by the signer)" : "Signature (typed by the signer)", {
    size: 8.5,
    color: muted,
  });
  space(12);

  field("Signed by", details.signerName);
  field("Title or role", details.signerTitle);
  field(details.signsForOrganization ? "Signing on behalf of" : "Organization", details.organizationName);
  field("Date and time signed", formatSignedAt(details.signedAt));
  space(6);

  ensureSpace(40);
  write("The signer confirmed:", { font: bold, size: 8.5, color: muted, gap: 3 });
  write(`"${details.agreementText}"`, { size: 10, gap: 3 });
  if (details.authorityText) write(`"${details.authorityText}"`, { size: 10, gap: 3 });
  space(10);

  ensureSpace(60);
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + contentWidth, y },
    thickness: 0.5,
    color: rule,
  });
  space(12);
  write("Record details", { font: bold, size: 8.5, color: muted, gap: 3 });
  write(`Booking: ${details.bookingName}`, { size: 9, color: muted, gap: 2 });
  write(`Portal task: ${details.itemTitle}`, { size: 9, color: muted, gap: 2 });
  write(`Signing reference: ${details.recordKey}`, { size: 9, color: muted, gap: 2 });
  write(`Wording version: ${details.agreementVersion}`, { size: 9, color: muted, gap: 6 });
  write("SHA-256 fingerprint of the original document (pages before this page):", { size: 9, color: muted, gap: 2 });
  write(details.originalSha256, { font: mono, size: 8.5, color: ink, gap: 2 });

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, originalPageCount };
}

/* ---------- Service ---------- */

function storagePathFor(requestKey, attemptId, name) {
  return `signatures/${requestKey}/${attemptId}/${name}`;
}

function publicSignature(row) {
  return {
    id: row.id,
    signedAt: row.signed_at,
    signerName: row.signer_name,
    documentTitle: row.document_title,
    itemTitle: row.item_title,
  };
}

function safeFileName(title) {
  const base = String(title || "document")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "document"} - signed.pdf`;
}

export function createSigningService({ db, storage, PDFLib, now = () => new Date(), randomId = () => crypto.randomUUID() }) {
  async function requireBooking(token) {
    const cleaned = String(token || "").trim();
    if (cleaned.length < 20 || cleaned.length > 200) fail("NOT_FOUND", 404);
    const booking = await db.findBookingByToken(cleaned);
    // Hosting is never a guest record, even if an old link still resolved.
    if (!booking || isHostRecord({ organizationName: booking.organization_name, retreatType: booking.retreat_type })) {
      fail("NOT_FOUND", 404);
    }
    return booking;
  }

  async function requireSignableTask(booking, itemKey) {
    if (!(await db.isSigningEnabled(booking.id))) fail("SIGNING_OFF", 403);
    const item = await db.findItem(booking.id, itemKey);
    if (!item) fail("NOT_FOUND", 404);
    if (item.guest_action !== "upload_file" || !item.sign_document_id) fail("NOT_SIGNABLE", 409);
    return item;
  }

  async function readOriginal(booking, item, expectedDocumentId) {
    if (expectedDocumentId && item.sign_document_id !== expectedDocumentId) fail("DOCUMENT_CHANGED", 409);
    const document = await db.findDocument(booking.id, item.sign_document_id);
    if (!document || document.uploaded_by_guest || !document.storage_path) fail("DOCUMENT_UNREADABLE", 422);
    if (!/\.pdf$/i.test(document.file_name || "")) fail("DOCUMENT_UNREADABLE", 422);
    const bytes = await storage.download(ORIGINALS_BUCKET, document.storage_path);
    if (!bytes || bytes.length > MAX_ORIGINAL_BYTES || !isPdf(bytes)) fail("DOCUMENT_UNREADABLE", 422);
    return { document, bytes, sha256: await sha256Hex(bytes) };
  }

  async function open({ token, itemKey }) {
    const booking = await requireBooking(token);
    const item = await requireSignableTask(booking, cleanText(itemKey));
    if (!["notStarted", "waitingOnGuest"].includes(item.status)) fail("TASK_NOT_OPEN", 409);
    const { document, bytes, sha256 } = await readOriginal(booking, item);
    return {
      document: {
        id: document.id,
        title: document.title,
        fileName: document.file_name,
        size: bytes.length,
        sha256,
        viewUrl: await storage.signedUrl(ORIGINALS_BUCKET, document.storage_path, URL_SECONDS),
      },
      organizationName: booking.organization_name || "",
      agreement: { version: AGREEMENT_VERSION, text: AGREEMENT_TEXT, authorityTemplate: authorityText("{organization}") },
    };
  }

  async function signedResult(row) {
    return {
      signature: publicSignature(row),
      downloadUrl: await storage.signedUrl(SIGNED_BUCKET, row.signed_path, URL_SECONDS, safeFileName(row.document_title)),
    };
  }

  async function sign({ token, input, clientIp = "", userAgent = "" }) {
    const booking = await requireBooking(token);
    const clean = validateSignInput(input);

    // A retry of a save that already succeeded (for example, the response was lost).
    const previous = await db.findSignatureByRequestKey(clean.requestKey);
    if (previous) {
      if (previous.booking_id !== booking.id) fail("NOT_FOUND", 404);
      return { ...(await signedResult(previous)), repeated: true };
    }

    const item = await requireSignableTask(booking, clean.itemKey);
    if (!["notStarted", "waitingOnGuest"].includes(item.status)) fail("TASK_NOT_OPEN", 409);
    const { document, bytes: originalBytes, sha256: originalSha256 } = await readOriginal(booking, item, clean.documentId);
    if (originalSha256 !== clean.documentSha256) fail("DOCUMENT_CHANGED", 409);

    const signedAt = now();
    const authority = clean.signsForOrganization ? authorityText(clean.organizationName) : "";
    const { bytes: signedBytes, originalPageCount } = await buildSignedPdf({
      PDFLib,
      originalBytes,
      details: {
        documentTitle: document.title,
        documentFileName: document.file_name,
        signerName: clean.signerName,
        signerTitle: clean.signerTitle,
        organizationName: clean.organizationName,
        signsForOrganization: clean.signsForOrganization,
        signatureType: clean.signatureType,
        drawing: clean.drawing,
        signedAt,
        agreementText: AGREEMENT_TEXT,
        authorityText: authority,
        agreementVersion: AGREEMENT_VERSION,
        bookingName: booking.organization_name || "Booking",
        itemTitle: item.title,
        recordKey: clean.requestKey,
        originalSha256,
      },
    });

    // Each attempt writes its own files, so concurrent or retried attempts never overwrite each other.
    const attemptId = randomId();
    const originalPath = storagePathFor(clean.requestKey, attemptId, "original.pdf");
    const signedPath = storagePathFor(clean.requestKey, attemptId, "signed.pdf");
    const written = [];
    const discardFiles = async () => {
      if (written.length) await storage.remove(SIGNED_BUCKET, written).catch(() => {});
    };

    try {
      await storage.upload(SIGNED_BUCKET, originalPath, originalBytes);
      written.push(originalPath);
      await storage.upload(SIGNED_BUCKET, signedPath, signedBytes);
      written.push(signedPath);
    } catch {
      await discardFiles();
      fail("SAVE_FAILED", 503, "Your signature could not be saved. Nothing was signed. Please try again.");
    }

    let outcome;
    try {
      outcome = await db.recordSignature({
        booking_id: booking.id,
        checklist_item_id: item.id,
        document_id: document.id,
        document_title: document.title,
        document_file_name: document.file_name,
        request_key: clean.requestKey,
        signer_name: clean.signerName,
        signer_title: clean.signerTitle,
        organization_name: clean.organizationName,
        signs_for_organization: clean.signsForOrganization,
        signature_type: clean.signatureType,
        agreement_version: AGREEMENT_VERSION,
        agreement_text: AGREEMENT_TEXT,
        authority_text: authority,
        signed_at: signedAt.toISOString(),
        client_ip: String(clientIp || "").slice(0, 100),
        user_agent: String(userAgent || "").slice(0, 300),
        original_path: originalPath,
        original_sha256: originalSha256,
        original_size: originalBytes.length,
        original_page_count: originalPageCount,
        signed_path: signedPath,
        signed_sha256: await sha256Hex(signedBytes),
        signed_size: signedBytes.length,
      });
    } catch (error) {
      const code = String(error?.message || "");
      if (["TASK_NOT_OPEN", "DOCUMENT_CHANGED", "SIGNING_OFF", "TASK_NOT_FOUND"].includes(code)) {
        await discardFiles();
        fail(code === "TASK_NOT_FOUND" ? "NOT_FOUND" : code, code === "SIGNING_OFF" ? 403 : 409);
      }
      // Unknown outcome (timeout, dropped connection): the row may exist, so keep the files
      // and look again. A file without a row is harmless; a row without its file is not.
      const saved = await db.findSignatureByRequestKey(clean.requestKey).catch(() => null);
      if (saved && saved.booking_id === booking.id) return { ...(await signedResult(saved)), repeated: true };
      fail("SAVE_FAILED", 503, "Your signature could not be saved. Nothing was marked as signed. Please try again.");
    }

    if (outcome.status === "existing") {
      await discardFiles();
      return { ...(await signedResult(outcome.signature)), repeated: true };
    }
    return { ...(await signedResult(outcome.signature)), repeated: false };
  }

  async function download({ token, signatureId }) {
    const booking = await requireBooking(token);
    if (!UUID.test(String(signatureId || ""))) fail("NOT_FOUND", 404);
    const row = await db.findSignature(booking.id, String(signatureId).toLowerCase());
    if (!row) fail("NOT_FOUND", 404);
    return { downloadUrl: await storage.signedUrl(SIGNED_BUCKET, row.signed_path, URL_SECONDS, safeFileName(row.document_title)) };
  }

  /*
    Admin restore of one file from a signed-documents export. The bytes must
    match a fingerprint already recorded for that path; nothing is overwritten.
  */
  async function restoreFile({ path, bytes }) {
    if (!/^signatures\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(original|signed)\.pdf$/.test(String(path || ""))) {
      fail("NOT_FOUND", 404, "This is not a signing file path.");
    }
    const row = await db.findSignatureByPath(path);
    if (!row) fail("NOT_FOUND", 404, "No signing record uses this file path.");
    const expected = row.original_path === path ? row.original_sha256 : row.signed_sha256;
    if ((await sha256Hex(bytes)) !== expected) {
      fail("FINGERPRINT_MISMATCH", 409, "This file does not match the fingerprint recorded for it, so it was not restored.");
    }
    const existing = await storage.download(SIGNED_BUCKET, path);
    if (existing) {
      if ((await sha256Hex(existing)) === expected) return { status: "present" };
      fail("FINGERPRINT_MISMATCH", 409, "A different file is already stored at this path. It was left unchanged.");
    }
    await storage.upload(SIGNED_BUCKET, path, bytes);
    return { status: "restored" };
  }

  return { open, sign, download, restoreFile };
}
