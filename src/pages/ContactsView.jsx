import { useEffect, useMemo, useState } from "react";
import { FaRegStar, FaStar, FaTrashAlt, FaUndo, FaUsers } from "react-icons/fa";

import {
  CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
  CONTACTS_VIEW_STARRED_STORAGE_KEY,
  CONTACTS_VIEW_NAME_SORT_STORAGE_KEY,
} from "../constants/dashboardConstants";

const CONTACTS_RENDER_LOADING_MS = 140;
const CONTACTS_VIEW_DELETED_STORAGE_KEY =
  "toahNipiContactsViewDeletedContacts";

function getSavedContactIdList(storageKey) {
  try {
    const savedValue = localStorage.getItem(storageKey);

    if (!savedValue) {
      return [];
    }

    const parsedValue = JSON.parse(savedValue);

    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error("Could not read saved contact preferences:", error);
    return [];
  }
}

function saveContactIdList(storageKey, contactIds) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(contactIds));
  } catch (error) {
    console.error("Could not save contact preferences:", error);
  }
}

function getSavedDeletedContacts() {
  try {
    const savedValue = localStorage.getItem(
      CONTACTS_VIEW_DELETED_STORAGE_KEY
    );
    if (!savedValue) {
      return [];
    }
    const parsedValue = JSON.parse(savedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error("Could not read deleted contacts:", error);
    return [];
  }
}

function saveDeletedContacts(deletedContacts) {
  try {
    localStorage.setItem(
      CONTACTS_VIEW_DELETED_STORAGE_KEY,
      JSON.stringify(deletedContacts)
    );
  } catch (error) {
    console.error("Could not save deleted contacts:", error);
  }
}

function getSavedContactsBoolean(storageKey, fallbackValue = true) {
  try {
    const savedValue = localStorage.getItem(storageKey);

    if (savedValue === null) {
      return fallbackValue;
    }

    return savedValue === "true";
  } catch (error) {
    console.error("Could not read saved contact setting:", error);
    return fallbackValue;
  }
}

function saveContactsBoolean(storageKey, value) {
  try {
    localStorage.setItem(storageKey, String(value));
  } catch (error) {
    console.error("Could not save contact setting:", error);
  }
}

function getContactsFromBookings(bookings) {
  const contactMap = new Map();

  bookings.forEach((booking) => {
    const contactName = String(
      booking.contactName || booking.name || ""
    ).trim();

    const organizationName = String(
      booking.organizationName || "No organization"
    ).trim();

    const emailValue = String(booking.email || "").trim();
    const phoneValue = String(booking.phone || "").trim();

    const email =
      emailValue && emailValue !== "No email provided" ? emailValue : "";

    const phone =
      phoneValue && phoneValue !== "No phone provided" ? phoneValue : "";

    if (!contactName && !email && !phone && !organizationName) {
      return;
    }

    const contactKey =
      email.toLowerCase() ||
      phone ||
      `${contactName.toLowerCase()}-${organizationName.toLowerCase()}`;

    if (!contactMap.has(contactKey)) {
      contactMap.set(contactKey, {
        id: contactKey,
        contactName: contactName || "No contact name",
        organizationName: organizationName || "No organization",
        email,
        phone,
        bookings: [],
      });
    }

    contactMap.get(contactKey).bookings.push(booking);
  });

  return Array.from(contactMap.values()).sort((a, b) =>
    a.contactName.localeCompare(b.contactName)
  );
}

function getLastName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/);

  if (parts.length <= 1) {
    return parts[0] || "";
  }

  return parts[parts.length - 1];
}

async function copyTextToClipboard(text) {
  const textToCopy = String(text ?? "").trim();

  if (!textToCopy) {
    return;
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(textToCopy);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = textToCopy;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "-9999px";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function ContactsViewLoadingScreen({ bookingRowCount }) {
  return (
    <section className="contacts-view-page">
      <article className="dashboard-card contacts-view-card contacts-loading-card">
        <div className="contacts-loading-hero">
          <span className="contacts-loading-icon">
            <FaUsers />
          </span>

          <div className="contacts-loading-copy">
            <p className="dashboard-eyebrow">Contacts View</p>
            <h2>Loading Contacts</h2>
            <p>
              Preparing contacts from {bookingRowCount} booking row
              {bookingRowCount === 1 ? "" : "s"}, starred contacts, and copy
              actions.
            </p>
          </div>

          <span className="contacts-loading-spinner" aria-hidden="true" />
        </div>

        <div className="contacts-loading-summary">
          <span>
            <strong>{bookingRowCount}</strong>
            Booking Rows
          </span>

          <span>
            <strong>Saved</strong>
            Stars
          </span>

          <span>
            <strong>Ready</strong>
            Contacts
          </span>
        </div>

        <div className="contacts-loading-table-preview" aria-hidden="true">
          <div className="contacts-loading-preview-header">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>

          {Array.from({ length: 6 }).map((_, index) => (
            <div className="contacts-loading-preview-row" key={index}>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function formatContactName(contactName, mode) {
  const name = String(contactName || "").trim();

  if (!name) {
    return "No contact name";
  }

  if (mode !== "last") {
    return name;
  }

  const parts = name.split(/\s+/);

  if (parts.length < 2) {
    return name;
  }

  const lastName = parts.pop();
  const firstName = parts.join(" ");

  return `${lastName}, ${firstName}`;
}

function ContactsViewContent({ inquiryBookings, openBookingDetail }) {
  const contacts = useMemo(
    () => getContactsFromBookings(inquiryBookings),
    [inquiryBookings]
  );

  const [deletedContacts, setDeletedContacts] = useState(() =>
    getSavedDeletedContacts()
  );

  const [showDeletedContacts, setShowDeletedContacts] = useState(false);

  const [starredContactIds, setStarredContactIds] = useState(() =>
    getSavedContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY)
  );

  const [showStarredFirst, setShowStarredFirst] = useState(() =>
    getSavedContactsBoolean(CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY, false)
  );

  const [nameSortMode, setNameSortMode] = useState(() =>
    localStorage.getItem(
      CONTACTS_VIEW_NAME_SORT_STORAGE_KEY
    ) || "first"
  );

  const [copiedContactCell, setCopiedContactCell] = useState("");

  const [contactSearch, setContactSearch] = useState("");

  const [expandedContactId, setExpandedContactId] = useState(null);

  useEffect(() => {
    saveDeletedContacts(deletedContacts);
  }, [deletedContacts]);

  useEffect(() => {
    saveContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY, starredContactIds);
  }, [starredContactIds]);

  useEffect(() => {
    saveContactsBoolean(
      CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
      showStarredFirst
    );
  }, [showStarredFirst]);

  useEffect(() => {
    localStorage.setItem(
      CONTACTS_VIEW_NAME_SORT_STORAGE_KEY,
      nameSortMode
    );
  }, [nameSortMode]);

  const starredContactIdSet = useMemo(
    () => new Set(starredContactIds),
    [starredContactIds]
  );

  const deletedContactIdSet = useMemo(
    () => new Set(deletedContacts.map((contact) => contact.id)),
    [deletedContacts]
  );

  const visibleContacts = useMemo(
    () =>
      contacts.filter(
        (contact) => !deletedContactIdSet.has(contact.id)
      ),
    [contacts, deletedContactIdSet]
  );

  const sortedContacts = useMemo(() => {
    const searchValue = contactSearch.trim().toLowerCase();

    return visibleContacts
      .map((contact) => ({
        ...contact,
        isStarred: starredContactIdSet.has(contact.id),
      }))
      .filter((contact) => {
        if (!searchValue) {
          return true;
        }

        return (
          contact.contactName.toLowerCase().includes(searchValue) ||
          contact.organizationName.toLowerCase().includes(searchValue) ||
          contact.email.toLowerCase().includes(searchValue) ||
          contact.phone.toLowerCase().includes(searchValue)
        );
      })
      .sort((a, b) => {
        if (showStarredFirst && a.isStarred !== b.isStarred) {
          return a.isStarred ? -1 : 1;
        }

        if (nameSortMode === "last") {
          return getLastName(a.contactName)
            .localeCompare(
              getLastName(b.contactName)
            );
        }

        return formatContactName(
          a.contactName,
          nameSortMode
        ).localeCompare(
          formatContactName(
            b.contactName,
            nameSortMode
          )
        );

      });
  }, [
    visibleContacts,
    starredContactIdSet,
    showStarredFirst,
    contactSearch,
    nameSortMode,
  ]);

  const toggleContactBookings = (contactId) => {
    setExpandedContactId((currentId) =>
      currentId === contactId ? null : contactId
    );
  };

  const toggleContactStar = (contactId) => {
    setStarredContactIds((currentIds) => {
      if (currentIds.includes(contactId)) {
        return currentIds.filter((id) => id !== contactId);
      }

      return [...currentIds, contactId];
    });
  };

  const deleteContact = (contact) => {
    const confirmed = window.confirm(
      `Remove ${contact.contactName} from Contacts View?\n\n` +
        "This will NOT delete any booking records. The contact will be saved " +
        "under Deleted Contacts so it can be restored later."
    );
    if (!confirmed) {
      return;
    }
    const deletedContactSnapshot = {
      id: contact.id,
      contactName: contact.contactName,
      organizationName: contact.organizationName,
      email: contact.email,
      phone: contact.phone,
      bookingCount: contact.bookings.length,
      bookingReferences: contact.bookings.map((booking) => ({
        id: booking.id || "",
        organizationName: booking.organizationName || "",
        startDate: booking.startDate || "",
        endDate: booking.endDate || "",
        status: booking.status || "",
      })),
      deletedAt: new Date().toISOString(),
    };
    setDeletedContacts((currentContacts) => [
      deletedContactSnapshot,
      ...currentContacts.filter(
        (savedContact) => savedContact.id !== contact.id
      ),
    ]);
    setStarredContactIds((currentIds) =>
      currentIds.filter((id) => id !== contact.id)
    );
    setExpandedContactId((currentId) =>
      currentId === contact.id ? null : currentId
    );
  };

  const restoreDeletedContact = (contactId) => {
    setDeletedContacts((currentContacts) =>
      currentContacts.filter(
        (contact) => contact.id !== contactId
      )
    );
  };

  const copyContactCellValue = async (value, cellId) => {
    const textToCopy = String(value ?? "").trim();

    if (!textToCopy) {
      return;
    }

    try {
      await copyTextToClipboard(textToCopy);

      setCopiedContactCell(cellId);

      window.setTimeout(() => {
        setCopiedContactCell((currentCellId) =>
          currentCellId === cellId ? "" : currentCellId
        );
      }, 1100);
    } catch (error) {
      console.error("Could not copy contact cell:", error);
    }
  };

  function CopyableContactCell({ cellId, copyLabel, value, children }) {
    const isCopied = copiedContactCell === cellId;

    return (
      <td
        className={`contacts-view-copy-cell ${isCopied ? "is-copied" : ""}`}
        role="button"
        tabIndex={0}
        title={isCopied ? "Copied!" : `Click to copy ${copyLabel}`}
        aria-label={`Copy ${copyLabel}`}
        onClick={() => copyContactCellValue(value, cellId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            copyContactCellValue(value, cellId);
          }
        }}
      >
        <div className="contacts-view-copy-cell-content">
          {children ?? value ?? "N/A"}
        </div>

        {isCopied && (
          <span className="contacts-view-copy-feedback">Copied</span>
        )}
      </td>
    );
  }

  function formatBookingDate(dateValue) {
    if (!dateValue) {
      return "";
    }

    const parsedDate = new Date(`${dateValue}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      return dateValue;
    }

    return parsedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getBookingDateRange(booking) {
    const start = formatBookingDate(booking.startDate);
    const end = formatBookingDate(booking.endDate);

    if (start && end) {
      return `${start} – ${end}`;
    }

    if (start) {
      return start;
    }

    if (end) {
      return end;
    }

    return "No dates";
  }

  function getBookingGuestCount(booking) {
    return booking.attendeeCount || booking.groupSize || "N/A";
  }

  function getBookingStatusClassName(statusValue) {
    const normalizedStatus = String(statusValue || "").trim().toLowerCase();

    if (normalizedStatus === "confirmed") {
      return "is-confirmed";
    }

    if (normalizedStatus === "contract sent") {
      return "is-contract-sent";
    }

    if (normalizedStatus === "inquiry") {
      return "is-inquiry";
    }

    if (normalizedStatus === "cancelled") {
      return "is-cancelled";
    }

    return "is-default";
  }

  return (
    <section className="contacts-view-page">
      <article className="dashboard-card contacts-view-card">
        <div className="contacts-view-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaUsers />
            </span>

            <div>
              <p className="dashboard-eyebrow">Rentals & Events</p>
              <h2>Contacts View</h2>
              <p>
                A staff-friendly list of contacts pulled from booking inquiries
                and imported spreadsheet rows.
              </p>
            </div>
          </div>

          <div className="contacts-view-summary">
            <span>
              <strong>{visibleContacts.length}</strong>
              Contacts
            </span>

            <span>
              <strong>{inquiryBookings.length}</strong>
              Booking Rows
            </span>

            <span>
              <strong>{starredContactIds.length}</strong>
              Starred
            </span>
          </div>
        </div>

        <div className="contacts-view-toolbar">

          <div className="contacts-view-search">
            <input
              type="text"
              placeholder="Search contacts, organizations, email, or phone..."
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
            />
          </div>

          <div className="contacts-view-name-sort">

            <span>
              Sort:
            </span>

            <button
              type="button"
              className={
                nameSortMode === "first"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setNameSortMode("first")
              }
            >
              First Name
            </button>

            <button
              type="button"
              className={
                nameSortMode === "last"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setNameSortMode("last")
              }
            >
              Last Name
            </button>

          </div>

          <label className="contacts-view-pin-toggle">
            <input
              type="checkbox"
              checked={showStarredFirst}
              onChange={(event) =>
                setShowStarredFirst(event.target.checked)
              }
            />

            <span>Show starred contacts first</span>
          </label>

          <button
            className={`contacts-view-deleted-toggle ${
              showDeletedContacts ? "active" : ""
            }`}
            type="button"
            onClick={() =>
              setShowDeletedContacts(
                (currentValue) => !currentValue
              )
            }
          >
            <FaTrashAlt />
            Deleted ({deletedContacts.length})
          </button>

          <p>
            Star important contacts to highlight them. Turn this option on to
            move starred contacts to the top.
          </p>

        </div>

        {showDeletedContacts && (
          <div className="contacts-view-deleted-panel">
            <div className="contacts-view-deleted-panel-header">
              <div>
                <strong>Deleted Contacts</strong>
                <p>
                  These contacts are hidden from Contacts View only. Their
                  booking records have not been deleted.
                </p>
              </div>
              <button
                className="contacts-view-deleted-close"
                type="button"
                onClick={() => setShowDeletedContacts(false)}
              >
                Close
              </button>
            </div>

            {deletedContacts.length > 0 ? (
              <div className="contacts-view-deleted-list">
                {deletedContacts.map((contact) => (
                  <div
                    className="contacts-view-deleted-item"
                    key={contact.id}
                  >
                    <div className="contacts-view-deleted-copy">
                      <strong>{contact.contactName}</strong>
                      <span>
                        {contact.organizationName || "No organization"}
                      </span>
                      <small>
                        {[contact.email, contact.phone]
                          .filter(Boolean)
                          .join(" · ") || "No email or phone"}
                      </small>
                      <small>
                        {contact.bookingCount || 0} booking
                        {contact.bookingCount === 1 ? "" : "s"} · Deleted{" "}
                        {contact.deletedAt
                          ? new Date(contact.deletedAt).toLocaleString()
                          : "previously"}
                      </small>
                    </div>
                    <button
                      className="contacts-view-restore-button"
                      type="button"
                      onClick={() =>
                        restoreDeletedContact(contact.id)
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
                No deleted contacts.
              </div>
            )}
          </div>
        )}

        {sortedContacts.length > 0 ? (
          <div className="contacts-view-table-wrap">
            <table className="contacts-view-table">
              <thead>
                <tr>
                  <th className="contacts-view-favorite-column">Star</th>
                  <th>Contact Name</th>
                  <th>Organization</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Bookings</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>

              <tbody>
                {sortedContacts.map((contact) => {
                  const latestBooking =
                    contact.bookings[contact.bookings.length - 1];

                  const rowClassName = [
                    "contacts-view-row",
                    contact.isStarred ? "contacts-view-row-starred" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                  <>
                    <tr className={rowClassName} key={contact.id}>
                      <td className="contacts-view-favorite-cell">
                        <button
                          className={`contact-star-button ${
                            contact.isStarred ? "active" : ""
                          }`}
                          type="button"
                          onClick={() => toggleContactStar(contact.id)}
                          aria-label={
                            contact.isStarred
                              ? `Unstar ${contact.contactName}`
                              : `Star ${contact.contactName}`
                          }
                          title={contact.isStarred ? "Unstar" : "Star"}
                        >
                          {contact.isStarred ? <FaStar /> : <FaRegStar />}
                        </button>
                      </td>

                      <CopyableContactCell
                        cellId={`${contact.id}-contact-name`}
                        copyLabel="contact name"
                        value={formatContactName(
                          contact.contactName,
                          nameSortMode
                        )}
                      >
                        <div className="contacts-view-name-cell">
                          <strong>
                            {formatContactName(
                              contact.contactName,
                              nameSortMode
                            )}
                          </strong>
                        </div>
                      </CopyableContactCell>

                      <CopyableContactCell
                        cellId={`${contact.id}-organization`}
                        copyLabel="organization"
                        value={contact.organizationName}
                      >
                        {contact.organizationName}
                      </CopyableContactCell>

                      <CopyableContactCell
                        cellId={`${contact.id}-email`}
                        copyLabel="email"
                        value={contact.email || "N/A"}
                      >
                        {contact.email || "N/A"}
                      </CopyableContactCell>

                      <CopyableContactCell
                        cellId={`${contact.id}-phone`}
                        copyLabel="phone"
                        value={contact.phone || "N/A"}
                      >
                        {contact.phone || "N/A"}
                      </CopyableContactCell>

                      <CopyableContactCell
                        cellId={`${contact.id}-bookings`}
                        copyLabel="booking count"
                        value={contact.bookings.length}
                      >
                        {contact.bookings.length}
                      </CopyableContactCell>

                      <td>
                        <div className="contacts-view-actions">
                          <button
                            className="table-link"
                            type="button"
                            onClick={() => toggleContactBookings(contact.id)}
                          >
                            {expandedContactId === contact.id
                              ? "Hide Bookings"
                              : "View Bookings"}
                          </button>

                          <button
                            className="contact-delete-button"
                            type="button"
                            onClick={() => deleteContact(contact)}
                            aria-label={`Delete ${contact.contactName}`}
                            title="Delete contact"
                          >
                            <FaTrashAlt />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedContactId === contact.id && (
                      <tr className="contacts-bookings-expanded-row">
                        <td colSpan="7">

                          <div className="contacts-bookings-expanded">

                            <div className="contacts-bookings-header">
                              <strong>
                                Booking History
                              </strong>

                              <span>
                                {contact.bookings.length} booking
                                {contact.bookings.length === 1 ? "" : "s"}
                              </span>
                            </div>

                            <div className="contacts-bookings-list">
                              {[...contact.bookings]
                                .sort((a, b) => {
                                  const aTime = a.startDate
                                    ? new Date(`${a.startDate}T00:00:00`).getTime()
                                    : 0;

                                  const bTime = b.startDate
                                    ? new Date(`${b.startDate}T00:00:00`).getTime()
                                    : 0;

                                  return bTime - aTime;
                                })
                                .map((booking, index) => (
                                  <div
                                    className="contacts-booking-item"
                                    key={booking.id || `${contact.id}-booking-${index}`}
                                  >
                                    <div className="contacts-booking-main">
                                      <div className="contacts-booking-title-row">
                                        <div className="contacts-booking-title-group">

                                          <strong className="contacts-booking-title">
                                            {booking.eventName ||
                                              booking.organizationName ||
                                              booking.retreatName ||
                                              "Unnamed Booking"}
                                          </strong>

                                          {booking.retreatType && (
                                            <span className="contacts-booking-type">
                                              {booking.retreatType}
                                            </span>
                                          )}

                                        </div>

                                        <span
                                          className={`contacts-booking-status-pill ${getBookingStatusClassName(
                                            booking.status
                                          )}`}
                                        >
                                          {booking.status || "Unknown"}
                                        </span>
                                      </div>

                                      <div className="contacts-booking-info">

                                        <span className="contacts-booking-date">
                                          {getBookingDateRange(booking)}
                                        </span>

                                        <span className="contacts-booking-guests">
                                          {getBookingGuestCount(booking)} Guests
                                        </span>

                                      </div>

                                    </div>

                                    <div className="contacts-booking-actions">
                                      <button
                                        className="contacts-booking-open-button"
                                        type="button"
                                        onClick={() => openBookingDetail(booking)}
                                      >
                                        Open Booking
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>

                          </div>

                        </td>
                      </tr>
                    )}

                    </>

                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>
              {contactSearch
                ? "No matching contacts"
                : "No contacts yet"}
            </strong>
            <p>
              {contactSearch
                ? "Try adjusting your search terms."
                : deletedContacts.length > 0
                  ? "All current contacts are hidden. Open Deleted Contacts to restore one."
                  : "Submit the public form or import a spreadsheet to build the contacts list."}
            </p>
          </div>
        )}
      </article>
    </section>
  );
}

export default function ContactsView({ inquiryBookings = [], openBookingDetail }) {
    const [shouldRenderContacts, setShouldRenderContacts] = useState(false);

    useEffect(() => {
      setShouldRenderContacts(false);

      let firstFrameId = 0;
      let secondFrameId = 0;
      let loadingTimerId = 0;

      firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(() => {
          loadingTimerId = window.setTimeout(() => {
            setShouldRenderContacts(true);
          }, CONTACTS_RENDER_LOADING_MS);
        });
      });

      return () => {
        window.cancelAnimationFrame(firstFrameId);

        if (secondFrameId) {
          window.cancelAnimationFrame(secondFrameId);
        }

        if (loadingTimerId) {
          window.clearTimeout(loadingTimerId);
        }
      };
    }, [inquiryBookings.length]);

    if (!shouldRenderContacts) {
      return (
        <ContactsViewLoadingScreen bookingRowCount={inquiryBookings.length} />
      );
    }

    return (
      <ContactsViewContent
        inquiryBookings={inquiryBookings}
        openBookingDetail={openBookingDetail}
      />
    );
  }
