import { useEffect, useMemo, useState } from "react";
import { FaFileCsv, FaPrint } from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import DataCheck from "../components/reports/DataCheck";
import MeetingBrief from "../components/reports/MeetingBrief";
import ReportRecordsDrawer from "../components/reports/ReportRecordsDrawer";
import SeasonBrief from "../components/reports/SeasonBrief";
import SeasonMap from "../components/reports/SeasonMap";
import { getSavedHiddenInquiries, loadHiddenInquiries } from "../services/inquiryHidden";
import {
  buildReportStays,
  formatDayKey,
  getDataIssues,
  getLocalDateKey,
  getMonthRows,
  getObservations,
  getOpenWeekends,
  getReportPeriod,
  getSeasonFigures,
  getTypeRows,
  parseSeasonSettings,
  REPORT_PERIOD_OPTIONS,
} from "../utils/reportMetrics";
import { downloadCsv } from "../utils/reportRules";

const SEASON_SETTINGS_STORAGE_KEY = "toahNipiSeasonReportSettings";
const DEFAULT_GROUP_SIZE = 40;
const WEEKEND_HORIZON_DAYS = 182;

const TABS = [
  { value: "brief", label: "Season Brief" },
  { value: "map", label: "Season Map" },
  { value: "check", label: "Data Check" },
];

function getSavedSettings() {
  try {
    return parseSeasonSettings(localStorage.getItem(SEASON_SETTINGS_STORAGE_KEY));
  } catch {
    return parseSeasonSettings(null);
  }
}

function SeasonReportsView({ inquiryBookings, isLoading, loadError, loadedAt, onRetry, onOpenBooking }) {
  const [settings, setSettings] = useState(getSavedSettings);
  const [hiddenInquiryIds, setHiddenInquiryIds] = useState(
    () => new Set(getSavedHiddenInquiries().map((inquiry) => inquiry.id))
  );
  const [groupSize, setGroupSize] = useState(DEFAULT_GROUP_SIZE);
  const [drawer, setDrawer] = useState(null);
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SEASON_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings simply won't be remembered.
    }
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    loadHiddenInquiries(supabase).then((result) => {
      if (!cancelled && result.available) {
        setHiddenInquiryIds(new Set(result.hidden.map((inquiry) => inquiry.id)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (changes) => setSettings((current) => ({ ...current, ...changes }));
  const today = getLocalDateKey();
  const { stays, hostExcluded, convertedExcluded } = useMemo(
    () => buildReportStays(inquiryBookings, hiddenInquiryIds),
    [inquiryBookings, hiddenInquiryIds]
  );
  const staysById = useMemo(() => new Map(stays.map((stay) => [stay.id, stay])), [stays]);
  const retreatTypes = useMemo(() => [...new Set(stays.map((stay) => stay.type))].sort(), [stays]);

  const hasRecords = stays.length > 0;
  const isSavedTypeGone =
    hasRecords && settings.retreatType !== "all" && !retreatTypes.includes(settings.retreatType);
  const retreatType = isSavedTypeGone ? "all" : settings.retreatType;
  const filters = useMemo(() => ({ counting: settings.counting, retreatType }), [settings.counting, retreatType]);
  const period = useMemo(() => getReportPeriod(settings, today), [settings, today]);

  const report = useMemo(() => {
    const figures = getSeasonFigures(stays, period, filters, today);
    const months = getMonthRows(stays, period, filters, today);
    const types = getTypeRows(stays, period, filters);
    const check = getDataIssues(stays, period, today);
    const weekends = getOpenWeekends(stays, today, groupSize, WEEKEND_HORIZON_DAYS);
    const observations = getObservations({
      months,
      types,
      weekends,
      groupSize,
      firstIssue: check.issues[0],
      compare: settings.compare,
      priorLabel: period.priorLabel,
      horizonLabel: "in the next 26 weeks",
    });
    return { figures, months, types, check, weekends, observations };
  }, [stays, period, filters, today, groupSize, settings.compare]);

  const openDrawer = (title, records, note = "") =>
    setDrawer({ title, note, ids: records.map((stay) => stay.id), opener: document.activeElement });
  const closeDrawer = () => {
    drawer?.opener?.focus?.();
    setDrawer(null);
  };

  const exportView = () => {
    const header = {
      title: "Report settings",
      headers: ["Setting", "Value"],
      rows: [
        ["Period", period.label],
        ["Counting", settings.counting === "stays" ? "Booked and archived stays" : "Every record except hosts"],
        ["Retreat type", retreatType === "all" ? "All" : retreatType],
        ["Host records left out", hostExcluded],
        ["Converted inquiries counted as their booking", convertedExcluded],
        ["Exported", new Date().toISOString()],
      ],
    };
    const nameParts = { brief: "season-brief", map: "open-weekends", check: "data-check" };
    const sections = {
      brief: [
        {
          title: "To date",
          headers: ["Measure", period.label, `${period.priorLabel} same dates`, "Scheduled ahead"],
          rows: [
            ["Stays", report.figures.now.stays, report.figures.prior.stays, report.figures.aheadTotals.stays],
            ["Guests (known)", report.figures.now.guests, report.figures.prior.guests, report.figures.aheadTotals.guests],
            ["Stays with no guest count", report.figures.now.guestsUnknown, report.figures.prior.guestsUnknown, report.figures.aheadTotals.guestsUnknown],
            ["Camper days", report.figures.now.camperDays, report.figures.prior.camperDays, report.figures.aheadTotals.camperDays],
            ["Building-nights", report.figures.now.buildingNights, report.figures.prior.buildingNights, report.figures.aheadTotals.buildingNights],
          ],
        },
        {
          title: "By arrival month",
          headers: ["Month", "Stays", "Guests", "Camper days", `${period.priorLabel} stays`, `${period.priorLabel} guests`, `${period.priorLabel} camper days`],
          rows: report.months.map((row) => [
            `${row.label} ${row.year}`, row.totals.stays, row.totals.guests, row.totals.camperDays,
            row.priorTotals.stays, row.priorTotals.guests, row.priorTotals.camperDays,
          ]),
        },
        {
          title: "By retreat type",
          headers: ["Retreat type", "Stays", "Guests", "Camper days", `${period.priorLabel} stays`],
          rows: report.types.map((row) => [row.type, row.totals.stays, row.totals.guests, row.totals.camperDays, row.priorTotals.stays]),
        },
      ],
      map: [
        {
          title: `Open weekends for ${groupSize} guests`,
          headers: ["Friday", "Sunday", "Open buildings", "Recorded capacity", "Stays with no building"],
          rows: report.weekends.map((weekend) => [
            weekend.friday, weekend.sunday, weekend.open.map((group) => group.label).join("; "), weekend.capacity, weekend.unplaced,
          ]),
        },
      ],
      check: report.check.issues.map((issue) => ({
        title: issue.title,
        headers: ["Group", "Arrival", "Status"],
        rows: issue.list.map((stay) => [stay.group, stay.start || "No date", stay.stateLabel]),
      })),
    };
    downloadCsv(`toah-nipi-${nameParts[settings.tab]}.csv`, [header, ...sections[settings.tab]]);
  };

  const hasNeverLoaded = !loadedAt;
  const body = (() => {
    if (hasNeverLoaded && loadError) {
      return (
        <section className="season-panel season-state" role="alert">
          <h3>Reports could not load</h3>
          <p>The booking records did not arrive, so no figures are shown. Your records are not affected.</p>
          <button type="button" className="primary-dashboard-button" onClick={onRetry}>Try again</button>
        </section>
      );
    }
    if (hasNeverLoaded || (isLoading && !hasRecords)) {
      return (
        <div className="season-stack" aria-busy="true">
          <p className="season-muted" role="status">Loading bookings. Figures appear when every record has arrived.</p>
          <div className="season-skeleton" />
          <div className="season-skeleton season-skeleton-tall" />
        </div>
      );
    }
    if (!hasRecords) {
      return (
        <section className="season-panel season-state">
          <h3>No bookings yet</h3>
          <p>Reports fill in once bookings are added or imported.</p>
        </section>
      );
    }
    return (
      <>
        <div hidden={settings.tab !== "brief"}>
          <SeasonBrief
            report={report}
            period={period}
            settings={settings}
            retreatType={retreatType}
            stays={stays}
            onChange={update}
            onDrawer={openDrawer}
          />
        </div>
        <div hidden={settings.tab !== "map"}>
          <SeasonMap
            key={period.year}
            stays={stays}
            year={period.year}
            today={today}
            retreatType={retreatType}
            weekends={report.weekends}
            groupSize={groupSize}
            onGroupSize={setGroupSize}
            onDrawer={openDrawer}
          />
        </div>
        <div hidden={settings.tab !== "check"}>
          <DataCheck check={report.check} period={period} today={today} onOpenBooking={onOpenBooking} />
        </div>
      </>
    );
  })();

  const countingNote =
    settings.tab === "map"
      ? "Season Map always follows the Lodging Calendar rule, so Counting does not change it."
      : settings.tab === "check"
        ? "Data Check looks at booked stays in this period and at undated inquiries."
        : settings.counting === "stays"
          ? "Counting booked and archived stays. Cancelled, waitlisted and inquiries are left out."
          : "Counting every record except hosts, including cancelled, waitlisted and inquiries.";

  return (
    <section className="season-reports">
      <div className="season-head">
        <p>
          {settings.tab === "map"
            ? "Where the buildings are in use, and where a group could still fit."
            : settings.tab === "check"
              ? "Records to fix so the reports can be trusted."
              : `${period.label}, as of ${formatDayKey(today)}.`}
        </p>
        <div className="season-actions">
          <button type="button" className="secondary-dashboard-button" onClick={() => setIsBriefOpen(true)} disabled={!hasRecords}>
            <FaPrint /> Meeting brief
          </button>
          <button type="button" className="primary-dashboard-button" onClick={exportView} disabled={!hasRecords}>
            <FaFileCsv /> Export CSV
          </button>
        </div>
      </div>

      <section className="season-context" aria-label="Report settings">
        <label className="season-field">
          <span>Period</span>
          <select value={settings.period} onChange={(event) => update({ period: event.target.value })}>
            {REPORT_PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {settings.period === "custom" && (
          <>
            <label className="season-field">
              <span>From</span>
              <input type="date" value={settings.customStart} onChange={(event) => update({ customStart: event.target.value })} />
            </label>
            <label className="season-field">
              <span>To</span>
              <input type="date" value={settings.customEnd} onChange={(event) => update({ customEnd: event.target.value })} />
            </label>
          </>
        )}
        <label className="season-field">
          <span>Counting</span>
          <select value={settings.counting} onChange={(event) => update({ counting: event.target.value })}>
            <option value="stays">Stays only</option>
            <option value="all">All records</option>
          </select>
        </label>
        <label className="season-field">
          <span>Retreat type</span>
          <select value={retreatType} onChange={(event) => update({ retreatType: event.target.value })}>
            <option value="all">All types</option>
            {retreatTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="season-check">
          <input type="checkbox" checked={settings.compare} onChange={(event) => update({ compare: event.target.checked })} />
          Compare with last year, same dates
        </label>
        <span className="season-context-note">{countingNote}</span>
      </section>

      {settings.period === "custom" && !(settings.customStart && settings.customEnd) && (
        <p className="season-banner" role="status">Choose both dates. Until then this shows {period.label}.</p>
      )}
      {isSavedTypeGone && (
        <p className="season-banner" role="status">
          The saved retreat type “{settings.retreatType}” no longer exists, so all types are shown.{" "}
          <button type="button" className="season-link" onClick={() => update({ retreatType: "all" })}>Dismiss</button>
        </p>
      )}
      {loadError && !hasNeverLoaded && (
        <p className="season-banner" role="status">
          Refresh failed. These figures are from {new Date(loadedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.{" "}
          <button type="button" className="season-link" onClick={onRetry}>Try again</button>
        </p>
      )}

      <div className="season-tabs" role="tablist" aria-label="Report views" data-tutorial-target="reports-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={settings.tab === tab.value}
            onClick={() => update({ tab: tab.value })}
          >
            {tab.label}
            {tab.value === "check" && report.check.total > 0 && <span className="season-badge">{report.check.total}</span>}
          </button>
        ))}
      </div>

      {body}

      {drawer && (
        <ReportRecordsDrawer
          title={drawer.title}
          note={drawer.note}
          records={drawer.ids.map((id) => staysById.get(id)).filter(Boolean)}
          onClose={closeDrawer}
          onOpenBooking={onOpenBooking}
        />
      )}

      {isBriefOpen && (
        <MeetingBrief
          report={report}
          period={period}
          settings={settings}
          stays={stays}
          today={today}
          onClose={() => setIsBriefOpen(false)}
        />
      )}
    </section>
  );
}

export default SeasonReportsView;
