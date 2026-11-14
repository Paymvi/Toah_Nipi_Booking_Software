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
    return new StaffAppError("This account does not have staff app access. Ask an administrator.", "access");
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

// Ends this browser's session only; StaffAuthGate then drops every screen's data.
export function signOut() {
  supabase.auth.signOut({ scope: "local" });
}
