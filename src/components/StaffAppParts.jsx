/*
  Small pieces shared by the staff app screens (src/pages/StaffApp.jsx and
  src/pages/StaffKitchen.jsx).
*/
import { FaSignInAlt } from "react-icons/fa";

import { signOut } from "../services/staffAppService";
import { COUNT_STATUS_LABELS, getDietaryAlerts } from "../utils/mealPlan";
import { describeActor, describeChange, formatWhen } from "../utils/staffAppFormat";

export function CountStatus({ count, compact = false }) {
  const label = COUNT_STATUS_LABELS[count.status];
  const number = count.value === null ? "—" : `${count.status === "estimate" ? "~" : ""}${count.value}`;
  return (
    <span className={`sa-count sa-count-${count.status}${compact ? " sa-count-compact" : ""}`}>
      <strong>{number}</strong>
      <span className={`sa-chip sa-chip-${count.status}`}>{label}</span>
    </span>
  );
}

export function Chip({ tone = "neutral", children }) {
  return <span className={`sa-chip sa-chip-${tone}`}>{children}</span>;
}

export function DietaryChips({ booking }) {
  const alerts = getDietaryAlerts(booking.foodAllergies);
  if (!alerts.hasAny) return null;
  return (
    <ul className="sa-diet-chips" aria-label="Dietary needs">
      {alerts.items.map((item) => (
        <li key={item.index} className={item.isAllergy ? "sa-diet-chip sa-diet-chip-allergy" : "sa-diet-chip"}>
          {item.quantityKnown ? `${item.quantity} ` : ""}
          {item.label}
          {!item.quantityKnown && <span className="sa-muted"> (count not given)</span>}
        </li>
      ))}
      {alerts.additionalNotes && <li className="sa-diet-chip sa-diet-chip-note">Note: {alerts.additionalNotes}</li>}
    </ul>
  );
}

export function ChangeList({ changes, todayKey, emptyText = "No changes recorded in this period." }) {
  if (!changes.length) return <p className="sa-muted">{emptyText}</p>;
  return (
    <ul className="sa-change-list">
      {changes.map((change, index) => {
        const description = describeChange(change);
        return (
          <li key={`${change.field}-${change.at}-${index}`}>
            <strong>{description.label}</strong> {description.text}
            <span className="sa-muted"> · {formatWhen(change.at, todayKey)} · by {describeActor(change)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function LoadProblem({ state }) {
  const { error, refresh, isLoading } = state;
  if (!error) return null;
  return (
    <section className="sa-card sa-problem" role="alert">
      <strong>{error.message}</strong>
      {error.kind === "session" ? (
        <button type="button" className="sa-button" onClick={signOut}>
          <FaSignInAlt aria-hidden="true" /> Sign in again
        </button>
      ) : error.kind === "access" || error.kind === "setup" ? null : (
        <button type="button" className="sa-button" onClick={refresh} disabled={isLoading}>
          Try again
        </button>
      )}
    </section>
  );
}
