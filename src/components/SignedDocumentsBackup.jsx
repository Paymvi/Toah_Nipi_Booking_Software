import { useState } from "react";
import JSZip from "jszip";
import { FaDownload, FaFileSignature, FaRedoAlt, FaUpload } from "react-icons/fa";

import { supabase } from "../lib/supabaseClient";
import {
  buildSignedDocumentsArchive,
  readSignedDocumentsArchive,
  restoreSignedDocumentsArchive,
} from "../services/signingBackup";

/*
  Signed documents (online signing): the JSON backup holds the signing
  records; this card saves and restores the PDFs themselves, with a
  manifest of fingerprints. Restore only adds what is missing.
*/

function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function restoreFileThroughFunction(path, bytes) {
  const { data, error } = await supabase.functions.invoke("portal-sign?action=restore_file", {
    body: new Blob([bytes], { type: "application/pdf" }),
    headers: { "x-restore-path": path, "content-type": "application/pdf" },
  });
  if (error) {
    const payload = await Promise.resolve(error.context?.json?.()).catch(() => null);
    throw new Error(payload?.error || error.message);
  }
  return data;
}

export default function SignedDocumentsBackup({ disabled = false }) {
  const [signedSince, setSignedSince] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [archive, setArchive] = useState(null);

  async function handleExport() {
    setBusy("export");
    setResult(null);
    try {
      const { bytes, manifest } = await buildSignedDocumentsArchive({
        client: supabase,
        JSZip,
        signedSince: signedSince ? `${signedSince}T00:00:00Z` : "",
        onProgress: (done, total) => setProgress(`Saving file ${done} of ${total}…`),
      });
      const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
      downloadBytes(bytes, `toah-nipi-signed-documents-${stamp}.zip`);
      setResult({
        tone: manifest.problems.length ? "warning" : "success",
        message:
          `Saved ${manifest.signatureCount} signing record${manifest.signatureCount === 1 ? "" : "s"} and ${manifest.fileCount} PDF${manifest.fileCount === 1 ? "" : "s"}, each checked against its fingerprint. ` +
          (manifest.problems.length ? `Problems: ${manifest.problems.join(" ")}` : "Store the .zip with your other backups."),
      });
    } catch (error) {
      setResult({ tone: "error", message: error?.message || "The signed documents could not be exported." });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function handleChooseFile(event) {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    setBusy("check");
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = await readSignedDocumentsArchive({ bytes, JSZip });
      setArchive({ name: file.name, bytes, checked });
      setResult(
        checked.problems.length
          ? { tone: "error", message: `This export failed its fingerprint check, so it cannot be restored: ${checked.problems.join(" ")}` }
          : {
              tone: "success",
              message: `${file.name}: ${checked.manifest.signatureCount} signing records and ${checked.files.length} PDFs, all matching their fingerprints.` +
                (checked.skipped.length ? ` Not restorable (already missing or altered when exported): ${checked.skipped.join(", ")}.` : ""),
            }
      );
    } catch (error) {
      setArchive(null);
      setResult({ tone: "error", message: error?.message || "That file could not be read." });
    } finally {
      setBusy("");
    }
  }

  async function handleRestore() {
    if (!archive || archive.checked.problems.length) return;
    setBusy("restore");
    try {
      const outcome = await restoreSignedDocumentsArchive({
        bytes: archive.bytes,
        JSZip,
        client: supabase,
        restoreFile: restoreFileThroughFunction,
        onProgress: (done, total) => setProgress(`Checking file ${done} of ${total}…`),
      });
      setResult({
        tone: outcome.ok ? "success" : "warning",
        message:
          `Records: ${outcome.rows.inserted} added, ${outcome.rows.alreadyPresent} already present` +
          (outcome.rows.skipped ? `, ${outcome.rows.skipped} skipped because their booking is not in the database` : "") +
          `. Files: ${outcome.restored} restored, ${outcome.present} already present.` +
          (outcome.failed.length ? ` Not restored: ${outcome.failed.join(" ")}` : " Nothing existing was changed."),
      });
      setArchive(null);
    } catch (error) {
      setResult({ tone: "error", message: error?.message || "The signed documents could not be restored." });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  const isBusy = Boolean(busy) || disabled;

  return (
    <section className="backup-workspace-grid signed-documents-backup">
      <article className="backup-panel">
        <header className="backup-panel-header">
          <span className="backup-panel-icon backup-panel-icon-green">
            <FaFileSignature />
          </span>
          <div>
            <p className="backup-panel-eyebrow">Online signing</p>
            <h2>Signed documents</h2>
            <span>
              The backup file above holds the signing records. This saves the signed PDFs and
              originals themselves, with their fingerprints. Make one after each backup.
            </span>
          </div>
        </header>

        <label className="signed-documents-since">
          <span>Only documents signed since (optional)</span>
          <input type="date" value={signedSince} onChange={(event) => setSignedSince(event.target.value)} disabled={isBusy} />
        </label>

        <button className="backup-large-action backup-large-action-create" type="button" onClick={handleExport} disabled={isBusy}>
          <span>{busy === "export" ? <FaRedoAlt className="backup-spin" /> : <FaDownload />}</span>
          <div>
            <strong>{busy === "export" ? "Saving signed documents…" : "Download Signed Documents"}</strong>
            <small>{busy === "export" ? progress : "A .zip of every signed PDF and original, checked against its fingerprint"}</small>
          </div>
        </button>
      </article>

      <article className="backup-panel">
        <header className="backup-panel-header">
          <span className="backup-panel-icon backup-panel-icon-slate">
            <FaUpload />
          </span>
          <div>
            <p className="backup-panel-eyebrow">Recovery</p>
            <h2>Restore signed documents</h2>
            <span>
              Administrators only. Adds signing records and PDFs that are missing; anything already
              stored is left exactly as it is.
            </span>
          </div>
        </header>

        <label className="signed-documents-file">
          <span>Choose a signed-documents .zip</span>
          <input type="file" accept=".zip,application/zip" onChange={handleChooseFile} disabled={isBusy} />
        </label>

        {archive && !archive.checked.problems.length && (
          <button className="backup-large-action" type="button" onClick={handleRestore} disabled={isBusy}>
            <span>{busy === "restore" ? <FaRedoAlt className="backup-spin" /> : <FaUpload />}</span>
            <div>
              <strong>{busy === "restore" ? "Restoring…" : "Restore Missing Records and Files"}</strong>
              <small>{busy === "restore" ? progress : archive.name}</small>
            </div>
          </button>
        )}
      </article>

      {result && (
        <p className={`signed-documents-result signed-documents-result-${result.tone}`} role={result.tone === "error" ? "alert" : "status"}>
          {result.message}
        </p>
      )}
    </section>
  );
}
