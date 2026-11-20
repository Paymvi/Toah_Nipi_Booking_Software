import test from "node:test";
import assert from "node:assert/strict";

import { buildGroupMapDraft, draftToBuild, nameKey } from "../src/utils/groupMapDraft.js";

// Fictional names only.
const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const unlinked = [
  { name: "Grace Church", count: 3 },
  { name: "grace church.", count: 1 },
  { name: "The Grace Church", count: 1 },
  { name: "InterVarsity Rutgers", count: 2 },
  { name: "InterVarsity Penn State", count: 4 },
  { name: "Intervarsity  Penn State", count: 1 },
  { name: "First Baptist Albany", count: 1 },
  { name: "First Baptist Troy", count: 1 },
  { name: "Lakeside Seniors", count: 1 },
  { name: "Maple Quilters", count: 2 },
  { name: "---", count: 1 },
];

test("names that differ only in case, spacing, punctuation or a leading 'The' share a key", () => {
  assert.equal(nameKey("The  Grace Church."), "grace church");
  assert.equal(nameKey("Grace & Truth"), nameKey("grace and truth"));
  assert.notEqual(nameKey("Grace Church Albany"), nameKey("Grace Church"));
});

test("one group per name, spelling variants together, busiest spelling as the name", () => {
  const draft = buildGroupMapDraft(unlinked, [], { makeId: counter() });
  const grace = draft.groups.find((group) => group.key === "grace church");
  assert.equal(grace.name, "Grace Church");
  assert.deepEqual(grace.names.map((item) => item.name), ["Grace Church", "The Grace Church", "grace church."]);
  assert.equal(grace.count, 5);
  const penn = draft.groups.find((group) => group.key === "intervarsity penn state");
  assert.equal(penn.name, "InterVarsity Penn State");
  assert.equal(draft.groups.length, 7);
  assert.deepEqual(draft.leftOut.map((item) => item.name), ["---"]);
});

test("parent guesses from shared leading words, never from generic ones", () => {
  const draft = buildGroupMapDraft(unlinked, [], { makeId: counter() });
  assert.deepEqual(draft.parents.map((parent) => [parent.name, parent.memberKeys.sort()]), [
    ["InterVarsity", ["intervarsity penn state", "intervarsity rutgers"]],
  ]);
  assert.ok(draft.parents[0].id, "a new parent group");
});

test("a name that is exactly the shared words becomes the parent itself", () => {
  const draft = buildGroupMapDraft([...unlinked, { name: "InterVarsity", count: 1 }], [], { makeId: counter() });
  const parent = draft.parents[0];
  assert.equal(parent.fromKey, "intervarsity");
  assert.equal(parent.id, null);
  const { groups } = draftToBuild(draft);
  const own = groups.find((group) => group.name === "InterVarsity");
  assert.equal(groups.find((group) => group.name === "InterVarsity Rutgers").parent_id, own.id);
  assert.equal(groups.filter((group) => group.name === "InterVarsity").length, 1, "no second InterVarsity group");
});

test("names matching an existing group join it; existing groups are never recreated or moved", () => {
  const existing = [
    { id: "g-maple", name: "Maple Quilters", parent_id: "g-other" },
    { id: "g-iv", name: "InterVarsity", parent_id: null },
  ];
  const draft = buildGroupMapDraft(unlinked, existing, { makeId: counter() });
  const maple = draft.groups.find((group) => group.key === "maple quilters");
  assert.equal(maple.existingId, "g-maple");
  assert.equal(maple.id, null);
  assert.equal(draft.parents[0].existingId, "g-iv", "the existing InterVarsity is the guessed parent");
  const { groups, links } = draftToBuild(draft);
  assert.ok(!groups.some((group) => group.id === "g-maple" || group.id === "g-iv"));
  assert.ok(links.some((link) => link.name === "Maple Quilters" && link.organization_id === "g-maple"));
  assert.equal(groups.find((group) => group.name === "InterVarsity Rutgers").parent_id, "g-iv");
});

test("a name matching two existing groups is left out for staff to link by hand", () => {
  const existing = [
    { id: "g1", name: "Lakeside Seniors", parent_id: "a" },
    { id: "g2", name: "lakeside seniors", parent_id: "b" },
  ];
  const draft = buildGroupMapDraft(unlinked, existing, { makeId: counter() });
  assert.ok(!draft.groups.some((group) => group.key === "lakeside seniors"));
  assert.match(draft.leftOut.find((item) => item.name === "Lakeside Seniors").reason, /more than one existing group/);
});

test("staff choices: a skipped group stays unlinked, a skipped guess leaves its groups top-level", () => {
  const draft = buildGroupMapDraft(unlinked, [], { makeId: counter() });
  const all = draftToBuild(draft);
  assert.equal(all.groups.length, 8, "7 groups plus the InterVarsity parent");
  assert.equal(all.links.length, 10);

  const noGuess = draftToBuild(draft, { skippedParents: new Set([0]) });
  assert.equal(noGuess.groups.length, 7);
  assert.ok(noGuess.groups.every((group) => group.parent_id === null));

  const noGrace = draftToBuild(draft, { skippedKeys: new Set(["grace church"]) });
  assert.ok(!noGrace.links.some((link) => /grace/i.test(link.name)));

  // Skipping all but one member keeps the parent for that one; skipping all drops it.
  const one = draftToBuild(draft, { skippedKeys: new Set(["intervarsity rutgers"]) });
  assert.ok(one.groups.some((group) => group.name === "InterVarsity"));
  const none = draftToBuild(draft, { skippedKeys: new Set(["intervarsity rutgers", "intervarsity penn state"]) });
  assert.ok(!none.groups.some((group) => group.name === "InterVarsity"));
});

test("between equally used spellings, the tidiest names the group and its parent", () => {
  const draft = buildGroupMapDraft([
    { name: "  fellowship of fictional penn.", count: 1 },
    { name: "Fellowship Of Fictional Penn", count: 1 },
    { name: "Fictionalia Rutgers", count: 1 },
    { name: "fictionalia penn.", count: 2 },
    { name: "Fictionalia Penn", count: 2 },
  ], [], { makeId: counter() });
  assert.equal(draft.groups.find((group) => group.key === "fellowship of fictional penn").name, "Fellowship Of Fictional Penn");
  assert.equal(draft.groups.find((group) => group.key === "fictionalia penn").name, "Fictionalia Penn");
  assert.equal(draft.parents[0].name, "Fictionalia");
});

test("long names are cut to the 200 characters a group name allows", () => {
  const draft = buildGroupMapDraft([{ name: `Fictional ${"x".repeat(300)}`, count: 1 }], [], { makeId: counter() });
  assert.equal(draft.groups[0].name.length, 200);
  assert.equal(draft.groups[0].names[0].name.length, 310, "the booking name itself is linked unchanged");
});
