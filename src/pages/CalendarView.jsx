import BookingCalendar from "../components/BookingCalendar";

import { monthNames } from "../constants/dashboardConstants";

import { formatDateRange } from "../utils/dateUtils";

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
  return (
    <section className="calendar-view-page">
      <article className="dashboard-card calendar-view-card">
        <div className="calendar-view-header">
          <div>
            <p className="dashboard-eyebrow">Rentals & Events</p>

            <h2>
              {monthNames[selectedMonth]} {selectedYear}
            </h2>

            <p>
              Full calendar view for confirmed bookings, contract sent bookings,
              and inquiries with selected dates.
            </p>
          </div>

          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={goToCurrentMonth}
          >
            This Month
          </button>
        </div>

        <div className="calendar-controls calendar-controls-large">
          <button type="button" onClick={goToPreviousMonth}>
            «
          </button>

          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(Number(event.target.value))}
          >
            {monthNames.map((month, index) => (
              <option value={index} key={month}>
                {month}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {[2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
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
          datedInquiries={datedInquiries}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          getCalendarEventColor={getCalendarEventColor}
          isLarge
        />

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
            <h2>This Month</h2>

            <p>
              {selectedMonthInquiries.length} dated booking
              {selectedMonthInquiries.length === 1 ? "" : "s"} shown.
            </p>
          </div>
        </div>

        {selectedMonthInquiries.length > 0 ? (
          <div className="calendar-agenda-list">
            {selectedMonthInquiries.map((inquiry) => (
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
            <strong>No dated bookings this month</strong>

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