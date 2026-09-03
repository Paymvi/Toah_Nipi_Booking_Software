import { useEffect, useState } from "react";

import {
  FaArrowLeft,
  FaCalendarAlt,
  FaEdit,
  FaEnvelope,
  FaPhone,
  FaSave,
  FaTimes,
  FaUser,
  FaUsers,
} from "react-icons/fa";


/* =========================================================
   HELPERS
========================================================= */

function getInquiryYear(booking) {
  const sourceText = String(
    booking?.sourceType ||
      booking?.detectedImportType ||
      ""
  );

  const match = sourceText.match(/20\d{2}/);

  return match?.[0] || "";
}


function formatInquiryDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


/*
  Converts the stored timestamp back into YYYY-MM-DD
  so it can be used by <input type="date">.
*/
function getDateInputValue(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  /*
    Normal ISO timestamp:
    2026-06-15T12:00:00.000Z
  */
  const directMatch = text.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  if (directMatch) {
    return directMatch[1];
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();

  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getInquiryDisposition(booking) {
  return (
    booking?.inquiryDisposition ||
    booking?.stageOfGroup ||
    booking?.status ||
    "Inquiry"
  );
}


function getInquiryDispositionClass(
  disposition,
  bookingStatus = ""
) {
  const text = String(disposition || "")
    .trim()
    .toLowerCase();

  if (text.includes("waitlist")) {
    return "waitlist";
  }

  if (text.includes("consider")) {
    return "considering";
  }

  if (
    text === "no" ||
    text.startsWith("no ") ||
    text.includes("did not hear") ||
    text.includes("didn't hear") ||
    text.includes("never heard") ||
    String(bookingStatus)
      .toLowerCase()
      .includes("cancel")
  ) {
    return "closed";
  }

  return "inquiry";
}


/*
  Converts the original spreadsheet wording into the
  normal dashboard status fields.

  We still KEEP the original wording separately in
  inquiryDisposition.
*/
function getStatusFromInquiryDisposition(
  disposition
) {
  const text = String(disposition || "")
    .trim()
    .toLowerCase();

  if (text.includes("waitlist")) {
    return "Waitlist";
  }

  if (
    text === "no" ||
    text.startsWith("no ") ||
    text.includes("did not hear") ||
    text.includes("didn't hear") ||
    text.includes("never heard")
  ) {
    return "Cancelled";
  }

  return "Inquiry";
}


function createInquiryEditState(booking) {
  return {
    organizationName:
      booking.organizationName === "Unnamed Inquiry"
        ? ""
        : booking.organizationName || "",

    inquiryDate:
      getDateInputValue(
        booking.submittedAt
      ),

    contactName:
      booking.contactName === "No contact name"
        ? ""
        : booking.contactName || "",

    email:
      booking.email === "No email provided"
        ? ""
        : booking.email || "",

    phone:
      booking.phone === "No phone provided"
        ? ""
        : booking.phone || "",

    attendeeCount:
      booking.attendeeCount || "",

    inquiryAddress:
      booking.inquiryAddress || "",

    desiredDatesText:
      booking.desiredDatesText || "",

    notes:
      booking.notes || "",

    disposition:
      getInquiryDisposition(booking),
  };
}


/* =========================================================
   READ-ONLY FIELD
========================================================= */

function InquiryValue({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div className="simple-inquiry-field">
      <div className="simple-inquiry-label">
        {Icon && <Icon />}
        <span>{label}</span>
      </div>

      <strong>{value || "—"}</strong>
    </div>
  );
}


/* =========================================================
   EDITABLE FIELD
========================================================= */

function InquiryEditField({
  label,
  name,
  value,
  type = "text",
  onChange,
}) {
  return (
    <label className="simple-inquiry-edit-field">
      <span>{label}</span>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}


/* =========================================================
   PAGE
========================================================= */

export default function InquiryRecordDetailView({
  booking,
  onBack,
  onSaveBooking,
}) {
  const [isEditing, setIsEditing] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [formData, setFormData] =
    useState(() =>
      createInquiryEditState(booking)
    );


  /*
    If Dashboard replaces selectedBooking after
    saving, refresh our local edit form too.
  */
  useEffect(() => {
    setFormData(
      createInquiryEditState(booking)
    );
  }, [booking]);


  if (!booking) {
    return null;
  }


  const inquiryYear =
    getInquiryYear(booking);

  const displayedDisposition =
    isEditing
      ? formData.disposition
      : getInquiryDisposition(booking);

  const dispositionClass =
    getInquiryDispositionClass(
      displayedDisposition,
      booking.status
    );


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


  const handleStartEditing = () => {
    setFormData(
      createInquiryEditState(booking)
    );

    setIsEditing(true);
  };


  const handleCancelEditing = () => {
    setFormData(
      createInquiryEditState(booking)
    );

    setIsEditing(false);
  };


  const handleSave = async () => {
    if (!onSaveBooking) {
      return;
    }

    try {
      setIsSaving(true);

      const cleanDisposition =
        formData.disposition.trim();

      const nextStatus =
        getStatusFromInquiryDisposition(
          cleanDisposition
        );

      /*
        Store the inquiry date at noon UTC.

        This avoids a simple date unexpectedly
        moving backward a day because of timezone
        conversion.
      */
      const submittedAt =
        formData.inquiryDate
          ? `${formData.inquiryDate}T12:00:00.000Z`
          : "";

      const updatedBooking = {
        ...booking,

        organizationName:
          formData.organizationName.trim() ||
          "Unnamed Inquiry",

        contactName:
          formData.contactName.trim() ||
          "No contact name",

        name:
          formData.contactName.trim(),

        email:
          formData.email.trim(),

        phone:
          formData.phone.trim(),

        submittedAt,

        attendeeCount:
          formData.attendeeCount.trim(),

        groupSize:
          formData.attendeeCount.trim(),

        inquiryAddress:
          formData.inquiryAddress.trim(),

        desiredDatesText:
          formData.desiredDatesText.trim(),

        notes:
          formData.notes.trim(),

        message:
          formData.notes.trim(),

        /*
          Keep the exact spreadsheet-style wording.
        */
        inquiryDisposition:
          cleanDisposition,

        stageOfGroup:
          cleanDisposition,

        /*
          Also update the normalized workflow fields.
        */
        status:
          nextStatus,

        waitlist:
          nextStatus === "Waitlist"
            ? "Yes"
            : "No",
      };

      await onSaveBooking(updatedBooking);

      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <section className="simple-inquiry-page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="simple-inquiry-header">

        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onBack}
          disabled={isSaving}
        >
          <FaArrowLeft />
          Back
        </button>


        <div className="simple-inquiry-title">
          <p>
            Guest Group Inquiry
            {inquiryYear
              ? ` · ${inquiryYear}`
              : ""}
          </p>

          <h2>
            {isEditing
              ? formData.organizationName ||
                "Unnamed Inquiry"
              : booking.organizationName ||
                "Unnamed Inquiry"}
          </h2>
        </div>


        <div className="simple-inquiry-header-actions">

          {isEditing ? (
            <>
              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={
                  handleCancelEditing
                }
                disabled={isSaving}
              >
                <FaTimes />
                Cancel
              </button>

              <button
                className="primary-dashboard-button"
                type="button"
                onClick={handleSave}
                disabled={isSaving}
              >
                <FaSave />

                {isSaving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              className="secondary-dashboard-button"
              type="button"
              onClick={
                handleStartEditing
              }
            >
              <FaEdit />
              Edit Entry
            </button>
          )}


          <span
            className={`simple-inquiry-status simple-inquiry-status-${dispositionClass}`}
          >
            {displayedDisposition ||
              "Inquiry"}
          </span>

        </div>

      </header>


      {/* =====================================================
          MAIN CARD
      ===================================================== */}

      <article className="simple-inquiry-card">

        {isEditing ? (

          /* =================================================
             EDIT MODE
          ================================================= */

          <>
            <div className="simple-inquiry-edit-grid">

              <InquiryEditField
                label="Guest Group Name"
                name="organizationName"
                value={
                  formData.organizationName
                }
                onChange={handleChange}
              />


              <InquiryEditField
                label="Inquiry Date"
                name="inquiryDate"
                type="date"
                value={
                  formData.inquiryDate
                }
                onChange={handleChange}
              />


              <InquiryEditField
                label="Disposition"
                name="disposition"
                value={
                  formData.disposition
                }
                onChange={handleChange}
              />


              <InquiryEditField
                label="Contact Name"
                name="contactName"
                value={
                  formData.contactName
                }
                onChange={handleChange}
              />


              <InquiryEditField
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />


              <InquiryEditField
                label="Phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />


              <InquiryEditField
                label="Group Size"
                name="attendeeCount"
                value={
                  formData.attendeeCount
                }
                onChange={handleChange}
              />


              <InquiryEditField
                label="Mailing Address"
                name="inquiryAddress"
                value={
                  formData.inquiryAddress
                }
                onChange={handleChange}
              />

            </div>


            <section className="simple-inquiry-edit-section">

              <label>
                <span>Desired Dates</span>

                <input
                  type="text"
                  name="desiredDatesText"
                  value={
                    formData.desiredDatesText
                  }
                  onChange={handleChange}
                  placeholder="Example: 6/25-6/27/27 or 8/6-8/8/27"
                />
              </label>

            </section>


            <section className="simple-inquiry-edit-section">

              <label>
                <span>Additional Notes</span>

                <textarea
                  name="notes"
                  rows="5"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Add notes about this inquiry..."
                />
              </label>

            </section>


            <div className="simple-inquiry-bottom-actions">

              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={
                  handleCancelEditing
                }
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                className="primary-dashboard-button"
                type="button"
                onClick={handleSave}
                disabled={isSaving}
              >
                <FaSave />

                {isSaving
                  ? "Saving..."
                  : "Save Changes"}
              </button>

            </div>
          </>

        ) : (

          /* =================================================
             NORMAL VIEW MODE
          ================================================= */

          <>
            <div className="simple-inquiry-grid">

              <InquiryValue
                icon={FaCalendarAlt}
                label="Inquiry Date"
                value={formatInquiryDate(
                  booking.submittedAt
                )}
              />


              <InquiryValue
                icon={FaUser}
                label="Contact Name"
                value={
                  booking.contactName
                }
              />


              <InquiryValue
                icon={FaEnvelope}
                label="Email"
                value={booking.email}
              />


              <InquiryValue
                icon={FaPhone}
                label="Phone"
                value={booking.phone}
              />


              <InquiryValue
                icon={FaUsers}
                label="Group Size"
                value={
                  booking.attendeeCount
                }
              />


              <InquiryValue
                label="Mailing Address"
                value={
                  booking.inquiryAddress
                }
              />

            </div>


            <section className="simple-inquiry-section">
              <span>Desired Dates</span>

              <strong className="simple-inquiry-dates">
                {booking.desiredDatesText ||
                  "No desired dates recorded"}
              </strong>
            </section>


            <section className="simple-inquiry-section">
              <span>
                Additional Notes
              </span>

              <p className="simple-inquiry-notes">
                {booking.notes ||
                  "No additional notes recorded."}
              </p>
            </section>
          </>

        )}


        {/* ===================================================
            SOURCE — NEVER EDITED
        =================================================== */}

        <footer className="simple-inquiry-source">
          Imported from{" "}

          <strong>
            {booking.sourceSheet ||
              booking.sourceType ||
              "Guest Group Inquiry spreadsheet"}
          </strong>

          {booking.sourceRowNumber && (
            <>
              {" "}
              · Row{" "}
              {booking.sourceRowNumber}
            </>
          )}
        </footer>

      </article>
    </section>
  );
}