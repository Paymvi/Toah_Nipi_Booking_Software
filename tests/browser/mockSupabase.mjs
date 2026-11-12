// Local stand-in for Supabase, fictional rows only. Records every attempted change; /__ctl sets the scene.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT || 54419);

const day = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const item = (id, booking_id, title, status, extra = {}) => ({
  id, booking_id, title, status, item_id: id, required: true, due_date: null, guest_action: "mark_ready", uploaded_file_name: null,
  uploaded_file_path: null, uploaded_file_mime: null, uploaded_file_size: null, response_text: null, last_changed_at: "2026-10-01T00:00:00Z",
  sort_order: 1, email_assign: false, email_reminders: [], email_changes: false, ...extra,
});

const base = { updated_at: "2026-10-01T00:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z", waitlist: "No", raw_data: {}, portal_checklist_items: [], portal_documents: [] };

function seed() {
  return [
    { ...base, id: "b1", source_type: "Staff Booking", status: "Confirmed", organization_name: "Community Bible Church", portal_token: "token-b1-fictional",
      contact_name: "Jordan Smith", email: "jordan@example.org", phone: "555-010-0001", start_date: day(3), end_date: day(5), attendee_count: "45", retreat_type: "Church",
      portal_checklist_items: [
        item("t1", "b1", "Sign and return contract", "completed", { guest_action: "upload_file", uploaded_file_name: "c.pdf", uploaded_file_path: "token/c.pdf", sort_order: 1 }),
        item("t2", "b1", "Submit Certificate of Insurance", "needsReview", { guest_action: "upload_file", uploaded_file_name: "i.pdf", uploaded_file_path: "token/i.pdf", due_date: day(1), sort_order: 2 }),
        item("t3", "b1", "Confirm final guest counts (full-time, part-time, Day Use)", "needsReview", { item_id: "guest-count", response_text: "40 full-time", sort_order: 3 }),
        item("t4", "b1", "Submit Schedule", "waitingOnGuest", { guest_action: "upload_file", due_date: day(2), sort_order: 4 }),
        item("t5", "b1", "Pay deposit", "notStarted", { guest_action: "none", sort_order: 5 }),
        item("t6", "b1", "Pay balance on retreat", "notStarted", { guest_action: "none", sort_order: 6 }),
      ],
      portal_documents: [{ id: "d1", booking_id: "b1", title: "Toah Nipi Campus Map", document_type: "Map", file_name: "TN Campus Map.pdf", note: null, status: "ready", uploaded_by_guest: false, email_assign: false, last_changed_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }],
    },
    { ...base, id: "b2", source_type: "Master", source_sheet: "Master 2026", source_row_number: "12", status: "Confirmed", organization_name: "Grace Fellowship Youth", portal_token: "token-b2-fictional",
      contact_name: "Ava Lee", email: "ava@example.org", phone: "555-010-0002", start_date: day(20), end_date: day(22), attendee_count: "60", retreat_type: "Church - Youth" },
    { ...base, id: "b3", source_type: "Master", source_sheet: "Master 2026", source_row_number: "13", status: "Confirmed", organization_name: "Lakeside Women's Retreat", portal_token: "token-b3-fictional",
      contact_name: "Mia Chen", email: "mia@example.org", phone: "555-010-0003", start_date: day(40), end_date: day(42), attendee_count: "30", retreat_type: "Personal Retreat - Women",
      portal_checklist_items: [item("t9", "b3", "Sign and return contract", "completed", { guest_action: "upload_file", uploaded_file_name: "l.pdf", uploaded_file_path: "token/l.pdf" })] },
  ];
}

let bookings = seed(), role = "staff", delay = 0, emailMissing = false, writes = [];
let signing = null;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,PUT,OPTIONS", "access-control-expose-headers": "content-range", ...headers,
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const allItems = () => bookings.flatMap((booking) => booking.portal_checklist_items);
const allDocuments = () => bookings.flatMap((booking) => booking.portal_documents);
const forBooking = (rows, url) => rows.filter((row) => `eq.${row.booking_id}` === url.searchParams.get("booking_id"));
const preview = (subject) => ({ subject, html: "<p>Mock preview</p>" });
const readiness = { providerReady: false, liveEnabled: false, testAllowlist: [], problems: ["Mock."] };

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.method === "OPTIONS") return send(res, 204);
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const path = url.pathname;

    if (path === "/__ctl") {
      const p = url.searchParams;
      if (p.get("reset")) { bookings = seed(); role = "staff"; delay = 0; emailMissing = false; writes = []; signing = null; }
      if (p.has("signing")) {
        signing = p.get("signing");
        bookings[0].portal_documents[0].storage_path = signing === "noPdf" ? null : "fictional/staff-documents/sample.pdf";
      }
      if (p.get("empty")) bookings = [];
      if (p.get("noportal")) bookings = bookings.map((booking) => ({ ...booking, portal_checklist_items: [], portal_documents: [] }));
      if (p.get("emailMissing")) emailMissing = true;
      if (p.get("role")) role = p.get("role");
      if (p.get("delay")) delay = Number(p.get("delay"));
      if (p.get("clearWrites")) writes = [];
      return send(res, 200, { writes });
    }

    if (path === "/rest/v1/rpc/current_staff_role") return send(res, 200, role);

    const action = path === "/functions/v1/portal-email" ? JSON.parse(body || "{}").action : "";
    const isRead = req.method === "GET" || path.startsWith("/auth/") || ["status", "overview"].includes(action) || path.startsWith("/storage/v1/object/sign/");
    if (!isRead) writes.push(`${req.method} ${path}${url.search} ${action || body.slice(0, 120)}`);

    if (path === "/functions/v1/portal-email") {
      if (action === "status") return send(res, 200, { readiness });
      if (action === "overview") return send(res, 200, { complete: false, upcoming: [], automationBlock: "automatic emails are off.", previews: { welcome: preview("Welcome"), reminder: preview("Reminder") }, readiness });
      return send(res, 200, { results: [] });
    }
    if (path.startsWith("/storage/v1/object/sign/")) return send(res, 200, { signedURL: "/mock-file.pdf" });

    if (path === "/rest/v1/bookings" && req.method === "GET") {
      if (signing === "schema" && url.searchParams.get("select")?.includes("sign_document_id")) return send(res, 400, { code: "42703", message: "missing signing column" });
      const offset = Number(url.searchParams.get("offset") || 0);
      return setTimeout(() => send(res, 200, offset > 0 ? [] : bookings, { "content-range": `0-${Math.max(bookings.length - 1, 0)}/${bookings.length}` }), delay);
    }

    if (path === "/rest/v1/portal_signing_settings") {
      if (signing === "error") return send(res, 403, { code: "42501", message: "fictional denied" });
      return send(res, 200, signing ? { enabled: false, test_booking_ids: signing === "test" ? ["b1"] : [], agreement_approved: false } : null);
    }
    if (path === "/rest/v1/portal_checklist_items" && req.method === "PATCH" && signing) {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const row = allItems().find((item) => item.id === id);
      if (row) Object.assign(row, JSON.parse(body));
      return send(res, 200, row ? [{ id }] : []);
    }

    if (req.method === "GET" && path.startsWith("/rest/v1/portal_email")) {
      if (emailMissing) return send(res, 404, { code: "PGRST205", message: "missing" });
      const single = String(req.headers.accept || "").includes("vnd.pgrst.object");
      if (path.endsWith("portal_email_settings")) {
        const settings = { id: 1, mode: "test", automation_enabled: false, mode_epoch: 2, live_cap_per_day: 20 };
        return send(res, 200, single ? settings : [settings]);
      }
      if (path.endsWith("portal_email_templates")) {
        return send(res, 200, [{ key: "welcome", subject: "Hi", body: "Hello", updated_at: "x" }, { key: "update", subject: "News", body: "Hello", updated_at: "x" }]);
      }
      if (single) return send(res, 406, { code: "PGRST116", message: "no rows" });
      return send(res, 200, []);
    }
    if (req.method === "GET" && path === "/rest/v1/portal_checklist_items") return send(res, 200, forBooking(allItems(), url));
    if (req.method === "GET" && path === "/rest/v1/portal_documents") return send(res, 200, forBooking(allDocuments(), url));

    if (path.startsWith("/rest/v1/")) return send(res, 200, req.method === "GET" ? [] : []);
    if (path.startsWith("/auth/v1/user")) return send(res, 200, { id: "u1", email: "staff@example.org", aud: "authenticated" });
    return send(res, 200, {});
  });
}).listen(PORT, () => console.log(`mock supabase on ${PORT}`));
