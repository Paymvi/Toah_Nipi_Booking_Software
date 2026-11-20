# Group Map

The Group Map shows how organizations relate to each other: a national organization, its regions, their campus chapters, a small group inside a chapter. It lives in **Contacts**, behind the **Contacts | Group Map** switch at the top of the page.

## Using it

- **Map or List.** The map draws each group as a box, with a line pointing from a parent organization to each of its subgroups (parents on the left). Groups with no parent and no subgroups are listed together underneath. **List** shows the same groups as an indented outline, which works better with a screen reader or on a small phone. Both views share the selection.
- **Moving around.** Drag the background to pan. Use the mouse wheel, a pinch, or the + and − buttons to zoom. **Fit to screen** shows everything. The map remembers where you are while you explore and doesn't rearrange itself.
- **Finding a group.** Type in **Find a group** and press Enter or pick a match. The map opens any collapsed branches and brings the group into view.
- **Branches.** The arrow button beside a box hides or shows its subgroups. **Expand all** and **Collapse all** do every branch at once.
- **One organization.** **Show only this organization** shows just that group and its subgroups. **Show all groups** goes back.
- **Keyboard.** Up and Down move through the groups. Right opens a branch or moves into it, and Left closes it or moves to the parent. Escape leaves full screen.
- **Phones.** Use **Full screen** for more room, or switch to **List**.

Selecting a group opens its details:

- Its parent path, its direct subgroups and its linked booking names.
- **Bookings for this group**: only this group's own bookings. When it has subgroups, a separate **Including its N subgroups** figure adds theirs. The bookings listed are always the group's own.
- Its bookings, with their notes, and **Open booking** (Back returns to the Group Map).
- The contacts on those bookings, with **Show in Contacts**, which opens the contact list filtered to that person.

## What a parent/subgroup link means

A link only records that one group belongs to a larger organization. It doesn't:

- merge records, or move bookings or contacts between groups;
- change any report figure (Reports still count bookings by their own names);
- give anyone access to anything, including on the guest portal;
- rewrite past bookings.

Each group has one parent at most. A group can't be its own parent or sit inside its own subgroup, and two groups with the same parent can't share a name.

## How existing bookings join a group

Bookings only store an organization name as typed. A group therefore lists the **exact names** that belong to it, and every booking with one of those names counts as that group's booking, past and future.

- The details panel (with no group selected) lists **Booking names not linked to a group**, with how many bookings use each one. **Create group** makes a top-level group with that name and links the name.
- With a group selected, **Link a booking name** attaches another spelling, such as a typo or a longer name. **Unlink** detaches it. The bookings themselves never change.
- Names that share every word of the group's name are listed as suggestions for staff to check. Nothing is ever linked or merged automatically.
- A name belongs to one group at most. To move it, unlink it from the first group, then link it to the other.
- Hosting records and the placeholder "Unnamed Organization" are left out.

## Changing groups

Admin and staff accounts (the same accounts that can edit bookings) can create, rename, move, link and delete groups. Viewer accounts see the map read-only. Limited (staff app) accounts and guests can't see it.

- **Change the parent** with the parent picker in the details panel. It never offers the group itself or its own subgroups. **Remove parent** makes the group top-level and keeps everything else.
- **Delete** only works on an empty group: no subgroups and no linked names. Move the subgroups (or remove their parent) and unlink the names first. Nothing is ever deleted along with a group.
- **Two people at once.** Each change is checked against the version of the group the screen showed. If someone else changed it first, the change is refused with a message and the map reloads. Nothing is silently overwritten.
- Dragging only moves the view. It never changes a relationship.

## Data model and permissions

Migration: `supabase/migrations/20261119000100_group_map.sql` (additive; existing tables are not touched).

| Table | Columns | Notes |
| --- | --- | --- |
| `organizations` | `id uuid`, `name`, `parent_id → organizations.id`, `version`, timestamps, `updated_by` | `ON DELETE RESTRICT`; no self-parent check; unique sibling name (case-insensitive); index on `parent_id` |
| `organization_name_links` | `name` (primary key, exact booking `organization_name`), `organization_id → organizations.id` | One group per name; `ON DELETE RESTRICT`; index on `organization_id` |

- **Loops** are blocked by the `organizations_check_parent` trigger, so they're refused even for direct SQL. It takes a transaction-level advisory lock, so two opposite moves made at the same moment can't both pass.
- **Reads:** a `SELECT` grant plus RLS `is_active_staff()` (admin, staff, viewer).
- **Writes:** the tables have no write grants. Changes go through `group_map_create`, `group_map_rename`, `group_map_set_parent`, `group_map_delete`, `group_map_link_name` and `group_map_unlink_name`. Each checks `can_manage_bookings()`, takes the expected `version`, and returns errors written for staff: `22023` invalid, `42501` not allowed, `55000` stale or blocked, `P0002` gone.
- **Backups:** `group_map_export()` (office staff, one consistent read) and `group_map_restore(organizations, links)` (admin and staff, one transaction, adds only).
- Bookings are joined on the client, from the bookings the office app already loads. No booking, contact, report or portal code reads these tables.

## Backups

Dashboard backups (format version 5) include every group, its parent, and its linked booking names. Restoring the Group Map is **additive, in Merge and in Full Replace alike**:

- adds missing groups and links, with their original ids, parents and timestamps;
- never changes or deletes a current group or link, so the current version always wins;
- **does not undo edits made since the backup**: a group renamed, moved or relinked since then keeps its current form (to go back to an older structure, edit the map by hand);
- skips a group whose name is already used at the same level, and lists it (groups are never merged by name);
- refuses the whole Group Map section, changing nothing, if the file's groups and links don't hold together.

Full Replace deletes bookings, not groups. Older backups (versions 1 to 4) have no groups, and restoring one leaves every current group, parent and linked name exactly as it is. The Backups page previews all of this before you restore. Details: [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md#the-group-map-in-backups).

Code: `src/services/groupMap.js` (data access), `src/utils/groupMap.js` (tree, counts, layout, search, keyboard; no React), `src/components/groupMap/` (map, list, details), `src/styles/views/GroupMap.css`. No new dependencies: the layout is a simple left-to-right tree drawn with HTML and SVG.

## Setup and deployment

### What the Group Map needs

`20261119000100_group_map.sql` needs only the base role helpers from [SQL_SETUP.md](../src/docs/SQL_SETUP.md) Script 05 (`current_staff_role`, `is_active_staff`, `can_manage_bookings`) and `staff_profiles`. It stops with a message if they are missing. It does **not** need the staff app migration or SEC-03. Every permission check treats a NULL helper result as "no", which matters because the base `can_manage_bookings()` returns NULL for a signed-in account without a staff profile. `supabase/tests/group-map-base-schema.pglite.mjs` checks exactly that setup.

### Live migration status: what the repository shows

This is a record, not a live check. Live has no migration history table (SQL is run by hand), so only dated notes are available.

| Migration | Evidence in this repository | Status |
| --- | --- | --- |
| Base setup (SQL_SETUP.md Script 05 helpers) | `docs/audit/ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql` holds the live definitions, read 2026-11-07 | **Confirmed live** on that date, in the original (NULL-returning) form |
| `20261028000100/200/300` (staff directory, contact preferences, portal corrections) | Live schema read 2026-11-07 (archived signing plan, F-7): tables absent; `staff_directory` still absent 2026-11-10 (`docs/staff-app/IMPLEMENTATION_NOTES.md`) | **Not applied** as of those dates |
| `20261029000100_inquiry_hidden` | `docs/audit/SECURITY_AUDIT_2026-11-10.md`: table and policies exist live | **Applied** (seen 2026-11-10) |
| `20261104000100_portal_email` (+ optional scheduler) | `docs/portal-email/SETUP.md`: applied by hand; scheduler installed 2026-11-05 | **Applied**, operator notes |
| `20261107000100_portal_signing` | `docs/portal-signing/SETUP.md`: "reported complete by the operator" 2026-11-11 | **Reported** by the operator, not independently verified |
| `20261110000100/200/300` (SEC-03, SEC-09, SEC-10) | Security audit 2026-11-10: "prepared, not run" | **Not applied** as of 2026-11-10; nothing later in the repo |
| `20261111000100_hosting_records` | Staff app notes say "if still pending" | **Unknown** |
| `20261113000100_staff_app`, `20261114000100_staff_orders`, `20261117000100_booking_change_log_keep_history` | Staff app notes: "only run on an isolated local test stack" | **Not applied** as far as the repo records |
| `20261119000100_group_map` | Written 2026-11-19, run only on the local stack | **Not applied** |

Before deploying, confirm the real state with these read-only catalog queries in the SQL editor. They return only names and true/false, nothing from any table, so the results are safe to share:

```sql
select to_regclass('public.contact_hidden') is not null as contact_preferences,
       to_regclass('public.staff_directory') is not null as staff_directory,
       to_regprocedure('public.is_hosting_booking(text,text)') is not null as hosting_records,
       to_regprocedure('public.staff_app_access()') is not null as staff_app,
       to_regprocedure('public.staff_app_restore_change_log(jsonb)') is not null as change_log_keep_history,
       to_regclass('public.organizations') is not null as group_map,
       pg_get_functiondef('public.can_manage_bookings()'::regprocedure) like '%coalesce%' as sec03_applied;
```

### Migration order

Run each file by hand in the SQL editor, one at a time, reading it first. Never use `db push`. Skip any the query above shows as already applied.

1. `20261110000100_role_helpers_never_null.sql` (SEC-03). The Group Map doesn't depend on it any more, but other functions do. Run it first.
2. `20261110000200_revoke_unused_table_privileges.sql` and `20261110000300_lock_repair_functions.sql` (SEC-09, SEC-10). These are independent.
3. `20261111000100_hosting_records.sql`, then `20261113000100_staff_app.sql`, then `20261114000100_staff_orders.sql`. Only needed for the staff app, and in this order (each checks the one before).
4. `20261117000100_booking_change_log_keep_history.sql`, after the staff app migration. Run it before anyone uses Full Replace, or Full Replace erases the change history.
5. `20261119000100_group_map.sql`. If the Group Map ships on its own, this is the only one it needs. It also works before steps 1-4: when the staff app migration runs later, its new `is_active_staff()` applies to the Group Map's read policies automatically.

`20261028000100/200/300` are separate features with their own notes, and the Group Map doesn't need them.

The app and the migration can go out in either order. Until the migration runs, the Group Map says it needs its database update, the rest of Contacts works as before, and backups simply contain no groups.

Tests (fictional data only):

- `node --test tests/groupMap.test.js` (part of `npm test`).
- `node supabase/tests/group-map.local.mjs` against a local Docker stack: permissions for every role, direct-table writes, self-parenting, two- to four-level loops, concurrent opposite moves, stale versions, links, blocked deletes, and bookings and portal links unchanged.
- `node supabase/tests/group-map-backup.local.mjs` against the same stack: a backup round trip of a nested tree, restoring twice, conflicts, invalid files sent straight to the database, permissions, a restore racing a new group, Merge, a real Full Replace (it deletes and restores every local booking), and an older version 4 file.
- `node tests/browser/groupMap.browser.mjs` and `node tests/browser/groupMapBackup.browser.mjs` in Chrome against the same stack (see `tests/browser/README.md`). The second covers restore conflicts too: a skipped group, its skipped subgroup and link, a booking name already linked elsewhere, and a renamed group kept as it is.
- `node --test tests/backupGroupMap.test.js` (part of `npm test`): the backup format, validation, restore preview and error handling, and the file contract for a scheduled job.
- `node supabase/tests/group-map-base-schema.pglite.mjs` (in-process Postgres): the migration on a database with only the base setup, where `can_manage_bookings()` returns NULL for non-staff, still refuses them.

## Known limitations

- Linking is by exact name. Two different real groups that typed exactly the same name can't be told apart. A per-booking override could be added later.
- The Google Drive daily backup (version 1, an external Apps Script) does not include the Group Map, and that integration is **not done**: the script's source isn't in this repository, and its key can't read the Group Map yet. Only dashboard backups protect groups. What to provide, the access decision and the file contract are in [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md#the-group-map-in-the-daily-backup-not-done).
- Restoring never removes groups made after the backup. To undo a structure change, edit the groups on the map.
- Changes made by someone else show up after **Refresh** or your next change. The map doesn't update live.
- Opening a booking and pressing Back returns to the Group Map, but the selection and zoom start fresh.
- Group names are limited to 200 characters. Deep trees of hundreds of groups work, but very wide maps need zooming or the List view to read comfortably.
