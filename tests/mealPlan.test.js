import assert from "node:assert/strict";
import test from "node:test";

import {
  getBookingMealDays,
  getDietaryAlerts,
  getGuestCount,
  getKitchenDay,
  getMealServiceTime,
  normalizeServiceTime,
  parseBookingMealSummary,
  summaryDateLabelToKey,
} from "../src/utils/mealPlan.js";

// Fictional bookings shaped like the staff app's allowlisted projection.
const cedarHill = {
  id: "cedar",
  organizationName: "Cedar Hill (fictional)",
  startDate: "2026-11-20",
  endDate: "2026-11-22",
  attendeeCount: "42",
  meals: "Total meals: 6 (Breakfast: 2, Lunch: 2, Dinner: 2); Fri, Nov 20, 2026: Dinner; Sat, Nov 21, 2026: Breakfast, Lunch, Dinner; Sun, Nov 22, 2026: Breakfast, Lunch; Breakfast time: 08:00; Lunch time: 12:00; Dinner time: 18:00",
  foodAllergies: "3 - Gluten free; 1 - Tree nut allergy; 1 - Vegetarian; Additional notes: Severity not yet confirmed with the group leader.",
  guestCountConfirmed: true,
  rentalFormDetails: {
    approxTotalGuests: "40",
    actualAdultGuests: "42",
    breakfastTime: "08:00",
    lunchTime: "12:00",
    dinnerTime: "18:30",
    mealSchedule: {
      "2026-11-20": { breakfast: false, lunch: false, dinner: true },
      "2026-11-21": { breakfast: true, lunch: true, dinner: true },
      "2026-11-22": { breakfast: true, lunch: true, dinner: false },
    },
  },
};

const northfield = {
  id: "northfield",
  organizationName: "Northfield (fictional)",
  startDate: "2026-11-21",
  endDate: "2026-11-22",
  attendeeCount: "28",
  rentalFormDetails: {
    approxTotalGuests: "28",
    lunchTime: "12:00",
    dinnerTime: "18:00",
    mealSchedule: {
      "2026-11-21": { lunch: true, dinner: true },
      "2026-11-22": { breakfast: true },
      // Stale selection outside the stay (dates were moved): ignored.
      "2026-11-25": { breakfast: true, lunch: true, dinner: true },
    },
  },
};

test("Booking Overview summary parser behaves as before the move", () => {
  const parsed = parseBookingMealSummary(cedarHill.meals);
  assert.equal(parsed.totalMeals, "6");
  assert.equal(parsed.dateRows.length, 3);
  assert.deepEqual(parsed.dateRows[0], { dateLabel: "Fri, Nov 20, 2026", breakfast: false, lunch: false, dinner: true });
  assert.equal(parsed.firstMeal, "Dinner");
  assert.equal(parsed.lastMeal, "Lunch");
  assert.equal(parsed.dinnerTime, "18:00");
  // Unchanged quirk the Overview relies on: missing per-meal counts read "0".
  assert.equal(parseBookingMealSummary("").breakfastCount, "0");
});

test("summary date labels become date keys, and nonsense does not", () => {
  assert.equal(summaryDateLabelToKey("Fri, Nov 20, 2026"), "2026-11-20");
  assert.equal(summaryDateLabelToKey("Mon, Feb 30, 2026"), "");
  assert.equal(summaryDateLabelToKey("Friday"), "");
});

test("structured meal schedule wins and is limited to the stay dates", () => {
  const plan = getBookingMealDays(northfield);
  assert.equal(plan.status, "planned");
  assert.equal(plan.source, "schedule");
  assert.deepEqual(plan.days.map((day) => day.date), ["2026-11-21", "2026-11-22"]);
});

test("summary text is used when there is no structured schedule", () => {
  const plan = getBookingMealDays({ ...cedarHill, rentalFormDetails: {} });
  assert.equal(plan.status, "planned");
  assert.equal(plan.source, "summary");
  assert.equal(plan.days.length, 3);
});

test("ambiguous imported meal text needs review; it is never guessed", () => {
  const plan = getBookingMealDays({
    startDate: "2026-11-20",
    endDate: "2026-11-22",
    meals: "6 meals - Fri dinner thru Sun lunch (maybe Sat cookout?)",
    mealCount: "6",
  });
  assert.equal(plan.status, "needs-review");
  assert.deepEqual(plan.days, []);
  assert.match(plan.reviewText, /cookout/);
});

test("a meal count without any schedule needs review", () => {
  const plan = getBookingMealDays({ startDate: "2026-11-20", endDate: "2026-11-21", mealCount: "3" });
  assert.equal(plan.status, "needs-review");
  assert.match(plan.reviewText, /3 meal/);
});

test("explicit no meals is different from missing meals", () => {
  assert.equal(getBookingMealDays({ startDate: "2026-11-20", meals: "No meals" }).status, "no-meals");
  assert.equal(getBookingMealDays({ startDate: "2026-11-20", mealCount: "0" }).status, "no-meals");
  assert.equal(getBookingMealDays({ startDate: "2026-11-20" }).status, "missing");
});

test("service time: form field first, then the saved summary", () => {
  assert.equal(getMealServiceTime(cedarHill, "dinner"), "18:30");
  assert.equal(getMealServiceTime({ meals: cedarHill.meals }, "dinner"), "18:00");
  assert.equal(getMealServiceTime({}, "dinner"), "");
});

test("Confirmed needs an actual count and the approved portal task", () => {
  const confirmed = getGuestCount(cedarHill);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.value, 42);

  const recordedOnly = getGuestCount({ ...cedarHill, guestCountConfirmed: false });
  assert.equal(recordedOnly.status, "recorded", "an actual count alone is not confirmation");

  const portalOnly = getGuestCount({ ...northfield, guestCountConfirmed: true });
  assert.equal(portalOnly.status, "estimate", "portal approval without an actual count stays an estimate");
  assert.equal(portalOnly.value, 28);
});

test("missing counts are unknown, a recorded zero stays zero, unclear text needs review", () => {
  const missing = getGuestCount({ rentalFormDetails: {} });
  assert.equal(missing.status, "missing");
  assert.equal(missing.value, null);

  const zero = getGuestCount({ rentalFormDetails: { actualAdultGuests: "0", actualChildrenUnder3: "0" } });
  assert.equal(zero.status, "recorded");
  assert.equal(zero.value, 0);

  const unclear = getGuestCount({ attendeeCount: "~30 adults + kids", rentalFormDetails: {} });
  assert.equal(unclear.status, "unclear");
  assert.equal(unclear.value, null);
  assert.equal(unclear.text, "~30 adults + kids");

  const tbd = getGuestCount({ attendeeCount: "TBD", rentalFormDetails: {} });
  assert.equal(tbd.status, "missing");
});

test("Master imports: an estimated spreadsheet count is never shown as recorded", () => {
  const estimated = getGuestCount({
    sourceType: "Master 2027",
    attendeeCount: "35",
    rentalFormDetails: { importedGuestCountKind: "estimated" },
  });
  assert.equal(estimated.status, "estimate");
  const recorded = getGuestCount({
    sourceType: "Master 2026",
    attendeeCount: "35",
    rentalFormDetails: { importedGuestCountKind: "recorded" },
  });
  assert.equal(recorded.status, "recorded");
});

test("dietary rows keep wording; only explicit allergy wording is tagged; no total", () => {
  const alerts = getDietaryAlerts(cedarHill.foodAllergies);
  assert.deepEqual(alerts.items.map((item) => item.label), ["Tree nut allergy", "Gluten free", "Vegetarian"]);
  assert.equal(alerts.items[0].isAllergy, true);
  assert.equal(alerts.items[1].isAllergy, false);
  assert.equal(alerts.additionalNotes, "Severity not yet confirmed with the group leader.");
  assert.equal("total" in alerts, false, "overlapping categories are never summed");

  const loose = getDietaryAlerts("Peanut; Celiac; 2 - EpiPen carrier");
  assert.deepEqual(loose.items.map((item) => [item.label, item.isAllergy, item.quantity]), [
    ["EpiPen carrier", true, "2"],
    ["Peanut", false, "—"],
    ["Celiac", false, "—"],
  ]);
  assert.equal(loose.items[1].quantityKnown, false);
});

test("an additional dietary note containing ';' stays whole and adds no fake items", () => {
  const alerts = getDietaryAlerts("1 - Tree nut allergy; Additional notes: Severity unknown; leader will call back; plan nut-free.");
  assert.deepEqual(alerts.items.map((item) => item.label), ["Tree nut allergy"]);
  assert.equal(alerts.additionalNotes, "Severity unknown; leader will call back; plan nut-free.");
  assert.deepEqual(getDietaryAlerts("Additional notes: only a note").items, []);
});

test("service times normalise for grouping", () => {
  assert.equal(normalizeServiceTime("6:30 PM"), "18:30");
  assert.equal(normalizeServiceTime("18:30"), "18:30");
  assert.equal(normalizeServiceTime("6pm"), "18:00");
  assert.equal(normalizeServiceTime("after the hike"), "");
  assert.equal(normalizeServiceTime("6"), "", "a bare hour without AM/PM is not guessed");
});

test("kitchen day: separate service times, honest totals, unplanned and day campers", () => {
  const vague = {
    id: "vague",
    organizationName: "Vague Imports (fictional)",
    startDate: "2026-11-21",
    endDate: "2026-11-21",
    meals: "lunch probably",
    attendeeCount: "12",
  };
  const unknownCount = {
    id: "unknown",
    organizationName: "No Count Yet (fictional)",
    startDate: "2026-11-21",
    endDate: "2026-11-21",
    rentalFormDetails: { dayCamperCount: "6", dayCamperMeals: "2", lunchTime: "12:00", mealSchedule: { "2026-11-21": { lunch: true } } },
  };
  const day = getKitchenDay([cedarHill, northfield, vague, unknownCount], "2026-11-21");
  const [breakfast, lunch, dinner] = day.meals;

  assert.equal(breakfast.groupCount, 1);
  assert.equal(breakfast.total, 42);
  assert.equal(breakfast.totalKind, "confirmed");

  assert.equal(lunch.groupCount, 3);
  assert.equal(lunch.total, 70, "known counts only");
  assert.equal(lunch.totalKind, "incomplete", "one group has no count");
  assert.equal(lunch.unknownCount, 1);
  assert.equal(lunch.services.length, 1, "all at 12:00");

  assert.equal(dinner.services.length, 2, "18:00 and 18:30 stay separate");
  assert.deepEqual(dinner.services.map((service) => [service.time, service.total]), [["18:00", 28], ["18:30", 42]]);
  assert.equal(dinner.totalKind, "mixed", "Northfield is an estimate");

  assert.deepEqual(day.unplanned.map((entry) => entry.booking.id), ["vague"]);
  assert.equal(day.dayCampers.length, 1);
  assert.equal(day.dayCampers[0].count, 6);

  const sunday = getKitchenDay([cedarHill], "2026-11-22");
  assert.equal(sunday.meals[1].groups[0].isLastMeal, true);
  const friday = getKitchenDay([cedarHill], "2026-11-20");
  assert.equal(friday.meals[2].groups[0].isFirstMeal, true);
});

test("date boundaries: arrival and departure days are included, the day after is not", () => {
  assert.equal(getKitchenDay([cedarHill], "2026-11-19").meals.every((meal) => meal.groupCount === 0), true);
  assert.equal(getKitchenDay([cedarHill], "2026-11-23").meals.every((meal) => meal.groupCount === 0), true);
  assert.equal(getKitchenDay([cedarHill], "2026-11-20").meals[2].groupCount, 1);
  assert.equal(getKitchenDay([cedarHill], "2026-11-22").meals[1].groupCount, 1);
  // A one-day visit with no end date.
  const dayVisit = { startDate: "2026-11-24", rentalFormDetails: { mealSchedule: { "2026-11-24": { lunch: true } } }, attendeeCount: "9" };
  assert.equal(getKitchenDay([dayVisit], "2026-11-24").meals[1].total, 9);
});
