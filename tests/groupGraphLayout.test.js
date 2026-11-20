import test from "node:test";
import assert from "node:assert/strict";

import { createGraph, graphBounds, graphRadius, settleGraph, tickGraph, ALPHA_MIN } from "../src/utils/groupGraphLayout.js";

// Fictional: two families and a scatter of single groups.
const ids = ["p1", "c1", "c2", "c3", "p2", "d1", "d2", ...Array.from({ length: 40 }, (_, i) => `s${i}`)];
const edges = [
  { from: "p1", to: "c1" }, { from: "p1", to: "c2" }, { from: "p1", to: "c3" },
  { from: "p2", to: "d1" }, { from: "p2", to: "d2" },
];
const parentOf = new Map(edges.map(({ from, to }) => [to, from]));
const distance = (graph, a, b) => Math.hypot(graph.byId.get(a).x - graph.byId.get(b).x, graph.byId.get(a).y - graph.byId.get(b).y);

test("it settles and stops, with real numbers everywhere", () => {
  const graph = settleGraph(createGraph(ids, { parentOf, radiusOf: () => 8 }), edges);
  assert.ok(graph.alpha <= ALPHA_MIN, "cooled down");
  assert.equal(tickGraph(graph, edges), false, "no more steps wanted");
  assert.ok(graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test("each subgroup sits nearer its own parent than the other family's, and nearer than loose groups", () => {
  const graph = settleGraph(createGraph(ids, { parentOf, radiusOf: () => 8 }), edges);
  edges.forEach(({ from, to }) => {
    const other = from === "p1" ? "p2" : "p1";
    assert.ok(distance(graph, to, from) < distance(graph, to, other), `${to}: own parent nearer than ${other}`);
  });
  const linked = edges.reduce((total, { from, to }) => total + distance(graph, from, to), 0) / edges.length;
  const singles = ids.filter((id) => id.startsWith("s"));
  const loose = singles.reduce((total, id) => total + distance(graph, "p1", id), 0) / singles.length;
  assert.ok(linked < loose, `average line ${Math.round(linked)}px vs loose groups ${Math.round(loose)}px from a parent`);
});

test("circles don't overlap once settled", () => {
  const graph = settleGraph(createGraph(ids, { parentOf, radiusOf: (id) => (id.startsWith("p") ? 14 : 8) }), edges, 800);
  let worst = 0;
  graph.nodes.forEach((a, i) => graph.nodes.slice(i + 1).forEach((b) => {
    worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
  }));
  assert.ok(worst <= 1, `worst overlap ${worst.toFixed(1)}px`);
});

test("same input, same picture; existing circles keep their place after an edit", () => {
  const a = settleGraph(createGraph(ids, { parentOf }), edges);
  const b = settleGraph(createGraph(ids, { parentOf }), edges);
  assert.deepEqual(a.nodes.map(({ x, y }) => [x, y]), b.nodes.map(({ x, y }) => [x, y]));

  const previous = new Map(a.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const edited = createGraph([...ids, "c4"], { previous, parentOf: new Map([...parentOf, ["c4", "p1"]]) });
  assert.ok(edited.alpha === 1, "a new circle gets a full settle");
  const start = edited.byId.get("c4");
  assert.ok(Math.hypot(start.x - previous.get("p1").x, start.y - previous.get("p1").y) <= 40 + 8 + 8 + 0.001, "it starts on a ring beside its parent");
  settleGraph(edited, [...edges, { from: "p1", to: "c4" }]);
  const moved = Math.max(...ids.map((id) => Math.hypot(edited.byId.get(id).x - previous.get(id).x, edited.byId.get(id).y - previous.get(id).y)));
  assert.ok(moved < 60, `the rest shift only a little (${Math.round(moved)}px)`);

  const same = createGraph(ids, { previous, parentOf });
  assert.ok(same.alpha < 0.1, "nothing new: barely any movement");
});

test("a held circle stays where it is held", () => {
  const graph = createGraph(ids);
  graph.byId.get("c1").fx = 500;
  graph.byId.get("c1").fy = -200;
  settleGraph(graph, edges);
  assert.deepEqual([graph.byId.get("c1").x, graph.byId.get("c1").y], [500, -200]);
});

test("bigger circles for more bookings, capped, and a bump for parents", () => {
  assert.ok(graphRadius(0, 0) < graphRadius(9, 0));
  assert.equal(graphRadius(10000, 0), 18);
  assert.equal(graphRadius(4, 2), graphRadius(4, 0) + 4);
  const box = graphBounds(settleGraph(createGraph(ids), edges));
  assert.ok(box.maxX > box.minX && box.maxY > box.minY);
});
