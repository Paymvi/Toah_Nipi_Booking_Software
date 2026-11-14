/*
  Dates, times and change descriptions for the staff app. Every "today",
  meal date and timestamp is shown in camp time (America/New_York),
  whatever the device's timezone.
*/
import { EMAIL_TIME_ZONE, getLocalDate } from "./portalEmail.js";
import { formatMealTime, getGuestCount } from "./mealPlan.js";
import { getBookingLodgingDisplayText } from "./lodgingUtils.js";

export const CAMP_TIME_ZONE = EMAIL_TIME_ZONE;

// Date-only arithmetic in UTC so daylight-saving changes cannot shift a day.
export function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Monday of the week holding dateKey.
export function weekStart(dateKey) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return shiftDate(dateKey, -((day + 6) % 7));
}

// "Fri, Nov 20" (default), or any Intl options, for a YYYY-MM-DD key.
export function formatDay(dateKey, options = { weekday: "short", month: "short", day: "numeric" }) {
  if (!isDateKey(dateKey)) return "";
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`));
}

// "Fri, Nov 20 – Sun, Nov 22, 2026"
export function formatStay(startDate, endDate) {
  if (!isDateKey(startDate)) return "Dates not set";
  const withYear = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  if (!isDateKey(endDate) || endDate === startDate) return formatDay(startDate, withYear);
  return `${formatDay(startDate)} – ${formatDay(endDate, withYear)}`;
}

export function relativeDayLabel(dateKey, todayKey) {
  if (dateKey === todayKey) return "Today";
  if (dateKey === shiftDate(todayKey, 1)) return "Tomorrow";
  if (dateKey === shiftDate(todayKey, -1)) return "Yesterday";
  return formatDay(dateKey);
}

// Camp-time clock time of a timestamp: "9:40 AM".
export function formatClock(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAMP_TIME_ZONE }).format(date);
}

// "today 9:40 AM", "yesterday 4:05 PM", "Wed, Nov 18 9:40 AM".
export function formatWhen(timestamp, todayKey) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const dayKey = getLocalDate(date);
  const day = dayKey === todayKey ? "today" : dayKey === shiftDate(todayKey, -1) ? "yesterday" : formatDay(dayKey);
  return `${day} ${formatClock(date)}`;
}

// "HH:MM" now in camp time, for "next meal".
export function campClockNow(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: CAMP_TIME_ZONE }).format(now);
}

export { getLocalDate as campDateOf };

/* ---------------------------------------------------------
   Change history
--------------------------------------------------------- */

export const CHANGE_FIELD_LABELS = Object.freeze({
  organizationName: "Group name",
  startDate: "Arrival date",
  endDate: "Departure date",
  showsInStaffApp: "Booking status",
  attendeeCount: "Guest count",
  approxTotalGuests: "Estimated guests",
  approxAdultGuests: "Estimated adults",
  approxChildrenUnder3: "Estimated children under 3",
  approxChildren3to17: "Estimated children 3–17",
  actualAdultGuests: "Actual adults",
  actualChildrenUnder3: "Actual children under 3",
  actualChildren3to17: "Actual children 3–17",
  meals: "Meal plan",
  mealSchedule: "Meal days",
  breakfastTime: "Breakfast time",
  lunchTime: "Lunch time",
  dinnerTime: "Dinner time",
  arrivalTime: "Arrival time",
  departureTime: "Departure time",
  mealNotes: "Meal notes",
  foodAllergies: "Dietary needs",
  dayCamperCount: "Day campers",
  dayCamperMeals: "Day camper meals",
  lodging: "Lodging",
  activitiesText: "Activities",
  activities: "Activities",
  activityNotes: "Activity notes",
  facilities: "Setup tasks",
  facilityNotes: "Setup notes",
  kitchenInternalMeals: "Kitchen planning for internal use",
});

export const KITCHEN_CHANGE_FIELDS = new Set([
  "startDate", "endDate", "showsInStaffApp", "attendeeCount", "approxTotalGuests", "approxAdultGuests",
  "approxChildrenUnder3", "approxChildren3to17", "actualAdultGuests", "actualChildrenUnder3",
  "actualChildren3to17", "meals", "mealSchedule", "breakfastTime", "lunchTime", "dinnerTime",
  "arrivalTime", "departureTime", "mealNotes", "foodAllergies", "dayCamperCount", "dayCamperMeals",
  "kitchenInternalMeals",
]);

const TIME_FIELDS = new Set(["breakfastTime", "lunchTime", "dinnerTime", "arrivalTime", "departureTime"]);
const DATE_FIELDS = new Set(["startDate", "endDate"]);

function formatChangeValue(field, value) {
  if (value === null || value === undefined) return "";
  if (field === "showsInStaffApp") {
    return value === "internal" ? "Internal use" : value === "booking" ? "Booked" : String(value);
  }
  if (field === "kitchenInternalMeals") return value === true ? "on" : "off";
  if (typeof value === "object") return "";
  const text = String(value).trim();
  if (TIME_FIELDS.has(field)) return formatMealTime(text);
  if (DATE_FIELDS.has(field)) return formatDay(text, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return text.length <= 80 ? text : "";
}

/*
  A readable line for one recorded change. Old and new values appear only
  when they were recorded and are short enough to read; otherwise "updated".
*/
export function describeChange(change) {
  const label = CHANGE_FIELD_LABELS[change.field] || change.field;
  const before = formatChangeValue(change.field, change.old);
  const after = formatChangeValue(change.field, change.new);
  const hadOld = change.old !== null && change.old !== undefined;
  const hasNew = change.new !== null && change.new !== undefined;

  if (change.field === "showsInStaffApp" && !hasNew) {
    return { label, text: "No longer active (cancelled, waitlisted or reclassified)", before, after: "" };
  }
  if (!hasNew) return { label, text: before ? `cleared (was ${before})` : "cleared", before, after: "" };
  if (!hadOld) return { label, text: after ? `set to ${after}` : "added", before: "", after };
  if (before && after) return { label, text: `${before} → ${after}`, before, after };
  return { label, text: "updated", before: "", after: "" };
}

// Who saved it, without guessing: a named staff profile, an unnamed signed-in account, or not recorded.
export function describeActor(change) {
  if (change.by) return change.by;
  return change.bySignedInUser ? "a staff account" : "not recorded";
}

// Latest recorded change to one field, or null.
export function latestChange(booking, field) {
  return (booking?.changes || []).find((change) => change.field === field) || null;
}

/* ---------------------------------------------------------
   Screen helpers
--------------------------------------------------------- */

export function canUseKitchen(me) {
  return me?.access === "office" || me?.access === "unknown" || (me?.departments || []).includes("kitchen");
}

export function lodgingText(booking) {
  const text = getBookingLodgingDisplayText(booking);
  return text === "Unassigned" ? "" : text;
}

// "Sum of known counts", labelled honestly.
export function summarizeGuests(bookings) {
  const counts = bookings.map(getGuestCount);
  const known = counts.filter((count) => count.value !== null);
  const total = known.reduce((sum, count) => sum + count.value, 0);
  if (!bookings.length) return "";
  if (known.length < counts.length) return `at least ${total} guests (${counts.length - known.length} count missing)`;
  if (counts.some((count) => count.status === "estimate")) return `about ${total} guests`;
  return `${total} guests`;
}

export function lastChangeLine(booking, todayKey) {
  const last = booking.changes?.[0];
  if (last) return `Last recorded change ${formatWhen(last.at, todayKey)} by ${describeActor(last)}`;
  if (booking.updatedAt) return `Booking last saved ${formatWhen(booking.updatedAt, todayKey)} (no changes recorded since the history started)`;
  return "";
}
