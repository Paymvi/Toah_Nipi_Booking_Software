import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
    ALL_TUTORIALS,
  getCurrentMonthLabel,
  TUTORIAL_DIFFICULTIES,
  TUTORIAL_TARGETS,
  TUTORIALS,
} from "../src/tutorial/tutorials.js";
import {
  checkStep,
    clipRect,
  composeWalkthrough,
  emptyProgress,
  getContinueStep,
  getDemoEffects,
  getDemoStepDuration,
  getNextAction,
  getResumeStep,
  getSectionAt,
  getStepPosition,
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
import { PORTAL_TOPICS, PORTAL_WALKTHROUGH } from "../src/tutorial/portalTutorial.js";
import {
  buildPortalDemoScene,
  endPortalDemo,
  getPortalDemo,
  PORTAL_DEMO_GROUP_ID,
  portalDemoEmailApi,
  showPortalDemo,
} from "../src/tutorial/portalDemo.js";
import { guardedFetch, isRequestAllowed, setTutorialWriteLock } from "../src/tutorial/tutorialSafety.js";
import { REMINDER_OPTIONS } from "../src/utils/portalEmail.js";

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

      assert.ok(step.show, `${where} needs text`);
      targets.forEach((id) => assert.ok(TUTORIAL_TARGETS[id], `${where} uses unregistered target ${id}`));
      if (step.done) assert.equal(typeof step.done, "function", where);
      if (step.capture) assert.ok(step.done, `${where} captures without a done check`);
    }
  }
});

test("every tutorial shows at least one real click", () => {
  for (const tutorial of TUTORIALS) {
    assert.ok(tutorial.steps.some((step) => step.demoClick), `${tutorial.id} never clicks anything`);
  }
});

test("no tutorial has a second mode left over", () => {
  for (const tutorial of [...ALL_TUTORIALS, PORTAL_WALKTHROUGH]) {
    assert.equal(tutorial.finished, undefined, tutorial.id);
    for (const step of tutorial.steps) {
      for (const field of ["say", "explore", "needs", "demoOnly"]) assert.equal(step[field], undefined, `${tutorial.id}/${step.id}.${field}`);
      if (step.done) assert.ok(step.demoClick || step.pickScope, `${tutorial.id}/${step.id} has a done check nothing uses`);
    }
  }
  const ui = readFileSync("src/tutorial/TutorialGnome.jsx", "utf8") + readFileSync("src/tutorial/TutorialRunner.jsx", "utf8");
  assert.doesNotMatch(ui, /Walk me through|Show me how|guided/i);
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

  const [groupName, contact, retreatType] = example("create-booking", "details").split(" · ");
  assert.ok(retreatOptions.includes(`"${retreatType}"`), "Retreat Type example is not an option");
  assert.equal(example("open-booking", "search"), groupName);
  assert.equal(example("contacts", "search"), contact);
});

test("both save buttons are guarded during demonstrations", () => {
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

/* ---------- Demonstration safety ---------- */

const findStep = (tutorialId, stepId) =>
  TUTORIALS.find((tutorial) => tutorial.id === tutorialId).steps.find((step) => step.id === stepId);

test("steps that highlight real actions are never clicked", () => {
  // Incident Notes saves from inside the Overview sections; other tabs hold their own saves; Open Booking leaves the tutorial.
  for (const [tutorialId, stepId] of [["open-booking", "sections"], ["open-booking", "tabs"], ["contacts", "history"]]) {
    assert.ok(!findStep(tutorialId, stepId).demoClick, `${tutorialId}/${stepId} would click a real action`);
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

  let phase = "active";
  const actions = [];
  for (let click = 0; click < 5; click += 1) {
    const action = getNextAction(phase);
    actions.push(action);
    phase = afterClick[action] ?? phase;
  }
  assert.deepEqual(actions, ["hurry", "ignore", "ignore", "ignore", "ignore"]);

  for (const phase of ["seeking", "working"]) assert.equal(getNextAction(phase), "ignore", phase);
  assert.equal(getNextAction("failed"), "retry");
  assert.equal(getNextAction("missing"), "advance", "Skip stays available when a target can't be found");
});

test("a step the rest depends on can't be skipped until it has happened", () => {
  assert.equal(getNextAction("missing", true), "wait", "its target can't be found");
  assert.equal(getNextAction("active", true), "hurry", "Next still only shortens the reading time");
  assert.equal(getNextAction("seeking", true), "ignore");
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

test("progress stores only tutorial ids and step numbers", () => {
  const storage = memoryStorage();
  let progress = withUnfinished(emptyProgress(), "edit-booking", 3);
  saveTutorialProgress(storage, progress);

  assert.deepEqual(JSON.parse(storage.values[TUTORIAL_PROGRESS_STORAGE_KEY]), {
    completed: {},
    unfinished: { id: "edit-booking", step: 3 },
  });

  progress = withCompleted(progress, "edit-booking", new Date("2026-11-02T10:00:00Z"));
  assert.deepEqual(progress, { completed: { "edit-booking": "2026-11-02T10:00:00.000Z" }, unfinished: null });
});

test("completing one tutorial keeps a different unfinished one", () => {
  const progress = withCompleted(withUnfinished(emptyProgress(), "calendar", 2), "contacts");
  assert.deepEqual(progress.unfinished, { id: "calendar", step: 2 });
});

test("loaded progress drops unexpected fields", () => {
  const storage = memoryStorage({
    [TUTORIAL_PROGRESS_STORAGE_KEY]: JSON.stringify({
      completed: { calendar: "2026-11-01" },
      unfinished: { id: "calendar", step: 1, mode: "weird", bookingName: "Secret Group" },
    }),
  });

  assert.deepEqual(loadTutorialProgress(storage).unfinished, { id: "calendar", step: 1 });
});

/* ---------- Walkthroughs and topics ---------- */

const stepText = (step) => [step.target, step.show];
const textOf = (steps) => steps.map(stepText);

test("every portal topic is the same steps as its part of the walkthrough", () => {
  assert.equal(PORTAL_TOPICS.length, PORTAL_WALKTHROUGH.sections.length);

  for (const topic of PORTAL_TOPICS) {
    const section = PORTAL_WALKTHROUGH.sections.find((entry) => entry.id === topic.sectionId);
    const part = PORTAL_WALKTHROUGH.steps.slice(section.start, section.end + 1);
    assert.deepEqual(textOf(topic.steps), textOf(part), topic.id);
    assert.equal(topic.steps.every((step) => step.sectionId === topic.sectionId), true, topic.id);
  }
});

test("portal topics and the walkthrough all use registered targets and unique ids", () => {
  const tutorialIds = new Set(ALL_TUTORIALS.map((tutorial) => tutorial.id));
  assert.equal(tutorialIds.size, ALL_TUTORIALS.length);

  for (const tutorial of [PORTAL_WALKTHROUGH, ...PORTAL_TOPICS]) {
    assert.equal(new Set(tutorial.steps.map((step) => step.id)).size, tutorial.steps.length, tutorial.id);

    for (const step of tutorial.steps) {
      [step.target].flat().forEach((id) => assert.ok(TUTORIAL_TARGETS[id], `${tutorial.id}/${step.id}: ${id}`));
      assert.ok(step.show, `${tutorial.id}/${step.id}`);
      (step.opens ?? []).forEach((opener) => assert.ok(TUTORIAL_TARGETS[opener.click], opener.click));
    }
  }
});

test("a topic starts by getting to its own screen, so it works from anywhere", () => {
  for (const topic of PORTAL_TOPICS) {
    assert.equal(topic.steps[0].target, "nav-portals", topic.id);
    assert.equal(topic.steps[0].demoClick, true, topic.id);
  }
});

test("steps that touch a group's card come after one has been chosen", () => {
  for (const topic of PORTAL_TOPICS) {
    const pick = topic.steps.findIndex((step) => step.pickScope);
    const needsGroup = topic.steps.findIndex((step) => /^portal-(card|status-pill|progress|metrics|checklist|item|correct|assign|emails|link|copy|open)/.test([step.target].flat()[0]));
    if (needsGroup >= 0) assert.ok(pick >= 0 && pick < needsGroup, topic.id);
  }
});

test("section helpers find sections, resume points and the next topic", () => {
  const { walkthrough, topics } = composeWalkthrough({
    id: "w",
    keywords: [],
    intro: [{ id: "intro", target: "a" }],
    recap: [{ id: "recap", target: "a" }],
    sections: [
      { id: "one", title: "One", keywords: ["x"], steps: [{ id: "p", prep: true }, { id: "a" }, { id: "b" }] },
      { id: "two", title: "Two", keywords: [], steps: [{ id: "p", prep: true }, { id: "a" }] },
    ],
  });

  assert.deepEqual(walkthrough.steps.map((step) => step.id), ["intro", "one.p", "one.a", "one.b", "two.p", "two.a", "recap"]);
  assert.equal(getSectionAt(walkthrough, 0), null);
  assert.equal(getSectionAt(walkthrough, 3).id, "one");
  assert.equal(getResumeStep(walkthrough, 3), 1);
  assert.equal(getResumeStep(walkthrough, 5), 4);
  assert.equal(getResumeStep(walkthrough, 99), walkthrough.recapStart);
  assert.equal(getResumeStep(topics[1], 1), 0);
  assert.equal(getContinueStep(walkthrough, "one"), 4);
  assert.equal(getContinueStep(walkthrough, "two"), walkthrough.recapStart);
  assert.equal(getResumeStep({ steps: [] }, 7), 7, "an ordinary tutorial keeps its saved step");
});

test("step numbers skip setup steps", () => {
  const steps = [{ prep: true }, { id: "a" }, { id: "b" }];
  assert.deepEqual(getStepPosition(steps, 0), { current: 1, total: 2 });
  assert.deepEqual(getStepPosition(steps, 2), { current: 2, total: 2 });
});

test("finishing a topic does not finish the walkthrough, and old progress still loads", () => {
  const done = withCompleted(emptyProgress(), PORTAL_TOPICS[0].id);
  assert.ok(done.completed[PORTAL_TOPICS[0].id]);
  assert.equal(done.completed[PORTAL_WALKTHROUGH.id], undefined);

  const unfinished = withUnfinished(emptyProgress(), PORTAL_WALKTHROUGH.id, 5);
  assert.equal(withCompleted(unfinished, PORTAL_TOPICS[0].id).unfinished.id, PORTAL_WALKTHROUGH.id);

  const old = JSON.stringify({ completed: { "create-booking": "2026-01-01" }, unfinished: { id: "calendar", step: 2, mode: "demo" } });
  const loaded = loadTutorialProgress(memoryStorage({ [TUTORIAL_PROGRESS_STORAGE_KEY]: old }));
  assert.equal(loaded.unfinished.id, "calendar");
  assert.ok(loaded.completed["create-booking"]);
});

test("searching finds a topic by what it teaches", () => {
  const ids = (query) => searchTutorials(ALL_TUTORIALS, query).map((tutorial) => tutorial.id);
  assert.ok(ids("send back").includes("portal/send-back"));
  assert.ok(ids("dry run").includes("portal/sending"));
  assert.ok(ids("due date").includes("portal/due-dates"));
});

/* ---------- Portal demos are honest and can't write ---------- */

const portalSteps = PORTAL_TOPICS.flatMap((topic) => topic.steps);

test("a step on a control that saves never clicks it and never claims it happened", () => {
  for (const step of portalSteps.filter((entry) => entry.writes)) {
    assert.ok(!step.demoClick, step.id);
    assert.ok(!(step.opens ?? []).some((opener) => opener.click === step.target), step.id);
    assert.doesNotMatch(step.show, /\b(saved|assigned|sent|confirmed|done)!/i, step.id);
  }
});

test("every control that saves or sends carries the tutorial guard", () => {
  const portal = readFileSync("src/pages/PortalAdminView.jsx", "utf8");
  const guarded = ["portal-save-due", "portal-send-back", "portal-reopen", "portal-remove-task", "portal-confirm", "portal-task-assign", "portal-doc-assign", "portal-doc-remove", "portal-copy-link", "portal-open-portal"];

  for (const id of guarded) {
    assert.match(portal, new RegExp(`data-tutorial-target="${id}"\\s+data-tutorial-guard`), id);
  }

  const panel = readFileSync("src/components/PortalEmailPanel.jsx", "utf8");
  const buttons = panel.match(/<button[^>]*onClick=\{(?:handleSave|handleTestSend|\(\) => (?:handleAutomation|handleManualSend|onRetry)[^}]*)\}/g);
  assert.ok(buttons.length >= 6);
  buttons.forEach((button) => assert.match(button, /data-tutorial-guard/, button));
  assert.match(panel, /aria-label="Sending mode" data-tutorial-target="portal-email-mode" data-tutorial-guard/);
  assert.match(panel, /data-tutorial-target="portal-email-automatic" data-tutorial-guard/);
});

test("the email steps use the app's real labels and timings", () => {
  const items = portalSteps.find((step) => step.id === "group-emails.items").show.toLowerCase();
  REMINDER_OPTIONS.forEach((option) => assert.ok(items.includes(option.label.toLowerCase()), option.label));

  const timing = portalSteps.find((step) => step.id === "sending.timing").show;
  assert.match(timing, /9:00 New York time/);
});

test("the write lock lets reads through and refuses everything that changes data or sends", () => {
  const base = "https://x.supabase.co";
  const allowed = (level, method, path, body) => isRequestAllowed(base + path, method, body, level);

  for (const level of ["practice", "demo"]) {
    assert.equal(allowed(level, "GET", "/rest/v1/bookings"), true);
    assert.equal(allowed(level, "POST", "/auth/v1/token?grant_type=refresh_token"), true);
    assert.equal(allowed(level, "POST", "/rest/v1/rpc/current_staff_role"), true);
    assert.equal(allowed(level, "PATCH", "/rest/v1/portal_checklist_items?id=eq.1"), false);
    assert.equal(allowed(level, "POST", "/rest/v1/portal_documents"), false);
    assert.equal(allowed(level, "DELETE", "/rest/v1/portal_documents?id=eq.1"), false);
    assert.equal(allowed(level, "POST", "/rest/v1/rpc/anything_else"), false);
    assert.equal(allowed(level, "POST", "/storage/v1/object/portal-uploads/a.pdf"), false);
    assert.equal(allowed(level, "POST", "/storage/v1/object/move"), false);
    for (const action of ["activate", "deactivate", "pause", "resume", "send", "testSend", "retry"]) {
      assert.equal(allowed(level, "POST", "/functions/v1/portal-email", JSON.stringify({ action })), false, action);
    }
    assert.equal(allowed(level, "POST", "/functions/v1/portal-email", "not json"), false);
    assert.equal(allowed(level, "POST", "/functions/v1/verify-dev-mode", "{}"), false);
  }

  assert.equal(allowed("practice", "POST", "/functions/v1/portal-email", '{"action":"overview"}'), true);
  assert.equal(allowed("practice", "POST", "/storage/v1/object/sign/portal-uploads/a.pdf"), true);
  assert.equal(allowed("demo", "POST", "/functions/v1/portal-email", '{"action":"overview"}'), false);
  assert.equal(allowed("demo", "POST", "/storage/v1/object/sign/portal-uploads/a.pdf"), false);
  assert.equal(allowed(null, "PATCH", "/rest/v1/bookings"), true);
});

test("a locked write is refused before fetch is called", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("{}");
  };

  try {
    setTutorialWriteLock("practice");
    await assert.rejects(guardedFetch("https://x.supabase.co/rest/v1/bookings", { method: "PATCH" }), /Blocked by the tutorial/);
    assert.equal(calls, 0);
    await guardedFetch("https://x.supabase.co/rest/v1/bookings", {});
    assert.equal(calls, 1);

    setTutorialWriteLock(null);
    await guardedFetch("https://x.supabase.co/rest/v1/bookings", { method: "PATCH" });
    assert.equal(calls, 2);
  } finally {
    setTutorialWriteLock(null);
    globalThis.fetch = realFetch;
  }
});

/* ---------- The fictional scene ---------- */

const demoGroup = (scene) => scene.records.find((record) => record.id === PORTAL_DEMO_GROUP_ID);
const demoItem = (scene, id) => demoGroup(scene).checklistItems.find((item) => item.id === id);

test("the fictional scene has what every topic needs to show", () => {
  const scene = buildPortalDemoScene();
  const statuses = demoGroup(scene).checklistItems.map((item) => item.status);

  assert.ok(statuses.includes("needsReview") && statuses.includes("completed") && statuses.includes("waitingOnGuest"));
  assert.ok(demoGroup(scene).checklistItems.length <= 5, "the first rows must fit before + more");
  assert.equal(scene.records.filter((record) => record.progress.total === 0).length, 1, "a No Checklist group");
  assert.ok(scene.records.every((record) => record.isDemo));
});

test("demo effects are all known and show a real outcome", () => {
  const effects = portalSteps.flatMap((step) => step.demoEffect ?? []);
  assert.ok(effects.length >= 6);
  effects.forEach((name) => assert.doesNotThrow(() => buildPortalDemoScene([name]), name));

  const base = demoGroup(buildPortalDemoScene()).progress.percent;
  const percentAfter = (name) => demoGroup(buildPortalDemoScene([name])).progress.percent;
  assert.ok(percentAfter("confirmItem") > base);
  assert.ok(percentAfter("sendBack") < base);
  assert.ok(percentAfter("reopenItem") < base);
  assert.ok(percentAfter("assignTask") < base);
  assert.equal(demoItem(buildPortalDemoScene(["sendBack"]), "demo-count").status, "waitingOnGuest");
  assert.equal(demoItem(buildPortalDemoScene(["reopenItem"]), "demo-contract").status, "needsReview");
  assert.equal(buildPortalDemoScene(["enableEmails"]).email.history[0].status, "simulated");
});

test("the same position always gives the same scene, so Back and Restart need no undo", () => {
  const steps = PORTAL_WALKTHROUGH.steps;
  const last = steps.length - 1;
  const strip = (scene) => JSON.stringify(scene.records);

  assert.equal(strip(buildPortalDemoScene(getDemoEffects(steps, last))), strip(buildPortalDemoScene(getDemoEffects(steps, last))));
  assert.deepEqual(getDemoEffects(steps, 0), []);
  assert.ok(getDemoEffects(steps, last).length > getDemoEffects(steps, Math.floor(last / 2)).length);
});

test("the fictional scene holds no real address or token, and its email api can't write", async () => {
  const scene = buildPortalDemoScene(getDemoEffects(PORTAL_WALKTHROUGH.steps, PORTAL_WALKTHROUGH.steps.length));
  const text = JSON.stringify(scene);

  (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).forEach((email) => assert.match(email, /@example\.org$/, email));
  scene.records.forEach((record) => assert.equal(record.portalToken, "fictional-demo"));

  showPortalDemo([]);
  try {
    assert.ok((await portalDemoEmailApi.callPortalEmail("status")).readiness);
    assert.ok((await portalDemoEmailApi.callPortalEmail("overview")).previews.welcome);
    for (const action of ["activate", "send", "testSend", "retry", "pause", "resume"]) {
      await assert.rejects(portalDemoEmailApi.callPortalEmail(action), /fictional/);
    }
    await assert.rejects(portalDemoEmailApi.updateEmailSettings({ mode: "live" }), /fictional/);
    await assert.rejects(portalDemoEmailApi.saveEmailRecipients(), /fictional/);
  } finally {
    endPortalDemo();
  }
  assert.equal(getPortalDemo(), null);
});

test("only Portal Admin's screen reads the fictional scene", () => {
  const readers = readSourceFiles("src").filter((source) => source.includes("getPortalDemo"));
  assert.equal(readers.length, 1);
  assert.match(readers[0], /useSyncExternalStore\(subscribePortalDemo, getPortalDemo\)/);
});
