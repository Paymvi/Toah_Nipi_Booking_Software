import {
  DUPLICATED_FIELD_MAP,
  getBookingDetails,
  getStaffEditedFields,
  isBlankFieldValue,
} from "./bookingFields.js";

/*
  Master re-import merge (AUDIT-006, Q-001 A, Q-002 A).

  After the first import the app owns any field staff changed in the app.
  A re-imported sheet only updates fields nobody has changed since the last
  import. For each field:

    - a blank sheet cell never clears anything;
    - a field staff edited in the app (staffEditedFields) is kept;
    - otherwise the sheet updates the field only if the app value still
      equals what the previous import wrote (the import baseline).

  Every import stores its baseline in rentalFormDetails.importBaseline.
  Records imported before this rule existed have none; their baseline is
  rebuilt from the saved sheet row when possible. When it cannot be
  rebuilt, a filled app value is kept (conservative: the app may have been
  edited, and that cannot be ruled out).

  Status changes only when the sheet row states a status; the year-based
  default never overwrites a saved status. Once the Housing tab has been
  saved, the sheet cannot change lodging assignments; its lodging text is
  kept as a reference note (importedLodgingText).
*/

// Describe the sheet itself; always refreshed.
const SHEET_METADATA_TOP_KEYS = new Set([
  "sourceType",
  "detectedImportType",
  "sourceSheet",
  "sourceRowNumber",
  "rawSpreadsheetData",
]);

const SHEET_METADATA_DETAIL_KEYS = new Set([
  "importedGuestCountKind",
  "importedGuestCountText",
  "importedLodgingText",
  "importedLinenText",
  "importedMealText",
  "importedContractSentStatus",
  "importedContractReturnedStatus",
  "importedDepositStatus",
  "importedStatusSource",
  "importWarnings",
]);

// Owned by the app or the database; never taken from the sheet.
const APP_OWNED_TOP_KEYS = new Set([
  "id",
  "submittedAt",
  "createdAt",
  "updatedAt",
  "portalToken",
  "checklists",
  "programLogisticsAssignments",
  "rentalFormDetails",
]);

const STATUS_TOP_KEYS = new Set(["status", "waitlist"]);
const LODGING_TOP_KEYS = new Set(["roomName", "buildingsRooms"]);

export const LODGING_DETAIL_KEY_PATTERN = /^(?:lodging|housing)/;

const DETAIL_TO_TOP_LEVEL = Object.fromEntries(
  Object.entries(DUPLICATED_FIELD_MAP).map(([top, detail]) => [detail, top])
);

function normalizeForCompare(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function sameValue(left, right) {
  return normalizeForCompare(left) === normalizeForCompare(right);
}

// Lodging belongs to the app once the Housing tab has been saved.
export function isHousingAuthoritative(booking) {
  const details = getBookingDetails(booking);
  return Boolean(
    getStaffEditedFields(booking).lodging ||
      details.housingSavedAt ||
      (details.housingUsage && typeof details.housingUsage === "object")
  );
}

export function hasExplicitImportStatus(incoming) {
  return getBookingDetails(incoming).importedStatusSource === "sheet";
}

/*
  The values an import wrote, kept for the next comparison. Large or
  sheet-describing values are left out.
*/
export function buildImportBaseline(incoming) {
  const top = {};
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (SHEET_METADATA_TOP_KEYS.has(key) || APP_OWNED_TOP_KEYS.has(key)) return;
    top[key] = value;
  });

  const details = {};
  Object.entries(getBookingDetails(incoming)).forEach(([key, value]) => {
    if (SHEET_METADATA_DETAIL_KEYS.has(key) || key === "importBaseline") return;
    details[key] = value;
  });

  return { version: 1, top, details };
}

function getStoredBaseline(existing) {
  const baseline = getBookingDetails(existing).importBaseline;
  return baseline && typeof baseline === "object" && baseline.top ? baseline : null;
}

/*
  Decides one field. Returns the value to keep and, when the sheet value
  was not applied because the app value wins, the reason.
*/
function decideField({ appValue, sheetValue, baselineValue, hasBaseline, staffEdited }) {
  if (isBlankFieldValue(sheetValue) || sameValue(appValue, sheetValue)) {
    return { value: appValue, kept: null };
  }
  if (isBlankFieldValue(appValue)) {
    return { value: sheetValue, kept: null };
  }
  if (staffEdited) {
    return { value: appValue, kept: "edited in the app" };
  }
  if (!hasBaseline) {
    return { value: appValue, kept: "no record of the previous import" };
  }
  if (sameValue(appValue, baselineValue)) {
    return { value: sheetValue, kept: null };
  }
  return { value: appValue, kept: "changed since the last import" };
}

export function mergeMasterImportRecord(existing, incoming, { rebuildBaseline } = {}) {
  const staffEdited = getStaffEditedFields(existing);
  let baseline = getStoredBaseline(existing);

  if (!baseline && typeof rebuildBaseline === "function") {
    try {
      const previousImport = rebuildBaseline(existing);
      baseline = previousImport ? buildImportBaseline(previousImport) : null;
    } catch {
      baseline = null;
    }
  }

  const hasBaseline = Boolean(baseline);
  const housingLocked = isHousingAuthoritative(existing);
  const keptAppValues = [];
  const merged = { ...existing };

  const note = (field, appValue, sheetValue, reason) => {
    keptAppValues.push({ field, appValue, sheetValue, reason });
  };

  Object.entries(incoming).forEach(([key, sheetValue]) => {
    if (APP_OWNED_TOP_KEYS.has(key)) return;

    if (SHEET_METADATA_TOP_KEYS.has(key)) {
      merged[key] = sheetValue;
      return;
    }

    if (STATUS_TOP_KEYS.has(key)) return; // handled below, as a pair

    if (LODGING_TOP_KEYS.has(key)) {
      if (housingLocked) {
        if (!sameValue(existing[key], sheetValue) && !isBlankFieldValue(sheetValue)) {
          note(key, existing[key], sheetValue, "Housing tab is the lodging record");
        }
        return;
      }
      // A blank sheet cell becomes "Unassigned"; that placeholder never
      // replaces a real value.
      if (key === "roomName" && /^unassigned$/i.test(String(sheetValue || "").trim())) {
        return;
      }
    }

    const decision = decideField({
      appValue: existing[key],
      sheetValue,
      baselineValue: baseline?.top?.[key],
      hasBaseline,
      staffEdited: Boolean(staffEdited[key] || (LODGING_TOP_KEYS.has(key) && staffEdited.lodging)),
    });
    merged[key] = decision.value;
    if (decision.kept) note(key, existing[key], sheetValue, decision.kept);
  });

  // Status and waitlist move together, and only on an explicit sheet status.
  if (hasExplicitImportStatus(incoming)) {
    const decision = decideField({
      appValue: existing.status,
      sheetValue: incoming.status,
      baselineValue: baseline?.top?.status,
      hasBaseline,
      staffEdited: Boolean(staffEdited.status || staffEdited.classification),
    });
    if (decision.kept) {
      note("status", existing.status, incoming.status, decision.kept);
    } else if (!sameValue(decision.value, existing.status)) {
      merged.status = incoming.status;
      merged.waitlist = incoming.waitlist;
    }
  }

  const existingDetails = getBookingDetails(existing);
  const incomingDetails = getBookingDetails(incoming);
  const mergedDetails = { ...existingDetails };

  Object.entries(incomingDetails).forEach(([key, sheetValue]) => {
    if (SHEET_METADATA_DETAIL_KEYS.has(key)) {
      mergedDetails[key] = sheetValue;
      return;
    }
    if (key === "status") {
      mergedDetails.status = merged.status;
      return;
    }
    if (housingLocked && LODGING_DETAIL_KEY_PATTERN.test(key)) return;

    const topLevelKey = DETAIL_TO_TOP_LEVEL[key];
    const decision = decideField({
      appValue: existingDetails[key],
      sheetValue,
      baselineValue: baseline?.details?.[key],
      hasBaseline,
      staffEdited: Boolean(staffEdited[key] || (topLevelKey && staffEdited[topLevelKey])),
    });
    mergedDetails[key] = decision.value;
    // Duplicated detail copies are reported once, under their column.
    if (decision.kept && !topLevelKey) {
      note(`details.${key}`, existingDetails[key], sheetValue, decision.kept);
    }
  });

  // Keep the duplicated copies equal to the columns that were kept.
  Object.entries(DUPLICATED_FIELD_MAP).forEach(([topLevelKey, detailKey]) => {
    if (detailKey in mergedDetails && !isBlankFieldValue(merged[topLevelKey])) {
      mergedDetails[detailKey] = merged[topLevelKey];
    }
  });

  mergedDetails.importBaseline = buildImportBaseline(incoming);
  merged.rentalFormDetails = mergedDetails;
  merged.id = existing.id;
  merged.submittedAt = existing.submittedAt || incoming.submittedAt;

  return { merged, keptAppValues };
}

export function withImportBaseline(incoming) {
  return {
    ...incoming,
    rentalFormDetails: {
      ...getBookingDetails(incoming),
      importBaseline: buildImportBaseline(incoming),
    },
  };
}
