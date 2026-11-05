# Tutorial Gnome: Opportunities and Repair Audit

Audit date: 2026-11-05 · Branch: `main` (uncommitted changes) · Base commit: `25e96eb`

This report does two jobs:

1. It records the repairs made to the existing gnome and its five tutorials.
2. It proposes what to teach next. **No new tutorial was built in this pass.** Section 7 recommends a batch for you to approve.

How it relates to the earlier reports:

| Document | Status |
|---|---|
| [`TUTORIAL_GNOME_AUDIT.md`](../../TUTORIAL_GNOME_AUDIT.md) (2026-11-02) | Original app survey and wish list. Sections 3 and 4 are superseded by this report; its short ids (`B-5`, `GI-2`...) are reused here so the two can be read together. |
| [`TUTORIAL_GNOME_UX_AUDIT.md`](TUTORIAL_GNOME_UX_AUDIT.md) (2026-11-04) | Wording and flow review, findings TG-01 to TG-20. All were rechecked. Numbering continues here from TG-21. |

## 1. Summary

- **The gnome's practice protection had a real hole, now closed.** While the chip said "saving is off", guided mode still let people click anything inside a highlighted area, and anything at all when a target was missing. Only the two main Save buttons were guarded. A real Incident Notes save, and a real Delete, could be reached during "practice" (TG-23).
- **Three ways of getting stuck are gone:** skipping a navigation step, resuming from another screen, and starting "Open a booking" with a booking already open.
- **Show me now tidies up after itself.** It used to leave you on a different screen, sometimes on a booking's Edit tab with its fields unlocked.
- **Two app bugs were fixed because they broke tutorials directly.** Back from any booking not opened in the spreadsheet landed on a blank page, and a bookings refresh wiped the Contacts search box.
- **The five tutorials still cover only the booking basics.** The biggest gaps are the daily "what do I do now" screens and the guest-facing work: Dashboard, Jobs, Lodging, Portals and Guest Inquiries.
- **Recommended next batch** (section 7): What needs my attention today? · What's on my plate? · Is a building free on these dates? · Where is this group with their portal? · How do I turn a website request into a booking?

## 2. Method

- **Code:** read the engine, registry, mascot, panel, existing audits and tests, then every screen a tutorial touches. Each claim in tutorial text was compared with the code.
- **Browser:** real Chrome through `playwright-core`, against a local Vite server and a local mock Supabase holding fictional bookings only. Every non-localhost request was blocked and the mock logged every write. See section 9 for results and limits.
- **Pre-fix comparison:** the most serious bugs were reproduced against an export of `HEAD`, then re-run on the working tree, so "before" results are measured rather than inferred.
- **No real data:** no real emails, no scheduled messages, no permission changes, no restores, and no real guest records were touched.

### Earlier claims that no longer hold

| Claim | Where | Current truth |
|---|---|---|
| "Calendar events are display-only" | `TUTORIAL_GNOME_AUDIT.md` §2 | Main and Lodging calendar entries open bookings, and Back returns to the calendar. The Calendar tutorial now teaches this. |
| Overview has a Booking Status card | `TUTORIAL_GNOME_AUDIT.md` §2 | Removed. Overview has Compact and Large layouts. |
| Booking Back "returns you to the Master Spreadsheet" | TG-11 | True only for some entry points. From a calendar it returns to that calendar. |
| Top-of-file status "Nothing is deployed" | `docs/portal-email/SETUP.md` | Project notes say this was deployed in Test mode on 2026-11-05. Not rechecked here (it needs the live system), so please confirm and update that line. |
| Inquiry Record Detail Back "likely shows the same empty page" | UX audit, limits | Resolved by `closeBookingDetail`. |
| "No isolated demo data" | UX audit, limits | **Still true, and it matters for your brief.** Show me has no fictional state to contain. It opens real records read-only and displays labelled examples without typing them. See section 6. |

## 3. Existing tutorial inventory

Modes: every tutorial supports **Walk me through it** (guided) and **Show me how** (demo). Steps marked *auto-pass* are navigation steps passed over when already true.

### Create a booking (`create-booking`) · Bookings · Beginner · 8 steps

| # | Step | Target | Completes when |
|---|---|---|---|
| 1 | open-form | `nav-form` (demo clicks) | path is `/form` (*auto-pass*) |
| 2 | group-name | `booking-form-group-name` | filled |
| 3 | contact | `booking-form-contact` | filled |
| 4 | retreat-type | `booking-form-retreat-type` | has a value |
| 5 | arrival | `booking-form-arrival` | has a value |
| 6 | departure | `booking-form-departure` | has a value |
| 7 | guests | `booking-form-guests` | filled |
| 8 | save | `booking-form-save` | Next (save is blocked) |

Required-field claims were checked against `validateRequiredBookingFields`: they are accurate.

### Open a booking and read its Overview (`open-booking`) · Bookings · Beginner · 10 steps (was 9)

| # | Step | Target | Completes when |
|---|---|---|---|
| 1 | open-spreadsheet | `nav-master-spreadsheet` (demo clicks) | search box visible (*auto-pass*) |
| 2 | search | `spreadsheet-search` | filled |
| 3 | open-booking | `spreadsheet-open-booking` (demo clicks) | Booking Profile visible (*auto-pass*) |
| 4 | tabs | `booking-tabs` | Next |
| 5 | summary | `booking-overview-summary` | Next |
| 6 | stats | `booking-overview-stats` | Next |
| 7 | sections | `booking-overview-main` | Next |
| 8 | density (new) | `booking-overview-density` | Next |
| 9 | edit-shortcut | `booking-overview-edit` | Next |
| 10 | back | `booking-back` | Next (real Back allowed) |

### Edit a booking (`edit-booking`) · Bookings · Intermediate · 6 steps

| # | Step | Target | Completes when |
|---|---|---|---|
| 1 | open-spreadsheet | `nav-master-spreadsheet` (demo clicks) | search box or a booking visible (*auto-pass*) |
| 2 | open-booking | `spreadsheet-open-booking` (demo clicks) | Booking Profile visible (*auto-pass*) |
| 3 | edit-tab | `booking-tab-edit` (demo clicks) | editor visible (*auto-pass*) |
| 4 | edit-entry | `booking-edit-entry` (demo clicks) | editor unlocked (*auto-pass* on Form-made bookings) |
| 5 | change-field | `booking-edit-panel` | any field differs from the start of the step |
| 6 | save-or-discard | `booking-edit-actions` or `booking-form-save` | Next (save blocked, Cancel allowed) |

### Navigate the Calendar (`calendar`) · Calendar · Beginner · 9 steps

| # | Step | Target | Completes when |
|---|---|---|---|
| 1 | open-calendar | `nav-calendar` (demo clicks) | calendar visible (*auto-pass*) |
| 2 | month-view | `calendar-view-month` (demo clicks) | » button visible (*auto-pass*) |
| 3 | next-month | `calendar-next` (demo clicks) | heading changed |
| 4 | this-month | `calendar-today` (demo clicks) | heading is the current month (*auto-pass*) |
| 5 | week-view | `calendar-view-week` (demo clicks) | week controls visible (*auto-pass*) |
| 6 | year-view | `calendar-view-year` (demo clicks) | year view visible (*auto-pass*) |
| 7 | back-to-month | `calendar-view-month` (demo clicks) | » button visible (*auto-pass*) |
| 8 | exceptions | `calendar-exceptions` | Next (ticking allowed) |
| 9 | agenda | `calendar-agenda` | Next (opening a booking allowed) |

### Find and manage contacts (`contacts`) · Contacts · Beginner · 6 steps

| # | Step | Target | Completes when |
|---|---|---|---|
| 1 | open-contacts | `nav-contacts` (demo clicks) | search visible (*auto-pass*) |
| 2 | search | `contacts-search` | filled |
| 3 | sort | `contacts-sort` | Next (sorting allowed) |
| 4 | view-bookings | `contacts-view-bookings` (demo clicks) | history visible (*auto-pass*) |
| 5 | history | `contacts-history` | Next |
| 6 | deleted | `contacts-deleted` | Next |

## 4. Gnome and tutorial changes made

Status: **Browser** means seen failing and then passing in the running app. **Code** means found and fixed by reading, with a test or check where one applies.

### Engine and safety

| ID | Problem | Fix | Files | Status |
|---|---|---|---|---|
| TG-21 | **Restart silently skipped steps.** Any step whose field already had a value was passed over, so after typing a group name, Restart landed on step 3. With a full form it would jump to the end. The same rule made demos skip explanations. | Only navigation steps are passed over. A filled field is still shown, with Next available. | `TutorialRunner.jsx`, `tutorials.js` | Fixed · Browser |
| TG-22 | **Skip stranded the tutorial.** Skipping "open Master Spreadsheet" left the next step pointing at a screen that wasn't open, locked for 5 seconds, then "can't find". Each later step repeated that. | Steps that open the next screen can't be skipped. Next stays visibly unavailable and explains what to do. Field steps keep Skip. If the target truly isn't there, the gnome says so and offers Back or End. | `tutorialCore.js`, `TutorialRunner.jsx` | Fixed · Browser + test |
| TG-23 | **"Saving is off" wasn't fully true.** Any click inside a highlighted area was allowed, even on steps that only ask you to look. The "sections" step highlights Incident Notes, which saves directly. When a target was missing, *every* click was allowed, including Edit Housing and admin Delete. | Look-only steps stop clicks unless they opt in with `explore`, used only where every control is harmless. While a target is missing, only ways back work: sidebar links, booking tabs, booking Back and the search boxes. | `TutorialRunner.jsx`, `tutorialCore.js`, `tutorials.js` | Fixed · Browser + test |
| TG-24 | **Open a booking stuck if a booking was already open.** Step 1 counted an open booking as done, so step 2 pointed at a hidden search box. Likely after the calendar change, since people now arrive on bookings from calendars. | Step 1 now needs the spreadsheet itself. Edit a booking still treats an open booking as a head start. | `tutorials.js` | Fixed · Browser + test |
| TG-25 | **Show me left you somewhere else.** Starting on the Calendar and ending a demo left you on a booking's Edit tab, with imported bookings still unlocked. | Demos return to the starting screen on End and Finish, using the app's own controls. A booking you had open stays open, on its original tab. Skipped if you paused, because anything on screen may be your own work. | `TutorialGnome.jsx` | Fixed · Browser |
| TG-26 | **Resume could be a dead end.** Resuming step 6 from another screen gave "can't find", with Back unavailable. A saved step beyond the end displayed as, for example, "step 41 of 6". | If the saved step's screen isn't open, the tutorial restarts and says why. Navigation steps already done are passed over. The displayed step is clamped. | `TutorialRunner.jsx`, `TutorialGnome.jsx` | Fixed · Browser |
| TG-27 | **Off-screen target at 1024 px.** View Bookings sits right of a sideways-scrolling table. Only vertical position was checked, so it had no highlight and guided mode was stuck. | Horizontal position is now handled too. | `TutorialRunner.jsx` | Fixed · Browser |
| TG-28 | **Back unavailable after an auto-passed step.** On Form-made bookings, Back on "change a field" was disabled with a misleading tooltip. | Back steps over auto-passed steps. | `TutorialRunner.jsx` | Fixed · Browser |
| TG-29 | **Keyboard focus was lost** on Pause, Resume and End, and when Back became disabled. Keyboard users also had to tab through the whole page to reach the highlighted control. | Focus moves to Resume on pause, back to the dialogue or control on resume, and to the gnome after End. Back stays focusable. For keyboard users only, focus moves to the highlighted control on steps that need an action. It never moves out of a field, so a pause in typing can't send the rest of a word to the next field. | `TutorialRunner.jsx`, `TutorialGnome.jsx` | Fixed · Browser |
| TG-30 | A "That's not available" nudge stayed on screen after a step recovered. | Cleared on recovery. | `TutorialRunner.jsx` | Fixed · Browser |

### Tutorial content

| ID | Tutorial | Before | After | Status |
|---|---|---|---|---|
| TG-31 | Open a booking, last step | "Back returns you to the Master Spreadsheet." | Explains it returns to where you came from, spreadsheet or calendar. | Fixed |
| TG-32 | Calendar | Never mentioned that entries open bookings. Said the calendar shows "every dated booking", which contradicts the Also show step. | Agenda step teaches opening a booking and returning with Back, and guided mode lets you try it. Opening line corrected. | Fixed · Browser |
| TG-33 | Open a booking | Compact and Large layouts weren't mentioned. | New short Density step. Copy works in both layouts. | Fixed · Browser (both layouts) |
| TG-34 | Open a booking | Wrong-tab message was generic: "may be on another page". | Overview steps say to click the Overview tab. | Fixed · Browser |
| TG-35 | Contacts | History and empty-list hints were generic or assumed a search. | History hint says to reopen View Bookings. Empty hint covers there being no contacts yet. | Fixed · Browser |
| TG-36 | Create, Edit | Finishing or ending gave no warning that saving was live again while practice text stayed in the form. | Finish card and End bubble both say so and how to clear it. | Fixed · Browser |
| TG-37 | Panel | Show me didn't say what happens afterwards. | "...and I'll bring you back here after." | Fixed · Browser |

## 5. Application bugs

### Fixed: direct blockers for existing tutorials

| ID | Bug | Effect | Fix | Files | Status |
|---|---|---|---|---|---|
| APP-1 | The Master Spreadsheet only mounted after a sidebar click. | **Blank page** on Back from any booking opened from Contacts, Dashboard, Jobs or Portals, and when loading `/master-spreadsheet` directly. Contacts tells people to use Open Booking, so this hit the tutorial path. | Any arrival at the spreadsheet view now mounts it. One line, during render. This also resolves the "known and left alone" note from the calendar work. | `Dashboard.jsx` | Fixed · Browser (before and after) |
| APP-2 | Contacts re-showed its loading screen after every bookings refresh, which remounted the page. | **Typed search and expanded history were wiped**, and the highlighted target vanished mid-step. Sidebar clicks trigger a refresh, so on a slow connection the search disappeared seconds after typing. Staff outside tutorials hit this too. | The loading screen now only shows on the way in. One line removed. | `ContactsView.jsx` | Fixed · Browser (before and after) |

### Left for follow-up

| Issue | Why it matters | Suggested handling |
|---|---|---|
| Back from a booking opened in Contacts, Jobs, Dashboard or Portals goes to the Master Spreadsheet, not the origin. | Surprising, and the tutorial has to work around it. | Pass the origin to `openBookingDetail`, as calendars do. Small, but a behaviour change for you to decide. |
| Browser refresh or browser Back on Booking Detail loses the booking. | Detail has no URL. | Larger routing change. |
| A demo can't restore Calendar view or month. | The Calendar tutorial ends on Month view at the current month. It is navigation only and changes no data. | Accept, or lift that state if staff notice. |
| A demo that leaves an open booking can't reopen it. | Open a booking from inside another booking ends on the list. | Accept. Needs booking URLs to fix. |
| The "you have a form open" warning only detects the Form and Edit tab. | Unsaved Housing or Checklist edits aren't warned about before a tutorial navigates. | Small. Include when Housing tutorials are built. |
| Viewers see Edit Entry and Save Changes, and only the server refuses. | Edit a booking is misleading for viewers. | Small UI fix (U-3). |
| Contacts Open Booking is clipped at 390 px. | Carried over from the UX audit. | App layout. |

## 6. Show me mode: what "contained" means today

Your brief asks that fictional demo state stays contained. **Show me has no fictional state.** It runs on the real records already loaded, and is safe for these reasons, each verified:

- It never types. Examples appear only in the dialogue, labelled "Example".
- It clicks only navigation, tabs, view switches and Edit Entry. A test confirms no demo step clicks a save target.
- All other clicks are blocked, including keyboard activation. Save buttons have an extra guard.
- No write reached the mock in any run, across all tutorials, modes, roles and widths.

The limit: a demo **displays a real guest's booking** on screen, so anyone watching sees it. That is fine for staff, but tutorials on sensitive screens need a decision on fictional records (section 8, D).
