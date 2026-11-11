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
schemaVersion: 1, 2 or 3
```

| Version | Written by | Contents |
|---|---|---|
| 1 | The Google Apps Script daily backup (as documented for that external project); older dashboard backups | Bookings only |
| 2 | Earlier dashboard versions | Bookings, website inquiries, portal tasks, portal documents, and a list of uploaded files (names and locations only) |
| 3 | The dashboard today | Everything in version 2, plus read-only online signing records |

The dashboard writes version 3 and can read versions 1, 2 and 3 (`CURRENT_BACKUP_SCHEMA_VERSION` and `SUPPORTED_BACKUP_SCHEMA_VERSIONS` in [src/utils/backupFormat.js](../src/utils/backupFormat.js)).

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
- Replace clears `converted_booking_id` on converted website inquiries (that foreign key is set to null on delete) unless the backup restores them.

> **Prefer Merge, which never deletes bookings. Never use Full Replace from a version 1 file on data that has portal activity.**

---

## Known limitations

### Guest Inquiries still loads in one request

`fetchBookings()` in [src/services/bookingService.js](../src/services/bookingService.js) reads the whole `bookings` table in pages of 1,000, ordered by `start_date` with `id` as a tiebreaker, and throws rather than return a partial list. Every workflow that uses it (dashboard load, import checks, manual backups, safety snapshots, restore verification and rollback) works with the complete booking set. **Portals** also pages through its list (`PORTAL_OVERVIEW_PAGE_SIZE` in [src/pages/PortalAdminView.jsx](../src/pages/PortalAdminView.jsx)).

Remaining considerations:

- **Guest Inquiries** (`getGuestInquiries()` in [src/services/guestInquiryService.js](../src/services/guestInquiryService.js)) loads submissions in a single request, so above the server row limit (1,000 by default) the oldest may not appear.
- **Large imports** send every row to `upsertBookings()` in one request and refresh the screen from the returned rows. Whether Supabase caps the rows returned from a write has not been verified. If it does, the import still saves but the screen may be incomplete until a refresh. Restores write in batches of 150 and are not affected.
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

| Data | Dashboard backup (version 3) | Google Drive daily backup (version 1) |
|---|---|---|
| Bookings | Yes | Yes |
| Website inquiries (`guest_inquiries`) | Yes | No |
| Portal tasks and portal documents | Yes | No |
| Online signing records (`portal_signatures`) | Yes | No |
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
