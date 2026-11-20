import { isHostRecord } from "./bookingClassification.js";

/*
  Group Map logic, no React and no database (docs/GROUP_MAP.md).

  Groups come from public.organizations (id, name, parent_id, version) and
  bookings join a group through public.organization_name_links: a booking
  belongs to the group its exact organization name is linked to. Hosting
  records are left out, like the rest of Contacts.
*/

export const GROUP_NODE_WIDTH = 230;
export const GROUP_NODE_HEIGHT = 60;
const COLUMN_STEP = GROUP_NODE_WIDTH + 64;
const ROW_STEP = GROUP_NODE_HEIGHT + 14;
const FAMILY_GAP = 22;
const SECTION_GAP = 70;

// The bookings default when a form had no name; never a real group name.
const PLACEHOLDER_NAMES = new Set(["", "unnamed organization"]);

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function buildGroupIndex(groups = [], links = [], bookings = []) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const childrenOf = new Map();
  const roots = [];

  [...groups].sort(byName).forEach((group) => {
    // A parent the screen can't see (deleted meanwhile) makes it top-level here.
    if (group.parent_id && byId.has(group.parent_id)) {
      if (!childrenOf.has(group.parent_id)) childrenOf.set(group.parent_id, []);
      childrenOf.get(group.parent_id).push(group);
    } else {
      roots.push(group);
    }
  });

  const namesOf = new Map();
  const groupOfName = new Map();
  links.forEach((link) => {
    if (!byId.has(link.organization_id)) return;
    groupOfName.set(link.name, link.organization_id);
    if (!namesOf.has(link.organization_id)) namesOf.set(link.organization_id, []);
    namesOf.get(link.organization_id).push(link.name);
  });
  namesOf.forEach((names) => names.sort((a, b) => a.localeCompare(b)));

  const bookingsByName = new Map();
  bookings.forEach((booking) => {
    if (isHostRecord(booking)) return;
    const name = booking.organizationName || "";
    if (!bookingsByName.has(name)) bookingsByName.set(name, []);
    bookingsByName.get(name).push(booking);
  });

  return { byId, childrenOf, roots, namesOf, groupOfName, bookingsByName };
}

export const getChildren = (index, id) => index.childrenOf.get(id) || [];

export function getAncestors(index, id) {
  const ancestors = [];
  const seen = new Set([id]);
  let parentId = index.byId.get(id)?.parent_id;
  while (parentId && index.byId.has(parentId) && !seen.has(parentId)) {
    seen.add(parentId);
    ancestors.unshift(index.byId.get(parentId));
    parentId = index.byId.get(parentId).parent_id;
  }
  return ancestors;
}

export function getDescendantIds(index, id) {
  const ids = [];
  const stack = [...getChildren(index, id)];
  while (stack.length) {
    const group = stack.pop();
    ids.push(group.id);
    stack.push(...getChildren(index, group.id));
  }
  return ids;
}

export const getGroupPath = (index, id) =>
  [...getAncestors(index, id), index.byId.get(id)].filter(Boolean).map((group) => group.name).join(" › ");

// Bookings whose name is linked to this group itself, never its subgroups.
export const getDirectBookings = (index, id) =>
  (index.namesOf.get(id) || []).flatMap((name) => index.bookingsByName.get(name) || []);

export function getBookingCounts(index, id) {
  const direct = getDirectBookings(index, id).length;
  const withSubgroups = getDescendantIds(index, id).reduce(
    (total, childId) => total + getDirectBookings(index, childId).length,
    direct
  );
  return { direct, withSubgroups };
}

// Names on bookings that no group claims yet, with how many bookings use each.
export function getUnlinkedNames(index) {
  const names = [];
  index.bookingsByName.forEach((bookings, name) => {
    if (index.groupOfName.has(name) || PLACEHOLDER_NAMES.has(name.trim().toLowerCase())) return;
    names.push({ name, count: bookings.length });
  });
  return names.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// Possible parents: anything except the group itself and its own subgroups.
export function getParentOptions(index, id) {
  const excluded = new Set(id ? [id, ...getDescendantIds(index, id)] : []);
  return [...index.byId.values()]
    .filter((group) => !excluded.has(group.id))
    .map((group) => ({ id: group.id, label: getGroupPath(index, group.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

const STOP_WORDS = new Set(["the", "of", "and", "at", "for", "a", "an", "group", "church", "retreat"]);
const words = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));

/*
  Unlinked names that share every meaningful word of the group's name, as
  suggestions for staff to review. Never applied automatically.
*/
export function suggestNames(groupName, unlinkedNames, limit = 6) {
  const wanted = words(groupName);
  if (!wanted.length) return [];
  return unlinkedNames
    .filter(({ name }) => {
      const have = new Set(words(name));
      return wanted.every((word) => have.has(word));
    })
    .slice(0, limit);
}

export function searchGroups(index, query, limit = 12) {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  return [...index.byId.values()]
    .filter((group) => group.name.toLowerCase().includes(text) ||
      (index.namesOf.get(group.id) || []).some((name) => name.toLowerCase().includes(text)))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(text)) - Number(!b.name.toLowerCase().startsWith(text)) || byName(a, b))
    .slice(0, limit);
}

/*
  Left-to-right tree: parents on the left, subgroups to their right. Families
  (groups with subgroups) are stacked first; groups with no parent and no
  subgroups follow in a grid so hundreds of them stay compact. Positions only
  depend on the data, the collapsed set and the focus, so exploring never
  reshuffles the map.
*/
export function layoutGroupMap(index, { collapsed = new Set(), focusId = null } = {}) {
  const nodes = [];
  const edges = [];
  const order = [];
  const labels = [];
  let row = 0;
  let extraY = 0;

  const place = (group, depth) => {
    const children = getChildren(index, group.id);
    const isCollapsed = children.length > 0 && collapsed.has(group.id);
    const node = {
      id: group.id,
      group,
      depth,
      x: depth * COLUMN_STEP,
      y: 0,
      childCount: children.length,
      collapsed: isCollapsed,
      hiddenCount: isCollapsed ? getDescendantIds(index, group.id).length : 0,
    };
    nodes.push(node);
    order.push(group.id);
    if (!children.length || isCollapsed) {
      node.y = row * ROW_STEP + extraY;
      row += 1;
      return node;
    }
    const placed = children.map((child) => {
      const childNode = place(child, depth + 1);
      edges.push({ from: group.id, to: child.id });
      return childNode;
    });
    node.y = (placed[0].y + placed[placed.length - 1].y) / 2;
    return node;
  };

  const focused = focusId && index.byId.get(focusId);
  const families = focused ? [focused] : index.roots.filter((group) => getChildren(index, group.id).length);
  const singles = focused ? [] : index.roots.filter((group) => !getChildren(index, group.id).length);

  if (families.length && singles.length) {
    labels.push({ text: "Organizations and their subgroups", x: 0, y: -34 });
  }
  families.forEach((group) => {
    place(group, 0);
    extraY += FAMILY_GAP;
  });

  if (singles.length) {
    const startY = families.length ? row * ROW_STEP + extraY + SECTION_GAP : 0;
    const columns = Math.min(10, Math.max(3, Math.round(Math.sqrt((singles.length * ROW_STEP * 1.6) / COLUMN_STEP))));
    labels.push({ text: "Groups with no parent or subgroups", x: 0, y: startY - 34 });
    singles.forEach((group, i) => {
      nodes.push({
        id: group.id,
        group,
        depth: 0,
        x: (i % columns) * COLUMN_STEP,
        y: startY + Math.floor(i / columns) * ROW_STEP,
        childCount: 0,
        collapsed: false,
        hiddenCount: 0,
        single: true,
      });
      order.push(group.id);
    });
  }

  const width = Math.max(0, ...nodes.map((node) => node.x + GROUP_NODE_WIDTH));
  const height = Math.max(0, ...nodes.map((node) => node.y + GROUP_NODE_HEIGHT));
  return { nodes, edges, order, labels, width, height };
}

// Visible rows of the outline: every top-level group A–Z, subgroups under it.
export function getListRows(index, collapsed, focusId) {
  const rows = [];
  const walk = (group, level) => {
    rows.push({ group, level });
    if (!collapsed.has(group.id)) getChildren(index, group.id).forEach((child) => walk(child, level + 1));
  };
  const focused = focusId && index.byId.get(focusId);
  (focused ? [focused] : index.roots).forEach((group) => walk(group, 1));
  return rows;
}

/*
  Keyboard moves shared by the map and the list. `order` is what is visible
  in that view. Returns { select } to move, or { toggle } to expand/collapse.
*/
export function getKeyboardMove(index, order, collapsed, id, key) {
  const position = order.indexOf(id);
  const hasChildren = getChildren(index, id).length > 0;
  const isOpen = hasChildren && !collapsed.has(id);
  switch (key) {
    case "ArrowDown":
      return { select: order[Math.min(order.length - 1, position + 1)] };
    case "ArrowUp":
      return { select: order[Math.max(0, position - 1)] };
    case "Home":
      return { select: order[0] };
    case "End":
      return { select: order[order.length - 1] };
    case "ArrowRight":
      if (hasChildren && !isOpen) return { toggle: id };
      return isOpen ? { select: getChildren(index, id)[0].id } : null;
    case "ArrowLeft": {
      if (isOpen) return { toggle: id };
      const parentId = index.byId.get(id)?.parent_id;
      return parentId && order.includes(parentId) ? { select: parentId } : null;
    }
    default:
      return null;
  }
}
