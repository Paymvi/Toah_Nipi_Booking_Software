import {
  hasMasterImportHeader,
  masterImportText,
  normalizeMaster2026SpreadsheetRow,
  normalizeMaster2027SpreadsheetRow,
  normalizeMasterSpreadsheetRow,
} from "./masterImport.js";
import { formatExcelDateValue } from "./dateUtils.js";
import { readSpreadsheetCell, rowHasAnyData } from "./spreadsheetUtils.js";

export const MASTER_REIMPORT_RULES_TEXT =
  "How existing bookings are updated:\n" +
  "- Matching uses the import ID, then the group name and stay dates.\n" +
  "- Fields changed in the app keep the app value. The sheet only fills blanks and updates fields nobody has changed since the last import.\n" +
  "- For bookings imported before this rule existed, a filled field whose value cannot be traced to the earlier import keeps the app value.\n" +
  "- Status changes only when the sheet row states one; a blank status never resets it.\n" +
  "- Once the Housing tab has been saved, the sheet does not change lodging; its lodging text is kept as a reference note.\n" +
  "- Blank sheet cells never clear app values. Booking IDs, checklists, assignments and portal data are untouched.\n" +
  "- Bookings absent from this spreadsheet are kept. Repeated rows use the first occurrence.\n";

export function formatMasterImportKeptValues(keptAppValues = []) {
  if (!keptAppValues.length) return "";
  const fieldCount = keptAppValues.reduce((sum, entry) => sum + entry.fields.length, 0);
  const examples = keptAppValues
    .slice(0, 8)
    .map((entry) => `  ${entry.organizationName}: ${entry.fields.map((field) => field.field).join(", ")}`)
    .join("\n");
  const more = keptAppValues.length > 8 ? `\n  …and ${keptAppValues.length - 8} more` : "";
  return `\nApp values kept instead of the sheet: ${fieldCount} field(s) on ${keptAppValues.length} booking(s)\n${examples}${more}`;
}

export function formatImportSaveFailures(failures = []) {
  if (!failures.length) return "";
  const lines = failures
    .slice(0, 8)
    .map(({ booking, error }) => `  ${booking.organizationName || booking.id}: ${error?.message || String(error)}`)
    .join("\n");
  const more = failures.length > 8 ? `\n  …and ${failures.length - 8} more` : "";
  return `\n\nNOT SAVED (${failures.length}). These rows were left exactly as they were:\n${lines}${more}`;
}

export function detectMasterSpreadsheetType(worksheetName, spreadsheetRows = []) {
  const normalizedSheetName = String(worksheetName || "")
    .trim()
    .toLowerCase();

  /*
    FIRST: explicitly reject sheets that we know are NOT Master sheets.

    This is especially important because inquiry sheets may share
    several columns with Master sheets.
  */
  if (
    normalizedSheetName.includes("inquir") ||
    normalizedSheetName.includes("waitlist") ||
    normalizedSheetName.includes("no's") ||
    normalizedSheetName.includes("nos") ||
    normalizedSheetName.includes("counts") ||
    normalizedSheetName.includes("risk management") ||
    normalizedSheetName.includes("staff_contacts")
  ) {
    return "";
  }

  /*
    BEST CASE:
    Detect by the actual worksheet name.
  */
  if (
    normalizedSheetName.includes("master") &&
    normalizedSheetName.includes("2027")
  ) {
    return "Master 2027";
  }

  if (
    normalizedSheetName.includes("master") &&
    normalizedSheetName.includes("2026")
  ) {
    return "Master 2026";
  }

  if (
    normalizedSheetName.includes("master") &&
    normalizedSheetName.includes("2025")
  ) {
    return "Master 2025";
  }

  /*
    FALLBACK:
    Only use headers if the sheet was renamed.

    Require MULTIPLE distinctive columns instead of matching
    just one shared column.
  */
  const sampleRow =
    spreadsheetRows.find((row) => rowHasAnyData(row)) || {};

  const hasHeader = (...headers) =>
    hasMasterImportHeader(sampleRow, headers);

  /*
    Master 2027
  */
  const looksLikeMaster2027 =
    hasHeader("Confirmed or Unconfirmed") &&
    (
      hasHeader("$250 Deposit for 2027 Rec'd?") ||
      hasHeader("$250 Deposit for 2027 Received?")
    ) &&
    hasHeader("Estimated # of Guests");

  if (looksLikeMaster2027) {
    return "Master 2027";
  }

  /*
    Master 2026
  */
  const looksLikeMaster2026 =
    hasHeader("Adult Guest Rate") &&
    hasHeader("Group Leader Phone #", "Group Leader #", "Contact Person Cell #") &&
    (
      hasHeader("Schedule/Activities") ||
      hasHeader("Monthly Sum of Projected Income")
    );

  if (looksLikeMaster2026) {
    return "Master 2026";
  }

  /*
    Master 2025
  */
  const looksLikeMaster2025 =
    hasHeader("Total # of Guests") &&
    hasHeader("Actual # of Adults") &&
    (
      hasHeader("Actual # of Minors 3 to 17") ||
      hasHeader("Actual # of Day Use Guests")
    );

  if (looksLikeMaster2025) {
    return "Master 2025";
  }

  return "";
}

export function normalizeEverythingSpreadsheetRow(row, index, detectedType) {
  if (detectedType === "Master 2025") {
    return normalizeMasterSpreadsheetRow(row, index);
  }

  if (detectedType === "Master 2026") {
    return normalizeMaster2026SpreadsheetRow(row, index);
  }

  if (detectedType === "Master 2027") {
    return normalizeMaster2027SpreadsheetRow(row, index);
  }

  if (
    detectedType === "Guest Group Inquiry 2025" ||
    detectedType === "Guest Group Inquiry 2026" ||
    detectedType === "Guest Group Inquiry 2027"
  ) {
    return normalizeGuestGroupInquirySpreadsheetRow(
      row,
      index,
      detectedType
    );
  }

  return null;
}

/* =========================================================
   GUEST GROUP INQUIRY / NO'S IMPORT
   Handles the 2025, 2026, and 2027 inquiry sheets.
========================================================= */

function cleanGuestGroupInquiryText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

export function detectGuestGroupInquirySpreadsheetType(worksheetName) {
  const normalizedSheetName = String(worksheetName || "")
    .trim()
    .toLowerCase();

  /*
    These sheets currently have names such as:

    2025 Guest Group Inquiries and 'No's
    2026 Guest Group Inquiries and 'No's
    2027 Guest Group Inquiries and No's
  */
  const isGuestGroupInquirySheet =
    normalizedSheetName.includes("guest group") &&
    normalizedSheetName.includes("inquir");

  if (!isGuestGroupInquirySheet) {
    return "";
  }

  if (normalizedSheetName.includes("2025")) {
    return "Guest Group Inquiry 2025";
  }

  if (normalizedSheetName.includes("2026")) {
    return "Guest Group Inquiry 2026";
  }

  if (normalizedSheetName.includes("2027")) {
    return "Guest Group Inquiry 2027";
  }

  return "";
}

function getGuestGroupInquiryStatus(disposition) {
  const text = cleanGuestGroupInquiryText(disposition).toLowerCase();

  if (text.includes("waitlist")) {
    return "Waitlist";
  }

  /*
    These are essentially closed / unsuccessful inquiries.
  */
  if (
    text === "no" ||
    text.startsWith("no ") ||
    text.includes("did not hear") ||
    text.includes("didn't hear") ||
    text.includes("never heard")
  ) {
    return "Cancelled";
  }

  /*
    "Considering" is still an active inquiry.
  */
  return "Inquiry";
}

function normalizeGuestGroupInquirySpreadsheetRow(
  row,
  index,
  detectedType
) {
  const inquiryDate = readSpreadsheetCell(row, ["Date"]);

  const contactName = readSpreadsheetCell(row, [
    "Contact Name",
  ]);

  const email = readSpreadsheetCell(row, [
    "Email Address",
    "Email",
  ]);

  const phone = readSpreadsheetCell(row, [
    "Phone Number",
    "Phone",
  ]);

  const guestGroupName = readSpreadsheetCell(row, [
    "Guest Group Name",
  ]);

  /*
    2027 calls this "Mailing address".
    2026 calls it "Address".
    2025 does not have the column.
  */
  const inquiryAddress = readSpreadsheetCell(row, [
    "Mailing address",
    "Mailing Address",
    "Address",
  ]);

  const size = readSpreadsheetCell(row, [
    "Size",
  ]);

  const desiredDates = readSpreadsheetCell(row, [
    "Desired Dates",
  ]);

  const additionalNotes = readSpreadsheetCell(row, [
    "Additional Notes",
  ]);

  /*
    2026 / 2027:
      Waitlist, Considering or No

    2025:
      Waitlist or No
  */
  const disposition = readSpreadsheetCell(row, [
    "Waitlist, Considering or No",
    "Waitlist or No",
  ]);

  const rowHasData =
    inquiryDate ||
    contactName ||
    email ||
    phone ||
    guestGroupName ||
    inquiryAddress ||
    size ||
    desiredDates ||
    additionalNotes ||
    disposition;

  if (!rowHasData) {
    return null;
  }

  const cleanContactName = cleanGuestGroupInquiryText(contactName);
  const cleanGroupName = cleanGuestGroupInquiryText(guestGroupName);
  const cleanAddress = cleanGuestGroupInquiryText(inquiryAddress);
  const cleanSize = cleanGuestGroupInquiryText(size);
  const cleanDesiredDates = cleanGuestGroupInquiryText(desiredDates);
  const cleanNotes = cleanGuestGroupInquiryText(additionalNotes);
  const cleanDisposition = cleanGuestGroupInquiryText(disposition);

  const formattedInquiryDate = formatExcelDateValue(inquiryDate);

  const status = getGuestGroupInquiryStatus(cleanDisposition);

  return {
    id: `guest-group-inquiry-import-${Date.now()}-${
      row.sourceSheet || "sheet"
    }-${index}`,

    sourceType: detectedType,
    detectedImportType: detectedType,

    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,

    /*
      "Date" on these sheets means when the inquiry/contact happened,
      NOT when the retreat occurs.
    */
    submittedAt: formattedInquiryDate
      ? `${formattedInquiryDate}T12:00:00.000Z`
      : "",

    organizationName: cleanGroupName || "Unnamed Inquiry",

    name: cleanContactName,
    contactName: cleanContactName,

    email: cleanGuestGroupInquiryText(email),
    phone: cleanGuestGroupInquiryText(phone),

    /*
      IMPORTANT:

      Do not convert tentative Desired Dates into real booking dates.

      Some rows contain several possible date ranges and some represent
      groups that were denied or waitlisted.
    */
    startDate: "",
    endDate: "",
    desiredDatesText: cleanDesiredDates,

    attendeeCount: cleanSize,
    groupSize: cleanSize,

    retreatType: "",

    roomName: "Unassigned",
    buildingsRooms: "",

    notes: cleanNotes,
    message: cleanNotes,

    /*
      Preserve inquiry-only fields separately.
    */
    inquiryAddress: cleanAddress,
    inquiryDisposition: cleanDisposition,

    /*
      Also use the normal workflow fields where they make sense.
    */
    waitlist:
      status === "Waitlist"
        ? "Yes"
        : "No",

    status,

    /*
      This gives us another semantic home for the original
      Waitlist / Considering / No value.
    */
    stageOfGroup: cleanDisposition,

    promoCode: "",
  };
}

export function createWorkbookBulkImportId({
  detectedType,
  sourceSheet,
  sourceRowNumber,
}) {
  const safeType = String(detectedType || "record")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safeSheet = String(sourceSheet || "sheet")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safeRow = String(sourceRowNumber || "row")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return `bulk-${safeType}-${safeSheet}-${safeRow}`;
}

/*
  dayOffset shifts the inquiry date before building the identity. Records
  imported before the AUDIT-013 fix carry a date one day early, so a fresh
  row (correct date) also matches an existing record dated the day before.
*/
function getGuestGroupInquiryImportIdentity(booking, dayOffset = 0) {
  const type = masterImportText(booking.detectedImportType || booking.sourceType);
  if (!/^Guest Group Inquiry 20\d{2}$/i.test(type)) return "";
  const inquiryDay = masterImportText(booking.submittedAt).slice(0, 10);
  const shiftedDay = dayOffset && /^\d{4}-\d{2}-\d{2}$/.test(inquiryDay)
    ? new Date(Date.parse(`${inquiryDay}T00:00:00Z`) + dayOffset * 86400000).toISOString().slice(0, 10)
    : inquiryDay;
  const values = [
    type,
    booking.organizationName,
    booking.contactName,
    booking.email,
    shiftedDay,
  ];
  return values.map((value) => masterImportText(value).toLowerCase().replace(/\s+/g, " ")).join("|");
}

/*
  Inquiry import IDs come from the sheet name and row number, which change
  when rows are inserted, deleted or sorted, or a sheet is renamed. Match each
  row to an existing inquiry of the same year by its content first so those
  edits update the same record instead of duplicating or overwriting another.
  Repeated rows still map to separate records; nothing is merged or deleted.
*/
export function prepareGuestGroupInquiryImportIds(incomingRows, existingRows) {
  const existingInquiries = existingRows.filter((booking) => getGuestGroupInquiryImportIdentity(booking));
  const existingIds = new Set(existingRows.map((booking) => booking.id));
  const claimedIds = new Set();
  const matchedIds = new Map();

  incomingRows.forEach((incoming, index) => {
    const identity = getGuestGroupInquiryImportIdentity(incoming);
    if (!identity) return;
    const exactMatches = existingInquiries.filter((booking) =>
      !claimedIds.has(booking.id) && getGuestGroupInquiryImportIdentity(booking) === identity
    );
    const legacyShiftedMatches = exactMatches.length
      ? []
      : existingInquiries.filter((booking) =>
          !claimedIds.has(booking.id) && getGuestGroupInquiryImportIdentity(booking, 1) === identity
        );
    const matches = exactMatches.length ? exactMatches : legacyShiftedMatches;
    const match = matches.find((booking) => booking.id === incoming.id) || matches[0];
    if (!match) return;
    claimedIds.add(match.id);
    matchedIds.set(index, match.id);
  });

  return incomingRows.map((incoming, index) => {
    if (!getGuestGroupInquiryImportIdentity(incoming)) return incoming;
    let id = matchedIds.get(index);
    if (!id) {
      // An unclaimed row-position ID is the same row edited in the workbook.
      // If another inquiry kept that ID, use a fresh one instead of overwriting it.
      id = incoming.id;
      for (
        let suffix = 2;
        claimedIds.has(id) || (id !== incoming.id && existingIds.has(id));
        suffix += 1
      ) {
        id = `${incoming.id}-${suffix}`;
      }
      claimedIds.add(id);
    }
    return { ...incoming, id };
  });
}
