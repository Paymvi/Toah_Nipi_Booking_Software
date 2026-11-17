/*
  Inquiry pipeline rules: which records the pipeline shows and which column
  each one is in. Moved unchanged from src/pages/InquiryPipeline.jsx, because
  Dashboard.jsx also uses getInquiryPipelineColumnKey() for its sidebar badge.
*/

export function getRentalFormDetails(booking) {
  if (
    booking?.rentalFormDetails &&
    typeof booking.rentalFormDetails === "object" &&
    !Array.isArray(booking.rentalFormDetails)
  ) {
    return booking.rentalFormDetails;
  }

  return {};
}

export function isBlankBookingValue(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();

  return (
    !text ||
    text === "n/a" ||
    text === "na" ||
    text === "—" ||
    text === "no email provided" ||
    text === "no phone provided" ||
    text === "no contact name" ||
    text === "unnamed organization" ||
    text === "unnamed group" ||
    text === "unassigned"
  );
}

export function getSourceSearchText(booking) {
  return [
    booking?.sourceType,
    booking?.detectedImportType,
    booking?.sourceSheet,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function isStaffBookingRecord(booking) {
  const sourceType = String(booking?.sourceType || "")
    .trim()
    .toLowerCase();

  const detectedImportType = String(booking?.detectedImportType || "")
    .trim()
    .toLowerCase();

  return (
    sourceType === "staff booking" ||
    detectedImportType === "staff booking"
  );
}

function isMasterOrArchiveRecord(booking) {
  const sourceText = getSourceSearchText(booking);

  return (
    sourceText.includes("master") ||
    sourceText.includes("archive")
  );
}

function isPipelineEligibleRecord(booking) {
  if (!booking || isMasterOrArchiveRecord(booking)) {
    return false;
  }

  const sourceText = getSourceSearchText(booking);
  const statusText = String(booking.status || "").toLowerCase();
  const waitlistText = String(booking.waitlist || "").toLowerCase();
  const details = getRentalFormDetails(booking);

  if (isStaffBookingRecord(booking)) {
    return true;
  }

  if (
    sourceText.includes("form") ||
    sourceText.includes("inquiry") ||
    sourceText.includes("waitlist")
  ) {
    return true;
  }

  if (details.sourceInquiryId) {
    return true;
  }

  if (
    statusText.includes("inquiry") ||
    statusText.includes("contract") ||
    statusText.includes("confirm") ||
    statusText.includes("booked") ||
    statusText.includes("wait") ||
    statusText.includes("cancel") ||
    waitlistText === "yes"
  ) {
    return true;
  }

  return false;
}

export function getEstimatedGuestCount(booking) {
  const details = getRentalFormDetails(booking);

  const directValues = [
    booking.attendeeCount,
    booking.groupSize,
    details.approxTotalGuests,
    details.sourceInquiryEstimatedSize,
  ];

  const directValue = directValues.find(
    (value) => !isBlankBookingValue(value)
  );

  if (directValue !== undefined) {
    return String(directValue).trim();
  }

  const approxAdults = Number(details.approxAdultGuests || 0);
  const approxChildren = Number(details.approxChildrenGuests || 0);

  if (approxAdults > 0 || approxChildren > 0) {
    return String(approxAdults + approxChildren);
  }

  const actualAdults = Number(details.actualAdultGuests || 0);
  const actualChildren = Number(details.actualChildrenGuests || 0);

  if (actualAdults > 0 || actualChildren > 0) {
    return String(actualAdults + actualChildren);
  }

  return "";
}

/* =========================================================
   CURRENT-SYSTEM QUALITY CHECKS

   These are only the things staff actually needs before an
   inquiry can move forward. Housing is intentionally NOT
   required here anymore.
========================================================= */

export function getBookingQualityIssues(booking) {
  const issues = [];
  const details = getRentalFormDetails(booking);

  const hasRequestedDates =
    !isBlankBookingValue(booking.startDate) ||
    !isBlankBookingValue(booking.desiredDatesText) ||
    !isBlankBookingValue(details.sourceInquiryDesiredDatesText);

  if (isBlankBookingValue(booking.organizationName)) {
    issues.push("Missing organization");
  }

  if (!hasRequestedDates) {
    issues.push("Missing dates");
  }

  if (isBlankBookingValue(booking.contactName)) {
    issues.push("Missing contact");
  }

  if (
    isBlankBookingValue(booking.email) &&
    isBlankBookingValue(booking.phone)
  ) {
    issues.push("Missing email / phone");
  }

  if (isBlankBookingValue(getEstimatedGuestCount(booking))) {
    issues.push("Missing guest count");
  }

  if (isBlankBookingValue(booking.retreatType)) {
    issues.push("Missing retreat type");
  }

  return issues;
}

/* =========================================================
   PIPELINE STAGE

   Current booking workflow priority:
   1. Cancelled
   2. Waitlist
   3. Contract returned -> Confirmed
   4. Contract sent -> Contract Sent
   5. Missing core inquiry data -> Needs Review
   6. Otherwise -> New Inquiry
========================================================= */

export function getInquiryPipelineColumnKey(booking) {
  if (!isPipelineEligibleRecord(booking)) {
    return "excluded";
  }

  const details = getRentalFormDetails(booking);
  const status = String(booking.status || "").toLowerCase();
  const waitlist = String(booking.waitlist || "").toLowerCase();
  const disposition = String(
    booking.inquiryDisposition ||
      details.sourceInquiryDisposition ||
      ""
  ).toLowerCase();

  if (
    !isBlankBookingValue(booking.dateOfCancellation) ||
    status.includes("cancel")
  ) {
    return "cancelled";
  }

  if (
    waitlist === "yes" ||
    status.includes("wait") ||
    disposition.includes("waitlist")
  ) {
    return "waitlist";
  }

  if (
    !isBlankBookingValue(details.contractReturnedDate) ||
    status.includes("confirm") ||
    status.includes("booked")
  ) {
    return "confirmed";
  }

  if (
    !isBlankBookingValue(details.contractSentDate) ||
    status.includes("contract")
  ) {
    return "contractSent";
  }

  if (getBookingQualityIssues(booking).length > 0) {
    return "needsReview";
  }

  return "newInquiry";
}

/* =========================================================
   LIST-LEVEL PIPELINE DATA

   This is also exported so Dashboard.jsx can use the exact
   same de-duplicated record set for its sidebar badge.
========================================================= */

export function getInquiryPipelineRecords(inquiryBookings = []) {
  const eligibleRecords = inquiryBookings.filter(
    isPipelineEligibleRecord
  );

  const convertedInquiryIds = new Set(
    eligibleRecords
      .filter(isStaffBookingRecord)
      .map((booking) =>
        String(
          getRentalFormDetails(booking).sourceInquiryId ||
            ""
        ).trim()
      )
      .filter(Boolean)
  );

  const records = eligibleRecords.filter((booking) => {
    if (isStaffBookingRecord(booking)) {
      return true;
    }

    const bookingId = String(booking.id || "").trim();

    return !(
      bookingId &&
      convertedInquiryIds.has(bookingId)
    );
  });

  return {
    records,
    convertedInquiryIds,
    excludedMasterArchiveCount:
      inquiryBookings.length - eligibleRecords.length,
    hiddenConvertedInquiryCount:
      eligibleRecords.length - records.length,
  };
}
