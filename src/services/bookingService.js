import { supabase } from "../lib/supabaseClient";
import { bookingToDbRow, dbRowToBooking } from "./bookingMapping.js";

export {
  BookingSaveConflictError,
  BookingSaveNotFoundError,
  BookingSaveNotPermittedError,
  getBookingSaveErrorMessage,
  isBookingSaveConflict,
} from "./bookingSave.js";
import {
  BookingSaveNotPermittedError,
  saveBookingWithClient,
  saveBookingsWithClient,
} from "./bookingSave.js";

export {
  bookingToDbRow,
  buildActivitiesSummary,
  cleanContactPlaceholder,
  dbRowToBooking,
  getConsistentWaitlistState,
} from "./bookingMapping.js";

/*
  Supabase caps each response (max_rows, 1,000 by default), so bookings are
  read page by page. The id tiebreaker keeps rows from shifting between pages
  when many bookings share a start date.
*/
const FETCH_BOOKINGS_PAGE_SIZE = 1000;
const FETCH_BOOKINGS_MAX_PAGES = 1000;

export async function fetchBookings() {
  const rows = [];

  for (let page = 0; page < FETCH_BOOKINGS_MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(rows.length, rows.length + FETCH_BOOKINGS_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    /*
      Stop only on an empty page. A short page is not treated as the end,
      because a server row limit below the page size also returns short pages.
    */
    if (!data || data.length === 0) {
      return rows.map(dbRowToBooking);
    }

    rows.push(...data);
  }

  throw new Error(
    `Stopped loading bookings after ${FETCH_BOOKINGS_MAX_PAGES} pages. The booking list may be incomplete.`
  );
}

/*
  Normal saves from every edit screen. New bookings are inserted; existing
  ones are updated only if nobody saved them since they were loaded
  (see bookingSave.js).
*/
export function saveBooking(booking) {
  return saveBookingWithClient(supabase, booking);
}

export function saveBookings(bookings, options) {
  return saveBookingsWithClient(supabase, bookings, options);
}

export async function fetchBookingById(bookingId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.length ? dbRowToBooking(data[0]) : null;
}

/*
  Unconditional write, used only by backup restore, where replacing the
  live values with the backup's values is the intended result.
*/
export async function upsertBookings(bookings) {
  const rows = bookings.map(bookingToDbRow);

  const { data, error } = await supabase
    .from("bookings")
    .upsert(rows, { onConflict: "id" })
    .select();

  if (error) {
    throw error;
  }

  return data.map(dbRowToBooking);
}

/*
  Deletes report how many rows the database actually removed (AUDIT-023).
  Row-level security filters a forbidden delete down to zero rows without
  an error, so zero is treated as "not permitted" rather than success.
*/
export async function deleteAllBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .neq("id", "__never__")
    .select("id");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.length : 0;
}

export async function deleteBooking(bookingId) {
  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId)
    .select("id");

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new BookingSaveNotPermittedError(
      "The booking was not deleted. Only administrators can delete bookings."
    );
  }
}
