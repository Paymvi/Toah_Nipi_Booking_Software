import test from "node:test";
import assert from "node:assert/strict";

import {
  getDuplicatedField,
  getGuestCountNumber,
  getGuestCountText,
  isStaffEditedField,
  mirrorTopLevelIntoDetails,
  recordStaffEdits,
} from "../src/utils/bookingFields.js";

test("guest ranges use the lower number for calculations and keep text for display", () => {
  assert.equal(getGuestCountNumber("40-50"), 40);
  assert.equal(getGuestCountNumber("45"), 45);
  assert.equal(getGuestCountNumber("12 adults + 3 kids"), 12);
  assert.equal(getGuestCountNumber("TBD"), 0);
  assert.equal(getGuestCountNumber("1,200"), 1200);
  assert.equal(getGuestCountText({ attendeeCount: "40-50" }), "40-50");
});

test("duplicated facts read the top-level copy first", () => {
  const booking = { nights: "3", rentalFormDetails: { numberOfNights: "2" } };
  assert.equal(getDuplicatedField(booking, "nights"), "3");
  assert.equal(getDuplicatedField({ nights: "", rentalFormDetails: { numberOfNights: "2" } }, "nights"), "2");
});

test("mirroring only touches detail keys the record already has", () => {
  const master = {
    email: "b@example.com",
    nights: "3",
    rentalFormDetails: { email: "a@example.com", numberOfNights: "2", other: "keep" },
  };
  const mirrored = mirrorTopLevelIntoDetails(master);
  assert.equal(mirrored.rentalFormDetails.email, "b@example.com");
  assert.equal(mirrored.rentalFormDetails.numberOfNights, "3");
  assert.equal(mirrored.rentalFormDetails.other, "keep");
  assert.equal("contactName" in mirrored.rentalFormDetails, false);

  const noDetails = { email: "x@example.com" };
  assert.equal(mirrorTopLevelIntoDetails(noDetails), noDetails);
});

test("staff edits are recorded per field", () => {
  const before = { status: "Confirmed", notes: "a", rentalFormDetails: {} };
  const after = { ...before, notes: "b" };
  const recorded = recordStaffEdits(before, after, ["status", "notes"], { now: "2026-10-28T00:00:00.000Z" });
  assert.equal(isStaffEditedField(recorded, "notes"), true);
  assert.equal(isStaffEditedField(recorded, "status"), false);

  const unchanged = recordStaffEdits(before, { ...before }, ["status", "notes"]);
  assert.equal(isStaffEditedField(unchanged, "notes"), false);

  const forced = recordStaffEdits(before, { ...before }, [], { forceKeys: ["lodging"] });
  assert.equal(isStaffEditedField(forced, "lodging"), true);
});
