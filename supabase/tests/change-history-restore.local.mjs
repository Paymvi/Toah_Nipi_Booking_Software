// Booking change history across deletes and backup restores, against a LOCAL
// Supabase stack (Docker). FICTIONAL DATA ONLY.
//
// WARNING: runs a real Full Replace, which deletes EVERY booking in the local
// database and puts back the backup it took a moment earlier. Never point it
// at a database whose bookings matter. It refuses anything but localhost.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/change-history-restore.local.mjs
//
// Needs 20261113000100_staff_app.sql and 20261117000100_booking_change_log_keep_history.sql.
// Stack recipe: docs/staff-app/IMPLEMENTATION_NOTES.md ("Local test stack").
//
// The restore steps are the ones DashboardBackups.jsx runs (handleRestore),
// through the same service functions, with the admin's signed-in client.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import { createBackupEnvelope } from "../../src/utils/backupFormat.js";
import {
  countLiveSignatures,
  fetchBackupSections,
  restoreBookingRows,
  restorePortalSnapshot,
  restoreSupportingSections,
  SUPPORTING_SECTION_KEYS,
} from "../../src/services/backupData.js";
import { dbRowToBooking } from "../../src/services/bookingMapping.js";
import { saveBookingWithClient } from "../../src/services/bookingSave.js";
import { keepRecordClassification } from "../../src/utils/bookingClassification.js";

const url = process.env.LOCAL_SUPABASE_URL || "";
const anonKey = process.env.LOCAL_ANON_KEY || "";
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY || "";
const seederKey = process.env.LOCAL_SEEDER_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !anonKey || !serviceKey || !seederKey) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY and LOCAL_SEEDER_KEY.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seed = createClient(url, seederKey, options);
const authAdmin = createClient(url, serviceKey, options);
const anon = createClient(url, anonKey, options);
const run = Date.now().toString(36);
let failures = 0;
let passes = 0;

async function check(name, body) {
  try {
    await body();
    passes += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${String(error?.stack || error?.message || error).split("\n").slice(0, 8).join("\n     ")}`);
  }
}

const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
};
const unique = (label) => `${label}-${run}-${Math.random().toString(36).slice(2, 8)}`;

async function makeAccount(label, profile) {
  const email = `${unique(label)}@example.test`;
  const password = `pw-${run}-${label}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, ...profile }));
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return { client, userId: user.id };
}

const plusDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function bookingRow(id) {
  return {
    id,
    organization_name: `Fictional ${id}`,
    source_type: "Staff Booking",
    status: "Confirmed",
    start_date: plusDays(1),
    end_date: plusDays(3),
    attendee_count: "30",
    meals: "Total meals: 1 (Breakfast: 0, Lunch: 0, Dinner: 1)",
    raw_data: { rentalFormDetails: { dinnerTime: "18:00", arrivalTime: "17:00" } },
  };
}

// The app's fetchBookings, with this script's client.
async function fetchBookingsWith(client) {
  const rows = [];
  for (;;) {
    const data = await must(client.from("bookings").select("*").order("start_date").order("id").range(rows.length, rows.length + 999));
    if (!data.length) return rows.map(dbRowToBooking);
    rows.push(...data);
  }
}

async function backupWith(client) {
  const { sections, sectionErrors } = await fetchBackupSections({ client, fetchBookings: () => fetchBookingsWith(client) });
  return createBackupEnvelope(sections, { reason: "manual", sectionErrors });
}

// DashboardBackups.jsx handleRestore, restoreMode === "replace", without the UI.
async function fullReplace(client, backup) {
  const bookingsToRestore = backup.payload.bookings;
  const originalBookings = await fetchBookingsWith(client);
  assert.equal(await countLiveSignatures(client), 0, "Full Replace refuses databases with signing records");
  const safety = await backupWith(client);
  const unreadable = SUPPORTING_SECTION_KEYS.filter((key) => key in safety.coverage.sectionErrors);
  assert.deepEqual(unreadable, [], "the safety backup reads every supporting section");

  const deleted = await must(client.from("bookings").delete().neq("id", "__never__").select("id"));
  assert.ok(deleted.length >= originalBookings.length, "every booking was deleted");

  const liveById = new Map(originalBookings.map((booking) => [String(booking.id), booking]));
  const classified = bookingsToRestore.map((booking) => keepRecordClassification(booking, liveById.get(String(booking.id))));
  await restoreBookingRows(classified, new Set(), { client });
  await restorePortalSnapshot(safety.payload, bookingsToRestore.map((booking) => booking.id), { client });
  const supporting = await restoreSupportingSections(backup.payload, { client });

  const after = await fetchBookingsWith(client);
  assert.deepEqual(after.map((b) => b.id).sort(), bookingsToRestore.map((b) => b.id).sort(), "restore verification");
  return supporting;
}

const logFor = (bookingId) =>
  must(seed.from("booking_change_log").select("*").eq("booking_id", bookingId).order("id"));
async function logCount() {
  const { count, error } = await seed.from("booking_change_log").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count;
}

/* ---------- Run ---------- */

const admin = await makeAccount("admin", { role: "admin", is_active: true });
const staff = await makeAccount("staff", { role: "staff", is_active: true });
const viewer = await makeAccount("viewer", { role: "viewer", is_active: true });
const kitchen = await makeAccount("kitchen", { role: "limited", departments: ["kitchen"], is_active: true });

const ids = { kept: unique("kept"), deleted: unique("deleted") };
await must(seed.from("bookings").insert([bookingRow(ids.kept), bookingRow(ids.deleted)]));

// History through the app's own save path, as a signed-in office account.
for (const id of Object.values(ids)) {
  const booking = dbRowToBooking(await must(seed.from("bookings").select("*").eq("id", id).single()));
  await saveBookingWithClient(staff.client, {
    ...booking,
    attendeeCount: "34",
    rentalFormDetails: { ...booking.rentalFormDetails, dinnerTime: "18:30" },
  });
}
const original = await logFor(ids.kept);

await check("an office save records history for the test bookings", async () => {
  assert.deepEqual(original.map((row) => row.field).sort(), ["attendeeCount", "dinnerTime"]);
  assert.ok(original.every((row) => row.actor_id === staff.userId));
});

const backup = await backupWith(admin.client);

await check("a backup holds the booking change history (version 4)", async () => {
  assert.equal(backup.schemaVersion, 4);
  assert.deepEqual(backup.coverage.sectionErrors, {});
  const mine = backup.payload.bookingChangeLog.filter((row) => row.booking_id === ids.kept);
  assert.deepEqual(mine.map((row) => row.id), original.map((row) => row.id));
});

await check("Full Replace keeps the original history attached to the restored booking", async () => {
  const totalBefore = await logCount();
  const supporting = await fullReplace(admin.client, backup);

  assert.deepEqual(await logFor(ids.kept), original, "same rows, same ids, same values");
  assert.equal(await logCount(), totalBefore, "deleting and re-inserting identical bookings logs nothing new");
  assert.equal(supporting.bookingChangeLog.inserted, 0, "history already present is not duplicated");
  assert.equal(supporting.bookingChangeLog.alreadyPresent, backup.payload.bookingChangeLog.length);

  const seen = (await must(kitchen.client.rpc("staff_app_booking", { p_id: ids.kept }))).booking;
  assert.deepEqual(seen.changes.map((change) => change.field).sort(), ["attendeeCount", "dinnerTime"]);
  assert.equal(seen.changes.find((change) => change.field === "dinnerTime").by, "Fictional staff");
});

await check("a Merge restore of identical bookings logs no changes", async () => {
  const totalBefore = await logCount();
  const live = await fetchBookingsWith(admin.client);
  await restoreBookingRows(backup.payload.bookings, new Set(live.map((booking) => booking.id)), { client: admin.client });
  assert.equal(await logCount(), totalBefore);
});

await check("restoring into a database without the history puts it back once, with original ids", async () => {
  await must(seed.from("booking_change_log").delete().eq("booking_id", ids.kept));
  assert.equal((await logFor(ids.kept)).length, 0);

  const first = await restoreSupportingSections(backup.payload, { client: admin.client });
  assert.equal(first.bookingChangeLog.inserted, original.length);
  assert.deepEqual(await logFor(ids.kept), original);

  const second = await restoreSupportingSections(backup.payload, { client: admin.client });
  assert.equal(second.bookingChangeLog.inserted, 0, "a repeated import adds nothing");
  assert.deepEqual(await logFor(ids.kept), original);
});

await check("an id already taken by another row gets a new id, and new saves never reuse restored ids", async () => {
  const row = original.find((entry) => entry.field === "dinnerTime");
  await must(seed.from("booking_change_log").delete().eq("id", row.id));
  const takenId = (await must(seed.from("booking_change_log").select("id").neq("booking_id", ids.kept).limit(1)))[0]?.id;
  assert.ok(takenId, "some other history row exists to collide with");
  const moved = { ...row, id: takenId };
  const result = await must(admin.client.rpc("staff_app_restore_change_log", { p_rows: [moved] }));
  assert.equal(result.inserted, 1);
  const restored = (await logFor(ids.kept)).find((entry) => entry.field === "dinnerTime");
  assert.notEqual(restored.id, takenId);
  assert.equal(restored.changed_at, row.changed_at);

  const maxBefore = Math.max(...(await must(seed.from("booking_change_log").select("id").order("id", { ascending: false }).limit(1))).map((r) => r.id));
  const booking = dbRowToBooking(await must(seed.from("bookings").select("*").eq("id", ids.kept).single()));
  await saveBookingWithClient(staff.client, { ...booking, attendeeCount: "35" });
  const newest = (await logFor(ids.kept)).at(-1);
  assert.ok(newest.id > maxBefore, "the identity sequence moved past restored ids");
});

await check("only administrators can restore history", async () => {
  const payload = { p_rows: [{ booking_id: ids.kept, field: "fake", changed_at: new Date().toISOString(), new_value: "x" }] };
  for (const client of [staff.client, viewer.client, kitchen.client, anon]) {
    const { error } = await client.rpc("staff_app_restore_change_log", payload);
    assert.ok(error, "refused");
  }
  assert.ok(!(await logFor(ids.kept)).some((row) => row.field === "fake"));
});

await check("deleting a booking keeps its history, readable by office accounts only", async () => {
  const before = await logFor(ids.deleted);
  assert.ok(before.length > 0);
  const removed = await must(admin.client.from("bookings").delete().eq("id", ids.deleted).select("id"));
  assert.equal(removed.length, 1);

  assert.deepEqual(await logFor(ids.deleted), before);
  const viewerRows = await must(viewer.client.from("booking_change_log").select("id").eq("booking_id", ids.deleted));
  assert.equal(viewerRows.length, before.length);
  const limitedRows = await kitchen.client.from("booking_change_log").select("id").eq("booking_id", ids.deleted);
  assert.ok(limitedRows.error || limitedRows.data.length === 0);
  const seen = await must(kitchen.client.rpc("staff_app_booking", { p_id: ids.deleted }));
  assert.equal(seen.booking, null, "the staff app shows nothing for a deleted booking");
});

// Clean up this run's fixtures (the Full Replace left the other bookings as they were).
await seed.from("bookings").delete().in("id", Object.values(ids));
await seed.from("booking_change_log").delete().in("booking_id", Object.values(ids));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
