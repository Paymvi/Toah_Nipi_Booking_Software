import { FaTable, FaBuilding, FaUsers, FaHiking, FaChevronDown } from "react-icons/fa";
import { getLegacyBookingNotes } from "../../utils/legacyBookingNotes";
import { formatMealTime as formatBookingOverviewTime } from "../../utils/mealPlan";
import {
  getBookingOverviewScheduleRows,
  parseBookingOverviewNumber,
  hasBookingOverviewValue,
  formatBookingOverviewValue,
} from "./bookingOverviewValues";
import {
  BookingOverviewEmptyRow,
  BookingOverviewEditButton,
  BookingOverviewSection,
  BookingOverviewScheduleTable,
  BookingOverviewFields,
  BookingOverviewFieldGroup,
} from "./BookingOverviewParts";
import { formatBookingDetailDate } from "./bookingDetailSettings";

export function BookingActivitiesOverview({
  booking,
  details,
  dateSettings,
  setActiveTab,
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

  if (
    activities.length === 0 &&
    legacyActivityNotes.length === 0 &&
    !activityNotes
  ) {
    return (
      <BookingOverviewEmptyRow
        icon={FaHiking}
        title="Activities"
        explanation="Activities added in Create Booking will appear here with their date and time."
        action={<BookingOverviewEditButton setActiveTab={setActiveTab} />}
      />
    );
  }

  return (
    <BookingOverviewSection icon={FaHiking} title="Activities">
      {activities.length > 0 && (
        <BookingOverviewScheduleTable
          columns={["Date", "Time", "Activity"]}
          rows={activities.map((activity) => [
            activity.date
              ? formatBookingDetailDate(activity.date, dateSettings)
              : "—",
            activity.time
              ? formatBookingOverviewTime(activity.time)
              : "—",
            activity.activity || "—",
          ])}
        />
      )}

      <BookingOverviewFields
        fields={[
          { label: "Activity Notes", value: activityNotes, multiline: true },
          ...legacyActivityNotes.map((note) => ({
            label: note.label,
            value: note.text,
            multiline: true,
          })),
        ]}
      />
    </BookingOverviewSection>
  );
}

export function BookingFacilitiesOverview({
  booking,
  details,
  dateSettings,
  setActiveTab,
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

  if (facilities.length === 0 && !facilityNotes) {
    return (
      <BookingOverviewEmptyRow
        icon={FaBuilding}
        title="Facilities"
        explanation="Facility tasks added in Create Booking will appear here with their assignments and notes."
        action={<BookingOverviewEditButton setActiveTab={setActiveTab} />}
      />
    );
  }

  return (
    <BookingOverviewSection icon={FaBuilding} title="Facilities">
      {facilities.length > 0 && (
        <BookingOverviewScheduleTable
          columns={["Date", "Time", "Task", "Assigned To", "Notes"]}
          rows={facilities.map((facility) => [
            facility.date
              ? formatBookingDetailDate(facility.date, dateSettings)
              : "—",
            facility.time
              ? formatBookingOverviewTime(facility.time)
              : "—",
            facility.task || "—",
            facility.assignedTo || "—",
            facility.notes || "—",
          ])}
        />
      )}

      <BookingOverviewFields
        fields={[
          { label: "Facility Notes", value: facilityNotes, multiline: true },
        ]}
      />
    </BookingOverviewSection>
  );
}

export function BookingOverviewGuests({
  estimatedCounts,
  actualCounts,
  minimumGuarantee,
  maximumGuarantee,
  persons,
  camperDays,
  ethnicBreakdown,
  importedGuestCountText,
  dayCamperFields,
}) {
  const estimatedNumber =
    parseBookingOverviewNumber(
      estimatedCounts.total
    );

  const actualNumber =
    parseBookingOverviewNumber(
      actualCounts.total
    );

  const difference =
    estimatedNumber !== null &&
    actualNumber !== null
      ? actualNumber - estimatedNumber
      : null;

  let differenceText = "";

  if (difference !== null) {
    if (difference < 0) {
      differenceText = `${Math.abs(difference)} fewer than estimated ↓`;
    } else if (difference > 0) {
      differenceText = `${difference} more than estimated ↑`;
    } else {
      differenceText = "Matches estimated total";
    }
  }

  const hasMinimumGuarantee = hasBookingOverviewValue(minimumGuarantee);
  const hasMaximumGuarantee = hasBookingOverviewValue(maximumGuarantee);

  let guaranteeText = "";

  if (hasMinimumGuarantee && hasMaximumGuarantee) {
    guaranteeText = `${minimumGuarantee} – ${maximumGuarantee}`;
  } else if (hasMinimumGuarantee) {
    guaranteeText = `Minimum ${minimumGuarantee}`;
  } else if (hasMaximumGuarantee) {
    guaranteeText = `Maximum ${maximumGuarantee}`;
  }

  const guestRows = [
    { label: "Estimated", counts: estimatedCounts },
    { label: "Actual / Recorded", counts: actualCounts },
  ];

  return (
    <BookingOverviewSection icon={FaUsers} title="Guests">
      <table
        className="booking-compact-sheet booking-compact-sheet-numeric"
        data-tutorial-target="booking-overview-stats"
      >
        <thead>
          <tr>
            <th scope="col">Overnight Guests</th>
            <th scope="col">Total</th>
            <th scope="col">Adults</th>
            <th scope="col">Under 3</th>
            <th scope="col">Ages 3–17</th>
          </tr>
        </thead>

        <tbody>
          {guestRows.map(({ label, counts }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="booking-compact-sheet-strong">
                {formatBookingOverviewValue(counts.total)}
              </td>
              <td>{formatBookingOverviewValue(counts.adults)}</td>
              <td>{formatBookingOverviewValue(counts.under3)}</td>
              <td>{formatBookingOverviewValue(counts.ages3to17)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <BookingOverviewFields
        fields={[
          { label: "Guarantee Range", value: guaranteeText },
          { label: "Actual vs. Estimated", value: differenceText },
          { label: "# Persons", value: persons },
          { label: "Camper Days", value: camperDays },
          { label: "Ethnic Breakdown", value: ethnicBreakdown, multiline: true },
          { label: "Spreadsheet Guest Description", value: importedGuestCountText, multiline: true },
        ]}
      />

      <BookingOverviewFieldGroup title="Day Campers" fields={dayCamperFields} />
    </BookingOverviewSection>
  );
}

export function BookingOverviewSourceData({
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
    <details className="booking-compact-empty booking-compact-source-data">
      <summary>
        <FaTable aria-hidden="true" />
        <strong>Original Source Data</strong>
        <span>
          {entries.length} field
          {entries.length === 1 ? "" : "s"}
        </span>
        <FaChevronDown className="booking-compact-empty-chevron" aria-hidden="true" />
      </summary>

      <div className="booking-compact-empty-body">
        <p>The original spreadsheet values stored with this booking.</p>

        <BookingOverviewFields
          fields={entries.map(([key, value]) => ({ label: key, value }))}
        />
      </div>
    </details>
  );
}
