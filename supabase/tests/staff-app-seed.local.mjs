// Seeds a LOCAL Supabase stack with fictional groups and accounts for trying
// the staff app in a browser. Dates are relative to today in camp time.
// Safe to run again: it replaces its own rows (ids start "demo-").
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_SEEDER_KEY=... \
//   node supabase/tests/staff-app-seed.local.mjs
//
// Accounts (password for all: Local-demo-1!):
//   office@example.test  admin       cook@example.test   limited + kitchen
//   crew@example.test    limited     viewer@example.test viewer
import { createClient } from "@supabase/supabase-js";

import { getLocalDate } from "../../src/utils/portalEmail.js";

const url = process.env.LOCAL_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error("LOCAL stack only.");
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seed = createClient(url, process.env.LOCAL_SEEDER_KEY, options);
const authAdmin = createClient(url, process.env.LOCAL_SERVICE_ROLE_KEY, options);
const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
};

const PASSWORD = "Local-demo-1!";
const today = getLocalDate(new Date());
const day = (offset) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const label = (offset) =>
  new Date(`${day(offset)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function account(email, fullName, profile) {
  const { users } = await must(authAdmin.auth.admin.listUsers({ perPage: 1000 }));
  let user = users.find((entry) => entry.email === email);
  if (!user) user = (await must(authAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }))).user;
  await must(seed.from("staff_profiles").upsert({ user_id: user.id, email, full_name: fullName, is_active: true, departments: [], ...profile }));
  return user;
}

await account("office@example.test", "Office (fictional)", { role: "admin" });
await account("viewer@example.test", "Viewer (fictional)", { role: "viewer" });
await account("cook@example.test", "Cook (fictional)", { role: "limited", departments: ["kitchen"] });
await account("crew@example.test", "Grounds crew (fictional)", { role: "limited" });

const schedule = (entries) => Object.fromEntries(entries.map(([offset, meals]) => [day(offset), {
  breakfast: meals.includes("B"), lunch: meals.includes("L"), dinner: meals.includes("D"),
}]));

const base = (id, overrides, details) => ({
  id: `demo-${id}`,
  source_type: "Staff Booking",
  status: "Confirmed",
  waitlist: "No",
  contact_name: "Private Contact (fictional)",
  email: "private@example.test",
  phone: "555-0100",
  notes: "Private office note (fictional)",
  guest_rate: "99",
  ...overrides,
  raw_data: { rentalFormDetails: { lodgingCost: "1234", ...details } },
});

const rows = [
  base("maple", {
    organization_name: "Maple Grove Quilting Circle",
    start_date: day(-2), end_date: day(0), attendee_count: "16",
    food_allergies: "1 - Dairy free",
    buildings_rooms: "Dothan: 16",
  }, {
    actualAdultGuests: "16", approxTotalGuests: "18", arrivalTime: "16:00", departureTime: "13:00",
    breakfastTime: "08:00", lunchTime: "12:00", dinnerTime: "18:00", lodgingDothan: "16", housingUsage: { lodgingDothan: true }, housingSavedAt: "2026-11-01T00:00:00Z",
    mealSchedule: schedule([[-2, "D"], [-1, "BLD"], [0, "BL"]]),
  }),
  base("cedar", {
    organization_name: "Cedar Hill Church Men's Retreat",
    start_date: day(0), end_date: day(2), attendee_count: "40",
    food_allergies: "3 - Gluten free; 1 - Vegetarian; 1 - Tree nut allergy; Additional notes: Tree nut allergy severity not yet confirmed with the group leader. They asked whether the granola and the Saturday dessert can be nut-free; the leader will call back with details after checking with the guest's family.",
    buildings_rooms: "Bethel: 20; Dothan: 22",
    activities: "",
  }, {
    approxTotalGuests: "40", arrivalTime: "17:30", departureTime: "13:00",
    breakfastTime: "08:00", lunchTime: "12:00", dinnerTime: "18:00",
    lodgingBethel: "20", lodgingDothan: "22", housingUsage: { lodgingBethel: true, lodgingDothan: true }, housingSavedAt: "2026-11-01T00:00:00Z",
    mealSchedule: schedule([[0, "D"], [1, "BLD"], [2, "BL"]]),
    mealNotes: "Coffee and tea out by 7:30 AM Saturday. Group will eat Sunday lunch in the dining hall before leaving.",
    dayCamperCount: "6", dayCamperMeals: "2",
    activities: [{ date: day(1), time: "14:00", activity: "Low ropes course" }],
    facilities: [{ date: day(0), time: "16:00", task: "Projector in Bethel meeting room", assignedTo: "Maintenance (fictional)", notes: "HDMI cable" }],
  }),
  base("northfield", {
    organization_name: "Northfield Youth Group",
    start_date: day(1), end_date: day(2), attendee_count: "28",
    food_allergies: "",
    buildings_rooms: "Hebron Bunks: 28",
  }, {
    approxTotalGuests: "28", arrivalTime: "11:30", departureTime: "10:00",
    breakfastTime: "08:00", lunchTime: "12:00", dinnerTime: "18:00",
    lodgingHebronBunks: "28", housingUsage: { lodgingHebronBunks: true }, housingSavedAt: "2026-11-01T00:00:00Z",
    mealSchedule: schedule([[1, "LD"], [2, "B"]]),
  }),
  base("lakeside", {
    source_type: "Master 2026",
    organization_name: "Lakeside Seniors Fellowship",
    start_date: day(3), end_date: day(4), attendee_count: "~30 adults + kids",
    meals: `Total meals: 3 (Breakfast: 1, Lunch: 1, Dinner: 1); ${label(3)}: Lunch, Dinner; ${label(4)}: Breakfast; Lunch time: 12:30 PM`,
    food_allergies: "Peanut; 2 - Low sodium; Celiac",
    buildings_rooms: "Guest House",
  }, { arrivalTime: "11:00", mealNotes: "" }),
  base("riverside", {
    source_type: "Master 2026",
    organization_name: "Riverside Family Camp",
    start_date: day(6), end_date: day(8), attendee_count: "",
    meals: "Meals: Fri dinner thru Sun lunch, maybe cookout Sat? confirm w/ leader",
    meal_count: "6",
  }, {}),
  base("training", {
    organization_name: "Host: Staff Training Lunch",
    retreat_type: "Hosting",
    start_date: day(1), end_date: day(1), attendee_count: "8",
  }, { kitchenInternalMeals: true, lunchTime: "12:00", mealSchedule: schedule([[1, "L"]]) }),
  base("board", {
    organization_name: "Host: Board Dinner (not for kitchen)",
    retreat_type: "Hosting",
    start_date: day(0), end_date: day(0), attendee_count: "12",
  }, {}),
  base("cancelled", {
    organization_name: "Cancelled Choir Weekend",
    status: "Cancelled",
    start_date: day(0), end_date: day(1), attendee_count: "50",
  }, {}),
];

await seed.from("bookings").delete().like("id", "demo-%");
await must(seed.from("bookings").insert(rows));
await must(seed.from("portal_checklist_items").insert([
  { booking_id: "demo-maple", item_id: "guest-count", title: "Confirm final guest counts", guest_action: "mark_ready", status: "completed" },
  { booking_id: "demo-cedar", item_id: "guest-count", title: "Confirm final guest counts", guest_action: "mark_ready", status: "completed" },
]));

// Real office edits, signed in, so the change history has an actor.
const office = createClient(url, process.env.LOCAL_ANON_KEY, options);
await must(office.auth.signInWithPassword({ email: "office@example.test", password: PASSWORD }));
const cedar = await must(seed.from("bookings").select("raw_data").eq("id", "demo-cedar").single());
const raw = structuredClone(cedar.raw_data);
raw.rentalFormDetails.dinnerTime = "18:30";
raw.rentalFormDetails.actualAdultGuests = "42";
await must(office.from("bookings").update({ raw_data: raw, attendee_count: "42" }).eq("id", "demo-cedar"));

console.log(`Seeded ${rows.length} fictional records around ${today}. Password: ${PASSWORD}`);
