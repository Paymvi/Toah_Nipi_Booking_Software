import { FaChevronDown } from "react-icons/fa";
import {
  hasVisibleOverviewFields,
  formatBookingOverviewValue,
  hasBookingOverviewValue,
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

function BookingOverviewField({
  label,
  value,
  icon: Icon,
  multiline = false,
  tone = "default",
  showEmpty = false,
}) {
  if (
    !showEmpty &&
    !hasBookingOverviewValue(value)
  ) {
    return null;
  }

  return (
    <div
      className={[
        "booking-overview-field",

        multiline
          ? "booking-overview-field-multiline"
          : "",

        tone !== "default"
          ? `booking-overview-field-${tone}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <small>
        {Icon && (
          <Icon className="booking-overview-field-label-icon" />
        )}

        <span>{label}</span>
      </small>

      <strong>
        {formatBookingOverviewValue(value)}
      </strong>
    </div>
  );
}

export function BookingOverviewFieldGrid({
  fields = [],
  columns = 2,
}) {
  const visibleFields = fields.filter(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <div
      className={`booking-overview-field-grid booking-overview-field-grid-${columns}`}
    >
      {visibleFields.map((field) => (
        <BookingOverviewField
          key={field.label}
          {...field}
        />
      ))}
    </div>
  );
}

export function BookingOverviewLargeSection({
  icon: Icon,
  eyebrow,
  title,
  fields = [],
  groups = [],
  columns = 2,
  wide = false,
  className = "",
  children,
}) {
  const hasVisibleFields = fields.some(
    (field) =>
      field.showEmpty ||
      hasBookingOverviewValue(field.value)
  );

  const visibleGroups = groups.filter(
    (group) =>
      (group.fields || []).some(
        (field) =>
          field.showEmpty ||
          hasBookingOverviewValue(field.value)
      )
  );

  if (
    !hasVisibleFields &&
    visibleGroups.length === 0 &&
    !children
  ) {
    return null;
  }

  return (
    <article
      className={[
        "booking-overview-card",

        wide
          ? "booking-overview-card-wide"
          : "",

        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="booking-overview-card-header">
        <span className="booking-overview-card-icon">
          <Icon />
        </span>

        <div>
          {eyebrow && <p>{eyebrow}</p>}
          <h3>{title}</h3>
        </div>
      </header>

      {hasVisibleFields && (
        <BookingOverviewFieldGrid
          fields={fields}
          columns={columns}
        />
      )}

      {visibleGroups.length > 0 && (
        <div className="booking-overview-subsections">
          {visibleGroups.map(
            (group, index) => (
              <section
                className="booking-overview-subsection"
                key={`${title}-${group.title}-${index}`}
              >
                {group.title && (
                  <h4>{group.title}</h4>
                )}

                <BookingOverviewFieldGrid
                  fields={group.fields}
                  columns={
                    group.columns || 2
                  }
                />
              </section>
            )
          )}
        </div>
      )}

      {children}
    </article>
  );
}
