/*
BookingCalendar.jsx
-------------------------------------------------------------------------------
Reusable booking calendar component for the dashboard.

Displays bookings as horizontal multi-day calendar bars.

Each bar's tooltip shows the shared booking label from
src/utils/bookingClassification.js: Booked, Inquiry, Waitlist, Cancelled,
Archived visit or Host. Legacy status values ("Inquiry", "Contract Sent")
on Master and staff bookings no longer make them look unconfirmed;
booking progress is tracked in the guest portal.
-------------------------------------------------------------------------------
*/

import { getBookingDisplayState } from "../utils/bookingClassification";
import { getBookingOpenProps } from "../utils/bookingOpenProps";
import { toDateKey, usePropertyToday } from "../utils/propertyToday";
import { getWeekEventSegments } from "../utils/calendarLanes";
import { formatDateRange } from "../utils/dateUtils";


function getCalendarWeeks(calendarCells) {
  const weeks = [];

  for (let i = 0; i < calendarCells.length; i += 7) {
    weeks.push(calendarCells.slice(i, i + 7));
  }

  return weeks;
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
  onOpenBooking,
  isLarge = false,
  tutorialTarget,
}) {
  const calendarWeeks =
    getCalendarWeeks(calendarCells);

  const today = usePropertyToday();

  return (
    <div
      data-tutorial-target={tutorialTarget}
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
            {week.map((day, dayIndex) => {
              const isToday =
                Boolean(day) &&
                toDateKey(new Date(selectedYear, selectedMonth, day)) === today;

              return (
                <div
                  className={`calendar-cell ${
                    isLarge ? "calendar-cell-large" : ""
                  } ${!day ? "calendar-cell-empty" : ""} ${
                    isToday ? "calendar-cell-today" : ""
                  }`}
                  key={`week-${weekIndex}-day-${dayIndex}`}
                  aria-current={isToday ? "date" : undefined}
                >
                  {day && (
                    <span
                      className="calendar-day-number"
                      title={isToday ? "Today" : undefined}
                    >
                      {day}
                    </span>
                  )}
                </div>
              );
            })}

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

              // Shared label: ordinary bookings read "Booked" (AUDIT-020).
              const displayState =
                getBookingDisplayState(segment.inquiry);

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
                  {...getBookingOpenProps(segment.inquiry, onOpenBooking)}
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

                    <p
                      className={`calendar-display-state is-${displayState.key}`}
                    >
                      {displayState.label}
                    </p>
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
