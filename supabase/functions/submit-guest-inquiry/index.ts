import { withSupabase } from "npm:@supabase/server@^1";

/*
  Browser access (AUDIT-027). The public form posts from another site, so
  the browser first sends an OPTIONS preflight. It is answered here and
  every response carries CORS headers, like verify-dev-mode.

  Set PUBLIC_FORM_ORIGINS (comma-separated, e.g.
  "https://www.toahnipi.org,https://toahnipi.org") to allow only those
  sites; without it any origin is allowed. Either way this endpoint stays
  what it already was: public, no sign-in, insert-only.
*/
function getCorsHeaders(req: Request) {
  const allowed = String(Deno.env.get("PUBLIC_FORM_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const allowOrigin =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// A real calendar date written as YYYY-MM-DD.
function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalIsoDate(value: unknown) {
  const text = cleanText(value, 20);
  if (!text) return { ok: true, value: null };
  return isIsoDate(text) ? { ok: true, value: text } : { ok: false, value: null };
}

/*
  Item shapes the staff screens read (AUDIT-028): allergies {name, count},
  activities {date, time, activity}, mealSchedule {date: {breakfast,
  lunch, dinner}}. Anything else is dropped rather than stored.
*/
function cleanAllergies(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 50)
    .filter((item) => item && typeof item === "object")
    .map((item: Record<string, unknown>) => ({
      name: cleanText(item.name, 200),
      count: nullableInteger(item.count),
    }))
    .filter((item) => item.name);
}

function cleanActivities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .filter((item) => item && typeof item === "object")
    .map((item: Record<string, unknown>) => {
      const date = cleanText(item.date, 20);
      return {
        date: isIsoDate(date) ? date : "",
        time: cleanText(item.time, 20),
        activity: cleanText(item.activity, 300),
      };
    })
    .filter((item) => item.activity || item.date || item.time);
}

function cleanMealSchedule(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const schedule: Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }> = {};
  Object.entries(value as Record<string, unknown>)
    .slice(0, 60)
    .forEach(([date, meals]) => {
      if (!isIsoDate(date) || !meals || typeof meals !== "object") return;
      const day = meals as Record<string, unknown>;
      schedule[date] = {
        breakfast: day.breakfast === true,
        lunch: day.lunch === true,
        dinner: day.dinner === true,
      };
    });
  return schedule;
}


function cleanText(value: unknown, maxLength = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}


function nullableInteger(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}


export default {
  fetch: withSupabase(
    {
      auth: "none",
    },

        async (req, ctx) => {
      const corsHeaders = getCorsHeaders(req);

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Every response below carries the CORS headers.
      const respond = (body: unknown, status = 200) =>
        Response.json(body, { status, headers: corsHeaders });

      if (req.method !== "POST") {
        return respond({ error: "Method not allowed." }, 405);
      }


      let body;

      try {
        body = await req.json();
      } catch {
        return respond({
            error: "Invalid request body.",
          }, 400);
      }


      const organizationName =
        cleanText(
          body.organizationName,
          200
        );

      const contactName =
        cleanText(
          body.contactName,
          200
        );

      const email =
        cleanText(
          body.email,
          300
        );

      const phone =
        cleanText(
          body.phone,
          100
        );

      const startDate =
        cleanText(
          body.startDate,
          20
        );

      const endDate =
        cleanText(
          body.endDate,
          20
        );

      const approxTotalGuests =
        Number(
          body.approxTotalGuests
        );


      /*
        IMPORTANT:
        Do not trust React validation.
        Validate again here.
      */

      if (!organizationName) {
        return respond({
            error:
              "Guest Group Name is required.",
          }, 400);
      }


      if (!contactName) {
        return respond({
            error:
              "Primary Contact is required.",
          }, 400);
      }


      if (!email) {
        return respond({
            error:
              "Email is required.",
          }, 400);
      }


      if (!phone) {
        return respond({
            error:
              "Phone is required.",
          }, 400);
      }


      if (!startDate || !endDate) {
        return respond({
            error:
              "Arrival and departure dates are required.",
          }, 400);
      }


            if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
        return respond({ error: "Dates must be written as YYYY-MM-DD." }, 400);
      }

      if (endDate < startDate) {
        return respond({
            error:
              "Departure cannot be before arrival.",
          }, 400);
      }


      if (
        !Number.isInteger(
          approxTotalGuests
        ) ||
        approxTotalGuests < 1 ||
        approxTotalGuests > 2000
      ) {
        return respond({
            error:
              "Estimated guest count is invalid.",
          }, 400);
      }


            const dateChecks = {
        contractReturnedDate: optionalIsoDate(body.contractReturnedDate),
        depositSentDate: optionalIsoDate(body.depositSentDate),
        insuranceCertificateSentDate: optionalIsoDate(body.insuranceCertificateSentDate),
      };

      if (Object.values(dateChecks).some((date) => !date.ok)) {
        return respond({ error: "Dates must be written as YYYY-MM-DD." }, 400);
      }

      const optionalDates = {
        contractReturnedDate: dateChecks.contractReturnedDate.value,
        depositSentDate: dateChecks.depositSentDate.value,
        insuranceCertificateSentDate: dateChecks.insuranceCertificateSentDate.value,
      };

      const depositText = cleanText(body.depositAmount, 20).replace(/[$,]/g, "");
      const depositAmount = depositText === "" ? null : Number(depositText);

      if (depositAmount !== null && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
        return respond({ error: "Deposit amount must be a number." }, 400);
      }

      /*
        Only build the fields YOU approve.

        Do not do:

        insert(body)

        because that lets the client
        decide what database fields
        get written.
      */

      const inquiry = {
        organization_name:
          organizationName,

        contact_name:
          contactName,

        email,

        phone,

        mailing_address:
          cleanText(
            body.mailingAddress,
            500
          ) || null,

        start_date:
          startDate,

        arrival_time:
          cleanText(
            body.arrivalTime,
            20
          ) || null,

        end_date:
          endDate,

        departure_time:
          cleanText(
            body.departureTime,
            20
          ) || null,

        approx_total_guests:
          approxTotalGuests,

        approx_adult_guests:
          nullableInteger(
            body.approxAdultGuests
          ),

        approx_children_3_to_17:
          nullableInteger(
            body.approxChildren3to17
          ),

        approx_children_under_3:
          nullableInteger(
            body.approxChildrenUnder3
          ),

        number_of_nights:
          nullableInteger(
            body.numberOfNights
          ),

                contract_returned_date:
          optionalDates.contractReturnedDate,

                deposit_sent_date:
          optionalDates.depositSentDate,
        deposit_amount:
          depositAmount,
        insurance_certificate_sent_date:
          optionalDates.insuranceCertificateSentDate,

        payment_method:
          cleanText(
            body.paymentMethod,
            100
          ) || null,

                meal_schedule:
          cleanMealSchedule(body.mealSchedule),

        number_of_meals:
          nullableInteger(
            body.numberOfMeals
          ) ?? 0,

        breakfast_time:
          cleanText(
            body.breakfastTime,
            20
          ) || null,

        lunch_time:
          cleanText(
            body.lunchTime,
            20
          ) || null,

        dinner_time:
          cleanText(
            body.dinnerTime,
            20
          ) || null,

                allergies:
          cleanAllergies(body.allergies),

        allergy_notes:
          cleanText(
            body.allergyNotes,
            3000
          ) || null,

        meal_notes:
          cleanText(
            body.mealNotes,
            3000
          ) || null,

                activities:
          cleanActivities(body.activities),

        linen_option:
          ["No", "Some", "All"].includes(
            body.linenOption
          )
            ? body.linenOption
            : "No",

        linen_sets:
          nullableInteger(
            body.linenSets
          ),

        linen_pieces:
          nullableInteger(
            body.linenPieces
          ),

        notes:
          cleanText(
            body.notes,
            3000
          ) || null,

        status:
          "pending",
      };


      const {
        data,
        error,
      } =
        await ctx.supabaseAdmin
          .from(
            "guest_inquiries"
          )
          .insert(inquiry)
          .select(
            "id"
          )
          .single();


      if (error) {
        console.error(
          "Guest inquiry insert failed:",
          error
        );

        return respond({
            error:
              "Your request could not be saved.",
          }, 500);
      }


      return respond({
          ok: true,
          inquiryId:
            data.id,
        }, 201);
    }
  ),
};