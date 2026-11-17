/*
  Mini tutorials: one short demonstration per standalone page that no
  larger walkthrough covers. The library groups them under
  MINI_CATEGORY, in sidebar order. Each opens its own page first, so it
  works from anywhere, and only clicks navigation and view switches.

  Guest bookings and Hosting (internal use of the property) are separate
  records: the spreadsheets, Reports and the guest portal leave hosting out,
  and Hosting has its own page.
*/

import { openMasterSpreadsheetStep } from "./bookingTutorial.js";

export const MINI_CATEGORY = "Mini Tutorials (other views)";

const mini = (tutorial) => ({ category: MINI_CATEGORY, difficulty: "Beginner", writeLock: true, ...tutorial });

// Opens a sidebar page. `page` is a target only that page has, so the same component shown elsewhere doesn't count.
const openPage = (navTarget, path, page, show) => ({
  id: "open",
  target: navTarget,
  show,
  done: (ctx) => ctx.path() === path && ctx.visible(page),
  demoClick: true,
});

export const MINI_TUTORIALS = [
  mini({
    id: "master-spreadsheet",
    title: "Master Spreadsheet",
    description: "Filter, sort, search and star the list of every guest booking.",
    keywords: ["spreadsheet", "table", "filter", "sort", "search", "star", "year", "rows", "building"],
    steps: [
      {
        ...openMasterSpreadsheetStep,
        show: "The Master Spreadsheet lists every dated guest booking. Hosting isn't here: internal use has its own Hosting page.",
      },
      {
        id: "years",
        target: "spreadsheet-years",
        show: "All shows every year, and 2025, 2026 and 2027 show one year's sheet. Other lights up when a date range is set.",
      },
      {
        id: "buildings",
        target: "spreadsheet-buildings",
        show: "Building Type narrows the list to groups using the ticked buildings. Clear removes the filter.",
      },
      {
        id: "dates",
        target: "spreadsheet-dates",
        show: "Start and End date keep only stays in that range.",
        example: "June 1 to August 31",
      },
      {
        id: "sort",
        target: "spreadsheet-sort",
        show: "Sort By orders rows by retreat date or when they were added. Clicking a column heading sorts by that column, and clicking again reverses it.",
      },
      {
        id: "search",
        target: "spreadsheet-search",
        show: "Search Everything finds bookings by group name, contact, email, phone, rooms and notes.",
        example: "Community Bible Church",
      },
      {
        id: "summary",
        target: "spreadsheet-settings-bar",
        show: "This line sums up the view: search, buildings, sort, how many rows and which year. These settings and your stars are remembered in this browser only.",
        missing: "This line appears once there are bookings to show.",
      },
      {
        id: "open",
        target: "spreadsheet-open-booking",
        show: "The star in each row marks bookings to keep at the top with Starred first. Clicking a group's name opens its booking.",
        missing: "If the list is empty, clear the search box and the filters.",
      },
    ],
  }),

  mini({
    id: "inquiry-spreadsheet",
    title: "Inquiry Spreadsheet",
    description: "Look up past inquiries, waitlists and No's from the company workbook, and start a booking from one.",
    keywords: ["inquiry", "inquiries", "waitlist", "declined", "no", "workbook", "history", "book"],
    steps: [
      openPage(
        "nav-inquiry-spreadsheet",
        "/inquiry-spreadsheet",
        "inquiry-sheet-intro",
        "The Inquiry Spreadsheet is under Master Spreadsheet in the sidebar."
      ),
      {
        id: "intro",
        target: "inquiry-sheet-intro",
        show: "It holds the imported workbook record of groups that asked: inquiries, waitlists, groups considering, and No's. New requests from the website form arrive in Guest Inquiries instead.",
      },
      {
        id: "years",
        target: "inquiry-sheet-years",
        show: "Each year is one workbook sheet, with its own columns. The number is how many rows it has.",
      },
      {
        id: "search",
        target: "inquiry-sheet-search",
        show: "Search narrows the rows to the ones that mention what you type.",
        example: "Community Bible Church",
      },
      {
        id: "book",
        target: "inquiry-sheet-actions",
        show: "Book opens the booking form filled in from that row, and nothing is saved until you save the form. Booked means a booking already exists, and opens it. The bin hides the row from this spreadsheet only.",
        missing: "There are no rows to show. Clear the search, choose All, or import the inquiry sheets first.",
      },
      {
        id: "deleted",
        target: "inquiry-sheet-deleted",
        show: "Deleted lists the hidden rows, and Restore brings one back. The inquiry records themselves are never deleted here.",
      },
    ],
  }),

  mini({
    id: "contacts",
    title: "Contacts",
    description: "Search contacts, sort them, and open a contact's booking history.",
    keywords: ["people", "email", "phone", "leader", "search", "history"],
    steps: [
      {
        id: "open-contacts",
        target: "nav-contacts",
        show: "Contacts are built automatically from every booking.",
        done: (ctx) => ctx.visible("contacts-search"),
        demoClick: true,
      },
      {
        id: "search",
        target: "contacts-search",
        show: "Search by a person's name to find them. Groups, addresses, emails, phone numbers and status work too.",
        example: "Jordan Smith",
      },
      {
        id: "sort",
        target: "contacts-sort",
        show: "Sort by first or last name. Tick Show starred contacts first to keep starred people at the top.",
      },
      {
        id: "view-bookings",
        target: "contacts-view-bookings",
        show: "View Bookings opens a contact's full booking history. I'll open the first contact on the list.",
        done: (ctx) => ctx.visible("contacts-history"),
        demoClick: true,
        missing: "No contacts match the search, so clear the search box to see everyone. If it's still empty, contacts appear once bookings exist.",
      },
      {
        id: "history",
        target: "contacts-history",
        show: "Each past and upcoming booking is listed, and Open Booking jumps to it. Clicking an email or phone in the contact's row copies it.",
        missing: "The history is closed. Click View Bookings in the contact's row to open it again.",
      },
      {
        id: "deleted",
        target: "contacts-deleted",
        show: "Deleted contacts are only hidden. They can be restored from here at any time.",
      },
    ],
  }),

  mini({
    id: "hosting",
    title: "Hosting (internal use)",
    description: "Find and add internal use of the property, kept apart from guest bookings, and see its calendars and spreadsheet.",
    keywords: ["hosting", "host", "internal", "staff event", "board", "convert", "kitchen", "export", "excel"],
    steps: [
      openPage("nav-hosting", "/hosting", "hosting-page", "Hosting is under Internal in the sidebar."),
      {
        id: "what",
        target: "hosting-intro",
        show: "Hosting is internal use of the property, not a guest booking. It gets no guest portal, guest emails or booking reports, but rooms it holds still count as taken.",
        learnMore:
          "A record counts as hosting when its name starts with Host: or Hosting:, or its retreat type is Host or Hosting. A booking that's really internal can be moved here with Convert to Hosting on its profile. If a booking only mentions hosting, a note at the top of this page lists it for you to check.",
      },
      {
        id: "add",
        target: "hosting-add",
        show: "Add hosting creates a new entry: name, dates, contact, guests, meals and notes. Lodging is assigned after it's created.",
      },
      {
        id: "modes",
        target: "hosting-modes",
        show: "Calendar and Lodging calendar work like the main ones, but show hosting only. The availability check here still counts guest bookings, so a room a group holds never looks free.",
      },
      {
        id: "sheet",
        target: "hosting-mode-sheet",
        show: "Spreadsheet lists every entry. I'll open it. This page remembers the view you last used.",
        done: (ctx) => ctx.visible("hosting-sheet"),
        demoClick: true,
      },
      {
        id: "controls",
        target: "hosting-sheet-controls",
        show: "Search, From and To narrow the list, and the ticks add entries without dates or cancelled ones. Column headings sort it, and Export downloads what's shown as an Excel file.",
      },
      {
        id: "open-entry",
        target: ["hosting-open-record", "hosting-sheet"],
        show: "Clicking a name opens the entry. There you can edit it, set its Housing, choose whether the kitchen plans for it, or Convert to booking if it's really a guest group.",
      },
    ],
  }),

  mini({
    id: "reports",
    title: "Reports",
    description: "Find your way around Reports and open the records behind any number.",
    keywords: ["season", "map", "data check", "weekends", "camper days", "compare", "brief"],
    steps: [
      {
        id: "open-reports",
        target: "nav-reports",
        show: "Reports shows how the season is going, where there is room, and which records need fixing. Hosting is internal, so it's left out of the figures.",
        done: (ctx) => ctx.path() === "/reports",
        demoClick: true,
      },
      {
        id: "layout",
        target: "reports-layout",
        show: "New and Original switch between the two layouts. Your choice is remembered in this browser.",
      },
      {
        id: "views",
        target: "reports-tabs",
        show: "Three views: Season Brief for the summary, Season Map for buildings and open weekends, Data Check for records to fix.",
        missing: "Choose New in the Layout switch at the top of the page to see these tabs.",
      },
      {
        id: "figures",
        target: "reports-figures",
        show: "Figures compare the same dates last year. Selecting one lists its records, and Back from a booking returns here.",
        missing: "Open Season Brief with the New layout. These figures appear once stays match your settings.",
      },
    ],
  }),

  mini({
    id: "jobs",
    title: "Jobs",
    description: "See open, overdue and unassigned staff tasks across every booking, yours first.",
    keywords: ["jobs", "tasks", "staff", "overdue", "assigned", "facilities", "checklist", "workload"],
    steps: [
      openPage("nav-jobs", "/jobs", "jobs-summary", "Jobs is under Other in the sidebar."),
      {
        id: "filters",
        target: "jobs-filters",
        show: "Jobs gathers the Checklist and Facilities tasks from every booking, plus who's assigned to each group. Show picks open, completed or all jobs, and cancelled and waitlisted groups stay hidden unless ticked.",
      },
      {
        id: "summary",
        target: "jobs-summary",
        show: "Open, Overdue and Completed count tasks only. Staff assignments show as Assigned and are never overdue.",
      },
      {
        id: "mine",
        target: "jobs-mine",
        show: "My Work lists jobs for the person chosen under Working as in User Admin. Facilities tasks can be marked done here; checklist items are ticked on the booking's Checklists tab.",
      },
      {
        id: "team",
        target: "jobs-team",
        show: "Team Workload groups jobs by staff name, with an Unassigned group for jobs nobody has. Clicking a job opens its booking.",
      },
    ],
  }),

  mini({
    id: "backup",
    title: "Backup",
    description: "Download a backup of the booking data, and see how a restore is checked before anything changes.",
    keywords: ["backup", "restore", "download", "json", "recovery", "snapshot", "data"],
    steps: [
      openPage("nav-backup", "/backup", "backup-overview", "Backup is under Other in the sidebar."),
      {
        id: "actions",
        target: "backup-actions",
        show: "Create Backup Now downloads the booking database as a .json file. Backup files hold guest details, so keep them private. Minimal and Detailed only change how much the page explains.",
      },
      {
        id: "overview",
        target: "backup-overview",
        show: "Live Records counts what's stored now. Last Manual Backup is the last one made in this browser.",
      },
      {
        id: "restore",
        target: "backup-restore",
        show: "Restore starts by choosing a backup file. It's checked and previewed first, and nothing is written until you review the preview and press Restore.",
      },
    ],
  }),
];
