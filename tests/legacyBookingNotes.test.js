import test from "node:test";
import assert from "node:assert/strict";

import { getLegacyBookingNotes, isNoteTextShown } from "../src/utils/legacyBookingNotes.js";
import { bookingToDbRow, dbRowToBooking } from "../src/services/bookingMapping.js";

const labels = (notes) => notes.map((note) => note.label);

// Fictional record in the shape the pre-October 2026 Master importer saved.
const oldMasterImport = {
  sourceType: "Master 2027",
  rawSpreadsheetData: {
    "Guest Group Name": "Fictional Pines Fellowship",
    Meals: "Fri dinner thru Sun lunch\nSnack on arrival",
    Activities: "Canoe Sat 2pm",
    Schedule: "Arrive 4pm Fri, campfire 7pm",
    sourceSheet: "2027",
  },
  meals: "Fri dinner thru Sun lunch\nSnack on arrival",
  activities: "Canoe Sat 2pm",
  schedule: "Arrive 4pm Fri, campfire 7pm",
  needToKnow: "Bus parks by the lodge",
  notes: "Stage of Group: Contract sent",
};

test("old free-text meals, activities and schedule appear in their section notes", () => {
  const notes = getLegacyBookingNotes(oldMasterImport);
  assert.deepEqual(notes.meals, [
    { label: "Legacy meal information", text: "Fri dinner thru Sun lunch\nSnack on arrival" },
  ]);
  assert.deepEqual(notes.activities, [
    { label: "Legacy activity information", text: "Canoe Sat 2pm" },
    { label: "Legacy schedule information", text: "Arrive 4pm Fri, campfire 7pm" },
  ]);
  assert.deepEqual(notes.additional, []);
});

test("current Master imports already carry the text in notes, so nothing repeats", () => {
  const booking = {
    ...oldMasterImport,
    meals: "Total meals: 5 (Breakfast: 1, Lunch: 2, Dinner: 2); Fri, Jun 4, 2027: Dinner",
    rentalFormDetails: {
      importedMealText: "Fri dinner thru Sun lunch\nSnack on arrival",
      mealNotes: "Fri dinner thru Sun lunch\nSnack on arrival\nBus parks by the lodge",
      activityNotes: "Canoe Sat 2pm\nArrive 4pm Fri, campfire 7pm",
    },
  };
  assert.deepEqual(getLegacyBookingNotes(booking), { meals: [], activities: [], additional: [] });
  assert.equal(isNoteTextShown(booking.needToKnow, booking.rentalFormDetails.mealNotes), true);
});

test("after staff rewrite the notes and save, the original text stays visible once", () => {
  const imported = {
    ...oldMasterImport,
    rentalFormDetails: {
      importedMealText: oldMasterImport.meals,
      mealNotes: "Fri dinner thru Sun lunch\nSnack on arrival",
      activityNotes: "Canoe Sat 2pm\nArrive 4pm Fri, campfire 7pm",
    },
  };
  // What Create Booking writes: generated summaries and staff-edited notes.
  const saved = {
    ...imported,
    meals: "Total meals: 1 (Breakfast: 0, Lunch: 0, Dinner: 1); Fri, Jun 4, 2027: Dinner",
    activities: "2027-06-05 14:00 - Canoe",
    schedule: "Arrival: 16:00\nTotal meals: 1 (Breakfast: 0, Lunch: 0, Dinner: 1); Fri, Jun 4, 2027: Dinner",
    rentalFormDetails: {
      ...imported.rentalFormDetails,
      mealNotes: "Vegetarian option at dinner",
      activityNotes: "Lifeguard needed",
      activities: [{ date: "2027-06-05", time: "14:00", activity: "Canoe" }],
    },
  };
  const before = structuredClone(saved);
  const first = getLegacyBookingNotes(saved);

  assert.deepEqual(first.meals, [
    { label: "Legacy meal information", text: "Fri dinner thru Sun lunch\nSnack on arrival" },
  ]);
  assert.deepEqual(labels(first.activities), ["Legacy activity information", "Legacy schedule information"]);
  assert.equal(first.activities[0].text, "Canoe Sat 2pm");
  assert.equal(first.activities[1].text, "Arrive 4pm Fri, campfire 7pm");
  assert.deepEqual(saved, before, "display never changes the booking");

  // Saving and reopening goes through the database mapping; nothing is copied into notes.
  const reopened = dbRowToBooking({ ...bookingToDbRow(saved), created_at: "" });
  assert.equal(reopened.rentalFormDetails.mealNotes, "Vegetarian option at dinner");
  assert.deepEqual(getLegacyBookingNotes(reopened), first);
});

test("staff bookings made in Create Booking show no legacy notes", () => {
  const rows = [{ date: "2027-07-01", time: "10:00", activity: "Archery" }];
  const booking = {
    sourceType: "Staff Booking",
    startDate: "2027-07-01",
    endDate: "2027-07-02",
    desiredDatesText: "2027-07-01 - 2027-07-02",
    meals: "Total meals: 1 (Breakfast: 0, Lunch: 1, Dinner: 0); Thu, Jul 1, 2027: Lunch",
    activities: "2027-07-01 10:00 - Archery",
    schedule: "Arrival: 09:00\nDeparture: 15:00\nTotal meals: 1 (Breakfast: 0, Lunch: 1, Dinner: 0); Thu, Jul 1, 2027: Lunch",
    rentalFormDetails: { activities: rows, mealNotes: "Box lunch" },
  };
  assert.deepEqual(getLegacyBookingNotes(booking), { meals: [], activities: [], additional: [] });
});

test("overlapping texts keep distinct details and drop contained repeats", () => {
  const notes = getLegacyBookingNotes({
    meals: "Dinner Fri",
    rentalFormDetails: { importedMealText: "Dinner Fri, breakfast Sat", mealNotes: "Peanut-free" },
    rawSpreadsheetData: { "Meal Plan": "Dinner Fri, breakfast Sat", "Snack for arrival?": "Yes" },
  });
  assert.deepEqual(notes.meals, [
    { label: "Legacy meal information", text: "Dinner Fri, breakfast Sat\n\nSnack for arrival: Yes" },
  ]);
});

test("empty, placeholder and malformed values are ignored or made readable", () => {
  assert.doesNotThrow(() => getLegacyBookingNotes(undefined));
  assert.deepEqual(getLegacyBookingNotes({}), { meals: [], activities: [], additional: [] });

  const notes = getLegacyBookingNotes({
    meals: { richText: [{ text: "Lunch " }, { text: "Saturday" }] },
    activities: null,
    schedule: 42,
    promoCode: "-",
    desiredDatesText: "[object Object]",
    rawSpreadsheetData: "not an object",
    rentalFormDetails: ["not", "an", "object"],
  });
  assert.deepEqual(notes.meals, [{ label: "Legacy meal information", text: "Lunch Saturday" }]);
  assert.deepEqual(notes.activities, [{ label: "Legacy schedule information", text: "42" }]);
  assert.deepEqual(notes.additional, []);

  const objectCell = getLegacyBookingNotes({
    rawSpreadsheetData: { Activities: { id: "row-7", plan: "Hike", when: "Sat" } },
  });
  assert.equal(objectCell.activities[0].text, "plan: Hike\nwhen: Sat");
});

test("requested dates, promo codes and status details go to Additional Notes", () => {
  const notes = getLegacyBookingNotes({
    desiredDatesText: "June 5-7 or June 12-14",
    promoCode: "SPRING25",
    notes: "Returning group",
    rentalFormDetails: {
      sourceInquiryDesiredDatesText: "June 5-7 or June 12-14",
      depositReceivedDate: "2027-03-02",
      importedDepositStatus: "Rec'd 3/2 check #1043",
      contractSentDate: "2027-02-01",
      importedContractSentStatus: "Yes 2/1",
      contractReturnedDate: "2027-02-20",
      importedContractReturnedStatus: "February 20th, 2027",
    },
  });
  assert.deepEqual(notes.additional, [
    { label: "Originally requested dates", text: "June 5-7 or June 12-14" },
    { label: "Legacy promo code", text: "SPRING25" },
    { label: "Legacy deposit information", text: "Rec'd 3/2 check #1043" },
  ]);

  // Without a parsed date the Overview already shows the status text itself.
  const undated = getLegacyBookingNotes({
    rentalFormDetails: { importedDepositStatus: "Rec'd, check #1043" },
  });
  assert.deepEqual(undated.additional, []);
});
