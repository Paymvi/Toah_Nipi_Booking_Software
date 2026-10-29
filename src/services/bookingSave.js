import { bookingToDbRow, dbRowToBooking } from "./bookingMapping.js";

/*
  Conflict-checked booking saves (AUDIT-045, Q-003 A).

  An existing booking is written with one conditional UPDATE:

    update bookings set ... where id = $id and updated_at = $updatedAtWhenLoaded

  The database applies the check and the write in the same statement, so
  two editors cannot both pass it. If no row matched, one follow-up read
  tells a conflict (someone saved since) from a deleted booking or a write
  the database refused. Nothing is overwritten in any of those cases.

  The bookings trigger sets updated_at = now() on every update. The row
  also carries a fresh client timestamp, so the value still changes if
  that trigger were ever missing.

  The client is a parameter so the logic can be tested without Supabase.
*/

export class BookingSaveConflictError extends Error {
  constructor(message, { latest = null } = {}) {
    super(message);
    this.name = "BookingSaveConflictError";
    this.code = "BOOKING_CONFLICT";
    this.latest = latest;
  }
}

export class BookingSaveNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "BookingSaveNotFoundError";
    this.code = "BOOKING_NOT_FOUND";
  }
}

export class BookingSaveNotPermittedError extends Error {
  constructor(message) {
    super(message);
    this.name = "BookingSaveNotPermittedError";
    this.code = "BOOKING_NOT_PERMITTED";
  }
}

export function isBookingSaveConflict(error) {
  return error?.code === "BOOKING_CONFLICT";
}

export async function saveBookingWithClient(client, booking) {
  const row = bookingToDbRow(booking);
  const expectedUpdatedAt = String(booking?.updatedAt ?? "").trim();

  if (!expectedUpdatedAt) {
    const { data, error } = await client
      .from("bookings")
      .insert(row)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new BookingSaveConflictError(
          "A booking with this ID already exists. Reload the booking list before saving again."
        );
      }
      throw error;
    }

    return dbRowToBooking(data);
  }

  const changes = { ...row };
  delete changes.id;

  const { data, error } = await client
    .from("bookings")
    .update(changes)
    .eq("id", row.id)
    .eq("updated_at", expectedUpdatedAt)
    .select();

  if (error) {
    throw error;
  }

  if (Array.isArray(data) && data.length === 1) {
    return dbRowToBooking(data[0]);
  }

  const { data: latestRows, error: latestError } = await client
    .from("bookings")
    .select("*")
    .eq("id", row.id)
    .limit(1);

  if (latestError) {
    throw latestError;
  }

  if (!Array.isArray(latestRows) || latestRows.length === 0) {
    throw new BookingSaveNotFoundError(
      "This booking no longer exists, or your account cannot see it. Nothing was saved."
    );
  }

  const latest = dbRowToBooking(latestRows[0]);

  if (latest.updatedAt !== expectedUpdatedAt) {
    throw new BookingSaveConflictError(
      "Someone else saved this booking after you opened it. Your changes were not saved.",
      { latest }
    );
  }

  throw new BookingSaveNotPermittedError(
    "The database did not accept this change. Your account may not have permission to edit bookings."
  );
}

/*
  Saves several bookings with the same checks, a few at a time. Returns
  the saved bookings and the failures instead of stopping at the first
  failure, so an import can report exactly which rows were skipped.
*/
export async function saveBookingsWithClient(client, bookings, { concurrency = 6 } = {}) {
  const saved = [];
  const failures = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < bookings.length) {
      const index = nextIndex;
      nextIndex += 1;
      const booking = bookings[index];
      try {
        saved[index] = await saveBookingWithClient(client, booking);
      } catch (error) {
        failures.push({ booking, error });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, bookings.length) }, worker)
  );

  return { saved: saved.filter(Boolean), failures };
}

// One staff-facing message per failure type, shared by every save path.
export function getBookingSaveErrorMessage(error) {
  if (error?.code === "BOOKING_CONFLICT") {
    return [
      error.message,
      "",
      "Your edits are still on this screen. Copy anything you need, then reload the page to see the latest version before making your change again.",
    ].join("\n");
  }

  if (error?.code === "BOOKING_NOT_FOUND" || error?.code === "BOOKING_NOT_PERMITTED") {
    return error.message;
  }

  return "Could not save booking to Supabase. Check the console.";
}
