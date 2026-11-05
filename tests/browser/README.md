# Portal tutorial browser checks

Real Chrome against a local Vite server and a local mock of Supabase. All data is fictional, and any request that leaves localhost is blocked, so these scripts can't reach live records or send email. They are not part of `npm test`.

## Run them

```
npm install --no-save playwright-core

node tests/browser/mockSupabase.mjs

VITE_SUPABASE_URL=http://127.0.0.1:54419 VITE_SUPABASE_PUBLISHABLE_KEY=mock VITE_GUEST_PORTAL_BASE_URL=http://localhost:5999 npx vite --port 5297 --strictPort

node tests/browser/portalEdges.browser.mjs            # or a name filter: "Housing"
node tests/browser/portalRuns.browser.mjs             # or --only=portal/tasks --sizes=1440x900
```

Run the mock and Vite in their own terminals. On a machine without Chrome at the Windows default path, set `CHROME_PATH`.

Run `portalEdges` on its own, because it changes the mock's state. Several `portalRuns` can share one mock, one per screen size.

## What they cover

- `portalRuns` runs the walkthrough and every topic, in both modes, generated from the registry, so a new section is covered without changing the script. It checks the step count, placement, console errors, and that nothing reached the mock.
- `portalEdges` covers starting points, missing state, roles, loading, every guarded control, the network lock, demo cleanup, unsaved work, continuing, Back and progress.

`mockSupabase.mjs` records every attempted change. `/__ctl?writes` isn't needed: any call to `/__ctl` returns the list.
