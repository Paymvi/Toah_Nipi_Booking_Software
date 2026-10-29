# Audit Questions — Toah Nipi Booking Software

These are the questions I need answered before fixing the issues in [BOOKING_SYSTEM_AUDIT.md](BOOKING_SYSTEM_AUDIT.md), including its pass 2 corrections. Nothing has been changed yet.

**Code state:** The application code is unchanged since the audit (revision `16dd827`). None of the 50 findings has been fixed since then.

**How to answer:**
- Write a letter (A, B, C…) or your own words after **My answer:**.
- Where there is a recommended option, "go with the recommendation" is a fine answer.
- Questions marked **Optional** have a sensible default. If you leave one blank, I will use the recommended option.
- Questions marked **Blocks a fix** need an answer before I change that area.

**How this file is organized:**
- Part A (Q-001 to Q-040): business and workflow questions only you can answer. The highest-impact blocking questions come first.
- Part B: findings I can fix without asking you anything.
- Part C: technical checks that need access to the live database, hosting, or the separate guest apps. Until those checks are done, the related risks are possible, not confirmed.
- Part D: a coverage table for all 50 audit findings.

---

## Part A — Questions for you

### 1. Spreadsheet vs. app: which one is the record?

#### Q-001 — How is the Master spreadsheet used after a group is in the app?
- **Related findings:** AUDIT-006, AUDIT-003
- **What happens now:** Staff can import the Master 2025/2026/2027 sheets, edit those bookings in the app, and re-import the same sheet later. How risky the re-import behavior in Q-002 is depends on how often this happens.
- **Decision needed:** Which description matches how the office works today?
- **Options:**
  - **A.** We import each Master sheet once, then work only in the app.
  - **B.** The office keeps updating the Master sheet and re-imports it from time to time. Some changes are also made in the app.
  - **C.** The sheet is the main working record. The app is mostly for viewing, calendars and the portal.
  - **D.** Something else (please describe).
- **Recommended:** None. This is a fact about your workflow.
- **Blocks a fix?** Yes. It shapes the answer to Q-002 (AUDIT-006).
- **My answer:** A

#### Q-002 — When a re-imported Master sheet disagrees with the app, which should win?
- **Related findings:** AUDIT-006, AUDIT-007
- **What happens now:**
  - Re-importing a Master sheet always replaces a booking's status, waitlist flag, and lodging label.
  - If the sheet row says nothing about status, the importer uses a guess for that year: "Confirmed" for 2025/2026, "Inquiry" for 2027.
  - Any other field the sheet fills in also replaces what staff typed in the app. Fields the sheet leaves blank are kept.
  - The import dialog says "staff-only fields are retained", which is misleading. I will correct that wording whatever you decide.
- **Decision needed:** For Master bookings, who owns each kind of information after the first import?
- **Options:**
  - **A (recommended).** The app wins for anything staff changed in the app. The sheet only updates fields nobody has edited in the app. Status changes only when the sheet row states a status. *Why:* this protects staff work such as cancellations, while new sheet information still comes through. *Limit:* the app can only track edits made after this fix. Earlier edits cannot be detected.
  - **B.** The sheet always wins, as now. I would only fix the dialog text, stop the year-based status guess from overwriting a real status, and stop blank lodging cells from resetting the lodging label.
  - **C.** Show a review list during import ("Sheet says Confirmed, app says Cancelled — keep which?"). *Why not first:* the most work, and slow for large sheets.
  - **D.** Split by field (for example, the sheet owns dates and counts, the app owns status, contacts, notes and lodging). Please list the fields.
- **Example:** Staff cancel "Test Camp" in the app. The office sheet still lists it with no status. After re-import the group shows as Confirmed again, on the Dashboard, calendars and Portal Admin.
- **Blocks a fix?** Yes (AUDIT-006).
- **My answer:** A

#### Q-003 — If two staff edit the same booking at the same time, what should happen?
- **Related findings:** AUDIT-045
- **What happens now:** Each save rewrites the whole booking. If two people have the same booking open, the second save silently undoes the first person's changes. This is the code pattern. How often it happens is not known.
- **Decision needed:**
  1. Does this happen in practice? (Two people, or two browser tabs, working on one booking.)
  2. What should the second person see?
- **Options:**
  - **A (recommended).** The second save is stopped with "This booking was changed by someone else — reload to see their changes." *Why:* simple, and nothing is lost silently.
  - **B.** Tabs save only their own section (checklists, housing, assignments), so edits to different tabs don't collide. A warning still appears for the same section.
  - **C.** Leave it as is. It rarely happens.
- **Note:** Separately from this question, I will fix the Checklists tab so quick clicks on two items can't undo each other. That one is a plain bug.
- **Blocks a fix?** Yes, for the part covering two different users (AUDIT-045).
- **My answer:** A

---

### 2. Which bookings count where

#### Q-004 — Which bookings should hold a building in lodging availability?
- **Related findings:** AUDIT-020, AUDIT-034
- **What happens now:** The Lodging Calendar's availability counts every dated record as occupying its buildings. That includes cancelled, waitlisted, archived and unconfirmed groups. The Dashboard home's housing checks already leave out cancelled and waitlisted groups, so the two screens disagree.
- **Decision needed:** Which statuses should make a building look taken?
- **Options:**
  - **A (recommended).** Confirmed and Contract Sent hold the building. Inquiries are shown as "tentative", in a different style, but don't block. Waitlisted, cancelled and archived groups don't hold anything. *Why:* staff can see possible conflicts without turning away a group for a building that is actually free.
  - **B.** Everything except Cancelled and Archived holds the building, including inquiries and the waitlist.
  - **C.** Only Confirmed holds the building.
- **Example:** A cancelled group from June 10–12 still shows Bethel as taken on those dates today.
- **Blocks a fix?** Yes (AUDIT-020).
- **My answer:** We are moving away from the system that has a status. We are going to assume that every booking that makes it on the booking software is confirmed. Unless it is in the inquiry spreadsheet. So everything that's in the master spreadsheet is confirmed. With that in mind, keep it the same way in the sense that lodging calendar keeps everything unless it is a host, it is specifically an inquiry that you would regularly find in the inquiry spreadsheet. Or if it is very much obvious and confirmed that it is a cancelled booking. 

#### Q-005 — Should the main Calendar show cancelled, waitlisted and archived groups?
- **Related findings:** AUDIT-020
- **What happens now:**
  - The Calendar shows everything with a date.
  - Cancelled, Waitlist, Contract Sent and Archived Visit all get the same gold "Unconfirmed" badge.
  - Past archive visits fill in historic days.
- **Decision needed:** What should the Calendar show by default?
- **Options:**
  - **A (recommended).** Hide cancelled and archived groups by default, with a "show cancelled / archived" toggle. Show the waitlist with its own badge. *Why:* a clean planning view, with history still one click away.
  - **B.** Show everything, but give each status its own badge and color.
  - **C.** Hide cancelled, waitlisted and archived groups completely.
- **Note:** Giving each status its own badge is planned under all three options.
- **Blocks a fix?** Yes (AUDIT-020).
- **My answer:** Like I said before, if it was able to make it into the Master Spreadsheet, it can be assumed that it is a confirmed booking. If it is maybe canceled or archived or in the waitlist or something different, you can make a toggle that is like, oh, might be one of these options. And then you can have it toggle on and off and show on and off on the calendar. But we are hoping that going forward, there's nothing that will be needed to be toggled. You know what I mean? 

#### Q-006 — Is the departure day free for another group?
- **Related findings:** AUDIT-037
- **What happens now:**
  - Nights are counted as departure date minus arrival date, so the departure date is not a night.
  - Lodging availability still treats the departure date as occupied, so back-to-back groups look like they overlap.
  - Meal schedules include the departure day, for breakfast or lunch.
- **Decision needed:** Can a group arrive in a building on the same day another group leaves it?
- **Options:**
  - **A (recommended).** Yes. Lodging availability counts nights only, so the departure day is free for the next arrival. The on-site Calendar and meal views still show the departing group that day. *Why:* matches how nights are already counted.
  - **B.** No. The departure day stays blocked for cleaning or turnover.
- **Example:** Group A leaves Bethel on June 3 and Group B arrives in Bethel on June 3. Today the Bethel availability panel shows both on June 3.
- **Blocks a fix?** Yes (AUDIT-037).
- **My answer:** Yes, in fact, even if two groups are on campus in the same building at the same time that is also just okay in general. It is only not okay if they are in the exact same room together and it's not meant to be like that. 

#### Q-007 — What should a booking entered by staff be before a contract is sent?
- **Related findings:** AUDIT-034, AUDIT-036
- **What happens now:**
  - Create Booking saves a new staff booking as "Inquiry" until a contract date is entered.
  - The Dashboard home and Portal Admin treat these as real bookings.
  - Reports, the Calendar and Contacts show them as inquiries.
- **Decision needed:** What does a staff-entered booking without a contract mean to you?
- **Options:**
  - **A (recommended).** A tentative hold. It is shown as "Tentative" and treated the same way on every screen: it appears in Portal Admin and on calendars as tentative, and in Reports under its own status. *Why:* matches what the Dashboard home and Portal Admin already do, and removes the disagreement.
  - **B.** Just an inquiry, the same as any other. The Dashboard home and Portal Admin would stop treating it as a booking, so a portal link could not be sent until a contract is out.
  - **C.** Confirmed as soon as staff enter it.
- **Blocks a fix?** Yes (AUDIT-034 shared status rules).
- **My answer:** We are moving away from keeping status updates on the spreadsheet because now we have a portal screen that shows the entire status of the actual booking. So, if you have to put something, you can put whatever you want, but it doesn't matter. 

#### Q-008 — Which bookings should Reports totals include by default?
- **Related findings:** AUDIT-030
- **What happens now:**
  - Totals for guests, nights, meals, camper days and revenue add up every record in the date range, including cancelled groups, the waitlist and open inquiries. Only archive records are left out.
  - The screen doesn't say this.
  - With "All Time", undated inquiries are included too.
- **Decision needed:** What should the default report count?
- **Options:**
  - **A (recommended).** Confirmed and Contract Sent by default, with a status filter for the others. The heading states which statuses are included. *Why:* reports reflect groups that are actually coming.
  - **B.** Everything except Cancelled.
  - **C.** Keep counting everything, but label it "all statuses".
- **Note:** An inquiry that was turned into a booking is currently counted twice. I will fix that whatever you choose.
- **Blocks a fix?** Yes (AUDIT-030).
- **My answer:** Make it count everything except stuff that says host or hosting. 

#### Q-009 — In monthly report rows, which month does a stay belong to?
- **Related findings:** AUDIT-046
- **What happens now:** A booking counts entirely in its arrival month. A Dec 30 – Jan 2 stay therefore appears as a December row inside a "This Year" report. Undated records count in the totals but not in any monthly row, so the rows don't add up to the totals.
- **Decision needed:** How should stays that cross a month boundary be counted?
- **Options:**
  - **A (recommended).** Arrival month, stated on screen. Rows are limited to the selected range, and an "Undated" row makes the totals reconcile. *Why:* simple and predictable.
  - **B.** Split nights and camper days across the months they actually fall in.
- **Blocks a fix?** Yes (AUDIT-046).
- **My answer:** A

#### Q-010 — What is the "Imported" status for?
- **Related findings:** AUDIT-032
- **What happens now:**
  - The Edit tab's status list includes "Imported", which no other screen understands.
  - Choosing it removes the booking from Portal Admin and leaves it in an undefined state.
  - The list lacks "Archived Visit", so opening an archive record shows "Inquiry" in the dropdown.
- **Decision needed:** Do staff use "Imported" for anything?
- **Options:**
  - **A (recommended).** No. Remove it from the list. Any records already set to "Imported" get the status their dates suggest; I'll show you the list first (check V-010). Add "Archived Visit" as a read-only value. *Why:* one status list everywhere.
  - **B.** Yes, it means something (please describe).
- **Blocks a fix?** Yes (AUDIT-032), but it is small.
- **My answer:** A

#### Q-011 — Is the Inquiry Pipeline still in use?
- **Related findings:** AUDIT-011, AUDIT-041
- **What happens now:** Its sidebar link is hidden, but the page still works at `/inquiry-pipeline`. It also puts confirmed groups that started on the waitlist in the Waitlist column.
- **Decision needed:** Keep it or retire it?
- **Options:**
  - **A (recommended).** Keep it reachable, and fix the columns so they follow the current status. *Why:* the fix is small and nothing is lost.
  - **B.** Retire it. Remove the page and its link from the README.
  - **C.** Bring it back into the sidebar, with the column fix.
- **Blocks a fix?** Optional. The column fix is the same unless you pick B.
- **My answer:** A. When I mean keep it reachable, I mean don't delete the code from the codebase, but don't make it reachable in the sense that someone like a staff could actually access it inside the software. Because I'm not really planning on using it anytime soon for anything other than I like the styling. 

---

### 3. Backup and restore

#### Q-012 — What should the in-app "Replace" restore be allowed to do?
- **Related findings:** AUDIT-009, AUDIT-010, AUDIT-038, AUDIT-001
- **What happens now:**
  - Replace deletes every booking and re-inserts the bookings from the backup file.
  - The restore never writes back each booking's guest-portal link code or its creation date.
  - The README says the database then creates new link codes, which would break portal links already sent to guests. This is documented but has not been tested.
  - What happens to portal tasks and documents when their bookings are deleted depends on a database setting not yet checked (V-002). They could be deleted along with the bookings, or the delete could fail.
  - The README already says not to use Replace on production, but the screen doesn't warn about portal links.
- **Decision needed:** How should Replace behave?
- **Options:**
  - **A (recommended).** For now, disable Replace in the app, or require Dev Mode plus a typed confirmation that names the portal risk. Safe Merge stays as the everyday restore. Later, make backups complete enough that Replace is safe. *Why:* removes the one action that could cause wide damage, with little effort.
  - **B.** Keep Replace, but make it keep portal link codes and creation dates, and refuse to run while portal tasks or documents exist.
  - **C.** Make Replace a full disaster-recovery restore covering bookings, portal tasks, documents and guest inquiries (see Q-013).
- **Blocks a fix?** Yes (AUDIT-009, AUDIT-010).
- **My answer:** I like that idea for A to just have a confirmation dev mode thing. 

#### Q-013 — What should a backup contain?
- **Related findings:** AUDIT-010, AUDIT-009, AUDIT-017, AUDIT-049
- **What happens now:** The in-app backup holds booking records only, and the Backup page says so. Not included:
  - website inquiries (`guest_inquiries`);
  - portal tasks and documents;
  - uploaded files;
  - the staff list, starred contacts and saved spreadsheet views, which live only in each browser.
- **Decision needed:** Pick everything that should be backed up and restorable (you can pick several).
- **Options:**
  - **A (recommended).** Bookings, website inquiries, portal tasks and portal documents, plus a list of uploaded file names, with all portal link codes and creation dates kept. *Why:* covers everything guests have submitted. A file list is small; copying the files themselves would make backups very large.
  - **B.** Option A plus copies of the uploaded files.
  - **C.** Bookings only, as now. The Google Apps Script backups or Supabase's own backups cover the rest (see Q-014).
  - **D.** Also back up the staff list and contact stars once they are stored online (Q-018, Q-038).
- **Blocks a fix?** Yes (AUDIT-010).
- **My answer:** A. Yeah, I want the backup to include everything, but just keep in mind that this whole system is connected to a backup system with Google Drive and everything that's supposed to connect back to the booking software that should be able to work. So just make sure that everything still works fine after updating everything so that it's backing up everything. 

#### Q-014 — Which backup do you actually rely on?
- **Related findings:** AUDIT-009, AUDIT-010
- **What happens now:** The README mentions Google Apps Script backups (`createDailyBookingBackup`) that are not in this repository. I can't tell whether they run or what they include. The Supabase plan's own backups are also unknown.
- **Decision needed:**
  1. Are the Apps Script daily backups still running?
  2. Does your Supabase plan include automatic database backups or point-in-time restore?
  3. Has anyone ever used "Replace" on the live system?
- **Options:** Free answer. "Don't know" is fine; I'll add a check (V-013, V-015).
- **Blocks a fix?** It sets how urgent Q-012 and Q-013 are.
- **My answer:** Yes, we are using a Google Apps script that backs up the data into Google Drive. It does daily backups. Now we don't have anything set up for backing up when it comes to Supabase. 

---

### 4. Guest portal

#### Q-015 — When staff confirm a portal item, should the booking update too?
- **Related findings:** AUDIT-029
- **What happens now:** Three places track the same milestones, and none updates the others:
  - the portal checklist (contract, deposit, insurance, guest count, food allergies);
  - the booking's timeline dates (contract sent and returned, deposit received, insurance certificate);
  - the internal Checklists tab.

  So staff can confirm a signed contract in Portal Admin while the Dashboard still lists the group under "Contracts awaiting return."
- **Decision needed:** Should confirming a portal item fill in the matching booking date?
- **Options:**
  - **A (recommended).** Yes, for contract, deposit and insurance. Confirming fills in the matching date with today, but only if it is empty. Status then follows the existing rules (contract returned → Confirmed). Staff see what changed. *Why:* one confirmation instead of two, and an existing date is never overwritten.
  - **B.** No automatic change. Show the portal status next to the timeline dates on the booking Overview so mismatches are visible.
  - **C.** Link both ways: entering a timeline date also completes the portal item.
- **Example:** Staff confirm "Sign and return contract" on June 1. Under A, the contract returned date becomes June 1 and the group moves to Confirmed.
- **Blocks a fix?** Yes (AUDIT-029).
- **My answer:** I think the smart move here is to just fully remove the status of the dashboard Remember how we removed the status from the master spreadsheet?. The only place where we want to store the statuses of the bookings is the portal. 

#### Q-016 — Should "Needs Review" count as done in portal progress?
- **Related findings:** AUDIT-029
- **What happens now:** The progress percentage counts items the guest has submitted but staff haven't reviewed as done, while the label says "Needs Review."
- **Options:**
  - **A (recommended).** Count only Completed in the percentage, and show "2 waiting for review" separately. *Why:* the percentage then means "finished."
  - **B.** Keep counting guest submissions as progress.
- **Blocks a fix?** Optional.
- **My answer:** If the guest leader submits something and it needs review, make it like 50% the jump. And make it jump further once the staff reviews it. 

#### Q-017 — Which portal corrections should staff be able to make?
- **Related findings:** AUDIT-038
- **What happens now:** Portal Admin can add tasks and documents and confirm guest submissions. It can't undo anything. Fixing a wrong assignment needs database access.
- **Decision needed:** Pick every action staff should have:
  - **(a)** Remove a task assigned by mistake.
  - **(b)** Change a task's due date.
  - **(c)** Send a guest's upload back with "needs changes", so the guest can upload again.
  - **(d)** Remove a document staff shared.
  - **(e)** Reopen a task that was confirmed by mistake.
- **Follow-up decision:** When a task with a guest upload is removed, should the uploaded file be deleted or kept?
- **Recommended:** All five actions. On removal, keep the guest's file and hide it from the guest; deleting it can't be undone, and you may need it later.
- **Blocks a fix?** Yes (AUDIT-038).
- **My answer:** All five actions

#### Q-018 — Portal assignment preferences
- **Related findings:** AUDIT-050
- **What happens now:**
  - Due dates are optional and not checked against stay dates.
  - InterVarsity-specific documents are grouped separately but never pre-selected.
  - Two staff working at the same time can assign the same task twice. Preventing that is a technical fix; see Part B.
- **Decision needed:**
  1. Should due dates be required to fall before the arrival date?
  2. Should IV documents be pre-selected when the retreat type mentions InterVarsity?
- **Recommended:** 1 — warn, but allow it. 2 — yes, pre-select, but let staff untick them.
- **Blocks a fix?** Optional.
- **My answer:** 1 - warn but allow it. 2 - don't preselect anything

---

### 5. Staff, tasks and permissions

#### Q-019 — Does everyone who gets assigned work have an app login?
- **Related findings:** AUDIT-017, AUDIT-016, AUDIT-043
- **What happens now:** Two separate staff lists exist:
  - **Logins** live in Supabase and decide who can sign in.
  - **The staff list** (User Admin, assignments, checklist "completed by") is stored separately in each browser.

  Problems this causes:
  - Each computer can have a different list.
  - Deleted people come back automatically when a booking still mentions their name.
  - Renaming someone doesn't update their tasks.
  - "Completed by" shows whoever is selected in that browser, not who is logged in.
- **Decision needed:** Is every person you assign checklist items, staff assignments or facility tasks to someone with their own login? Or do you also assign people without logins, such as program staff or volunteers?
- **Options:**
  - **A.** Everyone assigned has a login.
  - **B.** Some assigned people don't have logins.
- **Blocks a fix?** Yes. It decides Q-020.
- **My answer:** Everyon uses the same login email and password so it doesnt matter

#### Q-020 — Where should the staff list live?
- **Related findings:** AUDIT-017
- **Options:**
  - **A (recommended if you answered B to Q-019).** One shared staff directory stored in Supabase, the same on every computer. People with logins are linked to their account. "Completed by" uses the logged-in person. *Why:* consistent everywhere, and still allows people without logins.
  - **B (recommended if you answered A to Q-019).** Use the login accounts as the staff list, with display names. *Why:* one list, nothing to keep in sync.
  - **C.** Keep the per-browser list, but stop deleted users from coming back automatically.
- **Follow-up decision:** Existing assignments store a person's name as typed. Should I match old names to the new list and show you the matches to approve first?
  - Recommended: yes.
- **Blocks a fix?** Yes (AUDIT-017).
- **My answer:** idk bro

#### Q-021 — Are staff assignments tasks to complete, or information?
- **Related findings:** AUDIT-016
- **What happens now:**
  - The Staff Assignments tab (role, person, notes) feeds the Jobs view as tasks that can never be ticked off.
  - Each is due on the arrival date, so they all become "Overdue" once the retreat starts.
  - Jobs also lists tasks from cancelled groups.
- **Decision needed:**
  1. What are staff assignments?
  2. What should Jobs do with tasks from cancelled or waitlisted groups?
- **Options for 1:**
  - **A (recommended).** Information: "who is doing what for this group." Show them in Jobs as "Assigned", never overdue. *Why:* matches the current tab, which has no done checkbox.
  - **B.** Tasks: add a done checkbox to the tab and keep the arrival-date due date.
- **Options for 2:**
  - **A (recommended).** Hide them by default, with a "show cancelled" toggle.
  - **B.** Show them, labeled "Cancelled group", and never overdue.
- **Blocks a fix?** Yes (AUDIT-016).
- **My answer:** Do what you think is best

#### Q-022 — Are Create Booking "Facilities" rows tasks?
- **Related findings:** AUDIT-043
- **What happens now:** Each Facilities row in Create Booking has a date, time, task, a free-text "Staff member" box, and notes. These rows show only on the booking Overview. They never appear in the Jobs view, and the staff member box isn't connected to the staff list.
- **Options:**
  - **A (recommended).** They are tasks. They appear in Jobs, due on their date, and "Staff member" becomes the same staff picker the other tabs use. *Why:* the form already asks for a person and a date.
  - **B.** They are notes. Rename "Staff member" to something like "Contact / notes" and leave them out of Jobs.
- **Blocks a fix?** Yes (AUDIT-043).
- **My answer:** A

#### Q-023 — Which actions should non-admin staff and viewers see?
- **Related findings:** AUDIT-023
- **What happens now:**
  - The database lets only admins delete bookings.
  - The app shows Delete, Delete All, Import and Restore to everyone.
  - When a non-admin clicks Delete, the booking disappears from the screen but comes back on refresh. Nothing was actually deleted.
  - Viewers see edit buttons that fail with a generic error.
- **Decision needed:** Who should be able to do what?
- **Options:**
  - **A (recommended).** Keep the database rules as they are:
    - Hide Delete, Delete All and Replace restore from non-admins.
    - Hide edit controls from viewers.
    - Show a clear "not permitted" message if a denied action happens anyway.

    *Why:* the screen then matches what really happens.
  - **B.** Let regular staff delete bookings too. This needs a database permission change, which I would write for you to review and run.
- **Follow-up decision:** Are there any viewer accounts in use today? ("Don't know" is fine; check V-003.)
- **Blocks a fix?** Yes, for the role-aware screens. The "not permitted" message is fixed either way.
- **My answer:** A

---

### 6. Lodging

#### Q-024 — Once staff use the Housing tab, does it replace the imported lodging text?
- **Related findings:** AUDIT-007, AUDIT-006
- **What happens now:**
  - Imported Master bookings keep their original "Buildings / Rooms" text in a separate lodging label.
  - The Housing tab never updates that label, so a building staff removed still shows as occupied.
  - Reopening the Housing tab ticks the removed building again.
- **Decision needed:** After the Housing tab is saved, should its choices be the only lodging record?
- **Options:**
  - **A (recommended).** Yes. The Housing tab becomes the source of truth. The original imported text is kept, labeled "Imported lodging note", on the Overview for reference. *Why:* staff corrections stick, and nothing from the sheet is lost.
  - **B.** Keep showing both, side by side, and let staff clear the imported text by hand.
- **Interaction with Q-002:** Should a later re-import be allowed to change lodging once the Housing tab has been used?
  - Recommended: no.
- **Example:** The sheet says "Bethel, Dothan". Staff keep Bethel only in the Housing tab. Today Dothan still looks occupied on the Lodging Calendar.
- **Blocks a fix?** Yes (AUDIT-007).
- **My answer:** A

#### Q-025 — Please confirm the building list
- **Related findings:** AUDIT-031
- **What happens now:** Six or seven separate copies of the building list exist.
  - **Capacities agree:** they are written down in only two places (Create Booking and the Overview lodging card), and they match. The audit's statement that capacities disagree is not borne out.
  - **Real differences:**
    - which buildings appear (Camping is missing from the Lodging Calendar and the Overview card);
    - how Hebron is split;
    - accepted spellings ("Aijalon" and "Capurnum" are only recognized on the Dashboard home);
    - "Rustic Cottage 1–4" appear only in unused code.

  Current list and capacities:

  | Building | Capacity in the app | Sub-areas in the Housing tab |
  |---|---|---|
  | Bethel | 70 | Upper, Middle and Lower Floor; Rooms 1–11 |
  | Hebron 3rd Floor | 14 | — |
  | Hebron Bunks | 52 | Men's Bunks, Women's Bunks |
  | Dothan | 21 | Upper and Middle Floor; Rooms 1–6 |
  | Ajalon | 5–8 | — |
  | Capernaum | 5 | — |
  | Guest House | 9–12 | — |
  | Camping | — | Tent, RV |

- **Decision needed:**
  1. Are these buildings and capacities right?
  2. Do "Rustic Cottages" exist as lodging?
  3. Any other spellings or abbreviations the office uses (for example "GH", "Aijalon")?
- **Recommended:** Keep the list above. Accept every known spelling on every screen. Drop the Rustic Cottages unless they are real.
- **Blocks a fix?** Optional. If you don't answer, I'll combine the copies using the values above.
- **My answer:** Aijalon is wrong my bad. Also drop rustic cottages... they are supposed to be Capernaum and Ajalon but those are already taken care of. 

---

### 7. Reports: money, deposits and counts

#### Q-026 — Which deposit entries mean "deposit received"?
- **Related findings:** AUDIT-047
- **What happens now:**
  - Reports count a deposit as received unless the deposit cell says exactly no, n, false, not received, pending, or 0.
  - So "N/A", "TBD" or "No - due 3/1" count as received, and their amounts are added to "Deposits Received".
  - The importer itself uses a stricter rule for the same cell.
- **Decision needed:** What should count as received?
- **Options:**
  - **A (recommended).** Only a date, or a clearly positive entry: yes, y, received, rec'd, paid, or a check number. Everything else, including blank, N/A and TBD, is not received. *Why:* it is safer to under-report than to report money that never arrived.
  - **B.** Keep the current loose rule.
- **Follow-up decision:** Please list any shorthand the office uses in the deposit column (for example "pd", "chk 1043", "waived"), and say whether "waived" should count as received.
- **Blocks a fix?** Yes (AUDIT-047). A count of the actual values in your data (V-020) would help you answer.
- **My answer:** Keep the current loose roll. The whole point of moving on to this new booking software is that we don't have to have a column for deposit received and stuff like that because the status of the booking will be handled by the portal. So in a way this column does not really matter. 

#### Q-027 — How should revenue be reported for bookings entered by staff?
- **Related findings:** AUDIT-015
- **What happens now:** Reports get revenue only from invoice or expected-revenue figures that come from Master sheets. Create Booking has no field for these, so every booking entered in the app shows $0 revenue, marked "Missing".
- **Options:**
  - **A.** Add an "Invoice total" field to Create Booking.
  - **B.** Estimate it from quoted rate × guests × nights, labeled "Estimated".
  - **C (recommended).** Both: an entered invoice total wins, otherwise show the estimate, clearly labeled. *Why:* reports are never blank, and the real figure replaces the estimate when known.
- **Follow-up decision:** Should the minimum guarantee be used when actual guests are below it?
  - Recommended: yes, for the estimate.
- **Blocks a fix?** Yes (AUDIT-015).
- **My answer:** Honestly, for now, just remove the revenue reportings because that's not really going to be accurate on our platform as of now. 

#### Q-028 — Should an imported "Camper Days" figure update when staff edit guests or nights?
- **Related findings:** AUDIT-035
- **What happens now:** If the Master sheet gave a Camper Days number, Reports always use it, even after staff change the guest count or nights. A comment in the code says this is deliberate, to avoid double counting.
- **Options:**
  - **A (recommended).** Use the sheet's number until staff edit the guest count, nights or meals. Recalculate after that. *Why:* keeps the deliberate behavior for untouched imports and fixes stale numbers after edits.
  - **B.** Always use the sheet's number (current).
  - **C.** Always recalculate.
- **Blocks a fix?** Yes (AUDIT-035).
- **My answer:** A

#### Q-029 — How should a guest-count range like "40-50" be counted?
- **Related findings:** AUDIT-018
- **What happens now:** Different screens read "40-50" differently:
  - **Reports:** 40.
  - **Dashboard home "guests on site":** 0.
  - **Contacts:** the text as written.
- **Options:**
  - **A (recommended).** The first (lower) number, the same everywhere. *Why:* matches Reports today and avoids overstating.
  - **B.** The higher number, for planning beds and meals.
  - **C.** The midpoint.
- **Blocks a fix?** Yes (AUDIT-018), but any choice is quick to apply.
- **My answer:** Use the first slash lower number if it's something that requires or needs a number or calculation. If it can be displayed as a text, then use the full text version please. 

#### Q-030 — Retreat types: what are the official categories?
- **Related findings:** AUDIT-042
- **What happens now:**
  - Create Booking offers 22 fixed types (for example "Personal Retreat", "Church - Children").
  - Imported records keep the sheet's own text (for example "PR", "PR-Day Use Only", "Families").
  - Reports group by the exact text, so "PR" and "Personal Retreat" are separate slices.
- **Options:**
  - **A (recommended).** Use Create Booking's 22 types as the official list. Imported shorthand is mapped onto them, keeping the original text for reference. Reports group by the official type. *Why:* staff already use this list for new bookings.
  - **B.** Group into a few broad buckets (for example Personal, Church, Families, School, Other).
  - **C.** Leave as is.
- **Follow-up decision:** If you pick A or B, please list the shorthand the office uses and what each means (for example PR = Personal Retreat; is "PR-Day Use Only" its own type?).
- **Blocks a fix?** Yes (AUDIT-042).
- **My answer:** A

#### Q-031 — How should Reports label where a booking came from?
- **Related findings:** AUDIT-036
- **What happens now:** Reports count "Public Form" only for old records. Bookings converted from website inquiries are counted as "Staff Booking", so website inquiries are under-reported.
- **Options:**
  - **A (recommended).** Five sources: Staff entered, Website inquiry, Master sheet, Guest Group sheet, Archive. *Why:* you can see how many bookings came from the website.
  - **B.** Keep the current labels.
- **Blocks a fix?** Yes (AUDIT-036), but it is small.
- **My answer:** A

---

### 8. Imports, dates and exports

#### Q-032 — Can you check one imported inquiry date for me?
- **Related findings:** AUDIT-013
- **What happens now:**
  - The code reads dates from Guest Group Inquiry sheets (and archive visit dates) in a way that, on a computer set to U.S. Eastern time, should land one day early.
  - The Master sheet importer does not have this problem.
  - I haven't been able to run it to confirm.
- **Decision needed:**
  1. Open one imported guest-group inquiry in the Inquiry Spreadsheet and compare its date with the same row in the original Excel sheet. Is it one day earlier?
  2. If yes, how should the existing records be repaired?
- **Options for 2:**
  - **A (recommended).** Fix the importer and give you a repair script that moves those dates forward one day, for you to review and run. Also make re-imports recognize the old dates, so no duplicates are created. *Why:* corrects old and new data together.
  - **B.** Fix the importer only and leave old records alone. Re-imports must then be handled carefully, because the corrected dates won't match the old records and would create duplicates.
- **Blocks a fix?** Yes (AUDIT-013).
- **My answer:** A

#### Q-033 — What will the 2028 sheets look like?
- **Related findings:** AUDIT-024
- **What happens now:**
  - Importers and menus only know 2025–2027.
  - A 2028 sheet would be skipped as "not recognized".
  - When a Master row has no status, 2025/2026 rows default to "Confirmed" and 2027 rows to "Inquiry".
- **Decision needed:**
  1. Will 2028 sheets follow the same names (for example "2028 Guest Group Inquiries", "Master 2028") and the same columns as 2027?
  2. When a Master row has no status information, what should it default to?
- **Options for 2:**
  - **A (recommended).** "Inquiry" for any year that has a "Confirmed or Unconfirmed" column. Keep "Confirmed" only for the older 2025/2026 layouts. *Why:* never mark a group confirmed without evidence.
  - **B.** Keep the year-based defaults and add 2028 as "Inquiry".
- **Blocks a fix?** Yes (AUDIT-024). This becomes urgent once 2028 sheets arrive.
- **My answer:** Let's not worry about this for now. 

#### Q-034 — What is "Export Excel" for?
- **Related findings:** AUDIT-014
- **What happens now:**
  - The "Export Excel" button creates a 12-column "Booking Inquiries" sheet containing every record.
  - Its "Waitlist or No" column holds Yes/No, while the importer reads that same heading as Waitlist / Considering / No.
  - If the file were renamed and re-imported, most groups would become Cancelled. Import Everything skips it under its current name, so this only happens if someone renames it.
- **Options:**
  - **A (recommended).** It is a contact/inquiry list. Rename it ("Export contact list"), fix that column, and say on screen that the JSON Backup is the full-data format. *Why:* matches what it already contains.
  - **B.** Make it a full export that can be safely re-imported. This is much more work.
- **Blocks a fix?** Yes (AUDIT-014).
- **My answer:** A

#### Q-035 — Is the Archive import retired?
- **Related findings:** AUDIT-025, AUDIT-033
- **What happens now:** The menu item is hidden, but the importer is still in the code. Running it twice would create duplicate copies of every archive record.
- **Options:**
  - **A (recommended).** It is retired. Remove the hidden importer. *Why:* less code that can go wrong.
  - **B.** We will use it again. Make re-imports update existing records instead of creating duplicates.
- **Blocks a fix?** Optional.
- **My answer:** A

---

### 9. Contacts and smaller display choices

#### Q-036 — Should secondary contacts be searchable in the main Contacts list?
- **Related findings:** AUDIT-039
- **What happens now:** Secondary contacts appear in a separate table below the main list. They can't be searched, starred or merged. A person who is primary on one booking and secondary on another appears twice, unlinked.
- **Options:**
  - **A (recommended).** Yes. Include them in the main list, labeled "secondary contact on…", so searching finds them.
  - **B.** Keep the two tables as they are.
- **Blocks a fix?** Optional.
- **My answer:** A

#### Q-037 — What should the "Need To Know" column mean?
- **Related findings:** AUDIT-040
- **What happens now:**
  - For imported records, "Need To Know" holds the sheet's operational notes.
  - For staff-entered bookings, it holds meal notes.
  - Linen piece requests (as opposed to sets) are not shown in the Spreadsheet.
- **Options:**
  - **A (recommended).** "Need To Know" means general operational notes everywhere. Staff meal notes appear with meals, and linen pieces are added to the linen summary.
  - **B.** Keep it as is, and rename the column "Need To Know / Meal Notes".
- **Blocks a fix?** Optional.
- **My answer:** A

#### Q-038 — Should hidden and starred contacts be shared or personal?
- **Related findings:** AUDIT-049
- **What happens now:** Hiding ("deleting") or starring a contact is saved only in that browser. A hidden contact can reappear when a new booking adds an email address.
- **Options:**
  - **A (recommended).** Hidden contacts are shared by all staff; stars are personal to each login. Both are saved online. *Why:* hiding is cleanup everyone benefits from; stars are personal favorites.
  - **B.** Both shared.
  - **C.** Keep both per-browser, but make hidden contacts stay hidden more reliably.
- **Note:** I will fix the grouping problem (one person split into two contacts) whatever you choose.
- **Blocks a fix?** Optional.
- **My answer:** A

---

### 10. Existing data

#### Q-039 — How should repairs to existing records be done?
- **Related findings:** AUDIT-002, 003, 004, 005, 007, 008, 013, 032, 044
- **What happens now:** Several code fixes only protect future records. Existing records may also need correcting. I don't query or change the live database, so each repair would be a script for you to review and run.

  Candidate repairs (each depends on what the checks in Part C find):
  - **(a)** Master bookings whose Edit-tab corrections didn't reach Contacts and Reports: copy the corrected values into the hidden copy (AUDIT-003). The corrected values are always the newer ones, so no judgment is needed per record.
  - **(b)** Staff bookings whose "Activities" column holds raw code-like text: rebuild readable text (AUDIT-002).
  - **(c)** Lodging text missing camping or room detail, or with duplicated camping text: rebuild from the saved Housing-tab values (AUDIT-005).
  - **(d)** Imported bookings whose stale lodging label conflicts with the Housing tab: update the label (AUDIT-007, after Q-024).
  - **(e)** Guest-group inquiry dates one day early (AUDIT-013, after Q-032).
  - **(f)** Website inquiries linked to the wrong booking, or left "New Request" after conversion: give you a list to review (AUDIT-004, AUDIT-008).
  - **(g)** Records set to "Imported" status (AUDIT-032, after Q-010).
- **Decision needed:** Which repairs do you want?
- **Options:**
  - **A (recommended).** For each one, I first give you a read-only query that lists the affected records. You run it, look at the list, and then run the repair script I give you. Take a backup first.
  - **B.** Fix the code only. Leave existing records as they are.
  - **C.** Pick individual repairs from the list above.
- **Blocks a fix?** It doesn't block the code fixes. It blocks the data repairs.
- **My answer:** Please repair everything. 

#### Q-040 — What should happen to test bookings made with "Fill Test Data"?
- **Related findings:** AUDIT-044
- **What happens now:**
  - The "Fill Test Data" button is visible on the live create form. Saving after clicking it creates "Test Community Church" (June 18–20, 2027) as a real booking.
  - If the form was opened from a website inquiry, that real inquiry is also marked converted to the test booking.
  - I plan to show the button only in Dev Mode (Part B).
- **Decision needed:** If test bookings turn up (check V-019), what should happen to them?
- **Options:**
  - **A (recommended).** I give you a list. You delete them from the app as an admin. Any website inquiry wrongly linked to one is put back to "New Request".
  - **B.** Leave them.
- **Blocks a fix?** Optional. It only matters if test bookings exist.
- **My answer:** B, leave them

---

## Part B — Findings I can fix without asking you

Each would still be done as its own small change for you to review, and nothing is committed. Where a fix touches a server function or the database, I write the change and you deploy or run it.

| Finding | Proposed approach |
|---|---|
| AUDIT-001 | Show each booking's original creation date (read-only). Keep the extra stored fields the app depends on when a booking is reloaded, so future fields can't silently disappear. |
| AUDIT-002 | Save a readable activities summary in the Activities column, as meals and allergies already do. Keep the structured rows where they already are. Remove the code branch that can never run. |
| AUDIT-003 | Make the Edit tab update both stored copies of each field. Make Contacts, Reports and the Overview read the copy every edit path updates. The repair for existing records is Q-039(a). |
| AUDIT-004 | Store the website-inquiry ID with the form that was opened from it, and mark only that inquiry converted. Clear it when staff start a different booking. |
| AUDIT-005 | Use one lodging-summary builder for Create Booking and the Housing tab, and remove the duplicated camping text. |
| AUDIT-008 | If marking the website inquiry converted fails, tell staff ("Booking saved, but the inquiry is still open — retry") instead of only logging it. |
| AUDIT-011 | Pipeline columns follow the current status. The original disposition stays as a label. (Unless Q-011 = retire.) |
| AUDIT-012 | Show the real inquiry date (or blank) in the Spreadsheet "Submitted" column, Contacts ordering, and Export Excel, instead of the import time. |
| AUDIT-019 | In Inquiry Record Detail, recalculate status only when the disposition field was actually changed. |
| AUDIT-020 (part) | Give the calendar badges a distinct label and color per status. Which records appear and count is Q-004 and Q-005. |
| AUDIT-022 | In a production build, refuse to copy a portal link when the portal web address isn't configured, and show staff an error, instead of copying a `localhost` link. |
| AUDIT-023 (part) | Check that a delete actually removed the row. If not, keep the booking on screen and say "not permitted." Hiding controls by role is Q-023. |
| AUDIT-026 | Add a newly created booking to the Dashboard right away, and keep the "Booking created" message visible after a seeded form saves. |
| AUDIT-027 | Add the standard browser cross-origin handling and stricter date and number checks to the website-inquiry function, matching the other function. Check V-005 first to see whether it is currently broken. Deployment is yours. |
| AUDIT-030 (part) | Count an inquiry and the booking created from it once, as the Dashboard home already does. |
| AUDIT-033 | Delete the unused code listed in the audit, after a final search confirms nothing uses it. |
| AUDIT-041 | Update the README and `src/docs` after the related fixes land. |
| AUDIT-044 | Show "Fill Test Data" only when Dev Mode is on, and never on a form opened from an inquiry. |
| AUDIT-045 (part) | In the Checklists tab, disable buttons while a save is running and build each save from the latest list, so quick clicks can't undo each other. Two-user conflicts are Q-003. |
| AUDIT-048 | Round numbers in the Reports CSV the same way the screen does. Add a "Filters used" section at the top. Neutralize cell text that starts with `=`, `+`, `-` or `@`, so spreadsheet programs don't treat it as a formula. |
| AUDIT-049 (part) | Fix contact grouping so one person matched by email on one booking and by phone on another becomes one contact. Where hidden and starred contacts are saved is Q-038. |
| AUDIT-050 (part) | Re-check for an existing identical task or document just before saving. Database-level duplicate protection depends on V-018. |

---

## Part C — Technical checks still required

These need access to the live database, hosting settings, or the separate guest apps. I haven't run any of them. Each one is read-only, and you or someone with access would run it. Until they are done, the related risks are possible, not confirmed. They match the E-numbers in Section 8 of the audit.

| ID | What to check | Evidence that would settle it | Fixes it blocks or sizes |
|---|---|---|---|
| V-001 | Column types and defaults of the `bookings` table, especially `activities` and the portal link code default (audit E-1) | A list of column names, types and defaults | AUDIT-002 (what is actually stored), AUDIT-009 |
| V-002 | Whether `guest_inquiries`, `portal_checklist_items` and `portal_documents` exist as the code expects, and what happens to portal rows when a booking is deleted (cascade, block, or unlink) (E-2) | Table definitions and foreign-key rules | AUDIT-010 severity and the Q-012/Q-013 design; AUDIT-021 |
| V-003 | Database access rules on all five tables and on the file storage; which roles exist and who has them (E-3) | A policy list and the staff role assignments | AUDIT-008, AUDIT-023 (and Q-023's viewer question), AUDIT-038 |
| V-004 | Default for `guest_inquiries.submitted_at` (E-4) | The column default | Inquiry ordering; AUDIT-021 documentation |
| V-005 | The deployed website-inquiry function matches the repo, and a submission from the real public website succeeds in the browser (E-5) | The deployed source, plus the browser network tab during one test submission (a test entry you then decline) | AUDIT-027 urgency (if broken, website inquiries may not be arriving) |
| V-006 | Hosted login settings: sign-ups disabled, anonymous sign-in off (E-6) | The Auth settings screen | Security model (no fix pending) |
| V-007 | The portal web address variable is set in the production build (E-7) | Hosting environment variable list | AUDIT-022 urgency |
| V-008 | How the guest portal finds uploaded files and checks link codes (E-8) | Guest portal source, or the `portal_upload_path_is_allowed` definition | AUDIT-038 (storing file paths), AUDIT-009 |
| V-009 | How many Master bookings have mismatched copies (E-9) | A read-only comparison count | Size of the Q-039(a) repair |
| V-010 | Records whose status and waitlist flag disagree, or whose status is "Imported" (E-10) | A read-only query | AUDIT-032, Q-010; data sanity |
| V-011 | Activities values stored as code-like text (E-11) | A count | Q-039(b) |
| V-012 | Records still holding old extra fields (E-12) | A count | AUDIT-001 (allow-list contents) |
| V-013 | Whether a Replace restore has ever been run (E-13) | Creation dates clustered at one moment; portal rows or files with no booking | AUDIT-009/010 existing damage; Q-014 |
| V-014 | Website inquiries linked to the wrong booking, or still pending after conversion (E-14) | A read-only comparison | Q-039(f) |
| V-015 | What the Google Apps Script backups include and whether they run (E-15) | Apps Script source and run history | Q-013/Q-014 scope |
| V-016 | Staff computers' time zone (E-16) | Confirm U.S. Eastern | AUDIT-013 (also settled by Q-032) |
| V-017 | Whether the guest portal writes to the `bookings` table (E-17) | Portal function definitions or source | AUDIT-045. If yes, staff full-row saves could overwrite guest changes. |
| V-018 | Unique constraints on portal tasks and documents (E-18) | Index list for both tables | AUDIT-050 (database-level duplicate protection) |
| V-019 | Whether "Test Community Church" bookings exist in production (E-19) | A read-only query | Q-040 |
| V-020 | The actual values in Master deposit columns (E-20) | A grouped count of distinct values | Q-026 |
| V-021 | Export the live database structure (tables, access rules, storage rules, functions) into the repository | A schema dump committed by you | AUDIT-021. It also allows testing every fix against a copy instead of production. |
| V-022 | Request shapes the public inquiry form sends for allergies, activities and meals | Public form source, or one sample request | AUDIT-028 (Create Booking prefill) |

---

## Part D — Coverage of all 50 findings

**Key:**
- **Q** = linked questions.
- **Fix** = can be fixed without asking (Part B).
- **V** = technical check needed (Part C).

Because the code hasn't changed since the audit, nothing is "already fixed". Where the audit overstated a finding, or describes intentional behavior, the Notes column says so.

| Finding | Q | Fix | V | Notes |
|---|---|---|---|---|
| AUDIT-001 | — | Yes | V-012 | Low. No current data loss found (pass 2). Overlaps AUDIT-009 (creation date). |
| AUDIT-002 | Q-039(b) | Yes | V-001, V-011 | The type mismatch is confirmed. What is actually stored is unverified. |
| AUDIT-003 | Q-039(a) | Yes | V-009 | Affects Master-imported records only (pass 2). The Edit-tab value is always the newer one, so no business choice is needed. |
| AUDIT-004 | Q-039(f) | Yes | V-014 | Overlaps AUDIT-044 and AUDIT-008. Needs a specific sequence of steps to happen. |
| AUDIT-005 | Q-039(c) | Yes | — | Fixed together with AUDIT-007 and AUDIT-031. |
| AUDIT-006 | Q-001, Q-002 | Dialog text only | — | Highest-impact business question. |
| AUDIT-007 | Q-024, Q-039(d) | After Q-024 | — | Linked to AUDIT-006 (re-import resets the lodging label). |
| AUDIT-008 | Q-039(f) | Yes | V-003, V-014 | Overlaps AUDIT-004. |
| AUDIT-009 | Q-012, Q-013, Q-014 | After Q-012 | V-001, V-008, V-013, V-015 | The broken-links consequence is documented in the README but not tested. The README already says not to use Replace on production. |
| AUDIT-010 | Q-012, Q-013, Q-014 | After Q-012/013 | V-002, V-013, V-015 | Severity depends on V-002. Possible, not confirmed. |
| AUDIT-011 | Q-011 | Yes | — | Narrowed in pass 2: the waitlist flag is saved correctly; only column placement is wrong. |
| AUDIT-012 | — | Yes | — | |
| AUDIT-013 | Q-032, Q-039(e) | After Q-032 | V-016 | The date shift is inferred from code and not yet observed. Q-032 asks you to confirm it. |
| AUDIT-014 | Q-034 | After Q-034 | — | May be intended as a contact list; Q-034 asks. |
| AUDIT-015 | Q-027 | After Q-027 | — | |
| AUDIT-016 | Q-021 | After Q-021 | — | Overlaps AUDIT-043 and AUDIT-017. Showing cancelled groups' tasks may be acceptable; the permanent "Overdue" is the real defect. |
| AUDIT-017 | Q-019, Q-020 | After Q-020 | — | Also affects backups (Q-013 D). |
| AUDIT-018 | Q-029 | After Q-029 | — | |
| AUDIT-019 | — | Yes | — | Overlaps AUDIT-011 (same disposition text). |
| AUDIT-020 | Q-004, Q-005 | Badges only | — | Partly intentional: a calendar may show cancelled groups if they are marked. The contradiction is in the availability counts. Depends on AUDIT-034. |
| AUDIT-021 | — | — | V-002, V-004, V-021 | A documentation and schema gap, not a runtime defect. You export the schema; I document it. |
| AUDIT-022 | — | Yes | V-007 | Unverified whether the production build is affected. |
| AUDIT-023 | Q-023 | Partly | V-003 | |
| AUDIT-024 | Q-033 | After Q-033 | — | Time-sensitive. |
| AUDIT-025 | Q-035 | After Q-035 | — | The importer is hidden. No current impact unless re-enabled. |
| AUDIT-026 | — | Yes | — | |
| AUDIT-027 | — | Yes (code) | V-005 | Suspected only. It may already work if the hosting library adds cross-origin handling. |
| AUDIT-028 | — | — | V-022, V-008 | A coverage limit (external apps), not a defect by itself. |
| AUDIT-029 | Q-015, Q-016 | After Q-015 | — | A product decision. The separate tracking may have been intentional. |
| AUDIT-030 | Q-008 | Dedupe part | — | A labeled all-status total could be legitimate (pass 2). Overlaps AUDIT-046 and AUDIT-047. |
| AUDIT-031 | Q-025 (optional) | Yes | — | Overstated: the capacities agree in both places they appear. The real differences are building lists, spellings, Camping and the unused Rustic Cottages. |
| AUDIT-032 | Q-010, Q-039(g) | After Q-010 | V-010 | |
| AUDIT-033 | Q-035 (archive part) | Yes | — | Cleanup only. |
| AUDIT-034 | Q-004, Q-005, Q-007, Q-008, Q-021 | Shared helper after those | — | Different screens may legitimately include different records. The fix is one shared classification that each screen filters on deliberately. |
| AUDIT-035 | Q-028 | After Q-028 | — | Partly intentional (code comment). Stale only after edits. |
| AUDIT-036 | Q-031 | After Q-031 | — | Overlaps AUDIT-042 (taxonomy). |
| AUDIT-037 | Q-006 | After Q-006 | — | A business convention, not a confirmed defect. |
| AUDIT-038 | Q-017 | After Q-017 | V-008 | Linked to AUDIT-009 (link codes in file paths). |
| AUDIT-039 | Q-036 | After Q-036 | — | The two-table design may be intentional. |
| AUDIT-040 | Q-037 | After Q-037 | — | |
| AUDIT-041 | — | Yes (last) | — | Docs only. Done after the related code fixes. |
| AUDIT-042 | Q-030 | After Q-030 | — | Overlaps AUDIT-036. |
| AUDIT-043 | Q-022 | After Q-022 | — | Overlaps AUDIT-016. |
| AUDIT-044 | Q-040 | Yes | V-019 | Overlaps AUDIT-004. |
| AUDIT-045 | Q-003 | Checklists part | V-017 | Confirmed code pattern. How often it happens is unknown. |
| AUDIT-046 | Q-009 | After Q-009 | — | |
| AUDIT-047 | Q-026 | After Q-026 | V-020 | |
| AUDIT-048 | — | Yes | — | |
| AUDIT-049 | Q-038 | Grouping part | — | |
| AUDIT-050 | Q-018 (optional) | Client check | V-018 | |

**Groups of findings that should be fixed together:**
- Guest-inquiry conversion: 004, 008, 044.
- Backup and portal links: 001, 009, 010, 038.
- Status classification: 034, with 011, 019, 020, 030 and 032 depending on it.
- Lodging: 005, 007, 031.
- Staff and jobs: 016, 017, 043.
- Reporting: 030, 046, 047, 015, 035.
- Taxonomy: 036, 042.
- External gaps: 021, 027, 028.

**Findings that may describe intentional behavior:**
- 014: possibly meant as a contact list.
- 020: showing cancelled groups on a calendar.
- 029: separate tracking.
- 035: the imported Camper Days total is deliberately kept.
- 037: departure-day convention.
- 039: the two-table design.

Section 5 of the audit lists a further 23 behaviors that were checked and judged intentional or harmless. They are not findings and need no answer.
