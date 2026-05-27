/*
BookingCalendar.jsx
-------------------------------------------------------------------------------
Reusable booking calendar component for the dashboard.

This component displays bookings as horizontal multi-day calendar bars.

This file handles:
- Splitting calendar cells into weeks
- Calculating where each booking bar starts and ends
- Stacking overlapping bookings into lanes
- Rendering booking tooltips
- Supporting both preview and large calendar modes

Important:
This component only displays calendar data.
Dashboard.jsx still owns the selected month, selected year, booking data, and
calendar color logic.
-------------------------------------------------------------------------------
*/

import {
  addDays,
  daysBetween,
  datesOverlap,
  formatDateRange,
  getLocalDate,
  maxDate,
  minDate,
} from "../utils/dateUtils";

// Splits the flat calendar cell array into week rows.
function getCalendarWeeks(calendarCells) {
  const weeks = [];

  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7));
  }

  return weeks;
}

// Calculates each multi-day booking bar for a specific week.
function getWeekEventSegments({
  weekIndex,
  datedInquiries,
  selectedYear,
  selectedMonth,
}) {
  const firstDayOffset = new Date(selectedYear, selectedMonth, 1).getDay();

  const weekStart = new Date(
    selectedYear,
    selectedMonth,
    1 - firstDayOffset + weekIndex * 7
  );

  const weekEnd = addDays(weekStart, 6);

  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);

  const rawSegments = datedInquiries
    .map((inquiry) => {
      const eventStart = getLocalDate(inquiry.startDate);
      const eventEnd = inquiry.endDate
        ? getLocalDate(inquiry.endDate)
        : eventStart;

      if (!eventStart || !eventEnd) {
        return null;
      }

      if (!datesOverlap(eventStart, eventEnd, weekStart, weekEnd)) {
        return null;
      }

      if (!datesOverlap(eventStart, eventEnd, monthStart, monthEnd)) {
        return null;
      }

      const segmentStart = maxDate(eventStart, weekStart, monthStart);
      const segmentEnd = minDate(eventEnd, weekEnd, monthEnd);

      const startColumn = segmentStart.getDay() + 1;
      const spanDays = daysBetween(segmentStart, segmentEnd) + 1;

      return {
        inquiry,
        segmentStart,
        segmentEnd,
        startColumn,
        spanDays,
        endColumn: startColumn + spanDays - 1,
        startsHere: segmentStart.getTime() === eventStart.getTime(),
        endsHere: segmentEnd.getTime() === eventEnd.getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.segmentStart.getTime() !== b.segmentStart.getTime()) {
        return a.segmentStart - b.segmentStart;
      }

      return b.spanDays - a.spanDays;
    });

  const laneEndColumns = [];

  return rawSegments.map((segment) => {
    const existingLaneIndex = laneEndColumns.findIndex(
      (endColumn) => segment.startColumn > endColumn
    );

    const lane =
      existingLaneIndex === -1 ? laneEndColumns.length : existingLaneIndex;

    laneEndColumns[lane] = segment.endColumn;

    return {
      ...segment,
      lane,
    };
  });
}

export default function BookingCalendar({
  calendarCells,
  datedInquiries,
  selectedYear,
  selectedMonth,
  getCalendarEventColor,
  isLarge = false,
}) {
  const calendarWeeks = getCalendarWeeks(calendarCells);

  return (
    <div
      className={`calendar-grid-span-mode ${
        isLarge ? "calendar-grid-large" : "calendar-grid-preview-span"
      }`}
    >
      {["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((day) => (
        <div className="calendar-weekday" key={day}>
          {day}
        </div>
      ))}

      {calendarWeeks.map((week, weekIndex) => {
        const weekSegments = getWeekEventSegments({
          weekIndex,
          datedInquiries,
          selectedYear,
          selectedMonth,
        });

        const eventRowCount =
          weekSegments.length > 0
            ? Math.max(...weekSegments.map((segment) => segment.lane)) + 1
            : 1;

        return (
          <div
            className={`calendar-week-row ${
              isLarge ? "calendar-week-row-large" : "calendar-week-row-preview"
            }`}
            key={`week-${weekIndex}`}
            style={{
              "--calendar-event-row-count": eventRowCount,
            }}
          >
            {week.map((day, dayIndex) => (
              <div
                className={`calendar-cell ${
                  isLarge ? "calendar-cell-large" : ""
                } ${!day ? "calendar-cell-empty" : ""}`}
                key={`week-${weekIndex}-day-${dayIndex}`}
                style={{
                  gridColumn: dayIndex + 1,
                }}
              >
                {day && <span className="calendar-day-number">{day}</span>}
              </div>
            ))}

            {weekSegments.map((segment) => {
              const colorClass = getCalendarEventColor(segment.inquiry.status);

              return (
                <div
                  className={`calendar-span-event ${
                    isLarge
                      ? "calendar-span-event-large"
                      : "calendar-span-event-preview"
                  } ${colorClass} ${
                    segment.startsHere
                      ? "calendar-span-start"
                      : "calendar-span-continues-before"
                  } ${
                    segment.endsHere
                      ? "calendar-span-end"
                      : "calendar-span-continues-after"
                  }`}
                  key={`${segment.inquiry.id}-week-${weekIndex}`}
                  tabIndex={0}
                  aria-label={`${segment.inquiry.organizationName}, ${
                    segment.inquiry.status
                  }, ${formatDateRange(
                    segment.inquiry.startDate,
                    segment.inquiry.endDate
                  )}`}
                  style={{
                    "--event-start-column": segment.startColumn,
                    "--event-span-days": segment.spanDays,
                    "--event-lane": segment.lane,
                  }}
                >
                  <span>{segment.inquiry.organizationName}</span>
                  <i />

                  <div
                    className={`calendar-event-tooltip ${
                      segment.startColumn >= 5
                        ? "calendar-tooltip-align-right"
                        : ""
                    }`}
                  >
                    <div className="calendar-tooltip-header">
                      <strong>{segment.inquiry.organizationName}</strong>
                      <span className={`calendar-tooltip-status ${colorClass}`}>
                        {segment.inquiry.status}
                      </span>
                    </div>

                    <p>
                      {formatDateRange(
                        segment.inquiry.startDate,
                        segment.inquiry.endDate
                      )}
                    </p>

                    <dl>
                      <div>
                        <dt>Type</dt>
                        <dd>
                          {segment.inquiry.retreatType || "No retreat type"}
                        </dd>
                      </div>

                      <div>
                        <dt>Guests</dt>
                        <dd>
                          {segment.inquiry.attendeeCount || "No group size"}
                        </dd>
                      </div>

                      <div>
                        <dt>Contact</dt>
                        <dd>
                          {segment.inquiry.contactName || "No contact name"}
                        </dd>
                      </div>

                      <div>
                        <dt>Room</dt>
                        <dd>{segment.inquiry.roomName || "Unassigned"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}