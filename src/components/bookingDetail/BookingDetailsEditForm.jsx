import { useState } from "react";
import {
  FaCalendarAlt,
  FaBed,
  FaBuilding,
  FaDollarSign,
  FaInfoCircle,
  FaUserPlus,
} from "react-icons/fa";
import { isHousingAuthoritative } from "../../utils/masterImportMerge";
import {
  applyBookingClassification,
  getBookingClassificationOptions,
  getBookingClassificationValue,
} from "../../utils/bookingClassification";
import { mirrorTopLevelIntoDetails, recordStaffEdits } from "../../utils/bookingFields";
import { getSecondaryContact, formatSecondaryContactPhone } from "../../utils/secondaryContact";

function createBookingEditFormState(booking) {
  const secondaryContact = getSecondaryContact(booking);

  return {
    ...secondaryContact,
    secondaryContactPhone: formatSecondaryContactPhone(
      secondaryContact.secondaryContactPhone
    ),
    organizationName: booking.organizationName || "",
    contactName: booking.contactName === "No contact name" ? "" : booking.contactName || "",
    email: booking.email === "No email provided" ? "" : booking.email || "",
    phone: booking.phone === "No phone provided" ? "" : booking.phone || "",

    startDate: booking.startDate || "",
    endDate: booking.endDate || "",
    desiredDatesText: booking.desiredDatesText || "",

    attendeeCount: booking.attendeeCount || "",
    retreatType: booking.retreatType || "",
    classification: getBookingClassificationValue(booking),

    roomName: booking.roomName === "Unassigned" ? "" : booking.roomName || "",
    buildingsRooms: booking.buildingsRooms || "",

    meals: booking.meals || "",
    foodAllergies: booking.foodAllergies || "",
    needToKnow: booking.needToKnow || "",
    linenSets: booking.linenSets || "",
    activities: booking.activities || "",

    persons: booking.persons || "",
    nights: booking.nights || "",
    mealCount: booking.mealCount || "",
    camperDays: booking.camperDays || "",

    usageFee: booking.usageFee || "",
    lodgingCost: booking.lodgingCost || "",
    foodCost: booking.foodCost || "",
    miscCost: booking.miscCost || "",

    notes: booking.notes || "",
  };
}

function BookingEditField({
  label,
  value,
  onChange,
  isEditing,
  type = "text",
  multiline = false,
  options,
  name,
  inputMode,
  autoComplete,
  pattern,
  title,
  readOnlyReason = "",
}) {
  const canEdit = isEditing && !readOnlyReason;

  return (
    <label className="booking-edit-field">
      <span>{label}</span>

      {options ? (
        <select
          value={value || ""}
          disabled={!canEdit}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => {
            const optionValue = typeof option === "object" ? option.value : option;
            const optionLabel = typeof option === "object" ? option.label : option;

            return (
              <option value={optionValue} key={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : multiline ? (
        <textarea
          value={value || ""}
          readOnly={!canEdit}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={type}
          name={name}
          inputMode={inputMode}
          autoComplete={autoComplete}
          pattern={pattern}
          title={title}
          value={value || ""}
          readOnly={!canEdit}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {readOnlyReason && isEditing && (
        <small className="booking-edit-field-note">{readOnlyReason}</small>
      )}
    </label>
  );
}

// Top-level fields this form edits; changes are recorded for re-imports.
const BOOKING_EDIT_TRACKED_FIELDS = [
  "organizationName", "contactName", "email", "phone",
  "startDate", "endDate", "desiredDatesText",
  "attendeeCount", "retreatType", "status", "waitlist",
  "roomName", "buildingsRooms",
  "meals", "foodAllergies", "needToKnow", "linenSets", "activities",
  "persons", "nights", "mealCount", "camperDays",
  "usageFee", "lodgingCost", "foodCost", "miscCost",
  "notes",
];

export default function BookingDetailsEditForm({ booking, onSaveBooking }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const housingIsAuthoritative = isHousingAuthoritative(booking);
  const housingReadOnlyReason = housingIsAuthoritative
    ? "Managed on the Housing tab."
    : "";
  const [formData, setFormData] = useState(() =>
    createBookingEditFormState(booking)
  );

  // Another booking opened: start from its saved values, out of edit mode.
  const [formBookingId, setFormBookingId] = useState(booking.id);
  if (formBookingId !== booking.id) {
    setFormBookingId(booking.id);
    setFormData(createBookingEditFormState(booking));
    setIsEditing(false);
  }

  const updateField = (fieldName, value) => {
    setFormData((currentData) => ({
      ...currentData,
      [fieldName]: value,
    }));
  };

  const handleCancel = () => {
    setFormData(createBookingEditFormState(booking));
    setIsEditing(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const desiredDatesText =
      formData.desiredDatesText.trim() ||
      [formData.startDate, formData.endDate].filter(Boolean).join(" - ");

    const updatedBooking = {
      ...booking,

      organizationName:
        formData.organizationName.trim() || "Unnamed Organization",

      contactName: formData.contactName.trim(),
      name: formData.contactName.trim(),

      email: formData.email.trim(),
      phone: formData.phone.trim(),

      rentalFormDetails: {
        ...(booking.rentalFormDetails || {}),
        secondaryContactName: formData.secondaryContactName.trim(),
        secondaryContactPhone: formData.secondaryContactPhone.trim(),
        secondaryContactEmail: formData.secondaryContactEmail.trim(),
      },

      startDate: formData.startDate,
      endDate: formData.endDate,
      desiredDatesText,

      attendeeCount: formData.attendeeCount.trim(),
      groupSize: formData.attendeeCount.trim(),

      retreatType: formData.retreatType.trim(),

      // The Housing tab owns lodging once it has been saved (AUDIT-007).
      roomName: housingIsAuthoritative
        ? booking.roomName
        : formData.roomName.trim() || "Unassigned",
      buildingsRooms: housingIsAuthoritative
        ? booking.buildingsRooms
        : formData.buildingsRooms.trim(),

      meals: formData.meals.trim(),
      foodAllergies: formData.foodAllergies.trim(),
      needToKnow: formData.needToKnow.trim(),
      linenSets: formData.linenSets.trim(),
      activities: formData.activities.trim(),

      persons: formData.persons.trim(),
      nights: formData.nights.trim(),
      mealCount: formData.mealCount.trim(),
      camperDays: formData.camperDays.trim(),

      usageFee: formData.usageFee.trim(),
      lodgingCost: formData.lodgingCost.trim(),
      foodCost: formData.foodCost.trim(),
      miscCost: formData.miscCost.trim(),

      notes: formData.notes.trim(),
    };

    /*
      Classification replaces the old status dropdowns; status and waitlist
      change only when staff pick a different classification. Then the
      edited fields are recorded (re-imports keep them) and copied into the
      duplicated detail copies Master records carry (AUDIT-003).
    */
    const classifiedBooking = applyBookingClassification(
      updatedBooking,
      formData.classification
    );
    const trackedBooking = recordStaffEdits(
      booking,
      classifiedBooking,
      BOOKING_EDIT_TRACKED_FIELDS
    );
    const bookingToSave = mirrorTopLevelIntoDetails(trackedBooking);

    setIsSaving(true);

    try {
      await onSaveBooking(bookingToSave);
      setIsEditing(false);
    } catch {
      // The save handler already explained the failure; keep the edits on screen.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="booking-details-edit-card"
      onSubmit={handleSubmit}
      data-tutorial-unsaved={isEditing ? "changes on the Edit tab" : undefined}
    >
      <div className="booking-details-edit-header">
        <div>
          <p className="dashboard-eyebrow">Details</p>
          <h3>Booking Information</h3>
          <span>
            Edit this booking entry and save changes to the dashboard.
          </span>
        </div>

        <div
          className="booking-details-edit-actions"
          data-tutorial-target={isEditing ? "booking-edit-actions booking-edit-ready" : "booking-edit-actions"}
        >
          {isEditing ? (
            <>
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={handleCancel}
              >
                Cancel
              </button>

              <button
                className="primary-dashboard-button"
                type="submit"
                disabled={isSaving}
                data-tutorial-guard
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              className="primary-dashboard-button"
              type="button"
              onClick={() => setIsEditing(true)}
              data-tutorial-target="booking-edit-entry"
            >
              Edit Entry
            </button>
          )}
        </div>
      </div>

      <div className="booking-details-edit-grid">
        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaBuilding />
            <div>
              <h4>Group Information</h4>
              <p>Organization, contact, and basic rental identity.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Rental / Group Name"
              value={formData.organizationName}
              isEditing={isEditing}
              onChange={(value) => updateField("organizationName", value)}
            />

            <BookingEditField
              label="Primary Contact"
              value={formData.contactName}
              isEditing={isEditing}
              onChange={(value) => updateField("contactName", value)}
            />

            <BookingEditField
              label="Email"
              type="email"
              value={formData.email}
              isEditing={isEditing}
              onChange={(value) => updateField("email", value)}
            />

            <BookingEditField
              label="Phone"
              value={formData.phone}
              isEditing={isEditing}
              onChange={(value) => updateField("phone", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaUserPlus />
            <div>
              <h4>Secondary Contact (Optional)</h4>
              <p>All three fields can be left blank.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Secondary Contact Name"
              name="secondaryContactName"
              autoComplete="section-secondary name"
              value={formData.secondaryContactName}
              isEditing={isEditing}
              onChange={(value) => updateField("secondaryContactName", value)}
            />

            <BookingEditField
              label="Secondary Contact Phone"
              name="secondaryContactPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="section-secondary tel"
              pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
              title="Enter a 10-digit phone number"
              value={formData.secondaryContactPhone}
              isEditing={isEditing}
              onChange={(value) => updateField(
                "secondaryContactPhone",
                formatSecondaryContactPhone(value)
              )}
            />

            <BookingEditField
              label="Secondary Contact Email"
              name="secondaryContactEmail"
              type="email"
              autoComplete="section-secondary email"
              value={formData.secondaryContactEmail}
              isEditing={isEditing}
              onChange={(value) => updateField("secondaryContactEmail", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaCalendarAlt />
            <div>
              <h4>Rental Details</h4>
              <p>Dates, guest count, and whether the booking is cancelled or waitlisted. Contract, deposit and other progress is tracked in the guest portal.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Start Date"
              type="date"
              value={formData.startDate}
              isEditing={isEditing}
              onChange={(value) => updateField("startDate", value)}
            />

            <BookingEditField
              label="End Date"
              type="date"
              value={formData.endDate}
              isEditing={isEditing}
              onChange={(value) => updateField("endDate", value)}
            />

            <BookingEditField
              label="Guest Count"
              value={formData.attendeeCount}
              isEditing={isEditing}
              onChange={(value) => updateField("attendeeCount", value)}
            />

            <BookingEditField
              label="Retreat Type"
              value={formData.retreatType}
              isEditing={isEditing}
              onChange={(value) => updateField("retreatType", value)}
            />

            <BookingEditField
              label="Booking"
              value={formData.classification}
              isEditing={isEditing}
              options={getBookingClassificationOptions(booking)}
              readOnlyReason={
                formData.classification === "archive"
                  ? "Archive records cannot be reclassified."
                  : ""
              }
              onChange={(value) => updateField("classification", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaBed />
            <div>
              <h4>Housing & Program</h4>
              <p>Rooms, meals, linen sets, activities, and staff notes.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="Assigned Room / Area"
              value={formData.roomName}
              isEditing={isEditing}
              readOnlyReason={housingReadOnlyReason}
              onChange={(value) => updateField("roomName", value)}
            />

            <BookingEditField
              label="Buildings / Rooms"
              value={formData.buildingsRooms}
              isEditing={isEditing}
              readOnlyReason={housingReadOnlyReason}
              onChange={(value) => updateField("buildingsRooms", value)}
            />

            <BookingEditField
              label="Meals"
              value={formData.meals}
              isEditing={isEditing}
              onChange={(value) => updateField("meals", value)}
            />

            <BookingEditField
              label="# Meals"
              value={formData.mealCount}
              isEditing={isEditing}
              onChange={(value) => updateField("mealCount", value)}
            />

            <BookingEditField
              label="Linen Sets"
              value={formData.linenSets}
              isEditing={isEditing}
              onChange={(value) => updateField("linenSets", value)}
            />

            <BookingEditField
              label="Activities"
              value={formData.activities}
              isEditing={isEditing}
              onChange={(value) => updateField("activities", value)}
            />

            <BookingEditField
              label="Food Allergies"
              value={formData.foodAllergies}
              isEditing={isEditing}
              multiline
              onChange={(value) => updateField("foodAllergies", value)}
            />

            <BookingEditField
              label="Need To Know"
              value={formData.needToKnow}
              isEditing={isEditing}
              multiline
              onChange={(value) => updateField("needToKnow", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section">
          <div className="booking-edit-section-header">
            <FaDollarSign />
            <div>
              <h4>Counts & Billing</h4>
              <p>Optional spreadsheet-style values for reporting.</p>
            </div>
          </div>

          <div className="booking-edit-grid">
            <BookingEditField
              label="# Persons"
              value={formData.persons}
              isEditing={isEditing}
              onChange={(value) => updateField("persons", value)}
            />

            <BookingEditField
              label="# Nights"
              value={formData.nights}
              isEditing={isEditing}
              onChange={(value) => updateField("nights", value)}
            />

            <BookingEditField
              label="Camper Days"
              value={formData.camperDays}
              isEditing={isEditing}
              onChange={(value) => updateField("camperDays", value)}
            />

            <BookingEditField
              label="Usage Fee"
              value={formData.usageFee}
              isEditing={isEditing}
              onChange={(value) => updateField("usageFee", value)}
            />

            <BookingEditField
              label="$ Lodging"
              value={formData.lodgingCost}
              isEditing={isEditing}
              onChange={(value) => updateField("lodgingCost", value)}
            />

            <BookingEditField
              label="$ Food"
              value={formData.foodCost}
              isEditing={isEditing}
              onChange={(value) => updateField("foodCost", value)}
            />

            <BookingEditField
              label="$ Misc."
              value={formData.miscCost}
              isEditing={isEditing}
              onChange={(value) => updateField("miscCost", value)}
            />
          </div>
        </section>

        <section className="booking-details-edit-section booking-details-edit-section-wide">
          <div className="booking-edit-section-header">
            <FaInfoCircle />
            <div>
              <h4>Additional Notes</h4>
              <p>Internal notes for staff follow-up.</p>
            </div>
          </div>

          <BookingEditField
            label="Notes"
            value={formData.notes}
            isEditing={isEditing}
            multiline
            onChange={(value) => updateField("notes", value)}
          />
        </section>
      </div>
    </form>
  );
}
