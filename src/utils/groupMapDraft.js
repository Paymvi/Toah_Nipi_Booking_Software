/*
  "Build automatically" for the Group Map (docs/GROUP_MAP.md). Turns the
  booking names no group claims yet into a draft that staff review before
  anything is saved:

  1. One group per booking name.
  2. Spelling variants of one name ("Grace Church", "grace church.") share a
     group. A name matching a group that already exists is linked to it.
  3. Parent guesses: groups whose names start with the same words
     ("InterVarsity Rutgers", "InterVarsity Penn State") go under a parent
     with those words ("InterVarsity"). Always marked as guesses.

  Existing groups are never changed. No React, no database.
*/

// Leading words too common to say two names belong together ("First Baptist Albany" / "First Baptist Troy").
const GENERIC_FIRST_WORDS = new Set([
  "a", "an", "and", "of", "the", "first", "second", "third", "st", "saint", "new", "old", "north", "south",
  "east", "west", "central", "united", "church", "camp", "youth", "family", "families", "women", "womens",
  "men", "mens", "group", "retreat", "ministry", "ministries", "fellowship", "community", "christian",
  "baptist", "holy", "trinity", "grace", "faith", "hope", "living", "life", "calvary", "bible", "host", "hosting",
]);

const MAX_NAME = 200;

// "The  Grace Church." → "grace church"
export function nameKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/\s+/g, " ");
}

const cleanName = (name) => String(name).replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();

// Between equally used spellings, the tidiest: no stray spaces or end punctuation, then more capitals.
const tidiness = (name) =>
  (name === cleanName(name) ? 2000 : 0) + (/[\p{L}\p{N})]$/u.test(name) ? 1000 : 0) + (name.match(/\p{Lu}/gu) || []).length;
const byUseThenTidiness = (a, b) => b.count - a.count || tidiness(b.name) - tidiness(a.name) || a.name.localeCompare(b.name);

/*
  unlinkedNames: [{ name, count }] (getUnlinkedNames). existingGroups: the
  current organizations rows. makeId: id for each new group (the browser's
  crypto.randomUUID). Returns:
    groups:  [{ key, id, name, names: [{ name, count }], count, existingId }]
             existingId set: these names join that existing group (id null).
    parents: [{ id, name, existingId, fromKey, memberKeys }] parent guesses.
             existingId: an existing group is the parent; fromKey: one of the
             draft's own groups is; otherwise id is a new parent group.
    leftOut: [{ name, reason }] names the draft can't place safely.
*/
export function buildGroupMapDraft(unlinkedNames, existingGroups = [], { makeId }) {
  const existingByKey = new Map();
  const ambiguous = new Set();
  existingGroups.forEach((group) => {
    const key = nameKey(group.name);
    if (existingByKey.has(key)) ambiguous.add(key);
    existingByKey.set(key, group);
  });
  ambiguous.forEach((key) => existingByKey.delete(key));

  const clusters = new Map();
  const leftOut = [];
  unlinkedNames.forEach((item) => {
    const key = nameKey(item.name);
    if (!key) {
      leftOut.push({ name: item.name, reason: "has no letters or numbers to name a group with" });
      return;
    }
    if (ambiguous.has(key)) {
      leftOut.push({ name: item.name, reason: "matches more than one existing group; link it by hand" });
      return;
    }
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(item);
  });

  const groups = [...clusters.entries()].map(([key, names]) => {
    const sorted = [...names].sort(byUseThenTidiness);
    const existing = existingByKey.get(key);
    return {
      key,
      id: existing ? null : makeId(),
      name: existing ? existing.name : cleanName(sorted[0].name),
      names: sorted,
      count: sorted.reduce((total, item) => total + item.count, 0),
      existingId: existing?.id ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { groups, parents: guessParents(groups, existingByKey, ambiguous, makeId), leftOut };
}

const commonPrefix = (lists) => {
  const prefix = [];
  for (let index = 0; lists.every((words) => index < words.length && words[index] === lists[0][index]); index += 1) {
    prefix.push(lists[0][index]);
  }
  return prefix;
};

function guessParents(groups, existingByKey, ambiguous, makeId) {
  const byFirstWord = new Map();
  groups.filter((group) => !group.existingId).forEach((group) => {
    const first = group.key.split(" ")[0];
    if (first.length < 3 || GENERIC_FIRST_WORDS.has(first) || /^\d+$/.test(first)) return;
    if (!byFirstWord.has(first)) byFirstWord.set(first, []);
    byFirstWord.get(first).push(group);
  });

  const parents = [];
  byFirstWord.forEach((members) => {
    if (members.length < 2) return;
    const prefix = commonPrefix(members.map((group) => group.key.split(" ")));
    const prefixKey = prefix.join(" ");
    if (ambiguous.has(prefixKey)) return;
    // A member that is exactly the shared words is the parent itself ("InterVarsity").
    const self = members.find((group) => group.key === prefixKey);
    const children = members.filter((group) => group !== self);
    if (children.length < (self ? 1 : 2)) return;
    const existing = self ? null : existingByKey.get(prefixKey);
    // Parent name in the members' own spelling: the leading words of the busiest member.
    const busiest = [...children].sort((a, b) => b.count - a.count || tidiness(b.name) - tidiness(a.name))[0];
    parents.push({
      id: self || existing ? null : makeId(),
      name: self ? self.name : existing ? existing.name : cleanName(busiest.name.split(/\s+/).slice(0, prefix.length).join(" ")),
      existingId: existing?.id ?? null,
      fromKey: self?.key ?? null,
      memberKeys: children.map((group) => group.key),
    });
  });
  return parents.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/*
  The group_map_apply_build arguments, from the draft and the staff's choices:
  skippedKeys are draft groups to leave out (their names stay unlinked);
  skippedParents are parent guesses (indexes into draft.parents) not to use.
*/
export function draftToBuild(draft, { skippedKeys = new Set(), skippedParents = new Set() } = {}) {
  const byKey = new Map(draft.groups.map((group) => [group.key, group]));
  const parentOf = new Map();
  const groups = [];
  draft.parents.forEach((parent, index) => {
    if (skippedParents.has(index) || (parent.fromKey && skippedKeys.has(parent.fromKey))) return;
    const members = parent.memberKeys.filter((key) => !skippedKeys.has(key));
    if (!members.length) return;
    if (parent.id) groups.push({ id: parent.id, name: parent.name, parent_id: null });
    const parentId = parent.existingId || (parent.fromKey ? byKey.get(parent.fromKey).id : parent.id);
    members.forEach((key) => parentOf.set(key, parentId));
  });

  const links = [];
  draft.groups.forEach((group) => {
    if (skippedKeys.has(group.key)) return;
    if (group.id) groups.push({ id: group.id, name: group.name, parent_id: parentOf.get(group.key) ?? null });
    group.names.forEach((item) => links.push({ name: item.name, organization_id: group.existingId || group.id }));
  });
  return { groups, links };
}
