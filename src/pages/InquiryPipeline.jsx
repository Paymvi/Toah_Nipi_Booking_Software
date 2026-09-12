import { useMemo, useState } from "react";

import {
  FaArrowRight,
  FaCalendarAlt,
  FaCheckCircle,
  FaClipboardList,
  FaExclamationTriangle,
  FaFileContract,
  FaFilter,
  FaHourglassHalf,
  FaInbox,
  FaSearch,
  FaTimesCircle,
  FaUndoAlt,
  FaUsers,
} from "react-icons/fa";

import { formatDateRange } from "../utils/dateUtils";


/* =========================================================
   PIPELINE COLUMNS

   IMPORTANT:
   Keep these keys the same because Dashboard.jsx currently
   uses getInquiryPipelineColumnKey() to calculate its badge.
========================================================= */

const PIPELINE_COLUMNS = [
  {
    key: "newInquiry",
    label: "New Inquiry",
    description: "Ready for first staff follow-up.",
    icon: FaInbox,
  },
  {
    key: "needsReview",
    label: "Needs Review",
    description: "Core inquiry information is missing.",
    icon: FaExclamationTriangle,
  },
  {
    key: "contractSent",
    label: "Contract Sent",
    description: "Contract is out and awaiting return.",
    icon: FaFileContract,
  },
  {
    key: "confirmed",
    label: "Confirmed",
    description: "Contract has been returned.",
    icon: FaCheckCircle,
  },
  {
    key: "waitlist",
    label: "Waitlist",
    description: "Waiting for space or a decision.",
    icon: FaHourglassHalf,
  },
  {
    key: "cancelled",
    label: "Cancelled",
    description: "Closed or cancelled records.",
    icon: FaTimesCircle,
  },
];


/* =========================================================
   GENERAL HELPERS
========================================================= */

function getRentalFormDetails(booking) {
  if (
    booking?.rentalFormDetails &&
    typeof booking.rentalFormDetails === "object" &&
    !Array.isArray(booking.rentalFormDetails)
  ) {
    return booking.rentalFormDetails;
  }

  return {};
}

function isBlankBookingValue(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();

  return (
    !text ||
    text === "n/a" ||
    text === "na" ||
    text === "—" ||
    text === "no email provided" ||
    text === "no phone provided" ||
    text === "no contact name" ||
    text === "unnamed organization" ||
    text === "unnamed group" ||
    text === "unassigned"
  );
}

function getTodayInputValue() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getSourceSearchText(booking) {
  return [
    booking?.sourceType,
    booking?.detectedImportType,
    booking?.sourceSheet,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function isStaffBookingRecord(booking) {
  const sourceType = String(booking?.sourceType || "")
    .trim()
    .toLowerCase();

  const detectedImportType = String(booking?.detectedImportType || "")
    .trim()
    .toLowerCase();

  return (
    sourceType === "staff booking" ||
    detectedImportType === "staff booking"
  );
}

function isMasterOrArchiveRecord(booking) {
  const sourceText = getSourceSearchText(booking);

  return (
    sourceText.includes("master") ||
    sourceText.includes("archive")
  );
}

function isPipelineEligibleRecord(booking) {
  if (!booking || isMasterOrArchiveRecord(booking)) {
    return false;
  }

  const sourceText = getSourceSearchText(booking);
  const statusText = String(booking.status || "").toLowerCase();
  const waitlistText = String(booking.waitlist || "").toLowerCase();
  const details = getRentalFormDetails(booking);

  if (isStaffBookingRecord(booking)) {
    return true;
  }

  if (
    sourceText.includes("form") ||
    sourceText.includes("inquiry") ||
    sourceText.includes("waitlist")
  ) {
    return true;
  }

  if (details.sourceInquiryId) {
    return true;
  }

  if (
    statusText.includes("inquiry") ||
    statusText.includes("contract") ||
    statusText.includes("confirm") ||
    statusText.includes("booked") ||
    statusText.includes("wait") ||
    statusText.includes("cancel") ||
    waitlistText === "yes"
  ) {
    return true;
  }

  return false;
}

function getPipelineRecordKind(booking) {
  const sourceText = getSourceSearchText(booking);

  if (isStaffBookingRecord(booking)) {
    return {
      key: "booking",
      label: "Staff Booking",
      className: "pipeline-source-booking",
    };
  }

  if (sourceText.includes("waitlist")) {
    return {
      key: "inquiry",
      label: "Waitlist Import",
      className: "pipeline-source-waitlist",
    };
  }

  if (sourceText.includes("inquiry")) {
    return {
      key: "inquiry",
      label: "Inquiry Import",
      className: "pipeline-source-inquiry",
    };
  }

  if (sourceText.includes("form") || !sourceText) {
    return {
      key: "inquiry",
      label: "Public Form",
      className: "pipeline-source-form",
    };
  }

  return {
    key: "inquiry",
    label: "Inquiry Record",
    className: "pipeline-source-inquiry",
  };
}

function getEstimatedGuestCount(booking) {
  const details = getRentalFormDetails(booking);

  const directValues = [
    booking.attendeeCount,
    booking.groupSize,
    details.approxTotalGuests,
    details.sourceInquiryEstimatedSize,
  ];

  const directValue = directValues.find(
    (value) => !isBlankBookingValue(value)
  );

  if (directValue !== undefined) {
    return String(directValue).trim();
  }

  const approxAdults = Number(details.approxAdultGuests || 0);
  const approxChildren = Number(details.approxChildrenGuests || 0);

  if (approxAdults > 0 || approxChildren > 0) {
    return String(approxAdults + approxChildren);
  }

  const actualAdults = Number(details.actualAdultGuests || 0);
  const actualChildren = Number(details.actualChildrenGuests || 0);

  if (actualAdults > 0 || actualChildren > 0) {
    return String(actualAdults + actualChildren);
  }

  return "";
}

function getRequestedDateText(booking) {
  const details = getRentalFormDetails(booking);

  if (!isBlankBookingValue(booking.startDate)) {
    const formattedRange = formatDateRange(
      booking.startDate,
      booking.endDate
    );

    const cleanRange = String(formattedRange || "").trim();

    if (
      cleanRange &&
      cleanRange !== "—" &&
      !cleanRange.toLowerCase().includes("invalid")
    ) {
      return cleanRange;
    }
  }

  const desiredDates =
    booking.desiredDatesText ||
    details.sourceInquiryDesiredDatesText ||
    "";

  if (!isBlankBookingValue(desiredDates)) {
    return String(desiredDates).trim();
  }

  return "No dates provided";
}

function formatPipelineDate(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  let date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    date = new Date(`${text}T00:00:00`);
  } else {
    date = new Date(text);
  }

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPipelineSortTimestamp(booking) {
  const details = getRentalFormDetails(booking);
  const stage = getInquiryPipelineColumnKey(booking);

  let preferredDate = "";

  if (stage === "confirmed") {
    preferredDate = details.contractReturnedDate;
  } else if (stage === "contractSent") {
    preferredDate = details.contractSentDate;
  } else if (stage === "cancelled") {
    preferredDate = booking.dateOfCancellation;
  }

  const fallbackDate =
    preferredDate ||
    details.inquiryDate ||
    booking.submittedAt ||
    booking.updatedAt ||
    booking.startDate ||
    "";

  const timestamp = Date.parse(fallbackDate);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getPipelineSearchText(booking) {
  const details = getRentalFormDetails(booking);

  return [
    booking.organizationName,
    booking.contactName,
    booking.email,
    booking.phone,
    booking.status,
    booking.waitlist,
    booking.retreatType,
    booking.startDate,
    booking.endDate,
    booking.desiredDatesText,
    booking.sourceType,
    booking.sourceSheet,
    booking.notes,
    details.sourceInquiryDesiredDatesText,
    details.sourceInquiryDisposition,
    details.inquiryDate,
    details.contractSentDate,
    details.returnContractByDate,
    details.contractReturnedDate,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}


/* =========================================================
   CURRENT-SYSTEM QUALITY CHECKS

   These are only the things staff actually needs before an
   inquiry can move forward. Housing is intentionally NOT
   required here anymore.
========================================================= */

export function getBookingQualityIssues(booking) {
  const issues = [];
  const details = getRentalFormDetails(booking);

  const hasRequestedDates =
    !isBlankBookingValue(booking.startDate) ||
    !isBlankBookingValue(booking.desiredDatesText) ||
    !isBlankBookingValue(details.sourceInquiryDesiredDatesText);

  if (isBlankBookingValue(booking.organizationName)) {
    issues.push("Missing organization");
  }

  if (!hasRequestedDates) {
    issues.push("Missing dates");
  }

  if (isBlankBookingValue(booking.contactName)) {
    issues.push("Missing contact");
  }

  if (
    isBlankBookingValue(booking.email) &&
    isBlankBookingValue(booking.phone)
  ) {
    issues.push("Missing email / phone");
  }

  if (isBlankBookingValue(getEstimatedGuestCount(booking))) {
    issues.push("Missing guest count");
  }

  if (isBlankBookingValue(booking.retreatType)) {
    issues.push("Missing retreat type");
  }

  return issues;
}


/* =========================================================
   PIPELINE STAGE

   Current booking workflow priority:
   1. Cancelled
   2. Waitlist
   3. Contract returned -> Confirmed
   4. Contract sent -> Contract Sent
   5. Missing core inquiry data -> Needs Review
   6. Otherwise -> New Inquiry
========================================================= */

export function getInquiryPipelineColumnKey(booking) {
  if (!isPipelineEligibleRecord(booking)) {
    return "excluded";
  }

  const details = getRentalFormDetails(booking);
  const status = String(booking.status || "").toLowerCase();
  const waitlist = String(booking.waitlist || "").toLowerCase();
  const disposition = String(
    booking.inquiryDisposition ||
      details.sourceInquiryDisposition ||
      ""
  ).toLowerCase();

  if (
    !isBlankBookingValue(booking.dateOfCancellation) ||
    status.includes("cancel")
  ) {
    return "cancelled";
  }

  if (
    waitlist === "yes" ||
    status.includes("wait") ||
    disposition.includes("waitlist")
  ) {
    return "waitlist";
  }

  if (
    !isBlankBookingValue(details.contractReturnedDate) ||
    status.includes("confirm") ||
    status.includes("booked")
  ) {
    return "confirmed";
  }

  if (
    !isBlankBookingValue(details.contractSentDate) ||
    status.includes("contract")
  ) {
    return "contractSent";
  }

  if (getBookingQualityIssues(booking).length > 0) {
    return "needsReview";
  }

  return "newInquiry";
}


/* =========================================================
   LIST-LEVEL PIPELINE DATA

   This is also exported so Dashboard.jsx can use the exact
   same de-duplicated record set for its sidebar badge.
========================================================= */

export function getInquiryPipelineRecords(inquiryBookings = []) {
  const eligibleRecords = inquiryBookings.filter(
    isPipelineEligibleRecord
  );

  const convertedInquiryIds = new Set(
    eligibleRecords
      .filter(isStaffBookingRecord)
      .map((booking) =>
        String(
          getRentalFormDetails(booking).sourceInquiryId ||
            ""
        ).trim()
      )
      .filter(Boolean)
  );

  const records = eligibleRecords.filter((booking) => {
    if (isStaffBookingRecord(booking)) {
      return true;
    }

    const bookingId = String(booking.id || "").trim();

    return !(
      bookingId &&
      convertedInquiryIds.has(bookingId)
    );
  });

  return {
    records,
    convertedInquiryIds,
    excludedMasterArchiveCount:
      inquiryBookings.length - eligibleRecords.length,
    hiddenConvertedInquiryCount:
      eligibleRecords.length - records.length,
  };
}

export function getInquiryPipelineNeedsActionCount(
  inquiryBookings = []
) {
  const { records } =
    getInquiryPipelineRecords(inquiryBookings);

  return records.filter((booking) => {
    const columnKey =
      getInquiryPipelineColumnKey(booking);

    return (
      columnKey === "newInquiry" ||
      columnKey === "needsReview"
    );
  }).length;
}


/* =========================================================
   CARD / STAGE DISPLAY HELPERS
========================================================= */

function getStageStatusLabel(stageKey) {
  const column = PIPELINE_COLUMNS.find(
    (item) => item.key === stageKey
  );

  return column?.label || "Inquiry";
}

function getStageStatusClass(stageKey) {
  return `pipeline-status-${stageKey}`;
}

function getWorkflowDates(booking) {
  const details = getRentalFormDetails(booking);

  return [
    {
      label: "Inquiry",
      value:
        details.inquiryDate ||
        booking.submittedAt ||
        "",
    },
    {
      label: "Contract Sent",
      value: details.contractSentDate || "",
    },
    {
      label: "Return By",
      value: details.returnContractByDate || "",
    },
    {
      label: "Returned",
      value: details.contractReturnedDate || "",
    },
  ].filter((item) => !isBlankBookingValue(item.value));
}

function getSourceSheetText(booking) {
  const sourceSheet = String(booking.sourceSheet || "").trim();

  if (sourceSheet) {
    return sourceSheet;
  }

  return isStaffBookingRecord(booking)
    ? "Staff Booking Form"
    : "No source sheet";
}


/* =========================================================
   MAIN VIEW
========================================================= */

export default function InquiryPipelineView({
  inquiryBookings = [],
  openInquiryDetail,
  openBookingDetail,
  onUpdateBookingStatus,
}) {
  const [searchText, setSearchText] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");


  /* =======================================================
     BUILD THE LIVE WORKFLOW DATASET

     - Master and archive records are excluded.
     - If an inquiry has already been converted into a Staff
       Booking, the old raw inquiry card is hidden so staff
       does not see two cards for the same group.
  ======================================================= */

  const pipelineDataset = useMemo(
    () => getInquiryPipelineRecords(inquiryBookings),
    [inquiryBookings]
  );


  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchText
      .trim()
      .toLowerCase();

    return pipelineDataset.records.filter((booking) => {
      const recordKind = getPipelineRecordKind(booking);

      if (
        sourceFilter !== "all" &&
        recordKind.key !== sourceFilter
      ) {
        return false;
      }

      if (
        normalizedSearch &&
        !getPipelineSearchText(booking).includes(
          normalizedSearch
        )
      ) {
        return false;
      }

      return true;
    });
  }, [
    pipelineDataset.records,
    searchText,
    sourceFilter,
  ]);


  const pipelineGroups = useMemo(() => {
    const groupedBookings = PIPELINE_COLUMNS.reduce(
      (groups, column) => {
        groups[column.key] = [];
        return groups;
      },
      {}
    );

    filteredRecords.forEach((booking) => {
      const columnKey =
        getInquiryPipelineColumnKey(booking);

      if (groupedBookings[columnKey]) {
        groupedBookings[columnKey].push(booking);
      }
    });

    Object.keys(groupedBookings).forEach((key) => {
      groupedBookings[key].sort(
        (a, b) =>
          getPipelineSortTimestamp(b) -
          getPipelineSortTimestamp(a)
      );
    });

    return groupedBookings;
  }, [filteredRecords]);


  const needsActionCount =
    pipelineGroups.newInquiry.length +
    pipelineGroups.needsReview.length;

  const contractSentCount =
    pipelineGroups.contractSent.length;

  const confirmedCount =
    pipelineGroups.confirmed.length;

  const waitlistCount =
    pipelineGroups.waitlist.length;


  /* =======================================================
     STATUS / TIMELINE ACTIONS

     Dashboard.jsx already saves whatever booking object is
     passed into onUpdateBookingStatus(). That means we can
     update rentalFormDetails here without changing the parent.
  ======================================================= */

  const updatePipelineBooking = (
    booking,
    nextStatus,
    changes = {}
  ) => {
    if (!onUpdateBookingStatus) {
      return;
    }

    const currentDetails =
      getRentalFormDetails(booking);

    const updatedBooking = {
      ...booking,
      ...changes,
      rentalFormDetails: {
        ...currentDetails,
        ...(changes.rentalFormDetails || {}),
      },
    };

    onUpdateBookingStatus(
      updatedBooking,
      nextStatus
    );
  };

  const markContractSent = (booking) => {
    const details = getRentalFormDetails(booking);

    updatePipelineBooking(
      booking,
      "Contract Sent",
      {
        waitlist: "No",
        rentalFormDetails: {
          contractSentDate:
            details.contractSentDate ||
            getTodayInputValue(),
        },
      }
    );
  };

  const markConfirmed = (booking) => {
    const details = getRentalFormDetails(booking);

    updatePipelineBooking(
      booking,
      "Confirmed",
      {
        waitlist: "No",
        rentalFormDetails: {
          contractReturnedDate:
            details.contractReturnedDate ||
            getTodayInputValue(),
        },
      }
    );
  };

  const moveToWaitlist = (booking) => {
    updatePipelineBooking(
      booking,
      "Waitlist",
      {
        waitlist: "Yes",
      }
    );
  };

  const returnToInquiry = (booking) => {
    updatePipelineBooking(
      booking,
      "Inquiry",
      {
        waitlist: "No",
      }
    );
  };

  const openPipelineRecord = (booking) => {
    if (
      isStaffBookingRecord(booking) &&
      openBookingDetail
    ) {
      openBookingDetail(booking);
      return;
    }

    const fallbackOpen =
      openInquiryDetail || openBookingDetail;

    fallbackOpen?.(booking);
  };


  return (
    <section className="inquiry-pipeline-page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <article className="dashboard-card inquiry-pipeline-header-card">
        <div className="inquiry-pipeline-header">
          <div className="inquiry-pipeline-title-area">
            <span className="inquiry-pipeline-title-icon">
              <FaClipboardList />
            </span>

            <div>
              <p className="dashboard-eyebrow">
                Rentals & Events
              </p>

              <h2>Inquiry Pipeline</h2>

              <p>
                Live workflow tracking from inquiry through
                contract return, waitlist, or cancellation.
              </p>
            </div>
          </div>

          <div className="inquiry-pipeline-summary">
            <span className="pipeline-summary-action">
              <strong>{needsActionCount}</strong>
              Needs Action
            </span>

            <span className="pipeline-summary-contract">
              <strong>{contractSentCount}</strong>
              Contracts Out
            </span>

            <span className="pipeline-summary-confirmed">
              <strong>{confirmedCount}</strong>
              Confirmed
            </span>

            <span className="pipeline-summary-waitlist">
              <strong>{waitlistCount}</strong>
              Waitlist
            </span>
          </div>
        </div>


        {/* ===================================================
            FILTERS
        =================================================== */}

        <div className="inquiry-pipeline-toolbar">
          <label className="inquiry-pipeline-search">
            <FaSearch />

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="Search organization, contact, dates, status..."
            />
          </label>

          <div
            className="inquiry-pipeline-source-filter"
            aria-label="Pipeline source filter"
          >
            <span className="inquiry-pipeline-filter-label">
              <FaFilter />
              Show
            </span>

            <button
              type="button"
              className={
                sourceFilter === "all"
                  ? "active"
                  : ""
              }
              onClick={() => setSourceFilter("all")}
            >
              All Workflow
            </button>

            <button
              type="button"
              className={
                sourceFilter === "inquiry"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setSourceFilter("inquiry")
              }
            >
              Inquiries
            </button>

            <button
              type="button"
              className={
                sourceFilter === "booking"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setSourceFilter("booking")
              }
            >
              Staff Bookings
            </button>
          </div>
        </div>

        <div className="inquiry-pipeline-system-note">
          <div>
            <strong>Current-system workflow</strong>
            <span>
              Contract stages are derived from the saved
              Booking Timeline dates. Master/archive rows are
              not treated as active inquiries.
            </span>
          </div>

          <div className="inquiry-pipeline-note-counts">
            {pipelineDataset.hiddenConvertedInquiryCount > 0 && (
              <span>
                {pipelineDataset.hiddenConvertedInquiryCount}
                {" "}
                converted duplicate
                {pipelineDataset.hiddenConvertedInquiryCount === 1
                  ? ""
                  : "s"}
                {" "}
                hidden
              </span>
            )}

            {pipelineDataset.excludedMasterArchiveCount > 0 && (
              <span>
                {pipelineDataset.excludedMasterArchiveCount}
                {" "}
                master/archive record
                {pipelineDataset.excludedMasterArchiveCount === 1
                  ? ""
                  : "s"}
                {" "}
                excluded
              </span>
            )}
          </div>
        </div>
      </article>


      {/* =====================================================
          PIPELINE BOARD
      ===================================================== */}

      <div className="inquiry-pipeline-board">
        {PIPELINE_COLUMNS.map((column) => {
          const ColumnIcon = column.icon;
          const bookings =
            pipelineGroups[column.key] || [];

          return (
            <section
              className={`inquiry-pipeline-column pipeline-column-${column.key}`}
              key={column.key}
            >
              <div className="inquiry-pipeline-column-header">
                <div className="inquiry-pipeline-column-title">
                  <span className="inquiry-pipeline-column-icon">
                    <ColumnIcon />
                  </span>

                  <div>
                    <h3>{column.label}</h3>
                    <p>{column.description}</p>
                  </div>
                </div>

                <strong className="inquiry-pipeline-column-count">
                  {bookings.length}
                </strong>
              </div>

              <div className="inquiry-pipeline-card-list">
                {bookings.length > 0 ? (
                  bookings.map((booking) => {
                    const issues =
                      getBookingQualityIssues(booking);

                    const recordKind =
                      getPipelineRecordKind(booking);

                    const workflowDates =
                      getWorkflowDates(booking);

                    const guestCount =
                      getEstimatedGuestCount(booking);

                    const details =
                      getRentalFormDetails(booking);

                    const isBooking =
                      isStaffBookingRecord(booking);

                    const isConvertedBooking = Boolean(
                      details.sourceInquiryId
                    );

                    const safeBookingKey =
                      booking.id ||
                      `${booking.organizationName}-${booking.submittedAt}`;

                    return (
                      <article
                        className="inquiry-pipeline-card"
                        key={safeBookingKey}
                      >
                        <div className="inquiry-pipeline-card-topline">
                          <span
                            className={`inquiry-pipeline-source-pill ${recordKind.className}`}
                          >
                            {recordKind.label}
                          </span>

                          <span
                            className={`inquiry-pipeline-status ${getStageStatusClass(
                              column.key
                            )}`}
                          >
                            {getStageStatusLabel(
                              column.key
                            )}
                          </span>
                        </div>

                        <div className="inquiry-pipeline-card-heading">
                          <strong>
                            {booking.organizationName ||
                              "Unnamed Organization"}
                          </strong>

                          <small>
                            {booking.contactName &&
                            booking.contactName !==
                              "No contact name"
                              ? booking.contactName
                              : "No contact name"}
                          </small>
                        </div>

                        <div className="inquiry-pipeline-card-facts">
                          <span>
                            <FaCalendarAlt />
                            {getRequestedDateText(booking)}
                          </span>

                          <span>
                            <FaUsers />
                            {guestCount
                              ? `${guestCount} guests`
                              : "Guest count needed"}
                          </span>

                          <span>
                            <FaClipboardList />
                            {booking.retreatType ||
                              "Retreat type needed"}
                          </span>
                        </div>

                        {workflowDates.length > 0 && (
                          <div className="inquiry-pipeline-timeline">
                            {workflowDates.map((item) => (
                              <span
                                key={`${safeBookingKey}-${item.label}`}
                              >
                                <small>{item.label}</small>
                                <strong>
                                  {formatPipelineDate(
                                    item.value
                                  )}
                                </strong>
                              </span>
                            ))}
                          </div>
                        )}

                        {issues.length > 0 &&
                          column.key !== "confirmed" &&
                          column.key !== "cancelled" && (
                            <div className="inquiry-pipeline-issues">
                              {issues.map((issue) => (
                                <span
                                  key={`${safeBookingKey}-${issue}`}
                                >
                                  <FaExclamationTriangle />
                                  {issue}
                                </span>
                              ))}
                            </div>
                          )}

                        {isConvertedBooking && (
                          <div className="inquiry-pipeline-linked-note">
                            <FaArrowRight />
                            Converted from inquiry
                          </div>
                        )}

                        {!isBooking &&
                          (column.key === "newInquiry" ||
                            column.key === "needsReview") && (
                            <div className="inquiry-pipeline-next-step-note">
                              Create the booking from the Inquiry
                              Spreadsheet before starting contract
                              tracking.
                            </div>
                          )}

                        <div className="inquiry-pipeline-card-footer">
                          <span
                            className="inquiry-pipeline-source-sheet"
                            title={getSourceSheetText(booking)}
                          >
                            {getSourceSheetText(booking)}
                          </span>

                          <div className="inquiry-pipeline-actions">
                            <button
                              className="pipeline-text-button"
                              type="button"
                              onClick={() =>
                                openPipelineRecord(booking)
                              }
                            >
                              View Details
                            </button>

                            {isBooking &&
                              (column.key === "newInquiry" ||
                                column.key === "needsReview") && (
                                <button
                                  className="pipeline-mini-button pipeline-mini-button-primary"
                                  type="button"
                                  onClick={() =>
                                    markContractSent(
                                      booking
                                    )
                                  }
                                >
                                  Contract Sent
                                </button>
                              )}

                            {column.key === "contractSent" && (
                              <button
                                className="pipeline-mini-button pipeline-mini-button-success"
                                type="button"
                                onClick={() =>
                                  markConfirmed(booking)
                                }
                              >
                                Confirm
                              </button>
                            )}

                            {column.key !== "waitlist" &&
                              column.key !== "confirmed" &&
                              column.key !== "cancelled" && (
                                <button
                                  className="pipeline-mini-button"
                                  type="button"
                                  onClick={() =>
                                    moveToWaitlist(
                                      booking
                                    )
                                  }
                                >
                                  Waitlist
                                </button>
                              )}

                            {column.key === "waitlist" && (
                              <button
                                className="pipeline-mini-button"
                                type="button"
                                onClick={() =>
                                  returnToInquiry(
                                    booking
                                  )
                                }
                              >
                                <FaUndoAlt />
                                Return
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="inquiry-pipeline-empty">
                    <strong>No items</strong>
                    <p>
                      Nothing currently in this stage
                      {searchText || sourceFilter !== "all"
                        ? " for these filters."
                        : "."}
                    </p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
