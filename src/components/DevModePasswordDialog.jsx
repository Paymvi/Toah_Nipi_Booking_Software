/*
DevModePasswordDialog.jsx
-------------------------------------------------------------------------------
Small password prompt shown before Dev Mode can be turned on.

The password is checked server-side by the verify-dev-mode Edge Function.
The typed password is cleared from state after every attempt and on close.
-------------------------------------------------------------------------------
*/

import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { verifyDevModePassword } from "../services/devModeService";

export default function DevModePasswordDialog({ onCancel, onUnlock }) {
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // Escape closes the dialog
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isVerifying) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isVerifying, onCancel]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!password || isVerifying) {
      return;
    }

    setIsVerifying(true);
    setErrorMessage("");

    let isValid = false;
    let message = "";

    try {
      isValid = await verifyDevModePassword(password);

      if (!isValid) {
        message = "Incorrect password.";
      }
    } catch (error) {
      console.error("Dev Mode password check failed:", error);
      message = "Unable to verify the password. Please try again.";
    }

    setPassword("");
    setIsVerifying(false);

    if (isValid) {
      onUnlock();
    } else {
      setErrorMessage(message);
    }
  };

  return (
    <div
      className="dev-mode-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isVerifying) {
          onCancel();
        }
      }}
    >
      <form
        className="dev-mode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-mode-dialog-title"
        onSubmit={handleSubmit}
      >
        <div className="dev-mode-dialog-header">
          <div>
            <h3 id="dev-mode-dialog-title">Enable Dev Mode</h3>
            <p>
              Dev Mode exposes administrative tools such as Import and Delete
              All.
            </p>
          </div>

          <button
            className="dev-mode-dialog-close"
            type="button"
            onClick={onCancel}
            disabled={isVerifying}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <label className="dev-mode-dialog-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            autoFocus
            disabled={isVerifying}
          />
        </label>

        {errorMessage && (
          <p className="dev-mode-dialog-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="dev-mode-dialog-footer">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={onCancel}
            disabled={isVerifying}
          >
            Cancel
          </button>

          <button
            className="primary-dashboard-button"
            type="submit"
            disabled={!password || isVerifying}
          >
            {isVerifying ? "Verifying..." : "Enable Dev Mode"}
          </button>
        </div>
      </form>
    </div>
  );
}
