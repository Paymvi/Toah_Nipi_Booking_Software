const BACKUP_VIEW_STORAGE_KEY = "toahNipiBackupsView";

export function getSavedBackupView() {
  try {
    return localStorage.getItem(BACKUP_VIEW_STORAGE_KEY) === "detailed" ? "detailed" : "minimal";
  } catch {
    return "minimal";
  }
}

export function saveBackupView(view) {
  try {
    localStorage.setItem(BACKUP_VIEW_STORAGE_KEY, view);
  } catch {
    // The toggle still works for this visit.
  }
}
