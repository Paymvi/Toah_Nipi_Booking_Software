import { useEffect, useMemo, useState } from "react";
import { FaRegStar, FaStar, FaUsers } from "react-icons/fa";

import {
  CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
  CONTACTS_VIEW_STARRED_STORAGE_KEY,
} from "../constants/dashboardConstants";

const CONTACTS_RENDER_LOADING_MS = 140;

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

function ContactsViewContent({ inquiryBookings, openBookingDetail }) {
  const contacts = useMemo(
    () => getContactsFromBookings(inquiryBookings),
    [inquiryBookings]
  );

  const [starredContactIds, setStarredContactIds] = useState(() =>
    getSavedContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY)
  );

  const [showStarredFirst, setShowStarredFirst] = useState(() =>
    getSavedContactsBoolean(CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY, false)
  );

  const [copiedContactCell, setCopiedContactCell] = useState("");

  useEffect(() => {
    saveContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY, starredContactIds);
  }, [starredContactIds]);

  useEffect(() => {
    saveContactsBoolean(
      CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
      showStarredFirst
    );
  }, [showStarredFirst]);

  const starredContactIdSet = useMemo(
    () => new Set(starredContactIds),
    [starredContactIds]
  );

  const sortedContacts = useMemo(() => {
    return contacts
      .map((contact) => ({
        ...contact,
        isStarred: starredContactIdSet.has(contact.id),
      }))
      .sort((a, b) => {
        if (showStarredFirst && a.isStarred !== b.isStarred) {
          return a.isStarred ? -1 : 1;
        }

        return a.contactName.localeCompare(b.contactName);
      });
  }, [contacts, starredContactIdSet, showStarredFirst]);

  const toggleContactStar = (contactId) => {
    setStarredContactIds((currentIds) => {
      if (currentIds.includes(contactId)) {
        return currentIds.filter((id) => id !== contactId);
      }

      return [...currentIds, contactId];
    });
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
              <strong>{contacts.length}</strong>
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
          <label className="contacts-view-pin-toggle">
            <input
              type="checkbox"
              checked={showStarredFirst}
              onChange={(event) => setShowStarredFirst(event.target.checked)}
            />

            <span>Show starred contacts first</span>
          </label>

          <p>
            Star important contacts to highlight them. Turn this option on to
            move starred contacts to the top.
          </p>
        </div>

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
                        value={contact.contactName}
                      >
                        <div className="contacts-view-name-cell">
                          <strong>{contact.contactName}</strong>
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
                            onClick={() => openBookingDetail(latestBooking)}
                          >
                            View Booking
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No contacts yet</strong>
            <p>
              Submit the public form or import a spreadsheet to build the
              contacts list.
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
