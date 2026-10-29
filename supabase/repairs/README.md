# Data repairs for the audit fixes

These scripts fix existing records. The app changes protect new records on their own. Nothing here has been run against the live database.

## Before you start

1. **Make a backup.** Use the app's Backups page ("Create Backup Now"; this is now a version 2 file with bookings, website inquiries and portal records). Also keep the latest Google Drive daily backup. Supabase backups are not set up on this project (Q-014), so these files are the only way back apart from the undo log below.
2. Run `01_diagnostics.sql` in the Supabase SQL editor. It is **read-only**. Keep the results: they answer the Part C checks and show how many rows each repair will touch.
3. Ask staff to close the booking screens while you run the repairs. Every repaired booking gets a new `updated_at`, so anyone who had one open will be asked to reload before saving (the conflict check working as intended).

## Order

| File | Finding | What it changes | Deterministic? |
|---|---|---|---|
| `00_repair_log.sql` | — | Creates `audit_repair_log` and the apply/rollback functions. Run once first. | — |
| `01_diagnostics.sql` | Part C | Nothing (read-only). | — |
| `02_repair_dual_copies.sql` | AUDIT-003 | Master bookings: copies each column value into its hidden copy in `rentalFormDetails` when they differ. | Yes: the column is always the newer value. |
| `03_repair_activities_text.sql` | AUDIT-002 | Activities stored as JSON text → readable summary. | Yes. |
| `04_repair_lodging_text.sql` | AUDIT-005, AUDIT-007 | Removes the repeated camping text; for bookings saved in the Housing tab, `room_name` follows the Housing text and the old label is kept as `importedLodgingText`. | Yes (Q-024). |
| `05_repair_inquiry_dates.sql` | AUDIT-013 | Inquiry and archive dates one day early, **only** where the record's own saved sheet cell proves it. | Per-record evidence. |
| `06_repair_inquiry_links.sql` | AUDIT-004, AUDIT-008 | Website inquiries left "pending" while exactly one booking says it came from them → "converted" to that booking. | Yes; ambiguous cases are only listed. |
| `07_repair_imported_status.sql` | AUDIT-032 | Status "Imported" → "Confirmed" (Master/staff) or "Inquiry" (Guest Group). Other sources only listed. | Yes (Q-010, Q-007). |
| `08_repair_need_to_know.sql` | AUDIT-040 | Staff bookings: clears Need To Know where it is just a copy of the meal notes (they stay in `rentalFormDetails`). | Yes. |

Each repair runs in one transaction, prints counts before and after, writes every old and new value to `audit_repair_log` before changing anything, and is safe to run again (a second run finds nothing to change).

## Needs your review (not changed by any script)

The review queries are in `01_diagnostics.sql`:

- Website inquiries marked converted to a booking that does not name them, or pending inquiries with two or more matching bookings. Choose the right booking by hand in Guest Inquiries.
- Staff bookings whose lodging text lost room or camping detail after a Create Booking edit. Open the booking, go to the Housing tab, and save; the text is rebuilt from the saved values.
- "Imported" status on records that are neither Master, staff nor Guest Group records.
- Test bookings ("Test Community Church"): left in place as you asked (Q-040).

## Undo

```sql
select public.audit_repair_rollback('040-need-to-know');
select public.audit_repair_rollback('032-imported-status');
select public.audit_repair_rollback('004-inquiry-links');
select public.audit_repair_rollback('013-archive-dates');
select public.audit_repair_rollback('013-inquiry-dates');
select public.audit_repair_rollback('007-room-name');
select public.audit_repair_rollback('005-camping-duplicate');
select public.audit_repair_rollback('002-activities-text');
select public.audit_repair_rollback('003-dual-copies');
```

Roll back newest first, as listed. Repairs 02 and 04 both change `raw_data`; undoing 02 before 04 would put back a `raw_data` value from before 04 ran. Rollback restores only the values the repairs logged. Edits staff made afterwards to the same field are overwritten by a rollback, so roll back promptly if you need to.

## How these were tested

`verify-with-pglite.mjs` builds a throwaway Postgres in memory (PGlite) from the `bookings` definition in `src/docs/SQL_SETUP.md`. It adds simple stand-ins for `guest_inquiries` and the portal tables, whose real definitions are not in the repository, seeds one row per case, and checks the following:

- the migrations run twice;
- the conditional save rejects a stale update;
- the diagnostics change nothing;
- every repair gives the expected result and leaves look-alike rows alone;
- a second run changes nothing;
- rolling everything back restores every value exactly.

Run it with:

```
npm install --no-save @electric-sql/pglite
node supabase/repairs/verify-with-pglite.mjs .
```

This shows the SQL is correct against the documented schema. It does not prove the live schema matches; that is what `01_diagnostics.sql` is for.
