/*
  Runs one tutorial: spotlight, pointer, the gnome's dialogue and the
  controls. Mounted only while a tutorial is running.

  Each step: wait for its target to be on screen (after 5 s explain that it
  can't be found, but keep looking), scroll it into view, then
  - guided: wait until the step's done(ctx) check is true, react, move on;
  - demo:   explain, click the target if the step allows it, wait until the
            page shows the result (or offer Try again), move on.

  Next never jumps past a step's action: in demos it ends the reading time
  early and the action still runs, and clicks during a transition are ignored
  (phaseRef is checked synchronously, before React re-renders).

  While running (not paused), clicks are stopped and answered with a hint
  unless the step asks for them (its highlighted element, on a step with
  done or explore), and anything marked data-tutorial-guard (the save
    buttons) cannot be clicked or submitted, so practice never saves real
  data. Pausing gives full control back, except in a fictional demo: that
  stays locked while paused and ends if the person leaves its page.

  Tutorials with writeLock also refuse writes at the network (tutorialSafety.js).
*/

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  FaChevronLeft,
  FaChevronRight,
  FaPause,
  FaPlay,
  FaRedo,
  FaTimes,
} from "react-icons/fa";

import GnomeMascot from "./GnomeMascot";
import { TUTORIAL_TARGETS } from "./tutorials";
import {
    checkStep,
  clipRect,
  createStepContext,
  findTarget,
  getDemoEffects,
  getDemoStepDuration,
  getNextAction,
  getSectionAt,
  getStepPosition,
  getTargetScope,
  getUnsavedWork,
  isShown,
  isStepInMode,
  isWayBack,
  matchesTarget,
  MOBILE_BREAKPOINT,
  placeDialogue,
  placePointer,
  runDemoAction,
  setTargetScope,
} from "./tutorialCore";
import { setTutorialWriteLock } from "./tutorialSafety";

const SETTLE_MS = 80;
const SEEK_POLL_MS = 150;
const MISSING_AFTER_MS = 5000;
const DONE_POLL_MS = 200;
const SUCCESS_PAUSE_MS = 950;
const POINTER_TRAVEL_MS = 800;
const RESUME_WAIT_MS = 1500;
const OPEN_WAIT_MS = 3000;
const NEEDS_GRACE_MS = 1200;
const PICK_LIST_SIZE = 6;
const SPOTLIGHT_PADDING = 6;

const PRAISE = ["Perfect!", "Nice work!", "That's it!", "Great job!", "Lovely!"];
const SAVE_BLOCKED_NUDGE =
  "Saving is switched off while we practise, so nothing changes. Pause or end the tutorial to save for real.";
const DEMO_NUDGE = "I'm showing you this one. Sit back, or press Pause to take over.";
const LOOK_ONLY_NUDGE = "This one's just to look at. Press Next when you're ready, or Pause to try it yourself.";
const RESUME_NUDGE = "That screen isn't open any more, so let's take it from the top.";
const DEMO_LOCKED_NUDGE = "This group is fictional, so nothing here can be saved or sent. End the demo to get back to your real work.";
const VIEWER_NOTE = "Your account is view-only, so this would be refused outside practice too.";
const ADMIN_NOTE = "Only admins can change this.";

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function scrollTargetIntoView(element) {
  const rect = element.getBoundingClientRect();
  const isDocked = window.innerWidth < MOBILE_BREAKPOINT;
  // On small screens the dialogue covers the lower part of the screen.
  const visibleBottom = window.innerHeight * (isDocked ? 0.55 : 1);

  const behavior = prefersReducedMotion() ? "auto" : "smooth";

  if (rect.top >= 8 && rect.bottom <= visibleBottom - 8) {
    // Tall enough to see, but it can still sit sideways inside a wide table (View Bookings on narrower screens).
    element.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
    return;
  }

  const isTall = rect.height > visibleBottom * 0.8;
  element.scrollIntoView({
    behavior,
    block: isDocked || isTall ? "start" : "center",
    inline: "nearest",
  });
}

function canDemoClick(element) {
  return (
    element.matches("button, a, summary, [role='button'], [role='tab']") &&
    element.getAttribute("type") !== "submit" &&
    !element.closest("[data-tutorial-guard]")
  );
}

function getTargetLabel(target) {
  const id = Array.isArray(target) ? target[0] : target;
  return TUTORIAL_TARGETS[id] || "the highlighted item";
}

function getFocusable(element) {
  const controls = "button, a, input, select, textarea";
  return element.matches(controls) ? element : element.querySelector(controls);
}

function getStaffRole() {
  return document.querySelector("[data-staff-role]")?.dataset.staffRole ?? "";
}

// The groups on screen right now, for the dialogue to offer when a step asks for one.
function getPickOptions() {
  const cards = Array.from(document.querySelectorAll("[data-tutorial-scope]")).filter(isShown);

  return {
    extra: Math.max(cards.length - PICK_LIST_SIZE, 0),
    options: cards.slice(0, PICK_LIST_SIZE).map((card) => ({
      key: card.dataset.tutorialScope,
      name: card.querySelector("h3")?.textContent ?? "",
      status: card.querySelector("[data-tutorial-target~='portal-status-pill']")?.textContent ?? "",
    })),
  };
}

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

export default function TutorialRunner({
  tutorial,
  mode,
    startStep = 0,
  startScope = null,
  onStepChange,
  onExit,
  onComplete,
  onWatchDemo,
}) {
  const steps = tutorial.steps;
  const isDemo = mode === "demo";
  // The screen shows made-up data (portalDemo.js), not real records.
  const isFictional = isDemo && Boolean(tutorial.scenario);

  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Math.max(startStep, 0), steps.length - 1)
  );
  // seeking → (missing | unmet) → active → (working → failed) → (success); "attempt" re-runs a step.
  const [phase, setPhase] = useState("seeking");
  const phaseRef = useRef("seeking");
  const runRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [isWaitingForAction, setIsWaitingForAction] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [nudge, setNudge] = useState("");
  const [layout, setLayout] = useState(null);
    const [demoClickCount, setDemoClickCount] = useState(0);
  const [pauseNote, setPauseNote] = useState("");

  const dialogRef = useRef(null);
  const lastInputAtRef = useRef(0);
  const directionRef = useRef("forward");
  const stepEnteredAtRef = useRef(0);
  const isDemoClickingRef = useRef(false);
  const isResumingRef = useRef(startStep > 0);
  const hasPausedRef = useRef(false);
  const isKeyboardRef = useRef(false);
    const skippedStepsRef = useRef(new Set());
  const unsavedAtPauseRef = useRef([]);
  const hasReachedHomeRef = useRef(false);
  const hasUsedStartScopeRef = useRef(!startScope);
  const { pathname } = useLocation();
  const routerPathRef = useRef(pathname);

  useEffect(() => {
    routerPathRef.current = pathname;
  }, [pathname]);

  const step = steps[stepIndex];
  const isBusy = phase === "seeking" || phase === "working";
  // A demoClick step opens the screen later steps are on: until it has happened, there is nothing to skip to.
    const needsAction = Boolean(step.demoClick || step.pickScope) && (isWaitingForAction || phase === "missing");
  const section = getSectionAt(tutorial, stepIndex);
  const position = getStepPosition(steps, stepIndex, isDemo);

  function changePhase(next) {
    phaseRef.current = next;
    setPhase(next);
  }

  function goTo(nextIndex, direction = "forward") {
    if (nextIndex >= steps.length) {
            onComplete(hasPausedRef.current && !isFictional, getTargetScope());
      return;
    }

    const index = Math.max(0, nextIndex);
    directionRef.current = direction;
    setStepIndex(index);
    changePhase("seeking");
    setIsWaitingForAction(false);
    setNudge("");
    setAttempt((count) => count + 1);
    onStepChange(index);
  }

  function handleNext() {
    const action = getNextAction(phaseRef.current, isDemo, needsAction);

    if (action === "wait") {
      if (phaseRef.current !== "missing") {
        setNudge(`Use the ${getTargetLabel(step.target)} to carry on, or press Pause to look around.`);
      }
    } else if (action === "hurry") {
      changePhase("working");
      runRef.current?.hurry();
    } else if (action === "retry") {
      changePhase("seeking");
      setNudge("");
      setAttempt((count) => count + 1);
    } else if (action === "advance") {
      goTo(stepIndex + 1);
    }
  }

  // Steps skipped on the way here (already done, e.g. Edit Entry on a Form booking) are skipped on the way back too.
  function getPreviousIndex() {
        let index = stepIndex - 1;
    while (index >= 0 && (skippedStepsRef.current.has(index) || steps[index].prep || !isStepInMode(steps[index], isDemo))) index -= 1;
    return index;
  }

  function handleBack() {
    if (phaseRef.current === "seeking" || phaseRef.current === "working" || !layout?.canGoBack) return;
    goTo(getPreviousIndex(), "back");
  }

    function restart() {
    skippedStepsRef.current.clear();
    if (!isFictional) setTargetScope(null);
    goTo(0);
  }

  function pause() {
    hasPausedRef.current = true;
    unsavedAtPauseRef.current = getUnsavedWork();
    setPauseNote("");
    setIsPaused(true);
    setNudge("");
  }

  function resume() {
    // Started while paused, so it's the person's own work, and the next step may leave this screen.
    const newWork = getUnsavedWork().filter((work) => !unsavedAtPauseRef.current.includes(work));
    if (newWork.length > 0) {
      setPauseNote(`Save or cancel your ${newWork.join(" and ")} first, then press Resume.`);
      return;
    }

    setPauseNote("");
    directionRef.current = "forward";
    changePhase("seeking");
    setIsPaused(false);
  }

  /* ---------------------------------------------------------
     Step progression
  --------------------------------------------------------- */

  const runStep = useEffectEvent(async (run) => {
    const wait = (ms) =>
      new Promise((resolve) => run.timers.push(window.setTimeout(resolve, ms)));
    const ctx = createStepContext(lastInputAtRef);
    const enteredForward = directionRef.current === "forward";
    // Relative checks (capture) compare against the moment the step began, so they never count as already done.
    const isAlreadyDone = () => !step.capture && step.done && checkStep(step.done, ctx);
    // Only navigation is skipped: a field that already has a value is still taught, or Restart would pass it by.
    const skipIfDone = () => {
            if (!enteredForward || !(step.demoClick || step.pickScope) || !isAlreadyDone()) return false;
            skippedStepsRef.current.add(stepIndex);
      goTo(stepIndex + 1);

      if (step.pickScope && !isDemo && !hasUsedStartScopeRef.current) {
        hasUsedStartScopeRef.current = true;
        setNudge(`I'll use ${findTarget(step.pickScope)?.querySelector("h3")?.textContent}, the group you already had open.`);
      }
      return true;
    };

        // A step for the other mode, e.g. an outcome only the fictional demo can show.
    if (!isStepInMode(step, isDemo)) {
      skippedStepsRef.current.add(stepIndex);
      goTo(stepIndex + 1);
      return;
    }

    if (skipIfDone()) return;

    // Puts the screen the way this step needs it, however it was reached. Panels only, never saves.
    for (const opener of step.opens ?? []) {
      const openStartedAt = Date.now();
      let hasClicked = false;

      while (!checkStep(opener.until, ctx) && Date.now() - openStartedAt < OPEN_WAIT_MS) {
        const control = hasClicked ? null : findTarget(opener.click);
        if (control && canDemoClick(control)) {
          hasClicked = true;
          isDemoClickingRef.current = true;
          control.click();
          isDemoClickingRef.current = false;
        }
        await wait(SEEK_POLL_MS);
        if (run.cancelled) return;
      }
    }

    // The real record isn't in the state this step teaches: say so rather than wait for a target that won't come.
    if (!isDemo && step.needs) {
      const needsStartedAt = Date.now();
      while (!checkStep(step.needs.check, ctx)) {
        if (Date.now() - needsStartedAt > NEEDS_GRACE_MS && phaseRef.current !== "unmet") changePhase("unmet");
        await wait(SEEK_POLL_MS);
        if (run.cancelled) return;
      }
      if (phaseRef.current === "unmet") changePhase("seeking");
    }

    // The router commits navigations in a transition, so the URL can change before the app does; a navigation
    // still pending when this step acts would undo it (e.g. close the booking just opened) once it lands.
        const findReadyTarget = () =>
      routerPathRef.current === window.location.pathname && (!step.waitFor || checkStep(step.waitFor, ctx))
        ? findTarget(step.target)
        : null;
    const seekStartedAt = Date.now();
    let element = findReadyTarget();

    while (!element) {
      // A step saved from another screen can't be reached from here, and the steps that open it are behind us.
      if (isResumingRef.current && Date.now() - seekStartedAt > RESUME_WAIT_MS) {
        isResumingRef.current = false;
        goTo(0);
        setNudge(RESUME_NUDGE);
        return;
      }

      if (Date.now() - seekStartedAt > MISSING_AFTER_MS) changePhase("missing");
      await wait(SEEK_POLL_MS);
      if (run.cancelled) return;
      element = findReadyTarget();
    }

    isResumingRef.current = false;
        if (phaseRef.current === "missing") setNudge("");

    // A group chosen earlier is reused unless a filter or a refresh has taken it off the list.
    if (step.pickScope && getTargetScope() && !findTarget(step.pickScope)) setTargetScope(null);

        if (skipIfDone()) return;

    scrollTargetIntoView(element);
    stepEnteredAtRef.current = Date.now();

    let start;
    try {
      start = step.capture?.(ctx);
    } catch {
      start = undefined;
    }

    if (isDemo) {
      // Reading time; Next (handleNext → hurry) ends it early.
      const reading = new Promise((resolve) => {
        run.hurry = resolve;
        run.timers.push(window.setTimeout(resolve, POINTER_TRAVEL_MS + getDemoStepDuration(step.show)));
      });
      changePhase("active");
      await reading;
      if (run.cancelled) return;

      changePhase("working");
      // Already done (reached with Back) skips the click: clicking again could undo it, e.g. View Bookings collapses the history.
      const result = await runDemoAction(step, {
        isDone: () => checkStep(step.done, ctx, start),
        findClickable: () => {
          const element = findTarget(step.target);
          return element && canDemoClick(element) ? element : null;
        },
        click: (element) => {
          setDemoClickCount((count) => count + 1);
          // The guard below would stop our own click; dispatch is synchronous, so the flag covers just this one.
          isDemoClickingRef.current = true;
          element.click();
          isDemoClickingRef.current = false;
        },
        wait,
        isCancelled: () => run.cancelled,
      });

      if (result === "failed") changePhase("failed");
      if (result === "done") goTo(stepIndex + 1);
      return;
    }

    changePhase("active");

    // Info steps, and steps reached with Previous that are already done, wait for Next.
    if (!step.done || isAlreadyDone()) return;

    setIsWaitingForAction(true);
    // The dialogue is last on the page, so keyboard users would otherwise tab through everything to get here.
    // Never from a field: text steps move on after a pause in typing, and the rest of the word would land in the next one.
    if (isKeyboardRef.current && !document.activeElement?.matches("input, textarea, select")) {
      getFocusable(element)?.focus({ preventScroll: true });
    }
    let lostSince = 0;

    while (!checkStep(step.done, ctx, start)) {
      await wait(DONE_POLL_MS);
      if (run.cancelled) return;

      // The target went away mid-step (e.g. another screen): explain and stop blocking clicks.
      if (findTarget(step.target)) {
        if (lostSince) changePhase("active");
        lostSince = 0;
      } else if (!lostSince) {
        lostSince = Date.now();
      } else if (Date.now() - lostSince > MISSING_AFTER_MS) {
        changePhase("missing");
      }
    }

    setIsWaitingForAction(false);
    setNudge("");
    changePhase("success");
    await wait(SUCCESS_PAUSE_MS);
    if (run.cancelled) return;

    goTo(stepIndex + 1);
  });

    /* ---------------------------------------------------------
     Chosen group, write lock and the fictional scene
  --------------------------------------------------------- */

  useEffect(() => {
    setTargetScope(isFictional ? tutorial.scenario.scope : startScope);
    return () => setTargetScope(null);
  }, [isFictional, startScope, tutorial]);

  useEffect(() => {
    if (!tutorial.writeLock) return undefined;
    setTutorialWriteLock(isFictional ? "demo" : isPaused ? null : "practice");
    return () => setTutorialWriteLock(null);
  }, [isFictional, isPaused, tutorial]);

  useEffect(() => {
    if (isFictional) tutorial.scenario.show(getDemoEffects(steps, stepIndex));
  }, [isFictional, stepIndex, steps, tutorial]);

  useEffect(() => {
    if (!isFictional) return undefined;
    return () => tutorial.scenario.end();
  }, [isFictional, tutorial]);

  const leaveFictionalPage = useEffectEvent(() => onExit(stepIndex, true));

  // Leaving the page (sidebar while paused, browser Back) ends a fictional demo: it never follows anyone elsewhere.
  useEffect(() => {
    if (!isFictional) return;
    if (pathname === tutorial.scenario.home) hasReachedHomeRef.current = true;
    else if (hasReachedHomeRef.current) leaveFictionalPage();
  }, [isFictional, pathname, tutorial]);

  useEffect(() => {
    if (isPaused) return undefined;

    const run = { cancelled: false, timers: [], hurry: () => {} };
    runRef.current = run;
    // Starts a moment later so a view that just changed has rendered.
    run.timers.push(window.setTimeout(() => runStep(run), SETTLE_MS));

    // Leaving the step (Next, Back, Restart, Pause, End) stops this run: no later click, check or goTo.
    return () => {
      run.cancelled = true;
      run.timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [stepIndex, attempt, isPaused]);

  /* ---------------------------------------------------------
     Spotlight, pointer and dialogue positions (rAF while running)
  --------------------------------------------------------- */

  const measure = useEffectEvent(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const element = phase === "missing" ? null : findTarget(step.target);
    const rect = element ? clipRect(element.getBoundingClientRect(), viewport) : null;
    const dialogBox = dialogRef.current?.getBoundingClientRect();
    const dialogSize = {
      width: dialogBox?.width || 360,
      height: dialogBox?.height || 220,
    };

    const spot = rect && {
      top: Math.round(rect.top - SPOTLIGHT_PADDING),
      left: Math.round(rect.left - SPOTLIGHT_PADDING),
      width: Math.round(rect.width + SPOTLIGHT_PADDING * 2),
      height: Math.round(rect.height + SPOTLIGHT_PADDING * 2),
    };
    const spotRect = spot && {
      ...spot,
      right: spot.left + spot.width,
      bottom: spot.top + spot.height,
    };
    const dialog = placeDialogue(spotRect, dialogSize, viewport);
    const pointer = spotRect && placePointer(spotRect, viewport);

    return {
      spot,
      dialog: dialog.dock ? dialog : { ...dialog, top: Math.round(dialog.top), left: Math.round(dialog.left) },
      pointer: pointer && { ...pointer, x: Math.round(pointer.x), y: Math.round(pointer.y) },
      isMoving: Date.now() - stepEnteredAtRef.current < 700,
            // The previous step's control is on an earlier screen (e.g. the spreadsheet behind an open booking), unless it can reopen it.
      canGoBack: getPreviousIndex() >= 0 && Boolean(steps[getPreviousIndex()].opens || findTarget(steps[getPreviousIndex()].target)),
      pick: step.pickScope && !isDemo ? getPickOptions() : null,
    };
  });

  useEffect(() => {
    if (isPaused) return undefined;

    let frame = 0;
    let lastKey = "";

    const tick = () => {
      const next = measure();
      const key = JSON.stringify(next);

      if (key !== lastKey) {
        lastKey = key;
        setLayout(next);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [stepIndex, isPaused, phase]);

  /* ---------------------------------------------------------
     Click guard, practice-save guard, Escape to pause
  --------------------------------------------------------- */

  const handleDocumentEvent = useEffectEvent((event) => {
    if (event.type === "input") {
      lastInputAtRef.current = Date.now();
      return;
    }

    if (event.type === "keydown") {
      isKeyboardRef.current = true;
      if (event.key === "Escape" && !isPaused) pause();
      return;
    }

        if (event.type === "pointerdown") isKeyboardRef.current = false;
    if (isDemoClickingRef.current) return;

    const node = event.target;
    if (node?.closest?.("[data-tutorial-ui]")) return;

    if (isPaused) {
      // A paused fictional demo can be looked around, but its actions never become real.
      if (isFictional && node?.closest?.("[data-tutorial-guard]")) {
        stopEvent(event);
        if (event.type === "click") setPauseNote(DEMO_LOCKED_NUDGE);
      }
      return;
    }

    const isGuarded =
      event.type === "submit"
        ? Boolean(node?.querySelector?.("[data-tutorial-guard]"))
        : Boolean(node?.closest?.("[data-tutorial-guard]"));

    if (isGuarded) {
      stopEvent(event);
            if (event.type !== "mousedown") setNudge(isFictional ? DEMO_LOCKED_NUDGE : SAVE_BLOCKED_NUDGE);
      return;
    }

    // While a target is missing, let people find their own way back, but not reach controls that save.
        if ((phase === "missing" || phase === "unmet") && isWayBack(node)) return;

    const isOnTarget = matchesTarget(node, step.target);
    // Highlighted areas can hold real actions (Incident Notes saves from the Overview), so only steps that ask for a click allow one.
    if (!isDemo && phase === "active" && isOnTarget && (step.done || step.explore)) return;

    stopEvent(event);

    // pointerdown for mouse and touch, click for keyboard activation.
    if (event.type === "pointerdown" || event.type === "click") {
      setNudge(
        isDemo
          ? DEMO_NUDGE
          : phase === "missing"
            ? "That's not available here. Press Pause to look around freely."
            : isOnTarget || !step.done
              ? LOOK_ONLY_NUDGE
              : `That's not the highlighted spot. Use the ${getTargetLabel(step.target)}, or press Pause to look around freely.`
      );
    }
  });

  useEffect(() => {
        const types = ["pointerdown", "mousedown", "click", "auxclick", "submit", "keydown", "input"];
    const listener = (event) => handleDocumentEvent(event);

    types.forEach((type) => document.addEventListener(type, listener, true));
    return () => types.forEach((type) => document.removeEventListener(type, listener, true));
  }, []);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [isPaused]);

  /* ---------------------------------------------------------
     Render
  --------------------------------------------------------- */

  if (isPaused) {
    return (
      <section className="tg-paused" data-tutorial-ui aria-label="Tutorial paused">
        <GnomeMascot crop="head" mood="happy" className="tg-paused-gnome" />

        <div className="tg-paused-copy">
          <strong>Paused: {tutorial.title}</strong>
                    <span>
            {pauseNote ||
              (isFictional
                ? "This is still the fictional demo, so nothing here can be saved or sent. Leaving this page ends it."
                : "You're in full control. Anything you save now is real.")}
          </span>
        </div>

        <button className="tg-button tg-button-primary" type="button" onClick={resume} autoFocus>
          <FaPlay aria-hidden="true" /> Resume
        </button>

        <button
          className="tg-icon-button"
          type="button"
          onClick={() => onExit(stepIndex, hasPausedRef.current && !isFictional)}
          aria-label="End tutorial"
        >
          <FaTimes aria-hidden="true" />
        </button>
      </section>
    );
  }

    const isLost = phase === "missing" || phase === "unmet";
  const spot = !isLost ? layout?.spot : null;
  const pointer = phase !== "seeking" && !isLost ? layout?.pointer : null;
  const roleNote =
    (step.writes && getStaffRole() === "viewer" && VIEWER_NOTE) ||
    (step.adminOnly && getStaffRole() !== "admin" && ADMIN_NOTE) ||
    "";
  const pickStep = steps.slice(0, stepIndex + 1).findLastIndex((entry) => entry.pickScope);
  const dialog = layout?.dialog || { dock: window.innerWidth < MOBILE_BREAKPOINT ? "bottom" : null };
  const isDocked = dialog.dock === "bottom";
  const isLastStep = stepIndex === steps.length - 1;

  const gnomeMood =
    phase === "success"
      ? "excited"
            : isLost || phase === "failed"
        ? "surprised"
        : isBusy || nudge
          ? "thinking"
          : "happy";
  const gnomePose =
    phase === "success" ? "celebrate" : phase === "active" || phase === "working" ? "point" : phase === "seeking" ? "think" : "idle";

  return (
    <div className={`tg-runner ${layout?.isMoving ? "tg-is-moving" : ""}`} data-tutorial-ui>
      {spot ? (
        <div
          className={`tg-spotlight ${phase === "success" ? "tg-spotlight-success" : ""}`}
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          aria-hidden="true"
        />
      ) : (
        phase === "seeking" && <div className="tg-dim" aria-hidden="true" />
      )}

      {pointer && (
        <div
          className={`tg-pointer ${isDemo ? "tg-pointer-demo" : ""}`}
          style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 34 34" style={{ transform: `rotate(${pointer.rotation}deg)` }}>
            <path
              className="tg-pointer-arrow"
              d="M4 13 H19 V6 L31 17 L19 28 V21 H4 Z"
              fill="#F3B562"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {demoClickCount > 0 && <circle key={demoClickCount} className="tg-pointer-ripple" cx="31" cy="17" r="7" />}
          </svg>
        </div>
      )}

      <section
        ref={dialogRef}
        className={`tg-dialog ${isDocked ? "tg-dialog-docked" : `tg-dialog-${dialog.side || "corner"}`}`}
        style={isDocked ? undefined : { top: dialog.top, left: dialog.left }}
        role="dialog"
        aria-modal="false"
                aria-labelledby="tg-dialog-title"
        data-tutorial-step={step.id}
        tabIndex={-1}
      >
        <header className="tg-dialog-header">
          <GnomeMascot pose={gnomePose} mood={gnomeMood} className="tg-dialog-gnome" />

          <div className="tg-dialog-heading">
            <span className={`tg-mode-chip ${isDemo ? "tg-mode-chip-demo" : ""}`}>
              {isFictional
                ? "Demo · fictional data"
                : isDemo
                  ? "Demo · just watch"
                  : tutorial.writeLock
                    ? "Practice · saving and sending off"
                    : "Practice · saving is off"}
            </span>
            <h2 id="tg-dialog-title">{tutorial.title}</h2>
                        {section && (
              <span className="tg-section-label">
                Topic {tutorial.sections.indexOf(section) + 1} of {tutorial.sections.length}: {section.title}
              </span>
            )}
            <span className="tg-step-count">
              Step {position.current} of {position.total}
            </span>
          </div>

          <button
            className="tg-icon-button"
            type="button"
            onClick={() => onExit(stepIndex, hasPausedRef.current && !isFictional)}
            aria-label="End tutorial"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </header>

        <div className="tg-progress" aria-hidden="true">
          <span style={{ width: `${((position.current - 1 + (phase === "success" ? 1 : 0)) / position.total) * 100}%` }} />
        </div>

        <div className="tg-dialog-body" aria-live="polite">
                    {phase === "unmet" ? (
            <div className="tg-missing">
              <p>
                <strong>{step.needs.why}</strong>
              </p>
              <div className="tg-choices">
                {pickStep >= 0 && pickStep !== stepIndex && (
                  <button
                    className="tg-button"
                    type="button"
                    onClick={() => {
                      setTargetScope(null);
                      goTo(pickStep);
                    }}
                  >
                    Choose another group
                  </button>
                )}
                {tutorial.scenario && (
                  <button className="tg-button tg-button-primary" type="button" onClick={() => onWatchDemo(stepIndex)}>
                    Watch the demo instead
                  </button>
                )}
                {section && (
                  <button className="tg-button" type="button" onClick={() => goTo(section.end + 1)}>
                    Skip this topic
                  </button>
                )}
              </div>
            </div>
          ) : phase === "missing" ? (
            <div className="tg-missing">
              <p>
                <strong>Hmm, I can't find the {getTargetLabel(step.target)} on this screen.</strong>
              </p>
              <p>{step.missing || "It may be on another page, or this screen may have changed."}</p>
              <p className="tg-muted">
                {step.demoClick
                  ? `I'll keep looking. The next steps need this one, so you can ${layout?.canGoBack ? "go back one, or " : ""}end the tutorial and try again later.`
                  : `I'll keep looking. You can also skip this step${layout?.canGoBack ? " or go back one" : ""}.`}
              </p>
            </div>
          ) : phase === "failed" ? (
            <div className="tg-missing">
              <p>
                <strong>Hmm, that didn't work.</strong>
              </p>
              <p>I used the {getTargetLabel(step.target)}, but the screen didn't change as expected.</p>
              <p className="tg-muted">Press Try again, or Pause to have a look yourself.</p>
            </div>
          ) : phase === "success" ? (
            <p className="tg-success">{PRAISE[stepIndex % PRAISE.length]}</p>
          ) : (
            <>
                            <p>{isDemo ? step.show : step.say}</p>

              {roleNote && <p className="tg-muted">{roleNote}</p>}

              {layout?.pick && (
                <div className="tg-choices tg-choices-list">
                  {layout.pick.options.map((option) => (
                    <button className="tg-button" type="button" key={option.key} onClick={() => setTargetScope(option.key)}>
                      <span>{option.name}</span>
                      <small>{option.status}</small>
                    </button>
                  ))}
                  {layout.pick.extra > 0 && <p className="tg-muted">And {layout.pick.extra} more. Search to find them.</p>}
                </div>
              )}

              {isDemo && step.example && (
                <p className="tg-example">
                  <span>Example</span>
                  {step.example}
                  <small>Just an example. I won't type it in.</small>
                </p>
              )}

              {step.learnMore && (
                <details className="tg-learn-more" key={step.id}>
                  <summary>Learn more</summary>
                  <p>{step.learnMore}</p>
                </details>
              )}

              {phase === "working" && <p className="tg-muted">Getting ready…</p>}
            </>
          )}

          {nudge && phase !== "success" && <p className="tg-nudge">{nudge}</p>}
        </div>

        {isDemo && phase === "active" && (
          <div className="tg-demo-timer" aria-hidden="true">
            <span
              key={`${stepIndex}-${attempt}`}
              style={{ animationDuration: `${POINTER_TRAVEL_MS + getDemoStepDuration(step.show)}ms` }}
            />
          </div>
        )}

        <footer className="tg-controls">
          <button
            className="tg-button"
            type="button"
            onClick={handleBack}
            aria-disabled={isBusy || !layout?.canGoBack || undefined}
            title={stepIndex > 0 && !layout?.canGoBack ? "The step before this was on another screen. Use Restart to begin again." : undefined}
          >
            <FaChevronLeft aria-hidden="true" /> Back
          </button>

          <button className="tg-button" type="button" onClick={pause}>
            <FaPause aria-hidden="true" /> Pause
          </button>

          <button
            className="tg-icon-button"
            type="button"
            onClick={restart}
            aria-label="Restart tutorial"
            title="Restart"
          >
            <FaRedo aria-hidden="true" />
          </button>

          {/* aria-disabled, not disabled: keeps keyboard focus on the button while a step gets ready. */}
          <button
            className={`tg-button ${isWaitingForAction || isLost ? "" : "tg-button-primary"}`}
            type="button"
            onClick={handleNext}
            aria-disabled={["ignore", "wait"].includes(getNextAction(phase, isDemo, needsAction)) || undefined}
          >
            {phase === "failed"
              ? "Try again"
              : isLastStep
                ? "Finish"
                : (isWaitingForAction || phase === "missing") && !needsAction
                  ? "Skip"
                  : "Next"}
            <FaChevronRight aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  );
}
