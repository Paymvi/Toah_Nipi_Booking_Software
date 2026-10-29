import {
  HEBRON_GENERIC_PATTERN,
  LODGING_BUILDINGS,
  LODGING_CALENDAR_GROUPS,
  getLodgingBuildingRooms,
  getLodgingCapacityLimit,
} from "../constants/lodgingConstants.js";
import { getBookingDetails } from "./bookingFields.js";
import { isHousingAuthoritative } from "./masterImportMerge.js";

/*
  Shared lodging logic (AUDIT-005, AUDIT-007, AUDIT-031, AUDIT-037).

  - One summary builder for Create Booking and the Housing tab.
  - One reader for "which buildings and rooms does this booking use".
    Once the Housing tab has been saved its values are the lodging record;
    imported text is only read for bookings never saved there.
  - Lodging is counted by night: a group leaving on June 3 does not hold
    its building on the night of June 3.
  - Two groups in one building is fine. A conflict is only reported when
    the saved assignments put two groups in the same room on the same
    night. Where room detail is missing the result says so instead.
*/

function toCount(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/* ---------------------------------------------------------
   Summary text for the buildings_rooms column
--------------------------------------------------------- */

/*
  One segment per building, separated by "; ":
    Bethel: Upper Floor - Room 1: 3, Room 2: 4 / Middle Floor - Room 3: 2
    Hebron Bunks: Men's Bunks: 10, Women's Bunks: 12
    Camping: Tent: 2, RV: 1
    Guest House: 9
    Dothan: count unknown
  Room or area detail is used only when it adds up to the building total,
  so an edited total is never hidden behind stale room numbers.
*/
export function buildLodgingSummary(values = {}, knownUsage = {}) {
  return LODGING_BUILDINGS.map((building) => {
    const total = toCount(values[building.field]);
    let detailSum = 0;

    const floorParts = (building.floors || [])
      .map((floor) => {
        const roomText = floor.rooms
          .map((room) => {
            const count = toCount(values[room.key]);
            detailSum += count;
            return count ? `${room.label}: ${count}` : "";
          })
          .filter(Boolean)
          .join(", ");
        return roomText ? `${floor.label} - ${roomText}` : "";
      })
      .filter(Boolean);

    const areaParts = (building.areas || [])
      .map((area) => {
        const count = toCount(values[area.key]);
        detailSum += count;
        return count ? `${area.label}: ${count}` : "";
      })
      .filter(Boolean);

    const detail = [floorParts.join(" / "), areaParts.join(", ")].filter(Boolean).join(" / ");

    if (detail && (!total || total === detailSum)) {
      return `${building.label}: ${detail}`;
    }
    if (total) {
      return `${building.label}: ${total}`;
    }
    if (knownUsage[building.field]) {
      return `${building.label}: count unknown`;
    }
    return "";
  })
    .filter(Boolean)
    .join("; ");
}

/* ---------------------------------------------------------
   Reading a booking's lodging
--------------------------------------------------------- */

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHasAlias(text, alias) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`).test(text);
}

// "Bethel: 0" or "Dothan: none" names a building without using it.
function segmentHasAssignment(segment) {
  const text = normalizeText(segment);
  if (!text) return false;
  if (/:\s*(?:0|0\.0+|none|no|n\/a|unassigned|not assigned)\s*$/.test(text)) return false;
  const numeric = text.match(/:\s*(\d+(?:\.\d+)?)\s*$/);
  return numeric ? Number(numeric[1]) > 0 : true;
}

function segmentCount(segment) {
  const match = normalizeText(segment).match(/:\s*(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

// Imported or free text, for bookings the Housing tab has not taken over.
export function getLegacyLodgingText(booking) {
  return [...new Set(
    [booking?.buildingsRooms, booking?.roomName]
      .map((value) => String(value ?? "").trim())
      .filter((value) => value && !/^(?:unassigned|no room)$/i.test(value))
  )].join("; ");
}

function getStructuredAssignments(booking) {
  const details = getBookingDetails(booking);
  const usage = details.housingUsage && typeof details.housingUsage === "object" ? details.housingUsage : {};

  return LODGING_BUILDINGS.map((building) => {
    const rooms = getLodgingBuildingRooms(building)
      .map((room) => ({
        key: room.key,
        label: `${room.floorLabel} ${room.label}`,
        count: toCount(details[room.key]),
      }))
      .filter((room) => room.count > 0);
    const areas = (building.areas || [])
      .map((area) => ({ key: area.key, label: area.label, count: toCount(details[area.key]) }))
      .filter((area) => area.count > 0);
    const detailTotal = [...rooms, ...areas].reduce((sum, entry) => sum + entry.count, 0);
    const total = toCount(details[building.field]) || detailTotal;

    if (!total && usage[building.field] !== true) return null;

    return {
      buildingId: building.id,
      label: building.label,
      calendarGroup: building.calendarGroup,
      count: total || null,
      rooms,
      areas,
      hasRoomDetail: rooms.length > 0,
      source: "housing",
    };
  }).filter(Boolean);
}

function getTextAssignments(text) {
  const segments = String(text || "")
    .split(/[;\n|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter(segmentHasAssignment);
  const normalizedSegments = segments.map(normalizeText);
  const assignments = [];

  LODGING_BUILDINGS.forEach((building) => {
    const index = normalizedSegments.findIndex((segment) =>
      building.aliases.some((alias) => textHasAlias(segment, alias))
    );
    if (index === -1) return;
    assignments.push({
      buildingId: building.id,
      label: building.label,
      calendarGroup: building.calendarGroup,
      count: segmentCount(segments[index]),
      rooms: [],
      areas: [],
      hasRoomDetail: false,
      source: "text",
    });
  });

  const namesHebronArea = assignments.some((entry) => entry.calendarGroup === "hebron");
  if (!namesHebronArea && normalizedSegments.some((segment) => HEBRON_GENERIC_PATTERN.test(segment))) {
    assignments.push({
      buildingId: "hebron",
      label: "Hebron (area not specified)",
      calendarGroup: "hebron",
      count: null,
      rooms: [],
      areas: [],
      hasRoomDetail: false,
      source: "text",
    });
  }

  return assignments;
}

/*
  Buildings (and rooms, where recorded) a booking uses. After the Housing
  tab has been saved only its values count; otherwise saved counts are
  combined with whatever the imported text names.
*/
export function getBookingLodgingAssignments(booking) {
  const structured = getStructuredAssignments(booking);
  if (isHousingAuthoritative(booking)) return structured;

  const known = new Set(structured.map((entry) => entry.buildingId));
  const fromText = getTextAssignments(getLegacyLodgingText(booking)).filter(
    (entry) => !known.has(entry.buildingId)
  );
  return [...structured, ...fromText];
}

export function getBookingCalendarGroups(booking) {
  const groups = new Set(getBookingLodgingAssignments(booking).map((entry) => entry.calendarGroup));
  return LODGING_CALENDAR_GROUPS.filter((group) => groups.has(group.id)).map((group) => group.id);
}

// Text for the Overview and the Housing tab reference note.
export function getBookingLodgingDisplayText(booking) {
  if (isHousingAuthoritative(booking)) {
    return String(booking?.buildingsRooms || "").trim() || "Unassigned";
  }
  return getLegacyLodgingText(booking) || "Unassigned";
}

/* ---------------------------------------------------------
   Nights and conflicts
--------------------------------------------------------- */

function addDaysToKey(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

/*
  Nights a stay occupies: arrival up to, not including, departure. A stay
  with no departure date is treated as one night. A same-day visit uses
  no night.
*/
export function getLodgingNights(booking) {
  const start = String(booking?.startDate || "").slice(0, 10);
  const end = String(booking?.endDate || "").slice(0, 10);
  if (!isDateKey(start)) return [];
  if (!isDateKey(end)) return [start];
  const nights = [];
  for (let night = start; night < end && nights.length < 400; night = addDaysToKey(night, 1)) {
    nights.push(night);
  }
  return nights;
}

// Nights covered by a lookup range; a single date means that one night.
export function getRequestedNights(startDate, endDate) {
  if (!isDateKey(startDate)) return [];
  if (!isDateKey(endDate) || endDate <= startDate) return [startDate];
  return getLodgingNights({ startDate, endDate });
}

function sharedNights(firstNights, secondNights) {
  const second = new Set(secondNights);
  return firstNights.filter((night) => second.has(night));
}

/*
  For a date range, describes each Lodging Calendar building group:
    available    nobody stays there
    in-use       one group
    shared       several groups; no room conflict found in the saved rooms
    conflict     two groups in the same room on the same night
  `notes` explain what could not be checked (missing room detail) and
  nights where known counts exceed the building's recorded capacity.
*/
export function describeLodgingAvailability(bookings, startDate, endDate) {
  const requested = getRequestedNights(startDate, endDate);

  const stays = bookings
    .map((booking) => {
      const nights = sharedNights(getLodgingNights(booking), requested);
      return nights.length
        ? { booking, nights, assignments: getBookingLodgingAssignments(booking) }
        : null;
    })
    .filter(Boolean);

  return LODGING_CALENDAR_GROUPS.map((group) => {
    const groupStays = stays
      .map((stay) => ({
        ...stay,
        assignments: stay.assignments.filter((entry) => entry.calendarGroup === group.id),
      }))
      .filter((stay) => stay.assignments.length > 0);

    const conflicts = [];
    const notes = [];

    for (let first = 0; first < groupStays.length; first += 1) {
      for (let second = first + 1; second < groupStays.length; second += 1) {
        const a = groupStays[first];
        const b = groupStays[second];
        const nights = sharedNights(a.nights, b.nights);
        if (!nights.length) continue;

        a.assignments.forEach((entryA) => {
          const entryB = b.assignments.find((entry) => entry.buildingId === entryA.buildingId);
          if (!entryB) return;

          const roomsB = new Set(entryB.rooms.map((room) => room.key));
          entryA.rooms
            .filter((room) => roomsB.has(room.key))
            .forEach((room) => {
              conflicts.push({
                buildingLabel: entryA.label,
                roomLabel: room.label,
                nights,
                bookings: [a.booking, b.booking],
              });
            });

          const building = LODGING_BUILDINGS.find((item) => item.id === entryA.buildingId);
          const buildingHasRooms = getLodgingBuildingRooms(building).length > 0;
          const missingDetail = buildingHasRooms
            ? !entryA.hasRoomDetail || !entryB.hasRoomDetail
            : !building?.areas;

          if (missingDetail) {
            notes.push(
              `${entryA.label}: ${a.booking.organizationName || "A group"} and ` +
                `${b.booking.organizationName || "another group"} overlap, but room detail is not ` +
                `recorded for both, so a room clash cannot be ruled out.`
            );
          }
        });
      }
    }

    LODGING_BUILDINGS.filter((building) => building.calendarGroup === group.id).forEach((building) => {
      const limit = getLodgingCapacityLimit(building);
      if (!limit) return;
      requested.forEach((night) => {
        const onNight = groupStays.filter((stay) => stay.nights.includes(night));
        const entries = onNight
          .map((stay) => stay.assignments.find((entry) => entry.buildingId === building.id))
          .filter(Boolean);
        if (entries.length < 2 || entries.some((entry) => !entry.count)) return;
        const total = entries.reduce((sum, entry) => sum + entry.count, 0);
        if (total > limit) {
          notes.push(`${building.label}: ${total} guests on the night of ${night}, above its recorded capacity of ${building.capacity}.`);
        }
      });
    });

    const status = conflicts.length
      ? "conflict"
      : groupStays.length > 1
        ? "shared"
        : groupStays.length === 1
          ? "in-use"
          : "available";

    return {
      ...group,
      status,
      stays: groupStays,
      conflicts,
      notes: [...new Set(notes)],
    };
  });
}

/*
  Linen text for the linen_sets column, shared by Create Booking and the
  Housing tab. Requests for individual pieces are included (AUDIT-040).
*/
export function buildLinenSummary(linenOption, linenSets, linenPieces) {
  if (linenOption === "No") return "No";
  const parts = [];
  if (String(linenSets || "").trim()) parts.push(`${linenSets} full set(s)`);
  if (String(linenPieces || "").trim()) parts.push(`${linenPieces} piece(s)`);
  return parts.length ? `${linenOption} - ${parts.join(", ")}` : linenOption || "";
}
