import { supabase } from "../lib/supabaseClient";

function cleanDate(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function cleanTimestamp(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

/*
  Display-only placeholders. Older code saved these as real contact
  data, so they are treated as empty when reading and never written.
*/
const CONTACT_PLACEHOLDER_VALUES = new Set([
  "no contact name",
  "no email provided",
  "no phone provided",
]);

export function cleanContactPlaceholder(value) {
  const text = String(value ?? "").trim();

  return CONTACT_PLACEHOLDER_VALUES.has(text.toLowerCase())
    ? ""
    : value || "";
}

/*
  Edit forms expose Status and Waitlist separately. On save, the field the
  user changed wins: a changed (or unchanged) Status sets Waitlist to match;
  a change to Waitlist alone sets the Status. Leaving the waitlist restores
  the stage the contract dates support. Contract dates are never cleared.
*/
export function getConsistentWaitlistState(previousBooking, nextBooking) {
  const status = String(nextBooking?.status || "").trim() || "Inquiry";
  const isWaitlistStatus = status.toLowerCase().includes("wait");
  const wantsWaitlist =
    String(nextBooking?.waitlist || "").trim().toLowerCase() === "yes";
  const wasWaitlist =
    String(previousBooking?.waitlist || "").trim().toLowerCase() === "yes";
  const statusChanged =
    status !== (String(previousBooking?.status || "").trim() || "Inquiry");

  if (statusChanged || wantsWaitlist === wasWaitlist) {
    return { status, waitlist: isWaitlistStatus ? "Yes" : "No" };
  }

  if (wantsWaitlist) {
    return { status: "Waitlist", waitlist: "Yes" };
  }

  if (!isWaitlistStatus) {
    return { status, waitlist: "No" };
  }

  const details = nextBooking?.rentalFormDetails || {};

  return {
    status: details.contractReturnedDate
      ? "Confirmed"
      : details.contractSentDate
        ? "Contract Sent"
        : "Inquiry",
    waitlist: "No",
  };
}

export function bookingToDbRow(inputBooking) {
  const booking = {
    ...inputBooking,
    contactName: cleanContactPlaceholder(inputBooking.contactName),
    name: cleanContactPlaceholder(inputBooking.name),
    email: cleanContactPlaceholder(inputBooking.email),
    phone: cleanContactPlaceholder(inputBooking.phone),
  };

  return {
    id: booking.id,

    source_type: booking.sourceType || "Form",
    source_sheet: booking.sourceSheet || "",
    source_row_number: String(booking.sourceRowNumber || ""),
    detected_import_type: booking.detectedImportType || "",

    organization_name: booking.organizationName || "Unnamed Organization",
    contact_name: booking.contactName || booking.name || "",
    email: booking.email || "",
    phone: booking.phone || "",

    start_date: cleanDate(booking.startDate),
    end_date: cleanDate(booking.endDate),
    desired_dates_text: booking.desiredDatesText || booking.desiredDates || "",

    attendee_count: booking.attendeeCount || booking.groupSize || "",
    retreat_type: booking.retreatType || "",
    promo_code: booking.promoCode || "",
    notes: booking.notes || booking.message || "",
    waitlist: booking.waitlist || "No",
    status: booking.status || "Inquiry",

    room_name: booking.roomName || booking.buildingsRooms || "Unassigned",
    returning_status: booking.returningStatus || "",
    buildings_rooms: booking.buildingsRooms || "",
    meals: booking.meals || "",
    food_allergies: booking.foodAllergies || "",
    need_to_know: booking.needToKnow || "",
    linen_sets: booking.linenSets || "",
    activities: booking.activities || "",

    persons: booking.persons || "",
    nights: booking.nights || "",
    meal_count: booking.mealCount || "",
    camper_days: booking.camperDays || "",
    usage_fee: booking.usageFee || "",
    lodging_cost: booking.lodgingCost || "",
    food_cost: booking.foodCost || "",
    misc_cost: booking.miscCost || "",

    stage_of_group: booking.stageOfGroup || "",
    schedule: booking.schedule || "",
    min_paying_guests: booking.minPayingGuests || "",
    max_paying_guests: booking.maxPayingGuests || "",
    guest_rate: booking.guestRate || "",
    expected_minimum_revenue: booking.expectedMinimumRevenue || "",
    invoice_lodging_meals: booking.invoiceLodgingMeals || "",
    deposit: booking.deposit || "",
    deposit_received: booking.depositReceived || "",
    date_of_cancellation: booking.dateOfCancellation || "",
    reason_for_cancellation: booking.reasonForCancellation || "",
    vacancy_filled: booking.vacancyFilled || "",
    monthly_projected_income: booking.monthlyProjectedIncome || "",

    archive_address: booking.archiveAddress || "",
    archive_city: booking.archiveCity || "",
    archive_state: booking.archiveState || "",
    archive_zip: booking.archiveZip || "",
    archive_guest_group: booking.archiveGuestGroup || "",
    archive_visit_date: booking.archiveVisitDate || "",
    archive_all_prior_visit_dates: booking.archiveAllPriorVisitDates || "",
    archive_visit_count: booking.archiveVisitCount || "",
    archive_source_pdf_link: booking.archiveSourcePdfLink || "",
    archive_prior_visit_links: cleanArray(booking.archivePriorVisitLinks),
    archive_confidence: booking.archiveConfidence || null,

    program_logistics_assignments: cleanArray(
      booking.programLogisticsAssignments
    ),

    checklists: Array.isArray(booking.checklists) ? booking.checklists : null,

    raw_data: booking,
    submitted_at: cleanTimestamp(booking.submittedAt),
    updated_at: new Date().toISOString(),
  };
}

export function dbRowToBooking(row) {
  return {
    id: row.id,

    portalToken: row.portal_token,

    sourceType: row.source_type || "Form",
    sourceSheet: row.source_sheet || "",
    sourceRowNumber: row.source_row_number || "",
    detectedImportType: row.detected_import_type || "",

    organizationName: row.organization_name || "Unnamed Organization",
    contactName: cleanContactPlaceholder(row.contact_name),
    name: cleanContactPlaceholder(row.contact_name),

    email: cleanContactPlaceholder(row.email),
    phone: cleanContactPlaceholder(row.phone),

    startDate: row.start_date || "",
    endDate: row.end_date || "",
    desiredDatesText: row.desired_dates_text || "",

    attendeeCount: row.attendee_count || "",
    groupSize: row.attendee_count || "",
    retreatType: row.retreat_type || "",
    promoCode: row.promo_code || "",
    notes: row.notes || "",
    message: row.notes || "",
    waitlist: row.waitlist || "No",
    status: row.status || "Inquiry",

    roomName: row.room_name || "Unassigned",
    returningStatus: row.returning_status || "",
    buildingsRooms: row.buildings_rooms || "",
    meals: row.meals || "",
    foodAllergies: row.food_allergies || "",
    needToKnow: row.need_to_know || "",
    linenSets: row.linen_sets || "",
    activities: row.activities || "",

    persons: row.persons || "",
    nights: row.nights || "",
    mealCount: row.meal_count || "",
    camperDays: row.camper_days || "",
    usageFee: row.usage_fee || "",
    lodgingCost: row.lodging_cost || "",
    foodCost: row.food_cost || "",
    miscCost: row.misc_cost || "",

    stageOfGroup: row.stage_of_group || "",
    schedule: row.schedule || "",
    minPayingGuests: row.min_paying_guests || "",
    maxPayingGuests: row.max_paying_guests || "",
    guestRate: row.guest_rate || "",
    expectedMinimumRevenue: row.expected_minimum_revenue || "",
    invoiceLodgingMeals: row.invoice_lodging_meals || "",
    deposit: row.deposit || "",
    depositReceived: row.deposit_received || "",
    dateOfCancellation: row.date_of_cancellation || "",
    reasonForCancellation: row.reason_for_cancellation || "",
    vacancyFilled: row.vacancy_filled || "",
    monthlyProjectedIncome: row.monthly_projected_income || "",

    archiveAddress: row.archive_address || "",
    archiveCity: row.archive_city || "",
    archiveState: row.archive_state || "",
    archiveZip: row.archive_zip || "",
    archiveGuestGroup: row.archive_guest_group || "",
    archiveVisitDate: row.archive_visit_date || "",
    archiveAllPriorVisitDates: row.archive_all_prior_visit_dates || "",
    archiveVisitCount: row.archive_visit_count || "",
    archiveSourcePdfLink: row.archive_source_pdf_link || "",
    archivePriorVisitLinks: Array.isArray(row.archive_prior_visit_links)
      ? row.archive_prior_visit_links
      : [],
    archiveConfidence: row.archive_confidence || null,

    programLogisticsAssignments: Array.isArray(
      row.program_logistics_assignments
    )
      ? row.program_logistics_assignments
      : [],

    checklists: Array.isArray(row.checklists) ? row.checklists : null,

    submittedAt: row.submitted_at || "",
    updatedAt: row.updated_at || "",
    rawSpreadsheetData: row.raw_data?.rawSpreadsheetData || null,
    rentalFormDetails: row.raw_data?.rentalFormDetails || null,
  };
}

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

export async function upsertBooking(booking) {
  const row = bookingToDbRow(booking);

  const { data, error } = await supabase
    .from("bookings")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return dbRowToBooking(data);
}

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

export async function deleteAllBookings() {
  const { error } = await supabase
    .from("bookings")
    .delete()
    .neq("id", "__never__");

  if (error) {
    throw error;
  }
}

export async function deleteBooking(bookingId) {
  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId);

  if (error) {
    throw error;
  }
}