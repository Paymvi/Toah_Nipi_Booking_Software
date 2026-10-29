import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
  FaBed,
  FaEnvelopeOpenText,
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
  FaRegStar,
  FaStar,
  FaExternalLinkAlt,
  FaChild,
  FaUserMinus,
  FaUserPlus,
  FaGlobeAmericas,
  FaMoon,
  FaPen,
  FaConciergeBell,
  FaShieldAlt,
  FaStickyNote,
} from "react-icons/fa";

import {
  fetchBookings,
  saveBooking,
  saveBookings,
  deleteAllBookings,
  deleteBooking,
  getBookingSaveErrorMessage,
} from "../services/bookingService";


import ExcelJS from "exceljs";
import { supabase } from "../lib/supabaseClient";
import { decideGuestInquiryConversion } from "../services/guestInquiryConversion";
import {
  createStaffDirectoryId,
  getUnlistedStaffNames,
  loadStaffDirectory,
  saveStaffDirectoryChanges,
} from "../services/staffDirectory";
import {
  LODGING_BUILDINGS,
  LODGING_CALENDAR_GROUPS,
} from "../constants/lodgingConstants";
import {
  getBookingCalendarGroups,
  getBookingLodgingAssignments,
  getBookingLodgingDisplayText,
  getLegacyLodgingText,
} from "../utils/lodgingUtils";
import {
  isHousingAuthoritative,
  mergeMasterImportRecord,
  withImportBaseline,
} from "../utils/masterImportMerge";
import {
  applyBookingClassification,
  getBookingClassificationOptions,
  getBookingClassificationValue,
  getBookingDisplayState,
  getConvertedInquiryIds,
  getRecordKind,
  isActiveBooking,
  RECORD_KIND,
} from "../utils/bookingClassification";
import {
  mirrorTopLevelIntoDetails,
  recordStaffEdits,
} from "../utils/bookingFields";
import BookingHousingTab from "../components/BookingHousingTab";
import BookingStaffAssignmentsTab from "../components/BookingStaffAssignmentsTab";
import DashboardTopbar from "../components/DashboardTopbar";
import BookingCalendar from "../components/BookingCalendar";
import DashboardBackups from "../components/DashboardBackups";

import CreateBooking from "../pages/CreateBooking";

import GuestInquiriesView from "../pages/GuestInquiriesView";

import StaffSignOutButton from "../components/StaffSignOutButton";

import PortalAdminView from "../pages/PortalAdminView";


import {
  markGuestInquiryConverted,
} from "../services/guestInquiryService";

import {
  sidebarSections,
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
  getBookingInquiryDateValue,
} from "../utils/dateUtils";


import {
  readSpreadsheetCell,
  cleanExcelCellValue,
  rowHasAnyData,
  getRowsFromWorksheetFlexible,
} from "../utils/spreadsheetUtils";

import BookingChecklists, {
  getBookingChecklists,
  sortChecklistItems,
} from "../components/BookingChecklists";


import CalendarView from "../pages/CalendarView";
import LodgingCalendarView from "../pages/LodgingCalendarView";
import SpreadsheetView, { SpreadsheetViewLoadingScreen } from "../pages/SpreadsheetView";
import InquirySpreadsheetView from "../pages/InquirySpreadsheetView";
import ContactsView from "../pages/ContactsView";
import InquiryPipelineView, {
  getInquiryPipelineColumnKey,
} from "../pages/InquiryPipeline";
import ReportsView from "../pages/ReportsView";
import JobsView, {
  getAssignedStaffNamesFromBookings,
} from "../pages/JobsView";

const SPREADSHEET_VIEW_NAME = "Spreadsheet View";
const INQUIRY_SPREADSHEET_VIEW_NAME = "Inquiry Spreadsheet";

const SPREADSHEET_REVEAL_LOADING_MS = 160;


import InquiryRecordDetailView from "../pages/InquiryRecordDetailView";


function hasOverviewDisplayValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  return true;
}

function getOverviewDisplayValue(...values) {
  for (const value of values) {
    if (hasOverviewDisplayValue(value)) {
      return value;
    }
  }

  return "";
}

function getFirstSelectedMeal(dateRows = []) {
  for (const row of dateRows) {
    if (row.breakfast) return "Breakfast";
    if (row.lunch) return "Lunch";
    if (row.dinner) return "Dinner";
  }

  return "";
}

function getLastSelectedMeal(dateRows = []) {
  for (let index = dateRows.length - 1; index >= 0; index -= 1) {
    const row = dateRows[index];

    if (row.dinner) return "Dinner";
    if (row.lunch) return "Lunch";
    if (row.breakfast) return "Breakfast";
  }

  return "";
}

function parseBookingMealSummary(summary = "") {
  const text = typeof summary === "string" ? summary : "";

  const segments = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const dateRows = segments
    .filter((part) =>
      /^[A-Za-z]{3},\s[A-Za-z]{3}\s\d{1,2},\s\d{4}\s*:/i.test(part)
    )
    .map((part) => {
      const [dateLabelPart, mealsPart = ""] = part.split(/:(.+)/);

      const selections = mealsPart
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      return {
        dateLabel: dateLabelPart.trim(),
        breakfast: selections.includes("breakfast"),
        lunch: selections.includes("lunch"),
        dinner: selections.includes("dinner"),
      };
    });

  const totalMatch = text.match(/Total meals:\s*(\d+)/i);
  const breakfastCountMatch = text.match(/Breakfast:\s*(\d+)/i);
  const lunchCountMatch = text.match(/Lunch:\s*(\d+)/i);
  const dinnerCountMatch = text.match(/Dinner:\s*(\d+)/i);
  const breakfastTimeMatch = text.match(/Breakfast time:\s*([^;]+)/i);
  const lunchTimeMatch = text.match(/Lunch time:\s*([^;]+)/i);
  const dinnerTimeMatch = text.match(/Dinner time:\s*([^;]+)/i);

  return {
    totalMeals: totalMatch ? totalMatch[1] : "",
    breakfastCount: breakfastCountMatch ? breakfastCountMatch[1] : "0",
    lunchCount: lunchCountMatch ? lunchCountMatch[1] : "0",
    dinnerCount: dinnerCountMatch ? dinnerCountMatch[1] : "0",
    breakfastTime: breakfastTimeMatch ? breakfastTimeMatch[1].trim() : "",
    lunchTime: lunchTimeMatch ? lunchTimeMatch[1].trim() : "",
    dinnerTime: dinnerTimeMatch ? dinnerTimeMatch[1].trim() : "",
    dateRows,
    firstMeal: getFirstSelectedMeal(dateRows),
    lastMeal: getLastSelectedMeal(dateRows),
  };
}

function parseBookingDietarySummary(summary = "") {
  const text = typeof summary === "string" ? summary : "";

  const parts = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const items = [];
  let additionalNotes = "";

  parts.forEach((part) => {
    const noteMatch = part.match(/^Additional notes:\s*(.+)$/i);

    if (noteMatch) {
      additionalNotes = noteMatch[1].trim();
      return;
    }

    const quantityMatch = part.match(/^(\d+)\s*-\s*(.+)$/);

    if (quantityMatch) {
      items.push({
        quantity: quantityMatch[1],
        label: quantityMatch[2].trim(),
      });
      return;
    }

    items.push({
      quantity: "—",
      label: part,
    });
  });

  return {
    items,
    additionalNotes,
  };
}

function BookingMealsProgramOverview({ booking, details }) {
  const mealPlanText = getOverviewDisplayValue(
    booking.meals
  );

  const dietaryText = getOverviewDisplayValue(
    booking.foodAllergies
  );

  const mealNotesText = getOverviewDisplayValue(
    details?.mealNotes
  );

  const needToKnowText =
    String(booking.needToKnow || "").trim() !==
    String(details?.mealNotes || "").trim()
      ? getOverviewDisplayValue(
          booking.needToKnow
        )
      : "";

  const parsedMealSummary =
    parseBookingMealSummary(mealPlanText);

  const parsedDietarySummary =
    parseBookingDietarySummary(dietaryText);

  const totalMeals =
    getOverviewDisplayValue(
      details?.numberOfMeals,
      parsedMealSummary.totalMeals,
      booking.mealCount
    ) || "—";

  const firstMeal =
    getOverviewDisplayValue(
      details?.firstMeal,
      parsedMealSummary.firstMeal
    ) || "—";

  const lastMeal =
    getOverviewDisplayValue(
      details?.lastMeal,
      parsedMealSummary.lastMeal
    ) || "—";

  const breakfastTime =
    formatBookingOverviewTime(
      getOverviewDisplayValue(
        details?.breakfastTime,
        parsedMealSummary.breakfastTime
      )
    ) || "—";

  const lunchTime =
    formatBookingOverviewTime(
      getOverviewDisplayValue(
        details?.lunchTime,
        parsedMealSummary.lunchTime
      )
    ) || "—";

  const dinnerTime =
    formatBookingOverviewTime(
      getOverviewDisplayValue(
        details?.dinnerTime,
        parsedMealSummary.dinnerTime
      )
    ) || "—";

  const breakfastCount =
    getOverviewDisplayValue(
      parsedMealSummary.breakfastCount
    ) || "0";

  const lunchCount =
    getOverviewDisplayValue(
      parsedMealSummary.lunchCount
    ) || "0";

  const dinnerCount =
    getOverviewDisplayValue(
      parsedMealSummary.dinnerCount
    ) || "0";

  const hasAnyContent =
    hasOverviewDisplayValue(mealPlanText) ||
    hasOverviewDisplayValue(dietaryText) ||
    hasOverviewDisplayValue(mealNotesText) ||
    hasOverviewDisplayValue(needToKnowText) ||
    hasOverviewDisplayValue(details?.numberOfMeals) ||
    hasOverviewDisplayValue(booking.mealCount);

  if (!hasAnyContent) {
    return null;
  }

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-program-showcase">
      <div className="booking-overview-program-header">
        <div className="booking-overview-program-title">
          <span className="booking-overview-program-title-icon">
            <FaUtensils />
          </span>

          <div>
            <p>Food Service</p>
            <h3>Meals</h3>
            <span>
              Meal schedule, service times, dietary requirements,
              and food-service notes.
            </span>
          </div>
        </div>
      </div>

      <div className="booking-overview-program-summary">
        <div className="booking-overview-program-summary-block">
          <span className="booking-overview-program-summary-icon">
            <FaUtensils />
          </span>

          <div className="booking-overview-program-summary-copy">
            <small>Total Meals</small>
            <strong>{totalMeals}</strong>
            <span>
              (Breakfast: {breakfastCount}, Lunch: {lunchCount}, Dinner:{" "}
              {dinnerCount})
            </span>
          </div>
        </div>

        <div className="booking-overview-program-summary-block">
          <span className="booking-overview-program-summary-icon">
            <FaConciergeBell />
          </span>

          <div className="booking-overview-program-summary-copy">
            <small>First Meal</small>
            <strong>{firstMeal}</strong>
          </div>
        </div>

        <div className="booking-overview-program-summary-block">
          <span className="booking-overview-program-summary-icon">
            <FaClipboardList />
          </span>

          <div className="booking-overview-program-summary-copy">
            <small>Last Meal</small>
            <strong>{lastMeal}</strong>
          </div>
        </div>

        <div className="booking-overview-program-summary-block">
          <span className="booking-overview-program-summary-icon">
            <FaClock />
          </span>

          <div className="booking-overview-program-summary-copy">
            <small>Service Times</small>

            <div className="booking-overview-program-service-times">
              <div>
                <strong>{breakfastTime}</strong>
                <span>Breakfast</span>
              </div>

              <div>
                <strong>{lunchTime}</strong>
                <span>Lunch</span>
              </div>

              <div>
                <strong>{dinnerTime}</strong>
                <span>Dinner</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="booking-overview-program-cards-row">
        <div className="booking-overview-program-panel booking-overview-program-panel-meals">
          <div className="booking-overview-program-panel-header">
            <span className="booking-overview-program-panel-icon">
              <FaCalendarAlt />
            </span>

            <div>
              <h4>Meal Service Plan</h4>
              <p>Detailed meal plan for this retreat.</p>
            </div>
          </div>

          {parsedMealSummary.dateRows.length > 0 ? (
            <div className="booking-overview-program-table-wrap">
              <table className="booking-overview-program-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Breakfast</th>
                    <th>Lunch</th>
                    <th>Dinner</th>
                  </tr>
                </thead>

                <tbody>
                  {parsedMealSummary.dateRows.map((row) => (
                    <tr key={row.dateLabel}>
                      <td className="booking-overview-program-date-cell">
                        {row.dateLabel}
                      </td>

                      <td>
                        {row.breakfast ? (
                          <span className="booking-overview-meal-chip">
                            Breakfast
                          </span>
                        ) : (
                          <span className="booking-overview-program-dash">—</span>
                        )}
                      </td>

                      <td>
                        {row.lunch ? (
                          <span className="booking-overview-meal-chip">
                            Lunch
                          </span>
                        ) : (
                          <span className="booking-overview-program-dash">—</span>
                        )}
                      </td>

                      <td>
                        {row.dinner ? (
                          <span className="booking-overview-meal-chip booking-overview-meal-chip-dinner">
                            Dinner
                          </span>
                        ) : (
                          <span className="booking-overview-program-dash">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="booking-overview-program-empty">
              No detailed meal schedule has been added yet.
            </div>
          )}
        </div>

        <div className="booking-overview-program-panel booking-overview-program-panel-diet">
          <div className="booking-overview-program-panel-header">
            <span className="booking-overview-program-panel-icon">
              <FaShieldAlt />
            </span>

            <div>
              <h4>Dietary Alerts</h4>
              <p>Allergen and dietary information for this group.</p>
            </div>
          </div>

          {parsedDietarySummary.items.length > 0 ? (
            <div className="booking-overview-dietary-table">
              <div className="booking-overview-dietary-table-head">
                <span>Dietary Item</span>
                <span>Quantity</span>
              </div>

              {parsedDietarySummary.items.map((item, index) => (
                <div
                  className="booking-overview-dietary-row"
                  key={`${item.label}-${index}`}
                >
                  <span>{item.label}</span>
                  <strong>{item.quantity}</strong>
                </div>
              ))}

              {parsedDietarySummary.additionalNotes && (
                <div className="booking-overview-dietary-alert-note">
                  <strong>Additional Dietary Note</strong>
                  <p>{parsedDietarySummary.additionalNotes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="booking-overview-program-empty">
              No dietary alerts were added for this booking.
            </div>
          )}
        </div>
      </div>

      {(mealNotesText || needToKnowText) && (
        <div className="booking-overview-program-panel booking-overview-program-panel-notes">
          <div className="booking-overview-program-panel-header">
            <span className="booking-overview-program-panel-icon">
              <FaStickyNote />
            </span>

            <div>
              <h4>Meal Notes</h4>
              <p>Important details for food-service coordination.</p>
            </div>
          </div>

          <div className="booking-overview-program-notes-grid">
            {mealNotesText && (
              <div className="booking-overview-program-note-block">
                <div className="booking-overview-program-note-heading">
                  <FaStickyNote />
                  <span>Meal Notes</span>
                </div>

                <p className="booking-overview-program-note-value">
                  {mealNotesText}
                </p>
              </div>
            )}

            {needToKnowText && (
              <div className="booking-overview-program-note-block">
                <div className="booking-overview-program-note-heading">
                  <FaInfoCircle />
                  <span>Need To Know</span>
                </div>

                <p className="booking-overview-program-note-value">
                  {needToKnowText}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}


function getBookingOverviewScheduleRows(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) =>
    entry &&
    typeof entry === "object" &&
    Object.values(entry).some((fieldValue) =>
      hasBookingOverviewValue(fieldValue)
    )
  );
}


function BookingActivitiesOverview({
  booking,
  details,
  dateSettings,
}) {
  const activities =
    getBookingOverviewScheduleRows(
      details?.activities
    ).length > 0
      ? getBookingOverviewScheduleRows(
          details?.activities
        )
      : getBookingOverviewScheduleRows(
          booking.activities
        );

  const legacyActivities =
    !Array.isArray(booking.activities)
      ? booking.activities
      : "";

  const activityNotes =
    details?.activityNotes || "";

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-schedule-showcase">
      <div className="booking-overview-schedule-header">
        <span className="booking-overview-schedule-header-icon">
          <FaHiking />
        </span>

        <div>
          <p>Program</p>
          <h3>Activities</h3>
          <span>
            Scheduled activities, locations, and program notes.
          </span>
        </div>
      </div>

      {activities.length > 0 ? (
        <div className="booking-overview-schedule-table-wrap">
          <div className="booking-overview-schedule-table booking-overview-activity-table">
            <div className="booking-overview-schedule-table-head">
              <span>Date</span>
              <span>Time</span>
              <span>Activity</span>
            </div>

            {activities.map((activity, index) => (
              <div
                className="booking-overview-schedule-row"
                key={`${activity.date || "activity"}-${activity.time || "time"}-${index}`}
              >
                <strong>
                  {activity.date
                    ? formatBookingDetailDate(
                        activity.date,
                        dateSettings
                      )
                    : "—"}
                </strong>

                <span>
                  {activity.time
                    ? formatBookingOverviewTime(
                        activity.time
                      )
                    : "—"}
                </span>

                <span className="booking-overview-schedule-primary">
                  {activity.activity || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : hasBookingOverviewValue(
          legacyActivities
        ) ? (
        <div className="booking-overview-schedule-legacy">
          {formatBookingOverviewValue(
            legacyActivities
          )}
        </div>
      ) : (
        <div className="booking-overview-schedule-empty">
          <FaHiking />

          <div>
            <strong>No activities scheduled yet</strong>
            <span>
              Activities added in Create Booking will appear here with their date and time.
            </span>
          </div>
        </div>
      )}

      {activityNotes && (
        <div className="booking-overview-schedule-notes">
          <strong>Activity Notes</strong>
          <p>{activityNotes}</p>
        </div>
      )}
    </section>
  );
}


function BookingFacilitiesOverview({
  booking,
  details,
  dateSettings,
}) {
  const facilities =
    getBookingOverviewScheduleRows(
      details?.facilities
    ).length > 0
      ? getBookingOverviewScheduleRows(
          details?.facilities
        )
      : getBookingOverviewScheduleRows(
          booking.facilities
        );

  const facilityNotes =
    details?.facilityNotes || "";

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-schedule-showcase">
      <div className="booking-overview-schedule-header">
        <span className="booking-overview-schedule-header-icon booking-overview-schedule-header-icon-facilities">
          <FaBuilding />
        </span>

        <div>
          <p>Operations</p>
          <h3>Facilities</h3>
          <span>
            Facility preparation tasks, assignments, and setup notes.
          </span>
        </div>
      </div>

      {facilities.length > 0 ? (
        <div className="booking-overview-schedule-table-wrap">
          <div className="booking-overview-schedule-table booking-overview-facility-table">
            <div className="booking-overview-schedule-table-head">
              <span>Date</span>
              <span>Time</span>
              <span>Task</span>
              <span>Assigned To</span>
              <span>Notes</span>
            </div>

            {facilities.map((facility, index) => (
              <div
                className="booking-overview-schedule-row"
                key={`${facility.date || "facility"}-${facility.time || "time"}-${index}`}
              >
                <strong>
                  {facility.date
                    ? formatBookingDetailDate(
                        facility.date,
                        dateSettings
                      )
                    : "—"}
                </strong>

                <span>
                  {facility.time
                    ? formatBookingOverviewTime(
                        facility.time
                      )
                    : "—"}
                </span>

                <span className="booking-overview-schedule-primary">
                  {facility.task || "—"}
                </span>

                <span>
                  {facility.assignedTo || "—"}
                </span>

                <span>
                  {facility.notes || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="booking-overview-schedule-empty booking-overview-schedule-empty-facilities">
          <FaBuilding />

          <div>
            <strong>No facility tasks scheduled yet</strong>
            <span>
              Facility tasks added in Create Booking will appear here with their assignments and notes.
            </span>
          </div>
        </div>
      )}

      {facilityNotes && (
        <div className="booking-overview-schedule-notes">
          <strong>Facility Notes</strong>
          <p>{facilityNotes}</p>
        </div>
      )}
    </section>
  );
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


/*
  This browser's staff list, used only until the shared staff directory
  (Supabase table staff_directory) exists. Placeholder users are no longer
  added when it is empty (AUDIT-017).
*/

function normalizeStaffName(value) {
  return String(value || "").trim().toLowerCase();
}

// Ids work in both the browser list and the shared directory (uuid column).
function createStaffUserId() {
  return createStaffDirectoryId();
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
      return [];
    }

    const parsedUsers = JSON.parse(savedUsers);

    return Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch (error) {
    console.error("Could not read staff users:", error);
    return [];
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

        // Attribution needs an explicit choice; nobody is picked by default.
    if (savedUserId && staffUsers.some((user) => user.id === savedUserId)) {
      return savedUserId;
    }

    return "";
  } catch (error) {
    console.error("Could not read current staff user:", error);
    return "";
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

function normalizeInquiry(inquiry, index) {
  const organizationName =
    inquiry.organizationName ||
    inquiry.churchOrMinistry ||
    "Unnamed Organization";

  const contactName =
    inquiry.contactName ||
    inquiry.name ||
    `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
    "";

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
    /* Keep empty values empty; placeholders are added only when rendering. */
    email: inquiry.email || "",
    phone: inquiry.phone || "",
    ...getSecondaryContact(inquiry),

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

    /*
      Row metadata from the database. updatedAt is the conflict check for
      the next save (AUDIT-045); createdAt and portalToken are read-only.
    */
    updatedAt: inquiry.updatedAt || "",
    createdAt: inquiry.createdAt || "",
    portalToken: inquiry.portalToken || "",
    firstName: inquiry.firstName || "",
    lastName: inquiry.lastName || "",

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
    linenPieces: inquiry.linenPieces || "",
    activities: inquiry.activities || "",
    facilities: Array.isArray(inquiry.facilities)
      ? inquiry.facilities
      : [],

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


/* =========================================================
   MASTER WORKBOOK IMPORT
   Match headers by name; preserve source cells and avoid inventing
   dates, age groups, housing allocations, or payment information.
========================================================= */

function normalizeMasterImportHeader(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function masterImportCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return masterImportCellValue(value.result);
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || "").join("");
  }
  if ("text" in value) return value.text;
  if ("hyperlink" in value) return value.hyperlink;
  return "";
}

function masterImportText(value) {
  const cell = masterImportCellValue(value);
  return cell instanceof Date && !Number.isNaN(cell.getTime())
    ? cell.toISOString()
    : String(cell ?? "").replace(/\u00a0/g, " ").trim();
}

function readMasterImportCell(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row || {}).find(
      (header) => normalizeMasterImportHeader(header) === normalizeMasterImportHeader(alias)
    );
    if (key !== undefined) {
      const value = masterImportCellValue(row[key]);
      if (masterImportText(value) !== "") return value;
    }
  }
  return "";
}

function hasMasterImportHeader(row, aliases) {
  const headers = new Set(Object.keys(row || {}).map(normalizeMasterImportHeader));
  return aliases.some((alias) => headers.has(normalizeMasterImportHeader(alias)));
}

function masterImportNumber(value) {
  const text = masterImportText(value).replace(/[$,]/g, "");
  return /^\d+(?:\.\d+)?$/.test(text) ? text : "";
}

function masterImportUnknown(value) {
  return /^(?:n\/?a|none|unknown|tbd|\?|[-–—])$/i.test(masterImportText(value));
}

function masterImportYes(value) {
  return /^(?:yes|y|true|received|rec['’]?d|returned|signed|complete|completed)(?:\b|;)/i
    .test(masterImportText(value));
}

function parseMasterImportTime(value, warnings = [], label = "Time") {
  const text = masterImportText(value);
  if (!text) return "";
  const match = text.match(/(?:^|\s|@)(\d{1,2}):(\d{2})(?::\d{2})*(?:\.\d+)?(?:\s*(a\.?m\.?|p\.?m\.?))?\s*$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] || "").replace(/\./g, "").toLowerCase();
  if (minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12))) {
    warnings.push(`${label} needs review: ${text}`);
    return "";
  }
  if (meridiem) hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  // The samples mix 24-hour times and values such as "2:00" without AM/PM.
  if (!meridiem && hour >= 1 && hour <= 7 && match[1].length === 1) {
    warnings.push(`${label} '${match[0].trim()}' has no AM/PM; the original value is preserved.`);
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseMasterImportDate(value, year, warnings = [], label = "Date") {
  const cell = masterImportCellValue(value);
  if (masterImportText(cell) === "" || masterImportUnknown(cell)) return { date: "", time: "" };
  let excelDate = null;
  if (cell instanceof Date) excelDate = cell;
  if (typeof cell === "number" && cell > 20000 && cell < 100000) {
    excelDate = new Date(Date.UTC(1899, 11, 30) + Math.round(cell * 86400000));
  }
  if (excelDate && !Number.isNaN(excelDate.getTime())) {
    const date = excelDate.toISOString().slice(0, 10);
    const hours = excelDate.getUTCHours();
    const minutes = excelDate.getUTCMinutes();
    return {
      date,
      time: hours || minutes
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
        : "",
    };
  }
  const text = masterImportText(cell);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/);
  const us = text.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?:\s|$)/);
  if (!iso && !us) {
    warnings.push(`${label} could not be read: ${text}`);
    return { date: "", time: "" };
  }
  let parsedYear = iso ? Number(iso[1]) : Number(us[3] || year);
  if (parsedYear < 100) parsedYear += parsedYear >= 70 ? 1900 : 2000;
  const month = Number(iso ? iso[2] : us[1]);
  const day = Number(iso ? iso[3] : us[2]);
  const dateObject = new Date(Date.UTC(parsedYear, month - 1, day));
  if (dateObject.getUTCFullYear() !== parsedYear || dateObject.getUTCMonth() !== month - 1 || dateObject.getUTCDate() !== day) {
    warnings.push(`${label} is not a valid calendar date: ${text}`);
    return { date: "", time: "" };
  }
  const remainder = text.slice((iso || us)[0].length).replace(/Z$/, "").trim();
  return {
    date: dateObject.toISOString().slice(0, 10),
    time: remainder ? parseMasterImportTime(remainder, warnings, `${label} time`) : "",
  };
}

function masterImportDocumentDate(value, year) {
  const cell = masterImportCellValue(value);
  if (cell instanceof Date || typeof cell === "number") return parseMasterImportDate(cell, year).date;
  const text = masterImportText(cell);
  if (/^(?:no|not|n\/?a)\b/i.test(text)) return "";
  const match = text.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return match ? parseMasterImportDate(match[0], year).date : "";
}

function getMasterImportStayDates(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let time = Date.parse(`${startDate}T00:00:00Z`); time <= end && dates.length < 180; time += 86400000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function parseMasterImportMeals(text, startDate, endDate, explicitCount, warnings) {
  const raw = masterImportText(text);
  let count = masterImportNumber(explicitCount);
  const numbered = raw.match(/(?:^|[.\s])(\d+)\s*(?:meals?\s*)?-\s*/i);
  if (count !== "" && numbered && Number(count) !== Number(numbered[1])) {
    warnings.push(`The meal description lists ${numbered[1]} meal(s), while #Meals lists ${count}; the #Meals count is retained.`);
  }
  if (count === "" && numbered) count = numbered[1];
  if (/^(?:no meals?|none|n\/?a|0)$/i.test(raw)) {
    if (count !== "" && count !== "0") warnings.push("The meal count conflicts with the no-meals description; check the original spreadsheet values.");
    if (count === "") count = "0";
    return { count, mealSchedule: {}, firstMeal: "", lastMeal: "", summary: raw };
  }
  const result = { count, mealSchedule: {}, firstMeal: "", lastMeal: "", summary: raw };
  if (!raw || count === "0" || masterImportUnknown(raw)) return result;
  const dates = getMasterImportStayDates(startDate, endDate);
  if (!dates.length) return result;
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const meals = ["breakfast", "lunch", "dinner"];
  const dayPattern = "(?:sun(?:day)?|mon(?:day)?|tue(?:sday|s)?|wed(?:nesday)?|thu(?:rsday|rs|r)?|fri(?:day)?|sat(?:urday)?)";
  const mealPattern = "(?:breakfast|lunch|dinner)";
  let plan = numbered ? raw.slice(numbered.index + numbered[0].length) : raw;
  // Snacks are notes, not an additional breakfast/lunch/dinner selection.
  plan = plan.replace(/snack[^.]*\.(?:\s*)/gi, "").split(/\(\s*no\b|;|\.\s+(?:Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\s+(?:breakfast|lunch|dinner)\s*@/i)[0];
  const pairPattern = new RegExp(`\\b(${dayPattern})\\.?\\s*(${mealPattern})\\b|\\b(${mealPattern})\\s+(${dayPattern})\\b`, "gi");
  const pairs = Array.from(plan.matchAll(pairPattern)).map((match) => ({
    day: (match[1] || match[4]).slice(0, 3).toLowerCase(),
    meal: (match[2] || match[3]).toLowerCase(),
    offset: match.index,
  }));
  const range = /\b(?:through|thru|to)\b/i.test(plan);
  const selections = [];
  const findDate = (day, after = "") => dates.find((date) => date >= after && weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()] === day);
  if (range && pairs.length >= 1) {
    const first = pairs[0];
    let last = pairs[pairs.length - 1];
    if (pairs.length === 1) {
      const ending = plan.split(/\b(?:through|thru|to)\b/i)[1]?.match(/\b(breakfast|lunch|dinner)\b/i);
      if (ending) last = { ...first, meal: ending[1].toLowerCase() };
    }
    const from = findDate(first.day);
    const to = findDate(last.day, from);
    if (from && to) {
      const slots = dates.flatMap((date) => meals.map((meal) => ({ date, meal })));
      const firstSlot = slots.findIndex((slot) => slot.date === from && slot.meal === first.meal);
      const lastSlot = slots.findIndex((slot) => slot.date === to && slot.meal === last.meal);
      if (lastSlot >= firstSlot) selections.push(...slots.slice(firstSlot, lastSlot + 1));
    }
  } else {
    const mentionedDays = [...new Set((plan.match(new RegExp(`\\b${dayPattern}\\b`, "gi")) || []).map((day) => day.slice(0, 3).toLowerCase()))];
    if (mentionedDays.length === 1) {
      const date = findDate(mentionedDays[0]);
      const selectedMeals = [...new Set((plan.match(/\b(?:breakfast|lunch|dinner)\b/gi) || []).map((meal) => meal.toLowerCase()))];
      if (date) selectedMeals.forEach((meal) => selections.push({ date, meal }));
    } else {
      pairs.forEach((pair) => {
        const date = findDate(pair.day);
        if (date) selections.push({ date, meal: pair.meal });
      });
    }
  }
  const unique = [...new Map(selections.map((slot) => [`${slot.date}:${slot.meal}`, slot])).values()]
    .sort((a, b) => a.date.localeCompare(b.date) || meals.indexOf(a.meal) - meals.indexOf(b.meal));
  if (!unique.length || (count !== "" && Number(count) !== unique.length)) {
    warnings.push("Meal dates/count do not form a clear schedule; the original meal instructions are preserved for review.");
    return result;
  }
  unique.forEach(({ date, meal }) => {
    result.mealSchedule[date] ||= { breakfast: false, lunch: false, dinner: false };
    result.mealSchedule[date][meal] = true;
  });
  result.count = count || String(unique.length);
  const label = (meal) => meal[0].toUpperCase() + meal.slice(1);
  result.firstMeal = label(unique[0].meal);
  result.lastMeal = label(unique[unique.length - 1].meal);
  const totals = meals.map((meal) => `${label(meal)}: ${unique.filter((slot) => slot.meal === meal).length}`).join(", ");
  result.summary = [
    `Total meals: ${result.count} (${totals})`,
    ...Object.entries(result.mealSchedule).map(([date, selected]) =>
      `${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}: ${meals.filter((meal) => selected[meal]).map(label).join(", ")}`
    ),
  ].join("; ");
  return result;
}

function parseMasterImportLinens(value) {
  const text = masterImportText(value);
  if (!text || /^(?:n\/?a|\?)$/i.test(text)) return {};
  if (/^(?:no|none|0|not needed)$/i.test(text)) return { linenOption: "No", linenSets: "0", linenPieces: "0" };
  if (/^(?:yes|all|included)$/i.test(text)) return { linenOption: "All" };
  const pieces = text.match(/^(\d+)\s+(?:towels?|pillowcases?|sheets?|pieces?)\b/i);
  if (pieces) return { linenOption: "Some", linenPieces: pieces[1] };
  const sets = text.match(/^(\d+)(?:\s*$|\s*(?:-|sets?\b|linen\b))/i);
  return { linenOption: "Some", ...(sets ? { linenSets: sets[1] } : {}) };
}

/*
  Status the sheet row itself states, or "" when the row says nothing about
  status. Re-imports only change a saved status when this is non-empty.
*/
function getExplicitMasterImportStatus({ confirmed, stage, cancellationDate, cancellationReason, contractReturned, contractSent, year }) {
  if (cancellationDate || cancellationReason || /cancel/i.test(`${confirmed} ${stage}`)) return "Cancelled";
  if (/unconfirmed|considering|tentative/i.test(confirmed)) return "Inquiry";
  if (/\bconfirmed\b|\bbooked\b/i.test(confirmed)) return "Confirmed";
  if (/waitlist/i.test(`${confirmed} ${stage}`)) return "Waitlist";
  if (masterImportYes(contractReturned) || masterImportDocumentDate(contractReturned, year)) return "Confirmed";
  if (masterImportYes(contractSent) || masterImportDocumentDate(contractSent, year)) return "Contract Sent";
  if (/unconfirmed|considering|inquiry|lead|tentative/i.test(stage)) return "Inquiry";
  if (/contract.*(?:signed|returned|received|rec['’]?d)/i.test(stage)) return "Confirmed";
  if (/feedback|invoice|payment due|paid|confirmed|booked/i.test(stage)) return "Confirmed";
  if (/contract/i.test(stage)) return "Contract Sent";
  return "";
}

// New records with no stated status keep the year default (AUDIT-024 deferred).
function getMasterImportStatus(values) {
  return getExplicitMasterImportStatus(values) || (values.year === 2027 ? "Inquiry" : "Confirmed");
}

function getMasterImportIdentity(booking, includeContact = true) {
  const type = masterImportText(booking.detectedImportType || booking.sourceType);
  if (!/^Master 20\d{2}$/i.test(type)) return "";
  const values = [type, booking.organizationName, booking.startDate, booking.endDate];
  if (includeContact) values.push(booking.contactName === "No contact name" ? "" : booking.contactName);
  return values.map((value) => masterImportText(value).toLowerCase().replace(/\s+/g, " ")).join("|");
}

function createMasterImportId(booking) {
  const identity = getMasterImportIdentity(booking);
  let first = 2166136261;
  let second = 5381;
  for (const character of identity) {
    first = Math.imul(first ^ character.charCodeAt(0), 16777619);
    second = Math.imul(second, 33) ^ character.charCodeAt(0);
  }
  const year = masterImportText(booking.sourceType).match(/20\d{2}/)?.[0] || "record";
  return `master-v2-${year}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

function normalizeMasterImportRow(row, index, year) {
  const get = (...aliases) => readMasterImportCell(row, aliases);
  const text = (...aliases) => masterImportText(get(...aliases));
  const warnings = [];
  const organizationName = text("Guest Group Name", "Group Name", "Organization Name", "Name");
  // Totals, repeated headers, and blank separator rows are not guest bookings.
  if (!organizationName || /^(?:totals?|subtotals?|grand total|guest group name|name)\s*:?$/i.test(organizationName)) return null;
  const arrival = parseMasterImportDate(get("Arrival Date", "Start Date", "Check In", "Check-in"), year, warnings, "Arrival date");
  let departureValue = get("Departure Date", "End Date", "Check Out", "Check-out");
  if (masterImportText(departureValue) === "" && year === 2026 && hasMasterImportHeader(row, ["boys)"])) {
    departureValue = get("boys)");
  }
  const departure = parseMasterImportDate(departureValue, year, warnings, "Departure date");
  if (arrival.date && departure.date && departure.date < arrival.date) warnings.push("Departure is before arrival; check the source dates.");
  const contactName = text("Guest Name/Group Leader Name", "Group Leader/Contact Person", "Contact Person", "Group Leader", "Contact Name");
  const phone = text("Group Leader Phone #", "Group Leader #", "Contact Person Cell #", "Contact Person Cell", "Phone Number", "Phone");
  const email = text("Contact Person Email", "Email Address", "Email");
  const guestText = text("Total # of Guests", "Actual Number of Guests", "Actual # of Guests", "# of Guests", "Estimated # of Guests", "Estimated Number of Guests", "Size", "Group Size");
  const guestRange = guestText.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
  const leadingGuests = guestText.match(/^\s*(\d+)(?:\s|\(|$)/);
  const explicitActual = text("Total # of Guests", "Actual Number of Guests", "Actual # of Guests");
  const estimated = year === 2027 && explicitActual === "";
  const guestCount = masterImportUnknown(guestText) ? "" : guestRange ? `${guestRange[1]}-${guestRange[2]}` : masterImportNumber(guestText) || leadingGuests?.[1] || guestText;
  const persons = text("#Persons", "Persons");
  const attendeeCount = guestCount || persons;
  const buildingsRooms = text("Buildings/Rooms", "Buildings", "Rooms", "Lodging");
  const lodgingText = buildingsRooms.replace(/\bGH\b/gi, "Guest House");
  const rawMeals = text("Meals", "Meal Plan");
  const needToKnow = text("Need to know", "Need To Know");
  const allergies = text("Food Allergies", "Allergies");
  const activityText = text("Activities", "Schedule/Activities");
  const schedule = text("Schedule");
  const linenText = text("Linen Sets", "Linens");
  const sourceNotes = text("Notes");
  const stage = text("Stage of Group", "Stage");
  const confirmed = text("Confirmed or Unconfirmed", "Confirmation Status", "Status");
  const cancellationDate = parseMasterImportDate(get("Date of Cancellation", "Cancellation Date"), year, warnings, "Cancellation date").date;
  const rawCancellationReason = text("Reason for Cancellation", "Cancellation Reason");
  const cancellationReason = masterImportUnknown(rawCancellationReason) ? "" : rawCancellationReason;
  const contractSent = get("Contract sent?", "Contract Sent", "Contract Sent Date");
  const contractReturned = get("Contract Signed & Returned?", "Contract Returned", "Contract Returned Date");
  const depositStatus = get("Deposit Received", "$250 Deposit for 2027 Rec'd?", "$250 Deposit for 2027 Received?");
  const rawDeposit = get("Deposit", "Deposit Amount");
  const deposit = masterImportNumber(rawDeposit) || (year === 2027 && masterImportText(depositStatus) && !masterImportUnknown(depositStatus) ? "250" : "");
  const nightValue = get("#Nights", "# of Nights", "Nights");
  const calculatedNights = arrival.date && departure.date && departure.date >= arrival.date
    ? String(Math.round((Date.parse(`${departure.date}T00:00:00Z`) - Date.parse(`${arrival.date}T00:00:00Z`)) / 86400000))
    : "";
  const nights = masterImportNumber(nightValue) || calculatedNights;
  if (masterImportNumber(nightValue) !== "" && calculatedNights !== "" && Number(nights) !== Number(calculatedNights)) {
    warnings.push(`The spreadsheet lists ${nights} night(s), while the dates span ${calculatedNights}; the spreadsheet count is retained.`);
  }
  const mealPlan = parseMasterImportMeals(rawMeals, arrival.date, departure.date, get("#Meals", "Meals Count", "Number of Meals"), warnings);
  const statusValues = { confirmed, stage, cancellationDate, cancellationReason, contractSent, contractReturned, year };
  const status = getMasterImportStatus(statusValues);
  const statusSource = getExplicitMasterImportStatus(statusValues) ? "sheet" : "default";
  const minGuests = text("Min. Number of Paying Guests", "Minimum Number of Paying Guests", "Minimum Guarantee");
  const maxGuests = text("Max. Number of Paying Guests", "Maximum Number of Paying Guests", "Maximum Guarantee");
  const adultRate = text("Adult Guest Rate", "Guest Rate", "Adult Rate Quoted");
  const childRate = text("Child 3 to 17 Rate", "Child Guest Rate", "Child Rate", "Child Rate Quoted");
  const toddlerRate = text("Child 1 to 3 Rate", "Child Under 3 Rate");
  const details = {
    organizationName, retreatType: text("Guest Group Type", "Retreat Type"),
    startDate: arrival.date, endDate: departure.date,
    contactName, phone, email, status,
    importedGuestCountKind: estimated ? "estimated" : "recorded",
    importedGuestCountText: guestText,
    importedLodgingText: buildingsRooms,
    importedLinenText: linenText,
    importedMealText: rawMeals,
    importedContractSentStatus: masterImportText(contractSent),
    importedContractReturnedStatus: masterImportText(contractReturned),
    importedDepositStatus: masterImportText(depositStatus),
    importedStatusSource: statusSource,
    importWarnings: warnings,
  };
  const put = (key, value) => { if (value !== "" && value !== null && value !== undefined) details[key] = value; };
  put("approxTotalGuests", attendeeCount);
  put("minimumGuarantee", masterImportNumber(minGuests));
  put("maximumGuarantee", masterImportNumber(maxGuests));
  put("actualAdultGuests", masterImportNumber(get("Actual # of Adults", "Actual Adults")));
  put("actualChildren3to17", masterImportNumber(get("Actual # of Minors 3 to 17", "Actual Children 3 to 17", "Actual Children 3-17")));
  put("actualChildrenUnder3", masterImportNumber(get("Actual # of Minors under 3", "Actual Children Under 3")));
  put("approxAdultGuests", masterImportNumber(get("Approx. # of Adults", "Estimated # of Adults", "Approx Adults")));
  put("approxChildren3to17", masterImportNumber(get("Approx. # of Minors 3 to 17", "Estimated # of Minors 3 to 17")));
  put("approxChildrenUnder3", masterImportNumber(get("Approx. # of Minors under 3", "Estimated # of Minors under 3")));
  put("dayCamperCount", masterImportNumber(get("Actual # of Day Use Guests", "Day Use Guests", "Day Camper Count")));
  // Prose totals are kept intact. Only explicit adult/toddler categories are mapped.
  if (year === 2026 && !guestRange) {
    const overnightText = guestText.split(/\bplus\b|\bday[ -]?use\b/i)[0];
    if (!details.actualAdultGuests) put("actualAdultGuests", overnightText.match(/\b(\d+)\s+adults?\b/i)?.[1] || "");
    if (!details.actualChildrenUnder3) put("actualChildrenUnder3", overnightText.match(/\b(\d+)\s+(?:inf\s*\/\s*todd|infants?\s*(?:and|&)\s*toddlers?|under[ -]?3)\b/i)?.[1] || "");
    const dayUse = guestText.match(/\bplus\s+(\d+)\s+adults?\s*(?:&|and)\s*(\d+)\s+(?:kids?|children)\s+for\s+day[ -]?use/i);
    if (!details.dayCamperCount && dayUse) put("dayCamperCount", String(Number(dayUse[1]) + Number(dayUse[2])));
    const dayMeals = guestText.match(/day[ -]?use[^.]*?\b(\d+)\s+meals?\b/i);
    put("dayCamperMeals", dayMeals?.[1] || "");
    if (/\b\d+\s+(?:child(?:ren)?|kids?|students?)\b/i.test(overnightText)) {
      warnings.push("The guest description includes children/students without exact age categories. Their original count is retained; check the age breakdown before editing the booking.");
    }
  }
  put("dayCamperMeals", masterImportNumber(get("Day Camper Meals", "Meals per Day Camper")));
  put("adultRateQuoted", masterImportNumber(adultRate));
  put("childRateQuoted", masterImportNumber(childRate));
  put("childUnder3RateQuoted", masterImportNumber(toddlerRate));
  put("numberOfNights", nights);
  put("numberOfMeals", mealPlan.count);
  put("arrivalTime", arrival.time);
  put("departureTime", departure.time);
  put("contractSentDate", masterImportDocumentDate(contractSent, year));
  put("contractReturnedDate", masterImportDocumentDate(contractReturned, year));
  put("inquiryDate", masterImportDocumentDate(get("Inquiry Date"), year));
  put("returnContractByDate", masterImportDocumentDate(get("Return Contract By", "Return Contract By Date"), year));
  put("depositReceivedDate", masterImportDocumentDate(depositStatus, year));
  put("depositAmount", masterImportNumber(deposit));
  put("insuranceCertificateDate", masterImportDocumentDate(get("Insurance Certificate Date"), year));
  put("notificationDate", masterImportDocumentDate(get("Notification Date"), year));
  put("paymentMethod", text("Payment Method"));
  put("ethnicBreakdown", text("Ethnic Breakdown"));
  put("mealSchedule", Object.keys(mealPlan.mealSchedule).length ? mealPlan.mealSchedule : "");
  put("firstMeal", mealPlan.firstMeal);
  put("lastMeal", mealPlan.lastMeal);
  put("mealNotes", [rawMeals, text("Snack for arrival?") ? `Snack for arrival: ${text("Snack for arrival?")}` : "", needToKnow].filter(Boolean).join("\n"));
  put("allergyNotes", allergies);
  put("activityNotes", [activityText, schedule].filter(Boolean).join("\n"));
  put("notes", sourceNotes);
  Object.assign(details, parseMasterImportLinens(linenText));
  put("linenPieces", masterImportNumber(get("Linen Pieces")));
  const lodgingFields = {
    lodgingBethel: ["Lodging Bethel", "Bethel Guests"],
    lodgingHebronThird: ["Lodging Hebron Third", "Hebron 3rd Floor Guests"],
    lodgingHebronBunks: ["Lodging Hebron Bunks", "Hebron Bunks Guests"],
    lodgingDothan: ["Lodging Dothan", "Dothan Guests"],
    lodgingAjalon: ["Lodging Ajalon", "Ajalon Guests"],
    lodgingCapernaum: ["Lodging Capernaum", "Capernaum Guests"],
    lodgingGuestHouse: ["Lodging Guest House", "Guest House Guests"],
  };
  Object.entries(lodgingFields).forEach(([key, aliases]) => put(key, masterImportNumber(get(...aliases))));
  const booking = {
    sourceType: `Master ${year}`, detectedImportType: `Master ${year}`,
    sourceSheet: row.sourceSheet || "", sourceRowNumber: row.sourceRowNumber || index + 2,
    rawSpreadsheetData: { ...row }, rentalFormDetails: details,
    submittedAt: new Date().toISOString(), organizationName,
    name: contactName, contactName: contactName || "", email, phone,
    startDate: arrival.date, endDate: departure.date,
    desiredDatesText: [arrival.date, departure.date].filter(Boolean).join(" - "),
    attendeeCount, groupSize: attendeeCount, retreatType: details.retreatType,
    roomName: lodgingText || "Unassigned", buildingsRooms: lodgingText,
    notes: sourceNotes, message: sourceNotes,
    status, waitlist: status === "Waitlist" ? "Yes" : "No", promoCode: "",
    returningStatus: text("Returning (R) or New (N)", "Returning or New"),
    meals: mealPlan.summary, foodAllergies: allergies, needToKnow, linenSets: linenText,
    linenPieces: text("Linen Pieces"), activities: activityText, schedule,
    persons, nights, mealCount: mealPlan.count,
    camperDays: text("Camper Days (nightsX0.4 + mealsX0.2)", "Camper Days"),
    usageFee: text("Usage Fee"), lodgingCost: text("$ Lodging", "Lodging Cost"),
    foodCost: text("$ Food", "Food Cost"), miscCost: text("$ Misc.", "$ Misc", "Misc"),
    stageOfGroup: stage, minPayingGuests: masterImportNumber(minGuests), maxPayingGuests: masterImportNumber(maxGuests),
    guestRate: masterImportNumber(adultRate),
    expectedMinimumRevenue: text("Exp. Minimum Revenue (inc. dep.)", "Exp. Minimum Revenue", "Exp. Minimum Revenue for Lodging/Meals", "Expected Minimum Revenue", "Expected Minimum Revenue for Lodging/Meals"),
    invoiceLodgingMeals: text("Actual Invoice", "Invoice for Lodging/Meals (does not include linens's fees or other service fees)", "Invoice for Lodging/Meals", "Invoice Total"),
    deposit, depositReceived: masterImportText(depositStatus),
    dateOfCancellation: cancellationDate, reasonForCancellation: cancellationReason,
    vacancyFilled: text("Vacancy filled by another group?"),
    monthlyProjectedIncome: text("Monthly Sum of Projected Income"),
  };
  booking.id = createMasterImportId(booking);
  return booking;
}

function getBookingImportRowsFromWorksheet(worksheet) {
  let headerRowNumber = 0;
  let headers = [];
  const limit = Math.min(worksheet.rowCount || 25, 25);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const candidate = [];
    worksheet.getRow(rowNumber).eachCell((cell, column) => {
      const label = masterImportText(cell.value);
      if (label) candidate.push({ label, column });
    });
    const probe = Object.fromEntries(candidate.map(({ label }) => [label, ""]));
    if (hasMasterImportHeader(probe, ["Guest Group Name", "Group Name", "Name", "Organization Name"]) &&
        hasMasterImportHeader(probe, ["Arrival Date", "Start Date", "Check In"])) {
      headerRowNumber = rowNumber;
      headers = candidate;
      break;
    }
  }
  if (!headerRowNumber) return getRowsFromWorksheetFlexible(worksheet);
  const seen = new Map();
  headers = headers.map(({ label, column }) => {
    const number = (seen.get(label) || 0) + 1;
    seen.set(label, number);
    return { label: number === 1 ? label : `${label} (${number})`, column };
  });
  const rows = [];
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const row = {};
    headers.forEach(({ label, column }) => { row[label] = masterImportCellValue(worksheetRow.getCell(column).value); });
    if (!headers.some(({ label }) => masterImportText(row[label]) !== "")) return;
    rows.push({ ...row, sourceSheet: worksheet.name, sourceRowNumber: rowNumber });
  });
  return rows;
}

/*
  Rebuilds what an earlier import wrote, from the sheet row saved with the
  record, for records imported before importBaseline existed.
*/
function rebuildMasterImportBaseline(existing) {
  const year = Number(String(existing.sourceType || "").match(/20\d{2}/)?.[0]);
  const raw = existing.rawSpreadsheetData;
  if (!year || !raw || typeof raw !== "object") return null;
  const index = Math.max(0, Number(existing.sourceRowNumber || 2) - 2);
  return normalizeMasterImportRow(raw, index, year);
}

function masterImportRecordsEqual(existing, merged) {
  const comparable = (booking) => {
    const details = { ...(booking.rentalFormDetails || {}) };
    delete details.importBaseline;
    return JSON.stringify({ ...booking, rentalFormDetails: details, rawSpreadsheetData: null });
  };
  return comparable(existing) === comparable(merged);
}

const MASTER_REIMPORT_RULES_TEXT =
  "How existing bookings are updated:\n" +
  "- Matching uses the import ID, then the group name and stay dates.\n" +
  "- Fields changed in the app keep the app value. The sheet only fills blanks and updates fields nobody has changed since the last import.\n" +
  "- For bookings imported before this rule existed, a filled field whose value cannot be traced to the earlier import keeps the app value.\n" +
  "- Status changes only when the sheet row states one; a blank status never resets it.\n" +
  "- Once the Housing tab has been saved, the sheet does not change lodging; its lodging text is kept as a reference note.\n" +
  "- Blank sheet cells never clear app values. Booking IDs, checklists, assignments and portal data are untouched.\n" +
  "- Bookings absent from this spreadsheet are kept. Repeated rows use the first occurrence.\n";

function formatMasterImportKeptValues(keptAppValues = []) {
  if (!keptAppValues.length) return "";
  const fieldCount = keptAppValues.reduce((sum, entry) => sum + entry.fields.length, 0);
  const examples = keptAppValues
    .slice(0, 8)
    .map((entry) => `  ${entry.organizationName}: ${entry.fields.map((field) => field.field).join(", ")}`)
    .join("\n");
  const more = keptAppValues.length > 8 ? `\n  …and ${keptAppValues.length - 8} more` : "";
  return `\nApp values kept instead of the sheet: ${fieldCount} field(s) on ${keptAppValues.length} booking(s)\n${examples}${more}`;
}

function formatImportSaveFailures(failures = []) {
  if (!failures.length) return "";
  const lines = failures
    .slice(0, 8)
    .map(({ booking, error }) => `  ${booking.organizationName || booking.id}: ${error?.message || String(error)}`)
    .join("\n");
  const more = failures.length > 8 ? `\n  …and ${failures.length - 8} more` : "";
  return `\n\nNOT SAVED (${failures.length}). These rows were left exactly as they were:\n${lines}${more}`;
}

function prepareMasterImportUpdates(incomingRows, existingRows) {
  const existingMasters = existingRows.filter((booking) => getMasterImportIdentity(booking));
  const seenBookings = new Set();
  const usedIds = new Set();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const keptAppValues = [];
  let duplicateRowsSkipped = 0;
  let duplicateExistingRecords = 0;
  const rows = incomingRows.flatMap((incoming) => {
    const identity = getMasterImportIdentity(incoming);
    if (!identity) return incoming;
    // Keep the first row for a group/stay, including copies with another contact.
    // Undated rows retain their contact identity to avoid merging separate requests.
    const duplicateKey = incoming.startDate && incoming.endDate
      ? getMasterImportIdentity(incoming, false)
      : identity;
    if (seenBookings.has(duplicateKey)) {
      duplicateRowsSkipped += 1;
      return [];
    }

    // The import ID is derived from the sheet row, so it still matches after
    // staff change the group name or dates in the app.
    const byId = existingMasters.filter((booking) => booking.id === incoming.id);
    const exact = existingMasters.filter((booking) => getMasterImportIdentity(booking) === getMasterImportIdentity(incoming));
    const sameStay = existingMasters.filter((booking) => getMasterImportIdentity(booking, false) === getMasterImportIdentity(incoming, false));
    const matches = byId.length ? byId : exact.length ? exact : sameStay;
    // Prefer the stable import ID when it exists; otherwise update one match.
    const existing = matches.find((booking) => booking.id === incoming.id) || matches[0];
    const id = existing?.id || incoming.id;
    if (usedIds.has(id)) {
      duplicateRowsSkipped += 1;
      return [];
    }
    // Do not reuse a row-position ID occupied by another stay.
    if (!existing && existingRows.some((booking) => booking.id === id)) {
      throw new Error(`The import ID for ${incoming.organizationName} is already in use. No data was saved.`);
    }
    seenBookings.add(duplicateKey);
    usedIds.add(id);
    // Other stored matches remain available, with their IDs and staff data intact.
    duplicateExistingRecords += Math.max(0, sameStay.length - 1);
    if (!existing) { added += 1; return withImportBaseline(incoming); }
    const { merged, keptAppValues: keptForRow } = mergeMasterImportRecord(existing, incoming, {
      rebuildBaseline: rebuildMasterImportBaseline,
    });
    if (keptForRow.length) {
      keptAppValues.push({ organizationName: existing.organizationName, id: existing.id, fields: keptForRow });
    }
    const mergedDetails = merged.rentalFormDetails;
    const ageCounts = ["actualAdultGuests", "actualChildrenUnder3", "actualChildren3to17"]
      .map((key) => masterImportNumber(mergedDetails[key]));
    const total = masterImportNumber(merged.attendeeCount);
    if (mergedDetails.importedGuestCountKind === "recorded" && total !== "" && ageCounts.some((value) => value !== "")) {
      const knownTotal = ageCounts.reduce((sum, value) => sum + Number(value || 0), 0) +
        (incoming.sourceType === "Master 2025" ? Number(masterImportNumber(mergedDetails.dayCamperCount) || 0) : 0);
      if (knownTotal !== Number(total)) {
        mergedDetails.importWarnings = [...new Set([
          ...(mergedDetails.importWarnings || []),
          "The retained guest age/day-use breakdown does not equal the spreadsheet total. The spreadsheet total is displayed; review the breakdown before editing the booking.",
        ])];
      }
    }
    // Rows the sheet did not change are not rewritten.
    if (masterImportRecordsEqual(existing, merged)) {
      unchanged += 1;
      return [];
    }
    updated += 1;
    return merged;
  });
  return { rows, added, updated, unchanged, keptAppValues, duplicateRowsSkipped, duplicateExistingRecords };
}

function normalizeMasterSpreadsheetRow(row, index) {
  return normalizeMasterImportRow(row, index, 2025);
}

function normalizeMaster2026SpreadsheetRow(row, index) {
  return normalizeMasterImportRow(row, index, 2026);
}

function normalizeMaster2027SpreadsheetRow(row, index) {
  return normalizeMasterImportRow(row, index, 2027);
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

  const hasHeader = (...headers) =>
    hasMasterImportHeader(sampleRow, headers);

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
    hasHeader("Group Leader Phone #", "Group Leader #", "Contact Person Cell #") &&
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
    contactName: cleanContactName,

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

/*
  dayOffset shifts the inquiry date before building the identity. Records
  imported before the AUDIT-013 fix carry a date one day early, so a fresh
  row (correct date) also matches an existing record dated the day before.
*/
function getGuestGroupInquiryImportIdentity(booking, dayOffset = 0) {
  const type = masterImportText(booking.detectedImportType || booking.sourceType);
  if (!/^Guest Group Inquiry 20\d{2}$/i.test(type)) return "";
  const inquiryDay = masterImportText(booking.submittedAt).slice(0, 10);
  const shiftedDay = dayOffset && /^\d{4}-\d{2}-\d{2}$/.test(inquiryDay)
    ? new Date(Date.parse(`${inquiryDay}T00:00:00Z`) + dayOffset * 86400000).toISOString().slice(0, 10)
    : inquiryDay;
  const values = [
    type,
    booking.organizationName,
    booking.contactName,
    booking.email,
    shiftedDay,
  ];
  return values.map((value) => masterImportText(value).toLowerCase().replace(/\s+/g, " ")).join("|");
}

/*
  Inquiry import IDs come from the sheet name and row number, which change
  when rows are inserted, deleted or sorted, or a sheet is renamed. Match each
  row to an existing inquiry of the same year by its content first so those
  edits update the same record instead of duplicating or overwriting another.
  Repeated rows still map to separate records; nothing is merged or deleted.
*/
function prepareGuestGroupInquiryImportIds(incomingRows, existingRows) {
  const existingInquiries = existingRows.filter((booking) => getGuestGroupInquiryImportIdentity(booking));
  const existingIds = new Set(existingRows.map((booking) => booking.id));
  const claimedIds = new Set();
  const matchedIds = new Map();

  incomingRows.forEach((incoming, index) => {
    const identity = getGuestGroupInquiryImportIdentity(incoming);
    if (!identity) return;
    const exactMatches = existingInquiries.filter((booking) =>
      !claimedIds.has(booking.id) && getGuestGroupInquiryImportIdentity(booking) === identity
    );
    const legacyShiftedMatches = exactMatches.length
      ? []
      : existingInquiries.filter((booking) =>
          !claimedIds.has(booking.id) && getGuestGroupInquiryImportIdentity(booking, 1) === identity
        );
    const matches = exactMatches.length ? exactMatches : legacyShiftedMatches;
    const match = matches.find((booking) => booking.id === incoming.id) || matches[0];
    if (!match) return;
    claimedIds.add(match.id);
    matchedIds.set(index, match.id);
  });

  return incomingRows.map((incoming, index) => {
    if (!getGuestGroupInquiryImportIdentity(incoming)) return incoming;
    let id = matchedIds.get(index);
    if (!id) {
      // An unclaimed row-position ID is the same row edited in the workbook.
      // If another inquiry kept that ID, use a fresh one instead of overwriting it.
      id = incoming.id;
      for (
        let suffix = 2;
        claimedIds.has(id) || (id !== incoming.id && existingIds.has(id));
        suffix += 1
      ) {
        id = `${incoming.id}-${suffix}`;
      }
      claimedIds.add(id);
    }
    return { ...incoming, id };
  });
}



function getSecondaryContact(booking) {
  const details = booking?.rentalFormDetails || {};
  const rawData = booking?.rawSpreadsheetData || {};

  /* Empty saved strings intentionally override older/imported values. */
  const readValue = (fieldName, columnNames) =>
    String(
      details[fieldName] ??
      booking?.[fieldName] ??
      readSpreadsheetCell(rawData, columnNames) ??
      ""
    ).trim();

  return {
    secondaryContactName: readValue("secondaryContactName", [
      "Secondary Contact Name",
      "Secondary Contact",
      "Secondary Name",
    ]),
    secondaryContactPhone: readValue("secondaryContactPhone", [
      "Secondary Contact Phone",
      "Secondary Phone Number",
      "Secondary Phone",
    ]),
    secondaryContactEmail: readValue("secondaryContactEmail", [
      "Secondary Contact Email",
      "Secondary Email Address",
      "Secondary Email",
    ]),
  };
}

function formatSecondaryContactPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
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

/* =========================================================
   BOOKING INCIDENT NOTES
   Stored inside rentalFormDetails.incidentNotes
========================================================= */

function BookingIncidentNotesCard({ booking, onSaveBooking }) {
  const getSavedIncidentNotes = () =>
    String(
      booking?.rentalFormDetails?.incidentNotes || ""
    );

  const [incidentNotes, setIncidentNotes] = useState(
    getSavedIncidentNotes
  );

  const [isEditingIncidentNotes, setIsEditingIncidentNotes] =
    useState(false);

  useEffect(() => {
    setIncidentNotes(getSavedIncidentNotes());
    setIsEditingIncidentNotes(false);
  }, [
    booking.id,
    booking.rentalFormDetails?.incidentNotes,
  ]);

  const handleCancelIncidentNotes = () => {
    setIncidentNotes(getSavedIncidentNotes());
    setIsEditingIncidentNotes(false);
  };

  const handleSaveIncidentNotes = async () => {
    const updatedBooking = {
      ...booking,

      rentalFormDetails: {
        ...(booking.rentalFormDetails || {}),

        incidentNotes:
          incidentNotes.trim(),
      },
    };

    await onSaveBooking(updatedBooking);

    setIsEditingIncidentNotes(false);
  };

  const hasIncidentNotes =
    Boolean(
      String(
        booking?.rentalFormDetails?.incidentNotes || ""
      ).trim()
    );

  return (
    <section className="dashboard-card booking-incident-notes-card">
      <div className="booking-incident-notes-header">
        <div className="booking-incident-notes-title">
          <span className="booking-incident-notes-icon">
            <FaExclamationTriangle />
          </span>

          <div>
            <p className="dashboard-eyebrow">
              Internal Record
            </p>

            <h3>Incident Notes</h3>

            <span>
              Document incidents, concerns, actions taken,
              and any staff follow-up.
            </span>
          </div>
        </div>

        <div className="booking-incident-notes-actions">
          {isEditingIncidentNotes ? (
            <>
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={
                  handleCancelIncidentNotes
                }
              >
                Cancel
              </button>

              <button
                className="primary-dashboard-button"
                type="button"
                onClick={
                  handleSaveIncidentNotes
                }
              >
                Save Incident Notes
              </button>
            </>
          ) : (
            <button
              className="secondary-dashboard-button"
              type="button"
              onClick={() =>
                setIsEditingIncidentNotes(true)
              }
            >
              {hasIncidentNotes
                ? "Edit Incident Notes"
                : "Add Incident Notes"}
            </button>
          )}
        </div>
      </div>

      {isEditingIncidentNotes ? (
        <label className="booking-incident-notes-field">
          <span>Incident Record</span>

          <textarea
            rows="7"
            value={incidentNotes}
            onChange={(event) =>
              setIncidentNotes(
                event.target.value
              )
            }
            placeholder="Example: 9/8/2026 - Guest reported an injury near the dining hall. First aid was provided. Staff followed up with the group leader."
          />
        </label>
      ) : hasIncidentNotes ? (
        <div className="booking-incident-notes-display">
          <p>
            {
              booking.rentalFormDetails
                .incidentNotes
            }
          </p>
        </div>
      ) : (
        <div className="booking-incident-notes-empty">
          <FaExclamationTriangle />

          <div>
            <strong>
              No incidents recorded
            </strong>
          </div>
        </div>
      )}
    </section>
  );
}

function createBookingEditFormState(booking) {
  const secondaryContact = getSecondaryContact(booking);

  return {
    ...secondaryContact,
    secondaryContactPhone: formatSecondaryContactPhone(
      secondaryContact.secondaryContactPhone
    ),
    organizationName: booking.organizationName || "",
    contactName: booking.contactName === "No contact name" ? "" : booking.contactName || "",
    email: booking.email === "No email provided" ? "" : booking.email || "",
    phone: booking.phone === "No phone provided" ? "" : booking.phone || "",

    startDate: booking.startDate || "",
    endDate: booking.endDate || "",
    desiredDatesText: booking.desiredDatesText || "",

    attendeeCount: booking.attendeeCount || "",
    retreatType: booking.retreatType || "",
    classification: getBookingClassificationValue(booking),

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
  name,
  inputMode,
  autoComplete,
  pattern,
  title,
  readOnlyReason = "",
}) {
  const canEdit = isEditing && !readOnlyReason;

  return (
    <label className="booking-edit-field">
      <span>{label}</span>

      {options ? (
        <select
          value={value || ""}
          disabled={!canEdit}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => {
            const optionValue = typeof option === "object" ? option.value : option;
            const optionLabel = typeof option === "object" ? option.label : option;

            return (
              <option value={optionValue} key={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : multiline ? (
        <textarea
          value={value || ""}
          readOnly={!canEdit}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={type}
          name={name}
          inputMode={inputMode}
          autoComplete={autoComplete}
          pattern={pattern}
          title={title}
          value={value || ""}
          readOnly={!canEdit}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {readOnlyReason && isEditing && (
        <small className="booking-edit-field-note">{readOnlyReason}</small>
      )}
    </label>
  );
}



// Top-level fields this form edits; changes are recorded for re-imports.
const BOOKING_EDIT_TRACKED_FIELDS = [
  "organizationName", "contactName", "email", "phone",
  "startDate", "endDate", "desiredDatesText",
  "attendeeCount", "retreatType", "status", "waitlist",
  "roomName", "buildingsRooms",
  "meals", "foodAllergies", "needToKnow", "linenSets", "activities",
  "persons", "nights", "mealCount", "camperDays",
  "usageFee", "lodgingCost", "foodCost", "miscCost",
  "notes",
];

function BookingDetailsEditForm({ booking, onSaveBooking }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const housingIsAuthoritative = isHousingAuthoritative(booking);
  const housingReadOnlyReason = housingIsAuthoritative
    ? "Managed on the Housing tab."
    : "";
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const desiredDatesText =
      formData.desiredDatesText.trim() ||
      [formData.startDate, formData.endDate].filter(Boolean).join(" - ");

    const updatedBooking = {
      ...booking,

      organizationName:
        formData.organizationName.trim() || "Unnamed Organization",

      contactName: formData.contactName.trim(),
      name: formData.contactName.trim(),

      email: formData.email.trim(),
      phone: formData.phone.trim(),

      rentalFormDetails: {
        ...(booking.rentalFormDetails || {}),
        secondaryContactName: formData.secondaryContactName.trim(),
        secondaryContactPhone: formData.secondaryContactPhone.trim(),
        secondaryContactEmail: formData.secondaryContactEmail.trim(),
      },

      startDate: formData.startDate,
      endDate: formData.endDate,
      desiredDatesText,

      attendeeCount: formData.attendeeCount.trim(),
      groupSize: formData.attendeeCount.trim(),

      retreatType: formData.retreatType.trim(),

      // The Housing tab owns lodging once it has been saved (AUDIT-007).
      roomName: housingIsAuthoritative
        ? booking.roomName
        : formData.roomName.trim() || "Unassigned",
      buildingsRooms: housingIsAuthoritative
        ? booking.buildingsRooms
        : formData.buildingsRooms.trim(),

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
    };

    /*
      Classification replaces the old status dropdowns; status and waitlist
      change only when staff pick a different classification. Then the
      edited fields are recorded (re-imports keep them) and copied into the
      duplicated detail copies Master records carry (AUDIT-003).
    */
    const classifiedBooking = applyBookingClassification(
      updatedBooking,
      formData.classification
    );
    const trackedBooking = recordStaffEdits(
      booking,
      classifiedBooking,
      BOOKING_EDIT_TRACKED_FIELDS
    );
    const bookingToSave = mirrorTopLevelIntoDetails(trackedBooking);

    setIsSaving(true);

    try {
      await onSaveBooking(bookingToSave);
      setIsEditing(false);
    } catch {
      // The save handler already explained the failure; keep the edits on screen.
    } finally {
      setIsSaving(false);
    }
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

              <button className="primary-dashboard-button" type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save Changes"}
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
            <FaUserPlus />
            <div>
              <h4>Secondary Contact (Optional)</h4>
              <p>All three fields can be left blank.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Secondary Contact Name"
              name="secondaryContactName"
              autoComplete="section-secondary name"
              value={formData.secondaryContactName}
              isEditing={isEditing}
              onChange={(value) => updateField("secondaryContactName", value)}
            />

            <BookingEditField
              label="Secondary Contact Phone"
              name="secondaryContactPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="section-secondary tel"
              pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
              title="Enter a 10-digit phone number"
              value={formData.secondaryContactPhone}
              isEditing={isEditing}
              onChange={(value) => updateField(
                "secondaryContactPhone",
                formatSecondaryContactPhone(value)
              )}
            />

            <BookingEditField
              label="Secondary Contact Email"
              name="secondaryContactEmail"
              type="email"
              autoComplete="section-secondary email"
              value={formData.secondaryContactEmail}
              isEditing={isEditing}
              onChange={(value) => updateField("secondaryContactEmail", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaCalendarAlt />
            <div>
              <h4>Rental Details</h4>
              <p>Dates, guest count, and whether the booking is cancelled or waitlisted. Contract, deposit and other progress is tracked in the guest portal.</p>
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
              label="Booking"
              value={formData.classification}
              isEditing={isEditing}
              options={getBookingClassificationOptions(booking)}
              readOnlyReason={
                formData.classification === "archive"
                  ? "Archive records cannot be reclassified."
                  : ""
              }
              onChange={(value) => updateField("classification", value)}
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
              readOnlyReason={housingReadOnlyReason}
              onChange={(value) => updateField("roomName", value)}
            />

            <BookingEditField
              label="Buildings / Rooms"
              value={formData.buildingsRooms}
              isEditing={isEditing}
              readOnlyReason={housingReadOnlyReason}
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


/* =========================================================
   ADAPTIVE BOOKING OVERVIEW
========================================================= */

const OVERVIEW_EMPTY_TEXT_VALUES = new Set([
  "",
  "—",
  "no email provided",
  "no phone provided",
  "no contact name",
]);

function hasBookingOverviewValue(value) {
  if (value === 0 || value === false) {
    return true;
  }

  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      hasBookingOverviewValue(item)
    );
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  const text = String(value).trim();

  if (!text) {
    return false;
  }

  return !OVERVIEW_EMPTY_TEXT_VALUES.has(
    text.toLowerCase()
  );
}


function firstBookingOverviewValue(...values) {
  return (
    values.find((value) =>
      hasBookingOverviewValue(value)
    ) ?? ""
  );
}


function getBookingRawValue(
  booking,
  possibleColumnNames
) {
  if (!booking?.rawSpreadsheetData) {
    return "";
  }

  return (
    readSpreadsheetCell(
      booking.rawSpreadsheetData,
      possibleColumnNames
    ) || ""
  );
}


function formatBookingOverviewValue(value) {
  if (!hasBookingOverviewValue(value)) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) =>
        hasBookingOverviewValue(item)
      )
      .map((item) =>
        formatBookingOverviewValue(item)
      )
      .join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function formatBookingOverviewTime(value) {
  if (!value) return "—";

  const time = String(value).trim();

  // Already formatted
  if (
    time.toLowerCase().includes("am") ||
    time.toLowerCase().includes("pm")
  ) {
    return time;
  }

  const parts = time.split(":");

  if (parts.length < 2) {
    return time;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return time;
  }

  const date = new Date();

  date.setHours(hours);
  date.setMinutes(minutes);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}


function formatBookingOverviewMoney(value) {
  if (!hasBookingOverviewValue(value)) {
    return "";
  }

  const text = String(value).trim();

  if (text.startsWith("$")) {
    return text;
  }

  const numberValue = Number(
    text.replace(/[$,\s]/g, "")
  );

  if (!Number.isFinite(numberValue)) {
    return text;
  }

  return numberValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}


function getBookingOverviewStatusClass(status) {
  const normalizedStatus = String(
    status || ""
  )
    .trim()
    .toLowerCase();

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

  if (
    normalizedStatus.includes("inquiry") ||
    normalizedStatus.includes("lead")
  ) {
    return "status-inquiry";
  }

  return "status-neutral";
}

function parseBookingOverviewNumber(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const numeric = Number(
    text.replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(numeric)
    ? numeric
    : null;
}


function BookingOverviewField({
  label,
  value,
  icon: Icon,
  multiline = false,
  tone = "default",
  showEmpty = false,
}) {
  if (
    !showEmpty &&
    !hasBookingOverviewValue(value)
  ) {
    return null;
  }

  return (
    <div
      className={[
        "booking-overview-field",

        multiline
          ? "booking-overview-field-multiline"
          : "",

        tone !== "default"
          ? `booking-overview-field-${tone}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <small>
        {Icon && (
          <Icon className="booking-overview-field-label-icon" />
        )}

        <span>{label}</span>
      </small>

      <strong>
        {formatBookingOverviewValue(value)}
      </strong>
    </div>
  );
}


function BookingOverviewFieldGrid({
  fields = [],
  columns = 2,
}) {
  const visibleFields = fields.filter(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <div
      className={`booking-overview-field-grid booking-overview-field-grid-${columns}`}
    >
      {visibleFields.map((field) => (
        <BookingOverviewField
          key={field.label}
          {...field}
        />
      ))}
    </div>
  );
}

function BookingOverviewSection({
  icon: Icon,
  eyebrow,
  title,
  fields = [],
  groups = [],
  columns = 2,
  wide = false,
  className = "",
  children,
}) {
  const hasVisibleFields = fields.some(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );

  const visibleGroups = groups.filter(
    (group) =>
      (group.fields || []).some(
        (field) =>
          field.showEmpty ||
          hasBookingOverviewValue(field.value)
      )
  );

  if (
    !hasVisibleFields &&
    visibleGroups.length === 0 &&
    !children
  ) {
    return null;
  }

  return (
    <article
      className={[
        "booking-overview-card",

        wide
          ? "booking-overview-card-wide"
          : "",

        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="booking-overview-card-header">
        <span className="booking-overview-card-icon">
          <Icon />
        </span>

        <div>
          {eyebrow && <p>{eyebrow}</p>}
          <h3>{title}</h3>
        </div>
      </header>

      {hasVisibleFields && (
        <BookingOverviewFieldGrid
          fields={fields}
          columns={columns}
        />
      )}

      {visibleGroups.length > 0 && (
        <div className="booking-overview-subsections">
          {visibleGroups.map(
            (group, index) => (
              <section
                className="booking-overview-subsection"
                key={`${title}-${group.title}-${index}`}
              >
                {group.title && (
                  <h4>{group.title}</h4>
                )}

                <BookingOverviewFieldGrid
                  fields={group.fields}
                  columns={
                    group.columns || 2
                  }
                />
              </section>
            )
          )}
        </div>
      )}

      {children}
    </article>
  );
}

function BookingOverviewGuestCard({
  icon: Icon,
  title,
  subtitle,
  fields = [],
  tone = "default",
}) {
  const visibleFields = fields.filter(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );

  if (visibleFields.length === 0) {
    return null;
  }

  const rowFields = visibleFields.filter(
    (field) => !field.multiline
  );

  const noteFields = visibleFields.filter(
    (field) => field.multiline
  );

  return (
    <section
      className={[
        "booking-overview-guest-card",
        `booking-overview-guest-card-${tone}`,
      ].join(" ")}
    >
      <div className="booking-overview-guest-card-header">
        <span className="booking-overview-guest-card-icon">
          <Icon />
        </span>

        <div>
          <h3>{title}</h3>
          {/* <p>{subtitle}</p> */}
        </div>
      </div>

      <div className="booking-overview-guest-card-list">
        {rowFields.map((field) => {
          const FieldIcon = field.icon;

          return (
            <div
              className="booking-overview-guest-row"
              key={field.label}
            >
              <div className="booking-overview-guest-row-label">
                {FieldIcon && (
                  <FieldIcon className="booking-overview-guest-row-label-icon" />
                )}

                <span>{field.label}</span>
              </div>

              <strong>
                {formatBookingOverviewValue(
                  field.value
                )}
              </strong>
            </div>
          );
        })}
      </div>

      {noteFields.length > 0 && (
        <div className="booking-overview-guest-notes">
          {noteFields.map((field) => {
            const FieldIcon = field.icon;

            return (
              <div
                className="booking-overview-guest-note"
                key={field.label}
              >
                <div className="booking-overview-guest-note-label">
                  {FieldIcon && (
                    <FieldIcon className="booking-overview-guest-row-label-icon" />
                  )}

                  <span>{field.label}</span>
                </div>

                <div className="booking-overview-guest-note-value">
                  {formatBookingOverviewValue(
                    field.value
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


function BookingOverviewGuestShowcase({
  estimatedGuests,
  actualGuests,
  minimumGuarantee,
  maximumGuarantee,
  numberOfNights,
  numberOfMeals,
  approximateGuestFields,
  actualGuestFields,
  dayCamperFields,
  ratesAndStayFields,
  setActiveTab,
}) {
  const estimatedNumber =
    parseBookingOverviewNumber(
      estimatedGuests
    );

  const actualNumber =
    parseBookingOverviewNumber(
      actualGuests
    );

  const difference =
    estimatedNumber !== null &&
    actualNumber !== null
      ? actualNumber - estimatedNumber
      : null;

  const guaranteeMinimumText =
    hasBookingOverviewValue(
      minimumGuarantee
    )
      ? formatBookingOverviewValue(
          minimumGuarantee
        )
      : "";

  const guaranteeMaximumText =
    hasBookingOverviewValue(
      maximumGuarantee
    )
      ? formatBookingOverviewValue(
          maximumGuarantee
        )
      : "";

  const guaranteeRangeText =
    guaranteeMinimumText &&
    guaranteeMaximumText
      ? `${guaranteeMinimumText} – ${guaranteeMaximumText}`
      : guaranteeMinimumText ||
        guaranteeMaximumText ||
        "—";

  let differenceText = "";
  let differenceClass =
    "booking-overview-guest-summary-meta-neutral";

  if (difference !== null) {
    if (difference < 0) {
      differenceText = `${Math.abs(
        difference
      )} fewer than estimated ↓`;
      differenceClass =
        "booking-overview-guest-summary-meta-down";
    } else if (difference > 0) {
      differenceText = `${difference} more than estimated ↑`;
      differenceClass =
        "booking-overview-guest-summary-meta-up";
    } else {
      differenceText =
        "Matches estimated total";
    }
  }

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-guest-showcase">

      <div className="booking-overview-guest-showcase-header">
        <div className="booking-overview-guest-showcase-title">
          <span className="booking-overview-guest-showcase-title-icon">
            <FaUsers />
          </span>

          <div>
            <p>Guests</p>
            <h2>Guest Information</h2>
            {/* <span>
              Group size, attendance details, and stay preferences for this retreat.
            </span> */}
          </div>
        </div>

        <button
          type="button"
          className="booking-overview-guest-showcase-edit"
          onClick={() =>
            setActiveTab("Details")
          }
        >
          <FaPen />
          <span>Edit Information</span>
        </button>
      </div>


      <div className="booking-overview-guest-summary">
        <div className="booking-overview-guest-summary-block">
          <span className="booking-overview-guest-summary-icon">
            <FaUsers />
          </span>

          <div className="booking-overview-guest-summary-copy">
            <small>
              Total Guests (Estimated)
            </small>

            <div className="booking-overview-guest-summary-main">
              <strong>
                {formatBookingOverviewValue(
                  estimatedGuests
                )}
              </strong>

              <div className="booking-overview-guest-summary-sidecopy">
                <span>
                  {guaranteeRangeText}
                </span>
                <em>guarantee range</em>
              </div>
            </div>
          </div>
        </div>


        <div className="booking-overview-guest-summary-block">
          <span className="booking-overview-guest-summary-icon">
            <FaUsers />
          </span>

          <div className="booking-overview-guest-summary-copy">
            <small>
              Total Guests (Actual)
            </small>

            <div className="booking-overview-guest-summary-main">
              <strong>
                {formatBookingOverviewValue(
                  actualGuests
                )}
              </strong>

              {differenceText && (
                <div
                  className={`booking-overview-guest-summary-meta ${differenceClass}`}
                >
                  {differenceText}
                </div>
              )}
            </div>
          </div>
        </div>


        <div className="booking-overview-guest-summary-block">
          <span className="booking-overview-guest-summary-icon">
            <FaMoon />
          </span>

          <div className="booking-overview-guest-summary-copy">
            <small>
              Stay Details
            </small>

            <div className="booking-overview-guest-stay-values">
              <div>
                <FaBed />
                <strong>
                  {formatBookingOverviewValue(
                    numberOfNights
                  )}
                </strong>
                <span>nights</span>
              </div>

              <div>
                <FaUtensils />
                <strong>
                  {formatBookingOverviewValue(
                    numberOfMeals
                  )}
                </strong>
                <span>meals</span>
              </div>
            </div>
          </div>
        </div>
      </div>


      <div className="booking-overview-guest-cards">
        <BookingOverviewGuestCard
          icon={FaUsers}
          title="Approximate Guests"
          subtitle="Initial expected group size and guarantees."
          fields={approximateGuestFields}
          tone="green"
        />

        <BookingOverviewGuestCard
          icon={FaUser}
          title="Actual Guests"
          subtitle="Recorded attendance and demographic details."
          fields={actualGuestFields}
          tone="blue"
        />

        <BookingOverviewGuestCard
          icon={FaDollarSign}
          title="Rates & Stay"
          subtitle="Pricing and duration details for this retreat."
          fields={ratesAndStayFields}
          tone="sand"
        />

        <BookingOverviewGuestCard
          icon={FaUsers}
          title="Day Campers"
          subtitle="Day-use attendance and meal service."
          fields={dayCamperFields}
          tone="teal"
        />
      </div>

    </section>
  );
}


function BookingOverviewSourceData({
  booking,
}) {
  const rawData =
    booking?.rawSpreadsheetData;

  if (
    !rawData ||
    typeof rawData !== "object"
  ) {
    return null;
  }

  const ignoredKeys = new Set([
    "sourceSheet",
    "sourceRowNumber",
  ]);

  const entries = Object.entries(rawData)
    .filter(
      ([key, value]) =>
        !ignoredKeys.has(key) &&
        hasBookingOverviewValue(value)
    );

  if (entries.length === 0) {
    return null;
  }

  return (
    <details className="booking-overview-source-data booking-overview-card booking-overview-card-wide">
      <summary>
        <span className="booking-overview-card-icon">
          <FaTable />
        </span>

        <div>
          <p>Imported record</p>
          <h3>Original Source Data</h3>
          <small>
            View the original spreadsheet values
            stored with this booking.
          </small>
        </div>

        <strong>
          {entries.length} field
          {entries.length === 1 ? "" : "s"}
        </strong>
      </summary>

      <div className="booking-overview-source-grid">
        {entries.map(([key, value]) => (
          <div
            className="booking-overview-source-field"
            key={key}
          >
            <small>{key}</small>

            <strong>
              {formatBookingOverviewValue(
                value
              )}
            </strong>
          </div>
        ))}
      </div>
    </details>
  );
}


function BookingOverview({
  booking,
  dateSettings,
  setActiveTab,
  onSaveBooking,
}) {
  const details =
    booking.rentalFormDetails || {};

  const secondaryContact = getSecondaryContact(booking);
  const hasSecondaryContact =
    Object.values(secondaryContact).some(Boolean);

  const sourceType =
    booking.detectedImportType ||
    booking.sourceType ||
    "Booking";

  const normalizedSourceType =
    String(sourceType)
      .trim()
      .toLowerCase();

  const isStaffRecord =
    isStaffBookingRecord(booking);

  const isMasterRecord =
    /^master 20\d{2}$/.test(normalizedSourceType);

  const isArchiveRecord =
    normalizedSourceType.includes(
      "archive"
    ) ||
    String(booking.retreatType || "")
      .trim()
      .toLowerCase() === "archive";


  /* =====================================================
     VALUES THAT CAN COME FROM DIFFERENT SOURCES
  ===================================================== */

  const actualAdults =
    firstBookingOverviewValue(
      details.actualAdultGuests,

      getBookingRawValue(booking, [
        "Actual # of Adults",
        "Actual Adults",
      ])
    );

  const approxChildrenUnder3 =
    firstBookingOverviewValue(
      details.approxChildrenUnder3,

      getBookingRawValue(booking, [
        "Approx. # of Minors under 3",
        "Approx # of Minors under 3",
        "Estimated # of Minors under 3",
      ])
    );

  const approxChildren3to17 =
    firstBookingOverviewValue(
      details.approxChildren3to17,
      details.approxChildrenGuests,

      getBookingRawValue(booking, [
        "Approx. # of Minors 3 to 17",
        "Approx # of Minors 3 to 17",
        "Estimated # of Minors 3 to 17",
      ])
    );

  const actualChildrenUnder3 =
    firstBookingOverviewValue(
      details.actualChildrenUnder3,

      getBookingRawValue(booking, [
        "Actual # of Minors under 3",
        "Minors under 3",
      ])
    );

  const actualChildren3to17 =
    firstBookingOverviewValue(
      details.actualChildren3to17,
      details.actualChildrenGuests,

      getBookingRawValue(booking, [
        "Actual # of Minors 3 to 17",
        "Minors 3 to 17",
        "Actual # of Children",
        "Actual Children",
      ])
    );

  const importedDayUseGuests =
    getBookingRawValue(booking, [
      "Actual # of Day Use Guests",
      "Day Use Guests",
    ]);

  const dayCamperCount =
    firstBookingOverviewValue(
      details.dayCamperCount,
      importedDayUseGuests
    );

  const dayCamperMeals =
    firstBookingOverviewValue(
      details.dayCamperMeals
    );

  const parsedDayCamperCount =
    parseBookingOverviewNumber(
      dayCamperCount
    );

  const parsedDayCamperMeals =
    parseBookingOverviewNumber(
      dayCamperMeals
    );

  const dayCamperMealServings =
    firstBookingOverviewValue(
      details.dayCamperMealServings,

      parsedDayCamperCount !== null &&
      parsedDayCamperMeals !== null
        ? String(
            parsedDayCamperCount *
            parsedDayCamperMeals
          )
        : ""
    );

  const parsedDayCamperMealServings =
    parseBookingOverviewNumber(
      dayCamperMealServings
    );

  const dayCamperCamperDays =
    firstBookingOverviewValue(
      details.dayCamperCamperDays,

      parsedDayCamperMealServings !== null
        ? String(
            parsedDayCamperMealServings *
            0.2
          )
        : ""
    );

  const minimumGuarantee =
    firstBookingOverviewValue(
      details.minimumGuarantee,
      booking.minPayingGuests
    );

  const maximumGuarantee =
    firstBookingOverviewValue(
      details.maximumGuarantee,
      booking.maxPayingGuests
    );

  const numberOfNights =
    firstBookingOverviewValue(
      details.numberOfNights,
      booking.nights
    );

  const numberOfMeals =
    firstBookingOverviewValue(
      details.numberOfMeals,
      booking.mealCount
    );

  const mailingAddress =
    firstBookingOverviewValue(
      details.mailingAddress,
      booking.inquiryAddress,

      [
        booking.archiveAddress,
        booking.archiveCity,
        booking.archiveState,
        booking.archiveZip,
      ]
        .filter(Boolean)
        .join(", ")
    );

  const adultRate =
    firstBookingOverviewValue(
      details.adultRateQuoted,
      booking.guestRate
    );

  const depositAmount =
    firstBookingOverviewValue(
      details.depositAmount,
      booking.deposit
    );

  const depositReceived =
    firstBookingOverviewValue(
      details.depositReceivedDate
        ? formatBookingDetailDate(
            details.depositReceivedDate,
            dateSettings
          )
        : "",
      booking.depositReceived
    );


  /* =====================================================
     SUMMARY
  ===================================================== */

  const summaryDateRange =
    formatBookingDetailDateRange(
      booking.startDate,
      booking.endDate,
      dateSettings
    );

  // Housing tab values once saved; never the stale imported label (AUDIT-007).
  const summaryHousing =
    getBookingLodgingDisplayText(booking);

  const summaryGuests =
    firstBookingOverviewValue(
      booking.attendeeCount,
      booking.persons
    );

  const hasApproxAdults =
    hasBookingOverviewValue(
      details.approxAdultGuests
    );

  const hasApproxChildrenUnder3 =
    hasBookingOverviewValue(
      approxChildrenUnder3
    );

  const hasApproxChildren3to17 =
    hasBookingOverviewValue(
      approxChildren3to17
    );

  const calculatedApproxTotal =
    hasApproxAdults ||
    hasApproxChildrenUnder3 ||
    hasApproxChildren3to17
      ? String(
          Number(
            details.approxAdultGuests || 0
          ) +
          Number(
            approxChildrenUnder3 || 0
          ) +
          Number(
            approxChildren3to17 || 0
          )
        )
      : "";

  /*
    Match CreateBooking's save behavior:
    prefer the detailed adult/child breakdown when
    one exists, then fall back to the original
    estimated total from an inquiry/import.
  */
  const estimatedGuests =
    firstBookingOverviewValue(
      calculatedApproxTotal,
      details.approxTotalGuests,
      summaryGuests
    );

  const hasActualAdults =
    String(actualAdults || "").trim() !== "";

  const hasActualChildrenUnder3 =
    String(actualChildrenUnder3 || "").trim() !== "";

  const hasActualChildren3to17 =
    String(actualChildren3to17 || "").trim() !== "";

  const calculatedActualTotal =
    hasActualAdults ||
    hasActualChildrenUnder3 ||
    hasActualChildren3to17
      ? String(
          Number(actualAdults || 0) +
          Number(actualChildrenUnder3 || 0) +
          Number(actualChildren3to17 || 0)
        )
      : "";

  // Master totals may include a partial age breakdown or day-use guests.
  // Estimated 2027 totals must not be presented as actual attendance.
  const actualGuests = isMasterRecord
    ? details.importedGuestCountKind === "estimated"
      ? calculatedActualTotal
      : firstBookingOverviewValue(summaryGuests, calculatedActualTotal)
    : firstBookingOverviewValue(calculatedActualTotal, summaryGuests);

  const summaryProgram =
    firstBookingOverviewValue(
      booking.retreatType,
      sourceType
    );


  /* =====================================================
    CREATE-BOOKING-STYLE OVERVIEW GROUPS
  ===================================================== */


  /* =====================================================
    GUEST INFORMATION
  ===================================================== */

  const approximateGuestFields = [
    {
      label: "Estimated Total Guests",
      value: estimatedGuests,
      icon: FaUsers,
    },

    {
      label: "Adults",
      value: details.approxAdultGuests,
      icon: FaUser,
    },

    {
      label: "Under 3",
      value: approxChildrenUnder3,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "Ages 3–17",
      value: approxChildren3to17,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "Minimum Guarantee",
      value: minimumGuarantee,
      icon: FaUserMinus,
    },

    {
      label: "Maximum Guarantee",
      value: maximumGuarantee,
      icon: FaUserPlus,
    },
  ];


  const actualGuestFields = [
    {
      label: "Total / Recorded Guests",
      value: actualGuests,
      showEmpty: true,
      icon: FaUsers,
    },

    {
      label: "Adults",
      value: actualAdults,
      icon: FaUser,
    },

    {
      label: "Under 3",
      value: actualChildrenUnder3,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "Ages 3–17",
      value: actualChildren3to17,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "# Persons",
      value: booking.persons,
      icon: FaUsers,
    },

    {
      label: "Ethnic Breakdown",
      value: details.ethnicBreakdown,
      icon: FaGlobeAmericas,
      multiline: true,
    },
  ];


  const dayCamperFields = [
    {
      label: "# of Day Campers",
      value: dayCamperCount,
      icon: FaUsers,
    },

    {
      label: "Meals per Camper",
      value: dayCamperMeals,
      icon: FaUtensils,
    },

    {
      label: "Day Camper Meal Servings",
      value: dayCamperMealServings,
      icon: FaUtensils,
    },

    {
      label: "Camper Days from Day Campers",
      value: hasBookingOverviewValue(
        dayCamperCamperDays
      )
        ? Number(
            dayCamperCamperDays
          ).toFixed(3)
        : "",
      icon: FaCalendarAlt,
    },
  ];

  const ratesAndStayFields = [
    {
      label: "Adult / Guest Rate",
      value: formatBookingOverviewMoney(
        adultRate
      ),
      icon: FaDollarSign,
    },

    {
      label: "Child Rate (3–17)",
      value: formatBookingOverviewMoney(
        details.childRateQuoted
      ),
      icon: FaDollarSign,
    },

    {
      label: "Child Rate (1–3, spreadsheet)",
      value: formatBookingOverviewMoney(
        details.childUnder3RateQuoted
      ),
      icon: FaDollarSign,
    },

    {
      label: "# Nights",
      value: numberOfNights,
      icon: FaMoon,
    },

    {
      label: "# Meals",
      value: numberOfMeals,
      icon: FaUtensils,
    },

    {
      label: "Camper Days",
      value: booking.camperDays,
      icon: FaCalendarAlt,
    },
  ];


  /* =====================================================
    BOOKING TIMELINE
  ===================================================== */

  const timelineFields = [
    {
      label: "Inquiry Date",
      value: details.inquiryDate
        ? formatBookingDetailDate(
            details.inquiryDate,
            dateSettings
          )
        : "",
    },

    {
      label: "Contract Sent",
      value: details.contractSentDate
        ? formatBookingDetailDate(
            details.contractSentDate,
            dateSettings
          )
        : details.importedContractSentStatus || "",
    },

    {
      label: "Return Contract By",
      value: details.returnContractByDate
        ? formatBookingDetailDate(
            details.returnContractByDate,
            dateSettings
          )
        : "",
    },

    {
      label: "Contract Returned",
      value: details.contractReturnedDate
        ? formatBookingDetailDate(
            details.contractReturnedDate,
            dateSettings
          )
        : details.importedContractReturnedStatus || "",
    },
  ];


  /* =====================================================
    PAYMENTS & DOCUMENTS
  ===================================================== */

  const paymentDocumentFields = [
    {
      label: "Deposit Received",
      value: depositReceived,
    },

    {
      label: "Deposit Amount",
      value: formatBookingOverviewMoney(
        depositAmount
      ),
    },

    {
      label: "Insurance Certificate",
      value:
        details.insuranceCertificateDate
          ? formatBookingDetailDate(
              details.insuranceCertificateDate,
              dateSettings
            )
          : "",
    },

    {
      label: "Notification Date",
      value: details.notificationDate
        ? formatBookingDetailDate(
            details.notificationDate,
            dateSettings
          )
        : "",
    },

    {
      label: "Payment Method",
      value: details.paymentMethod,
    },
  ];


  const guestReportedDocumentFields = [
    {
      label: "Guest Reported Contract Returned",
      value:
        details.guestReportedContractReturnedDate
          ? formatBookingDetailDate(
              details.guestReportedContractReturnedDate,
              dateSettings
            )
          : "",
    },

    {
      label: "Guest Reported Deposit Sent",
      value:
        details.guestReportedDepositSentDate
          ? formatBookingDetailDate(
              details.guestReportedDepositSentDate,
              dateSettings
            )
          : "",
    },

    {
      label: "Guest Reported Insurance Sent",
      value:
        details.guestReportedInsuranceCertificateSentDate
          ? formatBookingDetailDate(
              details.guestReportedInsuranceCertificateSentDate,
              dateSettings
            )
          : "",
    },
  ];


  const billingFields = [
    {
      label: "Expected Minimum Revenue",
      value: formatBookingOverviewMoney(
        booking.expectedMinimumRevenue
      ),
    },

    {
      label: "Invoice — Lodging & Meals",
      value: formatBookingOverviewMoney(
        booking.invoiceLodgingMeals
      ),
    },

    {
      label: "Usage Fee",
      value: formatBookingOverviewMoney(
        booking.usageFee
      ),
    },

    {
      label: "Lodging",
      value: formatBookingOverviewMoney(
        booking.lodgingCost
      ),
    },

    {
      label: "Food",
      value: formatBookingOverviewMoney(
        booking.foodCost
      ),
    },

    {
      label: "Misc.",
      value: formatBookingOverviewMoney(
        booking.miscCost
      ),
    },

    {
      label: "Monthly Projected Income",
      value: formatBookingOverviewMoney(
        booking.monthlyProjectedIncome
      ),
    },
  ];


/* =====================================================
  LODGING & LINENS
===================================================== */

// Same building list and lodging reader as every other screen (AUDIT-031).
const overviewLodgingAssignments =
  getBookingLodgingAssignments(booking);

const lodgingOverviewRows = LODGING_BUILDINGS.map((building) => {
  const assignment = overviewLodgingAssignments.find(
    (entry) => entry.buildingId === building.id
  );

  return {
    id: building.id,
    name: building.label,
    capacity: building.capacity,
    image: building.image,
    value: assignment
      ? assignment.count ?? "Used, count unknown"
      : "",
  };
});

const getLodgingOverviewValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return isMasterRecord ? "-" : 0;
  }

  return value;
};

const overviewLinenOption =
  details?.linenOption || (isMasterRecord ? "Not recorded" : "None");

const overviewLinenSets =
  firstBookingOverviewValue(
    details?.linenSets,
    isMasterRecord ? "" : booking.linenSets
  ) || (isMasterRecord ? "-" : 0);

const overviewLinenPieces =
  firstBookingOverviewValue(
    details?.linenPieces,
    isMasterRecord ? "" : booking.linenPieces
  ) || (isMasterRecord ? "-" : 0);

  /* =====================================================
    BOOKING STATUS
  ===================================================== */

  const statusFields = [
    {
      label: "Status",
      value: booking.status,
      showEmpty: true,
    },

    {
      label: "Stage of Group",
      value: firstBookingOverviewValue(
        booking.stageOfGroup,
        booking.inquiryDisposition
      ),
    },

    {
      label: "Returning / New",
      value: booking.returningStatus,
    },

    {
      label: "Waitlist",
      value: booking.waitlist,
    },
  ];


  const cancellationFields = [
    {
      label: "Date of Cancellation",
      value: booking.dateOfCancellation
        ? formatBookingDetailDate(
            booking.dateOfCancellation,
            dateSettings
          )
        : "",
    },

    {
      label: "Reason for Cancellation",
      value:
        booking.reasonForCancellation,
      multiline: true,
    },

    {
      label: "Vacancy Filled",
      value: booking.vacancyFilled,
    },
  ];


  /* =====================================================
    NOTES
  ===================================================== */

  const notesFields = [
    {
      label: "Booking Notes",
      value: booking.notes,
      multiline: true,
    },
    {
      label: "Spreadsheet Guest Description",
      value: isMasterRecord ? details.importedGuestCountText : "",
      multiline: true,
    },
    {
      label: "Import Review",
      value: Array.isArray(details.importWarnings)
        ? details.importWarnings.join("\n")
        : "",
      multiline: true,
    },
  ];


  const archiveFields = [
    { label: "Guest Group", value: booking.archiveGuestGroup },
    {
      label: "Visit Date",
      value: booking.archiveVisitDate
        ? formatBookingDetailDate(booking.archiveVisitDate, dateSettings)
        : "",
    },
    {
      label: "All Prior Visit Dates",
      value: booking.archiveAllPriorVisitDates,
      multiline: true,
    },
    { label: "Visit Count", value: booking.archiveVisitCount },
  ];

  const archiveLinks =
    Array.isArray(
      booking.archivePriorVisitLinks
    )
      ? booking.archivePriorVisitLinks
      : [];


  return (
    <div className="booking-overview-layout">

      {/* =====================================================
          LEFT PROFILE COLUMN
      ===================================================== */}

      <aside className="booking-overview-sidebar">

        <div className="booking-overview-identity">

          <div className="booking-overview-avatar">
            {getBookingInitials(
              booking.organizationName
            )}
          </div>

          <p>
            {sourceType}
          </p>

          <h3>
            {booking.organizationName}
          </h3>

          <span>
            {booking.retreatType ||
              "Retreat Booking"}
          </span>

        </div>


        <div className="booking-overview-sidebar-section">

          <div className="booking-overview-sidebar-heading">
            <FaCalendarAlt />

            <span>
              Stay Dates
            </span>
          </div>

          <strong>
            {summaryDateRange}
          </strong>

          {(details.arrivalTime ||
            details.departureTime) && (
            <div className="booking-overview-sidebar-times">

              {details.arrivalTime && (
                <span>
                  <small>Arrival</small>
                  <strong>
                    {formatBookingOverviewTime(details.arrivalTime)}
                  </strong>
                </span>
              )}

              {details.departureTime && (
                <span>
                  <small>Departure</small>
                  <strong>
                    {formatBookingOverviewTime(details.departureTime)}
                  </strong>
                </span>
              )}

            </div>
          )}

        </div>


        <div className="booking-overview-sidebar-section">

          <div className="booking-overview-sidebar-heading">
            <FaUser />

            <span>
              Primary Contact
            </span>
          </div>

          <strong>
            {formatBookingOverviewValue(
              booking.contactName
            )}
          </strong>

          {hasBookingOverviewValue(
            booking.email
          ) && (
            <a
              href={`mailto:${booking.email}`}
            >
              {booking.email}
            </a>
          )}

          {hasBookingOverviewValue(
            booking.phone
          ) && (
            <span className="booking-overview-sidebar-contact-line">
              {booking.phone}
            </span>
          )}

          {hasBookingOverviewValue(
            mailingAddress
          ) && (
            <span className="booking-overview-sidebar-contact-line">
              {mailingAddress}
            </span>
          )}

        </div>


        {hasSecondaryContact && (
          <div className="booking-overview-sidebar-section">
            <div className="booking-overview-sidebar-heading">
              <FaUserPlus />
              <span>Secondary Contact</span>
            </div>

            {secondaryContact.secondaryContactName && (
              <strong>{secondaryContact.secondaryContactName}</strong>
            )}

            {secondaryContact.secondaryContactEmail && (
              <a href={`mailto:${secondaryContact.secondaryContactEmail}`}>
                {secondaryContact.secondaryContactEmail}
              </a>
            )}

            {secondaryContact.secondaryContactPhone && (
              <a
                className="booking-overview-sidebar-contact-line"
                href={`tel:${secondaryContact.secondaryContactPhone.replace(/[^\d+]/g, "")}`}
              >
                {secondaryContact.secondaryContactPhone}
              </a>
            )}
          </div>
        )}


        <div className="booking-overview-sidebar-stats">

          <div>
            <small>Guests</small>

            <strong>
              {formatBookingOverviewValue(
                actualGuests
              )}
            </strong>
          </div>


          <div>
            <small>Nights</small>

            <strong>
              {formatBookingOverviewValue(
                numberOfNights
              )}
            </strong>
          </div>


          <div>
            <small>Meals</small>

            <strong>
              {formatBookingOverviewValue(
                numberOfMeals
              )}
            </strong>
          </div>

        </div>


        <div className="booking-overview-sidebar-actions">

          <button
            className="primary-dashboard-button"
            type="button"
            onClick={() =>
              setActiveTab("Details")
            }
          >
            Edit Booking
          </button>

        </div>


        {(booking.sourceSheet ||
          booking.sourceRowNumber) && (
          <div className="booking-overview-source-meta">

            {booking.sourceSheet && (
              <span>
                <small>Source</small>
                {booking.sourceSheet}
              </span>
            )}

            {booking.sourceRowNumber && (
              <span>
                <small>Row</small>
                {booking.sourceRowNumber}
              </span>
            )}

          </div>
        )}

      </aside>


      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <main className="booking-overview-main">

        <div className="booking-overview-grid">

          {/* =====================================================
              GUEST INFORMATION
          ===================================================== */}

          <BookingOverviewGuestShowcase
            estimatedGuests={estimatedGuests}
            actualGuests={actualGuests}
            minimumGuarantee={minimumGuarantee}
            maximumGuarantee={maximumGuarantee}
            numberOfNights={numberOfNights}
            numberOfMeals={numberOfMeals}
            approximateGuestFields={approximateGuestFields}
            actualGuestFields={actualGuestFields}
            dayCamperFields={dayCamperFields}
            ratesAndStayFields={ratesAndStayFields}
            setActiveTab={setActiveTab}
          />


          {/* =====================================================
              TIMELINE
          ===================================================== */}

          <BookingOverviewSection
            icon={FaCalendarAlt}
            eyebrow="Administration"
            title="Booking Timeline"
            groups={[
              {
                title: "Contract Dates",
                fields: timelineFields,
                columns: 2,
              },
            ]}
          />


          {/* =====================================================
              PAYMENTS + DOCUMENTS
          ===================================================== */}

          <BookingOverviewSection
            icon={FaDollarSign}
            eyebrow="Administration"
            title="Payments & Documents"
            groups={[
              {
                title: "Deposit & Documents",
                fields: paymentDocumentFields,
                columns: 2,
              },
              {
                title: "Guest-Reported Portal Dates",
                fields: guestReportedDocumentFields,
                columns: 2,
              },
              {
                title: "Billing & Revenue",
                fields: billingFields,
                columns: 2,
              },
            ]}
          />


          {/* =====================================================
              MEALS
          ===================================================== */}

          <BookingMealsProgramOverview
            booking={booking}
            details={details}
          />


          {/* =====================================================
              ACTIVITIES
          ===================================================== */}

          <BookingActivitiesOverview
            booking={booking}
            details={details}
            dateSettings={dateSettings}
          />


          {/* =====================================================
              FACILITIES
          ===================================================== */}

          <BookingFacilitiesOverview
            booking={booking}
            details={details}
            dateSettings={dateSettings}
          />


          {/* =====================================================
              LODGING
          ===================================================== */}

          <section className="rental-form-section booking-overview-lodging-section">

            <div className="rental-section-header">
              <span className="rental-section-icon">
                <FaBed />
              </span>

              <div>
                <h2>Lodging & Linens</h2>

                <p>
                  Guest assignments and linen requirements.
                </p>
              </div>
            </div>


            <div className="rental-section-body">

              {isMasterRecord && (
                <BookingOverviewFieldGrid
                  columns={1}
                  fields={[
                    {
                      label: isHousingAuthoritative(booking)
                        ? "Imported lodging note (reference only; the Housing tab is the lodging record)"
                        : "Spreadsheet Lodging",
                      value: details.importedLodgingText,
                      multiline: true,
                    },
                    {
                      label: "Spreadsheet Linen Instructions",
                      value: details.importedLinenText,
                      multiline: true,
                    },
                  ]}
                />
              )}

              {/* ===============================
                  LODGING
              =============================== */}

              <div className="rental-lodging-grid">
                {lodgingOverviewRows.map((lodging) => (
                  <div
                    className="rental-lodging-field booking-overview-lodging-card"
                    key={lodging.id}
                  >
                    <div className="rental-lodging-info">

                      {lodging.image && (
                        <img
                          className="rental-lodging-image"
                          src={lodging.image}
                          alt=""
                        />
                      )}

                      <span className="rental-lodging-text">
                        <strong>{lodging.name}</strong>

                        {lodging.capacity && (
                          <small>
                            Capacity {lodging.capacity}
                          </small>
                        )}
                      </span>

                    </div>


                    <div className="booking-overview-lodging-count">
                      {getLodgingOverviewValue(
                        lodging.value
                      )}
                    </div>
                  </div>
                ))}
              </div>


              {/* ===============================
                  LINENS
              =============================== */}

              <div className="booking-overview-linens">

                <h3>Linens</h3>

                <div className="booking-overview-linen-grid">

                  <div className="booking-overview-linen-item">
                    <span>Linen Option</span>

                    <strong>
                      {overviewLinenOption}
                    </strong>
                  </div>


                  <div className="booking-overview-linen-item">
                    <span>Linen Sets</span>

                    <strong>
                      {overviewLinenSets}
                    </strong>
                  </div>

                  <div className="booking-overview-linen-item">
                    <span>Linen Pieces</span>

                    <strong>
                      {overviewLinenPieces}
                    </strong>
                  </div>

                </div>



              </div>

            </div>

          </section>


          {/* =====================================================
              BOOKING STATUS
          ===================================================== */}

          <BookingOverviewSection
            icon={FaFileContract}
            eyebrow="Workflow"
            title="Booking Status"
            groups={[
              {
                title: "Current State",
                fields: statusFields,
                columns: 2,
              },
              {
                title: "Cancellation",
                fields:
                  cancellationFields,
                columns: 1,
              },
            ]}
          />


          {/* =====================================================
              NOTES
          ===================================================== */}

          <BookingOverviewSection
            icon={FaInfoCircle}
            eyebrow="Internal"
            title="Additional Notes"
            fields={notesFields}
            columns={1}
          />


          {/* =====================================================
              ARCHIVE
          ===================================================== */}

          {isArchiveRecord && (
            <BookingOverviewSection
              icon={FaClock}
              eyebrow="Historical Record"
              title="Archive Information"
              fields={archiveFields}
              columns={2}
              wide
            >
              {(booking.archiveSourcePdfLink ||
                archiveLinks.length > 0) && (
                <div className="booking-overview-archive-links">

                  {booking.archiveSourcePdfLink && (
                    <a
                      href={
                        booking.archiveSourcePdfLink
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FaExternalLinkAlt />
                      Source PDF
                    </a>
                  )}

                  {archiveLinks.map(
                    (link, index) => (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        key={`${link}-${index}`}
                      >
                        <FaExternalLinkAlt />
                        Prior Visit{" "}
                        {index + 1}
                      </a>
                    )
                  )}

                </div>
              )}
            </BookingOverviewSection>
          )}

        </div>


        {/* ===================================================
            INCIDENT NOTES
        =================================================== */}

        <BookingIncidentNotesCard
          booking={booking}
          onSaveBooking={onSaveBooking}
        />


        {/* ===================================================
            RAW SPREADSHEET DATA
        =================================================== */}

        <BookingOverviewSourceData
          booking={booking}
        />

      </main>

    </div>
  );
}

function BookingDetailView({
  booking,
  activeTab,
  setActiveTab,
  onBack,
    onSaveBooking,
  onDeleteBooking,
  staffUsers,
  currentStaffUserId,
  canDeleteBookings = true,
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

    const statusClass =
    getBookingOverviewStatusClass(
      getBookingDisplayState(booking).label
    );

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
                    {/* The database lets only admins delete bookings (AUDIT-023). */}
          {canDeleteBookings && (
          <button
            className="booking-profile-delete-button"
            type="button"
            onClick={() => onDeleteBooking(booking)}
          >
            <FaTrashAlt />
            Delete
          </button>
          )}

          <button
            className="secondary-dashboard-button booking-date-settings-button"
            type="button"
            onClick={() => setIsDateSettingsOpen(true)}
          >
            <FaCog />
            Date Display
          </button>

                    <span className={`booking-profile-status ${statusClass}`}>
            {getBookingDisplayState(booking).label}
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
            {tab === "Details" ? "Edit" : tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <BookingOverview
          booking={booking}
          dateSettings={dateSettings}
          setActiveTab={setActiveTab}
          onSaveBooking={onSaveBooking}
        />
      )}

{activeTab === "Details" && (
  <div className="booking-details-tab-stack">

    {isStaffBookingRecord(booking) ? (
            <CreateBooking
        key={`edit-booking-${booking.id}`}
        existingBooking={booking}
        onBookingUpdated={onSaveBooking}
        staffUsers={staffUsers}
        embedded
      />
    ) : (
      <BookingDetailsEditForm
        booking={booking}
        onSaveBooking={onSaveBooking}
      />
    )}

  </div>
)}

{activeTab === "Housing" && (
  <BookingHousingTab
    booking={booking}
    onSaveBooking={onSaveBooking}
  />
)}

{activeTab === "Staff Assignments" && (
  <BookingStaffAssignmentsTab
    key={booking.id}
    booking={booking}
    onSaveBooking={onSaveBooking}
    staffUsers={staffUsers}
  />
)}

{activeTab === "Checklists" && (
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
  activeTab !== "Staff Assignments" &&
  activeTab !== "Checklists" && (
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
  staffDirectoryStatus = { checked: false, shared: false, reason: "" },
  unlistedStaffNames = [],
  onCopyBrowserListToShared,
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
  };

  const addUnlistedName = (name) => {
    updateUsers([
      ...staffUsers,
      {
        id: createStaffUserId(),
        name,
        email: "",
        role: "Staff",
        active: true,
      },
    ]);
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
      setCurrentStaffUserId("");
      saveCurrentStaffUserId("");
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
                The staff directory used for checklist, staff and facility
                assignments. It is separate from sign-in accounts: everyone
                shares one login, so "Working as" on each computer records
                who did something.
              </span>
            </div>
          </div>

                    <label className="admin-current-user-picker">
            <span>Working as (this computer)</span>

            <select
              value={currentStaffUserId}
              onChange={(event) => {
                setCurrentStaffUserId(event.target.value);
                saveCurrentStaffUserId(event.target.value);
              }}
            >
              <option value="">Choose your name…</option>
              {activeUsers.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {staffDirectoryStatus.checked && (
          <div
            className={`admin-directory-status ${
              staffDirectoryStatus.shared ? "is-shared" : "is-local"
            }`}
            role="status"
          >
            {staffDirectoryStatus.shared ? (
              <>
                <strong>Shared staff directory</strong>
                <span>
                  The same list on every computer. "Working as" is remembered
                  per computer and is what checklist "completed by" records.
                </span>
                {onCopyBrowserListToShared && (
                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={onCopyBrowserListToShared}
                  >
                    Copy this browser's old list into it
                  </button>
                )}
              </>
            ) : (
              <>
                <strong>Using this browser's staff list</strong>
                <span>
                  {staffDirectoryStatus.reason} Changes here are saved only on
                  this computer until the staff directory migration is run.
                </span>
              </>
            )}
          </div>
        )}

        {unlistedStaffNames.length > 0 && (
          <div className="admin-unlisted-names">
            <strong>Names on bookings that are not in the directory</strong>
            <span>
              They were typed on checklist items or staff assignments. Add the
              ones that are real staff members; nothing is added or matched
              automatically.
            </span>
            <ul>
              {unlistedStaffNames.map((name) => (
                <li key={name}>
                  {name}
                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={() => addUnlistedName(name)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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



/* =========================================================
   DASHBOARD HOME — OPERATIONAL HELPERS
========================================================= */

function getDashboardHomeDay(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function getDashboardHomeBookingDate(value) {
  if (!value) {
    return null;
  }

  return getLocalDate(value);
}

function isDashboardHomeSameDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) {
    return false;
  }

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function dashboardHomeBookingTouchesDate(booking, date) {
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
function isDashboardHomeInactiveBooking(booking) {
  return !isActiveBooking(booking);
}

function dashboardHomeHasValue(value) {
  const text = String(value ?? "").trim();

  return text !== "" && !masterImportUnknown(text);
}

/*
  Records from the Inquiry Spreadsheet are inquiries: lodging and guest
  counts are not expected yet. Master and staff bookings are real bookings
  whatever their legacy status says (Q-007).
*/
function isDashboardHomePlainInquiry(booking) {
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

function getDashboardHomeGuestCount(booking) {
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
function getDashboardHomeHousingLabel(booking) {
  const text = getBookingLodgingDisplayText(booking);
  return text === "Unassigned" ? "Housing not assigned" : text;
}

function getDashboardHomeBuildingTags(booking) {
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


function dashboardHomeBookingNeedsHousing(booking) {
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

function formatDashboardHomeDateTile(date) {
  return {
    month: date.toLocaleDateString("en-US", {
      month: "short",
    }),
    day: date.getDate(),
  };
}


export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const today = new Date();

  const masterFileInputRef = useRef(null);
  const staffContactsFileInputRef = useRef(null);

  const master2026FileInputRef = useRef(null);
  const master2027FileInputRef = useRef(null);
  const importEverythingFileInputRef = useRef(null);
  const importDropdownRef = useRef(null);

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [activeView, setActiveView] = useState("Dashboard");


  const routes = {
    Dashboard: "/dashboard",
    Form: "/form",
    "Portal View": "/portal-admin",

    "Calendar View": "/calendar",
    "Lodging Calendar": "/lodging-calendar",
    "Inquiry Pipeline": "/inquiry-pipeline",
    [SPREADSHEET_VIEW_NAME]: "/master-spreadsheet",
    [INQUIRY_SPREADSHEET_VIEW_NAME]: "/inquiry-spreadsheet",
    "Contacts View": "/contacts",

    Reports: "/reports",
    Backup: "/backup",

    "User Admin": "/user-admin",
    Jobs: "/jobs",

    "Guest Inquiries": "/guest-inquiries",
  };

  useEffect(() => {
    const pathMap = Object.fromEntries(
      Object.entries(routes).map(([key, value]) => [value, key])
    );

    setActiveView(pathMap[location.pathname] || "Dashboard");
  }, [location.pathname]);
  const [hasOpenedSpreadsheetView, setHasOpenedSpreadsheetView] = useState(false);
  const [isSpreadsheetRevealLoading, setIsSpreadsheetRevealLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const spreadsheetRevealTimerRef = useRef(null);
  const spreadsheetRevealFrameRef = useRef(0);
  const spreadsheetRevealSecondFrameRef = useRef(0);

    const [staffUsers, setStaffUsersState] = useState(() => getSavedStaffUsers());

  const [currentStaffUserId, setCurrentStaffUserId] = useState(() =>
    getSavedCurrentStaffUserId(getSavedStaffUsers())
  );

  /*
    Shared staff directory (AUDIT-017). Until the staff_directory table
    exists, this browser's list keeps working and User Admin says so.
  */
  const [staffDirectoryStatus, setStaffDirectoryStatus] = useState({
    checked: false,
    shared: false,
    reason: "",
  });

  useEffect(() => {
    let cancelled = false;

    loadStaffDirectory(supabase).then((result) => {
      if (cancelled) {
        return;
      }

      setStaffDirectoryStatus({
        checked: true,
        shared: result.available,
        reason: result.reason,
      });

      if (result.available) {
        setStaffUsersState(result.users);
        setCurrentStaffUserId((currentId) =>
          result.users.some((user) => user.id === currentId) ? currentId : ""
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setStaffUsers = async (nextUsers) => {
    const previousUsers = staffUsers;
    setStaffUsersState(nextUsers);

    if (!staffDirectoryStatus.shared) {
      saveStaffUsers(nextUsers);
      return;
    }

    try {
      await saveStaffDirectoryChanges(supabase, previousUsers, nextUsers);
    } catch (error) {
      console.error("Could not save the shared staff directory:", error);
      alert(
        "The staff directory change was not saved. The list has been reloaded from the database."
      );
      const reloaded = await loadStaffDirectory(supabase);
      if (reloaded.available) {
        setStaffUsersState(reloaded.users);
      }
    }
  };

  const copyBrowserStaffListToSharedDirectory = async () => {
    const browserUsers = getSavedStaffUsers();
    const knownNames = new Set(
      staffUsers.map((user) => normalizeStaffName(user.name))
    );
    const usersToAdd = browserUsers
      .filter((user) => !knownNames.has(normalizeStaffName(user.name)))
      .map((user) => ({ ...user, id: createStaffUserId() }));

    if (usersToAdd.length === 0) {
      alert("Everyone in this browser's list is already in the shared directory.");
      return;
    }

    if (
      !window.confirm(
        `Add ${usersToAdd.length} people from this browser's list to the shared staff directory?\n\n` +
          usersToAdd.map((user) => user.name).join(", ")
      )
    ) {
      return;
    }

    await setStaffUsers([...staffUsers, ...usersToAdd]);
  };
  
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingDetailTab, setBookingDetailTab] = useState("Overview");
  const [bookingFormSeed, setBookingFormSeed] = useState(null);

  const [
    guestBookingSource,
    setGuestBookingSource,
  ] = useState(null);

  /*
    Shown above the booking form after a save. Lives outside the keyed
    CreateBooking so it survives the form resetting (AUDIT-026), and
    carries a retry when the website inquiry could not be marked (AUDIT-008).
  */
  const [bookingFormNotice, setBookingFormNotice] = useState(null);
  const [isRetryingConversion, setIsRetryingConversion] = useState(false);

    const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);

  /*
    The signed-in account's database role: admin, staff or viewer
    (staff_profiles). Controls the database would refuse are hidden. ""
    while unknown; then controls stay and the database still decides.
  */
  const [staffRole, setStaffRole] = useState("");
  const isViewOnlyAccount = staffRole === "viewer";
  const canDeleteBookings = staffRole === "" || staffRole === "admin";

  useEffect(() => {
    let cancelled = false;

    supabase.rpc("current_staff_role").then(({ data, error }) => {
      if (!cancelled && !error && typeof data === "string") {
        setStaffRole(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);
  // Dev Mode lives here so it survives view changes; resets on page reload.
  const [isDevMode, setIsDevMode] = useState(false);
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
      const expectedCount = publicInquiries.length;
      const deletedCount = await deleteAllBookings();

      if (deletedCount === 0 && expectedCount > 0) {
        alert(
          "Nothing was deleted. Only administrators can delete bookings."
        );
        return;
      }

      if (deletedCount < expectedCount) {
        alert(
          `Only ${deletedCount} of ${expectedCount} bookings were deleted. Reloading the list.`
        );
        await loadBookingsFromSupabase();
        return;
      }

      setPublicInquiries([]);
      setSelectedBooking(null);
      navigate("/dashboard")
    } catch (error) {
      console.error("Could not delete bookings from Supabase:", error);
      alert("Could not delete bookings from Supabase. Check the console.");
    }
  };

  const deleteSingleBooking = async (booking) => {
    if (!booking?.id) {
      return;
    }

    const bookingName =
      booking.organizationName || "this booking";

    const confirmed = window.confirm(
      `Delete "${bookingName}"?\n\nThis will permanently remove this booking. This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteBooking(booking.id);

      setPublicInquiries((currentInquiries) =>
        currentInquiries.filter(
          (inquiry) => inquiry.id !== booking.id
        )
      );

      setSelectedBooking(null);
      setBookingDetailTab("Overview");

      navigate("/master-spreadsheet")
    } catch (error) {
      console.error("Could not delete booking:", error);

      alert(
        error?.code === "BOOKING_NOT_PERMITTED"
          ? error.message
          : "Could not delete this booking. Check the console for more information."
      );
    }
  };


  /*
    Every booking edit goes through here. The booking's updatedAt is the
    value read from the database; the save is refused if anyone saved the
    booking since (AUDIT-045). Screens keep their unsaved edits when a save
    fails, so nothing typed is lost.
  */
    const saveBookingEdits = async (updatedBooking) => {
    if (isViewOnlyAccount) {
      const error = new Error(
        "This account is view-only, so changes cannot be saved. Ask an administrator for staff access."
      );
      error.code = "BOOKING_NOT_PERMITTED";
      alert(error.message);
      throw error;
    }

    try {
      const savedBooking = await saveBooking(updatedBooking);

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

      setSelectedBooking(
        savedBooking
      );

      return savedBooking;
    } catch (error) {
      console.error("Could not save booking to Supabase:", error);
      alert(getBookingSaveErrorMessage(error));
      throw error;
    }
  };

  const importSpreadsheet = async ({
    event,
    importTypeLabel,
    normalizeRow,
    expectedColumns,
  }) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const requestedMasterType =
      normalizeRow === normalizeMasterSpreadsheetRow ? "Master 2025" :
      normalizeRow === normalizeMaster2026SpreadsheetRow ? "Master 2026" :
      normalizeRow === normalizeMaster2027SpreadsheetRow ? "Master 2027" : "";

    try {
      const fileData = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const allImportedRows = [];
      const skippedSheets = [];

      workbook.worksheets.forEach((worksheet) => {
        const spreadsheetRows = getBookingImportRowsFromWorksheet(worksheet);
        const sampleRow = spreadsheetRows[0] || {};
        const hasExpectedColumns = hasMasterImportHeader(sampleRow, expectedColumns);
        const detectedMasterType = detectMasterSpreadsheetType(
          worksheet.name,
          spreadsheetRows
        );

        if (!hasExpectedColumns ||
            (requestedMasterType && detectedMasterType !== requestedMasterType)) {
          skippedSheets.push(worksheet.name);
          return;
        }

        allImportedRows.push(
          ...spreadsheetRows
            .map((row, index) => normalizeRow(row, index))
            .filter(Boolean)
        );
      });

      if (allImportedRows.length === 0) {
        alert(
          `No valid ${importTypeLabel} rows were found. Check the worksheet name and column headings.`
        );
        return;
      }

      const existingBookings = await fetchBookings();
      const existingBookingIds = new Set(
        existingBookings.map((booking) => booking.id)
      );

      let rowsToSave = allImportedRows;
      let masterImportSummary = "";
      let newRecordCount = allImportedRows.filter(
        (booking) => !existingBookingIds.has(booking.id)
      ).length;

      if (requestedMasterType) {
        // Match against the latest database records immediately before importing.
        const prepared = prepareMasterImportUpdates(
          allImportedRows,
          existingBookings
        );

        rowsToSave = prepared.rows;
        newRecordCount = prepared.rows.filter(
          (booking) => !existingBookingIds.has(booking.id)
        ).length;

        const reviewCount = prepared.rows.filter(
          (booking) => booking.rentalFormDetails?.importWarnings?.length
        ).length;

        masterImportSummary =
          `\nNew bookings: ${prepared.added}` +
          `\nExisting bookings updated: ${prepared.updated}` +
          `\nExisting bookings unchanged: ${prepared.unchanged}` +
          formatMasterImportKeptValues(prepared.keptAppValues) +
          `\nDuplicate spreadsheet rows skipped: ${prepared.duplicateRowsSkipped}` +
          (prepared.duplicateExistingRecords
            ? `\nOther existing duplicate records retained: ${prepared.duplicateExistingRecords}`
            : "") +
          `\nBookings with import review notes: ${reviewCount}`;

        const confirmed = window.confirm(
          `Import ${requestedMasterType}?\n${masterImportSummary}\n\n` +
          (newRecordCount === 0
            ? `NO NEW BOOKINGS DETECTED\nAll matching bookings are already in the database.\n\n`
            : `New bookings that will be added: ${newRecordCount}\n\n`) +
          MASTER_REIMPORT_RULES_TEXT +
          `\nReview notes will appear in each booking's Notes section.`
        );

        if (!confirmed) return;
      }

      const { saved: savedRows, failures } = await saveBookings(rowsToSave);
      setPublicInquiries((currentInquiries) => {
        const byId = new Map(currentInquiries.map((booking) => [booking.id, booking]));
        savedRows.forEach((booking) => byId.set(booking.id, booking));
        return Array.from(byId.values());
      });

      const skippedMessage = skippedSheets.length
        ? `\n\nSkipped sheets: ${skippedSheets.join(", ")}`
        : "";

      const noNewRecordsMessage = newRecordCount === 0
        ? `\n\nNo new records were added. Everything in this import already matched records in the database.`
        : `\n\nNew records added: ${newRecordCount}`;

      alert(
        `Imported ${savedRows.length} ${importTypeLabel} row(s).` +
        `${noNewRecordsMessage}${masterImportSummary}${skippedMessage}` +
        formatImportSaveFailures(failures)
      );
    } catch (error) {
      console.error(`Could not import ${importTypeLabel} spreadsheet:`, error);
      alert(
        `Sorry, that ${importTypeLabel} spreadsheet could not be imported.\n\n` +
        `Error: ${error?.message || String(error)}`
      );
    } finally {
      input.value = "";
    }
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
          getBookingImportRowsFromWorksheet(worksheet);

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
            id: detectedType.startsWith("Master ")
              ? normalizedRow.id
              : createWorkbookBulkImportId({
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
          `${worksheet.name}: ${importedCount} ${detectedType} source row(s) read, ${skippedRowCount} empty/invalid row(s) skipped`
        );
      });

      if (allImportedRows.length === 0) {
        alert(
          "No recognized Master or Guest Group Inquiry booking rows were found in this workbook."
        );

        return;
      }

      const existingBookings = await fetchBookings();
      const existingBookingIds = new Set(
        existingBookings.map((booking) => booking.id)
      );

      const hasMasterRows = allImportedRows.some((booking) =>
        getMasterImportIdentity(booking)
      );

      const importRows = prepareGuestGroupInquiryImportIds(
        allImportedRows,
        existingBookings
      );

      const prepared = hasMasterRows
        ? prepareMasterImportUpdates(importRows, existingBookings)
        : {
            rows: importRows,
            added: 0,
            updated: 0,
            unchanged: 0,
            keptAppValues: [],
            duplicateRowsSkipped: 0,
            duplicateExistingRecords: 0,
          };

      const newRecordCount = prepared.rows.filter(
        (booking) => !existingBookingIds.has(booking.id)
      ).length;

      // Report the rows that will be saved, after duplicate Master rows are skipped.
      Object.keys(importCounts).forEach((type) => {
        importCounts[type] = prepared.rows.filter((booking) => booking.sourceType === type).length;
      });
      const reviewCount = prepared.rows.filter(
        (booking) => booking.rentalFormDetails?.importWarnings?.length
      ).length;
      const masterImportSummary = hasMasterRows
        ? `Master bookings added: ${prepared.added}\n` +
          `Master bookings updated: ${prepared.updated}\n` +
          `Master bookings unchanged: ${prepared.unchanged}\n` +
          (formatMasterImportKeptValues(prepared.keptAppValues).trim()
            ? `${formatMasterImportKeptValues(prepared.keptAppValues).trim()}\n`
            : "") +
          `Duplicate spreadsheet rows skipped: ${prepared.duplicateRowsSkipped}\n` +
          (prepared.duplicateExistingRecords
            ? `Other existing duplicate records retained: ${prepared.duplicateExistingRecords}\n`
            : "") +
          `Bookings with import review notes: ${reviewCount}\n\n`
        : "";

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
          `${prepared.rows.length} row(s)\n\n` +

          masterImportSummary +
          (newRecordCount === 0
            ? `NO NEW RECORDS DETECTED\nEverything in this workbook already matches records in the database.\n\n`
            : `New records that will be added: ${newRecordCount}\n\n`) +
          MASTER_REIMPORT_RULES_TEXT +
          `\nOther worksheet types will be skipped.`
      );

      if (!confirmed) {
        return;
      }

      const { saved: savedRows, failures } =
        await saveBookings(prepared.rows);

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

          `Total imported: ${savedRows.length}\n` +
          `New records added: ${newRecordCount}\n\n` +
          (newRecordCount === 0
            ? `No new records were added. Everything in this workbook already matched records in the database.\n\n`
            : "") +
          masterImportSummary +
          `${sheetSummaries.join("\n")}` +
          formatImportSaveFailures(failures)
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
            // Keep a deactivated person deactivated.
            active: existingUser.active !== false,
            updatedAt: new Date().toISOString(),
          };

          updatedCount += 1;
          return;
        }

        nextUsers.push(importedUser);
        addedCount += 1;
      });

            await setStaffUsers(nextUsers);


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

  /*
    Names on bookings that are not in the staff directory. They are shown
    in User Admin to add by hand; nothing is added automatically, so a
    deleted or renamed person does not come back (AUDIT-017).
  */
  const unlistedStaffNames = useMemo(
    () =>
      getUnlistedStaffNames(
        getAssignedStaffNamesFromBookings(inquiryBookings),
        staffUsers
      ),
    [inquiryBookings, staffUsers]
  );

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


  /* =========================================================
     DASHBOARD HOME — OPERATIONAL SNAPSHOT
  ========================================================= */

  const dashboardToday =
    getDashboardHomeDay(today);

  const dashboardSevenDaysOut =
    addDays(dashboardToday, 7);

  const dashboardFourteenDaysOut =
    addDays(dashboardToday, 14);

  const dashboardThirtyDaysOut =
    addDays(dashboardToday, 30);

  const dashboardNinetyDaysOut =
    addDays(dashboardToday, 90);

  const dashboardNinetyDaysAgo =
    addDays(dashboardToday, -90);

  /*
    An inquiry converted into a staff booking stays in the table; the
    staff booking (sourceInquiryId) represents it, as in the Pipeline.
  */
  const dashboardConvertedInquiryIds =
    getConvertedInquiryIds(inquiryBookings);

  const dashboardActiveBookings =
    inquiryBookings.filter(
      (booking) =>
        !isDashboardHomeInactiveBooking(
          booking
        ) &&
        !dashboardConvertedInquiryIds.has(
          String(booking.id || "").trim()
        )
    );

  const dashboardActiveBookingSet =
    new Set(dashboardActiveBookings);

  const dashboardScheduledBookings =
    datedInquiries.filter(
      (booking) =>
        dashboardActiveBookingSet.has(
          booking
        )
    );

  const dashboardBookingsToday =
    dashboardScheduledBookings.filter(
      (booking) =>
        dashboardHomeBookingTouchesDate(
          booking,
          dashboardToday
        )
    );

  const dashboardGuestsToday =
    dashboardBookingsToday.reduce(
      (total, booking) =>
        total +
        getDashboardHomeGuestCount(
          booking
        ),
      0
    );

  const dashboardArrivalsNextSevenDays =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate < dashboardSevenDaysOut
        );
      }
    );

  const dashboardUpcomingArrivals =
    dashboardScheduledBookings
      .filter((booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardFourteenDaysOut
        );
      })
      .slice(0, 7);

  const dashboardUpcomingThirtyDays =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardThirtyDaysOut
        );
      }
    );

  const dashboardUpcomingThirtyDayGuests =
    dashboardUpcomingThirtyDays.reduce(
      (total, booking) =>
        total +
        getDashboardHomeGuestCount(
          booking
        ),
      0
    );

  const dashboardMissingDates =
    dashboardActiveBookings.filter(
      (booking) => {
        if (booking.startDate) {
          return false;
        }

        // No genuine inquiry date means the record is not "recent".
        const inquiryDate =
          getDashboardHomeBookingDate(
            getBookingInquiryDateValue(
              booking
            )
          );

        return (
          inquiryDate &&
          inquiryDate >=
            dashboardNinetyDaysAgo
        );
      }
    );

  const dashboardHousingNeedsAttention =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardNinetyDaysOut &&
          !isDashboardHomePlainInquiry(
            booking
          ) &&
          dashboardHomeBookingNeedsHousing(
            booking
          )
        );
      }
    );

  const dashboardGuestCountsMissing =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        // "N/A", "TBD", "?" etc. are not a recorded group size.
        const hasGuestCount =
          dashboardHomeHasValue(
            booking.attendeeCount
          ) ||
          dashboardHomeHasValue(
            booking.persons
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardNinetyDaysOut &&
          !isDashboardHomePlainInquiry(
            booking
          ) &&
          !hasGuestCount
        );
      }
    );

  const dashboardAttentionItems = [
    {
      id: "dates",
      title: "Missing retreat dates",
      description:
        "Recent active inquiries from the last 90 days still need dates.",
      count: dashboardMissingDates.length,
      tone: "gold",
      icon: FaCalendarAlt,
      view: INQUIRY_SPREADSHEET_VIEW_NAME,
    },
    {
      id: "housing",
      title: "Lodging not assigned",
      description:
        "Upcoming groups in the next 90 days still need housing.",
      count:
        dashboardHousingNeedsAttention.length,
      tone: "blue",
      icon: FaBed,
      view: "Lodging Calendar",
    },
    {
      id: "guests",
      title: "Guest counts missing",
      description:
        "Upcoming groups are missing a recorded group size.",
      count:
        dashboardGuestCountsMissing.length,
      tone: "purple",
      icon: FaUsers,
      view: SPREADSHEET_VIEW_NAME,
    },
    // Contract, deposit and insurance progress is tracked in Portal Admin.
  ];

  const dashboardVisibleAttentionItems =
    dashboardAttentionItems.filter(
      (item) => item.count > 0
    );

  const dashboardAttentionTotal =
    dashboardVisibleAttentionItems.reduce(
      (total, item) =>
        total + item.count,
      0
    );

  const dashboardWeekDays = Array.from(
    { length: 7 },
    (_, index) => {
      const date = addDays(
        dashboardToday,
        index
      );

      const arrivals =
        dashboardScheduledBookings.filter(
          (booking) => {
            const startDate =
              getDashboardHomeBookingDate(
                booking.startDate
              );

            return isDashboardHomeSameDay(
              startDate,
              date
            );
          }
        );

      const onSite =
        dashboardScheduledBookings.filter(
          (booking) =>
            dashboardHomeBookingTouchesDate(
              booking,
              date
            )
        );

      return {
        date,
        arrivals,
        onSite,
        guests: onSite.reduce(
          (total, booking) =>
            total +
            getDashboardHomeGuestCount(
              booking
            ),
          0
        ),
      };
    }
  );

  const dashboardCurrentStaffUser =
    staffUsers.find(
      (user) =>
        user.id === currentStaffUserId
    );

  const dashboardGreeting =
    today.getHours() < 12
      ? "Good morning"
      : today.getHours() < 17
      ? "Good afternoon"
      : "Good evening";

  const dashboardTodayLabel =
    today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const dashboardQuickActions = [
    {
      label: "New Booking",
      description:
        "Create a staff booking",
      icon: FaPlus,
      view: "Form",
    },
    {
      label: "Main Calendar",
      description:
        "See all scheduled groups",
      icon: FaCalendarAlt,
      view: "Calendar View",
    },
    {
      label: "Lodging Calendar",
      description:
        "Check building availability",
      icon: FaBed,
      view: "Lodging Calendar",
    },
    {
      label: "Guest Inquiries",
      description:
        "Review new guest requests",
      icon: FaEnvelopeOpenText,
      view: "Guest Inquiries",
    },
    {
      label: "Master Spreadsheet",
      description:
        "Open all booking records",
      icon: FaTable,
      view: SPREADSHEET_VIEW_NAME,
    },
    {
      label: "Jobs",
      description:
        "View assigned staff work",
      icon: FaClipboardList,
      view: "Jobs",
    },
  ];


  const exportInquiriesToSpreadsheet = async () => {
    if (inquiryBookings.length === 0) {
      alert("There are no inquiries to export yet.");
      return;
    }

        /*
      A contact list, not a backup (AUDIT-014, Q-034 A). The disposition
      column uses the Guest Group sheets' own heading and values, and the
      date is the real inquiry date. JSON Backup is the full-data format.
    */
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Contact List");

    worksheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Contact Name", key: "contactName", width: 24 },
      { header: "Email Address", key: "email", width: 30 },
      { header: "Phone Number", key: "phone", width: 18 },
      { header: "Secondary Contact Name", key: "secondaryContactName", width: 24 },
      { header: "Secondary Contact Phone", key: "secondaryContactPhone", width: 22 },
      { header: "Secondary Contact Email", key: "secondaryContactEmail", width: 30 },
      { header: "Guest Group Name", key: "guestGroupName", width: 30 },
      { header: "Size", key: "size", width: 10 },
      { header: "Desired Dates", key: "desiredDates", width: 28 },
      { header: "Additional Notes", key: "additionalNotes", width: 44 },
            { header: "Waitlist, Considering or No", key: "disposition", width: 22 },
      { header: "Booking", key: "bookingState", width: 16 },
    ];

    inquiryBookings.forEach((inquiry) => {
      worksheet.addRow({
                date: getBookingInquiryDateValue(inquiry)
          ? formatSubmittedDate(`${getBookingInquiryDateValue(inquiry)}T12:00:00`)
          : "",
        contactName: inquiry.contactName,
        email: inquiry.email === "No email provided" ? "" : inquiry.email,
        phone: inquiry.phone === "No phone provided" ? "" : inquiry.phone,
        ...getSecondaryContact(inquiry),
        guestGroupName: inquiry.organizationName,
        size: inquiry.attendeeCount || "",
        desiredDates:
          inquiry.desiredDatesText ||
          (inquiry.startDate || inquiry.endDate
            ? formatDateRange(inquiry.startDate, inquiry.endDate)
            : ""),
                additionalNotes: inquiry.notes || "",
        disposition: inquiry.inquiryDisposition || inquiry.stageOfGroup || "",
        bookingState: getBookingDisplayState(inquiry).label,
      });
    });

    const aboutSheet = workbook.addWorksheet("About this file");
    aboutSheet.addRow(["Toah Nipi contact list"]);
    aboutSheet.addRow([`Exported ${new Date().toLocaleString()}`]);
    aboutSheet.addRow([
      "This is a contact list for reference. It is not a backup and is not meant to be imported back. Use Backups (JSON) for a full copy of the data.",
    ]);

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
        link.download = "toah-nipi-contact-list.xlsx";

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

    return "calendar-event-green";

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
      // Leaving the form ends any pending website-inquiry conversion.
      setBookingFormSeed(null);
      setGuestBookingSource(null);
    }

    setActiveView(nextView);
    navigate(routes[nextView] || "/dashboard");
  };

  const openBookingDetail = (booking) => {
    setSelectedBooking(booking);
    setBookingDetailTab("Overview");
    setActiveView("Booking Detail");
  };

  const openInquiryRecordDetail = (booking) => {
    setSelectedBooking(booking);
    setBookingDetailTab("Overview");
    setActiveView("Inquiry Record Detail");
  };

  const startBookingFromInquiry = (booking) => {
    setBookingFormSeed(booking);
    // A staff-sheet inquiry is never a website inquiry (AUDIT-004).
    setGuestBookingSource(null);
    setBookingFormNotice(null);

    setSelectedBooking(null);
    setBookingDetailTab("Overview");

    navigate("/form")

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /*
    Runs after Create Booking saves a new booking. The website inquiry is
    marked converted only when the form was opened from it AND the saved
    booking still records it as its source, so a different or reset form
    can never close an unrelated inquiry (AUDIT-004, AUDIT-044).
  */
  const handleBookingCreated = async (savedBooking) => {
    const guestSource = guestBookingSource;
    const decision = decideGuestInquiryConversion({
      guestSource,
      formSeedId: bookingFormSeed?.id,
      savedBooking,
    });

    setGuestBookingSource(null);
    setBookingFormSeed(null);

    if (savedBooking?.id) {
      setPublicInquiries((currentInquiries) => [
        ...currentInquiries.filter((inquiry) => inquiry.id !== savedBooking.id),
        savedBooking,
      ]);
    }

    const bookingName = savedBooking?.organizationName || "the group";

    if (decision.action === "none") {
      setBookingFormNotice({
        kind: "success",
        message: `Booking created for ${bookingName}.`,
      });
      return;
    }

    if (decision.action === "skip") {
      setBookingFormNotice({
        kind: "warning",
        message:
          `Booking created for ${bookingName}, but it no longer records the website inquiry from ` +
          `${guestSource.guestOrganizationName} as its source, so that inquiry was left open.`,
      });
      return;
    }

    try {
      await markGuestInquiryConverted(
        guestSource.guestInquiryId,
        savedBooking.id
      );

      setBookingFormNotice({
        kind: "success",
        message: `Booking created for ${bookingName}. The website inquiry was marked converted.`,
      });
    } catch (error) {
      console.error(
        "Booking saved, but guest inquiry could not be marked converted:",
        error
      );

      setBookingFormNotice({
        kind: "warning",
        message:
          `Booking created for ${bookingName}, but the website inquiry from ` +
          `${guestSource.guestOrganizationName} is still open: ${error?.message || "unknown error"}`,
        retry: {
          guestInquiryId: guestSource.guestInquiryId,
          bookingId: savedBooking.id,
          bookingName,
        },
      });
    }
  };

  const retryGuestInquiryConversion = async () => {
    const retry = bookingFormNotice?.retry;

    if (!retry) {
      return;
    }

    setIsRetryingConversion(true);

    try {
      await markGuestInquiryConverted(retry.guestInquiryId, retry.bookingId);
      setBookingFormNotice({
        kind: "success",
        message: `The website inquiry is now marked converted to ${retry.bookingName}.`,
      });
    } catch (error) {
      setBookingFormNotice({
        ...bookingFormNotice,
        message: `Still not marked: ${error?.message || "unknown error"}`,
      });
    } finally {
      setIsRetryingConversion(false);
    }
  };

  const startBookingFromGuestInquiry = ({
    bookingSeed,
    guestInquiryId,
    guestOrganizationName,
  }) => {
    setBookingFormSeed(
      bookingSeed
    );

    setGuestBookingSource({
      guestInquiryId,
      guestOrganizationName,
      seedId: bookingSeed?.id,
    });
    setBookingFormNotice(null);

    setSelectedBooking(null);

    setBookingDetailTab(
      "Overview"
    );

    navigate("/form");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };


  const sidebarItemLookup = Object.fromEntries(
    sidebarSections
      .flatMap((section) => section.items)
      .map((item) => [item.label, item])
  );

  const reorganizedSidebarSections = [
    {
      label: "Calendar",
      items: [
        {
          ...sidebarItemLookup["Calendar"],
          label: "Main Calendar",
          view: "Calendar View",
          icon:
            sidebarItemLookup["Calendar"]?.icon ||
            FaCalendarAlt,
        },
        {
          ...sidebarItemLookup["Lodging Calendar"],
          label: "Lodging Calendar",
          view: "Lodging Calendar",
          icon:
            sidebarItemLookup["Lodging Calendar"]?.icon ||
            FaBed,
        },
      ],
    },
    {
      label: "Spreadsheet",
      items: [
        {
          ...sidebarItemLookup["Master Spreadsheet"],
          label: "Master Spreadsheet",
          view: SPREADSHEET_VIEW_NAME,
          icon:
            sidebarItemLookup["Master Spreadsheet"]?.icon ||
            FaTable,
        },
        {
          ...sidebarItemLookup["Inquiry Spreadsheet"],
          label: "Inquiry Spreadsheet",
          view: INQUIRY_SPREADSHEET_VIEW_NAME,
          icon:
            sidebarItemLookup["Inquiry Spreadsheet"]?.icon ||
            FaClipboardList,
        },
        {
          ...sidebarItemLookup["Contacts"],
          label: "Contacts",
          view: "Contacts View",
          icon:
            sidebarItemLookup["Contacts"]?.icon ||
            FaUsers,
        },
      ],
    },
    {
      label: "Reporting",
      items: [
        {
          ...sidebarItemLookup["Reports"],
          label: "Reports",
          view: "Reports",
          icon:
            sidebarItemLookup["Reports"]?.icon ||
            FaChartBar,
        },
      ],
    },
    {
  label: "Other",
    items: [
      {
        ...sidebarItemLookup["User Admin"],
        label: "User Admin",
        view: "User Admin",
        icon:
          sidebarItemLookup["User Admin"]?.icon ||
          FaUserShield,
      },
      {
        ...sidebarItemLookup["Jobs"],
        label: "Jobs",
        view: "Jobs",
        icon:
          sidebarItemLookup["Jobs"]?.icon ||
          FaClipboardList,
      },
      {
        label: "Backup",
        view: "Backup",
        icon: FaShieldAlt,
      },
    ],
  },
  ];


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
              navigate("/dashboard")
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
              setBookingFormSeed(null);
              setGuestBookingSource(null);
              setBookingFormNotice(null);
              setBookingDetailTab("Overview");
              navigate("/form")
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
              navigate("/portal-admin")
            }}
          >
            <FaKey />
            <span>Portals</span>
          </button>

          <button
            className={`sidebar-link ${
              activeView === "Guest Inquiries"
                ? "sidebar-link-active"
                : ""
            }`}
            type="button"
            title="Guest Inquiries"
            onClick={() => {
              setSelectedBooking(null);

              setBookingDetailTab(
                "Overview"
              );

              handleActiveViewChange(
                "Guest Inquiries"
              );
            }}
          >
            <FaEnvelopeOpenText />

            <span>
              Guest Inquiries
            </span>
          </button>
        </div>

        {reorganizedSidebarSections.map((section) => (
          <div
            className="sidebar-section"
            key={section.label}
          >
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;

              const targetView =
                item.view || item.label;

              return (
                <button
                  className={`sidebar-link ${
                    activeView === targetView
                      ? "sidebar-link-active"
                      : ""
                  }`}
                  key={item.label}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    setSelectedBooking(null);

                    setBookingDetailTab(
                      "Overview"
                    );

                    handleActiveViewChange(
                      targetView
                    );
                  }}
                >
                  <Icon />

                  <span>
                    {item.label}
                  </span>

                  {item.hasBadge &&
                    inquiryPipelineNeedsReviewCount > 0 && (
                      <strong className="sidebar-badge">
                        {item.label ===
                        "Inquiry Pipeline"
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
              isDevMode={isDevMode}
              setIsDevMode={setIsDevMode}
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
                            deleteAllInquiries={
                canDeleteBookings ? deleteAllInquiries : undefined
              }
              canImport={!isViewOnlyAccount}
              handleImportStaffContactsSpreadsheet={handleImportStaffContactsSpreadsheet}
              openStaffContactsImportPicker={openStaffContactsImportPicker}
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
            {bookingFormNotice && (
              <div
                className={`booking-form-notice is-${bookingFormNotice.kind}`}
                role={bookingFormNotice.kind === "warning" ? "alert" : "status"}
              >
                <p>{bookingFormNotice.message}</p>

                <div className="booking-form-notice-actions">
                  {bookingFormNotice.retry && (
                    <button
                      className="primary-dashboard-button"
                      type="button"
                      disabled={isRetryingConversion}
                      onClick={retryGuestInquiryConversion}
                    >
                      {isRetryingConversion ? "Retrying…" : "Retry marking the inquiry"}
                    </button>
                  )}

                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={() => setBookingFormNotice(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <CreateBooking
              key={
                bookingFormSeed?.id ||
                "blank-booking-form"
              }
                            initialInquiry={bookingFormSeed}
              isDevMode={isDevMode}
              staffUsers={staffUsers}
              onBookingCreated={handleBookingCreated}
            />
          </section>
        ) : activeView === "Inquiry Record Detail" ? (
          <InquiryRecordDetailView
            booking={selectedBooking}
            onSaveBooking={saveBookingEdits}
            onBack={() => {
              setSelectedBooking(null);
              navigate("/inquiry-spreadsheet");
            }}
          />
        ) : activeView === "Booking Detail" ? (
          <BookingDetailView
            booking={selectedBooking}
            activeTab={bookingDetailTab}
            setActiveTab={setBookingDetailTab}
            onSaveBooking={saveBookingEdits}
                        onDeleteBooking={deleteSingleBooking}
            canDeleteBookings={canDeleteBookings}
            staffUsers={staffUsers}
            currentStaffUserId={currentStaffUserId}
            onBack={() => {
              setSelectedBooking(null);
              navigate("/master-spreadsheet");
            }}
          />
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
        ) : activeView === "Lodging Calendar" ? (
          <LodgingCalendarView
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
                  openBookingDetail={openInquiryRecordDetail}
                  openConvertedBooking={openBookingDetail}
                  startBookingFromInquiry={
                    startBookingFromInquiry
                  }
                />
              ) : activeView === "Contacts View" ? (
                    // Secondary contacts are part of the main list now (AUDIT-039).
          <ContactsView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openBookingDetail}
          />
        ) : activeView === "Inquiry Pipeline" && !isDevMode ? (
          /*
            Retired (Q-011): the code is kept for reference, but staff cannot
            open it, including through the /inquiry-pipeline address. It only
            renders with Dev Mode on. Booking progress lives in Portal Admin.
          */
          <section className="dashboard-card empty-state">
            <strong>The Inquiry Pipeline has been retired</strong>
            <p>
              Booking progress such as contracts, deposits and insurance is
              tracked in Portal Admin. Inquiries are listed in the Inquiry
              Spreadsheet and Guest Inquiries.
            </p>
          </section>
        ) : activeView === "Inquiry Pipeline" ? (
          <InquiryPipelineView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openInquiryRecordDetail}
            onUpdateBookingStatus={(booking, nextStatus) =>
              saveBookingEdits({
                ...booking,
                status: nextStatus,
                waitlist:
                  nextStatus === "Waitlist"
                    ? "Yes"
                    : booking.waitlist,
              })
            }
          />

        ) : activeView === "Guest Inquiries" ? (
          <GuestInquiriesView
            onCreateBooking={
              startBookingFromGuestInquiry
            }
            existingBookings={inquiryBookings}
          />

        ) : activeView === "Backup" ? (
                    <DashboardBackups
            isDevMode={isDevMode}
            canReplace={canDeleteBookings}
            canRestore={!isViewOnlyAccount}
            onRestoreComplete={() => {
              loadBookingsFromSupabase();
            }}
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
            staffDirectoryStatus={staffDirectoryStatus}
            unlistedStaffNames={unlistedStaffNames}
            onCopyBrowserListToShared={
              getSavedStaffUsers().length > 0
                ? copyBrowserStaffListToSharedDirectory
                : undefined
            }
          />
        ) : activeView === "Jobs" ? (
                    <JobsView
            inquiryBookings={inquiryBookings}
            staffUsers={staffUsers}
            currentStaffUserId={currentStaffUserId}
            openBookingDetail={openBookingDetail}
            onSaveBooking={saveBookingEdits}
          />
        ) : (
          <section className="home-dashboard-page">
            <header className="home-dashboard-hero">
              <div className="home-dashboard-hero-copy">
                <span className="home-dashboard-eyebrow">
                  {dashboardTodayLabel}
                </span>

                <h1>
                  {dashboardGreeting}
                  {dashboardCurrentStaffUser?.name
                    ? `, ${dashboardCurrentStaffUser.name}`
                    : ""}
                  .
                </h1>

                <p>
                  Here is what is happening at camp, what is coming next,
                  and what needs staff attention.
                </p>
              </div>

              <div className="home-dashboard-hero-actions">
                <button
                  className="home-dashboard-primary-action"
                  type="button"
                  onClick={() => {
                    setSelectedBooking(null);
                    setBookingFormSeed(null);
                    setGuestBookingSource(null);
                    setBookingFormNotice(null);
                    setBookingDetailTab(
                      "Overview"
                    );
                    navigate("/form");
                  }}
                >
                  <FaPlus />
                  New Booking
                </button>

                <button
                  className="home-dashboard-secondary-action"
                  type="button"
                  onClick={() =>
                    handleActiveViewChange(
                      "Calendar View"
                    )
                  }
                >
                  <FaCalendarAlt />
                  Open Calendar
                </button>
              </div>
            </header>

            <section className="home-dashboard-metrics">
              <article className="home-dashboard-metric home-dashboard-metric-green">
                <span className="home-dashboard-metric-icon">
                  <FaHome />
                </span>

                <div>
                  <span>On Site Today</span>
                  <strong>
                    {dashboardBookingsToday.length}
                  </strong>
                  <p>
                    {dashboardGuestsToday} recorded guest
                    {dashboardGuestsToday === 1
                      ? ""
                      : "s"}
                  </p>
                </div>
              </article>

              <article className="home-dashboard-metric home-dashboard-metric-blue">
                <span className="home-dashboard-metric-icon">
                  <FaSignInAlt />
                </span>

                <div>
                  <span>Arriving Next 7 Days</span>
                  <strong>
                    {dashboardArrivalsNextSevenDays.length}
                  </strong>
                  <p>
                    Scheduled group
                    {dashboardArrivalsNextSevenDays.length === 1
                      ? ""
                      : "s"}
                  </p>
                </div>
              </article>

              <article className="home-dashboard-metric home-dashboard-metric-gold">
                <span className="home-dashboard-metric-icon">
                  <FaExclamationTriangle />
                </span>

                <div>
                  <span>Needs Attention</span>
                  <strong>
                    {dashboardAttentionTotal}
                  </strong>
                  <p>
                    Across {dashboardVisibleAttentionItems.length} action categor
                    {dashboardVisibleAttentionItems.length === 1
                      ? "y"
                      : "ies"}
                  </p>
                </div>
              </article>

              <article className="home-dashboard-metric home-dashboard-metric-purple">
                <span className="home-dashboard-metric-icon">
                  <FaUsers />
                </span>

                <div>
                  <span>Next 30 Days</span>
                  <strong>
                    {dashboardUpcomingThirtyDays.length}
                  </strong>
                  <p>
                    {dashboardUpcomingThirtyDayGuests} expected guest
                    {dashboardUpcomingThirtyDayGuests === 1
                      ? ""
                      : "s"}
                  </p>
                </div>
              </article>
            </section>

            <section className="home-dashboard-main-grid">
              <div className="home-dashboard-column">
                <article className="home-dashboard-card">
                  <header className="home-dashboard-card-header">
                    <div className="home-dashboard-card-heading">
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-gold">
                        <FaExclamationTriangle />
                      </span>

                      <div>
                        <span className="home-dashboard-section-label">
                          Staff Focus
                        </span>
                        <h2>Action Center</h2>
                        <p>
                          The booking records most likely to need follow-up.
                        </p>
                      </div>
                    </div>
                  </header>

                  {dashboardVisibleAttentionItems.length > 0 ? (
                    <div className="home-dashboard-attention-list">
                      {dashboardVisibleAttentionItems.map(
                        (item) => {
                          const Icon = item.icon;

                          return (
                            <button
                              className={`home-dashboard-attention-item home-dashboard-attention-${item.tone}`}
                              type="button"
                              key={item.id}
                              onClick={() =>
                                handleActiveViewChange(
                                  item.view
                                )
                              }
                            >
                              <span className="home-dashboard-attention-icon">
                                <Icon />
                              </span>

                              <span className="home-dashboard-attention-copy">
                                <strong>
                                  {item.title}
                                </strong>
                                <small>
                                  {item.description}
                                </small>
                              </span>

                              <span className="home-dashboard-attention-count">
                                {item.count}
                              </span>

                              <FaChevronRight className="home-dashboard-attention-arrow" />
                            </button>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div className="home-dashboard-all-clear">
                      <span>
                        <FaRegCalendarCheck />
                      </span>

                      <div>
                        <strong>
                          Nothing urgent is showing right now
                        </strong>
                        <p>
                          Upcoming booking records have dates, housing,
                          guest counts, and no outstanding contract flags.
                        </p>
                      </div>
                    </div>
                  )}
                </article>

                <article className="home-dashboard-card">
                  <header className="home-dashboard-card-header home-dashboard-card-header-with-action">
                    <div className="home-dashboard-card-heading">
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-blue">
                        <FaSignInAlt />
                      </span>

                      <div>
                        <span className="home-dashboard-section-label">
                          Coming Up
                        </span>
                        <h2>Upcoming Arrivals</h2>
                        <p>
                          Groups scheduled to arrive during the next two weeks.
                        </p>
                      </div>
                    </div>

                    <button
                      className="home-dashboard-text-action"
                      type="button"
                      onClick={() =>
                        handleActiveViewChange(
                          "Calendar View"
                        )
                      }
                    >
                      View calendar
                      <FaChevronRight />
                    </button>
                  </header>

                  {dashboardUpcomingArrivals.length > 0 ? (
                    <div className="home-dashboard-arrivals-list">
                      {dashboardUpcomingArrivals.map(
                        (booking) => {
                          const startDate =
                            getDashboardHomeBookingDate(
                              booking.startDate
                            );

                          const dateTile =
                            formatDashboardHomeDateTile(
                              startDate
                            );

                          const guestCount =
                            getDashboardHomeGuestCount(
                              booking
                            );

                          const buildingTags =
                            getDashboardHomeBuildingTags(
                              booking
                            );

                          return (
                            <button
                              className="home-dashboard-arrival-row"
                              type="button"
                              key={booking.id}
                              onClick={() =>
                                openBookingDetail(
                                  booking
                                )
                              }
                            >
                              <span className="home-dashboard-arrival-date">
                                <small>
                                  {dateTile.month}
                                </small>
                                <strong>
                                  {dateTile.day}
                                </strong>
                              </span>

                              <span className="home-dashboard-arrival-main">
                                <strong>
                                  {booking.organizationName ||
                                    "Unnamed Organization"}
                                </strong>

                                <span>
                                  {formatDateRange(
                                    booking.startDate,
                                    booking.endDate
                                  )}
                                </span>

                                <small>
                                  {guestCount > 0
                                    ? `${guestCount} guest${
                                        guestCount === 1
                                          ? ""
                                          : "s"
                                      }`
                                    : "Guest count not recorded"}
                                  {getBookingDisplayState(booking).key !== "booked"
                                    ? ` · ${getBookingDisplayState(booking).label}`
                                    : ""}
                                </small>
                              </span>

                              <span
                                className="home-dashboard-building-pills"
                                aria-label={`Lodging: ${buildingTags
                                  .map(
                                    (building) =>
                                      building.label
                                  )
                                  .join(", ")}`}
                              >
                                {buildingTags.map(
                                  (building) => (
                                    <span
                                      className={`home-dashboard-building-pill home-dashboard-building-pill-${building.key}`}
                                      key={
                                        building.key
                                      }
                                    >
                                      {
                                        building.label
                                      }
                                    </span>
                                  )
                                )}
                              </span>

                              <FaChevronRight className="home-dashboard-row-arrow" />
                            </button>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div className="home-dashboard-empty-state">
                      <FaCalendarAlt />
                      <strong>
                        No arrivals in the next two weeks
                      </strong>
                      <p>
                        Future groups will appear here automatically once they have dates.
                      </p>
                    </div>
                  )}
                </article>
              </div>

              <aside className="home-dashboard-column">
                <article className="home-dashboard-card home-dashboard-today-card">
                  <header className="home-dashboard-card-header home-dashboard-card-header-with-action">
                    <div className="home-dashboard-card-heading">
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-green">
                        <FaHome />
                      </span>

                      <div>
                        <span className="home-dashboard-section-label">
                          Live Snapshot
                        </span>
                        <h2>Today at Camp</h2>
                        <p>
                          Groups whose stay includes today.
                        </p>
                      </div>
                    </div>
                  </header>

                  {dashboardBookingsToday.length > 0 ? (
                    <div className="home-dashboard-today-list">
                      {dashboardBookingsToday
                        .slice(0, 5)
                        .map((booking) => {
                          const guestCount =
                            getDashboardHomeGuestCount(
                              booking
                            );

                          return (
                            <button
                              className="home-dashboard-today-row"
                              type="button"
                              key={booking.id}
                              onClick={() =>
                                openBookingDetail(
                                  booking
                                )
                              }
                            >
                              <span className="home-dashboard-today-dot" />

                              <span className="home-dashboard-today-copy">
                                <strong>
                                  {booking.organizationName ||
                                    "Unnamed Organization"}
                                </strong>
                                <small>
                                  {getDashboardHomeHousingLabel(
                                    booking
                                  )}
                                </small>
                              </span>

                              <span className="home-dashboard-today-guests">
                                {guestCount > 0
                                  ? `${guestCount} guest${
                                      guestCount === 1
                                        ? ""
                                        : "s"
                                    }`
                                  : "Guests —"}
                              </span>
                            </button>
                          );
                        })}

                      {dashboardBookingsToday.length > 5 && (
                        <button
                          className="home-dashboard-more-button"
                          type="button"
                          onClick={() =>
                            handleActiveViewChange(
                              "Calendar View"
                            )
                          }
                        >
                          +{dashboardBookingsToday.length - 5} more group
                          {dashboardBookingsToday.length - 5 === 1
                            ? ""
                            : "s"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="home-dashboard-empty-state home-dashboard-empty-state-compact">
                      <FaHome />
                      <strong>
                        No groups are scheduled on site today
                      </strong>
                      <p>
                        The next scheduled arrival will appear in the arrivals list.
                      </p>
                    </div>
                  )}
                </article>

                <article className="home-dashboard-card">
                  <header className="home-dashboard-card-header">
                    <div className="home-dashboard-card-heading">
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-purple">
                        <FaClock />
                      </span>

                      <div>
                        <span className="home-dashboard-section-label">
                          Shortcuts
                        </span>
                        <h2>Quick Actions</h2>
                        <p>
                          Jump directly into common staff workflows.
                        </p>
                      </div>
                    </div>
                  </header>

                  <div className="home-dashboard-quick-actions">
                    {dashboardQuickActions.map(
                      (action) => {
                        const Icon = action.icon;

                        return (
                          <button
                            className="home-dashboard-quick-action"
                            type="button"
                            key={action.label}
                            onClick={() => {
                              if (
                                action.view ===
                                "Form"
                              ) {
                                setSelectedBooking(
                                  null
                                );
                                setBookingFormSeed(
                                  null
                                );
                                setGuestBookingSource(
                                  null
                                );
                                setBookingDetailTab(
                                  "Overview"
                                );
                                navigate("/form");
                                return;
                              }

                              handleActiveViewChange(
                                action.view
                              );
                            }}
                          >
                            <span>
                              <Icon />
                            </span>

                            <div>
                              <strong>
                                {action.label}
                              </strong>
                              <small>
                                {action.description}
                              </small>
                            </div>

                            <FaChevronRight />
                          </button>
                        );
                      }
                    )}
                  </div>
                </article>
              </aside>
            </section>

            <article className="home-dashboard-card home-dashboard-week-card">
              <header className="home-dashboard-card-header home-dashboard-card-header-with-action">
                <div className="home-dashboard-card-heading">
                  <span className="home-dashboard-card-icon home-dashboard-card-icon-purple">
                    <FaCalendarAlt />
                  </span>

                  <div>
                    <span className="home-dashboard-section-label">
                      Schedule
                    </span>
                    <h2>Next 7 Days</h2>
                    <p>
                      A compact look at arrivals and groups on site each day.
                    </p>
                  </div>
                </div>

                <button
                  className="home-dashboard-text-action"
                  type="button"
                  onClick={() =>
                    handleActiveViewChange(
                      "Lodging Calendar"
                    )
                  }
                >
                  Check lodging
                  <FaChevronRight />
                </button>
              </header>

              <div className="home-dashboard-week-strip">
                {dashboardWeekDays.map(
                  (day) => {
                    const isToday =
                      isDashboardHomeSameDay(
                        day.date,
                        dashboardToday
                      );

                    return (
                      <div
                        className={`home-dashboard-day-card ${
                          isToday
                            ? "home-dashboard-day-card-today"
                            : ""
                        }`}
                        key={day.date.toISOString()}
                      >
                        <div className="home-dashboard-day-heading">
                          <span>
                            {day.date.toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                              }
                            )}
                          </span>

                          <strong>
                            {day.date.getDate()}
                          </strong>

                          {isToday && (
                            <small>Today</small>
                          )}
                        </div>

                        <div className="home-dashboard-day-stats">
                          <div>
                            <span>
                              <FaSignInAlt />
                            </span>
                            <strong>
                              {day.arrivals.length}
                            </strong>
                            <small>
                              arrival
                              {day.arrivals.length === 1
                                ? ""
                                : "s"}
                            </small>
                          </div>

                          <div>
                            <span>
                              <FaHome />
                            </span>
                            <strong>
                              {day.onSite.length}
                            </strong>
                            <small>
                              on site
                            </small>
                          </div>
                        </div>

                        <div className="home-dashboard-day-guests">
                          <FaUsers />
                          <span>
                            {day.guests} recorded guest
                            {day.guests === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </article>
          </section>
        )}



      </section>
    </main>
  );
}
