import {
  FaTable,
  FaBed,
  FaUser,
  FaBuilding,
  FaUsers,
  FaDollarSign,
  FaUtensils,
  FaHiking,
  FaMoon,
  FaPen,
} from "react-icons/fa";
import { getLegacyBookingNotes } from "../../utils/legacyBookingNotes";
import { formatMealTime as formatBookingOverviewTime } from "../../utils/mealPlan";
import {
  getBookingOverviewScheduleRows,
  hasBookingOverviewValue,
  formatBookingOverviewValue,
  parseBookingOverviewNumber,
} from "./bookingOverviewValues";
import { formatBookingDetailDate } from "./bookingDetailSettings";

/* =========================================================
   LARGE OVERVIEW LAYOUT
   The original profile layout, kept as the Large density option.
========================================================= */


export function BookingActivitiesLargeOverview({
  booking,
  details,
  dateSettings,
}) {
  const activities =
    getBookingOverviewScheduleRows(
      details?.activities
    ).length > 0
      ? getBookingOverviewScheduleRows(
          details?.activities
        )
      : getBookingOverviewScheduleRows(
          booking.activities
        );

  const activityNotes =
    details?.activityNotes || "";

  const legacyActivityNotes =
    getLegacyBookingNotes(booking).activities;

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-schedule-showcase">
      <div className="booking-overview-schedule-header">
        <span className="booking-overview-schedule-header-icon">
          <FaHiking />
        </span>

        <div>
          <p>Program</p>
          <h3>Activities</h3>
          <span>
            Scheduled activities, locations, and program notes.
          </span>
        </div>
      </div>

      {activities.length > 0 ? (
        <div className="booking-overview-schedule-table-wrap">
          <div className="booking-overview-schedule-table booking-overview-activity-table">
            <div className="booking-overview-schedule-table-head">
              <span>Date</span>
              <span>Time</span>
              <span>Activity</span>
            </div>

            {activities.map((activity, index) => (
              <div
                className="booking-overview-schedule-row"
                key={`${activity.date || "activity"}-${activity.time || "time"}-${index}`}
              >
                <strong>
                  {activity.date
                    ? formatBookingDetailDate(
                        activity.date,
                        dateSettings
                      )
                    : "—"}
                </strong>

                <span>
                  {activity.time
                    ? formatBookingOverviewTime(
                        activity.time
                      )
                    : "—"}
                </span>

                <span className="booking-overview-schedule-primary">
                  {activity.activity || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : legacyActivityNotes.length > 0 ? null : (
        <div className="booking-overview-schedule-empty">
          <FaHiking />

          <div>
            <strong>No activities scheduled yet</strong>
            <span>
              Activities added in Create Booking will appear here with their date and time.
            </span>
          </div>
        </div>
      )}

      {activityNotes && (
        <div className="booking-overview-schedule-notes">
          <strong>Activity Notes</strong>
          <p>{activityNotes}</p>
        </div>
      )}

      {legacyActivityNotes.map((note) => (
        <div className="booking-overview-schedule-notes" key={note.label}>
          <strong>{note.label}</strong>
          <p>{note.text}</p>
        </div>
      ))}
    </section>
  );
}

export function BookingFacilitiesLargeOverview({
  booking,
  details,
  dateSettings,
}) {
  const facilities =
    getBookingOverviewScheduleRows(
      details?.facilities
    ).length > 0
      ? getBookingOverviewScheduleRows(
          details?.facilities
        )
      : getBookingOverviewScheduleRows(
          booking.facilities
        );

  const facilityNotes =
    details?.facilityNotes || "";

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-schedule-showcase">
      <div className="booking-overview-schedule-header">
        <span className="booking-overview-schedule-header-icon booking-overview-schedule-header-icon-facilities">
          <FaBuilding />
        </span>

        <div>
          <p>Operations</p>
          <h3>Facilities</h3>
          <span>
            Facility preparation tasks, assignments, and setup notes.
          </span>
        </div>
      </div>

      {facilities.length > 0 ? (
        <div className="booking-overview-schedule-table-wrap">
          <div className="booking-overview-schedule-table booking-overview-facility-table">
            <div className="booking-overview-schedule-table-head">
              <span>Date</span>
              <span>Time</span>
              <span>Task</span>
              <span>Assigned To</span>
              <span>Notes</span>
            </div>

            {facilities.map((facility, index) => (
              <div
                className="booking-overview-schedule-row"
                key={`${facility.date || "facility"}-${facility.time || "time"}-${index}`}
              >
                <strong>
                  {facility.date
                    ? formatBookingDetailDate(
                        facility.date,
                        dateSettings
                      )
                    : "—"}
                </strong>

                <span>
                  {facility.time
                    ? formatBookingOverviewTime(
                        facility.time
                      )
                    : "—"}
                </span>

                <span className="booking-overview-schedule-primary">
                  {facility.task || "—"}
                </span>

                <span>
                  {facility.assignedTo || "—"}
                </span>

                <span>
                  {facility.notes || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="booking-overview-schedule-empty booking-overview-schedule-empty-facilities">
          <FaBuilding />

          <div>
            <strong>No facility tasks scheduled yet</strong>
            <span>
              Facility tasks added in Create Booking will appear here with their assignments and notes.
            </span>
          </div>
        </div>
      )}

      {facilityNotes && (
        <div className="booking-overview-schedule-notes">
          <strong>Facility Notes</strong>
          <p>{facilityNotes}</p>
        </div>
      )}
    </section>
  );
}

function BookingOverviewGuestCard({
  icon: Icon,
  title,
  fields = [],
  tone = "default",
}) {
  const visibleFields = fields.filter(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );

  if (visibleFields.length === 0) {
    return null;
  }

  const rowFields = visibleFields.filter(
    (field) => !field.multiline
  );

  const noteFields = visibleFields.filter(
    (field) => field.multiline
  );

  return (
    <section
      className={[
        "booking-overview-guest-card",
        `booking-overview-guest-card-${tone}`,
      ].join(" ")}
    >
      <div className="booking-overview-guest-card-header">
        <span className="booking-overview-guest-card-icon">
          <Icon />
        </span>

        <div>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="booking-overview-guest-card-list">
        {rowFields.map((field) => {
          const FieldIcon = field.icon;

          return (
            <div
              className="booking-overview-guest-row"
              key={field.label}
            >
              <div className="booking-overview-guest-row-label">
                {FieldIcon && (
                  <FieldIcon className="booking-overview-guest-row-label-icon" />
                )}

                <span>{field.label}</span>
              </div>

              <strong>
                {formatBookingOverviewValue(
                  field.value
                )}
              </strong>
            </div>
          );
        })}
      </div>

      {noteFields.length > 0 && (
        <div className="booking-overview-guest-notes">
          {noteFields.map((field) => {
            const FieldIcon = field.icon;

            return (
              <div
                className="booking-overview-guest-note"
                key={field.label}
              >
                <div className="booking-overview-guest-note-label">
                  {FieldIcon && (
                    <FieldIcon className="booking-overview-guest-row-label-icon" />
                  )}

                  <span>{field.label}</span>
                </div>

                <div className="booking-overview-guest-note-value">
                  {formatBookingOverviewValue(
                    field.value
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function BookingOverviewGuestShowcase({
  estimatedGuests,
  actualGuests,
  minimumGuarantee,
  maximumGuarantee,
  numberOfNights,
  numberOfMeals,
  approximateGuestFields,
  actualGuestFields,
  dayCamperFields,
  ratesAndStayFields,
  setActiveTab,
}) {
  const estimatedNumber =
    parseBookingOverviewNumber(
      estimatedGuests
    );

  const actualNumber =
    parseBookingOverviewNumber(
      actualGuests
    );

  const difference =
    estimatedNumber !== null &&
    actualNumber !== null
      ? actualNumber - estimatedNumber
      : null;

  const guaranteeMinimumText =
    hasBookingOverviewValue(
      minimumGuarantee
    )
      ? formatBookingOverviewValue(
          minimumGuarantee
        )
      : "";

  const guaranteeMaximumText =
    hasBookingOverviewValue(
      maximumGuarantee
    )
      ? formatBookingOverviewValue(
          maximumGuarantee
        )
      : "";

  const guaranteeRangeText =
    guaranteeMinimumText &&
    guaranteeMaximumText
      ? `${guaranteeMinimumText} – ${guaranteeMaximumText}`
      : guaranteeMinimumText ||
        guaranteeMaximumText ||
        "—";

  let differenceText = "";
  let differenceClass =
    "booking-overview-guest-summary-meta-neutral";

  if (difference !== null) {
    if (difference < 0) {
      differenceText = `${Math.abs(
        difference
      )} fewer than estimated ↓`;
      differenceClass =
        "booking-overview-guest-summary-meta-down";
    } else if (difference > 0) {
      differenceText = `${difference} more than estimated ↑`;
      differenceClass =
        "booking-overview-guest-summary-meta-up";
    } else {
      differenceText =
        "Matches estimated total";
    }
  }

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-guest-showcase">

      <div className="booking-overview-guest-showcase-header">
        <div className="booking-overview-guest-showcase-title">
          <span className="booking-overview-guest-showcase-title-icon">
            <FaUsers />
          </span>

          <div>
            <p>Guests</p>
            <h2>Guest Information</h2>
            {/* <span>
              Group size, attendance details, and stay preferences for this retreat.
            </span> */}
          </div>
        </div>

        <button
          type="button"
          className="booking-overview-guest-showcase-edit"
          onClick={() =>
            setActiveTab("Details")
          }
        >
          <FaPen />
          <span>Edit Information</span>
        </button>
      </div>


      <div className="booking-overview-guest-summary">
        <div className="booking-overview-guest-summary-block">
          <span className="booking-overview-guest-summary-icon">
            <FaUsers />
          </span>

          <div className="booking-overview-guest-summary-copy">
            <small>
              Total Guests (Estimated)
            </small>

            <div className="booking-overview-guest-summary-main">
              <strong>
                {formatBookingOverviewValue(
                  estimatedGuests
                )}
              </strong>

              <div className="booking-overview-guest-summary-sidecopy">
                <span>
                  {guaranteeRangeText}
                </span>
                <em>guarantee range</em>
              </div>
            </div>
          </div>
        </div>


        <div className="booking-overview-guest-summary-block">
          <span className="booking-overview-guest-summary-icon">
            <FaUsers />
          </span>

          <div className="booking-overview-guest-summary-copy">
            <small>
              Total Guests (Actual)
            </small>

            <div className="booking-overview-guest-summary-main">
              <strong>
                {formatBookingOverviewValue(
                  actualGuests
                )}
              </strong>

              {differenceText && (
                <div
                  className={`booking-overview-guest-summary-meta ${differenceClass}`}
                >
                  {differenceText}
                </div>
              )}
            </div>
          </div>
        </div>


        <div className="booking-overview-guest-summary-block">
          <span className="booking-overview-guest-summary-icon">
            <FaMoon />
          </span>

          <div className="booking-overview-guest-summary-copy">
            <small>
              Stay Details
            </small>

            <div className="booking-overview-guest-stay-values">
              <div>
                <FaBed />
                <strong>
                  {formatBookingOverviewValue(
                    numberOfNights
                  )}
                </strong>
                <span>nights</span>
              </div>

              <div>
                <FaUtensils />
                <strong>
                  {formatBookingOverviewValue(
                    numberOfMeals
                  )}
                </strong>
                <span>meals</span>
              </div>
            </div>
          </div>
        </div>
      </div>


      <div className="booking-overview-guest-cards">
        <BookingOverviewGuestCard
          icon={FaUsers}
          title="Approximate Guests"
          fields={approximateGuestFields}
          tone="green"
        />

        <BookingOverviewGuestCard
          icon={FaUser}
          title="Actual Guests"
          fields={actualGuestFields}
          tone="blue"
        />

        <BookingOverviewGuestCard
          icon={FaDollarSign}
          title="Rates & Stay"
          fields={ratesAndStayFields}
          tone="sand"
        />

        <BookingOverviewGuestCard
          icon={FaUsers}
          title="Day Campers"
          fields={dayCamperFields}
          tone="teal"
        />
      </div>

    </section>
  );
}

export function BookingOverviewLargeSourceData({
  booking,
}) {
  const rawData =
    booking?.rawSpreadsheetData;

  if (
    !rawData ||
    typeof rawData !== "object"
  ) {
    return null;
  }

  const ignoredKeys = new Set([
    "sourceSheet",
    "sourceRowNumber",
  ]);

  const entries = Object.entries(rawData)
    .filter(
      ([key, value]) =>
        !ignoredKeys.has(key) &&
        hasBookingOverviewValue(value)
    );

  if (entries.length === 0) {
    return null;
  }

  return (
    <details className="booking-overview-source-data booking-overview-card booking-overview-card-wide">
      <summary>
        <span className="booking-overview-card-icon">
          <FaTable />
        </span>

        <div>
          <p>Imported record</p>
          <h3>Original Source Data</h3>
          <small>
            View the original spreadsheet values
            stored with this booking.
          </small>
        </div>

        <strong>
          {entries.length} field
          {entries.length === 1 ? "" : "s"}
        </strong>
      </summary>

      <div className="booking-overview-source-grid">
        {entries.map(([key, value]) => (
          <div
            className="booking-overview-source-field"
            key={key}
          >
            <small>{key}</small>

            <strong>
              {formatBookingOverviewValue(
                value
              )}
            </strong>
          </div>
        ))}
      </div>
    </details>
  );
}
