import { useState } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import { BookingOverviewEmptyRow, BookingOverviewSection } from "./BookingOverviewParts";

/* =========================================================
   BOOKING INCIDENT NOTES
   Stored inside rentalFormDetails.incidentNotes
========================================================= */

export default function BookingIncidentNotesCard({ booking, onSaveBooking }) {
  const getSavedIncidentNotes = () =>
    String(
      booking?.rentalFormDetails?.incidentNotes || ""
    );

  const [incidentNotes, setIncidentNotes] = useState(
    getSavedIncidentNotes
  );

  const [isEditingIncidentNotes, setIsEditingIncidentNotes] =
    useState(false);

  // Another booking, or a saved change to the notes: show the saved text again.
  const [shownNotesFor, setShownNotesFor] = useState({
    id: booking.id,
    notes: booking.rentalFormDetails?.incidentNotes,
  });
  if (
    shownNotesFor.id !== booking.id ||
    shownNotesFor.notes !== booking.rentalFormDetails?.incidentNotes
  ) {
    setShownNotesFor({ id: booking.id, notes: booking.rentalFormDetails?.incidentNotes });
    setIncidentNotes(getSavedIncidentNotes());
    setIsEditingIncidentNotes(false);
  }

  const handleCancelIncidentNotes = () => {
    setIncidentNotes(getSavedIncidentNotes());
    setIsEditingIncidentNotes(false);
  };

  const handleSaveIncidentNotes = async () => {
    const updatedBooking = {
      ...booking,

      rentalFormDetails: {
        ...(booking.rentalFormDetails || {}),

        incidentNotes:
          incidentNotes.trim(),
      },
    };

    await onSaveBooking(updatedBooking);

    setIsEditingIncidentNotes(false);
  };

  const hasIncidentNotes =
    Boolean(
      String(
        booking?.rentalFormDetails?.incidentNotes || ""
      ).trim()
    );

  if (!isEditingIncidentNotes && !hasIncidentNotes) {
    return (
      <BookingOverviewEmptyRow
        icon={FaExclamationTriangle}
        title="Incident Notes"
        explanation="Document incidents, concerns, actions taken, and any staff follow-up."
        action={
          <button
            className="secondary-dashboard-button booking-compact-action"
            type="button"
            onClick={() =>
              setIsEditingIncidentNotes(true)
            }
          >
            Add Incident Notes
          </button>
        }
      />
    );
  }

  return (
    <BookingOverviewSection
      icon={FaExclamationTriangle}
      title="Incident Notes"
      className="booking-compact-incident"
      actions={
        isEditingIncidentNotes ? (
          <>
            <button
              className="secondary-dashboard-button booking-compact-action"
              type="button"
              onClick={
                handleCancelIncidentNotes
              }
            >
              Cancel
            </button>

            <button
              className="primary-dashboard-button booking-compact-action"
              type="button"
              onClick={
                handleSaveIncidentNotes
              }
            >
              Save Incident Notes
            </button>
          </>
        ) : (
          <button
            className="secondary-dashboard-button booking-compact-action"
            type="button"
            onClick={() =>
              setIsEditingIncidentNotes(true)
            }
          >
            Edit Incident Notes
          </button>
        )
      }
    >
      {isEditingIncidentNotes ? (
        <label className="booking-incident-notes-field">
          <span>Incident Record</span>

          <textarea
            rows="7"
            value={incidentNotes}
            onChange={(event) =>
              setIncidentNotes(
                event.target.value
              )
            }
            placeholder="Example: 9/8/2026 - Guest reported an injury near the dining hall. First aid was provided. Staff followed up with the group leader."
          />
        </label>
      ) : (
        <p className="booking-compact-text">
          {
            booking.rentalFormDetails
              .incidentNotes
          }
        </p>
      )}
    </BookingOverviewSection>
  );
}
