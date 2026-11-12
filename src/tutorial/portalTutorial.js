/*
  "Manage a group's portal": one walkthrough built from sections.

  Each section below is written once. composeWalkthrough (tutorialCore.js)
  turns the list into the full walkthrough and into one standalone topic per
  section, so the wording can't drift between them.

  Besides the step fields listed in tutorials.js, sections use:
    prep        setup, not teaching: passed without stopping when already true,
                and left out of the step count and of Back.
    pickScope   later steps only see this group's card (the fictional group's).
                The value is the card's target id.
    opens       a control (or list) the engine uses first if `until` isn't true,
                so a step works however it was reached: forwards, Back, or a
                topic started on its own. Only panels: never saves.
    demoEffect  what this step does to the fictional scene (portalDemo.js).
                Nothing on screen is clicked.
    writes      the highlighted control saves or sends. It's guarded, and the
                show text explains what it would do. View-only accounts get a note.
    adminOnly   staff get a note that only admins can change this.
*/

import { composeWalkthrough } from "./tutorialCore.js";
import {
  endPortalDemo,
  PORTAL_DEMO_GROUP_ID,
  showPortalDemo,
} from "./portalDemo.js";

const openPortals = {
  id: "open-portals",
  prep: true,
  target: "nav-portals",
  show: "Everything to do with guest portals is under Portals in the sidebar.",
  done: (ctx) => ctx.visible("portal-page"),
  demoClick: true,
};

const chooseGroup = {
  id: "choose-group",
  prep: true,
  pickScope: "portal-card",
  target: "portal-toolbar",
  show: "I'll use a fictional group, Community Bible Church.",
  done: (ctx) => ctx.hasScope() && ctx.visible("portal-card"),
  waitFor: (ctx) => !ctx.visible("portal-loading"),
};

const expandChecklist = {
  click: "portal-checklist-more",
  until: (ctx) => !ctx.visible("portal-checklist-more") || ctx.text("portal-checklist-more") === "Show less",
};
const openTasks = { click: "portal-assign-tasks", until: (ctx) => ctx.visible("portal-task-panel") };
const openDocuments = { click: "portal-assign-documents", until: (ctx) => ctx.visible("portal-doc-panel") };
const openEmails = { click: "portal-emails", until: (ctx) => ctx.visible("portal-email-panel") };
const openEmailCard = { click: "portal-email-summary", until: (ctx) => ctx.visible("portal-email-mode") };
const openCorrections = { click: "portal-correct", until: (ctx) => ctx.visible("portal-due-input") };
const openReviewCorrections = { click: "portal-correct-needsReview", until: (ctx) => ctx.visible("portal-send-back") };
const openDoneCorrections = { click: "portal-correct-completed", until: (ctx) => ctx.visible("portal-reopen") };

const inPanel = (opener, steps) => steps.map((step) => ({ ...step, opens: [opener] }));
const inChecklist = (steps, ...openers) => steps.map((step) => ({ ...step, opens: [expandChecklist, ...openers] }));

const SECTIONS = [
  {
    id: "find",
    group: "Set up a portal",
    title: "Find a group and read its progress",
    description: "Search the list, and learn what the percentage, status and counts mean.",
    keywords: ["search", "filter", "status", "percent", "progress", "needs review", "waiting on guest"],
    steps: [
      openPortals,
      {
        id: "summary",
        target: "portal-summary",
        show: "Portal Progress covers bookings that are going ahead, plus any group that already has tasks or documents. These tiles count groups, not tasks.",
      },
      {
        id: "search",
        target: "portal-search",
        show: "Search finds a group by its name, contact, email or booking status.",
        example: "Community Bible",
      },
      {
        id: "status",
        target: "portal-status",
        show: "Status narrows the list to Needs Review, Waiting on Guest, Complete or No Checklist. Groups needing review are always listed first.",
      },
      chooseGroup,
      {
        id: "pill",
        target: "portal-status-pill",
        show: "This is the group's overall state. Needs Review means something is waiting for you, and Waiting on Guest means the next move is theirs.",
      },
      {
        id: "percent",
        target: "portal-progress",
        show: "The percentage counts tasks only. A confirmed task counts in full, and a submission waiting for review counts as half. Documents don't count.",
      },
      {
        id: "counts",
        target: "portal-metrics",
        show: "Complete is confirmed by staff, Review is waiting for you, Open is not started or waiting on the guest, and Docs is every document in the portal.",
      },
      ...inChecklist([
        {
          id: "rows",
          target: ["portal-checklist", "portal-checklist-empty"],
          show: "Each row is one task. Assigning it asks the guest for something, the guest's submission puts it in review, and it's only finished when staff confirm it.",
        },
      ]),
      {
        id: "open-booking",
        target: "portal-open-booking",
        show: "Open Booking jumps to the group's full booking. I won't open it, because this group is fictional.",
      },
    ],
  },

  {
    id: "tasks",
    group: "Set up a portal",
    title: "Assign tasks",
    description: "Choose tasks from the approved list and decide what's required.",
    keywords: ["checklist", "assign", "required", "optional", "contract", "insurance"],
    steps: [
      openPortals,
      chooseGroup,
      {
        id: "open-tasks",
        target: "portal-assign-tasks",
        show: "Tasks are things the group must do. Assign Tasks opens the list.",
        done: (ctx) => ctx.visible("portal-task-panel"),
        demoClick: true,
      },
      ...inPanel(openTasks, [
        {
          id: "catalog",
          target: "portal-task-table",
          show: "Tasks come from this approved list. Guest action shows what the guest does: upload a file, submit or confirm. Staff updates means nothing for the guest to do.",
        },
        {
          id: "tick",
          target: "portal-task-table",
          show: "Tick the tasks this group needs. A tick is only a draft until it's assigned.",
          example: "Submit Schedule",
        },
        {
          id: "details",
          target: ["portal-task-selected", "portal-task-table"],
          show: "Each ticked task can have its own due date, and can be Required or Optional. A due date after arrival gets a warning, but it's allowed.",
          example: "Due in 10 days, Required",
        },
        {
          id: "assign",
          target: "portal-task-assign",
          show: "Assign adds the task to the group's portal as Not started. If the group already has a task, you're warned before a second copy is added.",
          writes: true,
          demoEffect: "assignTask",
        },
      ]),
      ...inChecklist([
        {
          id: "assigned",
          target: "portal-checklist",
          show: "Here's the new task, Not started. It also lowers the percentage, because there's one more task to finish.",
        },
      ]),
    ],
  },

  {
    id: "documents",
    group: "Set up a portal",
    title: "Share documents",
    description: "Share a standard document, upload a custom one, or stop sharing.",
    keywords: ["document", "upload", "file", "policy", "pdf", "custom", "remove", "map"],
    steps: [
      openPortals,
      chooseGroup,
      {
        id: "open-documents",
        target: "portal-assign-documents",
        show: "Documents are files for the group to read. They have no due date and don't change the percentage.",
        done: (ctx) => ctx.visible("portal-doc-panel"),
        demoClick: true,
      },
      ...inPanel(openDocuments, [
        {
          id: "custom",
          target: "portal-custom-upload",
          show: "For a file just for this group, add a title and a file, plus an optional note. PDF, Word, Excel, PNG, JPG, HEIC or TXT, up to 10 MB.",
        },
        {
          id: "standard",
          target: "portal-doc-standard",
          show: "Standard documents are grouped into General and InterVarsity. Tick the ones this group needs.",
          example: "Toah Nipi Campus Map",
        },
        {
          id: "assign",
          target: "portal-doc-assign",
          show: "Assign shares the document in the group's portal straight away.",
          writes: true,
          demoEffect: "assignDocument",
        },
        {
          id: "remove",
          target: ["portal-doc-remove", "portal-doc-panel"],
          show: "Remove stops sharing a document after you confirm. The stored file stays in Storage, and files the guest uploaded can't be removed here.",
          writes: true,
        },
      ]),
    ],
  },

  {
    id: "due-dates",
    group: "Set up a portal",
    title: "Set or change a due date",
    description: "Change one task's due date and see what it does to reminders.",
    keywords: ["deadline", "date", "reminder", "correct"],
    steps: [
      openPortals,
      chooseGroup,
      ...inChecklist([
        {
          id: "correct",
          target: "portal-correct",
          show: "A due date belongs to one task, and there's no group-wide date. Correct… holds the task's changes.",
          done: (ctx) => ctx.visible("portal-due-input"),
          demoClick: true,
        },
      ]),
      ...inChecklist(
        [
          {
            id: "date",
            target: "portal-due-input",
            show: "Pick the new date here. Nothing changes until it's saved.",
            example: "Four days later",
          },
          {
            id: "save",
            target: "portal-save-due",
            show: "Save due date updates the task for the guest. Reminders for the old date are dropped and the new date's reminders apply.",
            writes: true,
            demoEffect: "changeDueDate",
          },
        ],
        openCorrections
      ),
      ...inChecklist([
        {
          id: "saved",
          target: "portal-checklist",
          show: "The new date now shows on the task's row.",
        },
      ]),
    ],
  },

  {
    id: "link",
    group: "Reach the guest",
    title: "Copy the portal link or open the portal",
    description: "Share a group's private link and see the portal as they do.",
    keywords: ["link", "url", "token", "copy", "open portal", "share", "guest view"],
    steps: [
      openPortals,
      chooseGroup,
      {
        id: "token",
        target: "portal-link",
        show: "Each group has one private link. Anyone who has it can see and submit everything in that group's portal, so send it only to the group's contacts.",
      },
      {
        id: "copy",
        target: "portal-copy-link",
        show: "Copy Link puts the full link on the clipboard, ready to paste into a message. This group is fictional, so there's no link to copy.",
      },
      {
        id: "open",
        target: "portal-open-portal",
        show: "Open Portal shows the guest's portal in a new tab, and anything done there is real. This group is fictional, so I won't open it. A booking's Overview has the same thing as Open Guest Portal.",
      },
    ],
  },

  {
    id: "group-emails",
    group: "Reach the guest",
    title: "Set up a group's emails",
    description: "Choose recipients, pick which items send email, and enable the group.",
    keywords: ["email", "recipients", "welcome", "notice", "reminder", "enable", "preview", "history"],
    steps: [
      openPortals,
      chooseGroup,
      {
        id: "open-emails",
        target: "portal-emails",
        show: "Emails holds the settings for this group only.",
        done: (ctx) => ctx.visible("portal-email-panel"),
        demoClick: true,
      },
      ...inPanel(openEmails, [
        {
          id: "state",
          target: "portal-email-state",
          show: "This shows the sending mode, and whether emails are On, Off, Paused or Stopped for this booking. It's also where you see if automatic emails are off for everyone.",
        },
        {
          id: "recipients",
          target: "portal-email-recipients",
          show: "Emails on the booking are listed unticked, and only ticked addresses get mail. You can add another address here without changing the booking. Everyone ticked gets the private link.",
        },
        {
          id: "items",
          target: "portal-email-items",
          show: "Everything starts off. Each task can send a New-task notice, reminders 7 days before, 2 days before or once when overdue, and a Changes requested notice. Reminders need a due date.",
        },
        {
          id: "enable",
          target: "portal-email-enable",
          show: "Ticking Enable and pressing Save, then confirming, sends the welcome email to each ticked address, following the sending mode. Turning it off and on again doesn't resend it.",
          writes: true,
          demoEffect: "enableEmails",
        },
        {
          id: "enabled",
          target: "portal-email-history",
          show: "In this fictional dry run the welcome is recorded as Simulated, so nobody got an email. In Live mode it would be a real one.",
        },
        {
          id: "send-now",
          target: "portal-email-send-now",
          show: "Resend welcome and Send reminder now go straight to saved recipients after you confirm, following the sending mode.",
          writes: true,
        },
        {
          id: "preview",
          target: "portal-email-preview",
          show: "Preview sends nothing, so it's a safe way to check the wording. Upcoming lists what's scheduled, or why nothing is.",
        },
        {
          id: "history",
          target: "portal-email-history",
          show: "History lists this group's emails and what happened to each, such as Simulated, Blocked, Accepted by provider or Delivered.",
        },
      ]),
    ],
  },

  {
    id: "sending",
    group: "Reach the guest",
    title: "Check the sending mode and reminders",
    description: "What dry run, test and live mean, and when a reminder really goes out.",
    keywords: ["email", "mode", "dry run", "test", "live", "automatic", "reminders", "timing", "templates", "settings"],
    steps: [
      openPortals,
      {
        id: "open-card",
        target: "portal-email-summary",
        show: "Guest portal emails holds the settings that apply to every group.",
        done: (ctx) => ctx.visible("portal-email-mode"),
        demoClick: true,
      },
      ...inPanel(openEmailCard, [
        {
          id: "mode",
          target: "portal-email-mode",
          show: "Dry run sends nothing and records a simulated email. Test sends only to allowlisted test inboxes. Live sends real email. Changing mode cancels queued mail, and each booking must be enabled again.",
          writes: true,
          adminOnly: true,
        },
        {
          id: "automatic",
          target: "portal-email-automatic",
          show: "Automatic emails is the on/off switch for all notices and deadline reminders. Turning it on enrols no booking and sends no backlog.",
          writes: true,
          adminOnly: true,
        },
        {
          id: "timing",
          target: "portal-email-timing",
          show: "Reminders go out on the first scheduled run at or after 9:00 New York time. New-task and change notices wait a few minutes, so several changes share one email.",
        },
        {
          id: "all-needed",
          target: "portal-email-automatic",
          show: "One tick isn't enough. A reminder needs: a mode that sends, Automatic emails on, the booking enabled and not paused or stopped, a ticked recipient, that reminder ticked, a due date, a task still waiting on the guest, and a retreat that hasn't started.",
        },
        {
          id: "readiness",
          target: "portal-email-readiness",
          show: "Server readiness shows what's set up behind the scenes. Live mode also needs the server to allow it, so choosing Live here isn't enough on its own.",
        },
        {
          id: "templates",
          target: "portal-email-templates",
          show: "Templates set the wording of the welcome and update emails for every group.",
          writes: true,
          adminOnly: true,
        },
      ]),
    ],
  },

  {
    id: "review",
    group: "Review what comes back",
    title: "Review and approve a submission",
    description: "Check what the guest sent, then confirm it.",
    keywords: ["approve", "confirm", "submission", "needs review", "upload", "view info"],
    steps: [
      openPortals,
      chooseGroup,
      ...inChecklist([
        {
          id: "item",
          target: "portal-item-review",
          show: "Needs staff review means the guest has submitted this. It counts as half until it's confirmed.",
        },
        {
          id: "inspect",
          target: ["portal-item-inspect", "portal-item-review"],
          show: "Open Upload shows the guest's file in a new tab, and View Info shows what they typed. Here's a fictional placeholder, because this group has no real file.",
          demoEffect: "previewUpload",
        },
        {
          id: "confirm",
          target: ["portal-confirm", "portal-item-review"],
          show: "Confirm marks the task complete. It only appears once the file or answer is there, otherwise you'll see Missing upload or Missing info.",
          writes: true,
          demoEffect: "confirmItem",
        },
        {
          id: "confirmed",
          target: "portal-progress",
          show: "The task now counts in full, so the percentage went up. At 100%, automatic emails stop for this group.",
        },
      ]),
    ],
  },

  {
    id: "send-back",
    group: "Review what comes back",
    title: "Send a submission back for changes",
    description: "Ask the guest to fix something, with a note if it helps.",
    keywords: ["send back", "changes", "reject", "note", "correction", "fix"],
    steps: [
      openPortals,
      chooseGroup,
      ...inChecklist([
        {
          id: "correct",
          target: "portal-correct-needsReview",
          show: "If a submission isn't right, it can go back to the guest. Correct… on a task that needs review has the option.",
          done: (ctx) => ctx.visible("portal-send-back"),
          demoClick: true,
        },
      ]),
      ...inChecklist(
        [
          {
            id: "note",
            target: "portal-note",
            show: "The note is optional, but it tells the guest what to fix.",
            example: "Please split the total into full-time and part-time guests.",
          },
          {
            id: "send",
            target: "portal-send-back",
            show: "Send back for changes returns the task to Waiting on guest, and the percentage drops. The guest's file or answer stays for them to see.",
            writes: true,
            demoEffect: "sendBack",
          },
        ],
        openReviewCorrections
      ),
      ...inChecklist([
        {
          id: "sent",
          target: "portal-item-sent-back",
          show: "The note shows under the task. The guest only gets an email if Changes requested is ticked and the group's emails are on.",
        },
      ]),
    ],
  },

  {
    id: "corrections",
    group: "Review what comes back",
    title: "Reopen or remove a task",
    description: "Undo a confirmation, or take a task out of the portal.",
    keywords: ["reopen", "undo", "remove", "delete", "completed", "mistake"],
    steps: [
      openPortals,
      chooseGroup,
      ...inChecklist([
        {
          id: "correct",
          target: "portal-correct-completed",
          show: "A confirmation can be undone. Correct… on a completed task has the option.",
          done: (ctx) => ctx.visible("portal-reopen"),
          demoClick: true,
        },
      ]),
      ...inChecklist(
        [
          {
            id: "reopen",
            target: "portal-reopen",
            show: "Reopen task takes it back to review if the guest submitted something. Otherwise it's waiting on the guest again, or Not started if the guest has no action.",
            writes: true,
            demoEffect: "reopenItem",
          },
        ],
        openDoneCorrections
      ),
      ...inChecklist([
        {
          id: "reopened",
          target: "portal-progress",
          show: "It's back in review, so it counts as half and the percentage dropped.",
        },
      ]),
      {
        id: "remove",
        target: "portal-remove-task",
        opens: [expandChecklist, { click: "portal-correct", until: (ctx) => ctx.visible("portal-remove-task") }],
        show: "Remove task takes it out of the group's portal after you confirm. If the guest uploaded a file, it's kept for staff but hidden from the guest.",
        writes: true,
      },
    ],
  },
];

const { walkthrough, topics } = composeWalkthrough({
  id: "portal",
  title: "Manage a group's portal",
  description: "From finding a group to assigning tasks, emailing the guest and reviewing what comes back.",
  category: "Portals",
  difficulty: "Intermediate",
  keywords: ["portal", "guest", "admin"],
  writeLock: true,
  scenario: { scope: PORTAL_DEMO_GROUP_ID, home: "/portal-admin", show: showPortalDemo, end: endPortalDemo },
  sections: SECTIONS,
  intro: [
    {
      id: "intro",
      target: "nav-portals",
      show: "The portal is where a group sees its tasks and documents. I'll show you how staff run it, using a fictional group. Nothing real is touched.",
    },
  ],
  recap: [
    {
      id: "recap",
            target: "portal-summary",
      show: "That's the whole job: find the group, assign tasks and documents, set dates, reach the guest, then review what comes back. Any topic can be replayed on its own.",
    },
  ],
});

export const PORTAL_WALKTHROUGH = walkthrough;
export const PORTAL_TOPICS = topics;

// A short standalone tutorial, built around one example: a 7-day reminder for one task.
export const AUTOMATED_EMAILS_TUTORIAL = {
  id: "automated-emails",
  title: "Automated emails",
  description: "Turn on a group's automatic reminder, see when it sends, and check or stop it.",
  category: "Emails",
  difficulty: "Beginner",
  keywords: ["email", "automatic", "automated", "reminder", "schedule", "welcome", "pause", "upcoming", "history"],
  writeLock: true,
  scenario: { scope: PORTAL_DEMO_GROUP_ID, home: "/portal-admin", show: showPortalDemo, end: endPortalDemo },
  steps: [
    openPortals,
    chooseGroup,
    {
      id: "open-emails",
      target: "portal-emails",
      show: "Automatic emails are set per group, under Emails on the group's card.",
      done: (ctx) => ctx.visible("portal-email-panel"),
      demoClick: true,
    },
    ...inPanel(openEmails, [
      {
        id: "recipients",
        target: "portal-email-recipients",
        show: "First, who gets the emails. Only ticked addresses get mail, and everyone ticked gets the group's private portal link.",
        example: "jordan.smith@example.org",
        learnMore: "Addresses on the booking are listed unticked. Add another address here without changing the booking. Each person gets their own email.",
      },
      {
        id: "items",
        target: "portal-email-items",
        show: "Then, what sends. There's no custom schedule: each task has set options. Ticking 7 days before sends a reminder a week before that task's due date.",
        example: "Submit food allergy information: 7 days before",
        learnMore:
          "The options are New-task notice, reminders 7 days before, 2 days before or once when overdue, and Changes requested. Reminders need a due date and stop once the guest submits, the task is confirmed or removed, or the retreat starts. They go out on the first run at or after 9:00 New York time on the day.",
      },
      {
        id: "preview",
        target: "portal-email-preview",
        show: "Preview shows the wording and sends nothing, so it's a safe place to check an email.",
      },
      {
        id: "save",
        target: "portal-email-enable",
        show: "Ticking Enable and pressing Save, then confirming, does two things: it sends the welcome email now, and it schedules the ticked reminders for later. In this demo nothing is sent.",
        writes: true,
        demoEffect: "enableEmails",
        learnMore:
          "Emails follow the sending mode set by an admin under Guest portal emails: Dry run records them without sending, Test sends only to test inboxes, Live sends real email. Automatic emails also has to be on there.",
      },
      {
        id: "status",
        target: "portal-email-upcoming",
        show: "Upcoming shows the reminder is scheduled, with its date. History at the bottom of the panel shows each email that went: this demo's welcome is marked Simulated, because nothing was really sent.",
      },
      {
        id: "turn-off",
        target: "portal-email-enable",
        show: "To stop, Pause halts this group's emails until Resume, and anything missed isn't sent later. To turn them off for good, untick Enable and Save. The line at the top of the panel shows On, Paused or Off.",
        writes: true,
      },
    ]),
  ],
};
