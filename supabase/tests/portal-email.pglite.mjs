// End-to-end check of guest portal emails against an in-process Postgres
// (PGlite): the real migration, the real service code, a fake provider and
// a controlled clock. TEST DATA ONLY; nothing leaves this process.
//
//   npm install --no-save @electric-sql/pglite
//   node supabase/tests/portal-email.pglite.mjs
//
// (PGLITE_MODULE=<path to pglite's dist/index.js> uses a copy installed elsewhere.)
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  activateBooking,
  changeAutomation,
  dispatchQueued,
  retryMessage,
  runScheduled,
  sendManual,
  sendTest,
} from "../functions/portal-email/service.js";
import { planAutomaticMessages } from "../../src/utils/portalEmail.js";

const { PGlite } = await import(
  process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite"
);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => fs.readFileSync(path.join(repo, relative), "utf8").replaceAll("\r", "");
const pg = new PGlite();
process.on("unhandledRejection", (error) => {
  console.error("FAILED:", error.message, error.position ? `(at ${error.position})` : "", error.where || "");
  process.exit(1);
});
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
  console.log("  ok -", message);
};

// --- environment the real project provides (stand-ins) -------------------
await pg.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role; exception when duplicate_object then null; end $$;
`);
const setup = read("src/docs/SQL_SETUP.md");
await pg.exec(
  setup
    .match(/```sql\n(create table if not exists public\.bookings[\s\S]*?)```/)[1]
    .replace("encode(gen_random_bytes(16), 'hex')", "md5(random()::text)")
);
await pg.exec(setup.match(/```sql\n(create or replace function public\.set_updated_at\(\)[\s\S]*?)```/)[1]);
await pg.exec(`
  create or replace function public.is_active_staff() returns boolean language sql as $$ select true $$;
  create or replace function public.can_manage_bookings() returns boolean language sql as $$ select true $$;
  create or replace function public.is_staff_admin() returns boolean language sql as $$ select true $$;
  -- stand-ins, not the real definitions
  create table public.portal_checklist_items (id uuid primary key default gen_random_uuid(),
    booking_id text references public.bookings(id) on delete cascade, item_id text, title text,
    status text default 'notStarted', guest_action text default 'mark_ready', due_date date, sort_order int default 0);
  create table public.portal_documents (id uuid primary key default gen_random_uuid(),
    booking_id text references public.bookings(id) on delete cascade, title text, uploaded_by_guest boolean default false);
  insert into public.bookings (id, organization_name, email, start_date, end_date, status, source_type)
  values ('b1', 'Oak Hill Youth', 'lead@example.org; second@example.org', '2027-03-10', '2027-03-12', 'Confirmed', 'Staff Booking');
  insert into public.portal_checklist_items (booking_id, title, due_date, sort_order)
  values ('b1', 'Final guest count', '2027-02-20', 1), ('b1', 'Waiver', null, 2);
`);

const migration = read("supabase/migrations/20261104000100_portal_email.sql");
await pg.exec(migration);
await pg.exec(migration);
check(true, "migration applies twice");

// --- adapters --------------------------------------------------------------
const CASTS = {
  p_booking_ids: "text[]", p_booking_id: "text", p_action: "text", p_user: "uuid", p_reason: "text",
  p_message: "jsonb", p_limit: "int", p_ids: "uuid[]", p_id: "uuid", p_status: "text", p_detail: "text",
  p_provider_id: "text", p_subject: "text", p_exhausted_status: "text",
};
const db = {
  async rpc(name, args) {
    const keys = Object.keys(args);
    const sql = `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}::${CASTS[key]}`).join(", ")}) as result`;
    const values = keys.map((key) => (CASTS[key] === "jsonb" && args[key] !== null ? JSON.stringify(args[key]) : args[key]));
    return (await pg.query(sql, values)).rows[0].result;
  },
};
const sql = async (text, values) => (await pg.query(text, values)).rows;

const provider = {
  calls: [],
  responses: [],
  async send(email) {
    this.calls.push(email);
    return this.responses.length ? this.responses.shift() : { ok: true, id: `prov-${this.calls.length}` };
  },
};
const baseConfig = {
  providerReady: true,
  problems: [],
  portalBaseUrl: "https://portal.example.org",
  testAllowlist: new Set(),
  liveEnabled: false,
  apiKey: "test",
};
let config = { ...baseConfig };
const ctx = (extra = {}) => ({ db, provider, config, ...extra });
const now = () => new Date();
const setMode = (mode) => sql("update public.portal_email_settings set mode = $1", [mode]);
const settings = async () => (await sql("select * from public.portal_email_settings"))[0];
const statuses = async (where = "true") =>
  Object.fromEntries((await sql(`select status, count(*)::int as n from public.portal_email_messages where ${where} group by status`)).map((r) => [r.status, r.n]));
const selectRecipient = (email, bookingId = "b1") =>
  sql(
    `insert into public.portal_email_recipients (booking_id, email, selected) values ($1, $2, true)
     on conflict (booking_id, email) do update set selected = true`,
    [bookingId, email]
  );
const expectError = async (promise, pattern, message) => {
  await assert.rejects(promise, pattern);
  check(true, message);
};

// --- safe defaults ----------------------------------------------------------
{
  const s = await settings();
  check(s.mode === "disabled" && s.automation_enabled === false, "defaults: dry run, automation off");
  check((await sql("select count(*)::int as n from public.portal_email_bookings"))[0].n === 0, "no booking is enrolled");
  check((await sql("select count(*)::int as n from public.portal_email_recipients"))[0].n === 0, "no recipient is selected");
  check((await sql("select bool_or(email_assign) as a, max(cardinality(email_reminders)) as r from public.portal_checklist_items"))[0].a === false, "item email options start off");
  const r = await runScheduled(ctx({ config: { ...baseConfig, liveEnabled: true } }));
  check(provider.calls.length === 0 && r.planned === 0, "scheduled run with defaults makes zero provider calls");
}

// --- guest / public access ---------------------------------------------------
{
  const [privs] = await sql(`select
    has_table_privilege('anon', 'public.portal_email_messages', 'select') as anon_history,
    has_table_privilege('anon', 'public.portal_email_recipients', 'insert') as anon_recipients,
    has_table_privilege('anon', 'public.portal_email_settings', 'update') as anon_settings,
    has_table_privilege('authenticated', 'public.portal_email_messages', 'insert') as staff_insert_outbox,
    has_table_privilege('authenticated', 'public.portal_email_bookings', 'update') as staff_write_automation,
    has_function_privilege('anon', 'public.portal_email_claim(integer,uuid[])', 'execute') as anon_claim,
    has_function_privilege('authenticated', 'public.portal_email_enqueue(jsonb)', 'execute') as staff_enqueue,
    has_function_privilege('authenticated', 'public.portal_email_set_automation(text,text,uuid,text)', 'execute') as staff_activate`);
  check(Object.values(privs).every((value) => value === false), "anon cannot read history or control sending; staff writes go through the Edge Function");
  const policies = await sql("select count(*)::int as n from pg_policies where tablename like 'portal_email%' and 'anon' = any(roles)");
  check(policies[0].n === 0, "no anon policies on email tables");
}

// --- templates are validated in the database --------------------------------
await expectError(
  sql("update public.portal_email_templates set body = 'Hi {{portal_token}}' where key = 'welcome'"),
  /check/i,
  "unknown template placeholder rejected by the database"
);

// --- global live mode does not enroll anything -------------------------------
await setMode("live");
await sql("update public.portal_email_settings set automation_enabled = true");
config = { ...baseConfig, liveEnabled: true };
await runScheduled(ctx());
check(provider.calls.length === 0, "live mode + automation on: existing bookings stay unenrolled, zero calls");
await setMode("disabled");
check((await settings()).automation_enabled === false, "changing mode turns automatic emails off");

// --- dry run activation, welcome exactly once --------------------------------
await expectError(activateBooking(ctx({ bookingId: "b1" })), /recipient/, "activation needs a selected recipient");
await selectRecipient("lead@example.org");
{
  const results = await Promise.all([1, 2, 3].map(() => activateBooking(ctx({ bookingId: "b1", now: now() }))));
  const welcomes = await sql("select status from public.portal_email_messages where trigger = 'welcome'");
  check(welcomes.length === 1 && welcomes[0].status === "simulated", "concurrent activations: one simulated welcome");
  check(results.flatMap((r) => r.welcome).length === 1, "only one request dispatched it");
  await activateBooking(ctx({ bookingId: "b1" }));
  await changeAutomation({ db, bookingId: "b1", action: "deactivate" });
  await activateBooking(ctx({ bookingId: "b1" }));
  check((await sql("select count(*)::int as n from public.portal_email_messages where trigger = 'welcome'"))[0].n === 1, "repeat save and uncheck/recheck do not resend the welcome");
  check(provider.calls.length === 0, "dry run: zero provider calls");
}

// --- dry-run events never become live ---------------------------------------
{
  // An automatic message queued in dry run, then the mode changes before dispatch.
  const items = await sql("select id from public.portal_checklist_items where title = 'Final guest count'");
  await sql("update public.portal_checklist_items set email_reminders = '{7d}' where id = $1", [items[0].id]);
  await sql("update public.portal_email_settings set automation_enabled = true");
  const state = await db.rpc("portal_email_load", { p_booking_ids: ["b1"] });
  const [planned] = planAutomaticMessages(state.bookings[0], state.settings, new Date("2027-02-13T15:00:00Z"));
  const id = await db.rpc("portal_email_enqueue", { p_message: planned });
  check(Boolean(id), "dry-run reminder queued");
  await setMode("live");
  config = { ...baseConfig, liveEnabled: true };
  await runScheduled(ctx({ now: new Date("2027-02-13T15:00:00Z") }));
  const [row] = await sql("select status from public.portal_email_messages where id = $1", [id]);
  check(row.status === "cancelled", "queued dry-run message cancelled when the mode changed");
  check(provider.calls.length === 0, "live mode did not replay dry-run history or stale activations");
  const automation = (await sql("select mode_epoch from public.portal_email_bookings"))[0];
  check(automation.mode_epoch !== (await settings()).mode_epoch, "booking activation is stale after a mode change until staff enable it again");
}

// --- test mode: only the server allowlist -------------------------------------
await setMode("test");
config = { ...baseConfig, testAllowlist: new Set(["tester@example.org"]) };
{
  await activateBooking(ctx({ bookingId: "b1" }));
  const [welcome] = await sql("select status, status_detail from public.portal_email_messages where trigger = 'welcome' order by created_at desc limit 1");
  check(welcome.status === "blocked" && /allowlist/.test(welcome.status_detail), "test mode: welcome to a guest address is blocked");
  await sendManual(ctx({ bookingId: "b1", kind: "reminder", requestId: "req-manual-1" }));
  await sendManual(ctx({ bookingId: "b1", kind: "welcome", requestId: "req-manual-2" }));
  check((await statuses("trigger like 'manual%'")).blocked === 2, "test mode: manual sends to guests are blocked");
  await expectError(sendTest(ctx({ to: "lead@example.org", templateKey: "welcome", requestId: "req-test-0" })), /allowlist/, "test send refuses a non-allowlisted address");
  check(provider.calls.length === 0, "still zero provider calls");

  const first = await sendTest(ctx({ to: "tester@example.org", templateKey: "welcome", requestId: "req-test-1" }));
  const again = await sendTest(ctx({ to: "tester@example.org", templateKey: "welcome", requestId: "req-test-1" }));
  check(first.results[0].status === "accepted" && again.duplicate, "double-click test send: one delivery");
  const call = provider.calls[0];
  check(call.to === "tester@example.org" && call.subject.startsWith("[TEST]"), "test send goes to the allowlisted inbox, labelled [TEST]");
  check(call.html.includes("Sample Retreat Group") && !call.html.includes("Oak Hill"), "test send uses synthetic data by default");
  check(call.idempotencyKey === first.results[0].id, "provider idempotency key is the message id");
  await sendTest(ctx({ to: "tester@example.org", templateKey: "update", bookingId: "b1", useRealData: true, requestId: "req-test-2" }));
  check(provider.calls[1].html.includes("Oak Hill Youth"), "real booking data only when staff choose it");

  // Allowlisted guest address in test mode: accepted.
  await selectRecipient("tester@example.org");
  await sendManual(ctx({ bookingId: "b1", kind: "welcome", requestId: "req-manual-3" }));
  check(provider.calls.length === 3 && provider.calls[2].to === "tester@example.org", "test mode sends only the allowlisted recipient");
  await sql("update public.portal_email_recipients set selected = false where email = 'tester@example.org'");
}

// --- live mode: server gate, reminders, cap, recipient removal ----------------
await setMode("live");
config = { ...baseConfig, liveEnabled: false };
provider.calls.length = 0;
{
  await activateBooking(ctx({ bookingId: "b1" }));
  check((await statuses("trigger = 'welcome' and mode = 'live'")).blocked === 1, "live without PORTAL_EMAIL_LIVE_ENABLED is blocked");
  config = { ...baseConfig, liveEnabled: true };
  await sendManual(ctx({ bookingId: "b1", kind: "welcome", requestId: "req-live-1" }));
  check(provider.calls.length === 1, "explicit live resend after the server gate is opened");
  check((await sql("select is_manual from public.portal_email_messages where dedupe_key like 'manual|req-live-1%'"))[0].is_manual === true, "manual resend marked in history");

  await sql("update public.portal_email_settings set automation_enabled = true");
  await selectRecipient("second@example.org");
  const reminderDay = new Date("2027-02-13T15:00:00Z"); // 7 days before 2027-02-20, 10:00 EST
  let r = await runScheduled(ctx({ now: reminderDay }));
  check(r.planned === 2 && provider.calls.length === 3, "7-day reminder: one email per selected recipient");
  r = await runScheduled(ctx({ now: new Date("2027-02-13T20:00:00Z") }));
  check(r.planned === 0 && provider.calls.length === 3, "later run the same day sends nothing again");
  r = await runScheduled(ctx({ now: new Date("2027-02-14T15:00:00Z") }));
  check(r.planned === 0, "the next day does not replay the 7-day window");

  // Due date edit: a pending reminder for the old date is suppressed; the new date gets new windows.
  await sql("update public.portal_checklist_items set email_reminders = '{7d,2d}' where title = 'Final guest count'");
  let state = await db.rpc("portal_email_load", { p_booking_ids: ["b1"] });
  const pending = planAutomaticMessages(state.bookings[0], state.settings, new Date("2027-02-18T15:00:00Z"));
  for (const message of pending) await db.rpc("portal_email_enqueue", { p_message: message });
  await sql("update public.portal_checklist_items set due_date = '2027-02-25' where title = 'Final guest count'");
  await dispatchQueued(ctx({ now: new Date("2027-02-18T15:00:00Z") }));
  check((await statuses("status_detail like 'Nothing in this email%'")).suppressed === 2 && provider.calls.length === 3, "due date changed: queued reminders for the old date are suppressed");
  r = await runScheduled(ctx({ now: new Date("2027-02-18T15:00:00Z") }));
  check(r.planned === 2, "new due date: its own 7-day window is used");

  // Removing a recipient suppresses mail already queued for them.
  state = await db.rpc("portal_email_load", { p_booking_ids: ["b1"] });
  for (const message of planAutomaticMessages(state.bookings[0], state.settings, new Date("2027-02-23T15:00:00Z"))) {
    await db.rpc("portal_email_enqueue", { p_message: message });
  }
  await sql("delete from public.portal_email_recipients where email = 'second@example.org'");
  const before = provider.calls.length;
  await dispatchQueued(ctx({ now: new Date("2027-02-23T15:00:00Z") }));
  check(provider.calls.length === before + 1 && provider.calls.at(-1).to === "lead@example.org", "removed recipient's queued email is not sent");

  // Cap: no catch-up, over-cap mail is blocked.
  await sql("update public.portal_email_settings set live_cap_per_day = 1");
  await sendManual(ctx({ bookingId: "b1", kind: "reminder", requestId: "req-cap-1" }));
  const [capped] = await sql("select status, status_detail from public.portal_email_messages where dedupe_key like 'manual|req-cap-1%'");
  check(capped.status === "blocked" && /cap/.test(capped.status_detail), "daily live cap blocks further sends (manual too)");
  await sql("update public.portal_email_settings set live_cap_per_day = 50");
}

// --- failures, uncertainty, retries, concurrency ----------------------------
{
  const queue = async (key) =>
    db.rpc("portal_email_enqueue", {
      p_message: { dedupe_key: key, booking_id: "b1", trigger: "manual_reminder", template_key: "update", is_manual: true, recipient: "lead@example.org" },
    });
  const statusOf = async (id) => (await sql("select status, attempts from public.portal_email_messages where id = $1", [id]))[0];

  const transient = await queue("fail-transient");
  provider.responses.push({ ok: false, retryable: true, detail: "Provider error 503." });
  await dispatchQueued(ctx({ ids: [transient] }));
  check((await statusOf(transient)).status === "queued", "transient failure is requeued with backoff");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await sql("update public.portal_email_messages set next_attempt_at = now() where id = $1", [transient]);
    provider.responses.push({ ok: false, retryable: true, detail: "Provider error 503." });
    await dispatchQueued(ctx({ ids: [transient] }));
  }
  check((await statusOf(transient)).status === "failed", "transient failures stop after 3 attempts");

  const permanent = await queue("fail-permanent");
  provider.responses.push({ ok: false, retryable: false, detail: "Provider error 422." });
  await dispatchQueued(ctx({ ids: [permanent] }));
  check((await statusOf(permanent)).status === "failed", "permanent failure is not retried");

  const lost = await queue("fail-uncertain");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sql("update public.portal_email_messages set next_attempt_at = now() where id = $1", [lost]);
    provider.responses.push({ ok: false, retryable: true, uncertain: true, detail: "No response from the email provider." });
    await dispatchQueued(ctx({ ids: [lost] }));
  }
  check((await statusOf(lost)).status === "uncertain", "repeated no-response ends as uncertain, not failed");
  const callsBefore = provider.calls.length;
  await retryMessage(ctx({ messageId: lost }));
  check(provider.calls.at(-1).idempotencyKey === lost && provider.calls.length === callsBefore + 1, "staff retry reuses the idempotency key");

  // Provider accepted, database write failed: stays 'sending', then becomes 'uncertain'.
  const orphan = await queue("accepted-not-recorded");
  const flaky = { rpc: (name, args) => (name === "portal_email_finish" ? Promise.reject(new Error("db down")) : db.rpc(name, args)) };
  const original = console.error;
  console.error = () => {};
  await dispatchQueued({ db: flaky, provider, config, ids: [orphan] });
  console.error = original;
  check((await statusOf(orphan)).status === "sending", "accepted but unrecorded result stays 'sending'");
  await sql("update public.portal_email_messages set claimed_at = now() - interval '20 minutes' where id = $1", [orphan]);
  const sentBefore = provider.calls.length;
  await dispatchQueued(ctx());
  check((await statusOf(orphan)).status === "uncertain" && provider.calls.length === sentBefore, "it is marked uncertain and never resent automatically");

  const ids = [await queue("conc-1"), await queue("conc-2"), await queue("conc-3")];
  const parallelBefore = provider.calls.length;
  await Promise.all([dispatchQueued(ctx()), dispatchQueued(ctx()), dispatchQueued(ctx())]);
  const sent = (await sql("select count(*)::int as n from public.portal_email_messages where id = any($1::uuid[]) and status = 'accepted'", [ids]))[0].n;
  check(sent === 3 && provider.calls.length === parallelBefore + 3, "concurrent workers send each message exactly once");

  await sql("update public.portal_email_messages set next_attempt_at = now() - interval '25 hours' where id = $1", [await queue("stale-old")]);
  await dispatchQueued(ctx());
  check((await statuses("dedupe_key = 'stale-old'")).expired === 1, "messages older than 24 hours expire instead of sending late");

  await queue("kill-switch");
  await setMode("disabled");
  const killBefore = provider.calls.length;
  await dispatchQueued(ctx());
  check((await statuses("dedupe_key = 'kill-switch'")).cancelled === 1 && provider.calls.length === killBefore, "kill switch (mode → dry run) cancels queued mail");
}

// --- stop latches: completion, classification, restore, contact change ------
await setMode("live");
config = { ...baseConfig, liveEnabled: true };
{
  await sql("update public.portal_email_settings set automation_enabled = true");
  await activateBooking(ctx({ bookingId: "b1" }));
  const automation = async () => (await sql("select * from public.portal_email_bookings where booking_id = 'b1'"))[0];

  await sql("update public.portal_checklist_items set status = 'needsReview' where booking_id = 'b1'");
  check((await automation()).stopped_reason === null, "awaiting review is not 100% complete");
  await sql("update public.portal_checklist_items set status = 'completed' where booking_id = 'b1'");
  check((await automation()).stopped_reason === "complete", "100% complete latches automatic emails off");
  await sql("update public.portal_checklist_items set status = 'waitingOnGuest' where title = 'Waiver'");
  check((await automation()).stopped_reason === "complete", "reopening a task does not resume emails by itself");
  const calls = provider.calls.length;
  await runScheduled(ctx({ now: new Date("2027-02-26T15:00:00Z") }));
  check(provider.calls.length === calls, "no catch-up email while stopped");
  const resumed = await changeAutomation({ db, bookingId: "b1", action: "resume" });
  check(resumed.stopped_reason === null && Date.parse(resumed.active_since) > Date.parse((await automation()).stopped_at || 0), "staff resume restarts from now");

  await sql("update public.bookings set status = 'Cancelled' where id = 'b1'");
  check((await automation()).stopped_reason === "booking_changed", "cancelling latches emails off");
  await expectError(changeAutomation({ db, bookingId: "b1", action: "resume" }), /cancelled/, "a cancelled booking cannot be resumed");
  await sql("update public.bookings set status = 'Confirmed' where id = 'b1'");
  check((await automation()).stopped_reason === "booking_changed", "reinstating does not resume emails by itself");
  await sql("update public.bookings set notes = 'unrelated edit' where id = 'b1'");
  await changeAutomation({ db, bookingId: "b1", action: "resume" });
  await sql("update public.bookings set notes = 'another edit' where id = 'b1'");
  check((await automation()).stopped_reason === null, "unrelated booking edits do not stop emails");

  await sql("update public.bookings set email = 'new-contact@example.org' where id = 'b1'");
  const selected = await sql("select email from public.portal_email_recipients where booking_id = 'b1' and selected order by email");
  check(!selected.some((r) => r.email === "new-contact@example.org"), "a new contact address is not enrolled silently");

  await changeAutomation({ db, bookingId: "b1", action: "pause" });
  await sql("update public.portal_checklist_items set email_assign = true, email_assigned_at = now() where title = 'Waiver'");
  const pausedRun = await runScheduled(ctx({ now: new Date(Date.now() + 20 * 60000) }));
  check(pausedRun.planned === 0, "paused booking gets no automatic emails");
  await changeAutomation({ db, bookingId: "b1", action: "resume" });
  const afterResume = await runScheduled(ctx({ now: new Date(Date.now() + 20 * 60000) }));
  check(afterResume.planned === 0, "a notice from before resume is not sent as catch-up");
  await sql("update public.portal_checklist_items set email_assigned_at = now() + interval '1 second' where title = 'Waiver'");
  const tooSoon = await runScheduled(ctx({ now: new Date(Date.now() + 5 * 60000) }));
  const newNotice = await runScheduled(ctx({ now: new Date(Date.now() + 20 * 60000) }));
  check(tooSoon.planned === 0 && newNotice.planned === 1, "a task assigned after resume gets one notice after the batch window");
  check(/New in your portal[\s\S]*Waiver/.test(provider.calls.at(-1).text), "the notice lists the new task");

  // Restore: deleting and re-inserting the booking (Full Replace) leaves emails off.
  await sql("delete from public.bookings where id = 'b1'");
  check((await sql("select count(*)::int as n from public.portal_email_bookings"))[0].n === 0, "deleted booking loses its email state");
  await sql("insert into public.bookings (id, organization_name, status, source_type, start_date) values ('b1', 'Oak Hill Youth', 'Confirmed', 'Staff Booking', '2027-03-10')");
  await sql("insert into public.portal_checklist_items (booking_id, title, due_date) values ('b1', 'Restored task', '2027-02-25')");
  const restored = await sql("select email_assign, email_reminders from public.portal_checklist_items where title = 'Restored task'");
  check(restored[0].email_assign === false && restored[0].email_reminders.length === 0, "restored booking and tasks come back with emails off");
  const restoredRun = await runScheduled(ctx({ now: new Date("2027-02-18T15:00:00Z") }));
  check(restoredRun.planned === 0, "restore replays nothing");
}

// --- delivery webhook ---------------------------------------------------------
{
  const [accepted] = await sql("select provider_message_id from public.portal_email_messages where status = 'accepted' limit 1");
  await db.rpc("portal_email_webhook", { p_provider_id: accepted.provider_message_id, p_status: "delivered", p_detail: "Delivered." });
  check((await sql("select status from public.portal_email_messages where provider_message_id = $1", [accepted.provider_message_id]))[0].status === "delivered", "webhook confirms delivery separately from acceptance");
}

console.log(`\n${checks} checks passed.`);
