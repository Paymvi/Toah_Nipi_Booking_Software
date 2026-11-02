import { useState } from 'react';
import { practiceValid } from './model.js';

export default function TutorialPractice({ kind, demo, onValid }) {
  const [values, setValues] = useState({});
  function change(event) {
    const next = { ...values, [event.target.name]: event.target.value };
    setValues(next);
    onValid(practiceValid(kind, next));
  }
  return <div className="tn-tour-practice" data-tutorial="practice">
    <strong>{demo ? 'SIMULATION · fictional example' : 'PRACTICE · never saved'}</strong>
    {demo || kind === 'profile' || kind === 'report' ? <div>
      {kind === 'profile' ? <><h3>Pine Trail Group</h3><p>Overview · Edit · Housing · Staff Assignments · Checklists</p><p>Alex Example · 24 guests · 2 nights</p><p>Meals, lodging and activities appear when available.</p></> : kind === 'report' ? <><p>Date Range: Custom Date Range</p><p>From: sample arrival start<br />To: sample arrival end</p><p>Totals update for the selected arrivals.</p></> : kind === 'group' ? <p>Pine Trail Group<br />Alex Example<br />Sample retreat type</p> : <p>Arrival: November 10<br />Departure: November 12<br />Approximate guests: 24</p>}
    </div> : kind === 'group' ? <div className="tn-tour-practice-fields">
      <label>Fictional group<input name="group" value={values.group || ''} onChange={change} autoComplete="off" /></label>
      <label>Fictional contact<input name="contact" value={values.contact || ''} onChange={change} autoComplete="off" /></label>
      <label>Retreat type<select name="type" value={values.type || ''} onChange={change}><option value="">Choose a sample</option><option value="sample">Sample retreat</option></select></label>
    </div> : <div className="tn-tour-practice-fields">
      <label>Practice arrival<input type="date" name="arrival" value={values.arrival || ''} onChange={change} /></label>
      <label>Practice departure<input type="date" name="departure" value={values.departure || ''} min={values.arrival || undefined} onChange={change} /></label>
      <label>Practice guest count<input type="number" min="1" step="1" name="guests" value={values.guests || ''} onChange={change} /></label>
    </div>}
  </div>;
}
