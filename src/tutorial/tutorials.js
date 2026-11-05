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
                 Guided steps without it wait for Next. A step whose done is
                 already true on arrival is skipped (e.g. already on /form).
     capture     ctx => value handed to done as `start` (state when the step began)
     demoClick   demonstration mode clicks the target. Only for navigation,
                 tabs, view switches and Edit Entry (unlocks fields): never
                 saves, submits or deletes. Skipped when the step is already
                 done, so going Back never undoes what the target opened.
     example     demonstration mode shows this labelled example; nothing is typed.
                 Use the same fictional group (Community Bible Church, led by
                 Jordan Smith) across tutorials, with values the field accepts.
     missing     extra hint when the target is not on screen

  ctx (tutorialCore.js createStepContext): path(), visible(id), text(id),
  hasValue(id), filled(id), fields(id).

  Saving is blocked while a tutorial runs: any element with
  data-tutorial-guard (Save Guest Group, Save Changes) cannot be clicked or
  submitted until the tutorial is paused or ended.
*/

export const TUTORIAL_TARGETS = {
  "nav-form": "Form button in the sidebar",
  "nav-master-spreadsheet": "Master Spreadsheet in the sidebar",
  "nav-calendar": "Main Calendar in the sidebar",
  "nav-contacts": "Contacts in the sidebar",

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
  done: (ctx) => ctx.visible("spreadsheet-search") || ctx.visible("booking-profile"),
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
      },
      {
        id: "stats",
        target: "booking-overview-stats",
        say: "These counts show what's recorded for this group.",
        show: "These counts show what's recorded on the booking. A dash means nothing has been entered yet.",
      },
      {
        id: "sections",
        target: "booking-overview-main",
        say: "The rest of the booking is on this one page: guests, meals, activities, facilities, housing and linens, status, timeline, payments and notes.",
        show: "This page has guests, meals, activities, facilities, housing and linens, status, timeline, payments and notes.",
      },
      {
        id: "edit-shortcut",
        target: "booking-overview-edit",
        say: "Edit Booking jumps to the Edit tab. There's a separate tutorial for editing.",
        show: "Edit Booking jumps straight to the Edit tab.",
      },
      {
        id: "back",
        target: "booking-back",
        say: "Back returns you to the Master Spreadsheet. Your search stays in the box, so clear it (×) to see every booking again. You've found and read a booking!",
        show: "Back takes you to the spreadsheet again. A search stays in the box until you clear it (×). That's how you find and read a booking.",
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
      openMasterSpreadsheetStep,
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
        show: "The Main Calendar shows every dated booking.",
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
      },
      {
        id: "agenda",
        target: "calendar-agenda",
        say: "The agenda lists every group in the period you're viewing, with dates and guest counts. That's the calendar!",
        show: "The agenda lists every group shown, with dates, status and guest counts.",
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
      },
      {
        id: "view-bookings",
        target: "contacts-view-bookings",
        say: "Click View Bookings to see every booking this person is part of.",
        show: "View Bookings opens a contact's full booking history. I'll open the first contact on the list.",
        done: (ctx) => ctx.visible("contacts-history"),
        demoClick: true,
        missing: "No contacts match the search. Clear the search box to see everyone.",
      },
      {
        id: "history",
        target: "contacts-history",
        say: "Here's their history. Open Booking jumps to any of these bookings. Tip: click an email or phone number in the contact's row to copy it.",
        show: "Each past and upcoming booking is listed, and Open Booking jumps to it. Clicking an email or phone in the contact's row copies it.",
      },
      {
        id: "deleted",
        target: "contacts-deleted",
        say: "Deleting a contact only hides them from this list, for everyone. Hidden contacts wait here and can be restored anytime.",
        show: "Deleted contacts are only hidden. They can be restored from here at any time.",
      },
    ],
  },
];
