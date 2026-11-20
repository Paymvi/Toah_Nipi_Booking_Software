# Backup and Recovery

How Toah Nipi booking data is backed up, what each backup contains, how restores behave, and how to look after the scheduled Google Drive backups.

This guide was moved out of the main [README](../README.md). Statements that the code no longer supported were corrected in the move; each correction names the file that shows the current behaviour.

## Contents

- [Two backup paths](#two-backup-paths)
- [Backup format](#backup-format)
- [Manual backups](#manual-backups)
- [Restoring a backup](#restoring-a-backup)
- [Known limitations](#known-limitations)
- [Automatic Google Drive backups](#automatic-google-drive-backups)
- [Automatic backup retention](#automatic-backup-retention)
- [Automatic backup configuration](#automatic-backup-configuration)
- [What backups cover](#what-backups-cover)
- [Routine checks](#routine-checks)
- [Troubleshooting](#troubleshooting)

---

## Two backup paths

1. **Manual backups from the staff dashboard** (**Backup** in the sidebar, route `/backup`).
2. **Scheduled automatic backups to Google Drive**, made by a separate Google Apps Script project.

Both use the Toah Nipi booking backup JSON format. The Google Apps Script project is **not stored in this repository**, so a clone of this repository does not recreate the automatic backups.

---

## Backup format

Every backup is a JSON envelope:

```text
format: "toah-nipi-booking-backup"
schemaVersion: 1, 2, 3, 4 or 5
```

| Version | Written by | Contents |
|---|---|---|
| 1 | The Google Apps Script daily backup (as documented for that external project); older dashboard backups | Bookings only |
| 2 | Earlier dashboard versions | Bookings, website inquiries, portal tasks, portal documents, and a list of uploaded files (names and locations only) |
| 3 | Earlier dashboard versions | Everything in version 2, plus read-only online signing records |
| 4 | Earlier dashboard versions | Everything in version 3, plus the booking change history the staff app shows (`booking_change_log`) |
| 5 | The dashboard today | Everything in version 4, plus the Group Map: groups with their parent (`organizations`) and linked booking names (`organization_name_links`) |

The dashboard writes version 5 and can read versions 1 to 5 (`CURRENT_BACKUP_SCHEMA_VERSION` and `SUPPORTED_BACKUP_SCHEMA_VERSIONS` in [src/utils/backupFormat.js](../src/utils/backupFormat.js)).

The envelope metadata includes the creation time, backup reason, application name, record counts, SHA-256 integrity information and the data itself.

Normal manual and automatic backups use a timestamped file name such as:

```text
toah-nipi-backup-2026-10-15T01-33-18Z.json
```

Pre-restore safety snapshots use a separate `toah-nipi-pre-restore-safety-...` prefix.

The SHA-256 checksum detects accidental corruption. It is not a signature: someone who deliberately edits a backup and recomputes the checksum can produce a file that passes validation.

---

## Manual backups

The staff-facing backup screen is [src/components/DashboardBackups.jsx](../src/components/DashboardBackups.jsx). It has a **Minimal** and a **Detailed** view.

### Export

Creating a manual backup:

1. Reads the live records.
2. Creates a backup envelope.
3. Calculates a SHA-256 checksum.
4. Downloads a JSON file to the staff member's computer.

The last manual backup's details are saved in the browser's `localStorage` for display only. That saved detail is **not itself a backup**.

### Validation

Before a backup can be restored, the screen checks:

- Recognised backup format
- Supported schema version
- SHA-256 checksum
- Booking array structure
- Missing booking IDs
- Duplicate booking IDs
- Version 5: the Group Map section holds together. Every parent and every linked group must be in the file, with no loops, no duplicate groups or linked names, no two groups with the same name under one parent, and valid ids and names. A file that fails is refused before anything changes; the database checks the same rules again when restoring.
- Version 5: the list of sections the file says it contains (`coverage.sections`). Any section it leaves out, or a missing list, is named as a warning, so a partial file is never taken for a complete backup.

Backup files larger than 25 MB are refused.

---

## Restoring a backup

Before any production restore:

1. Create a manual backup.
2. Confirm a recent automatic Google Drive backup exists.
3. Review which tables the chosen backup file actually covers (see [Backup format](#backup-format)).
4. Prefer **Merge** unless Replace is genuinely required.
5. Be especially careful with bookings that have portal activity.

### Merge (default)

Merge upserts the backup's records into the live database.

- Records with matching IDs are overwritten with the backup's values, so edits made after the backup was taken can be lost.
- Records that exist only in the live database are left alone.
- A booking that was deleted after the backup can be re-inserted. A re-inserted booking keeps its original `portal_token` and `created_at` when the backup has them (version 2 and 3 backups always do; version 1 backups have the token only if the backup writer included it). See `bookingToDbRow` in [src/services/bookingMapping.js](../src/services/bookingMapping.js).
- Version 2 and 3 backups also restore missing website inquiries, portal tasks and portal documents.
- Version 4 backups also restore missing booking change history. Only administrators can restore it (`staff_app_restore_change_log`); a row already present is skipped, so restoring the same file twice adds nothing.

- Version 5 backups also restore the Group Map; see [The Group Map in backups](#the-group-map-in-backups).

Merge is not a field-by-field conflict merge. Review the comparison carefully before running it.

### Full Replace (destructive)

Replace is offered only with Dev Mode on, only to accounts the database lets delete bookings (administrators), and only after typing:

```text
REPLACE AND RISK PORTAL DATA
```

Dev Mode only shows the option; the database still decides who may delete.

Before deletion begins, the screen downloads a pre-restore safety snapshot. It then:

1. Deletes the current booking records.
2. Restores the backup in batches.
3. Verifies the restored booking IDs.
4. Attempts an automatic rollback if the restore fails. If the rollback also fails, use the downloaded safety snapshot.

What Replace does to portal data:

- In production, portal tasks and portal documents **cascade-delete** with their booking. Replace deletes every booking first, so it also deletes every portal task and portal document row.
- A version 2 or 3 backup brings those rows back, and bookings keep their original portal tokens, so guests' portal links keep working.
- A **version 1 backup (including the Google Apps Script daily backups) contains bookings only.** Replacing from one permanently loses every portal task and portal document row.
- Uploaded files are never restored; backups list only where they are. Files in Storage are not deleted by Replace, but rows that pointed at them may be gone.
- Booking change history is **kept**: it is not linked to the booking row (migration `20261117000100_booking_change_log_keep_history.sql`), and restored bookings keep their ids, so their history lines up again. Deleting and re-inserting the same bookings records no new changes. Before that migration runs, Replace erases all change history.
- Replace clears `converted_booking_id` on converted website inquiries (that foreign key is set to null on delete) unless the backup restores them.
- The Group Map is **not** deleted. Groups find their bookings by name, not through a link to the booking row, so deleting bookings leaves every group and linked name in place. A version 5 backup then adds back any groups and links that are missing, exactly as Merge does. The pre-restore safety snapshot includes the current Group Map.

### The Group Map in backups

Version 5 backups contain every group (id, name, parent, version and timestamps) and every linked booking name. Both are read in one database statement (`group_map_export`), so a group edited during the backup can't leave a link pointing at a group the file lacks.

**Restoring the Group Map is additive, in Merge and in Full Replace alike.** It only adds what is missing. It keeps every current group, parent and linked name, and it does **not** undo edits made since the backup: a group renamed, moved or given another booking name after the backup keeps its current form. This is the opposite of bookings, where Merge overwrites a matching booking with the backup's copy. To go back to an older group structure, change the groups on the Group Map by hand, using the backup's preview as the list of differences.

It runs last, after the bookings have been restored and verified, in one database transaction (`group_map_restore`, admin and staff accounts):

- **Only missing groups and links are added**, with their original ids, parents and timestamps. Parents are added before their subgroups.
- **Current groups and links always win.** A group that still exists keeps its current name and parent, and a booking name already linked stays with its current group. Nothing current is ever changed or deleted, so groups made or edited after the backup are never lost.
- **Clashes are skipped and listed, never merged.** If a current group under the same parent already has a backed-up group's name (ignoring case), the backed-up group isn't added, so there are no duplicates and nothing is combined by name. Its subgroups and linked names are then skipped too, because their group wasn't restored.
- **Nothing half-restored.** If the file's Group Map doesn't hold together, or someone creates a clashing group at the same moment, the whole Group Map section is refused and nothing in it changes. Bookings and the other sections are reported separately as before.
- **Restoring the same file twice adds nothing.**

Before restoring, the preview's **Group Map** card shows how many groups and linked names will be added, how many are already here, and lists every one that will be skipped or kept as it is now. Afterwards the result lists the same.

**Older backups (versions 1 to 4) contain no Group Map.** Restoring one, in either mode, leaves the current groups, parents and linked names exactly as they are: nothing is added, changed or removed. The preview's Group Map card says so for these files, and the result repeats it.

The database's Group Map can only be restored once its migration (`20261119000100_group_map.sql`) has run. Without it, the backup files contain no groups, and restoring a version 5 file reports that the Group Map couldn't be restored while the rest restores as usual.

> **Prefer Merge, which never deletes bookings. Never use Full Replace from a version 1 file on data that has portal activity.**

---

## Known limitations

### Guest Inquiries still loads in one request

`fetchBookings()` in [src/services/bookingService.js](../src/services/bookingService.js) reads the whole `bookings` table in pages of 1,000, ordered by `start_date` with `id` as a tiebreaker, and throws rather than return a partial list. Every workflow that uses it (dashboard load, import checks, manual backups, safety snapshots, restore verification and rollback) works with the complete booking set. **Portals** also pages through its list (`PORTAL_OVERVIEW_PAGE_SIZE` in [src/services/portalAdminData.js](../src/services/portalAdminData.js)).

Remaining considerations:

- **Guest Inquiries** (`getGuestInquiries()` in [src/services/guestInquiryService.js](../src/services/guestInquiryService.js)) loads submissions in a single request, so above the server row limit (1,000 by default) the oldest may not appear.
- **Large imports** save each row with its own request, six at a time (`saveBookings()` in [src/services/bookingService.js](../src/services/bookingService.js)), so a cap on rows returned from one write does not apply. Restores write in batches of 150.
- Pagination uses offsets, so bookings added or deleted by someone else during a read could be skipped or repeated. This is unlikely in normal use.

### Empty manual backups are allowed

The manual export creates a zero-booking backup **without warning at export time**. A warning appears only when the file is loaded into the restore screen, and it still passes structural validation. Do not use an unexpectedly empty backup for Replace.

The external Google Apps Script backup is documented as refusing zero-record snapshots, but that behaviour is outside this repository and cannot be verified here.

### Restore timestamps

Every frontend upsert sets `updated_at` to the current time, so Merge and Replace both rewrite `updated_at` on the records they touch. Re-inserted bookings keep `created_at` when the backup has it; otherwise the database default gives them a new one.

### Deletes blocked by row-level security look like successes

Supabase can return no error when a row-level security policy makes a delete affect zero rows. The frontend does not consistently tell "the request succeeded" apart from "the rows were actually deleted", so for a non-admin user delete-all or Replace can be misleading rather than failing with a permission error. Treat destructive recovery as an administrator-only operation and verify the database state afterwards, not just the absence of an error.

---

## Automatic Google Drive backups

The production backup strategy includes a separate Google Apps Script project, **not stored in this repository**. Its main function is:

```text
createDailyBookingBackup()
```

It runs from a Google Apps Script time-driven trigger. The trigger time is configured in Google Apps Script, not here.

### Automatic backup flow

The job:

1. Reads its configuration from Script Properties.
2. Connects directly to the Supabase REST API.
3. Reads every row in the `bookings` table, in pages of up to 1,000 rows.
4. Converts database rows into the application's booking-object shape.
5. Runs safety validation.
6. Creates a version 1 backup envelope.
7. Calculates a SHA-256 checksum.
8. Saves a timestamped JSON file in the configured Google Drive daily folder.
9. Verifies that Google Drive returned a valid, non-empty file.

Automatic backups record `reason: "scheduled-daily"` in their metadata.

For the restore screen to accept the file, the external job must compute the checksum exactly as the dashboard does: SHA-256 over `JSON.stringify({ bookings })`. A different representation makes the restore screen reject the file even when the bookings are valid.

### Automatic backup safety checks

The job refuses to save a backup if:

- Supabase did not return an array of records.
- The live database unexpectedly returns zero bookings.
- Any booking is missing an ID.
- Duplicate booking IDs are found.
- Supabase returns an unsuccessful HTTP response or invalid JSON.
- Google Drive fails to create the file, or the file is zero bytes.

The zero-record check is deliberate: if database access breaks, the job should fail rather than save an empty snapshot that looks successful.

### The Group Map in the daily backup (not done)

The daily backup **does not include the Group Map yet**, and it can't be added from this repository: the script's source isn't here. Only dashboard backups (version 5) protect groups today.

**What to provide.** Export the Apps Script project (script.google.com → the project → Download project, or `clasp pull`). That gives every `.gs` file, including the ones defining `createDailyBookingBackup()`, `runRetentionMaintenance()` and the script's copy of `dbRowToBooking()`, plus `appsscript.json`. Script Properties (the Supabase URL and secret key) aren't part of the export; don't send them.

**One decision first.** The script's secret key acts as the `service_role` database role. On the local stack, which copies live grants, that role can read `bookings` but is refused for both `group_map_export()` and the `organizations` table (checked 2026-11-19). Choose one:

- **Allow `service_role` to call `group_map_export()` (recommended).** One consistent read, and the function returns only group names, parents and linked names.
- **Grant `service_role` read access to `organizations` and `organization_name_links`.** That takes two reads, and the script would have to check that every link's group is present.

Either way it's a deliberate widening of live's restricted `service_role` access, so it's your call.

**The contract an updated script must meet** (fixture: `tests/backupGroupMap.test.js`, "a scheduled bookings + Group Map file"):

- Write a version 5 envelope. `payload` has every version 5 key in this order: `bookings, guestInquiries, portalChecklistItems, portalDocuments, portalSignatures, bookingChangeLog, organizations, organizationNameLinks, storageManifest`. Sections the job doesn't read are empty arrays.
- The checksum is SHA-256 of `JSON.stringify(payload)` with keys in exactly that order.
- `coverage.sections` lists only what the job really read: `["bookings", "organizations", "organizationNameLinks"]`. The restore screen then says plainly which sections the file leaves out, instead of treating it as complete.
- `organizations` rows are `{ id, name, parent_id, version, created_at, updated_at }` and links are `{ name, organization_id, linked_at }`, as `group_map_export()` returns them.
- **Never fall back to bookings-only.** If the Group Map read fails, returns something that isn't two arrays, or has a link whose group isn't in the file, the job must fail the run and save nothing. The one exception is when the Group Map migration hasn't been installed yet: the function or table is missing, so there are no groups to lose, and the job may keep writing version 1 then.
- Keep every existing check: no empty booking set, no missing or duplicate booking ids, a non-empty file, and the same file name pattern for retention. Zero groups is valid.
- Test against fixtures before turning it on: the app must validate and verify the file (Restore screen, Detailed view).


---

## Automatic backup retention

A second Apps Script function manages long-term retention:

```text
runRetentionMaintenance()
```

It uses separate Google Drive folders for daily backups, weekly checkpoints and monthly checkpoints.

- **Current calendar year:** every daily backup is kept.
- **Completed years within the last five years:** daily files are condensed to one checkpoint per week and one per month (the latest automatic backup in that week or month). The weekly and monthly copies are confirmed before the daily originals are moved to trash.
- **Older years:** weekly checkpoints older than five completed years are moved to trash. **Monthly checkpoints are kept permanently** unless someone changes the policy or removes them by hand.

```text
Current year
└─ Keep every daily backup

Previous 5 completed years
├─ Keep weekly checkpoints
└─ Keep monthly checkpoints

Older years
└─ Keep monthly checkpoints permanently
```

### Retention file-name safety

Retention only processes files matching:

```text
toah-nipi-backup-YYYY-MM-DDTHH-mm-ssZ.json
```

Other files are ignored. Manual backups use the same naming pattern, so a manual backup placed in the automatic Daily folder will be processed too. Keep the managed Drive folders for the scheduled backups only, and do not rename production backup files.

---

## Automatic backup configuration

The Apps Script project reads **Script Properties**:

| Property | Needed by |
|---|---|
| `SUPABASE_URL` | Daily backup |
| `SUPABASE_SECRET_KEY` | Daily backup |
| `DAILY_FOLDER_ID` | Daily backup and retention |
| `WEEKLY_FOLDER_ID` | Retention |
| `MONTHLY_FOLDER_ID` | Retention |

These values belong only in Google Apps Script. Never put them in `.env.local`, Git, documentation, client-side JavaScript or frontend hosting variables. `SUPABASE_SECRET_KEY` is especially sensitive because it bypasses row-level security. If it is exposed:

1. Rotate it in Supabase.
2. Update the Script Property.
3. Run the scheduled backup again and check the result.

Restrict access to the Apps Script project and the Drive backup folders to the appropriate administrators.

---

## What backups cover

The custom JSON backups are **not** a complete backup of the Supabase project.

| Data | Dashboard backup (version 5) | Google Drive daily backup (version 1) |
|---|---|---|
| Bookings | Yes | Yes |
| Website inquiries (`guest_inquiries`) | Yes | No |
| Portal tasks and portal documents | Yes | No |
| Online signing records (`portal_signatures`) | Yes | No |
| Booking change history (`booking_change_log`) | Yes (version 4 and later) | No |
| Group Map groups and linked names (`organizations`, `organization_name_links`) | Yes (version 5) | No |
| Uploaded files in `portal-uploads` and `portal-signed` | File list only, not the files | No |
| Staff directory, staff profiles, Auth users | No | No |
| Guest email settings, recipients and history | No | No |
| Row-level security policies, functions, triggers, schema | No | No |

According to the external Apps Script documentation, automatic backups include `portalToken` in each booking when the database row has one. That cannot be verified from this repository.

The intended protection is layered:

```text
Supabase database
│
├─ Manual dashboard backups (on demand, before risky work)
├─ Automatic Google Drive backups (daily, weekly, monthly)
└─ Platform-level database and storage recovery, when enabled
```

Do not rely on a single backup mechanism for production data. Uploaded files, Auth users and database configuration need their own recovery plan.

---

## Routine checks

### Before a large import

Create a fresh manual backup. Ideally also confirm that:

- The automatic backup ran successfully recently.
- The newest Google Drive backup exists and is not empty.
- The manual backup file opens and validates on the restore screen.

### Monitor automatic backups

Periodically confirm that:

- New files appear in the Drive daily folder.
- Apps Script executions are succeeding.
- The time-driven trigger is still enabled.
- File sizes and booking counts look reasonable.
- The Supabase secret has not expired, been revoked, or been rotated without updating Apps Script.

### Maintain the retention job

Confirm that the separate retention trigger is enabled, and that it can read the daily folder, copy into the weekly and monthly folders, and move expired files to trash.

---

## Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| Manual backup contains zero bookings | Export does not warn. Check database access and data, and do not use the file for Replace. |
| Restore screen rejects an automatic backup | The checksum may not have been computed over `JSON.stringify({ bookings })`, or the file is over 25 MB. |
| Delete-all or Replace behaves strangely for a non-admin | Row-level security can make a delete affect zero rows without an error. Use an administrator account and verify the resulting rows. |
| Portal tasks disappeared after a Replace | The backup was version 1 (bookings only). Restore portal rows from a version 2 or 3 dashboard backup with Merge. |
| Automatic daily backup does not appear in Drive | Check Apps Script execution history, the trigger, Script Properties, Supabase access and Drive folder permissions. |
| Automatic backup fails with zero bookings | The safety check stopped it on purpose. Check Supabase connectivity and live data before changing this. |
| Automatic backup reports a Supabase HTTP error | Check `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and whether the key still has the required access. |
| Automatic backup fails after a Supabase key rotation | Update `SUPABASE_SECRET_KEY` in Script Properties. |
| Automatic backup cannot create a Drive file | Check `DAILY_FOLDER_ID`, Drive permissions and Apps Script authorisation. |
| Retention maintenance fails immediately | Check `DAILY_FOLDER_ID`, `WEEKLY_FOLDER_ID` and `MONTHLY_FOLDER_ID`. |
| Daily files are not condensed after a completed year | Check the retention trigger runs and that file names match the expected pattern. |
| An old test file stays in the daily folder | Files that do not match the backup file-name pattern are ignored on purpose. |
