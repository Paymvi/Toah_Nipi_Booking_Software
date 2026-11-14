/*
  Staff app Orders: labels, progress text and form checks
  (src/pages/StaffOrders.jsx). The database functions in
  supabase/migrations/20261114000100_staff_orders.sql repeat every check;
  these exist so the form can say what is missing before sending.
*/

export const ORDER_DEPARTMENTS = [
  { key: "kitchen", label: "Kitchen" },
  { key: "turnover", label: "Turnover" },
  { key: "maintenance", label: "Maintenance" },
  { key: "other", label: "Other" },
];

export const DEPARTMENT_LABELS = Object.fromEntries(ORDER_DEPARTMENTS.map(({ key, label }) => [key, label]));

// The symbol keeps the status readable without colour.
export const ORDER_STATUSES = {
  requested: { label: "Requested", symbol: "○" },
  ordered: { label: "Ordered", symbol: "◐" },
  received: { label: "Received", symbol: "●" },
  cancelled: { label: "Cancelled", symbol: "✕" },
};

export const LIMITS = { items: 30, name: 120, quantity: 40, notes: 1000, link: 500, note: 300, actor: 80 };

// "2 of 3 received · 1 ordered" for requests that are part way; "" when every item shares one status.
export function orderProgress(request) {
  const items = (request?.items || []).filter((item) => item.status !== "cancelled");
  const count = (status) => items.filter((item) => item.status === status).length;
  if (!items.length || items.every((item) => item.status === items[0].status)) return "";
  const parts = [];
  if (count("received")) parts.push(`${count("received")} of ${items.length} received`);
  if (count("ordered")) parts.push(`${count("ordered")} ordered`);
  if (count("requested")) parts.push(`${count("requested")} not ordered yet`);
  return parts.join(" · ");
}

// Unprocessed: nothing has moved past Requested, so the requester may still edit or cancel.
export function isUnprocessed(request) {
  return (request?.items || []).every((item) => item.status === "requested");
}

export function isWebLink(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

export function emptyOrderItem() {
  return { key: Math.random().toString(36).slice(2), name: "", quantity: "" };
}

// A v4 id. randomUUID needs a secure page (https or localhost); the fallback covers a phone on plain http.
export function newOrderId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/*
  Returns { errors: { field: message }, items: [{ name, quantity }] }.
  Fully blank item rows are dropped, so an extra empty row never blocks sending.
  Error keys: department, items, item-<index>-name, item-<index>-quantity, productLink, notes, actorName.
*/
export function checkOrderForm(form, { nameRequired = false } = {}) {
  const errors = {};
  const rows = (form.items || []).map((item, index) => ({ index, name: String(item.name || "").trim(), quantity: String(item.quantity || "").trim() }));
  const filled = rows.filter((row) => row.name || row.quantity);

  if (!filled.length) errors.items = "Add at least one item.";
  if (filled.length > LIMITS.items) errors.items = `A request can hold up to ${LIMITS.items} items.`;
  for (const row of filled) {
    if (!row.name) errors[`item-${row.index}-name`] = "What is needed?";
    else if (row.name.length > LIMITS.name) errors[`item-${row.index}-name`] = `Up to ${LIMITS.name} characters.`;
    if (!row.quantity) errors[`item-${row.index}-quantity`] = "How many?";
    else if (row.quantity.length > LIMITS.quantity) errors[`item-${row.index}-quantity`] = `Up to ${LIMITS.quantity} characters.`;
  }
  if (!DEPARTMENT_LABELS[form.department]) errors.department = "Choose a department.";
  const link = String(form.productLink || "").trim();
  if (link && (!isWebLink(link) || link.length > LIMITS.link)) errors.productLink = "Paste a full web address starting with https://";
  if (String(form.notes || "").trim().length > LIMITS.notes) errors.notes = `Notes are limited to ${LIMITS.notes} characters.`;
  if (nameRequired && !String(form.actorName || "").trim()) errors.actorName = "Enter your name.";

  return { errors, items: filled.map(({ name, quantity }) => ({ name, quantity })) };
}
