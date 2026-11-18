import { createStaffDirectoryId } from "../services/staffDirectory";

const STAFF_USERS_STORAGE_KEY = "toahNipiStaffUsers";

const CURRENT_STAFF_USER_STORAGE_KEY = "toahNipiCurrentStaffUserId";

/*
  This browser's staff list, used only until the shared staff directory
  (Supabase table staff_directory) exists. Placeholder users are no longer
  added when it is empty (AUDIT-017).
*/

export function normalizeStaffName(value) {
  return String(value || "").trim().toLowerCase();
}

// Ids work in both the browser list and the shared directory (uuid column).
export function createStaffUserId() {
  return createStaffDirectoryId();
}

export function normalizeStaffEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseStaffContactName(value) {
  const lines = String(value || "")
    .split(/\r?\n/g)
    .map((line) =>
      line
        .replace(/^"+|"+$/g, "")
        .replace(/^'+|'+$/g, "")
        .trim()
    )
    .filter((line) => line && line !== "-");

  const commaNameLine =
    lines.find((line) => line.includes(",")) || lines[lines.length - 1] || "";

  if (!commaNameLine) {
    return "";
  }

  if (commaNameLine.includes(",")) {
    const [lastName, firstName] = commaNameLine
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    return [firstName, lastName].filter(Boolean).join(" ");
  }

  return commaNameLine;
}

export function normalizeStaffContactSpreadsheetRow({ nameCell, emailCell, index }) {
  const name = parseStaffContactName(nameCell);
  const email = String(emailCell || "").trim();

  if (!name && !email) {
    return null;
  }

  return {
    id: createStaffUserId(),
    name: name || email,
    email,
    role: "Staff",
    active: true,
    importedFrom: "Staff_Contacts",
    importedAt: new Date().toISOString(),
    importIndex: index,
  };
}

export function getSavedStaffUsers() {
  try {
    const savedUsers = localStorage.getItem(STAFF_USERS_STORAGE_KEY);

        if (!savedUsers) {
      return [];
    }

    const parsedUsers = JSON.parse(savedUsers);

    return Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch (error) {
    console.error("Could not read staff users:", error);
    return [];
  }
}

export function saveStaffUsers(users) {
  try {
    localStorage.setItem(STAFF_USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Could not save staff users:", error);
  }
}

export function getSavedCurrentStaffUserId(staffUsers) {
  try {
    const savedUserId = localStorage.getItem(CURRENT_STAFF_USER_STORAGE_KEY);

        // Attribution needs an explicit choice; nobody is picked by default.
    if (savedUserId && staffUsers.some((user) => user.id === savedUserId)) {
      return savedUserId;
    }

    return "";
  } catch (error) {
    console.error("Could not read current staff user:", error);
    return "";
  }
}

export function saveCurrentStaffUserId(userId) {
  try {
    localStorage.setItem(CURRENT_STAFF_USER_STORAGE_KEY, userId);
  } catch (error) {
    console.error("Could not save current staff user:", error);
  }
}
