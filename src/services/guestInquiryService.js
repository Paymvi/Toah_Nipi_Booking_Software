
import { supabase } from "../lib/supabaseClient";
import { markGuestInquiryConvertedWithClient } from "./guestInquiryConversion.js";


export async function getGuestInquiries() {
  const {
    data,
    error,
  } =
    await supabase
      .from("guest_inquiries")
      .select("*")
      .order(
        "submitted_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


export async function declineGuestInquiry(
  inquiryId,
  reason = ""
) {
  const {
    data: userData,
  } =
    await supabase.auth.getUser();

  const {
    data,
    error,
  } =
    await supabase
      .from("guest_inquiries")
      .update({
        status:
          "declined",

        declined_reason:
          reason || null,

        reviewed_at:
          new Date()
            .toISOString(),

        reviewed_by:
          userData?.user?.id ||
          null,
      })
      .eq(
        "id",
        inquiryId
      )
      // Only while still pending, so a stale screen cannot decline a converted inquiry (INT-02).
      .eq("status", "pending")
      .select();

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "This inquiry was not declined: it is no longer a new request (someone may have converted or declined it). Reload to see its current status."
    );
  }

  return data[0];
}


// Rules and the guarded update live in guestInquiryConversion.js.
export async function markGuestInquiryConverted(
  inquiryId,
  bookingId
) {
  const {
    data: userData,
  } =
    await supabase.auth.getUser();

  return markGuestInquiryConvertedWithClient(
    supabase,
    inquiryId,
    bookingId,
    userData?.user?.id || null
  );
}
