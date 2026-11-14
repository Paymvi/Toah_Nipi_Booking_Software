/*
  Meals, dietary needs and guest counts: one reader for the office Booking
  Overview and both staff-app kitchen views (By Day, By Booking).

  The parsers at the top were moved here unchanged from Dashboard.jsx so the
  office screen keeps its behaviour. The functions below them add the staff
  app's stricter rules:

    - Structured data first: rentalFormDetails.mealSchedule (limited to the
      stay dates, as Create Booking's own summary is), then the date rows in
      the saved meal summary. Imported meal text that never became a clear
      schedule is "needs review", never guessed.
    - A missing guest count is unknown, never zero. A recorded 0 stays 0.
    - "Confirmed" needs evidence: an actual count AND the guest portal's
      "Confirm final guest counts" task approved by staff. An actual count
      alone is "Recorded".
    - The booking stores one guest count for the stay, not one per meal; the
      views say so instead of implying per-meal attendance.
    - Dietary categories can overlap, so they are never added together.
*/

import { getStayDates } from "./dateUtils.js";
import { getBookingDetails } from "./bookingFields.js";
import { isUnknownBookingText } from "./bookingClassification.js";

export const MEAL_KEYS = Object.freeze(["breakfast", "lunch", "dinner"]);
export const MEAL_LABELS = Object.freeze({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" });

/* ---------------------------------------------------------
   Booking Overview parsers (moved verbatim from Dashboard.jsx)
--------------------------------------------------------- */

export function getFirstSelectedMeal(dateRows = []) {
  for (const row of dateRows) {
    if (row.breakfast) return "Breakfast";
    if (row.lunch) return "Lunch";
    if (row.dinner) return "Dinner";
  }

  return "";
}

export function getLastSelectedMeal(dateRows = []) {
  for (let index = dateRows.length - 1; index >= 0; index -= 1) {
    const row = dateRows[index];

    if (row.dinner) return "Dinner";
    if (row.lunch) return "Lunch";
    if (row.breakfast) return "Breakfast";
  }

  return "";
}

export function parseBookingMealSummary(summary = "") {
  const text = typeof summary === "string" ? summary : "";

  const segments = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const dateRows = segments
    .filter((part) =>
      /^[A-Za-z]{3},\s[A-Za-z]{3}\s\d{1,2},\s\d{4}\s*:/i.test(part)
    )
    .map((part) => {
      const [dateLabelPart, mealsPart = ""] = part.split(/:(.+)/);

      const selections = mealsPart
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      return {
        dateLabel: dateLabelPart.trim(),
        breakfast: selections.includes("breakfast"),
        lunch: selections.includes("lunch"),
        dinner: selections.includes("dinner"),
      };
    });

  const totalMatch = text.match(/Total meals:\s*(\d+)/i);
  const breakfastCountMatch = text.match(/Breakfast:\s*(\d+)/i);
  const lunchCountMatch = text.match(/Lunch:\s*(\d+)/i);
  const dinnerCountMatch = text.match(/Dinner:\s*(\d+)/i);
  const breakfastTimeMatch = text.match(/Breakfast time:\s*([^;]+)/i);
  const lunchTimeMatch = text.match(/Lunch time:\s*([^;]+)/i);
  const dinnerTimeMatch = text.match(/Dinner time:\s*([^;]+)/i);

  return {
    totalMeals: totalMatch ? totalMatch[1] : "",
    breakfastCount: breakfastCountMatch ? breakfastCountMatch[1] : "0",
    lunchCount: lunchCountMatch ? lunchCountMatch[1] : "0",
    dinnerCount: dinnerCountMatch ? dinnerCountMatch[1] : "0",
    breakfastTime: breakfastTimeMatch ? breakfastTimeMatch[1].trim() : "",
    lunchTime: lunchTimeMatch ? lunchTimeMatch[1].trim() : "",
    dinnerTime: dinnerTimeMatch ? dinnerTimeMatch[1].trim() : "",
    dateRows,
    firstMeal: getFirstSelectedMeal(dateRows),
    lastMeal: getLastSelectedMeal(dateRows),
  };
}

export function parseBookingDietarySummary(summary = "") {
  const fullText = typeof summary === "string" ? summary : "";

  // Create Booking writes the note last, and it may contain ";", so it is taken whole.
  const noteStart = fullText.search(/(?:^|;)\s*Additional notes:/i);
  const text = noteStart === -1 ? fullText : fullText.slice(0, noteStart);
  const additionalNotesMatch = noteStart === -1
    ? null
    : fullText.slice(noteStart).match(/Additional notes:\s*([\s\S]+)$/i);

  const parts = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const items = [];
  const additionalNotes = additionalNotesMatch ? additionalNotesMatch[1].trim() : "";

  parts.forEach((part) => {
    const quantityMatch = part.match(/^(\d+)\s*-\s*(.+)$/);

    if (quantityMatch) {
      items.push({
        quantity: quantityMatch[1],
        label: quantityMatch[2].trim(),
      });
      return;
    }

    items.push({
      quantity: "—",
      label: part,
    });
  });

  return {
    items,
    additionalNotes,
  };
}

// "16:30" -> "4:30 PM"; text that already says AM/PM, or is not a time, is kept as written.
export function formatMealTime(value) {
  if (!value) return "—";

  const time = String(value).trim();

  if (
    time.toLowerCase().includes("am") ||
    time.toLowerCase().includes("pm")
  ) {
    return time;
  }

  const parts = time.split(":");

  if (parts.length < 2) {
    return time;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return time;
  }

  const date = new Date();

  date.setHours(hours);
  date.setMinutes(minutes);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------------------------------------------------------
   Staff app: meal days per booking
--------------------------------------------------------- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function text(value) {
  return String(value ?? "").trim();
}

function hasText(value) {
  const value_ = text(value);
  return value_ !== "" && !isUnknownBookingText(value_);
}

// "Fri, Nov 20, 2026" (the summary's date label) -> "2026-11-20", or "".
export function summaryDateLabelToKey(label) {
  const match = text(label).match(/^[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return "";
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return "";
  const key = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? "" : key;
}

// Same "no meals" words the Master importer recognises.
function saysNoMeals(value) {
  return /^(?:no meals?|none|n\/?a|0)$/i.test(text(value));
}

/*
  Which meals a booking has on which dates.

  status:
    "planned"      days[] is the schedule (source "schedule" or "summary")
    "no-meals"     the booking explicitly records no meals
    "needs-review" there is meal text, but no clear schedule (reviewText)
    "missing"      nothing about meals is recorded
*/
export function getBookingMealDays(booking) {
  const details = getBookingDetails(booking);
  const stayDates = getStayDates(booking?.startDate, booking?.endDate || booking?.startDate);
  const stay = new Set(stayDates);
  const schedule = details.mealSchedule && typeof details.mealSchedule === "object" && !Array.isArray(details.mealSchedule)
    ? details.mealSchedule
    : {};

  const scheduledDays = stayDates
    .map((date) => ({
      date,
      breakfast: schedule[date]?.breakfast === true,
      lunch: schedule[date]?.lunch === true,
      dinner: schedule[date]?.dinner === true,
    }))
    .filter((day) => day.breakfast || day.lunch || day.dinner);

  if (scheduledDays.length) {
    return { status: "planned", source: "schedule", days: scheduledDays, reviewText: "" };
  }

  const mealsText = text(booking?.meals);
  const summaryDays = parseBookingMealSummary(mealsText).dateRows
    .map((row) => ({ ...row, date: summaryDateLabelToKey(row.dateLabel) }))
    .filter((row) => row.date && (row.breakfast || row.lunch || row.dinner));
  const outsideStay = summaryDays.some((row) => stay.size && !stay.has(row.date));

  if (summaryDays.length && !outsideStay) {
    return {
      status: "planned",
      source: "summary",
      days: summaryDays.map(({ date, breakfast, lunch, dinner }) => ({ date, breakfast, lunch, dinner })),
      reviewText: "",
    };
  }

  const countText = text(details.numberOfMeals || booking?.mealCount);
  if (saysNoMeals(mealsText) || (!mealsText && countText === "0")) {
    return { status: "no-meals", source: "", days: [], reviewText: "" };
  }

  const reviewText = [mealsText, text(details.importedMealText)]
    .filter((value, index, all) => hasText(value) && all.indexOf(value) === index)
    .join("\n");
  if (reviewText || outsideStay || (countText && countText !== "0")) {
    return {
      status: "needs-review",
      source: "",
      days: [],
      reviewText: reviewText || `${countText} meal(s) recorded, but not which ones.`,
    };
  }

  return { status: "missing", source: "", days: [], reviewText: "" };
}

// Service time for one meal: the form field first, then the saved summary.
export function getMealServiceTime(booking, mealKey) {
  const details = getBookingDetails(booking);
  const fromDetails = text(details[`${mealKey}Time`]);
  if (fromDetails) return fromDetails;
  return parseBookingMealSummary(text(booking?.meals))[`${mealKey}Time`] || "";
}

/* ---------------------------------------------------------
   Staff app: guest counts
--------------------------------------------------------- */

// "42" -> 42, "0" -> 0; anything else ("~28", "40-50", "TBD", "") -> null.
export function parseWholeCount(value) {
  const value_ = text(value).replace(/,/g, "");
  return /^\d+$/.test(value_) ? Number(value_) : null;
}

function sumCounts(values) {
  const present = values.map(text).filter((value) => value !== "");
  if (!present.length) return { value: null, unclear: false };
  const numbers = present.map(parseWholeCount);
  if (numbers.some((number) => number === null)) return { value: null, unclear: true };
  return { value: numbers.reduce((sum, number) => sum + number, 0), unclear: false };
}

function isMasterSource(booking) {
  return /^master 20\d{2}$/.test(text(booking?.sourceType).toLowerCase());
}

/*
  The guest count staff should plan with, and how sure it is.

  status: "confirmed" | "recorded" | "estimate" | "unclear" | "missing"
  value:  whole number, or null when unknown (never 0 for "unknown")
  text:   what the booking says when it is not a clear number
*/
export function getGuestCount(booking) {
  const details = getBookingDetails(booking);
  const confirmedByPortal = booking?.guestCountConfirmed === true;

  const actual = sumCounts([
    details.actualAdultGuests,
    details.actualChildrenUnder3,
    text(details.actualChildren3to17) || details.actualChildrenGuests,
  ]);
  const approxBreakdown = sumCounts([
    details.approxAdultGuests,
    details.approxChildrenUnder3,
    text(details.approxChildren3to17) || details.approxChildrenGuests,
  ]);

  const master = isMasterSource(booking);
  const summaryText = text(booking?.attendeeCount) || text(booking?.persons);
  const summary = parseWholeCount(summaryText);

  let recorded = actual.value;
  if (recorded === null && master && details.importedGuestCountKind === "recorded" && summary !== null) {
    recorded = summary;
  }

  let estimate = approxBreakdown.value ?? parseWholeCount(details.approxTotalGuests);
  // Without an actual count, the summary column holds the estimate (Create Booking saves actual || estimate).
  if (estimate === null && recorded === null && summary !== null) estimate = summary;

  if (recorded !== null) {
    return {
      status: confirmedByPortal ? "confirmed" : "recorded",
      value: recorded,
      estimate,
      text: "",
      confirmedAt: confirmedByPortal ? booking?.guestCountConfirmedAt || "" : "",
    };
  }

  if (estimate !== null) {
    return { status: "estimate", value: estimate, estimate, text: "", confirmedAt: "" };
  }

  const unclearText = [summaryText, text(details.approxTotalGuests), text(details.importedGuestCountText)]
    .find(hasText) || "";
  if (unclearText || actual.unclear || approxBreakdown.unclear) {
    return { status: "unclear", value: null, estimate: null, text: unclearText, confirmedAt: "" };
  }

  return { status: "missing", value: null, estimate: null, text: "", confirmedAt: "" };
}

export const COUNT_STATUS_LABELS = Object.freeze({
  confirmed: "Confirmed",
  recorded: "Recorded",
  estimate: "Estimate",
  unclear: "Needs review",
  missing: "Missing",
});

/* ---------------------------------------------------------
   Staff app: dietary alerts
--------------------------------------------------------- */

/*
  Only explicit wording marks a row as an allergy. "Peanut" or "Celiac"
  alone stays an ordinary row: visible, never relabelled, never guessed.
*/
const ALLERGY_WORDING = /\ballerg|\banaphyla|\bepi-?pens?\b/i;

export function isAllergyWording(label) {
  return ALLERGY_WORDING.test(text(label));
}

/*
  Dietary rows as the Booking Overview parses them, with allergy rows first
  (stable order otherwise). Quantities stay text: "—" means not given.
  No total is offered: one guest can appear in several rows.
*/
export function getDietaryAlerts(foodAllergiesText) {
  const parsed = parseBookingDietarySummary(text(foodAllergiesText));
  const items = parsed.items.map((item, index) => ({
    ...item,
    index,
    isAllergy: isAllergyWording(item.label),
    quantityKnown: /^\d+$/.test(item.quantity),
  }));
  items.sort((a, b) => Number(b.isAllergy) - Number(a.isAllergy) || a.index - b.index);
  return {
    items,
    additionalNotes: parsed.additionalNotes,
    hasAny: items.length > 0 || Boolean(parsed.additionalNotes),
  };
}

/* ---------------------------------------------------------
   Staff app: kitchen day (By Day)
--------------------------------------------------------- */

// "8:00 AM", "08:00" and "8:00am" all sort and group as 08:00.
export function normalizeServiceTime(value) {
  const value_ = text(value).toLowerCase().replace(/\./g, "");
  const match = value_.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (match[3]) {
    if (hour < 1 || hour > 12) return "";
    hour = (hour % 12) + (match[3] === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || (!match[3] && !match[2])) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function bookingOnDate(booking, dateKey) {
  const start = text(booking?.startDate);
  const end = text(booking?.endDate) || start;
  return Boolean(start) && start <= dateKey && dateKey <= end;
}

/*
  Every meal service on one date across bookings.

  Per meal: groups eating, split into services by time (a separate card per
  time), and a total with an honest label:
    totalKind "confirmed"   every count is Confirmed
              "mixed"       all counts known, some are Recorded or Estimate
              "incomplete"  at least one group's count is unknown; total is "at least"
  Groups on site whose meals are unclear or missing are listed in `unplanned`
  and never counted. Day campers are listed in `dayCampers`: the booking
  records how many meals they eat, not which ones.
*/
export function getKitchenDay(bookings = [], dateKey) {
  const meals = MEAL_KEYS.map((key) => ({ key, label: MEAL_LABELS[key], groups: [] }));
  const unplanned = [];
  const dayCampers = [];

  bookings.forEach((booking) => {
    if (!bookingOnDate(booking, dateKey)) return;
    const plan = getBookingMealDays(booking);
    const count = getGuestCount(booking);
    const details = getBookingDetails(booking);

    if (plan.status === "needs-review" || plan.status === "missing") {
      unplanned.push({ booking, plan, count });
    }

    const dayCamperCount = parseWholeCount(details.dayCamperCount);
    if (dayCamperCount) {
      dayCampers.push({ booking, count: dayCamperCount, mealsEach: text(details.dayCamperMeals) });
    }

    const day = plan.status === "planned" ? plan.days.find((entry) => entry.date === dateKey) : null;
    if (!day) return;

    const lastDay = plan.days[plan.days.length - 1];
    const lastMealKey = lastDay ? [...MEAL_KEYS].reverse().find((key) => lastDay[key]) : "";
    const firstDay = plan.days[0];
    const firstMealKey = firstDay ? MEAL_KEYS.find((key) => firstDay[key]) : "";

    meals.forEach((meal) => {
      if (!day[meal.key]) return;
      const time = getMealServiceTime(booking, meal.key);
      meal.groups.push({
        booking,
        count,
        time,
        timeKey: normalizeServiceTime(time),
        isFirstMeal: day === firstDay && meal.key === firstMealKey,
        isLastMeal: day === lastDay && meal.key === lastMealKey,
      });
    });
  });

  meals.forEach((meal) => {
    const byTime = new Map();
    meal.groups.forEach((group) => {
      const key = group.timeKey || (text(group.time) ? `text:${text(group.time)}` : "unknown");
      if (!byTime.has(key)) byTime.set(key, { key, time: group.time, groups: [] });
      byTime.get(key).groups.push(group);
    });
    meal.services = [...byTime.values()]
      .sort((a, b) => (a.key === "unknown") - (b.key === "unknown") || a.key.localeCompare(b.key))
      .map((service) => ({ ...service, ...summarizeCounts(service.groups) }));
    Object.assign(meal, summarizeCounts(meal.groups));
  });

  return { dateKey, meals, unplanned, dayCampers };
}

export function summarizeCounts(groups = []) {
  const known = groups.filter((group) => group.count.value !== null);
  const total = known.reduce((sum, group) => sum + group.count.value, 0);
  const unknown = groups.length - known.length;
  let totalKind = "confirmed";
  if (unknown) totalKind = "incomplete";
  else if (groups.some((group) => group.count.status !== "confirmed")) totalKind = "mixed";
  return { total, totalKind, unknownCount: unknown, groupCount: groups.length };
}
