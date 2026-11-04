/*
  Runs one tutorial: spotlight, pointer, the gnome's dialogue and the
  controls. Mounted only while a tutorial is running.

  Each step: wait for its target to be on screen (after 5 s explain that it
  can't be found, but keep looking), scroll it into view, then
  - guided: wait until the step's done(ctx) check is true, react, move on;
  - demo:   explain, click the target if the step allows it, move on.

  While running (not paused), clicks outside the highlighted element are
  stopped and answered with a hint, and anything marked data-tutorial-guard
  (the save buttons) cannot be clicked or submitted, so practice never
  saves real data. Pausing gives full control back.
*/

import { useEffect, useEffectEvent, useRef, useState } from "react";
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
  getDemoStepDuration,
  matchesTarget,
  MOBILE_BREAKPOINT,
  placeDialogue,
  placePointer,
} from "./tutorialCore";

const SETTLE_MS = 80;
const SEEK_POLL_MS = 150;
const MISSING_AFTER_MS = 5000;
const DONE_POLL_MS = 200;
const SUCCESS_PAUSE_MS = 950;
const POINTER_TRAVEL_MS = 800;
const AFTER_DEMO_CLICK_MS = 900;
const SPOTLIGHT_PADDING = 6;

const PRAISE = ["Perfect!", "Nice work!", "That's it!", "Great job!", "Lovely!"];
const SAVE_BLOCKED_NUDGE =
  "Saving is switched off while we practise, so nothing changes. Pause or end the tutorial to save for real.";
const DEMO_NUDGE = "I'm showing you this one. Sit back, or press Pause to take over.";

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function scrollTargetIntoView(element) {
  const rect = element.getBoundingClientRect();
  const isDocked = window.innerWidth < MOBILE_BREAKPOINT;
  // On small screens the dialogue covers the lower part of the screen.
  const visibleBottom = window.innerHeight * (isDocked ? 0.55 : 1);

  if (rect.top >= 8 && rect.bottom <= visibleBottom - 8) return;

  const isTall = rect.height > visibleBottom * 0.8;
  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: isDocked || isTall ? "start" : "center",
    inline: "nearest",
  });
}

function canDemoClick(element) {
  return (
    element.matches("button, a, [role='button'], [role='tab']") &&
    element.getAttribute("type") !== "submit" &&
    !element.closest("[data-tutorial-guard]")
  );
}

function getTargetLabel(target) {
  const id = Array.isArray(target) ? target[0] : target;
  return TUTORIAL_TARGETS[id] || "the highlighted item";
}

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

export default function TutorialRunner({
  tutorial,
  mode,
  startStep = 0,
  onStepChange,
  onExit,
  onComplete,
}) {
  const steps = tutorial.steps;
  const isDemo = mode === "demo";

  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Math.max(startStep, 0), steps.length - 1)
  );
  // seeking → (missing) → active → (success); "attempt" re-runs a step.
  const [phase, setPhase] = useState("seeking");
  const [attempt, setAttempt] = useState(0);
  const [isWaitingForAction, setIsWaitingForAction] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [nudge, setNudge] = useState("");
  const [layout, setLayout] = useState(null);
  const [demoClickCount, setDemoClickCount] = useState(0);

  const dialogRef = useRef(null);
  const lastInputAtRef = useRef(0);
  const directionRef = useRef("forward");
  const stepEnteredAtRef = useRef(0);
  const isDemoClickingRef = useRef(false);

  const step = steps[stepIndex];

  function goTo(nextIndex, direction = "forward") {
    if (nextIndex >= steps.length) {
      onComplete();
      return;
    }

    const index = Math.max(0, nextIndex);
    directionRef.current = direction;
    setStepIndex(index);
    setPhase("seeking");
    setIsWaitingForAction(false);
    setNudge("");
    setAttempt((count) => count + 1);
    onStepChange(index);
  }

  function pause() {
    setIsPaused(true);
    setNudge("");
  }

  function resume() {
    directionRef.current = "forward";
    setPhase("seeking");
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

    if (enteredForward && isAlreadyDone()) {
      goTo(stepIndex + 1);
      return;
    }

    const seekStartedAt = Date.now();
    let element = findTarget(step.target);

    while (!element) {
      if (Date.now() - seekStartedAt > MISSING_AFTER_MS) setPhase("missing");
      await wait(SEEK_POLL_MS);
      if (run.cancelled) return;
      element = findTarget(step.target);
    }

    if (enteredForward && isAlreadyDone()) {
      goTo(stepIndex + 1);
      return;
    }

    scrollTargetIntoView(element);
    stepEnteredAtRef.current = Date.now();

    let start;
    try {
      start = step.capture?.(ctx);
    } catch {
      start = undefined;
    }

    setPhase("active");

    if (isDemo) {
      await wait(POINTER_TRAVEL_MS + getDemoStepDuration(step.show));
      if (run.cancelled) return;

      // Already done (reached with Back): clicking again could undo it, e.g. View Bookings collapses the history.
      const clickTarget = step.demoClick && !isAlreadyDone() ? findTarget(step.target) : null;
      if (clickTarget && canDemoClick(clickTarget)) {
        setDemoClickCount((count) => count + 1);
        // The guard below would stop our own click; dispatch is synchronous, so the flag covers just this one.
        isDemoClickingRef.current = true;
        clickTarget.click();
        isDemoClickingRef.current = false;
        await wait(AFTER_DEMO_CLICK_MS);
        if (run.cancelled) return;
      }

      goTo(stepIndex + 1);
      return;
    }

    // Info steps, and steps reached with Previous that are already done, wait for Next.
    if (!step.done || isAlreadyDone()) return;

    setIsWaitingForAction(true);
    let lostSince = 0;

    while (!checkStep(step.done, ctx, start)) {
      await wait(DONE_POLL_MS);
      if (run.cancelled) return;

      // The target went away mid-step (e.g. another screen): explain and stop blocking clicks.
      if (findTarget(step.target)) {
        if (lostSince) setPhase("active");
        lostSince = 0;
      } else if (!lostSince) {
        lostSince = Date.now();
      } else if (Date.now() - lostSince > MISSING_AFTER_MS) {
        setPhase("missing");
      }
    }

    setIsWaitingForAction(false);
    setNudge("");
    setPhase("success");
    await wait(SUCCESS_PAUSE_MS);
    if (run.cancelled) return;

    goTo(stepIndex + 1);
  });

  useEffect(() => {
    if (isPaused) return undefined;

    const run = { cancelled: false, timers: [] };
    // Starts a moment later so a view that just changed has rendered.
    run.timers.push(window.setTimeout(() => runStep(run), SETTLE_MS));

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
      // The previous step's control is on an earlier screen (e.g. the spreadsheet behind an open booking).
      canGoBack: stepIndex > 0 && Boolean(findTarget(steps[stepIndex - 1].target)),
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
      if (event.key === "Escape" && !isPaused) pause();
      return;
    }

    if (isPaused || isDemoClickingRef.current) return;

    const node = event.target;
    if (node?.closest?.("[data-tutorial-ui]")) return;

    const isGuarded =
      event.type === "submit"
        ? Boolean(node?.querySelector?.("[data-tutorial-guard]"))
        : Boolean(node?.closest?.("[data-tutorial-guard]"));

    if (isGuarded) {
      stopEvent(event);
      if (event.type !== "mousedown") setNudge(SAVE_BLOCKED_NUDGE);
      return;
    }

    // While a target is missing, let people find their own way back.
    if (phase === "missing") return;
    if (!isDemo && phase === "active" && matchesTarget(node, step.target)) return;

    stopEvent(event);

    // pointerdown for mouse and touch, click for keyboard activation.
    if (event.type === "pointerdown" || event.type === "click") {
      setNudge(
        isDemo
          ? DEMO_NUDGE
          : `That's not the highlighted spot. Use the ${getTargetLabel(step.target)}, or press Pause to look around freely.`
      );
    }
  });

  useEffect(() => {
    const types = ["pointerdown", "mousedown", "click", "submit", "keydown", "input"];
    const listener = (event) => handleDocumentEvent(event);

    types.forEach((type) => document.addEventListener(type, listener, true));
    return () => types.forEach((type) => document.removeEventListener(type, listener, true));
  }, []);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  /* ---------------------------------------------------------
     Render
  --------------------------------------------------------- */

  if (isPaused) {
    return (
      <section className="tg-paused" data-tutorial-ui aria-label="Tutorial paused">
        <GnomeMascot crop="head" mood="happy" className="tg-paused-gnome" />

        <div className="tg-paused-copy">
          <strong>Paused: {tutorial.title}</strong>
          <span>You're in full control. Anything you save now is real.</span>
        </div>

        <button className="tg-button tg-button-primary" type="button" onClick={resume}>
          <FaPlay aria-hidden="true" /> Resume
        </button>

        <button
          className="tg-icon-button"
          type="button"
          onClick={() => onExit(stepIndex)}
          aria-label="End tutorial"
        >
          <FaTimes aria-hidden="true" />
        </button>
      </section>
    );
  }

  const spot = phase !== "missing" ? layout?.spot : null;
  const pointer = phase === "active" || phase === "success" ? layout?.pointer : null;
  const dialog = layout?.dialog || { dock: window.innerWidth < MOBILE_BREAKPOINT ? "bottom" : null };
  const isDocked = dialog.dock === "bottom";
  const isLastStep = stepIndex === steps.length - 1;

  const gnomeMood =
    phase === "success" ? "excited" : phase === "missing" ? "surprised" : phase === "seeking" ? "thinking" : nudge ? "thinking" : "happy";
  const gnomePose = phase === "success" ? "celebrate" : phase === "active" ? "point" : phase === "seeking" ? "think" : "idle";

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
        tabIndex={-1}
      >
        <header className="tg-dialog-header">
          <GnomeMascot pose={gnomePose} mood={gnomeMood} className="tg-dialog-gnome" />

          <div className="tg-dialog-heading">
            <span className={`tg-mode-chip ${isDemo ? "tg-mode-chip-demo" : ""}`}>
              {isDemo ? "Demo · just watch" : "Practice · saving is off"}
            </span>
            <h2 id="tg-dialog-title">{tutorial.title}</h2>
            <span className="tg-step-count">
              Step {stepIndex + 1} of {steps.length}
            </span>
          </div>

          <button
            className="tg-icon-button"
            type="button"
            onClick={() => onExit(stepIndex)}
            aria-label="End tutorial"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </header>

        <div className="tg-progress" aria-hidden="true">
          <span style={{ width: `${((stepIndex + (phase === "success" ? 1 : 0)) / steps.length) * 100}%` }} />
        </div>

        <div className="tg-dialog-body" aria-live="polite">
          {phase === "missing" ? (
            <div className="tg-missing">
              <p>
                <strong>Hmm, I can't find the {getTargetLabel(step.target)} on this screen.</strong>
              </p>
              <p>{step.missing || "It may be on another page, or this screen may have changed."}</p>
              <p className="tg-muted">
                I'll keep looking. You can also skip this step{layout?.canGoBack ? " or go back one" : ""}.
              </p>
            </div>
          ) : phase === "success" ? (
            <p className="tg-success">{PRAISE[stepIndex % PRAISE.length]}</p>
          ) : (
            <>
              <p>{isDemo ? step.show : step.say}</p>

              {isDemo && step.example && (
                <p className="tg-example">
                  <span>Example</span>
                  {step.example}
                  <small>Just an example. I won't type it in.</small>
                </p>
              )}
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
            onClick={() => goTo(stepIndex - 1, "back")}
            disabled={!layout?.canGoBack}
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
            onClick={() => goTo(0)}
            aria-label="Restart tutorial"
            title="Restart"
          >
            <FaRedo aria-hidden="true" />
          </button>

          <button
            className={`tg-button ${isWaitingForAction || phase === "missing" ? "" : "tg-button-primary"}`}
            type="button"
            onClick={() => goTo(stepIndex + 1)}
          >
            {isLastStep ? "Finish" : isWaitingForAction || phase === "missing" ? "Skip" : "Next"}
            <FaChevronRight aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  );
}
