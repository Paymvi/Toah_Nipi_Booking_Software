import {
  FaCalendarAlt,
  FaClock,
  FaBed,
  FaUser,
  FaUsers,
  FaDollarSign,
  FaInfoCircle,
  FaUtensils,
  FaChevronRight,
  FaExternalLinkAlt,
  FaChild,
  FaUserMinus,
  FaUserPlus,
  FaGlobeAmericas,
  FaMoon,
} from "react-icons/fa";
import { LODGING_BUILDINGS } from "../../constants/lodgingConstants";
import { getBookingLodgingAssignments } from "../../utils/lodgingUtils";
import { isHousingAuthoritative } from "../../utils/masterImportMerge";
import { getBookingDisplayState } from "../../utils/bookingClassification";
import { getLegacyBookingNotes } from "../../utils/legacyBookingNotes";
import CopyButton from "../CopyButton";
import { formatMealTime as formatBookingOverviewTime } from "../../utils/mealPlan";
import { getSecondaryContact } from "../../utils/secondaryContact";
import {
  getBookingOverviewSourceType,
  firstBookingOverviewValue,
  getBookingRawValue,
  parseBookingOverviewNumber,
  getBookingOverviewNights,
  getBookingOverviewMailingAddress,
  hasBookingOverviewValue,
  formatBookingOverviewMoney,
  hasVisibleOverviewFields,
  getBookingInitials,
  formatBookingOverviewValue,
} from "./bookingOverviewValues";
import { formatBookingDetailDate, formatBookingDetailDateRange } from "./bookingDetailSettings";
import { BookingOverviewPortalLink } from "./BookingOverviewHeader";
import {
  BookingOverviewGuestShowcase,
  BookingActivitiesLargeOverview,
  BookingFacilitiesLargeOverview,
  BookingOverviewLargeSourceData,
} from "./BookingOverviewLarge";
import {
  BookingOverviewLargeSection,
  BookingOverviewFieldGrid,
  BookingOverviewSection,
  BookingOverviewFields,
  BookingOverviewEmptyRow,
  BookingOverviewFieldGroup,
  BookingOverviewEditButton,
} from "./BookingOverviewParts";
import BookingMealsProgramOverview from "./BookingMealsProgramOverview";
import BookingIncidentNotesCard from "./BookingIncidentNotesCard";
import {
  BookingOverviewGuests,
  BookingActivitiesOverview,
  BookingFacilitiesOverview,
  BookingOverviewSourceData,
} from "./BookingOverviewCompact";

export default function BookingOverview({
  booking,
  dateSettings,
  setActiveTab,
  onSaveBooking,
  onCreatePortalLink,
  isLarge,
}) {
  const details =
    booking.rentalFormDetails || {};

  const secondaryContact = getSecondaryContact(booking);
  const hasSecondaryContact =
    Object.values(secondaryContact).some(Boolean);

  const sourceType =
    getBookingOverviewSourceType(booking);

  const normalizedSourceType =
    String(sourceType)
      .trim()
      .toLowerCase();

  const isMasterRecord =
    /^master 20\d{2}$/.test(normalizedSourceType);

  const isArchiveRecord =
    normalizedSourceType.includes(
      "archive"
    ) ||
    String(booking.retreatType || "")
      .trim()
      .toLowerCase() === "archive";


  /* =====================================================
     VALUES THAT CAN COME FROM DIFFERENT SOURCES
  ===================================================== */

  const actualAdults =
    firstBookingOverviewValue(
      details.actualAdultGuests,

      getBookingRawValue(booking, [
        "Actual # of Adults",
        "Actual Adults",
      ])
    );

  const approxChildrenUnder3 =
    firstBookingOverviewValue(
      details.approxChildrenUnder3,

      getBookingRawValue(booking, [
        "Approx. # of Minors under 3",
        "Approx # of Minors under 3",
        "Estimated # of Minors under 3",
      ])
    );

  const approxChildren3to17 =
    firstBookingOverviewValue(
      details.approxChildren3to17,
      details.approxChildrenGuests,

      getBookingRawValue(booking, [
        "Approx. # of Minors 3 to 17",
        "Approx # of Minors 3 to 17",
        "Estimated # of Minors 3 to 17",
      ])
    );

  const actualChildrenUnder3 =
    firstBookingOverviewValue(
      details.actualChildrenUnder3,

      getBookingRawValue(booking, [
        "Actual # of Minors under 3",
        "Minors under 3",
      ])
    );

  const actualChildren3to17 =
    firstBookingOverviewValue(
      details.actualChildren3to17,
      details.actualChildrenGuests,

      getBookingRawValue(booking, [
        "Actual # of Minors 3 to 17",
        "Minors 3 to 17",
        "Actual # of Children",
        "Actual Children",
      ])
    );

  const importedDayUseGuests =
    getBookingRawValue(booking, [
      "Actual # of Day Use Guests",
      "Day Use Guests",
    ]);

  const dayCamperCount =
    firstBookingOverviewValue(
      details.dayCamperCount,
      importedDayUseGuests
    );

  const dayCamperMeals =
    firstBookingOverviewValue(
      details.dayCamperMeals
    );

  const parsedDayCamperCount =
    parseBookingOverviewNumber(
      dayCamperCount
    );

  const parsedDayCamperMeals =
    parseBookingOverviewNumber(
      dayCamperMeals
    );

  const dayCamperMealServings =
    firstBookingOverviewValue(
      details.dayCamperMealServings,

      parsedDayCamperCount !== null &&
      parsedDayCamperMeals !== null
        ? String(
            parsedDayCamperCount *
            parsedDayCamperMeals
          )
        : ""
    );

  const parsedDayCamperMealServings =
    parseBookingOverviewNumber(
      dayCamperMealServings
    );

  const dayCamperCamperDays =
    firstBookingOverviewValue(
      details.dayCamperCamperDays,

      parsedDayCamperMealServings !== null
        ? String(
            parsedDayCamperMealServings *
            0.2
          )
        : ""
    );

  const minimumGuarantee =
    firstBookingOverviewValue(
      details.minimumGuarantee,
      booking.minPayingGuests
    );

  const maximumGuarantee =
    firstBookingOverviewValue(
      details.maximumGuarantee,
      booking.maxPayingGuests
    );

  const numberOfNights =
    getBookingOverviewNights(booking, details);

  const numberOfMeals =
    firstBookingOverviewValue(
      details.numberOfMeals,
      booking.mealCount
    );

  const mailingAddress =
    getBookingOverviewMailingAddress(booking, details);

  const adultRate =
    firstBookingOverviewValue(
      details.adultRateQuoted,
      booking.guestRate
    );

  const depositAmount =
    firstBookingOverviewValue(
      details.depositAmount,
      booking.deposit
    );

  const depositReceived =
    firstBookingOverviewValue(
      details.depositReceivedDate
        ? formatBookingDetailDate(
            details.depositReceivedDate,
            dateSettings
          )
        : "",
      booking.depositReceived
    );


  /* =====================================================
     SUMMARY
  ===================================================== */

  const summaryDateRange =
    formatBookingDetailDateRange(
      booking.startDate,
      booking.endDate,
      dateSettings
    );

  const summaryGuests =
    firstBookingOverviewValue(
      booking.attendeeCount,
      booking.persons
    );

  const hasApproxAdults =
    hasBookingOverviewValue(
      details.approxAdultGuests
    );

  const hasApproxChildrenUnder3 =
    hasBookingOverviewValue(
      approxChildrenUnder3
    );

  const hasApproxChildren3to17 =
    hasBookingOverviewValue(
      approxChildren3to17
    );

  const calculatedApproxTotal =
    hasApproxAdults ||
    hasApproxChildrenUnder3 ||
    hasApproxChildren3to17
      ? String(
          Number(
            details.approxAdultGuests || 0
          ) +
          Number(
            approxChildrenUnder3 || 0
          ) +
          Number(
            approxChildren3to17 || 0
          )
        )
      : "";

  /*
    Match CreateBooking's save behavior:
    prefer the detailed adult/child breakdown when
    one exists, then fall back to the original
    estimated total from an inquiry/import.
  */
  const estimatedGuests =
    firstBookingOverviewValue(
      calculatedApproxTotal,
      details.approxTotalGuests,
      summaryGuests
    );

  const hasActualAdults =
    String(actualAdults || "").trim() !== "";

  const hasActualChildrenUnder3 =
    String(actualChildrenUnder3 || "").trim() !== "";

  const hasActualChildren3to17 =
    String(actualChildren3to17 || "").trim() !== "";

  const calculatedActualTotal =
    hasActualAdults ||
    hasActualChildrenUnder3 ||
    hasActualChildren3to17
      ? String(
          Number(actualAdults || 0) +
          Number(actualChildrenUnder3 || 0) +
          Number(actualChildren3to17 || 0)
        )
      : "";

  // Master totals may include a partial age breakdown or day-use guests.
  // Estimated 2027 totals must not be presented as actual attendance.
  const actualGuests = isMasterRecord
    ? details.importedGuestCountKind === "estimated"
      ? calculatedActualTotal
      : firstBookingOverviewValue(summaryGuests, calculatedActualTotal)
    : firstBookingOverviewValue(calculatedActualTotal, summaryGuests);



  /* =====================================================
    CREATE-BOOKING-STYLE OVERVIEW GROUPS
  ===================================================== */


  /* =====================================================
    GUEST INFORMATION
  ===================================================== */

  const approximateGuestFields = [
    {
      label: "Estimated Total Guests",
      value: estimatedGuests,
      icon: FaUsers,
    },

    {
      label: "Adults",
      value: details.approxAdultGuests,
      icon: FaUser,
    },

    {
      label: "Under 3",
      value: approxChildrenUnder3,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "Ages 3–17",
      value: approxChildren3to17,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "Minimum Guarantee",
      value: minimumGuarantee,
      icon: FaUserMinus,
    },

    {
      label: "Maximum Guarantee",
      value: maximumGuarantee,
      icon: FaUserPlus,
    },
  ];


  const actualGuestFields = [
    {
      label: "Total / Recorded Guests",
      value: actualGuests,
      showEmpty: true,
      icon: FaUsers,
    },

    {
      label: "Adults",
      value: actualAdults,
      icon: FaUser,
    },

    {
      label: "Under 3",
      value: actualChildrenUnder3,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "Ages 3–17",
      value: actualChildren3to17,
      icon: FaChild,
      showEmpty: true,
    },

    {
      label: "# Persons",
      value: booking.persons,
      icon: FaUsers,
    },

    {
      label: "Ethnic Breakdown",
      value: details.ethnicBreakdown,
      icon: FaGlobeAmericas,
      multiline: true,
    },
  ];


  const dayCamperFields = [
    {
      label: "# of Day Campers",
      value: dayCamperCount,
      icon: FaUsers,
    },

    {
      label: "Meals per Camper",
      value: dayCamperMeals,
      icon: FaUtensils,
    },

    {
      label: isLarge ? "Day Camper Meal Servings" : "Meal Servings",
      value: dayCamperMealServings,
      icon: FaUtensils,
    },

    {
      label: isLarge ? "Camper Days from Day Campers" : "Camper Days",
      value: hasBookingOverviewValue(
        dayCamperCamperDays
      )
        ? Number(
            dayCamperCamperDays
          ).toFixed(3)
        : "",
      icon: FaCalendarAlt,
    },
  ];

  const rateFields = [
    {
      label: "Adult / Guest Rate",
      value: formatBookingOverviewMoney(
        adultRate
      ),
      icon: FaDollarSign,
    },

    {
      label: "Child Rate (3–17)",
      value: formatBookingOverviewMoney(
        details.childRateQuoted
      ),
      icon: FaDollarSign,
    },

    {
      label: "Child Rate (1–3, spreadsheet)",
      value: formatBookingOverviewMoney(
        details.childUnder3RateQuoted
      ),
      icon: FaDollarSign,
    },

  ];

  const ratesAndStayFields = [
    ...rateFields,

    {
      label: "# Nights",
      value: numberOfNights,
      icon: FaMoon,
    },

    {
      label: "# Meals",
      value: numberOfMeals,
      icon: FaUtensils,
    },

    {
      label: "Camper Days",
      value: booking.camperDays,
      icon: FaCalendarAlt,
    },
  ];


  /* =====================================================
    BOOKING TIMELINE
  ===================================================== */

  const timelineFields = [
    {
      label: "Inquiry Date",
      value: details.inquiryDate
        ? formatBookingDetailDate(
            details.inquiryDate,
            dateSettings
          )
        : "",
    },

    {
      label: "Contract Sent",
      value: details.contractSentDate
        ? formatBookingDetailDate(
            details.contractSentDate,
            dateSettings
          )
        : details.importedContractSentStatus || "",
    },

    {
      label: "Return Contract By",
      value: details.returnContractByDate
        ? formatBookingDetailDate(
            details.returnContractByDate,
            dateSettings
          )
        : "",
    },

    {
      label: "Contract Returned",
      value: details.contractReturnedDate
        ? formatBookingDetailDate(
            details.contractReturnedDate,
            dateSettings
          )
        : details.importedContractReturnedStatus || "",
    },
  ];


  /* =====================================================
    PAYMENTS & DOCUMENTS
  ===================================================== */

  const paymentDocumentFields = [
    {
      label: "Deposit Received",
      value: depositReceived,
    },

    {
      label: "Deposit Amount",
      value: formatBookingOverviewMoney(
        depositAmount
      ),
    },

    {
      label: "Insurance Certificate",
      value:
        details.insuranceCertificateDate
          ? formatBookingDetailDate(
              details.insuranceCertificateDate,
              dateSettings
            )
          : "",
    },

    {
      label: "Notification Date",
      value: details.notificationDate
        ? formatBookingDetailDate(
            details.notificationDate,
            dateSettings
          )
        : "",
    },

    {
      label: "Payment Method",
      value: details.paymentMethod,
    },
  ];


  const guestReportedDocumentFields = [
    {
      label: isLarge ? "Guest Reported Contract Returned" : "Contract Returned",
      value:
        details.guestReportedContractReturnedDate
          ? formatBookingDetailDate(
              details.guestReportedContractReturnedDate,
              dateSettings
            )
          : "",
    },

    {
      label: isLarge ? "Guest Reported Deposit Sent" : "Deposit Sent",
      value:
        details.guestReportedDepositSentDate
          ? formatBookingDetailDate(
              details.guestReportedDepositSentDate,
              dateSettings
            )
          : "",
    },

    {
      label: isLarge ? "Guest Reported Insurance Sent" : "Insurance Sent",
      value:
        details.guestReportedInsuranceCertificateSentDate
          ? formatBookingDetailDate(
              details.guestReportedInsuranceCertificateSentDate,
              dateSettings
            )
          : "",
    },
  ];


  const billingFields = [
    {
      label: "Expected Minimum Revenue",
      value: formatBookingOverviewMoney(
        booking.expectedMinimumRevenue
      ),
    },

    {
      label: "Invoice — Lodging & Meals",
      value: formatBookingOverviewMoney(
        booking.invoiceLodgingMeals
      ),
    },

    {
      label: "Usage Fee",
      value: formatBookingOverviewMoney(
        booking.usageFee
      ),
    },

    {
      label: "Lodging",
      value: formatBookingOverviewMoney(
        booking.lodgingCost
      ),
    },

    {
      label: "Food",
      value: formatBookingOverviewMoney(
        booking.foodCost
      ),
    },

    {
      label: "Misc.",
      value: formatBookingOverviewMoney(
        booking.miscCost
      ),
    },

    {
      label: "Monthly Projected Income",
      value: formatBookingOverviewMoney(
        booking.monthlyProjectedIncome
      ),
    },
  ];


/* =====================================================
  LODGING & LINENS
===================================================== */

// Same building list and lodging reader as every other screen (AUDIT-031).
const overviewLodgingAssignments =
  getBookingLodgingAssignments(booking);

const lodgingOverviewRows = LODGING_BUILDINGS.map((building) => {
  const assignment = overviewLodgingAssignments.find(
    (entry) => entry.buildingId === building.id
  );

  return {
    id: building.id,
    name: building.label,
    capacity: building.capacity,
    image: building.image,
    value: assignment
      ? assignment.count ?? "Used, count unknown"
      : "",
  };
});

const getLodgingOverviewValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return isMasterRecord ? "-" : 0;
  }

  return value;
};

const overviewLinenOption =
  details?.linenOption || (isMasterRecord ? "Not recorded" : "None");

const overviewLinenSets =
  firstBookingOverviewValue(
    details?.linenSets,
    isMasterRecord ? "" : booking.linenSets
  ) || (isMasterRecord ? "-" : 0);

const overviewLinenPieces =
  firstBookingOverviewValue(
    details?.linenPieces,
    isMasterRecord ? "" : booking.linenPieces
  ) || (isMasterRecord ? "-" : 0);

  /* =====================================================
    BOOKING STATUS
  ===================================================== */

  const statusFields = [
    {
      label: "Recorded Status",
      value:
        String(booking.status || "").trim().toLowerCase() ===
        getBookingDisplayState(booking).label.toLowerCase()
          ? ""
          : booking.status,
    },

    {
      label: "Stage of Group",
      value: firstBookingOverviewValue(
        booking.stageOfGroup,
        booking.inquiryDisposition
      ),
    },

    {
      label: "Returning / New",
      value: booking.returningStatus,
    },

    {
      label: "Waitlist",
      value: booking.waitlist,
    },
  ];


  const cancellationFields = [
    {
      label: "Date of Cancellation",
      value: booking.dateOfCancellation
        ? formatBookingDetailDate(
            booking.dateOfCancellation,
            dateSettings
          )
        : "",
    },

    {
      label: "Reason for Cancellation",
      value:
        booking.reasonForCancellation,
      multiline: true,
    },

    {
      label: "Vacancy Filled",
      value: booking.vacancyFilled,
    },
  ];


  /* =====================================================
    NOTES
  ===================================================== */

  const notesFields = [
    {
      label: "Booking Notes",
      value: booking.notes,
      multiline: true,
    },
    {
      label: "Spreadsheet Guest Description",
      value: isLarge && isMasterRecord ? details.importedGuestCountText : "",
      multiline: true,
    },
    {
      label: "Import Review",
      value: Array.isArray(details.importWarnings)
        ? details.importWarnings.join("\n")
        : "",
      multiline: true,
    },
    ...getLegacyBookingNotes(booking).additional.map((note) => ({
      label: note.label,
      value: note.text,
      multiline: true,
    })),
  ];


  const archiveFields = [
    { label: "Guest Group", value: booking.archiveGuestGroup },
    {
      label: "Visit Date",
      value: booking.archiveVisitDate
        ? formatBookingDetailDate(booking.archiveVisitDate, dateSettings)
        : "",
    },
    {
      label: "All Prior Visit Dates",
      value: booking.archiveAllPriorVisitDates,
      multiline: true,
    },
    { label: "Visit Count", value: booking.archiveVisitCount },
  ];

  const archiveLinks =
    Array.isArray(
      booking.archivePriorVisitLinks
    )
      ? booking.archivePriorVisitLinks
      : [];

  const hasTimelineCard = hasVisibleOverviewFields([
    ...timelineFields,
    ...statusFields,
    ...cancellationFields,
  ]);


  if (isLarge) {
    return (
      <div className="booking-overview-layout">

        {/* =====================================================
            LEFT PROFILE COLUMN
        ===================================================== */}

        <aside className="booking-overview-sidebar" data-tutorial-target="booking-overview-summary">

          <div className="booking-overview-identity">

            <div className="booking-overview-avatar">
              {getBookingInitials(
                booking.organizationName
              )}
            </div>

            <p>
              {sourceType}
            </p>

            <h3>
              {booking.organizationName}
            </h3>

            <span>
              {booking.retreatType ||
                "Retreat Booking"}
            </span>

          </div>


          <div className="booking-overview-sidebar-section">

            <div className="booking-overview-sidebar-heading">
              <FaCalendarAlt />

              <span>
                Stay Dates
              </span>
            </div>

            <strong>
              {summaryDateRange}
            </strong>

            {(details.arrivalTime ||
              details.departureTime) && (
              <div className="booking-overview-sidebar-times">

                {details.arrivalTime && (
                  <span>
                    <small>Arrival</small>
                    <strong>
                      {formatBookingOverviewTime(details.arrivalTime)}
                    </strong>
                  </span>
                )}

                {details.departureTime && (
                  <span>
                    <small>Departure</small>
                    <strong>
                      {formatBookingOverviewTime(details.departureTime)}
                    </strong>
                  </span>
                )}

              </div>
            )}

          </div>


          <div className="booking-overview-sidebar-section">

            <div className="booking-overview-sidebar-heading">
              <FaUser />

              <span>
                Primary Contact
              </span>
            </div>

            <strong>
              {formatBookingOverviewValue(
                booking.contactName
              )}
            </strong>

            {hasBookingOverviewValue(
              booking.email
            ) && (
              <span className="booking-overview-sidebar-contact-line">
                <a
                  href={`mailto:${booking.email}`}
                >
                  {booking.email}
                </a>
                <CopyButton value={booking.email} label="email address" />
              </span>
            )}

            {hasBookingOverviewValue(
              booking.phone
            ) && (
              <span className="booking-overview-sidebar-contact-line">
                {booking.phone}
                <CopyButton value={booking.phone} label="phone number" />
              </span>
            )}

            {hasBookingOverviewValue(
              mailingAddress
            ) && (
              <span className="booking-overview-sidebar-contact-line">
                {mailingAddress}
              </span>
            )}

          </div>


          {hasSecondaryContact && (
            <div className="booking-overview-sidebar-section">
              <div className="booking-overview-sidebar-heading">
                <FaUserPlus />
                <span>Secondary Contact</span>
              </div>

              {secondaryContact.secondaryContactName && (
                <strong>{secondaryContact.secondaryContactName}</strong>
              )}

              {secondaryContact.secondaryContactEmail && (
                <span className="booking-overview-sidebar-contact-line">
                  <a href={`mailto:${secondaryContact.secondaryContactEmail}`}>
                    {secondaryContact.secondaryContactEmail}
                  </a>
                  <CopyButton value={secondaryContact.secondaryContactEmail} label="secondary contact email address" />
                </span>
              )}

              {secondaryContact.secondaryContactPhone && (
                <span className="booking-overview-sidebar-contact-line">
                  <a href={`tel:${secondaryContact.secondaryContactPhone.replace(/[^\d+]/g, "")}`}>
                    {secondaryContact.secondaryContactPhone}
                  </a>
                  <CopyButton value={secondaryContact.secondaryContactPhone} label="secondary contact phone number" />
                </span>
              )}
            </div>
          )}


          <div className="booking-overview-sidebar-stats" data-tutorial-target="booking-overview-stats">

            <div>
              <small>Guests</small>

              <strong>
                {formatBookingOverviewValue(
                  actualGuests
                )}
              </strong>
            </div>


            <div>
              <small>Nights</small>

              <strong>
                {formatBookingOverviewValue(
                  numberOfNights
                )}
              </strong>
            </div>


            <div>
              <small>Meals</small>

              <strong>
                {formatBookingOverviewValue(
                  numberOfMeals
                )}
              </strong>
            </div>

          </div>


          <div className="booking-overview-sidebar-actions">

            <button
              className="primary-dashboard-button"
              type="button"
              onClick={() =>
                setActiveTab("Details")
              }
              data-tutorial-target="booking-overview-edit"
            >
              Edit Booking
            </button>

            <BookingOverviewPortalLink booking={booking} onCreatePortalLink={onCreatePortalLink} />

          </div>


          {(booking.sourceSheet ||
            booking.sourceRowNumber) && (
            <div className="booking-overview-source-meta">

              {booking.sourceSheet && (
                <span>
                  <small>Source</small>
                  {booking.sourceSheet}
                </span>
              )}

              {booking.sourceRowNumber && (
                <span>
                  <small>Row</small>
                  {booking.sourceRowNumber}
                </span>
              )}

            </div>
          )}

        </aside>


        {/* =====================================================
            MAIN CONTENT
        ===================================================== */}

        <main className="booking-overview-main" data-tutorial-target="booking-overview-main">

          <div className="booking-overview-grid">

            {/* =====================================================
                GUEST INFORMATION
            ===================================================== */}

            <BookingOverviewGuestShowcase
              estimatedGuests={estimatedGuests}
              actualGuests={actualGuests}
              minimumGuarantee={minimumGuarantee}
              maximumGuarantee={maximumGuarantee}
              numberOfNights={numberOfNights}
              numberOfMeals={numberOfMeals}
              approximateGuestFields={approximateGuestFields}
              actualGuestFields={actualGuestFields}
              dayCamperFields={dayCamperFields}
              ratesAndStayFields={ratesAndStayFields}
              setActiveTab={setActiveTab}
            />


            {/* =====================================================
                PAYMENTS + DOCUMENTS
            ===================================================== */}

            <BookingOverviewLargeSection
              icon={FaDollarSign}
              eyebrow="Administration"
              title="Payments & Documents"
              wide
              className="booking-overview-payments-card"
              groups={[
                {
                  title: "Deposit & Documents",
                  fields: paymentDocumentFields,
                  columns: 2,
                },
                {
                  title: "Guest-Reported Portal Dates",
                  fields: guestReportedDocumentFields,
                  columns: 2,
                },
                {
                  title: "Billing & Revenue",
                  fields: billingFields,
                  columns: 2,
                },
              ]}
            />


            {/* =====================================================
                MEALS
            ===================================================== */}

            <BookingMealsProgramOverview
              booking={booking}
              details={details}
              isLarge
            />


            {/* =====================================================
                ACTIVITIES
            ===================================================== */}

            <BookingActivitiesLargeOverview
              booking={booking}
              details={details}
              dateSettings={dateSettings}
            />


            {/* =====================================================
                FACILITIES
            ===================================================== */}

            <BookingFacilitiesLargeOverview
              booking={booking}
              details={details}
              dateSettings={dateSettings}
            />


            {/* =====================================================
                LODGING
            ===================================================== */}

            <section className="rental-form-section booking-overview-lodging-section">

              <div className="rental-section-header">
                <span className="rental-section-icon">
                  <FaBed />
                </span>

                <div>
                  <h2>Lodging & Linens</h2>

                  <p>
                    Guest assignments and linen requirements.
                  </p>
                </div>

                <button
                  className="secondary-dashboard-button booking-overview-housing-link"
                  type="button"
                  onClick={() => setActiveTab("Housing")}
                >
                  Go to Housing
                  <FaChevronRight aria-hidden="true" />
                </button>
              </div>


              <div className="rental-section-body">

                {isMasterRecord && (
                  <BookingOverviewFieldGrid
                    columns={1}
                    fields={[
                      {
                        label: isHousingAuthoritative(booking)
                          ? "Imported lodging note (reference only; the Housing tab is the lodging record)"
                          : "Spreadsheet Lodging",
                        value: details.importedLodgingText,
                        multiline: true,
                      },
                      {
                        label: "Spreadsheet Linen Instructions",
                        value: details.importedLinenText,
                        multiline: true,
                      },
                    ]}
                  />
                )}

                {/* ===============================
                    LODGING
                =============================== */}

                <div className="rental-lodging-grid">
                  {lodgingOverviewRows.map((lodging) => (
                    <div
                      className="rental-lodging-field booking-overview-lodging-card"
                      key={lodging.id}
                    >
                      <div className="rental-lodging-info">

                        {lodging.image && (
                          <img
                            className="rental-lodging-image"
                            src={lodging.image}
                            alt=""
                          />
                        )}

                        <span className="rental-lodging-text">
                          <strong>{lodging.name}</strong>

                          {lodging.capacity && (
                            <small>
                              Capacity {lodging.capacity}
                            </small>
                          )}
                        </span>

                      </div>


                      <div className="booking-overview-lodging-count">
                        {getLodgingOverviewValue(
                          lodging.value
                        )}
                      </div>
                    </div>
                  ))}
                </div>


                {/* ===============================
                    LINENS
                =============================== */}

                <div className="booking-overview-linens">

                  <h3>Linens</h3>

                  <div className="booking-overview-linen-grid">

                    <div className="booking-overview-linen-item">
                      <span>Linen Option</span>

                      <strong>
                        {overviewLinenOption}
                      </strong>
                    </div>


                    <div className="booking-overview-linen-item">
                      <span>Linen Sets</span>

                      <strong>
                        {overviewLinenSets}
                      </strong>
                    </div>

                    <div className="booking-overview-linen-item">
                      <span>Linen Pieces</span>

                      <strong>
                        {overviewLinenPieces}
                      </strong>
                    </div>

                  </div>



                </div>

              </div>

            </section>


            {/* =====================================================
                ARCHIVE
            ===================================================== */}

            {isArchiveRecord && (
              <BookingOverviewLargeSection
                icon={FaClock}
                eyebrow="Historical Record"
                title="Archive Information"
                fields={archiveFields}
                columns={2}
                wide
              >
                {(booking.archiveSourcePdfLink ||
                  archiveLinks.length > 0) && (
                  <div className="booking-overview-archive-links">

                    {booking.archiveSourcePdfLink && (
                      <a
                        href={
                          booking.archiveSourcePdfLink
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FaExternalLinkAlt />
                        Source PDF
                      </a>
                    )}

                    {archiveLinks.map(
                      (link, index) => (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          key={`${link}-${index}`}
                        >
                          <FaExternalLinkAlt />
                          Prior Visit{" "}
                          {index + 1}
                        </a>
                      )
                    )}

                  </div>
                )}
              </BookingOverviewLargeSection>
            )}


            {/* =====================================================
                TIMELINE
            ===================================================== */}

            <BookingOverviewLargeSection
              icon={FaCalendarAlt}
              eyebrow="Administration"
              title="Booking Timeline"
              groups={[
                {
                  title: "Contract Dates",
                  fields: timelineFields,
                  columns: 2,
                },
                {
                  title: "Group Status",
                  fields: statusFields,
                  columns: 2,
                },
                {
                  title: "Cancellation",
                  fields: cancellationFields,
                  columns: 1,
                },
              ]}
            />


            {/* =====================================================
                NOTES
            ===================================================== */}

            <div
              className={
                hasTimelineCard
                  ? "booking-overview-notes-stack"
                  : "booking-overview-notes-stack booking-overview-card-wide"
              }
            >
              <BookingOverviewLargeSection
                icon={FaInfoCircle}
                eyebrow="Internal"
                title="Additional Notes"
                fields={notesFields}
                columns={1}
              />

              <BookingIncidentNotesCard
                booking={booking}
                onSaveBooking={onSaveBooking}
                isLarge
              />
            </div>

          </div>


          {/* ===================================================
              RAW SPREADSHEET DATA
          =================================================== */}

          <BookingOverviewLargeSourceData
            booking={booking}
          />

        </main>

      </div>
    );
  }

  const hasAssignedLodging =
    overviewLodgingAssignments.length > 0;

  const lodgingTable = (
    <table className="booking-compact-sheet booking-compact-sheet-numeric">
      <thead>
        <tr>
          <th scope="col">Building</th>
          <th scope="col">Capacity</th>
          <th scope="col">Assigned</th>
        </tr>
      </thead>

      <tbody>
        {lodgingOverviewRows.map((lodging) => (
          <tr
            className={lodging.value === "" ? "booking-compact-sheet-unused" : ""}
            key={lodging.id}
          >
            <th scope="row">{lodging.name}</th>
            <td>{lodging.capacity || "—"}</td>
            <td className="booking-compact-sheet-strong">
              {getLodgingOverviewValue(lodging.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const paymentGroups = [
    { title: "Rates", fields: rateFields },
    { title: "Deposit & Documents", fields: paymentDocumentFields },
    { title: "Guest-Reported Portal Dates", fields: guestReportedDocumentFields },
    { title: "Billing & Revenue", fields: billingFields },
  ];

  return (
    <div className="booking-compact-layout">
      <div className="booking-compact-board" data-tutorial-target="booking-overview-main">

        <div className="booking-compact-column">
          <BookingOverviewGuests
            estimatedCounts={{
              total: estimatedGuests,
              adults: details.approxAdultGuests,
              under3: approxChildrenUnder3,
              ages3to17: approxChildren3to17,
            }}
            actualCounts={{
              total: actualGuests,
              adults: actualAdults,
              under3: actualChildrenUnder3,
              ages3to17: actualChildren3to17,
            }}
            minimumGuarantee={minimumGuarantee}
            maximumGuarantee={maximumGuarantee}
            persons={booking.persons}
            camperDays={booking.camperDays}
            ethnicBreakdown={details.ethnicBreakdown}
            importedGuestCountText={isMasterRecord ? details.importedGuestCountText : ""}
            dayCamperFields={dayCamperFields}
          />

          <BookingMealsProgramOverview
            booking={booking}
            details={details}
            setActiveTab={setActiveTab}
          />

          <BookingActivitiesOverview
            booking={booking}
            details={details}
            dateSettings={dateSettings}
            setActiveTab={setActiveTab}
          />

          <BookingFacilitiesOverview
            booking={booking}
            details={details}
            dateSettings={dateSettings}
            setActiveTab={setActiveTab}
          />
        </div>


        <div className="booking-compact-column">
          <BookingOverviewSection
            icon={FaBed}
            title="Housing & Linens"
            actions={
              <button
                className="secondary-dashboard-button booking-compact-action"
                type="button"
                onClick={() => setActiveTab("Housing")}
              >
                Go to Housing
                <FaChevronRight aria-hidden="true" />
              </button>
            }
          >
            {isMasterRecord && (
              <BookingOverviewFields
                fields={[
                  {
                    label: isHousingAuthoritative(booking)
                      ? "Imported lodging note (reference only; the Housing tab is the lodging record)"
                      : "Spreadsheet Lodging",
                    value: details.importedLodgingText,
                    multiline: true,
                  },
                  {
                    label: "Spreadsheet Linen Instructions",
                    value: details.importedLinenText,
                    multiline: true,
                  },
                ]}
              />
            )}

            {hasAssignedLodging ? (
              lodgingTable
            ) : (
              <BookingOverviewEmptyRow
                title="Buildings"
                label={isMasterRecord ? "None recorded" : "None assigned"}
                explanation="Assignments made on the Housing tab appear here. Building capacities:"
              >
                {lodgingTable}
              </BookingOverviewEmptyRow>
            )}

            <BookingOverviewFieldGroup
              title="Linens"
              fields={[
                { label: "Linen Option", value: overviewLinenOption, showEmpty: true },
                { label: "Linen Sets", value: overviewLinenSets, showEmpty: true },
                { label: "Linen Pieces", value: overviewLinenPieces, showEmpty: true },
              ]}
            />
          </BookingOverviewSection>

          {paymentGroups.some((group) => hasVisibleOverviewFields(group.fields)) ? (
            <BookingOverviewSection icon={FaDollarSign} title="Payments & Documents">
              {paymentGroups.map((group) => (
                <BookingOverviewFieldGroup key={group.title} {...group} />
              ))}
            </BookingOverviewSection>
          ) : (
            <BookingOverviewEmptyRow
              icon={FaDollarSign}
              title="Payments & Documents"
              explanation="Rates, deposits, documents and billing amounts will appear here once they are recorded."
              action={<BookingOverviewEditButton setActiveTab={setActiveTab} />}
            />
          )}

          {hasTimelineCard ? (
            <BookingOverviewSection icon={FaCalendarAlt} title="Booking Timeline">
              <BookingOverviewFields fields={timelineFields} />

              <BookingOverviewFieldGroup
                title="Group Status"
                fields={statusFields}
              />

              <BookingOverviewFieldGroup
                title="Cancellation"
                fields={cancellationFields}
                className="booking-compact-cancellation"
              />
            </BookingOverviewSection>
          ) : (
            <BookingOverviewEmptyRow
              icon={FaCalendarAlt}
              title="Booking Timeline"
              explanation="Inquiry and contract dates will appear here once they are recorded."
              action={<BookingOverviewEditButton setActiveTab={setActiveTab} />}
            />
          )}

          {isArchiveRecord && (
            <BookingOverviewSection icon={FaClock} title="Archive Information">
              <BookingOverviewFields fields={archiveFields} />

              {(booking.archiveSourcePdfLink ||
                archiveLinks.length > 0) && (
                <div className="booking-compact-archive-links">
                  {booking.archiveSourcePdfLink && (
                    <a
                      href={booking.archiveSourcePdfLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FaExternalLinkAlt aria-hidden="true" />
                      Source PDF
                    </a>
                  )}

                  {archiveLinks.map((link, index) => (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      key={`${link}-${index}`}
                    >
                      <FaExternalLinkAlt aria-hidden="true" />
                      Prior Visit {index + 1}
                    </a>
                  ))}
                </div>
              )}
            </BookingOverviewSection>
          )}

          {hasVisibleOverviewFields(notesFields) ? (
            <BookingOverviewSection icon={FaInfoCircle} title="Additional Notes">
              <BookingOverviewFields fields={notesFields} />
            </BookingOverviewSection>
          ) : (
            <BookingOverviewEmptyRow
              icon={FaInfoCircle}
              title="Additional Notes"
              explanation="Internal booking notes and import review messages will appear here."
              action={<BookingOverviewEditButton setActiveTab={setActiveTab} />}
            />
          )}

          <BookingIncidentNotesCard
            booking={booking}
            onSaveBooking={onSaveBooking}
          />
        </div>
      </div>

      <BookingOverviewSourceData
        booking={booking}
      />
    </div>
  );
}
