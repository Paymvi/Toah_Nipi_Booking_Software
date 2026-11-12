# Portal tutorial browser checks

Real Chrome against a local Vite server and a local mock of Supabase. All data is fictional, and any request that leaves localhost is blocked, so these scripts can't reach live records or send email. They are not part of `npm test`.

## Run them

```
npm install --no-save playwright-core

node tests/browser/mockSupabase.mjs

VITE_SUPABASE_URL=http://127.0.0.1:54419 VITE_SUPABASE_PUBLISHABLE_KEY=mock VITE_GUEST_PORTAL_BASE_URL=http://localhost:5999 npx vite --port 5297 --strictPort

node tests/browser/portalEdges.browser.mjs            # or a name filter: "Housing"
node tests/browser/portalRuns.browser.mjs             # or --only=portal/tasks --sizes=1440x900
node tests/browser/reports.browser.mjs
node tests/browser/backups.browser.mjs
node tests/browser/portalSigning.browser.mjs
```

Run the mock and Vite in their own terminals. On a machine without Chrome at the Windows default path, set `CHROME_PATH`.

Run `portalEdges` on its own, because it changes the mock's state. Several `portalRuns` can share one mock, one per screen size.

## What they cover

- `portalRuns` runs the walkthrough and every topic, generated from the registry, so a new section is covered without changing the script. It checks the step count, placement, console errors, and that nothing reached the mock.
- `reports` covers the New and Original toggle, the three views, drill-down, and returning from a booking.
- `backups` covers the Minimal and Detailed toggle, its saved preference, state kept while toggling, warnings, and role and Dev Mode limits. It never presses Full Replace.
- `portalEdges` covers starting points, roles, every guarded control, the network lock, demo cleanup, unsaved work, continuing, Back and progress.
- `portalSigning` saves staff PDF choices with guest signing off, a fictional test booking, and a failed settings read; checks missing schema explanations and recovery on Refresh; and explains when there are no eligible PDFs.

`mockSupabase.mjs` records every attempted change. `/__ctl?writes` isn't needed: any call to `/__ctl` returns the list.
