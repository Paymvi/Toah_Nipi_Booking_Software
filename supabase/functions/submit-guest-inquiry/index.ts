import { withSupabase } from "npm:@supabase/server@^1";

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

      if (req.method !== "POST") {
        return Response.json(
          {
            error: "Method not allowed.",
          },
          {
            status: 405,
          }
        );
      }


      let body;

      try {
        body = await req.json();
      } catch {
        return Response.json(
          {
            error: "Invalid request body.",
          },
          {
            status: 400,
          }
        );
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
        return Response.json(
          {
            error:
              "Guest Group Name is required.",
          },
          {
            status: 400,
          }
        );
      }


      if (!contactName) {
        return Response.json(
          {
            error:
              "Primary Contact is required.",
          },
          {
            status: 400,
          }
        );
      }


      if (!email) {
        return Response.json(
          {
            error:
              "Email is required.",
          },
          {
            status: 400,
          }
        );
      }


      if (!phone) {
        return Response.json(
          {
            error:
              "Phone is required.",
          },
          {
            status: 400,
          }
        );
      }


      if (!startDate || !endDate) {
        return Response.json(
          {
            error:
              "Arrival and departure dates are required.",
          },
          {
            status: 400,
          }
        );
      }


      if (endDate < startDate) {
        return Response.json(
          {
            error:
              "Departure cannot be before arrival.",
          },
          {
            status: 400,
          }
        );
      }


      if (
        !Number.isInteger(
          approxTotalGuests
        ) ||
        approxTotalGuests < 1 ||
        approxTotalGuests > 2000
      ) {
        return Response.json(
          {
            error:
              "Estimated guest count is invalid.",
          },
          {
            status: 400,
          }
        );
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
          cleanText(
            body.contractReturnedDate,
            20
          ) || null,

        deposit_sent_date:
          cleanText(
            body.depositSentDate,
            20
          ) || null,

        deposit_amount:
          body.depositAmount === null ||
          body.depositAmount === ""
            ? null
            : Number(
                body.depositAmount
              ),

        insurance_certificate_sent_date:
          cleanText(
            body.insuranceCertificateSentDate,
            20
          ) || null,

        payment_method:
          cleanText(
            body.paymentMethod,
            100
          ) || null,

        meal_schedule:
          body.mealSchedule &&
          typeof body.mealSchedule ===
            "object"
            ? body.mealSchedule
            : {},

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
          Array.isArray(
            body.allergies
          )
            ? body.allergies.slice(
                0,
                50
              )
            : [],

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
          Array.isArray(
            body.activities
          )
            ? body.activities.slice(
                0,
                100
              )
            : [],

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

        return Response.json(
          {
            error:
              "Your request could not be saved.",
          },
          {
            status: 500,
          }
        );
      }


      return Response.json(
        {
          ok: true,
          inquiryId:
            data.id,
        },
        {
          status: 201,
        }
      );
    }
  ),
};