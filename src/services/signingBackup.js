import { restoreSignatureRows } from "./backupData.js";

/*
  Signed-documents export and restore (online signing).

  The JSON backup holds the signing records; this export holds the PDFs.
  One .zip contains:
    manifest.json   format, date, every signing record, and one entry per
                    file with the SHA-256 fingerprint recorded at signing
    files/<path>    each original and signed PDF, at its storage path

  Restore checks every file against its recorded fingerprint before
  anything is written, then puts back missing records (admin-only database
  function) and missing files (portal-sign function, which re-checks the
  fingerprint and never overwrites). Nothing existing is changed.

  The Supabase client, JSZip and the file upload call are parameters so the
  rules can be tested in Node.
*/

export const SIGNED_EXPORT_FORMAT = "toah-nipi-signed-documents";
const SIGNED_BUCKET = "portal-signed";
const PAGE_SIZE = 1000;

export async function sha256OfBytes(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchSignatureRows(client, signedSince) {
  const rows = [];
  for (;;) {
    let query = client
      .from("portal_signatures")
      .select("*")
      .order("id", { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (signedSince) query = query.gte("signed_at", signedSince);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}

function filesOf(row) {
  return [
    { kind: "original", path: row.original_path, sha256: row.original_sha256, size: row.original_size },
    { kind: "signed", path: row.signed_path, sha256: row.signed_sha256, size: row.signed_size },
  ];
}

/*
  shortcut: builds the whole .zip in browser memory; fine for a season of
  signed documents (hundreds of MB at most). Use "signed since" to split
  very large exports, or move the export server-side if it outgrows that.
*/
export async function buildSignedDocumentsArchive({ client, JSZip, signedSince = "", now = new Date(), onProgress }) {
  const rows = await fetchSignatureRows(client, signedSince);
  const zip = new JSZip();
  const files = [];
  const problems = [];
  const total = rows.length * 2;
  let done = 0;

  for (const row of rows) {
    for (const file of filesOf(row)) {
      const { data, error } = await client.storage.from(SIGNED_BUCKET).download(file.path);
      let status = "ok";
      if (error || !data) {
        status = "missing";
        problems.push(`Missing file for signature ${row.id} (${file.kind}).`);
      } else {
        const bytes = new Uint8Array(await data.arrayBuffer());
        if ((await sha256OfBytes(bytes)) !== file.sha256) {
          status = "fingerprint-mismatch";
          problems.push(`File for signature ${row.id} (${file.kind}) does not match its recorded fingerprint.`);
        }
        zip.file(`files/${file.path}`, bytes);
      }
      files.push({ ...file, signatureId: row.id, bookingId: row.booking_id, status });
      done += 1;
      onProgress?.(done, total);
    }
  }

  const manifest = {
    format: SIGNED_EXPORT_FORMAT,
    version: 1,
    createdAt: now.toISOString(),
    signedSince: signedSince || null,
    signatureCount: rows.length,
    fileCount: files.filter((file) => file.status !== "missing").length,
    problems,
    records: rows,
    files,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "README.txt",
    "Toah Nipi signed documents export.\n" +
      "files/ holds each original and signed PDF. manifest.json lists every signing record and each file's SHA-256 fingerprint.\n" +
      "Restore it from the Backups page (Signed documents > Restore). Keep this file somewhere safe and private.\n"
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return { bytes, manifest };
}

/*
  Reads an export and checks every file against the fingerprint recorded in
  its manifest. Nothing is written.
*/
export async function readSignedDocumentsArchive({ bytes, JSZip }) {
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("This file is not a signed-documents export (manifest.json is missing).");
  const manifest = JSON.parse(await manifestFile.async("string"));
  if (manifest?.format !== SIGNED_EXPORT_FORMAT) throw new Error("This file is not a signed-documents export.");

  const files = [];
  const problems = [];
  // Files that were already missing or altered when exported are reported, never restored.
  const skipped = (manifest.files || []).filter((entry) => entry.status !== "ok").map((entry) => `${entry.path} (${entry.status})`);
  for (const entry of manifest.files || []) {
    if (entry.status !== "ok") continue;
    const zipped = zip.file(`files/${entry.path}`);
    if (!zipped) {
      problems.push(`The export is missing ${entry.path}.`);
      continue;
    }
    const fileBytes = await zipped.async("uint8array");
    if ((await sha256OfBytes(fileBytes)) !== entry.sha256) {
      problems.push(`${entry.path} does not match its recorded fingerprint.`);
      continue;
    }
    files.push({ ...entry, bytes: fileBytes });
  }
  return { manifest, files, problems, skipped };
}

/*
  restoreFile(path, bytes) uploads one file through the portal-sign
  function (admin session); it returns { status: "restored" | "present" }.
*/
export async function restoreSignedDocumentsArchive({ bytes, JSZip, client, restoreFile, onProgress }) {
  const { manifest, files, problems, skipped } = await readSignedDocumentsArchive({ bytes, JSZip });
  if (problems.length > 0) {
    return { ok: false, problems, skipped, rows: null, restored: 0, present: 0, failed: [] };
  }

  const rows = await restoreSignatureRows(manifest.records || [], { client });
  let restored = 0;
  let present = 0;
  const failed = [];
  for (const [index, file] of files.entries()) {
    try {
      const result = await restoreFile(file.path, file.bytes);
      if (result?.status === "restored") restored += 1;
      else present += 1;
    } catch (error) {
      failed.push(`${file.path}: ${error?.message || error}`);
    }
    onProgress?.(index + 1, files.length);
  }
  return { ok: failed.length === 0, problems: [], skipped, rows, restored, present, failed };
}
