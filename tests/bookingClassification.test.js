import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBookingClassification,
  countsForLodgingOccupancy,
  countsInReports,
  getBookingDisplayState,
  getConvertedInquiryIds,
  getRecordKind,
  isClearlyCancelled,
  isVisibleOnCalendar,
} from "../src/utils/bookingClassification.js";

const master = { id: "m1", sourceType: "Master 2027", status: "Inquiry", organizationName: "Camp A" };
const staff = { id: "s1", sourceType: "Staff Booking", status: "Inquiry", organizationName: "Church B" };
const inquiry = { id: "g1", sourceType: "Guest Group Inquiry 2026", detectedImportType: "Guest Group Inquiry 2026", status: "Inquiry" };
const host = { id: "h1", sourceType: "Master 2026", organizationName: "Host: Staff retreat", status: "Confirmed" };
const cancelled = { id: "c1", sourceType: "Master 2026", status: "Cancelled" };
const cancelledByDate = { id: "c2", sourceType: "Master 2026", status: "Confirmed", dateOfCancellation: "3/1/2026" };
const unknownCancelDate = { id: "c3", sourceType: "Master 2026", status: "Confirmed", dateOfCancellation: "N/A" };
const waitlist = { id: "w1", sourceType: "Master 2026", status: "Confirmed", waitlist: "Yes" };
const archive = { id: "a1", sourceType: "Archive", status: "Archived Visit" };

test("Master and staff bookings are bookings whatever their legacy status", () => {
  assert.equal(getRecordKind(master), "booking");
  assert.equal(getRecordKind(staff), "booking");
  assert.equal(getBookingDisplayState(master).label, "Booked");
  assert.equal(getBookingDisplayState({ ...master, status: "Contract Sent" }).label, "Booked");
  assert.equal(getBookingDisplayState({ ...master, status: "Imported" }).label, "Booked");
});

test("Inquiry Spreadsheet records stay inquiries", () => {
  assert.equal(getRecordKind(inquiry), "inquiry");
  assert.equal(getBookingDisplayState(inquiry).label, "Inquiry");
});

test("host prefix is narrow", () => {
  assert.equal(getRecordKind(host), "host");
  assert.equal(getRecordKind({ ...master, organizationName: "Hosting - Board" }), "host");
  assert.equal(getRecordKind({ ...master, organizationName: "Hostel Youth Group" }), "booking");
});

test("clearly cancelled needs a cancel status or a real date", () => {
  assert.equal(isClearlyCancelled(cancelled), true);
  assert.equal(isClearlyCancelled(cancelledByDate), true);
  assert.equal(isClearlyCancelled(unknownCancelDate), false);
});

test("lodging occupancy excludes hosts, inquiries and clearly cancelled only", () => {
  assert.equal(countsForLodgingOccupancy(master), true);
  assert.equal(countsForLodgingOccupancy(staff), true);
  assert.equal(countsForLodgingOccupancy(waitlist), true);
  assert.equal(countsForLodgingOccupancy(archive), true);
  assert.equal(countsForLodgingOccupancy(host), false);
  assert.equal(countsForLodgingOccupancy(inquiry), false);
  assert.equal(countsForLodgingOccupancy(cancelled), false);
  assert.equal(countsForLodgingOccupancy(cancelledByDate), false);
});

test("reports count everything except hosts", () => {
  [master, staff, inquiry, cancelled, waitlist, archive].forEach((record) =>
    assert.equal(countsInReports(record), true, record.id)
  );
  assert.equal(countsInReports(host), false);
});

test("calendar hides exceptional records unless their toggle is on", () => {
  assert.equal(isVisibleOnCalendar(master), true);
  assert.equal(isVisibleOnCalendar(inquiry), true);
  assert.equal(isVisibleOnCalendar(cancelled), false);
  assert.equal(isVisibleOnCalendar(cancelled, { cancelled: true }), true);
  assert.equal(isVisibleOnCalendar(waitlist), false);
  assert.equal(isVisibleOnCalendar(archive), false);
  assert.equal(isVisibleOnCalendar(archive, { archive: true }), true);
  assert.equal(isVisibleOnCalendar(host, { host: true }), true);
});

test("converted inquiry ids come from bookings, not other inquiries", () => {
  const converted = { ...staff, rentalFormDetails: { sourceInquiryId: "g1" } };
  const inquiryPointingElsewhere = { ...inquiry, id: "g2", rentalFormDetails: { sourceInquiryId: "g9" } };
  const ids = getConvertedInquiryIds([converted, inquiry, inquiryPointingElsewhere]);
  assert.deepEqual([...ids], ["g1"]);
});

test("classification changes write status only when the choice changes", () => {
  const contractSent = { ...master, status: "Contract Sent" };
  assert.equal(applyBookingClassification(contractSent, "booked"), contractSent);

  const cancelledNow = applyBookingClassification(contractSent, "cancelled");
  assert.equal(cancelledNow.status, "Cancelled");
  assert.equal(cancelledNow.waitlist, "No");

  const onWaitlist = applyBookingClassification(contractSent, "waitlist");
  assert.equal(onWaitlist.status, "Waitlist");
  assert.equal(onWaitlist.waitlist, "Yes");
});

test("reinstating keeps the cancellation date as history", () => {
  const record = { ...cancelledByDate, rentalFormDetails: {} };
  const reinstated = applyBookingClassification(record, "booked");
  assert.equal(reinstated.dateOfCancellation, "3/1/2026");
  assert.ok(reinstated.rentalFormDetails.reinstatedAt);
  assert.equal(isClearlyCancelled(reinstated), false);

  const cancelledAgain = applyBookingClassification(reinstated, "cancelled");
  assert.equal(cancelledAgain.rentalFormDetails.reinstatedAt, undefined);
  assert.equal(isClearlyCancelled(cancelledAgain), true);
});

test("archive records cannot be reclassified from the edit forms", () => {
  assert.equal(applyBookingClassification(archive, "cancelled"), archive);
});
