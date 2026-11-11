import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  decideDelivery,
  getContactEmails,
  getDueEvents,
  getEmailIneligibleReason,
  getStopReason,
  getLocalDate,
  getLocalHour,
  getTemplateProblems,
  getUpcomingEmails,
  isValidEmail,
  planAutomaticMessages,
  renderEmail,
} from "../src/utils/portalEmail.js";
import { isPortalComplete } from "../src/utils/portalRules.js";
import { withoutEmailOptions } from "../src/services/backupData.js";
import { createResendProvider, readEmailConfig } from "../supabase/functions/portal-email/provider.js";

const settings = { mode: "live", mode_epoch: 3, automation_enabled: true };
const readyConfig = {
  providerReady: true,
  problems: [],
  portalBaseUrl: "https://portal.example.org",
  testAllowlist: new Set(["tester@example.org"]),
  liveEnabled: true,
};

function makeBooking(overrides = {}) {
  return {
    row: {
      id: "b1",
      portal_token: "tok123",
      organization_name: "Oak Hill Youth",
      source_type: "Staff Booking",
      status: "Confirmed",
      waitlist: "No",
      start_date: "2026-12-20",
      end_date: "2026-12-22",
      ...overrides.row,
    },
    automation: { enabled: true, paused: false, mode_epoch: 3, active_since: "2026-11-01T12:00:00Z", stopped_reason: null, ...overrides.automation },
    recipients: overrides.recipients || [
      { email: "lead@example.org", selected: true },
      { email: "other@example.org", selected: false },
    ],
    bounced: overrides.bounced || [],
    event_keys: overrides.event_keys || [],
    items: overrides.items || [
      { id: "1", title: "Final guest count", status: "notStarted", guest_action: "mark_ready", due_date: "2026-12-01", email_reminders: ["7d", "2d", "overdue"], email_assign: false, email_changes: false, email_assigned_at: "2026-10-01T00:00:00Z" },
    ],
    documents: overrides.documents || [],
  };
}

// 9:30 New York time on a date (EST in winter: 14:30 UTC).
const nyWinter = (date, time = "14:30") => new Date(`${date}T${time}:00Z`);

test("New York dates and processing hour follow daylight saving", () => {
  // Spring forward 2026-03-08, fall back 2026-11-01.
  assert.equal(getLocalDate(new Date("2026-03-08T04:59:00Z")), "2026-03-07");
  assert.equal(getLocalDate(new Date("2026-03-08T05:00:00Z")), "2026-03-08");
  assert.equal(getLocalDate(new Date("2026-11-01T03:59:00Z")), "2026-10-31");
  assert.equal(getLocalDate(new Date("2026-11-01T04:00:00Z")), "2026-11-01");
  assert.equal(getLocalHour(new Date("2026-07-10T12:59:00Z")), 8); // EDT
  assert.equal(getLocalHour(new Date("2026-07-10T13:00:00Z")), 9);
  assert.equal(getLocalHour(new Date("2026-11-02T13:59:00Z")), 8); // EST
  assert.equal(getLocalHour(new Date("2026-11-02T14:00:00Z")), 9);
  assert.equal(addDays("2026-03-09", -7), "2026-03-02");
  assert.equal(addDays("2026-11-02", -2), "2026-10-31");
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
});

test("reminders fire only on their own day, after 9:00, and overdue from the day after the due date", () => {
  const booking = makeBooking();
  const triggers = (now) => getDueEvents(booking, now).map((event) => event.trigger);

  assert.deepEqual(triggers(nyWinter("2026-11-24")), ["7d"]);
  assert.deepEqual(triggers(nyWinter("2026-11-24", "13:59")), [], "8:59 is before processing time");
  assert.deepEqual(triggers(nyWinter("2026-11-25")), [], "past 7-day window is not replayed");
  assert.deepEqual(triggers(nyWinter("2026-11-29")), ["2d"]);
  assert.deepEqual(triggers(nyWinter("2026-12-01")), [], "due date itself is not overdue");
  assert.deepEqual(triggers(nyWinter("2026-12-02")), ["overdue"]);
  assert.deepEqual(triggers(nyWinter("2026-12-09")), ["overdue"], "first run after cutoff; ledger keeps it to once");
  assert.deepEqual(triggers(nyWinter("2026-12-20")), [], "retreat started");
});

test("reminders around a daylight-saving change use calendar days", () => {
  const booking = makeBooking({
    row: { start_date: "2027-01-10" },
    items: [{ id: "1", title: "Waiver", status: "waitingOnGuest", guest_action: "upload_file", due_date: "2026-11-03", email_reminders: ["2d"] }],
  });
  // 2 days before Nov 3 is Nov 1, the fall-back day: 9:00 EST = 14:00 UTC.
  assert.deepEqual(getDueEvents(booking, new Date("2026-11-01T13:59:00Z")).length, 0);
  assert.deepEqual(getDueEvents(booking, new Date("2026-11-01T14:00:00Z")).map((e) => e.trigger), ["2d"]);
});

test("items without due dates, opted out, or not waiting on the guest get no reminders", () => {
  const base = { title: "T", guest_action: "mark_ready", email_reminders: ["7d", "2d", "overdue"] };
  const booking = makeBooking({
    items: [
      { ...base, id: "nodate", status: "notStarted", due_date: null },
      { ...base, id: "optout", status: "notStarted", due_date: "2026-12-01", email_reminders: [] },
      { ...base, id: "review", status: "needsReview", due_date: "2026-12-01" },
      { ...base, id: "done", status: "completed", due_date: "2026-12-01" },
      { ...base, id: "staffonly", status: "notStarted", guest_action: "none", due_date: "2026-12-01" },
    ],
  });
  assert.deepEqual(getDueEvents(booking, nyWinter("2026-12-05")), []);
});

test("assignment and change notices: only after activation, after the batch window, while new", () => {
  const now = new Date("2026-11-04T15:00:00Z");
  const booking = makeBooking({
    items: [
      { id: "a", title: "New", status: "notStarted", guest_action: "mark_ready", email_assign: true, email_assigned_at: "2026-11-04T14:30:00Z" },
      { id: "b", title: "Too fresh", status: "notStarted", guest_action: "mark_ready", email_assign: true, email_assigned_at: "2026-11-04T14:55:00Z" },
      { id: "c", title: "Before activation", status: "notStarted", guest_action: "mark_ready", email_assign: true, email_assigned_at: "2026-10-30T00:00:00Z" },
      { id: "d", title: "Sent back", status: "waitingOnGuest", guest_action: "upload_file", email_changes: true, email_changes_requested_at: "2026-11-04T14:00:00Z" },
      { id: "e", title: "Sent back, opted out", status: "waitingOnGuest", guest_action: "upload_file", email_changes: false, email_changes_requested_at: "2026-11-04T14:00:00Z" },
    ],
    documents: [
      { id: "doc1", title: "Map", email_assign: true, email_assigned_at: "2026-11-04T14:00:00Z" },
      { id: "doc2", title: "Guest upload", uploaded_by_guest: true, email_assign: true, email_assigned_at: "2026-11-04T14:00:00Z" },
    ],
  });
  assert.deepEqual(
    getDueEvents(booking, now).map((event) => `${event.table}:${event.id}:${event.trigger}`),
    ["task:a:assigned", "task:d:changes", "document:doc1:assigned"]
  );
  // Three days later the assignment is no longer new.
  assert.equal(getDueEvents(booking, new Date("2026-11-08T15:00:00Z")).length, 0);
});

test("one combined email per selected, non-bounced recipient; keys bind epoch, recipient and due date", () => {
  const booking = makeBooking({
    recipients: [
      { email: "lead@example.org", selected: true },
      { email: "unselected@example.org", selected: false },
      { email: "bounced@example.org", selected: true },
    ],
    bounced: ["bounced@example.org"],
    items: [
      { id: "1", title: "A", status: "notStarted", guest_action: "mark_ready", due_date: "2026-12-01", email_reminders: ["7d"] },
      { id: "2", title: "B", status: "notStarted", guest_action: "mark_ready", due_date: "2026-12-01", email_reminders: ["7d"] },
    ],
  });
  const messages = planAutomaticMessages(booking, settings, nyWinter("2026-11-24"));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].recipient, "lead@example.org");
  assert.deepEqual(messages[0].items.map((item) => item.key), [
    "3|lead@example.org|7d|task:1|2026-12-01",
    "3|lead@example.org|7d|task:2|2026-12-01",
  ]);
});

test("eligibility uses the shared classification, not portal visibility", () => {
  const row = makeBooking().row;
  assert.equal(getEmailIneligibleReason(row), "");
  assert.match(getEmailIneligibleReason({ ...row, status: "Cancelled" }), /cancelled/);
  assert.match(getEmailIneligibleReason({ ...row, date_of_cancellation: "2026-10-01" }), /cancelled/);
  assert.match(getEmailIneligibleReason({ ...row, waitlist: "Yes" }), /waitlisted/);
  assert.match(getEmailIneligibleReason({ ...row, organization_name: "Host: Staff Retreat" }), /Host/);
  assert.match(getEmailIneligibleReason({ ...row, source_type: "Archive" }), /Archived/);
  assert.match(getEmailIneligibleReason({ ...row, source_type: "Guest Group Inquiries 2027" }), /Inquiries/);
  assert.match(getEmailIneligibleReason({ ...row, portal_token: "" }), /portal link/);
  assert.match(getEmailIneligibleReason(null), /no longer exists/);
});

function message(overrides = {}) {
  return {
    id: "m1",
    trigger: "automatic",
    mode: "live",
    mode_epoch: 3,
    recipient: "lead@example.org",
    items: [{ table: "task", id: "1", trigger: "7d", version: "2026-12-01" }],
    ...overrides,
  };
}

test("delivery decision: mode, server configuration and allowlist fail closed for every trigger", () => {
  const booking = makeBooking();
  const now = nyWinter("2026-11-24");
  const decide = (msg, overrides = {}) =>
    decideDelivery({ message: msg, settings: { ...settings, ...overrides.settings }, booking, config: { ...readyConfig, ...overrides.config }, now });

  assert.equal(decide(message()).action, "send");
  assert.equal(decide(message({ mode: "disabled" }), { settings: { mode: "disabled" } }).action, "simulated");
  assert.equal(decide(message(), { config: { providerReady: false, problems: ["RESEND_API_KEY is not set."] } }).action, "blocked");
  assert.equal(decide(message(), { config: { liveEnabled: false } }).action, "blocked");
  assert.equal(decide(message({ mode_epoch: 2 })).action, "cancelled", "queued under an older mode");
  assert.equal(decide(message({ mode: "test" }), { settings: { mode: "test" } }).action, "blocked");

  for (const trigger of ["welcome", "manual_welcome", "manual_reminder"]) {
    const result = decide(message({ trigger, mode: "test", items: [] }), { settings: { mode: "test" } });
    assert.equal(result.action, "blocked", `${trigger} to a guest in test mode`);
    assert.match(result.detail, /allowlist/);
  }
  assert.equal(decide(message({ trigger: "test", recipient: "lead@example.org", items: [] })).action, "blocked");
  assert.equal(decide(message({ trigger: "test", recipient: "tester@example.org", items: [] })).action, "send");
});

test("delivery decision rechecks booking, recipient, pause, stop, completion and items", () => {
  const now = nyWinter("2026-11-24");
  const decide = (booking, msg = message(), s = settings) =>
    decideDelivery({ message: msg, settings: s, booking, config: readyConfig, now });
  const suppressed = (booking, msg, s) => assert.equal(decide(booking, msg, s).action, "suppressed");

  suppressed(null);
  suppressed(makeBooking({ row: { status: "Cancelled" } }));
  suppressed(makeBooking({ row: { status: "Waitlist" } }));
  suppressed(makeBooking({ row: { source_type: "Archive" } }));
  suppressed(makeBooking({ recipients: [{ email: "lead@example.org", selected: false }] }), message(), settings);
  suppressed(makeBooking({ bounced: ["lead@example.org"] }));
  suppressed(makeBooking({ automation: { paused: true } }));
  suppressed(makeBooking({ automation: { enabled: false } }));
  suppressed(makeBooking({ automation: { stopped_reason: "complete" } }));
  suppressed(makeBooking({ automation: { mode_epoch: 2 } }));
  suppressed(makeBooking(), message(), { ...settings, automation_enabled: false });
  suppressed(makeBooking({ items: [{ id: "1", status: "completed", guest_action: "mark_ready", due_date: "2026-12-01", email_reminders: ["7d"] }] }));
  suppressed(makeBooking({ items: [{ id: "1", status: "needsReview", guest_action: "mark_ready", due_date: "2026-12-01", email_reminders: ["7d"] }] }));
  suppressed(makeBooking({ items: [{ id: "1", status: "notStarted", guest_action: "mark_ready", due_date: "2026-12-03", email_reminders: ["7d"] }] }), message(), settings);
  suppressed(makeBooking({ items: [{ id: "1", status: "notStarted", guest_action: "mark_ready", due_date: "2026-12-01", email_reminders: [] }] }));
  suppressed(makeBooking({ items: [] }));
  suppressed(makeBooking({ row: { start_date: "2026-11-24" } }));

  const complete = makeBooking({ items: [{ id: "1", status: "completed", guest_action: "mark_ready" }] });
  suppressed(complete, message({ trigger: "welcome", items: [] }));
  suppressed(complete, message({ trigger: "manual_welcome", items: [] }));
  assert.equal(decide(complete, message({ trigger: "manual_welcome", items: [], confirm_completed: true })).action, "send");
});

test("upcoming preview lists future windows, never past ones, and skips sent events", () => {
  const booking = makeBooking();
  const upcoming = getUpcomingEmails(booking, settings, nyWinter("2026-11-26"));
  assert.deepEqual(upcoming.map((entry) => `${entry.date}:${entry.trigger}`), ["2026-11-29:2d", "2026-12-02:overdue"]);

  const overdueNow = getUpcomingEmails(booking, settings, nyWinter("2026-12-05"));
  assert.deepEqual(overdueNow.map((entry) => `${entry.date}:${entry.trigger}`), ["2026-12-05:overdue"]);
  const sent = makeBooking({ event_keys: ["3|lead@example.org|overdue|task:1|2026-12-01"] });
  assert.deepEqual(getUpcomingEmails(sent, settings, nyWinter("2026-12-05")), []);
  assert.deepEqual(getUpcomingEmails(makeBooking({ automation: { paused: true } }), settings, nyWinter("2026-11-26")), []);
});

test("templates: unknown placeholders are rejected and content is HTML-escaped", () => {
  assert.deepEqual(getTemplateProblems("Hi {{group_name}} on {{ retreat_dates }}"), []);
  assert.match(getTemplateProblems("Hi {{portal_token}}").join(" "), /Unknown placeholder/);
  assert.match(getTemplateProblems("Hi {{group_name}").join(" "), /double braces/);
  assert.match(getTemplateProblems("a\nb", { singleLine: true }).join(" "), /one line/);

  const email = renderEmail({
    template: { subject: "For {{group_name}}", body: "Hello {{group_name}}\n\nSecond paragraph" },
    context: { group_name: '<script>alert("x")</script>' },
    sections: [{ title: "Still to do", entries: [{ title: "<b>Waiver</b>", note: "due 12/1/2026" }] }],
    portalUrl: "https://portal.example.org/?portal=tok",
    isTest: true,
  });
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(email.html.includes("&lt;b&gt;Waiver&lt;/b&gt;"));
  assert.match(email.subject, /^\[TEST\] For /);
  assert.match(email.text, /Open your group portal: https:\/\/portal\.example\.org\/\?portal=tok/);
  assert.match(email.html, /<html lang="en">/);
});

test("recipient addresses are validated and contact fields split", () => {
  assert.ok(isValidEmail(" Lead@Example.org "));
  for (const bad of ["", "a@b", "a b@c.org", "a@b.org, c@d.org", "<a@b.org>", "a@-b.org"]) {
    assert.equal(isValidEmail(bad), false, bad);
  }
  assert.deepEqual(getContactEmails("A@x.org; b@y.org,a@x.org bad"), ["a@x.org", "b@y.org"]);
});

test("100% complete means every task confirmed; review is not complete", () => {
  assert.equal(isPortalComplete([]), false);
  assert.equal(isPortalComplete([{ status: "completed" }, { status: "needsReview" }]), false);
  assert.equal(isPortalComplete([{ status: "completed" }]), true);
});

test("restored portal rows lose their email options", () => {
  assert.deepEqual(withoutEmailOptions({ id: 1, title: "T", email_assign: true, email_reminders: ["7d"], email_assigned_at: "x" }), { id: 1, title: "T" });
});

test("server configuration fails closed and the allowlist starts empty", () => {
  const empty = readEmailConfig({});
  assert.equal(empty.providerReady, false);
  assert.equal(empty.liveEnabled, false);
  assert.equal(empty.testAllowlist.size, 0);
  assert.equal(readEmailConfig({ PORTAL_EMAIL_LIVE_ENABLED: "yes" }).liveEnabled, false);
  const ready = readEmailConfig({
    PORTAL_EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_x",
    PORTAL_EMAIL_PORTAL_BASE_URL: "http://insecure.example.org",
  });
  assert.equal(ready.providerReady, false, "portal address must be https");
});

test("Resend adapter: idempotency key, retryable vs permanent errors, and no-response as uncertain", async () => {
  const calls = [];
  const respond = (status, body) => async (url, init) => {
    calls.push(init);
    return new Response(JSON.stringify(body), { status });
  };
  const email = { idempotencyKey: "msg-1", from: "f", to: "t@example.org", subject: "s", html: "h", text: "t" };

  assert.deepEqual(await createResendProvider({ apiKey: "k", fetchImpl: respond(200, { id: "abc" }) }).send(email), { ok: true, id: "abc" });
  assert.equal(calls[0].headers["Idempotency-Key"], "msg-1");
  assert.equal((await createResendProvider({ apiKey: "k", fetchImpl: respond(503, {}) }).send(email)).retryable, true);
  assert.equal((await createResendProvider({ apiKey: "k", fetchImpl: respond(429, { name: "rate_limit_exceeded" }) }).send(email)).retryable, true);
  const permanent = await createResendProvider({ apiKey: "k", fetchImpl: respond(422, { name: "invalid_parameter", message: "bad lead@example.org" }) }).send(email);
  assert.equal(permanent.retryable, false);
  assert.ok(!permanent.detail.includes("@"), "provider text is not copied into history");
  const lost = await createResendProvider({ apiKey: "k", fetchImpl: async () => { throw new Error("network"); } }).send(email);
  assert.equal(lost.uncertain, true);
});

test("hosting never gets guest email, even if converted after the email was queued", () => {
  const now = nyWinter("2026-11-24");
  const decide = (booking, msg) => decideDelivery({ message: msg, settings, booking, config: readyConfig, now });
  // Converted to hosting after queueing: the final send step rechecks and suppresses.
  for (const row of [{ retreat_type: "Hosting" }, { organization_name: "Hosting - Fictional Board" }]) {
    const booking = makeBooking({ row });
    assert.match(getEmailIneligibleReason(booking.row), /Hosting entries never get guest emails/);
    for (const trigger of ["welcome", "automatic", "manual_welcome", "manual_reminder"]) {
      assert.equal(decide(booking, message({ trigger })).action, "suppressed", trigger);
    }
    assert.equal(getStopReason(booking), "ineligible");
  }
});
