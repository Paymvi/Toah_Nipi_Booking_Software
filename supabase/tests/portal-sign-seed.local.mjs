// Seeds FICTIONAL bookings into a LOCAL Supabase stack for clicking through
// online signing in both apps. See docs/portal-signing/SETUP.md.
//
//   LOCAL_SUPABASE_URL=... LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... node supabase/tests/portal-sign-seed.local.mjs
//
// Prints a staff login and one portal link per booking. Local only.
import { createClient } from "@supabase/supabase-js";

import { AGREEMENT_VERSION } from "../functions/portal-sign/signing.js";
import { sampleContract, samplePolicyA4 } from "../../tests/fixtures/signingFixtures.js";

const url = process.env.LOCAL_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !process.env.LOCAL_SERVICE_ROLE_KEY || !process.env.LOCAL_ANON_KEY) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL (http://127.0.0.1:<port>), LOCAL_ANON_KEY and LOCAL_SERVICE_ROLE_KEY.");
  process.exit(2);
}
// LOCAL_SEEDER_KEY: fixture role; the stack's service_role has live grants and cannot write these tables.
const admin = createClient(url, process.env.LOCAL_SEEDER_KEY || process.env.LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authAdmin = createClient(url, process.env.LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36);

const email = "local-staff@example.test";
const password = "local-only-Staff-1!";
const { data: list } = await authAdmin.auth.admin.listUsers();
let user = list.users.find((candidate) => candidate.email === email);
if (!user) user = (await authAdmin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
await admin.from("staff_profiles").upsert({ user_id: user.id, email, full_name: "Local Staff (fictional)", role: "admin", is_active: true });

async function addDocument(bookingId, token, title, fileName, bytes) {
  const { data: document } = await admin
    .from("portal_documents")
    .insert({ booking_id: bookingId, title, document_type: "Staff Document", file_name: fileName, status: "ready", uploaded_by_guest: false })
    .select("id")
    .single();
  const storagePath = `${token}/staff-documents/${document.id}/${fileName}`;
  await admin.storage.from("portal-uploads").upload(storagePath, bytes, { contentType: "application/pdf" });
  await admin.from("portal_documents").update({ storage_path: storagePath }).eq("id", document.id);
  return document.id;
}

async function booking(label, { signed = false, enabled = true } = {}) {
  const id = `local-${label}-${run}`;
  const token = crypto.randomUUID().replaceAll("-", "");
  await admin.from("bookings").insert({
    id,
    portal_token: token,
    organization_name: `Fictional ${label} Fellowship`,
    contact_name: "Fictional Contact",
    email: "contact@example.test",
    status: "Confirmed",
    start_date: "2027-06-04",
    end_date: "2027-06-06",
    attendee_count: "24",
  });
  const contract = await addDocument(id, token, "Sample Agreement (fictional)", "SAMPLE-AGREEMENT-NOT-A-REAL-CONTRACT.pdf", await sampleContract());
  await addDocument(id, token, "Sample House Rules (fictional)", "sample-house-rules.pdf", await samplePolicyA4());
  await admin.from("portal_checklist_items").insert([
    { booking_id: id, item_id: "contract", title: "Sign and return contract", status: "notStarted", required: true, guest_action: "upload_file", sort_order: 1, sign_document_id: contract, due_date: "2027-05-01" },
    { booking_id: id, item_id: "insurance", title: "Submit certificate of insurance", status: "notStarted", required: true, guest_action: "upload_file", sort_order: 2 },
  ]);
  if (enabled) {
    const { data: settings } = await admin.from("portal_signing_settings").select("test_booking_ids").single();
    await admin.from("portal_signing_settings").update({ test_booking_ids: [...settings.test_booking_ids, id] }).eq("id", true);
  }
  if (signed) {
    const call = async (body) =>
      (await fetch(`${url}/functions/v1/portal-sign`, { method: "POST", headers: { apikey: process.env.LOCAL_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify(body) })).json();
    const opened = await call({ action: "open", token, itemKey: "contract" });
    await call({
      action: "sign", token, itemKey: "contract", documentId: opened.document.id, documentSha256: opened.document.sha256,
      requestKey: crypto.randomUUID(), agreementVersion: AGREEMENT_VERSION, agreed: true, signerName: "Jordan Fictional",
      signerTitle: "Retreat coordinator", organizationName: `Fictional ${label} Fellowship`, signsForOrganization: true,
      authorityConfirmed: true, signatureType: "typed",
    });
  }
  console.log(`${label.padEnd(10)} portal link: http://127.0.0.1:5311/?portal=${token}`);
}

console.log(`Staff login (local only): ${email} / ${password}\n`);
await booking("ready");
await booking("signed", { signed: true });
await booking("off", { enabled: false });
console.log("\n'ready' can be signed, 'signed' waits for staff review, 'off' shows paper upload only.");
