# Guest portal emails: setup, architecture and rollout

Status: built and tested locally. **Nothing is deployed, no scheduler is running, no provider account exists, and live sending is disabled.** Every step below that touches production needs separate approval.

## What it does

Staff choose, per booking in **Portal Admin → Emails**:

- **Recipients.** Contact emails on file are listed unchecked. Staff can add more addresses for the booking (this never changes the booking's contact email). Everyone selected gets the group's private portal link.
- **Which items send emails.** For each task: new-task notice, reminders (7 days before, 2 days before, once when overdue), and changes requested. For each shared document: new-document notice. Everything starts off.
- **"Enable portal emails and send welcome email" + Save.** This sends one welcome per selected recipient per sending mode. Saving again, a concurrent save, or turning it off and on again never resends the welcome; that needs **Resend welcome…**.
- **Pause / Resume, Send reminder now, Resend welcome, Test send, Preview, Upcoming, History.**

Global controls (admins), in the **Guest portal emails** card at the top of Portal Admin: sending mode, automatic emails on/off, live cap, templates, server readiness, and recent history.

Staff notification emails are **not** part of this (see `docs/STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md`).

## Safety model (all enforced on the server)

| Layer | Default | Effect |
|---|---|---|
| Sending mode `portal_email_settings.mode` | `disabled` (dry run) | Dry run: previews and simulated history only, zero provider calls. Test: only the server allowlist receives mail; every other address is **blocked**, not redirected. Live: real mail. |
| Server live gate `PORTAL_EMAIL_LIVE_ENABLED` | unset | Live mode sends nothing unless this secret is exactly `true`. Changing the database mode alone cannot go live. |
| Test allowlist `PORTAL_EMAIL_TEST_ALLOWLIST` | empty | Test sends and test-mode mail go only to these addresses. |
| Provider config | missing | A missing or invalid configuration fails closed: messages are recorded as blocked. |
| Automatic emails `automation_enabled` | off | Global on/off for scheduled notices and reminders. |
| Per-booking enable | no booking enabled | Existing and new bookings start off with no recipients selected. No bulk enable, backfill or "send all pending" exists. |
| Mode epoch | — | Changing mode bumps `mode_epoch`, turns automatic emails off, cancels queued mail and makes every booking's enable stale. Dry-run or test work can never be sent live, and going live enrolls nothing. |
| Stop latches | — | 100% complete, a classification change (cancel, waitlist, reinstate, host, archive, re-import, restore) or ineligibility stops automatic mail **until staff press Resume**. Resume restarts from "now", so nothing missed is sent. |
| Live cap | 20 per rolling 24 h | Over-cap mail is **blocked**, not deferred, so a cap never builds a catch-up backlog. Manual sends count too. |
| Expiry | 24 h | Queued mail not sent within 24 hours expires. |

Every path that can reach the provider (scheduled run, welcome, manual send, test send, retry) goes through one function, `decideDelivery` in `src/utils/portalEmail.js`. It runs **after** the message is claimed, against fresh data. It checks the mode and epoch, the server config and allowlist, the booking's eligibility (shared `bookingClassification.js`; having portal tasks is not enough), selected recipients, bounces, pause and stop state, completion, and whether each item still needs the guest. A second guard runs immediately before the provider call.

### Dates and times

- America/New_York calendar dates, including daylight-saving changes. Date arithmetic is date-only.
- The scheduler runs every 15 minutes. **Deadline reminders** go out on the first run at or after **09:00 New York time** on their day: 7 days before, 2 days before, and overdue from the day **after** the due date. Each fires at most once per task, due date, recipient and mode. Past windows are never replayed. If a run misses a 7-day or 2-day window's day entirely, that reminder is skipped.
- Reminders stop when the retreat starts (start date ≤ today).
- Editing a due date is a new schedule version: queued reminders for the old date are suppressed, and only the new date's future windows apply. If an item is already overdue when its overdue reminder is enabled (or when the booking is enabled or resumed), that single overdue reminder is shown in **Upcoming** before staff save.
- **New-item and changes-requested notices** wait 10 minutes after the change, so several changes go in one email. They cover only changes after the booking was enabled or resumed, and only changes made in the last 3 days.
- Everything due for a booking and recipient in one run goes in **one combined email**.

### What counts

- **Needs the guest:** status `notStarted` or `waitingOnGuest`, with a guest action other than `none`. Submitted (`needsReview`), confirmed, removed and staff-only items are skipped. "Send back for changes" makes an item actionable again and records `email_changes_requested_at`, whichever screen did it (a database trigger).
- **100% complete:** every task confirmed (`isPortalComplete` in `portalRules.js`), the same as the portal percentage reaching 100 without its rounding. A submission awaiting review is not complete.
- **Eligible:** an ordinary booking that is going ahead. Cancelled, waitlisted, host, archive and inquiry records, and records without a portal token, never get guest mail.

### Recipients and privacy

- Each recipient gets a separate email (no shared To/CC). Delivery status and retries are tracked per recipient.
- Removing or unselecting a recipient also stops mail already queued for them.
- A changed contact email shows up as a new unchecked candidate and is never enrolled silently.
- Emails link to the portal (`<portal base>/?portal=<token>`, the same link as **Copy Link**) and never attach files.
- Logs contain message ids and counts only. History details never copy provider response text.
- A restore brings portal items back with their email options off (`withoutEmailOptions` in `backupData.js`). Deleting a booking removes its email state, so a restored booking starts off.

### Durable outbox

- `portal_email_messages` holds one row per recipient delivery. Each row is bound to the mode and epoch it was created in and has a unique `dedupe_key`. `portal_email_item_events` makes each (item, trigger, schedule version, recipient, epoch) emailable once.
- Workers claim rows with `portal_email_claim` (advisory lock + `FOR UPDATE SKIP LOCKED`), so concurrent runs, restarts and retries never double-send.
- Provider results:
  - **accepted:** the provider took the email. This is not proof of delivery; the webhook later sets **delivered** or **bounced**, and a bounce or spam complaint stops further mail to that address.
  - **Transient errors** (5xx, 429, no response) retry with backoff, at most 3 attempts. No response at all ends as **uncertain**; other errors end as **failed**.
  - **Permanent errors** fail immediately.
- **Accepted, but the database write failed:** the row stays `sending`. After 15 minutes the next claim marks it **uncertain**, and it is never resent automatically. Staff can **Retry**, which reuses the message id as Resend's `Idempotency-Key` (honoured for 24 hours), so a retry within a day cannot duplicate the email.

## Files

| Repository | File | Purpose |
|---|---|---|
| Booking software (owns all backend) | `supabase/migrations/20261104000100_portal_email.sql` | Tables, columns, triggers, access rules, service-role RPCs |
| | `supabase/optional/20261104000110_portal_email_scheduler.sql` | pg_cron job (not applied by `db push`) |
| | `supabase/functions/portal-email/` | Edge Function: `index.ts` (auth, routing, webhook), `service.js` (planning, worker, staff actions), `provider.js` (config + Resend adapter) |
| | `src/utils/portalEmail.js` | Shared rules: dates, eligibility, planning, delivery decision, templates |
| | `src/components/PortalEmailPanel.jsx`, `src/services/portalEmailService.js`, `src/styles/PortalEmail.css` | Portal Admin UI |
| | `tests/portalEmail.test.js`, `supabase/tests/portal-email.pglite.mjs` | Tests |
| Guest portal | none | The portal's link format and access are unchanged. |

## Access

- The guest portal (anon key + portal token) has no access to any email table or function. It cannot change templates, recipients, activation or sending.
- Staff (signed in, `can_manage_bookings()`) can read everything, edit recipients and item email options, and call the Edge Function actions.
- Admins (`is_staff_admin()`) can change the mode, automatic emails, cap and templates. Templates are validated in the database too (`portal_email_template_ok`).
- The outbox, ledger and per-booking state are written only by the Edge Function (service role).
- Item email options are saved with the same staff update rights Portal Admin's correction actions need. If saving them fails with a permission error, review `supabase/optional/20261028000310_portal_staff_write_policies.sql`.

## Email provider: Resend (recommended)

Why: a plain HTTPS API that works from the existing Deno Edge Functions with no SDK, per-request **idempotency keys** (24 h) for safe retries, signed delivery/bounce webhooks, and DNS records that live on a `send` subdomain plus a DKIM key. The existing Google Workspace mail records stay untouched. The provider sits behind `provider.js`, so another provider can be swapped in.

Current pricing (checked 2026-11-04 at resend.com/pricing; re-check before signing up): **Free** $0, 3,000 emails/month, **100/day**, 3 domains. **Pro** $20/month, 50,000/month, no daily limit. The free tier fits a pilot. The app's live cap (default 20/day) sits well under the free daily limit.

Alternatives considered: Postmark (strong transactional deliverability, no permanent free tier) and Amazon SES (cheapest at volume, more AWS setup). Either fits behind the adapter.

### Sender-domain verification (not done; needs DNS access and approval)

From: `Toah Nipi <contactus@toahnipi.org>` and Reply-To: `contactus@toahnipi.org` are fixed in `src/utils/portalEmail.js`.

1. In Resend, add the domain `toahnipi.org`. Resend shows the exact records to add. Typically these are:
   - a DKIM TXT record at `resend._domainkey.toahnipi.org`;
   - an MX record and an SPF TXT record on the **`send.toahnipi.org`** subdomain (the bounce/return-path domain).

   Copy the values from the Resend dashboard, not from here.
2. **Do not touch the root SPF record** for `toahnipi.org`. It belongs to Google Workspace, and a domain must have exactly one SPF record. Resend's SPF goes on `send.` only, so do not add a second root SPF record and do not replace the existing one.
3. Leave the root MX records (Google Workspace inbound mail) unchanged.
4. DMARC: if `_dmarc.toahnipi.org` already exists, keep it. Resend mail aligns through DKIM (`d=toahnipi.org`). If no DMARC record exists, start with `v=DMARC1; p=none; rua=mailto:<a monitored inbox>` and tighten later.
5. Wait for verification in Resend (minutes up to 72 hours).
6. Webhook: add an endpoint `https://<project-ref>.supabase.co/functions/v1/portal-email?webhook=resend` for `email.delivered`, `email.bounced` and `email.complained`. Copy its signing secret (`whsec_…`).

### Secrets (names only; set with `supabase secrets set`, never in `VITE_*` or git)

| Secret | Value |
|---|---|
| `PORTAL_EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | a **sending-only** Resend API key |
| `PORTAL_EMAIL_PORTAL_BASE_URL` | the guest portal's https address (same as `VITE_GUEST_PORTAL_BASE_URL`) |
| `PORTAL_EMAIL_TEST_ALLOWLIST` | comma-separated staff test inboxes (empty by default) |
| `PORTAL_EMAIL_CRON_SECRET` | a random string of at least 32 characters; also stored in Vault for the scheduler |
| `PORTAL_EMAIL_WEBHOOK_SECRET` | the Resend webhook signing secret |
| `PORTAL_EMAIL_LIVE_ENABLED` | **leave unset** until the live step; `true` opens the server half of live mode |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase. No new frontend environment variable is needed.

## Rollout checklist

Each stage is a separate, approved step. No stage enables existing bookings; bookings are always enabled one at a time by staff.

1. **Local dry run** (done). Run `npm test` and the PGlite check:
   ```
   npm install --no-save @electric-sql/pglite
   node supabase/tests/portal-email.pglite.mjs
   ```
2. **Database (approval needed).** Review, then apply `supabase/migrations/20261104000100_portal_email.sql`. Afterwards the mode is dry run, automatic emails are off, and nothing is enrolled. Check in the SQL editor: `select mode, automation_enabled from portal_email_settings;` should return `disabled`, `false`.
3. **Edge Function (approval needed).** `supabase functions deploy portal-email --use-api` (`--use-api` bundles the shared `src/utils` files). Set `PORTAL_EMAIL_PORTAL_BASE_URL` and `PORTAL_EMAIL_CRON_SECRET`; leave the provider unset. Previews and dry-run history now work in Portal Admin with zero provider calls.
4. **Synthetic test (approval needed).** Create the Resend account, verify the domain (above), and set `PORTAL_EMAIL_PROVIDER`, `RESEND_API_KEY`, `PORTAL_EMAIL_WEBHOOK_SECRET` and `PORTAL_EMAIL_TEST_ALLOWLIST=<one staff inbox>`. Switch the mode to **Test**. Use **Test send** with the synthetic sample to that inbox. Check the From and Reply-To headers, the [TEST] label, mobile rendering, the plain-text part, and SPF/DKIM/DMARC pass in the message headers.
5. **Review.** Look at the history, templates, the guest-facing wording, and this document.
6. **Scheduler (approval needed).** Create the Vault secrets and run `supabase/optional/20261104000110_portal_email_scheduler.sql`, still in Test mode. Watch history for a few days using a **synthetic test booking** whose only selected recipient is the allowlisted inbox.
7. **Production pilot (approval needed).** Set `PORTAL_EMAIL_LIVE_ENABLED=true`, check the readiness list, and switch the mode to **Live** (typed confirmation). This enrolls no booking. Enable **one** pilot booking with one confirmed contact. Turn on automatic emails only after the welcome has been reviewed.
8. Widen gradually: enable more bookings one at a time. Raise the cap only if needed.

### Kill switch and rollback

- **Fastest stop (any admin, in the app):** set the mode to **Dry run**. Queued mail is cancelled immediately, and claimed mail is re-checked against the mode before sending.
- **Server stop (no app needed):** `supabase secrets unset PORTAL_EMAIL_LIVE_ENABLED` blocks all live sending. Unsetting `RESEND_API_KEY` blocks all sending.
- **SQL stop:** `update portal_email_settings set mode = 'disabled';`
- **Stop the worker:** `select cron.unschedule('portal-email-worker');`
- Rolling back code leaves the tables in place, and they do nothing without the function. Revoke the Resend API key if it may have leaked.

## Remaining external steps

Resend account and API key; domain verification DNS records; webhook endpoint; secrets; migration; function deploy; Vault secrets and scheduler. **No real email has been sent or delivery tested.** The provider adapter was tested with a fake transport only.
