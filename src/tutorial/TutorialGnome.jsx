/*
  The tutorial gnome: floating launcher (bottom-right of the staff app), the
  help panel that opens above it, and the hand-off to TutorialRunner.

  Mounted once in App.jsx inside StaffAuthGate, so it is on every staff
  view and never on the login screen. (The guest portal is a separate app.)
  Nothing runs in the background while no tutorial is active.
*/

import { useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaBook,
  FaCalendarAlt,
  FaCheckCircle,
  FaChevronRight,
  FaClipboardList,
  FaEye,
  FaHandPointer,
  FaSearch,
  FaTimes,
  FaUsers,
} from "react-icons/fa";

import GnomeMascot from "./GnomeMascot";
import TutorialRunner from "./TutorialRunner";
import { TUTORIALS } from "./tutorials";
import {
  findTarget,
  groupTutorialsByCategory,
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
};

const EXIT_MESSAGE_MS = 4500;

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

export default function TutorialGnome() {
  // closed | panel | running | complete
  const [view, setView] = useState("closed");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const [run, setRun] = useState(null);
  const [progress, setProgress] = useState(readProgress);
  const [isLauncherHovered, setIsLauncherHovered] = useState(false);
  const [hopCount, setHopCount] = useState(0);
  const [launcherMessage, setLauncherMessage] = useState("");

  const launcherRef = useRef(null);
  const messageTimerRef = useRef(0);

  const tutorialsById = Object.fromEntries(TUTORIALS.map((tutorial) => [tutorial.id, tutorial]));
  const visibleGroups = groupTutorialsByCategory(searchTutorials(TUTORIALS, query));
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
    setView("panel");
  }

  function closePanel() {
    setView("closed");
    launcherRef.current?.focus();
  }

  function openDetail(tutorial) {
    setDetail({
      id: tutorial.id,
      // Leaving the Form or the Edit tab clears what was typed there (existing app behaviour).
      hasOpenForm: Boolean(findTarget(["booking-form-save", "booking-edit-ready"])),
    });
  }

  function startTutorial(tutorial, mode, startStep = 0) {
    updateProgress(withUnfinished(progress, tutorial.id, startStep, mode));
    setRun({ tutorial, mode, startStep, key: Date.now() });
    setView("running");
  }

  // run?. throughout: the React Compiler reads these closures' dependencies during render, while run can be null.
  function handleExit(stepIndex) {
    updateProgress(withUnfinished(progress, run?.tutorial.id, stepIndex, run?.mode));
    setRun(null);
    setView("closed");
    showLauncherMessage("No problem! Click me anytime to pick up where you left off.");
  }

  function handleComplete() {
    updateProgress(withCompleted(progress, run?.tutorial.id));
    setView("complete");
  }

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

          <div className="tg-complete-actions">
            <button className="tg-button" type="button" onClick={() => startTutorial(run?.tutorial, run?.mode)}>
              Replay
            </button>
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

          {detailTutorial ? (
            <div className="tg-detail">
              <button className="tg-back-link" type="button" onClick={() => setDetail(null)}>
                <FaArrowLeft aria-hidden="true" /> All tutorials
              </button>

              <h3>{detailTutorial.title}</h3>
              <p>{detailTutorial.description}</p>

              <p className="tg-meta">
                {detailTutorial.category} · {detailTutorial.difficulty} · {detailTutorial.steps.length} steps
                {progress.completed[detailTutorial.id] && (
                  <span className="tg-done-badge">
                    <FaCheckCircle aria-hidden="true" /> Completed
                  </span>
                )}
              </p>

              {detail.hasOpenForm && (
                <p className="tg-warning" role="note">
                  You have a form open. This tutorial may move to another screen, and anything typed there but not
                  saved would be cleared.
                </p>
              )}

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
                    <small>You do each step and I'll guide you. Saving is switched off.</small>
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
                    <small>Sit back and watch. Nothing is typed or saved.</small>
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
                      {tutorialsById[unfinished.id].title}, step {unfinished.step + 1} of{" "}
                      {tutorialsById[unfinished.id].steps.length}
                    </span>
                  </div>
                  <button
                    className="tg-button tg-button-primary"
                    type="button"
                    onClick={() => startTutorial(tutorialsById[unfinished.id], unfinished.mode, unfinished.step)}
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
                                  {tutorial.difficulty} · {tutorial.steps.length} steps
                                </small>
                              </span>

                              {progress.completed[tutorial.id] ? (
                                <FaCheckCircle className="tg-item-done" aria-label="Completed" />
                              ) : (
                                <FaChevronRight aria-hidden="true" />
                              )}
                            </button>
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
            crop="bust"
            pose={view === "panel" || isLauncherHovered ? "wave" : "idle"}
            mood={view === "panel" ? "excited" : "happy"}
            className="tg-launcher-gnome"
          />
        </span>
      </button>
    </div>
  );
}
