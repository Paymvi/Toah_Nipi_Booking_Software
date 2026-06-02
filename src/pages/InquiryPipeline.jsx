import { useMemo } from "react";
import { FaClipboardList } from "react-icons/fa";

import { INQUIRY_PIPELINE_COLUMNS } from "../constants/dashboardConstants";
import { formatDateRange } from "../utils/dateUtils";

function isBlankBookingValue(value) {
  const text = String(value || "").trim().toLowerCase();

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

export function getBookingQualityIssues(booking) {
  const issues = [];

  if (isBlankBookingValue(booking.startDate)) {
    issues.push("Missing start date");
  }

  if (isBlankBookingValue(booking.contactName)) {
    issues.push("Missing contact");
  }

  if (isBlankBookingValue(booking.email) && isBlankBookingValue(booking.phone)) {
    issues.push("Missing email/phone");
  }

  if (isBlankBookingValue(booking.attendeeCount)) {
    issues.push("Missing guest count");
  }

  if (isBlankBookingValue(booking.retreatType)) {
    issues.push("Missing retreat type");
  }

  if (
    isBlankBookingValue(booking.roomName) &&
    isBlankBookingValue(booking.buildingsRooms)
  ) {
    issues.push("Missing room");
  }

  return issues;
}

export function getInquiryPipelineColumnKey(booking) {
  const status = String(booking.status || "").toLowerCase();
  const waitlist = String(booking.waitlist || "").toLowerCase();
  const issues = getBookingQualityIssues(booking);

  if (status.includes("cancel")) {
    return "cancelled";
  }

  if (waitlist === "yes" || status.includes("wait")) {
    return "waitlist";
  }

  if (status.includes("confirm") || status.includes("booked")) {
    return "confirmed";
  }

  if (status.includes("contract")) {
    return "contractSent";
  }

  if (issues.length > 0) {
    return "needsReview";
  }

  return "newInquiry";
}

function getPipelineStatusClass(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus.includes("confirm") || normalizedStatus.includes("book")) {
    return "pipeline-status-confirmed";
  }

  if (normalizedStatus.includes("contract")) {
    return "pipeline-status-contract";
  }

  if (normalizedStatus.includes("cancel")) {
    return "pipeline-status-cancelled";
  }

  if (normalizedStatus.includes("wait")) {
    return "pipeline-status-waitlist";
  }

  if (normalizedStatus.includes("import")) {
    return "pipeline-status-imported";
  }

  return "pipeline-status-inquiry";
}

export default function InquiryPipelineView({
  inquiryBookings,
  openBookingDetail,
  onUpdateBookingStatus,
}) {
  const pipelineGroups = useMemo(() => {
    const groupedBookings = INQUIRY_PIPELINE_COLUMNS.reduce((groups, column) => {
      groups[column.key] = [];
      return groups;
    }, {});

    inquiryBookings.forEach((booking) => {
      const columnKey = getInquiryPipelineColumnKey(booking);
      groupedBookings[columnKey].push(booking);
    });

    Object.keys(groupedBookings).forEach((key) => {
      groupedBookings[key].sort((a, b) => {
        const aDate = new Date(a.submittedAt || a.startDate || 0);
        const bDate = new Date(b.submittedAt || b.startDate || 0);

        return bDate - aDate;
      });
    });

    return groupedBookings;
  }, [inquiryBookings]);

  const needsReviewCount = inquiryBookings.filter(
    (booking) =>
      getBookingQualityIssues(booking).length > 0 ||
      getInquiryPipelineColumnKey(booking) === "newInquiry"
  ).length;

  const contractSentCount = pipelineGroups.contractSent.length;
  const confirmedCount = pipelineGroups.confirmed.length;

  return (
    <section className="inquiry-pipeline-page">
      <article className="dashboard-card inquiry-pipeline-header-card">
        <div className="inquiry-pipeline-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaClipboardList />
            </span>

            <div>
              <p className="dashboard-eyebrow">Rentals & Events</p>
              <h2>Inquiry Pipeline</h2>
              <p>
                A workflow view for staff follow-up, missing information,
                contracts, confirmations, waitlists, and cancellations.
              </p>
            </div>
          </div>

          <div className="inquiry-pipeline-summary">
            <span>
              <strong>{needsReviewCount}</strong>
              Needs Action
            </span>

            <span>
              <strong>{contractSentCount}</strong>
              Contracts
            </span>

            <span>
              <strong>{confirmedCount}</strong>
              Confirmed
            </span>
          </div>
        </div>
      </article>

      <div className="inquiry-pipeline-board">
        {INQUIRY_PIPELINE_COLUMNS.map((column) => {
          const ColumnIcon = column.icon;
          const bookings = pipelineGroups[column.key] || [];

          return (
            <section className="inquiry-pipeline-column" key={column.key}>
              <div className="inquiry-pipeline-column-header">
                <div>
                  <span>
                    <ColumnIcon />
                  </span>

                  <div>
                    <h3>{column.label}</h3>
                    <p>{column.description}</p>
                  </div>
                </div>

                <strong>{bookings.length}</strong>
              </div>

              <div className="inquiry-pipeline-card-list">
                {bookings.length > 0 ? (
                  bookings.map((booking) => {
                    const issues = getBookingQualityIssues(booking);
                    const dateText =
                      formatDateRange(booking.startDate, booking.endDate) ||
                      booking.desiredDatesText ||
                      "No dates";

                    return (
                      <article
                        className="inquiry-pipeline-card"
                        key={booking.id}
                      >
                        <div className="inquiry-pipeline-card-top">
                          <div>
                            <strong>{booking.organizationName}</strong>
                            <small>{booking.contactName}</small>
                          </div>

                          <span
                            className={`inquiry-pipeline-status ${getPipelineStatusClass(
                              booking.status
                            )}`}
                          >
                            {booking.status || "Inquiry"}
                          </span>
                        </div>

                        <div className="inquiry-pipeline-card-meta">
                          <span>{dateText}</span>

                          <span>
                            {booking.attendeeCount
                              ? `${booking.attendeeCount} guests`
                              : "No guest count"}
                          </span>

                          <span>
                            {booking.retreatType || "No retreat type"}
                          </span>
                        </div>

                        {issues.length > 0 && (
                          <div className="inquiry-pipeline-issues">
                            {issues.slice(0, 3).map((issue) => (
                              <span key={`${booking.id}-${issue}`}>
                                {issue}
                              </span>
                            ))}

                            {issues.length > 3 && (
                              <span>+{issues.length - 3} more</span>
                            )}
                          </div>
                        )}

                        <div className="inquiry-pipeline-actions">
                          <button
                            className="pipeline-text-button"
                            type="button"
                            onClick={() => openBookingDetail(booking)}
                          >
                            View Details
                          </button>

                          {column.key !== "contractSent" &&
                            column.key !== "confirmed" &&
                            column.key !== "cancelled" && (
                              <button
                                className="pipeline-mini-button"
                                type="button"
                                onClick={() =>
                                  onUpdateBookingStatus(booking, "Contract Sent")
                                }
                              >
                                Contract
                              </button>
                            )}

                          {column.key !== "confirmed" &&
                            column.key !== "cancelled" && (
                              <button
                                className="pipeline-mini-button"
                                type="button"
                                onClick={() =>
                                  onUpdateBookingStatus(booking, "Confirmed")
                                }
                              >
                                Confirm
                              </button>
                            )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="inquiry-pipeline-empty">
                    <strong>No items</strong>
                    <p>Nothing currently in this stage.</p>
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