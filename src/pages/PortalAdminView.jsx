import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaKey,
  FaSyncAlt,
  FaTasks,
  FaExclamationTriangle,
  FaCheckCircle,
  FaCopy,
  FaExternalLinkAlt,
  FaClock,
} from "react-icons/fa";

import { supabase } from "../lib/supabaseClient";

import {
  formatDateRange,
} from "../utils/dateUtils";



function cleanPortalText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePortalChecklistItem(item) {
  return {
    id: item.id,
    itemId: item.item_id || "",
    title: item.title || "Untitled item",
    status: item.status || "notStarted",
    required: Boolean(item.required),
    dueDate: item.due_date || "",
    guestAction: item.guest_action || "none",
    uploadedFileName: item.uploaded_file_name || "",
    lastChangedAt: item.last_changed_at || "",
    sortOrder: item.sort_order || 0,
  };
}

function normalizePortalDocument(document) {
  return {
    id: document.id,
    title: document.title || "Untitled document",
    documentType: document.document_type || "Document",
    fileName: document.file_name || "",
    status: document.status || "ready",
    uploadedByGuest: Boolean(document.uploaded_by_guest),
    lastChangedAt: document.last_changed_at || document.created_at || "",
  };
}

function getPortalProgress(checklistItems = []) {
  const total = checklistItems.length;

  const completed = checklistItems.filter(
    (item) => item.status === "completed"
  ).length;

  const needsReview = checklistItems.filter(
    (item) => item.status === "needsReview"
  ).length;

  const waitingOnGuest = checklistItems.filter(
    (item) => item.status === "waitingOnGuest"
  ).length;

  const notStarted = checklistItems.filter(
    (item) => item.status === "notStarted"
  ).length;

  const open = waitingOnGuest + notStarted;

  const percent =
    total > 0 ? Math.round(((completed + needsReview) / total) * 100) : 0;

  return {
    total,
    completed,
    needsReview,
    waitingOnGuest,
    notStarted,
    open,
    percent,
  };
}

function normalizePortalOverviewRecord(row) {
  const checklistItems = Array.isArray(row.portal_checklist_items)
    ? row.portal_checklist_items
        .map(normalizePortalChecklistItem)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const documents = Array.isArray(row.portal_documents)
    ? row.portal_documents.map(normalizePortalDocument)
    : [];

  const progress = getPortalProgress(checklistItems);

  const guestUploads = documents.filter(
    (document) => document.uploadedByGuest
  ).length;

  return {
    id: row.id,
    portalToken: row.portal_token || "",

    organizationName: cleanPortalText(row.organization_name, "Unnamed Organization"),
    contactName: cleanPortalText(row.contact_name, "No contact name"),
    email: row.email || "",

    startDate: row.start_date || "",
    endDate: row.end_date || "",
    attendeeCount: row.attendee_count || "",
    status: row.status || "Inquiry",
    updatedAt: row.updated_at || "",

    checklistItems,
    documents,
    progress,
    guestUploads,
  };
}

async function fetchPortalOverviewRecords() {
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id,
      portal_token,
      organization_name,
      contact_name,
      email,
      start_date,
      end_date,
      attendee_count,
      status,
      updated_at,
      portal_checklist_items (
        id,
        item_id,
        title,
        status,
        required,
        due_date,
        guest_action,
        uploaded_file_name,
        last_changed_at,
        sort_order
      ),
      portal_documents (
        id,
        title,
        document_type,
        file_name,
        status,
        uploaded_by_guest,
        last_changed_at,
        created_at
      )
    `)
    .order("start_date", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(normalizePortalOverviewRecord);
}

function getPortalBaseUrl() {
  return (
    import.meta.env.VITE_GUEST_PORTAL_BASE_URL || "http://localhost:5173"
  ).replace(/\/$/, "");
}

function buildPortalUrl(portalToken) {
  if (!portalToken) {
    return "";
  }

  return `${getPortalBaseUrl()}/?portal=${portalToken}`;
}

function getPortalStatusLabel(record) {
  if (record.progress.total === 0) {
    return "No Checklist";
  }

  if (record.progress.needsReview > 0) {
    return "Needs Review";
  }

  if (record.progress.open > 0) {
    return "Waiting on Guest";
  }

  return "Complete";
}

function getPortalStatusClass(record) {
  if (record.progress.total === 0) {
    return "no-checklist";
  }

  if (record.progress.needsReview > 0) {
    return "needs-review";
  }

  if (record.progress.open > 0) {
    return "waiting";
  }

  return "complete";
}

function PortalAdminSummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}) {
  return (
    <article className={`portal-summary-tile portal-summary-tile-${tone}`}>
      <span className="portal-summary-tile-icon">
        <Icon />
      </span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper && <em>{helper}</em>}
      </div>
    </article>
  );
}

function PortalAdminProgressBar({ percent }) {
  return (
    <div className="portal-admin-progress-track">
      <div
        className="portal-admin-progress-fill"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PortalChecklistPreview({ items }) {
  if (items.length === 0) {
    return (
      <div className="portal-checklist-preview-empty">
        No portal checklist items yet.
      </div>
    );
  }

  return (
    <div className="portal-checklist-preview">
      {items.slice(0, 5).map((item) => (
        <div
          className={`portal-checklist-preview-row portal-item-${item.status}`}
          key={item.id}
        >
          <span></span>

          <div>
            <strong>{item.title}</strong>
            <small>
              {item.status === "needsReview"
                ? "Needs staff review"
                : item.status === "waitingOnGuest"
                  ? "Waiting on guest"
                  : item.status === "completed"
                    ? "Complete"
                    : "Not started"}
              {item.dueDate ? ` · Due ${item.dueDate}` : ""}
            </small>
          </div>
        </div>
      ))}

      {items.length > 5 && (
        <small className="portal-checklist-preview-more">
          +{items.length - 5} more item{items.length - 5 === 1 ? "" : "s"}
        </small>
      )}
    </div>
  );
}

function PortalRecordCard({
  record,
  copiedBookingId,
  onCopyPortalLink,
  onOpenBooking,
}) {
  const portalStatusLabel = getPortalStatusLabel(record);
  const portalStatusClass = getPortalStatusClass(record);
  const portalUrl = buildPortalUrl(record.portalToken);

  const guestLabel = record.attendeeCount
    ? `${record.attendeeCount} guest${record.attendeeCount === "1" ? "" : "s"}`
    : "No guest count";

  return (
    <article className={`portal-record-card portal-record-card-${portalStatusClass}`}>
      <div className="portal-record-main">
        <div className="portal-record-title-row">
          <div>
            <span className={`portal-record-status-pill ${portalStatusClass}`}>
              {portalStatusLabel}
            </span>

            <h3>{record.organizationName}</h3>

            <p>
              {formatDateRange(record.startDate, record.endDate)} · {guestLabel}
            </p>
          </div>

          <strong className="portal-record-progress-number">
            {record.progress.percent}%
          </strong>
        </div>

        <PortalAdminProgressBar percent={record.progress.percent} />

        <div className="portal-record-metrics">
          <span>
            <strong>{record.progress.completed}</strong>
            Complete
          </span>

          <span>
            <strong>{record.progress.needsReview}</strong>
            Review
          </span>

          <span>
            <strong>{record.progress.open}</strong>
            Open
          </span>

          <span>
            <strong>{record.documents.length}</strong>
            Docs
          </span>
        </div>

        <PortalChecklistPreview items={record.checklistItems} />
      </div>

      <aside className="portal-record-side">
        <div className="portal-record-contact">
          <small>Primary Contact</small>
          <strong>{record.contactName}</strong>
          <span>{record.email || "No email"}</span>
        </div>

        <div className="portal-record-token">
          <small>Portal Link</small>

          {record.portalToken ? (
            <code>{record.portalToken.slice(0, 10)}...</code>
          ) : (
            <em>No token</em>
          )}
        </div>

        <div className="portal-record-actions">
          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={() => onOpenBooking(record.id)}
          >
            Open Booking
          </button>

          <button
            className="secondary-dashboard-button"
            type="button"
            disabled={!portalUrl}
            onClick={() => onCopyPortalLink(record)}
          >
            <FaCopy />
            {copiedBookingId === record.id ? "Copied" : "Copy Link"}
          </button>

          <a
            className={`primary-dashboard-button ${!portalUrl ? "disabled" : ""}`}
            href={portalUrl || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!portalUrl}
          >
            <FaExternalLinkAlt />
            Open Portal
          </a>
        </div>
      </aside>
    </article>
  );
}

export default function PortalAdminView({ inquiryBookings, openBookingDetail }) {
  const [portalRecords, setPortalRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [portalError, setPortalError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedBookingId, setCopiedBookingId] = useState("");

  async function loadPortalRecords() {
    try {
      setIsLoading(true);
      setPortalError("");

      const records = await fetchPortalOverviewRecords();

      setPortalRecords(records);
    } catch (error) {
      console.error("Could not load portal overview:", error);
      setPortalError("Could not load portal information. Check the console.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPortalRecords();
  }, []);

  const summary = useMemo(() => {
    const total = portalRecords.length;

    const withChecklists = portalRecords.filter(
      (record) => record.progress.total > 0
    ).length;

    const needsReview = portalRecords.filter(
      (record) => record.progress.needsReview > 0
    ).length;

    const waitingOnGuest = portalRecords.filter(
      (record) =>
        record.progress.needsReview === 0 && record.progress.open > 0
    ).length;

    const complete = portalRecords.filter(
      (record) =>
        record.progress.total > 0 &&
        record.progress.completed === record.progress.total
    ).length;

    return {
      total,
      withChecklists,
      needsReview,
      waitingOnGuest,
      complete,
    };
  }, [portalRecords]);

  const filteredRecords = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return portalRecords
      .filter((record) => {
        if (!search) {
          return true;
        }

        return [
          record.organizationName,
          record.contactName,
          record.email,
          record.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .filter((record) => {
        if (statusFilter === "all") {
          return true;
        }

        if (statusFilter === "needsReview") {
          return record.progress.needsReview > 0;
        }

        if (statusFilter === "waiting") {
          return record.progress.needsReview === 0 && record.progress.open > 0;
        }

        if (statusFilter === "complete") {
          return (
            record.progress.total > 0 &&
            record.progress.completed === record.progress.total
          );
        }

        if (statusFilter === "noChecklist") {
          return record.progress.total === 0;
        }

        return true;
      })
      .sort((a, b) => {
        if (b.progress.needsReview !== a.progress.needsReview) {
          return b.progress.needsReview - a.progress.needsReview;
        }

        if (b.progress.open !== a.progress.open) {
          return b.progress.open - a.progress.open;
        }

        return String(a.startDate || "").localeCompare(
          String(b.startDate || "")
        );
      });
  }, [portalRecords, searchTerm, statusFilter]);

  async function handleCopyPortalLink(record) {
    const portalUrl = buildPortalUrl(record.portalToken);

    if (!portalUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopiedBookingId(record.id);

      window.setTimeout(() => {
        setCopiedBookingId("");
      }, 1600);
    } catch (error) {
      console.error("Could not copy portal link:", error);
      alert("Could not copy the portal link.");
    }
  }

  function handleOpenBooking(bookingId) {
    const booking = inquiryBookings.find((inquiry) => inquiry.id === bookingId);

    if (!booking) {
      alert("Could not find this booking in the current dashboard data.");
      return;
    }

    openBookingDetail(booking);
  }

  return (
    <section className="portal-admin-page">
      <article className="dashboard-card portal-admin-hero-card">
        <div className="portal-admin-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaKey />
            </span>

            <div>
              <p className="dashboard-eyebrow">Guest Portals</p>
              <h2>Portal Progress</h2>
              <span>
                Track each group&apos;s guest-facing checklist, documents, and review status.
              </span>
            </div>
          </div>

          <button
            className="secondary-dashboard-button"
            type="button"
            onClick={loadPortalRecords}
            disabled={isLoading}
          >
            <FaSyncAlt />
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="portal-summary-grid-admin">
          <PortalAdminSummaryCard
            icon={FaKey}
            label="Total Groups"
            value={summary.total}
            helper="Bookings loaded from Supabase"
          />

          <PortalAdminSummaryCard
            icon={FaTasks}
            label="With Checklists"
            value={summary.withChecklists}
            helper="Groups with portal tasks"
            tone="blue"
          />

          <PortalAdminSummaryCard
            icon={FaExclamationTriangle}
            label="Needs Review"
            value={summary.needsReview}
            helper="Guest submitted or staff review needed"
            tone="gold"
          />

          <PortalAdminSummaryCard
            icon={FaCheckCircle}
            label="Complete"
            value={summary.complete}
            helper="All checklist items complete"
            tone="green"
          />
        </div>
      </article>

      <article className="dashboard-card portal-admin-toolbar">
        <label>
          <span>Search</span>
          <input
            value={searchTerm}
            placeholder="Search group, contact, email, or status..."
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Portal Groups</option>
            <option value="needsReview">Needs Review</option>
            <option value="waiting">Waiting on Guest</option>
            <option value="complete">Complete</option>
            <option value="noChecklist">No Checklist</option>
          </select>
        </label>
      </article>

      {portalError && (
        <section className="dashboard-card portal-admin-error">
          <FaExclamationTriangle />
          <strong>{portalError}</strong>
        </section>
      )}

      {isLoading ? (
        <section className="dashboard-card portal-admin-loading">
          <FaClock />
          <strong>Loading portal progress...</strong>
        </section>
      ) : filteredRecords.length > 0 ? (
        <div className="portal-record-list">
          {filteredRecords.map((record) => (
            <PortalRecordCard
              key={record.id}
              record={record}
              copiedBookingId={copiedBookingId}
              onCopyPortalLink={handleCopyPortalLink}
              onOpenBooking={handleOpenBooking}
            />
          ))}
        </div>
      ) : (
        <section className="dashboard-card portal-admin-empty">
          <strong>No portal records match this filter</strong>
          <p>
            Try changing the search or filter, or create checklist items for a booking.
          </p>
        </section>
      )}
    </section>
  );
}