import assert from "node:assert/strict";
import test from "node:test";

import { resolveBookingOverviewDensity } from "../src/constants/dashboardConstants.js";

test("saved Overview density falls back to Compact unless it is a current option", () => {
  assert.equal(resolveBookingOverviewDensity("compact"), "compact");
  assert.equal(resolveBookingOverviewDensity("large"), "large");
  assert.equal(resolveBookingOverviewDensity("very-compact"), "compact");
  assert.equal(resolveBookingOverviewDensity(null), "compact");
  assert.equal(resolveBookingOverviewDensity("garbage"), "compact");
});
