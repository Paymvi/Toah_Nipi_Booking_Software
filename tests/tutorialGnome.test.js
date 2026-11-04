import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  getCurrentMonthLabel,
  TUTORIAL_DIFFICULTIES,
  TUTORIAL_TARGETS,
  TUTORIALS,
} from "../src/tutorial/tutorials.js";
import {
  checkStep,
  clipRect,
  emptyProgress,
  getDemoStepDuration,
  groupTutorialsByCategory,
  loadTutorialProgress,
  placeDialogue,
  placePointer,
  saveTutorialProgress,
  searchTutorials,
  TUTORIAL_PROGRESS_STORAGE_KEY,
  withCompleted,
  withUnfinished,
} from "../src/tutorial/tutorialCore.js";

function readSourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "tutorial" ? [] : readSourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) ? [readFileSync(path, "utf8")] : [];
  });
}

const appSource = readSourceFiles("src").join("\n");

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
      values[key] = String(value);
    },
    values,
  };
}

const rect = (top, left, width, height) => ({ top, left, width, height, right: left + width, bottom: top + height });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/* ---------- Library ---------- */

test("every tutorial is complete and uses registered targets", () => {
  const ids = new Set();

  for (const tutorial of TUTORIALS) {
    assert.ok(!ids.has(tutorial.id), `duplicate tutorial id ${tutorial.id}`);
    ids.add(tutorial.id);

    assert.ok(tutorial.title && tutorial.description && tutorial.category, tutorial.id);
    assert.ok(TUTORIAL_DIFFICULTIES.includes(tutorial.difficulty), tutorial.id);
    assert.ok(tutorial.steps.length > 0, tutorial.id);

    for (const step of tutorial.steps) {
      const where = `${tutorial.id}/${step.id}`;
      const targets = Array.isArray(step.target) ? step.target : [step.target];

      assert.ok(step.say && step.show, `${where} needs guided and demo text`);
      targets.forEach((id) => assert.ok(TUTORIAL_TARGETS[id], `${where} uses unregistered target ${id}`));
      if (step.done) assert.equal(typeof step.done, "function", where);
      if (step.capture) assert.ok(step.done, `${where} captures without a done check`);
    }
  }
});

test("V1 ships three to five tutorials, each with at least one real interaction", () => {
  assert.ok(TUTORIALS.length >= 3 && TUTORIALS.length <= 5);
  for (const tutorial of TUTORIALS) {
    assert.ok(tutorial.steps.some((step) => step.done), `${tutorial.id} never waits for the person`);
  }
});

test("every registered target exists in the application source", () => {
  for (const id of Object.keys(TUTORIAL_TARGETS)) {
    const pattern = new RegExp(`["'\`\\s]${id}["'\`\\s]`);
    assert.ok(pattern.test(appSource), `data-tutorial-target "${id}" is not in src/`);
  }
});

test("demonstrations never click a save button", () => {
  const guardedTargets = ["booking-form-save", "booking-edit-actions", "booking-edit-ready", "booking-edit-panel"];

  for (const tutorial of TUTORIALS) {
    for (const step of tutorial.steps.filter((item) => item.demoClick)) {
      const targets = Array.isArray(step.target) ? step.target : [step.target];
      targets.forEach((id) => assert.ok(!guardedTargets.includes(id), `${tutorial.id}/${step.id} demo-clicks ${id}`));
    }
  }
});

test("demo examples follow one fictional booking and use values the screens accept", () => {
  const example = (tutorialId, stepId) =>
    TUTORIALS.find((tutorial) => tutorial.id === tutorialId).steps.find((step) => step.id === stepId).example;
  const formSource = readFileSync("src/pages/CreateBooking.jsx", "utf8");
  const retreatOptions = formSource.match(/const retreatTypes = \[([\s\S]*?)\];/)[1];

  assert.ok(retreatOptions.includes(`"${example("create-booking", "retreat-type")}"`), "Retreat Type example is not an option");
  assert.equal(example("open-booking", "search"), example("create-booking", "group-name"));
  assert.equal(example("contacts", "search"), example("create-booking", "contact"));
});

test("both save buttons are guarded during practice", () => {
  const guarded = appSource.match(/data-tutorial-guard/g) || [];
  assert.ok(guarded.length >= 2);
  assert.match(appSource, /data-tutorial-target="booking-form-save">\s*<button\s+type="submit"\s+disabled=\{isSubmitting\}\s+data-tutorial-guard/);
});

test("categories only include tutorials that exist", () => {
  const groups = groupTutorialsByCategory(TUTORIALS);
  const categories = groups.map((group) => group.category);

  assert.deepEqual(categories, [...new Set(TUTORIALS.map((tutorial) => tutorial.category))]);
  groups.forEach((group) => assert.ok(group.items.length > 0));
});

test("search matches title, description, category and keywords", () => {
  const ids = (query) => searchTutorials(TUTORIALS, query).map((tutorial) => tutorial.id);

  assert.equal(searchTutorials(TUTORIALS, "  ").length, TUTORIALS.length);
  assert.deepEqual(ids("calendar"), ["calendar"]);
  assert.ok(ids("new booking").includes("create-booking"));
  assert.ok(ids("EMAIL").includes("contacts"));
  assert.deepEqual(ids("zzz nothing"), []);
});

test("calendar heading label matches the Main Calendar format", () => {
  assert.equal(getCurrentMonthLabel(new Date(2026, 10, 2)), "November 2026");
});

/* ---------- Step checks ---------- */

test("a step check that throws counts as not done", () => {
  assert.equal(checkStep(() => { throw new Error("gone"); }, {}), false);
  assert.equal(checkStep(undefined, {}), false);
  assert.equal(checkStep((ctx, start) => ctx.value !== start, { value: 2 }, 1), true);
});

test("relative steps compare against the state captured when they began", () => {
  const step = TUTORIALS.find((tutorial) => tutorial.id === "calendar").steps.find((item) => item.id === "next-month");
  const ctx = { text: () => "December 2026" };

  assert.equal(step.done(ctx, step.capture({ text: () => "December 2026" })), false);
  assert.equal(step.done(ctx, step.capture({ text: () => "November 2026" })), true);
});

test("demo steps stay up long enough to read, but not forever", () => {
  assert.equal(getDemoStepDuration(""), 3800);
  assert.equal(getDemoStepDuration("word ".repeat(20)), 5800);
  assert.equal(getDemoStepDuration("word ".repeat(200)), 9000);
});

/* ---------- Placement ---------- */

const viewport = { width: 1280, height: 800 };
const dialog = { width: 360, height: 220 };

test("dialogue goes below the target when there is room, without covering it", () => {
  const target = rect(100, 200, 120, 40);
  const spot = placeDialogue(target, dialog, viewport);

  assert.equal(spot.side, "below");
  assert.ok(!overlaps(target, rect(spot.top, spot.left, dialog.width, dialog.height)));
});

test("dialogue moves above, then beside, a target near the bottom", () => {
  assert.equal(placeDialogue(rect(700, 200, 120, 40), dialog, viewport).side, "above");
  assert.equal(placeDialogue(rect(100, 20, 200, 650), dialog, viewport).side, "right");
});

test("dialogue stays fully on screen and falls back to the corner for huge targets", () => {
  const nearRightEdge = placeDialogue(rect(100, 1200, 60, 30), dialog, viewport);
  assert.ok(nearRightEdge.left + dialog.width <= viewport.width - 12);

  const huge = placeDialogue(rect(0, 0, 1280, 800), dialog, viewport);
  assert.equal(huge.side, "corner");
  assert.equal(huge.top, viewport.height - dialog.height - 12);
});

test("dialogue docks to the bottom on small screens", () => {
  assert.deepEqual(placeDialogue(rect(100, 20, 100, 30), dialog, { width: 390, height: 800 }), { dock: "bottom" });
});

test("pointer sits outside the target and points at it", () => {
  const cases = [
    [rect(300, 400, 100, 40), 0],
    [rect(300, 4, 100, 40), 90],
    [rect(4, 4, 100, 40), -90],
  ];

  for (const [target, rotation] of cases) {
    const pointer = placePointer(target, viewport);
    assert.equal(pointer.rotation, rotation);
    assert.ok(!overlaps(target, rect(pointer.y, pointer.x, 34, 34)));
  }
});

test("clipRect keeps only the visible part of a target", () => {
  assert.deepEqual(clipRect(rect(-50, 10, 100, 100), viewport), {
    top: 0, left: 10, bottom: 50, right: 110, width: 100, height: 50,
  });
  assert.equal(clipRect(rect(900, 10, 100, 100), viewport), null);
});

/* ---------- Progress storage ---------- */

test("progress survives broken or missing storage", () => {
  assert.deepEqual(loadTutorialProgress(memoryStorage()), emptyProgress());
  assert.deepEqual(loadTutorialProgress(memoryStorage({ [TUTORIAL_PROGRESS_STORAGE_KEY]: "{not json" })), emptyProgress());
  assert.deepEqual(loadTutorialProgress({ getItem: () => { throw new Error("blocked"); } }), emptyProgress());
  assert.doesNotThrow(() => saveTutorialProgress({ setItem: () => { throw new Error("full"); } }, emptyProgress()));
});

test("progress stores only tutorial ids, step numbers and mode", () => {
  const storage = memoryStorage();
  let progress = withUnfinished(emptyProgress(), "edit-booking", 3, "guided");
  saveTutorialProgress(storage, progress);

  assert.deepEqual(JSON.parse(storage.values[TUTORIAL_PROGRESS_STORAGE_KEY]), {
    completed: {},
    unfinished: { id: "edit-booking", step: 3, mode: "guided" },
  });

  progress = withCompleted(progress, "edit-booking", new Date("2026-11-02T10:00:00Z"));
  assert.deepEqual(progress, { completed: { "edit-booking": "2026-11-02T10:00:00.000Z" }, unfinished: null });
});

test("completing one tutorial keeps a different unfinished one", () => {
  const progress = withCompleted(withUnfinished(emptyProgress(), "calendar", 2, "demo"), "contacts");
  assert.deepEqual(progress.unfinished, { id: "calendar", step: 2, mode: "demo" });
});

test("loaded progress drops unexpected fields", () => {
  const storage = memoryStorage({
    [TUTORIAL_PROGRESS_STORAGE_KEY]: JSON.stringify({
      completed: { calendar: "2026-11-01" },
      unfinished: { id: "calendar", step: 1, mode: "weird", bookingName: "Secret Group" },
    }),
  });

  assert.deepEqual(loadTutorialProgress(storage).unfinished, { id: "calendar", step: 1, mode: "guided" });
});
