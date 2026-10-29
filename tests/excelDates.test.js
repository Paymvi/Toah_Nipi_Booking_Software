import test from "node:test";
import assert from "node:assert/strict";

// Staff computers run in U.S. Eastern time; the bug only shows west of UTC.
process.env.TZ = "America/New_York";

const { formatExcelDateValue } = await import("../src/utils/dateUtils.js");

test("Excel date cells keep the date shown in the sheet in Eastern time", () => {
  assert.equal(new Date(Date.UTC(2026, 2, 5)).getDate(), 4, "time zone is applied");
  // ExcelJS returns date cells as Date objects at UTC midnight.
  assert.equal(formatExcelDateValue(new Date(Date.UTC(2026, 2, 5))), "2026-03-05");
  assert.equal(formatExcelDateValue(new Date(Date.UTC(2026, 0, 1))), "2026-01-01");
  assert.equal(formatExcelDateValue(46086), "2026-03-05");
  assert.equal(formatExcelDateValue("2026-03-05"), "2026-03-05");
});
