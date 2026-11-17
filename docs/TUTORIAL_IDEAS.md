# Tutorial ideas

Gnome tutorials we could add next, and why. Written 2026-11-17 by comparing the gnome's library ([src/tutorial/tutorials.js](../src/tutorial/tutorials.js)) with the pages in the sidebar and the booking tabs.

> **Update, 2026-11-17:** ideas 1, 2, 5, 6, 7 and 9 are now built: Housing is a topic of "Work with a booking", the Lodging Calendar and availability check are topics of "Use the calendars", and the Inquiry Spreadsheet, Hosting, Backup and Jobs are mini tutorials. Ideas 3, 4, 8 and 10 and the staff app are still open. The table below describes the library before that change.

## What's covered today

| Area | Tutorial |
| --- | --- |
| Bookings | Create a booking · Open and read a booking (Overview tab) · Edit a booking (Edit tab) |
| Calendar | Use the calendar (Month / Week / Year) |
| Contacts | Find and manage contacts |
| Reports | Read your reports |
| Portals | Manage a group's portal (9 topics) · Automated emails |
| Guest journey | From Guest Inquiry to Guest Portal (6 topics) |

## Not covered yet

Ranked by how often staff are likely to use the screen and how easy it is to get wrong.

### 1. Housing a group (booking → Housing tab)
**Why:** Room and linen assignments are day-to-day work for every booking. Mistakes here show up at check-in. No tutorial goes past the Overview and Edit tabs.
**Could cover:** opening the Housing tab, assigning buildings and rooms, linens, and how that feeds the Lodging Calendar.

### 2. Read the Lodging Calendar
**Why:** This is a second calendar with a different purpose (who is in which building) next to the main Calendar. New staff won't know which one to use. "Use the calendar" only covers the main one.
**Could cover:** reading building lanes, finding open rooms for given dates, and opening a booking from it.

### 3. Booking checklists and staff assignments (two booking tabs)
**Why:** These are the last two booking tabs with no tutorial. Both are about who does what before a group arrives, so they fit as two topics under one walkthrough.
**Could cover:** ticking off checklist items, what an unfinished item means, and assigning staff to a booking.

### 4. Your Dashboard home
**Why:** Everyone lands on it first. The period picker (All Time, custom date range) changes the numbers, and the On Site list versus count is easy to misread.
**Could cover:** changing the period, what each card counts, getting from a card to the bookings behind it, and New Booking.

### 5. Inquiries that didn't book (Inquiry Spreadsheet)
**Why:** The guest journey covers turning a request into a booking. It doesn't cover the "Inquiries & No's" record of groups that asked but didn't come, which is what you'd check before following up with a group again.
**Could cover:** searching, reading a record, and how it differs from Guest Inquiries.

### 6. Hosting
**Why:** Hosting was recently split from bookings and has its own list and detail view. Staff used to finding everything in the Master Spreadsheet need to know where hosting records went.
**Could cover:** finding a hosting record, sorting, opening it, and how it differs from a booking.

### 7. Backups and restore (admin)
**Why:** This is rarely used and high-stakes. When someone needs it, they're usually under pressure. A walkthrough in demo mode lets admins practise without risk.
**Could cover:** creating a fresh backup, keeping more than one copy, signed-document backups, and what restore does before you click it. The tutorial write lock must stay on.

### 8. User Admin: give someone access (admin)
**Why:** This covers adding staff accounts and staff-app access. It's done rarely, so it's easy to forget between seasons, and mistakes are a security risk.
**Could cover:** individual accounts versus the shared staff-app login, changing a role, and removing access.

### 9. Jobs
**Why:** It's a small page, but new staff won't know what "Active Members & Their Jobs" and Staff Tasks are for.
**Could cover:** reading the list. This might fit better as a short topic than a full tutorial.

### 10. Light / Night mode
**Why:** This is quick and friendly, and makes a good first tutorial for brand-new users. The toggle already lets clicks through during walkthroughs (`data-tutorial-ui`).
**Could cover:** one step. Consider adding it as a topic of the Dashboard tutorial instead.

## Separate idea: the staff app

The gnome doesn't run inside the staff app (`/staff`, see [App.jsx](../src/App.jsx): `!isStaffApp`). Kitchen staff using Meal Service Plan, Dietary Alerts and Orders get no help. Two ways to fix that:
- **Small:** a gnome walkthrough in the office app that explains what staff see on their phones, like the guest-journey topic for the group leader.
- **Bigger:** mount the gnome in the staff app, with its own short tutorials (Today, Calendar month view, Kitchen, placing an order). The phone layout would need checking.

## Suggested order

1. Housing (1) and Lodging Calendar (2), as one "Housing a group" walkthrough with topics
2. Checklists and staff assignments (3), which completes the booking tabs
3. Dashboard home (4), including Night mode (10)
4. Admin pair: Backups (7) and User Admin (8)
5. The rest as they come up

## Before building any of these

- Each step needs a `data-tutorial` target on the page. Most of these pages don't have one yet.
- Steps that click buttons must keep the write lock (`setTutorialWriteLock`) so the demo never saves real data.
- Add each new tutorial to `TUTORIALS` just before `GUEST_JOURNEY_TUTORIAL`. That keeps the guest journey last, which `tests/tutorialGnome.test.js` checks.
