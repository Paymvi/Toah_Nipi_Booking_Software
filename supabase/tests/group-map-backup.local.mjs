// Group Map backups and restores against a LOCAL Supabase stack (Docker).
// FICTIONAL DATA ONLY.
//
// WARNING: runs a real Full Replace, which deletes EVERY booking in the local
// database and puts back the backup it took a moment earlier. Never point it
// at a database whose bookings matter. It refuses anything but localhost.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/group-map-backup.local.mjs
//
// Needs 20261119000100_group_map.sql (and the staff app migrations) on the stack.
// The restore steps are the ones DashboardBackups.jsx runs (handleRestore),
// through the same service functions, with each account's signed-in client.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { createBackupEnvelope, hasGroupMapSection, validateBackupShape, verifyBackupIntegrity, planGroupMapRestore } from "../../src/utils/backupFormat.js";
import {
  countLiveSignatures,
  fetchBackupSections,
  restoreBookingRows,
  restoreGroupMapSection,
  restorePortalSnapshot,
  restoreSupportingSections,
  SUPPORTING_SECTION_KEYS,
} from "../../src/services/backupData.js";
import { dbRowToBooking } from "../../src/services/bookingMapping.js";
import { keepRecordClassification } from "../../src/utils/bookingClassification.js";

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
    console.log(`FAIL ${name}\n     ${String(error?.stack || error?.message || error).split("\n").slice(0, 8).join("\n     ")}`);
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
  const email = `gmb-${label}-${run}@example.test`;
  const password = `pw-${run}-${label}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (profile) await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, is_active: true, ...profile }));
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return client;
}

const admin = await makeAccount("admin", { role: "admin" });
const staff = await makeAccount("staff", { role: "staff" });
const viewer = await makeAccount("viewer", { role: "viewer" });
const cook = await makeAccount("cook", { role: "limited", departments: ["kitchen"] });

// The app's fetchBookings, with this script's client.
async function fetchBookingsWith(client) {
  const rows = [];
  for (;;) {
    const data = await must(client.from("bookings").select("*").order("start_date").order("id").range(rows.length, rows.length + 999));
    if (!data.length) return rows.map(dbRowToBooking);
    rows.push(...data);
  }
}

async function backupWith(client) {
  const { sections, sectionErrors } = await fetchBackupSections({ client, fetchBookings: () => fetchBookingsWith(client) });
  return createBackupEnvelope(sections, { reason: "manual", sectionErrors });
}

// handleRestore, Merge: bookings, supporting sections, verification, then the Group Map.
async function mergeRestore(client, backup) {
  const live = await fetchBookingsWith(client);
  const liveById = new Map(live.map((booking) => [String(booking.id), booking]));
  const rows = backup.payload.bookings.map((booking) => keepRecordClassification(booking, liveById.get(String(booking.id))));
  await restoreBookingRows(rows, new Set(live.map((booking) => String(booking.id))), { client });
  if (backup.schemaVersion >= 2) await restoreSupportingSections(backup.payload, { client });
  return hasGroupMapSection(backup) ? restoreGroupMapSection(backup.payload, { client }) : null;
}

// handleRestore, Full Replace.
async function fullReplace(client, backup, { beforeDelete } = {}) {
  const bookingsToRestore = backup.payload.bookings;
  const originalBookings = await fetchBookingsWith(client);
  assert.equal(await countLiveSignatures(client), 0, "Full Replace refuses databases with signing records");
  const safety = await backupWith(client);
  assert.deepEqual(SUPPORTING_SECTION_KEYS.filter((key) => key in safety.coverage.sectionErrors), []);
  assert.equal(safety.coverage.sectionErrors.organizations, undefined, "the safety backup reads the Group Map too");
  const deleted = await must(client.from("bookings").delete().neq("id", "__never__").select("id"));
  assert.ok(deleted.length >= originalBookings.length, "every booking was deleted");
  await beforeDelete?.();
  const liveById = new Map(originalBookings.map((booking) => [String(booking.id), booking]));
  await restoreBookingRows(bookingsToRestore.map((booking) => keepRecordClassification(booking, liveById.get(String(booking.id)))), new Set(), { client });
  await restorePortalSnapshot(safety.payload, bookingsToRestore.map((booking) => booking.id), { client });
  await restoreSupportingSections(backup.payload, { client });
  const after = await fetchBookingsWith(client);
  assert.deepEqual(after.map((b) => b.id).sort(), bookingsToRestore.map((b) => b.id).sort(), "restore verification");
  return { safety, groupMap: hasGroupMapSection(backup) ? await restoreGroupMapSection(backup.payload, { client }) : null };
}

// Fictional groups made by this run, and helpers that only ever touch them.
const ours = new Set();
const name = (label) => `Fictional ${label} ${run}`;
async function create(label, parentId = null) {
  const row = await must(staff.rpc("group_map_create", { p_name: name(label), p_parent_id: parentId }));
  ours.add(row.id);
  return row;
}
const link = (bookingName, group) => must(staff.rpc("group_map_link_name", { p_name: bookingName, p_organization_id: group.id }));
const exported = async () => must(admin.rpc("group_map_export"));
const ourGroups = async () => (await exported()).organizations.filter((group) => ours.has(group.id));
const ourLinks = async () => (await exported()).links.filter((item) => ours.has(item.organization_id));
async function removeOurs() {
  for (const item of await ourLinks()) await must(staff.rpc("group_map_unlink_name", { p_name: item.name, p_organization_id: item.organization_id }));
  for (let pass = 0; pass < 6; pass += 1) {
    for (const group of await ourGroups()) await staff.rpc("group_map_delete", { p_id: group.id, p_version: group.version });
  }
  assert.equal((await ourGroups()).length, 0, "test groups removed");
}
// The Group Map section of a backup, limited to this run's groups.
const section = (backup) => ({
  organizations: backup.payload.organizations.filter((group) => ours.has(group.id)),
  organizationNameLinks: backup.payload.organizationNameLinks.filter((item) => ours.has(item.organization_id)),
});
const sortById = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

// Booking names on the stack to link (fictional).
const bookingNames = [...new Set((await fetchBookingsWith(admin)).map((booking) => booking.organizationName))].filter((value) => !/^Host/.test(value)).slice(0, 4);
assert.ok(bookingNames.length >= 3, "the stack has fictional bookings to link");
const linkName = (index) => bookingNames[index];
// Names linked by someone else before this run would make links clash; use names nobody linked.
const alreadyLinked = new Set((await exported()).links.map((item) => item.name));
assert.ok(bookingNames.slice(0, 3).every((value) => !alreadyLinked.has(value)), "booking names are free to link");

let national;
let region;
let chapter;
let small;
let solo;
let original;
await check("backup files carry a nested tree and its links (version 5), and verify", async () => {
  national = await create("National");
  region = await create("Region", national.id);
  chapter = await create("Chapter", region.id);
  small = await create("Small Group", chapter.id);
  solo = await create("Choir");
  await link(linkName(0), chapter);
  await link(linkName(1), national);
  await link(linkName(2), solo);
  original = await backupWith(admin);
  assert.equal(original.schemaVersion, 5);
  assert.deepEqual(validateBackupShape(original).errors, []);
  assert.equal((await verifyBackupIntegrity(original)).ok, true);
  const mine = section(original);
  assert.equal(mine.organizations.length, 5);
  assert.equal(mine.organizationNameLinks.length, 3);
  assert.equal(mine.organizations.find((group) => group.id === small.id).parent_id, chapter.id);
});

await check("viewers can back up the Group Map; limited and signed-out accounts can't read it", async () => {
  const fromViewer = await backupWith(viewer);
  assert.equal(fromViewer.coverage.sectionErrors.organizations, undefined);
  assert.equal(section(fromViewer).organizations.length, 5);
  await refused(cook.rpc("group_map_export"), "42501");
  await refused(anon.rpc("group_map_export"));
});

await check("round trip: delete the tree, restore it, and get the same ids, parents, names, timestamps and links", async () => {
  const before = { groups: sortById(await ourGroups()), links: await ourLinks() };
  await removeOurs();
  const result = await restoreGroupMapSection(section(original), { client: staff });
  assert.equal(result.groupsInserted, 5);
  assert.equal(result.linksInserted, 3);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(sortById(await ourGroups()), before.groups);
  assert.deepEqual(await ourLinks(), before.links);
});

await check("restoring the same backup again adds nothing and changes nothing", async () => {
  const before = sortById(await ourGroups());
  const result = await restoreGroupMapSection(section(original), { client: staff });
  assert.equal(result.groupsInserted + result.linksInserted, 0);
  assert.equal(result.groupsAlreadyPresent, 5);
  assert.equal(result.linksAlreadyPresent, 3);
  assert.deepEqual(sortById(await ourGroups()), before);
});

await check("conflicts: current names, parents and links win; clashes are skipped and reported, never merged", async () => {
  // Since the backup: region renamed, the choir deleted and a different group made with its name,
  // the national organization's booking name linked elsewhere, the small group deleted.
  const liveRegion = (await ourGroups()).find((group) => group.id === region.id);
  await must(staff.rpc("group_map_rename", { p_id: region.id, p_version: liveRegion.version, p_name: name("Region Renamed") }));
  await must(staff.rpc("group_map_unlink_name", { p_name: linkName(2), p_organization_id: solo.id }));
  const liveSolo = (await ourGroups()).find((group) => group.id === solo.id);
  await must(staff.rpc("group_map_delete", { p_id: solo.id, p_version: liveSolo.version }));
  const impostor = await create("choir"); // same name, ignoring case
  await must(staff.rpc("group_map_unlink_name", { p_name: linkName(1), p_organization_id: national.id }));
  await link(linkName(1), impostor);
  const liveSmall = (await ourGroups()).find((group) => group.id === small.id);
  await must(staff.rpc("group_map_delete", { p_id: small.id, p_version: liveSmall.version }));

  const live = { groups: await ourGroups(), links: await ourLinks() };
  const preview = planGroupMapRestore(section(original).organizations, section(original).organizationNameLinks, live);
  const result = await restoreGroupMapSection(section(original), { client: staff });
  for (const key of ["groupsInserted", "groupsAlreadyPresent", "groupsKeptCurrent", "groupsSkipped", "linksInserted", "linksAlreadyPresent", "linksKeptCurrent", "linksSkipped"]) {
    assert.equal(result[key], preview[key], `the preview predicted ${key}`);
  }
  assert.deepEqual(result.notes.map((note) => [note.name, note.outcome]).sort(), preview.notes.map((note) => [note.name, note.outcome]).sort());
  assert.equal(result.groupsInserted, 1, "only the deleted small group comes back");
  assert.equal(result.groupsSkipped, 1, "the choir clashes with the current group of that name");
  assert.equal(result.groupsKeptCurrent, 1, "the renamed region keeps its current name");
  assert.equal(result.linksKeptCurrent, 1, "the relinked name stays with its current group");
  assert.equal(result.linksSkipped, 1, "the choir's name has no group to go to");
  const after = await ourGroups();
  assert.equal(after.find((group) => group.id === region.id).name, name("Region Renamed"));
  assert.ok(!after.some((group) => group.id === solo.id), "no duplicate choir");
  assert.equal(after.find((group) => group.id === small.id).parent_id, chapter.id, "the small group is back under its chapter");
  assert.equal((await ourLinks()).find((item) => item.name === linkName(1)).organization_id, impostor.id);
});

await check("a file whose groups don't hold together is refused whole, even through a direct request", async () => {
  const before = { groups: sortById(await ourGroups()), links: await ourLinks() };
  const fresh = { id: randomUUID(), name: name("Would Be Added"), parent_id: null };
  const a = randomUUID();
  const b = randomUUID();
  const self = randomUUID();
  const bad = [
    [[fresh], [{ name: "Fictional ghost link", organization_id: randomUUID() }], /point to a group that is not in the backup/],
    [[fresh, { id: randomUUID(), name: name("Lost"), parent_id: randomUUID() }], [], /parent that is not in the backup/],
    [[fresh, { id: a, name: name("Loop A"), parent_id: b }, { id: b, name: name("Loop B"), parent_id: a }], [], /loop/],
    [[fresh, { id: self, name: name("Self"), parent_id: self }], [], /loop/],
    [[fresh, { ...fresh, id: randomUUID(), name: fresh.name.toUpperCase() }], [], /same name and parent/],
    [[fresh], [{ name: "Twice", organization_id: fresh.id }, { name: "Twice", organization_id: fresh.id }], /same booking name twice/],
    [[fresh, fresh], [], /same group twice/],
    [[fresh, { id: "not-a-uuid", name: "Bad" }], [], /malformed/],
    [[fresh, { id: randomUUID(), name: "  padded" }], [], /empty, padded/],
  ];
  for (const [organizations, links, pattern] of bad) {
    const error = await refused(staff.rpc("group_map_restore", { p_organizations: organizations, p_links: links }), "22023");
    assert.match(error.message, pattern);
  }
  await refused(staff.rpc("group_map_restore", { p_organizations: {}, p_links: [] }), "22023");
  const exportedNow = await exported();
  assert.ok(!exportedNow.organizations.some((group) => group.id === fresh.id), "the valid group in each refused file was not added");
  assert.deepEqual({ groups: sortById(await ourGroups()), links: await ourLinks() }, before);
});

await check("only admin and staff can restore groups", async () => {
  const fresh = { id: randomUUID(), name: name("Unauthorized"), parent_id: null };
  for (const client of [viewer, cook]) await refused(client.rpc("group_map_restore", { p_organizations: [fresh], p_links: [] }), "42501");
  await refused(anon.rpc("group_map_restore", { p_organizations: [fresh], p_links: [] }));
  assert.ok(!(await exported()).organizations.some((group) => group.id === fresh.id));
  await assert.rejects(restoreGroupMapSection({ organizations: [fresh] }, { client: viewer }), /Only admin and staff/);
});

await check("a restore racing a new group of the same name either adds it or adds nothing", async () => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const racer = { id: randomUUID(), name: name(`Race ${attempt}`), parent_id: null };
    const child = { id: randomUUID(), name: name(`Race child ${attempt}`), parent_id: racer.id };
    const [restore, made] = await Promise.all([
      staff.rpc("group_map_restore", { p_organizations: [racer, child], p_links: [] }),
      admin.rpc("group_map_create", { p_name: racer.name, p_parent_id: null }),
    ]);
    if (made.data) ours.add(made.data.id);
    const all = (await exported()).organizations;
    const sameName = all.filter((group) => group.name.toLowerCase() === racer.name.toLowerCase() && !group.parent_id);
    assert.equal(sameName.length, 1, "never two top-level groups with one name");
    if (restore.error) {
      assert.equal(restore.error.code, "55000");
      assert.ok(!all.some((group) => group.id === child.id), "a failed restore added nothing");
    } else {
      const restored = all.some((group) => group.id === racer.id);
      if (restored) ours.add(racer.id);
      if (all.some((group) => group.id === child.id)) ours.add(child.id);
      assert.equal(all.some((group) => group.id === child.id), restored, "child restored exactly when its parent was");
    }
  }
});

// Fresh backup of the current state, for the mode tests.
let modeBackup;
let expectedGroups;
await check("Merge: missing groups come back; groups made after the backup stay; bookings verify", async () => {
  modeBackup = await backupWith(admin);
  expectedGroups = sortById(await ourGroups());
  const later = await create("Made After Backup");
  const victim = expectedGroups.find((group) => group.id === small.id);
  await must(staff.rpc("group_map_delete", { p_id: victim.id, p_version: victim.version }));
  const result = await mergeRestore(staff, modeBackup);
  assert.equal(result.groupsInserted, 1);
  const after = await ourGroups();
  assert.ok(after.some((group) => group.id === small.id), "deleted group restored");
  assert.ok(after.some((group) => group.id === later.id), "a group made after the backup is kept");
});

await check("Full Replace: bookings replaced, change history kept, Group Map only added to, nothing lost", async () => {
  const historyBefore = (await must(seed.from("booking_change_log").select("id"))).length;
  const later = await create("Made Before Replace");
  const victim = (await ourGroups()).find((group) => group.id === small.id);
  await must(staff.rpc("group_map_delete", { p_id: victim.id, p_version: victim.version }));
  let groupsDuringDelete = null;
  const { safety, groupMap } = await fullReplace(admin, modeBackup, {
    beforeDelete: async () => { groupsDuringDelete = (await ourGroups()).length; },
  });
  assert.equal(groupsDuringDelete, (await ourGroups()).length - 1, "deleting every booking left every group in place");
  assert.equal(section(safety).organizations.length, groupsDuringDelete, "the safety backup holds the current Group Map");
  assert.equal(groupMap.groupsInserted, 1, "the deleted group is added back");
  const after = await ourGroups();
  assert.ok(after.some((group) => group.id === later.id), "a group made after the backup survives Full Replace");
  const expectedIds = new Set(expectedGroups.map((group) => group.id));
  assert.deepEqual(sortById(after.filter((group) => expectedIds.has(group.id))), expectedGroups, "the backup's groups are as they were");
  assert.equal((await must(seed.from("booking_change_log").select("id"))).length, historyBefore, "change history kept");
});

await check("an older (version 4) backup restores bookings and leaves the Group Map exactly as it is", async () => {
  const before = { groups: sortById(await ourGroups()), links: await ourLinks() };
  const { organizations, organizationNameLinks, ...older } = modeBackup.payload;
  assert.ok(organizations && organizationNameLinks);
  const v4 = { ...modeBackup, schemaVersion: 4, payload: older };
  assert.ok(validateBackupShape(v4).warnings.some((warning) => /leaves the current groups/.test(warning)));
  assert.equal(await mergeRestore(staff, v4), null, "no Group Map step");
  const { groupMap } = await fullReplace(admin, v4);
  assert.equal(groupMap, null);
  assert.deepEqual({ groups: sortById(await ourGroups()), links: await ourLinks() }, before);
});

await removeOurs();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
