/*
  Tutorial gnome library: what each tutorial teaches, step by step.

  Adding a tutorial needs no engine changes:
  1. Put data-tutorial-target="<id>" on the element in the view and add the
     id to TUTORIAL_TARGETS with a label people would recognise.
  2. Add a tutorial below. Each step has:
     target      id, or a list of ids (the first one on screen is used)
     say         guided mode ("walk me through it"): what to do now
     show        demonstration mode ("show me"): what this does
     done        (ctx, start) => true once the page shows the step was done.
                 Guided steps without it wait for Next, and their highlighted
                 area can only be looked at: it may hold real actions.
     capture     ctx => value handed to done as `start` (state when the step began)
     demoClick   demonstration mode clicks the target. Only for navigation,
                 tabs, view switches and Edit Entry (unlocks fields): never
                 saves, submits or deletes. Needs done. The later steps rely on
                 it, so guided mode offers no Skip, and it is passed over when
                 already done (e.g. already on /form). The click is also left
                 out when reached with Back, so Back never undoes what it opened.
     explore     a step without done may let people use its highlighted area.
                 Only where everything inside is harmless.
     example     demonstration mode shows this labelled example; nothing is typed.
                 Use the same fictional group (Community Bible Church, led by
                 Jordan Smith) across tutorials, with values the field accepts.
     missing     extra hint when the target is not on screen

  ctx (tutorialCore.js createStepContext): path(), visible(id), text(id),
  hasValue(id), filled(id), fields(id).

  A tutorial may also set `finished`: shown when a guided run ends, for what
  is left on screen now that saving works again.

    Saving is blocked while a tutorial runs: any element with
  data-tutorial-guard (Save Guest Group, Save Changes, every Portal Admin
  action) cannot be clicked or submitted until the tutorial is paused or ended.

  A long tutorial made of sections, each also offered as a topic of its own,
  is built by composeWalkthrough: see portalTutorial.js.
*/

import { PORTAL_TOPICS, PORTAL_WALKTHROUGH } from "./portalTutorial.js";

export const TUTORIAL_TARGETS = {
  "nav-form": "Form button in the sidebar",
  "nav-master-spreadsheet": "Master Spreadsheet in the sidebar",
  "nav-calendar": "Main Calendar in the sidebar",
    "nav-contacts": "Contacts in the sidebar",
  "nav-portals": "Portals in the sidebar",


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
  say: "First, open Master Spreadsheet in the sidebar. It lists every booking.",
  show: "Every booking lives in the Master Spreadsheet, so that's where we start.",
  done: (ctx) => ctx.visible("spreadsheet-search"),
  demoClick: true,
};

const openBookingStep = {
  id: "open-booking",
  target: "spreadsheet-open-booking",
  say: "Click any group's name to open its booking. I've highlighted the first one.",
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
    finished: "Saving is back on, and any practice details stay in the form until you leave it. Leave the Form so they aren't saved by mistake.",
    steps: [
      {
        id: "open-form",
        target: "nav-form",
        say: "Let's create a new booking! Click Form in the sidebar to open the booking form.",
        show: "New bookings start from Form in the sidebar. You can also use New Booking on the Dashboard.",
        done: (ctx) => ctx.path() === "/form",
        demoClick: true,
      },
      {
        id: "group-name",
        target: "booking-form-group-name",
        say: "Perfect! Type the guest group's name here. Any practice name is fine.",
        show: "The Guest Group Name is how the booking appears everywhere: calendars, spreadsheets and reports.",
        example: "Community Bible Church",
        done: (ctx) => ctx.filled("booking-form-group-name"),
      },
      {
        id: "contact",
        target: "booking-form-contact",
        say: "Now add the main person you'll be talking to.",
        show: "The Primary Contact is the group leader staff will talk to.",
        example: "Jordan Smith",
        done: (ctx) => ctx.filled("booking-form-contact"),
      },
      {
        id: "retreat-type",
        target: "booking-form-retreat-type",
        say: "Pick the kind of retreat from this list.",
        show: "Retreat Type groups bookings in reports and on the calendar.",
        example: "Church",
        done: (ctx) => ctx.hasValue("booking-form-retreat-type"),
      },
      {
        id: "arrival",
        target: "booking-form-arrival",
        say: "When does the group arrive? Choose the arrival date.",
        show: "The arrival date puts the booking on the calendar. Times can be added next to it.",
        example: "June 5",
        done: (ctx) => ctx.hasValue("booking-form-arrival"),
      },
      {
        id: "departure",
        target: "booking-form-departure",
        say: "And when do they leave? Choose the departure date.",
        show: "The departure date can't be before the arrival date. The form checks this when you save.",
        example: "June 7 (two nights later)",
        done: (ctx) => ctx.hasValue("booking-form-departure"),
      },
      {
        id: "guests",
        target: "booking-form-guests",
        say: "Enter roughly how many guests are coming: a total, or adults and children.",
        show: "An estimated guest count is required. Use the total, or split it into adults and children.",
        example: "45 total guests",
        done: (ctx) => ctx.filled("booking-form-guests"),
      },
      {
        id: "save",
        target: "booking-form-save",
        say:
          "That's everything required! Meals, activities, lodging and payments can be added now or later. For a real booking you'd click Save Guest Group. Saving is switched off during practice, and leaving the Form clears what you typed.",
        show:
          "Once the required fields are in, Save Guest Group adds the booking to the dashboard. If anything is missing, the form lists it at the top. In this demo nothing is saved.",
      },
    ],
  },

  {
    id: "open-booking",
    title: "Open a booking and read its Overview",
    description: "Find a booking in the Master Spreadsheet, open it, and tour the Overview tab.",
    category: "Bookings",
    difficulty: "Beginner",
    keywords: ["view", "find", "search", "overview", "profile", "existing"],
    steps: [
      openMasterSpreadsheetStep,
      {
        id: "search",
        target: "spreadsheet-search",
        say: "Type a group's name, or part of it, to narrow the list. A contact's name, email or phone works too.",
        show: "Search Everything finds bookings by group name, contact, email, phone, rooms and notes. Type a group's name to narrow the list.",
        example: "Community Bible Church",
        done: (ctx) => ctx.filled("spreadsheet-search"),
        missing: "If a booking is open, click its Back button to return to the spreadsheet. Otherwise, open Master Spreadsheet in the sidebar.",
      },
      openBookingStep,
      {
        id: "tabs",
        target: "booking-tabs",
        say: "This is the Booking Profile. These tabs hold everything about the booking: Overview, Edit, Housing, Staff Assignments and Checklists.",
        show: "Each booking has these tabs: Overview, Edit, Housing, Staff Assignments and Checklists.",
      },
      {
        id: "summary",
        target: "booking-overview-summary",
        say: "The Overview opens first. This is the quick summary: stay dates, booking type and contacts.",
        show: "This is the at-a-glance summary: stay dates, retreat type and contacts.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "stats",
        target: "booking-overview-stats",
        say: "These counts show what's recorded for this group.",
        show: "These counts show what's recorded on the booking. A dash means nothing has been entered yet.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "sections",
        target: "booking-overview-main",
        say: "The rest of the booking is on this one page: guests, meals, activities, facilities, housing and linens, payments, timeline and notes.",
        show: "This page has guests, meals, activities, facilities, housing and linens, payments, timeline and notes.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "density",
        target: "booking-overview-density",
        say: "Prefer more room? Compact fits more on screen and Large spreads it out. It's the same booking either way, and this browser remembers your choice.",
        show: "Compact fits more on screen and Large spreads it out. It's the same booking either way, and this browser remembers the choice.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "edit-shortcut",
        target: "booking-overview-edit",
        say: "Edit Booking jumps to the Edit tab. There's a separate tutorial for editing.",
        show: "Edit Booking jumps straight to the Edit tab.",
        missing: OVERVIEW_MISSING,
      },
      {
        id: "back",
        target: "booking-back",
        say: "Back leaves the booking. You came from the Master Spreadsheet, so it returns you there (from a calendar, it returns you to that calendar). Your search stays in the box, so clear it (×) to see every booking again. You've found and read a booking!",
        show: "Back leaves the booking: to the spreadsheet here, or to the calendar if you opened it from one. A search stays in the box until you clear it (×). That's how you find and read a booking.",
        explore: true,
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
    finished: "Saving is back on, and any practice changes are still on the Edit tab. Switch to the Overview tab to discard them.",
    steps: [
      // A booking that's already open is a fine place to start.
      { ...openMasterSpreadsheetStep, done: (ctx) => ctx.visible("spreadsheet-search") || ctx.visible("booking-profile") },
      openBookingStep,
      {
        id: "edit-tab",
        target: "booking-tab-edit",
        say: "Open the Edit tab.",
        show: "Changes are made on the Edit tab.",
        done: (ctx) => ctx.visible("booking-edit-panel"),
        demoClick: true,
      },
      {
        id: "edit-entry",
        target: "booking-edit-entry",
        say: "Imported bookings start read-only. Click Edit Entry to unlock the fields.",
        show: "For imported bookings, Edit Entry unlocks the fields. Bookings made with the Form are editable straight away.",
        done: (ctx) => ctx.visible("booking-edit-ready"),
        demoClick: true,
      },
      {
        id: "change-field",
        target: "booking-edit-panel",
        say: "Now change any field, like the phone number or a note. It's practice, so nothing is saved.",
        show: "Change any field here: dates, guest count, contacts, notes and more.",
        example: "Phone: the leader's new number, 555-010-2234",
        capture: (ctx) => ctx.fields("booking-edit-panel"),
        done: (ctx, start) => ctx.fields("booking-edit-panel") !== start,
      },
      {
        id: "save-or-discard",
        target: ["booking-edit-actions", "booking-form-save"],
        say:
          "For real changes you'd click Save Changes. It's switched off during practice. To throw away practice changes, switch back to the Overview tab (imported bookings also have a Cancel button).",
        show:
          "Save Changes stores the edit for everyone. If someone else saved this booking first, you'll be asked to reload so nothing is overwritten. Leaving the tab, or Cancel where shown, discards changes.",
        explore: true,
      },
    ],
  },

  {
    id: "calendar",
    title: "Navigate the Calendar",
    description: "Move between months, jump back to today, and switch between Month, Week and Year views.",
    category: "Calendar",
    difficulty: "Beginner",
    keywords: ["month", "week", "year", "dates", "schedule", "agenda"],
    steps: [
      {
        id: "open-calendar",
        target: "nav-calendar",
        say: "Open Main Calendar in the sidebar.",
        show: "The Main Calendar shows your dated bookings at a glance.",
        done: (ctx) => ctx.visible("calendar-view"),
        demoClick: true,
      },
      {
        id: "month-view",
        target: "calendar-view-month",
        say: "Let's start in Month view. Click Month.",
        show: "Month view is the starting point.",
        done: (ctx) => ctx.visible("calendar-next"),
        demoClick: true,
      },
      {
        id: "next-month",
        target: "calendar-next",
        say: "» goes forward a month and « goes back. Click » to peek at next month.",
        show: "» moves forward a month and « goes back. The dropdowns jump to any month or year.",
        capture: (ctx) => ctx.text("calendar-title"),
        done: (ctx, start) => ctx.text("calendar-title") !== start,
        demoClick: true,
      },
      {
        id: "this-month",
        target: "calendar-today",
        say: "This Month brings you back to today's month. Give it a click.",
        show: "This Month jumps back to the current month. In Week view it says Today.",
        done: (ctx) => ctx.text("calendar-title") === getCurrentMonthLabel(),
        demoClick: true,
      },
      {
        id: "week-view",
        target: "calendar-view-week",
        say: "Click Week to see a single week in detail.",
        show: "Week view shows one week in detail.",
        done: (ctx) => ctx.visible("calendar-week-controls"),
        demoClick: true,
      },
      {
        id: "year-view",
        target: "calendar-view-year",
        say: "Now click Year for the big picture.",
        show: "Year view shows the whole year. Click any month there to open it.",
        done: (ctx) => ctx.visible("calendar-year-view"),
        demoClick: true,
      },
      {
        id: "back-to-month",
        target: "calendar-view-month",
        say: "Click Month to go back to the monthly calendar.",
        show: "And Month brings back the monthly calendar.",
        done: (ctx) => ctx.visible("calendar-next"),
        demoClick: true,
      },
      {
        id: "exceptions",
        target: "calendar-exceptions",
        say: "Cancelled, waitlisted, archived and host records only appear when you tick them here. This browser remembers your choice.",
        show: "Also show adds cancelled, waitlisted, archived or host records. The count shows how many there are this month.",
        explore: true,
      },
      {
        id: "agenda",
        target: "calendar-agenda",
        say: "The agenda lists every group in the period you're viewing. Click a group here or on the calendar to open its booking, and its Back button brings you right back. That's the calendar!",
        show: "The agenda lists every group shown, with dates, status and guest counts. Clicking a group here or on the calendar opens its booking, and Back returns to this view.",
        explore: true,
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
        say: "Open Contacts in the sidebar.",
        show: "Contacts are built automatically from every booking.",
        done: (ctx) => ctx.visible("contacts-search"),
        demoClick: true,
      },
      {
        id: "search",
        target: "contacts-search",
        say: "Type a person's name, or part of it. Their group, email, phone or address works too.",
        show: "Search by a person's name to find them. Groups, addresses, emails, phone numbers and status work too.",
        example: "Jordan Smith",
        done: (ctx) => ctx.filled("contacts-search"),
      },
      {
        id: "sort",
        target: "contacts-sort",
        say: "Sort by first or last name here. Starred contacts can be pinned to the top with the checkbox next to it.",
        show: "Sort by first or last name. Tick Show starred contacts first to keep starred people at the top.",
        explore: true,
      },
      {
        id: "view-bookings",
        target: "contacts-view-bookings",
        say: "Click View Bookings to see every booking this person is part of.",
        show: "View Bookings opens a contact's full booking history. I'll open the first contact on the list.",
        done: (ctx) => ctx.visible("contacts-history"),
        demoClick: true,
        missing: "No contacts match the search, so clear the search box to see everyone. If it's still empty, contacts appear once bookings exist.",
      },
      {
        id: "history",
        target: "contacts-history",
        say: "Here's their history. Open Booking jumps to any of these bookings. Tip: click an email or phone number in the contact's row to copy it.",
        show: "Each past and upcoming booking is listed, and Open Booking jumps to it. Clicking an email or phone in the contact's row copies it.",
        missing: "The history is closed. Click View Bookings in the contact's row to open it again.",
      },
      {
        id: "deleted",
        target: "contacts-deleted",
        say: "Deleting a contact only hides them from this list, for everyone. Hidden contacts wait here and can be restored anytime.",
                show: "Deleted contacts are only hidden. They can be restored from here at any time.",
      },
    ],
  },

  PORTAL_WALKTHROUGH,
];

// Everything that can be started, including topics, which the library shows under their walkthrough.
export const ALL_TUTORIALS = [...TUTORIALS, ...PORTAL_TOPICS];
