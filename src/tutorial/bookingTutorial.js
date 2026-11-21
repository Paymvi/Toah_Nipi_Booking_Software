/*
  "Work with a booking": one walkthrough built from sections with
  composeWalkthrough (tutorialCore.js), so each section is also a topic of
  its own. Open and Edit keep the ids they had as separate tutorials
  (topicId), so saved progress and related links still find them.

  These run on real bookings (the first one on the Master Spreadsheet) and
  only look: every save is guarded, writeLock refuses writes at the network,
  and the gnome only clicks navigation, tabs, Edit Entry and the Housing
  room breakdown. Field meanings are in tutorials.js.
*/

import { composeWalkthrough } from "./tutorialCore.js";

export const openMasterSpreadsheetStep = {
  id: "open-spreadsheet",
  target: "nav-master-spreadsheet",
  show: "Every booking lives in the Master Spreadsheet, so that's where we start.",
  done: (ctx) => ctx.visible("spreadsheet-search"),
  demoClick: true,
};

// A booking that's already open is a fine place to start.
const openSpreadsheetOrBooking = {
  ...openMasterSpreadsheetStep,
  done: (ctx) => ctx.visible("spreadsheet-search") || ctx.visible("booking-profile"),
};

export const openBookingStep = {
  id: "open-booking",
  target: "spreadsheet-open-booking",
  show: "Clicking a group's name opens that booking's profile. This is only a demo, so I'll open the first group on the list.",
  done: (ctx) => ctx.visible("booking-profile"),
  demoClick: true,
  missing:
    "If the list is empty, clear the search box. If there are no bookings yet, create one first.",
};

const OVERVIEW_MISSING = "This is on the Overview tab. Click Overview in the booking's tabs to bring it back.";
const HOUSING_MISSING = "This is on the Housing tab. Click Housing in the booking's tabs to bring it back.";

const SECTIONS = [
  {
    id: "read",
    topicId: "open-booking",
    title: "Open and read a booking",
    description: "Find a booking in the Master Spreadsheet, open it, and tour the Overview tab.",
    keywords: ["view", "find", "search", "overview", "profile"],
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
        show: "This page has guests, meals, activities, facilities, housing and linens, payments, status and notes. Contract and deposit progress lives in the guest portal, not here.",
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
    id: "edit",
    topicId: "edit-booking",
    title: "Edit a booking",
    description: "Open a booking's Edit tab, make a change, and learn how to save or discard it.",
    keywords: ["change", "update", "modify", "details", "save"],
    steps: [
      openSpreadsheetOrBooking,
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
    id: "housing",
    topicId: "booking-housing",
    title: "Assign housing (Housing tab)",
    description: "Read where a group sleeps, how rooms are assigned and checked for clashes, and how it reaches the Lodging Calendar.",
    keywords: ["housing", "lodging", "rooms", "beds", "buildings", "bethel", "hebron", "dothan", "linens", "clash", "conflict", "assign"],
    steps: [
      { ...openSpreadsheetOrBooking, prep: true },
      { ...openBookingStep, prep: true },
      {
        id: "tab",
        target: "booking-tab-housing",
        show: "Where the group sleeps is recorded on the Housing tab.",
        done: (ctx) => ctx.visible("housing-tab"),
        demoClick: true,
      },
      {
        id: "summary",
        target: "housing-summary",
        show: "Booking Guests is the group's guest count. Known Assigned adds up the guests placed in buildings below, and Unassigned Guests is what's left to place. It says Unknown when a building is marked used without a number.",
        missing: HOUSING_MISSING,
      },
      {
        id: "buildings",
        target: "housing-table",
        show: "Each row is a building, with its housing area and room type. Known Use marks a building the group uses, even before the numbers are known. Assigned Guests is how many sleep there.",
        missing: HOUSING_MISSING,
      },
      {
        id: "expand",
        target: "housing-expand",
        show: "Buildings with floors, rooms or sections open into a breakdown. I'll open the first one.",
        done: (ctx) => ctx.visible("housing-breakdown"),
        demoClick: true,
        missing: HOUSING_MISSING,
      },
      {
        id: "breakdown",
        target: "housing-breakdown",
        show: "Here guests are split by floor and room. Once rooms are filled in, the building's total is worked out from them, and Clear Floor Split removes the split.",
        missing: HOUSING_MISSING,
      },
      {
        id: "edit",
        target: "housing-actions",
        show: "Edit Housing turns all of this into fields: tick Used, type guest counts, fill in rooms, and set linens. Nothing changes until Save Changes, and Cancel puts it all back. In this demo nothing is saved.",
        writes: true,
        missing: HOUSING_MISSING,
      },
      {
        id: "clashes",
        target: ["housing-clashes", "housing-actions"],
        show: "Rooms are checked against other bookings and hosting on the same nights. Unavailable means someone else has that room that night, and Possible clash means room detail is missing. Saving onto a taken room asks you to confirm first.",
        learnMore:
          "Clashes are listed at the top of this tab, each with Open to jump to the other record. Several groups can share a building: only the same room on the same night is a clash. Open inquiries and clearly cancelled groups don't count.",
        missing: HOUSING_MISSING,
      },
      {
        id: "linens",
        target: "housing-linens",
        show: "Linens records whether the group wants linens (No, Some or All) and how many full sets.",
        missing: HOUSING_MISSING,
      },
      {
        id: "lodging-calendar",
        target: "housing-table",
        show: "Once saved, this tab is the booking's lodging record. The Lodging Calendar, its availability check and the clash checks all read it.",
        learnMore:
          "Imported bookings also show their original spreadsheet lodging text below, for reference. Hosting entries have the same Housing section on their own page.",
        missing: HOUSING_MISSING,
      },
    ],
  },
];

const { walkthrough, topics } = composeWalkthrough({
  id: "booking",
  title: "Work with a booking",
  description: "Open a booking, read its Overview, change it on the Edit tab, and assign housing.",
  category: "Bookings",
  difficulty: "Beginner",
  keywords: ["booking", "existing", "profile", "tabs"],
  writeLock: true,
  sections: SECTIONS,
  intro: [
    {
      id: "intro",
      target: "nav-master-spreadsheet",
      show: "A booking's profile holds everything about one group. I'll open one, read it, show where changes are made, and go through its housing. Saving is switched off while I show you.",
    },
  ],
  recap: [
    {
      id: "recap",
      target: "booking-tabs",
      show: "That's a booking: Overview to read it, Edit to change it, and Housing for where the group sleeps. Any topic can be replayed on its own.",
    },
  ],
});

export const BOOKING_WALKTHROUGH = walkthrough;
export const BOOKING_TOPICS = topics;
