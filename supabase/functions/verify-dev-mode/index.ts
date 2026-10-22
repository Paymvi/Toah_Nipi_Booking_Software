/*
  verify-dev-mode
  ---------------------------------------------------------------------------
  Checks a Dev Mode password submitted from the staff dashboard.

  The real password lives only in the DEV_MODE_PASSWORD function secret:

    supabase secrets set DEV_MODE_PASSWORD=...

  The password is never returned. The response is only { valid: boolean }.

  Only signed-in users can call this, so anonymous visitors cannot
  guess passwords against it.

  Note: Dev Mode only shows or hides dashboard buttons. It does not
  grant any database permissions.
  ---------------------------------------------------------------------------
*/

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

/*
  Compare fixed-length hashes so the check takes the same time
  no matter how much of the password is correct.
*/
async function passwordsMatch(submitted: string, expected: string) {
  const [a, b] = await Promise.all([sha256(submitted), sha256(expected)]);

  let difference = 0;

  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }

  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const expectedPassword = Deno.env.get("DEV_MODE_PASSWORD");

  if (!expectedPassword) {
    console.error("DEV_MODE_PASSWORD secret is not set.");
    return jsonResponse({ error: "Dev Mode is not configured." }, 500);
  }

  // Require a signed-in user
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return jsonResponse({ error: "Not signed in." }, 401);
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const submittedPassword = String(body?.password ?? "").slice(0, 200);

  const valid =
    submittedPassword.length > 0 &&
    (await passwordsMatch(submittedPassword, expectedPassword));

  if (!valid) {
    // Small delay to slow down repeated guessing
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  return jsonResponse({ valid });
});
