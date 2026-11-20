import { useMemo, useState } from "react";

import { draftToBuild } from "../../utils/groupMapDraft";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/*
  Review of an automatic build before anything is saved. Every group and every
  parent guess can be unticked; Create saves the rest in one step, and the
  whole build can be undone later from the panel.
*/
export default function GroupMapDraft({ draft, busy, status, onCreate, onCancel }) {
  const [skippedKeys, setSkippedKeys] = useState(() => new Set());
  const [skippedParents, setSkippedParents] = useState(() => new Set());
  const [filter, setFilter] = useState("");

  const build = useMemo(() => draftToBuild(draft, { skippedKeys, skippedParents }), [draft, skippedKeys, skippedParents]);
  const parentOfKey = useMemo(() => {
    const map = new Map();
    draft.parents.forEach((parent, index) => {
      if (!skippedParents.has(index)) parent.memberKeys.forEach((key) => map.set(key, parent.name));
    });
    return map;
  }, [draft, skippedParents]);

  const newParentIds = new Set(draft.parents.filter((parent) => parent.id).map((parent) => parent.id));
  const newGroups = build.groups.filter((group) => !newParentIds.has(group.id)).length;
  const newParents = build.groups.length - newGroups;
  const joining = draft.groups.filter((group) => group.existingId && !skippedKeys.has(group.key));
  const text = filter.trim().toLowerCase();
  const shown = draft.groups.filter((group) => !text || group.names.some((item) => item.name.toLowerCase().includes(text)));

  const toggle = (setter, value) => setter((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

  return (
    <div className="gm-draft">
      <div className="gm-draft-head">
        <div>
          <h3>Automatic build: review before saving</h3>
          <p>
            Nothing is saved until you click <strong>Create</strong>. Untick anything that looks wrong. Afterwards you
            can still edit every group on the map, or undo the whole build.
          </p>
          <p className="gm-draft-summary" role="status">
            {plural(newGroups, "new group")}, {plural(newParents, "new parent organization")} (guessed),{" "}
            {plural(build.links.length, "booking name")} linked
            {joining.length > 0 && `, ${plural(joining.length, "name")} joining groups you already have`}.
          </p>
        </div>
        <div className="gm-actions">
          <button type="button" className="gm-primary" disabled={busy || build.links.length === 0} onClick={() => onCreate(build)}>
            Create {plural(build.groups.length, "group")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>

      {status && (
        <p className={`gm-status gm-status--${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>{status.text}</p>
      )}

      {draft.parents.length > 0 && (
        <section className="gm-section">
          <div className="gm-title-row">
            <h4>Parent organization guesses ({draft.parents.length})</h4>
            <button
              type="button"
              onClick={() => setSkippedParents(skippedParents.size === draft.parents.length ? new Set() : new Set(draft.parents.map((_, index) => index)))}
            >
              {skippedParents.size === draft.parents.length ? "Use all guesses" : "Skip all guesses"}
            </button>
          </div>
          <p className="gm-muted">
            Based only on names starting with the same words. Untick any that aren't really one organization.
          </p>
          <ul className="gm-rows">
            {draft.parents.map((parent, index) => (
              <li key={`${parent.name}-${index}`}>
                <label className="gm-draft-check">
                  <input type="checkbox" checked={!skippedParents.has(index)} onChange={() => toggle(setSkippedParents, index)} />
                  <span className="gm-row-main">
                    <strong>
                      Put {plural(parent.memberKeys.length, "group")} under “{parent.name}”
                      <span className="gm-badge">Guess</span>
                    </strong>
                    <span className="gm-muted">
                      {parent.existingId ? "An existing group. " : parent.fromKey ? "One of these booking names. " : "A new parent organization. "}
                      {parent.memberKeys.map((key) => draft.groups.find((group) => group.key === key)?.name).join(", ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="gm-section">
        <h4>Groups ({draft.groups.length})</h4>
        <input
          className="gm-filter"
          type="search"
          placeholder="Filter by name"
          aria-label="Filter draft groups"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <ul className="gm-rows">
          {shown.map((group) => (
            <li key={group.key}>
              <label className="gm-draft-check">
                <input type="checkbox" checked={!skippedKeys.has(group.key)} onChange={() => toggle(setSkippedKeys, group.key)} />
                <span className="gm-row-main">
                  <strong>
                    {group.name}
                    {group.existingId && <span className="gm-badge">Existing group</span>}
                    {parentOfKey.has(group.key) && <span className="gm-badge">Under {parentOfKey.get(group.key)}</span>}
                  </strong>
                  <span className="gm-muted">
                    {plural(group.count, "booking")}
                    {(group.names.length > 1 || group.names[0].name !== group.name) &&
                      ` · names: ${group.names.map((item) => `“${item.name}”`).join(", ")}`}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {!shown.length && <p className="gm-muted">No groups match.</p>}
      </section>

      {draft.leftOut.length > 0 && (
        <section className="gm-section">
          <h4>Left out ({draft.leftOut.length})</h4>
          <ul className="gm-rows">
            {draft.leftOut.map((item) => (
              <li key={item.name}>
                <span className="gm-row-main">
                  <strong>{item.name}</strong>
                  <span className="gm-muted">{item.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
