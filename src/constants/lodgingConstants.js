/*
  The one list of lodging buildings (AUDIT-031, Q-025).

  Every screen that shows or counts lodging reads this list: Create Booking,
  the Housing tab, the Lodging Calendar, the Dashboard home, the Booking
  Overview and Reports. Capacities are the values the app already used
  (they agreed in both places they appeared); none were invented.

  Ajalon is the correct spelling. "Aijalon" and "Capurnum" are kept only as
  recognized misspellings so older imported text still matches; they are
  never displayed. The old "Rustic Cottage 1–4" entries were the same
  buildings as Ajalon and Capernaum and are gone.

  `rooms` are individual rooms: two groups in the same room on the same
  night is a conflict. `areas` are shared spaces inside a building (bunk
  sections, tent/RV sites) where several groups can stay at once.
  `calendarGroup` is how the Lodging Calendar groups buildings (both Hebron
  areas show under one Hebron).
*/

function rooms(buildingPrefix, floorKey, floorLabel, numbers) {
  return numbers.map((number) => ({
    key: `${buildingPrefix}${floorKey}Room${number}`,
    label: `Room ${number}`,
    floorKey,
    floorLabel,
  }));
}

export const LODGING_BUILDINGS = Object.freeze([
  {
    id: "bethel",
    field: "lodgingBethel",
    label: "Bethel",
    capacity: "70",
    housingArea: "Bethel Lodge",
    roomCategory: "Family Style Rooms",
    image: "/lodges/Bethel.webp",
    calendarGroup: "bethel",
    aliases: ["bethel"],
    floors: [
      { key: "Upper", label: "Upper Floor", rooms: rooms("lodgingBethel", "Upper", "Upper Floor", [1, 2]) },
      { key: "Middle", label: "Middle Floor", rooms: rooms("lodgingBethel", "Middle", "Middle Floor", [3, 4, 5, 6]) },
      { key: "Lower", label: "Lower Floor", rooms: rooms("lodgingBethel", "Lower", "Lower Floor", [7, 8, 9, 10, 11]) },
    ],
  },
  {
    id: "hebron-third",
    field: "lodgingHebronThird",
    label: "Hebron 3rd Floor",
    capacity: "14",
    housingArea: "Main Lodge",
    roomCategory: "Private Rooms",
    image: "/lodges/May-2025-Hebron.jpg",
    calendarGroup: "hebron",
    aliases: ["hebron 3rd floor", "hebron third floor", "hebron 3rd", "hebron third"],
  },
  {
    id: "hebron-bunks",
    field: "lodgingHebronBunks",
    label: "Hebron Bunks",
    capacity: "52",
    housingArea: "Main Lodge",
    roomCategory: "Dormitory / Bunks",
    image: "/lodges/May-2025-Hebron.jpg",
    calendarGroup: "hebron",
    aliases: ["hebron bunks", "hebron bunk"],
    areas: [
      { key: "lodgingHebronBunksMens", label: "Men's Bunks" },
      { key: "lodgingHebronBunksWomens", label: "Women's Bunks" },
    ],
  },
  {
    id: "dothan",
    field: "lodgingDothan",
    label: "Dothan",
    capacity: "21",
    housingArea: "Dothan Lodge",
    roomCategory: "Small Group Lodge",
    image: "/lodges/Dothan.webp",
    calendarGroup: "dothan",
    aliases: ["dothan"],
    floors: [
      { key: "Upper", label: "Upper Floor", rooms: rooms("lodgingDothan", "Upper", "Upper Floor", [1, 2]) },
      { key: "Middle", label: "Middle Floor", rooms: rooms("lodgingDothan", "Middle", "Middle Floor", [3, 4, 5, 6]) },
    ],
  },
  {
    id: "ajalon",
    field: "lodgingAjalon",
    label: "Ajalon",
    capacity: "5–8",
    housingArea: "Cottage",
    roomCategory: "Cottage",
    image: "/lodges/Ajalon.png",
    calendarGroup: "ajalon",
    aliases: ["ajalon", "aijalon", "rustic: ajalon", "rustic ajalon"],
  },
  {
    id: "capernaum",
    field: "lodgingCapernaum",
    label: "Capernaum",
    capacity: "5",
    housingArea: "Cottage",
    roomCategory: "Cottage",
    image: "/lodges/Capurnum.webp",
    calendarGroup: "capernaum",
    aliases: ["capernaum", "capurnum", "rustic: capernaum", "rustic capernaum"],
  },
  {
    id: "guest-house",
    field: "lodgingGuestHouse",
    label: "Guest House",
    capacity: "9–12",
    housingArea: "Guest House",
    roomCategory: "House Style Lodging",
    image: "/lodges/Guest-House.webp",
    calendarGroup: "guest-house",
    aliases: ["guest house", "guesthouse", "gh"],
  },
  {
    id: "camping",
    field: "lodgingCamping",
    label: "Camping",
    capacity: "",
    housingArea: "Outdoor Areas",
    roomCategory: "Tent / RV Sites",
    image: "",
    calendarGroup: "camping",
    aliases: ["camping", "tent", "tents", "rv"],
    areas: [
      { key: "lodgingCampingTent", label: "Tent" },
      { key: "lodgingCampingRV", label: "RV" },
    ],
  },
]);

export const LODGING_CALENDAR_GROUPS = Object.freeze([
  { id: "bethel", label: "Bethel", image: "/lodges/Bethel.webp", colorClass: "lodging-bethel", eventClass: "calendar-lodging-bethel" },
  { id: "hebron", label: "Hebron", image: "/lodges/May-2025-Hebron.jpg", colorClass: "lodging-hebron", eventClass: "calendar-lodging-hebron" },
  { id: "dothan", label: "Dothan", image: "/lodges/Dothan.webp", colorClass: "lodging-dothan", eventClass: "calendar-lodging-dothan" },
  { id: "ajalon", label: "Ajalon", image: "/lodges/Ajalon.png", colorClass: "lodging-ajalon", eventClass: "calendar-lodging-ajalon" },
  { id: "capernaum", label: "Capernaum", image: "/lodges/Capurnum.webp", colorClass: "lodging-capernaum", eventClass: "calendar-lodging-capernaum" },
  { id: "guest-house", label: "Guest House", image: "/lodges/Guest-House.webp", colorClass: "lodging-guest-house", eventClass: "calendar-lodging-guest-house" },
  { id: "camping", label: "Camping", image: "", colorClass: "lodging-camping", eventClass: "calendar-lodging-camping" },
]);

// Generic "Hebron" text (no floor named) belongs to the Hebron group only.
export const HEBRON_GENERIC_PATTERN = /\bhebron\b|\bmain lodge\b/i;

export function getLodgingBuilding(id) {
  return LODGING_BUILDINGS.find((building) => building.id === id) || null;
}

export function getLodgingBuildingRooms(building) {
  return (building?.floors || []).flatMap((floor) => floor.rooms || []);
}

// Every rentalFormDetails key that holds lodging for one building.
export function getLodgingBuildingFieldKeys(building) {
  return [
    building.field,
    ...(building.floors || []).map((floor) => `${building.field}${floor.key}`),
    ...getLodgingBuildingRooms(building).map((room) => room.key),
    ...(building.areas || []).map((area) => area.key),
  ];
}

// Upper number of a capacity like "9–12"; null when none is recorded.
export function getLodgingCapacityLimit(building) {
  const numbers = String(building?.capacity || "").match(/\d+/g);
  return numbers ? Math.max(...numbers.map(Number)) : null;
}
