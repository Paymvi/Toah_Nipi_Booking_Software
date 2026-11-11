import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBookingClassification,
  convertRecordKind,
  getCalendarVisibilityKey,
  isHostRecord,
  isPossibleHostRecord,
  keepRecordClassification,
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

test("lodging occupancy excludes inquiries and clearly cancelled only; hosting holds rooms", () => {
  assert.equal(countsForLodgingOccupancy(master), true);
  assert.equal(countsForLodgingOccupancy(staff), true);
  assert.equal(countsForLodgingOccupancy(waitlist), true);
  assert.equal(countsForLodgingOccupancy(archive), true);
  assert.equal(countsForLodgingOccupancy(host), true);
  assert.equal(countsForLodgingOccupancy({ ...host, status: "Cancelled" }), false);
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
  // Hosting is filtered before the guest calendars; on the Hosting calendars it simply shows.
  assert.equal(getCalendarVisibilityKey(host), "");
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

/* ---------------- Hosting ---------------- */

test("hosting rule: explicit name prefix or retreat type only, legacy variants included", () => {
  [
    { organizationName: "Host: Board" },
    { organizationName: "host - Board" },
    { organizationName: "HOSTING – Staff day" },
    { organizationName: "  Hosting—Alumni" },
    { organizationName: "Board dinner", retreatType: "Hosting" },
    { organizationName: "Board dinner", retreatType: " host " },
  ].forEach((record) => assert.equal(isHostRecord(record), true, record.organizationName));

  [
    { organizationName: "Hostel Youth Group" },
    { organizationName: "Hosted by Pastor Lee" },
    { organizationName: "The Host: retreat" },
    { organizationName: "Board", retreatType: "Friends/Hosts" },
    { organizationName: "Board", notes: "Host: staff" },
  ].forEach((record) => assert.equal(isHostRecord(record), false, record.organizationName));

  assert.equal(getBookingDisplayState(host).label, "Hosting");
});

test("records that only mention hosting are listed for review, not reclassified", () => {
  assert.equal(isPossibleHostRecord({ organizationName: "Hosted by Pastor Lee" }), true);
  assert.equal(isPossibleHostRecord({ organizationName: "Board", retreatType: "Friends/Hosts" }), true);
  assert.equal(isPossibleHostRecord({ organizationName: "Hostel Youth Group" }), false);
  assert.equal(isPossibleHostRecord(host), false);
  assert.equal(getRecordKind({ ...master, organizationName: "Hosted by Pastor Lee" }), "booking");
});

const now = "2027-01-02T03:04:05.000Z";
const bookingWithHistory = {
  ...master,
  id: "conv1",
  retreatType: "Church",
  portalToken: "abc",
  notes: "keep me",
  buildingsRooms: "Bethel: 4",
  rentalFormDetails: { retreatType: "Church", lodgingBethel: "4", housingSavedAt: "x" },
};

test("booking -> hosting keeps everything but the classification and records the change", () => {
  const hosting = convertRecordKind(bookingWithHistory, true, { now });
  assert.equal(isHostRecord(hosting), true);
  assert.equal(hosting.id, "conv1");
  assert.equal(hosting.organizationName, master.organizationName);
  assert.equal(hosting.retreatType, "Hosting");
  assert.equal(hosting.rentalFormDetails.retreatType, "Hosting");
  assert.equal(hosting.notes, "keep me");
  assert.equal(hosting.buildingsRooms, "Bethel: 4");
  assert.equal(hosting.rentalFormDetails.lodgingBethel, "4");
  assert.equal(hosting.portalToken, "");
  assert.deepEqual(hosting.rentalFormDetails.hostingConversions, [
    { to: "hosting", at: now, previousRetreatType: "Church" },
  ]);
  assert.equal(hosting.rentalFormDetails.staffEditedFields.retreatType, now);
  assert.equal(convertRecordKind(hosting, true), hosting);
});

test("hosting -> booking restores the previous retreat type, strips the name prefix, never a token", () => {
  const hosting = convertRecordKind(bookingWithHistory, true, { now });
  const back = convertRecordKind(hosting, false, { now });
  assert.equal(isHostRecord(back), false);
  assert.equal(back.retreatType, "Church");
  assert.equal(back.portalToken, "");
  assert.equal(back.rentalFormDetails.hostingConversions.length, 2);
  assert.equal(back.rentalFormDetails.lodgingBethel, "4");

  const named = convertRecordKind({ ...master, organizationName: "Host: Board Weekend", retreatType: "" }, false, { now });
  assert.equal(named.organizationName, "Board Weekend");
  assert.equal(isHostRecord(named), false);

  const both = convertRecordKind({ ...master, organizationName: "Hosting - X", retreatType: "Host" }, false, { now });
  assert.equal(both.organizationName, "X");
  assert.equal(both.retreatType, "");
  assert.equal(isHostRecord(both), false);
});

test("older copies never flip a record between booking and hosting", () => {
  const live = convertRecordKind(bookingWithHistory, true, { now });
  const oldBackup = { ...bookingWithHistory, notes: "backup notes" };
  const kept = keepRecordClassification(oldBackup, live);
  assert.equal(isHostRecord(kept), true);
  assert.equal(kept.notes, "backup notes");
  assert.equal(kept.rentalFormDetails.retreatType, "Hosting");

  const liveBooking = { ...master, organizationName: "Board" };
  const renamedSheetRow = { ...master, organizationName: "Host: Board" };
  assert.equal(isHostRecord(keepRecordClassification(renamedSheetRow, liveBooking)), false);

  assert.equal(keepRecordClassification(oldBackup, undefined), oldBackup);
  assert.equal(keepRecordClassification(oldBackup, bookingWithHistory), oldBackup);
});
