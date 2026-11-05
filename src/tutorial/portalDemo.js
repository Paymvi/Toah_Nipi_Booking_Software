/*
  The fictional scenario behind "Show me how" on the portal tutorials.

  PortalAdminView renders this scene through the real Portal Admin
  components, so the demonstration cannot drift from the real screen. It
  lives only in this module's memory: never in Supabase, the bookings list,
  reports, backups, localStorage or a URL. Reloading the page forgets it.

  A scene is rebuilt from the list of demoEffect names on the steps already
  passed (getDemoEffects in tutorialCore.js), so Back, Restart and jumping
  into a topic need no undo logic: the same position always gives the same
  screen.
*/

import { getPortalProgress } from "../utils/portalRules.js";

export const PORTAL_DEMO_GROUP_ID = "portal-demo-community-bible";

const CONTACT_EMAIL = "jordan.smith@example.org";
const NOT_SAVED = "This is a fictional demo, so nothing is saved or sent.";

function fromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function task(id, itemId, title, status, guestAction, details = {}) {
  return {
    id,
    itemId,
    title,
    status,
    required: true,
    dueDate: "",
    guestAction,
    uploadedFileName: "",
    uploadedFilePath: "",
    uploadedFileMime: "",
    uploadedFileSize: 0,
    responseText: "",
    staffReviewNote: "",
    lastChangedAt: "",
    ...details,
  };
}

function document(id, title, documentType, fileName, details = {}) {
  return { id, title, documentType, fileName, note: "", status: "ready", uploadedByGuest: false, lastChangedAt: "", ...details };
}

function record(id, organizationName, contactName, email, startDays, attendeeCount, checklistItems, documents) {
  return {
    id,
    isDemo: true,
    portalToken: "fictional-demo",
    organizationName,
    contactName,
    email,
    startDate: fromToday(startDays),
    endDate: fromToday(startDays + 2),
    attendeeCount,
    status: "Confirmed",
    updatedAt: "",
    checklistItems,
    documents,
    guestUploads: documents.filter((entry) => entry.uploadedByGuest).length,
  };
}

function createGroup() {
  return record(
    PORTAL_DEMO_GROUP_ID,
    "Community Bible Church",
    "Jordan Smith",
    CONTACT_EMAIL,
    30,
    "45",
    [
      task("demo-contract", "contract", "Sign and return contract", "completed", "upload_file", {
        uploadedFileName: "signed-contract-sample.pdf",
        uploadedFilePath: "fictional/signed-contract-sample.pdf",
        uploadedFileSize: 184320,
      }),
      task("demo-insurance", "insurance", "Submit Certificate of Insurance", "needsReview", "upload_file", {
        dueDate: fromToday(14),
        uploadedFileName: "certificate-sample.pdf",
        uploadedFilePath: "fictional/certificate-sample.pdf",
        uploadedFileSize: 96256,
      }),
      task("demo-count", "guest-count", "Confirm final guest counts (full-time, part-time, Day Use)", "needsReview", "mark_ready", {
        dueDate: fromToday(21),
        responseText: "38 full-time, 5 part-time, 2 Day Use",
      }),
      task("demo-food", "food-allergy-information", "Submit food allergy information in group (name of guest and specific food allergy)", "waitingOnGuest", "mark_ready", {
        dueDate: fromToday(21),
      }),
      task("demo-deposit", "deposit", "Pay deposit", "notStarted", "none"),
    ],
    [document("demo-welcome", "Welcome & Reservation Information", "Information Sheet", "Welcome & Reservation Information.pdf")]
  );
}

const EFFECTS = {
  assignTask: ({ group }) => {
    group.checklistItems.push(task("demo-schedule", "schedule", "Submit Schedule", "notStarted", "upload_file", { dueDate: fromToday(10) }));
  },
  assignDocument: ({ group }) => {
    group.documents.push(document("demo-map", "Toah Nipi Campus Map", "Map", "TN Campus Map.pdf"));
  },
  changeDueDate: ({ group }) => {
    group.checklistItems.find((item) => item.id === "demo-insurance").dueDate = fromToday(18);
  },
  previewUpload: ({ group }) => {
    group.checklistItems.find((item) => item.id === "demo-insurance").demoPreview =
      "Fictional preview. A real upload opens in a new tab through a temporary private link.";
  },
  confirmItem: ({ group }) => {
    group.checklistItems.find((item) => item.id === "demo-insurance").status = "completed";
  },
  sendBack: ({ group }) => {
    Object.assign(group.checklistItems.find((item) => item.id === "demo-count"), {
      status: "waitingOnGuest",
      staffReviewNote: "Please split the total into full-time and part-time guests.",
    });
  },
  reopenItem: ({ group }) => {
    group.checklistItems.find((item) => item.id === "demo-contract").status = "needsReview";
  },
  enableEmails: ({ email }) => {
    email.automation = { enabled: true, mode_epoch: 1, paused: false, stopped_reason: null };
    email.recipients[0].selected = true;
    email.reminders = ["7d", "2d"];
    email.history.push({
      id: "demo-welcome-email",
      created_at: new Date().toISOString(),
      sent_at: null,
      recipient: CONTACT_EMAIL,
      trigger: "welcome",
      is_manual: false,
      mode: "disabled",
      status: "simulated",
      status_detail: "Fictional example: this email does not exist.",
    });
  },
};

function toEmailItem(item, reminders) {
  const hasGuestAction = item.guestAction !== "none";
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    guest_action: item.guestAction,
    due_date: item.dueDate || null,
    email_assign: false,
    email_changes: false,
    email_reminders: hasGuestAction && item.dueDate ? reminders : [],
  };
}

function preview(subject, intro) {
  return {
    subject,
    html: `<!doctype html><body style="font-family:sans-serif;color:#2b2b2b"><p><strong>Fictional example</strong></p><p>${intro}</p></body>`,
  };
}

export function buildPortalDemoScene(effects = []) {
  const group = createGroup();
  const email = {
    automation: null,
    recipients: [{ id: "demo-recipient", email: CONTACT_EMAIL, selected: false, added_by_staff: false }],
    reminders: [],
    history: [],
  };

  effects.forEach((name) => EFFECTS[name]({ group, email }));

  const records = [
    group,
    record("portal-demo-riverside", "Riverside Youth Fellowship", "Sam Rivera", "sam.rivera@example.org", 60, "28",
      [task("demo-riverside-contract", "contract", "Sign and return contract", "completed", "upload_file")], []),
    record("portal-demo-maple", "Maple Grove Women's Retreat", "Robin Lee", "robin.lee@example.org", 90, "20", [], []),
  ].map((entry) => ({ ...entry, progress: getPortalProgress(entry.checklistItems) }));

  return {
    records,
    emailAdmin: {
      settings: { id: 1, mode: "disabled", automation_enabled: Boolean(email.automation), mode_epoch: 1, live_cap_per_day: 20 },
      templates: {
        welcome: { key: "welcome", subject: "Your Toah Nipi guest portal", body: "Hello {{contact_name}},\n\nYour portal for {{group_name}} is ready.", updated_at: "demo" },
        update: { key: "update", subject: "Your Toah Nipi portal: {{group_name}}", body: "Hello {{contact_name}},\n\nHere is what's next.", updated_at: "demo" },
      },
    },
    email: {
      ...email,
      items: group.checklistItems.map((item) => toEmailItem(item, email.reminders)),
      documents: group.documents.map((entry) => ({ id: entry.id, title: entry.title, uploaded_by_guest: false, email_assign: false })),
    },
    overview: {
      complete: false,
      ineligibleReason: "",
      automationBlock: email.automation ? "" : "portal emails aren't enabled for this booking yet.",
      upcoming: email.automation
        ? [{ date: fromToday(7), trigger: "7d", id: "demo-food", version: 1, title: "Submit food allergy information", recipients: [CONTACT_EMAIL] }]
        : [],
      previews: {
        welcome: preview("Your Toah Nipi guest portal", "This is where the welcome email and the group's portal button appear."),
        reminder: preview("Your Toah Nipi portal: Community Bible Church", "This is where outstanding tasks and their due dates appear."),
      },
      readiness: { testAllowlist: ["staff-test@example.org"] },
    },
    readiness: { providerReady: true, liveEnabled: false, testAllowlist: ["staff-test@example.org"], problems: [] },
  };
}

/* ---------- The running scene ---------- */

let scene = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribePortalDemo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPortalDemo() {
  return scene;
}

export function showPortalDemo(effects) {
  const key = effects.join();
  if (scene?.key === key) return;
  scene = { key, ...buildPortalDemoScene(effects) };
  notify();
}

export function endPortalDemo() {
  if (!scene) return;
  scene = null;
  notify();
}

const refuse = async () => {
  throw new Error(NOT_SAVED);
};

// Stands in for portalEmailService while the scene is on screen. Same shape, no network.
export const portalDemoEmailApi = {
  loadEmailHistory: async () => scene?.email.history ?? [],
  loadBookingEmailState: async () => ({ ...scene?.email, history: scene?.email.history ?? [] }),
  callPortalEmail: async (action) => {
    if (action === "status") return { readiness: scene?.readiness };
    if (action === "overview") return scene?.overview;
    throw new Error(NOT_SAVED);
  },
  saveEmailRecipients: refuse,
  saveItemEmailOptions: refuse,
  saveEmailTemplate: refuse,
  updateEmailSettings: refuse,
};
