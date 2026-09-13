import { useEffect, useMemo, useState } from "react";

import {
  FaBed,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaPen,
  FaSave,
  FaTimes,
  FaUsers,
} from "react-icons/fa";


/* =========================================================
   CURRENT LODGING OPTIONS

   These match the lodging fields used by CreateBooking.
========================================================= */

const housingRows = [
  {
    id: "bethel",
    field: "lodgingBethel",
    roomName: "Bethel",
    housingArea: "Bethel Lodge",
    roomCategory: "Family Style Rooms",
    image: "/lodges/Bethel.webp",
    aliases: ["bethel"],
    floors: [
      {
        id: "upper",
        field: "lodgingBethelUpper",
        label: "Upper Floor",
      },
      {
        id: "middle",
        field: "lodgingBethelMiddle",
        label: "Middle Floor",
      },
      {
        id: "lower",
        field: "lodgingBethelLower",
        label: "Lower Floor",
      },
    ],
  },

  {
    id: "hebron-third",
    field: "lodgingHebronThird",
    roomName: "Hebron 3rd Floor",
    housingArea: "Main Lodge",
    roomCategory: "Private Rooms",
    image: "/lodges/May-2025-Hebron.jpg",
    aliases: [
      "hebron 3rd floor",
      "hebron third floor",
      "hebron 3rd",
    ],
  },

  {
    id: "hebron-bunks",
    field: "lodgingHebronBunks",
    roomName: "Hebron Bunks",
    housingArea: "Main Lodge",
    roomCategory: "Dormitory / Bunks",
    image: "/lodges/May-2025-Hebron.jpg",
    aliases: [
      "hebron bunks",
      "hebron bunk",
    ],
  },

  {
    id: "dothan",
    field: "lodgingDothan",
    roomName: "Dothan",
    housingArea: "Dothan Lodge",
    roomCategory: "Small Group Lodge",
    image: "/lodges/Dothan.webp",
    aliases: ["dothan"],
    floors: [
      {
        id: "upper",
        field: "lodgingDothanUpper",
        label: "Upper Floor",
      },
      {
        id: "middle",
        field: "lodgingDothanMiddle",
        label: "Middle Floor",
      },
      {
        id: "lower",
        field: "lodgingDothanLower",
        label: "Lower Floor",
      },
    ],
  },

  {
    id: "ajalon",
    field: "lodgingAjalon",
    roomName: "Ajalon",
    housingArea: "Rustic Cottages",
    roomCategory: "Rustic Cottage",
    image: "/lodges/Ajalon.png",
    aliases: [
      "ajalon",
      "rustic: ajalon",
      "rustic ajalon",
    ],
  },

  {
    id: "capernaum",
    field: "lodgingCapernaum",
    roomName: "Capernaum",
    housingArea: "Rustic Cottages",
    roomCategory: "Rustic Cottage",
    image: null,
    aliases: [
      "capernaum",
      "rustic: capernaum",
      "rustic capernaum",
    ],
  },

  {
    id: "guest-house",
    field: "lodgingGuestHouse",
    roomName: "Guest House",
    housingArea: "Guest House",
    roomCategory: "House Style Lodging",
    image: "/lodges/Guest-House.webp",
    aliases: [
      "guest house",
      "guesthouse",
    ],
  },
];


/* =========================================================
   HELPERS
========================================================= */

function cleanNumberValue(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return "";
  }

  return String(Math.max(0, number));
}


/*
  Staff bookings save buildingsRooms like:

  Bethel: 20;
  Hebron 3rd Floor: 10;
  Hebron Bunks: 17
*/
function getValueFromLodgingSummary(summary, roomName) {
  const parts = String(summary || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const matchingPart = parts.find((part) =>
    part.toLowerCase().startsWith(
      `${roomName.toLowerCase()}:`
    )
  );

  if (!matchingPart) {
    return "";
  }

  const value = matchingPart
    .slice(matchingPart.indexOf(":") + 1)
    .trim();

  return cleanNumberValue(value);
}

function getBookingHousingText(booking) {
  return [
    booking?.roomName,
    booking?.buildingsRooms,
  ]
    .filter(Boolean)
    .join("; ")
    .toLowerCase();
}


function importedBookingUsesHousingRow(
  booking,
  row
) {
  const housingText =
    getBookingHousingText(booking);

  if (!housingText) {
    return false;
  }

  return row.aliases.some((alias) =>
    housingText.includes(
      alias.toLowerCase()
    )
  );
}


function getInitialKnownUsage(booking) {
  const details =
    booking?.rentalFormDetails || {};

  const housingValues =
    getInitialHousingState(booking);

  const savedUsage =
    details.housingUsage || {};

  const result = {};

  housingRows.forEach((row) => {
    const numericValue =
      Number(
        housingValues[row.field] || 0
      );

    const hasKnownCount =
      Number.isFinite(numericValue) &&
      numericValue > 0;

    const explicitlyMarkedUsed =
      savedUsage[row.field] === true;

    const detectedFromImport =
      importedBookingUsesHousingRow(
        booking,
        row
      );

    result[row.field] =
      hasKnownCount ||
      explicitlyMarkedUsed ||
      detectedFromImport;
  });

  return result;
}


function hasGenericHebronAssignment(booking) {
  const text =
    getBookingHousingText(booking);

  if (!text) {
    return false;
  }

  const mentionsHebron =
    /\bhebron\b/i.test(text);

  if (!mentionsHebron) {
    return false;
  }

  const identifiesThirdFloor =
    /hebron\s+(3rd|third)/i.test(
      text
    );

  const identifiesBunks =
    /hebron\s+bunks?/i.test(text);

  return (
    !identifiesThirdFloor &&
    !identifiesBunks
  );
}


function getFloorTotal(row, values) {
  if (!Array.isArray(row.floors)) {
    return 0;
  }

  return row.floors.reduce(
    (total, floor) => {
      const value =
        Number(values?.[floor.field] || 0);

      return (
        total +
        (Number.isFinite(value)
          ? value
          : 0)
      );
    },
    0
  );
}


function rowHasFloorBreakdown(
  row,
  values
) {
  if (!Array.isArray(row.floors)) {
    return false;
  }

  return row.floors.some(
    (floor) => {
      const value =
        Number(values?.[floor.field] || 0);

      return (
        Number.isFinite(value) &&
        value > 0
      );
    }
  );
}


function getInitialExpandedHousingRows(
  booking
) {
  const values =
    getInitialHousingState(booking);

  const result = {};

  housingRows.forEach((row) => {
    if (Array.isArray(row.floors)) {
      result[row.id] =
        rowHasFloorBreakdown(
          row,
          values
        );
    }
  });

  return result;
}


function getInitialHousingState(booking) {
  const details =
    booking?.rentalFormDetails || {};

  const state = {};

  housingRows.forEach((row) => {
    state[row.field] =
      cleanNumberValue(details[row.field]) ||
      getValueFromLodgingSummary(
        booking?.buildingsRooms,
        row.roomName
      );

    if (Array.isArray(row.floors)) {
      row.floors.forEach((floor) => {
        state[floor.field] =
          cleanNumberValue(
            details[floor.field]
          );
      });

      const floorTotal =
        getFloorTotal(row, state);

      if (floorTotal > 0) {
        state[row.field] =
          String(floorTotal);
      }
    }
  });

  return state;
}


function getInitialLinenOption(booking) {
  const details =
    booking?.rentalFormDetails || {};

  if (details.linenOption) {
    return details.linenOption;
  }

  const legacyValue =
    String(booking?.linenSets || "")
      .trim()
      .toLowerCase();

  if (legacyValue.startsWith("all")) {
    return "All";
  }

  if (legacyValue.startsWith("some")) {
    return "Some";
  }

  return "No";
}


function getInitialLinenSets(booking) {
  const details =
    booking?.rentalFormDetails || {};

  if (
    details.linenSets !== null &&
    details.linenSets !== undefined &&
    String(details.linenSets).trim() !== ""
  ) {
    return String(details.linenSets);
  }

  const legacyText =
    String(booking?.linenSets || "");

  const match =
    legacyText.match(/\d+/);

  return match ? match[0] : "";
}


function buildLodgingSummary(
  values,
  knownUsage
) {
  return housingRows
    .map((row) => {
      const value =
        String(
          values[row.field] || ""
        ).trim();

      const numberValue =
        Number(value);

      if (
        value &&
        Number.isFinite(numberValue) &&
        numberValue > 0
      ) {
        return `${row.roomName}: ${value}`;
      }

      if (knownUsage[row.field]) {
        return `${row.roomName}: count unknown`;
      }

      return "";
    })
    .filter(Boolean)
    .join("; ");
}


function buildLinenSummary(
  linenOption,
  linenSets
) {
  if (linenOption === "No") {
    return "No";
  }

  if (linenSets) {
    return `${linenOption} - ${linenSets} full set(s)`;
  }

  return linenOption;
}


/* =========================================================
   COMPONENT
========================================================= */

export default function BookingHousingTab({
  booking,
  onSaveBooking,
}) {
  const [isEditing, setIsEditing] =
    useState(false);

  const [housingValues, setHousingValues] =
    useState(() =>
      getInitialHousingState(booking)
    );

  const [knownUsage, setKnownUsage] =
    useState(() =>
      getInitialKnownUsage(booking)
    );

  const [
    expandedHousingRows,
    setExpandedHousingRows,
  ] = useState(() =>
    getInitialExpandedHousingRows(booking)
  );

  const [linenOption, setLinenOption] =
    useState(() =>
      getInitialLinenOption(booking)
    );

  const [linenSets, setLinenSets] =
    useState(() =>
      getInitialLinenSets(booking)
    );


  /* =======================================================
     RESET WHEN ANOTHER BOOKING IS OPENED / SAVED
  ======================================================= */

  useEffect(() => {
    setHousingValues(
      getInitialHousingState(booking)
    );

    setKnownUsage(
      getInitialKnownUsage(booking)
    );

    setExpandedHousingRows(
      getInitialExpandedHousingRows(
        booking
      )
    );

    setLinenOption(
      getInitialLinenOption(booking)
    );

    setLinenSets(
      getInitialLinenSets(booking)
    );

    setIsEditing(false);
  }, [booking]);


  /* =======================================================
     TOTALS
  ======================================================= */

  const totalAssigned = useMemo(() => {
    return housingRows.reduce(
      (total, row) => {
        const value =
          Number(
            housingValues[row.field] || 0
          );

        return (
          total +
          (Number.isFinite(value)
            ? value
            : 0)
        );
      },
      0
    );
  }, [housingValues]);

  const unknownAssignmentCount =
    useMemo(() => {
      return housingRows.filter(
        (row) => {
          const isUsed =
            knownUsage[row.field];

          const numberValue =
            Number(
              housingValues[
                row.field
              ] || 0
            );

          const hasKnownCount =
            Number.isFinite(
              numberValue
            ) &&
            numberValue > 0;

          return (
            isUsed &&
            !hasKnownCount
          );
        }
      ).length;
    }, [
      housingValues,
      knownUsage,
    ]);


  const bookingGuestCount = useMemo(() => {
    const value =
      Number(
        booking?.attendeeCount ||
        booking?.groupSize ||
        booking?.persons ||
        0
      );

    return Number.isFinite(value)
      ? value
      : 0;
  }, [booking]);


  const unassignedGuests =
    bookingGuestCount <= 0
      ? "—"
      : unknownAssignmentCount > 0
        ? "Unknown"
        : Math.max(
            bookingGuestCount -
              totalAssigned,
            0
          );


  /* =======================================================
     EDITING
  ======================================================= */

  const updateHousingValue = (
    field,
    value
  ) => {
    if (
      value !== "" &&
      !/^\d+$/.test(value)
    ) {
      return;
    }

    setHousingValues(
      (currentValues) => ({
        ...currentValues,
        [field]: value,
      })
    );

    const numericValue =
      Number(value);

    if (
      value !== "" &&
      Number.isFinite(numericValue) &&
      numericValue > 0
    ) {
      setKnownUsage(
        (currentUsage) => ({
          ...currentUsage,
          [field]: true,
        })
      );
    }
  };


  const updateFloorValue = (
    row,
    floorField,
    value
  ) => {
    if (
      value !== "" &&
      !/^\d+$/.test(value)
    ) {
      return;
    }

    setHousingValues(
      (currentValues) => {
        const nextValues = {
          ...currentValues,
          [floorField]: value,
        };

        const floorTotal =
          getFloorTotal(
            row,
            nextValues
          );

        const hasFloorBreakdown =
          rowHasFloorBreakdown(
            row,
            nextValues
          );

        nextValues[row.field] =
          hasFloorBreakdown
            ? String(floorTotal)
            : "";

        return nextValues;
      }
    );

    const numericValue =
      Number(value);

    if (
      value !== "" &&
      Number.isFinite(numericValue) &&
      numericValue > 0
    ) {
      setKnownUsage(
        (currentUsage) => ({
          ...currentUsage,
          [row.field]: true,
        })
      );
    }
  };


  const clearFloorBreakdown = (
    row
  ) => {
    setHousingValues(
      (currentValues) => {
        const nextValues = {
          ...currentValues,
        };

        row.floors.forEach((floor) => {
          nextValues[floor.field] = "";
        });

        nextValues[row.field] = "";

        return nextValues;
      }
    );
  };


  const toggleHousingUsage = (
    row,
    isUsed
  ) => {
    setKnownUsage(
      (currentUsage) => ({
        ...currentUsage,
        [row.field]: isUsed,
      })
    );

    if (!isUsed) {
      setHousingValues(
        (currentValues) => {
          const nextValues = {
            ...currentValues,
            [row.field]: "",
          };

          if (Array.isArray(row.floors)) {
            row.floors.forEach((floor) => {
              nextValues[floor.field] = "";
            });
          }

          return nextValues;
        }
      );
    }
  };


  const toggleExpandedRow = (
    rowId
  ) => {
    setExpandedHousingRows(
      (currentRows) => ({
        ...currentRows,
        [rowId]:
          !currentRows[rowId],
      })
    );
  };


  const handleCancel = () => {
    setHousingValues(
      getInitialHousingState(booking)
    );

    setKnownUsage(
      getInitialKnownUsage(booking)
    );

    setExpandedHousingRows(
      getInitialExpandedHousingRows(
        booking
      )
    );

    setLinenOption(
      getInitialLinenOption(booking)
    );

    setLinenSets(
      getInitialLinenSets(booking)
    );

    setIsEditing(false);
  };


  const handleSave = async () => {
    if (!onSaveBooking) {
      return;
    }

  const buildingsRooms =
    buildLodgingSummary(
      housingValues,
      knownUsage
    );

    const linenSummary =
      buildLinenSummary(
        linenOption,
        linenSets
      );


    const updatedRentalFormDetails = {
      ...(booking.rentalFormDetails || {}),

      housingUsage: {
        ...knownUsage,
      },

      lodgingBethel:
        housingValues.lodgingBethel || "",

      lodgingBethelUpper:
        housingValues.lodgingBethelUpper || "",

      lodgingBethelMiddle:
        housingValues.lodgingBethelMiddle || "",

      lodgingBethelLower:
        housingValues.lodgingBethelLower || "",

      lodgingHebronThird:
        housingValues.lodgingHebronThird || "",

      lodgingHebronBunks:
        housingValues.lodgingHebronBunks || "",

      lodgingDothan:
        housingValues.lodgingDothan || "",

      lodgingDothanUpper:
        housingValues.lodgingDothanUpper || "",

      lodgingDothanMiddle:
        housingValues.lodgingDothanMiddle || "",

      lodgingDothanLower:
        housingValues.lodgingDothanLower || "",

      lodgingAjalon:
        housingValues.lodgingAjalon || "",

      lodgingCapernaum:
        housingValues.lodgingCapernaum || "",

      lodgingGuestHouse:
        housingValues.lodgingGuestHouse || "",

      linenOption,

      linenSets:
        linenOption === "No"
          ? ""
          : linenSets,
    };


    await onSaveBooking({
      ...booking,

      /*
        This stays compatible with the spreadsheet /
        availability portions of the dashboard.
      */
      buildingsRooms,

      /*
        This matches CreateBooking's linen summary.
      */
      linenSets: linenSummary,

      /*
        These are the actual detailed housing fields
        used by the current Staff Booking system.
      */
      rentalFormDetails:
        updatedRentalFormDetails,

      updatedAt:
        new Date().toISOString(),
    });


    setIsEditing(false);
  };


  /* =======================================================
     LEGACY / IMPORTED HOUSING TEXT

     Imported spreadsheet records may have room text but
     not the newer rentalFormDetails fields.
  ======================================================= */

  const legacyHousingText =
    String(
      booking?.buildingsRooms ||
      ""
    ).trim();


  return (
    <div className="booking-housing-tab">

      {/* ===================================================
          HEADER / SUMMARY
      =================================================== */}

      <section className="dashboard-card booking-housing-tab-card">

        <div className="booking-housing-tab-header">

          <div className="booking-housing-tab-title">

            <span className="booking-housing-tab-title-icon">
              <FaBed />
            </span>

            <div>
              <h3>Housing</h3>

              <p>
                Lodging assignments for this booking.
              </p>
            </div>

          </div>


          <div className="booking-housing-tab-actions">

            {isEditing ? (
              <>
                <button
                  className="secondary-dashboard-button"
                  type="button"
                  onClick={handleCancel}
                >
                  <FaTimes />
                  Cancel
                </button>

                <button
                  className="primary-dashboard-button"
                  type="button"
                  onClick={handleSave}
                >
                  <FaSave />
                  Save Changes
                </button>
              </>
            ) : (
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={() =>
                  setIsEditing(true)
                }
              >
                <FaPen />
                Edit Housing
              </button>
            )}

          </div>

        </div>


        <div className="booking-housing-summary">

          <div className="booking-housing-summary-item">
            <span>
              <FaUsers />
            </span>

            <div>
              <small>
                Booking Guests
              </small>

              <strong>
                {bookingGuestCount || "—"}
              </strong>
            </div>
          </div>


          <div className="booking-housing-summary-item">
            <span>
              <FaBed />
            </span>

            <div>
              <small>
                Known Assigned
              </small>

              <strong>
                {totalAssigned}
              </strong>
            </div>
          </div>


          <div className="booking-housing-summary-item">

            <div>
              <small>
                Unassigned Guests
              </small>

              <strong>
                {bookingGuestCount
                  ? unassignedGuests
                  : "—"}
              </strong>
            </div>

          </div>

        </div>


        {/* =================================================
            IMPORTED HEBRON WARNING
        ================================================= */}

        {hasGenericHebronAssignment(booking) && (
          <div className="booking-housing-import-warning">
            <FaBed />

            <div>
              <strong>
                Imported housing lists Hebron
              </strong>

              <span>
                The source record does not identify whether
                this means Hebron 3rd Floor, Hebron Bunks,
                or both.
              </span>
            </div>
          </div>
        )}


        {/* =================================================
            LODGING TABLE
        ================================================= */}

        <div className="booking-housing-table-wrap">

          <table className="booking-housing-table">

            <thead>
              <tr>
                <th>Lodging</th>

                <th>
                  Housing Area
                </th>

                <th>
                  Room Category
                </th>

                <th>
                  Known Use
                </th>

                <th>
                  Assigned Guests
                </th>

              </tr>
            </thead>


            <tbody>

              {housingRows.map(
                (row) => {

                  const assignedValue =
                    housingValues[
                      row.field
                    ] || "";

                  const assignedNumber =
                    Number(
                      assignedValue || 0
                    );

                  const hasFloors =
                    Array.isArray(row.floors) &&
                    row.floors.length > 0;

                  const isExpanded =
                    Boolean(
                      expandedHousingRows[
                        row.id
                      ]
                    );

                  const hasFloorBreakdown =
                    hasFloors &&
                    rowHasFloorBreakdown(
                      row,
                      housingValues
                    );

                  const floorTotal =
                    hasFloors
                      ? getFloorTotal(
                          row,
                          housingValues
                        )
                      : 0;

                  const isAssigned =
                    assignedNumber > 0 ||
                    Boolean(
                      knownUsage[row.field]
                    );

                  return [
                    <tr
                      key={`${row.id}-main`}
                      className={[
                        isAssigned
                          ? "booking-housing-row-assigned"
                          : "",
                        hasFloors
                          ? "booking-housing-row-expandable"
                          : "",
                        isExpanded
                          ? "booking-housing-row-expanded"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >

                      <td>
                        {hasFloors ? (
                          <button
                            className="housing-room-expand-button"
                            type="button"
                            onClick={() =>
                              toggleExpandedRow(
                                row.id
                              )
                            }
                            aria-expanded={
                              isExpanded
                            }
                          >
                            <span className="housing-room-cell">

                              {row.image ? (
                                <img
                                  className="housing-room-thumb"
                                  src={row.image}
                                  alt=""
                                  aria-hidden="true"
                                  onError={(
                                    event
                                  ) => {
                                    event.currentTarget.style.display =
                                      "none";
                                  }}
                                />
                              ) : (
                                <span className="housing-room-thumb-placeholder">
                                  <FaBed />
                                </span>
                              )}

                              <span className="housing-room-expand-copy">
                                <strong>
                                  {row.roomName}
                                </strong>

                                <small>
                                  Click for floor breakdown
                                </small>
                              </span>

                            </span>

                            <span className="housing-room-expand-chevron">
                              {isExpanded ? (
                                <FaChevronDown />
                              ) : (
                                <FaChevronRight />
                              )}
                            </span>
                          </button>
                        ) : (
                          <div className="housing-room-cell">

                            {row.image ? (
                              <img
                                className="housing-room-thumb"
                                src={row.image}
                                alt={`${row.roomName} lodging`}
                                onError={(
                                  event
                                ) => {
                                  event.currentTarget.style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <span className="housing-room-thumb-placeholder">
                                <FaBed />
                              </span>
                            )}

                            <strong>
                              {row.roomName}
                            </strong>

                          </div>
                        )}
                      </td>


                      <td>
                        {row.housingArea}
                      </td>


                      <td>
                        {row.roomCategory}
                      </td>


                      <td>
                        {isEditing ? (
                          <label className="booking-housing-use-toggle">
                            <input
                              type="checkbox"
                              checked={
                                Boolean(
                                  knownUsage[row.field]
                                )
                              }
                              onChange={(event) =>
                                toggleHousingUsage(
                                  row,
                                  event.target.checked
                                )
                              }
                            />

                            <span>
                              Used
                            </span>
                          </label>
                        ) : knownUsage[row.field] ? (
                          <span className="booking-housing-use-pill booking-housing-use-pill-active">
                            <FaCheck />
                            Used
                          </span>
                        ) : (
                          <span className="booking-housing-use-pill booking-housing-use-pill-empty">
                            —
                          </span>
                        )}
                      </td>


                      <td>
                        {isEditing ? (
                          hasFloorBreakdown ? (
                            <div className="booking-housing-calculated-count">
                              <strong>
                                {floorTotal}
                              </strong>

                              <small>
                                From floors
                              </small>
                            </div>
                          ) : (
                            <input
                              className="booking-housing-count-input"
                              type="number"
                              min="0"
                              value={assignedValue}
                              placeholder={
                                knownUsage[row.field]
                                  ? "Unknown"
                                  : "0"
                              }
                              onChange={(event) =>
                                updateHousingValue(
                                  row.field,
                                  event.target.value
                                )
                              }
                            />
                          )
                        ) : assignedNumber > 0 ? (
                          <div className="booking-housing-assigned-total">
                            <strong className="booking-housing-assigned-count">
                              {assignedNumber}
                            </strong>

                            {hasFloorBreakdown && (
                              <small>
                                Floor split saved
                              </small>
                            )}
                          </div>
                        ) : knownUsage[row.field] ? (
                          <span className="booking-housing-count-unknown">
                            Unknown
                          </span>
                        ) : (
                          <strong className="booking-housing-assigned-count booking-housing-assigned-count-zero">
                            0
                          </strong>
                        )}
                      </td>

                    </tr>,

                    hasFloors && isExpanded ? (
                      <tr
                        key={`${row.id}-floors`}
                        className="booking-housing-floor-detail-row"
                      >
                        <td
                          colSpan="5"
                          className="booking-housing-floor-detail-cell"
                        >
                          <div className="booking-housing-floor-panel">

                            <div className="booking-housing-floor-panel-header">

                              <div>
                                <strong>
                                  {row.roomName} Floor Breakdown
                                </strong>

                                <span>
                                  Assign guests to the upper, middle, and lower floors.
                                </span>
                              </div>

                              <div className="booking-housing-floor-total">
                                <span>
                                  Floor Total
                                </span>

                                <strong>
                                  {floorTotal}
                                </strong>
                              </div>

                            </div>


                            <div className="booking-housing-floor-grid">

                              {row.floors.map(
                                (floor) => {

                                  const floorValue =
                                    housingValues[
                                      floor.field
                                    ] || "";

                                  return (
                                    <label
                                      className="booking-housing-floor-field"
                                      key={floor.id}
                                    >
                                      <span>
                                        {floor.label}
                                      </span>

                                      {isEditing ? (
                                        <div className="booking-housing-floor-input-wrap">
                                          <input
                                            type="number"
                                            min="0"
                                            value={floorValue}
                                            placeholder="0"
                                            onChange={(event) =>
                                              updateFloorValue(
                                                row,
                                                floor.field,
                                                event.target.value
                                              )
                                            }
                                          />

                                          <small>
                                            guests
                                          </small>
                                        </div>
                                      ) : (
                                        <strong>
                                          {floorValue || "0"}
                                        </strong>
                                      )}
                                    </label>
                                  );
                                }
                              )}

                            </div>


                            {isEditing &&
                              hasFloorBreakdown && (
                                <div className="booking-housing-floor-panel-footer">

                                  <span>
                                    The main {row.roomName} total is calculated automatically from these floors.
                                  </span>

                                  <button
                                    className="booking-housing-clear-floor-button"
                                    type="button"
                                    onClick={() =>
                                      clearFloorBreakdown(
                                        row
                                      )
                                    }
                                  >
                                    Clear Floor Split
                                  </button>

                                </div>
                              )}

                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                }
              )}

            </tbody>

          </table>

        </div>

      </section>


      {/* ===================================================
          LINENS
      =================================================== */}

      <section className="dashboard-card booking-housing-linens-card">

        <div className="booking-housing-linens-header">

          <span className="booking-housing-tab-title-icon">
            <FaBed />
          </span>

          <div>
            <h3>Linens</h3>

            <p>
              Linen requirements for this group.
            </p>
          </div>

        </div>


        <div className="booking-housing-linens-grid">

          <label className="booking-housing-linen-field">

            <span>
              Linen Option
            </span>

            {isEditing ? (
              <select
                value={linenOption}
                onChange={(event) =>
                  setLinenOption(
                    event.target.value
                  )
                }
              >
                <option value="No">
                  No
                </option>

                <option value="Some">
                  Some
                </option>

                <option value="All">
                  All
                </option>
              </select>
            ) : (
              <strong>
                {linenOption || "No"}
              </strong>
            )}

          </label>


          <label className="booking-housing-linen-field">

            <span>
              Linen Sets
            </span>

            {isEditing ? (
              <input
                type="number"
                min="0"
                disabled={
                  linenOption === "No"
                }
                value={
                  linenOption === "No"
                    ? ""
                    : linenSets
                }
                placeholder="0"
                onChange={(event) =>
                  setLinenSets(
                    event.target.value
                  )
                }
              />
            ) : (
              <strong>
                {linenOption === "No"
                  ? "0"
                  : linenSets || "0"}
              </strong>
            )}

          </label>

        </div>

      </section>


      {/* ===================================================
          LEGACY / IMPORTED ROOM INFORMATION
      =================================================== */}

      {legacyHousingText &&
        !booking?.rentalFormDetails && (
          <section className="dashboard-card booking-housing-legacy-card">

            <small>
              Imported Housing Record
            </small>

            <strong>
              {legacyHousingText}
            </strong>

            <p>
              This booking came from an older or
              imported record, so its original
              housing text is shown here.
            </p>

          </section>
        )}

    </div>
  );
}