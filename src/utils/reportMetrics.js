import { countsForLodgingOccupancy, getBookingDisplayState, hasKnownBookingValue, RECORD_KIND } from "./bookingClassification.js";
import { getBookingDetails, getDetailFieldPreferringTopLevel, getDuplicatedField, parseGuestCountNumber } from "./bookingFields.js";
import { getBookingCalendarGroups, getLodgingNights } from "./lodgingUtils.js";
import { getLodgingCapacityLimit, LODGING_BUILDINGS, LODGING_CALENDAR_GROUPS } from "../constants/lodgingConstants.js";
import { getArrivalMonthKey, getOfficialRetreatType, getReportBookings, shouldUseStoredCamperDays } from "./reportRules.js";

/*
  Calculations behind the Season Reports views. Pure, so they can be tested.
  See docs/proposals/REPORTS_PAGE_IMPROVEMENT_PROPOSAL.md for the definitions.

  ReportsView.jsx (the Original layout) keeps its own older calculations on
  purpose: it stays exactly as it was, so these are not shared with it.

  Dates are YYYY-MM-DD text throughout, so they compare as plain strings.
  An unknown number is null and never adds zero to a total.
*/

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------------------------------------------------------
   Dates
--------------------------------------------------------- */

export function getLocalDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDaysToKey(key, days) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function getWeekdayOfKey(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function formatDayKey(key) {
  return key ? `${MONTH_LABELS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8))}` : "No date";
}

// The same date in another year. February 29 falls back to the 28th.
export function shiftKeyYears(key, years) {
  const year = Number(key.slice(0, 4)) + years;
  const isLeapDayGone = key.slice(5) === "02-29" && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1;
  return isLeapDayGone ? `${year}-02-28` : `${year}${key.slice(4)}`;
}

/* ---------------------------------------------------------
   Period
--------------------------------------------------------- */

export const REPORT_PERIOD_OPTIONS = Object.freeze([
  { value: "thisYear", label: "This year" },
  { value: "lastYear", label: "Last year" },
  { value: "summer", label: "This summer (Jun to Aug)" },
  { value: "fall", label: "This fall (Sep to Nov)" },
  { value: "custom", label: "Custom dates" },
]);

export const DEFAULT_SEASON_SETTINGS = Object.freeze({
  period: "thisYear",
  customStart: "",
  customEnd: "",
  counting: "stays",
  retreatType: "all",
  compare: true,
  tab: "brief",
  measure: "camperDays",
});

const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

// Storage can hold anything, so each saved value is checked before use.
export function parseSeasonSettings(savedText) {
  let saved = {};
  try {
    saved = JSON.parse(savedText) || {};
  } catch {
    saved = {};
  }
  const allowed = {
    period: REPORT_PERIOD_OPTIONS.map((option) => option.value),
    counting: ["stays", "all"],
    tab: ["brief", "map", "check"],
    measure: ["camperDays", "guests", "stays"],
  };
  const settings = { ...DEFAULT_SEASON_SETTINGS };
  Object.entries(allowed).forEach(([key, values]) => {
    if (values.includes(saved[key])) settings[key] = saved[key];
  });
  if (isDateKey(saved.customStart)) settings.customStart = saved.customStart;
  if (isDateKey(saved.customEnd)) settings.customEnd = saved.customEnd;
  if (typeof saved.retreatType === "string" && saved.retreatType) settings.retreatType = saved.retreatType;
  if (typeof saved.compare === "boolean") settings.compare = saved.compare;
  return settings;
}

export function getReportPeriod(settings, today) {
  const year = Number(today.slice(0, 4));
  let start = `${year}-01-01`;
  let end = `${year}-12-31`;
  let label = String(year);

  if (settings.period === "lastYear") {
    start = `${year - 1}-01-01`;
    end = `${year - 1}-12-31`;
    label = String(year - 1);
  } else if (settings.period === "summer") {
    start = `${year}-06-01`;
    end = `${year}-08-31`;
    label = `Summer ${year}`;
  } else if (settings.period === "fall") {
    start = `${year}-09-01`;
    end = `${year}-11-30`;
    label = `Fall ${year}`;
  } else if (settings.period === "custom" && isDateKey(settings.customStart) && isDateKey(settings.customEnd)) {
    [start, end] = [settings.customStart, settings.customEnd].sort();
    label = `${formatDayKey(start)}, ${start.slice(0, 4)} to ${formatDayKey(end)}, ${end.slice(0, 4)}`;
  }

  const priorStart = shiftKeyYears(start, -1);
  return {
    start,
    end,
    label,
    year: Number(start.slice(0, 4)),
    priorStart,
    priorEnd: shiftKeyYears(end, -1),
    priorLabel: String(Number(start.slice(0, 4)) - 1),
  };
}

/* ---------------------------------------------------------
   Guests
--------------------------------------------------------- */

const knownNumber = (value) => {
  if (!hasKnownBookingValue(value)) return null;
  return parseGuestCountNumber(value);
};

const sumKnown = (values) => {
  const known = values.filter((value) => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};

function getDayCamperDetails(booking) {
  const details = getBookingDetails(booking);
  const legacyRows = Array.isArray(details.dayCampers) ? details.dayCampers : [];
  const legacyCount = legacyRows.reduce((sum, row) => sum + (knownNumber(row?.count) || 0), 0);
  const legacyServings = legacyRows.reduce(
    (sum, row) => sum + (knownNumber(row?.count) || 0) * (knownNumber(row?.mealsPerCamper) || 0),
    0
  );
  const count = knownNumber(details.dayCamperCount) ?? knownNumber(booking?.dayCamperCount) ?? legacyCount;
  const mealsPerCamper = knownNumber(details.dayCamperMeals) ?? knownNumber(booking?.dayCamperMeals) ?? 0;
  const storedServings =
    knownNumber(details.dayCamperMealServings) ??
    knownNumber(details.dayCamperTotals?.mealServings) ??
    knownNumber(booking?.dayCamperMealServings) ??
    0;
  const mealServings = storedServings || legacyServings || count * mealsPerCamper;
  const storedCamperDays =
    knownNumber(details.dayCamperCamperDays) ??
    knownNumber(details.dayCamperTotals?.camperDays) ??
    knownNumber(booking?.dayCamperCamperDays) ??
    0;
  return { count, camperDays: storedCamperDays || mealServings * 0.2 };
}

/*
  The best known number: actual, then recorded, then estimated. A range counts
  as its lower number (Q-029). Blank, TBD or text with no number is unknown.
  When actual age counts disagree with a sheet's recorded total, the total is
  used and the record is flagged, because a partial breakdown would understate.
*/
export function getGuestInfo(booking) {
  const details = getBookingDetails(booking);
  const adults = knownNumber(details.actualAdultGuests);
  const under3 = knownNumber(details.actualChildrenUnder3);
  const age3to17 = knownNumber(details.actualChildren3to17);
  const children = under3 !== null || age3to17 !== null
    ? sumKnown([under3, age3to17])
    : knownNumber(details.actualChildrenGuests);
  const actual = sumKnown([adults, children]);

  const total = knownNumber(getDetailFieldPreferringTopLevel(booking, "approxTotalGuests"));
  const isRecordedTotal = details.importedGuestCountKind === "recorded";

  if (actual > 0) {
    // Master 2025 totals include day-use guests (see the importer's own check).
    const comparable = actual + (booking?.sourceType === "Master 2025" ? getDayCamperDetails(booking).count : 0);
    if (isRecordedTotal && total > 0 && total !== comparable) {
      return { value: total, source: "Recorded", mismatch: true };
    }
    return { value: actual, source: "Actual", mismatch: false };
  }

  if (total > 0) {
    const isEstimate = !isRecordedTotal && hasKnownBookingValue(details.approxTotalGuests);
    return { value: total, source: isEstimate ? "Estimated" : "Recorded", mismatch: false };
  }

  const approxChildren =
    knownNumber(details.approxChildrenUnder3) !== null || knownNumber(details.approxChildren3to17) !== null
      ? sumKnown([knownNumber(details.approxChildrenUnder3), knownNumber(details.approxChildren3to17)])
      : knownNumber(details.approxChildrenGuests);
  const approx = sumKnown([knownNumber(details.approxAdultGuests), approxChildren]);
  if (approx > 0) return { value: approx, source: "Estimated", mismatch: false };

  const fallback = knownNumber(booking?.groupSize) ?? knownNumber(booking?.persons);
  if (fallback > 0) return { value: fallback, source: "Recorded", mismatch: false };

  return { value: null, source: "Unknown", mismatch: false };
}

/* ---------------------------------------------------------
   Nights, meals, Camper Days
--------------------------------------------------------- */

function getRecordedNights(booking) {
  return knownNumber(getDuplicatedField(booking, "nights"));
}

function getMealCount(booking) {
  const direct = knownNumber(getDuplicatedField(booking, "mealCount"));
  if (direct !== null) return direct;
  const schedule = getBookingDetails(booking).mealSchedule;
  if (!schedule || typeof schedule !== "object") return 0;
  return Object.values(schedule).reduce(
    (total, day) => total + (day?.breakfast ? 1 : 0) + (day?.lunch ? 1 : 0) + (day?.dinner ? 1 : 0),
    0
  );
}

/*
  Q-028 plus the proposal's decision 5: an imported figure stands until staff
  edit its inputs or actual attendance replaces the count it was based on.
  Day campers are not added to an imported figure, because the sheet's number
  may already include them. shortcut: revisit once the office confirms this.
*/
export function getCamperDaysInfo(booking, guests = getGuestInfo(booking)) {
  const stored = knownNumber(booking?.camperDays);
  const nights = getRecordedNights(booking) || 0;
  const meals = getMealCount(booking);
  const overnight = guests.value > 0 && (nights > 0 || meals > 0)
    ? guests.value * (nights * 0.4 + meals * 0.2)
    : 0;
  const calculated = overnight + getDayCamperDetails(booking).camperDays;

  const importedCount = knownNumber(booking?.attendeeCount) ?? knownNumber(booking?.persons);
  const actualReplacedCount =
    guests.source === "Actual" && importedCount !== null && importedCount !== guests.value && overnight > 0;

  if (stored > 0 && shouldUseStoredCamperDays(booking) && !actualReplacedCount) {
    return { value: stored, source: "Stored" };
  }
  return calculated > 0 ? { value: calculated, source: "Calculated" } : { value: null, source: "Unknown" };
}

/* ---------------------------------------------------------
   One normalized row per record
--------------------------------------------------------- */

function getStateLabel(displayState) {
  return displayState.key === "cancelled" && displayState.kind === RECORD_KIND.INQUIRY
    ? "Declined inquiry"
    : displayState.label;
}

export function buildReportStay(booking) {
  const displayState = getBookingDisplayState(booking);
  const guests = getGuestInfo(booking);
  const camperDays = getCamperDaysInfo(booking, guests);
  const retreat = getOfficialRetreatType(booking.retreatType);
  const start = getArrivalMonthKey(booking) ? String(booking.startDate).slice(0, 10) : "";
  const end = /^\d{4}-\d{2}-\d{2}/.test(String(booking.endDate || "")) ? String(booking.endDate).slice(0, 10) : "";
  const warnings = getBookingDetails(booking).importWarnings;

  return {
    id: booking.id,
    group: booking.organizationName || "Unnamed group",
    type: retreat.type,
    typeMapped: retreat.mapped,
    stateKey: displayState.key,
    stateLabel: getStateLabel(displayState),
    isStay: displayState.key === "booked" || displayState.key === "archive",
    start,
    end,
    monthKey: start.slice(0, 7),
    recordedNights: getRecordedNights(booking),
    lodgingNights: start ? getLodgingNights(booking) : [],
    lodgingGroups: getBookingCalendarGroups(booking),
    holdsLodging: countsForLodgingOccupancy(booking),
    guests: guests.value,
    guestSource: guests.source,
    guestMismatch: guests.mismatch,
    camperDays: camperDays.value,
    camperSource: camperDays.source,
    importWarnings: Array.isArray(warnings) ? warnings.length : 0,
    wantedDates: String(booking.desiredDatesText || "").trim(),
  };
}

// hiddenInquiryIds: rows staff deleted from the Inquiry Spreadsheet.
export function buildReportStays(bookings = [], hiddenInquiryIds = new Set()) {
  const selection = getReportBookings(bookings);
  const visible = selection.bookings.filter((booking) => {
    const isHidden = hiddenInquiryIds.has(booking.id) &&
      getBookingDisplayState(booking).kind === RECORD_KIND.INQUIRY;
    return !isHidden;
  });
  return {
    stays: visible.map(buildReportStay),
    hostExcluded: selection.hostExcluded,
    convertedExcluded: selection.convertedExcluded,
  };
}

/* ---------------------------------------------------------
   Selecting and adding up
--------------------------------------------------------- */

export function selectStays(stays, { start, end, counting = "stays", retreatType = "all" }) {
  return stays.filter(
    (stay) =>
      stay.start &&
      stay.start >= start &&
      stay.start <= end &&
      (counting === "all" || stay.isStay) &&
      (retreatType === "all" || stay.type === retreatType)
  );
}

export const getBuildingNights = (stay) =>
  stay.holdsLodging ? stay.lodgingNights.length * stay.lodgingGroups.length : 0;

export function getTotals(list) {
  return list.reduce(
    (totals, stay) => ({
      stays: totals.stays + 1,
      guests: totals.guests + (stay.guests || 0),
      guestsUnknown: totals.guestsUnknown + (stay.guests === null ? 1 : 0),
      actual: totals.actual + (stay.guestSource === "Actual" ? 1 : 0),
      camperDays: totals.camperDays + (stay.camperDays || 0),
      camperUnknown: totals.camperUnknown + (stay.camperDays === null ? 1 : 0),
      buildingNights: totals.buildingNights + getBuildingNights(stay),
    }),
    { stays: 0, guests: 0, guestsUnknown: 0, actual: 0, camperDays: 0, camperUnknown: 0, buildingNights: 0 }
  );
}

/*
  Like for like: this period up to today against the same dates last year.
  Stays still to come are kept apart. They are scheduled, not a forecast.
*/
export function getSeasonFigures(stays, period, filters, today) {
  const toDate = today < period.end ? today : period.end;
  const hasStarted = today >= period.start;
  const soFar = hasStarted ? selectStays(stays, { ...filters, start: period.start, end: toDate }) : [];
  const ahead = selectStays(stays, { ...filters, start: period.start, end: period.end }).filter((stay) => !soFar.includes(stay));
  const priorSoFar = hasStarted
    ? selectStays(stays, { ...filters, start: period.priorStart, end: shiftKeyYears(toDate, -1) })
    : [];
  const priorAll = selectStays(stays, { ...filters, start: period.priorStart, end: period.priorEnd });

  return {
    soFar,
    ahead,
    priorAll,
    now: getTotals(soFar),
    prior: getTotals(priorSoFar),
    aheadTotals: getTotals(ahead),
  };
}

export function getMonthRows(stays, period, filters, today) {
  const rows = new Map();
  const rowFor = (monthKey) => {
    if (!rows.has(monthKey)) rows.set(monthKey, { monthKey, now: [], prior: [] });
    return rows.get(monthKey);
  };

  selectStays(stays, { ...filters, start: period.start, end: period.end }).forEach((stay) =>
    rowFor(stay.monthKey).now.push(stay)
  );
  selectStays(stays, { ...filters, start: period.priorStart, end: period.priorEnd }).forEach((stay) =>
    rowFor(shiftKeyYears(`${stay.monthKey}-01`, 1).slice(0, 7)).prior.push(stay)
  );

  const thisMonth = today.slice(0, 7);
  return [...rows.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((row) => ({
      ...row,
      label: MONTH_LABELS[Number(row.monthKey.slice(5, 7)) - 1],
      year: row.monthKey.slice(0, 4),
      totals: getTotals(row.now),
      priorTotals: getTotals(row.prior),
      timing: row.monthKey > thisMonth ? "scheduled" : row.monthKey === thisMonth ? "partial" : "finished",
    }));
}

export function getTypeRows(stays, period, filters) {
  const rows = new Map();
  const rowFor = (type) => {
    if (!rows.has(type)) rows.set(type, { type, now: [], prior: [] });
    return rows.get(type);
  };

  selectStays(stays, { ...filters, start: period.start, end: period.end }).forEach((stay) => rowFor(stay.type).now.push(stay));
  selectStays(stays, { ...filters, start: period.priorStart, end: period.priorEnd }).forEach((stay) => rowFor(stay.type).prior.push(stay));

  return [...rows.values()]
    .map((row) => ({ ...row, totals: getTotals(row.now), priorTotals: getTotals(row.prior) }))
    .sort((a, b) => b.totals.camperDays - a.totals.camperDays || b.totals.stays - a.totals.stays);
}

/* ---------------------------------------------------------
   Season Map and Open Weekends
--------------------------------------------------------- */

const cellKey = (groupId, night) => `${groupId}|${night}`;

// The Lodging Calendar's rule (Q-004): inquiries and cancelled stays hold nothing.
export function buildNightIndex(stays) {
  const cells = new Map();
  const unplaced = new Map();
  const add = (map, key, stay) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(stay);
  };

  stays
    .filter((stay) => stay.holdsLodging)
    .forEach((stay) => {
      stay.lodgingNights.forEach((night) => {
        if (!stay.lodgingGroups.length) add(unplaced, night, stay);
        stay.lodgingGroups.forEach((groupId) => add(cells, cellKey(groupId, night), stay));
      });
    });

  return {
    staysOn: (groupId, night) => cells.get(cellKey(groupId, night)) || [],
    unplacedOn: (night) => unplaced.get(night) || [],
  };
}

// Upper recorded capacity of each calendar group; Hebron adds its two parts.
export function getGroupCapacity(groupId) {
  return LODGING_BUILDINGS.filter((building) => building.calendarGroup === groupId).reduce(
    (total, building) => total + (getLodgingCapacityLimit(building) || 0),
    0
  );
}

/*
  Fridays where the groups with no stay at all on Friday and Saturday night add
  up to the group size. Space left inside a shared building is ignored, which
  errs towards caution. Closed dates are not recorded, so "open" means nobody
  is booked there, not that the dates can be offered without checking.
*/
export function getOpenWeekends(stays, today, groupSize, horizonDays = 182) {
  const index = buildNightIndex(stays);
  const weekends = [];

  for (let offset = 1; offset <= horizonDays; offset += 1) {
    const friday = addDaysToKey(today, offset);
    if (getWeekdayOfKey(friday) !== 5) continue;
    const saturday = addDaysToKey(friday, 1);
    const open = LODGING_CALENDAR_GROUPS.filter(
      (group) =>
        getGroupCapacity(group.id) > 0 &&
        !index.staysOn(group.id, friday).length &&
        !index.staysOn(group.id, saturday).length
    );
    const capacity = open.reduce((total, group) => total + getGroupCapacity(group.id), 0);
    if (capacity >= groupSize) {
      weekends.push({
        friday,
        sunday: addDaysToKey(friday, 2),
        open,
        capacity,
        unplaced: new Set([...index.unplacedOn(friday), ...index.unplacedOn(saturday)]).size,
      });
    }
  }

  return weekends;
}

/* ---------------------------------------------------------
   Data Check
--------------------------------------------------------- */

const lastDay = (stay) => stay.end || stay.start;

export function getDataIssues(stays, period, today) {
  const booked = selectStays(stays, { start: period.start, end: period.end }).filter((stay) => stay.stateKey === "booked");
  const upcoming = booked.filter((stay) => stay.start > today);
  const finished = booked.filter((stay) => lastDay(stay) <= today);
  const byArrival = (a, b) => a.start.localeCompare(b.start);
  const newestFirst = (a, b) => b.start.localeCompare(a.start);

  const issues = [
    {
      id: "no-building",
      title: "Upcoming stays with no building",
      why: "Season Map cannot place them, so an open cell on those dates may not be free.",
      list: upcoming.filter((stay) => stay.lodgingNights.length && !stay.lodgingGroups.length).sort(byArrival),
    },
    {
      id: "upcoming-no-guests",
      title: "Upcoming stays with no guest count",
      why: "Guests and camper days leave them out, and the kitchen has no number for them.",
      list: upcoming.filter((stay) => stay.guests === null).sort(byArrival),
    },
    {
      id: "no-nights",
      title: "Stays with dates but no nights recorded",
      why: "Camper days cannot be calculated until nights are filled in.",
      list: booked.filter((stay) => stay.end > stay.start && !stay.recordedNights).sort(byArrival),
    },
    {
      id: "guest-mismatch",
      title: "Age counts that disagree with the recorded total",
      why: "Reports use the recorded total. Check which number is right.",
      list: booked.filter((stay) => stay.guestMismatch).sort(byArrival),
    },
    {
      id: "import-warnings",
      title: "Imported records with warnings",
      why: "The importer could not read everything, such as guest counts written as a sentence.",
      list: booked.filter((stay) => stay.importWarnings > 0).sort(byArrival),
    },
    {
      id: "finished-estimate",
      title: "Finished stays still using an estimate",
      why: "Season comparisons are firmer once actual attendance is entered.",
      list: finished.filter((stay) => stay.guestSource === "Estimated").sort(newestFirst),
    },
    {
      id: "finished-no-guests",
      title: "Finished stays with no guest count",
      why: "Unknown counts are left out of totals, never counted as zero.",
      list: finished.filter((stay) => stay.guests === null).sort(newestFirst),
    },
    {
      id: "unmapped-type",
      title: "Retreat types not on the official list",
      why: "They show under their own text in the Who Came table.",
      list: booked.filter((stay) => !stay.typeMapped).sort(byArrival),
    },
    {
      id: "undated-inquiry",
      title: "Open inquiries with no stay date",
      why: "These appear in no dated period. Their wanted dates are text only.",
      list: stays.filter((stay) => !stay.start && stay.stateKey === "inquiry"),
    },
  ].filter((issue) => issue.list.length > 0);

  const flagged = new Set(issues.flatMap((issue) => issue.list).map((stay) => stay.id));
  return {
    issues,
    bookedCount: booked.length,
    completeCount: booked.filter((stay) => !flagged.has(stay.id)).length,
    total: issues.reduce((sum, issue) => sum + issue.list.length, 0),
  };
}

/* ---------------------------------------------------------
   What Stands Out: fixed rules, each silent unless it has something to say
--------------------------------------------------------- */

const count = (value) => Math.round(value).toLocaleString("en-US");
const countWord = (value, word) => `${count(value)} ${word}${value === 1 ? "" : "s"}`;

export function getObservations({ months, types, weekends, groupSize, firstIssue, compare, priorLabel, horizonLabel }) {
  const observations = [];

  const finished = months.filter((row) => row.timing === "finished" && row.totals.camperDays > 0);
  if (finished.length) {
    const top = finished.reduce((best, row) => (row.totals.camperDays > best.totals.camperDays ? row : best));
    const change = top.totals.camperDays - top.priorTotals.camperDays;
    const versus = compare && top.prior.length
      ? `, ${change >= 0 ? "up" : "down"} ${count(Math.abs(change))} on ${top.label} ${priorLabel}`
      : "";
    observations.push({
      id: "busiest",
      text: `${top.label} was the busiest month, with ${count(top.totals.camperDays)} camper days${versus}.`,
      how: "Highest camper days among finished months, by arrival month. Stays with no usable count add nothing.",
      records: top.now,
      recordsTitle: `${top.label} ${top.year}`,
    });
  }

  if (compare) {
    const candidates = types.filter(
      (row) => row.totals.stays + row.priorTotals.stays >= 4 && row.totals.stays !== row.priorTotals.stays
    );
    if (candidates.length) {
      const change = (row) => Math.abs(row.totals.stays - row.priorTotals.stays);
      const top = candidates.reduce((best, row) => (change(row) > change(best) ? row : best));
      observations.push({
        id: "type-shift",
        text: `${top.type} moved the most: ${countWord(top.totals.stays, "stay")} this period against ${count(top.priorTotals.stays)} in ${priorLabel}.`,
        how: "Largest change in stays among retreat types with at least 4 stays across both years, over the whole period.",
        records: top.now,
        recordsTitle: top.type,
      });
    }
  }

  if (weekends.length) {
    observations.push({
      id: "open-weekends",
      text: `${countWord(weekends.length, "weekend")} ${horizonLabel} still ${weekends.length === 1 ? "has" : "have"} room for ${count(groupSize)} guests. The next is ${formatDayKey(weekends[0].friday)}.`,
      how: "Friday and Saturday nights where buildings with no stay add up to the group size, using each building's recorded capacity. Closed dates are not recorded.",
      goTo: "map",
    });
  }

  if (firstIssue) {
    const size = firstIssue.list.length;
    const title = firstIssue.title.toLowerCase();
    observations.push({
      id: "first-issue",
      text: `${count(size)} ${size === 1 ? title.replace("stays", "stay").replace("records", "record") : title}.`,
      how: "The first item in Data Check. Upcoming stays come first because they can still be fixed before arrival.",
      goTo: "check",
    });
  }

  return observations;
}
