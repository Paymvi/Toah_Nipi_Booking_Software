import { LODGING_CALENDAR_GROUPS } from "../constants/lodgingConstants";
import {
  getBookingCalendarGroups,
  getBookingLodgingAssignments,
  getBookingLodgingDisplayText,
  getLegacyLodgingText,
} from "./lodgingUtils";
import { isHousingAuthoritative } from "./masterImportMerge";
import { masterImportUnknown } from "./masterImport";
import { getRecordKind, isActiveBooking, RECORD_KIND } from "./bookingClassification";
import { getLocalDate } from "./dateUtils";

/* =========================================================
   DASHBOARD HOME — OPERATIONAL HELPERS
========================================================= */

export function getDashboardHomeDay(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

export function getDashboardHomeBookingDate(value) {
  if (!value) {
    return null;
  }

  return getLocalDate(value);
}

export function isDashboardHomeSameDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) {
    return false;
  }

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

export function dashboardHomeBookingTouchesDate(booking, date) {
  const startDate = getDashboardHomeBookingDate(
    booking.startDate
  );

  if (!startDate) {
    return false;
  }

  const endDate =
    getDashboardHomeBookingDate(
      booking.endDate
    ) || startDate;

  return date >= startDate && date <= endDate;
}

// Cancelled, waitlisted, archive and host records are not active work.
export function isDashboardHomeInactiveBooking(booking) {
  return !isActiveBooking(booking);
}

export function dashboardHomeHasValue(value) {
  const text = String(value ?? "").trim();

  return text !== "" && !masterImportUnknown(text);
}

/*
  Records from the Inquiry Spreadsheet are inquiries: lodging and guest
  counts are not expected yet. Master and staff bookings are real bookings
  whatever their legacy status says (Q-007).
*/
export function isDashboardHomePlainInquiry(booking) {
  return getRecordKind(booking) === RECORD_KIND.INQUIRY;
}

/*
  Explicit zero nights (kept in sync with the dates by Create Booking,
  read from or calculated by Master imports) or a Day Use type means
  no overnight lodging.
*/
function isDashboardHomeDayUseBooking(booking) {
  const nightsText = String(
    booking?.nights ||
      booking?.rentalFormDetails
        ?.numberOfNights ||
      ""
  ).trim();

  if (
    /^\d+(?:\.\d+)?$/.test(nightsText) &&
    Number(nightsText) === 0
  ) {
    return true;
  }

  const retreatType = String(
    booking?.retreatType || ""
  )
    .trim()
    .toLowerCase();

  return (
    retreatType.includes("day use") ||
    retreatType.includes("day-use")
  );
}

export function getDashboardHomeGuestCount(booking) {
  const rawValue =
    booking?.attendeeCount ||
    booking?.persons ||
    "";

  const numericValue = Number(
    String(rawValue)
      .replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(numericValue)
    ? numericValue
    : 0;
}

// Shared lodging reader: Housing tab values once saved, else imported text.
export function getDashboardHomeHousingLabel(booking) {
  const text = getBookingLodgingDisplayText(booking);
  return text === "Unassigned" ? "Housing not assigned" : text;
}

export function getDashboardHomeBuildingTags(booking) {
  const groupIds = getBookingCalendarGroups(booking);

  if (groupIds.length > 0) {
    return LODGING_CALENDAR_GROUPS.filter((group) =>
      groupIds.includes(group.id)
    ).map((group) => ({ key: group.id, label: group.label }));
  }

  return [
    {
      key: "unassigned",
      label: "Unassigned",
    },
  ];
}

export function dashboardHomeBookingNeedsHousing(booking) {
  if (isDashboardHomeDayUseBooking(booking)) {
    return false;
  }

  /*
    roomName defaults to "Unassigned" on every staff booking, so the
    placeholder is dropped per value instead of matched in joined text.
  */
  const housingText = isHousingAuthoritative(booking)
    ? String(booking?.buildingsRooms || "").trim().toLowerCase()
    : getLegacyLodgingText(booking).toLowerCase();

  if (
    housingText.includes("no room") ||
    housingText.includes("day use") ||
    housingText.includes("day-use")
  ) {
    return false;
  }

  if (housingText) {
    return false;
  }

  // Lodging saved by the form or Housing tab only in rentalFormDetails.
  return getBookingLodgingAssignments(booking).length === 0;
}
