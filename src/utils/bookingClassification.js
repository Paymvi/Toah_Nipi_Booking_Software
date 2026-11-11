/*
  Shared booking classification (AUDIT-034).

  Booking progress (contracts, deposits, insurance, guest submissions) is
  tracked in the guest portal, not in the booking status column. This
  module answers only the questions every screen needs:

    - What kind of record is this? booking / inquiry / host / archive
    - Is it an exception? cancelled / waitlist

  A Master-sheet booking or a booking entered by staff is a real booking
  whatever its legacy status says ("Inquiry", "Contract Sent", "Imported").
  Records from the Guest Group Inquiry sheets stay inquiries. Each screen
  then decides deliberately which kinds and exceptions it includes; there is
  no single filter for every screen.
*/

import { mirrorTopLevelIntoDetails, recordStaffEdits } from "./bookingFields.js";

export const RECORD_KIND = Object.freeze({
  BOOKING: "booking",
  INQUIRY: "inquiry",
  HOST: "host",
  ARCHIVE: "archive",
});

export const BOOKING_EXCEPTION = Object.freeze({
  NONE: "",
  CANCELLED: "cancelled",
  WAITLIST: "waitlist",
});

function lowerText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getDetails(booking) {
  const details = booking?.rentalFormDetails;
  return details && typeof details === "object" && !Array.isArray(details)
    ? details
    : {};
}

// Same "no real value" set the Master importer uses.
export function isUnknownBookingText(value) {
  return /^(?:n\/?a|none|unknown|tbd|\?|[-–—])$/i.test(String(value ?? "").trim());
}

export function hasKnownBookingValue(value) {
  const text = String(value ?? "").trim();
  return text !== "" && !isUnknownBookingText(text);
}

function getSourceText(booking) {
  return [booking?.sourceType, booking?.detectedImportType, booking?.sourceSheet]
    .map(lowerText)
    .filter(Boolean)
    .join(" ");
}

export function isStaffBookingRecord(booking) {
  return (
    lowerText(booking?.sourceType) === "staff booking" ||
    lowerText(booking?.detectedImportType) === "staff booking"
  );
}

export function isMasterRecord(booking) {
  return /\bmaster\b/.test(getSourceText(booking));
}

export function isArchiveRecord(booking) {
  return (
    lowerText(booking?.sourceType) === "archive" ||
    lowerText(booking?.detectedImportType) === "archive" ||
    lowerText(booking?.status).includes("archive")
  );
}

// Records the Inquiry Spreadsheet lists: Guest Group Inquiry sheet imports.
export function isInquirySpreadsheetRecord(booking) {
  const sourceText = getSourceText(booking);
  return sourceText.includes("guest group") && sourceText.includes("inquir");
}

/*
  Hosting records (internal use of the property, not guest bookings).
  This is the one classification rule; the database mirrors it in
  public.is_hosting_booking (supabase/migrations/20261111000100).

    - organization name starts "Host:" / "Hosting:" (also "-", "–", "—"),
      the staff naming convention used by the Master sheets; or
    - retreat type is exactly "Host" or "Hosting". New hosting entries and
      conversions use retreat type "Hosting".

  "host" elsewhere in a name ("Hostel Youth", "Hosted by ...") does not
  count; isPossibleHostRecord lists those for staff review instead.
*/
export const HOSTING_RETREAT_TYPE = "Hosting";
const HOST_NAME_PREFIX = /^\s*host(?:ing)?\s*[:\-–—]\s*/i;
const HOST_RETREAT_TYPE = /^\s*host(?:ing)?\s*$/i;

export function isHostRecord(booking) {
  return (
    HOST_NAME_PREFIX.test(String(booking?.organizationName ?? "")) ||
    HOST_RETREAT_TYPE.test(String(booking?.retreatType ?? ""))
  );
}

// Not classified as hosting, but the name or retreat type mentions it.
export function isPossibleHostRecord(booking) {
  if (isHostRecord(booking)) return false;
  return /\bhost(?:s|ing|ed)?\b/i.test(
    `${booking?.organizationName ?? ""} | ${booking?.retreatType ?? ""}`
  );
}

/*
  Legacy records saved by the old public form ("Form" source, or no
  source) only count as inquiries while their status still says so.
*/
function isLegacyFormInquiry(booking) {
  const sourceType = lowerText(booking?.sourceType);
  if (sourceType && sourceType !== "form") return false;
  if (getDetails(booking).sourceInquiryId) return false;
  const status = lowerText(booking?.status);
  return status === "" || status === "inquiry";
}

export function getRecordKind(booking) {
  if (isHostRecord(booking)) return RECORD_KIND.HOST;
  if (isArchiveRecord(booking)) return RECORD_KIND.ARCHIVE;
  if (isStaffBookingRecord(booking) || isMasterRecord(booking)) {
    return RECORD_KIND.BOOKING;
  }
  if (isInquirySpreadsheetRecord(booking) || isLegacyFormInquiry(booking)) {
    return RECORD_KIND.INQUIRY;
  }
  return RECORD_KIND.BOOKING;
}

/*
  "Clearly cancelled": the status says so, or a real cancellation date
  exists and staff have not reinstated the booking since.
*/
export function isClearlyCancelled(booking) {
  if (lowerText(booking?.status).includes("cancel")) return true;
  return (
    hasKnownBookingValue(booking?.dateOfCancellation) &&
    !getDetails(booking).reinstatedAt
  );
}

export function isWaitlisted(booking) {
  return (
    lowerText(booking?.status).includes("wait") ||
    lowerText(booking?.waitlist) === "yes"
  );
}

export function getBookingException(booking) {
  if (isClearlyCancelled(booking)) return BOOKING_EXCEPTION.CANCELLED;
  if (isWaitlisted(booking)) return BOOKING_EXCEPTION.WAITLIST;
  return BOOKING_EXCEPTION.NONE;
}

/*
  Inquiry records that became bookings. The booking keeps the inquiry's
  id in rentalFormDetails.sourceInquiryId; the inquiry row stays in the
  table and is represented by the booking from then on.
*/
export function getConvertedInquiryIds(bookings = []) {
  const ids = new Set();
  bookings.forEach((booking) => {
    if (getRecordKind(booking) === RECORD_KIND.INQUIRY) return;
    const sourceInquiryId = String(getDetails(booking).sourceInquiryId ?? "").trim();
    if (sourceInquiryId) ids.add(sourceInquiryId);
  });
  return ids;
}

export function isConvertedInquiry(booking, convertedInquiryIds) {
  return (
    getRecordKind(booking) === RECORD_KIND.INQUIRY &&
    convertedInquiryIds.has(String(booking?.id ?? "").trim())
  );
}

/*
  One label per record for badges. Ordinary bookings read "Booked" —
  never "Unconfirmed" because of a legacy status default.
*/
export function getBookingDisplayState(booking) {
  const kind = getRecordKind(booking);
  const exception = getBookingException(booking);

  if (exception === BOOKING_EXCEPTION.CANCELLED) {
    return { key: "cancelled", label: "Cancelled", kind, exception };
  }
  if (kind === RECORD_KIND.HOST) return { key: "host", label: "Hosting", kind, exception };
  if (kind === RECORD_KIND.ARCHIVE) {
    return { key: "archive", label: "Archived visit", kind, exception };
  }
  if (exception === BOOKING_EXCEPTION.WAITLIST) {
    return { key: "waitlist", label: "Waitlist", kind, exception };
  }
  if (kind === RECORD_KIND.INQUIRY) {
    return { key: "inquiry", label: "Inquiry", kind, exception };
  }
  return { key: "booked", label: "Booked", kind, exception };
}

/* ---------------------------------------------------------
   Per-screen inclusion rules. Each is deliberate and named.
--------------------------------------------------------- */

/*
  Lodging occupancy (Q-004): everything except inquiries and clearly
  cancelled records. Waitlist, archive and hosting records still count:
  hosting is hidden from guest screens but its rooms are really in use.
  A record with no lodging assigned occupies nothing either way.
*/
export function countsForLodgingOccupancy(booking) {
  return (
    getRecordKind(booking) !== RECORD_KIND.INQUIRY &&
    !isClearlyCancelled(booking)
  );
}

// Reports (Q-008): everything except host records. Converted inquiries
// are removed separately so they are not counted twice.
export function countsInReports(booking) {
  return getRecordKind(booking) !== RECORD_KIND.HOST;
}

/*
  Calendars (Q-005): ordinary bookings and inquiries show by default.
  Cancelled, waitlisted and archived records each have a toggle. Hosting
  is never passed to the guest calendars; the Hosting calendars show it.
*/
export const CALENDAR_EXCEPTION_TOGGLES = Object.freeze([
  { key: "cancelled", label: "Cancelled" },
  { key: "waitlist", label: "Waitlist" },
  { key: "archive", label: "Archived visits" },
]);

export function getCalendarVisibilityKey(booking) {
  const { key } = getBookingDisplayState(booking);
  return key === "booked" || key === "inquiry" || key === "host" ? "" : key;
}

export function isVisibleOnCalendar(booking, shownExceptions = {}) {
  const key = getCalendarVisibilityKey(booking);
  return key === "" || Boolean(shownExceptions[key]);
}

// Dashboard home and Jobs: work belongs to bookings that are going ahead.
export function isActiveBooking(booking) {
  const kind = getRecordKind(booking);
  return (
    (kind === RECORD_KIND.BOOKING || kind === RECORD_KIND.INQUIRY) &&
    getBookingException(booking) === BOOKING_EXCEPTION.NONE
  );
}

/*
  The classification control that replaces the old progress-status
  dropdowns. Progress lives in the portal; staff only mark exceptions.
*/
export const BOOKING_CLASSIFICATION_OPTIONS = Object.freeze([
  { value: "booked", label: "Booked" },
  { value: "waitlist", label: "Waitlist" },
  { value: "cancelled", label: "Cancelled" },
]);

// Inquiry records use the same choices with inquiry wording.
export const INQUIRY_CLASSIFICATION_OPTIONS = Object.freeze([
  { value: "booked", label: "Open inquiry" },
  { value: "waitlist", label: "Waitlist" },
  { value: "cancelled", label: "Declined / cancelled" },
]);

export function getBookingClassificationOptions(booking) {
  if (isArchiveRecord(booking)) {
    return [{ value: "archive", label: "Archived visit (read-only)" }];
  }
  return getRecordKind(booking) === RECORD_KIND.INQUIRY
    ? INQUIRY_CLASSIFICATION_OPTIONS
    : BOOKING_CLASSIFICATION_OPTIONS;
}

export function getBookingClassificationValue(booking) {
  if (isArchiveRecord(booking)) return "archive";
  const exception = getBookingException(booking);
  return exception || "booked";
}

/*
  Applies a classification choice. Only a real change writes status or
  waitlist, so legacy values ("Contract Sent", "Inquiry") are never
  rewritten just because a form was saved.
*/
export function applyBookingClassification(booking, nextValue) {
  const currentValue = getBookingClassificationValue(booking);
  if (!nextValue || nextValue === currentValue || currentValue === "archive") {
    return booking;
  }
  if (nextValue === "cancelled") {
    const details = { ...getDetails(booking) };
    delete details.reinstatedAt;
    return {
      ...booking,
      status: "Cancelled",
      waitlist: "No",
      rentalFormDetails: booking.rentalFormDetails ? details : booking.rentalFormDetails,
    };
  }
  if (nextValue === "waitlist") {
    return { ...booking, status: "Waitlist", waitlist: "Yes" };
  }
  /*
    Back to an ordinary booking. The cancellation date and reason stay as
    history; reinstatedAt records that staff reversed it.
  */
  const reinstating = currentValue === "cancelled";
  return {
    ...booking,
    status: getRecordKind(booking) === RECORD_KIND.INQUIRY ? "Inquiry" : "Confirmed",
    waitlist: "No",
    rentalFormDetails: reinstating
      ? { ...getDetails(booking), reinstatedAt: new Date().toISOString() }
      : booking.rentalFormDetails,
  };
}

/* ---------------------------------------------------------
   Booking <-> Hosting conversion
   The only way a record changes between booking and hosting. The id,
   notes, lodging, portal history and every other field stay; only the
   two classifying fields change, and each conversion is recorded in
   rentalFormDetails.hostingConversions (like reinstatedAt). The database
   drops a hosting record's guest portal link in the same write.
--------------------------------------------------------- */

const CLASSIFYING_FIELDS = ["organizationName", "retreatType"];

export function convertRecordKind(booking, toHosting, { now = new Date().toISOString() } = {}) {
  if (isHostRecord(booking) === Boolean(toHosting)) return booking;

  const details = getDetails(booking);
  const history = Array.isArray(details.hostingConversions) ? details.hostingConversions : [];
  let next;

  if (toHosting) {
    next = {
      ...booking,
      retreatType: HOSTING_RETREAT_TYPE,
      portalToken: "",
      rentalFormDetails: {
        ...details,
        hostingConversions: [
          ...history,
          { to: "hosting", at: now, previousRetreatType: String(booking?.retreatType ?? "") },
        ],
      },
    };
  } else {
    const lastToHosting = [...history].reverse().find((entry) => entry?.to === "hosting");
    const previousType = String(lastToHosting?.previousRetreatType ?? "");
    const currentType = String(booking?.retreatType ?? "");
    const name = String(booking?.organizationName ?? "");
    const strippedName = name.replace(HOST_NAME_PREFIX, "").trim();

    next = {
      ...booking,
      organizationName: HOST_NAME_PREFIX.test(name) ? strippedName || "Unnamed Organization" : name,
      retreatType: HOST_RETREAT_TYPE.test(currentType)
        ? (HOST_RETREAT_TYPE.test(previousType) ? "" : previousType)
        : currentType,
      rentalFormDetails: {
        ...details,
        hostingConversions: [...history, { to: "booking", at: now }],
      },
    };
  }

  // Duplicated detail copies follow, and re-imports leave the change alone.
  next = mirrorTopLevelIntoDetails(next, CLASSIFYING_FIELDS);
  return recordStaffEdits(booking, next, CLASSIFYING_FIELDS, { now });
}

/*
  Older copies (a backup, a re-imported sheet row) never flip a record
  between booking and hosting: the current record's classifying fields
  win. Returns `incoming` unchanged when the kinds already agree.
*/
export function keepRecordClassification(incoming, current) {
  if (!incoming || !current || isHostRecord(incoming) === isHostRecord(current)) {
    return incoming;
  }
  const next = { ...incoming };
  CLASSIFYING_FIELDS.forEach((field) => {
    next[field] = current[field];
  });
  return mirrorTopLevelIntoDetails(next, CLASSIFYING_FIELDS);
}
