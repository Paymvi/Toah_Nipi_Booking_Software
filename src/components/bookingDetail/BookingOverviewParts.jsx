import { FaChevronDown } from "react-icons/fa";
import {
  hasVisibleOverviewFields,
  formatBookingOverviewValue,
} from "./bookingOverviewValues";

export function BookingOverviewScheduleTable({ columns, rows }) {
  return (
    <table className="booking-compact-sheet booking-compact-schedule">
      <thead>
        <tr>
          {columns.map((column) => (
            <th scope="col" key={column}>{column}</th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td data-label={columns[cellIndex]} key={columns[cellIndex]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BookingOverviewFields({ fields = [] }) {
  if (!hasVisibleOverviewFields(fields)) {
    return null;
  }

  return (
    <dl className="booking-compact-fields">
      {fields
        .filter((field) => hasVisibleOverviewFields([field]))
        .map((field) => (
          <div
            className={
              field.multiline
                ? "booking-compact-field booking-compact-field-multiline"
                : "booking-compact-field"
            }
            key={field.label}
          >
            <dt>{field.label}</dt>
            <dd>{formatBookingOverviewValue(field.value)}</dd>
          </div>
        ))}
    </dl>
  );
}

export function BookingOverviewFieldGroup({ title, fields, className = "" }) {
  if (!hasVisibleOverviewFields(fields)) {
    return null;
  }

  return (
    <div className={`booking-compact-group ${className}`.trim()}>
      <h4>{title}</h4>
      <BookingOverviewFields fields={fields} />
    </div>
  );
}

export function BookingOverviewSection({
  icon: Icon,
  title,
  actions,
  className = "",
  children,
}) {
  return (
    <section className={`booking-compact-section ${className}`.trim()}>
      <header className="booking-compact-section-header">
        <Icon aria-hidden="true" />
        <h3>{title}</h3>
        {actions}
      </header>

      {children}
    </section>
  );
}

export function BookingOverviewEmptyRow({
  icon: Icon,
  title,
  label = "None added",
  explanation,
  action,
  children,
}) {
  return (
    <details className="booking-compact-empty">
      <summary>
        {Icon && <Icon aria-hidden="true" />}
        <strong>{title}</strong>
        <span>{label}</span>
        <FaChevronDown className="booking-compact-empty-chevron" aria-hidden="true" />
      </summary>

      <div className="booking-compact-empty-body">
        <p>{explanation}</p>
        {action}
        {children}
      </div>
    </details>
  );
}

export function BookingOverviewEditButton({ setActiveTab }) {
  return (
    <button
      className="secondary-dashboard-button booking-compact-action"
      type="button"
      onClick={() => setActiveTab("Details")}
    >
      Open Edit Tab
    </button>
  );
}

