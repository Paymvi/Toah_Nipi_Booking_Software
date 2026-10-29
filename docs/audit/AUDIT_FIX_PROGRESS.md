# Audit Fix Progress

Tracks the implementation of [BOOKING_SYSTEM_AUDIT.md](BOOKING_SYSTEM_AUDIT.md) using the answers in [AUDIT_QUESTIONS_ANSWERED.md](AUDIT_QUESTIONS_ANSWERED.md). Answers take priority over the audit's recommendations.

## Starting state (2026-10-28)

- Branch `main`, HEAD `16dd827` (the audited revision). `git diff 16dd827 -- src supabase` is empty, so every finding still applies as written in pass 2.
- Untracked files: `BOOKING_SYSTEM_AUDIT.md` and `AUDIT_QUESTIONS_ANSWERED.md`. Both are preserved unchanged.
- No project instruction file (`CLAUDE.md`) exists.
- Baseline checks before any change:
  - `npx vite build`: passes (one chunk-size warning).
  - `npx eslint .`: **90 errors, 19 warnings already present** (64 no-unused-vars, 15 react-hooks/set-state-in-effect, 19 exhaustive-deps, 7 only-export-components, 3 no-useless-escape, 1 immutability). These are recorded so new problems can be told apart from old ones.
  - No automated tests existed.
- Environment available: Node 22.12, Chrome, Edge. Docker is installed but its engine is not running, and there is no local Postgres. SQL is demonstrated with PGlite (an in-process Postgres 17 build) installed in a scratch folder, **not** the live database. Browser checks use playwright-core driving the installed Chrome against a local harness with Supabase stubbed out.
- Google Apps Script backup source: **not available** (README says it lives outside the repo). Only README's description of its output format can be relied on.

## Status key

| Status | Meaning |
|---|---|
| **Verified** | Implemented and checked by automated tests and/or a browser check in this environment. |
| **Awaiting deployment** | Code or SQL is ready but needs a migration run, a function deploy, or a hosting change by you before it takes effect. |
| **Awaiting external verification** | Implemented as far as the repository allows; correctness depends on something only the live system or an external app can show (Part C checks). |
| **Deferred** | Intentionally not done now, by your decision. |
| **Superseded** | Your answers replaced the audit's recommendation; the replacement behavior is described and checked. |
| **In progress** / **Not started** | Work state during the run. |

A row can carry two statuses (for example "Verified (code) · Awaiting deployment (SQL)").

## Findings

Evidence keys: **T** = `npm test` file in `tests/` (90 tests, all passing); **B** = browser check against the harness (45/45 passing, Chrome, 1280px and 390px); **P** = `supabase/repairs/verify-with-pglite.mjs` (25/25 passing, PGlite test database, not live data); **L/Bd** = lint and build (no new lint findings; build passes).

| Finding | Answers | Resolution | Status | Evidence | Remaining dependency |
|---|---|---|---|---|---|
| AUDIT-001 | Part B | `createdAt` mapped (read-only); named raw keys (`inquiryDisposition`, `firstName`, `lastName`, `linenPieces`, `facilities`) restored; row metadata no longer copied into `raw_data`. | Verified | T `bookingSave.test.js` (round-trip) | — |
| AUDIT-002 | Part B, Q-039 | `activities` column always written as readable text; JSON text read back as a summary; repair 03. | Verified (code) · Awaiting deployment (repair) | T, P | Run repair 03; V-011 |
| AUDIT-003 | Part B, Q-039 | Edit tab mirrors into hidden copies; Contacts/Reports read the column first; re-import keeps copies equal; repair 02. | Verified (code) · Awaiting deployment (repair) | T `bookingFields`, `masterImportMerge`; B (Contacts shows edited email); P | Run repair 02; V-009 |
| AUDIT-004 | Part B | Guest-inquiry link tied to the form seed and to the saved booking's `sourceInquiryId`; cleared when leaving the form; repair 06 (unambiguous cases only). | Verified (code) · Awaiting deployment (repair) | T `guestInquiryConversion`; P | Run repair 06; review list; V-014 |
| AUDIT-005 | Part B, Q-039 | One summary builder; camping written once; Create Booking edits keep Housing detail; repair 04 for the duplicate suffix. | Verified (code) · Awaiting deployment (repair) | T `lodging`; P | Run repair 04; review list for truncated text |
| AUDIT-006 | Q-001 A, Q-002 A | Re-import keeps app-edited fields (edit history + import baseline; conservative for old records); status only from an explicit sheet status; dialog text corrected; failures reported per row. | Verified | T `masterImportMerge` (12 cases) | Real-workbook re-import test by staff |
| AUDIT-007 | Q-024 A | Housing tab authoritative after save; `roomName` follows it; imported text kept as a reference note; unticked buildings stay unticked; re-import cannot restore lodging; repair 04. | Verified (code) · Awaiting deployment (repair) | T `lodging`, `masterImportMerge`; P | Run repair 04 |
| AUDIT-008 | Part B | Failure shown above the form with Retry; marking is retry-safe and never relinks; Guest Inquiries offers "Mark converted to this booking". | Verified (logic) · Awaiting external verification | T | V-003 (whether staff may update `guest_inquiries`) |
| AUDIT-009 | Q-012 A, Q-013 A | Backup v2 carries `portalToken`/`createdAt`; restore inserts missing bookings with them; rollback too; Replace gated by Dev Mode + admin + typed phrase. | Verified (code) | T `backup`; B (Replace locked) | V-001, V-013; Apps Script still writes v1 (see report) |
| AUDIT-010 | Q-012 A, Q-013 A, Q-014 | v2 adds website inquiries, portal tasks/documents and a file manifest (locations only); merge inserts only missing rows, parents first; Replace stops if not all bookings deleted. | Verified (code) · Awaiting external verification | T `backup` | V-002 (FK delete rule), V-003, V-015 |
| AUDIT-011 | Q-011 (as clarified) | Superseded: Pipeline retired from staff access (route shows a notice unless Dev Mode); code kept unchanged; it no longer feeds any live screen. | Superseded · Verified | B (direct route) | — |
| AUDIT-012 | Part B | Spreadsheet "Submitted", Contacts ordering and the export use the real inquiry date. | Verified (build/lint) | L/Bd | — |
| AUDIT-013 | Q-032 A | UTC reading of Excel dates; re-import matches records one day early; evidence-based repair 05. | Verified (code) · Awaiting deployment (repair) | T `excelDates` (Eastern time); P | Run repair 05 |
| AUDIT-014 | Q-034 A | "Export contact list", disposition column, real dates, "About this file" sheet pointing to JSON backups. | Verified (build/lint) | L/Bd | — |
| AUDIT-015 | Q-027 | Superseded: revenue reporting removed from screen and CSV; financial fields untouched. | Superseded · Verified | B (no revenue on Reports) | — |
| AUDIT-016 | Q-021 (judgment) | Assignments show "Assigned", never overdue or counted; cancelled/waitlisted groups' work hidden behind a toggle. | Verified | T `jobsAndStaff`; B | — |
| AUDIT-017 | Q-019, Q-020 (judgment) | Shared `staff_directory` table (fallback to browser list); no auto re-adding, no placeholders, no default "Working as"; completion requires a "Working as" choice; unlisted names shown for explicit adding. | Verified (code) · Awaiting deployment (migration) | T; B (User Admin) | Run migration 0100; then "Copy this browser's old list into it" |
| AUDIT-018 | Q-029 | Lower number of a range for calculations; text kept for display. | Verified | T `bookingFields`, `reports` | — |
| AUDIT-019 | Part B | Status recalculated only when the disposition text changed. | Verified (build/lint) | L/Bd | — |
| AUDIT-020 | Q-004, Q-005 | Lodging excludes hosts, inquiries, clearly cancelled; Calendar toggles for cancelled/waitlist/archive/host; "Booked" label, never "Unconfirmed". | Verified | T `bookingClassification`; B | — |
| AUDIT-021 | — | New migrations for every table/column this work adds; read-only schema-export queries; docs updated. Live schema still not in the repo. | Awaiting external verification | — | V-002, V-021: export the live schema |
| AUDIT-022 | Part B | Production build without `VITE_GUEST_PORTAL_BASE_URL` shows an error instead of a localhost link. | Verified (build/lint) · Awaiting external verification | L/Bd | V-007 |
| AUDIT-023 | Q-023 A | Deletes check affected rows; role read via `current_staff_role()`; delete/Replace hidden from non-admins; viewers cannot save or import. | Verified (code) · Awaiting external verification | T (delete/not-permitted paths); B | V-003 (viewer accounts) |
| AUDIT-024 | Q-033 | Deferred by decision; year defaults unchanged for new records (re-import no longer applies them to saved records). | Deferred | — | Before 2028 sheets |
| AUDIT-025 | Q-035 A | Archive importer, its input, menu item and constants removed; archive records and display kept. | Verified | L/Bd; repo search | — |
| AUDIT-026 | Part B | New booking added to dashboard state; notice above the form survives the form reset. | Verified (build/lint) | L/Bd | — |
| AUDIT-027 | Part B | OPTIONS/CORS, strict date and money validation in `submit-guest-inquiry`. | Awaiting deployment | Parsed as TypeScript (Deno type-check not run) | Deploy; V-005; optional `PUBLIC_FORM_ORIGINS` secret |
| AUDIT-028 | — | Allergy/activity/meal-schedule items reduced to the shapes staff screens read. | Awaiting deployment · Awaiting external verification | — | Deploy; V-022 (public form payload) |
| AUDIT-029 | Q-015, Q-016 | Superseded in part: no timeline/portal linkage; progress lives in the portal; Dashboard "Contracts awaiting return" removed; Needs Review counts half everywhere progress is shown. | Superseded · Verified | T `portal`; B (38%) | — |
| AUDIT-030 | Q-008 | Count everything except hosts; converted inquiries once; rule stated on screen and in CSV. | Verified | T `reports`; B | — |
| AUDIT-031 | Q-025 | One building list (Ajalon; Camping everywhere; Rustic Cottages removed; old spellings matched but not shown). | Verified | T `lodging`; B | — |
| AUDIT-032 | Q-010 A | "Imported" gone from the forms (Booked/Waitlist/Cancelled; Archived visit read-only); repair 07. | Verified (code) · Awaiting deployment (repair) | P | Run repair 07; V-010 |
| AUDIT-033 | Part B, Q-035 | Verified dead code removed (≈1,100 lines). Pipeline kept by your decision. | Verified | L/Bd; repo search before each removal | — |
| AUDIT-034 | Q-004/005/007/008/015 | Shared classification with named per-screen rules. | Verified | T `bookingClassification` | — |
| AUDIT-035 | Q-028 A | Sheet Camper Days used until guests/nights/meals are edited in the app. | Verified | T `reports` | Applies to edits made after this change (older edits have no history) |
| AUDIT-036 | Q-031 A | Five sources (plus "Older public form" for legacy rows). | Verified | T `reports` | — |
| AUDIT-037 | Q-006 | Night-based occupancy; shared building is not a conflict; only same room + same night is; missing room detail stated. | Verified | T `lodging`; B | — |
| AUDIT-038 | Q-017 (all five) | Remove task (guest file kept, moved out of guest folder, record archived), change due date, request changes, remove staff document, reopen; `storage_path` recorded. | Verified (logic) · Awaiting deployment (migration) · Awaiting external verification | T `portal`; B (menu) | Migration 0300; V-003 (staff update/delete rights; optional policy file); V-008 |
| AUDIT-039 | Q-036 A | Secondary contacts in the main list, labeled and searchable; separate table removed. | Verified | B | — |
| AUDIT-040 | Q-037 A | Need To Know = operational notes; meal notes shown with meals; linen pieces in the linen text; repair 08. | Verified (code) · Awaiting deployment (repair) | P | Run repair 08 |
| AUDIT-041 | Part B | README, `supabase-system-documentation.md`, `SQL_SETUP.md` corrected; summary section added. | Verified | — | — |
| AUDIT-042 | Q-030 A | Reports group by the official 22 types; "PR" mapped; other shorthand shown "(not mapped)" with its text. Unused normalizer removed. | Verified | T `reports` | Your shorthand list (`RETREAT_TYPE_ALIASES`) |
| AUDIT-043 | Q-022 A | Facilities rows are Jobs tasks with a staff picker and "Mark done". | Verified | T `jobsAndStaff`; B | — |
| AUDIT-044 | Part B, Q-040 B | Fill Test Data only in Dev Mode and never on a seeded form; existing test bookings left. | Verified | B | — |
| AUDIT-045 | Q-003 A | Atomic conditional update on `updated_at`; conflict message keeps edits; Checklists save queue; imports use the same check. | Verified | T `bookingSave` (two editors, rapid clicks); P (SQL semantics) | V-017 (guest portal writes to `bookings`?) |
| AUDIT-046 | Q-009 A | Arrival-month attribution for rows and totals; Undated row. | Verified | T `reports` | — |
| AUDIT-047 | Q-026 | Superseded: loose deposit rule kept as is. | Superseded | — | — |
| AUDIT-048 | Part B | CSV rounded, "Filters Used" section, formula-like text neutralized. | Verified | T `reports` | — |
| AUDIT-049 | Q-038 A | Transitive grouping; hidden contacts shared, stars per login (shared login ⇒ shared stars), matched by any identity key; browser lists copied up once. | Verified (code) · Awaiting deployment (migration) | T `contacts`; B | Run migration 0200 |
| AUDIT-050 | Q-018 | Duplicates warned, not blocked; due date after arrival warned; no preselection; retry-safe request ids that allow intentional repeats. | Verified (code) · Awaiting deployment (migration) | T `portal`; P | Migration 0300; V-018 (an existing unique index could still block repeats) |

## Batch log

_Updated after each batch._

### Batches 1–3 — shared rules, persistence, re-import (done)

- **Added** `src/utils/bookingClassification.js` (record kind, cancelled/waitlist, per-screen inclusion rules, the Booked/Waitlist/Cancelled control), `src/utils/bookingFields.js` (duplicated-field reads, mirroring, guest-count parsing, staff edit history), `src/services/bookingMapping.js` (pure row mapping, split from `bookingService.js`), `src/services/bookingSave.js` (conditional save), `src/utils/serialBookingSaver.js`, `src/utils/masterImportMerge.js`.
- **Tests:** `npm test` (Node's built-in runner, no new dependency). `tests/*.test.js`.
- **Decisions made during the batch:**
  - The conflict check is one conditional `UPDATE … WHERE id = ? AND updated_at = ?`. The existing `set_bookings_updated_at` trigger (SQL_SETUP Script 04) moves `updated_at`; the client also sends a fresh timestamp so detection still works if that trigger is missing. No migration is needed for this.
  - `normalizeInquiry` was dropping `updatedAt`, `createdAt` and `portalToken`; they now pass through. Three places set `updatedAt` to "now" before saving (Edit tab, incident notes, `saveBookingEdits`); removed, because that would defeat the check.
  - Re-import keeps a per-record `importBaseline`. For older records it is rebuilt from the saved sheet row; if that is impossible a filled app value is kept. Records are matched on the stable import ID first, so a group renamed in the app still matches.
  - Un-cancelling keeps the cancellation date and records `reinstatedAt` instead of erasing it.
- **Next:** Batch 4, inquiry conversion (004, 008, 044, 026).

### Batches 4–6 — conversion, lodging, calendar and status (done)

- **Conversion:** `src/services/guestInquiryConversion.js`. The pending website inquiry is tied to the form seed and is marked only if the saved booking records it as `sourceInquiryId`. Marking is retry-safe and never relinks an inquiry converted to another booking. A notice above the form shows success, or the failure with a Retry button. Guest Inquiries flags pending inquiries that already have a booking and offers "Mark converted to this booking". Fill Test Data renders only in Dev Mode and never on a seeded form. New bookings are added to dashboard state immediately.
- **Inquiry Record Detail:** status is recalculated only when the disposition text changed.
- **Lodging:** `src/constants/lodgingConstants.js` and `src/utils/lodgingUtils.js` replace the seven building lists (Create Booking, Housing tab, Lodging Calendar, Dashboard home, Overview card; Reports follows in its batch). Camping was added to Create Booking. The Housing tab save sets `housingSavedAt`, records a `lodging` staff edit, keeps `roomName` equal to the summary, keeps the first imported text as `importedLodgingText`, and no longer appends a second camping summary. Unticked buildings stay unticked. The Lodging Calendar includes only records that hold lodging. Its availability lookup is night-based and reports Available / In use / Shared / Room conflict, with notes for missing room detail and for counts over capacity.
- **Status:** the Edit tab and Create Booking edit replace the Status/Waitlist dropdowns with Booked / Waitlist / Cancelled; Archived visit is read-only and "Imported" is gone. New staff bookings save as Confirmed. The Dashboard home uses the shared classification and no longer shows "Contracts awaiting return". The Calendar shows Booked/Inquiry labels and has off-by-default toggles for Cancelled, Waitlist, Archived visits and Host records. Converted inquiries are shown once.
- **Pipeline:** renders only with Dev Mode on. Otherwise `/inquiry-pipeline` shows a retired notice. Its code is unchanged.
- **Next:** Batch 7, backups (009, 010, 001, 038 storage paths), Replace gating.

### Batches 7–9 — backups, portal, staff/jobs/roles (done)

- **Backups:** `src/utils/backupFormat.js` (version 1 and 2 reading, version 2 writing), `src/services/backupData.js` (client-free read/restore logic) and `src/services/backupService.js`.
  - Version 2 adds website inquiries, portal tasks, portal documents and a file manifest. Bookings carry `portalToken` and `createdAt`.
  - Merge updates live bookings and inserts missing ones with their original token and creation date. Supporting tables only insert rows that are missing.
  - Version 1 (the Apps Script format, according to README) still validates and restores, with a warning that it holds bookings only.
  - Full Replace needs Dev Mode, an account allowed to delete, and the typed phrase `REPLACE AND RISK PORTAL DATA`. It stops if not every booking was deleted. The safety snapshot is version 2. Rollback re-inserts bookings with their original tokens.
- **Portal:** `src/utils/portalRules.js` and `src/services/portalCorrections.js`.
  - Needs Review counts half.
  - Five correction actions, each guarded by status. Removing a task with a guest upload copies its record to `portal_removed_uploads` and moves the file out of the guest's folder. Without that table the removal is refused.
  - Duplicates are warned about, not blocked; a custom file sharing a name no longer blocks the standard document. Due dates after arrival get a warning. Nothing is preselected.
  - Inserts carry a `client_request_id` reused on retry, and fall back to plain inserts before the migration.
  - A custom document's `storage_path` is recorded. A production build without `VITE_GUEST_PORTAL_BASE_URL` shows an error instead of a localhost link.
- **Staff:** `src/services/staffDirectory.js` (shared `staff_directory` table, with a fallback to this browser's list). Names are no longer re-added automatically, placeholder users are gone, and "Working as" has no default. Checklist and Facilities completion require a "Working as" choice. The Staff Contacts import no longer re-activates people.
- **Jobs:** `src/utils/jobsUtils.js`. Facilities rows are tasks with a staff picker in Create Booking and a "Mark done" toggle in Jobs. Staff assignments show as "Assigned". Cancelled and waitlisted groups are hidden by default.
- **Roles:** the role comes from `rpc('current_staff_role')`. Delete, Delete All and Replace are hidden for non-admins, and viewers cannot save or import. Delete counts are checked (batch 2).

### Batches 10–13 — reports, contacts, export, function, database, cleanup (done)

- Reports, Contacts, Spreadsheet/Export, Edge Function, migrations, repairs (with PGlite proof), dead code, docs, browser checks: see the table above and `AUDIT_FIX_REPORT.md`.
- Final checks: `npm test` 90/90; `vite build` passes; `eslint .` 68 errors / 9 warnings (baseline 90 / 19), no new findings (one pre-existing SpreadsheetView warning moved lines); browser 45/45; PGlite 25/25.

## Status: complete for this run

All repository work is done. Nothing was committed, pushed, deployed, or run against the live database. Remaining steps are yours; they are listed in order in `AUDIT_FIX_REPORT.md`, "What you need to do next".
