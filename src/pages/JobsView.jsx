import { useMemo, useState } from "react";

import {
  FaCheckCircle,
  FaTasks,
} from "react-icons/fa";

import {
  filterJobs,
  getAllBookingJobs,
  getJobStatus,
  isJobForInactiveGroup,
  JOB_KIND,
  setFacilityCompletion,
} from "../utils/jobsUtils";



function normalizeStaffName(value) {
  return String(value || "").trim().toLowerCase();
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


export function getAssignedStaffNamesFromBookings(inquiryBookings) {
  const assignedNames = new Set();

  getAllBookingJobs(inquiryBookings).forEach((job) => {
    const assignedTo = String(job.assignedTo || "").trim();

    if (assignedTo) {
      assignedNames.add(assignedTo);
    }
  });

  return Array.from(assignedNames).sort((a, b) => a.localeCompare(b));
}

function getTodayKey() {
  return formatDateForInput(new Date());
}

function getTaskStatusClass(task) {
  return getJobStatus(task, getTodayKey()).key;
}

function getTaskStatusLabel(task) {
  return getJobStatus(task, getTodayKey()).label;
}

function sortJobsByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) {
      return 0;
    }

    if (!a.dueDate) {
      return 1;
    }

    if (!b.dueDate) {
      return -1;
    }

    return a.dueDate.localeCompare(b.dueDate);
  });
}


function JobTaskCard({ task, openBookingDetail, booking, onToggleFacility, isSaving }) {
  const statusClass = getTaskStatusClass(task);

  return (
    <article className={`job-task-card job-task-card-${statusClass}`}>
      <div className="job-task-main">
        <div>
          <span className={`job-status-pill ${statusClass}`}>
            {getTaskStatusLabel(task)}
          </span>

                    <h4>{task.title}</h4>
          <p>
            {task.bookingName} · {task.sourceType} · {task.role}
            {isJobForInactiveGroup(task)
              ? ` · ${task.bookingException === "cancelled" ? "Cancelled group" : "Waitlisted group"}`
              : ""}
          </p>
        </div>

        {task.completed ? (
          <FaCheckCircle className="job-complete-icon" />
        ) : (
          <FaTasks className="job-open-icon" />
        )}
      </div>

      <div className="job-task-meta">
                <span>
          <strong>{task.kind === JOB_KIND.ASSIGNMENT ? "Group arrives" : "Due"}</strong>
          {task.dueDate || "No date"}
        </span>

        <span>
          <strong>Assigned To</strong>
          {task.assignedTo || "Unassigned"}
        </span>

        <span>
          <strong>Type</strong>
          {task.sourceType}
        </span>
      </div>

            {task.notes && <p className="job-task-notes">{task.notes}</p>}

      {task.completed && task.completedBy && (
        <p className="job-task-notes">
          Completed {task.completedAt} by {task.completedBy}
        </p>
      )}

      {task.sourceType === "Facility" && onToggleFacility && (
        <label className="job-task-complete-toggle">
          <input
            type="checkbox"
            checked={task.completed}
            disabled={isSaving}
            onChange={() => onToggleFacility(task)}
          />
          {task.completed ? "Done" : "Mark done"}
        </label>
      )}

      {booking && (
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={() => openBookingDetail(booking)}
        >
          Open Booking
        </button>
      )}
    </article>
  );
}

export default function JobsView({
  inquiryBookings,
  staffUsers,
  currentStaffUserId,
  openBookingDetail,
  onSaveBooking,
}) {
  const [statusFilter, setStatusFilter] = useState("open");
  const [showInactiveGroups, setShowInactiveGroups] = useState(false);
  const [savingJobId, setSavingJobId] = useState("");

  const allJobs = useMemo(
    () => getAllBookingJobs(inquiryBookings),
    [inquiryBookings]
  );

  const currentUser = staffUsers.find((user) => user.id === currentStaffUserId);
  const activeStaffUsers = staffUsers.filter((user) => user.active);

    const filteredJobs = filterJobs(allJobs, {
    statusFilter,
    showInactiveGroups,
  });

  const hiddenInactiveJobCount = allJobs.filter(isJobForInactiveGroup).length;

  // Facilities rows are completed here; checklists on the booking's tab.
  const toggleFacilityJob = async (job) => {
    const booking = inquiryBookings.find((item) => item.id === job.bookingId);

    if (!booking || !onSaveBooking) {
      return;
    }

    if (!job.completed && !currentUser) {
      alert('Choose your name under "Working as" in User Admin first, so the task records who completed it.');
      return;
    }

    setSavingJobId(job.id);

    try {
      await onSaveBooking(
        setFacilityCompletion(booking, job.facilityIndex, !job.completed, {
          completedBy: currentUser?.name || "",
          today: getTodayKey(),
        })
      );
    } catch {
      // The save handler already explained the failure.
    } finally {
      setSavingJobId("");
    }
  };

  const myJobs = currentUser
    ? filteredJobs.filter(
        (job) =>
          normalizeStaffName(job.assignedTo) ===
          normalizeStaffName(currentUser.name)
      )
    : [];

  const unassignedJobs = filteredJobs.filter(
    (job) => !String(job.assignedTo || "").trim()
  );

  const findBookingForJob = (job) =>
    inquiryBookings.find((booking) => booking.id === job.bookingId);

    // Totals count tasks only; staff assignments are informational.
  const countedJobs = filterJobs(allJobs, { statusFilter: "all", showInactiveGroups }).filter(
    (job) => job.kind === JOB_KIND.TASK
  );
  const openJobCount = countedJobs.filter((job) => !job.completed).length;
  const completedJobCount = countedJobs.filter((job) => job.completed).length;
  const overdueJobCount = countedJobs.filter(
    (job) => getTaskStatusClass(job) === "overdue"
  ).length;

  return (
    <section className="jobs-page">
      <article className="dashboard-card jobs-hero-card">
        <div className="jobs-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaTasks />
            </span>

            <div>
              <p className="dashboard-eyebrow">Jobs</p>
              <h2>Staff Tasks</h2>
                            <span>
                Checklist and Facilities tasks, plus who is assigned to each
                group (staff assignments show as "Assigned" and are never
                overdue).
              </span>
            </div>
          </div>

          <label className="jobs-filter-field">
            <span>Show</span>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="open">Open Jobs</option>
              <option value="completed">Completed Jobs</option>
                            <option value="all">All Jobs</option>
            </select>
          </label>

          <label className="jobs-inactive-toggle">
            <input
              type="checkbox"
              checked={showInactiveGroups}
              onChange={(event) => setShowInactiveGroups(event.target.checked)}
            />
            Show cancelled and waitlisted groups
            {!showInactiveGroups && hiddenInactiveJobCount > 0
              ? ` (${hiddenInactiveJobCount} hidden)`
              : ""}
          </label>
        </div>

        <div className="jobs-summary-grid">
          <div>
            <small>Open</small>
            <strong>{openJobCount}</strong>
          </div>

          <div>
            <small>Overdue</small>
            <strong>{overdueJobCount}</strong>
          </div>

          <div>
            <small>Completed</small>
            <strong>{completedJobCount}</strong>
          </div>

          <div>
            <small>Unassigned</small>
            <strong>{unassignedJobs.length}</strong>
          </div>
        </div>
      </article>

      <section className="jobs-two-column-layout">
        <article className="dashboard-card jobs-panel">
          <div className="jobs-panel-header">
            <div>
              <p className="dashboard-eyebrow">My Work</p>
              <h3>{currentUser ? `${currentUser.name}'s Jobs` : "My Jobs"}</h3>
                            <span>
                Jobs for the person chosen under "Working as" in User Admin.
              </span>
            </div>
          </div>

          <div className="jobs-task-list">
            {sortJobsByDueDate(myJobs).length > 0 ? (
              sortJobsByDueDate(myJobs).map((job) => (
                                <JobTaskCard
                  key={job.id}
                  task={job}
                  booking={findBookingForJob(job)}
                  openBookingDetail={openBookingDetail}
                  onToggleFacility={toggleFacilityJob}
                  isSaving={savingJobId === job.id}
                />
              ))
            ) : (
              <div className="empty-state">
                <strong>No jobs assigned to you</strong>
                <p>
                  Assign checklist items or program logistics work to{" "}
                  {currentUser?.name || "the current user"} to see them here.
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-card jobs-panel">
          <div className="jobs-panel-header">
            <div>
              <p className="dashboard-eyebrow">Team Workload</p>
              <h3>Active Members & Their Jobs</h3>
                            <span>
                Grouped by the staff name on checklists, Facilities rows and
                staff assignments.
              </span>
            </div>
          </div>

          <div className="jobs-member-list">
            {activeStaffUsers.map((user) => {
              const userJobs = sortJobsByDueDate(
                filteredJobs.filter(
                  (job) =>
                    normalizeStaffName(job.assignedTo) ===
                    normalizeStaffName(user.name)
                )
              );

              return (
                <section className="jobs-member-card" key={user.id}>
                  <div className="jobs-member-header">
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.role}</span>
                    </div>

                    <em>
                      {userJobs.length} job{userJobs.length === 1 ? "" : "s"}
                    </em>
                  </div>

                  {userJobs.length > 0 ? (
                    <div className="jobs-member-tasks">
                      {userJobs.map((job) => {
                        const booking = findBookingForJob(job);

                        return (
                          <button
                            className={`jobs-member-task-row jobs-member-task-${getTaskStatusClass(
                              job
                            )}`}
                            type="button"
                            key={job.id}
                            onClick={() => booking && openBookingDetail(booking)}
                          >
                            <span>{job.title}</span>
                            <small>{job.bookingName}</small>
                            <small>{job.sourceType}</small>
                            <em>{job.dueDate || "No due date"}</em>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="jobs-member-empty">No matching jobs.</p>
                  )}
                </section>
              );
            })}

            {unassignedJobs.length > 0 && (
              <section className="jobs-member-card jobs-unassigned-card">
                <div className="jobs-member-header">
                  <div>
                    <strong>Unassigned</strong>
                    <span>Needs assignment</span>
                  </div>

                  <em>
                    {unassignedJobs.length} job
                    {unassignedJobs.length === 1 ? "" : "s"}
                  </em>
                </div>

                <div className="jobs-member-tasks">
                  {sortJobsByDueDate(unassignedJobs).map((job) => {
                    const booking = findBookingForJob(job);

                    return (
                      <button
                        className={`jobs-member-task-row jobs-member-task-${getTaskStatusClass(
                          job
                        )}`}
                        type="button"
                        key={job.id}
                        onClick={() => booking && openBookingDetail(booking)}
                      >
                        <span>{job.title}</span>
                        <small>{job.bookingName}</small>
                        <small>{job.sourceType}</small>
                        <em>{job.dueDate || "No due date"}</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
