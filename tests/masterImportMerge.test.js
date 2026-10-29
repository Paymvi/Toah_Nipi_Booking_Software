import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImportBaseline,
  mergeMasterImportRecord,
  withImportBaseline,
} from "../src/utils/masterImportMerge.js";
import { recordStaffEdits } from "../src/utils/bookingFields.js";

function sheetRow(overrides = {}, detailOverrides = {}) {
  return {
    id: "master-v2-2026-abc",
    sourceType: "Master 2026",
    detectedImportType: "Master 2026",
    sourceSheet: "Master 2026",
    sourceRowNumber: 5,
    rawSpreadsheetData: { "Guest Group Name": "Test Camp" },
    submittedAt: "2026-10-28T09:00:00.000Z",
    organizationName: "Test Camp",
    contactName: "Jo",
    email: "a@example.com",
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    attendeeCount: "40",
    notes: "Sheet note",
    status: "Confirmed",
    waitlist: "No",
    roomName: "Bethel, Dothan",
    buildingsRooms: "Bethel, Dothan",
    ...overrides,
    rentalFormDetails: {
      organizationName: "Test Camp",
      email: "a@example.com",
      status: overrides.status || "Confirmed",
      approxTotalGuests: "40",
      numberOfNights: "2",
      importedStatusSource: "default",
      importedLodgingText: "Bethel, Dothan",
      importWarnings: [],
      ...detailOverrides,
    },
  };
}

// The record as the first import saved it.
function importedRecord(overrides = {}, detailOverrides = {}) {
  return { ...withImportBaseline(sheetRow(overrides, detailOverrides)), updatedAt: "t1" };
}

test("a cancellation made in the app survives a re-import with no sheet status", () => {
  const existing = recordStaffEdits(
    importedRecord(),
    { ...importedRecord(), status: "Cancelled" },
    ["status"]
  );
  const { merged } = mergeMasterImportRecord(existing, sheetRow());
  assert.equal(merged.status, "Cancelled");
});

test("the year default never overwrites a saved status, even without edit history", () => {
  const existing = { ...importedRecord(), status: "Cancelled" };
  delete existing.rentalFormDetails.staffEditedFields;
  const { merged } = mergeMasterImportRecord(existing, sheetRow({ status: "Inquiry" }));
  assert.equal(merged.status, "Cancelled");
});

test("an explicit sheet status updates an untouched booking", () => {
  const existing = importedRecord();
  const incoming = sheetRow({ status: "Cancelled", waitlist: "No" }, { importedStatusSource: "sheet" });
  const { merged } = mergeMasterImportRecord(existing, incoming);
  assert.equal(merged.status, "Cancelled");
  assert.equal(merged.rentalFormDetails.status, "Cancelled");
});

test("an explicit sheet status does not override an app change", () => {
  const existing = { ...importedRecord(), status: "Waitlist", waitlist: "Yes" };
  const incoming = sheetRow({ status: "Confirmed" }, { importedStatusSource: "sheet" });
  const { merged, keptAppValues } = mergeMasterImportRecord(existing, incoming);
  assert.equal(merged.status, "Waitlist");
  assert.equal(merged.waitlist, "Yes");
  assert.ok(keptAppValues.some((entry) => entry.field === "status"));
});

test("fields edited in the app keep the app value; untouched fields take the new sheet value", () => {
  const original = importedRecord();
  const existing = recordStaffEdits(original, { ...original, notes: "Staff note" }, ["notes"]);
  const incoming = sheetRow({ notes: "New sheet note", attendeeCount: "45" }, { approxTotalGuests: "45" });
  const { merged, keptAppValues } = mergeMasterImportRecord(existing, incoming);
  assert.equal(merged.notes, "Staff note");
  assert.equal(merged.attendeeCount, "45");
  assert.equal(merged.rentalFormDetails.approxTotalGuests, "45");
  assert.deepEqual(keptAppValues.map((entry) => entry.field), ["notes"]);
});

test("a value changed in the app without edit history is still detected against the baseline", () => {
  const existing = { ...importedRecord(), email: "b@example.com" };
  const { merged } = mergeMasterImportRecord(existing, sheetRow({ email: "c@example.com" }, { email: "c@example.com" }));
  assert.equal(merged.email, "b@example.com");
  assert.equal(merged.rentalFormDetails.email, "b@example.com");
});

test("old records without a baseline keep filled values and only fill blanks", () => {
  const existing = sheetRow({ notes: "Whatever is saved", phone: "" });
  existing.updatedAt = "t1";
  const incoming = sheetRow({ notes: "Sheet note v2", phone: "555-0100" });
  const { merged, keptAppValues } = mergeMasterImportRecord(existing, incoming);
  assert.equal(merged.notes, "Whatever is saved");
  assert.equal(merged.phone, "555-0100");
  assert.ok(keptAppValues.some((entry) => entry.reason === "no record of the previous import"));
});

test("old records use a baseline rebuilt from the saved sheet row when available", () => {
  const existing = sheetRow({ notes: "Sheet note" });
  existing.updatedAt = "t1";
  const incoming = sheetRow({ notes: "Sheet note v2" });
  const { merged } = mergeMasterImportRecord(existing, incoming, {
    rebuildBaseline: () => sheetRow({ notes: "Sheet note" }),
  });
  assert.equal(merged.notes, "Sheet note v2");
});

test("after the Housing tab is saved, a re-import cannot restore removed buildings", () => {
  const original = importedRecord();
  const housingSaved = recordStaffEdits(
    original,
    {
      ...original,
      buildingsRooms: "Bethel: 40",
      roomName: "Bethel: 40",
      rentalFormDetails: {
        ...original.rentalFormDetails,
        lodgingBethel: "40",
        housingUsage: { lodgingBethel: true, lodgingDothan: false },
      },
    },
    [],
    { forceKeys: ["lodging"] }
  );
  const incoming = sheetRow({}, { importedLodgingText: "Bethel, Dothan, Guest House", lodgingDothan: "10" });
  const { merged } = mergeMasterImportRecord(housingSaved, incoming);
  assert.equal(merged.buildingsRooms, "Bethel: 40");
  assert.equal(merged.roomName, "Bethel: 40");
  assert.equal(merged.rentalFormDetails.lodgingDothan, undefined);
  assert.equal(merged.rentalFormDetails.housingUsage.lodgingDothan, false);
  assert.equal(merged.rentalFormDetails.importedLodgingText, "Bethel, Dothan, Guest House");
});

test("a blank lodging cell never resets the lodging label to Unassigned", () => {
  const existing = importedRecord();
  const { merged } = mergeMasterImportRecord(existing, sheetRow({ roomName: "Unassigned", buildingsRooms: "" }));
  assert.equal(merged.roomName, "Bethel, Dothan");
  assert.equal(merged.buildingsRooms, "Bethel, Dothan");
});

test("app-owned data is never taken from the sheet", () => {
  const existing = {
    ...importedRecord(),
    checklists: [{ id: "c1" }],
    programLogisticsAssignments: [{ id: "a1" }],
    portalToken: "tok",
    submittedAt: "2026-01-02T12:00:00.000Z",
  };
  const { merged } = mergeMasterImportRecord(existing, sheetRow());
  assert.deepEqual(merged.checklists, [{ id: "c1" }]);
  assert.deepEqual(merged.programLogisticsAssignments, [{ id: "a1" }]);
  assert.equal(merged.portalToken, "tok");
  assert.equal(merged.submittedAt, "2026-01-02T12:00:00.000Z");
  assert.equal(merged.updatedAt, "t1");
});

test("each import stores a fresh baseline", () => {
  const { merged } = mergeMasterImportRecord(importedRecord(), sheetRow({ notes: "v2" }));
  assert.deepEqual(merged.rentalFormDetails.importBaseline, buildImportBaseline(sheetRow({ notes: "v2" })));
});
