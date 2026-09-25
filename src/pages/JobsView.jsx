import { useMemo, useState } from "react";

import {
  FaCheckCircle,
  FaTasks,
} from "react-icons/fa";

import {
  getBookingChecklists,
  sortChecklistItems,
} from "../components/BookingChecklists";

import {
  getLocalDate,
} from "../utils/dateUtils";


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


function getProgramLogisticsAssignments(booking) {
  return Array.isArray(booking.programLogisticsAssignments)
    ? booking.programLogisticsAssignments
    : [];
}


function getAllBookingJobs(inquiryBookings) {
  return inquiryBookings.flatMap((booking) => {
    const checklistJobs = getBookingChecklists(booking).flatMap((checklist) =>
      sortChecklistItems(checklist.items || []).map((item) => ({
        id: `checklist-${booking.id}-${checklist.id}-${item.id}`,
        sourceType: "Checklist",
        title: item.title || "Untitled checklist item",
        role: checklist.name || "Checklist",
        assignedTo: item.assignedTo || "",
        notes: "",
        dueDate: item.dueDate || "",
        completed: Boolean(item.completed),
        completedAt: item.completedAt || "",
        completedBy: item.completedBy || "",

        bookingId: booking.id,
        bookingName: booking.organizationName,
        bookingStartDate: booking.startDate,
        bookingEndDate: booking.endDate,
        bookingStatus: booking.status,
      }))
    );

    const programLogisticsJobs = getProgramLogisticsAssignments(booking).map(
      (assignment) => ({
        id: `program-${booking.id}-${assignment.id}`,
        sourceType: "Program Logistics",
        title: `${assignment.role || "General"} assignment`,
        role: assignment.role || "General",
        assignedTo: assignment.assignedTo || "",
        notes: assignment.notes || "",
        dueDate: booking.startDate || "",
        completed: false,
        completedAt: "",
        completedBy: "",

        bookingId: booking.id,
        bookingName: booking.organizationName,
        bookingStartDate: booking.startDate,
        bookingEndDate: booking.endDate,
        bookingStatus: booking.status,
      })
    );

    return [...checklistJobs, ...programLogisticsJobs];
  });
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

function getTaskStatusClass(task) {
  if (task.completed) {
    return "completed";
  }

  if (!task.dueDate) {
    return "open";
  }

  const today = getLocalDate(formatDateForInput(new Date()));
  const dueDate = getLocalDate(task.dueDate);

  if (dueDate && dueDate < today) {
    return "overdue";
  }

  return "open";
}

function getTaskStatusLabel(task) {
  if (task.completed) {
    return "Complete";
  }

  if (getTaskStatusClass(task) === "overdue") {
    return "Overdue";
  }

  return "Open";
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


function JobTaskCard({ task, openBookingDetail, booking }) {
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
          <strong>Due</strong>
          {task.dueDate || "No due date"}
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
}) {
  const [statusFilter, setStatusFilter] = useState("open");

  const allJobs = useMemo(
    () => getAllBookingJobs(inquiryBookings),
    [inquiryBookings]
  );

  const currentUser = staffUsers.find((user) => user.id === currentStaffUserId);
  const activeStaffUsers = staffUsers.filter((user) => user.active);

  const filteredJobs = allJobs.filter((job) => {
    if (statusFilter === "all") {
      return true;
    }

    if (statusFilter === "completed") {
      return job.completed;
    }

    return !job.completed;
  });

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

  const openJobCount = allJobs.filter((job) => !job.completed).length;
  const completedJobCount = allJobs.filter((job) => job.completed).length;
  const overdueJobCount = allJobs.filter(
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
                View checklist tasks and meals/activities assignments by staff
                member.
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
                Jobs assigned to the current staff user selected in User Admin.
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
                Grouped by the assigned staff name on checklists and
                meals/activities.
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
