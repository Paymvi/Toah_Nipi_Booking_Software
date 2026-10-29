import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLodgingSummary,
  describeLodgingAvailability,
  getBookingCalendarGroups,
  getBookingLodgingAssignments,
  getLodgingNights,
} from "../src/utils/lodgingUtils.js";
import { LODGING_BUILDINGS } from "../src/constants/lodgingConstants.js";

const groupOf = (summary, id) => summary.find((group) => group.id === id);

test("one summary format, camping written once", () => {
  const values = {
    lodgingBethel: "7",
    lodgingBethelUpperRoom1: "3",
    lodgingBethelUpperRoom2: "4",
    lodgingCamping: "3",
    lodgingCampingTent: "2",
    lodgingCampingRV: "1",
  };
  const summary = buildLodgingSummary(values);
  assert.equal(summary, "Bethel: Upper Floor - Room 1: 3, Room 2: 4; Camping: Tent: 2, RV: 1");
  assert.equal(summary.match(/Tent/g).length, 1);
});

test("an edited total is not hidden behind stale room numbers", () => {
  const values = { lodgingBethel: "10", lodgingBethelUpperRoom1: "3", lodgingBethelUpperRoom2: "4" };
  assert.equal(buildLodgingSummary(values), "Bethel: 10");
});

test("buildings marked used without a count say so", () => {
  assert.equal(buildLodgingSummary({}, { lodgingDothan: true }), "Dothan: count unknown");
});

test("the building list has Ajalon, Camping and no Rustic Cottages", () => {
  const labels = LODGING_BUILDINGS.map((building) => building.label);
  assert.ok(labels.includes("Ajalon"));
  assert.ok(labels.includes("Camping"));
  assert.ok(!labels.some((label) => /rustic|aijalon/i.test(label)));
});

test("old spellings in imported text still match the right building", () => {
  const groups = getBookingCalendarGroups({ buildingsRooms: "Aijalon, Capurnum, GH" });
  assert.deepEqual(groups, ["ajalon", "capernaum", "guest-house"]);
  assert.deepEqual(getBookingCalendarGroups({ buildingsRooms: "Reserved field" }), []);
});

test("after the Housing tab is saved, removed buildings no longer count", () => {
  const booking = {
    roomName: "Bethel, Dothan",
    buildingsRooms: "Bethel: 40",
    rentalFormDetails: { lodgingBethel: "40", housingUsage: { lodgingBethel: true, lodgingDothan: false } },
  };
  assert.deepEqual(getBookingCalendarGroups(booking), ["bethel"]);
});

test("before the Housing tab is saved, imported text and counts combine", () => {
  const booking = { roomName: "Bethel, Dothan", buildingsRooms: "Bethel, Dothan", rentalFormDetails: { lodgingBethel: "30" } };
  const assignments = getBookingLodgingAssignments(booking);
  assert.deepEqual(assignments.map((entry) => entry.buildingId), ["bethel", "dothan"]);
  assert.equal(assignments[0].count, 30);
});

test("lodging is counted by night: the departure day is free", () => {
  assert.deepEqual(getLodgingNights({ startDate: "2026-06-01", endDate: "2026-06-03" }), ["2026-06-01", "2026-06-02"]);
  assert.deepEqual(getLodgingNights({ startDate: "2026-06-03", endDate: "2026-06-03" }), []);

  const groupA = { id: "a", organizationName: "Group A", startDate: "2026-06-01", endDate: "2026-06-03", rentalFormDetails: { lodgingBethel: "20" } };
  const groupB = { id: "b", organizationName: "Group B", startDate: "2026-06-03", endDate: "2026-06-05", rentalFormDetails: { lodgingBethel: "20" } };
  const nightOfJune3 = describeLodgingAvailability([groupA, groupB], "2026-06-03", "2026-06-04");
  assert.equal(groupOf(nightOfJune3, "bethel").status, "in-use");
  assert.deepEqual(groupOf(nightOfJune3, "bethel").stays.map((stay) => stay.booking.id), ["b"]);
});

test("two groups in one building is shared, not a conflict", () => {
  const groupA = { id: "a", startDate: "2026-06-01", endDate: "2026-06-03", rentalFormDetails: { lodgingBethel: "3", lodgingBethelUpperRoom1: "3" } };
  const groupB = { id: "b", startDate: "2026-06-02", endDate: "2026-06-04", rentalFormDetails: { lodgingBethel: "4", lodgingBethelUpperRoom2: "4" } };
  const result = groupOf(describeLodgingAvailability([groupA, groupB], "2026-06-01", "2026-06-04"), "bethel");
  assert.equal(result.status, "shared");
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.notes, []);
});

test("two groups in the same room on the same night is a conflict", () => {
  const groupA = { id: "a", organizationName: "A", startDate: "2026-06-01", endDate: "2026-06-03", rentalFormDetails: { lodgingBethel: "3", lodgingBethelUpperRoom1: "3" } };
  const groupB = { id: "b", organizationName: "B", startDate: "2026-06-02", endDate: "2026-06-04", rentalFormDetails: { lodgingBethel: "2", lodgingBethelUpperRoom1: "2" } };
  const result = groupOf(describeLodgingAvailability([groupA, groupB], "2026-06-01", "2026-06-04"), "bethel");
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].roomLabel, "Upper Floor Room 1");
  assert.deepEqual(result.conflicts[0].nights, ["2026-06-02"]);
});

test("missing room detail is reported as a limitation, not a conflict", () => {
  const groupA = { id: "a", organizationName: "A", startDate: "2026-06-01", endDate: "2026-06-03", buildingsRooms: "Guest House" };
  const groupB = { id: "b", organizationName: "B", startDate: "2026-06-01", endDate: "2026-06-03", buildingsRooms: "Guest House" };
  const result = groupOf(describeLodgingAvailability([groupA, groupB], "2026-06-01", "2026-06-03"), "guest-house");
  assert.equal(result.status, "shared");
  assert.equal(result.conflicts.length, 0);
  assert.match(result.notes[0], /room detail is not recorded/);
});

test("known counts above the recorded capacity are noted", () => {
  const groupA = { id: "a", startDate: "2026-06-01", endDate: "2026-06-02", rentalFormDetails: { lodgingCapernaum: "4" } };
  const groupB = { id: "b", startDate: "2026-06-01", endDate: "2026-06-02", rentalFormDetails: { lodgingCapernaum: "3" } };
  const result = groupOf(describeLodgingAvailability([groupA, groupB], "2026-06-01", "2026-06-02"), "capernaum");
  assert.ok(result.notes.some((note) => /above its recorded capacity of 5/.test(note)));
});

test("generic Hebron text lands in the Hebron group without guessing the area", () => {
  const assignments = getBookingLodgingAssignments({ buildingsRooms: "Hebron" });
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].calendarGroup, "hebron");
  assert.match(assignments[0].label, /not specified/);
});
