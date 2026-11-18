import { useEffect, useMemo, useState } from "react";

import {
  FaInfoCircle,
  FaRegStar,
  FaStar,
  FaTable,
  FaSortAmountDown
} from "react-icons/fa";

import {
  SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
  SPREADSHEET_2026_STANDARD_LABELS,
  SPREADSHEET_SHARED_STANDARD_LABELS,
  SPREADSHEET_2025_RAW_COLUMNS,
  SPREADSHEET_2026_RAW_COLUMNS,
  SPREADSHEET_SHARED_RAW_COLUMNS,
} from "../constants/dashboardConstants";

import {
  formatSubmittedDate,
  formatDateRange,
  getLocalDate,
  getBookingInquiryDateValue,
} from "../utils/dateUtils";




function getBookingInputMethod(booking) {
  const sourceType = String(booking.sourceType || "Form").trim();
  const detectedImportType = String(booking.detectedImportType || "").trim();

  if (!sourceType || sourceType === "Form") {
    return "Public Form";
  }

  if (sourceType === "2027 Inquiry") {
    return "Imported - 2027 Inquiry";
  }

  if (sourceType === "Master 2026") {
    return "Imported - Master 2026";
  }

  if (sourceType === "Master") {
    return "Imported - Master";
  }

  if (detectedImportType) {
    return `Imported - ${detectedImportType}`;
  }

  return `Imported - ${sourceType}`;
}

function getBookingSourceSheetLabel(booking) {
  const sourceSheet = String(booking.sourceSheet || "").trim();
  const sourceType = String(booking.sourceType || "").trim();

  if (sourceSheet) {
    return sourceSheet;
  }

  if (sourceType === "Staff Booking") {
    return "Staff Booking Form / No Sheet";
  }

  return "Public Form / No Sheet";
}

function getSpreadsheetDisplayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const displayValue = String(value).trim();

  if (
    displayValue.toLowerCase() === "no email provided" ||
    displayValue.toLowerCase() === "no phone provided"
  ) {
    return "N/A";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return displayValue;
}

function getSpreadsheetDateRangeDisplay(startDate, endDate) {
  if (!startDate && !endDate) {
    return "N/A";
  }

  const formattedDateRange = formatDateRange(startDate, endDate);
  const cleanValue = String(formattedDateRange || "").trim();

  if (
    !cleanValue ||
    cleanValue === "—" ||
    cleanValue.toLowerCase() === "no date provided" ||
    cleanValue.toLowerCase() === "no dates provided" ||
    cleanValue.toLowerCase() === "invalid date"
  ) {
    return "N/A";
  }

  return cleanValue;
}

function getSpreadsheetSourceClass(booking) {
  const sourceType = String(booking.sourceType || "Form").toLowerCase();

  if (
    sourceType.includes("form") ||
    sourceType.includes("staff booking")
  ) {
    return "source-form";
  }

  if (sourceType.includes("2027")) {
    return "source-inquiry-2027";
  }

  if (sourceType.includes("2026")) {
    return "source-master-2026";
  }

  if (sourceType.includes("master")) {
    return "source-master";
  }

  if (sourceType.includes("waitlist")) {
    return "source-waitlist";
  }

  return "source-imported";
}

function getSpreadsheetStatusClass(status) {
  const normalizedStatus = String(status || "").toLowerCase();

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

  if (normalizedStatus.includes("import")) {
    return "status-imported";
  }

  return "status-inquiry";
}

function getSpreadsheetWaitlistClass(waitlist) {
  return String(waitlist || "").toLowerCase() === "yes"
    ? "waitlist-yes"
    : "waitlist-no";
}

function getSpreadsheetRetreatTypeClass(retreatType) {
  const normalizedType = String(retreatType || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and");

  if (!normalizedType || normalizedType === "n/a" || normalizedType === "—") {
    return "retreat-type-other";
  }

  if (normalizedType === "pr" || normalizedType.includes("personal retreat")) {
    return "retreat-type-pr";
  }

  if (normalizedType.includes("men")) {
    return "retreat-type-men";
  }

  if (normalizedType.includes("women")) {
    return "retreat-type-women";
  }

  if (
    normalizedType.includes("student") ||
    normalizedType.includes("youth") ||
    normalizedType.includes("college") ||
    normalizedType.includes("hs ") ||
    normalizedType.includes("high school") ||
    normalizedType.includes("middle school")
  ) {
    return "retreat-type-students-youth";
  }

  if (normalizedType.includes("family") || normalizedType.includes("families")) {
    return "retreat-type-families";
  }

  if (normalizedType.includes("adult")) {
    return "retreat-type-adults";
  }

  if (
    normalizedType.includes("staff") ||
    normalizedType.includes("leader") ||
    normalizedType.includes("leadership")
  ) {
    return "retreat-type-staff-leaders";
  }

  if (
    normalizedType.includes("pastor") ||
    normalizedType.includes("elder") ||
    normalizedType.includes("clergy")
  ) {
    return "retreat-type-pastors-elders";
  }

  if (
    normalizedType.includes("friend") ||
    normalizedType.includes("host")
  ) {
    return "retreat-type-friends-hosts";
  }

  if (
    normalizedType.includes("event") ||
    normalizedType.includes("wedding") ||
    normalizedType.includes("conference")
  ) {
    return "retreat-type-events";
  }

  if (normalizedType.includes("day use") || normalizedType.includes("day-use")) {
    return "retreat-type-day-use";
  }

  return "retreat-type-other";
}

const SPREADSHEET_QUICK_SORT_OPTIONS = [
  {
    value: "standard:Start Date|asc",
    label: "Retreat date: Oldest first",
  },
  {
    value: "standard:Start Date|desc",
    label: "Retreat date: Newest first",
  },
  {
    value: "standard:Submitted|asc",
    label: "Entry added: Oldest first",
  },
  {
    value: "standard:Submitted|desc",
    label: "Entry added: Most recent first",
  },
  {
    value: "standard:Organization|asc",
    label: "Organization: A to Z",
  },
  {
    value: "standard:Guest Count|asc",
    label: "Guest count: Smallest first",
  },
  {
    value: "standard:Guest Count|desc",
    label: "Guest count: Largest first",
  }
];

const MAPPED_MASTER_RAW_COLUMNS = new Set([
  // =========================================================
  // DATES
  // =========================================================
  "Arrival Date",
  "Departure Date",
  "Start Date",
  "End Date",
  "Check In",
  "Check-in",
  "Check Out",
  "Check-out",

  // =========================================================
  // GROUP
  // =========================================================
  "Guest Group Name",
  "Group Name",
  "Organization",
  "name",
  "Name",

  "Guest Group Type",
  "Retreat Type",
  "Type",

  "Returning (R) or New (N)",
  "Returning or New",

  // =========================================================
  // CONTACT
  // =========================================================
  "Contact Person",
  "Group Leader/Contact Person",
  "Group Leader",

  "Contact Person Cell #",
  "Contact Person Cell",
  "Phone",
  "Phone Number",
  "Group Leader #",

  "Contact Person Email",
  "Email",
  "Email Address",

  // =========================================================
  // GUEST COUNTS
  // =========================================================
  "Total # of Guests",
  "Actual Number of Guests",
  "Actual # of Guests",
  "Estimated # of Guests",
  "Estimated Number of Guests",
  "# of Guests",
  "Size",
  "Group Size",

  // =========================================================
  // HOUSING / PROGRAM
  // =========================================================
  "Buildings/Rooms",
  "Buildings",
  "Rooms",

  "Meals",

  "Food Allergies",
  "Allergies",

  "Need to know",
  "Need To Know",

  "Linen Sets",

  "Activities",
  "Schedule/Activities",
  "Schedule",

  // =========================================================
  // BOOKING WORKFLOW
  // =========================================================
  "Confirmed or Unconfirmed",
  "Confirmed/Unconfirmed",
  "Confirmation Status",
  "Status",

  "Stage of Group",

  "Min. Number of Paying Guests",
  "Minimum Number of Paying Guests",

  "Max. Number of Paying Guests",
  "Maximum Number of Paying Guests",

  "Guest Rate",
  "Adult Guest Rate",

  "Exp. Minimum Revenue",
  "Exp. Minimum Revenue for Lodging/Meals",
  "Expected Minimum Revenue",
  "Expected Minimum Revenue for Lodging/Meals",

  "Invoice for Lodging/Meals",
  "Invoice for Lodging/Meals (does not include linens's fees or other service fees)",

  "Deposit",
  "Deposit Received",

  "$250 Deposit for 2027 Rec'd?",
  "$250 Deposit for 2027 Received?",

  "Date of Cancellation",
  "Reason for Cancellation",

  "Vacancy filled by another group?",
  "Vacancy Filled By Another Group?",

  // =========================================================
  // CALCULATED / FINANCIAL
  // =========================================================
  "#Persons",
  "Persons",

  "#Nights",
  "# of Nights",
  "Nights",

  "#Meals",
  "Meals Count",

  "Camper Days (nightsX0.4 + mealsX0.2)",
  "Camper Days",

  "Usage Fee",

  "$ Lodging",
  "Lodging",

  "$ Food",
  "Food",

  "$ Misc",
  "$ Misc.",
  "Misc",

  "Monthly Sum of Projected Income",
]);

function getRawSpreadsheetColumns(bookings) {
  const columns = new Set();

  bookings.forEach((booking) => {
    if (
      !booking.rawSpreadsheetData ||
      typeof booking.rawSpreadsheetData !== "object"
    ) {
      return;
    }

    Object.keys(booking.rawSpreadsheetData).forEach((key) => {
      if (
        key === "sourceSheet" ||
        key === "sourceRowNumber" ||
        key === "detectedImportType"
      ) {
        return;
      }

      /*
        Don't create an "Original:" column when that Excel field
        has already been normalized into one of our standard
        booking columns.
      */
      if (MAPPED_MASTER_RAW_COLUMNS.has(key)) {
        return;
      }

      columns.add(key);
    });
  });

  return Array.from(columns);
}

const bookingSpreadsheetColumns = [
  {
    label: "Organization",
    className: "spreadsheet-sticky-column",
    render: (booking, openBookingDetail) => (
      <button
        className="table-link spreadsheet-organization-button"
        type="button"
        onClick={() => openBookingDetail(booking)}
        data-tutorial-target="spreadsheet-open-booking"
      >
        {booking.organizationName || "Unnamed Organization"}
      </button>
    ),
  },
  {
    label: "Input Method",
    render: (booking) => (
      <span
        className={`spreadsheet-source-pill ${getSpreadsheetSourceClass(booking)}`}
      >
        {getBookingInputMethod(booking)}
      </span>
    ),
  },
  {
    label: "Source Sheet",
    value: (booking) => getBookingSourceSheetLabel(booking),
  },
  {
    label: "Source Row",
    value: (booking) => booking.sourceRowNumber,
  },
    {
    // The real inquiry date; Master and Archive rows have none (AUDIT-012).
    label: "Submitted",
    value: (booking) => {
      const inquiryDate = getBookingInquiryDateValue(booking);
      return inquiryDate ? formatSubmittedDate(`${inquiryDate}T12:00:00`) : "";
    },
    sortValue: (booking) => getBookingInquiryDateValue(booking),
  },
  {
    label: "Contact Name",
    value: (booking) => booking.contactName,
  },
  {
    label: "Email",
    value: (booking) => booking.email,
  },
  {
    label: "Phone",
    value: (booking) => booking.phone,
  },
  {
    label: "Start Date",
    value: (booking) => booking.startDate,
  },
  {
    label: "End Date",
    value: (booking) => booking.endDate,
  },
  {
    label: "Date Range",
    value: (booking) =>
      getSpreadsheetDateRangeDisplay(booking.startDate, booking.endDate),
  },
  {
    label: "Desired Dates Text",
    value: (booking) => booking.desiredDatesText,
  },
  {
    label: "Guest Count",
    value: (booking) => booking.attendeeCount,
  },
  {
    label: "Retreat Type",
    value: (booking) => booking.retreatType,
    render: (booking, _openBookingDetail, settings) => {
      const displayValue = getSpreadsheetDisplayValue(booking.retreatType);

      if (!settings.showRetreatTypeColors) {
        return displayValue;
      }

      return (
        <span
          className={`spreadsheet-retreat-type-pill ${getSpreadsheetRetreatTypeClass(
            booking.retreatType
          )}`}
        >
          {displayValue}
        </span>
      );
    },
  },
  {
    label: "Promo Code",
    value: (booking) => booking.promoCode,
  },
  {
    label: "Waitlist",
    render: (booking) => (
      <span
        className={`spreadsheet-waitlist-pill ${getSpreadsheetWaitlistClass(
          booking.waitlist
        )}`}
      >
        {getSpreadsheetDisplayValue(booking.waitlist)}
      </span>
    ),
  },
  {
    label: "Assigned Room / Area",
    value: (booking) => booking.roomName,
  },
  {
    label: "Buildings / Rooms",
    value: (booking) => booking.buildingsRooms,
  },
    {
    // Staff meal notes appear with the meals (AUDIT-040).
    label: "Meals",
    value: (booking) =>
      [booking.meals, booking.rentalFormDetails?.mealNotes && booking.sourceType === "Staff Booking"
        ? `Notes: ${booking.rentalFormDetails.mealNotes}`
        : ""]
        .filter(Boolean)
        .join(" — "),
  },
  {
    label: "# Meals",
    value: (booking) => booking.mealCount,
  },
  {
    label: "Food Allergies",
    value: (booking) => booking.foodAllergies,
  },
    {
    // General operational notes for every source (AUDIT-040). Older staff
    // bookings stored their meal notes here; those are shown with Meals.
    label: "Need To Know",
    value: (booking) =>
      booking.sourceType === "Staff Booking" &&
      booking.needToKnow === booking.rentalFormDetails?.mealNotes
        ? ""
        : booking.needToKnow,
  },
  {
    label: "Linen Sets",
    value: (booking) => booking.linenSets,
  },
  {
    label: "Activities",
    value: (booking) => booking.activities,
  },
  {
    label: "# Persons",
    value: (booking) => booking.persons,
  },
  {
    label: "# Nights",
    value: (booking) => booking.nights,
  },
  {
    label: "Camper Days",
    value: (booking) => booking.camperDays,
  },
  {
    label: "Usage Fee",
    value: (booking) => booking.usageFee,
  },
  {
    label: "$ Lodging",
    value: (booking) => booking.lodgingCost,
  },
  {
    label: "$ Food",
    value: (booking) => booking.foodCost,
  },
  {
    label: "$ Misc.",
    value: (booking) => booking.miscCost,
  },
  {
    label: "Returning Status",
    value: (booking) => booking.returningStatus,
  },
  {
    label: "Stage of Group",
    value: (booking) => booking.stageOfGroup,
  },
  {
    label: "Schedule",
    value: (booking) => booking.schedule,
  },
  {
    label: "Min Paying Guests",
    value: (booking) => booking.minPayingGuests,
  },
  {
    label: "Max Paying Guests",
    value: (booking) => booking.maxPayingGuests,
  },
  {
    label: "Guest Rate",
    value: (booking) => booking.guestRate,
  },
  {
    label: "Expected Minimum Revenue",
    value: (booking) => booking.expectedMinimumRevenue,
  },
  {
    label: "Deposit",
    value: (booking) => booking.deposit,
  },
  {
    label: "Deposit Received",
    value: (booking) => booking.depositReceived,
  },
  {
    label: "Date of Cancellation",
    value: (booking) => booking.dateOfCancellation,
  },
  {
    label: "Reason for Cancellation",
    value: (booking) => booking.reasonForCancellation,
  },
  {
    label: "Vacancy Filled",
    value: (booking) => booking.vacancyFilled,
  },
  {
    label: "Monthly Projected Income",
    value: (booking) => booking.monthlyProjectedIncome,
  },
  {
    label: "Notes",
    value: (booking) => booking.notes,
  },
  {
    label: "Booking ID",
    value: (booking) => booking.id,
  },
];

const SPREADSHEET_YEAR_COLUMN_LABELS = {
  "2025": new Set([
    "Organization",
    "Start Date",
    "End Date",
    "Retreat Type",
    "Returning Status",
    "Contact Name",
    "Phone",
    "Guest Count",
    "Buildings / Rooms",
    "Meals",
    "Food Allergies",
    "Need To Know",
    "Linen Sets",
    "Activities",
    "# Persons",
    "# Nights",
    "# Meals",
    "Camper Days",
    "Usage Fee",
    "$ Lodging",
    "$ Food",
  ]),

  "2026": new Set([
    "Organization",
    "Start Date",
    "End Date",
    "Retreat Type",
    "Returning Status",
    "Contact Name",
    "Email",
    "Phone",
    "Guest Count",
    "Buildings / Rooms",
    "Meals",
    "Food Allergies",
    "Need To Know",
    "Linen Sets",
    "Activities",

    "Stage of Group",
    "Min Paying Guests",
    "Max Paying Guests",
    "Guest Rate",
    "Expected Minimum Revenue",
    "Deposit",
    "Deposit Received",
    "Date of Cancellation",
    "Reason for Cancellation",
    "Vacancy Filled",

    "# Persons",
    "# Nights",
    "# Meals",
    "Camper Days",
    "Usage Fee",
    "$ Lodging",
    "$ Food",
    "$ Misc.",
    "Monthly Projected Income",

    "Notes",
  ]),

  "2027": new Set([
    "Organization",
    "Start Date",
    "End Date",
    "Retreat Type",
    "Returning Status",
    "Contact Name",
    "Email",
    "Phone",
    "Guest Count",
    "Buildings / Rooms",

    "# Nights",
    "Meals",
    "Stage of Group",
    "Deposit",
    "Deposit Received",
    "Food Allergies",
    "Need To Know",
    "Linen Sets",
    "Activities",

    "Min Paying Guests",
    "Max Paying Guests",
    "Guest Rate",
    "Expected Minimum Revenue",
    "Schedule",

    "Date of Cancellation",
    "Reason for Cancellation",
    "Vacancy Filled",

    "# Persons",
    "# Meals",
    "Camper Days",
    "Usage Fee",
    "$ Lodging",
    "$ Food",
    "$ Misc.",
  ]),
};

const SPREADSHEET_ALL_MASTER_COLUMN_LABELS = new Set(
  Object.values(SPREADSHEET_YEAR_COLUMN_LABELS).flatMap((columnSet) =>
    Array.from(columnSet)
  )
);


function getSpreadsheetBookingYear(booking) {
  const sourceType = String(booking.sourceType || "")
    .trim()
    .toLowerCase();

  const detectedImportType = String(
    booking.detectedImportType || ""
  )
    .trim()
    .toLowerCase();

  const sourceSheet = String(booking.sourceSheet || "")
    .trim()
    .toLowerCase();

  /*
    =========================================================
    STAFF-CREATED BOOKINGS

    Staff Booking records belong in Spreadsheet 1.

    If they have an arrival date, use that year so they also
    appear under the matching 2025 / 2026 / 2027 button.

    If they do not have an arrival date yet, return "staff"
    so they still appear in the All view.
    =========================================================
  */
  if (
    sourceType === "staff booking" ||
    detectedImportType === "staff booking"
  ) {
    const startDateText = String(booking.startDate || "").trim();

    const yearMatch = startDateText.match(/^(\d{4})-/);

    if (yearMatch) {
      return yearMatch[1];
    }

    return "staff";
  }

  /*
    =========================================================
    MASTER IMPORTS

    Prefer the actual saved import metadata.

    IMPORTANT:
    Guest Group Inquiry records should NOT count as Master data.
    =========================================================
  */

  if (
    sourceType === "master 2027" ||
    detectedImportType === "master 2027"
  ) {
    return "2027";
  }

  if (
    sourceType === "master 2026" ||
    detectedImportType === "master 2026"
  ) {
    return "2026";
  }

  if (
    sourceType === "master 2025" ||
    detectedImportType === "master 2025"
  ) {
    return "2025";
  }

  /*
    Backwards compatibility with older 2025 imports
    that were simply called "Master".
  */
  if (
    sourceType === "master" ||
    detectedImportType === "master"
  ) {
    return "2025";
  }

  /*
    Last-resort fallback for older imports where the metadata
    wasn't saved correctly but the worksheet name clearly
    identifies a Master sheet.
  */
  if (
    sourceSheet.includes("master") &&
    sourceSheet.includes("2027")
  ) {
    return "2027";
  }

  if (
    sourceSheet.includes("master") &&
    sourceSheet.includes("2026")
  ) {
    return "2026";
  }

  if (
    sourceSheet.includes("master") &&
    sourceSheet.includes("2025")
  ) {
    return "2025";
  }

  /*
    Historical inquiry/no's sheets, archives, etc.
    do NOT belong in Spreadsheet 1.
  */
  return "";
}


function getDefaultSpreadsheetSettings() {
  return {
    searchText: "",

    sourceFilterMode: "sourceSheet",
    sourceTypes: [],
    sourceSheets: [],
    statuses: [],
    buildingTypes: [],
    waitlist: "all",

    startDate: "",
    endDate: "",

    minGuests: "",
    maxGuests: "",

    hasEmail: "all",
    hasPhone: "all",

    sortColumnId: "standard:Start Date",
    sortDirection: "asc",

    visibleColumnIds: null,
    columnOrder: null,

    freezeFirstColumn: true,
    compactRows: false,
    showRowPreviewPopups: false,
    showStarredRowsFirst: false,
    showRetreatTypeColors: true,
    visibleSummaryCardIds: [
      "shown",
      "totalRows",
      "starredRows",
      "hiddenColumns",
    ],

    colorMode: "none",

    highlightMissingContact: false,
    highlightMissingDates: false,
    highlightWaitlist: false,
    highlightCancelled: false,
    highlightFoodAllergies: false,

    customHighlightText: "",
    customHighlightColumnId: "all",

  };
}

const SPREADSHEET_SAVED_VIEWS_STORAGE_KEY =
  "bookingSpreadsheetSavedViews";

/*
  Status is never shown as a spreadsheet column. Older saved
  settings/views may still reference it, so strip those ids.
*/
const SPREADSHEET_REMOVED_COLUMN_IDS = new Set([
  "standard:Status",
  "raw:Status",
  "raw:Confirmation Status",
]);

function removeSpreadsheetRemovedColumnIds(columnIds) {
  if (!Array.isArray(columnIds)) {
    return columnIds;
  }

  return columnIds.filter(
    (columnId) => !SPREADSHEET_REMOVED_COLUMN_IDS.has(columnId)
  );
}

function normalizeSpreadsheetSettings(settings = {}) {
  const defaultSettings = getDefaultSpreadsheetSettings();
  const parsedSettings = {
    ...defaultSettings,
    ...(settings || {}),
  };

  const sortsByRemovedColumn = SPREADSHEET_REMOVED_COLUMN_IDS.has(
    parsedSettings.sortColumnId
  );

  return {
    ...parsedSettings,
    visibleColumnIds: removeSpreadsheetRemovedColumnIds(
      parsedSettings.visibleColumnIds
    ),
    columnOrder: removeSpreadsheetRemovedColumnIds(parsedSettings.columnOrder),
    sortColumnId: sortsByRemovedColumn
      ? defaultSettings.sortColumnId
      : parsedSettings.sortColumnId,
    sortDirection: sortsByRemovedColumn
      ? defaultSettings.sortDirection
      : parsedSettings.sortDirection,
    showColumnCategoryColors: Boolean(parsedSettings.showColumnCategoryColors),
    showRetreatTypeColors: Boolean(parsedSettings.showRetreatTypeColors),
    colorMode: "none",
  };
}

function getSavedSpreadsheetSavedViews() {
  try {
    const savedValue = localStorage.getItem(SPREADSHEET_SAVED_VIEWS_STORAGE_KEY);

    if (!savedValue) {
      return [];
    }

    const parsedValue = JSON.parse(savedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(
        (savedView) =>
          savedView &&
          typeof savedView === "object" &&
          savedView.id &&
          savedView.name &&
          savedView.settings
      )
      .map((savedView) => ({
        id: String(savedView.id),
        name: String(savedView.name),
        createdAt: savedView.createdAt || "",
        updatedAt: savedView.updatedAt || savedView.createdAt || "",
        isDefault: Boolean(savedView.isDefault),
        settings: normalizeSpreadsheetSettings(savedView.settings),
      }));
  } catch (error) {
    console.error("Could not read saved spreadsheet views:", error);
    return [];
  }
}

function saveSpreadsheetSavedViews(savedViews) {
  try {
    localStorage.setItem(
      SPREADSHEET_SAVED_VIEWS_STORAGE_KEY,
      JSON.stringify(savedViews)
    );
  } catch (error) {
    console.error("Could not save spreadsheet views:", error);
  }
}

function getDefaultSpreadsheetSavedView() {
  return (
    getSavedSpreadsheetSavedViews().find((savedView) => savedView.isDefault) ||
    null
  );
}

function getSavedSpreadsheetSettings() {
  try {
    const defaultSavedView = getDefaultSpreadsheetSavedView();

    if (defaultSavedView) {
      return normalizeSpreadsheetSettings(defaultSavedView.settings);
    }

    const savedSettings = localStorage.getItem(
      SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY
    );

    if (!savedSettings) {
      return getDefaultSpreadsheetSettings();
    }

    return normalizeSpreadsheetSettings(JSON.parse(savedSettings));
  } catch (error) {
    console.error("Could not read spreadsheet settings:", error);
    return getDefaultSpreadsheetSettings();
  }
}

function saveSpreadsheetSettings(settings) {
  try {
    localStorage.setItem(
      SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error("Could not save spreadsheet settings:", error);
  }
}

function getSpreadsheetBookingStarId(booking) {
  const bookingId = String(booking.id || "").trim();

  if (bookingId) {
    return bookingId;
  }

  const rawDataSignature =
    booking.rawSpreadsheetData && typeof booking.rawSpreadsheetData === "object"
      ? JSON.stringify(booking.rawSpreadsheetData)
      : "";

  return [
    getBookingSourceSheetLabel(booking),
    booking.sourceRowNumber,
    booking.organizationName,
    booking.contactName,
    booking.startDate,
    booking.endDate,
    rawDataSignature,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function getSavedSpreadsheetStarIdList(storageKey) {
  try {
    const savedValue = localStorage.getItem(storageKey);

    if (!savedValue) {
      return [];
    }

    const parsedValue = JSON.parse(savedValue);

    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error("Could not read saved spreadsheet stars:", error);
    return [];
  }
}

function saveSpreadsheetStarIdList(storageKey, bookingIds) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(bookingIds));
  } catch (error) {
    console.error("Could not save spreadsheet stars:", error);
  }
}

function getSpreadsheetStandardColumnCategory(label) {
  if (SPREADSHEET_2026_STANDARD_LABELS.has(label)) {
    return "master-2026";
  }

  if (SPREADSHEET_SHARED_STANDARD_LABELS.has(label)) {
    return "both";
  }

  if (
    label === "Promo Code" ||
    label === "Waitlist" ||
    label === "Desired Dates Text"
  ) {
    return "form-waitlist";
  }

  return "other";
}

function getSpreadsheetRawColumnCategory(columnName) {
  if (SPREADSHEET_SHARED_RAW_COLUMNS.has(columnName)) {
    return "both";
  }

  if (SPREADSHEET_2025_RAW_COLUMNS.has(columnName)) {
    return "master-2025";
  }

  if (SPREADSHEET_2026_RAW_COLUMNS.has(columnName)) {
    return "master-2026";
  }

  return "raw-other";
}

function getSpreadsheetColumnCategoryClass(category) {
  if (category === "both") {
    return "spreadsheet-column-both-years";
  }

  if (category === "master-2025") {
    return "spreadsheet-column-2025-only";
  }

  if (category === "master-2026") {
    return "spreadsheet-column-2026-only";
  }

  if (category === "form-waitlist") {
    return "spreadsheet-column-form-waitlist";
  }

  if (category === "raw-other") {
    return "spreadsheet-column-raw-other";
  }

  return "spreadsheet-column-general";
}

function getSpreadsheetComparableValue(column, booking) {
  if (!column) {
    return "";
  }

  /*
    Some columns need a different value for sorting
    than what is displayed to the user.

    Example:
    Submitted displays a friendly formatted date,
    but sorts using the full timestamp.
  */
  if (column.sortValue) {
    return column.sortValue(booking);
  }

  if (column.value) {
    return column.value(booking);
  }

  if (column.label === "Organization") {
    return booking.organizationName;
  }

  if (column.label === "Input Method") {
    return getBookingInputMethod(booking);
  }

  if (column.label === "Status") {
    return booking.status;
  }

  if (column.label === "Waitlist") {
    return booking.waitlist;
  }

  return "";
}

function getSpreadsheetSearchText(booking) {
  const rawValues =
    booking.rawSpreadsheetData && typeof booking.rawSpreadsheetData === "object"
      ? Object.values(booking.rawSpreadsheetData)
      : [];

  return [
    booking.organizationName,
    booking.contactName,
    booking.email,
    booking.phone,
    booking.status,
    booking.sourceType,
    booking.sourceSheet,
    booking.startDate,
    booking.endDate,
    booking.desiredDatesText,
    booking.attendeeCount,
    booking.retreatType,
    booking.roomName,
    booking.buildingsRooms,
    booking.meals,
    booking.foodAllergies,
    booking.needToKnow,
    booking.activities,
    booking.notes,
    booking.stageOfGroup,
    booking.schedule,
    booking.notes,
    ...rawValues,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function isSpreadsheetUsableValue(value) {
  const text = String(value || "").trim().toLowerCase();

  return (
    text &&
    text !== "n/a" &&
    text !== "na" &&
    text !== "—" &&
    text !== "no email provided" &&
    text !== "no phone provided" &&
    text !== "no contact name" &&
    text !== "unnamed organization" &&
    text !== "unassigned"
  );
}

const SPREADSHEET_BUILDING_OPTIONS = [
  { value: "Hebron", label: "Hebron" },
  { value: "Bethel", label: "Bethel" },
  { value: "Dothan", label: "Dothan" },
  { value: "Guest House", label: "Guest House" },
  { value: "Ajalon", label: "Ajalon" },
  { value: "Capernaum", label: "Capernaum" },
];

function getSpreadsheetBuildingValueText(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return String(value).toLowerCase();
    }
  }

  return String(value).trim().toLowerCase();
}

function getSpreadsheetBuildingSearchText(booking) {
  const rawBuildingValues =
    booking.rawSpreadsheetData && typeof booking.rawSpreadsheetData === "object"
      ? Object.entries(booking.rawSpreadsheetData)
          .filter(([key]) => /building|room|housing|lodg/i.test(key))
          .map(([, value]) => value)
      : [];

  return [
    booking.roomName,
    booking.buildingsRooms,
    ...rawBuildingValues,
  ]
    .map(getSpreadsheetBuildingValueText)
    .filter(Boolean)
    .join(" ");
}

function bookingMatchesSpreadsheetBuilding(booking, buildingType) {
  const buildingText = getSpreadsheetBuildingSearchText(booking);

  if (!buildingText) {
    return false;
  }

  if (buildingType === "Hebron") {
    return (
      buildingText.includes("hebron") ||
      buildingText.includes("men's bunks") ||
      buildingText.includes("mens bunks") ||
      buildingText.includes("women's bunks") ||
      buildingText.includes("womens bunks")
    );
  }

  if (buildingType === "Guest House") {
    return (
      buildingText.includes("guest house") ||
      buildingText.includes("guesthouse")
    );
  }

  return buildingText.includes(String(buildingType || "").toLowerCase());
}

function bookingMatchesSpreadsheetBuildingFilters(booking, selectedBuildingTypes) {
  const selectedBuildings = Array.isArray(selectedBuildingTypes)
    ? selectedBuildingTypes
    : [];

  if (selectedBuildings.length === 0) {
    return true;
  }

  return selectedBuildings.some((buildingType) =>
    bookingMatchesSpreadsheetBuilding(booking, buildingType)
  );
}

function bookingTouchesSpreadsheetDateRange(booking, startDate, endDate) {
  if (!startDate && !endDate) {
    return true;
  }

  const bookingStartDate = getLocalDate(booking.startDate);

  if (!bookingStartDate) {
    return false;
  }

  const bookingEndDate = booking.endDate
    ? getLocalDate(booking.endDate)
    : bookingStartDate;

  const filterStartDate = startDate ? getLocalDate(startDate) : null;
  const filterEndDate = endDate ? getLocalDate(endDate) : null;

  if (filterStartDate && filterEndDate) {
    return bookingStartDate <= filterEndDate && bookingEndDate >= filterStartDate;
  }

  if (filterStartDate) {
    return bookingEndDate >= filterStartDate;
  }

  return bookingStartDate <= filterEndDate;
}

function compareSpreadsheetValues(a, b) {
  const aText = String(a || "").trim();
  const bText = String(b || "").trim();

  const aNumber = Number(aText.replace(/[$,]/g, ""));
  const bNumber = Number(bText.replace(/[$,]/g, ""));

  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aText && bText) {
    return aNumber - bNumber;
  }

  const aDate = Date.parse(aText);
  const bDate = Date.parse(bText);

  if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
    return aDate - bDate;
  }

  return aText.localeCompare(bText, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getSpreadsheetRowClass(booking, settings) {
  const classes = [];

  if (settings.compactRows) {
    classes.push("spreadsheet-row-compact");
  }

  if (settings.colorMode === "sourceRows") {
    classes.push(`spreadsheet-row-source-${getSpreadsheetSourceClass(booking)}`);
  }

  if (settings.colorMode === "statusRows") {
    classes.push(`spreadsheet-row-status-${getSpreadsheetStatusClass(booking.status)}`);
  }

  if (
    settings.highlightMissingContact &&
    !isSpreadsheetUsableValue(booking.email) &&
    !isSpreadsheetUsableValue(booking.phone)
  ) {
    classes.push("spreadsheet-row-missing-contact");
  }

  if (
    settings.highlightMissingDates &&
    !isSpreadsheetUsableValue(booking.startDate) &&
    !isSpreadsheetUsableValue(booking.desiredDatesText)
  ) {
    classes.push("spreadsheet-row-missing-dates");
  }

  if (
    settings.highlightWaitlist &&
    String(booking.waitlist || "").toLowerCase() === "yes"
  ) {
    classes.push("spreadsheet-row-highlight-waitlist");
  }

  if (
    settings.highlightCancelled &&
    String(booking.status || "").toLowerCase().includes("cancel")
  ) {
    classes.push("spreadsheet-row-highlight-cancelled");
  }

  return classes.join(" ");
}

function getSpreadsheetCellClass({ column, columnIndex, booking, settings }) {
  const classes = [];

  if (settings.freezeFirstColumn && columnIndex === 0) {
    classes.push("spreadsheet-sticky-column");
  }

  if (settings.showColumnCategoryColors) {
    classes.push(getSpreadsheetColumnCategoryClass(column.sourceCategory));
  }

  if (
    settings.highlightFoodAllergies &&
    column.label.toLowerCase().includes("allerg") &&
    isSpreadsheetUsableValue(getSpreadsheetComparableValue(column, booking))
  ) {
    classes.push("spreadsheet-cell-food-allergy");
  }

  const customHighlightText = String(settings.customHighlightText || "")
    .trim()
    .toLowerCase();

  if (customHighlightText) {
    const value = String(getSpreadsheetComparableValue(column, booking) || "")
      .trim()
      .toLowerCase();

    const shouldCheckColumn =
      settings.customHighlightColumnId === "all" ||
      settings.customHighlightColumnId === column.id;

    if (shouldCheckColumn && value.includes(customHighlightText)) {
      classes.push("spreadsheet-cell-custom-highlight");
    }
  }

  return classes.join(" ");
}

function getOrderedSpreadsheetColumns(columns, columnOrder) {
  if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
    return columns;
  }

  const columnMap = new Map(columns.map((column) => [column.id, column]));
  const orderedColumns = [];

  columnOrder.forEach((columnId) => {
    if (columnMap.has(columnId)) {
      orderedColumns.push(columnMap.get(columnId));
      columnMap.delete(columnId);
    }
  });

  return [...orderedColumns, ...Array.from(columnMap.values())];
}

function toggleSpreadsheetArrayValue(values, value) {
  const currentValues = Array.isArray(values) ? values : [];

  if (currentValues.includes(value)) {
    return currentValues.filter((item) => item !== value);
  }

  return [...currentValues, value];
}

function getSpreadsheetPreviewDateText(booking) {
  const dateRange = getSpreadsheetDateRangeDisplay(
    booking.startDate,
    booking.endDate
  );

  if (dateRange && dateRange !== "N/A") {
    return dateRange;
  }

  return getSpreadsheetDisplayValue(booking.desiredDatesText);
}

function SpreadsheetRowPreviewPopup({ booking }) {
  const previewFlags = [
    String(booking.waitlist || "").toLowerCase() === "yes" ? "Waitlist" : "",
    isSpreadsheetUsableValue(booking.foodAllergies) ? "Food allergies" : "",
    isSpreadsheetUsableValue(booking.needToKnow) ? "Need to know" : "",
  ].filter(Boolean);

  const sourceLabel = getBookingInputMethod(booking);
  const sourceSheetLabel = getBookingSourceSheetLabel(booking);

  const sourceText = [sourceLabel, sourceSheetLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="spreadsheet-row-hover-popup" role="tooltip">
      <div className="spreadsheet-row-hover-popup-top">
        <div>
          <strong>{booking.organizationName || "Unnamed Organization"}</strong>
          <span>{getSpreadsheetPreviewDateText(booking)}</span>
        </div>

        <em
          className={`spreadsheet-status-pill ${getSpreadsheetStatusClass(
            booking.status
          )}`}
        >
          {getSpreadsheetDisplayValue(booking.status)}
        </em>
      </div>

      <p className="spreadsheet-row-hover-popup-source" title={sourceText}>
        {sourceText}
      </p>

      <dl>
        <div>
          <dt>Type</dt>
          <dd>{booking.retreatType || "—"}</dd>
        </div>

        <div>
          <dt>Guests</dt>
          <dd>
            {booking.attendeeCount ||
              booking.groupSize ||
              booking.persons ||
              "—"}
          </dd>
        </div>

        <div>
          <dt>Contact</dt>
          <dd>{booking.contactName || "No contact name"}</dd>
        </div>

        <div>
          <dt>Room</dt>
          <dd>{booking.roomName || booking.buildingsRooms || "Unassigned"}</dd>
        </div>

        <div>
          <dt>Meals</dt>
          <dd>{booking.meals || booking.mealCount || "—"}</dd>
        </div>

        <div>
          <dt>Flags</dt>
          <dd>{previewFlags.length > 0 ? previewFlags.join(" · ") : "None"}</dd>
        </div>
      </dl>
    </div>
  );
}


export function SpreadsheetViewLoadingScreen({ rowCount }) {
  return (
    <section className="spreadsheet-view-page">
      <article className="dashboard-card spreadsheet-view-card spreadsheet-loading-card">
        <div className="spreadsheet-loading-hero">
          <span className="spreadsheet-loading-icon">
            <FaTable />
          </span>

          <div className="spreadsheet-loading-copy">
            <p className="dashboard-eyebrow">Spreadsheet View</p>
            <h2>Loading All Booking Data</h2>
            <p>
              Preparing {rowCount} booking row{rowCount === 1 ? "" : "s"}, columns,
              filters, and saved view settings.
            </p>
          </div>

          <span className="spreadsheet-loading-spinner" aria-hidden="true" />
        </div>

        <div className="spreadsheet-loading-summary">
          <span>
            <strong>{rowCount}</strong>
            Rows
          </span>

          <span>
            <strong>Saved</strong>
            Settings
          </span>

          <span>
            <strong>Ready</strong>
            Filters
          </span>
        </div>

        <div className="spreadsheet-loading-table-preview" aria-hidden="true">
          <div className="spreadsheet-loading-preview-header">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>

          {Array.from({ length: 7 }).map((_, index) => (
            <div className="spreadsheet-loading-preview-row" key={index}>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}



function BookingSpreadsheetView({
  inquiryBookings,
  openBookingDetail,
}) {

  /*
    Simple staff-facing spreadsheet mode.

    "all" shows all Master data.
    Individual years behave more like opening that year's Excel sheet.
  */
  const [spreadsheetYearView, setSpreadsheetYearView] = useState("all");

  const [spreadsheetSettings, setSpreadsheetSettings] = useState(() =>
    getSavedSpreadsheetSettings()
  );

  const selectedSpreadsheetBuildings = useMemo(
    () =>
      Array.isArray(spreadsheetSettings.buildingTypes)
        ? spreadsheetSettings.buildingTypes
        : [],
    [spreadsheetSettings.buildingTypes]
  );

  // Read-only since the settings modal was removed; still re-saved on load as before.
  const [savedSpreadsheetViews] = useState(() =>
    getSavedSpreadsheetSavedViews()
  );

  const [starredSpreadsheetBookingIds, setStarredSpreadsheetBookingIds] =
    useState(() =>
      getSavedSpreadsheetStarIdList(SPREADSHEET_VIEW_STARRED_STORAGE_KEY)
    );

  useEffect(() => {
    saveSpreadsheetSettings(spreadsheetSettings);
  }, [spreadsheetSettings]);

  useEffect(() => {
    saveSpreadsheetSavedViews(savedSpreadsheetViews);
  }, [savedSpreadsheetViews]);

    useEffect(() => {
    saveSpreadsheetStarIdList(
      SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
      starredSpreadsheetBookingIds
    );
  }, [starredSpreadsheetBookingIds]);

  const starredSpreadsheetBookingIdSet = useMemo(
    () => new Set(starredSpreadsheetBookingIds),
    [starredSpreadsheetBookingIds]
  );

  const processedInquiryBookings = useMemo(() => {
    return Array.isArray(inquiryBookings) ? inquiryBookings : [];
  }, [inquiryBookings]);

  const masterSpreadsheetBookings = useMemo(() => {
    return processedInquiryBookings.filter((booking) =>
      Boolean(getSpreadsheetBookingYear(booking))
    );
  }, [processedInquiryBookings]);

  const totalBookingCount = masterSpreadsheetBookings.length;

  const toggleSpreadsheetBookingStar = (booking) => {
    const bookingStarId = getSpreadsheetBookingStarId(booking);

    setStarredSpreadsheetBookingIds((currentIds) => {
      if (currentIds.includes(bookingStarId)) {
        return currentIds.filter((id) => id !== bookingStarId);
      }

      return [...currentIds, bookingStarId];
    });
  };

  const rawSpreadsheetColumns = useMemo(
    () => getRawSpreadsheetColumns(masterSpreadsheetBookings),
    [masterSpreadsheetBookings]
  );

  const allSpreadsheetColumns = useMemo(() => {
    const standardColumns = bookingSpreadsheetColumns.map((column) => ({
      ...column,
      id: `standard:${column.label}`,
      type: "standard",
      sourceCategory: getSpreadsheetStandardColumnCategory(column.label),
    }));

    const rawColumns = rawSpreadsheetColumns.map((columnName) => ({
      id: `raw:${columnName}`,
      type: "raw",
      label: `Original: ${columnName}`,
      rawColumnName: columnName,
      sourceCategory: getSpreadsheetRawColumnCategory(columnName),
      value: (booking) => booking.rawSpreadsheetData?.[columnName],
    }));

    return [...standardColumns, ...rawColumns];
  }, [rawSpreadsheetColumns]);

  const orderedSpreadsheetColumns = useMemo(
    () =>
      getOrderedSpreadsheetColumns(
        allSpreadsheetColumns,
        spreadsheetSettings.columnOrder
      ),
    [allSpreadsheetColumns, spreadsheetSettings.columnOrder]
  );

  const visibleSpreadsheetColumns = useMemo(() => {
    /*
      ALL
      Show every available standard/raw column.
    */
    if (spreadsheetYearView === "all") {
      return orderedSpreadsheetColumns.filter((column) => {
        if (column.type === "standard") {
          return SPREADSHEET_ALL_MASTER_COLUMN_LABELS.has(column.label);
        }

        if (column.type === "raw") {
          return true;
        }

        return false;
      });
    }

    const allowedStandardLabels =
      SPREADSHEET_YEAR_COLUMN_LABELS[spreadsheetYearView];

    if (!allowedStandardLabels) {
      return orderedSpreadsheetColumns;
    }

    /*
      Find any unmapped/original Excel columns that actually occur
      on bookings from the selected year.

      That means things such as a weird old 2026-only source column
      can still appear when viewing 2026 without polluting 2025/2027.
    */
    const rawColumnsForSelectedYear = new Set();

    masterSpreadsheetBookings.forEach((booking) => {
      if (getSpreadsheetBookingYear(booking) !== spreadsheetYearView) {
        return;
      }

      const rawData = booking.rawSpreadsheetData;

      if (!rawData || typeof rawData !== "object") {
        return;
      }

      Object.keys(rawData).forEach((columnName) => {
        if (
          columnName === "sourceSheet" ||
          columnName === "sourceRowNumber" ||
          columnName === "detectedImportType"
        ) {
          return;
        }

        /*
          Mapped fields already have a clean standardized column,
          so don't show the duplicated "Original:" version.
        */
        if (MAPPED_MASTER_RAW_COLUMNS.has(columnName)) {
          return;
        }

        rawColumnsForSelectedYear.add(columnName);
      });
    });

    return orderedSpreadsheetColumns.filter((column) => {
      if (column.type === "standard") {
        return allowedStandardLabels.has(column.label);
      }

      if (column.type === "raw") {
        return rawColumnsForSelectedYear.has(column.rawColumnName);
      }

      return false;
    });
  }, [
    orderedSpreadsheetColumns,
    masterSpreadsheetBookings,
    spreadsheetYearView,
  ]);

  const spreadsheetDateBounds = useMemo(() => {
    const usableDates = processedInquiryBookings
      .flatMap((booking) => [booking.startDate, booking.endDate])
      .filter(Boolean)
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a - b);

    return {
      earliest: usableDates[0] ? usableDates[0].toISOString().slice(0, 10) : "",
      latest: usableDates.length
        ? usableDates[usableDates.length - 1].toISOString().slice(0, 10)
        : "",
    };
  }, [processedInquiryBookings]);

  const filteredAndSortedBookings = useMemo(() => {
    const searchText = String(
      spreadsheetSettings.searchText || ""
    )
      .trim()
      .toLowerCase();

    const effectiveStartDate =
      spreadsheetSettings.startDate || spreadsheetDateBounds.earliest;

    const effectiveEndDate =
      spreadsheetSettings.endDate || spreadsheetDateBounds.latest;

    const filteredBookings = processedInquiryBookings.filter((booking) => {
      const bookingYear = getSpreadsheetBookingYear(booking);

      /*
        Spreadsheet 1 contains:

        - Imported Master 2025 bookings
        - Imported Master 2026 bookings
        - Imported Master 2027 bookings
        - Staff-created bookings

        Historical Guest Group Inquiry / No's records,
        archives, and unrelated imports stay out.
      */
      if (!bookingYear) {
        return false;
      }

      if (
        spreadsheetYearView !== "all" &&
        bookingYear !== spreadsheetYearView
      ) {
        return false;
      }

      /*
        BUILDING TYPE

        An empty selection means "all buildings". When staff select
        multiple buildings, a booking is shown if it uses ANY selected
        building. A booking assigned to both Hebron and Bethel therefore
        matches either filter.
      */
      if (
        !bookingMatchesSpreadsheetBuildingFilters(
          booking,
          selectedSpreadsheetBuildings
        )
      ) {
        return false;
      }

      if (
        !bookingTouchesSpreadsheetDateRange(
          booking,
          effectiveStartDate,
          effectiveEndDate
        )
      ) {
        return false;
      }

      /*
        SEARCH
        Search stays because it is still directly available
        in the spreadsheet header.
      */
      if (
        searchText &&
        !getSpreadsheetSearchText(booking).includes(searchText)
      ) {
        return false;
      }

      return true;
    });

    const sortColumn = allSpreadsheetColumns.find(
      (column) => column.id === spreadsheetSettings.sortColumnId
    );

    return [...filteredBookings].sort((a, b) => {
      const aIsStarred = starredSpreadsheetBookingIdSet.has(
        getSpreadsheetBookingStarId(a)
      );

      const bIsStarred = starredSpreadsheetBookingIdSet.has(
        getSpreadsheetBookingStarId(b)
      );

      /*
        Keep the existing "Starred first" feature because its
        toggle is still directly visible.
      */
      if (
        spreadsheetSettings.showStarredRowsFirst &&
        aIsStarred !== bIsStarred
      ) {
        return aIsStarred ? -1 : 1;
      }

      if (!sortColumn) {
        return 0;
      }

      const result = compareSpreadsheetValues(
        getSpreadsheetComparableValue(sortColumn, a),
        getSpreadsheetComparableValue(sortColumn, b)
      );

      return spreadsheetSettings.sortDirection === "desc"
        ? -result
        : result;
    });
  }, [
    processedInquiryBookings,
    spreadsheetYearView,
    selectedSpreadsheetBuildings,
    spreadsheetSettings.searchText,
    spreadsheetSettings.startDate,
    spreadsheetSettings.endDate,
    spreadsheetDateBounds,
    spreadsheetSettings.sortColumnId,
    spreadsheetSettings.sortDirection,
    spreadsheetSettings.showStarredRowsFirst,
    allSpreadsheetColumns,
    starredSpreadsheetBookingIdSet,
  ]);

  const selectSpreadsheetYearView = (nextYearView) => {
    setSpreadsheetYearView(nextYearView);
  };

  const updateSpreadsheetSettings = (updates) => {
    setSpreadsheetSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
    }));
  };

  const handleQuickSortChange = (event) => {
    const selectedValue = event.target.value;

    if (selectedValue === "custom") {
      return;
    }

    const [sortColumnId, sortDirection] = selectedValue.split("|");

    updateSpreadsheetSettings({
      sortColumnId,
      sortDirection,
    });
  };

  const currentQuickSortValue = (() => {
    const currentValue = `${spreadsheetSettings.sortColumnId}|${spreadsheetSettings.sortDirection}`;

    const matchesQuickSortOption = SPREADSHEET_QUICK_SORT_OPTIONS.some(
      (option) => option.value === currentValue
    );

    return matchesQuickSortOption ? currentValue : "custom";
  })();

  const handleSortColumn = (columnId) => {
    setSpreadsheetSettings((currentSettings) => {
      if (currentSettings.sortColumnId === columnId) {
        return {
          ...currentSettings,
          sortDirection:
            currentSettings.sortDirection === "asc" ? "desc" : "asc",
        };
      }

      return {
        ...currentSettings,
        sortColumnId: columnId,
        sortDirection: "asc",
      };
    });
  };

  const formCount = processedInquiryBookings.filter(
    (booking) =>
      booking.sourceType === "Form" ||
      booking.sourceType === "Staff Booking"
  ).length;

  const importedCount = processedInquiryBookings.length - formCount;

  const starredSpreadsheetCount = masterSpreadsheetBookings.filter((booking) =>
    starredSpreadsheetBookingIdSet.has(getSpreadsheetBookingStarId(booking))
  ).length;

  const hiddenColumnCount =
  allSpreadsheetColumns.length - visibleSpreadsheetColumns.length;

  const spreadsheetSummaryCards = useMemo(
    () => [
      {
        id: "shown",
        label: "Shown Now",
        value: filteredAndSortedBookings.length,
        className: "spreadsheet-summary-card-shown",
      },
      {
        id: "totalRows",
        label: "Total Rows",
        value: totalBookingCount,
        className: "spreadsheet-summary-card-total",
      },
      {
        id: "starredRows",
        label: "Starred",
        value: starredSpreadsheetCount,
        className: "spreadsheet-summary-card-starred",
      },
      {
        id: "forms",
        label: "Forms",
        value: formCount,
        className: "spreadsheet-summary-card-forms",
      },
      {
        id: "imports",
        label: "Imports",
        value: importedCount,
        className: "spreadsheet-summary-card-imports",
      },
      {
        id: "hiddenColumns",
        label: "Hidden Columns",
        value: hiddenColumnCount,
        className: "spreadsheet-summary-card-hidden-columns",
      },
    ],
    [
      filteredAndSortedBookings.length,
      totalBookingCount,
      starredSpreadsheetCount,
      formCount,
      importedCount,
      hiddenColumnCount,
    ]
  );

  const visibleSummaryCards = useMemo(() => {
    const visibleSummaryCardIds =
      spreadsheetSettings.visibleSummaryCardIds ||
      spreadsheetSummaryCards.map((card) => card.id);

    const visibleSummaryCardIdSet = new Set(visibleSummaryCardIds);

    return spreadsheetSummaryCards.filter((card) =>
      visibleSummaryCardIdSet.has(card.id)
    );
  }, [spreadsheetSettings.visibleSummaryCardIds, spreadsheetSummaryCards]);


  return (
  <section className="spreadsheet-view-page">
      <article className="dashboard-card spreadsheet-view-card">
        <div className="spreadsheet-view-header">
          <div className="spreadsheet-view-header-top">
            <div className="dashboard-heading-with-icon">
              <span className="section-icon">
                <FaTable />
              </span>

              <div>
                <p className="dashboard-eyebrow">Spreadsheet View</p>
                <h2>All Booking Data</h2>
              </div>
            </div>

            <div
              className="spreadsheet-year-view-toggle"
              aria-label="Spreadsheet year view"
              data-tutorial-target="spreadsheet-years"
            >
              <button
                className={spreadsheetYearView === "all" ? "active" : ""}
                type="button"
                onClick={() => selectSpreadsheetYearView("all")}
              >
                All
              </button>

              <button
                className={spreadsheetYearView === "2025" ? "active" : ""}
                type="button"
                onClick={() => selectSpreadsheetYearView("2025")}
              >
                2025
              </button>

              <button
                className={spreadsheetYearView === "2026" ? "active" : ""}
                type="button"
                onClick={() => selectSpreadsheetYearView("2026")}
              >
                2026
              </button>

              <button
                className={spreadsheetYearView === "2027" ? "active" : ""}
                type="button"
                onClick={() => selectSpreadsheetYearView("2027")}
              >
                2027
              </button>

              <button
                className={
                  spreadsheetSettings.startDate || spreadsheetSettings.endDate
                    ? "active"
                    : ""
                }
                type="button"
                disabled
                title="Custom date ranges are selected below"
              >
                Other
              </button>
            </div>
          </div>

          <div className="spreadsheet-view-header-layout">
            <div className="spreadsheet-view-header-main">
              {visibleSummaryCards.length > 0 && (
                <div className="spreadsheet-view-summary">
                  {visibleSummaryCards.map((card) => (
                    <span
                      className={`spreadsheet-summary-card ${card.className}`}
                      key={card.id}
                    >
                      <strong>{card.value}</strong>
                      {card.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="spreadsheet-building-filter" data-tutorial-target="spreadsheet-buildings">
                <div className="spreadsheet-building-filter-header">
                  <div>
                    <span>Building Type</span>
                    <small>
                      {selectedSpreadsheetBuildings.length === 0
                        ? "All buildings"
                        : `${selectedSpreadsheetBuildings.length} selected`}
                    </small>
                  </div>

                  {selectedSpreadsheetBuildings.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        updateSpreadsheetSettings({ buildingTypes: [] })
                      }
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div
                  className="spreadsheet-building-filter-options"
                  aria-label="Filter spreadsheet by building type"
                >
                  {SPREADSHEET_BUILDING_OPTIONS.map((building) => {
                    const isSelected = selectedSpreadsheetBuildings.includes(
                      building.value
                    );

                    return (
                      <button
                        className={isSelected ? "active" : ""}
                        type="button"
                        key={building.value}
                        aria-pressed={isSelected}
                        onClick={() =>
                          updateSpreadsheetSettings({
                            buildingTypes: toggleSpreadsheetArrayValue(
                              selectedSpreadsheetBuildings,
                              building.value
                            ),
                          })
                        }
                      >
                        <span
                          className="spreadsheet-building-filter-check"
                          aria-hidden="true"
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <span>{building.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="spreadsheet-settings-stack">

              <div className="spreadsheet-date-range-filter" data-tutorial-target="spreadsheet-dates">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={spreadsheetSettings.startDate || ""}
                    placeholder={spreadsheetDateBounds.earliest}
                    onChange={(event) =>
                      updateSpreadsheetSettings({
                        startDate: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={spreadsheetSettings.endDate || ""}
                    placeholder={spreadsheetDateBounds.latest}
                    onChange={(event) =>
                      updateSpreadsheetSettings({
                        endDate: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="spreadsheet-header-toggle-grid">
                <label className="spreadsheet-row-preview-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(spreadsheetSettings.showRowPreviewPopups)}
                    onChange={(event) =>
                      updateSpreadsheetSettings({
                        showRowPreviewPopups: event.target.checked,
                      })
                    }
                  />

                  <span>
                    <FaInfoCircle />
                    Row popups
                  </span>
                </label>

                <label className="spreadsheet-row-preview-toggle spreadsheet-starred-first-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(spreadsheetSettings.showStarredRowsFirst)}
                    onChange={(event) =>
                      updateSpreadsheetSettings({
                        showStarredRowsFirst: event.target.checked,
                      })
                    }
                  />

                  <span>
                    <FaStar />
                    Starred first
                  </span>
                </label>
              </div>

              {/* =========================================================
                  QUICK SORT
              ========================================================= */}
              <div className="spreadsheet-header-sort" data-tutorial-target="spreadsheet-sort">
                <label htmlFor="spreadsheet-header-sort-select">
                  Sort By
                </label>

                <div className="spreadsheet-header-sort-control">
                  <FaSortAmountDown />

                  <select
                    id="spreadsheet-header-sort-select"
                    value={currentQuickSortValue}
                    onChange={handleQuickSortChange}
                  >
                    {currentQuickSortValue === "custom" && (
                      <option value="custom" disabled>
                        Custom table sort
                      </option>
                    )}

                    {SPREADSHEET_QUICK_SORT_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="spreadsheet-header-search" data-tutorial-target="spreadsheet-search">
                <label htmlFor="spreadsheet-header-search-input">
                  Search Everything
                </label>

                <div className="spreadsheet-header-search-control">
                  <input
                    id="spreadsheet-header-search-input"
                    type="search"
                    value={spreadsheetSettings.searchText}
                    placeholder="Search bookings..."
                    onChange={(event) =>
                      updateSpreadsheetSettings({
                        searchText: event.target.value,
                      })
                    }
                  />

                  {spreadsheetSettings.searchText && (
                    <button
                      type="button"
                      className="spreadsheet-header-search-clear"
                      onClick={() =>
                        updateSpreadsheetSettings({
                          searchText: "",
                        })
                      }
                      aria-label="Clear spreadsheet search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {masterSpreadsheetBookings.length > 0 ? (
          <>
            <div className="spreadsheet-active-settings-bar" data-tutorial-target="spreadsheet-settings-bar">
              <span>
                Search:{" "}
                <strong>
                  {spreadsheetSettings.searchText
                    ? `"${spreadsheetSettings.searchText}"`
                    : "None"}
                </strong>
              </span>

              <span>
                Buildings:{" "}
                <strong>
                  {selectedSpreadsheetBuildings.length === 0
                    ? "All"
                    : selectedSpreadsheetBuildings.join(", ")}
                </strong>
              </span>

              <span>
                Sort:{" "}
                <strong>
                  {allSpreadsheetColumns.find(
                    (column) => column.id === spreadsheetSettings.sortColumnId
                  )?.label || "None"}{" "}
                  {spreadsheetSettings.sortDirection === "asc" ? "↑" : "↓"}
                </strong>
              </span>

              <span>
                Rows:{" "}
                <strong>{totalBookingCount}</strong>
              </span>

              <span>
                View:{" "}
                <strong>
                  {spreadsheetYearView === "all"
                    ? "All Years"
                    : `Master ${spreadsheetYearView}`}
                </strong>
              </span>



            </div>

            <div className="spreadsheet-table-wrap">
              <table className="spreadsheet-table spreadsheet-table-with-stars">
                <thead>
                  <tr>
                    <th className="spreadsheet-star-column">Star</th>
                    {visibleSpreadsheetColumns.map((column, columnIndex) => {
                      const isSorted =
                        spreadsheetSettings.sortColumnId === column.id;

                      return (
                        <th
                          className={getSpreadsheetCellClass({
                            column,
                            columnIndex,
                            booking: {},
                            settings: spreadsheetSettings,
                          })}
                          key={column.id}
                        >
                          <button
                            className="spreadsheet-header-sort-button"
                            type="button"
                            onClick={() => handleSortColumn(column.id)}
                          >
                            <span>{column.label}</span>
                            {isSorted && (
                              <em>
                                {spreadsheetSettings.sortDirection === "asc"
                                  ? "↑"
                                  : "↓"}
                              </em>
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {filteredAndSortedBookings.map((booking) => {
                    const bookingStarId = getSpreadsheetBookingStarId(booking);
                    const isStarred =
                      starredSpreadsheetBookingIdSet.has(bookingStarId);

                    const rowClassName = [
                      getSpreadsheetRowClass(booking, spreadsheetSettings),
                      isStarred ? "spreadsheet-row-starred" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <tr className={rowClassName} key={booking.id}>
                        <td className="spreadsheet-star-column spreadsheet-star-cell">
                          <button
                            className={`contact-star-button spreadsheet-star-button ${
                              isStarred ? "active" : ""
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSpreadsheetBookingStar(booking);
                            }}
                            aria-label={
                              isStarred
                                ? `Unstar ${
                                    booking.organizationName || "this spreadsheet row"
                                  }`
                                : `Star ${
                                    booking.organizationName || "this spreadsheet row"
                                  }`
                            }
                            title={isStarred ? "Unstar" : "Star"}
                          >
                            {isStarred ? <FaStar /> : <FaRegStar />}
                          </button>
                        </td>

                        {visibleSpreadsheetColumns.map((column, columnIndex) => (
                          <td
                            className={[
                              getSpreadsheetCellClass({
                                column,
                                columnIndex,
                                booking,
                                settings: spreadsheetSettings,
                              }),
                              columnIndex === 0 &&
                              spreadsheetSettings.showRowPreviewPopups
                                ? "spreadsheet-row-preview-cell"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={`${booking.id}-${column.id}`}
                            title={getSpreadsheetDisplayValue(
                              getSpreadsheetComparableValue(column, booking)
                            )}
                          >
                            <span className="spreadsheet-cell-content">
                              {column.render
                                ? column.render(booking, openBookingDetail, spreadsheetSettings)
                                : getSpreadsheetDisplayValue(column.value(booking))}
                            </span>

                            {columnIndex === 0 &&
                              spreadsheetSettings.showRowPreviewPopups && (
                                <SpreadsheetRowPreviewPopup booking={booking} />
                              )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredAndSortedBookings.length === 0 && (
              <div className="empty-state">
                <strong>No Master bookings match this view</strong>
                <p>
                  Try clearing the search, building filters, date range, or selecting a different year.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <strong>No spreadsheet data yet</strong>
            <p>
              Submit the public form or import a spreadsheet to see rows here.
            </p>
          </div>
        )}
      </article>



    </section>
  );
}


export default function SpreadsheetView({
  inquiryBookings = [],
  openBookingDetail,
  isLoading = false,
}) {
  const [shouldRenderSpreadsheet, setShouldRenderSpreadsheet] = useState(false);

  // A reload shows the loading screen again, then reveals the sheet as on first load.
  if (isLoading && shouldRenderSpreadsheet) {
    setShouldRenderSpreadsheet(false);
  }

  useEffect(() => {
    if (isLoading || shouldRenderSpreadsheet) {
      return;
    }

    let firstFrameId = 0;
    let secondFrameId = 0;

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        setShouldRenderSpreadsheet(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);

      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [isLoading, shouldRenderSpreadsheet]);

  if (isLoading || !shouldRenderSpreadsheet) {
    return <SpreadsheetViewLoadingScreen rowCount={inquiryBookings.length} />;
  }

  return (
    <BookingSpreadsheetView
      inquiryBookings={inquiryBookings}
      openBookingDetail={openBookingDetail}
    />
  );
}