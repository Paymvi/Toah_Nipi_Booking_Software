/*
  Staff app (version one): Today at camp, Calendar, Group details and the
  Kitchen views, for every signed-in staff account.

  Data comes only from the staff_app_* database functions, which decide who
  may see what (src/services/staffAppService.js). Nothing is stored in the
  browser: data lives in React state and is dropped on sign-out or when the
  account changes (StaffAuthGate remounts per account).

  Docs: docs/staff-app/IMPLEMENTATION_NOTES.md
*/
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaClipboardList,
  FaHome,
  FaSignOutAlt,
  FaUtensils,
} from "react-icons/fa";

import { useStaffAccess } from "../auth/staffAccess";
import { getWeekEventSegments } from "../utils/calendarLanes";
import { Buildings, ChangeList, Chip, CountStatus, DietaryChips, LoadProblem } from "../components/StaffAppParts";
import { fetchStaffAppBooking, fetchStaffAppBookings, fetchStaffOrders, signOut } from "../services/staffAppService";
import { usePropertyToday } from "../utils/propertyToday";
import {
  MEAL_KEYS,
  MEAL_LABELS,
  formatMealTime,
  getBookingMealDays,
  getDietaryAlerts,
  getGuestCount,
  getMealServiceTime,
  parseWholeCount,
} from "../utils/mealPlan";
import {
  campClockNow,
  canUseKitchen,
  lastChangeLine,
  lodgingText,
  summarizeGuests,
  campDateOf,
  describeActor,
  describeChange,
  formatClock,
  formatDay,
  formatStay,
  formatWhen,
  getStaffBuildings,
  isDateKey,
  relativeDayLabel,
  shiftDate,
  weekStart,
} from "../utils/staffAppFormat";
import StaffKitchen from "./StaffKitchen";
import StaffOrders from "./StaffOrders";

const REFRESH_AFTER_MS = 60_000;
const POLL_MS = 5 * 60_000;
const STALE_MS = 15 * 60_000;

/* ---------------------------------------------------------
   Shared pieces
--------------------------------------------------------- */

function subscribeOnline(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/* ---------------------------------------------------------
   Data loading and freshness
--------------------------------------------------------- */

// Bookings for an 10-week window; the window moves in 8-week steps so short moves reuse it.
function getWindow(focusDate, todayKey) {
  const base = weekStart(todayKey);
  const days = Math.round((Date.parse(weekStart(focusDate)) - Date.parse(base)) / 86400000);
  const block = Math.floor(days / 56);
  const from = shiftDate(base, block * 56 - 7);
  return { from, to: shiftDate(from, 70) };
}

// Internal entries drop the office's "Host:" naming prefix; the Internal tag says it instead.
function withDisplayNames(data) {
  const clean = (booking) =>
    booking?.kind === "internal"
      ? { ...booking, organizationName: booking.organizationName.replace(/^\s*host(?:ing)?\s*[:\-–—]\s*/i, "") || booking.organizationName }
      : booking;
  if (!data) return data;
  return { ...data, ...(data.bookings && { bookings: data.bookings.map(clean) }), ...(data.booking && { booking: clean(data.booking) }) };
}

// Loads `load()` for `key` and keeps it fresh. An empty key loads nothing (screen not open).
function useStaffData(key, load) {
  const rangeKey = key;
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: "", tick: -1, data: null, error: null, loadedAt: 0, failedAt: 0 });

  useEffect(() => {
    if (!rangeKey) return undefined;
    let current = true;
    load()
      .then((data) => {
        if (current) setResult({ key: rangeKey, tick, data, error: null, loadedAt: Date.now(), failedAt: 0 });
      })
      .catch((error) => {
        if (current) setResult((previous) => ({ ...previous, key: rangeKey, tick, error, failedAt: Date.now(), data: previous.key === rangeKey ? previous.data : null }));
      });
    return () => {
      current = false;
    };
  }, [load, rangeKey, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const loadedAt = result.key === rangeKey ? result.loadedAt : 0;

  // Re-check when the phone wakes, the tab returns, the network returns, and every few minutes while open.
  useEffect(() => {
    if (!rangeKey) return undefined;
    const refreshIfOld = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt > REFRESH_AFTER_MS) refresh();
    };
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    document.addEventListener("visibilitychange", refreshIfOld);
    window.addEventListener("focus", refreshIfOld);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfOld);
      window.removeEventListener("focus", refreshIfOld);
      window.removeEventListener("online", refresh);
    };
  }, [loadedAt, rangeKey, refresh]);

  return {
    data: result.key === rangeKey ? result.data : null,
    error: result.key === rangeKey ? result.error : null,
    loadedAt,
    failedAt: result.key === rangeKey ? result.failedAt : 0,
    isLoading: Boolean(rangeKey) && (result.key !== rangeKey || result.tick !== tick),
    refresh,
  };
}

function useStaffBookings(range) {
  const load = useCallback(() => fetchStaffAppBookings(range.from, range.to).then(withDisplayNames), [range.from, range.to]);
  return useStaffData(`${range.from}:${range.to}`, load);
}

function Freshness({ state, online }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { loadedAt, error, isLoading, refresh } = state;
  const checked = loadedAt ? formatClock(loadedAt) : "";
  let tone = "ok";
  let text = checked ? `Up to date · ${checked}` : "Loading…";
  if (!online) {
    tone = "warn";
    text = checked ? `Offline · showing ${checked}; may be out of date` : "Offline · nothing loaded yet";
  } else if (error && checked) {
    tone = "warn";
    text = `Could not refresh · showing ${checked}; may be out of date`;
  } else if (error) {
    tone = "error";
    text = "Could not load";
  } else if (loadedAt && now - loadedAt > STALE_MS) {
    tone = "warn";
    text = `Last checked ${checked}; may be out of date`;
  } else if (isLoading && checked) {
    text = `Checking… (last checked ${checked})`;
  }

  return (
    <p className={`sa-freshness sa-freshness-${tone}`} role="status">
      <span className="sa-dot" aria-hidden="true" />
      <span>{text}</span>
      {(tone !== "ok" || !isLoading) && online && (
        <button type="button" className="sa-link-button" onClick={refresh} disabled={isLoading}>
          {isLoading ? "Checking…" : "Refresh"}
        </button>
      )}
    </p>
  );
}

/* ---------------------------------------------------------
   Shell
--------------------------------------------------------- */

function StaffShell({ me, eyebrow, title, state, online, children }) {
  const kitchen = canUseKitchen(me);
  const nav = [
    { to: "/staff", label: "Today", icon: FaHome, end: true },
    { to: "/staff/calendar", label: "Calendar", icon: FaCalendarAlt },
    ...(kitchen ? [{ to: "/staff/kitchen", label: "Kitchen", icon: FaUtensils }] : []),
    { to: "/staff/orders", label: "Orders", icon: FaClipboardList },
  ];

  return (
    <div className="sa-app">
      <header className="sa-header">
        <div className="sa-header-inner">
          <div className="sa-heading">
            {eyebrow && <p className="sa-eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            {state && <Freshness state={state} online={online} />}
          </div>
          <details className="sa-account">
            <summary>
              <span className="sa-account-name">{me?.fullName || "Account"}</span>
              <span className="sa-muted">{me?.access === "limited" ? (kitchen ? "Kitchen" : "Staff") : "Office"}</span>
            </summary>
            <div className="sa-account-menu">
              {me?.access !== "limited" && (
                <Link className="sa-button sa-button-quiet" to="/dashboard">
                  <FaArrowLeft aria-hidden="true" /> Office app
                </Link>
              )}
              <button type="button" className="sa-button sa-button-quiet" onClick={signOut}>
                <FaSignOutAlt aria-hidden="true" /> Sign out
              </button>
            </div>
          </details>
        </div>
        <nav className="sa-nav" aria-label="Staff app">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sa-nav-link${isActive ? " is-active" : ""}`}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="sa-main">{children}</main>
    </div>
  );
}

/* ---------------------------------------------------------
   Group rows
--------------------------------------------------------- */

// "Nov 14 – 16", "Nov 30 – Dec 2", or one day; day headings already give the weekday.
function stayDates(booking) {
  const end = booking.endDate || booking.startDate;
  const short = { month: "short", day: "numeric" };
  if (end === booking.startDate) return formatDay(booking.startDate, short);
  const sameMonth = end.slice(0, 7) === booking.startDate.slice(0, 7);
  return `${formatDay(booking.startDate, short)} – ${sameMonth ? formatDay(end, { day: "numeric" }) : formatDay(end, short)}`;
}

function stayLine(booking, dateKey) {
  const details = booking.rentalFormDetails || {};
  if (booking.kind === "internal") return { kind: "stay", text: "Internal use" };
  if (booking.startDate === dateKey) {
    return { kind: "arrive", text: details.arrivalTime ? `Arrives ${formatMealTime(details.arrivalTime)}` : "Arrives · time not set" };
  }
  if ((booking.endDate || booking.startDate) === dateKey) {
    return { kind: "leave", text: details.departureTime ? `Leaves ${formatMealTime(details.departureTime)}` : "Leaves · time not set" };
  }
  return { kind: "stay", text: "" };
}

const STAY_ICONS = { arrive: "↘", leave: "↗", stay: "•" };
const STAY_LABELS = { arrive: "Arriving", leave: "Leaving", stay: "On site" };

function GroupRow({ booking, dateKey }) {
  const stay = stayLine(booking, dateKey);
  return (
    <li>
      <Link className="sa-row" to={`/staff/group/${encodeURIComponent(booking.id)}`}>
        <span className={`sa-row-icon sa-row-icon-${stay.kind}`} role="img" aria-label={STAY_LABELS[stay.kind]}>{STAY_ICONS[stay.kind]}</span>
        <span className="sa-row-main">
          <span className="sa-row-title">
            {booking.organizationName}
            {booking.kind === "internal" && <Chip tone="internal">Internal</Chip>}
          </span>
          <span className="sa-row-sub">
            {stay.text && <strong>{stay.text}</strong>}
            {stay.text && " · "}
            {stayDates(booking)}
          </span>
          <Buildings booking={booking} />
        </span>
        <CountStatus count={getGuestCount(booking)} compact />
      </Link>
    </li>
  );
}

/* ---------------------------------------------------------
   Today at camp
--------------------------------------------------------- */

function overlaps(booking, dateKey) {
  return booking.startDate <= dateKey && (booking.endDate || booking.startDate) >= dateKey;
}

function missingItems(booking, todayKey) {
  const items = [];
  const count = getGuestCount(booking);
  const plan = getBookingMealDays(booking);
  const details = booking.rentalFormDetails || {};
  if (count.status === "missing") items.push({ tone: "missing", text: "Guest count missing" });
  if (count.status === "unclear") items.push({ tone: "missing", text: `Guest count unclear: “${count.text}”` });
  if (count.status === "estimate" && booking.startDate <= shiftDate(todayKey, 3)) {
    items.push({ tone: "estimate", text: "Final guest count not in yet" });
  }
  if (plan.status === "needs-review") items.push({ tone: "missing", text: "Meal plan needs review" });
  if (plan.status === "missing") items.push({ tone: "missing", text: "No meal plan recorded" });
  if (booking.kind === "internal") return items;
  if (booking.startDate >= todayKey && !details.arrivalTime) items.push({ tone: "missing", text: "Arrival time not set" });
  if (getStaffBuildings(booking).status === "unassigned") items.push({ tone: "missing", text: "Housing not assigned" });
  return items;
}

function nextKitchenService(bookings, todayKey) {
  const clock = campClockNow();
  for (const dateKey of [todayKey, shiftDate(todayKey, 1)]) {
    for (const meal of MEAL_KEYS) {
      const groups = bookings.filter((booking) => {
        const day = getBookingMealDays(booking).days.find((entry) => entry.date === dateKey);
        return day?.[meal];
      });
      if (!groups.length) continue;
      const times = [...new Set(groups.map((booking) => getMealServiceTime(booking, meal)).filter(Boolean))];
      const latest = times.map((time) => formatMealTime(time));
      // Today: skip meals whose every known time has passed.
      if (dateKey === todayKey && times.length && times.every((time) => /^\d{2}:\d{2}$/.test(time) && time < clock)) continue;
      const counts = groups.map(getGuestCount);
      const known = counts.filter((count) => count.value !== null).reduce((sum, count) => sum + count.value, 0);
      const unknown = counts.some((count) => count.value === null);
      return {
        dateKey,
        text: `${relativeDayLabel(dateKey, todayKey)} ${MEAL_LABELS[meal]}${latest.length ? ` ${latest.join(" & ")}` : ""} · ${unknown ? "at least " : counts.some((count) => count.status === "estimate") ? "~" : ""}${known} people`,
      };
    }
  }
  return null;
}

// Who arrives and leaves on a day, and how many groups are on site.
function dayMovement(bookings, dateKey) {
  return {
    arriving: bookings.filter((booking) => booking.startDate === dateKey),
    leaving: bookings.filter((booking) => (booking.endDate || booking.startDate) === dateKey && booking.startDate !== dateKey),
    staying: bookings.filter((booking) => booking.startDate < dateKey && (booking.endDate || booking.startDate) > dateKey),
  };
}

function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

function TodayView({ me, state, todayKey }) {
  const bookings = useMemo(() => state.data?.bookings || [], [state.data]);
  const yesterdayKey = shiftDate(todayKey, -1);

  const onSite = bookings.filter((booking) => overlaps(booking, todayKey));
  const week = Array.from({ length: 7 }, (_, index) => shiftDate(todayKey, index + 1))
    .map((dateKey) => ({ dateKey, ...dayMovement(bookings, dateKey) }))
    .filter((day) => day.arriving.length || day.leaving.length);
  // One row per group, newest change first, so a busy group's name is not repeated.
  const changes = bookings
    .flatMap((booking) => (booking.changes || []).map((change) => ({ ...change, booking })))
    .filter((change) => campDateOf(new Date(change.at)) >= yesterdayKey)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const changesByGroup = [];
  changes.slice(0, 12).forEach((change) => {
    const entry = changesByGroup.find((item) => item.booking.id === change.booking.id);
    if (entry) entry.changes.push(change);
    else changesByGroup.push({ booking: change.booking, changes: [change] });
  });
  const waiting = bookings
    .filter((booking) => (booking.endDate || booking.startDate) >= todayKey && booking.startDate <= shiftDate(todayKey, 7))
    .map((booking) => ({ booking, items: missingItems(booking, todayKey) }))
    .filter((entry) => entry.items.length);
  const next = canUseKitchen(me) ? nextKitchenService(bookings, todayKey) : null;

  if (!state.data) return state.error ? <LoadProblem state={state} /> : <p className="sa-empty">Loading…</p>;

  return (
    <>
      <LoadProblem state={state} />
      {next && (
        <Link className="sa-mywork" to={`/staff/kitchen?date=${next.dateKey}`}>
          <FaUtensils aria-hidden="true" />
          <span>
            <strong>Kitchen next:</strong> {next.text}
          </span>
          <FaChevronRight aria-hidden="true" />
        </Link>
      )}
      <div className="sa-today-grid">
        <div className="sa-column">
          <section className="sa-section" aria-labelledby="sa-onsite">
            <div className="sa-section-head">
              <h2 id="sa-onsite">On site today</h2>
              <span>{onSite.length ? `${plural(onSite.length, "group")} · ${summarizeGuests(onSite)}` : ""}</span>
            </div>
            {onSite.length ? (
              <ul className="sa-list">{onSite.map((booking) => <GroupRow key={booking.id} booking={booking} dateKey={todayKey} />)}</ul>
            ) : (
              <p className="sa-empty">No groups on site today.</p>
            )}
          </section>

          <section className="sa-section" aria-labelledby="sa-week">
            <div className="sa-section-head">
              <h2 id="sa-week">Next 7 days</h2>
              <Link to="/staff/calendar">Calendar</Link>
            </div>
            {week.length ? (
              <div className="sa-list sa-days">
                {week.map((day) => (
                  <section key={day.dateKey} className="sa-day-block" aria-label={formatDay(day.dateKey)}>
                    <h3 className="sa-day-head">
                      <span>{relativeDayLabel(day.dateKey, todayKey) === "Tomorrow" ? `Tomorrow · ${formatDay(day.dateKey)}` : formatDay(day.dateKey)}</span>
                      <small>{daySummary(day)}</small>
                    </h3>
                    <ul>
                      {day.leaving.map((booking) => <GroupRow key={`l-${booking.id}`} booking={booking} dateKey={day.dateKey} />)}
                      {day.arriving.map((booking) => <GroupRow key={`a-${booking.id}`} booking={booking} dateKey={day.dateKey} />)}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <p className="sa-empty">No arrivals or departures in the next 7 days.</p>
            )}
          </section>
        </div>

        <div className="sa-column">
          <section className="sa-section" aria-labelledby="sa-changes">
            <div className="sa-section-head">
              <h2 id="sa-changes">Changed since yesterday</h2>
              <span>{changes.length || ""}</span>
            </div>
            {changesByGroup.length ? (
              <ul className="sa-list">
                {changesByGroup.map(({ booking, changes: groupChanges }) => (
                  <li key={booking.id}>
                    <Link className="sa-row sa-row-text" to={`/staff/group/${encodeURIComponent(booking.id)}`}>
                      <span className="sa-row-main">
                        <span className="sa-row-title">{booking.organizationName}</span>
                        {groupChanges.map((change, index) => {
                          const description = describeChange(change);
                          return (
                            <span key={`${change.field}-${change.at}-${index}`} className="sa-row-sub">
                              <strong>{description.label}</strong> {description.text}
                              <span className="sa-muted"> · {formatWhen(change.at, todayKey)} · {describeActor(change)}</span>
                            </span>
                          );
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-empty">
                No recorded changes since yesterday.
                {me?.historySince ? ` Change history started ${formatWhen(me.historySince, todayKey)}.` : " Change history starts once the office saves a booking after this update."}
              </p>
            )}
          </section>

          <section className="sa-section" aria-labelledby="sa-waiting">
            <div className="sa-section-head">
              <h2 id="sa-waiting">Still waiting on</h2>
              <span>next 7 days</span>
            </div>
            {waiting.length ? (
              <ul className="sa-list">
                {waiting.map(({ booking, items }) => (
                  <li key={booking.id}>
                    <Link className="sa-row sa-row-text" to={`/staff/group/${encodeURIComponent(booking.id)}`}>
                      <span className="sa-row-main">
                        <span className="sa-row-title">{booking.organizationName}</span>
                        <span className="sa-row-sub">{relativeDayLabel(booking.startDate, todayKey)} – {formatDay(booking.endDate || booking.startDate)}</span>
                        <span className="sa-chip-row">
                          {items.map((item) => <Chip key={item.text} tone={item.tone}>{item.text}</Chip>)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-empty">Nothing missing for the next 7 days.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------
   Calendar
--------------------------------------------------------- */

const CAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CAL_LANES = 3; // bars shown per week before a day says "+N more"

// First day of the month `delta` months from dateKey's month.
function monthStart(dateKey, delta = 0) {
  const date = new Date(Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

// The month on screen: the whole month, since bars stop at the month edge as in the office calendar.
function monthRange(dateKey) {
  return { from: monthStart(dateKey), to: shiftDate(monthStart(dateKey, 1), -1) };
}

// Same cells as the office calendar: blanks before the 1st and after the last day.
function monthCells(dateKey) {
  const first = monthStart(dateKey);
  const days = Number(monthRange(dateKey).to.slice(8));
  const cells = Array(new Date(`${first}T00:00:00Z`).getUTCDay()).fill(null);
  for (let day = 1; day <= days; day += 1) cells.push(`${first.slice(0, 8)}${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function daySummary(day) {
  return [
    day.arriving.length && `${day.arriving.length} arriving`,
    day.leaving.length && `${day.leaving.length} leaving`,
    `${plural(day.arriving.length + day.staying.length, "group")} on site`,
  ].filter(Boolean).join(" · ");
}

function CalendarMonth({ state, todayKey, selected, onSelect }) {
  const bookings = useMemo(() => state.data?.bookings || [], [state.data]);
  const cells = monthCells(selected);
  const year = Number(selected.slice(0, 4));
  const month = Number(selected.slice(5, 7)) - 1;
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  // Moving month selects the 1st, or today when today is in that month.
  const goMonth = (delta) => {
    const first = monthStart(selected, delta);
    onSelect(first.slice(0, 7) === todayKey.slice(0, 7) ? todayKey : first);
  };
  const day = dayMovement(bookings, selected);
  const dayGroups = [...day.leaving, ...day.arriving, ...day.staying];

  return (
    <div className="sa-cal">
      <div className="sa-cal-bar">
        <button type="button" className="sa-icon-button" onClick={() => goMonth(-1)} aria-label="Previous month">
          <FaChevronLeft aria-hidden="true" />
        </button>
        <h2 aria-live="polite">{formatDay(selected, { month: "long", year: "numeric" })}</h2>
        <button type="button" className="sa-icon-button" onClick={() => goMonth(1)} aria-label="Next month">
          <FaChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="sa-button sa-button-quiet sa-cal-today" onClick={() => onSelect(todayKey)} disabled={selected === todayKey}>
          Today
        </button>
      </div>

      <LoadProblem state={state} />
      {!state.data ? (
        state.error ? null : <p className="sa-empty">Loading…</p>
      ) : (
        <div className="sa-cal-layout">
          <div className="sa-cal-month">
            <div className="sa-cal-weekdays" aria-hidden="true">
              {CAL_WEEKDAYS.map((label) => <span key={label}>{label}</span>)}
            </div>
            {weeks.map((week, weekIndex) => {
              const segments = getWeekEventSegments({ weekIndex, datedInquiries: bookings, selectedYear: year, selectedMonth: month });
              const hidden = (column) => segments.filter((segment) => segment.lane >= CAL_LANES && segment.startColumn <= column && segment.endColumn >= column).length;
              return (
                <div className="sa-cal-week" key={weekIndex}>
                  {week.map((dateKey, index) => {
                    if (!dateKey) return <span key={index} className="sa-cal-cell is-blank" style={{ gridColumn: index + 1 }} />;
                    const groups = bookings.filter((booking) => overlaps(booking, dateKey)).length;
                    const more = hidden(index + 1);
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        className={`sa-cal-cell${dateKey === todayKey ? " is-today" : ""}${dateKey === selected ? " is-selected" : ""}${groups ? " has-groups" : ""}`}
                        style={{ gridColumn: index + 1 }}
                        onClick={() => onSelect(dateKey)}
                        aria-pressed={dateKey === selected}
                        aria-current={dateKey === todayKey ? "date" : undefined}
                        aria-label={`${formatDay(dateKey, { weekday: "long", month: "long", day: "numeric" })}${dateKey === todayKey ? ", today" : ""}: ${groups ? plural(groups, "group") : "no groups"}`}
                      >
                        <span className="sa-cal-num">{Number(dateKey.slice(8))}</span>
                        {more > 0 && (
                          <span className="sa-cal-more">
                            +{more}<span className="sa-cal-more-word"> more</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {segments.filter((segment) => segment.lane < CAL_LANES).map((segment) => (
                    <Link
                      key={segment.inquiry.id}
                      to={`/staff/group/${encodeURIComponent(segment.inquiry.id)}`}
                      className={`sa-cal-bar-event${segment.inquiry.kind === "internal" ? " is-internal" : ""}${segment.startsHere ? " starts" : ""}${segment.endsHere ? " ends" : ""}`}
                      style={{ gridColumn: `${segment.startColumn} / span ${segment.spanDays}`, gridRow: segment.lane + 2 }}
                      title={`${segment.inquiry.organizationName} · ${stayDates(segment.inquiry)}`}
                    >
                      {segment.inquiry.organizationName}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>

          <section className="sa-list sa-day-block sa-cal-day" aria-label={`Groups on ${formatDay(selected)}`}>
            <h3 className="sa-day-head">
              <span>
                {formatDay(selected, { weekday: "long", month: "short", day: "numeric" })}
                {selected === todayKey && <Chip tone="today">Today</Chip>}
              </span>
              {dayGroups.length > 0 && <small>{daySummary(day)}</small>}
            </h3>
            {dayGroups.length ? (
              <ul>{dayGroups.map((booking) => <GroupRow key={booking.id} booking={booking} dateKey={selected} />)}</ul>
            ) : (
              <p className="sa-cal-none">No groups booked.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Group details
--------------------------------------------------------- */

function useStaffBooking(bookingId, fallback) {
  const [result, setResult] = useState({ id: "", data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let current = true;
    fetchStaffAppBooking(bookingId)
      .then(withDisplayNames)
      .then((data) => current && setResult({ id: bookingId, data, error: null }))
      .catch((error) => current && setResult({ id: bookingId, data: null, error }));
    return () => {
      current = false;
    };
  }, [bookingId, tick]);
  const loaded = result.id === bookingId;
  return {
    booking: loaded && result.data ? result.data.booking : fallback || null,
    canSeeDietary: loaded && result.data ? result.data.canSeeDietary : null,
    notFound: loaded && result.data && !result.data.booking,
    error: loaded ? result.error : null,
    isLoading: !loaded,
    refresh: () => setTick((value) => value + 1),
  };
}

function MealDaysList({ booking }) {
  const plan = getBookingMealDays(booking);
  if (plan.status === "no-meals") return <p className="sa-muted">No meals for this booking.</p>;
  if (plan.status === "missing") return <p className="sa-notice sa-notice-missing">No meal plan recorded. <Chip tone="missing">Missing</Chip></p>;
  if (plan.status === "needs-review") {
    return (
      <div className="sa-notice sa-notice-missing">
        <p><strong>Meal plan needs review.</strong> The booking has meal text that does not form a clear schedule:</p>
        <blockquote>{plan.reviewText}</blockquote>
      </div>
    );
  }
  return (
    <ul className="sa-list sa-list-plain sa-meal-days">
      {plan.days.map((day) => (
        <li key={day.date}>
          <strong>{formatDay(day.date)}</strong>
          <span>
            {MEAL_KEYS.filter((key) => day[key])
              .map((key) => {
                const time = getMealServiceTime(booking, key);
                return `${MEAL_LABELS[key]}${time ? ` ${formatMealTime(time)}` : " (time not set)"}`;
              })
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActivitiesAndSetup({ booking }) {
  const details = booking.rentalFormDetails || {};
  const activities = (details.activities || []).filter((row) => row.activity || row.date || row.time);
  const facilities = (booking.facilities || []).filter((row) => row.task || row.date || row.time);
  const legacyText = !activities.length && typeof booking.activities === "string" ? booking.activities.trim() : "";
  const notes = [details.activityNotes, details.facilityNotes].filter(Boolean);
  if (!activities.length && !facilities.length && !legacyText && !notes.length) {
    return <p className="sa-muted">No activities or setup requests recorded.</p>;
  }
  const when = (row) => [row.date ? formatDay(row.date) : "", row.time ? formatMealTime(row.time) : ""].filter(Boolean).join(" ") || "Time not set";
  return (
    <ul className="sa-list sa-list-plain">
      {activities.map((row, index) => (
        <li key={`a-${index}`} className="sa-detail-row">
          <strong>{row.activity || "Activity"}</strong>
          <span className="sa-muted">Activity · {when(row)}</span>
        </li>
      ))}
      {facilities.map((row, index) => (
        <li key={`f-${index}`} className="sa-detail-row">
          <strong>{row.task || "Setup task"}</strong>
          <span className="sa-muted">Setup · {when(row)}{row.assignedTo ? ` · ${row.assignedTo}` : ""}</span>
          {row.notes && <span>{row.notes}</span>}
        </li>
      ))}
      {legacyText && <li className="sa-detail-row"><span className="sa-prewrap">{legacyText}</span></li>}
      {notes.map((note, index) => <li key={`n-${index}`} className="sa-detail-row"><span className="sa-prewrap">{note}</span></li>)}
    </ul>
  );
}

function GroupView({ me, state, todayKey }) {
  const { bookingId = "" } = useParams();
  const navigate = useNavigate();
  const fromList = state.data?.bookings?.find((booking) => booking.id === bookingId);
  const single = useStaffBooking(bookingId, fromList);
  const booking = single.booking;
  const canSeeDietary = single.canSeeDietary ?? state.data?.canSeeDietary ?? me?.canSeeDietary;

  const back = (
    <button type="button" className="sa-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/staff/calendar"))}>
      <FaArrowLeft aria-hidden="true" /> Back
    </button>
  );

  if (!booking) {
    return (
      <>
        {back}
        {single.error ? (
          <section className="sa-card sa-problem" role="alert"><strong>{single.error.message}</strong></section>
        ) : single.notFound ? (
          <p className="sa-empty">This group is not available in the staff app. It may have been cancelled or moved.</p>
        ) : (
          <p className="sa-empty">Loading…</p>
        )}
      </>
    );
  }

  const details = booking.rentalFormDetails || {};
  const count = getGuestCount(booking);
  const dayCampers = parseWholeCount(details.dayCamperCount);

  return (
    <>
      {back}
      <section className="sa-group-head">
        <h2>
          {booking.organizationName}
          {booking.kind === "internal" && <Chip tone="internal">Internal</Chip>}
        </h2>
        <p className="sa-strong">{formatStay(booking.startDate, booking.endDate)}</p>
        <p className="sa-muted">{lastChangeLine(booking, todayKey)}</p>
      </section>

      <dl className="sa-facts">
        <div>
          <dt>Arrives</dt>
          <dd>{formatDay(booking.startDate)} · {details.arrivalTime ? formatMealTime(details.arrivalTime) : <Chip tone="missing">Time not set</Chip>}</dd>
        </div>
        <div>
          <dt>Departs</dt>
          <dd>{formatDay(booking.endDate || booking.startDate)} · {details.departureTime ? formatMealTime(details.departureTime) : <Chip tone="missing">Time not set</Chip>}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>
            <CountStatus count={count} />
            {count.status === "unclear" && <span className="sa-muted"> “{count.text}”</span>}
            {count.status === "recorded" && <span className="sa-muted sa-block">Actual count entered; not confirmed through the guest portal.</span>}
            {count.status === "confirmed" && count.estimate !== null && count.estimate !== count.value && (
              <span className="sa-muted sa-block">Estimate was {count.estimate}.</span>
            )}
            {dayCampers ? <span className="sa-block">+ {dayCampers} day campers</span> : null}
          </dd>
        </div>
        <div>
          <dt>Lodging</dt>
          <dd>
            <Buildings booking={booking} />
            {getStaffBuildings(booking).status === "assigned" && lodgingText(booking) && (
              <span className="sa-muted sa-small sa-block">{lodgingText(booking)}</span>
            )}
            {getStaffBuildings(booking).status === "none" && <span className="sa-muted">None recorded</span>}
          </dd>
        </div>
      </dl>

      <div className="sa-group-grid">
      <section className="sa-section" aria-labelledby="sa-group-meals">
        <div className="sa-section-head">
          <h2 id="sa-group-meals">Meals</h2>
          {canUseKitchen(me) && <Link to={`/staff/kitchen?view=booking&booking=${encodeURIComponent(booking.id)}`}>Kitchen view</Link>}
        </div>
        <div className="sa-card">
          <MealDaysList booking={booking} />
          {dayCampers ? (
            <p className="sa-muted">{dayCampers} day campers, {details.dayCamperMeals || "?"} meal(s) each; the booking does not say which meals.</p>
          ) : null}
          {details.mealNotes && <p className="sa-prewrap"><strong>Meal notes:</strong> {details.mealNotes}</p>}
        </div>
      </section>

      {canSeeDietary && (
        <section className="sa-section" aria-labelledby="sa-group-diet">
          <div className="sa-section-head"><h2 id="sa-group-diet">Dietary needs</h2></div>
          <div className="sa-card">
            {getDietaryAlerts(booking.foodAllergies).hasAny ? <DietaryChips booking={booking} /> : <p className="sa-muted">No dietary needs recorded.</p>}
          </div>
        </section>
      )}

      <section className="sa-section" aria-labelledby="sa-group-setup">
        <div className="sa-section-head"><h2 id="sa-group-setup">Activities &amp; setup</h2></div>
        <div className="sa-card"><ActivitiesAndSetup booking={booking} /></div>
      </section>

      <section className="sa-section" aria-labelledby="sa-group-changes">
        <div className="sa-section-head"><h2 id="sa-group-changes">Recent changes</h2></div>
        <div className="sa-card">
          <ChangeList changes={booking.changes || []} todayKey={todayKey} emptyText="No changes recorded in the last 60 days." />
        </div>
      </section>
      </div>

      <p className="sa-footnote">Contacts, payments, rates, contracts and private notes stay in the office app.</p>
    </>
  );
}

/* ---------------------------------------------------------
   App
--------------------------------------------------------- */

function NoAccess({ me }) {
  return (
    <div className="sa-app">
      <main className="sa-main">
        <section className="sa-card sa-problem" role="alert">
          <h1>No staff app access</h1>
          <p>
            {me?.error
              ? `Could not check this account's access: ${me.error}`
              : "This account is signed in but has no active staff access. Ask an administrator to give your account access."}
          </p>
          <button type="button" className="sa-button" onClick={signOut}>
            <FaSignOutAlt aria-hidden="true" /> Sign out
          </button>
        </section>
      </main>
    </div>
  );
}

export default function StaffApp() {
  const me = useStaffAccess();
  const todayKey = usePropertyToday();
  const online = useOnline();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isCalendar = location.pathname.startsWith("/staff/calendar");
  const isKitchen = location.pathname.startsWith("/staff/kitchen");
  const requestedDate = searchParams.get("date");
  const pickedDate = isDateKey(requestedDate) ? requestedDate : todayKey;
  // Calendar loads its month; picking another day in the same month reuses it.
  const calendarMonth = isCalendar ? monthStart(pickedDate) : "";
  const focus = isKitchen ? pickedDate : todayKey;
  const range = useMemo(() => (calendarMonth ? monthRange(calendarMonth) : getWindow(focus, todayKey)), [calendarMonth, focus, todayKey]);
  const state = useStaffBookings(range);
  const isOrders = location.pathname.startsWith("/staff/orders");
  const ordersHistory = searchParams.get("view") === "history";
  const loadOrders = useCallback(() => fetchStaffOrders(ordersHistory), [ordersHistory]);
  const ordersState = useStaffData(isOrders ? `orders:${ordersHistory}` : "", loadOrders);

  if (!me || me.access === null) return <NoAccess me={me} />;

  const todayEyebrow = formatDay(todayKey, { weekday: "long", month: "short", day: "numeric" });
  const shell = (title, children, eyebrow = todayEyebrow, shellState = state) => (
    <StaffShell me={me} eyebrow={eyebrow} title={title} state={shellState} online={online}>
      {children}
    </StaffShell>
  );

  return (
    <Routes>
      <Route index element={shell("Today at camp", <TodayView me={me} state={state} todayKey={todayKey} />)} />
      <Route
        path="calendar"
        element={shell(
          "Calendar",
          <CalendarMonth state={state} todayKey={todayKey} selected={pickedDate} onSelect={(next) => setSearchParams({ date: next }, { replace: true })} />
        )}
      />
      <Route path="group/:bookingId" element={shell("Group", <GroupView me={me} state={state} todayKey={todayKey} />)} />
      <Route
        path="kitchen"
        element={shell(
          "Kitchen",
          canUseKitchen(me) ? (
            <StaffKitchen state={state} todayKey={todayKey} />
          ) : (
            <p className="sa-empty">The kitchen view is for kitchen staff. Ask an administrator if you need it.</p>
          )
        )}
      />
      {["orders", "orders/new", "orders/:requestId/edit"].map((path) => (
        <Route key={path} path={path} element={shell("Orders", <StaffOrders me={me} state={ordersState} todayKey={todayKey} />, "Supplies & equipment", ordersState)} />
      ))}
      <Route path="*" element={shell("Today at camp", <TodayView me={me} state={state} todayKey={todayKey} />)} />
    </Routes>
  );
}

