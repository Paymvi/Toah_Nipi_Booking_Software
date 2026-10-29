import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  contactMatchesSavedKeys,
  groupByIdentities,
} from "../utils/contactGrouping";
import {
  hideContactOnline,
  loadContactPreferences,
  setContactStarOnline,
  unhideContactOnline,
  uploadBrowserContactPreferences,
} from "../services/contactPreferences";
import { getBookingInquiryDateValue } from "../utils/dateUtils";

const CONTACTS_PREFERENCES_UPLOADED_KEY = "toahNipiContactPreferencesUploaded";

import {
  FaRegStar,
  FaStar,
  FaTrashAlt,
  FaUndo,
  FaUsers,
} from "react-icons/fa";

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


function cleanContactText(value) {
  const text = String(value ?? "").trim();

  if (
    !text ||
    text === "No contact name" ||
    text === "No email provided" ||
    text === "No phone provided" ||
    text === "No organization" ||
    text === "Unnamed Organization" ||
    text === "Unassigned"
  ) {
    return "";
  }

  return text;
}


function getFirstContactValue(...values) {
  for (const value of values) {
    const cleanedValue = cleanContactText(value);

    if (cleanedValue) {
      return cleanedValue;
    }
  }

  return "";
}


function getRentalFormDetails(booking) {
  const details = booking?.rentalFormDetails;

  if (
    details &&
    typeof details === "object" &&
    !Array.isArray(details)
  ) {
    return details;
  }

  return {};
}


function getArchiveAddress(booking) {
  const addressParts = [
    booking?.archiveAddress,
    booking?.archiveCity,
    booking?.archiveState,
    booking?.archiveZip,
  ]
    .map((value) => cleanContactText(value))
    .filter(Boolean);

  return addressParts.join(", ");
}


function normalizeEmailIdentity(value) {
  return cleanContactText(value).toLowerCase();
}


function normalizePhoneIdentity(value) {
  let digits = cleanContactText(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  return digits;
}


function normalizeNameIdentity(value) {
  return cleanContactText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function getBookingContactSnapshot(booking) {
  const details = getRentalFormDetails(booking);

    // Column values first: every edit path writes them (AUDIT-003).
  const contactName = getFirstContactValue(
    booking?.contactName,
    booking?.name,
    details.contactName,
    `${booking?.firstName || ""} ${booking?.lastName || ""}`
  );

  const organizationName = getFirstContactValue(
    booking?.organizationName,
    details.organizationName,
    booking?.churchOrMinistry,
    booking?.archiveGuestGroup
  );

  const email = getFirstContactValue(
    booking?.email,
    details.email
  );

  const phone = getFirstContactValue(
    booking?.phone,
    details.phone
  );

  const mailingAddress = getFirstContactValue(
    details.mailingAddress,
    booking?.inquiryAddress,
    getArchiveAddress(booking)
  );

    const retreatType = getFirstContactValue(
    booking?.retreatType,
    details.retreatType
  );

  const sourceType = getFirstContactValue(
    booking?.detectedImportType,
    booking?.sourceType,
    booking?.sourceSheet
  );

  return {
    contactName,
    organizationName,
    email,
    phone,
    mailingAddress,
    retreatType,
    sourceType,
  };
}


function getContactIdentityCandidates(snapshot) {
  const emailKey = normalizeEmailIdentity(snapshot.email);
  const phoneKey = normalizePhoneIdentity(snapshot.phone);
  const nameKey = normalizeNameIdentity(snapshot.contactName);
  const organizationKey = normalizeNameIdentity(snapshot.organizationName);

  const identityCandidates = [];

  if (emailKey) {
    identityCandidates.push(`email:${emailKey}`);
  }

  if (phoneKey) {
    identityCandidates.push(`phone:${phoneKey}`);
  }

  if (nameKey && organizationKey) {
    identityCandidates.push(`name-org:${nameKey}|${organizationKey}`);
  } else if (nameKey) {
    identityCandidates.push(`name:${nameKey}`);
  } else if (organizationKey) {
    identityCandidates.push(`organization:${organizationKey}`);
  }

  return identityCandidates;
}


function getBookingChronologyValue(booking) {
  const details = getRentalFormDetails(booking);

    // The real inquiry date, never a Master/Archive import time (AUDIT-012).
  const dateCandidates = [
    booking?.startDate,
    details.startDate,
    getBookingInquiryDateValue(booking),
    booking?.updatedAt,
  ];

  for (const value of dateCandidates) {
    const text = String(value || "").trim();

    if (!text) {
      continue;
    }

    const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? new Date(`${text}T12:00:00`).getTime()
      : new Date(text).getTime();

    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}


function buildStableContactId(contact) {
  const emailIdentity = contact.emailIdentities
    .filter(Boolean)
    .sort()[0];

  if (emailIdentity) {
    return emailIdentity;
  }

  const phoneIdentity = contact.phoneIdentities
    .filter(Boolean)
    .sort()[0];

  if (phoneIdentity) {
    return phoneIdentity;
  }

  const nameIdentity = normalizeNameIdentity(contact.contactName);
  const organizationIdentity = normalizeNameIdentity(
    contact.organizationName
  );

  if (nameIdentity || organizationIdentity) {
    return `${nameIdentity}-${organizationIdentity}`;
  }

  return `contact-${contact.recordIndex}`;
}


// Secondary contact on a booking, as a contact snapshot.
// A contact may be starred under any of its keys (older saved ids).
function isContactStarredIn(contact, starredKeys) {
  return contactMatchesSavedKeys(
    [contact.id, ...(contact.identityKeys || [])],
    starredKeys
  );
}

function getSecondaryContactSnapshot(booking) {
  const details = getRentalFormDetails(booking);
  const contactName = cleanContactText(
    details.secondaryContactName || booking?.secondaryContactName
  );
  const email = cleanContactText(
    details.secondaryContactEmail || booking?.secondaryContactEmail
  );
  const phone = cleanContactText(
    details.secondaryContactPhone || booking?.secondaryContactPhone
  );

  if (!contactName && !email && !phone) {
    return null;
  }

  const primary = getBookingContactSnapshot(booking);

  return {
    ...primary,
    contactName,
    email,
    phone,
    mailingAddress: "",
  };
}

// Identity keys, plus the older single-id forms saved preferences used.
function getAppearanceKeys(snapshot) {
  const keys = getContactIdentityCandidates(snapshot);
  const emailKey = normalizeEmailIdentity(snapshot.email);
  const phoneKey = normalizePhoneIdentity(snapshot.phone);
  const legacyNameKey = `${normalizeNameIdentity(snapshot.contactName)}-${normalizeNameIdentity(snapshot.organizationName)}`;

  return [
    ...keys,
    emailKey,
    phoneKey,
    legacyNameKey !== "-" ? legacyNameKey : "",
  ].filter(Boolean);
}

/*
  One contact per person across bookings (AUDIT-049): appearances that
  share an email, a phone, or a name + organization are merged, also
  transitively. Secondary contacts are included and labeled (AUDIT-039).
*/
function getContactsFromBookings(bookings) {
  const appearances = [];

  bookings.forEach((booking) => {
    const primary = getBookingContactSnapshot(booking);
    if (getContactIdentityCandidates(primary).length > 0) {
      appearances.push({ booking, snapshot: primary, role: "primary" });
    }

    const secondary = getSecondaryContactSnapshot(booking);
    if (secondary && getContactIdentityCandidates(secondary).length > 0) {
      appearances.push({ booking, snapshot: secondary, role: "secondary" });
    }
  });

  const contactRecords = groupByIdentities(appearances, (appearance) =>
    getContactIdentityCandidates(appearance.snapshot)
  ).map((group, recordIndex) => {
    const contact = {
      recordIndex,
      contactName: "",
      organizationName: "",
      email: "",
      phone: "",
      mailingAddress: "",
      latestBookingTimestamp: -1,
      bookings: [],
      secondaryBookingIds: new Set(),
      primaryBookingIds: new Set(),
      identityKeys: new Set(),
      contactNames: new Set(),
      organizationNames: new Set(),
      emails: new Set(),
      phones: new Set(),
      mailingAddresses: new Set(),
      retreatTypes: new Set(),
      sourceTypes: new Set(),
      emailIdentities: [],
      phoneIdentities: [],
    };

    group.forEach(({ booking, snapshot, role }) => {
      getAppearanceKeys(snapshot).forEach((key) => contact.identityKeys.add(key));

      if (snapshot.contactName) contact.contactNames.add(snapshot.contactName);
      if (snapshot.organizationName) contact.organizationNames.add(snapshot.organizationName);
      if (snapshot.email) contact.emails.add(snapshot.email);
      if (snapshot.phone) contact.phones.add(snapshot.phone);
      if (snapshot.mailingAddress) contact.mailingAddresses.add(snapshot.mailingAddress);
      if (snapshot.retreatType) contact.retreatTypes.add(snapshot.retreatType);
      if (snapshot.sourceType) contact.sourceTypes.add(snapshot.sourceType);

      const emailIdentity = normalizeEmailIdentity(snapshot.email);
      const phoneIdentity = normalizePhoneIdentity(snapshot.phone);
      if (emailIdentity) contact.emailIdentities.push(emailIdentity);
      if (phoneIdentity) contact.phoneIdentities.push(phoneIdentity);

      if (!contact.bookings.includes(booking)) contact.bookings.push(booking);
      (role === "secondary" ? contact.secondaryBookingIds : contact.primaryBookingIds).add(booking.id);

      const bookingTimestamp = getBookingChronologyValue(booking);

      if (bookingTimestamp >= contact.latestBookingTimestamp) {
        contact.latestBookingTimestamp = bookingTimestamp;
        if (snapshot.contactName) contact.contactName = snapshot.contactName;
        if (snapshot.organizationName) contact.organizationName = snapshot.organizationName;
        if (snapshot.email) contact.email = snapshot.email;
        if (snapshot.phone) contact.phone = snapshot.phone;
        if (snapshot.mailingAddress) contact.mailingAddress = snapshot.mailingAddress;
      }
    });

    return contact;
  });

  return contactRecords
    .map((contact) => {
      const contactNames = Array.from(contact.contactNames);
      const organizationNames = Array.from(contact.organizationNames);
      const emails = Array.from(contact.emails);
      const phones = Array.from(contact.phones);
      const mailingAddresses = Array.from(contact.mailingAddresses);
      const retreatTypes = Array.from(contact.retreatTypes);
      const sourceTypes = Array.from(contact.sourceTypes);

      const finalizedContact = {
        ...contact,
        contactName:
          contact.contactName ||
          contactNames[0] ||
          "No contact name",
        organizationName:
          contact.organizationName ||
          organizationNames[0] ||
          "No organization",
        email:
          contact.email ||
          emails[0] ||
          "",
        phone:
          contact.phone ||
          phones[0] ||
          "",
        mailingAddress:
          contact.mailingAddress ||
          mailingAddresses[0] ||
          "",
        contactNames,
        organizationNames,
        emails,
        phones,
        mailingAddresses,
        retreatTypes,
        sourceTypes,
        bookings: [...contact.bookings].sort(
          (a, b) =>
            getBookingChronologyValue(b) -
            getBookingChronologyValue(a)
        ),
      };

            return {
        ...finalizedContact,
        id: buildStableContactId(finalizedContact),
        identityKeys: Array.from(contact.identityKeys),
        secondaryOnlyBookingCount: [...contact.secondaryBookingIds].filter(
          (bookingId) => !contact.primaryBookingIds.has(bookingId)
        ).length,
      };
    })
    .sort((a, b) =>
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


function parseContactDate(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00`)
    : new Date(text);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}


function formatBookingDate(dateValue) {
  const parsedDate = parseContactDate(dateValue);

  if (!parsedDate) {
    return String(dateValue || "").trim();
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


function getBookingStartDate(booking) {
  const details = getRentalFormDetails(booking);

  return getFirstContactValue(
    details.startDate,
    booking?.startDate
  );
}


function getBookingEndDate(booking) {
  const details = getRentalFormDetails(booking);

  return getFirstContactValue(
    details.endDate,
    booking?.endDate
  );
}


function getBookingDateRange(booking) {
  const start = formatBookingDate(
    getBookingStartDate(booking)
  );

  const end = formatBookingDate(
    getBookingEndDate(booking)
  );

  if (start && end) {
    return start === end
      ? start
      : `${start} – ${end}`;
  }

  if (start) {
    return start;
  }

  if (end) {
    return end;
  }

  return "No dates";
}


function getNumericGuestBreakdownTotal(...values) {
  const populatedValues = values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value !== "");

  if (populatedValues.length === 0) {
    return "";
  }

  if (
    populatedValues.some(
      (value) => !/^\d+$/.test(value)
    )
  ) {
    return "";
  }

  return String(
    populatedValues.reduce(
      (total, value) => total + Number(value),
      0
    )
  );
}


function getBookingGuestCount(booking) {
  const details = getRentalFormDetails(booking);

  const topLevelGuestCount = getFirstContactValue(
    booking?.attendeeCount,
    booking?.groupSize
  );

  if (topLevelGuestCount) {
    return topLevelGuestCount;
  }

  const actualGuestCount = getNumericGuestBreakdownTotal(
    details.actualAdultGuests,
    details.actualChildrenUnder3,
    details.actualChildren3to17 || details.actualChildrenGuests
  );

  if (actualGuestCount) {
    return actualGuestCount;
  }

  const approximateTotal = getFirstContactValue(
    details.approxTotalGuests
  );

  if (approximateTotal) {
    return approximateTotal;
  }

  const approximateGuestCount = getNumericGuestBreakdownTotal(
    details.approxAdultGuests,
    details.approxChildrenUnder3,
    details.approxChildren3to17 || details.approxChildrenGuests
  );

  return approximateGuestCount || "N/A";
}


function getBookingStatus(booking) {
  const details = getRentalFormDetails(booking);

  return getFirstContactValue(
    booking?.status,
    details.status,
    booking?.stageOfGroup
  ) || "Unknown";
}


function getBookingStatusClassName(statusValue) {
  const normalizedStatus = String(statusValue || "")
    .trim()
    .toLowerCase();

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


function getBookingOrganizationName(booking) {
  return getBookingContactSnapshot(booking).organizationName ||
    "Unnamed Booking";
}


function getBookingRetreatType(booking) {
  return getBookingContactSnapshot(booking).retreatType;
}


function getBookingSourceType(booking) {
  return getBookingContactSnapshot(booking).sourceType;
}


function getContactSearchText(contact) {
  const bookingSearchValues = contact.bookings.flatMap((booking) => {
    const snapshot = getBookingContactSnapshot(booking);

    return [
      snapshot.contactName,
      snapshot.organizationName,
      snapshot.email,
      snapshot.phone,
      snapshot.mailingAddress,
      snapshot.retreatType,
      snapshot.sourceType,
      getBookingStatus(booking),
      getBookingDateRange(booking),
    ];
  });

  return [
    contact.contactName,
    contact.organizationName,
    contact.email,
    contact.phone,
    contact.mailingAddress,
    ...contact.contactNames,
    ...contact.organizationNames,
    ...contact.emails,
    ...contact.phones,
    ...contact.mailingAddresses,
    ...contact.retreatTypes,
    ...contact.sourceTypes,
    ...bookingSearchValues,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
    getSavedContactsBoolean(
      CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
      false
    )
  );

  const [nameSortMode, setNameSortMode] = useState(() => {
    try {
      return (
        localStorage.getItem(
          CONTACTS_VIEW_NAME_SORT_STORAGE_KEY
        ) || "first"
      );
    } catch (error) {
      console.error("Could not read contact sort setting:", error);
      return "first";
    }
  });

    /*
    Hidden contacts are shared and stars are per login once the
    contact_hidden / contact_stars tables exist; until then this browser's
    lists are used (AUDIT-049, Q-038 A).
  */
  const [preferencesOnline, setPreferencesOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadContactPreferences(supabase).then(async (result) => {
      if (cancelled || !result.available) {
        return;
      }

      let alreadyUploaded;

      try {
        alreadyUploaded =
          localStorage.getItem(CONTACTS_PREFERENCES_UPLOADED_KEY) === "true";
      } catch {
        alreadyUploaded = true;
      }

      const browserHidden = getSavedDeletedContacts();
      const browserStars = getSavedContactIdList(CONTACTS_VIEW_STARRED_STORAGE_KEY);

      if (!alreadyUploaded && (browserHidden.length || browserStars.length)) {
        try {
          await uploadBrowserContactPreferences(supabase, {
            hidden: browserHidden,
            starredKeys: browserStars,
          });
          localStorage.setItem(CONTACTS_PREFERENCES_UPLOADED_KEY, "true");
          const reloaded = await loadContactPreferences(supabase);
          if (!cancelled && reloaded.available) {
            result = reloaded;
          }
        } catch (error) {
          console.error("Could not copy this browser's contact preferences online:", error);
        }
      }

      if (!cancelled) {
        setPreferencesOnline(true);
        setDeletedContacts(result.hidden);
        setStarredContactIds(result.starredKeys);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const savePreferenceOnline = (action) => {
    if (!preferencesOnline) {
      return;
    }

    action().catch((error) => {
      console.error("Could not save the contact preference online:", error);
      alert("That contact change could not be saved for other staff. Reload Contacts and try again.");
    });
  };

  const [copiedContactCell, setCopiedContactCell] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [expandedContactId, setExpandedContactId] = useState(null);


    useEffect(() => {
    if (!preferencesOnline) {
      saveDeletedContacts(deletedContacts);
    }
  }, [deletedContacts, preferencesOnline]);

  useEffect(() => {
    if (!preferencesOnline) {
      saveContactIdList(
        CONTACTS_VIEW_STARRED_STORAGE_KEY,
        starredContactIds
      );
    }
  }, [starredContactIds, preferencesOnline]);


  useEffect(() => {
    saveContactsBoolean(
      CONTACTS_VIEW_STARRED_FIRST_STORAGE_KEY,
      showStarredFirst
    );
  }, [showStarredFirst]);


  useEffect(() => {
    try {
      localStorage.setItem(
        CONTACTS_VIEW_NAME_SORT_STORAGE_KEY,
        nameSortMode
      );
    } catch (error) {
      console.error("Could not save contact sort setting:", error);
    }
  }, [nameSortMode]);


  const starredContactIdSet = useMemo(
    () => new Set(starredContactIds),
    [starredContactIds]
  );

    // Any key of a hidden contact hides it, so a new email cannot revive it.
  const deletedContactIdSet = useMemo(
    () => new Set(
      deletedContacts.flatMap((contact) =>
        Array.isArray(contact.identityKeys) && contact.identityKeys.length
          ? contact.identityKeys
          : [contact.id]
      )
    ),
    [deletedContacts]
  );

  const visibleContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          !contactMatchesSavedKeys(
            [contact.id, ...(contact.identityKeys || [])],
            deletedContactIdSet
          )
      ),
    [contacts, deletedContactIdSet]
  );



  const visibleStarredCount = useMemo(
    () =>
            visibleContacts.filter((contact) =>
        isContactStarredIn(contact, starredContactIdSet)
      ).length,
    [visibleContacts, starredContactIdSet]
  );

  const sortedContacts = useMemo(() => {
    const searchValue = contactSearch.trim().toLowerCase();

    return visibleContacts
      .map((contact) => ({
        ...contact,
                isStarred: isContactStarredIn(contact, starredContactIdSet),
      }))
      .filter((contact) => {
        if (!searchValue) {
          return true;
        }

        return getContactSearchText(contact).includes(searchValue);
      })
      .sort((a, b) => {
        if (
          showStarredFirst &&
          a.isStarred !== b.isStarred
        ) {
          return a.isStarred ? -1 : 1;
        }

        if (nameSortMode === "last") {
          const lastNameComparison = getLastName(a.contactName)
            .localeCompare(getLastName(b.contactName));

          if (lastNameComparison !== 0) {
            return lastNameComparison;
          }
        }

        const nameComparison = formatContactName(
          a.contactName,
          nameSortMode
        ).localeCompare(
          formatContactName(
            b.contactName,
            nameSortMode
          )
        );

        if (nameComparison !== 0) {
          return nameComparison;
        }

        return a.organizationName.localeCompare(
          b.organizationName
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


  // A contact may be starred under any of its keys (older saved ids).
  const toggleContactStar = (contactId) => {
    const contact = contacts.find((item) => item.id === contactId);
    const keys = new Set([contactId, ...(contact?.identityKeys || [])]);
    const starredKeys = starredContactIds.filter((id) => keys.has(id));

    if (starredKeys.length > 0) {
      setStarredContactIds((currentIds) => currentIds.filter((id) => !keys.has(id)));
      starredKeys.forEach((key) =>
        savePreferenceOnline(() => setContactStarOnline(supabase, key, false))
      );
      return;
    }

    setStarredContactIds((currentIds) => [...currentIds, contactId]);
    savePreferenceOnline(() => setContactStarOnline(supabase, contactId, true));
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
      identityKeys: contact.identityKeys || [contact.id],
      contactName: contact.contactName,
      organizationName: contact.organizationName,
      email: contact.email,
      phone: contact.phone,
      mailingAddress: contact.mailingAddress,
      bookingCount: contact.bookings.length,
      organizationNames: contact.organizationNames,
      emails: contact.emails,
      phones: contact.phones,
      bookingReferences: contact.bookings.map((booking) => ({
        id: booking.id || "",
        organizationName: getBookingOrganizationName(booking),
        startDate: getBookingStartDate(booking),
        endDate: getBookingEndDate(booking),
        status: getBookingStatus(booking),
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
    savePreferenceOnline(() => hideContactOnline(supabase, deletedContactSnapshot));
  };


    const restoreDeletedContact = (contactId) => {
    setDeletedContacts((currentContacts) =>
      currentContacts.filter(
        (contact) => contact.id !== contactId
      )
    );
    savePreferenceOnline(() => unhideContactOnline(supabase, contactId));
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


  function CopyableContactCell({
    cellId,
    copyLabel,
    value,
    children,
  }) {
    const isCopied = copiedContactCell === cellId;
    const hasCopyValue = String(value ?? "").trim() !== "";

    return (
      <td
        className={`contacts-view-copy-cell ${
          isCopied ? "is-copied" : ""
        }`}
        role={hasCopyValue ? "button" : undefined}
        tabIndex={hasCopyValue ? 0 : undefined}
        title={
          hasCopyValue
            ? isCopied
              ? "Copied!"
              : `Click to copy ${copyLabel}`
            : undefined
        }
        aria-label={
          hasCopyValue
            ? `Copy ${copyLabel}`
            : undefined
        }
        onClick={() => {
          if (hasCopyValue) {
            copyContactCellValue(value, cellId);
          }
        }}
        onKeyDown={(event) => {
          if (
            hasCopyValue &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            copyContactCellValue(value, cellId);
          }
        }}
      >
        <div className="contacts-view-copy-cell-content">
          {children ?? value ?? "N/A"}
        </div>

        {isCopied && (
          <span className="contacts-view-copy-feedback">
            Copied
          </span>
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
                A staff-friendly contact list built from the current booking
                records, detailed rental forms, and imported spreadsheet data.
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
              <strong>{visibleStarredCount}</strong>
              Starred
            </span>
          </div>
        </div>


        <div className="contacts-view-toolbar">
          <div className="contacts-view-search">
            <input
              type="text"
              placeholder="Search contacts, groups, address, email, phone, status, or retreat type..."
              value={contactSearch}
              onChange={(event) =>
                setContactSearch(event.target.value)
              }
            />
          </div>

          <div className="contacts-view-name-sort">
            <span>Sort:</span>

            <button
              type="button"
              className={
                nameSortMode === "first"
                  ? "active"
                  : ""
              }
              onClick={() => setNameSortMode("first")}
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
              onClick={() => setNameSortMode("last")}
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
            Contacts are matched across booking history using known email,
            phone, or the same contact name and organization.
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

                      {contact.mailingAddress && (
                        <small>{contact.mailingAddress}</small>
                      )}

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
                  const rowClassName = [
                    "contacts-view-row",
                    contact.isStarred
                      ? "contacts-view-row-starred"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <Fragment key={contact.id}>
                      <tr className={rowClassName}>
                        <td className="contacts-view-favorite-cell">
                          <button
                            className={`contact-star-button ${
                              contact.isStarred ? "active" : ""
                            }`}
                            type="button"
                            onClick={() =>
                              toggleContactStar(contact.id)
                            }
                            aria-label={
                              contact.isStarred
                                ? `Unstar ${contact.contactName}`
                                : `Star ${contact.contactName}`
                            }
                            title={
                              contact.isStarred
                                ? "Unstar"
                                : "Star"
                            }
                          >
                            {contact.isStarred ? (
                              <FaStar />
                            ) : (
                              <FaRegStar />
                            )}
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
                            {contact.secondaryOnlyBookingCount > 0 && (
                              <small className="contacts-view-secondary-label">
                                Secondary contact on{" "}
                                {contact.secondaryOnlyBookingCount} booking
                                {contact.secondaryOnlyBookingCount === 1 ? "" : "s"}
                              </small>
                            )}
                          </div>
                        </CopyableContactCell>

                        <CopyableContactCell
                          cellId={`${contact.id}-organization`}
                          copyLabel="organization"
                          value={contact.organizationName}
                        >
                          <div className="contacts-view-name-cell">
                            <strong>{contact.organizationName}</strong>

                            {contact.mailingAddress && (
                              <span>{contact.mailingAddress}</span>
                            )}
                          </div>
                        </CopyableContactCell>

                        <CopyableContactCell
                          cellId={`${contact.id}-email`}
                          copyLabel="email"
                          value={contact.email}
                        >
                          {contact.email || "N/A"}
                        </CopyableContactCell>

                        <CopyableContactCell
                          cellId={`${contact.id}-phone`}
                          copyLabel="phone"
                          value={contact.phone}
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
                              onClick={() =>
                                toggleContactBookings(contact.id)
                              }
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
                                <strong>Booking History</strong>

                                <span>
                                  {contact.bookings.length} booking
                                  {contact.bookings.length === 1 ? "" : "s"}
                                </span>
                              </div>

                              <div className="contacts-bookings-list">
                                {contact.bookings.map((booking, index) => {
                                  const bookingStatus =
                                    getBookingStatus(booking);

                                  const retreatType =
                                    getBookingRetreatType(booking);

                                  const sourceType =
                                    getBookingSourceType(booking);

                                  return (
                                    <div
                                      className="contacts-booking-item"
                                      key={
                                        booking.id ||
                                        `${contact.id}-booking-${index}`
                                      }
                                    >
                                      <div className="contacts-booking-main">
                                        <div className="contacts-booking-title-row">
                                          <div className="contacts-booking-title-group">
                                            <strong className="contacts-booking-title">
                                              {getBookingOrganizationName(
                                                booking
                                              )}
                                            </strong>

                                            {retreatType && (
                                              <span className="contacts-booking-type">
                                                {retreatType}
                                              </span>
                                            )}

                                            {sourceType && (
                                              <span className="contacts-booking-type">
                                                {sourceType}
                                              </span>
                                            )}
                                          </div>

                                          <span
                                            className={`contacts-booking-status-pill ${getBookingStatusClassName(
                                              bookingStatus
                                            )}`}
                                          >
                                            {bookingStatus}
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
                                          onClick={() =>
                                            openBookingDetail?.(booking)
                                          }
                                        >
                                          Open Booking
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
                  : "Create or import a booking to build the contacts list."}
            </p>
          </div>
        )}
      </article>
    </section>
  );
}


export default function ContactsView({
  inquiryBookings = [],
  openBookingDetail,
}) {
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
  }, [inquiryBookings]);

  if (!shouldRenderContacts) {
    return (
      <ContactsViewLoadingScreen
        bookingRowCount={inquiryBookings.length}
      />
    );
  }

  return (
    <ContactsViewContent
      inquiryBookings={inquiryBookings}
      openBookingDetail={openBookingDetail}
    />
  );
}
