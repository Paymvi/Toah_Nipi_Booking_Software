import { useState } from "react";

import {
  FaUsers,
  FaCalendarAlt,
  FaDollarSign,
  FaClock,
  FaUtensils,
  FaBed,
  FaFileContract,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";

import { upsertBooking } from "../services/bookingService";


/* =========================================================
   OPTIONS
========================================================= */

const retreatTypes = [
  "Church",
  "Church - Men",
  "Church - Women",
  "Church - Youth",
  "Church - Children",
  "Christian Organization",
  "Ministry",
  "Personal Retreat",
  "Personal Retreat - Family",
  "Personal Retreat - Women",
  "Personal Retreat - Men",
  "High School Students",
  "College Students",
  "Elementary Students",
  "InterVarsity Staff",
  "InterVarsity College Students",
  "InterVarsity Graduate Students",
  "InterVarsity Alumni",
  "Family Reunion",
  "Local Organization",
  "Family Camp",
  "Other",
];

const mealOptions = [
  "",
  "Breakfast",
  "Lunch",
  "Dinner",
  "None",
];

const paymentMethods = [
  "",
  "Check",
  "Credit Card",
  "Debit Card",
  "ACH",
  "Ramp",
  "Cash",
  "Stripe",
  "Other",
];

const lodgingFields = [
  {
    name: "lodgingBethel",
    label: "Bethel",
    capacity: "70",
    image: "/lodges/Bethel.webp",
  },
  {
    name: "lodgingHebronThird",
    label: "Hebron 3rd Floor",
    capacity: "14",
    image: "/lodges/May-2025-Hebron.jpg",
  },
  {
    name: "lodgingHebronBunks",
    label: "Hebron Bunks",
    capacity: "52",
    image: "/lodges/May-2025-Hebron.jpg",
  },
  {
    name: "lodgingDothan",
    label: "Dothan",
    capacity: "21",
    image: "/lodges/Dothan.webp",
  },
  {
    name: "lodgingAjalon",
    label: "Ajalon",
    capacity: "5–8",
    image: "/lodges/Ajalon.png",
  },
  {
    name: "lodgingCapernaum",
    label: "Capernaum",
    capacity: "5",
    image: null,
  },
  {
    name: "lodgingGuestHouse",
    label: "Guest House",
    capacity: "9–12",
    image: "/lodges/Guest-House.webp",
  },
];


/* =========================================================
   DEFAULT FORM
========================================================= */

function getTodayInputValue() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* =========================================================
   TEST DATA
   Used by the Fill Test Data button.
========================================================= */

const TEST_BOOKING_DATA = {
  /* Group */
  organizationName: "Test Community Church",
  retreatType: "Church - Youth",
  startDate: "2027-06-18",
  endDate: "2027-06-20",
  mailingAddress: "123 Test Street, Nashua, NH 03060",

  /* Contact */
  contactName: "Jordan Test",
  phone: "603-555-0142",
  email: "jordan.test@example.com",

  /* Guest Information */
  approxAdultGuests: "12",
  approxChildrenGuests: "38",
  minimumGuarantee: "45",
  maximumGuarantee: "55",

  actualAdultGuests: "10",
  actualChildrenGuests: "37",

  ethnicBreakdown: "Optional test information",

  adultRateQuoted: "115",
  childRateQuoted: "85",

  numberOfNights: "2",
  numberOfMeals: "5",

  /* Booking Timeline */
  inquiryDate: "2026-09-03",
  contractSentDate: "2026-09-05",
  returnContractByDate: "2026-09-19",
  contractReturnedDate: "2026-09-15",

  /* Payments / Documents */
  depositReceivedDate: "2026-09-16",
  depositAmount: "250",
  insuranceCertificateDate: "2027-06-01",
  notificationDate: "2027-06-05",
  paymentMethod: "Check",

  /* Arrival / Departure */
  arrivalTime: "16:00",
  departureTime: "13:00",

  /* Meals */
  firstMeal: "Dinner",
  lastMeal: "Lunch",
  breakfastTime: "08:00",
  lunchTime: "12:00",
  dinnerTime: "18:00",

  allergies: [
    {
      name: "Gluten free",
      count: "2",
    },
    {
      name: "Peanut allergy",
      count: "1",
    },
    {
      name: "Dairy free",
      count: "1",
    },
  ],

  allergyNotes:
    "Peanut allergy is severe. Please avoid cross-contamination.",

  mealNotes:
    "Saturday dinner should be served at 5:30 PM instead of 6:00 PM.",

  /* Lodging */
  lodgingBethel: "20",
  lodgingHebronThird: "10",
  lodgingHebronBunks: "17",
  lodgingDothan: "",
  lodgingAjalon: "",
  lodgingCapernaum: "",
  lodgingGuestHouse: "",

  /* Linens */
  linenOption: "Some",
  linenSets: "12",

  /* Notes */
  notes:
    "TEST BOOKING: youth retreat. Group would like an early check-in if possible. This record is only for software testing.",
};



function createInitialFormState() {
  return {
    /* Group */
    organizationName: "",
    retreatType: "",
    startDate: "",
    endDate: "",
    mailingAddress: "",

    /* Contact */
    contactName: "",
    phone: "",
    email: "",

    /* Guest Information */
    approxAdultGuests: "",
    approxChildrenGuests: "",
    minimumGuarantee: "",
    maximumGuarantee: "",

    actualAdultGuests: "",
    actualChildrenGuests: "",

    ethnicBreakdown: "",

    adultRateQuoted: "",
    childRateQuoted: "",

    numberOfNights: "",
    numberOfMeals: "",

    /* Booking Timeline */
    inquiryDate: getTodayInputValue(),
    contractSentDate: "",
    returnContractByDate: "",
    contractReturnedDate: "",

    /* Payments / Documents */
    depositReceivedDate: "",
    depositAmount: "",
    insuranceCertificateDate: "",
    notificationDate: "",
    paymentMethod: "",

    /* Arrival / Departure */
    arrivalTime: "",
    departureTime: "",

    /* Meals */
    firstMeal: "",
    lastMeal: "",
    breakfastTime: "",
    lunchTime: "",
    dinnerTime: "",
    allergies: [
      {
        name: "",
        count: "",
      },
    ],

    allergyNotes: "",

    mealNotes: "",

    /* Lodging */
    lodgingBethel: "",
    lodgingHebronThird: "",
    lodgingHebronBunks: "",
    lodgingDothan: "",
    lodgingAjalon: "",
    lodgingCapernaum: "",
    lodgingGuestHouse: "",

    /* Linens */
    linenOption: "No",
    linenSets: "",

    /* Notes */
    notes: "",
  };
}


/* =========================================================
   HELPERS
========================================================= */

function getGuestTotal(adults, children) {
  const hasAdults = String(adults || "").trim() !== "";
  const hasChildren = String(children || "").trim() !== "";

  if (!hasAdults && !hasChildren) {
    return "";
  }

  return String(
    Number(adults || 0) +
    Number(children || 0)
  );
}


function buildLodgingSummary(formData) {
  return lodgingFields
    .map((building) => {
      const value = String(
        formData[building.name] || ""
      ).trim();

      if (!value) {
        return "";
      }

      return `${building.label}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");
}

function buildAllergiesSummary(formData) {
  const allergyEntries = (
    formData.allergies || []
  )
    .map((allergy) => {
      const name = String(
        allergy.name || ""
      ).trim();

      const count = String(
        allergy.count || ""
      ).trim();

      if (!name) {
        return "";
      }

      if (count) {
        return `${count} - ${name}`;
      }

      return name;
    })
    .filter(Boolean);


  const additionalNotes = String(
    formData.allergyNotes || ""
  ).trim();


  if (additionalNotes) {
    allergyEntries.push(
      `Additional notes: ${additionalNotes}`
    );
  }


  return allergyEntries.join("; ");
}


function buildMealsSummary(formData) {
  return [
    formData.firstMeal
      ? `First meal: ${formData.firstMeal}`
      : "",

    formData.lastMeal
      ? `Last meal: ${formData.lastMeal}`
      : "",

    formData.breakfastTime
      ? `Breakfast: ${formData.breakfastTime}`
      : "",

    formData.lunchTime
      ? `Lunch: ${formData.lunchTime}`
      : "",

    formData.dinnerTime
      ? `Dinner: ${formData.dinnerTime}`
      : "",
  ]
    .filter(Boolean)
    .join("; ");
}


function buildScheduleSummary(formData) {
  return [
    formData.arrivalTime
      ? `Arrival: ${formData.arrivalTime}`
      : "",

    formData.departureTime
      ? `Departure: ${formData.departureTime}`
      : "",

    buildMealsSummary(formData),
  ]
    .filter(Boolean)
    .join("\n");
}


function getInitialBookingStatus(formData) {
  if (formData.contractReturnedDate) {
    return "Confirmed";
  }

  if (formData.contractSentDate) {
    return "Contract Sent";
  }

  return "Inquiry";
}


/* =========================================================
   COMPONENT
========================================================= */

export default function CreateBooking() {
  const [formData, setFormData] = useState(() =>
    createInitialFormState()
  );

  const [wasSubmitted, setWasSubmitted] =
    useState(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState("");

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };


  const handleAllergyChange = (
    index,
    field,
    value
  ) => {
    setFormData((current) => {
      const updatedAllergies = [
        ...current.allergies,
      ];

      updatedAllergies[index] = {
        ...updatedAllergies[index],
        [field]: value,
      };

      return {
        ...current,
        allergies: updatedAllergies,
      };
    });
  };


  const handleAddAllergy = () => {
    setFormData((current) => ({
      ...current,

      allergies: [
        ...current.allergies,
        {
          name: "",
          count: "",
        },
      ],
    }));
  };


  const handleRemoveAllergy = (index) => {
    setFormData((current) => {
      const updatedAllergies =
        current.allergies.filter(
          (_, allergyIndex) =>
            allergyIndex !== index
        );

      return {
        ...current,

        allergies:
          updatedAllergies.length > 0
            ? updatedAllergies
            : [
                {
                  name: "",
                  count: "",
                },
              ],
      };
    });
  };

  const handleFillTestData = () => {
    setFormData({
      ...createInitialFormState(),
      ...TEST_BOOKING_DATA,
    });

    setWasSubmitted(false);
    setSubmitError("");
  };


  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setSubmitError("");
      setWasSubmitted(false);

      const approxGuestTotal = getGuestTotal(
        formData.approxAdultGuests,
        formData.approxChildrenGuests
      );

      const actualGuestTotal = getGuestTotal(
        formData.actualAdultGuests,
        formData.actualChildrenGuests
      );

      const attendeeCount =
        actualGuestTotal ||
        approxGuestTotal;

      const lodgingSummary =
        buildLodgingSummary(formData);

      const mealsSummary =
        buildMealsSummary(formData);

      const allergiesSummary =
        buildAllergiesSummary(formData);

      const scheduleSummary =
        buildScheduleSummary(formData);

      const linenSummary =
        formData.linenOption === "No"
          ? "No"
          : formData.linenSets
            ? `${formData.linenOption} - ${formData.linenSets} full set(s)`
            : formData.linenOption;

      /*
        Noon UTC keeps a date from accidentally
        displaying one day earlier due to timezone conversion.
      */
      const submittedAt =
        formData.inquiryDate
          ? `${formData.inquiryDate}T12:00:00.000Z`
          : new Date().toISOString();

      const newBooking = {
        id:
          window.crypto?.randomUUID?.() ||
          String(Date.now()),

        sourceType: "Staff Booking",
        detectedImportType: "Staff Booking",

        submittedAt,

        organizationName:
          formData.organizationName.trim(),

        contactName:
          formData.contactName.trim(),

        name:
          formData.contactName.trim(),

        email:
          formData.email.trim(),

        phone:
          formData.phone.trim(),

        startDate:
          formData.startDate,

        endDate:
          formData.endDate,

        desiredDatesText:
          formData.startDate && formData.endDate
            ? `${formData.startDate} - ${formData.endDate}`
            : formData.startDate || "",

        attendeeCount,
        groupSize: attendeeCount,

        retreatType:
          formData.retreatType,

        status:
          getInitialBookingStatus(formData),

        waitlist: "No",

        roomName: "Unassigned",

        buildingsRooms:
          lodgingSummary,

        meals:
          mealsSummary,

        activities: "",

        linenSets:
          linenSummary,

        nights:
          formData.numberOfNights,

        mealCount:
          formData.numberOfMeals,

        minPayingGuests:
          formData.minimumGuarantee,

        deposit:
          formData.depositAmount,

        depositReceived:
          formData.depositReceivedDate,

        schedule:
          scheduleSummary,

        inquiryAddress:
          formData.mailingAddress.trim(),

        foodAllergies:
          allergiesSummary,

        needToKnow:
          formData.mealNotes.trim(),

        notes:
          formData.notes.trim(),

        /*
          Preserve every field from this detailed
          staff form inside raw_data.
        */
        rentalFormDetails: {
          ...formData,
        },
      };


      const savedBooking =
        await upsertBooking(newBooking);

      console.log(
        "Saved guest group:",
        savedBooking
      );

      setWasSubmitted(true);

      setFormData(
        createInitialFormState()
      );
    } catch (error) {
      console.error(
        "Could not save guest group:",
        error
      );

      setSubmitError(
        "The guest group could not be saved. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <main className="rental-page">
      <section className="rental-card">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <header className="rental-header">
          <p className="rental-eyebrow">
            Toah Nipi Christian Retreat Center
          </p>

          <h1>Guest Group Booking Form</h1>

            <button
              className="rental-test-data-button"
              type="button"
              onClick={handleFillTestData}
            >
              Fill Test Data
            </button>

        </header>


        {/* =====================================================
            MESSAGES
        ===================================================== */}

        {wasSubmitted && (
          <div className="success-message">
            <FaCheckCircle />

            <div>
              <strong>Guest group saved.</strong>

              <span>
                The booking has been added to the
                staff dashboard.
              </span>
            </div>
          </div>
        )}


        {submitError && (
          <div className="rental-error-message">
            <FaExclamationTriangle />

            <div>
              <strong>Could not save booking.</strong>
              <span>{submitError}</span>
            </div>
          </div>
        )}


        <form
          className="rental-form"
          onSubmit={handleSubmit}
        >

          {/* ===================================================
              GROUP INFORMATION
          =================================================== */}

          <section className="rental-form-section">
            <header className="rental-section-header">
              <div className="rental-section-icon">
                <FaUsers />
              </div>

              <div>
                <h2>Guest Group</h2>

                <p>
                  Group and primary contact information.
                </p>
              </div>
            </header>


            <div className="rental-section-body">
              <div className="rental-field-grid">

                <label className="rental-field rental-field-full">
                  <span>Guest Group Name *</span>

                  <input
                    type="text"
                    name="organizationName"
                    value={formData.organizationName}
                    onChange={handleChange}
                    placeholder="Example: Community Bible Church"
                    required
                  />
                </label>


                <label className="rental-field">
                  <span>Type of Retreat</span>

                  <select
                    name="retreatType"
                    value={formData.retreatType}
                    onChange={handleChange}
                  >
                    <option value="">
                      Select retreat type
                    </option>

                    {retreatTypes.map((type) => (
                      <option
                        value={type}
                        key={type}
                      >
                        {type}
                      </option>
                    ))}
                  </select>
                </label>


                <label className="rental-field">
                  <span>Primary Contact *</span>

                  <input
                    type="text"
                    name="contactName"
                    value={formData.contactName}
                    onChange={handleChange}
                    placeholder="Contact person's name"
                    required
                  />
                </label>


                <div className="rental-stay-schedule rental-field-full">

                  {/* ARRIVAL */}
                  <div className="rental-stay-schedule-group">
                    <span className="rental-stay-schedule-title">
                      Arrival
                    </span>

                    <div className="rental-stay-schedule-fields">

                      <label className="rental-field">
                        <span>Date</span>

                        <input
                          type="date"
                          name="startDate"
                          value={formData.startDate}
                          onChange={handleChange}
                        />
                      </label>


                      <label className="rental-field">
                        <span>Time</span>

                        <input
                          type="time"
                          name="arrivalTime"
                          value={formData.arrivalTime}
                          onChange={handleChange}
                        />
                      </label>

                    </div>
                  </div>


                  {/* DEPARTURE */}
                  <div className="rental-stay-schedule-group">
                    <span className="rental-stay-schedule-title">
                      Departure
                    </span>

                    <div className="rental-stay-schedule-fields">

                      <label className="rental-field">
                        <span>Date</span>

                        <input
                          type="date"
                          name="endDate"
                          value={formData.endDate}
                          onChange={handleChange}
                        />
                      </label>


                      <label className="rental-field">
                        <span>Time</span>

                        <input
                          type="time"
                          name="departureTime"
                          value={formData.departureTime}
                          onChange={handleChange}
                        />
                      </label>

                    </div>
                  </div>

                </div>


                <label className="rental-field">
                  <span>Phone</span>

                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="XXX-XXX-XXXX"
                  />
                </label>


                <label className="rental-field">
                  <span>Email</span>

                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@example.com"
                  />
                </label>


                <label className="rental-field rental-field-full">
                  <span>Mailing Address</span>

                  <input
                    type="text"
                    name="mailingAddress"
                    value={formData.mailingAddress}
                    onChange={handleChange}
                    placeholder="Street, city, state, ZIP"
                  />
                </label>

              </div>
            </div>
          </section>


          {/* ===================================================
              GUEST INFORMATION
          =================================================== */}

          <section className="rental-form-section">
            <header className="rental-section-header">
              <div className="rental-section-icon">
                <FaUsers />
              </div>

              <div>
                <h2>Guest Information</h2>

                <p>
                  Attendance, guarantees, rates,
                  and stay information.
                </p>
              </div>
            </header>


            <div className="rental-section-body">

              <div className="rental-subsection">
                <h3>Approximate Guests</h3>

                <div className="rental-field-grid rental-approx-guests-grid">

                  <label className="rental-field">
                    <span>Adults</span>

                    <input
                      type="number"
                      min="0"
                      name="approxAdultGuests"
                      value={formData.approxAdultGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Children</span>

                    <input
                      type="number"
                      min="0"
                      name="approxChildrenGuests"
                      value={formData.approxChildrenGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Minimum Guarantee</span>

                    <input
                      type="number"
                      min="0"
                      name="minimumGuarantee"
                      value={formData.minimumGuarantee}
                      onChange={handleChange}
                    />
                  </label>

                  <label className="rental-field">
                    <span>Maximum Guarantee</span>

                    <input
                      type="number"
                      min="0"
                      name="maximumGuarantee"
                      value={formData.maximumGuarantee}
                      onChange={handleChange}
                    />
                  </label>

                </div>
              </div>


              <div className="rental-subsection">
                <h3>Actual Guests</h3>

                <div className="rental-field-grid rental-field-grid-3">

                  <label className="rental-field">
                    <span>Adults</span>

                    <input
                      type="number"
                      min="0"
                      name="actualAdultGuests"
                      value={formData.actualAdultGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Children</span>

                    <input
                      type="number"
                      min="0"
                      name="actualChildrenGuests"
                      value={formData.actualChildrenGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>
                      Ethnic Breakdown
                      <small>Optional</small>
                    </span>

                    <input
                      type="text"
                      name="ethnicBreakdown"
                      value={formData.ethnicBreakdown}
                      onChange={handleChange}
                    />
                  </label>

                </div>
              </div>


              <div className="rental-subsection">
                <h3>Rates & Stay</h3>

                <div className="rental-field-grid rental-field-grid-4">

                  <label className="rental-field">
                    <span>Adult Rate Quoted</span>

                    <div className="rental-currency-input">
                      <span className="rental-currency-symbol">
                        $
                      </span>

                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="adultRateQuoted"
                        value={formData.adultRateQuoted}
                        onChange={handleChange}
                      />
                    </div>
                  </label>


                  <label className="rental-field">
                    <span>Child Rate Quoted</span>

                    <div className="rental-currency-input">
                      <span className="rental-currency-symbol">
                        $
                      </span>

                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="childRateQuoted"
                        value={formData.childRateQuoted}
                        onChange={handleChange}
                      />
                    </div>
                  </label>


                  <label className="rental-field">
                    <span># of Nights</span>

                    <input
                      type="number"
                      min="0"
                      name="numberOfNights"
                      value={formData.numberOfNights}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span># of Meals</span>

                    <input
                      type="number"
                      min="0"
                      name="numberOfMeals"
                      value={formData.numberOfMeals}
                      onChange={handleChange}
                    />
                  </label>

                </div>
              </div>

            </div>
          </section>


          {/* ===================================================
              TIMELINE + PAYMENT
          =================================================== */}

          <div className="rental-form-two-column">

            <section className="rental-form-section">
              <header className="rental-section-header">
                <div className="rental-section-icon">
                  <FaCalendarAlt />
                </div>

                <div>
                  <h2>Booking Timeline</h2>

                  <p>
                    Inquiry and contract dates.
                  </p>
                </div>
              </header>


              <div className="rental-section-body">
                <div className="rental-field-grid">

                  <label className="rental-field rental-field-full">
                    <span>Inquiry Date</span>

                    <input
                      type="date"
                      name="inquiryDate"
                      value={formData.inquiryDate}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Contract Sent</span>

                    <input
                      type="date"
                      name="contractSentDate"
                      value={formData.contractSentDate}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Return Contract By</span>

                    <input
                      type="date"
                      name="returnContractByDate"
                      value={formData.returnContractByDate}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field rental-field-full">
                    <span>Contract Returned</span>

                    <input
                      type="date"
                      name="contractReturnedDate"
                      value={formData.contractReturnedDate}
                      onChange={handleChange}
                    />
                  </label>

                </div>
              </div>
            </section>


            <section className="rental-form-section">
              <header className="rental-section-header">
                <div className="rental-section-icon">
                  <FaDollarSign />
                </div>

                <div>
                  <h2>Payments & Documents</h2>

                  <p>
                    Deposit, insurance, and payment details.
                  </p>
                </div>
              </header>


              <div className="rental-section-body">
                <div className="rental-field-grid">

                  <label className="rental-field">
                    <span>Deposit Received</span>

                    <input
                      type="date"
                      name="depositReceivedDate"
                      value={formData.depositReceivedDate}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Deposit Amount</span>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="depositAmount"
                      value={formData.depositAmount}
                      onChange={handleChange}
                      placeholder="$"
                    />
                  </label>


                  <label className="rental-field">
                    <span>Insurance Certificate Received</span>

                    <input
                      type="date"
                      name="insuranceCertificateDate"
                      value={formData.insuranceCertificateDate}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Notification Date</span>

                    <input
                      type="date"
                      name="notificationDate"
                      value={formData.notificationDate}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field rental-field-full">
                    <span>Payment Method</span>

                    <select
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleChange}
                    >
                      <option value="">
                        Select payment method
                      </option>

                      {paymentMethods
                        .filter(Boolean)
                        .map((method) => (
                          <option
                            value={method}
                            key={method}
                          >
                            {method}
                          </option>
                        ))}
                    </select>
                  </label>

                </div>
              </div>
            </section>

          </div>


          {/* ===================================================
              ARRIVAL + MEALS
          =================================================== */}

          <section className="rental-form-section">
            <header className="rental-section-header">
              <div className="rental-section-icon">
                <FaUtensils />
              </div>

              <div>
                <h2>Meals</h2>
                <p>
                  Meal schedule, dietary needs,
                  and food service information.
                </p>
              </div>
            </header>


            <div className="rental-section-body">

              <div className="rental-subsection">
                <h3>
                  <FaUtensils />
                  Meals
                </h3>

                <div className="rental-field-grid">

                  <label className="rental-field">
                    <span>First Meal</span>

                    <select
                      name="firstMeal"
                      value={formData.firstMeal}
                      onChange={handleChange}
                    >
                      {mealOptions.map((meal) => (
                        <option
                          value={meal}
                          key={meal || "first-empty"}
                        >
                          {meal || "Select first meal"}
                        </option>
                      ))}
                    </select>
                  </label>


                  <label className="rental-field">
                    <span>Last Meal</span>

                    <select
                      name="lastMeal"
                      value={formData.lastMeal}
                      onChange={handleChange}
                    >
                      {mealOptions.map((meal) => (
                        <option
                          value={meal}
                          key={meal || "last-empty"}
                        >
                          {meal || "Select last meal"}
                        </option>
                      ))}
                    </select>
                  </label>

                </div>


                <div className="rental-field-grid rental-field-grid-3">

                  <label className="rental-field">
                    <span>Breakfast Time</span>

                    <input
                      type="time"
                      name="breakfastTime"
                      value={formData.breakfastTime}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Lunch Time</span>

                    <input
                      type="time"
                      name="lunchTime"
                      value={formData.lunchTime}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>Dinner Time</span>

                    <input
                      type="time"
                      name="dinnerTime"
                      value={formData.dinnerTime}
                      onChange={handleChange}
                    />
                  </label>

                </div>


                <div className="rental-field rental-allergies-field">
                  <span>Allergies / Dietary Restrictions</span>

                  <div className="rental-allergy-headings">
                    <span># Guests</span>
                    <span>Allergy or dietary restriction</span>
                    <span></span>
                  </div>

                  <div className="rental-allergy-list">
                    {formData.allergies.map((allergy, index) => (
                      <div
                        className="rental-allergy-row"
                        key={index}
                      >
                        <input
                          type="number"
                          min="1"
                          value={allergy.count}
                          onChange={(event) =>
                            handleAllergyChange(
                              index,
                              "count",
                              event.target.value
                            )
                          }
                          placeholder="1"
                        />

                        <input
                          type="text"
                          value={allergy.name}
                          onChange={(event) =>
                            handleAllergyChange(
                              index,
                              "name",
                              event.target.value
                            )
                          }
                          placeholder="Example: Peanuts / tree nuts"
                        />

                        <div className="rental-allergy-actions">
                          {formData.allergies.length > 1 && (
                            <button
                              type="button"
                              className="rental-allergy-remove"
                              onClick={() =>
                                handleRemoveAllergy(index)
                              }
                              aria-label="Remove allergy"
                              title="Remove allergy"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="rental-allergy-add-below"
                    onClick={handleAddAllergy}
                  >
                    + Add another allergy
                  </button>

                  <label className="rental-allergy-notes">
                    <span>Additional Allergy Notes</span>

                    <textarea
                      name="allergyNotes"
                      rows="3"
                      value={formData.allergyNotes}
                      onChange={handleChange}
                      placeholder="Severity, exceptions, cross-contamination concerns, or other details."
                    />
                  </label>
                </div>

                <label className="rental-field">
                  <span>Other Meal Notes</span>

                  <textarea
                    name="mealNotes"
                    rows="3"
                    value={formData.mealNotes}
                    onChange={handleChange}
                    placeholder="Skipped meals, timing notes, food service details, etc."
                  />
                </label>

              </div>
            </div>
          </section>


          {/* ===================================================
              LODGING
          =================================================== */}

          <section className="rental-form-section">
            <header className="rental-section-header">
              <div className="rental-section-icon">
                <FaBed />
              </div>

              <div>
                <h2>Lodging & Linens</h2>

                <p>
                  Guest assignments and linen requirements.
                </p>
              </div>
            </header>


            <div className="rental-section-body">

              <div className="rental-lodging-grid">

                {lodgingFields.map((building) => (
                  <label
                    className="rental-lodging-field"
                    key={building.name}
                  >
                    <div className="rental-lodging-info">

                      {building.image && (
                        <img
                          className="rental-lodging-image"
                          src={building.image}
                          alt=""
                        />
                      )}

                      <span className="rental-lodging-text">
                        <strong>
                          {building.label}
                        </strong>

                        <small>
                          Capacity {building.capacity}
                        </small>
                      </span>

                    </div>

                    <input
                      type="number"
                      min="0"
                      name={building.name}
                      value={formData[building.name]}
                      onChange={handleChange}
                      placeholder="0"
                    />
                  </label>
                ))}

              </div>


              <div className="rental-subsection">
                <h3>Linens</h3>

                <div className="rental-field-grid">

                  <label className="rental-field">
                    <span>Linen Option</span>

                    <select
                      name="linenOption"
                      value={formData.linenOption}
                      onChange={handleChange}
                    >
                      <option value="No">
                        No linens
                      </option>

                      <option value="All">
                        Linens for all guests
                      </option>

                      <option value="Some">
                        Linens for some guests
                      </option>
                    </select>
                  </label>


                  <label className="rental-field">
                    <span># of Full Sets</span>

                    <input
                      type="number"
                      min="0"
                      name="linenSets"
                      value={formData.linenSets}
                      onChange={handleChange}
                      disabled={
                        formData.linenOption === "No"
                      }
                    />
                  </label>

                </div>
              </div>

            </div>
          </section>


          {/* ===================================================
              NOTES
          =================================================== */}

          <section className="rental-form-section">
            <header className="rental-section-header">
              <div className="rental-section-icon">
                <FaFileContract />
              </div>

              <div>
                <h2>Additional Notes</h2>

                <p>
                  Other information staff should know.
                </p>
              </div>
            </header>


            <div className="rental-section-body">

              <label className="rental-field">
                <span>Booking Notes</span>

                <textarea
                  name="notes"
                  rows="6"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Special arrangements, accessibility needs, follow-up items, questions, or other information."
                />
              </label>

            </div>
          </section>


          {/* ===================================================
              SAVE
          =================================================== */}

          <div className="form-actions">
            <button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : "Save Guest Group"}
            </button>
          </div>

        </form>
      </section>
    </main>
  );
}