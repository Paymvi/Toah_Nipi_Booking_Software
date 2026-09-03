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
  FaChartBar,
  FaUserShield,
  FaTasks,
  FaCheckCircle,
  FaRegStar,
  FaStar,
  FaCopy,
  FaExternalLinkAlt,
  FaSyncAlt,
} from "react-icons/fa";

import {
  fetchBookings,
  upsertBooking,
  upsertBookings,
  deleteAllBookings,
} from "../services/bookingService";

import ExcelJS from "exceljs";
import BookingHousingTab from "../components/BookingHousingTab";
import DashboardTopbar from "../components/DashboardTopbar";
import BookingCalendar from "../components/BookingCalendar";
// import BookingActivities from "../components/BookingActivities";
import DashboardBackups from "../components/DashboardBackups";

import CreateBooking from "../pages/CreateBooking";

import StaffSignOutButton from "../components/StaffSignOutButton";

import { supabase } from "../lib/supabaseClient";

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

  RETREAT_TYPE_CONFIG,
  RETREAT_TYPE_LEGEND_KEYS,
  getInquiryRetreatType,
  getRetreatTypeConfig,

  
} from "../constants/dashboardConstants";

import {
  SPREADSHEET_ESSENTIAL_COLUMN_LABELS,
  SPREADSHEET_2026_STANDARD_LABELS,
  SPREADSHEET_SHARED_STANDARD_LABELS,
  SPREADSHEET_2025_RAW_COLUMNS,
  SPREADSHEET_2026_RAW_COLUMNS,
  SPREADSHEET_SHARED_RAW_COLUMNS,
} from "../constants/dashboardConstants";

import {
  formatDate,
  formatSubmittedDate,
  formatDateRange,
  getDaysInMonth,
  getLocalDate,
  formatExcelDateValue,
  parseDesiredDateRange,
} from "../utils/dateUtils";


import {
  readSpreadsheetCell,
  cleanExcelCellValue,
  rowHasAnyData,
  getRowsFromWorksheetFlexible,
  getRawRowNotes,
} from "../utils/spreadsheetUtils";

import BookingChecklists, {
  getBookingChecklists,
  sortChecklistItems,
} from "../components/BookingChecklists";


import CalendarView from "../pages/CalendarView";
import SpreadsheetView, { SpreadsheetViewLoadingScreen } from "../pages/SpreadsheetView";
import InquirySpreadsheetView from "../pages/InquirySpreadsheetView";
import ContactsView from "../pages/ContactsView";
import InquiryPipelineView, {
  getInquiryPipelineColumnKey,
} from "../pages/InquiryPipeline";
import ReportsView from "../pages/ReportsView";

const SPREADSHEET_VIEW_NAME = "Spreadsheet View";
const INQUIRY_SPREADSHEET_VIEW_NAME = "Inquiry Spreadsheet";

const SPREADSHEET_REVEAL_LOADING_MS = 160;


import InquiryRecordDetailView from "../pages/InquiryRecordDetailView";



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

const STAFF_USERS_STORAGE_KEY = "toahNipiStaffUsers";
const CURRENT_STAFF_USER_STORAGE_KEY = "toahNipiCurrentStaffUserId";


const DEFAULT_STAFF_USERS = [
  {
    id: "staff-admin",
    name: "Admin",
    email: "admin@toahnipi.org",
    role: "Admin",
    active: true,
  },
  {
    id: "staff-office",
    name: "Office Staff",
    email: "office@toahnipi.org",
    role: "Staff",
    active: true,
  },
  {
    id: "staff-program",
    name: "Program Staff",
    email: "program@toahnipi.org",
    role: "Staff",
    active: true,
  },
];

function normalizeStaffName(value) {
  return String(value || "").trim().toLowerCase();
}

function createStaffUserId() {
  return `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStaffEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseStaffContactName(value) {
  const lines = String(value || "")
    .split(/\r?\n/g)
    .map((line) =>
      line
        .replace(/^"+|"+$/g, "")
        .replace(/^'+|'+$/g, "")
        .trim()
    )
    .filter((line) => line && line !== "-");

  const commaNameLine =
    lines.find((line) => line.includes(",")) || lines[lines.length - 1] || "";

  if (!commaNameLine) {
    return "";
  }

  if (commaNameLine.includes(",")) {
    const [lastName, firstName] = commaNameLine
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    return [firstName, lastName].filter(Boolean).join(" ");
  }

  return commaNameLine;
}

function normalizeStaffContactSpreadsheetRow({ nameCell, emailCell, index }) {
  const name = parseStaffContactName(nameCell);
  const email = String(emailCell || "").trim();

  if (!name && !email) {
    return null;
  }

  return {
    id: createStaffUserId(),
    name: name || email,
    email,
    role: "Staff",
    active: true,
    importedFrom: "Staff_Contacts",
    importedAt: new Date().toISOString(),
    importIndex: index,
  };
}

function getSavedStaffUsers() {
  try {
    const savedUsers = localStorage.getItem(STAFF_USERS_STORAGE_KEY);

    if (!savedUsers) {
      return DEFAULT_STAFF_USERS;
    }

    const parsedUsers = JSON.parse(savedUsers);

    return Array.isArray(parsedUsers) && parsedUsers.length > 0
      ? parsedUsers
      : DEFAULT_STAFF_USERS;
  } catch (error) {
    console.error("Could not read staff users:", error);
    return DEFAULT_STAFF_USERS;
  }
}

function saveStaffUsers(users) {
  try {
    localStorage.setItem(STAFF_USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Could not save staff users:", error);
  }
}

function getSavedCurrentStaffUserId(staffUsers) {
  try {
    const savedUserId = localStorage.getItem(CURRENT_STAFF_USER_STORAGE_KEY);

    if (savedUserId && staffUsers.some((user) => user.id === savedUserId)) {
      return savedUserId;
    }

    return staffUsers[0]?.id || "";
  } catch (error) {
    console.error("Could not read current staff user:", error);
    return staffUsers[0]?.id || "";
  }
}

function saveCurrentStaffUserId(userId) {
  try {
    localStorage.setItem(CURRENT_STAFF_USER_STORAGE_KEY, userId);
  } catch (error) {
    console.error("Could not save current staff user:", error);
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
    rentalFormDetails: inquiry.rentalFormDetails || null,

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

    inquiryAddress: inquiry.inquiryAddress || "",
    inquiryDisposition: inquiry.inquiryDisposition || inquiry.stageOfGroup || "",

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

    programLogisticsAssignments: Array.isArray(inquiry.programLogisticsAssignments)
      ? inquiry.programLogisticsAssignments
      : [],

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
    schedule: inquiry.schedule || "",
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

    archiveAddress: inquiry.archiveAddress || "",
    archiveCity: inquiry.archiveCity || "",
    archiveState: inquiry.archiveState || "",
    archiveZip: inquiry.archiveZip || "",
    archiveGuestGroup: inquiry.archiveGuestGroup || "",
    archiveVisitDate: inquiry.archiveVisitDate || "",
    archiveAllPriorVisitDates: inquiry.archiveAllPriorVisitDates || "",
    archiveVisitCount: inquiry.archiveVisitCount || "",
    archiveSourcePdfLink: inquiry.archiveSourcePdfLink || "",
    archivePriorVisitLinks: Array.isArray(inquiry.archivePriorVisitLinks)
      ? inquiry.archivePriorVisitLinks
      : [],
    archiveConfidence: inquiry.archiveConfidence || null,
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
  const actualAdults = readSpreadsheetCell(row, [
    "Actual # of Adults",
  ]);

  const actualMinors3To17 = readSpreadsheetCell(row, [
    "Actual # of Minors 3 to 17",
  ]);

  const actualMinorsUnder3 = readSpreadsheetCell(row, [
    "Actual # of Minors under 3",
  ]);

  const actualDayUseGuests = readSpreadsheetCell(row, [
    "Actual # of Day Use Guests",
  ]);

  const actualNumberOfGuests = readSpreadsheetCell(row, [
    "Total # of Guests",
    "Actual Number of Guests",
    "Actual # of Guests",
    "# of Guests",
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
    actualAdults ? `Adults: ${actualAdults}` : "",
    actualMinors3To17
      ? `Minors age 3-17: ${actualMinors3To17}`
      : "",
    actualMinorsUnder3
      ? `Minors under 3: ${actualMinorsUnder3}`
      : "",
    actualDayUseGuests
      ? `Day-use guests: ${actualDayUseGuests}`
      : "",

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
    sourceType: "Master 2025",
    detectedImportType: "Master 2025",
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
    "Group Leader #",
  ]);

  const estimatedGuests = readSpreadsheetCell(row, [
    "Estimated Number of Guests",
    "Actual Number of Guests",
    "# of Guests",
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

  const activities = readSpreadsheetCell(row, [
    "Activities",
    "Schedule/Activities",
  ]);

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

  const guestRate = readSpreadsheetCell(row, [
    "Guest Rate",
    "Adult Guest Rate",
  ]);

  const expectedMinimumRevenue = readSpreadsheetCell(row, [
    "Exp. Minimum Revenue",
    "Exp. Minimum Revenue for Lodging/Meals",
    "Expected Minimum Revenue",
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


function normalizeMaster2027SpreadsheetRow(row, index) {
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

  const confirmedStatus = readSpreadsheetCell(row, [
    "Confirmed or Unconfirmed",
    "Confirmed/Unconfirmed",
  ]);

  const guestGroupName = readSpreadsheetCell(row, [
    "Guest Group Name",
    "Group Name",
    "Organization",
  ]);

  const guestGroupType = readSpreadsheetCell(row, [
    "Guest Group Type",
    "Retreat Type",
    "Type",
  ]);

  const returningStatus = readSpreadsheetCell(row, [
    "Returning (R) or New (N)",
    "Returning or New",
  ]);

  const contactPerson = readSpreadsheetCell(row, [
    "Contact Person",
    "Group Leader/Contact Person",
    "Group Leader",
  ]);

  const contactPhone = readSpreadsheetCell(row, [
    "Contact Person Cell #",
    "Phone",
    "Phone Number",
  ]);

  const contactPersonEmail = readSpreadsheetCell(row, [
    "Contact Person Email",
    "Email",
    "Email Address",
  ]);

  const estimatedGuests = readSpreadsheetCell(row, [
    "Estimated # of Guests",
    "Estimated Number of Guests",
    "Actual Number of Guests",
    "# of Guests",
    "Size",
    "Group Size",
  ]);

  const buildingsRooms = readSpreadsheetCell(row, [
    "Buildings/Rooms",
    "Buildings",
    "Rooms",
  ]);

  const meals = readSpreadsheetCell(row, ["Meals"]);

  const stageOfGroup = readSpreadsheetCell(row, [
    "Stage of Group",
  ]);

  const depositReceived = readSpreadsheetCell(row, [
    "$250 Deposit for 2027 Rec'd?",
    "$250 Deposit for 2027 Received?",
    "Deposit Received",
  ]);

  const foodAllergies = readSpreadsheetCell(row, [
    "Food Allergies",
    "Allergies",
  ]);

  const needToKnow = readSpreadsheetCell(row, [
    "Need to know",
    "Need To Know",
  ]);

  const linenSets = readSpreadsheetCell(row, ["Linen Sets"]);

  const activities = readSpreadsheetCell(row, [
    "Activities",
  ]);

  const minPayingGuests = readSpreadsheetCell(row, [
    "Min. Number of Paying Guests",
    "Minimum Number of Paying Guests",
  ]);

  const maxPayingGuests = readSpreadsheetCell(row, [
    "Max. Number of Paying Guests",
    "Maximum Number of Paying Guests",
  ]);

  const guestRate = readSpreadsheetCell(row, [
    "Guest Rate",
  ]);

  const expectedMinimumRevenue = readSpreadsheetCell(row, [
    "Exp. Minimum Revenue",
    "Exp. Minimum Revenue for Lodging/Meals",
    "Expected Minimum Revenue",
    "Expected Minimum Revenue for Lodging/Meals",
  ]);

  const schedule = readSpreadsheetCell(row, [
    "Schedule",
  ]);

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

  const persons = readSpreadsheetCell(row, [
    "#Persons",
    "Persons",
  ]);

  /*
    Your sheet has BOTH:
      "# of Nights"
      "#Nights"

    Prefer #Nights when it contains a value because that is grouped
    with the calculated financial columns, then fall back to # of Nights.
  */
  const nights = readSpreadsheetCell(row, [
    "#Nights",
    "# of Nights",
    "Nights",
  ]);

  const mealCount = readSpreadsheetCell(row, [
    "#Meals",
    "Meals Count",
  ]);

  const camperDays = readSpreadsheetCell(row, [
    "Camper Days (nightsX0.4 + mealsX0.2)",
    "Camper Days",
  ]);

  const usageFee = readSpreadsheetCell(row, [
    "Usage Fee",
  ]);

  const lodgingCost = readSpreadsheetCell(row, [
    "$ Lodging",
    "Lodging",
  ]);

  const foodCost = readSpreadsheetCell(row, [
    "$ Food",
    "Food",
  ]);

  const miscCost = readSpreadsheetCell(row, [
    "$ Misc",
    "$ Misc.",
    "Misc",
  ]);

  const rowHasData =
    arrivalDate ||
    departureDate ||
    guestGroupName ||
    guestGroupType ||
    contactPerson ||
    contactPhone ||
    contactPersonEmail ||
    estimatedGuests ||
    buildingsRooms ||
    confirmedStatus ||
    stageOfGroup;

  if (!rowHasData) {
    return null;
  }

  const startDate = formatExcelDateValue(arrivalDate);
  const endDate = formatExcelDateValue(departureDate);

  const confirmedText = String(confirmedStatus || "")
    .trim()
    .toLowerCase();

  let status = "Confirmed";

  if (confirmedText.includes("unconfirmed")) {
    status = "Inquiry";
  } else if (confirmedText.includes("confirmed")) {
    status = "Confirmed";
  } else if (stageOfGroup) {
    status = getStatusFromStage(stageOfGroup);
  }

  const notes = [
    stageOfGroup ? `Stage of Group: ${stageOfGroup}` : "",
    schedule ? `Schedule: ${schedule}` : "",
    needToKnow ? `Need to know: ${needToKnow}` : "",
    foodAllergies ? `Food allergies: ${foodAllergies}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `master-2027-import-${Date.now()}-${
      row.sourceSheet || "sheet"
    }-${index}`,

    sourceType: "Master 2027",
    detectedImportType: "Master 2027",

    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,

    submittedAt: new Date().toISOString(),

    organizationName:
      String(guestGroupName || "").trim() || "Unnamed Group",

    name: String(contactPerson || "").trim(),

    contactName:
      String(contactPerson || "").trim() || "No contact name",

    email: String(contactPersonEmail || "").trim(),
    phone: String(contactPhone || "").trim(),

    startDate,
    endDate,

    desiredDatesText:
      startDate && endDate
        ? `${startDate} - ${endDate}`
        : startDate || "",

    attendeeCount: String(estimatedGuests || "").trim(),
    groupSize: String(estimatedGuests || "").trim(),

    retreatType: String(guestGroupType || "").trim(),

    roomName:
      String(buildingsRooms || "Unassigned").trim(),

    buildingsRooms:
      String(buildingsRooms || "").trim(),

    meals: String(meals || "").trim(),
    foodAllergies: String(foodAllergies || "").trim(),
    needToKnow: String(needToKnow || "").trim(),
    linenSets: String(linenSets || "").trim(),
    activities: String(activities || "").trim(),

    schedule: String(schedule || "").trim(),

    notes,
    message: notes,

    status,
    waitlist: "No",
    promoCode: "",

    returningStatus:
      String(returningStatus || "").trim(),

    stageOfGroup:
      String(stageOfGroup || "").trim(),

    minPayingGuests:
      String(minPayingGuests || "").trim(),

    maxPayingGuests:
      String(maxPayingGuests || "").trim(),

    guestRate:
      String(guestRate || "").trim(),

    expectedMinimumRevenue:
      String(expectedMinimumRevenue || "").trim(),

    /*
      This Master 2027 sheet specifically says the deposit is $250.
      depositReceived stores yes/no or whatever the spreadsheet contains.
    */
    deposit: "$250",

    depositReceived:
      String(depositReceived || "").trim(),

    dateOfCancellation:
      formatExcelDateValue(dateOfCancellation),

    reasonForCancellation:
      String(reasonForCancellation || "").trim(),

    vacancyFilled:
      String(vacancyFilled || "").trim(),

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


const ARCHIVE_PRIOR_VISIT_LINK_COLUMNS = Array.from(
  { length: 11 },
  (_, index) => `Prior_Visit_${index + 1}_Link`
);

const ARCHIVE_EXPECTED_COLUMNS = [
  "Organization",
  "Organization_Confident",
  "First Name",
  "First_Name_Confident",
  "Last Name",
  "Last_Name_Confident",
  "Address",
  "Address_Confident",
  "City",
  "City_Confident",
  "State",
  "State_Confident",
  "Zip",
  "Zip_Confident",
  "Email",
  "Email_Confident",
  "Phone Number",
  "Phone_Number_Confident",
  "Visit Date",
  "Visit_Date_Confident",
  "Guest Group",
  "Guest_Group_Confident",
  "All Prior Visit Dates",
  "All_Prior_Visit_Dates_Confident",
  "Notes",
  "Notes_Confident",
  "Visit Count",
  "Visit_Count_Confident",
  "Source_PDF_Link",
  ...ARCHIVE_PRIOR_VISIT_LINK_COLUMNS,
];

function normalizeArchiveSpreadsheetRow(row, index) {
  const organization = readSpreadsheetCell(row, ["Organization"]);
  const firstName = readSpreadsheetCell(row, ["First Name"]);
  const lastName = readSpreadsheetCell(row, ["Last Name"]);
  const address = readSpreadsheetCell(row, ["Address"]);
  const city = readSpreadsheetCell(row, ["City"]);
  const state = readSpreadsheetCell(row, ["State"]);
  const zip = readSpreadsheetCell(row, ["Zip"]);
  const email = readSpreadsheetCell(row, ["Email"]);
  const phone = readSpreadsheetCell(row, ["Phone Number", "Phone"]);
  const visitDate = readSpreadsheetCell(row, ["Visit Date"]);
  const guestGroup = readSpreadsheetCell(row, ["Guest Group"]);
  const allPriorVisitDates = readSpreadsheetCell(row, [
    "All Prior Visit Dates",
  ]);
  const notes = readSpreadsheetCell(row, ["Notes"]);
  const visitCount = readSpreadsheetCell(row, ["Visit Count"]);
  const sourcePdfLink = readSpreadsheetCell(row, ["Source_PDF_Link"]);

  const priorVisitLinks = ARCHIVE_PRIOR_VISIT_LINK_COLUMNS.map((columnName) =>
    readSpreadsheetCell(row, [columnName])
  )
    .map((link) => String(link || "").trim())
    .filter(Boolean);

  const rowHasData =
    organization ||
    firstName ||
    lastName ||
    address ||
    city ||
    state ||
    zip ||
    email ||
    phone ||
    visitDate ||
    guestGroup ||
    allPriorVisitDates ||
    notes ||
    visitCount ||
    sourcePdfLink ||
    priorVisitLinks.length > 0;

  if (!rowHasData) {
    return null;
  }

  const formattedVisitDate = formatExcelDateValue(visitDate);
  const contactName = [firstName, lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  const archiveNotes = [
    notes ? String(notes).trim() : "",
    allPriorVisitDates
      ? `All prior visit dates: ${allPriorVisitDates}`
      : "",
    visitCount ? `Visit count: ${visitCount}` : "",
    sourcePdfLink ? `Source PDF: ${sourcePdfLink}` : "",
    priorVisitLinks.length > 0
      ? `Prior visit links:\n${priorVisitLinks.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: `archive-import-${Date.now()}-${row.sourceSheet || "sheet"}-${index}`,
    sourceType: "Archive",
    detectedImportType: "Archive",
    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,
    submittedAt: new Date().toISOString(),

    organizationName:
      String(organization || guestGroup || "").trim() ||
      "Unnamed Archive Record",

    name: contactName,
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    contactName: contactName || "No contact name",

    email: String(email || "").trim(),
    phone: String(phone || "").trim(),

    startDate: formattedVisitDate,
    endDate: formattedVisitDate,
    desiredDatesText:
      formattedVisitDate || String(visitDate || "").trim() || "",

    attendeeCount: "",
    groupSize: "",
    retreatType: "Archive",

    roomName: "Unassigned",
    buildingsRooms: "",

    notes: archiveNotes,
    message: archiveNotes,

    waitlist: "No",
    status: "Archived Visit",
    promoCode: "",

    archiveAddress: String(address || "").trim(),
    archiveCity: String(city || "").trim(),
    archiveState: String(state || "").trim(),
    archiveZip: String(zip || "").trim(),
    archiveGuestGroup: String(guestGroup || "").trim(),
    archiveVisitDate: formattedVisitDate,
    archiveAllPriorVisitDates: String(allPriorVisitDates || "").trim(),
    archiveVisitCount: String(visitCount || "").trim(),
    archiveSourcePdfLink: String(sourcePdfLink || "").trim(),
    archivePriorVisitLinks: priorVisitLinks,

    archiveConfidence: {
      organization: String(
        readSpreadsheetCell(row, ["Organization_Confident"]) || ""
      ).trim(),
      firstName: String(
        readSpreadsheetCell(row, ["First_Name_Confident"]) || ""
      ).trim(),
      lastName: String(
        readSpreadsheetCell(row, ["Last_Name_Confident"]) || ""
      ).trim(),
      address: String(
        readSpreadsheetCell(row, ["Address_Confident"]) || ""
      ).trim(),
      city: String(readSpreadsheetCell(row, ["City_Confident"]) || "").trim(),
      state: String(
        readSpreadsheetCell(row, ["State_Confident"]) || ""
      ).trim(),
      zip: String(readSpreadsheetCell(row, ["Zip_Confident"]) || "").trim(),
      email: String(
        readSpreadsheetCell(row, ["Email_Confident"]) || ""
      ).trim(),
      phone: String(
        readSpreadsheetCell(row, ["Phone_Number_Confident"]) || ""
      ).trim(),
      visitDate: String(
        readSpreadsheetCell(row, ["Visit_Date_Confident"]) || ""
      ).trim(),
      guestGroup: String(
        readSpreadsheetCell(row, ["Guest_Group_Confident"]) || ""
      ).trim(),
      allPriorVisitDates: String(
        readSpreadsheetCell(row, ["All_Prior_Visit_Dates_Confident"]) || ""
      ).trim(),
      notes: String(
        readSpreadsheetCell(row, ["Notes_Confident"]) || ""
      ).trim(),
      visitCount: String(
        readSpreadsheetCell(row, ["Visit_Count_Confident"]) || ""
      ).trim(),
    },
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

function normalizeSpreadsheetHeaderName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function spreadsheetRowHasHeader(row, possibleHeaders) {
  const rowHeaders = new Set(
    Object.keys(row || {}).map(normalizeSpreadsheetHeaderName)
  );

  return possibleHeaders.some((header) =>
    rowHeaders.has(normalizeSpreadsheetHeaderName(header))
  );
}

function detectMasterSpreadsheetType(worksheetName, spreadsheetRows = []) {
  const normalizedSheetName = String(worksheetName || "")
    .trim()
    .toLowerCase();

  /*
    FIRST: explicitly reject sheets that we know are NOT Master sheets.

    This is especially important because inquiry sheets may share
    several columns with Master sheets.
  */
  if (
    normalizedSheetName.includes("inquir") ||
    normalizedSheetName.includes("waitlist") ||
    normalizedSheetName.includes("no's") ||
    normalizedSheetName.includes("nos") ||
    normalizedSheetName.includes("counts") ||
    normalizedSheetName.includes("risk management") ||
    normalizedSheetName.includes("staff_contacts")
  ) {
    return "";
  }

  /*
    BEST CASE:
    Detect by the actual worksheet name.
  */
  if (
    normalizedSheetName.includes("master") &&
    normalizedSheetName.includes("2027")
  ) {
    return "Master 2027";
  }

  if (
    normalizedSheetName.includes("master") &&
    normalizedSheetName.includes("2026")
  ) {
    return "Master 2026";
  }

  if (
    normalizedSheetName.includes("master") &&
    normalizedSheetName.includes("2025")
  ) {
    return "Master 2025";
  }

  /*
    FALLBACK:
    Only use headers if the sheet was renamed.

    Require MULTIPLE distinctive columns instead of matching
    just one shared column.
  */
  const sampleRow =
    spreadsheetRows.find((row) => rowHasAnyData(row)) || {};

  const hasHeader = (header) =>
    spreadsheetRowHasHeader(sampleRow, [header]);

  /*
    Master 2027
  */
  const looksLikeMaster2027 =
    hasHeader("Confirmed or Unconfirmed") &&
    (
      hasHeader("$250 Deposit for 2027 Rec'd?") ||
      hasHeader("$250 Deposit for 2027 Received?")
    ) &&
    hasHeader("Estimated # of Guests");

  if (looksLikeMaster2027) {
    return "Master 2027";
  }

  /*
    Master 2026
  */
  const looksLikeMaster2026 =
    hasHeader("Adult Guest Rate") &&
    hasHeader("Group Leader #") &&
    (
      hasHeader("Schedule/Activities") ||
      hasHeader("Monthly Sum of Projected Income")
    );

  if (looksLikeMaster2026) {
    return "Master 2026";
  }

  /*
    Master 2025
  */
  const looksLikeMaster2025 =
    hasHeader("Total # of Guests") &&
    hasHeader("Actual # of Adults") &&
    (
      hasHeader("Actual # of Minors 3 to 17") ||
      hasHeader("Actual # of Day Use Guests")
    );

  if (looksLikeMaster2025) {
    return "Master 2025";
  }

  return "";
}

function normalizeEverythingSpreadsheetRow(row, index, detectedType) {
  if (detectedType === "Master 2025") {
    return normalizeMasterSpreadsheetRow(row, index);
  }

  if (detectedType === "Master 2026") {
    return normalizeMaster2026SpreadsheetRow(row, index);
  }

  if (detectedType === "Master 2027") {
    return normalizeMaster2027SpreadsheetRow(row, index);
  }

  if (
    detectedType === "Guest Group Inquiry 2025" ||
    detectedType === "Guest Group Inquiry 2026" ||
    detectedType === "Guest Group Inquiry 2027"
  ) {
    return normalizeGuestGroupInquirySpreadsheetRow(
      row,
      index,
      detectedType
    );
  }

  return null;
}


/* =========================================================
   GUEST GROUP INQUIRY / NO'S IMPORT
   Handles the 2025, 2026, and 2027 inquiry sheets.
========================================================= */

function cleanGuestGroupInquiryText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function detectGuestGroupInquirySpreadsheetType(worksheetName) {
  const normalizedSheetName = String(worksheetName || "")
    .trim()
    .toLowerCase();

  /*
    These sheets currently have names such as:

    2025 Guest Group Inquiries and 'No's
    2026 Guest Group Inquiries and 'No's
    2027 Guest Group Inquiries and No's
  */
  const isGuestGroupInquirySheet =
    normalizedSheetName.includes("guest group") &&
    normalizedSheetName.includes("inquir");

  if (!isGuestGroupInquirySheet) {
    return "";
  }

  if (normalizedSheetName.includes("2025")) {
    return "Guest Group Inquiry 2025";
  }

  if (normalizedSheetName.includes("2026")) {
    return "Guest Group Inquiry 2026";
  }

  if (normalizedSheetName.includes("2027")) {
    return "Guest Group Inquiry 2027";
  }

  return "";
}

function getGuestGroupInquiryStatus(disposition) {
  const text = cleanGuestGroupInquiryText(disposition).toLowerCase();

  if (text.includes("waitlist")) {
    return "Waitlist";
  }

  /*
    These are essentially closed / unsuccessful inquiries.
  */
  if (
    text === "no" ||
    text.startsWith("no ") ||
    text.includes("did not hear") ||
    text.includes("didn't hear") ||
    text.includes("never heard")
  ) {
    return "Cancelled";
  }

  /*
    "Considering" is still an active inquiry.
  */
  return "Inquiry";
}

function normalizeGuestGroupInquirySpreadsheetRow(
  row,
  index,
  detectedType
) {
  const inquiryDate = readSpreadsheetCell(row, ["Date"]);

  const contactName = readSpreadsheetCell(row, [
    "Contact Name",
  ]);

  const email = readSpreadsheetCell(row, [
    "Email Address",
    "Email",
  ]);

  const phone = readSpreadsheetCell(row, [
    "Phone Number",
    "Phone",
  ]);

  const guestGroupName = readSpreadsheetCell(row, [
    "Guest Group Name",
  ]);

  /*
    2027 calls this "Mailing address".
    2026 calls it "Address".
    2025 does not have the column.
  */
  const inquiryAddress = readSpreadsheetCell(row, [
    "Mailing address",
    "Mailing Address",
    "Address",
  ]);

  const size = readSpreadsheetCell(row, [
    "Size",
  ]);

  const desiredDates = readSpreadsheetCell(row, [
    "Desired Dates",
  ]);

  const additionalNotes = readSpreadsheetCell(row, [
    "Additional Notes",
  ]);

  /*
    2026 / 2027:
      Waitlist, Considering or No

    2025:
      Waitlist or No
  */
  const disposition = readSpreadsheetCell(row, [
    "Waitlist, Considering or No",
    "Waitlist or No",
  ]);

  const rowHasData =
    inquiryDate ||
    contactName ||
    email ||
    phone ||
    guestGroupName ||
    inquiryAddress ||
    size ||
    desiredDates ||
    additionalNotes ||
    disposition;

  if (!rowHasData) {
    return null;
  }

  const cleanContactName = cleanGuestGroupInquiryText(contactName);
  const cleanGroupName = cleanGuestGroupInquiryText(guestGroupName);
  const cleanAddress = cleanGuestGroupInquiryText(inquiryAddress);
  const cleanSize = cleanGuestGroupInquiryText(size);
  const cleanDesiredDates = cleanGuestGroupInquiryText(desiredDates);
  const cleanNotes = cleanGuestGroupInquiryText(additionalNotes);
  const cleanDisposition = cleanGuestGroupInquiryText(disposition);

  const formattedInquiryDate = formatExcelDateValue(inquiryDate);

  const status = getGuestGroupInquiryStatus(cleanDisposition);

  return {
    id: `guest-group-inquiry-import-${Date.now()}-${
      row.sourceSheet || "sheet"
    }-${index}`,

    sourceType: detectedType,
    detectedImportType: detectedType,

    sourceSheet: row.sourceSheet || "",
    sourceRowNumber: row.sourceRowNumber || "",
    rawSpreadsheetData: row,

    /*
      "Date" on these sheets means when the inquiry/contact happened,
      NOT when the retreat occurs.
    */
    submittedAt: formattedInquiryDate
      ? `${formattedInquiryDate}T12:00:00.000Z`
      : "",

    organizationName: cleanGroupName || "Unnamed Inquiry",

    name: cleanContactName,
    contactName: cleanContactName || "No contact name",

    email: cleanGuestGroupInquiryText(email),
    phone: cleanGuestGroupInquiryText(phone),

    /*
      IMPORTANT:

      Do not convert tentative Desired Dates into real booking dates.

      Some rows contain several possible date ranges and some represent
      groups that were denied or waitlisted.
    */
    startDate: "",
    endDate: "",
    desiredDatesText: cleanDesiredDates,

    attendeeCount: cleanSize,
    groupSize: cleanSize,

    retreatType: "",

    roomName: "Unassigned",
    buildingsRooms: "",

    notes: cleanNotes,
    message: cleanNotes,

    /*
      Preserve inquiry-only fields separately.
    */
    inquiryAddress: cleanAddress,
    inquiryDisposition: cleanDisposition,

    /*
      Also use the normal workflow fields where they make sense.
    */
    waitlist:
      status === "Waitlist"
        ? "Yes"
        : "No",

    status,

    /*
      This gives us another semantic home for the original
      Waitlist / Considering / No value.
    */
    stageOfGroup: cleanDisposition,

    promoCode: "",
  };
}


function createWorkbookBulkImportId({
  detectedType,
  sourceSheet,
  sourceRowNumber,
}) {
  const safeType = String(detectedType || "record")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safeSheet = String(sourceSheet || "sheet")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safeRow = String(sourceRowNumber || "row")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return `bulk-${safeType}-${safeSheet}-${safeRow}`;
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


function createProgramLogisticsAssignment() {
  return {
    id: `program-assignment-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    role: "General",
    assignedTo: "",
    notes: "",
  };
}

function getProgramLogisticsAssignments(booking) {
  return Array.isArray(booking.programLogisticsAssignments)
    ? booking.programLogisticsAssignments
    : [];
}

function getAllBookingJobs(inquiryBookings) {
  return inquiryBookings.flatMap((booking) => {
    const checklistJobs = getBookingChecklists(booking).flatMap((checklist) =>
      sortChecklistItems(checklist.items || []).map((item) => ({
        id: `checklist-${booking.id}-${checklist.id}-${item.id}`,
        sourceType: "Checklist",
        title: item.title || "Untitled checklist item",
        role: checklist.name || "Checklist",
        assignedTo: item.assignedTo || "",
        notes: "",
        dueDate: item.dueDate || "",
        completed: Boolean(item.completed),
        completedAt: item.completedAt || "",
        completedBy: item.completedBy || "",

        bookingId: booking.id,
        bookingName: booking.organizationName,
        bookingStartDate: booking.startDate,
        bookingEndDate: booking.endDate,
        bookingStatus: booking.status,
      }))
    );

    const programLogisticsJobs = getProgramLogisticsAssignments(booking).map(
      (assignment) => ({
        id: `program-${booking.id}-${assignment.id}`,
        sourceType: "Program Logistics",
        title: `${assignment.role || "General"} assignment`,
        role: assignment.role || "General",
        assignedTo: assignment.assignedTo || "",
        notes: assignment.notes || "",
        dueDate: booking.startDate || "",
        completed: false,
        completedAt: "",
        completedBy: "",

        bookingId: booking.id,
        bookingName: booking.organizationName,
        bookingStartDate: booking.startDate,
        bookingEndDate: booking.endDate,
        bookingStatus: booking.status,
      })
    );

    return [...checklistJobs, ...programLogisticsJobs];
  });
}

function getAssignedStaffNamesFromBookings(inquiryBookings) {
  const assignedNames = new Set();

  getAllBookingJobs(inquiryBookings).forEach((job) => {
    const assignedTo = String(job.assignedTo || "").trim();

    if (assignedTo) {
      assignedNames.add(assignedTo);
    }
  });

  return Array.from(assignedNames).sort((a, b) => a.localeCompare(b));
}

function getTaskStatusClass(task) {
  if (task.completed) {
    return "completed";
  }

  if (!task.dueDate) {
    return "open";
  }

  const today = getLocalDate(formatDateForInput(new Date()));
  const dueDate = getLocalDate(task.dueDate);

  if (dueDate && dueDate < today) {
    return "overdue";
  }

  return "open";
}

function getTaskStatusLabel(task) {
  if (task.completed) {
    return "Complete";
  }

  if (getTaskStatusClass(task) === "overdue") {
    return "Overdue";
  }

  return "Open";
}

function sortJobsByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) {
      return 0;
    }

    if (!a.dueDate) {
      return 1;
    }

    if (!b.dueDate) {
      return -1;
    }

    return a.dueDate.localeCompare(b.dueDate);
  });
}

function BookingProgramLogisticsTab({ booking, onSaveBooking, staffUsers = [] }) {
  const [formData, setFormData] = useState(() => ({
    meals: booking.meals || "",
    activities: booking.activities || "",
    assignments: getProgramLogisticsAssignments(booking),
  }));

  useEffect(() => {
    setFormData({
      meals: booking.meals || "",
      activities: booking.activities || "",
      assignments: getProgramLogisticsAssignments(booking),
    });
  }, [booking.id]);

  const updateField = (fieldName, value) => {
    setFormData((currentData) => ({
      ...currentData,
      [fieldName]: value,
    }));
  };

  const addAssignment = () => {
    setFormData((currentData) => ({
      ...currentData,
      assignments: [
        ...currentData.assignments,
        createProgramLogisticsAssignment(),
      ],
    }));
  };

  const updateAssignment = (assignmentId, fieldName, value) => {
    setFormData((currentData) => ({
      ...currentData,
      assignments: currentData.assignments.map((assignment) =>
        assignment.id === assignmentId
          ? {
              ...assignment,
              [fieldName]: value,
            }
          : assignment
      ),
    }));
  };

  const removeAssignment = (assignmentId) => {
    setFormData((currentData) => ({
      ...currentData,
      assignments: currentData.assignments.filter(
        (assignment) => assignment.id !== assignmentId
      ),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const cleanedAssignments = formData.assignments
      .map((assignment) => ({
        ...assignment,
        role: assignment.role || "General",
        assignedTo: String(assignment.assignedTo || "").trim(),
        notes: String(assignment.notes || "").trim(),
      }))
      .filter(
        (assignment) =>
          assignment.assignedTo || assignment.notes || assignment.role
      );

    onSaveBooking({
      ...booking,
      meals: formData.meals.trim(),
      activities: formData.activities.trim(),
      programLogisticsAssignments: cleanedAssignments,
    });
  };

  return (
    <form className="program-logistics-tab" onSubmit={handleSubmit}>
      <section className="program-logistics-card">
        <header className="program-logistics-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaUtensils />
            </span>

            <div>
              <p className="dashboard-eyebrow">Meals & Activities</p>
              <h3>Program Logistics</h3>
              <span>
                Edit the same meals and recreation text shown in the Overview
                tab.
              </span>
            </div>
          </div>

          <button className="primary-dashboard-button" type="submit">
            Save
          </button>
        </header>

        <div className="program-logistics-summary-grid">
          <div>
            <small># Meals</small>
            <strong>{booking.mealCount || "—"}</strong>
          </div>

          <div>
            <small>Food Allergies</small>
            <strong>{booking.foodAllergies || "—"}</strong>
          </div>

          <div>
            <small>Guest Count</small>
            <strong>{booking.attendeeCount || "—"}</strong>
          </div>
        </div>

        <div className="program-logistics-editor-grid">
          <label className="program-logistics-field">
            <span>Meals</span>
            <textarea
              value={formData.meals}
              placeholder="Example: 6 - Saturday breakfast through Sunday dinner..."
              onChange={(event) => updateField("meals", event.target.value)}
            />
          </label>

          <label className="program-logistics-field">
            <span>Recreation / Activities</span>
            <textarea
              value={formData.activities}
              placeholder="Example: Fire pit on Saturday night @ Hebron, 9-11pm..."
              onChange={(event) =>
                updateField("activities", event.target.value)
              }
            />
          </label>
        </div>
      </section>

      <section className="program-logistics-card">
        <header className="program-logistics-section-header">
          <div>
            <p className="dashboard-eyebrow">Staff Assignments</p>
            <h3>Assigned People</h3>
            <span>
              Assign staff members to meals, recreation, setup, or general
              program logistics.
            </span>
          </div>

          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={addAssignment}
          >
            <FaPlus />
            Add Person
          </button>
        </header>

        {formData.assignments.length > 0 ? (
          <div className="program-assignment-list">
            {formData.assignments.map((assignment) => (
              <div className="program-assignment-row" key={assignment.id}>
                <label>
                  <span>Area</span>
                  <select
                    value={assignment.role}
                    onChange={(event) =>
                      updateAssignment(
                        assignment.id,
                        "role",
                        event.target.value
                      )
                    }
                  >
                    <option value="General">General</option>
                    <option value="Meals">Meals</option>
                    <option value="Recreation">Recreation</option>
                    <option value="Setup">Setup</option>
                    <option value="Cleanup">Cleanup</option>
                  </select>
                </label>

                <label>
                  <span>Assigned To</span>
                  <select
                    value={assignment.assignedTo}
                    onChange={(event) =>
                      updateAssignment(
                        assignment.id,
                        "assignedTo",
                        event.target.value
                      )
                    }
                  >
                    <option value="">Unassigned</option>

                    {staffUsers
                      .filter((user) => user.active)
                      .map((user) => (
                        <option value={user.name} key={user.id}>
                          {user.name}
                        </option>
                      ))}

                    {assignment.assignedTo &&
                      !staffUsers.some(
                        (user) =>
                          user.active &&
                          normalizeStaffName(user.name) === normalizeStaffName(assignment.assignedTo)
                      ) && (
                        <option value={assignment.assignedTo}>
                          {assignment.assignedTo}
                        </option>
                      )}
                  </select>
                </label>

                <label>
                  <span>Notes</span>
                  <input
                    value={assignment.notes}
                    placeholder="Example: Confirm fire pit supplies"
                    onChange={(event) =>
                      updateAssignment(
                        assignment.id,
                        "notes",
                        event.target.value
                      )
                    }
                  />
                </label>

                <button
                  className="program-assignment-delete-button"
                  type="button"
                  onClick={() => removeAssignment(assignment.id)}
                  aria-label="Remove assignment"
                >
                  <FaTrashAlt />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="program-logistics-empty">
            <FaUsers />
            <strong>No people assigned yet</strong>
            <p>Add a staff member to track who is handling meals or recreation.</p>
          </div>
        )}

        <footer className="program-logistics-footer">
          <button className="primary-dashboard-button" type="submit">
            Save
          </button>
        </footer>
      </section>
    </form>
  );
}

/* =========================================================
   BOOKING DETAIL RECORD TYPES
========================================================= */

function isGuestGroupInquiryRecord(booking) {
  const sourceType = String(booking?.sourceType || "")
    .trim()
    .toLowerCase();

  const detectedImportType = String(
    booking?.detectedImportType || ""
  )
    .trim()
    .toLowerCase();

  return (
    sourceType.startsWith("guest group inquiry") ||
    detectedImportType.startsWith("guest group inquiry")
  );
}


function isStaffBookingRecord(booking) {
  const sourceType = String(booking?.sourceType || "")
    .trim()
    .toLowerCase();

  const detectedImportType = String(
    booking?.detectedImportType || ""
  )
    .trim()
    .toLowerCase();

  return (
    sourceType === "staff booking" ||
    detectedImportType === "staff booking"
  );
}


function StaffBookingDetailField({
  label,
  value,
}) {
  return (
    <div className="staff-booking-detail-field">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function StaffBookingFormDetails({
  booking,
  dateSettings,
}) {
  const details =
    booking.rentalFormDetails || {};

  return (
    <article className="booking-work-section staff-booking-form-section">

      <div className="booking-work-section-header">
        <div>
          <span className="booking-work-section-icon">
            <FaClipboardList />
          </span>

          <div>
            <p>Staff Booking</p>
            <h3>Original Staff Form Details</h3>
          </div>
        </div>
      </div>


      {/* GUEST BREAKDOWN */}

      <section className="staff-booking-detail-group">
        <h4>Guest Information</h4>

        <div className="staff-booking-detail-grid">

          <StaffBookingDetailField
            label="Approx. Adults"
            value={details.approxAdultGuests}
          />

          <StaffBookingDetailField
            label="Approx. Children"
            value={details.approxChildrenGuests}
          />

          <StaffBookingDetailField
            label="Actual Adults"
            value={details.actualAdultGuests}
          />

          <StaffBookingDetailField
            label="Actual Children"
            value={details.actualChildrenGuests}
          />

          <StaffBookingDetailField
            label="Minimum Guarantee"
            value={
              details.minimumGuarantee ||
              booking.minPayingGuests
            }
          />

          <StaffBookingDetailField
            label="Ethnic Breakdown"
            value={details.ethnicBreakdown}
          />

        </div>
      </section>


      {/* RATES */}

      <section className="staff-booking-detail-group">
        <h4>Quoted Rates</h4>

        <div className="staff-booking-detail-grid">

          <StaffBookingDetailField
            label="Adult Rate"
            value={details.adultRateQuoted}
          />

          <StaffBookingDetailField
            label="Child Rate"
            value={details.childRateQuoted}
          />

          <StaffBookingDetailField
            label="# Nights"
            value={
              details.numberOfNights ||
              booking.nights
            }
          />

          <StaffBookingDetailField
            label="# Meals"
            value={
              details.numberOfMeals ||
              booking.mealCount
            }
          />

        </div>
      </section>


      {/* BOOKING TIMELINE */}

      <section className="staff-booking-detail-group">
        <h4>Booking Timeline</h4>

        <div className="staff-booking-detail-grid">

          <StaffBookingDetailField
            label="Inquiry Date"
            value={formatBookingDetailDate(
              details.inquiryDate,
              dateSettings
            )}
          />

          <StaffBookingDetailField
            label="Contract Sent"
            value={formatBookingDetailDate(
              details.contractSentDate,
              dateSettings
            )}
          />

          <StaffBookingDetailField
            label="Return Contract By"
            value={formatBookingDetailDate(
              details.returnContractByDate,
              dateSettings
            )}
          />

          <StaffBookingDetailField
            label="Contract Returned"
            value={formatBookingDetailDate(
              details.contractReturnedDate,
              dateSettings
            )}
          />

        </div>
      </section>


      {/* PAYMENT / DOCUMENTS */}

      <section className="staff-booking-detail-group">
        <h4>Payments & Documents</h4>

        <div className="staff-booking-detail-grid">

          <StaffBookingDetailField
            label="Deposit Received"
            value={formatBookingDetailDate(
              details.depositReceivedDate,
              dateSettings
            )}
          />

          <StaffBookingDetailField
            label="Deposit Amount"
            value={
              details.depositAmount ||
              booking.deposit
            }
          />

          <StaffBookingDetailField
            label="Insurance Certificate"
            value={formatBookingDetailDate(
              details.insuranceCertificateDate,
              dateSettings
            )}
          />

          <StaffBookingDetailField
            label="Notification Date"
            value={formatBookingDetailDate(
              details.notificationDate,
              dateSettings
            )}
          />

          <StaffBookingDetailField
            label="Payment Method"
            value={details.paymentMethod}
          />

        </div>
      </section>


      {/* TIMES */}

      <section className="staff-booking-detail-group">
        <h4>Arrival, Departure & Meals</h4>

        <div className="staff-booking-detail-grid">

          <StaffBookingDetailField
            label="Arrival Time"
            value={details.arrivalTime}
          />

          <StaffBookingDetailField
            label="Departure Time"
            value={details.departureTime}
          />

          <StaffBookingDetailField
            label="First Meal"
            value={details.firstMeal}
          />

          <StaffBookingDetailField
            label="Last Meal"
            value={details.lastMeal}
          />

          <StaffBookingDetailField
            label="Breakfast"
            value={details.breakfastTime}
          />

          <StaffBookingDetailField
            label="Lunch"
            value={details.lunchTime}
          />

          <StaffBookingDetailField
            label="Dinner"
            value={details.dinnerTime}
          />

        </div>

        {details.mealNotes && (
          <div className="staff-booking-detail-notes">
            <small>Meal Notes</small>
            <p>{details.mealNotes}</p>
          </div>
        )}
      </section>


      {/* LODGING BREAKDOWN */}

      <section className="staff-booking-detail-group">
        <h4>Lodging Breakdown</h4>

        <div className="staff-booking-detail-grid">

          <StaffBookingDetailField
            label="Bethel"
            value={details.lodgingBethel}
          />

          <StaffBookingDetailField
            label="Hebron 3rd Floor"
            value={details.lodgingHebronThird}
          />

          <StaffBookingDetailField
            label="Hebron Bunks"
            value={details.lodgingHebronBunks}
          />

          <StaffBookingDetailField
            label="Dothan"
            value={details.lodgingDothan}
          />

          <StaffBookingDetailField
            label="Aijalon"
            value={details.lodgingAijalon}
          />

          <StaffBookingDetailField
            label="Capernaum"
            value={details.lodgingCapernaum}
          />

          <StaffBookingDetailField
            label="Guest House"
            value={details.lodgingGuestHouse}
          />

          <StaffBookingDetailField
            label="Linen Option"
            value={details.linenOption}
          />

          <StaffBookingDetailField
            label="Linen Sets"
            value={details.linenSets}
          />

        </div>
      </section>

    </article>
  );
}

function BookingDetailView({
  booking,
  activeTab,
  setActiveTab,
  onBack,
  onSaveBooking,
  staffUsers,
  currentStaffUserId,
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
                  <button
                    className="booking-profile-link-button"
                    type="button"
                    onClick={() => setActiveTab("Meals & Activities")}
                  >
                    Edit
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

              {isStaffBookingRecord(booking) && (
                <StaffBookingFormDetails
                  booking={booking}
                  dateSettings={dateSettings}
                />
              )}
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

{activeTab === "Meals & Activities" && (
  <BookingProgramLogisticsTab
    booking={booking}
    onSaveBooking={onSaveBooking}
    staffUsers={staffUsers}
  />
)}

{(activeTab === "Checklists" || activeTab === "Notes & Tasks") && (
  <BookingChecklists
    booking={booking}
    onSaveBooking={onSaveBooking}
    staffUsers={staffUsers}
    currentStaffUserId={currentStaffUserId}
  />
)}

{activeTab !== "Overview" &&
  activeTab !== "Details" &&
  activeTab !== "Housing" &&
  activeTab !== "Meals & Activities" &&
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



function UserAdminView({
  staffUsers,
  setStaffUsers,
  currentStaffUserId,
  setCurrentStaffUserId,
}) {
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    role: "Staff",
  });

  const activeUsers = staffUsers.filter((user) => user.active);
  const inactiveUsers = staffUsers.filter((user) => !user.active);

  const updateUsers = (nextUsers) => {
    setStaffUsers(nextUsers);
    saveStaffUsers(nextUsers);
  };

  const updateNewUserField = (fieldName, value) => {
    setNewUserForm((currentForm) => ({
      ...currentForm,
      [fieldName]: value,
    }));
  };

  const handleAddUser = (event) => {
    event.preventDefault();

    const name = newUserForm.name.trim();

    if (!name) {
      return;
    }

    const nextUser = {
      id: createStaffUserId(),
      name,
      email: newUserForm.email.trim(),
      role: newUserForm.role,
      active: true,
    };

    const nextUsers = [...staffUsers, nextUser];

    updateUsers(nextUsers);

    if (!currentStaffUserId) {
      setCurrentStaffUserId(nextUser.id);
      saveCurrentStaffUserId(nextUser.id);
    }

    setNewUserForm({
      name: "",
      email: "",
      role: "Staff",
    });
  };

  const updateStaffUser = (userId, fieldName, value) => {
    updateUsers(
      staffUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              [fieldName]: value,
            }
          : user
      )
    );
  };

  const toggleStaffUserActive = (userId) => {
    updateUsers(
      staffUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              active: !user.active,
            }
          : user
      )
    );
  };

  const deleteStaffUser = (userId) => {
    const confirmed = window.confirm(
      "Delete this staff user? Existing assignments typed with this name will stay on the bookings."
    );

    if (!confirmed) {
      return;
    }

    const nextUsers = staffUsers.filter((user) => user.id !== userId);

    updateUsers(nextUsers);

    if (currentStaffUserId === userId) {
      const fallbackUserId = nextUsers[0]?.id || "";

      setCurrentStaffUserId(fallbackUserId);
      saveCurrentStaffUserId(fallbackUserId);
    }
  };

  return (
    <section className="admin-page">
      <article className="dashboard-card admin-hero-card">
        <div className="admin-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaUserShield />
            </span>

            <div>
              <p className="dashboard-eyebrow">Administration</p>
              <h2>User Admin</h2>
              <span>
                Manage staff members used for checklist and program logistics assignments.
              </span>
            </div>
          </div>

          <label className="admin-current-user-picker">
            <span>Current User</span>

            <select
              value={currentStaffUserId}
              onChange={(event) => {
                setCurrentStaffUserId(event.target.value);
                saveCurrentStaffUserId(event.target.value);
              }}
            >
              {staffUsers.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="admin-summary-grid">
          <div>
            <small>Active Users</small>
            <strong>{activeUsers.length}</strong>
          </div>

          <div>
            <small>Inactive Users</small>
            <strong>{inactiveUsers.length}</strong>
          </div>

          <div>
            <small>Total Users</small>
            <strong>{staffUsers.length}</strong>
          </div>
        </div>
      </article>

      <article className="dashboard-card admin-panel-card">
        <div className="admin-panel-header">
          <div>
            <p className="dashboard-eyebrow">Create User</p>
            <h3>Add Staff Member</h3>
            <span>
              Add people who can be assigned to booking checklists and meals/activities work.
            </span>
          </div>
        </div>

        <form className="admin-user-form" onSubmit={handleAddUser}>
          <label>
            <span>Name</span>
            <input
              value={newUserForm.name}
              placeholder="Example: Mindy"
              onChange={(event) => updateNewUserField("name", event.target.value)}
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={newUserForm.email}
              placeholder="name@toahnipi.org"
              onChange={(event) => updateNewUserField("email", event.target.value)}
            />
          </label>

          <label>
            <span>Role</span>
            <select
              value={newUserForm.role}
              onChange={(event) => updateNewUserField("role", event.target.value)}
            >
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
              <option value="Viewer">Viewer</option>
            </select>
          </label>

          <button className="primary-dashboard-button" type="submit">
            <FaPlus />
            Add User
          </button>
        </form>
      </article>

      <article className="dashboard-card admin-panel-card">
        <div className="admin-panel-header">
          <div>
            <p className="dashboard-eyebrow">Staff Directory</p>
            <h3>Users</h3>
            <span>
              These names are matched against assignment names on booking tasks.
            </span>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Current User</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>

            <tbody>
              {staffUsers.map((user) => (
                <tr className={!user.active ? "admin-user-inactive" : ""} key={user.id}>
                  <td>
                    <input
                      value={user.name}
                      onChange={(event) =>
                        updateStaffUser(user.id, "name", event.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="email"
                      value={user.email}
                      onChange={(event) =>
                        updateStaffUser(user.id, "email", event.target.value)
                      }
                    />
                  </td>

                  <td>
                    <select
                      value={user.role}
                      onChange={(event) =>
                        updateStaffUser(user.id, "role", event.target.value)
                      }
                    >
                      <option value="Admin">Admin</option>
                      <option value="Staff">Staff</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </td>

                  <td>
                    <button
                      className={`admin-status-pill ${user.active ? "active" : "inactive"}`}
                      type="button"
                      onClick={() => toggleStaffUserActive(user.id)}
                    >
                      {user.active ? "Active" : "Inactive"}
                    </button>
                  </td>

                  <td>
                    {currentStaffUserId === user.id ? (
                      <span className="admin-current-pill">Current</span>
                    ) : (
                      <button
                        className="secondary-dashboard-button"
                        type="button"
                        onClick={() => {
                          setCurrentStaffUserId(user.id);
                          saveCurrentStaffUserId(user.id);
                        }}
                      >
                        Use Me
                      </button>
                    )}
                  </td>

                  <td>
                    <button
                      className="booking-checklist-delete-button"
                      type="button"
                      onClick={() => deleteStaffUser(user.id)}
                      aria-label={`Delete ${user.name}`}
                    >
                      <FaTrashAlt />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}


function JobTaskCard({ task, openBookingDetail, booking }) {
  const statusClass = getTaskStatusClass(task);

  return (
    <article className={`job-task-card job-task-card-${statusClass}`}>
      <div className="job-task-main">
        <div>
          <span className={`job-status-pill ${statusClass}`}>
            {getTaskStatusLabel(task)}
          </span>

          <h4>{task.title}</h4>

          <p>
            {task.bookingName} · {task.sourceType} · {task.role}
          </p>
        </div>

        {task.completed ? (
          <FaCheckCircle className="job-complete-icon" />
        ) : (
          <FaTasks className="job-open-icon" />
        )}
      </div>

      <div className="job-task-meta">
        <span>
          <strong>Due</strong>
          {task.dueDate || "No due date"}
        </span>

        <span>
          <strong>Assigned To</strong>
          {task.assignedTo || "Unassigned"}
        </span>

        <span>
          <strong>Type</strong>
          {task.sourceType}
        </span>
      </div>

      {task.notes && <p className="job-task-notes">{task.notes}</p>}

      {booking && (
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={() => openBookingDetail(booking)}
        >
          Open Booking
        </button>
      )}
    </article>
  );
}

function JobsView({
  inquiryBookings,
  staffUsers,
  currentStaffUserId,
  openBookingDetail,
}) {
  const [statusFilter, setStatusFilter] = useState("open");

  const allJobs = useMemo(
    () => getAllBookingJobs(inquiryBookings),
    [inquiryBookings]
  );

  const currentUser = staffUsers.find((user) => user.id === currentStaffUserId);
  const activeStaffUsers = staffUsers.filter((user) => user.active);

  const filteredJobs = allJobs.filter((job) => {
    if (statusFilter === "all") {
      return true;
    }

    if (statusFilter === "completed") {
      return job.completed;
    }

    return !job.completed;
  });

  const myJobs = currentUser
    ? filteredJobs.filter(
        (job) =>
          normalizeStaffName(job.assignedTo) ===
          normalizeStaffName(currentUser.name)
      )
    : [];

  const unassignedJobs = filteredJobs.filter(
    (job) => !String(job.assignedTo || "").trim()
  );

  const findBookingForJob = (job) =>
    inquiryBookings.find((booking) => booking.id === job.bookingId);

  const openJobCount = allJobs.filter((job) => !job.completed).length;
  const completedJobCount = allJobs.filter((job) => job.completed).length;
  const overdueJobCount = allJobs.filter(
    (job) => getTaskStatusClass(job) === "overdue"
  ).length;

  return (
    <section className="jobs-page">
      <article className="dashboard-card jobs-hero-card">
        <div className="jobs-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaTasks />
            </span>

            <div>
              <p className="dashboard-eyebrow">Jobs</p>
              <h2>Staff Tasks</h2>
              <span>
                View checklist tasks and meals/activities assignments by staff
                member.
              </span>
            </div>
          </div>

          <label className="jobs-filter-field">
            <span>Show</span>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="open">Open Jobs</option>
              <option value="completed">Completed Jobs</option>
              <option value="all">All Jobs</option>
            </select>
          </label>
        </div>

        <div className="jobs-summary-grid">
          <div>
            <small>Open</small>
            <strong>{openJobCount}</strong>
          </div>

          <div>
            <small>Overdue</small>
            <strong>{overdueJobCount}</strong>
          </div>

          <div>
            <small>Completed</small>
            <strong>{completedJobCount}</strong>
          </div>

          <div>
            <small>Unassigned</small>
            <strong>{unassignedJobs.length}</strong>
          </div>
        </div>
      </article>

      <section className="jobs-two-column-layout">
        <article className="dashboard-card jobs-panel">
          <div className="jobs-panel-header">
            <div>
              <p className="dashboard-eyebrow">My Work</p>
              <h3>{currentUser ? `${currentUser.name}'s Jobs` : "My Jobs"}</h3>
              <span>
                Jobs assigned to the current staff user selected in User Admin.
              </span>
            </div>
          </div>

          <div className="jobs-task-list">
            {sortJobsByDueDate(myJobs).length > 0 ? (
              sortJobsByDueDate(myJobs).map((job) => (
                <JobTaskCard
                  key={job.id}
                  task={job}
                  booking={findBookingForJob(job)}
                  openBookingDetail={openBookingDetail}
                />
              ))
            ) : (
              <div className="empty-state">
                <strong>No jobs assigned to you</strong>
                <p>
                  Assign checklist items or program logistics work to{" "}
                  {currentUser?.name || "the current user"} to see them here.
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-card jobs-panel">
          <div className="jobs-panel-header">
            <div>
              <p className="dashboard-eyebrow">Team Workload</p>
              <h3>Active Members & Their Jobs</h3>
              <span>
                Grouped by the assigned staff name on checklists and
                meals/activities.
              </span>
            </div>
          </div>

          <div className="jobs-member-list">
            {activeStaffUsers.map((user) => {
              const userJobs = sortJobsByDueDate(
                filteredJobs.filter(
                  (job) =>
                    normalizeStaffName(job.assignedTo) ===
                    normalizeStaffName(user.name)
                )
              );

              return (
                <section className="jobs-member-card" key={user.id}>
                  <div className="jobs-member-header">
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.role}</span>
                    </div>

                    <em>
                      {userJobs.length} job{userJobs.length === 1 ? "" : "s"}
                    </em>
                  </div>

                  {userJobs.length > 0 ? (
                    <div className="jobs-member-tasks">
                      {userJobs.map((job) => {
                        const booking = findBookingForJob(job);

                        return (
                          <button
                            className={`jobs-member-task-row jobs-member-task-${getTaskStatusClass(
                              job
                            )}`}
                            type="button"
                            key={job.id}
                            onClick={() => booking && openBookingDetail(booking)}
                          >
                            <span>{job.title}</span>
                            <small>{job.bookingName}</small>
                            <small>{job.sourceType}</small>
                            <em>{job.dueDate || "No due date"}</em>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="jobs-member-empty">No matching jobs.</p>
                  )}
                </section>
              );
            })}

            {unassignedJobs.length > 0 && (
              <section className="jobs-member-card jobs-unassigned-card">
                <div className="jobs-member-header">
                  <div>
                    <strong>Unassigned</strong>
                    <span>Needs assignment</span>
                  </div>

                  <em>
                    {unassignedJobs.length} job
                    {unassignedJobs.length === 1 ? "" : "s"}
                  </em>
                </div>

                <div className="jobs-member-tasks">
                  {sortJobsByDueDate(unassignedJobs).map((job) => {
                    const booking = findBookingForJob(job);

                    return (
                      <button
                        className={`jobs-member-task-row jobs-member-task-${getTaskStatusClass(
                          job
                        )}`}
                        type="button"
                        key={job.id}
                        onClick={() => booking && openBookingDetail(booking)}
                      >
                        <span>{job.title}</span>
                        <small>{job.bookingName}</small>
                        <small>{job.sourceType}</small>
                        <em>{job.dueDate || "No due date"}</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}

function cleanPortalText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePortalChecklistItem(item) {
  return {
    id: item.id,
    itemId: item.item_id || "",
    title: item.title || "Untitled item",
    status: item.status || "notStarted",
    required: Boolean(item.required),
    dueDate: item.due_date || "",
    guestAction: item.guest_action || "none",
    uploadedFileName: item.uploaded_file_name || "",
    lastChangedAt: item.last_changed_at || "",
    sortOrder: item.sort_order || 0,
  };
}

function normalizePortalDocument(document) {
  return {
    id: document.id,
    title: document.title || "Untitled document",
    documentType: document.document_type || "Document",
    fileName: document.file_name || "",
    status: document.status || "ready",
    uploadedByGuest: Boolean(document.uploaded_by_guest),
    lastChangedAt: document.last_changed_at || document.created_at || "",
  };
}

function getPortalProgress(checklistItems = []) {
  const total = checklistItems.length;

  const completed = checklistItems.filter(
    (item) => item.status === "completed"
  ).length;

  const needsReview = checklistItems.filter(
    (item) => item.status === "needsReview"
  ).length;

  const waitingOnGuest = checklistItems.filter(
    (item) => item.status === "waitingOnGuest"
  ).length;

  const notStarted = checklistItems.filter(
    (item) => item.status === "notStarted"
  ).length;

  const open = waitingOnGuest + notStarted;

  const percent =
    total > 0 ? Math.round(((completed + needsReview) / total) * 100) : 0;

  return {
    total,
    completed,
    needsReview,
    waitingOnGuest,
    notStarted,
    open,
    percent,
  };
}

function normalizePortalOverviewRecord(row) {
  const checklistItems = Array.isArray(row.portal_checklist_items)
    ? row.portal_checklist_items
        .map(normalizePortalChecklistItem)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const documents = Array.isArray(row.portal_documents)
    ? row.portal_documents.map(normalizePortalDocument)
    : [];

  const progress = getPortalProgress(checklistItems);

  const guestUploads = documents.filter(
    (document) => document.uploadedByGuest
  ).length;

  return {
    id: row.id,
    portalToken: row.portal_token || "",

    organizationName: cleanPortalText(row.organization_name, "Unnamed Organization"),
    contactName: cleanPortalText(row.contact_name, "No contact name"),
    email: row.email || "",

    startDate: row.start_date || "",
    endDate: row.end_date || "",
    attendeeCount: row.attendee_count || "",
    status: row.status || "Inquiry",
    updatedAt: row.updated_at || "",

    checklistItems,
    documents,
    progress,
    guestUploads,
  };
}

async function fetchPortalOverviewRecords() {
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id,
      portal_token,
      organization_name,
      contact_name,
      email,
      start_date,
      end_date,
      attendee_count,
      status,
      updated_at,
      portal_checklist_items (
        id,
        item_id,
        title,
        status,
        required,
        due_date,
        guest_action,
        uploaded_file_name,
        last_changed_at,
        sort_order
      ),
      portal_documents (
        id,
        title,
        document_type,
        file_name,
        status,
        uploaded_by_guest,
        last_changed_at,
        created_at
      )
    `)
    .order("start_date", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(normalizePortalOverviewRecord);
}

function getPortalBaseUrl() {
  return (
    import.meta.env.VITE_GUEST_PORTAL_BASE_URL || "http://localhost:5173"
  ).replace(/\/$/, "");
}

function buildPortalUrl(portalToken) {
  if (!portalToken) {
    return "";
  }

  return `${getPortalBaseUrl()}/?portal=${portalToken}`;
}

function getPortalStatusLabel(record) {
  if (record.progress.total === 0) {
    return "No Checklist";
  }

  if (record.progress.needsReview > 0) {
    return "Needs Review";
  }

  if (record.progress.open > 0) {
    return "Waiting on Guest";
  }

  return "Complete";
}

function getPortalStatusClass(record) {
  if (record.progress.total === 0) {
    return "no-checklist";
  }

  if (record.progress.needsReview > 0) {
    return "needs-review";
  }

  if (record.progress.open > 0) {
    return "waiting";
  }

  return "complete";
}

function PortalAdminSummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}) {
  return (
    <article className={`portal-summary-tile portal-summary-tile-${tone}`}>
      <span className="portal-summary-tile-icon">
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper && <em>{helper}</em>}
      </div>
    </article>
  );
}

function PortalAdminProgressBar({ percent }) {
  return (
    <div className="portal-admin-progress-track">
      <div
        className="portal-admin-progress-fill"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PortalChecklistPreview({ items }) {
  if (items.length === 0) {
    return (
      <div className="portal-checklist-preview-empty">
        No portal checklist items yet.
      </div>
    );
  }

  return (
    <div className="portal-checklist-preview">
      {items.slice(0, 5).map((item) => (
        <div
          className={`portal-checklist-preview-row portal-item-${item.status}`}
          key={item.id}
        >
          <span></span>

          <div>
            <strong>{item.title}</strong>
            <small>
              {item.status === "needsReview"
                ? "Needs staff review"
                : item.status === "waitingOnGuest"
                  ? "Waiting on guest"
                  : item.status === "completed"
                    ? "Complete"
                    : "Not started"}
              {item.dueDate ? ` · Due ${item.dueDate}` : ""}
            </small>
          </div>
        </div>
      ))}

      {items.length > 5 && (
        <small className="portal-checklist-preview-more">
          +{items.length - 5} more item{items.length - 5 === 1 ? "" : "s"}
        </small>
      )}
    </div>
  );
}

function PortalRecordCard({
  record,
  copiedBookingId,
  onCopyPortalLink,
  onOpenBooking,
}) {
  const portalStatusLabel = getPortalStatusLabel(record);
  const portalStatusClass = getPortalStatusClass(record);
  const portalUrl = buildPortalUrl(record.portalToken);

  const guestLabel = record.attendeeCount
    ? `${record.attendeeCount} guest${record.attendeeCount === "1" ? "" : "s"}`
    : "No guest count";

  return (
    <article className={`portal-record-card portal-record-card-${portalStatusClass}`}>
      <div className="portal-record-main">
        <div className="portal-record-title-row">
          <div>
            <span className={`portal-record-status-pill ${portalStatusClass}`}>
              {portalStatusLabel}
            </span>

            <h3>{record.organizationName}</h3>

            <p>
              {formatDateRange(record.startDate, record.endDate)} · {guestLabel}
            </p>
          </div>

          <strong className="portal-record-progress-number">
            {record.progress.percent}%
          </strong>
        </div>

        <PortalAdminProgressBar percent={record.progress.percent} />

        <div className="portal-record-metrics">
          <span>
            <strong>{record.progress.completed}</strong>
            Complete
          </span>

          <span>
            <strong>{record.progress.needsReview}</strong>
            Review
          </span>

          <span>
            <strong>{record.progress.open}</strong>
            Open
          </span>

          <span>
            <strong>{record.documents.length}</strong>
            Docs
          </span>
        </div>

        <PortalChecklistPreview items={record.checklistItems} />
      </div>

      <aside className="portal-record-side">
        <div className="portal-record-contact">
          <small>Primary Contact</small>
          <strong>{record.contactName}</strong>
          <span>{record.email || "No email"}</span>
        </div>

        <div className="portal-record-token">
          <small>Portal Link</small>

          {record.portalToken ? (
            <code>{record.portalToken.slice(0, 10)}...</code>
          ) : (
            <em>No token</em>
          )}
        </div>

        <div className="portal-record-actions">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={() => onOpenBooking(record.id)}
          >
            Open Booking
          </button>

          <button
            className="secondary-dashboard-button"
            type="button"
            disabled={!portalUrl}
            onClick={() => onCopyPortalLink(record)}
          >
            <FaCopy />
            {copiedBookingId === record.id ? "Copied" : "Copy Link"}
          </button>

          <a
            className={`primary-dashboard-button ${!portalUrl ? "disabled" : ""}`}
            href={portalUrl || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!portalUrl}
          >
            <FaExternalLinkAlt />
            Open Portal
          </a>
        </div>
      </aside>
    </article>
  );
}

function PortalAdminView({ inquiryBookings, openBookingDetail }) {
  const [portalRecords, setPortalRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [portalError, setPortalError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedBookingId, setCopiedBookingId] = useState("");

  async function loadPortalRecords() {
    try {
      setIsLoading(true);
      setPortalError("");

      const records = await fetchPortalOverviewRecords();

      setPortalRecords(records);
    } catch (error) {
      console.error("Could not load portal overview:", error);
      setPortalError("Could not load portal information. Check the console.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPortalRecords();
  }, []);

  const summary = useMemo(() => {
    const total = portalRecords.length;

    const withChecklists = portalRecords.filter(
      (record) => record.progress.total > 0
    ).length;

    const needsReview = portalRecords.filter(
      (record) => record.progress.needsReview > 0
    ).length;

    const waitingOnGuest = portalRecords.filter(
      (record) =>
        record.progress.needsReview === 0 && record.progress.open > 0
    ).length;

    const complete = portalRecords.filter(
      (record) =>
        record.progress.total > 0 &&
        record.progress.completed === record.progress.total
    ).length;

    return {
      total,
      withChecklists,
      needsReview,
      waitingOnGuest,
      complete,
    };
  }, [portalRecords]);

  const filteredRecords = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return portalRecords
      .filter((record) => {
        if (!search) {
          return true;
        }

        return [
          record.organizationName,
          record.contactName,
          record.email,
          record.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .filter((record) => {
        if (statusFilter === "all") {
          return true;
        }

        if (statusFilter === "needsReview") {
          return record.progress.needsReview > 0;
        }

        if (statusFilter === "waiting") {
          return record.progress.needsReview === 0 && record.progress.open > 0;
        }

        if (statusFilter === "complete") {
          return (
            record.progress.total > 0 &&
            record.progress.completed === record.progress.total
          );
        }

        if (statusFilter === "noChecklist") {
          return record.progress.total === 0;
        }

        return true;
      })
      .sort((a, b) => {
        if (b.progress.needsReview !== a.progress.needsReview) {
          return b.progress.needsReview - a.progress.needsReview;
        }

        if (b.progress.open !== a.progress.open) {
          return b.progress.open - a.progress.open;
        }

        return String(a.startDate || "").localeCompare(
          String(b.startDate || "")
        );
      });
  }, [portalRecords, searchTerm, statusFilter]);

  async function handleCopyPortalLink(record) {
    const portalUrl = buildPortalUrl(record.portalToken);

    if (!portalUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopiedBookingId(record.id);

      window.setTimeout(() => {
        setCopiedBookingId("");
      }, 1600);
    } catch (error) {
      console.error("Could not copy portal link:", error);
      alert("Could not copy the portal link.");
    }
  }

  function handleOpenBooking(bookingId) {
    const booking = inquiryBookings.find((inquiry) => inquiry.id === bookingId);

    if (!booking) {
      alert("Could not find this booking in the current dashboard data.");
      return;
    }

    openBookingDetail(booking);
  }

  return (
    <section className="portal-admin-page">
      <article className="dashboard-card portal-admin-hero-card">
        <div className="portal-admin-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaKey />
            </span>

            <div>
              <p className="dashboard-eyebrow">Guest Portals</p>
              <h2>Portal Progress</h2>
              <span>
                Track each group&apos;s guest-facing checklist, documents, and review status.
              </span>
            </div>
          </div>

          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={loadPortalRecords}
            disabled={isLoading}
          >
            <FaSyncAlt />
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="portal-summary-grid-admin">
          <PortalAdminSummaryCard
            icon={FaKey}
            label="Total Groups"
            value={summary.total}
            helper="Bookings loaded from Supabase"
          />

          <PortalAdminSummaryCard
            icon={FaTasks}
            label="With Checklists"
            value={summary.withChecklists}
            helper="Groups with portal tasks"
            tone="blue"
          />

          <PortalAdminSummaryCard
            icon={FaExclamationTriangle}
            label="Needs Review"
            value={summary.needsReview}
            helper="Guest submitted or staff review needed"
            tone="gold"
          />

          <PortalAdminSummaryCard
            icon={FaCheckCircle}
            label="Complete"
            value={summary.complete}
            helper="All checklist items complete"
            tone="green"
          />
        </div>
      </article>

      <article className="dashboard-card portal-admin-toolbar">
        <label>
          <span>Search</span>
          <input
            value={searchTerm}
            placeholder="Search group, contact, email, or status..."
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Portal Groups</option>
            <option value="needsReview">Needs Review</option>
            <option value="waiting">Waiting on Guest</option>
            <option value="complete">Complete</option>
            <option value="noChecklist">No Checklist</option>
          </select>
        </label>
      </article>

      {portalError && (
        <section className="dashboard-card portal-admin-error">
          <FaExclamationTriangle />
          <strong>{portalError}</strong>
        </section>
      )}

      {isLoading ? (
        <section className="dashboard-card portal-admin-loading">
          <FaClock />
          <strong>Loading portal progress...</strong>
        </section>
      ) : filteredRecords.length > 0 ? (
        <div className="portal-record-list">
          {filteredRecords.map((record) => (
            <PortalRecordCard
              key={record.id}
              record={record}
              copiedBookingId={copiedBookingId}
              onCopyPortalLink={handleCopyPortalLink}
              onOpenBooking={handleOpenBooking}
            />
          ))}
        </div>
      ) : (
        <section className="dashboard-card portal-admin-empty">
          <strong>No portal records match this filter</strong>
          <p>
            Try changing the search or filter, or create checklist items for a booking.
          </p>
        </section>
      )}
    </section>
  );
}


export default function Dashboard() {
  const today = new Date();

  const masterFileInputRef = useRef(null);
  const staffContactsFileInputRef = useRef(null);
  const archiveFileInputRef = useRef(null);

  const master2026FileInputRef = useRef(null);
  const master2027FileInputRef = useRef(null);
  const importEverythingFileInputRef = useRef(null);
  const importDropdownRef = useRef(null);

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [activeView, setActiveView] = useState("Dashboard");
  const [hasOpenedSpreadsheetView, setHasOpenedSpreadsheetView] = useState(false);
  const [isSpreadsheetRevealLoading, setIsSpreadsheetRevealLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const spreadsheetRevealTimerRef = useRef(null);
  const spreadsheetRevealFrameRef = useRef(0);
  const spreadsheetRevealSecondFrameRef = useRef(0);

  const [staffUsers, setStaffUsers] = useState(() => getSavedStaffUsers());

  const [currentStaffUserId, setCurrentStaffUserId] = useState(() =>
    getSavedCurrentStaffUserId(getSavedStaffUsers())
  );
  
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

  const [publicInquiries, setPublicInquiries] = useState([]);
  const [isBookingsLoading, setIsBookingsLoading] = useState(false);

  const updateDatedInquirySetting = (settingName, value) => {
    setDatedInquirySettings((currentSettings) => ({
      ...currentSettings,
      [settingName]: value,
    }));
  };

  async function loadBookingsFromSupabase() {
    try {
      setIsBookingsLoading(true);

      const bookings = await fetchBookings();

      setPublicInquiries(bookings);
    } catch (error) {
      console.error("Could not load bookings from Supabase:", error);
      alert("Could not load bookings from Supabase. Check the console.");
    } finally {
      setIsBookingsLoading(false);
    }
  }

  useEffect(() => {
    loadBookingsFromSupabase();
  }, []);
  
  function clearSpreadsheetRevealTimers() {
    if (spreadsheetRevealTimerRef.current) {
      window.clearTimeout(spreadsheetRevealTimerRef.current);
      spreadsheetRevealTimerRef.current = null;
    }

    if (spreadsheetRevealFrameRef.current) {
      window.cancelAnimationFrame(spreadsheetRevealFrameRef.current);
      spreadsheetRevealFrameRef.current = 0;
    }

    if (spreadsheetRevealSecondFrameRef.current) {
      window.cancelAnimationFrame(spreadsheetRevealSecondFrameRef.current);
      spreadsheetRevealSecondFrameRef.current = 0;
    }
  }

  function openDashboardView(nextView) {
    clearSpreadsheetRevealTimers();

    setSelectedBooking(null);
    setBookingDetailTab("Overview");
    setActiveView(nextView);

    if (nextView !== SPREADSHEET_VIEW_NAME) {
      setIsSpreadsheetRevealLoading(false);
      return;
    }

    setHasOpenedSpreadsheetView(true);
    setIsSpreadsheetRevealLoading(true);

    spreadsheetRevealFrameRef.current = window.requestAnimationFrame(() => {
      spreadsheetRevealSecondFrameRef.current = window.requestAnimationFrame(() => {
        spreadsheetRevealTimerRef.current = window.setTimeout(() => {
          setIsSpreadsheetRevealLoading(false);
        }, SPREADSHEET_REVEAL_LOADING_MS);
      });
    });
  }

  const refreshInquiries = () => {
    loadBookingsFromSupabase();
  };

  const deleteAllInquiries = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all inquiries and imported bookings? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteAllBookings();

      setPublicInquiries([]);
      setSelectedBooking(null);
      setActiveView("Dashboard");
    } catch (error) {
      console.error("Could not delete bookings from Supabase:", error);
      alert("Could not delete bookings from Supabase. Check the console.");
    }
  };


  const saveBookingEdits = async (updatedBooking) => {
    try {
      const bookingToSave = {
        ...updatedBooking,
        updatedAt: new Date().toISOString(),
      };

      const savedBooking = await upsertBooking(bookingToSave);

      setPublicInquiries((currentInquiries) => {
        const existingIndex = currentInquiries.findIndex(
          (inquiry) => inquiry.id === savedBooking.id
        );

        if (existingIndex === -1) {
          return [...currentInquiries, savedBooking];
        }

        return currentInquiries.map((inquiry) =>
          inquiry.id === savedBooking.id ? savedBooking : inquiry
        );
      });

      setSelectedBooking(savedBooking);
    } catch (error) {
      console.error("Could not save booking to Supabase:", error);
      alert("Could not save booking to Supabase. Check the console.");
    }
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

      const savedRows = await upsertBookings(allImportedRows);

      setPublicInquiries((currentInquiries) => {
        const byId = new Map();

        currentInquiries.forEach((booking) => {
          byId.set(booking.id, booking);
        });

        savedRows.forEach((booking) => {
          byId.set(booking.id, booking);
        });

        return Array.from(byId.values());
      });

      const skippedMessage =
        skippedSheets.length > 0
          ? `\n\nSkipped sheets: ${skippedSheets.join(", ")}`
          : "";

      alert(
        `Imported ${allImportedRows.length} ${importTypeLabel} row(s).${skippedMessage}`
      );
    } catch (error) {
      console.error(`Could not import ${importTypeLabel} spreadsheet:`, error);

      alert(
        `Sorry, that ${importTypeLabel} spreadsheet could not be imported.\n\n` +
          `Error: ${error?.message || String(error)}`
      );
    } finally {
      event.target.value = "";
    }
  };


  const handleImportArchiveSpreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "archive",
      normalizeRow: normalizeArchiveSpreadsheetRow,
      expectedColumns: ARCHIVE_EXPECTED_COLUMNS,
    });
  };

  const handleImportMasterSpreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master 2025 booking",
      normalizeRow: normalizeMasterSpreadsheetRow,
      expectedColumns: [
        "Arrival Date",
        "Departure Date",

        "Guest Group Name",
        "Guest Group Type",
        "Returning (R) or New (N)",

        "Contact Person",
        "Contact Person Cell #",

        "Actual # of Adults",
        "Actual # of Minors 3 to 17",
        "Actual # of Minors under 3",
        "Actual # of Day Use Guests",
        "Total # of Guests",

        // Older aliases kept for compatibility.
        "Actual Number of Guests",
        "Actual # of Guests",

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
        "$ Misc",
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


  const handleImportMaster2027Spreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master 2027 booking",
      normalizeRow: normalizeMaster2027SpreadsheetRow,

      expectedColumns: [
        "Arrival Date",
        "Departure Date",
        "Confirmed or Unconfirmed",
        "Guest Group Name",
        "Guest Group Type",
        "Returning (R) or New (N)",
        "Contact Person",
        "Contact Person Cell #",
        "Contact Person Email",
        "Estimated # of Guests",
        "Buildings/Rooms",
        "# of Nights",
        "Meals",
        "Stage of Group",
        "$250 Deposit for 2027 Rec'd?",
        "Food Allergies",
        "Need to know",
        "Linen Sets",
        "Activities",
        "Min. Number of Paying Guests",
        "Max. Number of Paying Guests",
        "Guest Rate",
        "Exp. Minimum Revenue",
        "Schedule",
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
      ],
    });
  };

  const handleImportEverythingSpreadsheet = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileName = String(file.name || "").toLowerCase();

    if (!fileName.endsWith(".xlsx")) {
      alert("Please upload a .xlsx workbook.");

      event.target.value = "";
      return;
    }

    try {
      const fileData = await file.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const allImportedRows = [];
      const sheetSummaries = [];

      const importCounts = {
        "Master 2025": 0,
        "Master 2026": 0,
        "Master 2027": 0,

        "Guest Group Inquiry 2025": 0,
        "Guest Group Inquiry 2026": 0,
        "Guest Group Inquiry 2027": 0,
      };

      workbook.worksheets.forEach((worksheet) => {
        const spreadsheetRows =
          getRowsFromWorksheetFlexible(worksheet);

        /*
          First see whether this is one of the Master sheets.
        */
        const detectedMasterType =
          detectMasterSpreadsheetType(
            worksheet.name,
            spreadsheetRows
          );

        /*
          If it is not Master data, see whether it is one of
          the Guest Group Inquiry / No's sheets.
        */
        const detectedInquiryType =
          detectGuestGroupInquirySpreadsheetType(
            worksheet.name
          );

        const detectedType =
          detectedMasterType ||
          detectedInquiryType;

        /*
          Stuff such as:
          - Staff_Contacts
          - Counts by Group Type
          - Risk Management

          stays untouched.
        */
        if (!detectedType) {
          sheetSummaries.push(
            `${worksheet.name}: skipped — not a recognized Master or Guest Group Inquiry sheet`
          );

          return;
        }

        let importedCount = 0;
        let skippedRowCount = 0;

        spreadsheetRows.forEach((row, index) => {
          const normalizedRow =
            normalizeEverythingSpreadsheetRow(
              row,
              index,
              detectedType
            );

          if (!normalizedRow) {
            skippedRowCount += 1;
            return;
          }

          const sourceRowNumber =
            normalizedRow.sourceRowNumber ||
            row.sourceRowNumber ||
            index + 1;

          const sourceSheet =
            normalizedRow.sourceSheet ||
            row.sourceSheet ||
            worksheet.name;

          allImportedRows.push({
            ...normalizedRow,

            /*
              Stable/repeatable ID so importing the same workbook
              again updates the same records instead of duplicating
              everything.
            */
            id: createWorkbookBulkImportId({
              detectedType,
              sourceSheet,
              sourceRowNumber,
            }),

            sourceType: detectedType,
            detectedImportType: detectedType,

            sourceSheet,
            sourceRowNumber,
          });

          importedCount += 1;
          importCounts[detectedType] += 1;
        });

        sheetSummaries.push(
          `${worksheet.name}: ${importedCount} ${detectedType} row(s) ready, ${skippedRowCount} empty/invalid row(s) skipped`
        );
      });

      if (allImportedRows.length === 0) {
        alert(
          "No recognized Master or Guest Group Inquiry booking rows were found in this workbook."
        );

        return;
      }

      const confirmed = window.confirm(
        `Import booking workbook?\n\n` +

          `MASTER SHEETS\n` +
          `2025 Master: ${importCounts["Master 2025"]} row(s)\n` +
          `2026 Master: ${importCounts["Master 2026"]} row(s)\n` +
          `2027 Master: ${importCounts["Master 2027"]} row(s)\n\n` +

          `GUEST GROUP INQUIRIES / NO'S\n` +
          `2025: ${importCounts["Guest Group Inquiry 2025"]} row(s)\n` +
          `2026: ${importCounts["Guest Group Inquiry 2026"]} row(s)\n` +
          `2027: ${importCounts["Guest Group Inquiry 2027"]} row(s)\n\n` +

          `TOTAL\n` +
          `${allImportedRows.length} row(s)\n\n` +

          `Other worksheet types will be skipped.`
      );

      if (!confirmed) {
        return;
      }

      const savedRows =
        await upsertBookings(allImportedRows);

      setPublicInquiries((currentInquiries) => {
        const byId = new Map();

        currentInquiries.forEach((booking) => {
          byId.set(booking.id, booking);
        });

        savedRows.forEach((booking) => {
          byId.set(booking.id, booking);
        });

        return Array.from(byId.values());
      });

      alert(
        `Workbook import complete.\n\n` +

          `MASTER SHEETS\n` +
          `2025: ${importCounts["Master 2025"]}\n` +
          `2026: ${importCounts["Master 2026"]}\n` +
          `2027: ${importCounts["Master 2027"]}\n\n` +

          `GUEST GROUP INQUIRIES / NO'S\n` +
          `2025: ${importCounts["Guest Group Inquiry 2025"]}\n` +
          `2026: ${importCounts["Guest Group Inquiry 2026"]}\n` +
          `2027: ${importCounts["Guest Group Inquiry 2027"]}\n\n` +

          `Total imported: ${savedRows.length}\n\n` +

          `${sheetSummaries.join("\n")}`
      );
    } catch (error) {
      console.error("Could not import booking workbook:", error);

      alert(
        `Sorry, that booking workbook could not be imported.\n\n` +
          `Error: ${error?.message || String(error)}`
      );
    } finally {
      event.target.value = "";
    }
  };


  const handleImportStaffContactsSpreadsheet = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileData = await file.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const staffWorksheet = workbook.worksheets.find(
        (worksheet) =>
          String(worksheet.name || "").trim().toLowerCase() === "staff_contacts"
      );

      if (!staffWorksheet) {
        alert('No "Staff_Contacts" sheet was found in this workbook.');
        return;
      }

      const importedStaffContacts = [];

      staffWorksheet.eachRow((row, rowNumber) => {
        const nameCell = cleanExcelCellValue(row.getCell(2).value);
        const emailCell = cleanExcelCellValue(row.getCell(3).value);

        const normalizedStaffContact = normalizeStaffContactSpreadsheetRow({
          nameCell,
          emailCell,
          index: rowNumber,
        });

        if (normalizedStaffContact) {
          importedStaffContacts.push(normalizedStaffContact);
        }
      });

      if (importedStaffContacts.length === 0) {
        alert(
          'No valid staff contacts were found. Make sure "Staff_Contacts" has names in column B and emails in column C.'
        );
        return;
      }

      const nextUsers = [...staffUsers];
      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      importedStaffContacts.forEach((importedUser) => {
        const importedNameKey = normalizeStaffName(importedUser.name);
        const importedEmailKey = normalizeStaffEmail(importedUser.email);

        if (!importedNameKey && !importedEmailKey) {
          skippedCount += 1;
          return;
        }

        const existingUserIndex = nextUsers.findIndex((user) => {
          const existingEmailKey = normalizeStaffEmail(user.email);
          const existingNameKey = normalizeStaffName(user.name);

          return (
            (importedEmailKey && existingEmailKey === importedEmailKey) ||
            (importedNameKey && existingNameKey === importedNameKey)
          );
        });

        if (existingUserIndex >= 0) {
          const existingUser = nextUsers[existingUserIndex];

          nextUsers[existingUserIndex] = {
            ...existingUser,
            name: importedUser.name || existingUser.name,
            email: importedUser.email || existingUser.email,
            active: true,
            updatedAt: new Date().toISOString(),
          };

          updatedCount += 1;
          return;
        }

        nextUsers.push(importedUser);
        addedCount += 1;
      });

      saveStaffUsers(nextUsers);
      setStaffUsers(nextUsers);

      if (!currentStaffUserId && nextUsers.length > 0) {
        setCurrentStaffUserId(nextUsers[0].id);
        saveCurrentStaffUserId(nextUsers[0].id);
      }

      alert(
        `Imported staff contacts from Staff_Contacts.\n\nAdded: ${addedCount}\nUpdated: ${updatedCount}\nSkipped: ${skippedCount}`
      );
    } catch (error) {
      console.error("Could not import staff contacts spreadsheet:", error);
      alert("Sorry, that staff contacts spreadsheet could not be imported.");
    } finally {
      event.target.value = "";
    }
  };


  const openArchiveImportPicker = () => {
    setIsImportMenuOpen(false);
    archiveFileInputRef.current?.click();
  };

  const openMasterImportPicker = () => {
    setIsImportMenuOpen(false);
    masterFileInputRef.current?.click();
  };

  const openMaster2026ImportPicker = () => {
    setIsImportMenuOpen(false);
    master2026FileInputRef.current?.click();
  };

  const openMaster2027ImportPicker = () => {
    setIsImportMenuOpen(false);
    master2027FileInputRef.current?.click();
  };


  const openEverythingImportPicker = () => {
    setIsImportMenuOpen(false);
    importEverythingFileInputRef.current?.click();
  };

  const openStaffContactsImportPicker = () => {
    setIsImportMenuOpen(false);
    staffContactsFileInputRef.current?.click();
  };

  useEffect(() => {
    return () => {
      clearSpreadsheetRevealTimers();
    };
  }, []);

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

  useEffect(() => {
    const assignedNames = getAssignedStaffNamesFromBookings(inquiryBookings);

    if (assignedNames.length === 0) {
      return;
    }

    setStaffUsers((currentUsers) => {
      const existingNameSet = new Set(
        currentUsers.map((user) => normalizeStaffName(user.name))
      );

      const newUsers = assignedNames
        .filter((name) => !existingNameSet.has(normalizeStaffName(name)))
        .map((name) => ({
          id: createStaffUserId(),
          name,
          email: "",
          role: "Staff",
          active: true,
        }));

      if (newUsers.length === 0) {
        return currentUsers;
      }

      const nextUsers = [...currentUsers, ...newUsers];

      saveStaffUsers(nextUsers);

      return nextUsers;
    });
  }, [inquiryBookings]);

  useEffect(() => {
    if (currentStaffUserId || staffUsers.length === 0) {
      return;
    }

    const fallbackUserId = staffUsers[0].id;

    setCurrentStaffUserId(fallbackUserId);
    saveCurrentStaffUserId(fallbackUserId);
  }, [currentStaffUserId, staffUsers]);

  const inquiryPipelineNeedsReviewCount = useMemo(() => {
    return inquiryBookings.filter((booking) => {
      const columnKey = getInquiryPipelineColumnKey(booking);

      return columnKey === "newInquiry" || columnKey === "needsReview";
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
    clearSpreadsheetRevealTimers();

    if (nextView === SPREADSHEET_VIEW_NAME) {
      setHasOpenedSpreadsheetView(true);
      setIsSpreadsheetRevealLoading(true);

      spreadsheetRevealFrameRef.current = window.requestAnimationFrame(() => {
        spreadsheetRevealSecondFrameRef.current = window.requestAnimationFrame(() => {
          spreadsheetRevealTimerRef.current = window.setTimeout(() => {
            setIsSpreadsheetRevealLoading(false);
          }, SPREADSHEET_REVEAL_LOADING_MS);
        });
      });
    } else {
      setIsSpreadsheetRevealLoading(false);
    }

    if (nextView !== "Form") {
      loadBookingsFromSupabase();
    }

    setActiveView(nextView);
  };

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

        <div className="dashboard-sidebar-signout">
          <StaffSignOutButton />
        </div>

        <div className="sidebar-section sidebar-main-section">
          <p>Main</p>

          <button
            className={`sidebar-link ${
              activeView === "Dashboard" ? "sidebar-link-active" : ""
            }`}
            type="button"
            title="Dashboard"
            onClick={() => {
              setSelectedBooking(null);
              setBookingDetailTab("Overview");
              handleActiveViewChange("Dashboard");
            }}
          >
            <FaHome />
            <span>Dashboard</span>
          </button>

          <button
            className={`sidebar-link ${
              activeView === "Form" ? "sidebar-link-active" : ""
            }`}
            type="button"
            title="Form"
            onClick={() => {
              setSelectedBooking(null);
              setBookingDetailTab("Overview");
              handleActiveViewChange("Form");
            }}
          >
            <FaClipboardList />
            <span>Form</span>
          </button>

          <button
            className={`sidebar-link ${
              activeView === "Portal View" ? "sidebar-link-active" : ""
            }`}
            type="button"
            title="Portals"
            onClick={() => {
              setSelectedBooking(null);
              setBookingDetailTab("Overview");
              handleActiveViewChange("Portal View");
            }}
          >
            <FaKey />
            <span>Portals</span>
          </button>

        </div>

        {sidebarSections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  className={`sidebar-link ${
                    activeView === item.label ? "sidebar-link-active" : ""
                  }`}
                  key={item.label}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    setSelectedBooking(null);
                    setBookingDetailTab("Overview");
                    handleActiveViewChange(item.label);
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
          <>
            <DashboardTopbar
              activeView={activeView}
              masterFileInputRef={masterFileInputRef}
              staffContactsFileInputRef={staffContactsFileInputRef}
              master2026FileInputRef={master2026FileInputRef}
              master2027FileInputRef={master2027FileInputRef}
              importEverythingFileInputRef={importEverythingFileInputRef}
              importDropdownRef={importDropdownRef}
              isImportMenuOpen={isImportMenuOpen}
              setIsImportMenuOpen={setIsImportMenuOpen}
              handleImportMasterSpreadsheet={handleImportMasterSpreadsheet}
              handleImportMaster2026Spreadsheet={handleImportMaster2026Spreadsheet}
              handleImportMaster2027Spreadsheet={handleImportMaster2027Spreadsheet}
              handleImportEverythingSpreadsheet={handleImportEverythingSpreadsheet}
              openMasterImportPicker={openMasterImportPicker}
              openMaster2026ImportPicker={openMaster2026ImportPicker}
              openMaster2027ImportPicker={openMaster2027ImportPicker}
              openEverythingImportPicker={openEverythingImportPicker}
              exportInquiriesToSpreadsheet={exportInquiriesToSpreadsheet}
              refreshInquiries={refreshInquiries}
              deleteAllInquiries={deleteAllInquiries}
              handleImportStaffContactsSpreadsheet={handleImportStaffContactsSpreadsheet}
              openStaffContactsImportPicker={openStaffContactsImportPicker}
              archiveFileInputRef={archiveFileInputRef}
              handleImportArchiveSpreadsheet={handleImportArchiveSpreadsheet}
              openArchiveImportPicker={openArchiveImportPicker}
            />

            <DashboardBackups
              onRestoreComplete={() => {
                setSelectedBooking(null);
                setBookingDetailTab("Overview");
                setActiveView("Dashboard");
              }}
            />

          </>
        )}

        {activeView === SPREADSHEET_VIEW_NAME && isSpreadsheetRevealLoading && (
          <SpreadsheetViewLoadingScreen rowCount={inquiryBookings.length} />
        )}


        {hasOpenedSpreadsheetView && (
          <section
            className={`dashboard-keepalive-view ${
              activeView === SPREADSHEET_VIEW_NAME && !isSpreadsheetRevealLoading
                ? "dashboard-keepalive-view-active"
                : ""
            }`}
            aria-hidden={
              activeView !== SPREADSHEET_VIEW_NAME || isSpreadsheetRevealLoading
            }
          >
            <SpreadsheetView
              inquiryBookings={inquiryBookings}
              openBookingDetail={openBookingDetail}
              isLoading={false}
            />
          </section>
        )}
        

        {activeView === "Form" ? (
          <section className="dashboard-form-view">
            <CreateBooking />
          </section>
        ) : activeView === "Booking Detail" ? (
          isGuestGroupInquiryRecord(selectedBooking) ? (
            <InquiryRecordDetailView
              booking={selectedBooking}
              onBack={() => {
                setSelectedBooking(null);
                setActiveView(INQUIRY_SPREADSHEET_VIEW_NAME);
              }}
            />
          ) : (
            <BookingDetailView
              booking={selectedBooking}
              activeTab={bookingDetailTab}
              setActiveTab={setBookingDetailTab}
              onSaveBooking={saveBookingEdits}
              staffUsers={staffUsers}
              currentStaffUserId={currentStaffUserId}
              onBack={() => {
                setSelectedBooking(null);
                setActiveView(SPREADSHEET_VIEW_NAME);
              }}
            />
          )
        ) : activeView === "Calendar View" ? (
          <CalendarView
            calendarCells={calendarCells}
            datedInquiries={datedInquiries}
            selectedMonthInquiries={selectedMonthInquiries}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            setSelectedMonth={setSelectedMonth}
            setSelectedYear={setSelectedYear}
            goToCurrentMonth={goToCurrentMonth}
            goToPreviousMonth={goToPreviousMonth}
            goToNextMonth={goToNextMonth}
            getCalendarEventColor={getCalendarEventColor}
          />
        ) : activeView === SPREADSHEET_VIEW_NAME ? null : activeView === INQUIRY_SPREADSHEET_VIEW_NAME ? (
                <InquirySpreadsheetView
                  inquiryBookings={inquiryBookings}
                  openBookingDetail={openBookingDetail}
                />
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
        ) : activeView === "Portal View" ? (
          <PortalAdminView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openBookingDetail}
          />
        ) : activeView === "User Admin" ? (
          <UserAdminView
            staffUsers={staffUsers}
            setStaffUsers={setStaffUsers}
            currentStaffUserId={currentStaffUserId}
            setCurrentStaffUserId={setCurrentStaffUserId}
          />
        ) : activeView === "Jobs" ? (
          <JobsView
            inquiryBookings={inquiryBookings}
            staffUsers={staffUsers}
            currentStaffUserId={currentStaffUserId}
            openBookingDetail={openBookingDetail}
          />
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