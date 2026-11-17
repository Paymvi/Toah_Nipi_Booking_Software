/*
  "Use the calendars": the Main Calendar and the Lodging Calendar in one
  walkthrough built with composeWalkthrough (tutorialCore.js), so each
  section is also a topic that starts from any screen.

  The Hosting page shows the same calendar components, so "on the Main
  Calendar" and "on the Lodging Calendar" are checked by address as well as
  by what is on screen.

  when (TutorialRunner): the step is passed by unless this is true when it's
  reached. Opening a booking from the calendar needs a group in the month on
  screen; without one, an explanation is shown instead.
*/

import { composeWalkthrough } from "./tutorialCore.js";

// "November 2026", matching the Main Calendar heading for the current month.
export function getCurrentMonthLabel(date = new Date()) {
  return `${date.toLocaleString("en-US", { month: "long" })} ${date.getFullYear()}`;
}

const onMainCalendar = (ctx) => ctx.path() === "/calendar" && ctx.visible("calendar-view");
const onLodgingCalendar = (ctx) => ctx.path() === "/lodging-calendar" && ctx.visible("lodging-page");
const asPrep = (step) => ({ ...step, prep: true });

const openCalendar = {
  id: "open-calendar",
  target: "nav-calendar",
  show: "The Main Calendar shows every dated guest booking at a glance.",
  done: onMainCalendar,
  demoClick: true,
};

const monthView = {
  id: "month-view",
  target: "calendar-view-month",
  show: "Month view is the starting point.",
  done: (ctx) => onMainCalendar(ctx) && ctx.visible("calendar-next"),
  demoClick: true,
};

const openLodging = {
  id: "open-lodging",
  target: "nav-lodging-calendar",
  show: "The Lodging Calendar, under Main Calendar in the sidebar, shows which buildings each group uses.",
  done: onLodgingCalendar,
  demoClick: true,
};

const lodgingMonthView = {
  id: "lodging-month",
  prep: true,
  target: "lodging-view-month",
  show: "I'll switch to Month view.",
  done: (ctx) => ctx.visible("lodging-grid"),
  demoClick: true,
};

const SECTIONS = [
  {
    id: "move",
    title: "Move around the Main Calendar",
    description: "Change months, jump back to today, and switch between Month, Week and Year.",
    keywords: ["month", "week", "year", "dates", "next", "today"],
    steps: [
      openCalendar,
      monthView,
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
    ],
  },

  {
    id: "read",
    title: "Read the calendar and open a booking",
    description: "Read the bars and the agenda, show cancelled or waitlisted groups, and open a booking from the calendar.",
    keywords: ["agenda", "bar", "open", "cancelled", "waitlist", "archived", "also show"],
    steps: [
      asPrep(openCalendar),
      asPrep(monthView),
      {
        id: "grid",
        target: "calendar-grid",
        show: "Each bar is one group, running from arrival to departure. Groups that overlap get their own rows, and pointing at a bar shows its details.",
      },
      {
        id: "exceptions",
        target: "calendar-exceptions",
        show: "Also show adds cancelled, waitlisted or archived records. The count shows how many there are this month.",
      },
      {
        id: "agenda",
        target: "calendar-agenda",
        show: "The agenda lists every group shown this month, with dates, status and guest counts.",
      },
      {
        id: "no-groups",
        prep: true,
        when: (ctx) => !ctx.visible("calendar-agenda-booking"),
        target: "calendar-agenda",
        show: "There are no groups this month to open. When there are, clicking one here, or its bar on the calendar, opens its booking.",
      },
      {
        id: "open-booking",
        when: (ctx) => ctx.visible("calendar-agenda-booking"),
        target: "calendar-agenda-booking",
        show: "Clicking a group here, or its bar on the calendar, opens its booking. I'll open the first one.",
        done: (ctx) => ctx.visible("booking-back"),
        demoClick: true,
      },
      {
        id: "back",
        when: (ctx) => ctx.visible("booking-back"),
        target: "booking-back",
        show: "Back returns to the calendar on the same month, so you don't lose your place.",
        done: onMainCalendar,
        demoClick: true,
      },
    ],
  },

  {
    id: "lodging",
    title: "Use the Lodging Calendar",
    description: "See which building each group uses, filter by building, and read the lodging list.",
    keywords: ["lodging", "buildings", "rooms", "bethel", "hebron", "unassigned", "heatmap"],
    steps: [
      openLodging,
      lodgingMonthView,
      {
        id: "buildings",
        target: "lodging-buildings",
        show: "Each button is a building, with how many groups use it this month. Unassigned is for groups with no building yet.",
      },
      {
        id: "pick-building",
        target: "lodging-building-bethel",
        show: "Choosing a building shows only the groups staying there. I'll pick Bethel.",
        done: (ctx) => !["All Lodging", "Unassigned", ""].includes(ctx.text("lodging-agenda-title")),
        demoClick: true,
      },
      {
        id: "one-building",
        target: "lodging-grid",
        show: "Now the calendar shows only that building's groups, in its colour.",
      },
      {
        id: "all-lodging",
        target: "lodging-building-all",
        show: "All Lodging brings everyone back. Each bar then names the buildings its group uses, and takes the colour of its first one. Grey means no building yet.",
        done: (ctx) => ctx.text("lodging-agenda-title") === "All Lodging",
        demoClick: true,
      },
      {
        id: "list",
        target: "lodging-agenda",
        show: "This list shows the groups for the chosen building this month, with the rooms or counts from their Housing tab. Clicking one opens its booking.",
        learnMore:
          "Open inquiries and clearly cancelled groups aren't shown on this calendar. Hosting isn't either: it has its own Lodging calendar on the Hosting page.",
      },
      {
        id: "views",
        target: "lodging-views",
        show: "Week and Year work as on the Main Calendar. Year view adds a Heatmap, where darker days have more groups, and Cards with each month's groups.",
      },
    ],
  },

  {
    id: "availability",
    title: "Check which buildings are free",
    description: "Use the availability lookup to see which buildings are free, shared or clashing for a date range.",
    keywords: ["availability", "free", "available", "summary", "conflict", "clash", "nights", "capacity"],
    steps: [
      asPrep(openLodging),
      {
        id: "lookup",
        target: "lodging-availability",
        show: "To check a date range, choose a start and an end date, then Generate Available Lodging Summary. Nothing is booked or held by checking.",
        example: "June 5 to June 7",
      },
      {
        id: "nights",
        target: "lodging-availability",
        show: "Lodging counts nights. A group leaving on June 7 doesn't hold its building that night, so another group can arrive the same day.",
      },
      {
        id: "results",
        target: "lodging-availability",
        show: "Each building comes back as Available, In use, Shared (several groups, no clash found) or Room conflict (two groups in the same room on the same night). Notes say where room detail is missing, or a night goes over a building's recorded capacity.",
        learnMore:
          "Every booking and hosting entry counts, except open inquiries and clearly cancelled groups. Hosting isn't drawn on this calendar but still holds its rooms. Room conflicts come from the rooms saved on each booking's Housing tab.",
      },
    ],
  },
];

const { walkthrough, topics } = composeWalkthrough({
  id: "calendar",
  title: "Use the calendars",
  description: "Move around the Main Calendar, open a booking from it, and use the Lodging Calendar to see buildings and check what's free.",
  category: "Calendar",
  difficulty: "Beginner",
  keywords: ["calendar", "schedule", "dates"],
  writeLock: true,
  sections: SECTIONS,
  intro: [
    {
      id: "intro",
      target: "nav-calendar",
      show: "There are two calendars. The Main Calendar shows when each group is here, and the Lodging Calendar shows which buildings they use. I'll show you both. Nothing is changed.",
    },
  ],
  recap: [
    {
      id: "recap",
      target: "lodging-buildings",
      show: "That's both calendars: move around the Main Calendar, open a group from it, filter the Lodging Calendar by building, and check which buildings are free. Any topic can be replayed on its own.",
    },
  ],
});

export const CALENDAR_WALKTHROUGH = walkthrough;
export const CALENDAR_TOPICS = topics;
