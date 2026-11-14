import test from "node:test";
import assert from "node:assert/strict";

import { getStaffBuildings } from "../src/utils/staffAppFormat.js";

// Shaped like a staff_app_bookings record (fictional).
const booking = (details = {}, extra = {}) => ({ rentalFormDetails: details, buildingsRooms: "", roomName: "", ...extra });
const labels = (result) => result.buildings.map((entry) => entry.label);

test("Housing tab values: every building, in building order, with its calendar colour group", () => {
  const result = getStaffBuildings(booking(
    {
      lodgingBethel: "24", lodgingHebronThird: "14", lodgingHebronBunks: "30", lodgingAjalon: "10",
      lodgingCapernaum: "8", lodgingCamping: "10",
      housingUsage: { lodgingBethel: true, lodgingHebronThird: true, lodgingHebronBunks: true, lodgingAjalon: true, lodgingCapernaum: true, lodgingCamping: true },
    },
    { buildingsRooms: "Bethel: 24; Hebron 3rd Floor: 14; Hebron Bunks: 30; Ajalon: 10; Capernaum: 8; Camping: 10" }
  ));
  assert.equal(result.status, "assigned");
  assert.deepEqual(labels(result), ["Bethel", "Hebron 3rd Floor", "Hebron Bunks", "Ajalon", "Capernaum", "Camping"]);
  assert.deepEqual(result.buildings.map((entry) => entry.group), ["bethel", "hebron", "hebron", "ajalon", "capernaum", "camping"]);
});

test("a single saved building", () => {
  const result = getStaffBuildings(booking({ lodgingDothan: "16", housingUsage: { lodgingDothan: true } }, { buildingsRooms: "Dothan: 16" }));
  assert.deepEqual(labels(result), ["Dothan"]);
});

test("imported text is read for bookings the Housing tab never saved", () => {
  assert.deepEqual(labels(getStaffBuildings(booking({}, { buildingsRooms: "Guest House" }))), ["Guest House"]);
  assert.deepEqual(labels(getStaffBuildings(booking({}, { buildingsRooms: "Bethel: 20; Dothan: 22" }))), ["Bethel", "Dothan"]);
});

test("recorded text that names no known building is shown as written, not dropped", () => {
  const result = getStaffBuildings(booking({}, { buildingsRooms: "Overflow cabins TBD" }));
  assert.equal(result.status, "text");
  assert.deepEqual(labels(result), ["Overflow cabins TBD"]);
});

test("nothing recorded: overnight stays say not assigned; day use and internal use need no label", () => {
  assert.equal(getStaffBuildings(booking({}, { roomName: "Unassigned" })).status, "unassigned");
  assert.equal(getStaffBuildings(booking({ numberOfNights: "2" })).status, "unassigned");
  assert.equal(getStaffBuildings(booking({ numberOfNights: "0" })).status, "none");
  assert.equal(getStaffBuildings(booking({}, { kind: "internal" })).status, "none");
  assert.deepEqual(getStaffBuildings(booking({ numberOfNights: "0" })).buildings, []);
});

test("Housing tab saved with nothing ticked: not assigned, stale imported text ignored", () => {
  const result = getStaffBuildings(booking({ housingUsage: {} }, { buildingsRooms: "" , roomName: "Bethel" }));
  assert.equal(result.status, "unassigned");
});
