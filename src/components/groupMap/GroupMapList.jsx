import { useEffect, useRef } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

import { getChildren } from "../../utils/groupMap";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/*
  The same groups as the map, as an indented outline (role="tree"). Arrow
  keys move, Left/Right collapse and expand, like the map.
*/
export default function GroupMapList({ rows, index, collapsed, selectedId, directCount, onSelect, onToggle, onNodeKey }) {
  const itemRefs = useRef(new Map());
  const focusAfterMove = useRef(null);
  const tabStopId = rows.some((row) => row.group.id === selectedId) ? selectedId : rows[0]?.group.id;

  useEffect(() => {
    if (focusAfterMove.current && focusAfterMove.current === selectedId) {
      itemRefs.current.get(selectedId)?.focus();
      focusAfterMove.current = null;
    }
  });

  const onKeyDown = (event, id) => {
    const nextId = onNodeKey(id, event.key);
    if (nextId === undefined) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(id);
      }
      return;
    }
    event.preventDefault();
    if (nextId && nextId !== id) focusAfterMove.current = nextId;
  };

  return (
    <div className="gm-list" role="tree" aria-label="Groups and subgroups">
      {rows.map(({ group, level }) => {
        const childCount = getChildren(index, group.id).length;
        const isOpen = childCount > 0 && !collapsed.has(group.id);
        const count = directCount(group.id);
        return (
          <div
            key={group.id}
            ref={(element) => {
              if (element) itemRefs.current.set(group.id, element);
              else itemRefs.current.delete(group.id);
            }}
            role="treeitem"
            className={`gm-list-row${group.id === selectedId ? " gm-list-row--selected" : ""}`}
            style={{ paddingLeft: `${0.6 + (level - 1) * 1.4}rem` }}
            aria-level={level}
            aria-selected={group.id === selectedId}
            aria-expanded={childCount ? isOpen : undefined}
            tabIndex={group.id === tabStopId ? 0 : -1}
            data-group-id={group.id}
            onClick={() => onSelect(group.id)}
            onKeyDown={(event) => onKeyDown(event, group.id)}
          >
            {childCount > 0 ? (
              <span
                className="gm-list-toggle"
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(group.id);
                }}
              >
                {isOpen ? <FaChevronDown /> : <FaChevronRight />}
              </span>
            ) : (
              <span className="gm-list-toggle gm-list-toggle--empty" aria-hidden="true" />
            )}
            <span className="gm-list-name">{group.name}</span>
            <span className="gm-list-meta">
              {plural(count, "booking")}
              {childCount > 0 && ` · ${plural(childCount, "subgroup")}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
