# Reports Page Improvement Proposal

**Status:** Approved November 5, 2026, and Phase 1 built with the recommended decisions. Decisions 3 and 5 still need the checks noted in section G. Decision 10 was not part of this work. The original page stays available through the Layout toggle.
**Date:** November 5, 2026, at commit `c2446fe`.
**Preview:** [reports-preview.html](reports-preview.html). It runs on invented data and is separate from the app.

## How this was checked

- I read the Reports page, its rules, the importers, the lodging, portal, inquiry, contact and jobs code, the audit decisions, and the existing tests. `npm test` passes 181 of 181.
- I ran the real Reports page locally against a mock of Supabase holding 18 fictional records built to test each suspicion. I tried filters, hover, CSV export, loading, a failed load, phone width and Night.
- **I did not read live data.** Real completeness is unknown, so every readiness rating below comes from code and needs the read-only check in Appendix A.
- Findings are marked **Ran** (reproduced on the real page) or **Read** (traced in the code, not run).

---

## A. Current assessment

### What the page does well

- Inclusion rules are stated on screen and in the CSV, and they are shared in `reportRules.js`.
- Converted inquiries count once, and retreat types map to the official list without guessing.
- Camper Days reports its coverage: stored, calculated and missing.
- Lodging uses the same reader as the Lodging Calendar, and unknown housing counts are shown as unknown.
- CSV output is rounded, lists its filters and neutralizes formula-like text.
- Night works throughout, and there is no sideways scrolling at 390px.

### Where it falls short

The page describes the past in aggregate. It rarely helps anyone decide what to do next.

| Question | Today |
|---|---|
| Does it reach a conclusion? | No. It shows 7 cards and 7 large panels, and the reader has to find the meaning. The page is 4,058px tall with 13 records, and about 9,000px at phone width. |
| Can a number be investigated? | No. The page has no links to records. Its only buttons are Export CSV and Reset. |
| Can periods be compared? | No. There is no comparison, and last year needs a custom date range. |
| Does it look ahead? | Barely. "Next Month" and "Next Year" exist, but nothing shows gaps, preparation or upcoming risk. |
| Can it be trusted at a glance? | Not yet. See the defects in section E. |

### Numbers that are hard to interpret

- **Total Bookings** includes inquiries, cancelled, waitlisted and archived records.
- **Total Guests** adds in groups who are not coming. In the test records, 110 of 287 guests were cancelled or waitlisted.
- **Total Nights** adds stay lengths across groups. Overlapping stays both count, so it is neither calendar nights nor guest-nights.
- **Meal Services** counts meals per group and ignores group size, so it says little about kitchen load.
- **Status Breakdown** says "current workflow status", but progress now lives in the portal (Q-007).
- **Lodging "Bookings Using"** counts bookings, not nights, so a one-night stay equals a week-long one.

### Visuals that add little

- The retreat type pie sits above a table holding the same numbers, and close values can't be compared in a pie.
- Bar rows are used for almost everything, including one-value and four-value lists, so nothing stands out.
- The Camper Days explainer takes about a third of the panel on every visit, although staff need it rarely.
- Status appears twice, as cards and as a panel.
- Bookings and Guests by Month sit in separate lists, so the months can't be read across.

### Duplication elsewhere

- The Dashboard home covers today, the next 7 days and the configurable summary period.
- The Lodging Calendar covers one week or month in operational detail.
- Portal Admin covers each group's checklist.

Reports should not repeat those. Its distinct job is the long view: patterns across a season, comparison between periods, and whether the records can be trusted.

### Questions staff cannot answer today

- Which weekends can still take a group of 60?
- Which buildings sit empty, and when?
- Are we ahead of or behind last year on the same dates?
- Which upcoming groups have no building or guest count?
- Which groups come back, and how has their attendance changed?
- How many inquiries are coming in, and what happened to them?

---

## B. Recommended concept

**Replace the long page with three focused views that share one set of controls, and make every number open the records behind it.**

| View | Question it answers | Main reader |
|---|---|---|
| **Season Brief** | How is the season going, and what stands out? | Leadership, staff meetings |
| **Season Map** | Where are the buildings in use, and where could a group still fit? | Booking administrator, operations |
| **Data Check** | Which records need fixing, starting with what's coming soonest? | Booking administrator |

This suits a retreat center for three reasons:

1. **The product is buildings across dates.** A building-by-date map shows busy periods, gaps and underused spaces in one picture, which no bar chart can do.
2. **The year is strongly seasonal.** "Up 12%" means little across a partial year, so comparisons use the same dates in both years.
3. **The data came from spreadsheets and is uneven.** Data Check turns that into a short work list and keeps every total honest about what it can't know.

Observations are plain sentences produced by fixed rules, each with its calculation and its records one click away. This needs no AI and no paid service, and staff can trust it because they can check it.

### Alternatives considered

| Option | Benefit | Cost | Verdict |
|---|---|---|---|
| **Three views (recommended)** | Short first view, and each view has one clear job | Staff learn three tabs | Best fit |
| One shorter page, fixes and drill-down only | About half the work, no new layout to learn | Still a report to read through, with no gap finding | Reasonable if budget is tight. Phase 1A alone delivers this. |
| Separate views per role | Tailored | Multiplies screens for a small office that shares one login | Rejected |

---

## C. Prioritized improvements

Readiness: **Now** = available now. **Qualified** = useful with limits shown. **New data** = needs a field or workflow change.

| # | Improvement | Staff question answered | Proposed experience | Data readiness | Value | Effort | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Correct and test the calculations | Can I trust this number? | One tested module, defects in section E fixed | Now | High | Medium | Phase 1A |
| 2 | Honest loading, failure and filter states | Is this zero real? | No figures until data arrives, with a clear failure message and visible filters | Now | High | Small | Phase 1A |
| 3 | Counting choice | Who is actually coming? | Default "Stays only", one switch to "All records" | Now | High | Small | Phase 1A |
| 4 | Records drawer | Which bookings are behind this? | Any number opens its records, and Back returns to the same place | Now | High | Medium | Phase 1A |
| 5 | Same-dates comparison | Are we ahead of last year? | This year to date against the same dates last year | Qualified | High | Medium | Phase 1B |
| 6 | Season Map | Where are we busy or empty? | Building by week or night, every cell opens its stays | Qualified | High | Medium | Phase 1B |
| 7 | Open weekends | Where could a group of 60 fit? | Ranked weekends by group size | Qualified | High | Small | Phase 1B |
| 8 | What Stands Out | What should I notice? | Up to four rule-based sentences with calculations and records | Qualified | High | Small | Phase 1B |
| 9 | Data Check | What should I fix first? | Work list sorted by arrival, linked to records | Now | High | Medium | Phase 1B |
| 10 | Meeting brief and per-view CSV | What do I bring to the meeting? | One printed page, and exports that match the view | Now | Medium | Small | Phase 1B, first to cut |
| 11 | Preparation view | Which arrivals still need something? | Next 60 to 90 days by arrival, with portal, housing, meal and staffing gaps | Qualified | High | Medium | Phase 2 |
| 12 | Returning groups | Who comes back, and how has attendance changed? | History per group across years | Qualified | High | Medium | Phase 2 |
| 13 | Inquiry demand | How many inquiries arrive, and what became of them? | By month received, with today's outcome | Qualified | Medium | Medium | Phase 2 |
| 14 | Meal and activity outlook | What should the kitchen and program staff expect? | Week-by-week meals and activities ahead | Qualified | Medium | Medium | Phase 2 |
| 15 | Cancellation insight | Why do groups cancel, and do we refill? | Reasons, notice period, vacancy filled | Qualified | Medium | Small | Phase 2 |
| 16 | Closed dates list | Is this gap really bookable? | Staff enter closures a few times a year | New data | Medium | Small | Phase 2 |

### Keep, replace, combine, remove

| Current element | Action | Reason |
|---|---|---|
| Inclusion statement | **Keep**, shorter | Sits beside the Counting control and changes with it |
| Camper Days total, coverage and formula | **Keep**, explainer moves into a disclosure | The established usage measure |
| CSV with its filters section | **Keep**, per view | Already careful |
| Retreat type table | **Keep**, adding camper days and last year | Better than the pie |
| 7 summary cards | **Replace** with 4 figures | Stays, Guests, Camper Days, Building-nights, each with context |
| Retreat type pie | **Remove** | Repeats the table |
| Hover month breakdown | **Replace** with the drawer | Can't be reached by mouse, keyboard or touch |
| Lodging Usage table | **Replace** with Season Map | Nights tell more than booking counts |
| Data Quality Report | **Replace** with Data Check | Counts become a linked work list |
| Monthly Trends and Camper Days by Month | **Combine** into Month by Month | One table with a measure switch |
| Camper Days by Retreat Type and Retreat Breakdown | **Combine** into Who Came | Same grouping shown twice |
| Status Breakdown | **Remove**, available in All records | Repeats the labels and no longer means workflow |
| Input Source Breakdown and filter | **Remove** from the main view, keep in the CSV | Describes data entry, which belongs in Data Check if anywhere |
| Deposit lines and the deposit quality row | **Remove** | Q-026 says this column doesn't matter, and Q-027 removed money reporting |
| Total Nights and Meal Services | **Remove** | Replaced by Building-nights, and by the outlook in Phase 2 |

---

## D. Detailed behavior

### Shared controls

**First view.** Reports opens on Season Brief for the current calendar year, Stays only, comparison on. A saved filter is always visible. If a saved value no longer exists, it is cleared with a message saying so.

| Control | Options |
|---|---|
| Period | Calendar year (default), Summer, Fall, Last year, Custom |
| Counting | Stays only (default), All records |
| Retreat type | All, or one official type |
| Compare | Same dates last year, on by default |

**Hierarchy.** Observations come first, then four figures, then Month by Month and Who Came.

**Returning from a booking.** The booking opens with the existing `openBookingDetail(booking, "Reports")`. Back uses `closeBookingDetail`. Reports stays mounted behind it using the same keep-alive model as the calendars, so the tab, filters, scroll position and open drawer survive.

**Themes.** New colors use `var(--n-token, lightValue)` per `docs/THEMING.md`. State always has a text or symbol as well as color. Printing is always Light.

**Smaller screens.** Controls stack, figures go to two columns, and the drawer fills the screen. The map scrolls inside its own panel with the building names pinned, and the Open Weekends list sits under it.

### Definitions

| Term | Rule |
|---|---|
| **Stay** | A record whose display state is `booked` or `archive` (subject to decision 3) |
| **All records** | Today's Q-008 rule, unchanged, with each label shown separately |
| **Declined inquiry** | An inquiry with the Cancelled state. Shown apart from cancelled bookings. |
| **Group** | Not counted in Phase 1. Stays are counted, and a group coming twice is two stays. |
| **Guests** | Best known number for each stay: actual, then recorded, then estimated. A range counts as its lower number (Q-029). |
| **Unknown guests** | Blank, TBD, N/A or text with no number. Left out of totals and counted separately, never treated as zero. |
| **Camper Days** | Existing formula and Q-028 rule, extended by decision 5 |
| **Building-night** | One lodging calendar group held on one night. `getLodgingNights` applies, so the departure day is not a night. |
| **Period attribution** | Stays, guests and camper days belong to the arrival month (Q-009). The map counts actual nights. |

No percentage occupancy appears in Phase 1. Staff see "Bethel: 61 nights used". Percentages wait for a closed dates list and an agreed definition.

### 1. Season Brief

**Inputs:** shared controls, plus records from one pass of `fetchBookings` data.

**Comparison rules:**
- Figures compare this year to date with the same dates last year.
- Future stays are shown separately as "more scheduled". They are never mixed into the to-date figure and never called a forecast.
- Unfinished months are hatched and labeled "partial" or "scheduled".
- Last year is labeled final, and its stays are compared by their current records.
- If last year has no records for a period, comparison shows "No 2025 records for these dates", not a large increase.
- If the two years differ sharply in how many guest counts are known, the figure says so.

**Observation rules (Phase 1):**

| Rule | Appears when | Fictional example |
|---|---|---|
| Busiest finished month | At least one finished month | "August was the busiest month, with 1,104 camper days, up 640 on August 2025." |
| Largest retreat type shift | At least 4 stays across both years | "Family Reunion moved the most: 7 stays this period against 1 in 2025." |
| Open weekends | Comparison window has one | "8 weekends before the end of December still have room for 40 guests. The next is Nov 6." |
| First Data Check item | Any issue exists | "2 upcoming stays with no building." |

Each sentence has a link to its records and a "How this is worked out" disclosure. A rule that can't meet its minimum stays silent.

**Empty and incomplete states:**
- Under 80% guest coverage, a banner explains the limit, and Guests reads "Guests, at least".
- Nothing matching shows a message with Clear filter.

**What staff learn:** in the example, leadership sees that summer ran ahead of last year and that the fall still has room, then opens the 12 August stays to see which groups drove it.

### 2. Season Map

**Inputs:** Year or Month zoom, retreat type, and group size for Open Weekends.

**Records:** `countsForLodgingOccupancy` (Q-004), the same rule as the Lodging Calendar, so the two never disagree. The Counting control does not change the map, and the screen says so.

**Building rows:** the seven `LODGING_CALENDAR_GROUPS`, plus **No building recorded**. That last row matters: if a stay has no building, an open cell on those dates may not really be free.

**Cells:**
- Year view: one cell per building per week, in four shades of nights used.
- Month view: one cell per night, showing Open, Booked or W (waitlist), with Friday and Saturday marked. A "!" marks stays that need a building.
- Hovering or focusing a cell shows a label. Selecting it opens the drawer.

**Open Weekends:**
- Considers Friday and Saturday nights from today forward, over a set horizon.
- Counts only buildings with no stay at all. Space inside a shared building is ignored, which is deliberately cautious.
- Adds upper capacities using `getLodgingCapacityLimit`. Hebron is 14 + 52 = 66. Camping has no capacity and is left out.
- Notes when a stay on those dates has no building.

**Fictional example:** a caller asks about a group of 60 in December. The administrator picks 60, sees Dec 4 to 6 lists Bethel, Hebron, Dothan, Ajalon and the Guest House, and checks the Lodging Calendar before offering it.

**Limitations:** there are no closure dates yet, so open does not always mean bookable. Imported text can name a building without a count. Room-level detail stays in the Lodging Calendar.

### 3. Data Check

**Inputs:** booked stays in the selected year, plus undated inquiries. It ignores the Counting control.

| Check | Fields | Why it matters |
|---|---|---|
| Upcoming stay with no building | `getBookingLodgingAssignments` | Map may show false gaps |
| Upcoming stay with no usable guest count | Guest reader, returning Unknown | Meals and totals lack a number |
| Finished stay still on an estimate | Guest source | Comparison is softer |
| Finished stay with no usable guest count | Guest reader | Left out of totals |
| Dates present, nights missing | `startDate`, `endDate`, `nights` | Camper days can't be calculated |
| Importer warning unresolved | `rentalFormDetails.importWarnings` | Prose guest counts need a person to read them |
| Retreat type not mapped | `getOfficialRetreatType` | Weakens the Who Came table |
| Inquiry with no stay date | `startDate`, `desiredDatesText` | Missing from every dated period |

**Behavior:**
- Upcoming issues come first, soonest arrival at the top.
- Each row opens the record, and Back returns to the same list.
- The summary reads "44 of 64 stays in 2026 are complete".
- Cancelled stays, hosts and archive rows are not flagged for housing, which removes today's noise.
- With nothing to fix, it says so and states what was checked.

**Limitation:** there is no "ignore this one" in Phase 1. If some items can never be filled in, the list will not reach zero. A dismiss option can follow if it proves necessary.

### 4. Records drawer

- Opens from figures, observations, table rows, map cells and Data Check.
- Lists exactly the records in the number, with the same counting rules, plus a short description of what is included.
- Shows date, nights, guest count with its source, and state.
- **Open** uses the booking or inquiry detail page, whichever matches the record.
- **Export these rows** downloads the list.
- Escape closes it, and focus returns to the control that opened it.
- A test asserts that the drawer's row count matches the number that opened it.

### 5. Print and export

- **Meeting brief:** one letter page with figures, observations and next arrivals, plus period, counting rule and date. Built from `@media print`, with no new dependency.
- **CSV:** each view exports what it shows, and keeps the existing "Filters Used" section and formula protection. No guest contact details are included in the brief.

### 6. States

| State | Behavior |
|---|---|
| Loading | Placeholders and "Loading bookings". No zeros. |
| Failed | "Reports could not load", no figures, Try Again |
| Refresh failed with older data on screen | Figures stay, with "Last loaded at 2:14 PM. Refresh failed." |
| No records in the system | A short explanation, without the charts |
| Nothing matches | Names the active filters, with Clear filter |
| Partial data | Figures read "at least", with counts of what is unknown |

---

## Data feasibility

| Proposal | Rating | Fields and services | Limit to show |
|---|---|---|---|
| Stays, classification | Available now | `getBookingDisplayState`, `getReportBookings` | Archive overlap unverified (decision 3) |
| Guests | Qualified | `rentalFormDetails.actual*`, `approx*`, `importedGuestCountKind`, `attendeeCount` | Source and unknown count always shown |
| Camper Days | Qualified | `camperDays`, `nights`, `mealCount`, `mealSchedule`, day camper fields | Stored and calculated values are mixed |
| Season Map | Qualified | `getLodgingNights`, `getBookingLodgingAssignments`, `countsForLodgingOccupancy` | Unassigned stays, no closures |
| Open Weekends | Qualified | `LODGING_BUILDINGS`, `getLodgingCapacityLimit` | Capacities are recorded maximums, Camping has none |
| Year comparison | Qualified | `startDate`, year sources `Master 20xx` | Current state of last year's records, not what was known then |
| Data Check | Available now | Existing readers, `importWarnings` | None significant |
| Preparation | Qualified | `portal_checklist_items` (`status`, `due_date`, `required`), `getPortalProgress`, `getAllBookingJobs` | "No portal yet" is not "complete" |
| Returning groups | Qualified | `returningStatus`, `archiveVisitCount`, `archiveAllPriorVisitDates`, organization and contact identity | No group ID, so names need review. Contacts groups people, not groups. |
| Inquiry demand | Qualified | `getBookingInquiryDateValue`, `submittedAt`, `inquiryDisposition`, `guest_inquiries.status`, `reviewed_at`, `converted_booking_id` | Sheet inquiries have no stage dates. Master bookings often have no link to their inquiry. |
| Meal outlook | Qualified | `mealSchedule`, `numberOfMeals`, `foodAllergies` | Some imports have totals only. Meal text parsing varies. |
| Activity outlook | Qualified | `rentalFormDetails.activities`, `activities` text | Imports hold free text, so only structured rows can be scheduled |
| Cancellation insight | Qualified | `dateOfCancellation`, `reasonForCancellation`, `vacancyFilled` | Free text and import-era only. The app has no required reason. |
| Closed dates | New data | Small list, about 5 minutes a year | New table or settings row |
| Comparing bookings "as of this date last year" | New data | Master `submittedAt` and `createdAt` hold the import time | Needs periodic snapshots. Deferred. |

**Forbidden conclusions:**
- **Revenue:** stays out (Q-027). Payment notes are not revenue.
- **Occupancy %:** no denominator yet. Capacities are ranges and many housing counts are missing.
- **Conversion rate:** only "outcome today" can be reported. Stage timing is not recorded for sheet inquiries, so no funnel is drawn.
- **Forecast:** scheduled stays are shown as scheduled. No predictions.
- **Trends:** partial periods are labeled and years with thin data say so.

---

## E. Data and correctness findings

### Confirmed defects

| ID | Evidence | Defect | Practical consequence | Where |
|---|---|---|---|---|
| R-01 | Ran | **A failed load looks like an empty report.** Loading and failure both show zeros, and panels say no bookings matched the filters. | After dismissing the alert, staff can read "0 bookings" as fact. | `Dashboard.jsx:8021`, `Dashboard.jsx:10304` (loading state not passed in) |
| R-02 | Ran | **A saved filter can hide everything while the dropdown says "All".** A saved value no longer in the list shows "All Retreat Types", while the report shows 0. | Empty report with no visible cause, and it persists across visits. | `getSavedReportsViewSettings`, `ReportsView.jsx:128` |
| R-03 | Ran | **Missing Dates is always 0 in a dated range.** Undated records are removed before the check runs. The test showed 0 for This Year and 2 for All Time. | The default view reports no problem while the problem exists. | `ReportsView.jsx:1403` |
| R-04 | Ran + Read | **Sheet inquiries are missing from every dated report.** The importer leaves their stay date blank on purpose, yet the page says inquiries are included. | The Inquiry label is close to empty in normal use, and All Time totals jump. | `Dashboard.jsx:2475`, `REPORT_INCLUSION_TEXT` |
| R-05 | Read | **Open and declined website inquiries are never in Reports.** They live in `guest_inquiries`, and only converted ones reach `bookings`. | Website demand is understated, against the page's own wording. | `guestInquiryService.js`, `ReportsView` props |
| R-06 | Ran | **Stored Camper Days ignore actual attendance.** A group with 100 expected and 20 actual kept 180 camper days, shown beside "20 overnight guests". | Usage overstated, and the group ranked as the largest retreat. | `CAMPER_DAY_INPUT_FIELDS`, `reportRules.js:83` |
| R-07 | Ran | **Non-numeric guest text counts as zero, not missing.** "TBD" adds 0 and isn't in Missing Guest Count. | Missing data looks complete, against "unknown is not zero". | `getReportsGuestCountDetails`, `ReportsView.jsx:313` |
| R-08 | Read | **Mixed guest text keeps only its first number.** "12 adults, 40 students" is stored as 12 and reported as 12. The importer's warning never reaches Reports. | Guests and camper days understated for those groups. | `Dashboard.jsx:1797`, `1870`, `importWarnings` |
| R-09 | Ran | **"Using actual attendance" is misleading.** Any actual field counts as complete, while Master rows tagged `recorded` are labeled Estimated. | The count of trustworthy figures is wrong in both directions. | `ReportsView.jsx:248`, `importedGuestCountKind` unused |
| R-10 | Read | **Declined inquiries appear as Cancelled.** The importer marks "No" and "never heard back" as Cancelled, and Reports treats them like cancelled bookings. | All Time cancellation counts and guest totals are inflated by groups that never booked. | `getGuestGroupInquiryStatus`, `Dashboard.jsx:2325` |
| R-11 | Read | **Inquiries staff deleted still count.** The Inquiry Spreadsheet hides them through `inquiry_hidden`, but Reports doesn't read that list. | All Time totals can include rows staff removed. | `InquirySpreadsheetView.jsx:341`, `ReportsView` |
| R-12 | Ran | **The month breakdown can't be used.** It clears when the mouse moves toward it, doesn't work by keyboard or touch, and lists only the top 5. | Staff see it flicker and can't act on it. | `ReportBarRow`, `ReportsView.jsx:687` |
| R-13 | Ran | **Duplicate React keys.** Two stays by one group in a month log a console error and can render incorrectly. | Same group can appear wrongly in the breakdown. | `ReportsView.jsx:1967` |
| R-14 | Ran | **Lodging Usage disagrees with the Lodging Calendar.** A cancelled group counted toward Bethel (2 bookings, 120 guests). | Building use overstated. It follows Q-008 but conflicts with Q-004. | `housingUsageRows`, `ReportsView.jsx:1332` |
| R-15 | Ran | **Data Quality is noisy.** Missing Housing flagged 85% and Missing Deposit Status 77%, including cancelled and archived stays and a field that no longer matters. | Real problems are buried. | `ReportsView.jsx:1429`, `1442` |
| R-16 | Read | **The tested date function is not the one in use.** `bookingArrivesInRange` has tests, but the page uses its own untested copy. No guest or camper day calculation has a test. | Tests pass while the page's real logic is unchecked. | `reportRules.js:67`, `ReportsView.jsx:215` |
| R-17 | Read | **Retreat colors mostly don't apply.** The color map uses old names, so official types fall through to a rotating list and colors shift with rank. | The same type can change color between reports. Removing the pie resolves this. | `REPORTS_RETREAT_TYPE_COLORS` |
| R-18 | Read | **The header note counts hosts and converted inquiries across all time** while the report shows one period. | Small mismatch, easy to misread. | `ReportsView.jsx:1579` |
| R-19 | Read | **Dead code.** `averageCamperDaysPerGuest` and `camperDaysBreakdownRows` are calculated and never shown. | Cleanup only. | `ReportsView.jsx:1049`, `1053` |

**Related, outside Reports:** `getDashboardHomeGuestCount` (`Dashboard.jsx:7553`) returns 0 for "40-50", confirmed by running a copy of its logic. AUDIT-018 is marked Verified, so that fix did not reach this function. Dashboard "guests on site" understates those days and can disagree with Reports.

### Ambiguous, needing your decision

| ID | Issue | Decision |
|---|---|---|
| D-01 | Q-008 counts cancelled and waitlisted groups in guest totals. This was your decision, so it is not a bug, but it produces numbers that don't describe who came. | 2 |
| D-02 | Archive records may repeat visits also held as Master rows. | 3 |
| D-03 | Any filled actual field is treated as a complete count, even if only adults were recorded. | 4 |
| D-04 | Stored Camper Days skip day campers added later (ran: 50 day campers shown, 0 days added). The sheet's own figure may already include them, so simply adding could double count. | 5 |
| D-05 | Edits through the Create Booking edit form don't record `staffEditedFields`, so those edits may not trigger Q-028 recalculation. Read, not run. I'd confirm it during Phase 1A. | Routine |
| D-06 | Linked inquiries rely on `sourceInquiryId`. A Master row for the same group has no link, so All Time may count both. | Report only, no automatic match |

### Assumptions to confirm

- Capacities in `lodgingConstants.js` remain correct (confirmed in Q-025).
- Hebron's two parts can be added for Open Weekends.
- Friday and Saturday are the right definition of a weekend stay.
- Which years of Master sheets are loaded. The importer supports several, but the live data decides what comparisons exist.

---

## F. Delivery phases

### Phase 1A: Make the numbers trustworthy

Shippable alone, and it keeps the current layout.

1. Move guest, nights, meals and camper day logic into a tested `reportMetrics.js`.
2. Fix R-01 through R-11 and R-14 through R-19, following your decisions.
3. Add the Counting control.
4. Add the records drawer and Back behavior, replacing the hover breakdown.

### Phase 1B: The new experience

1. Three tabs and the shared controls.
2. Season Brief with same-dates comparison and observations.
3. Season Map and Open Weekends.
4. Data Check.
5. Meeting brief and per-view CSV. This is the first item to cut if time runs short.

### Phase 2: Worthwhile next steps

Preparation view, returning groups, inquiry demand, meal and activity outlook, cancellation insight, and closed dates. I'd start with Preparation, because it gives operations staff the most. It needs a portal data fetch and care not to repeat Portal Admin or the Dashboard's Action Center.

### Deferred or rejected

| Idea | Decision | Reason |
|---|---|---|
| Revenue reporting | Rejected for now | Q-027, and no reliable source |
| Occupancy percentage | Deferred | Needs closed dates and an agreed definition |
| "Same point last year" comparison | Deferred | Needs snapshots. Backups could supply these later without new collection. |
| Forecasts | Rejected | Too little history, and scheduled stays already answer the need |
| AI-written summaries | Rejected | Fixed rules are cheaper and easier to trust |
| Inquiry funnel with stage durations | Rejected | The dates aren't recorded |
| Per-person saved reports | Deferred | Staff share one login |
| Splitting nights across months in totals | Rejected | Q-009 chose arrival month, and the map already shows nights |
| Reporting on `ethnicBreakdown` | Rejected unless you ask | Sensitive field and no staff decision needs it |

---

## G. Approval decisions

**Your choices**

1. **Direction:** approve the three-view design, delivered as Phase 1A then 1B? *Recommend yes.*
2. **Default counting (changes Q-008):** default to Stays only, with All records one switch away? *Recommend yes. Q-008's rule stays available and unchanged.*
3. **Archived visits:** count them as Stays? *Recommend yes, once Appendix A shows they don't repeat Master rows.*
4. **Partial actuals:** when actual age counts don't add up to a recorded total, use the recorded total and flag the record? *Recommend yes.*
5. **Camper Days (extends Q-028):** recalculate when actual attendance is entered? And does the sheet's Camper Days figure already include day campers? *Recommend recalculating. The day camper question needs an answer from the office.*
6. **Map counts nights:** keep arrival month for totals while the map counts actual nights? *Recommend yes. It doesn't alter Q-009.*
7. **Removals:** drop the deposit lines, Status panel, Source filter, pie, Total Nights and Meal Services? *Recommend yes. Source stays in the CSV.*
8. **Season definition:** use the calendar year as the default period? *Recommend yes, matching the yearly Master sheets.*
9. **Read-only check:** run the Appendix A queries in the Supabase SQL editor and share the results? *Needed before 1B, because they show how much history comparison can use.*
10. **Dashboard guest count:** fix `getDashboardHomeGuestCount` as a separate small change? *Recommend yes, before Phase 1.*

**Routine details I'll handle after approval**

Component structure, exact wording, cell sizes and shades, observation thresholds, drawer limits, CSV column order, test layout, the settings migration, and confirming D-05.

---

## H. Implementation and verification outline

### Likely files

| File | Change |
|---|---|
| `src/utils/reportMetrics.js` (new) | Pure calculations and one normalized row per booking |
| `src/utils/reportRules.js` | Counting rules, use or remove `bookingArrivesInRange` |
| `src/pages/ReportsView.jsx` | Shrinks to the controls and view switching |
| `src/components/reports/` (new) | SeasonBrief, SeasonMap, DataCheck, ReportRecordsDrawer |
| `src/styles/ReportsView.css` | Rewritten with theme tokens, adds print rules |
| `src/styles/ReportsCamperDaysExplainer.css` | Removed, with its import in `App.jsx` |
| `src/pages/Dashboard.jsx` | Passes open handlers, loading and error state; keeps Reports mounted behind a detail page |
| `src/constants/dashboardConstants.js` | Settings defaults and period options, with validation of saved values |
| `src/services/inquiryHidden.js` | Reused to respect deleted inquiries |
| `tests/reports.test.js`, `tests/reportMetrics.test.js` (new) | See below |
| `tests/browser/` | One Reports script reusing the harness |
| `README.md` | Route description, which still mentions financial fields |

No new dependencies, tables or migrations in Phase 1. Closed dates in Phase 2 would need one small table, with SQL handed to you to run.

### Reuse

`getReportBookings`, `getBookingDisplayState`, `countsForLodgingOccupancy`, `getBookingLodgingAssignments`, `getLodgingNights`, `getLodgingCapacityLimit`, `LODGING_CALENDAR_GROUPS`, `getBookingOpenProps`, `openBookingDetail`, `openInquiryRecordDetail`, `closeBookingDetail`, `toCsv`, `getBookingInquiryDateValue`.

### Performance

- All bookings are already in memory, so Reports adds no Phase 1 query.
- Build one normalized row per booking in a single `useMemo`. Lodging text parsing runs once per booking, not once per cell.
- Build a `building|night` index once. Even 10,000 bookings gives under 100,000 entries, which is fast in a browser.
- The map renders about 430 cells in Year view and under 260 in Month. No virtual list is needed.
- Keep hover state inside the map so it doesn't recalculate the page, as today's hover does.
- Cap the drawer at a first page with "Show more". Portal data in Phase 2 loads only when that view opens.

### Tutorial Gnome

There is no Reports tutorial today, only two passing mentions in `tutorials.js`, which stay accurate. After Phase 1B I'd add a short topic covering the tabs, opening a number, and returning. Under the engine's rules, new targets need `data-tutorial-target`, opening records must use real clicks so the guard sees them, and the drawer should be handled as a transition.

### Checks

**Automated (`npm test`, baseline 181 passing):**
- Each defect in section E gets a test using fictional records.
- Month rows add up to totals.
- Drawer rows equal the number that opened them.
- All records reproduces the Q-008 totals.
- Season Map and the Lodging Calendar agree on who holds a building, including departure days and stays across year end.
- Same-dates comparison handles leap years and partial months.
- Unknown guests never add zero to an average.

**Browser (mock data only):**
- Every drill-down and Back at 1440px and 390px, in Light and Night.
- Loading, failed load, refresh failure, empty data and stale filter.
- Keyboard use on map cells, the drawer and the tabs.
- Print preview on one page, and no console errors.
- No write reaches the mock from Reports.

**Before release:** `npm run build` to a scratch folder, and lint with no new problems. `ReportsView.jsx` has 5 existing lint errors, which this work should remove. Then compare the new figures against the old page on real data, and explain each difference before you accept it.

---

## Appendix A: Read-only completeness check

Run in the Supabase SQL editor. These queries return counts only, with no guest details, and change nothing. I have not run them, because there is no local copy of the database.

```sql
-- 1. Completeness by arrival year and source
select
  coalesce(extract(year from start_date)::text, 'undated') as arrival_year,
  case
    when source_type ilike 'master%' then 'Master'
    when source_type ilike 'guest group%' then 'Guest Group sheet'
    when source_type ilike 'staff%' then 'Staff'
    when source_type ilike 'archive%' then 'Archive'
    else 'Other'
  end as source,
  count(*) as records,
  count(*) filter (where coalesce(attendee_count, '') !~ '\d') as no_usable_guest_count,
  count(*) filter (where coalesce(raw_data #>> '{rentalFormDetails,actualAdultGuests}', '') <> '') as has_actual_adults,
  count(*) filter (where coalesce(nights::text, '') = '') as no_nights,
  count(*) filter (where coalesce(meal_count::text, '') = '') as no_meal_count,
  count(*) filter (where coalesce(camper_days::text, '') <> '') as stored_camper_days,
  count(*) filter (where coalesce(buildings_rooms, '') = '' and raw_data #> '{rentalFormDetails,housingUsage}' is null) as no_lodging,
  count(*) filter (where coalesce(retreat_type, '') = '') as no_retreat_type,
  count(*) filter (where coalesce(returning_status, '') <> '') as has_returning_status,
  count(*) filter (where coalesce(raw_data #>> '{rentalFormDetails,inquiryDate}', '') <> '') as has_inquiry_date,
  count(*) filter (where coalesce(raw_data #>> '{rentalFormDetails,importWarnings}', '[]') not in ('[]', 'null', '')) as has_import_warnings
from public.bookings
group by 1, 2
order by 1, 2;

-- 2. Do archive rows repeat Master rows? (decision 3)
select count(*) as possible_repeats
from public.bookings a
join public.bookings m
  on a.start_date = m.start_date
 and lower(trim(a.organization_name)) = lower(trim(m.organization_name))
where a.source_type ilike 'archive%'
  and m.source_type ilike 'master%';

-- 3. Retreat type text not yet on the official list, with counts only
select retreat_type, count(*)
from public.bookings
where coalesce(retreat_type, '') <> ''
group by 1
order by 2 desc;

-- 4. Website inquiries by year and outcome
select extract(year from submitted_at) as year, status, count(*),
       count(converted_booking_id) as linked_to_booking
from public.guest_inquiries
group by 1, 2
order by 1, 2;
```

Query 3 shows group-type text, not names. Please check it before sharing in case someone typed a group name in that field.
