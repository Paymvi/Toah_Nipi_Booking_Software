/*
BookingCalendar.jsx
-------------------------------------------------------------------------------
Reusable booking calendar component for the dashboard.

Displays bookings as horizontal multi-day calendar bars.

Calendar colors:
- Green = Confirmed
- Gold = Unconfirmed

The underlying booking.status can still contain:
- Inquiry
- Contract Sent
- Confirmed
- etc.

This component translates workflow status into calendar meaning.
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


function getCalendarWeeks(calendarCells) {
  const weeks = [];

  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7));
  }

  return weeks;
}


function getWeekEventSegments({
  weekIndex,
  datedInquiries,
  selectedYear,
  selectedMonth,
}) {
  const firstDayOffset = new Date(
    selectedYear,
    selectedMonth,
    1
  ).getDay();

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

      const segmentStart = maxDate(
        eventStart,
        weekStart,
        monthStart
      );

      const segmentEnd = minDate(
        eventEnd,
        weekEnd,
        monthEnd
      );

      const startColumn = segmentStart.getDay() + 1;

      const spanDays =
        daysBetween(segmentStart, segmentEnd) + 1;

      return {
        inquiry,
        segmentStart,
        segmentEnd,
        startColumn,
        spanDays,
        endColumn: startColumn + spanDays - 1,
        startsHere:
          segmentStart.getTime() === eventStart.getTime(),
        endsHere:
          segmentEnd.getTime() === eventEnd.getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.segmentStart - b.segmentStart !== 0) {
        return a.segmentStart - b.segmentStart;
      }

      return b.spanDays - a.spanDays;
    });

  const laneEndColumns = [];

  return rawSegments.map((segment) => {
    const existingLaneIndex =
      laneEndColumns.findIndex(
        (endColumn) =>
          segment.startColumn > endColumn
      );

    const lane =
      existingLaneIndex === -1
        ? laneEndColumns.length
        : existingLaneIndex;

    laneEndColumns[lane] = segment.endColumn;

    return {
      ...segment,
      lane,
    };
  });
}

function getCalendarStatusInfo(inquiry) {
  const status = String(inquiry.status || "")
    .trim()
    .toLowerCase();

  const sourceText = inquiry.statusSource
    ? `${inquiry.statusSource.field} was "${inquiry.statusSource.value}"`
    : `Current booking status is "${inquiry.status}"`;

  if (
    status.includes("confirmed") ||
    status.includes("booked")
  ) {
    return {
      label: "Confirmed",
      color: "green",
      explanation: `Confirmed because ${sourceText}.`,
    };
  }

  return {
    label: "Unconfirmed",
    color: "gold",
    explanation: `Unconfirmed because ${sourceText}.`,
  };
}


export default function BookingCalendar({
  calendarCells,
  datedInquiries,
  selectedYear,
  selectedMonth,
  getCalendarEventColor,
  getEventColor,
  getEventLabel,
  getRoomText,
  isLarge = false,
}) {
  const calendarWeeks =
    getCalendarWeeks(calendarCells);

  return (
    <div
      className={`calendar-grid-span-mode ${
        isLarge
          ? "calendar-grid-large"
          : "calendar-grid-preview-span"
      }`}
    >
      {["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((day) => (
        <div className="calendar-weekday" key={day}>
          {day}
        </div>
      ))}

      {calendarWeeks.map((week, weekIndex) => {
        const weekSegments =
          getWeekEventSegments({
            weekIndex,
            datedInquiries,
            selectedYear,
            selectedMonth,
          });

        const eventRowCount =
          weekSegments.length > 0
            ? Math.max(
                ...weekSegments.map(
                  (segment) => segment.lane
                )
              ) + 1
            : 1;

        return (
          <div
            className={`calendar-week-row ${
              isLarge
                ? "calendar-week-row-large"
                : "calendar-week-row-preview"
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
              >
                {day && (
                  <span className="calendar-day-number">
                    {day}
                  </span>
                )}
              </div>
            ))}

            {weekSegments.map((segment) => {
              const colorClass =
                typeof getEventColor === "function"
                  ? getEventColor(segment.inquiry)
                  : getCalendarEventColor(
                      segment.inquiry.status
                    );

              const eventLabel =
                typeof getEventLabel === "function"
                  ? getEventLabel(segment.inquiry)
                  : segment.inquiry.organizationName;

              const roomText =
                typeof getRoomText === "function"
                  ? getRoomText(segment.inquiry)
                  : segment.inquiry.roomName || "Unassigned";

              const statusInfo =
                getCalendarStatusInfo(segment.inquiry);

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
                  style={{
                    "--event-start-column":
                      segment.startColumn,
                    "--event-span-days":
                      segment.spanDays,
                    "--event-lane":
                      segment.lane,
                  }}
                >
                  <span>{eventLabel}</span>
                  <i />

                  <div className="calendar-event-tooltip">
                    <strong>
                      {segment.inquiry.organizationName}
                    </strong>

                    <p>
                      {formatDateRange(
                        segment.inquiry.startDate,
                        segment.inquiry.endDate
                      )}
                    </p>

                    <p>{roomText}</p>
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
