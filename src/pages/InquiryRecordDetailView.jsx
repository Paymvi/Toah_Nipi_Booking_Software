import {
  FaArrowLeft,
  FaCalendarAlt,
  FaEnvelope,
  FaPhone,
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


function getInquiryDispositionClass(booking) {
  const disposition = String(
    booking?.inquiryDisposition ||
    booking?.stageOfGroup ||
    booking?.status ||
    ""
  )
    .trim()
    .toLowerCase();

  if (disposition.includes("waitlist")) {
    return "waitlist";
  }

  if (disposition.includes("consider")) {
    return "considering";
  }

  if (
    disposition === "no" ||
    disposition.includes("did not hear") ||
    disposition.includes("didn't hear") ||
    disposition.includes("never heard") ||
    String(booking?.status || "")
      .toLowerCase()
      .includes("cancel")
  ) {
    return "closed";
  }

  return "inquiry";
}


function InquiryValue({
  label,
  value,
  icon: Icon,
  wide = false,
}) {
  return (
    <div
      className={`simple-inquiry-field ${
        wide ? "simple-inquiry-field-wide" : ""
      }`}
    >
      <div className="simple-inquiry-label">
        {Icon && <Icon />}
        <span>{label}</span>
      </div>

      <strong>{value || "—"}</strong>
    </div>
  );
}


/* =========================================================
   PAGE
========================================================= */

export default function InquiryRecordDetailView({
  booking,
  onBack,
}) {
  if (!booking) {
    return null;
  }

  const inquiryYear = getInquiryYear(booking);

  const disposition =
    booking.inquiryDisposition ||
    booking.stageOfGroup ||
    booking.status ||
    "Inquiry";

  const dispositionClass =
    getInquiryDispositionClass(booking);

  return (
    <section className="simple-inquiry-page">

      {/* HEADER */}

      <header className="simple-inquiry-header">
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onBack}
        >
          <FaArrowLeft />
          Back
        </button>

        <div className="simple-inquiry-title">
          <p>
            Guest Group Inquiry
            {inquiryYear ? ` · ${inquiryYear}` : ""}
          </p>

          <h2>
            {booking.organizationName ||
              "Unnamed Inquiry"}
          </h2>
        </div>

        <span
          className={`simple-inquiry-status simple-inquiry-status-${dispositionClass}`}
        >
          {disposition}
        </span>
      </header>


      {/* MAIN RECORD */}

      <article className="simple-inquiry-card">

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
            value={booking.contactName}
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
            value={booking.attendeeCount}
          />

          <InquiryValue
            label="Mailing Address"
            value={booking.inquiryAddress}
          />

        </div>


        {/* DESIRED DATES */}

        <section className="simple-inquiry-section">
          <span>Desired Dates</span>

          <strong className="simple-inquiry-dates">
            {booking.desiredDatesText ||
              "No desired dates recorded"}
          </strong>
        </section>


        {/* NOTES */}

        <section className="simple-inquiry-section">
          <span>Additional Notes</span>

          <p className="simple-inquiry-notes">
            {booking.notes ||
              "No additional notes recorded."}
          </p>
        </section>


        {/* SMALL SOURCE FOOTER */}

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
              · Row {booking.sourceRowNumber}
            </>
          )}
        </footer>

      </article>
    </section>
  );
}