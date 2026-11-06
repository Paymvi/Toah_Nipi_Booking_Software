import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DASHBOARD_PERIOD,
  formatDashboardPeriodRange,
  formatDashboardPeriodTitle,
  getDashboardPeriodEnd,
  getDashboardPeriodError,
  parseDashboardPeriod,
} from "../src/utils/dashboardPeriod.js";

const date = (year, month, day) => new Date(year, month - 1, day);
const end = (start, amount, unit) => getDashboardPeriodEnd(start, { amount, unit });

test("the default matches the old thirty-day window", () => {
  assert.deepEqual(getDashboardPeriodEnd(date(2026, 11, 5), DEFAULT_DASHBOARD_PERIOD), date(2026, 12, 5));
});

test("days and weeks count calendar days across a daylight-saving change", () => {
  assert.deepEqual(end(date(2026, 3, 1), 14, "days"), date(2026, 3, 15));
  assert.deepEqual(end(date(2026, 3, 1), 2, "weeks"), date(2026, 3, 15));
  assert.deepEqual(end(date(2026, 12, 28), 1, "weeks"), date(2027, 1, 4));
});

test("months keep the day of the month, or use the last day of a shorter month", () => {
  assert.deepEqual(end(date(2026, 11, 5), 3, "months"), date(2027, 2, 5));
  assert.deepEqual(end(date(2026, 1, 31), 1, "months"), date(2026, 2, 28));
  assert.deepEqual(end(date(2028, 1, 31), 1, "months"), date(2028, 2, 29));
  assert.deepEqual(end(date(2026, 8, 31), 1, "months"), date(2026, 9, 30));
  assert.deepEqual(end(date(2026, 12, 31), 2, "months"), date(2027, 2, 28));
  assert.deepEqual(end(date(2026, 1, 31), 12, "months"), date(2027, 1, 31));
});

test("only positive whole numbers are accepted, without a narrow upper limit", () => {
  const start = date(2026, 11, 5);
  for (const bad of ["", " ", "0", "-3", "1.5", "abc", "2 weeks", "1e3"]) {
    assert.match(getDashboardPeriodError(bad, "days", start), /positive whole number/, bad);
  }
  for (const good of ["1", " 45 ", "007", "1000", "36500"]) {
    assert.equal(getDashboardPeriodError(good, "days", start), "", good);
  }
  assert.equal(getDashboardPeriodError("6000", "months", start), "");
  assert.match(getDashboardPeriodError("9".repeat(20), "months", start), /too far ahead/);
  assert.match(getDashboardPeriodError("9".repeat(400), "days", start), /too far ahead/);
});

test("a bad saved value falls back to thirty days", () => {
  const start = date(2026, 11, 5);
  assert.deepEqual(parseDashboardPeriod('{"amount":6,"unit":"weeks"}', start), { amount: 6, unit: "weeks" });
  for (const bad of [null, "", "garbage", "null", "[]", '{"amount":0,"unit":"days"}', '{"amount":3,"unit":"years"}', '{"amount":1.5,"unit":"days"}']) {
    assert.deepEqual(parseDashboardPeriod(bad, start), DEFAULT_DASHBOARD_PERIOD, String(bad));
  }
});

test("the title and range describe the period", () => {
  assert.equal(formatDashboardPeriodTitle(DEFAULT_DASHBOARD_PERIOD), "Next 30 Days");
  assert.equal(formatDashboardPeriodTitle({ amount: 1, unit: "days" }), "Next 1 Day");
  assert.equal(formatDashboardPeriodTitle({ amount: 1, unit: "weeks" }), "Next 1 Week");
  assert.equal(formatDashboardPeriodTitle({ amount: 3, unit: "months" }), "Next 3 Months");
  assert.equal(formatDashboardPeriodRange(date(2026, 11, 5), date(2026, 12, 5)), "Nov 5 – Dec 5, 2026");
  assert.equal(formatDashboardPeriodRange(date(2026, 11, 5), date(2027, 2, 5)), "Nov 5, 2026 – Feb 5, 2027");
});
