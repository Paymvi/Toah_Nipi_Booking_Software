# CSS guide

How the stylesheets for the office app and the staff app are organised, and how to add styles without creating another layer of overrides. Colours and Night mode have their own guide: [THEMING.md](THEMING.md).

## How styles load

Every stylesheet is plain, global CSS. There are no CSS modules and no framework.

- [src/styles/index.css](../src/styles/index.css) imports every file in cascade order, and [src/App.jsx](../src/App.jsx) imports `index.css` once. Vite bundles the result into one stylesheet.
- Two component stylesheets are imported by their component instead, because those components only load with the office app: `components/CopyButton.css` and `components/PortalEmail.css`. They arrive after `index.css`.
- Order matters only when two rules have the same specificity and can hit the same element. When that happens, the later file wins. Keep that in mind before moving a rule between files.

## Where each kind of style belongs

| Folder | What goes there |
| --- | --- |
| `foundation/` | `shared.css`: design tokens on `:root`, base element rules (`html`, `body`, form controls), the rem scale. `theme.css`: Night tokens (loaded last). |
| `layout/` | `Dashboard.css`: the office shell. That covers the sidebar, top bar, phone header and navigation drawer, `.dashboard-main`, shared dashboard buttons and cards, and dialogs owned by the shell such as Dev Mode. `Mobile.css`: phone and tablet rules that cover several screens at once (see below). |
| `booking/` | The booking form (`CreateBookingForm.css`, `CreateBookingFromInquiry.css`) and the booking detail page with its tabs (Overview, Edit, Housing, Activities, Checklists, Staff Assignments). |
| `views/` | One stylesheet per office screen: calendars, spreadsheets, contacts, portals, reports, backups, user admin and jobs, and so on. |
| `components/` | Small reusable components that bring their own CSS. |
| `staff/` | `StaffApp.css`: the staff app under `/staff`. Nothing in the office app uses it. |
| `tutorial/` | `TutorialGnome.css`: the gnome launcher, library, dialogue, spotlight and pointer. |

If a rule styles one screen, put it in that screen's file, including its responsive rules. Shared shell patterns (buttons, cards, top bar) go in `layout/Dashboard.css`. Tokens go in `foundation/shared.css`.

## Scoping and class names

There is no automatic scoping, so class prefixes keep areas apart:

- **Staff app:** everything starts with `sa-`. It uses px sizes on purpose (phones in a kitchen), not the office rem scale. Don't reuse office classes in the staff app or `sa-` classes in the office app.
- **Tutorial gnome:** everything starts with `tg-`. Its only rules outside `tg-` are deliberate: `.dashboard-main` gets bottom room so the launcher never covers the last controls, and `[data-tutorial-target]` gets `scroll-margin-top`.
- **Office screens:** use the screen's prefix, such as `home-dashboard-`, `calendar-`, `lodging-calendar-`, `spreadsheet-`, `contacts-view-`, `portal-`, `booking-housing-`, `booking-compact-`, `rental-` (the booking form), `backup-`, `season-` or `guest-request-`.
- **Base element selectors** (`button`, `input`, `select`, `textarea`) live only in `foundation/shared.css`. Elsewhere, scope element selectors under a class (`.staff-access-form select`).
- The guest portal is a separate repository. The only guest-facing view here is the email preview (`.portal-email-preview-frame`), which always stays Light.

Before renaming or merging a class, search for it in `src/`, including template strings (`` `calendar-span-event ${…}` ``), class maps in utilities, tutorial targets (`data-tutorial-target`) and the browser tests in `tests/browser/`.

## Design tokens

Defined on `:root` in `foundation/shared.css`:

- **Colours:** `--page-bg`, `--card-bg`, `--text-main`, `--text-muted`, `--label`, `--border`, `--border-strong`, `--focus`, `--focus-soft`, `--button`, `--button-hover` and the `--success-*` set. Every other colour uses a Night token with a Light fallback, `var(--n-surface, #ffffff)`. See [THEMING.md](THEMING.md).
- **Type:** `--font-heading`. Body text uses the stack set on `body`.
- **Stacking:** the `--z-*` scale, from table hover cells (80) up to the tutorial overlay (10000+). Use the token whose role fits, or add one in its place in the list. Small numbers for layers inside a single card or table (1–8) stay as plain numbers. The staff app keeps its own small values.
- **Screen tokens:** a few screens keep their own palette tokens (`--home-dashboard-*` in `HomeDashboard.css`, `--tg-*` in `TutorialGnome.css`). Use those within that screen.

Sizes are in `rem`. `html` is 80% (1rem ≈ 12.8px), or 87.5% on phones, so every rem value scales with the user's font settings.

## Responsive rules

Breakpoints in use (CSS can't use variables in media queries, so keep to these):

| Width | Meaning |
| --- | --- |
| `max-width: 940px` | Phone header and navigation drawer replace the sidebar. Must match `COMPACT_NAV_QUERY` in `src/pages/Dashboard.jsx`. Desktop sidebar rules use `min-width: 941px`. |
| `max-width: 900px` | Tablet: most multi-column screens drop columns. |
| `max-width: 780px` | Booking form switches to single-column fields. |
| `max-width: 720px` | Phone layout (the main phone breakpoint). |
| `max-width: 639.98px` | Tutorial docks its dialogue (matches `MOBILE_BREAKPOINT` in `src/tutorial/tutorialCore.js`). |
| `(max-width: 940px) and (pointer: coarse)` | Touch targets about 44px. |

Some older screens also use other widths (560–1500px) for their own layouts. Keep using a screen's existing breakpoint when you adjust that screen.

- Put a screen's responsive rules in that screen's file, in the block for that breakpoint. Add to the existing block rather than starting a new one.
- `layout/Mobile.css` is only for phone rules that apply to several screens: the two-per-row stat-card grids shared by Dashboard, Backups and Portals, touch target sizes, the scroll fade on wide tables, and the one booking-form padding that has to load after the inquiry form. Don't add per-screen fixes there. Long-text wrapping in the main area lives with the shell in `Dashboard.css`. Each dialog's `dvh` height on phones lives with that dialog.
- Wide tables and grids scroll inside their own wrapper. Add a new wrapper class to the scroll-fade list in `Mobile.css`, and avoid fixed `min-width` values below 720px.
- Respect `prefers-reduced-motion` for any new animation (see the tutorial and calendar rules).

## Adding or changing styles

1. Find the rule that already styles the element (DevTools shows the file) and change it there. Don't add a second rule for the same selector further down the file or in a later file.
2. If a value must differ at a breakpoint, add it to that file's block for the breakpoint.
3. Don't use `!important` to win a conflict. Find the competing rule and fix that rule, or make your selector name the component (`.contacts-view-table th`) rather than piling up specificity. About 80 `!important` declarations remain. Each one either still beats a real competing rule, belongs to a group that has to stay `!important` together, or styles something the cleanup couldn't see rendered (dialogs and states the checks didn't open). Remove one only after checking what it beats. The reduced-motion rules and the 16px text size on touch phones are `!important` on purpose.
4. Use tokens for colours and stacking levels.
5. Check the screen at desktop (1440px), tablet (820px) and phone (390px) widths, in Light and Night, and with a tutorial running if the screen has tutorial targets.

## November 2026 cleanup notes

The stylesheets were reorganised into the folders above without meaning to change how anything looks. Every pair of competing rules was checked to make sure its winner is unchanged, and the main screens were compared before and after, element by element, at five widths. What changed:

- `shared.css` now loads first. It used to load after eight booking stylesheets. No rule changed outcome.
- Per-screen phone fixes moved out of `Mobile.css` into their screens' files, merged with the existing rules for the same breakpoint. Declarations those fixes had been overriding were deleted.
- Repeated rules for the same selector in the same file, such as the "refinements" layers in `Dashboard.css`, were folded into a single rule. A few repeats stay because a breakpoint rule sits between them. Merging those would change which rule wins.
- Misplaced rules moved to their owners: the User Admin sign-in access panel (`staff-access-*`) from `StaffApp.css` to `AdminJobsView.css`, the quick-sort control from its own file into `SpreadsheetView.css`, and an app-wide `.dashboard-main` rule from `CalendarView.css` into `Dashboard.css`.
- Still split, on purpose: the Housing table is styled partly in `BookingDetail.css` and partly in `BookingHousing.css`. Merging them changes which padding wins on expandable rows, so it needs its own careful pass.
- Stacking levels became the `--z-*` scale, with the same numbers.
- `!important` was removed from 49 declarations that no longer beat anything, checked against the rendered screens. That includes inline styles and other `!important` rules.
