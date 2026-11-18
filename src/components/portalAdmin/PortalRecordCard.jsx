import { useState } from "react";
import {
  FaTasks,
  FaFileAlt,
  FaCopy,
  FaExternalLinkAlt,
  FaChevronDown,
  FaChevronUp,
  FaEnvelope,
} from "react-icons/fa";
import CopyButton from "../CopyButton";
import PortalEmailPanel from "../PortalEmailPanel";
import {
  buildPortalUrl,
  getPortalBaseUrl,
  getSignableDocuments,
  isSigningOnForBooking,
  PORTAL_BASE_URL_MISSING_MESSAGE,
} from "../../utils/portalRules";
import { formatDateRange } from "../../utils/dateUtils";
import PortalChecklistPreview from "./PortalChecklistPreview";
import PortalTaskAssignmentPanel from "./PortalTaskAssignmentPanel";
import PortalDocumentAssignmentPanel from "./PortalDocumentAssignmentPanel";

/* =========================================================
   PORTAL STATUS
========================================================= */

function getPortalStatusLabel(
  record
) {
  if (
    record.progress.total === 0
  ) {
    return "No Checklist";
  }

  if (
    record.progress.needsReview >
    0
  ) {
    return "Needs Review";
  }

  if (
    record.progress.open > 0
  ) {
    return "Waiting on Guest";
  }

  return "Complete";
}

function getPortalStatusClass(
  record
) {
  if (
    record.progress.total === 0
  ) {
    return "no-checklist";
  }

  if (
    record.progress.needsReview >
    0
  ) {
    return "needs-review";
  }

  if (
    record.progress.open > 0
  ) {
    return "waiting";
  }

  return "complete";
}

/* =========================================================
   PROGRESS
========================================================= */

function PortalAdminProgressBar({
  percent,
}) {
  return (
    <div className="portal-admin-progress-track">
      <div
        className="portal-admin-progress-fill"
        style={{
          width:
            `${percent}%`,
        }}
      />
    </div>
  );
}

/* =========================================================
   PORTAL RECORD CARD
========================================================= */

export default function PortalRecordCard({
  record,
  copiedBookingId,
  isAssigning,
  isAssigningDocuments,
  isUploadingCustomDocument,
    confirmingItemId,
  onConfirmChecklistItem,
  onCorrectChecklistItem,
  onRemoveDocument,
  onCopyPortalLink,
  onOpenBooking,
  onAssignTasks,
  onAssignDocuments,
    onUploadCustomDocument,
  emailAdmin,
  emailApi,
  signingAvailable = false,
  signingSettings = null,
}) {
  const [
    openManager,
    setOpenManager,
  ] =
    useState("");

  const signing = signingAvailable
    ? {
        available: true,
        settings: signingSettings,
        isOn: isSigningOnForBooking(signingSettings, record.id),
        documents: getSignableDocuments(record.documents),
        allDocuments: record.documents,
      }
    : null;

  const orphanSignatures = (record.signatures || []).filter(
    (signature) => !record.checklistItems.some((item) => item.id === signature.checklistItemId)
  );

  const portalStatusLabel =
    getPortalStatusLabel(
      record
    );

  const portalStatusClass =
    getPortalStatusClass(
      record
    );

  // A demo group has no real link, and the guard stops this one being followed.
  const portalUrl =
    record.isDemo
      ? "#fictional-demo"
      : buildPortalUrl(
          record.portalToken
        );

  const guestLabel =
    record.attendeeCount
      ? `${record.attendeeCount} guest${
          String(
            record.attendeeCount
          ) === "1"
            ? ""
            : "s"
        }`
      : "No guest count";


  return (
    <article
      className={`portal-record-card portal-record-card-${portalStatusClass}`}
      data-tutorial-target="portal-card"
      data-tutorial-scope={record.id}
    >
      <div className="portal-record-main">
        <div className="portal-record-title-row" data-tutorial-target="portal-progress">
          <div>
            <span
              className={`portal-record-status-pill ${portalStatusClass}`}
              data-tutorial-target="portal-status-pill"
            >
              {
                portalStatusLabel
              }
            </span>

            <h3>
              {
                record.organizationName
              }
            </h3>

            <p>
              {formatDateRange(
                record.startDate,
                record.endDate
              )}{" "}
              · {guestLabel}
            </p>
          </div>

          <strong className="portal-record-progress-number">
            {
              record.progress.percent
            }
            %
          </strong>
        </div>


        <PortalAdminProgressBar
          percent={
            record.progress.percent
          }
        />


        <div className="portal-record-metrics" data-tutorial-target="portal-metrics">
          <span>
            <strong>
              {
                record.progress
                  .completed
              }
            </strong>

            Complete
          </span>

          <span>
            <strong>
              {
                record.progress
                  .needsReview
              }
            </strong>

            Review
          </span>

          <span>
            <strong>
              {
                record.progress.open
              }
            </strong>

            Open
          </span>

          <span>
            <strong>
              {
                record.documents
                  .length
              }
            </strong>

            Docs
          </span>
        </div>


        <PortalChecklistPreview
          items={
            record.checklistItems
          }
          isDemo={record.isDemo}
          confirmingItemId={
            confirmingItemId
          }
                    onConfirmItem={
            (item) =>
              onConfirmChecklistItem(
                record,
                item
              )
          }
          onCorrectItem={
            (item, action, payload) =>
              onCorrectChecklistItem(
                record,
                item,
                action,
                payload
              )
          }
          signing={signing}
          orphanSignatures={orphanSignatures}
        />
      </div>


      <aside className="portal-record-side">
        <div className="portal-record-contact">
          <small>
            Primary Contact
          </small>

          <strong>
            {
              record.contactName
            }
          </strong>

          <span>
            {record.email ||
              "No email"}
            <CopyButton value={record.email} label="email address" />
          </span>
        </div>


        <div className="portal-record-token" data-tutorial-target="portal-link">
          <small>
            Portal Link
          </small>

                    {!getPortalBaseUrl() && (
            <em className="portal-record-link-warning">
              {PORTAL_BASE_URL_MISSING_MESSAGE}
            </em>
          )}
          {record.portalToken ? (
            <code>
              {record.portalToken.slice(
                0,
                10
              )}
              ...
            </code>
          ) : (
            <em>
              No token
            </em>
          )}
        </div>


        <div className="portal-record-actions">
          <button
            className="portal-assign-task-button"
            type="button"
            data-tutorial-target="portal-assign-tasks"
            onClick={() =>
              setOpenManager(
                (current) =>
                  current ===
                  "tasks"
                    ? ""
                    : "tasks"
              )
            }
          >
            <FaTasks />

            {openManager ===
            "tasks"
              ? "Hide Tasks"
              : "Assign Tasks"}

            {openManager ===
            "tasks"
              ? (
                <FaChevronUp />
              )
              : (
                <FaChevronDown />
              )}
          </button>

          <button
            className="portal-assign-document-button"
            type="button"
            data-tutorial-target="portal-assign-documents"
            onClick={() =>
              setOpenManager(
                (current) =>
                  current ===
                  "documents"
                    ? ""
                    : "documents"
              )
            }
          >
            <FaFileAlt />

            {openManager ===
            "documents"
              ? "Hide Documents"
              : "Assign Documents"}

            {openManager ===
            "documents"
              ? (
                <FaChevronUp />
              )
              : (
                <FaChevronDown />
              )}
          </button>

          <button
            className="portal-assign-document-button"
            type="button"
            data-tutorial-target="portal-emails"
            aria-expanded={openManager === "emails"}
            onClick={() =>
              setOpenManager(
                (current) =>
                  current === "emails"
                    ? ""
                    : "emails"
              )
            }
          >
            <FaEnvelope />

            {openManager === "emails"
              ? "Hide Emails"
              : "Emails"}

            {openManager === "emails"
              ? <FaChevronUp />
              : <FaChevronDown />}
          </button>

          <button
            className="secondary-dashboard-button"
            type="button"
            data-tutorial-target="portal-open-booking"
            data-tutorial-guard={record.isDemo ? "" : undefined}
            onClick={() =>
              onOpenBooking(
                record.id
              )
            }
          >
            Open Booking
          </button>

          <button
            className="secondary-dashboard-button"
            type="button"
            data-tutorial-target="portal-copy-link"
            data-tutorial-guard
            onClick={() =>
              onCopyPortalLink(
                record
              )
            }
          >
            <FaCopy />

            {copiedBookingId ===
            record.id
              ? "Copied"
              : "Copy Link"}
          </button>

          <a
            className={`primary-dashboard-button ${
              !portalUrl
                ? "disabled"
                : ""
            }`}
            href={
              portalUrl ||
              undefined
            }
            target="_blank"
            rel="noreferrer"
            aria-disabled={
              !portalUrl
            }
            data-tutorial-target="portal-open-portal"
            data-tutorial-guard
          >
            <FaExternalLinkAlt />
            Open Portal
          </a>
        </div>
      </aside>


      {openManager ===
        "tasks" && (
        <PortalTaskAssignmentPanel
          record={
            record
          }
          isAssigning={
            isAssigning
          }
          onAssignTasks={
            onAssignTasks
          }
          onClose={() =>
            setOpenManager(
              ""
            )
          }
        />
      )}


      {openManager ===
        "documents" && (
        <PortalDocumentAssignmentPanel
          record={
            record
          }
          isAssigning={
            isAssigningDocuments
          }
          isUploadingCustomDocument={
            isUploadingCustomDocument
          }
          onAssignDocuments={
            onAssignDocuments
          }
                    onUploadCustomDocument={
            onUploadCustomDocument
          }
          onRemoveDocument={
            onRemoveDocument
          }
          onClose={() =>
            setOpenManager(
              ""
            )
          }
        />
      )}


      {openManager === "emails" && (
        <PortalEmailPanel
          record={record}
          emailAdmin={emailAdmin}
          api={emailApi}
          onClose={() => setOpenManager("")}
        />
      )}
    </article>
  );
}
