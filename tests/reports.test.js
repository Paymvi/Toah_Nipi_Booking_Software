import test from "node:test";
import assert from "node:assert/strict";

import {
  bookingArrivesInRange,
  getArrivalMonthKey,
  getOfficialRetreatType,
  getReportBookings,
  getReportSourceLabel,
  neutralizeCsvCell,
  shouldUseStoredCamperDays,
  toCsv,
} from "../src/utils/reportRules.js";

const inquiry = { id: "g1", sourceType: "Guest Group Inquiry 2026", status: "Inquiry" };
const convertedBooking = { id: "s1", sourceType: "Staff Booking", rentalFormDetails: { sourceInquiryId: "g1" } };
const host = { id: "h1", sourceType: "Master 2026", organizationName: "Host: Board weekend" };
const cancelled = { id: "m1", sourceType: "Master 2026", status: "Cancelled" };

test("reports count everything except hosts, and converted inquiries once", () => {
  const { bookings, hostExcluded, convertedExcluded } = getReportBookings([inquiry, convertedBooking, host, cancelled]);
  assert.deepEqual(bookings.map((booking) => booking.id), ["s1", "m1"]);
  assert.equal(hostExcluded, 1);
  assert.equal(convertedExcluded, 1);
});

test("stays belong to their arrival month, so rows and totals agree", () => {
  const crossYear = { startDate: "2025-12-30", endDate: "2026-01-02" };
  assert.equal(getArrivalMonthKey(crossYear), "2025-12");
  assert.equal(bookingArrivesInRange(crossYear, { startDate: "2026-01-01", endDate: "2026-12-31" }), false);
  assert.equal(bookingArrivesInRange(crossYear, { startDate: "2025-01-01", endDate: "2025-12-31" }), true);
  assert.equal(bookingArrivesInRange({}, {}), true, "undated records appear under All Time");
  assert.equal(bookingArrivesInRange({}, { startDate: "2026-01-01" }), false);
});

test("imported Camper Days are used until guests, nights or meals are edited", () => {
  assert.equal(shouldUseStoredCamperDays({ rentalFormDetails: {} }), true);
  const edited = { rentalFormDetails: { staffEditedFields: { nights: "2026-10-01T00:00:00Z" } } };
  assert.equal(shouldUseStoredCamperDays(edited), false);
  const retyped = { rentalFormDetails: { staffEditedFields: { nights: "2026-10-01T00:00:00Z", camperDays: "2026-10-02T00:00:00Z" } } };
  assert.equal(shouldUseStoredCamperDays(retyped), true);
});

test("five sources, with website inquiries told apart from staff entries", () => {
  assert.equal(getReportSourceLabel({ sourceType: "Staff Booking", rentalFormDetails: { sourceInquirySheet: "Guest Web Form" } }), "Website inquiry");
  assert.equal(getReportSourceLabel({ sourceType: "Staff Booking" }), "Staff entered");
  assert.equal(getReportSourceLabel({ sourceType: "Master 2027" }), "Master sheet");
  assert.equal(getReportSourceLabel(inquiry), "Guest Group sheet");
  assert.equal(getReportSourceLabel({ sourceType: "Archive" }), "Archive");
});

test("retreat types map to the official list without guessing", () => {
  assert.equal(getOfficialRetreatType("PR").type, "Personal Retreat");
  assert.equal(getOfficialRetreatType("personal retreat").type, "Personal Retreat");
  assert.equal(getOfficialRetreatType("Church-Youth").type, "Church - Youth");
  const unknown = getOfficialRetreatType("PR-Day Use Only");
  assert.equal(unknown.mapped, false);
  assert.equal(unknown.type, "PR-Day Use Only (not mapped)");
});

test("CSV rounds numbers and neutralizes formula-like text", () => {
  assert.equal(neutralizeCsvCell(12.600000000000001), 12.6);
  assert.equal(neutralizeCsvCell("=Family"), "'=Family");
  assert.equal(neutralizeCsvCell("-5 guests"), "'-5 guests");
  assert.equal(neutralizeCsvCell("Church"), "Church");
  const csv = toCsv([{ title: "T", headers: ["a", "b"], rows: [["=1+1", 1.25]] }]);
  assert.equal(csv, "T\na,b\n'=1+1,1.3");
});
