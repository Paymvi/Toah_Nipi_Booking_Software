# Code cleanup plan (2026-11-18)

Goal: clearer internal structure, no change in what the app does or how it looks. Same rules as the CSS cleanup (docs/CSS_GUIDE.md): nothing visible changes, and every stage is checked against HEAD.

## Baseline (HEAD 26988ee, clean tree)

- `npm test`: 306 pass, 0 fail.
- `npx eslint .`: 0 problems.
- `vite build`: succeeds (the usual >500 kB chunk warning).

## What the inspection found

1. **`src/pages/Dashboard.jsx` is 10,307 lines and holds about six modules.** A dependency scan of its top-level code shows clean seams:
   - the booking detail screen (overview in Compact and Large, edit form, incident notes, date settings modal), lines 233–6256, about 5,800 lines. None of it reads Dashboard state.
   - the User Admin page (`UserAdminView`).
   - the workbook import parsers (sheet type detection, Guest Group Inquiry rows, bulk ids). These are pure functions.
   - staff-user storage helpers and dashboard-home helpers.
   - the `Dashboard` component itself (3,400 lines). It stays in place.
2. **`src/pages/PortalAdminView.jsx` is 5,000 lines.** It contains Supabase read and write helpers and four large panels (checklist preview, task panel, document panel, record card) next to the screen.
3. **`src/pages/SpreadsheetView.jsx`** contains a 1,165-line settings modal.
4. **Seven helpers are copied word for word** in two files each (`formatDateForInput`, `getStartOfWeek`, `addDays`, `getTodayInputValue`, `isStaffBookingRecord`, checklist sorting, booking-details lookup).
5. **A little dead code.** Unused exports (`INQUIRY_PIPELINE_COLUMNS`, `getLodgingBuilding`, `getLodgingBuildingFieldKeys`, `getTargetScope`, `REPORT_SOURCES`, `getRawRowNotes`, `upsertBookings`), re-exports nobody imports, an import in the middle of a file, and scattered blank lines in import lists.

## Stages

Each stage gets: a diff review, then tests, lint and build, then a byte comparison of the built CSS against HEAD, then a browser comparison where screens are affected.

1. **Dashboard split (code moves only).** Function bodies stay unchanged. They are moved by a script that copies the exact source text and rebuilds the imports.
   - `src/components/bookingDetail/`: the detail view, the overview, the edit form, incident notes, the date settings modal, and their helpers.
   - `src/pages/UserAdminView.jsx`.
   - `src/utils/workbookImport.js`, `src/utils/staffUsers.js`, `src/utils/dashboardHome.js`, `src/components/DashboardHomeSchedule.jsx`.
2. **PortalAdminView split.** The data helpers go to `src/services/portalAdminData.js` and the panels to `src/components/portalAdmin/`. The tutorial-guard test that reads the source is pointed at the new files, with the same assertions.
3. **SpreadsheetView settings modal.** On closer inspection it can't be opened: both of its buttons were commented out in 5ce80d2. So it is removed rather than moved, along with the code that only fed it.
4. **Duplicates and dead code.** The verbatim copies are replaced with imports of the shared helper. Unused code is removed after a full reference check (static and dynamic imports, strings, tests, `supabase/`, docs).
5. **Small tidy-ups** in the files already touched: import grouping and stale comments.

## Left alone on purpose

- `ReportsView.jsx`. It is frozen as the "Original" reports view.
- The body of the `Dashboard` component, the `CreateBooking` form state, and the `GuestInquiriesView`/`ContactsView` screens. They are large single components with shared state, and splitting them safely needs stronger tests than exist.
- Migrations, edge functions (`supabase/functions`), sibling repos, dependencies.

## Verification

- Unit tests, lint and build after every stage.
- The built CSS compared with HEAD's build. Moved imports must not reorder `CopyButton.css` or `PortalEmail.css`.
- The CSS-cleanup capture tool: computed style, box and DOM path for every element on about 30 office screens (booking tabs, Large/Compact, night theme, dialogs, tutorial), at 5 widths. It runs against a HEAD build and a working-tree build on the fictional mock.
- The existing browser suites (`tests/browser/*`) for interactions: tutorials, backups, portal, signing, reports, capacity warnings, lazy libraries, storage events.
