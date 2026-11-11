/*
  Read-only notes for the Booking Overview built from older fields
  (free-text columns, spreadsheet cells, inquiry history) that the newer
  structured sections do not show. Nothing here is ever saved: the Overview
  shows these beside the current notes, so editing notes cannot duplicate
  or erase them.
*/

import { buildActivitiesSummary } from "../services/bookingMapping.js";
import { cleanExcelCellValue } from "./spreadsheetUtils.js";
import { getBookingDetails } from "./bookingFields.js";

const PLACEHOLDER_TEXT = new Set([
  "", "-", "—", "–", "?", "n/a", "na", "null", "undefined", "[object object]",
]);

function normalize(text) {
  return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// True when `text` adds nothing to `currentText` (already shown there).
export function isNoteTextShown(text, currentText) {
  const needle = normalize(text);
  return !needle || normalize(currentText).includes(needle);
}

// Any stored value to readable text; objects never show as JSON.
function legacyValueToText(value) {
  const cell = cleanExcelCellValue(value);
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  }
  if (Array.isArray(cell)) {
    return cell.map(legacyValueToText).filter(Boolean).join("\n");
  }
  if (cell && typeof cell === "object") {
    return Object.entries(cell)
      .filter(([key]) => !/^(id|.*Id)$/.test(key))
      .map(([key, item]) => {
        const text = legacyValueToText(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  const text = String(cell ?? "").replace(/\r\n?/g, "\n").trim();
  return PLACEHOLDER_TEXT.has(text.toLowerCase()) ? "" : text;
}

// Same header matching as the Master importer (case, spaces and symbols ignored).
function readRawCell(booking, aliases) {
  const row = booking?.rawSpreadsheetData;
  if (!row || typeof row !== "object") return "";
  const key = (header) => String(header).toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const alias of aliases) {
    const header = Object.keys(row).find((name) => key(name) === key(alias));
    const text = header ? legacyValueToText(row[header]) : "";
    if (text) return text;
  }
  return "";
}

/*
  Keeps texts not already shown in `currentText`, dropping exact or
  contained repeats among themselves. Returns one note or none.
*/
function buildNote(label, candidates, currentText) {
  const kept = [];
  candidates.map(legacyValueToText).forEach((text) => {
    if (isNoteTextShown(text, currentText)) return;
    if (kept.some((existing) => isNoteTextShown(text, existing))) return;
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (isNoteTextShown(kept[index], text)) kept.splice(index, 1);
    }
    kept.push(text);
  });
  return kept.length ? [{ label, text: kept.join("\n\n") }] : [];
}

// The meal summary the Overview already draws as a schedule table.
function isStructuredMealSummary(text) {
  return /Total meals:\s*\d+/i.test(text) ||
    /(?:^|;)\s*[A-Za-z]{3},\s[A-Za-z]{3}\s\d{1,2},\s\d{4}\s*:/.test(text);
}

/*
  Create Booking writes `schedule` as arrival/departure plus the meal
  summary; only other text (spreadsheet Schedule columns) is legacy.
*/
function getLegacyScheduleText(booking) {
  const meals = normalize(booking?.meals);
  return legacyValueToText(booking?.schedule)
    .split("\n")
    .filter((line) => {
      const text = normalize(line);
      return text && !/^(arrival|departure):/.test(text) &&
        text !== meals && !isStructuredMealSummary(line);
    })
    .join("\n");
}

// Status text that says more than a date or yes/no (e.g. "Rec'd 3/2, check #1043").
function hasDetailBeyondDate(text) {
  return /[a-z0-9]/i.test(
    String(text)
      .replace(/\b\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, "")
      .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b\d{1,4}(?:st|nd|rd|th)?\b/gi, "")
      .replace(/\b(?:yes|no|y|n|x|done|sent|rec'?d|received|returned|signed|on)\b/gi, "")
  );
}

// Dates the app writes itself ("2026-05-01 - 2026-05-03") are not requests.
function isAppDateRangeText(text) {
  return /^\d{4}-\d{2}-\d{2}(?:\s*-\s*\d{4}-\d{2}-\d{2})?$/.test(text);
}

export function getLegacyBookingNotes(booking) {
  const details = getBookingDetails(booking);
  const mealsText = legacyValueToText(booking?.meals);
  const snack = readRawCell(booking, ["Snack for arrival?"]);

  const meals = buildNote(
    "Legacy meal information",
    [
      isStructuredMealSummary(mealsText) ? "" : mealsText,
      details.importedMealText,
      readRawCell(booking, ["Meals", "Meal Plan"]),
      snack ? `Snack for arrival: ${snack}` : "",
    ],
    [details.mealNotes, booking?.needToKnow].map(legacyValueToText).join("\n")
  );

  const structuredActivities = Array.isArray(details.activities)
    ? details.activities
    : Array.isArray(booking?.activities) ? booking.activities : [];
  const activitiesText = typeof booking?.activities === "string" ? booking.activities : "";
  const currentActivityText = [
    legacyValueToText(details.activityNotes),
    buildActivitiesSummary(structuredActivities),
  ].join("\n");
  const activityNote = buildNote(
    "Legacy activity information",
    [
      normalize(activitiesText) === normalize(buildActivitiesSummary(structuredActivities))
        ? ""
        : activitiesText,
      readRawCell(booking, ["Activities", "Schedule/Activities"]),
    ],
    currentActivityText
  );
  const scheduleNote = buildNote(
    "Legacy schedule information",
    [getLegacyScheduleText(booking), readRawCell(booking, ["Schedule"])],
    [currentActivityText, ...activityNote.map((note) => note.text)].join("\n")
  );

  const statusNote = (label, statusText, dateValue) =>
    dateValue && hasDetailBeyondDate(legacyValueToText(statusText))
      ? buildNote(label, [statusText], "")
      : [];
  const requestedDates = [details.sourceInquiryDesiredDatesText, booking?.desiredDatesText]
    .map(legacyValueToText)
    .filter((text) => !isAppDateRangeText(text));
  const notesText = legacyValueToText(booking?.notes);

  const additional = [
    ...buildNote("Originally requested dates", requestedDates, notesText),
    ...buildNote("Legacy promo code", [booking?.promoCode], notesText),
    ...statusNote("Legacy deposit information", details.importedDepositStatus, details.depositReceivedDate),
    ...statusNote("Legacy contract sent information", details.importedContractSentStatus, details.contractSentDate),
    ...statusNote("Legacy contract returned information", details.importedContractReturnedStatus, details.contractReturnedDate),
  ];

  return { meals, activities: [...activityNote, ...scheduleNote], additional };
}
