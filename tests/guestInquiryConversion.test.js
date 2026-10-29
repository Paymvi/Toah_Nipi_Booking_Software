import test from "node:test";
import assert from "node:assert/strict";

import {
  decideGuestInquiryConversion,
  markGuestInquiryConvertedWithClient,
} from "../src/services/guestInquiryConversion.js";

const guestSource = { guestInquiryId: "gi-1", seedId: "gi-1", guestOrganizationName: "Web Church" };
const bookingFromInquiry = { id: "b-1", rentalFormDetails: { sourceInquiryId: "gi-1", sourceInquirySheet: "Guest Web Form" } };

test("only the inquiry that seeded the form is marked", () => {
  assert.deepEqual(
    decideGuestInquiryConversion({ guestSource, formSeedId: "gi-1", savedBooking: bookingFromInquiry }),
    { action: "mark", guestInquiryId: "gi-1", bookingId: "b-1" }
  );
});

test("abandon-then-start sequence never marks the old inquiry", () => {
  // Staff opened gi-1, left, then started a booking from a staff-sheet inquiry.
  const decision = decideGuestInquiryConversion({
    guestSource,
    formSeedId: "sheet-inquiry-7",
    savedBooking: { id: "b-2", rentalFormDetails: { sourceInquiryId: "sheet-inquiry-7" } },
  });
  assert.equal(decision.action, "none");
});

test("Fill Test Data style reset on a seeded form is not marked", () => {
  const decision = decideGuestInquiryConversion({
    guestSource,
    formSeedId: "gi-1",
    savedBooking: { id: "b-3", organizationName: "Test Community Church", rentalFormDetails: { sourceInquiryId: "" } },
  });
  assert.equal(decision.action, "skip");
});

function fakeInquiryClient(rows, { failUpdatesRemaining = 0 } = {}) {
  const table = new Map(rows.map((row) => [row.id, { ...row }]));
  let failures = failUpdatesRemaining;
  return {
    table,
    from() {
      const filters = [];
      let operation = "select";
      let payload = null;
      const builder = {
        select() { return builder; },
        update(values) { operation = "update"; payload = values; return builder; },
        eq(column, value) { filters.push([column, value]); return builder; },
        maybeSingle() { builder.single = true; return builder; },
        then(resolve) {
          const matching = [...table.values()].filter((row) => filters.every(([c, v]) => String(row[c]) === String(v)));
          if (operation === "update") {
            if (failures > 0) { failures -= 1; resolve({ data: null, error: new Error("network") }); return; }
            matching.forEach((row) => table.set(row.id, { ...row, ...payload }));
            resolve({ data: matching.map((row) => table.get(row.id)), error: null });
            return;
          }
          resolve({ data: builder.single ? matching[0] || null : matching, error: null });
        },
      };
      return builder;
    },
  };
}

test("a failed mark can be retried and then succeeds", async () => {
  const client = fakeInquiryClient([{ id: "gi-1", status: "pending" }], { failUpdatesRemaining: 1 });
  await assert.rejects(markGuestInquiryConvertedWithClient(client, "gi-1", "b-1"));
  assert.equal(client.table.get("gi-1").status, "pending");
  await markGuestInquiryConvertedWithClient(client, "gi-1", "b-1");
  assert.equal(client.table.get("gi-1").status, "converted");
  assert.equal(client.table.get("gi-1").converted_booking_id, "b-1");
});

test("retrying after success is a no-op", async () => {
  const client = fakeInquiryClient([{ id: "gi-1", status: "converted", converted_booking_id: "b-1" }]);
  const result = await markGuestInquiryConvertedWithClient(client, "gi-1", "b-1");
  assert.equal(result.converted_booking_id, "b-1");
});

test("an inquiry converted to another booking is never relinked", async () => {
  const client = fakeInquiryClient([{ id: "gi-1", status: "converted", converted_booking_id: "b-9" }]);
  await assert.rejects(markGuestInquiryConvertedWithClient(client, "gi-1", "b-1"), /different booking/);
  assert.equal(client.table.get("gi-1").converted_booking_id, "b-9");
});
