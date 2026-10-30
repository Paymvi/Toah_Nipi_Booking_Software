import { useEffect, useMemo, useState } from "react";

import {
  FaCheck,
  FaPlus,
  FaSearch,
  FaTable,
  FaTrashAlt,
  FaUndo,
} from "react-icons/fa";

import { supabase } from "../lib/supabaseClient";

import {
  formatSubmittedDate,
} from "../utils/dateUtils";

import { getConvertedInquiryIds } from "../utils/bookingClassification";

import {
  INQUIRY_HIDDEN_UPLOADED_KEY,
  getSavedHiddenInquiries,
  hideInquiryOnline,
  loadHiddenInquiries,
  saveHiddenInquiries,
  unhideInquiryOnline,
  uploadBrowserHiddenInquiries,
} from "../services/inquiryHidden";


/*
  Inquiry id -> the booking created from it, using the shared
  converted-inquiry rule (src/utils/bookingClassification.js). Converted rows stay in this
  workbook view but open that booking instead of starting another.
*/
function getConvertedBookingsByInquiryId(inquiryBookings) {
  const records = inquiryBookings;
  const convertedInquiryIds =
    getConvertedInquiryIds(inquiryBookings);

  const bookingsByInquiryId = new Map();

  records.forEach((booking) => {
    const sourceInquiryId = String(
      booking.rentalFormDetails?.sourceInquiryId || ""
    ).trim();

    if (
      convertedInquiryIds.has(sourceInquiryId) &&
      !bookingsByInquiryId.has(sourceInquiryId)
    ) {
      bookingsByInquiryId.set(sourceInquiryId, booking);
    }
  });

  return bookingsByInquiryId;
}


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
  openConvertedBooking,
  startBookingFromInquiry,
}) {
  const [yearView, setYearView] =
    useState("all");

  const [searchText, setSearchText] =
    useState("");

  const [deletedInquiries, setDeletedInquiries] =
    useState(() => getSavedHiddenInquiries());

  const [showDeletedInquiries, setShowDeletedInquiries] =
    useState(false);

  /*
    Deleted rows are shared by all staff once the inquiry_hidden table
    exists; until then this browser's list is used (same as Contacts).
  */
  const [hiddenOnline, setHiddenOnline] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    loadHiddenInquiries(supabase).then(async (result) => {
      if (cancelled || !result.available) {
        return;
      }

      let alreadyUploaded;

      try {
        alreadyUploaded =
          localStorage.getItem(INQUIRY_HIDDEN_UPLOADED_KEY) === "true";
      } catch {
        alreadyUploaded = true;
      }

      const browserHidden = getSavedHiddenInquiries();

      if (!alreadyUploaded && browserHidden.length) {
        try {
          await uploadBrowserHiddenInquiries(supabase, browserHidden);
          localStorage.setItem(INQUIRY_HIDDEN_UPLOADED_KEY, "true");
          const reloaded = await loadHiddenInquiries(supabase);
          if (!cancelled && reloaded.available) {
            result = reloaded;
          }
        } catch (error) {
          console.error("Could not copy this browser's deleted inquiry rows online:", error);
        }
      }

      if (!cancelled) {
        setHiddenOnline(true);
        setDeletedInquiries(result.hidden);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hiddenOnline) {
      saveHiddenInquiries(deletedInquiries);
    }
  }, [deletedInquiries, hiddenOnline]);

  const saveHiddenOnline = (action) => {
    if (!hiddenOnline) {
      return;
    }

    action().catch((error) => {
      console.error("Could not save the deleted inquiry change online:", error);
      alert("That change could not be saved for other staff. Reload the Inquiry Spreadsheet and try again.");
    });
  };

  const deletedInquiryIdSet = useMemo(
    () => new Set(deletedInquiries.map((inquiry) => inquiry.id)),
    [deletedInquiries]
  );

  const deleteInquiry = (booking) => {
    const name =
      booking.organizationName || booking.contactName || "this inquiry";

    const confirmed = window.confirm(
      `Remove ${name} from the Inquiry Spreadsheet?\n\n` +
        "This will NOT delete the inquiry record. The row will be saved " +
        "under Deleted so it can be restored later."
    );

    if (!confirmed) {
      return;
    }

    const snapshot = {
      id: String(booking.id || ""),
      organizationName: booking.organizationName || "",
      contactName: booking.contactName || "",
      email: booking.email || "",
      phone: booking.phone || "",
      year: getInquirySpreadsheetYear(booking),
      desiredDatesText: booking.desiredDatesText || "",
      deletedAt: new Date().toISOString(),
    };

    setDeletedInquiries((currentInquiries) => [
      snapshot,
      ...currentInquiries.filter((inquiry) => inquiry.id !== snapshot.id),
    ]);
    saveHiddenOnline(() => hideInquiryOnline(supabase, snapshot));
  };

  const restoreDeletedInquiry = (inquiryId) => {
    setDeletedInquiries((currentInquiries) =>
      currentInquiries.filter((inquiry) => inquiry.id !== inquiryId)
    );
    saveHiddenOnline(() => unhideInquiryOnline(supabase, inquiryId));
  };

  const convertedBookingsByInquiryId =
    useMemo(
      () =>
        getConvertedBookingsByInquiryId(
          inquiryBookings
        ),
      [inquiryBookings]
    );

  const inquirySpreadsheetBookings =
    useMemo(() => {
      return inquiryBookings.filter((booking) =>
        Boolean(
          getInquirySpreadsheetYear(booking)
        ) &&
        !deletedInquiryIdSet.has(
          String(booking.id || "")
        )
      );
    }, [inquiryBookings, deletedInquiryIdSet]);

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

            <button
              className={`contacts-view-deleted-toggle inquiry-spreadsheet-deleted-toggle ${
                showDeletedInquiries ? "active" : ""
              }`}
              type="button"
              onClick={() =>
                setShowDeletedInquiries(
                  (currentValue) => !currentValue
                )
              }
            >
              <FaTrashAlt />
              Deleted ({deletedInquiries.length})
            </button>
          </div>
        </div>


        {showDeletedInquiries && (
          <div className="contacts-view-deleted-panel">
            <div className="contacts-view-deleted-panel-header">
              <div>
                <strong>Deleted Inquiry Rows</strong>
                <p>
                  These rows are hidden from the Inquiry Spreadsheet only.
                  The inquiry records have not been deleted.
                </p>
              </div>

              <button
                className="contacts-view-deleted-close"
                type="button"
                onClick={() => setShowDeletedInquiries(false)}
              >
                Close
              </button>
            </div>

            {deletedInquiries.length > 0 ? (
              <div className="contacts-view-deleted-list">
                {deletedInquiries.map((inquiry) => (
                  <div
                    className="contacts-view-deleted-item"
                    key={inquiry.id}
                  >
                    <div className="contacts-view-deleted-copy">
                      <strong>
                        {inquiry.organizationName || "No group name"}
                      </strong>
                      <span>
                        {inquiry.contactName || "No contact name"}
                      </span>
                      <small>
                        {[inquiry.email, inquiry.phone]
                          .filter(Boolean)
                          .join(" · ") || "No email or phone"}
                      </small>

                      {inquiry.desiredDatesText && (
                        <small>{inquiry.desiredDatesText}</small>
                      )}

                      <small>
                        {inquiry.year ? `${inquiry.year} sheet · ` : ""}
                        Deleted{" "}
                        {inquiry.deletedAt
                          ? new Date(inquiry.deletedAt).toLocaleString()
                          : "previously"}
                      </small>
                    </div>

                    <button
                      className="contacts-view-restore-button"
                      type="button"
                      onClick={() =>
                        restoreDeletedInquiry(inquiry.id)
                      }
                    >
                      <FaUndo />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="contacts-view-deleted-empty">
                No deleted inquiry rows.
              </div>
            )}
          </div>
        )}


        {inquirySpreadsheetBookings.length > 0 ? (
          visibleBookings.length > 0 ? (
            <div className="spreadsheet-table-wrap">
              <table className="spreadsheet-table inquiry-spreadsheet-table">
                <thead>
                  <tr>
                    <th className="inquiry-booking-action-heading">
                      Booking
                    </th>

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
                  {visibleBookings.map((booking) => {
                    const convertedBooking =
                      convertedBookingsByInquiryId.get(
                        String(booking.id || "").trim()
                      );

                    return (
                    <tr key={booking.id}>

                      <td className="inquiry-booking-action-cell">
                        {convertedBooking ? (
                          <button
                            className="inquiry-create-booking-button"
                            type="button"
                            onClick={() =>
                              openConvertedBooking(convertedBooking)
                            }
                            title={`Already booked: open the staff booking for ${booking.organizationName}`}
                          >
                            <FaCheck />
                            <span>Booked</span>
                          </button>
                        ) : (
                          <button
                            className="inquiry-create-booking-button"
                            type="button"
                            onClick={() =>
                              startBookingFromInquiry(booking)
                            }
                            title={`Create booking from ${booking.organizationName}`}
                          >
                            <FaPlus />
                            <span>Book</span>
                          </button>
                        )}

                        <button
                          className="contact-delete-button inquiry-delete-button"
                          type="button"
                          onClick={() => deleteInquiry(booking)}
                          aria-label={`Delete ${booking.organizationName || "inquiry"} row`}
                          title="Delete inquiry row"
                        >
                          <FaTrashAlt />
                        </button>
                      </td>

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
                    );
                  })}
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