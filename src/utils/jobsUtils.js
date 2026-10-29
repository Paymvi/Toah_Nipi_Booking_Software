import { getBookingException, BOOKING_EXCEPTION } from "./bookingClassification.js";

/*
  Jobs (AUDIT-016, AUDIT-043; Q-021 left to judgment, Q-022 A).

  - Checklist items and Facilities rows are tasks: they have a due date,
    can be completed, and can be overdue.
  - Staff Assignments say who is doing what for a group. They show as
    "Assigned", are never open, completed or overdue, and do not count in
    the task totals.
  - Work for cancelled or waitlisted groups is hidden unless staff choose
    to show it.
*/

export const JOB_KIND = Object.freeze({ TASK: "task", ASSIGNMENT: "assignment" });

function getChecklists(booking) {
  return Array.isArray(booking?.checklists) ? booking.checklists : [];
}

function sortBySequence(items) {
  return [...(items || [])].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

export function getBookingFacilities(booking) {
  const details = booking?.rentalFormDetails || {};
  if (Array.isArray(details.facilities)) return details.facilities;
  return Array.isArray(booking?.facilities) ? booking.facilities : [];
}

function bookingFields(booking) {
  return {
    bookingId: booking.id,
    bookingName: booking.organizationName,
    bookingStartDate: booking.startDate,
    bookingEndDate: booking.endDate,
    bookingException: getBookingException(booking),
  };
}

export function getAllBookingJobs(bookings = []) {
  return bookings.flatMap((booking) => {
    const checklistJobs = getChecklists(booking).flatMap((checklist) =>
      sortBySequence(checklist.items).map((item) => ({
        id: `checklist-${booking.id}-${checklist.id}-${item.id}`,
        kind: JOB_KIND.TASK,
        sourceType: "Checklist",
        title: item.title || "Untitled checklist item",
        role: checklist.name || "Checklist",
        assignedTo: item.assignedTo || "",
        notes: "",
        dueDate: item.dueDate || "",
        completed: Boolean(item.completed),
        completedAt: item.completedAt || "",
        completedBy: item.completedBy || "",
        ...bookingFields(booking),
      }))
    );

    const facilityJobs = getBookingFacilities(booking)
      .map((facility, index) => ({ facility, index }))
      .filter(({ facility }) => facility && (facility.task || facility.assignedTo || facility.date))
      .map(({ facility, index }) => ({
        id: `facility-${booking.id}-${index}`,
        kind: JOB_KIND.TASK,
        sourceType: "Facility",
        facilityIndex: index,
        title: facility.task || "Facility task",
        role: facility.time ? `Facilities · ${facility.time}` : "Facilities",
        assignedTo: facility.assignedTo || "",
        notes: facility.notes || "",
        dueDate: facility.date || "",
        completed: Boolean(facility.completed),
        completedAt: facility.completedAt || "",
        completedBy: facility.completedBy || "",
        ...bookingFields(booking),
      }));

    const assignmentJobs = (Array.isArray(booking.programLogisticsAssignments)
      ? booking.programLogisticsAssignments
      : []
    ).map((assignment, index) => ({
      id: `program-${booking.id}-${assignment.id || index}`,
      kind: JOB_KIND.ASSIGNMENT,
      sourceType: "Staff Assignment",
      title: `${assignment.role || "General"} assignment`,
      role: assignment.role || "General",
      assignedTo: assignment.assignedTo || "",
      notes: assignment.notes || "",
      // Shown for context only; an assignment is never due or overdue.
      dueDate: booking.startDate || "",
      completed: false,
      completedAt: "",
      completedBy: "",
      ...bookingFields(booking),
    }));

    return [...checklistJobs, ...facilityJobs, ...assignmentJobs];
  });
}

export function isJobForInactiveGroup(job) {
  return (
    job.bookingException === BOOKING_EXCEPTION.CANCELLED ||
    job.bookingException === BOOKING_EXCEPTION.WAITLIST
  );
}

export function getJobStatus(job, todayKey) {
  if (job.kind === JOB_KIND.ASSIGNMENT) return { key: "assigned", label: "Assigned" };
  if (job.completed) return { key: "completed", label: "Complete" };
  if (job.dueDate && todayKey && job.dueDate < todayKey) return { key: "overdue", label: "Overdue" };
  return { key: "open", label: "Open" };
}

export function filterJobs(jobs, { statusFilter = "open", showInactiveGroups = false } = {}) {
  return jobs.filter((job) => {
    if (!showInactiveGroups && isJobForInactiveGroup(job)) return false;
    if (statusFilter === "all") return true;
    if (job.kind === JOB_KIND.ASSIGNMENT) return statusFilter === "open";
    return statusFilter === "completed" ? job.completed : !job.completed;
  });
}

// A booking with one Facilities row marked done or not done.
export function setFacilityCompletion(booking, facilityIndex, completed, { completedBy = "", today = "" } = {}) {
  const facilities = getBookingFacilities(booking).map((facility, index) =>
    index === facilityIndex
      ? {
          ...facility,
          completed,
          completedAt: completed ? today : "",
          completedBy: completed ? completedBy : "",
        }
      : facility
  );

  return {
    ...booking,
    facilities,
    rentalFormDetails: { ...(booking.rentalFormDetails || {}), facilities },
  };
}
