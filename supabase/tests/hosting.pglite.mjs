// Hosting migration check against an in-process Postgres (PGlite): the real
// migration file, fictional rows only. Nothing leaves this process.
//
//   npm install --no-save @electric-sql/pglite
//   node supabase/tests/hosting.pglite.mjs
//
// (PGLITE_MODULE=<path to pglite's dist/index.js> uses a copy installed elsewhere.)
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isHostRecord } from "../../src/utils/bookingClassification.js";

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

const setup = read("src/docs/SQL_SETUP.md");
await pg.exec(
  setup
    .match(/```sql\n(create table if not exists public\.bookings[\s\S]*?)```/)[1]
    .replace("encode(gen_random_bytes(16), 'hex')", "md5(random()::text)")
);
await pg.exec(`
  create table public.portal_email_bookings (
    booking_id text primary key, enabled boolean not null default false,
    stopped_reason text, stopped_at timestamptz, updated_at timestamptz
  );
`);

const rows = [
  ["guest", "Fictional Church Retreat", "Church"],
  ["host-name", "Host: Fictional Board Weekend", "Church"],
  ["host-dash", "Hosting – Fictional Staff Day", ""],
  ["host-type", "Fictional Alumni Lunch", "Hosting"],
  ["hostel", "Hostel Youth Group (fictional)", "Church"],
  ["hosted-by", "Hosted by Fictional Pastor", "Other"],
];
for (const [id, name, type] of rows) {
  await pg.query(
    "insert into public.bookings (id, organization_name, retreat_type, portal_token) values ($1, $2, $3, $4)",
    [id, name, type, `old-link-${id}-0123456789abcdef`]
  );
  await pg.query("insert into public.portal_email_bookings (booking_id, enabled) values ($1, true)", [id]);
}

const migration = read("supabase/migrations/20261111000100_hosting_records.sql");
await pg.exec(migration);
await pg.exec(migration); // repeatable
check(true, "migration runs twice without error");

// 1. One rule: the database agrees with the app for every case.
const cases = [
  ...rows.map(([, name, type]) => [name, type]),
  ["host:x", ""], ["  HOSTING — X", ""], ["Host-Board", ""], ["Host", ""], ["Hosting", ""],
  ["X", " host "], ["X", "Hosts"], ["X", "Friends/Hosts"], ["The Host: retreat", ""], ["", ""], [null, null],
];
for (const [name, type] of cases) {
  const { rows: [{ result }] } = await pg.query("select public.is_hosting_booking($1, $2) as result", [name, type]);
  assert.equal(result, isHostRecord({ organizationName: name, retreatType: type }), `${name} / ${type}`);
}
check(true, `database and app classify all ${cases.length} cases the same`);

const tokenOf = async (id) =>
  (await pg.query("select portal_token from public.bookings where id = $1", [id])).rows[0].portal_token;
const resolve = async (token) =>
  (await pg.query("select id from public.bookings where portal_token = trim($1)", [token])).rows.length;

// 2. Backfill.
for (const id of ["host-name", "host-dash", "host-type"]) {
  check((await tokenOf(id)) === null, `${id}: existing hosting link cleared`);
  check((await resolve(`old-link-${id}-0123456789abcdef`)) === 0, `${id}: old link resolves to nothing (every guest RPC looks up by token)`);
}
for (const id of ["guest", "hostel", "hosted-by"]) {
  check((await tokenOf(id)) === `old-link-${id}-0123456789abcdef`, `${id}: guest booking keeps its link`);
}
const automation = Object.fromEntries(
  (await pg.query("select booking_id, stopped_reason from public.portal_email_bookings")).rows.map((row) => [row.booking_id, row.stopped_reason])
);
check(automation["host-name"] === "ineligible" && automation["host-type"] === "ineligible", "hosting email automation stopped");
check(automation.guest === null && automation.hostel === null, "guest booking automation untouched");

// 3. Every write path.
await pg.query("insert into public.bookings (id, organization_name, retreat_type, portal_token) values ('restored', 'Host: Restored Fictional', '', 'restored-link-0123456789abcdef')");
check((await tokenOf("restored")) === null, "restore/import insert of hosting with a link: link dropped");

await pg.query("insert into public.bookings (id, organization_name, retreat_type) values ('new-hosting', 'Fictional Board Dinner', 'Hosting')");
check((await tokenOf("new-hosting")) === null, "new hosting entry gets no default link");

await pg.query("update public.bookings set retreat_type = 'Hosting' where id = 'guest'");
check((await tokenOf("guest")) === null, "booking -> hosting conversion drops the link in the same write");
check((await resolve("old-link-guest-0123456789abcdef")) === 0, "converted booking's old link stops resolving");

await pg.query("update public.bookings set retreat_type = 'Church' where id = 'guest'");
check((await tokenOf("guest")) === null, "hosting -> booking does not bring back the old link");

await pg.query("update public.bookings set portal_token = 'fresh-link-0123456789abcdef' where id = 'guest' and portal_token is null");
check((await tokenOf("guest")) === "fresh-link-0123456789abcdef", "staff can create a new link for the booking explicitly");

await pg.query("update public.bookings set portal_token = 'sneaky-link-0123456789abcdef' where id = 'host-type'");
check((await tokenOf("host-type")) === null, "a link cannot be set on hosting");

await pg.query("update public.bookings set notes = 'edited' where id = 'host-name'");
check((await tokenOf("host-name")) === null, "ordinary hosting edits keep it without a link");

console.log(`\nAll ${checks} hosting migration checks passed.`);
