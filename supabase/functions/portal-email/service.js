import {
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  SAMPLE_BOOKING_ROW,
  buildPortalLink,
  decideDelivery,
  getAutomationBlock,
  getContactEmails,
  getEmailContext,
  getEmailIneligibleReason,
  getEmailSections,
  getSelectedRecipients,
  getStopReason,
  getUpcomingEmails,
  isBookingPortalComplete,
  isGuestActionNeeded,
  itemHasEmailOptions,
  normalizeEmail,
  planAutomaticMessages,
  renderEmail,
} from "../../../src/utils/portalEmail.js";

/*
  Portal email service: planning, the outbox worker and staff actions.

  `db.rpc(name, args)` calls the service-role functions from the
  20261104000100_portal_email migration and returns their data (it throws
  on error). `provider` is the adapter from provider.js, or a fake in
  tests; it is null when the server is not configured. Every path that can
  reach the provider (scheduled run, welcome, manual send, test send,
  retry) goes through dispatchQueued → deliverOne → decideDelivery.
*/

export class UserError extends Error {}

const SAMPLE_SECTIONS = [
  { title: "Still to do", entries: [{ title: "Sample task: final guest count", note: "due 5/21/2027" }] },
];

async function loadBookings(db, bookingIds) {
  return db.rpc("portal_email_load", { p_booking_ids: bookingIds });
}

async function loadBooking(db, bookingId) {
  const state = await loadBookings(db, [String(bookingId)]);
  return { ...state, booking: state.bookings[0] || null };
}

function renderMessage(message, booking, templates, items, config) {
  const template = templates?.[message.template_key];
  if (!template) throw new Error("Template missing.");
  const real = message.trigger !== "test" || message.use_real_data;
  const row = real ? booking.row : SAMPLE_BOOKING_ROW;
  return renderEmail({
    template,
    context: getEmailContext(row),
    sections: real ? getEmailSections(booking, items) : SAMPLE_SECTIONS,
    portalUrl: buildPortalLink(config.portalBaseUrl, row.portal_token),
    isTest: message.trigger === "test" || message.mode === "test",
  });
}

// Last guard before the provider, independent of decideDelivery.
function assertProviderCallAllowed(message, config) {
  const recipient = normalizeEmail(message.recipient);
  if (message.mode === "disabled") throw new Error("Dry run messages never reach the provider.");
  if ((message.mode === "test" || message.trigger === "test") && !config.testAllowlist.has(recipient)) {
    throw new Error("Not on the test allowlist.");
  }
  if (message.mode === "live" && !config.liveEnabled) throw new Error("Live sending is not enabled.");
}

async function deliverOne({ message, booking, state, provider, config, now }) {
  try {
    const decision = decideDelivery({ message, settings: state.settings, booking, config, now });
    if (decision.action !== "send" && decision.action !== "simulated") {
      return { status: decision.action, detail: decision.detail };
    }
    const email = renderMessage(message, booking, state.templates, decision.items, config);
    if (decision.action === "simulated") {
      return { status: "simulated", detail: decision.detail, subject: email.subject };
    }
    if (!provider) return { status: "blocked", detail: "No email provider is configured.", subject: email.subject };
    assertProviderCallAllowed(message, config);

    const result = await provider.send({
      idempotencyKey: message.id,
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: normalizeEmail(message.recipient),
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [
        { name: "trigger", value: message.trigger },
        { name: "mode", value: message.mode },
      ],
    });
    if (result.ok) {
      return {
        status: "accepted",
        detail: "Accepted by the provider; delivery is confirmed separately.",
        providerId: result.id,
        subject: email.subject,
      };
    }
    if (result.retryable) {
      return { status: "retry", detail: result.detail, subject: email.subject, exhausted: result.uncertain ? "uncertain" : "failed" };
    }
    return { status: "failed", detail: result.detail, subject: email.subject };
  } catch {
    // No error text: it could include guest data.
    return { status: "blocked", detail: "This email could not be prepared, so it was not sent." };
  }
}

/*
  Provider accepted but the result could not be saved: the row stays
  'sending', and the next claim marks it 'uncertain' for staff to check.
  It is never resent automatically.
*/
async function finish(db, messageId, outcome) {
  const args = {
    p_id: messageId,
    p_status: outcome.status,
    p_detail: outcome.detail || null,
    p_provider_id: outcome.providerId || null,
    p_subject: outcome.subject || null,
    p_exhausted_status: outcome.exhausted || "failed",
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.rpc("portal_email_finish", args);
    } catch {
      // try once more
    }
  }
  console.error(`portal-email: result of message ${messageId} was not saved; it will be marked uncertain.`);
  return null;
}

// Claims queued messages (or exactly `ids`) and delivers each one.
export async function dispatchQueued({ db, provider, config, now = new Date(), ids = null }) {
  const claimed = await db.rpc("portal_email_claim", { p_limit: ids ? ids.length : null, p_ids: ids });
  if (!claimed?.length) return [];

  // Loaded after claiming, so every check uses the state right before sending.
  const bookingIds = [...new Set(claimed.map((message) => message.booking_id).filter(Boolean))];
  const state = await loadBookings(db, bookingIds);
  const results = [];

  for (const message of claimed) {
    const booking = state.bookings.find((entry) => entry.row.id === message.booking_id) || null;
    const outcome = await deliverOne({ message, booking, state, provider, config, now });
    const status = await finish(db, message.id, outcome);
    results.push({ id: message.id, recipient: message.recipient, status: status || "uncertain", detail: outcome.detail });
  }
  return results;
}

// The scheduled job: latch stops, plan due emails, then send one batch.
export async function runScheduled({ db, provider, config, now = new Date() }) {
  const state = await loadBookings(db, null);
  let planned = 0;
  let stopped = 0;

  if (state.settings.automation_enabled) {
    for (const booking of state.bookings) {
      if (getAutomationBlock(booking, state.settings)) continue;
      const reason = getStopReason(booking);
      if (reason) {
        await db.rpc("portal_email_set_automation", {
          p_booking_id: booking.row.id,
          p_action: "stop",
          p_user: null,
          p_reason: reason,
        });
        stopped += 1;
        continue;
      }
      for (const message of planAutomaticMessages(booking, state.settings, now)) {
        if (await db.rpc("portal_email_enqueue", { p_message: message })) planned += 1;
      }
    }
  }

  const results = await dispatchQueued({ db, provider, config, now });
  const statuses = {};
  results.forEach(({ status }) => {
    statuses[status] = (statuses[status] || 0) + 1;
  });
  return { planned, stopped, dispatched: results.length, statuses };
}

function requireSendable(booking) {
  const problem =
    getEmailIneligibleReason(booking?.row) ||
    (getSelectedRecipients(booking).length === 0 ? "Choose at least one recipient first." : "");
  if (problem) throw new UserError(problem);
}

async function enqueueAll(db, messages) {
  const ids = [];
  for (const message of messages) {
    const id = await db.rpc("portal_email_enqueue", { p_message: message });
    if (id) ids.push(id);
  }
  return ids;
}

/*
  "Enable portal emails and send welcome email" + Save. One welcome per
  recipient per email mode: repeated saves, concurrent requests and
  uncheck/recheck reuse the same dedupe key, so nothing is sent twice.
*/
export async function activateBooking({ db, provider, config, bookingId, userId, now = new Date() }) {
  const { booking } = await loadBooking(db, bookingId);
  requireSendable(booking);
  if (isBookingPortalComplete(booking)) {
    throw new UserError("This portal is already 100% complete, so there is nothing for automatic emails to do.");
  }

  const automation = await db.rpc("portal_email_set_automation", {
    p_booking_id: booking.row.id,
    p_action: "activate",
    p_user: userId ?? null,
    p_reason: null,
  });
  const ids = await enqueueAll(
    db,
    getSelectedRecipients(booking).map((recipient) => ({
      dedupe_key: `welcome|${booking.row.id}|${automation.mode_epoch}|${recipient}`,
      booking_id: booking.row.id,
      booking_label: booking.row.organization_name,
      trigger: "welcome",
      template_key: "welcome",
      recipient,
      created_by: userId ?? null,
    }))
  );
  const welcome = ids.length ? await dispatchQueued({ db, provider, config, now, ids }) : [];
  return { automation, welcome };
}

export async function changeAutomation({ db, bookingId, action, userId }) {
  if (!["deactivate", "pause", "resume"].includes(action)) throw new UserError("Unknown action.");
  if (action === "resume") {
    const { booking } = await loadBooking(db, bookingId);
    requireSendable(booking);
    if (isBookingPortalComplete(booking)) {
      throw new UserError("The portal is 100% complete; automatic emails stay stopped.");
    }
  }
  try {
    return await db.rpc("portal_email_set_automation", {
      p_booking_id: String(bookingId),
      p_action: action,
      p_user: userId ?? null,
      p_reason: null,
    });
  } catch (error) {
    throw new UserError(String(error?.message || "").includes("enabled again") ? error.message : "Could not change portal emails.");
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function requireRequestId(requestId) {
  if (!REQUEST_ID_PATTERN.test(String(requestId || ""))) throw new UserError("Missing request id.");
}

/*
  Manual welcome resend or reminder. requestId is created once per click,
  so a double-click or network retry reuses it (no duplicate), while a
  later deliberate click gets a new one.
*/
export async function sendManual({ db, provider, config, bookingId, kind, requestId, confirmCompleted = false, userId, now = new Date() }) {
  requireRequestId(requestId);
  if (kind !== "welcome" && kind !== "reminder") throw new UserError("Unknown email type.");
  const { booking } = await loadBooking(db, bookingId);
  requireSendable(booking);
  if (kind === "welcome" && isBookingPortalComplete(booking) && !confirmCompleted) {
    throw new UserError("This portal is 100% complete, so automatic emails are stopped. Confirm to resend the welcome email anyway.");
  }

  const ids = await enqueueAll(
    db,
    getSelectedRecipients(booking).map((recipient) => ({
      dedupe_key: `manual|${requestId}|${recipient}`,
      booking_id: booking.row.id,
      booking_label: booking.row.organization_name,
      trigger: kind === "welcome" ? "manual_welcome" : "manual_reminder",
      template_key: kind === "welcome" ? "welcome" : "update",
      is_manual: true,
      confirm_completed: Boolean(confirmCompleted),
      recipient,
      created_by: userId ?? null,
    }))
  );
  return { results: ids.length ? await dispatchQueued({ db, provider, config, now, ids }) : [], duplicate: ids.length === 0 };
}

// Test sends go only to the server allowlist; real data only when chosen.
export async function sendTest({ db, provider, config, to, templateKey, bookingId, useRealData = false, requestId, userId, now = new Date() }) {
  requireRequestId(requestId);
  const recipient = normalizeEmail(to);
  if (!config.testAllowlist.has(recipient)) {
    throw new UserError("That address is not on the server's test allowlist (PORTAL_EMAIL_TEST_ALLOWLIST).");
  }
  if (templateKey !== "welcome" && templateKey !== "update") throw new UserError("Unknown template.");
  let booking = null;
  if (useRealData) {
    ({ booking } = await loadBooking(db, bookingId));
    if (!booking) throw new UserError("Choose a booking to use real data.");
  }

  const ids = await enqueueAll(db, [
    {
      dedupe_key: `test|${requestId}`,
      booking_id: booking?.row.id || null,
      booking_label: booking ? booking.row.organization_name : "Sample booking (synthetic)",
      trigger: "test",
      template_key: templateKey,
      is_manual: true,
      use_real_data: Boolean(booking),
      recipient,
      created_by: userId ?? null,
    },
  ]);
  return { results: ids.length ? await dispatchQueued({ db, provider, config, now, ids }) : [], duplicate: ids.length === 0 };
}

export async function retryMessage({ db, provider, config, messageId, now = new Date() }) {
  const requeued = await db.rpc("portal_email_requeue", { p_id: messageId });
  if (!requeued) throw new UserError("Only failed or uncertain emails from the current mode can be retried.");
  return { results: await dispatchQueued({ db, provider, config, now, ids: [messageId] }) };
}

export function getReadiness(config) {
  return {
    providerReady: config.providerReady,
    problems: config.problems,
    liveEnabled: config.liveEnabled,
    portalBaseUrlSet: Boolean(config.portalBaseUrl),
    testAllowlist: [...config.testAllowlist],
  };
}

// Previews with real booking data. Nothing is queued or sent.
export async function getOverview({ db, config, bookingId, now = new Date() }) {
  const { settings, templates, booking } = await loadBooking(db, bookingId);
  if (!booking) throw new UserError("Booking not found.");
  const portalUrl = buildPortalLink(config.portalBaseUrl, booking.row.portal_token);
  const context = getEmailContext(booking.row);
  const outstanding = (booking.items || [])
    .filter(isGuestActionNeeded)
    .map((item) => ({ table: "task", id: String(item.id), trigger: "outstanding", version: "" }));
  const isTest = settings.mode === "test";

  return {
    readiness: getReadiness(config),
    ineligibleReason: getEmailIneligibleReason(booking.row),
    automationBlock: getAutomationBlock(booking, settings),
    complete: isBookingPortalComplete(booking),
    contactEmails: getContactEmails(booking.row.email),
    previews: {
      welcome: renderEmail({ template: templates.welcome, context, sections: getEmailSections(booking, outstanding), portalUrl, isTest }),
      reminder: renderEmail({
        template: templates.update,
        context,
        sections: getEmailSections(
          booking,
          outstanding.filter((event) => itemHasEmailOptions(booking.items.find((item) => String(item.id) === event.id)))
        ),
        portalUrl,
        isTest,
      }),
    },
    upcoming: getUpcomingEmails(booking, settings, now),
  };
}
