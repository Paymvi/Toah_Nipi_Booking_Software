import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { LODGING_BUILDINGS, getLodgingBuildingRooms } from "../src/constants/lodgingConstants.js";

// The staff app migration lists every field it returns. These checks keep the
// list in step with the app and free of office-only fields. The full access
// matrix runs against a local stack: supabase/tests/staff-app.local.mjs.
const sql = fs.readFileSync(new URL("../supabase/migrations/20261113000100_staff_app.sql", import.meta.url), "utf8");
const projection = sql.slice(sql.indexOf("create or replace function public.staff_app_project"), sql.indexOf("-- 6. Functions the app calls"));
const quoted = (text) => new Set([...text.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map((match) => match[1]));

test("every lodging count key the app reads is allowlisted, and nothing else lodging-like", () => {
  const appKeys = new Set();
  LODGING_BUILDINGS.forEach((building) => {
    appKeys.add(building.field);
    getLodgingBuildingRooms(building).forEach((room) => appKeys.add(room.key));
    (building.areas || []).forEach((area) => appKeys.add(area.key));
  });
  const sqlKeys = [...quoted(projection)].filter((key) => /^lodging./.test(key)); // bare "lodging" is the staffEditedFields flag
  assert.deepEqual(new Set(sqlKeys), appKeys);
  assert.ok(!sqlKeys.includes("lodgingCost"));
});

test("the projection never names an office-only field", () => {
  const forbidden = /^(contact_?name|email|phone|notes|need_?to_?know|portal_?token|guest_?rate|deposit|usage_?fee|lodging_?cost|food_?cost|misc_?cost|invoice|expected_?minimum_?revenue|monthly_?projected_?income|archive_?address|promo_?code|checklists|program_logistics_assignments|.*Rate.*|.*Cost|.*Amount|.*Payment.*|.*Contract.*|.*Deposit.*|secondaryContact.*|mailingAddress|insurance.*|ethnicBreakdown)$/i;
  const columns = [...projection.matchAll(/\bb\.([a-z_]+)/g)].map((match) => match[1]);
  // A facility task's own "notes" (setup notes) is allowed; the booking's notes column is not.
  const keys = [...quoted(projection)].filter((name) => name !== "notes");
  const leaked = [...columns, ...keys].filter((name) => forbidden.test(name));
  assert.deepEqual(leaked, []);
  assert.ok(!columns.includes("notes"));
  assert.ok(!/b\.raw_data\b(?!\s*->)/.test(projection), "raw_data is only ever read key by key");
});

test("every staff_app function a signed-in user may call checks access first", () => {
  for (const name of ["staff_app_bookings", "staff_app_booking"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    assert.match(body.slice(0, 600), /staff_app_access\(\) is null then\s+raise exception/);
  }
  for (const name of ["staff_app_admin_list", "staff_app_admin_set_access"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    assert.match(body.slice(0, 900), /if not public\.is_staff_admin\(\) then\s+raise exception/);
  }
  assert.match(sql, /revoke all on function public\.staff_app_project\(public\.bookings, boolean, text, integer\) from public, anon, authenticated/);
});
