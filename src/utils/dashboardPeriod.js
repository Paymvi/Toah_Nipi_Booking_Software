// The time period of the Dashboard's "Next 30 Days" summary card. A per-browser preference, like the theme.
export const DASHBOARD_PERIOD_STORAGE_KEY = "toahNipiDashboardSummaryPeriod";
export const DEFAULT_DASHBOARD_PERIOD = { amount: 30, unit: "days" };
export const DASHBOARD_PERIOD_UNITS = ["days", "weeks", "months"];

// The last day of the period, which is itself included in the summary.
export function getDashboardPeriodEnd(start, { amount, unit }) {
  const year = start.getFullYear();
  const month = start.getMonth();
  const day = start.getDate();

  if (unit === "months") {
    // One month after January 31 is the last day of February, not March 3.
    const lastDayOfMonth = new Date(year, month + amount + 1, 0).getDate();
    return new Date(year, month + amount, Math.min(day, lastDayOfMonth));
  }

  return new Date(year, month, day + amount * (unit === "weeks" ? 7 : 1));
}

// Empty when valid. The only upper limit is the last date JavaScript can represent.
export function getDashboardPeriodError(amountText, unit, start) {
  const text = String(amountText).trim();

  if (!/^\d+$/.test(text) || Number(text) < 1) {
    return "Enter a positive whole number, such as 30.";
  }

  const end = getDashboardPeriodEnd(start, { amount: Number(text), unit });

  return Number.isNaN(end.getTime())
    ? "That is too far ahead to show as a date. Enter a smaller number."
    : "";
}

// Storage can be empty or hold anything; a bad value falls back to the default.
export function parseDashboardPeriod(savedText, start) {
  try {
    const { amount, unit } = JSON.parse(savedText);

    if (
      DASHBOARD_PERIOD_UNITS.includes(unit) &&
      !getDashboardPeriodError(amount, unit, start)
    ) {
      return { amount: Number(amount), unit };
    }
  } catch {
    // Falls through to the default.
  }

  return DEFAULT_DASHBOARD_PERIOD;
}

export function formatDashboardPeriodTitle({ amount, unit }) {
  const name = unit[0].toUpperCase() + unit.slice(1, amount === 1 ? -1 : undefined);
  return `Next ${amount} ${name}`;
}

export function formatDashboardPeriodRange(start, end) {
  const monthDay = { month: "short", day: "numeric" };
  const withYear = { ...monthDay, year: "numeric" };
  const startOptions =
    start.getFullYear() === end.getFullYear() ? monthDay : withYear;

  return `${start.toLocaleDateString("en-US", startOptions)} – ${end.toLocaleDateString("en-US", withYear)}`;
}
