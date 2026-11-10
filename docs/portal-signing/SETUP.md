# Online signing: setup, testing and activation

Guests can sign a staff-uploaded PDF in the portal instead of printing, signing and uploading it. Plan and legal notes: [ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md](../audit/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md).

**Status (2026-11-08): built and tested locally with fictional documents. Not deployed. Off for every booking.** The signing wording is a draft and has not been approved by a lawyer. Nothing here makes an agreement enforceable; it records what happened.

## How it works

1. Staff upload the PDF for the booking (Assign Documents → custom upload), then on the task choose **Correct… → Sign online with → \<the PDF\> → Save signing choice**. Only upload tasks and PDFs can be used. **Upload Paper Copy** stays available to the guest.
2. The guest clicks **Review & Sign**, opens the document, enters their name (and organization and title when signing for a group), chooses **Type my name** (default) or **Draw my signature**, ticks the agreement (and the authority statement for a group) and clicks **Sign document**.
3. The `portal-sign` function checks the portal link, the task, the linked document and the exact file the guest was shown, then:
   - saves a copy of the original PDF and a signed copy (original pages unchanged plus one signature page) in the private `portal-signed` bucket;
   - in one database transaction, writes the `portal_signatures` row and moves the task to **Needs Review**.
4. The guest gets a download right away; signed copies stay in the portal's **Documents** tab (each download gets a fresh 10-minute link).
5. Staff see **Signed online by …**, **Open Signed PDF** and **Signing Details**, and click the usual **Confirm**. **Send back for changes** and **Reopen** work as before; every earlier signed copy is kept.

Booking status and the contract-returned date are never changed by signing.

## What protects the records

- **Off by default.** `portal_signing_settings` (one row) has `enabled = false`; only bookings listed in `test_booking_ids` can sign until it is turned on.
- **Server decides.** The browser sends only the signer's entries and the fingerprint of the file it showed. Booking, task and document are looked up from the portal link on every call. A replaced file or changed task link is refused ("changed or replaced").
- **One signature per task.** The recording function locks the task row; a second submission (any request key) or a paper upload racing it finds the task already in review. A repeated request (same key, for example after a lost response) returns the saved signature instead of signing twice.
- **Saved before reported.** Files are written first, then the row and the status in one transaction. A failure never shows "Signed". Files from a save whose outcome is unknown are kept, never deleted.
- **Locked records.** `portal_signatures` has no insert, update or delete access for guests or staff, and a database trigger refuses updates, deletes and truncation for everyone, the service role included. `portal-signed` has staff read access only. A booking with signatures cannot be deleted, and Full Replace restore is refused while any exist.
- **Not identity verification.** The portal link is shared within a group. The record says who *typed* what, when, from which IP address and browser, not who that person is. Staff review is the check, as with paper.
- Logs hold the action and an outcome code only: no portal links, names or file contents.
- **Retention:** nothing deletes signing records or files. Keep everything until an approved retention policy exists.

## Files

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20261107000100_portal_signing.sql` |
| Server | `supabase/functions/portal-sign/index.ts`, `signing.js`; `[functions.portal-sign]` in `supabase/config.toml` |
| Staff app | `src/pages/PortalAdminView.jsx`, `src/services/portalCorrections.js`, `src/utils/portalRules.js`, `src/services/bookingService.js` (delete message), `src/styles/PortalAdminView.css` |
| Backups | `src/utils/backupFormat.js` (version 3), `src/services/backupData.js`, `src/services/signingBackup.js`, `src/components/SignedDocumentsBackup.jsx`, `src/components/DashboardBackups.jsx`, `src/styles/DashboardBackups.css` |
| Guest portal (other repo) | `src/signing.jsx`, `src/signingFormat.js`, `src/App.jsx`, `src/App.css`, `src/services/portalService.js` |
| Tests | `tests/portalSigning.test.js`, `tests/signingBackup.test.js`, `tests/fixtures/signingFixtures.js` (fictional PDFs), `supabase/tests/*.local.mjs`, `supabase/tests/make-local-signing-stack.mjs` |

New dependencies: `jszip` (already installed through `exceljs`, now listed directly) and `pdf-lib` (dev only, for Node tests; the function imports `npm:pdf-lib@1.17.1`).

## Backups

- The **JSON backup** is now version 3: it adds the signing records, and its file list includes every original and signed PDF with its SHA-256 fingerprint. Version 1 and 2 files still restore. **Update the app before taking version 3 backups**: an older build refuses them.
- **Signed documents** (Backups page): **Download Signed Documents** saves a `.zip` with every original and signed PDF plus `manifest.json` (all signing records and fingerprints), checking each file first. Make one after each JSON backup and store it with the others. **Restore signed documents** (admins) checks every fingerprint before writing anything, then adds only missing records and files.
- Merge restore adds missing signing records through an admin-only database function. Full Replace is refused while signing records exist.
- Files in `portal-uploads` (staff documents, paper uploads) are still not backed up by this app. Each signing record has its own copy of the original, so the signing evidence does not depend on them.

## Review it locally (nothing touches the live project)

Needs Docker Desktop running.

1. Schema-only copy of the live database (read-only, no rows), saved **outside** the repository:
   `npx supabase db dump --linked --schema public -f %USERPROFILE%\toah-signing-local\public_schema.sql`
2. Build the isolated stack folder and start it:
   `node supabase/tests/make-local-signing-stack.mjs %USERPROFILE%\toah-signing-local %USERPROFILE%\toah-signing-local\public_schema.sql`
   `npx supabase start --workdir %USERPROFILE%\toah-signing-local -x realtime,studio,imgproxy,vector,supavisor,postgres-meta,mailpit,logflare`
3. Note the local values: `npx supabase status --workdir %USERPROFILE%\toah-signing-local -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`). In PowerShell:
   `$env:LOCAL_SUPABASE_URL="http://127.0.0.1:54321"; $env:LOCAL_ANON_KEY="<ANON_KEY>"; $env:LOCAL_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"`
   The stack gives anon, authenticated and service_role the same grants as live, so the service role cannot write the tables the tests fill. The scripts seed through a local-only `test_seeder` role instead; make its key from the stack's `JWT_SECRET`:
   `$env:LOCAL_SEEDER_KEY = node -e "const c=require('crypto'),b=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),h=b({alg:'HS256',typ:'JWT'}),p=b({role:'test_seeder',exp:1983812996});console.log(h+'.'+p+'.'+c.createHmac('sha256',process.argv[1]).update(h+'.'+p).digest('base64url'))" "<JWT_SECRET>"`
4. Fictional bookings and a local staff login: `node supabase/tests/portal-sign-seed.local.mjs`
5. Run the apps against the local stack (the variables override `.env.local`):
   - Portal (in `Toah_Nipi_Portal`): `$env:VITE_SUPABASE_URL=$env:LOCAL_SUPABASE_URL; $env:VITE_SUPABASE_PUBLISHABLE_KEY=$env:LOCAL_ANON_KEY; npx vite --port 5311 --host 127.0.0.1`
   - Staff (here, new window, same `LOCAL_*` values): `$env:VITE_SUPABASE_URL=$env:LOCAL_SUPABASE_URL; $env:VITE_SUPABASE_PUBLISHABLE_KEY=$env:LOCAL_ANON_KEY; $env:VITE_GUEST_PORTAL_BASE_URL="http://127.0.0.1:5311"; npx vite --port 5312 --host 127.0.0.1`
6. Open the printed portal links and http://127.0.0.1:5312 (log in with the printed local staff login → Portal View, Backup).
   - Local quirk: links to PDFs made inside Docker point at `http://kong:8000/...`. Replace that part with `http://127.0.0.1:54321` to open them. Hosted Supabase uses the project address.
7. Automated checks: `npm test`; `node supabase/tests/portal-sign.local.mjs`; `node supabase/tests/security-access.local.mjs` (access matrix, see `docs/audit/SECURITY_AUDIT_2026-11-10.md`); `node supabase/tests/portal-sign-restore.local.mjs` (also needs `LOCAL_SUPABASE_WORKDIR` and `LOCAL_DRILL_DIR` set; it **wipes the local database**).
8. Stop: `npx supabase stop --workdir %USERPROFILE%\toah-signing-local`

## Deploy (after review; not done)

1. Run `supabase/migrations/20261107000100_portal_signing.sql` in the Supabase SQL editor. It is safe to run twice. It replaces `get_portal_record` with the live definition read on 2026-11-07 plus signing fields. If that function has been changed since, merge first (the live definition is in [ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql](../audit/ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql)).
2. Deploy the function: `npx supabase functions deploy portal-sign --no-verify-jwt`.
3. Deploy the staff app and the portal (both builds are needed; the order does not matter while signing is off).
4. Check: Portal Admin loads and shows **Sign online with** under Correct… on upload tasks; a guest portal still loads; `select enabled, test_booking_ids from portal_signing_settings;` shows `false` and `{}`.
5. Trial on a **fictional booking** made in the live system:
   `update portal_signing_settings set test_booking_ids = array['<fictional booking id>'], updated_at = now();`
   Sign it in the portal, confirm it in Portal Admin, download the signed copy, make a JSON backup and a signed-documents export. The fictional booking and its signature then stay permanently (they cannot be deleted); mark the booking cancelled.

**Turn on for everyone** (only after the checklist below): `update portal_signing_settings set enabled = true, updated_at = now();`
**Turn off** (guests see paper upload only; existing records stay): `update portal_signing_settings set enabled = false, updated_at = now();`

## Before real guests use it

- [ ] Real general and InterVarsity contract templates received and tried (development used a fictional sample).
- [ ] Lawyer: signature page added at the end is acceptable, or not (plan Q-2).
- [ ] Lawyer: agreement and authority wording approved (Q-3). Then change `AGREEMENT_TEXT` / `AGREEMENT_VERSION` in `signing.js` to the approved text and set `agreement_approved = true`.
- [ ] Lawyer: whether individual or family bookings need the fuller federal consumer-consent screen (Q-4). If yes, that screen must be built first, or those bookings stay on paper.
- [ ] Lawyer and staff: whether Toah Nipi countersigns the contract (Q-1); for now staff would countersign the downloaded copy on paper.
- [ ] Insurer: any requirements, for example identity checks (Q-5). Version 1 does not verify identity.
- [ ] Retention period and who may delete (Q-6). Until then nothing is deleted.
- [ ] Public documents cleaned (admin Wi-Fi details, sample insurance certificate) before they are uploaded for signing.
- [ ] Staff shown how to link a task, review a signed copy, send back for changes, and make the signed-documents export.
- [ ] Live trial on a fictional booking passed (Deploy, step 5).

## Known limits

- **Characters:** names and entries must be printable in the PDF's standard fonts: Latin letters, including accents such as é, ñ and ü. Other scripts (for example Chinese or Vietnamese ễ) are refused with a message. Drawing still works, but the name must be typed in Latin letters.
- **Phones:** they show **Open document** instead of the inline preview.
- **Drawing:** needs a mouse, finger or stylus; typing works from the keyboard.
- **Function limits:** measured in the local Supabase Edge runtime, which enforces the same 1 s soft / 2 s hard CPU limits as hosted. Each request on a fresh worker stayed under the soft limit, including a 9.3 MB scanned-style PDF (516 ms wall clock for signing) and a 400-page PDF. Hosted memory limits and timings were not measured.
- **Export size:** the signed-documents export is built in the browser's memory. Use "signed since" to split very large exports.
- **Staff documents tab:** guests opening staff-uploaded documents from the Documents tab is a separate, older issue (no guest read rule on `portal-uploads`). Signing does not depend on it: `portal-sign` serves the document itself.
