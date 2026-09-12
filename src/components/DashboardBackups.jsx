import { useEffect, useMemo, useRef, useState } from "react";

import {
  FaCheckCircle,
  FaDatabase,
  FaDownload,
  FaInfoCircle,
  FaTimes,
  FaTrashAlt,
  FaUpload,
} from "react-icons/fa";

import {
  fetchBookings,
  upsertBookings,
  deleteAllBookings,
  deleteBooking,
} from "../services/bookingService";

import {
  DATED_INQUIRY_SETTINGS_STORAGE_KEY,
  DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
  BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
  REPORTS_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
} from "../constants/dashboardConstants";

/* =========================================================
   BACKUP CONFIGURATION
========================================================= */

const STAFF_USERS_STORAGE_KEY = "toahNipiStaffUsers";
const CURRENT_STAFF_USER_STORAGE_KEY = "toahNipiCurrentStaffUserId";

const LEGACY_BOOKINGS_STORAGE_KEY = "toahNipiPublicInquiries";

const DASHBOARD_BACKUP_HISTORY_STORAGE_KEY =
  "toahNipiDashboardBackupHistory";

const DASHBOARD_BACKUP_VERSION = 2;

/*
  A full database snapshot can be considerably larger than the
  old localStorage-only backup. Keep only a few convenient browser
  snapshots and rely on the downloaded JSON file as the durable copy.
*/
const MAX_DASHBOARD_BACKUPS_TO_KEEP = 4;
const MAX_BACKUP_HISTORY_BYTES = 3_800_000;

const DASHBOARD_BACKUP_CORE_KEYS = [
  STAFF_USERS_STORAGE_KEY,
  CURRENT_STAFF_USER_STORAGE_KEY,

  DATED_INQUIRY_SETTINGS_STORAGE_KEY,
  DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,

  BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
  REPORTS_VIEW_SETTINGS_STORAGE_KEY,

  SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
];

const DASHBOARD_BACKUP_KEY_LABELS = {
  [STAFF_USERS_STORAGE_KEY]: "Staff users",
  [CURRENT_STAFF_USER_STORAGE_KEY]: "Current staff user",

  [DATED_INQUIRY_SETTINGS_STORAGE_KEY]:
    "Dated inquiry display settings",

  [DATED_INQUIRY_DATE_FILTER_STORAGE_KEY]:
    "Dated inquiry date filter",

  [DATED_INQUIRY_CUSTOM_START_STORAGE_KEY]:
    "Dated inquiry custom start date",

  [DATED_INQUIRY_CUSTOM_END_STORAGE_KEY]:
    "Dated inquiry custom end date",

  [BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY]:
    "Booking detail date settings",

  [REPORTS_VIEW_SETTINGS_STORAGE_KEY]:
    "Reports settings",

  [SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY]:
    "Spreadsheet view settings",

  [SPREADSHEET_VIEW_STARRED_STORAGE_KEY]:
    "Spreadsheet starred rows",
};

/* =========================================================
   BASIC HELPERS
========================================================= */

function createDashboardBackupId() {
  return `backup-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function safeParseJson(value, fallbackValue = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function formatBackupDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBackupStorageSize(value) {
  if (value === null || value === undefined) {
    return "0 B";
  }

  const bytes = new Blob([String(value)]).size;

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getReadableBackupValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }

  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  if (typeof value === "object") {
    const count = Object.keys(value).length;

    return `${count} saved setting${count === 1 ? "" : "s"}`;
  }

  return String(value);
}

function getReadableBackupSettingName(key) {
  const labels = {
    dateFormat: "Date format",
    includeWeekday: "Show weekday",

    tintByRetreatType:
      "Color cards by retreat type",

    showRetreatTypeLegend:
      "Show retreat type legend",

    dateRange: "Report date range",
    customStartDate: "Custom start date",
    customEndDate: "Custom end date",
    status: "Status filter",
    retreatType: "Retreat type filter",
    sourceMode: "Source filter",

    showStarredOnly: "Show starred only",
    searchText: "Search text",
    sortKey: "Sorted column",
    sortDirection: "Sort direction",
    columnColorMode: "Column colors",
    rowColorMode: "Row colors",
    showHoverPreview: "Row hover preview",
    density: "Row density",
    pageSize: "Rows per page",
  };

  if (labels[key]) {
    return labels[key];
  }

  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) =>
      letter.toUpperCase()
    );
}

function getObjectPreviewItems(
  objectValue,
  limit = 8
) {
  if (
    !objectValue ||
    typeof objectValue !== "object" ||
    Array.isArray(objectValue)
  ) {
    return [];
  }

  return Object.entries(objectValue)
    .slice(0, limit)
    .map(([key, value]) => ({
      label:
        getReadableBackupSettingName(key),

      value:
        getReadableBackupValue(value),
    }));
}

function getArrayCountFromStorageValue(value) {
  const parsedValue =
    safeParseJson(value, []);

  return Array.isArray(parsedValue)
    ? parsedValue.length
    : 0;
}

function getParsedStorageValue(
  storageData,
  key,
  fallbackValue
) {
  const rawValue =
    storageData?.[key];

  if (
    rawValue === null ||
    rawValue === undefined ||
    rawValue === ""
  ) {
    return fallbackValue;
  }

  const parsedValue =
    safeParseJson(
      rawValue,
      fallbackValue
    );

  return parsedValue === null ||
    parsedValue === undefined
    ? fallbackValue
    : parsedValue;
}

function getBackupHasAnyValue(
  storageData,
  keys
) {
  return keys.some((key) => {
    const value =
      storageData?.[key];

    return (
      value !== null &&
      value !== undefined &&
      value !== ""
    );
  });
}

/* =========================================================
   CURRENT DATABASE + LEGACY BACKUP SUPPORT
========================================================= */

function getBackupBookings(backup) {
  /*
    Version 2:
    bookings are a top-level database snapshot.
  */
  if (
    Array.isArray(backup?.bookings)
  ) {
    return backup.bookings;
  }

  /*
    Version 1:
    bookings lived in the old localStorage key.
  */
  const legacyValue =
    backup?.storageData?.[
      LEGACY_BOOKINGS_STORAGE_KEY
    ];

  if (!legacyValue) {
    return [];
  }

  const parsedLegacyBookings =
    safeParseJson(
      legacyValue,
      []
    );

  return Array.isArray(
    parsedLegacyBookings
  )
    ? parsedLegacyBookings
    : [];
}

function normalizeImportedDashboardBackup(
  rawBackup
) {
  if (
    !rawBackup ||
    typeof rawBackup !== "object"
  ) {
    return null;
  }

  const rawStorageData =
    rawBackup.storageData ||
    rawBackup.localStorageData ||
    {};

  const storageData =
    rawStorageData &&
    typeof rawStorageData === "object" &&
    !Array.isArray(rawStorageData)
      ? { ...rawStorageData }
      : {};

  let bookings = [];

  if (
    Array.isArray(
      rawBackup.bookings
    )
  ) {
    bookings =
      rawBackup.bookings;
  } else {
    const legacyValue =
      storageData[
        LEGACY_BOOKINGS_STORAGE_KEY
      ];

    const parsedLegacyBookings =
      safeParseJson(
        legacyValue,
        []
      );

    if (
      Array.isArray(
        parsedLegacyBookings
      )
    ) {
      bookings =
        parsedLegacyBookings;
    }
  }

  /*
    Version 2 no longer treats the browser as the booking database.
  */
  delete storageData[
    LEGACY_BOOKINGS_STORAGE_KEY
  ];

  const hasAnyData =
    bookings.length > 0 ||
    Object.keys(storageData).length >
      0;

  if (!hasAnyData) {
    return null;
  }

  const sourceVersion =
    Number(rawBackup.version) || 1;

  const normalizedBackup = {
    id:
      rawBackup.id ||
      createDashboardBackupId(),

    appName:
      rawBackup.appName ||
      "Toah Nipi Staff Dashboard",

    backupType:
      "database-and-browser-settings",

    version:
      DASHBOARD_BACKUP_VERSION,

    sourceVersion,

    migratedFromLegacy:
      sourceVersion <
      DASHBOARD_BACKUP_VERSION,

    createdAt:
      rawBackup.createdAt ||
      new Date().toISOString(),

    importedAt:
      new Date().toISOString(),

    bookings,
    storageData,
  };

  return {
    ...normalizedBackup,
    stats:
      getBackupStats(
        normalizedBackup
      ),
  };
}

/* =========================================================
   BROWSER STORAGE SNAPSHOT
========================================================= */

function getDashboardBackupKeys() {
  const backupKeys =
    new Set(
      DASHBOARD_BACKUP_CORE_KEYS
    );

  try {
    for (
      let index = 0;
      index < localStorage.length;
      index += 1
    ) {
      const key =
        localStorage.key(index);

      if (
        key &&
        key.startsWith("toahNipi") &&
        key !==
          DASHBOARD_BACKUP_HISTORY_STORAGE_KEY &&
        key !==
          LEGACY_BOOKINGS_STORAGE_KEY
      ) {
        backupKeys.add(key);
      }
    }
  } catch (error) {
    console.error(
      "Could not scan dashboard storage keys:",
      error
    );
  }

  return Array.from(
    backupKeys
  ).sort((a, b) =>
    a.localeCompare(b)
  );
}

function getBackupStorageData() {
  const storageData = {};

  getDashboardBackupKeys().forEach(
    (key) => {
      storageData[key] =
        localStorage.getItem(key);
    }
  );

  return storageData;
}

/* =========================================================
   BACKUP HISTORY
========================================================= */

function getDashboardBackupHistory() {
  try {
    const savedBackups =
      localStorage.getItem(
        DASHBOARD_BACKUP_HISTORY_STORAGE_KEY
      );

    if (!savedBackups) {
      return [];
    }

    const parsedBackups =
      JSON.parse(savedBackups);

    if (
      !Array.isArray(
        parsedBackups
      )
    ) {
      return [];
    }

    return parsedBackups
      .filter(
        (backup) =>
          backup &&
          backup.id &&
          backup.createdAt
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );
  } catch (error) {
    console.error(
      "Could not read dashboard backup history:",
      error
    );

    return [];
  }
}

function saveDashboardBackupHistory(
  backups
) {
  try {
    let backupsToSave =
      [...backups]
        .filter(
          (backup) =>
            backup &&
            backup.id
        )
        .filter(
          (backup, index, array) =>
            array.findIndex(
              (candidate) =>
                candidate.id ===
                backup.id
            ) === index
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        )
        .slice(
          0,
          MAX_DASHBOARD_BACKUPS_TO_KEEP
        );

    /*
      localStorage commonly has a small quota.
      Remove the oldest browser-history snapshot until
      the backup history fits under our conservative cap.
    */
    while (
      backupsToSave.length > 0
    ) {
      const serialized =
        JSON.stringify(
          backupsToSave
        );

      const byteSize =
        new Blob([
          serialized,
        ]).size;

      if (
        byteSize <=
        MAX_BACKUP_HISTORY_BYTES
      ) {
        break;
      }

      backupsToSave =
        backupsToSave.slice(
          0,
          -1
        );
    }

    localStorage.setItem(
      DASHBOARD_BACKUP_HISTORY_STORAGE_KEY,
      JSON.stringify(
        backupsToSave
      )
    );

    return backupsToSave;
  } catch (error) {
    console.error(
      "Could not save dashboard backup history:",
      error
    );

    return [];
  }
}

/* =========================================================
   BACKUP CREATION + DOWNLOAD
========================================================= */

function getBackupStats(backup) {
  const storageData =
    backup?.storageData || {};

  const bookings =
    getBackupBookings(backup);

  const staffCount =
    getArrayCountFromStorageValue(
      storageData[
        STAFF_USERS_STORAGE_KEY
      ]
    );

  const starredCount =
    getArrayCountFromStorageValue(
      storageData[
        SPREADSHEET_VIEW_STARRED_STORAGE_KEY
      ]
    );

  const savedKeysCount =
    Object.values(
      storageData
    ).filter(
      (value) =>
        value !== null &&
        value !== undefined
    ).length;

  return {
    bookingCount:
      bookings.length,

    staffCount,
    starredCount,
    savedKeysCount,
  };
}

async function createDashboardBackupSnapshot() {
  const createdAt =
    new Date().toISOString();

  /*
    This is the authoritative booking source used by the
    current dashboard.
  */
  const bookings =
    await fetchBookings();

  const storageData =
    getBackupStorageData();

  const backup = {
    id:
      createDashboardBackupId(),

    appName:
      "Toah Nipi Staff Dashboard",

    backupType:
      "database-and-browser-settings",

    version:
      DASHBOARD_BACKUP_VERSION,

    createdAt,

    bookings:
      Array.isArray(bookings)
        ? bookings
        : [],

    storageData,
  };

  return {
    ...backup,
    stats:
      getBackupStats(backup),
  };
}

function downloadDashboardBackupFile(
  backup
) {
  const fileDate =
    new Date(
      backup.createdAt
    )
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");

  const blob =
    new Blob(
      [
        JSON.stringify(
          backup,
          null,
          2
        ),
      ],
      {
        type: "application/json",
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `toah-nipi-dashboard-backup-${fileDate}.json`;

  document.body.appendChild(
    link
  );

  link.click();

  document.body.removeChild(
    link
  );

  URL.revokeObjectURL(url);
}

/* =========================================================
   FRIENDLY BACKUP DETAILS
========================================================= */

function getCountByField(
  items,
  fieldName,
  fallbackLabel = "Blank"
) {
  return items.reduce(
    (counts, item) => {
      const label =
        String(
          item?.[fieldName] ||
            fallbackLabel
        ).trim() ||
        fallbackLabel;

      counts[label] =
        (counts[label] || 0) +
        1;

      return counts;
    },
    {}
  );
}

function getTopCounts(
  counts,
  limit = 4
) {
  return Object.entries(counts)
    .sort(
      ([, aCount], [, bCount]) =>
        bCount - aCount
    )
    .slice(0, limit)
    .map(
      ([label, count]) => ({
        label,
        value:
          `${count} booking${
            count === 1
              ? ""
              : "s"
          }`,
      })
    );
}

function getFriendlyDateFilterLabel(
  value
) {
  const labels = {
    thisMonth: "This Month",
    nextMonth: "Next Month",
    pastMonth: "Past Month",
    past90Days: "Past 90 Days",
    next90Days: "Next 90 Days",
    thisYear: "This Year",
    nextYear: "Next Year",
    allTime: "All Time",
    custom: "Custom Date Range",
  };

  return (
    labels[value] ||
    value ||
    "Not set"
  );
}

function getFriendlySourceModeLabel(
  value
) {
  const labels = {
    all: "Forms + Imports",
    forms: "Forms Only",
    imports: "Imports Only",
  };

  return (
    labels[value] ||
    value ||
    "Not set"
  );
}

function bookingHasHousing(
  booking
) {
  const buildingsRooms =
    String(
      booking?.buildingsRooms ||
        ""
    ).trim();

  const roomName =
    String(
      booking?.roomName || ""
    )
      .trim()
      .toLowerCase();

  return Boolean(
    buildingsRooms ||
      (roomName &&
        roomName !==
          "unassigned")
  );
}

function bookingHasMeals(booking) {
  const meals =
    String(
      booking?.meals || ""
    ).trim();

  const form =
    booking?.rentalFormDetails;

  const mealSchedule =
    form?.mealSchedule;

  return Boolean(
    meals ||
      (mealSchedule &&
        typeof mealSchedule ===
          "object" &&
        Object.keys(
          mealSchedule
        ).length > 0)
  );
}

function bookingHasProgram(
  booking
) {
  const activities =
    String(
      booking?.activities || ""
    ).trim();

  const assignments =
    booking
      ?.programLogisticsAssignments;

  return Boolean(
    activities ||
      (Array.isArray(
        assignments
      ) &&
        assignments.length >
          0)
  );
}

function getBackupDetailGroups(backup) {
  const storageData =
    backup?.storageData || {};

  const bookings =
    getBackupBookings(backup);

  const staffUsers =
    getParsedStorageValue(
      storageData,
      STAFF_USERS_STORAGE_KEY,
      []
    );

  const currentStaffUserId =
    storageData[
      CURRENT_STAFF_USER_STORAGE_KEY
    ] || "";

  const currentStaffUser =
    Array.isArray(staffUsers) &&
    currentStaffUserId
      ? staffUsers.find(
          (user) =>
            user.id ===
            currentStaffUserId
        )
      : null;

  const spreadsheetSettings =
    getParsedStorageValue(
      storageData,
      SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
      {}
    );

  const spreadsheetStarredRows =
    getParsedStorageValue(
      storageData,
      SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
      []
    );

  const bookingDetailDateSettings =
    getParsedStorageValue(
      storageData,
      BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
      {}
    );

  const datedInquirySettings =
    getParsedStorageValue(
      storageData,
      DATED_INQUIRY_SETTINGS_STORAGE_KEY,
      {}
    );

  const reportsSettings =
    getParsedStorageValue(
      storageData,
      REPORTS_VIEW_SETTINGS_STORAGE_KEY,
      {}
    );

  const bookingCount =
    bookings.length;

  const staffCount =
    Array.isArray(staffUsers)
      ? staffUsers.length
      : 0;

  const activeStaffCount =
    Array.isArray(staffUsers)
      ? staffUsers.filter(
          (user) =>
            user.active
        ).length
      : 0;

  const starredCount =
    Array.isArray(
      spreadsheetStarredRows
    )
      ? spreadsheetStarredRows.length
      : 0;

  const missingDatesCount =
    bookings.filter(
      (booking) =>
        !booking.startDate
    ).length;

  const missingContactCount =
    bookings.filter(
      (booking) =>
        !booking.email &&
        !booking.phone
    ).length;

  const housingCount =
    bookings.filter(
      bookingHasHousing
    ).length;

  const mealsCount =
    bookings.filter(
      bookingHasMeals
    ).length;

  const programCount =
    bookings.filter(
      bookingHasProgram
    ).length;

  const checklistsCount =
    bookings.filter(
      (booking) =>
        Array.isArray(
          booking?.checklists
        ) &&
        booking.checklists.length >
          0
    ).length;

  const incidentNotesCount =
    bookings.filter(
      (booking) =>
        Boolean(
          String(
            booking
              ?.rentalFormDetails
              ?.incidentNotes ||
              ""
          ).trim()
        )
    ).length;

  const fullFormCount =
    bookings.filter(
      (booking) =>
        booking
          ?.rentalFormDetails &&
        typeof booking
          .rentalFormDetails ===
          "object" &&
        Object.keys(
          booking.rentalFormDetails
        ).length > 0
    ).length;

  const statusItems =
    getTopCounts(
      getCountByField(
        bookings,
        "status"
      ),
      4
    );

  const sourceItems =
    getTopCounts(
      getCountByField(
        bookings,
        "sourceType"
      ),
      4
    );

  const spreadsheetSettingItems =
    getObjectPreviewItems(
      spreadsheetSettings,
      8
    );

  const displaySettingItems = [
    ...getObjectPreviewItems(
      bookingDetailDateSettings,
      6
    ),

    ...getObjectPreviewItems(
      datedInquirySettings,
      6
    ),
  ];

  const reportsSettingItems =
    reportsSettings &&
    typeof reportsSettings ===
      "object"
      ? [
          {
            label: "Date range",
            value:
              getFriendlyDateFilterLabel(
                reportsSettings.dateRange
              ),
          },

          {
            label: "Status",
            value:
              reportsSettings.status ||
              "All statuses",
          },

          {
            label: "Retreat type",
            value:
              reportsSettings.retreatType ||
              "All retreat types",
          },

          {
            label: "Source",
            value:
              getFriendlySourceModeLabel(
                reportsSettings.sourceMode
              ),
          },

          {
            label: "Custom start",
            value:
              reportsSettings.customStartDate ||
              "Not set",
          },

          {
            label: "Custom end",
            value:
              reportsSettings.customEndDate ||
              "Not set",
          },
        ]
      : [];

  const dashboardFilterItems = [
    {
      label:
        "Dated inquiry date range",

      value:
        getFriendlyDateFilterLabel(
          storageData[
            DATED_INQUIRY_DATE_FILTER_STORAGE_KEY
          ]
        ),
    },

    {
      label:
        "Custom start date",

      value:
        storageData[
          DATED_INQUIRY_CUSTOM_START_STORAGE_KEY
        ] || "Not set",
    },

    {
      label:
        "Custom end date",

      value:
        storageData[
          DATED_INQUIRY_CUSTOM_END_STORAGE_KEY
        ] || "Not set",
    },
  ];

  const knownKeys =
    new Set(
      DASHBOARD_BACKUP_CORE_KEYS
    );

  const extraSavedKeys =
    Object.entries(
      storageData
    ).filter(
      ([key, value]) =>
        !knownKeys.has(key) &&
        value !== null &&
        value !== undefined &&
        value !== ""
    );

  return [
    {
      id:
        "booking-database",

      title:
        "Booking database",

      status:
        bookingCount > 0
          ? `${bookingCount} database record${
              bookingCount === 1
                ? ""
                : "s"
            }`
          : "No booking records saved",

      description:
        "Current booking records, including dates, contacts, lodging, meals, program information, checklists, notes, and form details.",

      hasValue:
        bookingCount > 0,

      tone:
        "green",

      items: [
        {
          label:
            "Total bookings",
          value:
            bookingCount,
        },

        {
          label:
            "Housing planned",
          value:
            housingCount,
        },

        {
          label:
            "Meal information",
          value:
            mealsCount,
        },

        {
          label:
            "Program information",
          value:
            programCount,
        },

        {
          label:
            "Checklists",
          value:
            checklistsCount,
        },

        {
          label:
            "Incident notes",
          value:
            incidentNotesCount,
        },

        {
          label:
            "Full booking forms",
          value:
            fullFormCount,
        },

        {
          label:
            "Missing dates",
          value:
            missingDatesCount,
        },

        {
          label:
            "Missing email + phone",
          value:
            missingContactCount,
        },

        ...statusItems.map(
          (item) => ({
            label:
              `Status: ${item.label}`,
            value:
              item.value,
          })
        ),

        ...sourceItems.map(
          (item) => ({
            label:
              `Source: ${item.label}`,
            value:
              item.value,
          })
        ),
      ],
    },

    {
      id:
        "staff-setup",

      title:
        "Staff setup",

      status:
        staffCount > 0
          ? `${staffCount} staff member${
              staffCount === 1
                ? ""
                : "s"
            } saved`
          : "No staff users saved",

      description:
        "Staff users, roles, active status, and current staff selection.",

      hasValue:
        getBackupHasAnyValue(
          storageData,
          [
            STAFF_USERS_STORAGE_KEY,
            CURRENT_STAFF_USER_STORAGE_KEY,
          ]
        ),

      tone:
        "blue",

      items: [
        {
          label:
            "Total staff",
          value:
            staffCount,
        },

        {
          label:
            "Active staff",
          value:
            activeStaffCount,
        },

        {
          label:
            "Current staff user",
          value:
            currentStaffUser?.name ||
            "Not selected",
        },

        {
          label:
            "Saved staff names",

          value:
            Array.isArray(
              staffUsers
            ) &&
            staffUsers.length > 0
              ? staffUsers
                  .map(
                    (user) =>
                      user.name
                  )
                  .join(", ")
              : "None",
        },
      ],
    },

    {
      id:
        "spreadsheet-preferences",

      title:
        "Spreadsheet preferences",

      status:
        spreadsheetSettingItems.length >
          0 ||
        starredCount > 0
          ? `${spreadsheetSettingItems.length} setting${
              spreadsheetSettingItems.length ===
              1
                ? ""
                : "s"
            } · ${starredCount} starred row${
              starredCount === 1
                ? ""
                : "s"
            }`
          : "No spreadsheet preferences saved",

      description:
        "Spreadsheet layout, filters, saved display choices, and starred rows.",

      hasValue:
        getBackupHasAnyValue(
          storageData,
          [
            SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
            SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
          ]
        ),

      tone:
        "purple",

      items: [
        {
          label:
            "Starred rows",
          value:
            starredCount,
        },

        ...spreadsheetSettingItems,
      ],
    },

    {
      id:
        "dashboard-filters",

      title:
        "Dashboard filters",

      status:
        getBackupHasAnyValue(
          storageData,
          [
            DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
            DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
            DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
          ]
        )
          ? "Saved dashboard filter choices"
          : "No dashboard filters saved",

      description:
        "Date-range choices used by the dashboard's dated-booking displays.",

      hasValue:
        getBackupHasAnyValue(
          storageData,
          [
            DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
            DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
            DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
          ]
        ),

      tone:
        "gold",

      items:
        dashboardFilterItems,
    },

    {
      id:
        "display-settings",

      title:
        "Display settings",

      status:
        displaySettingItems.length >
          0
          ? `${displaySettingItems.length} display setting${
              displaySettingItems.length ===
              1
                ? ""
                : "s"
            } saved`
          : "No display settings saved",

      description:
        "Booking date formatting and dated-inquiry display choices.",

      hasValue:
        getBackupHasAnyValue(
          storageData,
          [
            BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
            DATED_INQUIRY_SETTINGS_STORAGE_KEY,
          ]
        ),

      tone:
        "teal",

      items:
        displaySettingItems,
    },

    {
      id:
        "reports-settings",

      title:
        "Reports settings",

      status:
        reportsSettingItems.length >
          0
          ? `${reportsSettingItems.length} report setting${
              reportsSettingItems.length ===
              1
                ? ""
                : "s"
            } saved`
          : "No report settings saved",

      description:
        "Reports filters such as date range, booking status, retreat type, and source.",

      hasValue:
        getBackupHasAnyValue(
          storageData,
          [
            REPORTS_VIEW_SETTINGS_STORAGE_KEY,
          ]
        ),

      tone:
        "indigo",

      items:
        reportsSettingItems,
    },

    {
      id:
        "other-app-data",

      title:
        "Other browser data",

      status:
        extraSavedKeys.length >
          0
          ? `${extraSavedKeys.length} additional saved area${
              extraSavedKeys.length ===
              1
                ? ""
                : "s"
            }`
          : "No additional browser data",

      description:
        "Additional Toah Nipi settings added by newer or future dashboard features.",

      hasValue:
        extraSavedKeys.length >
        0,

      tone:
        "gray",

      items:
        extraSavedKeys.length >
        0
          ? extraSavedKeys.map(
              ([key, value]) => ({
                label:
                  key,

                value:
                  getReadableBackupValue(
                    safeParseJson(
                      value,
                      value
                    )
                  ),
              })
            )
          : [
              {
                label:
                  "Additional browser data",
                value:
                  "None",
              },
            ],
    },
  ];
}

/* =========================================================
   TECHNICAL BACKUP DETAILS
========================================================= */

function getBackupTechnicalCategory(
  key
) {
  if (
    key ===
      STAFF_USERS_STORAGE_KEY ||
    key ===
      CURRENT_STAFF_USER_STORAGE_KEY
  ) {
    return "Staff data";
  }

  if (
    key ===
      SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY ||
    key ===
      SPREADSHEET_VIEW_STARRED_STORAGE_KEY
  ) {
    return "Spreadsheet";
  }

  if (
    key ===
    REPORTS_VIEW_SETTINGS_STORAGE_KEY
  ) {
    return "Reports";
  }

  if (
    key ===
      DATED_INQUIRY_SETTINGS_STORAGE_KEY ||
    key ===
      DATED_INQUIRY_DATE_FILTER_STORAGE_KEY ||
    key ===
      DATED_INQUIRY_CUSTOM_START_STORAGE_KEY ||
    key ===
      DATED_INQUIRY_CUSTOM_END_STORAGE_KEY ||
    key ===
      BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY
  ) {
    return "Dashboard settings";
  }

  return "Other browser data";
}

function getTechnicalValueInfo(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      hasValue: false,
      typeLabel: "Empty",
      summary: "No saved value",
      parsedValue: null,
    };
  }

  const textValue =
    String(value);

  let parsedValue;

  try {
    parsedValue =
      JSON.parse(textValue);
  } catch {
    return {
      hasValue: true,
      typeLabel: "Plain text",
      summary:
        textValue,
      parsedValue:
        textValue,
    };
  }

  if (
    Array.isArray(
      parsedValue
    )
  ) {
    return {
      hasValue: true,
      typeLabel: "JSON array",
      summary:
        `${parsedValue.length} item${
          parsedValue.length ===
          1
            ? ""
            : "s"
        }`,
      parsedValue,
    };
  }

  if (
    parsedValue &&
    typeof parsedValue ===
      "object"
  ) {
    const keyCount =
      Object.keys(
        parsedValue
      ).length;

    return {
      hasValue: true,
      typeLabel: "JSON object",
      summary:
        `${keyCount} field${
          keyCount === 1
            ? ""
            : "s"
        }`,
      parsedValue,
    };
  }

  return {
    hasValue: true,
    typeLabel:
      typeof parsedValue,

    summary:
      String(parsedValue),

    parsedValue,
  };
}

function getTechnicalCompactPreview(
  value
) {
  const info =
    getTechnicalValueInfo(
      value
    );

  if (!info.hasValue) {
    return "null";
  }

  const parsedValue =
    info.parsedValue;

  if (
    Array.isArray(
      parsedValue
    )
  ) {
    if (
      parsedValue.length ===
      0
    ) {
      return "[]";
    }

    const firstItem =
      parsedValue[0];

    if (
      firstItem &&
      typeof firstItem ===
        "object" &&
      !Array.isArray(
        firstItem
      )
    ) {
      const keys =
        Object.keys(
          firstItem
        );

      return `[${parsedValue.length} object${
        parsedValue.length ===
        1
          ? ""
          : "s"
      } · fields: ${keys
        .slice(0, 6)
        .join(", ")}${
        keys.length > 6
          ? ", …"
          : ""
      }]`;
    }
  }

  if (
    parsedValue &&
    typeof parsedValue ===
      "object"
  ) {
    const keys =
      Object.keys(
        parsedValue
      );

    return `{ ${keys
      .slice(0, 8)
      .join(", ")}${
      keys.length > 8
        ? ", …"
        : ""
    } }`;
  }

  const text =
    typeof parsedValue ===
    "string"
      ? parsedValue
      : JSON.stringify(
          parsedValue
        );

  return text.length > 180
    ? `${text.slice(
        0,
        180
      )}…`
    : text;
}

function getTechnicalRawPreview(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "No saved value";
  }

  let previewText;

  try {
    previewText =
      JSON.stringify(
        JSON.parse(
          String(value)
        ),
        null,
        2
      );
  } catch {
    previewText =
      String(value);
  }

  if (
    previewText.length >
    1200
  ) {
    return `${previewText.slice(
      0,
      1200
    )}\n...`;
  }

  return previewText;
}

function getBackupTechnicalRows(
  backup
) {
  const storageData =
    backup?.storageData || {};

  const bookings =
    getBackupBookings(backup);

  const bookingJson =
    JSON.stringify(bookings);

  const databaseRow = {
    key:
      "bookings",

    path:
      "bookings",

    label:
      "Booking database records",

    category:
      "Database",

    hasValue:
      bookings.length > 0,

    typeLabel:
      "JSON array",

    summary:
      `${bookings.length} booking${
        bookings.length === 1
          ? ""
          : "s"
      }`,

    sizeLabel:
      formatBackupStorageSize(
        bookingJson
      ),

    compactPreview:
      getTechnicalCompactPreview(
        bookingJson
      ),

    preview:
      getTechnicalRawPreview(
        bookingJson
      ),
  };

  const browserRows =
    Object.entries(
      storageData
    ).map(
      ([key, value]) => {
        const valueInfo =
          getTechnicalValueInfo(
            value
          );

        return {
          key,

          path:
            `storageData.${key}`,

          label:
            DASHBOARD_BACKUP_KEY_LABELS[
              key
            ] || key,

          category:
            getBackupTechnicalCategory(
              key
            ),

          hasValue:
            valueInfo.hasValue,

          typeLabel:
            valueInfo.typeLabel,

          summary:
            valueInfo.summary,

          sizeLabel:
            formatBackupStorageSize(
              value
            ),

          compactPreview:
            getTechnicalCompactPreview(
              value
            ),

          preview:
            getTechnicalRawPreview(
              value
            ),
        };
      }
    );

  return [
    databaseRow,
    ...browserRows,
  ].sort((a, b) => {
    if (
      a.category ===
      "Database"
    ) {
      return -1;
    }

    if (
      b.category ===
      "Database"
    ) {
      return 1;
    }

    if (
      a.hasValue !==
      b.hasValue
    ) {
      return a.hasValue
        ? -1
        : 1;
    }

    return (
      a.category.localeCompare(
        b.category
      ) ||
      a.label.localeCompare(
        b.label
      )
    );
  });
}

/* =========================================================
   TOOLBAR
========================================================= */

function DashboardBackupControls({
  onExportBackup,
  onOpenBackupModal,
  isBusy,
}) {
  return (
    <section
      className="dashboard-backup-toolbar"
      aria-label="Dashboard backups"
    >
      <div className="dashboard-backup-toolbar-copy">
        <p className="dashboard-eyebrow">
          Backups
        </p>

        <strong>
          Database + dashboard backup
        </strong>

        <span>
          Export live booking records together with staff,
          spreadsheet, report, and browser settings.
        </span>
      </div>

      <div className="dashboard-backup-toolbar-actions">
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={
            onOpenBackupModal
          }
          disabled={isBusy}
        >
          <FaUpload />
          Import / Restore
        </button>

        <button
          className="primary-dashboard-button"
          type="button"
          onClick={
            onExportBackup
          }
          disabled={isBusy}
        >
          <FaDownload />

          {isBusy
            ? "Working..."
            : "Export Backup"}
        </button>
      </div>
    </section>
  );
}

/* =========================================================
   FRIENDLY CARD
========================================================= */

function BackupFriendlyCard({
  group,
  isExpanded,
  onToggle,
}) {
  return (
    <article
      className={[
        "dashboard-backup-friendly-card",
        `dashboard-backup-friendly-card-${group.tone}`,
        isExpanded
          ? "dashboard-backup-friendly-card-expanded"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        className="dashboard-backup-friendly-card-button"
        type="button"
        onClick={onToggle}
        aria-expanded={
          isExpanded
        }
      >
        <span className="dashboard-backup-friendly-icon">
          <FaCheckCircle />
        </span>

        <span className="dashboard-backup-friendly-main">
          <span className="dashboard-backup-friendly-title">
            {group.title}
          </span>

          <strong>
            {group.status}
          </strong>

          <span className="dashboard-backup-friendly-description">
            {group.description}
          </span>
        </span>

        <span className="dashboard-backup-friendly-expand-label">
          {isExpanded
            ? "Hide"
            : "Details"}
        </span>
      </button>

      {isExpanded && (
        <div className="dashboard-backup-friendly-quick-details">
          {group.items.map(
            (item, index) => (
              <div
                key={`${group.id}-${item.label}-${index}`}
              >
                <span>
                  {item.label}
                </span>

                <strong>
                  {String(
                    item.value
                  )}
                </strong>
              </div>
            )
          )}
        </div>
      )}
    </article>
  );
}

/* =========================================================
   TECHNICAL PANEL
========================================================= */

function BackupTechnicalPanel({
  backup,
}) {
  const technicalRows =
    useMemo(
      () =>
        getBackupTechnicalRows(
          backup
        ),
      [backup]
    );

  const savedRows =
    technicalRows.filter(
      (row) =>
        row.hasValue
    );

  const emptyRows =
    technicalRows.filter(
      (row) =>
        !row.hasValue
    );

  const totalSize =
    formatBackupStorageSize(
      JSON.stringify({
        bookings:
          getBackupBookings(
            backup
          ),

        storageData:
          backup.storageData ||
          {},
      })
    );

  return (
    <div className="dashboard-backup-technical-panel">
      <div className="dashboard-backup-technical-manifest-top">
        <div>
          <strong>
            Backup manifest
          </strong>

          <span>
            Exact database and browser-storage areas stored in this backup.
          </span>
        </div>

        <code>
          version:{" "}
          {backup.version ||
            DASHBOARD_BACKUP_VERSION}
        </code>
      </div>

      <div className="dashboard-backup-technical-compact-summary">
        <span>
          <strong>
            {technicalRows.length}
          </strong>
          areas
        </span>

        <span>
          <strong>
            {savedRows.length}
          </strong>
          saved
        </span>

        <span>
          <strong>
            {emptyRows.length}
          </strong>
          empty
        </span>

        <span>
          <strong>
            {totalSize}
          </strong>
          total
        </span>
      </div>

      <div
        className="dashboard-backup-technical-manifest"
        aria-label="Technical backup manifest"
      >
        <div className="dashboard-backup-technical-manifest-heading">
          <span>Key</span>
          <span>Area</span>
          <span>Type</span>
          <span>Summary</span>
          <span>Size</span>
        </div>

        {technicalRows.map(
          (row) => (
            <details
              className={[
                "dashboard-backup-technical-manifest-row",

                !row.hasValue
                  ? "is-empty"
                  : "",

                row.category ===
                "Database"
                  ? "is-database"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={row.key}
            >
              <summary>
                <span className="dashboard-backup-technical-key-cell">
                  <code>
                    {row.key}
                  </code>

                  <small>
                    {row.label}
                  </small>
                </span>

                <span>
                  {row.category}
                </span>

                <span>
                  {row.typeLabel}
                </span>

                <span>
                  {row.summary}
                </span>

                <span>
                  {row.sizeLabel}
                </span>
              </summary>

              <div className="dashboard-backup-technical-manifest-preview">
                <div>
                  <small>
                    Path
                  </small>

                  <code>
                    {row.path}
                  </code>
                </div>

                <div>
                  <small>
                    Compact value
                  </small>

                  <code>
                    {row.compactPreview}
                  </code>
                </div>

                <details className="dashboard-backup-technical-raw-preview">
                  <summary>
                    Show raw preview
                  </summary>

                  <pre>
                    {row.preview}
                  </pre>
                </details>
              </div>
            </details>
          )
        )}
      </div>
    </div>
  );
}

/* =========================================================
   BACKUP MODAL
========================================================= */

function DashboardBackupModal({
  backupHistory,
  onClose,
  onRestoreBackup,
  onDeleteBackup,
  onImportBackupFile,
  busyAction,
}) {
  const backupFileInputRef =
    useRef(null);

  const [
    expandedBackupId,
    setExpandedBackupId,
  ] = useState(
    backupHistory[0]?.id || ""
  );

  const [
    detailMode,
    setDetailMode,
  ] = useState("friendly");

  const [
    expandedFriendlyGroupId,
    setExpandedFriendlyGroupId,
  ] = useState("");

  useEffect(() => {
    if (
      !expandedBackupId &&
      backupHistory[0]?.id
    ) {
      setExpandedBackupId(
        backupHistory[0].id
      );
    }
  }, [
    backupHistory,
    expandedBackupId,
  ]);

  useEffect(() => {
    setExpandedFriendlyGroupId(
      ""
    );
  }, [
    expandedBackupId,
    detailMode,
  ]);

  return (
    <div
      className="dashboard-backup-backdrop"
      role="presentation"
    >
      <section
        className="dashboard-backup-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard backup library"
      >
        <header className="dashboard-backup-modal-header">
          <div className="dashboard-backup-modal-heading">
            <span className="dashboard-backup-modal-icon">
              <FaDatabase />
            </span>

            <div>
              <p className="dashboard-eyebrow">
                Backup Library
              </p>

              <h3>
                Restore Dashboard Backup
              </h3>

              <span>
                Backups contain live booking data plus this browser's
                dashboard settings. Older Version 1 backups are supported.
              </span>
            </div>
          </div>

          <button
            className="dashboard-backup-close-button"
            type="button"
            onClick={onClose}
            aria-label="Close backup modal"
            disabled={Boolean(
              busyAction
            )}
          >
            <FaTimes />
          </button>
        </header>

        <div className="dashboard-backup-modal-actions">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={() =>
              backupFileInputRef.current?.click()
            }
            disabled={Boolean(
              busyAction
            )}
          >
            <FaUpload />

            {busyAction ===
            "import"
              ? "Importing..."
              : "Upload Backup File"}
          </button>

          <input
            ref={
              backupFileInputRef
            }
            className="dashboard-file-input"
            type="file"
            accept="application/json,.json"
            onChange={
              onImportBackupFile
            }
          />

          <p>
            Uploading a JSON file adds it here for review before anything is restored.
          </p>
        </div>

        <div className="dashboard-backup-modal-body">
          {backupHistory.length >
          0 ? (
            <div className="dashboard-backup-list">
              {backupHistory.map(
                (
                  backup,
                  index
                ) => {
                  const stats =
                    backup.stats ||
                    getBackupStats(
                      backup
                    );

                  const isExpanded =
                    expandedBackupId ===
                    backup.id;

                  const detailGroups =
                    getBackupDetailGroups(
                      backup
                    );

                  const savedGroups =
                    detailGroups.filter(
                      (group) =>
                        group.hasValue
                    );

                  const emptyGroups =
                    detailGroups.filter(
                      (group) =>
                        !group.hasValue
                    );

                  return (
                    <article
                      className={[
                        "dashboard-backup-card",

                        index === 0
                          ? "dashboard-backup-card-latest"
                          : "",
                      ]
                        .filter(
                          Boolean
                        )
                        .join(" ")}
                      key={
                        backup.id
                      }
                    >
                      <div className="dashboard-backup-card-main">
                        <div>
                          <div className="dashboard-backup-title-row">
                            <h4>
                              {index ===
                              0
                                ? "Most Recent Backup"
                                : "Saved Backup"}
                            </h4>

                            {backup.importedAt && (
                              <span className="dashboard-backup-pill">
                                Imported file
                              </span>
                            )}

                            {backup.migratedFromLegacy && (
                              <span className="dashboard-backup-pill dashboard-backup-pill-legacy">
                                Legacy backup migrated
                              </span>
                            )}
                          </div>

                          <p>
                            {formatBackupDate(
                              backup.createdAt
                            )}
                          </p>
                        </div>

                        <div className="dashboard-backup-stats">
                          <span>
                            <strong>
                              {
                                stats.bookingCount
                              }
                            </strong>
                            Bookings
                          </span>

                          <span>
                            <strong>
                              {
                                stats.staffCount
                              }
                            </strong>
                            Staff
                          </span>

                          <span>
                            <strong>
                              {
                                stats.starredCount
                              }
                            </strong>
                            Starred
                          </span>

                          <span>
                            <strong>
                              {
                                stats.savedKeysCount
                              }
                            </strong>
                            Browser areas
                          </span>
                        </div>
                      </div>

                      <aside className="dashboard-backup-card-actions">
                        <button
                          className="secondary-dashboard-button"
                          type="button"
                          onClick={() =>
                            setExpandedBackupId(
                              isExpanded
                                ? ""
                                : backup.id
                            )
                          }
                          disabled={Boolean(
                            busyAction
                          )}
                        >
                          <FaInfoCircle />

                          {isExpanded
                            ? "Hide Details"
                            : "View Details"}
                        </button>

                        <button
                          className="primary-dashboard-button"
                          type="button"
                          onClick={() =>
                            onRestoreBackup(
                              backup
                            )
                          }
                          disabled={Boolean(
                            busyAction
                          )}
                        >
                          {busyAction ===
                          `restore:${backup.id}`
                            ? "Restoring..."
                            : "Restore"}
                        </button>

                        <button
                          className="dashboard-backup-delete-button"
                          type="button"
                          onClick={() =>
                            onDeleteBackup(
                              backup.id
                            )
                          }
                          aria-label="Delete backup"
                          disabled={Boolean(
                            busyAction
                          )}
                        >
                          <FaTrashAlt />
                        </button>
                      </aside>

                      {isExpanded && (
                        <div className="dashboard-backup-details">
                          <div className="dashboard-backup-details-header">
                            <div>
                              <strong>
                                Backup contents
                              </strong>

                              <p>
                                Review the snapshot before restoring it.
                              </p>
                            </div>

                            <span>
                              {
                                savedGroups.length
                              }{" "}
                              active area
                              {savedGroups.length ===
                              1
                                ? ""
                                : "s"}
                            </span>
                          </div>

                          <div
                            className="dashboard-backup-detail-mode-toggle"
                            role="tablist"
                            aria-label="Backup detail display mode"
                          >
                            <button
                              className={
                                detailMode ===
                                "friendly"
                                  ? "active"
                                  : ""
                              }
                              type="button"
                              onClick={() =>
                                setDetailMode(
                                  "friendly"
                                )
                              }
                            >
                              Friendly
                            </button>

                            <button
                              className={
                                detailMode ===
                                "technical"
                                  ? "active"
                                  : ""
                              }
                              type="button"
                              onClick={() =>
                                setDetailMode(
                                  "technical"
                                )
                              }
                            >
                              Technical
                            </button>
                          </div>

                          {detailMode ===
                          "friendly" ? (
                            <>
                              <div className="dashboard-backup-friendly-list">
                                {savedGroups.map(
                                  (
                                    group
                                  ) => (
                                    <BackupFriendlyCard
                                      key={
                                        group.id
                                      }
                                      group={
                                        group
                                      }
                                      isExpanded={
                                        expandedFriendlyGroupId ===
                                        group.id
                                      }
                                      onToggle={() =>
                                        setExpandedFriendlyGroupId(
                                          expandedFriendlyGroupId ===
                                            group.id
                                            ? ""
                                            : group.id
                                        )
                                      }
                                    />
                                  )
                                )}
                              </div>

                              {emptyGroups.length >
                                0 && (
                                <details className="dashboard-backup-empty-details">
                                  <summary>
                                    Show areas that were not saved in this backup
                                  </summary>

                                  <div className="dashboard-backup-empty-detail-list">
                                    {emptyGroups.map(
                                      (
                                        group
                                      ) => (
                                        <div
                                          key={
                                            group.id
                                          }
                                        >
                                          <span>
                                            {
                                              group.title
                                            }
                                          </span>

                                          <small>
                                            {
                                              group.status
                                            }
                                          </small>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </details>
                              )}
                            </>
                          ) : (
                            <BackupTechnicalPanel
                              backup={
                                backup
                              }
                            />
                          )}
                        </div>
                      )}
                    </article>
                  );
                }
              )}
            </div>
          ) : (
            <div className="dashboard-backup-empty">
              <FaDatabase />

              <strong>
                No backups saved yet
              </strong>

              <p>
                Export a backup to create a JSON snapshot of the live booking database and dashboard settings.
              </p>
            </div>
          )}
        </div>

        <footer className="dashboard-backup-modal-footer">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={onClose}
            disabled={Boolean(
              busyAction
            )}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function DashboardBackups({
  onRestoreComplete,
}) {
  const [
    isBackupModalOpen,
    setIsBackupModalOpen,
  ] = useState(false);

  const [
    backupHistory,
    setBackupHistory,
  ] = useState(() =>
    getDashboardBackupHistory()
  );

  const [
    busyAction,
    setBusyAction,
  ] = useState("");

  const isBusy =
    Boolean(busyAction);

  /* ---------------------------------------------------------
     EXPORT CURRENT DATABASE + SETTINGS
  --------------------------------------------------------- */

  const exportDashboardBackup =
    async () => {
      if (isBusy) {
        return;
      }

      setBusyAction("export");

      try {
        const backup =
          await createDashboardBackupSnapshot();

        const persistedHistory =
          saveDashboardBackupHistory([
            backup,
            ...backupHistory,
          ]);

        const wasSavedToHistory =
          persistedHistory.some(
            (savedBackup) =>
              savedBackup.id ===
              backup.id
          );

        /*
          Keep the new backup visible in this session even if it was
          too large for localStorage history.
        */
        setBackupHistory(
          wasSavedToHistory
            ? persistedHistory
            : [
                backup,
                ...persistedHistory,
              ]
        );

        downloadDashboardBackupFile(
          backup
        );

        if (
          wasSavedToHistory
        ) {
          alert(
            `Backup complete.\n\n${backup.stats.bookingCount} booking record${
              backup.stats.bookingCount ===
              1
                ? ""
                : "s"
            } were exported with dashboard settings.`
          );
        } else {
          alert(
            `Backup complete.\n\n${backup.stats.bookingCount} booking record${
              backup.stats.bookingCount ===
              1
                ? ""
                : "s"
            } were exported.\n\nThis snapshot was too large to keep in browser backup history, so keep the downloaded JSON file.`
          );
        }
      } catch (error) {
        console.error(
          "Could not export dashboard backup:",
          error
        );

        alert(
          "Sorry, the backup could not be created. No booking data was changed."
        );
      } finally {
        setBusyAction("");
      }
    };

  /* ---------------------------------------------------------
     EXACT SNAPSHOT RESTORE
  --------------------------------------------------------- */

  const restoreDashboardBackup =
    async (backup) => {
      if (isBusy) {
        return;
      }

      const backupBookings =
        getBackupBookings(
          backup
        );

      const confirmed =
        window.confirm(
          `Restore this backup?\n\nIt contains ${backupBookings.length} booking record${
            backupBookings.length ===
            1
              ? ""
              : "s"
          }.\n\nThe live booking database and dashboard settings will be returned to this snapshot.`
        );

      if (!confirmed) {
        return;
      }

      setBusyAction(
        `restore:${backup.id}`
      );

      try {
        const bookingsMissingIds =
          backupBookings.filter(
            (booking) =>
              !booking?.id
          );

        if (
          bookingsMissingIds.length >
          0
        ) {
          throw new Error(
            `${bookingsMissingIds.length} backup booking(s) are missing IDs.`
          );
        }

        const currentBookings =
          await fetchBookings();

        if (
          backupBookings.length >
          0
        ) {
          /*
            Safety order:
            1. Write/update the snapshot records.
            2. Only after that succeeds, remove records that did
               not exist in the backup.
          */
          await upsertBookings(
            backupBookings
          );

          const backupIds =
            new Set(
              backupBookings.map(
                (booking) =>
                  String(
                    booking.id
                  )
              )
            );

          const extraCurrentBookings =
            (
              Array.isArray(
                currentBookings
              )
                ? currentBookings
                : []
            ).filter(
              (booking) =>
                booking?.id &&
                !backupIds.has(
                  String(
                    booking.id
                  )
                )
            );

          for (
            const booking of
            extraCurrentBookings
          ) {
            await deleteBooking(
              booking.id
            );
          }
        } else {
          await deleteAllBookings();
        }

        /*
          Restore browser settings as an exact snapshot too,
          while preserving the backup library itself.
        */
        const backupStorageData =
          backup.storageData ||
          {};

        const currentRestorableKeys =
          getDashboardBackupKeys();

        const allRestorableKeys =
          Array.from(
            new Set([
              ...currentRestorableKeys,
              ...Object.keys(
                backupStorageData
              ),
            ])
          );

        allRestorableKeys.forEach(
          (key) => {
            if (
              key ===
                DASHBOARD_BACKUP_HISTORY_STORAGE_KEY ||
              key ===
                LEGACY_BOOKINGS_STORAGE_KEY
            ) {
              return;
            }

            const hasBackupValue =
              Object.prototype.hasOwnProperty.call(
                backupStorageData,
                key
              ) &&
              backupStorageData[
                key
              ] !== null &&
              backupStorageData[
                key
              ] !== undefined;

            if (
              hasBackupValue
            ) {
              localStorage.setItem(
                key,
                backupStorageData[
                  key
                ]
              );
            } else {
              localStorage.removeItem(
                key
              );
            }
          }
        );

        /*
          Remove the obsolete local booking cache so it cannot
          compete with the current database-backed system.
        */
        localStorage.removeItem(
          LEGACY_BOOKINGS_STORAGE_KEY
        );

        onRestoreComplete?.();

        alert(
          `Backup restored successfully.\n\n${backupBookings.length} booking record${
            backupBookings.length ===
            1
              ? ""
              : "s"
          } restored. The dashboard will now reload.`
        );

        window.location.reload();
      } catch (error) {
        console.error(
          "Could not restore dashboard backup:",
          error
        );

        alert(
          `Sorry, the backup could not be completely restored.\n\n${
            error?.message ||
            "Unknown restore error"
          }`
        );
      } finally {
        setBusyAction("");
      }
    };

  /* ---------------------------------------------------------
     DELETE BROWSER-HISTORY COPY
  --------------------------------------------------------- */

  const deleteDashboardBackup =
    (backupId) => {
      if (isBusy) {
        return;
      }

      const confirmed =
        window.confirm(
          "Delete this saved backup from browser history?"
        );

      if (!confirmed) {
        return;
      }

      const nextHistory =
        backupHistory.filter(
          (backup) =>
            backup.id !==
            backupId
        );

      const persistedHistory =
        saveDashboardBackupHistory(
          nextHistory
        );

      setBackupHistory(
        persistedHistory
      );
    };

  /* ---------------------------------------------------------
     IMPORT JSON FILE
  --------------------------------------------------------- */

  const importDashboardBackupFile =
    async (event) => {
      const file =
        event.target.files?.[0];

      if (!file || isBusy) {
        return;
      }

      setBusyAction("import");

      try {
        const fileText =
          await file.text();

        const parsedBackup =
          JSON.parse(fileText);

        const normalizedBackup =
          normalizeImportedDashboardBackup(
            parsedBackup
          );

        if (
          !normalizedBackup
        ) {
          alert(
            "That file does not look like a valid Toah Nipi dashboard backup."
          );

          return;
        }

        const persistedHistory =
          saveDashboardBackupHistory([
            normalizedBackup,
            ...backupHistory,
          ]);

        const wasSaved =
          persistedHistory.some(
            (backup) =>
              backup.id ===
              normalizedBackup.id
          );

        setBackupHistory(
          wasSaved
            ? persistedHistory
            : [
                normalizedBackup,
                ...persistedHistory,
              ]
        );

        if (wasSaved) {
          alert(
            `Backup file imported.\n\n${normalizedBackup.stats.bookingCount} booking record${
              normalizedBackup.stats.bookingCount ===
              1
                ? ""
                : "s"
            } detected. Review the backup before restoring it.`
          );
        } else {
          alert(
            `Backup file imported for this session.\n\n${normalizedBackup.stats.bookingCount} booking record${
              normalizedBackup.stats.bookingCount ===
              1
                ? ""
                : "s"
            } detected.\n\nIt is too large to keep permanently in browser backup history, but you can still review and restore it now.`
          );
        }
      } catch (error) {
        console.error(
          "Could not import dashboard backup file:",
          error
        );

        alert(
          "Sorry, that backup file could not be imported."
        );
      } finally {
        event.target.value =
          "";

        setBusyAction("");
      }
    };

  return (
    <>
      <DashboardBackupControls
        onExportBackup={
          exportDashboardBackup
        }
        onOpenBackupModal={() => {
          setBackupHistory(
            getDashboardBackupHistory()
          );

          setIsBackupModalOpen(
            true
          );
        }}
        isBusy={isBusy}
      />

      {isBackupModalOpen && (
        <DashboardBackupModal
          backupHistory={
            backupHistory
          }
          onClose={() =>
            setIsBackupModalOpen(
              false
            )
          }
          onRestoreBackup={
            restoreDashboardBackup
          }
          onDeleteBackup={
            deleteDashboardBackup
          }
          onImportBackupFile={
            importDashboardBackupFile
          }
          busyAction={
            busyAction
          }
        />
      )}
    </>
  );
}
