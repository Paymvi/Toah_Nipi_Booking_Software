/*
  Tutorial gnome: the parts of the tutorial engine that are not React.

  - Targets: elements opt in with data-tutorial-target="<id>" (several ids
    may be space-separated). Ids are listed in TUTORIAL_TARGETS
    (tutorials.js); nothing here relies on class names or DOM depth.
  - Step context: the small set of state checks tutorial steps use to
    decide that the person actually did the step.
  - Placement maths for the dialogue and pointer (pure, unit tested).
  - Progress storage: completed tutorial ids and the one unfinished
    tutorial (id, step, mode). No booking or guest data is ever stored.

  Importing this file never touches the DOM, so tests can load it in Node.
*/

export const TEXT_FIELD_IDLE_MS = 1500;
export const MOBILE_BREAKPOINT = 640;

/* =========================================================
   TARGETS
========================================================= */

export function targetSelector(id) {
  return `[data-tutorial-target~="${id}"]`;
}

function isShown(element) {
  // The Master Spreadsheet stays mounted but aria-hidden when another view is open.
  if (element.getClientRects().length === 0) return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  return window.getComputedStyle(element).visibility !== "hidden";
}

// First visible element for a target id, or for the first id in a list that has one.
export function findTarget(target) {
  const ids = Array.isArray(target) ? target : [target];

  for (const id of ids) {
    for (const element of document.querySelectorAll(targetSelector(id))) {
      if (isShown(element)) return element;
    }
  }

  return null;
}

export function matchesTarget(node, target) {
  const ids = Array.isArray(target) ? target : [target];
  return ids.some((id) => node?.closest?.(targetSelector(id)));
}

// What a person may use to find their way back when a step's target is missing. Nothing here saves.
export function isWayBack(node) {
  return (
    Boolean(node?.closest?.(".sidebar-link")) ||
    matchesTarget(node, ["booking-back", "booking-tabs", "spreadsheet-search", "contacts-search"])
  );
}

function getFields(element) {
  if (!element) return [];
  if (element.matches("input, select, textarea")) return [element];
  return Array.from(element.querySelectorAll("input, select, textarea"));
}

/*
  What a step's done(ctx, start) and capture(ctx) receive. Every check reads
  the live page, so a step completes because the page is in the expected
  state, not because something was clicked.
*/
export function createStepContext(lastInputAtRef) {
  const fieldValues = (id) =>
    getFields(findTarget(id)).map((field) =>
      field.type === "checkbox" || field.type === "radio"
        ? String(field.checked)
        : String(field.value ?? "").trim()
    );

  return {
    path: () => window.location.pathname,
    visible: (id) => Boolean(findTarget(id)),
    text: (id) => findTarget(id)?.textContent.trim() ?? "",
    // Selects and date inputs: a value is a finished choice.
    hasValue: (id) => fieldValues(id).some(Boolean),
    // Text inputs: a value, and the person has left the field or paused typing.
    filled: (id) => {
      const element = findTarget(id);
      if (!element || !fieldValues(id).some(Boolean)) return false;
      const isFocused = element.contains(document.activeElement);
      return !isFocused || Date.now() - lastInputAtRef.current > TEXT_FIELD_IDLE_MS;
    },
    // A signature of every field under the target, to detect "changed since the step began".
    fields: (id) => fieldValues(id).join("\u0001"),
  };
}

export function checkStep(check, ctx, start) {
  try {
    return Boolean(check?.(ctx, start));
  } catch {
    return false;
  }
}

/* =========================================================
   STEP TRANSITIONS (pure, unit tested)
========================================================= */

export const DEMO_ACTION_TIMEOUT_MS = 8000;

/*
  What Next does in each phase. One transition runs at a time: while a step
  is getting ready, doing its demo action or celebrating, extra clicks are
  ignored so they can't skip a step or the action that leads to it.
  In demonstrations Next ends the reading time early; the action still runs.
  needsAction: the step opens the screen the next steps are on and hasn't
  happened yet, so skipping it would strand them ("wait").
*/
export function getNextAction(phase, isDemo, needsAction = false) {
  if (phase === "seeking" || phase === "working" || phase === "success") return "ignore";
  if (phase === "failed") return "retry";
  if (isDemo && phase === "active") return "hurry";
  return needsAction ? "wait" : "advance";
}

/*
  A demonstration step's action: click the target (unless the step is
  already done, e.g. reached with Back), then wait until the page shows the
  result. Resolves "done", "failed" (nothing to click, or no result within
  timeoutMs) or "cancelled" (the step was left: nothing more happens).
*/
export async function runDemoAction(
  step,
  { isDone, findClickable, click, wait, isCancelled, pollMs = 100, timeoutMs = DEMO_ACTION_TIMEOUT_MS, now = Date.now }
) {
  if (!step.demoClick || isDone()) return "done";

  const target = findClickable();
  if (!target) return "failed";
  click(target);

  const clickedAt = now();
  while (!isDone()) {
    if (now() - clickedAt >= timeoutMs) return "failed";
    await wait(pollMs);
    if (isCancelled()) return "cancelled";
  }

  return "done";
}

/* =========================================================
   PLACEMENT (pure)
========================================================= */

/*
  Places the dialogue next to the target without covering it: below, above,
  right, then left; if none fits (very large targets) it sits in the
  bottom-right corner. Small screens dock it to the bottom instead.
*/
export function placeDialogue(rect, size, viewport, margin = 12, gap = 16) {
  if (viewport.width < MOBILE_BREAKPOINT) return { dock: "bottom" };

  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const maxLeft = viewport.width - size.width - margin;
  const maxTop = viewport.height - size.height - margin;
  const corner = { top: maxTop, left: maxLeft, side: "corner" };

  if (!rect) return corner;

  const candidates = [
    { side: "below", top: rect.bottom + gap, left: clamp(rect.left, margin, maxLeft) },
    { side: "above", top: rect.top - gap - size.height, left: clamp(rect.left, margin, maxLeft) },
    { side: "right", top: clamp(rect.top, margin, maxTop), left: rect.right + gap },
    { side: "left", top: clamp(rect.top, margin, maxTop), left: rect.left - gap - size.width },
  ];

  return (
    candidates.find(
      (spot) =>
        spot.top >= margin &&
        spot.left >= margin &&
        spot.top + size.height <= viewport.height - margin &&
        spot.left + size.width <= viewport.width - margin
    ) || corner
  );
}

/*
  Places the pointer just outside the target, pointing at it: from the left
  when there is room, otherwise from above, below, or the right.
  rotation is the direction the arrow points (0 = right, 90 = down).
*/
export function placePointer(rect, viewport, size = 34, gap = 8) {
  const middleY = rect.top + rect.height / 2 - size / 2;
  const nearX = rect.left + Math.min(rect.width / 2, 48) - size / 2;

  if (rect.left >= size + gap * 2) {
    return { x: rect.left - size - gap, y: middleY, rotation: 0 };
  }

  if (rect.top >= size + gap * 2) {
    return { x: nearX, y: rect.top - size - gap, rotation: 90 };
  }

  if (viewport.height - rect.bottom >= size + gap * 2) {
    return { x: nearX, y: rect.bottom + gap, rotation: -90 };
  }

  return { x: rect.right + gap, y: middleY, rotation: 180 };
}

// The part of a rect that is on screen, or null when none of it is.
export function clipRect(rect, viewport) {
  const top = Math.max(rect.top, 0);
  const left = Math.max(rect.left, 0);
  const bottom = Math.min(rect.bottom, viewport.height);
  const right = Math.min(rect.right, viewport.width);

  if (bottom <= top || right <= left) return null;

  return { top, left, bottom, right, width: right - left, height: bottom - top };
}

/* =========================================================
   LIBRARY HELPERS (pure)
========================================================= */

export function groupTutorialsByCategory(tutorials) {
  const groups = new Map();

  for (const tutorial of tutorials) {
    if (!groups.has(tutorial.category)) groups.set(tutorial.category, []);
    groups.get(tutorial.category).push(tutorial);
  }

  return Array.from(groups, ([category, items]) => ({ category, items }));
}

export function searchTutorials(tutorials, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tutorials;

  return tutorials.filter((tutorial) => {
    const haystack = [tutorial.title, tutorial.description, tutorial.category, ...(tutorial.keywords || [])]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

// Reading time for a demonstration step, so longer explanations stay up longer.
export function getDemoStepDuration(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(3800, words * 290));
}

/* =========================================================
   PROGRESS (localStorage; tutorial ids and step numbers only)
========================================================= */

export const TUTORIAL_PROGRESS_STORAGE_KEY = "toahNipiTutorialGnomeProgress.v1";

export function emptyProgress() {
  return { completed: {}, unfinished: null };
}

export function loadTutorialProgress(storage) {
  try {
    const saved = JSON.parse(storage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return emptyProgress();

    const unfinished = saved.unfinished;
    return {
      completed: saved.completed && typeof saved.completed === "object" ? saved.completed : {},
      unfinished:
        unfinished && typeof unfinished.id === "string" && Number.isInteger(unfinished.step)
          ? { id: unfinished.id, step: unfinished.step, mode: unfinished.mode === "demo" ? "demo" : "guided" }
          : null,
    };
  } catch {
    return emptyProgress();
  }
}

export function saveTutorialProgress(storage, progress) {
  try {
    storage.setItem(TUTORIAL_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Private windows or blocked storage: progress just is not remembered.
  }
}

export function withUnfinished(progress, id, step, mode) {
  return { ...progress, unfinished: { id, step, mode } };
}

export function withCompleted(progress, id, date = new Date()) {
  return {
    completed: { ...progress.completed, [id]: date.toISOString() },
    unfinished: progress.unfinished?.id === id ? null : progress.unfinished,
  };
}
