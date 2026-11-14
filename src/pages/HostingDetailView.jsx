import { useState } from "react";
import { FaArrowLeft, FaExchangeAlt, FaPen, FaSave, FaTimes, FaTrashAlt } from "react-icons/fa";

import BookingHousingTab from "../components/BookingHousingTab";
import HostingPortalHistory from "../components/HostingPortalHistory";
import {
  HOSTING_RETREAT_TYPE,
  applyBookingClassification,
  isClearlyCancelled,
  isHostRecord,
} from "../utils/bookingClassification";
import { mirrorTopLevelIntoDetails, recordStaffEdits } from "../utils/bookingFields";
import { getLegacyBookingNotes } from "../utils/legacyBookingNotes";
import { getBookingLodgingDisplayText } from "../utils/lodgingUtils";
import { formatDateRange } from "../utils/dateUtils";

/*
  Hosting detail: the fields hosting actually uses, the shared Housing
  editor (with clash checks against bookings and other hosting), and
  everything else the record holds, read-only, under Additional details.
  No portal, signing, invoice or reminder controls.
*/

const FIELDS = [
  { key: "organizationName", label: "Name", required: true },
  { key: "startDate", label: "Start date", type: "date" },
  { key: "endDate", label: "End date", type: "date" },
  { key: "contactName", label: "Contact name" },
  { key: "email", label: "Contact email", type: "email" },
  { key: "phone", label: "Contact phone", type: "tel" },
  { key: "attendeeCount", label: "Guests" },
  { key: "meals", label: "Meals for the kitchen", multiline: true },
  { key: "notes", label: "Notes", multiline: true },
];
const FIELD_KEYS = FIELDS.map((field) => field.key);

// Shown elsewhere on this page or internal bookkeeping.
const HIDDEN_KEYS = new Set([
  ...FIELD_KEYS,
  "id", "portalToken", "rentalFormDetails", "rawSpreadsheetData", "checklists",
  "programLogisticsAssignments", "buildingsRooms", "roomName", "updatedAt",
]);

function newHostingRecord() {
  return {
    id: window.crypto?.randomUUID?.() || String(Date.now()),
    sourceType: "Staff Booking",
    status: "Confirmed",
    waitlist: "No",
    retreatType: HOSTING_RETREAT_TYPE,
    organizationName: "",
    rentalFormDetails: {},
  };
}

// Off unless the office ticks it: hosting stays out of the staff app and kitchen counts by default.
function isKitchenPlanned(record) {
  return record?.rentalFormDetails?.kitchenInternalMeals === true;
}

function toText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

export default function HostingDetailView({
  record,
  occupancyRecords = [],
  onSave,
  onDelete,
  onConvertToBooking,
  onOpenRecord,
  onBack,
}) {
  const isNew = !record;
  const base = record || newHostingRecord();
  const [isEditing, setIsEditing] = useState(isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(FIELD_KEYS.map((key) => [key, toText(base[key])])),
    cancelled: isClearlyCancelled(base),
    kitchen: isKitchenPlanned(base),
  }));

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (!form.organizationName.trim()) return alert("Enter a name.");
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      return alert("The end date must be the same as or later than the start date.");
    }

    let next = { ...base };
    FIELD_KEYS.forEach((key) => {
      next[key] = form[key].trim();
    });
    // Renaming never turns hosting into a booking; Convert does that.
    if (!isHostRecord(next)) next.retreatType = HOSTING_RETREAT_TYPE;
    // Status changes only when the box changes, so legacy status text is kept.
    if (form.cancelled !== isClearlyCancelled(base)) {
      next = applyBookingClassification(next, form.cancelled ? "cancelled" : "booked");
    }
    if (form.kitchen !== isKitchenPlanned(base)) {
      const details = { ...(next.rentalFormDetails || {}) };
      if (form.kitchen) details.kitchenInternalMeals = true;
      else delete details.kitchenInternalMeals;
      next = { ...next, rentalFormDetails: details };
    }
    next = mirrorTopLevelIntoDetails(next, [...FIELD_KEYS, "retreatType"]);
    if (!isNew) next = recordStaffEdits(base, next, FIELD_KEYS);

    setIsSaving(true);
    try {
      await onSave(next);
      setIsEditing(false);
    } catch {
      // onSave explained the failure; the edits stay on screen.
    } finally {
      setIsSaving(false);
    }
  };

  const legacy = isNew ? null : getLegacyBookingNotes(base);
  const legacyNotes = legacy ? [...legacy.meals, ...legacy.activities, ...legacy.additional] : [];
  const otherFields = Object.entries(base)
    .filter(([key, value]) => !HIDDEN_KEYS.has(key) && toText(value))
    .sort(([a], [b]) => a.localeCompare(b));
  const rawRow = base.rawSpreadsheetData && typeof base.rawSpreadsheetData === "object"
    ? Object.entries(base.rawSpreadsheetData).filter(([, value]) => toText(value))
    : [];
  const conversions = Array.isArray(base.rentalFormDetails?.hostingConversions)
    ? base.rentalFormDetails.hostingConversions
    : [];

  return (
    <section className="hosting-detail-page">
      <header className="dashboard-card hosting-detail-header">
        <button className="secondary-dashboard-button" type="button" onClick={onBack}>
          <FaArrowLeft aria-hidden="true" />
          Back
        </button>
        <div className="hosting-detail-title">
          <p className="dashboard-eyebrow">Hosting</p>
          <h2>{isNew ? "New hosting entry" : base.organizationName}</h2>
          {!isNew && (
            <p className="hosting-subtitle">
              {base.startDate ? formatDateRange(base.startDate, base.endDate) : "No dates set"}
              {isClearlyCancelled(base) && " · Cancelled"}
            </p>
          )}
        </div>
        {!isNew && (
          <div className="hosting-header-actions">
            {!isEditing && (
              <button className="primary-dashboard-button" type="button" onClick={() => setIsEditing(true)}>
                <FaPen aria-hidden="true" />
                Edit
              </button>
            )}
            <button className="secondary-dashboard-button" type="button" onClick={() => onConvertToBooking(base)}>
              <FaExchangeAlt aria-hidden="true" />
              Convert to booking
            </button>
            {onDelete && (
              <button className="booking-profile-delete-button" type="button" onClick={() => onDelete(base)}>
                <FaTrashAlt aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        )}
      </header>

      <form className="dashboard-card hosting-detail-card" onSubmit={save} data-tutorial-unsaved={isEditing ? "Hosting edits" : undefined}>
        <dl className="hosting-fields">
          {FIELDS.map((field) => (
            <div key={field.key} className={field.multiline ? "hosting-field-wide" : ""}>
              <dt>
                <label htmlFor={`hosting-${field.key}`}>{field.label}</label>
              </dt>
              <dd>
                {!isEditing ? (
                  <span className="hosting-value">{toText(base[field.key]) || "—"}</span>
                ) : field.multiline ? (
                  <textarea id={`hosting-${field.key}`} rows={4} value={form[field.key]} onChange={(event) => update(field.key, event.target.value)} />
                ) : (
                  <input
                    id={`hosting-${field.key}`}
                    type={field.type || "text"}
                    required={field.required}
                    value={form[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                )}
              </dd>
            </div>
          ))}
          <div>
            <dt>Status</dt>
            <dd>
              {isEditing ? (
                <label className="hosting-check">
                  <input type="checkbox" checked={form.cancelled} onChange={(event) => update("cancelled", event.target.checked)} />
                  Cancelled
                </label>
              ) : (
                <span className="hosting-value">{isClearlyCancelled(base) ? "Cancelled" : "Active"}</span>
              )}
            </dd>
          </div>
          <div className="hosting-field-wide">
            <dt>Staff app</dt>
            <dd>
              {isEditing ? (
                <label className="hosting-check">
                  <input type="checkbox" checked={form.kitchen} onChange={(event) => update("kitchen", event.target.checked)} />
                  Kitchen should plan for this (shows as Internal in the staff app and kitchen view)
                </label>
              ) : (
                <span className="hosting-value">
                  {isKitchenPlanned(base) ? "Shown to staff and the kitchen as Internal" : "Not shown in the staff app"}
                </span>
              )}
            </dd>
          </div>
          {!isNew && !isEditing && (
            <div>
              <dt>Lodging</dt>
              <dd><span className="hosting-value">{getBookingLodgingDisplayText(base)}</span></dd>
            </div>
          )}
        </dl>

        {isEditing && (
          <div className="hosting-form-actions">
            {!isNew && (
              <button className="secondary-dashboard-button" type="button" disabled={isSaving} onClick={() => setIsEditing(false)}>
                <FaTimes aria-hidden="true" />
                Cancel
              </button>
            )}
            <button className="primary-dashboard-button" type="submit" disabled={isSaving}>
              <FaSave aria-hidden="true" />
              {isSaving ? "Saving…" : isNew ? "Create hosting entry" : "Save"}
            </button>
          </div>
        )}
      </form>

      {isNew ? (
        <p className="hosting-muted">Lodging can be assigned after the entry is created.</p>
      ) : (
        <BookingHousingTab
          booking={base}
          onSaveBooking={onSave}
          occupancyRecords={occupancyRecords}
          onOpenRecord={onOpenRecord}
        />
      )}

      {!isNew && (
        <details className="dashboard-card hosting-more">
          <summary>Additional details</summary>

          {legacyNotes.map((note) => (
            <div key={note.label} className="hosting-note">
              <h4>{note.label}</h4>
              <p>{note.text}</p>
            </div>
          ))}

          {otherFields.length > 0 && (
            <>
              <h4>Other saved fields</h4>
              <dl className="hosting-other-fields">
                {otherFields.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{toText(value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {rawRow.length > 0 && (
            <details>
              <summary>Original spreadsheet row</summary>
              <dl className="hosting-other-fields">
                {rawRow.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{toText(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {conversions.length > 0 && (
            <>
              <h4>Conversion history</h4>
              <ul>
                {conversions.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    {String(entry.at).slice(0, 10)}: converted to {entry.to === "hosting" ? "Hosting" : "a guest booking"}
                    {entry.previousRetreatType ? ` (retreat type was "${entry.previousRetreatType}")` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4>Guest portal history</h4>
          <HostingPortalHistory recordId={base.id} />
        </details>
      )}
    </section>
  );
}
