import test from "node:test";
import assert from "node:assert/strict";

import { prepareGuestGroupInquiryImportIds } from "../src/utils/workbookImport.js";

// A Guest Group Inquiry row as the importer builds it; the id comes from sheet name + row number.
function inquiry(id, overrides = {}) {
  return {
    id,
    detectedImportType: "Guest Group Inquiry 2026",
    organizationName: "Cedar Fellowship",
    contactName: "Pat Example",
    email: "pat@example.org",
    submittedAt: "2026-03-10",
    ...overrides,
  };
}

test("a row that moved in the workbook updates the same inquiry instead of duplicating it", () => {
  const existing = [inquiry("sheet-row-4")];
  const [row] = prepareGuestGroupInquiryImportIds([inquiry("sheet-row-7")], existing);
  assert.equal(row.id, "sheet-row-4");
});

test("an inquiry saved one day early (before AUDIT-013) still matches the corrected row", () => {
  const existing = [inquiry("old-id", { submittedAt: "2026-03-09" })];
  const [row] = prepareGuestGroupInquiryImportIds([inquiry("sheet-row-7")], existing);
  assert.equal(row.id, "old-id");
});

test("repeated rows stay separate records; nothing is merged", () => {
  const existing = [inquiry("a")];
  const rows = prepareGuestGroupInquiryImportIds([inquiry("row-1"), inquiry("row-2")], existing);
  assert.deepEqual(rows.map((row) => row.id), ["a", "row-2"]);
});

test("an edited row keeps its row-position id, so it updates that inquiry", () => {
  const existing = [inquiry("row-1", { organizationName: "Old Name" })];
  const [row] = prepareGuestGroupInquiryImportIds([inquiry("row-1")], existing);
  assert.equal(row.id, "row-1");
});

test("a row-position id already claimed by a content match gets a fresh id instead of overwriting", () => {
  // Cedar moved from row 1 to row 2; a new group now sits in row 1.
  const existing = [inquiry("row-1")];
  const rows = prepareGuestGroupInquiryImportIds(
    [inquiry("row-1", { organizationName: "New Group" }), inquiry("row-2")],
    existing
  );
  assert.deepEqual(rows.map((row) => row.id), ["row-1-2", "row-1"]);
});

test("rows that are not Guest Group Inquiries pass through untouched", () => {
  const master = { id: "m-1", detectedImportType: "Master 2026", organizationName: "Cedar Fellowship" };
  const [row] = prepareGuestGroupInquiryImportIds([master], [inquiry("x")]);
  assert.equal(row, master);
});
