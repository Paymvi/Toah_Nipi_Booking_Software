# Tutorial Gnome: Opportunities and Repair Audit

Audit date: 2026-11-05 · Branch: `main` · Audited commit: `25e96eb` · Repairs landed in: `fe78bb4`

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
- **Pre-fix comparison:** the most serious bugs were reproduced against an export of `25e96eb`, then re-run on the working tree, so "before" results are measured rather than inferred.
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

## 7. Recommended next batch

Five tutorials, about 4 to 7 days in total. None needs new engine work or fictional records.

| Order | Tutorial | Effort | Why now |
|---|---|---|---|
| 1 | N-01 What needs my attention today? | Small | The first screen every staff member sees, with nothing teaching it. Read-only, so it is safe. |
| 2 | N-02 What's on my plate? | Small | "Working as" is easy to miss, and without it My Work looks empty. Everyone needs this once. |
| 3 | N-03 Is a building free on these dates? | Medium | A frequent question from guests, and the summary's counting rules aren't obvious. Read-only. |
| 4 | N-04 Where is this group with their portal? | Medium | The status words are the base for all later portal and email training. Read-only as designed. |
| 5 | N-05 How do I turn a website request into a booking? | Medium | The highest-value real workflow that is still safe: the existing save guard already covers it. |

**Why these:** they cover the daily questions the current five leave out, in the order a new person meets them. They only look or use the existing guard, so the risky portal and email work can wait for its own decisions. N-06 (housing) is the natural sixth, but it needs new save guards first.

**What to decide before building:**

1. Are you happy with the question-style titles? The five existing titles are task-style ("Create a booking"), so the library would mix both until they are renamed.
2. For N-05, should the tutorial use a real pending request, or stop and explain when none exists? The proposal assumes real, read-only, as today's tutorials do.

## 8. Backlog

**Effort:** Small is up to half a day (targets and steps). Medium is 1 to 2 days (new guards, branching, more testing). Large needs new infrastructure.

**Rule for every future tutorial:** these real actions have no save guard, and are only safe today because look-only steps block them. Any step that lets clicks through to them must add `data-tutorial-guard` first: Housing Save Changes, Add Assignment and its saves, every Checklist control (they save immediately), Jobs Mark done, Save Incident Notes, contact star and delete, Portal assign, Confirm, Send back and Reopen, Decline Inquiry, and all email controls.

### 8.1 Workflow audit by area

| Area | Current coverage | What a new person struggles with | Easy mistake and consequence | Best answer |
|---|---|---|---|---|
| Dashboard home | None | What Action Center items mean; that rows are clickable | Missing an item needing action | N-01 |
| Main Calendar | Good, now includes opening bookings | Also show hides cancelled and waitlisted groups | Reading a date as free when a waitlisted group exists | Done; E-1 |
| Lodging Calendar | None | Building filters; what "Unassigned" means; what the summary counts | Offering a building that has a conflict | N-03, U-8 |
| Master Spreadsheet | Search and open only | Saved search and filters persist; the Customize dialog has many tabs | "Missing" bookings that are just filtered out | N-08, U-5 |
| Create and edit | Good | Two editors; leaving discards edits with no warning | Lost edits | Done; U-4 |
| Booking Overview | Good | Incident Notes is the one thing that saves from Overview | Assuming Overview is read-only | E-5 |
| Housing | None | Becomes the authority for lodging once saved; floor and room splits | Overwriting imported housing text | N-06 |
| Meals and activities | Mentioned in Create | Simple fields on the Form; no separate workflow exists | Low risk | E-4, no tutorial |
| Staff Assignments, Checklists | None | Both feed Jobs; checklists save at once, with no Save button | Expecting a Save step; assigning with no "Working as" | N-09 |
| Jobs | None | My Work depends on Working as | Empty list misread as "nothing to do" | N-02, U-7 |
| Contacts | Good | Delete only hides, for everyone | Hiding a contact for all staff | Done; E-3, U-10 |
| Guest Inquiries (website) | None | A request stays New until a booking is *saved* | Leaving the form means no conversion happens | N-05 |
| Inquiry Spreadsheet | None | How it differs from Guest Inquiries; Book; Deleted rows | Duplicate work across two lists | N-10, U-6 |
| Portals | None | Waiting on Guest, Needs Review and Complete; Confirm vs guest submitted | Treating a submission as finished | N-04, S-02, U-9 |
| Guest Portal itself | Not possible | It is a separate app; the gnome can't appear there | n/a | Teach from Portals only |
| Portal emails | None | Dry run, Test and Live; enabling sends a welcome; stop latches | **A real guest gets an email** | S-03, S-04 |
| Invoices, payments, rates | Fields only | **No invoice or rates workflow exists.** Payments are fields on the booking (invoice, deposit, balance details) | Low | Covered by Edit. No tutorial proposed. |
| Reports | None | Inclusion rules; camper days; data quality | Misquoting totals: reports include inquiries, waitlisted and cancelled groups | N-11 |
| User Admin | None | Staff list is separate from sign-in; one shared login | Thinking a role here changes access | N-13 |
| Settings, custom fields | n/a | **No Settings page or custom fields exist.** Only Spreadsheet Customize and Date Display | n/a | N-08 covers Customize |
| Backup | None | Which file to keep; Safe Merge vs Full Replace | **Destructive restore** | N-12, S-05 |
| Import, Dev Mode, Delete All | None | Password-gated and rarely used | **Bulk data damage** | S-07 |

### A. Improvements to existing tutorials

| ID | Change | Why | Effort |
|---|---|---|---|
| E-1 | Calendar: make "open a booking from the calendar" a real step, with Back returning to the same view. | Currently taught in words, and optional to try. | Small |
| E-2 | Open a booking: add an Open Guest Portal step, explaining "Guest Portal Unavailable". | New control with no explanation. It opens the guest's real portal, so it must stay look-only. | Small |
| E-3 | Contacts: add starring, plus deleting and restoring as look-only steps (old CT-2). | Delete is shared by all staff and worth a clear warning. | Small |
| E-4 | Create a booking: optional closing tour of Meals, Lodging and Payments. | Teaches the optional sections without a tutorial each. | Small |
| E-5 | Open a booking: say that Incident Notes saves on its own. | It is the one exception to "Overview is for reading". | Small |
| E-6 | Rename the five titles as questions, if you adopt that style. | Consistency with the new batch. | Small |

### B. New tutorials

#### N-01 · What needs my attention today?
- **Teaches:** reading the Dashboard: the four metrics, Action Center, Upcoming Arrivals, Today at Camp, Quick Actions. Staff start each day here.
- **Audience:** general staff. **Priority:** High, it is the first screen and has no guidance.
- **Screen and start:** Dashboard, from anywhere.
- **Mode:** both.
- **Steps:** open Dashboard → metrics → Action Center (each item opens a filtered list) → Upcoming Arrivals → Today at Camp → Quick Actions. **End state:** the person knows where to start each morning.
- **Demo data:** none. Text must not assume any item exists; "No groups are scheduled on site today" is a valid state.
- **Prerequisites:** targets for the five areas and `nav-dashboard`.
- **Overlap:** none. **Effort:** Small.

#### N-02 · What's on my plate?
- **Teaches:** choosing "Working as", then reading My Work and Team Workload in Jobs. "Working as" also records who completed checklist items.
- **Audience:** general staff. **Priority:** High, without it My Work looks empty and completion records are wrong.
- **Screen and start:** User Admin, then Jobs.
- **Mode:** both. Demo explains the picker without changing it.
- **Steps:** User Admin → Working as → Jobs → the Show filter → My Work → Team Workload → Open Booking (look-only). **End state:** name chosen, My Work understood.
- **Demo data:** none. Handle an empty staff list ("add people in User Admin first").
- **Prerequisites:** `nav-user-admin`, `nav-jobs` and view targets. Choosing a name is a real but harmless per-computer setting; the text should say so. Mark done stays look-only.
- **Overlap:** N-09. **Effort:** Small.

#### N-03 · Is a building free on these dates?
- **Teaches:** Lodging Calendar building filters, the availability lookup, and reading the summary.
- **Audience:** general staff. **Priority:** High, a common guest question with real consequences.
- **Screen and start:** Lodging Calendar.
- **Mode:** both. Demo can't type dates, so it needs a prefilled example or explains from an existing result.
- **Steps:** open → building filters and counts → Unassigned → start and end date → Generate Available Lodging Summary → read the result and the "Counted" note → open a booking from the list. **End state:** a summary on screen and understood.
- **Demo data:** none for guided. **Blocker:** demos never type, so demo mode needs a decision: stop before Generate, or let the demo fill two local dates. These write nothing, but it would be the first demo that types.
- **Prerequisites:** about 7 new targets; `nav-lodging-calendar`.
- **Overlap:** Calendar tutorial's month navigation. **Effort:** Medium.

#### N-04 · Where is this group with their portal?
- **Teaches:** Portal Progress: the summary cards, search and Status filter, and what No Checklist, Waiting on Guest, Needs Review and Complete mean. Includes Copy Link.
- **Audience:** general staff. **Priority:** High, the foundation for all portal work.
- **Screen and start:** Portals.
- **Mode:** both.
- **Steps:** open Portals → summary cards → Status filter → one group card → progress counts (Complete, Review, Open, Docs) → Copy Link and Open Portal, explained only. **End state:** the person can tell who is waiting on whom.
- **Demo data:** none, but a group with no checklist teaches little. Text must work for an empty card.
- **Prerequisites:** `nav-portals` and card targets. Assign Tasks, Assign Documents and Emails stay blocked. **Open Portal stays look-only:** it opens a real guest's portal.
- **Overlap:** S-01, S-02. **Effort:** Medium.

#### N-05 · How do I turn a website request into a booking?
- **Teaches:** Review → Open Prefilled Booking Form → check details → Save. A request stays New until the booking is actually saved, and leaving the form abandons the conversion.
- **Audience:** general staff. **Priority:** High, a core job where a mistake loses a guest's request.
- **Screen and start:** Guest Inquiries, with at least one New request.
- **Mode:** both.
- **Steps:** open Guest Inquiries → New Requests column → Review → contact and stay details → guest-reported documents ("verify before entering") → Open Prefilled Booking Form → prefill banner → Save (blocked), with what happens next explained. **End state:** the person knows the request converts only on save.
- **Demo data:** none if requests exist. With none, the tutorial stops at Review and says so, as Open a booking does.
- **Prerequisites:** `nav-guest-inquiries` and panel targets. Decline stays blocked. **Check before building:** the demo restore uses `navigate`, which doesn't clear the form seed the way a sidebar click does. It must not leave a prefilled form behind.
- **Overlap:** Create a booking's save step. **Effort:** Medium.

#### N-06 · How do I assign housing for a group?
- **Teaches:** Housing tab: Edit Housing, room breakdowns, linens, Save or Cancel. Once saved, Housing becomes the authority for lodging.
- **Audience:** experienced staff. **Priority:** High, it feeds Lodging Calendar and the "Lodging not assigned" alert.
- **Screen and start:** an open booking.
- **Mode:** both.
- **Steps:** open a booking → Housing → summary counts → Edit Housing → building count → room breakdown → linens → Save (blocked) or Cancel. **End state:** the person knows how counts roll up.
- **Demo data:** an imported record shows the legacy text and Hebron warning, a Form booking doesn't, so the text must fit both.
- **Prerequisites:** **add `data-tutorial-guard` to Housing Save Changes.** Add Housing to the "form open" warning.
- **Overlap:** Edit a booking's opening steps. **Effort:** Medium.

#### N-07 · Where do I find everything?
- **Teaches:** the sidebar sections, top bar, collapsing the sidebar.
- **Audience:** general staff. **Priority:** Medium, helpful but discoverable. Could fold into N-01.
- **Screen and start:** any. **Mode:** both.
- **Steps:** Main → Calendar → Spreadsheet → Reporting → Other → Refresh and Export. **End state:** a mental map.
- **Demo data:** none. **Prerequisites:** a few targets. **Overlap:** N-01. **Effort:** Small.

#### N-08 · How do I find bookings faster in the Master Spreadsheet?
- **Teaches:** year tabs, building filter, dates, Starred first, Sort By, Reset View, row preview, Customize and Saved Views.
- **Audience:** experienced staff. **Priority:** Medium, power use, and it explains "missing" rows.
- **Screen and start:** Master Spreadsheet. **Mode:** both.
- **Steps:** year → building → dates → sort → star → Reset View → Customize → Saved Views. **End state:** a filtered list, then reset.
- **Demo data:** none. **Prerequisites:** targets inside the settings modal. **Settings persist in the browser**, so the tutorial must end with Reset View or tell the person to. **Overlap:** Open a booking's search. **Effort:** Medium.

#### N-09 · How do I assign work on a booking?
- **Teaches:** Staff Assignments and Checklists, and how both appear in Jobs.
- **Audience:** experienced staff. **Priority:** Medium.
- **Screen and start:** an open booking. **Mode:** Show me first. Guided needs guards.
- **Steps:** Staff Assignments → Add Assignment (area, person, instructions) → Checklists → Add Checklist → item, assignee → see it in Jobs. **End state:** the person knows where work appears.
- **Demo data:** an example assignment would help. **Blocker:** checklist controls save immediately, so guided mode needs guards on each. **Overlap:** N-02. **Effort:** Medium.

#### N-10 · What do I do with an inquiry from the spreadsheet?
- **Teaches:** Inquiry Spreadsheet: year tabs, search, opening a record, Book, deleting and restoring rows.
- **Audience:** experienced staff. **Priority:** Medium.
- **Screen and start:** Inquiry Spreadsheet, needs imported rows. **Mode:** both.
- **Steps:** open → year → search → open record → Back → Book explained → Deleted (n) → Restore. **End state:** the person can tell this list from Guest Inquiries.
- **Demo data:** none if rows exist. **Prerequisites:** `nav-inquiry-spreadsheet`, row targets; Delete is shared across staff, so look-only. **Overlap:** N-05. **Effort:** Medium.

#### N-11 · What do the reports tell me?
- **Teaches:** filters, Executive summary, Monthly Trends, Camp Usage, Data Quality, Export CSV, and that totals include inquiries, waitlisted and cancelled groups.
- **Audience:** experienced staff and administrators. **Priority:** Medium, misread numbers leave the building.
- **Screen and start:** Reports. **Mode:** Show me first, then both.
- **Steps:** date range → status → retreat type → source → totals → inclusion note → Data Quality → Export CSV explained → Reset. **End state:** the person can state what a total includes.
- **Demo data:** none. **Prerequisites:** targets; filters persist in the browser, so end on Reset. Export downloads real data, so look-only. **Overlap:** none. **Effort:** Medium.

#### N-12 · How do I make a backup?
- **Teaches:** Create Backup Now, keeping a second copy, and keeping the file private.
- **Audience:** administrators. **Priority:** Medium, rare but important.
- **Screen and start:** Backup. **Mode:** Show me. The button downloads real guest data, so the tutorial explains rather than clicks.
- **Steps:** status → Create Backup Now → what's included → Backup Routine. **End state:** the person knows when and how to back up.
- **Demo data:** none. **Prerequisites:** `nav-backup`, targets. **Overlap:** S-05. **Effort:** Small.

#### N-13 · How do I add someone to the staff list?
- **Teaches:** Add User, and that the directory is separate from sign-in.
- **Audience:** administrators. **Priority:** Low, rare.
- **Screen and start:** User Admin. **Mode:** Show me, or guided with Add User guarded.
- **Steps:** directory status → name and email → role → Add User (blocked) → deactivating. **End state:** the person knows this feeds assignments, not logins.
- **Demo data:** none. **Prerequisites:** guard on Add User. **Overlap:** N-02. **Effort:** Small.

#### N-14 · How do I cancel or waitlist a booking?
- **Teaches:** the Booking section of the form, and the effects: hidden from the calendar by default, still in reports, automatic guest emails stop.
- **Audience:** experienced staff. **Priority:** Medium, a small action with wide effects.
- **Screen and start:** Edit tab. **Mode:** Show me, or guided with the existing save guard.
- **Steps:** open booking → Edit → Booking section → the classification → Save (blocked) → where it shows afterwards. **End state:** effects understood, nothing changed.
- **Demo data:** none. **Prerequisites:** a target on the classification field. Form-made and imported editors differ. **Overlap:** Edit a booking. **Effort:** Small.

### C. Better solved with a small UI change

These would remove the need for teaching. All are proposals, none were made.

| ID | Change | Replaces |
|---|---|---|
| U-1 | Rename sidebar **Form** to **New Booking**, matching the Dashboard button. Tutorial text would need updating. | Explaining what "Form" means |
| U-2 | Name the Back destination: "Back to Lodging Calendar". | The explanation added in TG-31 |
| U-3 | Disable Edit Entry and Save for viewers, with a short reason. | A refusal after typing |
| U-4 | Add **Discard changes** to the Edit tab on Form-made bookings, and warn on leaving with unsaved edits. | The "switch to Overview" workaround |
| U-5 | Show "Showing 2 of 340, Clear filters" beside Search Everything. | The "your search stays" warning |
| U-6 | One line on each inquiry screen explaining website requests vs imported sheet rows. | Part of N-10 |
| U-7 | When Working as isn't set, make Jobs say so and link to User Admin. It currently says "assign ... to the current user". | Part of N-02 |
| U-8 | Explain "Unassigned" on the Lodging Calendar in a tooltip. | Part of N-03 |
| U-9 | A small legend for the four Portal statuses. | Part of N-04 |
| U-10 | Rename Contacts **Delete** to **Hide**, as that's what it does. | The warning in the Contacts tutorial |
| U-11 | Show why the portal is unavailable as visible text. It is only in a tooltip, which touch users can't see. | E-2's explanation |

No change is needed for Reports' included-records note or the per-booking email mode badge: both already show clearly.

### D. Sensitive workflows: special handling needed

**Shared decision needed first:** real guest data on screen, and real guest-facing effects. The safe general approach is **Show me on fictional records**, shown only in the tutorial and never saved. That needs a local example record clearly labelled "Example", and it doesn't exist yet. This is the Large item that unlocks S-01 and S-02 properly. Until then, these tutorials can only be explanations with look-only highlights.

| ID | Title | Risk | Safe teaching approach | Audience · Priority · Effort |
|---|---|---|---|---|
| S-01 | How do I give a group their checklist and documents? | Assigned items appear to the real guest straight away. Uploads are stored. | Show me only, nothing clicked. Guard Assign, Remove, Upload and Due date first. Fictional record preferred. Overlaps N-04. | Experienced · High · Medium, Large with fixtures |
| S-02 | How do I review what a guest sent in? | Confirm, Send back and Reopen change a real guest's portal. Send back can trigger an email. Uploads are private. | Fictional record needed: real submissions may not exist and must not be opened for demonstration. Explains Confirm vs guest-submitted, and that Needs Review isn't done. | Experienced · High · Large |
| S-03 | How do I set up emails for a group? | **Enable sends a welcome email at once in Live mode.** Send now and Resend too. | Show me only. Guard every email control, including Enable, Save, Pause, Resume, Send now, Resend and Test send. Preview says nothing is sent; confirm this before allowing it. Must say which mode is active. | Experienced · High · Medium |
| S-04 | What do Dry run, Test and Live mean? | Changing mode cancels queued mail and resets every booking's enable. | Admin only, explanation only. Never touch the mode control or cap. Cover delivery statuses: accepted isn't delivered, uncertain, blocked, and why mail stops. | Administrators · Medium · Small |
| S-05 | How do I restore from a backup? | Full Replace deletes every booking first. Portal rows and uploads can be lost. | Show me only, and no file chosen. Explain validation, Compare, Safe Merge vs Full Replace, and the safety backup. Never start a restore, even in development. | Administrators · Medium · Small |
| S-06 | How do I delete a booking? | Permanent, and removes email state. | Better as a line in existing tutorial text than a tutorial of its own: suggest cancelling instead, name the admin-only button, never click it. | Administrators · Low · Small |
| S-07 | Dev Mode, imports and Delete All | Bulk changes. | Don't tutorial. A short written note is enough. If taught, Show me with the toggle untouched, since Dev Mode needs a password. | Administrators · Low · Small |

## 9. Verification

All browser checks ran in real Chrome against a local Vite server and a mock Supabase with fictional bookings only. Every non-localhost request was blocked. The results below are from the final code.

| Check | Result |
|---|---|
| Every tutorial, both modes, normal path, at 1440×900, 1024×700, 390×800, 360×640 and 900×560 | 50 of 50 runs completed. Each step checked for spotlight, dialogue on screen, controls on screen, text, step order. Two placement flags, below. |
| Edge paths (Restart, gate steps, safety, wrong tab, booking already open, restore, resume, empty data, no search results, save attempts, imported bookings, typing pauses, keyboard, slow network) | All passed |
| Back, Restart, End and Resume on every tutorial, plus Large layout, collapsed sidebar, admin, viewer, Week-view start, agenda click, Replay | All passed |
| Earlier suites, updated for the new rules (end-to-end, transitions, rapid clicks, accessibility) | 57/57, 17/17, 14/14, 11/11 |
| Writes reaching the mock across that final run | **0** |
| Unit tests | 152 pass (146 before; 6 added) |
| Lint | 76 problems, down from the 77 baseline. Tutorial files are clean. |
| Production build | Passes (built to a scratch folder) |

**Before and after, measured against an export of `25e96eb`:**

| Scenario | Before | After |
|---|---|---|
| Contacts → Open Booking → Back | Blank page | Spreadsheet rows shown |
| Incident Notes on a look-only step | Reachable, **1 real write** while "saving is off" | Not reachable, 0 writes |
| Contacts search after a slow refresh | Text wiped | Text kept |

Three earlier suite expectations were changed on purpose, because the behaviour changed: the step count (9 to 10), the hint's wording, and Skip no longer being offered on navigation steps. Those suites live in a temporary folder, not the repo.

**Known limitations:**

- **Placement at 900×560:** on two demo steps with an Example box (Create a booking step 2, Contacts step 2) the taller dialogue falls back to the corner and covers about a third of a wide text field. The field stays visible and demos need no action from the viewer. Guided mode at that size has no overlap.
- **Not tested:** production data, Safari, Firefox, a physical phone, or a screen reader. Narrow widths were emulated in Chrome.
- **Mock limits:** portal tasks, emails, staff rows and checklists were empty in tutorial runs. Fictional portal and inquiry rows were used only for a read-only look at those screens, so sections 7 and 8 rest on that look plus the code, not on exercising those workflows.
- **Calendar state:** a demo doesn't restore Calendar view or month, and can't reopen a booking it navigated away from (section 5).
- **Restore after a pause:** deliberately skipped, so someone who pauses a demo and then ends it stays where they are.
- **Regression tests:** the runner's DOM behaviour (restore, focus, auto-pass) has no unit tests because the repo has no DOM test environment. It is covered only by the browser scripts, which are not in the repo.
