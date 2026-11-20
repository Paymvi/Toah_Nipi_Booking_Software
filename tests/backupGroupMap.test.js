import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  createBackupEnvelope,
  describeGroupMapNote,
  planGroupMapRestore,
  validateBackupShape,
  validateGroupMapSection,
  verifyBackupIntegrity,
} from "../src/utils/backupFormat.js";
import { fetchBackupSections, restoreGroupMapSection } from "../src/services/backupData.js";

const sha = async (text) => createHash("sha256").update(text).digest("hex");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Fictional three-level tree plus an independent group.
const NATIONAL = { id: id(1), name: "Fictional Fellowship", parent_id: null, version: 2 };
const REGION = { id: id(2), name: "Fictional Region", parent_id: id(1), version: 1 };
const CHAPTER = { id: id(3), name: "Fictional Chapter", parent_id: id(2), version: 1 };
const SOLO = { id: id(4), name: "Fictional Choir", parent_id: null, version: 1 };
const groups = [NATIONAL, REGION, CHAPTER, SOLO];
const links = [
  { name: "Chapter Retreat", organization_id: id(3) },
  { name: "Fellowship HQ", organization_id: id(1) },
  { name: "Choir Weekend", organization_id: id(4) },
];

test("version 5 backups carry the Group Map, verify, and detect tampering in it", async () => {
  const backup = await createBackupEnvelope(
    { bookings: [{ id: "b1" }], organizations: groups, organizationNameLinks: links },
    { hash: sha }
  );
  assert.equal(backup.schemaVersion, 5);
  assert.equal(backup.summary.organizationCount, 4);
  assert.equal(backup.summary.organizationNameLinkCount, 3);
  assert.deepEqual(validateBackupShape(backup).errors, []);
  assert.ok(!validateBackupShape(backup).warnings.some((warning) => /Group Map/.test(warning)));
  assert.equal((await verifyBackupIntegrity(backup, sha)).ok, true);

  const renamed = structuredClone(backup);
  renamed.payload.organizations[2].name = "Edited";
  assert.equal((await verifyBackupIntegrity(renamed, sha)).ok, false);
  const moved = structuredClone(backup);
  moved.payload.organizations[2].parent_id = id(1);
  assert.equal((await verifyBackupIntegrity(moved, sha)).ok, false);
  const relinked = structuredClone(backup);
  relinked.payload.organizationNameLinks[0].organization_id = id(4);
  assert.equal((await verifyBackupIntegrity(relinked, sha)).ok, false);
});

test("older backups say the Group Map is left exactly as it is", async () => {
  for (const schemaVersion of [1, 2, 3, 4]) {
    const payload = { bookings: [{ id: "b1" }] };
    const backup = { format: "toah-nipi-booking-backup", schemaVersion, integrity: { checksum: "x" }, payload };
    const { errors, warnings } = validateBackupShape(backup);
    assert.deepEqual(errors, [], `version ${schemaVersion}`);
    assert.ok(warnings.some((warning) => /leaves the current groups, parents and linked names exactly as they are/.test(warning)));
  }
});

test("a Group Map section that doesn't hold together blocks the whole restore", async () => {
  const cases = [
    [[...groups], [...links, { name: "Ghost", organization_id: id(99) }], /point to a group that is not in the backup/],
    [[...groups, { id: id(5), name: "Lost", parent_id: id(98) }], links, /point to a parent that is not in the backup/],
    [[...groups, { id: id(6), name: "Loop A", parent_id: id(7) }, { id: id(7), name: "Loop B", parent_id: id(6) }], links, /loop/],
    [[...groups, { id: id(8), name: "Self", parent_id: id(8) }], links, /loop/],
    [[...groups, { id: id(9), name: "fictional region", parent_id: id(1) }], links, /same name and parent/],
    [groups, [...links, { name: "Chapter Retreat", organization_id: id(4) }], /same booking name twice/],
    [[...groups, { id: "not-a-uuid", name: "Bad", parent_id: null }], links, /malformed id or name/],
    [[...groups, { id: id(10), name: " Padded", parent_id: null }], links, /malformed id or name/],
  ];
  for (const [organizations, organizationNameLinks, pattern] of cases) {
    assert.ok(validateGroupMapSection(organizations, organizationNameLinks).some((error) => pattern.test(error)), String(pattern));
    const backup = await createBackupEnvelope({ bookings: [{ id: "b1" }], organizations, organizationNameLinks }, { hash: sha });
    assert.ok(validateBackupShape(backup).errors.length > 0, `blocked: ${pattern}`);
  }
  assert.deepEqual(validateGroupMapSection(groups, links), []);
  // Duplicate group ids are caught by the general duplicate-id check.
  const twice = await createBackupEnvelope({ bookings: [{ id: "b1" }], organizations: [...groups, NATIONAL] }, { hash: sha });
  assert.ok(validateBackupShape(twice).errors.some((error) => /duplicate group map groups id/i.test(error)));
});

test("restore plan: an empty Group Map gets the whole tree, a second restore adds nothing", () => {
  const first = planGroupMapRestore(groups, links, { groups: [], links: [] });
  assert.equal(first.groupsInserted, 4);
  assert.equal(first.linksInserted, 3);
  assert.deepEqual(first.notes, []);
  const again = planGroupMapRestore(groups, links, { groups, links });
  assert.equal(again.groupsInserted + again.linksInserted, 0);
  assert.equal(again.groupsAlreadyPresent, 4);
  assert.equal(again.linksAlreadyPresent, 3);
});

test("restore plan: current groups and links win; clashes are skipped and explained, never merged", () => {
  const live = {
    // REGION was renamed since the backup, and a different top-level group now has the choir's name.
    groups: [NATIONAL, { ...REGION, name: "Fictional Northeast" }, { id: id(20), name: "fictional choir", parent_id: null }],
    links: [{ name: "Fellowship HQ", organization_id: id(20) }],
  };
  const plan = planGroupMapRestore(groups, links, live);
  assert.equal(plan.groupsAlreadyPresent, 2);
  assert.equal(plan.groupsKeptCurrent, 1);
  assert.equal(plan.groupsInserted, 1, "the chapter goes under its (current) region");
  assert.equal(plan.groupsSkipped, 1, "the choir clashes with a current group of the same name");
  assert.equal(plan.linksInserted, 1);
  assert.equal(plan.linksKeptCurrent, 1);
  assert.equal(plan.linksSkipped, 1, "the choir's link has no group to go to");
  const text = plan.notes.map(describeGroupMapNote).join("\n");
  assert.match(text, /"Fictional Region" already exists here as "Fictional Northeast".*current version is kept/);
  assert.match(text, /"Fictional Choir" was not added because a current group at that level already has this name/);
  assert.match(text, /"Fellowship HQ" is already linked to "fictional choir"; that link is kept/);
  assert.match(text, /"Choir Weekend" was not linked because its group was not restored/);
});

test("restore plan: subgroups of a group that can't be added are skipped too", () => {
  const live = { groups: [{ id: id(30), name: "Fictional Fellowship", parent_id: null }], links: [] };
  const plan = planGroupMapRestore(groups, links, live);
  assert.equal(plan.groupsInserted, 1, "only the independent choir");
  assert.deepEqual(
    plan.notes.filter((note) => note.kind === "group").map((note) => [note.name, note.outcome]),
    [["Fictional Fellowship", "name-in-use"], ["Fictional Region", "parent-not-restored"], ["Fictional Chapter", "parent-not-restored"]]
  );
});

// The client used by fetchBackupSections: tables answer empty, rpc as given.
function client(rpc) {
  const calls = [];
  return {
    calls,
    from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
    async rpc(name, args) {
      calls.push({ name, args });
      return rpc(name, args);
    },
  };
}

test("backups read groups and links together through group_map_export", async () => {
  const reader = client(async () => ({ data: { organizations: groups, links }, error: null }));
  const { sections, sectionErrors } = await fetchBackupSections({ client: reader, fetchBookings: async () => [] });
  assert.deepEqual(sections.organizations, groups);
  assert.deepEqual(sections.organizationNameLinks, links);
  assert.deepEqual(sectionErrors, {});
  assert.deepEqual(reader.calls.map((call) => call.name), ["group_map_export"]);
});

test("a database without the Group Map backs up empty sections without a warning; other failures are named", async () => {
  const missing = await fetchBackupSections({
    client: client(async () => ({ data: null, error: { code: "PGRST202", message: "not found" } })),
    fetchBookings: async () => [],
  });
  assert.deepEqual(missing.sections.organizations, []);
  assert.deepEqual(missing.sectionErrors, {});

  const refused = await fetchBackupSections({
    client: client(async () => ({ data: null, error: { code: "42501", message: "Only office staff accounts can back up groups." } })),
    fetchBookings: async () => [],
  });
  assert.match(refused.sectionErrors.organizations, /Only office staff/);
  const backup = await createBackupEnvelope(refused.sections, { hash: sha, sectionErrors: refused.sectionErrors });
  assert.ok(validateBackupShape(backup).warnings.some((warning) => /Group Map groups could not be read/.test(warning)));
});

test("restoring sends the section in one call and reports the database's answer", async () => {
  const answer = { groupsInBackup: 4, groupsInserted: 4, groupsAlreadyPresent: 0, groupsKeptCurrent: 0, groupsSkipped: 0,
    linksInBackup: 3, linksInserted: 3, linksAlreadyPresent: 0, linksKeptCurrent: 0, linksSkipped: 0, notes: [] };
  const writer = client(async () => ({ data: answer, error: null }));
  const result = await restoreGroupMapSection({ organizations: groups, organizationNameLinks: links }, { client: writer });
  assert.equal(result.groupsInserted, 4);
  assert.deepEqual(writer.calls, [{ name: "group_map_restore", args: { p_organizations: groups, p_links: links } }]);

  const empty = client(async () => assert.fail("no call for an empty section"));
  assert.equal((await restoreGroupMapSection({}, { client: empty })).groupsInserted, 0);

  await assert.rejects(
    restoreGroupMapSection({ organizations: groups }, { client: client(async () => ({ data: null, error: { code: "PGRST202" } })) }),
    /doesn't have the Group Map yet/
  );
  await assert.rejects(
    restoreGroupMapSection({ organizations: groups }, { client: client(async () => ({ data: null, error: { code: "22023", message: "Nothing in the Group Map was restored." } })) }),
    /Nothing in the Group Map was restored/
  );
});

/*
  The contract for a scheduled job (the external Google Apps Script) that adds
  the Group Map: a version 5 envelope holding bookings and the Group Map only,
  listing exactly those in coverage.sections, checksummed over every version 5
  key in order (the others as empty arrays). The script itself is not in this
  repository; this fixture is what the app must accept from it.
*/
async function scheduledStyleFile(bookings, organizations, organizationNameLinks) {
  const payload = {
    bookings, guestInquiries: [], portalChecklistItems: [], portalDocuments: [], portalSignatures: [],
    bookingChangeLog: [], organizations, organizationNameLinks, storageManifest: [],
  };
  return {
    format: "toah-nipi-booking-backup",
    schemaVersion: 5,
    createdAt: "2026-11-20T06:00:00.000Z",
    reason: "scheduled-daily",
    coverage: { sections: ["bookings", "organizations", "organizationNameLinks"], sectionErrors: {} },
    integrity: { algorithm: "SHA-256", checksum: await sha(JSON.stringify(payload)) },
    payload,
  };
}

test("a scheduled bookings + Group Map file validates, and says plainly what it leaves out", async () => {
  const file = await scheduledStyleFile([{ id: "b1" }], groups, links);
  const { errors, warnings } = validateBackupShape(file);
  assert.deepEqual(errors, []);
  assert.equal((await verifyBackupIntegrity(file, sha)).ok, true);
  const gap = warnings.find((warning) => /made without/.test(warning));
  assert.match(gap, /website inquiries, portal tasks, portal documents, online signing records, booking change history/);
  assert.doesNotMatch(gap, /group map/i, "the Group Map is covered");
  assert.equal(planGroupMapRestore(file.payload.organizations, file.payload.organizationNameLinks).groupsInserted, 4);

  // A dashboard backup lists every section, so it carries no such warning.
  const full = await createBackupEnvelope({ bookings: [{ id: "b1" }], organizations: groups, organizationNameLinks: links }, { hash: sha });
  assert.ok(!validateBackupShape(full).warnings.some((warning) => /made without|doesn't say which sections/.test(warning)));

  // No coverage list: warned, never taken for complete.
  const unlabeled = structuredClone(file);
  delete unlabeled.coverage;
  assert.ok(validateBackupShape(unlabeled).warnings.some((warning) => /doesn't say which sections/.test(warning)));

  // A broken Group Map from the job blocks the restore like any other file.
  const broken = await scheduledStyleFile([{ id: "b1" }], groups, [...links, { name: "Ghost", organization_id: id(99) }]);
  assert.ok(validateBackupShape(broken).errors.some((error) => /not in the backup/.test(error)));
});
