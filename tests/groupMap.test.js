import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGroupIndex,
  getBookingCounts,
  getDirectBookings,
  getGroupPath,
  getKeyboardMove,
  getParentOptions,
  getUnlinkedNames,
  layoutGroupMap,
  searchGroups,
  suggestNames,
} from "../src/utils/groupMap.js";

// Fictional groups only.
const groups = [
  { id: "nat", name: "Fictional Fellowship", parent_id: null, version: 1 },
  { id: "reg", name: "Northeast Region", parent_id: "nat", version: 1 },
  { id: "chap", name: "Lakeside Chapter", parent_id: "reg", version: 1 },
  { id: "small", name: "Tuesday Small Group", parent_id: "chap", version: 1 },
  { id: "south", name: "Southern Region", parent_id: "nat", version: 1 },
  { id: "solo", name: "Hilltop Choir", parent_id: null, version: 1 },
  { id: "orphan", name: "Orphaned Group", parent_id: "deleted-meanwhile", version: 1 },
];
const links = [
  { name: "Lakeside Fellowship", organization_id: "chap" },
  { name: "LAKESIDE FELLOWSHIP ", organization_id: "chap" },
  { name: "Fictional Fellowship HQ", organization_id: "nat" },
  { name: "Ghost name", organization_id: "missing" },
];
const bookings = [
  { id: "b1", organizationName: "Lakeside Fellowship", retreatType: "Church" },
  { id: "b2", organizationName: "LAKESIDE FELLOWSHIP ", retreatType: "Church" },
  { id: "b3", organizationName: "Fictional Fellowship HQ", retreatType: "Church" },
  { id: "b4", organizationName: "Hilltop Choir Spring", retreatType: "Church" },
  { id: "b5", organizationName: "Hilltop Choir Spring", retreatType: "Church" },
  { id: "b6", organizationName: "Host: Fictional Board", retreatType: "Church" },
  { id: "b7", organizationName: "Unnamed Organization", retreatType: "Church" },
];
const index = buildGroupIndex(groups, links, bookings);

test("tree: roots, children, missing parent becomes top-level, path", () => {
  assert.deepEqual(index.roots.map((group) => group.id), ["nat", "solo", "orphan"]);
  assert.deepEqual(index.childrenOf.get("nat").map((group) => group.id), ["reg", "south"]);
  assert.equal(getGroupPath(index, "small"), "Fictional Fellowship › Northeast Region › Lakeside Chapter › Tuesday Small Group");
});

test("direct bookings never include subgroups; totals say so separately", () => {
  assert.deepEqual(getDirectBookings(index, "nat").map((booking) => booking.id), ["b3"]);
  assert.deepEqual(getBookingCounts(index, "nat"), { direct: 1, withSubgroups: 3 });
  assert.deepEqual(getBookingCounts(index, "chap"), { direct: 2, withSubgroups: 2 });
  assert.deepEqual(getBookingCounts(index, "small"), { direct: 0, withSubgroups: 0 });
});

test("unlinked names leave out linked, hosting and placeholder names; links to unknown groups are ignored", () => {
  assert.deepEqual(getUnlinkedNames(index), [{ name: "Hilltop Choir Spring", count: 2 }]);
  assert.equal(index.groupOfName.has("Ghost name"), false);
});

test("a group can't be offered itself or its own subgroups as parent", () => {
  const ids = getParentOptions(index, "reg").map((option) => option.id);
  assert.ok(!ids.includes("reg") && !ids.includes("chap") && !ids.includes("small"));
  assert.ok(ids.includes("nat") && ids.includes("south") && ids.includes("solo"));
});

test("suggestions need every meaningful word and never touch data", () => {
  const unlinked = getUnlinkedNames(index);
  assert.deepEqual(suggestNames("Hilltop Choir", unlinked).map((item) => item.name), ["Hilltop Choir Spring"]);
  assert.deepEqual(suggestNames("Hilltop Band", unlinked), []);
  assert.deepEqual(suggestNames("The Group", unlinked), []);
});

test("search matches group names and linked names, prefix first", () => {
  assert.deepEqual(searchGroups(index, "region").map((group) => group.id), ["reg", "south"]);
  assert.deepEqual(searchGroups(index, "lakeside").map((group) => group.id), ["chap"]);
  assert.deepEqual(searchGroups(index, "  "), []);
});

test("layout: families left to right, singles in a grid, collapse and focus", () => {
  const full = layoutGroupMap(index);
  const at = (layout, id) => layout.nodes.find((node) => node.id === id);
  assert.equal(full.nodes.length, groups.length);
  assert.ok(at(full, "reg").x > at(full, "nat").x && at(full, "chap").x > at(full, "reg").x);
  assert.ok(at(full, "solo").single && at(full, "solo").y > at(full, "small").y);
  assert.equal(full.edges.length, 4);

  const collapsed = layoutGroupMap(index, { collapsed: new Set(["reg"]) });
  assert.equal(collapsed.nodes.length, groups.length - 2);
  assert.equal(at(collapsed, "reg").hiddenCount, 2);

  const focused = layoutGroupMap(index, { focusId: "reg" });
  assert.deepEqual(focused.order, ["reg", "chap", "small"]);
  assert.equal(at(focused, "reg").x, 0);

  // Same input, same positions: exploring doesn't reshuffle.
  assert.deepEqual(layoutGroupMap(index).nodes.map(({ x, y }) => [x, y]), full.nodes.map(({ x, y }) => [x, y]));
});

test("keyboard: arrows move through visible order, left/right collapse, expand and go to parent", () => {
  const collapsed = new Set();
  const { order } = layoutGroupMap(index);
  assert.deepEqual(getKeyboardMove(index, order, collapsed, "nat", "ArrowDown"), { select: "reg" });
  assert.deepEqual(getKeyboardMove(index, order, collapsed, "nat", "ArrowRight"), { select: "reg" });
  assert.deepEqual(getKeyboardMove(index, order, collapsed, "reg", "ArrowLeft"), { toggle: "reg" });
  assert.deepEqual(getKeyboardMove(index, order, new Set(["reg"]), "reg", "ArrowRight"), { toggle: "reg" });
  assert.deepEqual(getKeyboardMove(index, order, collapsed, "small", "ArrowLeft"), { select: "chap" });
  assert.equal(getKeyboardMove(index, order, collapsed, "solo", "ArrowLeft"), null);
});

test("data layer: missing tables ask for setup; stale and permission errors keep the database's wording", async () => {
  const { loadGroupMap, renameGroup } = await import("../src/services/groupMap.js");
  const failing = (error) => ({
    from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error }) }) }) }),
    rpc: async () => ({ data: null, error }),
  });
  await assert.rejects(loadGroupMap(failing({ code: "PGRST205", message: "missing" })), (error) => error.setupNeeded === true);
  const group = { id: "g", version: 3 };
  await assert.rejects(renameGroup(failing({ code: "55000", message: "Someone else changed it." }), group, "x"),
    (error) => error.stale && error.message === "Someone else changed it.");
  await assert.rejects(renameGroup(failing({ code: "42501", message: "Only admin and staff accounts can change groups." }), group, "x"),
    (error) => !error.stale && /Only admin and staff/.test(error.message));
  await assert.rejects(renameGroup(failing({ code: "XX000", message: "boom" }), group, "x"), (error) => error.message === "Could not save: boom");
});
