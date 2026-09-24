
import { supabase } from "../lib/supabaseClient";


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
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function markGuestInquiryConverted(
  inquiryId,
  bookingId
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
          "converted",

        converted_booking_id:
          bookingId,

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
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}