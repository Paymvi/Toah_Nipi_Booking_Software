# Developer Reference

Detailed notes for people maintaining the Toah Nipi booking software: how the main features work under the hood, where the code lives, and checklists for common changes.

This guide was moved out of the main [README](../README.md). Statements the code no longer supported were corrected in the move. Setup, environment variables, scripts and deployment stay in the README.

## Contents

- [Architecture in detail](#architecture-in-detail)
- [Routes and views](#routes-and-views)
- [Feature notes](#feature-notes)
- [How Supabase is used](#how-supabase-is-used)
- [Project structure](#project-structure)
- [Common maintenance tasks](#common-maintenance-tasks)
- [October 2026 audit fixes](#october-2026-audit-fixes)
- [Project status](#project-status)
- [Maintenance principle](#maintenance-principle)

---

## Architecture in detail

```text
Staff browser
  │
  ├─ StaffAuthGate
  │    └─ No session ──► StaffLogin (Supabase email/password)
  │
  └─ Dashboard (one shell for every route)
       ├─ services/bookingService.js ──► bookings
       ├─ services/guestInquiryService.js ──► guest_inquiries
       ├─ PortalAdminView ──► portal_checklist_items, portal_documents,
       │                      Storage: portal-uploads (private)
       ├─ PortalEmailPanel ──► Edge Function: portal-email
       └─ localStorage ──► UI preferences and some per-computer choices

Public inquiry form
  └─► Edge Function: submit-guest-inquiry ──► guest_inquiries (status "pending")

Guest portal (separate repository)
  ├─ Opened with <VITE_GUEST_PORTAL_BASE_URL>/?portal=<portal_token>
  ├─► security definer RPCs (get_portal_record, portal_*), scoped by token
  ├─► Storage: portal-uploads, only where portal_upload_path_is_allowed(name)
  └─► Edge Function: portal-sign (online signing, off by default)

Automatic backups (Google Apps Script, not in this repository)
  ├─ createDailyBookingBackup() ──► Supabase REST (bookings) ──► Google Drive daily folder
  └─ runRetentionMaintenance() ──► daily, weekly and monthly folders
```

Key points:

- **One shell component.** [src/App.jsx](../src/App.jsx) maps every route to `Dashboard`, and [src/pages/Dashboard.jsx](../src/pages/Dashboard.jsx) picks the active view from `location.pathname`. Most feature views live in [src/pages/](../src/pages/). `Dashboard.jsx` is very large (spreadsheet import normalisation, exports, booking detail handling, routing); search it by function name rather than scrolling.
- **Booking field mapping is centralised.** [src/services/bookingMapping.js](../src/services/bookingMapping.js) converts between the camelCase booking objects used by the UI and snake_case columns (`bookingToDbRow`, `dbRowToBooking`). The full booking object is also stored in the `raw_data` JSON column; some application-only data, such as `rentalFormDetails` and imported spreadsheet source data, lives only there.
- **Saves are conditional.** Every booking save checks `updated_at`; a save based on an out-of-date copy is refused and the screen keeps the unsaved edits ([src/services/bookingSave.js](../src/services/bookingSave.js)).
- **Stylesheets are global** and imported in a fixed order in `App.jsx`; later files override earlier ones. Light and Night themes are described in [THEMING.md](THEMING.md).
- **Automatic backups are independent of the frontend.** They run without anyone having the app open. See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).

## Routes and views

| Route | Sidebar label | What it does |
|---|---|---|
| `/dashboard` | Dashboard | Today at camp, arrivals in the next 7 days, items needing attention, and quick actions. |
| `/form` | Form | Create or edit a booking: group, contacts, dates, guest counts, lodging, linens, meals, activities, facilities, rates, payments and documents. |
| `/portal-admin` | Portals | Group leader portal tasks, documents, guest uploads, portal links and guest emails. |
| `/guest-inquiries` | Guest Inquiries | Public website inquiries. Staff convert one into a booking or decline it with a reason. |
| `/calendar` | Main Calendar | Month, week and year views of dated bookings. Clicking a booking opens it. |
| `/lodging-calendar` | Lodging Calendar | Which buildings are in use on which dates. |
| `/master-spreadsheet` | Master Spreadsheet | Spreadsheet-style grid of all booking records with filters, sorting and configurable columns. |
| `/inquiry-spreadsheet` | Inquiry Spreadsheet | Spreadsheet-style view of inquiry records ("Guest Group Inquiries & No's"). |
| `/contacts` | Contacts | Contact directory built from booking records. |
| `/reports` | Reports | Season Brief, Season Map and Data Check, where every number opens its records, with CSV export and a printable meeting brief. A New / Original toggle returns to the earlier single-page report. |
| `/user-admin` | User Admin | Shared staff directory used for task assignment, and the per-computer **Working as** choice. |
| `/jobs` | Jobs | Checklist and program tasks assigned to staff across bookings. |
| `/backup` | Backup | Create, validate, compare and restore JSON backups. |
| `/inquiry-pipeline` | (none) | Retired. Kept in the code for reference; without Dev Mode it shows a "retired" notice. Booking progress is tracked in Portals. |

Opening a booking shows the **Booking Overview** with tabs for Overview, Edit, Housing, Staff Assignments and Checklists, and a Compact / Large density toggle. The **tutorial gnome** in the bottom-right corner offers guided walkthroughs ([src/tutorial/](../src/tutorial/)). **Dev Mode** (top bar) reveals advanced tools after a password check by the `verify-dev-mode` Edge Function.

## Feature notes

### Housing

[src/components/BookingHousingTab.jsx](../src/components/BookingHousingTab.jsx) manages building and room-level guest counts and linens. It does not assign named guests to rooms. The readable lodging summary is saved to `buildingsRooms`.

Buildings come from `LODGING_BUILDINGS` in [src/constants/lodgingConstants.js](../src/constants/lodgingConstants.js): Bethel, Hebron 3rd Floor, Hebron Bunks, Dothan, Ajalon, Capernaum, Guest House and Camping. The Lodging Calendar uses `LODGING_CALENDAR_GROUPS` from the same file, which combines Hebron into one row. Lodge photos are served from [public/lodges/](../public/lodges/).

### Checklists and staff tasks

[src/components/BookingChecklists.jsx](../src/components/BookingChecklists.jsx) supports internal staff planning. Tasks can be assigned to names from User Admin and are collected in the Jobs view.

### Inquiries and waitlist

Inquiries, waitlist records and confirmed bookings are all rows in the `bookings` table, told apart by fields such as `status`, `waitlist` and `source_type`. Booking progress (contract, deposit, insurance) is tracked in Portals; the edit forms only mark a booking Booked, Waitlist or Cancelled.

Public website inquiries arrive in the separate `guest_inquiries` table. Converting one opens a pre-filled booking form; nothing is created until staff save it. The saved booking records the inquiry in `rentalFormDetails.sourceInquiryId`, and only then is the inquiry marked converted with its `converted_booking_id`. Marking is safe to retry, never relinks an inquiry already converted to a different booking, and refuses if the inquiry changed while saving ([src/services/guestInquiryConversion.js](../src/services/guestInquiryConversion.js)).

### Spreadsheet imports and exports

Imports use ExcelJS and accept `.xlsx` files. The importer recognises spreadsheet types from worksheet names and column structure:

- Master booking sheets for 2025, 2026 and 2027
- Guest Group Inquiry sheets for 2025–2027
- Waitlist records
- Archive records
- Generic spreadsheets as a fallback

Master re-imports keep fields changed in the app, change status only when the sheet states one, and leave lodging to the Housing tab once it has been saved ([src/utils/masterImportMerge.js](../src/utils/masterImportMerge.js)). Archive, Generic and Guest Group Inquiry rows follow different upsert paths, so matching IDs can be overwritten by the imported representation.

A separate staff-contact import reads a `staff_contacts` worksheet into the User Admin directory. People who were deactivated stay deactivated.

Original spreadsheet values can be kept in `raw_data.rawSpreadsheetData`.

Exports include inquiry `.xlsx` workbooks (for example `toah-nipi-booking-inquiries.xlsx`), the contact list, and CSV report summaries.

### Guest portal administration

The guest-facing portal is a **separate application in its own repository**. This repository manages the staff side.

Staff can:

- Assign checklist tasks, with due dates and required/optional status.
- Assign standard documents from the fixed catalog, or upload custom documents for one group, with notes.
- Review guest uploads and responses, then **Confirm**, request changes, reopen or change a due date.
- Copy or open the group's portal link.
- Manage guest portal emails (see below).

Task options are defined in `PORTAL_TASK_OPTIONS` in [src/pages/PortalAdminView.jsx](../src/pages/PortalAdminView.jsx); shared progress rules are in [src/utils/portalRules.js](../src/utils/portalRules.js). The rental contract is not in the standard catalog; staff upload it per booking as a custom document. Custom files are limited to 10 MB. Storage and security details are in [SECURITY_AND_ACCESS.md](SECURITY_AND_ACCESS.md#storage-buckets).

The local `documents/` folder is git-ignored and can hold working copies of policy or portal documents.

### Guest portal emails

The `portal-email` Edge Function sends welcome, task-assigned and reminder emails (7 days, 2 days, overdue) through Resend. It is controlled from the **Guest portal emails** panel in Portals, with a Test / Live mode, an automatic-emails switch, and per-booking enrolment. Live sending needs both the database mode and the `PORTAL_EMAIL_LIVE_ENABLED` server secret.

Setup, rollout stages, the kill switch and the last recorded state are in [portal-email/SETUP.md](portal-email/SETUP.md). As recorded there on 2026-11-05, it was in **Test mode with automatic emails off and no real bookings enrolled**. Check that file, not this one, for the current state.

Staff notification emails are only a proposal: [STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md](STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md).

### Documents and online signing

Guests return signed documents in one of two ways, both reviewed by staff with the usual **Confirm**:

- **Paper:** download, print, sign and upload the file to the task. Always available.
- **Online signing (built, not deployed, off by default):** staff link an upload task to one of the booking's staff-uploaded PDFs (*Correct… → Sign online with*). The guest reviews it in the portal, types or draws a signature, ticks the agreement (and authority for a group) and clicks **Sign document**. The `portal-sign` Edge Function stores the exact original and a signed copy with an added signature page in the private `portal-signed` bucket, records the details in `portal_signatures` (never edited or deleted), and only then moves the task to **Needs Review**. Booking status and the contract-returned date are not changed.

Signing stays off for every booking until it is turned on in `portal_signing_settings`. Setup, local testing, deployment and the activation checklist: [portal-signing/SETUP.md](portal-signing/SETUP.md). Decisions and open legal questions: [audit/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md](audit/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md).

## How Supabase is used

| Supabase feature | How the application uses it |
|---|---|
| **Auth** | Staff email/password sign-in, session restoration and sign-out. No sign-up screen; public sign-up must be disabled in project settings. |
| **Database** | Core: `bookings`, `staff_profiles`, `guest_inquiries`, `portal_checklist_items`, `portal_documents`. Added by migrations: `staff_directory`, `contact_stars`, `contact_hidden`, `inquiry_hidden`, `portal_removed_uploads`, the `portal_email_*` tables, `portal_signatures`, `portal_signing_settings`. |
| **Row-level security** | Enforces staff permissions on every table. See [SECURITY_AND_ACCESS.md](SECURITY_AND_ACCESS.md). |
| **Database functions** | Role helpers used by policies, and the `security definer` functions the guest portal calls. |
| **Storage** | Private `portal-uploads` bucket (staff and guest portal files) and `portal-signed` bucket (online signing), accessed through short-lived signed URLs. |
| **Edge Functions** | `submit-guest-inquiry` (public inquiries), `verify-dev-mode` (Dev Mode password), `portal-email` (guest emails), `portal-sign` (online signing). |
| **REST API** | Read by the external Google Apps Script backup. |

Further Supabase documentation:

- [src/docs/supabase-system-documentation.md](../src/docs/supabase-system-documentation.md): roles, permissions, authentication behaviour, testing and launch checks.
- [src/docs/SQL_SETUP.md](../src/docs/SQL_SETUP.md): setup SQL for the core tables, helper functions, triggers and RLS, including the `portal_token` column and its default.

## Project structure

```text
├── index.html, package.json, vite.config.js, eslint.config.js
├── public/lodges/            Lodge photos used by housing and lodging views
├── documents/                Git-ignored working copies of portal/policy documents
├── docs/                     Guides, setup notes, audits and README screenshots (docs/images/)
├── tests/                    Node regression tests (npm test)
│   └── browser/              Optional Chrome checks against a local mock Supabase
├── supabase/
│   ├── config.toml           Local stack and Edge Function settings
│   ├── functions/            submit-guest-inquiry, verify-dev-mode, portal-email, portal-sign
│   ├── migrations/           Additive SQL, applied by hand (see README)
│   ├── optional/             SQL to review before running (portal write policies, email scheduler)
│   ├── repairs/              Diagnostics, data repairs and undo (see its README)
│   └── tests/                Database and Edge Function tests (PGlite or a local Docker stack)
└── src/
    ├── main.jsx, App.jsx
    ├── auth/                 StaffAuthGate
    ├── lib/                  supabaseClient
    ├── pages/                One file per main view (Dashboard, CreateBooking, PortalAdminView, …)
    ├── components/           Shared pieces (housing tab, checklists, backups, email panel, …)
    ├── services/             Supabase reads and writes, mapping, backup data
    ├── utils/                Shared rules (classification, lodging, reports, portal, backups, …)
    ├── constants/            Lodging, meal and dashboard constants
    ├── tutorial/             Tutorial gnome walkthroughs
    ├── styles/               Global CSS, imported in order by App.jsx
    └── docs/                 Supabase system documentation and SQL setup
```

The repository root also holds `Notes.txt` (early goal notes) and `TUTORIAL_GNOME_AUDIT.md` (partly superseded; see its header).

### External infrastructure not in this repository

- **Guest portal**: a separate React/Vite application in its own repository, deployed on Vercel.
- **Public inquiry form**: hosted outside this repository; it posts to the `submit-guest-inquiry` Edge Function.
- **Google Apps Script backup project** (`createDailyBookingBackup()`, `runRetentionMaintenance()`). A clone of this repository does not recreate it.

## Common maintenance tasks

### Add a booking field

1. Prefer a real database column for values that must survive reloads and backups.
2. Update `bookingToDbRow` and `dbRowToBooking` in [src/services/bookingMapping.js](../src/services/bookingMapping.js).
3. Update [src/pages/CreateBooking.jsx](../src/pages/CreateBooking.jsx) and any views that display the field.
4. Update imports, exports and reports where appropriate.
5. Check the external Apps Script backup, which has its own equivalent of `dbRowToBooking()`.

This matters because `dbRowToBooking` restores only `rentalFormDetails`, `rawSpreadsheetData`, `inquiryAddress` and the keys named in `RAW_DATA_RESTORED_KEYS` from `raw_data`. A new top-level field kept only in `raw_data` can disappear after a reload, and because backups are built from the mapped booking object, it can also be missing from backups.

### Add or change a lodge or room

Edit [src/constants/lodgingConstants.js](../src/constants/lodgingConstants.js) (`LODGING_BUILDINGS` and, for the Lodging Calendar, `LODGING_CALENDAR_GROUPS`), then check [src/utils/lodgingUtils.js](../src/utils/lodgingUtils.js). Verify that the input exists, the value saves and reloads, the housing summary includes it, the calendar recognises it, and reports and exports behave. Run `npm test` (see `tests/lodging.test.js`).

### Add a portal task or standard document

Update the catalog in [src/pages/PortalAdminView.jsx](../src/pages/PortalAdminView.jsx), then confirm the separate guest portal can display or process the new item. If the item should send emails, check [src/utils/portalEmail.js](../src/utils/portalEmail.js).

### Support a new spreadsheet year

1. Review sheet-name and column detection.
2. Update the normalisers in `Dashboard.jsx` and helpers in [src/utils/spreadsheetUtils.js](../src/utils/spreadsheetUtils.js) if needed.
3. Test duplicate detection.
4. Test the import against a copy of live data before production use, with a fresh backup taken first.

### Change the colour scheme

Follow [THEMING.md](THEMING.md) so Night mode keeps working.

## October 2026 audit fixes

The full account is [audit/AUDIT_FIX_REPORT.md](audit/AUDIT_FIX_REPORT.md), with per-finding status in [audit/AUDIT_FIX_PROGRESS.md](audit/AUDIT_FIX_PROGRESS.md). In short:

- **Shared rules.** Record classification ([src/utils/bookingClassification.js](../src/utils/bookingClassification.js)), duplicated-field reads ([src/utils/bookingFields.js](../src/utils/bookingFields.js)), lodging, reports ([src/utils/reportRules.js](../src/utils/reportRules.js)), jobs, portal and backup rules each live in one module used by every screen.
- **Booking status.** Master and staff bookings are bookings. Progress (contract, deposit, insurance) is tracked in Portals.
- **Saves.** Conditional on `updated_at`, as described above.
- **Master re-import.** App changes are kept; see [Spreadsheet imports and exports](#spreadsheet-imports-and-exports).
- **Backups.** Newer backup versions add website inquiries, portal tasks, portal documents and an uploaded-file list; version 1 files still restore.
- **Database changes.** `supabase/migrations/` (additive), `supabase/optional/` (review first), `supabase/repairs/` (diagnostics, repairs and undo).
- **Tests.** `npm test` runs the regression tests in `tests/`.

## Project status

The booking software is in active development. Supabase is the primary source of booking data, not browser `localStorage`.

Known state:

- `npm run build` produces the production bundle (with a warning about a chunk over 500 kB).
- `npm run lint` is not clean and reports pre-existing problems; rerun it for the current count before release work.
- `npm test` runs the Node regression tests in `tests/`. Browser checks in `tests/browser/` and database tests in `supabase/tests/` are run separately.
- Some live database objects are not defined in this repository (see [SECURITY_AND_ACCESS.md](SECURITY_AND_ACCESS.md#database-objects-and-policies)). Use the audit queries there to review them.
- The project's migration history table is empty because scripts were applied by hand. **Never run `supabase db push`** against the live project.
- Guest portal emails and online signing are built; their rollout state is recorded in their SETUP files.
- Live deployment steps from the 2026-11-10 security audit are listed in [audit/SECURITY_AUDIT_2026-11-10.md](audit/SECURITY_AUDIT_2026-11-10.md) section 8.
- Some state stays per-browser: UI preferences (theme, view toggles, density), starred rows, the **Working as** choice and the last-manual-backup display details.
- Backups cover booking and portal records, not the whole Supabase project. See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md#what-backups-cover).

## Maintenance principle

When changing core booking data, ask four questions:

1. **Can the application save it?**
2. **Can the application load it again after a refresh?**
3. **Can the application display, import and export it everywhere it needs to?**
4. **Will the backup and recovery systems preserve it correctly, including tokens, related records and metadata?**

A feature is not complete just because it appears correctly in the form once. For production booking data, persistence, reloads, imports, portal behaviour and recovery are all part of the same system.
