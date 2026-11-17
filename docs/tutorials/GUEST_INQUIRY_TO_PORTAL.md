# Tutorial: From Guest Inquiry to Guest Portal

A Tutorial Gnome walkthrough for staff training. It follows one fictional group, **Community Bible Church** (contact Jordan Smith), from the public booking form to staff follow-up in Portal Progress. Every step says whose action it is.

- **Where to find it:** the gnome's library, first in the list. Its six sections are also listed under **Individual topics**, so each one can be replayed on its own.
- **Code:** [src/tutorial/inquiryJourneyTutorial.js](../../src/tutorial/inquiryJourneyTutorial.js) (steps), [src/tutorial/inquiryDemo.js](../../src/tutorial/inquiryDemo.js) (fictional requests), [src/tutorial/JourneyPreview.jsx](../../src/tutorial/JourneyPreview.jsx) (previews of the group leader's screens).
- **Tests:** `npm test` (the "From Guest Inquiry to Guest Portal" block in [tests/tutorialGnome.test.js](../../tests/tutorialGnome.test.js)); browser checks in [tests/browser/journeyRuns.browser.mjs](../../tests/browser/journeyRuns.browser.mjs) and [journeyEdges.browser.mjs](../../tests/browser/journeyEdges.browser.mjs).

## The workflow, as the source implements it

| # | Who | What happens | Source |
|---|---|---|---|
| 1 | Group leader | Fills in the public **Group Retreat Form** and presses **Submit Group Form**. Required: group name, primary contact, email, phone, arrival and departure dates, estimated total guests. There is no lodging or retreat type question. | `Guest_Booking_Form/src/formLogic.js` `validateForm`, `src/App.jsx` |
| 2 | Group leader | Sees "Thank you for reaching out… This submission does not create a confirmed reservation." | `Guest_Booking_Form/src/App.jsx` success screen |
| 3 | System | `submit-guest-inquiry` inserts a `guest_inquiries` row with `status: "pending"`. **No email** is sent to staff or the group. | `supabase/functions/submit-guest-inquiry/index.ts` |
| 4 | Staff | **Guest Inquiries** (sidebar) shows New Requests, Converted and Declined. **Review** opens the request. Replies happen outside the app (copy buttons for email and phone). | `src/pages/GuestInquiriesView.jsx` |
| 5 | Staff | Either **Decline Inquiry → Confirm Decline** (status `declined`, optional reason, no email), or **Open Prefilled Booking Form**, which only opens `/form` with the request copied in. | `GuestInquiriesView.jsx`, `src/services/guestInquiryService.js` |
| 6 | Staff | Checks the form (Retreat Type is blank; lodging is not on the guest form) and presses **Save Guest Group**. **This is the moment the booking exists.** A new staff booking is saved with status **Confirmed**; there is no separate confirmation step and nothing is sent to the group. | `src/pages/CreateBooking.jsx` (status comment cites Q-007, Q-015) |
| 7 | System | The request is marked `converted` with `converted_booking_id`; the booking keeps `rentalFormDetails.sourceInquiryId`. If marking fails, the form shows a warning with a retry, and Guest Inquiries offers **Mark converted to this booking**. | `src/pages/Dashboard.jsx` `handleBookingCreated`, `src/services/guestInquiryConversion.js` |
| 8 | System | The booking gets its portal token from the database column default when inserted. | `docs/SECURITY_AND_ACCESS.md`, `src/docs/SQL_SETUP.md` (see limits below) |
| 9 | Staff | In **Portals** (Portal Progress), assigns tasks and documents, then shares the link: **Copy Link** (manual, nothing sent) or **Emails → Enable → Save** (sends the welcome email, following the sending mode). Links are `https://toah-nipi-portal.vercel.app/?portal=<token>` when `VITE_GUEST_PORTAL_BASE_URL` is set to that address. | `src/pages/PortalAdminView.jsx`, `src/components/PortalEmailPanel.jsx`, `src/utils/portalRules.js` |
| 10 | Group leader | Opens the link (no account). Checklist rows show Not Started, Waiting on You, Needs Staff Review or Complete. They upload a file, type an answer, or press **Confirm**; the task moves to Needs Staff Review. The Documents tab lists shared files. **Review & Sign** appears only where staff chose a PDF for that task and signing is on for that booking (off by default). | `Toah_Nipi_Portal/src/App.jsx`, `src/signing.jsx`, `docs/portal-signing/SETUP.md` |
| 11 | Staff | Portal Progress puts Needs Review first. **Confirm** makes a task Complete; **Correct… → Send back for changes** returns it. No email reaches staff when a group submits. Progress: Complete = 1, Needs Review = ½. | `PortalAdminView.jsx`, `src/utils/portalRules.js`, `docs/STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md` (proposal only) |

### What "confirmation" means here

Four different things, which the tutorial keeps apart:

1. **Submitting the public form** confirms nothing. The guest's own screen says so.
2. **Saving the prefilled booking form** creates a booking whose status is already **Confirmed**. Staff do not confirm it again later, and the group is not told automatically.
3. **The group leader's Confirm button** in the portal submits a task for review (Needs Staff Review). It is not a booking confirmation.
4. **The staff Confirm button** in Portal Progress marks one portal task Complete.

## How ownership is shown

- Every step has `role`: `staff`, `leader` (group leader) or `system`. The dialogue shows **STAFF ACTION**, **GROUP LEADER ACTION** or **AUTOMATIC SYSTEM ACTION** in words, with a different border style for each, so color is never the only cue.
- Group leader steps add: "The group leader does this on their own device. You're viewing an explanation of their experience." They never highlight or click a staff control.
- The gnome keeps its look but wears a **blue hat and a name tag** on group leader steps and a **small cog** on automatic ones ([GnomeMascot.jsx](../../src/tutorial/GnomeMascot.jsx) `role`). No animation is added, so reduced motion is unaffected.
- The second step introduces the three markers before any group leader step, and a staff step says plainly that staff never fill in, upload or sign for the group.

## Safety

- **Fictional data only.** Guest Inquiries and Portal Admin each render a second copy of the real screen with fictional rows while the tutorial runs; the real screen stays mounted and hidden. Nothing fictional is written to Supabase, localStorage or a URL.
- **Real navigation, no real saves.** The gnome clicks only navigation: the sidebar, Review, Open Prefilled Booking Form and Emails. Save Guest Group, Confirm Decline, Mark converted, and every portal and email action carry `data-tutorial-guard`. The tutorial's `writeLock` refuses every non-read request at the network, paused or not.
- **Group leader screens are previews**, plain markup with no buttons, inputs, links or requests. No live form or portal is embedded or opened.
- **Clean-up.** Ending or finishing removes both fictional scenes. If the prefilled form was opened from the fictional request, Dashboard puts the booking form back to blank. Leaving the tutorial's pages (`/guest-inquiries`, `/form`, `/portal-admin`) while paused ends it.

## Engine changes this needed (small, shared)

- `step.role` and `STEP_ROLES` ([tutorialCore.js](../../src/tutorial/tutorialCore.js)), rendered by the runner.
- Steps without a target: nothing is highlighted, the page is dimmed, and `step.preview` is shown in the dialogue.
- `scenario.pages`: a fictional demo may span several pages (`getScenarioPages`).
- `tutorial.related`: the "You did it!" screen lists related tutorials (here: Manage a group's portal, Automated emails, Create a booking).
- The dialogue has a max height with scrolling text on every screen size (it already did on phones), so tall previews keep Back, Pause and Next on screen.
- On phones, the docked dialogue moves to the **top** when the target starts in the lower half and can't scroll above it. Examples are the sticky footer of the review dialog and Save Guest Group at the end of the form. This also helps the existing *Create a booking* tutorial.
- `portalDemo.js` ignores effect names it doesn't know, so one effect list drives both scenes.

## Assumptions and open questions

- **Modes.** The request mentioned "walk me through" and "show me" modes. "Walk me through" was removed in `d53ce6b`, so the gnome has one mode: a demonstration that can be paused. Both were checked: running, and paused with the guards still on.
- **Portal token on insert.** That a new booking gets its portal link automatically comes from the documented column default (`encode(gen_random_bytes(16),'hex')`). The repository has no base-schema migration, so the live column default could not be checked here. **Create Guest Portal Link** on Overview exists for bookings without one.
- **Portal base URL.** The tutorial names `toah-nipi-portal.vercel.app`. The app builds links from `VITE_GUEST_PORTAL_BASE_URL`; the production value was not checked.
- **"Going ahead".** Which bookings appear in Portal Progress follows `isPortalEligibleBookingRow`; the tutorial does not list the rule.
- **Same group, two moments.** Portal Admin's fictional group already has tasks in several states, so the tutorial says it shows the group "as it might look a few weeks on".
- **No staff notifications.** Staff are not emailed about new requests or submissions; the tutorial tells them to check Guest Inquiries and Needs Review. If the proposal in `docs/STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md` is built, update steps `form.stored` and `follow-up.status`.
- **Live sites not checked.** The three Vercel apps were not opened during this work. Wording was taken from the local `Guest_Booking_Form` and `Toah_Nipi_Portal` repositories, which may differ from what is deployed.
