import { useEffect, useRef, useState } from "react";

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
  DATED_INQUIRY_SETTINGS_STORAGE_KEY,
  DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
  DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
  BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
  REPORTS_VIEW_SETTINGS_STORAGE_KEY,
} from "../constants/dashboardConstants";

import {
  SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
  SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
} from "../constants/dashboardConstants";

const STAFF_USERS_STORAGE_KEY = "toahNipiStaffUsers";
const CURRENT_STAFF_USER_STORAGE_KEY = "toahNipiCurrentStaffUserId";


const DASHBOARD_BACKUP_HISTORY_STORAGE_KEY = "toahNipiDashboardBackupHistory";
const DASHBOARD_BACKUP_VERSION = 1;
const MAX_DASHBOARD_BACKUPS_TO_KEEP = 12;

const DASHBOARD_BACKUP_CORE_KEYS = [
  "toahNipiPublicInquiries",
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
  toahNipiPublicInquiries: "Bookings, inquiries, imports, checklists, assignments",
  [STAFF_USERS_STORAGE_KEY]: "Staff users",
  [CURRENT_STAFF_USER_STORAGE_KEY]: "Current staff user",
  [DATED_INQUIRY_SETTINGS_STORAGE_KEY]: "Dated inquiry display settings",
  [DATED_INQUIRY_DATE_FILTER_STORAGE_KEY]: "Dated inquiry date filter",
  [DATED_INQUIRY_CUSTOM_START_STORAGE_KEY]: "Dated inquiry custom start date",
  [DATED_INQUIRY_CUSTOM_END_STORAGE_KEY]: "Dated inquiry custom end date",
  [BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY]: "Booking detail date settings",
  [REPORTS_VIEW_SETTINGS_STORAGE_KEY]: "Reports settings",
  [SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY]: "Spreadsheet view settings",
  [SPREADSHEET_VIEW_STARRED_STORAGE_KEY]: "Spreadsheet starred rows",
};

function createDashboardBackupId() {
  return `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParseBackupJson(value, fallbackValue = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function getDashboardBackupKeys() {
  const backupKeys = new Set(DASHBOARD_BACKUP_CORE_KEYS);

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (
        key &&
        key.startsWith("toahNipi") &&
        key !== DASHBOARD_BACKUP_HISTORY_STORAGE_KEY
      ) {
        backupKeys.add(key);
      }
    }
  } catch (error) {
    console.error("Could not scan dashboard storage keys:", error);
  }

  return Array.from(backupKeys).sort((a, b) => a.localeCompare(b));
}

function getDashboardBackupHistory() {
  try {
    const savedBackups = localStorage.getItem(
      DASHBOARD_BACKUP_HISTORY_STORAGE_KEY
    );

    if (!savedBackups) {
      return [];
    }

    const parsedBackups = JSON.parse(savedBackups);

    if (!Array.isArray(parsedBackups)) {
      return [];
    }

    return parsedBackups
      .filter((backup) => backup && backup.id && backup.createdAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    console.error("Could not read dashboard backup history:", error);
    return [];
  }
}

function saveDashboardBackupHistory(backups) {
  try {
    const backupsToSave = [...backups]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, MAX_DASHBOARD_BACKUPS_TO_KEEP);

    localStorage.setItem(
      DASHBOARD_BACKUP_HISTORY_STORAGE_KEY,
      JSON.stringify(backupsToSave)
    );

    return backupsToSave;
  } catch (error) {
    console.error("Could not save dashboard backup history:", error);
    return backups;
  }
}

function getBackupStorageData() {
  const storageData = {};

  getDashboardBackupKeys().forEach((key) => {
    storageData[key] = localStorage.getItem(key);
  });

  return storageData;
}

function getArrayCountFromBackupValue(value) {
  const parsedValue = safeParseBackupJson(value, []);

  return Array.isArray(parsedValue) ? parsedValue.length : 0;
}

function getObjectKeyCountFromBackupValue(value) {
  const parsedValue = safeParseBackupJson(value, {});

  return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
    ? Object.keys(parsedValue).length
    : 0;
}

function getBackupStats(backup) {
  const storageData = backup?.storageData || {};

  const bookingCount = getArrayCountFromBackupValue(
    storageData.toahNipiPublicInquiries
  );

  const staffCount = getArrayCountFromBackupValue(
    storageData[STAFF_USERS_STORAGE_KEY]
  );

  const starredCount = getArrayCountFromBackupValue(
    storageData[SPREADSHEET_VIEW_STARRED_STORAGE_KEY]
  );

  const savedKeysCount = Object.values(storageData).filter(
    (value) => value !== null && value !== undefined
  ).length;

  return {
    bookingCount,
    staffCount,
    starredCount,
    savedKeysCount,
  };
}

function createDashboardBackupSnapshot() {
  const createdAt = new Date().toISOString();
  const storageData = getBackupStorageData();

  const backup = {
    id: createDashboardBackupId(),
    appName: "Toah Nipi Staff Dashboard",
    backupType: "dashboard-local-storage",
    version: DASHBOARD_BACKUP_VERSION,
    createdAt,
    storageData,
  };

  return {
    ...backup,
    stats: getBackupStats(backup),
  };
}

function normalizeImportedDashboardBackup(rawBackup) {
  if (!rawBackup || typeof rawBackup !== "object") {
    return null;
  }

  const storageData = rawBackup.storageData || rawBackup.localStorageData;

  if (!storageData || typeof storageData !== "object") {
    return null;
  }

  const normalizedBackup = {
    id: rawBackup.id || createDashboardBackupId(),
    appName: rawBackup.appName || "Toah Nipi Staff Dashboard",
    backupType: rawBackup.backupType || "dashboard-local-storage",
    version: rawBackup.version || DASHBOARD_BACKUP_VERSION,
    createdAt: rawBackup.createdAt || new Date().toISOString(),
    importedAt: new Date().toISOString(),
    storageData,
  };

  return {
    ...normalizedBackup,
    stats: getBackupStats(normalizedBackup),
  };
}

function downloadDashboardBackupFile(backup) {
  const fileDate = new Date(backup.createdAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `toah-nipi-dashboard-backup-${fileDate}.json`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
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

function getBackupFriendlyCount(value, fallbackLabel = "Saved") {
  if (value === null || value === undefined || value === "") {
    return "Not saved yet";
  }

  const parsedValue = safeParseBackupJson(value, null);

  if (Array.isArray(parsedValue)) {
    return `${parsedValue.length} saved item${parsedValue.length === 1 ? "" : "s"}`;
  }

  if (parsedValue && typeof parsedValue === "object") {
    const count = Object.keys(parsedValue).length;
    return `${count} saved setting${count === 1 ? "" : "s"}`;
  }

  if (typeof parsedValue === "string") {
    return parsedValue ? fallbackLabel : "Not saved yet";
  }

  return fallbackLabel;
}

function getBackupHasAnyValue(storageData, keys) {
  return keys.some((key) => {
    const value = storageData[key];
    return value !== null && value !== undefined && value !== "";
  });
}

function getParsedBackupStorageValue(storageData, key, fallbackValue) {
  const rawValue = storageData?.[key];

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return fallbackValue;
  }

  const parsedValue = safeParseBackupJson(rawValue, fallbackValue);

  return parsedValue === null || parsedValue === undefined
    ? fallbackValue
    : parsedValue;
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
    return `${Object.keys(value).length} saved setting${
      Object.keys(value).length === 1 ? "" : "s"
    }`;
  }

  return String(value);
}

function getReadableBackupSettingName(key) {
  const labels = {
    dateFormat: "Date format",
    includeWeekday: "Show weekday",
    tintByRetreatType: "Color cards by retreat type",
    showRetreatTypeLegend: "Show retreat type legend",
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
    .replace(/^./, (letter) => letter.toUpperCase());
}

function getBackupObjectPreviewItems(objectValue, limit = 8) {
  if (!objectValue || typeof objectValue !== "object" || Array.isArray(objectValue)) {
    return [];
  }

  return Object.entries(objectValue)
    .slice(0, limit)
    .map(([key, value]) => ({
      label: getReadableBackupSettingName(key),
      value: getReadableBackupValue(value),
    }));
}

function getBackupCountByField(items, fieldName, fallbackLabel = "Blank") {
  return items.reduce((counts, item) => {
    const label = String(item?.[fieldName] || fallbackLabel).trim() || fallbackLabel;

    counts[label] = (counts[label] || 0) + 1;

    return counts;
  }, {});
}

function getTopBackupCounts(counts, limit = 4) {
  return Object.entries(counts)
    .sort(([, aCount], [, bCount]) => bCount - aCount)
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      value: `${count} item${count === 1 ? "" : "s"}`,
    }));
}

function getBackupFriendlyDateFilterLabel(value) {
  const labels = {
    thisMonth: "This Month",
    nextMonth: "Next Month",
    pastMonth: "Past Month",
    past90Days: "Past 90 Days",
    next90Days: "Next 90 Days",
    allTime: "All Time",
    custom: "Custom Date Range",
  };

  return labels[value] || value || "Not set";
}

function getBackupFriendlySourceModeLabel(value) {
  const labels = {
    all: "Forms + Imports",
    forms: "Forms Only",
    imports: "Imports Only",
  };

  return labels[value] || value || "Not set";
}

function getBackupDetailGroups(backup) {
  const storageData = backup?.storageData || {};

  const bookings = getParsedBackupStorageValue(
    storageData,
    "toahNipiPublicInquiries",
    []
  );

  const staffUsers = getParsedBackupStorageValue(
    storageData,
    STAFF_USERS_STORAGE_KEY,
    []
  );

  const currentStaffUserId = storageData[CURRENT_STAFF_USER_STORAGE_KEY] || "";

  const currentStaffUser =
    Array.isArray(staffUsers) && currentStaffUserId
      ? staffUsers.find((user) => user.id === currentStaffUserId)
      : null;

  const spreadsheetSettings = getParsedBackupStorageValue(
    storageData,
    SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
    {}
  );

  const spreadsheetStarredRows = getParsedBackupStorageValue(
    storageData,
    SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
    []
  );

  const bookingDetailDateSettings = getParsedBackupStorageValue(
    storageData,
    BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
    {}
  );

  const datedInquirySettings = getParsedBackupStorageValue(
    storageData,
    DATED_INQUIRY_SETTINGS_STORAGE_KEY,
    {}
  );

  const reportsSettings = getParsedBackupStorageValue(
    storageData,
    REPORTS_VIEW_SETTINGS_STORAGE_KEY,
    {}
  );

  const bookingCount = Array.isArray(bookings) ? bookings.length : 0;
  const staffCount = Array.isArray(staffUsers) ? staffUsers.length : 0;
  const activeStaffCount = Array.isArray(staffUsers)
    ? staffUsers.filter((user) => user.active).length
    : 0;

  const starredCount = Array.isArray(spreadsheetStarredRows)
    ? spreadsheetStarredRows.length
    : 0;

  const bookingStatusItems = Array.isArray(bookings)
    ? getTopBackupCounts(getBackupCountByField(bookings, "status"), 4)
    : [];

  const bookingSourceItems = Array.isArray(bookings)
    ? getTopBackupCounts(getBackupCountByField(bookings, "sourceType"), 4)
    : [];

  const missingDatesCount = Array.isArray(bookings)
    ? bookings.filter((booking) => !booking.startDate).length
    : 0;

  const missingContactCount = Array.isArray(bookings)
    ? bookings.filter((booking) => !booking.email && !booking.phone).length
    : 0;

  const spreadsheetSettingItems =
    spreadsheetSettings && typeof spreadsheetSettings === "object"
      ? getBackupObjectPreviewItems(spreadsheetSettings, 8)
      : [];

  const bookingDetailDateItems =
    bookingDetailDateSettings && typeof bookingDetailDateSettings === "object"
      ? getBackupObjectPreviewItems(bookingDetailDateSettings, 6)
      : [];

  const datedInquirySettingItems =
    datedInquirySettings && typeof datedInquirySettings === "object"
      ? getBackupObjectPreviewItems(datedInquirySettings, 6)
      : [];

  const reportsSettingItems =
    reportsSettings && typeof reportsSettings === "object"
      ? [
          {
            label: "Date range",
            value: getBackupFriendlyDateFilterLabel(reportsSettings.dateRange),
          },
          {
            label: "Status",
            value: reportsSettings.status || "All statuses",
          },
          {
            label: "Retreat type",
            value: reportsSettings.retreatType || "All retreat types",
          },
          {
            label: "Source",
            value: getBackupFriendlySourceModeLabel(reportsSettings.sourceMode),
          },
          {
            label: "Custom start",
            value: reportsSettings.customStartDate || "Not set",
          },
          {
            label: "Custom end",
            value: reportsSettings.customEndDate || "Not set",
          },
        ]
      : [];

  const dashboardFilterItems = [
    {
      label: "Dated inquiry date range",
      value: getBackupFriendlyDateFilterLabel(
        storageData[DATED_INQUIRY_DATE_FILTER_STORAGE_KEY]
      ),
    },
    {
      label: "Custom start date",
      value: storageData[DATED_INQUIRY_CUSTOM_START_STORAGE_KEY] || "Not set",
    },
    {
      label: "Custom end date",
      value: storageData[DATED_INQUIRY_CUSTOM_END_STORAGE_KEY] || "Not set",
    },
  ];

  const displaySettingItems = [
    ...bookingDetailDateItems,
    ...datedInquirySettingItems,
  ];

  const savedKeys = Object.entries(storageData).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  const knownKeys = new Set([
    "toahNipiPublicInquiries",
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
  ]);

  const extraSavedKeys = savedKeys.filter(([key]) => !knownKeys.has(key));

  return [
    {
      id: "booking-records",
      title: "Booking records",
      status:
        bookingCount > 0
          ? `${bookingCount} saved record${bookingCount === 1 ? "" : "s"}`
          : "No booking records saved",
      description:
        "Bookings, inquiries, imports, checklists, notes, and assignments.",
      hasValue: bookingCount > 0,
      tone: "green",
      items: [
        {
          label: "Total records",
          value: bookingCount,
        },
        {
          label: "Missing dates",
          value: missingDatesCount,
        },
        {
          label: "Missing email + phone",
          value: missingContactCount,
        },
        ...bookingStatusItems.map((item) => ({
          label: `Status: ${item.label}`,
          value: item.value,
        })),
        ...bookingSourceItems.map((item) => ({
          label: `Source: ${item.label}`,
          value: item.value,
        })),
      ],
    },
    {
      id: "staff-setup",
      title: "Staff setup",
      status:
        staffCount > 0
          ? `${staffCount} staff member${staffCount === 1 ? "" : "s"} saved`
          : "No staff users saved",
      description:
        "Staff users, roles, active status, and current staff selection.",
      hasValue: getBackupHasAnyValue(storageData, [
        STAFF_USERS_STORAGE_KEY,
        CURRENT_STAFF_USER_STORAGE_KEY,
      ]),
      tone: "blue",
      items: [
        {
          label: "Total staff",
          value: staffCount,
        },
        {
          label: "Active staff",
          value: activeStaffCount,
        },
        {
          label: "Current staff user",
          value: currentStaffUser?.name || "Not selected",
        },
        {
          label: "Saved staff names",
          value:
            Array.isArray(staffUsers) && staffUsers.length > 0
              ? staffUsers.map((user) => user.name).join(", ")
              : "None",
        },
      ],
    },
    {
      id: "spreadsheet-preferences",
      title: "Spreadsheet preferences",
      status:
        spreadsheetSettingItems.length > 0 || starredCount > 0
          ? `${spreadsheetSettingItems.length} setting${
              spreadsheetSettingItems.length === 1 ? "" : "s"
            } · ${starredCount} starred row${starredCount === 1 ? "" : "s"}`
          : "No spreadsheet preferences saved",
      description:
        "Spreadsheet layout, filters, saved views, cards, and starred rows.",
      hasValue: getBackupHasAnyValue(storageData, [
        SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY,
        SPREADSHEET_VIEW_STARRED_STORAGE_KEY,
      ]),
      tone: "purple",
      items: [
        {
          label: "Starred rows",
          value: starredCount,
        },
        ...spreadsheetSettingItems,
      ],
    },
    {
      id: "dashboard-filters",
      title: "Dashboard filters",
      status: getBackupHasAnyValue(storageData, [
        DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
        DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
        DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
      ])
        ? "Saved dashboard filter choices"
        : "No dashboard filters saved",
      description:
        "The saved date range used by the dashboard dated inquiry list.",
      hasValue: getBackupHasAnyValue(storageData, [
        DATED_INQUIRY_DATE_FILTER_STORAGE_KEY,
        DATED_INQUIRY_CUSTOM_START_STORAGE_KEY,
        DATED_INQUIRY_CUSTOM_END_STORAGE_KEY,
      ]),
      tone: "gold",
      items: dashboardFilterItems,
    },
    {
      id: "display-settings",
      title: "Display settings",
      status:
        displaySettingItems.length > 0
          ? `${displaySettingItems.length} display setting${
              displaySettingItems.length === 1 ? "" : "s"
            } saved`
          : "No display settings saved",
      description:
        "Date formatting and dated inquiry display choices.",
      hasValue: getBackupHasAnyValue(storageData, [
        BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY,
        DATED_INQUIRY_SETTINGS_STORAGE_KEY,
      ]),
      tone: "teal",
      items: displaySettingItems,
    },
    {
      id: "reports-settings",
      title: "Reports settings",
      status:
        reportsSettingItems.length > 0
          ? `${reportsSettingItems.length} report setting${
              reportsSettingItems.length === 1 ? "" : "s"
            } saved`
          : "No report settings saved",
      description:
        "Reports page filters like date range, status, type, and source.",
      hasValue: getBackupHasAnyValue(storageData, [
        REPORTS_VIEW_SETTINGS_STORAGE_KEY,
      ]),
      tone: "indigo",
      items: reportsSettingItems,
    },
    {
      id: "other-app-data",
      title: "Other app data",
      status:
        extraSavedKeys.length > 0
          ? `${extraSavedKeys.length} extra saved area${
              extraSavedKeys.length === 1 ? "" : "s"
            }`
          : "No extra app data",
      description:
        "Additional saved data from newer or future dashboard features.",
      hasValue: extraSavedKeys.length > 0,
      tone: "gray",
      items:
        extraSavedKeys.length > 0
          ? extraSavedKeys.map(([key, value]) => ({
              label: key,
              value: getReadableBackupValue(
                safeParseBackupJson(value, value)
              ),
            }))
          : [
              {
                label: "Extra app data",
                value: "None",
              },
            ],
    },
  ];
}

function tryParseBackupJsonValue(value) {
  try {
    return {
      didParse: true,
      parsedValue: JSON.parse(value),
    };
  } catch {
    return {
      didParse: false,
      parsedValue: null,
    };
  }
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

function getBackupTechnicalCategory(key) {
  if (key === "toahNipiPublicInquiries") {
    return "Booking data";
  }

  if (
    key === STAFF_USERS_STORAGE_KEY ||
    key === CURRENT_STAFF_USER_STORAGE_KEY
  ) {
    return "Staff data";
  }

  if (
    key === SPREADSHEET_VIEW_SETTINGS_STORAGE_KEY ||
    key === SPREADSHEET_VIEW_STARRED_STORAGE_KEY
  ) {
    return "Spreadsheet";
  }

  if (key === REPORTS_VIEW_SETTINGS_STORAGE_KEY) {
    return "Reports";
  }

  if (
    key === DATED_INQUIRY_SETTINGS_STORAGE_KEY ||
    key === DATED_INQUIRY_DATE_FILTER_STORAGE_KEY ||
    key === DATED_INQUIRY_CUSTOM_START_STORAGE_KEY ||
    key === DATED_INQUIRY_CUSTOM_END_STORAGE_KEY ||
    key === BOOKING_DETAIL_DATE_SETTINGS_STORAGE_KEY
  ) {
    return "Dashboard settings";
  }

  return "Other app data";
}

function getBackupTechnicalPreview(value) {
  if (value === null || value === undefined || value === "") {
    return "No saved value";
  }

  const textValue = String(value);
  const { didParse, parsedValue } = tryParseBackupJsonValue(textValue);

  const previewText = didParse
    ? JSON.stringify(parsedValue, null, 2)
    : textValue;

  if (!previewText) {
    return "Saved empty value";
  }

  return previewText.length > 900
    ? `${previewText.slice(0, 900)}\n...`
    : previewText;
}

function getBackupTechnicalInlinePreview(value) {
  if (value === null || value === undefined || value === "") {
    return "null";
  }

  const textValue = String(value);
  const { didParse, parsedValue } = tryParseBackupJsonValue(textValue);

  if (!didParse) {
    return textValue.length > 180 ? `${textValue.slice(0, 180)}…` : textValue;
  }

  if (Array.isArray(parsedValue)) {
    if (parsedValue.length === 0) {
      return "[]";
    }

    const firstItem = parsedValue[0];

    if (firstItem && typeof firstItem === "object" && !Array.isArray(firstItem)) {
      const sampleKeys = Object.keys(firstItem).slice(0, 6);

      return `[${parsedValue.length} object${
        parsedValue.length === 1 ? "" : "s"
      } · fields: ${sampleKeys.join(", ")}${
        Object.keys(firstItem).length > sampleKeys.length ? ", …" : ""
      }]`;
    }

    return `[${parsedValue.length} value${
      parsedValue.length === 1 ? "" : "s"
    } · sample: ${JSON.stringify(firstItem)}]`;
  }

  if (parsedValue && typeof parsedValue === "object") {
    const keys = Object.keys(parsedValue);
    const sampleKeys = keys.slice(0, 8);

    return `{ ${sampleKeys.join(", ")}${keys.length > sampleKeys.length ? ", …" : ""} }`;
  }

  const preview = JSON.stringify(parsedValue);

  return preview.length > 180 ? `${preview.slice(0, 180)}…` : preview;
}

function getBackupTechnicalValueInfo(value) {
  if (value === null || value === undefined || value === "") {
    return {
      hasValue: false,
      typeLabel: "Empty",
      summary: "No saved value",
    };
  }

  const textValue = String(value);
  const { didParse, parsedValue } = tryParseBackupJsonValue(textValue);

  if (!didParse) {
    return {
      hasValue: true,
      typeLabel: "Plain text",
      summary: textValue,
    };
  }

  if (Array.isArray(parsedValue)) {
    return {
      hasValue: true,
      typeLabel: "JSON array",
      summary: `${parsedValue.length} item${parsedValue.length === 1 ? "" : "s"}`,
    };
  }

  if (parsedValue && typeof parsedValue === "object") {
    const keyCount = Object.keys(parsedValue).length;

    return {
      hasValue: true,
      typeLabel: "JSON object",
      summary: `${keyCount} field${keyCount === 1 ? "" : "s"}`,
    };
  }

  if (typeof parsedValue === "boolean") {
    return {
      hasValue: true,
      typeLabel: "Boolean",
      summary: parsedValue ? "true" : "false",
    };
  }

  if (typeof parsedValue === "number") {
    return {
      hasValue: true,
      typeLabel: "Number",
      summary: String(parsedValue),
    };
  }

  if (typeof parsedValue === "string") {
    return {
      hasValue: true,
      typeLabel: "String",
      summary: parsedValue || "Saved empty string",
    };
  }

  return {
    hasValue: true,
    typeLabel: "JSON value",
    summary: String(parsedValue),
  };
}

function getBackupTechnicalRows(backup) {
  const storageData = backup?.storageData || {};

  return Object.entries(storageData)
    .map(([key, value]) => {
      const valueInfo = getBackupTechnicalValueInfo(value);

      return {
        key,
        path: `storageData.${key}`,
        label: DASHBOARD_BACKUP_KEY_LABELS[key] || key,
        category: getBackupTechnicalCategory(key),
        hasValue: valueInfo.hasValue,
        typeLabel: valueInfo.typeLabel,
        summary: valueInfo.summary,
        sizeLabel: formatBackupStorageSize(value),
        compactPreview: getBackupTechnicalInlinePreview(value),
        preview: getBackupTechnicalPreview(value),
      };
    })
    .sort((a, b) => {
      if (a.hasValue !== b.hasValue) {
        return a.hasValue ? -1 : 1;
      }

      return a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
    });
}


function DashboardBackupControls({ onExportBackup, onOpenBackupModal }) {
  return (
    <section className="dashboard-backup-toolbar" aria-label="Dashboard backups">
      <div>
        <p className="dashboard-eyebrow">Backups</p>
        <strong>Protect dashboard data</strong>
        <span>
          Export a JSON backup or restore from saved backup history.
        </span>
      </div>

      <div className="dashboard-backup-toolbar-actions">
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={onOpenBackupModal}
        >
          <FaUpload />
          Import Backup
        </button>

        <button
          className="primary-dashboard-button"
          type="button"
          onClick={onExportBackup}
        >
          <FaDownload />
          Export Backup
        </button>
      </div>
    </section>
  );
}

function DashboardBackupModal({
  backupHistory,
  onClose,
  onRestoreBackup,
  onDeleteBackup,
  onImportBackupFile,
}) {
  const backupFileInputRef = useRef(null);
  const [expandedBackupId, setExpandedBackupId] = useState(
    backupHistory[0]?.id || ""
  );

  const [backupDetailMode, setBackupDetailMode] = useState("friendly");
  const [expandedFriendlyGroupId, setExpandedFriendlyGroupId] = useState("");

  useEffect(() => {
    if (!expandedBackupId && backupHistory[0]?.id) {
      setExpandedBackupId(backupHistory[0].id);
    }
  }, [backupHistory, expandedBackupId]);

  useEffect(() => {
    setExpandedFriendlyGroupId("");
  }, [expandedBackupId, backupDetailMode]);

  return (
    <div className="dashboard-backup-backdrop" role="presentation">
      <section
        className="dashboard-backup-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import dashboard backup"
      >
        <header className="dashboard-backup-modal-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaDatabase />
            </span>

            <div>
              <p className="dashboard-eyebrow">Backup Library</p>
              <h3>Import Dashboard Backup</h3>
              <span>
                Choose a saved backup below. The most recent backup appears first.
              </span>
            </div>
          </div>

          <button
            className="spreadsheet-settings-close-button"
            type="button"
            onClick={onClose}
            aria-label="Close backup modal"
          >
            <FaTimes />
          </button>
        </header>

        <div className="dashboard-backup-modal-actions">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={() => backupFileInputRef.current?.click()}
          >
            <FaUpload />
            Upload Backup File
          </button>

          <input
            ref={backupFileInputRef}
            className="dashboard-file-input"
            type="file"
            accept="application/json,.json"
            onChange={onImportBackupFile}
          />

          <p>
            Uploaded files are added to this backup list so you can review them
            before restoring.
          </p>
        </div>

        <div className="dashboard-backup-modal-body">
          {backupHistory.length > 0 ? (
            <div className="dashboard-backup-list">
              {backupHistory.map((backup, index) => {
                const stats = backup.stats || getBackupStats(backup);
                const isExpanded = expandedBackupId === backup.id;
                const detailGroups = getBackupDetailGroups(backup);
                const savedDetailGroups = detailGroups.filter((group) => group.hasValue);
                const emptyDetailGroups = detailGroups.filter((group) => !group.hasValue);       
                const technicalRows = getBackupTechnicalRows(backup);
                const savedTechnicalRows = technicalRows.filter((row) => row.hasValue);
                const emptyTechnicalRows = technicalRows.filter((row) => !row.hasValue);

                return (
                  <article
                    className={`dashboard-backup-card ${
                      index === 0 ? "dashboard-backup-card-latest" : ""
                    }`}
                    key={backup.id}
                  >
                    <div className="dashboard-backup-card-main">
                      <div>
                        <div className="dashboard-backup-title-row">
                          <h4>
                            {index === 0 ? "Most Recent Backup" : "Saved Backup"}
                          </h4>

                          {backup.importedAt && (
                            <span className="dashboard-backup-imported-pill">
                              Imported file
                            </span>
                          )}
                        </div>

                        <p>{formatBackupDate(backup.createdAt)}</p>
                      </div>

                      <div className="dashboard-backup-stats">
                        <span>
                          <strong>{stats.bookingCount}</strong>
                          Bookings
                        </span>

                        <span>
                          <strong>{stats.staffCount}</strong>
                          Staff
                        </span>

                        <span>
                          <strong>{stats.starredCount}</strong>
                          Starred
                        </span>

                        <span>
                          <strong>{stats.savedKeysCount}</strong>
                          Saved areas
                        </span>
                      </div>
                    </div>

                    <aside className="dashboard-backup-card-actions">
                      <button
                        className="secondary-dashboard-button"
                        type="button"
                        onClick={() =>
                          setExpandedBackupId(isExpanded ? "" : backup.id)
                        }
                      >
                        <FaInfoCircle />
                        {isExpanded ? "Hide Details" : "View Details"}
                      </button>

                      <button
                        className="primary-dashboard-button"
                        type="button"
                        onClick={() => onRestoreBackup(backup)}
                      >
                        Restore
                      </button>

                      <button
                        className="dashboard-backup-delete-button"
                        type="button"
                        onClick={() => onDeleteBackup(backup.id)}
                        aria-label="Delete backup"
                      >
                        <FaTrashAlt />
                      </button>
                    </aside>

                    {isExpanded && (
                      <div className="dashboard-backup-details dashboard-backup-details-friendly">
                        <div className="dashboard-backup-details-header">
                          {/* <div>
                            <strong>What this backup includes</strong>
                            <p>
                              Switch between a staff-friendly summary and a technical storage view.
                            </p>
                          </div> */}

                          <span>
                            {savedDetailGroups.length} active area
                            {savedDetailGroups.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div
                          className="dashboard-backup-detail-mode-toggle"
                          role="tablist"
                          aria-label="Backup detail display mode"
                        >
                          <button
                            className={backupDetailMode === "friendly" ? "active" : ""}
                            type="button"
                            onClick={() => setBackupDetailMode("friendly")}
                          >
                            Friendly
                          </button>

                          <button
                            className={backupDetailMode === "technical" ? "active" : ""}
                            type="button"
                            onClick={() => setBackupDetailMode("technical")}
                          >
                            Technical
                          </button>
                        </div>

                        {backupDetailMode === "friendly" ? (
                          <>
                            <div className="dashboard-backup-friendly-list">
                              {savedDetailGroups.map((group) => {
                                const isGroupExpanded = expandedFriendlyGroupId === group.id;

                                return (
                                  <article
                                    className={`dashboard-backup-friendly-card dashboard-backup-friendly-card-${group.tone} ${
                                      isGroupExpanded ? "dashboard-backup-friendly-card-expanded" : ""
                                    }`}
                                    key={group.id}
                                  >
                                    <button
                                      className="dashboard-backup-friendly-card-button"
                                      type="button"
                                      onClick={() =>
                                        setExpandedFriendlyGroupId(isGroupExpanded ? "" : group.id)
                                      }
                                      aria-expanded={isGroupExpanded}
                                    >
                                      <div className="dashboard-backup-friendly-icon">
                                        <FaCheckCircle />
                                      </div>

                                      <div className="dashboard-backup-friendly-main">
                                        <h5>{group.title}</h5>
                                        <strong>{group.status}</strong>
                                        <p>{group.description}</p>
                                      </div>

                                      <span className="dashboard-backup-friendly-expand-label">
                                        {isGroupExpanded ? "Hide" : "Details"}
                                      </span>
                                    </button>

                                    {isGroupExpanded && (
                                      <div className="dashboard-backup-friendly-quick-details">
                                        {group.items.map((item) => (
                                          <div key={`${group.id}-${item.label}`}>
                                            <span>{item.label}</span>
                                            <strong>{item.value}</strong>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </article>
                                );
                              })}
                            </div>

                            {emptyDetailGroups.length > 0 && (
                              <details className="dashboard-backup-empty-details">
                                <summary>Show areas that were not saved in this backup</summary>

                                <div className="dashboard-backup-empty-detail-list">
                                  {emptyDetailGroups.map((group) => (
                                    <div key={group.id}>
                                      <span>{group.title}</span>
                                      <small>{group.status}</small>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </>
                        ) : (
                          <div className="dashboard-backup-technical-panel dashboard-backup-technical-panel-compact">
                            <div className="dashboard-backup-technical-manifest-top">
                              <div>
                                <strong>Backup manifest</strong>
                                <span>
                                  Compact view of the storage keys included in this backup.
                                </span>
                              </div>

                              <code>version: {backup.version || DASHBOARD_BACKUP_VERSION}</code>
                            </div>

                            <div className="dashboard-backup-technical-compact-summary">
                              <span>
                                <strong>{technicalRows.length}</strong>
                                keys
                              </span>

                              <span>
                                <strong>{savedTechnicalRows.length}</strong>
                                saved
                              </span>

                              <span>
                                <strong>{emptyTechnicalRows.length}</strong>
                                empty
                              </span>

                              <span>
                                <strong>
                                  {formatBackupStorageSize(JSON.stringify(backup.storageData || {}))}
                                </strong>
                                size
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

                              {technicalRows.map((row) => (
                                <details
                                  className={`dashboard-backup-technical-manifest-row ${
                                    !row.hasValue ? "is-empty" : ""
                                  }`}
                                  key={row.key}
                                >
                                  <summary>
                                    <span className="dashboard-backup-technical-key-cell">
                                      <code>{row.key}</code>
                                      <small>{row.label}</small>
                                    </span>

                                    <span>{row.category}</span>
                                    <span>{row.typeLabel}</span>
                                    <span>{row.summary}</span>
                                    <span>{row.sizeLabel}</span>
                                  </summary>

                                  <div className="dashboard-backup-technical-manifest-preview">
                                    <div>
                                      <small>Path</small>
                                      <code>{row.path}</code>
                                    </div>

                                    <div>
                                      <small>Compact value</small>
                                      <code>{row.compactPreview}</code>
                                    </div>

                                    <details className="dashboard-backup-technical-raw-preview">
                                      <summary>Show raw preview</summary>
                                      <pre>{row.preview}</pre>
                                    </details>
                                  </div>
                                </details>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-backup-empty">
              <FaDatabase />
              <strong>No backups saved yet</strong>
              <p>
                Click Export Backup first. That will download a JSON file and add
                a backup card here.
              </p>
            </div>
          )}
        </div>

        <footer className="dashboard-backup-modal-footer">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}


export default function DashboardBackups({ onRestoreComplete }) {
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupHistory, setBackupHistory] = useState(() =>
    getDashboardBackupHistory()
  );

  const exportDashboardBackup = () => {
    const backup = createDashboardBackupSnapshot();

    const nextBackupHistory = saveDashboardBackupHistory([
      backup,
      ...backupHistory,
    ]);

    setBackupHistory(nextBackupHistory);
    downloadDashboardBackupFile(backup);

    alert("Backup exported and saved to backup history.");
  };

  const restoreDashboardBackup = (backup) => {
    const confirmed = window.confirm(
      "Restore this backup? This will replace the current dashboard data in this browser."
    );

    if (!confirmed) {
      return;
    }

    try {
      const backupStorageData = backup.storageData || {};

      const backupKeys = Array.from(
        new Set([...getDashboardBackupKeys(), ...Object.keys(backupStorageData)])
      );

      backupKeys.forEach((key) => {
        if (
          Object.prototype.hasOwnProperty.call(backupStorageData, key) &&
          backupStorageData[key] !== null &&
          backupStorageData[key] !== undefined
        ) {
          localStorage.setItem(key, backupStorageData[key]);
        } else if (key !== DASHBOARD_BACKUP_HISTORY_STORAGE_KEY) {
          localStorage.removeItem(key);
        }
      });

      onRestoreComplete?.();

      alert(
        "Backup restored. The dashboard will reload so every view picks up the restored data."
      );

      window.location.reload();
    } catch (error) {
      console.error("Could not restore dashboard backup:", error);
      alert("Sorry, that backup could not be restored.");
    }
  };

  const deleteDashboardBackup = (backupId) => {
    const confirmed = window.confirm("Delete this saved backup from history?");

    if (!confirmed) {
      return;
    }

    const nextBackupHistory = backupHistory.filter(
      (backup) => backup.id !== backupId
    );

    const savedHistory = saveDashboardBackupHistory(nextBackupHistory);
    setBackupHistory(savedHistory);
  };

  const importDashboardBackupFile = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileText = await file.text();
      const parsedBackup = JSON.parse(fileText);
      const normalizedBackup = normalizeImportedDashboardBackup(parsedBackup);

      if (!normalizedBackup) {
        alert("That file does not look like a valid dashboard backup.");
        return;
      }

      const nextBackupHistory = saveDashboardBackupHistory([
        normalizedBackup,
        ...backupHistory,
      ]);

      setBackupHistory(nextBackupHistory);

      alert(
        "Backup file imported into backup history. You can review it before restoring."
      );
    } catch (error) {
      console.error("Could not import dashboard backup file:", error);
      alert("Sorry, that backup file could not be imported.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <>
      <DashboardBackupControls
        onExportBackup={exportDashboardBackup}
        onOpenBackupModal={() => {
          setBackupHistory(getDashboardBackupHistory());
          setIsBackupModalOpen(true);
        }}
      />

      {isBackupModalOpen && (
        <DashboardBackupModal
          backupHistory={backupHistory}
          onClose={() => setIsBackupModalOpen(false)}
          onRestoreBackup={restoreDashboardBackup}
          onDeleteBackup={deleteDashboardBackup}
          onImportBackupFile={importDashboardBackupFile}
        />
      )}
    </>
  );
}