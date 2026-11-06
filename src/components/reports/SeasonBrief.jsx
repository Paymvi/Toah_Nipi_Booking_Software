const number = (value) => Math.round(value).toLocaleString("en-US");
const signed = (value) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${number(Math.abs(value))}`;
const plural = (value, word) => `${number(value)} ${word}${value === 1 ? "" : "s"}`;
const MIN_GUEST_COVERAGE = 0.8;

const MEASURES = [
  { value: "camperDays", label: "Camper days" },
  { value: "guests", label: "Guests" },
  { value: "stays", label: "Stays" },
];

function Figure({ label, value, comparison, detail, isWarning, onOpen }) {
  return (
    <button type="button" className="season-figure" onClick={onOpen}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{comparison}</span>
      {detail && <span className={isWarning ? "season-warning-text" : ""}>{detail}</span>}
    </button>
  );
}

function SeasonBrief({ report, period, settings, retreatType, stays, onChange, onDrawer }) {
  const { figures, months, types, observations } = report;
  const { now, prior, aheadTotals } = figures;
  const compare = settings.compare;
  const hasPrior = prior.stays > 0;
  const nothing = now.stays === 0 && aheadTotals.stays === 0;

  if (nothing) {
    return (
      <section className="season-panel season-state">
        <h3>No stays match these settings</h3>
        <p>
          Nothing arrives in {period.label}
          {retreatType !== "all" ? ` for ${retreatType}` : ""}.
        </p>
        <button
          type="button"
          className="secondary-dashboard-button"
          onClick={() => onChange({ retreatType: "all", period: "thisYear", counting: "stays" })}
        >
          Clear filters
        </button>
      </section>
    );
  }

  const coverage = now.stays ? (now.stays - now.guestsUnknown) / now.stays : 1;
  const priorCoverage = prior.stays ? (prior.stays - prior.guestsUnknown) / prior.stays : 1;
  const isGuestCoverageLow = coverage < MIN_GUEST_COVERAGE;
  const versus = (current, before) => {
    if (!compare) return `To ${period.label}`;
    return hasPrior ? `${signed(current - before)} vs ${number(before)} in ${period.priorLabel}` : `No ${period.priorLabel} records for these dates`;
  };
  const stateCounts = [...figures.soFar, ...figures.ahead].reduce(
    (counts, stay) => counts.set(stay.stateLabel, (counts.get(stay.stateLabel) || 0) + 1),
    new Map()
  );
  const undatedCount = stays.filter((stay) => !stay.start).length;

  const measure = settings.measure;
  const valueOf = (totals) => totals[measure];
  const largest = Math.max(1, ...months.map((row) => Math.max(valueOf(row.totals), compare ? valueOf(row.priorTotals) : 0)));
  const largestType = Math.max(1, ...types.map((row) => row.totals.camperDays));

  return (
    <div className="season-stack">
      {isGuestCoverageLow && (
        <p className="season-banner" role="status">
          Guest counts are known for only {Math.round(coverage * 100)}% of these stays, so guest and camper day figures are minimums.
        </p>
      )}

      {observations.length > 0 && (
        <section className="season-panel">
          <div className="season-panel-head">
            <h3>What stands out</h3>
            <span className="season-muted">Worked out from these records by fixed rules, not a forecast.</span>
          </div>
          <ul className="season-observations">
            {observations.map((observation) => (
              <li key={observation.id}>
                <p>{observation.text}</p>
                <div>
                  {observation.records ? (
                    <button type="button" className="season-link" onClick={() => onDrawer(observation.recordsTitle, observation.records)}>
                      See {plural(observation.records.length, "stay")}
                    </button>
                  ) : (
                    <button type="button" className="season-link" onClick={() => onChange({ tab: observation.goTo })}>
                      Open {observation.goTo === "map" ? "Season Map" : "Data Check"}
                    </button>
                  )}
                  <details>
                    <summary>How this is worked out</summary>
                    <p>{observation.how}</p>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="season-figures" aria-label="Key figures to date" data-tutorial-target="reports-figures">
        <Figure
          label={settings.counting === "stays" ? "Stays so far" : "Records so far"}
          value={number(now.stays)}
          comparison={versus(now.stays, prior.stays)}
          detail={aheadTotals.stays ? `${number(aheadTotals.stays)} more scheduled` : ""}
          onOpen={() => onDrawer("Stays so far", figures.soFar, `Arriving from the start of ${period.label} to today.`)}
        />
        <Figure
          label={isGuestCoverageLow ? "Guests, at least" : "Guests so far"}
          value={number(now.guests)}
          comparison={versus(now.guests, prior.guests)}
          detail={
            now.guestsUnknown
              ? `${plural(now.guestsUnknown, "stay")} with no count`
              : compare && hasPrior && Math.abs(coverage - priorCoverage) >= 0.2
                ? `Counts are less complete in ${coverage < priorCoverage ? period.label : period.priorLabel}`
                : `${number(now.actual)} of ${number(now.stays)} are actual counts`
          }
          isWarning={now.guestsUnknown > 0}
          onOpen={() => onDrawer("Guests so far", figures.soFar, "Stays with no usable count add nothing to the total.")}
        />
        <Figure
          label="Camper days so far"
          value={number(now.camperDays)}
          comparison={versus(now.camperDays, prior.camperDays)}
          detail={now.camperUnknown ? `${plural(now.camperUnknown, "stay")} not measurable` : ""}
          isWarning={now.camperUnknown > 0}
          onOpen={() => onDrawer("Camper days so far", figures.soFar, "Imported figures are used until staff change their inputs or enter actual attendance.")}
        />
        <Figure
          label="Building-nights used"
          value={number(now.buildingNights)}
          comparison={versus(now.buildingNights, prior.buildingNights)}
          detail="One building for one night"
          onOpen={() =>
            onDrawer(
              "Building-nights used",
              figures.soFar.filter((stay) => stay.holdsLodging && stay.lodgingNights.length && stay.lodgingGroups.length),
              "Stays holding a building, counted by arrival date."
            )
          }
        />
      </section>

      {settings.counting === "all" && (
        <p className="season-muted season-breakdown">
          {[...stateCounts.entries()].map(([label, value]) => `${label}: ${number(value)}`).join(" · ")}
          {undatedCount > 0 && ` · ${plural(undatedCount, "record")} with no stay date appear in no period`}
        </p>
      )}

      <div className="season-columns">
        <section className="season-panel">
          <div className="season-panel-head">
            <h3>Month by month</h3>
            <div className="season-segment" role="group" aria-label="Measure">
              {MEASURES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={measure === option.value}
                  onClick={() => onChange({ measure: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="season-key">
            <span><i className="season-key-now" />{period.year}</span>
            <span><i className="season-key-open" />Not finished</span>
            {compare && <span><i className="season-key-prior" />{period.priorLabel} final</span>}
          </div>
          <div className="season-table-wrap">
            <table className="season-table">
              <thead>
                <tr>
                  <th scope="col">Arrival month</th>
                  <th scope="col"><span className="season-visually-hidden">Bars</span></th>
                  <th scope="col">{period.year}</th>
                  {compare && <th scope="col">{period.priorLabel}</th>}
                </tr>
              </thead>
              <tbody>
                {months.map((row) => (
                  <tr key={row.monthKey}>
                    <td>
                      <button
                        type="button"
                        className="season-link"
                        onClick={() => onDrawer(`${row.label} ${row.year}`, row.now, `Arriving in ${row.label} ${row.year}.`)}
                      >
                        {row.label}
                      </button>
                      {row.timing !== "finished" && <span className="season-tag">{row.timing}</span>}
                    </td>
                    <td className="season-bars">
                      <span
                        className={`season-bar ${row.timing !== "finished" ? "season-bar-open" : ""}`}
                        style={{ width: `${(valueOf(row.totals) / largest) * 100}%` }}
                      />
                      {compare && (
                        <span className="season-bar season-bar-prior" style={{ width: `${(valueOf(row.priorTotals) / largest) * 100}%` }} />
                      )}
                    </td>
                    <td>{number(valueOf(row.totals))}</td>
                    {compare && <td>{number(valueOf(row.priorTotals))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="season-panel">
          <div className="season-panel-head">
            <h3>Who came</h3>
            <span className="season-muted">By camper days</span>
          </div>
          <div className="season-table-wrap">
            <table className="season-table">
              <thead>
                <tr>
                  <th scope="col">Retreat type</th>
                  <th scope="col"><span className="season-visually-hidden">Bars</span></th>
                  <th scope="col">Stays</th>
                  <th scope="col">Days</th>
                  {compare && <th scope="col">vs {period.priorLabel}</th>}
                </tr>
              </thead>
              <tbody>
                {types.filter((row) => row.now.length).map((row) => (
                  <tr key={row.type}>
                    <td>
                      <button type="button" className="season-link" onClick={() => onDrawer(row.type, row.now, `Stays of this type in ${period.label}.`)}>
                        {row.type}
                      </button>
                    </td>
                    <td className="season-bars">
                      <span className="season-bar" style={{ width: `${(row.totals.camperDays / largestType) * 100}%` }} />
                    </td>
                    <td>{number(row.totals.stays)}</td>
                    <td>{number(row.totals.camperDays)}</td>
                    {compare && <td>{signed(row.totals.stays - row.priorTotals.stays)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SeasonBrief;
