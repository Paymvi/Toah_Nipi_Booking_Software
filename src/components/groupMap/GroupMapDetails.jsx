import { useMemo, useState } from "react";

import { formatDateRange } from "../../utils/dateUtils";
import {
  getAncestors,
  getBookingCounts,
  getChildren,
  getDescendantIds,
  getDirectBookings,
  getParentOptions,
  suggestNames,
} from "../../utils/groupMap";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const LIST_LIMIT = 25;

function ShowMore({ total, shown, onMore }) {
  if (total <= shown) return null;
  return (
    <button type="button" className="gm-link-button" onClick={onMore}>
      Show all {total}
    </button>
  );
}

/*
  Everything about the selected group, or (nothing selected) what the map is,
  a New group form and the booking names no group claims yet. Remounted per
  group (key), so half-typed forms never carry over to another group.
*/
export default function GroupMapDetails({
  index,
  group,
  canEdit,
  busy,
  unlinkedNames,
  contactsForBookings,
  act,
  api,
  onSelect,
  onFocus,
  onOpenBooking,
  onShowContact,
  newGroupInputRef,
}) {
  if (!group) {
    return (
      <Overview
        index={index}
        canEdit={canEdit}
        busy={busy}
        unlinkedNames={unlinkedNames}
        act={act}
        api={api}
        onSelect={onSelect}
        newGroupInputRef={newGroupInputRef}
      />
    );
  }
  return (
    <GroupDetails
      index={index}
      group={group}
      canEdit={canEdit}
      busy={busy}
      unlinkedNames={unlinkedNames}
      contactsForBookings={contactsForBookings}
      act={act}
      api={api}
      onSelect={onSelect}
      onFocus={onFocus}
      onOpenBooking={onOpenBooking}
      onShowContact={onShowContact}
    />
  );
}

function Overview({ index, canEdit, busy, unlinkedNames, act, api, onSelect, newGroupInputRef }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(LIST_LIMIT);
  const parentOptions = useMemo(() => getParentOptions(index, null), [index]);
  const matches = unlinkedNames.filter((item) => item.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const create = (event) => {
    event.preventDefault();
    act(() => api.createGroup(name, parentId || null), `Created "${name.trim()}".`, (created) => {
      setName("");
      onSelect(created?.id);
    });
  };

  const createFromName = (bookingName) =>
    act(async () => {
      const created = await api.createGroup(bookingName.slice(0, 200), null);
      await api.linkGroupName(bookingName, created.id);
      return created;
    }, `Created "${bookingName.trim()}" and linked its bookings.`, (created) => onSelect(created?.id));

  return (
    <div className="gm-details-body">
      <section className="gm-section">
        <h3>What this map shows</h3>
        <p>
          Each box is a group. A line points from a parent organization to one of its subgroups, for example a
          national organization → a region → a campus chapter. Subgroups keep their own bookings and contacts;
          linking groups never combines or changes them.
        </p>
        <p>
          The number on a box counts that group's own bookings, not its subgroups'. A booking belongs to a group
          when its organization name is one of the group's linked names. Select a group to see its details.
        </p>
      </section>

      {canEdit && (
        <section className="gm-section">
          <h3>New group</h3>
          <form className="gm-form" onSubmit={create}>
            <label>
              <span>Name</span>
              <input ref={newGroupInputRef} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              <span>Parent organization (optional)</span>
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">None: a top-level group</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="gm-primary" disabled={busy || !name.trim()}>Create group</button>
          </form>
        </section>
      )}

      <section className="gm-section">
        <h3>Booking names not linked to a group ({unlinkedNames.length})</h3>
        <p className="gm-muted">
          Names exactly as typed on bookings (hosting left out). Nothing is linked automatically: {canEdit
            ? "create a group from a name, or select a group and link names to it."
            : "admin and staff accounts can link them."}
        </p>
        {unlinkedNames.length > 0 ? (
          <>
            <input
              className="gm-filter"
              type="search"
              placeholder="Filter names"
              aria-label="Filter unlinked booking names"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <ul className="gm-rows">
              {matches.slice(0, limit).map((item) => (
                <li key={item.name}>
                  <span className="gm-row-main">
                    <strong>{item.name}</strong>
                    <span className="gm-muted">{plural(item.count, "booking")}</span>
                  </span>
                  {canEdit && (
                    <button type="button" disabled={busy} onClick={() => createFromName(item.name)}>
                      Create group
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!matches.length && <p className="gm-muted">No names match.</p>}
            <ShowMore total={matches.length} shown={limit} onMore={() => setLimit(matches.length)} />
          </>
        ) : (
          <p className="gm-muted">Every booking name is linked to a group.</p>
        )}
      </section>
    </div>
  );
}

function GroupDetails({
  index,
  group,
  canEdit,
  busy,
  unlinkedNames,
  contactsForBookings,
  act,
  api,
  onSelect,
  onFocus,
  onOpenBooking,
  onShowContact,
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(group.name);
  const [parentChoice, setParentChoice] = useState("");
  const [subgroupName, setSubgroupName] = useState("");
  const [nameChoice, setNameChoice] = useState("");
  const [bookingLimit, setBookingLimit] = useState(LIST_LIMIT);
  const [contactLimit, setContactLimit] = useState(LIST_LIMIT);

  const ancestors = getAncestors(index, group.id);
  const parent = ancestors[ancestors.length - 1] || null;
  const children = getChildren(index, group.id);
  const descendantCount = getDescendantIds(index, group.id).length;
  const counts = getBookingCounts(index, group.id);
  const linkedNames = index.namesOf.get(group.id) || [];
  const bookings = useMemo(
    () => [...getDirectBookings(index, group.id)].sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || ""))),
    [index, group.id]
  );
  const contacts = useMemo(() => contactsForBookings(bookings), [contactsForBookings, bookings]);
  const parentOptions = useMemo(
    () => getParentOptions(index, group.id).filter((option) => option.id !== group.parent_id),
    [index, group.id, group.parent_id]
  );
  const suggestions = suggestNames(group.name, unlinkedNames);
  const canDelete = children.length === 0 && linkedNames.length === 0;

  const rename = (event) => {
    event.preventDefault();
    act(() => api.renameGroup(group, newName), `Renamed to "${newName.trim()}".`, () => setRenaming(false));
  };

  const move = () => {
    const target = index.byId.get(parentChoice);
    if (!target) return;
    act(() => api.setGroupParent(group, target.id), `"${group.name}" is now a subgroup of "${target.name}".`, () => setParentChoice(""));
  };

  const removeParent = () => {
    const ok = window.confirm(
      `Make "${group.name}" a top-level group?\n\nIt stops being a subgroup of "${parent.name}". ` +
        "Its own subgroups, bookings and contacts stay with it. Nothing is deleted."
    );
    if (ok) act(() => api.setGroupParent(group, null), `"${group.name}" is now a top-level group.`);
  };

  const addSubgroup = (event) => {
    event.preventDefault();
    act(() => api.createGroup(subgroupName, group.id), `Added "${subgroupName.trim()}" under "${group.name}".`, () => setSubgroupName(""));
  };

  const link = (bookingName) =>
    act(() => api.linkGroupName(bookingName, group.id), `Linked "${bookingName}".`, () => setNameChoice(""));

  const unlink = (bookingName) =>
    act(() => api.unlinkGroupName(bookingName, group.id), `Unlinked "${bookingName}". Its bookings are unchanged.`);

  const remove = () => {
    const ok = window.confirm(`Delete the group "${group.name}"?\n\nNo bookings, contacts or documents are deleted.`);
    if (ok) act(() => api.deleteGroup(group), `Deleted "${group.name}".`, () => onSelect(parent?.id || null));
  };

  return (
    <div className="gm-details-body">
      <header className="gm-details-head">
        {ancestors.length > 0 && (
          <nav className="gm-breadcrumb" aria-label="Parent organizations">
            {ancestors.map((ancestor) => (
              <span key={ancestor.id}>
                <button type="button" className="gm-link-button" onClick={() => onSelect(ancestor.id)}>{ancestor.name}</button>
                <span aria-hidden="true"> › </span>
              </span>
            ))}
          </nav>
        )}
        {renaming ? (
          <form className="gm-form gm-form--inline" onSubmit={rename}>
            <label>
              <span className="gm-visually-hidden">Group name</span>
              <input value={newName} maxLength={200} onChange={(event) => setNewName(event.target.value)} autoFocus required />
            </label>
            <button type="submit" className="gm-primary" disabled={busy || !newName.trim() || newName.trim() === group.name}>Save</button>
            <button type="button" onClick={() => { setRenaming(false); setNewName(group.name); }}>Cancel</button>
          </form>
        ) : (
          <div className="gm-title-row">
            <h3 id="gm-details-title">{group.name}</h3>
            {canEdit && <button type="button" onClick={() => setRenaming(true)} disabled={busy}>Rename</button>}
          </div>
        )}
        <dl className="gm-counts">
          <div>
            <dt>Bookings for this group</dt>
            <dd>{counts.direct}</dd>
          </div>
          {descendantCount > 0 && (
            <div>
              <dt>Including its {plural(descendantCount, "subgroup")}</dt>
              <dd>{counts.withSubgroups}</dd>
            </div>
          )}
          <div>
            <dt>Direct subgroups</dt>
            <dd>{children.length}</dd>
          </div>
        </dl>
        <div className="gm-actions">
          {(children.length > 0) && (
            <button type="button" onClick={() => onFocus(group.id)}>Show only this organization</button>
          )}
        </div>
      </header>

      <section className="gm-section">
        <h4>Parent organization</h4>
        {parent ? (
          <p>
            <button type="button" className="gm-link-button" onClick={() => onSelect(parent.id)}>{parent.name}</button>
          </p>
        ) : (
          <p className="gm-muted">None. This is a top-level group.</p>
        )}
        {canEdit && (
          <div className="gm-form">
            <label>
              <span>{parent ? "Move under a different parent" : "Make it a subgroup of"}</span>
              <select value={parentChoice} onChange={(event) => setParentChoice(event.target.value)}>
                <option value="">Choose a group…</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="gm-actions">
              <button type="button" className="gm-primary" disabled={busy || !parentChoice} onClick={move}>
                {parent ? "Move" : "Set parent"}
              </button>
              {parent && <button type="button" disabled={busy} onClick={removeParent}>Remove parent</button>}
            </div>
            <p className="gm-muted">Its own subgroups move with it. Bookings and contacts don't change.</p>
          </div>
        )}
      </section>

      <section className="gm-section">
        <h4>Subgroups ({children.length})</h4>
        {children.length ? (
          <ul className="gm-chips">
            {children.map((child) => (
              <li key={child.id}>
                <button type="button" className="gm-link-button" onClick={() => onSelect(child.id)}>{child.name}</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gm-muted">No subgroups.</p>
        )}
        {canEdit && (
          <form className="gm-form gm-form--inline" onSubmit={addSubgroup}>
            <label>
              <span className="gm-visually-hidden">New subgroup name</span>
              <input placeholder="New subgroup name" value={subgroupName} maxLength={200} onChange={(event) => setSubgroupName(event.target.value)} />
            </label>
            <button type="submit" disabled={busy || !subgroupName.trim()}>Add subgroup</button>
          </form>
        )}
      </section>

      <section className="gm-section">
        <h4>Linked booking names ({linkedNames.length})</h4>
        <p className="gm-muted">Bookings with exactly these organization names belong to this group.</p>
        {linkedNames.length > 0 && (
          <ul className="gm-rows">
            {linkedNames.map((bookingName) => (
              <li key={bookingName}>
                <span className="gm-row-main">
                  <strong>{bookingName}</strong>
                  <span className="gm-muted">{plural(index.bookingsByName.get(bookingName)?.length || 0, "booking")}</span>
                </span>
                {canEdit && <button type="button" disabled={busy} onClick={() => unlink(bookingName)} aria-label={`Unlink ${bookingName}`}>Unlink</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <>
            <div className="gm-form gm-form--inline">
              <label>
                <span className="gm-visually-hidden">Booking name to link</span>
                <select value={nameChoice} onChange={(event) => setNameChoice(event.target.value)}>
                  <option value="">Link a booking name…</option>
                  {unlinkedNames.map((item) => (
                    <option key={item.name} value={item.name}>{item.name} ({item.count})</option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busy || !nameChoice} onClick={() => link(nameChoice)}>Link</button>
            </div>
            {suggestions.length > 0 && (
              <div className="gm-suggestions">
                <p className="gm-muted">Unlinked names that look similar. Check each one before linking:</p>
                <ul className="gm-rows">
                  {suggestions.map((item) => (
                    <li key={item.name}>
                      <span className="gm-row-main">
                        <strong>{item.name}</strong>
                        <span className="gm-muted">{plural(item.count, "booking")}</span>
                      </span>
                      <button type="button" disabled={busy} onClick={() => link(item.name)} aria-label={`Link ${item.name}`}>Link</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="gm-section">
        <h4>{plural(bookings.length, "booking")} for this group</h4>
        {descendantCount > 0 && <p className="gm-muted">Subgroups' bookings are listed on each subgroup.</p>}
        {bookings.length ? (
          <ul className="gm-rows">
            {bookings.slice(0, bookingLimit).map((booking) => (
              <li key={booking.id}>
                <span className="gm-row-main">
                  <strong>{formatDateRange(booking.startDate, booking.endDate) || "No dates"}</strong>
                  <span className="gm-muted">
                    {[booking.organizationName, booking.status].filter(Boolean).join(" · ")}
                  </span>
                  {booking.notes && <span className="gm-note">{booking.notes}</span>}
                </span>
                <button type="button" onClick={() => onOpenBooking(booking)}>Open booking</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gm-muted">{linkedNames.length ? "No bookings use these names." : "Link a booking name to see bookings here."}</p>
        )}
        <ShowMore total={bookings.length} shown={bookingLimit} onMore={() => setBookingLimit(bookings.length)} />
      </section>

      <section className="gm-section">
        <h4>{plural(contacts.length, "contact")} on these bookings</h4>
        {contacts.length ? (
          <ul className="gm-rows">
            {contacts.slice(0, contactLimit).map((contact) => (
              <li key={contact.id}>
                <span className="gm-row-main">
                  <strong>{contact.contactName}</strong>
                  <span className="gm-muted">{[contact.email, contact.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <button type="button" onClick={() => onShowContact(contact)}>Show in Contacts</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gm-muted">No contacts yet.</p>
        )}
        <ShowMore total={contacts.length} shown={contactLimit} onMore={() => setContactLimit(contacts.length)} />
      </section>

      {canEdit && (
        <section className="gm-section">
          <h4>Delete group</h4>
          <p className="gm-muted">
            {canDelete
              ? "Removes only this group. No bookings, contacts or documents are deleted."
              : `Move its ${plural(children.length, "subgroup")} elsewhere (or remove their parent) and unlink its ${plural(linkedNames.length, "name")} first. Nothing is deleted along with a group.`}
          </p>
          <button type="button" className="gm-danger" disabled={busy || !canDelete} onClick={remove}>Delete group</button>
        </section>
      )}
    </div>
  );
}
