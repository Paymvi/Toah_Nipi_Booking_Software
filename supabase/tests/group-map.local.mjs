// Group Map against a LOCAL Supabase stack (Docker). FICTIONAL DATA ONLY.
// Every call goes through the real REST API as each kind of account, the same
// way the app (or someone bypassing it) would.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/group-map.local.mjs
//
// Needs 20261119000100_group_map.sql on the stack. Cleans up its own groups.
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL || "";
const anonKey = process.env.LOCAL_ANON_KEY || "";
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY || "";
const seederKey = process.env.LOCAL_SEEDER_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !anonKey || !serviceKey || !seederKey) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY and LOCAL_SEEDER_KEY.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seed = createClient(url, seederKey, options);
const authAdmin = createClient(url, serviceKey, options);
const anon = createClient(url, anonKey, options);
const run = Date.now().toString(36);
let failures = 0;
let passes = 0;

async function check(name, body) {
  try {
    await body();
    passes += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${String(error?.message || error).split("\n").slice(0, 8).join("\n     ")}`);
  }
}

const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${error.code || ""} ${error.message}`);
  return data;
};
const refused = async (promise, code) => {
  const { data, error } = await promise;
  assert.ok(error, `expected error ${code}, got data ${JSON.stringify(data)?.slice(0, 200)}`);
  if (code) assert.equal(error.code, code, error.message);
  return error;
};

async function makeAccount(label, profile) {
  const email = `groupmap-${label}-${run}@example.test`;
  const password = `pw-${run}-${label}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (profile) {
    await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, is_active: true, ...profile }));
  }
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return client;
}

const admin = await makeAccount("admin", { role: "admin" });
const staff = await makeAccount("staff", { role: "staff" });
const viewer = await makeAccount("viewer", { role: "viewer" });
const cook = await makeAccount("cook", { role: "limited", departments: ["kitchen"] });
const nobody = await makeAccount("nobody", null);

const create = (client, name, parentId = null) =>
  client.rpc("group_map_create", { p_name: `${name} ${run}`, p_parent_id: parentId });
const setParent = (client, group, parentId) =>
  client.rpc("group_map_set_parent", { p_id: group.id, p_version: group.version, p_parent_id: parentId });
const fresh = async (group) => must(staff.from("organizations").select("*").eq("id", group.id).single());
const created = [];
const linkedNames = [];
const make = async (name, parentId) => {
  const row = await must(create(staff, name, parentId));
  created.push(row.id);
  return row;
};

// Booking rows the map must never change.
const bookingSnapshot = async () =>
  must(staff.from("bookings").select("id, organization_name, updated_at, portal_token").order("id"));
const bookingsBefore = await bookingSnapshot();
const bookingName = bookingsBefore.find((row) => row.organization_name)?.organization_name;

await check("viewer reads groups; guests, limited and profile-less accounts read nothing", async () => {
  const group = await make("Fictional Readable Fellowship");
  assert.equal((await must(viewer.from("organizations").select("id").eq("id", group.id))).length, 1);
  for (const client of [anon, cook, nobody]) {
    const rows = (await client.from("organizations").select("id")).data || [];
    assert.equal(rows.length, 0);
    const links = (await client.from("organization_name_links").select("name")).data || [];
    assert.equal(links.length, 0);
  }
});

await check("viewer, limited, profile-less and guest accounts can't change groups", async () => {
  for (const client of [viewer, cook, nobody]) {
    await refused(create(client, "Fictional Unauthorized"), "42501");
  }
  await refused(create(anon, "Fictional Unauthorized"), "42501");
  const group = await make("Fictional Protected Group");
  await refused(viewer.rpc("group_map_rename", { p_id: group.id, p_version: group.version, p_name: "x" }), "42501");
  await refused(viewer.rpc("group_map_delete", { p_id: group.id, p_version: group.version }), "42501");
  await refused(viewer.rpc("group_map_link_name", { p_name: "Fictional Name", p_organization_id: group.id }), "42501");
});

await check("direct table writes are refused even for admin (functions only)", async () => {
  const group = await make("Fictional Direct Write Target");
  await refused(admin.from("organizations").insert({ name: `Fictional Direct ${run}` }), "42501");
  await refused(admin.from("organizations").update({ name: "Hijacked" }).eq("id", group.id), "42501");
  await refused(admin.from("organizations").delete().eq("id", group.id), "42501");
  await refused(admin.from("organization_name_links").insert({ name: "x", organization_id: group.id }), "42501");
  await refused(admin.rpc("group_map_lock", { p_id: group.id, p_version: 1 }));
  assert.equal((await fresh(group)).name, group.name);
});

let region;
let chapter;
let smallGroup;
let national;
await check("three-level tree: create with parent, add subgroups", async () => {
  national = await make("Fictional National Fellowship");
  region = await make("Fictional Northeast Region", national.id);
  chapter = await make("Fictional Lakeside Chapter", region.id);
  smallGroup = await make("Fictional Tuesday Small Group", chapter.id);
  assert.equal(smallGroup.parent_id, chapter.id);
  assert.equal(region.version, 1);
});

await check("self-parenting is refused (function and constraint)", async () => {
  const error = await refused(setParent(staff, await fresh(region), region.id), "22023");
  assert.match(error.message, /own parent/);
});

await check("two-, three- and four-level cycles are refused", async () => {
  await refused(setParent(staff, await fresh(region), chapter.id), "22023");
  await refused(setParent(staff, await fresh(region), smallGroup.id), "22023");
  const error = await refused(setParent(staff, await fresh(national), smallGroup.id), "22023");
  assert.match(error.message, /its own subgroup/);
  assert.equal((await fresh(national)).parent_id, null);
});

await check("a parent that doesn't exist is refused", async () => {
  await refused(setParent(staff, await fresh(chapter), randomUUID()), "P0002");
  await refused(create(staff, "Fictional Orphan", randomUUID()), "P0002");
});

await check("duplicate sibling names are refused, ignoring case", async () => {
  await refused(staff.rpc("group_map_create", { p_name: `fictional northeast region ${run}`, p_parent_id: national.id }), "22023");
  await refused(staff.rpc("group_map_create", { p_name: "   ", p_parent_id: null }), "22023");
});

await check("change parent, remove parent, and the group keeps its own identity", async () => {
  const other = await make("Fictional Southern Region", national.id);
  const moved = await must(setParent(staff, await fresh(chapter), other.id));
  assert.equal(moved.parent_id, other.id);
  assert.equal(moved.id, chapter.id);
  assert.equal((await fresh(smallGroup)).parent_id, chapter.id, "its subgroup moves with it");
  const topLevel = await must(setParent(staff, moved, null));
  assert.equal(topLevel.parent_id, null);
  assert.equal(topLevel.name, chapter.name);
  await must(setParent(staff, topLevel, region.id));
});

await check("stale screen: a rename or move based on an old version is refused", async () => {
  const seenByA = await fresh(region);
  const seenByB = await fresh(region);
  await must(admin.rpc("group_map_rename", { p_id: seenByA.id, p_version: seenByA.version, p_name: `Fictional NE Region ${run}` }));
  const error = await refused(staff.rpc("group_map_rename", { p_id: seenByB.id, p_version: seenByB.version, p_name: "Overwrite" }), "55000");
  assert.match(error.message, /changed/);
  await refused(setParent(staff, seenByB, null), "55000");
  assert.equal((await fresh(region)).name, `Fictional NE Region ${run}`);
});

await check("concurrent opposite moves can't create a loop", async () => {
  const left = await make("Fictional Left Group");
  const right = await make("Fictional Right Group");
  const [first, second] = await Promise.all([setParent(staff, left, right.id), setParent(admin, right, left.id)]);
  const failed = [first, second].filter((result) => result.error);
  assert.equal(failed.length, 1, `exactly one move should fail, got ${JSON.stringify([first.error, second.error])}`);
  assert.equal(failed[0].error.code, "22023");
  const [l, r] = [await fresh(left), await fresh(right)];
  assert.ok(!(l.parent_id === r.id && r.parent_id === l.id), "no loop");
});

await check("concurrent multi-level moves (A under C while C under A's child) can't loop", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const a = await make(`Fictional Race A${attempt}`);
    const b = await make(`Fictional Race B${attempt}`, a.id);
    const c = await make(`Fictional Race C${attempt}`);
    const results = await Promise.all([setParent(staff, a, c.id), setParent(admin, c, b.id)]);
    assert.equal(results.filter((result) => result.error).length, 1);
  }
});

await check("link a booking name; one group per name; unlink only from the group shown", async () => {
  assert.ok(bookingName, "the stack has at least one booking");
  const link = await must(staff.rpc("group_map_link_name", { p_name: bookingName, p_organization_id: chapter.id }));
  linkedNames.push(bookingName);
  assert.equal(link.organization_id, chapter.id);
  const duplicate = await refused(staff.rpc("group_map_link_name", { p_name: bookingName, p_organization_id: region.id }), "55000");
  assert.match(duplicate.message, /already linked/);
  await refused(staff.rpc("group_map_link_name", { p_name: bookingName, p_organization_id: chapter.id }), "55000");
  await refused(staff.rpc("group_map_link_name", { p_name: "Fictional", p_organization_id: randomUUID() }), "P0002");
  await refused(staff.rpc("group_map_unlink_name", { p_name: bookingName, p_organization_id: region.id }), "55000");
  assert.equal((await must(viewer.from("organization_name_links").select("organization_id").eq("name", bookingName).single())).organization_id, chapter.id);
});

await check("delete is refused while a group has subgroups or linked names, then works when empty", async () => {
  const current = await fresh(chapter);
  const error = await refused(staff.rpc("group_map_delete", { p_id: current.id, p_version: current.version }), "55000");
  assert.match(error.message, /1 subgroup\(s\) and 1 linked name/);
  assert.equal((await fresh(smallGroup)).parent_id, chapter.id, "nothing cascaded");
  const leaf = await fresh(smallGroup);
  await refused(staff.rpc("group_map_delete", { p_id: leaf.id, p_version: leaf.version + 5 }), "55000");
  await must(staff.rpc("group_map_delete", { p_id: leaf.id, p_version: leaf.version }));
  const { data } = await staff.from("organizations").select("id").eq("id", leaf.id);
  assert.equal(data.length, 0);
});

await check("bookings and portal links are untouched by every change above", async () => {
  assert.deepEqual(await bookingSnapshot(), bookingsBefore);
});

// Cleanup: unlink names, then delete leaves first.
for (const name of linkedNames) {
  await staff.rpc("group_map_unlink_name", { p_name: name, p_organization_id: chapter.id });
}
for (let pass = 0; pass < 6; pass += 1) {
  for (const id of created) {
    const { data } = await staff.from("organizations").select("*").eq("id", id);
    if (data?.[0]) await staff.rpc("group_map_delete", { p_id: id, p_version: data[0].version });
  }
}
const { data: leftover } = await staff.from("organizations").select("id").in("id", created);
console.log(`cleanup: ${leftover?.length ?? "?"} test groups left`);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
