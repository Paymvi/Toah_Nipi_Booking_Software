import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  FaHome,
  FaCalendarAlt,
  FaClipboardList,
  FaPlus,
  FaTable,
  FaSyncAlt,
  FaRegCalendarCheck,
  FaExclamationTriangle,
  FaTicketAlt,
  FaFileImport,
  FaFileExport,
  FaTrashAlt,
  FaChevronDown,
  FaClock,
  FaMapMarkedAlt,
  FaBed,
  FaHiking,
  FaEnvelopeOpenText,
  FaInfoCircle,
  FaFilter,
  FaPaperPlane,
  FaKey,
  FaTimes,
} from "react-icons/fa";
import ExcelJS from "exceljs";
import BookingHousingTab from "../components/BookingHousingTab";

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
  addDays,
  daysBetween,
  maxDate,
  minDate,
  datesOverlap,
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
    `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
    inquiry.contactName ||
    inquiry.name ||
    "No contact name";

  return {
    id: inquiry.id || `${inquiry.submittedAt || "inquiry"}-${index}`,
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


function getCalendarWeeks(calendarCells) {
  const weeks = [];

  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7));
  }

  return weeks;
}


function getWeekEventSegments({
  weekIndex,
  datedInquiries,
  selectedYear,
  selectedMonth,
}) {
  const firstDayOffset = new Date(selectedYear, selectedMonth, 1).getDay();

  const weekStart = new Date(
    selectedYear,
    selectedMonth,
    1 - firstDayOffset + weekIndex * 7
  );

  const weekEnd = addDays(weekStart, 6);

  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);

  const rawSegments = datedInquiries
    .map((inquiry) => {
      const eventStart = getLocalDate(inquiry.startDate);
      const eventEnd = inquiry.endDate
        ? getLocalDate(inquiry.endDate)
        : eventStart;

      if (!eventStart || !eventEnd) {
        return null;
      }

      if (!datesOverlap(eventStart, eventEnd, weekStart, weekEnd)) {
        return null;
      }

      if (!datesOverlap(eventStart, eventEnd, monthStart, monthEnd)) {
        return null;
      }

      const segmentStart = maxDate(eventStart, weekStart, monthStart);
      const segmentEnd = minDate(eventEnd, weekEnd, monthEnd);

      const startColumn = segmentStart.getDay() + 1;
      const spanDays = daysBetween(segmentStart, segmentEnd) + 1;

      return {
        inquiry,
        segmentStart,
        segmentEnd,
        startColumn,
        spanDays,
        endColumn: startColumn + spanDays - 1,
        startsHere: segmentStart.getTime() === eventStart.getTime(),
        endsHere: segmentEnd.getTime() === eventEnd.getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.segmentStart.getTime() !== b.segmentStart.getTime()) {
        return a.segmentStart - b.segmentStart;
      }

      return b.spanDays - a.spanDays;
    });

  const laneEndColumns = [];

  return rawSegments.map((segment) => {
    const existingLaneIndex = laneEndColumns.findIndex(
      (endColumn) => segment.startColumn > endColumn
    );

    const lane =
      existingLaneIndex === -1 ? laneEndColumns.length : existingLaneIndex;

    laneEndColumns[lane] = segment.endColumn;

    return {
      ...segment,
      lane,
    };
  });
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

function BookingCalendar({
    calendarCells,
    datedInquiries,
    selectedYear,
    selectedMonth,
    getCalendarEventColor,
    isLarge = false,
  }) {
    const calendarWeeks = getCalendarWeeks(calendarCells);

    return (
      <div
        className={`calendar-grid-span-mode ${
          isLarge ? "calendar-grid-large" : "calendar-grid-preview-span"
        }`}
      >
        {["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((day) => (
          <div className="calendar-weekday" key={day}>
            {day}
          </div>
        ))}

        {calendarWeeks.map((week, weekIndex) => {
          const weekSegments = getWeekEventSegments({
            weekIndex,
            datedInquiries,
            selectedYear,
            selectedMonth,
          });

          const eventRowCount =
            weekSegments.length > 0
              ? Math.max(...weekSegments.map((segment) => segment.lane)) + 1
              : 1;

          return (
            <div
              className={`calendar-week-row ${
                isLarge ? "calendar-week-row-large" : "calendar-week-row-preview"
              }`}
              key={`week-${weekIndex}`}
              style={{
                "--calendar-event-row-count": eventRowCount,
              }}
            >
              {week.map((day, dayIndex) => (
                <div
                  className={`calendar-cell ${
                    isLarge ? "calendar-cell-large" : ""
                  } ${!day ? "calendar-cell-empty" : ""}`}
                  key={`week-${weekIndex}-day-${dayIndex}`}
                  style={{
                    gridColumn: dayIndex + 1,
                  }}
                >
                  {day && <span className="calendar-day-number">{day}</span>}
                </div>
              ))}

              {weekSegments.map((segment) => {
                const colorClass = getCalendarEventColor(segment.inquiry.status);

                return (
                  <div
                    className={`calendar-span-event ${
                      isLarge
                        ? "calendar-span-event-large"
                        : "calendar-span-event-preview"
                    } ${colorClass} ${
                      segment.startsHere
                        ? "calendar-span-start"
                        : "calendar-span-continues-before"
                    } ${
                      segment.endsHere
                        ? "calendar-span-end"
                        : "calendar-span-continues-after"
                    }`}
                    key={`${segment.inquiry.id}-week-${weekIndex}`}
                    tabIndex={0}
                    aria-label={`${segment.inquiry.organizationName}, ${
                      segment.inquiry.status
                    }, ${formatDateRange(segment.inquiry.startDate, segment.inquiry.endDate)}`}
                    style={{
                      "--event-start-column": segment.startColumn,
                      "--event-span-days": segment.spanDays,
                      "--event-lane": segment.lane,
                    }}
                  >
                    <span>{segment.inquiry.organizationName}</span>
                    <i />

                    <div
                      className={`calendar-event-tooltip ${
                        segment.startColumn >= 5 ? "calendar-tooltip-align-right" : ""
                      }`}
                    >
                      <div className="calendar-tooltip-header">
                        <strong>{segment.inquiry.organizationName}</strong>
                        <span className={`calendar-tooltip-status ${colorClass}`}>
                          {segment.inquiry.status}
                        </span>
                      </div>

                      <p>{formatDateRange(segment.inquiry.startDate, segment.inquiry.endDate)}</p>

                      <dl>
                        <div>
                          <dt>Type</dt>
                          <dd>{segment.inquiry.retreatType || "No retreat type"}</dd>
                        </div>

                        <div>
                          <dt>Guests</dt>
                          <dd>{segment.inquiry.attendeeCount || "No group size"}</dd>
                        </div>

                        <div>
                          <dt>Contact</dt>
                          <dd>{segment.inquiry.contactName || "No contact name"}</dd>
                        </div>

                        <div>
                          <dt>Room</dt>
                          <dd>{segment.inquiry.roomName || "Unassigned"}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
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



function BookingDetailView({
  booking,
  activeTab,
  setActiveTab,
  onBack,
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

  return (
    <section className="booking-detail-page">
      <div className="booking-detail-top">
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onBack}
        >
          ← Back
        </button>

        <div>
          <h2>{booking.organizationName}</h2>
          <p>
            {formatDateRange(booking.startDate, booking.endDate)}
            {booking.attendeeCount ? ` (${booking.attendeeCount} attendees)` : ""}
          </p>
        </div>

        <span className={`booking-detail-status ${booking.status === "Confirmed" ? "status-confirmed" : "status-inquiry"}`}>
          {booking.status}
        </span>
      </div>

      <nav className="booking-detail-tabs" aria-label="Booking detail tabs">
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
        <div className="booking-detail-grid">
          <article className="booking-detail-card booking-overview-card">
            <div className="booking-card-heading">
              <h3>{booking.organizationName}</h3>
              <span>{booking.status}</span>
            </div>

            <div className="booking-info-grid">
              <div>
                <small>Contact</small>
                <strong>{booking.contactName || "No contact name"}</strong>
              </div>

              <div>
                <small>Organization</small>
                <strong>{booking.organizationName}</strong>
              </div>

              <div>
                <small>Arrival</small>
                <strong>{formatDate(booking.startDate)}</strong>
              </div>

              <div>
                <small>Departure</small>
                <strong>{formatDate(booking.endDate)}</strong>
              </div>

              <div>
                <small>Program Type</small>
                <strong>{booking.retreatType || "—"}</strong>
              </div>

              <div>
                <small>Attendees</small>
                <strong>{booking.attendeeCount || "—"}</strong>
              </div>
            </div>
          </article>

          <article className="booking-detail-card">
            <h3>Financials</h3>

            <div className="booking-financial-grid">
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
          </article>

          <div className="booking-detail-three-card-row">
            <article className="booking-detail-card">
              <div className="booking-card-heading">
                <h3>Contracts</h3>
                <span>{booking.status === "Confirmed" ? "Viewed" : "Pending"}</span>
              </div>

              <div className="booking-info-stack">
                <div>
                  <small>Source</small>
                  <strong>{booking.sourceType || "Form"}</strong>
                </div>

                <div>
                  <small>Submitted</small>
                  <strong>{formatSubmittedDate(booking.submittedAt)}</strong>
                </div>

                <div>
                  <small>Waitlist</small>
                  <strong>{booking.waitlist || "No"}</strong>
                </div>
              </div>
            </article>

            <article className="booking-detail-card">
              <h3>Housing</h3>

              <div className="booking-info-stack">
                <div>
                  <small>Assigned Room / Area</small>
                  <strong>{booking.roomName || "Unassigned"}</strong>
                </div>

                <div>
                  <small>Buildings / Rooms</small>
                  <strong>{booking.buildingsRooms || "—"}</strong>
                </div>

                <div>
                  <small>Linen Sets</small>
                  <strong>{booking.linenSets || "—"}</strong>
                </div>
              </div>
            </article>

            <article className="booking-detail-card">
              <div className="booking-card-heading">
                <h3>Activities</h3>
                <button className="table-link" type="button">
                  Schedule
                </button>
              </div>

              <div className="booking-info-stack">
                <div>
                  <small>Meals</small>
                  <strong>{booking.meals || "—"}</strong>
                </div>

                <div>
                  <small># Meals</small>
                  <strong>{booking.mealCount || "—"}</strong>
                </div>

                <div>
                  <small>Activities</small>
                  <strong>{booking.activities || "—"}</strong>
                </div>

                <div>
                  <small>Food Allergies</small>
                  <strong>{booking.foodAllergies || "—"}</strong>
                </div>
              </div>
            </article>
          </div>

          <BookingContactsSection booking={booking} />

          <article className="booking-detail-card booking-notes-card">
            <h3>Need to Know</h3>
            <p>{booking.needToKnow || booking.notes || "No notes added yet."}</p>
          </article>
        </div>
      )}

      {activeTab === "Housing" && <BookingHousingTab booking={booking} />}
        {activeTab !== "Overview" && activeTab !== "Housing" && (
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
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-logo">
          <span>TN</span>

          <div>
            <strong>Toah Nipi</strong>
            <small>Staff Dashboard</small>
          </div>
        </div>

        <button
          className={
            activeView === "Dashboard" ? "sidebar-active-button" : "sidebar-link"
          }
          type="button"
          onClick={() => setActiveView("Dashboard")}
        >
          <FaHome />
          Dashboard
        </button>

        {sidebarSections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;
              const isCalendarView = item.label === "Calendar View";

              return (
                <button
                  className={`sidebar-link ${
                    activeView === item.label ? "sidebar-link-active" : ""
                  }`}
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (isCalendarView) {
                      setActiveView("Calendar View");
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
        <header className="dashboard-topbar">
          <div>
            <p className="dashboard-eyebrow">Internal Booking Software</p>
            <h1>{activeView}</h1>
          </div>

          <div className="dashboard-actions">
            <input
              className="dashboard-file-input"
              ref={waitlistFileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportWaitlistSpreadsheet}
            />

            <input
              className="dashboard-file-input"
              ref={importEverythingFileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportEverythingSpreadsheet}
            />

            <input
              className="dashboard-file-input"
              ref={masterFileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportMasterSpreadsheet}
            />
            <input
              className="dashboard-file-input"
              ref={master2026FileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportMaster2026Spreadsheet}
            />

            <div className="import-dropdown" ref={importDropdownRef}>
              <button
                className={`secondary-dashboard-button import-dropdown-button ${
                  isImportMenuOpen ? "is-open" : ""
                }`}
                type="button"
                onClick={() => setIsImportMenuOpen((currentValue) => !currentValue)}
                aria-haspopup="menu"
                aria-expanded={isImportMenuOpen}
              >
                <FaFileImport />
                Import
                <FaChevronDown className="import-dropdown-caret" />
              </button>

              {isImportMenuOpen && (
                <div className="import-dropdown-menu" role="menu">
                  <button type="button" role="menuitem" onClick={openWaitlistImportPicker}>
                    <FaClipboardList />
                    <span>
                      <strong>Import Waitlist</strong>
                      <small>Upload waitlist spreadsheet</small>
                    </span>
                  </button>

                  <button type="button" role="menuitem" onClick={openMasterImportPicker}>
                    <FaTable />
                    <span>
                      <strong>Import Master 2025</strong>
                      <small>Upload master booking spreadsheet</small>
                    </span>
                  </button>

                  <button type="button" role="menuitem" onClick={openMaster2026ImportPicker}>
                    <FaRegCalendarCheck />
                    <span>
                      <strong>Import Master 2026</strong>
                      <small>Upload 2026 master booking spreadsheet</small>
                    </span>
                  </button>

                  <button type="button" role="menuitem" onClick={openEverythingImportPicker}>
                    <FaFileImport />
                    <span>
                      <strong>Import Everything</strong>
                      <small>Auto-detect every sheet in workbook</small>
                    </span>
                  </button>
                </div>
              )}
            </div>

            <button
              className="secondary-dashboard-button"
              type="button"
              onClick={exportInquiriesToSpreadsheet}
            >
              <FaFileExport />
              Export Excel
            </button>

            <button
              className="primary-dashboard-button"
              type="button"
              onClick={refreshInquiries}
            >
              <FaSyncAlt />
              Refresh Inquiries
            </button>

            <button
              className="danger-dashboard-button"
              type="button"
              onClick={deleteAllInquiries}
            >
              <FaTrashAlt />
                Delete All
            </button>

          </div>

          
        </header>

        {activeView === "Booking Detail" ? (
          <BookingDetailView
            booking={selectedBooking}
            activeTab={bookingDetailTab}
            setActiveTab={setBookingDetailTab}
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
                <div className="inquiry-list">
                  {recentInquiries.map((inquiry) => (
                    <div className="inquiry-card inquiry-card-with-icon" key={inquiry.id}>
                      <span className="inquiry-card-icon">
                        <FaEnvelopeOpenText />
                      </span>

                      <div className="inquiry-card-content">
                        <div>
                          <button
                            className="booking-card-title-button"
                            type="button"
                            onClick={() => openBookingDetail(inquiry)}
                          >
                            {inquiry.organizationName}
                          </button>
                          <span>{inquiry.contactName}</span>
                        </div>

                        <p>
                          {inquiry.retreatType || "Retreat type not selected"} ·{" "}
                          {inquiry.attendeeCount || "No group size yet"}
                        </p>

                        <small>
                          {formatDateRange(inquiry.startDate, inquiry.endDate)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No public inquiries yet</strong>
                  <p>
                    Once someone submits the public form, their inquiry will
                    appear here.
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