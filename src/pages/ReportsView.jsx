import { useEffect, useMemo, useState } from "react";
import {
  FaBed,
  FaChartBar,
  FaClipboardList,
  FaClock,
  FaDollarSign,
  FaExclamationTriangle,
  FaMoon,
  FaQuestionCircle,
  FaRegCalendarCheck,
  FaTable,
  FaUsers,
  FaUtensils,
} from "react-icons/fa";

import {
  REPORTS_VIEW_SETTINGS_STORAGE_KEY,
  DEFAULT_REPORTS_VIEW_SETTINGS,
  reportsDateRangeOptions,
} from "../constants/dashboardConstants";

import { getLocalDate } from "../utils/dateUtils";

/* =========================================================
   GENERAL HELPERS
========================================================= */

function formatDateForInput(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isBlankBookingValue(value) {
  if (value === 0 || value === false) return false;
  if (value === null || value === undefined) return true;

  const text = String(value).trim().toLowerCase();

  return [
    "",
    "n/a",
    "na",
    "—",
    "no email provided",
    "no phone provided",
    "no contact name",
    "unnamed organization",
    "unnamed group",
    "unassigned",
  ].includes(text);
}

function getRentalFormDetails(booking) {
  const details = booking?.rentalFormDetails;
  return details && typeof details === "object" && !Array.isArray(details)
    ? details
    : {};
}

function firstReportsValue(...values) {
  return values.find((value) => !isBlankBookingValue(value)) ?? "";
}

function getReportsNumber(value) {
  const text = String(value ?? "").replace(/[$,]/g, "").trim();
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : 0;
}

function formatReportsCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatReportsNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatReportsDecimal(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function getReportsPercent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

/* =========================================================
   RECORD / SOURCE HELPERS
========================================================= */

function isReportsArchiveRecord(booking) {
  const text = [
    booking?.sourceType,
    booking?.detectedImportType,
    booking?.retreatType,
    booking?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("archive") || text.includes("archived visit");
}

function getBookingInputMethod(booking) {
  const sourceType = String(booking?.sourceType || "").trim();
  const detectedImportType = String(booking?.detectedImportType || "").trim();
  const normalizedSource = sourceType.toLowerCase();

  if (normalizedSource === "staff booking") return "Staff Booking";
  if (!sourceType || normalizedSource === "form") return "Public Form";

  return `Imported - ${detectedImportType || sourceType}`;
}

function getReportsSourceMode(booking) {
  const sourceType = String(booking?.sourceType || "").trim().toLowerCase();

  if (!sourceType || sourceType === "form" || sourceType === "staff booking") {
    return "forms";
  }

  return "imports";
}

/* =========================================================
   SETTINGS / DATE RANGE
========================================================= */

function getSavedReportsViewSettings() {
  try {
    const saved = localStorage.getItem(REPORTS_VIEW_SETTINGS_STORAGE_KEY);
    return saved
      ? { ...DEFAULT_REPORTS_VIEW_SETTINGS, ...JSON.parse(saved) }
      : DEFAULT_REPORTS_VIEW_SETTINGS;
  } catch (error) {
    console.error("Could not read reports settings:", error);
    return DEFAULT_REPORTS_VIEW_SETTINGS;
  }
}

function saveReportsViewSettings(settings) {
  try {
    localStorage.setItem(
      REPORTS_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error("Could not save reports settings:", error);
  }
}

function getReportsDateRange(settings) {
  const today = getLocalDate(formatDateForInput(new Date()));
  const year = today.getFullYear();
  const month = today.getMonth();

  if (settings.dateRange === "allTime") {
    return { startDate: null, endDate: null, label: "All Time" };
  }

  if (settings.dateRange === "thisMonth") {
    return {
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0),
      label: "This Month",
    };
  }

  if (settings.dateRange === "nextMonth") {
    return {
      startDate: new Date(year, month + 1, 1),
      endDate: new Date(year, month + 2, 0),
      label: "Next Month",
    };
  }

  if (settings.dateRange === "nextYear") {
    return {
      startDate: new Date(year + 1, 0, 1),
      endDate: new Date(year + 1, 11, 31),
      label: `${year + 1}`,
    };
  }

  if (settings.dateRange === "custom") {
    const startDate = settings.customStartDate
      ? getLocalDate(settings.customStartDate)
      : null;

    const endDate = settings.customEndDate
      ? getLocalDate(settings.customEndDate)
      : null;

    if (startDate && endDate && startDate > endDate) {
      return {
        startDate: endDate,
        endDate: startDate,
        label: "Custom Date Range",
      };
    }

    return { startDate, endDate, label: "Custom Date Range" };
  }

  return {
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31),
    label: `${year}`,
  };
}

function bookingTouchesReportsDateRange(booking, dateRange) {
  if (!dateRange.startDate && !dateRange.endDate) return true;

  const start = getLocalDate(booking.startDate);
  if (!start) return false;

  const end = booking.endDate ? getLocalDate(booking.endDate) : start;

  if (dateRange.startDate && dateRange.endDate) {
    return start <= dateRange.endDate && end >= dateRange.startDate;
  }

  if (dateRange.startDate) return end >= dateRange.startDate;
  return start <= dateRange.endDate;
}

/* =========================================================
   GUESTS / NIGHTS / MEALS
========================================================= */

function getReportsGuestCountDetails(booking) {
  const details = getRentalFormDetails(booking);

  const hasActualAdults = !isBlankBookingValue(details.actualAdultGuests);
  const hasActualChildren = !isBlankBookingValue(details.actualChildrenGuests);

  if (hasActualAdults || hasActualChildren) {
    return {
      value:
        getReportsNumber(details.actualAdultGuests) +
        getReportsNumber(details.actualChildrenGuests),
      source: "Actual",
    };
  }

  if (!isBlankBookingValue(details.approxTotalGuests)) {
    return {
      value: getReportsNumber(details.approxTotalGuests),
      source: "Estimated",
    };
  }

  const hasApproxAdults = !isBlankBookingValue(details.approxAdultGuests);
  const hasApproxChildren = !isBlankBookingValue(details.approxChildrenGuests);

  if (hasApproxAdults || hasApproxChildren) {
    return {
      value:
        getReportsNumber(details.approxAdultGuests) +
        getReportsNumber(details.approxChildrenGuests),
      source: "Estimated",
    };
  }

  const fallback = firstReportsValue(
    booking.attendeeCount,
    booking.groupSize,
    booking.persons
  );

  if (!isBlankBookingValue(fallback)) {
    return { value: getReportsNumber(fallback), source: "Recorded" };
  }

  return { value: 0, source: "Missing" };
}

function getReportsGuestCount(booking) {
  return getReportsGuestCountDetails(booking).value;
}

function getReportsNightCount(booking) {
  const details = getRentalFormDetails(booking);
  return getReportsNumber(
    firstReportsValue(details.numberOfNights, booking.nights)
  );
}

function getReportsMealCount(booking) {
  const details = getRentalFormDetails(booking);

  const directValue = firstReportsValue(
    details.numberOfMeals,
    booking.mealCount
  );

  if (!isBlankBookingValue(directValue)) {
    return getReportsNumber(directValue);
  }

  const schedule = details.mealSchedule;

  if (schedule && typeof schedule === "object") {
    return Object.values(schedule).reduce((total, day) => {
      if (!day || typeof day !== "object") return total;

      return (
        total +
        (day.breakfast ? 1 : 0) +
        (day.lunch ? 1 : 0) +
        (day.dinner ? 1 : 0)
      );
    }, 0);
  }

  return 0;
}

function getReportsCamperDaysDetails(booking) {
  const storedValue = getReportsNumber(
    firstReportsValue(
      booking.camperDays,
      booking.camper_days,
      booking["Camper Days"]
    )
  );

  if (storedValue > 0) {
    return {
      value: storedValue,
      source: "Stored",
    };
  }

  const guests = getReportsGuestCount(booking);
  const nights = getReportsNightCount(booking);
  const meals = getReportsMealCount(booking);

  if (guests > 0 && (nights > 0 || meals > 0)) {
    return {
      value: guests * (nights * 0.4 + meals * 0.2),
      source: "Calculated",
      guests,
      nights,
      meals,
    };
  }

  return {
    value: 0,
    source: "Missing",
    guests,
    nights,
    meals,
  };
}

function getReportsCamperDays(booking) {
  return getReportsCamperDaysDetails(booking).value;
}

/* =========================================================
   DEPOSITS
========================================================= */

function getReportsDepositStatusValue(booking) {
  const details = getRentalFormDetails(booking);

  return firstReportsValue(
    details.depositReceivedDate,
    booking.depositReceived
  );
}

function getReportsDepositAmount(booking) {
  const details = getRentalFormDetails(booking);

  return getReportsNumber(
    firstReportsValue(details.depositAmount, booking.deposit)
  );
}

function hasReportsDepositReceived(booking) {
  const text = String(getReportsDepositStatusValue(booking) || "")
    .trim()
    .toLowerCase();

  if (!text) return false;

  return !["no", "n", "false", "not received", "pending", "0"].includes(text);
}

function getReportsDepositReceivedAmount(booking) {
  return hasReportsDepositReceived(booking)
    ? getReportsDepositAmount(booking)
    : 0;
}

/* =========================================================
   REVENUE
========================================================= */

function getReportsRevenueDetails(booking) {
  const details = getRentalFormDetails(booking);

  const invoiceTotal = getReportsNumber(
    firstReportsValue(
      booking.invoiceTotal,
      booking.invoiceLodgingMeals,
      booking.invoice_total,
      details.invoiceTotal
    )
  );

  const expectedRevenue = getReportsNumber(
    firstReportsValue(
      booking.expectedRevenue,
      booking.expectedMinimumRevenue,
      booking.expected_revenue,
      details.expectedRevenue
    )
  );

  const monthlyProjection = getReportsNumber(
    booking.monthlyProjectedIncome
  );

  const itemizedTotal =
    getReportsNumber(booking.usageFee) +
    getReportsNumber(booking.lodgingCost) +
    getReportsNumber(booking.foodCost) +
    getReportsNumber(booking.miscCost);

  if (invoiceTotal) {
    return { value: invoiceTotal, source: "Invoice Total", confidence: "high" };
  }

  if (expectedRevenue) {
    return {
      value: expectedRevenue,
      source: "Expected Revenue",
      confidence: "medium",
    };
  }

  if (monthlyProjection) {
    return {
      value: monthlyProjection,
      source: "Monthly Projection",
      confidence: "medium",
    };
  }

  if (itemizedTotal) {
    return {
      value: itemizedTotal,
      source: "Itemized Fallback",
      confidence: "low",
    };
  }

  return { value: 0, source: "Missing", confidence: "missing" };
}

function getReportsRevenue(booking) {
  return getReportsRevenueDetails(booking).value;
}

/* =========================================================
   MONTH / RETREAT TYPE
========================================================= */

function getReportsMonthKey(booking) {
  const date = getLocalDate(booking.startDate);
  if (!date) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function formatReportsMonthLabel(monthKey) {
  if (!monthKey) return "No Month";

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function getReportsRetreatType(booking) {
  return String(booking.retreatType || "").trim() || "No Retreat Type";
}

/* =========================================================
   HOUSING
========================================================= */

const REPORTS_HOUSING_CONFIG = [
  {
    id: "bethel",
    label: "Bethel",
    field: "lodgingBethel",
    aliases: ["bethel"],
  },
  {
    id: "hebron-third",
    label: "Hebron 3rd Floor",
    field: "lodgingHebronThird",
    aliases: ["hebron 3rd floor", "hebron third floor", "hebron 3rd"],
  },
  {
    id: "hebron-bunks",
    label: "Hebron Bunks",
    field: "lodgingHebronBunks",
    aliases: ["hebron bunks", "hebron bunk"],
  },
  {
    id: "dothan",
    label: "Dothan",
    field: "lodgingDothan",
    aliases: ["dothan"],
  },
  {
    id: "ajalon",
    label: "Ajalon",
    field: "lodgingAjalon",
    aliases: ["ajalon", "rustic: ajalon", "rustic ajalon"],
  },
  {
    id: "capernaum",
    label: "Capernaum",
    field: "lodgingCapernaum",
    aliases: ["capernaum", "rustic: capernaum", "rustic capernaum"],
  },
  {
    id: "guest-house",
    label: "Guest House",
    field: "lodgingGuestHouse",
    aliases: ["guest house", "guesthouse"],
  },
  {
    id: "hebron-unspecified",
    label: "Hebron — Unspecified",
    field: null,
    aliases: [],
    genericHebron: true,
  },
];

function getReportsHousingText(booking) {
  return [booking?.roomName, booking?.buildingsRooms]
    .filter(Boolean)
    .join("; ")
    .toLowerCase();
}

function getReportsHousingCountFromSummary(booking, row) {
  const parts = String(booking?.buildingsRooms || "")
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const lowerPart = part.toLowerCase();

    const matches = row.aliases.some((alias) =>
      lowerPart.startsWith(alias.toLowerCase())
    );

    if (!matches) continue;

    const countMatch = part.match(/:\s*(\d+)/);
    if (countMatch) return Number(countMatch[1]);
  }

  return 0;
}

function reportsHasGenericHebron(booking) {
  const text = getReportsHousingText(booking);

  if (!/\bhebron\b/i.test(text)) return false;

  const identifiesThird = /hebron\s+(3rd|third)/i.test(text);
  const identifiesBunks = /hebron\s+bunks?/i.test(text);

  return !identifiesThird && !identifiesBunks;
}

function getReportsHousingUsage(booking, row) {
  if (row.genericHebron) {
    return {
      used: reportsHasGenericHebron(booking),
      assignedGuests: 0,
      countKnown: false,
    };
  }

  const details = getRentalFormDetails(booking);

  const detailCount = row.field ? getReportsNumber(details[row.field]) : 0;
  const summaryCount = getReportsHousingCountFromSummary(booking, row);
  const assignedGuests = detailCount || summaryCount || 0;

  const explicitlyUsed = row.field
    ? details?.housingUsage?.[row.field] === true
    : false;

  const housingText = getReportsHousingText(booking);

  const foundInText = row.aliases.some((alias) =>
    housingText.includes(alias.toLowerCase())
  );

  const used = assignedGuests > 0 || explicitlyUsed || foundInText;

  return {
    used,
    assignedGuests,
    countKnown: assignedGuests > 0,
  };
}

function reportsBookingHasHousing(booking) {
  return REPORTS_HOUSING_CONFIG.some(
    (row) => getReportsHousingUsage(booking, row).used
  );
}

function reportsBookingHasUnknownHousingCount(booking) {
  return REPORTS_HOUSING_CONFIG.some((row) => {
    const usage = getReportsHousingUsage(booking, row);
    return usage.used && !usage.countKnown;
  });
}

/* =========================================================
   CSV
========================================================= */

function downloadReportsCsv(filename, sections) {
  const rows = [];

  sections.forEach((section) => {
    rows.push([section.title]);
    rows.push(section.headers);
    section.rows.forEach((row) => rows.push(row));
    rows.push([]);
  });

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function ReportSummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}) {
  return (
    <article className={`reports-summary-card reports-summary-card-${tone}`}>
      <span className="reports-summary-icon">
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper && <p>{helper}</p>}
      </div>
    </article>
  );
}

function ReportBarRow({ label, value, maxValue, valueLabel, helper }) {
  const width =
    maxValue > 0 && value > 0
      ? Math.max((value / maxValue) * 100, 4)
      : 0;

  return (
    <div className="reports-bar-row">
      <div className="reports-bar-row-top">
        <strong>{label}</strong>
        <span>{valueLabel || formatReportsNumber(value)}</span>
      </div>

      <div className="reports-bar-track">
        <span style={{ width: `${width}%` }} />
      </div>

      {helper && <small>{helper}</small>}
    </div>
  );
}

/* =========================================================
   RETREAT PIE
========================================================= */

const REPORTS_RETREAT_TYPE_COLORS = {
  pr: "#5c6bc0",
  "day use": "#636671",
  men: "#2563eb",
  women: "#be5091",
  students: "#d97706",
  "students / youth": "#d97706",
  youth: "#d97706",
  families: "#0d9488",
  adults: "#4f46e5",
  "staff / leaders": "#166534",
  staff: "#166534",
  leaders: "#166534",
  "pastors / elders": "#7e57c2",
  pastors: "#7e57c2",
  elders: "#7e57c2",
  "friends / hosts": "#0891b2",
  friends: "#0891b2",
  hosts: "#0891b2",
  events: "#c2410c",
  other: "#64748b",
  "additional types": "#94a3b8",
  "no retreat type": "#9aa1ad",
};

const REPORTS_RETREAT_FALLBACK_COLORS = [
  "#5c6bc0",
  "#636671",
  "#2563eb",
  "#be5091",
  "#d97706",
  "#0d9488",
  "#4f46e5",
  "#166534",
  "#7e57c2",
  "#0891b2",
  "#c2410c",
  "#64748b",
];

function normalizeReportsRetreatTypeLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getRetreatPieColor(label, index) {
  const normalized = normalizeReportsRetreatTypeLabel(label);

  return (
    REPORTS_RETREAT_TYPE_COLORS[normalized] ||
    REPORTS_RETREAT_FALLBACK_COLORS[
      index % REPORTS_RETREAT_FALLBACK_COLORS.length
    ]
  );
}

function formatRetreatPieLabel(label) {
  const normalized = normalizeReportsRetreatTypeLabel(label);

  const labels = {
    pr: "PR",
    "day use": "Day Use",
    men: "Men",
    women: "Women",
    students: "Students / Youth",
    youth: "Students / Youth",
    "students / youth": "Students / Youth",
    families: "Families",
    adults: "Adults",
    staff: "Staff / Leaders",
    leaders: "Staff / Leaders",
    "staff / leaders": "Staff / Leaders",
    pastors: "Pastors / Elders",
    elders: "Pastors / Elders",
    "pastors / elders": "Pastors / Elders",
    friends: "Friends / Hosts",
    hosts: "Friends / Hosts",
    "friends / hosts": "Friends / Hosts",
    events: "Events",
    other: "Other",
    "additional types": "Additional Types",
    "no retreat type": "No Retreat Type",
  };

  return labels[normalized] || label;
}

function ReportRetreatTypePieChart({ rows, totalBookings }) {
  const maxGroups = 12;
  const visibleRows = rows.filter((row) => row.bookings > 0);
  const topRows = visibleRows.slice(0, maxGroups);

  const additionalBookings = visibleRows
    .slice(maxGroups)
    .reduce((sum, row) => sum + row.bookings, 0);

  const chartRows = additionalBookings
    ? [
        ...topRows,
        {
          label: "Additional Types",
          bookings: additionalBookings,
        },
      ]
    : topRows;

  let runningPercent = 0;

  const pieRows = chartRows.map((row, index) => {
    const percent = totalBookings
      ? (row.bookings / totalBookings) * 100
      : 0;

    const start = runningPercent;
    const end = runningPercent + percent;

    runningPercent = end;

    return {
      ...row,
      label: formatRetreatPieLabel(row.label),
      percent,
      start,
      end,
      color: getRetreatPieColor(row.label, index),
    };
  });

  const pieBackground = pieRows.length
    ? `conic-gradient(${pieRows
        .map((row) => `${row.color} ${row.start}% ${row.end}%`)
        .join(", ")})`
    : "#edf0f4";

  return (
    <div className="reports-retreat-pie-card">
      <div
        className="reports-retreat-pie-chart"
        style={{ background: pieBackground }}
      >
        <div className="reports-retreat-pie-center">
          <strong>{formatReportsNumber(totalBookings)}</strong>
          <span>Bookings</span>
        </div>
      </div>

      <div className="reports-retreat-pie-legend">
        {pieRows.map((row) => (
          <div className="reports-retreat-pie-legend-row" key={row.label}>
            <span
              className="reports-retreat-pie-dot"
              style={{ background: row.color }}
            />

            <div>
              <strong>{row.label}</strong>
              <small>
                {formatReportsNumber(row.bookings)} booking
                {row.bookings === 1 ? "" : "s"} · {Math.round(row.percent)}%
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   MAIN VIEW
========================================================= */

function ReportsView({ inquiryBookings }) {
  const [reportsSettings, setReportsSettings] = useState(() =>
    getSavedReportsViewSettings()
  );

  useEffect(() => {
    saveReportsViewSettings(reportsSettings);
  }, [reportsSettings]);

  const updateReportsSettings = (updates) => {
    setReportsSettings((current) => ({
      ...current,
      ...updates,
    }));
  };

  const reportDateRange = useMemo(
    () => getReportsDateRange(reportsSettings),
    [reportsSettings]
  );

  const operationalBookings = useMemo(
    () =>
      inquiryBookings.filter(
        (booking) => !isReportsArchiveRecord(booking)
      ),
    [inquiryBookings]
  );

  const archiveExcludedCount =
    inquiryBookings.length - operationalBookings.length;

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          operationalBookings
            .map((booking) => booking.status)
            .filter(Boolean)
        )
      ).sort(),
    [operationalBookings]
  );

  const retreatTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          operationalBookings.map((booking) =>
            getReportsRetreatType(booking)
          )
        )
      ).sort(),
    [operationalBookings]
  );

  const filteredReportBookings = useMemo(() => {
    return operationalBookings.filter((booking) => {
      if (
        reportsSettings.status !== "all" &&
        booking.status !== reportsSettings.status
      ) {
        return false;
      }

      if (
        reportsSettings.retreatType !== "all" &&
        getReportsRetreatType(booking) !== reportsSettings.retreatType
      ) {
        return false;
      }

      if (
        reportsSettings.sourceMode !== "all" &&
        getReportsSourceMode(booking) !== reportsSettings.sourceMode
      ) {
        return false;
      }

      return bookingTouchesReportsDateRange(booking, reportDateRange);
    });
  }, [operationalBookings, reportsSettings, reportDateRange]);

  const totalBookings = filteredReportBookings.length;

  const confirmedBookings = filteredReportBookings.filter((booking) =>
    String(booking.status || "").toLowerCase().includes("confirm")
  );

  const inquiryBookingsCount = filteredReportBookings.filter((booking) =>
    String(booking.status || "").toLowerCase().includes("inquiry")
  ).length;

  const cancelledBookings = filteredReportBookings.filter((booking) =>
    String(booking.status || "").toLowerCase().includes("cancel")
  );

  const waitlistBookings = filteredReportBookings.filter(
    (booking) =>
      String(booking.waitlist || "").toLowerCase() === "yes" ||
      String(booking.status || "").toLowerCase().includes("wait")
  );

  const totalGuests = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsGuestCount(booking),
    0
  );

  const totalNights = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsNightCount(booking),
    0
  );

  const totalMeals = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsMealCount(booking),
    0
  );

  const camperDayRows = useMemo(
    () =>
      filteredReportBookings.map((booking) =>
        getReportsCamperDaysDetails(booking)
      ),
    [filteredReportBookings]
  );

  const totalCamperDays = camperDayRows.reduce(
    (sum, row) => sum + row.value,
    0
  );

  const camperDaysStoredCount = camperDayRows.filter(
    (row) => row.source === "Stored"
  ).length;

  const camperDaysCalculatedCount = camperDayRows.filter(
    (row) => row.source === "Calculated"
  ).length;

  const camperDaysMissingCount = camperDayRows.filter(
    (row) => row.source === "Missing"
  ).length;

  const camperDaysCoverageCount =
    camperDaysStoredCount + camperDaysCalculatedCount;

  const averageCamperDaysPerCoveredBooking = camperDaysCoverageCount
    ? totalCamperDays / camperDaysCoverageCount
    : 0;

  const averageCamperDaysPerGuest = totalGuests
    ? totalCamperDays / totalGuests
    : 0;

  const camperDaysBreakdownRows = [
    {
      label: "Stored camper day values",
      count: camperDaysStoredCount,
      helper: "Used an existing camperDays value already saved on the booking.",
    },
    {
      label: "Calculated from guests, nights, and meals",
      count: camperDaysCalculatedCount,
      helper:
        "Fallback formula: Guests × ((Nights × 0.4) + (Meals × 0.2)).",
    },
    {
      label: "Missing enough data",
      count: camperDaysMissingCount,
      helper:
        "Could not calculate camper days because guest count or usage counts were missing.",
    },
  ];

  const maxCamperDaysBreakdownCount = Math.max(
    0,
    ...camperDaysBreakdownRows.map((row) => row.count)
  );

  const projectedRevenue = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsRevenue(booking),
    0
  );

  const depositsReceived = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsDepositReceivedAmount(booking),
    0
  );

  const depositsReceivedCount = filteredReportBookings.filter((booking) =>
    hasReportsDepositReceived(booking)
  ).length;

  const actualGuestCountBookings = filteredReportBookings.filter(
    (booking) => getReportsGuestCountDetails(booking).source === "Actual"
  ).length;

  const revenueSourceRows = useMemo(() => {
    const sourceMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const revenue = getReportsRevenueDetails(booking);

      if (!sourceMap.has(revenue.source)) {
        sourceMap.set(revenue.source, {
          label: revenue.source,
          count: 0,
          value: 0,
          confidence: revenue.confidence,
        });
      }

      const row = sourceMap.get(revenue.source);
      row.count += 1;
      row.value += revenue.value;
    });

    const order = {
      high: 1,
      medium: 2,
      low: 3,
      missing: 4,
    };

    return Array.from(sourceMap.values()).sort(
      (a, b) =>
        order[a.confidence] - order[b.confidence] ||
        b.count - a.count
    );
  }, [filteredReportBookings]);

  const maxRevenueSourceValue = Math.max(
    0,
    ...revenueSourceRows.map((row) => row.value)
  );

  const monthlyRows = useMemo(() => {
    const monthMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const monthKey = getReportsMonthKey(booking);
      if (!monthKey) return;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          label: formatReportsMonthLabel(monthKey),
          bookings: 0,
          confirmed: 0,
          guests: 0,
          revenue: 0,

          // Camper Days
          camperDays: 0,
          camperDayBookings: 0,
        });
      }

      const row = monthMap.get(monthKey);

      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
      row.revenue += getReportsRevenue(booking);

      const camperDays = getReportsCamperDays(booking);

      if (camperDays > 0) {
        row.camperDays += camperDays;
        row.camperDayBookings += 1;
      }

      if (
        String(booking.status || "").toLowerCase().includes("confirm")
      ) {
        row.confirmed += 1;
      }
    });

    return Array.from(monthMap.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );
  }, [filteredReportBookings]);

  const maxMonthlyBookings = Math.max(
    0,
    ...monthlyRows.map((row) => row.bookings)
  );

  const maxMonthlyGuests = Math.max(
    0,
    ...monthlyRows.map((row) => row.guests)
  );

  const maxMonthlyRevenue = Math.max(
    0,
    ...monthlyRows.map((row) => row.revenue)
  );

  /* =========================================================
    CAMPER DAY ANALYTICS
  ========================================================= */

  const camperDayMonthlyRows = monthlyRows.filter(
    (row) => row.camperDays > 0
  );

  const maxMonthlyCamperDays = Math.max(
    0,
    ...camperDayMonthlyRows.map((row) => row.camperDays)
  );

  const peakCamperDayMonth =
    camperDayMonthlyRows.reduce((peak, row) => {
      if (!peak || row.camperDays > peak.camperDays) {
        return row;
      }

      return peak;
    }, null);

  const camperDaysByRetreatTypeRows = useMemo(() => {
    const map = new Map();

    filteredReportBookings.forEach((booking) => {
      const camperDays = getReportsCamperDays(booking);

      if (camperDays <= 0) return;

      const retreatType = getReportsRetreatType(booking);

      if (!map.has(retreatType)) {
        map.set(retreatType, {
          label: retreatType,
          camperDays: 0,
          bookings: 0,
          guests: 0,
        });
      }

      const row = map.get(retreatType);

      row.camperDays += camperDays;
      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.camperDays - a.camperDays
    );
  }, [filteredReportBookings]);

  const topCamperDayRetreatTypes =
    camperDaysByRetreatTypeRows.slice(0, 6);

  const maxRetreatTypeCamperDays = Math.max(
    0,
    ...topCamperDayRetreatTypes.map((row) => row.camperDays)
  );

  const largestCamperDayBookings = useMemo(() => {
    return filteredReportBookings
      .map((booking) => {
        const camperDays = getReportsCamperDays(booking);

        const groupName =
          firstReportsValue(
            booking.organizationName,
            booking.guestGroupName,
            booking.name,
            booking.contactName
          ) || "Unnamed Group";

        const startDate = getLocalDate(booking.startDate);

        const dateLabel = startDate
          ? new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(startDate)
          : "No arrival date";

        return {
          id:
            booking.id ||
            `${groupName}-${booking.startDate || ""}-${camperDays}`,
          groupName,
          dateLabel,
          camperDays,
          guests: getReportsGuestCount(booking),
          nights: getReportsNightCount(booking),
          meals: getReportsMealCount(booking),
        };
      })
      .filter((row) => row.camperDays > 0)
      .sort((a, b) => b.camperDays - a.camperDays)
      .slice(0, 5);
  }, [filteredReportBookings]);

  const maxLargestBookingCamperDays = Math.max(
    0,
    ...largestCamperDayBookings.map((row) => row.camperDays)
  );

  const revenueBreakdown = [
    {
      label: "Invoice Totals",
      value: filteredReportBookings.reduce(
        (sum, booking) =>
          sum +
          getReportsNumber(
            firstReportsValue(
              booking.invoiceTotal,
              booking.invoiceLodgingMeals,
              booking.invoice_total
            )
          ),
        0
      ),
    },
    {
      label: "Expected Revenue",
      value: filteredReportBookings.reduce(
        (sum, booking) =>
          sum +
          getReportsNumber(
            firstReportsValue(
              booking.expectedRevenue,
              booking.expectedMinimumRevenue,
              booking.expected_revenue
            )
          ),
        0
      ),
    },
    {
      label: "Usage Fees",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.usageFee),
        0
      ),
    },
    {
      label: "Lodging",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.lodgingCost),
        0
      ),
    },
    {
      label: "Food",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.foodCost),
        0
      ),
    },
    {
      label: "Misc.",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.miscCost),
        0
      ),
    },
    {
      label: "Deposits Received",
      value: depositsReceived,
    },
  ];

  const maxRevenueBreakdown = Math.max(
    0,
    ...revenueBreakdown.map((item) => item.value)
  );

  const retreatTypeRows = useMemo(() => {
    const map = new Map();

    filteredReportBookings.forEach((booking) => {
      const type = getReportsRetreatType(booking);

      if (!map.has(type)) {
        map.set(type, {
          label: type,
          bookings: 0,
          guests: 0,
          revenue: 0,
        });
      }

      const row = map.get(type);
      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
      row.revenue += getReportsRevenue(booking);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.bookings - a.bookings
    );
  }, [filteredReportBookings]);

  const maxRetreatTypeBookings = Math.max(
    0,
    ...retreatTypeRows.map((row) => row.bookings)
  );

  const housingUsageRows = useMemo(() => {
    return REPORTS_HOUSING_CONFIG
      .map((housingRow) => {
        let bookings = 0;
        let knownGuests = 0;
        let unknownCountBookings = 0;

        filteredReportBookings.forEach((booking) => {
          const usage = getReportsHousingUsage(booking, housingRow);

          if (!usage.used) return;

          bookings += 1;

          if (usage.countKnown) {
            knownGuests += usage.assignedGuests;
          } else {
            unknownCountBookings += 1;
          }
        });

        return {
          id: housingRow.id,
          label: housingRow.label,
          bookings,
          knownGuests,
          unknownCountBookings,
        };
      })
      .filter((row) => row.bookings > 0)
      .sort((a, b) => b.bookings - a.bookings);
  }, [filteredReportBookings]);

  const statusRows = useMemo(() => {
    const map = new Map();

    filteredReportBookings.forEach((booking) => {
      const status = String(booking.status || "No Status").trim();
      map.set(status, (map.get(status) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReportBookings]);

  const maxStatusCount = Math.max(
    0,
    ...statusRows.map((row) => row.count)
  );

  const sourceRows = useMemo(() => {
    const map = new Map();

    filteredReportBookings.forEach((booking) => {
      const source = getBookingInputMethod(booking);
      map.set(source, (map.get(source) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReportBookings]);

  const maxSourceCount = Math.max(
    0,
    ...sourceRows.map((row) => row.count)
  );

  const dataQualityRows = [
    {
      label: "Missing Dates",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.startDate)
      ).length,
    },
    {
      label: "Missing Contact Method",
      count: filteredReportBookings.filter(
        (booking) =>
          isBlankBookingValue(booking.email) &&
          isBlankBookingValue(booking.phone)
      ).length,
    },
    {
      label: "Missing Guest Count",
      count: filteredReportBookings.filter(
        (booking) =>
          getReportsGuestCountDetails(booking).source === "Missing"
      ).length,
    },
    {
      label: "Missing Retreat Type",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.retreatType)
      ).length,
    },
    {
      label: "Missing Housing",
      count: filteredReportBookings.filter(
        (booking) => !reportsBookingHasHousing(booking)
      ).length,
    },
    {
      label: "Housing Count Unknown",
      count: filteredReportBookings.filter((booking) =>
        reportsBookingHasUnknownHousingCount(booking)
      ).length,
    },
    {
      label: "Confirmed / Contract Missing Deposit Status",
      count: filteredReportBookings.filter((booking) => {
        const status = String(booking.status || "").toLowerCase();

        const shouldHaveDeposit =
          status.includes("confirmed") ||
          status.includes("contract");

        return (
          shouldHaveDeposit &&
          !getReportsDepositStatusValue(booking)
        );
      }).length,
    },
    {
      label: "Missing Revenue",
      count: filteredReportBookings.filter(
        (booking) =>
          getReportsRevenueDetails(booking).confidence === "missing"
      ).length,
    },
  ];

  const maxQualityCount = Math.max(
    0,
    ...dataQualityRows.map((row) => row.count)
  );

  const handleExportReports = () => {
    downloadReportsCsv("toah-nipi-reports-summary.csv", [
      {
        title: "Executive Summary",
        headers: ["Metric", "Value"],
        rows: [
          ["Total Bookings", totalBookings],
          ["Confirmed Bookings", confirmedBookings.length],
          ["Inquiry Bookings", inquiryBookingsCount],
          ["Cancelled Bookings", cancelledBookings.length],
          ["Waitlist Bookings", waitlistBookings.length],
          ["Total Guests", totalGuests],
          ["Total Nights", totalNights],
          ["Total Meal Services", totalMeals],
          ["Total Camper Days", totalCamperDays],
          ["Projected Revenue", projectedRevenue],
          ["Deposits Received - Count", depositsReceivedCount],
          ["Deposits Received - Amount", depositsReceived],
        ],
      },
      {
        title: "Monthly Trends",
        headers: [
          "Month",
          "Bookings",
          "Confirmed",
          "Guests",
          "Camper Days",
          "Revenue",
        ],
        rows: monthlyRows.map((row) => [
          row.label,
          row.bookings,
          row.confirmed,
          row.guests,
          row.camperDays,
          row.revenue,
        ]),
      },
      {
        title: "Financial Field Totals",
        headers: ["Category", "Value"],
        rows: revenueBreakdown.map((item) => [
          item.label,
          item.value,
        ]),
      },
      {
        title: "Revenue Source Confidence",
        headers: ["Source", "Rows", "Revenue", "Confidence"],
        rows: revenueSourceRows.map((row) => [
          row.label,
          row.count,
          row.value,
          row.confidence,
        ]),
      },
      {
        title: "Retreat Type Breakdown",
        headers: ["Retreat Type", "Bookings", "Guests", "Revenue"],
        rows: retreatTypeRows.map((row) => [
          row.label,
          row.bookings,
          row.guests,
          row.revenue,
        ]),
      },
      {
        title: "Housing Usage",
        headers: [
          "Lodging",
          "Bookings Using",
          "Known Assigned Guests",
          "Bookings With Unknown Count",
        ],
        rows: housingUsageRows.map((row) => [
          row.label,
          row.bookings,
          row.knownGuests,
          row.unknownCountBookings,
        ]),
      },
      {
        title: "Status Breakdown",
        headers: ["Status", "Bookings"],
        rows: statusRows.map((row) => [row.label, row.count]),
      },
      {
        title: "Input Sources",
        headers: ["Source", "Bookings"],
        rows: sourceRows.map((row) => [row.label, row.count]),
      },
      {
        title: "Data Quality",
        headers: ["Issue", "Count"],
        rows: dataQualityRows.map((row) => [row.label, row.count]),
      },
    ]);
  };

  return (
    <section className="reports-page">
      <article className="dashboard-card reports-header-card">
        <div className="reports-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaChartBar />
            </span>

            <div>
              <p className="dashboard-eyebrow">Reporting</p>
              <h2>Reports</h2>
              <p>
                Operational booking, attendance, housing, revenue, source,
                and data-quality insights across the selected report range.
              </p>

              {archiveExcludedCount > 0 && (
                <span className="reports-header-note">
                  {archiveExcludedCount} historical archive record
                  {archiveExcludedCount === 1 ? "" : "s"} excluded from
                  operational totals.
                </span>
              )}
            </div>
          </div>

          <button
            className="primary-dashboard-button"
            type="button"
            onClick={handleExportReports}
            disabled={filteredReportBookings.length === 0}
          >
            <FaTable />
            Export CSV
          </button>
        </div>

        <div className="reports-filter-bar">
          <label className="reports-filter-field">
            <span>Date Range</span>
            <select
              value={reportsSettings.dateRange}
              onChange={(event) =>
                updateReportsSettings({
                  dateRange: event.target.value,
                })
              }
            >
              {reportsDateRangeOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {reportsSettings.dateRange === "custom" && (
            <>
              <label className="reports-filter-field">
                <span>From</span>
                <input
                  type="date"
                  value={reportsSettings.customStartDate || ""}
                  onChange={(event) =>
                    updateReportsSettings({
                      customStartDate: event.target.value,
                    })
                  }
                />
              </label>

              <label className="reports-filter-field">
                <span>To</span>
                <input
                  type="date"
                  value={reportsSettings.customEndDate || ""}
                  onChange={(event) =>
                    updateReportsSettings({
                      customEndDate: event.target.value,
                    })
                  }
                />
              </label>
            </>
          )}

          <label className="reports-filter-field">
            <span>Status</span>
            <select
              value={reportsSettings.status}
              onChange={(event) =>
                updateReportsSettings({
                  status: event.target.value,
                })
              }
            >
              <option value="all">All Statuses</option>
              {statusOptions.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter-field">
            <span>Retreat Type</span>
            <select
              value={reportsSettings.retreatType}
              onChange={(event) =>
                updateReportsSettings({
                  retreatType: event.target.value,
                })
              }
            >
              <option value="all">All Retreat Types</option>
              {retreatTypeOptions.map((retreatType) => (
                <option value={retreatType} key={retreatType}>
                  {retreatType}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter-field">
            <span>Source</span>
            <select
              value={reportsSettings.sourceMode}
              onChange={(event) =>
                updateReportsSettings({
                  sourceMode: event.target.value,
                })
              }
            >
              <option value="all">Forms + Imports</option>
              <option value="forms">Booking Forms Only</option>
              <option value="imports">Imports Only</option>
            </select>
          </label>

          <button
            className="secondary-dashboard-button reports-reset-button"
            type="button"
            onClick={() =>
              setReportsSettings({
                ...DEFAULT_REPORTS_VIEW_SETTINGS,
              })
            }
          >
            Reset
          </button>
        </div>
      </article>

      <section className="reports-summary-grid">
        <ReportSummaryCard
          icon={FaClipboardList}
          label="Total Bookings"
          value={formatReportsNumber(totalBookings)}
          helper={`${reportDateRange.label} report range`}
          tone="purple"
        />

        <ReportSummaryCard
          icon={FaRegCalendarCheck}
          label="Confirmed"
          value={formatReportsNumber(confirmedBookings.length)}
          helper={`${getReportsPercent(
            confirmedBookings.length,
            totalBookings
          )}% of filtered bookings`}
          tone="green"
        />

        <ReportSummaryCard
          icon={FaUsers}
          label="Total Guests"
          value={formatReportsNumber(totalGuests)}
          helper={`${actualGuestCountBookings} booking${
            actualGuestCountBookings === 1 ? "" : "s"
          } using actual attendance`}
          tone="blue"
        />

        <ReportSummaryCard
          icon={FaDollarSign}
          label="Projected Revenue"
          value={formatReportsCurrency(projectedRevenue)}
          helper="Uses one best stored revenue value per booking"
          tone="gold"
        />

        <ReportSummaryCard
          icon={FaMoon}
          label="Total Nights"
          value={formatReportsNumber(totalNights)}
          helper="Staff Booking and imported stay counts"
          tone="indigo"
        />

        <ReportSummaryCard
          icon={FaUtensils}
          label="Meal Services"
          value={formatReportsNumber(totalMeals)}
          helper="Stored meal counts or current meal schedules"
          tone="orange"
        />

        <ReportSummaryCard
          icon={FaClock}
          label="Waitlist"
          value={formatReportsNumber(waitlistBookings.length)}
          helper={`${getReportsPercent(
            waitlistBookings.length,
            totalBookings
          )}% of filtered bookings`}
          tone="teal"
        />

        <ReportSummaryCard
          icon={FaExclamationTriangle}
          label="Cancelled"
          value={formatReportsNumber(cancelledBookings.length)}
          helper={`${getReportsPercent(
            cancelledBookings.length,
            totalBookings
          )}% of filtered bookings`}
          tone="red"
        />
      </section>

      <article className="dashboard-card reports-panel reports-camper-days-panel">
        <div className="reports-panel-header">
          <div>
            <p className="dashboard-eyebrow">Camp Usage</p>
            <h3>Camper Days</h3>
            <span>
              Standardized usage across guests, overnight stays, and meals for the
              selected report range.
            </span>
          </div>
        </div>

        <div className="reports-camper-days-layout">
          <div className="reports-camper-days-main">
            <div className="reports-camper-days-stat-grid">
              <div className="reports-camper-days-stat">
                <small>Total Camper Days</small>

                <strong>
                  {formatReportsDecimal(totalCamperDays)}
                </strong>

                <p>
                  Across {formatReportsNumber(camperDaysCoverageCount)} booking
                  {camperDaysCoverageCount === 1 ? "" : "s"} with usable data
                </p>
              </div>

              <div className="reports-camper-days-stat">
                <small>Average Per Booking</small>

                <strong>
                  {formatReportsDecimal(
                    averageCamperDaysPerCoveredBooking
                  )}
                </strong>

                <p>
                  Average among bookings with usable camper day data
                </p>
              </div>

              <div className="reports-camper-days-stat">
                <small>Peak Usage Month</small>

                <strong>
                  {peakCamperDayMonth
                    ? peakCamperDayMonth.label
                    : "—"}
                </strong>

                <p>
                  {peakCamperDayMonth
                    ? `${formatReportsDecimal(
                        peakCamperDayMonth.camperDays
                      )} camper days`
                    : "No usable monthly data"}
                </p>
              </div>

              <div className="reports-camper-days-stat">
                <small>Data Coverage</small>

                <strong>
                  {getReportsPercent(
                    camperDaysCoverageCount,
                    totalBookings
                  )}%
                </strong>

                <p>
                  {formatReportsNumber(camperDaysMissingCount)} booking
                  {camperDaysMissingCount === 1 ? "" : "s"} cannot currently be measured
                </p>
              </div>
            </div>

            <div className="reports-camper-days-trend">
              <div className="reports-camper-days-section-heading">
                <div>
                  <p className="dashboard-eyebrow">
                    Usage Over Time
                  </p>

                  <h4>
                    <FaChartBar />
                    Camper Days by Month
                  </h4>

                  <span>
                    Shows when camp usage was highest across the selected report range.
                  </span>
                </div>
              </div>

              {camperDayMonthlyRows.length > 0 ? (
                <div className="reports-bar-list">
                  {camperDayMonthlyRows.map((row) => {
                    const average =
                      row.camperDayBookings > 0
                        ? row.camperDays / row.camperDayBookings
                        : 0;

                    return (
                      <ReportBarRow
                        key={`camper-days-${row.monthKey}`}
                        label={row.label}
                        value={row.camperDays}
                        maxValue={maxMonthlyCamperDays}
                        valueLabel={`${formatReportsDecimal(
                          row.camperDays
                        )} camper days`}
                        helper={`${formatReportsNumber(
                          row.camperDayBookings
                        )} covered booking${
                          row.camperDayBookings === 1 ? "" : "s"
                        } · ${formatReportsDecimal(
                          average
                        )} average`}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="reports-empty-state">
                  <strong>No Camper Day trend data</strong>

                  <p>
                    No filtered bookings have both a usable arrival date and Camper Day
                    information.
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="reports-camper-days-explainer">
            <div className="reports-camper-days-note">
              <small>What are camper days?</small>
              <strong>
                Camper days are a standardized way to measure how much a group used
                the camp.
              </strong>

              <p>
                They combine guest count, nights, and meals into one number so staff
                can compare retreat usage more fairly across different group types and
                stay lengths.
              </p>

              <div className="reports-camper-days-formula">
                Camper Days = Guests × ((Nights × 0.4) + (Meals × 0.2))
              </div>

              <ul className="reports-camper-days-list">
                <li>
                  <strong>1 night</strong>
                  <span>= 0.4 camper days per person</span>
                </li>

                <li>
                  <strong>1 meal</strong>
                  <span>= 0.2 camper days per person</span>
                </li>

                <li>
                  <strong>Simple example</strong>
                  <span>
                    1 guest staying 3 nights and eating 3 meals = 1.8 camper days
                  </span>
                </li>
              </ul>

              <div className="reports-camper-days-coverage-summary">
                <div className="reports-camper-days-coverage-heading">
                  <span>Data Coverage</span>

                  <strong>
                    {getReportsPercent(
                      camperDaysCoverageCount,
                      totalBookings
                    )}%
                  </strong>
                </div>

                <div className="reports-camper-days-coverage-track">
                  <span
                    style={{
                      width: `${getReportsPercent(
                        camperDaysCoverageCount,
                        totalBookings
                      )}%`,
                    }}
                  />
                </div>

                <div className="reports-camper-days-coverage-counts">
                  <span>
                    <strong>{camperDaysStoredCount}</strong>
                    Stored
                  </span>

                  <span>
                    <strong>{camperDaysCalculatedCount}</strong>
                    Calculated
                  </span>

                  <span>
                    <strong>{camperDaysMissingCount}</strong>
                    Missing
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>


        <div className="reports-camper-days-insight-grid">
          <section className="reports-camper-days-insight-card">
            <div className="reports-camper-days-section-heading">
              <div>
                <p className="dashboard-eyebrow">
                  Group Mix
                </p>

                <h4>
                  <FaUsers />
                  Camper Days by Retreat Type
                </h4>

                <span>
                  Retreat categories generating the most overall camp usage.
                </span>
              </div>
            </div>

            {topCamperDayRetreatTypes.length > 0 ? (
              <div className="reports-bar-list">
                {topCamperDayRetreatTypes.map((row) => (
                  <ReportBarRow
                    key={`camper-retreat-${row.label}`}
                    label={row.label}
                    value={row.camperDays}
                    maxValue={maxRetreatTypeCamperDays}
                    valueLabel={`${formatReportsDecimal(
                      row.camperDays
                    )} days`}
                    helper={`${formatReportsNumber(
                      row.bookings
                    )} booking${
                      row.bookings === 1 ? "" : "s"
                    } · ${formatReportsNumber(
                      row.guests
                    )} guests`}
                  />
                ))}
              </div>
            ) : (
              <div className="reports-empty-state">
                <strong>No retreat usage data</strong>
                <p>
                  No retreat types have usable Camper Day values.
                </p>
              </div>
            )}
          </section>

          <section className="reports-camper-days-insight-card">
            <div className="reports-camper-days-section-heading">
              <div>
                <p className="dashboard-eyebrow">
                  Highest Usage
                </p>

                <h4>
                  <FaClipboardList />
                  Largest Retreats by Camper Days
                </h4>

                <span>
                  Individual bookings producing the greatest overall camp usage.
                </span>
              </div>
            </div>

            {largestCamperDayBookings.length > 0 ? (
              <div className="reports-bar-list">
                {largestCamperDayBookings.map((row) => (
                  <ReportBarRow
                    key={row.id}
                    label={row.groupName}
                    value={row.camperDays}
                    maxValue={maxLargestBookingCamperDays}
                    valueLabel={`${formatReportsDecimal(
                      row.camperDays
                    )} days`}
                    helper={`${row.dateLabel} · ${formatReportsNumber(
                      row.guests
                    )} guests · ${formatReportsNumber(
                      row.nights
                    )} nights · ${formatReportsNumber(
                      row.meals
                    )} meals`}
                  />
                ))}
              </div>
            ) : (
              <div className="reports-empty-state">
                <strong>No Camper Day booking data</strong>
                <p>
                  No individual bookings have usable Camper Day values.
                </p>
              </div>
            )}
          </section>
        </div>
      </article>

      <section className="reports-grid">
        <article className="dashboard-card reports-panel reports-panel-wide">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Trends</p>
              <h3>Monthly Booking Trends</h3>
              <span>
                Bookings, guests, and revenue grouped by arrival month.
              </span>
            </div>
          </div>

          {monthlyRows.length > 0 ? (
            <div className="reports-monthly-grid">
              <div>
                <h4 className="reports-monthly-heading">
                  <FaClipboardList />
                  Bookings by Month
                </h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`bookings-${row.monthKey}`}
                      label={row.label}
                      value={row.bookings}
                      maxValue={maxMonthlyBookings}
                      valueLabel={`${row.bookings} booking${
                        row.bookings === 1 ? "" : "s"
                      }`}
                      helper={`${row.confirmed} confirmed`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h4 className="reports-monthly-heading">
                  <FaUsers />
                  Guests by Month
                </h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`guests-${row.monthKey}`}
                      label={row.label}
                      value={row.guests}
                      maxValue={maxMonthlyGuests}
                      valueLabel={`${formatReportsNumber(row.guests)} guests`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h4 className="reports-monthly-heading">
                  <FaDollarSign />
                  Revenue by Month
                </h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`revenue-${row.monthKey}`}
                      label={row.label}
                      value={row.revenue}
                      maxValue={maxMonthlyRevenue}
                      valueLabel={formatReportsCurrency(row.revenue)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="reports-empty-state">
              <strong>No monthly report data</strong>
              <p>No filtered bookings have usable start dates.</p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Revenue</p>
              <h3>Financial Field Totals</h3>
              <span>
                Stored billing fields from Staff Bookings and imported
                records. Categories can overlap and should not be added
                together.
              </span>
            </div>
          </div>

          <div className="reports-bar-list">
            {revenueBreakdown.map((item) => (
              <ReportBarRow
                key={item.label}
                label={item.label}
                value={item.value}
                maxValue={maxRevenueBreakdown}
                valueLabel={formatReportsCurrency(item.value)}
              />
            ))}
          </div>

          <div className="reports-revenue-confidence">
            <div className="reports-help-heading">
              <h4>Revenue Source Confidence</h4>

              <details className="reports-help-popover">
                <summary aria-label="Explain revenue source confidence">
                  <FaQuestionCircle />
                </summary>

                <div className="reports-help-card">
                  <strong>How projected revenue is chosen</strong>
                  <p>
                    Each booking contributes only one revenue number to
                    Projected Revenue.
                  </p>

                  <ol>
                    <li>
                      <strong>Invoice Total</strong>
                      <span>Highest-confidence stored billing total.</span>
                    </li>
                    <li>
                      <strong>Expected Revenue</strong>
                      <span>
                        Used when an invoice total is not available.
                      </span>
                    </li>
                    <li>
                      <strong>Monthly Projection</strong>
                      <span>Uses imported monthly projected income.</span>
                    </li>
                    <li>
                      <strong>Itemized Fallback</strong>
                      <span>
                        Usage fee + lodging + food + miscellaneous costs.
                      </span>
                    </li>
                    <li>
                      <strong>Missing</strong>
                      <span>
                        No usable stored revenue value was found. Quoted guest
                        rates are not turned into invented revenue.
                      </span>
                    </li>
                  </ol>
                </div>
              </details>
            </div>

            <div className="reports-bar-list">
              {revenueSourceRows.map((row) => (
                <ReportBarRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  maxValue={maxRevenueSourceValue}
                  valueLabel={`${row.count} booking${
                    row.count === 1 ? "" : "s"
                  } · ${formatReportsCurrency(row.value)}`}
                  helper={`${row.confidence} confidence`}
                />
              ))}
            </div>
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Groups</p>
              <h3>Retreat Type Breakdown</h3>
              <span>Which kinds of groups are booking most often.</span>
            </div>
          </div>

          {retreatTypeRows.length > 0 ? (
            <>
              <ReportRetreatTypePieChart
                rows={retreatTypeRows}
                totalBookings={totalBookings}
              />

              <div className="reports-table-wrap">
                <table className="reports-table reports-retreat-table">
                  <thead>
                    <tr>
                      <th>Retreat Type</th>
                      <th>Bookings</th>
                      <th>Guests</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>

                  <tbody>
                    {retreatTypeRows.map((row) => (
                      <tr key={row.label}>
                        <td>
                          <strong>{row.label}</strong>
                          <div className="reports-mini-track">
                            <span
                              style={{
                                width: `${
                                  maxRetreatTypeBookings
                                    ? Math.max(
                                        (row.bookings /
                                          maxRetreatTypeBookings) *
                                          100,
                                        4
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </td>
                        <td>{formatReportsNumber(row.bookings)}</td>
                        <td>{formatReportsNumber(row.guests)}</td>
                        <td>{formatReportsCurrency(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="reports-empty-state">
              <strong>No retreat type data</strong>
              <p>No bookings matched the current report filters.</p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel reports-panel-wide">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Housing</p>
              <h3>Lodging Usage</h3>
              <span>
                Supports current Staff Booking allocations and imported
                housing records with unknown guest counts.
              </span>
            </div>
          </div>

          {housingUsageRows.length > 0 ? (
            <div className="reports-table-wrap">
              <table className="reports-table reports-housing-table">
                <thead>
                  <tr>
                    <th>Lodging</th>
                    <th>Bookings Using</th>
                    <th>Known Assigned Guests</th>
                    <th>Count Unknown</th>
                  </tr>
                </thead>

                <tbody>
                  {housingUsageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{formatReportsNumber(row.bookings)}</td>
                      <td>{formatReportsNumber(row.knownGuests)}</td>
                      <td>
                        {row.unknownCountBookings > 0 ? (
                          <span className="reports-housing-unknown">
                            {row.unknownCountBookings}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="reports-empty-state">
              <strong>No housing data</strong>
              <p>
                No filtered bookings contain recognizable lodging assignments.
              </p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Pipeline</p>
              <h3>Status Breakdown</h3>
              <span>
                Current workflow status across the filtered bookings.
              </span>
            </div>
          </div>

          <div className="reports-bar-list">
            {statusRows.map((row) => (
              <ReportBarRow
                key={row.label}
                label={row.label}
                value={row.count}
                maxValue={maxStatusCount}
                valueLabel={`${row.count} booking${
                  row.count === 1 ? "" : "s"
                }`}
                helper={`${getReportsPercent(
                  row.count,
                  totalBookings
                )}% of report`}
              />
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Sources</p>
              <h3>Input Source Breakdown</h3>
              <span>
                How operational booking records entered the system.
              </span>
            </div>
          </div>

          <div className="reports-bar-list">
            {sourceRows.map((row) => (
              <ReportBarRow
                key={row.label}
                label={row.label}
                value={row.count}
                maxValue={maxSourceCount}
                valueLabel={`${row.count} booking${
                  row.count === 1 ? "" : "s"
                }`}
                helper={`${getReportsPercent(
                  row.count,
                  totalBookings
                )}% of report`}
              />
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel reports-panel-wide">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Data Health</p>
              <h3>Data Quality Report</h3>
              <span>
                Separates missing data from known-but-incomplete imported data.
              </span>
            </div>
          </div>

          <div className="reports-quality-list">
            {dataQualityRows.map((row) => (
              <div className="reports-quality-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <span>
                    {getReportsPercent(row.count, totalBookings)}% of filtered
                    bookings
                  </span>
                </div>

                <em>{row.count}</em>

                <div className="reports-mini-track">
                  <span
                    style={{
                      width: `${
                        maxQualityCount
                          ? Math.max(
                              (row.count / maxQualityCount) * 100,
                              4
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

export default ReportsView;
