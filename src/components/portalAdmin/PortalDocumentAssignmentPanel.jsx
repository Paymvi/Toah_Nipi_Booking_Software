import { useRef, useState } from "react";
import { FaFileAlt, FaExclamationTriangle, FaCheckCircle, FaPlus, FaUpload } from "react-icons/fa";
import { getAlreadyAssignedDocumentIds } from "../../utils/portalRules";
import {
  validatePortalStaffDocument,
  getAssignmentRequestIds,
  PORTAL_STAFF_DOCUMENT_ACCEPT,
  formatPortalUploadSize,
} from "../../services/portalAdminData";

/* =========================================================
   PORTAL DOCUMENT CATALOG
   Staff can only assign documents from this list.
========================================================= */

const PORTAL_DOCUMENT_OPTIONS = [
  {
    id: "intervarsity-cleanup-procedures",
    title: "InterVarsity Guest Clean-Up Procedures",
    fileName: "2026 InterVarsity Guest Clean-Up Procedures-rev.8.26.pdf",
    documentType: "Policy Document",
    audience: "intervarsity",
  },
  {
    id: "guest-house-policy-information",
    title: "Guest House Policy Information",
    fileName: "2026 Toah Nipi CRC Guest House Policy Information-rev.8.26.pdf",
    documentType: "Policy Document",
    audience: "general",
  },
  {
    id: "guest-policy-information",
    title: "Guest Policy Information",
    fileName: "2026 Toah Nipi CRC Guest Policy Information doc-rev.8.26.pdf",
    documentType: "Policy Document",
    audience: "general",
  },
  {
    id: "intervarsity-guest-house-policy-information",
    title: "InterVarsity Guest House Policy Information",
    fileName:
      "2026 Toah Nipi CRC InterVarsity Guest House Policy Information-rev.8.26.pdf",
    documentType: "Policy Document",
    audience: "intervarsity",
  },
  {
    id: "intervarsity-policy-information-form",
    title: "InterVarsity Policy Information Form",
    fileName:
      "2026 Toah Nipi CRC InterVarsity Policy Information Form-rev. 8.26.docx",
    documentType: "Policy Form",
    audience: "intervarsity",
  },
  {
    id: "sample-coi-form",
    title: "Sample Certificate of Insurance Form",
    fileName: "Sample COI Form.pdf",
    documentType: "Sample Form",
    audience: "general",
  },
  {
    id: "welcome-reservation-information",
    title: "Welcome & Reservation Information",
    fileName: "Welcome & Reservation Information.pdf",
    documentType: "Information Sheet",
    audience: "general",
  },
  {
    id: "guest-cleanup-procedures-general",
    title: "Guest Clean-Up Procedures",
    fileName: "2026 TNCRC Guest Clean-Up Procedures.pdf",
    documentType: "Policy Document",
    audience: "general",
  },
  {
    id: "intervarsity-welcome-reservation-information",
    title: "Welcome & Reservation Information for IV Groups",
    fileName: "Welcome & Reservation Information for IV Groups.docx.pdf",
    documentType: "Information Sheet",
    audience: "intervarsity",
  },
    {
    id: "water-safety-policies",
    title: "Water Safety Policies",
    fileName: "2026 Toah Nipi CRC Water Safety Policies.pdf",
    documentType: "Policy Document",
    audience: "general",
  },

  {
    id: "hiking-trails",
    title: "Hiking Trails",
    fileName: "Toah Nipi Hiking Trails Updated 4-2026.pdf",
    documentType: "Information Sheet",
    audience: "general",
  },

  {
    id: "campus-map",
    title: "Toah Nipi Campus Map",
    fileName: "TN Campus Map.pdf",
    documentType: "Map",
    audience: "general",
  },

  {
    id: "intervarsity-liability-insurance-details",
    title: "InterVarsity Commercial General Liability Insurance Details",
    fileName: "2026 IV Detail of Comm Gen Liability Insurance from Terms and Conditions.pdf",
    documentType: "Insurance Information",
    audience: "intervarsity",
  },
  {
    id: "liability-insurance-details",
    title: "Commercial General Liability Insurance Details",
    fileName: "2026 Detail of Comm Gen Liability Insurance from Terms and Conditions.pdf",
    documentType: "Insurance Information",
    audience: "general",
  },
];

/* =========================================================
   DOCUMENT ASSIGNMENT
========================================================= */

/* A standard document is assigned when a staff-side row carries
   its catalog file name. Guest uploads and custom-document titles
   are not catalog assignments. */
function createDocumentAssignmentDraft(
  record
) {
  const alreadyAssignedIds =
    getAlreadyAssignedDocumentIds(
      record.documents,
      PORTAL_DOCUMENT_OPTIONS
    );

  return Object.fromEntries(
    PORTAL_DOCUMENT_OPTIONS.map(
      (document) => [
        document.id,
        {
          selected:
            false,
          alreadyAssigned:
            alreadyAssignedIds.has(
              document.id
            ),
        },
      ]
    )
  );
}

export default function PortalDocumentAssignmentPanel({
  record,
  isAssigning,
  isUploadingCustomDocument,
  onAssignDocuments,
  onUploadCustomDocument,
  onRemoveDocument,
  onClose,
}) {
  const [
    documentDrafts,
    setDocumentDrafts,
  ] =
    useState(
      () =>
        createDocumentAssignmentDraft(
          record
        )
    );

  const [
    assignmentError,
    setAssignmentError,
  ] =
    useState("");

  const [
    customTitle,
    setCustomTitle,
  ] =
    useState("");

  const [
    customDocumentType,
    setCustomDocumentType,
  ] =
    useState(
      "Staff Document"
    );

  const [
    customNote,
    setCustomNote,
  ] =
    useState("");

  const [
    customFile,
    setCustomFile,
  ] =
    useState(null);

  const [
    customUploadError,
    setCustomUploadError,
  ] =
    useState("");

  const [
    customUploadSuccess,
    setCustomUploadSuccess,
  ] =
    useState("");

  const [
    fileInputKey,
    setFileInputKey,
  ] =
    useState(0);


  // Another booking, or its documents were reloaded: start again from the saved documents.
  const [draftSource, setDraftSource] =
    useState({ id: record.id, documents: record.documents });

  if (
    draftSource.id !== record.id ||
    draftSource.documents !== record.documents
  ) {
    setDraftSource({ id: record.id, documents: record.documents });
    setDocumentDrafts(
      createDocumentAssignmentDraft(
        record
      )
    );

    setAssignmentError(
      ""
    );
  }


    const selectedCount =
    Object.values(
      documentDrafts
    ).filter(
      (draft) =>
        draft.selected
    ).length;

  const availableCount =
    PORTAL_DOCUMENT_OPTIONS.length;

  const pendingDocumentRequestRef =
    useRef(null);



  const documentGroups = [
    {
      id: "general",
      label: "General Documents",
      helper:
        "Standard documents that may be used for any retreat group.",
      documents:
        PORTAL_DOCUMENT_OPTIONS.filter(
          (document) =>
            document.audience ===
            "general"
        ),
    },
    {
      id: "intervarsity",
      label: "InterVarsity Documents",
      helper:
        "Documents specifically intended for InterVarsity groups.",
      documents:
        PORTAL_DOCUMENT_OPTIONS.filter(
          (document) =>
            document.audience ===
            "intervarsity"
        ),
    },
  ];


  function toggleDocument(
    documentId,
    selected
  ) {
    setDocumentDrafts(
      (currentDrafts) => ({
        ...currentDrafts,

        [documentId]: {
          ...currentDrafts[
            documentId
          ],

          selected,
        },
      })
    );
  }


  function handleCustomFileChange(
    event
  ) {
    const file =
      event.target.files?.[0] ||
      null;

    setCustomFile(
      file
    );

    setCustomUploadError(
      ""
    );

    setCustomUploadSuccess(
      ""
    );

    if (
      file &&
      !customTitle.trim()
    ) {
      const suggestedTitle =
        String(file.name || "")
          .replace(
            /\.[^.]+$/,
            ""
          )
          .replace(
            /[-_]+/g,
            " "
          )
          .trim();

      setCustomTitle(
        suggestedTitle ||
          file.name
      );
    }
  }


  async function handleUploadCustom() {
    const cleanedTitle =
      customTitle
        .trim();

    const cleanedDocumentType =
      customDocumentType
        .trim() ||
      "Staff Document";

    const cleanedNote =
      customNote
        .trim();

    if (!cleanedTitle) {
      setCustomUploadError(
        "Enter a title for the document."
      );

      return;
    }

    const validationError =
      validatePortalStaffDocument(
        customFile
      );

    if (validationError) {
      setCustomUploadError(
        validationError
      );

      return;
    }

    try {
      setCustomUploadError(
        ""
      );

      setCustomUploadSuccess(
        ""
      );

      await onUploadCustomDocument(
        record,
        {
          title:
            cleanedTitle,
          documentType:
            cleanedDocumentType,
          note:
            cleanedNote,
          file:
            customFile,
        }
      );

      setCustomTitle(
        ""
      );

      setCustomDocumentType(
        "Staff Document"
      );

      setCustomNote(
        ""
      );

      setCustomFile(
        null
      );

      setFileInputKey(
        (current) =>
          current + 1
      );

      setCustomUploadSuccess(
        "Custom document added to this group’s portal."
      );
    } catch (error) {
      console.error(
        "Could not upload custom portal document:",
        error
      );

      setCustomUploadError(
        error?.message ||
          "Could not upload this document."
      );
    }
  }


  async function handleAssignSelected() {
    const selectedDocuments =
      PORTAL_DOCUMENT_OPTIONS.filter(
        (document) => {
          const draft =
            documentDrafts[
              document.id
            ];

                    return Boolean(
            draft?.selected
          );
        }
      );

    if (
      selectedDocuments.length === 0
    ) {
      setAssignmentError(
        "Choose at least one document to assign."
      );

      return;
    }

    const repeatTitles = selectedDocuments
      .filter((document) => documentDrafts[document.id]?.alreadyAssigned)
      .map((document) => document.title);

    if (
      repeatTitles.length > 0 &&
      !window.confirm(
        `Already shared with this group: ${repeatTitles.join(", ")}.\n\nShare another copy?`
      )
    ) {
      return;
    }

    const requestIds = getAssignmentRequestIds(
      pendingDocumentRequestRef,
      selectedDocuments.map((document) => document.id).join("|"),
      selectedDocuments.map((document) => document.id)
    );

    try {
      setAssignmentError(
        ""
      );

      await onAssignDocuments(
        record,
        selectedDocuments.map((document) => ({
          ...document,
          requestId: requestIds[document.id],
        }))
      );
      pendingDocumentRequestRef.current = null;

            // Mark what was just assigned; a repeat now needs the warning above.
      setDocumentDrafts(
        (currentDrafts) => {
          const nextDrafts = {
            ...currentDrafts,
          };

          selectedDocuments.forEach(
            (document) => {
              nextDrafts[
                document.id
              ] = {
                selected:
                  false,

                alreadyAssigned:
                  true,
              };
            }
          );

          return nextDrafts;
        }
      );
    } catch (error) {
      console.error(
        "Could not assign portal documents:",
        error
      );

      setAssignmentError(
        error?.message ||
          "Could not assign the selected documents."
      );
    }
  }


  return (
    <section
      className="portal-document-assignment-panel"
      data-tutorial-target="portal-doc-panel"
      data-tutorial-unsaved={
        selectedCount > 0 || customTitle.trim() || customNote.trim() || customFile
          ? "document choices in Portal Admin"
          : undefined
      }
    >
      <div className="portal-document-assignment-header">
        <div>
          <p>
            Document Assignment
          </p>

          <h4>
            Manage documents for{" "}
            {
              record.organizationName
            }
          </h4>

          <span>
            Assign a standard document
            or upload a custom file with
            an optional note for the
            group leader.
          </span>
        </div>

        <button
          className="portal-document-assignment-close"
          type="button"
          onClick={
            onClose
          }
        >
          Close
        </button>
      </div>


            {record.documents.length > 0 && (
        <section className="portal-assigned-documents">
          <h5>Shared with this group</h5>
          <ul>
            {record.documents.map((document) => (
              <li key={document.id}>
                <span>
                  <strong>{document.title}</strong>
                  <small>
                    {document.fileName}
                    {document.uploadedByGuest ? " · uploaded by the guest" : ""}
                  </small>
                </span>
                {!document.uploadedByGuest && (
                  <button
                  className="secondary-dashboard-button"
                  type="button"
                  data-tutorial-target="portal-doc-remove"
                  data-tutorial-guard
                  onClick={() => onRemoveDocument(record, document)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="portal-custom-document-upload" data-tutorial-target="portal-custom-upload">
        <div className="portal-custom-document-upload-heading">
          <span className="portal-custom-document-upload-icon">
            <FaUpload />
          </span>

          <div>
            <p>
              Custom Staff Document
            </p>

            <h5>
              Upload a file just for this group
            </h5>

            <span>
              The file will appear in the group leader&apos;s Documents tab. Add a note when you want to explain what the file is or what they should do with it.
            </span>
          </div>
        </div>


        <div className="portal-custom-document-fields">
          <label>
            <span>
              Document title
            </span>

            <input
              type="text"
              value={
                customTitle
              }
              placeholder="Example: Updated Retreat Schedule"
              disabled={
                isUploadingCustomDocument
              }
              onChange={(
                event
              ) =>
                setCustomTitle(
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>
              Document type
            </span>

            <input
              type="text"
              value={
                customDocumentType
              }
              placeholder="Staff Document"
              disabled={
                isUploadingCustomDocument
              }
              onChange={(
                event
              ) =>
                setCustomDocumentType(
                  event.target.value
                )
              }
            />
          </label>
        </div>


        <label className="portal-custom-document-file-field">
          <span>
            File
          </span>

          <input
            key={
            fileInputKey
          }
          data-tutorial-guard
          type="file"
            accept={
              PORTAL_STAFF_DOCUMENT_ACCEPT
            }
            disabled={
              isUploadingCustomDocument
            }
            onChange={
              handleCustomFileChange
            }
          />

          <small>
            PDF, Word, Excel, PNG, JPG, HEIC, or TXT · maximum 10 MB
          </small>
        </label>


        <label className="portal-custom-document-note-field">
          <span>
            Note for group leader
            <em>
              Optional
            </em>
          </span>

          <textarea
            value={
              customNote
            }
            placeholder="Example: Please review this updated schedule before your arrival."
            disabled={
              isUploadingCustomDocument
            }
            onChange={(
              event
            ) =>
              setCustomNote(
                event.target.value
              )
            }
          />
        </label>


        {customFile && (
          <div className="portal-custom-document-selected-file">
            <FaFileAlt />

            <div>
              <strong>
                {
                  customFile.name
                }
              </strong>

              <span>
                {
                  formatPortalUploadSize(
                    customFile.size
                  )
                }
              </span>
            </div>
          </div>
        )}


        {customUploadError && (
          <div className="portal-custom-document-message error">
            <FaExclamationTriangle />

            <span>
              {
                customUploadError
              }
            </span>
          </div>
        )}


        {customUploadSuccess && (
          <div className="portal-custom-document-message success">
            <FaCheckCircle />

            <span>
              {
                customUploadSuccess
              }
            </span>
          </div>
        )}


        <div className="portal-custom-document-upload-footer">
          <span>
            Stored privately and opened through a temporary signed link on the guest portal.
          </span>

          <button
            className="primary-dashboard-button"
            type="button"
            disabled={
              isUploadingCustomDocument
            }
            data-tutorial-guard
            onClick={
              handleUploadCustom
            }
          >
            <FaUpload />

            {isUploadingCustomDocument
              ? "Uploading..."
              : "Upload to Portal"}
          </button>
        </div>
      </section>


      <div className="portal-standard-document-divider">
        <span>
          Standard Documents
        </span>
      </div>


      {availableCount ===
      0 ? (
        <div className="portal-document-assignment-complete">
          <FaCheckCircle />

          <div>
            <strong>
              Every available standard document
              is already assigned
            </strong>

            <span>
              You can still upload additional custom documents above.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="portal-document-group-list" data-tutorial-target="portal-doc-standard">
            {documentGroups.map(
              (group) => (
                <section
                  className={`portal-document-group portal-document-group-${group.id}`}
                  key={
                    group.id
                  }
                >
                  <div className="portal-document-group-heading">
                    <div>
                      <p>
                        {
                          group.label
                        }
                      </p>

                      <span>
                        {
                          group.helper
                        }
                      </span>
                    </div>

                    <strong>
                      {
                        group.documents
                          .length
                      }{" "}
                      document
                      {group.documents
                        .length ===
                      1
                        ? ""
                        : "s"}
                    </strong>
                  </div>


                  <div className="portal-document-assignment-table">
                    <div className="portal-document-assignment-table-header">
                      <span>
                        Document
                      </span>

                      <span>
                        Type
                      </span>

                      <span>
                        File
                      </span>
                    </div>

                    {group.documents.map(
                      (document) => {
                        const draft =
                          documentDrafts[
                            document.id
                          ];

                                                const disabled =
                          false;
                        const alreadyAssigned =
                          draft
                            ?.alreadyAssigned;
                        const extension =
                          document.fileName
                            .split(".")
                            .pop()
                            ?.toUpperCase() ||
                          "FILE";

                        return (
                          <div
                            className={`portal-document-option-row ${
                              draft
                                ?.selected
                                ? "selected"
                                : ""
                                                        } ${
                              alreadyAssigned
                                ? "assigned"
                                : ""
                            }`}
                            key={
                              document.id
                            }
                          >
                            <label className="portal-document-option-main">
                              <input
                                type="checkbox"
                                checked={
                                  Boolean(
                                    draft
                                      ?.selected
                                  )
                                }
                                disabled={
                                  disabled ||
                                  isAssigning
                                }
                                onChange={(
                                  event
                                ) =>
                                  toggleDocument(
                                    document.id,
                                    event
                                      .target
                                      .checked
                                  )
                                }
                              />

                                                            <span className="portal-document-option-check">
                                {alreadyAssigned
                                  ? "✓"
                                  : ""}
                              </span>

                              <span className="portal-document-option-copy">
                                <strong>
                                  {
                                    document.title
                                  }
                                </strong>

                                <small>
                                  {
                                    document.fileName
                                  }
                                </small>

                                                                {alreadyAssigned && (
                                  <em>
                                    Already shared; selecting adds another copy
                                  </em>
                                )}
                              </span>
                            </label>

                            <div>
                              <span className="portal-document-type-pill">
                                {
                                  document.documentType
                                }
                              </span>
                            </div>

                            <div className="portal-document-file-meta">
                              <span className="portal-document-file-extension">
                                {
                                  extension
                                }
                              </span>

                              <span>
                                Standard document
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              )
            )}
          </div>


          {assignmentError && (
            <div className="portal-document-assignment-error">
              <FaExclamationTriangle />

              <span>
                {
                  assignmentError
                }
              </span>
            </div>
          )}


          <div className="portal-document-assignment-footer">
            <span data-tutorial-target="portal-doc-count">
              {selectedCount ===
              0
                ? "Select one or more standard documents."
                : `${selectedCount} document${
                    selectedCount ===
                    1
                      ? ""
                      : "s"
                  } selected`}
            </span>

            <button
              className="primary-dashboard-button"
              type="button"
              disabled={
                selectedCount ===
                  0 ||
                isAssigning
              }
              data-tutorial-target="portal-doc-assign"
              data-tutorial-guard
              onClick={
                handleAssignSelected
              }
            >
              <FaPlus />
              {isAssigning
                ? "Assigning..."
                : `Assign ${
                    selectedCount ||
                    ""
                  } Document${
                    selectedCount ===
                    1
                      ? ""
                      : "s"
                  }`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
