/*
  The fictional website inquiries behind "From Guest Inquiry to Guest
  Portal" (inquiryJourneyTutorial.js).

  GuestInquiriesView renders these through its real screen while the scene
  is on, the same way Portal Admin renders portalDemo.js. They live only in
  this module's memory: never in Supabase, a URL or localStorage.

  The pending request uses PORTAL_DEMO_GROUP_ID as its id, so the tutorial's
  target scope (one fictional group) covers its card here and in Portal
  Admin. Opening the prefilled booking form from it is safe: Save Guest
  Group is guarded and the tutorial's write lock refuses every write.
*/

import { PORTAL_DEMO_GROUP_ID } from "./portalDemo.js";

export const INQUIRY_DEMO_ID = PORTAL_DEMO_GROUP_ID;

function fromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function inquiry(id, details) {
  return {
    id,
    status: "pending",
    submitted_at: new Date().toISOString(),
    organization_name: "",
    contact_name: "",
    email: "",
    phone: "",
    mailing_address: "",
    start_date: "",
    end_date: "",
    arrival_time: "",
    departure_time: "",
    approx_total_guests: null,
    approx_adult_guests: null,
    approx_children_3_to_17: null,
    approx_children_under_3: null,
    number_of_nights: null,
    number_of_meals: 0,
    meal_schedule: {},
    breakfast_time: "",
    lunch_time: "",
    dinner_time: "",
    allergies: [],
    allergy_notes: "",
    meal_notes: "",
    activities: [],
    linen_option: "No",
    linen_sets: null,
    linen_pieces: null,
    contract_returned_date: "",
    deposit_sent_date: "",
    deposit_amount: null,
    payment_method: "",
    insurance_certificate_sent_date: "",
    notes: "",
    declined_reason: "",
    converted_booking_id: "",
    ...details,
  };
}

function createInquiries() {
  const arrival = fromToday(30);
  const second = fromToday(31);
  const departure = fromToday(32);

  return [
    inquiry(INQUIRY_DEMO_ID, {
      organization_name: "Community Bible Church",
      contact_name: "Jordan Smith",
      email: "jordan.smith@example.org",
      phone: "555-010-2234",
      mailing_address: "100 Example Street, Exampletown",
      start_date: arrival,
      end_date: departure,
      arrival_time: "17:00",
      departure_time: "13:00",
      approx_total_guests: 45,
      approx_adult_guests: 38,
      approx_children_3_to_17: 7,
      approx_children_under_3: 0,
      number_of_nights: 2,
      number_of_meals: 5,
      meal_schedule: {
        [arrival]: { dinner: true },
        [second]: { breakfast: true, lunch: true, dinner: true },
        [departure]: { breakfast: true },
      },
      dinner_time: "18:00",
      allergies: [{ name: "Peanuts", count: "2" }],
      activities: [{ date: second, time: "14:00", activity: "Hiking" }],
      linen_option: "Yes",
      linen_sets: 10,
      deposit_sent_date: fromToday(-1),
      deposit_amount: 500,
      payment_method: "Check",
      notes: "Fictional example: this request does not exist.",
    }),
    inquiry("inquiry-demo-riverside", {
      status: "converted",
      submitted_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      organization_name: "Riverside Youth Fellowship",
      contact_name: "Sam Rivera",
      email: "sam.rivera@example.org",
      start_date: fromToday(60),
      end_date: fromToday(62),
      approx_total_guests: 28,
      converted_booking_id: "fictional-booking-riverside",
    }),
    inquiry("inquiry-demo-maple", {
      status: "declined",
      submitted_at: new Date(Date.now() - 9 * 86400000).toISOString(),
      organization_name: "Maple Grove Women's Retreat",
      contact_name: "Robin Lee",
      email: "robin.lee@example.org",
      start_date: fromToday(90),
      end_date: fromToday(92),
      approx_total_guests: 20,
      declined_reason: "Requested dates unavailable.",
    }),
  ];
}

const EFFECTS = {
  // What Guest Inquiries shows once staff have saved the booking: the request moves to Converted.
  inquiryConverted: (inquiries) => {
    Object.assign(inquiries.find((entry) => entry.id === INQUIRY_DEMO_ID), {
      status: "converted",
      converted_booking_id: "fictional-booking-community-bible",
    });
  },
};

export const INQUIRY_DEMO_EFFECTS = Object.keys(EFFECTS);

// Effects meant for the portal scene are ignored here.
export function buildInquiryDemoScene(effects = []) {
  const inquiries = createInquiries();
  effects.forEach((name) => EFFECTS[name]?.(inquiries));
  return { inquiries };
}

/* ---------- The running scene ---------- */

let scene = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeInquiryDemo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInquiryDemo() {
  return scene;
}

export function showInquiryDemo(effects) {
  const key = effects.join();
  if (scene?.key === key) return;
  scene = { key, ...buildInquiryDemoScene(effects) };
  notify();
}

export function endInquiryDemo() {
  if (!scene) return;
  scene = null;
  notify();
}
