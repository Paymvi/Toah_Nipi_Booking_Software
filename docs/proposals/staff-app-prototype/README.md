# Staff app prototype (presentation only)

A static HTML/CSS mockup used for the screenshots in [../TOAH_NIPI_STAFF_APP_PROPOSAL.md](../TOAH_NIPI_STAFF_APP_PROPOSAL.md). It is **not** part of the booking app. It has no JavaScript and no data connection, and every name and number in it is fictional.

## Open it

Open `index.html` in Chrome, then turn on the device toolbar (F12, then Ctrl+Shift+M) and set the size to 390 × 844. Each screen has its own address:

| Screen | Add to the address |
|---|---|
| Today at camp (shared home) | `#today` |
| Kitchen | `#kitchen` |
| Calendar list | `#calendar` |
| Group details | `#group` |
| Housekeeping (later phase) | `#housekeeping` |

The bottom bar and the group rows link between screens. The role button, day tabs and checkboxes don't do anything.

## How the screenshots were made

- **Proposed screens:** Playwright (the `playwright-core` already in `node_modules`) opened each `#screen` at 390 × 844 with 2× pixel density and took a full-page capture. The script also checked every screen at 360 px for sideways overflow and found none. For the capture only, the sticky bottom bar was placed at the end of the page; on a real phone it stays at the bottom of the screen.
- **Current-state screens** (`current-*.png`): the real app was run locally with `npx vite`, pointed at a local fake Supabase that served only fictional bookings. All requests that didn't go to localhost were blocked, and the browser clock was fixed to Friday, November 20, 2026, 10:15 AM. Nothing was written to any database. The same approach is described in [../../../tests/browser/README.md](../../../tests/browser/README.md).

The capture scripts were temporary and aren't saved in the repository.
