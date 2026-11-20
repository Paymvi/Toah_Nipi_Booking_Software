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

  Version 3 (online signing): version 2 plus portalSignatures, the
  read-only signing records. The storage manifest also lists each signed
  record's original and signed PDF with its SHA-256 fingerprint. The PDFs
  themselves are saved by the separate "signed documents" export
  (src/services/signingBackup.js).

  Version 4: version 3 plus bookingChangeLog, the booking change history
  the staff app shows (booking_change_log). Restoring it only adds rows
  that are missing, so the same backup can be restored twice.

  Version 5 (Group Map): version 4 plus organizations (groups and their
  parent) and organizationNameLinks (which booking organization names
  belong to which group), read together in one database statement.
  Restoring them only adds what is missing; current groups and links are
  never changed or deleted, in Merge or Full Replace (docs/GROUP_MAP.md).
  Versions 1-4 contain no groups, so restoring one leaves the Group Map
  exactly as it is.

  All five versions restore. The hash function is a parameter so this module
  works in the browser and in Node tests.
*/

import { sanitizePortalDocumentFileName } from "./portalRules.js";

export const BACKUP_FORMAT = "toah-nipi-booking-backup";
export const CURRENT_BACKUP_SCHEMA_VERSION = 5;
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = Object.freeze([1, 2, 3, 4, 5]);
// First version that carries the Group Map.
export const GROUP_MAP_BACKUP_SCHEMA_VERSION = 5;

export const BACKUP_SECTIONS = Object.freeze([
  { key: "bookings", label: "Bookings", table: "bookings" },
  { key: "guestInquiries", label: "Website inquiries", table: "guest_inquiries" },
  { key: "portalChecklistItems", label: "Portal tasks", table: "portal_checklist_items" },
  { key: "portalDocuments", label: "Portal documents", table: "portal_documents" },
  { key: "portalSignatures", label: "Online signing records", table: "portal_signatures" },
  { key: "bookingChangeLog", label: "Booking change history", table: "booking_change_log" },
  { key: "organizations", label: "Group Map groups", table: "organizations" },
  // Keyed by name, not id; validateGroupMapSection checks it.
  { key: "organizationNameLinks", label: "Group Map linked names", table: "organization_name_links" },
  { key: "storageManifest", label: "Uploaded-file list (names and locations only)", table: null },
]);

export const PORTAL_UPLOADS_BUCKET = "portal-uploads";
export const PORTAL_SIGNED_BUCKET = "portal-signed";

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
  if (backup?.schemaVersion === 2) {
    return {
      bookings: asArray(payload.bookings),
      guestInquiries: asArray(payload.guestInquiries),
      portalChecklistItems: asArray(payload.portalChecklistItems),
      portalDocuments: asArray(payload.portalDocuments),
      storageManifest: asArray(payload.storageManifest),
    };
  }
  if (backup?.schemaVersion === 3) {
    return {
      bookings: asArray(payload.bookings),
      guestInquiries: asArray(payload.guestInquiries),
      portalChecklistItems: asArray(payload.portalChecklistItems),
      portalDocuments: asArray(payload.portalDocuments),
      portalSignatures: asArray(payload.portalSignatures),
      storageManifest: asArray(payload.storageManifest),
    };
  }
  if (backup?.schemaVersion === 4) {
    return {
      bookings: asArray(payload.bookings),
      guestInquiries: asArray(payload.guestInquiries),
      portalChecklistItems: asArray(payload.portalChecklistItems),
      portalDocuments: asArray(payload.portalDocuments),
      portalSignatures: asArray(payload.portalSignatures),
      bookingChangeLog: asArray(payload.bookingChangeLog),
      storageManifest: asArray(payload.storageManifest),
    };
  }
  return {
    bookings: asArray(payload.bookings),
    guestInquiries: asArray(payload.guestInquiries),
    portalChecklistItems: asArray(payload.portalChecklistItems),
    portalDocuments: asArray(payload.portalDocuments),
    portalSignatures: asArray(payload.portalSignatures),
    bookingChangeLog: asArray(payload.bookingChangeLog),
    organizations: asArray(payload.organizations),
    organizationNameLinks: asArray(payload.organizationNameLinks),
    storageManifest: asArray(payload.storageManifest),
  };
}

export const hasGroupMapSection = (backup) => Number(backup?.schemaVersion) >= GROUP_MAP_BACKUP_SCHEMA_VERSION;

export function getBackupSection(backup, key) {
  return asArray(backup?.payload?.[key]);
}

/*
  Files the portal records point to. Staff-shared custom documents are
  stored under the booking's portal token unless the row records its own
  storage_path (see the portal_documents migration).
*/
export function buildStorageManifest({ portalChecklistItems = [], portalDocuments = [], portalSignatures = [], bookings = [] }) {
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

  // Signed records: both files, with the fingerprints recorded when they were signed.
  portalSignatures.forEach((signature) => {
    [
      ["original", signature?.original_path, signature?.original_sha256, signature?.original_size],
      ["signed", signature?.signed_path, signature?.signed_sha256, signature?.signed_size],
    ].forEach(([kind, path, sha256, size]) => {
      if (!path) return;
      manifest.push({
        bucket: PORTAL_SIGNED_BUCKET,
        path,
        source: "portal_signatures",
        kind,
        rowId: signature.id ?? null,
        bookingId: signature.booking_id ?? null,
        fileName: `${kind}.pdf`,
        mimeType: "application/pdf",
        size: size ?? null,
        sha256: sha256 || "",
      });
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
    portalSignatures: asArray(sections.portalSignatures),
    bookingChangeLog: asArray(sections.bookingChangeLog),
    organizations: asArray(sections.organizations),
    organizationNameLinks: asArray(sections.organizationNameLinks),
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
      portalSignatureCount: payload.portalSignatures.length,
      bookingChangeLogCount: payload.bookingChangeLog.length,
      organizationCount: payload.organizations.length,
      organizationNameLinkCount: payload.organizationNameLinks.length,
      storageManifestCount: payload.storageManifest.length,
    },
    coverage: {
      sections: BACKUP_SECTIONS.map((section) => section.key),
      sectionErrors,
      note:
        "storageManifest lists uploaded-file locations (and signed-PDF fingerprints) only; the files themselves are not in this backup. " +
        "Signed PDFs are saved by the separate signed-documents export.",
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const siblingKey = (group) => `${group.parent_id || ""}|${String(group.name).toLowerCase()}`;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/*
  The Group Map section must hold together on its own, or the whole restore
  is refused before anything changes. group_map_restore checks the same
  rules again in the database.
*/
export function validateGroupMapSection(organizations, links) {
  const errors = [];
  const groups = asArray(organizations);
  const byId = new Map(groups.map((group) => [String(group?.id), group]));

  const malformed = groups.filter((group) =>
    !UUID_PATTERN.test(String(group?.id ?? "")) ||
    typeof group?.name !== "string" ||
    group.name !== group.name.trim() ||
    group.name.length < 1 || group.name.length > 200 ||
    (group.parent_id != null && !UUID_PATTERN.test(String(group.parent_id)))
  ).length;
  if (malformed) errors.push(`${plural(malformed, "group")} in the Group Map section have a missing or malformed id or name.`);

  const orphans = groups.filter((group) => group?.parent_id != null && !byId.has(String(group.parent_id))).length;
  if (orphans) errors.push(`${plural(orphans, "group")} in the Group Map section point to a parent that is not in the backup.`);

  const looping = groups.filter((group) => {
    const seen = new Set();
    let current = group;
    while (current?.parent_id != null) {
      if (seen.has(String(current.id))) return true;
      seen.add(String(current.id));
      current = byId.get(String(current.parent_id));
    }
    return false;
  }).length;
  if (looping) errors.push(`${plural(looping, "group")} in the Group Map section are their own parent or sit in a loop.`);

  const siblings = new Map();
  groups.forEach((group) => {
    if (typeof group?.name === "string") siblings.set(siblingKey(group), (siblings.get(siblingKey(group)) || 0) + 1);
  });
  const clashes = [...siblings.values()].filter((count) => count > 1).length;
  if (clashes) errors.push(`The Group Map section has ${plural(clashes, "set")} of groups with the same name and parent.`);

  const names = asArray(links).map((link) => link?.name);
  if (new Set(names).size !== names.length) errors.push("The Group Map section links the same booking name twice.");
  const badLinks = asArray(links).filter((link) =>
    typeof link?.name !== "string" || link.name.length < 1 || link.name.length > 500 || !byId.has(String(link?.organization_id))
  ).length;
  if (badLinks) errors.push(`${plural(badLinks, "linked name")} in the Group Map section are empty or point to a group that is not in the backup.`);

  return errors;
}

/*
  What restoring the backup's Group Map would do to the current one, for the
  preview. Same rules, in the same order, as group_map_restore; the database
  has the final say (someone may change groups in between).
*/
export function planGroupMapRestore(organizations, links, live = { groups: [], links: [] }) {
  const backupGroups = asArray(organizations);
  const byId = new Map(backupGroups.map((group) => [String(group.id), group]));
  const depth = (group) => {
    let steps = 0;
    for (let current = group; current?.parent_id != null && steps < 1000; steps += 1) current = byId.get(String(current.parent_id));
    return steps;
  };
  const liveById = new Map(asArray(live.groups).map((group) => [String(group.id), group]));
  const present = new Set(liveById.keys());
  const takenNames = new Set(asArray(live.groups).map(siblingKey));
  const plan = { groupsInserted: 0, groupsAlreadyPresent: 0, groupsKeptCurrent: 0, groupsSkipped: 0,
    linksInserted: 0, linksAlreadyPresent: 0, linksKeptCurrent: 0, linksSkipped: 0, notes: [] };

  [...backupGroups]
    .sort((a, b) => depth(a) - depth(b) || String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()) || String(a.id).localeCompare(String(b.id)))
    .forEach((group) => {
      const current = liveById.get(String(group.id));
      if (current) {
        plan.groupsAlreadyPresent += 1;
        if (current.name !== group.name || (current.parent_id ?? null) !== (group.parent_id ?? null)) {
          plan.groupsKeptCurrent += 1;
          plan.notes.push({ kind: "group", name: group.name, current: current.name, outcome: "kept-current" });
        }
      } else if (group.parent_id != null && !present.has(String(group.parent_id))) {
        plan.groupsSkipped += 1;
        plan.notes.push({ kind: "group", name: group.name, outcome: "parent-not-restored" });
      } else if (takenNames.has(siblingKey(group))) {
        plan.groupsSkipped += 1;
        plan.notes.push({ kind: "group", name: group.name, outcome: "name-in-use" });
      } else {
        plan.groupsInserted += 1;
        present.add(String(group.id));
        takenNames.add(siblingKey(group));
      }
    });

  const liveLinks = new Map(asArray(live.links).map((link) => [link.name, String(link.organization_id)]));
  [...asArray(links)].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).forEach((link) => {
    const currentGroup = liveLinks.get(link.name);
    if (currentGroup !== undefined) {
      if (currentGroup === String(link.organization_id)) plan.linksAlreadyPresent += 1;
      else {
        plan.linksKeptCurrent += 1;
        plan.notes.push({ kind: "link", name: link.name, current: liveById.get(currentGroup)?.name || "", outcome: "kept-current" });
      }
    } else if (!present.has(String(link.organization_id))) {
      plan.linksSkipped += 1;
      plan.notes.push({ kind: "link", name: link.name, outcome: "group-not-restored" });
    } else {
      plan.linksInserted += 1;
    }
  });

  return plan;
}

// One line per note, for the preview and the restore result.
export function describeGroupMapNote(note) {
  switch (note.outcome) {
    case "kept-current":
      return note.kind === "group"
        ? `Group "${note.name}" already exists here${note.current && note.current !== note.name ? ` as "${note.current}"` : ""} with different details; the current version is kept.`
        : `"${note.name}" is already linked to ${note.current ? `"${note.current}"` : "another group"}; that link is kept.`;
    case "parent-not-restored":
      return `Group "${note.name}" was not added because its parent organization was not restored.`;
    case "name-in-use":
      return `Group "${note.name}" was not added because a current group at that level already has this name. Groups are never merged automatically.`;
    case "group-not-restored":
      return `"${note.name}" was not linked because its group was not restored.`;
    default:
      return `${note.name}: ${note.outcome}`;
  }
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
        `This version of the app reads versions ${SUPPORTED_BACKUP_SCHEMA_VERSIONS.join(", ")}.`
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

  if (hasGroupMapSection(backup)) {
    errors.push(...validateGroupMapSection(getBackupSection(backup, "organizations"), getBackupSection(backup, "organizationNameLinks")));
    /*
      A version 5 file lists the sections it holds (coverage.sections). One made
      by a tool that backs up only part of the data (a scheduled job writing
      bookings and the Group Map) must not pass for a complete backup.
    */
    const covered = backup?.coverage?.sections;
    const missing = BACKUP_SECTIONS.filter((section) => section.table && Array.isArray(covered) && !covered.includes(section.key));
    if (!Array.isArray(covered)) {
      warnings.push("This backup doesn't say which sections it contains, so treat any empty section as not backed up.");
    } else if (missing.length > 0) {
      warnings.push(
        `This backup was made without: ${missing.map((section) => section.label.toLowerCase()).join(", ")}. ` +
          "Restoring it adds none of those, and what is already in the database is kept."
      );
    }
  } else if (SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(backup.schemaVersion)) {
    warnings.push(
      `This version ${backup.schemaVersion} backup was made before the Group Map was backed up. It contains no groups, ` +
        "so restoring it (Merge or Full Replace) leaves the current groups, parents and linked names exactly as they are."
    );
  }

  if (backup.schemaVersion === 2 || backup.schemaVersion === 3) {
    warnings.push(`This is a version ${backup.schemaVersion} backup, made before booking change history was backed up. It contains no change history; history already in the database is kept.`);
  }

  if (backup.schemaVersion === 2) {
    warnings.push("This is a version 2 backup, made before online signing. It contains no online signing records.");
  }

  if (backup.schemaVersion === 1) {
    warnings.push(
      "This is a version 1 backup (bookings only), the format the Google Apps Script daily backup writes. " +
        "Website inquiries, portal tasks, portal documents, booking change history and the uploaded-file list are not in it and will not be restored."
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
