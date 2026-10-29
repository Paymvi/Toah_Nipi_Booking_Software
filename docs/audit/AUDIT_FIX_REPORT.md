# Audit Fix Report

Booking-system audit fixes, done on 2026-10-28 and 2026-10-29 from your answers in [AUDIT_QUESTIONS_ANSWERED.md](AUDIT_QUESTIONS_ANSWERED.md). The finding-by-finding table, with evidence and remaining dependencies, is in [AUDIT_FIX_PROGRESS.md](AUDIT_FIX_PROGRESS.md). The original audit and your answers are unchanged.

**Nothing was committed, pushed or deployed. No SQL was run against the live database.**

## The short version

- **Status is out of the Dashboard, but classification is kept.** Master and staff bookings count as real bookings. Contract, deposit and insurance progress lives in Portal Admin. The edit forms now only mark a booking as Booked, Waitlist or Cancelled. Inquiries, cancellations, waitlist records, archive visits, host records and converted inquiries are still told apart, by one shared set of rules.
- **Staff edits are protected:**
  - from a second editor: a save based on an out-of-date copy is refused, and the screen keeps your unsaved changes;
  - from quick clicks on the Checklists tab;
  - from Master re-imports overwriting what staff changed in the app.
- **Lodging:**
  - One building list everywhere: Ajalon, Camping included, no Rustic Cottages.
  - The Housing tab owns lodging once it has been saved.
  - Availability is counted by night. Two groups can share a building; only two groups in the same room on the same night is flagged.
- **Backups (version 2)** now include website inquiries, portal tasks, portal documents, and a list of the uploaded files those records point to. Old version 1 files still restore. Full Replace needs Dev Mode, an admin account and a typed phrase.
- **Portal Admin** can do all five corrections. Needs Review counts as half done. You get a warning, not a block, for duplicate assignments and for due dates after arrival.
- **Reports** count everything except host records, count a converted inquiry once, attribute stays to their arrival month (with an Undated row), and no longer show revenue.
- **New database pieces** are ready but not applied: three migrations, an optional policy file, and eight repair scripts with an undo log.

## What changed and why

### Shared rules (AUDIT-034, 018, 003)
- **One classification for every record:**
  - The kinds are booking, inquiry, host and archive, and a record can additionally be cancelled or waitlisted.
  - Each screen states its own inclusion rule in [src/utils/bookingClassification.js](src/utils/bookingClassification.js).
  - "Clearly cancelled" means the status says Cancelled, or there is a real cancellation date that staff have not reversed.
  - Reinstating a booking keeps the cancellation date as history; it doesn't erase it.
- **Duplicated Master fields read the newest copy.** Master imports keep two copies of many fields. Every edit path writes the main column, so readers use it first, and the Edit tab now updates both copies ([src/utils/bookingFields.js](src/utils/bookingFields.js)).
- **Guest counts** use the lower number of a range ("40-50" → 40) for calculations, and show the original text everywhere else.

### Saving safely (AUDIT-045, 001, 002, 023)
- **Atomic conflict check.** A save only succeeds if the booking still has the `updated_at` value it had when the screen loaded it, in one database statement ([src/services/bookingSave.js](src/services/bookingSave.js)). It relies on the existing `updated_at` trigger, so no migration is needed.
  - If someone else saved first, nothing is overwritten. You see "Someone else saved this booking…", and your typed changes stay on screen.
  - Three places used to reset `updated_at` before saving, and the dashboard dropped it entirely. Both are fixed.
- **Checklists** saves run one at a time, each building on the last, and the controls are disabled while saving.
- **Imports** use the same check, row by row, and report any rows that were not saved.
- **Deletes** check that a row was actually removed. A delete the database refuses now says "not permitted" instead of the booking vanishing and coming back.
- **Activities** are always saved as readable text. **`createdAt`** is available on every booking.

### Master re-import (AUDIT-006, 007, 013, 025)
- **The app wins for anything staff changed** (Q-002 A):
  - Each import stores what the sheet said (`importBaseline`), and the app records which fields staff edit.
  - A later import only updates a field that is still exactly what the last import wrote.
- **Older imports are handled conservatively.** For records imported before this change, the baseline is rebuilt from the saved sheet row. If that isn't possible, a filled app value is kept, because an edit can't be ruled out.
- **Status** changes only when the sheet row actually states a status.
- **Lodging:**
  - After the Housing tab has been saved, the sheet never changes lodging again.
  - A blank lodging cell never resets the label to "Unassigned".
- **Renamed groups still match.** Records are matched on their import ID first, so a group renamed in the app is still recognized. The import confirmation now lists which fields kept the app's value.
- **Excel dates** are read in UTC, so they are no longer one day early in U.S. Eastern time. Re-import also recognizes old records whose date was one day early.
- **The Archive importer is removed.** Archive records and their display are unchanged.

### Website inquiries (AUDIT-004, 008, 044, 026, 019)
- **Converting an inquiry:**
  - An inquiry is marked converted only if the form was opened from it and the saved booking still names it as its source.
  - Marking is safe to retry, and it never relinks an inquiry that was already converted to a different booking.
- **Failures are shown.** A notice above the form says the booking was saved but the inquiry is still open, with a Retry button.
- **Guest Inquiries** flags pending inquiries that already have a booking, and offers "Mark converted to this booking".
- **Fill Test Data** only appears in Dev Mode, and never on a form that was opened from an inquiry. Existing test bookings were left in place, as you asked.
- **Inquiry Record Detail** only recalculates status when the disposition itself changed.

### Lodging (AUDIT-005, 007, 031, 037, 020)
- **One building list and one summary builder** ([src/constants/lodgingConstants.js](src/constants/lodgingConstants.js), [src/utils/lodgingUtils.js](src/utils/lodgingUtils.js)). Capacities are only the values the app already had.
  - "Aijalon" and "Capurnum" are still recognized in old imported text, but are never displayed.
  - Camping now appears in Create Booking, the Overview card and the Lodging Calendar.
- **The Lodging Calendar counts** every record except host records, inquiries and clearly cancelled bookings.
- **The availability lookup** reports each building as:
  - Available;
  - In use;
  - Shared, for several groups in different rooms;
  - Room conflict, for two groups in the same room on the same night.
- **Missing room detail is stated as a limitation**, not a conflict. Known guest counts above a building's recorded capacity are noted.
- **Housing tab save:**
  - Keeps the label in step with the saved assignments.
  - Keeps the original imported text as an "Imported lodging note".
  - Writes the camping text once.
  - Remembers buildings staff unticked.

### Calendar and Dashboard home (AUDIT-020, 029, 032)
- **Labels** read Booked, Inquiry, Waitlist, Cancelled, Archived visit or Host. Ordinary bookings are never labeled "Unconfirmed".
- **"Also show" toggles** for Cancelled, Waitlist, Archived visits and Host records are off by default, as you described.
- **"Contracts awaiting return" is removed.** That progress belongs to Portal Admin now.
- **Status dropdowns** are replaced by Booked / Waitlist / Cancelled. "Imported" is gone, and Archived visit is read-only.
- **New staff bookings** are saved as Confirmed.

### Backups (AUDIT-009, 010, 038)
- **Version 2 files** ([src/utils/backupFormat.js](src/utils/backupFormat.js)) contain:
  - bookings, with their portal token and creation date;
  - website inquiries;
  - portal tasks and portal documents;
  - a file manifest.
- **What the file manifest is.** It lists where each uploaded file is stored. **It is not a copy of the files.**
- **Sections that can't be read** are named in the file, and again when the file is loaded, so a partial backup is never mistaken for a full one.
- **Restoring:**
  - Bookings missing from the database are re-inserted with their original portal token and creation date, so guests' links keep working.
  - Portal and inquiry rows are only added when missing, parents first, so anything changed since the backup is never overwritten.
- **Full Replace** needs Dev Mode, an admin account, and the typed phrase `REPLACE AND RISK PORTAL DATA`.
  - It now stops if not every booking could be deleted.
  - The safety snapshot it downloads first is a version 2 file.
  - Rollback re-inserts bookings with their original tokens.
  - Dev Mode only shows the option; the database still decides who can delete.

### Portal Admin (AUDIT-038, 050, 029, 022)
- **Five correction actions under "Correct…":** remove a task, change its due date, send an upload back for changes (with an optional note), reopen a confirmed task, and remove a staff-shared document.
  - Each change only applies if the task still has the status staff saw.
  - A change the database refuses is reported, not shown as success.
- **Removing a task that has a guest upload keeps the file.** The file's record is copied to a staff-only table, and the file is moved out of the guest's folder, so the guest portal can no longer list or reach it. If the move isn't allowed, staff are told the guest could still open it from an old link.
- **Progress:** Needs Review counts half, and staff confirmation completes the item. One function computes progress everywhere.
- **Assigning:**
  - Duplicate assignments are warned about, not blocked. A custom file that happens to share a name no longer blocks the standard document.
  - Due dates after arrival are warned about. Nothing is preselected.
  - Assignments carry a request ID that is reused if staff retry the same click, so a retry can't create a second copy while an intentional repeat still can.
- **Storage path.** The storage location of a staff-uploaded file is now recorded on the document.
- **Portal links.** A production build with no portal address configured shows an error instead of copying a localhost link.

### Staff, Jobs and roles (AUDIT-017, 016, 043, 023)
- **Shared staff directory** (the `staff_directory` table, separate from logins). Until its migration runs, the app falls back to this browser's list and says so.
  - No placeholder people are added.
  - Deleted or renamed people no longer come back automatically. Names found on bookings but not in the directory are listed, to be added by hand; nothing is guessed.
- **"Working as"** starts empty. Marking a checklist or Facilities task done requires choosing a name, because the shared login can't tell people apart. The Staff Contacts import no longer re-activates people staff had turned off.
- **Jobs:**
  - Staff assignments show as "Assigned" and are never counted as overdue.
  - Facilities rows are tasks, with a staff picker in Create Booking and a "Mark done" toggle in Jobs.
  - Work for cancelled or waitlisted groups is hidden unless "Show cancelled and waitlisted groups" is ticked.
- **Roles:**
  - Delete, Delete All and Full Replace are hidden from non-admin accounts.
  - Viewer accounts can't save or import.
  - Database rules are unchanged.

### Reports (AUDIT-030, 046, 015, 035, 036, 042, 047, 048)
- **What's counted:** everything except host records. A converted inquiry is counted once, as its booking. The page and the CSV both say this.
- **Months:** each stay counts in the month it arrives, for both the totals and the monthly rows. An "Undated" row makes the rows add up to the totals.
- **Revenue removed** from the screen and the CSV. The financial fields on bookings are untouched.
  - Deposits used to appear only inside the removed revenue panel. They remain in the CSV, still using the loose rule, as you chose.
- **Camper Days:** the imported figure is kept until staff change guests, nights or meals in the app, then it is recalculated.
- **Sources:** Staff entered, Website inquiry, Master sheet, Guest Group sheet and Archive, plus "Older public form" for legacy records.
- **Retreat types** are grouped by the 22 official types. Only "PR" is mapped automatically. Other shorthand is shown as typed, marked "(not mapped)", until you add it to `RETREAT_TYPE_ALIASES` in [src/utils/reportRules.js](src/utils/reportRules.js).
- **CSV:** numbers are rounded, a "Filters Used" section is added, and formula-like text is neutralized.

### Contacts, export, notes (AUDIT-049, 039, 012, 014, 040)
- **Grouping is transitive.** People matched by email on one booking and by phone on another become one contact. Secondary contacts are in the main list, labeled and searchable.
- **Hide and star are saved online** (the `contact_hidden` and `contact_stars` tables), falling back to the browser until the migration runs.
  - Hidden contacts are shared by all staff. Stars are per login; with your shared login, they are shared in practice.
  - Each browser's old lists are copied up once.
- **Real inquiry dates** are used in the Spreadsheet "Submitted" column, Contacts ordering and the export; Master and Archive rows no longer show their import time.
- **"Export Excel" is now "Export contact list".** It has the correct disposition column and an "About this file" sheet that points to JSON backups for a full copy.
- **Notes and linens:** Need To Know means operational notes. Staff meal notes show with Meals, and requests for individual linen pieces appear in the linen summary.

### Website-inquiry function (AUDIT-027, 028)
- **CORS:** the browser's OPTIONS preflight is answered, and every response carries CORS headers. Set the `PUBLIC_FORM_ORIGINS` secret to limit which sites may post; without it, any site can, which is no different from the endpoint's existing public access.
- **Validation:** dates must be real `YYYY-MM-DD` dates and the deposit must be a number. Allergy, activity and meal-schedule items are reduced to the shape the staff screens expect.

### Cleanup and docs (AUDIT-033, 041, 021)
- **Dead code:** about 1,100 lines removed, each item confirmed unused by a search first. This includes the never-rendered availability board, Rustic Cottage rows, unused helpers, the unused retreat-type normalizer and `BookingActivities.jsx`. The Inquiry Pipeline code is kept, as you asked.
- **Docs:** stale statements in the README, the Supabase system documentation and `SQL_SETUP.md` are corrected, and the README has a new summary section.
- **Schema:** the live schema still isn't in the repository. The diagnostics include the queries to export it.

## Where your answers replaced the audit's recommendation

| Audit recommendation | Your decision | What was built |
|---|---|---|
| Reports default to confirmed bookings (030) | Count everything except hosts (Q-008) | Everything except hosts; converted inquiries counted once; the rule is shown on screen and in the CSV |
| Estimate revenue for staff bookings (015) | Remove revenue reporting (Q-027) | Revenue removed; data kept |
| Stricter deposit rule (047) | Keep the loose rule (Q-026) | Unchanged |
| Link portal confirmations to booking dates (029) | Status lives in the portal (Q-015) | No linkage; Dashboard progress removed; portal progress shows Needs Review as half (Q-016) |
| Fix the Pipeline's columns (011) | Retire it but keep the code (Q-011) | Unreachable without Dev Mode; code unchanged |
| "Tentative" status for staff bookings (034) | Bookings are confirmed (Q-007) | Saved as Confirmed; no progress statuses |
| Only confirmed bookings hold a building (020) | Everything except hosts, inquiries and clearly cancelled (Q-004) | As decided |
| Pre-select InterVarsity documents (050) | No preselection (Q-018) | None preselected |
| Unique index blocking duplicate assignments (050) | Allow intentional repeats (Q-018) | Request-ID protection only |
| New workbook years (024) | Not now (Q-033) | Deferred |
| Remove test bookings (044) | Leave them (Q-040) | Left |

## How this was verified

| Check | Where it ran | Result |
|---|---|---|
| `npm test` (Node's built-in runner, 10 files) | This computer | **90/90 pass.** Covers the re-import protection cases; field persistence across save and reload; two editors and rapid checklist clicks; conversion identity and retry; the departure-day rule, shared buildings and room conflicts; backup compatibility (an Apps-Script-style version 1 file) and identity and relationship preservation; report totals and converted-inquiry deduplication; portal progress and every correction action; Excel dates in Eastern time; contact grouping. |
| `npx vite build` | This computer | Passes. The chunk-size warning existed before. |
| `npx eslint .` | This computer | 68 errors and 9 warnings, against 90 and 19 before. No new findings; one existing SpreadsheetView warning moved to a different line. |
| SQL demonstration (`supabase/repairs/verify-with-pglite.mjs`) | **PGlite test database, not live data** | 25/25. The migrations run twice. The conditional update rejects a stale editor. Diagnostics change nothing. Each repair fixes its target and leaves look-alike rows alone. A second run changes nothing. Rolling everything back restores every value exactly. Uses the `bookings` definition from SQL_SETUP.md; the inquiry and portal tables are minimal stand-ins. |
| Browser checks | Chrome against a local copy of the full app, with the Supabase client replaced by an in-memory fake holding sample data | **45/45**, covering: Calendar toggles and labels; lodging conflicts and the departure day; Reports inclusion and no revenue; Jobs; Contacts; Portal progress (38% for one confirmed and one in review out of four) and corrections; the retired Pipeline route; a version 1 backup loading; Replace locked; User Admin; Fill Test Data hidden. Also no horizontal scroll at 390px on 8 screens. This copy ran without the React Compiler transform, which the production build includes and which builds fine. |

**Not verified:** the live database, Storage, deployed functions, the guest portal app, the public form, and the Google Apps Script.

## Database changes and deployment

| Item | Type | Effect if not done |
|---|---|---|
| `supabase/migrations/20261028000100_staff_directory.sql` | Migration (additive) | User Admin keeps using each browser's own list |
| `supabase/migrations/20261028000200_contact_preferences.sql` | Migration (additive) | Hidden contacts and stars stay per browser |
| `supabase/migrations/20261028000300_portal_corrections.sql` | Migration (additive) | Removing a task with a guest upload is refused; review notes aren't saved; the retry protection is off |
| `supabase/optional/20261028000310_portal_staff_write_policies.sql` | Optional; review first | Only needed if the V-003 diagnostics show staff can't update or delete portal rows |
| `supabase/functions/submit-guest-inquiry` | Function deploy | No CORS handling and no stricter validation |
| `VITE_GUEST_PORTAL_BASE_URL` in hosting | Environment variable | Production portal links show an error instead of a link |
| The app itself | Frontend deploy | None of the app changes take effect |

## Existing-data repairs

The scripts are in [supabase/repairs/](supabase/repairs/), with instructions in [supabase/repairs/README.md](supabase/repairs/README.md). Every value they change is logged, and `audit_repair_rollback('<name>')` undoes a repair.

**Prepared and deterministic:**
- 003: hidden copies on Master records.
- 002: activities saved as JSON text.
- 005: camping text written twice.
- 007: imported label left on bookings already saved in the Housing tab.
- 013: dates one day early. Changed only where the record's own saved sheet cell proves the shift; never a blanket shift.
- 004/008: pending inquiries that exactly one booking names as its source.
- 032: the "Imported" status.
- 040: meal notes copied into Need To Know.

**Ambiguous; listed for your review, never changed automatically:**
- Inquiries linked to a booking that doesn't name them, or with two or more matching bookings.
- Staff bookings whose lodging text lost detail: open the Housing tab and save to regenerate it.
- "Imported" status on records from other sources.
- Old Master records with no edit history, which the re-import rules now treat conservatively.

## Backups: compatibility and limits

- **The Google Apps Script backup wasn't inspected.** Its source isn't in the repository. This report relies on the README, which says it writes version 1 files (bookings only, checksum over `JSON.stringify({ bookings })`). The app still reads and restores that format, and a test confirms it.
- **The daily Drive backups still cover bookings only** until the script is updated. To match version 2, it would need to read `guest_inquiries`, `portal_checklist_items` and `portal_documents`, and write the version 2 envelope, with a checksum over `JSON.stringify({ bookings, guestInquiries, portalChecklistItems, portalDocuments, storageManifest })` in that key order. If its bookings don't include `portalToken` and `createdAt`, a restore from them can't keep those values for re-inserted bookings.
- **Uploaded files are not in any backup.** The manifest lists their locations. For documents derived from a portal token, it is marked as derived.
- **Full Replace still carries risks** that depend on the live database: foreign-key rules (V-002) may delete or orphan portal rows when bookings are deleted, and Storage files are never restored. Use Safe Merge for everyday recovery.
- **Not backed up:** the staff directory, contact preferences and saved spreadsheet views.
- **No Supabase backups** are set up on this project (Q-014).

## What you need to do next, in order

1. **Review the changes** (`git diff`). Nothing is committed.
2. **Make a backup** with the new app version, and keep a Drive copy.
3. **Run `supabase/repairs/01_diagnostics.sql`** in the SQL editor (read-only) and keep the output. Look especially at:
   - the foreign keys pointing at bookings (V-002);
   - the access rules (V-003);
   - unique indexes on the portal tables (V-018). Drop any that block intentional repeats.
4. **Apply the three migrations.** Run the optional policy file only if step 3 shows staff lack update or delete rights on the portal tables.
5. **Deploy the app** and the `submit-guest-inquiry` function. Optionally set `PUBLIC_FORM_ORIGINS`, and make sure `VITE_GUEST_PORTAL_BASE_URL` is set. Then submit one test inquiry from the real public form (V-005) and decline it afterwards.
6. **In User Admin**, click "Copy this browser's old list into it" on the computer with the best staff list. Then add or ignore the listed names, and have each computer choose "Working as".
7. **Run `00_repair_log.sql`, then repairs 02 to 08,** reading the counts each prints. Then work through the review lists.
8. **Add your retreat-type shorthand** to `RETREAT_TYPE_ALIASES` if you want it grouped (for example, whether "PR-Day Use Only" is its own type).
9. **Update the Google Apps Script** to the version 2 backup format, or accept that the daily Drive backups cover bookings only.
10. **Later:** export the live schema into the repository (V-021), and plan the 2028 sheet support (AUDIT-024) before those sheets arrive.
