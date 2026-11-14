# Staff app, version one: implementation notes

Built 2026-11-13 from [the proposal](../proposals/TOAH_NIPI_STAFF_APP_PROPOSAL.md). **Not committed, not deployed.** The database migration has only been run on an isolated local test stack.

## What exists

| Screen | Route | Who |
|---|---|---|
| Today at camp | `/staff` | every staff account |
| Calendar (week agenda) | `/staff/calendar?week=YYYY-MM-DD` | every staff account |
| Group details | `/staff/group/:bookingId` | every staff account; dietary section for kitchen and office only |
| Kitchen, By Day | `/staff/kitchen?date=YYYY-MM-DD` | kitchen and office accounts |
| Kitchen, By Booking | `/staff/kitchen?view=booking&booking=:id` | kitchen and office accounts |
| User Admin → Sign-in access | office app, User Admin | admins |
| Hosting → "Kitchen should plan for this" | office app, Hosting detail | office staff |

Office accounts open the staff app from the sidebar (**Staff → Staff app**). Limited accounts only ever get `/staff/*`. Any other path redirects there.

Screenshots (fictional data, local stack): [screenshots/](screenshots/). Names end in `phone360`, `phone390`, `tablet` (820 px) or `desktop` (1440 px).

## Files

- `supabase/migrations/20261113000100_staff_app.sql`: the role, the helpers, the change log, the RPCs and the grants. Read its header first.
- `src/utils/mealPlan.js`: the one meal/dietary/count reader. The Booking Overview parsers moved here unchanged, except for one fix (below). Dashboard imports them from here.
- `src/utils/staffAppFormat.js`: camp-time dates, change descriptions and small screen helpers.
- `src/services/staffAppService.js`: the RPC calls and their error kinds (setup / access / session / network).
- `src/auth/StaffAuthGate.jsx`, `src/auth/staffAccess.js`, `src/App.jsx`: loads `staff_app_me()` once per account and routes limited accounts. The gate keys the app by user id, so switching accounts remounts everything.
- `src/pages/StaffApp.jsx` (shell, Today, Calendar, Group), `src/pages/StaffKitchen.jsx`, `src/components/StaffAppParts.jsx`, `src/components/StaffAccessPanel.jsx`, `src/styles/StaffApp.css`.
- `public/manifest.webmanifest` and the icons, plus `index.html` links: add to home screen.

## Data rules (src/utils/mealPlan.js)

- **Meals:** structured `rentalFormDetails.mealSchedule` first, limited to the stay dates (stale dates outside the stay are ignored, as Create Booking's own summary does). Then the date rows of the saved `meals` summary. Imported text that never became a clear schedule is **needs review** and shown verbatim, never guessed. Explicit "No meals" or a count of 0 is **no meals**. Nothing at all is **missing**.
- **Service times:** the form field (`breakfastTime` etc.) first, then the summary. By Day groups services by normalised time, so 6:00 and 6:30 PM stay separate cards with their own totals.
- **Guest count:**
  - **Confirmed** needs an actual count *and* the portal task `guest-count` with status `completed` (staff-approved). An actual count alone is **Recorded**; an estimate only is **Estimate**.
  - Text such as "~30 adults + kids" is **Needs review**; nothing is **Missing**. A recorded 0 stays 0.
  - Master imports marked `importedGuestCountKind: "estimated"` never show as recorded.
  - Note: the office Overview's "Actual / Recorded" row falls back to `attendee_count`, which can be the estimate. The staff app does not.
- **Totals:**
  - Known counts only.
  - All confirmed: **Confirmed**. Any estimate: "~N, Includes estimates". Recorded but not confirmed: "Not all confirmed". Any unknown count: "at least N, k counts missing".
  - Groups with unclear meals and day campers (the booking stores how many meals, not which) are listed separately and never added in.
  - The views say the booking stores one count per stay, not per meal.
- **Dietary:**
  - Rows exactly as the Overview parses them. No total is ever shown, because categories overlap.
  - **Allergy** is tagged only for explicit wording (`allerg`, `anaphyla`, `epipen`) and sorted first. "Peanut" or "Celiac" alone stays an ordinary visible row.
  - No severity or prep advice is invented. The Additional Dietary Note is shown in full.
- **Fix in the shared parser (also affects the office Overview):** an Additional Dietary Note containing `;` used to be cut up into fake dietary rows. The note is always written last by Create Booking, so everything after `Additional notes:` is now kept whole (test: `tests/mealPlan.test.js`).
- **Which bookings:**
  - Same rule as the app's classification: active ordinary bookings only (no inquiries, cancelled, waitlist or archive), enforced server-side in `staff_app_record_kind`.
  - Hosting is excluded unless the office ticks **Kitchen should plan for this** (`rentalFormDetails.kitchenInternalMeals = true`); it then shows as **Internal**, its "Host:" prefix dropped.
  - Hosting meals typed in "Meals for the kitchen" are free text, so they show as needs review and are not counted; a structured schedule (for example from a converted booking) is counted.
- **Time zone:** every "today", meal date and timestamp uses America/New_York (`usePropertyToday`, `staffAppFormat.js`).

## Permissions (supabase/migrations/20261113000100_staff_app.sql)

- New role `limited` plus `staff_profiles.departments` (only `kitchen` for now). `viewer` keeps its meaning (office, read-only).
- `is_active_staff()` now means office roles only (admin, staff, viewer). Every existing read policy uses it: bookings, guest inquiries, portal tables, email tables, staff directory, contacts, removed uploads, signing, and storage `portal-uploads` read. So a limited account reads **no rows** from any of them through the API. Write policies already use `can_manage_bookings()` / `is_staff_admin()`.
- Limited (and office) accounts read bookings only through `staff_app_bookings(from, to)` (range ≤ 120 days) and `staff_app_booking(id)`.
  - Both check `staff_app_access()` first (active profile required).
  - Both return an explicit key-by-key allowlist (`staff_app_project`). `raw_data` is only read key by key, and nested arrays and objects are rebuilt field by field.
  - `food_allergies` and dietary change-log rows go to kitchen and office accounts only.
- `staff_app_me()` reports access for the UI. The UI never authorises anything: "Working as" plays no part.
- Admin: `staff_app_admin_list()` and `staff_app_admin_set_access(email, name, role, departments, active)`.
  - Admin only. Works on existing Auth accounts by email.
  - Refuses changes to your own access.
- Internal helpers are revoked from `anon` and `authenticated`.
- Audited and unaffected:
  - the guest portal `portal_*` / `get_portal_record` functions (token-based; checked with an anonymous call)
  - `portal_signing_enabled_for` (returns a boolean only)
  - `portal_restore_signatures` (admin check)
  - the portal-email and portal-sign Edge Functions (`can_manage_bookings` / `is_staff_admin`)

Pre-existing, not changed: `staff_directory` has no table grants in its migration, so on a live-like stack nobody can read it through the API. On live the table did not exist on 2026-11-10.

## Change history

- `booking_change_log` is filled by an `AFTER UPDATE` trigger on `bookings`. It covers every save path: Create Booking, Housing, imports, restores, hosting and portal-email triggers.
- It records only the operational fields the staff app shows (`staff_app_operational_values`). Contacts, notes, rates and other office-only fields are never recorded.
- Empty text and null are treated alike, so saving without changes records nothing. Inserts record nothing.
- `actor_id` is `auth.uid()` and `actor_name` the profile name at the time. Writes without a signed-in user (service role, SQL editor) record null and show as "not recorded"; nothing is guessed.
- Nothing is backfilled. Screens say when the history started (`historySince`) and otherwise show "Booking last saved …" from `updated_at`.
- Old and new values show only when recorded and short. Long text or structured values say "updated".
- Office roles can read the table directly. Limited accounts see it only inside the RPC results (last 14 days in lists, 60 on the group page).

## Freshness and session

- Each screen shows "Up to date · checked 9:47 PM" (screen refresh time), separate from "Last recorded change … by …" (source change time).
- It re-checks when the tab or phone wakes after 60 s, when the network returns, and every 5 minutes while visible.
- Offline, a failed refresh, or data older than 15 minutes switches to an amber "may be out of date" line that still names the time of the shown data.
- An expired session shows "Your session has ended" with **Sign in again**.
- Data lives only in React state; there is no service worker, cache or local storage of booking data. Sign-out or an account change remounts the app.

## Local test stack (fictional data only)

1. Copy the earlier local stack folder (built by `supabase/tests/make-local-signing-stack.mjs` from a schema-only dump of live). Add these migrations: `20261028000100/200/300`, `20261111000100_hosting_records.sql`, `20261113000100_staff_app.sql`. Turn off `edge_runtime`, `studio`, `realtime` and `local_smtp` in its `config.toml`, then `npx supabase start` in that folder.
2. The environment needs `LOCAL_SUPABASE_URL`, `LOCAL_ANON_KEY`, `LOCAL_SERVICE_ROLE_KEY` (from `supabase start`) and `LOCAL_SEEDER_KEY` (the `test_seeder` JWT; recipe in `docs/portal-signing/SETUP.md` step 3).
3. Run:
   - `node supabase/tests/staff-app.local.mjs`: 25 direct-API checks covering:
     - roles and direct table reads and writes
     - storage, helpers and admin functions
     - the field allowlist with planted secret values
     - dietary gating, range validation and date boundaries
     - JS/SQL classification parity over 1,920 combinations
     - change-log accuracy and actors
     - office access unchanged, the guest portal by token, and admin assignment
   - `node supabase/tests/staff-app-seed.local.mjs`: demo groups and accounts `office@`, `viewer@`, `cook@` and `crew@example.test`, password `Local-demo-1!`.
   - Vite against the stack: `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=<anon key> npx vite --port 5333 --strictPort`
   - `APP_URL=http://localhost:5333 node tests/browser/staffApp.browser.mjs --shots=<folder>`: 213 checks at 360, 390, 820 and 1440 px:
     - no page-wide horizontal overflow, 44 px touch targets, 16 px main text
     - the bottom bar never covers content
     - offline, failed-refresh and expired-session states
     - account switching, the restricted account, the office sidebar, User Admin and the Calendar
     - no console errors
4. `npm test` (unit tests including `tests/mealPlan.test.js` and `tests/staffAppSql.test.js`).

## Deployment steps (not done)

1. Run `20261110000100_role_helpers_never_null.sql` and `20261111000100_hosting_records.sql` if they are still pending (security audit §8 and the hosting notes), then `20261113000100_staff_app.sql`, in the SQL editor. Run the verify queries at the end of the file signed in as an office account.
2. Deploy the frontend as usual. Check that `https://<live>/staff` loads directly after a refresh, the same way `/dashboard` does.
3. Pilot account:
   - Create or invite the person in Supabase → Authentication → Users.
   - Then in the office app, **User Admin → Sign-in access**: email, name, **Limited staff**, tick **Kitchen**, **Active**, Save.
   - SQL alternative: `select public.staff_app_admin_set_access('cook@…', 'Name', 'limited', array['kitchen'], true);` signed in as an admin. The SQL editor has no signed-in user, so there insert into `staff_profiles` directly with `role = 'limited'` and `departments = '{kitchen}'`.
4. Offboarding is unchanged: untick Active (or `is_active = false`) and ban the Auth user.

## Known limits and next steps

- Kitchen prep ticks and department acknowledgments are **not built**: no new tables, nothing writes from the staff app.
- The icon is the existing favicon. Replace `public/staff-icon-*.png` and `apple-touch-icon.png` with a real camp mark.
- By Booking lists groups in the loaded window (about 9 weeks ahead). A group further out shows "not in the current list".
- Housing room splits, linens and turnover belong to the housekeeping phase.
- The live data quality (how many bookings have structured meal plans) is still unverified. Expect "needs review" for older imports.
