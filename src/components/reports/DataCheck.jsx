import { formatDayKey } from "../../utils/reportMetrics";

const ROWS_SHOWN = 25;

function DataCheck({ check, period, today, onOpenBooking }) {
  const { issues, bookedCount, completeCount } = check;
  const percent = bookedCount ? Math.round((completeCount / bookedCount) * 100) : 100;

  return (
    <div className="season-stack">
      <section className="season-panel season-check-summary">
        <div>
          <h3>{completeCount} of {bookedCount} booked stays in {period.label} are complete</h3>
          <span className="season-muted">Complete means nothing below applies to the stay.</span>
        </div>
        <strong>{percent}%</strong>
        <div className="season-meter"><span style={{ width: `${percent}%` }} /></div>
      </section>

      <section className="season-panel">
        <div className="season-panel-head">
          <h3>What to fix first</h3>
          <span className="season-muted">Upcoming stays first, soonest arrival at the top</span>
        </div>

        {issues.length === 0 && (
          <p className="season-muted">
            Nothing to fix. Checked buildings, guest counts, nights, import warnings and retreat types for this period.
          </p>
        )}

        {issues.map((issue, position) => (
          <details className="season-issue" key={issue.id} open={position === 0}>
            <summary>
              <strong>{issue.title}</strong>
              <em>{issue.list.length}</em>
              <span>{issue.why}</span>
            </summary>
            {issue.list.slice(0, ROWS_SHOWN).map((stay) => (
              <div className="season-record" key={stay.id}>
                <strong>{stay.group}</strong>
                <small>
                  {stay.start
                    ? `${formatDayKey(stay.start)} ${stay.start.slice(0, 4)}, ${stay.start > today ? "arriving" : "stayed"}`
                    : `Wanted: ${stay.wantedDates || "no dates given"}`}
                </small>
                <button type="button" className="season-link" onClick={() => onOpenBooking(stay.id)}>Open</button>
              </div>
            ))}
            {issue.list.length > ROWS_SHOWN && (
              <p className="season-muted">{issue.list.length - ROWS_SHOWN} more in the CSV</p>
            )}
          </details>
        ))}
      </section>
    </div>
  );
}

export default DataCheck;
