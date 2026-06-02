import { useMemo, useState } from "react";

import BookingCalendar from "../components/BookingCalendar";

import { monthNames } from "../constants/dashboardConstants";

import { formatDateRange } from "../utils/dateUtils";

const calendarViewOptions = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "year", label: "Year" },
];

const yearDisplayViewOptions = [
  { value: "heatmap", label: "Heatmap" },
  { value: "cards", label: "Cards" },
];

const heatOpacityByCount = {
  0: "0",
  1: "0.22",
  2: "0.36",
  3: "0.5",
  4: "0.64",
  5: "0.78",
};

function getHeatmapOpacity(totalCount) {
  return heatOpacityByCount[Math.min(totalCount, 5)] || "0";
}

function getHeatmapBucketForInquiry(inquiry, getCalendarEventColor) {
  const colorClass = getCalendarEventColor(inquiry.status);

  if (colorClass === "calendar-event-green") return "confirmed";
  if (colorClass === "calendar-event-gold") return "inquiry";
  if (colorClass === "calendar-event-blue") return "contract";

  const statusText = String(inquiry.status || "").toLowerCase();

  if (statusText.includes("confirmed")) return "confirmed";
  if (statusText.includes("contract")) return "contract";
  if (statusText.includes("inquir")) return "inquiry";

  return "other";
}

function getPrimaryHeatmapBucket(bucketCounts) {
  const bucketOrder = ["confirmed", "contract", "inquiry", "other"];

  return bucketOrder.reduce((bestBucket, bucket) => {
    if (!bestBucket) {
      return bucketCounts[bucket] > 0 ? bucket : null;
    }

    return bucketCounts[bucket] > bucketCounts[bestBucket]
      ? bucket
      : bestBucket;
  }, null);
}

function getHeatmapDayTitle(day) {
  const dateLabel = day.date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (!day.totalCount) {
    return `${dateLabel}: No dated bookings`;
  }

  const bookingNames = day.inquiries
    .slice(0, 3)
    .map((inquiry) => inquiry.organizationName || "Unnamed booking")
    .join(", ");

  const moreText =
    day.totalCount > 3 ? `, +${day.totalCount - 3} more` : "";

  return `${dateLabel}: ${day.totalCount} dated booking${
    day.totalCount === 1 ? "" : "s"
  } — ${bookingNames}${moreText}`;
}

const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const rawValue = String(value).trim();

  if (!rawValue) return null;

  const datePart = rawValue.split("T")[0];
  const datePieces = datePart.split("-").map(Number);

  if (
    datePieces.length >= 3 &&
    datePieces.every((piece) => Number.isFinite(piece))
  ) {
    return new Date(datePieces[0], datePieces[1] - 1, datePieces[2]);
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) return null;

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate()
  );
}

function getInquiryDateRange(inquiry) {
  const startDate = parseDateOnly(inquiry.startDate);
  const endDate = parseDateOnly(inquiry.endDate) || startDate;

  if (!startDate) return null;

  if (endDate < startDate) {
    return {
      startDate: endDate,
      endDate: startDate,
    };
  }

  return {
    startDate,
    endDate,
  };
}

function addDays(date, dayCount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + dayCount);
  return nextDate;
}

function getStartOfWeek(date) {
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  startDate.setHours(0, 0, 0, 0);
  return startDate;
}

function getFocusedWeekStart(selectedYear, selectedMonth) {
  const today = new Date();

  const focusedDate =
    today.getFullYear() === selectedYear && today.getMonth() === selectedMonth
      ? today
      : new Date(selectedYear, selectedMonth, 1);

  return getStartOfWeek(focusedDate);
}

function inquiryTouchesDate(inquiry, date) {
  const range = getInquiryDateRange(inquiry);

  if (!range) return false;

  return range.startDate <= date && range.endDate >= date;
}

function inquiryTouchesMonth(inquiry, year, month) {
  const range = getInquiryDateRange(inquiry);

  if (!range) return false;

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  return range.startDate <= monthEnd && range.endDate >= monthStart;
}

function inquiryTouchesYear(inquiry, year) {
  const range = getInquiryDateRange(inquiry);

  if (!range) return false;

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  return range.startDate <= yearEnd && range.endDate >= yearStart;
}

function formatShortDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6);

  if (weekStart.getFullYear() === weekEnd.getFullYear()) {
    return `${formatShortDate(weekStart)} – ${formatShortDate(
      weekEnd
    )}, ${weekEnd.getFullYear()}`;
  }

  return `${formatShortDate(weekStart)}, ${weekStart.getFullYear()} – ${formatShortDate(
    weekEnd
  )}, ${weekEnd.getFullYear()}`;
}

export default function CalendarView({
  calendarCells,
  datedInquiries,
  selectedMonthInquiries,
  selectedMonth,
  selectedYear,
  setSelectedMonth,
  setSelectedYear,
  goToCurrentMonth,
  goToPreviousMonth,
  goToNextMonth,
  getCalendarEventColor,
}) {
  const [calendarView, setCalendarView] = useState("month");
  const [yearDisplayView, setYearDisplayView] = useState("heatmap");
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    getStartOfWeek(new Date())
  );

  const safeDatedInquiries = datedInquiries || [];

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set([2025, 2026, 2027, 2028, 2029, 2030, selectedYear])
    ).sort((firstYear, secondYear) => firstYear - secondYear);
  }, [selectedYear]);

  const selectedWeekDays = useMemo(() => {
    return weekDayLabels.map((dayLabel, index) => {
      const date = addDays(selectedWeekStart, index);
      const today = new Date();

      return {
        date,
        dayLabel,
        isToday:
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate(),
        inquiries: safeDatedInquiries.filter((inquiry) =>
          inquiryTouchesDate(inquiry, date)
        ),
      };
    });
  }, [safeDatedInquiries, selectedWeekStart]);

  const selectedYearMonths = useMemo(() => {
    return monthNames.map((monthName, monthIndex) => ({
      monthName,
      monthIndex,
      inquiries: safeDatedInquiries.filter((inquiry) =>
        inquiryTouchesMonth(inquiry, selectedYear, monthIndex)
      ),
    }));
  }, [safeDatedInquiries, selectedYear]);

  const selectedYearHeatmapMonths = useMemo(() => {
    return monthNames.map((monthName, monthIndex) => {
      const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
      const leadingBlankDays = new Date(selectedYear, monthIndex, 1).getDay();

      const days = Array.from({ length: daysInMonth }, (_, dayOffset) => {
        const date = new Date(selectedYear, monthIndex, dayOffset + 1);

        const inquiries = safeDatedInquiries.filter((inquiry) =>
          inquiryTouchesDate(inquiry, date)
        );

        const bucketCounts = inquiries.reduce(
          (counts, inquiry) => {
            const bucket = getHeatmapBucketForInquiry(
              inquiry,
              getCalendarEventColor
            );

            return {
              ...counts,
              [bucket]: counts[bucket] + 1,
            };
          },
          {
            confirmed: 0,
            contract: 0,
            inquiry: 0,
            other: 0,
          }
        );

        const activeBuckets = Object.keys(bucketCounts).filter(
          (bucket) => bucketCounts[bucket] > 0
        );

        return {
          date,
          dayNumber: dayOffset + 1,
          inquiries,
          totalCount: inquiries.length,
          bucketCounts,
          activeBuckets,
          primaryBucket: getPrimaryHeatmapBucket(bucketCounts),
          heatOpacity: getHeatmapOpacity(inquiries.length),
        };
      });

      return {
        monthName,
        monthIndex,
        leadingBlankDays,
        days,
      };
    });
  }, [getCalendarEventColor, safeDatedInquiries, selectedYear]);

  const selectedWeekInquiries = useMemo(() => {
    const weekEnd = addDays(selectedWeekStart, 6);

    return safeDatedInquiries.filter((inquiry) => {
      const range = getInquiryDateRange(inquiry);

      if (!range) return false;

      return range.startDate <= weekEnd && range.endDate >= selectedWeekStart;
    });
  }, [safeDatedInquiries, selectedWeekStart]);

  const selectedYearInquiries = useMemo(() => {
    return safeDatedInquiries.filter((inquiry) =>
      inquiryTouchesYear(inquiry, selectedYear)
    );
  }, [safeDatedInquiries, selectedYear]);

  const visibleAgendaItems =
    calendarView === "week"
      ? selectedWeekInquiries
      : calendarView === "year"
      ? selectedYearInquiries
      : selectedMonthInquiries;

  const agendaTitle =
    calendarView === "week"
      ? "This Week"
      : calendarView === "year"
      ? `${selectedYear}`
      : "This Month";

  const agendaDescription =
    calendarView === "week"
      ? `${visibleAgendaItems.length} dated booking${
          visibleAgendaItems.length === 1 ? "" : "s"
        } shown for ${formatWeekRange(selectedWeekStart)}.`
      : calendarView === "year"
      ? `${visibleAgendaItems.length} dated booking${
          visibleAgendaItems.length === 1 ? "" : "s"
        } shown for the year.`
      : `${visibleAgendaItems.length} dated booking${
          visibleAgendaItems.length === 1 ? "" : "s"
        } shown.`;

  function handleCalendarViewChange(nextView) {
    setCalendarView(nextView);

    if (nextView === "week") {
      setSelectedWeekStart(getFocusedWeekStart(selectedYear, selectedMonth));
    }

    if (nextView === "year") {
      setYearDisplayView("heatmap");
    }
  }

  function goToTodayForCurrentView() {
    const today = new Date();

    if (calendarView === "month") {
      goToCurrentMonth();
      return;
    }

    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());

    if (calendarView === "week") {
      setSelectedWeekStart(getStartOfWeek(today));
    }
  }

  function goToPreviousWeek() {
    const nextWeekStart = addDays(selectedWeekStart, -7);

    setSelectedWeekStart(nextWeekStart);
    setSelectedMonth(nextWeekStart.getMonth());
    setSelectedYear(nextWeekStart.getFullYear());
  }

  function goToNextWeek() {
    const nextWeekStart = addDays(selectedWeekStart, 7);

    setSelectedWeekStart(nextWeekStart);
    setSelectedMonth(nextWeekStart.getMonth());
    setSelectedYear(nextWeekStart.getFullYear());
  }

  function openMonthFromYearView(monthIndex) {
    setSelectedMonth(monthIndex);
    setCalendarView("month");
  }

  return (
    <section className="calendar-view-page">
      <article className="dashboard-card calendar-view-card">
        <div className="calendar-view-header">
          <div>
            <p className="dashboard-eyebrow">Rentals & Events</p>

            <h2>
              {calendarView === "year"
                ? selectedYear
                : calendarView === "week"
                ? formatWeekRange(selectedWeekStart)
                : `${monthNames[selectedMonth]} ${selectedYear}`}
            </h2>

            <p>
              Full calendar view for confirmed bookings, contract sent bookings,
              and inquiries with selected dates.
            </p>
          </div>

          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={goToTodayForCurrentView}
          >
            {calendarView === "month" ? "This Month" : "Today"}
          </button>
        </div>

        <div className="calendar-view-switcher" aria-label="Calendar views">
          {calendarViewOptions.map((option) => (
            <button
              className={calendarView === option.value ? "active" : ""}
              type="button"
              key={option.value}
              onClick={() => handleCalendarViewChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {calendarView === "month" && (
          <>
            <div className="calendar-controls calendar-controls-large">
              <button type="button" onClick={goToPreviousMonth}>
                «
              </button>

              <select
                value={selectedMonth}
                onChange={(event) =>
                  setSelectedMonth(Number(event.target.value))
                }
              >
                {monthNames.map((month, index) => (
                  <option value={index} key={month}>
                    {month}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(event) =>
                  setSelectedYear(Number(event.target.value))
                }
              >
                {yearOptions.map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button type="button" onClick={goToNextMonth}>
                »
              </button>
            </div>

            <BookingCalendar
              calendarCells={calendarCells}
              datedInquiries={safeDatedInquiries}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              getCalendarEventColor={getCalendarEventColor}
              isLarge
            />
          </>
        )}

        {calendarView === "week" && (
          <div className="calendar-week-view">
            <div className="calendar-week-controls">
              <button type="button" onClick={goToPreviousWeek}>
                ‹ Previous Week
              </button>

              <strong>{formatWeekRange(selectedWeekStart)}</strong>

              <button type="button" onClick={goToNextWeek}>
                Next Week ›
              </button>
            </div>

            <div className="calendar-week-grid">
              {selectedWeekDays.map((day) => (
                <div
                  className={`calendar-week-day ${
                    day.isToday ? "calendar-week-day-today" : ""
                  }`}
                  key={day.date.toISOString()}
                >
                  <div className="calendar-week-day-header">
                    <span>{day.dayLabel}</span>
                    <strong>{day.date.getDate()}</strong>
                  </div>

                  {day.inquiries.length > 0 ? (
                    <div className="calendar-week-events">
                      {day.inquiries.map((inquiry) => (
                        <div
                          className={`calendar-week-event ${getCalendarEventColor(
                            inquiry.status
                          )}`}
                          key={`${inquiry.id}-${day.date.toISOString()}`}
                        >
                          <strong>{inquiry.organizationName}</strong>

                          <span>{inquiry.status}</span>

                          <small>
                            {inquiry.retreatType || "No retreat type"}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="calendar-week-empty">No bookings</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {calendarView === "year" && (
          <div className="calendar-year-view">
            <div className="calendar-year-toolbar">
              <div className="calendar-controls calendar-controls-large calendar-year-controls">
                <button
                  type="button"
                  onClick={() => setSelectedYear(selectedYear - 1)}
                >
                  «
                </button>

                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {yearOptions.map((year) => (
                    <option value={year} key={year}>
                      {year}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setSelectedYear(selectedYear + 1)}
                >
                  »
                </button>
              </div>

              <div
                className="calendar-year-view-toggle"
                aria-label="Year display views"
              >
                {yearDisplayViewOptions.map((option) => (
                  <button
                    className={yearDisplayView === option.value ? "active" : ""}
                    type="button"
                    key={option.value}
                    onClick={() => setYearDisplayView(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {yearDisplayView === "heatmap" && (
              <>
                <div className="calendar-year-heatmap-legend">
                  <span>
                    <i className="calendar-year-heatmap-dot calendar-year-heatmap-dot-confirmed"></i>
                    Confirmed
                  </span>

                  <span>
                    <i className="calendar-year-heatmap-dot calendar-year-heatmap-dot-inquiry"></i>
                    Inquiry
                  </span>

                  <span>
                    <i className="calendar-year-heatmap-dot calendar-year-heatmap-dot-contract"></i>
                    Contract Sent
                  </span>

                  <em>Darker days have more dated bookings.</em>
                </div>

                <div className="calendar-year-heatmap">
                  {selectedYearHeatmapMonths.map((month) => (
                    <section
                      className="calendar-year-heatmap-month"
                      key={month.monthName}
                    >
                      <div className="calendar-year-heatmap-month-header">
                        <strong>{month.monthName}</strong>
                      </div>

                      <div className="calendar-year-heatmap-weekdays">
                        {weekDayLabels.map((dayLabel) => (
                          <span key={dayLabel}>{dayLabel.slice(0, 1)}</span>
                        ))}
                      </div>

                      <div className="calendar-year-heatmap-days">
                        {Array.from({ length: month.leadingBlankDays }).map(
                          (_, blankIndex) => (
                            <span
                              className="calendar-year-heatmap-day-empty"
                              key={`blank-${month.monthName}-${blankIndex}`}
                            ></span>
                          )
                        )}

                        {month.days.map((day) => {
                          const dayClasses = [
                            "calendar-year-heatmap-day",
                            day.totalCount > 0
                              ? "calendar-year-heatmap-day-active"
                              : "",
                            day.primaryBucket
                              ? `calendar-year-heatmap-day-${day.primaryBucket}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <button
                              className={dayClasses}
                              type="button"
                              key={day.date.toISOString()}
                              title={getHeatmapDayTitle(day)}
                              aria-label={getHeatmapDayTitle(day)}
                              style={{
                                "--heat-opacity": day.heatOpacity,
                              }}
                              onClick={() => openMonthFromYearView(month.monthIndex)}
                            >
                              <span>{day.dayNumber}</span>

                              {day.totalCount > 1 && (
                                <strong>{day.totalCount}</strong>
                              )}

                              {day.activeBuckets.length > 1 && (
                                <div className="calendar-year-heatmap-day-dots">
                                  {day.activeBuckets.map((bucket) => (
                                    <i
                                      className={`calendar-year-heatmap-dot calendar-year-heatmap-dot-${bucket}`}
                                      key={bucket}
                                    ></i>
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}

            {yearDisplayView === "cards" && (
              <div className="calendar-year-grid">
                {selectedYearMonths.map((month) => (
                  <button
                    className="calendar-year-card"
                    type="button"
                    key={month.monthName}
                    onClick={() => openMonthFromYearView(month.monthIndex)}
                  >
                    <div>
                      <span>{month.monthName}</span>

                      <strong>{month.inquiries.length}</strong>
                    </div>

                    <small>
                      dated booking
                      {month.inquiries.length === 1 ? "" : "s"}
                    </small>

                    {month.inquiries.length > 0 ? (
                      <div className="calendar-year-preview-list">
                        {month.inquiries.slice(0, 3).map((inquiry) => (
                          <p key={inquiry.id}>
                            <i
                              className={`legend-dot ${getCalendarEventColor(
                                inquiry.status
                              )}`}
                            ></i>
                            {inquiry.organizationName}
                          </p>
                        ))}

                        {month.inquiries.length > 3 && (
                          <em>+{month.inquiries.length - 3} more</em>
                        )}
                      </div>
                    ) : (
                      <p className="calendar-year-empty">No dated bookings</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="calendar-legend">
          <span>
            <i className="legend-dot legend-confirmed"></i>
            Confirmed
          </span>

          <span>
            <i className="legend-dot legend-contract"></i>
            Contract Sent
          </span>

          <span>
            <i className="legend-dot legend-inquiry"></i>
            Inquiry
          </span>
        </div>
      </article>

      <aside className="dashboard-card calendar-view-agenda">
        <div className="dashboard-card-header">
          <div>
            <h2>{agendaTitle}</h2>

            <p>{agendaDescription}</p>
          </div>
        </div>

        {visibleAgendaItems.length > 0 ? (
          <div className="calendar-agenda-list">
            {visibleAgendaItems.map((inquiry) => (
              <div className="calendar-agenda-card" key={inquiry.id}>
                <div>
                  <strong>{inquiry.organizationName}</strong>

                  <span
                    className={`calendar-agenda-status ${getCalendarEventColor(
                      inquiry.status
                    )}`}
                  >
                    {inquiry.status}
                  </span>
                </div>

                <p>{formatDateRange(inquiry.startDate, inquiry.endDate)}</p>

                <small>
                  {inquiry.retreatType || "No retreat type"} ·{" "}
                  {inquiry.attendeeCount || "No group size"} guests
                </small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No dated bookings shown</strong>

            <p>
              Import a master spreadsheet or submit the public form with dates to
              see items on this calendar.
            </p>
          </div>
        )}
      </aside>
    </section>
  );
}