/*
  The tutorial gnome: floating launcher (bottom-right of the staff app), the
    help panel that opens above it, and the hand-off to TutorialRunner. Picking
  a tutorial starts its demonstration straight away. A demonstration puts the
  screen back afterwards, unless the person paused it
  and took over. Starting anything that would leave unsaved work behind asks
  first, however it was started.

  Mounted once in App.jsx inside StaffAuthGate, so it is on every staff
  view and never on the login screen. (The guest portal is a separate app.)
  Nothing runs in the background while no tutorial is active.
*/

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBook,
  FaCalendarAlt,
  FaChartBar,
  FaCheckCircle,
  FaChevronRight,
  FaClipboardList,
  FaEnvelope,
  FaKey,
  FaSearch,
  FaTimes,
  FaUsers,
} from "react-icons/fa";

import GnomeMascot from "./GnomeMascot";
import TutorialRunner from "./TutorialRunner";
import { ALL_TUTORIALS, TUTORIALS } from "./tutorials";
import {
    findTarget,
  getContinueStep,
  getResumeStep,
  getStepPosition,
  getUnsavedWork,
  loadTutorialProgress,
  saveTutorialProgress,
  searchTutorials,
  withCompleted,
  withUnfinished,
} from "./tutorialCore";

const CATEGORY_ICONS = {
  Bookings: FaClipboardList,
  Calendar: FaCalendarAlt,
  Contacts: FaUsers,
  Reports: FaChartBar,
  Portals: FaKey,
  Emails: FaEnvelope,
};

const EXIT_MESSAGE_MS = 4500;
const FICTIONAL_GONE = "The fictional group is gone. Everything on screen now is real.";

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readProgress() {
  const storage = getStorage();
  return storage ? loadTutorialProgress(storage) : loadTutorialProgress({ getItem: () => null });
}

function writeProgress(progress) {
  const storage = getStorage();
  if (storage) saveTutorialProgress(storage, progress);
}

function getOpenBookingName() {
  return findTarget("booking-profile")?.querySelector("h2")?.textContent ?? null;
}

// What a demonstration moves away from. Booking Detail has no URL, so the open booking and tab are noted too.
function captureScreen() {
  return {
    path: window.location.pathname,
    bookingName: getOpenBookingName(),
    bookingTab: findTarget("booking-tabs")?.querySelector(".active")?.textContent ?? null,
  };
}

function getStepCount(tutorial) {
  return getStepPosition(tutorial.steps, 0).total;
}

// One library row. A completed row keeps its check and says it can be replayed.
function TutorialItem({ tutorial, icon: Icon, isDone, onOpen }) {
  return (
    <button className="tg-tutorial-item" type="button" onClick={() => onOpen(tutorial)}>
      {Icon && <Icon className="tg-item-icon" aria-hidden="true" />}
      <strong>{tutorial.title}</strong>
      {isDone ? (
        <span className="tg-item-done">
          <FaCheckCircle aria-hidden="true" /> <span className="tg-visually-hidden">Completed. </span>Replay
        </span>
      ) : (
        <FaChevronRight className="tg-item-go" aria-hidden="true" />
      )}
    </button>
  );
}

export default function TutorialGnome() {
  const navigate = useNavigate();
  // closed | panel | running | complete
  const [view, setView] = useState("closed");
  const [query, setQuery] = useState("");
  const [run, setRun] = useState(null);
  const [progress, setProgress] = useState(readProgress);
  const [isLauncherHovered, setIsLauncherHovered] = useState(false);
  const [hopCount, setHopCount] = useState(0);
  const [launcherMessage, setLauncherMessage] = useState("");
  const [pendingStart, setPendingStart] = useState(null);

  const launcherRef = useRef(null);
  const messageTimerRef = useRef(0);
  const screenToRestoreRef = useRef(null);

  const tutorialsById = Object.fromEntries(ALL_TUTORIALS.map((tutorial) => [tutorial.id, tutorial]));
  const matchedIds = new Set(searchTutorials(ALL_TUTORIALS, query).map((tutorial) => tutorial.id));
  const getShownTopics = (tutorial) => (tutorial.topics ?? []).filter((topic) => matchedIds.has(topic.id));
  const visibleTutorials = TUTORIALS.filter((tutorial) => matchedIds.has(tutorial.id) || getShownTopics(tutorial).length > 0);
  const unfinished = progress.unfinished && tutorialsById[progress.unfinished.id] ? progress.unfinished : null;

  function updateProgress(next) {
    setProgress(next);
    writeProgress(next);
  }

  function showLauncherMessage(message) {
    window.clearTimeout(messageTimerRef.current);
    setLauncherMessage(message);
    messageTimerRef.current = window.setTimeout(() => setLauncherMessage(""), EXIT_MESSAGE_MS);
  }

  function openPanel() {
    setHopCount((count) => count + 1);
    setLauncherMessage("");
    setPendingStart(null);
    setView("panel");
  }

  function closePanel() {
    setView("closed");
    launcherRef.current?.focus();
  }

  function beginRun(tutorial, startStep, screen) {
    screenToRestoreRef.current = null;
    updateProgress(withUnfinished(progress, tutorial.id, startStep));
    setRun({ tutorial, startStep, key: Date.now(), screen });
    setPendingStart(null);
    setView("running");
  }

  function startTutorial(tutorial, startStep = 0) {
    const screen = screenToRestoreRef.current ?? captureScreen();
    const begin = () => beginRun(tutorial, startStep, screen);

    // A fictional demo on its own page leaves the real screen, drafts included, hidden underneath.
    const staysOnScreen = window.location.pathname === tutorial.scenario?.home;
    const unsaved = staysOnScreen ? [] : getUnsavedWork();

    if (unsaved.length > 0) {
      setPendingStart({ title: tutorial.title, unsaved, begin });
      setView("panel");
      return;
    }

    begin();
  }

  function continueWalkthrough() {
    const walkthrough = tutorialsById[run?.tutorial.parentId];
    beginRun(walkthrough, getContinueStep(walkthrough, run?.tutorial.sectionId), screenToRestoreRef.current ?? run?.screen);
  }

  // Never after a pause: anything on screen by then is the person's own work.
  function queueRestore(leaveAsIs) {
    if (!leaveAsIs) screenToRestoreRef.current = run?.screen;
  }

  // run?. throughout: the React Compiler reads these closures' dependencies during render, while run can be null.
  function handleExit(stepIndex, leaveAsIs) {
    updateProgress(withUnfinished(progress, run?.tutorial.id, stepIndex));
    queueRestore(leaveAsIs);
    setRun(null);
    setView("closed");
    showLauncherMessage(run?.tutorial.scenario ? FICTIONAL_GONE : "No problem! Click me anytime to pick up where you left off.");
  }

  function handleComplete(leaveAsIs) {
    updateProgress(withCompleted(progress, run?.tutorial.id));
    queueRestore(leaveAsIs);
    setView("complete");
  }

  // After the runner has gone, so its click guard can't stop these. Uses the app's own controls, so views reset as they do for a person.
  useEffect(() => {
    const screen = screenToRestoreRef.current;
    // A finished topic may continue into the walkthrough, so it waits for the person's answer.
    if (!screen || view === "running" || (view === "complete" && run?.tutorial.parentId)) return;
    screenToRestoreRef.current = null;

    const openBookingName = getOpenBookingName();

    if (openBookingName && openBookingName === screen.bookingName) {
      const tabs = findTarget("booking-tabs")?.querySelectorAll("button") ?? [];
      Array.from(tabs).find((tab) => tab.textContent === screen.bookingTab)?.click();
      return;
    }

    if (openBookingName) findTarget("booking-back")?.click();
    navigate(screen.path);
  }, [view, navigate, run]);

  // Close the panel on Escape or a click elsewhere on the page.
  useEffect(() => {
    if (view !== "panel" && view !== "complete") return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setView("closed");
        launcherRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!event.target.closest?.("[data-tutorial-ui]")) setView("closed");
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [view]);

  useEffect(() => () => window.clearTimeout(messageTimerRef.current), []);

  if (view === "running" && run) {
    return (
      <TutorialRunner
        key={run.key}
        tutorial={run.tutorial}
        startStep={run.startStep}
        onStepChange={(stepIndex) => updateProgress(withUnfinished(progress, run?.tutorial.id, stepIndex))}
        onExit={handleExit}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <div className="tg-root" data-tutorial-ui>
      {view === "complete" && run && (
        <section className="tg-complete" role="dialog" aria-labelledby="tg-complete-title">
          <div className="tg-confetti" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => (
              <span key={index} style={{ "--tg-i": index }} />
            ))}
          </div>

          <GnomeMascot pose="celebrate" mood="excited" className="tg-complete-gnome" />

          <h2 id="tg-complete-title">You did it!</h2>
          <p>
            You finished <strong>{run.tutorial.title}</strong>. Replay it anytime from my help station.
          </p>

          {run.tutorial.scenario && (
            <p className="tg-warning" role="note">
              {FICTIONAL_GONE}
            </p>
          )}

          <div className="tg-complete-actions">
            {run.tutorial.parentId ? (
              <button className="tg-button" type="button" onClick={continueWalkthrough}>
                Continue the full walkthrough
              </button>
            ) : (
              <button className="tg-button" type="button" onClick={() => startTutorial(run?.tutorial)}>
                Replay
              </button>
            )}
            <button className="tg-button" type="button" onClick={openPanel}>
              More tutorials
            </button>
            <button
              className="tg-button tg-button-primary"
              type="button"
              onClick={closePanel}
              autoFocus
            >
              Done
            </button>
          </div>
        </section>
      )}

      {view === "panel" && (
        <section
          id="tg-panel"
          className="tg-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="tg-panel-title"
        >
          <header className="tg-panel-header">
            <GnomeMascot pose="wave" mood="happy" className="tg-panel-gnome" />

            <h2 id="tg-panel-title">What would you like to learn?</h2>

            <button className="tg-icon-button" type="button" onClick={closePanel} aria-label="Close tutorials">
              <FaTimes aria-hidden="true" />
            </button>
          </header>

          {pendingStart ? (
            <div className="tg-detail">
              <h3>Before we start</h3>
              <p className="tg-warning" role="alert">
                You have unsaved work: {pendingStart.unsaved.join(", ")}. "{pendingStart.title}" may leave this screen, and
                anything not saved would be lost.
              </p>
              <div className="tg-complete-actions">
                <button className="tg-button tg-button-primary" type="button" onClick={closePanel} autoFocus>
                  Go back and save it
                </button>
                <button className="tg-button" type="button" onClick={() => pendingStart?.begin()}>
                  Start anyway
                </button>
              </div>
            </div>
          ) : (
            <div className="tg-library">
              {unfinished && (
                <div className="tg-resume">
                  <GnomeMascot crop="head" mood="wink" className="tg-resume-gnome" />
                  <div>
                    <strong>Pick up where you left off?</strong>
                    <span>
                      {tutorialsById[unfinished.id].title}, step{" "}
                      {getStepPosition(tutorialsById[unfinished.id].steps, unfinished.step).current} of{" "}
                      {getStepCount(tutorialsById[unfinished.id])}
                    </span>
                  </div>
                  <button
                    className="tg-button tg-button-primary"
                    type="button"
                    onClick={() =>
                      startTutorial(tutorialsById[unfinished.id], getResumeStep(tutorialsById[unfinished.id], unfinished.step))
                    }
                  >
                    Resume
                  </button>
                  <button
                    className="tg-button"
                    type="button"
                    onClick={() => startTutorial(tutorialsById[unfinished.id])}
                  >
                    Start over
                  </button>
                </div>
              )}

              <label className="tg-search">
                <FaSearch aria-hidden="true" />
                <span className="tg-visually-hidden">Search tutorials</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search tutorials…"
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
              </label>

              {visibleTutorials.length === 0 ? (
                <p className="tg-empty">No tutorials match "{query}". Try "calendar" or "contacts".</p>
              ) : (
                <ul className="tg-list">
                  {visibleTutorials.map((tutorial) => {
                    const Icon = CATEGORY_ICONS[tutorial.category] || FaBook;
                    const topics = getShownTopics(tutorial);

                    return (
                      <li key={tutorial.id}>
                        <TutorialItem tutorial={tutorial} icon={Icon} isDone={progress.completed[tutorial.id]} onOpen={startTutorial} />

                        {topics.length > 0 && (
                          <details
                            className="tg-topics"
                            open={Boolean(query)}
                            onToggle={(event) => event.currentTarget.open && event.currentTarget.scrollIntoView({ block: "nearest" })}
                          >
                            <summary>
                              <FaChevronRight aria-hidden="true" /> Individual topics
                            </summary>
                            <ul>
                              {topics.map((topic) => (
                                <li key={topic.id}>
                                  <TutorialItem tutorial={topic} isDone={progress.completed[topic.id]} onOpen={startTutorial} />
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {launcherMessage && view === "closed" && (
        <p className="tg-launcher-bubble" role="status">
          {launcherMessage}
        </p>
      )}

      <button
        ref={launcherRef}
        autoFocus={Boolean(launcherMessage)}
        className={`tg-launcher ${view === "panel" ? "tg-launcher-open" : ""}`}
        type="button"
        aria-label="Tutorial gnome: learn how to use the booking software"
        aria-expanded={view === "panel"}
        aria-controls={view === "panel" ? "tg-panel" : undefined}
        title="Need a hand? Ask the gnome"
        onClick={() => (view === "panel" ? closePanel() : openPanel())}
        onMouseEnter={() => setIsLauncherHovered(true)}
        onMouseLeave={() => setIsLauncherHovered(false)}
      >
        <span key={hopCount} className={hopCount > 0 ? "tg-launcher-hop" : ""}>
          <GnomeMascot
            crop="seated"
            pose={view === "panel" || isLauncherHovered ? "wave" : "idle"}
            mood={view === "panel" ? "excited" : "happy"}
            className="tg-launcher-gnome"
          />
        </span>
      </button>
    </div>
  );
}
