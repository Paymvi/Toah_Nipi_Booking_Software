// Booking detail date display settings: saved preferences and date formatting.
import {
  BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
  DEFAULT_BOOKING_DETAIL_DATE_SETTINGS,
  bookingDetailDateFormatOptions,
} from "../../constants/dashboardConstants";
import { getLocalDate } from "../../utils/dateUtils";

export function getSavedBookingDetailDateSettings() {
  try {
    const savedSettings = localStorage.getItem(
      BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY
    );

    if (!savedSettings) {
      return DEFAULT_BOOKING_DETAIL_DATE_SETTINGS;
    }

    const parsedSettings = {
      ...DEFAULT_BOOKING_DETAIL_DATE_SETTINGS,
      ...JSON.parse(savedSettings),
    };

    const isValidFormat = bookingDetailDateFormatOptions.some(
      (option) => option.value === parsedSettings.dateFormat
    );

    return {
      ...parsedSettings,
      dateFormat: isValidFormat
        ? parsedSettings.dateFormat
        : DEFAULT_BOOKING_DETAIL_DATE_SETTINGS.dateFormat,
      includeWeekday: Boolean(parsedSettings.includeWeekday),
    };
  } catch (error) {
    console.error("Could not read booking detail date settings:", error);
    return DEFAULT_BOOKING_DETAIL_DATE_SETTINGS;
  }
}

export function saveBookingDetailDateSettings(settings) {
  try {
    localStorage.setItem(
      BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error("Could not save booking detail date settings:", error);
  }
}

function parseBookingDetailDateValue(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  // Keeps YYYY-MM-DD dates from shifting a day because of timezone issues.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return getLocalDate(text);
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function formatBookingDetailDate(
  value,
  settings = DEFAULT_BOOKING_DETAIL_DATE_SETTINGS
) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "—";
  }

  if (settings.dateFormat === "original") {
    return rawValue;
  }

  const date = parseBookingDetailDateValue(rawValue);

  if (!date) {
    return rawValue;
  }

  if (settings.dateFormat === "iso") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const isoDate = `${year}-${month}-${day}`;

    if (!settings.includeWeekday) {
      return isoDate;
    }

    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    }).format(date);

    return `${weekday}, ${isoDate}`;
  }

  const formatOptions = {
    year: "numeric",
    day: "numeric",
  };

  if (settings.includeWeekday) {
    formatOptions.weekday = "short";
  }

  if (settings.dateFormat === "longMonth") {
    formatOptions.month = "long";
  } else if (settings.dateFormat === "shortMonth") {
    formatOptions.month = "short";
  } else {
    formatOptions.month = "numeric";
  }

  return new Intl.DateTimeFormat("en-US", formatOptions).format(date);
}

export function formatBookingDetailDateRange(startDate, endDate, settings) {
  const hasStartDate = Boolean(String(startDate || "").trim());
  const hasEndDate = Boolean(String(endDate || "").trim());

  if (!hasStartDate && !hasEndDate) {
    return "—";
  }

  if (hasStartDate && !hasEndDate) {
    return formatBookingDetailDate(startDate, settings);
  }

  if (!hasStartDate && hasEndDate) {
    return formatBookingDetailDate(endDate, settings);
  }

  const parsedStartDate = parseBookingDetailDateValue(startDate);
  const parsedEndDate = parseBookingDetailDateValue(endDate);

  const isSameCalendarDate =
    parsedStartDate &&
    parsedEndDate &&
    parsedStartDate.getFullYear() === parsedEndDate.getFullYear() &&
    parsedStartDate.getMonth() === parsedEndDate.getMonth() &&
    parsedStartDate.getDate() === parsedEndDate.getDate();

  if (isSameCalendarDate) {
    return formatBookingDetailDate(startDate, settings);
  }

  return `${formatBookingDetailDate(startDate, settings)} - ${formatBookingDetailDate(
    endDate,
    settings
  )}`;
}

export function getBookingDetailDatePreview(settings) {
  return formatBookingDetailDateRange("2025-01-10", "2025-01-12", settings);
}
