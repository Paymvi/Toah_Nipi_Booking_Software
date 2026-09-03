import { useMemo, useState } from "react";

import {
  FaSearch,
  FaTable,
} from "react-icons/fa";

import {
  formatSubmittedDate,
} from "../utils/dateUtils";


function getInquirySpreadsheetYear(booking) {
  const sourceType =
    String(booking.sourceType || "")
      .trim()
      .toLowerCase();

  const detectedImportType =
    String(booking.detectedImportType || "")
      .trim()
      .toLowerCase();

  const sourceSheet =
    String(booking.sourceSheet || "")
      .trim()
      .toLowerCase();

  const searchableSource = [
    sourceType,
    detectedImportType,
    sourceSheet,
  ].join(" ");

  /*
    Explicitly require this to be a Guest Group Inquiry source.
    This prevents Master rows from ever appearing in Spreadsheet 2.
  */
  if (
    !searchableSource.includes("guest group") ||
    !searchableSource.includes("inquir")
  ) {
    return "";
  }

  if (searchableSource.includes("2025")) {
    return "2025";
  }

  if (searchableSource.includes("2026")) {
    return "2026";
  }

  if (searchableSource.includes("2027")) {
    return "2027";
  }

  return "";
}

function getInquiryAddress(booking) {
  if (booking.inquiryAddress) {
    return booking.inquiryAddress;
  }

  const rawData = booking.rawSpreadsheetData;

  if (!rawData || typeof rawData !== "object") {
    return "";
  }

  return (
    rawData["Mailing address"] ||
    rawData["Mailing Address"] ||
    rawData["Address"] ||
    ""
  );
}

function getInquiryDisposition(booking) {
  if (booking.inquiryDisposition) {
    return booking.inquiryDisposition;
  }

  const rawData = booking.rawSpreadsheetData;

  if (rawData && typeof rawData === "object") {
    const rawDisposition =
      rawData["Waitlist, Considering or No"] ||
      rawData["Waitlist or No"];

    if (rawDisposition) {
      return rawDisposition;
    }
  }

  return booking.stageOfGroup || "";
}

function getDisplayValue(value) {
  const text = String(value ?? "").trim();

  if (
    !text ||
    text === "No email provided" ||
    text === "No phone provided"
  ) {
    return "—";
  }

  return text;
}

function getInquirySpreadsheetSearchText(booking) {
  return [
    booking.contactName,
    booking.email,
    booking.phone,
    booking.organizationName,
    booking.attendeeCount,
    booking.desiredDatesText,
    booking.notes,
    getInquiryAddress(booking),
    getInquiryDisposition(booking),
    booking.sourceSheet,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}


const COMMON_COLUMNS = {
  date: {
    label: "Date",
    value: (booking) =>
      booking.submittedAt
        ? formatSubmittedDate(booking.submittedAt)
        : "",
  },

  contactName: {
    label: "Contact Name",
    value: (booking) => booking.contactName,
  },

  email: {
    label: "Email Address",
    value: (booking) => booking.email,
  },

  phone: {
    label: "Phone Number",
    value: (booking) => booking.phone,
  },

  organization: {
    label: "Guest Group Name",

    render: (booking, openBookingDetail) => (
      <button
        className="table-link spreadsheet-organization-button"
        type="button"
        onClick={() => openBookingDetail(booking)}
      >
        {getDisplayValue(booking.organizationName)}
      </button>
    ),
  },

  address: {
    label: "Address",
    value: (booking) => getInquiryAddress(booking),
  },

  size: {
    label: "Size",
    value: (booking) => booking.attendeeCount,
  },

  desiredDates: {
    label: "Desired Dates",
    value: (booking) => booking.desiredDatesText,
    className: "inquiry-spreadsheet-long-cell",
  },

  notes: {
    label: "Additional Notes",
    value: (booking) => booking.notes,
    className: "inquiry-spreadsheet-long-cell",
  },

  disposition: {
    label: "Waitlist / Considering / No",
    value: (booking) => getInquiryDisposition(booking),
  },
};


const INQUIRY_COLUMNS_BY_YEAR = {
  "2025": [
    COMMON_COLUMNS.date,
    COMMON_COLUMNS.contactName,
    COMMON_COLUMNS.email,
    COMMON_COLUMNS.phone,
    COMMON_COLUMNS.organization,
    COMMON_COLUMNS.size,
    COMMON_COLUMNS.desiredDates,
    COMMON_COLUMNS.notes,
    {
      ...COMMON_COLUMNS.disposition,
      label: "Waitlist or No",
    },
  ],

  "2026": [
    COMMON_COLUMNS.date,
    COMMON_COLUMNS.contactName,
    COMMON_COLUMNS.email,
    COMMON_COLUMNS.phone,
    COMMON_COLUMNS.organization,
    {
      ...COMMON_COLUMNS.address,
      label: "Address",
    },
    COMMON_COLUMNS.size,
    COMMON_COLUMNS.desiredDates,
    COMMON_COLUMNS.notes,
    {
      ...COMMON_COLUMNS.disposition,
      label: "Waitlist, Considering or No",
    },
  ],

  "2027": [
    COMMON_COLUMNS.date,
    COMMON_COLUMNS.contactName,
    COMMON_COLUMNS.email,
    COMMON_COLUMNS.phone,
    COMMON_COLUMNS.organization,
    {
      ...COMMON_COLUMNS.address,
      label: "Mailing address",
    },
    COMMON_COLUMNS.size,
    COMMON_COLUMNS.desiredDates,
    COMMON_COLUMNS.notes,
    {
      ...COMMON_COLUMNS.disposition,
      label: "Waitlist, Considering or No",
    },
  ],
};


const ALL_INQUIRY_COLUMNS = [
  {
    label: "Year",
    value: (booking) =>
      getInquirySpreadsheetYear(booking),
  },

  COMMON_COLUMNS.date,
  COMMON_COLUMNS.contactName,
  COMMON_COLUMNS.email,
  COMMON_COLUMNS.phone,
  COMMON_COLUMNS.organization,
  COMMON_COLUMNS.address,
  COMMON_COLUMNS.size,
  COMMON_COLUMNS.desiredDates,
  COMMON_COLUMNS.notes,
  COMMON_COLUMNS.disposition,
];


export default function InquirySpreadsheetView({
  inquiryBookings,
  openBookingDetail,
}) {
  const [yearView, setYearView] =
    useState("all");

  const [searchText, setSearchText] =
    useState("");

  const inquirySpreadsheetBookings =
    useMemo(() => {
      return inquiryBookings.filter((booking) =>
        Boolean(
          getInquirySpreadsheetYear(booking)
        )
      );
    }, [inquiryBookings]);

  const yearCounts = useMemo(() => {
    return inquirySpreadsheetBookings.reduce(
      (counts, booking) => {
        const year =
          getInquirySpreadsheetYear(booking);

        if (year) {
          counts[year] += 1;
        }

        return counts;
      },
      {
        "2025": 0,
        "2026": 0,
        "2027": 0,
      }
    );
  }, [inquirySpreadsheetBookings]);

  const visibleBookings = useMemo(() => {
    const normalizedSearch =
      searchText.trim().toLowerCase();

    return inquirySpreadsheetBookings
      .filter((booking) => {
        const year =
          getInquirySpreadsheetYear(booking);

        if (
          yearView !== "all" &&
          year !== yearView
        ) {
          return false;
        }

        if (
          normalizedSearch &&
          !getInquirySpreadsheetSearchText(
            booking
          ).includes(normalizedSearch)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aYear =
          getInquirySpreadsheetYear(a);

        const bYear =
          getInquirySpreadsheetYear(b);

        /*
          In All view, newest spreadsheet year first.
        */
        if (aYear !== bYear) {
          return bYear.localeCompare(aYear);
        }

        /*
          Within a worksheet, preserve its original row order.
        */
        return (
          Number(a.sourceRowNumber || 0) -
          Number(b.sourceRowNumber || 0)
        );
      });
  }, [
    inquirySpreadsheetBookings,
    yearView,
    searchText,
  ]);

  const visibleColumns =
    yearView === "all"
      ? ALL_INQUIRY_COLUMNS
      : INQUIRY_COLUMNS_BY_YEAR[yearView];

  return (
    <section className="spreadsheet-view-page">
      <article className="dashboard-card spreadsheet-view-card">

        <header className="inquiry-spreadsheet-header">
          <div className="inquiry-spreadsheet-title">
            <span className="section-icon">
              <FaTable />
            </span>

            <div>
              <p className="dashboard-eyebrow">Spreadsheet 2</p>

              <h2>Guest Group Inquiries &amp; No&apos;s</h2>

              <p>
                Historical inquiry, waitlist, considering, and declined group
                records imported from the company workbook.
              </p>
            </div>
          </div>

          <div className="inquiry-spreadsheet-search">
            <FaSearch />

            <input
              type="search"
              value={searchText}
              placeholder="Search inquiries..."
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </header>

        <div className="inquiry-spreadsheet-toolbar">
          <div
            className="inquiry-spreadsheet-year-toggle"
            aria-label="Inquiry spreadsheet year"
          >
            <button
              className={yearView === "all" ? "active" : ""}
              type="button"
              onClick={() => setYearView("all")}
            >
              <span>All</span>
              <em>{inquirySpreadsheetBookings.length}</em>
            </button>

            {["2025", "2026", "2027"].map((year) => (
              <button
                className={yearView === year ? "active" : ""}
                type="button"
                key={year}
                onClick={() => setYearView(year)}
              >
                <span>{year}</span>
                <em>{yearCounts[year]}</em>
              </button>
            ))}
          </div>

          <div className="inquiry-spreadsheet-summary">
            <span>
              <strong>{visibleBookings.length}</strong>
              Showing
            </span>

            <span>
              <strong>{inquirySpreadsheetBookings.length}</strong>
              Total Inquiry Rows
            </span>

            <span>
              <strong>{yearView === "all" ? "All Years" : yearView}</strong>
              Spreadsheet Year
            </span>
          </div>
        </div>


        {inquirySpreadsheetBookings.length > 0 ? (
          visibleBookings.length > 0 ? (
            <div className="spreadsheet-table-wrap">
              <table className="spreadsheet-table inquiry-spreadsheet-table">
                <thead>
                  <tr>
                    {visibleColumns.map(
                      (column, index) => (
                        <th
                          key={`${column.label}-${index}`}
                        >
                          {column.label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {visibleBookings.map((booking) => (
                    <tr key={booking.id}>
                      {visibleColumns.map(
                        (column, index) => {
                          const rawValue =
                            column.value
                              ? column.value(booking)
                              : "";

                          return (
                            <td
                              className={
                                column.className || ""
                              }
                              key={`${booking.id}-${column.label}-${index}`}
                              title={
                                column.render
                                  ? undefined
                                  : getDisplayValue(
                                      rawValue
                                    )
                              }
                            >
                              {column.render
                                ? column.render(
                                    booking,
                                    openBookingDetail
                                  )
                                : getDisplayValue(
                                    rawValue
                                  )}
                            </td>
                          );
                        }
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>
                No inquiry rows match this view
              </strong>

              <p>
                Try clearing the search or
                choosing a different year.
              </p>
            </div>
          )
        ) : (
          <div className="empty-state">
            <strong>
              No Guest Group Inquiry spreadsheets
              imported yet
            </strong>

            <p>
              Use Import Everything to import the
              2025, 2026, and 2027 inquiry sheets.
            </p>
          </div>
        )}

      </article>
    </section>
  );
}