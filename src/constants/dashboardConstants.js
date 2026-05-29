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
  FaPlus,
  FaChartBar,
  FaCog,
  FaUserShield,
  FaTable,
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
  "Activities",
  "Notes & Tasks",
  "Emails & Documents",
  "Invoices",
  "Attendee Rental Page",
  "Attendee Details",
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