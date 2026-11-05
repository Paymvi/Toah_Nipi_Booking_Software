/*
  Guest-portal rules shared by Portal Admin, Overview and backups (AUDIT-029,
  AUDIT-038, AUDIT-050, Q-016, Q-017, Q-018).
*/

/*
  A production build without VITE_GUEST_PORTAL_BASE_URL has no portal
  address, so no link is built (AUDIT-022). Development builds keep the
  local portal default.
*/
export const PORTAL_BASE_URL_MISSING_MESSAGE =
  "The guest portal address (VITE_GUEST_PORTAL_BASE_URL) is not set for this build, so portal links cannot be created. Ask the site administrator to set it.";

export function getPortalBaseUrl() {
  const configured = String(import.meta.env.VITE_GUEST_PORTAL_BASE_URL || "").trim();

  if (!configured && import.meta.env.PROD) {
    return "";
  }

  return (configured || "http://localhost:5173").replace(/\/$/, "");
}

export function buildPortalUrl(portalToken) {
  const baseUrl = getPortalBaseUrl();

  if (!portalToken || !baseUrl) {
    return "";
  }

  return `${baseUrl}/?portal=${portalToken}`;
}

/*
  Progress (Q-016): a guest submission waiting for review counts half of
  that item; staff confirmation completes it. Every place that shows a
  portal percentage uses this function.
*/
export const PORTAL_PROGRESS_WEIGHT = Object.freeze({
  completed: 1,
  needsReview: 0.5,
  waitingOnGuest: 0,
  notStarted: 0,
});

export function getPortalProgress(checklistItems = []) {
  const count = (status) => checklistItems.filter((item) => item.status === status).length;
  const total = checklistItems.length;
  const completed = count("completed");
  const needsReview = count("needsReview");
  const waitingOnGuest = count("waitingOnGuest");
  const notStarted = count("notStarted");
  const earned = checklistItems.reduce(
    (sum, item) => sum + (PORTAL_PROGRESS_WEIGHT[item.status] || 0),
    0
  );

  return {
    total,
    completed,
    needsReview,
    waitingOnGuest,
    notStarted,
    open: waitingOnGuest + notStarted,
    percent: total > 0 ? Math.round((earned / total) * 100) : 0,
  };
}

/*
  100% complete: every task confirmed by staff. A submission waiting for
  review is not complete. Same as getPortalProgress().percent === 100,
  without its rounding (199 of 200 confirmed + 1 in review rounds to 100).
*/
export function isPortalComplete(checklistItems = []) {
  return checklistItems.length > 0 && checklistItems.every((item) => item.status === "completed");
}

export function portalItemHasGuestSubmission(item) {
  return Boolean(
    (item?.uploadedFileName && item?.uploadedFilePath) ||
      String(item?.responseText || "").trim()
  );
}

/*
  Status a confirmed task returns to when staff reopen it: back to review
  if the guest had submitted something, otherwise back to waiting on the
  guest (or not started for tasks with no guest action).
*/
export function getReopenedPortalItemStatus(item) {
  if (portalItemHasGuestSubmission(item)) return "needsReview";
  return item?.guestAction && item.guestAction !== "none" ? "waitingOnGuest" : "notStarted";
}

// Q-018: a due date after arrival is allowed, with a warning.
export function getDueDateWarning(dueDate, arrivalDate) {
  if (!dueDate || !arrivalDate) return "";
  return String(dueDate) > String(arrivalDate)
    ? `Due ${dueDate}, after the group arrives on ${arrivalDate}.`
    : "";
}

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
}

// Q-018 / AUDIT-050: a repeat is allowed after a warning, never blocked.
export function getAlreadyAssignedTaskIds(existingItems = [], taskOptions = []) {
  const itemIds = new Set(existingItems.map((item) => item.itemId));
  const titles = new Set(existingItems.map((item) => normalizeTitle(item.title)));
  return new Set(
    taskOptions
      .filter((task) => itemIds.has(task.id) || titles.has(normalizeTitle(task.title)))
      .map((task) => task.id)
  );
}

/*
  A standard document counts as already assigned only when a staff-shared
  row has the same file name AND title, so a custom upload that happens
  to share a file name no longer looks like the standard document.
*/
export function getAlreadyAssignedDocumentIds(existingDocuments = [], documentOptions = []) {
  const keys = new Set(
    existingDocuments
      .filter((document) => !document.uploadedByGuest)
      .map((document) => `${normalizeTitle(document.fileName)}|${normalizeTitle(document.title)}`)
  );
  return new Set(
    documentOptions
      .filter((option) => keys.has(`${normalizeTitle(option.fileName)}|${normalizeTitle(option.title)}`))
      .map((option) => option.id)
  );
}

export function sanitizePortalDocumentFileName(fileName) {
  const cleanedName = String(fileName || "upload")
    .trim()
    .replace(/[/\\]+/g, "-")
    .replace(/[^a-zA-Z0-9._() -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);

  return cleanedName || "upload";
}

// Where a guest upload goes when its task is removed: outside the
// portal-token folder the guest can read, so the file is kept but hidden.
export function getRemovedUploadStoragePath(bookingId, itemRowId, uploadedFilePath) {
  const fileName = String(uploadedFilePath || "").split("/").pop() || "upload";
  return `removed-uploads/${bookingId}/${itemRowId}/${fileName}`;
}
