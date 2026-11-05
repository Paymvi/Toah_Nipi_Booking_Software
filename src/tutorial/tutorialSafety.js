/*
  Last line of defence for portal tutorials, under the click guard: every
  Supabase request passes through guardedFetch (lib/supabaseClient.js), and
  while a lock is on, anything that could change data or send email is
  refused before it leaves the browser.

  "practice": real screens. Staff may still read, including the two
              read-only portal-email calls the email panel loads with and
              the signed link Open Upload uses.
  "demo":     fictional screens. Nothing but reads and sign-in upkeep.
*/

let writeLock = null;

const PRACTICE_EMAIL_READS = ["status", "overview"];

export function setTutorialWriteLock(level) {
  writeLock = level;
}

export function isRequestAllowed(url, method, body, level) {
  if (!level || method === "GET" || method === "HEAD") return true;

  const { pathname } = new URL(url);
  if (pathname.startsWith("/auth/v1/") || pathname === "/rest/v1/rpc/current_staff_role") return true;
  if (level !== "practice") return false;
  if (pathname.startsWith("/storage/v1/object/sign/")) return true;
  if (pathname !== "/functions/v1/portal-email") return false;

  try {
    return PRACTICE_EMAIL_READS.includes(JSON.parse(body).action);
  } catch {
    return false;
  }
}

export function guardedFetch(input, init) {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  const method = String(init?.method ?? input.method ?? "GET").toUpperCase();

  if (isRequestAllowed(url, method, init?.body, writeLock)) return fetch(input, init);
  return Promise.reject(new Error("Blocked by the tutorial: nothing is saved or sent while it runs."));
}
