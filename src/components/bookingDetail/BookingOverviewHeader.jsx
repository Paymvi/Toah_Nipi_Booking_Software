import { FaCalendarAlt, FaClipboardList, FaUser, FaExternalLinkAlt } from "react-icons/fa";
import CopyButton from "../CopyButton";
import {
  buildPortalUrl,
  getPortalBaseUrl,
  PORTAL_BASE_URL_MISSING_MESSAGE,
} from "../../utils/portalRules";
import { formatMealTime as formatBookingOverviewTime } from "../../utils/mealPlan";
import { getSecondaryContact } from "../../utils/secondaryContact";
import {
  getBookingOverviewNights,
  getBookingOverviewMailingAddress,
  getBookingOverviewSourceType,
  hasBookingOverviewValue,
  formatBookingOverviewValue,
} from "./bookingOverviewValues";
import { formatBookingDetailDateRange } from "./bookingDetailSettings";

export function BookingOverviewSummary({ booking, dateSettings }) {
  const details =
    booking.rentalFormDetails || {};

  const secondaryContact = getSecondaryContact(booking);

  const numberOfNights =
    getBookingOverviewNights(booking, details);

  const mailingAddress =
    getBookingOverviewMailingAddress(booking, details);

  const stayTimes = [
    details.arrivalTime &&
      `Arrival ${formatBookingOverviewTime(details.arrivalTime)}`,
    details.departureTime &&
      `Departure ${formatBookingOverviewTime(details.departureTime)}`,
  ].filter(Boolean);

  const sourceText = [
    ...new Set([
      getBookingOverviewSourceType(booking),
      booking.sourceSheet,
    ]),
    booking.sourceRowNumber && `Row ${booking.sourceRowNumber}`,
  ].filter(Boolean);

  return (
    <div
      className="booking-compact-summary"
      data-tutorial-target="booking-overview-summary"
    >
      <div className="booking-compact-summary-item">
        <small>
          <FaCalendarAlt aria-hidden="true" />
          Stay
        </small>

        <strong>
          {formatBookingDetailDateRange(
            booking.startDate,
            booking.endDate,
            dateSettings
          )}

          {hasBookingOverviewValue(numberOfNights) &&
            ` · ${numberOfNights}\u00A0${String(numberOfNights) === "1" ? "night" : "nights"}`}
        </strong>

        {stayTimes.length > 0 && <span>{stayTimes.join(" · ")}</span>}
      </div>

      <div className="booking-compact-summary-item">
        <small>
          <FaClipboardList aria-hidden="true" />
          Type
        </small>

        <strong>{booking.retreatType || "Retreat Booking"}</strong>
        <span>{sourceText.join(" · ")}</span>
      </div>

      <div className="booking-compact-summary-item booking-compact-summary-contact">
        <small>
          <FaUser aria-hidden="true" />
          Primary Contact
        </small>

        <strong>{formatBookingOverviewValue(booking.contactName)}</strong>

        {(hasBookingOverviewValue(booking.email) ||
          hasBookingOverviewValue(booking.phone)) && (
          <span>
            {hasBookingOverviewValue(booking.email) && (
              <>
                <a href={`mailto:${booking.email}`}>{booking.email}</a>
                <CopyButton value={booking.email} label="email address" />
              </>
            )}

            {hasBookingOverviewValue(booking.email) &&
              hasBookingOverviewValue(booking.phone) &&
              " · "}

            {hasBookingOverviewValue(booking.phone) && (
              <>
                {booking.phone}
                <CopyButton value={booking.phone} label="phone number" />
              </>
            )}
          </span>
        )}

        {hasBookingOverviewValue(mailingAddress) && (
          <span>{mailingAddress}</span>
        )}
      </div>

      {Object.values(secondaryContact).some(Boolean) && (
        <div className="booking-compact-summary-item booking-compact-summary-contact">
          <small>
            <FaUser aria-hidden="true" />
            Secondary Contact
          </small>

          {secondaryContact.secondaryContactName && (
            <strong>{secondaryContact.secondaryContactName}</strong>
          )}

          {(secondaryContact.secondaryContactEmail ||
            secondaryContact.secondaryContactPhone) && (
            <span>
              {secondaryContact.secondaryContactEmail && (
                <>
                  <a href={`mailto:${secondaryContact.secondaryContactEmail}`}>
                    {secondaryContact.secondaryContactEmail}
                  </a>
                  <CopyButton value={secondaryContact.secondaryContactEmail} label="secondary contact email address" />
                </>
              )}

              {secondaryContact.secondaryContactEmail &&
                secondaryContact.secondaryContactPhone &&
                " · "}

              {secondaryContact.secondaryContactPhone && (
                <>
                  <a href={`tel:${secondaryContact.secondaryContactPhone.replace(/[^\d+]/g, "")}`}>
                    {secondaryContact.secondaryContactPhone}
                  </a>
                  <CopyButton value={secondaryContact.secondaryContactPhone} label="secondary contact phone number" />
                </>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function BookingOverviewPortalLink({ booking, onCreatePortalLink }) {
  const portalUrl = buildPortalUrl(booking.portalToken);

  // No link (for example after converting from Hosting): staff create one on purpose.
  if (!booking.portalToken && getPortalBaseUrl() && onCreatePortalLink) {
    return (
      <button
        className="secondary-dashboard-button booking-overview-portal-link"
        type="button"
        onClick={() => onCreatePortalLink(booking)}
      >
        <FaExternalLinkAlt aria-hidden="true" />
        Create Guest Portal Link
      </button>
    );
  }

  if (!portalUrl) {
    return (
      <span
        className="booking-overview-portal-link booking-overview-portal-unavailable"
        title={
          getPortalBaseUrl()
            ? "This booking has no portal token yet."
            : PORTAL_BASE_URL_MISSING_MESSAGE
        }
      >
        Guest Portal Unavailable
      </span>
    );
  }

  return (
    <a
      className="secondary-dashboard-button booking-overview-portal-link"
      href={portalUrl}
      target="_blank"
      rel="noreferrer"
    >
      <FaExternalLinkAlt aria-hidden="true" />
      Open Guest Portal
    </a>
  );
}
