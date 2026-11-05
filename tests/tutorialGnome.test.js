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
  getNextAction,
  groupTutorialsByCategory,
  isWayBack,
  loadTutorialProgress,
  placeDialogue,
  placePointer,
  runDemoAction,
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

/* ---------- Practice safety ---------- */

const findStep = (tutorialId, stepId) =>
  TUTORIALS.find((tutorial) => tutorial.id === tutorialId).steps.find((step) => step.id === stepId);

test("steps that highlight real actions stay look-only", () => {
  // Incident Notes saves from inside the Overview sections; other tabs hold their own saves; Open Booking leaves the tutorial.
  for (const [tutorialId, stepId] of [["open-booking", "sections"], ["open-booking", "tabs"], ["contacts", "history"]]) {
    const step = findStep(tutorialId, stepId);
    assert.ok(!step.done && !step.explore, `${tutorialId}/${stepId} would let clicks through`);
  }
});

test("explore is only for steps that would otherwise be look-only", () => {
  for (const tutorial of TUTORIALS) {
    for (const step of tutorial.steps.filter((item) => item.explore)) {
      assert.ok(!step.done, `${tutorial.id}/${step.id}`);
    }
  }
});

test("when a target is missing, only ways back are usable", () => {
  // closest() for a node whose nearest match is the given selector text.
  const nodeInside = (match) => ({ closest: (selector) => (selector.includes(match) ? {} : null) });

  for (const wayBack of [".sidebar-link", "booking-back", "booking-tabs", "spreadsheet-search", "contacts-search"]) {
    assert.ok(isWayBack(nodeInside(wayBack)), wayBack);
  }
  assert.ok(!isWayBack(nodeInside("booking-overview-main")), "a highlighted area is not a way back");
  assert.ok(!isWayBack({ closest: () => null }));
  assert.ok(!isWayBack(null));
});

test("guided runs that leave practice input behind say so when they end", () => {
  for (const id of ["create-booking", "edit-booking"]) {
    assert.match(TUTORIALS.find((tutorial) => tutorial.id === id).finished, /Saving is back on/);
  }
});

test("an open booking only counts as a head start for Edit a booking", () => {
  const bookingOpen = { visible: (id) => id === "booking-profile" };

  assert.equal(findStep("open-booking", "open-spreadsheet").done(bookingOpen), false, "Open a booking teaches the search, so it must go to the spreadsheet");
  assert.equal(findStep("edit-booking", "open-spreadsheet").done(bookingOpen), true);
});

/* ---------- Step transitions ---------- */

// A fake page for runDemoAction: the click "lands" after `delay` polls; wait() just counts.
function fakeDemo({ delay = 2, clickable = true, alreadyDone = false } = {}) {
  const page = { clicks: 0, polls: 0, cancelled: false, time: 0 };
  let doneAtPoll = alreadyDone ? 0 : Infinity;

  page.options = {
    isDone: () => page.polls >= doneAtPoll,
    findClickable: () => (clickable ? "target" : null),
    click: () => {
      page.clicks += 1;
      doneAtPoll = page.polls + delay;
    },
    wait: async (ms) => {
      page.polls += 1;
      page.time += ms;
    },
    isCancelled: () => page.cancelled,
    now: () => page.time,
  };
  return page;
}

test("every demo click has a done check, so the result can be confirmed", () => {
  for (const tutorial of TUTORIALS) {
    for (const step of tutorial.steps.filter((item) => item.demoClick)) {
      assert.equal(typeof step.done, "function", `${tutorial.id}/${step.id}`);
    }
  }
});

test("rapid Next clicks run one transition: the first hurries the demo, the rest are ignored", () => {
  // Phase after each click, as TutorialRunner sets it synchronously (phaseRef).
  const afterClick = { hurry: "working", advance: "seeking", retry: "seeking", ignore: null };

  for (const isDemo of [true, false]) {
    let phase = "active";
    const actions = [];
    for (let click = 0; click < 5; click += 1) {
      const action = getNextAction(phase, isDemo);
      actions.push(action);
      phase = afterClick[action] ?? phase;
    }
    assert.deepEqual(actions, [isDemo ? "hurry" : "advance", "ignore", "ignore", "ignore", "ignore"]);
  }

  for (const phase of ["seeking", "working", "success"]) {
    assert.equal(getNextAction(phase, true), "ignore", phase);
    assert.equal(getNextAction(phase, false), "ignore", phase);
  }
  assert.equal(getNextAction("failed", true), "retry");
  assert.equal(getNextAction("missing", true), "advance", "Skip stays available when a target can't be found");
});

test("a step the rest depends on can't be skipped until it has happened", () => {
  assert.equal(getNextAction("active", false, true), "wait", "guided: waiting on a navigation step");
  assert.equal(getNextAction("missing", false, true), "wait", "guided: its target can't be found");
  assert.equal(getNextAction("missing", true, true), "wait", "demo: its target can't be found");
  assert.equal(getNextAction("active", false, false), "advance", "a field step can still be skipped");
  assert.equal(getNextAction("active", true, true), "hurry", "demo: Next still only shortens the reading time");
  assert.equal(getNextAction("seeking", false, true), "ignore");
});

test("a demo action only completes once the page shows its result", async () => {
  const page = fakeDemo({ delay: 3 });
  const result = await runDemoAction({ demoClick: true }, page.options);

  assert.equal(result, "done");
  assert.equal(page.clicks, 1);
  assert.equal(page.polls, 3, "kept waiting until the page changed, not a fixed delay");
});

test("a demo action is not repeated when the step is already done (reached with Back)", async () => {
  const page = fakeDemo({ alreadyDone: true });

  assert.equal(await runDemoAction({ demoClick: true }, page.options), "done");
  assert.equal(page.clicks, 0);
  assert.equal(await runDemoAction({}, fakeDemo().options), "done", "steps without an action just continue");
});

test("a demo action that can't click, or never shows a result, fails instead of continuing", async () => {
  const missing = fakeDemo({ clickable: false });
  assert.equal(await runDemoAction({ demoClick: true }, missing.options), "failed");
  assert.equal(missing.clicks, 0);

  const stuck = fakeDemo({ delay: Infinity });
  assert.equal(await runDemoAction({ demoClick: true }, { ...stuck.options, pollMs: 100, timeoutMs: 1000 }), "failed");
  assert.equal(stuck.time, 1000, "gives up after the time limit");
});

test("a demo action left mid-transition (Next, Back, Restart, End) stops without reporting", async () => {
  const page = fakeDemo({ delay: 5 });
  const wait = page.options.wait;
  const result = await runDemoAction(
    { demoClick: true },
    {
      ...page.options,
      wait: async (ms) => {
        await wait(ms);
        if (page.polls === 2) page.cancelled = true;
      },
    }
  );

  assert.equal(result, "cancelled", "an older step's work can't advance the newer one");
  assert.equal(page.clicks, 1);
  assert.equal(page.polls, 2, "no more checks after the step was left");
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
