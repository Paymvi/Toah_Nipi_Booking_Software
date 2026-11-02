import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Gnome from './Gnome.jsx';
import TutorialSpotlight from './TutorialSpotlight.jsx';
import { findTarget } from './targets.js';
import TutorialPractice from './TutorialPractice.jsx';
import { safeActions } from './registry.js';
import { dialoguePosition, expectedMatches, initialSession, sessionReducer } from './model.js';

export default function TutorialEngine({ tutorial, mode, onNavigate, onExit, onComplete }) {
  const [session, dispatch] = useReducer(sessionReducer, { ...initialSession, tutorialId: tutorial.id, status: 'running' });
  const [geometry, setGeometry] = useState({ rect: null, width: window.innerWidth, height: window.innerHeight, panelHeight: 320 });
  const [waiting, setWaiting] = useState(false);
  const [ready, setReady] = useState(false);
  const [practiceReady, setPracticeReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const panel = useRef(null);
  const facts = useRef({ revision: -1 });
  const completionReported = useRef(false);
  const demo = mode === 'demo';
  const navigateView = useEffectEvent((view) => onNavigate(view));
  const step = tutorial.steps[session.index];
  const practice = demo ? step.demoPractice || step.practice : step.practice;
  const targetId = demo ? step.demoTarget || step.target : step.target;

  const advance = useCallback((skip = false) => {
    dispatch({ type: 'advance', allowed: true, skip, index: session.index, revision: session.revision, total: tutorial.steps.length });
  }, [session.index, session.revision, tutorial.steps.length]);

  useEffect(() => {
    if (!demo) return;
    const app = findTarget('staff-view');
    if (!app) return;
    const wasInert = app.inert;
    app.inert = true;
    return () => { app.inert = wasInert; };
  }, [demo]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    panel.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  useEffect(() => {
    if (session.status !== 'finished' || completionReported.current) return;
    completionReported.current = true;
    if (session.skipped.length === 0) onComplete(tutorial.id);
  }, [session.status, session.skipped.length, tutorial.id, onComplete]);

  useEffect(() => {
    if (session.status !== 'running') return;
    let scrolledTarget = null;
    let actionTimer;
    let demoTimer;
    const startedAt = Date.now();
    if (facts.current.revision !== session.revision) {
      facts.current = { revision: session.revision, baseline: undefined, acted: false };
    }
    const read = (id, attribute) => findTarget(id)?.getAttribute(attribute) ?? null;
    function update() {
      const target = findTarget(targetId);
      if (target && scrolledTarget !== target && !session.paused) {
        scrolledTarget = target;
        if (targetId !== 'practice') target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
      const box = target?.getBoundingClientRect();
      const rect = box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null;
      const next = { rect, width: window.innerWidth, height: window.innerHeight, panelHeight: panel.current?.offsetHeight || 320 };
      setGeometry((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      const fact = facts.current;
      if (step.expected?.changed && fact.baseline === undefined) {
        const value = read(step.expected.target, step.expected.attribute);
        if (value !== null) fact.baseline = value;
      }
      const matches = expectedMatches(step.expected, read, fact.baseline);
      const canProceed = Boolean(target) && (!demo || !step.demoAction || (fact.acted && (!step.expected || matches)));
      setReady(canProceed);
      setWaiting(Date.now() - startedAt >= 8000);
      if (!session.paused && !demo && step.kind === 'state' && matches) advance();
      if (!session.paused && demo && canProceed && !demoTimer) demoTimer = window.setTimeout(() => advance(), 7000);
    }
    const interval = window.setInterval(update, 180);
    const initial = window.setTimeout(update, 0);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    if (demo && !session.paused && step.demoAction && !facts.current.acted) {
      actionTimer = window.setTimeout(() => {
        const action = safeActions[step.demoAction];
        if (!action) return;
        if (action.view) {
          facts.current.acted = true;
          navigateView(action.view);
        } else {
          const target = findTarget(action.target);
          // Only explicitly registered non-submit calendar buttons may be invoked.
          if (target?.tagName === 'BUTTON' && target.type === 'button' && !target.disabled) {
            facts.current.acted = true;
            target.click();
          }
        }
      }, 1400);
    }
    return () => {
      window.clearInterval(interval); window.clearTimeout(initial); window.clearTimeout(actionTimer); window.clearTimeout(demoTimer);
      window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true);
    };
  }, [step, targetId, session.revision, session.status, session.paused, demo, retry, advance]);

  function move(type) {
    setPracticeReady(false);
    setReady(false);
    setWaiting(false);
    if (type === 'restart') completionReported.current = false;
    dispatch({ type });
  }
  function next() {
    if (session.paused || !ready) return;
    if (demo || step.kind === 'explain' || (step.kind === 'practice' && practiceReady)) {
      setPracticeReady(false); setReady(false); setWaiting(false); advance();
    }
  }
  const finished = session.status === 'finished';
  const mayNext = !session.paused && ready && (demo || step.kind === 'explain' || (step.kind === 'practice' && practiceReady));
  const position = dialoguePosition(targetId === 'practice' ? null : geometry.rect, geometry.width, geometry.height, geometry.panelHeight);
  return <>
    {!finished && <TutorialSpotlight rect={geometry.rect} demo={demo} />}
    {createPortal(<section ref={panel} tabIndex={-1} className={`tn-tour-dialogue ${finished ? 'tn-tour-finished' : ''}`} role="dialog" aria-modal={demo ? 'true' : undefined} aria-labelledby="tn-tour-title" style={position} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onExit(); }
      if (demo && event.key === 'Tab') {
        const controls = [...panel.current.querySelectorAll('button:not(:disabled), input, select')].filter((element) => element.getClientRects().length);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><Gnome pose={finished ? 'celebrate' : session.paused ? 'thinking' : 'happy'} /><div><small>{demo ? 'Demonstration · no record changes' : 'Walk me through it'}</small><h2 id="tn-tour-title">{tutorial.title}</h2></div><button type="button" onClick={onExit} aria-label="Exit tutorial">×</button></header>
      {finished ? <div aria-live="polite"><h3>{session.skipped.length ? 'You reached the end' : 'Nicely done!'}</h3><p>{session.skipped.length ? `${session.skipped.length} step(s) were skipped, so this tutorial is not marked complete. Replay when the relevant interface is available.` : 'You completed this tutorial. Come back whenever you need a hand.'}</p><button type="button" onClick={() => move('restart')}>Replay tutorial</button><button type="button" onClick={onExit}>Back to tutorials</button></div> : <>
        <p className="tn-tour-step" aria-live="polite">Step {session.index + 1} of {tutorial.steps.length}{session.index > 0 ? ' · Good progress!' : ''}{session.paused ? ' · Paused' : ''}</p>
        <p>{demo ? step.demoText || step.text : step.text}</p>
        {practice && <TutorialPractice key={`${session.revision}-${practice}`} kind={practice} demo={demo} onValid={setPracticeReady} />}
        {session.paused && <p role="status">Take your time. Resume when you are ready.</p>}
        {!demo && step.kind === 'state' && <p className="tn-tour-hint">Waiting for the expected application state. If you open something else, return to the highlighted control; a click alone will not advance this step.</p>}
        {!demo && step.kind === 'practice' && !practiceReady && <p className="tn-tour-hint">Complete the valid practice fields to enable Next.</p>}
        {!demo && step.kind === 'state' && ready && <button type="button" disabled={session.paused} onClick={() => findTarget(targetId)?.focus()}>Focus highlighted control</button>}
        {!ready && <p role="status">{waiting ? 'This target is unavailable or its expected state has not appeared. It may be hidden, filtered out, or unavailable for your account.' : demo && geometry.rect ? 'Preparing the safe demonstration…' : 'Finding the interface…'}</p>}
        {waiting && <div className="tn-tour-recovery"><button type="button" disabled={session.paused} onClick={() => { setWaiting(false); setRetry((value) => value + 1); }}>Retry target</button><button type="button" disabled={session.paused} onClick={() => { setPracticeReady(false); setReady(false); setWaiting(false); advance(true); }}>Skip step (not completed)</button></div>}
        <footer><button type="button" disabled={session.index === 0 || session.paused} onClick={() => move('previous')}>Previous</button><button type="button" onClick={() => dispatch({ type: 'pause' })}>{session.paused ? 'Resume' : 'Pause'}</button><button type="button" disabled={!mayNext} onClick={next}>{session.index === tutorial.steps.length - 1 ? 'Finish' : 'Next'}</button></footer>
        <div className="tn-tour-secondary"><button type="button" onClick={() => move('restart')}>Restart</button><button type="button" onClick={onExit}>Exit tutorial</button>{demo && <small>Advances automatically after 7 seconds per explanation.</small>}</div>
      </>}
    </section>, document.body)}
  </>;
}
