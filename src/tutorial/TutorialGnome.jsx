/*
  The tutorial gnome: floating launcher (bottom-right of the staff app), the
    help panel that opens above it, and the hand-off to TutorialRunner. A
  demonstration puts the screen back afterwards, unless the person paused it
  and took over. Starting anything that would leave unsaved work behind asks
  first, however it was started.

  Mounted once in App.jsx inside StaffAuthGate, so it is on every staff
  view and never on the login screen. (The guest portal is a separate app.)
  Nothing runs in the background while no tutorial is active.
*/

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaBook,
  FaCalendarAlt,
  FaCheckCircle,
  FaChevronRight,
  FaClipboardList,
  FaEye,
    FaHandPointer,
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
  groupTutorialsByCategory,
  isShown,
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
  Portals: FaKey,
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

// The group someone is already working on, so a portal tutorial needn't ask: an open booking, an open card, or a list searched down to one.
function getCurrentGroup() {
  const booking = document.querySelector("[data-tutorial-booking-id]");
  if (booking && isShown(booking)) return booking.dataset.tutorialBookingId;

  const cards = Array.from(document.querySelectorAll("[data-tutorial-scope]")).filter(isShown);
  const card = cards.find((entry) => "tutorialActive" in entry.dataset) ?? (cards.length === 1 ? cards[0] : null);
  return card?.dataset.tutorialScope ?? null;
}

function getStepCount(tutorial) {
  return getStepPosition(tutorial.steps, 0, false).total;
}

export default function TutorialGnome() {
  const navigate = useNavigate();
  // closed | panel | running | complete
  const [view, setView] = useState("closed");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
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
  const visibleGroups = groupTutorialsByCategory(
    TUTORIALS.filter((tutorial) => matchedIds.has(tutorial.id) || getShownTopics(tutorial).length > 0)
  );
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
    setDetail(null);
    setPendingStart(null);
    setView("panel");
  }

  function closePanel() {
    setView("closed");
    launcherRef.current?.focus();
  }

  function openDetail(tutorial) {
        setDetail({ id: tutorial.id });
  }

  function beginRun(tutorial, mode, startStep, scope, screen) {
    screenToRestoreRef.current = null;
    updateProgress(withUnfinished(progress, tutorial.id, startStep, mode));
    setRun({ tutorial, mode, startStep, scope, key: Date.now(), screen });
    setPendingStart(null);
    setView("running");
  }

  function startTutorial(tutorial, mode, startStep = 0) {
    const scope = tutorial.scenario ? getCurrentGroup() : null;
    const screen = screenToRestoreRef.current ?? captureScreen();
    const begin = () => beginRun(tutorial, mode, startStep, scope, screen);

    // A fictional demo on its own page leaves the real screen, drafts included, hidden underneath.
    const staysOnScreen = mode === "demo" && window.location.pathname === tutorial.scenario?.home;
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
    beginRun(
      walkthrough,
      run?.mode,
      getContinueStep(walkthrough, run?.tutorial.sectionId),
      run?.scope,
      screenToRestoreRef.current ?? run?.screen
    );
  }

  // Never after a pause: anything on screen by then is the person's own work.
  function queueRestore(leaveAsIs) {
    if (run?.mode === "demo" && !leaveAsIs) screenToRestoreRef.current = run?.screen;
  }


  // run?. throughout: the React Compiler reads these closures' dependencies during render, while run can be null.
    function handleExit(stepIndex, leaveAsIs) {
    updateProgress(withUnfinished(progress, run?.tutorial.id, stepIndex, run?.mode));
    queueRestore(leaveAsIs);
    const note = run?.mode === "guided" ? run?.tutorial.finished : run?.tutorial.scenario ? FICTIONAL_GONE : "";
    setRun(null);
    setView("closed");
    showLauncherMessage(note || "No problem! Click me anytime to pick up where you left off.");
  }

    function handleComplete(leaveAsIs, scope) {
    updateProgress(withCompleted(progress, run?.tutorial.id));
    queueRestore(leaveAsIs);
    setRun({ ...run, scope });
    setView("complete");
  }

  // Back in the running tutorial, on a fictional screen, with the same restore point.
  function watchDemo(stepIndex) {
    const start = getResumeStep(run?.tutorial, stepIndex);
    beginRun(run?.tutorial, "demo", start, null, run?.screen);
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
        mode={run.mode}
                startStep={run.startStep}
        startScope={run.scope}
        onWatchDemo={watchDemo}
        onStepChange={(stepIndex) =>
          updateProgress(withUnfinished(progress, run?.tutorial.id, stepIndex, run?.mode))
        }
        onExit={handleExit}
        onComplete={handleComplete}
      />
    );
  }

  const detailTutorial = detail && tutorialsById[detail.id];

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

                    {(run.mode === "guided" ? run.tutorial.finished : run.tutorial.scenario && FICTIONAL_GONE) && (
            <p className="tg-warning" role="note">
              {run.mode === "guided" ? run.tutorial.finished : FICTIONAL_GONE}
            </p>
          )}

          <div className="tg-complete-actions">
            {run.tutorial.parentId ? (
              <button className="tg-button" type="button" onClick={continueWalkthrough}>
                Continue the full walkthrough
              </button>
            ) : (
              <button className="tg-button" type="button" onClick={() => startTutorial(run?.tutorial, run?.mode)}>
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

            <div className="tg-panel-greeting">
              <h2 id="tg-panel-title">Hi! I'm your tutorial gnome.</h2>
              <p>Pick something to learn. I can walk you through it while you do it, or show you how it's done.</p>
            </div>

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
          ) : detailTutorial ? (
            <div className="tg-detail">
              <button className="tg-back-link" type="button" onClick={() => setDetail(null)}>
                <FaArrowLeft aria-hidden="true" /> All tutorials
              </button>

              <h3>{detailTutorial.title}</h3>
                            <p>{detailTutorial.description}</p>

              <p className="tg-meta">
                {detailTutorial.category} · {detailTutorial.difficulty} · {getStepCount(detailTutorial)} steps
                {progress.completed[detailTutorial.id] && (
                  <span className="tg-done-badge">
                    <FaCheckCircle aria-hidden="true" /> Completed
                  </span>
                )}
              </p>

              

              <div className="tg-mode-options">
                <button
                  className="tg-mode-option"
                  type="button"
                  onClick={() => startTutorial(detailTutorial, "guided")}
                  autoFocus
                >
                  <FaHandPointer aria-hidden="true" />
                  <span>
                    <strong>Walk me through it</strong>
                    <small>
                      {detailTutorial.scenario
                        ? "You use the real screens and I guide you. Saving and sending are switched off."
                        : "You do each step and I'll guide you. Saving is switched off."}
                    </small>
                  </span>
                </button>

                <button
                  className="tg-mode-option"
                  type="button"
                  onClick={() => startTutorial(detailTutorial, "demo")}
                >
                  <FaEye aria-hidden="true" />
                  <span>
                    <strong>Show me how</strong>
                    <small>
                      {detailTutorial.scenario
                        ? "Watch it on a fictional group. Nothing real is touched, and I'll bring you back here after."
                        : "Sit back and watch. Nothing is typed or saved, and I'll bring you back here after."}
                    </small>
                  </span>
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
                      {getStepPosition(tutorialsById[unfinished.id].steps, unfinished.step, unfinished.mode === "demo").current} of{" "}
                      {getStepCount(tutorialsById[unfinished.id])}
                    </span>
                  </div>
                  <button
                    className="tg-button tg-button-primary"
                    type="button"
                    onClick={() =>
                      startTutorial(
                        tutorialsById[unfinished.id],
                        unfinished.mode,
                        getResumeStep(tutorialsById[unfinished.id], unfinished.step)
                      )
                    }
                  >
                    Resume
                  </button>
                  <button
                    className="tg-button"
                    type="button"
                    onClick={() => startTutorial(tutorialsById[unfinished.id], unfinished.mode)}
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

              {visibleGroups.length === 0 ? (
                <p className="tg-empty">No tutorials match "{query}". Try "calendar" or "contacts".</p>
              ) : (
                visibleGroups.map(({ category, items }) => {
                  const Icon = CATEGORY_ICONS[category] || FaBook;

                  return (
                    <section className="tg-category" key={category} aria-label={category}>
                      <h3>
                        <Icon aria-hidden="true" /> {category}
                      </h3>

                      <ul>
                        {items.map((tutorial) => (
                          <li key={tutorial.id}>
                            <button className="tg-tutorial-item" type="button" onClick={() => openDetail(tutorial)}>
                              <span>
                                <strong>{tutorial.title}</strong>
                                                                <small>
                                  {tutorial.topics ? "Full walkthrough" : tutorial.difficulty} · {getStepCount(tutorial)} steps
                                </small>
                              </span>

                              {progress.completed[tutorial.id] ? (
                                <FaCheckCircle className="tg-item-done" aria-label="Completed" />
                              ) : (
                                <FaChevronRight aria-hidden="true" />
                              )}
                                                        </button>

                            {getShownTopics(tutorial).length > 0 && (
                              <details className="tg-topics" open={Boolean(query)}>
                                <summary>
                                  Or learn just one topic
                                  <small>
                                    {tutorial.topics.filter((topic) => progress.completed[topic.id]).length} of{" "}
                                    {tutorial.topics.length} done
                                  </small>
                                </summary>

                                {[...new Set(getShownTopics(tutorial).map((topic) => topic.group))].map((group) => (
                                  <div key={group}>
                                    <h4>{group}</h4>
                                    {getShownTopics(tutorial)
                                      .filter((topic) => topic.group === group)
                                      .map((topic) => (
                                        <button
                                          className="tg-tutorial-item"
                                          type="button"
                                          key={topic.id}
                                          onClick={() => openDetail(topic)}
                                        >
                                          <span>
                                            <strong>{topic.title}</strong>
                                          </span>

                                          {progress.completed[topic.id] ? (
                                            <FaCheckCircle className="tg-item-done" aria-label="Completed" />
                                          ) : (
                                            <FaChevronRight aria-hidden="true" />
                                          )}
                                        </button>
                                      ))}
                                  </div>
                                ))}
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
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
