import { useEffect, useRef, useState } from "react";
import { formatDayKey } from "../../utils/reportMetrics";
import { downloadCsv } from "../../utils/reportRules";

const PAGE_SIZE = 100;
const guestText = (stay) => (stay.guests === null ? "guests unknown" : `${stay.guests} ${stay.guestSource.toLowerCase()}`);

function ReportRecordsDrawer({ title, note, records, onClose, onOpenBooking }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // On the document: focus is elsewhere after returning from a booking.
  useEffect(() => {
    const closeOnEscape = (event) => {
      // Reports stays mounted but hidden behind an open booking.
      if (event.key === "Escape" && closeRef.current?.getClientRects().length) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const knownGuests = records.reduce((sum, stay) => sum + (stay.guests || 0), 0);

  const exportRows = () =>
    downloadCsv("toah-nipi-report-records.csv", [
      {
        title,
        headers: ["Group", "Arrival", "Departure", "Status", "Retreat type", "Guests", "Guest source", "Camper days"],
        rows: records.map((stay) => [
          stay.group, stay.start, stay.end, stay.stateLabel, stay.type, stay.guests ?? "", stay.guestSource, stay.camperDays ?? "",
        ]),
      },
    ]);

  return (
    <>
      <div className="season-scrim" onClick={onClose} />
      <aside className="season-drawer" aria-label={`Records: ${title}`}>
        <div className="season-drawer-head">
          <div>
            <h3>{title}</h3>
            <span className="season-muted">
              {records.length} record{records.length === 1 ? "" : "s"}
              {records.length > 0 && `, ${knownGuests.toLocaleString("en-US")} known guests`}
            </span>
          </div>
          <button ref={closeRef} type="button" className="secondary-dashboard-button" onClick={onClose}>Close</button>
        </div>

        {note && <p className="season-muted">{note}</p>}

        <div className="season-drawer-list">
          {records.length === 0 && <p className="season-muted">Nothing here. This space is open.</p>}
          {records.slice(0, shown).map((stay) => (
            <div className="season-record" key={stay.id}>
              <strong>{stay.group}</strong>
              <small>
                {formatDayKey(stay.start)} · {guestText(stay)}
                {stay.stateKey !== "booked" ? ` · ${stay.stateLabel}` : ""}
              </small>
              <button type="button" className="season-link" onClick={() => onOpenBooking(stay.id)}>Open</button>
            </div>
          ))}
          {records.length > shown && (
            <button type="button" className="season-link" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show more ({records.length - shown} left)
            </button>
          )}
        </div>

        <div className="season-drawer-foot">
          <button type="button" className="season-link" onClick={exportRows} disabled={!records.length}>Export these rows</button>
        </div>
      </aside>
    </>
  );
}

export default ReportRecordsDrawer;
