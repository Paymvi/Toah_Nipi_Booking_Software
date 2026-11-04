import {
  BOOKING_EXCEPTION,
  RECORD_KIND,
  getBookingException,
  getRecordKind,
} from "./bookingClassification.js";
import { formatDate, formatDateRange } from "./dateUtils.js";
import { isPortalComplete } from "./portalRules.js";

/*
  Guest portal email rules, shared by Portal Admin, the portal-email Edge
  Function and the tests. Pure: no Supabase, no provider, no clock (the
  caller passes `now`).

  Booking state ("booking" below) is what public.portal_email_load returns
  per booking: { row, automation, recipients, bounced, event_keys, items,
  documents }, with database (snake_case) field names.
*/

export const EMAIL_MODE_LABELS = Object.freeze({
  disabled: "Dry run (no emails sent)",
  test: "Test (allowlisted test inboxes only)",
  live: "Live (real guest emails)",
});

export const REMINDER_OPTIONS = Object.freeze([
  { value: "7d", label: "7 days before", daysBefore: 7 },
  { value: "2d", label: "2 days before", daysBefore: 2 },
  { value: "overdue", label: "Once when overdue" },
]);

export const EMAIL_TIME_ZONE = "America/New_York";
// Deadline reminders go out on the first scheduled run at or after 9:00 New York time.
export const REMINDER_PROCESSING_HOUR = 9;
// Assignment and change-request notices wait this long so several changes go in one email.
export const NOTICE_BATCH_MINUTES = 10;
// A notice older than this is no longer "new" and is not sent.
export const NOTICE_MAX_AGE_DAYS = 3;

export const EMAIL_FROM = "Toah Nipi <contactus@toahnipi.org>";
export const EMAIL_REPLY_TO = "contactus@toahnipi.org";
export const TEMPLATE_PLACEHOLDERS = Object.freeze(["group_name", "contact_name", "retreat_dates"]);

export const STOP_REASON_TEXT = Object.freeze({
  complete: "The portal reached 100% complete, so automatic emails stopped.",
  ineligible: "The booking stopped being eligible (cancelled, waitlisted, host, archive or inquiry).",
  booking_changed: "The booking's status or classification changed, so automatic emails stopped for review.",
});

/* ---------------- New York calendar dates ---------------- */

function getLocalParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EMAIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function getLocalDate(now) {
  const parts = getLocalParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getLocalHour(now) {
  return Number(getLocalParts(now).hour);
}

// Date-only arithmetic in UTC, so daylight-saving changes cannot shift it.
export function addDays(date, days) {
  const value = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/* ---------------- Recipients ---------------- */

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

const EMAIL_PATTERN =
  /^[^\s@<>,;"()[\]\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

// bookings.email can hold more than one address ("a@x.org; b@y.org").
export function getContactEmails(text) {
  return [...new Set(String(text ?? "").split(/[\s,;]+/).map(normalizeEmail).filter(isValidEmail))];
}

export function getSelectedRecipients(booking) {
  return (booking?.recipients || [])
    .filter((recipient) => recipient.selected && isValidEmail(recipient.email))
    .map((recipient) => normalizeEmail(recipient.email));
}

/* ---------------- Eligibility ---------------- */

function toClassificationBooking(row) {
  return {
    id: row.id,
    organizationName: row.organization_name,
    status: row.status,
    waitlist: row.waitlist,
    sourceType: row.source_type,
    detectedImportType: row.detected_import_type,
    sourceSheet: row.source_sheet,
    retreatType: row.retreat_type,
    dateOfCancellation: row.date_of_cancellation,
    rentalFormDetails: row.rental_form_details,
  };
}

/*
  Guest emails go only to ordinary bookings that are going ahead, using
  the shared classification. Having portal tasks is not enough: Portal
  Admin also lists cancelled and host records that already have tasks.
*/
export function getEmailIneligibleReason(row) {
  if (!row) return "The booking no longer exists.";
  const booking = toClassificationBooking(row);
  const exception = getBookingException(booking);
  if (exception === BOOKING_EXCEPTION.CANCELLED) return "The booking is cancelled.";
  if (exception === BOOKING_EXCEPTION.WAITLIST) return "The booking is waitlisted.";
  const kind = getRecordKind(booking);
  if (kind === RECORD_KIND.HOST) return "Host records never get guest emails.";
  if (kind === RECORD_KIND.ARCHIVE) return "Archived visits never get guest emails.";
  if (kind === RECORD_KIND.INQUIRY) return "Inquiries never get portal emails.";
  if (!row.portal_token) return "The booking has no portal link.";
  return "";
}

// Items the guest still has to act on. Staff-only items (no guest action),
// items awaiting staff review and confirmed items are excluded.
export function isGuestActionNeeded(item) {
  return (
    Boolean(item?.guest_action) &&
    item.guest_action !== "none" &&
    (item.status === "notStarted" || item.status === "waitingOnGuest")
  );
}

export function itemHasEmailOptions(item) {
  return Boolean(item?.email_assign || item?.email_changes || item?.email_reminders?.length);
}

export function isRetreatStarted(row, today) {
  return Boolean(row?.start_date) && String(row.start_date).slice(0, 10) <= today;
}

export function isBookingPortalComplete(booking) {
  return isPortalComplete(booking?.items || []);
}

// Why automatic emails are not running for this booking ("" = running).
export function getAutomationBlock(booking, settings) {
  const automation = booking?.automation;
  if (!automation?.enabled) return "Portal emails are not enabled for this booking.";
  if (automation.mode_epoch !== settings.mode_epoch) {
    return "Portal emails were enabled under a different email mode. Enable them again to use the current mode.";
  }
  if (automation.stopped_reason) return STOP_REASON_TEXT[automation.stopped_reason] || "Stopped.";
  if (automation.paused) return "Paused by staff.";
  return "";
}

// A new reason to latch automatic emails off, or "".
export function getStopReason(booking) {
  if (getEmailIneligibleReason(booking?.row)) return "ineligible";
  if (isBookingPortalComplete(booking)) return "complete";
  return "";
}

/* ---------------- Planning ---------------- */

/*
  The item events due at `now`. Deadline reminders only ever fire on their
  own calendar day (7 or 2 days before), so missed or past windows are
  never replayed; the overdue reminder fires once per due date, on the
  first run from the day after the due date. Notices only cover changes
  made after automation started (or resumed).
*/
export function getDueEvents(booking, now) {
  const today = getLocalDate(now);
  const nowMs = now.getTime();
  const since = Date.parse(booking.automation?.active_since || "");
  const reminderTime = getLocalHour(now) >= REMINDER_PROCESSING_HOUR;
  const started = isRetreatStarted(booking.row, today);
  const isNewNotice = (at) => {
    const time = Date.parse(at || "");
    return (
      time > since &&
      time <= nowMs - NOTICE_BATCH_MINUTES * 60000 &&
      time > nowMs - NOTICE_MAX_AGE_DAYS * 86400000
    );
  };
  const events = [];

  for (const item of booking.items || []) {
    if (!isGuestActionNeeded(item)) continue;
    const event = (trigger, version) => ({ table: "task", id: String(item.id), trigger, version: String(version) });
    if (item.email_assign && isNewNotice(item.email_assigned_at)) {
      events.push(event("assigned", item.email_assigned_at));
    }
    if (item.email_changes && isNewNotice(item.email_changes_requested_at)) {
      events.push(event("changes", item.email_changes_requested_at));
    }
    const dueDate = String(item.due_date || "").slice(0, 10);
    const reminders = item.email_reminders || [];
    if (!dueDate || started || !reminderTime) continue;
    for (const option of REMINDER_OPTIONS) {
      if (!reminders.includes(option.value)) continue;
      const fires = option.daysBefore
        ? today === addDays(dueDate, -option.daysBefore)
        : today >= addDays(dueDate, 1);
      if (fires) events.push(event(option.value, dueDate));
    }
  }

  for (const document of booking.documents || []) {
    if (!document.uploaded_by_guest && document.email_assign && isNewNotice(document.email_assigned_at)) {
      events.push({ table: "document", id: String(document.id), trigger: "assigned", version: String(document.email_assigned_at) });
    }
  }

  return events;
}

export function getEventKey(epoch, recipient, event) {
  return `${epoch}|${recipient}|${event.trigger}|${event.table}:${event.id}|${event.version}`;
}

// One combined email per selected recipient with every event due now.
export function planAutomaticMessages(booking, settings, now) {
  const events = getDueEvents(booking, now);
  if (events.length === 0) return [];
  return getSelectedRecipients(booking)
    .filter((recipient) => !(booking.bounced || []).includes(recipient))
    .map((recipient) => ({
      // No dedupe_key: portal_email_enqueue derives it from the event keys.
      booking_id: booking.row.id,
      booking_label: booking.row.organization_name,
      trigger: "automatic",
      template_key: "update",
      recipient,
      items: events.map((event) => ({ ...event, key: getEventKey(settings.mode_epoch, recipient, event) })),
    }));
}

/*
  Preview of what automation will send: notices due now, then each
  reminder day in the next `days` days. Already-sent events are left out.
*/
export function getUpcomingEmails(booking, settings, now, days = 45) {
  if (getAutomationBlock(booking, settings) || getStopReason(booking)) return [];
  const sent = new Set(booking.event_keys || []);
  const seen = new Set();
  const upcoming = [];
  const today = getLocalDate(now);
  const add = (date, events, onlyReminders) => {
    for (const event of events) {
      if (onlyReminders === (event.trigger === "assigned" || event.trigger === "changes")) continue;
      const recipients = getSelectedRecipients(booking).filter(
        (recipient) => !sent.has(getEventKey(settings.mode_epoch, recipient, event))
      );
      const id = `${event.trigger}|${event.table}:${event.id}|${event.version}`;
      if (recipients.length === 0 || seen.has(id)) continue;
      seen.add(id);
      upcoming.push({ date, ...event, title: getEventTitle(booking, event), recipients });
    }
  };

  add(today, getDueEvents(booking, new Date(now.getTime() + NOTICE_BATCH_MINUTES * 60000)), false);
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(today, offset);
    // 14:30 UTC is 9:30 or 10:30 in New York: after processing time, same date.
    const runTime = new Date(Math.max(now.getTime(), Date.parse(`${date}T14:30:00Z`)));
    add(date, getDueEvents(booking, runTime), true);
  }
  return upcoming;
}

function getEventTitle(booking, event) {
  const list = event.table === "document" ? booking.documents : booking.items;
  return (list || []).find((entry) => String(entry.id) === event.id)?.title || "Untitled";
}

/* ---------------- Delivery decision ---------------- */

// Events from a queued message that still apply now.
function getStillDueItems(message, booking, now) {
  const started = isRetreatStarted(booking.row, getLocalDate(now));
  return (message.items || []).filter((event) => {
    if (event.table === "document") {
      const document = (booking.documents || []).find((entry) => String(entry.id) === event.id);
      return Boolean(document?.email_assign);
    }
    const item = (booking.items || []).find((entry) => String(entry.id) === event.id);
    if (!item || !isGuestActionNeeded(item)) return false;
    if (event.trigger === "assigned") return Boolean(item.email_assign);
    if (event.trigger === "changes") {
      return Boolean(item.email_changes) && String(item.email_changes_requested_at) === event.version;
    }
    return (
      !started &&
      (item.email_reminders || []).includes(event.trigger) &&
      String(item.due_date || "").slice(0, 10) === event.version
    );
  });
}

function getOutstandingItems(booking, onlyEmailEnabled) {
  return (booking.items || [])
    .filter((item) => isGuestActionNeeded(item) && (!onlyEmailEnabled || itemHasEmailOptions(item)))
    .map((item) => ({ table: "task", id: String(item.id), trigger: "outstanding", version: "" }));
}

// Mode rules apply to every message, manual or automatic.
function getModeDecision(message, config) {
  const recipient = normalizeEmail(message.recipient);
  if (message.mode === "disabled") return { action: "simulated", detail: "Dry run: no email was sent." };
  if (!config.providerReady) {
    return { action: "blocked", detail: `Email sending is not configured on the server. ${config.problems.join(" ")}` };
  }
  if (message.mode === "test" && !config.testAllowlist.has(recipient)) {
    return { action: "blocked", detail: "Test mode: this address is not on the server's test allowlist." };
  }
  if (message.mode === "live" && !config.liveEnabled) {
    return { action: "blocked", detail: "Live sending is not enabled on the server (PORTAL_EMAIL_LIVE_ENABLED)." };
  }
  return { action: "send", detail: "" };
}

/*
  The one check every delivery passes immediately before the provider is
  called: mode, server configuration, recipients, eligibility, pause and
  stop state, and whether each item still needs the guest.
  Returns { action: send | simulated | blocked | suppressed | cancelled, detail, items }.
*/
export function decideDelivery({ message, settings, booking, config, now }) {
  const stop = (action, detail) => ({ action, detail, items: [] });

  if (message.mode !== settings.mode || message.mode_epoch !== settings.mode_epoch) {
    return stop("cancelled", "The email mode changed after this was queued.");
  }

  const recipient = normalizeEmail(message.recipient);
  if (!isValidEmail(recipient)) return stop("blocked", "The recipient address is not valid.");
  let items = [];

  if (message.trigger === "test") {
    if (!config.testAllowlist.has(recipient)) {
      return stop("blocked", "Test emails go only to addresses on the server's test allowlist.");
    }
    if (message.use_real_data) {
      if (!booking) return stop("suppressed", "The booking chosen for this test no longer exists.");
      items = getOutstandingItems(booking, false);
    }
  } else {
    if (!booking) return stop("suppressed", "The booking no longer exists.");
    const ineligible = getEmailIneligibleReason(booking.row);
    if (ineligible) return stop("suppressed", ineligible);
    if (!getSelectedRecipients(booking).includes(recipient)) {
      return stop("suppressed", "This address is no longer a selected recipient for the booking.");
    }
    if ((booking.bounced || []).includes(recipient)) {
      return stop("suppressed", "An earlier email to this address bounced.");
    }
    const complete = isBookingPortalComplete(booking);

    if (message.trigger === "welcome" || message.trigger === "automatic") {
      const block = getAutomationBlock(booking, settings);
      if (block) return stop("suppressed", block);
      if (complete) return stop("suppressed", STOP_REASON_TEXT.complete);
    }
    if (message.trigger === "automatic") {
      if (!settings.automation_enabled) return stop("suppressed", "Automatic emails are turned off.");
      items = getStillDueItems(message, booking, now);
      if (items.length === 0) return stop("suppressed", "Nothing in this email still needs the guest's action.");
    } else if (message.trigger === "manual_reminder") {
      items = getOutstandingItems(booking, true);
      if (items.length === 0) {
        return stop("suppressed", "No outstanding tasks with email options turned on.");
      }
    } else {
      if (message.trigger === "manual_welcome" && complete && !message.confirm_completed) {
        return stop("suppressed", "The portal is 100% complete; a welcome resend needs explicit confirmation.");
      }
      items = getOutstandingItems(booking, false);
    }
  }

  const mode = getModeDecision(message, config);
  return { ...mode, items };
}

/* ---------------- Templates and rendering ---------------- */

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

// Same rule as public.portal_email_template_ok in the migration.
export function getTemplateProblems(text, { maxLength = 5000, singleLine = false } = {}) {
  const value = String(text ?? "");
  const problems = [];
  if (!value.trim()) problems.push("It cannot be empty.");
  if (value.length > maxLength) problems.push(`It must be ${maxLength} characters or fewer.`);
  if (singleLine && /[\r\n]/.test(value)) problems.push("It must be one line.");
  const unknown = [...value.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1])
    .filter((name) => !TEMPLATE_PLACEHOLDERS.includes(name));
  if (unknown.length) problems.push(`Unknown placeholder: ${unknown.map((name) => `{{${name}}}`).join(", ")}.`);
  if (/\{\{|\}\}/.test(value.replace(/\{\{\s*[a-z_]+\s*\}\}/g, ""))) {
    problems.push("Check the double braces: placeholders look like {{group_name}}.");
  }
  return problems;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fillTemplate(text, context) {
  return String(text ?? "").replace(PLACEHOLDER_PATTERN, (_, name) => String(context[name] ?? ""));
}

export function getEmailContext(row) {
  return {
    group_name: String(row?.organization_name || "your group").trim(),
    contact_name: String(row?.contact_name || "").trim(),
    retreat_dates: formatDateRange(row?.start_date, row?.end_date) || "dates to be confirmed",
  };
}

// Synthetic data for test sends that did not opt in to a real booking.
export const SAMPLE_BOOKING_ROW = Object.freeze({
  id: "sample",
  organization_name: "Sample Retreat Group (test)",
  contact_name: "Sample Contact",
  start_date: "2027-06-04",
  end_date: "2027-06-06",
  portal_token: "sample-test-link-not-real",
});

// Same link format as Portal Admin's Copy Link (?portal=<token>).
export function buildPortalLink(baseUrl, portalToken) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  return base && portalToken ? `${base}/?portal=${encodeURIComponent(portalToken)}` : "";
}

const SECTION_TITLES = [
  ["changes", "Changes requested"],
  ["overdue", "Past due"],
  ["2d", "Due in 2 days"],
  ["7d", "Due in 7 days"],
  ["assigned", "New in your portal"],
  ["outstanding", "Still to do"],
];

// Resolves message events to current titles and due dates, grouped for the email.
export function getEmailSections(booking, items) {
  return SECTION_TITLES.map(([trigger, title]) => ({
    title,
    entries: items
      .filter((event) => event.trigger === trigger)
      .map((event) => {
        const list = event.table === "document" ? booking?.documents : booking?.items;
        const source = (list || []).find((entry) => String(entry.id) === event.id) || {};
        const due = event.table === "task" && source.due_date ? `due ${formatDate(String(source.due_date).slice(0, 10))}` : "";
        const label = event.table === "document" ? "document shared with you" : "";
        return { title: source.title || "Untitled", note: [label, due].filter(Boolean).join(", ") };
      }),
  })).filter((section) => section.entries.length > 0);
}

export function renderEmail({ template, context, sections = [], portalUrl, isTest = false }) {
  const subject = `${isTest ? "[TEST] " : ""}${fillTemplate(template.subject, context)}`.replace(/[\r\n]+/g, " ").trim();
  const paragraphs = fillTemplate(template.body, context)
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const linkText = "Open your group portal";
  const privacy = "This private link opens your group's portal. Please share it only with your group's leadership team.";
  const contact = `Questions? Reply to this email or write to ${EMAIL_REPLY_TO}.`;
  const testNote = isTest ? "This is a test email from Toah Nipi's booking system." : "";

  const text = [
    testNote,
    ...paragraphs,
    ...sections.map(
      (section) =>
        `${section.title}\n${section.entries.map((entry) => `- ${entry.title}${entry.note ? ` (${entry.note})` : ""}`).join("\n")}`
    ),
    portalUrl ? `${linkText}: ${portalUrl}` : "",
    privacy,
    contact,
  ]
    .filter(Boolean)
    .join("\n\n");

  const p = (content, style = "") => `<p style="margin:0 0 16px;${style}">${content}</p>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;">
<div role="article" aria-label="${escapeHtml(subject)}" style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;color:#22242a;background:#ffffff;">
${testNote ? p(escapeHtml(testNote), "padding:8px 12px;background:#fff7e0;border-radius:6px;") : ""}
${paragraphs.map((paragraph) => p(escapeHtml(paragraph).replace(/\r?\n/g, "<br>"))).join("\n")}
${sections
  .map(
    (section) => `<h2 style="margin:20px 0 8px;font-size:17px;">${escapeHtml(section.title)}</h2>
<ul style="margin:0 0 16px;padding-left:20px;">${section.entries
      .map((entry) => `<li>${escapeHtml(entry.title)}${entry.note ? ` <span style="color:#4b5563;">(${escapeHtml(entry.note)})</span>` : ""}</li>`)
      .join("")}</ul>`
  )
  .join("\n")}
${portalUrl ? p(`<a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;background:#4f46c7;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">${linkText}</a>`, "margin-top:24px;") : ""}
${p(escapeHtml(privacy), "font-size:14px;color:#4b5563;")}
${p(escapeHtml(contact), "font-size:14px;color:#4b5563;")}
</div>
</body>
</html>`;

  return { subject, text, html };
}
