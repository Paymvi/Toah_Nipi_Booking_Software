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
} from "../services/bookingService";
import {
  fetchBackupSections,
  restoreBookingRows,
  restorePortalSnapshot,
  restoreSupportingSections,
  SUPPORTING_SECTION_KEYS,
} from "../services/backupService";
import {
  BACKUP_SECTIONS,
  createBackupEnvelope as createBackupFile,
  getBackupSection,
  validateBackupShape,
  verifyBackupIntegrity,
} from "../utils/backupFormat";

const LAST_BACKUP_STORAGE_KEY = "toahNipiLastManualBackup";
const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024;

/*
  Full Replace deletes every booking first. It is only offered in Dev Mode
  and needs this phrase typed, because deleting bookings can delete or
  orphan their portal tasks and documents (depending on the database's
  foreign-key rules, not visible from this app) and breaks any portal link
  whose booking is not re-created with the same token (AUDIT-009/010,
  Q-012 A). Dev Mode is a screen gate only; the database still decides who
  may delete (only admins).
*/
const REPLACE_CONFIRMATION_PHRASE = "REPLACE AND RISK PORTAL DATA";

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

// Reads every section and writes a version 2 backup file object.
async function createBackupEnvelope(reason = "manual") {
  const { sections, sectionErrors } = await fetchBackupSections({ fetchBookings });
  return createBackupFile(sections, { reason, sectionErrors });
}

function getBackupBookings(backup) {
  return getBackupSection(backup, "bookings");
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

function validateBasicBackupShape(backup) {
  return validateBackupShape(backup);
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

export default function DashboardBackups({
  onRestoreComplete,
  isDevMode = false,
  canReplace = true,
  canRestore: accountCanRestore = true,
}) {
  // Replace needs Dev Mode AND an account the database lets delete bookings.
  const replaceAvailable = isDevMode && canReplace;
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
    accountCanRestore &&
    Boolean(selectedBackup) &&
    Boolean(backupValidation?.valid) &&
    !isRestoring &&
    (restoreMode === "merge" ||
      (replaceAvailable &&
        replaceConfirmation.trim() === REPLACE_CONFIRMATION_PHRASE));

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

      const backup = await createBackupEnvelope("manual");
      const bookings = backup.payload.bookings;
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

      const missingSections = Object.keys(backup.coverage.sectionErrors);
      setRestoreResult({
        tone: missingSections.length ? "warning" : "success",
        title: missingSections.length ? "Backup created with gaps" : "Backup created",
        message:
          `${bookings.length} bookings, ${backup.summary.guestInquiryCount} website inquiries, ` +
          `${backup.summary.portalChecklistItemCount} portal tasks, ${backup.summary.portalDocumentCount} portal documents ` +
          `and a list of ${backup.summary.storageManifestCount} uploaded files were saved. ` +
          "The uploaded files themselves are not copied into the backup. " +
          (missingSections.length
            ? `Not included because they could not be read: ${missingSections
                .map((key) => BACKUP_SECTIONS.find((section) => section.key === key)?.label || key)
                .join(", ")}. `
            : "") +
          "Store the downloaded file somewhere outside this computer as well.",
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

  const downloadSafetySnapshot = async () => {
    const safetyBackup = await createBackupEnvelope("pre-restore-safety");
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
    // Live portal data read just before the delete; put back after it.
    let safetyPayload = null;
    let portalResults = null;
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

        const safetySnapshot = await downloadSafetySnapshot();
        safetyFilename = safetySnapshot.filename;
        safetyPayload = safetySnapshot.backup.payload;

        // Deleting bookings deletes their portal rows; without a full copy they could not be put back.
        const unreadable = SUPPORTING_SECTION_KEYS.filter(
          (key) => key in safetySnapshot.backup.coverage.sectionErrors
        );

        if (unreadable.length > 0) {
          throw new Error(
            `Full Replace was not started. The safety backup could not read: ${unreadable
              .map((key) => BACKUP_SECTIONS.find((section) => section.key === key)?.label || key)
              .join(", ")}. Nothing was deleted.`
          );
        }

        setRestoreProgress({
          current: 0,
          total: bookingsToRestore.length,
          label: "Clearing the current booking database…",
        });

        destructiveStepStarted = true;
        const deletedCount = await deleteAllBookings();

        if (deletedCount < originalBookings.length) {
          throw new Error(
            `Only ${deletedCount} of ${originalBookings.length} bookings could be deleted. ` +
              "Only administrators can delete bookings, and linked portal records can also block deletion."
          );
        }
      }

      setRestoreProgress({
        current: 0,
        total: bookingsToRestore.length,
        label:
          restoreMode === "replace"
            ? "Restoring backup records…"
            : "Merging backup records…",
      });

      const liveIdsBeforeRestore =
        restoreMode === "replace"
          ? new Set()
          : new Set(originalBookings.map((booking) => String(booking.id)));

      await restoreBookingRows(bookingsToRestore, liveIdsBeforeRestore, {
        onProgress: (current, total) => {
          setRestoreProgress({
            current,
            total,
            label:
              restoreMode === "replace"
                ? "Restoring backup records…"
                : "Merging backup records…",
          });
        },
      });

      // Live portal data first, so it wins over older copies in the backup.
      if (restoreMode === "replace") {
        setRestoreProgress({
          current: bookingsToRestore.length,
          total: bookingsToRestore.length,
          label: "Putting back current portal tasks, documents and inquiry links…",
        });
        portalResults = await restorePortalSnapshot(
          safetyPayload,
          bookingsToRestore.map((booking) => booking.id)
        );
      }

      // Version 2 backups also hold website inquiries and portal records.
      let supportingResults = null;

      if (selectedBackup.schemaVersion >= 2) {
        setRestoreProgress({
          current: bookingsToRestore.length,
          total: bookingsToRestore.length,
          label: "Restoring website inquiries and portal records…",
        });
        supportingResults = await restoreSupportingSections(selectedBackup.payload);
      }

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

      const supportingSummary = supportingResults
        ? " " +
          ["guestInquiries", "portalChecklistItems", "portalDocuments"]
            .map((key) => {
              const label = BACKUP_SECTIONS.find((section) => section.key === key)?.label;
              const result = supportingResults[key];
              return result.error
                ? `${label}: not restored (${result.error}).`
                : `${label}: ${result.inserted} added, ${result.alreadyPresent} already present and left unchanged.`;
            })
            .join(" ")
        : " This version 1 backup holds bookings only; it added no website inquiries or portal records.";
      const portalSummary = portalResults
        ? ` Current portal data put back: ${portalResults.portalChecklistItems.restored} portal tasks, ${portalResults.portalDocuments.restored} portal documents, ${portalResults.guestInquiries.relinked} website-inquiry links.` +
          (portalResults.portalChecklistItems.skipped +
            portalResults.portalDocuments.skipped +
            portalResults.guestInquiries.skipped >
          0
            ? ` Not put back because their booking is not in this backup: ${portalResults.portalChecklistItems.skipped} portal tasks, ${portalResults.portalDocuments.skipped} portal documents, ${portalResults.guestInquiries.skipped} website-inquiry links. They are kept in “${safetyFilename}”.`
            : "")
        : "";
      const supportingFailed = supportingResults
        ? Object.values(supportingResults).some((result) => result.error)
        : false;

      setRestoreResult({
        tone: supportingFailed ? "warning" : "success",
        title: restoreMode === "replace" ? "Backup restored" : "Backup merged",
        message:
          (restoreMode === "replace"
            ? `${bookingsToRestore.length} booking record${
                bookingsToRestore.length === 1 ? " was" : "s were"
              } restored and verified, with their original portal tokens and creation dates where the backup had them. A pre-restore safety backup was downloaded as “${safetyFilename}”.`
            : `${bookingsToRestore.length} backup record${
                bookingsToRestore.length === 1 ? " was" : "s were"
              } merged into the live database and verified. Records that existed only in the current database were left untouched.`) +
          portalSummary +
          supportingSummary +
          " Uploaded files are never restored by this page.",
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
          // Re-inserted with their original portal tokens and creation dates.
          await restoreBookingRows(originalBookings, new Set(), {
            onProgress: (current, total) => {
              setRestoreProgress({
                current,
                total,
                label: "Restore failed. Rolling back previous database…",
              });
            },
          });
          // Every original booking is back, so all of its portal rows and inquiry links can return.
          await restorePortalSnapshot(
            safetyPayload,
            originalBookings.map((booking) => booking.id)
          );

          const rolledBackBookings = await fetchBookings();
          setLiveBookings(rolledBackBookings);
          rollbackMessage =
            " The previous bookings, portal tasks, portal documents and website-inquiry links were restored automatically from the in-memory safety copy.";
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
                <strong>Bookings, website inquiries and portal records</strong>
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
              <span><FaCheckCircle /> Booking IDs, portal link tokens and creation dates</span>
              <span><FaCheckCircle /> Website inquiries</span>
              <span><FaCheckCircle /> Portal tasks and portal documents</span>
              <span><FaCheckCircle /> A list of uploaded files (names and locations only, not the files)</span>
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
                                                    disabled={!replaceAvailable}
                          onChange={() => setRestoreMode("replace")}
                        />

                        <span className="backup-mode-radio" />

                        <div>
                          <span className="backup-mode-icon backup-mode-icon-danger">
                            <FaTrashAlt />
                          </span>

                          <strong>Full Replace</strong>
                          <p>
                            Deletes every current booking, then restores the backup. Portal
                            tasks and documents linked to deleted bookings may be deleted or
                            orphaned by the database, and uploaded files are never restored.
                          </p>

                                                    <em>
                            {replaceAvailable
                              ? "Disaster recovery only"
                              : !canReplace
                                ? "Administrators only"
                                : "Available only in Dev Mode"}
                          </em>
                        </div>
                      </label>
                    </div>

                                        {restoreMode === "replace" && replaceAvailable && (
                      <div className="backup-danger-confirmation">
                        <div className="backup-danger-confirmation-heading">
                          <FaExclamationTriangle />
                          <div>
                            <strong>Full Replace is destructive</strong>
                            <p>
                              Every current booking is deleted first. Depending on the
                              database's rules, that can also delete or orphan their portal
                              tasks and documents, and guests' portal links stop working for
                              any booking the backup does not re-create with its original
                              token. A safety backup of everything is downloaded before
                              deletion, and an automatic rollback is attempted if the restore
                              fails. Only administrator accounts can delete bookings; Dev Mode
                              does not change that.
                            </p>
                          </div>
                        </div>

                        <label>
                          <span>
                            Type <strong>{REPLACE_CONFIRMATION_PHRASE}</strong> to enable Full Replace
                          </span>
                          <input
                            type="text"
                            value={replaceConfirmation}
                            onChange={(event) =>
                              setReplaceConfirmation(event.target.value)
                            }
                            placeholder={REPLACE_CONFIRMATION_PHRASE}
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
            New backups (version 2) hold bookings, website inquiries, portal tasks,
            portal documents and a list of the uploaded files those records point to.
            The files themselves stay in Supabase Storage and are not copied; a
            section that could not be read is named in the file and when it is
            loaded here. Older backups (version 1), including the daily Google
            Drive backups the README describes, hold bookings only and still
            restore. The staff directory, contact preferences and saved spreadsheet
            views are not included.
          </p>
        </div>
      </section>
    </main>
  );
}
