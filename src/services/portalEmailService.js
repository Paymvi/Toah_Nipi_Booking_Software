import { supabase } from "../lib/supabaseClient";

/*
  Portal Admin's access to guest portal emails.

  Reads and the plain staff edits (recipients, item email options,
  settings and templates for admins) use the staff session and the
  database's access rules. Anything that can send email (enable, manual
  send, test send, retry) and previews go through the portal-email Edge
  Function, which applies the same safety checks as the scheduled job.
*/

const HISTORY_COLUMNS =
  "id, created_at, recipient, booking_id, booking_label, trigger, is_manual, mode, status, status_detail, subject, attempts, sent_at";

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export function isMissingEmailSetup(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

export async function callPortalEmail(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("portal-email", { body: { action, ...payload } });
  if (error) {
    let message = "";
    try {
      message = (await error.context?.json())?.error || "";
    } catch {
      // not a JSON error body
    }
    throw new Error(message || "The portal email service could not be reached. Has the portal-email function been deployed?");
  }
  return data;
}

export function newEmailRequestId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function loadEmailAdmin() {
  const [settings, templates] = await Promise.all([
    supabase.from("portal_email_settings").select("*").eq("id", 1).maybeSingle().then(check),
    supabase.from("portal_email_templates").select("key, subject, body, updated_at").then(check),
  ]);
  return { settings, templates: Object.fromEntries((templates || []).map((template) => [template.key, template])) };
}

export async function loadEmailHistory({ bookingId = null, limit = 25 } = {}) {
  let query = supabase.from("portal_email_messages").select(HISTORY_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (bookingId) query = query.eq("booking_id", bookingId);
  return check(await query) || [];
}

export async function loadBookingEmailState(bookingId) {
  const [automation, recipients, items, documents, history] = await Promise.all([
    supabase.from("portal_email_bookings").select("*").eq("booking_id", bookingId).maybeSingle().then(check),
    supabase.from("portal_email_recipients").select("id, email, selected, added_by_staff").eq("booking_id", bookingId).order("email").then(check),
    supabase
      .from("portal_checklist_items")
      .select("id, title, status, guest_action, due_date, sort_order, email_assign, email_reminders, email_changes")
      .eq("booking_id", bookingId)
      .order("sort_order")
      .then(check),
    supabase.from("portal_documents").select("id, title, uploaded_by_guest, email_assign").eq("booking_id", bookingId).then(check),
    loadEmailHistory({ bookingId, limit: 30 }),
  ]);
  return { automation, recipients: recipients || [], items: items || [], documents: documents || [], history };
}

/*
  Saves recipient choices. Contact addresses are stored only once staff
  select them; bookings.email is never changed.
*/
export async function saveEmailRecipients(bookingId, savedRows, draftRows) {
  const saved = new Map(savedRows.map((row) => [row.email, row]));
  const draft = new Set(draftRows.map((row) => row.email));

  for (const row of savedRows) {
    if (!draft.has(row.email)) {
      check(await supabase.from("portal_email_recipients").delete().eq("id", row.id));
    }
  }
  for (const row of draftRows) {
    const existing = saved.get(row.email);
    if (existing) {
      if (existing.selected !== row.selected) {
        check(await supabase.from("portal_email_recipients").update({ selected: row.selected }).eq("id", existing.id));
      }
    } else if (row.selected || row.addedByStaff) {
      check(
        await supabase
          .from("portal_email_recipients")
          .insert({ booking_id: bookingId, email: row.email, selected: row.selected, added_by_staff: row.addedByStaff })
      );
    }
  }
}

const sameList = (a = [], b = []) => [...a].sort().join() === [...b].sort().join();

export async function saveItemEmailOptions(savedItems, savedDocuments, options) {
  for (const item of savedItems) {
    const next = options[`task:${item.id}`];
    if (
      next &&
      (next.email_assign !== item.email_assign ||
        next.email_changes !== item.email_changes ||
        !sameList(next.email_reminders, item.email_reminders))
    ) {
      check(
        await supabase
          .from("portal_checklist_items")
          .update({ email_assign: next.email_assign, email_changes: next.email_changes, email_reminders: next.email_reminders })
          .eq("id", item.id)
          .select("id")
      );
    }
  }
  for (const document of savedDocuments) {
    const next = options[`document:${document.id}`];
    if (next && next.email_assign !== document.email_assign) {
      check(await supabase.from("portal_documents").update({ email_assign: next.email_assign }).eq("id", document.id).select("id"));
    }
  }
}

// Admins only (enforced by the database). Rows updated = 0 means no permission.
export async function updateEmailSettings(changes) {
  const rows = check(await supabase.from("portal_email_settings").update(changes).eq("id", 1).select("*"));
  if (!rows?.length) throw new Error("Only staff admins can change email settings.");
  return rows[0];
}

export async function saveEmailTemplate(key, subject, body) {
  const rows = check(await supabase.from("portal_email_templates").update({ subject, body }).eq("key", key).select("key"));
  if (!rows?.length) throw new Error("Only staff admins can edit email templates.");
}
