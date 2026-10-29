/*
  Backup file format (AUDIT-009, AUDIT-010, Q-013 A).

  Version 1 (still produced by the Google Apps Script daily backup, per
  README, and by older app versions):
    payload  = { bookings }
    checksum = SHA-256 of JSON.stringify({ bookings })

  Version 2 (written by this app from now on):
    payload  = { bookings, guestInquiries, portalChecklistItems,
                 portalDocuments, storageManifest }
    checksum = SHA-256 of JSON.stringify(payload) with the keys in that order
    bookings also carry createdAt and portalToken, so a restored booking
    keeps its creation date and guest portal link.
    sectionErrors lists any section that could not be read when the
    backup was made, so a partial backup is never mistaken for a full one.

  The storage manifest lists the uploaded files that portal records point
  to. It is a list of file locations, not copies of the files.

  Both versions restore. The hash function is a parameter so this module
  works in the browser and in Node tests.
*/

import { sanitizePortalDocumentFileName } from "./portalRules.js";

export const BACKUP_FORMAT = "toah-nipi-booking-backup";
export const CURRENT_BACKUP_SCHEMA_VERSION = 2;
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = Object.freeze([1, 2]);

export const BACKUP_SECTIONS = Object.freeze([
  { key: "bookings", label: "Bookings", table: "bookings" },
  { key: "guestInquiries", label: "Website inquiries", table: "guest_inquiries" },
  { key: "portalChecklistItems", label: "Portal tasks", table: "portal_checklist_items" },
  { key: "portalDocuments", label: "Portal documents", table: "portal_documents" },
  { key: "storageManifest", label: "Uploaded-file list (names and locations only)", table: null },
]);

export const PORTAL_UPLOADS_BUCKET = "portal-uploads";

export async function sha256Hex(text, subtle = globalThis.crypto?.subtle) {
  if (!subtle) {
    throw new Error(
      "This browser does not support the integrity-check feature required for backups."
    );
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Payload in a fixed key order, so the checksum is reproducible.
export function getChecksumPayload(backup) {
  const payload = backup?.payload || {};
  if (backup?.schemaVersion === 1) {
    return { bookings: asArray(payload.bookings) };
  }
  return {
    bookings: asArray(payload.bookings),
    guestInquiries: asArray(payload.guestInquiries),
    portalChecklistItems: asArray(payload.portalChecklistItems),
    portalDocuments: asArray(payload.portalDocuments),
    storageManifest: asArray(payload.storageManifest),
  };
}

export function getBackupSection(backup, key) {
  return asArray(backup?.payload?.[key]);
}

/*
  Files the portal records point to. Staff-shared custom documents are
  stored under the booking's portal token unless the row records its own
  storage_path (see the portal_documents migration).
*/
export function buildStorageManifest({ portalChecklistItems = [], portalDocuments = [], bookings = [] }) {
  const tokenByBookingId = new Map(
    bookings.map((booking) => [String(booking.id), booking.portalToken || ""])
  );
  const manifest = [];

  portalChecklistItems.forEach((item) => {
    if (!item?.uploaded_file_path) return;
    manifest.push({
      bucket: PORTAL_UPLOADS_BUCKET,
      path: item.uploaded_file_path,
      source: "portal_checklist_items",
      rowId: item.id ?? null,
      bookingId: item.booking_id ?? null,
      fileName: item.uploaded_file_name || "",
      mimeType: item.uploaded_file_mime || "",
      size: item.uploaded_file_size ?? null,
    });
  });

  portalDocuments.forEach((document) => {
    if (!document?.file_name) return;
    const token = tokenByBookingId.get(String(document.booking_id)) || "";
    const derivedPath =
      document.uploaded_by_guest || !token || !document.id
        ? ""
        : `${token}/staff-documents/${document.id}/${sanitizePortalDocumentFileName(document.file_name)}`;
    const path = document.storage_path || derivedPath;
    if (!path) return;
    manifest.push({
      bucket: PORTAL_UPLOADS_BUCKET,
      path,
      pathIsDerived: !document.storage_path,
      source: "portal_documents",
      rowId: document.id ?? null,
      bookingId: document.booking_id ?? null,
      fileName: document.file_name,
      mimeType: "",
      size: null,
    });
  });

  return manifest;
}

export async function createBackupEnvelope(
  sections,
  { reason = "manual", createdAt = new Date().toISOString(), sectionErrors = {}, hash = sha256Hex } = {}
) {
  const payload = {
    bookings: asArray(sections.bookings),
    guestInquiries: asArray(sections.guestInquiries),
    portalChecklistItems: asArray(sections.portalChecklistItems),
    portalDocuments: asArray(sections.portalDocuments),
    storageManifest: asArray(sections.storageManifest),
  };
  const checksum = await hash(JSON.stringify(payload));

  return {
    format: BACKUP_FORMAT,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    createdAt,
    reason,
    application: "Toah Nipi Booking Software",
    summary: {
      bookingCount: payload.bookings.length,
      guestInquiryCount: payload.guestInquiries.length,
      portalChecklistItemCount: payload.portalChecklistItems.length,
      portalDocumentCount: payload.portalDocuments.length,
      storageManifestCount: payload.storageManifest.length,
    },
    coverage: {
      sections: BACKUP_SECTIONS.map((section) => section.key),
      sectionErrors,
      note: "storageManifest lists uploaded-file locations only; the files themselves are not in this backup.",
    },
    integrity: {
      algorithm: "SHA-256",
      checksum,
    },
    payload,
  };
}

function findDuplicateIds(rows) {
  const seen = new Set();
  const duplicates = new Set();
  rows.forEach((row) => {
    const id = String(row?.id ?? "").trim();
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates];
}

export function validateBackupShape(backup) {
  const errors = [];
  const warnings = [];

  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    errors.push("The selected file is not a valid backup object.");
    return { errors, warnings };
  }

  if (backup.format !== BACKUP_FORMAT) {
    errors.push("This file is not recognized as a Toah Nipi booking-system backup.");
  }

  if (!SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(backup.schemaVersion)) {
    errors.push(
      `Unsupported backup schema version: ${String(backup.schemaVersion ?? "missing")}. ` +
        `This version of the app reads versions ${SUPPORTED_BACKUP_SCHEMA_VERSIONS.join(" and ")}.`
    );
  }

  if (!Array.isArray(backup?.payload?.bookings)) {
    errors.push("The backup does not contain a bookings array.");
  }

  const bookings = getBackupSection(backup, "bookings");
  const missingIds = bookings.filter((booking) => !String(booking?.id ?? "").trim()).length;
  if (missingIds > 0) {
    errors.push(`${missingIds} booking record${missingIds === 1 ? " is" : "s are"} missing an ID.`);
  }

  BACKUP_SECTIONS.filter((section) => section.table).forEach((section) => {
    const duplicates = findDuplicateIds(getBackupSection(backup, section.key));
    if (duplicates.length > 0) {
      errors.push(
        `${duplicates.length} duplicate ${section.label.toLowerCase()} ID${duplicates.length === 1 ? " was" : "s were"} found inside the backup.`
      );
    }
  });

  if (bookings.length === 0) {
    warnings.push("This backup contains zero booking records.");
  }

  if (backup.schemaVersion === 1) {
    warnings.push(
      "This is a version 1 backup (bookings only), the format the Google Apps Script daily backup writes. " +
        "Website inquiries, portal tasks, portal documents and the uploaded-file list are not in it and will not be restored."
    );
  }

  const sectionErrors = backup?.coverage?.sectionErrors || {};
  Object.entries(sectionErrors).forEach(([key, message]) => {
    const label = BACKUP_SECTIONS.find((section) => section.key === key)?.label || key;
    warnings.push(`${label} could not be read when this backup was made, so the file does not contain them: ${message}`);
  });

  if (!backup?.integrity?.checksum) {
    errors.push("The backup is missing its integrity checksum.");
  }

  return { errors, warnings };
}

export async function verifyBackupIntegrity(backup, hash = sha256Hex) {
  const expectedChecksum = String(backup?.integrity?.checksum || "").trim();
  if (!expectedChecksum) {
    return { ok: false, actualChecksum: "", expectedChecksum: "" };
  }
  const actualChecksum = await hash(JSON.stringify(getChecksumPayload(backup)));
  return { ok: actualChecksum === expectedChecksum, actualChecksum, expectedChecksum };
}

/*
  Rows a merge restore should insert: only ids not already live, so
  anything guests or staff changed since the backup is never overwritten.
*/
export function getRowsMissingFromLive(backupRows, liveIds) {
  const live = new Set([...liveIds].map((id) => String(id)));
  return asArray(backupRows).filter((row) => !live.has(String(row?.id ?? "")));
}
