import { useMemo, useState } from "react";
import {
  FaClipboardList,
  FaPlus,
  FaTimes,
  FaTrashAlt,
} from "react-icons/fa";

function createChecklistId(prefix = "checklist") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateForInput(date) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeStaffName(value) {
  return String(value || "").trim().toLowerCase();
}

function getStaffOptionNames(staffUsers, currentAssignedTo = "") {
  const activeStaffNames = (staffUsers || [])
    .filter((user) => user.active)
    .map((user) => String(user.name || "").trim())
    .filter(Boolean);

  const currentName = String(currentAssignedTo || "").trim();

  if (
    currentName &&
    !activeStaffNames.some(
      (name) => normalizeStaffName(name) === normalizeStaffName(currentName)
    )
  ) {
    activeStaffNames.push(currentName);
  }

  const uniqueNames = new Map();

  activeStaffNames.forEach((name) => {
    const key = normalizeStaffName(name);

    if (key && !uniqueNames.has(key)) {
      uniqueNames.set(key, name);
    }
  });

  return Array.from(uniqueNames.values()).sort((a, b) => a.localeCompare(b));
}

function StaffAssignedSelect({ value, staffUsers, onChange }) {
  const staffOptionNames = useMemo(
    () => getStaffOptionNames(staffUsers, value),
    [staffUsers, value]
  );

  return (
    <select
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Unassigned</option>

      {staffOptionNames.map((name) => (
        <option value={name} key={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

export function getBookingChecklists(booking) {
  return Array.isArray(booking?.checklists) ? booking.checklists : [];
}

export function sortChecklistItems(items) {
  return [...(items || [])].sort(
    (a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)
  );
}

function getChecklistProgress(checklist) {
  const items = Array.isArray(checklist.items) ? checklist.items : [];
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.completed).length;

  return {
    totalItems,
    completedItems,
    percentage:
      totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
  };
}

function getNextChecklistSequence(checklist) {
  const sequences = (checklist.items || [])
    .map((item) => Number(item.sequence || 0))
    .filter((sequence) => sequence > 0);

  return sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
}

function createEmptyChecklistItemForm(nextSequence = 1) {
  return {
    sequence: nextSequence,
    title: "",
    dueDate: "",
    assignedTo: "",
  };
}

export default function BookingChecklists({
  booking,
  onSaveBooking,
  staffUsers = [],
  currentStaffUserId = "",
}) {
  const checklists = getBookingChecklists(booking);

  const [newChecklistName, setNewChecklistName] = useState("");
  const [openChecklistId, setOpenChecklistId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [itemForm, setItemForm] = useState(() =>
    createEmptyChecklistItemForm()
  );

  const currentStaffUser = staffUsers.find(
    (user) => user.id === currentStaffUserId
  );

  const openChecklist = checklists.find(
    (checklist) => checklist.id === openChecklistId
  );

  const saveChecklists = (nextChecklists) => {
    onSaveBooking({
      ...booking,
      checklists: nextChecklists,
    });
  };

  const handleAddChecklist = (event) => {
    event.preventDefault();

    const checklistName = newChecklistName.trim();

    if (!checklistName) {
      return;
    }

    const nextChecklist = {
      id: createChecklistId("checklist"),
      name: checklistName,
      items: [],
    };

    saveChecklists([...checklists, nextChecklist]);
    setNewChecklistName("");
    setOpenChecklistId(nextChecklist.id);
    setEditingItemId("");
    setItemForm(createEmptyChecklistItemForm(1));
  };

  const renameChecklist = (checklist) => {
    const nextName = window.prompt("Checklist name", checklist.name);

    if (!nextName || !nextName.trim()) {
      return;
    }

    saveChecklists(
      checklists.map((currentChecklist) =>
        currentChecklist.id === checklist.id
          ? {
              ...currentChecklist,
              name: nextName.trim(),
            }
          : currentChecklist
      )
    );
  };

  const deleteChecklist = (checklistId) => {
    const confirmed = window.confirm(
      "Delete this checklist and all of its items?"
    );

    if (!confirmed) {
      return;
    }

    saveChecklists(
      checklists.filter((checklist) => checklist.id !== checklistId)
    );

    if (openChecklistId === checklistId) {
      setOpenChecklistId("");
      setEditingItemId("");
    }
  };

  const startAddingItem = (checklist) => {
    setEditingItemId("");
    setItemForm(createEmptyChecklistItemForm(getNextChecklistSequence(checklist)));
  };

  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    setItemForm({
      sequence: item.sequence || 1,
      title: item.title || "",
      dueDate: item.dueDate || "",
      assignedTo: item.assignedTo || "",
    });
  };

  const updateItemForm = (fieldName, value) => {
    setItemForm((currentForm) => ({
      ...currentForm,
      [fieldName]: value,
    }));
  };

  const handleSaveChecklistItem = (event) => {
    event.preventDefault();

    if (!openChecklist) {
      return;
    }

    const itemTitle = itemForm.title.trim();

    if (!itemTitle) {
      return;
    }

    const nextItem = {
      id: editingItemId || createChecklistId("item"),
      sequence: Number(itemForm.sequence) || 1,
      title: itemTitle,
      dueDate: itemForm.dueDate,
      assignedTo: String(itemForm.assignedTo || "").trim(),
      completed: false,
      completedAt: "",
      completedBy: "",
    };

    let updatedOpenChecklist = openChecklist;

    const nextChecklists = checklists.map((checklist) => {
      if (checklist.id !== openChecklist.id) {
        return checklist;
      }

      const existingItems = checklist.items || [];

      const nextItems = editingItemId
        ? existingItems.map((item) =>
            item.id === editingItemId
              ? {
                  ...item,
                  sequence: nextItem.sequence,
                  title: nextItem.title,
                  dueDate: nextItem.dueDate,
                  assignedTo: nextItem.assignedTo,
                }
              : item
          )
        : [...existingItems, nextItem];

      updatedOpenChecklist = {
        ...checklist,
        items: sortChecklistItems(nextItems),
      };

      return updatedOpenChecklist;
    });

    saveChecklists(nextChecklists);

    setEditingItemId("");
    setItemForm(
      createEmptyChecklistItemForm(getNextChecklistSequence(updatedOpenChecklist))
    );
  };

  const toggleChecklistItem = (checklistId, itemId) => {
    const today = formatDateForInput(new Date());
    const completedByName = currentStaffUser?.name || "Admin";

    saveChecklists(
      checklists.map((checklist) => {
        if (checklist.id !== checklistId) {
          return checklist;
        }

        return {
          ...checklist,
          items: (checklist.items || []).map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            const nextCompleted = !item.completed;

            return {
              ...item,
              completed: nextCompleted,
              completedAt: nextCompleted ? today : "",
              completedBy: nextCompleted ? completedByName : "",
            };
          }),
        };
      })
    );
  };

  const deleteChecklistItem = (checklistId, itemId) => {
    const confirmed = window.confirm("Delete this checklist item?");

    if (!confirmed) {
      return;
    }

    saveChecklists(
      checklists.map((checklist) => {
        if (checklist.id !== checklistId) {
          return checklist;
        }

        return {
          ...checklist,
          items: (checklist.items || []).filter((item) => item.id !== itemId),
        };
      })
    );
  };

  return (
    <section className="booking-checklist-page">
      <article className="dashboard-card booking-checklist-card">
        <div className="booking-checklist-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaClipboardList />
            </span>

            <div>
              <p className="dashboard-eyebrow">Booking Workflow</p>
              <h3>Checklists</h3>
              <span>
                Track internal tasks for {booking.organizationName}. No checklist
                is added by default.
              </span>
            </div>
          </div>

          <form className="booking-checklist-add-form" onSubmit={handleAddChecklist}>
            <input
              value={newChecklistName}
              placeholder="New checklist name..."
              onChange={(event) => setNewChecklistName(event.target.value)}
            />

            <button className="primary-dashboard-button" type="submit">
              <FaPlus />
              Add Checklist
            </button>
          </form>
        </div>

        {checklists.length > 0 ? (
          <div className="booking-checklist-table-wrap">
            <table className="booking-checklist-table">
              <thead>
                <tr>
                  <th aria-label="Edit"></th>
                  <th>Checklist Name</th>
                  <th>Progress</th>
                  <th>Items</th>
                  <th aria-label="Checklist Items"></th>
                  <th aria-label="Delete"></th>
                </tr>
              </thead>

              <tbody>
                {checklists.map((checklist) => {
                  const progress = getChecklistProgress(checklist);

                  return (
                    <tr key={checklist.id}>
                      <td>
                        <button
                          className="booking-checklist-icon-button"
                          type="button"
                          onClick={() => renameChecklist(checklist)}
                          aria-label={`Rename ${checklist.name}`}
                        >
                          ✎
                        </button>
                      </td>

                      <td>
                        <strong>{checklist.name}</strong>
                      </td>

                      <td>
                        <div className="booking-checklist-progress">
                          <div>
                            <span
                              style={{ width: `${progress.percentage}%` }}
                            ></span>
                          </div>

                          <small>
                            {progress.completedItems} of {progress.totalItems} complete
                          </small>
                        </div>
                      </td>

                      <td>{progress.totalItems}</td>

                      <td>
                        <button
                          className="secondary-dashboard-button"
                          type="button"
                          onClick={() => {
                            setOpenChecklistId(checklist.id);
                            startAddingItem(checklist);
                          }}
                        >
                          Checklist Items
                        </button>
                      </td>

                      <td>
                        <button
                          className="booking-checklist-delete-button"
                          type="button"
                          onClick={() => deleteChecklist(checklist.id)}
                          aria-label={`Delete ${checklist.name}`}
                        >
                          <FaTrashAlt />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No checklists yet</strong>
            <p>
              Add a checklist manually, or later you can build a template picker
              that copies a checklist onto this booking.
            </p>
          </div>
        )}
      </article>

      {openChecklist && (
        <div className="booking-checklist-modal-backdrop" role="presentation">
          <section
            className="booking-checklist-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${openChecklist.name} checklist items`}
          >
            <header className="booking-checklist-modal-header">
              <div>
                <h3>Checklist Items - {openChecklist.name}</h3>
                <p>{booking.organizationName}</p>
              </div>

              <button
                className="booking-checklist-modal-close"
                type="button"
                onClick={() => {
                  setOpenChecklistId("");
                  setEditingItemId("");
                }}
                aria-label="Close checklist items"
              >
                <FaTimes />
              </button>
            </header>

            <form
              className="booking-checklist-item-form"
              onSubmit={handleSaveChecklistItem}
            >
              <label>
                <span>Sequence</span>
                <input
                  type="number"
                  min="1"
                  value={itemForm.sequence}
                  onChange={(event) =>
                    updateItemForm("sequence", event.target.value)
                  }
                />
              </label>

              <label className="booking-checklist-item-title-field">
                <span>Title</span>
                <input
                  value={itemForm.title}
                  placeholder="Example: Call primary contact"
                  onChange={(event) => updateItemForm("title", event.target.value)}
                />
              </label>

              <label>
                <span>Due</span>
                <input
                  type="date"
                  value={itemForm.dueDate}
                  onChange={(event) => updateItemForm("dueDate", event.target.value)}
                />
              </label>

              <label>
                <span>Assigned To</span>
                <StaffAssignedSelect
                  value={itemForm.assignedTo}
                  staffUsers={staffUsers}
                  onChange={(value) => updateItemForm("assignedTo", value)}
                />
              </label>

              <div className="booking-checklist-item-form-actions">
                {editingItemId && (
                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={() => {
                      setEditingItemId("");
                      startAddingItem(openChecklist);
                    }}
                  >
                    Cancel Edit
                  </button>
                )}

                <button className="primary-dashboard-button" type="submit">
                  {editingItemId ? "Save Item" : "Add Checklist Item"}
                </button>
              </div>
            </form>

            <div className="booking-checklist-items-table-wrap">
              <table className="booking-checklist-items-table">
                <thead>
                  <tr>
                    <th aria-label="Edit"></th>
                    <th aria-label="Complete"></th>
                    <th>Sequence</th>
                    <th>Title</th>
                    <th>Due</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th aria-label="Delete"></th>
                  </tr>
                </thead>

                <tbody>
                  {sortChecklistItems(openChecklist.items).map((item) => (
                    <tr
                      className={item.completed ? "checklist-item-completed" : ""}
                      key={item.id}
                    >
                      <td>
                        <button
                          className="booking-checklist-icon-button"
                          type="button"
                          onClick={() => startEditingItem(item)}
                          aria-label={`Edit ${item.title}`}
                        >
                          ✎
                        </button>
                      </td>

                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(item.completed)}
                          onChange={() =>
                            toggleChecklistItem(openChecklist.id, item.id)
                          }
                          aria-label={`Toggle ${item.title}`}
                        />
                      </td>

                      <td>{item.sequence}</td>

                      <td>
                        <strong>{item.title}</strong>
                      </td>

                      <td>{item.dueDate || "—"}</td>

                      <td>{item.assignedTo || "—"}</td>

                      <td>
                        <button
                          className={`booking-checklist-status-button ${
                            item.completed ? "completed" : ""
                          }`}
                          type="button"
                          onClick={() =>
                            toggleChecklistItem(openChecklist.id, item.id)
                          }
                        >
                          {item.completed ? (
                            <>
                              Completed {item.completedAt || ""}
                              {item.completedBy ? ` by ${item.completedBy}` : ""}
                            </>
                          ) : (
                            "Not Complete"
                          )}
                        </button>
                      </td>

                      <td>
                        <button
                          className="booking-checklist-delete-button"
                          type="button"
                          onClick={() =>
                            deleteChecklistItem(openChecklist.id, item.id)
                          }
                          aria-label={`Delete ${item.title}`}
                        >
                          <FaTrashAlt />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {(openChecklist.items || []).length === 0 && (
                    <tr>
                      <td colSpan="8">
                        <div className="booking-checklist-empty-row">
                          No checklist items yet. Add the first item above.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer className="booking-checklist-modal-footer">
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={() => setOpenChecklistId("")}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}