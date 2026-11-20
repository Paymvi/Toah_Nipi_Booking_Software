import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCompress, FaExpand, FaSitemap } from "react-icons/fa";

import { supabase } from "../../lib/supabaseClient";
import * as groupMapService from "../../services/groupMap";
import {
  buildGroupIndex,
  getAncestors,
  getBookingCounts,
  getChildren,
  getDirectBookings,
  getKeyboardMove,
  getListRows,
  getUnlinkedNames,
  layoutGroupMap,
  searchGroups,
} from "../../utils/groupMap";
import GroupMapCanvas from "./GroupMapCanvas";
import GroupMapDetails from "./GroupMapDetails";
import GroupMapList from "./GroupMapList";

const MODE_STORAGE_KEY = "toahNipiGroupMapMode";
const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

function getSavedMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "list" ? "list" : "map";
  } catch {
    return "map";
  }
}

// The service bound to the signed-in client, for the details panel.
const api = {
  createGroup: (name, parentId) => groupMapService.createGroup(supabase, name, parentId),
  renameGroup: (group, name) => groupMapService.renameGroup(supabase, group, name),
  setGroupParent: (group, parentId) => groupMapService.setGroupParent(supabase, group, parentId),
  deleteGroup: (group) => groupMapService.deleteGroup(supabase, group),
  linkGroupName: (name, groupId) => groupMapService.linkGroupName(supabase, name, groupId),
  unlinkGroupName: (name, groupId) => groupMapService.unlinkGroupName(supabase, name, groupId),
};

/*
  Group Map (docs/GROUP_MAP.md): organizations and their subgroups, inside
  Contacts. Bookings and contacts come from the screens' existing data; only
  groups and their linked names are loaded here.
*/
export default function GroupMap({ bookings, contacts, canEdit, onOpenBooking, onShowContact }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [focusId, setFocusId] = useState(null);
  const [mode, setMode] = useState(getSavedMode);
  const [fullScreen, setFullScreen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [camera, setCamera] = useState(null);
  const canvasRef = useRef(null);
  const newGroupInputRef = useRef(null);

  const reload = useCallback(async ({ first = false } = {}) => {
    try {
      const loaded = await groupMapService.loadGroupMap(supabase);
      setData(loaded);
      setLoadError(null);
      if (first) setCamera({ kind: "fit", animate: false, readable: true, n: Date.now() });
    } catch (error) {
      setLoadError(error);
    }
  }, []);

  useEffect(() => {
    let live = true;
    groupMapService.loadGroupMap(supabase).then(
      (loaded) => {
        if (!live) return;
        setData(loaded);
        setCamera({ kind: "fit", animate: false, readable: true, n: Date.now() });
      },
      (error) => live && setLoadError(error)
    );
    return () => {
      live = false;
    };
  }, []);

  const index = useMemo(() => buildGroupIndex(data?.groups, data?.links, bookings), [data, bookings]);
  const activeFocusId = focusId && index.byId.has(focusId) ? focusId : null;
  const layout = useMemo(() => layoutGroupMap(index, { collapsed, focusId: activeFocusId }), [index, collapsed, activeFocusId]);
  const listRows = useMemo(() => getListRows(index, collapsed, activeFocusId), [index, collapsed, activeFocusId]);
  const unlinkedNames = useMemo(() => getUnlinkedNames(index), [index]);
  const directCount = useCallback((id) => getDirectBookings(index, id).length, [index]);
  const selectedGroup = index.byId.get(selectedId) || null;
  const results = useMemo(() => searchGroups(index, query), [index, query]);

  const contactsForBookings = useCallback((groupBookings) => {
    const ids = new Set(groupBookings.map((booking) => booking.id));
    return contacts.filter((contact) => contact.bookings.some((booking) => ids.has(booking.id)));
  }, [contacts]);

  // Selected group: the path up to its top-level organization and its own subgroups stand out.
  const highlight = useMemo(() => {
    const nodes = new Set();
    const edges = new Set();
    if (!selectedGroup) return { nodes, edges };
    let childId = selectedGroup.id;
    getAncestors(index, selectedGroup.id).reverse().forEach((ancestor) => {
      nodes.add(ancestor.id);
      edges.add(`${ancestor.id}>${childId}`);
      childId = ancestor.id;
    });
    getChildren(index, selectedGroup.id).forEach((child) => {
      nodes.add(child.id);
      edges.add(`${selectedGroup.id}>${child.id}`);
    });
    return { nodes, edges };
  }, [index, selectedGroup]);

  // Camera moves run after the layout they need has rendered.
  useEffect(() => {
    if (!camera) return;
    if (camera.kind === "fit") canvasRef.current?.fit(camera.animate, camera.readable);
    if (camera.kind === "show") {
      canvasRef.current?.show(camera.id);
      document.querySelector(`.gm-list [data-group-id="${camera.id}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [camera]);

  const toggle = (id) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Select and bring into view: opens collapsed parents, leaves focus if outside it.
  const reveal = (id) => {
    if (!index.byId.has(id)) {
      // Just created: not in this render's index yet, and it is already in view of its parent.
      setSelectedId(id);
      setCamera({ kind: "show", id, n: Date.now() });
      return;
    }
    const ancestorIds = getAncestors(index, id).map((ancestor) => ancestor.id);
    setSelectedId(id);
    setCollapsed((current) => {
      if (!ancestorIds.some((ancestorId) => current.has(ancestorId))) return current;
      const next = new Set(current);
      ancestorIds.forEach((ancestorId) => next.delete(ancestorId));
      return next;
    });
    if (activeFocusId && activeFocusId !== id && !ancestorIds.includes(activeFocusId)) setFocusId(null);
    setCamera({ kind: "show", id, n: Date.now() });
  };

  const select = (id) => (id ? reveal(id) : setSelectedId(null));

  const keyHandler = (order) => (id, key) => {
    if (!NAV_KEYS.has(key)) return undefined;
    const move = getKeyboardMove(index, order, collapsed, id, key);
    if (move?.toggle) {
      toggle(move.toggle);
      return id;
    }
    if (move?.select) {
      setSelectedId(move.select);
      return move.select;
    }
    return id;
  };

  const focusOn = (id) => {
    setFocusId(id);
    setSelectedId(id);
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setCamera({ kind: "fit", animate: true, n: Date.now() });
  };

  const showAll = () => {
    setFocusId(null);
    setCamera(selectedId ? { kind: "show", id: selectedId, n: Date.now() } : { kind: "fit", animate: true, n: Date.now() });
  };

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, nextMode);
    } catch {
      // Still switches for this visit.
    }
    if (nextMode === "map") setCamera(selectedId ? { kind: "show", id: selectedId, n: Date.now() } : { kind: "fit", animate: false, readable: true, n: Date.now() });
  };

  const collapseAll = () =>
    setCollapsed(new Set([...index.byId.keys()].filter((id) => getChildren(index, id).length)));

  // Every change: one at a time, then reload so the screen matches the database.
  const act = async (run, message, onDone) => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await run();
      await reload();
      setStatus({ kind: "ok", text: message });
      onDone?.(result);
    } catch (error) {
      setStatus({ kind: "error", text: error.message });
      if (error.stale) await reload();
    } finally {
      setBusy(false);
    }
  };

  const startNewGroup = () => {
    setSelectedId(null);
    window.requestAnimationFrame(() => newGroupInputRef.current?.focus());
  };

  const groupCount = index.byId.size;
  const focusGroup = activeFocusId ? index.byId.get(activeFocusId) : null;
  const focusCounts = focusGroup ? getBookingCounts(index, focusGroup.id) : null;

  if (loadError && !data) {
    return (
      <section className="dashboard-card gm-root">
        <div className="empty-state">
          <strong>{loadError.setupNeeded ? "The Group Map isn't set up yet" : "Could not load the Group Map"}</strong>
          <p>{loadError.message}</p>
          {!loadError.setupNeeded && <button type="button" onClick={() => reload({ first: true })}>Try again</button>}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="dashboard-card gm-root">
        <p className="gm-muted" role="status">Loading groups…</p>
      </section>
    );
  }

  return (
    <section
      className={`dashboard-card gm-root${fullScreen ? " gm-root--fullscreen" : ""}`}
      aria-label="Group Map"
      onKeyDown={(event) => {
        if (event.key === "Escape" && fullScreen) setFullScreen(false);
      }}
    >
      <div className="gm-toolbar">
        <div className="gm-search">
          <input
            type="search"
            placeholder="Find a group"
            aria-label="Find a group"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) {
                event.preventDefault();
                reveal(results[0].id);
                setQuery("");
              }
            }}
          />
          {query.trim() && (
            <ul className="gm-search-results" aria-label="Matching groups">
              {results.map((group) => (
                <li key={group.id}>
                  <button type="button" onClick={() => { reveal(group.id); setQuery(""); }}>
                    {group.name}
                    {group.parent_id && index.byId.get(group.parent_id) && (
                      <span className="gm-muted"> in {index.byId.get(group.parent_id).name}</span>
                    )}
                  </button>
                </li>
              ))}
              {!results.length && <li className="gm-muted">No groups match.</li>}
            </ul>
          )}
        </div>

        <div className="season-segment" role="group" aria-label="Show groups as" data-tutorial-ui>
          <button type="button" aria-pressed={mode === "map"} onClick={() => chooseMode("map")}>Map</button>
          <button type="button" aria-pressed={mode === "list"} onClick={() => chooseMode("list")}>List</button>
        </div>

        {mode === "map" && (
          <button type="button" onClick={() => setCamera({ kind: "fit", animate: true, n: Date.now() })}>Fit to screen</button>
        )}
        <button type="button" onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button type="button" onClick={collapseAll}>Collapse all</button>
        {canEdit && <button type="button" onClick={startNewGroup}>New group</button>}
        <button type="button" onClick={() => reload()} disabled={busy}>Refresh</button>
        <button type="button" onClick={() => setFullScreen((value) => !value)} aria-pressed={fullScreen}>
          {fullScreen ? <FaCompress aria-hidden="true" /> : <FaExpand aria-hidden="true" />}
          {fullScreen ? " Exit full screen" : " Full screen"}
        </button>
      </div>

      {focusGroup && (
        <div className="gm-focus-bar" role="status">
          <span>
            Showing only <strong>{focusGroup.name}</strong> and its subgroups ({focusCounts.direct} of its own bookings,{" "}
            {focusCounts.withSubgroups} including subgroups).
          </span>
          <button type="button" onClick={showAll}>Show all groups</button>
        </div>
      )}

      <div className="gm-body">
        <div className="gm-main">
          {groupCount === 0 ? (
            <div className="empty-state gm-empty">
              <FaSitemap aria-hidden="true" />
              <strong>No groups yet</strong>
              <p>
                Groups are made from the organization names on bookings. {canEdit
                  ? "Use \"Create group\" next to a name in the panel, or New group to start one."
                  : "Admin and staff accounts can create them."}
              </p>
            </div>
          ) : mode === "map" ? (
            <>
              <GroupMapCanvas
                ref={canvasRef}
                layout={layout}
                selectedId={selectedId}
                highlight={highlight}
                directCount={directCount}
                onSelect={select}
                onToggle={toggle}
                onNodeKey={keyHandler(layout.order)}
              />
              <p className="gm-legend">
                Lines point from a parent organization to its subgroups. Numbers count each group's own bookings.
                Drag to move, scroll or pinch to zoom, arrow keys to move between groups.
              </p>
            </>
          ) : (
            <GroupMapList
              rows={listRows}
              index={index}
              collapsed={collapsed}
              selectedId={selectedId}
              directCount={directCount}
              onSelect={select}
              onToggle={toggle}
              onNodeKey={keyHandler(listRows.map((row) => row.group.id))}
            />
          )}
        </div>

        <aside className="gm-details" aria-label={selectedGroup ? `Details for ${selectedGroup.name}` : "About the Group Map"}>
          {selectedGroup && (
            <button type="button" className="gm-link-button gm-details-close" onClick={() => setSelectedId(null)}>
              Close details
            </button>
          )}
          {status && (
            <p className={`gm-status gm-status--${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
              {status.text}
            </p>
          )}
          {!canEdit && <p className="gm-muted">View only: your account can't change groups.</p>}
          <GroupMapDetails
            key={selectedGroup?.id || "overview"}
            index={index}
            group={selectedGroup}
            canEdit={canEdit}
            busy={busy}
            unlinkedNames={unlinkedNames}
            contactsForBookings={contactsForBookings}
            act={act}
            api={api}
            onSelect={select}
            onFocus={focusOn}
            onOpenBooking={onOpenBooking}
            onShowContact={onShowContact}
            newGroupInputRef={newGroupInputRef}
          />
        </aside>
      </div>
    </section>
  );
}
