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
  Internal hosting records. Staff name them "Host: ..." (Portal Admin has
  always excluded that prefix); "Hosting: ..." and a retreat type of
  exactly "Host"/"Hosting" are treated the same. "host" elsewhere in a
  name (for example "Hostel Youth") does not count.
*/
export function isHostRecord(booking) {
  const organizationName = String(booking?.organizationName ?? "").trim();
  return (
    /^host(?:ing)?\s*[:\-–—]/i.test(organizationName) ||
    /^host(?:ing)?$/i.test(String(booking?.retreatType ?? "").trim())
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
  if (kind === RECORD_KIND.HOST) return { key: "host", label: "Host", kind, exception };
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

// Lodging occupancy (Q-004): everything except hosts, inquiries, and
// clearly cancelled bookings. Waitlist and archive records still count.
export function countsForLodgingOccupancy(booking) {
  const kind = getRecordKind(booking);
  return (
    kind !== RECORD_KIND.HOST &&
    kind !== RECORD_KIND.INQUIRY &&
    !isClearlyCancelled(booking)
  );
}

// Reports (Q-008): everything except host records. Converted inquiries
// are removed separately so they are not counted twice.
export function countsInReports(booking) {
  return getRecordKind(booking) !== RECORD_KIND.HOST;
}

/*
  Main Calendar (Q-005): ordinary bookings and inquiries show by default.
  Cancelled, waitlisted, archived and host records each have a toggle.
*/
export const CALENDAR_EXCEPTION_TOGGLES = Object.freeze([
  { key: "cancelled", label: "Cancelled" },
  { key: "waitlist", label: "Waitlist" },
  { key: "archive", label: "Archived visits" },
  { key: "host", label: "Host records" },
]);

export function getCalendarVisibilityKey(booking) {
  const { key } = getBookingDisplayState(booking);
  return key === "booked" || key === "inquiry" ? "" : key;
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
