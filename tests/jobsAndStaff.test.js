import test from "node:test";
import assert from "node:assert/strict";

import {
  filterJobs,
  getAllBookingJobs,
  getJobStatus,
  setFacilityCompletion,
} from "../src/utils/jobsUtils.js";
import {
  getStaffDirectoryChanges,
  getUnlistedStaffNames,
} from "../src/services/staffDirectory.js";

const booking = {
  id: "b1",
  organizationName: "Camp",
  startDate: "2026-06-01",
  status: "Confirmed",
  checklists: [{ id: "c1", name: "Prep", items: [{ id: "i1", title: "Order food", dueDate: "2026-05-20", assignedTo: "Sam" }] }],
  programLogisticsAssignments: [{ id: "a1", role: "Meals", assignedTo: "Pat" }],
  rentalFormDetails: {
    facilities: [{ date: "2026-06-01", time: "15:00", task: "Set up chairs", assignedTo: "Lee", notes: "Bethel" }],
  },
};

test("staff assignments are informational and never overdue", () => {
  const jobs = getAllBookingJobs([booking]);
  const assignment = jobs.find((job) => job.sourceType === "Staff Assignment");
  assert.deepEqual(getJobStatus(assignment, "2027-01-01"), { key: "assigned", label: "Assigned" });
  const checklist = jobs.find((job) => job.sourceType === "Checklist");
  assert.equal(getJobStatus(checklist, "2027-01-01").key, "overdue");
});

test("facility rows are tasks, due on their date, with the assigned person", () => {
  const facility = getAllBookingJobs([booking]).find((job) => job.sourceType === "Facility");
  assert.equal(facility.title, "Set up chairs");
  assert.equal(facility.dueDate, "2026-06-01");
  assert.equal(facility.assignedTo, "Lee");
  assert.equal(getJobStatus(facility, "2026-06-02").key, "overdue");
});

test("facility completion is stored on the booking in both copies", () => {
  const done = setFacilityCompletion(booking, 0, true, { completedBy: "Lee", today: "2026-06-01" });
  assert.equal(done.rentalFormDetails.facilities[0].completed, true);
  assert.equal(done.rentalFormDetails.facilities[0].completedBy, "Lee");
  assert.deepEqual(done.facilities, done.rentalFormDetails.facilities);
  const job = getAllBookingJobs([done]).find((item) => item.sourceType === "Facility");
  assert.equal(getJobStatus(job, "2026-06-02").key, "completed");
});

test("cancelled and waitlisted groups' work is hidden unless shown", () => {
  const cancelled = { ...booking, id: "b2", status: "Cancelled" };
  const jobs = getAllBookingJobs([booking, cancelled]);
  assert.ok(filterJobs(jobs).every((job) => job.bookingId === "b1"));
  assert.ok(filterJobs(jobs, { showInactiveGroups: true }).some((job) => job.bookingId === "b2"));
  assert.equal(filterJobs(jobs, { statusFilter: "completed" }).length, 0);
});

test("staff directory changes are computed per person", () => {
  const before = [{ id: "u1", name: "Sam", active: true }, { id: "u2", name: "Old", active: true }];
  const after = [{ id: "u1", name: "Sam", active: false }, { id: "u3", name: "New", active: true }];
  const { upserts, deletes } = getStaffDirectoryChanges(before, after);
  assert.deepEqual(upserts.map((row) => row.id), ["u1", "u3"]);
  assert.deepEqual(deletes, ["u2"]);
});

test("names on bookings are never guessed into directory people", () => {
  const names = getUnlistedStaffNames(["Sam", "sam ", "Sam Lee", "Pat"], [{ name: "Sam" }]);
  assert.deepEqual(names, ["Pat", "Sam Lee"]);
});
