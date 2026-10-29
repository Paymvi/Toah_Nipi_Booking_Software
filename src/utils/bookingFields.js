/*
  Shared field readers and writers for booking objects.

  Master-imported bookings keep two copies of many facts: the top-level
  column and a copy inside rentalFormDetails (AUDIT-003). Every edit path
  writes the top-level copy, so it is always the newest; readers use it
  first and fall back to the detail copy only when it is blank.
*/

export function getBookingDetails(booking) {
  const details = booking?.rentalFormDetails;
  return details && typeof details === "object" && !Array.isArray(details)
    ? details
    : {};
}

export function isBlankFieldValue(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/*
  Top-level column → rentalFormDetails key, for facts the Master importer
  writes twice. Deposit-received is not listed: the column holds the
  sheet's free text while the detail copy only ever holds a date.
*/
export const DUPLICATED_FIELD_MAP = Object.freeze({
  organizationName: "organizationName",
  contactName: "contactName",
  email: "email",
  phone: "phone",
  startDate: "startDate",
  endDate: "endDate",
  retreatType: "retreatType",
  status: "status",
  attendeeCount: "approxTotalGuests",
  nights: "numberOfNights",
  mealCount: "numberOfMeals",
  deposit: "depositAmount",
  guestRate: "adultRateQuoted",
  minPayingGuests: "minimumGuarantee",
  maxPayingGuests: "maximumGuarantee",
  notes: "notes",
});

const DETAIL_TO_TOP_LEVEL = Object.freeze(
  Object.fromEntries(
    Object.entries(DUPLICATED_FIELD_MAP).map(([top, detail]) => [detail, top])
  )
);

// Reads a duplicated fact: top-level first, then the detail copy.
export function getDuplicatedField(booking, topLevelKey) {
  const topValue = booking?.[topLevelKey];
  if (!isBlankFieldValue(topValue)) return topValue;
  const detailKey = DUPLICATED_FIELD_MAP[topLevelKey] || topLevelKey;
  const detailValue = getBookingDetails(booking)[detailKey];
  return isBlankFieldValue(detailValue) ? "" : detailValue;
}

// Reads by detail key, preferring the top-level copy when one exists.
export function getDetailFieldPreferringTopLevel(booking, detailKey) {
  const topLevelKey = DETAIL_TO_TOP_LEVEL[detailKey];
  if (topLevelKey) {
    const topValue = booking?.[topLevelKey];
    if (!isBlankFieldValue(topValue)) return topValue;
  }
  const detailValue = getBookingDetails(booking)[detailKey];
  return isBlankFieldValue(detailValue) ? "" : detailValue;
}

/*
  Copies top-level values into their detail copies, but only on records
  that already carry the detail copy (Master imports), so records without
  rentalFormDetails are left exactly as they were.
*/
export function mirrorTopLevelIntoDetails(booking, topLevelKeys = Object.keys(DUPLICATED_FIELD_MAP)) {
  const details = booking?.rentalFormDetails;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return booking;
  }

  const nextDetails = { ...details };
  let changed = false;

  topLevelKeys.forEach((topLevelKey) => {
    const detailKey = DUPLICATED_FIELD_MAP[topLevelKey];
    if (!detailKey || !(detailKey in details)) return;
    const value = booking[topLevelKey] ?? "";
    if (nextDetails[detailKey] !== value) {
      nextDetails[detailKey] = value;
      changed = true;
    }
  });

  return changed ? { ...booking, rentalFormDetails: nextDetails } : booking;
}

/* ---------------------------------------------------------
   Guest counts (AUDIT-018, Q-029)

   Calculations use the first (lower) number of a range such as "40-50";
   displays keep the original text.
--------------------------------------------------------- */

export function parseGuestCountNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").replace(/,/g, "").trim();
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

export function getGuestCountNumber(value) {
  return parseGuestCountNumber(value) ?? 0;
}

export function getGuestCountText(booking) {
  const value = [booking?.attendeeCount, booking?.groupSize, booking?.persons].find(
    (candidate) => !isBlankFieldValue(candidate)
  );
  return value === undefined ? "" : String(value).trim();
}

/* ---------------------------------------------------------
   Field edit history (AUDIT-006, Q-002 A)

   rentalFormDetails.staffEditedFields maps a field name to the time staff
   last changed it in the app. Master re-imports leave those fields alone.
--------------------------------------------------------- */

export const STAFF_EDITED_FIELDS_KEY = "staffEditedFields";

function valuesDiffer(previousValue, nextValue) {
  const normalize = (value) =>
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value).trim();
  return normalize(previousValue) !== normalize(nextValue);
}

export function getStaffEditedFields(booking) {
  const value = getBookingDetails(booking)[STAFF_EDITED_FIELDS_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function isStaffEditedField(booking, fieldKey) {
  return Boolean(getStaffEditedFields(booking)[fieldKey]);
}

/*
  Records which of `fieldKeys` differ between the saved and the edited
  booking. `forceKeys` are recorded even without a value difference (for
  example, saving the Housing tab claims lodging for the app).
*/
export function recordStaffEdits(previousBooking, nextBooking, fieldKeys = [], options = {}) {
  const { forceKeys = [], now = new Date().toISOString() } = options;
  const changedKeys = fieldKeys.filter((key) =>
    valuesDiffer(previousBooking?.[key], nextBooking?.[key])
  );
  const keysToRecord = [...new Set([...changedKeys, ...forceKeys])];
  if (keysToRecord.length === 0) return nextBooking;

  const details = getBookingDetails(nextBooking);
  const edited = { ...getStaffEditedFields(nextBooking) };
  keysToRecord.forEach((key) => {
    edited[key] = now;
  });

  return {
    ...nextBooking,
    rentalFormDetails: { ...details, [STAFF_EDITED_FIELDS_KEY]: edited },
  };
}
