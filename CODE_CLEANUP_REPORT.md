# Code cleanup report (2026-11-18)

This cleanup reorganised the code without changing what the app does or how it looks, following the same rule as the CSS cleanup. Nothing was committed. The plan is in [CODE_CLEANUP_PLAN.md](CODE_CLEANUP_PLAN.md).

**No visual or behavioural change was intended.** Every moved function is byte-identical to HEAD. The only removed code was unreachable or unused.

## What changed and why

### 1. Dashboard.jsx: 10,307 → 3,739 lines

The dashboard shell held about six unrelated modules. Each is now in its own file, unchanged. The `Dashboard` component itself (routing, data loading, imports, exports) was not touched.

| New file | What it holds |
|---|---|
| `src/components/bookingDetail/BookingDetailView.jsx` | The booking detail screen (header, tabs) |
| `src/components/bookingDetail/BookingOverview.jsx` | Overview tab (Compact and Large) |
| `src/components/bookingDetail/BookingOverviewCompact.jsx`, `BookingOverviewLarge.jsx` | Density-specific sections |
| `src/components/bookingDetail/BookingOverviewParts.jsx` | Shared building blocks (section, field grid, empty row, …) |
| `src/components/bookingDetail/BookingOverviewHeader.jsx` | Summary, portal link, density control |
| `src/components/bookingDetail/BookingMealsProgramOverview.jsx`, `BookingIncidentNotesCard.jsx` | Meals and incident notes cards |
| `src/components/bookingDetail/BookingDetailsEditForm.jsx`, `BookingDateSettingsModal.jsx` | Edit tab, Date Display modal |
| `src/components/bookingDetail/bookingOverviewValues.js`, `bookingDetailSettings.js` | Value formatting; saved date and density preferences |
| `src/pages/UserAdminView.jsx` | User Admin page |
| `src/utils/workbookImport.js` | Sheet type detection, Guest Group Inquiry rows, import ids (pure functions) |
| `src/utils/staffUsers.js`, `src/utils/secondaryContact.js` | Staff-user storage helpers, secondary contact reader |
| `src/utils/dashboardHome.js`, `src/components/DashboardHomeSchedule.jsx` | Dashboard home rules and schedule rows |

Dashboard's import list was regrouped. A mid-file import was moved to the top, and a duplicate `bookingService` import was merged; a script confirmed that the same 129 names are imported from the same modules.

### 2. PortalAdminView.jsx: 4,998 → 1,269 lines

- `src/services/portalAdminData.js`: Supabase and Storage reads and writes, record normalisation, the staff upload rules, and the request-id helper that prevents double inserts.
- `src/components/portalAdmin/`: `PortalRecordCard`, `PortalChecklistPreview`, `PortalTaskAssignmentPanel` (with the task catalog), and `PortalDocumentAssignmentPanel` (with the document catalog).

The tutorial test that checks every saving control carries `data-tutorial-guard` now reads `src/components/portalAdmin/`, where those controls live. Its assertions are unchanged.

### 3. Unreachable Master Spreadsheet settings modal removed (about 1,660 lines)

Commit 5ce80d2 ("Replace settings with year toggle", 2026-09-02) commented out both buttons that opened `SpreadsheetSettingsModal`, so it could not open. The following were removed:

- the modal itself;
- the commented-out buttons;
- the helpers, memos and handlers that only fed the modal: saved-view editing, column categories, and import schema chips;
- `SPREADSHEET_ESSENTIAL_COLUMN_LABELS`.

The saved-views list is still read on load and written back as before, so a previously saved default view still applies. To bring the modal back, restore it from HEAD 26988ee.

### 4. Copied helpers replaced with one shared version

Each pair below was verified to behave the same before merging:

- `addDays`: CalendarView, LodgingCalendarView, Dashboard → `utils/dateUtils`.
- `getStartOfWeek`, `formatDateForInput` and `getTodayInputValue` were added to `utils/dateUtils`. They replace copies in the calendars, Checklists, Jobs, Create Booking and Inquiry Pipeline.
- `normalizeStaffName` (Checklists, Staff Assignments, Jobs) → `utils/staffUsers`.
- `isStaffBookingRecord` (booking detail, `utils/inquiryPipeline`) → `utils/bookingClassification`.
- `getRentalFormDetails`/`getDetails` (Contacts, Inquiry Pipeline, `utils/inquiryPipeline`, `bookingClassification`) → `bookingFields.getBookingDetails`.

### 5. Dead code removed

Each item was checked against static and dynamic imports, strings, tests, `supabase/` and docs before removal:

- `INQUIRY_PIPELINE_COLUMNS` and its five icon imports;
- `getLodgingBuilding`, `getLodgingBuildingFieldKeys`;
- `getTargetScope`;
- `REPORT_SOURCES`;
- `getRawRowNotes`;
- `upsertBookings` (unused; imports and restores use other paths);
- unused re-exports in `bookingService.js`.

### 6. Docs and tests

- Living docs that pointed at moved code were updated: DEVELOPER_REFERENCE, BACKUP_AND_RECOVERY, SECURITY_AND_ACCESS, portal-signing/SETUP, tutorials/GUEST_INQUIRY_TO_PORTAL, src/docs.
- Two stale claims were corrected:
  - Large imports no longer go through `upsertBookings()`. They save one row per request.
  - The Master Spreadsheet no longer has configurable columns.
- New `tests/workbookImport.test.js` (6 tests) pins the Guest Group Inquiry id matching (AUDIT-013): moved rows, rows dated one day early, repeated rows, edited rows, and claimed ids. This logic was untestable while it lived inside Dashboard.jsx.

## Folder structure (new folders only)

```text
src/components/bookingDetail/   booking detail screen (12 files)
src/components/portalAdmin/     Portals screen panels (4 files)
src/services/portalAdminData.js
src/utils/{workbookImport,staffUsers,secondaryContact,dashboardHome}.js
```

## Verification

Each stage was checked against a build of HEAD 26988ee. The fictional mock and the local Docker stack were used throughout: no live data, no emails, no deploys.

| Check | Result |
|---|---|
| `npm test` | 312 pass, 0 fail (306 before plus 6 new) |
| `npx eslint .` | 0 problems (unchanged). No rules were disabled. |
| `vite build` (mock and stack env) | Succeeds. **Built CSS is byte-identical to HEAD**, with the same content hashes, after every stage. So moved imports did not reorder `CopyButton.css` or `PortalEmail.css`. |
| Moved-code identity script | All 110 Dashboard and 52 PortalAdminView top-level declarations are byte-identical to HEAD; only `export` was added. The remaining SpreadsheetView declarations are identical too, except `BookingSpreadsheetView`, where the only edits are the removed modal pieces and the setter-less saved-views state. |
| Computed-style capture (the CSS-cleanup tool, extended) | 242 states compared on every element: computed style, box and DOM path. Covers office screens and booking tabs (Compact and Large, Edit, Housing, Staff, Checklists, Date Display modal), Portals record panels, User Admin, inquiry and hosting detail, tutorial library and step, phone drawer, Night theme, and staff app screens on the local stack. Run at 1440, 1100, 960, 820 (touch) and 390 (touch) widths. **200 identical.** The other 42 were re-checked by re-capturing HEAD. Every remaining difference is one of two kinds that HEAD also shows against itself: the staff app's clock text, and React `useId` counters inside the gnome SVG, with identical pixels. No console errors or dialogs appeared in any state. |
| Browser suites, working tree | Passed: backups, portalSigning, storageEvents, lazyLibraries, capacityWarnings, libraryEdges, libraryRuns, journeyRuns, journeyEdges. |
| Browser suites with HEAD-matching failures | The same failures happen on HEAD's build, so they come from the test setup and are not regressions (details below). |

Notes on the suites that fail on both HEAD and the working tree:

- **reports**: it looks for the old tutorial title "Read your reports". A scratch copy using "Reports" passes on both trees.
- **portalEdges**: the mock predates the staff app and counts the read-only `staff_app_me` RPC as a write. One check also needs a Vite dev server. A scratch copy that treats `staff_app_me` as a read and runs on dev servers gives **24 of 27 on both trees, with the same 3 failing**. Those 3 time out waiting for library and form elements, which looks like stale expectations.
- **portalRuns**: the walkthrough sees 55 of 56 expected steps at all three sizes. Every topic run passes on both trees.
- **staffApp**: run on the local stack, 205 pass and 12 fail on both trees. The failures are date-seeded rows ("Staff Training Lunch" and similar), so the stack's seed data needs a re-seed.

**What was only inspected, not exercised:**

- staffOrders: it writes to the local stack. The Orders code was not touched.
- Real Master workbook imports, Full Replace restore, real email sending and real signing. Their code was either not touched or only moved byte-for-byte. The import id logic now has unit tests.
- Printed and PDF output: the CSS is byte-identical and the markup is unchanged.

## Left alone on purpose

- **ReportsView.jsx** is frozen as the "Original" reports view, so its own copies of `getRentalFormDetails` and `formatDateForInput` remain.
- **The Dashboard component body (3,400 lines), CreateBooking (one 2,650-line component with form state), GuestInquiriesView and ContactsView** are single large components with shared state, effects and unsaved-edit handling. Splitting them safely needs interaction tests that do not exist yet.
- **Small duplicates that cross areas:** `sortChecklistItems` in BookingChecklists and `sortBySequence` in jobsUtils; `fromToday` in the two tutorial demos. Merging them would gain little.
- **Migrations, edge functions, dependencies and sibling repositories** were not touched.

## Found but not changed (follow-ups)

- **Leftover CSS:** the `.spreadsheet-settings-*` modal rules in `src/styles/views/SpreadsheetView.css` are now unused. They were left because the CSS cleanup's rule is that styles change only with a computed-style check.
- **Saved Spreadsheet views:** they can no longer be created or edited. A default view saved before September 2026 still applies silently, and there is no button to clear it. This is a product decision for the user.
- **Upload types:** `SECURITY_AND_ACCESS.md` already notes that the staff upload picker offers HEIC and TXT, which the bucket rejects. This is pre-existing and was not changed.
- **Pre-existing failures:** `npm test`, lint and build were clean at baseline. Four optional browser suites fail on HEAD as well:
  - `reports.browser.mjs` uses an old tutorial title.
  - `mockSupabase.mjs` does not know `staff_app_me`, which breaks `portalEdges`.
  - `portalRuns` expects 56 walkthrough steps but sees 55.
  - The `staffApp` suite needs the local stack re-seeded.

  All four should be refreshed separately. They were not edited here, because the brief was not to change tests to fit.
