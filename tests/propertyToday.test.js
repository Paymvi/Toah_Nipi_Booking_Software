import assert from "node:assert/strict";
import test from "node:test";

import { getLocalDate } from "../src/utils/portalEmail.js";
import { toDateKey } from "../src/utils/propertyToday.js";

test("today flips at New York midnight, not UTC or device midnight", () => {
  // EST (UTC-5): 2026-11-10 23:59:59 New York is 04:59:59Z on the 11th.
  assert.equal(getLocalDate(new Date("2026-11-11T04:59:59Z")), "2026-11-10");
  assert.equal(getLocalDate(new Date("2026-11-11T05:00:00Z")), "2026-11-11");
  // EDT (UTC-4).
  assert.equal(getLocalDate(new Date("2026-07-01T03:59:59Z")), "2026-06-30");
  assert.equal(getLocalDate(new Date("2026-07-01T04:00:00Z")), "2026-07-01");
  // Year rollover.
  assert.equal(getLocalDate(new Date("2027-01-01T04:59:59Z")), "2026-12-31");
});

test("calendar cell dates match the New York key format", () => {
  assert.equal(toDateKey(new Date(2026, 10, 10)), "2026-11-10");
  assert.equal(toDateKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(toDateKey(new Date(2026, 11, 31)), "2026-12-31");
});
