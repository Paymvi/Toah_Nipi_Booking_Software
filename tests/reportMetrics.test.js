import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNightIndex,
  buildReportStays,
  getCamperDaysInfo,
  getDataIssues,
  getGroupCapacity,
  getGuestInfo,
  getMonthRows,
  getObservations,
  getOpenWeekends,
  getReportPeriod,
  getSeasonFigures,
  getTotals,
  getTypeRows,
  parseSeasonSettings,
  selectStays,
  shiftKeyYears,
} from "../src/utils/reportMetrics.js";

const TODAY = "2026-11-05";
const staff = (id, fields = {}, details = {}) => ({
  id,
  sourceType: "Staff Booking",
  status: "Confirmed",
  organizationName: id,
  retreatType: "Church",
  rentalFormDetails: details,
  ...fields,
});
const master = (id, fields = {}, details = {}) =>
  staff(id, { sourceType: "Master 2026", detectedImportType: "Master 2026", ...fields }, details);
const stayFields = (startDate, endDate, attendeeCount, extra = {}) => ({
  startDate, endDate, attendeeCount, nights: "2", mealCount: "5", ...extra,
});
const period = getReportPeriod({ period: "thisYear" }, TODAY);
const filters = { counting: "stays", retreatType: "all" };

test("guests: unknown text is unknown, never zero", () => {
  for (const attendeeCount of ["TBD", "n/a", "", "?", "0"]) {
    assert.deepEqual(getGuestInfo(staff("x", { attendeeCount })), { value: null, source: "Unknown", mismatch: false });
  }
  assert.equal(getGuestInfo(staff("x", { attendeeCount: "40-50" })).value, 40, "a range uses its lower number");
});

test("guests: actual, then recorded, then estimated", () => {
  assert.equal(getGuestInfo(staff("x", { attendeeCount: "100" }, { actualAdultGuests: "20", actualChildren3to17: "5" })).value, 25);
  assert.equal(getGuestInfo(staff("x", { attendeeCount: "30" }, { approxTotalGuests: "30", importedGuestCountKind: "recorded" })).source, "Recorded");
  assert.equal(getGuestInfo(staff("x", { attendeeCount: "30" }, { approxTotalGuests: "30" })).source, "Estimated");
  assert.equal(getGuestInfo(staff("x", {}, { approxAdultGuests: "8", approxChildren3to17: "2" })).value, 10);
});

test("guests: a partial breakdown does not override a recorded total", () => {
  const info = getGuestInfo(master("x", { attendeeCount: "52" }, { importedGuestCountKind: "recorded", actualAdultGuests: "12" }));
  assert.deepEqual(info, { value: 52, source: "Recorded", mismatch: true });
  const matches = getGuestInfo(master("x", { attendeeCount: "52" }, { importedGuestCountKind: "recorded", actualAdultGuests: "40", actualChildren3to17: "12" }));
  assert.deepEqual(matches, { value: 52, source: "Actual", mismatch: false });
});

test("camper days: stored figure stands until actual attendance replaces its count", () => {
  const imported = master("x", stayFields("2026-07-03", "2026-07-05", "100", { camperDays: "180" }), { approxTotalGuests: "100" });
  assert.deepEqual(getCamperDaysInfo(imported), { value: 180, source: "Stored" });

  const withActual = master("x", stayFields("2026-07-03", "2026-07-05", "100", { camperDays: "180" }), { approxTotalGuests: "100", actualAdultGuests: "20" });
  const recalculated = getCamperDaysInfo(withActual);
  assert.equal(recalculated.source, "Calculated");
  assert.ok(Math.abs(recalculated.value - 36) < 1e-9, "20 x (2 x 0.4 + 5 x 0.2)");

  const sameAsSheet = master("x", stayFields("2026-07-03", "2026-07-05", "100", { camperDays: "180" }), { actualAdultGuests: "100" });
  assert.equal(getCamperDaysInfo(sameAsSheet).value, 180, "actuals matching the sheet keep its figure");
});

test("camper days: day campers are not added to a stored figure, and are added to a calculated one", () => {
  const stored = master("x", stayFields("2026-07-10", "2026-07-11", "10", { camperDays: "8" }), { dayCamperCount: "50", dayCamperMeals: "2" });
  assert.equal(getCamperDaysInfo(stored).value, 8);
  const calculated = staff("x", stayFields("2026-07-10", "2026-07-12", "10"), { dayCamperCount: "10", dayCamperMeals: "2" });
  assert.ok(Math.abs(getCamperDaysInfo(calculated).value - 22) < 1e-9, "10 x 1.8 + 10 x 2 x 0.2");
});

test("camper days: not measurable is null", () => {
  assert.equal(getCamperDaysInfo(staff("x", { attendeeCount: "TBD", nights: "2" })).value, null);
  assert.equal(getCamperDaysInfo(staff("x", { attendeeCount: "20" })).value, null);
});

test("counting: stays are booked and archived; all records keeps everything except hosts", () => {
  const { stays, hostExcluded } = buildReportStays([
    staff("booked", stayFields("2026-06-05", "2026-06-07", "10")),
    master("cancelled", stayFields("2026-06-12", "2026-06-14", "80", { status: "Cancelled" })),
    master("waitlist", stayFields("2026-06-13", "2026-06-14", "30", { status: "Waitlist", waitlist: "Yes" })),
    { id: "archive", sourceType: "Archive", status: "Archived", startDate: "2026-03-01", endDate: "2026-03-03", attendeeCount: "12" },
    master("Host: Board", stayFields("2026-05-01", "2026-05-03", "9", { organizationName: "Host: Board" })),
  ]);
  assert.equal(hostExcluded, 1);
  const range = { start: "2026-01-01", end: "2026-12-31" };
  assert.deepEqual(selectStays(stays, range).map((stay) => stay.id).sort(), ["archive", "booked"]);
  assert.equal(selectStays(stays, { ...range, counting: "all" }).length, 4);
});

test("declined inquiries are told apart from cancelled bookings, and deleted inquiries drop out", () => {
  const declined = { id: "i1", sourceType: "Guest Group Inquiry 2026", status: "Cancelled", organizationName: "No Thanks" };
  const deleted = { id: "i2", sourceType: "Guest Group Inquiry 2026", status: "Inquiry", organizationName: "Deleted" };
  const { stays } = buildReportStays([declined, deleted], new Set(["i2"]));
  assert.deepEqual(stays.map((stay) => stay.id), ["i1"]);
  assert.equal(stays[0].stateLabel, "Declined inquiry");
});

test("periods: leap day and the same dates last year", () => {
  assert.equal(shiftKeyYears("2028-02-29", -1), "2027-02-28");
  assert.equal(shiftKeyYears("2026-11-05", -1), "2025-11-05");
  const custom = getReportPeriod({ period: "custom", customStart: "2026-08-31", customEnd: "2026-06-01" }, TODAY);
  assert.deepEqual([custom.start, custom.end, custom.priorStart], ["2026-06-01", "2026-08-31", "2025-06-01"]);
  assert.equal(getReportPeriod({ period: "custom", customStart: "", customEnd: "" }, TODAY).start, "2026-01-01");
  assert.equal(getReportPeriod({ period: "lastYear" }, TODAY).priorLabel, "2024");
});

test("comparison is like for like, and future stays stay apart", () => {
  const { stays } = buildReportStays([
    staff("a", stayFields("2026-06-05", "2026-06-07", "10")),
    staff("future", stayFields("2026-12-04", "2026-12-06", "99")),
    staff("prior-same", stayFields("2025-06-05", "2025-06-07", "20")),
    staff("prior-later", stayFields("2025-12-05", "2025-12-07", "40")),
  ]);
  const figures = getSeasonFigures(stays, period, filters, TODAY);
  assert.equal(figures.now.guests, 10);
  assert.equal(figures.prior.guests, 20, "later 2025 stays are outside the same dates");
  assert.equal(figures.aheadTotals.guests, 99);
  assert.equal(figures.priorAll.length, 2);
});

test("a period not yet started has nothing so far", () => {
  const { stays } = buildReportStays([staff("a", stayFields("2026-12-04", "2026-12-06", "10"))]);
  const future = getReportPeriod({ period: "custom", customStart: "2026-12-01", customEnd: "2026-12-31" }, TODAY);
  const figures = getSeasonFigures(stays, future, filters, TODAY);
  assert.equal(figures.soFar.length, 0);
  assert.equal(figures.ahead.length, 1);
});

test("unknown guests are counted apart and add nothing", () => {
  const { stays } = buildReportStays([
    staff("a", stayFields("2026-06-05", "2026-06-07", "10")),
    staff("b", stayFields("2026-06-12", "2026-06-14", "TBD")),
  ]);
  const totals = getTotals(stays);
  assert.equal(totals.guests, 10);
  assert.equal(totals.guestsUnknown, 1);
  assert.equal(totals.camperUnknown, 1);
});

test("month and type rows add up to the period total", () => {
  const { stays } = buildReportStays([
    staff("a", stayFields("2026-06-05", "2026-06-07", "10")),
    staff("b", stayFields("2026-06-12", "2026-06-14", "20", { retreatType: "Ministry" })),
    staff("c", stayFields("2026-11-20", "2026-11-22", "30")),
    staff("d", stayFields("2026-12-30", "2027-01-02", "40")),
  ]);
  const all = selectStays(stays, { ...filters, start: period.start, end: period.end });
  const months = getMonthRows(stays, period, filters, TODAY);
  const sum = (rows) => rows.reduce((total, row) => total + row.totals.guests, 0);
  assert.equal(sum(months), getTotals(all).guests);
  assert.equal(sum(getTypeRows(stays, period, filters)), getTotals(all).guests);
  assert.deepEqual(months.map((row) => row.timing), ["finished", "partial", "scheduled"]);
});

test("map: same holders as the Lodging Calendar, departure night free, year end crossed", () => {
  const { stays } = buildReportStays([
    staff("held", { startDate: "2026-12-30", endDate: "2027-01-02" }, { lodgingBethel: "40" }),
    staff("cancelled", { startDate: "2026-12-30", endDate: "2027-01-01", status: "Cancelled" }, { lodgingDothan: "10" }),
    staff("waitlist", { startDate: "2026-12-30", endDate: "2026-12-31", status: "Waitlist", waitlist: "Yes" }, { lodgingDothan: "10" }),
    staff("nowhere", { startDate: "2026-12-30", endDate: "2026-12-31" }),
    { id: "inquiry", sourceType: "Guest Group Inquiry 2026", status: "Inquiry", startDate: "2026-12-30", endDate: "2026-12-31", rentalFormDetails: { lodgingCapernaum: "4" } },
  ]);
  const index = buildNightIndex(stays);
  assert.equal(index.staysOn("bethel", "2027-01-01").length, 1, "a stay holds nights in both years");
  assert.equal(index.staysOn("bethel", "2027-01-02").length, 0, "the departure day is not a night");
  assert.deepEqual(index.staysOn("dothan", "2026-12-30").map((stay) => stay.id), ["waitlist"]);
  assert.equal(index.staysOn("capernaum", "2026-12-30").length, 0);
  assert.deepEqual(index.unplacedOn("2026-12-30").map((stay) => stay.id), ["nowhere"]);
});

test("open weekends use only empty buildings and recorded capacity", () => {
  assert.equal(getGroupCapacity("hebron"), 66);
  assert.equal(getGroupCapacity("camping"), 0);
  const { stays } = buildReportStays([
    staff("big", { startDate: "2026-11-06", endDate: "2026-11-08" }, { lodgingBethel: "60", lodgingHebronBunks: "50", lodgingDothan: "20" }),
    staff("nowhere", { startDate: "2026-11-13", endDate: "2026-11-15" }),
  ]);
  const weekends = getOpenWeekends(stays, TODAY, 60, 14);
  assert.deepEqual(weekends.map((weekend) => weekend.friday), ["2026-11-13"], "Nov 6 has only 25 beds free");
  assert.equal(weekends[0].unplaced, 1);
  assert.equal(weekends[0].sunday, "2026-11-15");
  assert.equal(getOpenWeekends(stays, TODAY, 200, 14).length, 0);
});

test("data check flags what matters and leaves cancelled and archived records alone", () => {
  const { stays } = buildReportStays([
    staff("no-building", stayFields("2026-12-04", "2026-12-06", "10")),
    staff("no-guests", stayFields("2026-12-11", "2026-12-13", "TBD"), { lodgingBethel: "1" }),
    staff("complete", stayFields("2026-12-18", "2026-12-20", "10"), { lodgingBethel: "10" }),
    staff("no-nights", { startDate: "2026-06-05", endDate: "2026-06-07", attendeeCount: "20", mealCount: "5" }, { actualAdultGuests: "20", lodgingBethel: "20" }),
    staff("estimate", stayFields("2026-06-12", "2026-06-14", "20"), { approxTotalGuests: "20" }),
    master("cancelled", stayFields("2026-12-04", "2026-12-06", "", { status: "Cancelled" })),
    { id: "archive", sourceType: "Archive", status: "Archived", startDate: "2026-03-01", endDate: "2026-03-03" },
    { id: "undated", sourceType: "Guest Group Inquiry 2026", status: "Inquiry" },
    { id: "declined", sourceType: "Guest Group Inquiry 2026", status: "Cancelled" },
  ]);
  const check = getDataIssues(stays, period, TODAY);
  const listed = Object.fromEntries(check.issues.map((issue) => [issue.id, issue.list.map((stay) => stay.id)]));
  assert.deepEqual(listed["no-building"], ["no-building"]);
  assert.deepEqual(listed["upcoming-no-guests"], ["no-guests"]);
  assert.deepEqual(listed["no-nights"], ["no-nights"]);
  assert.deepEqual(listed["finished-estimate"], ["estimate"]);
  assert.deepEqual(listed["undated-inquiry"], ["undated"]);
  assert.equal(check.issues[0].id, "no-building", "upcoming problems come first");
  assert.equal(check.bookedCount, 5);
  assert.equal(check.completeCount, 1);
});

test("observations stay silent without enough to say, and agree with the rows", () => {
  const silent = getObservations({ months: [], types: [], weekends: [], groupSize: 40, compare: true, priorLabel: "2025", horizonLabel: "ahead" });
  assert.deepEqual(silent, []);

  const { stays } = buildReportStays([
    staff("a", stayFields("2026-06-05", "2026-06-07", "10")),
    staff("b", stayFields("2025-06-05", "2025-06-07", "5")),
  ]);
  const months = getMonthRows(stays, period, filters, TODAY);
  const [busiest] = getObservations({ months, types: [], weekends: [], groupSize: 40, compare: true, priorLabel: "2025", horizonLabel: "ahead" });
  assert.equal(busiest.text, "Jun was the busiest month, with 18 camper days, up 9 on Jun 2025.");
  assert.deepEqual(busiest.records.map((stay) => stay.id), ["a"]);
});

test("saved settings: bad values fall back, good ones survive", () => {
  assert.equal(parseSeasonSettings("not json").period, "thisYear");
  assert.equal(parseSeasonSettings(null).tab, "brief");
  const saved = parseSeasonSettings(JSON.stringify({ period: "nonsense", tab: "map", counting: "all", compare: false, customStart: "soon" }));
  assert.deepEqual([saved.period, saved.tab, saved.counting, saved.compare, saved.customStart], ["thisYear", "map", "all", false, ""]);
});
