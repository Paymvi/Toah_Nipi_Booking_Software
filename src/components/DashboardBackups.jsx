import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaArchive,
  FaCheckCircle,
  FaCloudDownloadAlt,
  FaDatabase,
  FaDownload,
  FaExclamationTriangle,
  FaFileAlt,
  FaHistory,
  FaLock,
  FaRedoAlt,
  FaShieldAlt,
  FaTimes,
  FaTrashAlt,
  FaUpload,
} from "react-icons/fa";

import {
  deleteAllBookings,
  fetchBookings,
  upsertBookings,
} from "../services/bookingService";



const BACKUP_FORMAT = "toah-nipi-booking-backup";
const BACKUP_SCHEMA_VERSION = 1;
const LAST_BACKUP_STORAGE_KEY = "toahNipiLastManualBackup";
const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024;
const UPSERT_CHUNK_SIZE = 150;

function formatDateTime(value) {
  if (!value) return "Never";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getSafeFileDate(date = new Date()) {
  return date
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z");
}

function createBackupFilename(date = new Date(), prefix = "toah-nipi-backup") {
  return `${prefix}-${getSafeFileDate(date)}.json`;
}

function downloadJsonFile(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);

  return blob.size;
}

async function sha256Text(value) {
  if (!window.crypto?.subtle) {
    throw new Error(
      "This browser does not support the integrity-check feature required for backups."
    );
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createBackupEnvelope(bookings, reason = "manual") {
  const createdAt = new Date().toISOString();

  const payload = {
    bookings,
  };

  const checksum = await sha256Text(JSON.stringify(payload));

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    reason,
    application: "Toah Nipi Booking Software",
    summary: {
      bookingCount: bookings.length,
    },
    integrity: {
      algorithm: "SHA-256",
      checksum,
    },
    payload,
  };
}

function getBackupBookings(backup) {
  return Array.isArray(backup?.payload?.bookings)
    ? backup.payload.bookings
    : [];
}

function getDuplicateBookingIds(bookings) {
  const seen = new Set();
  const duplicateIds = new Set();

  bookings.forEach((booking) => {
    const id = String(booking?.id || "").trim();

    if (!id) return;

    if (seen.has(id)) {
      duplicateIds.add(id);
      return;
    }

    seen.add(id);
  });

  return [...duplicateIds];
}

function getMissingIdCount(bookings) {
  return bookings.filter((booking) => !String(booking?.id || "").trim()).length;
}

function getStatusBreakdown(bookings) {
  const counts = {};

  bookings.forEach((booking) => {
    const status = String(booking?.status || "No Status").trim() || "No Status";
    counts[status] = (counts[status] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => ({ status, count }));
}

function getBookingDateRange(bookings) {
  const dateValues = bookings
    .flatMap((booking) => [booking?.startDate, booking?.endDate])
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")))
    .sort();

  if (dateValues.length === 0) {
    return {
      first: "—",
      last: "—",
    };
  }

  const format = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return {
    first: format(dateValues[0]),
    last: format(dateValues[dateValues.length - 1]),
  };
}

function getLastBackupMetadata() {
  try {
    const saved = localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error("Could not read last backup metadata:", error);
    return null;
  }
}

function saveLastBackupMetadata(metadata) {
  try {
    localStorage.setItem(LAST_BACKUP_STORAGE_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error("Could not save last backup metadata:", error);
  }
}

async function upsertInChunks(bookings, onProgress) {
  let restored = 0;

  for (let index = 0; index < bookings.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = bookings.slice(index, index + UPSERT_CHUNK_SIZE);
    const saved = await upsertBookings(chunk);

    restored += saved.length;

    if (onProgress) {
      onProgress(restored, bookings.length);
    }
  }

  return restored;
}

function validateBasicBackupShape(backup) {
  const errors = [];
  const warnings = [];

  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    errors.push("The selected file is not a valid backup object.");
    return { errors, warnings };
  }

  if (backup.format !== BACKUP_FORMAT) {
    errors.push(
      "This file is not recognized as a Toah Nipi booking-system backup."
    );
  }

  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    errors.push(
      `Unsupported backup schema version: ${String(
        backup.schemaVersion ?? "missing"
      )}. This version of the app expects schema version ${BACKUP_SCHEMA_VERSION}.`
    );
  }

  const bookings = getBackupBookings(backup);

  if (!Array.isArray(backup?.payload?.bookings)) {
    errors.push("The backup does not contain a bookings array.");
  }

  const missingIds = getMissingIdCount(bookings);
  const duplicateIds = getDuplicateBookingIds(bookings);

  if (missingIds > 0) {
    errors.push(
      `${missingIds} booking record${missingIds === 1 ? " is" : "s are"} missing an ID.`
    );
  }

  if (duplicateIds.length > 0) {
    errors.push(
      `${duplicateIds.length} duplicate booking ID${
        duplicateIds.length === 1 ? " was" : "s were"
      } found inside the backup.`
    );
  }

  if (bookings.length === 0) {
    warnings.push("This backup contains zero booking records.");
  }

  if (!backup?.integrity?.checksum) {
    errors.push("The backup is missing its integrity checksum.");
  }

  return { errors, warnings };
}

async function verifyBackupIntegrity(backup) {
  const expectedChecksum = String(backup?.integrity?.checksum || "").trim();

  if (!expectedChecksum) {
    return {
      ok: false,
      actualChecksum: "",
      expectedChecksum: "",
    };
  }

  const actualChecksum = await sha256Text(
    JSON.stringify({
      bookings: getBackupBookings(backup),
    })
  );

  return {
    ok: actualChecksum === expectedChecksum,
    actualChecksum,
    expectedChecksum,
  };
}

function BackupMetric({ label, value, helper, icon: Icon }) {
  return (
    <article className="backup-metric-card">
      <span className="backup-metric-icon">
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper && <p>{helper}</p>}
      </div>
    </article>
  );
}

function BackupNotice({ tone = "info", icon: Icon, title, children }) {
  return (
    <div className={`backup-notice backup-notice-${tone}`}>
      <span className="backup-notice-icon">
        <Icon />
      </span>

      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export default function DashboardBackups({ onRestoreComplete }) {
  const fileInputRef = useRef(null);

  const [liveBookings, setLiveBookings] = useState([]);
  const [isLoadingLiveData, setIsLoadingLiveData] = useState(true);
  const [liveDataError, setLiveDataError] = useState("");

  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [lastBackup, setLastBackup] = useState(() => getLastBackupMetadata());

  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [backupValidation, setBackupValidation] = useState(null);
  const [isReadingBackup, setIsReadingBackup] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [restoreMode, setRestoreMode] = useState("merge");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({
    current: 0,
    total: 0,
    label: "",
  });
  const [restoreResult, setRestoreResult] = useState(null);

  const liveStatusBreakdown = useMemo(
    () => getStatusBreakdown(liveBookings),
    [liveBookings]
  );

  const liveDateRange = useMemo(
    () => getBookingDateRange(liveBookings),
    [liveBookings]
  );

  const backupBookings = useMemo(
    () => getBackupBookings(selectedBackup),
    [selectedBackup]
  );

  const backupStatusBreakdown = useMemo(
    () => getStatusBreakdown(backupBookings),
    [backupBookings]
  );

  const backupDateRange = useMemo(
    () => getBookingDateRange(backupBookings),
    [backupBookings]
  );

  const comparison = useMemo(() => {
    if (!selectedBackup || !backupValidation?.valid) {
      return null;
    }

    const liveIds = new Set(
      liveBookings
        .map((booking) => String(booking?.id || "").trim())
        .filter(Boolean)
    );

    let newRecords = 0;
    let matchingRecords = 0;

    backupBookings.forEach((booking) => {
      const id = String(booking?.id || "").trim();

      if (liveIds.has(id)) {
        matchingRecords += 1;
      } else {
        newRecords += 1;
      }
    });

    const backupIds = new Set(
      backupBookings.map((booking) => String(booking?.id || "").trim())
    );

    const onlyInCurrentDatabase = liveBookings.filter(
      (booking) => !backupIds.has(String(booking?.id || "").trim())
    ).length;

    return {
      newRecords,
      matchingRecords,
      onlyInCurrentDatabase,
    };
  }, [backupBookings, backupValidation?.valid, liveBookings, selectedBackup]);

  const canRestore =
    Boolean(selectedBackup) &&
    Boolean(backupValidation?.valid) &&
    !isRestoring &&
    (restoreMode === "merge" || replaceConfirmation.trim() === "RESTORE");

  const loadLiveDatabaseSummary = async () => {
    try {
      setIsLoadingLiveData(true);
      setLiveDataError("");

      const bookings = await fetchBookings();
      setLiveBookings(Array.isArray(bookings) ? bookings : []);
    } catch (error) {
      console.error("Could not load live database for backup page:", error);
      setLiveDataError(error?.message || "Could not load the live booking database.");
    } finally {
      setIsLoadingLiveData(false);
    }
  };

  useEffect(() => {
    loadLiveDatabaseSummary();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setIsCreatingBackup(true);
      setRestoreResult(null);

      const bookings = await fetchBookings();
      const backup = await createBackupEnvelope(bookings, "manual");
      const filename = createBackupFilename(new Date(backup.createdAt));
      const fileSize = downloadJsonFile(backup, filename);

      const metadata = {
        createdAt: backup.createdAt,
        filename,
        bookingCount: bookings.length,
        fileSize,
        checksum: backup.integrity.checksum,
      };

      saveLastBackupMetadata(metadata);
      setLastBackup(metadata);
      setLiveBookings(bookings);

      setRestoreResult({
        tone: "success",
        title: "Backup created",
        message: `${bookings.length} booking record${
          bookings.length === 1 ? " was" : "s were"
        } exported successfully. Store the downloaded file somewhere outside this computer as well.`,
      });
    } catch (error) {
      console.error("Could not create backup:", error);
      setRestoreResult({
        tone: "error",
        title: "Backup failed",
        message: error?.message || "The backup file could not be created.",
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const resetSelectedBackup = () => {
    setSelectedFile(null);
    setSelectedBackup(null);
    setBackupValidation(null);
    setRestoreMode("merge");
    setReplaceConfirmation("");
    setRestoreProgress({ current: 0, total: 0, label: "" });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const readBackupFile = async (file) => {
    if (!file) return;

    try {
      setIsReadingBackup(true);
      setRestoreResult(null);
      setSelectedFile(file);
      setSelectedBackup(null);
      setBackupValidation(null);
      setReplaceConfirmation("");

      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error(
          `That file is ${formatFileSize(
            file.size
          )}. Backup files larger than ${formatFileSize(
            MAX_BACKUP_FILE_BYTES
          )} are blocked on this page.`
        );
      }

      const text = await file.text();
      let parsedBackup;

      try {
        parsedBackup = JSON.parse(text);
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }

      const shapeValidation = validateBasicBackupShape(parsedBackup);
      let integrity = {
        ok: false,
        actualChecksum: "",
        expectedChecksum: String(parsedBackup?.integrity?.checksum || ""),
      };

      if (shapeValidation.errors.length === 0) {
        integrity = await verifyBackupIntegrity(parsedBackup);

        if (!integrity.ok) {
          shapeValidation.errors.push(
            "The integrity check failed. The backup may have been edited, corrupted, or only partially copied."
          );
        }
      }

      const validation = {
        valid: shapeValidation.errors.length === 0 && integrity.ok,
        errors: shapeValidation.errors,
        warnings: shapeValidation.warnings,
        integrity,
      };

      setSelectedBackup(parsedBackup);
      setBackupValidation(validation);
    } catch (error) {
      console.error("Could not read backup file:", error);

      setSelectedBackup(null);
      setBackupValidation({
        valid: false,
        errors: [error?.message || "The backup file could not be read."],
        warnings: [],
        integrity: null,
      });
    } finally {
      setIsReadingBackup(false);
    }
  };

  const handleFileInputChange = (event) => {
    const [file] = Array.from(event.target.files || []);
    readBackupFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDraggingFile(false);

    const [file] = Array.from(event.dataTransfer.files || []);
    readBackupFile(file);
  };

  const downloadSafetySnapshot = async (bookings) => {
    const safetyBackup = await createBackupEnvelope(bookings, "pre-restore-safety");
    const filename = createBackupFilename(
      new Date(safetyBackup.createdAt),
      "toah-nipi-pre-restore-safety"
    );

    downloadJsonFile(safetyBackup, filename);

    return {
      backup: safetyBackup,
      filename,
    };
  };

  const verifyReplaceRestore = async (expectedBookings) => {
    const restoredBookings = await fetchBookings();
    const expectedIds = new Set(expectedBookings.map((booking) => String(booking.id)));
    const restoredIds = new Set(restoredBookings.map((booking) => String(booking.id)));

    const missingIds = [...expectedIds].filter((id) => !restoredIds.has(id));
    const unexpectedIds = [...restoredIds].filter((id) => !expectedIds.has(id));

    return {
      ok:
        restoredBookings.length === expectedBookings.length &&
        missingIds.length === 0 &&
        unexpectedIds.length === 0,
      restoredBookings,
      missingIds,
      unexpectedIds,
    };
  };

  const handleRestore = async () => {
    if (!canRestore) return;

    const bookingsToRestore = getBackupBookings(selectedBackup);
    let originalBookings = [];
    let safetyFilename = "";
    let destructiveStepStarted = false;

    try {
      setIsRestoring(true);
      setRestoreResult(null);
      setRestoreProgress({
        current: 0,
        total: bookingsToRestore.length,
        label: "Preparing restore…",
      });

      originalBookings = await fetchBookings();

      if (restoreMode === "replace") {
        setRestoreProgress({
          current: 0,
          total: bookingsToRestore.length,
          label: "Creating pre-restore safety backup…",
        });

        const safetySnapshot = await downloadSafetySnapshot(originalBookings);
        safetyFilename = safetySnapshot.filename;

        setRestoreProgress({
          current: 0,
          total: bookingsToRestore.length,
          label: "Clearing the current booking database…",
        });

        destructiveStepStarted = true;
        await deleteAllBookings();
      }

      setRestoreProgress({
        current: 0,
        total: bookingsToRestore.length,
        label:
          restoreMode === "replace"
            ? "Restoring backup records…"
            : "Merging backup records…",
      });

      await upsertInChunks(bookingsToRestore, (current, total) => {
        setRestoreProgress({
          current,
          total,
          label:
            restoreMode === "replace"
              ? "Restoring backup records…"
              : "Merging backup records…",
        });
      });

      setRestoreProgress({
        current: bookingsToRestore.length,
        total: bookingsToRestore.length,
        label: "Verifying restored data…",
      });

      const liveAfterRestore = await fetchBookings();

      if (restoreMode === "replace") {
        const verification = await verifyReplaceRestore(bookingsToRestore);

        if (!verification.ok) {
          throw new Error(
            `Restore verification failed. Missing IDs: ${verification.missingIds.length}. Unexpected IDs: ${verification.unexpectedIds.length}.`
          );
        }

        setLiveBookings(verification.restoredBookings);
      } else {
        const restoredIds = new Set(
          liveAfterRestore.map((booking) => String(booking?.id || ""))
        );

        const missingAfterMerge = bookingsToRestore.filter(
          (booking) => !restoredIds.has(String(booking?.id || ""))
        );

        if (missingAfterMerge.length > 0) {
          throw new Error(
            `Merge verification failed. ${missingAfterMerge.length} backup record${
              missingAfterMerge.length === 1 ? " is" : "s are"
            } still missing from the live database.`
          );
        }

        setLiveBookings(liveAfterRestore);
      }

      setRestoreProgress({
        current: bookingsToRestore.length,
        total: bookingsToRestore.length,
        label: "Restore complete",
      });

      setRestoreResult({
        tone: "success",
        title: restoreMode === "replace" ? "Backup restored" : "Backup merged",
        message:
          restoreMode === "replace"
            ? `${bookingsToRestore.length} booking record${
                bookingsToRestore.length === 1 ? " was" : "s were"
              } restored and verified. A pre-restore safety backup was downloaded as “${safetyFilename}”.`
            : `${bookingsToRestore.length} backup record${
                bookingsToRestore.length === 1 ? " was" : "s were"
              } merged into the live database and verified. Records that existed only in the current database were left untouched.`,
      });

      setReplaceConfirmation("");

      if (onRestoreComplete) {
        onRestoreComplete();
      }
    } catch (error) {
      console.error("Backup restore failed:", error);

      let rollbackMessage = "";

      if (restoreMode === "replace" && destructiveStepStarted) {
        try {
          setRestoreProgress({
            current: 0,
            total: originalBookings.length,
            label: "Restore failed. Attempting automatic rollback…",
          });

          await deleteAllBookings();
          await upsertInChunks(originalBookings, (current, total) => {
            setRestoreProgress({
              current,
              total,
              label: "Restore failed. Rolling back previous database…",
            });
          });

          const rolledBackBookings = await fetchBookings();
          setLiveBookings(rolledBackBookings);
          rollbackMessage =
            " The previous booking database was restored automatically from the in-memory safety copy.";
        } catch (rollbackError) {
          console.error("Automatic rollback also failed:", rollbackError);
          rollbackMessage =
            " Automatic rollback also failed. Use the pre-restore safety backup that was downloaded before replacement began.";
        }
      }

      setRestoreResult({
        tone: "error",
        title: "Restore failed",
        message: `${error?.message || "The backup could not be restored."}${rollbackMessage}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const progressPercent = restoreProgress.total
    ? Math.min(
        100,
        Math.round((restoreProgress.current / restoreProgress.total) * 100)
      )
    : 0;

  return (
    <main className="backups-page">
      <section className="backups-hero">
        <div className="backups-hero-copy">
          <span className="backups-eyebrow">
            <FaShieldAlt />
            Data Protection
          </span>

          <h1>Backups & Restore</h1>

          <p>
            Create a portable snapshot of the live booking database, inspect a
            backup before using it, and restore records with safeguards against
            accidental data loss.
          </p>
        </div>

        <div className="backups-hero-actions">
          <button
            className="backup-primary-button"
            type="button"
            onClick={handleCreateBackup}
            disabled={isCreatingBackup || isRestoring || isLoadingLiveData}
          >
            {isCreatingBackup ? <FaRedoAlt className="backup-spin" /> : <FaDownload />}
            {isCreatingBackup ? "Creating Backup…" : "Create Backup Now"}
          </button>

          <button
            className="backup-secondary-button"
            type="button"
            onClick={loadLiveDatabaseSummary}
            disabled={isLoadingLiveData || isRestoring}
          >
            <FaRedoAlt className={isLoadingLiveData ? "backup-spin" : ""} />
            Refresh Status
          </button>
        </div>
      </section>

      {restoreResult && (
        <BackupNotice
          tone={restoreResult.tone}
          icon={restoreResult.tone === "success" ? FaCheckCircle : FaExclamationTriangle}
          title={restoreResult.title}
        >
          {restoreResult.message}
        </BackupNotice>
      )}

      {liveDataError && (
        <BackupNotice
          tone="error"
          icon={FaExclamationTriangle}
          title="Could not read the live database"
        >
          {liveDataError}
        </BackupNotice>
      )}

      <section className="backup-overview-grid">
        <BackupMetric
          icon={FaDatabase}
          label="Live Records"
          value={isLoadingLiveData ? "…" : liveBookings.length.toLocaleString()}
          helper="Booking records currently stored in Supabase"
        />

        <BackupMetric
          icon={FaHistory}
          label="Last Manual Backup"
          value={lastBackup ? formatDateTime(lastBackup.createdAt) : "Not recorded"}
          helper={
            lastBackup
              ? `${lastBackup.bookingCount} records · ${formatFileSize(lastBackup.fileSize)}`
              : "Create your first downloadable snapshot"
          }
        />

        <BackupMetric
          icon={FaArchive}
          label="Live Date Range"
          value={
            liveDateRange.first === "—"
              ? "No dated records"
              : `${liveDateRange.first} – ${liveDateRange.last}`
          }
          helper="Based on booking start and end dates"
        />
      </section>

      <section className="backup-workspace-grid">
        <article className="backup-panel backup-create-panel">
          <header className="backup-panel-header">
            <span className="backup-panel-icon backup-panel-icon-green">
              <FaCloudDownloadAlt />
            </span>

            <div>
              <p className="backup-panel-eyebrow">Export</p>
              <h2>Create a fresh backup</h2>
              <span>
                Downloads the live booking database as a validated JSON snapshot.
              </span>
            </div>
          </header>

          <div className="backup-coverage-card">
            <div className="backup-coverage-heading">
              <div>
                <span className="backup-coverage-kicker">Included in this backup</span>
                <strong>Booking database records</strong>
              </div>

              <span className="backup-covered-pill">
                <FaCheckCircle />
                Covered
              </span>
            </div>

            <div className="backup-coverage-list">
              <span><FaCheckCircle /> Core booking fields</span>
              <span><FaCheckCircle /> Imported spreadsheet source data</span>
              <span><FaCheckCircle /> Rental form details</span>
              <span><FaCheckCircle /> Activities, facilities & assignments</span>
              <span><FaCheckCircle /> Checklists and booking-level metadata</span>
              <span><FaCheckCircle /> Stable booking IDs used for restore</span>
            </div>
          </div>

          <div className="backup-snapshot-summary">
            <div>
              <small>Records ready to back up</small>
              <strong>{liveBookings.length.toLocaleString()}</strong>
            </div>

            <div>
              <small>Status categories</small>
              <strong>{liveStatusBreakdown.length}</strong>
            </div>

            <div>
              <small>Integrity protection</small>
              <strong>SHA-256</strong>
            </div>
          </div>

          {liveStatusBreakdown.length > 0 && (
            <div className="backup-status-strip">
              {liveStatusBreakdown.slice(0, 6).map(({ status, count }) => (
                <span key={status}>
                  <strong>{count}</strong>
                  {status}
                </span>
              ))}
            </div>
          )}

          <BackupNotice
            tone="info"
            icon={FaLock}
            title="The backup file does not contain your Supabase login credentials"
          >
            It exports the booking records returned by your existing booking service.
            Keep the file private anyway because booking records can contain guest
            names, contact information, notes, and operational details.
          </BackupNotice>

          <button
            className="backup-large-action backup-large-action-create"
            type="button"
            onClick={handleCreateBackup}
            disabled={isCreatingBackup || isRestoring || isLoadingLiveData}
          >
            <span>
              {isCreatingBackup ? (
                <FaRedoAlt className="backup-spin" />
              ) : (
                <FaDownload />
              )}
            </span>

            <div>
              <strong>{isCreatingBackup ? "Building snapshot…" : "Download Backup"}</strong>
              <small>
                {isCreatingBackup
                  ? "Reading the live database and calculating its checksum"
                  : "Create a timestamped .json file from the live database"}
              </small>
            </div>
          </button>
        </article>

        <article className="backup-panel backup-history-panel">
          <header className="backup-panel-header">
            <span className="backup-panel-icon backup-panel-icon-slate">
              <FaHistory />
            </span>

            <div>
              <p className="backup-panel-eyebrow">Backup Routine</p>
              <h2>Keep more than one copy</h2>
              <span>
                A downloaded backup only helps if it survives a lost laptop or bad
                deployment.
              </span>
            </div>
          </header>

          <div className="backup-routine-list">
            <div className="backup-routine-item">
              <span>1</span>
              <div>
                <strong>Create a backup before major imports</strong>
                <p>
                  Especially before replacing spreadsheet data or making broad record
                  changes.
                </p>
              </div>
            </div>

            <div className="backup-routine-item">
              <span>2</span>
              <div>
                <strong>Keep a second copy off this computer</strong>
                <p>
                  Put one copy in a restricted cloud folder or other organization-owned
                  storage.
                </p>
              </div>
            </div>

            <div className="backup-routine-item">
              <span>3</span>
              <div>
                <strong>Periodically test a backup file here</strong>
                <p>
                  Loading a file into the restore preview verifies its format and checksum
                  without changing live data.
                </p>
              </div>
            </div>
          </div>

          {lastBackup ? (
            <div className="backup-last-file-card">
              <span className="backup-last-file-icon">
                <FaFileAlt />
              </span>

              <div>
                <small>Last backup created from this browser</small>
                <strong>{lastBackup.filename}</strong>
                <p>
                  {lastBackup.bookingCount} records · {formatFileSize(lastBackup.fileSize)} ·{" "}
                  {formatDateTime(lastBackup.createdAt)}
                </p>
              </div>
            </div>
          ) : (
            <div className="backup-empty-history">
              <FaArchive />
              <strong>No manual backup recorded yet</strong>
              <p>Your first successful download will appear here.</p>
            </div>
          )}
        </article>
      </section>

      <section className="backup-restore-section">
        <header className="backup-section-heading">
          <div>
            <span className="backup-section-heading-icon">
              <FaUpload />
            </span>

            <div>
              <p className="backup-panel-eyebrow">Recovery</p>
              <h2>Restore from a backup</h2>
              <span>
                Select a backup file. Nothing is written to the database until you review
                the preview and press Restore.
              </span>
            </div>
          </div>
        </header>

        {!selectedBackup && !backupValidation ? (
          <div
            className={`backup-dropzone ${isDraggingFile ? "backup-dropzone-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDraggingFile(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInputChange}
            />

            <span className="backup-dropzone-icon">
              {isReadingBackup ? <FaRedoAlt className="backup-spin" /> : <FaUpload />}
            </span>

            <h3>{isReadingBackup ? "Reading backup…" : "Drop a backup file here"}</h3>
            <p>or select a .json backup from your computer</p>

            <button
              className="backup-secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReadingBackup}
            >
              <FaFileAlt />
              Choose Backup File
            </button>

            <small>Maximum file size: {formatFileSize(MAX_BACKUP_FILE_BYTES)}</small>
          </div>
        ) : (
          <div className="backup-restore-workspace">
            <div className="backup-selected-file-bar">
              <div>
                <span className="backup-selected-file-icon">
                  <FaFileAlt />
                </span>

                <div>
                  <small>Selected backup</small>
                  <strong>{selectedFile?.name || "Backup file"}</strong>
                  <p>{selectedFile ? formatFileSize(selectedFile.size) : ""}</p>
                </div>
              </div>

              <button
                type="button"
                className="backup-icon-button"
                onClick={resetSelectedBackup}
                disabled={isRestoring}
                aria-label="Remove selected backup"
              >
                <FaTimes />
              </button>
            </div>

            {backupValidation?.valid ? (
              <BackupNotice
                tone="success"
                icon={FaCheckCircle}
                title="Backup file passed validation"
              >
                The file format, schema version, record IDs, duplicate check, and SHA-256
                integrity checksum all passed.
              </BackupNotice>
            ) : (
              <BackupNotice
                tone="error"
                icon={FaExclamationTriangle}
                title="This backup cannot be restored"
              >
                Fix or replace the file before continuing. No live data has been changed.
              </BackupNotice>
            )}

            {backupValidation?.errors?.length > 0 && (
              <div className="backup-validation-list backup-validation-list-error">
                <strong>Validation errors</strong>
                <ul>
                  {backupValidation.errors.map((error, index) => (
                    <li key={`${error}-${index}`}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {backupValidation?.warnings?.length > 0 && (
              <div className="backup-validation-list backup-validation-list-warning">
                <strong>Warnings</strong>
                <ul>
                  {backupValidation.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedBackup && (
              <>
                <div className="backup-preview-grid">
                  <div>
                    <small>Created</small>
                    <strong>{formatDateTime(selectedBackup.createdAt)}</strong>
                  </div>

                  <div>
                    <small>Records</small>
                    <strong>{backupBookings.length.toLocaleString()}</strong>
                  </div>

                  <div>
                    <small>Schema</small>
                    <strong>Version {selectedBackup.schemaVersion ?? "—"}</strong>
                  </div>

                  <div>
                    <small>Integrity</small>
                    <strong>
                      {backupValidation?.integrity?.ok ? "Verified" : "Failed"}
                    </strong>
                  </div>

                  <div>
                    <small>Earliest booking date</small>
                    <strong>{backupDateRange.first}</strong>
                  </div>

                  <div>
                    <small>Latest booking date</small>
                    <strong>{backupDateRange.last}</strong>
                  </div>
                </div>

                {backupStatusBreakdown.length > 0 && (
                  <div className="backup-preview-statuses">
                    <div className="backup-subheading-row">
                      <div>
                        <strong>Backup contents by status</strong>
                        <span>Quick check before restore</span>
                      </div>
                    </div>

                    <div className="backup-preview-status-grid">
                      {backupStatusBreakdown.map(({ status, count }) => (
                        <div key={status}>
                          <strong>{count}</strong>
                          <span>{status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {comparison && (
                  <div className="backup-comparison-card">
                    <div className="backup-subheading-row">
                      <div>
                        <strong>Compared with the live database</strong>
                        <span>Matched by stable booking ID</span>
                      </div>
                    </div>

                    <div className="backup-comparison-grid">
                      <div className="backup-comparison-new">
                        <small>New from backup</small>
                        <strong>{comparison.newRecords}</strong>
                      </div>

                      <div className="backup-comparison-match">
                        <small>IDs already live</small>
                        <strong>{comparison.matchingRecords}</strong>
                      </div>

                      <div className="backup-comparison-current">
                        <small>Only in current database</small>
                        <strong>{comparison.onlyInCurrentDatabase}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {backupValidation?.valid && (
                  <div className="backup-restore-options">
                    <div className="backup-subheading-row">
                      <div>
                        <strong>Choose restore mode</strong>
                        <span>Pick how the backup should interact with current data.</span>
                      </div>
                    </div>

                    <div className="backup-mode-grid">
                      <label
                        className={`backup-mode-card ${
                          restoreMode === "merge" ? "backup-mode-card-active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="backupRestoreMode"
                          value="merge"
                          checked={restoreMode === "merge"}
                          onChange={() => {
                            setRestoreMode("merge");
                            setReplaceConfirmation("");
                          }}
                        />

                        <span className="backup-mode-radio" />

                        <div>
                          <span className="backup-mode-icon backup-mode-icon-safe">
                            <FaArchive />
                          </span>

                          <strong>Safe Merge</strong>
                          <p>
                            Adds missing backup records and updates records with matching
                            IDs. Current records that are not in the backup stay untouched.
                          </p>

                          <em>Recommended for most recoveries</em>
                        </div>
                      </label>

                      <label
                        className={`backup-mode-card backup-mode-card-danger ${
                          restoreMode === "replace" ? "backup-mode-card-active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="backupRestoreMode"
                          value="replace"
                          checked={restoreMode === "replace"}
                          onChange={() => setRestoreMode("replace")}
                        />

                        <span className="backup-mode-radio" />

                        <div>
                          <span className="backup-mode-icon backup-mode-icon-danger">
                            <FaTrashAlt />
                          </span>

                          <strong>Full Replace</strong>
                          <p>
                            Replaces the entire current booking database with exactly what
                            is in this backup.
                          </p>

                          <em>Use only when rolling the database back</em>
                        </div>
                      </label>
                    </div>

                    {restoreMode === "replace" && (
                      <div className="backup-danger-confirmation">
                        <div className="backup-danger-confirmation-heading">
                          <FaExclamationTriangle />
                          <div>
                            <strong>Full Replace is destructive</strong>
                            <p>
                              The app will automatically download a safety backup of the
                              current database before deletion begins. It will also attempt
                              an automatic rollback if the restore fails.
                            </p>
                          </div>
                        </div>

                        <label>
                          <span>
                            Type <strong>RESTORE</strong> to enable Full Replace
                          </span>
                          <input
                            type="text"
                            value={replaceConfirmation}
                            onChange={(event) =>
                              setReplaceConfirmation(event.target.value)
                            }
                            placeholder="RESTORE"
                            autoComplete="off"
                          />
                        </label>
                      </div>
                    )}

                    {isRestoring && (
                      <div className="backup-progress-card">
                        <div className="backup-progress-heading">
                          <div>
                            <FaRedoAlt className="backup-spin" />
                            <strong>{restoreProgress.label}</strong>
                          </div>

                          {restoreProgress.total > 0 && (
                            <span>
                              {restoreProgress.current} / {restoreProgress.total}
                            </span>
                          )}
                        </div>

                        <div className="backup-progress-track">
                          <span style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="backup-restore-footer">
                      <div>
                        <FaShieldAlt />
                        <span>
                          Restore uses the same Supabase booking service as the rest of the
                          dashboard.
                        </span>
                      </div>

                      <button
                        className={`backup-primary-button ${
                          restoreMode === "replace" ? "backup-danger-button" : ""
                        }`}
                        type="button"
                        onClick={handleRestore}
                        disabled={!canRestore}
                      >
                        {isRestoring ? (
                          <FaRedoAlt className="backup-spin" />
                        ) : restoreMode === "replace" ? (
                          <FaExclamationTriangle />
                        ) : (
                          <FaUpload />
                        )}

                        {isRestoring
                          ? "Restoring…"
                          : restoreMode === "replace"
                            ? "Replace Database From Backup"
                            : "Merge Backup Into Database"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="backup-limitations-card">
        <span className="backup-limitations-icon">
          <FaShieldAlt />
        </span>

        <div>
          <strong>What this version protects</strong>
          <p>
            This backup system protects the booking records exposed by your existing
            <code> bookingService </code>. Separate Supabase tables or Storage buckets—such
            as uploaded portal files or a separate public-inquiry table—need their own
            backup endpoint before they can be safely included here. The page deliberately
            does not pretend those are covered when they are not.
          </p>
        </div>
      </section>
    </main>
  );
}
