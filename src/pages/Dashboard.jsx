import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  FaHome,
  FaCalendarAlt,
  FaClipboardList,
  FaPlus,
  FaTable,
  FaRegCalendarCheck,
  FaExclamationTriangle,
  FaTicketAlt,
  FaClock,
  FaMapMarkedAlt,
  FaBed,
  FaEnvelopeOpenText,
  FaFilter,
  FaPaperPlane,
  FaKey,
  FaTimes,
  FaTrashAlt,
  FaArrowLeft,
  FaUser,
  FaBuilding,
  FaSignInAlt,
  FaSignOutAlt,
  FaUsers,
  FaDollarSign,
  FaFileContract,
  FaInfoCircle,
  FaUtensils,
  FaHiking,
  FaChevronLeft,
  FaChevronRight,
  FaCog,
  FaStar,
  FaRegStar,
  FaThumbtack,
  FaChartBar,
} from "react-icons/fa";
import ExcelJS from "exceljs";
import BookingHousingTab from "../components/BookingHousingTab";
import DashboardTopbar from "../components/DashboardTopbar";
import BookingCalendar from "../components/BookingCalendar";
import BookingActivities from "../components/BookingActivities";

import CreateBooking from "../pages/CreateBooking";

import {
  monthNames,
  sidebarSections,
  activityLocations,
  defaultRoomRows,
  bookingDetailTabs,

  DATED_INQUIRY_SETTINGS_STORAGE_KEY,
  DEFAULT_DATED_INQUIRY_SETTINGS,
  DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
  datedInquiryDateFilterOptions,

  BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
  DEFAULT_BOOKING_DETAIL_DATE_SETTINGS,
  bookingDetailDateFormatOptions,

  CONTACTS_VIEW_STARRED_STORAGE_KEY,
  CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,

  INQUIRY_PIPELINE_COLUMNS,

  REPORTS_VIEW_SETTINGS_STORAGE_KEY,
  DEFAULT_REPORTS_VIEW_SETTINGS,
  reportsDateRangeOptions,

  SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_ESSENTIAL_COLUMN_LABELS,
  SPREADSHEET_2026_STANDARD_LABELS,
  SPREADSHEET_SHARED_STANDARD_LABELS,
  SPREADSHEET_2025_RAW_COLUMNS,
  SPREADSHEET_2026_RAW_COLUMNS,
  SPREADSHEET_SHARED_RAW_COLUMNS,

  RETREAT_TYPE_CONFIG,
  RETREAT_TYPE_LEGEND_KEYS,
  getInquiryRetreatType,
  getRetreatTypeConfig,
} from "../constants/dashboardConstants";

import {
  formatDate,
  formatSubmittedDate,
  formatDateRange,
  getDaysInMonth,
  getLocalDate,
  formatExcelDateValue,
  formatExcelSubmittedAt,
  parseDesiredDateRange,
} from "../utils/dateUtils";


import {
  readSpreadsheetCell,
  cleanExcelCellValue,
  normalizeWaitlistValue,
  rowHasAnyData,
  getRowsFromWorksheetFlexible,
  detectSpreadsheetRowType,
  getRawRowNotes,
} from "../utils/spreadsheetUtils";

function getSavedInquiries() {
  try {
    const savedInquiries = localStorage.getItem("toahNipiPublicInquiries");

    if (!savedInquiries) {
      return [];
    }

    const parsedInquiries = JSON.parse(savedInquiries);

    return Array.isArray(parsedInquiries) ? parsedInquiries : [];
  } catch (error) {
    console.error("Could not read booking inquiries:", error);
    return [];
  }
}


function getSavedBookingDetailDateSettings() {
  try {
    const savedSettings = localStorage.getItem(
      BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY
    );

    if (!savedSettings) {
      return DEFAULT_BOOKING_DETAIL_DATE_SETTINGS;
    }

    const parsedSettings = {
      ...DEFAULT_BOOKING_DETAIL_DATE_SETTINGS,
      ...JSON.parse(savedSettings),
    };

    const isValidFormat = bookingDetailDateFormatOptions.some(
      (option) => option.value === parsedSettings.dateFormat
    );

    return {
      ...parsedSettings,
      dateFormat: isValidFormat
        ? parsedSettings.dateFormat
        : DEFAULT_BOOKING_DETAIL_DATE_SETTINGS.dateFormat,
      includeWeekday: Boolean(parsedSettings.includeWeekday),
    };
  } catch (error) {
    console.error("Could not read booking detail date settings:", error);
    return DEFAULT_BOOKING_DETAIL_DATE_SETTINGS;
  }
}

function saveBookingDetailDateSettings(settings) {
  try {
    localStorage.setItem(
      BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error("Could not save booking detail date settings:", error);
  }
}

function parseBookingDetailDateValue(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  // Keeps YYYY-MM-DD dates from shifting a day because of timezone issues.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return getLocalDate(text);
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatBookingDetailDate(
  value,
  settings = DEFAULT_BOOKING_DETAIL_DATE_SETTINGS
) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "—";
  }

  if (settings.dateFormat === "original") {
    return rawValue;
  }

  const date = parseBookingDetailDateValue(rawValue);

  if (!date) {
    return rawValue;
  }

  if (settings.dateFormat === "iso") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const isoDate = `${year}-${month}-${day}`;

    if (!settings.includeWeekday) {
      return isoDate;
    }

    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    }).format(date);

    return `${weekday}, ${isoDate}`;
  }

  const formatOptions = {
    year: "numeric",
    day: "numeric",
  };

  if (settings.includeWeekday) {
    formatOptions.weekday = "short";
  }

  if (settings.dateFormat === "longMonth") {
    formatOptions.month = "long";
  } else if (settings.dateFormat === "shortMonth") {
    formatOptions.month = "short";
  } else {
    formatOptions.month = "numeric";
  }

  return new Intl.DateTimeFormat("en-US", formatOptions).format(date);
}

function formatBookingDetailDateRange(startDate, endDate, settings) {
  const hasStartDate = Boolean(String(startDate || "").trim());
  const hasEndDate = Boolean(String(endDate || "").trim());

  if (!hasStartDate && !hasEndDate) {
    return "—";
  }

  if (hasStartDate && !hasEndDate) {
    return formatBookingDetailDate(startDate, settings);
  }

  if (!hasStartDate && hasEndDate) {
    return formatBookingDetailDate(endDate, settings);
  }

  const parsedStartDate = parseBookingDetailDateValue(startDate);
  const parsedEndDate = parseBookingDetailDateValue(endDate);

  const isSameCalendarDate =
    parsedStartDate &&
    parsedEndDate &&
    parsedStartDate.getFullYear() === parsedEndDate.getFullYear() &&
    parsedStartDate.getMonth() === parsedEndDate.getMonth() &&
    parsedStartDate.getDate() === parsedEndDate.getDate();

  if (isSameCalendarDate) {
    return formatBookingDetailDate(startDate, settings);
  }

  return `${formatBookingDetailDate(startDate, settings)} - ${formatBookingDetailDate(
    endDate,
    settings
  )}`;
}

function getBookingDetailDatePreview(settings) {
  return formatBookingDetailDateRange("2025-01-10", "2025-01-12", settings);
}

function getSavedDashboardFilterValue(key, fallbackValue = "") {
  try {
    return localStorage.getItem(key) || fallbackValue;
  } catch (error) {
    console.error("Could not read dashboard filter:", error);
    return fallbackValue;
  }
}

function saveDashboardFilterValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error("Could not save dashboard filter:", error);
  }
}

function formatDateForInput(date) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date, numberOfDays) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + numberOfDays);
  return nextDate;
}

function getDatedInquiryDateFilterRange({
  filterValue,
  customStartDate,
  customEndDate,
}) {
  const today = getLocalDate(formatDateForInput(new Date()));
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  if (filterValue === "allTime") {
    return {
      startDate: null,
      endDate: null,
    };
  }

  if (filterValue === "pastMonth") {
    return {
      startDate: new Date(currentYear, currentMonth - 1, 1),
      endDate: new Date(currentYear, currentMonth, 0),
    };
  }

  if (filterValue === "nextMonth") {
    return {
      startDate: new Date(currentYear, currentMonth + 1, 1),
      endDate: new Date(currentYear, currentMonth + 2, 0),
    };
  }

  if (filterValue === "past90Days") {
    return {
      startDate: addDays(today, -90),
      endDate: today,
    };
  }

  if (filterValue === "next90Days") {
    return {
      startDate: today,
      endDate: addDays(today, 90),
    };
  }

  if (filterValue === "custom") {
    const startDate = customStartDate ? getLocalDate(customStartDate) : null;
    const endDate = customEndDate ? getLocalDate(customEndDate) : null;

    if (startDate && endDate && startDate > endDate) {
      return {
        startDate: endDate,
        endDate: startDate,
      };
    }

    return {
      startDate,
      endDate,
    };
  }

  return {
    startDate: new Date(currentYear, currentMonth, 1),
    endDate: new Date(currentYear, currentMonth + 1, 0),
  };
}


function inquiryTouchesDateFilter(inquiry, dateRange) {
  const inquiryStartDate = getLocalDate(inquiry.startDate);

  if (!inquiryStartDate) {
    return false;
  }

  const inquiryEndDate = inquiry.endDate
    ? getLocalDate(inquiry.endDate)
    : inquiryStartDate;

  if (dateRange.startDate && dateRange.endDate) {
    return (
      inquiryStartDate <= dateRange.endDate &&
      inquiryEndDate >= dateRange.startDate
    );
  }

  if (dateRange.startDate) {
    return inquiryEndDate >= dateRange.startDate;
  }

  if (dateRange.endDate) {
    return inquiryStartDate <= dateRange.endDate;
  }

  return true;
}


function getCalendarCells(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function inquiryTouchesDay(inquiry, year, monthIndex, day) {
  if (!inquiry.startDate) {
    return false;
  }

  const currentDate = new Date(year, monthIndex, day);
  const startDate = new Date(`${inquiry.startDate}T00:00:00`);
  const endDate = inquiry.endDate
    ? new Date(`${inquiry.endDate}T00:00:00`)
    : startDate;

  return currentDate >= startDate && currentDate <= endDate;
}

function normalizeInquiry(inquiry, index) {
  const organizationName =
    inquiry.organizationName ||
    inquiry.churchOrMinistry ||
    "Unnamed Organization";

  const contactName =
    inquiry.contactName ||
    inquiry.name ||
    `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
    "No contact name";

  return {
    id: inquiry.id || `${inquiry.submittedAt || "inquiry"}-${index}`,
    detectedImportType: inquiry.detectedImportType || "",
    sourceType: inquiry.sourceType || "Form",
    sourceSheet: inquiry.sourceSheet || "",
    sourceRowNumber: inquiry.sourceRowNumber || "",
    rawSpreadsheetData: inquiry.rawSpreadsheetData || null,

    organizationName,
    contactName,
    email: inquiry.email || "No email provided",
    phone: inquiry.phone || "No phone provided",

    startDate: inquiry.startDate || "",
    endDate: inquiry.endDate || "",
    desiredDatesText: inquiry.desiredDatesText || inquiry.desiredDates || "",

    attendeeCount: inquiry.attendeeCount || inquiry.groupSize || "",
    retreatType: inquiry.retreatType || "",
    promoCode: inquiry.promoCode || "",
    notes: inquiry.notes || inquiry.message || "",
    waitlist: inquiry.waitlist || "No",
    status: inquiry.status || "Inquiry",
    submittedAt: inquiry.submittedAt || "",

    roomName:
      inquiry.roomName ||
      inquiry.room ||
      inquiry.assignedRoom ||
      inquiry.housingArea ||
      inquiry.buildingsRooms ||
      "Unassigned",

    returningStatus: inquiry.returningStatus || "",
    buildingsRooms: inquiry.buildingsRooms || "",
    meals: inquiry.meals || "",
    foodAllergies: inquiry.foodAllergies || "",
    needToKnow: inquiry.needToKnow || "",
    linenSets: inquiry.linenSets || "",
    activities: inquiry.activities || "",

    bookingActivitySchedule: inquiry.bookingActivitySchedule || {
      meals: [],
      recreation: [],
    },

    checklists: Array.isArray(inquiry.checklists) ? inquiry.checklists : null,

    persons: inquiry.persons || "",
    nights: inquiry.nights || "",
    mealCount: inquiry.mealCount || "",
    camperDays: inquiry.camperDays || "",
    usageFee: inquiry.usageFee || "",
    lodgingCost: inquiry.lodgingCost || "",
    foodCost: inquiry.foodCost || "",
    miscCost: inquiry.miscCost || "",

    stageOfGroup: inquiry.stageOfGroup || "",
    minPayingGuests: inquiry.minPayingGuests || "",
    maxPayingGuests: inquiry.maxPayingGuests || "",
    guestRate: inquiry.guestRate || "",
    expectedMinimumRevenue: inquiry.expectedMinimumRevenue || "",
    invoiceLodgingMeals: inquiry.invoiceLodgingMeals || "",
    deposit: inquiry.deposit || "",
    depositReceived: inquiry.depositReceived || "",
    dateOfCancellation: inquiry.dateOfCancellation || "",
    reasonForCancellation: inquiry.reasonForCancellation || "",
    vacancyFilled: inquiry.vacancyFilled || "",
    monthlyProjectedIncome: inquiry.monthlyProjectedIncome || "",
  };
}

function normalizeWaitlistSpreadsheetRow(row, index) {
  const submittedDate = readSpreadsheetCell(row, ["Date"]);
  const contactName = readSpreadsheetCell(row, ["Contact Name"]);
  const email = readSpreadsheetCell(row, ["Email Address", "Email"]);
  const phone = readSpreadsheetCell(row, ["Phone Number", "Phone"]);
  const guestGroupName = readSpreadsheetCell(row, [
    "Guest Group Name",
    "Group Name",
    "Organization",
  ]);
  const size = readSpreadsheetCell(row, ["Size", "Group Size"]);
  const desiredDates = readSpreadsheetCell(row, ["Desired Dates"]);
  const additionalNotes = readSpreadsheetCell(row, [
    "Additional Notes",
    "Notes",
    "Message",
  ]);
  const waitlist = readSpreadsheetCell(row, ["Waitlist or No", "Waitlist"]);

  const rowHasData =
    submittedDate ||
    contactName ||
    email ||
    phone ||
    guestGroupName ||
    size ||
    desiredDates ||
    additionalNotes ||
    waitlist;

  if (!rowHasData) {
    return null;
  }

  const parsedDates = parseDesiredDateRange(desiredDates);

  return {
    id: `waitlist-import-${Date.now()}-${row.sourceSheet || "sheet"}-${index}`,
    sourceType: "Waitlist",
    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,
    submittedAt: formatExcelSubmittedAt(submittedDate),
    name: String(contactName || "").trim(),
    contactName: String(contactName || "").trim(),
    organizationName: String(guestGroupName || "").trim() || "Unnamed Group",
    email: String(email || "").trim(),
    phone: String(phone || "").trim(),
    attendeeCount: String(size || "").trim(),
    groupSize: String(size || "").trim(),
    startDate: parsedDates.startDate,
    endDate: parsedDates.endDate,
    desiredDatesText: parsedDates.desiredDatesText,
    notes: String(additionalNotes || "").trim(),
    waitlist: normalizeWaitlistValue(waitlist),
    status: "Inquiry",
    retreatType: "",
    promoCode: "",
  };
}

function normalizeMasterSpreadsheetRow(row, index) {
  const arrivalDate = readSpreadsheetCell(row, ["Arrival Date"]);
  const departureDate = readSpreadsheetCell(row, ["Departure Date"]);
  const guestGroupName = readSpreadsheetCell(row, ["Guest Group Name"]);
  const guestGroupType = readSpreadsheetCell(row, ["Guest Group Type"]);
  const returningStatus = readSpreadsheetCell(row, [
    "Returning (R) or New (N)",
    "Returning or New",
  ]);
  const contactPerson = readSpreadsheetCell(row, ["Contact Person"]);
  const contactPhone = readSpreadsheetCell(row, [
    "Contact Person Cell #",
    "Contact Person Cell",
    "Phone Number",
  ]);
  const actualNumberOfGuests = readSpreadsheetCell(row, [
    "Actual Number of Guests",
    "Size",
  ]);
  const buildingsRooms = readSpreadsheetCell(row, [
    "Buildings/Rooms",
    "Buildings",
    "Rooms",
  ]);
  const meals = readSpreadsheetCell(row, ["Meals"]);
  const foodAllergies = readSpreadsheetCell(row, ["Food Allergies"]);
  const needToKnow = readSpreadsheetCell(row, ["Need to know", "Need To Know"]);
  const linenSets = readSpreadsheetCell(row, ["Linen Sets"]);
  const activities = readSpreadsheetCell(row, ["Activities"]);
  const persons = readSpreadsheetCell(row, ["#Persons", "Persons"]);
  const nights = readSpreadsheetCell(row, ["#Nights", "Nights"]);
  const mealCount = readSpreadsheetCell(row, ["#Meals", "Meals Count"]);
  const camperDays = readSpreadsheetCell(row, [
    "Camper Days (nightsX0.4 + mealsX0.2)",
    "Camper Days",
  ]);
  const usageFee = readSpreadsheetCell(row, ["Usage Fee"]);
  const lodgingCost = readSpreadsheetCell(row, ["$ Lodging", "Lodging"]);
  const foodCost = readSpreadsheetCell(row, ["$ Food", "Food"]);
  const miscCost = readSpreadsheetCell(row, ["$ Misc.", "$ Misc", "Misc"]);

  const rowHasData =
    arrivalDate ||
    departureDate ||
    guestGroupName ||
    guestGroupType ||
    contactPerson ||
    contactPhone ||
    actualNumberOfGuests ||
    buildingsRooms;

  if (!rowHasData) {
    return null;
  }

  const startDate = formatExcelDateValue(arrivalDate);
  const endDate = formatExcelDateValue(departureDate);

  const notes = [
    needToKnow ? `Need to know: ${needToKnow}` : "",
    foodAllergies ? `Food allergies: ${foodAllergies}` : "",
    activities ? `Activities: ${activities}` : "",
    meals ? `Meals: ${meals}` : "",
    linenSets ? `Linen sets: ${linenSets}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `master-import-${Date.now()}-${row.sourceSheet || "sheet"}-${index}`,
    sourceType: "Master",
    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,
    submittedAt: new Date().toISOString(),

    organizationName: String(guestGroupName || "").trim() || "Unnamed Group",
    name: String(contactPerson || "").trim(),
    contactName: String(contactPerson || "").trim() || "No contact name",
    email: "",
    phone: String(contactPhone || "").trim(),

    startDate,
    endDate,
    desiredDatesText:
      startDate && endDate ? `${startDate} - ${endDate}` : startDate || "",

    attendeeCount: String(actualNumberOfGuests || "").trim(),
    groupSize: String(actualNumberOfGuests || "").trim(),
    retreatType: String(guestGroupType || "").trim(),
    roomName: String(buildingsRooms || "Unassigned").trim(),

    notes,
    waitlist: "No",
    status: "Confirmed",
    promoCode: "",

    returningStatus: String(returningStatus || "").trim(),
    buildingsRooms: String(buildingsRooms || "").trim(),
    meals: String(meals || "").trim(),
    foodAllergies: String(foodAllergies || "").trim(),
    needToKnow: String(needToKnow || "").trim(),
    linenSets: String(linenSets || "").trim(),
    activities: String(activities || "").trim(),
    persons: String(persons || "").trim(),
    nights: String(nights || "").trim(),
    mealCount: String(mealCount || "").trim(),
    camperDays: String(camperDays || "").trim(),
    usageFee: String(usageFee || "").trim(),
    lodgingCost: String(lodgingCost || "").trim(),
    foodCost: String(foodCost || "").trim(),
    miscCost: String(miscCost || "").trim(),
  };
}

function getStatusFromStage(stageOfGroup) {
  const text = String(stageOfGroup || "").trim().toLowerCase();

  if (!text) {
    return "Confirmed";
  }

  if (text.includes("cancel")) {
    return "Cancelled";
  }

  if (text.includes("contract")) {
    return "Contract Sent";
  }

  if (text.includes("confirm") || text.includes("booked")) {
    return "Confirmed";
  }

  if (text.includes("inquiry") || text.includes("lead")) {
    return "Inquiry";
  }

  return String(stageOfGroup).trim();
}

function normalizeMaster2026SpreadsheetRow(row, index) {
  const guestGroupName = readSpreadsheetCell(row, [
    "name",
    "Name",
    "Guest Group Name",
    "Group Name",
  ]);

  const guestGroupType = readSpreadsheetCell(row, ["Guest Group Type"]);

  const returningStatus = readSpreadsheetCell(row, [
    "Returning (R) or New (N)",
    "Returning or New",
  ]);

  const contactPerson = readSpreadsheetCell(row, [
    "Group Leader/Contact Person",
    "Contact Person",
    "Group Leader",
  ]);

  const phone = readSpreadsheetCell(row, [
    "Phone",
    "Phone Number",
    "Contact Person Cell #",
  ]);

  const estimatedGuests = readSpreadsheetCell(row, [
    "Estimated Number of Guests",
    "Actual Number of Guests",
    "Size",
  ]);

  const buildingsRooms = readSpreadsheetCell(row, [
    "Buildings/Rooms",
    "Buildings",
    "Rooms",
  ]);

  const meals = readSpreadsheetCell(row, ["Meals"]);
  const allergies = readSpreadsheetCell(row, ["Allergies", "Food Allergies"]);
  const needToKnow = readSpreadsheetCell(row, ["Need to know", "Need To Know"]);
  const linenSets = readSpreadsheetCell(row, ["Linen Sets"]);
  const activities = readSpreadsheetCell(row, ["Activities"]);

  const contactPersonEmail = readSpreadsheetCell(row, [
    "Contact Person Email",
    "Email",
    "Email Address",
  ]);

  const stageOfGroup = readSpreadsheetCell(row, ["Stage of Group"]);

  const minPayingGuests = readSpreadsheetCell(row, [
    "Min. Number of Paying Guests",
    "Minimum Number of Paying Guests",
  ]);

  const maxPayingGuests = readSpreadsheetCell(row, [
    "Max. Number of Paying Guests",
    "Maximum Number of Paying Guests",
  ]);

  const guestRate = readSpreadsheetCell(row, ["Guest Rate"]);

  const expectedMinimumRevenue = readSpreadsheetCell(row, [
    "Exp. Minimum Revenue for Lodging/Meals",
    "Expected Minimum Revenue for Lodging/Meals",
  ]);

  const invoiceLodgingMeals = readSpreadsheetCell(row, [
    "Invoice for Lodging/Meals (does not include linens's fees or other service fees)",
    "Invoice for Lodging/Meals",
  ]);

  const notes = readSpreadsheetCell(row, ["Notes"]);

  const deposit = readSpreadsheetCell(row, ["Deposit"]);
  const depositReceived = readSpreadsheetCell(row, ["Deposit Received"]);

  const dateOfCancellation = readSpreadsheetCell(row, [
    "Date of Cancellation",
  ]);

  const reasonForCancellation = readSpreadsheetCell(row, [
    "Reason for Cancellation",
  ]);

  const vacancyFilled = readSpreadsheetCell(row, [
    "Vacancy filled by another group?",
    "Vacancy Filled By Another Group?",
  ]);

  const persons = readSpreadsheetCell(row, ["#Persons", "Persons"]);
  const nights = readSpreadsheetCell(row, ["#Nights", "Nights"]);
  const mealCount = readSpreadsheetCell(row, ["#Meals", "Meals Count"]);

  const camperDays = readSpreadsheetCell(row, [
    "Camper Days (nightsX0.4 + mealsX0.2)",
    "Camper Days",
  ]);

  const usageFee = readSpreadsheetCell(row, ["Usage Fee"]);
  const lodgingCost = readSpreadsheetCell(row, ["$ Lodging", "Lodging"]);
  const foodCost = readSpreadsheetCell(row, ["$ Food", "Food"]);
  const miscCost = readSpreadsheetCell(row, ["$ Misc", "$ Misc.", "Misc"]);

  const monthlyProjectedIncome = readSpreadsheetCell(row, [
    "Monthly Sum of Projected Income",
  ]);

  const arrivalDate = readSpreadsheetCell(row, [
    "Arrival Date",
    "Start Date",
    "Check In",
    "Check-in",
  ]);

  const departureDate = readSpreadsheetCell(row, [
    "Departure Date",
    "End Date",
    "Check Out",
    "Check-out",
  ]);

  const rowHasData =
    guestGroupName ||
    guestGroupType ||
    contactPerson ||
    phone ||
    estimatedGuests ||
    buildingsRooms ||
    contactPersonEmail ||
    stageOfGroup ||
    notes;

  if (!rowHasData) {
    return null;
  }

  const startDate = formatExcelDateValue(arrivalDate);
  const endDate = formatExcelDateValue(departureDate);

  return {
    id: `master-2026-import-${Date.now()}-${row.sourceSheet || "sheet"}-${index}`,
    sourceType: "Master 2026",
    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,
    submittedAt: new Date().toISOString(),

    organizationName: String(guestGroupName || "").trim() || "Unnamed Group",
    name: String(contactPerson || "").trim(),
    contactName: String(contactPerson || "").trim() || "No contact name",
    email: String(contactPersonEmail || "").trim(),
    phone: String(phone || "").trim(),

    startDate,
    endDate,
    desiredDatesText:
      startDate && endDate ? `${startDate} - ${endDate}` : startDate || "",

    attendeeCount: String(estimatedGuests || "").trim(),
    groupSize: String(estimatedGuests || "").trim(),
    retreatType: String(guestGroupType || "").trim(),

    roomName: String(buildingsRooms || "Unassigned").trim(),
    buildingsRooms: String(buildingsRooms || "").trim(),

    notes: String(notes || "").trim(),
    waitlist: "No",
    status: getStatusFromStage(stageOfGroup),
    promoCode: "",

    returningStatus: String(returningStatus || "").trim(),
    meals: String(meals || "").trim(),
    foodAllergies: String(allergies || "").trim(),
    needToKnow: String(needToKnow || "").trim(),
    linenSets: String(linenSets || "").trim(),
    activities: String(activities || "").trim(),

    persons: String(persons || "").trim(),
    nights: String(nights || "").trim(),
    mealCount: String(mealCount || "").trim(),
    camperDays: String(camperDays || "").trim(),

    usageFee: String(usageFee || "").trim(),
    lodgingCost: String(lodgingCost || "").trim(),
    foodCost: String(foodCost || "").trim(),
    miscCost: String(miscCost || "").trim(),

    stageOfGroup: String(stageOfGroup || "").trim(),
    minPayingGuests: String(minPayingGuests || "").trim(),
    maxPayingGuests: String(maxPayingGuests || "").trim(),
    guestRate: String(guestRate || "").trim(),
    expectedMinimumRevenue: String(expectedMinimumRevenue || "").trim(),
    invoiceLodgingMeals: String(invoiceLodgingMeals || "").trim(),
    deposit: String(deposit || "").trim(),
    depositReceived: String(depositReceived || "").trim(),
    dateOfCancellation: formatExcelDateValue(dateOfCancellation),
    reasonForCancellation: String(reasonForCancellation || "").trim(),
    vacancyFilled: String(vacancyFilled || "").trim(),
    monthlyProjectedIncome: String(monthlyProjectedIncome || "").trim(),
  };
}


function normalizeGenericSpreadsheetRow(row, index) {
  if (!rowHasAnyData(row)) {
    return null;
  }

  const groupName = readSpreadsheetCell(row, [
    "Guest Group Name",
    "Group Name",
    "Organization",
    "Church or Ministry",
    "Church/Ministry",
    "name",
    "Name",
  ]);

  const contactName = readSpreadsheetCell(row, [
    "Contact Name",
    "Contact Person",
    "Group Leader/Contact Person",
    "Group Leader",
    "Name",
  ]);

  const email = readSpreadsheetCell(row, [
    "Email Address",
    "Email",
    "Contact Person Email",
  ]);

  const phone = readSpreadsheetCell(row, [
    "Phone Number",
    "Phone",
    "Contact Person Cell #",
  ]);

  const desiredDates = readSpreadsheetCell(row, [
    "Desired Dates",
    "Dates",
    "Date Range",
  ]);

  const parsedDesiredDates = parseDesiredDateRange(desiredDates);

  const arrivalDate = readSpreadsheetCell(row, [
    "Arrival Date",
    "Start Date",
    "Check In",
    "Check-in",
  ]);

  const departureDate = readSpreadsheetCell(row, [
    "Departure Date",
    "End Date",
    "Check Out",
    "Check-out",
  ]);

  const startDate =
    formatExcelDateValue(arrivalDate) || parsedDesiredDates.startDate;

  const endDate =
    formatExcelDateValue(departureDate) || parsedDesiredDates.endDate;

  const groupSize = readSpreadsheetCell(row, [
    "Estimated Number of Guests",
    "Actual Number of Guests",
    "Size",
    "Group Size",
    "#Persons",
    "Persons",
  ]);

  const retreatType = readSpreadsheetCell(row, [
    "Guest Group Type",
    "Retreat Type",
    "Type",
  ]);

  const buildingsRooms = readSpreadsheetCell(row, [
    "Buildings/Rooms",
    "Buildings",
    "Rooms",
    "Room",
  ]);

  const notes =
    readSpreadsheetCell(row, [
      "Notes",
      "Additional Notes",
      "Message",
      "Need to know",
      "Need To Know",
    ]) || getRawRowNotes(row);

  const status = readSpreadsheetCell(row, [
    "Status",
    "Stage",
    "Stage of Group",
  ]);

  return {
    id: `generic-import-${Date.now()}-${row.sourceSheet || "sheet"}-${index}`,
    sourceType: "Generic Spreadsheet",
    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",

    submittedAt: new Date().toISOString(),

    organizationName: String(groupName || "").trim() || "Unnamed Imported Row",
    name: String(contactName || "").trim(),
    contactName: String(contactName || "").trim() || "No contact name",
    email: String(email || "").trim(),
    phone: String(phone || "").trim(),

    startDate,
    endDate,
    desiredDatesText:
      desiredDates ||
      (startDate && endDate ? `${startDate} - ${endDate}` : startDate || ""),

    attendeeCount: String(groupSize || "").trim(),
    groupSize: String(groupSize || "").trim(),
    retreatType: String(retreatType || "").trim(),

    roomName: String(buildingsRooms || "Unassigned").trim(),
    buildingsRooms: String(buildingsRooms || "").trim(),

    notes: String(notes || "").trim(),
    waitlist: "No",
    status: status ? String(status).trim() : "Imported",
    promoCode: "",

    rawSpreadsheetData: row,
  };
}

function normalizeEverythingSpreadsheetRow(row, index) {
  const detectedType = detectSpreadsheetRowType(row);

  if (detectedType === "Waitlist") {
    return normalizeWaitlistSpreadsheetRow(row, index);
  }

  if (detectedType === "Master 2026") {
    return normalizeMaster2026SpreadsheetRow(row, index);
  }

  if (detectedType === "Master") {
    return normalizeMasterSpreadsheetRow(row, index);
  }

  return normalizeGenericSpreadsheetRow(row, index);
}



function splitRoomNames(value) {
  return String(value || "")
    .split(/[,;\n]+/g)
    .map((roomName) => roomName.trim())
    .filter(Boolean);
}

function getRoomRowsFromBookings(datedInquiries) {
  const importedRoomNames = datedInquiries
    .flatMap((inquiry) => [
      ...splitRoomNames(inquiry.roomName),
      ...splitRoomNames(inquiry.buildingsRooms),
    ])
    .filter(
      (roomName) =>
        roomName &&
        roomName.toLowerCase() !== "unassigned" &&
        roomName.toLowerCase() !== "no room"
    );

  const defaultRoomNames = new Set(
    defaultRoomRows.map((room) => room.name.toLowerCase())
  );

  const dynamicRoomRows = [...new Set(importedRoomNames)]
    .filter((roomName) => !defaultRoomNames.has(roomName.toLowerCase()))
    .map((roomName) => ({
      name: roomName,
      aliases: [roomName],
    }));

  return [...defaultRoomRows, ...dynamicRoomRows];
}

function bookingUsesRoom(inquiry, room) {
  const searchableText = [inquiry.roomName, inquiry.buildingsRooms]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return room.aliases.some((alias) =>
    searchableText.includes(alias.toLowerCase())
  );
}

function getAvailabilityBookingsForDay({
  row,
  day,
  datedInquiries,
  selectedYear,
  selectedMonth,
  matcher,
}) {
  return datedInquiries.filter(
    (inquiry) =>
      inquiryTouchesDay(inquiry, selectedYear, selectedMonth, day) &&
      matcher(inquiry, row)
  );
}

function getAvailabilityDays(selectedYear, selectedMonth) {
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);

  return Array.from({ length: daysInMonth }, (_, index) => index + 1);
}

function getShortWeekday(selectedYear, selectedMonth, day) {
  return new Date(selectedYear, selectedMonth, day).toLocaleDateString("en-US", {
    weekday: "short",
  });
}

function bookingUsesActivityLocation(inquiry, location) {
  const searchableText = [
    inquiry.roomName,
    inquiry.buildingsRooms,
    inquiry.activities,
    inquiry.notes,
    inquiry.needToKnow,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return location.aliases.some((alias) =>
    searchableText.includes(alias.toLowerCase())
  );
}

function getActivityBookingsForDay({
  location,
  day,
  datedInquiries,
  selectedYear,
  selectedMonth,
}) {
  return datedInquiries.filter(
    (inquiry) =>
      inquiryTouchesDay(inquiry, selectedYear, selectedMonth, day) &&
      bookingUsesActivityLocation(inquiry, location)
  );
}

function bookingContinuesBeforeDay(inquiry, selectedYear, selectedMonth, day) {
  const currentDate = new Date(selectedYear, selectedMonth, day);
  const startDate = getLocalDate(inquiry.startDate);

  return startDate && startDate < currentDate;
}

function bookingContinuesAfterDay(inquiry, selectedYear, selectedMonth, day) {
  const currentDate = new Date(selectedYear, selectedMonth, day);
  const endDate = inquiry.endDate
    ? getLocalDate(inquiry.endDate)
    : getLocalDate(inquiry.startDate);

  return endDate && endDate > currentDate;
}


function AvailabilityBoard({
  datedInquiries,
  selectedYear,
  selectedMonth,
  goToPreviousMonth,
  goToNextMonth,
  getCalendarEventColor,
}) {
  const [availabilityView, setAvailabilityView] = useState("activities");

  const availabilityDays = getAvailabilityDays(selectedYear, selectedMonth);
  const roomRows = getRoomRowsFromBookings(datedInquiries);

  const isRoomView = availabilityView === "rooms";

  const rows = isRoomView ? roomRows : activityLocations;
  const matcher = isRoomView ? bookingUsesRoom : bookingUsesActivityLocation;

  return (
    <section className="dashboard-card availability-card">
      <div className="availability-header">
        <div className="dashboard-heading-with-icon">
          <span className="section-icon">
            {isRoomView ? <FaBed /> : <FaMapMarkedAlt />}
          </span>

          <div>
            <p className="dashboard-eyebrow">Availability</p>
            <h2>
              {isRoomView
                ? "Room Availability"
                : "Activity Location Availability"}
            </h2>
            <p>
              {isRoomView
                ? "Monthly room usage based on assigned rooms and building fields."
                : "Monthly activity space usage based on booking rooms, activities, and notes."}
            </p>
          </div>
        </div>

        <div className="availability-header-actions">
          <div className="availability-toggle">
            <button
              className={availabilityView === "activities" ? "active" : ""}
              type="button"
              onClick={() => setAvailabilityView("activities")}
            >
              Activity Locations
            </button>

            <button
              className={availabilityView === "rooms" ? "active" : ""}
              type="button"
              onClick={() => setAvailabilityView("rooms")}
            >
              Rooms
            </button>
          </div>

          <button className="secondary-dashboard-button" type="button">
            <FaFilter />
            Site Filter
          </button>

          {isRoomView && (
            <button className="secondary-dashboard-button" type="button">
              <FaFilter />
              Housing Area Filter
            </button>
          )}
        </div>
      </div>

      <div className="availability-toolbar">
        <button type="button" onClick={goToPreviousMonth}>
          «
        </button>

        <strong>
          {monthNames[selectedMonth]} {selectedYear}
        </strong>

        <button type="button" onClick={goToNextMonth}>
          »
        </button>
      </div>

      <div className="availability-scroll">
        <div
          className="availability-grid"
          style={{
            gridTemplateColumns: `210px repeat(${availabilityDays.length}, minmax(36px, 1fr))`,
          }}
        >
          <div className="availability-row-heading">
            {isRoomView ? "Room" : "Activity Location"}
          </div>

          {availabilityDays.map((day) => (
            <div className="availability-weekday-cell" key={`weekday-${day}`}>
              {getShortWeekday(selectedYear, selectedMonth, day).slice(0, 1)}
            </div>
          ))}

          {availabilityDays.map((day) => (
            <div className="availability-day-number-cell" key={`day-${day}`}>
              {day}
            </div>
          ))}

          {rows.map((row) => (
            <Fragment key={row.name}>
              <div className="availability-row-name">{row.name}</div>

              {availabilityDays.map((day) => {
                const bookingsForDay = getAvailabilityBookingsForDay({
                  row,
                  day,
                  datedInquiries,
                  selectedYear,
                  selectedMonth,
                  matcher,
                });

                const firstBooking = bookingsForDay[0];
                const colorClass = firstBooking
                  ? getCalendarEventColor(firstBooking.status)
                  : "";

                const continuesBefore =
                  firstBooking &&
                  bookingContinuesBeforeDay(
                    firstBooking,
                    selectedYear,
                    selectedMonth,
                    day
                  );

                const continuesAfter =
                  firstBooking &&
                  bookingContinuesAfterDay(
                    firstBooking,
                    selectedYear,
                    selectedMonth,
                    day
                  );

                return (
                  <div
                    className={`availability-day-cell ${
                      firstBooking ? `availability-day-booked ${colorClass}` : ""
                    } ${
                      continuesBefore ? "availability-day-continues-before" : ""
                    } ${
                      continuesAfter ? "availability-day-continues-after" : ""
                    }`}
                    key={`${row.name}-${day}`}
                  >
                    {firstBooking && (
                      <div className="availability-tooltip">
                        <strong>{firstBooking.organizationName}</strong>
                        <span>{firstBooking.status}</span>

                        <p>
                          {formatDateRange(
                            firstBooking.startDate,
                            firstBooking.endDate
                          )}
                        </p>

                        <small>
                          {firstBooking.retreatType || "No retreat type"} ·{" "}
                          {firstBooking.attendeeCount || "No group size"} guests
                        </small>

                        {isRoomView && (
                          <small>
                            Room:{" "}
                            {firstBooking.roomName ||
                              firstBooking.buildingsRooms ||
                              "Unassigned"}
                          </small>
                        )}

                        {bookingsForDay.length > 1 && (
                          <em>+{bookingsForDay.length - 1} more booking</em>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}


function getBookingContacts(booking) {
  if (!booking) {
    return [];
  }

  const primaryContact = {
    id: `${booking.id}-primary-contact`,
    contactName: booking.contactName || booking.name || "No contact name",
    companyName: booking.organizationName || "No organization",
    email:
      booking.email && booking.email !== "No email provided"
        ? booking.email
        : "",
    phone:
      booking.phone && booking.phone !== "No phone provided"
        ? booking.phone
        : "",
    contactTypes: ["Primary"],
  };

  return [primaryContact];
}

function BookingContactsSection({ booking }) {
  const contacts = getBookingContacts(booking);

  return (
    <section className="dashboard-card booking-contacts-card">
      <div className="booking-contacts-header">
        <div>
          <h3>Contacts</h3>
          <p>*must add a primary contact of an organization</p>
        </div>

        <button className="primary-dashboard-button" type="button">
          <FaPlus />
          Add Contact
        </button>
      </div>

      <div className="booking-contacts-table-wrap">
        <table className="booking-contacts-table">
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Company Name</th>
              <th>Email</th>
              <th>Primary Phone</th>
              <th>Contact Type</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>

          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <button className="booking-contact-name-button" type="button">
                    {contact.contactName}
                  </button>
                </td>

                <td>{contact.companyName}</td>

                <td>
                  {contact.email ? (
                    <div className="booking-contact-email-row">
                      <span>{contact.email}</span>

                      <button className="contact-small-action" type="button">
                        <FaKey />
                        Reset Password
                      </button>
                    </div>
                  ) : (
                    <button className="contact-invite-button" type="button">
                      <FaPaperPlane />
                      Invite
                    </button>
                  )}
                </td>

                <td>{contact.phone || "—"}</td>

                <td>
                  <div className="contact-type-list">
                    {contact.contactTypes.map((type) => (
                      <span className="contact-type-pill" key={type}>
                        {type}
                        <button type="button" aria-label={`Remove ${type}`}>
                          <FaTimes />
                        </button>
                      </span>
                    ))}

                    <button className="contact-type-add-button" type="button">
                      <FaPlus />
                    </button>
                  </div>
                </td>

                <td>
                  <button className="contact-delete-button" type="button">
                    <FaTrashAlt />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function DetailCardHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="detail-card-header-clean">
      <div className="detail-card-title-clean">
        <span className="detail-card-icon-clean">
          <Icon />
        </span>

        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      {action && <div className="detail-card-action-clean">{action}</div>}
    </div>
  );
}

function DetailField({ icon: Icon, label, value, tone = "default" }) {
  return (
    <div className={`detail-field-clean detail-field-clean-${tone}`}>
      <span className="detail-field-icon-clean">
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value || "—"}</strong>
      </div>
    </div>
  );
}

function getBookingInitials(name) {
  return String(name || "TN")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function BookingMetric({ icon: Icon, label, value, helper }) {
  return (
    <div className="booking-profile-metric">
      <span>
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value || "—"}</strong>
        {helper && <em>{helper}</em>}
      </div>
    </div>
  );
}

function BookingSection({ icon: Icon, title, eyebrow, action, children }) {
  return (
    <article className="booking-work-section">
      <div className="booking-work-section-header">
        <div>
          <span className="booking-work-section-icon">
            <Icon />
          </span>

          <div>
            {eyebrow && <p>{eyebrow}</p>}
            <h3>{title}</h3>
          </div>
        </div>

        {action}
      </div>

      {children}
    </article>
  );
}

function BookingDetailRow({ label, value, icon: Icon, tone = "default" }) {
  return (
    <div className={`booking-detail-row booking-detail-row-${tone}`}>
      <span>
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value || "—"}</strong>
      </div>
    </div>
  );
}

function createBookingEditFormState(booking) {
  return {
    organizationName: booking.organizationName || "",
    contactName: booking.contactName === "No contact name" ? "" : booking.contactName || "",
    email: booking.email === "No email provided" ? "" : booking.email || "",
    phone: booking.phone === "No phone provided" ? "" : booking.phone || "",

    startDate: booking.startDate || "",
    endDate: booking.endDate || "",
    desiredDatesText: booking.desiredDatesText || "",

    attendeeCount: booking.attendeeCount || "",
    retreatType: booking.retreatType || "",
    status: booking.status || "Inquiry",
    waitlist: booking.waitlist || "No",

    roomName: booking.roomName === "Unassigned" ? "" : booking.roomName || "",
    buildingsRooms: booking.buildingsRooms || "",

    meals: booking.meals || "",
    foodAllergies: booking.foodAllergies || "",
    needToKnow: booking.needToKnow || "",
    linenSets: booking.linenSets || "",
    activities: booking.activities || "",

    persons: booking.persons || "",
    nights: booking.nights || "",
    mealCount: booking.mealCount || "",
    camperDays: booking.camperDays || "",

    usageFee: booking.usageFee || "",
    lodgingCost: booking.lodgingCost || "",
    foodCost: booking.foodCost || "",
    miscCost: booking.miscCost || "",

    notes: booking.notes || "",
  };
}

function BookingEditField({
  label,
  value,
  onChange,
  isEditing,
  type = "text",
  multiline = false,
  options,
}) {
  return (
    <label className="booking-edit-field">
      <span>{label}</span>

      {options ? (
        <select
          value={value || ""}
          disabled={!isEditing}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          value={value || ""}
          readOnly={!isEditing}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          readOnly={!isEditing}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}



function BookingDetailsEditForm({ booking, onSaveBooking }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(() =>
    createBookingEditFormState(booking)
  );

  useEffect(() => {
    setFormData(createBookingEditFormState(booking));
    setIsEditing(false);
  }, [booking.id]);

  const updateField = (fieldName, value) => {
    setFormData((currentData) => ({
      ...currentData,
      [fieldName]: value,
    }));
  };

  const handleCancel = () => {
    setFormData(createBookingEditFormState(booking));
    setIsEditing(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const desiredDatesText =
      formData.desiredDatesText.trim() ||
      [formData.startDate, formData.endDate].filter(Boolean).join(" - ");

    const updatedBooking = {
      ...booking,

      organizationName:
        formData.organizationName.trim() || "Unnamed Organization",

      contactName: formData.contactName.trim() || "No contact name",
      name: formData.contactName.trim(),

      email: formData.email.trim(),
      phone: formData.phone.trim(),

      startDate: formData.startDate,
      endDate: formData.endDate,
      desiredDatesText,

      attendeeCount: formData.attendeeCount.trim(),
      groupSize: formData.attendeeCount.trim(),

      retreatType: formData.retreatType.trim(),
      status: formData.status,
      waitlist: formData.waitlist,

      roomName: formData.roomName.trim() || "Unassigned",
      buildingsRooms: formData.buildingsRooms.trim(),

      meals: formData.meals.trim(),
      foodAllergies: formData.foodAllergies.trim(),
      needToKnow: formData.needToKnow.trim(),
      linenSets: formData.linenSets.trim(),
      activities: formData.activities.trim(),

      persons: formData.persons.trim(),
      nights: formData.nights.trim(),
      mealCount: formData.mealCount.trim(),
      camperDays: formData.camperDays.trim(),

      usageFee: formData.usageFee.trim(),
      lodgingCost: formData.lodgingCost.trim(),
      foodCost: formData.foodCost.trim(),
      miscCost: formData.miscCost.trim(),

      notes: formData.notes.trim(),
      updatedAt: new Date().toISOString(),
    };

    onSaveBooking(updatedBooking);
    setIsEditing(false);
  };

  return (
    <form className="booking-details-edit-card" onSubmit={handleSubmit}>
      <div className="booking-details-edit-header">
        <div>
          <p className="dashboard-eyebrow">Details</p>
          <h3>Booking Information</h3>
          <span>
            Edit this booking entry and save changes to the dashboard.
          </span>
        </div>

        <div className="booking-details-edit-actions">
          {isEditing ? (
            <>
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={handleCancel}
              >
                Cancel
              </button>

              <button className="primary-dashboard-button" type="submit">
                Save Changes
              </button>
            </>
          ) : (
            <button
              className="primary-dashboard-button"
              type="button"
              onClick={() => setIsEditing(true)}
            >
              Edit Entry
            </button>
          )}
        </div>
      </div>

      <div className="booking-details-edit-grid">
        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaBuilding />
            <div>
              <h4>Group Information</h4>
              <p>Organization, contact, and basic rental identity.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Rental / Group Name"
              value={formData.organizationName}
              isEditing={isEditing}
              onChange={(value) => updateField("organizationName", value)}
            />

            <BookingEditField
              label="Primary Contact"
              value={formData.contactName}
              isEditing={isEditing}
              onChange={(value) => updateField("contactName", value)}
            />

            <BookingEditField
              label="Email"
              type="email"
              value={formData.email}
              isEditing={isEditing}
              onChange={(value) => updateField("email", value)}
            />

            <BookingEditField
              label="Phone"
              value={formData.phone}
              isEditing={isEditing}
              onChange={(value) => updateField("phone", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaCalendarAlt />
            <div>
              <h4>Rental Details</h4>
              <p>Dates, status, guest count, and waitlist status.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Start Date"
              type="date"
              value={formData.startDate}
              isEditing={isEditing}
              onChange={(value) => updateField("startDate", value)}
            />

            <BookingEditField
              label="End Date"
              type="date"
              value={formData.endDate}
              isEditing={isEditing}
              onChange={(value) => updateField("endDate", value)}
            />

            <BookingEditField
              label="Guest Count"
              value={formData.attendeeCount}
              isEditing={isEditing}
              onChange={(value) => updateField("attendeeCount", value)}
            />

            <BookingEditField
              label="Retreat Type"
              value={formData.retreatType}
              isEditing={isEditing}
              onChange={(value) => updateField("retreatType", value)}
            />

            <BookingEditField
              label="Status"
              value={formData.status}
              isEditing={isEditing}
              options={[
                "Inquiry",
                "Contract Sent",
                "Confirmed",
                "Imported",
                "Cancelled",
                "Waitlist",
              ]}
              onChange={(value) => updateField("status", value)}
            />

            <BookingEditField
              label="Waitlist"
              value={formData.waitlist}
              isEditing={isEditing}
              options={["No", "Yes"]}
              onChange={(value) => updateField("waitlist", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaBed />
            <div>
              <h4>Housing & Program</h4>
              <p>Rooms, meals, linen sets, activities, and staff notes.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Assigned Room / Area"
              value={formData.roomName}
              isEditing={isEditing}
              onChange={(value) => updateField("roomName", value)}
            />

            <BookingEditField
              label="Buildings / Rooms"
              value={formData.buildingsRooms}
              isEditing={isEditing}
              onChange={(value) => updateField("buildingsRooms", value)}
            />

            <BookingEditField
              label="Meals"
              value={formData.meals}
              isEditing={isEditing}
              onChange={(value) => updateField("meals", value)}
            />

            <BookingEditField
              label="# Meals"
              value={formData.mealCount}
              isEditing={isEditing}
              onChange={(value) => updateField("mealCount", value)}
            />

            <BookingEditField
              label="Linen Sets"
              value={formData.linenSets}
              isEditing={isEditing}
              onChange={(value) => updateField("linenSets", value)}
            />

            <BookingEditField
              label="Activities"
              value={formData.activities}
              isEditing={isEditing}
              onChange={(value) => updateField("activities", value)}
            />

            <BookingEditField
              label="Food Allergies"
              value={formData.foodAllergies}
              isEditing={isEditing}
              multiline
              onChange={(value) => updateField("foodAllergies", value)}
            />

            <BookingEditField
              label="Need To Know"
              value={formData.needToKnow}
              isEditing={isEditing}
              multiline
              onChange={(value) => updateField("needToKnow", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaDollarSign />
            <div>
              <h4>Counts & Billing</h4>
              <p>Optional spreadsheet-style values for reporting.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="# Persons"
              value={formData.persons}
              isEditing={isEditing}
              onChange={(value) => updateField("persons", value)}
            />

            <BookingEditField
              label="# Nights"
              value={formData.nights}
              isEditing={isEditing}
              onChange={(value) => updateField("nights", value)}
            />

            <BookingEditField
              label="Camper Days"
              value={formData.camperDays}
              isEditing={isEditing}
              onChange={(value) => updateField("camperDays", value)}
            />

            <BookingEditField
              label="Usage Fee"
              value={formData.usageFee}
              isEditing={isEditing}
              onChange={(value) => updateField("usageFee", value)}
            />

            <BookingEditField
              label="$ Lodging"
              value={formData.lodgingCost}
              isEditing={isEditing}
              onChange={(value) => updateField("lodgingCost", value)}
            />

            <BookingEditField
              label="$ Food"
              value={formData.foodCost}
              isEditing={isEditing}
              onChange={(value) => updateField("foodCost", value)}
            />

            <BookingEditField
              label="$ Misc."
              value={formData.miscCost}
              isEditing={isEditing}
              onChange={(value) => updateField("miscCost", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section booking-details-edit-section-wide">
          <div className="booking-edit-section-header">
            <FaInfoCircle />
            <div>
              <h4>Additional Notes</h4>
              <p>Internal notes for staff follow-up.</p>
            </div>
          </div>

          <BookingEditField
            label="Notes"
            value={formData.notes}
            isEditing={isEditing}
            multiline
            onChange={(value) => updateField("notes", value)}
          />
        </section>
      </div>
    </form>
  );
}

function BookingDateSettingsModal({ settings, updateSettings, onClose }) {
  return (
    <div className="booking-date-settings-backdrop" role="presentation">
      <section
        className="booking-date-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Booking date display settings"
      >
        <header className="booking-date-settings-header">
          <div>
            <p className="dashboard-eyebrow">Date Settings</p>
            <h3>Booking Detail Date Display</h3>
            <span>
              Choose how dates should appear on the Booking Details page.
            </span>
          </div>

          <button
            className="booking-date-settings-close"
            type="button"
            onClick={onClose}
            aria-label="Close date settings"
          >
            <FaTimes />
          </button>
        </header>

        <div className="booking-date-settings-body">
          <div className="booking-date-format-list">
            {bookingDetailDateFormatOptions.map((option) => (
              <label
                className={`booking-date-format-option ${
                  settings.dateFormat === option.value ? "active" : ""
                }`}
                key={option.value}
              >
                <input
                  type="radio"
                  name="bookingDetailDateFormat"
                  value={option.value}
                  checked={settings.dateFormat === option.value}
                  onChange={() =>
                    updateSettings({
                      dateFormat: option.value,
                    })
                  }
                />

                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>

          <label className="booking-date-weekday-toggle">
            <input
              type="checkbox"
              checked={settings.includeWeekday}
              disabled={settings.dateFormat === "original"}
              onChange={(event) =>
                updateSettings({
                  includeWeekday: event.target.checked,
                })
              }
            />

            <span>
              <strong>Show weekday</strong>
              <small>Example: Fri, Jan 10, 2025</small>
            </span>
          </label>

          <div className="booking-date-preview-card">
            <small>Preview</small>
            <strong>{getBookingDetailDatePreview(settings)}</strong>
          </div>
        </div>

        <footer className="booking-date-settings-footer">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={() =>
              updateSettings(DEFAULT_BOOKING_DETAIL_DATE_SETTINGS)
            }
          >
            Reset
          </button>

          <button
            className="primary-dashboard-button"
            type="button"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

function slugifyChecklistId(value) {
  return String(value || "booking")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createChecklistId(prefix = "checklist") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getChecklistDueDateFromStart(startDate, daysBefore) {
  const date = getLocalDate(startDate);

  if (!date) {
    return "";
  }

  date.setDate(date.getDate() - daysBefore);
  return formatDateForInput(date);
}

function buildDefaultBookingChecklists(booking) {
  const baseId = slugifyChecklistId(booking.id || booking.organizationName);

  return [
    {
      id: `${baseId}-rental-checklist`,
      name: "Rental Checklist",
      items: [
        {
          id: `${baseId}-work-order`,
          sequence: 1,
          title: "Create work order",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 120),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
        {
          id: `${baseId}-contact-group`,
          sequence: 2,
          title: "Contact group leader if details are missing",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 90),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
        {
          id: `${baseId}-confirm-housing`,
          sequence: 3,
          title: "Confirm housing / room assignments",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 60),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
        {
          id: `${baseId}-activity-choice`,
          sequence: 4,
          title: "Activity choice form due",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 45),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
        {
          id: `${baseId}-group-numbers`,
          sequence: 5,
          title: "Final group numbers due",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 30),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
        {
          id: `${baseId}-schedule-leaders`,
          sequence: 6,
          title: "Send preliminary schedule to leaders",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 21),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
        {
          id: `${baseId}-dietary-review`,
          sequence: 7,
          title: "Review food allergies and dietary needs",
          dueDate: getChecklistDueDateFromStart(booking.startDate, 14),
          assignedTo: "",
          completed: false,
          completedAt: "",
          completedBy: "",
        },
      ],
    },
  ];
}

function getBookingChecklists(booking) {
  if (Array.isArray(booking.checklists)) {
    return booking.checklists;
  }

  return buildDefaultBookingChecklists(booking);
}

function getChecklistProgress(checklist) {
  const items = Array.isArray(checklist.items) ? checklist.items : [];
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.completed).length;

  return {
    totalItems,
    completedItems,
    percentage:
      totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
  };
}

function sortChecklistItems(items) {
  return [...(items || [])].sort(
    (a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)
  );
}

function createEmptyChecklistItemForm(nextSequence = 1) {
  return {
    sequence: nextSequence,
    title: "",
    dueDate: "",
    assignedTo: "",
  };
}

function BookingChecklistTab({ booking, onSaveBooking }) {
  const checklists = getBookingChecklists(booking);

  const [newChecklistName, setNewChecklistName] = useState("");
  const [openChecklistId, setOpenChecklistId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [itemForm, setItemForm] = useState(() =>
    createEmptyChecklistItemForm()
  );

  const openChecklist = checklists.find(
    (checklist) => checklist.id === openChecklistId
  );

  const saveChecklists = (nextChecklists) => {
    onSaveBooking({
      ...booking,
      checklists: nextChecklists,
    });
  };

  const handleAddChecklist = (event) => {
    event.preventDefault();

    const checklistName = newChecklistName.trim();

    if (!checklistName) {
      return;
    }

    const nextChecklist = {
      id: createChecklistId("checklist"),
      name: checklistName,
      items: [],
    };

    saveChecklists([...checklists, nextChecklist]);
    setNewChecklistName("");
  };

  const renameChecklist = (checklist) => {
    const nextName = window.prompt("Checklist name", checklist.name);

    if (!nextName || !nextName.trim()) {
      return;
    }

    saveChecklists(
      checklists.map((currentChecklist) =>
        currentChecklist.id === checklist.id
          ? {
              ...currentChecklist,
              name: nextName.trim(),
            }
          : currentChecklist
      )
    );
  };

  const deleteChecklist = (checklistId) => {
    const confirmed = window.confirm(
      "Delete this checklist and all of its items?"
    );

    if (!confirmed) {
      return;
    }

    saveChecklists(
      checklists.filter((checklist) => checklist.id !== checklistId)
    );

    if (openChecklistId === checklistId) {
      setOpenChecklistId("");
    }
  };

  const startAddingItem = (checklist) => {
    const nextSequence = (checklist.items || []).length + 1;
    setEditingItemId("");
    setItemForm(createEmptyChecklistItemForm(nextSequence));
  };

  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    setItemForm({
      sequence: item.sequence || 1,
      title: item.title || "",
      dueDate: item.dueDate || "",
      assignedTo: item.assignedTo || "",
    });
  };

  const updateItemForm = (fieldName, value) => {
    setItemForm((currentForm) => ({
      ...currentForm,
      [fieldName]: value,
    }));
  };

  const handleSaveChecklistItem = (event) => {
    event.preventDefault();

    if (!openChecklist) {
      return;
    }

    const itemTitle = itemForm.title.trim();

    if (!itemTitle) {
      return;
    }

    const nextItem = {
      id: editingItemId || createChecklistId("item"),
      sequence: Number(itemForm.sequence) || 1,
      title: itemTitle,
      dueDate: itemForm.dueDate,
      assignedTo: itemForm.assignedTo.trim(),
      completed: false,
      completedAt: "",
      completedBy: "",
    };

    const nextChecklists = checklists.map((checklist) => {
      if (checklist.id !== openChecklist.id) {
        return checklist;
      }

      const existingItems = checklist.items || [];

      const nextItems = editingItemId
        ? existingItems.map((item) =>
            item.id === editingItemId
              ? {
                  ...item,
                  sequence: nextItem.sequence,
                  title: nextItem.title,
                  dueDate: nextItem.dueDate,
                  assignedTo: nextItem.assignedTo,
                }
              : item
          )
        : [...existingItems, nextItem];

      return {
        ...checklist,
        items: sortChecklistItems(nextItems),
      };
    });

    saveChecklists(nextChecklists);

    const nextSequence = (openChecklist.items || []).length + 1;
    setEditingItemId("");
    setItemForm(createEmptyChecklistItemForm(nextSequence));
  };

  const toggleChecklistItem = (checklistId, itemId) => {
    const today = formatDateForInput(new Date());

    saveChecklists(
      checklists.map((checklist) => {
        if (checklist.id !== checklistId) {
          return checklist;
        }

        return {
          ...checklist,
          items: (checklist.items || []).map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            const nextCompleted = !item.completed;

            return {
              ...item,
              completed: nextCompleted,
              completedAt: nextCompleted ? today : "",
              completedBy: nextCompleted ? "Admin" : "",
            };
          }),
        };
      })
    );
  };

  const deleteChecklistItem = (checklistId, itemId) => {
    const confirmed = window.confirm("Delete this checklist item?");

    if (!confirmed) {
      return;
    }

    saveChecklists(
      checklists.map((checklist) => {
        if (checklist.id !== checklistId) {
          return checklist;
        }

        return {
          ...checklist,
          items: (checklist.items || []).filter((item) => item.id !== itemId),
        };
      })
    );
  };

  return (
    <section className="booking-checklist-page">
      <article className="dashboard-card booking-checklist-card">
        <div className="booking-checklist-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaClipboardList />
            </span>

            <div>
              <p className="dashboard-eyebrow">Booking Workflow</p>
              <h3>Checklists</h3>
              <span>
                Track internal tasks for {booking.organizationName}.
              </span>
            </div>
          </div>

          <form className="booking-checklist-add-form" onSubmit={handleAddChecklist}>
            <input
              value={newChecklistName}
              placeholder="New checklist name..."
              onChange={(event) => setNewChecklistName(event.target.value)}
            />

            <button className="primary-dashboard-button" type="submit">
              <FaPlus />
              Add Checklist
            </button>
          </form>
        </div>

        {checklists.length > 0 ? (
          <div className="booking-checklist-table-wrap">
            <table className="booking-checklist-table">
              <thead>
                <tr>
                  <th aria-label="Edit"></th>
                  <th>Checklist Name</th>
                  <th>Progress</th>
                  <th>Items</th>
                  <th aria-label="Checklist Items"></th>
                  <th aria-label="Delete"></th>
                </tr>
              </thead>

              <tbody>
                {checklists.map((checklist) => {
                  const progress = getChecklistProgress(checklist);

                  return (
                    <tr key={checklist.id}>
                      <td>
                        <button
                          className="booking-checklist-icon-button"
                          type="button"
                          onClick={() => renameChecklist(checklist)}
                          aria-label={`Rename ${checklist.name}`}
                        >
                          ✎
                        </button>
                      </td>

                      <td>
                        <strong>{checklist.name}</strong>
                      </td>

                      <td>
                        <div className="booking-checklist-progress">
                          <div>
                            <span style={{ width: `${progress.percentage}%` }}></span>
                          </div>

                          <small>
                            {progress.completedItems} of {progress.totalItems} complete
                          </small>
                        </div>
                      </td>

                      <td>{progress.totalItems}</td>

                      <td>
                        <button
                          className="secondary-dashboard-button"
                          type="button"
                          onClick={() => {
                            setOpenChecklistId(checklist.id);
                            startAddingItem(checklist);
                          }}
                        >
                          Checklist Items
                        </button>
                      </td>

                      <td>
                        <button
                          className="booking-checklist-delete-button"
                          type="button"
                          onClick={() => deleteChecklist(checklist.id)}
                          aria-label={`Delete ${checklist.name}`}
                        >
                          <FaTrashAlt />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No checklists yet</strong>
            <p>Add a checklist to begin tracking booking tasks.</p>
          </div>
        )}
      </article>

      {openChecklist && (
        <div className="booking-checklist-modal-backdrop" role="presentation">
          <section
            className="booking-checklist-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${openChecklist.name} checklist items`}
          >
            <header className="booking-checklist-modal-header">
              <div>
                <h3>Checklist Items - {openChecklist.name}</h3>
                <p>{booking.organizationName}</p>
              </div>

              <button
                className="booking-checklist-modal-close"
                type="button"
                onClick={() => {
                  setOpenChecklistId("");
                  setEditingItemId("");
                }}
                aria-label="Close checklist items"
              >
                <FaTimes />
              </button>
            </header>

            <form
              className="booking-checklist-item-form"
              onSubmit={handleSaveChecklistItem}
            >
              <label>
                <span>Sequence</span>
                <input
                  type="number"
                  min="1"
                  value={itemForm.sequence}
                  onChange={(event) =>
                    updateItemForm("sequence", event.target.value)
                  }
                />
              </label>

              <label className="booking-checklist-item-title-field">
                <span>Title</span>
                <input
                  value={itemForm.title}
                  placeholder="Example: Call primary contact"
                  onChange={(event) => updateItemForm("title", event.target.value)}
                />
              </label>

              <label>
                <span>Due</span>
                <input
                  type="date"
                  value={itemForm.dueDate}
                  onChange={(event) => updateItemForm("dueDate", event.target.value)}
                />
              </label>

              <label>
                <span>Assigned To</span>
                <input
                  value={itemForm.assignedTo}
                  placeholder="Staff name"
                  onChange={(event) =>
                    updateItemForm("assignedTo", event.target.value)
                  }
                />
              </label>

              <div className="booking-checklist-item-form-actions">
                {editingItemId && (
                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={() => {
                      setEditingItemId("");
                      startAddingItem(openChecklist);
                    }}
                  >
                    Cancel Edit
                  </button>
                )}

                <button className="primary-dashboard-button" type="submit">
                  {editingItemId ? "Save Item" : "Add Checklist Item"}
                </button>
              </div>
            </form>

            <div className="booking-checklist-items-table-wrap">
              <table className="booking-checklist-items-table">
                <thead>
                  <tr>
                    <th aria-label="Edit"></th>
                    <th aria-label="Complete"></th>
                    <th>Sequence</th>
                    <th>Title</th>
                    <th>Due</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th aria-label="Delete"></th>
                  </tr>
                </thead>

                <tbody>
                  {sortChecklistItems(openChecklist.items).map((item) => (
                    <tr
                      className={item.completed ? "checklist-item-completed" : ""}
                      key={item.id}
                    >
                      <td>
                        <button
                          className="booking-checklist-icon-button"
                          type="button"
                          onClick={() => startEditingItem(item)}
                          aria-label={`Edit ${item.title}`}
                        >
                          ✎
                        </button>
                      </td>

                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(item.completed)}
                          onChange={() =>
                            toggleChecklistItem(openChecklist.id, item.id)
                          }
                          aria-label={`Toggle ${item.title}`}
                        />
                      </td>

                      <td>{item.sequence}</td>

                      <td>
                        <strong>{item.title}</strong>
                      </td>

                      <td>{item.dueDate || "—"}</td>

                      <td>{item.assignedTo || "—"}</td>

                      <td>
                        <button
                          className={`booking-checklist-status-button ${
                            item.completed ? "completed" : ""
                          }`}
                          type="button"
                          onClick={() =>
                            toggleChecklistItem(openChecklist.id, item.id)
                          }
                        >
                          {item.completed ? (
                            <>
                              Completed {item.completedAt || ""}
                              {item.completedBy ? ` by ${item.completedBy}` : ""}
                            </>
                          ) : (
                            "Not Complete"
                          )}
                        </button>
                      </td>

                      <td>
                        <button
                          className="booking-checklist-delete-button"
                          type="button"
                          onClick={() =>
                            deleteChecklistItem(openChecklist.id, item.id)
                          }
                          aria-label={`Delete ${item.title}`}
                        >
                          <FaTrashAlt />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {(openChecklist.items || []).length === 0 && (
                    <tr>
                      <td colSpan="8">
                        <div className="booking-checklist-empty-row">
                          No checklist items yet. Add the first item above.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer className="booking-checklist-modal-footer">
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={() => setOpenChecklistId("")}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function BookingDetailView({
  booking,
  activeTab,
  setActiveTab,
  onBack,
  onSaveBooking,
}) {
  const [isDateSettingsOpen, setIsDateSettingsOpen] = useState(false);
  const [dateSettings, setDateSettings] = useState(() =>
    getSavedBookingDetailDateSettings()
  );

  const updateDateSettings = (nextSettings) => {
    const updatedSettings = {
      ...dateSettings,
      ...nextSettings,
    };

    setDateSettings(updatedSettings);
    saveBookingDetailDateSettings(updatedSettings);
  };

  if (!booking) {
    return (
      <section className="dashboard-card booking-detail-empty">
        <strong>No booking selected</strong>
        <p>Select a booking from the dashboard or calendar to view details.</p>

        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onBack}
        >
          Back to Dashboard
        </button>
      </section>
    );
  }

  const totalLodging = booking.lodgingCost || "—";
  const totalFood = booking.foodCost || "—";
  const totalMisc = booking.miscCost || "—";
  const usageFee = booking.usageFee || "—";

    const dateSummary = formatBookingDetailDateRange(
    booking.startDate,
    booking.endDate,
    dateSettings
  );

  const submittedDate = formatBookingDetailDate(
    booking.submittedAt,
    dateSettings
  );

  const arrivalDate = formatBookingDetailDate(
    booking.startDate,
    dateSettings
  );

  const departureDate = formatBookingDetailDate(
    booking.endDate,
    dateSettings
  );

  const contactEmail =
    booking.email && booking.email !== "No email provided" ? booking.email : "";

  const contactPhone =
    booking.phone && booking.phone !== "No phone provided" ? booking.phone : "";

  const statusClass =
    booking.status === "Confirmed" ? "status-confirmed" : "status-inquiry";

  const groupInitials = getBookingInitials(booking.organizationName);

  return (
    <section className="booking-detail-page booking-profile-page">
      <header className="booking-profile-header">
        <button
          className="secondary-dashboard-button booking-profile-back-button"
          type="button"
          onClick={onBack}
        >
          <FaArrowLeft />
          Back
        </button>

        <div className="booking-profile-header-title">
          <p>Booking Profile</p>
          <h2>{booking.organizationName}</h2>
        </div>

        <div className="booking-profile-header-actions">
          <button
            className="secondary-dashboard-button booking-date-settings-button"
            type="button"
            onClick={() => setIsDateSettingsOpen(true)}
          >
            <FaCog />
            Date Display
          </button>

          <span className={`booking-profile-status ${statusClass}`}>
            {booking.status}
          </span>
        </div>

      {isDateSettingsOpen && (
        <BookingDateSettingsModal
          settings={dateSettings}
          updateSettings={updateDateSettings}
          onClose={() => setIsDateSettingsOpen(false)}
        />
      )}
      </header>

      <nav className="booking-detail-tabs booking-profile-tabs" aria-label="Booking detail tabs">
        {bookingDetailTabs.map((tab) => (
          <button
            className={activeTab === tab ? "active" : ""}
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <div className="booking-profile-layout">
          <aside className="booking-profile-sidebar">
            <div className="booking-profile-avatar">{groupInitials}</div>

            <div className="booking-profile-identity">
              <p>{booking.sourceType || "Booking"}</p>
              <h3>{booking.organizationName}</h3>
              <span>{booking.retreatType || "No program type selected"}</span>
            </div>

            <div className="booking-profile-date-card">
              <FaCalendarAlt />
              <div>
                <small>Stay Dates</small>
                <strong>{dateSummary}</strong>
              </div>
            </div>

            <div className="booking-profile-contact-card">
              <div className="booking-profile-card-heading">
                <span>
                  <FaUser />
                </span>

                <div>
                  <small>Primary Contact</small>
                  <strong>{booking.contactName || "No contact name"}</strong>
                </div>
              </div>

              <div className="booking-profile-contact-list">
                <p>{contactEmail || "No email provided"}</p>
                <p>{contactPhone || "No phone provided"}</p>
              </div>
            </div>

            <div className="booking-profile-side-facts">
              <div>
                <small>Guests</small>
                <strong>{booking.attendeeCount || "—"}</strong>
              </div>

              <div>
                <small>Waitlist</small>
                <strong>{booking.waitlist || "No"}</strong>
              </div>

              <div>
                <small>Submitted</small>
                <strong>{submittedDate}</strong>
              </div>
            </div>

            <div className="booking-profile-actions">
              <button className="primary-dashboard-button" type="button">
                <FaPaperPlane />
                Send Email
              </button>

              <button className="secondary-dashboard-button" type="button">
                <FaFileContract />
                Contract
              </button>
            </div>
          </aside>

          <section className="booking-profile-workspace">
            {/* <div className="booking-profile-metrics">
              <BookingMetric
                icon={FaSignInAlt}
                label="Arrival"
                value={arrivalDate}
              />

              <BookingMetric
                icon={FaSignOutAlt}
                label="Departure"
                value={departureDate}
              />

              <BookingMetric
                icon={FaUsers}
                label="Guests"
                value={booking.attendeeCount || "—"}
                helper={booking.retreatType || "Program not selected"}
              />

              <BookingMetric
                icon={FaRegCalendarCheck}
                label="Submitted"
                value={submittedDate}
              />
            </div> */}

            <div className="booking-profile-main-grid">
              <BookingSection
                icon={FaBed}
                title="Stay & Housing"
                eyebrow="Lodging"
              >
                <div className="booking-stay-timeline">
                  <div>
                    <span></span>
                    <div>
                      <small>Arrival</small>
                      <strong>{arrivalDate}</strong>
                    </div>
                  </div>

                  <div>
                    <span></span>
                    <div>
                      <small>Assigned Room / Area</small>
                      <strong>{booking.roomName || "Unassigned"}</strong>
                    </div>
                  </div>

                  <div>
                    <span></span>
                    <div>
                      <small>Departure</small>
                      <strong>{departureDate}</strong>
                    </div>
                  </div>
                </div>

                <div className="booking-compact-detail-grid">
                  <BookingDetailRow
                    icon={FaBuilding}
                    label="Buildings / Rooms"
                    value={booking.buildingsRooms || "—"}
                  />

                  <BookingDetailRow
                    icon={FaClipboardList}
                    label="Linen Sets"
                    value={booking.linenSets || "—"}
                  />
                </div>
              </BookingSection>

              <BookingSection
                icon={FaUtensils}
                title="Meals & Activities"
                eyebrow="Program logistics"
                action={
                  <button className="booking-profile-link-button" type="button">
                    Schedule
                  </button>
                }
              >
                <div className="booking-compact-detail-grid">
                  <BookingDetailRow
                    icon={FaUtensils}
                    label="Meals"
                    value={booking.meals || "—"}
                  />

                  <BookingDetailRow
                    icon={FaRegCalendarCheck}
                    label="# Meals"
                    value={booking.mealCount || "—"}
                  />

                  <BookingDetailRow
                    icon={FaHiking}
                    label="Activities"
                    value={booking.activities || "—"}
                  />

                  <BookingDetailRow
                    icon={FaExclamationTriangle}
                    label="Food Allergies"
                    value={booking.foodAllergies || "—"}
                    tone="warning"
                  />
                </div>
              </BookingSection>

              <BookingSection
                icon={FaDollarSign}
                title="Financial Snapshot"
                eyebrow="Billing"
              >
                <div className="booking-money-strip">
                  <div>
                    <small>Usage Fee</small>
                    <strong>{usageFee}</strong>
                  </div>

                  <div>
                    <small>Lodging</small>
                    <strong>{totalLodging}</strong>
                  </div>

                  <div>
                    <small>Food</small>
                    <strong>{totalFood}</strong>
                  </div>

                  <div>
                    <small>Misc.</small>
                    <strong>{totalMisc}</strong>
                  </div>
                </div>
              </BookingSection>

              <BookingSection
                icon={FaFileContract}
                title="Booking Workflow"
                eyebrow="Admin"
              >
                <div className="booking-workflow-list">
                  <div>
                    <span className="workflow-dot workflow-dot-complete"></span>
                    <div>
                      <small>Imported From</small>
                      <strong>{booking.sourceType || "Form"}</strong>
                    </div>
                  </div>

                  <div>
                    <span className="workflow-dot"></span>
                    <div>
                      <small>Submitted</small>
                      <strong>{submittedDate}</strong>
                    </div>
                  </div>

                  <div>
                    <span className="workflow-dot"></span>
                    <div>
                      <small>Contract Status</small>
                      <strong>
                        {booking.status === "Confirmed" ? "Viewed" : "Pending"}
                      </strong>
                    </div>
                  </div>
                </div>
              </BookingSection>

              <BookingSection
                icon={FaInfoCircle}
                title="Staff Notes"
                eyebrow="Need to know"
              >
                <div className="booking-notes-clean">
                  <p>{booking.needToKnow || booking.notes || "No notes added yet."}</p>
                </div>
              </BookingSection>

              <BookingSection
                icon={FaUser}
                title="Contact Snapshot"
                eyebrow="People"
              >
                <div className="booking-contact-snapshot">
                  <div>
                    <small>Name</small>
                    <strong>{booking.contactName || "No contact name"}</strong>
                  </div>

                  <div>
                    <small>Email</small>
                    <strong>{contactEmail || "—"}</strong>
                  </div>

                  <div>
                    <small>Phone</small>
                    <strong>{contactPhone || "—"}</strong>
                  </div>
                </div>
              </BookingSection>
            </div>
          </section>
        </div>
      )}

{activeTab === "Details" && (
  <BookingDetailsEditForm
    booking={booking}
    onSaveBooking={onSaveBooking}
  />
)}

{activeTab === "Housing" && <BookingHousingTab booking={booking} />}

{activeTab === "Activities" && (
  <BookingActivities
    initialActivities={
      booking.bookingActivitySchedule || {
        meals: [],
        recreation: [],
      }
    }
    onActivitiesChange={(updatedActivities) => {
      onSaveBooking({
        ...booking,
        bookingActivitySchedule: updatedActivities,
      });
    }}
  />
)}

{(activeTab === "Checklists" || activeTab === "Notes & Tasks") && (
  <BookingChecklistTab
    booking={booking}
    onSaveBooking={onSaveBooking}
  />
)}

{activeTab !== "Overview" &&
  activeTab !== "Details" &&
  activeTab !== "Housing" &&
  activeTab !== "Activities" &&
  activeTab !== "Checklists" &&
  activeTab !== "Notes & Tasks" && (
    <section className="dashboard-card booking-tab-placeholder">
      <h3>{activeTab}</h3>
      <p>
        This tab is ready to build next. The selected booking is{" "}
        <strong>{booking.organizationName}</strong>.
      </p>
    </section>
  )}
    </section>
  );
}

function getBookingInputMethod(booking) {
  const sourceType = String(booking.sourceType || "Form").trim();
  const detectedImportType = String(booking.detectedImportType || "").trim();

  if (!sourceType || sourceType === "Form") {
    return "Public Form";
  }

  if (sourceType === "Master 2026") {
    return "Imported - Master 2026";
  }

  if (sourceType === "Master") {
    return "Imported - Master";
  }

  if (sourceType === "Waitlist") {
    return "Imported - Waitlist";
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

    colorMode: "none",

    highlightMissingContact: true,
    highlightMissingDates: true,
    highlightWaitlist: true,
    highlightCancelled: true,
    highlightFoodAllergies: true,

    customHighlightText: "",
    customHighlightColumnId: "all",
  };
}

function getSavedSpreadsheetSettings() {
  try {
    const savedSettings = localStorage.getItem(
      SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY
    );

    if (!savedSettings) {
      return getDefaultSpreadsheetSettings();
    }

    const parsedSettings = {
      ...getDefaultSpreadsheetSettings(),
      ...JSON.parse(savedSettings),
    };

    return {
      ...parsedSettings,
      showColumnCategoryColors: Boolean(parsedSettings.showColumnCategoryColors),
      colorMode: "none",
    };
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

function SpreadsheetSettingsModal({
  settings,
  updateSettings,
  allColumns,
  orderedColumns,
  sourceTypeOptions,
  inputMethodCounts,
  sourceSheetOptions,
  sourceSheetCounts,
  statusOptions,
  filteredCount,
  totalCount,
  onClose,
  onReset,
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState("Sources");

  const visibleColumnIds =
    settings.visibleColumnIds || allColumns.map((column) => column.id);

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
              Showing {filteredCount} of {totalCount} rows.
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
          {["Sources", "Columns", "Filters", "Sorting", "Highlights", "Display"].map(
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
              </div>
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

function BookingSpreadsheetView({ inquiryBookings, openBookingDetail }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [spreadsheetSettings, setSpreadsheetSettings] = useState(() =>
    getSavedSpreadsheetSettings()
  );

  useEffect(() => {
    saveSpreadsheetSettings(spreadsheetSettings);
  }, [spreadsheetSettings]);

  const rawSpreadsheetColumns = useMemo(
    () => getRawSpreadsheetColumns(inquiryBookings),
    [inquiryBookings]
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
          inquiryBookings
            .map((booking) => getBookingInputMethod(booking))
            .filter(Boolean)
        )
      ).sort(),
    [inquiryBookings]
  );

  const inputMethodCounts = useMemo(() => {
    return inquiryBookings.reduce((counts, booking) => {
      const inputMethod = getBookingInputMethod(booking);

      counts[inputMethod] = (counts[inputMethod] || 0) + 1;

      return counts;
    }, {});
  }, [inquiryBookings]);

  const sourceSheetOptions = useMemo(
    () =>
      Array.from(
        new Set(
          inquiryBookings
            .map((booking) => getBookingSourceSheetLabel(booking))
            .filter(Boolean)
        )
      ).sort(),
    [inquiryBookings]
  );

  const sourceSheetCounts = useMemo(() => {
    return inquiryBookings.reduce((counts, booking) => {
      const sourceSheet = getBookingSourceSheetLabel(booking);

      counts[sourceSheet] = (counts[sourceSheet] || 0) + 1;

      return counts;
    }, {});
  }, [inquiryBookings]);

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(inquiryBookings.map((booking) => booking.status).filter(Boolean))
      ).sort(),
    [inquiryBookings]
  );

  const filteredAndSortedBookings = useMemo(() => {
    const searchText = spreadsheetSettings.searchText.trim().toLowerCase();
    const minGuests = getSpreadsheetNumber(spreadsheetSettings.minGuests);
    const maxGuests = getSpreadsheetNumber(spreadsheetSettings.maxGuests);

    const filteredBookings = inquiryBookings.filter((booking) => {
      if (
        searchText &&
        !getSpreadsheetSearchText(booking).includes(searchText)
      ) {
        return false;
      }

      if (spreadsheetSettings.sourceFilterMode === "inputMethod") {
        if (
          spreadsheetSettings.sourceTypes.length > 0 &&
          !spreadsheetSettings.sourceTypes.includes(getBookingInputMethod(booking))
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

    if (!sortColumn) {
      return filteredBookings;
    }

    return [...filteredBookings].sort((a, b) => {
      const result = compareSpreadsheetValues(
        getSpreadsheetComparableValue(sortColumn, a),
        getSpreadsheetComparableValue(sortColumn, b)
      );

      return spreadsheetSettings.sortDirection === "desc" ? -result : result;
    });
  }, [inquiryBookings, spreadsheetSettings, allSpreadsheetColumns]);

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

  const formCount = inquiryBookings.filter(
    (booking) => booking.sourceType === "Form"
  ).length;

  const importedCount = inquiryBookings.length - formCount;
  const hiddenColumnCount =
    allSpreadsheetColumns.length - visibleSpreadsheetColumns.length;

  return (
    <section className="spreadsheet-view-page">
      <article className="dashboard-card spreadsheet-view-card">
        <div className="spreadsheet-view-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaTable />
            </span>

            <div>
              <p className="dashboard-eyebrow">Spreadsheet View</p>
              <h2>All Booking Data</h2>
              <p>
                A full spreadsheet-style view of every
                <br />
                form submission + imported booking row.
              </p>
            </div>
          </div>

          <div className="spreadsheet-view-header-actions">
            <div className="spreadsheet-view-summary">
              <span>
                <strong>{filteredAndSortedBookings.length}</strong>
                Shown
              </span>

              <span>
                <strong>{inquiryBookings.length}</strong>
                Total Rows
              </span>

              <span>
                <strong>{formCount}</strong>
                Forms
              </span>

              <span>
                <strong>{importedCount}</strong>
                Imports
              </span>

              <span>
                <strong>{hiddenColumnCount}</strong>
                Hidden Columns
              </span>
            </div>

            <button
              className="primary-dashboard-button spreadsheet-settings-button"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
            >
              <FaCog />
              Settings
            </button>
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
                Columns:{" "}
                <strong>
                  {visibleSpreadsheetColumns.length}/{allSpreadsheetColumns.length}
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

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
              >
                Edit View
              </button>
            </div>

            <div className="spreadsheet-table-wrap">
              <table className="spreadsheet-table">
                <thead>
                  <tr>
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
                  {filteredAndSortedBookings.map((booking) => (
                    <tr
                      className={getSpreadsheetRowClass(
                        booking,
                        spreadsheetSettings
                      )}
                      key={booking.id}
                    >
                      {visibleSpreadsheetColumns.map((column, columnIndex) => (
                        <td
                          className={getSpreadsheetCellClass({
                            column,
                            columnIndex,
                            booking,
                            settings: spreadsheetSettings,
                          })}
                          key={`${booking.id}-${column.id}`}
                          title={getSpreadsheetDisplayValue(
                            getSpreadsheetComparableValue(column, booking)
                          )}
                        >
                          {column.render
                            ? column.render(booking, openBookingDetail)
                            : getSpreadsheetDisplayValue(column.value(booking))}
                        </td>
                      ))}
                    </tr>
                  ))}
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
          sourceTypeOptions={sourceTypeOptions}
          inputMethodCounts={inputMethodCounts}
          sourceSheetOptions={sourceSheetOptions}
          sourceSheetCounts={sourceSheetCounts}
          statusOptions={statusOptions}
          filteredCount={filteredAndSortedBookings.length}
          totalCount={inquiryBookings.length}
          onClose={() => setIsSettingsOpen(false)}
          onReset={resetSpreadsheetSettings}
        />
      )}
    </section>
  );
}

function getSavedContactIdList(storageKey) {
  try {
    const savedValue = localStorage.getItem(storageKey);

    if (!savedValue) {
      return [];
    }

    const parsedValue = JSON.parse(savedValue);

    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error("Could not read saved contact preferences:", error);
    return [];
  }
}

function saveContactIdList(storageKey, contactIds) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(contactIds));
  } catch (error) {
    console.error("Could not save contact preferences:", error);
  }
}

function getSavedContactsBoolean(storageKey, fallbackValue = true) {
  try {
    const savedValue = localStorage.getItem(storageKey);

    if (savedValue === null) {
      return fallbackValue;
    }

    return savedValue === "true";
  } catch (error) {
    console.error("Could not read saved contact setting:", error);
    return fallbackValue;
  }
}

function saveContactsBoolean(storageKey, value) {
  try {
    localStorage.setItem(storageKey, String(value));
  } catch (error) {
    console.error("Could not save contact setting:", error);
  }
}

function getContactsFromBookings(bookings) {
  const contactMap = new Map();

  bookings.forEach((booking) => {
    const contactName = String(
      booking.contactName || booking.name || ""
    ).trim();

    const organizationName = String(
      booking.organizationName || "No organization"
    ).trim();

    const emailValue = String(booking.email || "").trim();
    const phoneValue = String(booking.phone || "").trim();

    const email =
      emailValue && emailValue !== "No email provided" ? emailValue : "";

    const phone =
      phoneValue && phoneValue !== "No phone provided" ? phoneValue : "";

    if (!contactName && !email && !phone && !organizationName) {
      return;
    }

    const contactKey =
      email.toLowerCase() ||
      phone ||
      `${contactName.toLowerCase()}-${organizationName.toLowerCase()}`;

    if (!contactMap.has(contactKey)) {
      contactMap.set(contactKey, {
        id: contactKey,
        contactName: contactName || "No contact name",
        organizationName: organizationName || "No organization",
        email,
        phone,
        bookings: [],
      });
    }

    contactMap.get(contactKey).bookings.push(booking);
  });

  return Array.from(contactMap.values()).sort((a, b) =>
    a.contactName.localeCompare(b.contactName)
  );
}

function ContactsView({ inquiryBookings, openBookingDetail }) {
  const contacts = useMemo(
    () => getContactsFromBookings(inquiryBookings),
    [inquiryBookings]
  );
  
const [starredContactIds, setStarredContactIds] = useState(() =>
  getSavedContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY)
);

const [showStarredFirst, setShowStarredFirst] = useState(() =>
  getSavedContactsBoolean(CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY, false)
);

useEffect(() => {
  saveContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY, starredContactIds);
}, [starredContactIds]);

useEffect(() => {
  saveContactsBoolean(
    CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
    showStarredFirst
  );
}, [showStarredFirst]);

const starredContactIdSet = useMemo(
  () => new Set(starredContactIds),
  [starredContactIds]
);

const sortedContacts = useMemo(() => {
  return contacts
    .map((contact) => ({
      ...contact,
      isStarred: starredContactIdSet.has(contact.id),
    }))
    .sort((a, b) => {
      if (showStarredFirst && a.isStarred !== b.isStarred) {
        return a.isStarred ? -1 : 1;
      }

      return a.contactName.localeCompare(b.contactName);
    });
}, [contacts, starredContactIdSet, showStarredFirst]);

const toggleContactStar = (contactId) => {
  setStarredContactIds((currentIds) => {
    if (currentIds.includes(contactId)) {
      return currentIds.filter((id) => id !== contactId);
    }

    return [...currentIds, contactId];
  });
};

  return (
    <section className="contacts-view-page">
      <article className="dashboard-card contacts-view-card">
        <div className="contacts-view-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaUsers />
            </span>

            <div>
              <p className="dashboard-eyebrow">Rentals & Events</p>
              <h2>Contacts View</h2>
              <p>
                A staff-friendly list of contacts pulled from booking inquiries
                and imported spreadsheet rows.
              </p>
            </div>
          </div>

          <div className="contacts-view-summary">
            <span>
              <strong>{contacts.length}</strong>
              Contacts
            </span>

            <span>
              <strong>{inquiryBookings.length}</strong>
              Booking Rows
            </span>

            <span>
              <strong>{starredContactIds.length}</strong>
              Starred
            </span>


          </div>
        </div>

        <div className="contacts-view-toolbar">
          <label className="contacts-view-pin-toggle">
            <input
              type="checkbox"
              checked={showStarredFirst}
              onChange={(event) => setShowStarredFirst(event.target.checked)}
            />

            <span>Show starred contacts first</span>
          </label>

          <p>
            Star important contacts to highlight them. Turn this option on to move starred
            contacts to the top.
          </p>
        </div>

        {sortedContacts.length > 0 ? (
          <div className="contacts-view-table-wrap">
            <table className="contacts-view-table">
              <thead>
                <tr>
                  <th className="contacts-view-favorite-column">Star</th>
                  <th>Contact Name</th>
                  <th>Organization</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Bookings</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>

              <tbody>
                {sortedContacts.map((contact) => {
                  const latestBooking =
                    contact.bookings[contact.bookings.length - 1];

                  const rowClassName = [
                    "contacts-view-row",
                    contact.isStarred ? "contacts-view-row-starred" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <tr className={rowClassName} key={contact.id}>
                      <td className="contacts-view-favorite-cell">
                        <button
                          className={`contact-star-button ${
                            contact.isStarred ? "active" : ""
                          }`}
                          type="button"
                          onClick={() => toggleContactStar(contact.id)}
                          aria-label={
                            contact.isStarred
                              ? `Unstar ${contact.contactName}`
                              : `Star ${contact.contactName}`
                          }
                          title={contact.isStarred ? "Unstar" : "Star"}
                        >
                          {contact.isStarred ? <FaStar /> : <FaRegStar />}
                        </button>
                      </td>

                      <td>
                        <div className="contacts-view-name-cell">
                          <strong>{contact.contactName}</strong>

                        </div>
                      </td>

                      <td>{contact.organizationName}</td>

                      <td>{contact.email || "N/A"}</td>

                      <td>{contact.phone || "N/A"}</td>

                      <td>{contact.bookings.length}</td>

                      <td>
                        <div className="contacts-view-actions">

                          <button
                            className="table-link"
                            type="button"
                            onClick={() => openBookingDetail(latestBooking)}
                          >
                            View Booking
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No contacts yet</strong>
            <p>
              Submit the public form or import a spreadsheet to build the
              contacts list.
            </p>
          </div>
        )}
      </article>
    </section>
  );
}

function isBlankBookingValue(value) {
  const text = String(value || "").trim().toLowerCase();

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

function getBookingQualityIssues(booking) {
  const issues = [];

  if (isBlankBookingValue(booking.startDate)) {
    issues.push("Missing start date");
  }

  if (isBlankBookingValue(booking.contactName)) {
    issues.push("Missing contact");
  }

  if (isBlankBookingValue(booking.email) && isBlankBookingValue(booking.phone)) {
    issues.push("Missing email/phone");
  }

  if (isBlankBookingValue(booking.attendeeCount)) {
    issues.push("Missing guest count");
  }

  if (isBlankBookingValue(booking.retreatType)) {
    issues.push("Missing retreat type");
  }

  if (
    isBlankBookingValue(booking.roomName) &&
    isBlankBookingValue(booking.buildingsRooms)
  ) {
    issues.push("Missing room");
  }

  return issues;
}

function getInquiryPipelineColumnKey(booking) {
  const status = String(booking.status || "").toLowerCase();
  const waitlist = String(booking.waitlist || "").toLowerCase();
  const issues = getBookingQualityIssues(booking);

  if (status.includes("cancel")) {
    return "cancelled";
  }

  if (waitlist === "yes" || status.includes("wait")) {
    return "waitlist";
  }

  if (status.includes("confirm") || status.includes("booked")) {
    return "confirmed";
  }

  if (status.includes("contract")) {
    return "contractSent";
  }

  if (issues.length > 0) {
    return "needsReview";
  }

  return "newInquiry";
}

function getPipelineStatusClass(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus.includes("confirm") || normalizedStatus.includes("book")) {
    return "pipeline-status-confirmed";
  }

  if (normalizedStatus.includes("contract")) {
    return "pipeline-status-contract";
  }

  if (normalizedStatus.includes("cancel")) {
    return "pipeline-status-cancelled";
  }

  if (normalizedStatus.includes("wait")) {
    return "pipeline-status-waitlist";
  }

  if (normalizedStatus.includes("import")) {
    return "pipeline-status-imported";
  }

  return "pipeline-status-inquiry";
}

function InquiryPipelineView({
  inquiryBookings,
  openBookingDetail,
  onUpdateBookingStatus,
}) {
  const pipelineGroups = useMemo(() => {
    const groupedBookings = INQUIRY_PIPELINE_COLUMNS.reduce((groups, column) => {
      groups[column.key] = [];
      return groups;
    }, {});

    inquiryBookings.forEach((booking) => {
      const columnKey = getInquiryPipelineColumnKey(booking);
      groupedBookings[columnKey].push(booking);
    });

    Object.keys(groupedBookings).forEach((key) => {
      groupedBookings[key].sort((a, b) => {
        const aDate = new Date(a.submittedAt || a.startDate || 0);
        const bDate = new Date(b.submittedAt || b.startDate || 0);

        return bDate - aDate;
      });
    });

    return groupedBookings;
  }, [inquiryBookings]);

  const needsReviewCount = inquiryBookings.filter(
    (booking) =>
      getBookingQualityIssues(booking).length > 0 ||
      getInquiryPipelineColumnKey(booking) === "newInquiry"
  ).length;

  const contractSentCount = pipelineGroups.contractSent.length;
  const confirmedCount = pipelineGroups.confirmed.length;

  return (
    <section className="inquiry-pipeline-page">
      <article className="dashboard-card inquiry-pipeline-header-card">
        <div className="inquiry-pipeline-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaClipboardList />
            </span>

            <div>
              <p className="dashboard-eyebrow">Rentals & Events</p>
              <h2>Inquiry Pipeline</h2>
              <p>
                A workflow view for staff follow-up, missing information,
                contracts, confirmations, waitlists, and cancellations.
              </p>
            </div>
          </div>

          <div className="inquiry-pipeline-summary">
            <span>
              <strong>{needsReviewCount}</strong>
              Needs Action
            </span>

            <span>
              <strong>{contractSentCount}</strong>
              Contracts
            </span>

            <span>
              <strong>{confirmedCount}</strong>
              Confirmed
            </span>
          </div>
        </div>
      </article>

      <div className="inquiry-pipeline-board">
        {INQUIRY_PIPELINE_COLUMNS.map((column) => {
          const ColumnIcon = column.icon;
          const bookings = pipelineGroups[column.key] || [];

          return (
            <section className="inquiry-pipeline-column" key={column.key}>
              <div className="inquiry-pipeline-column-header">
                <div>
                  <span>
                    <ColumnIcon />
                  </span>

                  <div>
                    <h3>{column.label}</h3>
                    <p>{column.description}</p>
                  </div>
                </div>

                <strong>{bookings.length}</strong>
              </div>

              <div className="inquiry-pipeline-card-list">
                {bookings.length > 0 ? (
                  bookings.map((booking) => {
                    const issues = getBookingQualityIssues(booking);
                    const dateText =
                      formatDateRange(booking.startDate, booking.endDate) ||
                      booking.desiredDatesText ||
                      "No dates";

                    return (
                      <article
                        className="inquiry-pipeline-card"
                        key={booking.id}
                      >
                        <div className="inquiry-pipeline-card-top">
                          <div>
                            <strong>{booking.organizationName}</strong>
                            <small>{booking.contactName}</small>
                          </div>

                          <span
                            className={`inquiry-pipeline-status ${getPipelineStatusClass(
                              booking.status
                            )}`}
                          >
                            {booking.status || "Inquiry"}
                          </span>
                        </div>

                        <div className="inquiry-pipeline-card-meta">
                          <span>{dateText}</span>
                          <span>
                            {booking.attendeeCount
                              ? `${booking.attendeeCount} guests`
                              : "No guest count"}
                          </span>
                          <span>
                            {booking.retreatType || "No retreat type"}
                          </span>
                        </div>

                        {issues.length > 0 && (
                          <div className="inquiry-pipeline-issues">
                            {issues.slice(0, 3).map((issue) => (
                              <span key={`${booking.id}-${issue}`}>
                                {issue}
                              </span>
                            ))}

                            {issues.length > 3 && (
                              <span>+{issues.length - 3} more</span>
                            )}
                          </div>
                        )}

                        <div className="inquiry-pipeline-actions">
                          <button
                            className="pipeline-text-button"
                            type="button"
                            onClick={() => openBookingDetail(booking)}
                          >
                            View Details
                          </button>

                          {column.key !== "contractSent" &&
                            column.key !== "confirmed" &&
                            column.key !== "cancelled" && (
                              <button
                                className="pipeline-mini-button"
                                type="button"
                                onClick={() =>
                                  onUpdateBookingStatus(booking, "Contract Sent")
                                }
                              >
                                Contract
                              </button>
                            )}

                          {column.key !== "confirmed" &&
                            column.key !== "cancelled" && (
                              <button
                                className="pipeline-mini-button"
                                type="button"
                                onClick={() =>
                                  onUpdateBookingStatus(booking, "Confirmed")
                                }
                              >
                                Confirm
                              </button>
                            )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="inquiry-pipeline-empty">
                    <strong>No items</strong>
                    <p>Nothing currently in this stage.</p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function getSavedReportsViewSettings() {
  try {
    const savedSettings = localStorage.getItem(REPORTS_VIEW_SETTINGS_STORAGE_KEY);

    if (!savedSettings) {
      return DEFAULT_REPORTS_VIEW_SETTINGS;
    }

    return {
      ...DEFAULT_REPORTS_VIEW_SETTINGS,
      ...JSON.parse(savedSettings),
    };
  } catch (error) {
    console.error("Could not read reports settings:", error);
    return DEFAULT_REPORTS_VIEW_SETTINGS;
  }
}

function saveReportsViewSettings(settings) {
  try {
    localStorage.setItem(REPORTS_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save reports settings:", error);
  }
}

function getReportsDateRange(settings) {
  const today = getLocalDate(formatDateForInput(new Date()));
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  if (settings.dateRange === "allTime") {
    return {
      startDate: null,
      endDate: null,
      label: "All Time",
    };
  }

  if (settings.dateRange === "thisMonth") {
    return {
      startDate: new Date(currentYear, currentMonth, 1),
      endDate: new Date(currentYear, currentMonth + 1, 0),
      label: "This Month",
    };
  }

  if (settings.dateRange === "nextMonth") {
    return {
      startDate: new Date(currentYear, currentMonth + 1, 1),
      endDate: new Date(currentYear, currentMonth + 2, 0),
      label: "Next Month",
    };
  }

  if (settings.dateRange === "nextYear") {
    return {
      startDate: new Date(currentYear + 1, 0, 1),
      endDate: new Date(currentYear + 1, 11, 31),
      label: `${currentYear + 1}`,
    };
  }

  if (settings.dateRange === "custom") {
    const startDate = settings.customStartDate
      ? getLocalDate(settings.customStartDate)
      : null;

    const endDate = settings.customEndDate
      ? getLocalDate(settings.customEndDate)
      : null;

    if (startDate && endDate && startDate > endDate) {
      return {
        startDate: endDate,
        endDate: startDate,
        label: "Custom Date Range",
      };
    }

    return {
      startDate,
      endDate,
      label: "Custom Date Range",
    };
  }

  return {
    startDate: new Date(currentYear, 0, 1),
    endDate: new Date(currentYear, 11, 31),
    label: `${currentYear}`,
  };
}

function bookingTouchesReportsDateRange(booking, dateRange) {
  if (!dateRange.startDate && !dateRange.endDate) {
    return true;
  }

  const bookingStartDate = getLocalDate(booking.startDate);

  if (!bookingStartDate) {
    return false;
  }

  const bookingEndDate = booking.endDate
    ? getLocalDate(booking.endDate)
    : bookingStartDate;

  if (dateRange.startDate && dateRange.endDate) {
    return bookingStartDate <= dateRange.endDate && bookingEndDate >= dateRange.startDate;
  }

  if (dateRange.startDate) {
    return bookingEndDate >= dateRange.startDate;
  }

  return bookingStartDate <= dateRange.endDate;
}

function getReportsNumber(value) {
  const text = String(value || "").replace(/[$,]/g, "").trim();
  const match = text.match(/-?\d+(\.\d+)?/);

  if (!match) {
    return 0;
  }

  const number = Number(match[0]);

  return Number.isFinite(number) ? number : 0;
}

function getReportsGuestCount(booking) {
  return getReportsNumber(
    booking.attendeeCount || booking.groupSize || booking.persons
  );
}

function getReportsRevenue(booking) {
  const invoiceTotal = getReportsNumber(booking.invoiceLodgingMeals);
  const expectedMinimumRevenue = getReportsNumber(booking.expectedMinimumRevenue);
  const monthlyProjectedIncome = getReportsNumber(booking.monthlyProjectedIncome);

  const itemizedTotal =
    getReportsNumber(booking.usageFee) +
    getReportsNumber(booking.lodgingCost) +
    getReportsNumber(booking.foodCost) +
    getReportsNumber(booking.miscCost);

  return (
    invoiceTotal ||
    expectedMinimumRevenue ||
    monthlyProjectedIncome ||
    itemizedTotal
  );
}

function formatReportsCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatReportsNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function getReportsPercent(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function getReportsMonthKey(booking) {
  const date = getLocalDate(booking.startDate);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function formatReportsMonthLabel(monthKey) {
  if (!monthKey) {
    return "No Month";
  }

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function getReportsRetreatType(booking) {
  return String(booking.retreatType || "").trim() || "No Retreat Type";
}

function getReportsSourceLabel(booking) {
  return getBookingInputMethod(booking);
}

function downloadReportsCsv(filename, sections) {
  const rows = [];

  sections.forEach((section) => {
    rows.push([section.title]);
    rows.push(section.headers);

    section.rows.forEach((row) => {
      rows.push(row);
    });

    rows.push([]);
  });

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function ReportSummaryCard({ icon: Icon, label, value, helper, tone = "default" }) {
  return (
    <article className={`reports-summary-card reports-summary-card-${tone}`}>
      <span className="reports-summary-icon">
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper && <p>{helper}</p>}
      </div>
    </article>
  );
}

function ReportBarRow({ label, value, maxValue, valueLabel, helper }) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 0;

  return (
    <div className="reports-bar-row">
      <div className="reports-bar-row-top">
        <strong>{label}</strong>
        <span>{valueLabel || formatReportsNumber(value)}</span>
      </div>

      <div className="reports-bar-track">
        <span style={{ width: `${width}%` }}></span>
      </div>

      {helper && <small>{helper}</small>}
    </div>
  );
}

function ReportsView({ inquiryBookings }) {
  const [reportsSettings, setReportsSettings] = useState(() =>
    getSavedReportsViewSettings()
  );

  useEffect(() => {
    saveReportsViewSettings(reportsSettings);
  }, [reportsSettings]);

  const updateReportsSettings = (updates) => {
    setReportsSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
    }));
  };

  const reportDateRange = useMemo(
    () => getReportsDateRange(reportsSettings),
    [reportsSettings]
  );

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(inquiryBookings.map((booking) => booking.status).filter(Boolean))
      ).sort(),
    [inquiryBookings]
  );

  const retreatTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(inquiryBookings.map((booking) => getReportsRetreatType(booking)))
      ).sort(),
    [inquiryBookings]
  );

  const filteredReportBookings = useMemo(() => {
    return inquiryBookings.filter((booking) => {
      if (
        reportsSettings.status !== "all" &&
        booking.status !== reportsSettings.status
      ) {
        return false;
      }

      if (
        reportsSettings.retreatType !== "all" &&
        getReportsRetreatType(booking) !== reportsSettings.retreatType
      ) {
        return false;
      }

      if (reportsSettings.sourceMode === "forms") {
        const inputMethod = getReportsSourceLabel(booking).toLowerCase();

        if (!inputMethod.includes("form")) {
          return false;
        }
      }

      if (reportsSettings.sourceMode === "imports") {
        const inputMethod = getReportsSourceLabel(booking).toLowerCase();

        if (inputMethod.includes("form")) {
          return false;
        }
      }

      return bookingTouchesReportsDateRange(booking, reportDateRange);
    });
  }, [inquiryBookings, reportsSettings, reportDateRange]);

  const totalBookings = filteredReportBookings.length;

  const confirmedBookings = filteredReportBookings.filter((booking) =>
    String(booking.status || "").toLowerCase().includes("confirm")
  );

  const inquiryBookingsCount = filteredReportBookings.filter((booking) =>
    String(booking.status || "").toLowerCase().includes("inquiry")
  ).length;

  const cancelledBookings = filteredReportBookings.filter((booking) =>
    String(booking.status || "").toLowerCase().includes("cancel")
  );

  const waitlistBookings = filteredReportBookings.filter(
    (booking) =>
      String(booking.waitlist || "").toLowerCase() === "yes" ||
      String(booking.status || "").toLowerCase().includes("wait")
  );

  const totalGuests = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsGuestCount(booking),
    0
  );

  const totalCamperDays = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsNumber(booking.camperDays),
    0
  );

  const projectedRevenue = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsRevenue(booking),
    0
  );

  const depositsReceived = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsNumber(booking.depositReceived),
    0
  );

  const monthlyRows = useMemo(() => {
    const monthMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const monthKey = getReportsMonthKey(booking);

      if (!monthKey) {
        return;
      }

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          label: formatReportsMonthLabel(monthKey),
          bookings: 0,
          confirmed: 0,
          guests: 0,
          revenue: 0,
        });
      }

      const row = monthMap.get(monthKey);

      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
      row.revenue += getReportsRevenue(booking);

      if (String(booking.status || "").toLowerCase().includes("confirm")) {
        row.confirmed += 1;
      }
    });

    return Array.from(monthMap.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );
  }, [filteredReportBookings]);

  const maxMonthlyBookings = Math.max(
    0,
    ...monthlyRows.map((row) => row.bookings)
  );

  const maxMonthlyGuests = Math.max(0, ...monthlyRows.map((row) => row.guests));

  const maxMonthlyRevenue = Math.max(
    0,
    ...monthlyRows.map((row) => row.revenue)
  );

  const revenueBreakdown = [
    {
      label: "Usage Fees",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.usageFee),
        0
      ),
    },
    {
      label: "Lodging",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.lodgingCost),
        0
      ),
    },
    {
      label: "Food",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.foodCost),
        0
      ),
    },
    {
      label: "Misc.",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.miscCost),
        0
      ),
    },
    {
      label: "Expected Minimum Revenue",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.expectedMinimumRevenue),
        0
      ),
    },
    {
      label: "Deposits Received",
      value: depositsReceived,
    },
  ];

  const maxRevenueBreakdown = Math.max(
    0,
    ...revenueBreakdown.map((item) => item.value)
  );

  const retreatTypeRows = useMemo(() => {
    const retreatTypeMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const retreatType = getReportsRetreatType(booking);

      if (!retreatTypeMap.has(retreatType)) {
        retreatTypeMap.set(retreatType, {
          label: retreatType,
          bookings: 0,
          guests: 0,
          revenue: 0,
        });
      }

      const row = retreatTypeMap.get(retreatType);

      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
      row.revenue += getReportsRevenue(booking);
    });

    return Array.from(retreatTypeMap.values()).sort(
      (a, b) => b.bookings - a.bookings
    );
  }, [filteredReportBookings]);

  const maxRetreatTypeBookings = Math.max(
    0,
    ...retreatTypeRows.map((row) => row.bookings)
  );

  const statusRows = useMemo(() => {
    const statusMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const status = String(booking.status || "No Status").trim();

      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });

    return Array.from(statusMap.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReportBookings]);

  const maxStatusCount = Math.max(0, ...statusRows.map((row) => row.count));

  const sourceRows = useMemo(() => {
    const sourceMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const source = getReportsSourceLabel(booking);

      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });

    return Array.from(sourceMap.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReportBookings]);

  const maxSourceCount = Math.max(0, ...sourceRows.map((row) => row.count));

  const dataQualityRows = [
    {
      label: "Missing Dates",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.startDate)
      ).length,
    },
    {
      label: "Missing Email + Phone",
      count: filteredReportBookings.filter(
        (booking) =>
          isBlankBookingValue(booking.email) && isBlankBookingValue(booking.phone)
      ).length,
    },
    {
      label: "Missing Guest Count",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.attendeeCount)
      ).length,
    },
    {
      label: "Missing Retreat Type",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.retreatType)
      ).length,
    },
    {
      label: "Missing Housing",
      count: filteredReportBookings.filter(
        (booking) =>
          isBlankBookingValue(booking.roomName) &&
          isBlankBookingValue(booking.buildingsRooms)
      ).length,
    },
    {
      label: "Missing Deposit Received",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.depositReceived)
      ).length,
    },
  ];

  const maxQualityCount = Math.max(0, ...dataQualityRows.map((row) => row.count));

  const handleExportReports = () => {
    downloadReportsCsv("toah-nipi-reports-summary.csv", [
      {
        title: "Executive Summary",
        headers: ["Metric", "Value"],
        rows: [
          ["Total Bookings", totalBookings],
          ["Confirmed Bookings", confirmedBookings.length],
          ["Inquiry Bookings", inquiryBookingsCount],
          ["Cancelled Bookings", cancelledBookings.length],
          ["Waitlist Bookings", waitlistBookings.length],
          ["Total Guests", totalGuests],
          ["Total Camper Days", totalCamperDays],
          ["Projected Revenue", projectedRevenue],
          ["Deposits Received", depositsReceived],
        ],
      },
      {
        title: "Monthly Trends",
        headers: ["Month", "Bookings", "Confirmed", "Guests", "Revenue"],
        rows: monthlyRows.map((row) => [
          row.label,
          row.bookings,
          row.confirmed,
          row.guests,
          row.revenue,
        ]),
      },
      {
        title: "Revenue Breakdown",
        headers: ["Category", "Value"],
        rows: revenueBreakdown.map((item) => [item.label, item.value]),
      },
      {
        title: "Retreat Type Breakdown",
        headers: ["Retreat Type", "Bookings", "Guests", "Revenue"],
        rows: retreatTypeRows.map((row) => [
          row.label,
          row.bookings,
          row.guests,
          row.revenue,
        ]),
      },
      {
        title: "Data Quality",
        headers: ["Issue", "Count"],
        rows: dataQualityRows.map((row) => [row.label, row.count]),
      },
    ]);
  };

  return (
    <section className="reports-page">
      <article className="dashboard-card reports-header-card">
        <div className="reports-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaChartBar />
            </span>

            <div>
              <p className="dashboard-eyebrow">Reporting</p>
              <h2>Reports</h2>
              <p>
                High-level booking, revenue, group type, source, and data quality
                insights across the selected report range.
              </p>
            </div>
          </div>

          <button
            className="primary-dashboard-button"
            type="button"
            onClick={handleExportReports}
            disabled={filteredReportBookings.length === 0}
          >
            <FaTable />
            Export CSV
          </button>
        </div>

        <div className="reports-filter-bar">
          <label className="reports-filter-field">
            <span>Date Range</span>

            <select
              value={reportsSettings.dateRange}
              onChange={(event) =>
                updateReportsSettings({ dateRange: event.target.value })
              }
            >
              {reportsDateRangeOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {reportsSettings.dateRange === "custom" && (
            <>
              <label className="reports-filter-field">
                <span>From</span>

                <input
                  type="date"
                  value={reportsSettings.customStartDate}
                  onChange={(event) =>
                    updateReportsSettings({
                      customStartDate: event.target.value,
                    })
                  }
                />
              </label>

              <label className="reports-filter-field">
                <span>To</span>

                <input
                  type="date"
                  value={reportsSettings.customEndDate}
                  onChange={(event) =>
                    updateReportsSettings({
                      customEndDate: event.target.value,
                    })
                  }
                />
              </label>
            </>
          )}

          <label className="reports-filter-field">
            <span>Status</span>

            <select
              value={reportsSettings.status}
              onChange={(event) =>
                updateReportsSettings({ status: event.target.value })
              }
            >
              <option value="all">All Statuses</option>

              {statusOptions.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter-field">
            <span>Retreat Type</span>

            <select
              value={reportsSettings.retreatType}
              onChange={(event) =>
                updateReportsSettings({ retreatType: event.target.value })
              }
            >
              <option value="all">All Retreat Types</option>

              {retreatTypeOptions.map((retreatType) => (
                <option value={retreatType} key={retreatType}>
                  {retreatType}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter-field">
            <span>Source</span>

            <select
              value={reportsSettings.sourceMode}
              onChange={(event) =>
                updateReportsSettings({ sourceMode: event.target.value })
              }
            >
              <option value="all">Forms + Imports</option>
              <option value="forms">Forms Only</option>
              <option value="imports">Imports Only</option>
            </select>
          </label>

          <button
            className="secondary-dashboard-button reports-reset-button"
            type="button"
            onClick={() => updateReportsSettings(DEFAULT_REPORTS_VIEW_SETTINGS)}
          >
            Reset
          </button>
        </div>
      </article>

      <section className="reports-summary-grid">
        <ReportSummaryCard
          icon={FaClipboardList}
          label="Total Bookings"
          value={formatReportsNumber(totalBookings)}
          helper={`${reportDateRange.label} report range`}
          tone="purple"
        />

        <ReportSummaryCard
          icon={FaRegCalendarCheck}
          label="Confirmed"
          value={formatReportsNumber(confirmedBookings.length)}
          helper={`${getReportsPercent(confirmedBookings.length, totalBookings)}% of filtered rows`}
          tone="green"
        />

        <ReportSummaryCard
          icon={FaUsers}
          label="Total Guests"
          value={formatReportsNumber(totalGuests)}
          helper="Based on guest count fields"
          tone="blue"
        />

        <ReportSummaryCard
          icon={FaDollarSign}
          label="Projected Revenue"
          value={formatReportsCurrency(projectedRevenue)}
          helper="Invoice, expected, monthly, or itemized values"
          tone="gold"
        />

        <ReportSummaryCard
          icon={FaClock}
          label="Waitlist"
          value={formatReportsNumber(waitlistBookings.length)}
          helper={`${getReportsPercent(waitlistBookings.length, totalBookings)}% of filtered rows`}
          tone="teal"
        />

        <ReportSummaryCard
          icon={FaExclamationTriangle}
          label="Cancelled"
          value={formatReportsNumber(cancelledBookings.length)}
          helper={`${getReportsPercent(cancelledBookings.length, totalBookings)}% of filtered rows`}
          tone="red"
        />
      </section>

      <section className="reports-grid">
        <article className="dashboard-card reports-panel reports-panel-wide">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Trends</p>
              <h3>Monthly Booking Trends</h3>
              <span>Bookings, guests, and revenue grouped by arrival month.</span>
            </div>
          </div>

          {monthlyRows.length > 0 ? (
            <div className="reports-monthly-grid">
              <div>
                <h4>Bookings by Month</h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`bookings-${row.monthKey}`}
                      label={row.label}
                      value={row.bookings}
                      maxValue={maxMonthlyBookings}
                      valueLabel={`${row.bookings} booking${row.bookings === 1 ? "" : "s"}`}
                      helper={`${row.confirmed} confirmed`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h4>Guests by Month</h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`guests-${row.monthKey}`}
                      label={row.label}
                      value={row.guests}
                      maxValue={maxMonthlyGuests}
                      valueLabel={`${formatReportsNumber(row.guests)} guests`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h4>Revenue by Month</h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`revenue-${row.monthKey}`}
                      label={row.label}
                      value={row.revenue}
                      maxValue={maxMonthlyRevenue}
                      valueLabel={formatReportsCurrency(row.revenue)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="reports-empty-state">
              <strong>No monthly report data</strong>
              <p>
                This usually means no filtered bookings have usable start dates.
              </p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Revenue</p>
              <h3>Financial Breakdown</h3>
              <span>Totals from billing-related spreadsheet fields.</span>
            </div>
          </div>

          <div className="reports-bar-list">
            {revenueBreakdown.map((item) => (
              <ReportBarRow
                key={item.label}
                label={item.label}
                value={item.value}
                maxValue={maxRevenueBreakdown}
                valueLabel={formatReportsCurrency(item.value)}
              />
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Groups</p>
              <h3>Retreat Type Breakdown</h3>
              <span>Which kinds of groups are booking most often.</span>
            </div>
          </div>

          {retreatTypeRows.length > 0 ? (
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Retreat Type</th>
                    <th>Bookings</th>
                    <th>Guests</th>
                    <th>Revenue</th>
                  </tr>
                </thead>

                <tbody>
                  {retreatTypeRows.map((row) => (
                    <tr key={row.label}>
                      <td>
                        <strong>{row.label}</strong>
                        <div className="reports-mini-track">
                          <span
                            style={{
                              width: `${
                                maxRetreatTypeBookings
                                  ? Math.max(
                                      (row.bookings / maxRetreatTypeBookings) * 100,
                                      4
                                    )
                                  : 0
                              }%`,
                            }}
                          ></span>
                        </div>
                      </td>
                      <td>{formatReportsNumber(row.bookings)}</td>
                      <td>{formatReportsNumber(row.guests)}</td>
                      <td>{formatReportsCurrency(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="reports-empty-state">
              <strong>No retreat type data</strong>
              <p>No rows matched the current report filters.</p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Pipeline</p>
              <h3>Status Breakdown</h3>
              <span>High-level workflow totals, not individual cards.</span>
            </div>
          </div>

          <div className="reports-bar-list">
            {statusRows.map((row) => (
              <ReportBarRow
                key={row.label}
                label={row.label}
                value={row.count}
                maxValue={maxStatusCount}
                valueLabel={`${row.count} row${row.count === 1 ? "" : "s"}`}
                helper={`${getReportsPercent(row.count, totalBookings)}% of report`}
              />
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Data Health</p>
              <h3>Data Quality Report</h3>
              <span>Missing information that may need cleanup.</span>
            </div>
          </div>

          <div className="reports-quality-list">
            {dataQualityRows.map((row) => (
              <div className="reports-quality-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <span>
                    {getReportsPercent(row.count, totalBookings)}% of filtered rows
                  </span>
                </div>

                <em>{row.count}</em>

                <div className="reports-mini-track">
                  <span
                    style={{
                      width: `${
                        maxQualityCount
                          ? Math.max((row.count / maxQualityCount) * 100, 4)
                          : 0
                      }%`,
                    }}
                  ></span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Sources</p>
              <h3>Input Source Breakdown</h3>
              <span>How booking rows entered the system.</span>
            </div>
          </div>

          <div className="reports-bar-list">
            {sourceRows.map((row) => (
              <ReportBarRow
                key={row.label}
                label={row.label}
                value={row.count}
                maxValue={maxSourceCount}
                valueLabel={`${row.count} row${row.count === 1 ? "" : "s"}`}
                helper={`${getReportsPercent(row.count, totalBookings)}% of report`}
              />
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

export default function Dashboard() {
  const today = new Date();

  const waitlistFileInputRef = useRef(null);
  const masterFileInputRef = useRef(null);
  const master2026FileInputRef = useRef(null);
  const importEverythingFileInputRef = useRef(null);
  const importDropdownRef = useRef(null);

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [activeView, setActiveView] = useState("Dashboard");
  const [isSpreadsheetViewLoading, setIsSpreadsheetViewLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingDetailTab, setBookingDetailTab] = useState("Overview");

  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isDatedInquirySettingsOpen, setIsDatedInquirySettingsOpen] =
    useState(false);

  const [datedInquirySettings, setDatedInquirySettings] = useState(() => {
    try {
      const savedSettings = localStorage.getItem(
        DATED_INQUIRY_SETTINGS_STORAGE_KEY
      );

      if (!savedSettings) {
        return DEFAULT_DATED_INQUIRY_SETTINGS;
      }

      return {
        ...DEFAULT_DATED_INQUIRY_SETTINGS,
        ...JSON.parse(savedSettings),
      };
    } catch (error) {
      console.error("Could not read dated inquiry settings:", error);
      return DEFAULT_DATED_INQUIRY_SETTINGS;
    }
  });


  const [datedInquiryDateFilter, setDatedInquiryDateFilter] = useState(() =>
    getSavedDashboardFilterValue(
      DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
      "thisMonth"
    )
  );

  const [datedInquiryCustomStartDate, setDatedInquiryCustomStartDate] =
    useState(() =>
      getSavedDashboardFilterValue(
        DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
        ""
      )
    );

  const [datedInquiryCustomEndDate, setDatedInquiryCustomEndDate] = useState(() =>
    getSavedDashboardFilterValue(DATED_INQUIRY_CUSTOM_END_STORAGE_KEY, "")
  );

  const [publicInquiries, setPublicInquiries] = useState(() =>
    getSavedInquiries()
  );

  const updateDatedInquirySetting = (settingName, value) => {
    setDatedInquirySettings((currentSettings) => ({
      ...currentSettings,
      [settingName]: value,
    }));
  };

  const refreshInquiries = () => {
    setPublicInquiries(getSavedInquiries());
  };

  const deleteAllInquiries = () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all inquiries and imported bookings? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem("toahNipiPublicInquiries");
    setPublicInquiries([]);
  };


  const saveBookingEdits = (updatedBooking) => {
    const updatedAt = new Date().toISOString();
    let didUpdateExistingBooking = false;

    const nextInquiries = publicInquiries.map((inquiry, index) => {
      const normalizedInquiry = normalizeInquiry(inquiry, index);

      if (normalizedInquiry.id !== updatedBooking.id) {
        return inquiry;
      }

      didUpdateExistingBooking = true;

      return {
        ...inquiry,
        ...updatedBooking,

        id: updatedBooking.id,

        organizationName: updatedBooking.organizationName,

        contactName: updatedBooking.contactName,
        name: updatedBooking.contactName,

        firstName: "",
        lastName: "",

        email: updatedBooking.email,
        phone: updatedBooking.phone,

        startDate: updatedBooking.startDate,
        endDate: updatedBooking.endDate,
        desiredDatesText: updatedBooking.desiredDatesText,
        desiredDates: updatedBooking.desiredDatesText,

        attendeeCount: updatedBooking.attendeeCount,
        groupSize: updatedBooking.attendeeCount,

        retreatType: updatedBooking.retreatType,
        status: updatedBooking.status,
        waitlist: updatedBooking.waitlist,

        roomName: updatedBooking.roomName,
        buildingsRooms: updatedBooking.buildingsRooms,

        meals: updatedBooking.meals,
        foodAllergies: updatedBooking.foodAllergies,
        needToKnow: updatedBooking.needToKnow,
        linenSets: updatedBooking.linenSets,
        activities: updatedBooking.activities,

        persons: updatedBooking.persons,
        nights: updatedBooking.nights,
        mealCount: updatedBooking.mealCount,
        camperDays: updatedBooking.camperDays,

        usageFee: updatedBooking.usageFee,
        lodgingCost: updatedBooking.lodgingCost,
        foodCost: updatedBooking.foodCost,
        miscCost: updatedBooking.miscCost,

        notes: updatedBooking.notes,
        message: updatedBooking.notes,

        checklists: Array.isArray(updatedBooking.checklists)
          ? updatedBooking.checklists
          : null,

        updatedAt,
      };
    });

    const inquiriesToSave = didUpdateExistingBooking
      ? nextInquiries
      : [
          ...publicInquiries,
          {
            ...updatedBooking,
            updatedAt,
          },
        ];

    localStorage.setItem(
      "toahNipiPublicInquiries",
      JSON.stringify(inquiriesToSave)
    );

    setPublicInquiries(inquiriesToSave);
    setSelectedBooking({
      ...updatedBooking,
      updatedAt,
    });
  };

  const importSpreadsheet = async ({
    event,
    importTypeLabel,
    normalizeRow,
    expectedColumns,
  }) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileData = await file.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const allImportedRows = [];
      const skippedSheets = [];

      workbook.worksheets.forEach((worksheet) => {
        const headerRow = worksheet.getRow(1);
        const headers = {};

        headerRow.eachCell((cell, columnNumber) => {
          const headerName = String(cleanExcelCellValue(cell.value)).trim();

          if (headerName) {
            headers[headerName] = columnNumber;
          }
        });

        const hasExpectedColumns = expectedColumns.some((columnName) =>
          Boolean(headers[columnName])
        );

        if (!hasExpectedColumns) {
          skippedSheets.push(worksheet.name);
          return;
        }

        const spreadsheetRows = [];

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            return;
          }

          const rowObject = {};

          Object.entries(headers).forEach(([headerName, columnNumber]) => {
            rowObject[headerName] = cleanExcelCellValue(
              row.getCell(columnNumber).value
            );
          });

          rowObject.sourceSheet = worksheet.name;
          rowObject.sourceRowNumber = rowNumber;

          spreadsheetRows.push(rowObject);
        });

        const importedRowsForSheet = spreadsheetRows
          .map((row, index) => normalizeRow(row, index))
          .filter(Boolean);

        allImportedRows.push(...importedRowsForSheet);
      });

      if (allImportedRows.length === 0) {
        alert(
          `No valid ${importTypeLabel} rows were found. Make sure the spreadsheet has the correct columns.`
        );
        return;
      }

      const nextInquiries = [...publicInquiries, ...allImportedRows];

      localStorage.setItem(
        "toahNipiPublicInquiries",
        JSON.stringify(nextInquiries)
      );

      setPublicInquiries(nextInquiries);

      const skippedMessage =
        skippedSheets.length > 0
          ? `\n\nSkipped sheets: ${skippedSheets.join(", ")}`
          : "";

      alert(
        `Imported ${allImportedRows.length} ${importTypeLabel} row(s).${skippedMessage}`
      );
    } catch (error) {
      console.error(`Could not import ${importTypeLabel} spreadsheet:`, error);
      alert(`Sorry, that ${importTypeLabel} spreadsheet could not be imported.`);
    } finally {
      event.target.value = "";
    }
  };

  const handleImportWaitlistSpreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "waitlist",
      normalizeRow: normalizeWaitlistSpreadsheetRow,
      expectedColumns: [
        "Date",
        "Contact Name",
        "Email Address",
        "Phone Number",
        "Guest Group Name",
        "Size",
        "Desired Dates",
        "Additional Notes",
        "Waitlist or No",
      ],
    });
  };

  const handleImportMasterSpreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master booking",
      normalizeRow: normalizeMasterSpreadsheetRow,
      expectedColumns: [
        "Arrival Date",
        "Departure Date",
        "Guest Group Name",
        "Guest Group Type",
        "Returning (R) or New (N)",
        "Contact Person",
        "Contact Person Cell #",
        "Actual Number of Guests",
        "Buildings/Rooms",
        "Meals",
        "Food Allergies",
        "Need to know",
        "Linen Sets",
        "Activities",
        "#Persons",
        "#Nights",
        "#Meals",
        "Camper Days (nightsX0.4 + mealsX0.2)",
        "Usage Fee",
        "$ Lodging",
        "$ Food",
        "$ Misc.",
      ],
    });
  };

  const handleImportMaster2026Spreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master 2026 booking",
      normalizeRow: normalizeMaster2026SpreadsheetRow,
      expectedColumns: [
        "name",
        "Name",
        "Guest Group Type",
        "Returning (R) or New (N)",
        "Group Leader/Contact Person",
        "Phone",
        "Estimated Number of Guests",
        "Buildings/Rooms",
        "Meals",
        "Allergies",
        "Need to know",
        "Linen Sets",
        "Activities",
        "Contact Person Email",
        "Stage of Group",
        "Min. Number of Paying Guests",
        "Max. Number of Paying Guests",
        "Guest Rate",
        "Exp. Minimum Revenue for Lodging/Meals",
        "Invoice for Lodging/Meals (does not include linens's fees or other service fees)",
        "Notes",
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
        "Monthly Sum of Projected Income",
      ],
    });
  };

  const handleImportEverythingSpreadsheet = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileData = await file.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const allImportedRows = [];
      const sheetSummaries = [];

      workbook.worksheets.forEach((worksheet) => {
        const spreadsheetRows = getRowsFromWorksheetFlexible(worksheet);

        const sheetCounts = {
          Waitlist: 0,
          Master: 0,
          "Master 2026": 0,
          Generic: 0,
          skipped: 0,
        };

        spreadsheetRows.forEach((row, index) => {
          const detectedType = detectSpreadsheetRowType(row);
          const normalizedRow = normalizeEverythingSpreadsheetRow(row, index);

          if (!normalizedRow) {
            sheetCounts.skipped += 1;
            return;
          }

          allImportedRows.push({
            ...normalizedRow,
            sourceSheet: normalizedRow.sourceSheet || worksheet.name,
            detectedImportType: detectedType,
          });

          if (sheetCounts[detectedType] !== undefined) {
            sheetCounts[detectedType] += 1;
          } else {
            sheetCounts.Generic += 1;
          }
        });

        sheetSummaries.push(
          `${worksheet.name}: ${spreadsheetRows.length} row(s) found, ${sheetCounts.Waitlist} waitlist, ${sheetCounts.Master} master, ${sheetCounts["Master 2026"]} master 2026, ${sheetCounts.Generic} generic`
        );
      });

      if (allImportedRows.length === 0) {
        alert(
          "No importable rows were found. Make sure the workbook has header rows and at least one row of data."
        );
        return;
      }

      const nextInquiries = [...publicInquiries, ...allImportedRows];

      localStorage.setItem(
        "toahNipiPublicInquiries",
        JSON.stringify(nextInquiries)
      );

      setPublicInquiries(nextInquiries);

      alert(
        `Imported ${allImportedRows.length} row(s) from ${workbook.worksheets.length} sheet(s).\n\n${sheetSummaries.join(
          "\n"
        )}`
      );
    } catch (error) {
      console.error("Could not import full workbook:", error);
      alert("Sorry, that workbook could not be imported.");
    } finally {
      event.target.value = "";
    }
  };

  const openWaitlistImportPicker = () => {
    setIsImportMenuOpen(false);
    waitlistFileInputRef.current?.click();
  };

  const openMasterImportPicker = () => {
    setIsImportMenuOpen(false);
    masterFileInputRef.current?.click();
  };

  const openMaster2026ImportPicker = () => {
    setIsImportMenuOpen(false);
    master2026FileInputRef.current?.click();
  };

  const openEverythingImportPicker = () => {
    setIsImportMenuOpen(false);
    importEverythingFileInputRef.current?.click();
  };

  useEffect(() => {
    const handleStorageChange = () => {
      refreshInquiries();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleClickOutsideImportMenu = (event) => {
      if (!isImportMenuOpen) {
        return;
      }

      if (
        importDropdownRef.current &&
        !importDropdownRef.current.contains(event.target)
      ) {
        setIsImportMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutsideImportMenu);

    return () => {
      document.removeEventListener("mousedown", handleClickOutsideImportMenu);
    };
  }, [isImportMenuOpen]);


  useEffect(() => {
    saveDashboardFilterValue(
      DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
      datedInquiryDateFilter
    );
  }, [datedInquiryDateFilter]);

  useEffect(() => {
    saveDashboardFilterValue(
      DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
      datedInquiryCustomStartDate
    );
  }, [datedInquiryCustomStartDate]);

  useEffect(() => {
    saveDashboardFilterValue(
      DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
      datedInquiryCustomEndDate
    );
  }, [datedInquiryCustomEndDate]);


  useEffect(() => {
    try {
      localStorage.setItem(
        DATED_INQUIRY_SETTINGS_STORAGE_KEY,
        JSON.stringify(datedInquirySettings)
      );
    } catch (error) {
      console.error("Could not save dated inquiry settings:", error);
    }
  }, [datedInquirySettings]);

  const inquiryBookings = useMemo(() => {
    return publicInquiries.map((inquiry, index) =>
      normalizeInquiry(inquiry, index)
    );
  }, [publicInquiries]);

  const inquiryPipelineNeedsReviewCount = useMemo(() => {
    return inquiryBookings.filter((booking) => {
      const columnKey = getInquiryPipelineColumnKey(booking);
      const issues = getBookingQualityIssues(booking);

      return columnKey === "newInquiry" || issues.length > 0;
    }).length;
  }, [inquiryBookings]);

  const calendarCells = getCalendarCells(selectedYear, selectedMonth);

  const datedInquiries = useMemo(() => {
    return inquiryBookings
      .filter((inquiry) => inquiry.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [inquiryBookings]);

  const datedInquiryDateRange = useMemo(() => {
    return getDatedInquiryDateFilterRange({
      filterValue: datedInquiryDateFilter,
      customStartDate: datedInquiryCustomStartDate,
      customEndDate: datedInquiryCustomEndDate,
    });
  }, [
    datedInquiryDateFilter,
    datedInquiryCustomStartDate,
    datedInquiryCustomEndDate,
  ]);

  const filteredDatedInquiries = useMemo(() => {
    return datedInquiries.filter((inquiry) =>
      inquiryTouchesDateFilter(inquiry, datedInquiryDateRange)
    );
  }, [datedInquiries, datedInquiryDateRange]);

  const activeDatedInquiryFilterLabel =
    datedInquiryDateFilterOptions.find(
      (option) => option.value === datedInquiryDateFilter
    )?.label || "This Month";

  const selectedMonthInquiries = useMemo(() => {
    const monthStart = new Date(selectedYear, selectedMonth, 1);
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);

    return datedInquiries.filter((inquiry) => {
      const startDate = new Date(`${inquiry.startDate}T00:00:00`);
      const endDate = inquiry.endDate
        ? new Date(`${inquiry.endDate}T00:00:00`)
        : startDate;

      return startDate <= monthEnd && endDate >= monthStart;
    });
  }, [datedInquiries, selectedMonth, selectedYear]);

  const recentInquiries = inquiryBookings.slice(0, 5);

  const inquiriesMissingDates = inquiryBookings.filter(
    (inquiry) => !inquiry.startDate
  );

  const inquiriesWithPromoCodes = inquiryBookings.filter(
    (inquiry) => inquiry.promoCode.trim() !== ""
  );

  

  const exportInquiriesToSpreadsheet = async () => {
    if (inquiryBookings.length === 0) {
      alert("There are no inquiries to export yet.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Booking Inquiries");

    worksheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Contact Name", key: "contactName", width: 24 },
      { header: "Email Address", key: "email", width: 30 },
      { header: "Phone Number", key: "phone", width: 18 },
      { header: "Guest Group Name", key: "guestGroupName", width: 30 },
      { header: "Size", key: "size", width: 10 },
      { header: "Desired Dates", key: "desiredDates", width: 28 },
      { header: "Additional Notes", key: "additionalNotes", width: 44 },
      { header: "Waitlist or No", key: "waitlist", width: 16 },
    ];

    inquiryBookings.forEach((inquiry) => {
      worksheet.addRow({
        date: formatSubmittedDate(inquiry.submittedAt),
        contactName: inquiry.contactName,
        email: inquiry.email === "No email provided" ? "" : inquiry.email,
        phone: inquiry.phone === "No phone provided" ? "" : inquiry.phone,
        guestGroupName: inquiry.organizationName,
        size: inquiry.attendeeCount || "",
        desiredDates:
          inquiry.desiredDatesText ||
          (inquiry.startDate || inquiry.endDate
            ? formatDateRange(inquiry.startDate, inquiry.endDate)
            : ""),
        additionalNotes: inquiry.notes || "",
        waitlist: inquiry.waitlist || "No",
      });
    });

    worksheet.getRow(1).font = {
      bold: true,
    };

    worksheet.getRow(1).height = 22;

    worksheet.eachRow((row) => {
      row.alignment = {
        vertical: "top",
        wrapText: true,
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "toah-nipi-booking-inquiries.xlsx";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((current) => current - 1);
      return;
    }

    setSelectedMonth((current) => current - 1);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((current) => current + 1);
      return;
    }

    setSelectedMonth((current) => current + 1);
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
  };

const getCalendarEventColor = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();

    if (
      normalizedStatus.includes("confirmed") ||
      normalizedStatus.includes("booked")
    ) {
      return "calendar-event-green";
    }

    if (normalizedStatus.includes("contract")) {
      return "calendar-event-blue";
    }

    if (
      normalizedStatus.includes("inquiry") ||
      normalizedStatus.includes("lead")
    ) {
      return "calendar-event-gold";
    }

    if (normalizedStatus.includes("cancel")) {
      return "calendar-event-pink";
    }

    if (normalizedStatus.includes("wait")) {
      return "calendar-event-teal";
    }

    return "calendar-event-purple";
  };

  const handleActiveViewChange = (nextView) => {
    if (nextView === "Spreadsheet View" && activeView !== "Spreadsheet View") {
      setIsSpreadsheetViewLoading(true);
    }

    if (nextView !== "Spreadsheet View") {
      setIsSpreadsheetViewLoading(false);
    }

    if (nextView !== "Form") {
      setPublicInquiries(getSavedInquiries());
    }

    setActiveView(nextView);
  };

  useEffect(() => {
    if (!isSpreadsheetViewLoading || activeView !== "Spreadsheet View") {
      return;
    }

    const loadingTimer = window.setTimeout(() => {
      setIsSpreadsheetViewLoading(false);
    }, 650);

    return () => window.clearTimeout(loadingTimer);
  }, [activeView, isSpreadsheetViewLoading]);

  const openBookingDetail = (booking) => {
    setSelectedBooking(booking);
    setBookingDetailTab("Overview");
    setActiveView("Booking Detail");
  };

  return (
    <main
      className={`dashboard-shell ${
        isSidebarCollapsed ? "dashboard-shell-sidebar-collapsed" : ""
      }`}
    >
      <aside
        className={`dashboard-sidebar ${
          isSidebarCollapsed ? "dashboard-sidebar-collapsed" : ""
        }`}
      >
        <div className="dashboard-logo">
          <span>TN</span>

          <div>
            <strong>Toah Nipi</strong>
            <small>Staff Dashboard</small>
          </div>

          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
          </button>
        </div>

        <div className="sidebar-app-switcher">
          <div className="sidebar-app-toggle" aria-label="Main view toggle">
            <button
              className={`sidebar-app-toggle-button ${
                activeView !== "Form" ? "active" : ""
              }`}
              type="button"
              onClick={() => {
                setSelectedBooking(null);
                handleActiveViewChange("Dashboard");
              }}
              title="Dashboard"
            >
              <FaHome />
              <span>Dashboard</span>
            </button>

            <button
              className={`sidebar-app-toggle-button ${
                activeView === "Form" ? "active" : ""
              }`}
              type="button"
              onClick={() => {
                setSelectedBooking(null);
                handleActiveViewChange("Form");
              }}
              title="Form"
            >
              <FaClipboardList />
              <span>Form</span>
            </button>
          </div>
        </div>

        {sidebarSections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;
              const isCalendarView = item.label === "Calendar View";
              const isSpreadsheetView = item.label === "Spreadsheet View";
              const isContactsView = item.label === "Contacts View";
              const isInquiryPipeline = item.label === "Inquiry Pipeline";
              const isReportsView = item.label === "Reports";

              return (
                <button
                  className={`sidebar-link ${
                    activeView === item.label ? "sidebar-link-active" : ""
                  }`}
                  key={item.label}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    if (
                      isCalendarView ||
                      isSpreadsheetView ||
                      isContactsView ||
                      isInquiryPipeline ||
                      isReportsView
                    ) {
                      handleActiveViewChange(item.label);
                    }
                  }}
                >
                  <Icon />
                  <span>{item.label}</span>

                  {item.hasBadge && inquiryPipelineNeedsReviewCount > 0 && (
                    <strong className="sidebar-badge">
                      {item.label === "Inquiry Pipeline"
                        ? inquiryPipelineNeedsReviewCount
                        : inquiryBookings.length}
                    </strong>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <section className="dashboard-main">

        {activeView !== "Form" && (
          <DashboardTopbar
            activeView={activeView}
            waitlistFileInputRef={waitlistFileInputRef}
            masterFileInputRef={masterFileInputRef}
            master2026FileInputRef={master2026FileInputRef}
            importEverythingFileInputRef={importEverythingFileInputRef}
            importDropdownRef={importDropdownRef}
            isImportMenuOpen={isImportMenuOpen}
            setIsImportMenuOpen={setIsImportMenuOpen}
            handleImportWaitlistSpreadsheet={handleImportWaitlistSpreadsheet}
            handleImportMasterSpreadsheet={handleImportMasterSpreadsheet}
            handleImportMaster2026Spreadsheet={handleImportMaster2026Spreadsheet}
            handleImportEverythingSpreadsheet={handleImportEverythingSpreadsheet}
            openWaitlistImportPicker={openWaitlistImportPicker}
            openMasterImportPicker={openMasterImportPicker}
            openMaster2026ImportPicker={openMaster2026ImportPicker}
            openEverythingImportPicker={openEverythingImportPicker}
            exportInquiriesToSpreadsheet={exportInquiriesToSpreadsheet}
            refreshInquiries={refreshInquiries}
            deleteAllInquiries={deleteAllInquiries}
          />
        )}
        

        {activeView === "Form" ? (
          <section className="dashboard-form-view">
            <CreateBooking />
          </section>
        ) : activeView === "Booking Detail" ? (
          <BookingDetailView
            booking={selectedBooking}
            activeTab={bookingDetailTab}
            setActiveTab={setBookingDetailTab}
            onSaveBooking={saveBookingEdits}
            onBack={() => {
              setSelectedBooking(null);
              setActiveView("Dashboard");
            }}
          />
        ) : activeView === "Calendar View" ? (
          <section className="calendar-view-page">
            <article className="dashboard-card calendar-view-card">
              <div className="calendar-view-header">
                <div>
                  <p className="dashboard-eyebrow">Rentals & Events</p>
                  <h2>
                    {monthNames[selectedMonth]} {selectedYear}
                  </h2>
                  <p>
                    Full calendar view for confirmed bookings, contract sent
                    bookings, and inquiries with selected dates.
                  </p>
                </div>

                <button
                  className="secondary-dashboard-button"
                  type="button"
                  onClick={goToCurrentMonth}
                >
                  This Month
                </button>
              </div>

              <div className="calendar-controls calendar-controls-large">
                <button type="button" onClick={goToPreviousMonth}>
                  «
                </button>

                <select
                  value={selectedMonth}
                  onChange={(event) =>
                    setSelectedMonth(Number(event.target.value))
                  }
                >
                  {monthNames.map((month, index) => (
                    <option value={index} key={month}>
                      {month}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(event) =>
                    setSelectedYear(Number(event.target.value))
                  }
                >
                  {[2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                    <option value={year} key={year}>
                      {year}
                    </option>
                  ))}
                </select>

                <button type="button" onClick={goToNextMonth}>
                  »
                </button>
              </div>

              <BookingCalendar
                calendarCells={calendarCells}
                datedInquiries={datedInquiries}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                getCalendarEventColor={getCalendarEventColor}
                isLarge
              />

              <div className="calendar-legend">
                <span>
                  <i className="legend-dot legend-confirmed"></i>
                  Confirmed
                </span>

                <span>
                  <i className="legend-dot legend-contract"></i>
                  Contract Sent
                </span>

                <span>
                  <i className="legend-dot legend-inquiry"></i>
                  Inquiry
                </span>
              </div>
            </article>

            <aside className="dashboard-card calendar-view-agenda">
              <div className="dashboard-card-header">
                <div>
                  <h2>This Month</h2>
                  <p>
                    {selectedMonthInquiries.length} dated booking
                    {selectedMonthInquiries.length === 1 ? "" : "s"} shown.
                  </p>
                </div>
              </div>

              {selectedMonthInquiries.length > 0 ? (
                <div className="calendar-agenda-list">
                  {selectedMonthInquiries.map((inquiry) => (
                    <div className="calendar-agenda-card" key={inquiry.id}>
                      <div>
                        <strong>{inquiry.organizationName}</strong>
                        <span className={`calendar-agenda-status ${getCalendarEventColor(inquiry.status)}`}>
                          {inquiry.status}
                        </span>
                      </div>

                      <p>{formatDateRange(inquiry.startDate, inquiry.endDate)}</p>

                      <small>
                        {inquiry.retreatType || "No retreat type"} ·{" "}
                        {inquiry.attendeeCount || "No group size"} guests
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No dated bookings this month</strong>
                  <p>
                    Import a master spreadsheet or submit the public form with
                    dates to see items on this calendar.
                  </p>
                </div>
              )}
            </aside>
        </section>
        ) : activeView === "Spreadsheet View" ? (
          isSpreadsheetViewLoading ? (
            <SpreadsheetViewLoadingScreen rowCount={inquiryBookings.length} />
          ) : (
            <BookingSpreadsheetView
              inquiryBookings={inquiryBookings}
              openBookingDetail={openBookingDetail}
            />
          )
        ) : activeView === "Contacts View" ? (
          <ContactsView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openBookingDetail}
          />
        ) : activeView === "Inquiry Pipeline" ? (
          <InquiryPipelineView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openBookingDetail}
            onUpdateBookingStatus={(booking, nextStatus) =>
              saveBookingEdits({
                ...booking,
                status: nextStatus,
                waitlist: nextStatus === "Waitlist" ? "Yes" : booking.waitlist,
              })
            }
          />
        ) : activeView === "Reports" ? (
          <ReportsView inquiryBookings={inquiryBookings} />
        ) : (
          <>
        <section className="dashboard-stats-grid">
          <article className="dashboard-stat-card stat-card-green">
            <div className="dashboard-stat-icon">
              <FaClipboardList />
            </div>

            <div>
              <span>Total Inquiries</span>
              <strong>{inquiryBookings.length}</strong>
              <p>Submitted through the form</p>
            </div>
          </article>

          <article className="dashboard-stat-card stat-card-blue">
            <div className="dashboard-stat-icon">
              <FaRegCalendarCheck />
            </div>

            <div>
              <span>Calendar Entries</span>
              <strong>{datedInquiries.length}</strong>
              <p>Inquiries with a start date</p>
            </div>
          </article>

          <article className="dashboard-stat-card stat-card-gold">
            <div className="dashboard-stat-icon">
              <FaExclamationTriangle />
            </div>

            <div>
              <span>Missing Dates</span>
              <strong>{inquiriesMissingDates.length}</strong>
              <p>Need staff follow-up</p>
            </div>
          </article>

          <article className="dashboard-stat-card stat-card-purple">
            <div className="dashboard-stat-icon">
              <FaTicketAlt />
            </div>

            <div>
              <span>Promo Codes</span>
              <strong>{inquiriesWithPromoCodes.length}</strong>
              <p>Submissions with a promo code</p>
            </div>
          </article>
        </section>

        {/* <section className="dashboard-card tasks-card">
          <div className="dashboard-card-header collapsible-card-header">
            <div className="dashboard-heading-with-icon">
              <span className="section-icon">
                <FaClipboardList />
              </span>

              <div>
                <h2>Submitted Booking Inquiries</h2>
                <p>
                  {inquiryBookings.length} total inquiry
                  {inquiryBookings.length === 1 ? "" : "ies"} from forms and Excel imports.
                </p>
              </div>
            </div>

            <button
              className="collapse-toggle-button"
              type="button"
              onClick={() =>
                setIsSubmittedInquiriesOpen((currentValue) => !currentValue)
              }
              aria-expanded={isSubmittedInquiriesOpen}
              aria-controls="submitted-inquiries-content"
            >
              <span>{isSubmittedInquiriesOpen ? "Hide" : "Show"}</span>
              <strong>{isSubmittedInquiriesOpen ? "−" : "+"}</strong>
            </button>
          </div>

          {isSubmittedInquiriesOpen && (
            <div id="submitted-inquiries-content" className="collapsible-card-content">
              {inquiryBookings.length > 0 ? (
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Dates</th>
                        <th>Group Size</th>
                        <th>Retreat Type</th>
                        <th>Promo Code</th>
                        <th>Waitlist</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>

                    <tbody>
                      {inquiryBookings.map((inquiry) => (
                        <tr key={inquiry.id}>
                          <td>
                            <button
                              className="table-link"
                              type="button"
                              onClick={() => openBookingDetail(inquiry)}
                            >
                              {inquiry.organizationName}
                            </button>
                          </td>
                          <td>{inquiry.contactName}</td>
                          <td>{getSpreadsheetDisplayValue(inquiry.email)}</td>
                          <td>{getSpreadsheetDisplayValue(inquiry.phone)}</td>
                          <td>{getSpreadsheetDateRangeDisplay(inquiry.startDate, inquiry.endDate)}</td>
                          <td>{inquiry.attendeeCount || "—"}</td>
                          <td>{inquiry.retreatType || "—"}</td>
                          <td>{inquiry.promoCode || "—"}</td>
                          <td>{inquiry.waitlist || "No"}</td>
                          <td>{formatSubmittedDate(inquiry.submittedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No inquiries yet</strong>
                  <p>Submit the public form first, then return to this dashboard.</p>
                </div>
              )}
            </div>
          )}
        </section> */}

        <section className="dashboard-lower-grid">
          <article className="dashboard-card calendar-card">
            <div className="dashboard-card-header">
              <div className="dashboard-heading-with-icon">
                <span className="section-icon">
                  <FaCalendarAlt />
                </span>

                <div>
                  <h2>Groups At a Glance</h2>
                  <p>
                    Calendar view based only on inquiries that have selected dates.
                  </p>
                </div>
              </div>

              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={goToCurrentMonth}
              >
                This Month
              </button>
            </div>

            <div className="calendar-controls">
              <button type="button" onClick={goToPreviousMonth}>
                «
              </button>

              <select
                value={selectedMonth}
                onChange={(event) =>
                  setSelectedMonth(Number(event.target.value))
                }
              >
                {monthNames.map((month, index) => (
                  <option value={index} key={month}>
                    {month}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(event) =>
                  setSelectedYear(Number(event.target.value))
                }
              >
                {[2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button type="button" onClick={goToNextMonth}>
                »
              </button>
            </div>

            <BookingCalendar
              calendarCells={calendarCells}
              datedInquiries={datedInquiries}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              getCalendarEventColor={getCalendarEventColor}
            />

            <div className="calendar-legend">
              <span>
                <i className="legend-dot legend-confirmed"></i>
                Confirmed
              </span>

              <span>
                <i className="legend-dot legend-contract"></i>
                Contract Sent
              </span>

              <span>
                <i className="legend-dot legend-inquiry"></i>
                Inquiry
              </span>
            </div>


          </article>

          <div className="dashboard-side-stack">

            <article className="dashboard-card dated-inquiries-dashboard-card">
              <div className="dashboard-card-header dated-inquiries-dashboard-header">
                <div>
                  <div className="dated-inquiries-title-row">
                    <h2>Dated Inquiries</h2>

                    <div className="dated-inquiries-settings">
                      <button
                        className={`dated-inquiries-settings-button ${
                          isDatedInquirySettingsOpen ? "active" : ""
                        }`}
                        type="button"
                        onClick={() =>
                          setIsDatedInquirySettingsOpen((currentValue) => !currentValue)
                        }
                        aria-label="Open dated inquiry display settings"
                        title="Display settings"
                      >
                        <FaCog />
                      </button>

                      {isDatedInquirySettingsOpen && (
                        <div className="dated-inquiries-settings-menu">
                          <div className="dated-inquiries-settings-menu-header">
                            <h3>Display Settings</h3>
                            <p>Customize how dated inquiry cards appear.</p>
                          </div>

                          <label className="dated-inquiries-setting-option">
                            <input
                              type="checkbox"
                              checked={datedInquirySettings.tintByRetreatType}
                              onChange={(event) =>
                                updateDatedInquirySetting(
                                  "tintByRetreatType",
                                  event.target.checked
                                )
                              }
                            />

                            <span>
                              <strong>Color cards by retreat type</strong>
                              <small>Lightly tint each card based on its retreat type.</small>
                            </span>
                          </label>

                          <label className="dated-inquiries-setting-option">
                            <input
                              type="checkbox"
                              checked={datedInquirySettings.showRetreatTypeLegend}
                              onChange={(event) =>
                                updateDatedInquirySetting(
                                  "showRetreatTypeLegend",
                                  event.target.checked
                                )
                              }
                            />

                            <span>
                              <strong>Show color legend</strong>
                              <small>Display the meaning of each retreat type color.</small>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <p>
                    {filteredDatedInquiries.length} of {datedInquiries.length} dated booking
                    {datedInquiries.length === 1 ? "" : "s"} shown.
                  </p>

                  <span className="dated-inquiries-filter-summary">
                    Filter: {activeDatedInquiryFilterLabel}
                  </span>
                </div>

                <div className="dated-inquiries-filter-bar">
                  <label className="dated-inquiries-filter-field">
                    <span>Date Range</span>

                    <select
                      value={datedInquiryDateFilter}
                      onChange={(event) => setDatedInquiryDateFilter(event.target.value)}
                    >
                      {datedInquiryDateFilterOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {datedInquiryDateFilter === "custom" && (
                    <div className="dated-inquiries-custom-range">
                      <label className="dated-inquiries-filter-field">
                        <span>From</span>

                        <input
                          type="date"
                          value={datedInquiryCustomStartDate}
                          onChange={(event) =>
                            setDatedInquiryCustomStartDate(event.target.value)
                          }
                        />
                      </label>

                      <label className="dated-inquiries-filter-field">
                        <span>To</span>

                        <input
                          type="date"
                          value={datedInquiryCustomEndDate}
                          onChange={(event) =>
                            setDatedInquiryCustomEndDate(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {datedInquirySettings.tintByRetreatType &&
                datedInquirySettings.showRetreatTypeLegend && (
                  <div className="dated-inquiries-type-legend">
                    {RETREAT_TYPE_LEGEND_KEYS.map((key) => {
                      const typeConfig = RETREAT_TYPE_CONFIG[key];

                      return (
                        <span
                          className={`dated-inquiries-type-legend-pill ${typeConfig.className}`}
                          key={key}
                        >
                          {typeConfig.label}
                        </span>
                      );
                    })}
                  </div>
                )}

              {filteredDatedInquiries.length > 0 ? (
                <div className="dated-inquiries-dashboard-list">
                  {filteredDatedInquiries.map((inquiry) => {
                    const guestCount = String(inquiry.attendeeCount || "").trim();

                    const guestLabel = guestCount
                      ? `${guestCount} guest${guestCount === "1" ? "" : "s"}`
                      : "No group size";

                    const retreatType = getInquiryRetreatType(inquiry);
                    const retreatTypeConfig = getRetreatTypeConfig(retreatType);

                    const inquiryCardClassName = [
                      "dated-inquiry-dashboard-card",
                      datedInquirySettings.tintByRetreatType
                        ? "dated-inquiry-dashboard-card--tinted"
                        : "",
                      datedInquirySettings.tintByRetreatType
                        ? retreatTypeConfig.className
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <button
                        className={inquiryCardClassName}
                        key={inquiry.id}
                        type="button"
                        onClick={() => openBookingDetail(inquiry)}
                      >
                        <span className="dated-inquiry-dashboard-main">
                          <strong>{inquiry.organizationName || "Unnamed Organization"}</strong>

                          <span className="dated-inquiry-dashboard-date">
                            {formatDateRange(inquiry.startDate, inquiry.endDate)}
                          </span>

                          <span className="dated-inquiry-dashboard-meta">
                            {inquiry.retreatType || "No retreat type"} · {guestLabel}
                          </span>
                        </span>

                        <span
                          className={`dated-inquiry-dashboard-status ${getCalendarEventColor(
                            inquiry.status
                          )}`}
                        >
                          {inquiry.status || "Inquiry"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
              <div className="empty-state">
                <strong>
                  {datedInquiries.length > 0
                    ? "No dated inquiries match this date range"
                    : "No dated inquiries yet"}
                </strong>

                <p>
                  {datedInquiries.length > 0
                    ? "Try choosing a different date range to see more bookings."
                    : "Inquiries will appear here once the form includes a start date."}
                </p>
              </div>
            )}
            </article>
          </div>
        </section>

        <AvailabilityBoard
          datedInquiries={datedInquiries}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          goToPreviousMonth={goToPreviousMonth}
          goToNextMonth={goToNextMonth}
          getCalendarEventColor={getCalendarEventColor}
        />

          </>
        )}



      </section>
    </main>
  );
}