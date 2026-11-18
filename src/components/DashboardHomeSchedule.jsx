import { FaSignInAlt, FaChevronRight } from "react-icons/fa";
import { getBookingDisplayState } from "../utils/bookingClassification";
import {
  getDashboardHomeBookingDate,
  getDashboardHomeGuestCount,
  getDashboardHomeBuildingTags,
  isDashboardHomeSameDay,
} from "../utils/dashboardHome";

// Weekday in secondary text, such as "Fri, Nov 6".
export function DashboardHomeDate({ date }) {
  return (
    <span className="home-dashboard-date">
      <span className="home-dashboard-weekday">
        {date.toLocaleDateString("en-US", { weekday: "short" })},
      </span>{" "}
      {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
    </span>
  );
}

export function DashboardHomeScheduleRow({ booking, isArrival, onOpen }) {
  const startDate = getDashboardHomeBookingDate(booking.startDate);
  const endDate = getDashboardHomeBookingDate(booking.endDate);
  const guestCount = getDashboardHomeGuestCount(booking);
  const displayState = getBookingDisplayState(booking);
  const buildingTags = getDashboardHomeBuildingTags(booking);

  return (
    <button
      className="home-dashboard-schedule-row"
      type="button"
      onClick={() => onOpen(booking)}
    >
      <span className="home-dashboard-schedule-row-main">
        <strong>
          {isArrival && (
            <FaSignInAlt
              className="home-dashboard-arrival-icon"
              role="img"
              title="Arriving this day"
            />
          )}
          {booking.organizationName || "Unnamed Organization"}
        </strong>

        <small>
          <DashboardHomeDate date={startDate} />
          {endDate && !isDashboardHomeSameDay(startDate, endDate) && (
            <>
              {" – "}
              <DashboardHomeDate date={endDate} />
            </>
          )}
          {" · "}
          {guestCount > 0
            ? `${guestCount} guest${guestCount === 1 ? "" : "s"}`
            : "Guest count not recorded"}
          {displayState.key !== "booked"
            ? ` · ${displayState.label}`
            : ""}
        </small>
      </span>

      <span
        className="home-dashboard-building-pills"
        aria-label={`Lodging: ${buildingTags
          .map((building) => building.label)
          .join(", ")}`}
      >
        {buildingTags.map((building) => (
          <span
            className={`home-dashboard-building-pill home-dashboard-building-pill-${building.key}`}
            key={building.key}
          >
            {building.label}
          </span>
        ))}
      </span>

      <FaChevronRight className="home-dashboard-row-arrow" />
    </button>
  );
}
