import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  FaKey,
  FaSyncAlt,
  FaTasks,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
} from "react-icons/fa";

import { supabase } from "../lib/supabaseClient";

import {
  getPortalDemo,
  portalDemoEmailApi,
  subscribePortalDemo,
} from "../tutorial/portalDemo";
import { PortalEmailSettingsCard } from "../components/PortalEmailPanel";
import {
  isMissingEmailSetup,
  loadEmailAdmin,
} from "../services/portalEmailService";
import {
  buildPortalUrl,
  getPortalBaseUrl,
  PORTAL_BASE_URL_MISSING_MESSAGE,
  portalItemHasGuestSubmission,
} from "../utils/portalRules";
import {
  changePortalItemDueDate,
  removePortalDocument,
  removePortalItem,
  reopenPortalItem,
  requestPortalItemChanges,
  setPortalItemSignDocument,
} from "../services/portalCorrections";

import {
  fetchPortalOverviewRecords,
  fetchPortalSigningSettings,
  PORTAL_UPLOAD_BUCKET,
  insertPortalChecklistItems,
  insertPortalDocuments,
  validatePortalStaffDocument,
  insertCustomPortalDocument,
  buildStaffPortalDocumentStoragePath,
  getPortalStaffDocumentMimeType,
} from "../services/portalAdminData";
import PortalRecordCard from "../components/portalAdmin/PortalRecordCard";

/* =========================================================
   SUMMARY CARD
========================================================= */

function PortalAdminSummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}) {
  return (
    <article
      className={`portal-summary-tile portal-summary-tile-${tone}`}
    >
      <span className="portal-summary-tile-icon">
        <Icon />
      </span>

      <div>
        <small>
          {label}
        </small>

        <strong>
          {value}
        </strong>

        {helper && (
          <em>
            {helper}
          </em>
        )}
      </div>
    </article>
  );
}


/* =========================================================
   PORTAL ADMIN VIEW
========================================================= */

/*
  The tutorial's fictional demo runs through a second copy of the same
  screen. The real one stays mounted but hidden, so its search, filter, open
  panels and any unsaved choices are all still there when the demo ends.
*/
export default function PortalAdminView(props) {
  const demo = useSyncExternalStore(subscribePortalDemo, getPortalDemo);

  return (
    <>
      <div style={{ display: demo ? "none" : "contents" }}>
        <PortalAdminScreen {...props} />
      </div>

      {demo && <PortalAdminScreen {...props} demo={demo} />}
    </>
  );
}


function ignoreInDemo() {}


function PortalAdminScreen({
  inquiryBookings,
  openBookingDetail,
  staffRole = "",
  demo = null,
}) {
  const [
    loadedRecords,
    setPortalRecords,
  ] =
    useState([]);

  const portalRecords = demo?.records ?? loadedRecords;

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(!demo);

  const [
    portalError,
    setPortalError,
  ] =
    useState("");

  const [
    searchTerm,
    setSearchTerm,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("all");

  const [
    copiedBookingId,
    setCopiedBookingId,
  ] =
    useState("");

  const [
    assigningBookingId,
    setAssigningBookingId,
  ] =
    useState("");

  const [
    assigningDocumentBookingId,
    setAssigningDocumentBookingId,
  ] =
    useState("");

  const [
    uploadingDocumentBookingId,
    setUploadingDocumentBookingId,
  ] =
    useState("");


  const [
    confirmingChecklistItemId,
    setConfirmingChecklistItemId,
  ] =
    useState("");


  const latestLoadRequestRef =
    useRef(0);

  // Staff preparation is independent of the guest signing switch.
  const [signingAvailable, setSigningAvailable] = useState(false);
  const [signingSettings, setSigningSettings] = useState(null);

  // Portal email settings; { missing: true } until the migration is run.
  const [loadedEmailAdmin, setEmailAdmin] = useState(null);
  const emailAdmin = demo?.emailAdmin ?? loadedEmailAdmin;

  function loadEmailSettings() {
    return loadEmailAdmin().then(setEmailAdmin, (error) => {
      setEmailAdmin(isMissingEmailSetup(error) ? { missing: true } : null);
    });
  }


  function loadPortalRecords() {
    setIsLoading(
      true
    );

    setPortalError(
      ""
    );

    return fetchPortalRecords();
  }

  // The first load (on mount) starts with isLoading already true and no error.
  async function fetchPortalRecords() {
    // Overlapping reloads can resolve out of order; only the newest
    // request may update state.
    const requestId =
      latestLoadRequestRef.current + 1;

    latestLoadRequestRef.current =
      requestId;

    try {
      const [overview, settings] =
        await Promise.all([
          fetchPortalOverviewRecords(),
          fetchPortalSigningSettings(),
        ]);

      if (
        requestId !==
        latestLoadRequestRef.current
      ) {
        return;
      }

      setPortalRecords(
        overview.records
      );
      setSigningAvailable(overview.signingAvailable);
      setSigningSettings(settings);
    } catch (error) {
      if (
        requestId !==
        latestLoadRequestRef.current
      ) {
        return;
      }

      console.error(
        "Could not load portal overview:",
        error
      );

      setPortalError(
        "Could not load portal information. Check the console."
      );
    } finally {
      if (
        requestId ===
        latestLoadRequestRef.current
      ) {
        setIsLoading(
          false
        );
      }
    }
  }


  useEffect(
    () => {
            if (demo) return;
      fetchPortalRecords();
      loadEmailSettings();
    },
    [demo]
  );


  const summary =
    useMemo(
      () => {
        const total =
          portalRecords.length;

        const withChecklists =
          portalRecords.filter(
            (record) =>
              record
                .progress
                .total >
              0
          ).length;

        const needsReview =
          portalRecords.filter(
            (record) =>
              record
                .progress
                .needsReview >
              0
          ).length;

        const waitingOnGuest =
          portalRecords.filter(
            (record) =>
              record
                .progress
                .needsReview ===
                0 &&
              record
                .progress
                .open >
                0
          ).length;

        const complete =
          portalRecords.filter(
            (record) =>
              record
                .progress
                .total >
                0 &&
              record
                .progress
                .completed ===
                record
                  .progress
                  .total
          ).length;

        return {
          total,
          withChecklists,
          needsReview,
          waitingOnGuest,
          complete,
        };
      },
      [
        portalRecords,
      ]
    );


  const filteredRecords =
    useMemo(
      () => {
        const search =
          searchTerm
            .trim()
            .toLowerCase();

        return portalRecords
          .filter(
            (record) => {
              if (
                !search
              ) {
                return true;
              }

              return [
                record.organizationName,
                record.contactName,
                record.email,
                record.status,
              ]
                .join(
                  " "
                )
                .toLowerCase()
                .includes(
                  search
                );
            }
          )
          .filter(
            (record) => {
              if (
                statusFilter ===
                "all"
              ) {
                return true;
              }

              if (
                statusFilter ===
                "needsReview"
              ) {
                return (
                  record
                    .progress
                    .needsReview >
                  0
                );
              }

              if (
                statusFilter ===
                "waiting"
              ) {
                return (
                  record
                    .progress
                    .needsReview ===
                    0 &&
                  record
                    .progress
                    .open >
                    0
                );
              }

              if (
                statusFilter ===
                "complete"
              ) {
                return (
                  record
                    .progress
                    .total >
                    0 &&
                  record
                    .progress
                    .completed ===
                    record
                      .progress
                      .total
                );
              }

              if (
                statusFilter ===
                "noChecklist"
              ) {
                return (
                  record
                    .progress
                    .total ===
                  0
                );
              }

              return true;
            }
          )
          .sort(
            (
              a,
              b
            ) => {
              if (
                b
                  .progress
                  .needsReview !==
                a
                  .progress
                  .needsReview
              ) {
                return (
                  b
                    .progress
                    .needsReview -
                  a
                    .progress
                    .needsReview
                );
              }

              if (
                b
                  .progress
                  .open !==
                a
                  .progress
                  .open
              ) {
                return (
                  b
                    .progress
                    .open -
                  a
                    .progress
                    .open
                );
              }

              return String(
                a.startDate ||
                  ""
              ).localeCompare(
                String(
                  b.startDate ||
                    ""
                )
              );
            }
          );
      },
      [
        portalRecords,
        searchTerm,
        statusFilter,
      ]
    );


  async function handleCopyPortalLink(
    record
  ) {
    const portalUrl =
      buildPortalUrl(
        record.portalToken
      );

        if (
      !portalUrl
    ) {
      alert(
        getPortalBaseUrl()
          ? "This booking has no portal token yet."
          : PORTAL_BASE_URL_MISSING_MESSAGE
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(
        portalUrl
      );

      setCopiedBookingId(
        record.id
      );

      window.setTimeout(
        () => {
          setCopiedBookingId(
            ""
          );
        },
        1600
      );
    } catch (error) {
      console.error(
        "Could not copy portal link:",
        error
      );

      alert(
        "Could not copy the portal link."
      );
    }
  }


  function handleOpenBooking(
    bookingId
  ) {
    const booking =
      inquiryBookings.find(
        (inquiry) =>
          inquiry.id ===
          bookingId
      );

    if (
      !booking
    ) {
      alert(
        "Could not find this booking in the current dashboard data."
      );

      return;
    }

    openBookingDetail(
      booking
    );
  }


  async function handleConfirmChecklistItem(
    record,
    item
  ) {
    if (
      !record?.id ||
      !item?.id
    ) {
      return;
    }

    try {
      setConfirmingChecklistItemId(
        item.id
      );

      // Guarded by the status staff saw: Needs Review, or Not started for a staff-only task.
      const {
        data,
        error,
      } =
        await supabase
          .from(
            "portal_checklist_items"
          )
          .update({
            status:
              "completed",
            last_changed_at:
              new Date()
                .toISOString(),
            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            item.id
          )
          .eq(
            "booking_id",
            record.id
          )
          .eq(
            "status",
            item.status
          )
          .select("id");

      if (
        error
      ) {
        throw error;
      }

      if (!data?.length) {
        alert("This task changed since the page loaded. The list will refresh.");
      }

      await loadPortalRecords();
    } catch (error) {
      console.error(
        "Could not confirm portal checklist item:",
        error
      );

      alert(
        "Could not confirm this checklist item."
      );
    } finally {
      setConfirmingChecklistItemId(
        ""
      );
    }
  }


    /*
    The five corrections (AUDIT-038, Q-017). Each is guarded in the
    database by the status staff saw; the list reloads afterwards.
  */
  async function handleCorrectChecklistItem(
    record,
    item,
    action,
    payload = {}
  ) {
    try {
      if (action === "dueDate") {
        await changePortalItemDueDate(supabase, item, payload.dueDate);
      } else if (action === "requestChanges") {
        const { noteSaved } = await requestPortalItemChanges(supabase, item, payload.note);
        if (payload.note && !noteSaved) {
          alert(
            "The task was sent back to the guest. The note could not be saved because the database does not have the staff_review_note column yet."
          );
        }
      } else if (action === "reopen") {
        await reopenPortalItem(supabase, item);
      } else if (action === "signDocument") {
        await setPortalItemSignDocument(supabase, item, payload.documentId);
      } else if (action === "remove") {
        if (
          !window.confirm(
            portalItemHasGuestSubmission(item)
              ? `Remove "${item.title}" from ${record.organizationName}'s portal?\n\nThe guest's upload is kept for staff and hidden from the guest.`
              : `Remove "${item.title}" from ${record.organizationName}'s portal?`
          )
        ) {
          return;
        }
        const { data: userData } = await supabase.auth.getUser();
        const result = await removePortalItem(supabase, {
          bookingId: record.id,
          item,
          removedBy: userData?.user?.id || null,
          bucket: PORTAL_UPLOAD_BUCKET,
        });
        alert(result.message);
      }

      await loadPortalRecords();
    } catch (error) {
      console.error("Could not correct the portal task:", error);
      alert(error?.message || "Could not change this portal task.");
      await loadPortalRecords();
    }
  }

  async function handleRemoveDocument(record, document) {
    if (
      !window.confirm(
        `Stop sharing "${document.title}" with ${record.organizationName}?`
      )
    ) {
      return;
    }

    try {
      const result = await removePortalDocument(supabase, document);
      alert(result.message);
    } catch (error) {
      console.error("Could not remove the portal document:", error);
      alert(error?.message || "Could not remove this document.");
    } finally {
      await loadPortalRecords();
    }
  }

  async function handleAssignTasks(
    record,
    tasks
  ) {
    const safeTasks = tasks;

    if (
      safeTasks.length === 0
    ) {
      throw new Error(
        "Choose at least one task to assign."
      );
    }

    try {
      setAssigningBookingId(
        record.id
      );

      await insertPortalChecklistItems(
        record.id,
        safeTasks
      );

      await loadPortalRecords();
    } finally {
      setAssigningBookingId(
        ""
      );
    }
  }


  async function handleAssignDocuments(
    record,
    documents
  ) {
    const safeDocuments = documents;

    if (
      safeDocuments.length === 0
    ) {
      throw new Error(
        "Choose at least one document to assign."
      );
    }

    try {
      setAssigningDocumentBookingId(
        record.id
      );

      await insertPortalDocuments(
        record.id,
        safeDocuments
      );

      await loadPortalRecords();
    } finally {
      setAssigningDocumentBookingId(
        ""
      );
    }
  }


  async function handleUploadCustomDocument(
    record,
    document
  ) {
    if (
      !record?.id ||
      !record?.portalToken
    ) {
      throw new Error(
        "This booking needs a portal token before a custom document can be uploaded."
      );
    }

    const cleanedTitle =
      String(
        document?.title ||
          ""
      )
        .trim();

    if (!cleanedTitle) {
      throw new Error(
        "Enter a title for the document."
      );
    }

    const file =
      document?.file;

    const validationError =
      validatePortalStaffDocument(
        file
      );

    if (validationError) {
      throw new Error(
        validationError
      );
    }

    let insertedDocument =
      null;

    let uploadedStoragePath =
      "";

    try {
      setUploadingDocumentBookingId(
        record.id
      );

      insertedDocument =
        await insertCustomPortalDocument(
          record.id,
          {
            title:
              cleanedTitle,
            documentType:
              String(
                document.documentType ||
                  "Staff Document"
              )
                .trim() ||
              "Staff Document",
            fileName:
              String(
                file.name ||
                  "upload"
              ).trim(),
            note:
              String(
                document.note ||
                  ""
              ).trim(),
          }
        );

      const storagePath =
        buildStaffPortalDocumentStoragePath(
          record.portalToken,
          insertedDocument.id,
          file.name
        );

      if (!storagePath) {
        throw new Error(
          "Could not build a safe storage path for this document."
        );
      }

      uploadedStoragePath =
        storagePath;

      const mimeType =
        getPortalStaffDocumentMimeType(
          file
        );

      const {
        error: uploadError,
      } =
        await supabase.storage
          .from(
            PORTAL_UPLOAD_BUCKET
          )
          .upload(
            storagePath,
            file,
            {
              cacheControl:
                "3600",
              contentType:
                mimeType,
              upsert:
                false,
            }
          );

            if (uploadError) {
        throw uploadError;
      }

      // Keep the file's location on the row so it never has to be derived
      // from the current portal token. Skipped until the column exists.
      const { error: pathError } = await supabase
        .from("portal_documents")
        .update({ storage_path: storagePath })
        .eq("id", insertedDocument.id);

      if (pathError) {
        console.warn(
          "Could not record the document's storage path (has the portal migration been run?):",
          pathError
        );
      }

      await loadPortalRecords();
    } catch (error) {
      if (uploadedStoragePath) {
        try {
          await supabase.storage
            .from(
              PORTAL_UPLOAD_BUCKET
            )
            .remove([
              uploadedStoragePath,
            ]);
        } catch (storageCleanupError) {
          console.error(
            "Could not clean up failed custom portal document file:",
            storageCleanupError
          );
        }
      }

      if (
        insertedDocument?.id
      ) {
        try {
          await supabase
            .from(
              "portal_documents"
            )
            .delete()
            .eq(
              "id",
              insertedDocument.id
            )
            .eq(
              "booking_id",
              record.id
            );
        } catch (cleanupError) {
          console.error(
            "Could not clean up failed custom portal document row:",
            cleanupError
          );
        }
      }

      throw error;
    } finally {
      setUploadingDocumentBookingId(
        ""
      );
    }
  }


  return (
    <section
      className="portal-admin-page"
      data-tutorial-target="portal-page"
      data-staff-role={staffRole}
    >
      {demo && (
        <p className="portal-demo-banner" role="status">
          <strong>Tutorial demo.</strong> These groups are fictional. Nothing here is real, saved or sent.
        </p>
      )}

      <article className="dashboard-card portal-admin-hero-card">
        <div className="portal-admin-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaKey />
            </span>

            <div>
              <p className="dashboard-eyebrow">
                Guest Portals
              </p>

              <h2>
                Portal Progress
              </h2>

              <span>
                Track each group&apos;s
                guest-facing checklist,
                documents, and review
                status.
              </span>
            </div>
          </div>

          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={
              demo ? ignoreInDemo : loadPortalRecords
            }
            disabled={
              isLoading
            }
          >
            <FaSyncAlt />

            {isLoading
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>


        <div className="portal-summary-grid-admin" data-tutorial-target="portal-summary">
          <PortalAdminSummaryCard
            icon={
              FaKey
            }
            label="Total Groups"
            value={
              summary.total
            }
            helper="Bookings loaded from Supabase"
          />

          <PortalAdminSummaryCard
            icon={
              FaTasks
            }
            label="With Checklists"
            value={
              summary.withChecklists
            }
            helper="Groups with portal tasks"
            tone="blue"
          />

          <PortalAdminSummaryCard
            icon={
              FaExclamationTriangle
            }
            label="Needs Review"
            value={
              summary.needsReview
            }
            helper="Guest submitted or staff review needed"
            tone="gold"
          />

          <PortalAdminSummaryCard
            icon={
              FaCheckCircle
            }
            label="Complete"
            value={
              summary.complete
            }
            helper="All checklist items complete"
            tone="green"
          />
        </div>
      </article>


      <PortalEmailSettingsCard
        emailAdmin={emailAdmin}
        onReload={demo ? ignoreInDemo : loadEmailSettings}
        api={demo ? portalDemoEmailApi : undefined}
      />


      <article className="dashboard-card portal-admin-toolbar" data-tutorial-target="portal-toolbar">
        <label data-tutorial-target="portal-search">
          <span>
            Search
          </span>

          <input
            value={
              searchTerm
            }
            placeholder="Search group, contact, email, or status..."
            onChange={(
              event
            ) =>
              setSearchTerm(
                event
                  .target
                  .value
              )
            }
          />
        </label>

        <label data-tutorial-target="portal-status">
          <span>
            Status
          </span>

          <select
            value={
              statusFilter
            }
            onChange={(
              event
            ) =>
              setStatusFilter(
                event
                  .target
                  .value
              )
            }
          >
            <option value="all">
              All Portal Groups
            </option>

            <option value="needsReview">
              Needs Review
            </option>

            <option value="waiting">
              Waiting on Guest
            </option>

            <option value="complete">
              Complete
            </option>

            <option value="noChecklist">
              No Checklist
            </option>
          </select>
        </label>
      </article>


      {portalError && (
        <section className="dashboard-card portal-admin-error">
          <FaExclamationTriangle />

          <strong>
            {
              portalError
            }
          </strong>
        </section>
      )}


      {isLoading &&
      portalRecords.length ===
        0 ? (
        <section className="dashboard-card portal-admin-loading" data-tutorial-target="portal-loading">
          <FaClock />

          <strong>
            Loading portal progress...
          </strong>
        </section>
      ) : filteredRecords.length >
        0 ? (
        <div className="portal-record-list" data-tutorial-target="portal-list">
          {filteredRecords.map(
            (record) => (
              <PortalRecordCard
                key={
                  record.id
                }
                record={
                  record
                }
                copiedBookingId={
                  copiedBookingId
                }
                isAssigning={
                  assigningBookingId ===
                  record.id
                }
                isAssigningDocuments={
                  assigningDocumentBookingId ===
                  record.id
                }
                isUploadingCustomDocument={
                  uploadingDocumentBookingId ===
                  record.id
                }
                confirmingItemId={
                  confirmingChecklistItemId
                }
                                onConfirmChecklistItem={
                demo ? ignoreInDemo : handleConfirmChecklistItem
              }
              onCorrectChecklistItem={
                demo ? ignoreInDemo : handleCorrectChecklistItem
              }
              onRemoveDocument={
                demo ? ignoreInDemo : handleRemoveDocument
              }
              onCopyPortalLink={
                demo ? ignoreInDemo : handleCopyPortalLink
              }
              onOpenBooking={
                demo ? ignoreInDemo : handleOpenBooking
              }
              onAssignTasks={
                demo ? ignoreInDemo : handleAssignTasks
              }
              onAssignDocuments={
                demo ? ignoreInDemo : handleAssignDocuments
              }
              onUploadCustomDocument={
                demo ? ignoreInDemo : handleUploadCustomDocument
              }
              emailAdmin={emailAdmin}
              emailApi={demo ? portalDemoEmailApi : undefined}
              signingAvailable={!demo && signingAvailable}
              signingSettings={signingSettings}
              />
            )
          )}
        </div>
      ) : (
        <section className="dashboard-card portal-admin-empty">
          <strong>
            No portal records match
            this filter
          </strong>

          <p>
            Try changing the search
            or filter, or assign
            checklist items to a
            booking.
          </p>
        </section>
      )}
    </section>
  );
}
