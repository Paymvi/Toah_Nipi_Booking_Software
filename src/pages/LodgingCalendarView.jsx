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

const weekDayLabels = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];


function parseDateOnly(value) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


function getInquiryDateRange(inquiry) {
  const startDate = parseDateOnly(inquiry.startDate);

  const endDate =
    parseDateOnly(inquiry.endDate) ||
    startDate;

  if (!startDate) {
    return null;
  }

  return {
    startDate,
    endDate,
  };
}


function inquiryTouchesDate(inquiry, date) {
  const range = getInquiryDateRange(inquiry);

  if (!range) {
    return false;
  }

  return (
    range.startDate <= date &&
    range.endDate >= date
  );
}


function inquiryTouchesMonth(inquiry, year, month) {
  const range = getInquiryDateRange(inquiry);

  if (!range) {
    return false;
  }

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  return (
    range.startDate <= monthEnd &&
    range.endDate >= monthStart
  );
}


function inquiryTouchesYear(inquiry, year) {
  const range = getInquiryDateRange(inquiry);

  if (!range) {
    return false;
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  return (
    range.startDate <= yearEnd &&
    range.endDate >= yearStart
  );
}


function getHeatmapBuildingBucket(inquiry, selectedBuilding) {
  if (
    selectedBuilding !== "all" &&
    selectedBuilding !== "unassigned"
  ) {
    return selectedBuilding;
  }

  const assignedBuildings =
    getAssignedBuildingIds(inquiry);

  if (!assignedBuildings.length) {
    return "unassigned";
  }

  return assignedBuildings[0];
}


function getPrimaryHeatmapBucket(bucketCounts) {
  return Object.entries(bucketCounts)
    .sort((a, b) => b[1] - a[1])
    .find((entry) => entry[1] > 0)?.[0] || null;
}


function getHeatmapOpacity(count) {
  if (count <= 0) {
    return 0;
  }

  if (count >= 5) {
    return 1;
  }

  return 0.25 + count * 0.15;
}


function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}


function getStartOfWeek(date) {
  const startDate = new Date(date);
  startDate.setDate(
    startDate.getDate() - startDate.getDay()
  );
  startDate.setHours(0,0,0,0);

  return startDate;
}


function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart,6);

  return `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
}

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
    image: "/lodges/Ajalon.png",
    colorClass: "lodging-ajalon",
    eventClass: "calendar-lodging-ajalon",
  },

  {
    id: "capernaum",
    label: "Capernaum",
    aliases: ["capernaum"],
    image: "/lodges/Capurnum.webp",
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

  const [calendarView, setCalendarView] =
      useState("month");

  const [yearDisplayView, setYearDisplayView] =
      useState("heatmap");

  const [selectedWeekStart, setSelectedWeekStart] =
    useState(() =>
      getStartOfWeek(new Date())
    );

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

  const selectedYearMonths = useMemo(() => {
    return monthNames.map((monthName, monthIndex) => ({
      monthName,
      monthIndex,
      inquiries: filteredDatedInquiries.filter((inquiry) =>
        inquiryTouchesMonth(
          inquiry,
          selectedYear,
          monthIndex
        )
      ),
    }));
  }, [
    filteredDatedInquiries,
    selectedYear,
  ]);

  const selectedYearInquiries = useMemo(() => {
    return safeDatedInquiries.filter((inquiry) =>
      inquiryTouchesYear(inquiry, selectedYear)
    );
  }, [safeDatedInquiries, selectedYear]);

  const selectedWeekDays = useMemo(() => {

    return weekDayLabels.map(
      (dayLabel,index)=>{

        const date =
          addDays(
            selectedWeekStart,
            index
          );

        const inquiries =
          filteredDatedInquiries.filter(
            (booking)=>{

              const start =
                new Date(
                  booking.startDate + "T00:00:00"
                );

              const end =
                new Date(
                  (booking.endDate || booking.startDate)
                  + "T00:00:00"
                );


              return (
                start <= date &&
                end >= date
              );

            }
          );


        return {
          date,
          dayLabel,
          inquiries,
        };

      }
    );

  },[
  filteredDatedInquiries,
  selectedWeekStart
  ]);

  const selectedYearHeatmapMonths = useMemo(() => {
      return monthNames.map((monthName, monthIndex) => {
        const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
        const leadingBlankDays = new Date(selectedYear, monthIndex, 1).getDay();
  
        const days = Array.from({ length: daysInMonth }, (_, dayOffset) => {
          const date = new Date(selectedYear, monthIndex, dayOffset + 1);
  
          const inquiries = filteredDatedInquiries.filter((inquiry) =>
            inquiryTouchesDate(inquiry, date)
          );
  
          const bucketCounts = inquiries.reduce(
            (counts, inquiry) => {
              const bucket = getHeatmapBuildingBucket(
                inquiry,
                selectedBuilding
              );

              return {
                ...counts,
                [bucket]: (counts[bucket] || 0) + 1,
              };
            },
            {}
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
    }, [
      getCalendarEventColor,
      filteredDatedInquiries,
      selectedYear
    ]);


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

  function openMonthFromYearView(monthIndex) {
    setSelectedMonth(monthIndex);
    setCalendarView("month");
  }



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

  function goToPreviousWeek(){

    setSelectedWeekStart(
      addDays(
        selectedWeekStart,
        -7
      )
    );

  }


  function goToNextWeek(){

    setSelectedWeekStart(
      addDays(
        selectedWeekStart,
        7
      )
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
          className="calendar-view-switcher"
          aria-label="Calendar views"
        >
          {calendarViewOptions.map((option) => (
            <button
              className={
                calendarView === option.value
                  ? "active"
                  : ""
              }
              type="button"
              key={option.value}
              onClick={() =>
                setCalendarView(option.value)
              }
            >
              {option.label}
            </button>
          ))}
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


        {calendarView === "month" && (
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
                    Building colors
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
                              ? getBuildingConfig(day.primaryBucket)?.colorClass
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

                              {selectedBuilding === "all" &&
                                day.activeBuckets.length > 1 && (
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