import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaHome,
  FaBuilding,
  FaUsers,
  FaCalendarAlt,
  FaClipboardList,
  FaPlus,
  FaChartBar,
  FaCog,
  FaUserShield,
  FaTable,
  FaSyncAlt,
} from "react-icons/fa";
import ExcelJS from "exceljs";


const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const sidebarSections = [
  {
    label: "Contacts",
    items: [
      { label: "Organizations", icon: FaBuilding },
      { label: "Individuals", icon: FaUsers },
    ],
  },
  {
    label: "Rentals & Events",
    items: [
      { label: "Calendar View", icon: FaCalendarAlt },
      { label: "Booking Inquiries", icon: FaClipboardList, hasBadge: true },
      { label: "Add New Booking", icon: FaPlus },
    ],
  },
  {
    label: "Reporting",
    items: [{ label: "Reports", icon: FaChartBar }],
  },
  {
    label: "Administration",
    items: [
      { label: "Setup", icon: FaCog },
      { label: "User Administration", icon: FaUserShield },
      { label: "Custom Fields", icon: FaTable },
    ],
  },
];

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

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubmittedDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(startDate, endDate) {
  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  if (startDate) {
    return formatDate(startDate);
  }

  if (endDate) {
    return `Ends ${formatDate(endDate)}`;
  }

  return "No dates selected";
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
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
  };
}

function readSpreadsheetCell(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }

  return "";
}

function cleanExcelCellValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    if (value.text) {
      return value.text;
    }

    if (value.result) {
      return value.result;
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }
  }

  return value;
}

function formatExcelDateValue(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);

    return date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (slashMatch) {
    let [, month, day, year] = slashMatch;

    if (year.length === 2) {
      year = `20${year}`;
    }

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const date = new Date(text);

  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "";
}

function formatExcelSubmittedAt(value) {
  const dateOnly = formatExcelDateValue(value);

  if (!dateOnly) {
    return new Date().toISOString();
  }

  return `${dateOnly}T00:00:00`;
}

function parseDesiredDateRange(value) {
  if (value instanceof Date || typeof value === "number") {
    const singleDate = formatExcelDateValue(value);

    return {
      startDate: singleDate,
      endDate: singleDate,
      desiredDatesText: singleDate,
    };
  }

  const desiredDateText = String(value || "").trim();

  if (!desiredDateText) {
    return {
      startDate: "",
      endDate: "",
      desiredDatesText: "",
    };
  }

  const dateMatches =
    desiredDateText.match(
      /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/g
    ) || [];

  const startDate = formatExcelDateValue(dateMatches[0]);
  const endDate = formatExcelDateValue(dateMatches[1]);

  return {
    startDate,
    endDate: endDate || startDate,
    desiredDatesText: desiredDateText,
  };
}

function normalizeWaitlistValue(value) {
  const text = String(value || "").trim().toLowerCase();

  if (["yes", "y", "true", "waitlist", "waitlisted"].includes(text)) {
    return "Yes";
  }

  return "No";
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


function getCalendarWeeks(calendarCells) {
  const weeks = [];

  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7));
  }

  return weeks;
}

function getLocalDate(dateString) {
  if (!dateString) {
    return null;
  }

  return new Date(`${dateString}T00:00:00`);
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function daysBetween(startDate, endDate) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate - startDate) / oneDay);
}

function maxDate(...dates) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function minDate(...dates) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
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


function BookingCalendar({
  calendarCells,
  datedInquiries,
  selectedYear,
  selectedMonth,
  getCalendarEventColor,
  isLarge = false,
}) {
  const maxVisibleEvents = 2;

  if (isLarge) {
    const calendarWeeks = getCalendarWeeks(calendarCells);

    return (
      <div className="calendar-grid-large calendar-grid-span-mode">
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
              className="calendar-week-row"
              key={`week-${weekIndex}`}
              style={{
                "--calendar-event-row-count": eventRowCount,
              }}
            >
              {week.map((day, dayIndex) => (
                <div
                  className={`calendar-cell calendar-cell-large ${
                    !day ? "calendar-cell-empty" : ""
                  }`}
                  key={`week-${weekIndex}-day-${dayIndex}`}
                  style={{
                    gridColumn: dayIndex + 1,
                  }}
                >
                  {day && <span className="calendar-day-number">{day}</span>}
                </div>
              ))}

              {weekSegments.map((segment) => {
                const colorClass = getCalendarEventColor(
                  segment.inquiry.status
                );

                return (
                  <div
                    className={`calendar-span-event ${colorClass} ${
                      segment.startsHere ? "calendar-span-start" : "calendar-span-continues-before"
                    } ${
                      segment.endsHere ? "calendar-span-end" : "calendar-span-continues-after"
                    }`}
                    key={`${segment.inquiry.id}-week-${weekIndex}`}
                    title={`${segment.inquiry.organizationName} — ${formatDateRange(
                      segment.inquiry.startDate,
                      segment.inquiry.endDate
                    )}`}
                    style={{
                      "--event-start-column": segment.startColumn,
                      "--event-span-days": segment.spanDays,
                      "--event-lane": segment.lane,
                    }}
                  >
                    <span>{segment.inquiry.organizationName}</span>
                    <i />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="calendar-grid">
      {["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((day) => (
        <div className="calendar-weekday" key={day}>
          {day}
        </div>
      ))}

      {calendarCells.map((day, index) => {
        const inquiriesForDay = day
          ? datedInquiries.filter((inquiry) =>
              inquiryTouchesDay(inquiry, selectedYear, selectedMonth, day)
            )
          : [];

        return (
          <div
            className={`calendar-cell ${!day ? "calendar-cell-empty" : ""}`}
            key={`${day}-${index}`}
          >
            {day && <span className="calendar-day-number">{day}</span>}

            <div className="calendar-events">
              {inquiriesForDay.slice(0, maxVisibleEvents).map((inquiry) => (
                <div
                  className={`calendar-event ${getCalendarEventColor(
                    inquiry.status
                  )}`}
                  key={inquiry.id}
                  title={`${inquiry.organizationName} — ${inquiry.status}`}
                >
                  <span>{inquiry.organizationName}</span>
                  <i />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const today = new Date();

  const waitlistFileInputRef = useRef(null);
  const masterFileInputRef = useRef(null);

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [activeView, setActiveView] = useState("Dashboard");

  const [isSubmittedInquiriesOpen, setIsSubmittedInquiriesOpen] = useState(true);

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

  useEffect(() => {
    const handleStorageChange = () => {
      refreshInquiries();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

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
    if (status === "Confirmed") return "calendar-event-green";
    if (status === "Contract Sent") return "calendar-event-blue";
    if (status === "Inquiry") return "calendar-event-gold";

    return "calendar-event-purple";
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
              ref={masterFileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportMasterSpreadsheet}
            />

            <button
              className="secondary-dashboard-button"
              type="button"
              onClick={() => waitlistFileInputRef.current?.click()}
            >
              <FaPlus />
              Import Waitlist
            </button>

            <button
              className="secondary-dashboard-button"
              type="button"
              onClick={() => masterFileInputRef.current?.click()}
            >
              <FaPlus />
              Import Master
            </button>

            <button
              className="secondary-dashboard-button"
              type="button"
              onClick={exportInquiriesToSpreadsheet}
            >
              <FaTable />
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
              Delete All
            </button>

          </div>

          
        </header>

        {activeView === "Calendar View" ? (
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
          <article className="dashboard-stat-card">
            <span>Total Inquiries</span>
            <strong>{inquiryBookings.length}</strong>
            <p>Submitted through the form</p>
          </article>

          <article className="dashboard-stat-card">
            <span>Calendar Entries</span>
            <strong>{datedInquiries.length}</strong>
            <p>Inquiries with a start date</p>
          </article>

          <article className="dashboard-stat-card">
            <span>Missing Dates</span>
            <strong>{inquiriesMissingDates.length}</strong>
            <p>Need staff follow-up</p>
          </article>

          <article className="dashboard-stat-card">
            <span>Promo Codes</span>
            <strong>{inquiriesWithPromoCodes.length}</strong>
            <p>Submissions with a promo code</p>
          </article>
        </section>

        <section className="dashboard-card tasks-card">
          <div className="dashboard-card-header collapsible-card-header">
            <div>
              <h2>Submitted Booking Inquiries</h2>
              <p>
                {inquiryBookings.length} total inquiry
                {inquiryBookings.length === 1 ? "" : "ies"} from forms and Excel imports.
              </p>
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
                            <button className="table-link">
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
              <div>
                <h2>Groups At a Glance</h2>
                <p>
                  Calendar view based only on inquiries that have selected
                  dates.
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
                <div>
                  <h2>Dated Inquiries</h2>
                  <p>Submissions with start dates, sorted by date.</p>
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
                            <button className="table-link">
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
                <div>
                  <h2>Recent Booking Inquiries</h2>
                  <p>Newest submissions from the public form.</p>
                </div>
              </div>

              {recentInquiries.length > 0 ? (
                <div className="inquiry-list">
                  {recentInquiries.map((inquiry) => (
                    <div className="inquiry-card" key={inquiry.id}>
                      <div>
                        <strong>{inquiry.organizationName}</strong>
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
          </>
        )}
      </section>
    </main>
  );
}