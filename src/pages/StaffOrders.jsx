/*
  Staff app Orders: staff ask for supplies or equipment, purchasing tracks
  each item (Requested → Ordered → Received, or Cancelled). Recording a
  request buys nothing.

  The database functions decide who may do what
  (supabase/migrations/20261114000100_staff_orders.sql); this screen only
  hides buttons that would be refused. Data lives in React state, loaded and
  refreshed by StaffApp.jsx (useStaffData).
*/
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaExternalLinkAlt, FaPlus, FaTimes } from "react-icons/fa";

import { Chip, LoadProblem } from "../components/StaffAppParts";
import { saveStaffOrder, setStaffOrderStatus } from "../services/staffAppService";
import { formatWhen, relativeDayLabel } from "../utils/staffAppFormat";
import {
  DEPARTMENT_LABELS,
  LIMITS,
  ORDER_DEPARTMENTS,
  ORDER_STATUSES,
  checkOrderForm,
  emptyOrderItem,
  isUnprocessed,
  itemsSummary,
  newOrderId,
  orderProgress,
} from "../utils/staffOrders";

// Office accounts may be the shared login, so the person's name is asked once per device (like "Working as").
const NAME_STORAGE_KEY = "toahNipiStaffOrdersName";

function readSavedName() {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveName(value) {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, value);
  } catch {
    // Private mode: the name just is not remembered.
  }
}

function StatusChip({ status }) {
  const info = ORDER_STATUSES[status] || ORDER_STATUSES.requested;
  return (
    <span className={`sa-chip sa-order-status sa-order-status-${status}`}>
      <span aria-hidden="true">{info.symbol}</span> {info.label}
    </span>
  );
}

function NameField({ value, onChange, error, id = "sa-order-actor" }) {
  return (
    <div className="sa-field sa-order-name">
      <label htmlFor={id}>Your name</label>
      <input
        id={id}
        value={value}
        maxLength={LIMITS.actor}
        autoComplete="name"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          onChange(event.target.value);
          saveName(event.target.value.trim());
        }}
      />
      <span id={`${id}-help`} className="sa-field-help">
        {error || "This sign-in can be shared, so requests and updates record the name you enter. Remembered on this device."}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------
   List
--------------------------------------------------------- */

const STATUS_FILTERS = {
  active: [
    ["", "All open"],
    ["requested", "Not ordered yet"],
    ["ordered", "Ordered"],
  ],
  history: [
    ["", "All finished"],
    ["received", "Received"],
    ["cancelled", "Cancelled"],
  ],
};

function neededByText(dateKey, todayKey, open) {
  const label = relativeDayLabel(dateKey, todayKey);
  const day = /^(Today|Tomorrow|Yesterday)$/.test(label) ? label.toLowerCase() : label;
  return `needed by ${day}${open && dateKey < todayKey ? " (date passed)" : ""}`;
}

function lastChange(item, todayKey) {
  if (!item.changedAt) return "";
  return `${ORDER_STATUSES[item.status]?.label || item.status} by ${item.changedBy || "not recorded"} · ${formatWhen(item.changedAt, todayKey)}`;
}

function eventText(event) {
  if (event.action === "requested") return "Requested";
  if (event.action === "edited") return "Edited";
  return `${event.itemName}: ${ORDER_STATUSES[event.status]?.label || event.status}`;
}

function PurchasePanel({ request, selected, onSelected, actorName, nameRequired, onSaved }) {
  const open = request.items.filter((item) => !["received", "cancelled"].includes(item.status));
  const [status, setStatus] = useState(() => (open.some((item) => item.status === "requested") ? "ordered" : "received"));
  const [note, setNote] = useState("");  // the panel remounts after each save (OrderDetails key)
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const busyRef = useRef(false);

  const count = selected.length;
  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (!count) return setMessage({ tone: "error", text: "Tick at least one item above." });
    if (nameRequired && !actorName.trim()) return setMessage({ tone: "error", text: "Enter your name at the top of the page first." });
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await setStaffOrderStatus(selected, status, note, actorName);
      onSaved(`Saved: ${count} item${count === 1 ? "" : "s"} marked ${ORDER_STATUSES[status].label.toLowerCase()}.`);
    } catch (error) {
      setMessage({ tone: "error", text: `Not saved. ${error.message}` });
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <form className="sa-order-panel" onSubmit={submit} aria-label="Update item status">
      <h4>Update the ticked items</h4>
      <div className="sa-choice-row" role="radiogroup" aria-label="New status">
        {Object.entries(ORDER_STATUSES).map(([key, info]) => (
          <label key={key} className={`sa-choice${status === key ? " is-selected" : ""}`}>
            <input type="radio" name={`status-${request.id}`} value={key} checked={status === key} onChange={() => setStatus(key)} />
            <span aria-hidden="true">{info.symbol}</span> {info.label}
          </label>
        ))}
      </div>
      <div className="sa-field">
        <label htmlFor={`note-${request.id}`}>Note (optional)</label>
        <input id={`note-${request.id}`} value={note} maxLength={LIMITS.note} placeholder="e.g. Arrives Tuesday, Sysco" onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="sa-form-actions">
        <button type="submit" className="sa-button" disabled={busy}>
          {busy ? "Saving…" : `Mark ${count} item${count === 1 ? "" : "s"} ${ORDER_STATUSES[status].label.toLowerCase()}`}
        </button>
        {count < request.items.length && (
          <button type="button" className="sa-link-button" onClick={() => onSelected(request.items.map((item) => item.id))}>
            Tick all
          </button>
        )}
      </div>
      {message && (
        <p className={`sa-form-message sa-form-message-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </form>
  );
}

function CancelOwnRequest({ request, actorName, nameRequired, onSaved }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const cancel = async () => {
    if (busyRef.current) return;
    if (nameRequired && !actorName.trim()) return setError("Enter your name at the top of the page first.");
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await setStaffOrderStatus(request.items.map((item) => item.id), "cancelled", "Cancelled by the requester", actorName);
      onSaved("Request cancelled.");
    } catch (problem) {
      setError(`Not cancelled. ${problem.message}`);
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      {confirming ? (
        <span className="sa-confirm" role="group" aria-label="Confirm cancelling">
          <span>Cancel this whole request?</span>
          <button type="button" className="sa-button sa-button-danger" onClick={cancel} disabled={busy}>
            {busy ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button type="button" className="sa-button sa-button-quiet" onClick={() => setConfirming(false)} disabled={busy}>
            Keep it
          </button>
        </span>
      ) : (
        <button type="button" className="sa-button sa-button-quiet" onClick={() => setConfirming(true)}>
          Cancel request
        </button>
      )}
      {error && <p className="sa-form-message sa-form-message-error" role="alert">{error}</p>}
    </>
  );
}

function OrderDetails({ request, data, todayKey, actorName, notice, onSaved }) {
  const purchaser = data.canPurchase;
  const editable = data.canRequest && isUnprocessed(request) && (request.mine || purchaser);
  const [selected, setSelected] = useState(() =>
    request.items.filter((item) => !["received", "cancelled"].includes(item.status)).map((item) => item.id)
  );
  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <div className="sa-order-detail" id={`order-${request.id}`}>
      {notice && <p className="sa-form-message sa-form-message-ok" role="status">{notice}</p>}
      <ul className="sa-order-items" aria-label="Items">
        {request.items.map((item) => {
          const body = (
            <>
              <span className="sa-order-item-main">
                <strong>{item.name}</strong> <span className="sa-order-qty">× {item.quantity}</span>
                {item.changedAt && <span className="sa-order-item-sub">{lastChange(item, todayKey)}</span>}
                {item.note && <span className="sa-order-item-sub sa-prewrap">“{item.note}”</span>}
              </span>
              <StatusChip status={item.status} />
            </>
          );
          return (
            <li key={item.id}>
              {purchaser ? (
                <label className="sa-order-item is-checkable">
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`} />
                  {body}
                </label>
              ) : (
                <div className="sa-order-item">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="sa-order-facts">
        <div>
          <dt>Requested</dt>
          <dd>{request.requestedByName} · {formatWhen(request.requestedAt, todayKey)}</dd>
        </div>
        <div>
          <dt>Needed by</dt>
          <dd>{request.neededBy ? relativeDayLabel(request.neededBy, todayKey) : "No date given"}</dd>
        </div>
        {request.notes && (
          <div className="sa-order-wide">
            <dt>Notes</dt>
            <dd className="sa-prewrap">{request.notes}</dd>
          </div>
        )}
        {request.productLink && (
          <div className="sa-order-wide">
            <dt>Product link</dt>
            <dd>
              <a href={request.productLink} target="_blank" rel="noopener noreferrer" className="sa-order-link">
                {request.productLink} <FaExternalLinkAlt aria-hidden="true" />
                <span className="sa-visually-hidden"> (opens in a new tab)</span>
              </a>
            </dd>
          </div>
        )}
      </dl>

      {purchaser && request.items.length > 0 && (
        <PurchasePanel
          request={request}
          selected={selected}
          onSelected={setSelected}
          actorName={actorName}
          nameRequired={data.nameRequired}
          onSaved={onSaved}
        />
      )}

      {editable && (
        <div className="sa-form-actions">
          <Link className="sa-button sa-button-quiet" to={`/staff/orders/${request.id}/edit`}>Edit request</Link>
          {request.mine && !purchaser && (
            <CancelOwnRequest request={request} actorName={actorName} nameRequired={data.nameRequired} onSaved={onSaved} />
          )}
        </div>
      )}
      {!editable && request.mine && !purchaser && request.status !== "cancelled" && request.status !== "received" && (
        <p className="sa-muted sa-small">Purchasing has started on this request, so it can no longer be edited here. Ask them for changes.</p>
      )}

      <details className="sa-order-history">
        <summary>History ({request.events.length})</summary>
        <ul>
          {request.events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <strong>{eventText(event)}</strong>
              <span className="sa-muted"> · {event.by || "not recorded"} · {formatWhen(event.at, todayKey)}</span>
              {event.note && <span className="sa-block sa-prewrap">“{event.note}”</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function OrderList({ state, todayKey, actorName, setActorName }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [openIds, setOpenIds] = useState(() => new Set(location.state?.openId ? [location.state.openId] : []));
  const view = searchParams.get("view") === "history" ? "history" : "active";
  const department = DEPARTMENT_LABELS[searchParams.get("dept")] ? searchParams.get("dept") : "";
  const statusOptions = STATUS_FILTERS[view];
  const status = statusOptions.some(([key]) => key && key === searchParams.get("status")) ? searchParams.get("status") : "";
  const flash = location.state?.flash || "";
  const [notice, setNotice] = useState(null); // { id, text } after a status change

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "view") next.delete("status");
    setSearchParams(next, { replace: true });
  };

  const data = state.data;
  const requests = (data?.requests || []).filter(
    (request) => (!department || request.department === department) && (!status || request.status === status)
  );
  const toggle = (id) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {flash && <p className="sa-form-message sa-form-message-ok" role="status">{flash}</p>}
      {notice && !requests.some((request) => request.id === notice.id) && (
        <p className="sa-form-message sa-form-message-ok" role="status">
          {notice.text} {view === "active" ? "That request is finished, so it is now under Finished." : ""}
        </p>
      )}

      <div className="sa-orders-top">
        {data?.canRequest !== false && (
          <Link className="sa-button sa-orders-new" to="/staff/orders/new">
            <FaPlus aria-hidden="true" /> New request
          </Link>
        )}
        {data?.nameRequired && <NameField value={actorName} onChange={setActorName} />}
      </div>

      <div className="sa-tabs" role="tablist" aria-label="Which requests">
        {[
          ["active", "Open"],
          ["history", "Finished"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`sa-tab${view === key ? " is-selected" : ""}`}
            onClick={() => setParam("view", key === "active" ? "" : key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sa-orders-filters">
        <label className="sa-field">
          <span>Department</span>
          <select value={department} onChange={(event) => setParam("dept", event.target.value)}>
            <option value="">All departments</option>
            {ORDER_DEPARTMENTS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="sa-field">
          <span>Status</span>
          <select value={status} onChange={(event) => setParam("status", event.target.value)}>
            {statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>

      <LoadProblem state={state} />
      {!data ? (
        state.error ? null : <p className="sa-empty">Loading…</p>
      ) : requests.length ? (
        <ul className="sa-list sa-orders" aria-label={view === "history" ? "Finished requests" : "Open requests"}>
          {requests.map((request) => {
            const isOpen = openIds.has(request.id);
            const progress = orderProgress(request);
            return (
              <li key={request.id} className={`sa-order${request.urgent && view === "active" ? " is-urgent" : ""}`}>
                <button type="button" className="sa-order-summary" aria-expanded={isOpen} aria-controls={`order-${request.id}`} onClick={() => toggle(request.id)}>
                  <span className="sa-row-main">
                    <span className="sa-row-title">
                      {request.urgent && <Chip tone="urgent">Urgent</Chip>}
                      <span>{itemsSummary(request)}</span>
                    </span>
                    <span className="sa-row-sub">
                      {DEPARTMENT_LABELS[request.department]} · {request.requestedByName}
                      {request.neededBy ? ` · ${neededByText(request.neededBy, todayKey, view === "active")}` : ""}
                    </span>
                    {progress && <span className="sa-row-sub sa-order-progress">{progress}</span>}
                  </span>
                  <StatusChip status={request.status} />
                </button>
                {isOpen && (
                  <OrderDetails
                    key={request.updatedAt}
                    request={request}
                    data={data}
                    todayKey={todayKey}
                    actorName={actorName}
                    notice={notice?.id === request.id ? notice.text : ""}
                    onSaved={(text) => {
                      setNotice({ id: request.id, text });
                      state.refresh();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sa-empty">
          {data.requests.length
            ? "No requests match these filters."
            : view === "history"
              ? "No finished requests yet. Received and cancelled requests appear here."
              : "No open requests. Use New request to ask for supplies or equipment."}
        </p>
      )}
    </>
  );
}

/* ---------------------------------------------------------
   New / edit form
--------------------------------------------------------- */

function OrderForm({ initial, isEdit, nameRequired, actorName, setActorName, onDone }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const focusKey = useRef("");

  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(focusKey.current)?.focus();
    focusKey.current = "";
  });

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const updateItem = (key, patch) => update({ items: form.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  const addItem = () => {
    const item = emptyOrderItem();
    focusKey.current = `item-${item.key}-name`;
    update({ items: [...form.items, item] });
  };
  const removeItem = (key) => update({ items: form.items.filter((item) => item.key !== key) });

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    const result = checkOrderForm({ ...form, actorName }, { nameRequired });
    setErrors(result.errors);
    const first = Object.keys(result.errors)[0];
    if (first) {
      setProblem("Check the highlighted fields.");
      const match = first.match(/^item-(\d+)-(name|quantity)$/);
      const target = match ? `item-${form.items[Number(match[1])].key}-${match[2]}` : first === "items" ? `item-${form.items[0]?.key}-name` : `sa-order-${first}`;
      document.getElementById(target)?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setProblem("");
    try {
      const saved = await saveStaffOrder({ ...form, items: result.items }, actorName);
      onDone(isEdit ? "Changes saved." : "Request sent. Purchasing can see it now.", saved?.id);
    } catch (error) {
      // Input stays as typed; the id stays too, so sending again cannot make a duplicate.
      setProblem(`Not sent. ${error.message}${error.kind === "network" ? " Your request is still here; try again when you have signal." : ""}`);
      busyRef.current = false;
      setBusy(false);
    }
  };

  const itemError = (index, field) => errors[`item-${index}-${field}`];

  return (
    <form className="sa-order-form" onSubmit={submit} noValidate>
      <fieldset className="sa-card sa-order-form-items">
        <legend>What do you need?</legend>
        {errors.items && <p className="sa-field-error" role="alert">{errors.items}</p>}
        <ol>
          {form.items.map((item, index) => (
            <li key={item.key} className="sa-item-row">
              <div className="sa-field">
                <label htmlFor={`item-${item.key}-name`}>Item {form.items.length > 1 ? index + 1 : ""}</label>
                <input
                  id={`item-${item.key}-name`}
                  value={item.name}
                  maxLength={LIMITS.name}
                  placeholder="e.g. Dish soap"
                  aria-invalid={itemError(index, "name") ? "true" : undefined}
                  onChange={(event) => updateItem(item.key, { name: event.target.value })}
                />
                {itemError(index, "name") && <span className="sa-field-error">{itemError(index, "name")}</span>}
              </div>
              <div className="sa-field sa-item-qty">
                <label htmlFor={`item-${item.key}-quantity`}>How many</label>
                <input
                  id={`item-${item.key}-quantity`}
                  value={item.quantity}
                  maxLength={LIMITS.quantity}
                  placeholder="e.g. 6 bottles"
                  aria-invalid={itemError(index, "quantity") ? "true" : undefined}
                  onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                />
                {itemError(index, "quantity") && <span className="sa-field-error">{itemError(index, "quantity")}</span>}
              </div>
              {form.items.length > 1 && (
                <button type="button" className="sa-icon-button sa-item-remove" onClick={() => removeItem(item.key)} aria-label={`Remove item ${index + 1}${item.name ? ` (${item.name})` : ""}`}>
                  <FaTimes aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {form.items.length < LIMITS.items && (
          <button type="button" className="sa-button sa-button-quiet" onClick={addItem}>
            <FaPlus aria-hidden="true" /> Add another item
          </button>
        )}
      </fieldset>

      <div className="sa-card sa-order-form-details">
        <fieldset className="sa-field">
          <legend>Department</legend>
          <div className="sa-choice-row" role="radiogroup" aria-label="Department" aria-invalid={errors.department ? "true" : undefined}>
            {ORDER_DEPARTMENTS.map(({ key, label }, index) => (
              <label key={key} className={`sa-choice${form.department === key ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="department"
                  value={key}
                  id={index === 0 ? "sa-order-department" : undefined}
                  checked={form.department === key}
                  onChange={() => update({ department: key })}
                />
                {label}
              </label>
            ))}
          </div>
          {errors.department && <span className="sa-field-error">{errors.department}</span>}
        </fieldset>

        <label className="sa-check sa-check-urgent">
          <input type="checkbox" checked={form.urgent} onChange={(event) => update({ urgent: event.target.checked })} />
          <span>
            <strong>Urgent</strong>
            <span className="sa-muted sa-block">Needed right away, for example to finish today's work.</span>
          </span>
        </label>

        <div className="sa-field">
          <label htmlFor="sa-order-neededBy">Needed by (optional)</label>
          <span className="sa-date-row">
            <input id="sa-order-neededBy" type="date" value={form.neededBy} onChange={(event) => update({ neededBy: event.target.value })} />
            {form.neededBy && <button type="button" className="sa-link-button" onClick={() => update({ neededBy: "" })}>Clear</button>}
          </span>
        </div>

        <div className="sa-field">
          <label htmlFor="sa-order-notes">Notes (optional)</label>
          <textarea
            id="sa-order-notes"
            rows={3}
            value={form.notes}
            maxLength={LIMITS.notes}
            placeholder="Size, preferred brand, or why it is needed"
            aria-invalid={errors.notes ? "true" : undefined}
            onChange={(event) => update({ notes: event.target.value })}
          />
          {errors.notes && <span className="sa-field-error">{errors.notes}</span>}
        </div>

        <div className="sa-field">
          <label htmlFor="sa-order-productLink">Product link (optional)</label>
          <input
            id="sa-order-productLink"
            type="url"
            inputMode="url"
            value={form.productLink}
            maxLength={LIMITS.link}
            placeholder="https://"
            aria-invalid={errors.productLink ? "true" : undefined}
            onChange={(event) => update({ productLink: event.target.value })}
          />
          {errors.productLink && <span className="sa-field-error">{errors.productLink}</span>}
        </div>

        {nameRequired && <NameField id="sa-order-actorName" value={actorName} onChange={setActorName} error={errors.actorName} />}
      </div>

      <div className="sa-order-form-submit">
        {problem && <p className="sa-form-message sa-form-message-error" role="alert">{problem}</p>}
        <div className="sa-form-actions">
          <button type="submit" className="sa-button sa-button-large" disabled={busy}>
            {busy ? "Sending…" : isEdit ? "Save changes" : "Send request"}
          </button>
          <Link className="sa-button sa-button-quiet" to="/staff/orders">Back</Link>
        </div>
        <p className="sa-muted sa-small">This records the request for purchasing. It does not buy anything.</p>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------
   Screen
--------------------------------------------------------- */

export default function StaffOrders({ me, state, todayKey }) {
  const { requestId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [actorName, setActorName] = useState(readSavedName);
  const isNew = location.pathname.replace(/\/$/, "").endsWith("/orders/new");
  const data = state.data;

  if (!isNew && !requestId) return <OrderList state={state} todayKey={todayKey} actorName={actorName} setActorName={setActorName} />;

  const back = (
    <Link className="sa-back" to="/staff/orders">
      <FaArrowLeft aria-hidden="true" /> All requests
    </Link>
  );
  const done = (message, id) => {
    state.refresh();
    navigate("/staff/orders", { state: { flash: message, openId: id } });
  };

  if (!data) return <>{back}{state.error ? <LoadProblem state={state} /> : <p className="sa-empty">Loading…</p>}</>;
  if (!data.canRequest) return <>{back}<p className="sa-empty">This account can see requests but cannot make or change them.</p></>;

  if (isNew) {
    const initial = {
      id: newOrderId(),
      department: me?.access === "limited" && (me.departments || []).includes("kitchen") ? "kitchen" : "",
      neededBy: "",
      notes: "",
      productLink: "",
      urgent: false,
      items: [emptyOrderItem()],
    };
    return (
      <>
        {back}
        <h2 className="sa-order-form-title">New request</h2>
        <OrderForm initial={initial} isEdit={false} nameRequired={data.nameRequired} actorName={actorName} setActorName={setActorName} onDone={done} />
      </>
    );
  }

  const request = data.requests.find((entry) => entry.id === requestId);
  if (!request || !isUnprocessed(request) || !(request.mine || data.canPurchase)) {
    return (
      <>
        {back}
        <p className="sa-empty">
          {!request
            ? "This request is not open any more. It may have been received or cancelled."
            : !isUnprocessed(request)
              ? "Purchasing has started on this request, so it can no longer be edited. Ask them for changes."
              : "You can only edit your own requests."}
        </p>
      </>
    );
  }
  const initial = {
    id: request.id,
    department: request.department,
    neededBy: request.neededBy || "",
    notes: request.notes,
    productLink: request.productLink,
    urgent: request.urgent,
    items: request.items.map((item) => ({ ...emptyOrderItem(), name: item.name, quantity: item.quantity })),
  };
  return (
    <>
      {back}
      <h2 className="sa-order-form-title">Edit request</h2>
      <p className="sa-muted">Requested by {request.requestedByName} · {formatWhen(request.requestedAt, todayKey)}</p>
      <OrderForm key={request.id} initial={initial} isEdit nameRequired={data.nameRequired} actorName={actorName} setActorName={setActorName} onDone={done} />
    </>
  );
}
