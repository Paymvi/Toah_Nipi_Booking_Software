// Value checks and formatting shared by the booking overview (Compact and Large) and the detail header.
import { readSpreadsheetCell } from "../../utils/spreadsheetUtils";

export function hasOverviewDisplayValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  return true;
}

export function getOverviewDisplayValue(...values) {
  for (const value of values) {
    if (hasOverviewDisplayValue(value)) {
      return value;
    }
  }

  return "";
}

export function getBookingOverviewScheduleRows(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) =>
    entry &&
    typeof entry === "object" &&
    Object.values(entry).some((fieldValue) =>
      hasBookingOverviewValue(fieldValue)
    )
  );
}

export function getBookingInitials(name) {
  return String(name || "TN")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

const OVERVIEW_EMPTY_TEXT_VALUES = new Set([
  "",
  "—",
  "no email provided",
  "no phone provided",
  "no contact name",
]);

export function hasBookingOverviewValue(value) {
  if (value === 0 || value === false) {
    return true;
  }

  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      hasBookingOverviewValue(item)
    );
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  const text = String(value).trim();

  if (!text) {
    return false;
  }

  return !OVERVIEW_EMPTY_TEXT_VALUES.has(
    text.toLowerCase()
  );
}

export function firstBookingOverviewValue(...values) {
  return (
    values.find((value) =>
      hasBookingOverviewValue(value)
    ) ?? ""
  );
}

export function getBookingRawValue(
  booking,
  possibleColumnNames
) {
  if (!booking?.rawSpreadsheetData) {
    return "";
  }

  return (
    readSpreadsheetCell(
      booking.rawSpreadsheetData,
      possibleColumnNames
    ) || ""
  );
}

export function formatBookingOverviewValue(value) {
  if (!hasBookingOverviewValue(value)) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) =>
        hasBookingOverviewValue(item)
      )
      .map((item) =>
        formatBookingOverviewValue(item)
      )
      .join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function formatBookingOverviewMoney(value) {
  if (!hasBookingOverviewValue(value)) {
    return "";
  }

  const text = String(value).trim();

  if (text.startsWith("$")) {
    return text;
  }

  const numberValue = Number(
    text.replace(/[$,\s]/g, "")
  );

  if (!Number.isFinite(numberValue)) {
    return text;
  }

  return numberValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function getBookingOverviewStatusClass(status) {
  const normalizedStatus = String(
    status || ""
  )
    .trim()
    .toLowerCase();

  if (
    normalizedStatus.includes("confirmed") ||
    normalizedStatus.includes("booked")
  ) {
    return "status-confirmed";
  }

  if (normalizedStatus.includes("contract")) {
    return "status-contract";
  }

  if (normalizedStatus.includes("cancel")) {
    return "status-cancelled";
  }

  if (normalizedStatus.includes("wait")) {
    return "status-waitlist";
  }

  if (
    normalizedStatus.includes("inquiry") ||
    normalizedStatus.includes("lead")
  ) {
    return "status-inquiry";
  }

  return "status-neutral";
}

export function parseBookingOverviewNumber(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const numeric = Number(
    text.replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

export function hasVisibleOverviewFields(fields = []) {
  return fields.some(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );
}

export function getBookingOverviewSourceType(booking) {
  return (
    booking.detectedImportType ||
    booking.sourceType ||
    "Booking"
  );
}

export function getBookingOverviewNights(booking, details) {
  return firstBookingOverviewValue(
    details.numberOfNights,
    booking.nights
  );
}

export function getBookingOverviewMailingAddress(booking, details) {
  return firstBookingOverviewValue(
    details.mailingAddress,
    booking.inquiryAddress,

    [
      booking.archiveAddress,
      booking.archiveCity,
      booking.archiveState,
      booking.archiveZip,
    ]
      .filter(Boolean)
      .join(", ")
  );
}
