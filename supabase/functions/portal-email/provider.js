import { isValidEmail, normalizeEmail } from "../../../src/utils/portalEmail.js";

/*
  Server configuration, read from Edge Function secrets only. Anything
  missing or malformed fails closed: previews and dry runs still work, but
  no provider call can happen (decideDelivery blocks it).

    PORTAL_EMAIL_PROVIDER          must be "resend"
    RESEND_API_KEY                 provider key
    PORTAL_EMAIL_PORTAL_BASE_URL   https address of the guest portal
    PORTAL_EMAIL_TEST_ALLOWLIST    test inboxes, comma separated (empty = none)
    PORTAL_EMAIL_LIVE_ENABLED      "true" is the server half of going live
*/
export function readEmailConfig(env = {}) {
  const problems = [];
  const portalBaseUrl = String(env.PORTAL_EMAIL_PORTAL_BASE_URL || "").trim().replace(/\/+$/, "");
  if (env.PORTAL_EMAIL_PROVIDER !== "resend") problems.push("PORTAL_EMAIL_PROVIDER is not set to resend.");
  if (!String(env.RESEND_API_KEY || "").trim()) problems.push("RESEND_API_KEY is not set.");
  if (!/^https:\/\/[^/?#\s]+(\/[^?#\s]*)?$/.test(portalBaseUrl)) {
    problems.push("PORTAL_EMAIL_PORTAL_BASE_URL is not an https address.");
  }
  const testAllowlist = new Set(
    String(env.PORTAL_EMAIL_TEST_ALLOWLIST || "")
      .split(/[\s,;]+/)
      .map(normalizeEmail)
      .filter(isValidEmail)
  );

  return {
    providerReady: problems.length === 0,
    problems,
    portalBaseUrl: problems.some((problem) => problem.startsWith("PORTAL_EMAIL_PORTAL_BASE_URL")) ? "" : portalBaseUrl,
    testAllowlist,
    liveEnabled: env.PORTAL_EMAIL_LIVE_ENABLED === "true",
    apiKey: String(env.RESEND_API_KEY || "").trim(),
  };
}

const RETRYABLE_NAMES = new Set([
  "rate_limit_exceeded",
  "concurrent_idempotent_requests",
  "resource_locked",
  "daily_quota_exceeded",
]);

/*
  Resend adapter. Every provider exposes send(email) and resolves to
    { ok: true, id }                                  accepted by the provider
    { ok: false, retryable, uncertain?, detail }      not accepted
  "uncertain" means no answer arrived, so the email may have been accepted.
  The idempotency key (our message id) makes a retry within 24 hours safe.
  Details never include provider response text, which can echo addresses.
*/
export function createResendProvider({ apiKey, fetchImpl = fetch, timeoutMs = 15000 }) {
  return {
    name: "resend",
    async send(email) {
      let response;
      try {
        response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": email.idempotencyKey,
          },
          body: JSON.stringify({
            from: email.from,
            to: [email.to],
            reply_to: email.replyTo,
            subject: email.subject,
            html: email.html,
            text: email.text,
            tags: email.tags,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return { ok: false, retryable: true, uncertain: true, detail: "No response from the email provider." };
      }

      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.id) return { ok: true, id: String(body.id) };
      if (response.ok) {
        return { ok: false, retryable: true, uncertain: true, detail: "The provider answered without a message id." };
      }
      const name = /^[a-z_]{1,60}$/.test(String(body?.name || "")) ? body.name : "";
      return {
        ok: false,
        retryable: response.status >= 500 || RETRYABLE_NAMES.has(name),
        detail: `Provider error ${response.status}${name ? ` (${name})` : ""}.`,
      };
    },
  };
}
