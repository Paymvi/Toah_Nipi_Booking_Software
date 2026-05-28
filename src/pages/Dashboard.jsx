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
} from "react-icons/fa";
import ExcelJS from "exceljs";
import BookingHousingTab from "../components/BookingHousingTab";
import DashboardTopbar from "../components/DashboardTopbar";
import BookingCalendar from "../components/BookingCalendar";
import BookingActivities from "../components/BookingActivities";

import {
  monthNames,
  sidebarSections,
  activityLocations,
  defaultRoomRows,
  bookingDetailTabs,
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

function BookingDetailView({
  booking,
  activeTab,
  setActiveTab,
  onBack,
  onSaveBooking,
}) {
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

  const dateSummary = formatDateRange(booking.startDate, booking.endDate);
  const submittedDate = formatSubmittedDate(booking.submittedAt);
  const arrivalDate = formatDate(booking.startDate);
  const departureDate = formatDate(booking.endDate);

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

        <span className={`booking-profile-status ${statusClass}`}>
          {booking.status}
        </span>
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

{activeTab !== "Overview" &&
  activeTab !== "Details" &&
  activeTab !== "Housing" &&
  activeTab !== "Activities" && (
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
    return "Imported — Master 2026";
  }

  if (sourceType === "Master") {
    return "Imported — Master";
  }

  if (sourceType === "Waitlist") {
    return "Imported — Waitlist";
  }

  if (detectedImportType) {
    return `Imported — ${detectedImportType}`;
  }

  return `Imported — ${sourceType}`;
}

function getSpreadsheetDisplayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
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
        className={`spreadsheet-source-pill ${
          booking.sourceType === "Form" ? "source-form" : "source-imported"
        }`}
      >
        {getBookingInputMethod(booking)}
      </span>
    ),
  },
  {
    label: "Source Type",
    value: (booking) => booking.sourceType || "Form",
  },
  {
    label: "Source Sheet",
    value: (booking) => booking.sourceSheet,
  },
  {
    label: "Source Row",
    value: (booking) => booking.sourceRowNumber,
  },
  {
    label: "Status",
    value: (booking) => booking.status,
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
    value: (booking) => formatDateRange(booking.startDate, booking.endDate),
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
    value: (booking) => booking.waitlist,
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

function BookingSpreadsheetView({ inquiryBookings, openBookingDetail }) {
  const rawSpreadsheetColumns = useMemo(
    () => getRawSpreadsheetColumns(inquiryBookings),
    [inquiryBookings]
  );

  const formCount = inquiryBookings.filter(
    (booking) => booking.sourceType === "Form"
  ).length;

  const importedCount = inquiryBookings.length - formCount;

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
                A full spreadsheet-style view of every form submission and
                imported booking row.
              </p>
            </div>
          </div>

          <div className="spreadsheet-view-summary">
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
              <strong>{rawSpreadsheetColumns.length}</strong>
              Original Columns
            </span>
          </div>
        </div>

        {inquiryBookings.length > 0 ? (
          <div className="spreadsheet-table-wrap">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  {bookingSpreadsheetColumns.map((column) => (
                    <th className={column.className || ""} key={column.label}>
                      {column.label}
                    </th>
                  ))}

                  {rawSpreadsheetColumns.map((columnName) => (
                    <th key={`raw-header-${columnName}`}>
                      Original: {columnName}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {inquiryBookings.map((booking) => (
                  <tr key={booking.id}>
                    {bookingSpreadsheetColumns.map((column) => (
                      <td className={column.className || ""} key={column.label}>
                        {column.render
                          ? column.render(booking, openBookingDetail)
                          : getSpreadsheetDisplayValue(column.value(booking))}
                      </td>
                    ))}

                    {rawSpreadsheetColumns.map((columnName) => (
                      <td key={`${booking.id}-raw-${columnName}`}>
                        {getSpreadsheetDisplayValue(
                          booking.rawSpreadsheetData?.[columnName]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingDetailTab, setBookingDetailTab] = useState("Overview");

  const [isSubmittedInquiriesOpen, setIsSubmittedInquiriesOpen] = useState(true);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);

  const [publicInquiries, setPublicInquiries] = useState(() =>
    getSavedInquiries()
  );

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

  const inquiryBookings = useMemo(() => {
    return publicInquiries.map((inquiry, index) =>
      normalizeInquiry(inquiry, index)
    );
  }, [publicInquiries]);

  const calendarCells = getCalendarCells(selectedYear, selectedMonth);

  const datedInquiries = useMemo(() => {
    return inquiryBookings
      .filter((inquiry) => inquiry.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [inquiryBookings]);

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

        <button
          className={
            activeView === "Dashboard" ? "sidebar-active-button" : "sidebar-link"
          }
          type="button"
          onClick={() => setActiveView("Dashboard")}
          title="Dashboard"
        >
          <FaHome />
          <span>Dashboard</span>
        </button>

        {sidebarSections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;
              const isCalendarView = item.label === "Calendar View";
              const isSpreadsheetView = item.label === "Spreadsheet View";
              return (
                <button
                  className={`sidebar-link ${
                    activeView === item.label ? "sidebar-link-active" : ""
                  }`}
                  key={item.label}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    if (isCalendarView || isSpreadsheetView) {
                      setActiveView(item.label);
                    }
                  }}
                >
                  <Icon />
                  <span>{item.label}</span>

                  {item.hasBadge && inquiryBookings.length > 0 && (
                    <strong className="sidebar-badge">
                      {inquiryBookings.length}
                    </strong>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <section className="dashboard-main">

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
        

        {activeView === "Booking Detail" ? (
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
          <BookingSpreadsheetView
            inquiryBookings={inquiryBookings}
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

        <section className="dashboard-card tasks-card">
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
                          <td>{inquiry.email}</td>
                          <td>{inquiry.phone}</td>
                          <td>{formatDateRange(inquiry.startDate, inquiry.endDate)}</td>
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
        </section>

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
            <article className="dashboard-card">
              <div className="dashboard-card-header">
                <div className="dashboard-heading-with-icon">
                  <span className="section-icon">
                    <FaClock />
                  </span>

                  <div>
                    <h2>Dated Inquiries</h2>
                    <p>Submissions with start dates, sorted by date.</p>
                  </div>
                </div>
              </div>

              {datedInquiries.length > 0 ? (
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table compact-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Dates</th>
                        <th>Type</th>
                      </tr>
                    </thead>

                    <tbody>
                      {datedInquiries.map((inquiry) => (
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
                          <td>
                            {formatDateRange(
                              inquiry.startDate,
                              inquiry.endDate
                            )}
                          </td>
                          <td>{inquiry.retreatType || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No dated inquiries yet</strong>
                  <p>
                    Inquiries will appear here once the form includes a start
                    date.
                  </p>
                </div>
              )}
            </article>

            <article className="dashboard-card">
              <div className="dashboard-card-header">
                <div className="dashboard-heading-with-icon">
                  <span className="section-icon">
                    <FaEnvelopeOpenText />
                  </span>

                  <div>
                    <h2>Recent Booking Inquiries</h2>
                    <p>Newest submissions from the public form.</p>
                  </div>
                </div>
              </div>

              {recentInquiries.length > 0 ? (
                <div className="recent-inquiries-list">
                  {recentInquiries.map((inquiry) => {
                    const organizationName =
                      inquiry.organizationName || "Unnamed Organization";

                    const contactName =
                      inquiry.contactName && inquiry.contactName !== "No contact name"
                        ? inquiry.contactName
                        : "";

                    const displayName = contactName || organizationName;

                    const guestCount = String(inquiry.attendeeCount || "").trim();

                    const guestLabel = guestCount
                      ? `${guestCount} guest${guestCount === "1" ? "" : "s"}`
                      : "No group size";

                    return (
                      <button
                        className="recent-booking-card"
                        key={inquiry.id}
                        type="button"
                        onClick={() => openBookingDetail(inquiry)}
                      >
                        <span className="recent-booking-icon">
                          <FaEnvelopeOpenText />
                        </span>

                        <span className="recent-booking-main">
                          <strong>{displayName}</strong>

                          <small>
                            {inquiry.retreatType || "No retreat type"}
                            <span aria-hidden="true">·</span>
                            {guestLabel}
                          </small>
                        </span>

                        <span className="recent-booking-date">
                          {formatDateRange(inquiry.startDate, inquiry.endDate)}
                        </span>

                        <span className="recent-booking-arrow" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No public inquiries yet</strong>
                  <p>
                    Once someone submits the public form, their inquiry will appear here.
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