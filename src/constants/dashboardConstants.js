import {
  FaBuilding,
  FaUsers,
  FaCalendarAlt,
  FaClipboardList,
  FaPlus,
  FaChartBar,
  FaCog,
  FaUserShield,
  FaTable,
} from "react-icons/fa";

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

export const sidebarSections = [
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