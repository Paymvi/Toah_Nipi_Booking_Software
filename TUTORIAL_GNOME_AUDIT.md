# Tutorial Gnome — Application & Tutorial Audit

Audit date: 2026-11-02 · Branch: `comparison/claude` · Scope: the whole staff booking application in this repository.

This document was written **before** any tutorial code. It records how the application actually works (from the code, not from feature names), lists every workflow that deserves a tutorial, picks the V1 library, and notes the technical constraints the tutorial system has to respect.

---

## 1. Application overview

Toah Nipi Booking Software is a **staff-only** React 19 single-page app (Vite 8, React Router 7, React Compiler) backed by Supabase (auth, Postgres, storage, one Edge Function).

| Concern | How it works today |
|---|---|
| Entry | `src/main.jsx` → `App.jsx` → `BrowserRouter` → `StaffAuthGate` → `Routes`. |
| Auth | `StaffAuthGate` shows `StaffLogin` until a Supabase session exists. Every route is behind it. |
| Shell | **Every route renders the same `Dashboard` component** (`src/pages/Dashboard.jsx`, ~9.6k lines). `Dashboard` derives `activeView` from `location.pathname` and renders one view in a long ternary chain. |
| Navigation | Sidebar buttons call `navigate(path)` (Main section) or `handleActiveViewChange(view)` (other sections). Sidebar sections are built in `Dashboard.jsx` (`reorganizedSidebarSections`) from `sidebarSections` in `constants/dashboardConstants.js`. |
| State | Plain React state in `Dashboard` (bookings list, selected booking, detail tab, form seed, Dev Mode, staff role). No global store. Views receive data and callbacks as props. |
| Views without URLs | **Booking Detail** and **Inquiry Record Detail** are pure state (`activeView` set directly, URL stays on the list page). They cannot be deep-linked. |
| Keep-alive | The Master Spreadsheet is mounted the first time it is opened and then only hidden (`aria-hidden`, CSS class) when another view is active. |
| Data | `services/bookingService.js` loads/saves the `bookings` table (camelCase ↔ snake_case mapping in `bookingMapping.js`, full object in `raw_data`). Saves are optimistic-concurrency checked (`updatedAt`, AUDIT-045). Other services: guest inquiries, portal corrections, staff directory, contact preferences, backups. |
| Roles | `current_staff_role` RPC → `admin` / `staff` / `viewer`. Viewers cannot save or import; only admins see Delete buttons. RLS in Supabase is the real boundary. |
| Dev Mode | Password-gated toggle in the top bar. Shows import menu, Delete All, Fill Test Data, the retired Inquiry Pipeline, and Full Replace restore. Resets on reload. |
| Styling | Global CSS files imported in a fixed order in `App.jsx`; class-name conventions per view (`booking-overview-*`, `contacts-view-*`, …); tokens on `:root` in `shared.css`; `html { font-size: 80% }` density system; no dark theme; no existing reduced-motion rules. |
| Responsive | ≤ 760 px: the sidebar becomes a static block **above** the content (not a drawer). ≤ 720 px: base font grows to 87.5% and inputs to 16 px on touch. |
| Tests | `node --test tests/**/*.test.js` — pure-logic unit tests (95 passing at audit time). No DOM test environment is installed. |
| Lint | `eslint .` — 77 pre-existing problems (mostly `react-hooks/set-state-in-effect`) at audit time. |

### Guest portal

The group-leader **guest portal is a separate application** (opened at `VITE_GUEST_PORTAL_BASE_URL/?portal=<token>`); it is not in this repository. What this repo contains is the staff side: **Portal Admin** (`/portal-admin`, sidebar "Portals"), where staff assign checklist tasks and documents, review guest submissions and copy/open the portal link. A tutorial titled "Guest Portal" therefore has to teach Portal Admin. The gnome can never appear in the guest portal because it is not part of that app.

---

## 2. Views and their functionality

### Sidebar → Main

| View | Route | What it does (from the code) |
|---|---|---|
| **Dashboard home** | `/dashboard` | Greeting, **New Booking** and **Open Calendar** buttons, four metrics (on site today, …), **Action Center** (items needing attention, each opens a filtered destination), **Upcoming Arrivals** (rows open the booking), **Today at Camp**, **Quick Actions**. |
| **Form** (Create Booking) | `/form` | `CreateBooking.jsx`: one long form — Guest Group (name\*, primary contact\*, retreat type\*, arrival/departure date\* and times), Guest Information (approximate guests — one of total/adult/child counts is required\*, actual guests), Booking Timeline, Payments & Documents, Meals, Activities, Facilities, Lodging & Linens, cancellation/waitlist classification, Additional Notes. **Save Guest Group** submits (validation list shown at the top on failure). Can be pre-filled from an inquiry (banner explains). The top bar is hidden on this view. Leaving the view unmounts the form and discards unsaved input. |
| **Portals** (Portal Admin) | `/portal-admin` | Summary cards (total / with checklists / needs review / complete), search + status filter, one card per group: assign checklist tasks and documents, upload a custom document, review guest submissions (approve / **Send back for changes** / reopen), change due dates, **Copy Link** / **Open Portal**, **Open Booking**. |
| **Guest Inquiries** | `/guest-inquiries` | Website inquiry submissions (`guest_inquiries`). Table → **Review** opens a detail panel (contact, stay & guests, meals, activities & linens, guest-reported documents, notes). Actions: **Open Prefilled Booking Form** (converts only after the booking is saved), **Decline Inquiry** (with a reason), **Mark converted to this booking**. |

### Sidebar → Calendar

| View | Route | What it does |
|---|---|---|
| **Main Calendar** | `/calendar` | Month / Week / Year switcher, « » month stepping and month/year dropdowns, **This Month / Today** button, "Also show" exception toggles (cancelled, waitlist, …), colour legend, agenda list for the visible period. Calendar events are display-only (no click-through). |
| **Lodging Calendar** | `/lodging-calendar` | Month/year calendar filtered by building toggles (with counts), **Generate Available Lodging Summary**, building detail panel. |

### Sidebar → Spreadsheet

| View | Route | What it does |
|---|---|---|
| **Master Spreadsheet** | `/master-spreadsheet` | "All Booking Data" grid: year toggle (All / 2025 / 2026 / 2027), building filter, date range, **Search Everything**, sortable headers, stars, configurable columns/presets in a settings modal, row preview popups. The **Organization** cell is a button that opens Booking Detail. |
| **Inquiry Spreadsheet** | `/inquiry-spreadsheet` | "Guest Group Inquiries & No's": year tabs, search, rows open **Inquiry Record Detail** (edit entry, notes, requested dates); per-row **start a booking from this inquiry** / open converted booking; trash can with Restore. |
| **Contacts** | `/contacts` | Contacts grouped across bookings (email/phone/name+org). Search, First/Last name sort, starred-first toggle, star, click-to-copy cells, **View Bookings** expands booking history with **Open Booking**, delete (hide) contact with a **Deleted (n)** panel to restore. Hidden contacts and stars are stored online when the tables exist. |

### Sidebar → Reporting / Other

| View | Route | What it does |
|---|---|---|
| **Reports** | `/reports` | Date-range and other filter selects (+ custom dates), **Export CSV**, **Reset**, sections: Status, Retreat Type, Input Source, Monthly Trends, Lodging Usage, Camper Days (with explainer), Data Quality Report. |
| **User Admin** | `/user-admin` | Shared staff directory: **Working as (this computer)** selector, add / edit / deactivate staff, copy a browser-only list to the shared directory. |
| **Jobs** | `/jobs` | Staff tasks aggregated from booking checklists, facilities rows and staff assignments; "my jobs" for the Working-as person; grouped by member; **Open Booking**; facilities rows can be completed here. |
| **Backup** | `/backup` | Backups & Restore: create a fresh JSON backup, guidance on keeping copies, choose a backup file, validation and comparison, **Safe Merge** restore, **Full Replace** (Dev Mode + admin only, takes a safety backup first, protects portal rows). |
| Inquiry Pipeline | `/inquiry-pipeline` | **Retired.** Removed from the sidebar; the route shows a "retired" notice unless Dev Mode is on. Not a tutorial candidate. |

### Booking Detail (state-only view, opened from spreadsheet, contacts, home, jobs, portals)

Header: **Back**, **Delete** (admins), **Date Display** settings modal, status pill. Tabs: **Overview**, **Edit** (internally `Details`), **Housing**, **Staff Assignments**, **Checklists**.

- **Overview**: identity column (initials avatar, source, group name, retreat type), stay dates and times, contact lines, Guests / Nights / Meals stats, **Edit Booking** button (jumps to the Edit tab), source sheet/row; main column: guest showcase, Booking Timeline, Payments & Documents, Lodging & Linens, Booking Status, Additional Notes, Archive Information, source data.
- **Edit**: two different editors depending on the record:
  - bookings created in the app ("Staff Booking") show the **full Create Booking form in edit mode** (always editable, **Save Changes**, no Cancel — leaving the tab discards edits);
  - imported/other records show **BookingDetailsEditForm**: read-only until **Edit Entry**, then **Cancel** / **Save Changes**.
- **Housing**: building/floor/room guest counts and linens; **Edit Housing** → Save/Cancel; becomes the authority for lodging once saved.
- **Staff Assignments**: role/person/notes rows (Add Assignment), feeds Jobs.
- **Checklists**: internal checklists with items assigned to staff, feeds Jobs.

### Top bar (every view except Form)

View title, **Dev Mode** switch (password dialog), **Export contact list** (.xlsx), **Refresh**; in Dev Mode: **Import** menu (Master 2025/2026/2027, Staff Contacts, Import Everything) and **Delete All**.

---

## 3. Tutorial inventory

Legend — Modes: **I** = interactive ("walk me through it"), **D** = demonstration ("show me"). Targets are the stable `data-tutorial-target` ids the tutorial would need (✅ = added in V1, others are future work).

### Getting Started

**GS-1 · Finding your way around** — Beginner · High · I + D
- Learn: what each sidebar section is for, the top bar, collapsing the sidebar.
- Steps: sidebar Main → Calendar → Spreadsheet → Reporting/Other → top bar Refresh/Export → collapse button.
- Targets: `nav-*` ✅, `topbar-actions`, `sidebar-collapse`.

**GS-2 · Reading the Dashboard home** — Beginner · High · D (I optional)
- Learn: metrics, Action Center items, Upcoming Arrivals, Today at Camp, Quick Actions.
- Steps: hero → metrics → Action Center row → Upcoming Arrivals row (opens a booking) → Quick Actions.
- Targets: `home-new-booking` ✅, `home-metrics`, `home-action-center`, `home-arrivals`, `home-quick-actions`.

**GS-3 · "Working as" — choosing who you are on this computer** — Beginner · Medium · I + D
- Learn: why Jobs and checklists use the Working-as person.
- Steps: User Admin → Working as select → Jobs shows "my jobs".
- Targets: `nav-user-admin` ✅, `user-admin-working-as`, `nav-jobs` ✅.

### Bookings

**B-1 · Create a booking** — Beginner · High · I + D — **V1 ✅**
- Learn: open the form, the required fields, what is optional, how saving works.
- Steps: Form in sidebar → Guest Group Name → Primary Contact → Retreat Type → Arrival date → Departure date → approximate guest count → Save Guest Group (explained; blocked during practice).
- Targets: `nav-form`, `booking-form-group-name`, `booking-form-contact`, `booking-form-retreat-type`, `booking-form-arrival`, `booking-form-departure`, `booking-form-guests`, `booking-form-save` ✅.
- Safety: interactive mode blocks the save button and form submission; demo mode never types — it shows labelled example values in the dialogue.

**B-2 · Find and open an existing booking** — Beginner · High · I + D — **V1 ✅ (combined with B-4)**
- Steps: Master Spreadsheet → Search Everything → click an organization name → Booking Detail opens → tabs explained → Back.
- Targets: `nav-master-spreadsheet`, `spreadsheet-search`, `spreadsheet-open-booking`, `booking-profile`, `booking-tabs`, `booking-back` ✅.

**B-3 · Edit a booking** — Intermediate · High · I + D — **V1 ✅**
- Steps: open a booking (skipped if one is open) → Edit tab → (imported records) Edit Entry → change a field → Save Changes / discard explained.
- Targets: `booking-tab-edit`, `booking-edit-panel`, `booking-edit-entry`, `booking-edit-ready`, `booking-edit-actions`, `booking-form-save` ✅.
- Must handle both editors (see §2). Saving is blocked during practice.

**B-4 · Reading the booking Overview tab** — Beginner · High · I + D — **V1 ✅ (second half of B-2)**
- Steps: open a booking → summary column → stats → main sections → Edit Booking shortcut.
- Targets: `booking-tab-overview`, `booking-overview-summary`, `booking-overview-stats`, `booking-overview-main`, `booking-overview-edit` ✅.

**B-5 · Set up housing for a booking** — Intermediate · High · I + D
- Steps: booking → Housing tab → Edit Housing → tick building → room/floor counts → linens → Save/Cancel; explains that the Housing tab then owns lodging (AUDIT-007).
- Targets: `booking-tab-housing`, `housing-edit`, `housing-building-*`, `housing-save`.

**B-6 · Assign staff to a booking** — Intermediate · Medium · I + D
- Steps: booking → Staff Assignments → Add Assignment → role/person → save → see it in Jobs.

**B-7 · Use booking checklists** — Intermediate · Medium · I + D
- Steps: booking → Checklists → Add Checklist → add item → assign person → tick done.

**B-8 · Cancel or waitlist a booking** — Intermediate · Medium · D (I with save blocked)
- Steps: Edit tab → classification select → explain effect on calendar/reports.

**B-9 · Delete a booking (admins)** — Advanced · Medium · **D only**
- Steps: explain Delete button, the confirmation, permanence, and the backup alternative. Never clicked by the tutorial.

**B-10 · Change how dates are displayed** — Beginner · Low · I + D (Date Display modal, browser-only preference).

### Calendar

**C-1 · Navigate the Calendar** — Beginner · High · I + D — **V1 ✅**
- Steps: Main Calendar → next month » → previous « → This Month → Week view → Year view → back to Month → "Also show" toggles → agenda.
- Targets: `nav-calendar`, `calendar-title`, `calendar-next`, `calendar-prev`, `calendar-today`, `calendar-views`, `calendar-view-week`, `calendar-view-year`, `calendar-view-month`, `calendar-exceptions`, `calendar-agenda` ✅.

**C-2 · Check lodging availability** — Intermediate · High · I + D
- Steps: Lodging Calendar → building toggles → month nav → Generate Available Lodging Summary → building panel.

### Spreadsheet

**S-1 · Use the Master Spreadsheet** — Intermediate · High · I + D
- Steps: year toggle → building filter → date range → search → sort by header → star a row → settings modal (columns, presets) → row preview.
- Targets: `spreadsheet-years`, `spreadsheet-filters`, `spreadsheet-search` ✅, `spreadsheet-settings`, `spreadsheet-table`.

**S-2 · Inquiry Spreadsheet basics** — Intermediate · Medium · I + D
- Steps: Inquiry Spreadsheet → year tab → search → open record → edit notes → back.

**S-3 · Turn a spreadsheet inquiry into a booking** — Intermediate · High · I + D
- Steps: inquiry row → start booking → pre-fill banner → review dates/guests → save (blocked during practice).

**S-4 · Trash and restore inquiry rows** — Intermediate · Low · D.

### Contacts

**CT-1 · Find and manage contacts** — Beginner · High · I + D — **V1 ✅**
- Steps: Contacts → search → sort First/Last → View Bookings → booking history → Open Booking (explained) ; star and delete explained.
- Targets: `nav-contacts`, `contacts-search`, `contacts-sort`, `contacts-view-bookings`, `contacts-history`, `contacts-open-booking`, `contacts-deleted` ✅.

**CT-2 · Restore a deleted contact** — Beginner · Low · I + D (Deleted panel → Restore).

**CT-3 · Export the contact list** — Beginner · Low · D (top-bar Export button).

### Guest Inquiries (website)

**GI-1 · Review a website inquiry** — Beginner · High · I + D
- Steps: Guest Inquiries → table → Review → detail sections → Close.

**GI-2 · Convert a website inquiry into a booking** — Intermediate · High · I + D
- Steps: Review → Open Prefilled Booking Form → explain that the inquiry is marked converted only after save → save (blocked during practice) → retry notice explained.

**GI-3 · Decline an inquiry** — Intermediate · Medium · D (I with the decline submit blocked).

### Guest Portal (Portal Admin)

**P-1 · Understand Portal Progress** — Beginner · High · I + D
- Steps: Portals → summary cards → search/status filter → a group card → checklist/document progress.

**P-2 · Send a group their portal link** — Beginner · High · I + D
- Steps: group card → Copy Link / Open Portal (missing-URL message explained).

**P-3 · Assign checklist tasks and documents** — Intermediate · High · I + D (assign button blocked during practice).

**P-4 · Review guest submissions** — Intermediate · High · I + D (approve / send back / reopen; blocked during practice).

**P-5 · Upload a custom document** — Advanced · Medium · D.

### Reports

**R-1 · Access and filter Reports** — Beginner · Medium · I + D
- Steps: Reports → date range → custom dates → section tour → Export CSV → Reset.

**R-2 · Understand camper days & data quality** — Intermediate · Medium · D.

### Jobs & Administration

**J-1 · See your jobs** — Beginner · Medium · I + D (Working as → Jobs → Open Booking → complete a facilities row).

**A-1 · Manage the staff directory** — Intermediate · Medium · I + D (User Admin add/edit/deactivate; save blocked during practice).

**A-2 · Dev Mode and imports** — Advanced · Low · **D only** (password, import menu, Delete All warning).

### Backups

**BK-1 · Create a backup** — Beginner · High · I + D (creating a backup only downloads a file; safe).

**BK-2 · Restore from a backup safely** — Advanced · High · **D only** — explains choose file → validation → comparison → Safe Merge vs Full Replace, the safety backup, and portal-row protection. A tutorial must never start a restore.

---

## 4. V1 selection

V1 ships **five complete tutorials, each with both modes**. They cover the everyday path a new staff member walks on day one and only need stable targets in five files. B-2 and B-4 are combined: opening a booking always lands on the Overview tab, so the tour continues straight into it.

| # | Tutorial | Category | Why first |
|---|---|---|---|
| 1 | Create a booking (B-1) | Bookings | Most common task; most fields; most mistakes. |
| 2 | Open a booking and read its Overview (B-2 + B-4) | Bookings | Prerequisite for everything else on a booking; the Overview is dense and easy to skim past. |
| 3 | Edit a booking (B-3) | Bookings | Two different editors confuse new staff. |
| 4 | Navigate the Calendar (C-1) | Calendar | Daily use; Week/Year views are easy to overlook. |
| 5 | Find and manage contacts (CT-1) | Contacts | Daily lookup task; hidden View Bookings path. |

Deferred from the requested ten, with reasons:

- **Spreadsheet view (S-1)** — the grid is configurable (hidden columns, presets, keep-alive mount); a reliable tutorial needs targets inside the settings modal. Search + open is already taught by B-2.
- **Inquiry Pipeline** — retired in the product (Q-011). Its replacements are GI-1/GI-2 and S-2/S-3.
- **Guest Portal (P-1…P-5)** — Portal Admin is 4.5k lines with many per-group sub-panels; worth its own focused pass.
- **Reports (R-1)** — straightforward, but lower daily value than the six above.

---

## 5. Technical challenges and architectural considerations

1. **One giant shell.** Every view lives in `Dashboard.jsx`; the tutorial must not add state or props there. → Mount the gnome once in `App.jsx` inside `StaffAuthGate` (staff-only, survives every view change, never on the login screen), and give `Dashboard` and the views nothing but `data-tutorial-target` attributes.
2. **Navigation without access to Dashboard's handlers.** Sidebar buttons reset several pieces of state before navigating. → Demonstration mode navigates by clicking the real sidebar/tab buttons (the same code path a person uses). Only navigation-type steps may be clicked, never submit or delete buttons.
3. **State-only views.** Booking Detail has no URL. → Step completion is checked against the DOM state of stable targets (e.g. `booking-profile` exists), not URLs, except where a URL is the truth (`/form`).
4. **Keep-alive spreadsheet.** A hidden copy of the spreadsheet stays in the DOM. → Target lookup ignores elements with no layout box or inside `[aria-hidden="true"]`.
5. **Two editors for one tab.** → Steps can list alternative targets (first visible wins) and auto-skip when their completion state is already true on arrival (e.g. the full form is editable without Edit Entry).
6. **Data safety.** Interactive mode lets people type into the real form but must not save. → While a tutorial is active (not paused), clicks and submits on elements marked `data-tutorial-guard` (Save Guest Group, Save Changes) are cancelled with an explanation; pausing hands full control back. Demonstration mode never types and never submits; example values appear only in the dialogue, labelled "Example".
7. **Interactions vs. clicks.** "Advance when the expected state is reached": each step has a `done(ctx)` predicate (field filled and left, select chosen, view visible, calendar title changed since the step started). Clicks elsewhere are intercepted and answered with a hint.
8. **Unsaved work.** Leaving `/form` or the Edit tab discards typed data (existing behaviour). → The mode picker warns when an editable form is on screen before a tutorial moves the user.
9. **Layout & stacking.** Existing modals use z-index 999–9999. → Launcher sits below modals (z 900); the tutorial overlay sits above everything (z 10000+). The dim layer is a `box-shadow` cut-out with `pointer-events: none`, so the real target stays clickable. Main content gets extra bottom padding so the launcher never covers the right-aligned Save button at the end of the form.
10. **Mobile.** The sidebar stacks above content on ≤ 760 px; targets may be far up the page. → `scrollIntoView` (handles nested scroll containers) with a bottom scroll-margin equal to the docked dialogue on small screens; the dialogue becomes a bottom sheet.
11. **Performance.** Nothing runs when no tutorial is active except the launcher. While active, one rAF position loop and one 200 ms state check.
12. **Persistence.** `localStorage` only: completed tutorial ids and the last unfinished tutorial/step/mode — no booking or guest data. Access is wrapped in try/catch. No database changes.
13. **Testing.** No DOM test environment exists and adding jsdom would be a new dependency. → Unit-test the pure parts (registry validation, search/categories, placement maths, progress storage, completion helpers) plus a source scan that every target id used by a tutorial is present in the code. Browser behaviour is verified manually / with a local Playwright script against a mock Supabase (never production).
14. **React Compiler / hooks lint.** The repo lints with `react-hooks` v7 rules; new code must avoid setState-in-effect patterns and ref reads during render.
