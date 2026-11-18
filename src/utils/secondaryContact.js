import { readSpreadsheetCell } from "./spreadsheetUtils";

export function getSecondaryContact(booking) {
  const details = booking?.rentalFormDetails || {};
  const rawData = booking?.rawSpreadsheetData || {};

  /* Empty saved strings intentionally override older/imported values. */
  const readValue = (fieldName, columnNames) =>
    String(
      details[fieldName] ??
      booking?.[fieldName] ??
      readSpreadsheetCell(rawData, columnNames) ??
      ""
    ).trim();

  return {
    secondaryContactName: readValue("secondaryContactName", [
      "Secondary Contact Name",
      "Secondary Contact",
      "Secondary Name",
    ]),
    secondaryContactPhone: readValue("secondaryContactPhone", [
      "Secondary Contact Phone",
      "Secondary Phone Number",
      "Secondary Phone",
    ]),
    secondaryContactEmail: readValue("secondaryContactEmail", [
      "Secondary Contact Email",
      "Secondary Email Address",
      "Secondary Email",
    ]),
  };
}

export function formatSecondaryContactPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
