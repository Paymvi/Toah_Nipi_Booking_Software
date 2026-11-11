import { useEffect, useRef, useState } from "react";
import { FaCheck, FaRegCopy } from "react-icons/fa";
import { copyTextToClipboard } from "../utils/clipboard";
import "../styles/CopyButton.css";

const MISSING_VALUES = new Set(["", "—", "n/a", "no email", "no email provided", "no phone provided"]);

function isCopyableValue(value) {
  return !MISSING_VALUES.has(String(value ?? "").trim().toLowerCase());
}

// Small icon button that copies `value`; renders nothing when the value is missing.
export default function CopyButton({ value, label }) {
  const [status, setStatus] = useState("idle");
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  if (!isCopyableValue(value)) {
    return null;
  }

  const copy = async (event) => {
    // Some call sites sit inside clickable cards.
    event.stopPropagation();
    window.clearTimeout(timerRef.current);

    try {
      await copyTextToClipboard(value);
      setStatus("copied");
    } catch (error) {
      console.error(`Could not copy ${label}:`, error);
      setStatus("failed");
    }

    timerRef.current = window.setTimeout(() => setStatus("idle"), 1600);
  };

  return (
    <>
      <button
        type="button"
        className={`copy-value-button is-${status}`}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={copy}
      >
        {status === "copied" ? <FaCheck aria-hidden="true" /> : <FaRegCopy aria-hidden="true" />}
      </button>
      <output className={`copy-value-feedback is-${status}`}>
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : ""}
      </output>
    </>
  );
}
