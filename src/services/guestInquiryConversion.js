/*
  Website-inquiry conversion rules (AUDIT-004, AUDIT-008, AUDIT-044).
  No Supabase import: the client is a parameter so the rules can be tested.
*/

/*
  Decides whether a newly saved booking should mark a website inquiry
  converted. It must have been opened from that inquiry (the pending
  source belongs to the current form seed) AND the saved booking must
  still record the inquiry as its source.
*/
export function decideGuestInquiryConversion({ guestSource, formSeedId, savedBooking }) {
  if (!guestSource) {
    return { action: "none" };
  }

  if (String(guestSource.seedId ?? "") !== String(formSeedId ?? "")) {
    return { action: "none", reason: "The pending inquiry belongs to a different form." };
  }

  const savedSourceId = String(savedBooking?.rentalFormDetails?.sourceInquiryId ?? "");

  if (!savedBooking?.id || savedSourceId !== String(guestSource.guestInquiryId)) {
    return {
      action: "skip",
      reason: "The saved booking no longer records this website inquiry as its source.",
    };
  }

  return { action: "mark", guestInquiryId: guestSource.guestInquiryId, bookingId: savedBooking.id };
}

/*
  Marks one website inquiry converted. Safe to retry: an inquiry already
  converted to this booking is left as it is. An inquiry converted to a
  different booking is never relinked. The update only applies while the
  status is still the one just read, so two staff cannot both succeed.
*/
export async function markGuestInquiryConvertedWithClient(client, inquiryId, bookingId, reviewedBy = null) {
  const { data: current, error: readError } = await client
    .from("guest_inquiries")
    .select("id, status, converted_booking_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (!current) {
    throw new Error("The website inquiry could not be found, or your account cannot see it.");
  }

  if (current.status === "converted") {
    if (String(current.converted_booking_id || "") === String(bookingId)) {
      return current;
    }

    throw new Error(
      "This website inquiry is already marked converted to a different booking. It was not changed."
    );
  }

  const { data, error } = await client
    .from("guest_inquiries")
    .update({
      status: "converted",
      converted_booking_id: bookingId,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
    })
    .eq("id", inquiryId)
    .eq("status", current.status)
    .select();

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "The website inquiry changed while saving, or your account cannot update it. It was not marked converted."
    );
  }

  return data[0];
}
