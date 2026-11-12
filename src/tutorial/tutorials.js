/*
  Tutorial gnome library: what each tutorial teaches, step by step.

  Adding a tutorial needs no engine changes:
  1. Put data-tutorial-target="<id>" on the element in the view and add the
     id to TUTORIAL_TARGETS with a label people would recognise.
  2. Add a tutorial below. Tutorials are demonstrations: the gnome explains
     and the person watches. Each step has:
     target      id, or a list of ids (the first one on screen is used)
     show        what this does
     demoClick   the gnome clicks the target. Only for navigation, tabs, view
                 switches and Edit Entry (unlocks fields): never saves,
                 submits or deletes. Needs done. It is passed over when
                 already done (e.g. already on /form), and the click is left
                 out when reached with Back, so Back never undoes what it opened.
     done        (ctx, start) => true once the page shows the click worked.
     capture     ctx => value handed to done as `start` (state when the step began)
     example     a labelled example; nothing is typed.
                 Use the same fictional group (Community Bible Church, led by
                 Jordan Smith) across tutorials, with values the field accepts.
     missing     extra hint when the target is not on screen
     learnMore   optional detail, folded under "Learn more"

  ctx (tutorialCore.js createStepContext): path(), visible(id), text(id), hasScope().

  Saving is blocked while a tutorial runs: any element with
  data-tutorial-guard (Save Guest Group, Save Changes, every Portal Admin
  action) cannot be clicked or submitted until the tutorial is paused or ended.

  A long tutorial made of sections, each also offered as a topic of its own,
  is built by composeWalkthrough: see portalTutorial.js.
*/

import { AUTOMATED_EMAILS_TUTORIAL, PORTAL_TOPICS, PORTAL_WALKTHROUGH } from "./portalTutorial.js";

export const TUTORIAL_TARGETS = {
  "nav-form": "Form button in the sidebar",
  "nav-master-spreadsheet": "Master Spreadsheet in the sidebar",
  "nav-calendar": "Main Calendar in the sidebar",
  "nav-contacts": "Contacts in the sidebar",
  "nav-reports": "Reports in the sidebar",
  "nav-portals": "Portals in the sidebar",


  "booking-form-details": "Guest Group section of the form",
  "booking-form-group-name": "Guest Group Name field",
  "booking-form-contact": "Primary Contact field",
  "booking-form-retreat-type": "Retreat Type list",
  "booking-form-arrival": "Arrival date",
  "booking-form-departure": "Departure date",
  "booking-form-guests": "Approximate Guests fields",
  "booking-form-save": "Save button at the bottom of the form",

  "spreadsheet-search": "Search Everything box",
  "spreadsheet-open-booking": "group name in the spreadsheet",

  "booking-profile": "Booking Profile page",
  "booking-back": "Back button",
  "booking-tabs": "booking tabs",
  "booking-tab-edit": "Edit tab",
  "booking-overview-summary": "booking summary",
  "booking-overview-stats": "guest and stay counts",
  "booking-overview-edit": "Edit Booking button",
  "booking-overview-density": "Density buttons",
  "booking-overview-main": "booking sections",
  "booking-edit-panel": "booking editor",
  "booking-edit-entry": "Edit Entry button",
  "booking-edit-ready": "booking editor in edit mode",
  "booking-edit-actions": "Cancel and Save Changes buttons",

  "calendar-view": "Main Calendar",
  "calendar-title": "calendar heading",
  "calendar-next": "next month button (»)",
  "calendar-today": "This Month / Today button",
  "calendar-views": "Month, Week and Year buttons",
  "calendar-view-month": "Month button",
  "calendar-view-week": "Week button",
  "calendar-view-year": "Year button",
  "calendar-week-controls": "week controls",
  "calendar-year-view": "year overview",
  "calendar-exceptions": "Also show options",
  "calendar-agenda": "agenda list",

  "contacts-search": "contact search box",
  "contacts-sort": "First Name / Last Name sort",
  "contacts-view-bookings": "View Bookings button",
  "contacts-history": "booking history",
    "contacts-deleted": "Deleted contacts button",

  "reports-layout": "New and Original layout switch",
  "reports-tabs": "Season Brief, Season Map and Data Check tabs",
  "reports-figures": "key figures",

  "portal-page": "Portal Progress page",
  "portal-summary": "summary tiles",
  "portal-toolbar": "Search and Status boxes",
  "portal-search": "Search box",
  "portal-status": "Status list",
  "portal-loading": "loading message",
  "portal-list": "list of groups",
  "portal-card": "group's card",
  "portal-status-pill": "group's status",
  "portal-progress": "group's percentage",
  "portal-metrics": "Complete, Review, Open and Docs counts",
  "portal-checklist": "task list",
  "portal-checklist-empty": "task list",
  "portal-checklist-more": "button that shows the rest of the tasks",
  "portal-item-review": "task that needs review",
  "portal-item-inspect": "Open Upload or View Info button",
  "portal-item-sent-back": "note under the task",
  "portal-confirm": "Confirm button",
  "portal-correct": "Correct… link",
  "portal-correct-needsReview": "Correct… link on a task that needs review",
  "portal-correct-completed": "Correct… link on a completed task",
  "portal-due-input": "Due date box",
  "portal-save-due": "Save due date button",
  "portal-note": "Note to the guest box",
  "portal-send-back": "Send back for changes button",
  "portal-reopen": "Reopen task button",
  "portal-remove-task": "Remove task button",
  "portal-link": "Portal Link",
  "portal-copy-link": "Copy Link button",
  "portal-open-portal": "Open Portal button",
  "portal-open-booking": "Open Booking button",
  "portal-assign-tasks": "Assign Tasks button",
  "portal-task-panel": "task list",
  "portal-task-table": "approved task list",
  "portal-task-selected": "ticked task",
  "portal-task-count": "number of ticked tasks",
  "portal-task-assign": "Assign Task button",
  "portal-assign-documents": "Assign Documents button",
  "portal-doc-panel": "document panel",
  "portal-doc-remove": "Remove button",
  "portal-doc-standard": "standard documents",
  "portal-doc-count": "number of ticked documents",
  "portal-doc-assign": "Assign Document button",
  "portal-custom-upload": "Custom Staff Document section",
  "portal-emails": "Emails button",
  "portal-email-panel": "Portal emails panel",
  "portal-email-state": "email status line",
  "portal-email-recipients": "Recipients section",
  "portal-email-items": "Which items send emails section",
  "portal-email-enable": "Enable section",
  "portal-email-send-now": "Send now section",
  "portal-email-preview": "Preview section",
  "portal-email-history": "History section",
  "portal-email-upcoming": "Upcoming automatic emails list",
  "portal-email-card": "Guest portal emails card",
  "portal-email-summary": "Guest portal emails heading",
  "portal-email-mode": "Sending mode options",
  "portal-email-automatic": "Automatic emails checkbox",
  "portal-email-timing": "reminder timing note",
  "portal-email-readiness": "Server readiness list",
  "portal-email-templates": "Templates section",

};

export const TUTORIAL_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

// "November 2026", matching the Main Calendar heading for the current month.
export function getCurrentMonthLabel(date = new Date()) {
  return `${date.toLocaleString("en-US", { month: "long" })} ${date.getFullYear()}`;
}

const openMasterSpreadsheetStep = {
  id: "open-spreadsheet",
  target: "nav-master-spreadsheet",
  show: "Every booking lives in the Master Spreadsheet, so that's where we start.",
  done: (ctx) => ctx.visible("spreadsheet-search"),
  demoClick: true,
};

const openBookingStep = {
  id: "open-booking",
  target: "spreadsheet-open-booking",
  show: "Clicking a group's name opens that booking's profile. This is only a demo, so I'll open the first group on the list.",
  done: (ctx) => ctx.visible("booking-profile"),
  demoClick: true,
  missing:
    "If the list is empty, clear the search box. If there are no bookings yet, create one first.",
};

const OVERVIEW_MISSING = "This is on the Overview tab. Click Overview in the booking's tabs to bring it back.";

export const TUTORIALS = [
  {
    id: "create-booking",
    title: "Create a booking",
    description: "Open the booking form, fill in the required details, and learn how saving works.",
    category: "Bookings",
    difficulty: "Beginner",
    keywords: ["new", "form", "add", "group", "reservation"],
    steps: [
      {
        id: "open-form",
        target: "nav-form",
        show: "New bookings start from Form in the sidebar. You can also use New Booking on the Dashboard.",
        done: (ctx) => ctx.path() === "/form",
        demoClick: true,
      },
      {
        id: "details",
        target: "booking-form-details",
        show: "These starred fields are required: the group's name (how it appears everywhere), the primary contact staff will talk to, the retreat type, and the arrival and departure dates. Departure can't be before arrival.",
        example: "Community Bible Church · Jordan Smith · Church · June 5 to June 7",
      },
      {
        id: "guests",
        target: "booking-form-guests",
        show: "An estimated guest count is also required. Use the total, or split it into adults and children.",
        example: "45 total guests",
      },
      {
        id: "save",
        target: "booking-form-save",
        show:
          "Once the required fields are in, Save Guest Group adds the booking to the dashboard. If anything is missing, the form lists it at the top. In this demo nothing is saved.",
      },
    ],
  },

  {
    id: "open-booking",
    title: "Open and read a booking",
    description: "Find a booking in the Master Spreadsheet, open it, and tour the Overview tab.",
    category: "Bookings",
    difficulty: "Beginner",
    keywords: ["view", "find", "search", "overview", "profile", "existing"],
    steps: [
      openMasterSpreadsheetStep,
      {
        id: "search",
        target: "spreadsheet-search",
        show: "Search Everything finds bookings by group name, contact, email, phone, rooms and notes. Type a group's name to narrow the list.",
        example: "Community Bible Church",
        missing: "If a booking is open, click its Back button to return to the spreadsheet. Otherwise, open Master Spreadsheet in the sidebar.",
      },
      openBookingStep,
      {
        id: "tabs",
        target: "booking-tabs",
        show: "Each booking has these tabs: Overview, Edit, Housing, Staff Assignments and Checklists.",
      },
      {
        id: "summary",
        target: "booking-overview-summary",
        show: "This is the at-a-glance summary: stay dates, retreat type and contacts.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "stats",
        target: "booking-overview-stats",
        show: "These counts show what's recorded on the booking. A dash means nothing has been entered yet.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "sections",
        target: "booking-overview-main",
        show: "This page has guests, meals, activities, facilities, housing and linens, payments, timeline and notes.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "density",
        target: "booking-overview-density",
        show: "Compact fits more on screen and Large spreads it out. It's the same booking either way, and this browser remembers the choice.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "edit-shortcut",
        target: "booking-overview-edit",
        show: "Edit Booking jumps straight to the Edit tab.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "back",
        target: "booking-back",
        show: "Back leaves the booking: to the spreadsheet here, or to the calendar if you opened it from one. A search stays in the box until you clear it (×). That's how you find and read a booking.",
      },
    ],
  },

  {
    id: "edit-booking",
    title: "Edit a booking",
    description: "Open a booking's Edit tab, make a change, and learn how to save or discard it.",
    category: "Bookings",
    difficulty: "Intermediate",
    keywords: ["change", "update", "modify", "details", "save"],
    steps: [
      // A booking that's already open is a fine place to start.
      { ...openMasterSpreadsheetStep, done: (ctx) => ctx.visible("spreadsheet-search") || ctx.visible("booking-profile") },
      openBookingStep,
      {
        id: "edit-tab",
        target: "booking-tab-edit",
        show: "Changes are made on the Edit tab.",
        done: (ctx) => ctx.visible("booking-edit-panel"),
        demoClick: true,
      },
      {
        id: "edit-entry",
        target: "booking-edit-entry",
        show: "For imported bookings, Edit Entry unlocks the fields. Bookings made with the Form are editable straight away.",
        done: (ctx) => ctx.visible("booking-edit-ready"),
        demoClick: true,
      },
      {
        id: "change-field",
        target: "booking-edit-panel",
        show: "Change any field here: dates, guest count, contacts, notes and more.",
        example: "Phone: the leader's new number, 555-010-2234",
      },
      {
        id: "save-or-discard",
        target: ["booking-edit-actions", "booking-form-save"],
        show:
          "Save Changes stores the edit for everyone. If someone else saved this booking first, you'll be asked to reload so nothing is overwritten. Leaving the tab, or Cancel where shown, discards changes.",
      },
    ],
  },

  {
    id: "calendar",
    title: "Use the calendar",
    description: "Move between months, jump back to today, and switch between Month, Week and Year views.",
    category: "Calendar",
    difficulty: "Beginner",
    keywords: ["month", "week", "year", "dates", "schedule", "agenda"],
    steps: [
      {
        id: "open-calendar",
        target: "nav-calendar",
        show: "The Main Calendar shows your dated bookings at a glance.",
        done: (ctx) => ctx.visible("calendar-view"),
        demoClick: true,
      },
      {
        id: "month-view",
        target: "calendar-view-month",
        show: "Month view is the starting point.",
        done: (ctx) => ctx.visible("calendar-next"),
        demoClick: true,
      },
      {
        id: "next-month",
        target: "calendar-next",
        show: "» moves forward a month and « goes back. The dropdowns jump to any month or year.",
        capture: (ctx) => ctx.text("calendar-title"),
        done: (ctx, start) => ctx.text("calendar-title") !== start,
        demoClick: true,
      },
      {
        id: "this-month",
        target: "calendar-today",
        show: "This Month jumps back to the current month. In Week view it says Today.",
        done: (ctx) => ctx.text("calendar-title") === getCurrentMonthLabel(),
        demoClick: true,
      },
      {
        id: "week-view",
        target: "calendar-view-week",
        show: "Week view shows one week in detail.",
        done: (ctx) => ctx.visible("calendar-week-controls"),
        demoClick: true,
      },
      {
        id: "year-view",
        target: "calendar-view-year",
        show: "Year view shows the whole year. Click any month there to open it.",
        done: (ctx) => ctx.visible("calendar-year-view"),
        demoClick: true,
      },
      {
        id: "back-to-month",
        target: "calendar-view-month",
        show: "And Month brings back the monthly calendar.",
        done: (ctx) => ctx.visible("calendar-next"),
        demoClick: true,
      },
      {
        id: "exceptions",
        target: "calendar-exceptions",
        show: "Also show adds cancelled, waitlisted or archived records. The count shows how many there are this month.",
      },
      {
        id: "agenda",
        target: "calendar-agenda",
        show: "The agenda lists every group shown, with dates, status and guest counts. Clicking a group here or on the calendar opens its booking, and Back returns to this view.",
      },
    ],
  },

  {
    id: "contacts",
    title: "Find and manage contacts",
    description: "Search contacts, sort them, and open a contact's booking history.",
    category: "Contacts",
    difficulty: "Beginner",
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
  },

  {
    id: "reports",
    title: "Read your reports",
    description: "Find your way around Reports and open the records behind any number.",
    category: "Reports",
    difficulty: "Beginner",
    keywords: ["season", "map", "data check", "weekends", "camper days", "compare", "brief"],
    steps: [
      {
        id: "open-reports",
        target: "nav-reports",
        show: "Reports shows how the season is going, where there is room, and which records need fixing.",
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
  },

  PORTAL_WALKTHROUGH,
  AUTOMATED_EMAILS_TUTORIAL,
];

// Everything that can be started, including topics, which the library shows under their walkthrough.
export const ALL_TUTORIALS = [...TUTORIALS, ...PORTAL_TOPICS];
