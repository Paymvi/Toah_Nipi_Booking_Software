# Tutorial Gnome: portal management walkthrough

Date: 2026-11-05 · Built on `fe78bb4`. The first version was committed as `ec98e27` while work continued, so later fixes are in the working tree.

This report covers the staff-side portal walkthrough: what it teaches, how it's protected, how it was checked, and how to change it. The separate guest portal app has no tutorials.

## 1. Structure

Staff start from the gnome: **Manage a group's portal** for the full walkthrough, or **Individual topics** beneath it for a single topic. Both offer **Walk me through it** and **Show me how**.

The walkthrough has an intro, ten topics in three groups, and a recap.

| Group | # | Topic | Teaches |
|---|---|---|---|
| Set up a portal | 1 | Find a group and read its progress | Search, Status, status pill, percentage, counts, what a row means, Open Booking |
| | 2 | Assign tasks | Approved list, guest actions, ticking, due date, Required or Optional, repeat warning |
| | 3 | Share documents | Custom upload, standard documents, assigning, Remove |
| | 4 | Set or change a due date | Per-task dates through Correct…, effect on reminders |
| Reach the guest | 5 | Copy the portal link or open the portal | Who the link gives access to, Copy Link, Open Portal, Open Guest Portal |
| | 6 | Set up a group's emails | Status line, recipients, item options, Enable and Save, Send now, Preview, Upcoming, History |
| | 7 | Check the sending mode and reminders | Dry run, Test and Live; Automatic emails; timing; everything a reminder needs; readiness; templates |
| Review what comes back | 8 | Review and approve a submission | Needs staff review, Open Upload, View Info, Confirm, Missing upload or Missing info |
| | 9 | Send a submission back for changes | Note to the guest, what the guest keeps, effect on progress and email |
| | 10 | Reopen or remove a task | Where a reopened task goes, what happens to a guest's file |

The order follows the real job: set up, reach the guest, then review.

## 2. How topics and continuing work

Each section is written once in `src/tutorial/portalTutorial.js`. `composeWalkthrough` builds the full walkthrough and the ten topics from the same steps, and a unit test checks they match.

- **Setup steps.** Every topic starts with Open Portals and, where needed, Choose a group. These are marked `prep`: they pass without stopping when already true, and aren't counted in the step numbers or reached with Back.
- **Finishing a topic.** The complete card offers **Continue the full walkthrough** and **Done**. Continuing starts at the next topic, in the same mode, with the same group. After the last topic it goes to the recap.
- **Position.** The dialogue shows "Topic 3 of 10: Share documents" and "Step 14 of 56" in the walkthrough. A standalone topic shows only its own steps.
- **Back.** It crosses topic boundaries in the walkthrough, because a step can reopen its own panel (`opens`). In a topic it stops at the topic's first step.
- **Restart.** It restarts whichever was chosen. In practice it also forgets the group.
- **Resume.** After leaving, it restarts the topic you were in, not the exact step. The panels and chosen group are gone by then, and this also makes an outdated saved step harmless.
- **Progress.** Topics and the walkthrough are stored under separate ids in the existing progress record, so finishing a topic doesn't complete the walkthrough, and finishing the walkthrough doesn't tick the topics. Existing progress loads unchanged.

## 3. What each mode allows and blocks

| | Walk me through it | Show me how |
|---|---|---|
| Screen | The real Portal Admin, with real records | The real Portal Admin components, showing fictional groups |
| Allowed | Sidebar to Portals, Search, Status, opening panels, ticking drafts, choosing dates, typing a note, preview tabs, Open Upload and View Info on the review step | Watching. While paused: looking around |
| Blocked | Assign, Upload to Portal, Remove, Save due date, Confirm, Send back, Reopen, Remove task, email Save, Pause, Resume, Resend, Send reminder, Send test, Retry, Save template, Save cap, mode, Automatic emails, Copy Link, Open Portal | All of those, plus Open Upload and Open Booking |
| Outcome shown | Explained only. The dialogue says the action is switched off and never says it happened | Shown on the fictional group: the new task, the changed date, the percentage moving, the note, the simulated welcome |
| Pause | Full control, and saving is real. The bar says so | Stays fictional and locked. The bar says so |

Protection has three layers:

1. **Click guard.** Clicks outside the current step are stopped. Every control above carries `data-tutorial-guard`, which stops clicks, keyboard activation and form submits. Middle-click is now covered too.
2. **Look-only steps.** A highlighted area can only be used if the step asks for it, so a broad highlight can't expose an action. While a target is missing or a state is unmet, only ways back work (sidebar, Search, Status).
3. **Network lock.** `src/tutorial/tutorialSafety.js` sits inside the Supabase client. While a portal tutorial runs, it refuses every write, upload and email call before it leaves the browser. In practice it still allows the two read-only email calls (`status`, `overview`) and the signed link for Open Upload. In the demo it allows reads and sign-in upkeep only.

Nothing is performed and then undone.

**Limits:** Copy Link and Open Portal are blocked in practice on purpose, so staff read about them rather than try them. Recipient and email-option ticks are look-only, because those drafts would otherwise wait to be saved with the staff member's real choices. Task and document ticks are allowed: they are drafts inside a panel, and the closing message says to close the panel.

## 4. The fictional demo

`src/tutorial/portalDemo.js` holds three fictional groups. Community Bible Church has tasks in every status, a shared document, a contact at `example.org`, and email settings in dry run. There's also one complete group and one with no checklist.

- **Same screens.** `PortalAdminView` renders a second copy of the real screen from this data, so there's no imitation to drift. The email panel takes an `api` prop, and the demo passes a stand-in with no network access.
- **Clearly labelled.** A banner on the page and the "Demo · fictional data" chip.
- **Real screen preserved.** The real copy stays mounted but hidden, so its search, filter, open panels and unsaved ticks are exactly as they were afterwards.
- **Isolated.** The scene lives only in that module's memory. Only Portal Admin reads it, and a unit test holds that. It never enters the bookings list, so it can't reach reports, exports or backups. Nothing is written to Supabase, storage, `localStorage` or the URL.
- **No real tokens.** Demo records have a placeholder token, Open Portal goes nowhere, and an upload "opens" as a local placeholder. The hand-off to the guest portal is explained, not shown.
- **Outcomes by position.** Each step can name a `demoEffect`, and the scene is rebuilt from the effects of the steps already passed. Back, Restart and Continue therefore need no undo logic.
- **Cleanup.** The scene ends when the runner closes: End, Finish, leaving the page by any route, signing out, or a reload.
- **Return.** The original screen and open booking return as they do for other demos. A topic waits for Done or Continue first. After a pause in a demo the screen still returns, unless the person left the page themselves.

## 5. Choosing a group, prerequisites and roles

Portal Admin has no selected group, so the tutorial adds one: once chosen, steps only see that group's card, and other cards' controls stay blocked.

**The current selection is reused** when a booking is open, a card has a panel open, or the list has been searched down to one group. The gnome names the group it's using. Otherwise it asks, listing the groups in the dialogue (up to six, with their status), and Search and Status stay usable. It never picks a real group by itself, and the choice isn't stored.

| Situation | What happens |
|---|---|
| Started on another screen | Guided to Portals, or the demo goes there |
| Search or Status hides every group | Explained, and fixing the filter carries straight on |
| No portal groups | Explained, with **Watch the demo instead** |
| Group has no tasks (due dates) | Explained, with Choose another group, Watch the demo instead, and Skip this topic in the walkthrough |
| Nothing awaiting review (review, send back) | Same |
| No completed tasks (reopen) | Same |
| Emails not set up on the database | Explained, with Watch the demo instead |
| List still loading | Waits, and doesn't claim that nothing exists |
| Target disappears mid-step | Existing "can't find" message, then carries on when it returns |

No record is created or changed to satisfy a prerequisite.

**Roles.** Portal Admin now receives the existing `staffRole`. Steps on saving controls add "Your account is view-only…" for viewers, and admin-only steps add "Only admins can change this." for anyone else. Viewers can still run everything, since nothing saves in a tutorial.

## 6. Protecting current work

Screens now mark unsaved work with `data-tutorial-unsaved`: the booking Form (once it differs from how it opened), the Edit tab, Housing, Staff Assignments, a Checklist item, and Portal task, document and email drafts.

- **Before starting.** Every start path checks. If there's unsaved work, the gnome names it and offers **Go back and save it** or **Start anyway**. This replaces the old note, which only said a form was open, and applies to all tutorials. It's skipped for a demo started on the Portals page, because that work stays safe underneath.
- **While paused.** Work begun during a pause stops Resume until it's saved or cancelled.
- **Clearing.** The gnome never clears a form. Practice ticks stay until the person closes the panel, and the closing message says so.
- **When protection ends.** The finish card and End message say saving and sending are back on. Pause says it too.

## 7. Engine changes

All are additive, and existing tutorials don't use the new step fields.

| Area | Change |
|---|---|
| `tutorialCore.js` | `composeWalkthrough`, section, resume, continue and position helpers; chosen-group scope in `findTarget` and `matchesTarget`; `getUnsavedWork`; `hasScope` |
| `TutorialRunner.jsx` | Step fields `prep`, `pickScope`, `opens`, `needs`, `waitFor`, `demoOnly`, `demoEffect`, `writes`, `adminOnly`; `unmet` phase; write lock; paused-demo rules; topic label; `auxclick` guard; `summary` as a safe opener |
| `TutorialGnome.jsx` | Topics in the library and search, Continue, unsaved-work check, group detection, Watch the demo, restore held until a topic is finished |
| `lib/supabaseClient.js` | Requests pass through `guardedFetch`. With no lock on, it calls `fetch` unchanged |
| `PortalAdminView.jsx`, `PortalEmailPanel.jsx` | Targets, guards, demo copy, `api` prop |

## 8. Application fixes and follow-ups

No application bug blocked the tutorials, so no application fix was needed beyond the additions above.

Recorded for follow-up, not changed:

| Finding | Effect |
|---|---|
| "Staff updates" tasks (Pay deposit, Pay balance) have no control in this app to complete them: Confirm only appears on a task in review. | A portal with these tasks can't reach 100% from Portal Admin, which also affects the stop-at-100% email rule. The tutorial says only that the guest has nothing to do. Needs a decision on how these are meant to complete. |
| The due date warning (date after arrival) appears when assigning, not in Correct…. | Staff can move a date past arrival with no warning. The tutorial attributes the warning to assigning only. |
| A viewer sees every Portal Admin action, and the server refuses them. | Same as the earlier finding about Save buttons. Tutorial notes cover it for now. |
| `docs/portal-email/SETUP.md` line 3 still says nothing is deployed, while its "Current state" section says otherwise. | Left alone: it's outside this work, and the live state wasn't rechecked. |

## 9. Verification

RESULTS_PLACEHOLDER

## 10. Adding or changing a section

1. Mark the control with `data-tutorial-target="<id>"` and add the id to `TUTORIAL_TARGETS` in `tutorials.js`. If it saves or sends, also add `data-tutorial-guard`.
2. Add steps to a section in `SECTIONS` in `portalTutorial.js`, or add a section with `id`, `group`, `title`, `description`, `keywords` and `steps`. Start with `openPortals`, then `chooseGroup` if it needs a group. The walkthrough, topic, library entry and step numbers follow automatically.
3. Inside a panel, wrap steps with `inPanel`, or `inChecklist` for task rows, so Back and direct starts can reopen them.
4. If a step needs a real record in a particular state, add `needs` with a plain reason.
5. On a control that saves, set `writes: true`, never `demoClick`, and have `say` explain what it would do and that it's switched off.
6. To show an outcome in the demo, add an effect to `EFFECTS` in `portalDemo.js`, name it in `demoEffect`, and add a `demoOnly` step to point at the result.
7. Run `npm test` and the scripts in `tests/browser/README.md`. `portalRuns` picks up new sections by itself.

Check the wording against the code, not this report.
