// Staff app access and change history against a LOCAL Supabase stack (Docker).
// FICTIONAL DATA ONLY. Every request goes through the real REST API as each
// kind of account, the way a curious user with the browser key could.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/staff-app.local.mjs
//
// Stack recipe: docs/staff-app/IMPLEMENTATION_NOTES.md ("Local test stack").
// LOCAL_SEEDER_KEY is a fixture role (BYPASSRLS) so service_role keeps live grants.
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import { dbRowToBooking } from "../../src/services/bookingMapping.js";
import { getRecordKind, isActiveBooking, isClearlyCancelled, isHostRecord, RECORD_KIND } from "../../src/utils/bookingClassification.js";

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
    console.log(`FAIL ${name}\n     ${String(error?.message || error).split("\n").slice(0, 8).join("\n     ")}`);
  }
}

const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
};
const unique = (label) => `${label}-${run}-${Math.random().toString(36).slice(2, 8)}`;

/* ---------- Accounts ---------- */

async function signedIn(email, password) {
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return client;
}

async function makeAccount(label, profile) {
  const email = `${unique(label)}@example.test`;
  const password = `pw-${run}-${label}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (profile) {
    await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, ...profile }));
  }
  return { client: await signedIn(email, password), userId: user.id, email, password };
}

/* ---------- Fixtures ---------- */

const SECRET = {
  contact: `Secret Contact ${run}`,
  email: `secret-${run}@example.test`,
  phone: "555-0100-SECRET",
  notes: `PRIVATE NOTE ${run}`,
  rate: "123.45",
  deposit: "DEPOSIT-SECRET",
  lodgingCost: "9999.01",
  rawContact: `RAW CONTACT ${run}`,
  needToKnow: `NEED TO KNOW OFFICE ${run}`,
};

const today = new Date().toISOString().slice(0, 10);
const plusDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function bookingRow(id, overrides = {}, details = {}) {
  return {
    id,
    organization_name: `Fictional ${id}`,
    source_type: "Staff Booking",
    status: "Confirmed",
    start_date: plusDays(1),
    end_date: plusDays(3),
    attendee_count: "42",
    contact_name: SECRET.contact,
    email: SECRET.email,
    phone: SECRET.phone,
    notes: SECRET.notes,
    guest_rate: SECRET.rate,
    deposit: SECRET.deposit,
    need_to_know: SECRET.needToKnow,
    meals: "Total meals: 1 (Breakfast: 0, Lunch: 0, Dinner: 1); Dinner time: 18:00",
    food_allergies: "1 - Tree nut allergy; 3 - Gluten free; Additional notes: Severity not confirmed.",
    buildings_rooms: "Bethel: 20; Dothan: 22",
    raw_data: {
      contactName: SECRET.rawContact,
      email: SECRET.email,
      guestRate: SECRET.rate,
      rawSpreadsheetData: { Meals: "Fri dinner", "Contact Phone": SECRET.phone, "Deposit Rec'd": SECRET.deposit },
      rentalFormDetails: {
        arrivalTime: "17:30",
        departureTime: "13:00",
        dinnerTime: "18:00",
        mealNotes: "Coffee out by 7:30.",
        approxTotalGuests: "40",
        actualAdultGuests: "42",
        lodgingBethel: "20",
        lodgingDothan: "22",
        lodgingCost: SECRET.lodgingCost,
        adultRateQuoted: SECRET.rate,
        depositAmount: SECRET.deposit,
        secondaryContactEmail: SECRET.email,
        mealSchedule: { [plusDays(1)]: { dinner: true }, [plusDays(2)]: { breakfast: true, lunch: true, dinner: true, injected: SECRET.notes } },
        activities: [{ date: plusDays(2), time: "10:00", activity: "Hike", privateField: SECRET.notes }],
        facilities: [{ date: plusDays(1), time: "16:00", task: "Projector in Bethel", assignedTo: "Fictional Maintenance", notes: "Bring cable", completedBy: SECRET.contact }],
        ...details,
      },
    },
    ...overrides,
  };
}

const ids = {
  guest: unique("guest"),
  hostingHidden: unique("host-hidden"),
  hostingKitchen: unique("host-kitchen"),
  cancelled: unique("cancelled"),
  inquiry: unique("inquiry"),
  waitlist: unique("waitlist"),
  archive: unique("archive"),
};

/* ---------- Run ---------- */

const office = {
  admin: await makeAccount("admin", { role: "admin", is_active: true }),
  staff: await makeAccount("staff", { role: "staff", is_active: true }),
  viewer: await makeAccount("viewer", { role: "viewer", is_active: true }),
};
const limited = await makeAccount("limited", { role: "limited", departments: [], is_active: true });
const kitchen = await makeAccount("kitchen", { role: "limited", departments: ["kitchen"], is_active: true });
const inactive = await makeAccount("inactive", { role: "limited", departments: ["kitchen"], is_active: false });
const stranger = await makeAccount("stranger", null);
const unassigned = await makeAccount("unassigned", null);

await must(seed.from("bookings").insert([
  bookingRow(ids.guest),
  bookingRow(ids.hostingHidden, { organization_name: "Host: Fictional Board Dinner", retreat_type: "Hosting" }),
  bookingRow(ids.hostingKitchen, { organization_name: "Host: Fictional Staff Lunch", retreat_type: "Hosting", attendee_count: "8" }, { kitchenInternalMeals: true }),
  bookingRow(ids.cancelled, { status: "Cancelled" }),
  bookingRow(ids.inquiry, { source_type: "Guest Group Inquiry 2026", status: "Inquiry" }),
  bookingRow(ids.waitlist, { status: "Waitlist", waitlist: "Yes" }),
  bookingRow(ids.archive, { source_type: "Archive" }),
]));
await must(seed.from("portal_checklist_items").insert({
  booking_id: ids.guest, item_id: "guest-count", title: "Confirm final guest counts", guest_action: "mark_ready", status: "completed",
}));
const storagePath = `fixture-${run}/staff-documents/x/plan.pdf`;
await must(seed.storage.from("portal-uploads").upload(storagePath, new Blob(["%PDF-1.4 fictional"], { type: "application/pdf" }), { contentType: "application/pdf" }));

const rpc = (client, name, args) => client.rpc(name, args);
const range = { p_from: today, p_to: plusDays(10) };
const idsIn = (payload) => payload.bookings.map((booking) => booking.id).filter((id) => Object.values(ids).includes(id)).sort();

/* 1. Direct table reads and writes are closed to limited accounts. */

const officeTables = ["bookings", "guest_inquiries", "portal_checklist_items", "portal_documents", "portal_email_messages",
  "portal_email_bookings", "portal_email_recipients", "portal_email_settings", "portal_email_templates", "inquiry_hidden",
  "staff_directory", "contact_hidden", "contact_stars", "portal_removed_uploads", "portal_signatures", "portal_signing_settings", "booking_change_log"];

for (const [label, account] of [["limited", limited], ["kitchen", kitchen], ["inactive", inactive], ["stranger", stranger]]) {
  await check(`${label}: reads no office table rows through the API`, async () => {
    for (const table of officeTables) {
      const { data, error } = await account.client.from(table).select("*").limit(5);
      assert.ok(error || data.length === 0, `${table} returned ${data?.length} rows`);
    }
  });
}

await check("limited: cannot update, insert or delete bookings", async () => {
  await limited.client.from("bookings").update({ organization_name: "Hacked", notes: "x" }).eq("id", ids.guest);
  await limited.client.from("bookings").delete().eq("id", ids.guest);
  const insert = await limited.client.from("bookings").insert({ id: unique("evil"), organization_name: "Evil" });
  assert.ok(insert.error, "insert should fail");
  const row = await must(seed.from("bookings").select("organization_name, notes").eq("id", ids.guest).single());
  assert.equal(row.organization_name, `Fictional ${ids.guest}`);
  assert.equal(row.notes, SECRET.notes);
});

await check("limited: reads only its own staff profile and cannot raise its own role", async () => {
  const rows = await must(limited.client.from("staff_profiles").select("user_id, role"));
  assert.deepEqual(rows.map((row) => row.user_id), [limited.userId]);
  await limited.client.from("staff_profiles").update({ role: "admin", departments: ["kitchen"] }).eq("user_id", limited.userId);
  const after = await must(seed.from("staff_profiles").select("role, departments").eq("user_id", limited.userId).single());
  assert.equal(after.role, "limited");
  assert.deepEqual(after.departments, []);
});

await check("limited: cannot download portal files from storage", async () => {
  const { data, error } = await kitchen.client.storage.from("portal-uploads").download(storagePath);
  assert.ok(error || !data, "download should fail");
  const signed = await kitchen.client.storage.from("portal-uploads").createSignedUrl(storagePath, 60);
  assert.ok(signed.error, "signed URL should fail");
});

await check("limited: internal helpers and admin functions are refused", async () => {
  for (const [name, args] of [
    ["staff_app_admin_list", {}],
    ["staff_app_admin_set_access", { p_email: limited.email, p_full_name: "x", p_role: "admin", p_departments: [], p_is_active: true }],
    ["staff_app_record_kind", { b: {} }],
    ["staff_app_operational_values", { b: {} }],
    ["portal_restore_signatures", { p_rows: [] }],
  ]) {
    const { error } = await rpc(kitchen.client, name, args);
    assert.ok(error, `${name} should fail`);
  }
  const after = await must(seed.from("staff_profiles").select("role").eq("user_id", limited.userId).single());
  assert.equal(after.role, "limited");
});

/* 2. The staff app functions: who, which bookings, which fields. */

await check("staff_app_me reports access per account", async () => {
  assert.equal((await must(rpc(limited.client, "staff_app_me"))).access, "limited");
  const kitchenMe = await must(rpc(kitchen.client, "staff_app_me"));
  assert.equal(kitchenMe.access, "limited");
  assert.deepEqual(kitchenMe.departments, ["kitchen"]);
  assert.equal(kitchenMe.canSeeDietary, true);
  assert.equal((await must(rpc(office.viewer.client, "staff_app_me"))).access, "office");
  assert.equal((await must(rpc(inactive.client, "staff_app_me"))).access, null);
  assert.equal((await must(rpc(stranger.client, "staff_app_me"))).access, null);
});

await check("inactive, profile-less and anonymous callers get no bookings", async () => {
  for (const client of [inactive.client, stranger.client]) {
    const { error } = await rpc(client, "staff_app_bookings", range);
    assert.match(String(error?.message), /does not have staff app access/);
  }
  const { error } = await rpc(anon, "staff_app_bookings", range);
  assert.ok(error, "anon must not execute");
  const single = await rpc(stranger.client, "staff_app_booking", { p_id: ids.guest });
  assert.ok(single.error);
});

await check("only active bookings and opted-in internal meals are listed", async () => {
  const payload = await must(rpc(limited.client, "staff_app_bookings", range));
  assert.deepEqual(idsIn(payload), [ids.guest, ids.hostingKitchen].sort());
  const internal = payload.bookings.find((booking) => booking.id === ids.hostingKitchen);
  assert.equal(internal.kind, "internal");
  for (const hidden of [ids.hostingHidden, ids.cancelled, ids.inquiry, ids.waitlist, ids.archive]) {
    const single = await must(rpc(limited.client, "staff_app_booking", { p_id: hidden }));
    assert.equal(single.booking, null, `${hidden} must not be readable by id`);
  }
});

const ALLOWED_KEYS = ["activities", "attendeeCount", "buildingsRooms", "changes", "endDate", "facilities", "foodAllergies",
  "guestCountConfirmed", "guestCountConfirmedAt", "id", "kind", "lastChangedAt", "mealCount", "meals", "organizationName",
  "persons", "rawSpreadsheetData", "rentalFormDetails", "retreatType", "roomName", "sourceType", "startDate", "updatedAt"];

await check("responses are an explicit allowlist with no sensitive values anywhere", async () => {
  for (const account of [limited, kitchen, office.viewer]) {
    const payload = await must(rpc(account.client, "staff_app_bookings", range));
    const booking = payload.bookings.find((entry) => entry.id === ids.guest);
    assert.deepEqual(Object.keys(booking).sort(), ALLOWED_KEYS);
    const text = JSON.stringify(payload);
    for (const [name, value] of Object.entries(SECRET)) {
      assert.ok(!text.includes(value), `${name} leaked`);
    }
    assert.ok(!/portal_?token|lodgingCost|adultRateQuoted|depositAmount|secondaryContact|completedBy|privateField|injected/i.test(text));
    assert.deepEqual(booking.rawSpreadsheetData, { Meals: "Fri dinner" });
    assert.deepEqual(Object.keys(booking.facilities[0]).sort(), ["assignedTo", "date", "notes", "task", "time"]);
    assert.deepEqual(Object.keys(booking.rentalFormDetails.activities[0]).sort(), ["activity", "date", "time"]);
    assert.deepEqual(booking.rentalFormDetails.mealSchedule[plusDays(2)], { breakfast: true, lunch: true, dinner: true });
    assert.equal(booking.guestCountConfirmed, true);
  }
});

await check("dietary text reaches kitchen and office accounts only", async () => {
  const plain = await must(rpc(limited.client, "staff_app_bookings", range));
  assert.equal(plain.canSeeDietary, false);
  assert.equal(plain.bookings.find((entry) => entry.id === ids.guest).foodAllergies, null);
  const cook = await must(rpc(kitchen.client, "staff_app_bookings", range));
  assert.match(cook.bookings.find((entry) => entry.id === ids.guest).foodAllergies, /Tree nut allergy/);
  const viewer = await must(rpc(office.viewer.client, "staff_app_bookings", range));
  assert.match(viewer.bookings.find((entry) => entry.id === ids.guest).foodAllergies, /Tree nut allergy/);
});

await check("date range is validated server-side", async () => {
  const tooLong = await rpc(limited.client, "staff_app_bookings", { p_from: today, p_to: plusDays(200) });
  assert.match(String(tooLong.error?.message), /up to 120 days/);
  const backwards = await rpc(limited.client, "staff_app_bookings", { p_from: plusDays(5), p_to: today });
  assert.ok(backwards.error);
});

await check("date boundaries: a stay is listed on its first and last day only", async () => {
  const lastDay = await must(rpc(limited.client, "staff_app_bookings", { p_from: plusDays(3), p_to: plusDays(3) }));
  assert.ok(idsIn(lastDay).includes(ids.guest));
  const after = await must(rpc(limited.client, "staff_app_bookings", { p_from: plusDays(4), p_to: plusDays(6) }));
  assert.ok(!idsIn(after).includes(ids.guest));
  const before = await must(rpc(limited.client, "staff_app_bookings", { p_from: today, p_to: today }));
  assert.ok(!idsIn(before).includes(ids.guest));
});

/* 2b. The server's "which bookings show" rule matches the app's classification. */

// Staff app rule in app terms: active ordinary bookings, plus hosting the office opted into kitchen planning.
function appShows(booking) {
  if (isHostRecord(booking)) {
    return !isClearlyCancelled(booking) && booking.rentalFormDetails?.kitchenInternalMeals === true;
  }
  return isActiveBooking(booking) && getRecordKind(booking) === RECORD_KIND.BOOKING;
}

await check("server classification agrees with the app for every combination", async () => {
  const sources = [null, "", "Form", "Staff Booking", "Master 2026", "Guest Group Inquiry 2026", "Archive", "Imported"];
  const sheets = [null, "Master 2027", "Guest Group Inquiries"];
  const statuses = [null, "", "Inquiry", "Confirmed", "Cancelled", "Waitlist", "Archived", "Contract Sent"];
  const extras = [
    {},
    { waitlist: "Yes" },
    { date_of_cancellation: "2026-03-01" },
    { date_of_cancellation: "2026-03-01", reinstated: true },
    { date_of_cancellation: "N/A" },
    { sourceInquiryId: "inq-1" },
    { organization_name: "Host: Fictional Board" },
    { retreat_type: "Hosting", kitchen: true },
    { organization_name: "Hosting - Fictional Lunch", kitchen: "true" },
    { organization_name: "Hostel Youth (fictional)" },
  ];
  const rows = [];
  for (const source of sources) for (const sheet of sheets) for (const status of statuses) for (const extra of extras) {
    const details = {};
    if (extra.reinstated) details.reinstatedAt = "2026-04-01T00:00:00Z";
    if (extra.sourceInquiryId) details.sourceInquiryId = extra.sourceInquiryId;
    if (extra.kitchen !== undefined) details.kitchenInternalMeals = extra.kitchen;
    rows.push({
      id: unique("kind"),
      organization_name: extra.organization_name || "Fictional Parity Group",
      retreat_type: extra.retreat_type || "Church",
      source_type: source,
      source_sheet: sheet,
      status,
      waitlist: extra.waitlist || "No",
      date_of_cancellation: extra.date_of_cancellation || null,
      start_date: plusDays(30),
      end_date: plusDays(31),
      raw_data: { rentalFormDetails: details },
    });
  }
  for (let index = 0; index < rows.length; index += 500) {
    await must(seed.from("bookings").insert(rows.slice(index, index + 500)));
  }
  const listed = new Set((await must(rpc(office.viewer.client, "staff_app_bookings", { p_from: plusDays(30), p_to: plusDays(30) })))
    .bookings.map((booking) => booking.id));
  const mismatches = rows.filter((row) => listed.has(row.id) !== appShows(dbRowToBooking(row)));
  for (let index = 0; index < rows.length; index += 200) {
    await must(seed.from("bookings").delete().in("id", rows.slice(index, index + 200).map((row) => row.id)));
  }
  assert.equal(mismatches.length, 0, `${mismatches.length} of ${rows.length} differ, e.g. ${JSON.stringify(mismatches.slice(0, 3))}`);
  assert.ok(listed.size > 10 && listed.size < rows.length, "the matrix covers both outcomes");
});

/* 3. Change history. */

const logRows = async (bookingId) =>
  must(seed.from("booking_change_log").select("*").eq("booking_id", bookingId).order("id"));

await check("an office save records operational changes with the signed-in actor only", async () => {
  const current = await must(seed.from("bookings").select("raw_data").eq("id", ids.guest).single());
  const rawData = structuredClone(current.raw_data);
  rawData.rentalFormDetails.dinnerTime = "18:30";
  rawData.rentalFormDetails.lodgingCost = "1.00";
  await must(office.staff.client.from("bookings").update({
    raw_data: rawData,
    food_allergies: "1 - Tree nut allergy; 3 - Gluten free; 1 - Vegetarian",
    email: "changed@example.test",
    notes: "changed private note",
  }).eq("id", ids.guest));

  const rows = await logRows(ids.guest);
  assert.deepEqual(rows.map((row) => row.field).sort(), ["dinnerTime", "foodAllergies"]);
  const dinner = rows.find((row) => row.field === "dinnerTime");
  assert.equal(dinner.old_value, "18:00");
  assert.equal(dinner.new_value, "18:30");
  assert.equal(dinner.actor_id, office.staff.userId);
  assert.equal(dinner.actor_name, "Fictional staff");
});

await check("saving without changes, and inserting, record nothing", async () => {
  const before = (await logRows(ids.guest)).length;
  const row = await must(seed.from("bookings").select("raw_data, food_allergies").eq("id", ids.guest).single());
  await must(office.staff.client.from("bookings").update(row).eq("id", ids.guest));
  assert.equal((await logRows(ids.guest)).length, before);
  const newId = unique("new");
  await must(office.staff.client.from("bookings").insert(bookingRow(newId)));
  assert.equal((await logRows(newId)).length, 0);
  await must(seed.from("bookings").delete().eq("id", newId));
});

await check("a write without a signed-in user is not attributed to anyone", async () => {
  await must(seed.from("bookings").update({ attendee_count: "44" }).eq("id", ids.guest));
  const row = (await logRows(ids.guest)).find((entry) => entry.field === "attendeeCount");
  assert.equal(row.old_value, "42");
  assert.equal(row.new_value, "44");
  assert.equal(row.actor_id, null);
  assert.equal(row.actor_name, null);
});

await check("staff see recorded changes; dietary changes only with kitchen access", async () => {
  const plain = (await must(rpc(limited.client, "staff_app_booking", { p_id: ids.guest }))).booking;
  assert.deepEqual(plain.changes.map((change) => change.field).sort(), ["attendeeCount", "dinnerTime"]);
  const dinner = plain.changes.find((change) => change.field === "dinnerTime");
  assert.equal(dinner.old, "18:00");
  assert.equal(dinner.by, "Fictional staff");
  assert.equal(dinner.bySignedInUser, true);
  assert.equal(plain.changes.find((change) => change.field === "attendeeCount").bySignedInUser, false);
  assert.ok(plain.lastChangedAt);
  const cook = (await must(rpc(kitchen.client, "staff_app_booking", { p_id: ids.guest }))).booking;
  assert.ok(cook.changes.some((change) => change.field === "foodAllergies"));
  assert.ok(!JSON.stringify(cook.changes).includes("changed@example.test"));
});

await check("office accounts read the change log directly; limited accounts do not", async () => {
  const viewerRows = await must(office.viewer.client.from("booking_change_log").select("field").eq("booking_id", ids.guest));
  assert.ok(viewerRows.length >= 3);
  const limitedRows = await kitchen.client.from("booking_change_log").select("field").eq("booking_id", ids.guest);
  assert.ok(limitedRows.error || limitedRows.data.length === 0);
  const write = await office.staff.client.from("booking_change_log").insert({ booking_id: ids.guest, field: "fake" });
  assert.ok(write.error, "nobody writes the log by hand");
});

/* 4. Office capabilities are unchanged. */

await check("office roles keep their access", async () => {
  const viewerRow = await must(office.viewer.client.from("bookings").select("email").eq("id", ids.guest).single());
  assert.equal(viewerRow.email, "changed@example.test");
  await office.viewer.client.from("bookings").update({ notes: "viewer edit" }).eq("id", ids.guest);
  assert.notEqual((await must(seed.from("bookings").select("notes").eq("id", ids.guest).single())).notes, "viewer edit");
  const deleted = await must(office.admin.client.from("bookings").delete().eq("id", ids.archive).select("id"));
  assert.equal(deleted.length, 1);
  // staff_directory is left out: its migration grants nothing, so no role can read it on a live-like stack (pre-existing).
  const items = await must(office.viewer.client.from("portal_checklist_items").select("item_id").eq("booking_id", ids.guest));
  assert.deepEqual(items.map((item) => item.item_id), ["guest-count"]);
  const ownStars = await office.viewer.client.from("guest_inquiries").select("id").limit(1);
  assert.ok(!ownStars.error);
});

await check("the guest portal still opens by token for an anonymous guest", async () => {
  const token = crypto.randomUUID().replaceAll("-", "");
  await must(seed.from("bookings").update({ portal_token: token }).eq("id", ids.guest));
  const record = await must(anon.rpc("get_portal_record", { p_portal_token: token }));
  assert.ok(record, "portal record returned");
  assert.match(JSON.stringify(record), new RegExp(ids.guest));
  const wrong = await anon.rpc("get_portal_record", { p_portal_token: "0".repeat(32) });
  assert.ok(wrong.error || !wrong.data, "an unknown token returns nothing");
});

/* 5. Admin assignment of individual accounts. */

await check("admins assign limited kitchen access to an existing account", async () => {
  const result = await must(rpc(office.admin.client, "staff_app_admin_set_access", {
    p_email: unassigned.email.toUpperCase(), p_full_name: "Fictional Cook", p_role: "limited", p_departments: ["kitchen"], p_is_active: true,
  }));
  assert.equal(result.role, "limited");
  assert.deepEqual(result.departments, ["kitchen"]);
  const me = await must(rpc(unassigned.client, "staff_app_me"));
  assert.equal(me.access, "limited");
  assert.equal(me.canSeeDietary, true);
  const list = await must(rpc(office.admin.client, "staff_app_admin_list"));
  assert.ok(list.some((entry) => entry.userId === unassigned.userId && entry.role === "limited"));

  await must(rpc(office.admin.client, "staff_app_admin_set_access", {
    p_email: unassigned.email, p_full_name: "", p_role: "limited", p_departments: ["kitchen"], p_is_active: false,
  }));
  const { error } = await rpc(unassigned.client, "staff_app_bookings", range);
  assert.ok(error, "deactivation takes effect on the next request");
});

await check("admin assignment refuses self-changes, unknown accounts, bad input and non-admins", async () => {
  const self = await rpc(office.admin.client, "staff_app_admin_set_access", { p_email: office.admin.email, p_full_name: "", p_role: "limited", p_departments: [], p_is_active: true });
  assert.match(String(self.error?.message), /own access/);
  const missing = await rpc(office.admin.client, "staff_app_admin_set_access", { p_email: "nobody@example.test", p_full_name: "", p_role: "limited", p_departments: [], p_is_active: true });
  assert.match(String(missing.error?.message), /Create or invite/);
  const badRole = await rpc(office.admin.client, "staff_app_admin_set_access", { p_email: limited.email, p_full_name: "", p_role: "owner", p_departments: [], p_is_active: true });
  assert.ok(badRole.error);
  const badDept = await rpc(office.admin.client, "staff_app_admin_set_access", { p_email: limited.email, p_full_name: "", p_role: "limited", p_departments: ["payroll"], p_is_active: true });
  assert.ok(badDept.error);
  const asStaff = await rpc(office.staff.client, "staff_app_admin_set_access", { p_email: limited.email, p_full_name: "", p_role: "admin", p_departments: [], p_is_active: true });
  assert.ok(asStaff.error);
  assert.equal((await must(seed.from("staff_profiles").select("role").eq("user_id", limited.userId).single())).role, "limited");
});

/* Clean up fixtures (fictional rows in a local stack). */
await seed.from("bookings").delete().in("id", [...Object.values(ids)]);
await seed.storage.from("portal-uploads").remove([storagePath]);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
