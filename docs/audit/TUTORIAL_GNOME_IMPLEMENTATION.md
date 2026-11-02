# Tutorial Gnome V1 implementation and validation

See [TUTORIAL_GNOME_AUDIT.md](../../TUTORIAL_GNOME_AUDIT.md) for the application audit written before implementation and the complete future tutorial inventory.

## Delivered experience

The authenticated staff Dashboard now has a bottom-right SVG gnome and searchable help panel. Four tutorials support both “Walk me through it while I do it” and “Show me how to do it”:

1. Prepare a new booking: actual Form navigation, form-section guidance, isolated fictional group/date/count practice, and an explicit explanation of the real save boundary.
2. View a booking and its Overview: actual Master Spreadsheet navigation, search guidance, group selection, verified profile/Overview state, and tab orientation. Demo profiles are fictional.
3. Navigate the Calendar: actual Month/Week/Year transitions, next-month state verification, return to current month, and exception/agenda explanation.
4. Access and read Reports: actual Reports navigation and interactive Custom Date Range state, range/summary/camper-days/export explanations. Demo filters are simulated so saved report preferences remain untouched.

Both modes have Previous, appropriate Next/Finish, Pause/Resume, Restart, Exit, completion/replay and bounded target recovery. Skipped steps produce an explicit incomplete result. Completion IDs persist in localStorage, with corrupt/blocked-storage handling. Practice inputs are ephemeral and never persisted. Tours are not automatically restored or started on reload.

## Architecture

- `src/tutorials/registry.js`: metadata, learning steps, expected state descriptors, mode-specific explanations/simulations and a finite safe-action allow-list.
- `src/tutorials/model.js`: pure session reducer, stale-transition protection, expected-state comparison, practice validation, completion persistence and dialogue positioning.
- `src/tutorials/TutorialGnome.jsx`: staff launcher, search/categories, mode selection, completion IDs and replay entry point.
- `src/tutorials/TutorialEngine.jsx`: execution lifecycle, verified state progression, safe demonstration dispatch, timing, controls, focus management and missing-target recovery.
- `src/tutorials/targets.js`: explicit `data-tutorial` lookup that rejects non-rendered keepalive targets.
- `src/tutorials/TutorialSpotlight.jsx`: body-portal dimming, target outline, moving pointer and demo input shield.
- `src/tutorials/TutorialPractice.jsx`: clearly labelled fictional forms, profile and report content, independent of application forms and services.
- `src/tutorials/Gnome.jsx`: original reusable SVG with consistent red hat, warm face/beard, green tunic/belt/boots, greeting/idle/thinking/celebration treatment.
- `src/tutorials/tutorials.css`: namespaced styling, viewport bounds, focus indicators, launcher clearance and reduced-motion support.

Only five existing application files changed: Dashboard.jsx (staff mount, navigation/profile state markers), CreateBooking.jsx (form section/save targets), SpreadsheetView.jsx (search and group link targets), CalendarView.jsx (buttons/rendered mode/period markers) and ReportsView.jsx (filter/state/summary/formula/export targets). No existing service, save path, auth gate, database schema or dependency was changed.

Interactive action steps observe explicit state rendered by the application; no application target click is accepted as proof of success. Reading steps use deliberate acknowledgement. Practice checks meaningful field values. The reducer rejects paused, stale and duplicate advancement. A stable effect event keeps parent rerenders from restarting navigation timers. Per-step facts preserve the calendar baseline and prevent replaying demo actions on resume.

Demonstration actions can only navigate to Form, Master Spreadsheet, Calendar or Reports, or invoke one of five explicit non-submit Calendar display buttons. The engine has no Supabase, booking-save, import, delete or restore-service dependency. Profile selection and data entry are simulated. The staff application is inert while a demo is open, including while paused/finished, with a pointer shield and keyboard focus containment. Cleanup restores its prior inert state. Definitions cannot name arbitrary actions to click.

Targets are discovered every 180ms only during an active tour, with window resize and capture-phase ancestor scroll listeners. The current target is scrolled into view once on discovery, geometry updates follow layout changes, and the dialogue is clamped to the viewport. There are no target polling timers while the gnome is idle. Unavailable targets offer Retry/Skip/Exit after eight seconds; skipping does not earn completion.

## Verification (2026-10-31)

- `npm test`: **103 passed, 0 failed** (95 existing + 8 new). No existing tests changed or weakened.
- `npm run build`: passed. Vite retains the large-bundle warning; bundle splitting is separate work.
- `npx eslint src/tutorials tests/tutorials.test.js tests/tutorial-browser-fixture.jsx`: passed.
- `git diff --check`: passed.
- Full repository lint reports 68 errors and 9 warnings. Each of the five changed application files was compared with `git show HEAD:<file>` through ESLint: error/warning counts and rule distributions are unchanged. Existing errors were not suppressed or edited as part of this feature.
- `node tests/tutorial-browser.mjs`: native Chrome DevTools Protocol checks, with actual Dashboard components and every data request mocked. Four interactive tutorials and four demonstrations passed. Checks cover wrong navigation not advancing, required/invalid practice values, real form untouched, actual profile and report state, calendar state changes, demo auto timing and pause/resume, Previous/Restart/Exit, completion, staff-only mounting, no browser exceptions, empty-record recovery and honest incomplete status. Mutation request list was empty across all tours and both modes.
- Browser checks include a 390×844 viewport, no horizontal overflow, dialogue bounds, demo keyboard containment, inert cleanup and reduced-motion emulation. A mobile screenshot was inspected. Resize/scroll listeners and late-rendered spreadsheet targets were exercised by the tours. Automated checks are not a substitute for testing every screen-reader/browser combination.

`tests/tutorial-browser.html` and `tests/tutorial-browser-fixture.jsx` are local test fixtures only. They are not imported by the application or included in the production build. The fixture renders the staff Dashboard directly with fictional data and overrides all fetches before application imports. Login coverage renders the real App without an authenticated session.

To repeat browser checks, start Vite on 127.0.0.1:5179, launch Chrome headless with remote debugging port 9225 and a fresh temporary user-data directory, then run `node tests/tutorial-browser.mjs`. Use an isolated browser profile: the fixture deliberately has no real account session. The browser script uses Node 22 native fetch/WebSocket and adds no dependency.

## Remaining tutorials and limits

The audit inventories all future work, including full real-save booking editing, detailed housing/meals/activities/checklists, Contacts, spreadsheet filters, imported and website inquiry conversion/decline, Portal Admin task/document/review workflows, Jobs and staff identity/directory, imports, exports, backups and recovery. The retired Inquiry Pipeline is documented as retired, not offered as a normal staff tutorial. Next priorities are Contacts/history, Portal Admin orientation and inquiry review, after giving their dynamic/loading/permission states the same explicit targets and verification contracts.

V1 booking preparation intentionally ends with an explanation of saving, not a real database write. It must never claim that a real booking has been created. The interactive view tutorial requires a visible existing booking; absent/filtered records can be recovered or skipped. Demonstrations never open a real profile. Report filtering in interactive mode changes existing browser reporting preferences; demo filtering is simulated. Calendar demos change display period only.

Starting a tutorial requires an explicit mode selection and warns staff to finish/save current work before navigating; there is no centralized unsaved-draft API in the existing app. V1 does not add one. Completion IDs are local to the browser profile, not synchronized per staff account, and interrupted steps do not resume after reload. External guest portal source and live Supabase role/RLS behavior were not exercised; the staff mount guarantees no inclusion in that separate application. No production data was read or changed during browser testing. No commit, push, deployment, migration or package installation was performed.

## Files

Created: root `TUTORIAL_GNOME_AUDIT.md`; this report; all nine files in `src/tutorials/` listed above; `tests/tutorials.test.js`; `tests/tutorial-browser.html`; `tests/tutorial-browser-fixture.jsx`; `tests/tutorial-browser.mjs`.

Modified: `src/pages/Dashboard.jsx`, `src/pages/CreateBooking.jsx`, `src/pages/SpreadsheetView.jsx`, `src/pages/CalendarView.jsx`, `src/pages/ReportsView.jsx`.
