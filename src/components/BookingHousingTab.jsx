import { useEffect, useMemo, useState } from "react";
import { LODGING_BUILDINGS } from "../constants/lodgingConstants";
import { recordStaffEdits } from "../utils/bookingFields";
import { isStaffBookingRecord } from "../utils/bookingClassification";
import {
  buildLinenSummary,
  buildLodgingSummary,
  getBookingLodgingAssignments,
  getLegacyLodgingText,
} from "../utils/lodgingUtils";
import { isHousingAuthoritative } from "../utils/masterImportMerge";
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
   LODGING OPTIONS
   Built from the shared building list (src/constants/lodgingConstants.js)
   in the row shape this tab renders: buildings with rooms list floors of
   rooms; Hebron Bunks lists its bunk sections as floors without rooms;
   Camping lists Tent and RV as rooms.
========================================================= */

const housingRows = LODGING_BUILDINGS.map((building) => {
  const row = {
    id: building.id,
    field: building.field,
    roomName: building.label,
    housingArea: building.housingArea,
    roomCategory: building.roomCategory,
    image: building.image,
    aliases: building.aliases,
  };

  if (building.floors) {
    row.floors = building.floors.map((floor) => ({
      id: floor.key.toLowerCase(),
      label: floor.label,
      rooms: floor.rooms.map((room) => ({
        id: room.label.toLowerCase().replace(/\s+/g, "-"),
        label: room.label,
        field: room.key,
      })),
    }));
  } else if (building.areas && building.id === "camping") {
    row.rooms = building.areas.map((area) => ({
      id: area.key,
      label: area.label,
      field: area.key,
    }));
  } else if (building.areas) {
    row.floors = building.areas.map((area) => ({
      id: area.key,
      field: area.key,
      label: area.label,
    }));
  }

  return row;
});

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
  return getLegacyLodgingText(booking).toLowerCase();
}

function getInitialKnownUsage(booking) {
  const details =
    booking?.rentalFormDetails || {};
  const housingValues =
    getInitialHousingState(booking);
  const savedUsage =
    details.housingUsage || {};
  // Imported text only suggests buildings until the tab has been saved.
  const detectedBuildingIds = isHousingAuthoritative(booking)
    ? new Set()
    : new Set(
        getBookingLodgingAssignments(booking).map(
          (assignment) => assignment.buildingId
        )
      );
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
    // Staff unticked this building on a previous save (AUDIT-007).
    const explicitlyMarkedUnused =
      savedUsage[row.field] === false;
    const detectedFromImport =
      detectedBuildingIds.has(row.id);
    result[row.field] =
      hasKnownCount ||
      explicitlyMarkedUsed ||
      (!explicitlyMarkedUnused && detectedFromImport);
  });
  return result;
}

function hasGenericHebronAssignment(booking) {
  if (isHousingAuthoritative(booking)) {
    return false;
  }
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
      // Floors with individual rooms
      if (floor.rooms) {
        return (
          total +
          getRoomTotal(
            floor,
            values
          )
        );
      }
      // Floors without rooms
      const value =
        Number(
          values?.[floor.field] || 0
        );
      return (
        total +
        (
          Number.isFinite(value)
            ? value
            : 0
        )
      );
    },
    0
  );
}

function getRoomTotal(floor, values) {
  if (!Array.isArray(floor.rooms)) {
    return 0;
  }
  return floor.rooms.reduce(
    (total, room) => {
      const value = Number(
        values?.[room.field] || 0
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
}

function rowHasFloorBreakdown(row, values) {
  if (Array.isArray(row.rooms)) {
    return row.rooms.some((room)=>{
      const value =
        Number(
          values?.[room.field] || 0
        );
      return value > 0;
    });
  }
  if (!Array.isArray(row.floors)) {
    return false;
  }
  return row.floors.some((floor)=>{
    if (floor.rooms) {
      return floor.rooms.some((room)=>{
        const value =
          Number(
            values?.[room.field] || 0
          );
        return value > 0;
      });
    }
    const value =
      Number(
        values?.[floor.field] || 0
      );
    return value > 0;
  });
}

function getInitialExpandedHousingRows(
  booking
) {
  const values =
    getInitialHousingState(booking);
  const result = {};
  housingRows.forEach((row) => {
    if (
      Array.isArray(row.floors) ||
      Array.isArray(row.rooms)
    ) {
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
    if (
      Array.isArray(row.floors) ||
      Array.isArray(row.rooms)
    ) {
      if (row.rooms) {
        row.rooms.forEach((room)=>{
          state[room.field] =
            cleanNumberValue(
              details[room.field]
            );
        });
      }
      row.floors?.forEach((floor)=>{
        if (floor.rooms) {
          floor.rooms.forEach((room)=>{
            state[room.field] =
              cleanNumberValue(
                details[room.field]
              );
          });
        } else {
          state[floor.field] =
            cleanNumberValue(
              details[floor.field]
            );
        }
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
      (total,row)=>{
        if(Array.isArray(row.floors)){
          return (
            total +
            getFloorTotal(
              row,
              housingValues
            )
          );
        }
        if(Array.isArray(row.rooms)){
          return (
            total +
            getRoomTotal(
              {
                rooms: row.rooms
              },
              housingValues
            )
          );
        }
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
    },[housingValues]);
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
  const updateRoomValue = (
    row,
    floor,
    roomField,
    value
  ) => {
    if (
      value !== "" &&
      !/^\d+$/.test(value)
    ) {
      return;
    }
    /* Keep the building total in sync so other views read the room sum. */
    setHousingValues(
      (currentValues)=>{
        const nextValues = {
          ...currentValues,
          [roomField]:value
        };
        const roomTotal =
          Array.isArray(row.floors)
            ? getFloorTotal(row, nextValues)
            : getRoomTotal(row, nextValues);
        nextValues[row.field] =
          rowHasFloorBreakdown(row, nextValues)
            ? String(roomTotal)
            : "";
        return nextValues;
      }
    );
    const numericValue =
      Number(value);
    if(
      value !== "" &&
      Number.isFinite(numericValue) &&
      numericValue > 0
    ){
      setKnownUsage(
        (currentUsage)=>({
          ...currentUsage,
          [row.field]:true
        })
      );
    }
  };
  const clearFloorBreakdown = (row) => {
    setHousingValues(
      (currentValues)=>{
        const nextValues = {
          ...currentValues,
        };
        if (Array.isArray(row.rooms)) {
          row.rooms.forEach((room)=>{
            nextValues[room.field] = "";
          });
        }
        row.floors?.forEach((floor)=>{
          if(floor.rooms){
            floor.rooms.forEach((room)=>{
              nextValues[room.field] = "";
            });
          }
          else {
            nextValues[floor.field] = "";
          }
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
          if (
            Array.isArray(row.floors) ||
            Array.isArray(row.rooms)
          ) {
            if(row.rooms){
              row.rooms.forEach((room)=>{
                nextValues[room.field] = "";
              });
            }
            row.floors?.forEach((floor)=>{
              if(floor.rooms){
                floor.rooms.forEach((room)=>{
                  nextValues[room.field] = "";
                });
              }
              else {
                nextValues[floor.field] = "";
              }
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
      console.error("BookingHousingTab: onSaveBooking is missing");
      alert("Save function is not connected");
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
        linenSets,
        booking?.rentalFormDetails?.linenPieces
      );
    const previousDetails = booking.rentalFormDetails || {};
    /*
      The first Housing save on an imported booking keeps the sheet's
      lodging text as a reference note; from then on this tab is the
      lodging record and re-imports leave it alone (AUDIT-007, Q-024).
    */
    const importedLodgingNote =
      previousDetails.importedLodgingText ||
      (!isHousingAuthoritative(booking) && !isStaffBookingRecord(booking)
        ? getLegacyLodgingText(booking)
        : "");
    const updatedRentalFormDetails = {
      ...previousDetails,
      ...(importedLodgingNote
        ? { importedLodgingText: importedLodgingNote }
        : {}),
      housingSavedAt: new Date().toISOString(),
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
          lodgingBethelUpperRoom1:
            housingValues.lodgingBethelUpperRoom1 || "",
          lodgingBethelUpperRoom2:
            housingValues.lodgingBethelUpperRoom2 || "",
          lodgingBethelMiddleRoom3:
            housingValues.lodgingBethelMiddleRoom3 || "",
          lodgingBethelMiddleRoom4:
            housingValues.lodgingBethelMiddleRoom4 || "",
          lodgingBethelMiddleRoom5:
            housingValues.lodgingBethelMiddleRoom5 || "",
          lodgingBethelMiddleRoom6:
            housingValues.lodgingBethelMiddleRoom6 || "",
          lodgingBethelLowerRoom7:
            housingValues.lodgingBethelLowerRoom7 || "",
          lodgingBethelLowerRoom8:
            housingValues.lodgingBethelLowerRoom8 || "",
          lodgingBethelLowerRoom9:
            housingValues.lodgingBethelLowerRoom9 || "",
          lodgingBethelLowerRoom10:
            housingValues.lodgingBethelLowerRoom10 || "",
          lodgingBethelLowerRoom11:
            housingValues.lodgingBethelLowerRoom11 || "",
      lodgingHebronThird:
        housingValues.lodgingHebronThird || "",
      lodgingHebronBunks:
        housingValues.lodgingHebronBunks || "",
      lodgingHebronBunksMens:
        housingValues.lodgingHebronBunksMens || "",
      lodgingHebronBunksWomens:
        housingValues.lodgingHebronBunksWomens || "",
      lodgingDothan:
        housingValues.lodgingDothan || "",
      lodgingDothanUpper:
        housingValues.lodgingDothanUpper || "",
      lodgingDothanMiddle:
        housingValues.lodgingDothanMiddle || "",
          lodgingDothanUpperRoom1:
            housingValues.lodgingDothanUpperRoom1 || "",
          lodgingDothanUpperRoom2:
            housingValues.lodgingDothanUpperRoom2 || "",
          lodgingDothanMiddleRoom3:
            housingValues.lodgingDothanMiddleRoom3 || "",
          lodgingDothanMiddleRoom4:
            housingValues.lodgingDothanMiddleRoom4 || "",
          lodgingDothanMiddleRoom5:
            housingValues.lodgingDothanMiddleRoom5 || "",
          lodgingDothanMiddleRoom6:
            housingValues.lodgingDothanMiddleRoom6 || "",
      lodgingAjalon:
        housingValues.lodgingAjalon || "",
      lodgingCapernaum:
        housingValues.lodgingCapernaum || "",
      lodgingGuestHouse:
        housingValues.lodgingGuestHouse || "",
      lodgingCamping:
        housingValues.lodgingCamping || "",
      lodgingCampingTent:
        housingValues.lodgingCampingTent || "",
      lodgingCampingRV:
        housingValues.lodgingCampingRV || "",
      linenOption,
      linenSets:
        linenOption === "No"
          ? ""
          : linenSets,
    };
    const updatedBooking = recordStaffEdits(
      booking,
      {
        ...booking,
        buildingsRooms,
        // Kept equal to the summary so no reader sees stale imported text.
        roomName: buildingsRooms || "Unassigned",
        linenSets: linenSummary,
        rentalFormDetails:
          updatedRentalFormDetails,
      },
      [],
      { forceKeys: ["lodging", "linenSets"] }
    );
    try {
        await onSaveBooking(updatedBooking);
        setIsEditing(false);
      } catch (error) {
        // The save handler explains the failure; the edits stay on screen.
        console.error(
          "Failed saving housing:",
          error
        );
      }
  };

  /* =======================================================
     LEGACY / IMPORTED HOUSING TEXT
     Imported spreadsheet records may have room text but
     not the newer rentalFormDetails fields.
  ======================================================= */

  const housingIsAuthoritative =
    isHousingAuthoritative(booking);
  const legacyHousingText = housingIsAuthoritative
    ? String(
        booking?.rentalFormDetails?.importedLodgingText || ""
      ).trim()
    : String(
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
                    Array.isArray(row.floors) ||
                    Array.isArray(row.rooms)
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
                    Array.isArray(row.floors)
                      ? getFloorTotal(
                          row,
                          housingValues
                        )
                      : Array.isArray(row.rooms)
                        ? getRoomTotal(
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
                                  Click for room breakdown
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
                                From breakdown
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
                        ) : hasFloorBreakdown ? (
                          <div className="booking-housing-assigned-total">
                            <strong className="booking-housing-assigned-count">
                              {floorTotal}
                            </strong>
                            <small>
                              Room split saved
                            </small>
                          </div>
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
                            <div
                              className="booking-housing-floor-grid"
                              style={{
                                "--floor-count":
                                  row.floors
                                    ? row.floors.length
                                    : 1,
                              }}
                            >
                              {(
                                row.floors ||
                                [
                                  {
                                    id: row.id,
                                    label: row.roomName,
                                    rooms: row.rooms
                                  }
                                ]
                              ).map(
                                (floor)=>{
                                const floorTotal =
                                  getRoomTotal(
                                    floor,
                                    housingValues
                                  );
                                return (
                                <div
                                className="booking-housing-floor-field"
                                key={floor.id}
                                >
                                <div className="booking-housing-floor-header">
                                <strong>
                                {floor.label}
                                </strong>
                                <span>
                                {floorTotal} guests
                                </span>
                                </div>
                                <div className="booking-housing-room-list">
                                  {floor.rooms?.map(
                                    (room) => {
                                      const roomValue =
                                        housingValues[
                                          room.field
                                        ] || "";
                                      return (
                                        <div
                                          className="booking-housing-room-row"
                                          key={room.id}
                                        >
                                          <span>
                                            {room.label}
                                          </span>
                                          {isEditing ? (
                                            <input
                                              type="number"
                                              min="0"
                                              value={roomValue}
                                              placeholder="0"
                                              onChange={(event) =>
                                                updateRoomValue(
                                                  row,
                                                  floor,
                                                  room.field,
                                                  event.target.value
                                                )
                                              }
                                            />
                                          ) : (
                                            <strong>
                                              {roomValue || "0"}
                                            </strong>
                                          )}
                                        </div>
                                      );
                                    }
                                  )}
                                  {!floor.rooms && floor.field && (
                                    <div
                                      className="booking-housing-room-row"
                                      key={`${floor.id}-assigned`}
                                    >
                                      <span>
                                        Assigned Guests
                                      </span>
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          min="0"
                                          value={
                                            housingValues[
                                              floor.field
                                            ] || ""
                                          }
                                          placeholder="0"
                                          onChange={(event) =>
                                            updateFloorValue(
                                              row,
                                              floor.field,
                                              event.target.value
                                            )
                                          }
                                        />
                                      ) : (
                                        <strong>
                                          {housingValues[
                                            floor.field
                                          ] || "0"}
                                        </strong>
                                      )}
                                    </div>
                                  )}
                                </div>
                                </div>
                                )
                                }
                                )}
                              <div className="booking-housing-floor-total-card">
                                <span>
                                  Total
                                </span>
                                <strong>
                                  {(
                                    row.floors ||
                                    [
                                      {
                                        rooms: row.rooms
                                      }
                                    ]
                                  ).reduce(
                                    (total, floor) =>
                                      total +
                                      (floor.rooms
                                        ? getRoomTotal(
                                            floor,
                                            housingValues
                                          )
                                        : Number(
                                            housingValues[floor.field] || 0
                                          )),
                                    0
                                  )}
                                </strong>
                              </div>
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
        (housingIsAuthoritative ||
          !booking?.rentalFormDetails) && (
          <section className="dashboard-card booking-housing-legacy-card">
            <small>
              {housingIsAuthoritative
                ? "Imported lodging note"
                : "Imported Housing Record"}
            </small>
            <strong>
              {legacyHousingText}
            </strong>
            <p>
              {housingIsAuthoritative
                ? "The lodging text from the original spreadsheet, kept for reference. The assignments above are the lodging record."
                : "This booking came from an older or imported record, so its original housing text is shown here."}
            </p>
          </section>
        )}
    </div>
  );
}
