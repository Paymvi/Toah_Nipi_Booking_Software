/*
  portal-sign
  ---------------------------------------------------------------------------
  Online signing for the guest portal. See docs/portal-signing/SETUP.md.

  Guest actions (portal token in the JSON body, publishable key only):
    open      the task's PDF: a 10-minute view link, its fingerprint, and
              the agreement wording to show
    sign      record a signature (see signing.js for the checks)
    download  a 10-minute link to one of this booking's signed copies

  Admin action (signed-in staff session whose role is admin):
    restore_file  put back one file from a signed-documents export, only if
                  its bytes match the fingerprint already recorded

  verify_jwt is off: guests have no user JWT. Every request is checked here.
  The function uses the service role, because only it may write signing
  records; the guest never receives that access.

  Logs carry the action and an outcome code only: never portal tokens,
  signer entries, file names or file contents.
  ---------------------------------------------------------------------------
*/

import { createClient } from "npm:@supabase/supabase-js@2";
import * as PDFLib from "npm:pdf-lib@1.17.1";
import { MAX_REQUEST_BYTES, SigningError, createSigningService } from "./signing.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-restore-path",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const SIGNATURE_COLUMNS =
  "id, booking_id, document_title, item_title, signer_name, signed_at, signed_path, original_path, original_sha256, signed_sha256";

const db = {
  async findBookingByToken(token: string) {
    const { data, error } = await admin
      .from("bookings")
      .select("id, organization_name, retreat_type")
      .eq("portal_token", token)
      .maybeSingle();
    if (error) throw new Error("lookup failed");
    return data;
  },
  async isSigningEnabled(bookingId: string) {
    const { data, error } = await admin.rpc("portal_signing_enabled_for", { p_booking_id: bookingId });
    if (error) throw new Error("lookup failed");
    return data === true;
  },
  async findItem(bookingId: string, itemKey: string) {
    const { data, error } = await admin
      .from("portal_checklist_items")
      .select("id, item_id, title, status, guest_action, sign_document_id")
      .eq("booking_id", bookingId)
      .eq("item_id", itemKey)
      .maybeSingle();
    if (error) throw new Error("lookup failed");
    return data;
  },
  async findDocument(bookingId: string, documentId: string) {
    const { data, error } = await admin
      .from("portal_documents")
      .select("id, title, file_name, storage_path, uploaded_by_guest")
      .eq("booking_id", bookingId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw new Error("lookup failed");
    return data;
  },
  async findSignatureByRequestKey(requestKey: string) {
    const { data, error } = await admin
      .from("portal_signatures")
      .select(SIGNATURE_COLUMNS)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (error) throw new Error("lookup failed");
    return data;
  },
  async findSignature(bookingId: string, signatureId: string) {
    const { data, error } = await admin
      .from("portal_signatures")
      .select(SIGNATURE_COLUMNS)
      .eq("booking_id", bookingId)
      .eq("id", signatureId)
      .maybeSingle();
    if (error) throw new Error("lookup failed");
    return data;
  },
  async findSignatureByPath(path: string) {
    for (const column of ["original_path", "signed_path"]) {
      const { data, error } = await admin
        .from("portal_signatures")
        .select(SIGNATURE_COLUMNS)
        .eq(column, path)
        .maybeSingle();
      if (error) throw new Error("lookup failed");
      if (data) return data;
    }
    return null;
  },
  async recordSignature(payload: Record<string, unknown>) {
    const { data, error } = await admin.rpc("portal_record_signature", { p: payload });
    // The database raises short codes (TASK_NOT_OPEN, DOCUMENT_CHANGED, ...); anything else is "unknown outcome".
    if (error) throw new Error(/^[A-Z_]+$/.test(error.message) ? error.message : "record failed");
    return data;
  },
};

const storage = {
  async download(bucket: string, path: string) {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  },
  async upload(bucket: string, path: string, bytes: Uint8Array) {
    const { error } = await admin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error("upload failed");
  },
  async remove(bucket: string, paths: string[]) {
    await admin.storage.from(bucket).remove(paths);
  },
  async signedUrl(bucket: string, path: string, seconds: number, downloadName?: string) {
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
    if (error || !data?.signedUrl) throw new Error("link failed");
    // Local stack only: links made inside Docker use an internal host the browser cannot reach.
    const publicUrl = Deno.env.get("PORTAL_SIGN_PUBLIC_URL");
    if (!publicUrl) return data.signedUrl;
    const link = new URL(data.signedUrl);
    return `${publicUrl.replace(/\/$/, "")}${link.pathname}${link.search}`;
  },
};

const service = createSigningService({ db, storage, PDFLib });

function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new SigningError("FORBIDDEN", "Staff sign-in required.", 401);
  // Never fall back to the service key here: the role check must run as the caller.
  const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await asUser.rpc("is_staff_admin");
  if (error || data !== true) throw new SigningError("FORBIDDEN", "Only administrators can restore signing files.", 403);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let action = new URL(request.url).searchParams.get("action") ?? "";
  try {
    if (action === "restore_file") {
      await requireAdmin(request);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 26 * 1024 * 1024) {
        throw new SigningError("INVALID", "The file is empty or too large.", 413);
      }
      const result = await service.restoreFile({ path: request.headers.get("x-restore-path") ?? "", bytes });
      console.log(JSON.stringify({ action, outcome: result.status }));
      return jsonResponse(result);
    }

    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) throw new SigningError("INVALID", "The request is too large.", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      throw new SigningError("INVALID", "The request could not be read.", 400);
    }
    action = String(body.action ?? "");

    let result;
    if (action === "open") {
      result = await service.open({ token: body.token, itemKey: body.itemKey });
    } else if (action === "sign") {
      result = await service.sign({
        token: body.token,
        input: body,
        clientIp: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? "",
      });
    } else if (action === "download") {
      result = await service.download({ token: body.token, signatureId: body.signatureId });
    } else {
      throw new SigningError("INVALID", "Unknown action.", 400);
    }
    console.log(JSON.stringify({ action, outcome: "ok" }));
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof SigningError) {
      console.log(JSON.stringify({ action, outcome: error.code }));
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    console.error(JSON.stringify({ action, outcome: "unexpected" }));
    return jsonResponse({ error: "Something went wrong. Nothing was signed. Please try again.", code: "UNEXPECTED" }, 500);
  }
});
