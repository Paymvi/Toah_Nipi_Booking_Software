import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
    ALL_TUTORIALS,
  getCurrentMonthLabel,
  MINI_CATEGORY,
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
  getStepOpeners,
  getScenarioPages,
  getStepPosition,
  groupTutorialsByCategory,
  isWayBack,
  loadTutorialProgress,
  placeDialogue,
  placePointer,
  runDemoAction,
  saveTutorialProgress,
  searchTutorials,
  STEP_ROLES,
  TUTORIAL_PROGRESS_STORAGE_KEY,
  withCompleted,
  withUnfinished,
} from "../src/tutorial/tutorialCore.js";
import { PORTAL_TOPICS, PORTAL_WALKTHROUGH } from "../src/tutorial/portalTutorial.js";
import { BOOKING_TOPICS, BOOKING_WALKTHROUGH } from "../src/tutorial/bookingTutorial.js";
import { CALENDAR_TOPICS, CALENDAR_WALKTHROUGH } from "../src/tutorial/calendarTutorial.js";
import { MINI_TUTORIALS } from "../src/tutorial/miniTutorials.js";
import { GUEST_JOURNEY_TOPICS, GUEST_JOURNEY_TUTORIAL } from "../src/tutorial/inquiryJourneyTutorial.js";
import {
  buildInquiryDemoScene,
  endInquiryDemo,
  getInquiryDemo,
  INQUIRY_DEMO_EFFECTS,
  INQUIRY_DEMO_ID,
} from "../src/tutorial/inquiryDemo.js";
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

// A step of any tutorial or topic, by its id with or without the section in front ("read.search" or "search").
const findStep = (tutorialId, stepId) =>
  ALL_TUTORIALS.find((tutorial) => tutorial.id === tutorialId).steps.find(
    (step) => step.id === stepId || step.id.endsWith(`.${stepId}`)
  );

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
      const targets = step.target ? [step.target].flat() : [];

      assert.ok(step.show, `${where} needs text`);
      // A step that highlights nothing explains instead, and says whose action it is.
      if (!step.target) assert.ok(STEP_ROLES[step.role], `${where} has no target, so it needs a role`);
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
  const example = (tutorialId, stepId) => findStep(tutorialId, stepId).example;
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
  assert.equal(ids("calendar")[0], "calendar");
  assert.ok(ids("lodging").includes("calendar"));
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
  const step = findStep("calendar", "next-month");
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

test("dialogue docks to the bottom on small screens, or the top for a target it would cover", () => {
  const phone = { width: 390, height: 800 };
  assert.deepEqual(placeDialogue(rect(100, 20, 100, 30), dialog, phone), { dock: "bottom" });
  assert.deepEqual(placeDialogue(null, dialog, phone), { dock: "bottom" });
  // A sticky footer button or the last control on the page stays low, so the dialogue moves up instead.
  assert.deepEqual(placeDialogue(rect(740, 20, 300, 44), dialog, phone), { dock: "top" });
  // A tall target that starts high keeps the usual place.
  assert.deepEqual(placeDialogue(rect(120, 20, 300, 650), dialog, phone), { dock: "bottom" });
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

test("sidebar steps open the phone menu first, other steps keep their own openers", () => {
  const panel = { click: "panel-toggle", until: () => true };
  const [menu, ...rest] = getStepOpeners({ target: "nav-reports", opens: [panel] });
  assert.equal(menu.click, "nav-menu");
  assert.deepEqual(rest, [panel]);
  assert.equal(getStepOpeners({ target: ["booking-back", "nav-calendar"] })[0].click, "nav-menu");

  // Done once the item shows, or straight away where there is no menu button (desktop).
  const shown = new Set();
  const ctx = { visible: (id) => [id].flat().some((one) => shown.has(one)) };
  assert.equal(menu.until(ctx), true);
  shown.add("nav-menu");
  assert.equal(menu.until(ctx), false);
  shown.add("nav-reports");
  assert.equal(menu.until(ctx), true);

  assert.deepEqual(getStepOpeners({ target: "booking-tabs", opens: [panel] }), [panel]);
  assert.deepEqual(getStepOpeners({ target: "booking-tabs" }), []);
});

/* ---------- From Guest Inquiry to Guest Portal ---------- */

const journey = GUEST_JOURNEY_TUTORIAL;
const journeySteps = journey.steps;
const previewSource = readFileSync("src/tutorial/JourneyPreview.jsx", "utf8");
const previewKinds = [...previewSource.match(/const PREVIEWS = \{([\s\S]*?)\};/)[1].matchAll(/^\s*"?([\w-]+)"?:/gm)].map((match) => match[1]);

test("the guest journey is easy to find in the library", () => {
  assert.equal(TUTORIALS.at(-1).id, "guest-journey");
  assert.equal(journey.title, "From Guest Inquiry to Guest Portal");
  for (const query of ["inquiry", "group leader", "guest portal"]) {
    assert.ok(searchTutorials(TUTORIALS, query).some((tutorial) => tutorial.id === "guest-journey"), query);
  }
  assert.equal(GUEST_JOURNEY_TOPICS.length, journey.sections.length);
  assert.deepEqual(journey.related.filter((id) => !ALL_TUTORIALS.some((tutorial) => tutorial.id === id)), []);
});

test("every guest journey step says whose action it is", () => {
  for (const tutorial of [journey, ...GUEST_JOURNEY_TOPICS]) {
    for (const step of tutorial.steps) {
      assert.ok(STEP_ROLES[step.role], `${tutorial.id}/${step.id} has no known role`);
      if (step.preview) assert.ok(previewKinds.includes(step.preview), `${step.id} uses unknown preview ${step.preview}`);
      [step.target ?? []].flat().forEach((id) => assert.ok(TUTORIAL_TARGETS[id], `${step.id}: ${id}`));
      (step.opens ?? []).forEach((opener) => assert.ok(TUTORIAL_TARGETS[opener.click], opener.click));
    }
    assert.equal(new Set(tutorial.steps.map((step) => step.id)).size, tutorial.steps.length, tutorial.id);
  }

  assert.match(STEP_ROLES.leader.note, /on their own device/);
  Object.values(STEP_ROLES).forEach((role) => assert.equal(role.label, role.label.toUpperCase()));
});

test("group leader steps only explain: no staff control is highlighted, clicked or saved", () => {
  const leaderSteps = journeySteps.filter((step) => step.role === "leader");
  assert.ok(leaderSteps.length >= 5);

  for (const step of leaderSteps) {
    assert.equal(step.target, undefined, step.id);
    assert.ok(step.preview, `${step.id} shows the group leader's screen`);
    assert.ok(!step.demoClick && !step.writes && !step.demoEffect, step.id);
  }
  // Staff are told plainly that the group leader's part is not theirs to do.
  assert.ok(journeySteps.some((step) => step.role === "staff" && /never fill in their answers/.test(step.show)));
});

test("the role markers are introduced before the first group leader step", () => {
  const rolesIntro = journeySteps.findIndex((step) => step.preview === "roles");
  const firstLeader = journeySteps.findIndex((step) => step.role === "leader");
  assert.ok(rolesIntro >= 0 && rolesIntro < firstLeader);
  assert.ok(journeySteps.slice(0, rolesIntro).every((step) => !step.target));
});

test("sections run in the order of the real workflow, and switch role where the owner changes", () => {
  assert.deepEqual(journey.sections.map((section) => section.id), ["form", "review", "booking", "access", "portal", "follow-up"]);
  const rolesIn = (id) => new Set(GUEST_JOURNEY_TOPICS.find((topic) => topic.sectionId === id).steps.map((step) => step.role));
  assert.ok(rolesIn("form").has("leader") && rolesIn("form").has("system"));
  assert.ok(rolesIn("portal").has("leader"));
  assert.deepEqual([...rolesIn("follow-up")], ["staff"]);
  assert.ok(rolesIn("booking").has("system"), "converting the inquiry is automatic");
});

test("the booking only exists at Save Guest Group, which is guarded and never clicked", () => {
  const save = journeySteps.find((step) => step.target === "booking-form-save");
  assert.ok(save.writes && !save.demoClick);
  assert.match(save.show, /moment the booking exists/);
  assert.match(save.show, /Confirmed/);
  assert.equal(save.demoEffect, "inquiryConverted");

  // Opening the prefilled form is navigation and doesn't create anything.
  const openForm = journeySteps.find((step) => step.target === "inquiry-open-form" && step.demoClick);
  assert.match(openForm.show, /doesn't create a booking/);

  // The claim matches the form: a new booking is saved as Confirmed.
  assert.match(readFileSync("src/pages/CreateBooking.jsx", "utf8"), /isEditMode\s*\?\s*existingBooking\?\.status \|\| "Confirmed"\s*:\s*"Confirmed"/);
});

test("guest journey steps that save or send are never clicked, and demo clicks are navigation", () => {
  const navigation = /^(nav-|inquiry-review$|inquiry-open-form$|portal-emails$)/;
  for (const step of journeySteps) {
    if (step.writes) assert.ok(!step.demoClick, step.id);
    if (step.demoClick) {
      assert.ok(navigation.test(step.target), `${step.id} demo-clicks ${step.target}`);
      assert.equal(typeof step.done, "function", step.id);
    }
  }
});

test("each guest journey topic that uses a screen gets there first", () => {
  for (const topic of GUEST_JOURNEY_TOPICS) {
    const first = topic.steps.find((step) => step.target);
    if (!first) continue;
    assert.match([first.target].flat()[0], /^nav-/, topic.id);
    assert.equal(first.demoClick, true, topic.id);

    const pick = topic.steps.findIndex((step) => step.pickScope);
    const needsGroup = topic.steps.findIndex((step) => /^portal-(card|status-pill|progress|item|confirm|assign|emails|link|copy)/.test([step.target ?? ""].flat()[0]));
    if (needsGroup >= 0) assert.ok(pick >= 0 && pick < needsGroup, topic.id);
  }
});

test("the guest journey's fictional scene covers every page it visits, and nothing else", () => {
  assert.deepEqual(getScenarioPages(journey.scenario), ["/guest-inquiries", "/form", "/portal-admin"]);
  assert.ok(getScenarioPages(journey.scenario).includes(journey.scenario.home));
  assert.deepEqual(getScenarioPages(PORTAL_WALKTHROUGH.scenario), ["/portal-admin"]);
  assert.deepEqual(getScenarioPages(undefined), []);

  journey.scenario.show(getDemoEffects(journeySteps, journeySteps.length));
  try {
    assert.ok(getInquiryDemo() && getPortalDemo());
  } finally {
    journey.scenario.end();
  }
  assert.equal(getInquiryDemo(), null);
  assert.equal(getPortalDemo(), null);
});

test("the fictional inquiries are clearly made up and show each column", () => {
  const scene = buildInquiryDemoScene();
  const text = JSON.stringify(scene);

  (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).forEach((email) => assert.match(email, /@example\.org$/, email));
  assert.doesNotMatch(text, /portal_token|portalToken/);
  assert.deepEqual(scene.inquiries.map((entry) => entry.status).sort(), ["converted", "declined", "pending"]);
  assert.equal(scene.inquiries.find((entry) => entry.status === "pending").id, INQUIRY_DEMO_ID);
  assert.equal(INQUIRY_DEMO_ID, PORTAL_DEMO_GROUP_ID, "one fictional group across both screens");

  const converted = buildInquiryDemoScene(["inquiryConverted"]).inquiries.find((entry) => entry.id === INQUIRY_DEMO_ID);
  assert.equal(converted.status, "converted");
  assert.ok(converted.converted_booking_id);

  // Each scene ignores the other's effects, so one effect list drives both.
  assert.doesNotThrow(() => buildInquiryDemoScene(["confirmItem", "enableEmails"]));
  assert.doesNotThrow(() => buildPortalDemoScene(INQUIRY_DEMO_EFFECTS));
  journeySteps.flatMap((step) => step.demoEffect ?? []).forEach((name) =>
    assert.ok(INQUIRY_DEMO_EFFECTS.includes(name) || portalSteps.some((step) => step.demoEffect === name), name)
  );
  endInquiryDemo();
});

test("Guest Inquiries guards its saves and only its own screen reads the fictional inquiries", () => {
  const view = readFileSync("src/pages/GuestInquiriesView.jsx", "utf8");
  assert.match(view, /data-tutorial-guard\s+onClick=\{\s*declineSelectedInquiry/);
  assert.match(view, /data-tutorial-guard\s+onClick=\{\(\) => markSelectedInquiryConverted/);
  assert.match(view, /useSyncExternalStore\(subscribeInquiryDemo, getInquiryDemo\)/);
  assert.match(view, /if \(!demo\) loadGuestInquiries\(\)/);

  // Dashboard only uses it to put the booking form back once the demo ends.
  const dashboard = readFileSync("src/pages/Dashboard.jsx", "utf8");
  assert.match(dashboard, /if \(!inquiryDemo && bookingFormSeed\?\.id === INQUIRY_DEMO_ID\) \{\s*setBookingFormSeed\(null\);\s*setGuestBookingSource\(null\);/);

  const readers = readSourceFiles("src").filter((source) => source.includes("getInquiryDemo"));
  assert.equal(readers.length, 2);
});

test("previews are plain markup: nothing in them can be clicked, typed into or sent", () => {
  assert.doesNotMatch(previewSource, /<(button|input|textarea|select|form|a|iframe)[\s>]/);
  assert.doesNotMatch(previewSource, /onClick|fetch\(|supabase|href=/);
  assert.match(previewSource, /Preview · fictional/);
});

/* ---------- Mini tutorials, calendars and housing ---------- */

test("Contacts, Reports, both spreadsheets and Hosting are mini tutorials, grouped together", () => {
  assert.equal(MINI_CATEGORY, "Mini Tutorials (other views)");
  const minis = TUTORIALS.filter((tutorial) => tutorial.category === MINI_CATEGORY).map((tutorial) => tutorial.id);
  for (const id of ["contacts", "reports", "master-spreadsheet", "inquiry-spreadsheet", "hosting"]) assert.ok(minis.includes(id), id);

  // One unbroken run, so the library can show them as one row.
  const first = TUTORIALS.findIndex((tutorial) => tutorial.category === MINI_CATEGORY);
  assert.deepEqual(TUTORIALS.slice(first, first + minis.length).map((tutorial) => tutorial.id), minis);
  assert.deepEqual(MINI_TUTORIALS.map((tutorial) => tutorial.id), minis);
});

test("each mini tutorial opens its own page first and can't save", () => {
  for (const tutorial of MINI_TUTORIALS) {
    const [first] = tutorial.steps;
    assert.match(first.target, /^nav-/, tutorial.id);
    assert.equal(first.demoClick, true, tutorial.id);
    assert.ok(tutorial.writeLock, tutorial.id);
    assert.ok(tutorial.steps.length <= 8, `${tutorial.id} should stay short`);
  }
  // The Hosting page reuses the calendar components, so "on the page" is checked by address too.
  const hosting = MINI_TUTORIALS.find((tutorial) => tutorial.id === "hosting");
  assert.equal(hosting.steps[0].done({ path: () => "/calendar", visible: () => true }), false);
  assert.equal(hosting.steps[0].done({ path: () => "/hosting", visible: () => true }), true);
});

test("hosting is explained as separate from guest bookings wherever it matters", () => {
  const text = (id) =>
    MINI_TUTORIALS.find((tutorial) => tutorial.id === id).steps.map((step) => `${step.show} ${step.learnMore ?? ""}`).join(" ");
  assert.match(text("hosting"), /not a guest booking/);
  assert.match(text("master-spreadsheet"), /Hosting isn't here/);
  assert.match(text("reports"), /Hosting is internal/);
});

test("the calendar walkthrough covers both calendars, and every part starts on its own screen", () => {
  assert.deepEqual(CALENDAR_WALKTHROUGH.sections.map((section) => section.id), ["move", "read", "lodging", "availability"]);
  assert.equal(CALENDAR_TOPICS.length, CALENDAR_WALKTHROUGH.sections.length);

  for (const topic of CALENDAR_TOPICS) {
    assert.equal(topic.parentId, "calendar");
    const first = topic.steps[0];
    assert.match(first.target, /^nav-(calendar|lodging-calendar)$/, topic.id);
    assert.equal(first.demoClick, true, topic.id);
    const section = CALENDAR_WALKTHROUGH.sections.find((entry) => entry.id === topic.sectionId);
    assert.deepEqual(textOf(topic.steps), textOf(CALENDAR_WALKTHROUGH.steps.slice(section.start, section.end + 1)), topic.id);
  }

  const lodging = CALENDAR_TOPICS.find((topic) => topic.sectionId === "lodging");
  assert.equal(lodging.steps[0].target, "nav-lodging-calendar");
  // On the Hosting page's lodging calendar, the Lodging Calendar isn't open yet.
  assert.equal(lodging.steps[0].done({ path: () => "/hosting", visible: () => true }), false);
  assert.equal(lodging.steps[0].done({ path: () => "/lodging-calendar", visible: () => true }), true);
});

test("opening a booking from the calendar only runs when the month has a group to open", () => {
  const read = CALENDAR_TOPICS.find((topic) => topic.sectionId === "read").steps;
  const noGroups = read.find((step) => step.id === "read.no-groups");
  const open = read.find((step) => step.id === "read.open-booking");
  const back = read.find((step) => step.id === "read.back");

  const month = (hasGroup) => ({ visible: (id) => id === "calendar-agenda-booking" && hasGroup });
  assert.equal(open.when(month(true)), true);
  assert.equal(noGroups.when(month(true)), false);
  assert.equal(open.when(month(false)), false);
  assert.equal(noGroups.when(month(false)), true);
  assert.ok(noGroups.prep, "the explanation stands in for the demo, so it isn't counted twice");
  assert.ok(open.demoClick && back.demoClick);
  assert.equal(back.when({ visible: () => false }), false, "nothing to go back from");
});

test("a section can keep the id it had as its own tutorial", () => {
  const { topics } = composeWalkthrough({
    id: "w",
    keywords: [],
    intro: [],
    recap: [],
    sections: [
      { id: "one", topicId: "old-one", title: "One", keywords: [], steps: [{ id: "a" }] },
      { id: "two", title: "Two", keywords: [], steps: [{ id: "a" }] },
    ],
  });
  assert.deepEqual(topics.map((topic) => topic.id), ["old-one", "w/two"]);

  // Open and Edit kept their ids inside the booking walkthrough, so old progress still finds them.
  assert.deepEqual(BOOKING_TOPICS.map((topic) => topic.id), ["open-booking", "edit-booking", "booking-housing"]);
  BOOKING_TOPICS.forEach((topic) => assert.equal(topic.parentId, BOOKING_WALKTHROUGH.id));
});

test("the Housing topic opens a booking's Housing tab and never saves", () => {
  const housing = ALL_TUTORIALS.find((tutorial) => tutorial.id === "booking-housing");
  assert.ok(searchTutorials(ALL_TUTORIALS, "housing").includes(housing));
  assert.ok(housing.writeLock);

  const teaching = housing.steps.filter((step) => !step.prep);
  assert.equal(teaching[0].target, "booking-tab-housing");
  assert.equal(teaching[0].demoClick, true);
  for (const step of housing.steps.filter((entry) => entry.demoClick)) {
    assert.ok(!["housing-actions", "housing-clashes"].includes(step.target), `${step.id} would click a save`);
  }

  // Save Changes on the Housing tab is guarded, so a demonstration can never press it.
  const tab = readFileSync("src/components/BookingHousingTab.jsx", "utf8");
  assert.match(tab, /onClick=\{handleSave\}\s+data-tutorial-guard/);
});

test("steps on controls that save are never clicked, in any tutorial", () => {
  for (const tutorial of ALL_TUTORIALS) {
    for (const step of tutorial.steps.filter((entry) => entry.writes)) assert.ok(!step.demoClick, `${tutorial.id}/${step.id}`);
  }
});
