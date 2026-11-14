/*
  Staff app reads. Everything goes through the staff_app_* database
  functions (supabase/migrations/20261113000100_staff_app.sql), which check
  the signed-in account and return only staff-safe fields. Nothing here is
  cached outside React state, so signing out or switching accounts drops it.
*/
import { supabase } from "../lib/supabaseClient";

export class StaffAppError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind; // "setup" | "access" | "session" | "network" | "other"
  }
}

function toStaffAppError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(message)) {
    return new StaffAppError("The staff app database update has not been installed yet.", "setup");
  }
  if (code === "42501") {
    // Orders refusals ("You can only change your own requests.") say why; keep their wording.
    const generic = !message || /staff app access|permission denied/i.test(message);
    return new StaffAppError(generic ? "This account does not have staff app access. Ask an administrator." : message, "access");
  }
  if (code === "PGRST301" || code === "PGRST303" || /jwt|token.*expired|not authenticated/i.test(message)) {
    return new StaffAppError("Your session has ended. Sign in again.", "session");
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return new StaffAppError("Could not reach the server.", "network");
  }
  return new StaffAppError(message || "Something went wrong.", "other");
}

async function call(name, args) {
  let result;
  try {
    result = await supabase.rpc(name, args);
  } catch (error) {
    throw toStaffAppError(error);
  }
  if (result.error) throw toStaffAppError(result.error);
  return result.data;
}

// { access: "office" | "limited" | null, role, departments, fullName, canSeeDietary, historySince }
export function fetchStaffAppMe() {
  return call("staff_app_me");
}

export function fetchStaffAppBookings(fromDate, toDate) {
  return call("staff_app_bookings", { p_from: fromDate, p_to: toDate });
}

export function fetchStaffAppBooking(bookingId) {
  return call("staff_app_booking", { p_id: bookingId });
}

export function fetchStaffAccessList() {
  return call("staff_app_admin_list");
}

export function setStaffAccess({ email, fullName, role, departments, isActive }) {
  return call("staff_app_admin_set_access", {
    p_email: email,
    p_full_name: fullName || "",
    p_role: role,
    p_departments: role === "limited" ? departments : [],
    p_is_active: isActive,
  });
}

// Orders (supabase/migrations/20261114000100_staff_orders.sql).
// { generatedAt, canRequest, canPurchase, nameRequired, requests: [...] }
export function fetchStaffOrders(history) {
  return call("staff_app_orders", { p_history: Boolean(history) });
}

// `id` is made once per form, so sending the same form twice cannot create two requests.
export function saveStaffOrder({ id, department, neededBy, notes, productLink, urgent, items }, actorName) {
  return call("staff_app_order_save", {
    p_id: id,
    p_department: department,
    p_needed_by: neededBy || null,
    p_notes: notes || "",
    p_product_link: productLink || "",
    p_urgent: Boolean(urgent),
    p_items: items.map(({ name, quantity }) => ({ name, quantity })),
    p_actor_name: actorName || "",
  });
}

export function setStaffOrderStatus(itemIds, status, note, actorName) {
  return call("staff_app_order_set_status", {
    p_item_ids: itemIds,
    p_status: status,
    p_note: note || "",
    p_actor_name: actorName || "",
  });
}

// Ends this browser's session only; StaffAuthGate then drops every screen's data.
export function signOut() {
  supabase.auth.signOut({ scope: "local" });
}
