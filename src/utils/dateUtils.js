/*
dateUtils.js
-------------------------------------------------------------------------------
Shared date helper functions for the booking dashboard.

This file keeps date-related logic out of Dashboard.jsx so the dashboard page
stays smaller and easier to maintain.

This file handles:
- Formatting booking dates for display
- Formatting submitted-at dates
- Creating readable date ranges
- Calendar/month calculations
- Date range comparison for calendar events
- Converting Excel dates into YYYY-MM-DD strings
- Parsing flexible imported spreadsheet date text

Most booking dates are stored as:

  YYYY-MM-DD

Example:

  2026-06-15

When creating JavaScript Date objects from those strings, we append "T00:00:00"
so the browser treats the value as a local date instead of shifting it because
of timezone conversion.
-------------------------------------------------------------------------------
*/

// Formats a YYYY-MM-DD date string into a readable US date.
// Example: "2026-06-15" -> "6/15/2026"
export function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

// Formats a submittedAt timestamp into a readable US date.
// Used for full timestamps like "2026-06-15T14:30:00.000Z".
export function formatSubmittedDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

// Creates readable text for a booking date range.
// Examples: "6/15/2026 - 6/18/2026", "6/15/2026", or "No dates selected".
export function formatDateRange(startDate, endDate) {
  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  if (startDate) {
    return formatDate(startDate);
  }

  if (endDate) {
    return `Ends ${formatDate(endDate)}`;
  }

  return "No dates selected";
}

// Gets the number of days in a month.
// JavaScript month indexes start at 0, so January is 0 and December is 11.
export function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Converts a YYYY-MM-DD string into a local JavaScript Date object.
// Returns null if there is no date.
export function getLocalDate(dateString) {
  if (!dateString) {
    return null;
  }

  return new Date(`${dateString}T00:00:00`);
}

// Returns a new Date with a certain number of days added.
// This does not mutate the original date.
export function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

// Returns the number of days between two Date objects.
// Example: June 1 to June 4 returns 3.
export function daysBetween(startDate, endDate) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate - startDate) / oneDay);
}

// Returns the latest date from a list of Date objects.
// Used when clipping calendar events to the visible week or month.
export function maxDate(...dates) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

// Returns the earliest date from a list of Date objects.
// Used when clipping calendar events to the visible week or month.
export function minDate(...dates) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

// Checks whether two date ranges overlap.
export function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
}

// Converts an Excel date value into a normal YYYY-MM-DD string.
// Handles Date objects, Excel serial numbers, ISO strings, slash dates, and date-like text.
export function formatExcelDateValue(value) {
  if (!value) {
    return "";
  }

  // ExcelJS may give us a real JavaScript Date object.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // Excel sometimes stores dates as serial numbers.
  // Excel's date system starts around 1899-12-30.
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);

    return date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  // Handles already-normalized ISO dates like 2026-6-5 or 2026-06-05.
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Handles dates like 6/5/2026 or 06/05/26.
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (slashMatch) {
    let [, month, day, year] = slashMatch;

    // Converts 2-digit years like "26" into "2026".
    if (year.length === 2) {
      year = `20${year}`;
    }

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Final fallback for other date-like strings.
  const date = new Date(text);

  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "";
}

// Formats an imported spreadsheet date as a submittedAt timestamp.
// If the spreadsheet date is unusable, it falls back to the current date/time.
export function formatExcelSubmittedAt(value) {
  const dateOnly = formatExcelDateValue(value);

  if (!dateOnly) {
    return new Date().toISOString();
  }

  return `${dateOnly}T00:00:00`;
}

// Parses a flexible "Desired Dates" spreadsheet value into startDate, endDate,
// and desiredDatesText.
export function parseDesiredDateRange(value) {
  // If Excel gives us a real date or serial number, treat it as a one-day range.
  if (value instanceof Date || typeof value === "number") {
    const singleDate = formatExcelDateValue(value);

    return {
      startDate: singleDate,
      endDate: singleDate,
      desiredDatesText: singleDate,
    };
  }

  const desiredDateText = String(value || "").trim();

  // Empty desired date field.
  if (!desiredDateText) {
    return {
      startDate: "",
      endDate: "",
      desiredDatesText: "",
    };
  }

  // Finds date-looking values inside a larger text field.
  // Example: "Looking for 6/10/2026 through 6/14/2026"
  const dateMatches =
    desiredDateText.match(
      /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/g
    ) || [];

  const startDate = formatExcelDateValue(dateMatches[0]);
  const endDate = formatExcelDateValue(dateMatches[1]);

  return {
    startDate,
    endDate: endDate || startDate,
    desiredDatesText: desiredDateText,
  };
}