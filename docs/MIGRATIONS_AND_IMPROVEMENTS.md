# What Changed: Database Updates and Improvements

This page explains the November 2026 database updates ("migrations") in plain language, and what the booking form, staff software and guest portal now do better.

---

## Quick summary

- **16 of the 17 updates are live.** One is only partly live.
- **Two things are left to do:**
  1. Give staff access to the shared "hidden inquiries" list (one line of SQL).
  2. Deploy the new guest portal, then run the last update (#16).
- **The biggest improvements:** no more duplicate bookings from one website inquiry, a clear page for cancelled bookings, matching progress numbers for guests and staff, and several security fixes.

To check live status at any time, run [`supabase/migration_status.sql`](../supabase/migration_status.sql) in the Supabase SQL editor. It only reads, and changes nothing.

---

## Status (checked 20 Nov 2026)

| # | Update | Live? |
|---|---|---|
| 0 | Accurate "last updated" times | ✅ |
| 1 | Shared staff directory | ✅ |
| 2 | Shared contact stars and hidden contacts | ✅ |
| 3 | Portal Admin corrections | ✅ |
| 4 | Shared hidden inquiries | ⚠️ Partly: needs one grant |
| 5 | Guest portal emails | ✅ |
| 6 | Online signing (still switched off) | ✅ |
| 7 | Security: firm "no" for non-staff | ✅ |
| 8 | Security: remove unused rights | ✅ |
| 9 | Security: lock repair tools | ✅ |
| 10 | Hosting kept separate from guest bookings | ✅ |
| 11 | Staff app | ✅ |
| 12 | Staff supply orders | ✅ |
| 13 | Keep booking change history | ✅ |
| 14 | Group Map | ✅ |
| 15 | Group Map automatic build | ✅ |
| 16 | Cancelled page and private booking status | ⏳ Not yet: run after the new portal is live |

---

## What each update does

### Guest portal

**#5 Guest portal emails**
- Sends welcome emails, new-task notices and due-date reminders.
- Nothing sends until staff turn it on for a booking.
- An email can't be sent twice.
- Emails stop automatically if a booking is cancelled, waitlisted or changed to hosting, or when every task is done.

**#6 Online signing**
- Guests can sign documents in the portal instead of printing and uploading them.
- Signed records are permanent and can't be edited or deleted.
- A booking with signatures can be cancelled but not deleted.
- **Switched off** until legal and insurance review is finished.

**#3 Portal Admin corrections**
- Removing a task that has a guest upload keeps the file, visible to staff only.
- "Request changes" can include a note for the guest.
- Clicking Assign twice no longer creates duplicate tasks or documents.
- "Remove task" now works instead of showing "permission denied".

**#10 Hosting kept separate**
- Hosting entries (internal use of the property) can never have a working guest portal link.
- Their portal emails stop too.
- Turning a hosting entry back into a booking doesn't bring back the old link. Staff create a new one.

**#16 Cancelled page and private status** (not live yet)
- **Cancelled bookings:** the guest's link shows "This booking has been cancelled" and a Contact Staff button. Guests can't submit anything on a cancelled booking.
- **Private status:** guests no longer see internal labels like "Imported" or "Contract Sent". The portal shows **Open Tasks** instead.
- **Small fixes:**
  - Dates show even when only a departure date is set.
  - An answer that couldn't be saved now says so.

### Shared staff information

**#1 Shared staff directory**: one list of people to assign work to, the same on every computer.

**#2 Shared contact stars and hidden contacts**
- Stars and hidden contacts show on every computer.
- Each browser copies up its old saved list the first time it opens Contacts.

**#4 Shared hidden inquiries**
- Rows hidden from the Inquiry Spreadsheet will be shared by everyone. Hiding never deletes the inquiry.
- ⚠️ This needs the access grant before it works.

### Staff app

**#11 Staff app**
- A phone-friendly app for staff.
- "Limited" accounts see only what they need for their work: no contacts, notes, payments or portal links.
- Dietary details are shown only to kitchen and office accounts.
- Records who changed what.

**#12 Staff supply orders**
- Staff request supplies and equipment.
- Office staff track each item: Requested → Ordered → Received.
- Nothing is deleted, and every change is recorded.

### Groups

**#14 Group Map**
- A tree of organizations and their subgroups in Contacts, linked to bookings by group name.
- It blocks mistakes such as loops or duplicate names, and it's included in backups.

**#15 Group Map automatic build**
- Saves a reviewed draft of the map in one step, and can undo it.
- Existing groups and bookings are never changed by a build.

### Security and data safety

**#7 Firm "no" for non-staff**: closed a gap where a signed-in non-staff account could reach an admin tool.

**#8 Remove unused rights**: removed powers nobody needed, such as emptying a whole table from the website.

**#9 Lock repair tools**: data repair tools now run only from the SQL editor.

**#13 Keep booking change history**: change history now survives deleting a booking or restoring a backup.

**#0 Accurate "last updated" times**: the database records when a booking changed, instead of trusting each staff computer's clock.

---

## What the software does better now

### Website inquiries → bookings
- ✅ **One inquiry makes one booking.** Saving twice, or converting from two tabs, no longer creates a duplicate.
- ✅ **No accidental declines.** An old screen can't decline an inquiry someone already converted.
- ✅ **Deleted bookings are recoverable.** The inquiry shows "Converted (booking deleted)" with a button to make a new booking.
- ✅ **Guest counts are kept.** A breakdown of 0 adults and 0 children no longer wipes out the guest's estimated total.
- ✅ **Allergy details aren't lost.** The form asks for the allergy name when a number of guests is entered.

### Guest portal
- ✅ **Progress matches.** Guests and staff see the same percentage. A task waiting for review counts as half done.
- ✅ **Remove task works** for tasks with uploads, and keeps the file.
- ⏳ **Cancelled bookings** get a clear explanation page (after #16).
- ⏳ **Internal status labels** stay private (after #16).

### Every computer sees the same thing
- ✅ Staff directory, contact stars and hidden contacts are shared.
- ⚠️ Hidden inquiries will be shared once the grant is added.

### Safer and more private
- ✅ Non-staff accounts are refused everywhere.
- ✅ Hosting entries can never have a working guest link.
- ✅ Guest portal links and guest details are no longer written to logs.

### More reliable
- ✅ "Last updated" times are accurate.
- ✅ Booking history survives deletes and restores.
- ✅ Portal emails can't double-send.

---

## Still on the to-do list

These came out of the integration audit and haven't been changed yet ([full report](../INTEGRATION_DATA_INTEGRITY_AUDIT.md)):

- **Duplicate inquiries:** a guest who resubmits the form after a timeout creates a second inquiry.
- **Stale "Remove task":** running it from an out-of-date screen can leave a stray "removed upload" record. No file is lost.
- **Total vs breakdown:** when a guest's total doesn't match their adult/child breakdown, the breakdown is used. Decide which one should win.
- **Unused uploads:** files uploaded but never attached to a task stay in storage.

---

## Finishing up: two steps

**1. Give staff access to hidden inquiries.** Run this in the SQL editor:
```sql
grant select, insert, update, delete on public.inquiry_hidden to authenticated;
```

**2. Turn on the cancelled page and private status.**
1. Commit and push the guest portal changes.
2. Wait for Vercel to show the new deployment as **Ready**.
3. Check that a portal link shows an **Open Tasks** card (not "Portal Status").
4. Run [`20261120000100_portal_cancelled_and_private_status.sql`](../supabase/migrations/20261120000100_portal_cancelled_and_private_status.sql).

Then run `migration_status.sql` again. Every row should say **yes**.
