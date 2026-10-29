import {
  getReopenedPortalItemStatus,
  getRemovedUploadStoragePath,
  portalItemHasGuestSubmission,
} from "../utils/portalRules.js";

/*
  Portal Admin correction actions (AUDIT-038, Q-017: all five).

  Each change is one database statement guarded by the status staff saw,
  so a guest action in between is never overwritten; zero changed rows is
  reported, not treated as success. Visibility to the guest follows from
  the database: a removed row no longer exists for the guest portal to
  read.

  Removing a task that has a guest upload keeps the file (Q-017
  recommendation): its record is first copied to portal_removed_uploads
  (staff-only, see the migration) and the file is moved out of the
  portal-token folder the guest can read. If that table does not exist
  yet, removal of an uploaded task is refused rather than losing the
  record.

  The client is a parameter so the rules can be tested without Supabase.
*/

function isMissingRelationOrColumn(error) {
  return ["42P01", "42703", "42P10", "PGRST204", "PGRST205"].includes(error?.code);
}

function requireOneRow(data, message) {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(message);
  }
  return data[0];
}

const CHANGED_MESSAGE =
  "Nothing was changed: the task changed since this page loaded, or your account cannot edit portal tasks. Reload and try again.";

export async function changePortalItemDueDate(client, item, dueDate) {
  const { data, error } = await client
    .from("portal_checklist_items")
    .update({ due_date: dueDate || null, last_changed_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", item.status)
    .select("id");
  if (error) throw error;
  return requireOneRow(data, CHANGED_MESSAGE);
}

/*
  Sends a guest submission back: needsReview → waitingOnGuest. The upload
  and response stay so the guest can see what to replace. An optional note
  is saved in staff_review_note when that column exists.
*/
export async function requestPortalItemChanges(client, item, note = "") {
  if (item.status !== "needsReview") {
    throw new Error("Only a task waiting for review can be sent back to the guest.");
  }
  const changes = { status: "waitingOnGuest", last_changed_at: new Date().toISOString() };
  const trimmedNote = String(note || "").trim();

  const attempt = (values) =>
    client
      .from("portal_checklist_items")
      .update(values)
      .eq("id", item.id)
      .eq("status", "needsReview")
      .select("id");

  let { data, error } = await attempt(trimmedNote ? { ...changes, staff_review_note: trimmedNote } : changes);
  let noteSaved = Boolean(trimmedNote);

  if (error && trimmedNote && isMissingRelationOrColumn(error)) {
    ({ data, error } = await attempt(changes));
    noteSaved = false;
  }
  if (error) throw error;
  requireOneRow(data, CHANGED_MESSAGE);
  return { noteSaved };
}

export async function reopenPortalItem(client, item) {
  if (item.status !== "completed") {
    throw new Error("Only a confirmed task can be reopened.");
  }
  const status = getReopenedPortalItemStatus(item);
  const { data, error } = await client
    .from("portal_checklist_items")
    .update({ status, last_changed_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", "completed")
    .select("id");
  if (error) throw error;
  requireOneRow(data, CHANGED_MESSAGE);
  return { status };
}

export async function removePortalItem(client, { bookingId, item, removedBy = null, bucket = "portal-uploads" }) {
  let fileNote = "";

  if (portalItemHasGuestSubmission(item) && item.uploadedFilePath) {
    const archivePath = getRemovedUploadStoragePath(bookingId, item.id, item.uploadedFilePath);
    const { error: moveError } = await client.storage.from(bucket).move(item.uploadedFilePath, archivePath);
    const fileMoved = !moveError;

    const { error: archiveError } = await client.from("portal_removed_uploads").insert({
      booking_id: bookingId,
      checklist_item_id: String(item.id),
      item_id: item.itemId || null,
      title: item.title || null,
      uploaded_file_name: item.uploadedFileName || null,
      original_file_path: item.uploadedFilePath,
      current_file_path: fileMoved ? archivePath : item.uploadedFilePath,
      uploaded_file_mime: item.uploadedFileMime || null,
      uploaded_file_size: item.uploadedFileSize || null,
      response_text: item.responseText || null,
      removed_by: removedBy,
    });

    if (archiveError) {
      // Put the file back so nothing changed.
      if (fileMoved) await client.storage.from(bucket).move(archivePath, item.uploadedFilePath);
      if (isMissingRelationOrColumn(archiveError)) {
        throw new Error(
          "This task has a guest upload. Run the portal corrections migration (portal_removed_uploads) before removing it, so the upload's record is kept."
        );
      }
      throw archiveError;
    }

    fileNote = fileMoved
      ? " The guest's file was kept and moved out of their portal folder."
      : " The guest's file was kept but could not be moved, so a guest who saved its link could still open it.";
  }

  const { data, error } = await client
    .from("portal_checklist_items")
    .delete()
    .eq("id", item.id)
    .eq("status", item.status)
    .select("id");
  if (error) throw error;
  requireOneRow(data, CHANGED_MESSAGE);
  return { message: `Task removed.${fileNote}` };
}

// Staff-shared documents only; the stored file is left in Storage.
export async function removePortalDocument(client, document) {
  if (document.uploadedByGuest) {
    throw new Error("Guest-uploaded documents are not removed from Portal Admin.");
  }
  const { data, error } = await client
    .from("portal_documents")
    .delete()
    .eq("id", document.id)
    .eq("uploaded_by_guest", false)
    .select("id");
  if (error) throw error;
  requireOneRow(data, "Nothing was removed: the document was already gone, or your account cannot edit portal documents.");
  return { message: "Document removed from the guest portal. Any uploaded copy stays in Storage." };
}

/*
  Inserts with a request id generated once per assignment click. A retry
  of the same click (for example after a dropped connection) cannot add a
  second copy; a new, intentional repeat gets a new request id. Without
  the client_request_id column (migration not run yet) rows are inserted
  as before.
*/
export async function insertPortalRowsOnce(client, table, rows, selectColumns) {
  const run = (values) =>
    values.some((row) => row.client_request_id)
      ? client
          .from(table)
          .upsert(values, { onConflict: "client_request_id", ignoreDuplicates: true })
          .select(selectColumns)
      : client.from(table).insert(values).select(selectColumns);

  let { data, error } = await run(rows);

  if (error && isMissingRelationOrColumn(error)) {
    const withoutRequestIds = rows.map((row) => {
      const copy = { ...row };
      delete copy.client_request_id;
      return copy;
    });
    ({ data, error } = await run(withoutRequestIds));
  }

  if (error) throw error;
  return data || [];
}
