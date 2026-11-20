// Group Map "Build automatically" against a LOCAL Supabase stack (Docker).
// FICTIONAL DATA ONLY. Uses the app's own draft logic with fictional names.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/group-map-build.local.mjs
//
// Needs 20261119000100_group_map.sql and 20261119000200_group_map_build.sql.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { buildGroupMapDraft, draftToBuild } from "../../src/utils/groupMapDraft.js";

const url = process.env.LOCAL_SUPABASE_URL || "";
const anonKey = process.env.LOCAL_ANON_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !anonKey || !process.env.LOCAL_SERVICE_ROLE_KEY || !process.env.LOCAL_SEEDER_KEY) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY and LOCAL_SEEDER_KEY.");
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seed = createClient(url, process.env.LOCAL_SEEDER_KEY, options);
const authAdmin = createClient(url, process.env.LOCAL_SERVICE_ROLE_KEY, options);
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
    console.log(`FAIL ${name}\n     ${String(error?.stack || error?.message || error).split("\n").slice(0, 6).join("\n     ")}`);
  }
}
const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${error.code || ""} ${error.message}`);
  return data;
};
const refused = async (promise, code) => {
  const { data, error } = await promise;
  assert.ok(error, `expected error ${code}, got ${JSON.stringify(data)?.slice(0, 200)}`);
  if (code) assert.equal(error.code, code, error.message);
  return error;
};

async function makeAccount(label, profile) {
  const email = `gm-build-${label}-${run}@example.test`;
  const password = `pw-${run}-${label}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (profile) await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, is_active: true, ...profile }));
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return client;
}

const staff = await makeAccount("staff", { role: "staff" });
const viewer = await makeAccount("viewer", { role: "viewer" });
const cook = await makeAccount("cook", { role: "limited", departments: ["kitchen"] });

const n = (label) => `${label} ${run}`;
const apply = (client, build) => client.rpc("group_map_apply_build", { p_groups: build.groups, p_links: build.links });
const exported = async () => must(staff.rpc("group_map_export"));
const builds = [];

// Fictional unlinked booking names, as getUnlinkedNames gives them. The shared
// first word carries the run id, so each run guesses its own parent.
const fellowship = `Fellow${run}`;
const rutgersName = `${fellowship} Rutgers`;
const pennName = `${fellowship} Penn`;
const soloName = n("Solo Choir Weekend");
const unlinked = [
  { name: rutgersName, count: 2 },
  { name: pennName, count: 1 },
  { name: `  ${fellowship.toLowerCase()} penn.`, count: 1 },
  { name: soloName, count: 3 },
];
const draftFor = async (names) =>
  buildGroupMapDraft(names, (await exported()).organizations, { makeId: () => randomUUID() });

await check("a viewer, a limited account and a guest can't save a build", async () => {
  const build = draftToBuild(await draftFor(unlinked));
  await refused(apply(viewer, build), "42501");
  await refused(apply(cook, build), "42501");
  await refused(apply(anon, build));
  assert.ok(!(await exported()).links.some((link) => link.name === unlinked[0].name));
});

let first;
await check("staff save a build: groups, a guessed parent, variants linked to one group, all at once", async () => {
  const draft = await draftFor(unlinked);
  assert.equal(draft.groups.length, 3, "the two Penn spellings share a group");
  assert.deepEqual(draft.parents.map((parent) => parent.name), [fellowship], "one guessed parent");
  const build = draftToBuild(draft);
  const result = await must(apply(staff, build));
  builds.push(result.buildId);
  first = { build, result };
  assert.equal(result.groupsCreated, build.groups.length);
  assert.equal(result.namesLinked, 4);
  const map = await exported();
  const penn = map.organizations.find((group) => group.name === pennName);
  const parent = map.organizations.find((group) => group.name === fellowship);
  assert.equal(penn.parent_id, parent.id, "Penn is under the guessed parent");
  assert.equal(map.links.filter((link) => link.organization_id === penn.id).length, 2);
});

await check("the build is recorded for undo, readable by office staff only", async () => {
  const [latest] = await must(viewer.from("group_map_builds").select("*").eq("id", first.result.buildId));
  assert.equal(latest.group_ids.length, first.build.groups.length);
  assert.equal(latest.links.length, 4);
  assert.equal(((await cook.from("group_map_builds").select("id")).data || []).length, 0);
  assert.equal(((await anon.from("group_map_builds").select("id")).data || []).length, 0);
  await refused(staff.from("group_map_builds").delete().eq("id", first.result.buildId), "42501");
});

await check("saving the same draft twice is refused", async () => {
  const error = await refused(apply(staff, first.build), "55000");
  assert.match(error.message, /already saved/);
});

await check("a draft gone stale saves nothing: name linked since, or name now taken at that level", async () => {
  const names = [{ name: n("Stale Alpha"), count: 1 }, { name: n("Stale Beta"), count: 1 }];
  const draft = await draftFor(names);
  const build = draftToBuild(draft);
  // Meanwhile someone links "Stale Beta" to a group of their own.
  const other = await must(staff.rpc("group_map_create", { p_name: n("Someone Else's Group"), p_parent_id: null }));
  await must(staff.rpc("group_map_link_name", { p_name: names[1].name, p_organization_id: other.id }));
  const error = await refused(apply(staff, build), "55000");
  assert.match(error.message, /linked to a group since/);
  assert.ok(!(await exported()).organizations.some((group) => group.name === n("Stale Alpha")), "nothing was saved");

  const draft2 = await draftFor([{ name: n("Stale Gamma"), count: 1 }]);
  await must(staff.rpc("group_map_create", { p_name: n("stale gamma"), p_parent_id: null }));
  await refused(apply(staff, draftToBuild(draft2)), "55000");
  await must(staff.rpc("group_map_unlink_name", { p_name: names[1].name, p_organization_id: other.id }));
  for (const name of [n("Someone Else's Group"), n("stale gamma")]) {
    const group = (await exported()).organizations.find((item) => item.name === name);
    await must(staff.rpc("group_map_delete", { p_id: group.id, p_version: group.version }));
  }
});

await check("names matching an existing group join it; the existing group is untouched", async () => {
  const existing = await must(staff.rpc("group_map_create", { p_name: n("Existing Quilters"), p_parent_id: null }));
  const draft = await draftFor([{ name: `${n("existing quilters")}!`, count: 2 }]);
  assert.equal(draft.groups[0].existingId, existing.id);
  const result = await must(apply(staff, draftToBuild(draft)));
  builds.push(result.buildId);
  assert.equal(result.groupsCreated, 0);
  const after = (await exported()).organizations.find((group) => group.id === existing.id);
  assert.equal(after.version, existing.version, "not changed");
  const undo = await must(staff.rpc("group_map_undo_build", { p_build_id: result.buildId }));
  assert.equal(undo.namesUnlinked, 1);
  assert.equal(undo.groupsDeleted, 0, "undo never deletes a group it didn't create");
  assert.ok((await exported()).organizations.some((group) => group.id === existing.id));
  await must(staff.rpc("group_map_delete", { p_id: existing.id, p_version: after.version }));
});

await check("undo removes the build, but keeps groups given hand-made subgroups or names since", async () => {
  const map = await exported();
  const created = new Set(first.build.groups.map((group) => group.id));
  const solo = map.organizations.find((group) => created.has(group.id) && group.name === soloName);
  const penn = map.organizations.find((group) => created.has(group.id) && group.name === pennName);
  const parent = map.organizations.find((group) => created.has(group.id) && group.name === fellowship);
  // By hand, after the build: a subgroup under Solo, an extra name on Penn.
  const handMade = await must(staff.rpc("group_map_create", { p_name: n("Hand Made Subgroup"), p_parent_id: solo.id }));
  await must(staff.rpc("group_map_link_name", { p_name: n("Hand Linked Name"), p_organization_id: penn.id }));

  await refused(viewer.rpc("group_map_undo_build", { p_build_id: first.result.buildId }), "42501");
  const undo = await must(staff.rpc("group_map_undo_build", { p_build_id: first.result.buildId }));
  assert.equal(undo.namesUnlinked, 4, "every name the build linked");
  // Penn keeps its hand-linked name, so its parent keeps a subgroup too; Rutgers goes.
  assert.deepEqual([...undo.groupsKept].sort(), [fellowship, pennName, soloName].sort());
  const after = await exported();
  assert.ok(after.organizations.some((group) => group.id === handMade.id), "the hand-made subgroup stays");
  assert.ok(after.links.some((link) => link.name === n("Hand Linked Name")), "the hand-made link stays");
  assert.ok(!after.links.some((link) => unlinked.some((item) => item.name === link.name)), "the build's links are gone");
  assert.equal(after.organizations.filter((group) => created.has(group.id)).length, 3, "only the three kept groups remain");
  assert.ok(!after.organizations.some((group) => group.name === rutgersName), "the untouched Rutgers group is removed");

  await refused(staff.rpc("group_map_undo_build", { p_build_id: first.result.buildId }), "55000");

  // Clean up the kept groups by hand.
  await must(staff.rpc("group_map_unlink_name", { p_name: n("Hand Linked Name"), p_organization_id: penn.id }));
  const remove = async (id) => {
    const group = (await exported()).organizations.find((item) => item.id === id);
    if (group) await must(staff.rpc("group_map_delete", { p_id: group.id, p_version: group.version }));
  };
  await remove(handMade.id);
  await remove(solo.id);
  await remove(penn.id);
  await remove(parent.id);
});

await check("bookings are never touched by building or undoing", async () => {
  const before = await must(staff.from("bookings").select("id, organization_name, updated_at").order("id"));
  const draft = await draftFor([{ name: n("Touch Test"), count: 1 }]);
  const result = await must(apply(staff, draftToBuild(draft)));
  await must(staff.rpc("group_map_undo_build", { p_build_id: result.buildId }));
  assert.deepEqual(await must(staff.from("bookings").select("id, organization_name, updated_at").order("id")), before);
});

const leftover = (await exported()).organizations.filter((group) => group.name.includes(run));
console.log(`cleanup: ${leftover.length} test groups left`);
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
