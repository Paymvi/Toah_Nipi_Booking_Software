import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { FaConciergeBell, FaDownload, FaPlus } from "react-icons/fa";

import CalendarView from "./CalendarView";
import LodgingCalendarView from "./LodgingCalendarView";
import {
  getBookingDisplayState,
  isClearlyCancelled,
  isPossibleHostRecord,
} from "../utils/bookingClassification";
import { getBookingLodgingDisplayText, getLodgingNights } from "../utils/lodgingUtils";
import { formatDateRange } from "../utils/dateUtils";

/*
  Hosting: internal use of the property, kept apart from guest bookings.
  The two calendars are the regular calendar components fed hosting
  records only; the lodging availability check still counts guest
  bookings (hiddenOccupancy), so a room a group holds never looks free.
*/

const MODE_STORAGE_KEY = "toahNipiHostingMode";
const MODES = [
  { value: "calendar", label: "Calendar" },
  { value: "lodging", label: "Lodging calendar" },
  { value: "sheet", label: "Spreadsheet" },
];

function readSavedMode() {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    return MODES.some((mode) => mode.value === saved) ? saved : "calendar";
  } catch {
    return "calendar";
  }
}

function touchesMonth(record, year, month) {
  const start = String(record.startDate || "").slice(0, 10);
  if (!start) return false;
  const end = String(record.endDate || "").slice(0, 10) || start;
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  return start.slice(0, 7) <= monthKey && end.slice(0, 7) >= monthKey;
}

const byStartDate = (a, b) => String(a.startDate).localeCompare(String(b.startDate));

export default function HostingView({
  hostingRecords = [],
  guestBookings = [],
  calendarProps,
  onOpenRecord,
  onOpenRecordById,
  onAddHosting,
}) {
  const [mode, setMode] = useState(readSavedMode);

  const chooseMode = (value) => {
    setMode(value);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, value);
    } catch {
      // Storage unavailable (private window); the choice still applies now.
    }
  };

  const datedHosting = useMemo(
    () => hostingRecords.filter((record) => record.startDate).sort(byStartDate),
    [hostingRecords]
  );
  const datedGuestBookings = useMemo(
    () => guestBookings.filter((record) => record.startDate),
    [guestBookings]
  );
  const { selectedYear, selectedMonth } = calendarProps;
  const monthHosting = useMemo(
    () => datedHosting.filter((record) => touchesMonth(record, selectedYear, selectedMonth)),
    [datedHosting, selectedYear, selectedMonth]
  );
  const toReview = useMemo(() => guestBookings.filter(isPossibleHostRecord), [guestBookings]);
  const undatedCount = hostingRecords.length - datedHosting.length;

  return (
    <section className="hosting-page">
      <header className="dashboard-card hosting-header">
        <div className="dashboard-heading-with-icon">
          <span className="section-icon">
            <FaConciergeBell />
          </span>
          <div>
            <p className="dashboard-eyebrow">Internal</p>
            <h2>Hosting</h2>
            <p className="hosting-subtitle">
              Internal use of the property. Not guest bookings: no guest portal,
              guest emails or booking reports. Lodging it holds still blocks those rooms.
            </p>
          </div>
        </div>

        <div className="hosting-header-actions">
          <span className="hosting-count">
            {hostingRecords.length} entr{hostingRecords.length === 1 ? "y" : "ies"}
            {undatedCount > 0 && ` · ${undatedCount} without dates`}
          </span>
          <button className="primary-dashboard-button" type="button" onClick={onAddHosting}>
            <FaPlus aria-hidden="true" />
            Add hosting
          </button>
        </div>

        <div className="calendar-view-switcher hosting-mode-switcher" aria-label="Hosting views">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={mode === option.value ? "active" : ""}
              aria-pressed={mode === option.value}
              onClick={() => chooseMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {toReview.length > 0 && (
          <details className="hosting-review">
            <summary>
              {toReview.length === 1
                ? "1 booking mentions hosting but is not classified as hosting"
                : `${toReview.length} bookings mention hosting but are not classified as hosting`}
            </summary>
            <p>
              Only a name starting &quot;Host:&quot; / &quot;Hosting:&quot; or a retreat type of
              &quot;Host&quot; / &quot;Hosting&quot; counts. These were left as bookings; open one
              and use Convert to Hosting if it is really internal.
            </p>
            <ul>
              {toReview.map((record) => (
                <li key={record.id}>
                  <button className="table-link" type="button" onClick={() => onOpenRecord(record)}>
                    {record.organizationName || "Unnamed Organization"}
                  </button>
                  <span>
                    {record.retreatType ? `${record.retreatType} · ` : ""}
                    {formatDateRange(record.startDate, record.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </header>

      {mode === "calendar" && (
        <CalendarView
          {...calendarProps}
          datedInquiries={datedHosting}
          selectedMonthInquiries={monthHosting}
          onOpenBooking={onOpenRecordById}
          eyebrow="Hosting"
        />
      )}

      {mode === "lodging" && (
        <LodgingCalendarView
          {...calendarProps}
          datedInquiries={datedHosting}
          selectedMonthInquiries={monthHosting}
          hiddenOccupancy={datedGuestBookings}
          onOpenBooking={onOpenRecordById}
          eyebrow="Hosting · Lodging"
        />
      )}

      {mode === "sheet" && (
        <HostingSheet records={hostingRecords} onOpenRecord={onOpenRecord} />
      )}
    </section>
  );
}

/* ---------------------------------------------------------
   Spreadsheet
--------------------------------------------------------- */

const COLUMNS = [
  { key: "name", label: "Name", value: (record) => record.organizationName || "" },
  { key: "dates", label: "Dates", value: (record) => String(record.startDate || "") },
  { key: "nights", label: "Nights", value: (record) => getLodgingNights(record).length },
  { key: "contact", label: "Contact", value: (record) => record.contactName || record.email || "" },
  { key: "lodging", label: "Lodging", value: (record) => getBookingLodgingDisplayText(record) },
  { key: "guests", label: "Guests", value: (record) => Number.parseFloat(record.attendeeCount) || 0 },
  { key: "notes", label: "Notes", value: (record) => record.notes || "" },
];

function overlapsRange(record, from, to) {
  const start = String(record.startDate || "").slice(0, 10);
  const end = String(record.endDate || "").slice(0, 10) || start;
  return (!to || start <= to) && (!from || end >= from);
}

function HostingSheet({ records, onOpenRecord }) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeUndated, setIncludeUndated] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [sort, setSort] = useState({ key: "dates", direction: 1 });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const column = COLUMNS.find((item) => item.key === sort.key) || COLUMNS[1];
    return records
      .filter((record) => includeCancelled || !isClearlyCancelled(record))
      .filter((record) => (record.startDate ? overlapsRange(record, from, to) : includeUndated))
      .filter(
        (record) =>
          !needle ||
          [record.organizationName, record.contactName, record.email, record.phone, record.notes, getBookingLodgingDisplayText(record)]
            .join(" ")
            .toLowerCase()
            .includes(needle)
      )
      .sort((a, b) => {
        // Entries without dates always sit at the end of a date sort.
        if (sort.key === "dates" && Boolean(a.startDate) !== Boolean(b.startDate)) {
          return a.startDate ? -1 : 1;
        }
        const left = column.value(a);
        const right = column.value(b);
        const order = typeof left === "number" ? left - right : String(left).localeCompare(String(right));
        return order * sort.direction;
      });
  }, [records, search, from, to, includeUndated, includeCancelled, sort]);

  const toggleSort = (key) =>
    setSort((current) => ({ key, direction: current.key === key ? -current.direction : 1 }));

  const exportRows = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Hosting");
    sheet.columns = [
      { header: "Record type", key: "type", width: 12 },
      { header: "Name", key: "name", width: 32 },
      { header: "Start", key: "start", width: 12 },
      { header: "End", key: "end", width: 12 },
      { header: "Contact", key: "contact", width: 22 },
      { header: "Email", key: "email", width: 28 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Guests", key: "guests", width: 10 },
      { header: "Lodging", key: "lodging", width: 36 },
      { header: "Status", key: "status", width: 12 },
      { header: "Notes", key: "notes", width: 44 },
    ];
    rows.forEach((record) =>
      sheet.addRow({
        type: "Hosting",
        name: record.organizationName,
        start: record.startDate || "",
        end: record.endDate || "",
        contact: record.contactName || "",
        email: record.email || "",
        phone: record.phone || "",
        guests: record.attendeeCount || "",
        lodging: getBookingLodgingDisplayText(record),
        status: getBookingDisplayState(record).label,
        notes: record.notes || "",
      })
    );
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "toah-nipi-hosting.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="dashboard-card hosting-sheet">
      <div className="hosting-sheet-controls">
        <label>
          <span>Search</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, contact, notes, lodging" />
        </label>
        <label>
          <span>From</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label className="hosting-check">
          <input type="checkbox" checked={includeUndated} onChange={(event) => setIncludeUndated(event.target.checked)} />
          Entries without dates
        </label>
        <label className="hosting-check">
          <input type="checkbox" checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} />
          Cancelled
        </label>
        <button className="secondary-dashboard-button" type="button" onClick={exportRows} disabled={rows.length === 0}>
          <FaDownload aria-hidden="true" />
          Export {rows.length}
        </button>
      </div>

      <div className="spreadsheet-table-wrap hosting-table-wrap">
        <table className="spreadsheet-table hosting-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} aria-sort={sort.key === column.key ? (sort.direction > 0 ? "ascending" : "descending") : "none"}>
                  <button type="button" className="hosting-sort" onClick={() => toggleSort(column.key)}>
                    {column.label}
                    {sort.key === column.key ? (sort.direction > 0 ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id}>
                <td>
                  <button className="table-link" type="button" onClick={() => onOpenRecord(record)}>
                    {record.organizationName || "Unnamed Organization"}
                  </button>
                  {isClearlyCancelled(record) && <span className="hosting-tag">Cancelled</span>}
                </td>
                <td>{record.startDate ? formatDateRange(record.startDate, record.endDate) : <span className="hosting-tag">No dates</span>}</td>
                <td>{record.startDate ? getLodgingNights(record).length : ""}</td>
                <td>{record.contactName || record.email || ""}</td>
                <td>{getBookingLodgingDisplayText(record)}</td>
                <td>{record.attendeeCount || ""}</td>
                <td className="hosting-notes">{record.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="hosting-empty">
            {records.length === 0 ? "No hosting entries yet. Use Add hosting to create one." : "No hosting entries match these filters."}
          </p>
        )}
      </div>
    </article>
  );
}
