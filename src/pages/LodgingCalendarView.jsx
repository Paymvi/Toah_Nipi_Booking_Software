import { useMemo, useState } from "react";

import BookingCalendar from "../components/BookingCalendar";

import { monthNames } from "../constants/dashboardConstants";

import { formatDateRange } from "../utils/dateUtils";


const LODGING_BUILDINGS = [
  {
    id: "bethel",
    label: "Bethel",
    aliases: ["bethel"],
    image: "/lodges/Bethel.webp",
    colorClass: "lodging-bethel",
    eventClass: "calendar-lodging-bethel",
  },

  {
    id: "hebron",
    label: "Hebron",
    aliases: [
      "hebron",
      "hebron 3rd",
      "hebron third",
      "hebron bunks",
      "main lodge",
    ],
    image: "/lodges/May-2025-Hebron.jpg",
    colorClass: "lodging-hebron",
    eventClass: "calendar-lodging-hebron",
  },

  {
    id: "dothan",
    label: "Dothan",
    aliases: ["dothan"],
    image: "/lodges/Dothan.webp",
    colorClass: "lodging-dothan",
    eventClass: "calendar-lodging-dothan",
  },

  {
    id: "ajalon",
    label: "Ajalon",
    aliases: ["ajalon"],
    image: "/lodges/Ajalon.webp",
    colorClass: "lodging-ajalon",
    eventClass: "calendar-lodging-ajalon",
  },

  {
    id: "capernaum",
    label: "Capernaum",
    aliases: ["capernaum"],
    image: "/lodges/Capernaum.webp",
    colorClass: "lodging-capernaum",
    eventClass: "calendar-lodging-capernaum",
  },

  {
    id: "guest-house",
    label: "Guest House",
    aliases: ["guest house", "guesthouse"],
    image: "/lodges/Guest-House.webp",
    colorClass: "lodging-guest-house",
    eventClass: "calendar-lodging-guest-house",
  },
];


function normalizeLodgingText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


/*
Determines whether a lodging segment actually represents usage.

Examples:

"Bethel: 20"       -> true
"Bethel: 0"        -> false
"Hebron"           -> true
"Hebron: Unknown"  -> true
"Guest House"      -> true

This is important because some imported bookings know that a
building was used even when the exact person count is unknown.
*/
function lodgingSegmentHasAssignment(segment) {
  const text = normalizeLodgingText(segment);

  if (!text) {
    return false;
  }

  if (
    /:\s*(?:0|0\.0+|none|no|n\/a|unassigned|not assigned)\s*$/.test(text)
  ) {
    return false;
  }

  const numericMatch = text.match(/:\s*(\d+(?:\.\d+)?)\s*$/);

  if (numericMatch) {
    return Number(numericMatch[1]) > 0;
  }

  return true;
}


/*
Gets every housing-related text segment that we currently have
available on the booking.

buildingsRooms is the important field for the newer booking system.

roomName is kept as a fallback for older/imported records.
*/
function getBookingLodgingSegments(booking) {
  const sourceValues = [
    booking?.buildingsRooms,
    booking?.roomName,
  ]
    .map((value) => String(value || "").trim())
    .filter(
      (value) =>
        value &&
        value.toLowerCase() !== "unassigned"
    );

  const segments = sourceValues.flatMap((value) =>
    value
      .split(/[;\n|]+/)
      .map((segment) => segment.trim())
      .filter(Boolean)
  );

  return [...new Set(segments)];
}


/*
Returns the logical buildings used by a booking.

Notice that anything containing Hebron counts as "hebron".
That means these all work:

Hebron
Hebron 3rd Floor
Hebron Bunks
Hebron: Unknown
*/
function getAssignedBuildingIds(booking) {
  const segments = getBookingLodgingSegments(booking);

  return LODGING_BUILDINGS
    .filter((building) =>
      segments.some((segment) => {
        if (!lodgingSegmentHasAssignment(segment)) {
          return false;
        }

        const normalizedSegment = normalizeLodgingText(segment);

        return building.aliases.some((alias) =>
          normalizedSegment.includes(alias)
        );
      })
    )
    .map((building) => building.id);
}


function bookingMatchesBuilding(booking, buildingId) {
  const assignedBuildingIds = getAssignedBuildingIds(booking);

  if (buildingId === "all") {
    return assignedBuildingIds.length > 0;
  }

  if (buildingId === "unassigned") {
    return assignedBuildingIds.length === 0;
  }

  return assignedBuildingIds.includes(buildingId);
}


function getBuildingLabel(buildingId) {
  if (buildingId === "all") {
    return "All Lodging";
  }

  if (buildingId === "unassigned") {
    return "Unassigned";
  }

  return (
    LODGING_BUILDINGS.find(
      (building) => building.id === buildingId
    )?.label || "Lodging"
  );
}

function getBuildingConfig(buildingId) {
  return LODGING_BUILDINGS.find(
    (building) => building.id === buildingId
  );
}


function getBookingBuildingSummary(booking) {
  const assignedBuildingIds = getAssignedBuildingIds(booking);

  if (!assignedBuildingIds.length) {
    return "Unassigned";
  }

  return assignedBuildingIds
    .map((buildingId) => getBuildingLabel(buildingId))
    .join(" + ");
}


function getBookingLodgingDisplayText(booking) {
  const buildingsRooms = String(
    booking?.buildingsRooms || ""
  ).trim();

  if (buildingsRooms) {
    return buildingsRooms;
  }

  const roomName = String(
    booking?.roomName || ""
  ).trim();

  if (
    roomName &&
    roomName.toLowerCase() !== "unassigned"
  ) {
    return roomName;
  }

  return "Unassigned";
}


export default function LodgingCalendarView({
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
  const [selectedBuilding, setSelectedBuilding] =
    useState("all");

  const safeDatedInquiries = datedInquiries || [];
  const safeSelectedMonthInquiries =
    selectedMonthInquiries || [];


  const yearOptions = useMemo(() => {
    return Array.from(
      new Set([
        2025,
        2026,
        2027,
        2028,
        2029,
        2030,
        selectedYear,
      ])
    ).sort(
      (firstYear, secondYear) =>
        firstYear - secondYear
    );
  }, [selectedYear]);


  /*
  These are the bookings passed into BookingCalendar.

  BookingCalendar still handles:
  - date positioning
  - multi-day bars
  - overlap lanes
  - week splitting
  - tooltips

  This page only decides WHICH bookings it receives.
  */
  const filteredDatedInquiries = useMemo(() => {
    return safeDatedInquiries.filter((booking) =>
      bookingMatchesBuilding(
        booking,
        selectedBuilding
      )
    );
  }, [
    safeDatedInquiries,
    selectedBuilding,
  ]);


  /*
  Same filter, but limited to the currently selected month.
  Used by the agenda below the calendar.
  */
  const visibleMonthBookings = useMemo(() => {
    return safeSelectedMonthInquiries.filter(
      (booking) =>
        bookingMatchesBuilding(
          booking,
          selectedBuilding
        )
    );
  }, [
    safeSelectedMonthInquiries,
    selectedBuilding,
  ]);


  /*
  Counts shown inside each building toggle.

  The counts change as the selected month changes.
  */
  const buildingOptions = useMemo(() => {
      
    const options = [
      {
        id: "all",
        label: "All Lodging",
        colorClass: "lodging-all",
      },

      ...LODGING_BUILDINGS,

      {
        id: "unassigned",
        label: "Unassigned",
        colorClass: "lodging-unassigned",
      },
    ];

    return options.map((option) => ({
      ...option,

      count: safeSelectedMonthInquiries.filter(
        (booking) =>
          bookingMatchesBuilding(
            booking,
            option.id
          )
      ).length,
    }));
  }, [safeSelectedMonthInquiries]);


  const selectedBuildingLabel =
    getBuildingLabel(selectedBuilding);


  function getLodgingCalendarEventLabel(booking) {
    const organizationName =
      booking.organizationName ||
      "Unnamed Organization";

    /*
    When viewing all buildings, include the building
    names directly on the event bar.

    When looking at one building, repeating "Bethel"
    on every booking bar would just create noise.
    */
    if (selectedBuilding === "all") {
      return `${organizationName} · ${getBookingBuildingSummary(
        booking
      )}`;
    }

    return organizationName;
  }

  function getLodgingCalendarEventColor(booking) {
    /*
      When staff are looking at one specific building,
      every bar uses that building's color.
    */
    if (
      selectedBuilding !== "all" &&
      selectedBuilding !== "unassigned"
    ) {
      const selectedBuildingConfig =
        getBuildingConfig(selectedBuilding);

      return (
        selectedBuildingConfig?.eventClass ||
        "calendar-lodging-unassigned"
      );
    }

    /*
      Explicit Unassigned view gets the neutral gray color.
    */
    if (selectedBuilding === "unassigned") {
      return "calendar-lodging-unassigned";
    }

    /*
      In All Lodging mode, use the first assigned building
      as the booking's primary display color.

      The event text still lists all assigned buildings.
    */
    const assignedBuildingIds =
      getAssignedBuildingIds(booking);

    if (!assignedBuildingIds.length) {
      return "calendar-lodging-unassigned";
    }

    const primaryBuilding =
      getBuildingConfig(assignedBuildingIds[0]);

    return (
      primaryBuilding?.eventClass ||
      "calendar-lodging-unassigned"
    );
  }


  return (
    <section className="calendar-view-page lodging-calendar-page">
      <article className="dashboard-card calendar-view-card lodging-calendar-card">

        <div className="calendar-view-header">
          <div>
            <p className="dashboard-eyebrow">
              Housing & Lodging
            </p>

            <h2>
              {monthNames[selectedMonth]}{" "}
              {selectedYear}
            </h2>

            <p>
              See when each lodging building is
              being used and which groups are
              assigned there.
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


        <div
          className="lodging-calendar-building-switcher"
          aria-label="Lodging building filters"
        >
          {buildingOptions.map((building) => {
            const isActive =
              selectedBuilding === building.id;

            return (
              <button
                className={[
                  "lodging-calendar-building-option",
                  building.colorClass || "",
                  isActive ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                key={building.id}
                onClick={() =>
                  setSelectedBuilding(building.id)
                }
              >
                {building.image ? (
                  <span className="lodging-calendar-building-image">
                    <img
                      src={building.image}
                      alt=""
                      aria-hidden="true"
                      onError={(event) => {
                        event.currentTarget.style.display =
                          "none";
                      }}
                    />
                  </span>
                ) : (
                  <span className="lodging-calendar-building-marker">
                    <i />
                    <i />
                    <i />
                  </span>
                )}

                <span className="lodging-calendar-building-copy">
                  <span>{building.label}</span>

                  <strong>{building.count}</strong>
                </span>
              </button>
            );
          })}
        </div>


        <div className="calendar-controls calendar-controls-large">
          <button
            type="button"
            onClick={goToPreviousMonth}
            aria-label="Previous month"
          >
            «
          </button>

          <select
            value={selectedMonth}
            onChange={(event) =>
              setSelectedMonth(
                Number(event.target.value)
              )
            }
          >
            {monthNames.map((month, index) => (
              <option
                value={index}
                key={month}
              >
                {month}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(event) =>
              setSelectedYear(
                Number(event.target.value)
              )
            }
          >
            {yearOptions.map((year) => (
              <option
                value={year}
                key={year}
              >
                {year}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Next month"
          >
            »
          </button>
        </div>


        <BookingCalendar
          calendarCells={calendarCells}
          datedInquiries={filteredDatedInquiries}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          getCalendarEventColor={getCalendarEventColor}
          getEventColor={getLodgingCalendarEventColor}
          getEventLabel={getLodgingCalendarEventLabel}
          getRoomText={getBookingLodgingDisplayText}
          isLarge
        />

      </article>


      <aside className="dashboard-card calendar-view-agenda lodging-calendar-agenda">
        <div className="dashboard-card-header">
          <div>
            <h2>
              {selectedBuildingLabel}
            </h2>

            <p>
              {visibleMonthBookings.length}{" "}
              booking
              {visibleMonthBookings.length === 1
                ? ""
                : "s"}{" "}
              shown for{" "}
              {monthNames[selectedMonth]}.
            </p>
          </div>
        </div>


        {visibleMonthBookings.length > 0 ? (
          <div className="calendar-agenda-list">
            {visibleMonthBookings.map(
              (booking) => (
                <div
                  className="calendar-agenda-card lodging-calendar-agenda-card"
                  key={booking.id}
                >
                  <div>
                    <strong>
                      {booking.organizationName}
                    </strong>

                    <span className="calendar-agenda-status lodging-calendar-status">
                      {booking.status}
                    </span>

                  </div>

                  <p>
                    {formatDateRange(
                      booking.startDate,
                      booking.endDate
                    )}
                  </p>

                  <small>
                    {getBookingLodgingDisplayText(
                      booking
                    )}
                  </small>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="empty-state">
            <strong>
              No lodging bookings shown
            </strong>

            <p>
              There are no bookings using{" "}
              {selectedBuildingLabel.toLowerCase()}{" "}
              during this month.
            </p>
          </div>
        )}
      </aside>
    </section>
  );
}