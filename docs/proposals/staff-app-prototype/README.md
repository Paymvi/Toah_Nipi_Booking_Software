# Staff app prototype (presentation only)

A static HTML/CSS mockup used for the screenshots in [../TOAH_NIPI_STAFF_APP_PROPOSAL.md](../TOAH_NIPI_STAFF_APP_PROPOSAL.md). It is **not** part of the booking app. It has no JavaScript and no data connection, and every name and number in it is fictional.

## Open it

Open `index.html` in Chrome, then turn on the device toolbar (F12, then Ctrl+Shift+M) and set the size to 390 × 844. Each screen has its own address:

| Screen | Add to the address |
|---|---|
| Today at camp (shared home) | `#today` |
| Kitchen, By Day | `#kitchen` |
| Kitchen, By Booking | `#kitchen-booking` (also try a desktop-width window) |
| Calendar list | `#calendar` |
| Group details | `#group` |
| Housekeeping (later phase) | `#housekeeping` |

The bottom bar, the group rows and the By Day / By Booking tabs link between screens. In By Booking, every group card shows Cedar Hill. The role button, day tabs and checkboxes don't do anything.

## How the screenshots were made

- **Proposed screens:** Playwright (the `playwright-core` already in `node_modules`) opened each `#screen` at 390 × 844 with 2× pixel density and took a full-page capture. The script also checked every screen at 360 px for sideways overflow and found none. The By Booking desktop mockup was captured the same way at 1440 × 900 with 1× density. The three-phone image (`proposed-phone-kitchen-by-booking-framed.png`) puts `#kitchen-booking` in three 390 × 844 iframes inside drawn phone frames, scrolled to the group, Dietary Alerts and the meal table. The header and bottom bar stay sticky there, as on a real phone. For the capture only, the sticky header and bottom bar were placed in the page flow; on a real phone it stays at the bottom of the screen.
- **Current-state screens** (`current-*.png`): the real app was run locally with `npx vite`, pointed at a local fake Supabase that served only fictional bookings. All requests that didn't go to localhost were blocked, and the browser clock was fixed to Friday, November 20, 2026, 10:15 AM. Nothing was written to any database. The same approach is described in [../../../tests/browser/README.md](../../../tests/browser/README.md).

The capture scripts were temporary and aren't saved in the repository.
