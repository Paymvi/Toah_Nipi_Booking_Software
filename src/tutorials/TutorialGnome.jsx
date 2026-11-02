import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Gnome from './Gnome.jsx';
import TutorialEngine from './TutorialEngine.jsx';
import { tutorials } from './registry.js';
import { readCompleted, saveCompleted } from './model.js';
import './tutorials.css';

export default function TutorialGnome({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [run, setRun] = useState(null);
  const [message, setMessage] = useState('Hi! I’m your tutorial gnome. What would you like to learn?');
  const [completed, setCompleted] = useState(() => {
    try { return readCompleted(window.localStorage, tutorials.map((tutorial) => tutorial.id)); } catch { return []; }
  });
  const launcher = useRef(null);
  const searchField = useRef(null);
  const modeHeading = useRef(null);
  useEffect(() => { if (open) searchField.current?.focus(); }, [open]);
  useEffect(() => { if (selected) modeHeading.current?.focus(); }, [selected]);
  const complete = useCallback((id) => {
    setCompleted((current) => {
      const next = [...new Set([...current, id])];
      try { saveCompleted(window.localStorage, next); } catch { /* Optional persistence. */ }
      return next;
    });
  }, []);
  function close() { setOpen(false); setSelected(null); launcher.current?.focus(); }
  function exit() {
    setRun(null); setSelected(null); setOpen(true);
    setMessage('All set. Nothing was saved by the guide. You can replay any tutorial.');
  }
  function start(mode) { setRun({ tutorial: selected, mode }); setOpen(false); }
  const filtered = tutorials.filter((tutorial) => `${tutorial.title} ${tutorial.description} ${tutorial.category}`.toLowerCase().includes(search.toLowerCase()));
  const categories = [...new Set(filtered.map((tutorial) => tutorial.category))];
  return <>
    {createPortal(<div className="tn-tour-station">
      {open && !run && <section className="tn-tour-panel" role="dialog" aria-labelledby="tn-tour-panel-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
        <header><Gnome pose="wave" /><div><h2 id="tn-tour-panel-title">A little guidance</h2><p>{message}</p></div><button type="button" onClick={close} aria-label="Close tutorials">×</button></header>
        {selected ? <div>
          <button type="button" onClick={() => setSelected(null)}>← All tutorials</button>
          <h3 ref={modeHeading} tabIndex={-1}>{selected.title}</h3><p>{selected.description}</p>
          <p className="tn-tour-hint">Starting can navigate away from your current view. Save or finish any work first. Practice stays separate from real records.</p>
          <button type="button" className="tn-tour-mode" onClick={() => start('interactive')}>Walk me through it while I do it<span>I’ll wait for the expected result.</span></button>
          <button type="button" className="tn-tour-mode" onClick={() => start('demo')}>Show me how to do it<span>Safe navigation and labelled simulations.</span></button>
        </div> : <>
          <label className="tn-tour-search">Search tutorials<input ref={searchField} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bookings, calendar, reports…" /></label>
          {categories.map((category) => <div className="tn-tour-category" key={category}><h3>{category}</h3>{filtered.filter((tutorial) => tutorial.category === category).map((tutorial) => <button type="button" key={tutorial.id} className="tn-tour-option" onClick={() => setSelected(tutorial)}><strong>{tutorial.title}</strong><span>{tutorial.description}</span><small>{tutorial.difficulty} · {tutorial.steps.length} steps{completed.includes(tutorial.id) ? ' · Completed — replay anytime' : ''}</small></button>)}</div>)}
          {!filtered.length && <p role="status">No matching tutorials. Try “booking”, “calendar” or “reports”.</p>}
        </>}
      </section>}
      {!run && <button ref={launcher} type="button" className="tn-tour-launcher" aria-label={open ? 'Close tutorial gnome' : 'Open tutorial gnome'} aria-expanded={open} onClick={() => open ? close() : setOpen(true)}><Gnome pose={open ? 'wave' : 'idle'} /><span>Tutorials</span></button>}
    </div>, document.body)}
    {run && <TutorialEngine tutorial={run.tutorial} mode={run.mode} onNavigate={onNavigate} onExit={exit} onComplete={complete} />}
  </>;
}
