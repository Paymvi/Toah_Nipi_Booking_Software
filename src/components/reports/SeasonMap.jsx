import { useMemo, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { LODGING_CALENDAR_GROUPS } from "../../constants/lodgingConstants";
import {
  addDaysToKey,
  buildNightIndex,
  formatDayKey,
  getGroupCapacity,
  getWeekdayOfKey,
  MONTH_LABELS,
} from "../../utils/reportMetrics";

const WEEKDAY_LETTERS = "SMTWTFS";
const isWeekendNight = (night) => [5, 6].includes(getWeekdayOfKey(night));
const nightWord = (count) => `${count} night${count === 1 ? "" : "s"}`;

function getYearWeeks(year) {
  const first = `${year}-01-01`;
  const monday = addDaysToKey(first, -((getWeekdayOfKey(first) + 6) % 7));
  return Array.from({ length: 53 }, (_, index) => addDaysToKey(monday, index * 7));
}

function getMonthNights(year, month) {
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`
  );
}

const weekNights = (monday) => Array.from({ length: 7 }, (_, index) => addDaysToKey(monday, index));
const uniqueStays = (lists) => [...new Map(lists.flat().map((stay) => [stay.id, stay])).values()];

function RowLabel({ label, detail }) {
  return (
    <div className="season-map-label">
      {label}
      <small>{detail}</small>
    </div>
  );
}

function SeasonMap({ stays, year, today, retreatType, weekends, groupSize, onGroupSize, onDrawer }) {
  const currentYear = Number(today.slice(0, 4));
  const [zoom, setZoom] = useState("year");
  const [shownYear, setShownYear] = useState(year);
  const [month, setMonth] = useState(year === currentYear ? Number(today.slice(5, 7)) - 1 : 0);

  const index = useMemo(
    () => buildNightIndex(retreatType === "all" ? stays : stays.filter((stay) => stay.type === retreatType)),
    [stays, retreatType]
  );

  const stepMonth = (change) => {
    const next = shownYear * 12 + month + change;
    setShownYear(Math.floor(next / 12));
    setMonth(((next % 12) + 12) % 12);
  };

  const openWeekend = (friday) => {
    setShownYear(Number(friday.slice(0, 4)));
    setMonth(Number(friday.slice(5, 7)) - 1);
    setZoom("month");
  };

  const openCell = (label, stayLists) => onDrawer(label, uniqueStays(stayLists));

  let columns;
  let heads;
  let rows;

  if (zoom === "year") {
    const weeks = getYearWeeks(shownYear);
    columns = weeks.length;
    heads = weeks.map((week, position) => {
      const monthOf = (monday) => Number(addDaysToKey(monday, 3).slice(5, 7)) - 1;
      const isNewMonth = position === 0 || monthOf(weeks[position - 1]) !== monthOf(week);
      return <div key={week} className="season-map-head">{isNewMonth ? MONTH_LABELS[monthOf(week)] : ""}</div>;
    });
    const groupRows = LODGING_CALENDAR_GROUPS.map((group) => ({
      id: group.id,
      label: <RowLabel label={group.label} detail={getGroupCapacity(group.id) ? `up to ${getGroupCapacity(group.id)}` : "no capacity set"} />,
      cells: weeks.map((week) => {
        const held = weekNights(week).filter((night) => index.staysOn(group.id, night).length);
        const shade = !held.length ? "" : held.length <= 2 ? "season-cell-1" : held.length <= 4 ? "season-cell-2" : "season-cell-3";
        const text = `${group.label}, week of ${formatDayKey(week)}: ${held.length ? `${nightWord(held.length)} in use` : "open"}`;
        return (
          <button
            key={week}
            type="button"
            className={`season-cell ${shade}`}
            title={text}
            aria-label={text}
            onClick={() => openCell(`${group.label}, week of ${formatDayKey(week)}`, held.map((night) => index.staysOn(group.id, night)))}
          />
        );
      }),
    }));
    const unplacedRow = {
      id: "none",
      label: <RowLabel label="No building" detail="recorded" />,
      cells: weeks.map((week) => {
        const lists = weekNights(week).map((night) => index.unplacedOn(night));
        const count = uniqueStays(lists).length;
        const text = `Week of ${formatDayKey(week)}: ${count ? `${count} with no building` : "none"}`;
        return (
          <button
            key={week}
            type="button"
            className={`season-cell ${count ? "season-cell-alert" : ""}`}
            title={text}
            aria-label={text}
            onClick={() => openCell(`No building, week of ${formatDayKey(week)}`, lists)}
          >
            {count ? "!" : ""}
          </button>
        );
      }),
    };
    rows = [...groupRows, unplacedRow];
  } else {
    const nights = getMonthNights(shownYear, month);
    columns = nights.length;
    heads = nights.map((night) => (
      <div key={night} className={`season-map-head ${isWeekendNight(night) ? "season-map-head-weekend" : ""}`}>
        {WEEKDAY_LETTERS[getWeekdayOfKey(night)]}
        <br />
        {Number(night.slice(8))}
      </div>
    ));
    const groupRows = LODGING_CALENDAR_GROUPS.map((group) => ({
      id: group.id,
      label: <RowLabel label={group.label} detail={getGroupCapacity(group.id) ? `up to ${getGroupCapacity(group.id)}` : "no capacity set"} />,
      cells: nights.map((night) => {
        const held = index.staysOn(group.id, night);
        const isWaitlistOnly = held.length > 0 && held.every((stay) => stay.stateKey === "waitlist");
        const state = !held.length ? "" : isWaitlistOnly ? "season-cell-alert" : "season-cell-2";
        const text = `${group.label}, ${formatDayKey(night)}: ${
          held.length ? held.map((stay) => stay.group).join(", ") + (isWaitlistOnly ? " (waitlist)" : "") : "open"
        }`;
        return (
          <button
            key={night}
            type="button"
            className={`season-cell ${state} ${isWeekendNight(night) ? "season-cell-weekend" : ""}`}
            title={text}
            aria-label={text}
            onClick={() => openCell(`${group.label}, ${formatDayKey(night)}`, [held])}
          >
            {isWaitlistOnly ? "W" : ""}
          </button>
        );
      }),
    }));
    const unplacedRow = {
      id: "none",
      label: <RowLabel label="No building" detail="recorded" />,
      cells: nights.map((night) => {
        const list = index.unplacedOn(night);
        const text = `${formatDayKey(night)}: ${list.length ? list.map((stay) => stay.group).join(", ") : "none"}`;
        return (
          <button
            key={night}
            type="button"
            className={`season-cell ${list.length ? "season-cell-alert" : ""}`}
            title={text}
            aria-label={text}
            onClick={() => openCell(`No building, ${formatDayKey(night)}`, [list])}
          >
            {list.length ? "!" : ""}
          </button>
        );
      }),
    };
    rows = [...groupRows, unplacedRow];
  }

  return (
    <div className="season-map-columns">
      <section className="season-panel">
        <div className="season-panel-head">
          <div>
            <h3>Building use, {shownYear}</h3>
            <span className="season-muted">Nights held, by the Lodging Calendar's rule. Cancelled stays and inquiries hold no building.</span>
          </div>
          <div className="season-segment" role="group" aria-label="Zoom">
            <button type="button" aria-pressed={zoom === "year"} onClick={() => setZoom("year")}>Year</button>
            <button type="button" aria-pressed={zoom === "month"} onClick={() => setZoom("month")}>Month</button>
          </div>
        </div>

        {zoom === "month" && (
          <div className="season-map-nav">
            <button type="button" className="secondary-dashboard-button" aria-label="Previous month" onClick={() => stepMonth(-1)}><FaChevronLeft /></button>
            <strong>{MONTH_LABELS[month]} {shownYear}</strong>
            <button type="button" className="secondary-dashboard-button" aria-label="Next month" onClick={() => stepMonth(1)}><FaChevronRight /></button>
            <span className="season-muted">Friday and Saturday nights are marked</span>
          </div>
        )}

        <div className="season-map-scroll">
          <div className={`season-map season-map-${zoom}`} style={{ "--season-map-columns": columns }}>
            <div className="season-map-corner" />
            {heads}
            {rows.map((row) => (
              <div key={row.id} className="season-map-row">
                {row.label}
                {row.cells}
              </div>
            ))}
          </div>
        </div>

        <div className="season-key">
          <span><i className="season-key-empty" />Open</span>
          {zoom === "year" ? (
            <>
              <span><i className="season-cell-1" />1 to 2 nights</span>
              <span><i className="season-cell-2" />3 to 4</span>
              <span><i className="season-cell-3" />5 to 7</span>
              <span><i className="season-cell-alert" />! Needs a building</span>
            </>
          ) : (
            <>
              <span><i className="season-cell-2" />Booked</span>
              <span><i className="season-cell-alert" />W Waitlist, ! Needs a building</span>
            </>
          )}
        </div>
        <p className="season-muted season-map-hint">Select any cell to see the stays behind it.</p>
      </section>

      <section className="season-panel season-weekends">
        <div>
          <h3>Open weekends</h3>
          <span className="season-muted">Where a new group could fit, next 26 weeks</span>
        </div>
        <label className="season-field">
          <span>Group size</span>
          <input
            type="number"
            min="1"
            value={groupSize}
            onChange={(event) => onGroupSize(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <div>
          {weekends.length === 0 && <p className="season-muted">No weekend in this window has that much room in empty buildings.</p>}
          {weekends.slice(0, 12).map((weekend) => (
            <button key={weekend.friday} type="button" className="season-weekend" onClick={() => openWeekend(weekend.friday)}>
              <strong>{formatDayKey(weekend.friday)} to {formatDayKey(weekend.sunday)}</strong>
              <b>up to {weekend.capacity}</b>
              <small>
                {weekend.open.map((group) => group.label).join(", ")}
                {weekend.unplaced > 0 && " · a stay on these dates has no building yet"}
              </small>
            </button>
          ))}
          {weekends.length > 12 && <p className="season-muted">{weekends.length - 12} more in the CSV</p>}
        </div>
        <p className="season-muted">
          Upper recorded capacities added across empty buildings. Check the Lodging Calendar before offering dates. Closed dates are not recorded yet.
        </p>
      </section>
    </div>
  );
}

export default SeasonMap;
