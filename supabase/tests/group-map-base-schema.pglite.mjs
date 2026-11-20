// The Group Map migration on a database with only the base setup (SQL_SETUP.md
// Script 05 role helpers), without the staff app migration or SEC-03
// (20261110000100_role_helpers_never_null.sql). In-process Postgres (PGlite),
// fictional rows only; nothing leaves this process.
//
//   npm install --no-save @electric-sql/pglite
//   node supabase/tests/group-map-base-schema.pglite.mjs
//
// (PGLITE_MODULE=<path to pglite's dist/index.js> uses a copy installed elsewhere.)
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const { PGlite } = await import(
  process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite"
);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => fs.readFileSync(path.join(repo, relative), "utf8").replaceAll("\r", "");
const pg = new PGlite();
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
  console.log("  ok -", message);
};
const refused = async (sql, params, code, message) => {
  try {
    await pg.query(sql, params);
  } catch (error) {
    assert.equal(error.code, code, `${message}: ${error.message}`);
    checks += 1;
    console.log("  ok -", message);
    return;
  }
  assert.fail(`${message}: expected error ${code}`);
};

// Supabase stand-ins: auth.uid() from a setting, and the API roles.
await pg.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  create table public.staff_profiles (
    user_id uuid primary key, email text, full_name text, role text, is_active boolean default true
  );
`);

// The real base definitions of the three helpers, as SQL_SETUP.md Script 05 writes them.
const setup = read("src/docs/SQL_SETUP.md");
for (const name of ["current_staff_role", "is_active_staff", "can_manage_bookings"]) {
  const block = setup.match(new RegExp("```sql\\n(create or replace function public\\." + name + "\\(\\)[\\s\\S]*?)```"))[1];
  await pg.exec(block);
}

const ids = {
  nobody: "00000000-0000-4000-8000-000000000001",
  viewer: "00000000-0000-4000-8000-000000000002",
  staff: "00000000-0000-4000-8000-000000000003",
};
await pg.query("insert into public.staff_profiles (user_id, role) values ($1, 'viewer'), ($2, 'staff')", [ids.viewer, ids.staff]);
const as = (who) => pg.exec(`set test.uid = '${ids[who]}'`);

const migration = read("supabase/migrations/20261119000100_group_map.sql");
await pg.exec(migration);
await pg.exec(migration);
check(true, "the migration applies twice on a base-setup-only database");

await as("nobody");
const { rows: [helper] } = await pg.query("select public.can_manage_bookings() as result");
check(helper.result === null, "before SEC-03, can_manage_bookings() is NULL for an account with no staff profile");
await refused("select public.group_map_create('Fictional Intruder', null)", [], "42501", "that account still can't create a group");
await refused("select public.group_map_export()", [], "42501", "or read the Group Map for a backup");
await refused(
  "select public.group_map_restore($1::jsonb, '[]'::jsonb)",
  [JSON.stringify([{ id: "00000000-0000-4000-8000-0000000000aa", name: "Fictional Intruder", parent_id: null }])],
  "42501",
  "or restore groups"
);

await as("viewer");
await refused("select public.group_map_create('Fictional Viewer Group', null)", [], "42501", "a viewer can't create groups");
const { rows: [viewerExport] } = await pg.query("select public.group_map_export() as data");
check(Array.isArray(viewerExport.data.organizations), "a viewer can back up the Group Map");

await as("staff");
// "select * from f()" calls it once; "select (f()).*" would call it once per column.
const { rows: [parent] } = await pg.query("select * from public.group_map_create('Fictional Fellowship', null)");
const { rows: [child] } = await pg.query("select * from public.group_map_create('Fictional Chapter', $1)", [parent.id]);
await refused("select public.group_map_set_parent($1, $2, $3)", [parent.id, parent.version, child.id], "22023", "loops are refused");
const { rows: [exported] } = await pg.query("select public.group_map_export() as data");
check(exported.data.organizations.length === 2, "staff can create and export");
await pg.query("select public.group_map_delete($1, $2)", [child.id, child.version]);
const { rows: [restored] } = await pg.query("select public.group_map_restore($1::jsonb, $2::jsonb) as result", [
  JSON.stringify(exported.data.organizations),
  JSON.stringify(exported.data.links),
]);
check(restored.result.groupsInserted === 1 && restored.result.groupsAlreadyPresent === 1, "staff can restore the deleted subgroup");
const { rows: [{ count }] } = await pg.query("select count(*)::int as count from public.organizations where name like 'Fictional Intruder%'");
check(count === 0, "nothing the refused account sent was saved");

console.log(`\n${checks} checks passed`);
