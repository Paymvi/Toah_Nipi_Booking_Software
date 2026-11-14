/*
  Kitchen views of the staff app. Both read the same staff-safe booking
  records as the rest of the app, through the shared rules in
  src/utils/mealPlan.js (the parsers the office Booking Overview uses):

    By Day      every group's breakfast, lunch and dinner on one date,
                split by service time, with honest totals.
    By Booking  one group's whole stay in the Booking Overview's Meals
                layout: summary, Meal Service Plan, Dietary Alerts, Meal Notes.

  Neither view keeps its own copy of meals or dietary needs.
*/
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Chip, CountStatus, DietaryChips, LoadProblem } from "../components/StaffAppParts";
import { getStayDates } from "../utils/dateUtils";
import { getLegacyBookingNotes } from "../utils/legacyBookingNotes";
import {
  COUNT_STATUS_LABELS,
  MEAL_KEYS,
  MEAL_LABELS,
  formatMealTime,
  getBookingMealDays,
  getDietaryAlerts,
  getGuestCount,
  getKitchenDay,
  getMealServiceTime,
  parseWholeCount,
} from "../utils/mealPlan";
import {
  campDateOf,
  describeActor,
  describeChange,
  formatDay,
  formatStay,
  formatWhen,
  isDateKey,
  KITCHEN_CHANGE_FIELDS,
  lastChangeLine,
  latestChange,
  lodgingText,
  relativeDayLabel,
  shiftDate,
} from "../utils/staffAppFormat";

/* ---------------------------------------------------------
   Shared
--------------------------------------------------------- */

function recentKitchenChanges(booking, todayKey) {
  const since = shiftDate(todayKey, -1);
  return (booking.changes || []).filter(
    (change) => KITCHEN_CHANGE_FIELDS.has(change.field) && campDateOf(new Date(change.at)) >= since
  );
}

// "Changed" marker for a meal time changed since yesterday, with the old time when recorded.
function TimeChange({ booking, mealKey, todayKey }) {
  const change = latestChange(booking, `${mealKey}Time`);
  if (!change || campDateOf(new Date(change.at)) < shiftDate(todayKey, -1)) return null;
  const description = describeChange(change);
  return (
    <span className="sa-time-change">
      <Chip tone="changed">Changed</Chip>
      {description.before && <s aria-label={`was ${description.before}`}>{description.before}</s>}
    </span>
  );
}

function totalLabel(meal) {
  if (meal.totalKind === "incomplete") {
    return { prefix: "at least ", tone: "missing", text: `${meal.unknownCount} count${meal.unknownCount === 1 ? "" : "s"} missing` };
  }
  if (meal.totalKind === "confirmed") return { prefix: "", tone: "confirmed", text: "Confirmed" };
  const hasEstimate = meal.groups.some((group) => group.count.status === "estimate");
  return hasEstimate
    ? { prefix: "~", tone: "estimate", text: "Includes estimates" }
    : { prefix: "", tone: "recorded", text: "Not all confirmed" };
}

function Total({ summary, large = false }) {
  const label = totalLabel(summary);
  return (
    <span className={`sa-total${large ? " sa-total-large" : ""}`}>
      <strong>{label.prefix}{summary.total}</strong>
      <Chip tone={label.tone}>{label.text}</Chip>
    </span>
  );
}

/* ---------------------------------------------------------
   By Day
--------------------------------------------------------- */

function GroupMealLine({ group, showTime, showChanges, canSeeDietary, todayKey }) {
  const { booking, count } = group;
  const details = booking.rentalFormDetails || {};
  // Meal-time changes show on their own meal; other changes once per group, on its first meal of the day.
  const changes = showChanges
    ? recentKitchenChanges(booking, todayKey).filter((change) => !/^(breakfast|lunch|dinner)Time$/.test(change.field))
    : [];
  return (
    <li className="sa-meal-group">
      <div className="sa-meal-group-head">
        <Link to={`/staff/kitchen?view=booking&booking=${encodeURIComponent(booking.id)}`} className="sa-meal-group-name">
          {booking.organizationName}
        </Link>
        {booking.kind === "internal" && <Chip tone="internal">Internal</Chip>}
        <CountStatus count={count} compact />
      </div>
      <p className="sa-meal-group-sub">
        {showTime && (group.time ? `${formatMealTime(group.time)} · ` : "Time not set · ")}
        {group.isFirstMeal && group.isLastMeal
          ? "Only meal"
          : [
              group.isFirstMeal && `First meal${details.arrivalTime ? ` · arrives ${formatMealTime(details.arrivalTime)}` : ""}`,
              group.isLastMeal && `Last meal${details.departureTime ? ` · leaves ${formatMealTime(details.departureTime)}` : ""}`,
            ].filter(Boolean).join(" · ")}
        {count.status === "unclear" && ` Guest count unclear: “${count.text}”`}
      </p>
      {canSeeDietary && <DietaryChips booking={booking} />}
      {changes.length > 0 && (
        <ul className="sa-change-list sa-change-list-compact">
          {changes.slice(0, 3).map((change, index) => {
            const description = describeChange(change);
            return (
              <li key={`${change.field}-${index}`}>
                <Chip tone="changed">Changed</Chip> {description.label}: {description.text}
                <span className="sa-muted"> · {formatWhen(change.at, todayKey)} by {describeActor(change)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function MealCard({ meal, canSeeDietary, todayKey, firstMealOf }) {
  const times = meal.services.map((service) => (service.time ? formatMealTime(service.time) : "time not set"));
  const single = meal.services.length === 1 ? meal.services[0] : null;
  const timeChange = single?.groups.length === 1 ? (
    <TimeChange booking={single.groups[0].booking} mealKey={meal.key} todayKey={todayKey} />
  ) : null;

  return (
    <section className={`sa-card sa-meal-card${meal.groupCount ? "" : " is-empty"}`} aria-labelledby={`sa-meal-${meal.key}`}>
      <header className="sa-meal-head">
        <div>
          <h3 id={`sa-meal-${meal.key}`}>{meal.label}</h3>
          <p>{meal.groupCount ? times.join(" · ") : "No groups"} {timeChange}</p>
        </div>
        {meal.groupCount > 0 && <Total summary={meal} large />}
      </header>
      {meal.services.map((service) => (
        <div className="sa-service" key={service.key}>
          {meal.services.length > 1 && (
            <div className="sa-service-head">
              <strong>
                {service.time ? formatMealTime(service.time) : "Time not set"}
                {service.groups.length === 1 && (
                  <TimeChange booking={service.groups[0].booking} mealKey={meal.key} todayKey={todayKey} />
                )}
              </strong>
              <Total summary={service} />
            </div>
          )}
          <ul className="sa-meal-groups">
            {service.groups.map((group) => (
              <GroupMealLine
                key={group.booking.id}
                group={group}
                showTime={false}
                showChanges={firstMealOf.get(group.booking.id) === meal.key}
                canSeeDietary={canSeeDietary}
                todayKey={todayKey}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function KitchenByDay({ bookings, canSeeDietary, todayKey, date, onDate }) {
  const day = useMemo(() => getKitchenDay(bookings, date), [bookings, date]);
  const firstMealOf = new Map();
  day.meals.forEach((meal) => meal.groups.forEach((group) => {
    if (!firstMealOf.has(group.booking.id)) firstMealOf.set(group.booking.id, meal.key);
  }));
  const chips = Array.from({ length: 7 }, (_, index) => shiftDate(todayKey, index));
  if (!chips.includes(date)) chips.push(date);

  return (
    <>
      <div className="sa-toolbar sa-day-picker">
        <div className="sa-scroll-row" role="group" aria-label="Choose a day">
          {chips.map((dateKey) => (
            <button
              key={dateKey}
              type="button"
              className={`sa-pill${dateKey === date ? " is-selected" : ""}`}
              aria-pressed={dateKey === date}
              onClick={() => onDate(dateKey)}
            >
              {dateKey === todayKey ? "Today" : formatDay(dateKey, { weekday: "short", day: "numeric" })}
            </button>
          ))}
        </div>
        <label className="sa-date-field">
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => isDateKey(event.target.value) && onDate(event.target.value)} />
        </label>
      </div>

      <h2 className="sa-day-title">{relativeDayLabel(date, todayKey)}, {formatDay(date, { month: "long", day: "numeric" })}</h2>

      <div className="sa-meal-grid">
        {day.meals.map((meal) => (
          <MealCard key={meal.key} meal={meal} canSeeDietary={canSeeDietary} todayKey={todayKey} firstMealOf={firstMealOf} />
        ))}
      </div>

      {day.unplanned.length > 0 && (
        <section className="sa-card sa-notice sa-notice-missing" aria-label="Groups with unclear meals">
          <h3>Meals not clear · not in the totals above</h3>
          <ul className="sa-list sa-list-plain">
            {day.unplanned.map(({ booking, plan, count }) => (
              <li key={booking.id} className="sa-detail-row">
                <span>
                  <Link to={`/staff/kitchen?view=booking&booking=${encodeURIComponent(booking.id)}`}>{booking.organizationName}</Link>{" "}
                  <CountStatus count={count} compact />
                </span>
                {plan.status === "missing" ? (
                  <span>No meal plan recorded.</span>
                ) : (
                  <>
                    <span>Meal text needs review:</span>
                    <blockquote>{plan.reviewText}</blockquote>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {day.dayCampers.length > 0 && (
        <section className="sa-card sa-notice" aria-label="Day campers">
          <h3>Day campers · not in the totals above</h3>
          <ul className="sa-list sa-list-plain">
            {day.dayCampers.map(({ booking, count, mealsEach }) => (
              <li key={booking.id}>
                {booking.organizationName}: {count} day campers, {mealsEach || "?"} meal(s) each over the stay. The booking does not say which meals.
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="sa-footnote">
        Counts are each group&apos;s guest count for the whole stay; bookings do not record attendance per meal.
        {canSeeDietary ? " Dietary categories can overlap, so they are never added together." : ""}
      </p>
    </>
  );
}

/* ---------------------------------------------------------
   By Booking
--------------------------------------------------------- */

function mealSummary(booking, plan) {
  const details = booking.rentalFormDetails || {};
  const slots = plan.days.flatMap((day) => MEAL_KEYS.filter((key) => day[key]).map((key) => ({ date: day.date, key })));
  const counts = Object.fromEntries(MEAL_KEYS.map((key) => [key, slots.filter((slot) => slot.key === key).length]));
  const first = slots[0];
  const last = slots[slots.length - 1];
  return {
    total: plan.status === "planned" ? String(slots.length) : String(details.numberOfMeals || booking.mealCount || "").trim(),
    counts: plan.status === "planned" ? counts : null,
    first: first ? { meal: MEAL_LABELS[first.key], date: first.date } : details.firstMeal ? { meal: details.firstMeal, date: "" } : null,
    last: last ? { meal: MEAL_LABELS[last.key], date: last.date } : details.lastMeal ? { meal: details.lastMeal, date: "" } : null,
  };
}

function MealPlanTable({ booking, plan, todayKey }) {
  const stayDates = getStayDates(booking.startDate, booking.endDate || booking.startDate);
  const byDate = new Map(plan.days.map((day) => [day.date, day]));
  const dates = [...new Set([...stayDates, ...plan.days.map((day) => day.date)])].sort();
  return (
    <div className="sa-table-wrap">
      <table className="sa-plan-table">
        <caption className="sa-visually-hidden">Meals served each day; times in the column headers</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {MEAL_KEYS.map((key) => {
              const time = getMealServiceTime(booking, key);
              return (
                <th scope="col" key={key}>
                  <span className="sa-th-meal">{MEAL_LABELS[key]}</span>
                  <span className="sa-th-time">{time ? formatMealTime(time) : "time not set"}</span>
                  <TimeChange booking={booking} mealKey={key} todayKey={todayKey} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {dates.map((dateKey) => {
            const day = byDate.get(dateKey);
            return (
              <tr key={dateKey} className={dateKey === todayKey ? "is-today" : ""}>
                <th scope="row">
                  <span>{formatDay(dateKey, { weekday: "short" })}</span>
                  <span>{formatDay(dateKey, { month: "short", day: "numeric" })}</span>
                  {dateKey === todayKey && <Chip tone="today">Today</Chip>}
                </th>
                {MEAL_KEYS.map((key) => (
                  <td key={key}>
                    {day?.[key] ? (
                      <span className={`sa-tick sa-tick-${key}`} role="img" aria-label={`${MEAL_LABELS[key]} served`}>✓</span>
                    ) : (
                      <span className="sa-dash" role="img" aria-label={`No ${MEAL_LABELS[key].toLowerCase()}`}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DietaryAlertsPanel({ booking }) {
  const alerts = getDietaryAlerts(booking.foodAllergies);
  return (
    <section className="sa-card sa-diet-panel" aria-labelledby="sa-diet-title">
      <h3 id="sa-diet-title">Dietary Alerts</h3>
      <p className="sa-muted">Allergen and dietary information for this group.</p>
      {alerts.hasAny ? (
        <>
          {alerts.items.length > 0 && (
            <table className="sa-diet-table">
              <thead>
                <tr>
                  <th scope="col">Dietary Item</th>
                  <th scope="col">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {alerts.items.map((item) => (
                  <tr key={item.index} className={item.isAllergy ? "is-allergy" : ""}>
                    <td>
                      {item.label}
                      {item.isAllergy && <Chip tone="allergy">Allergy</Chip>}
                    </td>
                    <td>{item.quantityKnown ? item.quantity : <span className="sa-muted">not given</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {alerts.additionalNotes && (
            <div className="sa-diet-note">
              <strong>Additional Dietary Note</strong>
              <p>{alerts.additionalNotes}</p>
            </div>
          )}
          {alerts.items.length > 1 && <p className="sa-muted sa-small">One guest can appear in more than one row.</p>}
        </>
      ) : (
        <p className="sa-muted">No dietary alerts were added for this booking.</p>
      )}
    </section>
  );
}

function BookingMeals({ booking, canSeeDietary, todayKey }) {
  const details = booking.rentalFormDetails || {};
  const plan = getBookingMealDays(booking);
  const summary = mealSummary(booking, plan);
  const count = getGuestCount(booking);
  const legacy = getLegacyBookingNotes(booking).meals;
  const dayCampers = parseWholeCount(details.dayCamperCount);
  const lodging = lodgingText(booking);

  return (
    <div className="sa-kb-detail">
      <section className="sa-card sa-kb-head">
        <h2>
          {booking.organizationName}
          {booking.kind === "internal" && <Chip tone="internal">Internal</Chip>}
        </h2>
        <p className="sa-strong">{formatStay(booking.startDate, booking.endDate)}</p>
        <p className="sa-muted">
          Arrival {details.arrivalTime ? formatMealTime(details.arrivalTime) : "time not set"} · Departure{" "}
          {details.departureTime ? formatMealTime(details.departureTime) : "time not set"}
        </p>
        <p className="sa-kb-facts">
          <span>Guests <CountStatus count={count} compact /></span>
          <span>Lodging <strong>{lodging || "not set"}</strong></span>
        </p>
      </section>

      <dl className="sa-kb-summary">
        <div>
          <dt>Total Meals</dt>
          <dd>
            <strong>{summary.total || "—"}</strong>
            {summary.counts && (
              <span>(Breakfast: {summary.counts.breakfast}, Lunch: {summary.counts.lunch}, Dinner: {summary.counts.dinner})</span>
            )}
          </dd>
        </div>
        <div>
          <dt>First Meal</dt>
          <dd><strong>{summary.first?.meal || "—"}</strong>{summary.first?.date && <span>{formatDay(summary.first.date)}</span>}</dd>
        </div>
        <div>
          <dt>Last Meal</dt>
          <dd><strong>{summary.last?.meal || "—"}</strong>{summary.last?.date && <span>{formatDay(summary.last.date)}</span>}</dd>
        </div>
        <div className="sa-kb-times">
          <dt>Service Times</dt>
          <dd>
            {MEAL_KEYS.map((key) => {
              const time = getMealServiceTime(booking, key);
              return (
                <span key={key}>
                  <strong>{time ? formatMealTime(time) : "—"}</strong> {MEAL_LABELS[key]}
                  <TimeChange booking={booking} mealKey={key} todayKey={todayKey} />
                </span>
              );
            })}
          </dd>
        </div>
      </dl>

      <div className="sa-kb-grid">
        <section className="sa-card sa-kb-plan" aria-labelledby="sa-plan-title">
          <h3 id="sa-plan-title">Meal Service Plan</h3>
          <p className="sa-muted">Detailed meal plan for this retreat.</p>
          {plan.status === "planned" ? (
            <>
              <MealPlanTable booking={booking} plan={plan} todayKey={todayKey} />
              <p className="sa-plan-foot">
                {count.value === null
                  ? "Guest count is not known yet, so meal counts are not known."
                  : <>Every meal is for {count.status === "estimate" ? "about " : ""}<strong>{count.value} guests</strong> <Chip tone={count.status}>{COUNT_STATUS_LABELS[count.status]}</Chip>.</>}{" "}
                The booking stores one guest count for the stay, not one per meal.
                {dayCampers ? ` Plus ${dayCampers} day campers (${details.dayCamperMeals || "?"} meal(s) each; which meals is not recorded).` : ""}
              </p>
            </>
          ) : plan.status === "no-meals" ? (
            <p className="sa-muted">No meals for this booking.</p>
          ) : plan.status === "missing" ? (
            <p className="sa-notice sa-notice-missing">No detailed meal schedule has been added yet. <Chip tone="missing">Missing</Chip></p>
          ) : (
            <div className="sa-notice sa-notice-missing">
              <p><strong>Needs review.</strong> The meal text does not form a clear schedule, so no days are shown:</p>
              <blockquote>{plan.reviewText}</blockquote>
            </div>
          )}
        </section>

        {canSeeDietary && <DietaryAlertsPanel booking={booking} />}
      </div>

      {(details.mealNotes || legacy.length > 0) && (
        <section className="sa-card" aria-labelledby="sa-notes-title">
          <h3 id="sa-notes-title">Meal Notes</h3>
          <p className="sa-muted">Important details for food-service coordination.</p>
          {details.mealNotes && <p className="sa-prewrap">{details.mealNotes}</p>}
          {legacy.map((note) => (
            <div key={note.label}>
              <h4>{note.label}</h4>
              <p className="sa-prewrap">{note.text}</p>
            </div>
          ))}
        </section>
      )}

      <p className="sa-footnote">
        Read from the {booking.organizationName} booking, the same record as By Day and the office Booking Overview.{" "}
        {lastChangeLine(booking, todayKey)}. Kitchen staff can view this but not edit it.
      </p>
    </div>
  );
}

function KitchenByBooking({ bookings, canSeeDietary, todayKey, selectedId, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const upcoming = bookings.filter((booking) => (booking.endDate || booking.startDate) >= todayKey);
  const selected = upcoming.find((booking) => booking.id === selectedId) || bookings.find((booking) => booking.id === selectedId) || upcoming[0];
  const visible = showAll ? upcoming : upcoming.slice(0, 6);
  if (selected && !visible.includes(selected) && upcoming.includes(selected)) visible.push(selected);

  if (!upcoming.length && !selected) return <p className="sa-empty">No upcoming groups in the next few weeks.</p>;

  return (
    <div className="sa-kb">
      <nav className="sa-kb-list" aria-label="Upcoming groups">
        <h2 className="sa-section-label">Upcoming groups</h2>
        <ul>
          {visible.map((booking) => (
            <li key={booking.id}>
              <button
                type="button"
                className={`sa-kb-pick${booking.id === selected?.id ? " is-selected" : ""}`}
                aria-current={booking.id === selected?.id ? "true" : undefined}
                onClick={() => onSelect(booking.id)}
              >
                <strong>{booking.organizationName}</strong>
                <span>{formatDay(booking.startDate)} – {formatDay(booking.endDate || booking.startDate)}</span>
              </button>
            </li>
          ))}
        </ul>
        {upcoming.length > 6 && (
          <button type="button" className="sa-link-button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer" : `Show all ${upcoming.length}`}
          </button>
        )}
      </nav>
      {selected ? (
        <BookingMeals booking={selected} canSeeDietary={canSeeDietary} todayKey={todayKey} />
      ) : (
        <p className="sa-empty">This group is not in the current list.</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Kitchen page
--------------------------------------------------------- */

export default function StaffKitchen({ state, todayKey }) {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "booking" ? "booking" : "day";
  const requestedDate = params.get("date");
  const date = isDateKey(requestedDate) ? requestedDate : todayKey;
  const bookings = state.data?.bookings || [];
  const canSeeDietary = Boolean(state.data?.canSeeDietary);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="sa-tabs" role="tablist" aria-label="Kitchen views">
        {[
          ["day", "By Day"],
          ["booking", "By Booking"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`sa-tab-${key}`}
            aria-selected={view === key}
            aria-controls="sa-kitchen-panel"
            className={`sa-tab${view === key ? " is-selected" : ""}`}
            onClick={() => update({ view: key === "day" ? "" : key })}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="sa-kitchen-panel" role="tabpanel" aria-labelledby={`sa-tab-${view}`}>
        <LoadProblem state={state} />
        {!state.data ? (
          state.error ? null : <p className="sa-empty">Loading…</p>
        ) : view === "day" ? (
          <KitchenByDay bookings={bookings} canSeeDietary={canSeeDietary} todayKey={todayKey} date={date} onDate={(next) => update({ date: next === todayKey ? "" : next })} />
        ) : (
          <KitchenByBooking
            bookings={bookings}
            canSeeDietary={canSeeDietary}
            todayKey={todayKey}
            selectedId={params.get("booking")}
            onSelect={(id) => update({ booking: id })}
          />
        )}
      </div>
    </>
  );
}
