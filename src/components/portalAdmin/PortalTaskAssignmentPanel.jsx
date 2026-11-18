import { useRef, useState } from "react";
import { FaExclamationTriangle, FaCheckCircle, FaPlus } from "react-icons/fa";
import { getAlreadyAssignedTaskIds, getDueDateWarning } from "../../utils/portalRules";
import { getAssignmentRequestIds } from "../../services/portalAdminData";

/* =========================================================
   PORTAL TASK CATALOG
   Staff can only assign tasks from this list.
========================================================= */

const PORTAL_TASK_OPTIONS = [
  {
    id: "contract",
    title: "Sign and return contract",
    guestAction: "upload_file",
    actionLabel: "File upload",
    defaultRequired: true,
  },
  {
    id: "guest-policy-documents",
    title: "Sign and return Guest Policy Document(s)",
    guestAction: "upload_file",
    actionLabel: "File upload",
    defaultRequired: true,
  },
  {
    id: "guest-cleanup-procedures",
    title: "Sign and return Guest Clean-Up Procedures (IV guests)",
    guestAction: "upload_file",
    actionLabel: "File upload",
    defaultRequired: true,
  },
  {
    id: "insurance",
    title: "Submit Certificate of Insurance",
    guestAction: "upload_file",
    actionLabel: "File upload",
    defaultRequired: true,
  },
  {
    id: "deposit",
    title: "Pay deposit",
    guestAction: "none",
    actionLabel: "Staff updates",
    defaultRequired: true,
  },
  {
    id: "balance",
    title: "Pay balance on retreat",
    guestAction: "none",
    actionLabel: "Staff updates",
    defaultRequired: true,
  },
  {
    id: "schedule",
    title: "Submit Schedule",
    guestAction: "upload_file",
    actionLabel: "File upload",
    defaultRequired: true,
  },
  {
    id: "food-allergy-information",
    title:
      "Submit food allergy information in group (name of guest and specific food allergy)",
    guestAction: "mark_ready",
    actionLabel: "Submit",
    defaultRequired: true,
  },
  {
    id: "liability-release-sent",
    title: "Confirm Liability Release Form was sent to all guests",
    guestAction: "mark_ready",
    actionLabel: "Confirm",
    defaultRequired: true,
  },
  {
    id: "liability-release-completed",
    title: "Confirm Liability Release Form was completed by all guests",
    guestAction: "mark_ready",
    actionLabel: "Confirm",
    defaultRequired: true,
  },
  {
    id: "guest-count",
    title: "Confirm final guest counts (full-time, part-time, Day Use)",
    guestAction: "mark_ready",
    actionLabel: "Submit",
    defaultRequired: true,
  },
];

/* =========================================================
   TASK ASSIGNMENT
========================================================= */

function createTaskAssignmentDraft(
  record
) {
  // Nothing is preselected (Q-018); an existing task is flagged, not blocked.
  const alreadyAssignedIds =
    getAlreadyAssignedTaskIds(
      record.checklistItems,
      PORTAL_TASK_OPTIONS
    );

  return Object.fromEntries(
    PORTAL_TASK_OPTIONS.map(
      (task) => [
        task.id,
        {
          selected:
            false,

          dueDate:
            "",

          required:
            task.defaultRequired,

          alreadyAssigned:
            alreadyAssignedIds.has(
              task.id
            ),
        },
      ]
    )
  );
}

export default function PortalTaskAssignmentPanel({
  record,
  isAssigning,
  onAssignTasks,
  onClose,
}) {
  const [
    taskDrafts,
    setTaskDrafts,
  ] =
    useState(
      () =>
        createTaskAssignmentDraft(
          record
        )
    );

    const [
    assignmentError,
    setAssignmentError,
  ] =
    useState("");

  const pendingTaskRequestRef =
    useRef(null);

  // Another booking, or its tasks were reloaded: start again from the saved tasks.
  const [draftSource, setDraftSource] =
    useState({ id: record.id, items: record.checklistItems });

  if (
    draftSource.id !== record.id ||
    draftSource.items !== record.checklistItems
  ) {
    setDraftSource({ id: record.id, items: record.checklistItems });
    setTaskDrafts(
      createTaskAssignmentDraft(
        record
      )
    );

    setAssignmentError(
      ""
    );
  }

    const selectedCount =
    Object.values(
      taskDrafts
    ).filter(
      (draft) =>
        draft.selected
    ).length;

  // Every task can be assigned again after a warning.
  const availableCount =
    PORTAL_TASK_OPTIONS.length;



  function updateTaskDraft(
    taskId,
    changes
  ) {
    setTaskDrafts(
      (currentDrafts) => ({
        ...currentDrafts,

        [taskId]: {
          ...currentDrafts[
            taskId
          ],

          ...changes,
        },
      })
    );
  }


  async function handleAssignSelected() {
    const selectedTasks =
      PORTAL_TASK_OPTIONS
        .filter(
          (task) => {
            const draft =
              taskDrafts[
                task.id
              ];

                        return Boolean(
              draft?.selected
            );
          }
        )
        .map(
          (
            task,
            index
          ) => {
            const draft =
              taskDrafts[
                task.id
              ];

            return {
              itemId:
                task.id,

              title:
                task.title,

              guestAction:
                task.guestAction,

              dueDate:
                draft.dueDate,

              required:
                Boolean(
                  draft.required
                ),

              sortOrder:
                record
                  .checklistItems
                  .length +
                index +
                1,
            };
          }
        );

        if (
      selectedTasks.length === 0
    ) {
      setAssignmentError(
        "Choose at least one task to assign."
      );

      return;
    }

    const repeatTitles = selectedTasks
      .filter((task) => taskDrafts[task.itemId]?.alreadyAssigned)
      .map((task) => task.title);
    const dueDateWarnings = selectedTasks
      .map((task) => {
        const warning = getDueDateWarning(task.dueDate, record.startDate);
        return warning ? `${task.title}: ${warning}` : "";
      })
      .filter(Boolean);

    if (
      (repeatTitles.length > 0 || dueDateWarnings.length > 0) &&
      !window.confirm(
        [
          repeatTitles.length
            ? `Already assigned to this group: ${repeatTitles.join(", ")}. Assign another copy?`
            : "",
          ...dueDateWarnings,
          "",
          "Continue?",
        ]
          .filter((line, index, lines) => line || index === lines.length - 2)
          .join("\n")
      )
    ) {
      return;
    }

    const requestIds = getAssignmentRequestIds(
      pendingTaskRequestRef,
      selectedTasks
        .map((task) => `${task.itemId}:${task.dueDate}:${task.required}`)
        .join("|"),
      selectedTasks.map((task) => task.itemId)
    );

    try {
      setAssignmentError(
        ""
      );
      await onAssignTasks(
        record,
        selectedTasks.map((task) => ({
          ...task,
          requestId: requestIds[task.itemId],
        }))
      );
      pendingTaskRequestRef.current = null;
    } catch (error) {
      console.error(
        "Could not assign portal tasks:",
        error
      );

      setAssignmentError(
        error?.message ||
          "Could not assign the selected tasks."
      );
    }
  }


  return (
    <section
      className="portal-task-assignment-panel"
      data-tutorial-target="portal-task-panel"
      data-tutorial-unsaved={selectedCount > 0 ? "task choices in Portal Admin" : undefined}
    >
      <div className="portal-task-assignment-header">
        <div>
          <p>
            Checklist Assignment
          </p>

          <h4>
            Assign tasks to{" "}
            {
              record.organizationName
            }
          </h4>

                    <span>
            Choose from the approved
            task list below. Nothing is
            preselected. A task the group
            already has can be added again
            after a warning.
          </span>
        </div>

        <button
          className="portal-task-assignment-close"
          type="button"
          onClick={
            onClose
          }
        >
          Close
        </button>
      </div>


      {availableCount ===
      0 ? (
        <div className="portal-task-assignment-complete">
          <FaCheckCircle />

          <div>
            <strong>
              Every available task is
              already assigned
            </strong>

            <span>
              This group already has
              the full checklist.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="portal-task-assignment-table" data-tutorial-target="portal-task-table">
            <div className="portal-task-assignment-table-header">
              <span>
                Task
              </span>

              <span>
                Guest action
              </span>

              <span>
                Due date
              </span>

              <span>
                Required
              </span>
            </div>

            {PORTAL_TASK_OPTIONS.map(
              (task) => {
                const draft =
                  taskDrafts[
                    task.id
                  ];

                                const disabled =
                  false;
                const alreadyAssigned =
                  draft
                    ?.alreadyAssigned;
                const dueDateWarning =
                  getDueDateWarning(
                    draft?.dueDate,
                    record.startDate
                  );
                return (
                  <div
                    className={`portal-task-option-row ${
                      draft
                        ?.selected
                        ? "selected"
                        : ""
                    } ${
                      alreadyAssigned
                        ? "assigned"
                        : ""
                    }`}
                    data-tutorial-target={draft?.selected ? "portal-task-selected" : undefined}
                    key={
                      task.id
                    }
                  >
                    <label className="portal-task-option-main">
                      <input
                        type="checkbox"
                        checked={
                          Boolean(
                            draft
                              ?.selected
                          )
                        }
                        disabled={
                          disabled ||
                          isAssigning
                        }
                        onChange={(
                          event
                        ) =>
                          updateTaskDraft(
                            task.id,
                            {
                              selected:
                                event
                                  .target
                                  .checked,
                            }
                          )
                        }
                      />

                                            <span className="portal-task-option-check">
                        {alreadyAssigned
                          ? "✓"
                          : ""}
                      </span>
                      <span>
                        <strong>
                          {
                            task.title
                          }
                        </strong>
                        {alreadyAssigned && (
                          <small>
                            Already assigned;
                            selecting adds
                            another copy
                          </small>
                        )}
                        {dueDateWarning && (
                          <small className="portal-due-date-warning">
                            {dueDateWarning}
                          </small>
                        )}
                      </span>
                    </label>

                    <div>
                      <span
                        className={`portal-task-action-pill portal-task-action-${task.guestAction}`}
                      >
                        {
                          task.actionLabel
                        }
                      </span>
                    </div>

                    <div>
                      <input
                        className="portal-task-due-date"
                        type="date"
                        value={
                          draft
                            ?.dueDate ||
                          ""
                        }
                        disabled={
                          disabled ||
                          !draft
                            ?.selected ||
                          isAssigning
                        }
                        onChange={(
                          event
                        ) =>
                          updateTaskDraft(
                            task.id,
                            {
                              dueDate:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />
                    </div>

                    <label className="portal-task-required-toggle">
                      <input
                        type="checkbox"
                        checked={
                          Boolean(
                            draft
                              ?.required
                          )
                        }
                        disabled={
                          disabled ||
                          !draft
                            ?.selected ||
                          isAssigning
                        }
                        onChange={(
                          event
                        ) =>
                          updateTaskDraft(
                            task.id,
                            {
                              required:
                                event
                                  .target
                                  .checked,
                            }
                          )
                        }
                      />

                      <span>
                        {draft
                          ?.required
                          ? "Required"
                          : "Optional"}
                      </span>
                    </label>
                  </div>
                );
              }
            )}
          </div>


          {assignmentError && (
            <div className="portal-task-assignment-error">
              <FaExclamationTriangle />

              <span>
                {
                  assignmentError
                }
              </span>
            </div>
          )}


          <div className="portal-task-assignment-footer">
            <span data-tutorial-target="portal-task-count">
              {selectedCount ===
              0
                ? "Select one or more tasks."
                : `${selectedCount} task${
                    selectedCount ===
                    1
                      ? ""
                      : "s"
                  } selected`}
            </span>

            <button
              className="primary-dashboard-button"
              type="button"
              disabled={
                selectedCount ===
                  0 ||
                isAssigning
              }
              data-tutorial-target="portal-task-assign"
              data-tutorial-guard
              onClick={
                handleAssignSelected
              }
            >
              <FaPlus />
              {isAssigning
                ? "Assigning..."
                : `Assign ${
                    selectedCount ||
                    ""
                  } Task${
                    selectedCount ===
                    1
                      ? ""
                      : "s"
                  }`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
