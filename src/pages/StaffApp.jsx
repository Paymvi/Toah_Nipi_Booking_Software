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
  FaHome,
  FaSignOutAlt,
  FaUtensils,
} from "react-icons/fa";

import { useStaffAccess } from "../auth/staffAccess";
import { ChangeList, Chip, CountStatus, DietaryChips, LoadProblem } from "../components/StaffAppParts";
import { fetchStaffAppBooking, fetchStaffAppBookings, signOut } from "../services/staffAppService";
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
  isDateKey,
  relativeDayLabel,
  shiftDate,
  weekStart,
} from "../utils/staffAppFormat";
import StaffKitchen from "./StaffKitchen";

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

function useStaffBookings(range) {
  const rangeKey = `${range.from}:${range.to}`;
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: "", tick: -1, data: null, error: null, loadedAt: 0, failedAt: 0 });

  useEffect(() => {
    let current = true;
    fetchStaffAppBookings(range.from, range.to)
      .then(withDisplayNames)
      .then((data) => {
        if (current) setResult({ key: rangeKey, tick, data, error: null, loadedAt: Date.now(), failedAt: 0 });
      })
      .catch((error) => {
        if (current) setResult((previous) => ({ ...previous, key: rangeKey, tick, error, failedAt: Date.now(), data: previous.key === rangeKey ? previous.data : null }));
      });
    return () => {
      current = false;
    };
  }, [range.from, range.to, rangeKey, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const loadedAt = result.key === rangeKey ? result.loadedAt : 0;

  // Re-check when the phone wakes, the tab returns, the network returns, and every few minutes while open.
  useEffect(() => {
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
  }, [loadedAt, refresh]);

  return {
    data: result.key === rangeKey ? result.data : null,
    error: result.key === rangeKey ? result.error : null,
    loadedAt,
    failedAt: result.key === rangeKey ? result.failedAt : 0,
    isLoading: result.key !== rangeKey || result.tick !== tick,
    refresh,
  };
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
  let text = checked ? `Up to date · checked ${checked}` : "Loading…";
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

function stayLine(booking, dateKey) {
  const details = booking.rentalFormDetails || {};
  if (booking.kind === "internal") return { kind: "stay", text: "Internal use, not a guest group" };
  if (booking.startDate === dateKey) {
    return { kind: "arrive", text: details.arrivalTime ? `Arrives ${formatMealTime(details.arrivalTime)}` : "Arrives · time not set" };
  }
  if ((booking.endDate || booking.startDate) === dateKey) {
    return { kind: "leave", text: details.departureTime ? `Leaves ${formatMealTime(details.departureTime)}` : "Leaves · time not set" };
  }
  return { kind: "stay", text: `Here until ${formatDay(booking.endDate)}` };
}

const STAY_ICONS = { arrive: "↘", leave: "↗", stay: "•" };

function GroupRow({ booking, dateKey, line }) {
  const stay = line || stayLine(booking, dateKey);
  const lodging = lodgingText(booking);
  return (
    <li>
      <Link className="sa-row" to={`/staff/group/${encodeURIComponent(booking.id)}`}>
        <span className={`sa-row-icon sa-row-icon-${stay.kind}`} aria-hidden="true">{STAY_ICONS[stay.kind]}</span>
        <span className="sa-row-main">
          <span className="sa-row-title">
            {booking.organizationName}
            {booking.kind === "internal" && <Chip tone="internal">Internal</Chip>}
          </span>
          <span className="sa-row-sub">
            {stay.text}
            {lodging ? ` · ${lodging}` : ""}
          </span>
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
  if (!lodgingText(booking) && parseWholeCount(details.numberOfNights) !== 0) {
    items.push({ tone: "missing", text: "Lodging not set" });
  }
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

function TodayView({ me, state, todayKey }) {
  const bookings = useMemo(() => state.data?.bookings || [], [state.data]);
  const tomorrowKey = shiftDate(todayKey, 1);
  const yesterdayKey = shiftDate(todayKey, -1);

  const onSite = bookings.filter((booking) => overlaps(booking, todayKey));
  const arrivingTomorrow = bookings.filter((booking) => booking.startDate === tomorrowKey);
  const leavingTomorrow = bookings.filter(
    (booking) => (booking.endDate || booking.startDate) === tomorrowKey && booking.startDate !== tomorrowKey
  );
  const changes = bookings
    .flatMap((booking) => (booking.changes || []).map((change) => ({ ...change, booking })))
    .filter((change) => campDateOf(new Date(change.at)) >= yesterdayKey)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const waiting = bookings
    .filter((booking) => (booking.endDate || booking.startDate) >= todayKey && booking.startDate <= shiftDate(todayKey, 7))
    .map((booking) => ({ booking, items: missingItems(booking, todayKey) }))
    .filter((entry) => entry.items.length);
  const next = canUseKitchen(me) ? nextKitchenService(bookings, todayKey) : null;

  if (!state.data) return state.error ? <LoadProblem state={state} /> : <p className="sa-empty">Loading…</p>;

  return (
    <div className="sa-today-grid">
      <LoadProblem state={state} />
      <section className="sa-section" aria-labelledby="sa-onsite">
        <div className="sa-section-head">
          <h2 id="sa-onsite">On site today</h2>
          <span>{onSite.length ? `${onSite.length} group${onSite.length === 1 ? "" : "s"} · ${summarizeGuests(onSite)}` : ""}</span>
        </div>
        {onSite.length ? (
          <ul className="sa-list">{onSite.map((booking) => <GroupRow key={booking.id} booking={booking} dateKey={todayKey} />)}</ul>
        ) : (
          <p className="sa-empty">No groups on site today.</p>
        )}
      </section>

      <section className="sa-section" aria-labelledby="sa-tomorrow">
        <div className="sa-section-head">
          <h2 id="sa-tomorrow">Tomorrow · {formatDay(tomorrowKey)}</h2>
        </div>
        {arrivingTomorrow.length || leavingTomorrow.length ? (
          <ul className="sa-list">
            {arrivingTomorrow.map((booking) => <GroupRow key={`a-${booking.id}`} booking={booking} dateKey={tomorrowKey} />)}
            {leavingTomorrow.map((booking) => <GroupRow key={`l-${booking.id}`} booking={booking} dateKey={tomorrowKey} />)}
          </ul>
        ) : (
          <p className="sa-empty">No arrivals or departures tomorrow.</p>
        )}
      </section>

      {next && (
        <Link className="sa-mywork" to={`/staff/kitchen?date=${next.dateKey}`}>
          <FaUtensils aria-hidden="true" />
          <span>
            <strong>My work: Kitchen</strong>
            <span>Next: {next.text}</span>
          </span>
          <FaChevronRight aria-hidden="true" />
        </Link>
      )}

      <section className="sa-section" aria-labelledby="sa-changes">
        <div className="sa-section-head">
          <h2 id="sa-changes">Changed since yesterday</h2>
          <span>{changes.length || ""}</span>
        </div>
        {changes.length ? (
          <ul className="sa-list sa-list-plain">
            {changes.slice(0, 12).map((change, index) => {
              const description = describeChange(change);
              return (
                <li key={`${change.booking.id}-${change.field}-${change.at}-${index}`}>
                  <Link className="sa-row sa-row-text" to={`/staff/group/${encodeURIComponent(change.booking.id)}`}>
                    <span className="sa-row-main">
                      <span className="sa-row-title">{change.booking.organizationName}: {description.label.toLowerCase()} {description.text}</span>
                      <span className="sa-row-sub">{formatWhen(change.at, todayKey)} · by {describeActor(change)}</span>
                    </span>
                    <Chip tone="changed">Changed</Chip>
                  </Link>
                </li>
              );
            })}
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
          <ul className="sa-list sa-list-plain">
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
  );
}

/* ---------------------------------------------------------
   Calendar
--------------------------------------------------------- */

function CalendarAgenda({ state, todayKey, week, onWeek }) {
  const bookings = useMemo(() => state.data?.bookings || [], [state.data]);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(week, index));
  const movement = (dateKey) => ({
    arriving: bookings.filter((booking) => booking.startDate === dateKey),
    leaving: bookings.filter((booking) => (booking.endDate || booking.startDate) === dateKey && booking.startDate !== dateKey),
    staying: bookings.filter((booking) => booking.startDate < dateKey && (booking.endDate || booking.startDate) > dateKey),
  });

  return (
    <>
      <div className="sa-week-bar">
        <button type="button" className="sa-icon-button" onClick={() => onWeek(shiftDate(week, -7))} aria-label="Previous week">
          <FaChevronLeft aria-hidden="true" />
        </button>
        <ol className="sa-week-strip">
          {days.map((dateKey) => {
            const { arriving, leaving } = movement(dateKey);
            return (
              <li key={dateKey}>
                <a href={`#day-${dateKey}`} className={`sa-week-day${dateKey === todayKey ? " is-today" : ""}`}>
                  <span>{formatDay(dateKey, { weekday: "short" })}</span>
                  <strong>{formatDay(dateKey, { day: "numeric" })}</strong>
                  <span className="sa-week-mark" aria-label={arriving.length + leaving.length ? `${arriving.length} arriving, ${leaving.length} leaving` : "No movement"}>
                    {arriving.length + leaving.length ? "•" : ""}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
        <button type="button" className="sa-icon-button" onClick={() => onWeek(shiftDate(week, 7))} aria-label="Next week">
          <FaChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="sa-toolbar">
        <button type="button" className="sa-button sa-button-quiet" onClick={() => onWeek(weekStart(todayKey))}>This week</button>
        <label className="sa-date-field">
          <span>Go to date</span>
          <input type="date" value={week} onChange={(event) => isDateKey(event.target.value) && onWeek(weekStart(event.target.value))} />
        </label>
      </div>

      <LoadProblem state={state} />
      {!state.data ? (
        state.error ? null : <p className="sa-empty">Loading…</p>
      ) : (
        <div className="sa-agenda">
        {days.map((dateKey) => {
          const { arriving, leaving, staying } = movement(dateKey);
          return (
            <section key={dateKey} id={`day-${dateKey}`} className="sa-section sa-day" aria-label={formatDay(dateKey)}>
              <div className="sa-section-head">
                <h2>
                  {formatDay(dateKey)}
                  {dateKey === todayKey && <Chip tone="today">Today</Chip>}
                </h2>
              </div>
              {arriving.length || leaving.length ? (
                <ul className="sa-list">
                  {leaving.map((booking) => <GroupRow key={`l-${booking.id}`} booking={booking} dateKey={dateKey} />)}
                  {arriving.map((booking) => <GroupRow key={`a-${booking.id}`} booking={booking} dateKey={dateKey} />)}
                </ul>
              ) : (
                <p className="sa-empty sa-empty-small">No arrivals or departures.</p>
              )}
              {staying.length > 0 && (
                <p className="sa-staying">
                  Also on site:{" "}
                  {staying.map((booking, index) => (
                    <span key={booking.id}>
                      {index > 0 && ", "}
                      <Link to={`/staff/group/${encodeURIComponent(booking.id)}`}>{booking.organizationName}</Link>
                    </span>
                  ))}
                </p>
              )}
            </section>
          );
        })}
        </div>
      )}
    </>
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
          <dd>{lodgingText(booking) || <Chip tone="missing">Not set</Chip>}</dd>
        </div>
      </dl>

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
  const requestedWeek = searchParams.get("week");
  const week = isCalendar && isDateKey(requestedWeek) ? weekStart(requestedWeek) : weekStart(todayKey);
  const requestedDate = searchParams.get("date");
  const kitchenDate = isDateKey(requestedDate) ? requestedDate : todayKey;
  const focus = isCalendar ? week : isKitchen ? kitchenDate : todayKey;
  const range = useMemo(() => getWindow(focus, todayKey), [focus, todayKey]);
  const state = useStaffBookings(range);

  if (!me || me.access === null) return <NoAccess me={me} />;

  const todayEyebrow = formatDay(todayKey, { weekday: "long", month: "short", day: "numeric" });
  const shell = (title, children, eyebrow = todayEyebrow) => (
    <StaffShell me={me} eyebrow={eyebrow} title={title} state={state} online={online}>
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
          <CalendarAgenda state={state} todayKey={todayKey} week={week} onWeek={(next) => setSearchParams({ week: next }, { replace: true })} />,
          formatDay(week, { month: "long", year: "numeric" })
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
      <Route path="*" element={shell("Today at camp", <TodayView me={me} state={state} todayKey={todayKey} />)} />
    </Routes>
  );
}

