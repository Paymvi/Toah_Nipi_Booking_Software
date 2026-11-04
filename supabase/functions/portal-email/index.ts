/*
  portal-email
  ---------------------------------------------------------------------------
  Guest portal emails: the scheduled worker, staff actions and the Resend
  delivery webhook. See docs/portal-email/SETUP.md.

  Callers:
    * Scheduler (pg_cron + pg_net): header x-portal-email-cron must equal
      the PORTAL_EMAIL_CRON_SECRET secret. Only { action: "run" }.
    * Resend webhook: POST ?webhook=resend, verified with
      PORTAL_EMAIL_WEBHOOK_SECRET (Svix signature). Only records delivery
      or bounce for a known provider message id.
    * Staff dashboard: a signed-in user whose staff role can manage
      bookings. The guest portal (anon key, portal token) cannot call any
      action: it has no staff session.

  Deploy with `supabase functions deploy portal-email --use-api` so the
  shared rules in src/utils are bundled. verify_jwt is off because the
  scheduler and webhook do not send user JWTs; every request is
  authenticated below instead.

  Logs carry message ids and counts only: never addresses, portal links,
  tokens or email content.
  ---------------------------------------------------------------------------
*/

import { createClient } from "npm:@supabase/supabase-js@2";
import { createResendProvider, readEmailConfig } from "./provider.js";
import {
  UserError,
  activateBooking,
  changeAutomation,
  getOverview,
  getReadiness,
  retryMessage,
  runScheduled,
  sendManual,
  sendTest,
} from "./service.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

const encoder = new TextEncoder();

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function cronSecretMatches(submitted: string) {
  const expected = Deno.env.get("PORTAL_EMAIL_CRON_SECRET") ?? "";
  if (expected.length < 32) return false;
  return timingSafeEqual(await sha256(submitted), await sha256(expected));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

// Svix signature check used by Resend webhooks; rejects anything older than 5 minutes.
async function webhookIsAuthentic(req: Request, payload: string) {
  const secret = Deno.env.get("PORTAL_EMAIL_WEBHOOK_SECRET") ?? "";
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signatures = (req.headers.get("svix-signature") ?? "").split(" ");
  if (!secret.startsWith("whsec_") || !id || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.slice("whsec_".length)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${payload}`))
  );
  return signatures.some((entry) => {
    const [version, signature] = entry.split(",");
    try {
      return version === "v1" && timingSafeEqual(base64ToBytes(signature ?? ""), expected);
    } catch {
      return false;
    }
  });
}

const WEBHOOK_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "bounced",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw error;
      return data;
    },
  };
  const config = readEmailConfig(Deno.env.toObject());
  const provider = config.providerReady ? createResendProvider({ apiKey: config.apiKey }) : null;
  const now = new Date();

  try {
    if (new URL(req.url).searchParams.get("webhook") === "resend") {
      const payload = await req.text();
      if (!(await webhookIsAuthentic(req, payload))) return jsonResponse({ error: "Invalid signature." }, 401);
      const event = JSON.parse(payload);
      const status = WEBHOOK_STATUS[event?.type];
      const providerId = String(event?.data?.email_id ?? "");
      if (status && providerId) {
        await db.rpc("portal_email_webhook", {
          p_provider_id: providerId,
          p_status: status,
          p_detail: event.type === "email.complained" ? "Marked as spam by the recipient." : status === "bounced" ? "Bounced." : "Delivered.",
        });
      }
      return jsonResponse({ ok: true });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }

    const cronHeader = req.headers.get("x-portal-email-cron");
    if (cronHeader !== null) {
      if (!(await cronSecretMatches(cronHeader)) || body.action !== "run") {
        return jsonResponse({ error: "Not allowed." }, 401);
      }
      const summary = await runScheduled({ db, provider, config, now });
      console.log("portal-email run", JSON.stringify(summary));
      return jsonResponse(summary);
    }

    // Staff: a signed-in user whose staff_profiles role can manage bookings.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const userId = userData?.user?.id;
    const { data: canManage } = userId ? await userClient.rpc("can_manage_bookings") : { data: false };
    if (!userId || canManage !== true) return jsonResponse({ error: "Staff sign-in required." }, 401);

    const bookingId = String(body.bookingId ?? "");
    const requestId = String(body.requestId ?? "");
    const common = { db, provider, config, now, userId };

    switch (body.action) {
      case "status":
        return jsonResponse({ readiness: getReadiness(config) });
      case "overview":
        return jsonResponse(await getOverview({ db, config, bookingId, now }));
      case "activate":
        return jsonResponse(await activateBooking({ ...common, bookingId }));
      case "deactivate":
      case "pause":
      case "resume":
        return jsonResponse(await changeAutomation({ db, bookingId, action: body.action, userId }));
      case "send":
        return jsonResponse(
          await sendManual({ ...common, bookingId, kind: body.kind, requestId, confirmCompleted: body.confirmCompleted === true })
        );
      case "testSend":
        return jsonResponse(
          await sendTest({
            ...common,
            to: body.to,
            templateKey: body.templateKey,
            bookingId,
            useRealData: body.useRealData === true,
            requestId,
          })
        );
      case "retry":
        return jsonResponse(await retryMessage({ ...common, messageId: String(body.messageId ?? "") }));
      default:
        return jsonResponse({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    if (error instanceof UserError) return jsonResponse({ error: error.message }, 400);
    console.error("portal-email failed:", (error as Error)?.name ?? "Error");
    return jsonResponse({ error: "Portal email request failed." }, 500);
  }
});
