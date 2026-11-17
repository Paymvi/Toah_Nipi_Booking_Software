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

  The booking, calendar and mini tutorials live in bookingTutorial.js,
  calendarTutorial.js and miniTutorials.js; a step's `when` is explained
  in calendarTutorial.js.

  role marks whose action a step shows ("staff", "leader" for the group
  leader, "system"), and a step with no target shows a fictional preview
  instead of highlighting: see inquiryJourneyTutorial.js.
*/

import { BOOKING_TOPICS, BOOKING_WALKTHROUGH } from "./bookingTutorial.js";
import { CALENDAR_TOPICS, CALENDAR_WALKTHROUGH } from "./calendarTutorial.js";
import { GUEST_JOURNEY_TOPICS, GUEST_JOURNEY_TUTORIAL } from "./inquiryJourneyTutorial.js";
import { MINI_TUTORIALS } from "./miniTutorials.js";
import { AUTOMATED_EMAILS_TUTORIAL, PORTAL_TOPICS, PORTAL_WALKTHROUGH } from "./portalTutorial.js";

export const TUTORIAL_TARGETS = {
  "nav-form": "Form button in the sidebar",
  "nav-master-spreadsheet": "Master Spreadsheet in the sidebar",
  "nav-calendar": "Main Calendar in the sidebar",
  "nav-lodging-calendar": "Lodging Calendar in the sidebar",
  "nav-inquiry-spreadsheet": "Inquiry Spreadsheet in the sidebar",
  "nav-hosting": "Hosting in the sidebar",
  "nav-jobs": "Jobs in the sidebar",
  "nav-backup": "Backup in the sidebar",
  "nav-contacts": "Contacts in the sidebar",
  "nav-reports": "Reports in the sidebar",
  "nav-portals": "Portals in the sidebar",
  "nav-guest-inquiries": "Guest Inquiries in the sidebar",

  "inquiry-page": "Guest Inquiries page",
  "inquiry-board": "New Requests, Converted and Declined columns",
  "inquiry-workflow-note": "Guest form workflow note",
  "inquiry-column-pending": "New Requests column",
  "inquiry-column-converted": "Converted column",
  "inquiry-column-declined": "Declined column",
  "inquiry-review": "Review button on the request",
  "inquiry-modal": "request details",
  "inquiry-contact": "Contact section",
  "inquiry-stay": "Stay & Guests section",
  "inquiry-reported": "Guest-Reported Documents section",
  "inquiry-decline": "Decline Inquiry button",
  "inquiry-open-form": "Open Prefilled Booking Form button",
  "booking-form-prefill": "note about the request the form came from",


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
  "spreadsheet-years": "All, 2025, 2026 and 2027 buttons",
  "spreadsheet-buildings": "Building Type filter",
  "spreadsheet-dates": "Start and End date boxes",
  "spreadsheet-sort": "Sort By list",
  "spreadsheet-settings-bar": "summary line above the table",

  "inquiry-sheet-intro": "Inquiry Spreadsheet heading",
  "inquiry-sheet-search": "inquiry search box",
  "inquiry-sheet-years": "year buttons",
  "inquiry-sheet-actions": "Book and bin buttons on a row",
  "inquiry-sheet-deleted": "Deleted button",

  "booking-profile": "Booking Profile page",
  "booking-back": "Back button",
  "booking-tabs": "booking tabs",
  "booking-tab-edit": "Edit tab",
  "booking-tab-housing": "Housing tab",
  "booking-overview-summary": "booking summary",
  "booking-overview-stats": "guest and stay counts",
  "booking-overview-edit": "Edit Booking button",
  "booking-overview-density": "Density buttons",
  "booking-overview-main": "booking sections",
  "booking-edit-panel": "booking editor",
  "booking-edit-entry": "Edit Entry button",
  "booking-edit-ready": "booking editor in edit mode",
  "booking-edit-actions": "Cancel and Save Changes buttons",

  "housing-tab": "Housing tab",
  "housing-summary": "Booking Guests, Known Assigned and Unassigned Guests",
  "housing-table": "list of buildings",
  "housing-expand": "building you can open for a room breakdown",
  "housing-breakdown": "room breakdown",
  "housing-actions": "Edit Housing button",
  "housing-clashes": "Lodging clashes list",
  "housing-linens": "Linens section",

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
  "calendar-agenda-booking": "group in the agenda",
  "calendar-grid": "month calendar",

  "lodging-page": "Lodging Calendar",
  "lodging-views": "Month, Week and Year buttons",
  "lodging-view-month": "Month button",
  "lodging-availability": "Availability lookup",
  "lodging-buildings": "building buttons",
  "lodging-building-all": "All Lodging button",
  "lodging-building-bethel": "Bethel button",
  "lodging-grid": "lodging calendar",
  "lodging-agenda": "list of groups beside the calendar",
  "lodging-agenda-title": "building name above the list",

  "contacts-search": "contact search box",
  "contacts-sort": "First Name / Last Name sort",
  "contacts-view-bookings": "View Bookings button",
  "contacts-history": "booking history",
  "contacts-deleted": "Deleted contacts button",

  "reports-layout": "New and Original layout switch",
  "reports-tabs": "Season Brief, Season Map and Data Check tabs",
  "reports-figures": "key figures",

  "hosting-page": "Hosting page",
  "hosting-intro": "Hosting heading",
  "hosting-add": "Add hosting button",
  "hosting-modes": "Calendar, Lodging calendar and Spreadsheet buttons",
  "hosting-mode-sheet": "Spreadsheet button",
  "hosting-sheet": "hosting spreadsheet",
  "hosting-sheet-controls": "Search, date and Export controls",
  "hosting-open-record": "entry's name",

  "jobs-filters": "Show list and the cancelled and waitlisted tick box",
  "jobs-summary": "Open, Overdue, Completed and Unassigned counts",
  "jobs-mine": "My Work list",
  "jobs-team": "Team Workload list",

  "backup-actions": "Create Backup Now and the page view buttons",
  "backup-overview": "Live Records and Last Manual Backup",
  "backup-restore": "Restore from a backup section",

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

export { getCurrentMonthLabel } from "./calendarTutorial.js";
export { MINI_CATEGORY } from "./miniTutorials.js";

const CREATE_BOOKING_TUTORIAL = {
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
};

// Library order. The mini tutorials are shown as one group; the guest journey stays last.
export const TUTORIALS = [
  CREATE_BOOKING_TUTORIAL,
  BOOKING_WALKTHROUGH,
  CALENDAR_WALKTHROUGH,
  PORTAL_WALKTHROUGH,
  AUTOMATED_EMAILS_TUTORIAL,
  ...MINI_TUTORIALS,
  GUEST_JOURNEY_TUTORIAL,
];

// Everything that can be started, including topics, which the library shows under their walkthrough.
export const ALL_TUTORIALS = [...TUTORIALS, ...BOOKING_TOPICS, ...CALENDAR_TOPICS, ...GUEST_JOURNEY_TOPICS, ...PORTAL_TOPICS];
