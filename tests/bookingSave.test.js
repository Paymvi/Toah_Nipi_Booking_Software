import test from "node:test";
import assert from "node:assert/strict";

import {
  bookingToDbRow,
  dbRowToBooking,
  normalizeActivitiesColumn,
} from "../src/services/bookingMapping.js";
import {
  getBookingSaveErrorMessage,
  saveBookingWithClient,
} from "../src/services/bookingSave.js";
import { createSerialBookingSaver } from "../src/utils/serialBookingSaver.js";

/*
  In-memory stand-in for the bookings table that applies PostgREST filters
  the way the database does: an update only touches rows matching every
  filter, and the update trigger moves updated_at forward.
*/
function createFakeBookingsClient(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.id, { ...row }]));
  let clock = 0;
  const nextTimestamp = () => `2026-10-28T12:00:00.${String(++clock).padStart(6, "0")}+00:00`;
  const calls = [];

  function from(table) {
    assert.equal(table, "bookings");
    const filters = [];
    let operation = null;
    let payload = null;

    const builder = {
      insert(row) { operation = "insert"; payload = row; return builder; },
      update(changes) { operation = "update"; payload = changes; return builder; },
      select() { if (!operation) operation = "select"; return builder; },
      eq(column, value) { filters.push([column, value]); return builder; },
      limit() { return builder; },
      single() { builder.wantSingle = true; return builder; },
      then(resolve, reject) {
        try { resolve(execute()); } catch (error) { reject(error); }
      },
    };

    function matches(row) {
      return filters.every(([column, value]) => String(row[column]) === String(value));
    }

    function execute() {
      calls.push({ operation, filters: [...filters] });
      if (operation === "insert") {
        if (rows.has(payload.id)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const stored = { ...payload, created_at: nextTimestamp(), updated_at: nextTimestamp() };
        rows.set(payload.id, stored);
        return { data: builder.wantSingle ? { ...stored } : [{ ...stored }], error: null };
      }
      if (operation === "update") {
        const updated = [];
        rows.forEach((row, id) => {
          if (matches(row)) {
            const stored = { ...row, ...payload, id, created_at: row.created_at, updated_at: nextTimestamp() };
            rows.set(id, stored);
            updated.push({ ...stored });
          }
        });
        return { data: updated, error: null };
      }
      return { data: [...rows.values()].filter(matches).map((row) => ({ ...row })), error: null };
    }

    return builder;
  }

  return { from, rows, calls };
}

function seedRow(overrides = {}) {
  return {
    ...bookingToDbRow({ id: "b1", organizationName: "Camp A", notes: "original", ...overrides }),
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-10-01T00:00:00.000001+00:00",
    portal_token: "token-abc",
  };
}

test("a save based on the latest version succeeds and keeps metadata", async () => {
  const client = createFakeBookingsClient([seedRow()]);
  const loaded = dbRowToBooking(client.rows.get("b1"));
  assert.equal(loaded.createdAt, "2026-01-01T00:00:00+00:00");

  const saved = await saveBookingWithClient(client, { ...loaded, notes: "edited" });
  assert.equal(saved.notes, "edited");
  assert.equal(saved.portalToken, "token-abc");
  assert.equal(saved.createdAt, "2026-01-01T00:00:00+00:00");
  assert.notEqual(saved.updatedAt, loaded.updatedAt);
});

test("a second editor working from an older copy is refused, not merged", async () => {
  const client = createFakeBookingsClient([seedRow()]);
  const editorA = dbRowToBooking(client.rows.get("b1"));
  const editorB = dbRowToBooking(client.rows.get("b1"));

  await saveBookingWithClient(client, { ...editorA, notes: "housing changed by A" });

  await assert.rejects(
    saveBookingWithClient(client, { ...editorB, notes: "note by B" }),
    (error) => {
      assert.equal(error.code, "BOOKING_CONFLICT");
      assert.equal(error.latest.notes, "housing changed by A");
      assert.match(getBookingSaveErrorMessage(error), /still on this screen/);
      return true;
    }
  );
  assert.equal(client.rows.get("b1").notes, "housing changed by A");
});

test("updates never write portal_token or created_at", async () => {
  const client = createFakeBookingsClient([seedRow()]);
  const loaded = dbRowToBooking(client.rows.get("b1"));
  await saveBookingWithClient(client, { ...loaded, portalToken: "tampered", createdAt: "1999-01-01" });
  assert.equal(client.rows.get("b1").portal_token, "token-abc");
  assert.equal(client.rows.get("b1").created_at, "2026-01-01T00:00:00+00:00");
});

test("a deleted booking reports not found", async () => {
  const client = createFakeBookingsClient([seedRow()]);
  const loaded = dbRowToBooking(client.rows.get("b1"));
  client.rows.delete("b1");
  await assert.rejects(saveBookingWithClient(client, loaded), { code: "BOOKING_NOT_FOUND" });
});

test("a new booking is inserted, and a duplicate id is refused", async () => {
  const client = createFakeBookingsClient();
  const saved = await saveBookingWithClient(client, { id: "new-1", organizationName: "Group" });
  assert.equal(saved.id, "new-1");
  await assert.rejects(
    saveBookingWithClient(client, { id: "new-1", organizationName: "Again" }),
    { code: "BOOKING_CONFLICT" }
  );
});

test("fields survive save and reload", async () => {
  const client = createFakeBookingsClient();
  const original = {
    id: "rt-1",
    organizationName: "Round Trip Church",
    contactName: "Pat",
    startDate: "2027-06-18",
    endDate: "2027-06-20",
    attendeeCount: "40-50",
    inquiryDisposition: "Waitlist",
    firstName: "Pat",
    lastName: "Lee",
    linenPieces: "12",
    facilities: [{ date: "2027-06-18", task: "Set chairs", assignedTo: "Sam" }],
    activities: [{ date: "2027-06-18", time: "19:00", activity: "Fire pit" }],
    checklists: [{ id: "c1", name: "Prep", items: [] }],
    programLogisticsAssignments: [{ id: "a1", role: "Meals", assignedTo: "Sam" }],
    rentalFormDetails: {
      activities: [{ date: "2027-06-18", time: "19:00", activity: "Fire pit" }],
      staffEditedFields: { notes: "2026-10-28T00:00:00.000Z" },
    },
  };
  const saved = await saveBookingWithClient(client, original);
  const reloaded = dbRowToBooking(client.rows.get("rt-1"));

  for (const key of ["organizationName", "contactName", "startDate", "endDate", "attendeeCount",
    "inquiryDisposition", "firstName", "lastName", "linenPieces"]) {
    assert.equal(reloaded[key], original[key], key);
  }
  assert.deepEqual(reloaded.facilities, original.facilities);
  assert.deepEqual(reloaded.checklists, original.checklists);
  assert.deepEqual(reloaded.programLogisticsAssignments, original.programLogisticsAssignments);
  assert.deepEqual(reloaded.rentalFormDetails, original.rentalFormDetails);
  assert.equal(reloaded.activities, "2027-06-18 19:00 - Fire pit");
  assert.equal(typeof client.rows.get("rt-1").activities, "string");
  assert.ok(saved.createdAt);
  assert.equal(client.rows.get("rt-1").raw_data.updatedAt, undefined);
});

test("JSON activity text from older saves reads back as a summary", () => {
  const json = JSON.stringify([{ date: "2026-09-18", time: "19:00", activity: "Fire pit" }]);
  assert.equal(normalizeActivitiesColumn(json), "2026-09-18 19:00 - Fire pit");
  assert.equal(normalizeActivitiesColumn("Hike Saturday"), "Hike Saturday");
  assert.equal(normalizeActivitiesColumn("[note] bring flashlights"), "[note] bring flashlights");
});

test("rapid checklist changes build on each other", async () => {
  const client = createFakeBookingsClient([seedRow({ checklists: [] })]);
  let screenBooking = dbRowToBooking(client.rows.get("b1"));
  const saver = createSerialBookingSaver({
    getBooking: () => screenBooking,
    save: async (next) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const saved = await saveBookingWithClient(client, next);
      // The screen re-renders a little later than the save resolves.
      setTimeout(() => { screenBooking = saved; }, 20);
      return saved;
    },
  });

  const tick = (itemId) => (booking) => ({
    ...booking,
    checklists: [...(booking.checklists || []), { id: itemId, completed: true }],
  });

  await Promise.all([saver.enqueue(tick("A")), saver.enqueue(tick("B"))]);
  const stored = dbRowToBooking(client.rows.get("b1"));
  assert.deepEqual(stored.checklists.map((item) => item.id), ["A", "B"]);
});

test("a failed queued save does not poison later saves", async () => {
  const client = createFakeBookingsClient([seedRow({ checklists: [] })]);
  let screenBooking = dbRowToBooking(client.rows.get("b1"));
  let failNext = true;
  const saver = createSerialBookingSaver({
    getBooking: () => screenBooking,
    save: async (next) => {
      if (failNext) { failNext = false; throw new Error("network"); }
      const saved = await saveBookingWithClient(client, next);
      screenBooking = saved;
      return saved;
    },
  });
  await assert.rejects(saver.enqueue((b) => ({ ...b, notes: "first" })));
  await saver.enqueue((b) => ({ ...b, notes: "second" }));
  assert.equal(client.rows.get("b1").notes, "second");
  assert.equal(saver.isBusy(), false);
});
