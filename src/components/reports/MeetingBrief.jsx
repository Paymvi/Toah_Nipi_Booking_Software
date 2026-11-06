import { createPortal } from "react-dom";
import { FaPrint } from "react-icons/fa";
import { LODGING_CALENDAR_GROUPS } from "../../constants/lodgingConstants";
import { formatDayKey } from "../../utils/reportMetrics";

const number = (value) => Math.round(value).toLocaleString("en-US");
const ARRIVALS_SHOWN = 6;

function MeetingBrief({ report, period, settings, stays, today, onClose }) {
  const { figures, observations } = report;
  const { now, prior } = figures;
  const arrivals = stays
    .filter((stay) => stay.stateKey === "booked" && stay.start > today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, ARRIVALS_SHOWN);
  const buildingNames = (stay) =>
    stay.lodgingGroups.map((id) => LODGING_CALENDAR_GROUPS.find((group) => group.id === id)?.label).join(", ");

  const rows = [
    ["Stays", now.stays, prior.stays],
    ["Guests", now.guests, prior.guests],
    ["Camper days", now.camperDays, prior.camperDays],
    ["Building-nights", now.buildingNights, prior.buildingNights],
  ];

  // On body, so printing can drop the whole app and leave one page.
  return createPortal(
    <div className="season-brief-overlay" role="dialog" aria-label="Meeting brief">
      <div className="season-brief-actions">
        <button type="button" className="secondary-dashboard-button" onClick={onClose}>Back to Reports</button>
        <button type="button" className="primary-dashboard-button" onClick={() => window.print()}>
          <FaPrint /> Print
        </button>
      </div>

      <article className="season-brief-sheet">
        <h2>Staff meeting brief</h2>
        <p>
          {period.label}, as of {formatDayKey(today)} ·{" "}
          {settings.counting === "stays" ? "Booked and archived stays" : "All records except hosts"}
          {settings.compare ? ` · Compared with the same dates in ${period.priorLabel}` : ""}
        </p>

        <table>
          <thead>
            <tr>
              <th scope="col"><span className="season-visually-hidden">Measure</span></th>
              <th scope="col">So far</th>
              {settings.compare && <th scope="col">{period.priorLabel} same dates</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, current, before]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{number(current)}</td>
                {settings.compare && <td>{number(before)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {observations.length > 0 && (
          <>
            <h3>What stands out</h3>
            <ul>
              {observations.map((observation) => <li key={observation.id}>{observation.text}</li>)}
            </ul>
          </>
        )}

        <h3>Next arrivals</h3>
        {arrivals.length === 0 ? (
          <p>No upcoming stays are booked.</p>
        ) : (
          <table>
            <tbody>
              {arrivals.map((stay) => (
                <tr key={stay.id}>
                  <td>{formatDayKey(stay.start)}</td>
                  <td>{stay.group}</td>
                  <td>{stay.guests === null ? "count unknown" : number(stay.guests)}</td>
                  <td>{buildingNames(stay) || "no building"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>,
    document.body
  );
}

export default MeetingBrief;
