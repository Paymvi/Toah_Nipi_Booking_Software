# Booking System Consistency Audit

**Status:** Pass 2 complete for the declared static scope (see Section 2.4 and Section 9). 50 findings. Deployed systems, external apps and runtime behavior were not verified, so the system as a whole is **not** fully audited.

**Report file:** `BOOKING_SYSTEM_AUDIT.md` (repository root). **Revision audited:** `16dd827`.

**Audit type:** Static, read-only inspection of the repository. No application code, configuration, schema, data, or documentation was changed. No commands that mutate state were run.

---

## 1. Audit scope and evidence limits

**Repository revision:** `16dd8270e4a50effddd0c421622b671c3e772d12` on `main` ("Replace Meals & Activities tab with Staff Assignments"), working tree clean at audit start. Audit date: 2026-10-28.

**What was inspected (static reading of source):**
- Frontend: `src/App.jsx`, `src/main.jsx`, `src/auth/*`, `src/lib/supabaseClient.js`, `src/services/*` (all), `src/utils/*` (all), `src/constants/*` (all), all `src/pages/*.jsx` and `src/components/*.jsx` (depth varies; see coverage matrix).
- Supabase: `supabase/functions/submit-guest-inquiry/index.ts`, `supabase/functions/verify-dev-mode/index.ts`, `supabase/functions/submit-guest-inquiry/deno.json`, `supabase/config.toml` (auth/functions/api sections).
- Documentation: `src/docs/SQL_SETUP.md`, `src/docs/supabase-system-documentation.md`, `README.md` (relevant sections), `Notes.txt`.
- Configuration: `package.json`, `vite.config.js`, `eslint.config.js`, `.gitignore`, `index.html`. From `.env.local` only the **variable names** were listed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GUEST_PORTAL_BASE_URL`); no values were read.

**Not available / not inspected:**
- The deployed Supabase project (schema, RLS, Storage policies, Edge Function versions, data). No queries were run.
- The guest-facing public inquiry form and the guest portal application (separate codebases, not in this repository).
- The Google Apps Script automated-backup project (README says it is external).
- `dist/` (generated build output), `node_modules/`, CSS files (out of scope for data consistency), `documents/` PDFs (only file names were compared with the Portal document catalog — all 14 match).
- There are **no automated tests** in the repository (`package.json` has no test script; no test files exist).

**Evidence classes used in this report:**
- *Repository evidence* — behavior read directly from code; findings marked **Confirmed** rest on tracing both the writer and the reader.
- *Inferred runtime behavior* — e.g., how PostgREST stores an array sent to a `text` column, how React remounts keyed components, how ExcelJS represents dates. These are marked **Suspected** or explained inline.
- *Deployed-system assumptions* — anything about production tables other than `bookings`/`staff_profiles`, FK behavior, RLS, or environment variables is marked **Requires external verification**. README statements about production (e.g., FK cascade rules) are cited as documentation, not as verified facts.

No application code, configuration, schema, data, or documentation was modified. The only file created is this report.

**Pass 2 (same day, same revision):** completed the areas pass 1 marked as partially reviewed and rechecked the highest-impact findings for counterevidence. Corrections are listed in the Section 9 revision log; corrected findings carry "Revised in pass 2" or "Pass 2 note" markers.

---

## 2. Repository and workflow map

### 2.1 Entry points and shell

| Piece | Location | Role |
|---|---|---|
| App/routing | [src/App.jsx](src/App.jsx) | Every route renders `Dashboard`; `StaffAuthGate` requires a Supabase session. |
| Auth gate | [src/auth/StaffAuthGate.jsx](src/auth/StaffAuthGate.jsx), [src/pages/StaffLogin.jsx](src/pages/StaffLogin.jsx) | Session check only; no `staff_profiles` role lookup (AUDIT-023). |
| Dashboard shell | [src/pages/Dashboard.jsx](src/pages/Dashboard.jsx) (10.7k lines) | Owns booking state (`publicInquiries` → `inquiryBookings` via `normalizeInquiry`), imports, export, booking detail, edit form, home metrics, sidebar, view switching. |
| Supabase client | [src/lib/supabaseClient.js](src/lib/supabaseClient.js) | Publishable key client. |

### 2.2 Data access layer

| Module | Tables / functions | Notes |
|---|---|---|
| [src/services/bookingService.js](src/services/bookingService.js) | `bookings` (select paginated, upsert full row, delete) | `bookingToDbRow` / `dbRowToBooking` mapping; `raw_data` = whole object; `getConsistentWaitlistState`. |
| [src/services/guestInquiryService.js](src/services/guestInquiryService.js) | `guest_inquiries` (select, update status) | Not paginated. |
| [src/services/devModeService.js](src/services/devModeService.js) | Edge Function `verify-dev-mode` | UI gate only. |
| [src/pages/PortalAdminView.jsx](src/pages/PortalAdminView.jsx) | `bookings` (custom select with `raw_data->rentalFormDetails`), `portal_checklist_items`, `portal_documents`, Storage `portal-uploads` | Direct Supabase calls inside the page. |
| [supabase/functions/submit-guest-inquiry/index.ts](supabase/functions/submit-guest-inquiry/index.ts) | inserts `guest_inquiries` with service role | Public (`verify_jwt = false`). |
| [src/components/DashboardBackups.jsx](src/components/DashboardBackups.jsx) | `bookings` via bookingService | JSON backup/restore of mapped booking objects. |
| localStorage | staff users, current staff user, starred contacts/bookings, saved spreadsheet views, report/date settings, last-backup metadata | Per-browser (AUDIT-017). |

### 2.3 Lifecycle as implemented

```
Public form (external app) ──POST──► submit-guest-inquiry ──► guest_inquiries (status 'pending')
                                                            │
Guest Inquiries view ──"Create booking"──► CreateBooking (seed via guestInquiryToStaffInquiry)
                     └─"Decline"──► guest_inquiries.status='declined'
CreateBooking (create) ──upsertBooking──► bookings (source_type 'Staff Booking', status from contract dates)
                     └─onBookingCreated──► guest_inquiries.status='converted', converted_booking_id
Spreadsheet imports (Master 2025/26/27, Guest Group Inquiry 2025/26/27, Archive[hidden]) ──upsertBookings──► bookings
Inquiry Spreadsheet ──"Start booking"──► CreateBooking (seed = booking row; sourceInquiryId in rentalFormDetails)
Booking Detail tabs:
  Overview (read + incident notes) ─┐
  Edit: Staff Booking → CreateBooking(edit) ; others → BookingDetailsEditForm
  Housing → buildings_rooms + rentalFormDetails.lodging*
  Staff Assignments → program_logistics_assignments
  Checklists → checklists (jsonb)
            all ──saveBookingEdits──► upsertBooking (full-row upsert from the in-memory object)
Inquiry Pipeline (/inquiry-pipeline, hidden) ──status change──► saveBookingEdits
Inquiry Record Detail ──save──► saveBookingEdits (status re-derived from disposition)
Calendar / Lodging Calendar / Contacts / Reports / Jobs / Spreadsheet ── read-only views over inquiryBookings
Portal Admin ── reads bookings+portal tables; inserts portal items/docs; Storage uploads; signed URLs
Guest portal (external app) ── portal_token links (/?portal=<token>), security-definer functions (not in repo)
Backup page ── fetchBookings → JSON; restore → upsertBookings (merge) or deleteAll + upsert (replace)
Export Excel ── 12-column sheet from inquiryBookings
```

Key structural fact: every booking save is a **full-row upsert** of whatever object the screen holds (`bookingToDbRow` rebuilds every column and `raw_data`). There are no partial updates on `bookings`, so any field that a screen's object lacks is written as empty/default, and any field `dbRowToBooking` does not restore is erased on the next save (AUDIT-001).

### 2.4 Coverage matrix

Status meanings: **Reviewed** — data reads/writes and business rules traced end to end. **Partially reviewed** — data paths traced; some rendering/UI code or secondary branches not read line by line. **Not verified** — not present in the repo or not inspectable without runtime/production access.

| Area | Files | Status | Remaining work |
|---|---|---|---|
| Booking persistence mapping | bookingService.js | Reviewed | — |
| Spreadsheet import (Master, Guest Group, Archive, Everything, Staff Contacts) | Dashboard.jsx import section; spreadsheetUtils.js; dateUtils.js | Reviewed | Runtime test against real workbooks. |
| Export Excel | Dashboard.jsx `exportInquiriesToSpreadsheet` | Reviewed | — |
| Create Booking (create, seeded, edit) | CreateBooking.jsx | Reviewed (pass 2) | All 50 named inputs + the lodging map + meal/allergy/activity/facility row editors checked against state, validation, submit, persistence and edit prefill. No input→state key mismatch found. |
| Edit tab (simple form) | Dashboard.jsx `BookingDetailsEditForm` | Reviewed | — |
| Booking Overview | Dashboard.jsx `BookingOverview` and card components | Reviewed (pass 2, data reads) | Every field read in the render section inventoried; meals card parses the `meals` summary text; lodging card is a separate building list (AUDIT-031). Pure styling/markup not reviewed. |
| Housing tab | BookingHousingTab.jsx | Reviewed (data) | Markup only. |
| Staff Assignments tab | BookingStaffAssignmentsTab.jsx | Reviewed (data and save) | Markup only. |
| Checklists tab | BookingChecklists.jsx | Reviewed (pass 2) | — |
| Jobs | JobsView.jsx | Reviewed | — |
| User Admin | Dashboard.jsx `UserAdminView` + staff storage helpers | Reviewed (pass 2) | — |
| Calendar / Lodging Calendar / BookingCalendar | CalendarView.jsx, LodgingCalendarView.jsx, BookingCalendar.jsx | Partially reviewed | Filtering/matching reviewed; week/year render and lane layout not reviewed (presentation only). |
| Contacts | ContactsView.jsx | Reviewed (pass 2) | Copy-to-clipboard and markup only. |
| Inquiry Pipeline | InquiryPipeline.jsx | Reviewed (pass 2, actions and columns) | Card markup only. |
| Inquiry Spreadsheet / Record Detail | InquirySpreadsheetView.jsx, InquiryRecordDetailView.jsx | Reviewed (data) | — |
| Master Spreadsheet | SpreadsheetView.jsx | Reviewed (pass 2, data and persisted settings) | Read-only view; saved views/settings normalize removed columns. Rendering of the settings drawer not reviewed. |
| Reports | ReportsView.jsx | Reviewed (pass 2, calculations, monthly rows, CSV) | Chart markup only. |
| Guest Inquiries | GuestInquiriesView.jsx, guestInquiryService.js | Reviewed (data) | — |
| Portal Admin | PortalAdminView.jsx | Reviewed (pass 2, data, assignment panels, confirm, uploads) | Markup only. |
| Backups | DashboardBackups.jsx | Reviewed | — |
| Dashboard home metrics | Dashboard.jsx home helpers | Reviewed | — |
| Edge Functions | supabase/functions/* | Reviewed (source) | Deployed versions and CORS behavior not verified. |
| SQL / docs | src/docs/*, README.md | Partially reviewed | README read in relevant sections only. |
| Deployed DB, RLS, Storage, FKs | — | Not verified | Section 8. |
| Guest portal & public form apps | — | Not verified | External codebases. |
| Google Apps Script backups | — | Not verified | External. |
| Runtime behavior | — | Not verified | App not run; no tests exist. |

---

## 3. Field and concept traceability

Legend: **col** = dedicated `bookings` column; **RFD** = `raw_data.rentalFormDetails`; **raw** = only inside `raw_data` (lost on reload, AUDIT-001). "N/A (intentional)" marks places where a field is deliberately not used. "Missing" marks a gap.

### 3.1 Identity, contact, source

| Concept | Names in code | Created by | Edited by | Persisted | Main consumers | Import / Export / Backup | Findings |
|---|---|---|---|---|---|---|---|
| Group name | `organizationName` (col `organization_name`), RFD `organizationName`, guest `organization_name`, archive `archiveGuestGroup` | Create Booking, imports, guest seed | Create Booking edit (both copies), Edit tab (col only), Inquiry Record Detail (col only) | col + RFD | all views; Contacts prefers RFD | Master/Guest/Archive import ✔; Export "Guest Group Name" ✔; Backup ✔ | 003 |
| Primary contact | `contactName` + alias `name` (col `contact_name`), RFD `contactName`, archive `firstName`/`lastName` (raw) | same | same split as above | col + RFD (+ raw first/last) | Contacts prefers RFD | Export ✔ | 001, 003 |
| Email / phone | `email`, `phone` (col), RFD copies | same | same split | col + RFD | Contacts prefers RFD | Export ✔ | 003 |
| Secondary contact | `secondaryContactName/Phone/Email` in RFD; top-level copies from `normalizeInquiry` (raw) | Create Booking, Edit tab, raw sheet columns | Create Booking edit, Edit tab | RFD | Overview, Contacts secondary table, Export | Public form: **Missing** (no fields); Export ✔ | 039 |
| Mailing address | `inquiryAddress` (raw, restored), RFD `mailingAddress`, guest `mailing_address`, archive `archiveAddress…` (col) | guest import, Create Booking, guest seed | Inquiry Record Detail (`inquiryAddress`), Create Booking (RFD + top) | raw + RFD | Contacts, Overview, Create Booking prefill | Export: **Missing** | — |
| Source | `sourceType` (col, default "Form"), `detectedImportType` (col), `sourceSheet`, `sourceRowNumber`, RFD `sourceInquiryId/Sheet/RowNumber/...` | each creator | — | col / RFD | Edit routing (`isStaffBookingRecord`), Pipeline, Reports, Inquiry Spreadsheet | — | 036 |
| Portal token | `portalToken` ← col `portal_token` (DB default) | DB | never written by app | col | Portal Admin, Storage paths | Backup: read but **not restored** | 009, 038 |
| Created time | col `created_at` | DB | — | col | **none** (not mapped) | Backup: **Missing** | 001, 009 |

### 3.2 Dates and stay

| Concept | Names | Created by | Edited by | Persisted | Consumers | Import/Export | Findings |
|---|---|---|---|---|---|---|---|
| Arrival / departure | `startDate`/`endDate` (col date), RFD copies; guest `start_date`/`end_date` | Create Booking, Master import (UTC), Archive (local, shifted), guest seed | Create Booking edit (both), Edit tab (col only) | col + RFD | Calendars (local midnight, inclusive end), Reports (top-level), Contacts (RFD first) | Export: flattened into "Desired Dates" | 003, 013, 037 |
| Desired dates text | `desiredDatesText` + alias `desiredDates` (col `desired_dates_text`) | Guest Group import; derived elsewhere | Edit tab, Inquiry Record Detail | col | Inquiry Spreadsheet, Create Booking prefill (`parseDesiredDateRange`) | Export ✔ | — |
| Inquiry date | `submittedAt` (col `submitted_at`), RFD `inquiryDate`, guest `submitted_at` | Guest import (sheet Date, shifted), Create Booking (`inquiryDate` noon UTC), Master/Archive (**import time**) | Create Booking, Inquiry Record Detail | col + RFD | `getBookingInquiryDateValue` (correct), Spreadsheet "Submitted"/Contacts/Export (raw) | Export "Date" = submittedAt | 012, 013 |
| Nights | `nights` (col), RFD `numberOfNights` | Create Booking (both), Master (both) | Create Booking (both), Edit tab (col only) | col + RFD | Reports & Overview prefer RFD; Dashboard home prefers col | — | 003 |
| Arrival/departure time | RFD `arrivalTime`/`departureTime`; guest `arrival_time`… | Create Booking, Master parse | Create Booking | RFD; also in `schedule` text | Overview | — | 040 |
| Cancellation | `dateOfCancellation`, `reasonForCancellation` (col) | Master import | Edit tab: **Missing** (not in form); Create Booking: **Missing** | col | Dashboard home, Pipeline, Portal eligibility | — | 034 |

### 3.3 Workflow status

| Concept | Names | Values produced | Edited by | Consumers / rules | Findings |
|---|---|---|---|---|---|
| Booking status | `status` (col), RFD `status` (Master, Create Booking edit) | Inquiry, Contract Sent, Confirmed, Waitlist, Cancelled, Archived Visit, Imported (Edit tab only) | Create Booking edit, Edit tab, Pipeline, Inquiry Record Detail | see AUDIT-034 table | 011, 019, 032, 034 |
| Waitlist flag | `waitlist` (col, "Yes"/"No") | imports, forms | `getConsistentWaitlistState` (Create edit, Edit tab); Pipeline actions set it explicitly (consistent); Inquiry Record Detail derives from disposition | Dashboard home, Portal, Pipeline, Reports | 011 |
| Disposition | `inquiryDisposition` (raw, lost), `stageOfGroup` (col), RFD `sourceInquiryDisposition` | Guest import, Inquiry Record Detail | Inquiry Record Detail | Pipeline (waitlist precedence), Inquiry Spreadsheet | 001, 011, 019 |
| Contract dates | RFD `contractSentDate`, `returnContractByDate`, `contractReturnedDate`; Master `importedContract*Status`; guest `guestReportedContractReturnedDate` | Create Booking, Master | Create Booking only | Create Booking initial status, Dashboard home, Pipeline, Portal eligibility | 029 |
| Guest inquiry status | `guest_inquiries.status` pending/converted/declined | Edge Function, staff | Guest Inquiries view, Dashboard `onBookingCreated` | Guest Inquiries columns | 004, 008 |
| Portal item status | `portal_checklist_items.status` notStarted/waitingOnGuest/needsReview/completed | Portal Admin insert, guest portal | Portal Admin (needsReview→completed only) | Portal progress | 029, 038 |

### 3.4 Guests, meals, lodging, linens, activities

| Concept | Names | Created by | Edited by | Persisted | Consumers | Findings |
|---|---|---|---|---|---|---|
| Guest count | `attendeeCount` + alias `groupSize` (col text), `persons` (col), RFD `approxTotalGuests`, `approxAdultGuests`, `approxChildren3to17`, `approxChildrenUnder3`, `actual*`, legacy `approxChildrenGuests`/`actualChildrenGuests`, `importedGuestCountText/Kind` | Create Booking (both), Master (both, ranges as "40-50"), Guest import (col), guest seed | Create Booking (both), Edit tab (col) | col + RFD | Reports prefers RFD breakdown; Dashboard home & Contacts prefer col; parsing differs | 003, 018 |
| Day campers | RFD `dayCamperCount`, `dayCamperMeals`, `dayCamperMealServings`, `dayCamperCamperDays`; legacy `dayCampers[]`, `dayCamperTotals` | Create Booking, Master (count) | Create Booking | RFD | Reports, Overview | — |
| Meals | `meals` (col summary text), `mealCount` (col), RFD `mealSchedule{date:{breakfast,lunch,dinner}}`, `numberOfMeals`, `firstMeal`, `lastMeal`, `breakfastTime`…, `mealNotes`, `importedMealText`; guest `meal_schedule`, `number_of_meals` | Create Booking (derived from schedule), Master (parsed when unambiguous), guest seed | Create Booking, Edit tab (col text only) | col + RFD | Reports prefer `numberOfMeals`; Overview parses summaries | 003, 040 |
| Lodging | `buildingsRooms` (col text, 4 formats), `roomName` (col, default "Unassigned"), RFD `lodgingBethel`…`lodgingGuestHouse`, room/floor fields, `lodgingCamping*`, `housingUsage`, `importedLodgingText` | Create Booking (7 totals), Housing tab (rooms + camping), Master (text) | Housing tab, Create Booking edit (rebuilds text), Edit tab (both text cols) | col + RFD | Lodging Calendar, Reports, Dashboard home (text ∪ roomName), Housing tab (RFD then text) | 005, 007, 031 |
| Linens | `linenSets` (col text summary), RFD `linenOption`, `linenSets`, `linenPieces`; top-level `linenPieces` (raw) | Create Booking, Housing tab, Master parse, guest seed | Create Booking, Housing tab, Edit tab (text) | col + RFD | Housing tab (RFD first), Spreadsheet | 001, 040 |
| Allergies | `foodAllergies` (col summary), RFD `allergies[{name,count}]`, `allergyNotes`; guest `allergies`, `allergy_notes` | Create Booking (summary), Master (text → `allergyNotes`) | Create Booking, Edit tab (col) | col + RFD | Overview, Spreadsheet | 040 |
| Activities | `activities` (col **text**, receives array from Create Booking), RFD `activities[{date,time,activity}]`, `activityNotes`; guest `activities` | Create Booking, Master (text), guest seed | Create Booking, Edit tab (text) | col + RFD | Overview (RFD then col), Spreadsheet (col) | 002 |
| Facilities | RFD `facilities[{date,time,task,assignedTo,notes}]`, `facilityNotes`; top-level `facilities` (raw) | Create Booking | Create Booking | RFD | Overview facilities card; **Jobs: Missing** (assignee is free text) | 001, 043 |
| Notes | `notes` + alias `message` (col), RFD `notes`, `incidentNotes`, `importWarnings`; `needToKnow` (col) | all | Create Booking (both), Edit tab (col), Inquiry Record Detail (col), Overview incident card (RFD) | col + RFD | Overview, Spreadsheet, Export "Additional Notes" | 006, 040 |

### 3.5 Money

| Concept | Names | Created by | Edited by | Persisted | Consumers | Findings |
|---|---|---|---|---|---|---|
| Rates | `guestRate` (col), RFD `adultRateQuoted`, `childRateQuoted`, `childUnder3RateQuoted` (import only) | Create Booking, Master | Create Booking | col + RFD | Overview (RFD first) | 015 |
| Guarantees | `minPayingGuests`/`maxPayingGuests` (col), RFD `minimumGuarantee`/`maximumGuarantee` | Create Booking, Master | Create Booking | col + RFD | Overview (RFD first) | 003 |
| Deposit | `deposit` (col), `depositReceived` (col; date for Staff, free text for Master — Reports treat most text as received, AUDIT-047), RFD `depositAmount`, `depositReceivedDate`, `importedDepositStatus`; guest `deposit_amount`, `deposit_sent_date` | Create Booking, Master | Create Booking (both), Edit tab: **Missing** | col + RFD | Reports & Overview prefer RFD | 003, 029 |
| Revenue | `invoiceLodgingMeals`, `expectedMinimumRevenue`, `monthlyProjectedIncome`, `usageFee`, `lodgingCost`, `foodCost`, `miscCost` (col); aliases `invoiceTotal`, `expectedRevenue` (never set) | Master only | Edit tab (itemized only) | col | Reports | 015 |
| Camper days | `camperDays` (col, stored), calculated in Reports (nights×0.4 + meals×0.2 per guest, + day campers × meals × 0.2) | Master (stored) | Edit tab | col | Reports | 035 |

### 3.6 Operations

| Concept | Names | Created / edited by | Persisted | Consumers | Findings |
|---|---|---|---|---|---|
| Internal checklists | `checklists[{id,name,items[{id,sequence,title,dueDate,assignedTo,completed,completedAt,completedBy}]}]` (col jsonb) | Checklists tab (no save guard) | col | Jobs (read-only; completion only on the tab) | 016, 017, 045 |
| Staff assignments | `programLogisticsAssignments[{id,role,assignedTo,notes}]` (col jsonb `program_logistics_assignments`) | Staff Assignments tab | col | Jobs, User Admin auto-add | 016, 017 |
| Portal tasks/documents | `portal_checklist_items`, `portal_documents` tables | Portal Admin (add, confirm only), guest portal | separate tables | Portal Admin | 010, 029, 038, 050 |
| Contact preferences | localStorage `toahNipiStarredContacts`, `toahNipiContactsViewDeletedContacts`, name-sort and starred-first flags | Contacts view | browser only, keyed by derived contact ID | Contacts | 049 |
| Spreadsheet views | localStorage `bookingSpreadsheetSavedViews`, `toahNipiSpreadsheetViewSettings`, starred booking IDs | Master Spreadsheet | browser only | Master Spreadsheet | — (normalized; harmless) |
| Staff users | localStorage `toahNipiStaffUsers` | User Admin, Staff Contacts import, auto-add | browser only | assignments, checklists, Jobs, greeting | 017 |

Backups include every column mapped by `dbRowToBooking` (and therefore all RFD content) but not `portal_token` restoration, `created_at`, raw-only keys, portal tables, guest inquiries, Storage, or localStorage (AUDIT-009/010).

---

## 4. Complete findings

Severity scale: **Critical** (silent loss/corruption of business data in a common workflow) · **High** (incorrect data or broken workflow likely in normal use) · **Medium** (incorrect/misleading data under specific but realistic conditions) · **Low** (edge cases, cosmetic or limited reach) · **Cleanup** (dead code, maintenance hazard, no current user impact).

Confidence: **Confirmed** (writer and reader both traced in code) · **Suspected** (code strongly implies the defect but one link is runtime/environment-dependent) · **Requires external verification** (depends on deployed schema, data, or configuration not in the repo).

### Findings index

_The index only lists findings; full detail follows. Category: **D** = defect in current behavior, **P** = product decision needed before fixing, **M** = maintenance/consolidation, **X** = external verification gap._

| ID | Severity | Confidence | Title |
|---|---|---|---|
| AUDIT-001 | Low | Confirmed | `dbRowToBooking` restores only three keys from `raw_data`; other non-column properties and `created_at` are not available after reload |
| AUDIT-002 | Medium | Confirmed | Create Booking writes `activities` as an array of objects into the text column `activities` |
| AUDIT-003 | High | Confirmed | Master-imported bookings keep two copies of many fields; the Edit tab updates one copy, while Contacts, Reports and the Overview read the other |
| AUDIT-004 | Medium | Confirmed | A pending guest-inquiry conversion is not cleared when staff start a different booking, so the wrong guest inquiry can be marked "converted" |
| AUDIT-005 | Medium | Confirmed | `buildings_rooms` has four writers with incompatible formats; Create Booking's edit save discards Housing-tab detail |
| AUDIT-006 | High | Confirmed | Re-importing a Master sheet resets staff-set status and waitlist (and any field the sheet populates); the dialog says staff-only fields are retained |
| AUDIT-007 | Medium | Confirmed | `roomName` is never updated by the Housing tab, so stale imported lodging text keeps buildings "assigned" everywhere |
| AUDIT-008 | Medium | Confirmed | Failure to mark a guest inquiry "converted" is logged only to the console |
| AUDIT-009 | High | Confirmed | Backup/restore does not preserve `portal_token`, `created_at`, or `raw_data` beyond three keys |
| AUDIT-010 | High / Medium (depends on FK) | Confirmed gap; cascade requires external verification | Backups cover only `bookings`; Replace restore deletes bookings that portal rows depend on |
| AUDIT-011 | Low | Confirmed | The Inquiry Pipeline places records by their original import disposition before their current status, so a confirmed former-waitlist record stays in the Waitlist column |
| AUDIT-012 | Low | Confirmed | `submittedAt` means "inquiry date" for some sources and "import time" for others; several consumers do not distinguish |
| AUDIT-013 | Medium | Confirmed | Excel `Date` cells are converted with local-time getters in `formatExcelDateValue`, shifting dates one day earlier in U.S. time zones |
| AUDIT-014 | Medium | Confirmed | "Export Excel" is labeled as an inquiry export, includes every record, and cannot be re-imported faithfully |
| AUDIT-015 | Medium | Confirmed | Staff Bookings have no field for invoice, expected revenue, or itemized costs, so Reports revenue is always "Missing" for them |
| AUDIT-016 | Medium | Confirmed | Jobs: Staff Assignment jobs can never be completed, are due on the arrival date, and include cancelled bookings |
| AUDIT-017 | Medium | Confirmed | Staff users live only in each browser's localStorage and are disconnected from Supabase `staff_profiles`; deleted users are re-created automatically |
| AUDIT-018 | Low | Confirmed | Guest counts are parsed three different ways ("40-50", "12 adults", "TBD") |
| AUDIT-019 | Medium | Confirmed | Saving in Inquiry Record Detail always recomputes `status` from the disposition text, discarding any status set elsewhere |
| AUDIT-020 | High | Confirmed | Calendar and Lodging Calendar show cancelled, waitlisted, archived and "Imported"-status records as if they occupy dates and buildings |
| AUDIT-021 | Medium | Requires external verification | The repository defines only `bookings` and `staff_profiles`; every other table, bucket and portal function the code relies on is undocumented in SQL |
| AUDIT-022 | Low | Confirmed | Portal links fall back to `http://localhost:5173` when `VITE_GUEST_PORTAL_BASE_URL` is unset |
| AUDIT-023 | Medium | Confirmed | The frontend never reads the staff role; actions the database forbids look successful |
| AUDIT-024 | Medium | Confirmed | Supported workbook years are hard-coded to 2025–2027 in importers, detectors, menus and the Inquiry Spreadsheet |
| AUDIT-025 | Low | Confirmed | Archive import creates new IDs on every run (`Date.now()`), so re-importing duplicates every archive record |
| AUDIT-026 | Low | Confirmed | A newly created booking is not added to dashboard state, and a seeded form loses its success message |
| AUDIT-027 | Medium (if called cross-origin) | Suspected | `submit-guest-inquiry` has no OPTIONS/CORS handling and minimal date validation, unlike `verify-dev-mode` |
| AUDIT-028 | Low | Requires external verification | Guest-facing inquiry and portal applications are not in this repository; payload compatibility can only be checked one-sidedly |
| AUDIT-029 | Medium | Confirmed | Contract, deposit, insurance and guest-count completion are tracked in three unlinked places |
| AUDIT-030 | Medium | Confirmed | Reports totals include cancelled, waitlisted and still-unconverted inquiry records by default |
| AUDIT-031 | Low | Confirmed | Lodging building lists, aliases and capacities are defined six times and disagree |
| AUDIT-032 | Low | Confirmed | Edit tab offers status "Imported", which no other part of the system interprets, and omits "Archived Visit" |
| AUDIT-033 | Cleanup | Confirmed | Dead or unreachable code that duplicates or contradicts live logic |
| AUDIT-034 | Medium | Confirmed | "Active", "inquiry", "confirmed" and "inactive" are computed differently on every screen |
| AUDIT-035 | Low | Confirmed | A stored `camperDays` value overrides recalculation, even after guests/nights/meals are edited |
| AUDIT-036 | Low | Confirmed | Record-source labels are derived differently, and web-form bookings are counted as "Staff Booking" |
| AUDIT-037 | Low | Requires external verification | Departure day is treated as an occupied day in availability views (convention unconfirmed) |
| AUDIT-038 | Medium | Confirmed | Portal Admin can add tasks and documents but cannot remove, edit, or reopen them; staff document paths depend on `portal_token` |
| AUDIT-039 | Low | Confirmed | Secondary contacts are excluded from the Contacts directory's grouping and search |
| AUDIT-040 | Low | Confirmed | Create Booking derives several text columns from structured fields with different meanings than imports use |
| AUDIT-041 | Cleanup | Confirmed | Documentation disagrees with the code in several places |
| AUDIT-042 | Low | Confirmed | Retreat types: Create Booking's fixed list, imported free text, and an unused normalizer disagree; Reports groups by raw text |
| AUDIT-043 | Medium | Confirmed | Facility tasks in Create Booking have a free-text "assigned to" field that never reaches Jobs |
| AUDIT-044 | Medium | Confirmed | "Fill Test Data" is always visible in the staff create form and, on a seeded form, drops the inquiry link while keeping the guest-conversion target |
| AUDIT-045 | Medium | Confirmed | Booking saves are full-row upserts with no change detection, and the Checklists tab has no save guard, so concurrent or rapid edits can overwrite each other |
| AUDIT-046 | Low | Confirmed | Reports attribute each booking wholly to its start month, so monthly rows and period totals do not reconcile |
| AUDIT-047 | Medium | Confirmed | Reports treat almost any non-empty deposit text as "received" |
| AUDIT-048 | Low | Confirmed | Reports CSV export: unrounded values, no record of the filters used, and unescaped formula-leading text |
| AUDIT-049 | Low | Confirmed | Contacts "delete" and "star" are per-browser and keyed by a derived ID; identity merging is not transitive |
| AUDIT-050 | Low | Confirmed | Portal assignment duplicate checks are client-side only and use title/file-name matching |

### Findings by category

A finding can sit in more than one group (for example, a defect whose fix needs a product decision first).

- **Defects in current repository behavior (D):** 003, 004, 005, 006, 007, 008, 011, 012, 013, 014, 016, 017, 018, 019, 020, 023, 026, 030, 038, 043, 044, 045, 046, 047, 048, 049, 050.
- **Product decisions needed before fixing (P):** 006 (who owns re-imported fields), 014 (export purpose), 015 (revenue for staff bookings), 016 (are assignments tasks), 020 (calendar inclusion), 029 (portal ↔ timeline linkage), 030 (report defaults), 034 (stage names), 035 (stored camper days), 036/042 (taxonomies), 037 (departure day), 043 (facilities as tasks), 046 (month attribution).
- **Maintenance / consolidation (M):** 001, 002, 024, 025, 031, 032, 033, 040, 041, plus the consolidation-only rows in Section 6.
- **External verification gaps (X):** 009 (DB default consequence), 010 (FK cascade), 021, 022, 027, 028, 037, 045 (guest-portal writes), 050 (unique constraints).

<!-- FINDINGS START -->

### AUDIT-001 — `dbRowToBooking` restores only three keys from `raw_data`; other non-column properties and `created_at` are not available after reload

1. **Title:** Properties stored only in `raw_data` are dropped on reload and erased from `raw_data` on the next save; `created_at` is never mapped. (Revised in pass 2 — see Revision log R-1.)
2. **Severity:** Low (currently no observable data loss found; maintenance hazard plus the `created_at` gap that feeds AUDIT-009)
3. **Confidence:** Confirmed (repository behavior)
4. **Affected workflows / records:** Any booking whose writer adds a top-level property with no column. Verified cases: Guest Group Inquiry imports (`inquiryDisposition`), Archive imports (`firstName`, `lastName`), Master imports and `normalizeInquiry` (top-level `linenPieces`), Create Booking (top-level `facilities`), every record (`created_at`).
5. **What is inconsistent:** `bookingToDbRow` stores the whole object in `raw_data` ([src/services/bookingService.js:158](src/services/bookingService.js#L158)), but `dbRowToBooking` restores only `raw_data.rawSpreadsheetData`, `raw_data.inquiryAddress`, and `raw_data.rentalFormDetails` ([src/services/bookingService.js:251-253](src/services/bookingService.js#L251-L253)) and never maps `created_at`.
6. **Evidence and counterevidence (pass 2):** For each verified property a fallback currently preserves the business value:
   - `inquiryDisposition` — every writer that sets it also sets `stageOfGroup` to the same text: guest import ([src/pages/Dashboard.jsx:2783](src/pages/Dashboard.jsx#L2783)) and Inquiry Record Detail ([src/pages/InquiryRecordDetailView.jsx:415-420](src/pages/InquiryRecordDetailView.jsx#L415-L420)); no other screen edits `stageOfGroup` for guest-group records, and `normalizeInquiry` re-derives `inquiryDisposition` from `stageOfGroup` ([src/pages/Dashboard.jsx:1406](src/pages/Dashboard.jsx#L1406)). Net effect today: none.
   - `facilities` — the same array is saved in `rentalFormDetails.facilities` via `...formData` ([src/pages/CreateBooking.jsx:2456-2476](src/pages/CreateBooking.jsx#L2456-L2476)), which is what the Overview reads.
   - `linenPieces` — numeric values are also put into `rentalFormDetails.linenPieces` by the Master importer; non-numeric "Linen Pieces" text survives in `rawSpreadsheetData`.
   - `firstName`/`lastName` — combined `contactName` is persisted; the separate parts survive only in `rawSpreadsheetData` (`First Name`/`Last Name` cells).
   - `created_at` — no fallback; no screen can show creation time, and restores regenerate it (AUDIT-009).
   README already warns about this mapping hazard ([README.md:1505](README.md#L1505)).
7. **End-to-end trace:** writer → `bookingToDbRow` (whole object into `raw_data`) → reload → `dbRowToBooking` (three keys) → next save overwrites `raw_data` without the dropped keys.
8. **Current behavior:** The `raw_data` copy of the listed keys erodes after the first re-save, but the business values remain available through the fallbacks above. The risk is to future fields: a new top-level property will appear to save and then disappear.
10. **Expected behavior:** Every property a writer relies on should have a column or live in `rentalFormDetails`.
11. **Impact:** Maintenance hazard; missing `created_at` in the UI and in backups.
12. **Existing-data implications:** None destructive found. `raw_data ? 'inquiryDisposition'` etc. would show which rows still carry the older keys (Section 8, E-12).
13. **Recommended fix:** Map `created_at` → `createdAt` (read-only). Either move `inquiryDisposition` into `rentalFormDetails` at import time or restore an explicit allow-list from `raw_data`. Do not restore all of `raw_data` (it contains stale copies of column values).
14. **Validation plan:** Add a field-round-trip check (save → reload → compare) for every property listed in Section 3; confirm `createdAt` shows the original creation time after edits.
15. **Related:** AUDIT-009 (backup/restore of `created_at`), AUDIT-002.

---

### AUDIT-002 — Create Booking writes `activities` as an array of objects into the text column `activities`

1. **Title:** Staff-booking activity schedules are written to a `text` column, so the top-level `activities` value changes type across save/reload.
2. **Severity:** Medium
3. **Confidence:** Confirmed (type mismatch); exact stored text **Requires external verification** (PostgREST coerces JSON arrays sent to a `text` column into their JSON text in normal configurations).
4. **Affected workflows / records:** Staff bookings created or edited through Create Booking; Spreadsheet View "Activities" column and global search; Booking Overview activities card; Master re-import merge; Availability matching text.
5. **What is inconsistent:** Create Booking sets top-level `activities` to an array of `{date,time,activity}` rows. The schema documents `activities text` ([src/docs/SQL_SETUP.md:163](src/docs/SQL_SETUP.md#L163)). Imports and the simple edit form treat `activities` as free text. Several readers branch on `Array.isArray(booking.activities)`, which can never be true after a reload.
6. **Evidence:**
   - Writer: [src/pages/CreateBooking.jsx:2398-2405](src/pages/CreateBooking.jsx#L2398-L2405) (`activities: formData.activities.filter(...)`).
   - Persistence: [src/services/bookingService.js:115](src/services/bookingService.js#L115) `activities: booking.activities || ""` (no serialization), [src/services/bookingService.js:202](src/services/bookingService.js#L202) reads it back as-is.
   - Readers that assume array: [src/pages/Dashboard.jsx:2018](src/pages/Dashboard.jsx#L2018) (`Array.isArray(existing.activities) ? existing.activities : ...` in `prepareMasterImportUpdates`), [src/pages/Dashboard.jsx:672-681](src/pages/Dashboard.jsx#L672-L681) (`BookingActivitiesOverview` falls back to `booking.activities` and treats non-arrays as "legacy" text).
   - Readers that assume text: [src/pages/SpreadsheetView.jsx:617](src/pages/SpreadsheetView.jsx#L617), [src/pages/SpreadsheetView.jsx:1361](src/pages/SpreadsheetView.jsx#L1361) (`String(value)` for search), [src/pages/Dashboard.jsx:3677](src/pages/Dashboard.jsx#L3677) (`createBookingEditFormState` → `formData.activities.trim()` at [src/pages/Dashboard.jsx:3815](src/pages/Dashboard.jsx#L3815)).
7. **End-to-end trace:** Create Booking → `upsertBooking` → `activities` array sent to PostgREST for a `text` column → stored as JSON text (e.g. `[{"date":"2026-09-18","time":"19:00","activity":"Fire pit"}]`) → `dbRowToBooking` returns a string → Overview: `details.activities` (array inside `rentalFormDetails`) is preferred, so the card usually renders correctly, but if `details.activities` is empty the raw JSON string is shown as the "legacy" activity text → Spreadsheet "Activities" column displays the JSON string.
8. **Current behavior:** Staff bookings with activities display a JSON string in the Master Spreadsheet "Activities" column and in exports/search derived from it. The `Array.isArray(existing.activities)` branch in the Master import merge is dead after reload.
9. **Reproduction:** Create a staff booking with one activity row → open Master Spreadsheet → enable the Activities column → observe JSON text (verify in a test project).
10. **Expected behavior:** The top-level `activities` column should hold a human-readable summary (as `meals`, `foodAllergies`, `buildingsRooms` already do via `build*Summary` helpers), and the structured rows should live only in `rentalFormDetails.activities` (where they are already saved via `...formData`).
11. **Impact:** Misleading UI; unreliable type checks; possible write failure if a stricter PostgREST/DB configuration rejects the array (requires verification).
12. **Existing-data implications:** Existing staff bookings may have JSON text in `bookings.activities`. A repair could regenerate a text summary from `raw_data->'rentalFormDetails'->'activities'`.
13. **Recommended fix:** In `CreateBooking.handleSubmit`, build an `activitiesSummary` string (like `buildMealsSummary`) for top-level `activities`; keep the array in `rentalFormDetails.activities`. Remove the dead `Array.isArray(existing.activities)` branch at Dashboard.jsx:2018 once the type is fixed.
14. **Validation plan:** Create/edit a staff booking with 0, 1, and several activities; reload; confirm the Spreadsheet column shows readable text, the Overview shows the structured rows, and the simple edit form never receives an array.
**Pass 2 note:** The type mismatch is repository behavior. What PostgREST actually stores for an array sent to a `text` column, and therefore what the Spreadsheet displays, is unverified runtime behavior (Section 8, E-1/E-11). If it is stored as JSON text, the Spreadsheet column would show that text; the Overview is unaffected because it reads `rentalFormDetails.activities` first.
15. **Related:** AUDIT-001, AUDIT-005.

---

### AUDIT-003 — Master-imported bookings keep two copies of many fields; the Edit tab updates one copy, while Contacts, Reports and the Overview read the other

1. **Title:** Edits made on the Booking Detail "Edit" tab to Master-imported bookings are ignored by Contacts, Reports and parts of the Overview (dual-copy root cause).
2. **Severity:** High
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Master 2025/2026/2027 imported bookings edited through `BookingDetailsEditForm` (the Edit tab used for every record whose source is not "Staff Booking", [src/pages/Dashboard.jsx:7008-7019](src/pages/Dashboard.jsx#L7008-L7019)) and status changes made from the Inquiry Pipeline. Consumers: Contacts view, Reports (guest counts, nights, meals, camper days, deposits), Booking Overview (nights, meals, rates, deposit).
5. **What is inconsistent:** `normalizeMasterImportRow` writes the same facts twice: top-level columns (`contactName`, `email`, `phone`, `organizationName`, `startDate`, `endDate`, `retreatType`, `attendeeCount`, `nights`, `mealCount`, `deposit`, `depositReceived`, `guestRate`, `minPayingGuests`, `maxPayingGuests`) and `rentalFormDetails` copies (`contactName`, `email`, `phone`, `organizationName`, `startDate`, `endDate`, `retreatType`, `status`, `approxTotalGuests`, `numberOfNights`, `numberOfMeals`, `depositAmount`, `depositReceivedDate`, `adultRateQuoted`, `minimumGuarantee`, `maximumGuarantee`, `notes`) ([src/pages/Dashboard.jsx:1813-1876](src/pages/Dashboard.jsx#L1813-L1876)). `BookingDetailsEditForm.handleSubmit` updates only the top-level copies plus the secondary-contact keys in `rentalFormDetails` ([src/pages/Dashboard.jsx:3781-3829](src/pages/Dashboard.jsx#L3781-L3829)). Several consumers read the `rentalFormDetails` copy first.
6. **Evidence — consumers that prefer the stale copy:**
   - Contacts: [src/pages/ContactsView.jsx:193-226](src/pages/ContactsView.jsx#L193-L226) (`getBookingContactSnapshot`: `details.contactName`, `details.organizationName`, `details.email`, `details.phone`, `details.mailingAddress`, `details.retreatType` first); [src/pages/ContactsView.jsx:276-282](src/pages/ContactsView.jsx#L276-L282) (chronology: `details.startDate` first); [src/pages/ContactsView.jsx:673-688](src/pages/ContactsView.jsx#L673-L688) (history dates: `details.startDate`/`details.endDate` first). By contrast [src/pages/ContactsView.jsx:787-792](src/pages/ContactsView.jsx#L787-L792) reads top-level `status` first — inconsistent within the same view.
   - Reports: [src/pages/ReportsView.jsx:246-337](src/pages/ReportsView.jsx#L246-L337) (`getReportsGuestCountDetails` uses `details.actual*`, then `details.approxTotalGuests`, and only then top-level `attendeeCount`; Master import always sets `details.approxTotalGuests`); [src/pages/ReportsView.jsx:343-348](src/pages/ReportsView.jsx#L343-L348) (nights: `details.numberOfNights` first); [src/pages/ReportsView.jsx:350-378](src/pages/ReportsView.jsx#L350-L378) (meals: `details.numberOfMeals` first); [src/pages/ReportsView.jsx:544-559](src/pages/ReportsView.jsx#L544-L559) (deposit: `details.depositReceivedDate`, `details.depositAmount` first). Camper days are derived from these ([src/pages/ReportsView.jsx:465-534](src/pages/ReportsView.jsx#L465-L534)).
   - Booking Overview: [src/pages/Dashboard.jsx:5622-5660](src/pages/Dashboard.jsx#L5622-L5660) (`numberOfNights`, `numberOfMeals`, `adultRate`, `depositAmount`, `depositReceived` read `details.*` first), while the summary strip reads top-level `attendeeCount`, dates and `roomName` ([src/pages/Dashboard.jsx:5684-5694](src/pages/Dashboard.jsx#L5684-L5694)) — so one screen can show two different values for the same booking.
   - Create Booking's edit state also prefers `details.*` ([src/pages/CreateBooking.jsx:1327-1380](src/pages/CreateBooking.jsx#L1327-L1380)); this does not currently bite Master records because they never open in Create Booking, but it would if routing changed.
7. **End-to-end trace:** Master import → both copies equal → staff open Booking Detail → Edit tab → change "# Nights" from 2 to 3 and contact email → `saveBookingEdits` → `upsertBooking` → columns updated, `raw_data.rentalFormDetails.numberOfNights` and `.email` unchanged → Reports, Contacts and Overview "Nights" continue to show 2 and the old email; Master Spreadsheet (top-level) shows 3 and the new email.
8. **Current behavior:** Corrections to Master bookings appear in the Spreadsheet and Edit tab but not in Contacts, Reports totals (guests, nights, meals, camper days, deposits received), or the Overview detail cards. Contacts may also group the record under the old email/phone identity.
9. **Reproduction:** (Hypothetical) Import Master 2026 row "Test Camp", contact `a@example.com`, 40 guests, 2 nights → Edit tab → email `b@example.com`, attendee count 55, nights 3 → Save → Contacts still shows `a@example.com`; Reports "Guests" for the period still counts 40 and camper days use 2 nights.
10. **Expected behavior:** Every consumer should read the copy that every edit path writes (top-level), or every edit path must keep both copies in sync. Which copy is canonical is a design decision; the code comments in Reports ("Current Staff Booking fields split children...") suggest `rentalFormDetails` was intended as canonical for Staff Bookings only.
11. **Impact:** Incorrect reporting (guest totals, camper days, deposits), contacts shown with outdated details, internally inconsistent Overview.
12. **Existing-data implications:** Any Master booking edited via the Edit tab may already have diverged copies. A query comparing column vs `raw_data->'rentalFormDetails'` values (`contact_name` vs `->>'contactName'`, `email`, `phone`, `start_date` vs `->>'startDate'`, `nights` vs `->>'numberOfNights'`, `attendee_count` vs `->>'approxTotalGuests'`) would list affected rows. A repair must decide, per field, which side is newer — `updated_at` alone cannot tell which copy staff edited.
13. **Recommended fix:** Coordinated change: (a) in `BookingDetailsEditForm.handleSubmit`, when the booking has `rentalFormDetails`, mirror each edited field into its `rentalFormDetails` counterpart (contactName, email, phone, organizationName, startDate, endDate, retreatType, status, approxTotalGuests, numberOfNights, numberOfMeals, depositAmount, depositReceivedDate, adultRateQuoted, min/max guarantees, notes); and/or (b) change Contacts (`getBookingContactSnapshot`, `getBookingChronologyValue`, `getBookingStartDate`, `getBookingEndDate`) to read top-level first. Reports and Overview need a single documented precedence rule shared via one helper module (see Section 6).
14. **Validation plan:** For a Master booking, a Staff booking, and a Guest Group Inquiry record: edit each listed field through every edit path (Edit tab, Create Booking edit, Pipeline status, Inquiry Record Detail) and confirm Spreadsheet, Overview, Contacts and Reports agree. Then re-import the same Master sheet and confirm the intended precedence (AUDIT-006).
**Pass 2 note (narrowing):** Only records whose `rentalFormDetails` carries the duplicated keys are affected — Master imports. Staff Bookings are edited only in Create Booking, which writes both copies; Guest Group Inquiry imports have no `rentalFormDetails`, so the Edit tab and Inquiry Record Detail are safe for them. Status divergence has no visible effect today (every status consumer reads the top-level column first). A Master re-import rewrites both copies from the sheet (AUDIT-006), which hides the divergence for any field the sheet fills.
15. **Related:** AUDIT-006 (re-import overwrites both copies), AUDIT-011 (Pipeline column precedence), AUDIT-019 (Inquiry Record Detail), AUDIT-049 (Contacts identity).

---

### AUDIT-004 — A pending guest-inquiry conversion is not cleared when staff start a different booking, so the wrong guest inquiry can be marked "converted"

1. **Title:** Stale `guestBookingSource` can link an unrelated new booking to a guest inquiry.
2. **Severity:** Medium (revised from High in pass 2 — requires a specific abandon-then-start sequence in one page session; see R-2)
3. **Confidence:** Confirmed (state flow traced; not reproduced at runtime)
4. **Affected workflows / records:** Guest Inquiries → Create Booking; Inquiry Spreadsheet → "Start booking"; `guest_inquiries.status` / `converted_booking_id`.
5. **What is inconsistent:** `startBookingFromGuestInquiry` sets `bookingFormSeed` and `guestBookingSource`. `startBookingFromInquiry` (called from the Inquiry Spreadsheet, [src/pages/InquirySpreadsheetView.jsx:549](src/pages/InquirySpreadsheetView.jsx#L549)) sets only `bookingFormSeed`. `handleActiveViewChange` (sidebar navigation) clears neither. `onBookingCreated` marks whatever `guestBookingSource` holds.
6. **Evidence:** [src/pages/Dashboard.jsx:9537-9549](src/pages/Dashboard.jsx#L9537-L9549) (`startBookingFromInquiry`), [src/pages/Dashboard.jsx:9551-9575](src/pages/Dashboard.jsx#L9551-L9575), [src/pages/Dashboard.jsx:9929-9950](src/pages/Dashboard.jsx#L9929-L9950). Only the sidebar "Form" button and the two home "New Booking" buttons reset it.
   **Conditions that narrow it (pass 2):** a full page reload clears the state; starting another *guest* inquiry overwrites it with the correct ID; the sidebar "Form" and home "New Booking" buttons clear it. The defect needs: open a guest inquiry in the form → leave without saving via a sidebar view link → start a booking from the Inquiry Spreadsheet → save. AUDIT-044 adds a second trigger (Fill Test Data on a guest-seeded form).
8. **Current behavior:** In that sequence the guest inquiry is updated to `status='converted'` with `converted_booking_id` pointing at the unrelated booking. If the guest inquiry was already converted, its existing `converted_booking_id` is overwritten.
10. **Expected behavior:** Only the inquiry that seeded the form should be marked converted.
11. **Impact:** A real guest request can disappear from "New Requests".
12. **Existing-data implications:** Compare `guest_inquiries.organization_name` with the linked booking (Section 8, E-14).
13. **Recommended fix:** Carry the guest inquiry ID inside the seed itself (e.g., `bookingFormSeed.guestInquiryId`) and mark conversion only from that; or clear `guestBookingSource` in `startBookingFromInquiry` and whenever the view leaves "Form".
14. **Validation plan:** Reproduce the sequence; G1 stays pending. Regression: normal guest conversion still marks it.
15. **Related:** AUDIT-008, AUDIT-044.

---

### AUDIT-005 — `buildings_rooms` has four writers with incompatible formats; Create Booking's edit save discards Housing-tab detail

1. **Title:** The lodging summary text is rebuilt differently by each writer, and a Create Booking edit drops camping and room-level housing from it.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Staff bookings (Create Booking edit + Housing tab); Master imports; Lodging Calendar, Reports housing usage, Dashboard home building tags, Master Spreadsheet "Buildings / Rooms".
5. **What is inconsistent:**
   - Create Booking writes `buildingsRooms = buildLodgingSummary(formData)` from **7** totals only (`lodgingBethel`, `lodgingHebronThird`, `lodgingHebronBunks`, `lodgingDothan`, `lodgingAjalon`, `lodgingCapernaum`, `lodgingGuestHouse`) — [src/pages/CreateBooking.jsx:310-358](src/pages/CreateBooking.jsx#L310-L358), [src/pages/CreateBooking.jsx:1740-1755](src/pages/CreateBooking.jsx#L1740-L1755), [src/pages/CreateBooking.jsx:2392-2393](src/pages/CreateBooking.jsx#L2392-L2393).
   - The Housing tab writes a richer format with floor/room breakdowns, `Camping` (Tent/RV), and `"<Building>: count unknown"` entries — [src/components/BookingHousingTab.jsx:579-661](src/components/BookingHousingTab.jsx#L579-L661) — and then **appends the camping summary a second time** ([src/components/BookingHousingTab.jsx:1059-1078](src/components/BookingHousingTab.jsx#L1059-L1078) + the save at [src/components/BookingHousingTab.jsx:1160-1166](src/components/BookingHousingTab.jsx#L1160-L1166): `buildingsRooms: [buildingsRooms, campingSummary].filter(Boolean).join("; ")`). Because the `camping` row has `rooms`, `buildLodgingSummary` already emits `Camping: Tent: 2, RV: 1`, so the result is `...; Camping: Tent: 2, RV: 1; Tent: 2, RV: 1`.
   - Master import writes the spreadsheet text with `GH` expanded to `Guest House` ([src/pages/Dashboard.jsx:1779](src/pages/Dashboard.jsx#L1779)).
   - The Edit tab writes free text ([src/pages/Dashboard.jsx:3810](src/pages/Dashboard.jsx#L3810)).
   - Create Booking has no Camping field at all, so camping can only be entered on the Housing tab.
7. **End-to-end trace:** Staff booking → Housing tab: Bethel rooms 1–2, Camping Tent 2 → `buildings_rooms = "Bethel: Upper Floor - Room 1: 3, Room 2: 4; Camping: Tent: 2; Tent: 2"`, `rentalFormDetails.lodgingCampingTent = "2"` → later, staff open the Edit tab (Create Booking edit) to change a phone number → save → `buildings_rooms = "Bethel: 7"`; camping and room breakdown vanish from the text column (they remain in `rentalFormDetails`, which the Housing tab and Dashboard home read, but the Spreadsheet, Lodging Calendar and Reports text-matching do not).
8. **Current behavior:** After any Create Booking edit, Spreadsheet "Buildings / Rooms" and Lodging Calendar display text lose camping and room detail; Reports' text-based "found in text" usage for Camping disappears. Before such an edit, camping text is duplicated.
10. **Expected behavior:** One shared summary builder used by both Create Booking and the Housing tab, including every lodging field either screen can set.
11. **Impact:** Misleading lodging text; inconsistent housing reports between bookings depending on which screen saved last.
12. **Existing-data implications:** Staff bookings saved by the Housing tab with camping have the duplicated suffix. Bookings edited in Create Booking after Housing-tab edits have truncated text; the structured values in `raw_data->'rentalFormDetails'` are intact, so the text can be regenerated.
13. **Recommended fix:** Move `housingRows` and one `buildLodgingSummary` into a shared module (e.g. `src/constants/lodgingConstants.js` + `src/utils/lodgingUtils.js`); call it from `CreateBooking.handleSubmit` and `BookingHousingTab.handleSave`; delete the separate `campingSummary` append in the Housing tab.
14. **Validation plan:** Housing tab with room breakdown + camping → save → Create Booking edit → save → confirm `buildings_rooms` unchanged apart from intended edits; confirm no duplicated camping text; Lodging Calendar, Reports and Dashboard home show the same buildings.
15. **Related:** AUDIT-007 (`roomName` staleness), AUDIT-031 (lodging constants).

---

### AUDIT-006 — Re-importing a Master sheet resets staff-set status and waitlist (and any field the sheet populates); the dialog says staff-only fields are retained

1. **Title:** Master re-import always re-derives `status`/`waitlist` from the sheet and overwrites every field the sheet fills in. (Narrowed in pass 2 — see R-3.)
2. **Severity:** High
3. **Confidence:** Confirmed
4. **Affected workflows / records:** "Import Master 2025/2026/2027" and "Import Everything" when a row matches an existing Master booking (by group name + stay dates, with contact as tie-breaker).
5. **What is inconsistent:** `prepareMasterImportUpdates` returns `{ ...existing, ...populated }`, where `populated` keeps only incoming top-level values that are not `""`, `null` or `undefined`, and `rentalFormDetails: { ...existing.rentalFormDetails, ...populatedDetails }` with the same filter ([src/pages/Dashboard.jsx:1993-2019](src/pages/Dashboard.jsx#L1993-L2019)).
   **Always overwritten** (the importer always produces a non-empty value): `status` — `getMasterImportStatus` falls back to `"Confirmed"` for 2025/2026 and `"Inquiry"` for 2027 when the sheet has no stage/confirmation/cancellation information ([src/pages/Dashboard.jsx:1720-1732](src/pages/Dashboard.jsx#L1720-L1732)); `waitlist` (`"Yes"`/`"No"`); `roomName` (`"Unassigned"` when the Buildings/Rooms cell is blank, [src/pages/Dashboard.jsx:1895](src/pages/Dashboard.jsx#L1895)); `sourceType`, `detectedImportType`, `sourceSheet`, `sourceRowNumber`, `rawSpreadsheetData`; `rentalFormDetails.status`, `importWarnings` (array), `importedGuestCountKind`, `imported*Text`/`imported*Status` keys.
   **Overwritten only when the sheet cell is filled:** contact fields, notes, meals, lodging text (`buildingsRooms`), counts, financial columns, and the corresponding `rentalFormDetails` dates/counts.
   **Kept:** `id`, existing `submittedAt`, `checklists`, `programLogisticsAssignments`, Housing-tab room/floor fields, `housingUsage`, `incidentNotes`, anything the sheet never carries.
   The confirmation dialog says "Existing booking IDs and staff-only fields are retained" ([src/pages/Dashboard.jsx:8211](src/pages/Dashboard.jsx#L8211), [src/pages/Dashboard.jsx:8607](src/pages/Dashboard.jsx#L8607)). README describes the populated-value merge accurately ([README.md:297](README.md#L297)); the dialog is the part that misleads, and the status/waitlist/roomName behavior goes beyond "populated cells win".
7. **End-to-end trace:** Staff cancel "Test Camp" in the app (`status=Cancelled`) → office sheet not updated → re-import → match → `getMasterImportStatus` sees no cancellation in the sheet → `status=Confirmed`, `waitlist=No`; if the sheet's Buildings/Rooms cell is blank, `roomName="Unassigned"` while `buildingsRooms` keeps the Housing-tab text.
8. **Current behavior:** App-side status changes on Master bookings are reverted by every re-import; staff edits to any field the sheet also fills are replaced by the sheet value. Edits to fields the sheet leaves blank survive.
10. **Expected behavior:** Product decision (Q-1): whether the spreadsheet or the app owns status, contacts and notes after import. At minimum the dialog text should state what will be refreshed.
11. **Impact:** Cancelled groups can reappear as Confirmed on the Dashboard home, Portal eligibility and calendars.
12. **Existing-data implications:** Not detectable after the fact without an audit trail; backups taken before a re-import are the only record of prior values.
13. **Recommended fix:** In `prepareMasterImportUpdates`, do not overwrite `status`/`waitlist` when the incoming status came from the year-default fallback (return a `statusSource` flag from `getMasterImportStatus`); do not overwrite `roomName` with `"Unassigned"`; optionally skip fields recorded in `rentalFormDetails.staffEditedFields`. Correct the dialog text.
14. **Validation plan:** Edit status, contact, notes and housing on a Master booking; re-import a sheet where those cells are (a) blank and (b) filled; confirm only the intended fields change.
15. **Related:** AUDIT-003, AUDIT-007.

---

### AUDIT-007 — `roomName` is never updated by the Housing tab, so stale imported lodging text keeps buildings "assigned" everywhere

1. **Title:** An imported building assignment cannot be removed; Lodging Calendar, Reports, Dashboard home and the Overview summary keep using the stale `roomName`.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Master-imported bookings (where `roomName` = imported Buildings/Rooms text) and any record whose `roomName` was set in the Edit tab; Housing tab; Lodging Calendar; Reports housing; Dashboard home tags / "needs housing"; Booking Overview summary.
5. **What is inconsistent:** Master import sets `roomName: lodgingText || "Unassigned"` and `buildingsRooms: lodgingText` ([src/pages/Dashboard.jsx:1895](src/pages/Dashboard.jsx#L1895)). The Housing tab saves only `buildingsRooms` and `rentalFormDetails` (never `roomName`). Readers union both fields:
   - Lodging Calendar `getBookingLodgingSegments` uses `[buildingsRooms, roomName]` ([src/pages/LodgingCalendarView.jsx:288-320](src/pages/LodgingCalendarView.jsx#L288-L320)).
   - Reports `getReportsHousingText` uses `[roomName, buildingsRooms]` ([src/pages/ReportsView.jsx:733-738](src/pages/ReportsView.jsx#L733-L738)).
   - Dashboard home `getDashboardHomeBuildingTags`/`dashboardHomeBookingNeedsHousing` use both ([src/pages/Dashboard.jsx:7683-7793](src/pages/Dashboard.jsx#L7683-L7793)).
   - Housing tab itself re-detects usage from `roomName` + `buildingsRooms` every time it opens (`importedBookingUsesHousingRow`, [src/components/BookingHousingTab.jsx:305-363](src/components/BookingHousingTab.jsx#L305-L363)); `savedUsage[row.field] === false` is never honored — only `=== true` is checked.
   - Overview summary shows `roomName` before `buildingsRooms` ([src/pages/Dashboard.jsx:5684-5690](src/pages/Dashboard.jsx#L5684-L5690)).
7. **End-to-end trace:** Import row "Bethel, Dothan" → `roomName = buildingsRooms = "Bethel, Dothan"` → Housing tab: staff enter Bethel 40, uncheck Dothan → save → `buildingsRooms = "Bethel: 40"`, `housingUsage.lodgingDothan = false`, `roomName` still `"Bethel, Dothan"` → Lodging Calendar marks Dothan occupied; reopening the Housing tab re-checks Dothan (detected from `roomName`) and the next save writes `Dothan: count unknown` back.
8. **Current behavior:** False "occupied" signals for buildings that were removed; the Overview summary shows the old text.
10. **Expected behavior:** After the Housing tab is used, it should be the source of truth for lodging; `roomName` should be cleared or synchronized, and an explicit `false` in `housingUsage` should override text detection.
11. **Impact:** Misleading availability (buildings appear unavailable), incorrect housing reports.
12. **Existing-data implications:** Master bookings edited in the Housing tab still carry the original `room_name`. A repair could set `room_name` to the new `buildings_rooms` (or "Unassigned") where `raw_data->'rentalFormDetails'->'housingUsage'` exists.
13. **Recommended fix:** In `BookingHousingTab.handleSave`, also set `roomName` (to the new summary or `"Unassigned"`); in `getInitialKnownUsage`, honor `savedUsage[row.field] === false` before `detectedFromImport`. Consider reading `roomName` only when `buildingsRooms` is empty in Lodging Calendar/Reports/Dashboard.
14. **Validation plan:** Imported booking with two buildings → remove one in Housing tab → verify Lodging Calendar, Reports, Dashboard tags, Overview all show one building; reopen Housing tab and confirm the removed building stays unchecked.
15. **Related:** AUDIT-005, AUDIT-006 (re-import resets `roomName`).

---

### AUDIT-008 — Failure to mark a guest inquiry "converted" is logged only to the console

1. **Title:** Booking saves but the guest inquiry silently stays "New Request", inviting a duplicate booking.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Guest Inquiries → Create Booking; `guest_inquiries.status`, `converted_booking_id`.
5. **What is inconsistent:** `onBookingCreated` catches the `markGuestInquiryConverted` error and only calls `console.error` ([src/pages/Dashboard.jsx:9929-9950](src/pages/Dashboard.jsx#L9929-L9950)); Create Booking then shows its normal success state.
8. **Current behavior:** If the update fails (RLS denies update on `guest_inquiries`, network error, or `.single()` finds no row), staff see success, the inquiry remains in "New Requests", and another staff member may convert it again.
10. **Expected behavior:** Staff should be told the booking was created but the inquiry was not marked converted, with a retry.
11. **Impact:** Duplicate bookings; inconsistent inquiry queue.
12. **Existing-data implications:** Look for `guest_inquiries` rows with `status='pending'` whose organization/dates match an existing Staff Booking with `raw_data->'rentalFormDetails'->>'sourceInquiryId' = guest_inquiries.id`.
13. **Recommended fix:** Surface the error (alert or banner) from `onBookingCreated`; optionally retry; and have the Guest Inquiries view treat a pending inquiry that already has a matching `sourceInquiryId` booking as converted.
14. **Validation plan:** Simulate a failure (e.g., revoke update in a test project) and confirm the message; normal path still marks converted.
**Pass 2 note (strengthened):** `markGuestInquiryConverted` uses `.update(...).select().single()` ([src/services/guestInquiryService.js:73-114](src/services/guestInquiryService.js#L73-L114)); an RLS-filtered update that matches zero rows therefore surfaces as an error (no single row) rather than a silent success, so the failure is detected — it is just not shown to staff.
15. **Related:** AUDIT-004.

---

### AUDIT-009 — Backup/restore does not preserve `portal_token`, `created_at`, or `raw_data` beyond three keys

1. **Title:** A "Replace" restore regenerates every booking's guest-portal token, breaking all previously sent portal links.
2. **Severity:** High
3. **Confidence:** Confirmed (code path); exact DB default behavior **Requires external verification**.
4. **Affected workflows / records:** Backup page (Create Backup, Safe Merge, Replace); every booking with a guest portal link.
5. **What is inconsistent:** The backup payload is the frontend object from `fetchBookings()` → `dbRowToBooking` ([src/components/DashboardBackups.jsx:476-478](src/components/DashboardBackups.jsx#L476-L478)), which includes `portalToken` but not `created_at` or the full `raw_data`. Restore writes through `upsertBookings` → `bookingToDbRow`, which **never writes `portal_token`** ([src/services/bookingService.js:84-161](src/services/bookingService.js#L84-L161)). In Replace mode, all rows are deleted first ([src/components/DashboardBackups.jsx:680](src/components/DashboardBackups.jsx#L680)), so re-inserted rows receive a new `portal_token` from the column default `encode(gen_random_bytes(16),'hex')` ([src/docs/SQL_SETUP.md:133](src/docs/SQL_SETUP.md#L133)) and a new `created_at`. The automatic rollback path has the same problem ([src/components/DashboardBackups.jsx:778-786](src/components/DashboardBackups.jsx#L778-L786)).
7. **End-to-end trace:** Backup JSON contains `portalToken: "abc…"` → Replace → `deleteAllBookings()` → `upsertBookings(chunk)` → row inserted without `portal_token` → DB default generates `"def…"` → guests' `/?portal=abc…` links no longer resolve.
8. **Current behavior:** After Replace (or a failed Replace that rolls back), every guest portal link changes. `created_at` becomes the restore time. Any `raw_data` keys other than `rawSpreadsheetData`, `inquiryAddress`, `rentalFormDetails` are dropped (see AUDIT-001). Safe Merge keeps existing tokens for rows that still exist.
10. **Expected behavior:** A backup intended for full recovery should round-trip every persisted column, including `portal_token` and `created_at`.
11. **Impact:** Workflow failure for guests; loss of record-creation history.
12. **Existing-data implications:** If a Replace restore has ever been run, previously sent portal links are already invalid; check for `created_at` clustered at a single restore timestamp.
13. **Recommended fix:** Back up raw rows (`select *`) rather than mapped objects, or add `portal_token` (and `created_at`) to a restore-specific mapper used only by `DashboardBackups`. Keep `bookingToDbRow` free of `portal_token` for normal saves so ordinary edits never overwrite it. Bump `BACKUP_SCHEMA_VERSION` and keep a reader for version 1.
14. **Validation plan:** In a test project, back up, Replace, and confirm `portal_token`, `created_at`, and `raw_data` are byte-identical for a sample of rows; confirm portal links still work.
**Pass 2 note:** Separated evidence. *Repository behavior (confirmed):* the restore path never writes `portal_token` or `created_at`, and Replace deletes before re-inserting. *Database consequence (documented, not verified):* new tokens come from the column default shown in `SQL_SETUP.md`; README states the same consequence ([README.md:1233-1245](README.md#L1233-L1245)). Likelihood is reduced by README's explicit instruction not to use Replace on production, but the in-app coverage list says "Stable booking IDs used for restore" and "Checklists and booking-level metadata" ([src/components/DashboardBackups.jsx:935-942](src/components/DashboardBackups.jsx#L935-L942)) and the Replace card does not mention portal links. Merge keeps tokens for rows that still exist; only re-inserted rows get new ones. Staff document Storage paths are derived from the token (AUDIT-038), so a token change would also affect those files.
15. **Related:** AUDIT-001, AUDIT-010.

---

### AUDIT-010 — Backups cover only `bookings`; Replace restore deletes bookings that portal rows depend on

1. **Title:** Guest inquiries, portal checklist items, portal documents, uploaded files and browser-stored staff users are not in the backup, and Replace may cascade-delete or orphan portal data.
2. **Severity:** High (if the FK cascades) / Medium (if it restricts) — **Requires external verification**
3. **Confidence:** Coverage gap Confirmed; cascade behavior Requires external verification.
4. **Affected workflows / records:** Backup page; `guest_inquiries`, `portal_checklist_items`, `portal_documents`, Storage bucket `portal-uploads`, localStorage keys `toahNipiStaffUsers`, `toahNipiCurrentStaffUserId`, starred contacts/bookings, saved spreadsheet views.
5. **What is inconsistent:** The page states only booking records are protected ([src/components/DashboardBackups.jsx:1462-1478](src/components/DashboardBackups.jsx#L1462-L1478)) — that disclosure is accurate — but Replace calls `deleteAllBookings()` ([src/services/bookingService.js:327-336](src/services/bookingService.js#L327-L336)) on a table referenced by `portal_checklist_items.booking_id` and `portal_documents.booking_id` (embedded selects at [src/pages/PortalAdminView.jsx:751-820](src/pages/PortalAdminView.jsx#L751-L820) imply a foreign key). Those tables are not defined anywhere in the repository.
8. **Current behavior (by FK behavior):** `ON DELETE CASCADE` → Replace permanently deletes every portal checklist item and document row, which the backup cannot restore; uploaded files remain in Storage, orphaned. `RESTRICT`/`NO ACTION` → `deleteAllBookings` fails for bookings with portal rows; with RLS and delete-by-filter semantics the result may be a partial delete, and the restore then fails verification and attempts rollback. `SET NULL` → portal rows lose their booking link.
10. **Expected behavior:** Either back up and restore all dependent tables in FK order, or block Replace when dependent rows exist.
11. **Impact:** Potential permanent loss of guest-submitted checklist responses and document records.
12. **Existing-data implications:** If Replace has been used, check for portal rows/files with no matching booking.
13. **Recommended fix:** Verify the FK definition; extend the backup envelope with `guest_inquiries`, `portal_checklist_items`, `portal_documents` (and a Storage manifest), restoring parents before children; or make Replace upsert-and-delete-missing instead of delete-all.
14. **Validation plan:** In a test project with portal rows, run Replace and confirm portal rows and file links survive.
**Pass 2 note:** The cascade behavior is taken from README's description of production ([README.md:786-788](README.md#L786-L788), [README.md:1241](README.md#L1241)); no schema in the repository confirms it. The repository-confirmed facts are: backups contain only booking objects, and Replace calls `deleteAllBookings()` first.
15. **Related:** AUDIT-009, AUDIT-021 (missing schema).

---

### AUDIT-011 — The Inquiry Pipeline places records by their original import disposition before their current status, so a confirmed former-waitlist record stays in the Waitlist column

1. **Title:** Pipeline column precedence uses `inquiryDisposition`/`sourceInquiryDisposition` ahead of current status. (Rewritten in pass 2 — the original waitlist-flag claim was wrong; see R-4.)
2. **Severity:** Low (affects only the Pipeline board, whose sidebar entry is hidden; `/inquiry-pipeline` remains reachable by URL)
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Inquiry Pipeline; guest-group inquiry records imported as "Waitlist"; Staff Bookings created from such inquiries (they carry `rentalFormDetails.sourceInquiryDisposition`).
5. **What is inconsistent:**
   - **Correction:** Each Pipeline action passes an explicit `waitlist` value — `markContractSent`, `markConfirmed`, `returnToInquiry` set `"No"`; `moveToWaitlist` sets `"Yes"` ([src/pages/InquiryPipeline.jsx:755-815](src/pages/InquiryPipeline.jsx#L755-L815)) — and Dashboard's handler keeps that value (`waitlist: nextStatus === "Waitlist" ? "Yes" : booking.waitlist`, [src/pages/Dashboard.jsx:10028-10037](src/pages/Dashboard.jsx#L10028-L10037)). The saved `status`/`waitlist` pair is therefore consistent, even though `getConsistentWaitlistState` is not called. There is no Pipeline "cancel" action.
   - **Remaining defect:** `getInquiryPipelineColumnKey` checks `waitlist === "yes"` **or** `status` contains "wait" **or** `disposition` contains "waitlist" before checking confirmed/contract ([src/pages/InquiryPipeline.jsx:442-490](src/pages/InquiryPipeline.jsx#L442-L490)). `disposition = booking.inquiryDisposition || details.sourceInquiryDisposition`, and `inquiryDisposition` is re-derived from `stageOfGroup` on load ([src/pages/Dashboard.jsx:1406](src/pages/Dashboard.jsx#L1406)), which Pipeline actions do not change.
7. **End-to-end trace:** Guest-group record with disposition "Waitlist" → Pipeline "Mark Confirmed" → saved `status=Confirmed`, `waitlist=No`, `contractReturnedDate=today`, `stageOfGroup` still "Waitlist" → reload → column key "waitlist". Other screens (Dashboard home, Portal eligibility) read status/waitlist and treat it as confirmed — so the Pipeline disagrees with them.
8. **Current behavior:** Confirmed groups that started on the waitlist stay in the Pipeline's Waitlist column; the same applies to Staff Bookings converted from waitlisted inquiries.
10. **Expected behavior:** Column placement should follow the current status; the original disposition can be shown as a label.
13. **Recommended fix:** In `getInquiryPipelineColumnKey`, use the disposition only when `status` is empty or still the disposition-derived value; optionally route Pipeline saves through `getConsistentWaitlistState` for uniformity. Decide whether the hidden route should stay reachable.
14. **Validation plan:** Waitlist record → Mark Confirmed → reload → Confirmed column; Staff Booking from a waitlisted inquiry appears in its status column.
15. **Related:** AUDIT-019 (Inquiry Record Detail re-derives status from the same disposition), AUDIT-034.

---
### AUDIT-012 — `submittedAt` means "inquiry date" for some sources and "import time" for others; several consumers do not distinguish

1. **Title:** Master and Archive imports stamp `submittedAt` with the import time; the Spreadsheet "Submitted" column, Contacts chronology and Excel export treat it as a real inquiry date.
2. **Severity:** Low
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Master and Archive imports; Master Spreadsheet "Submitted" column and sort; Contacts "latest booking" ordering fallback; Export Excel "Date" column.
5. **What is inconsistent:** `normalizeMasterImportRow` sets `submittedAt: new Date().toISOString()` ([src/pages/Dashboard.jsx:1892](src/pages/Dashboard.jsx#L1892)); archive does the same ([src/pages/Dashboard.jsx:2174](src/pages/Dashboard.jsx#L2174)). `getBookingInquiryDateValue` deliberately ignores `submittedAt` for these sources ([src/utils/dateUtils.js:99-121](src/utils/dateUtils.js#L99-L121)), but [src/pages/SpreadsheetView.jsx:513-516](src/pages/SpreadsheetView.jsx#L513-L516), [src/pages/ContactsView.jsx:276-282](src/pages/ContactsView.jsx#L276-L282) and the export at [src/pages/Dashboard.jsx:9419](src/pages/Dashboard.jsx#L9419) use `submittedAt` directly.
8. **Current behavior:** All Master bookings show the same "Submitted" date (the import day) and export with that date in the "Date" column; sorting by Submitted is meaningless for them.
10. **Expected behavior:** Use `getBookingInquiryDateValue` (or `rentalFormDetails.inquiryDate`) everywhere an inquiry date is displayed; keep import time in a separate `importedAt`.
11. **Impact:** Misleading UI/export.
12. **Existing-data implications:** None destructive; values are deterministic import timestamps.
13. **Recommended fix:** Replace direct `submittedAt` reads in the three locations with `getBookingInquiryDateValue`; optionally add `importedAt` at import.
14. **Validation plan:** Spreadsheet Submitted column shows blank/real inquiry dates for Master rows; guest-group and staff bookings unchanged.
15. **Related:** AUDIT-001, AUDIT-014.

---

### AUDIT-013 — Excel `Date` cells are converted with local-time getters in `formatExcelDateValue`, shifting dates one day earlier in U.S. time zones

1. **Title:** Guest Group Inquiry "Date" and Archive "Visit Date" import one day early; Master import does not (it uses UTC).
2. **Severity:** Medium
3. **Confidence:** Confirmed (ExcelJS returns date cells as `Date` objects at UTC midnight; the browser time zone for Toah Nipi is Eastern, per the comment at [src/utils/dateUtils.js:129](src/utils/dateUtils.js#L129)).
4. **Affected workflows / records:** Import Everything → Guest Group Inquiry sheets (`submittedAt`); Archive import (`startDate`, `endDate`, `archiveVisitDate`).
5. **What is inconsistent:** `formatExcelDateValue` handles `Date` with `getFullYear/getMonth/getDate` (local) ([src/utils/dateUtils.js:183-189](src/utils/dateUtils.js#L183-L189)). `parseMasterImportDate` handles the same input with `toISOString().slice(0,10)` (UTC) ([src/pages/Dashboard.jsx:1567-1580](src/pages/Dashboard.jsx#L1567-L1580)). Inquiry sheets have no "Arrival Date" header, so `getBookingImportRowsFromWorksheet` falls back to `getRowsFromWorksheetFlexible`, which keeps `Date` objects ([src/utils/spreadsheetUtils.js:43-45](src/utils/spreadsheetUtils.js#L43-L45)).
7. **End-to-end trace:** Cell 3/5/2026 → ExcelJS `2026-03-05T00:00:00Z` → `formatExcelDateValue` in America/New_York → `2026-03-04` → `submittedAt = "2026-03-04T12:00:00.000Z"` ([src/pages/Dashboard.jsx:2727-2730](src/pages/Dashboard.jsx#L2727-L2730)).
8. **Current behavior:** Inquiry dates and archive visit dates are one day early; also affects `getGuestGroupInquiryImportIdentity` (uses `submittedAt.slice(0,10)`), so fixing the bug later would change identities and cause duplicates on the next re-import unless handled.
10. **Expected behavior:** Same UTC handling as the Master importer.
11. **Impact:** Incorrect dates; future duplicate risk when fixed.
12. **Existing-data implications:** All previously imported guest-group inquiry dates may be shifted; a fix needs a coordinated data repair (+1 day) or an identity rule tolerant of ±1 day.
13. **Recommended fix:** In `formatExcelDateValue`, use `getUTCFullYear/getUTCMonth/getUTCDate` for `Date` input; coordinate with `prepareGuestGroupInquiryImportIds` so re-imports still match old records.
14. **Validation plan:** Import a sheet with known dates under an Eastern-time browser; compare with the cell values; re-import and confirm no duplicates.
15. **Related:** AUDIT-012.

---

### AUDIT-014 — "Export Excel" is labeled as an inquiry export, includes every record, and cannot be re-imported faithfully

1. **Title:** The only spreadsheet export is a lossy 12-column sheet whose "Waitlist or No" column means something different from the importer's column of the same name.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Top bar "Export Excel" (all views except Form); Import Everything.
5. **What is inconsistent:**
   - Exports all `inquiryBookings` (Master, Staff, Archive, Guest Group) to a sheet named "Booking Inquiries" ([src/pages/Dashboard.jsx:9393-9466](src/pages/Dashboard.jsx#L9393-L9466)).
   - Column "Waitlist or No" is written as `inquiry.waitlist` (`Yes`/`No`). The importer reads that header as the **disposition** ("Waitlist"/"Considering"/"No") and `getGuestGroupInquiryStatus("No")` returns `Cancelled` ([src/pages/Dashboard.jsx:2598-2622](src/pages/Dashboard.jsx#L2598-L2622)); `"Yes"` returns `Inquiry`.
   - Sheet name "Booking Inquiries" is not recognized by `detectGuestGroupInquirySpreadsheetType` (needs "guest group" + year) or `detectMasterSpreadsheetType`, so Import Everything skips it entirely.
   - "Date" is `formatSubmittedDate(submittedAt)` (AUDIT-012); stay dates are flattened into "Desired Dates" text; status, retreat type, lodging, meals, financials, `rentalFormDetails` are omitted.
8. **Current behavior:** Not a backup or round-trip format. If someone renames the sheet to "2026 Guest Group Inquiries" and re-imports, every non-waitlisted record becomes `Cancelled` and every waitlisted one becomes `Inquiry`.
10. **Expected behavior:** Either label it clearly as a limited contact/inquiry list, or export the full Master-style column set. **Product decision** which is intended.
11. **Impact:** Misleading export; dangerous if used for re-import.
12. **Existing-data implications:** None unless an export has been re-imported.
13. **Recommended fix:** Rename the button/sheet ("Export contact list"), write the disposition (`inquiryDisposition || stageOfGroup`) under "Waitlist, Considering or No", or provide a separate full export; document that Backup (JSON) is the round-trip format.
14. **Validation plan:** Export → inspect columns; if a re-import path is intended, export→import round trip preserves status and disposition.
15. **Related:** AUDIT-012, AUDIT-009.

---

### AUDIT-015 — Staff Bookings have no field for invoice, expected revenue, or itemized costs, so Reports revenue is always "Missing" for them

1. **Title:** Revenue reporting works only for imported Master records.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Create Booking (create and edit), Reports revenue cards/CSV.
5. **What is inconsistent:** `getReportsRevenueDetails` uses `invoiceTotal`/`invoiceLodgingMeals`, `expectedRevenue`/`expectedMinimumRevenue`, `monthlyProjectedIncome`, or `usageFee+lodgingCost+foodCost+miscCost` ([src/pages/ReportsView.jsx:581-641](src/pages/ReportsView.jsx#L581-L641)). Create Booking has no input for any of them (it collects `adultRateQuoted`, `childRateQuoted`, guarantees) and Staff Bookings are routed to Create Booking for editing, never to the Edit tab that exposes `usageFee`/`lodgingCost`/etc. ([src/pages/Dashboard.jsx:7008-7019](src/pages/Dashboard.jsx#L7008-L7019)). `childUnder3RateQuoted` is imported from Master sheets but has no Create Booking field either.
8. **Current behavior:** Every app-created booking contributes $0 revenue with source "Missing".
10. **Expected behavior:** Product decision: either compute expected revenue from rates × guests × nights, or add invoice/expected revenue inputs.
11. **Impact:** Understated revenue reports.
13. **Recommended fix:** Add invoice/expected revenue fields to Create Booking (stored in both `rentalFormDetails` and the `invoice_lodging_meals`/`expected_minimum_revenue` columns), or add a calculated fallback in Reports clearly labeled "Calculated from quoted rates".
14. **Validation plan:** Create a booking with rates; confirm Reports shows a non-zero, correctly labeled revenue.
15. **Related:** AUDIT-003.

---

### AUDIT-016 — Jobs: Staff Assignment jobs can never be completed, are due on the arrival date, and include cancelled bookings

1. **Title:** Every staff assignment becomes permanently "Overdue" after the retreat starts.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Jobs view; Staff Assignments tab (`programLogisticsAssignments`).
5. **What is inconsistent:** `getAllBookingJobs` maps each assignment to `completed: false`, `dueDate: booking.startDate` ([src/pages/JobsView.jsx:55-74](src/pages/JobsView.jsx#L55-L74)); the assignment shape `{ id, role, assignedTo, notes }` has no completion field ([src/components/BookingStaffAssignmentsTab.jsx:18-19](src/components/BookingStaffAssignmentsTab.jsx#L18-L19)). No booking status filter is applied, so cancelled/waitlisted/archived bookings' checklist items and assignments are listed.
8. **Current behavior:** Overdue counts grow every week; cancelled groups' tasks appear as open work.
10. **Expected behavior:** Either assignments are informational (exclude from overdue) or they get a completion flag; jobs from inactive bookings should be hidden or labeled.
11. **Impact:** Misleading workload view.
13. **Recommended fix:** Exclude `sourceType: "Staff Assignment"` from overdue logic (or add `completed` to the assignment shape and a toggle in the tab); filter out bookings that `isDashboardHomeInactiveBooking` (shared helper) deems inactive.
14. **Validation plan:** Past booking with assignment shows not-overdue; cancelled booking's jobs hidden.
**Pass 2 note (screen purpose):** Listing tasks from cancelled bookings may be acceptable if staff want to see them to clean up; the contradictory rule is the permanent "Overdue" state for items that cannot be completed. Facility tasks are also missing from Jobs (AUDIT-043).
15. **Related:** AUDIT-017.

---

### AUDIT-017 — Staff users live only in each browser's localStorage and are disconnected from Supabase `staff_profiles`; deleted users are re-created automatically

1. **Title:** Two parallel staff identity systems; User Admin changes do not persist across browsers and deletions are undone.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** User Admin, Staff Assignments, Checklists (assignedTo, completedBy), Jobs, Dashboard greeting, Staff Contacts import.
5. **What is inconsistent:** Staff users are stored in `localStorage["toahNipiStaffUsers"]` and the "current user" in `toahNipiCurrentStaffUserId` ([src/pages/Dashboard.jsx:1075-1213](src/pages/Dashboard.jsx#L1075-L1213)). Login/RLS identity is Supabase Auth + `staff_profiles` ([src/docs/SQL_SETUP.md:337-346](src/docs/SQL_SETUP.md#L337-L346)). An effect adds any name found in booking assignments/checklists back into the local list ([src/pages/Dashboard.jsx:8887-8919](src/pages/Dashboard.jsx#L8887-L8919)).
8. **Current behavior:** Each browser has its own staff list and "current user" (defaulting to the first user), independent of who logged in; a user deleted in User Admin reappears (role "Staff", active) the next time bookings change if any booking still references the name; renaming a user does not update assignments (stored by name).
10. **Expected behavior:** Staff list sourced from `staff_profiles` (or a shared table), current user = authenticated user.
11. **Impact:** Inconsistent assignments/attribution across staff; "completedBy" may name the wrong person.
12. **Existing-data implications:** Assignments reference free-text names; mapping to profiles would need a name→user_id reconciliation.
13. **Recommended fix:** Load staff from `staff_profiles` (admin read policy exists); derive current user from `supabase.auth.getUser()`; store assignee IDs alongside names.
14. **Validation plan:** Two browsers show the same staff list; deleting a referenced user is blocked or reassigns; greeting matches logged-in user.
**Pass 2 additions (User Admin handlers reviewed):** Renaming a user (`updateStaffUser`) does not rename assignments or checklist items, so the old name is re-added as a new user by the auto-add effect on the next booking change. If the stored list is empty, three placeholder users ("Admin", "Office Staff", "Program Staff" with toahnipi.org addresses) are restored ([src/pages/Dashboard.jsx:1079-1101](src/pages/Dashboard.jsx#L1079-L1101), [src/pages/Dashboard.jsx:1165-1182](src/pages/Dashboard.jsx#L1165-L1182)). The User Admin role ("Admin"/"Staff") is unrelated to the RLS roles (`admin`/`staff`/`viewer`). The Staff Contacts import sets `active: true` on every matched user, re-activating users staff had deactivated. Checklist completion records `completedBy` from this local selection, falling back to the literal "Admin" ([src/components/BookingChecklists.jsx:298](src/components/BookingChecklists.jsx#L298)).
15. **Related:** AUDIT-016, AUDIT-023.

---

### AUDIT-018 — Guest counts are parsed three different ways ("40-50", "12 adults", "TBD")

1. **Title:** The same `attendeeCount` produces different guest totals on the Dashboard home, Reports and Contacts.
2. **Severity:** Low
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Master imports that store ranges (`"40-50"`, [src/pages/Dashboard.jsx:1775](src/pages/Dashboard.jsx#L1775)) or prose; Dashboard home "guests today / next 30 days"; Reports.
5. **What is inconsistent:** Dashboard home strips non-digits except `.`/`-` and calls `Number` → `"40-50"` → `NaN` → **0** ([src/pages/Dashboard.jsx:7569-7583](src/pages/Dashboard.jsx#L7569-L7583)). Reports takes the first number → **40** ([src/pages/ReportsView.jsx:64-75](src/pages/ReportsView.jsx#L64-L75)). Contacts displays the raw text (`getBookingGuestCount`, [src/pages/ContactsView.jsx:745-790](src/pages/ContactsView.jsx#L745-L790)).
8. **Current behavior:** Home "guests on site" undercounts any booking with a range.
13. **Recommended fix:** One shared `parseGuestCount` (e.g., in `src/utils/bookingUtils.js`) with an explicit rule (first number, max, or midpoint — product decision).
14. **Validation plan:** "40-50", "45", "12 adults + 3 kids", "TBD" give the same number on all three screens.
15. **Related:** AUDIT-003.

---

### AUDIT-019 — Saving in Inquiry Record Detail always recomputes `status` from the disposition text, discarding any status set elsewhere

1. **Title:** Editing any field of a guest-group inquiry resets its status (e.g., "Contract Sent" → "Inquiry").
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Inquiry Spreadsheet → Inquiry Record Detail; guest-group inquiry records whose status was changed in the Pipeline or Edit tab.
5. **What is inconsistent:** `handleSave` sets `status = getStatusFromInquiryDisposition(disposition)` and `waitlist` accordingly ([src/pages/InquiryRecordDetailView.jsx:346-432](src/pages/InquiryRecordDetailView.jsx#L346-L432)); the mapping only yields Waitlist / Cancelled / Inquiry ([src/pages/InquiryRecordDetailView.jsx:145-166](src/pages/InquiryRecordDetailView.jsx#L145-L166)). It does not use `getConsistentWaitlistState`.
8. **Current behavior:** Fixing a typo in the contact name of an inquiry that the Pipeline moved to "Contract Sent" silently moves it back to "Inquiry".
10. **Expected behavior:** Only recompute status when the disposition field actually changed.
13. **Recommended fix:** Compare `cleanDisposition` with the record's original disposition; keep `booking.status`/`booking.waitlist` when unchanged.
14. **Validation plan:** Set status via Pipeline → edit contact in Inquiry Record Detail → status unchanged; change disposition → status follows.
**Pass 2 note (strengthened):** Reachable in practice: guest-group records also open in Booking Detail from the Master Spreadsheet and Contacts, whose Edit tab can set any status. Combined with AUDIT-011, a waitlist-origin record confirmed in the Pipeline returns to `status=Waitlist`, `waitlist=Yes` the next time any field is saved in Inquiry Record Detail.
15. **Related:** AUDIT-011, AUDIT-003.

---

### AUDIT-020 — Calendar and Lodging Calendar show cancelled, waitlisted, archived and "Imported"-status records as if they occupy dates and buildings

1. **Title:** Calendars apply no status filter; lodging availability counts cancelled groups.
2. **Severity:** High
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Main Calendar (`/calendar`), Lodging Calendar (`/lodging-calendar`), Dashboard home calendar preview; all dated records including Archive visits (`status: "Archived Visit"`, `startDate = endDate = visit date`).
5. **What is inconsistent:** Both calendars receive `datedInquiries` = every record with a `startDate` ([src/pages/Dashboard.jsx:8941-8946](src/pages/Dashboard.jsx#L8941-L8946)) and filter only by date and building ([src/pages/CalendarView.jsx:240-335](src/pages/CalendarView.jsx#L240-L335), [src/pages/LodgingCalendarView.jsx:43-107](src/pages/LodgingCalendarView.jsx#L43-L107), [src/pages/LodgingCalendarView.jsx:343-356](src/pages/LodgingCalendarView.jsx#L343-L356)). Dashboard home excludes inactive bookings (`isDashboardHomeInactiveBooking`, [src/pages/Dashboard.jsx:7440-7466](src/pages/Dashboard.jsx#L7440-L7466)), Portal Admin excludes them ([src/pages/PortalAdminView.jsx:537-610](src/pages/PortalAdminView.jsx#L537-L610)). The calendar badge logic (`getCalendarStatusInfo`) labels everything not "confirmed/booked" as gold "Unconfirmed" — Cancelled, Waitlist, Contract Sent and Archived Visit look identical ([src/components/BookingCalendar.jsx:149-175](src/components/BookingCalendar.jsx#L149-L175)); `getCalendarEventColor` always returns `"calendar-event-green"` ([src/pages/Dashboard.jsx:9493-9495](src/pages/Dashboard.jsx#L9493-L9495)).
8. **Current behavior:** A cancelled group still appears on the calendar and makes its buildings look occupied in the Lodging Calendar availability panel; archive visits from past years populate historic calendar days.
10. **Expected behavior:** The calendar should either exclude inactive records or show them with a distinct, filterable state, using the same "active booking" rule as the Dashboard home.
11. **Impact:** Misleading availability; risk of turning away a new group for a building that is actually free.
13. **Recommended fix:** Extract `isDashboardHomeInactiveBooking` into a shared helper (see AUDIT-034) and apply it in `CalendarView`/`LodgingCalendarView` (with an optional "show cancelled" toggle); extend `getCalendarStatusInfo` to distinguish Cancelled/Waitlist/Contract Sent.
14. **Validation plan:** Cancel a booking → it disappears from (or is visibly struck through on) both calendars and frees its buildings; archive visit records do not show unless requested.
**Pass 2 note (screen purpose vs. contradiction):** A planning calendar can legitimately show cancelled or waitlisted groups (for history or rebooking). The contradictions are narrower: (1) the Lodging Calendar's building-availability counts treat cancelled bookings as occupying buildings, while the Dashboard home's housing checks exclude them; (2) the badge cannot distinguish Cancelled from Contract Sent. Whether archive visits should appear is a product decision.
15. **Related:** AUDIT-034, AUDIT-007, AUDIT-037 (departure-day convention).

---

### AUDIT-021 — The repository defines only `bookings` and `staff_profiles`; every other table, bucket and portal function the code relies on is undocumented in SQL

1. **Title:** Frontend and Edge Function depend on `guest_inquiries`, `portal_checklist_items`, `portal_documents`, Storage bucket `portal-uploads`, and guest-portal `security definer` functions that have no schema or migration in the repo.
2. **Severity:** Medium
3. **Confidence:** Requires external verification (the gap itself is Confirmed; README acknowledges it at [README.md:767-797](README.md#L767-L797)).
4. **Affected workflows / records:** Guest Inquiries, Portal Admin, guest portal, backups.
5. **What is inconsistent:** [src/docs/SQL_SETUP.md](src/docs/SQL_SETUP.md) and [src/docs/supabase-system-documentation.md](src/docs/supabase-system-documentation.md) describe only `bookings` and `staff_profiles` (the latter says "The portal may not yet be fully connected to Supabase", [src/docs/supabase-system-documentation.md:782](src/docs/supabase-system-documentation.md#L782) — now stale). There is no `supabase/migrations` directory. Columns the code reads/writes and that must exist:
   - `guest_inquiries`: `id`, `status` (`pending`/`converted`/`declined`), `declined_reason`, `reviewed_at`, `reviewed_by`, `converted_booking_id`, `submitted_at` (ordering; the Edge Function never sets it, so a DB default is required), and every field inserted at [supabase/functions/submit-guest-inquiry/index.ts:225-402](supabase/functions/submit-guest-inquiry/index.ts#L225-L402).
   - `portal_checklist_items`: `booking_id`, `item_id`, `title`, `status` (`notStarted`/`waitingOnGuest`/`needsReview`/`completed`), `required`, `due_date`, `guest_action`, `uploaded_file_name/_path/_mime/_size`, `response_text`, `last_changed_at`, `sort_order`, `updated_at`.
   - `portal_documents`: `booking_id`, `title`, `document_type`, `file_name`, `note`, `status`, `uploaded_by_guest`, `last_changed_at`, `created_at`.
8. **Current behavior:** A fresh environment built from the repo cannot run Guest Inquiries or Portal Admin; drift between production and code cannot be detected from the repo.
13. **Recommended fix:** Export the production DDL/RLS/storage policies (`supabase db dump --schema public` plus storage policies) into `supabase/migrations/`, and update `SQL_SETUP.md` / `supabase-system-documentation.md`.
14. **Validation plan:** Apply migrations to an empty project; run Guest Inquiries, Portal Admin, and the guest portal against it.
15. **Related:** AUDIT-010, AUDIT-028, Section 8.

---

### AUDIT-022 — Portal links fall back to `http://localhost:5173` when `VITE_GUEST_PORTAL_BASE_URL` is unset

1. **Title:** A production build without the variable copies localhost portal links to guests.
2. **Severity:** Low (the variable name exists in `.env.local`; production build configuration Requires external verification)
3. **Confidence:** Confirmed (code); deployment value Requires external verification.
5. **Evidence:** [src/pages/PortalAdminView.jsx:1035-1056](src/pages/PortalAdminView.jsx#L1035-L1056). `localhost:5173` is also Vite's default port for this staff app itself.
8. **Current behavior:** Silent wrong link instead of an error.
13. **Recommended fix:** In production (`import.meta.env.PROD`) refuse to build/copy a link without the variable and show a staff-facing error.
14. **Validation plan:** Build without the variable → copy link shows an error; with it → correct URL.
15. **Related:** Section 8.

---

### AUDIT-023 — The frontend never reads the staff role; actions the database forbids look successful

1. **Title:** Viewers and non-admin staff see Delete, Import, Restore and Edit controls; RLS-denied deletes return no error, and the UI removes the booking locally.
2. **Severity:** Medium
3. **Confidence:** Confirmed (code); RLS behavior per README [README.md:1247-1253](README.md#L1247-L1253) and Supabase semantics.
4. **Affected workflows / records:** Booking Profile "Delete" ([src/pages/Dashboard.jsx:6952-6958](src/pages/Dashboard.jsx#L6952-L6958)), Dev Mode "Delete All", Backup Replace, all edit forms for `viewer`.
5. **What is inconsistent:** RLS allows delete only for `admin` ([src/docs/SQL_SETUP.md:645-651](src/docs/SQL_SETUP.md#L645-L651)). `deleteBooking` is `.delete().eq("id", id)` without `.select()` or a count check ([src/services/bookingService.js:338-347](src/services/bookingService.js#L338-L347)); a policy-filtered delete affects 0 rows and returns no error. `deleteSingleBooking` then removes the booking from state and navigates away ([src/pages/Dashboard.jsx:8044-8081](src/pages/Dashboard.jsx#L8044-L8081)). No component queries `staff_profiles` or `current_staff_role()`; Dev Mode is a password gate unrelated to role ([supabase/functions/verify-dev-mode/index.ts](supabase/functions/verify-dev-mode/index.ts)). For `viewer`, upserts fail with an RLS error (surfaced as a generic alert).
8. **Current behavior:** A staff-role user clicks Delete → sees the booking disappear → it returns on the next refresh. `deleteAllInquiries` similarly clears the screen while nothing was deleted.
13. **Recommended fix:** Use `.delete({ count: "exact" })` (or `.select()`) and treat 0 affected rows as "not permitted"; load the role once (`rpc('current_staff_role')`) and hide/disable controls accordingly.
14. **Validation plan:** As `staff`, Delete shows a permission message and the record stays; as `admin`, delete succeeds; as `viewer`, edit controls are hidden.
15. **Related:** AUDIT-010, AUDIT-017.

---

### AUDIT-024 — Supported workbook years are hard-coded to 2025–2027 in importers, detectors, menus and the Inquiry Spreadsheet

1. **Title:** A 2028 Master or Guest Group Inquiry sheet is silently skipped, and 2028 inquiry records would never appear in the Inquiry Spreadsheet.
2. **Severity:** Medium (time-dependent: the audit date is 2026-10-28; 2028 inquiry sheets are plausible soon)
3. **Confidence:** Confirmed
5. **Evidence:** `detectGuestGroupInquirySpreadsheetType` returns "" unless the sheet name contains 2025/2026/2027 ([src/pages/Dashboard.jsx:2563-2596](src/pages/Dashboard.jsx#L2563-L2596)); `detectMasterSpreadsheetType` only returns Master 2025/2026/2027 ([src/pages/Dashboard.jsx:2414-2521](src/pages/Dashboard.jsx#L2414-L2521)); `importCounts` keys ([src/pages/Dashboard.jsx:8423-8431](src/pages/Dashboard.jsx#L8423-L8431)); top-bar menu items ([src/components/DashboardTopbar.jsx:202-242](src/components/DashboardTopbar.jsx#L202-L242)); `getInquirySpreadsheetYear` ([src/pages/InquirySpreadsheetView.jsx:39-80](src/pages/InquirySpreadsheetView.jsx#L39-L80)); `getMasterImportStatus` default `year === 2027 ? "Inquiry" : "Confirmed"` ([src/pages/Dashboard.jsx:1731](src/pages/Dashboard.jsx#L1731)). Spreadsheet column categories know only 2025/2026 raw columns ([src/constants/dashboardConstants.js:580-617](src/constants/dashboardConstants.js#L580-L617)).
8. **Current behavior:** Import Everything reports "skipped — not a recognized ... sheet"; a 2028 Master sheet with no "Confirmed or Unconfirmed" column would default every row to "Confirmed" if it were ever routed through the 2025/2026 rules.
13. **Recommended fix:** Derive the year from the sheet name (`/20\d{2}/`) and drive the menu/year lists from data; make the default status rule explicit per header set rather than per year.
14. **Validation plan:** Workbook with "2028 Guest Group Inquiries" imports and shows under a 2028 filter.
15. **Related:** README "Support a new spreadsheet year" ([README.md:1544-1557](README.md#L1544-L1557)).

---

### AUDIT-025 — Archive import creates new IDs on every run (`Date.now()`), so re-importing duplicates every archive record

1. **Title:** Archive importer is non-idempotent; it is hidden from the menu but still wired.
2. **Severity:** Low (menu item commented out; the hidden file input and handler remain)
3. **Confidence:** Confirmed
5. **Evidence:** `id: archive-import-${Date.now()}-...` ([src/pages/Dashboard.jsx:2167-2170](src/pages/Dashboard.jsx#L2167-L2170)); menu button commented out ([src/components/DashboardTopbar.jsx:244-258](src/components/DashboardTopbar.jsx#L244-L258)); input still rendered ([src/components/DashboardTopbar.jsx:171-178](src/components/DashboardTopbar.jsx#L171-L178)). `importSpreadsheet` has no archive dedupe (only Master dedupe).
8. **Current behavior:** If re-enabled and run twice, all archive rows duplicate; archive rows then appear on calendars (AUDIT-020) and in Contacts.
13. **Recommended fix:** Use a deterministic ID (sheet + row, or content hash like `createMasterImportId`) before re-enabling; or delete the handler if archive import is retired.
15. **Related:** AUDIT-033.

---

### AUDIT-026 — A newly created booking is not added to dashboard state, and a seeded form loses its success message

1. **Title:** After "Create Booking", Dashboard home/Calendar do not show the new booking until a reload; the confirmation disappears when the form was opened from an inquiry.
2. **Severity:** Low
3. **Confidence:** Confirmed (state flow); the message loss is inferred from React keyed remount.
5. **Evidence:** Create mode calls `upsertBooking` directly ([src/pages/CreateBooking.jsx:2552-2557](src/pages/CreateBooking.jsx#L2552-L2557)); `onBookingCreated` only handles the guest-inquiry mark and clears the seed ([src/pages/Dashboard.jsx:9929-9950](src/pages/Dashboard.jsx#L9929-L9950)); `publicInquiries` is not updated. Clearing `bookingFormSeed` changes `key={bookingFormSeed?.id || "blank-booking-form"}` ([src/pages/Dashboard.jsx:9923-9927](src/pages/Dashboard.jsx#L9923-L9927)), remounting `CreateBooking` and discarding `wasSubmitted`.
8. **Current behavior:** Navigating via the home "Dashboard" button (`navigate`, no reload) shows stale counts; sidebar views reload (`handleActiveViewChange` calls `loadBookingsFromSupabase`).
13. **Recommended fix:** In `onBookingCreated`, merge `savedBooking` into `publicInquiries`; keep a post-save banner outside the keyed component.
15. **Related:** AUDIT-004.

---

### AUDIT-027 — `submit-guest-inquiry` has no OPTIONS/CORS handling and minimal date validation, unlike `verify-dev-mode`

1. **Title:** Browser submissions from another origin may fail preflight; malformed dates are accepted.
2. **Severity:** Medium if the public form calls this function cross-origin from a browser — **Requires external verification**
3. **Confidence:** Suspected
5. **Evidence:** The function returns 405 for any non-POST method, including `OPTIONS` ([supabase/functions/submit-guest-inquiry/index.ts:40-49](supabase/functions/submit-guest-inquiry/index.ts#L40-L49)), and sets no CORS headers, unless `withSupabase` from `npm:@supabase/server` adds them (not verifiable here). `verify-dev-mode` explicitly answers `OPTIONS` with CORS headers ([supabase/functions/verify-dev-mode/index.ts:15-20, 45-48](supabase/functions/verify-dev-mode/index.ts#L15-L48)). Dates are only length-limited strings compared lexically (`endDate < startDate`), so `"6/1/2026"` passes and is inserted into `start_date` (DB type unknown). `deposit_amount: Number(body.depositAmount)` can store `NaN`/fail for non-numeric input.
8. **Current behavior:** Unknown; if preflight fails, every public inquiry from the website is lost before reaching the database.
13. **Recommended fix:** Confirm in the deployed environment; add explicit `OPTIONS` handling and `Access-Control-Allow-Origin` for the public site; validate `YYYY-MM-DD` and numeric fields.
14. **Validation plan:** Submit from the real public form origin; check the network tab for preflight success; submit bad dates and confirm 400.
15. **Related:** AUDIT-021, Section 8.

---

### AUDIT-028 — Guest-facing inquiry and portal applications are not in this repository; payload compatibility can only be checked one-sidedly

1. **Title:** The public inquiry form, the guest portal (`/?portal=<token>`), and its `security definer` functions are external.
2. **Severity:** Low (coverage limitation, not a defect by itself)
3. **Confidence:** Requires external verification
5. **Evidence:** `getPortalBaseUrl()` points to a separate app ([src/pages/PortalAdminView.jsx:1035-1045](src/pages/PortalAdminView.jsx#L1035-L1045)); README "How the guest portal reaches data" ([README.md:382-402](README.md#L382-L402)). The Edge Function expects camelCase body keys (`organizationName`, `approxTotalGuests`, `mealSchedule`, `allergies`, `activities`, `linenOption`, ...); `GuestInquiriesView.guestInquiryToStaffInquiry` expects `allergies` items shaped `{name,count}` and `activities` items shaped `{date,time,activity}` to prefill Create Booking ([src/pages/GuestInquiriesView.jsx:310-485](src/pages/GuestInquiriesView.jsx#L310-L485)); the Edge Function stores whatever array items it receives (no shape validation).
8. **Current behavior:** If the public form sends a different item shape, Create Booking prefill silently shows blank allergy/activity rows.
13. **Recommended fix:** Add shape validation in the Edge Function for `allergies`, `activities`, `mealSchedule`; share a typed contract between the apps.
15. **Related:** AUDIT-027, Section 8.

---

### AUDIT-029 — Contract, deposit, insurance and guest-count completion are tracked in three unlinked places

1. **Title:** Portal checklist status, booking `rentalFormDetails` dates, and internal Checklists never update each other.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Portal Admin (`portal_checklist_items`: `contract`, `insurance`, `deposit`, `balance`, `guest-count`, `food-allergy-information`), Create Booking timeline (`contractSentDate`, `contractReturnedDate`, `depositReceivedDate`, `insuranceCertificateDate`), internal `bookings.checklists`, Dashboard home "Contracts awaiting return", Pipeline columns, Portal eligibility.
5. **What is inconsistent:** `handleConfirmChecklistItem` marks a portal item `completed` ([src/pages/PortalAdminView.jsx:3749-3817](src/pages/PortalAdminView.jsx#L3749-L3817)) without touching the booking. Booking stage logic reads only `rentalFormDetails.contractReturnedDate`/`contractSentDate` and `status` ([src/pages/Dashboard.jsx:7479-7507](src/pages/Dashboard.jsx#L7479-L7507), [src/pages/InquiryPipeline.jsx:442-490](src/pages/InquiryPipeline.jsx#L442-L490), [src/pages/PortalAdminView.jsx:602-608](src/pages/PortalAdminView.jsx#L602-L608)). Guest-reported dates from the public form are stored as `guestReported*` and intentionally not promoted ([src/pages/GuestInquiriesView.jsx:472-483](src/pages/GuestInquiriesView.jsx#L472-L483)). Portal progress counts `needsReview` as done in the percentage ([src/pages/PortalAdminView.jsx:474-521](src/pages/PortalAdminView.jsx#L474-L521)) while the status label calls it "Needs Review".
8. **Current behavior:** Staff can confirm the signed contract in the portal while the Dashboard still lists the group under "Contracts awaiting return" and the status remains "Contract Sent".
10. **Expected behavior:** Product decision: whether confirming the portal `contract` item should set `contractReturnedDate` (and status), and similarly deposit/insurance.
11. **Impact:** Contradictory workflow signals; duplicate data entry.
13. **Recommended fix:** If linkage is desired, after a successful portal confirm call `upsertBooking` with the corresponding `rentalFormDetails` date (and `getConsistentWaitlistState`), or show the portal state next to the timeline dates in the Overview.
14. **Validation plan:** Confirm portal contract → Dashboard home/Pipeline reflect it (or explicitly show both).
15. **Related:** AUDIT-034.

---

### AUDIT-030 — Reports totals include cancelled, waitlisted and still-unconverted inquiry records by default

1. **Title:** Guests, nights, meals, camper days and revenue totals sum every record in the date range regardless of status.
2. **Severity:** Medium
3. **Confidence:** Confirmed
5. **Evidence:** `filteredReportBookings` applies the status filter only when not `"all"` (default `"all"`, [src/constants/dashboardConstants.js:494-501](src/constants/dashboardConstants.js#L494-L501)); totals reduce over all of them ([src/pages/ReportsView.jsx:1152-1240](src/pages/ReportsView.jsx#L1152-L1240)). Only Archive records are excluded ([src/pages/ReportsView.jsx:1124-1131](src/pages/ReportsView.jsx#L1124-L1131)). With "All Time", undated guest-group inquiries are included (`bookingTouchesReportsDateRange` returns true when no range, [src/pages/ReportsView.jsx:226-236](src/pages/ReportsView.jsx#L226-L236)), and an inquiry plus the Staff Booking converted from it are both counted (no use of `convertedInquiryIds`, unlike Dashboard home [src/pages/Dashboard.jsx:9022-9038](src/pages/Dashboard.jsx#L9022-L9038)).
8. **Current behavior:** Camper days and guest totals are overstated by cancelled groups.
10. **Expected behavior:** Product decision; at minimum label totals as "all statuses" or default to active bookings.
13. **Recommended fix:** Apply the shared active-booking helper (AUDIT-034) to totals, and dedupe converted inquiries via `getInquiryPipelineRecords().convertedInquiryIds`.
14. **Validation plan:** Cancel a booking in range → totals decrease; converted inquiry counted once.
**Pass 2 note (screen purpose):** A status-agnostic total can be legitimate if labeled; the defect is that the default view mixes cancelled bookings into camper-day and revenue totals without saying so, and that converted inquiries are double-counted, which Dashboard home explicitly avoids.
15. **Related:** AUDIT-034, AUDIT-003.

---

### AUDIT-031 — Lodging building lists, aliases and capacities are defined six times and disagree

1. **Title:** Building definitions diverge across Create Booking, Housing tab, Lodging Calendar, Dashboard home, Reports and constants.
2. **Severity:** Low (current bug only where noted)
3. **Confidence:** Confirmed
5. **Evidence:**
   - Create Booking `lodgingFields` (7 buildings, capacities "70", "14", "52", "21", "5–8", "5", "9–12") — [src/pages/CreateBooking.jsx:310-358](src/pages/CreateBooking.jsx#L310-L358).
   - Housing tab `housingRows` (8 incl. Camping, Bethel/Dothan rooms, Hebron Bunks Men's/Women's; `housingArea` labels "Bethel Lodge", "Main Lodge", "Dothan Lodge", "Rustic Cottages") — [src/components/BookingHousingTab.jsx:18-262](src/components/BookingHousingTab.jsx#L18-L262).
   - Lodging Calendar `LODGING_BUILDINGS` (6; Hebron combined; aliases include "main lodge"; no Camping) — [src/pages/LodgingCalendarView.jsx:172-233](src/pages/LodgingCalendarView.jsx#L172-L233).
   - Dashboard home `DASHBOARD_HOME_BUILDINGS` (6; aliases "aijalon", "capurnum" only here) — [src/pages/Dashboard.jsx:7603-7643](src/pages/Dashboard.jsx#L7603-L7643).
   - Reports `REPORTS_HOUSING_CONFIG` — [src/pages/ReportsView.jsx:681-731](src/pages/ReportsView.jsx#L681-L731).
   - `defaultRoomRows` in constants lists "Rustic Cottage 1–4", which exist nowhere else (used only by dead `AvailabilityBoard`) — [src/constants/dashboardConstants.js:161-198](src/constants/dashboardConstants.js#L161-L198).
8. **Current behavior (bugs):** a booking whose text says "Aijalon" or "Capurnum" is tagged on the Dashboard home but is "Unassigned" on the Lodging Calendar; camping-only bookings are "Unassigned" on the Lodging Calendar but housed on the Dashboard home (detail fields) — see AUDIT-005/007.
13. **Recommended fix:** One `src/constants/lodgingConstants.js` (ids, labels, field names, aliases, capacities, sub-areas) consumed by all five screens.
**Pass 2 addition:** A seventh copy exists in the Booking Overview lodging card (`lodgingOverviewRows`, [src/pages/Dashboard.jsx:6131-6181](src/pages/Dashboard.jsx#L6131-L6181)) with its own capacities and no Camping row, so camping lodging saved on the Housing tab is not shown in the Overview lodging card.
15. **Related:** AUDIT-005, AUDIT-007, Section 6.

---

### AUDIT-032 — Edit tab offers status "Imported", which no other part of the system interprets, and omits "Archived Visit"

1. **Title:** Status dropdowns differ between the two edit forms and from the values imports produce.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** Edit tab options: Inquiry, Contract Sent, Confirmed, **Imported**, Cancelled, Waitlist ([src/pages/Dashboard.jsx:4009-4021](src/pages/Dashboard.jsx#L4009-L4021)). Create Booking edit options: Inquiry, Contract Sent, Confirmed, Waitlist, Cancelled ([src/pages/CreateBooking.jsx:4405-4430](src/pages/CreateBooking.jsx#L4405-L4430)). Imports produce also "Archived Visit" ([src/pages/Dashboard.jsx:2204](src/pages/Dashboard.jsx#L2204)). No reader handles "imported": Portal eligibility needs confirm/contract; Dashboard home treats it as active non-inquiry (so it counts in "Lodging not assigned"); calendars show it as "Unconfirmed".
8. **Current behavior:** Choosing "Imported" removes a booking from the portal and puts it in an undefined state. Opening an "Archived Visit" record in the Edit tab displays "Inquiry" in the select (first option) although the saved value is unchanged unless touched.
13. **Recommended fix:** One exported `BOOKING_STATUS_OPTIONS` constant (and an explicit decision about "Archived Visit"), used by both forms and by status-precedence helpers.
15. **Related:** AUDIT-034.

---

### AUDIT-033 — Dead or unreachable code that duplicates or contradicts live logic

1. **Title:** Unused components/helpers remain alongside live equivalents.
2. **Severity:** Cleanup
3. **Confidence:** Confirmed (each verified by repository-wide reference search; "unused" means no call site outside its own definition)
5. **Evidence (each item verified):**
   - `AvailabilityBoard` and its helpers `getRoomRowsFromBookings`, `bookingUsesRoom`, `getAvailabilityBookingsForDay`, `getActivityBookingsForDay`, `bookingUsesActivityLocation`, `bookingContinuesBeforeDay/AfterDay`, `inquiryTouchesDay`, plus constants `activityLocations` and `defaultRoomRows` (only consumers) — [src/pages/Dashboard.jsx:2875-3195](src/pages/Dashboard.jsx#L2875-L3195). Note `activityLocations` aliases are inconsistent with Create Booking's `activityOptions` (e.g., "Hebron: Meeting Space" is aliased to "Dining Hall") — harmless only because the board is dead.
   - `getSavedInquiries` (legacy `localStorage["toahNipiPublicInquiries"]`) — [src/pages/Dashboard.jsx:879-895](src/pages/Dashboard.jsx#L879-L895).
   - `normalizeGenericSpreadsheetRow` (no "Generic" importer exists, yet `getBookingInquiryDateValue` still special-cases "generic spreadsheet") — [src/pages/Dashboard.jsx:2262-2396](src/pages/Dashboard.jsx#L2262-L2396).
   - `getStatusFromStage` — [src/pages/Dashboard.jsx:2028-2052](src/pages/Dashboard.jsx#L2028-L2052) (a third, different stage→status mapping).
   - `StaffBookingFormDetails`, `DetailCardHeader`, `DetailField`, `BookingMetric`, `BookingSection`, `BookingDetailRow`, `isGuestGroupInquiryRecord` in Dashboard.jsx (definitions only).
   - `src/components/BookingActivities.jsx` (import commented out at [src/pages/Dashboard.jsx:66](src/pages/Dashboard.jsx#L66)); its stylesheet is still imported ([src/App.jsx:21](src/App.jsx#L21)); README still describes it as supporting planning ([README.md:227-229](README.md#L227-L229)).
   - `spreadsheetUtils.js` exports `normalizeWaitlistValue`, `detectSpreadsheetRowType`, `rowHasAnyColumn` with no importers; `dateUtils.formatExcelSubmittedAt` unused.
   - `BookingCalendar` reads `inquiry.statusSource`, which nothing sets ([src/components/BookingCalendar.jsx:154-156](src/components/BookingCalendar.jsx#L154-L156)); `getCalendarEventColor` ignores its argument.
   - `BookingDetailView` branches for a "Notes & Tasks" tab that is not in `bookingDetailTabs` ([src/pages/Dashboard.jsx:7034-7050](src/pages/Dashboard.jsx#L7034-L7050)).
   - SpreadsheetView building search reads `housing`, `housingSummary`, `housingAssignments`, `lodging`, `lodgingSummary`, `lodgingAssignments`, never set anywhere ([src/pages/SpreadsheetView.jsx:1426-1435](src/pages/SpreadsheetView.jsx#L1426-L1435)).
   - Commented-out `DashboardBackups` block inside the top bar fragment ([src/pages/Dashboard.jsx:9884-9891](src/pages/Dashboard.jsx#L9884-L9891)); commented import of `CreateBooking` in GuestInquiriesView.
   - Create Booking prefill reads `guestDetails.secondaryContact*`, which `guestInquiryToStaffInquiry` never provides (public form has no secondary contact).
11. **Impact:** Maintenance hazard — e.g., someone may "fix" status mapping in `getStatusFromStage` believing it is live.
13. **Recommended fix:** Delete each item after a final reference search; move anything worth keeping into shared helpers.
15. **Related:** AUDIT-025, Section 6.

---

### AUDIT-034 — "Active", "inquiry", "confirmed" and "inactive" are computed differently on every screen

1. **Title:** No shared status-precedence rule; the same booking is active on one screen and inactive on another.
2. **Severity:** Medium
3. **Confidence:** Confirmed
5. **Evidence (rules as implemented):**
   | Consumer | Inactive / excluded when | Confirmed when | Notes |
   |---|---|---|---|
   | Dashboard home `isDashboardHomeInactiveBooking` ([Dashboard.jsx:7440-7466](src/pages/Dashboard.jsx#L7440-L7466)) | status contains cancel/archive/wait, `waitlist=yes`, or a known `dateOfCancellation` | — | also hides converted inquiries |
   | Portal `isPortalEligibleBookingRow` ([PortalAdminView.jsx:537-610](src/pages/PortalAdminView.jsx#L537-L610)) | same + `Host:` prefix + archive source | status confirm/booked/contract or contract dates; Staff Booking always | rows with portal items always included |
   | Pipeline `getInquiryPipelineColumnKey` ([InquiryPipeline.jsx:442-490](src/pages/InquiryPipeline.jsx#L442-L490)) | cancellation date or cancel → Cancelled; waitlist yes / wait / disposition "waitlist" → Waitlist | contract returned date or confirm/booked | Master/Archive excluded |
   | Calendar / Lodging Calendar | never | confirmed/booked only (badge) | AUDIT-020 |
   | Reports | Archive only | `includes("confirm")` | AUDIT-030 |
   | Jobs | never | — | AUDIT-016 |
   | Contacts `getBookingStatus` | — | display only; falls back to `details.status`, `stageOfGroup` | |
   | Master import `getMasterImportStatus` / guest import / Inquiry Record Detail / `getStatusFromStage` (dead) | four different text→status mappings | | AUDIT-019, AUDIT-033 |
   "Host:" records are excluded only by Portal Admin; they count as guests on the Dashboard home and in Reports.
   Staff Bookings are saved as "Inquiry" until a contract date exists ([src/pages/CreateBooking.jsx:1878-1893](src/pages/CreateBooking.jsx#L1878-L1893)); Dashboard home and Portal special-case them as real bookings, Reports/Calendar/Contacts show them as inquiries.
8. **Current behavior:** Counts and lists disagree between screens for cancelled, waitlisted, host, and new staff bookings.
13. **Recommended fix:** Create `src/utils/bookingStatus.js` exporting `isInactiveBooking`, `getBookingStage`, `isHostRecord`, and use it in all consumers; decide whether Staff Bookings should get a distinct initial status (e.g., "Tentative") instead of "Inquiry".
14. **Validation plan:** Table-driven test over representative records (cancelled with date, waitlist yes + status confirmed, Host:, staff booking without contract) asserting the same classification on every screen.
**Pass 2 note (screen purpose vs. contradiction):** Different inclusion policies are legitimate per screen — Portal Admin intentionally keeps records that already have portal items; Jobs may show history; a calendar may show cancelled groups if marked. A shared helper should provide one *classification* (`getBookingStage`: inquiry / contract sent / confirmed / waitlist / cancelled / archive / host) that each screen then filters on deliberately. The contradictory rules are the ones that classify the same record differently: Pipeline disposition precedence (AUDIT-011), Inquiry Record Detail (AUDIT-019), the four text→status mappings, and "Imported" (AUDIT-032).
15. **Related:** AUDIT-011, AUDIT-016, AUDIT-020, AUDIT-029, AUDIT-030, AUDIT-032.

---

### AUDIT-035 — A stored `camperDays` value overrides recalculation, even after guests/nights/meals are edited

1. **Title:** Reports keep the imported "Camper Days" total after staff change the inputs.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** `getReportsCamperDaysDetails` returns the stored `camperDays` whenever > 0 ([src/pages/ReportsView.jsx:465-500](src/pages/ReportsView.jsx#L465-L500)); Master import stores the sheet's value ([src/pages/Dashboard.jsx:1904](src/pages/Dashboard.jsx#L1904)); the Edit tab exposes `camperDays` as an independent free-text field; Create Booking never writes `camperDays` (it is preserved via `...existingBooking`).
8. **Current behavior:** Editing guest count or nights does not change reported camper days for imported records.
10. **Expected behavior:** Documented intent is "treat imported value as canonical to avoid double counting" (code comment) — reasonable for untouched imports, but stale after edits. Product decision.
13. **Recommended fix:** Mark stored values with their source and clear/flag them when any input field is edited, or show both stored and calculated values.
15. **Related:** AUDIT-003.

---

### AUDIT-036 — Record-source labels are derived differently, and web-form bookings are counted as "Staff Booking"

1. **Title:** Record-type labels ("Input Method") are derived differently in Reports and Pipeline, and no current path creates the "Public Form" source they count.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** Reports `getBookingInputMethod` labels any record with empty or `"Form"` source as "Public Form" ([src/pages/ReportsView.jsx:118-127](src/pages/ReportsView.jsx#L118-L127)); `bookingToDbRow`/`dbRowToBooking` default `source_type` to `"Form"` ([src/services/bookingService.js:87](src/services/bookingService.js#L87), [:170](src/services/bookingService.js#L170)), but no current code path creates a "Form" record — guest web-form conversions are saved as `"Staff Booking"` with `rentalFormDetails.sourceInquirySheet = "Guest Web Form"`. Pipeline labels empty/"form" as "Public Form" too ([src/pages/InquiryPipeline.jsx:191-231](src/pages/InquiryPipeline.jsx#L191-L231)).
8. **Current behavior:** "Public Form" counts in Reports reflect only legacy records; guest-web-form bookings are counted as "Staff Booking", so the source breakdown under-reports web inquiries.
13. **Recommended fix:** Decide the canonical source taxonomy (Staff, Guest Web Form → booking, Master import, Guest Group import, Archive) and store it explicitly (e.g., `source_type = "Guest Web Form"` with `detected_import_type = "Staff Booking"`), then derive labels from one helper.
15. **Related:** AUDIT-034.

---

### AUDIT-037 — Departure day is treated as an occupied day in availability views (convention unconfirmed)

1. **Title:** Calendars count the departure date as occupied, so back-to-back groups appear to overlap.
2. **Severity:** Low
3. **Confidence:** Requires external verification (business rule)
5. **Evidence:** Lodging Calendar `inquiryTouchesDate` is inclusive of `endDate` ([src/pages/LodgingCalendarView.jsx:61-73](src/pages/LodgingCalendarView.jsx#L61-L73)); nights are computed as `endDate − startDate` everywhere ([src/pages/CreateBooking.jsx:637-668](src/pages/CreateBooking.jsx#L637-L668), [src/pages/Dashboard.jsx:1796-1798](src/pages/Dashboard.jsx#L1796-L1798)), i.e., the departure date is not a night. Meal schedules include the departure date (breakfast/lunch), which supports showing the group on site that day.
8. **Current behavior:** Group A departing June 3 and Group B arriving June 3 in Bethel both show on June 3 in the Bethel availability panel.
10. **Expected behavior:** Business decision: whether lodging availability should be night-based (exclude departure date) while the on-site/meal calendar stays inclusive.
15. **Related:** AUDIT-020.

---

### AUDIT-038 — Portal Admin can add tasks and documents but cannot remove, edit, or reopen them; staff document paths depend on `portal_token`

1. **Title:** Portal assignments are append-only from the staff side, and staff-uploaded document files are located by a path derived from the current portal token.
2. **Severity:** Medium
3. **Confidence:** Confirmed (staff UI); guest-portal path derivation Requires external verification.
4. **Affected workflows / records:** Portal Admin task/document assignment, custom staff uploads; Backup Replace (AUDIT-009).
5. **What is inconsistent:**
   - The only writes to `portal_checklist_items` are insert ([src/pages/PortalAdminView.jsx:822-896](src/pages/PortalAdminView.jsx#L822-L896)) and `needsReview → completed` ([src/pages/PortalAdminView.jsx:3765-3790](src/pages/PortalAdminView.jsx#L3765-L3790)). The only `portal_documents` delete is failure cleanup ([src/pages/PortalAdminView.jsx:4070-4095](src/pages/PortalAdminView.jsx#L4070-L4095)). There is no way to unassign a wrong task, change a due date, reject a guest upload back to "waiting", or remove a document.
   - Custom staff documents are stored at `${portalToken}/staff-documents/${documentId}/${fileName}` ([src/pages/PortalAdminView.jsx:137-163](src/pages/PortalAdminView.jsx#L137-L163)), but the row stores only `file_name`, not the storage path ([src/pages/PortalAdminView.jsx:965-1033](src/pages/PortalAdminView.jsx#L965-L1033)). Any consumer must re-derive the path from the booking's **current** token.
8. **Current behavior:** Mistakes require SQL. If `portal_token` changes (Replace restore), previously uploaded staff documents can no longer be located by token-derived paths (and Storage policies keyed by token prefix — README `portal_upload_path_is_allowed` — would deny guest access).
13. **Recommended fix:** Add remove/reopen/edit-due-date actions (with Storage cleanup); persist `storage_path` on `portal_documents`; never rotate `portal_token` implicitly (AUDIT-009).
14. **Validation plan:** Assign → remove → guest portal no longer shows it and the file is deleted; reject a guest upload → status returns to waiting.
15. **Related:** AUDIT-009, AUDIT-010, AUDIT-029.

---

### AUDIT-039 — Secondary contacts are excluded from the Contacts directory's grouping and search

1. **Title:** Contacts shows primary contacts (deduplicated) and secondary contacts (not deduplicated) in two unrelated tables.
2. **Severity:** Low
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Contacts view; bookings with `rentalFormDetails.secondaryContact*`.
5. **What is inconsistent:** `getContactsFromBookings` builds identities only from the primary snapshot ([src/pages/ContactsView.jsx:193-420](src/pages/ContactsView.jsx#L193-L420)). Dashboard renders a separate `BookingContactsSection secondaryOnly` below it ([src/pages/Dashboard.jsx:10018-10022](src/pages/Dashboard.jsx#L10018-L10022)), which lists one row per booking without merging, starring, or search. A person who is primary on one booking and secondary on another appears in both tables, unlinked. Secondary contacts are also absent from the guest web form and Edge Function (no fields) but present in Create Booking, the Edit tab, and the Excel export.
8. **Current behavior:** Searching Contacts for a secondary contact's email finds nothing in the main directory.
13. **Recommended fix:** Feed secondary snapshots into `getContactsFromBookings` with a `contactTypes` set, or document the two-table design.
15. **Related:** AUDIT-003.

---

### AUDIT-040 — Create Booking derives several text columns from structured fields with different meanings than imports use

1. **Title:** `need_to_know`, `linen_sets`, `schedule`, `food_allergies` and `meals` mean different things for Staff Bookings versus Master imports.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** Create Booking saves `needToKnow: formData.mealNotes` and loads `mealNotes: details.mealNotes || booking.needToKnow` ([src/pages/CreateBooking.jsx:2451-2452](src/pages/CreateBooking.jsx#L2451-L2452), [src/pages/CreateBooking.jsx:1596-1599](src/pages/CreateBooking.jsx#L1596-L1599)); Master import stores the sheet's "Need to know" column in `needToKnow` and puts meals + snack + need-to-know into `rentalFormDetails.mealNotes` ([src/pages/Dashboard.jsx:1783](src/pages/Dashboard.jsx#L1783), [src/pages/Dashboard.jsx:1867](src/pages/Dashboard.jsx#L1867)). `linenSets` summary drops `linenPieces` ([src/pages/CreateBooking.jsx:2300-2306](src/pages/CreateBooking.jsx#L2300-L2306)), although the guest form and Create Booking collect pieces. `schedule` becomes arrival/departure + meal summary ([src/pages/CreateBooking.jsx:1861-1876](src/pages/CreateBooking.jsx#L1861-L1876)) whereas imports use it for the 2027 "Schedule" column.
8. **Current behavior:** The Master Spreadsheet "Need To Know" column shows meal notes for staff bookings and operational notes for imported ones; linen piece requests are invisible in the Spreadsheet and Housing-tab text.
13. **Recommended fix:** Keep column semantics aligned with the spreadsheet headings, or rename the Spreadsheet column labels to describe both; include pieces in the linen summary.
15. **Related:** AUDIT-002, AUDIT-005.

---

### AUDIT-041 — Documentation disagrees with the code in several places

1. **Title:** Stale statements in `src/docs/*` and README.
2. **Severity:** Cleanup
3. **Confidence:** Confirmed
5. **Evidence:**
   - [src/docs/supabase-system-documentation.md:782-783](src/docs/supabase-system-documentation.md#L782-L783) says the portal and uploads may not be connected to Supabase; the code uses `portal_checklist_items`, `portal_documents`, and the `portal-uploads` bucket.
   - [src/docs/supabase-system-documentation.md:434-444](src/docs/supabase-system-documentation.md#L434-L444) lists only `bookings` delete flows; Portal and Guest Inquiries flows are undocumented there.
   - README says `dbRowToBooking` restores only `rentalFormDetails` and `rawSpreadsheetData` ([README.md:1505](README.md#L1505)); it also restores `inquiryAddress` ([src/services/bookingService.js:252](src/services/bookingService.js#L252)).
   - README lists `BookingActivities.jsx` as supporting planning ([README.md:229](README.md#L229)); it is not rendered (AUDIT-033).
   - README route table presents `/inquiry-pipeline` as a normal view ([README.md:191](README.md#L191)); the sidebar entry is commented out ([src/constants/dashboardConstants.js:90-95](src/constants/dashboardConstants.js#L90-L95)).
   - `SQL_SETUP.md` §30 suggests committing `SQL_SETUP.md` at repo root or `docs/`; the file lives in `src/docs/`.
13. **Recommended fix:** Update the docs after the related code fixes land.
15. **Related:** AUDIT-021, AUDIT-033.

---

### AUDIT-042 — Retreat types: Create Booking's fixed list, imported free text, and an unused normalizer disagree; Reports groups by raw text

1. **Title:** Equivalent retreat types are reported as separate categories, and the bucket normalizer that would unify them is not used.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** Create Booking offers 22 fixed values such as "Personal Retreat", "Church - Children", "Family Reunion" ([src/pages/CreateBooking.jsx:49-72](src/pages/CreateBooking.jsx#L49-L72)); Master imports store sheet text such as "PR", "PR-Day Use Only", "Families" ([src/pages/Dashboard.jsx:1813](src/pages/Dashboard.jsx#L1813)); guest web-form conversions start with `retreatType: ""` ([src/pages/GuestInquiriesView.jsx:387](src/pages/GuestInquiriesView.jsx#L387)). Reports groups by the raw string (`getReportsRetreatType`, [src/pages/ReportsView.jsx:673-675](src/pages/ReportsView.jsx#L673-L675)). `getRetreatTypeConfig`/`getInquiryRetreatType`/`RETREAT_TYPE_CONFIG` ([src/constants/dashboardConstants.js:223-379](src/constants/dashboardConstants.js#L223-L379)) are imported into Dashboard.jsx but never called. If they were used, "Personal Retreat" would bucket as **Other** (the PR rule only matches `pr` or `pr-…`) and "Church - Children" as **Families**.
8. **Current behavior:** Reports show "PR" and "Personal Retreat" as different slices; the dated-inquiry tint settings (`DEFAULT_DATED_INQUIRY_SETTINGS.tintByRetreatType`) are persisted but drive nothing.
13. **Recommended fix:** Decide the canonical taxonomy; map imports to it (keeping the original text in `rentalFormDetails.importedRetreatTypeText`), use one normalizer in Reports, and either wire or delete the tint settings.
15. **Related:** AUDIT-033, Section 6.

---

### AUDIT-043 — Facility tasks in Create Booking have a free-text "assigned to" field that never reaches Jobs

1. **Title:** Facilities rows capture a staff assignee, but Jobs only aggregates Checklists and Staff Assignments.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Create Booking → Facilities (`rentalFormDetails.facilities[{date,time,task,assignedTo,notes}]`); Jobs view; User Admin.
5. **What is inconsistent:** The Facilities "Staff member" input is a plain text field ([src/pages/CreateBooking.jsx:4199-4208](src/pages/CreateBooking.jsx#L4199-L4208)), not the staff dropdown used by Checklists and Staff Assignments. `getAllBookingJobs` reads only `checklists` and `programLogisticsAssignments` ([src/pages/JobsView.jsx:32-80](src/pages/JobsView.jsx#L32-L80)); facilities are shown only in the Overview facilities card ([src/pages/Dashboard.jsx:772-878](src/pages/Dashboard.jsx#L772-L878)).
8. **Current behavior:** A task entered as "Setup keyboard in Bethel — assigned to Sam" appears on the booking Overview but never in Sam's Jobs list, is never overdue, and its name is not added to the staff directory.
10. **Expected behavior:** Product decision: either facilities are tasks (then Jobs should include them with the same assignee picker) or they are notes (then the "Staff member" field is misleading).
13. **Recommended fix:** Add facilities to `getAllBookingJobs` as `sourceType: "Facility"` with `dueDate = facility.date`, and switch the input to the shared staff select; or relabel the field.
14. **Validation plan:** Facility row with assignee and date → appears in Jobs for that user; editing the booking keeps it.
15. **Related:** AUDIT-016, AUDIT-017.

---

### AUDIT-044 — "Fill Test Data" is always visible in the staff create form and, on a seeded form, drops the inquiry link while keeping the guest-conversion target

1. **Title:** A production create form exposes a test-data button that can create fake bookings and mark a real guest inquiry converted.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Create Booking (create mode, including forms seeded from a guest inquiry or staff inquiry).
5. **What is inconsistent:** The button renders whenever `!isEditMode`, not behind Dev Mode ([src/pages/CreateBooking.jsx:2642-2650](src/pages/CreateBooking.jsx#L2642-L2650)). `handleFillTestData` replaces the whole state with `createInitialFormState()` + `TEST_BOOKING_DATA` ([src/pages/CreateBooking.jsx:2209-2216](src/pages/CreateBooking.jsx#L2209-L2216)), which clears `sourceInquiryId`, `sourceInquirySheet`, guest-reported dates and the seeded contact data. Dashboard's `guestBookingSource` is not affected, so saving still runs `markGuestInquiryConverted` for the seeding guest inquiry.
8. **Current behavior:** Clicking the button on a guest-seeded form and saving creates "Test Community Church" (2027-06-18 → 2027-06-20) and closes the real guest inquiry as converted to that test booking. On a blank form, it creates a test booking in the live table.
13. **Recommended fix:** Show the button only in Dev Mode (or development builds), and hide it when `initialInquiry` is set.
14. **Validation plan:** Production build without Dev Mode → button absent; seeded form → button absent.
15. **Related:** AUDIT-004, AUDIT-008.

---

### AUDIT-045 — Booking saves are full-row upserts with no change detection, and the Checklists tab has no save guard, so concurrent or rapid edits can overwrite each other

1. **Title:** Last write wins for the entire booking row; quick successive checklist actions can revert each other.
2. **Severity:** Medium
3. **Confidence:** Confirmed (code pattern); multi-user frequency and any guest-portal writes to `bookings` Require external verification.
4. **Affected workflows / records:** All booking edit paths; especially the Checklists tab; two staff (or two browser tabs) editing the same booking; Master re-import while someone is editing.
5. **What is inconsistent:** `upsertBooking` writes every column and the whole `raw_data` from the caller's in-memory object ([src/services/bookingService.js:296-310](src/services/bookingService.js#L296-L310)); there is no `updated_at` comparison or partial update. `BookingChecklists.saveChecklists` builds the next list from the `booking` prop and calls `onSaveBooking` without awaiting or disabling controls ([src/components/BookingChecklists.jsx:144-149](src/components/BookingChecklists.jsx#L144-L149), handlers at [src/components/BookingChecklists.jsx:226-330](src/components/BookingChecklists.jsx#L226-L330)); the prop only updates after the save resolves (`setSelectedBooking(savedBooking)` in `saveBookingEdits`). The Staff Assignments tab, by contrast, tracks `isSaving` ([src/components/BookingStaffAssignmentsTab.jsx:271-320](src/components/BookingStaffAssignmentsTab.jsx#L271-L320)).
7. **End-to-end trace:** Tick checklist item A → save 1 starts with A done → before it returns, tick item B → save 2 is built from the old prop (A not done) + B done → save 2 lands last → A is reverted. Across users: staff X has the booking open since 9:00, staff Y saves housing at 9:05, X saves a note at 9:10 → Y's housing values are replaced by X's stale copy.
8. **Current behavior:** Silent lost updates under quick clicks or concurrent editing. Failed checklist saves surface only the generic "Could not save booking" alert, and the promise rejection is unhandled in the tab.
13. **Recommended fix:** Add an `updated_at` precondition (`.eq("updated_at", previous)` on update, or a Postgres function) and show a "this booking changed" message; in Checklists, keep local state, await the save, and disable controls while saving; consider column-scoped updates for tab saves (`checklists`, `program_logistics_assignments`, `buildings_rooms`).
14. **Validation plan:** Two browser sessions edit different tabs of one booking; the second save is rejected or merged, not silently lost. Rapid toggling of two checklist items keeps both.
15. **Related:** AUDIT-006, Section 8 (E-8: does the guest portal write to `bookings`?).

---

### AUDIT-046 — Reports attribute each booking wholly to its start month, so monthly rows and period totals do not reconcile

1. **Title:** Overlap-based period filtering plus start-month bucketing produces months outside the selected range and totals that differ from the monthly sum.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** The period filter includes any booking that overlaps the range ([src/pages/ReportsView.jsx:226-236](src/pages/ReportsView.jsx#L226-L236)); `monthlyRows` buckets by `getReportsMonthKey` = start month ([src/pages/ReportsView.jsx:651-659](src/pages/ReportsView.jsx#L651-L659), [src/pages/ReportsView.jsx:1359-1400](src/pages/ReportsView.jsx#L1359-L1400)); undated records are in totals under "All Time" but skipped by `monthlyRows` (`if (!monthKey) return`).
8. **Current behavior:** "This Year" can show a December row from the previous year (a Dec 30 – Jan 2 stay) with all its camper days; the year's guest/camper-day totals do not equal the sum of monthly rows when undated records exist.
10. **Expected behavior:** Product decision: count by start month (state it), or prorate nights/camper days by date.
13. **Recommended fix:** Clamp monthly rows to the selected range and document the attribution rule; show an "undated" row so totals reconcile.
15. **Related:** AUDIT-030, AUDIT-047.

---

### AUDIT-047 — Reports treat almost any non-empty deposit text as "received"

1. **Title:** `hasReportsDepositReceived` only rejects six exact strings, so values like "N/A", "TBD" or "No - due 3/1" count as received deposits.
2. **Severity:** Medium
3. **Confidence:** Confirmed
4. **Affected workflows / records:** Reports "Deposits Received" count and amount, CSV summary; Master imports whose `depositReceived` column holds free text.
5. **Evidence:** The status value is `details.depositReceivedDate || booking.depositReceived` ([src/pages/ReportsView.jsx:544-551](src/pages/ReportsView.jsx#L544-L551)); "received" means not in `["no","n","false","not received","pending","0"]` ([src/pages/ReportsView.jsx:561-569](src/pages/ReportsView.jsx#L561-L569)). Master import stores the raw cell text in `depositReceived` ([src/pages/Dashboard.jsx:1911](src/pages/Dashboard.jsx#L1911): `depositReceived: masterImportText(depositStatus)`) and only extracts a date into `depositReceivedDate` when one is present. The importer's own rule for the same cell is stricter (`masterImportYes` / `masterImportUnknown`, [src/pages/Dashboard.jsx:1533-1540](src/pages/Dashboard.jsx#L1533-L1540)).
8. **Current behavior:** A booking with deposit cell "N/A" or "No - waiting" and `deposit = 250` adds $250 to "Deposits Received".
13. **Recommended fix:** Count as received only when `depositReceivedDate` is a date or the text passes `masterImportYes`; treat `masterImportUnknown` values as not received.
14. **Validation plan:** Rows with "Yes", "Rec'd 3/1", "N/A", "No - due", "", and a date → only the positive ones count.
15. **Related:** AUDIT-003, AUDIT-029.

---

### AUDIT-048 — Reports CSV export: unrounded values, no record of the filters used, and unescaped formula-leading text

1. **Title:** The Reports CSV is an aggregate summary that omits its filter context and writes raw floating-point and user text.
2. **Severity:** Low
3. **Confidence:** Confirmed (code); spreadsheet formula evaluation behavior depends on the program opening the file.
5. **Evidence:** `handleExportReports` sections ([src/pages/ReportsView.jsx:1816-1925](src/pages/ReportsView.jsx#L1816-L1925)); `downloadReportsCsv` quotes cells but does not prefix values beginning with `=`, `+`, `-`, `@` ([src/pages/ReportsView.jsx:824-858](src/pages/ReportsView.jsx#L824-L858)). Camper-day totals are sums of `×0.4`/`×0.2` products written without the rounding the screen applies (`formatReportsDecimal`), e.g. `12.600000000000001`. The file has no row stating the date range, status, retreat type or source filter that produced it. There is no per-booking export.
8. **Current behavior:** Two CSVs from different filters are indistinguishable; a retreat-type label such as `=Family` (raw imported text) would be interpreted as a formula by Excel.
13. **Recommended fix:** Add a "Filters" section, round numeric outputs like the UI, and prefix formula-leading cells with `'`.
15. **Related:** AUDIT-014, AUDIT-046.

---

### AUDIT-049 — Contacts "delete" and "star" are per-browser and keyed by a derived ID; identity merging is not transitive

1. **Title:** Hidden or starred contacts depend on an ID computed from the current emails/phones, stored only in localStorage.
2. **Severity:** Low
3. **Confidence:** Confirmed
5. **Evidence:** Deleted contacts and stars live in `localStorage` (`toahNipiContactsViewDeletedContacts`, `toahNipiStarredContacts`) ([src/pages/ContactsView.jsx:15-100](src/pages/ContactsView.jsx#L15-L100), [src/pages/ContactsView.jsx:1043-1110](src/pages/ContactsView.jsx#L1043-L1110)). The contact ID is the alphabetically first email identity, else phone, else name+org (`buildStableContactId`, [src/pages/ContactsView.jsx:305-333](src/pages/ContactsView.jsx#L305-L333)). Grouping attaches a booking to the first contact that matches any identity and never merges two existing contacts ([src/pages/ContactsView.jsx:335-490](src/pages/ContactsView.jsx#L335-L490)). The delete confirmation correctly states that bookings are not deleted.
8. **Current behavior:** A contact "deleted" in one browser is still visible in others; it reappears in the same browser if a new booking adds an email that sorts first (ID changes), and stays hidden — including new bookings — if the ID does not change. Booking 1 (email A), booking 2 (phone P), booking 3 (email A + phone P) yields two contacts instead of one.
13. **Recommended fix:** Use union-find over identities; store hide/star preferences server-side or keyed by every identity of the contact.
15. **Related:** AUDIT-003, AUDIT-039.

---

### AUDIT-050 — Portal assignment duplicate checks are client-side only and use title/file-name matching

1. **Title:** Two staff can assign the same task or document; a custom upload with a standard file name blocks that standard document.
2. **Severity:** Low
3. **Confidence:** Confirmed (client code); database unique constraints Require external verification.
5. **Evidence:** `createTaskAssignmentDraft` marks a task "already assigned" if the loaded record has the same `item_id` or same title ([src/pages/PortalAdminView.jsx:1496-1551](src/pages/PortalAdminView.jsx#L1496-L1551)); `getAssignedStandardFileNames` treats any non-guest document with the same file name as assigned, including custom staff uploads ([src/pages/PortalAdminView.jsx:2029-2044](src/pages/PortalAdminView.jsx#L2029-L2044)). Inserts do not use `onConflict` ([src/pages/PortalAdminView.jsx:822-896](src/pages/PortalAdminView.jsx#L822-L896)). Due dates are optional and not checked against the stay dates; the IV/general `audience` is only a grouping in the panel, not derived from the booking's retreat type (e.g., "InterVarsity Staff").
8. **Current behavior:** With the page open in two browsers, both can add "Sign and return contract", producing two guest tasks.
13. **Recommended fix:** Add a unique index on `(booking_id, item_id)` and `(booking_id, file_name)` for standard documents and upsert with `onConflict`; optionally preselect IV documents for InterVarsity retreat types.
15. **Related:** AUDIT-038, AUDIT-029.

---

<!-- FINDINGS END -->

---

## 5. Intentional differences and harmless inconsistencies

These looked suspicious at first but are supported by code comments, documentation, or have no observable effect. They are **not** defects.

| # | Observation | Why it appears intentional / harmless | Evidence |
|---|---|---|---|
| I-1 | Public submissions live in `guest_inquiries`, separate from `bookings`, until staff convert them. | Explicit design; README describes the separate table and conversion. | [README.md:275](README.md#L275); [src/pages/GuestInquiriesView.jsx:306-310](src/pages/GuestInquiriesView.jsx#L306-L310) |
| I-2 | Converted staff-sheet inquiries stay in `bookings`; the Staff Booking links back via `rentalFormDetails.sourceInquiryId`, and Dashboard home/Pipeline hide the original. | Comment and shared `getInquiryPipelineRecords` implement it consistently in those two places (Reports does not — AUDIT-030). | [src/pages/Dashboard.jsx:9018-9038](src/pages/Dashboard.jsx#L9018-L9038) |
| I-3 | Guest-reported contract/deposit/insurance dates are stored as `guestReported*`, not as official dates. | Comment states they must not become staff "received" dates. | [src/pages/GuestInquiriesView.jsx:472-483](src/pages/GuestInquiriesView.jsx#L472-L483) |
| I-4 | Contact placeholders ("No contact name", etc.) are stripped on read and write. | Documented cleanup of legacy saved placeholders. | [src/services/bookingService.js:17-33](src/services/bookingService.js#L17-L33) |
| I-5 | Alias pairs `name`/`contactName`, `message`/`notes`, `groupSize`/`attendeeCount`, `desiredDates`/`desiredDatesText`. | `dbRowToBooking` populates both from one column, and writers set both; no divergence found. | [src/services/bookingService.js:176-191](src/services/bookingService.js#L176-L191) |
| I-6 | Staff bookings keep `roomName = "Unassigned"` while lodging lives in `buildingsRooms`/RFD. | Readers drop the "Unassigned" placeholder per value (comment at [src/pages/Dashboard.jsx:7742-7745](src/pages/Dashboard.jsx#L7742-L7745)). Not harmless for imported records — see AUDIT-007. | — |
| I-7 | Inquiry Pipeline and Inquiry Spreadsheet exclude Master/Archive records. | Explicit filters and comments ("prevents Master rows from ever appearing"). | [src/pages/InquiryPipeline.jsx:141-150](src/pages/InquiryPipeline.jsx#L141-L150), [src/pages/InquirySpreadsheetView.jsx:69-77](src/pages/InquirySpreadsheetView.jsx#L69-L77) |
| I-8 | Reports exclude Archive records from all metrics. | Intentional (`operationalBookings`, count shown as "archive excluded"). | [src/pages/ReportsView.jsx:1124-1131](src/pages/ReportsView.jsx#L1124-L1131) |
| I-9 | Portal Admin keeps records with existing portal items even if later cancelled/waitlisted/Host. | Comment: Portal Admin is the only place to see their uploads. | [src/pages/PortalAdminView.jsx:538-552](src/pages/PortalAdminView.jsx#L538-L552) |
| I-10 | Dev Mode is a UI convenience gate, not a permission. | Stated in the Edge Function header; RLS is the boundary. | [supabase/functions/verify-dev-mode/index.ts:1-13](supabase/functions/verify-dev-mode/index.ts#L1-L13) |
| I-11 | `/backup` route declared after the `*` catch-all. | React Router v6+/v7 ranks routes by specificity, so `/backup` still matches. | [src/App.jsx:128-133](src/App.jsx#L128-L133) |
| I-12 | `checklists` saved as `null` when not an array; readers treat `null` as `[]`. | Every in-memory booking comes from `dbRowToBooking`, which preserves arrays, so no array is lost. | [src/services/bookingService.js:156](src/services/bookingService.js#L156), [src/components/BookingChecklists.jsx:81-83](src/components/BookingChecklists.jsx#L81-L83) |
| I-13 | Create Booking copies the whole `formData` into `rentalFormDetails`. | Documented as "preserve every field from this detailed staff form"; it is what keeps Staff Bookings self-consistent. | [src/pages/CreateBooking.jsx:2456-2476](src/pages/CreateBooking.jsx#L2456-L2476) |
| I-14 | Master import keeps the original cell text (`imported*Text`, `importWarnings`) instead of guessing. | Header comment: "avoid inventing dates, age groups, housing allocations, or payment information." | [src/pages/Dashboard.jsx:1475-1478](src/pages/Dashboard.jsx#L1475-L1478) |
| I-15 | Backup page states it covers only `bookings`. | Accurate disclosure; the gap itself is AUDIT-010. | [src/components/DashboardBackups.jsx:1462-1478](src/components/DashboardBackups.jsx#L1462-L1478) |
| I-16 | `fetchBookings` and Portal Admin both paginate with `start_date, id` ordering and stop on an empty page. | Same documented reasoning in both places. | [src/services/bookingService.js:257-294](src/services/bookingService.js#L257-L294), [src/pages/PortalAdminView.jsx:695-749](src/pages/PortalAdminView.jsx#L695-L749) |
| I-17 | Create Booking `depositReceivedDate` falls back to the `depositReceived` column. | Only Staff Bookings open Create Booking edit, and for them the column already holds the date written from the same field. | [src/pages/CreateBooking.jsx:1506-1509](src/pages/CreateBooking.jsx#L1506-L1509) |
| I-18 | Portal document catalog file names. | All 14 match files in the (git-ignored) `documents/` folder exactly. | [src/pages/PortalAdminView.jsx:322-431](src/pages/PortalAdminView.jsx#L322-L431) |
| I-19 | Create Booking keeps meal selections for dates outside a changed stay in `mealSchedule`. | `getMealTotals`/`getMealScheduleBounds` count only stay dates, Reports prefer the bounded `numberOfMeals`, and the Overview parses the bounded `meals` summary, so orphan keys are not counted. | [src/utils/dateUtils.js:385-450](src/utils/dateUtils.js#L385-L450) |
| I-20 | Status is not a Master Spreadsheet column but remains a filter; saved views drop removed column IDs. | Deliberate (recent commit "Hide status column"); `normalizeSpreadsheetSettings` strips `standard:Status` etc. from older views. | [src/pages/SpreadsheetView.jsx:999-1046](src/pages/SpreadsheetView.jsx#L999-L1046) |
| I-21 | Contacts "delete" only hides a contact. | The confirmation says bookings are not deleted, and a restore list exists. Per-browser scope is AUDIT-049. | [src/pages/ContactsView.jsx:1055-1060](src/pages/ContactsView.jsx#L1055-L1060) |
| I-22 | Inquiry Pipeline status actions do not call `getConsistentWaitlistState`. | Each action passes the matching explicit `waitlist` value, so the saved pair is consistent (see R-4). | [src/pages/InquiryPipeline.jsx:755-815](src/pages/InquiryPipeline.jsx#L755-L815) |
| I-23 | Portal confirm only moves `needsReview → completed` and does not check affected rows. | The update is guarded by `.eq("status","needsReview")` and the list reloads afterwards, so a no-op is visible to staff. | [src/pages/PortalAdminView.jsx:3749-3817](src/pages/PortalAdminView.jsx#L3749-L3817) |

---

## 6. Duplicated constants and logic

"Differs now" = the copies currently produce different results (a live bug, cross-referenced). "Consolidation" = copies agree today but can drift.

| Concept | Locations | Differs now? | Suggested single home |
|---|---|---|---|
| Lodging buildings / aliases / capacities | CreateBooking `lodgingFields`; BookingHousingTab `housingRows`; LodgingCalendarView `LODGING_BUILDINGS`; Dashboard `DASHBOARD_HOME_BUILDINGS`; ReportsView `REPORTS_HOUSING_CONFIG`; constants `defaultRoomRows` (dead) | **Yes** (AUDIT-031, 005) | `src/constants/lodgingConstants.js` |
| Lodging summary builder | CreateBooking `buildLodgingSummary`; BookingHousingTab `buildLodgingSummary` (+ camping append) | **Yes** (AUDIT-005) | `src/utils/lodgingUtils.js` |
| Linen summary builder | CreateBooking inline `linenSummary`; BookingHousingTab `buildLinenSummary` | No (same strings) | `lodgingUtils.js` |
| Booking status options | Edit tab list (incl. "Imported"); Create Booking `<select>` | **Yes** (AUDIT-032) | `src/constants/bookingStatus.js` |
| Text → status mappings | `getMasterImportStatus`; `getGuestGroupInquiryStatus`; `getStatusFromInquiryDisposition`; `getStatusFromStage` (dead); `getInitialBookingStatus` | **Yes** (different defaults/precedence) | `src/utils/bookingStatus.js` |
| Inactive/active booking rule | `isDashboardHomeInactiveBooking`; `isPortalEligibleBookingRow`; `getInquiryPipelineColumnKey`; Reports/Calendar/Jobs (none) | **Yes** (AUDIT-034) | `bookingStatus.js` |
| `isStaffBookingRecord` | Dashboard.jsx 4315; InquiryPipeline.jsx 126; inline in PortalAdminView, ReportsView | No | `src/utils/bookingSource.js` |
| `getRentalFormDetails` | ContactsView, ReportsView, InquiryPipeline (+ inline `booking.rentalFormDetails || {}` elsewhere) | No | `bookingUtils.js` |
| Field precedence (column vs RFD) | Contacts (RFD first), Reports (RFD first), Overview (mixed), Create Booking (RFD first), Dashboard home (column first) | **Yes** (AUDIT-003) | `bookingUtils.js` getters (`getBookingNights`, `getBookingGuestCount`, …) |
| Guest-count parsing | Dashboard home `getDashboardHomeGuestCount`; Reports `getReportsNumber`; Contacts `getBookingGuestCount`; Master import | **Yes** (AUDIT-018) | `bookingUtils.js` |
| "Unknown" value detection | `masterImportUnknown`; `hasPortalEligibilityValue`; Pipeline/Reports `isBlankBookingValue`; `dashboardHomeHasValue`; `dashboardHomeHasLodgingValue` | Minor (sets differ: e.g. "no" counts as blank only in lodging check) | `bookingUtils.js` |
| Contact placeholder cleaning | bookingService `CONTACT_PLACEHOLDER_VALUES`; CreateBooking `cleanInquiryPrefillValue`; ContactsView `cleanContactText` (also strips "Unassigned", "Unnamed Organization"); Dashboard `getBookingContacts` inline checks | Minor | bookingService export |
| Phone formatting / digits | CreateBooking `getPhoneDigits`/`formatPhoneNumberInput`; Dashboard `formatSecondaryContactPhone`; ContactsView `normalizePhoneIdentity` | No | `src/utils/contactUtils.js` |
| Meal totals | dateUtils `getMealTotals(formData)` (stay-date bounded); GuestInquiriesView local `getMealTotals(schedule)` (unbounded); Reports inline schedule count; Master import `parseMasterImportMeals` | Minor (unbounded versions count meals outside the stay dates) | dateUtils |
| Meal type keys | `MEAL_TYPES` constant; hard-coded `["breakfast","lunch","dinner"]` in GuestInquiriesView, Reports, Master import | No | `mealConstants.js` |
| Camper-day formula (0.4 / 0.2) | Reports `getReportsCamperDaysDetails`; CreateBooking day-camper `× 0.2`; Master sheet stored value | No (same coefficients), but stored-value precedence differs (AUDIT-035) | `src/utils/camperDays.js` |
| Date-only parsing/formatting | dateUtils `formatDate`, `getLocalDate`, `parseDateInputAsUTC`; GuestInquiriesView `formatDate`; LodgingCalendar `parseDateOnly`; Pipeline `formatPipelineDate`; InquiryRecordDetail `getDateInputValue` (UTC); `formatExcelDateValue` (local) vs `parseMasterImportDate` (UTC) | **Yes** for Excel (AUDIT-013) | dateUtils |
| `formatDateForInput` | Dashboard, BookingChecklists, JobsView, ReportsView | No | dateUtils |
| `normalizeStaffName` | Dashboard, BookingChecklists, JobsView, BookingStaffAssignmentsTab | No | `staffUtils.js` |
| Retreat type lists/buckets | CreateBooking `retreatTypes`; constants `RETREAT_TYPE_CONFIG`/`getRetreatTypeConfig` (unused); Reports `REPORTS_RETREAT_TYPE_COLORS` keyed by bucket names that Reports never produces (it uses raw text) | **Yes** (AUDIT-042) | `retreatTypes.js` |
| Activity locations | CreateBooking `activityOptions`; constants `activityLocations` (dead, mismatched aliases) | Only in dead code | constants |
| Year lists (2025–2027) | importers, detectors, menu, Inquiry Spreadsheet, constants raw-column sets | **Yes** for future years (AUDIT-024) | derive from data |
| Supabase pagination loop | bookingService `fetchBookings`; PortalAdminView `fetchPortalOverviewRecords` | No | shared `fetchAllPages` helper |

---

## 7. Prioritized remediation plan

Priority = impact × likelihood × reach, adjusted for dependencies. Revised in pass 2: AUDIT-001 moved down (no current observable loss), AUDIT-011 moved down (narrowed to Pipeline column placement), AUDIT-004 lowered to Medium; AUDIT-045 and AUDIT-047 added. README already documents AUDIT-009/010 and the AUDIT-001 hazard; that lowers surprise but not impact.

### 7.1 Immediate data-integrity / operational problems

1. **AUDIT-006 — Master re-import resets status/waitlist and overwrites sheet-filled fields.** Most likely silent loss in routine use. Quick mitigation: correct the confirmation text and stop overwriting status when it came from the year default.
2. **AUDIT-003 — dual copies on Master records.** Wrong contacts and report totals after Edit-tab corrections. Run the divergence query (Section 8, E-9) first. **Coordinate** Edit-tab mirroring with consumer precedence.
3. **AUDIT-045 — full-row upserts / Checklists save race.** Lost updates under quick clicks or two editors. Small guard in Checklists now; precondition on `updated_at` later.
4. **AUDIT-020 — Lodging Calendar availability counts cancelled bookings.** Affects booking decisions. **Coordinate** with the AUDIT-034 classification helper.
5. **Persistence and backup group — AUDIT-009, AUDIT-010, AUDIT-038, AUDIT-001.** Ranked together: 009/010 are high-impact but only triggered by Replace (README says not to use it on production), so the immediate step is a UI warning or disabling Replace; then restore `portal_token`/`created_at` (001's only real gap), back up portal tables, and persist Storage paths. AUDIT-001's other keys are maintenance (7.4).
6. **AUDIT-044, AUDIT-004, AUDIT-008 — guest-inquiry conversion integrity.** Hide Fill Test Data; carry the guest inquiry ID in the seed; surface conversion errors.
7. **AUDIT-019 — Inquiry Record Detail resets status.** One-line comparison fix.
8. **AUDIT-027 — public inquiry CORS** (verify first; if broken, website inquiries never arrive).

### 7.2 Important consistency fixes

9. **AUDIT-034** classification helper (unblocks 011, 016, 020, 030, 032).
10. **AUDIT-007 / 005 / 031** lodging: one constants module (including the Overview card) and one summary builder; Housing tab owns `roomName`. **Coordinate** 005 with 007.
11. **AUDIT-013** Excel date shift — **coordinate** with a data repair and the guest-inquiry identity rule.
12. **AUDIT-047** deposit-received rule; **AUDIT-030 / 015 / 035 / 046** reporting (after 034 and 003).
13. **AUDIT-023** role-aware UI and delete-count checks.
14. **AUDIT-043** facilities in Jobs (after the product decision), **AUDIT-016 / 017** staff identity and Jobs.
15. **AUDIT-029** portal ↔ timeline linkage (product decision first).
16. **AUDIT-021** commit production schema as migrations (enables testing all of the above).
17. **AUDIT-011** Pipeline column precedence (low reach while the route is hidden).

### 7.3 Lower-priority improvements

18. AUDIT-024 (new workbook years — urgent once 2028 sheets arrive), AUDIT-014, AUDIT-048, AUDIT-012, AUDIT-018, AUDIT-036, AUDIT-039, AUDIT-049, AUDIT-050, AUDIT-042, AUDIT-026, AUDIT-022, AUDIT-032, AUDIT-037 (after business confirmation), AUDIT-028.

### 7.4 Optional cleanup

19. AUDIT-001 (allow-list of raw keys), AUDIT-002, AUDIT-033, AUDIT-025, AUDIT-040, AUDIT-041, and the consolidation-only rows in Section 6.

---

## 8. External verification and open questions

No credentials or data values are included. Each item lists what to check and the evidence that settles it.

| # | What to check | Why it matters | Evidence needed |
|---|---|---|---|
| E-1 | Actual DDL of `bookings` (column types, especially `activities`, `start_date`, `attendee_count`; `portal_token` default) | AUDIT-002, 009 | `select column_name, data_type, column_default from information_schema.columns where table_name='bookings'` |
| E-2 | Existence and DDL of `guest_inquiries`, `portal_checklist_items`, `portal_documents`; FK `on delete` rules | AUDIT-010, 021 | `pg_constraint` / `information_schema.referential_constraints` for FKs referencing `bookings` |
| E-3 | RLS policies on all five tables and Storage policies for `portal-uploads` | AUDIT-008, 023, 038 | `pg_policies` output; Storage policy list; confirm every `authenticated` policy uses the staff helper functions |
| E-4 | `guest_inquiries.submitted_at` default | Inquiry ordering; Edge Function never sets it | column default |
| E-5 | Deployed Edge Function versions match the repo; whether `withSupabase` (`npm:@supabase/server`) answers CORS preflight | AUDIT-027 | Function source in dashboard; a browser submission from the real public form origin (network tab) |
| E-6 | Hosted Auth settings (signup disabled, anonymous sign-ins off) — local `config.toml` has `enable_signup = true` | Security model in SQL_SETUP | Auth settings screen |
| E-7 | `VITE_GUEST_PORTAL_BASE_URL` set in the production build | AUDIT-022 | Hosting environment variables |
| E-8 | How the guest portal derives Storage paths and authorizes by token | AUDIT-038, 009 | Guest portal source / `portal_upload_path_is_allowed` definition |
| E-9 | Data divergence for Master records | AUDIT-003 size | e.g. `select count(*) from bookings where raw_data->'rentalFormDetails'->>'email' is distinct from email and source_type like 'Master%'` (repeat for contact_name, phone, start_date, nights) |
| E-10 | Rows whose status/waitlist pair disagrees (pass 2: no code path found that produces this, so this is a data sanity check, not evidence for AUDIT-011) | AUDIT-019, AUDIT-034 | `select id, status, waitlist from bookings where (waitlist='Yes') <> (status ilike '%wait%')` |
| E-11 | `activities` values that look like JSON | AUDIT-002 | `select count(*) from bookings where activities like '[%'` |
| E-12 | Raw-only keys still recoverable | AUDIT-001 | `select count(*) from bookings where raw_data ? 'inquiryDisposition'` |
| E-13 | Whether a Replace restore was ever run | AUDIT-009/010 | clustering of `created_at`; portal rows without bookings; Storage objects without rows |
| E-14 | Guest inquiries possibly mislinked or left pending after conversion | AUDIT-004/008 | join `guest_inquiries.converted_booking_id` → `bookings.organization_name`; pending inquiries whose id appears as `sourceInquiryId` |
| E-15 | Google Apps Script backup mapping | Whether automated backups have the same gaps as AUDIT-009 | Apps Script source (`createDailyBookingBackup`) |
| E-16 | Browser time zone of staff machines | AUDIT-013 magnitude | Confirm Eastern Time |
| E-17 | Whether the guest portal (or its security-definer functions) writes to `bookings` columns | AUDIT-045 — staff full-row upserts would overwrite guest-side writes | Function definitions (`pg_proc`) and guest portal source |
| E-18 | Unique constraints on `portal_checklist_items(booking_id, item_id)` and `portal_documents(booking_id, file_name)` | AUDIT-050 | `pg_indexes` for both tables |
| E-19 | Whether any test bookings created with "Fill Test Data" exist in production | AUDIT-044 | `select id, created_at from bookings where organization_name = 'Test Community Church'` |
| E-20 | Deposit text values in Master records | AUDIT-047 size | `select deposit_received, count(*) from bookings where source_type like 'Master%' group by 1` |

**Business questions for staff:**
- Q-1: On re-import, which fields should the spreadsheet own and which belong to the app? (AUDIT-006)
- Q-2: Should cancelled/waitlisted groups appear on calendars at all, or with a toggle? (AUDIT-020)
- Q-3: Is lodging availability night-based (departure day free) or day-based? (AUDIT-037)
- Q-4: Should confirming the portal "contract"/"deposit"/"insurance" items update the booking timeline and status? (AUDIT-029)
- Q-5: Should Reports totals default to active bookings only? (AUDIT-030)
- Q-6: Should staff bookings without a contract be "Inquiry" or a distinct status? (AUDIT-034)
- Q-7: How should guest-count ranges ("40-50") be counted? (AUDIT-018)
- Q-8: Is "Export Excel" meant as a contact list or a full data export? (AUDIT-014)
- Q-9: Are staff assignments tasks to complete or informational? (AUDIT-016)
- Q-10: Canonical retreat-type list and source taxonomy. (AUDIT-036, 042)

---

## 9. Completion and continuation notes

**Status:** Pass 2 complete for the repository-level static scope at revision `16dd827`. 50 findings (AUDIT-001 to AUDIT-050). Every area that pass 1 listed as partially reviewed has now been read for data handling (Section 2.4). This is **not** a full audit of the system: the deployed database, Storage, Edge Function deployments, the guest portal, the public inquiry form, the Apps Script backups, and all runtime behavior remain unverified.

**What pass 2 covered:** Create Booking inputs (every `name`/`value` pair, row editors, meal grid, validation, submit, edit prefill); Booking Overview field reads; User Admin handlers; Checklists edit/complete/delete; Portal Admin task/document assignment, confirm, and upload; Reports monthly rows, totals, deposit logic and CSV; Contacts grouping, starring, hiding, sorting, search; Spreadsheet saved views and persisted settings; Inquiry Pipeline actions. Rechecked AUDIT-001, 003, 004, 006, 008, 009, 010, 011, 019.

**Remaining repository work (presentation only, low expected yield):** CalendarView/LodgingCalendarView week/year rendering; Spreadsheet settings drawer markup; README sections not cited in this report.

**Remaining runtime checks (test project, not production):** AUDIT-002 storage format, AUDIT-013 date shift under an Eastern-time browser, AUDIT-026 remount, AUDIT-027 CORS from the real form origin, AUDIT-045 concurrent-save behavior, AUDIT-009 token regeneration.

**Searches already done (no need to repeat):** all `.from(`/`storage`/`functions.invoke`/`localStorage` call sites; booking property names read across `src`; status literals per file; dead-code reference counts (AUDIT-033); `submittedAt` consumers; lodging alias lists; retreat-type helper usage; Create Booking `name=` vs `formData.*` keys; `stageOfGroup` and `sourceInquiryDisposition` writers; consumers of Create-Booking-only fields (`notificationDate`, `ethnicBreakdown`, `paymentMethod`, `facilities`, `guestReported*`).

### Revision log (pass 2, 2026-10-28)

- **R-1 — AUDIT-001 downgraded Medium → Low.** Counterevidence: every writer of `inquiryDisposition` also writes `stageOfGroup` with the same text, and `normalizeInquiry` re-derives it; `facilities` and numeric `linenPieces` are also stored in `rentalFormDetails`; first/last names survive in `rawSpreadsheetData`. Pass 1's "the original disposition is gone if staff edit `stageOfGroup`" was hypothetical — no screen edits it independently. The remaining real gap is the unmapped `created_at`.
- **R-2 — AUDIT-004 downgraded High → Medium** and its trigger conditions stated (single page session, specific abandon-then-start sequence; reload or the Form/New Booking buttons clear it). Added the "already converted inquiry gets its link overwritten" consequence and a second trigger (AUDIT-044).
- **R-3 — AUDIT-006 narrowed.** Pass 1 implied notes, contacts and lodging are always overwritten. Correction: only fields with a non-empty sheet value are overwritten, except `status`, `waitlist`, `roomName` ("Unassigned"), source metadata and some `rentalFormDetails` import keys, which are always replaced. Severity unchanged (High) because status resets to the year default.
- **R-4 — AUDIT-011 rewritten and downgraded Medium → Low.** Pass 1 claimed Pipeline status changes leave `waitlist = "Yes"`. That was wrong: each Pipeline action passes an explicit `waitlist` value, and the Dashboard handler keeps it. Pass 1's statements that Dashboard home treats such records as inactive and Portal excludes them were therefore also wrong. The confirmed remaining defect is Pipeline column precedence based on the original disposition.
- **R-5 — AUDIT-008 strengthened:** `.single()` makes a zero-row update an error, so the failure is detected but hidden from staff.
- **R-6 — AUDIT-009 / 010 / 002 / 027 wording:** separated confirmed repository behavior from database or runtime consequences (column default, FK cascade, PostgREST coercion, CORS). AUDIT-009 notes the in-app coverage list and README warnings.
- **R-7 — AUDIT-003 narrowed** to Master-imported records; status divergence noted as having no visible effect today.
- **R-8 — AUDIT-016 / 020 / 030 / 034:** distinguished legitimate per-screen inclusion policies from contradictory classification rules.
- **R-9 — AUDIT-017, 019, 031 extended** with User Admin, reachability and Overview lodging-card evidence.
- **R-10 — Added AUDIT-043 to AUDIT-050** from the newly reviewed areas.
