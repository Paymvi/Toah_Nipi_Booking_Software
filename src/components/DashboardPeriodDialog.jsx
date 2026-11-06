import { useEffect, useRef, useState } from "react";
import {
  DASHBOARD_PERIOD_UNITS,
  getDashboardPeriodError,
} from "../utils/dashboardPeriod";

// Native <dialog>: showModal() keeps focus inside, closes on Escape and returns focus to the gear.
export default function DashboardPeriodDialog({ period, start, onSave, onClose }) {
  const dialogRef = useRef(null);
  const amountRef = useRef(null);
  const [amount, setAmount] = useState(String(period.amount));
  const [unit, setUnit] = useState(period.unit);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    dialogRef.current.showModal();
    amountRef.current.select();
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();

    const error = getDashboardPeriodError(amount, unit, start);

    if (error) {
      setErrorMessage(error);
      amountRef.current.focus();
      return;
    }

    onSave({ amount: Number(amount), unit });
    dialogRef.current.close();
  };

  return (
    <dialog
      className="home-dashboard-period-dialog"
      ref={dialogRef}
      aria-labelledby="dashboard-period-title"
      onClose={onClose}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current.close();
        }
      }}
    >
      <form onSubmit={handleSubmit} noValidate>
        <h3 id="dashboard-period-title">Summary period</h3>
        <p>How far ahead this card looks, starting today.</p>

        <div className="home-dashboard-period-fields">
          <label>
            <span>Length</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={
                errorMessage ? "dashboard-period-error" : undefined
              }
              onChange={(event) => {
                setAmount(event.target.value);
                setErrorMessage("");
              }}
            />
          </label>

          <label>
            <span>Unit</span>
            <select
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value);
                setErrorMessage("");
              }}
            >
              {DASHBOARD_PERIOD_UNITS.map((option) => (
                <option value={option} key={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {errorMessage && (
          <p
            className="home-dashboard-period-error"
            id="dashboard-period-error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <div className="dev-mode-dialog-footer">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={() => dialogRef.current.close()}
          >
            Cancel
          </button>

          <button className="primary-dashboard-button" type="submit">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
