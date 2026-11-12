import { useEffect, useRef, useState } from "react";
import { FaEnvelope, FaRedo } from "react-icons/fa";

import * as portalEmailService from "../services/portalEmailService";
import {
  EMAIL_MODE_LABELS,
  EMAIL_TIME_ZONE,
  REMINDER_OPTIONS,
  REMINDER_PROCESSING_HOUR,
  STOP_REASON_TEXT,
  TEMPLATE_PLACEHOLDERS,
  getContactEmails,
  getTemplateProblems,
  isValidEmail,
  normalizeEmail,
} from "../utils/portalEmail";
import "../styles/PortalEmail.css";

const { isMissingEmailSetup, newEmailRequestId } = portalEmailService;

/*
  Guest portal emails in Portal Admin (see docs/portal-email/SETUP.md).
  Nothing here sends on load or re-render: email goes out only from an
  explicit Save of the enable checkbox, a confirmed manual send, a test
    send or a retry, and the server re-checks every one of them.

  api is the service these screens talk to. The tutorial's fictional demo
  passes its own (portalDemoEmailApi), which has no network access.
*/

const STATUS_LABELS = {
  queued: "Queued",
  sending: "Sending",
  accepted: "Accepted by provider",
  delivered: "Delivered",
  bounced: "Bounced",
  simulated: "Simulated (dry run)",
  blocked: "Blocked",
  suppressed: "Not sent",
  cancelled: "Cancelled",
  expired: "Expired",
  failed: "Failed",
  uncertain: "Uncertain",
};

const TRIGGER_LABELS = {
  welcome: "Welcome",
  automatic: "Automatic update",
  manual_welcome: "Welcome resend",
  manual_reminder: "Manual reminder",
  test: "Test send",
};

const UPCOMING_LABELS = {
  assigned: "New-item notice",
  changes: "Changes requested",
  "7d": "7-day reminder",
  "2d": "2-day reminder",
  overdue: "Overdue reminder",
};

const MODE_SHORT = { disabled: "Dry run", test: "Test", live: "Live" };

function formatWhen(value) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        timeZone: EMAIL_TIME_ZONE,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
}

function getModeNote(mode) {
  if (mode === "live") return "Live mode: real emails go to the recipients listed.";
  if (mode === "test") return "Test mode: only addresses on the server's test allowlist receive email; every other address is blocked.";
  return "Dry run: nothing is sent. The email is recorded as simulated in the history.";
}

function useNotice() {
  const [notice, setNotice] = useState(null);
  const show = (text, tone = "info") => setNotice(text ? { text, tone } : null);
  return [notice, show];
}

function Notice({ notice }) {
  if (!notice) return null;
  return (
    <p className={`portal-email-notice portal-email-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  );
}

export function EmailHistoryList({ rows, showBooking = false, onRetry, busy }) {
  if (!rows?.length) return <p className="portal-email-muted">No emails yet.</p>;
  return (
    <ul className="portal-email-history">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="portal-email-history-main">
            <strong>
              {TRIGGER_LABELS[row.trigger] || row.trigger}
              {row.is_manual && row.trigger !== "test" ? " (manual)" : ""}
            </strong>
            <span>{row.recipient}</span>
            {showBooking && row.booking_label && <span>{row.booking_label}</span>}
          </div>
          <div className="portal-email-history-meta">
            <span className={`portal-email-status portal-email-status-${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
            <span>{MODE_SHORT[row.mode] || row.mode}</span>
            <time dateTime={row.created_at}>{formatWhen(row.sent_at || row.created_at)}</time>
            {onRetry && (row.status === "failed" || row.status === "uncertain") && (
              <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={Boolean(busy)} onClick={() => onRetry(row)}>
                <FaRedo /> Retry
              </button>
            )}
          </div>
          {row.status_detail && <small>{row.status_detail}</small>}
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   GLOBAL SETTINGS
========================================================= */

function TemplateEditor({ templateKey, template, onSaved, api }) {
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [saving, setSaving] = useState(false);
  const [notice, showNotice] = useNotice();
  const problems = [
    ...getTemplateProblems(subject, { maxLength: 200, singleLine: true }).map((problem) => `Subject: ${problem}`),
    ...getTemplateProblems(body).map((problem) => `Message: ${problem}`),
  ];
  const changed = subject !== (template?.subject || "") || body !== (template?.body || "");

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveEmailTemplate(templateKey, subject, body);
      showNotice("Template saved.", "success");
      onSaved();
    } catch (error) {
      showNotice(error?.message || "Could not save the template.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="portal-email-template">
      <legend>{templateKey === "welcome" ? "Welcome email" : "Update and reminder email"}</legend>
      <label>
        <span>Subject</span>
        <input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label>
        <span>Message (blank line = new paragraph; the item list and portal button are added automatically)</span>
        <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      {problems.length > 0 && (
        <ul className="portal-email-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={!changed || problems.length > 0 || saving} onClick={handleSave}>
        {saving ? "Saving..." : "Save template"}
      </button>
      <Notice notice={notice} />
    </fieldset>
  );
}

export function PortalEmailSettingsCard({ emailAdmin, onReload, api = portalEmailService }) {
  const [readiness, setReadiness] = useState(null);
  const [readinessError, setReadinessError] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState("");
  const [cap, setCap] = useState("");
  const [notice, showNotice] = useNotice();
  const settings = emailAdmin?.settings;

  async function refresh() {
    try {
      setHistory(await api.loadEmailHistory({ limit: 25 }));
    } catch {
      setHistory([]);
    }
    try {
      setReadiness((await api.callPortalEmail("status")).readiness);
      setReadinessError("");
    } catch (error) {
      setReadinessError(error.message);
    }
  }

  // Fetches on mount and after a mode change; state is set only after the requests resolve.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.mode_epoch]);

  if (emailAdmin?.missing) {
    return (
      <section className="dashboard-card portal-email-settings">
        <h3>
          <FaEnvelope /> Guest portal emails
        </h3>
        <p className="portal-email-muted">
          Not set up yet: the portal email migration has not been run on this database. See docs/portal-email/SETUP.md.
        </p>
      </section>
    );
  }
  if (!settings) return null;

  async function run(label, action) {
    setBusy(label);
    showNotice("");
    try {
      await action();
    } catch (error) {
      showNotice(error?.message || "Something went wrong.", "error");
    } finally {
      setBusy("");
    }
  }

  function changeMode(next) {
    if (next === settings.mode) return;
    if (next === "live") {
      if (!readiness?.providerReady || !readiness?.liveEnabled) {
        showNotice("Live mode needs the server set up first: provider configured and PORTAL_EMAIL_LIVE_ENABLED=true. See the readiness list.", "error");
        return;
      }
      const typed = window.prompt(
        "Live mode sends real emails to guests for bookings that staff enable one at a time. Switching modes turns automatic emails off, cancels anything queued, and requires each booking to be enabled again.\n\nType LIVE to continue."
      );
      if (typed !== "LIVE") return;
    } else if (
      !window.confirm(
        `Switch to ${EMAIL_MODE_LABELS[next]}?\n\nThis turns automatic emails off, cancels anything queued, and each booking must be enabled again under the new mode.`
      )
    ) {
      return;
    }
    run("mode", async () => {
      await api.updateEmailSettings({ mode: next });
      showNotice(`Mode changed to ${EMAIL_MODE_LABELS[next]}.`, "success");
      onReload();
    });
  }

  function toggleAutomation() {
    const next = !settings.automation_enabled;
    if (
      next &&
      !window.confirm(
        `Turn automatic emails on in ${EMAIL_MODE_LABELS[settings.mode]}?\n\nOnly bookings that staff enabled individually get automatic emails. This switch enrolls no booking and sends no backlog.`
      )
    ) {
      return;
    }
    run("automation", async () => {
      await api.updateEmailSettings({ automation_enabled: next });
      onReload();
    });
  }

  async function handleRetry(row) {
    if (!window.confirm(`Retry the email to ${row.recipient}?${row.status === "uncertain" ? "\n\nIt may already have been sent. Retrying within 24 hours of the first attempt cannot duplicate it; after that, check the provider log first." : ""}`)) {
      return;
    }
    await run(row.id, async () => {
      const result = await api.callPortalEmail("retry", { messageId: row.id });
      showNotice(`Retry: ${STATUS_LABELS[result.results?.[0]?.status] || "done"}.`, "success");
      await refresh();
    });
  }

  return (
    <details className="dashboard-card portal-email-settings" data-tutorial-target="portal-email-card">
      <summary data-tutorial-target="portal-email-summary">
        <span className="portal-email-settings-title">
          <FaEnvelope /> Guest portal emails
        </span>
        <span className={`portal-email-mode-badge portal-email-mode-${settings.mode}`}>{MODE_SHORT[settings.mode]}</span>
        <span className="portal-email-muted">Automatic emails {settings.automation_enabled ? "on" : "off"}</span>
      </summary>

      <div className="portal-email-settings-body">
        <section>
          <h4>Sending mode</h4>
          <div className="portal-email-mode-options" role="radiogroup" aria-label="Sending mode" data-tutorial-target="portal-email-mode" data-tutorial-guard>
            {Object.entries(EMAIL_MODE_LABELS).map(([mode, label]) => (
              <label key={mode}>
                <input type="radio" name="portal-email-mode" checked={settings.mode === mode} disabled={Boolean(busy)} onChange={() => changeMode(mode)} />
                {label}
              </label>
            ))}
          </div>
          <p className="portal-email-muted">{getModeNote(settings.mode)}</p>

          <label className="portal-email-check" data-tutorial-target="portal-email-automatic" data-tutorial-guard>
            <input type="checkbox" checked={settings.automation_enabled} disabled={Boolean(busy)} onChange={toggleAutomation} />
            Automatic emails (notices and deadline reminders for enabled bookings)
          </label>
          <p className="portal-email-muted" data-tutorial-target="portal-email-timing">
            Deadline reminders go out on the first scheduled run at or after {REMINDER_PROCESSING_HOUR}:00 New York time. New-item and
            change notices wait a few minutes so several changes go in one email.
          </p>

          <label className="portal-email-inline">
            <span>Live sending cap (emails per 24 hours)</span>
            <input
              type="number"
              min={1}
              max={200}
              value={cap === "" ? settings.live_cap_per_day : cap}
              onChange={(event) => setCap(event.target.value)}
            />
            <button
              className="secondary-dashboard-button"
              type="button"
              data-tutorial-guard
              disabled={cap === "" || Number(cap) === settings.live_cap_per_day || Boolean(busy)}
              onClick={() =>
                run("cap", async () => {
                  await api.updateEmailSettings({ live_cap_per_day: Number(cap) });
                  setCap("");
                  onReload();
                })
              }
            >
              Save cap
            </button>
          </label>
          <Notice notice={notice} />
        </section>

        <section data-tutorial-target="portal-email-readiness">
          <h4>Server readiness</h4>
          {readinessError ? (
            <p className="portal-email-notice portal-email-notice-error">{readinessError}</p>
          ) : !readiness ? (
            <p className="portal-email-muted">Checking...</p>
          ) : (
            <ul className="portal-email-readiness">
              <li className={readiness.providerReady ? "ok" : "no"}>
                Email provider {readiness.providerReady ? "configured" : `not configured: ${readiness.problems.join(" ")}`}
              </li>
              <li className={readiness.liveEnabled ? "ok" : "no"}>
                Live sending {readiness.liveEnabled ? "allowed by the server" : "disabled on the server (PORTAL_EMAIL_LIVE_ENABLED)"}
              </li>
              <li className={readiness.testAllowlist.length ? "ok" : "no"}>
                Test inboxes: {readiness.testAllowlist.length ? readiness.testAllowlist.join(", ") : "none (PORTAL_EMAIL_TEST_ALLOWLIST is empty)"}
              </li>
            </ul>
          )}
        </section>

        <section data-tutorial-target="portal-email-templates">
          <h4>Templates</h4>
          <p className="portal-email-muted">
            Placeholders: {TEMPLATE_PLACEHOLDERS.map((name) => `{{${name}}}`).join(", ")}. From: Toah Nipi &lt;contactus@toahnipi.org&gt;.
          </p>
          {["welcome", "update"].map((key) => (
            <TemplateEditor
              key={`${key}-${emailAdmin.templates[key]?.updated_at || ""}`}
              templateKey={key}
              template={emailAdmin.templates[key]}
              onSaved={onReload}
              api={api}
            />
          ))}
        </section>

        <section>
          <h4>Recent email history</h4>
          <EmailHistoryList rows={history} showBooking onRetry={handleRetry} busy={busy} />
        </section>
      </div>
    </details>
  );
}

/* =========================================================
   PER-BOOKING PANEL
========================================================= */

function buildDraft(state, record, active) {
  const contacts = getContactEmails(record.email);
  const recipients = state.recipients.map((row) => ({
    email: row.email,
    selected: row.selected,
    addedByStaff: row.added_by_staff,
    onFile: contacts.includes(row.email),
  }));
  contacts
    .filter((email) => !recipients.some((row) => row.email === email))
    .forEach((email) => recipients.push({ email, selected: false, addedByStaff: false, onFile: true }));

  const options = {};
  state.items.forEach((item) => {
    options[`task:${item.id}`] = {
      email_assign: Boolean(item.email_assign),
      email_changes: Boolean(item.email_changes),
      email_reminders: item.email_reminders || [],
    };
  });
  state.documents
    .filter((document) => !document.uploaded_by_guest)
    .forEach((document) => {
      options[`document:${document.id}`] = { email_assign: Boolean(document.email_assign) };
    });

  return { recipients, options, enable: active };
}

function getAutomationLabel(automation, settings) {
  if (!automation?.enabled) return "Off";
  if (automation.mode_epoch !== settings.mode_epoch) return "Off (enabled under a previous mode)";
  if (automation.stopped_reason) return `Stopped: ${STOP_REASON_TEXT[automation.stopped_reason]}`;
  if (automation.paused) return "Paused";
  return "On";
}

export default function PortalEmailPanel({ record, emailAdmin, onClose, api = portalEmailService }) {
  const settings = emailAdmin?.settings;
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");
  const [draft, setDraft] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [addNotice, setAddNotice] = useState(null);
  const [previewKind, setPreviewKind] = useState("welcome");
  const [testTo, setTestTo] = useState("");
  const [testTemplate, setTestTemplate] = useState("welcome");
  const [testUseRealData, setTestUseRealData] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, showNotice] = useNotice();
  // One request id per deliberate click; reused only if that same click is retried after an error.
  const pendingRequests = useRef({});

  const automation = state?.automation;
  const active = Boolean(automation?.enabled && settings && automation.mode_epoch === settings.mode_epoch);

  async function load() {
    try {
      const next = await api.loadBookingEmailState(record.id);
      setState(next);
      setDraft(buildDraft(next, record, Boolean(next.automation?.enabled && next.automation.mode_epoch === settings?.mode_epoch)));
      setLoadError("");
    } catch (error) {
      setLoadError(
        isMissingEmailSetup(error)
          ? "Portal emails are not set up on this database yet (run the portal email migration)."
          : "Could not load this booking's email settings."
      );
    }
    try {
      setOverview(await api.callPortalEmail("overview", { bookingId: record.id }));
      setOverviewError("");
    } catch (error) {
      setOverviewError(error.message);
    }
  }

  // Reloads when the portal list refreshes; state is set only after the requests resolve.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, record.checklistItems, record.documents, settings?.mode_epoch]);

  if (!settings) {
    return (
      <section className="portal-email-panel">
        <p className="portal-email-muted">{emailAdmin?.missing ? "Portal emails are not set up on this database yet." : "Loading email settings..."}</p>
      </section>
    );
  }

  const selected = (draft?.recipients || []).filter((row) => row.selected).map((row) => row.email);
  const enabledTasks = (state?.items || []).filter((item) => {
    const option = draft?.options[`task:${item.id}`];
    return option && (option.email_assign || option.email_changes || option.email_reminders.length);
  });
  const enabledDocuments = (state?.documents || []).filter((document) => draft?.options[`document:${document.id}`]?.email_assign);

  function updateRecipient(email, changes) {
    setDraft((current) => ({
      ...current,
      recipients: current.recipients.map((row) => (row.email === email ? { ...row, ...changes } : row)),
    }));
  }

  function removeRecipient(email) {
    setDraft((current) => ({ ...current, recipients: current.recipients.filter((row) => row.email !== email) }));
  }

  function addRecipient(event) {
    event.preventDefault();
    const email = normalizeEmail(newEmail);
    if (!isValidEmail(email)) {
      setAddNotice({ text: "Enter one valid email address.", tone: "error" });
      return;
    }
    if (draft.recipients.some((row) => row.email === email)) {
      setAddNotice({ text: "That address is already listed.", tone: "error" });
      return;
    }
    setDraft((current) => ({
      ...current,
      recipients: [...current.recipients, { email, selected: false, addedByStaff: true, onFile: false }],
    }));
    setNewEmail("");
    setAddNotice({ text: "Added. Tick it to select it as a recipient, then Save.", tone: "info" });
  }

  function updateOption(key, changes) {
    setDraft((current) => ({ ...current, options: { ...current.options, [key]: { ...current.options[key], ...changes } } }));
  }

  function toggleReminder(key, value) {
    const reminders = draft.options[key].email_reminders;
    updateOption(key, {
      email_reminders: reminders.includes(value) ? reminders.filter((entry) => entry !== value) : [...reminders, value],
    });
  }

  async function run(label, action) {
    setBusy(label);
    showNotice("");
    try {
      await action();
    } catch (error) {
      showNotice(error?.message || "Something went wrong.", "error");
    } finally {
      setBusy("");
      load();
    }
  }

  function describeResults(results = []) {
    if (!results.length) return "No new email was created (it was already sent for this request).";
    return results.map((result) => `${result.recipient}: ${STATUS_LABELS[result.status] || result.status}`).join("; ");
  }

  function handleSave() {
    if (draft.enable && selected.length === 0) {
      showNotice("Select at least one recipient before enabling portal emails.", "error");
      return;
    }
    if (draft.enable && !active) {
      const confirmed = window.confirm(
        [
          `Enable portal emails for ${record.organizationName} and send the welcome email?`,
          "",
          `Mode: ${EMAIL_MODE_LABELS[settings.mode]}`,
          getModeNote(settings.mode),
          "",
          "Welcome email to:",
          ...selected.map((email) => `  - ${email}`),
          "",
          `Emails are on for ${enabledTasks.length} task(s) and ${enabledDocuments.length} document(s).`,
        ].join("\n")
      );
      if (!confirmed) return;
    }

    run("save", async () => {
      await api.saveEmailRecipients(record.id, state.recipients, draft.recipients);
      await api.saveItemEmailOptions(state.items, state.documents, draft.options);
      if (draft.enable && !active) {
        const result = await api.callPortalEmail("activate", { bookingId: record.id });
        showNotice(`Portal emails enabled. Welcome email: ${describeResults(result.welcome)}`, "success");
      } else if (!draft.enable && active) {
        await api.callPortalEmail("deactivate", { bookingId: record.id });
        showNotice("Portal emails turned off for this booking. Turning them on again later does not resend the welcome email.", "success");
      } else {
        showNotice("Saved.", "success");
      }
    });
  }

  function handleAutomation(action) {
    const text =
      action === "resume"
        ? `Resume automatic emails for ${record.organizationName}?\n\nNothing missed while stopped is sent. An overdue reminder not yet sent for an enabled task can still go out once (see Upcoming).`
        : `Pause automatic emails for ${record.organizationName}?`;
    if (!window.confirm(text)) return;
    run(action, async () => {
      await api.callPortalEmail(action, { bookingId: record.id });
      showNotice(action === "resume" ? "Automatic emails resumed." : "Automatic emails paused.", "success");
    });
  }

  function handleManualSend(kind) {
    const savedSelected = state.recipients.filter((row) => row.selected).map((row) => row.email);
    if (savedSelected.length === 0) {
      showNotice("Select and save at least one recipient first.", "error");
      return;
    }
    const label = kind === "welcome" ? "Resend the welcome email" : "Send a reminder of outstanding tasks now";
    if (!window.confirm([`${label} for ${record.organizationName}?`, "", `Mode: ${EMAIL_MODE_LABELS[settings.mode]}`, getModeNote(settings.mode), "", "To:", ...savedSelected.map((email) => `  - ${email}`)].join("\n"))) {
      return;
    }
    let confirmCompleted = false;
    if (kind === "welcome" && overview?.complete) {
      confirmCompleted = window.confirm("This portal is 100% complete, so automatic emails are stopped. Send the welcome email anyway?");
      if (!confirmCompleted) return;
    }
    const requestKey = `${kind}:${savedSelected.join(",")}`;
    if (pendingRequests.current[kind]?.key !== requestKey) {
      pendingRequests.current[kind] = { key: requestKey, id: newEmailRequestId() };
    }
    run(kind, async () => {
      const result = await api.callPortalEmail("send", {
        bookingId: record.id,
        kind,
        requestId: pendingRequests.current[kind].id,
        confirmCompleted,
      });
      delete pendingRequests.current[kind];
      showNotice(describeResults(result.results), "success");
    });
  }

  function handleTestSend() {
    if (!testTo) return;
    if (testUseRealData && !window.confirm(`The test email will contain ${record.organizationName}'s real details and private portal link, sent to ${testTo}. Continue?`)) {
      return;
    }
    if (!pendingRequests.current.test) pendingRequests.current.test = { id: newEmailRequestId() };
    run("test", async () => {
      const result = await api.callPortalEmail("testSend", {
        to: testTo,
        templateKey: testTemplate,
        bookingId: record.id,
        useRealData: testUseRealData,
        requestId: pendingRequests.current.test.id,
      });
      delete pendingRequests.current.test;
      showNotice(`Test email: ${describeResults(result.results)}`, "success");
    });
  }

  function handleRetry(row) {
    if (!window.confirm(`Retry the email to ${row.recipient}?`)) return;
    run(row.id, async () => {
      const result = await api.callPortalEmail("retry", { messageId: row.id });
      showNotice(`Retry: ${describeResults(result.results)}`, "success");
    });
  }

  const preview = overview?.previews?.[previewKind];
  const hasUnsavedChoices = Boolean(
    draft && state && (newEmail.trim() || JSON.stringify(draft) !== JSON.stringify(buildDraft(state, record, active)))
  );
  const testInboxes = overview?.readiness?.testAllowlist || [];

  return (
    <section
      className="portal-email-panel"
      aria-label={`Portal emails for ${record.organizationName}`}
      data-tutorial-target="portal-email-panel"
      data-tutorial-unsaved={hasUnsavedChoices ? "email choices in Portal Admin" : undefined}
    >
      <header className="portal-email-panel-header">
        <div data-tutorial-target="portal-email-state">
          <h4>
            <FaEnvelope /> Portal emails
          </h4>
          <p>
            <span className={`portal-email-mode-badge portal-email-mode-${settings.mode}`}>{MODE_SHORT[settings.mode]}</span>{" "}
            This booking: <strong>{getAutomationLabel(automation, settings)}</strong>
            {!settings.automation_enabled && " · automatic emails are off for everyone"}
          </p>
        </div>
        <button className="secondary-dashboard-button" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {loadError && <p className="portal-email-notice portal-email-notice-error">{loadError}</p>}
      {overviewError && <p className="portal-email-notice portal-email-notice-error">{overviewError}</p>}
      {overview?.ineligibleReason && (
        <p className="portal-email-notice portal-email-notice-error">No guest emails for this record: {overview.ineligibleReason}</p>
      )}

      {draft && state && (
        <>
          <fieldset className="portal-email-section" data-tutorial-target="portal-email-recipients">
            <legend>Recipients</legend>
            <p className="portal-email-muted">
              Anyone selected receives this group&apos;s private portal link and can view and submit everything in this group&apos;s portal. Select only
              the group&apos;s authorized contacts. Each person gets a separate email; addresses are never shown to each other.
            </p>
            {draft.recipients.length === 0 && <p className="portal-email-muted">No email address on file. Add one below.</p>}
            <ul className="portal-email-recipients">
              {draft.recipients.map((row) => (
                <li key={row.email}>
                  <label className="portal-email-check">
                    <input type="checkbox" checked={row.selected} onChange={(event) => updateRecipient(row.email, { selected: event.target.checked })} />
                    <span>{row.email}</span>
                  </label>
                  <small>{row.onFile ? "Contact on file" : row.addedByStaff ? "Added by staff" : "No longer the contact on file"}</small>
                  {!row.onFile && (
                    <button className="portal-email-link-button" type="button" onClick={() => removeRecipient(row.email)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form className="portal-email-add" onSubmit={addRecipient} noValidate>
              <label>
                <span>Add another email for this booking</span>
                <input type="email" value={newEmail} autoComplete="off" onChange={(event) => setNewEmail(event.target.value)} />
              </label>
              <button className="secondary-dashboard-button" type="submit">
                Add
              </button>
            </form>
            <Notice notice={addNotice} />
          </fieldset>

          <fieldset className="portal-email-section" data-tutorial-target="portal-email-items">
            <legend>Which items send emails</legend>
            <p className="portal-email-muted">
              Everything starts off. Reminders need a due date and stop when the retreat starts or the task no longer needs the guest (submitted,
              confirmed or removed).
            </p>
            {state.items.length === 0 && state.documents.length === 0 && <p className="portal-email-muted">No tasks or documents assigned yet.</p>}
            <ul className="portal-email-items">
              {state.items.map((item) => {
                const key = `task:${item.id}`;
                const option = draft.options[key];
                const staffOnly = !item.guest_action || item.guest_action === "none";
                return (
                  <li key={key}>
                    <div className="portal-email-item-title">
                      <strong>{item.title}</strong>
                      <small>{staffOnly ? "Staff only: no guest emails" : item.due_date ? `Due ${item.due_date}` : "No due date"}</small>
                    </div>
                    <div className="portal-email-item-options">
                      <label>
                        <input type="checkbox" disabled={staffOnly} checked={option.email_assign} onChange={(event) => updateOption(key, { email_assign: event.target.checked })} />
                        New-task notice
                      </label>
                      {REMINDER_OPTIONS.map((reminder) => (
                        <label key={reminder.value} title={item.due_date ? "" : "Needs a due date"}>
                          <input
                            type="checkbox"
                            disabled={staffOnly || !item.due_date}
                            checked={option.email_reminders.includes(reminder.value)}
                            onChange={() => toggleReminder(key, reminder.value)}
                          />
                          {reminder.label}
                        </label>
                      ))}
                      <label>
                        <input type="checkbox" disabled={staffOnly} checked={option.email_changes} onChange={(event) => updateOption(key, { email_changes: event.target.checked })} />
                        Changes requested
                      </label>
                    </div>
                  </li>
                );
              })}
              {state.documents
                .filter((document) => !document.uploaded_by_guest)
                .map((document) => {
                  const key = `document:${document.id}`;
                  return (
                    <li key={key}>
                      <div className="portal-email-item-title">
                        <strong>{document.title}</strong>
                        <small>Shared document</small>
                      </div>
                      <div className="portal-email-item-options">
                        <label>
                          <input type="checkbox" checked={draft.options[key].email_assign} onChange={(event) => updateOption(key, { email_assign: event.target.checked })} />
                          New-document notice
                        </label>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </fieldset>

          <fieldset className="portal-email-section portal-email-activate" data-tutorial-target="portal-email-enable">
            <legend>Enable</legend>
            <label className="portal-email-check">
              <input
                type="checkbox"
                checked={draft.enable}
                disabled={Boolean(overview?.ineligibleReason)}
                onChange={(event) => setDraft((current) => ({ ...current, enable: event.target.checked }))}
              />
              <strong>Enable portal emails and send welcome email</strong>
            </label>
            <p className="portal-email-muted">
              {selected.length ? `Recipients: ${selected.join(", ")}.` : "No recipient selected."} Emails on for {enabledTasks.length} task(s) and{" "}
              {enabledDocuments.length} document(s). {getModeNote(settings.mode)} The welcome goes once per recipient; turning this off and on again
              does not resend it.
            </p>
            <div className="portal-email-actions">
              <button className="primary-dashboard-button" type="button" data-tutorial-guard disabled={Boolean(busy)} onClick={handleSave}>
                {busy === "save" ? "Saving..." : "Save"}
              </button>
              {active && !automation.paused && !automation.stopped_reason && (
                <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={Boolean(busy)} onClick={() => handleAutomation("pause")}>
                  Pause
                </button>
              )}
              {active && (automation.paused || automation.stopped_reason) && (
                <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={Boolean(busy)} onClick={() => handleAutomation("resume")}>
                  Resume
                </button>
              )}
            </div>
            <Notice notice={notice} />
          </fieldset>

          <fieldset className="portal-email-section" data-tutorial-target="portal-email-send-now">
            <legend>Send now</legend>
            <p className="portal-email-muted">Goes to the saved, selected recipients and follows the current mode. Marked as manual in the history.</p>
            <div className="portal-email-actions">
              <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={Boolean(busy) || Boolean(overview?.ineligibleReason)} onClick={() => handleManualSend("welcome")}>
                {busy === "welcome" ? "Sending..." : "Resend welcome..."}
              </button>
              <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={Boolean(busy) || Boolean(overview?.ineligibleReason)} onClick={() => handleManualSend("reminder")}>
                {busy === "reminder" ? "Sending..." : "Send reminder now..."}
              </button>
            </div>
          </fieldset>

          <fieldset className="portal-email-section" data-tutorial-target="portal-email-preview">
            <legend>Preview (nothing is sent)</legend>
            <div className="portal-email-actions" role="tablist" aria-label="Email preview">
              {[
                ["welcome", "Welcome"],
                ["reminder", "Reminder"],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  role="tab"
                  aria-selected={previewKind === kind}
                  className={previewKind === kind ? "primary-dashboard-button" : "secondary-dashboard-button"}
                  type="button"
                  onClick={() => setPreviewKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            {preview ? (
              <>
                <p>
                  <strong>Subject:</strong> {preview.subject}
                </p>
                <iframe className="portal-email-preview-frame" title={`${previewKind} email preview`} sandbox="" srcDoc={preview.html} />
              </>
            ) : (
              <p className="portal-email-muted">{overviewError ? "Preview unavailable." : "Loading preview..."}</p>
            )}

            <div data-tutorial-target="portal-email-upcoming">
            <h5>Upcoming automatic emails</h5>
            {overview?.automationBlock ? (
              <p className="portal-email-muted">None scheduled: {overview.automationBlock}</p>
            ) : overview?.upcoming?.length ? (
              <ul className="portal-email-upcoming">
                {overview.upcoming.map((entry) => (
                  <li key={`${entry.date}-${entry.trigger}-${entry.id}-${entry.version}`}>
                    <time>{entry.date}</time> {UPCOMING_LABELS[entry.trigger]}: {entry.title} → {entry.recipients.join(", ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="portal-email-muted">Nothing scheduled.</p>
            )}
            </div>
          </fieldset>

          <fieldset className="portal-email-section">
            <legend>Test send</legend>
            {testInboxes.length === 0 ? (
              <p className="portal-email-muted">No test inboxes are allowlisted on the server, so test sends are unavailable.</p>
            ) : (
              <div className="portal-email-test">
                <label>
                  <span>Send to (server allowlist)</span>
                  <select value={testTo} onChange={(event) => setTestTo(event.target.value)}>
                    <option value="">Choose a test inbox</option>
                    {testInboxes.map((email) => (
                      <option key={email} value={email}>
                        {email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Template</span>
                  <select value={testTemplate} onChange={(event) => setTestTemplate(event.target.value)}>
                    <option value="welcome">Welcome</option>
                    <option value="update">Update / reminder</option>
                  </select>
                </label>
                <label className="portal-email-check">
                  <input type="checkbox" checked={testUseRealData} onChange={(event) => setTestUseRealData(event.target.checked)} />
                  Use this booking&apos;s real data and private link (otherwise a synthetic sample)
                </label>
                <button className="secondary-dashboard-button" type="button" data-tutorial-guard disabled={!testTo || Boolean(busy)} onClick={handleTestSend}>
                  {busy === "test" ? "Sending..." : "Send test"}
                </button>
                {testTo && <p className="portal-email-muted">Test delivery goes only to {testTo}{settings.mode === "disabled" ? " (dry run: simulated, not sent)" : ""}.</p>}
              </div>
            )}
          </fieldset>

          <fieldset className="portal-email-section" data-tutorial-target="portal-email-history">
            <legend>History</legend>
            <EmailHistoryList rows={state.history} onRetry={handleRetry} busy={busy} />
          </fieldset>
        </>
      )}
    </section>
  );
}
