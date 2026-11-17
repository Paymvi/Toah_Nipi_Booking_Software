/*
  Fictional previews the gnome shows for screens staff don't use themselves:
  the public guest form and the guest portal. Plain markup only: no
  buttons, inputs, links or requests, so nothing here can be clicked,
  submitted or signed. Wording and statuses are copied from the
  Guest_Booking_Form and Toah_Nipi_Portal apps (see
  docs/tutorials/GUEST_INQUIRY_TO_PORTAL.md for the sources).
*/

import GnomeMascot from "./GnomeMascot";
import { STEP_ROLES } from "./tutorialCore";

function Frame({ label, children }) {
  return (
    <figure className="tg-preview" aria-label={`${label}, fictional preview`}>
      <figcaption>
        <span>Preview · fictional</span> {label}. Nothing here can be clicked or sent.
      </figcaption>
      <div className="tg-preview-screen">{children}</div>
    </figure>
  );
}

function FakeButton({ children, primary }) {
  return <span className={`tg-preview-button ${primary ? "tg-preview-button-primary" : ""}`}>{children}</span>;
}

function Status({ kind, children }) {
  return <span className={`tg-preview-status tg-preview-status-${kind}`}>{children}</span>;
}

function Roles() {
  return (
    <ul className="tg-preview-roles" aria-label="How each kind of step is marked">
      {["staff", "leader", "system"].map((role) => (
        <li key={role}>
          <GnomeMascot crop="head" role={role} className="tg-preview-role-gnome" />
          <span className={`tg-role tg-role-${role}`}>
            <strong>{STEP_ROLES[role].label}</strong>
          </span>
          <small>
            {role === "staff" && "You, in the booking software. My usual red hat."}
            {role === "leader" && "The group leader, on their own device. Blue hat and a name tag."}
            {role === "system" && "Happens by itself. A small cog."}
          </small>
        </li>
      ))}
    </ul>
  );
}

const JOURNEY = [
  ["leader", "Fills in and submits the public Group Retreat Form."],
  ["staff", "Reviews the request in Guest Inquiries."],
  ["staff", "Opens the prefilled booking form, checks it, and saves the booking."],
  ["system", "Marks the request Converted and gives the booking its portal link."],
  ["staff", "Assigns tasks and documents, then shares the portal link."],
  ["leader", "Works through tasks and documents in the portal."],
  ["staff", "Reviews what comes back in Portal Progress and confirms it."],
];

function Journey() {
  return (
    <ol className="tg-preview-journey">
      {JOURNEY.map(([role, text]) => (
        <li key={text}>
          <span className={`tg-role tg-role-${role}`}>
            <strong>{STEP_ROLES[role].label}</strong>
          </span>
          {text}
        </li>
      ))}
    </ol>
  );
}

function GuestForm() {
  return (
    <Frame label="Group Retreat Form">
      <p className="tg-preview-eyebrow">Toah Nipi Christian Retreat Center</p>
      <strong className="tg-preview-title">Group Retreat Form</strong>
      <ul className="tg-preview-list">
        <li><b>Guest Group</b> group name*, primary contact*, email*, phone*, address, arrival* and departure* dates and times</li>
        <li><b>Guest Information</b> estimated total guests*, adults and children</li>
        <li><b>Payments &amp; Documents</b> dates the group says it sent the contract, deposit or insurance</li>
        <li><b>Meals</b>, <b>Activities</b>, <b>Linens</b> and <b>Additional Notes</b></li>
      </ul>
      <div className="tg-preview-row">
        <small>Submitting sends this to staff for review. It does not create a confirmed reservation by itself.</small>
        <FakeButton primary>Submit Group Form</FakeButton>
      </div>
    </Frame>
  );
}

function GuestFormSent() {
  return (
    <Frame label="What the group leader sees after submitting">
      <p className="tg-preview-eyebrow">Retreat request received</p>
      <strong className="tg-preview-title">Thank you for reaching out.</strong>
      <p>
        Your information has been sent to the Toah Nipi team for review. This submission does not create a confirmed
        reservation. A staff member will review your request and contact you about next steps.
      </p>
      <FakeButton>Submit another request</FakeButton>
    </Frame>
  );
}

const PORTAL_ROWS = [
  ["Sign and return contract", "waiting", "Waiting on You", "Upload Signed File"],
  ["Confirm final guest counts", "review", "Needs Staff Review", "Submitted"],
  ["Submit Certificate of Insurance", "complete", "Complete", "Received"],
  ["Pay deposit", "not-started", "Not Started", "Staff Updates"],
];

function PortalHeader() {
  return (
    <>
      <p className="tg-preview-eyebrow">Guest Portal</p>
      <strong className="tg-preview-title">Community Bible Church</strong>
      <div className="tg-preview-progress" aria-hidden="true">
        <span style={{ width: "38%" }} />
      </div>
    </>
  );
}

function PortalChecklist() {
  return (
    <Frame label="The group's portal, Checklist tab">
      <PortalHeader />
      <div className="tg-preview-tabs">
        <span className="tg-preview-tab-active">Checklist</span>
        <span>Documents</span>
      </div>
      <ul className="tg-preview-tasks">
        {PORTAL_ROWS.map(([title, kind, status, action]) => (
          <li key={title}>
            <span>{title}</span>
            <Status kind={kind}>{status}</Status>
            <FakeButton>{action}</FakeButton>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function PortalSubmit() {
  return (
    <Frame label="A task right after the group leader submits it">
      <ul className="tg-preview-tasks">
        <li>
          <span>Confirm final guest counts</span>
          <Status kind="waiting">Waiting on You</Status>
          <FakeButton primary>Confirm</FakeButton>
        </li>
        <li className="tg-preview-arrow" aria-hidden="true">↓</li>
        <li>
          <span>Confirm final guest counts</span>
          <Status kind="review">Needs Staff Review</Status>
          <FakeButton>Unconfirm</FakeButton>
        </li>
      </ul>
      <small>Shown to the group leader: "Waiting for staff confirmation". It only says Complete once staff confirm it.</small>
    </Frame>
  );
}

function PortalDocuments() {
  return (
    <Frame label="The group's portal, Documents tab">
      <PortalHeader />
      <div className="tg-preview-tabs">
        <span>Checklist</span>
        <span className="tg-preview-tab-active">Documents</span>
      </div>
      <strong className="tg-preview-subtitle">Files for this booking</strong>
      <ul className="tg-preview-list">
        <li>Welcome &amp; Reservation Information.pdf</li>
        <li>Toah Nipi Campus Map.pdf</li>
      </ul>
    </Frame>
  );
}

function PortalSign() {
  return (
    <Frame label="Review & Sign, only where online signing is on">
      <ul className="tg-preview-tasks">
        <li>
          <span>Sign and return contract</span>
          <Status kind="waiting">Waiting on You</Status>
          <FakeButton primary>Review &amp; Sign</FakeButton>
        </li>
      </ul>
      <ol className="tg-preview-list">
        <li>Open and read the document</li>
        <li>Enter their name, then type or draw a signature</li>
        <li>Tick the agreement, then Sign document</li>
      </ol>
      <small>Upload Paper Copy stays available. A signed task goes to Needs Staff Review like any other.</small>
    </Frame>
  );
}

const PREVIEWS = {
  roles: Roles,
  journey: Journey,
  "guest-form": GuestForm,
  "guest-form-sent": GuestFormSent,
  "portal-checklist": PortalChecklist,
  "portal-submit": PortalSubmit,
  "portal-documents": PortalDocuments,
  "portal-sign": PortalSign,
};

export default function JourneyPreview({ kind }) {
  const Preview = PREVIEWS[kind];
  return Preview ? <Preview /> : null;
}
