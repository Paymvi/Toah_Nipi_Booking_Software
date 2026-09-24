import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaArrowLeft,
  FaBed,
  FaCalendarAlt,
  FaCheckCircle,
  FaClipboardList,
  FaDollarSign,
  FaEnvelope,
  FaEnvelopeOpenText,
  FaExclamationTriangle,
  FaFileContract,
  FaHiking,
  FaInbox,
  FaMapMarkerAlt,
  FaPhone,
  FaShieldAlt,
  FaSyncAlt,
  FaTimes,
  FaTimesCircle,
  FaUser,
  FaUsers,
  FaUtensils,
} from "react-icons/fa";

import CreateBooking from "./CreateBooking";

import {
  declineGuestInquiry,
  getGuestInquiries,
  markGuestInquiryConverted,
} from "../services/guestInquiryService";



const COLUMNS = [
  {
    key: "pending",
    label: "New Requests",
    description:
      "Guest submissions waiting for staff review.",
    icon: FaInbox,
  },
  {
    key: "converted",
    label: "Converted",
    description:
      "Requests that became official bookings.",
    icon: FaCheckCircle,
  },
  {
    key: "declined",
    label: "Declined",
    description:
      "Requests staff chose not to book.",
    icon: FaTimesCircle,
  },
];


function statusKey(inquiry) {
  const status = String(
    inquiry?.status || "pending"
  ).toLowerCase();

  if (status === "converted") {
    return "converted";
  }

  if (status === "declined") {
    return "declined";
  }

  return "pending";
}


function statusLabel(inquiry) {
  const key = statusKey(inquiry);

  if (key === "converted") {
    return "Converted";
  }

  if (key === "declined") {
    return "Declined";
  }

  return "New Request";
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(`${value}T00:00:00`);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(date);
}


function formatDateRange(
  startDate,
  endDate
) {
  if (
    !startDate &&
    !endDate
  ) {
    return "No requested dates";
  }

  if (!startDate) {
    return formatDate(endDate);
  }

  if (!endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(
    startDate
  )} – ${formatDate(
    endDate
  )}`;
}


function formatTime(value) {
  if (!value) {
    return "—";
  }

  const [
    hourText,
    minuteText,
  ] = String(value).split(":");

  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return String(value);
  }

  const date = new Date();

  date.setHours(
    hour,
    minute,
    0,
    0
  );

  return date.toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}


function formatSubmitted(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(date);
}


function formatMoney(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const amount = Number(value);

  if (
    !Number.isFinite(amount)
  ) {
    return String(value);
  }

  return amount.toLocaleString(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  );
}


function getMealTotals(schedule) {
  const totals = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    total: 0,
  };

  Object.values(
    schedule || {}
  ).forEach((day) => {
    [
      "breakfast",
      "lunch",
      "dinner",
    ].forEach((meal) => {
      if (day?.[meal]) {
        totals[meal] += 1;
        totals.total += 1;
      }
    });
  });

  return totals;
}


function getLinenSummary(inquiry) {
  const option =
    inquiry?.linen_option || "No";

  if (option === "No") {
    return "No linens requested";
  }

  const parts = [];

  if (
    inquiry?.linen_sets !== null &&
    inquiry?.linen_sets !== undefined &&
    inquiry?.linen_sets !== ""
  ) {
    parts.push(
      `${inquiry.linen_sets} full set(s)`
    );
  }

  if (
    inquiry?.linen_pieces !== null &&
    inquiry?.linen_pieces !== undefined &&
    inquiry?.linen_pieces !== ""
  ) {
    parts.push(
      `${inquiry.linen_pieces} individual piece(s)`
    );
  }

  return parts.length
    ? `${option} · ${parts.join(" · ")}`
    : option;
}


/*
  This converts a guest_inquiries database row
  into the existing CreateBooking initialInquiry shape.
*/
function guestInquiryToStaffInquiry(
  inquiry
) {
  const guestReportedNotes = [
    inquiry.contract_returned_date
      ? `Guest reports contract returned: ${formatDate(
          inquiry.contract_returned_date
        )}`
      : "",

    inquiry.deposit_sent_date
      ? `Guest reports deposit sent: ${formatDate(
          inquiry.deposit_sent_date
        )}`
      : "",

    inquiry.insurance_certificate_sent_date
      ? `Guest reports insurance certificate sent: ${formatDate(
          inquiry.insurance_certificate_sent_date
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id:
      inquiry.id,

    sourceType:
      "Guest Web Form",

    sourceSheet:
      "Guest Web Form",

    submittedAt:
      inquiry.submitted_at,

    organizationName:
      inquiry.organization_name || "",

    contactName:
      inquiry.contact_name || "",

    phone:
      inquiry.phone || "",

    email:
      inquiry.email || "",

    inquiryAddress:
      inquiry.mailing_address || "",

    startDate:
      inquiry.start_date || "",

    endDate:
      inquiry.end_date || "",

    desiredDatesText:
      inquiry.start_date &&
      inquiry.end_date
        ? `${inquiry.start_date} - ${inquiry.end_date}`
        : inquiry.start_date ||
          inquiry.end_date ||
          "",

    attendeeCount:
      inquiry.approx_total_guests !==
        null &&
      inquiry.approx_total_guests !==
        undefined
        ? String(
            inquiry.approx_total_guests
          )
        : "",

    retreatType:
      "",

    inquiryDisposition:
      "Guest Web Form",

    notes: [
      inquiry.notes || "",
      guestReportedNotes,
    ]
      .filter(Boolean)
      .join("\n\n"),

    guestFormDetails: {
      arrivalTime:
        inquiry.arrival_time || "",

      departureTime:
        inquiry.departure_time || "",

      approxAdultGuests:
        inquiry.approx_adult_guests ?? "",

      approxChildren3to17:
        inquiry.approx_children_3_to_17 ?? "",

      approxChildrenUnder3:
        inquiry.approx_children_under_3 ?? "",

      numberOfNights:
        inquiry.number_of_nights ?? "",

      numberOfMeals:
        inquiry.number_of_meals ?? 0,

      depositAmount:
        inquiry.deposit_amount ?? "",

      paymentMethod:
        inquiry.payment_method || "",

      mealSchedule:
        inquiry.meal_schedule &&
        typeof inquiry.meal_schedule ===
          "object"
          ? inquiry.meal_schedule
          : {},

      breakfastTime:
        inquiry.breakfast_time || "",

      lunchTime:
        inquiry.lunch_time || "",

      dinnerTime:
        inquiry.dinner_time || "",

      allergies:
        Array.isArray(
          inquiry.allergies
        )
          ? inquiry.allergies
          : [],

      allergyNotes:
        inquiry.allergy_notes || "",

      mealNotes:
        inquiry.meal_notes || "",

      activities:
        Array.isArray(
          inquiry.activities
        )
          ? inquiry.activities
          : [],

      linenOption:
        inquiry.linen_option || "No",

      linenSets:
        inquiry.linen_sets ?? "",

      linenPieces:
        inquiry.linen_pieces ?? "",

      /*
        Keep these as guest-reported facts.
        Do NOT automatically turn them into
        official staff "received" dates.
      */
      guestReportedContractReturnedDate:
        inquiry.contract_returned_date || "",

      guestReportedDepositSentDate:
        inquiry.deposit_sent_date || "",

      guestReportedInsuranceCertificateSentDate:
        inquiry.insurance_certificate_sent_date || "",
    },
  };
}


function DetailField({
  icon: Icon,
  label,
  value,
  wide = false,
}) {
  return (
    <div
      className={`guest-request-detail-field ${
        wide
          ? "guest-request-detail-field-wide"
          : ""
      }`}
    >
      <span>
        {Icon && <Icon />}
        {label}
      </span>

      <strong>
        {value ??
          "—"}
      </strong>
    </div>
  );
}


function RequestCard({
  inquiry,
  onReview,
}) {
  const key =
    statusKey(inquiry);

  const mealTotals =
    getMealTotals(
      inquiry.meal_schedule
    );

  return (
    <article className="guest-request-card">
      <div className="guest-request-card-badges">
        <span className="guest-request-source-badge">
          Guest Web Form
        </span>

        <span
          className={`guest-request-status-badge guest-request-status-${key}`}
        >
          {statusLabel(inquiry)}
        </span>
      </div>

      <div className="guest-request-card-title">
        <strong>
          {inquiry.organization_name ||
            "Unnamed Group"}
        </strong>

        <small>
          {inquiry.contact_name ||
            "No contact name"}
        </small>
      </div>

      <div className="guest-request-card-meta">
        <span>
          <FaCalendarAlt />

          {formatDateRange(
            inquiry.start_date,
            inquiry.end_date
          )}
        </span>

        <span>
          <FaUsers />

          {inquiry.approx_total_guests ??
            "—"}{" "}
          estimated guests
        </span>

        <span>
          <FaUtensils />

          {mealTotals.total ||
            inquiry.number_of_meals ||
            0}{" "}
          requested meals
        </span>

        <span>
          <FaBed />

          {getLinenSummary(
            inquiry
          )}
        </span>
      </div>

      <div className="guest-request-submitted">
        <small>
          Submitted
        </small>

        <strong>
          {formatSubmitted(
            inquiry.submitted_at
          )}
        </strong>
      </div>

      {key === "declined" &&
        inquiry.declined_reason && (
          <div className="guest-request-card-note guest-request-card-note-declined">
            <strong>
              Decline reason
            </strong>

            <span>
              {
                inquiry.declined_reason
              }
            </span>
          </div>
        )}

      {key === "converted" &&
        inquiry.converted_booking_id && (
          <div className="guest-request-card-note guest-request-card-note-converted">
            <strong>
              Booking ID
            </strong>

            <span>
              {
                inquiry.converted_booking_id
              }
            </span>
          </div>
        )}

      <div className="guest-request-card-actions">
        <button
          type="button"
          className="guest-request-secondary-button"
          onClick={() =>
            onReview(inquiry)
          }
        >
          <FaClipboardList />
          Review
        </button>
      </div>
    </article>
  );
}


export default function GuestInquiriesView() {
  const [
    inquiries,
    setInquiries,
  ] = useState([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    selectedInquiry,
    setSelectedInquiry,
  ] = useState(null);

  const [
    bookingSeed,
    setBookingSeed,
  ] = useState(null);

  const [
    showDecline,
    setShowDecline,
  ] = useState(false);

  const [
    declineReason,
    setDeclineReason,
  ] = useState("");

  const [
    isUpdating,
    setIsUpdating,
  ] = useState(false);

  const [
    actionMessage,
    setActionMessage,
  ] = useState("");

  const [
    actionError,
    setActionError,
  ] = useState("");


  useEffect(() => {
    loadGuestInquiries();
  }, []);


  async function loadGuestInquiries() {
    try {
      setIsLoading(true);
      setLoadError("");

      const data =
        await getGuestInquiries();

      setInquiries(
        data || []
      );
    } catch (error) {
      console.error(
        "Could not load guest inquiries:",
        error
      );

      setLoadError(
        error?.message ||
          "Could not load guest inquiries."
      );
    } finally {
      setIsLoading(false);
    }
  }


  const grouped =
    useMemo(() => {
      const groups = {
        pending: [],
        converted: [],
        declined: [],
      };

      inquiries.forEach(
        (inquiry) => {
          groups[
            statusKey(
              inquiry
            )
          ].push(inquiry);
        }
      );

      Object.values(
        groups
      ).forEach(
        (items) => {
          items.sort(
            (a, b) =>
              new Date(
                b.submitted_at ||
                  0
              ) -
              new Date(
                a.submitted_at ||
                  0
              )
          );
        }
      );

      return groups;
    }, [inquiries]);


  const openReview = (
    inquiry
  ) => {
    setSelectedInquiry(
      inquiry
    );

    setShowDecline(
      false
    );

    setDeclineReason("");
    setActionError("");
  };


  const closeReview = () => {
    if (isUpdating) {
      return;
    }

    setSelectedInquiry(
      null
    );

    setShowDecline(
      false
    );

    setDeclineReason("");
    setActionError("");
  };


  const openBookingForm = () => {
    if (
      !selectedInquiry
    ) {
      return;
    }

    setBookingSeed(
      guestInquiryToStaffInquiry(
        selectedInquiry
      )
    );

    setSelectedInquiry(
      null
    );

    setActionError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };


  const declineSelectedInquiry =
    async () => {
      if (
        !selectedInquiry
      ) {
        return;
      }

      try {
        setIsUpdating(
          true
        );

        setActionError("");

        const groupName =
          selectedInquiry.organization_name ||
          "Guest inquiry";

        await declineGuestInquiry(
          selectedInquiry.id,
          declineReason.trim()
        );

        setSelectedInquiry(
          null
        );

        setShowDecline(
          false
        );

        setDeclineReason("");

        setActionMessage(
          `${groupName} was moved to Declined.`
        );

        await loadGuestInquiries();
      } catch (error) {
        console.error(
          "Could not decline guest inquiry:",
          error
        );

        setActionError(
          error?.message ||
            "The inquiry could not be declined."
        );
      } finally {
        setIsUpdating(
          false
        );
      }
    };


  const handleBookingCreated =
    async (
      savedBooking
    ) => {
      if (!bookingSeed) {
        return;
      }

      try {
        await markGuestInquiryConverted(
          bookingSeed.id,
          savedBooking?.id
        );

        setActionMessage(
          `${bookingSeed.organizationName || "Guest inquiry"} was converted into a booking.`
        );

        setBookingSeed(
          null
        );

        await loadGuestInquiries();
      } catch (error) {
        console.error(
          "The booking saved, but the guest inquiry could not be marked converted:",
          error
        );

        setBookingSeed(
          null
        );

        setActionError(
          "The booking saved successfully, but the original guest request could not be marked Converted. Do not create a second booking for it."
        );

        await loadGuestInquiries();
      }

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    };


  if (bookingSeed) {
    return (
      <section className="guest-requests-page">
        <div className="guest-request-booking-toolbar">
          <button
            type="button"
            className="guest-request-secondary-button"
            onClick={() =>
              setBookingSeed(
                null
              )
            }
          >
            <FaArrowLeft />
            Back to Guest Inquiries
          </button>

          <div>
            <small>
              Creating booking from
            </small>

            <strong>
              {
                bookingSeed.organizationName
              }
            </strong>
          </div>
        </div>

        <div className="guest-request-booking-notice">
          <FaEnvelopeOpenText />

          <div>
            <strong>
              Guest-submitted information has been copied into the real staff booking form.
            </strong>

            <p>
              Review everything, add staff-only details such as retreat type,
              rates, housing, and official received dates, then save normally.
            </p>
          </div>
        </div>

        <CreateBooking
          key={
            bookingSeed.id
          }
          embedded
          initialInquiry={
            bookingSeed
          }
          onBookingCreated={
            handleBookingCreated
          }
        />
      </section>
    );
  }


  if (isLoading) {
    return (
      <section className="guest-requests-page">
        <div className="guest-request-loading">
          <FaSyncAlt />
          Loading guest inquiries...
        </div>
      </section>
    );
  }


  if (loadError) {
    return (
      <section className="guest-requests-page">
        <div className="guest-request-load-error">
          <FaExclamationTriangle />

          <div>
            <strong>
              Could not load guest inquiries
            </strong>

            <p>
              {loadError}
            </p>

            <button
              type="button"
              className="guest-request-secondary-button"
              onClick={
                loadGuestInquiries
              }
            >
              <FaSyncAlt />
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }


  const selectedMeals =
    selectedInquiry
      ? getMealTotals(
          selectedInquiry.meal_schedule
        )
      : {
          breakfast: 0,
          lunch: 0,
          dinner: 0,
          total: 0,
        };

  const selectedAllergies =
    selectedInquiry &&
    Array.isArray(
      selectedInquiry.allergies
    )
      ? selectedInquiry.allergies
      : [];

  const selectedActivities =
    selectedInquiry &&
    Array.isArray(
      selectedInquiry.activities
    )
      ? selectedInquiry.activities
      : [];


  return (
    <section className="guest-requests-page">
      {actionMessage && (
        <div className="guest-request-banner guest-request-banner-success">
          <FaCheckCircle />

          <span>
            {actionMessage}
          </span>

          <button
            type="button"
            onClick={() =>
              setActionMessage(
                ""
              )
            }
            aria-label="Dismiss message"
          >
            <FaTimes />
          </button>
        </div>
      )}

      {actionError && (
        <div className="guest-request-banner guest-request-banner-error">
          <FaExclamationTriangle />

          <span>
            {actionError}
          </span>

          <button
            type="button"
            onClick={() =>
              setActionError(
                ""
              )
            }
            aria-label="Dismiss error"
          >
            <FaTimes />
          </button>
        </div>
      )}


      <article className="guest-request-header-card">
        <div className="guest-request-header">
          <div className="guest-request-heading">
            <span>
              <FaEnvelopeOpenText />
            </span>

            <div>
              <p>
                Guest Group Requests
              </p>

              <h2>
                Guest Request Workflow
              </h2>

              <small>
                Review forms submitted by group leaders before turning them into official bookings.
              </small>
            </div>
          </div>

          <div className="guest-request-summary">
            <span>
              <strong>
                {
                  grouped.pending
                    .length
                }
              </strong>
              New
            </span>

            <span>
              <strong>
                {
                  grouped.converted
                    .length
                }
              </strong>
              Converted
            </span>

            <span>
              <strong>
                {
                  grouped.declined
                    .length
                }
              </strong>
              Declined
            </span>
          </div>
        </div>

        <div className="guest-request-workflow-note">
          <div>
            <strong>
              Guest form workflow
            </strong>

            <span>
              A request stays New until staff either declines it or saves a real booking from the prefilled form.
            </span>
          </div>

          <button
            type="button"
            onClick={
              loadGuestInquiries
            }
          >
            <FaSyncAlt />
            Refresh
          </button>
        </div>
      </article>


      <div className="guest-request-board">
        {COLUMNS.map(
          (column) => {
            const Icon =
              column.icon;

            const items =
              grouped[
                column.key
              ];

            return (
              <section
                className={`guest-request-column guest-request-column-${column.key}`}
                key={
                  column.key
                }
              >
                <div className="guest-request-column-header">
                  <div>
                    <span>
                      <Icon />
                    </span>

                    <div>
                      <h3>
                        {
                          column.label
                        }
                      </h3>

                      <p>
                        {
                          column.description
                        }
                      </p>
                    </div>
                  </div>

                  <strong>
                    {
                      items.length
                    }
                  </strong>
                </div>

                <div className="guest-request-card-list">
                  {items.length >
                  0 ? (
                    items.map(
                      (
                        inquiry
                      ) => (
                        <RequestCard
                          key={
                            inquiry.id
                          }
                          inquiry={
                            inquiry
                          }
                          onReview={
                            openReview
                          }
                        />
                      )
                    )
                  ) : (
                    <div className="guest-request-empty">
                      <Icon />

                      <strong>
                        Nothing here
                      </strong>

                      <span>
                        {column.key ===
                        "pending"
                          ? "New guest submissions will appear here."
                          : `No ${column.label.toLowerCase()} requests yet.`}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            );
          }
        )}
      </div>


      {selectedInquiry && (
        <div
          className="guest-request-modal-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeReview();
            }
          }}
        >
          <section
            className="guest-request-modal"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <div className="guest-request-modal-badges">
                  <span className="guest-request-source-badge">
                    Guest Web Form
                  </span>

                  <span
                    className={`guest-request-status-badge guest-request-status-${statusKey(
                      selectedInquiry
                    )}`}
                  >
                    {statusLabel(
                      selectedInquiry
                    )}
                  </span>
                </div>

                <h2>
                  {selectedInquiry.organization_name ||
                    "Unnamed Group"}
                </h2>

                <p>
                  Submitted{" "}
                  {formatSubmitted(
                    selectedInquiry.submitted_at
                  )}
                </p>
              </div>

              <button
                type="button"
                className="guest-request-modal-close"
                onClick={
                  closeReview
                }
              >
                <FaTimes />
              </button>
            </header>


            <div className="guest-request-modal-body">
              <section className="guest-request-review-section">
                <header>
                  <FaUser />

                  <div>
                    <h3>
                      Contact
                    </h3>

                    <p>
                      Group leader and contact information.
                    </p>
                  </div>
                </header>

                <div className="guest-request-detail-grid">
                  <DetailField
                    icon={
                      FaUser
                    }
                    label="Primary Contact"
                    value={
                      selectedInquiry.contact_name
                    }
                  />

                  <DetailField
                    icon={
                      FaEnvelope
                    }
                    label="Email"
                    value={
                      selectedInquiry.email
                    }
                  />

                  <DetailField
                    icon={
                      FaPhone
                    }
                    label="Phone"
                    value={
                      selectedInquiry.phone
                    }
                  />

                  <DetailField
                    icon={
                      FaMapMarkerAlt
                    }
                    label="Mailing Address"
                    value={
                      selectedInquiry.mailing_address
                    }
                  />
                </div>
              </section>


              <section className="guest-request-review-section">
                <header>
                  <FaCalendarAlt />

                  <div>
                    <h3>
                      Stay & Guests
                    </h3>

                    <p>
                      Requested stay and estimated attendance.
                    </p>
                  </div>
                </header>

                <div className="guest-request-detail-grid">
                  <DetailField
                    icon={
                      FaCalendarAlt
                    }
                    label="Requested Stay"
                    value={formatDateRange(
                      selectedInquiry.start_date,
                      selectedInquiry.end_date
                    )}
                  />

                  <DetailField
                    label="Arrival Time"
                    value={formatTime(
                      selectedInquiry.arrival_time
                    )}
                  />

                  <DetailField
                    label="Departure Time"
                    value={formatTime(
                      selectedInquiry.departure_time
                    )}
                  />

                  <DetailField
                    icon={
                      FaUsers
                    }
                    label="Estimated Total"
                    value={
                      selectedInquiry.approx_total_guests
                    }
                  />

                  <DetailField
                    label="Adults"
                    value={
                      selectedInquiry.approx_adult_guests
                    }
                  />

                  <DetailField
                    label="Children 3–17"
                    value={
                      selectedInquiry.approx_children_3_to_17
                    }
                  />

                  <DetailField
                    label="Children Under 3"
                    value={
                      selectedInquiry.approx_children_under_3
                    }
                  />

                  <DetailField
                    label="# Nights"
                    value={
                      selectedInquiry.number_of_nights
                    }
                  />
                </div>
              </section>


              <section className="guest-request-review-section">
                <header>
                  <FaUtensils />

                  <div>
                    <h3>
                      Meals & Dietary
                    </h3>

                    <p>
                      Meal plan, service times, and dietary needs.
                    </p>
                  </div>
                </header>

                <div className="guest-request-detail-grid">
                  <DetailField
                    label="Total Meals"
                    value={
                      selectedMeals.total ||
                      selectedInquiry.number_of_meals ||
                      0
                    }
                  />

                  <DetailField
                    label="Meal Breakdown"
                    value={`Breakfast ${selectedMeals.breakfast} · Lunch ${selectedMeals.lunch} · Dinner ${selectedMeals.dinner}`}
                  />

                  <DetailField
                    label="Breakfast Time"
                    value={formatTime(
                      selectedInquiry.breakfast_time
                    )}
                  />

                  <DetailField
                    label="Lunch Time"
                    value={formatTime(
                      selectedInquiry.lunch_time
                    )}
                  />

                  <DetailField
                    label="Dinner Time"
                    value={formatTime(
                      selectedInquiry.dinner_time
                    )}
                  />
                </div>

                {selectedAllergies.length >
                  0 && (
                  <div className="guest-request-list-box">
                    <strong>
                      Allergies / Dietary Restrictions
                    </strong>

                    {selectedAllergies.map(
                      (
                        allergy,
                        index
                      ) => (
                        <span
                          key={`${allergy.name}-${index}`}
                        >
                          <b>
                            {allergy.count ||
                              "—"}
                          </b>

                          {allergy.name ||
                            "Unnamed restriction"}
                        </span>
                      )
                    )}
                  </div>
                )}

                {(selectedInquiry.allergy_notes ||
                  selectedInquiry.meal_notes) && (
                  <div className="guest-request-note-grid">
                    {selectedInquiry.allergy_notes && (
                      <div>
                        <strong>
                          Allergy Notes
                        </strong>

                        <p>
                          {
                            selectedInquiry.allergy_notes
                          }
                        </p>
                      </div>
                    )}

                    {selectedInquiry.meal_notes && (
                      <div>
                        <strong>
                          Meal Notes
                        </strong>

                        <p>
                          {
                            selectedInquiry.meal_notes
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>


              <section className="guest-request-review-section">
                <header>
                  <FaHiking />

                  <div>
                    <h3>
                      Activities & Linens
                    </h3>

                    <p>
                      Program requests and linen needs.
                    </p>
                  </div>
                </header>

                <div className="guest-request-detail-grid">
                  <DetailField
                    icon={
                      FaBed
                    }
                    label="Linens"
                    value={getLinenSummary(
                      selectedInquiry
                    )}
                    wide
                  />

                  <DetailField
                    icon={
                      FaHiking
                    }
                    label="Activities"
                    value={
                      selectedActivities.length
                        ? `${selectedActivities.length} requested`
                        : "No activities requested"
                    }
                    wide
                  />
                </div>

                {selectedActivities.length >
                  0 && (
                  <div className="guest-request-activity-list">
                    {selectedActivities.map(
                      (
                        activity,
                        index
                      ) => (
                        <div
                          key={`${activity.date}-${activity.time}-${activity.activity}-${index}`}
                        >
                          <span>
                            {formatDate(
                              activity.date
                            )}
                          </span>

                          <span>
                            {formatTime(
                              activity.time
                            )}
                          </span>

                          <strong>
                            {activity.activity ||
                              "Activity"}
                          </strong>
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>


              <section className="guest-request-review-section">
                <header>
                  <FaFileContract />

                  <div>
                    <h3>
                      Guest-Reported Documents
                    </h3>

                    <p>
                      Staff should verify these before entering official received dates.
                    </p>
                  </div>
                </header>

                <div className="guest-request-detail-grid">
                  <DetailField
                    icon={
                      FaFileContract
                    }
                    label="Contract Returned"
                    value={formatDate(
                      selectedInquiry.contract_returned_date
                    )}
                  />

                  <DetailField
                    icon={
                      FaDollarSign
                    }
                    label="Deposit Sent"
                    value={formatDate(
                      selectedInquiry.deposit_sent_date
                    )}
                  />

                  <DetailField
                    icon={
                      FaDollarSign
                    }
                    label="Deposit Amount"
                    value={formatMoney(
                      selectedInquiry.deposit_amount
                    )}
                  />

                  <DetailField
                    label="Payment Method"
                    value={
                      selectedInquiry.payment_method
                    }
                  />

                  <DetailField
                    icon={
                      FaShieldAlt
                    }
                    label="Insurance Certificate Sent"
                    value={formatDate(
                      selectedInquiry.insurance_certificate_sent_date
                    )}
                    wide
                  />
                </div>
              </section>


              {selectedInquiry.notes && (
                <section className="guest-request-review-section">
                  <header>
                    <FaClipboardList />

                    <div>
                      <h3>
                        Additional Notes
                      </h3>

                      <p>
                        Information supplied by the group leader.
                      </p>
                    </div>
                  </header>

                  <div className="guest-request-long-note">
                    {
                      selectedInquiry.notes
                    }
                  </div>
                </section>
              )}


              {statusKey(
                selectedInquiry
              ) ===
                "declined" && (
                <section className="guest-request-review-section">
                  <header>
                    <FaTimesCircle />

                    <div>
                      <h3>
                        Decline Record
                      </h3>

                      <p>
                        Why staff closed this request.
                      </p>
                    </div>
                  </header>

                  <div className="guest-request-long-note">
                    {selectedInquiry.declined_reason ||
                      "No reason was recorded."}
                  </div>
                </section>
              )}


              {statusKey(
                selectedInquiry
              ) ===
                "converted" && (
                <section className="guest-request-review-section">
                  <header>
                    <FaCheckCircle />

                    <div>
                      <h3>
                        Converted Booking
                      </h3>

                      <p>
                        This request has already become a booking.
                      </p>
                    </div>
                  </header>

                  <div className="guest-request-detail-grid">
                    <DetailField
                      label="Booking ID"
                      value={
                        selectedInquiry.converted_booking_id
                      }
                      wide
                    />
                  </div>
                </section>
              )}


              {showDecline && (
                <section className="guest-request-decline-box">
                  <div>
                    <strong>
                      Decline this inquiry?
                    </strong>

                    <p>
                      It will stay in the database and move to the Declined column.
                    </p>
                  </div>

                  <label>
                    <span>
                      Reason (optional)
                    </span>

                    <textarea
                      rows="3"
                      value={
                        declineReason
                      }
                      onChange={(
                        event
                      ) =>
                        setDeclineReason(
                          event.target.value
                        )
                      }
                      placeholder="Example: Requested dates unavailable."
                    />
                  </label>

                  <div>
                    <button
                      type="button"
                      className="guest-request-secondary-button"
                      onClick={() =>
                        setShowDecline(
                          false
                        )
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="guest-request-danger-button"
                      onClick={
                        declineSelectedInquiry
                      }
                      disabled={
                        isUpdating
                      }
                    >
                      <FaTimesCircle />

                      {isUpdating
                        ? "Declining..."
                        : "Confirm Decline"}
                    </button>
                  </div>
                </section>
              )}
            </div>


            <footer className="guest-request-modal-footer">
              <button
                type="button"
                className="guest-request-secondary-button"
                onClick={
                  closeReview
                }
              >
                Close
              </button>

              {statusKey(
                selectedInquiry
              ) ===
                "pending" && (
                <div>
                  {!showDecline && (
                    <button
                      type="button"
                      className="guest-request-danger-ghost-button"
                      onClick={() =>
                        setShowDecline(
                          true
                        )
                      }
                    >
                      <FaTimesCircle />
                      Decline Inquiry
                    </button>
                  )}

                  <button
                    type="button"
                    className="guest-request-primary-button"
                    onClick={
                      openBookingForm
                    }
                  >
                    <FaClipboardList />
                    Open Prefilled Booking Form
                  </button>
                </div>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
