import { useState } from "react";
import { FaExternalLinkAlt, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { portalItemHasGuestSubmission } from "../../utils/portalRules";
import {
  openPortalSignedCopy,
  formatPortalUploadSize,
  openPortalChecklistUpload,
} from "../../services/portalAdminData";

const PORTAL_TEXT_RESPONSE_ITEM_IDS = new Set([
  "food-allergy-information",
  "guest-count",
]);

/* =========================================================
   CHECKLIST PREVIEW
========================================================= */

const CORRECT_TARGETS = {
  needsReview: "portal-correct portal-correct-needsReview",
  completed: "portal-correct portal-correct-completed",
};

function PortalSignDocumentChoice({ item, signing, onCorrectItem }) {
  const [documentId, setDocumentId] = useState(item.signDocumentId || "");
  const choices = signing.documents;
  const current = item.signDocumentId || "";
  const linkedMissing = current && !choices.some((document) => document.id === current);

  return (
    <div className="portal-sign-choice">
      <label>
        <span>Sign online with</span>
        <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
          <option value="">Off (paper upload only)</option>
          {linkedMissing && <option value={current}>Document no longer shared</option>}
          {choices.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title} ({document.fileName})
            </option>
          ))}
        </select>
      </label>
      {choices.length === 0 && (
        <small>Upload the PDF under Assign Documents (custom upload) first. Only PDFs can be signed online.</small>
      )}
      <small role="status">{!signing.settings
        ? "Signing settings could not be read. You can prepare this task, but guest availability is unknown. Reload; if this persists, ask an administrator to check active staff access and the signing settings row."
        : !signing.isOn
          ? "Online signing is off for this booking. You can save a PDF choice now; guests still use paper upload."
          : !signing.settings.agreementApproved
            ? "This booking is eligible for a signing test. Agreement wording is not approved for real guest use."
            : "Online signing is available for this booking when the task is open."}</small>
      <small>Paper upload stays available either way. Changing this never affects copies already signed.</small>
      <button
        className="secondary-dashboard-button"
        type="button"
        disabled={documentId === current}
        onClick={() => onCorrectItem(item, "signDocument", { documentId })}
      >
        Save signing choice
      </button>
    </div>
  );
}

function PortalItemCorrections({ item, onCorrectItem, signing }) {
  const [dueDate, setDueDate] = useState(item.dueDate || "");
  const [note, setNote] = useState("");

  return (
    <details className="portal-item-corrections">
      <summary data-tutorial-target={CORRECT_TARGETS[item.status] || "portal-correct"}>Correct…</summary>

      <div className="portal-item-corrections-body">
        {item.guestAction === "upload_file" && (
          signing?.available
            ? <PortalSignDocumentChoice item={item} signing={signing} onCorrectItem={onCorrectItem} />
            : <p role="status">Sign online with: unavailable because signing fields could not be loaded. Reload this page. If this persists, ask an administrator to check the signing migration, database API schema cache and staff read permissions.</p>
        )}

        <label>
          <span>Due date</span>
          <input
            type="date"
            value={dueDate}
            data-tutorial-target="portal-due-input"
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <button
          className="secondary-dashboard-button"
          type="button"
          disabled={dueDate === (item.dueDate || "")}
          data-tutorial-target="portal-save-due"
          data-tutorial-guard
          onClick={() => onCorrectItem(item, "dueDate", { dueDate })}
        >
          Save due date
        </button>

        {item.status === "needsReview" && (
          <>
            <label>
              <span>Note to the guest (optional)</span>
              <textarea
                rows={2}
                value={note}
                data-tutorial-target="portal-note"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <button
              className="secondary-dashboard-button"
              type="button"
              data-tutorial-target="portal-send-back"
              data-tutorial-guard
              onClick={() => onCorrectItem(item, "requestChanges", { note })}
            >
              Send back for changes
            </button>
          </>
        )}

        {item.status === "completed" && (
          <button
            className="secondary-dashboard-button"
            type="button"
            data-tutorial-target="portal-reopen"
            data-tutorial-guard
            onClick={() => onCorrectItem(item, "reopen")}
          >
            Reopen task
          </button>
        )}

        <button
          className="portal-item-remove-button"
          type="button"
          data-tutorial-target="portal-remove-task"
          data-tutorial-guard
          onClick={() => onCorrectItem(item, "remove")}
        >
          {portalItemHasGuestSubmission(item)
            ? "Remove task (keeps the guest's file)"
            : "Remove task"}
        </button>
      </div>
    </details>
  );
}

function formatSignedAtLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value || "")
    : date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function PortalSignatureDetails({ signatures }) {
  const [latest, ...earlier] = signatures;

  return (
    <div className="portal-signature-details">
      <dl>
        <div><dt>Signed by</dt><dd>{latest.signerName}</dd></div>
        {latest.signerTitle && <div><dt>Title or role</dt><dd>{latest.signerTitle}</dd></div>}
        {latest.organizationName && (
          <div>
            <dt>{latest.signsForOrganization ? "Signing on behalf of" : "Organization"}</dt>
            <dd>{latest.organizationName}</dd>
          </div>
        )}
        <div><dt>Signature</dt><dd>{latest.signatureType === "drawn" ? "Drawn" : "Typed"}</dd></div>
        <div><dt>Signed</dt><dd>{formatSignedAtLabel(latest.signedAt)}</dd></div>
        <div><dt>Document</dt><dd>{latest.documentTitle} ({latest.originalPageCount} pages + signature page)</dd></div>
        <div><dt>Wording</dt><dd>“{latest.agreementText}”{latest.authorityText ? ` “${latest.authorityText}”` : ""} <small>({latest.agreementVersion})</small></dd></div>
        <div><dt>Original fingerprint</dt><dd><code>{latest.originalSha256}</code></dd></div>
        <div><dt>Signed copy fingerprint</dt><dd><code>{latest.signedSha256}</code></dd></div>
      </dl>
      <p className="portal-signature-note">
        Details are as the signer entered them. The portal link is shared within the group, so the signer&apos;s identity is not verified. Review them as you would a paper copy.
      </p>
      {earlier.length > 0 && (
        <div className="portal-signature-earlier">
          <strong>Earlier signed copies (kept)</strong>
          {earlier.map((signature) => (
            <div key={signature.id}>
              <span>
                {signature.documentTitle} · {signature.signerName} · {formatSignedAtLabel(signature.signedAt)}
              </span>
              <button className="portal-checklist-file-button" type="button" onClick={() => openPortalSignedCopy(signature)}>
                <FaExternalLinkAlt />
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalChecklistPreview({
  items,
  isDemo,
  confirmingItemId,
  onConfirmItem,
  onCorrectItem,
  signing = null,
  orphanSignatures = [],
}) {
  const [signatureItemId, setSignatureItemId] = useState("");
  const [
    isExpanded,
    setIsExpanded,
  ] =
    useState(false);

  const [
    expandedItemId,
    setExpandedItemId,
  ] =
    useState("");


  // A list short enough to show in full is never left "expanded".
  const [shownItemCount, setShownItemCount] =
    useState(items.length);

  if (shownItemCount !== items.length) {
    setShownItemCount(items.length);

    if (items.length <= 5) {
      setIsExpanded(false);
    }
  }


  // Signed copies whose task was later removed are still listed for staff.
  const orphanList = orphanSignatures.length > 0 && (
    <div className="portal-signature-orphans">
      <strong>Signed online (task since removed, record kept)</strong>
      {orphanSignatures.map((signature) => (
        <div key={signature.id}>
          <span>
            {signature.itemTitle}: {signature.documentTitle} · {signature.signerName} · {formatSignedAtLabel(signature.signedAt)}
          </span>
          <button className="portal-checklist-file-button" type="button" onClick={() => openPortalSignedCopy(signature)}>
            <FaExternalLinkAlt />
            Open
          </button>
        </div>
      ))}
    </div>
  );

  if (
    items.length === 0
  ) {
    return (
      <>
        <div className="portal-checklist-preview-empty" data-tutorial-target="portal-checklist-empty">
          No portal checklist items yet.
        </div>
        {orphanList}
      </>
    );
  }


  const visibleItems =
    isExpanded
      ? items
      : items.slice(
          0,
          5
        );

  const hiddenItemCount =
    Math.max(
      items.length - 5,
      0
    );


  return (
    <div className="portal-checklist-preview" data-tutorial-target="portal-checklist">
      {visibleItems.map(
        (item) => {
          const hasResponse =
            String(
              item.responseText || ""
            ).trim().length > 0;

          const isItemExpanded =
            expandedItemId ===
            item.id;

          const requiresTextResponse =
            PORTAL_TEXT_RESPONSE_ITEM_IDS.has(
              item.itemId
            );

          const requiresUpload =
            item.guestAction ===
            "upload_file";

          const hasUpload =
            Boolean(
              item.uploadedFileName &&
              item.uploadedFilePath
            );

          const uploadSizeLabel =
            formatPortalUploadSize(
              item.uploadedFileSize
            );

          const signatures = item.signatures || [];
          const latestSignature = signatures[0];
          const isSignatureOpen = signatureItemId === item.id;
          const signDocument = item.signDocumentId
            ? signing?.allDocuments?.find((document) => document.id === item.signDocumentId)
            : null;

          const canConfirm =
            item.status ===
              "needsReview" &&
            (
              !requiresTextResponse ||
              hasResponse
            ) &&
            (
              !requiresUpload ||
              hasUpload ||
              Boolean(latestSignature)
            );

          return (
            <div
              className={`portal-checklist-preview-entry portal-item-${item.status}`}
              data-tutorial-target={item.status === "needsReview" ? "portal-item-review" : undefined}
              key={
                item.id
              }
            >
              <div className={`portal-checklist-preview-row portal-item-${item.status}`}>
                <span></span>

                <div className="portal-checklist-preview-copy">
                  <strong>
                    {
                      item.title
                    }
                  </strong>

                  <small>
                    {item.status ===
                    "needsReview"
                      ? "Needs staff review"
                      : item.status ===
                          "waitingOnGuest"
                        ? "Waiting on guest"
                        : item.status ===
                            "completed"
                          ? "Complete"
                          : "Not started"}

                    {item.dueDate
                      ? ` · Due ${item.dueDate}`
                      : ""}
                  </small>

                  {item.uploadedFileName && (
                    <span className="portal-checklist-upload-name">
                      {item.signDocumentId || latestSignature ? "Paper copy uploaded: " : ""}
                      {item.uploadedFileName}

                      {uploadSizeLabel
                        ? ` · ${uploadSizeLabel}`
                        : ""}
                    </span>
                  )}

                  {latestSignature && (
                    <span className="portal-checklist-signed-name">
                      Signed online by {latestSignature.signerName} · {formatSignedAtLabel(latestSignature.signedAt)}
                      {signatures.length > 1 ? ` · ${signatures.length - 1} earlier signed cop${signatures.length === 2 ? "y" : "ies"} kept` : ""}
                    </span>
                  )}

                  {signing?.available && item.signDocumentId && (
                    <span className="portal-checklist-sign-chip">
                      Sign online: {signDocument?.title || "document no longer shared"}
                      {!signing.isOn ? " · off for guests" : ""}
                    </span>
                  )}
                </div>

                <div className="portal-checklist-preview-actions">
                  {latestSignature && (
                    <button
                      className="portal-checklist-file-button"
                      type="button"
                      onClick={() => openPortalSignedCopy(latestSignature)}
                    >
                      <FaExternalLinkAlt />
                      Open Signed PDF
                    </button>
                  )}
                  {latestSignature && (
                    <button
                      className="portal-checklist-info-button"
                      type="button"
                      aria-expanded={isSignatureOpen}
                      onClick={() => setSignatureItemId((current) => (current === item.id ? "" : item.id))}
                    >
                      {isSignatureOpen ? "Hide Signing Details" : "Signing Details"}
                    </button>
                  )}
                  {hasUpload && (
                    <button
                      className="portal-checklist-file-button"
                      type="button"
                      data-tutorial-target={item.status === "needsReview" ? "portal-item-inspect" : undefined}
                      data-tutorial-guard={isDemo ? "" : undefined}
                      onClick={() =>
                        openPortalChecklistUpload(
                          item
                        )
                      }
                    >
                      <FaExternalLinkAlt />
                      Open Upload
                    </button>
                  )}
                  {hasResponse && (
                    <button
                      className="portal-checklist-info-button"
                      type="button"
                      data-tutorial-target={item.status === "needsReview" ? "portal-item-inspect" : undefined}
                      aria-expanded={
                        isItemExpanded
                      }
                      onClick={() =>
                        setExpandedItemId(
                          (current) =>
                            current ===
                            item.id
                              ? ""
                              : item.id
                        )
                      }
                    >
                      {isItemExpanded
                        ? "Hide Info"
                        : "View Info"}
                    </button>
                  )}

                  {canConfirm && (
                    <button
                      className="portal-checklist-confirm-button"
                      type="button"
                      data-tutorial-target="portal-confirm"
                      data-tutorial-guard
                      disabled={
                        confirmingItemId ===
                        item.id
                      }
                      onClick={() =>
                        onConfirmItem(
                          item
                        )
                      }
                    >
                      {confirmingItemId ===
                      item.id
                        ? "Confirming..."
                        : "Confirm"}
                    </button>
                  )}

                  {requiresTextResponse &&
                    item.status ===
                      "needsReview" &&
                    !hasResponse && (
                    <span className="portal-checklist-missing-label">
                      Missing info
                    </span>
                  )}

                  {requiresUpload &&
                    item.status ===
                      "needsReview" &&
                    !hasUpload &&
                    !latestSignature && (
                    <span className="portal-checklist-missing-label">
                      Missing upload
                    </span>
                  )}

                                    {item.status ===
                    "completed" && (
                    <span className="portal-checklist-confirmed-label">
                      Confirmed
                    </span>
                  )}
                  {onCorrectItem && (
                    <PortalItemCorrections
                      item={item}
                      onCorrectItem={onCorrectItem}
                      signing={signing}
                    />
                  )}
                </div>
              </div>
              {latestSignature && isSignatureOpen && (
                <PortalSignatureDetails signatures={signatures} />
              )}
              {item.staffReviewNote &&
                item.status === "waitingOnGuest" && (
                <p className="portal-item-review-note" data-tutorial-target="portal-item-sent-back">
                  Sent back: {item.staffReviewNote}
                </p>
              )}

              {item.demoPreview && (
                <p className="portal-demo-preview">{item.demoPreview}</p>
              )}

              {hasResponse &&
                isItemExpanded && (
                <div className="portal-checklist-response-review">
                  <div>
                    <small>
                      Guest-provided information
                    </small>

                    <strong>
                      {item.itemId ===
                      "guest-count"
                        ? "Final guest counts"
                        : item.itemId ===
                            "food-allergy-information"
                          ? "Food allergy information"
                          : "Checklist response"}
                    </strong>
                  </div>

                  <p>
                    {
                      item.responseText
                    }
                  </p>

                  {canConfirm && (
                    <span>
                      Review the information above, then click Confirm to mark this checklist item complete.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        }
      )}

      {orphanList}

      {items.length >
        5 && (
        <button
          className="portal-checklist-preview-toggle"
          type="button"
          data-tutorial-target="portal-checklist-more"
          aria-expanded={
            isExpanded
          }
          onClick={() =>
            setIsExpanded(
              (current) =>
                !current
            )
          }
        >
          <span>
            {isExpanded
              ? "Show less"
              : `+${hiddenItemCount} more item${
                  hiddenItemCount ===
                  1
                    ? ""
                    : "s"
                }`}
          </span>

          {isExpanded
            ? (
              <FaChevronUp />
            )
            : (
              <FaChevronDown />
            )}
        </button>
      )}
    </div>
  );
}
