import { useEffect, useMemo, useState } from "react";
import {
  FaChartBar,
  FaClipboardList,
  FaDollarSign,
  FaExclamationTriangle,
  FaRegCalendarCheck,
  FaTable,
  FaUsers,
  FaClock,
  FaQuestionCircle,
} from "react-icons/fa";

import {
  REPORTS_VIEW_SETTINGS_STORAGE_KEY,
  DEFAULT_REPORTS_VIEW_SETTINGS,
  reportsDateRangeOptions,
} from "../constants/dashboardConstants";

import { getLocalDate } from "../utils/dateUtils";

function formatDateForInput(date) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isBlankBookingValue(value) {
  const text = String(value || "").trim().toLowerCase();

  return (
    !text ||
    text === "n/a" ||
    text === "na" ||
    text === "—" ||
    text === "no email provided" ||
    text === "no phone provided" ||
    text === "no contact name" ||
    text === "unnamed organization" ||
    text === "unnamed group" ||
    text === "unassigned"
  );
}


function getBookingInputMethod(booking) {
  const sourceType = String(booking.sourceType || "Form").trim();
  const detectedImportType = String(booking.detectedImportType || "").trim();

  if (!sourceType || sourceType === "Form") {
    return "Public Form";
  }

  if (sourceType === "2027 Inquiry") {
    return "Imported - 2027 Inquiry";
  }

  if (sourceType === "Master 2026") {
    return "Imported - Master 2026";
  }

  if (sourceType === "Master") {
    return "Imported - Master";
  }

  if (detectedImportType) {
    return `Imported - ${detectedImportType}`;
  }

  return `Imported - ${sourceType}`;
}

function getSavedReportsViewSettings() {
  try {
    const savedSettings = localStorage.getItem(REPORTS_VIEW_SETTINGS_STORAGE_KEY);

    if (!savedSettings) {
      return DEFAULT_REPORTS_VIEW_SETTINGS;
    }

    return {
      ...DEFAULT_REPORTS_VIEW_SETTINGS,
      ...JSON.parse(savedSettings),
    };
  } catch (error) {
    console.error("Could not read reports settings:", error);
    return DEFAULT_REPORTS_VIEW_SETTINGS;
  }
}

function saveReportsViewSettings(settings) {
  try {
    localStorage.setItem(REPORTS_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save reports settings:", error);
  }
}

function getReportsDateRange(settings) {
  const today = getLocalDate(formatDateForInput(new Date()));
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  if (settings.dateRange === "allTime") {
    return {
      startDate: null,
      endDate: null,
      label: "All Time",
    };
  }

  if (settings.dateRange === "thisMonth") {
    return {
      startDate: new Date(currentYear, currentMonth, 1),
      endDate: new Date(currentYear, currentMonth + 1, 0),
      label: "This Month",
    };
  }

  if (settings.dateRange === "nextMonth") {
    return {
      startDate: new Date(currentYear, currentMonth + 1, 1),
      endDate: new Date(currentYear, currentMonth + 2, 0),
      label: "Next Month",
    };
  }

  if (settings.dateRange === "nextYear") {
    return {
      startDate: new Date(currentYear + 1, 0, 1),
      endDate: new Date(currentYear + 1, 11, 31),
      label: `${currentYear + 1}`,
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

    return {
      startDate,
      endDate,
      label: "Custom Date Range",
    };
  }

  return {
    startDate: new Date(currentYear, 0, 1),
    endDate: new Date(currentYear, 11, 31),
    label: `${currentYear}`,
  };
}

function bookingTouchesReportsDateRange(booking, dateRange) {
  if (!dateRange.startDate && !dateRange.endDate) {
    return true;
  }

  const bookingStartDate = getLocalDate(booking.startDate);

  if (!bookingStartDate) {
    return false;
  }

  const bookingEndDate = booking.endDate
    ? getLocalDate(booking.endDate)
    : bookingStartDate;

  if (dateRange.startDate && dateRange.endDate) {
    return bookingStartDate <= dateRange.endDate && bookingEndDate >= dateRange.startDate;
  }

  if (dateRange.startDate) {
    return bookingEndDate >= dateRange.startDate;
  }

  return bookingStartDate <= dateRange.endDate;
}

function getReportsNumber(value) {
  const text = String(value || "").replace(/[$,]/g, "").trim();
  const match = text.match(/-?\d+(\.\d+)?/);

  if (!match) {
    return 0;
  }

  const number = Number(match[0]);

  return Number.isFinite(number) ? number : 0;
}

function getReportsGuestCount(booking) {
  return getReportsNumber(
    booking.attendeeCount || booking.groupSize || booking.persons
  );
}

function getReportsRevenueDetails(booking) {
  const invoiceTotal = getReportsNumber(booking.invoiceLodgingMeals);
  const expectedMinimumRevenue = getReportsNumber(booking.expectedMinimumRevenue);
  const monthlyProjectedIncome = getReportsNumber(booking.monthlyProjectedIncome);

  const itemizedTotal =
    getReportsNumber(booking.usageFee) +
    getReportsNumber(booking.lodgingCost) +
    getReportsNumber(booking.foodCost) +
    getReportsNumber(booking.miscCost);

  if (invoiceTotal) {
    return {
      value: invoiceTotal,
      source: "Invoice Total",
      confidence: "high",
    };
  }

  if (expectedMinimumRevenue) {
    return {
      value: expectedMinimumRevenue,
      source: "Expected Minimum",
      confidence: "medium",
    };
  }

  if (monthlyProjectedIncome) {
    return {
      value: monthlyProjectedIncome,
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

  return {
    value: 0,
    source: "Missing",
    confidence: "missing",
  };
}


function getReportsRevenue(booking) {
  return getReportsRevenueDetails(booking).value;
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

function getReportsPercent(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function getReportsMonthKey(booking) {
  const date = getLocalDate(booking.startDate);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function formatReportsMonthLabel(monthKey) {
  if (!monthKey) {
    return "No Month";
  }

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

function getReportsSourceLabel(booking) {
  return getBookingInputMethod(booking);
}

function downloadReportsCsv(filename, sections) {
  const rows = [];

  sections.forEach((section) => {
    rows.push([section.title]);
    rows.push(section.headers);

    section.rows.forEach((row) => {
      rows.push(row);
    });

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

function ReportSummaryCard({ icon: Icon, label, value, helper, tone = "default" }) {
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
    maxValue > 0 && value > 0 ? Math.max((value / maxValue) * 100, 4) : 0;

  return (
    <div className="reports-bar-row">
      <div className="reports-bar-row-top">
        <strong>{label}</strong>
        <span>{valueLabel || formatReportsNumber(value)}</span>
      </div>

      <div className="reports-bar-track">
        <span style={{ width: `${width}%` }}></span>
      </div>

      {helper && <small>{helper}</small>}
    </div>
  );
}

function ReportsView({ inquiryBookings }) {
  const [reportsSettings, setReportsSettings] = useState(() =>
    getSavedReportsViewSettings()
  );

  useEffect(() => {
    saveReportsViewSettings(reportsSettings);
  }, [reportsSettings]);

  const updateReportsSettings = (updates) => {
    setReportsSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
    }));
  };

  const reportDateRange = useMemo(
    () => getReportsDateRange(reportsSettings),
    [reportsSettings]
  );

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(inquiryBookings.map((booking) => booking.status).filter(Boolean))
      ).sort(),
    [inquiryBookings]
  );

  const retreatTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(inquiryBookings.map((booking) => getReportsRetreatType(booking)))
      ).sort(),
    [inquiryBookings]
  );

  const filteredReportBookings = useMemo(() => {
    return inquiryBookings.filter((booking) => {
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

      if (reportsSettings.sourceMode === "forms") {
        const inputMethod = getReportsSourceLabel(booking).toLowerCase();

        if (!inputMethod.includes("form")) {
          return false;
        }
      }

      if (reportsSettings.sourceMode === "imports") {
        const inputMethod = getReportsSourceLabel(booking).toLowerCase();

        if (inputMethod.includes("form")) {
          return false;
        }
      }

      return bookingTouchesReportsDateRange(booking, reportDateRange);
    });
  }, [inquiryBookings, reportsSettings, reportDateRange]);

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

  const totalCamperDays = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsNumber(booking.camperDays),
    0
  );

  const projectedRevenue = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsRevenue(booking),
    0
  );

  const depositsReceived = filteredReportBookings.reduce(
    (sum, booking) => sum + getReportsNumber(booking.depositReceived),
    0
  );

  const revenueSourceRows = useMemo(() => {
    const sourceMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const revenueDetails = getReportsRevenueDetails(booking);

      if (!sourceMap.has(revenueDetails.source)) {
        sourceMap.set(revenueDetails.source, {
          label: revenueDetails.source,
          count: 0,
          value: 0,
          confidence: revenueDetails.confidence,
        });
      }

      const row = sourceMap.get(revenueDetails.source);

      row.count += 1;
      row.value += revenueDetails.value;
    });

    const confidenceOrder = {
      high: 1,
      medium: 2,
      low: 3,
      missing: 4,
    };

    return Array.from(sourceMap.values()).sort(
      (a, b) =>
        confidenceOrder[a.confidence] - confidenceOrder[b.confidence] ||
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

      if (!monthKey) {
        return;
      }

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          label: formatReportsMonthLabel(monthKey),
          bookings: 0,
          confirmed: 0,
          guests: 0,
          revenue: 0,
        });
      }

      const row = monthMap.get(monthKey);

      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
      row.revenue += getReportsRevenue(booking);

      if (String(booking.status || "").toLowerCase().includes("confirm")) {
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

  const maxMonthlyGuests = Math.max(0, ...monthlyRows.map((row) => row.guests));

  const maxMonthlyRevenue = Math.max(
    0,
    ...monthlyRows.map((row) => row.revenue)
  );

  const revenueBreakdown = [
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
      label: "Expected Minimum Revenue",
      value: filteredReportBookings.reduce(
        (sum, booking) => sum + getReportsNumber(booking.expectedMinimumRevenue),
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
    const retreatTypeMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const retreatType = getReportsRetreatType(booking);

      if (!retreatTypeMap.has(retreatType)) {
        retreatTypeMap.set(retreatType, {
          label: retreatType,
          bookings: 0,
          guests: 0,
          revenue: 0,
        });
      }

      const row = retreatTypeMap.get(retreatType);

      row.bookings += 1;
      row.guests += getReportsGuestCount(booking);
      row.revenue += getReportsRevenue(booking);
    });

    return Array.from(retreatTypeMap.values()).sort(
      (a, b) => b.bookings - a.bookings
    );
  }, [filteredReportBookings]);

  const maxRetreatTypeBookings = Math.max(
    0,
    ...retreatTypeRows.map((row) => row.bookings)
  );

  const statusRows = useMemo(() => {
    const statusMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const status = String(booking.status || "No Status").trim();

      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });

    return Array.from(statusMap.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReportBookings]);

  const maxStatusCount = Math.max(0, ...statusRows.map((row) => row.count));

  const sourceRows = useMemo(() => {
    const sourceMap = new Map();

    filteredReportBookings.forEach((booking) => {
      const source = getReportsSourceLabel(booking);

      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });

    return Array.from(sourceMap.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReportBookings]);

  const maxSourceCount = Math.max(0, ...sourceRows.map((row) => row.count));

  const dataQualityRows = [
    {
      label: "Missing Dates",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.startDate)
      ).length,
    },
    {
      label: "Missing Email + Phone",
      count: filteredReportBookings.filter(
        (booking) =>
          isBlankBookingValue(booking.email) && isBlankBookingValue(booking.phone)
      ).length,
    },
    {
      label: "Missing Guest Count",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.attendeeCount)
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
        (booking) =>
          isBlankBookingValue(booking.roomName) &&
          isBlankBookingValue(booking.buildingsRooms)
      ).length,
    },
    {
      label: "Missing Deposit Received",
      count: filteredReportBookings.filter((booking) =>
        isBlankBookingValue(booking.depositReceived)
      ).length,
    },
  ];

  const maxQualityCount = Math.max(0, ...dataQualityRows.map((row) => row.count));

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
          ["Total Camper Days", totalCamperDays],
          ["Projected Revenue", projectedRevenue],
          ["Deposits Received", depositsReceived],
        ],
      },
      {
        title: "Monthly Trends",
        headers: ["Month", "Bookings", "Confirmed", "Guests", "Revenue"],
        rows: monthlyRows.map((row) => [
          row.label,
          row.bookings,
          row.confirmed,
          row.guests,
          row.revenue,
        ]),
      },
      {
        title: "Revenue Breakdown",
        headers: ["Category", "Value"],
        rows: revenueBreakdown.map((item) => [item.label, item.value]),
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
                High-level booking, revenue, group type, source, and data quality
                insights across the selected report range.
              </p>
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
                updateReportsSettings({ dateRange: event.target.value })
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
                  value={reportsSettings.customStartDate}
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
                  value={reportsSettings.customEndDate}
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
                updateReportsSettings({ status: event.target.value })
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
                updateReportsSettings({ retreatType: event.target.value })
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
                updateReportsSettings({ sourceMode: event.target.value })
              }
            >
              <option value="all">Forms + Imports</option>
              <option value="forms">Forms Only</option>
              <option value="imports">Imports Only</option>
            </select>
          </label>

          <button
            className="secondary-dashboard-button reports-reset-button"
            type="button"
            onClick={() => updateReportsSettings(DEFAULT_REPORTS_VIEW_SETTINGS)}
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
          helper={`${getReportsPercent(confirmedBookings.length, totalBookings)}% of filtered rows`}
          tone="green"
        />

        <ReportSummaryCard
          icon={FaUsers}
          label="Total Guests"
          value={formatReportsNumber(totalGuests)}
          helper="Based on guest count fields"
          tone="blue"
        />

        <ReportSummaryCard
          icon={FaDollarSign}
          label="Projected Revenue"
          value={formatReportsCurrency(projectedRevenue)}
          helper="Invoice, expected, monthly, or itemized values"
          tone="gold"
        />

        <ReportSummaryCard
          icon={FaClock}
          label="Waitlist"
          value={formatReportsNumber(waitlistBookings.length)}
          helper={`${getReportsPercent(waitlistBookings.length, totalBookings)}% of filtered rows`}
          tone="teal"
        />

        <ReportSummaryCard
          icon={FaExclamationTriangle}
          label="Cancelled"
          value={formatReportsNumber(cancelledBookings.length)}
          helper={`${getReportsPercent(cancelledBookings.length, totalBookings)}% of filtered rows`}
          tone="red"
        />
      </section>

      <section className="reports-grid">
        <article className="dashboard-card reports-panel reports-panel-wide">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Trends</p>
              <h3>Monthly Booking Trends</h3>
              <span>Bookings, guests, and revenue grouped by arrival month.</span>
            </div>
          </div>

          {monthlyRows.length > 0 ? (
            <div className="reports-monthly-grid">
              <div>
                <h4>Bookings by Month</h4>

                <div className="reports-bar-list">
                  {monthlyRows.map((row) => (
                    <ReportBarRow
                      key={`bookings-${row.monthKey}`}
                      label={row.label}
                      value={row.bookings}
                      maxValue={maxMonthlyBookings}
                      valueLabel={`${row.bookings} booking${row.bookings === 1 ? "" : "s"}`}
                      helper={`${row.confirmed} confirmed`}
                    />
                  ))}
                </div>



              </div>

              <div>
                <h4>Guests by Month</h4>

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
                <h4>Revenue by Month</h4>

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
              <p>
                This usually means no filtered bookings have usable start dates.
              </p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Revenue</p>
              <h3>Financial Breakdown</h3>
              <span>Totals from billing-related spreadsheet fields.</span>
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
                  <strong>How revenue confidence works</strong>

                  <p>
                    Each booking is counted once. The report checks revenue fields in
                    order and uses the first usable value it finds, so the same booking
                    is not double-counted.
                  </p>

                  <ol>
                    <li>
                      <strong>Invoice Total</strong>
                      <span>
                        Uses <code>invoiceLodgingMeals</code>. This is highest
                        confidence because it is closest to an actual billing total.
                      </span>
                    </li>

                    <li>
                      <strong>Expected Minimum</strong>
                      <span>
                        Used when there is no invoice total. It comes from{" "}
                        <code>expectedMinimumRevenue</code>, so it is useful but still
                        more of an estimate.
                      </span>
                    </li>

                    <li>
                      <strong>Monthly Projection</strong>
                      <span>
                        Used when invoice and expected minimum are both missing. It
                        comes from <code>monthlyProjectedIncome</code>.
                      </span>
                    </li>

                    <li>
                      <strong>Itemized Fallback</strong>
                      <span>
                        Used when the main revenue fields are missing. It adds{" "}
                        <code>usageFee</code> + <code>lodgingCost</code> +{" "}
                        <code>foodCost</code> + <code>miscCost</code>.
                      </span>
                    </li>

                    <li>
                      <strong>Missing</strong>
                      <span>
                        No usable revenue value was found, so the booking counts as a
                        row but adds <code>$0</code> to projected revenue.
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
                  valueLabel={`${row.count} row${
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
            <div className="reports-table-wrap">
              <table className="reports-table">
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
                                      (row.bookings / maxRetreatTypeBookings) * 100,
                                      4
                                    )
                                  : 0
                              }%`,
                            }}
                          ></span>
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
          ) : (
            <div className="reports-empty-state">
              <strong>No retreat type data</strong>
              <p>No rows matched the current report filters.</p>
            </div>
          )}
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Pipeline</p>
              <h3>Status Breakdown</h3>
              <span>High-level workflow totals, not individual cards.</span>
            </div>
          </div>

          <div className="reports-bar-list">
            {statusRows.map((row) => (
              <ReportBarRow
                key={row.label}
                label={row.label}
                value={row.count}
                maxValue={maxStatusCount}
                valueLabel={`${row.count} row${row.count === 1 ? "" : "s"}`}
                helper={`${getReportsPercent(row.count, totalBookings)}% of report`}
              />
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Data Health</p>
              <h3>Data Quality Report</h3>
              <span>Missing information that may need cleanup.</span>
            </div>
          </div>

          <div className="reports-quality-list">
            {dataQualityRows.map((row) => (
              <div className="reports-quality-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <span>
                    {getReportsPercent(row.count, totalBookings)}% of filtered rows
                  </span>
                </div>

                <em>{row.count}</em>

                <div className="reports-mini-track">
                  <span
                    style={{
                      width: `${
                        maxQualityCount
                          ? Math.max((row.count / maxQualityCount) * 100, 4)
                          : 0
                      }%`,
                    }}
                  ></span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-card reports-panel">
          <div className="reports-panel-header">
            <div>
              <p className="dashboard-eyebrow">Sources</p>
              <h3>Input Source Breakdown</h3>
              <span>How booking rows entered the system.</span>
            </div>
          </div>

          <div className="reports-bar-list">
            {sourceRows.map((row) => (
              <ReportBarRow
                key={row.label}
                label={row.label}
                value={row.count}
                maxValue={maxSourceCount}
                valueLabel={`${row.count} row${row.count === 1 ? "" : "s"}`}
                helper={`${getReportsPercent(row.count, totalBookings)}% of report`}
              />
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

export default ReportsView;