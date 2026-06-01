/*
dashboardConstants.js
-------------------------------------------------------------------------------
Shared constant data for the booking dashboard.

This file keeps repeated dashboard configuration out of Dashboard.jsx.

This file handles:
- Month names used by calendar controls
- Sidebar navigation section labels and icons
- Activity location names and aliases used for availability matching
- Default room rows used for room availability
- Booking detail tab labels

Important:
These values are not state. They are shared static configuration values.
-------------------------------------------------------------------------------
*/

import {
  FaUsers,
  FaCalendarAlt,
  FaClipboardList,
  FaChartBar,
  FaCog,
  FaUserShield,
  FaTable,
  FaExclamationTriangle,
  FaFileContract,
  FaRegCalendarCheck,
  FaClock,
  FaTimes,
  FaTasks,
} from "react-icons/fa";

// Month labels used by calendar dropdowns, headings, and availability views.
export const monthNames = [
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

// Sidebar navigation sections for the staff dashboard.
// Each item can include an icon and optional badge behavior.
export const sidebarSections = [
  {
    label: "Rentals & Events",
    items: [
      { label: "Calendar View", icon: FaCalendarAlt },
      { label: "Spreadsheet View", icon: FaTable },
      { label: "Contacts View", icon: FaUsers },
      { label: "Inquiry Pipeline", icon: FaClipboardList, hasBadge: true },
    ],
  },
  {
    label: "Reporting",
    items: [{ label: "Reports", icon: FaChartBar }],
  },
  {
    label: "Administration",
    items: [
      { label: "User Admin", icon: FaUserShield },
      { label: "Jobs", icon: FaTasks },
    ],
  },
];

// Activity locations used by the availability board.
// Aliases help match imported booking text even when spreadsheets use slightly different names.
export const activityLocations = [
  {
    name: "Auditorium",
    aliases: ["Auditorium", "Spencer Auditorium"],
  },
  {
    name: "Dining Hall",
    aliases: ["Dining Hall", "Dining"],
  },
  {
    name: "Great Room",
    aliases: ["Great Room"],
  },
  {
    name: "Main Lodge",
    aliases: ["Main Lodge", "Lodge"],
  },
  {
    name: "Nature Center",
    aliases: ["Nature Center"],
  },
  {
    name: "Play Fields",
    aliases: ["Play Fields", "Field", "Fields"],
  },
  {
    name: "Pool",
    aliases: ["Pool"],
  },
  {
    name: "Sledding Hill",
    aliases: ["Sledding Hill"],
  },
  {
    name: "Soccer Fields",
    aliases: ["Soccer Fields", "Soccer Field"],
  },
  {
    name: "Waterfront",
    aliases: ["Waterfront", "Pond", "Lake"],
  },
];

// Default room rows used by the room availability view.
// Dynamic imported room names can be added later without hardcoding them here.
export const defaultRoomRows = [
  {
    name: "Hebron",
    aliases: ["Hebron"],
  },
  {
    name: "Bethel",
    aliases: ["Bethel"],
  },
  {
    name: "Dothan",
    aliases: ["Dothan"],
  },
  {
    name: "Guest House",
    aliases: ["Guest House"],
  },
  {
    name: "Rustic Cottage 1",
    aliases: ["Rustic Cottage 1", "Cottage 1"],
  },
  {
    name: "Rustic Cottage 2",
    aliases: ["Rustic Cottage 2", "Cottage 2"],
  },
  {
    name: "Rustic Cottage 3",
    aliases: ["Rustic Cottage 3", "Cottage 3"],
  },
  {
    name: "Rustic Cottage 4",
    aliases: ["Rustic Cottage 4", "Cottage 4"],
  },
  {
    name: "Unassigned",
    aliases: ["Unassigned"],
  },
];

// Tabs shown on the booking detail page.
// Most of these are placeholders for future sections.
export const bookingDetailTabs = [
  "Overview",
  "Details",
  "Rates",
  "Housing",
  "Meals & Activities",
  "Checklists",
];

// Dated inquiry dashboard display settings.
// These are used by the Dated Inquiries card on the dashboard.
export const DATED_INQUIRY_SETTINGS_STORAGE_KEY =
  "datedInquiryDashboardSettings";

export const DEFAULT_DATED_INQUIRY_SETTINGS = {
  tintByRetreatType: false,
  showRetreatTypeLegend: true,
};

// Retreat type color buckets.
// These normalize messy imported values like:
// "Family", "Families", "Familes", "Woman", "Women", "PR-Day Use Only", etc.
export const RETREAT_TYPE_CONFIG = {
  pr: {
    label: "PR",
    className: "dated-inquiry-type-pr",
  },
  dayUse: {
    label: "Day Use",
    className: "dated-inquiry-type-day-use",
  },
  men: {
    label: "Men",
    className: "dated-inquiry-type-men",
  },
  women: {
    label: "Women",
    className: "dated-inquiry-type-women",
  },
  studentsYouth: {
    label: "Students / Youth",
    className: "dated-inquiry-type-students-youth",
  },
  families: {
    label: "Families",
    className: "dated-inquiry-type-families",
  },
  adults: {
    label: "Adults",
    className: "dated-inquiry-type-adults",
  },
  staffLeaders: {
    label: "Staff / Leaders",
    className: "dated-inquiry-type-staff-leaders",
  },
  pastorsElders: {
    label: "Pastors / Elders",
    className: "dated-inquiry-type-pastors-elders",
  },
  friendsHosts: {
    label: "Friends / Hosts",
    className: "dated-inquiry-type-friends-hosts",
  },
  events: {
    label: "Events",
    className: "dated-inquiry-type-events",
  },
  other: {
    label: "Other",
    className: "dated-inquiry-type-other",
  },
};

export const RETREAT_TYPE_LEGEND_KEYS = [
  "pr",
  "dayUse",
  "men",
  "women",
  "studentsYouth",
  "families",
  "adults",
  "staffLeaders",
  "pastorsElders",
  "friendsHosts",
  "events",
  "other",
];

export function getInquiryRetreatType(inquiry) {
  return (
    inquiry.guestGroupType ||
    inquiry.groupType ||
    inquiry.retreatType ||
    inquiry.type ||
    inquiry["Guest Group Type"] ||
    ""
  );
}

export function getRetreatTypeConfig(rawType) {
  const value = String(rawType || "")
    .trim()
    .toLowerCase();

  if (!value) return RETREAT_TYPE_CONFIG.other;

  if (value.includes("day use")) {
    return RETREAT_TYPE_CONFIG.dayUse;
  }

  if (value === "pr" || value.startsWith("pr-")) {
    return RETREAT_TYPE_CONFIG.pr;
  }

  if (value.includes("pastor") || value.includes("elder")) {
    return RETREAT_TYPE_CONFIG.pastorsElders;
  }

  if (
    value.includes("staff") ||
    value.includes("faculty") ||
    value.includes("leader") ||
    value.includes("host")
  ) {
    return RETREAT_TYPE_CONFIG.staffLeaders;
  }

  if (
    value.includes("famil") ||
    value.includes("mother") ||
    value.includes("father") ||
    value.includes("children") ||
    value.includes("child")
  ) {
    return RETREAT_TYPE_CONFIG.families;
  }

  if (
    value.includes("student") ||
    value.includes("youth") ||
    value.includes("college") ||
    value.includes("confirmation") ||
    value.includes("school") ||
    value.includes("grade") ||
    value.includes("hs")
  ) {
    return RETREAT_TYPE_CONFIG.studentsYouth;
  }

  if (
    value.includes("women") ||
    value.includes("woman") ||
    value.includes("ladies")
  ) {
    return RETREAT_TYPE_CONFIG.women;
  }

  if (value.includes("men")) {
    return RETREAT_TYPE_CONFIG.men;
  }

  if (value.includes("adult")) {
    return RETREAT_TYPE_CONFIG.adults;
  }

  if (value.includes("friend")) {
    return RETREAT_TYPE_CONFIG.friendsHosts;
  }

  if (
    value.includes("catered") ||
    value.includes("reunion") ||
    value.includes("event")
  ) {
    return RETREAT_TYPE_CONFIG.events;
  }

  return RETREAT_TYPE_CONFIG.other;
}






// Dated inquiry date filter settings.
// These control the date range dropdown on the dashboard Dated Inquiries card.
export const DATED_INQUIRY_DATE_FILTER_STORAGE_KEY =
  "toahNipiDatedInquiryDateFilter";

export const DATED_INQUIRY_CUSTOM_START_STORAGE_KEY =
  "toahNipiDatedInquiryCustomStartDate";

export const DATED_INQUIRY_CUSTOM_END_STORAGE_KEY =
  "toahNipiDatedInquiryCustomEndDate";

export const datedInquiryDateFilterOptions = [
  { value: "thisMonth", label: "This Month" },
  { value: "allTime", label: "All Time" },
  { value: "pastMonth", label: "Past Month" },
  { value: "nextMonth", label: "Next Month" },
  { value: "past90Days", label: "Past 90 Days" },
  { value: "next90Days", label: "Next 90 Days" },
  { value: "custom", label: "Custom Date Range" },
];

// Booking detail date display settings.
// These control the Date Display modal on the Booking Detail page.
export const BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY =
  "toahNipiBookingDetailDateSettings";

export const DEFAULT_BOOKING_DETAIL_DATE_SETTINGS = {
  dateFormat: "numeric",
  includeWeekday: false,
};

export const bookingDetailDateFormatOptions = [
  {
    value: "numeric",
    label: "1/10/2025",
    description: "Compact month/day/year format.",
  },
  {
    value: "shortMonth",
    label: "Jan 10, 2025",
    description: "Clean readable short month format.",
  },
  {
    value: "longMonth",
    label: "January 10, 2025",
    description: "Full written-out month format.",
  },
  {
    value: "iso",
    label: "2025-01-10",
    description: "Spreadsheet/database-style ISO format.",
  },
  {
    value: "original",
    label: "Original saved value",
    description: "Shows the raw value stored on the booking.",
  },
];

// Contacts view localStorage keys.
export const CONTACTS_VIEW_STARRED_STORAGE_KEY = "toahNipiStarredContacts";

export const CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY =
  "toahNipiContactsStarredFirst";

// Inquiry pipeline column configuration.
export const INQUIRY_PIPELINE_COLUMNS = [
  {
    key: "newInquiry",
    label: "New Inquiry",
    description: "Ready for initial staff review.",
    icon: FaClipboardList,
  },
  {
    key: "needsReview",
    label: "Needs Review",
    description: "Missing dates, contact info, guest count, room, or type.",
    icon: FaExclamationTriangle,
  },
  {
    key: "contractSent",
    label: "Contract Sent",
    description: "Waiting on contract response or confirmation.",
    icon: FaFileContract,
  },
  {
    key: "confirmed",
    label: "Confirmed",
    description: "Confirmed bookings with enough planning information.",
    icon: FaRegCalendarCheck,
  },
  {
    key: "waitlist",
    label: "Waitlist",
    description: "Waitlisted groups or waitlist imports.",
    icon: FaClock,
  },
  {
    key: "cancelled",
    label: "Cancelled",
    description: "Cancelled bookings kept for records.",
    icon: FaTimes,
  },
];

// Reports view settings.
export const REPORTS_VIEW_SETTINGS_STORAGE_KEY = "toahNipiReportsViewSettings";

export const DEFAULT_REPORTS_VIEW_SETTINGS = {
  dateRange: "thisYear",
  customStartDate: "",
  customEndDate: "",
  status: "all",
  retreatType: "all",
  sourceMode: "all",
};

export const reportsDateRangeOptions = [
  { value: "thisMonth", label: "This Month" },
  { value: "nextMonth", label: "Next Month" },
  { value: "thisYear", label: "This Year" },
  { value: "nextYear", label: "Next Year" },
  { value: "allTime", label: "All Time" },
  { value: "custom", label: "Custom Date Range" },
];

// Spreadsheet view settings.
export const SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY =
  "toahNipiSpreadsheetViewSettings";

export const SPREADSHEET_ESSENTIAL_COLUMN_LABELS = new Set([
  "Organization",
  "Input Method",
  "Status",
  "Contact Name",
  "Email",
  "Phone",
  "Date Range",
  "Guest Count",
  "Retreat Type",
  "Waitlist",
  "Assigned Room / Area",
  "Notes",
]);

export const SPREADSHEET_2026_STANDARD_LABELS = new Set([
  "Stage of Group",
  "Min Paying Guests",
  "Max Paying Guests",
  "Guest Rate",
  "Expected Minimum Revenue",
  "Invoice Lodging / Meals",
  "Deposit",
  "Deposit Received",
  "Date of Cancellation",
  "Reason for Cancellation",
  "Vacancy Filled",
  "Monthly Projected Income",
]);

export const SPREADSHEET_SHARED_STANDARD_LABELS = new Set([
  "Organization",
  "Input Method",
  "Source Sheet",
  "Source Row",
  "Status",
  "Submitted",
  "Contact Name",
  "Email",
  "Phone",
  "Start Date",
  "End Date",
  "Date Range",
  "Guest Count",
  "Retreat Type",
  "Assigned Room / Area",
  "Buildings / Rooms",
  "Meals",
  "# Meals",
  "Food Allergies",
  "Need To Know",
  "Linen Sets",
  "Activities",
  "# Persons",
  "# Nights",
  "Camper Days",
  "Usage Fee",
  "$ Lodging",
  "$ Food",
  "$ Misc.",
  "Returning Status",
  "Notes",
  "Booking ID",
]);

export const SPREADSHEET_2025_RAW_COLUMNS = new Set([
  "Arrival Date",
  "Departure Date",
  "Guest Group Name",
  "Contact Person",
  "Contact Person Cell #",
  "Contact Person Cell",
  "Actual Number of Guests",
  "Food Allergies",
]);

export const SPREADSHEET_2026_RAW_COLUMNS = new Set([
  "name",
  "Name",
  "Group Leader/Contact Person",
  "Group Leader",
  "Phone",
  "Estimated Number of Guests",
  "Allergies",
  "Contact Person Email",
  "Stage of Group",
  "Min. Number of Paying Guests",
  "Minimum Number of Paying Guests",
  "Max. Number of Paying Guests",
  "Maximum Number of Paying Guests",
  "Guest Rate",
  "Exp. Minimum Revenue for Lodging/Meals",
  "Expected Minimum Revenue for Lodging/Meals",
  "Invoice for Lodging/Meals (does not include linens's fees or other service fees)",
  "Invoice for Lodging/Meals",
  "Deposit",
  "Deposit Received",
  "Date of Cancellation",
  "Reason for Cancellation",
  "Vacancy filled by another group?",
  "Vacancy Filled By Another Group?",
  "Monthly Sum of Projected Income",
]);

export const SPREADSHEET_SHARED_RAW_COLUMNS = new Set([
  "Guest Group Type",
  "Returning (R) or New (N)",
  "Returning or New",
  "Buildings/Rooms",
  "Buildings",
  "Rooms",
  "Meals",
  "Need to know",
  "Need To Know",
  "Linen Sets",
  "Activities",
  "#Persons",
  "Persons",
  "#Nights",
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
  "Notes",
]);


export const SPREADSHEET_VIEW_STARRED_STORAGE_KEY =
  "spreadsheetViewStarredBookingIds";