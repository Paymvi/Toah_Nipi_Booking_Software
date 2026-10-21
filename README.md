# Toah Nipi Booking Software

A staff-only web dashboard for managing retreat and group bookings at Toah Nipi.

Staff use the system to track inquiries from first contact through confirmation, manage lodging and meals, coordinate activities and staff tasks, import historical spreadsheet data, manage group leader portal checklists and documents, run reports, and protect booking data through manual and automated backups.

The frontend is a React single-page application. Supabase provides authentication, the PostgreSQL database, file storage, and the public inquiry Edge Function. A separate Google Apps Script system creates scheduled booking backups and stores them in Google Drive.

---

## Contents

- [Purpose](#purpose)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
  - [Booking Details](#booking-details)
  - [Lodging](#lodging)
  - [Inquiries and Waitlist](#inquiries-and-waitlist)
  - [Spreadsheet Imports and Exports](#spreadsheet-imports-and-exports)
  - [Guest / Group Leader Portal](#guest--group-leader-portal)
  - [Documents and Signing](#documents-and-signing)
  - [User Admin Note](#user-admin-note)
- [How Supabase Is Used](#how-supabase-is-used)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Backup and Recovery](#backup-and-recovery)
  - [Manual Backups](#manual-backups)
  - [Known Current Backup / Restore Limitations](#known-current-backup--restore-limitations)
  - [Automatic Google Drive Backups](#automatic-google-drive-backups)
  - [Automatic Backup Retention](#automatic-backup-retention)
  - [Automatic Backup Configuration](#automatic-backup-configuration)
  - [Backup Coverage and Strategy](#backup-coverage-and-strategy)
- [Common Maintenance Tasks](#common-maintenance-tasks)
- [Troubleshooting](#troubleshooting)
- [Project Status](#project-status)
- [Maintenance Principle](#maintenance-principle)

---

## Purpose

Before this system, Toah Nipi's booking information was spread across several yearly spreadsheets, including master booking sheets, guest group inquiry sheets, and archive records. An earlier version of the dashboard also stored data in browser `localStorage`.

This application centralizes that workflow.

It:

- Stores bookings, inquiries, and waitlist records in a central Supabase database instead of individual browsers.
- Imports existing spreadsheets so historical booking data is preserved.
- Gives staff one place to see upcoming groups, lodging use, outstanding tasks, and contact information.
- Tracks booking details including dates, guest counts, lodging, meals, activities, rates, payments, documents, and operational notes.
- Gives confirmed groups a checklist and document set that staff prepare and group leaders complete through a separate guest portal.
- Accepts public inquiry submissions through a Supabase Edge Function so staff can review, convert, or decline them.
- Provides reporting and spreadsheet-style views of booking information.
- Provides manual JSON backup and restore tools.
- Uses a separate Google Apps Script system to automatically create off-app booking backups in Google Drive.

Supabase is the application's primary source of truth for booking data.

---

## Tech Stack

| Area | Technology |
|---|---|
| UI framework | React 19 with the React Compiler via `babel-plugin-react-compiler` |
| Build tool / dev server | Vite 8 |
| Routing | React Router 7 using `BrowserRouter` |
| Backend | Supabase via `@supabase/supabase-js` |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| File storage | Supabase Storage |
| Spreadsheet import/export | ExcelJS (`.xlsx`) |
| Icons | `react-icons` |
| Edge Function runtime | Deno |
| Public inquiry backend | `supabase/functions/submit-guest-inquiry` |
| Automated backups | Google Apps Script |
| Automated backup storage | Google Drive |
| Backup integrity | SHA-256 |
| Linting | ESLint 10 with `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` |

The frontend is plain JavaScript/JSX; there is no TypeScript in the frontend.

The Google Apps Script backup system is external infrastructure and is not stored in this repository.

---

## Architecture

```text
Staff browser
  │
  ├─ StaffAuthGate
  │    └─ No session ──► StaffLogin
  │                      └─ Supabase email/password authentication
  │
  └─ Dashboard
       │
       ├─ services/bookingService.js
       │    └─► Supabase table: bookings
       │
       ├─ services/guestInquiryService.js
       │    └─► Supabase table: guest_inquiries
       │
       ├─ PortalAdminView
       │    ├─► portal_checklist_items
       │    ├─► portal_documents
       │    └─► Storage bucket: portal-uploads
       │         (intended to be private; production setting is external to this repo)
       │
       └─ localStorage
            └─ UI preferences and selected browser-local data


Public inquiry form
  │
  └─► Supabase Edge Function: submit-guest-inquiry
         │
         └─► guest_inquiries
              status = "pending"


Guest / group leader portal
  │
  └─ Separate application
       │
       └─ Opened using:
          <VITE_GUEST_PORTAL_BASE_URL>/?portal=<portal_token>


Automatic backup infrastructure
  │
  └─ Google Apps Script
       │
       ├─ createDailyBookingBackup()
       │    │
       │    ├─► Supabase REST API
       │    │     └─ bookings table
       │    │
       │    ├─ validates booking data
       │    ├─ creates schema-version-1 backup envelope
       │    ├─ creates SHA-256 checksum
       │    │
       │    └─► Google Drive
       │          └─ Daily backup folder
       │
       └─ runRetentionMaintenance()
            │
            ├─ Daily backups
            ├─ Weekly checkpoints
            └─ Monthly checkpoints
```

### Key architecture points

**One shell component.** `src/App.jsx` maps every route to `Dashboard`, and `Dashboard.jsx` selects the active view from `location.pathname`. Most feature views live in `src/pages/`.

**All application routes require staff authentication.** `StaffAuthGate` wraps the router. Without a Supabase session, only the staff login screen renders.

**Booking field mapping is centralized.** `bookingService.js` converts between camelCase booking objects used by the UI and snake_case database columns using `bookingToDbRow` and `dbRowToBooking`.

The full booking object is also stored in the `raw_data` JSON column. Some application-only information, including `rentalFormDetails` and imported spreadsheet source data, is stored there.

**RLS is the real authorization boundary.** The frontend does not enforce all staff permissions itself. Supabase Row Level Security determines what authenticated users are actually allowed to read, create, update, or delete.

**Automatic backups are intentionally independent from the frontend.** They do not require someone to have the booking software open. Google Apps Script reads booking data directly from Supabase and stores backup snapshots in Google Drive.

---

## Features

Each main staff view has its own route inside the dashboard.

| Route | View | What it does |
|---|---|---|
| `/dashboard` | Dashboard Home | Overview of upcoming groups, the current week, and items needing attention. |
| `/form` | Create / Edit Booking | Full booking form for group information, contacts, dates, guest counts, lodging, linens, meals, activities, facilities, rates, payments, documents, and other booking details. |
| `/calendar` | Calendar View | Month and week views of dated bookings. |
| `/lodging-calendar` | Lodging Calendar | Shows which lodging facilities are being used on which dates. |
| `/inquiry-pipeline` | Inquiry Pipeline | Groups inquiries by stage such as New Inquiry, Needs Review, Contract Sent, Confirmed, Waitlist, and Cancelled. |
| `/master-spreadsheet` | All Booking Data | Spreadsheet-style grid of booking records with configurable columns. |
| `/inquiry-spreadsheet` | Guest Group Inquiries & No's | Spreadsheet-style view focused on inquiry records. |
| `/contacts` | Contacts View | Contact directory generated from booking records, including primary and secondary contacts. |
| `/guest-inquiries` | Guest Inquiries | Reviews public inquiry submissions. Staff can convert an inquiry into a booking or decline it with a reason. |
| `/portal-admin` | Portal View | Manages group leader portal tasks, documents, custom uploads, guest uploads, and portal links. |
| `/reports` | Reports | Reporting for status, retreat type, source, monthly trends, lodging usage, camper days, financial fields, and data quality, with CSV export. |
| `/jobs` | Jobs | Aggregates checklist and program logistics tasks assigned to staff across bookings. |
| `/user-admin` | User Admin | Browser-local staff directory used for task assignment. |
| `/backup` | Backups & Restore | Creates, validates, compares, merges, and restores booking JSON backups. |

---

### Booking details

When staff open a booking, they can manage booking details as well as operational information such as housing, checklists, and activities.

#### Housing

`BookingHousingTab.jsx` manages lodging selections and room/floor-level guest counts. It does not assign named guests to individual rooms.

The Housing tab currently supports:

- Bethel
- Hebron 3rd Floor
- Hebron Bunks
- Dothan
- Ajalon
- Capernaum
- Guest House
- Camping

Housing information can include room/floor guest counts, linen requirements, and a readable lodging summary saved to `buildingsRooms`.

Lodging definitions are not perfectly identical across every view. For example, Camping is represented in the Housing tab but is not currently a field in `CreateBooking.jsx`, and `LodgingCalendarView.jsx` uses a combined Hebron entry rather than every Housing-tab subdivision. Treat the list above as the Housing-tab list, not a guarantee that every lodging view exposes the exact same options.

#### Checklists and activities

`BookingChecklists.jsx` and `BookingActivities.jsx` support internal staff planning.

Tasks can be assigned to staff names from User Admin and are aggregated into the Jobs view.

---

### Lodging

Lodging definitions are currently hardcoded in the frontend rather than stored in an administrator-managed lodging database.

Relevant definitions exist in files including:

- `BookingHousingTab.jsx`
- `CreateBooking.jsx`
- `LodgingCalendarView.jsx`

Lodge photos are served from:

```text
public/lodges/
```

Adding or renaming lodging facilities or rooms may require updating multiple frontend locations.

When adding a new room, make sure it is included everywhere needed for:

- Data entry
- Saving
- Reloading
- Booking detail display
- Housing summaries
- Lodging calendar display
- Reports or exports where applicable

---

### Inquiries and Waitlist

Inquiries, waitlist records, and confirmed bookings are primarily represented as rows in the same `bookings` table.

They are distinguished using fields such as:

- `status`
- `waitlist`
- `source_type`

Public website inquiry submissions initially go into the separate `guest_inquiries` table.

When staff choose to convert a public inquiry, the application opens a pre-filled booking form. The booking is not created until staff save that form. After the booking is saved, the application attempts to mark the inquiry as converted and store its `converted_booking_id`.

If the follow-up inquiry update fails, the booking can exist while the original inquiry remains `pending`; the current code logs that failure rather than rolling back the newly created booking. Also, if staff leave the pre-filled conversion flow through the normal Form navigation before saving, the source-inquiry linkage can be dropped, so a later booking save may no longer mark the original inquiry as converted.

---

### Spreadsheet Imports and Exports

Spreadsheet import uses ExcelJS and accepts `.xlsx` files.

The importer recognizes several spreadsheet types from worksheet names and column structure.

Supported booking imports include:

- Master booking sheets for 2025, 2026, and 2027
- Guest Group Inquiry sheets for 2025–2027
- Waitlist records
- Archive records
- Generic spreadsheets as a fallback

Master-sheet imports use merge logic intended to preserve populated existing values when imported cells are empty. Do not assume that behavior applies to every importer: Archive, Generic, and Guest Group Inquiry rows currently follow different upsert paths, so matching IDs can be overwritten by the imported representation.

There is also a separate staff-contact import path. It reads a `staff_contacts` worksheet into the browser-local User Admin list; it does not import those contacts into Supabase.

Original imported spreadsheet information can be preserved in:

```text
raw_data.rawSpreadsheetData
```

Exports include:

- Inquiry `.xlsx` workbooks
- CSV report summaries

Example inquiry export filename:

```text
toah-nipi-booking-inquiries.xlsx
```

---

### Guest / Group Leader Portal

The guest-facing portal is a **separate application and is not contained in this repository**.

This repository manages the staff side of the portal.

Each booking has a `portal_token`.

Portal links use the form:

```text
<VITE_GUEST_PORTAL_BASE_URL>/?portal=<portal_token>
```

Staff can:

- Assign checklist tasks to a booking.
- Set due dates and required/optional status.
- Assign standard documents.
- Upload custom documents for a group.
- Attach notes to custom staff documents.
- View files uploaded by the group leader.
- Copy the portal link for the group.

Portal tasks can represent actions such as:

- Sign and return contract
- Submit Certificate of Insurance
- Pay deposit
- Submit a retreat schedule
- Confirm final guest counts

Standard portal documents are selected from a fixed catalog defined in `PortalAdminView.jsx`.

Custom staff documents can include supported types such as:

- PDF
- Word
- Excel
- PNG
- JPG/JPEG
- HEIC
- TXT

Custom portal files are limited to 10 MB.

The application is designed to use `portal-uploads` as a private Supabase Storage bucket. The repository uses short-lived signed URLs for staff file access, which is consistent with private-bucket operation; the bucket's actual production privacy setting is configured in Supabase and cannot be proven from this repository alone.

---

### Documents and Signing

There is no electronic-signature implementation in this repository.

For the portal workflow documented here, a "sign and return contract" task means staff make the contract available through the broader portal workflow (for example, by uploading it as a custom staff document) and the group leader returns a signed file for staff review. The contract is not part of the standard document catalog, and signing does not occur inside this application.

The separate guest portal application controls the guest-facing experience.

The local:

```text
documents/
```

directory is git-ignored and can contain working copies of policy or portal documents used by staff.

---

### User Admin Note

The User Admin view is **not the authentication system**.

Its staff directory is stored in that browser's `localStorage` under:

```text
toahNipiStaffUsers
```

It is used primarily for assigning staff names to tasks.

It does not:

- Create Supabase Auth accounts
- Control login access
- Assign Supabase database permissions
- Replace `staff_profiles`
- Revoke application access

Actual staff access is managed through Supabase Auth and the `staff_profiles` table.

---

## How Supabase Is Used

| Supabase feature | How the application uses it |
|---|---|
| **Auth** | Staff email/password sign-in using `signInWithPassword`, session restoration, and sign-out. There is no public staff sign-up screen. |
| **Database** | Stores `bookings`, `staff_profiles`, `guest_inquiries`, `portal_checklist_items`, and `portal_documents`. |
| **Row Level Security** | Enforces database permissions for authenticated staff. |
| **Storage** | Uses the `portal-uploads` bucket for staff and guest portal files; the application is designed for private-bucket operation, but the live bucket privacy setting is configured in Supabase and is not verifiable from this repo alone. |
| **Edge Functions** | `submit-guest-inquiry` accepts validated public inquiry submissions. |
| **REST API** | Used by the external Google Apps Script backup system to read the `bookings` table. |

### Staff roles

The documented staff access model uses:

- `viewer`
- `staff`
- `admin`

Database helper functions include:

```text
current_staff_role()
is_active_staff()
can_manage_bookings()
is_staff_admin()
```

The expected model is:

- Active staff can read allowed data.
- `staff` and `admin` users can manage bookings.
- Destructive booking actions are restricted to `admin`.

Detailed Supabase documentation lives in:

```text
src/docs/
```

Important files include:

- `src/docs/supabase-system-documentation.md`
- `src/docs/SQL_SETUP.md`

`supabase-system-documentation.md` contains information such as roles, permissions, authentication behavior, testing, and launch checks.

`SQL_SETUP.md` contains setup SQL for the core booking system, including tables, helper functions, triggers, and RLS configuration.

---

## Project Structure

```text
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── eslint.config.js
│
├── public/
│   └── lodges/
│       └── Lodge images used by housing and lodging views
│
├── documents/
│   └── Git-ignored local working copies of portal/policy documents
│
├── supabase/
│   ├── config.toml
│   └── functions/
│       └── submit-guest-inquiry/
│           └── Public inquiry Edge Function
│
└── src/
    ├── main.jsx
    ├── App.jsx
    │
    ├── auth/
    │   └── StaffAuthGate.jsx
    │
    ├── lib/
    │   └── supabaseClient.js
    │
    ├── services/
    │   ├── bookingService.js
    │   └── guestInquiryService.js
    │
    ├── pages/
    │   ├── Dashboard.jsx
    │   ├── CreateBooking.jsx
    │   ├── PortalAdminView.jsx
    │   ├── ReportsView.jsx
    │   ├── CalendarView.jsx
    │   ├── LodgingCalendarView.jsx
    │   ├── InquiryPipeline.jsx
    │   ├── ContactsView.jsx
    │   ├── SpreadsheetView.jsx
    │   ├── InquirySpreadsheetView.jsx
    │   ├── InquiryRecordDetailView.jsx
    │   ├── GuestInquiriesView.jsx
    │   ├── JobsView.jsx
    │   └── StaffLogin.jsx
    │
    ├── components/
    │   ├── DashboardBackups.jsx
    │   ├── BookingHousingTab.jsx
    │   ├── BookingChecklists.jsx
    │   ├── BookingActivities.jsx
    │   └── Other dashboard components
    │
    ├── constants/
    ├── utils/
    ├── styles/
    │
    └── docs/
        ├── supabase-system-documentation.md
        └── SQL_SETUP.md
```

`Dashboard.jsx` is a large file and contains substantial shared application logic, including spreadsheet import normalization, exports, booking detail handling, and dashboard routing.

Searching the file by function or component name is generally easier than scrolling through it manually.

### External infrastructure not stored in this repository

The production system also depends on a separate Google Apps Script project used for automated backups.

That project contains logic equivalent to:

```text
createDailyBookingBackup()
runRetentionMaintenance()
```

Because this infrastructure is outside the Git repository, a clone of this repository alone does **not** recreate the automated backup system.

See [Backup and Recovery](#backup-and-recovery).

---

## Getting Started

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Access to the Toah Nipi Supabase project, or a compatible Supabase project
- A valid staff Supabase Auth account and corresponding `staff_profiles` row

Optional tools:

- Supabase CLI, for running or deploying the inquiry Edge Function
- Access to the Google Apps Script backup project if maintaining the automated backup system
- Access to the Google Drive folders used for scheduled backups

The Google backup infrastructure is **not required to run the React application locally**.

---

### Install and run

Clone the repository:

```bash
git clone <repository-url>
cd Toah_Nipi_Booking_Software
```

Install dependencies:

```bash
npm install
```

Create:

```text
.env.local
```

in the project root.

Then run:

```bash
npm run dev
```

The Vite development server normally starts at:

```text
http://localhost:5173
```

Other useful commands:

```bash
npm run build
npm run preview
npm run lint
```

`npm run build` creates the production build in:

```text
dist/
```

Log in using a Supabase Auth account that also has an active `staff_profiles` row.

A valid Auth account without an allowed staff profile may be able to authenticate but still be denied access to database records by RLS.

---

## Environment Variables

The frontend reads environment variables from `.env.local`.

`.env.local` is git-ignored.

Example:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
VITE_GUEST_PORTAL_BASE_URL=<base-url-of-the-guest-portal-app>
```

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase publishable/client key. |
| `VITE_GUEST_PORTAL_BASE_URL` | Recommended | Base URL used when generating guest portal links. |

If the guest portal base URL is not configured, the current portal-link code falls back to:

```text
http://localhost:5173
```

which is not appropriate for production portal links.

### Important

Every variable beginning with:

```text
VITE_
```

is compiled into the browser bundle.

Never store any of the following in a frontend `VITE_` variable:

- Supabase secret/service-role key
- Database password
- `DATABASE_URL`
- Google credentials
- Private API tokens
- Other server-side secrets

---

## Supabase Setup

For a new or rebuilt Supabase environment:

### 1. Authentication

Disable public staff sign-ups unless there is a deliberate reason to support them.

Create or invite staff accounts through Supabase.

---

### 2. Core database and RLS

Run the appropriate scripts from:

```text
src/docs/SQL_SETUP.md
```

The documented setup includes core structures such as:

- `bookings`
- `staff_profiles`
- `updated_at` behavior
- RLS helper functions
- Booking RLS policies

Any temporary development policies should be removed before production use.

---

### 3. Add staff profiles

Each staff Auth user should have a corresponding row in:

```text
public.staff_profiles
```

with an allowed role such as:

```text
viewer
staff
admin
```

and:

```text
is_active = true
```

At least one administrator should exist.

---

### 4. Additional database structures

`SQL_SETUP.md` includes the `portal_token` column on `bookings`, including its generated default.

The following production structures are **not included** in `SQL_SETUP.md` and are not recreated by this repository's documented SQL setup:

- `guest_inquiries`
- `portal_checklist_items`
- `portal_documents`
- The `portal-uploads` Storage bucket and its policies

These objects need appropriate foreign keys, indexes where useful, and RLS/storage policies.

Do not assume that cloning this repository automatically recreates every production database object.

---

### 5. Storage

Create a bucket named:

```text
portal-uploads
```

The application is designed for this bucket to be private. Configure the live Supabase bucket and Storage policies so authorized staff and the guest portal workflow can perform only the required operations. The repository itself does not prove the production bucket's privacy setting.

---

### 6. Public inquiry Edge Function

Deploy:

```text
submit-guest-inquiry
```

using the Supabase CLI.

The existing `supabase/config.toml` contains configuration for this function, including its public unauthenticated invocation behavior.

The function validates incoming fields and writes approved values into `guest_inquiries`.

---

### 7. Pre-launch checks

Before importing or using real production data, review:

```text
src/docs/supabase-system-documentation.md
```

and complete the documented security and launch checks.

---

## Deployment

The repository currently contains no host-specific deployment configuration such as:

- Vercel configuration
- Netlify configuration
- Docker setup
- CI/CD workflow

The React application can be deployed to a static frontend host capable of supporting single-page applications.

Build with:

```bash
npm run build
```

and deploy the contents of:

```text
dist/
```

### Production requirements

Set the frontend environment variables in the host's build environment:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_GUEST_PORTAL_BASE_URL
```

Because Vite variables are compiled at build time, changing one normally requires rebuilding and redeploying the frontend.

### SPA fallback

The host must route application URLs such as:

```text
/calendar
/portal-admin
/reports
/backup
```

back to:

```text
index.html
```

Without an SPA fallback, refreshing a nested route may produce a 404.


---

## Security Considerations

### Row Level Security

RLS is the main database authorization boundary.

The Supabase project URL and publishable key are visible to users of the browser application by design.

Sensitive data is protected by database policies, not by hiding the public client configuration.

Keep RLS enabled and review policies after schema changes.

---

### Portal and inquiry tables

Tables such as:

- `guest_inquiries`
- `portal_checklist_items`
- `portal_documents`

and the:

```text
portal-uploads
```

bucket require their own appropriate security policies.

Anonymous users should not be able to broadly read private booking or portal data.

---

### Portal tokens

Portal tokens should be treated as sensitive access tokens.

Anyone possessing a working group portal URL may be able to access that group's guest portal depending on the guest portal's authorization design.

Do not publish portal links publicly.

---

### Uploaded files

The intended production configuration is for:

```text
portal-uploads
```

to remain private. The repository uses signed URLs for temporary file access rather than permanently public URLs, but the live bucket privacy setting must be verified in Supabase.

---

### Public inquiry Edge Function

`submit-guest-inquiry` is intentionally callable without a logged-in staff account.

Because it is public:

- Validate every accepted field.
- Do not blindly insert the raw request body.
- Avoid exposing privileged database behavior through user-controlled values.
- Monitor for spam or abuse.
- Add rate limiting or bot protection if public abuse becomes an issue.

---

### Sensitive booking information

Booking data can include:

- Names
- Email addresses
- Phone numbers
- Food allergy information
- Operational notes
- Financial fields
- Retreat details

Treat:

- Spreadsheet exports
- CSV files
- Manual JSON backups
- Automatic Google Drive backups

as sensitive operational data.

Do not place backup files in publicly shared folders.

---

### Frontend secrets

`.env.local` is git-ignored.

If a secret is accidentally committed:

1. Remove it from the repository.
2. Rotate the credential.
3. Update the appropriate environment.
4. Redeploy if necessary.

A Supabase service-role or secret key can bypass normal RLS protections and must never be exposed to the browser.

---

### Automated backup credentials

The Google Apps Script automatic backup system requires privileged access to Supabase. Its exact Script Property names are documented under [Automatic Backup Configuration](#automatic-backup-configuration).

Those values must never be committed to this repository or placed in frontend environment variables. `SUPABASE_SECRET_KEY` is especially sensitive because the backup job needs elevated access to read the database independently of a logged-in staff browser.

If that credential is exposed:

1. Rotate it immediately in Supabase.
2. Update the Google Apps Script Script Property.
3. Test the scheduled backup again.

Access to the Google Apps Script project and Google Drive backup folders should also be restricted to appropriate staff/administrators.

---

### Removing staff access

Removing someone from the browser-local User Admin view does **not** revoke access.

To revoke application access:

- Disable or remove the relevant Supabase Auth user as appropriate.
- Set the corresponding `staff_profiles.is_active` value to `false`.

---

## Backup and Recovery

The system has two complementary custom backup paths:

1. **Manual backups from the staff dashboard**
2. **Scheduled automatic backups to Google Drive**

Both are based around the Toah Nipi booking backup JSON format.

---

### Backup format

Booking snapshots use:

```text
format: "toah-nipi-booking-backup"
schemaVersion: 1
```

The backup envelope contains metadata including:

- Creation time
- Backup reason
- Application name
- Booking count
- SHA-256 integrity information
- Booking payload

Normal manual and automatic booking backups use a timestamp format such as:

```text
toah-nipi-backup-2026-10-15T01-33-18Z.json
```

Pre-restore safety snapshots use a separate `toah-nipi-pre-restore-safety-...` prefix.

The SHA-256 checksum is an integrity check for accidental corruption, not a cryptographic authenticity/signature system. Someone who deliberately edits a backup and recomputes the checksum can produce a file that passes checksum validation.

---

### Manual Backups

The staff-facing backup UI lives in:

```text
DashboardBackups.jsx
```

and is available from:

```text
/backup
```

#### Export

Creating a manual backup:

1. Reads the live booking records.
2. Creates a backup envelope.
3. Calculates a SHA-256 checksum.
4. Downloads a JSON file to the staff member's computer.

The last manually created backup's metadata is saved in browser `localStorage` for display purposes.

That local metadata is **not itself a backup**.

---

#### Backup validation

Before a backup can be restored, the UI validates items including:

- Recognized backup format
- Supported schema version
- SHA-256 checksum
- Booking array structure
- Missing booking IDs
- Duplicate booking IDs

The restore UI blocks backup files larger than 25 MB.

---

### Known Current Backup / Restore Limitations

#### Booking reads are paginated; other reads are not yet

`fetchBookings()` in `bookingService.js` reads the whole `bookings` table in pages of 1,000. It keeps requesting until Supabase returns an empty page, orders by `start_date` with `id` as a tiebreaker so rows cannot shift between pages, and throws instead of returning a partial list if a page fails or its page guard is reached. Because pagination is done in application code, it does not depend on Supabase's per-request `max_rows` limit.

Every frontend workflow that uses `fetchBookings()` therefore works with the complete booking set: the dashboard load, spreadsheet import existing-record checks, manual backups, the live backup summary, pre-restore safety snapshots, Replace and Merge verification, rollback source data, and the reload after rollback. The external Apps Script backup uses its own paging independently of the frontend.

Remaining pagination considerations:

- **Portal View** (`PortalAdminView.jsx`) loads its booking/portal list in a single request, so above the server row limit some groups may not appear there.
- **Guest Inquiries** (`getGuestInquiries()` in `guestInquiryService.js`) loads submissions in a single request, so above the limit the oldest may not appear.
- **Large imports** send every row to `upsertBookings()` in one request and use the returned rows to refresh the screen. Whether Supabase caps the rows returned from a write has not been verified; if it does, the import would still save but the screen could be incomplete until a refresh. Backup restores are not affected because they write in batches of 150.
- Pagination uses offsets, so bookings added or deleted by someone else during a read could be skipped or repeated. This is unlikely in normal use.

#### Manual zero-record backups are allowed

The manual export path currently creates a zero-booking backup **without warning at export time**. The warning appears only later when that file is loaded into the restore screen. The file still passes structural validation, so Replace remains possible.

The external automatic Google Apps Script backup is documented as intentionally refusing zero-record snapshots, but that behavior is outside this repository and cannot be independently verified here.

Do not use an unexpectedly empty manual backup for Replace restore.

#### Restore timestamps do not preserve historical metadata

Every frontend upsert sets `updated_at` to the current time. Therefore Merge updates the `updated_at` value of matching records even when the goal is simply to restore older data. If Merge re-inserts a missing booking, that row also receives a new `created_at` value from the database default.

Replace has the same timestamp behavior for every re-inserted booking: `created_at` is regenerated and `updated_at` is set to the current time.

---

#### Merge restore

Merge is the default restore mode.

It upserts backup booking records into the live database.

Records with matching IDs are updated with values from the backup. This means edits made to those records after the backup was created can be overwritten.

Records that exist only in the live database are left intact.

If a booking existed in the backup but was later deleted from the live database, Merge can re-insert it. Because the current write mapping does not restore `portal_token`, that re-inserted booking can receive a new portal token.

Use Merge when the goal is to restore selected historical state without first erasing the entire database, but review the comparison carefully because Merge is not a conflict-preserving merge of individual fields.

---

#### Replace restore

Replace mode is destructive and requires the user to type:

```text
RESTORE
```

Before deletion begins, the application downloads a pre-restore safety snapshot of the current booking records.

It then:

1. Deletes the current booking records.
2. Restores the backup in batches.
3. Verifies the restored booking IDs.
4. Attempts an automatic rollback if the replacement restore fails.

##### Current restore limitations: portal-linked bookings and metadata

Backup files contain the booking's `portalToken` when one exists, but the current `bookingToDbRow` write mapping does not persist that value back to the `portal_token` database column.

Under the schema documented in `SQL_SETUP.md`, a newly inserted booking receives a generated random portal token. Therefore a destructive Replace restore re-inserts bookings with new portal tokens, causing previously issued guest portal links to stop working.

The automatic rollback path has the same limitation because rollback also deletes and re-inserts booking records. A rollback can therefore restore booking content while still changing every portal token.

Portal-related deletion behavior cannot be fully determined from this repository because the production foreign-key `ON DELETE` rules for `portal_checklist_items` and `portal_documents` are not represented here. Depending on those rules, deleting bookings could cascade-delete related rows, be rejected by the database, or leave/set-null related records. Verify the live schema before using Replace.

Those portal tables and uploaded files are not included in the booking JSON backup.

> **Do not treat Replace restore or its rollback as complete portal-aware disaster recovery until portal-token restoration, timestamps, and related portal records have been explicitly addressed and tested.**

##### Current RLS/delete behavior to be aware of

Supabase can return no database error when an RLS policy causes a delete request to affect zero rows. The current frontend does not consistently distinguish "request succeeded" from "the intended rows were actually deleted."

For a non-admin user, delete-all or Replace behavior may therefore be misleading rather than producing a simple permission error. Replace can proceed into later restore/verification logic after zero live rows were deleted. Treat destructive recovery actions as administrator-only operations and verify the resulting database state, not only the absence of an API error.

---

### Automatic Google Drive Backups

The production backup strategy also includes a separate Google Apps Script project.

This project is **not stored in this repository**.

The main automatic backup function is:

```text
createDailyBookingBackup()
```

It is intended to be executed by a Google Apps Script time-driven trigger.

The exact trigger time is configured in Google Apps Script and is not defined by this repository.

#### Automatic backup flow

The job:

1. Reads its configuration from Google Apps Script Script Properties.
2. Connects directly to the Supabase REST API.
3. Reads every row in the `bookings` table.
4. Retrieves records in pages of up to 1,000 rows.
5. Converts database rows into the application's booking-object shape.
6. Performs safety validation.
7. Creates the same version-1 backup envelope used by the dashboard backup system.
8. Calculates a SHA-256 checksum.
9. Creates a timestamped JSON backup.
10. Stores it in the configured Google Drive daily-backup folder.
11. Verifies that Google Drive returned a valid file.
12. Verifies that the saved file is not empty.

Automatic backups use:

```text
reason: "scheduled-daily"
```

inside the backup metadata.

For dashboard restore compatibility, the external backup job must compute the checksum exactly the way the frontend verifier expects: SHA-256 over `JSON.stringify({ bookings })`. If the external script hashes a different representation, the restore screen will reject the file even if the booking data itself is valid.

---

#### Automatic backup safety checks

The Google Apps Script backup job intentionally refuses to save a backup if:

- Supabase did not return an array of records.
- The live database unexpectedly returns zero bookings.
- Any booking is missing an ID.
- Duplicate booking IDs are detected.
- Supabase returns an unsuccessful HTTP response.
- Supabase returns invalid JSON.
- Google Drive fails to create the file.
- The resulting Drive file is zero bytes.

The zero-record check is deliberate.

If something goes wrong with database access, the system should fail rather than quietly replacing a useful historical backup with an apparently successful empty snapshot.

---

### Automatic Backup Retention

A second Google Apps Script function manages long-term retention:

```text
runRetentionMaintenance()
```

The retention system uses separate Google Drive folders for:

- Daily backups
- Weekly checkpoints
- Monthly checkpoints

#### Current calendar year

For the active calendar year:

> **Every daily backup is retained.**

This provides the highest recovery granularity for the period most likely to need recent recovery.

---

#### Completed years within the last five years

After a calendar year is complete, its daily files are condensed.

For each completed year, the retention job keeps:

- One backup checkpoint per week
- One backup checkpoint per month

The selected checkpoint is the latest automatic backup found in that week or month.

Before original daily files are removed, the script ensures the required weekly and monthly copies exist.

Only after those copies are successfully available are the original daily files moved to trash.

---

#### Older backups

Weekly backups are retained for the five most recent completed years.

Weekly backups older than that retention window are moved to trash.

Monthly backups are not deleted by the retention job.

> **Monthly checkpoints are retained permanently unless someone deliberately changes the retention policy or removes them manually.**

This produces a retention strategy approximately like:

```text
Current year
└─ Keep every daily backup

Previous 5 completed years
├─ Keep weekly checkpoints
└─ Keep monthly checkpoints

Older years
└─ Keep monthly checkpoints permanently
```

---

#### Retention filename safety

Retention maintenance only processes automatic backup files that match the expected naming pattern:

```text
toah-nipi-backup-YYYY-MM-DDTHH-mm-ssZ.json
```

Files that do not match this format are ignored by the retention parser.

The filename pattern alone does not prove that a file came from the automatic backup job. Manual backups use the same normal `toah-nipi-backup-...json` naming pattern, so a manual backup placed into the automatic Daily folder can also match the retention parser. Keep the managed Drive folders dedicated to the scheduled backup system unless that behavior is intentional.

---

### Automatic Backup Configuration

The Google Apps Script project reads configuration from **Script Properties**.

Required properties include:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
DAILY_FOLDER_ID
```

Retention maintenance additionally requires:

```text
WEEKLY_FOLDER_ID
MONTHLY_FOLDER_ID
```

These values belong in Google Apps Script configuration.

They do **not** belong in:

- `.env.local`
- Git
- README examples containing real values
- Client-side JavaScript
- Frontend hosting/build environment variables

The Google Drive folder IDs determine where the backup and retention jobs store files.

---

### Backup Coverage and Strategy

The custom JSON backup system protects booking data represented by the `bookings` table. It is **not** a complete backup of the Supabase project.

Not included are:

- `guest_inquiries`
- `portal_checklist_items`
- `portal_documents`
- Files stored in `portal-uploads`
- `staff_profiles`
- Supabase Auth users
- RLS policies
- Database functions
- Database triggers
- Other database schema/configuration

According to the externally maintained Google Apps Script implementation/documentation, automatic backups include `portalToken` in the JSON booking payload when it is present in the source database row. That external behavior is not independently verifiable from this repository. The current frontend restore path does not safely write the token back during re-insertion, as described above.

The intended protection model is layered:

```text
Supabase database
│
├─ Manual application backups
│    └─ Downloadable booking JSON snapshots
│
├─ Automatic Google Drive backups
│    ├─ Daily
│    ├─ Weekly retention
│    └─ Monthly retention
│
└─ Platform-level database / storage recovery capabilities, when enabled
```

The Google Drive system protects against problems involving the frontend or an individual staff computer. Manual backups provide an on-demand snapshot before risky operations. Broader database/storage recovery is still important because the custom booking JSON does not contain the complete portal, Auth, Storage, or database configuration state.

Do not rely on a single backup mechanism for important production data.

---

## Common Maintenance Tasks

### Add a staff user

1. Create or invite the user in Supabase Auth.
2. Add the corresponding row to `staff_profiles`.
3. Assign the appropriate role.
4. Set:

```text
is_active = true
```

Removing or editing User Admin alone does not affect login access.

---

### Add a booking field

When adding a persistent booking field:

1. Prefer a real database column for values that must reliably survive reloads and backups.
2. Update `bookingToDbRow`.
3. Update `dbRowToBooking`.
4. Update `CreateBooking.jsx`.
5. Update any display views using the field.
6. Update imports if appropriate.
7. Update exports if appropriate.
8. Update reports if appropriate.
9. Update backup mapping if the external Apps Script backup uses an explicit field-by-field mapper.

This matters because the current `dbRowToBooking` only explicitly restores `rentalFormDetails` and `rawSpreadsheetData` from `raw_data`. A new top-level field that exists only inside `raw_data` can disappear after a reload, and because frontend backups are built from the mapped booking object, that field can also be absent from a manual backup. Do not assume that placing a new field somewhere in `raw_data` makes it durable.

The automatic Google Apps Script backup maintains its own equivalent of `dbRowToBooking()`. If the booking schema changes, verify that the automatic backup still captures the intended fields.

---

### Add or change a lodge or room

Review all areas that contain lodging definitions, especially:

```text
BookingHousingTab.jsx
CreateBooking.jsx
LodgingCalendarView.jsx
```

Verify:

- Input exists
- Value saves
- Value reloads
- Housing summary includes it
- Calendar recognizes it
- Reports/exports behave correctly

---

### Add a portal task or standard document

Update the appropriate task or document catalog in:

```text
PortalAdminView.jsx
```

Then confirm that the separate guest portal knows how to display or process the new item.

---

### Support a new spreadsheet year

Spreadsheet imports currently recognize specific historical workbook patterns.

When adding a new year's workbook:

1. Review sheet-name detection.
2. Review column detection.
3. Update normalizers in `Dashboard.jsx`.
4. Update helpers in `src/utils/spreadsheetUtils.js` if required.
5. Test duplicate detection.
6. Test imports against existing live data before production use.

---

### Before a large import

Create a fresh backup first.

Ideally verify that:

- The automatic backup job has also run successfully recently.
- The newest Google Drive backup exists and is non-empty.
- The manual backup file opens and validates.

---

### Before a restore

Before any production restore:

1. Create a manual backup.
2. Confirm a recent automatic Google Drive backup exists.
3. Review what tables the selected restore actually covers.
4. Prefer Merge unless Replace is genuinely required.
5. Be especially cautious with portal-linked bookings.
6. Do not use Replace as a full portal recovery mechanism until portal-token, timestamp, and related-portal-data limitations have been fixed and tested.

---

### Monitor automatic backups

Periodically confirm that:

- New files appear in the Google Drive daily folder.
- Google Apps Script executions are succeeding.
- The time-driven trigger remains enabled.
- Backup file sizes appear reasonable.
- Booking counts appear reasonable.
- The Supabase secret has not expired, been revoked, or been rotated without updating Apps Script.

---

### Maintain the retention job

Confirm that the separate retention trigger remains enabled.

The retention process should be allowed to:

- Read the daily backup folder
- Copy files into the weekly folder
- Copy files into the monthly folder
- Move expired daily/weekly files to trash

Do not manually rename production backup files unless you understand the filename parser used by the retention script.

---

## Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| Blank page with `Missing Supabase environment variables.` in the console | `.env.local` is missing or the variable names are wrong. Restart the dev server after editing it. |
| Login works but no bookings load | The Auth user may not have an active `staff_profiles` row, or RLS configuration may be blocking access. |
| Saving or importing fails for some users | Their database role may be read-only. |
| Delete-all or Replace behaves strangely for a non-admin | RLS can cause the delete request to affect zero rows without returning a normal API error. Use an administrator account for destructive recovery operations and verify the resulting row set. |
| Copied portal links point to `localhost:5173` | `VITE_GUEST_PORTAL_BASE_URL` was not configured for that build. |
| Portal uploads fail | Check that `portal-uploads` exists and that the live Supabase bucket/privacy configuration and Storage policies match the intended private-file workflow. |
| Opening a portal file fails | Check signed URL generation and Storage permissions. |
| Refreshing `/calendar` or another nested route returns 404 | Production host is missing SPA fallback to `index.html`. |
| Spreadsheet import adds no new records | Records may already exist. Master imports use merge logic; other import types can follow different upsert behavior, so review the import summary and source type. |
| Build warns about a chunk larger than 500 kB | The current application bundle is large. This is a warning rather than a build failure. |
| Portal View or Guest Inquiries seems to be missing older records | These two views still load in a single request and can be limited by the Supabase row limit (1,000 by default). The main booking list and backups are paginated and not affected. |
| Manual backup contains zero bookings | Manual export currently creates the empty backup without warning. A warning appears only when the file is loaded into the restore screen, and validation still allows it. Verify database access/data and do not use it for Replace. |
| Automatic daily backup does not appear in Drive | Check Google Apps Script execution history, the time-driven trigger, Script Properties, Supabase access, and Drive folder permissions. |
| Automatic backup fails with zero bookings | The safety check intentionally stopped the backup. Verify Supabase connectivity and live data before changing this behavior. |
| Automatic backup reports a Supabase HTTP error | Check `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and whether the credential still has the required access. |
| Automatic backup fails after Supabase key rotation | Update `SUPABASE_SECRET_KEY` in Google Apps Script Script Properties. |
| Automatic backup cannot create a Drive file | Check `DAILY_FOLDER_ID`, Google Drive permissions, and Apps Script authorization. |
| Retention maintenance fails immediately | Verify `DAILY_FOLDER_ID`, `WEEKLY_FOLDER_ID`, and `MONTHLY_FOLDER_ID`. |
| Daily files are not being condensed after a completed year | Check that retention maintenance is actually being triggered and that filenames match the expected automatic backup pattern. |
| An old test file remains in the daily folder | Files that do not match the expected production backup filename are intentionally ignored by retention maintenance. |
| Portal links change after a Replace restore | Current restore mapping does not write the backed-up `portalToken` back to `portal_token`. Avoid relying on Replace for portal-linked production records until this is fixed. |

---

## Project Status

The booking software is in active development.

Supabase is currently the application's primary booking-data source rather than browser `localStorage`.

Current known state:

- `npm run build` succeeds.
- `npm run lint` is not currently clean and reports pre-existing errors/warnings; rerun it for the current count before release work.
- There are currently no automated tests in the repository.
- The repository has no `supabase/migrations` directory, and `SQL_SETUP.md` does not include `guest_inquiries`, `portal_checklist_items`, `portal_documents`, or the `portal-uploads` bucket/policies.
- The Google Apps Script automatic backup system is external to this repository.
- Automated Google Drive booking backups are configured separately from the React application.
- Some non-database application state remains browser-local, including UI preferences, starred rows, the User Admin task-assignment directory, and the last-manual-backup display metadata.
- Custom booking JSON backups cover the `bookings` data represented by the application but are not a full Supabase project backup.
- `fetchBookings()` paginates through the full `bookings` table,so backups, restores, rollback and import checks use the complete booking set. Portal View and Guest Inquiries still load in a single request, and the rows returned by large `upsertBookings()` writes have not been verified.
- Manual backups can currently be created with zero booking records without any export-time warning; the restore screen warns later but does not block the file. The external automatic-backup implementation is documented as refusing zero-record snapshots.
- Replace restore and rollback do not safely preserve existing portal tokens. Merge and Replace also rewrite `updated_at`, and re-inserted records receive new `created_at` values.
- Portal-table deletion behavior depends on production foreign-key `ON DELETE` rules that are not included in this repository.
- Portal tables, uploaded files, authentication accounts, and database configuration require separate recovery consideration.

---

## Maintenance Principle

When changing core booking data structures, ask four questions:

1. **Can the application save it?**
2. **Can the application load it again after refresh?**
3. **Can the application display/import/export it everywhere it needs to?**
4. **Will the backup and recovery systems preserve it correctly, including tokens, related records, and metadata?**

A feature is not complete merely because it appears correctly in the form once.

For production booking data, persistence, reload behavior, imports, portal behavior, and recovery should all be considered part of the same system.