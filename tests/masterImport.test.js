import test from "node:test";
import assert from "node:assert/strict";

import {
  createMasterImportId,
  getMasterImportStatus,
  normalizeMasterImportRow,
  parseMasterImportDate,
  parseMasterImportMeals,
  prepareMasterImportUpdates,
} from "../src/utils/masterImport.js";

// 2026-06-05 is a Friday; the stay runs Friday to Sunday.
const FRIDAY = "2026-06-05";
const SUNDAY = "2026-06-07";

test("'Fri dinner thru Sun lunch' becomes the exact meal schedule", () => {
  const warnings = [];
  const plan = parseMasterImportMeals("Fri dinner thru Sun lunch", FRIDAY, SUNDAY, "", warnings);

  assert.deepEqual(plan.mealSchedule, {
    "2026-06-05": { breakfast: false, lunch: false, dinner: true },
    "2026-06-06": { breakfast: true, lunch: true, dinner: true },
    "2026-06-07": { breakfast: true, lunch: true, dinner: false },
  });
  assert.equal(plan.count, "6");
  assert.equal(plan.firstMeal, "Dinner");
  assert.equal(plan.lastMeal, "Lunch");
  assert.deepEqual(warnings, []);
});

test("a meal count that disagrees with the description keeps the text for review", () => {
  const warnings = [];
  const plan = parseMasterImportMeals("Fri dinner thru Sun lunch", FRIDAY, SUNDAY, "5", warnings);
  assert.deepEqual(plan.mealSchedule, {});
  assert.equal(plan.count, "5");
  assert.equal(plan.summary, "Fri dinner thru Sun lunch");
  assert.equal(warnings.length, 1);
});

test("missing, 'no meals' and unrecognized meal text never invent a schedule", () => {
  const blank = parseMasterImportMeals("", FRIDAY, SUNDAY, "", []);
  assert.deepEqual(blank, { count: "", mealSchedule: {}, firstMeal: "", lastMeal: "", summary: "" });

  const none = parseMasterImportMeals("No meals", FRIDAY, SUNDAY, "", []);
  assert.equal(none.count, "0");
  assert.deepEqual(none.mealSchedule, {});

  const warnings = [];
  const unclear = parseMasterImportMeals("Kitchen to confirm with leader", FRIDAY, SUNDAY, "", warnings);
  assert.deepEqual(unclear.mealSchedule, {});
  assert.equal(unclear.summary, "Kitchen to confirm with leader");
  assert.equal(warnings.length, 1);
});

test("dates: US text, ISO text and Excel serial numbers; impossible dates are refused", () => {
  assert.deepEqual(parseMasterImportDate("6/5/26", 2026), { date: FRIDAY, time: "" });
  assert.deepEqual(parseMasterImportDate("6/5", 2026), { date: FRIDAY, time: "" });
  assert.deepEqual(parseMasterImportDate("2026-06-05", 2026), { date: FRIDAY, time: "" });
  // Excel serial 45658 is 2025-01-01; .75 of a day is 18:00.
  assert.deepEqual(parseMasterImportDate(45658.75, 2025), { date: "2025-01-01", time: "18:00" });
  assert.deepEqual(parseMasterImportDate(new Date(Date.UTC(2026, 5, 5)), 2026), { date: FRIDAY, time: "" });

  const warnings = [];
  assert.deepEqual(parseMasterImportDate("2/30/2026", 2026, warnings, "Arrival date"), { date: "", time: "" });
  assert.match(warnings[0], /Arrival date is not a valid calendar date/);
  assert.deepEqual(parseMasterImportDate("TBD", 2026), { date: "", time: "" });
});

test("status comes from the sheet when it says one, otherwise the year default", () => {
  const base = { confirmed: "", stage: "", cancellationDate: "", cancellationReason: "", contractSent: "", contractReturned: "" };
  assert.equal(getMasterImportStatus({ ...base, year: 2026, cancellationDate: "2026-03-01" }), "Cancelled");
  assert.equal(getMasterImportStatus({ ...base, year: 2026, confirmed: "Unconfirmed" }), "Inquiry");
  assert.equal(getMasterImportStatus({ ...base, year: 2026, contractReturned: "Yes" }), "Confirmed");
  assert.equal(getMasterImportStatus({ ...base, year: 2026, contractSent: "Yes" }), "Contract Sent");
  assert.equal(getMasterImportStatus({ ...base, year: 2026, stage: "Waitlist" }), "Waitlist");
  assert.equal(getMasterImportStatus({ ...base, year: 2026 }), "Confirmed");
  assert.equal(getMasterImportStatus({ ...base, year: 2027 }), "Inquiry");
});

const sheetRow = {
  "Guest Group Name": "Fictional Youth Group",
  "Arrival Date": "6/5/2026",
  "Departure Date": "6/7/2026",
  "Group Leader/Contact Person": "Fictional Leader",
  "Meals": "Fri dinner thru Sun lunch",
  "Total # of Guests": "40",
};

test("a sheet row becomes a booking with a stable import ID", () => {
  const booking = normalizeMasterImportRow(sheetRow, 0, 2026);
  assert.equal(booking.sourceType, "Master 2026");
  assert.equal(booking.startDate, FRIDAY);
  assert.equal(booking.endDate, SUNDAY);
  assert.equal(booking.attendeeCount, "40");
  assert.equal(booking.rentalFormDetails.numberOfNights, "2");
  assert.equal(booking.rentalFormDetails.numberOfMeals, "6");
  assert.equal(booking.rentalFormDetails.mealSchedule["2026-06-06"].lunch, true);

  // Same row on another day, at another position: same ID.
  assert.match(booking.id, /^master-v2-2026-[0-9a-f]+-[0-9a-f]+$/);
  assert.equal(normalizeMasterImportRow({ ...sheetRow }, 7, 2026).id, booking.id);
  assert.equal(createMasterImportId(booking), booking.id);
  // A different group, stay or contact is a different booking.
  assert.notEqual(normalizeMasterImportRow({ ...sheetRow, "Arrival Date": "6/6/2026" }, 0, 2026).id, booking.id);
  assert.notEqual(normalizeMasterImportRow({ ...sheetRow, "Group Leader/Contact Person": "Someone Else" }, 0, 2026).id, booking.id);
  // Totals and repeated header rows are not bookings.
  assert.equal(normalizeMasterImportRow({ ...sheetRow, "Guest Group Name": "Totals:" }, 0, 2026), null);
});

test("re-importing an unchanged row adds and rewrites nothing", () => {
  const first = prepareMasterImportUpdates([normalizeMasterImportRow(sheetRow, 0, 2026)], []);
  assert.equal(first.added, 1);
  const saved = first.rows[0];
  const again = prepareMasterImportUpdates([normalizeMasterImportRow(sheetRow, 0, 2026)], [saved]);
  assert.deepEqual({ added: again.added, updated: again.updated, unchanged: again.unchanged, rows: again.rows }, {
    added: 0, updated: 0, unchanged: 1, rows: [],
  });
});
