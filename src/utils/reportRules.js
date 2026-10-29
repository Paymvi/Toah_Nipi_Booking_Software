import {
  countsInReports,
  getBookingDisplayState,
  getConvertedInquiryIds,
  isArchiveRecord,
  isConvertedInquiry,
  isInquirySpreadsheetRecord,
  isMasterRecord,
  isStaffBookingRecord,
} from "./bookingClassification.js";
import { getBookingDetails, getStaffEditedFields } from "./bookingFields.js";

/*
  Reporting rules (AUDIT-030, 035, 036, 042, 046, 048; Q-008, Q-009,
  Q-028, Q-030, Q-031).
*/

/*
  Q-008: every record counts except host records. An inquiry that became
  a booking is counted once, as the booking.
*/
export const REPORT_INCLUSION_TEXT =
  "Counts every record except host records, including inquiries, waitlisted, cancelled and archived groups. " +
  "An inquiry that became a booking is counted once, as the booking. " +
  "Each stay is counted in the month it arrives.";

export function getReportBookings(bookings = []) {
  const convertedInquiryIds = getConvertedInquiryIds(bookings);
  const included = [];
  let hostExcluded = 0;
  let convertedExcluded = 0;

  bookings.forEach((booking) => {
    if (!countsInReports(booking)) {
      hostExcluded += 1;
      return;
    }
    if (isConvertedInquiry(booking, convertedInquiryIds)) {
      convertedExcluded += 1;
      return;
    }
    included.push(booking);
  });

  return { bookings: included, hostExcluded, convertedExcluded };
}

/* ---------------------------------------------------------
   Arrival-month attribution (Q-009 A)
--------------------------------------------------------- */

function dateKey(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function getArrivalMonthKey(booking) {
  const arrival = dateKey(booking?.startDate);
  return arrival ? arrival.slice(0, 7) : "";
}

/*
  A stay belongs to a date range when it arrives in it. Undated records
  only appear when no range is selected (All Time), in an "Undated" row,
  so monthly rows always add up to the totals.
*/
export function bookingArrivesInRange(booking, range = {}) {
  const arrival = dateKey(booking?.startDate);
  const { startDate, endDate } = range || {};
  if (!startDate && !endDate) return true;
  if (!arrival) return false;
  if (startDate && arrival < startDate) return false;
  if (endDate && arrival > endDate) return false;
  return true;
}

export const UNDATED_MONTH_KEY = "undated";

/* ---------------------------------------------------------
   Camper Days (Q-028 A)
--------------------------------------------------------- */

const CAMPER_DAY_INPUT_FIELDS = ["attendeeCount", "persons", "nights", "mealCount", "meals"];

/*
  The sheet's Camper Days figure is used until staff edit the guest count,
  nights or meals in the app; after that the figure is recalculated, unless
  staff typed a new Camper Days value after those edits.
*/
export function shouldUseStoredCamperDays(booking) {
  const edited = getStaffEditedFields(booking);
  const latestInputEdit = CAMPER_DAY_INPUT_FIELDS.map((field) => edited[field] || "")
    .filter(Boolean)
    .sort()
    .pop();
  if (!latestInputEdit) return true;
  return Boolean(edited.camperDays && edited.camperDays >= latestInputEdit);
}

/* ---------------------------------------------------------
   Where a record came from (Q-031 A)
--------------------------------------------------------- */

export const REPORT_SOURCES = Object.freeze([
  "Staff entered",
  "Website inquiry",
  "Master sheet",
  "Guest Group sheet",
  "Archive",
  "Older public form",
]);

export function getReportSourceLabel(booking) {
  const details = getBookingDetails(booking);
  if (isArchiveRecord(booking)) return "Archive";
  if (isStaffBookingRecord(booking)) {
    return String(details.sourceInquirySheet || "").trim() === "Guest Web Form"
      ? "Website inquiry"
      : "Staff entered";
  }
  if (isMasterRecord(booking)) return "Master sheet";
  if (isInquirySpreadsheetRecord(booking)) return "Guest Group sheet";
  return "Older public form";
}

/* ---------------------------------------------------------
   Retreat types (Q-030 A)
--------------------------------------------------------- */

// Create Booking's list is the official one.
export const OFFICIAL_RETREAT_TYPES = Object.freeze([
  "Church",
  "Church - Men",
  "Church - Women",
  "Church - Youth",
  "Church - Children",
  "Christian Organization",
  "Ministry",
  "Personal Retreat",
  "Personal Retreat - Family",
  "Personal Retreat - Women",
  "Personal Retreat - Men",
  "High School Students",
  "College Students",
  "Elementary Students",
  "InterVarsity Staff",
  "InterVarsity College Students",
  "InterVarsity Graduate Students",
  "InterVarsity Alumni",
  "Family Reunion",
  "Local Organization",
  "Family Camp",
  "Other",
]);

/*
  Shorthand seen in imported sheets, mapped only where the meaning is
  certain. Add the office's other shorthand here; anything not listed is
  reported under its own text, marked "(not mapped)", rather than guessed.
*/
export const RETREAT_TYPE_ALIASES = Object.freeze({
  pr: "Personal Retreat",
});

function normalizeTypeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*-\s*/g, " - ");
}

const OFFICIAL_BY_NORMALIZED = new Map(OFFICIAL_RETREAT_TYPES.map((type) => [normalizeTypeText(type), type]));

export function getOfficialRetreatType(value) {
  const original = String(value || "").trim();
  if (!original) return { type: "No Retreat Type", original: "", mapped: true };
  const normalized = normalizeTypeText(original);
  const official = OFFICIAL_BY_NORMALIZED.get(normalized) || RETREAT_TYPE_ALIASES[normalized];
  return official
    ? { type: official, original, mapped: true }
    : { type: `${original} (not mapped)`, original, mapped: false };
}

/* ---------------------------------------------------------
   Status summary labels (no booking-progress statuses)
--------------------------------------------------------- */

export function getReportStateLabel(booking) {
  return getBookingDisplayState(booking).label;
}

/* ---------------------------------------------------------
   CSV (AUDIT-048)
--------------------------------------------------------- */

export function roundReportNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return Number.isInteger(value) ? value : Math.round(value * 10) / 10;
}

/*
  Text that a spreadsheet program would run as a formula (=, +, -, @,
  or a leading tab/return) is prefixed with an apostrophe. Numbers are
  left as numbers.
*/
export function neutralizeCsvCell(value) {
  if (typeof value === "number") return roundReportNumber(value);
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function toCsv(sections) {
  const escape = (value) => {
    const text = String(neutralizeCsvCell(value) ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return sections
    .map((section) =>
      [
        escape(section.title),
        section.headers.map(escape).join(","),
        ...section.rows.map((row) => row.map(escape).join(",")),
      ].join("\n")
    )
    .join("\n\n");
}
