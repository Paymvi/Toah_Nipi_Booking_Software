import { useEffect, useMemo, useState } from "react";
import {
  FaHome,
  FaBuilding,
  FaUsers,
  FaCalendarAlt,
  FaClipboardList,
  FaPlus,
  FaChartBar,
  FaCog,
  FaUserShield,
  FaTable,
  FaSyncAlt,
} from "react-icons/fa";


const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const sidebarSections = [
  {
    label: "Contacts",
    items: [
      { label: "Organizations", icon: FaBuilding },
      { label: "Individuals", icon: FaUsers },
    ],
  },
  {
    label: "Rentals & Events",
    items: [
      { label: "Calendar View", icon: FaCalendarAlt },
      { label: "Booking Inquiries", icon: FaClipboardList, hasBadge: true },
      { label: "Add New Booking", icon: FaPlus },
    ],
  },
  {
    label: "Reporting",
    items: [{ label: "Reports", icon: FaChartBar }],
  },
  {
    label: "Administration",
    items: [
      { label: "Setup", icon: FaCog },
      { label: "User Administration", icon: FaUserShield },
      { label: "Custom Fields", icon: FaTable },
    ],
  },
];

function getSavedInquiries() {
  try {
    const savedInquiries = localStorage.getItem("toahNipiPublicInquiries");

    if (!savedInquiries) {
      return [];
    }

    const parsedInquiries = JSON.parse(savedInquiries);

    return Array.isArray(parsedInquiries) ? parsedInquiries : [];
  } catch (error) {
    console.error("Could not read booking inquiries:", error);
    return [];
  }
}

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubmittedDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(startDate, endDate) {
  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  if (startDate) {
    return formatDate(startDate);
  }

  if (endDate) {
    return `Ends ${formatDate(endDate)}`;
  }

  return "No dates selected";
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getCalendarCells(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function inquiryTouchesDay(inquiry, year, monthIndex, day) {
  if (!inquiry.startDate) {
    return false;
  }

  const currentDate = new Date(year, monthIndex, day);
  const startDate = new Date(`${inquiry.startDate}T00:00:00`);
  const endDate = inquiry.endDate
    ? new Date(`${inquiry.endDate}T00:00:00`)
    : startDate;

  return currentDate >= startDate && currentDate <= endDate;
}

function normalizeInquiry(inquiry, index) {
  const organizationName =
    inquiry.organizationName ||
    inquiry.churchOrMinistry ||
    "Unnamed Organization";

  const contactName =
    `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
    inquiry.name ||
    "No contact name";

  return {
    id: inquiry.id || `${inquiry.submittedAt || "inquiry"}-${index}`,
    organizationName,
    contactName,
    email: inquiry.email || "No email provided",
    phone: inquiry.phone || "No phone provided",
    startDate: inquiry.startDate || "",
    endDate: inquiry.endDate || "",
    status: inquiry.status || "Inquiry",
    attendeeCount: inquiry.attendeeCount || inquiry.groupSize || "",
    retreatType: inquiry.retreatType || "",
    promoCode: inquiry.promoCode || "",
    notes: inquiry.notes || inquiry.message || "",
    submittedAt: inquiry.submittedAt || "",
  };
}

export default function Dashboard() {
  const today = new Date();

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [publicInquiries, setPublicInquiries] = useState(() =>
    getSavedInquiries()
  );

  const refreshInquiries = () => {
    setPublicInquiries(getSavedInquiries());
  };

  useEffect(() => {
    const handleStorageChange = () => {
      refreshInquiries();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const inquiryBookings = useMemo(() => {
    return publicInquiries.map((inquiry, index) =>
      normalizeInquiry(inquiry, index)
    );
  }, [publicInquiries]);

  const calendarCells = getCalendarCells(selectedYear, selectedMonth);

  const datedInquiries = useMemo(() => {
    return inquiryBookings
      .filter((inquiry) => inquiry.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [inquiryBookings]);

  const recentInquiries = inquiryBookings.slice(0, 5);

  const inquiriesMissingDates = inquiryBookings.filter(
    (inquiry) => !inquiry.startDate
  );

  const inquiriesWithPromoCodes = inquiryBookings.filter(
    (inquiry) => inquiry.promoCode.trim() !== ""
  );

  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((current) => current - 1);
      return;
    }

    setSelectedMonth((current) => current - 1);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((current) => current + 1);
      return;
    }

    setSelectedMonth((current) => current + 1);
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
  };

  const getCalendarEventColor = (status) => {
    if (status === "Confirmed") return "calendar-event-green";
    if (status === "Contract Sent") return "calendar-event-blue";
    if (status === "Inquiry") return "calendar-event-gold";

    return "calendar-event-purple";
  };

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-logo">
          <span>TN</span>

          <div>
            <strong>Toah Nipi</strong>
            <small>Staff Dashboard</small>
          </div>
        </div>

        <button className="sidebar-active-button">
          <FaHome />
          Dashboard
        </button>

        {sidebarSections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;

              return (
                <button className="sidebar-link" key={item.label}>
                  <Icon />
                  <span>{item.label}</span>

                  {item.hasBadge && inquiryBookings.length > 0 && (
                    <strong className="sidebar-badge">
                      {inquiryBookings.length}
                    </strong>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <p className="dashboard-eyebrow">Internal Booking Software</p>
            <h1>Dashboard</h1>
          </div>

          <button
            className="primary-dashboard-button"
            type="button"
            onClick={refreshInquiries}
          >
            <FaSyncAlt />
            Refresh Inquiries
          </button>
        </header>

        <section className="dashboard-stats-grid">
          <article className="dashboard-stat-card">
            <span>Total Inquiries</span>
            <strong>{inquiryBookings.length}</strong>
            <p>Submitted through the form</p>
          </article>

          <article className="dashboard-stat-card">
            <span>Calendar Entries</span>
            <strong>{datedInquiries.length}</strong>
            <p>Inquiries with a start date</p>
          </article>

          <article className="dashboard-stat-card">
            <span>Missing Dates</span>
            <strong>{inquiriesMissingDates.length}</strong>
            <p>Need staff follow-up</p>
          </article>

          <article className="dashboard-stat-card">
            <span>Promo Codes</span>
            <strong>{inquiriesWithPromoCodes.length}</strong>
            <p>Submissions with a promo code</p>
          </article>
        </section>

        <section className="dashboard-card tasks-card">
          <div className="dashboard-card-header">
            <div>
              <h2>Submitted Booking Inquiries</h2>
              <p>
                These are only the inquiries submitted through the public form.
              </p>
            </div>
          </div>

          {inquiryBookings.length > 0 ? (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Dates</th>
                    <th>Group Size</th>
                    <th>Retreat Type</th>
                    <th>Promo Code</th>
                    <th>Submitted</th>
                  </tr>
                </thead>

                <tbody>
                  {inquiryBookings.map((inquiry) => (
                    <tr key={inquiry.id}>
                      <td>
                        <button className="table-link">
                          {inquiry.organizationName}
                        </button>
                      </td>
                      <td>{inquiry.contactName}</td>
                      <td>{inquiry.email}</td>
                      <td>{inquiry.phone}</td>
                      <td>
                        {formatDateRange(inquiry.startDate, inquiry.endDate)}
                      </td>
                      <td>{inquiry.attendeeCount || "—"}</td>
                      <td>{inquiry.retreatType || "—"}</td>
                      <td>{inquiry.promoCode || "—"}</td>
                      <td>{formatSubmittedDate(inquiry.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No inquiries yet</strong>
              <p>
                Submit the public form first, then return to this dashboard.
              </p>
            </div>
          )}
        </section>

        <section className="dashboard-lower-grid">
          <article className="dashboard-card calendar-card">
            <div className="dashboard-card-header">
              <div>
                <h2>Groups At a Glance</h2>
                <p>
                  Calendar view based only on inquiries that have selected
                  dates.
                </p>
              </div>

              <button
                className="secondary-dashboard-button"
                type="button"
                onClick={goToCurrentMonth}
              >
                This Month
              </button>
            </div>

            <div className="calendar-controls">
              <button type="button" onClick={goToPreviousMonth}>
                «
              </button>

              <select
                value={selectedMonth}
                onChange={(event) =>
                  setSelectedMonth(Number(event.target.value))
                }
              >
                {monthNames.map((month, index) => (
                  <option value={index} key={month}>
                    {month}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(event) =>
                  setSelectedYear(Number(event.target.value))
                }
              >
                {[2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                  <option value={year} key={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button type="button" onClick={goToNextMonth}>
                »
              </button>
            </div>

            <div className="calendar-grid">
              {["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((day) => (
                <div className="calendar-weekday" key={day}>
                  {day}
                </div>
              ))}

              {calendarCells.map((day, index) => {
                const inquiriesForDay = day
                  ? datedInquiries.filter((inquiry) =>
                      inquiryTouchesDay(
                        inquiry,
                        selectedYear,
                        selectedMonth,
                        day
                      )
                    )
                  : [];

                return (
                  <div
                    className={`calendar-cell ${
                      !day ? "calendar-cell-empty" : ""
                    }`}
                    key={`${day}-${index}`}
                  >
                    {day && <span className="calendar-day-number">{day}</span>}

                    <div className="calendar-events">
                      {inquiriesForDay.slice(0, 2).map((inquiry) => (
                        <div
                          className={`calendar-event ${getCalendarEventColor(inquiry.status)}`}
                          key={inquiry.id}
                          title={`${inquiry.organizationName} — ${inquiry.status}`}
                        >
                          <span>{inquiry.organizationName}</span>
                          <i />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="calendar-legend">
              <span>
                <i className="legend-dot legend-confirmed"></i>
                Confirmed
              </span>

              <span>
                <i className="legend-dot legend-contract"></i>
                Contract Sent
              </span>

              <span>
                <i className="legend-dot legend-inquiry"></i>
                Inquiry
              </span>
            </div>


          </article>

          <div className="dashboard-side-stack">
            <article className="dashboard-card">
              <div className="dashboard-card-header">
                <div>
                  <h2>Dated Inquiries</h2>
                  <p>Submissions with start dates, sorted by date.</p>
                </div>
              </div>

              {datedInquiries.length > 0 ? (
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table compact-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Dates</th>
                        <th>Type</th>
                      </tr>
                    </thead>

                    <tbody>
                      {datedInquiries.map((inquiry) => (
                        <tr key={inquiry.id}>
                          <td>
                            <button className="table-link">
                              {inquiry.organizationName}
                            </button>
                          </td>
                          <td>
                            {formatDateRange(
                              inquiry.startDate,
                              inquiry.endDate
                            )}
                          </td>
                          <td>{inquiry.retreatType || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No dated inquiries yet</strong>
                  <p>
                    Inquiries will appear here once the form includes a start
                    date.
                  </p>
                </div>
              )}
            </article>

            <article className="dashboard-card">
              <div className="dashboard-card-header">
                <div>
                  <h2>Recent Booking Inquiries</h2>
                  <p>Newest submissions from the public form.</p>
                </div>
              </div>

              {recentInquiries.length > 0 ? (
                <div className="inquiry-list">
                  {recentInquiries.map((inquiry) => (
                    <div className="inquiry-card" key={inquiry.id}>
                      <div>
                        <strong>{inquiry.organizationName}</strong>
                        <span>{inquiry.contactName}</span>
                      </div>

                      <p>
                        {inquiry.retreatType || "Retreat type not selected"} ·{" "}
                        {inquiry.attendeeCount || "No group size yet"}
                      </p>

                      <small>
                        {formatDateRange(inquiry.startDate, inquiry.endDate)}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No public inquiries yet</strong>
                  <p>
                    Once someone submits the public form, their inquiry will
                    appear here.
                  </p>
                </div>
              )}
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}