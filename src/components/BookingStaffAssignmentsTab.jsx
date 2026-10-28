import { useEffect, useRef, useState } from "react";
import {
  FaBroom,
  FaCheckCircle,
  FaClipboardList,
  FaExclamationTriangle,
  FaHiking,
  FaPen,
  FaPlus,
  FaTools,
  FaTrashAlt,
  FaUserFriends,
  FaUtensils,
} from "react-icons/fa";

/*
  Staff assignments are stored on the booking as
  programLogisticsAssignments (program_logistics_assignments in
  Supabase) with the shape { id, role, assignedTo, notes }.
  The Jobs page reads the same array, so keep that shape.
*/

const ASSIGNMENT_AREAS = [
  { value: "Meals", icon: FaUtensils },
  { value: "Recreation", icon: FaHiking },
  { value: "Setup", icon: FaTools },
  { value: "Cleanup", icon: FaBroom },
  { value: "General", icon: FaClipboardList },
];

const DEFAULT_AREA = "General";

function normalizeStaffName(value) {
  return String(value || "").trim().toLowerCase();
}

function getAreaLabel(role) {
  return String(role || "").trim() || DEFAULT_AREA;
}

function getAreaIcon(role) {
  const area = ASSIGNMENT_AREAS.find((item) => item.value === role);

  return area ? area.icon : FaClipboardList;
}

function getAreaClassName(role) {
  const area = ASSIGNMENT_AREAS.find((item) => item.value === role);

  return area ? `area-${area.value.toLowerCase()}` : "area-other";
}

function createAssignmentId() {
  return `program-assignment-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/*
  Older records may be missing an id. Give them a stable one based on
  their position so they can still be edited or removed.
*/
function getBookingAssignments(booking) {
  const assignments = Array.isArray(booking.programLogisticsAssignments)
    ? booking.programLogisticsAssignments
    : [];

  return assignments
    .filter((assignment) => assignment && typeof assignment === "object")
    .map((assignment, index) => ({
      ...assignment,
      id: assignment.id || `program-assignment-legacy-${index}`,
    }));
}

function groupAssignmentsByArea(assignments) {
  const groups = new Map();

  ASSIGNMENT_AREAS.forEach((area) => groups.set(area.value, []));

  assignments.forEach((assignment) => {
    const areaLabel = getAreaLabel(assignment.role);

    if (!groups.has(areaLabel)) {
      groups.set(areaLabel, []);
    }

    groups.get(areaLabel).push(assignment);
  });

  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 0)
    .map(([area, items]) => ({ area, items }));
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function StaffAssignmentEditor({
  draft,
  isNew,
  isSaving,
  errorMessage,
  activeStaffUsers,
  onChange,
  onCancel,
  onSubmit,
}) {
  const staffSelectRef = useRef(null);

  useEffect(() => {
    staffSelectRef.current?.focus();
  }, []);

  const currentArea = getAreaLabel(draft.role);
  const areaOptions = ASSIGNMENT_AREAS.some(
    (area) => area.value === currentArea
  )
    ? ASSIGNMENT_AREAS
    : [...ASSIGNMENT_AREAS, { value: currentArea, icon: FaClipboardList }];

  const assignedToIsListed =
    !draft.assignedTo ||
    activeStaffUsers.some(
      (user) =>
        normalizeStaffName(user.name) === normalizeStaffName(draft.assignedTo)
    );

  const fieldIdPrefix = `staff-assignment-${draft.id}`;

  return (
    <form
      className="staff-assignment-editor"
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isSaving) {
          event.preventDefault();
          onCancel();
        }
      }}
      aria-label={isNew ? "New staff assignment" : "Edit staff assignment"}
    >
      <div className="staff-assignment-editor-title">
        <strong>{isNew ? "New assignment" : "Edit assignment"}</strong>
        <span>Choose an area, the staff member responsible, and what they should do.</span>
      </div>

      <fieldset className="staff-assignment-area-picker">
        <legend>Area</legend>

        <div className="staff-assignment-area-options">
          {areaOptions.map((area) => {
            const AreaIcon = area.icon;

            return (
              <label
                className={`staff-assignment-area-option ${getAreaClassName(
                  area.value
                )} ${currentArea === area.value ? "selected" : ""}`}
                key={area.value}
              >
                <input
                  type="radio"
                  name={`${fieldIdPrefix}-area`}
                  value={area.value}
                  checked={currentArea === area.value}
                  onChange={() => onChange("role", area.value)}
                  disabled={isSaving}
                />
                <AreaIcon aria-hidden="true" />
                <span>{area.value}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="staff-assignment-editor-fields">
        <label className="staff-assignment-field" htmlFor={`${fieldIdPrefix}-staff`}>
          <span>Staff member</span>
          <select
            id={`${fieldIdPrefix}-staff`}
            ref={staffSelectRef}
            value={draft.assignedTo}
            onChange={(event) => onChange("assignedTo", event.target.value)}
            disabled={isSaving}
          >
            <option value="">Unassigned</option>

            {activeStaffUsers.map((user) => (
              <option value={user.name} key={user.id}>
                {user.name}
              </option>
            ))}

            {!assignedToIsListed && (
              <option value={draft.assignedTo}>
                {draft.assignedTo} (not in active staff)
              </option>
            )}
          </select>

          {activeStaffUsers.length === 0 && (
            <small>No active staff yet. Add people in User Admin to assign them.</small>
          )}
        </label>

        <label className="staff-assignment-field" htmlFor={`${fieldIdPrefix}-notes`}>
          <span>Instructions</span>
          <textarea
            id={`${fieldIdPrefix}-notes`}
            rows={3}
            value={draft.notes}
            placeholder="Example: Confirm fire pit supplies"
            onChange={(event) => onChange("notes", event.target.value)}
            disabled={isSaving}
          />
        </label>
      </div>

      {errorMessage && (
        <p className="staff-assignment-editor-error" role="alert">
          <FaExclamationTriangle aria-hidden="true" />
          {errorMessage}
        </p>
      )}

      <div className="staff-assignment-editor-actions">
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>

        <button
          className="primary-dashboard-button"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : isNew ? "Add Assignment" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export default function BookingStaffAssignmentsTab({
  booking,
  onSaveBooking,
  staffUsers = [],
}) {
  const [draft, setDraft] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const assignments = getBookingAssignments(booking);
  const groups = groupAssignmentsByArea(assignments);
  const activeStaffUsers = staffUsers.filter((user) => user.active);
  const unassignedCount = assignments.filter(
    (assignment) => !String(assignment.assignedTo || "").trim()
  ).length;

  useEffect(() => {
    if (feedback?.type !== "success") {
      return undefined;
    }

    const timeoutId = setTimeout(() => setFeedback(null), 4000);

    return () => clearTimeout(timeoutId);
  }, [feedback]);

  const isActiveStaffName = (name) =>
    activeStaffUsers.some(
      (user) => normalizeStaffName(user.name) === normalizeStaffName(name)
    );

  /*
    Always build the next list from the booking prop so a save only
    changes programLogisticsAssignments and keeps every other field.
  */
  const saveAssignments = async (nextAssignments, successMessage) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await onSaveBooking({
        ...booking,
        programLogisticsAssignments: nextAssignments,
      });

      setFeedback({ type: "success", message: successMessage });
      return true;
    } catch (error) {
      console.error("Could not save staff assignments:", error);
      setFeedback({
        type: "error",
        message: "Could not save staff assignments. Your changes were not saved — please try again.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openNewAssignment = (area = DEFAULT_AREA) => {
    setPendingRemoveId("");
    setEditorError("");
    setFeedback(null);
    setDraft({
      id: createAssignmentId(),
      role: area,
      assignedTo: "",
      notes: "",
      isNew: true,
    });
  };

  const openEditAssignment = (assignment) => {
    setPendingRemoveId("");
    setEditorError("");
    setFeedback(null);
    setDraft({
      ...assignment,
      role: getAreaLabel(assignment.role),
      assignedTo: String(assignment.assignedTo || ""),
      notes: String(assignment.notes || ""),
      isNew: false,
    });
  };

  const closeEditor = () => {
    setDraft(null);
    setEditorError("");
  };

  const updateDraft = (fieldName, value) => {
    setEditorError("");
    setDraft((currentDraft) => ({
      ...currentDraft,
      [fieldName]: value,
    }));
  };

  const submitDraft = async (event) => {
    event.preventDefault();

    const assignedTo = String(draft.assignedTo || "").trim();
    const notes = String(draft.notes || "").trim();

    if (!assignedTo && !notes) {
      setEditorError("Choose a staff member or add instructions before saving.");
      return;
    }

    const { isNew, ...draftFields } = draft;
    const cleanedAssignment = {
      ...draftFields,
      role: getAreaLabel(draft.role),
      assignedTo,
      notes,
    };

    const nextAssignments = isNew
      ? [...assignments, cleanedAssignment]
      : assignments.map((assignment) =>
          assignment.id === cleanedAssignment.id ? cleanedAssignment : assignment
        );

    const saved = await saveAssignments(
      nextAssignments,
      isNew ? "Assignment added." : "Assignment updated."
    );

    if (saved) {
      closeEditor();
    } else {
      setEditorError("This assignment was not saved. Check your connection and try again.");
    }
  };

  const removeAssignment = async (assignmentId) => {
    const saved = await saveAssignments(
      assignments.filter((assignment) => assignment.id !== assignmentId),
      "Assignment removed."
    );

    if (saved) {
      setPendingRemoveId("");
    }
  };

  const isEditorOpen = Boolean(draft);
  const addDisabled = isEditorOpen || isSaving;

  const renderAssignment = (assignment) => {
    if (draft && !draft.isNew && draft.id === assignment.id) {
      return (
        <li className="staff-assignment-item is-editing" key={assignment.id}>
          <StaffAssignmentEditor
            draft={draft}
            isNew={false}
            isSaving={isSaving}
            errorMessage={editorError}
            activeStaffUsers={activeStaffUsers}
            onChange={updateDraft}
            onCancel={closeEditor}
            onSubmit={submitDraft}
          />
        </li>
      );
    }

    const assignedTo = String(assignment.assignedTo || "").trim();
    const notes = String(assignment.notes || "").trim();
    const areaLabel = getAreaLabel(assignment.role);
    const descriptor = `${areaLabel} assignment${assignedTo ? ` for ${assignedTo}` : ""}`;
    const isConfirmingRemove = pendingRemoveId === assignment.id;

    return (
      <li
        className={`staff-assignment-item ${isConfirmingRemove ? "is-confirming" : ""}`}
        key={assignment.id}
      >
        <div
          className={`staff-assignment-avatar ${assignedTo ? "" : "is-unassigned"}`}
          aria-hidden="true"
        >
          {assignedTo ? getInitials(assignedTo) : "?"}
        </div>

        <div className="staff-assignment-body">
          <div className="staff-assignment-person">
            {assignedTo ? (
              <strong>{assignedTo}</strong>
            ) : (
              <strong className="is-unassigned">Unassigned</strong>
            )}

            {assignedTo && !isActiveStaffName(assignedTo) && (
              <span className="staff-assignment-tag">Not in active staff</span>
            )}
          </div>

          {notes ? (
            <p className="staff-assignment-notes">{notes}</p>
          ) : (
            <p className="staff-assignment-notes is-empty">No instructions added</p>
          )}
        </div>

        {isConfirmingRemove ? (
          <div className="staff-assignment-confirm" role="group" aria-label={`Remove ${descriptor}?`}>
            <span>Remove? It will also leave the Jobs page.</span>
            <div>
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={() => setPendingRemoveId("")}
                disabled={isSaving}
              >
                Keep
              </button>
              <button
                className="staff-assignment-remove-confirm-button"
                type="button"
                onClick={() => removeAssignment(assignment.id)}
                disabled={isSaving}
              >
                {isSaving ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        ) : (
          <div className="staff-assignment-actions">
            <button
              className="staff-assignment-icon-button"
              type="button"
              onClick={() => openEditAssignment(assignment)}
              disabled={isEditorOpen || isSaving}
              aria-label={`Edit ${descriptor}`}
              title="Edit"
            >
              <FaPen aria-hidden="true" />
            </button>
            <button
              className="staff-assignment-icon-button is-danger"
              type="button"
              onClick={() => {
                setFeedback(null);
                setPendingRemoveId(assignment.id);
              }}
              disabled={isEditorOpen || isSaving}
              aria-label={`Remove ${descriptor}`}
              title="Remove"
            >
              <FaTrashAlt aria-hidden="true" />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="staff-assignments-tab">
      <article className="staff-assignments-card">
        <header className="staff-assignments-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaUserFriends />
            </span>

            <div>
              <p className="dashboard-eyebrow">Program Staff</p>
              <h3>Staff Assignments</h3>
              <span>
                Decide who is covering meals, recreation, setup, and cleanup for{" "}
                {booking.organizationName || "this booking"}. Each assignment
                appears on the Jobs page for the assigned staff member.
              </span>
            </div>
          </div>

          <button
            className="primary-dashboard-button"
            type="button"
            onClick={() => openNewAssignment()}
            disabled={addDisabled}
          >
            <FaPlus />
            Add Assignment
          </button>
        </header>

        <div className="staff-assignments-feedback" aria-live="polite">
          {feedback && (
            <p
              className={`staff-assignments-feedback-message is-${feedback.type}`}
              role={feedback.type === "error" ? "alert" : undefined}
            >
              {feedback.type === "success" ? (
                <FaCheckCircle aria-hidden="true" />
              ) : (
                <FaExclamationTriangle aria-hidden="true" />
              )}
              {feedback.message}
            </p>
          )}
        </div>

        {draft?.isNew && (
          <div className="staff-assignments-new">
            <StaffAssignmentEditor
              draft={draft}
              isNew
              isSaving={isSaving}
              errorMessage={editorError}
              activeStaffUsers={activeStaffUsers}
              onChange={updateDraft}
              onCancel={closeEditor}
              onSubmit={submitDraft}
            />
          </div>
        )}

        {assignments.length > 0 ? (
          <div className="staff-assignments-groups">
            {unassignedCount > 0 && (
              <p className="staff-assignments-unassigned-note">
                <FaExclamationTriangle aria-hidden="true" />
                {unassignedCount === 1
                  ? "1 assignment still needs a staff member."
                  : `${unassignedCount} assignments still need a staff member.`}
              </p>
            )}

            {groups.map(({ area, items }) => {
              const AreaIcon = getAreaIcon(area);
              const headingId = `staff-assignments-group-${area
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`;

              return (
                <section
                  className={`staff-assignments-group ${getAreaClassName(area)}`}
                  key={area}
                  aria-labelledby={headingId}
                >
                  <header className="staff-assignments-group-header">
                    <span className="staff-assignments-group-icon" aria-hidden="true">
                      <AreaIcon />
                    </span>
                    <h4 id={headingId}>{area}</h4>
                    <span className="staff-assignments-group-count">
                      {items.length}
                    </span>
                    <button
                      className="staff-assignments-group-add"
                      type="button"
                      onClick={() => openNewAssignment(area)}
                      disabled={addDisabled}
                      aria-label={`Add ${area} assignment`}
                    >
                      <FaPlus aria-hidden="true" />
                      Add
                    </button>
                  </header>

                  <ul className="staff-assignments-list">
                    {items.map(renderAssignment)}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          !draft && (
            <div className="staff-assignments-empty">
              <span className="staff-assignments-empty-icon" aria-hidden="true">
                <FaUserFriends />
              </span>
              <strong>No staff assigned yet</strong>
              <p>
                Assignments tell your team who is handling each part of this
                group&apos;s stay. Pick an area to get started.
              </p>

              <div className="staff-assignments-empty-actions">
                {ASSIGNMENT_AREAS.map((area) => {
                  const AreaIcon = area.icon;

                  return (
                    <button
                      className={`staff-assignments-empty-area ${getAreaClassName(area.value)}`}
                      type="button"
                      key={area.value}
                      onClick={() => openNewAssignment(area.value)}
                      disabled={isSaving}
                    >
                      <AreaIcon aria-hidden="true" />
                      {area.value}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}
      </article>
    </section>
  );
}
