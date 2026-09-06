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
  FaInfoCircle,
} from "react-icons/fa";

import { upsertBooking } from "../services/bookingService";

import {
  parseDesiredDateRange,
} from "../utils/dateUtils";

import {
  FaUser,
  FaChild,
  FaUserMinus,
  FaUserPlus,
  FaGlobeAmericas,
  FaMoon,
} from "react-icons/fa";


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

const MEAL_TYPES = [
  {
    key: "breakfast",
    label: "Breakfast",
    shortLabel: "B",
  },
  {
    key: "lunch",
    label: "Lunch",
    shortLabel: "L",
  },
  {
    key: "dinner",
    label: "Dinner",
    shortLabel: "D",
  },
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
  approxTotalGuests: "50",
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
  mealSchedule: {
    "2027-06-18": {
      breakfast: false,
      lunch: false,
      dinner: true,
    },

    "2027-06-19": {
      breakfast: true,
      lunch: true,
      dinner: true,
    },

    "2027-06-20": {
      breakfast: true,
      lunch: true,
      dinner: false,
    },
  },

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


function cleanInquiryPrefillValue(value) {
  const text = String(value ?? "").trim();

  if (
    !text ||
    text === "No contact name" ||
    text === "No email provided" ||
    text === "No phone provided"
  ) {
    return "";
  }

  return text;
}


function getInquiryDateInputValue(value) {
  const text = String(value || "").trim();

  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  return match ? match[1] : "";
}

function getInquiryPrefillAddress(inquiry) {
  if (!inquiry) {
    return "";
  }

  /*
    First use the normalized inquiry field.
  */
  const normalizedAddress =
    cleanInquiryPrefillValue(
      inquiry.inquiryAddress
    );

  if (normalizedAddress) {
    return normalizedAddress;
  }

  /*
    Fall back to the original spreadsheet row.

    This matches the same fallback behavior used
    by InquirySpreadsheetView.
  */
  const rawData =
    inquiry.rawSpreadsheetData;

  if (
    !rawData ||
    typeof rawData !== "object"
  ) {
    return "";
  }

  return cleanInquiryPrefillValue(
    rawData["Mailing address"] ||
    rawData["Mailing Address"] ||
    rawData["Address"] ||
    ""
  );
}

function getNumberOfNightsBetweenDates(
  startDate,
  endDate
) {
  if (!startDate || !endDate) {
    return "";
  }

  const start =
    new Date(`${startDate}T00:00:00Z`);

  const end =
    new Date(`${endDate}T00:00:00Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return "";
  }

  const millisecondsPerDay =
    1000 * 60 * 60 * 24;

  return String(
    Math.round(
      (end - start) /
      millisecondsPerDay
    )
  );
}

function createInitialFormState(
  initialInquiry = null
) {
  const baseState = {
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
    approxTotalGuests: "",

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
    mealSchedule: {},

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


    /*
      Inquiry conversion metadata.

      These are preserved inside
      rentalFormDetails when the booking
      is eventually saved.
    */
    sourceInquiryId: "",
    sourceInquirySheet: "",
    sourceInquiryRowNumber: "",
    sourceInquiryDesiredDatesText: "",
    sourceInquiryEstimatedSize: "",
    sourceInquiryDisposition: "",
  };


  if (!initialInquiry) {
    return baseState;
  }


  const desiredDatesText =
    cleanInquiryPrefillValue(
      initialInquiry.desiredDatesText
    );

  const estimatedSize =
    cleanInquiryPrefillValue(
      initialInquiry.attendeeCount
    );

  const disposition =
    cleanInquiryPrefillValue(
      initialInquiry.inquiryDisposition
    );

  /*
    Try to turn the original Desired Dates text
    into actual form dates.

    If the parser cannot understand the text,
    these simply remain blank.
  */
  const parsedDesiredDates =
    parseDesiredDateRange(
      desiredDatesText
    );


  const prefillStartDate =
    cleanInquiryPrefillValue(
      initialInquiry.startDate
    ) ||
    parsedDesiredDates.startDate ||
    "";


  const prefillEndDate =
    cleanInquiryPrefillValue(
      initialInquiry.endDate
    ) ||
    parsedDesiredDates.endDate ||
    "";


  const prefillNumberOfNights =
    getNumberOfNightsBetweenDates(
      prefillStartDate,
      prefillEndDate
    );

  const originalNotes =
    cleanInquiryPrefillValue(
      initialInquiry.notes
    );


  const inquiryContext = [
    disposition
      ? `Original inquiry disposition: ${disposition}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");


  return {
    ...baseState,

    organizationName:
      cleanInquiryPrefillValue(
        initialInquiry.organizationName
      ),

    retreatType:
      cleanInquiryPrefillValue(
        initialInquiry.retreatType
      ),

    contactName:
      cleanInquiryPrefillValue(
        initialInquiry.contactName
      ),

    phone:
      cleanInquiryPrefillValue(
        initialInquiry.phone
      ),

    email:
      cleanInquiryPrefillValue(
        initialInquiry.email
      ),

    mailingAddress:
      getInquiryPrefillAddress(
        initialInquiry
      ),


    /*
      Use actual booking dates if they already exist.

      Otherwise try to parse the inquiry's
      Desired Dates column.
    */
    startDate:
      prefillStartDate,

    endDate:
      prefillEndDate,


    /*
      Preserve the inquiry's total estimated size.

      Do NOT pretend that the entire number
      represents adults or children.
    */
    approxTotalGuests:
      estimatedSize,


    /*
      If we successfully got a date range,
      we can safely calculate # of nights too.
    */
    numberOfNights:
      prefillNumberOfNights,


    inquiryDate:
      getInquiryDateInputValue(
        initialInquiry.submittedAt
      ) ||
      baseState.inquiryDate,


    notes: [
      originalNotes,
      inquiryContext,
    ]
      .filter(Boolean)
      .join("\n\n"),


    /*
      Preserve where this booking came from.
    */
    sourceInquiryId:
      initialInquiry.id || "",

    sourceInquirySheet:
      initialInquiry.sourceSheet || "",

    sourceInquiryRowNumber:
      initialInquiry.sourceRowNumber || "",

    sourceInquiryDesiredDatesText:
      desiredDatesText,

    sourceInquiryEstimatedSize:
      estimatedSize,

    sourceInquiryDisposition:
      disposition,
  };
}


/* =========================================================
   HELPERS
========================================================= */

function parseDateInputAsUTC(dateString) {
  if (!dateString) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] = dateString
    .split("-")
    .map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );
}


function getStayDates(
  startDate,
  endDate
) {
  const start =
    parseDateInputAsUTC(startDate);

  const end =
    parseDateInputAsUTC(endDate);

  if (
    !start ||
    !end ||
    end < start
  ) {
    return [];
  }

  const dates = [];

  const current =
    new Date(start);

  while (current <= end) {
    dates.push(
      current
        .toISOString()
        .slice(0, 10)
    );

    current.setUTCDate(
      current.getUTCDate() + 1
    );
  }

  return dates;
}


function formatMealScheduleDate(
  dateString
) {
  const date =
    parseDateInputAsUTC(dateString);

  if (!date) {
    return dateString;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }
  ).format(date);
}


function getMealTotals(formData) {
  const stayDates =
    getStayDates(
      formData.startDate,
      formData.endDate
    );

  const totals = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    total: 0,
  };

  stayDates.forEach((date) => {
    const dayMeals =
      formData.mealSchedule?.[date] || {};

    MEAL_TYPES.forEach((meal) => {
      if (dayMeals[meal.key]) {
        totals[meal.key] += 1;
        totals.total += 1;
      }
    });
  });

  return totals;
}


function getMealScheduleBounds(
  formData
) {
  const stayDates =
    getStayDates(
      formData.startDate,
      formData.endDate
    );

  const selectedMeals = [];

  stayDates.forEach((date) => {
    MEAL_TYPES.forEach((meal) => {
      if (
        formData.mealSchedule?.[date]?.[
          meal.key
        ]
      ) {
        selectedMeals.push({
          date,
          meal: meal.label,
        });
      }
    });
  });

  return {
    firstMeal:
      selectedMeals[0]?.meal || "",

    lastMeal:
      selectedMeals[
        selectedMeals.length - 1
      ]?.meal || "",
  };
}

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
  const stayDates =
    getStayDates(
      formData.startDate,
      formData.endDate
    );

  const totals =
    getMealTotals(formData);

  const scheduleLines =
    stayDates
      .map((date) => {
        const selectedMeals =
          MEAL_TYPES
            .filter(
              (meal) =>
                formData.mealSchedule?.[
                  date
                ]?.[meal.key]
            )
            .map(
              (meal) =>
                meal.label
            );

        if (
          selectedMeals.length === 0
        ) {
          return "";
        }

        return `${formatMealScheduleDate(
          date
        )}: ${selectedMeals.join(", ")}`;
      })
      .filter(Boolean);

  return [
    totals.total > 0
      ? `Total meals: ${totals.total} (Breakfast: ${totals.breakfast}, Lunch: ${totals.lunch}, Dinner: ${totals.dinner})`
      : "",

    ...scheduleLines,

    formData.breakfastTime
      ? `Breakfast time: ${formData.breakfastTime}`
      : "",

    formData.lunchTime
      ? `Lunch time: ${formData.lunchTime}`
      : "",

    formData.dinnerTime
      ? `Dinner time: ${formData.dinnerTime}`
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

export default function CreateBooking({
  initialInquiry = null,
  onBookingCreated,
}) {
  const [formData, setFormData] = useState(() =>
    createInitialFormState(initialInquiry)
  );

  const [wasSubmitted, setWasSubmitted] =
    useState(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState("");

  const stayDates =
    getStayDates(
      formData.startDate,
      formData.endDate
    );

  const mealTotals =
    getMealTotals(formData);

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

  const handleMealToggle = (
    date,
    mealKey
  ) => {
    setFormData((current) => {
      const currentDay =
        current.mealSchedule?.[date] || {
          breakfast: false,
          lunch: false,
          dinner: false,
        };

      return {
        ...current,

        mealSchedule: {
          ...current.mealSchedule,

          [date]: {
            ...currentDay,

            [mealKey]:
              !currentDay[mealKey],
          },
        },
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

      const approxGuestBreakdownTotal =
        getGuestTotal(
          formData.approxAdultGuests,
          formData.approxChildrenGuests
        );


      /*
        Prefer a real adult + child breakdown.

        If staff has not entered that yet,
        keep the original estimated total
        from the inquiry spreadsheet.
      */
      const approxGuestTotal =
        approxGuestBreakdownTotal ||
        String(
          formData.approxTotalGuests || ""
        ).trim();


      const actualGuestTotal =
        getGuestTotal(
          formData.actualAdultGuests,
          formData.actualChildrenGuests
        );

      const calculatedMealTotals =
        getMealTotals(formData);

      const mealScheduleBounds =
        getMealScheduleBounds(formData);

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
          String(calculatedMealTotals.total),

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

          numberOfMeals:
            String(
              calculatedMealTotals.total
            ),

          firstMeal:
            mealScheduleBounds.firstMeal,

          lastMeal:
            mealScheduleBounds.lastMeal,
        },
      };


      const savedBooking =
        await upsertBooking(newBooking);

      console.log(
        "Saved guest group:",
        savedBooking
      );


      /*
        Tell Dashboard that the inquiry-based
        booking was successfully created.

        This clears the prefill source so opening
        the normal Form later stays blank.
      */
      onBookingCreated?.(savedBooking);


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
            {/* Toah Nipi Christian Retreat Center */}
          </p>

          <h1>Staff Facing: Group Booking Form</h1>

            <button
              className="rental-test-data-button"
              type="button"
              onClick={handleFillTestData}
            >
              Fill Test Data
            </button>

        </header>

        {initialInquiry && (
          <div className="rental-inquiry-prefill-notice">
            <FaInfoCircle />

            <div>
              <strong>
                Booking started from an existing inquiry
              </strong>

              <p>
                Information from{" "}
                <b>
                  {initialInquiry.organizationName}
                </b>{" "}
                has been copied into this form.
                Review the requested dates and estimated
                guest count before saving.
              </p>

              <div className="rental-inquiry-prefill-details">
                {initialInquiry.desiredDatesText && (
                  <span>
                    <small>Requested Dates</small>
                    <strong>
                      {initialInquiry.desiredDatesText}
                    </strong>
                  </span>
                )}

                {initialInquiry.attendeeCount && (
                  <span>
                    <small>Estimated Size</small>
                    <strong>
                      {initialInquiry.attendeeCount}
                    </strong>
                  </span>
                )}

                {initialInquiry.inquiryDisposition && (
                  <span>
                    <small>Inquiry Status</small>
                    <strong>
                      {initialInquiry.inquiryDisposition}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}


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

                {/* <p>
                  Group and primary contact information.
                </p> */}
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

                {/* <p>
                  Attendance, guarantees, rates,
                  and stay information.
                </p> */}
              </div>
            </header>


            <div className="rental-section-body">

              <div className="rental-subsection">
                <h3>Approximate Guests</h3>

                <div className="rental-field-grid rental-approx-guests-grid">

                  <label className="rental-field rental-field-full">
                    <span>
                      <FaUsers className="rental-field-label-icon" />
                      Estimated Total Guests
                    </span>

                    <input
                      type="text"
                      min="0"
                      name="approxTotalGuests"
                      value={
                        formData.approxTotalGuests
                      }
                      onChange={handleChange}
                      placeholder="Total estimated group size"
                    />
                  </label>

                  <label className="rental-field">
                    <span>
                      <FaUser className="rental-field-label-icon" />
                      Adults
                    </span>

                    <input
                      type="number"
                      min="0"
                      name="approxAdultGuests"
                      value={formData.approxAdultGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>
                      <FaChild className="rental-field-label-icon" />
                      Children
                    </span>

                    <input
                      type="number"
                      min="0"
                      name="approxChildrenGuests"
                      value={formData.approxChildrenGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>
                      <FaUserMinus className="rental-field-label-icon" />
                      Min Guarantee
                    </span>

                    <input
                      type="number"
                      min="0"
                      name="minimumGuarantee"
                      value={formData.minimumGuarantee}
                      onChange={handleChange}
                    />
                  </label>

                  <label className="rental-field">
                    <span>
                      <FaUserPlus className="rental-field-label-icon" />
                      Max Guarantee
                    </span>

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
                    <span>
                      <FaUser className="rental-field-label-icon" />
                      Adults
                    </span>

                    <input
                      type="number"
                      min="0"
                      name="actualAdultGuests"
                      value={formData.actualAdultGuests}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>
                      <FaChild className="rental-field-label-icon" />
                      Children
                    </span>

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
                      <FaGlobeAmericas className="rental-field-label-icon" />

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
                    <span>
                      {/* <FaDollarSign className="rental-field-label-icon" /> */}
                      Adult Rate Quoted
                    </span>

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
                    <span>
                      {/* <FaDollarSign className="rental-field-label-icon" /> */}
                      Child Rate Quoted
                    </span>

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
                    <span>
                      <FaMoon className="rental-field-label-icon" />
                      # of Nights
                    </span>

                    <input
                      type="number"
                      min="0"
                      name="numberOfNights"
                      value={formData.numberOfNights}
                      onChange={handleChange}
                    />
                  </label>


                  <label className="rental-field">
                    <span>
                      <FaUtensils className="rental-field-label-icon" />

                      # of Meals

                      <small>
                        Auto-calculated
                      </small>
                    </span>

                    <input
                      type="number"
                      min="0"
                      value={mealTotals.total}
                      readOnly
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

                  {/* <p>
                    Inquiry and contract dates.
                  </p> */}
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

                  {/* <p>
                    Deposit, insurance, and payment details.
                  </p> */}
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
                {/* <p>
                  Meal schedule, dietary needs,
                  and food service information.
                </p> */}
              </div>
            </header>


            <div className="rental-section-body">

              <div className="rental-subsection">
                {/* <h3>
                  <FaUtensils />
                  Meals
                </h3> */}

                <div className="rental-meal-schedule">

                  <div className="rental-meal-schedule-header">
                    <div>
                      <h4>Meals by Day</h4>

                    </div>

                    <div className="rental-meal-total-badge">
                      <strong>
                        {mealTotals.total}
                      </strong>

                      <span>
                        {mealTotals.total === 1
                          ? "meal"
                          : "meals"}
                      </span>
                    </div>
                  </div>


                  {!formData.startDate ||
                  !formData.endDate ? (
                    <div className="rental-meal-schedule-empty">
                      Choose an arrival and departure
                      date above to build the meal
                      schedule.
                    </div>
                  ) : stayDates.length === 0 ? (
                    <div className="rental-meal-schedule-empty">
                      The departure date must be on or
                      after the arrival date.
                    </div>
                  ) : (
                    <div className="rental-meal-table-wrap">
                      <table className="rental-meal-table">

                        <thead>
                          <tr>
                            <th>Date</th>

                            {MEAL_TYPES.map((meal) => (
                              <th key={meal.key}>
                                <strong>
                                  {meal.shortLabel}
                                </strong>

                                <span>
                                  {meal.label}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>


                        <tbody>
                          {stayDates.map((date) => (
                            <tr key={date}>

                              <td className="rental-meal-date">
                                <strong>
                                  {formatMealScheduleDate(
                                    date
                                  )}
                                </strong>
                              </td>


                              {MEAL_TYPES.map((meal) => {
                                const checked =
                                  Boolean(
                                    formData
                                      .mealSchedule?.[
                                        date
                                      ]?.[meal.key]
                                  );

                                return (
                                  <td key={meal.key}>
                                    <label
                                      className="rental-meal-checkbox"
                                      title={`${meal.label} - ${formatMealScheduleDate(
                                        date
                                      )}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          handleMealToggle(
                                            date,
                                            meal.key
                                          )
                                        }
                                        aria-label={`${meal.label} on ${formatMealScheduleDate(
                                          date
                                        )}`}
                                      />

                                      <span
                                        aria-hidden="true"
                                      />
                                    </label>
                                  </td>
                                );
                              })}

                            </tr>
                          ))}
                        </tbody>


                        <tfoot>
                          <tr>
                            <th>Totals</th>

                            <td>
                              {mealTotals.breakfast}
                            </td>

                            <td>
                              {mealTotals.lunch}
                            </td>

                            <td>
                              {mealTotals.dinner}
                            </td>
                          </tr>
                        </tfoot>

                      </table>
                    </div>
                  )}

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