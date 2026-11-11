import { useEffect, useState } from "react";
import { getLocalDate as getNewYorkDate } from "./portalEmail.js";

// YYYY-MM-DD of a calendar cell's Date (built from local year/month/day).
export function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Toah Nipi's current date (America/New_York) as YYYY-MM-DD, whatever the device timezone.
// Rechecks every minute and when the tab wakes, so the highlight moves at New York midnight.
export function usePropertyToday() {
  const [today, setToday] = useState(() => getNewYorkDate(new Date()));

  useEffect(() => {
    const refresh = () => setToday(getNewYorkDate(new Date()));
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return today;
}
