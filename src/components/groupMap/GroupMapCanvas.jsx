import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

import { GROUP_NODE_HEIGHT, GROUP_NODE_WIDTH } from "../../utils/groupMap";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;
const clampZoom = (k) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Zoom to k, keeping the point under (clientX, clientY) still.
function zoomAt(element, clientX, clientY, nextK, base) {
  const rect = element.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const k = clampZoom(nextK);
  return { k, x: px - ((px - base.x) * k) / base.k, y: py - ((py - base.y) * k) / base.k };
}

/*
  The map: pan (drag), zoom (wheel, pinch, buttons) and an animated camera.
  Nodes keep the positions the layout gives them; nothing here changes data.
  The parent drives the camera through ref.fit() and ref.show(id).
*/
export default function GroupMapCanvas({
  ref,
  layout,
  selectedId,
  highlight,
  directCount,
  onSelect,
  onToggle,
  onNodeKey,
}) {
  const markerId = `gm-arrow-${useId().replace(/:/g, "")}`;
  const viewportRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const gesture = useRef({ pointers: new Map(), moved: false });
  const focusAfterMove = useRef(null);
  const [view, setView] = useState({ x: 24, y: 56, k: 1 });
  const [animate, setAnimate] = useState(false);

  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout]);
  const tabStopId = nodeById.has(selectedId) ? selectedId : layout.order[0];

  const size = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width || 800, height: rect?.height || 500 };
  };

  const centerOn = (node, current, keepIfVisible) => {
    const { width, height } = size();
    const k = Math.max(current.k, 0.75);
    const left = node.x * current.k + current.x;
    const top = node.y * current.k + current.y;
    const visible =
      left >= 8 && top >= 8 &&
      left + GROUP_NODE_WIDTH * current.k <= width - 8 &&
      top + GROUP_NODE_HEIGHT * current.k <= height - 8;
    if (keepIfVisible && visible && current.k >= 0.6) return current;
    return {
      k,
      x: width / 2 - (node.x + GROUP_NODE_WIDTH / 2) * k,
      y: height / 2 - (node.y + GROUP_NODE_HEIGHT / 2) * k,
    };
  };

  useImperativeHandle(ref, () => ({
    // readable: never shrink below a size people can read (first load); the top-left stays in view.
    fit(withAnimation = true, readable = false) {
      const { width, height } = size();
      const k = clampZoom(Math.min(1, (width - 48) / Math.max(layout.width, 1), (height - 100) / Math.max(layout.height, 1)));
      setAnimate(withAnimation);
      if (readable && k < 0.85) setView({ k: 0.85, x: 16, y: 48 });
      else setView({ k, x: Math.max(24, (width - layout.width * k) / 2), y: 56 });
    },
    show(id) {
      const node = nodeById.get(id);
      if (!node) return;
      setAnimate(true);
      setView((current) => centerOn(node, current, true));
    },
  }));

  // After a keyboard move the new node gets focus (it may have just appeared).
  useEffect(() => {
    if (focusAfterMove.current && focusAfterMove.current === selectedId) {
      nodeRefs.current.get(selectedId)?.focus({ preventScroll: true });
      focusAfterMove.current = null;
    }
  });

  const zoomBy = (factor) => {
    const rect = viewportRef.current.getBoundingClientRect();
    setAnimate(true);
    setView((current) => zoomAt(viewportRef.current, rect.left + rect.width / 2, rect.top + rect.height / 2, current.k * factor, current));
  };

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = viewportRef.current;
    const onWheel = (event) => {
      event.preventDefault();
      setAnimate(false);
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
    gesture.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.current.pointers.size === 1) gesture.current.moved = false;
    resetGesture(view);
  };

  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...g.pointers.values()];
    if (points.length === 2 && g.pinch) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;
      g.moved = true;
      setAnimate(false);
      setView(zoomAt(viewportRef.current, midX, midY, g.pinch.view.k * (distance / g.pinch.distance), g.pinch.view));
      return;
    }
    const dx = event.clientX - g.start.x;
    const dy = event.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    if (!g.moved) viewportRef.current.setPointerCapture?.(event.pointerId);
    g.moved = true;
    setAnimate(false);
    setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
  };

  const onPointerUp = (event) => {
    gesture.current.pointers.delete(event.pointerId);
    resetGesture(view);
  };

  // A drag ends in a click; it must not select the node under the pointer.
  const onClickCapture = (event) => {
    if (gesture.current.moved) {
      event.stopPropagation();
      event.preventDefault();
      gesture.current.moved = false;
    }
  };

  const onKeyDown = (event, id) => {
    const nextId = onNodeKey(id, event.key);
    if (nextId === undefined) return;
    event.preventDefault();
    if (nextId && nextId !== id) {
      focusAfterMove.current = nextId;
      const node = nodeById.get(nextId);
      if (node) {
        setAnimate(true);
        setView((current) => centerOn(node, current, true));
      }
    }
  };

  const edgePath = (from, to) => {
    const x1 = from.x + GROUP_NODE_WIDTH;
    const y1 = from.y + GROUP_NODE_HEIGHT / 2;
    const x2 = to.x - 6;
    const y2 = to.y + GROUP_NODE_HEIGHT / 2;
    const midX = x1 + (x2 - x1) / 2;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  };

  return (
    <div className="gm-canvas">
      <div
        ref={viewportRef}
        className="gm-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        <div
          className={`gm-world${animate ? " gm-world--animate" : ""}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg
            className="gm-edges"
            width={Math.max(layout.width, 1)}
            height={Math.max(layout.height, 1)}
            aria-hidden="true"
          >
            <defs>
              <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
            </defs>
            {layout.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const isLit = highlight.edges.has(`${edge.from}>${edge.to}`);
              return (
                <path
                  key={`${edge.from}>${edge.to}`}
                  className={`gm-edge${isLit ? " gm-edge--lit" : ""}`}
                  d={edgePath(from, to)}
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}
          </svg>

          {layout.labels.map((label) => (
            <div key={label.text} className="gm-section-label" style={{ transform: `translate(${label.x}px, ${label.y}px)` }}>
              {label.text}
            </div>
          ))}

          {layout.nodes.map((node) => {
            const count = directCount(node.id);
            const isSelected = node.id === selectedId;
            const className = [
              "gm-node",
              isSelected && "gm-node--selected",
              highlight.nodes.has(node.id) && !isSelected && "gm-node--related",
              node.single && "gm-node--single",
            ].filter(Boolean).join(" ");
            return (
              <div key={node.id} className="gm-node-wrap" style={{ transform: `translate(${node.x}px, ${node.y}px)` }}>
                <button
                  ref={(element) => {
                    if (element) nodeRefs.current.set(node.id, element);
                    else nodeRefs.current.delete(node.id);
                  }}
                  type="button"
                  className={className}
                  tabIndex={node.id === tabStopId ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${node.group.name}. ${plural(count, "booking")} for this group${node.childCount ? `, ${plural(node.childCount, "subgroup")}${node.collapsed ? " hidden" : ""}` : ""}`}
                  data-group-id={node.id}
                  onClick={() => onSelect(node.id)}
                  onKeyDown={(event) => onKeyDown(event, node.id)}
                >
                  <span className="gm-node-name">{node.group.name}</span>
                  <span className="gm-node-meta">
                    {plural(count, "booking")}
                    {node.childCount > 0 && ` · ${plural(node.childCount, "subgroup")}`}
                  </span>
                </button>
                {node.childCount > 0 && (
                  <button
                    type="button"
                    className="gm-node-toggle"
                    tabIndex={-1}
                    aria-label={node.collapsed ? `Show subgroups of ${node.group.name}` : `Hide subgroups of ${node.group.name}`}
                    aria-expanded={!node.collapsed}
                    onClick={() => onToggle(node.id)}
                  >
                    {node.collapsed ? (
                      <>
                        <FaChevronRight aria-hidden="true" />
                        <span>{node.hiddenCount}</span>
                      </>
                    ) : (
                      <FaChevronLeft aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="gm-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
