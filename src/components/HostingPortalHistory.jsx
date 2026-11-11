import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { EmailHistoryList } from "./PortalEmailPanel";
import { loadEmailHistory } from "../services/portalEmailService";
import { PORTAL_SIGNED_BUCKET, PORTAL_UPLOADS_BUCKET } from "../utils/backupFormat";

/*
  Read-only guest portal history for a hosting entry (for example one
  converted from a booking). Hosting has no guest access, and Portal Admin
  does not list it, so staff read the earlier tasks, files, signatures and
  emails here. Nothing here can send, assign or reopen anything.
*/

async function readRows(query) {
  const { data, error } = await query;
  // A table that does not exist yet (signing not set up) just has no rows.
  if (error) return error.code === "42P01" || error.code === "PGRST205" ? [] : Promise.reject(error);
  return data || [];
}

async function openFile(bucket, path) {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 10 * 60);
    if (error || !data?.signedUrl) throw error || new Error("No file URL.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Could not open the file:", error);
    alert("Could not open this file. Please try again.");
  }
}

export default function HostingPortalHistory({ recordId }) {
  const [state, setState] = useState({ loading: true, error: "", items: [], documents: [], signatures: [], emails: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      readRows(supabase.from("portal_checklist_items").select("id, title, status, uploaded_file_name, uploaded_file_path, response_text, sort_order").eq("booking_id", recordId).order("sort_order")),
      readRows(supabase.from("portal_documents").select("id, title, file_name, storage_bucket, storage_path, uploaded_by_guest, created_at").eq("booking_id", recordId).order("created_at")),
      readRows(supabase.from("portal_signatures").select("id, document_title, signer_name, signed_at, signed_path").eq("booking_id", recordId).order("signed_at")),
      loadEmailHistory({ bookingId: recordId, limit: 50 }).catch(() => []),
    ]).then(
      ([items, documents, signatures, emails]) => {
        if (!cancelled) setState({ loading: false, error: "", items, documents, signatures, emails });
      },
      (error) => {
        console.error("Could not load portal history:", error);
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: "Could not load the portal history." }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  if (state.loading) return <p className="hosting-muted">Loading portal history…</p>;
  if (state.error) return <p className="hosting-muted">{state.error}</p>;

  const { items, documents, signatures, emails } = state;
  if (!items.length && !documents.length && !signatures.length && !emails.length) {
    return <p className="hosting-muted">No guest portal history.</p>;
  }

  return (
    <div className="hosting-portal-history">
      <p className="hosting-muted">Kept for staff. The guest portal link no longer works and nothing here is sent to anyone.</p>

      {items.length > 0 && (
        <>
          <h4>Portal tasks</h4>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong> <span className="hosting-tag">{item.status}</span>
                {item.response_text && <span> · {item.response_text}</span>}
                {item.uploaded_file_path && (
                  <button className="table-link" type="button" onClick={() => openFile(PORTAL_UPLOADS_BUCKET, item.uploaded_file_path)}>
                    {item.uploaded_file_name || "Open upload"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {documents.length > 0 && (
        <>
          <h4>Documents</h4>
          <ul>
            {documents.map((document) => (
              <li key={document.id}>
                <strong>{document.title}</strong>
                {document.uploaded_by_guest && <span className="hosting-tag">from guest</span>}
                {document.storage_path && (
                  <button className="table-link" type="button" onClick={() => openFile(document.storage_bucket || PORTAL_UPLOADS_BUCKET, document.storage_path)}>
                    {document.file_name || "Open file"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {signatures.length > 0 && (
        <>
          <h4>Signed online</h4>
          <ul>
            {signatures.map((signature) => (
              <li key={signature.id}>
                <strong>{signature.document_title}</strong> · {signature.signer_name} · {String(signature.signed_at).slice(0, 10)}
                {signature.signed_path && (
                  <button className="table-link" type="button" onClick={() => openFile(PORTAL_SIGNED_BUCKET, signature.signed_path)}>
                    Open signed copy
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {emails.length > 0 && (
        <>
          <h4>Guest emails</h4>
          <EmailHistoryList rows={emails} />
        </>
      )}
    </div>
  );
}
