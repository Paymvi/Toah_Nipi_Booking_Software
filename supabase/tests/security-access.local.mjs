// Security access matrix against a LOCAL Supabase stack (Docker). FICTIONAL DATA ONLY.
// See docs/audit/SECURITY_AUDIT_2026-11-10.md ("Local test stack").
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/security-access.local.mjs
//
// LOCAL_SEEDER_KEY is a fixture role (BYPASSRLS) so the stack can keep the live
// grants for anon, authenticated and service_role. Every outcome is checked by
// reading the database back with that role, not by trusting API responses.
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

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
    console.log(`FAIL ${name}\n     ${String(error?.message || error).split("\n").slice(0, 6).join("\n     ")}`);
  }
}

const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
};
const hex = () => crypto.randomUUID().replaceAll("-", "");
const unique = (label) => `${label}-${run}-${Math.random().toString(36).slice(2, 8)}`;

/* ---------- Actors ---------- */

async function signedIn(email, password) {
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return client;
}

async function makeStaff(role) {
  const email = `${unique(role)}@example.test`;
  const password = `pw-${run}-${role}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${role}`, role, is_active: true }));
  return { client: await signedIn(email, password), userId: user.id };
}

// A stranger who signs up through the public auth endpoint (models open sign-ups).
async function makeStranger() {
  const email = `stranger-${run}@example.test`;
  const password = `pw-${run}-stranger-Local1!`;
  const client = createClient(url, anonKey, options);
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`sign-up: ${error.message}`);
  if (!data.session) await must(client.auth.signInWithPassword({ email, password }));
  return { client, userId: data.user.id };
}

/* ---------- Fixtures: two fictional bookings with the same task keys ---------- */

async function makeBooking(label) {
  const id = unique(`sec-${label}`);
  const portalToken = hex();
  await must(seed.from("bookings").insert({ id, portal_token: portalToken, organization_name: `Fictional ${label} Group`, contact_name: `Contact ${label}`, email: `${label.toLowerCase()}@example.test`, status: "Confirmed", food_allergies: `allergy-${label}` }));
  await must(
    seed.from("portal_checklist_items").insert([
      { booking_id: id, item_id: "food-allergy-information", title: "Allergies", guest_action: "mark_ready", status: "notStarted", sort_order: 1 },
      { booking_id: id, item_id: "waiver", title: "Waiver upload", guest_action: "upload_file", status: "notStarted", sort_order: 2 },
      { booking_id: id, item_id: "info-only", title: "Read this", guest_action: "none", status: "notStarted", sort_order: 3 },
    ])
  );
  const document = await must(seed.from("portal_documents").insert({ booking_id: id, title: `Staff doc ${label}`, file_name: "staff.pdf", status: "ready" }).select("id").single());
  const staffPath = `${portalToken}/staff-documents/${document.id}/staff.pdf`;
  await must(seed.storage.from("portal-uploads").upload(staffPath, new Blob(["%PDF-1.4 fictional"], { type: "application/pdf" }), { contentType: "application/pdf" }));
  await must(seed.from("portal_documents").update({ storage_path: staffPath }).eq("id", document.id));
  return { id, portalToken, staffPath, label };
}

const itemStatus = async (booking, key) =>
  (await must(seed.from("portal_checklist_items").select("status, response_text").eq("booking_id", booking.id).eq("item_id", key).single()));
const objectExists = async (path) => {
  const folder = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").pop();
  const listed = await must(seed.storage.from("portal-uploads").list(folder, { search: name }));
  return listed.some((entry) => entry.name === name);
};

/* ---------- Table matrix ---------- */

// make() creates a throwaway row with the fixture role and returns its match filter.
function tableSpecs(bookingA, staffIds) {
  const inquiry = () => ({ organization_name: "Fictional Inquiry", contact_name: "C", email: "i@example.test", phone: "555", start_date: "2027-06-01", end_date: "2027-06-02", approx_total_guests: 5 });
  return [
    { table: "bookings", make: async () => { const id = unique("row"); await must(seed.from("bookings").insert({ id, organization_name: "Row" })); return { id }; }, patch: { organization_name: "Changed" }, newRow: () => ({ id: unique("new"), organization_name: "New" }) },
    { table: "guest_inquiries", make: async () => ({ id: (await must(seed.from("guest_inquiries").insert(inquiry()).select("id").single())).id }), patch: { declined_reason: "changed" }, newRow: inquiry },
    { table: "portal_checklist_items", make: async () => ({ id: (await must(seed.from("portal_checklist_items").insert({ booking_id: bookingA.id, item_id: unique("i"), title: "T" }).select("id").single())).id }), patch: { title: "Changed" }, newRow: () => ({ booking_id: bookingA.id, item_id: unique("n"), title: "N" }) },
    { table: "portal_documents", make: async () => ({ id: (await must(seed.from("portal_documents").insert({ booking_id: bookingA.id, title: "D" }).select("id").single())).id }), patch: { title: "Changed" }, newRow: () => ({ booking_id: bookingA.id, title: "N" }) },
    { table: "portal_email_recipients", make: async () => ({ id: (await must(seed.from("portal_email_recipients").insert({ booking_id: bookingA.id, email: `${unique("r")}@example.test` }).select("id").single())).id }), patch: { selected: true }, newRow: () => ({ booking_id: bookingA.id, email: `${unique("n")}@example.test` }) },
    // Only the two fixed template keys exist (check constraint), so reuse them.
    { table: "portal_email_templates", make: async () => { await must(seed.from("portal_email_templates").upsert({ key: "welcome", subject: "S", body: "B" })); return { key: "welcome" }; }, patch: { subject: "Changed" }, newRow: () => ({ key: "update", subject: "S", body: "B" }) },
    { table: "portal_email_messages", make: async () => ({ id: (await must(seed.from("portal_email_messages").insert({ dedupe_key: unique("d"), trigger: "test", template_key: "welcome", mode: "test", mode_epoch: 1, recipient: "m@example.test" }).select("id").single())).id }), patch: { status: "sent" }, newRow: () => ({ dedupe_key: unique("n"), trigger: "test", template_key: "welcome", mode: "test", mode_epoch: 1, recipient: "m@example.test" }) },
    { table: "portal_signing_settings", make: async () => ({ id: true }), patch: { enabled: true }, newRow: () => ({ id: true }) },
    { table: "inquiry_hidden", make: async () => { const inquiry_id = unique("h"); await must(seed.from("inquiry_hidden").insert({ inquiry_id })); return { inquiry_id }; }, patch: { snapshot: { changed: true } }, newRow: () => ({ inquiry_id: unique("n") }) },
    { table: "audit_repair_log", make: async () => ({ id: (await must(seed.from("audit_repair_log").insert({ repair: "x", table_name: "bookings", row_id: "x", column_name: "notes" }).select("id").single())).id }), patch: { repair: "changed" }, newRow: () => ({ repair: "n", table_name: "bookings", row_id: "x", column_name: "notes" }) },
    { table: "staff_profiles (another user's row)", real: "staff_profiles", make: async () => ({ user_id: staffIds.viewer }), patch: { full_name: "Changed" }, newRow: () => ({ user_id: staffIds.stranger, email: `x-${run}@example.test`, full_name: "Self-made", role: "admin" }) },
  ];
}

async function observe(client, spec) {
  const table = spec.real || spec.table;
  const result = { R: false, I: false, U: false, D: false };

  let match = await spec.make();
  const read = await client.from(table).select("*").match(match);
  result.R = !read.error && read.data.length === 1;

  const before = await must(seed.from(table).select("*").match(match).single());
  await client.from(table).update(spec.patch).match(match);
  const after = await must(seed.from(table).select("*").match(match).single());
  result.U = Object.keys(spec.patch).some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  await seed.from(table).update(Object.fromEntries(Object.keys(spec.patch).map((key) => [key, before[key]]))).match(match);

  if (table !== "portal_signing_settings" && table !== "staff_profiles") {
    match = await spec.make();
    await client.from(table).delete().match(match);
    result.D = (await must(seed.from(table).select("*").match(match))).length === 0;
  }

  const row = spec.newRow();
  const insertMatch = Object.fromEntries(Object.entries(row).filter(([key]) => ["id", "key", "inquiry_id", "user_id", "dedupe_key", "email", "item_id", "title"].includes(key)));
  const existed = (await must(seed.from(table).select("*").match(insertMatch))).length;
  await client.from(table).insert(row);
  result.I = (await must(seed.from(table).select("*").match(insertMatch))).length > existed;
  return `${result.R ? "R" : "-"}${result.I ? "I" : "-"}${result.U ? "U" : "-"}${result.D ? "D" : "-"}`;
}

/* ---------- Run ---------- */

const bookingA = await makeBooking("Alpha");
const bookingB = await makeBooking("Beta");
const anon = createClient(url, anonKey, options);
const viewer = await makeStaff("viewer");
const staff = await makeStaff("staff");
const admin = await makeStaff("admin");
const stranger = await makeStranger();
if (!(await seed.from("portal_email_settings").select("id")).data?.length) {
  await must(seed.from("portal_email_settings").insert({ id: 1 }));
}

// Expected from the live policies AND live grants (2026-11-10 catalog read).
// inquiry_hidden has policies but no table grants live, so nobody can use it (a functional gap, not exposure).
const EXPECTED = {
  bookings: { anon: "----", stranger: "----", viewer: "R---", staff: "RIU-", admin: "RIUD" },
  guest_inquiries: { anon: "----", stranger: "----", viewer: "R---", staff: "R-U-", admin: "R-U-" },
  portal_checklist_items: { anon: "----", stranger: "----", viewer: "R---", staff: "RIUD", admin: "RIUD" },
  portal_documents: { anon: "----", stranger: "----", viewer: "R---", staff: "RIUD", admin: "RIUD" },
  portal_email_recipients: { anon: "----", stranger: "----", viewer: "R---", staff: "RIUD", admin: "RIUD" },
  portal_email_templates: { anon: "----", stranger: "----", viewer: "R---", staff: "R---", admin: "R-U-" },
  portal_email_messages: { anon: "----", stranger: "----", viewer: "R---", staff: "R---", admin: "R---" },
  portal_signing_settings: { anon: "----", stranger: "----", viewer: "R---", staff: "R---", admin: "R---" },
  inquiry_hidden: { anon: "----", stranger: "----", viewer: "----", staff: "----", admin: "----" },
  audit_repair_log: { anon: "----", stranger: "----", viewer: "----", staff: "----", admin: "----" },
  "staff_profiles (another user's row)": { anon: "----", stranger: "----", viewer: "R---", staff: "----", admin: "R-U-" },
};
const actors = { anon, stranger: stranger.client, viewer: viewer.client, staff: staff.client, admin: admin.client };
const staffIds = { viewer: viewer.userId, stranger: stranger.userId };
const matrix = {};

for (const spec of tableSpecs(bookingA, staffIds)) {
  matrix[spec.table] = {};
  for (const [name, client] of Object.entries(actors)) {
    // The viewer reading its own profile row is covered separately; use the staff user's row for the viewer.
    const target = name === "viewer" && spec.real === "staff_profiles" ? { ...spec, make: async () => ({ user_id: staff.userId }) } : spec;
    matrix[spec.table][name] = await observe(client, target).catch((error) => `ERR ${error.message}`);
  }
}
// The viewer row target above means "another user's row" is the staff user's row for the viewer.
EXPECTED["staff_profiles (another user's row)"].viewer = "----";

console.log("\nObserved access (R read, I insert, U update, D delete):");
console.log(["table".padEnd(38), ...Object.keys(actors).map((name) => name.padEnd(9))].join(""));
for (const [table, row] of Object.entries(matrix)) {
  console.log([table.padEnd(38), ...Object.keys(actors).map((name) => String(row[name]).padEnd(9))].join(""));
}
console.log("");

for (const [table, row] of Object.entries(matrix)) {
  await check(`table matrix: ${table}`, async () => assert.deepEqual(row, EXPECTED[table]));
}

await check("staff can read their own profile but cannot raise their own role", async () => {
  for (const actor of [viewer, staff]) {
    const own = await actor.client.from("staff_profiles").select("role").eq("user_id", actor.userId);
    assert.equal(own.data?.length, 1);
    await actor.client.from("staff_profiles").update({ role: "admin" }).eq("user_id", actor.userId);
    const after = await must(seed.from("staff_profiles").select("role").eq("user_id", actor.userId).single());
    assert.notEqual(after.role, "admin");
  }
});

await check("signing records cannot be changed or deleted, even by an admin", async () => {
  const { data: rows } = await seed.from("portal_signatures").select("id").limit(1);
  if (!rows?.length) return; // the signing suite creates them; nothing to tamper with here
  await admin.client.from("portal_signatures").update({ signer_name: "Forged" }).eq("id", rows[0].id);
  await admin.client.from("portal_signatures").delete().eq("id", rows[0].id);
  const after = await must(seed.from("portal_signatures").select("signer_name").eq("id", rows[0].id).single());
  assert.notEqual(after.signer_name, "Forged");
});

await check("privileged functions refuse anon, strangers and non-admin staff", async () => {
  const attempts = [
    [anon, "is_staff_admin", {}], [anon, "can_manage_bookings", {}], [anon, "current_staff_role", {}],
    [anon, "portal_email_load", { p_booking_ids: null }], [anon, "portal_email_enqueue", { p_message: {} }],
    [anon, "portal_email_set_automation", { p_booking_id: bookingA.id, p_action: "activate", p_user: null, p_reason: null }],
    [stranger.client, "portal_email_load", { p_booking_ids: null }],
    [staff.client, "portal_email_webhook", { p_provider_id: "x", p_status: "delivered", p_detail: "x" }],
    [anon, "portal_record_signature", { p: {} }], [staff.client, "portal_record_signature", { p: {} }],
    [anon, "portal_restore_signatures", { p_rows: [] }], [stranger.client, "portal_restore_signatures", { p_rows: [] }],
    [staff.client, "portal_restore_signatures", { p_rows: [] }],
    [anon, "portal_signing_enabled_for", { p_booking_id: bookingA.id }],
    [anon, "audit_repair_apply", { p_repair: "x" }], [stranger.client, "audit_repair_rollback", { p_repair: "x" }],
  ];
  for (const [client, fn, args] of attempts) {
    const { error } = await client.rpc(fn, args);
    assert.ok(error, `${fn} should be refused`);
  }
  // Non-staff signed-in users get "no" from the role helpers, never an elevated answer.
  assert.equal((await stranger.client.rpc("can_manage_bookings")).data ?? false, false);
  assert.equal((await viewer.client.rpc("can_manage_bookings")).data, false);
});

await check("non-staff and deactivated accounts cannot plant signing records through restore", async () => {
  const formerAdmin = await makeStaff("admin");
  await must(seed.from("staff_profiles").update({ is_active: false }).eq("user_id", formerAdmin.userId));
  for (const client of [stranger.client, formerAdmin.client, staff.client]) {
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(), booking_id: bookingA.id, checklist_item_id: crypto.randomUUID(), item_key: "contract", item_title: "Forged",
      document_id: crypto.randomUUID(), document_title: "Forged", document_file_name: "f.pdf", request_key: crypto.randomUUID(),
      signer_name: "Forged Signer", signs_for_organization: false, signature_type: "typed", agreement_version: "x", agreement_text: "x",
      signed_at: now, recorded_at: now, original_path: "x", original_sha256: "0".repeat(64), original_size: 1, original_page_count: 1,
      signed_path: "y", signed_sha256: "0".repeat(64), signed_size: 1,
    };
    const { error } = await client.rpc("portal_restore_signatures", { p_rows: [row] });
    assert.ok(error, "restore should be refused");
    assert.equal((await must(seed.from("portal_signatures").select("id").eq("id", row.id))).length, 0);
  }
});

await check("removing or downgrading a staff role takes effect on the next request (same session)", async () => {
  const temp = await makeStaff("staff");
  const temp2 = await makeStaff("viewer");
  assert.equal((await temp.client.from("bookings").select("id").eq("id", bookingA.id)).data.length, 1);
  await must(seed.from("staff_profiles").update({ role: "viewer" }).eq("user_id", temp.userId));
  await temp.client.from("bookings").update({ organization_name: "Downgraded edit" }).eq("id", bookingA.id);
  assert.notEqual((await must(seed.from("bookings").select("organization_name").eq("id", bookingA.id).single())).organization_name, "Downgraded edit");
  await must(seed.from("staff_profiles").update({ is_active: false }).eq("user_id", temp2.userId));
  assert.equal((await temp2.client.from("bookings").select("id").eq("id", bookingA.id)).data.length, 0);
});

/* ---------- Guest portal: one link, one booking ---------- */

await check("a portal link returns only its own booking; wrong, short and injected tokens return nothing", async () => {
  const record = await must(anon.rpc("get_portal_record", { p_portal_token: bookingA.portalToken }));
  assert.equal(record.id, bookingA.id);
  assert.ok(!JSON.stringify(record).includes(bookingB.id) && !JSON.stringify(record).includes("Beta"));
  for (const token of [hex(), "short", "' or 1=1 --", `${bookingA.portalToken.slice(0, 31)}x`, "%", ""]) {
    assert.equal(await must(anon.rpc("get_portal_record", { p_portal_token: token })), null, token);
  }
  const reference = await must(anon.rpc("portal_get_booking_reference", { p_portal_token: hex() }));
  assert.equal(reference.foodAllergies, "");
});

await check("guest actions with one link never touch the other booking", async () => {
  await must(anon.rpc("portal_submit_checklist_item_response", { p_portal_token: bookingA.portalToken, p_item_id: "food-allergy-information", p_response_text: "Alpha only" }));
  assert.equal((await itemStatus(bookingA, "food-allergy-information")).status, "needsReview");
  const b = await itemStatus(bookingB, "food-allergy-information");
  assert.equal(b.status, "notStarted");
  assert.equal(b.response_text, null);
  assert.equal(await must(anon.rpc("portal_get_checklist_item_response", { p_portal_token: bookingB.portalToken, p_item_id: "food-allergy-information" })), "");
  // mark-ready only works on mark_ready tasks: not on upload or info-only tasks
  await anon.rpc("portal_mark_checklist_item_ready", { p_portal_token: bookingA.portalToken, p_item_id: "waiver" });
  await anon.rpc("portal_mark_checklist_item_ready", { p_portal_token: bookingA.portalToken, p_item_id: "info-only" });
  assert.equal((await itemStatus(bookingA, "waiver")).status, "notStarted");
  assert.equal((await itemStatus(bookingA, "info-only")).status, "notStarted");
});

await check("guest uploads are confined to the link's own open upload task", async () => {
  const pdf = () => new Blob(["%PDF-1.4 guest"], { type: "application/pdf" });
  const denied = [
    `${bookingA.portalToken}/staff-documents/x/evil.pdf`, // staff folder
    `${bookingA.portalToken}/info-only/evil.pdf`, // not an upload task
    `${bookingA.portalToken}/waiver`, // no file name
    `${hex()}/waiver/evil.pdf`, // unknown link
  ];
  for (const path of denied) {
    const { error } = await anon.storage.from("portal-uploads").upload(path, pdf(), { contentType: "application/pdf" });
    assert.ok(error, `upload to ${path.replace(bookingA.portalToken, "<A>")} should be refused`);
  }
  // Registering an upload under the other booking's path is refused.
  const pathB = `${bookingB.portalToken}/waiver/${hex()}-x.pdf`;
  const { error: crossError } = await anon.rpc("portal_submit_checklist_upload", { p_portal_token: bookingA.portalToken, p_item_id: "waiver", p_file_name: "x.pdf", p_storage_path: pathB, p_mime_type: "application/pdf", p_file_size: 10 });
  assert.ok(crossError);
  assert.equal((await itemStatus(bookingB, "waiver")).status, "notStarted");
});

await check("guests cannot read, list, sign links for, overwrite or delete staff files", async () => {
  const download = await anon.storage.from("portal-uploads").download(bookingA.staffPath);
  assert.ok(download.error);
  const signed = await anon.storage.from("portal-uploads").createSignedUrl(bookingA.staffPath, 60);
  assert.ok(signed.error || !signed.data?.signedUrl);
  const listed = await anon.storage.from("portal-uploads").list(bookingA.portalToken);
  assert.equal(listed.data?.length || 0, 0);
  await anon.storage.from("portal-uploads").upload(bookingA.staffPath, new Blob(["%PDF-1.4 replaced"], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
  await anon.storage.from("portal-uploads").remove([bookingA.staffPath]);
  assert.ok(await objectExists(bookingA.staffPath));
  const original = await must(seed.storage.from("portal-uploads").download(bookingA.staffPath));
  assert.equal(await original.text(), "%PDF-1.4 fictional");
});

await check("an uploaded guest file cannot be overwritten or deleted by the guest once submitted", async () => {
  const path = `${bookingA.portalToken}/waiver/${hex()}-signed.pdf`;
  await must(anon.storage.from("portal-uploads").upload(path, new Blob(["%PDF-1.4 first"], { type: "application/pdf" }), { contentType: "application/pdf" }));
  await must(anon.rpc("portal_submit_checklist_upload", { p_portal_token: bookingA.portalToken, p_item_id: "waiver", p_file_name: "signed.pdf", p_storage_path: path, p_mime_type: "application/pdf", p_file_size: 14 }));
  await anon.storage.from("portal-uploads").upload(path, new Blob(["%PDF-1.4 swapped"], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
  await anon.storage.from("portal-uploads").remove([path]);
  assert.ok(await objectExists(path));
  assert.equal(await (await must(seed.storage.from("portal-uploads").download(path))).text(), "%PDF-1.4 first");
  // and a second submission on the now-closed task is refused
  const { error } = await anon.rpc("portal_submit_checklist_upload", { p_portal_token: bookingA.portalToken, p_item_id: "waiver", p_file_name: "again.pdf", p_storage_path: path, p_mime_type: "application/pdf", p_file_size: 14 });
  assert.ok(error);
});

await check("concurrent upload submissions on one task: exactly one wins", async () => {
  const paths = [];
  for (let index = 0; index < 6; index += 1) {
    const path = `${bookingB.portalToken}/waiver/${hex()}-c${index}.pdf`;
    await must(anon.storage.from("portal-uploads").upload(path, new Blob(["%PDF-1.4 c"], { type: "application/pdf" }), { contentType: "application/pdf" }));
    paths.push(path);
  }
  const results = await Promise.all(paths.map((path) => anon.rpc("portal_submit_checklist_upload", { p_portal_token: bookingB.portalToken, p_item_id: "waiver", p_file_name: "c.pdf", p_storage_path: path, p_mime_type: "application/pdf", p_file_size: 10 })));
  assert.equal(results.filter((result) => !result.error).length, 1);
});

await check("bucket rejects active content types and oversized files (content itself is not inspected)", async () => {
  const open = await makeBooking("Gamma");
  const html = await anon.storage.from("portal-uploads").upload(`${open.portalToken}/waiver/${hex()}.html`, new Blob(["<script>alert(1)</script>"], { type: "text/html" }), { contentType: "text/html" });
  assert.ok(html.error, "text/html should be refused");
  const svg = await anon.storage.from("portal-uploads").upload(`${open.portalToken}/waiver/${hex()}.svg`, new Blob(["<svg/>"], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
  assert.ok(svg.error, "SVG should be refused");
  const big = await anon.storage.from("portal-uploads").upload(`${open.portalToken}/waiver/${hex()}.pdf`, new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "application/pdf" }), { contentType: "application/pdf" });
  assert.ok(big.error, "over 10 MB should be refused");
  // Known limit: only the declared type is checked, so HTML labelled as a PDF is stored (served back as application/pdf).
  const disguised = await anon.storage.from("portal-uploads").upload(`${open.portalToken}/waiver/${hex()}.pdf`, new Blob(["<html><script>alert(1)</script>"], { type: "application/pdf" }), { contentType: "application/pdf" });
  assert.equal(disguised.error, null);
});

/* ---------- Public inquiry function (local code) ---------- */

const inquiryUrl = `${url}/functions/v1/submit-guest-inquiry`;
const validInquiry = () => ({ organizationName: `Fictional Inquiry ${run}`, contactName: "Pat Fictional", email: "pat@example.test", phone: "555-0100", startDate: "2027-07-01", endDate: "2027-07-03", approxTotalGuests: 12 });
const postInquiry = async (body, raw) => {
  const response = await fetch(inquiryUrl, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
};

await check("inquiry: staff-only fields cannot be set from the public form", async () => {
  const forcedId = crypto.randomUUID();
  const result = await postInquiry({ ...validInquiry(), id: forcedId, status: "converted", converted_booking_id: bookingA.id, convertedBookingId: bookingA.id, reviewed_by: admin.userId, declined_reason: "x", submitted_at: "2000-01-01T00:00:00Z" });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const row = await must(seed.from("guest_inquiries").select("*").eq("id", result.body.inquiryId).single());
  assert.notEqual(row.id, forcedId);
  assert.equal(row.status, "pending");
  assert.equal(row.converted_booking_id, null);
  assert.equal(row.reviewed_by, null);
  assert.equal(row.declined_reason, null);
  assert.ok(new Date(row.submitted_at).getFullYear() > 2000);
});

await check("inquiry: nested JSON is reduced to the shapes staff screens render", async () => {
  const result = await postInquiry({
    ...validInquiry(),
    allergies: [{ name: { nested: "object" }, count: { x: 1 } }, { name: "Peanuts", count: "3", extra: "dropped" }, "junk"],
    activities: [{ date: "2027-07-01", time: "10:00", activity: { a: 1 } }, { date: "not-a-date", activity: "Hike" }],
    mealSchedule: { "2027-07-01": { breakfast: true, lunch: "yes", dinner: { x: 1 } }, junk: { breakfast: true }, "2027-07-02": "x" },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const row = await must(seed.from("guest_inquiries").select("allergies, activities, meal_schedule").eq("id", result.body.inquiryId).single());
  // An object name becomes harmless text; counts are whole numbers or empty; extra keys are dropped.
  assert.deepEqual(row.allergies, [{ name: "[object Object]", count: null }, { name: "Peanuts", count: 3 }]);
  for (const activity of row.activities) for (const value of Object.values(activity)) assert.equal(typeof value, "string");
  assert.deepEqual(row.meal_schedule, { "2027-07-01": { breakfast: true, lunch: false, dinner: false } });
});

await check("inquiry: malformed bodies and dates are refused with 400, never a crash", async () => {
  for (const raw of ["null", "[]", "\"text\"", "{bad json", "123"]) {
    const result = await postInquiry(null, raw);
    assert.equal(result.status, 400, `${raw} -> ${result.status}`);
  }
  assert.equal((await postInquiry({ ...validInquiry(), startDate: "2027-02-30" })).status, 400);
  assert.equal((await postInquiry({ ...validInquiry(), approxTotalGuests: 1e9 })).status, 400);
});

await check("inquiry: oversized requests are refused before parsing", async () => {
  const result = await postInquiry({ ...validInquiry(), notes: "x".repeat(300 * 1024) });
  assert.equal(result.status, 413);
});

await check("inquiry: a flood is capped (429) instead of filling the staff list", async () => {
  const count = async () => (await seed.from("guest_inquiries").select("id", { count: "exact", head: true })).count;
  const before = await count();
  const statuses = [];
  for (let index = 0; index < 40; index += 1) statuses.push((await postInquiry(validInquiry())).status);
  assert.ok(statuses.includes(429), `no 429 in ${statuses.join(",")}`);
  assert.equal((await count()) - before, statuses.filter((status) => status === 201).length);
  // Remove this run's fictional inquiries so the 10-minute brake does not affect a rerun.
  await must(seed.from("guest_inquiries").delete().like("organization_name", `%${run}%`));
  assert.equal((await postInquiry(validInquiry())).status, 201);
  await must(seed.from("guest_inquiries").delete().like("organization_name", `%${run}%`));
});

console.log(`\n${passes} of ${passes + failures} checks passed.`);
process.exit(failures ? 1 : 0);
