/*
  Force layout for the Group Map's Graph view (docs/GROUP_MAP.md): circles
  push each other apart, parent-subgroup lines pull together, and a gentle
  pull to the middle keeps unconnected groups close. It cools down and stops,
  so the picture settles instead of moving forever. No React, no DOM.

  shortcut: every pair of circles is compared each step (n²); fine for the
  few hundred groups here, use a quadtree (Barnes-Hut) past a few thousand.
*/

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LINK_LENGTH = 20;
const LINK_STRENGTH = 0.3;
const REPULSION = 4000;
const GRAVITY = 0.02;
const VELOCITY_DECAY = 0.55;
const ALPHA_DECAY = 0.977;
export const ALPHA_MIN = 0.004;

export const graphRadius = (bookingCount, childCount) =>
  Math.min(18, 6 + 1.6 * Math.sqrt(bookingCount)) + (childCount > 0 ? 4 : 0);

/*
  ids: parents before their subgroups (layout order). previous: Map id → {x, y}
  from an earlier layout, so circles that already exist keep their place.
  parentOf: id → parent id. Each family starts together: top-level groups on
  a sunflower spiral, spaced by family size, and subgroups on a ring around
  their parent, so the forces only tidy up instead of untangling families.
*/
export function createGraph(ids, { previous = new Map(), parentOf = new Map(), radiusOf = () => 8 } = {}) {
  const inGraph = new Set(ids);
  const childCount = new Map();
  ids.forEach((id) => {
    const parent = parentOf.get(id);
    if (inGraph.has(parent)) childCount.set(parent, (childCount.get(parent) || 0) + 1);
  });
  const familySize = (id) => 1 + (childCount.get(id) || 0);
  const placed = new Map();
  const ringIndex = new Map();
  let spiral = 0;
  const nodes = ids.map((id) => {
    const radius = radiusOf(id);
    const kept = previous.get(id);
    const parentId = parentOf.get(id);
    let x;
    let y;
    if (kept) {
      ({ x, y } = kept);
    } else if (inGraph.has(parentId) && placed.has(parentId)) {
      const around = placed.get(parentId);
      const slot = ringIndex.get(parentId) || 0;
      ringIndex.set(parentId, slot + 1);
      const angle = (slot / (childCount.get(parentId) || 1)) * 2 * Math.PI + (around.depth || 0);
      const distance = 40 + radius + around.r;
      x = around.x + Math.cos(angle) * distance;
      y = around.y + Math.sin(angle) * distance;
    } else {
      // Bigger families take a bigger step out along the spiral.
      spiral += Math.sqrt(familySize(id));
      const distance = 32 * Math.sqrt(spiral);
      x = Math.cos(spiral * GOLDEN_ANGLE) * distance;
      y = Math.sin(spiral * GOLDEN_ANGLE) * distance;
    }
    const node = { id, x, y, vx: 0, vy: 0, r: radius };
    placed.set(id, { x, y, r: radius, depth: (placed.get(parentId)?.depth || 0) + 0.5 });
    return node;
  });
  const anyNew = nodes.some((node) => !previous.has(node.id));
  // Only new circles need a full settle; otherwise a small nudge keeps things still.
  return { nodes, byId: new Map(nodes.map((node) => [node.id, node])), alpha: anyNew ? 1 : 0.08 };
}

// One step. edges: [{ from, to }]. A node with fx/fy set is held there (being dragged).
export function tickGraph(graph, edges) {
  const { nodes, byId } = graph;
  const alpha = graph.alpha;

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx === 0 && dy === 0) {
        dx = (i - j) * 0.01;
        dy = 0.01;
      }
      const distance2 = Math.max(dx * dx + dy * dy, 1);
      const distance = Math.sqrt(distance2);
      let push = (REPULSION * alpha) / distance2;
      // Never overlap: a firm push when circles touch.
      const gap = a.r + b.r + 4 - distance;
      if (gap > 0) push += (gap / distance) * 0.5;
      const fx = dx * push / distance;
      const fy = dy * push / distance;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  edges.forEach(({ from, to }) => {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const pull = ((distance - (LINK_LENGTH + a.r + b.r)) / distance) * LINK_STRENGTH * alpha * 10;
    a.vx += dx * pull * 0.5;
    a.vy += dy * pull * 0.5;
    b.vx -= dx * pull * 0.5;
    b.vy -= dy * pull * 0.5;
  });

  nodes.forEach((node) => {
    node.vx -= node.x * GRAVITY * alpha;
    node.vy -= node.y * GRAVITY * alpha;
    if (node.fx != null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      return;
    }
    node.vx *= VELOCITY_DECAY;
    node.vy *= VELOCITY_DECAY;
    node.x += node.vx;
    node.y += node.vy;
  });

  graph.alpha *= ALPHA_DECAY;
  return graph.alpha > ALPHA_MIN;
}

// Run until still (or maxTicks): for reduced motion, and for tests.
export function settleGraph(graph, edges, maxTicks = 400) {
  for (let tick = 0; tick < maxTicks && tickGraph(graph, edges); tick += 1);
  return graph;
}

export function graphBounds(graph) {
  if (!graph.nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return graph.nodes.reduce(
    (box, node) => ({
      minX: Math.min(box.minX, node.x - node.r),
      minY: Math.min(box.minY, node.y - node.r),
      maxX: Math.max(box.maxX, node.x + node.r),
      maxY: Math.max(box.maxY, node.y + node.r),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}
