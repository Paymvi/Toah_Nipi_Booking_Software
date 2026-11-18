import { useState } from "react";
import { FaTrashAlt, FaArrowLeft, FaCog, FaConciergeBell, FaPen } from "react-icons/fa";
import { getBookingDisplayState, isStaffBookingRecord } from "../../utils/bookingClassification";
import BookingHousingTab from "../BookingHousingTab";
import BookingStaffAssignmentsTab from "../BookingStaffAssignmentsTab";
import CreateBooking from "../../pages/CreateBooking";
import { bookingDetailTabs } from "../../constants/dashboardConstants";
import BookingChecklists from "../BookingChecklists";
import {
  getSavedBookingDetailDateSettings,
  getSavedBookingOverviewDensity,
  saveBookingOverviewDensity,
  saveBookingDetailDateSettings,
} from "./bookingDetailSettings";
import { getBookingOverviewStatusClass } from "./bookingOverviewValues";
import {
  BookingOverviewPortalLink,
  BookingOverviewSummary,
  BookingOverviewDensityControl,
} from "./BookingOverviewHeader";
import BookingDateSettingsModal from "./BookingDateSettingsModal";
import BookingOverview from "./BookingOverview";
import BookingDetailsEditForm from "./BookingDetailsEditForm";

export default function BookingDetailView({
  booking,
  activeTab,
  setActiveTab,
  onBack,
    onSaveBooking,
  onDeleteBooking,
  staffUsers,
  currentStaffUserId,
  canDeleteBookings = true,
  occupancyRecords = [],
  onOpenRecord,
  onConvertToHosting,
  onCreatePortalLink,
}) {
  const [isDateSettingsOpen, setIsDateSettingsOpen] = useState(false);
  const [dateSettings, setDateSettings] = useState(() =>
    getSavedBookingDetailDateSettings()
  );
  const [overviewDensity, setOverviewDensity] = useState(
    getSavedBookingOverviewDensity
  );

  const updateOverviewDensity = (density) => {
    setOverviewDensity(density);
    saveBookingOverviewDensity(density);
  };

  const updateDateSettings = (nextSettings) => {
    const updatedSettings = {
      ...dateSettings,
      ...nextSettings,
    };

    setDateSettings(updatedSettings);
    saveBookingDetailDateSettings(updatedSettings);
  };

  if (!booking) {
    return (
      <section className="dashboard-card booking-detail-empty">
        <strong>No booking selected</strong>
        <p>Select a booking from the dashboard or calendar to view details.</p>

        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onBack}
        >
          Back to Dashboard
        </button>
      </section>
    );
  }

    const statusClass =
    getBookingOverviewStatusClass(
      getBookingDisplayState(booking).label
    );

  const isOverviewTab = activeTab === "Overview";
  const isLargeOverview = overviewDensity === "large";
  const isCompactOverview = isOverviewTab && !isLargeOverview;

  return (
    <section
      className={[
        "booking-detail-page booking-profile-page",
        isOverviewTab
          ? `booking-profile-page-overview${isCompactOverview ? " booking-compact-page" : ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
            data-tutorial-target="booking-profile"
    >
      <header className="booking-profile-header">
        <button
          className="secondary-dashboard-button booking-profile-back-button"
          type="button"
          onClick={onBack}
          data-tutorial-target="booking-back"
        >
          <FaArrowLeft />
          Back
        </button>

        <div className="booking-profile-header-title">
          {!isCompactOverview && <p>Booking Profile</p>}
          <h2>{booking.organizationName}</h2>
        </div>

        <div className="booking-profile-header-actions">
                    {/* The database lets only admins delete bookings (AUDIT-023). */}
          {canDeleteBookings && (
          <button
            className="booking-profile-delete-button"
            type="button"
            onClick={() => onDeleteBooking(booking)}
          >
            <FaTrashAlt />
            Delete
          </button>
          )}

          <button
            className="secondary-dashboard-button booking-date-settings-button"
            type="button"
            onClick={() => setIsDateSettingsOpen(true)}
          >
            <FaCog />
            Date Display
          </button>

          {onConvertToHosting && (
            <button
              className="secondary-dashboard-button"
              type="button"
              title="Internal use of the property, not a guest booking"
              onClick={() => onConvertToHosting(booking)}
            >
              <FaConciergeBell aria-hidden="true" />
              Convert to Hosting
            </button>
          )}

          {isCompactOverview && (
            <BookingOverviewPortalLink booking={booking} onCreatePortalLink={onCreatePortalLink} />
          )}

          {isCompactOverview && (
            <button
              className="primary-dashboard-button booking-compact-edit-button"
              type="button"
              onClick={() => setActiveTab("Details")}
              data-tutorial-target="booking-overview-edit"
            >
              <FaPen aria-hidden="true" />
              Edit Booking
            </button>
          )}

          <span className={`booking-profile-status ${statusClass}`}>
            {getBookingDisplayState(booking).label}
          </span>
        </div>

      {isDateSettingsOpen && (
        <BookingDateSettingsModal
          settings={dateSettings}
          updateSettings={updateDateSettings}
          onClose={() => setIsDateSettingsOpen(false)}
        />
      )}

      {isCompactOverview && (
        <BookingOverviewSummary
          booking={booking}
          dateSettings={dateSettings}
        />
      )}
      </header>

      <nav
        className="booking-detail-tabs booking-profile-tabs"
        aria-label="Booking detail tabs"
        data-tutorial-target="booking-tabs"
      >
        {bookingDetailTabs.map((tab) => (
          <button
            className={activeTab === tab ? "active" : ""}
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-tutorial-target={{ Details: "booking-tab-edit", Housing: "booking-tab-housing" }[tab]}
          >
            {tab === "Details" ? "Edit" : tab}
          </button>
        ))}
      </nav>

      {isOverviewTab && (
        <BookingOverviewDensityControl
          density={overviewDensity}
          onChange={updateOverviewDensity}
        />
      )}

      {activeTab === "Overview" && (
        <BookingOverview
          booking={booking}
          dateSettings={dateSettings}
          setActiveTab={setActiveTab}
          onSaveBooking={onSaveBooking}
          onCreatePortalLink={onCreatePortalLink}
          isLarge={isLargeOverview}
        />
      )}

{activeTab === "Details" && (
  <div
    className="booking-details-tab-stack"
    data-tutorial-target={
      // The full form is editable straight away; the other editor needs Edit Entry.
      isStaffBookingRecord(booking)
        ? "booking-edit-panel booking-edit-ready"
        : "booking-edit-panel"
    }
  >

    {isStaffBookingRecord(booking) ? (
            <CreateBooking
        key={`edit-booking-${booking.id}`}
        existingBooking={booking}
        onBookingUpdated={onSaveBooking}
        staffUsers={staffUsers}
        occupancyRecords={occupancyRecords}
        embedded
      />
    ) : (
      <BookingDetailsEditForm
        booking={booking}
        onSaveBooking={onSaveBooking}
      />
    )}

  </div>
)}

{activeTab === "Housing" && (
  <BookingHousingTab
    booking={booking}
    onSaveBooking={onSaveBooking}
    occupancyRecords={occupancyRecords}
    onOpenRecord={onOpenRecord}
  />
)}

{activeTab === "Staff Assignments" && (
  <BookingStaffAssignmentsTab
    key={booking.id}
    booking={booking}
    onSaveBooking={onSaveBooking}
    staffUsers={staffUsers}
  />
)}

{activeTab === "Checklists" && (
  <BookingChecklists
    booking={booking}
    onSaveBooking={onSaveBooking}
    staffUsers={staffUsers}
    currentStaffUserId={currentStaffUserId}
  />
)}

{activeTab !== "Overview" &&
  activeTab !== "Details" &&
  activeTab !== "Housing" &&
  activeTab !== "Staff Assignments" &&
  activeTab !== "Checklists" && (
    <section className="dashboard-card booking-tab-placeholder">
      <h3>{activeTab}</h3>
      <p>
        This tab is ready to build next. The selected booking is{" "}
        <strong>{booking.organizationName}</strong>.
      </p>
    </section>
  )}
    </section>
  );
}
