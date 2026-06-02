import { useEffect, useMemo, useState } from "react";

import {
  FaCog,
  FaInfoCircle,
  FaRegStar,
  FaStar,
  FaTable,
  FaTimes,
} from "react-icons/fa";

import {
  SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
  SPREADSHEET_ESSENTIAL_COLUMN_LABELS,
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
} from "../utils/dateUtils";


/* 
Progressive spreadsheet loading:

  1. The Spreadsheet page starts by processing only the first 75 booking rows.
  2. Once those first rows are rendered, the loading overlay goes away.
  3. The rest of the bookings are processed in 75-row chunks in the background.
  4. This avoids filtering/sorting/building columns from the entire dataset before
     the user can see the page.
*/

const SPREADSHEET_INITIAL_ROW_LIMIT = 75;
const SPREADSHEET_ROW_BATCH_SIZE = 75;
const SPREADSHEET_BACKGROUND_RENDER_DELAY = 5;


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

  if (sourceSheet) {
    return sourceSheet;
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

  if (sourceType.includes("form")) {
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
        key !== "sourceSheet" &&
        key !== "sourceRowNumber" &&
        key !== "detectedImportType"
      ) {
        columns.add(key);
      }
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
  label: "Status",
    render: (booking) => (
      <span
        className={`spreadsheet-status-pill ${getSpreadsheetStatusClass(
          booking.status
        )}`}
      >
        {getSpreadsheetDisplayValue(booking.status)}
      </span>
    ),
  },
  {
    label: "Submitted",
    value: (booking) => formatSubmittedDate(booking.submittedAt),
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
    label: "Meals",
    value: (booking) => booking.meals,
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
    label: "Need To Know",
    value: (booking) => booking.needToKnow,
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
    label: "Invoice Lodging / Meals",
    value: (booking) => booking.invoiceLodgingMeals,
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

function getDefaultSpreadsheetSettings() {
  return {
    searchText: "",

    sourceFilterMode: "sourceSheet",
    sourceTypes: [],
    sourceSheets: [],
    statuses: [],
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

function normalizeSpreadsheetSettings(settings = {}) {
  const parsedSettings = {
    ...getDefaultSpreadsheetSettings(),
    ...(settings || {}),
  };

  return {
    ...parsedSettings,
    showColumnCategoryColors: Boolean(parsedSettings.showColumnCategoryColors),
    colorMode: "none",
  };
}

function createSpreadsheetSavedViewId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `saved-view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function formatSpreadsheetSavedViewDate(value) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not saved yet";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function getSpreadsheetColumnCategoryLabel(category) {
  if (category === "both") {
    return "2025 + 2026";
  }

  if (category === "master-2025") {
    return "2025 only";
  }

  if (category === "master-2026") {
    return "2026 only";
  }

  if (category === "form-waitlist") {
    return "Form / Waitlist";
  }

  if (category === "raw-other") {
    return "Other original";
  }

  return "General";
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

function getSpreadsheetNumber(value) {
  const match = String(value || "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
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


function getSpreadsheetSchemaColumns(...columnGroups) {
  return Array.from(
    new Set(
      columnGroups.flatMap((columns) => Array.from(columns || []))
    )
  ).filter(Boolean);
}

const SPREADSHEET_2027_INQUIRY_COLUMNS = [
  "Arrival Date",
  "Departure Date",
  "Guest Group Name",
  "Guest Group Type",
  "Returning (R) or New (N)",
  "Contact Person",
  "Contact Person Cell #",
  "Estimated Number of Guests",
  "Buildings/Rooms",
  "Meals",
  "Food Allergies",
  "Need to know",
  "Linen Sets",
  "Activities",
  "Contact Person Email",
  "Stage of Group",
  "Min. Number of Paying Guests",
  "Max. Number of Paying Guests",
  "Guest Rate",
  "Exp. Minimum Revenue",
  "Schedule",
  "Deposit",
  "Deposit Received",
  "Date of Cancellation",
  "Reason for Cancellation",
  "Vacancy filled by another group?",
  "#Persons",
  "#Nights",
  "#Meals",
  "Camper Days (nightsX0.4 + mealsX0.2)",
  "Usage Fee",
  "$ Lodging",
  "$ Food",
  "$ Misc",
];

const SPREADSHEET_FORM_SCHEMA_FIELDS = [
  "Organization / Church or Ministry Name",
  "Contact Name",
  "Email",
  "Phone",
  "Desired Dates",
  "Group Size",
  "Retreat Type",
  "Promo Code",
  "Message / Notes",
];

const SPREADSHEET_SCHEMA_FIELD_MAPPINGS = [
  {
    appField: "Organization",
    sourceHeaders: ["Guest Group Name", "Organization", "Church/Ministry Name"],
  },
  {
    appField: "Contact Name",
    sourceHeaders: ["Contact Person", "Contact Name", "Name"],
  },
  {
    appField: "Email",
    sourceHeaders: ["Contact Person Email", "Email"],
  },
  {
    appField: "Phone",
    sourceHeaders: ["Contact Person Cell #", "Phone", "Cell #"],
  },
  {
    appField: "Start Date",
    sourceHeaders: ["Arrival Date", "Start Date"],
  },
  {
    appField: "End Date",
    sourceHeaders: ["Departure Date", "End Date"],
  },
  {
    appField: "Guest Count",
    sourceHeaders: ["Estimated Number of Guests", "#Persons", "Group Size"],
  },
  {
    appField: "Buildings / Rooms",
    sourceHeaders: ["Buildings/Rooms", "Assigned Room / Area"],
  },
  {
    appField: "Meals",
    sourceHeaders: ["Meals", "#Meals"],
  },
  {
    appField: "Food Allergies",
    sourceHeaders: ["Food Allergies"],
  },
  {
    appField: "Need To Know",
    sourceHeaders: ["Need to know", "Need To Know"],
  },
  {
    appField: "Activities",
    sourceHeaders: ["Activities"],
  },
  {
    appField: "Financials",
    sourceHeaders: [
      "Usage Fee",
      "$ Lodging",
      "$ Food",
      "$ Misc",
      "Deposit",
      "Deposit Received",
      "Guest Rate",
      "Exp. Minimum Revenue",
    ],
  },
];

const SPREADSHEET_IMPORT_SCHEMAS = [
  {
    id: "public-form",
    title: "Public Form / Manual Entry",
    badge: "No spreadsheet",
    summary:
      "Rows submitted through the public form do not need spreadsheet headers. The app reads the form fields directly.",
    expectedFile: "None",
    detectedAs: 'sourceType is "Form" or empty',
    inputMethod: "Public Form",
    sourceSheet: "Public Form / No Sheet",
    expectedColumns: SPREADSHEET_FORM_SCHEMA_FIELDS,
    notes: [
      "Best for new inquiries submitted through the website form.",
      "Missing email or phone values are displayed as N/A in the spreadsheet.",
      "These rows usually do not have original spreadsheet columns.",
    ],
  },
  {
    id: "master-2025",
    title: "Master / 2025 Import",
    badge: "Spreadsheet import",
    summary:
      "Use this for older master-booking spreadsheets that follow the 2025-style columns.",
    expectedFile: ".xlsx workbook with header row",
    detectedAs: 'sourceType becomes "Master"',
    inputMethod: "Imported - Master",
    sourceSheet: "The worksheet name from the Excel file",
    expectedColumns: getSpreadsheetSchemaColumns(
      SPREADSHEET_SHARED_RAW_COLUMNS,
      SPREADSHEET_2025_RAW_COLUMNS
    ),
    notes: [
      "The imported row is normalized into the standard booking fields where possible.",
      "Extra spreadsheet columns are still preserved as Original columns.",
      "Source Sheet and Source Row are stored so staff can trace the row back to the workbook.",
    ],
  },
  {
    id: "master-2026",
    title: "Master 2026 Import",
    badge: "Spreadsheet import",
    summary:
      "Use this for the 2026 master spreadsheet format. This is the cleaner current master-booking structure.",
    expectedFile: ".xlsx workbook with header row",
    detectedAs: 'sourceType becomes "Master 2026"',
    inputMethod: "Imported - Master 2026",
    sourceSheet: "The worksheet name from the Excel file",
    expectedColumns: getSpreadsheetSchemaColumns(
      SPREADSHEET_SHARED_RAW_COLUMNS,
      SPREADSHEET_2026_RAW_COLUMNS
    ),
    notes: [
      "Best for the main 2026 booking spreadsheet.",
      "Shared columns are treated as compatible with other master imports.",
      "2026-only columns are still visible as Original columns if enabled.",
    ],
  },
  {
    id: "inquiry-2027",
    title: "2027 Inquiry Import",
    badge: "Spreadsheet import",
    summary:
      "Use this for the 2027 inquiry sheet format with arrival/departure dates, guest group details, meals, activities, financials, and cancellation fields.",
    expectedFile: ".xlsx workbook with 2027 inquiry headers",
    detectedAs: 'sourceType becomes "2027 Inquiry"',
    inputMethod: "Imported - 2027 Inquiry",
    sourceSheet: "Any worksheet name containing the imported 2027 inquiry rows",
    expectedColumns: SPREADSHEET_2027_INQUIRY_COLUMNS,
    notes: [
      "Best for the 2027 inquiry / planning spreadsheet.",
      "Arrival Date and Departure Date become the main booking date range.",
      "Financial and logistics columns are preserved so they can be shown or hidden in the spreadsheet.",
    ],
  },
];

function SpreadsheetSchemaChipList({ title, items }) {
  const cleanItems = Array.from(new Set((items || []).filter(Boolean)));

  return (
    <div className="spreadsheet-schema-field-block">
      <h5>{title}</h5>

      {cleanItems.length > 0 ? (
        <div className="spreadsheet-schema-chip-list">
          {cleanItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : (
        <p>No fixed spreadsheet headers required.</p>
      )}
    </div>
  );
}

function SpreadsheetSettingsModal({
  settings,
  updateSettings,
  allColumns,
  orderedColumns,
  summaryCards,
  sourceTypeOptions,
  inputMethodCounts,
  sourceSheetOptions,
  sourceSheetCounts,
  statusOptions,
  filteredCount,
  totalCount,
  processedBookingCount,
  isProcessingRemainingRows,
  savedViews,
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState("Sources");

  const [savedViewName, setSavedViewName] = useState("");

  const handleSaveSavedView = () => {
    const cleanName = savedViewName.trim();

    if (!cleanName) {
      return;
    }

    onSaveSavedView(cleanName);
    setSavedViewName("");
  };


  const visibleColumnIds =
    settings.visibleColumnIds || allColumns.map((column) => column.id);

  const allSummaryCardIds = summaryCards.map((card) => card.id);

  const visibleSummaryCardIds =
    settings.visibleSummaryCardIds || allSummaryCardIds;

  const toggleSummaryCardVisibility = (cardId) => {
    const currentVisibleIds = settings.visibleSummaryCardIds || allSummaryCardIds;

    const nextVisibleIds = currentVisibleIds.includes(cardId)
      ? currentVisibleIds.filter((id) => id !== cardId)
      : [...currentVisibleIds, cardId];

    updateSettings({
      visibleSummaryCardIds:
        nextVisibleIds.length === allSummaryCardIds.length
          ? null
          : nextVisibleIds,
    });
  };

  const toggleColumnVisibility = (columnId) => {
    const currentVisibleIds =
      settings.visibleColumnIds || allColumns.map((column) => column.id);

    const nextVisibleIds = currentVisibleIds.includes(columnId)
      ? currentVisibleIds.filter((id) => id !== columnId)
      : [...currentVisibleIds, columnId];

    updateSettings({
      visibleColumnIds:
        nextVisibleIds.length === allColumns.length ? null : nextVisibleIds,
    });
  };

  const moveColumn = (columnId, direction) => {
    const currentOrder = orderedColumns.map((column) => column.id);
    const currentIndex = currentOrder.indexOf(columnId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) {
      return;
    }

    const nextOrder = [...currentOrder];
    const [removedColumnId] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, removedColumnId);

    updateSettings({ columnOrder: nextOrder });
  };

  const showOnlyEssentialColumns = () => {
    const essentialColumnIds = allColumns
      .filter((column) => SPREADSHEET_ESSENTIAL_COLUMN_LABELS.has(column.label))
      .map((column) => column.id);

    updateSettings({ visibleColumnIds: essentialColumnIds });
  };

  const hideOriginalColumns = () => {
    const nonRawColumnIds = allColumns
      .filter((column) => column.type !== "raw")
      .map((column) => column.id);

    updateSettings({ visibleColumnIds: nonRawColumnIds });
  };

  return (
    <div className="spreadsheet-settings-backdrop" role="presentation">
      <section
        className="spreadsheet-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Spreadsheet settings"
      >
        <header className="spreadsheet-settings-modal-header">
          <div>
            <p className="dashboard-eyebrow">Spreadsheet Settings</p>
            <h3>Customize All Booking Data</h3>
            <span>
              Showing {filteredCount} matching row{filteredCount === 1 ? "" : "s"} from{" "}
              {processedBookingCount} processed row{processedBookingCount === 1 ? "" : "s"}
              {isProcessingRemainingRows
                ? ` while ${totalCount - processedBookingCount} more continue loading.`
                : "."}
            </span>
          </div>

          <button
            className="spreadsheet-settings-close-button"
            type="button"
            onClick={onClose}
            aria-label="Close spreadsheet settings"
          >
            <FaTimes />
          </button>
        </header>

        <div className="spreadsheet-settings-tabs">
          {[
            "Sources",
            "Columns",
            "Filters",
            "Sorting",
            "Highlights",
            "Display",
            "Schema",
            "Saved Views",
          ].map(
  (tab) => (
              <button
                className={activeSettingsTab === tab ? "active" : ""}
                type="button"
                key={tab}
                onClick={() => setActiveSettingsTab(tab)}
              >
                {tab}
              </button>
            )
          )}
        </div>

        <div className="spreadsheet-settings-body">
          {activeSettingsTab === "Sources" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-source-mode-toggle">
                <button
                  className={
                    settings.sourceFilterMode === "sourceSheet" ? "active" : ""
                  }
                  type="button"
                  onClick={() =>
                    updateSettings({
                      sourceFilterMode: "sourceSheet",
                      sourceTypes: [],
                    })
                  }
                >
                  Source Sheet
                </button>

                <button
                  className={
                    settings.sourceFilterMode === "inputMethod" ? "active" : ""
                  }
                  type="button"
                  onClick={() =>
                    updateSettings({
                      sourceFilterMode: "inputMethod",
                      sourceSheets: [],
                    })
                  }
                >
                  Input Method
                </button>
              </div>

              {settings.sourceFilterMode === "sourceSheet" ? (
                <>
                  <div className="spreadsheet-settings-actions-row">
                    <button
                      type="button"
                      onClick={() => updateSettings({ sourceSheets: [] })}
                    >
                      Show All Source Sheets
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceSheets: sourceSheetOptions.filter((sourceSheet) =>
                            sourceSheet.toLowerCase().includes("waitlist")
                          ),
                        })
                      }
                    >
                      Waitlist Sheets Only
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceSheets: sourceSheetOptions.filter((sourceSheet) =>
                            sourceSheet.toLowerCase().includes("2027")
                          ),
                        })
                      }
                    >
                      2027 Sheets Only
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceSheets: sourceSheetOptions.filter((sourceSheet) =>
                            sourceSheet.toLowerCase().includes("2026")
                          ),
                        })
                      }
                    >
                      2026 Sheets Only
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceSheets: sourceSheetOptions.filter((sourceSheet) =>
                            sourceSheet.toLowerCase().includes("2025")
                          ),
                        })
                      }
                    >
                      2025 Sheets Only
                    </button>
                  </div>

                  <div className="spreadsheet-input-method-list">
                    {sourceSheetOptions.map((sourceSheet) => {
                      const isVisible =
                        settings.sourceSheets.length === 0 ||
                        settings.sourceSheets.includes(sourceSheet);

                      return (
                        <div
                          className={`spreadsheet-input-method-row ${
                            isVisible ? "is-visible" : "is-hidden"
                          }`}
                          key={sourceSheet}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                if (settings.sourceSheets.length === 0) {
                                  updateSettings({
                                    sourceSheets: sourceSheetOptions.filter(
                                      (option) => option !== sourceSheet
                                    ),
                                  });

                                  return;
                                }

                                updateSettings({
                                  sourceSheets: toggleSpreadsheetArrayValue(
                                    settings.sourceSheets,
                                    sourceSheet
                                  ),
                                });
                              }}
                            />

                            <span>
                              <strong>{sourceSheet}</strong>
                              <small>
                                {sourceSheetCounts[sourceSheet] || 0} row
                                {(sourceSheetCounts[sourceSheet] || 0) === 1 ? "" : "s"}
                              </small>
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              updateSettings({ sourceSheets: [sourceSheet] })
                            }
                          >
                            Only
                          </button>
                        </div>
                      );
                    })}

                    {sourceSheetOptions.length === 0 && (
                      <div className="spreadsheet-input-method-empty">
                        <strong>No source sheets yet</strong>
                        <p>
                          Import a spreadsheet or submit a form to see source sheets here.
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="spreadsheet-settings-help-text">
                    Source Sheet groups rows by the worksheet they came from. Form/manual rows
                    appear under Public Form / No Sheet.
                  </p>
                </>
              ) : (
                <>
                  <div className="spreadsheet-settings-actions-row">
                    <button
                      type="button"
                      onClick={() => updateSettings({ sourceTypes: [] })}
                    >
                      Show All Input Methods
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceTypes: sourceTypeOptions.filter((sourceType) =>
                            sourceType.toLowerCase().includes("form")
                          ),
                        })
                      }
                    >
                      Forms Only
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceTypes: sourceTypeOptions.filter(
                            (sourceType) =>
                              !sourceType.toLowerCase().includes("form")
                          ),
                        })
                      }
                    >
                      Imports Only
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSettings({
                          sourceTypes: sourceTypeOptions.filter((sourceType) =>
                            sourceType.toLowerCase().includes("waitlist")
                          ),
                        })
                      }
                    >
                      Waitlist Only
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        sourceTypes: sourceTypeOptions.filter((sourceType) =>
                          sourceType.toLowerCase().includes("2027")
                        ),
                      })
                    }
                  >
                    2027 Only
                  </button>

                  <div className="spreadsheet-input-method-list">
                    {sourceTypeOptions.map((sourceType) => {
                      const isVisible =
                        settings.sourceTypes.length === 0 ||
                        settings.sourceTypes.includes(sourceType);

                      return (
                        <div
                          className={`spreadsheet-input-method-row ${
                            isVisible ? "is-visible" : "is-hidden"
                          }`}
                          key={sourceType}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                if (settings.sourceTypes.length === 0) {
                                  updateSettings({
                                    sourceTypes: sourceTypeOptions.filter(
                                      (option) => option !== sourceType
                                    ),
                                  });

                                  return;
                                }

                                updateSettings({
                                  sourceTypes: toggleSpreadsheetArrayValue(
                                    settings.sourceTypes,
                                    sourceType
                                  ),
                                });
                              }}
                            />

                            <span>
                              <strong>{sourceType}</strong>
                              <small>
                                {inputMethodCounts[sourceType] || 0} row
                                {(inputMethodCounts[sourceType] || 0) === 1 ? "" : "s"}
                              </small>
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              updateSettings({ sourceTypes: [sourceType] })
                            }
                          >
                            Only
                          </button>
                        </div>
                      );
                    })}

                    {sourceTypeOptions.length === 0 && (
                      <div className="spreadsheet-input-method-empty">
                        <strong>No input methods yet</strong>
                        <p>
                          Import a spreadsheet or submit a form to see input methods here.
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="spreadsheet-settings-help-text">
                    Input Method groups rows by how the data entered the system.
                  </p>
                </>
              )}
            </div>
          )}
          {activeSettingsTab === "Filters" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-settings-grid">
                <label className="spreadsheet-settings-field spreadsheet-settings-field-wide">
                  <span>Search Everything</span>
                  <input
                    value={settings.searchText}
                    placeholder="Search organization, contact, rooms, notes, raw spreadsheet values..."
                    onChange={(event) =>
                      updateSettings({ searchText: event.target.value })
                    }
                  />
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Waitlist</span>
                  <select
                    value={settings.waitlist}
                    onChange={(event) =>
                      updateSettings({ waitlist: event.target.value })
                    }
                  >
                    <option value="all">All</option>
                    <option value="yes">Waitlist only</option>
                    <option value="no">Not waitlisted</option>
                  </select>
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Has Email</span>
                  <select
                    value={settings.hasEmail}
                    onChange={(event) =>
                      updateSettings({ hasEmail: event.target.value })
                    }
                  >
                    <option value="all">All</option>
                    <option value="yes">Has email</option>
                    <option value="no">Missing email</option>
                  </select>
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Has Phone</span>
                  <select
                    value={settings.hasPhone}
                    onChange={(event) =>
                      updateSettings({ hasPhone: event.target.value })
                    }
                  >
                    <option value="all">All</option>
                    <option value="yes">Has phone</option>
                    <option value="no">Missing phone</option>
                  </select>
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={settings.startDate}
                    onChange={(event) =>
                      updateSettings({ startDate: event.target.value })
                    }
                  />
                </label>

                <label className="spreadsheet-settings-field">
                  <span>End Date</span>
                  <input
                    type="date"
                    value={settings.endDate}
                    onChange={(event) =>
                      updateSettings({ endDate: event.target.value })
                    }
                  />
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Min Guests</span>
                  <input
                    type="number"
                    min="0"
                    value={settings.minGuests}
                    onChange={(event) =>
                      updateSettings({ minGuests: event.target.value })
                    }
                  />
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Max Guests</span>
                  <input
                    type="number"
                    min="0"
                    value={settings.maxGuests}
                    onChange={(event) =>
                      updateSettings({ maxGuests: event.target.value })
                    }
                  />
                </label>
              </div>

              

              <div className="spreadsheet-settings-check-group">
                <h4>Statuses</h4>

                {statusOptions.map((status) => (
                  <label key={status}>
                    <input
                      type="checkbox"
                      checked={settings.statuses.includes(status)}
                      onChange={() =>
                        updateSettings({
                          statuses: toggleSpreadsheetArrayValue(
                            settings.statuses,
                            status
                          ),
                        })
                      }
                    />
                    <span>{status}</span>
                  </label>
                ))}

                {statusOptions.length === 0 && <p>No statuses yet.</p>}
              </div>
            </div>
          )}

          {activeSettingsTab === "Sorting" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-settings-grid">
                <label className="spreadsheet-settings-field">
                  <span>Sort Column</span>
                  <select
                    value={settings.sortColumnId}
                    onChange={(event) =>
                      updateSettings({ sortColumnId: event.target.value })
                    }
                  >
                    {allColumns.map((column) => (
                      <option value={column.id} key={column.id}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Direction</span>
                  <select
                    value={settings.sortDirection}
                    onChange={(event) =>
                      updateSettings({ sortDirection: event.target.value })
                    }
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </label>
              </div>

              <p className="spreadsheet-settings-help-text">
                You can also click any table header to sort by that column.
              </p>
            </div>
          )}

          {activeSettingsTab === "Columns" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-settings-actions-row">
                <button type="button" onClick={() => updateSettings({ visibleColumnIds: null })}>
                  Show All
                </button>

                <button type="button" onClick={showOnlyEssentialColumns}>
                  Essentials Only
                </button>

                <button type="button" onClick={hideOriginalColumns}>
                  Hide Original Columns
                </button>

                <button type="button" onClick={() => updateSettings({ columnOrder: null })}>
                  Reset Order
                </button>
              </div>

              <div className="spreadsheet-column-settings-list">
                {orderedColumns.map((column, index) => (
                  <div className="spreadsheet-column-settings-row" key={column.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={visibleColumnIds.includes(column.id)}
                        onChange={() => toggleColumnVisibility(column.id)}
                      />

                      <span>
                        <strong>{column.label}</strong>
                        <small>
                          {column.type === "raw" ? "Original column" : "Standard column"} ·{" "}
                          {getSpreadsheetColumnCategoryLabel(column.sourceCategory)}
                        </small>
                      </span>
                    </label>

                    <div>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveColumn(column.id, -1)}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        disabled={index === orderedColumns.length - 1}
                        onClick={() => moveColumn(column.id, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSettingsTab === "Highlights" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-settings-check-group">
                <h4>Column Colors</h4>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.showColumnCategoryColors}
                    onChange={(event) =>
                      updateSettings({
                        showColumnCategoryColors: event.target.checked,
                      })
                    }
                  />
                  <span>Color columns by year/source category</span>
                </label>
              </div>
              <div className="spreadsheet-settings-grid">

                <label className="spreadsheet-settings-field">
                  <span>Highlight Text / Material</span>
                  <input
                    value={settings.customHighlightText}
                    placeholder="Example: allergy, deposit, Hebron, cancelled"
                    onChange={(event) =>
                      updateSettings({ customHighlightText: event.target.value })
                    }
                  />
                </label>

                <label className="spreadsheet-settings-field">
                  <span>Highlight Scope</span>
                  <select
                    value={settings.customHighlightColumnId}
                    onChange={(event) =>
                      updateSettings({
                        customHighlightColumnId: event.target.value,
                      })
                    }
                  >
                    <option value="all">All columns</option>

                    {allColumns.map((column) => (
                      <option value={column.id} key={column.id}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="spreadsheet-settings-check-group">
                <h4>Highlight Rules</h4>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.highlightMissingContact}
                    onChange={(event) =>
                      updateSettings({
                        highlightMissingContact: event.target.checked,
                      })
                    }
                  />
                  <span>Rows missing both email and phone</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.highlightMissingDates}
                    onChange={(event) =>
                      updateSettings({
                        highlightMissingDates: event.target.checked,
                      })
                    }
                  />
                  <span>Rows missing dates</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.highlightWaitlist}
                    onChange={(event) =>
                      updateSettings({
                        highlightWaitlist: event.target.checked,
                      })
                    }
                  />
                  <span>Waitlist rows</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.highlightCancelled}
                    onChange={(event) =>
                      updateSettings({
                        highlightCancelled: event.target.checked,
                      })
                    }
                  />
                  <span>Cancelled rows</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.highlightFoodAllergies}
                    onChange={(event) =>
                      updateSettings({
                        highlightFoodAllergies: event.target.checked,
                      })
                    }
                  />
                  <span>Food allergy cells</span>
                </label>
              </div>

              {settings.showColumnCategoryColors && (
                <div className="spreadsheet-color-legend">
                  <span className="spreadsheet-column-both-years">2025 + 2026</span>
                  <span className="spreadsheet-column-2025-only">2025 only</span>
                  <span className="spreadsheet-column-2026-only">2026 only</span>
                  <span className="spreadsheet-column-form-waitlist">Form / Waitlist</span>
                  <span className="spreadsheet-column-raw-other">Other Original</span>
                </div>
              )}
            </div>
          )}

          {activeSettingsTab === "Display" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-settings-check-group spreadsheet-summary-card-settings-panel">
                <h4>Summary Cards</h4>

                <p className="spreadsheet-settings-help-text">
                  Choose which cards appear at the top of the Spreadsheet View.
                </p>

                <div className="spreadsheet-settings-actions-row">
                  <button
                    type="button"
                    onClick={() => updateSettings({ visibleSummaryCardIds: null })}
                  >
                    Show All Cards
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSettings({ visibleSummaryCardIds: [] })}
                  >
                    Hide All Cards
                  </button>
                </div>

                <div className="spreadsheet-summary-card-settings-list">
                  {summaryCards.map((card) => {
                    const isVisible = visibleSummaryCardIds.includes(card.id);

                    return (
                      <label
                        className={`spreadsheet-summary-card-setting ${card.className} ${
                          isVisible ? "is-visible" : "is-hidden"
                        }`}
                        key={card.id}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleSummaryCardVisibility(card.id)}
                        />

                        <span>
                          <strong>{card.label}</strong>
                          <small>Current value: {card.value}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="spreadsheet-settings-check-group">
                <h4>Table Display</h4>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.freezeFirstColumn}
                    onChange={(event) =>
                      updateSettings({ freezeFirstColumn: event.target.checked })
                    }
                  />
                  <span>Freeze first visible column</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.compactRows}
                    onChange={(event) =>
                      updateSettings({ compactRows: event.target.checked })
                    }
                  />
                  <span>Compact rows</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.showStarredRowsFirst)}
                    onChange={(event) =>
                      updateSettings({ showStarredRowsFirst: event.target.checked })
                    }
                  />
                  <span>Show starred rows first</span>
                </label>
              </div>
            </div>
          )}

          {activeSettingsTab === "Schema" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-schema-intro">
                <div>
                  <h4>Import Schema Reference</h4>
                  <p>
                    This explains what each import option expects, how imported rows are
                    detected, and where the imported data appears in the spreadsheet.
                  </p>
                </div>

                <span>{SPREADSHEET_IMPORT_SCHEMAS.length} import types</span>
              </div>

              <div className="spreadsheet-schema-grid">
                {SPREADSHEET_IMPORT_SCHEMAS.map((schema) => (
                  <article className="spreadsheet-schema-card" key={schema.id}>
                    <header className="spreadsheet-schema-card-header">
                      <div>
                        <span>{schema.badge}</span>
                        <h4>{schema.title}</h4>
                        <p>{schema.summary}</p>
                      </div>
                    </header>

                    <dl className="spreadsheet-schema-meta">
                      <div>
                        <dt>Expected file</dt>
                        <dd>{schema.expectedFile}</dd>
                      </div>

                      <div>
                        <dt>Detected as</dt>
                        <dd>{schema.detectedAs}</dd>
                      </div>

                      <div>
                        <dt>Input Method</dt>
                        <dd>{schema.inputMethod}</dd>
                      </div>

                      <div>
                        <dt>Source Sheet</dt>
                        <dd>{schema.sourceSheet}</dd>
                      </div>
                    </dl>

                    <SpreadsheetSchemaChipList
                      title="Expected / recognized columns"
                      items={schema.expectedColumns}
                    />

                    <div className="spreadsheet-schema-notes">
                      <h5>What happens after import</h5>

                      <ul>
                        {schema.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>

              <article className="spreadsheet-schema-mapping-card">
                <div>
                  <h4>Standard Field Mapping</h4>
                  <p>
                    These are the main source headers staff should look for when preparing
                    an import file. The app tries to normalize these into the standard
                    spreadsheet columns.
                  </p>
                </div>

                <div className="spreadsheet-schema-mapping-list">
                  {SPREADSHEET_SCHEMA_FIELD_MAPPINGS.map((mapping) => (
                    <div className="spreadsheet-schema-mapping-row" key={mapping.appField}>
                      <strong>{mapping.appField}</strong>

                      <div>
                        {mapping.sourceHeaders.map((header) => (
                          <span key={header}>{header}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <p className="spreadsheet-settings-help-text">
                Extra imported columns are not thrown away. They are preserved from
                rawSpreadsheetData and can appear in the Columns tab as Original columns.
              </p>
            </div>
          )}

          {activeSettingsTab === "Saved Views" && (
            <div className="spreadsheet-settings-section">
              <div className="spreadsheet-saved-views-create">
                <div>
                  <h4>Save Current View</h4>
                  <p>
                    Save your current sources, filters, sorting, columns, highlights, and
                    display choices as a reusable view.
                  </p>
                </div>

                <label className="spreadsheet-settings-field">
                  <span>View Name</span>
                  <input
                    value={savedViewName}
                    placeholder="Example: Simplified View"
                    onChange={(event) => setSavedViewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSaveSavedView();
                      }
                    }}
                  />
                </label>

                <button
                  className="primary-dashboard-button"
                  type="button"
                  disabled={!savedViewName.trim()}
                  onClick={handleSaveSavedView}
                >
                  Save View
                </button>
              </div>

              {savedViews.length > 0 ? (
                <div className="spreadsheet-saved-views-list">
                  {savedViews.map((savedView) => (
                    <article
                      className={`spreadsheet-saved-view-card ${
                        savedView.isDefault ? "is-default" : ""
                      }`}
                      key={savedView.id}
                    >
                      <div className="spreadsheet-saved-view-main">
                        <div>
                          <h4>{savedView.name}</h4>

                          {savedView.isDefault && (
                            <span className="spreadsheet-saved-view-badge">
                              Startup View
                            </span>
                          )}
                        </div>

                        <p>
                          Last updated{" "}
                          {formatSpreadsheetSavedViewDate(
                            savedView.updatedAt || savedView.createdAt
                          )}
                        </p>

                        <label className="spreadsheet-saved-view-default">
                          <input
                            type="checkbox"
                            checked={Boolean(savedView.isDefault)}
                            onChange={(event) =>
                              onSetDefaultSavedView(
                                event.target.checked ? savedView.id : null
                              )
                            }
                          />
                          <span>Use this view when Spreadsheet View opens</span>
                        </label>
                      </div>

                      <div className="spreadsheet-saved-view-actions">
                        <button
                          type="button"
                          onClick={() => onApplySavedView(savedView.id)}
                        >
                          Apply
                        </button>

                        <button
                          type="button"
                          onClick={() => onUpdateSavedView(savedView.id)}
                        >
                          Update
                        </button>

                        <button
                          className="spreadsheet-saved-view-danger"
                          type="button"
                          onClick={() => onDeleteSavedView(savedView.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="spreadsheet-saved-views-empty">
                  <strong>No saved views yet</strong>
                  <p>
                    Adjust your spreadsheet settings, name the setup, and save it here.
                  </p>
                </div>
              )}

              <p className="spreadsheet-settings-help-text">
                Applying a saved view changes the spreadsheet immediately. Updating a saved
                view overwrites it with whatever your current settings are.
              </p>
            </div>
          )}
        </div>

        <footer className="spreadsheet-settings-footer">
          <button className="secondary-dashboard-button" type="button" onClick={onReset}>
            Reset Settings
          </button>

          <button className="primary-dashboard-button" type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

function SpreadsheetViewLoadingScreen({ rowCount }) {
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

function SpreadsheetFirstChunkLoadingOverlay({ rowCount, firstChunkCount }) {
  return (
    <div
      className="spreadsheet-first-chunk-loading-overlay"
      role="status"
      aria-live="polite"
    >
      <article className="dashboard-card spreadsheet-view-card spreadsheet-loading-card">
        <div className="spreadsheet-loading-hero">
          <span className="spreadsheet-loading-icon">
            <FaTable />
          </span>

          <div className="spreadsheet-loading-copy">
            <p className="dashboard-eyebrow">Spreadsheet View</p>
            <h2>Preparing the first rows</h2>
            <p>
              Showing the page as soon as the first {firstChunkCount} row
              {firstChunkCount === 1 ? "" : "s"} are ready. The rest will keep
              loading in the background.
            </p>
          </div>

          <span className="spreadsheet-loading-spinner" aria-hidden="true" />
        </div>

        <div className="spreadsheet-loading-summary">
          <span>
            <strong>{firstChunkCount}</strong>
            First rows
          </span>

          <span>
            <strong>{rowCount}</strong>
            Total rows
          </span>

          <span>
            <strong>Fast</strong>
            Startup
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
    </div>
  );
}

function BookingSpreadsheetView({
  inquiryBookings,
  openBookingDetail,
  holdLoadingScreenUntilFirstChunk = false,
  isDataStillLoading = false,
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isFirstChunkPainted, setIsFirstChunkPainted] = useState(
    !holdLoadingScreenUntilFirstChunk
  );

  const [processedBookingLimit, setProcessedBookingLimit] = useState(
    SPREADSHEET_INITIAL_ROW_LIMIT
  );
  const [spreadsheetSettings, setSpreadsheetSettings] = useState(() =>
    getSavedSpreadsheetSettings()
  );

  const [savedSpreadsheetViews, setSavedSpreadsheetViews] = useState(() =>
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
    const safeBookings = Array.isArray(inquiryBookings) ? inquiryBookings : [];

    return safeBookings.slice(
      0,
      Math.min(processedBookingLimit, safeBookings.length)
    );
  }, [inquiryBookings, processedBookingLimit]);

  const processedBookingCount = processedInquiryBookings.length;
  const totalBookingCount = inquiryBookings.length;

  const hasMoreRowsToProcess = processedBookingCount < totalBookingCount;

  const isProcessingRemainingRows =
    isDataStillLoading || hasMoreRowsToProcess;

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
    () => getRawSpreadsheetColumns(processedInquiryBookings),
    [processedInquiryBookings]
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
    if (!spreadsheetSettings.visibleColumnIds) {
      return orderedSpreadsheetColumns;
    }

    const visibleColumnIdSet = new Set(spreadsheetSettings.visibleColumnIds);

    return orderedSpreadsheetColumns.filter((column) =>
      visibleColumnIdSet.has(column.id)
    );
  }, [orderedSpreadsheetColumns, spreadsheetSettings.visibleColumnIds]);

  const sourceTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          processedInquiryBookings
            .map((booking) => getBookingInputMethod(booking))
            .filter(Boolean)
        )
      ).sort(),
    [processedInquiryBookings]
  );

  const inputMethodCounts = useMemo(() => {
    return processedInquiryBookings.reduce((counts, booking) => {
      const inputMethod = getBookingInputMethod(booking);

      counts[inputMethod] = (counts[inputMethod] || 0) + 1;

      return counts;
    }, {});
  }, [processedInquiryBookings]);

  const sourceSheetOptions = useMemo(
    () =>
      Array.from(
        new Set(
          processedInquiryBookings
            .map((booking) => getBookingSourceSheetLabel(booking))
            .filter(Boolean)
        )
      ).sort(),
    [processedInquiryBookings]
  );

  const sourceSheetCounts = useMemo(() => {
    return processedInquiryBookings.reduce((counts, booking) => {
      const sourceSheet = getBookingSourceSheetLabel(booking);

      counts[sourceSheet] = (counts[sourceSheet] || 0) + 1;

      return counts;
    }, {});
  }, [processedInquiryBookings]);

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          processedInquiryBookings
            .map((booking) => booking.status)
            .filter(Boolean)
        )
      ).sort(),
    [processedInquiryBookings]
  );

    const filteredAndSortedBookings = useMemo(() => {
    const searchText = spreadsheetSettings.searchText.trim().toLowerCase();
    const minGuests = getSpreadsheetNumber(spreadsheetSettings.minGuests);
    const maxGuests = getSpreadsheetNumber(spreadsheetSettings.maxGuests);

    const filteredBookings = processedInquiryBookings.filter((booking) => {
      if (
        searchText &&
        !getSpreadsheetSearchText(booking).includes(searchText)
      ) {
        return false;
      }

      if (spreadsheetSettings.sourceFilterMode === "inputMethod") {
        if (
          spreadsheetSettings.sourceTypes.length > 0 &&
          !spreadsheetSettings.sourceTypes.includes(
            getBookingInputMethod(booking)
          )
        ) {
          return false;
        }
      } else {
        if (
          spreadsheetSettings.sourceSheets.length > 0 &&
          !spreadsheetSettings.sourceSheets.includes(
            getBookingSourceSheetLabel(booking)
          )
        ) {
          return false;
        }
      }

      if (
        spreadsheetSettings.statuses.length > 0 &&
        !spreadsheetSettings.statuses.includes(booking.status)
      ) {
        return false;
      }

      if (spreadsheetSettings.waitlist !== "all") {
        const isWaitlisted =
          String(booking.waitlist || "").toLowerCase() === "yes";

        if (spreadsheetSettings.waitlist === "yes" && !isWaitlisted) {
          return false;
        }

        if (spreadsheetSettings.waitlist === "no" && isWaitlisted) {
          return false;
        }
      }

      if (
        !bookingTouchesSpreadsheetDateRange(
          booking,
          spreadsheetSettings.startDate,
          spreadsheetSettings.endDate
        )
      ) {
        return false;
      }

      const guestCount = getSpreadsheetNumber(
        booking.attendeeCount || booking.persons || booking.groupSize
      );

      if (minGuests !== null && (guestCount === null || guestCount < minGuests)) {
        return false;
      }

      if (maxGuests !== null && (guestCount === null || guestCount > maxGuests)) {
        return false;
      }

      const hasEmail = isSpreadsheetUsableValue(booking.email);
      const hasPhone = isSpreadsheetUsableValue(booking.phone);

      if (spreadsheetSettings.hasEmail === "yes" && !hasEmail) {
        return false;
      }

      if (spreadsheetSettings.hasEmail === "no" && hasEmail) {
        return false;
      }

      if (spreadsheetSettings.hasPhone === "yes" && !hasPhone) {
        return false;
      }

      if (spreadsheetSettings.hasPhone === "no" && hasPhone) {
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

      return spreadsheetSettings.sortDirection === "desc" ? -result : result;
    });
  }, [
    processedInquiryBookings,
    spreadsheetSettings,
    allSpreadsheetColumns,
    starredSpreadsheetBookingIdSet,
  ]);


  const sourceTypesResetKey = spreadsheetSettings.sourceTypes.join("|");
  const sourceSheetsResetKey = spreadsheetSettings.sourceSheets.join("|");
  const statusesResetKey = spreadsheetSettings.statuses.join("|");

  const spreadsheetProcessingResetKey = useMemo(
    () =>
      [
        spreadsheetSettings.searchText,
        spreadsheetSettings.sourceFilterMode,
        sourceTypesResetKey,
        sourceSheetsResetKey,
        statusesResetKey,
        spreadsheetSettings.waitlist,
        spreadsheetSettings.startDate,
        spreadsheetSettings.endDate,
        spreadsheetSettings.minGuests,
        spreadsheetSettings.maxGuests,
        spreadsheetSettings.hasEmail,
        spreadsheetSettings.hasPhone,
        spreadsheetSettings.sortColumnId,
        spreadsheetSettings.sortDirection,
        spreadsheetSettings.showStarredRowsFirst,
        spreadsheetSettings.visibleColumnIds
          ? spreadsheetSettings.visibleColumnIds.join("|")
          : "all-columns",
        spreadsheetSettings.columnOrder
          ? spreadsheetSettings.columnOrder.join("|")
          : "default-order",
      ].join("::"),
    [
      spreadsheetSettings.searchText,
      spreadsheetSettings.sourceFilterMode,
      sourceTypesResetKey,
      sourceSheetsResetKey,
      statusesResetKey,
      spreadsheetSettings.waitlist,
      spreadsheetSettings.startDate,
      spreadsheetSettings.endDate,
      spreadsheetSettings.minGuests,
      spreadsheetSettings.maxGuests,
      spreadsheetSettings.hasEmail,
      spreadsheetSettings.hasPhone,
      spreadsheetSettings.sortColumnId,
      spreadsheetSettings.sortDirection,
      spreadsheetSettings.showStarredRowsFirst,
      spreadsheetSettings.visibleColumnIds,
      spreadsheetSettings.columnOrder,
    ]
  );

  const firstBookingKey = inquiryBookings[0]
    ? getSpreadsheetBookingStarId(inquiryBookings[0])
    : "empty";

  const firstChunkLoadingKey = `${inquiryBookings.length > 0 ? "has-rows" : "empty"}::${firstBookingKey}`;

  const visibleProgressiveBookings = filteredAndSortedBookings;

  const hasMoreProgressiveRows = isProcessingRemainingRows;

  useEffect(() => {
    setProcessedBookingLimit(SPREADSHEET_INITIAL_ROW_LIMIT);
  }, [spreadsheetProcessingResetKey]);

  useEffect(() => {
    if (!holdLoadingScreenUntilFirstChunk) {
      return;
    }

    setIsFirstChunkPainted(false);
  }, [holdLoadingScreenUntilFirstChunk, firstChunkLoadingKey]);

  useEffect(() => {
    if (!holdLoadingScreenUntilFirstChunk || isFirstChunkPainted) {
      return;
    }

    const hasSomethingReadyToShow =
      visibleProgressiveBookings.length > 0 ||
      processedInquiryBookings.length > 0 ||
      inquiryBookings.length === 0;

    if (!hasSomethingReadyToShow) {
      return;
    }

    let secondFrameId = 0;

    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        setIsFirstChunkPainted(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);

      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [
    holdLoadingScreenUntilFirstChunk,
    isFirstChunkPainted,
    visibleProgressiveBookings.length,
    processedInquiryBookings.length,
    inquiryBookings.length,
  ]);

  useEffect(() => {
    if (!isFirstChunkPainted || !hasMoreRowsToProcess) {
      return;
    }

    const processNextChunk = () => {
      setProcessedBookingLimit((currentLimit) =>
        Math.min(
          currentLimit + SPREADSHEET_ROW_BATCH_SIZE,
          inquiryBookings.length
        )
      );
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(processNextChunk, {
        timeout: 250,
      });

      return () => window.cancelIdleCallback(idleId);
    }

    const renderTimer = window.setTimeout(
      processNextChunk,
      SPREADSHEET_BACKGROUND_RENDER_DELAY
    );

    return () => window.clearTimeout(renderTimer);
  }, [
    isFirstChunkPainted,
    hasMoreRowsToProcess,
    inquiryBookings.length,
    processedBookingLimit,
  ]);

  const updateSpreadsheetSettings = (updates) => {
    setSpreadsheetSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
    }));
  };

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

  const resetSpreadsheetSettings = () => {
    setSpreadsheetSettings(getDefaultSpreadsheetSettings());
  };

  const saveCurrentSpreadsheetSavedView = (viewName) => {
    const cleanName = String(viewName || "").trim();

    if (!cleanName) {
      return;
    }

    const now = new Date().toISOString();
    const settingsSnapshot = normalizeSpreadsheetSettings(spreadsheetSettings);

    setSavedSpreadsheetViews((currentViews) => {
      const existingView = currentViews.find(
        (savedView) =>
          savedView.name.trim().toLowerCase() === cleanName.toLowerCase()
      );

      if (existingView) {
        return currentViews.map((savedView) =>
          savedView.id === existingView.id
            ? {
                ...savedView,
                name: cleanName,
                settings: settingsSnapshot,
                updatedAt: now,
              }
            : savedView
        );
      }

      return [
        ...currentViews,
        {
          id: createSpreadsheetSavedViewId(),
          name: cleanName,
          settings: settingsSnapshot,
          createdAt: now,
          updatedAt: now,
          isDefault: false,
        },
      ];
    });
  };

  const applySpreadsheetSavedView = (savedViewId) => {
    const savedView = savedSpreadsheetViews.find(
      (currentSavedView) => currentSavedView.id === savedViewId
    );

    if (!savedView) {
      return;
    }

    setSpreadsheetSettings(normalizeSpreadsheetSettings(savedView.settings));
  };

  const updateSpreadsheetSavedView = (savedViewId) => {
    const now = new Date().toISOString();
    const settingsSnapshot = normalizeSpreadsheetSettings(spreadsheetSettings);

    setSavedSpreadsheetViews((currentViews) =>
      currentViews.map((savedView) =>
        savedView.id === savedViewId
          ? {
              ...savedView,
              settings: settingsSnapshot,
              updatedAt: now,
            }
          : savedView
      )
    );
  };

  const deleteSpreadsheetSavedView = (savedViewId) => {
    setSavedSpreadsheetViews((currentViews) =>
      currentViews.filter((savedView) => savedView.id !== savedViewId)
    );
  };

  const setDefaultSpreadsheetSavedView = (savedViewId) => {
    setSavedSpreadsheetViews((currentViews) =>
      currentViews.map((savedView) => ({
        ...savedView,
        isDefault: savedViewId ? savedView.id === savedViewId : false,
      }))
    );
  };

  const formCount = processedInquiryBookings.filter(
    (booking) => booking.sourceType === "Form"
  ).length;

  const importedCount = processedInquiryBookings.length - formCount;

  const starredSpreadsheetCount = processedInquiryBookings.filter((booking) =>
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
      inquiryBookings.length,
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

  const shouldShowFirstChunkLoadingScreen =
  holdLoadingScreenUntilFirstChunk && !isFirstChunkPainted;

  return (
    <section
      className={`spreadsheet-view-page ${
        shouldShowFirstChunkLoadingScreen
          ? "spreadsheet-view-page-first-chunk-loading"
          : ""
      }`}
    >
      <article className="dashboard-card spreadsheet-view-card">
        <div className="spreadsheet-view-header">
          <div className="spreadsheet-view-header-main">
            <div className="dashboard-heading-with-icon">
              <span className="section-icon">
                <FaTable />
              </span>

              <div>
                <p className="dashboard-eyebrow">Spreadsheet View</p>
                <h2>All Booking Data</h2>
              </div>
            </div>

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
          </div>

          <div className="spreadsheet-settings-stack">
            <button
              className="primary-dashboard-button spreadsheet-settings-button"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
            >
              <FaCog />
              Settings
            </button>

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

            <div className="spreadsheet-header-search">
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

        {inquiryBookings.length > 0 ? (
          <>
            <div className="spreadsheet-active-settings-bar">
              <span>
                Search:{" "}
                <strong>
                  {spreadsheetSettings.searchText
                    ? `"${spreadsheetSettings.searchText}"`
                    : "None"}
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
                Processed:{" "}
                <strong>
                  {processedBookingCount}/{totalBookingCount}
                </strong>
              </span>

              <span>
                Source Mode:{" "}
                <strong>
                  {spreadsheetSettings.sourceFilterMode === "inputMethod"
                    ? "Input Method"
                    : "Source Sheet"}
                </strong>
              </span>

              {/* {hasMoreProgressiveRows && (
                <span className="spreadsheet-background-rendering-pill">
                  Loading remaining rows...
                </span>
              )} */}

              <div className="spreadsheet-active-settings-actions">
              
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
              >
                Edit View
              </button>

              <button
                className="spreadsheet-reset-view-button"
                type="button"
                onClick={resetSpreadsheetSettings}
              >
                Reset View
              </button>

              
            </div>
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
                  {visibleProgressiveBookings.map((booking) => {
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
                                ? column.render(booking, openBookingDetail)
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
                <strong>No rows match these settings</strong>
                <p>
                  Open Settings and loosen the search, filters, or date range.
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

      {isSettingsOpen && (
        <SpreadsheetSettingsModal
          settings={spreadsheetSettings}
          updateSettings={updateSpreadsheetSettings}
          allColumns={allSpreadsheetColumns}
          orderedColumns={orderedSpreadsheetColumns}
          summaryCards={spreadsheetSummaryCards}
          sourceTypeOptions={sourceTypeOptions}
          inputMethodCounts={inputMethodCounts}
          sourceSheetOptions={sourceSheetOptions}
          sourceSheetCounts={sourceSheetCounts}
          statusOptions={statusOptions}
          filteredCount={filteredAndSortedBookings.length}
          totalCount={inquiryBookings.length}
          savedViews={savedSpreadsheetViews}
          onSaveSavedView={saveCurrentSpreadsheetSavedView}
          onApplySavedView={applySpreadsheetSavedView}
          onUpdateSavedView={updateSpreadsheetSavedView}
          onDeleteSavedView={deleteSpreadsheetSavedView}
          onSetDefaultSavedView={setDefaultSpreadsheetSavedView}
          onClose={() => setIsSettingsOpen(false)}
          onReset={resetSpreadsheetSettings}
          processedBookingCount={processedBookingCount}
          isProcessingRemainingRows={isProcessingRemainingRows}
        />
      )}

      {shouldShowFirstChunkLoadingScreen && (
        <SpreadsheetFirstChunkLoadingOverlay
          rowCount={inquiryBookings.length}
          firstChunkCount={Math.min(
            SPREADSHEET_INITIAL_ROW_LIMIT,
            inquiryBookings.length || SPREADSHEET_INITIAL_ROW_LIMIT
          )}
        />
      )}

    </section>
  );
}


export default function SpreadsheetView({
  inquiryBookings = [],
  openBookingDetail,
  isLoading = false,
}) {
  const hasRowsReady = inquiryBookings.length > 0;

  if (isLoading && !hasRowsReady) {
    return <SpreadsheetViewLoadingScreen rowCount={inquiryBookings.length} />;
  }

  return (
    <BookingSpreadsheetView
      inquiryBookings={inquiryBookings}
      openBookingDetail={openBookingDetail}
      holdLoadingScreenUntilFirstChunk
      isDataStillLoading={isLoading}
    />
  );
}