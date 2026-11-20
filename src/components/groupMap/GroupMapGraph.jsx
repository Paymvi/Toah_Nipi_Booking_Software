import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { createGraph, graphBounds, graphRadius, tickGraph } from "../../utils/groupGraphLayout";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const clampZoom = (k) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
// Every name shows from this zoom; parents' names from PARENT_LABEL_ZOOM; the
// selection and its neighbours always. Fewer names when far out keeps them readable.
const LABEL_ZOOM = 1.4;
const PARENT_LABEL_ZOOM = 0.55;
// Circles never shrink below this on screen, so hundreds of groups stay visible zoomed out.
const MIN_SCREEN_RADIUS = 3.5;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const shortName = (name) => (name.length > 32 ? `${name.slice(0, 31)}…` : name);

// Zoom to k, keeping the point under (clientX, clientY) still.
function zoomAt(element, clientX, clientY, nextK, base) {
  const rect = element.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const k = clampZoom(nextK);
  return { k, x: px - ((px - base.x) * k) / base.k, y: py - ((py - base.y) * k) / base.k };
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const snapshot = (graph) => new Map(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y, r: node.r }]));

/*
  The Graph view: the same groups as the List, as circles joined by lines
  from parent to subgroup. A force layout places them and then stops. Dragging
  a circle only moves it on screen; it never changes a relationship.

  The simulation lives in a ref and runs from an effect and animation frames;
  rendering only reads the latest snapshot of positions. When the groups
  change, circles that already exist keep their place, so edits don't
  reshuffle the picture.
*/
export default function GroupMapGraph({ ref, layout, selectedId, highlight, directCount, onSelect, onNodeKey }) {
  const titleId = useId();
  const viewportRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const simRef = useRef(null);
  const edgesRef = useRef([]);
  const frameRef = useRef(0);
  const gesture = useRef({ pointers: new Map(), moved: false, dragNode: null });
  const focusAfterMove = useRef(null);
  const [positions, setPositions] = useState(() => new Map());
  const [view, setView] = useState({ x: 300, y: 250, k: 1 });
  const [focusedId, setFocusedId] = useState(null);

  // Animates until the layout is still, then stops. Safe to call when already running.
  const run = () => {
    if (frameRef.current) return;
    const step = () => {
      const graph = simRef.current;
      if (!graph) {
        frameRef.current = 0;
        return;
      }
      const moving = !prefersReducedMotion() && tickGraph(graph, edgesRef.current);
      setPositions(snapshot(graph));
      frameRef.current = moving ? window.requestAnimationFrame(step) : 0;
    };
    frameRef.current = window.requestAnimationFrame(step);
  };

  useEffect(() => {
    const previous = new Map((simRef.current?.nodes || []).map((node) => [node.id, { x: node.x, y: node.y }]));
    const parentOf = new Map(layout.edges.map((edge) => [edge.to, edge.from]));
    const childCount = new Map();
    layout.edges.forEach((edge) => childCount.set(edge.from, (childCount.get(edge.from) || 0) + 1));
    const graph = createGraph(layout.order, {
      previous,
      parentOf,
      radiusOf: (id) => graphRadius(directCount(id), childCount.get(id) || 0),
    });
    // Most of the settling happens before the first paint, so the picture doesn't burst open on screen.
    const steps = prefersReducedMotion() ? 600 : graph.alpha === 1 ? 150 : 0;
    for (let step = 0; step < steps && tickGraph(graph, layout.edges); step += 1);
    simRef.current = graph;
    edgesRef.current = layout.edges;
    run();
    return () => {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [layout, directCount]);

  const size = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width || 800, height: rect?.height || 500 };
  };

  const centerOn = (node, current, keepIfVisible) => {
    const { width, height } = size();
    const sx = node.x * current.k + current.x;
    const sy = node.y * current.k + current.y;
    if (keepIfVisible && sx > 40 && sy > 40 && sx < width - 40 && sy < height - 40) return current;
    const k = Math.max(current.k, 1);
    return { k, x: width / 2 - node.x * k, y: height / 2 - node.y * k };
  };

  useImperativeHandle(ref, () => ({
    fit() {
      const graph = simRef.current;
      if (!graph) return;
      const { width, height } = size();
      const box = graphBounds(graph);
      const k = clampZoom(Math.min(1, (width - 80) / Math.max(box.maxX - box.minX, 1), (height - 80) / Math.max(box.maxY - box.minY, 1)));
      setView({ k, x: width / 2 - ((box.minX + box.maxX) / 2) * k, y: height / 2 - ((box.minY + box.maxY) / 2) * k });
    },
    show(id) {
      const node = simRef.current?.byId.get(id);
      if (node) setView((current) => centerOn(node, current, true));
    },
  }));

  useEffect(() => {
    if (focusAfterMove.current && focusAfterMove.current === selectedId) {
      nodeRefs.current.get(selectedId)?.focus({ preventScroll: true });
      focusAfterMove.current = null;
    }
  });

  useEffect(() => {
    const element = viewportRef.current;
    const onWheel = (event) => {
      event.preventDefault();
      setView((current) => zoomAt(element, event.clientX, event.clientY, current.k * Math.exp(-event.deltaY * 0.0015), current));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const resetGesture = (current) => {
    const g = gesture.current;
    const points = [...g.pointers.values()];
    g.startView = current;
    g.start = points[0];
    g.pinch = points.length === 2
      ? { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), view: current }
      : null;
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const g = gesture.current;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pointers.size === 1) {
      g.moved = false;
      g.dragNode = event.target.closest?.("[data-group-id]")?.dataset.groupId || null;
    } else {
      g.dragNode = null;
    }
    resetGesture(view);
  };

  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...g.pointers.values()];
    if (points.length === 2 && g.pinch) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      g.moved = true;
      setView(zoomAt(viewportRef.current, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2, g.pinch.view.k * (distance / g.pinch.distance), g.pinch.view));
      return;
    }
    const dx = event.clientX - g.start.x;
    const dy = event.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    if (!g.moved) viewportRef.current.setPointerCapture?.(event.pointerId);
    g.moved = true;
    const node = g.dragNode && simRef.current?.byId.get(g.dragNode);
    if (node) {
      // Moves the circle on screen only; relationships never change by dragging.
      const rect = viewportRef.current.getBoundingClientRect();
      node.fx = (event.clientX - rect.left - view.x) / view.k;
      node.fy = (event.clientY - rect.top - view.y) / view.k;
      node.x = node.fx;
      node.y = node.fy;
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.25);
      run();
      return;
    }
    setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
  };

  const onPointerUp = (event) => {
    const g = gesture.current;
    g.pointers.delete(event.pointerId);
    const node = g.dragNode && simRef.current?.byId.get(g.dragNode);
    if (node) {
      delete node.fx;
      delete node.fy;
    }
    g.dragNode = null;
    resetGesture(view);
  };

  // A drag ends in a click; it must not select the circle under the pointer.
  const onClickCapture = (event) => {
    if (gesture.current.moved) {
      event.stopPropagation();
      event.preventDefault();
      gesture.current.moved = false;
    }
  };

  const onKeyDown = (event, id) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
      return;
    }
    const nextId = onNodeKey(id, event.key);
    if (nextId === undefined) return;
    event.preventDefault();
    if (nextId && nextId !== id) {
      focusAfterMove.current = nextId;
      const node = simRef.current?.byId.get(nextId);
      if (node) setView((current) => centerOn(node, current, true));
    }
  };

  const zoomBy = (factor) => {
    const rect = viewportRef.current.getBoundingClientRect();
    setView((current) => zoomAt(viewportRef.current, rect.left + rect.width / 2, rect.top + rect.height / 2, current.k * factor, current));
  };

  const tabStopId = positions.has(selectedId) ? selectedId : layout.order.find((id) => positions.has(id));
  const hasSelection = positions.has(selectedId);
  const parentIds = new Set(layout.edges.map((edge) => edge.from));

  return (
    <div className="gm-canvas">
      <div
        ref={viewportRef}
        className="gm-viewport gm-graph"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        <svg width="100%" height="100%" aria-labelledby={titleId} role="group">
          <title id={titleId}>Group graph. Circles are groups; lines join a parent organization to its subgroups.</title>
          {/* --gm-px: one screen pixel in graph units, so lines and outlines keep their width at any zoom. */}
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`} style={{ "--gm-px": `${1 / view.k}px` }}>
            {layout.edges.map((edge) => {
              const a = positions.get(edge.from);
              const b = positions.get(edge.to);
              if (!a || !b) return null;
              const lit = highlight.edges.has(`${edge.from}>${edge.to}`);
              return (
                <line
                  key={`${edge.from}>${edge.to}`}
                  className={`gm-graph-edge${lit ? " gm-graph-edge--lit" : ""}${hasSelection && !lit ? " gm-graph-dim" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })}
            {layout.nodes.map(({ id, group, childCount }) => {
              const node = positions.get(id);
              if (!node) return null;
              const isSelected = id === selectedId;
              const isRelated = highlight.nodes.has(id);
              const count = directCount(id);
              const showLabel = isSelected || isRelated || id === focusedId || view.k >= LABEL_ZOOM ||
                (parentIds.has(id) && view.k >= PARENT_LABEL_ZOOM);
              const className = [
                "gm-graph-node",
                childCount > 0 && "gm-graph-node--parent",
                isSelected && "gm-graph-node--selected",
                isRelated && !isSelected && "gm-graph-node--related",
                hasSelection && !isSelected && !isRelated && "gm-graph-dim",
              ].filter(Boolean).join(" ");
              return (
                <g
                  key={id}
                  ref={(element) => {
                    if (element) nodeRefs.current.set(id, element);
                    else nodeRefs.current.delete(id);
                  }}
                  className={className}
                  transform={`translate(${node.x} ${node.y})`}
                  role="button"
                  tabIndex={id === tabStopId ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${group.name}. ${plural(count, "booking")} for this group${childCount ? `, ${plural(childCount, "subgroup")}` : ""}`}
                  data-group-id={id}
                  onClick={() => onSelect(id)}
                  onKeyDown={(event) => onKeyDown(event, id)}
                  onFocus={() => setFocusedId(id)}
                  onBlur={() => setFocusedId((current) => (current === id ? null : current))}
                >
                  <circle r={Math.max(node.r, MIN_SCREEN_RADIUS / view.k)} />
                  {showLabel && (
                    // 12px on screen at any zoom.
                    <text y={Math.max(node.r, MIN_SCREEN_RADIUS / view.k) + 13 / view.k} textAnchor="middle" style={{ fontSize: `${12 / view.k}px` }}>
                      {shortName(group.name)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="gm-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
