import { supabase } from "../lib/supabaseClient";
import { isHostRecord } from "../utils/bookingClassification";
import { getPortalProgress, sanitizePortalDocumentFileName } from "../utils/portalRules";
import { insertPortalRowsOnce } from "./portalCorrections";

export const PORTAL_UPLOAD_BUCKET = "portal-uploads";

const STAFF_PORTAL_DOCUMENT_FOLDER = "staff-documents";

const PORTAL_STAFF_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const PORTAL_STAFF_DOCUMENT_MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  txt: "text/plain",
};

export const PORTAL_STAFF_DOCUMENT_ACCEPT = Object.keys(
  PORTAL_STAFF_DOCUMENT_MIME_BY_EXTENSION
)
  .map((extension) => `.${extension}`)
  .join(",");

function getPortalDocumentExtension(fileName) {
  return String(fileName || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
}

export function getPortalStaffDocumentMimeType(file) {
  const extension =
    getPortalDocumentExtension(
      file?.name
    );

  const inferredMimeType =
    PORTAL_STAFF_DOCUMENT_MIME_BY_EXTENSION[
      extension
    ] || "";

  const browserMimeType =
    String(file?.type || "")
      .trim()
      .toLowerCase();

  if (
    browserMimeType &&
    Object.values(
      PORTAL_STAFF_DOCUMENT_MIME_BY_EXTENSION
    ).includes(
      browserMimeType
    )
  ) {
    return browserMimeType;
  }

  return inferredMimeType;
}

export function validatePortalStaffDocument(file) {
  if (!file) {
    return "Choose a file to upload.";
  }

  if (file.size <= 0) {
    return "That file is empty. Please choose a different file.";
  }

  if (
    file.size >
    PORTAL_STAFF_DOCUMENT_MAX_BYTES
  ) {
    return "That file is larger than 10 MB. Please choose a smaller file.";
  }

  if (
    !getPortalStaffDocumentMimeType(
      file
    )
  ) {
    return "Please upload a PDF, Word document, Excel file, PNG, JPG, HEIC, or TXT file.";
  }

  return "";
}

export function buildStaffPortalDocumentStoragePath(
  portalToken,
  documentId,
  fileName
) {
  const cleanedToken =
    String(portalToken || "")
      .trim();

  const cleanedDocumentId =
    String(documentId || "")
      .trim();

  if (
    !cleanedToken ||
    !cleanedDocumentId ||
    cleanedToken.includes("/") ||
    cleanedDocumentId.includes("/")
  ) {
    return "";
  }

  return `${cleanedToken}/${STAFF_PORTAL_DOCUMENT_FOLDER}/${cleanedDocumentId}/${sanitizePortalDocumentFileName(
    fileName
  )}`;
}

export function formatPortalUploadSize(bytes) {
  const numericBytes = Number(bytes || 0);

  if (!numericBytes) {
    return "";
  }

  if (numericBytes < 1024) {
    return `${numericBytes} B`;
  }

  if (numericBytes < 1024 * 1024) {
    return `${Math.round(numericBytes / 1024)} KB`;
  }

  return `${(numericBytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PORTAL_SIGNED_BUCKET = "portal-signed";

// Staff open signed copies through their read-only storage access.
export async function openPortalSignedCopy(signature) {
  try {
    const { data, error } = await supabase.storage
      .from(PORTAL_SIGNED_BUCKET)
      .createSignedUrl(signature.signedPath, 10 * 60);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Supabase did not return a file URL.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Could not open the signed copy:", error);
    alert("Could not open this signed copy. Please try again.");
  }
}

// null when the signing migration has not been run (or settings cannot be read).
export async function fetchPortalSigningSettings() {
  const { data, error } = await supabase
    .from("portal_signing_settings")
    .select("enabled, test_booking_ids, agreement_approved")
    .maybeSingle();
  if (error || !data) return null;
  return {
    enabled: Boolean(data.enabled),
    testBookingIds: (data.test_booking_ids || []).map(String),
    agreementApproved: Boolean(data.agreement_approved),
  };
}

export async function openPortalChecklistUpload(item) {
  if (!item?.uploadedFilePath) {
    return;
  }

  try {
    const {
      data,
      error,
    } = await supabase.storage
      .from(PORTAL_UPLOAD_BUCKET)
      .createSignedUrl(
        item.uploadedFilePath,
        10 * 60
      );

    if (error) {
      throw error;
    }

    if (!data?.signedUrl) {
      throw new Error("Supabase did not return a file URL.");
    }

    window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer"
    );
  } catch (error) {
    console.error(
      "Could not open guest portal upload:",
      error
    );

    alert(
      "Could not open this uploaded file. Please try again."
    );
  }
}

/* =========================================================
   NORMALIZATION
========================================================= */

function cleanPortalText(value, fallback = "") {
  const text = String(value || "").trim();

  return text || fallback;
}

function normalizePortalChecklistItem(item) {
  return {
    id: item.id,
    itemId: item.item_id || "",
    title: item.title || "Untitled item",
    status: item.status || "notStarted",
    required: Boolean(item.required),
    dueDate: item.due_date || "",
    guestAction: item.guest_action || "none",
    uploadedFileName: item.uploaded_file_name || "",
    uploadedFilePath: item.uploaded_file_path || "",
    uploadedFileMime: item.uploaded_file_mime || "",
    uploadedFileSize: item.uploaded_file_size || 0,
        responseText: item.response_text || "",
    staffReviewNote: item.staff_review_note || "",
    lastChangedAt: item.last_changed_at || "",
    sortOrder: item.sort_order || 0,
    signDocumentId: item.sign_document_id || "",
    // Filled in by normalizePortalOverviewRecord, newest first.
    signatures: [],
  };
}

// Online signatures: read-only records written by the portal-sign function.
function normalizePortalSignature(row) {
  return {
    id: row.id,
    checklistItemId: row.checklist_item_id,
    itemTitle: row.item_title || "",
    documentTitle: row.document_title || "Document",
    signerName: row.signer_name || "",
    signerTitle: row.signer_title || "",
    organizationName: row.organization_name || "",
    signsForOrganization: Boolean(row.signs_for_organization),
    signatureType: row.signature_type || "typed",
    signedAt: row.signed_at || "",
    agreementVersion: row.agreement_version || "",
    agreementText: row.agreement_text || "",
    authorityText: row.authority_text || "",
    originalSha256: row.original_sha256 || "",
    signedSha256: row.signed_sha256 || "",
    originalPageCount: row.original_page_count || 0,
    signedPath: row.signed_path || "",
    originalPath: row.original_path || "",
  };
}

function normalizePortalDocument(document) {
  return {
    id: document.id,
    title: document.title || "Untitled document",
    documentType: document.document_type || "Document",
    fileName: document.file_name || "",
    storagePath: document.storage_path || "",
    note: document.note || "",
    status: document.status || "ready",
    uploadedByGuest: Boolean(document.uploaded_by_guest),
    lastChangedAt: document.last_changed_at || document.created_at || "",
  };
}

/* =========================================================
   PORTAL ELIGIBILITY
   Only groups that have become bookings belong in the
   portal workflow. Uses the same stage signals as the
   Inquiry Pipeline: cancelled and waitlisted records are
   out; a contract sent/returned or a Confirmed/Booked
   status is in. Staff Booking records are real retreats
   even while Create Booking still saves them as "Inquiry".
========================================================= */

function hasPortalEligibilityValue(value) {
  const text = String(value ?? "").trim();

  return (
    text !== "" &&
    !/^(?:n\/?a|none|unknown|tbd|\?|[-–—])$/i.test(text)
  );
}

function isPortalEligibleBookingRow(row) {
  // Hosting is never a guest portal record. Its earlier portal tasks,
  // files and emails stay readable on the Hosting detail page.
  if (
    isHostRecord({
      organizationName: row.organization_name,
      retreatType: row.retreat_type,
    })
  ) {
    return false;
  }

  // Staff already set this group up in the portal. Portal Admin is the
  // only screen that shows checklists, documents, and guest uploads, so
  // keep it visible even if the booking was later cancelled or waitlisted.
  if (
    (Array.isArray(row.portal_checklist_items) &&
      row.portal_checklist_items.length > 0) ||
    (Array.isArray(row.portal_documents) &&
      row.portal_documents.length > 0)
  ) {
    return true;
  }

  const status =
    String(row.status || "")
      .trim()
      .toLowerCase();

  const waitlist =
    String(row.waitlist || "")
      .trim()
      .toLowerCase();

  const sourceType =
    String(row.source_type || "")
      .trim()
      .toLowerCase();

  const detectedImportType =
    String(row.detected_import_type || "")
      .trim()
      .toLowerCase();

  const details =
    row.rental_form_details &&
    typeof row.rental_form_details === "object" &&
    !Array.isArray(row.rental_form_details)
      ? row.rental_form_details
      : {};

  if (
    status.includes("cancel") ||
    status.includes("archive") ||
    status.includes("wait") ||
    waitlist === "yes" ||
    hasPortalEligibilityValue(row.date_of_cancellation) ||
    sourceType === "archive" ||
    detectedImportType === "archive"
  ) {
    return false;
  }

  if (
    sourceType === "staff booking" ||
    detectedImportType === "staff booking"
  ) {
    return true;
  }

  return (
    /\bconfirm|\bbooked\b|\bcontract/.test(status) ||
    hasPortalEligibilityValue(details.contractSentDate) ||
    hasPortalEligibilityValue(details.contractReturnedDate)
  );
}

function normalizePortalOverviewRecord(row) {
  const signatures = (Array.isArray(row.portal_signatures) ? row.portal_signatures : [])
    .map(normalizePortalSignature)
    .sort((a, b) => String(b.signedAt).localeCompare(String(a.signedAt)));

  const checklistItems =
    Array.isArray(
      row.portal_checklist_items
    )
      ? row.portal_checklist_items
          .map(
            (item) => ({
              ...normalizePortalChecklistItem(item),
              signatures: signatures.filter(
                (signature) => signature.checklistItemId === item.id
              ),
            })
          )
          .sort(
            (a, b) =>
              a.sortOrder -
              b.sortOrder
          )
      : [];

  const documents =
    Array.isArray(
      row.portal_documents
    )
      ? row.portal_documents.map(
          normalizePortalDocument
        )
      : [];

  const progress =
    getPortalProgress(
      checklistItems
    );

  const guestUploads =
    documents.filter(
      (document) =>
        document.uploadedByGuest
    ).length;

  return {
    id: row.id,
    portalToken:
      row.portal_token || "",

    organizationName:
      cleanPortalText(
        row.organization_name,
        "Unnamed Organization"
      ),

    contactName:
      cleanPortalText(
        row.contact_name,
        "No contact name"
      ),

    email:
      row.email || "",

    startDate:
      row.start_date || "",

    endDate:
      row.end_date || "",

    attendeeCount:
      row.attendee_count || "",

    status:
      row.status || "Inquiry",

    updatedAt:
      row.updated_at || "",

    checklistItems,
    documents,
    signatures,
    progress,
    guestUploads,
  };
}

/* =========================================================
   SUPABASE
========================================================= */

/*
  Same paging as fetchBookings in bookingService.js: Supabase caps each
  response (max_rows, 1,000 by default), so rows are read page by page
  and eligibility is applied only after every page has loaded. The id
  tiebreaker keeps rows from shifting between pages.
*/
const PORTAL_OVERVIEW_PAGE_SIZE = 1000;

const PORTAL_OVERVIEW_MAX_PAGES = 1000;

/*
  Online signing columns exist only after the portal signing migration.
  Until then the overview is read without them, so Portal Admin keeps
  working and an explanation replaces the signing dropdown.
*/
function isMissingSigningSchema(error) {
  return ["42703", "42P01", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code);
}

export async function fetchPortalOverviewRecords() {
  const rows = [];
  // Retry schema discovery after migrations rather than caching failure forever.
  let portalSigningColumnsAvailable = true;

  for (
    let page = 0;
    page < PORTAL_OVERVIEW_MAX_PAGES;
    page += 1
  ) {
    let {
      data,
      error,
    } =
      await fetchPortalOverviewPage(
        rows.length,
        portalSigningColumnsAvailable
      );

    if (error && portalSigningColumnsAvailable && isMissingSigningSchema(error)) {
      portalSigningColumnsAvailable = false;
      ({ data, error } = await fetchPortalOverviewPage(rows.length, false));
    }

    if (error) {
      throw error;
    }

    // Stop only on an empty page; a server row limit below the page
    // size also returns short pages.
    if (
      !data ||
      data.length === 0
    ) {
      return {
        signingAvailable: portalSigningColumnsAvailable,
        records: rows
          .filter(isPortalEligibleBookingRow)
          .map(normalizePortalOverviewRecord),
      };
    }

    rows.push(
      ...data
    );
  }

  throw new Error(
    `Stopped loading portal records after ${PORTAL_OVERVIEW_MAX_PAGES} pages. The portal list may be incomplete.`
  );
}

const PORTAL_SIGNATURE_COLUMNS = `
  id,
  checklist_item_id,
  item_title,
  document_title,
  signer_name,
  signer_title,
  organization_name,
  signs_for_organization,
  signature_type,
  signed_at,
  agreement_version,
  agreement_text,
  authority_text,
  original_sha256,
  signed_sha256,
  original_page_count,
  signed_path,
  original_path
`;

function fetchPortalOverviewPage(
  offset,
  withSigning = false
) {
  return supabase
      .from("bookings")
      .select(`
        id,
        portal_token,
        organization_name,
        retreat_type,
        contact_name,
        email,
        start_date,
        end_date,
        attendee_count,
        status,
        waitlist,
        source_type,
        detected_import_type,
        date_of_cancellation,
        rental_form_details:raw_data->rentalFormDetails,
        updated_at,
        portal_checklist_items (
          id,
          item_id,
          title,
          status,
          required,
          due_date,
          guest_action,
          uploaded_file_name,
          uploaded_file_path,
          uploaded_file_mime,
          uploaded_file_size,
          response_text,
          last_changed_at,
          sort_order${withSigning ? ",\n          sign_document_id" : ""}
        ),
        portal_documents (
          id,
          title,
          document_type,
          file_name,
          note,
          status,
          uploaded_by_guest,
          last_changed_at,
          created_at${withSigning ? ",\n          storage_path" : ""}
        )${withSigning ? `,\n        portal_signatures (${PORTAL_SIGNATURE_COLUMNS})` : ""}
      `)
      .order(
        "start_date",
        {
          ascending: true,
          nullsFirst: false,
        }
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .range(
        offset,
        offset +
          PORTAL_OVERVIEW_PAGE_SIZE -
          1
      );
}

export async function insertPortalChecklistItems(
  bookingId,
  checklistItems
) {
    const data =
    await insertPortalRowsOnce(
      supabase,
      "portal_checklist_items",
        checklistItems.map(
          (item) => ({
            client_request_id:
              item.requestId,

            booking_id:
              bookingId,

            item_id:
              item.itemId,

            title:
              item.title,

            status:
              "notStarted",

            required:
              item.required,

            due_date:
              item.dueDate ||
              null,

            guest_action:
              item.guestAction,

            response_text:
              item.responseText ||
              null,

            sort_order:
              item.sortOrder,

                        last_changed_at:
              new Date()
                .toISOString(),
          })
        ),
      `
        id,
        item_id,
        title,
        status,
        required,
        due_date,
        guest_action,
        uploaded_file_name,
        response_text,
        last_changed_at,
        sort_order
      `
    );

  return data.map(
    normalizePortalChecklistItem
  );
}

export async function insertPortalDocuments(
  bookingId,
  documents
) {
    const data =
    await insertPortalRowsOnce(
      supabase,
      "portal_documents",
        documents.map(
          (document) => ({
            client_request_id:
              document.requestId,

            booking_id:
              bookingId,

            title:
              document.title,

            document_type:
              document.documentType,

            file_name:
              document.fileName,

            note:
              document.note ||
              null,

            status:
              "ready",

            uploaded_by_guest:
              false,

                        last_changed_at:
              new Date()
                .toISOString(),
          })
        ),
      `
        id,
        title,
        document_type,
        file_name,
        note,
        status,
        uploaded_by_guest,
        last_changed_at,
        created_at
      `
    );

  return data.map(
    normalizePortalDocument
  );
}

export async function insertCustomPortalDocument(
  bookingId,
  document
) {
  const now =
    new Date()
      .toISOString();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "portal_documents"
      )
      .insert({
        booking_id:
          bookingId,

        title:
          document.title,

        document_type:
          document.documentType ||
          "Staff Document",

        file_name:
          document.fileName,

        note:
          document.note ||
          null,

        status:
          "ready",

        uploaded_by_guest:
          false,

        last_changed_at:
          now,
      })
      .select(`
        id,
        title,
        document_type,
        file_name,
        note,
        status,
        uploaded_by_guest,
        last_changed_at,
        created_at
      `)
      .single();

  if (error) {
    throw error;
  }

  return normalizePortalDocument(
    data
  );
}

/*
  One request id per task for the current selection. A retry after an
  error reuses them, so the same click can never insert twice; a new
  selection after success gets new ids, so an intentional repeat works.
*/
export function getAssignmentRequestIds(pendingRef, selectionKey, keys) {
  if (pendingRef.current?.selectionKey !== selectionKey) {
    pendingRef.current = {
      selectionKey,
      ids: Object.fromEntries(
        keys.map((key) => [
          key,
          window.crypto?.randomUUID?.() ||
            `${Date.now()}-${key}-${Math.random().toString(36).slice(2)}`,
        ])
      ),
    };
  }

  return pendingRef.current.ids;
}
