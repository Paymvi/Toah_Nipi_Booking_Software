import { useEffect, useMemo, useState } from "react";

import {
  FaBed,
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
    capacity: "70",
    image: "/lodges/Bethel.webp",
  },

  {
    id: "hebron-third",
    field: "lodgingHebronThird",
    roomName: "Hebron 3rd Floor",
    housingArea: "Main Lodge",
    roomCategory: "Private Rooms",
    capacity: "14",
    image: "/lodges/May-2025-Hebron.jpg",
  },

  {
    id: "hebron-bunks",
    field: "lodgingHebronBunks",
    roomName: "Hebron Bunks",
    housingArea: "Main Lodge",
    roomCategory: "Dormitory / Bunks",
    capacity: "52",
    image: "/lodges/May-2025-Hebron.jpg",
  },

  {
    id: "dothan",
    field: "lodgingDothan",
    roomName: "Dothan",
    housingArea: "Dothan Lodge",
    roomCategory: "Small Group Lodge",
    capacity: "21",
    image: "/lodges/Dothan.webp",
  },

  {
    id: "ajalon",
    field: "lodgingAjalon",
    roomName: "Ajalon",
    housingArea: "Rustic Cottages",
    roomCategory: "Rustic Cottage",
    capacity: "5–8",
    image: "/lodges/Ajalon.png",
  },

  {
    id: "capernaum",
    field: "lodgingCapernaum",
    roomName: "Capernaum",
    housingArea: "Rustic Cottages",
    roomCategory: "Rustic Cottage",
    capacity: "5",
    image: null,
  },

  {
    id: "guest-house",
    field: "lodgingGuestHouse",
    roomName: "Guest House",
    housingArea: "Guest House",
    roomCategory: "House Style Lodging",
    capacity: "9–12",
    image: "/lodges/Guest-House.webp",
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


function buildLodgingSummary(values) {
  return housingRows
    .map((row) => {
      const value =
        String(values[row.field] || "").trim();

      if (!value || Number(value) === 0) {
        return "";
      }

      return `${row.roomName}: ${value}`;
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
    bookingGuestCount > 0
      ? Math.max(
          bookingGuestCount -
            totalAssigned,
          0
        )
      : 0;


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
  };


  const handleCancel = () => {
    setHousingValues(
      getInitialHousingState(booking)
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
        housingValues
      );

    const linenSummary =
      buildLinenSummary(
        linenOption,
        linenSets
      );


    const updatedRentalFormDetails = {
      ...(booking.rentalFormDetails || {}),

      lodgingBethel:
        housingValues.lodgingBethel || "",

      lodgingHebronThird:
        housingValues.lodgingHebronThird || "",

      lodgingHebronBunks:
        housingValues.lodgingHebronBunks || "",

      lodgingDothan:
        housingValues.lodgingDothan || "",

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
                Assigned to Lodging
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
                  Capacity
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

                  return (
                    <tr
                      key={row.id}
                      className={
                        assignedNumber > 0
                          ? "booking-housing-row-assigned"
                          : ""
                      }
                    >

                      <td>
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
                      </td>


                      <td>
                        {row.housingArea}
                      </td>


                      <td>
                        {row.roomCategory}
                      </td>


                      <td>
                        {row.capacity}
                      </td>


                      <td>
                        {isEditing ? (
                          <input
                            className="booking-housing-count-input"
                            type="number"
                            min="0"
                            value={
                              assignedValue
                            }
                            placeholder="0"
                            onChange={(
                              event
                            ) =>
                              updateHousingValue(
                                row.field,
                                event
                                  .target
                                  .value
                              )
                            }
                          />
                        ) : (
                          <strong className="booking-housing-assigned-count">
                            {assignedValue ||
                              0}
                          </strong>
                        )}
                      </td>

                    </tr>
                  );
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