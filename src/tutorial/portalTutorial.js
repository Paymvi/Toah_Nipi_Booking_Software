/*
  "How do I manage a group's portal?": one walkthrough built from sections.

  Each section below is written once. composeWalkthrough (tutorialCore.js)
  turns the list into the full walkthrough and into one standalone topic per
  section, so the wording can't drift between them.

  Besides the step fields listed in tutorials.js, sections use:
    prep        setup, not teaching: passed without stopping when already true,
                and left out of the step count and of Back.
    pickScope   the person chooses a group from the dialogue; later steps only
                see that group's card. The value is the card's target id.
    opens       a control (or list) the engine uses first if `until` isn't true,
                so a step works however it was reached: forwards, Back, or a
                topic started on its own. Only panels: never saves.
    needs       { check, why }: a real record has to be in this state. If it
                isn't, walk-through mode explains and offers another group, the
                demo, or moving on.
    demoOnly    only in Show me how (an outcome practice can't produce).
    demoEffect  in Show me how, what this step does to the fictional scene
                (portalDemo.js). Nothing on screen is clicked.
    writes      the highlighted control saves or sends. It's guarded, and the
                say text explains what it would do. View-only accounts get a note.
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
  say: "Open Portals in the sidebar.",
  show: "Everything to do with guest portals is under Portals in the sidebar.",
  done: (ctx) => ctx.visible("portal-page"),
  demoClick: true,
};

const chooseGroup = {
  id: "choose-group",
  prep: true,
  pickScope: "portal-card",
  target: "portal-toolbar",
  say: "Which group shall we use? Pick one below, or use Search and Status to narrow the list. Nothing will change for them.",
  show: "I'll use a fictional group, Community Bible Church.",
  done: (ctx) => ctx.hasScope() && ctx.visible("portal-card"),
  waitFor: (ctx) => !ctx.visible("portal-loading"),
  needs: {
    check: (ctx) => ctx.visible("portal-loading") || ctx.visible("portal-list"),
    why: "No groups are showing. Clear Search and set Status to All Portal Groups. If the list stays empty, a group appears here once its booking is confirmed.",
  },
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

const EMAIL_NEEDS = {
  check: (ctx) => ctx.visible("portal-email-card"),
  why: "Portal emails aren't set up on this database, so these controls aren't here yet.",
};

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
        say: "Portal Progress covers bookings that are going ahead, plus any group that already has tasks or documents. These tiles count groups, not tasks.",
        show: "Portal Progress covers bookings that are going ahead, plus any group that already has tasks or documents. These tiles count groups, not tasks.",
      },
      {
        id: "search",
        target: "portal-search",
        say: "Type part of a group's name. A contact's name or email works too.",
        show: "Search finds a group by its name, contact, email or booking status.",
        example: "Community Bible",
        done: (ctx) => ctx.filled("portal-search"),
      },
      {
        id: "status",
        target: "portal-status",
        say: "Status narrows the list to Needs Review, Waiting on Guest, Complete or No Checklist. Groups needing review are always listed first.",
        show: "Status narrows the list to Needs Review, Waiting on Guest, Complete or No Checklist. Groups needing review are always listed first.",
        explore: true,
      },
      chooseGroup,
      {
        id: "pill",
        target: "portal-status-pill",
        say: "This is the group's overall state. Needs Review means something is waiting for you, and Waiting on Guest means the next move is theirs.",
        show: "This is the group's overall state. Needs Review means something is waiting for you, and Waiting on Guest means the next move is theirs.",
      },
      {
        id: "percent",
        target: "portal-progress",
        say: "The percentage counts tasks only. A confirmed task counts in full, and a submission waiting for review counts as half. Documents don't count.",
        show: "The percentage counts tasks only. A confirmed task counts in full, and a submission waiting for review counts as half. Documents don't count.",
      },
      {
        id: "counts",
        target: "portal-metrics",
        say: "Complete is confirmed by staff, Review is waiting for you, Open is not started or waiting on the guest, and Docs is every document in the portal.",
        show: "Complete is confirmed by staff, Review is waiting for you, Open is not started or waiting on the guest, and Docs is every document in the portal.",
      },
      ...inChecklist([
        {
          id: "rows",
          target: ["portal-checklist", "portal-checklist-empty"],
          say: "Each row is one task. Assigning it asks the guest for something, the guest's submission puts it in review, and it's only finished when staff confirm it.",
          show: "Each row is one task. Assigning it asks the guest for something, the guest's submission puts it in review, and it's only finished when staff confirm it.",
        },
      ]),
      {
        id: "open-booking",
        target: "portal-open-booking",
        say: "Open Booking jumps to this group's full booking. We'll stay here for now.",
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
        say: "Tasks are things the group must do. Click Assign Tasks.",
        show: "Tasks are things the group must do. Assign Tasks opens the list.",
        done: (ctx) => ctx.visible("portal-task-panel"),
        demoClick: true,
      },
      ...inPanel(openTasks, [
        {
          id: "catalog",
          target: "portal-task-table",
          say: "Tasks come from this approved list. Guest action shows what the guest does: upload a file, submit or confirm. Staff updates means nothing for the guest to do.",
          show: "Tasks come from this approved list. Guest action shows what the guest does: upload a file, submit or confirm. Staff updates means nothing for the guest to do.",
        },
        {
          id: "tick",
          target: "portal-task-table",
          say: "Tick any task. A tick is only a draft until it's assigned.",
          show: "Tick the tasks this group needs. A tick is only a draft until it's assigned.",
          example: "Submit Schedule",
          done: (ctx) => ctx.text("portal-task-count") !== "Select one or more tasks.",
        },
        {
          id: "details",
          target: ["portal-task-selected", "portal-task-table"],
          say: "Each ticked task can have its own due date, and can be Required or Optional. Try them if you like.",
          show: "Each ticked task can have its own due date, and can be Required or Optional. A due date after arrival gets a warning, but it's allowed.",
          example: "Due in 10 days, Required",
          explore: true,
        },
        {
          id: "assign",
          target: "portal-task-assign",
          say: "Assign adds the task to the group's portal as Not started. It's switched off during practice, so nothing was assigned. If the group already has a task, you're warned before a second copy is added.",
          show: "Assign adds the task to the group's portal as Not started. If the group already has a task, you're warned before a second copy is added.",
          writes: true,
          demoEffect: "assignTask",
        },
      ]),
      ...inChecklist([
        {
          id: "assigned",
          demoOnly: true,
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
        say: "Documents are files for the group to read. They have no due date and don't change the percentage. Click Assign Documents.",
        show: "Documents are files for the group to read. They have no due date and don't change the percentage.",
        done: (ctx) => ctx.visible("portal-doc-panel"),
        demoClick: true,
      },
      ...inPanel(openDocuments, [
        {
          id: "custom",
          target: "portal-custom-upload",
          say: "For a file just for this group, add a title and a file, plus a note if it helps. Upload to Portal is switched off during practice.",
          show: "For a file just for this group, add a title and a file, plus an optional note. PDF, Word, Excel, PNG, JPG, HEIC or TXT, up to 10 MB.",
        },
        {
          id: "standard",
          target: "portal-doc-standard",
          say: "Standard documents are grouped into General and InterVarsity. Tick any one. A tick is only a draft until it's assigned.",
          show: "Standard documents are grouped into General and InterVarsity. Tick the ones this group needs.",
          example: "Toah Nipi Campus Map",
          done: (ctx) => ctx.text("portal-doc-count") !== "Select one or more standard documents.",
        },
        {
          id: "assign",
          target: "portal-doc-assign",
          say: "Assign shares the document in the group's portal. It's switched off during practice, so nothing was shared.",
          show: "Assign shares the document in the group's portal straight away.",
          writes: true,
          demoEffect: "assignDocument",
        },
        {
          id: "remove",
          target: ["portal-doc-remove", "portal-doc-panel"],
          say: "Shared documents have a Remove button, which stops sharing after you confirm. The stored file stays in Storage, and files the guest uploaded can't be removed here.",
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
          say: "A due date belongs to one task, and there's no group-wide date. Open Correct… on any task.",
          show: "A due date belongs to one task, and there's no group-wide date. Correct… holds the task's changes.",
          done: (ctx) => ctx.visible("portal-due-input"),
          demoClick: true,
          needs: {
            check: (ctx) => ctx.visible("portal-correct"),
            why: "This group has no tasks yet, so there's no due date to change.",
          },
        },
      ]),
      ...inChecklist(
        [
          {
            id: "date",
            target: "portal-due-input",
            say: "Pick a date if you like. Nothing changes until it's saved.",
            show: "Pick the new date here. Nothing changes until it's saved.",
            example: "Four days later",
            explore: true,
          },
          {
            id: "save",
            target: "portal-save-due",
            say: "Save due date updates the task for the guest. Reminders for the old date are dropped and the new date's reminders apply. It's switched off during practice.",
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
          demoOnly: true,
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
        say: "Each group has one private link. Anyone who has it can see and submit everything in that group's portal, so send it only to the group's contacts.",
        show: "Each group has one private link. Anyone who has it can see and submit everything in that group's portal, so send it only to the group's contacts.",
      },
      {
        id: "copy",
        target: "portal-copy-link",
        say: "Copy Link puts the full link on your clipboard, ready to paste into a message. It's switched off during practice.",
        show: "Copy Link puts the full link on the clipboard, ready to paste into a message. This group is fictional, so there's no link to copy.",
      },
      {
        id: "open",
        target: "portal-open-portal",
        say: "Open Portal shows the guest's portal in a new tab. Anything done there is real, so I won't open it. A booking's Overview has the same thing as Open Guest Portal.",
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
        say: "Click Emails. These settings are for this group only.",
        show: "Emails holds the settings for this group only.",
        done: (ctx) => ctx.visible("portal-email-panel"),
        demoClick: true,
        needs: EMAIL_NEEDS,
      },
      ...inPanel(openEmails, [
        {
          id: "state",
          target: "portal-email-state",
          say: "This shows the sending mode, and whether emails are On, Off, Paused or Stopped for this booking. It's also where you see if automatic emails are off for everyone.",
          show: "This shows the sending mode, and whether emails are On, Off, Paused or Stopped for this booking. It's also where you see if automatic emails are off for everyone.",
        },
        {
          id: "recipients",
          target: "portal-email-recipients",
          say: "Emails on the booking are listed unticked, and only ticked addresses get mail. You can add another address here without changing the booking. Everyone ticked gets the private link.",
          show: "Emails on the booking are listed unticked, and only ticked addresses get mail. You can add another address here without changing the booking. Everyone ticked gets the private link.",
        },
        {
          id: "items",
          target: "portal-email-items",
          say: "Everything starts off. Each task can send a New-task notice, reminders 7 days before, 2 days before or once when overdue, and a Changes requested notice. Reminders need a due date.",
          show: "Everything starts off. Each task can send a New-task notice, reminders 7 days before, 2 days before or once when overdue, and a Changes requested notice. Reminders need a due date.",
        },
        {
          id: "enable",
          target: "portal-email-enable",
          say: "Ticking Enable and pressing Save, then confirming, sends the welcome email to each ticked address, following the sending mode. Save is switched off during practice, so nothing was sent.",
          show: "Ticking Enable and pressing Save, then confirming, sends the welcome email to each ticked address, following the sending mode. Turning it off and on again doesn't resend it.",
          writes: true,
          demoEffect: "enableEmails",
        },
        {
          id: "enabled",
          demoOnly: true,
          target: "portal-email-history",
          show: "In this fictional dry run the welcome is recorded as Simulated, so nobody got an email. In Live mode it would be a real one.",
        },
        {
          id: "send-now",
          target: "portal-email-send-now",
          say: "Resend welcome and Send reminder now go straight to saved recipients after you confirm, following the sending mode. Both are switched off during practice.",
          show: "Resend welcome and Send reminder now go straight to saved recipients after you confirm, following the sending mode.",
          writes: true,
        },
        {
          id: "preview",
          target: "portal-email-preview",
          say: "Preview sends nothing. Try the Welcome and Reminder tabs. Upcoming lists what's scheduled, or why nothing is.",
          show: "Preview sends nothing, so it's a safe way to check the wording. Upcoming lists what's scheduled, or why nothing is.",
          explore: true,
        },
        {
          id: "history",
          target: "portal-email-history",
          say: "History lists this group's emails and what happened to each, such as Simulated, Blocked, Accepted by provider or Delivered.",
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
        say: "Open Guest portal emails. These settings apply to every group.",
        show: "Guest portal emails holds the settings that apply to every group.",
        done: (ctx) => ctx.visible("portal-email-mode"),
        demoClick: true,
        needs: EMAIL_NEEDS,
      },
      ...inPanel(openEmailCard, [
        {
          id: "mode",
          target: "portal-email-mode",
          say: "Dry run sends nothing and records a simulated email. Test sends only to allowlisted test inboxes. Live sends real email. Changing mode cancels queued mail, and each booking must be enabled again.",
          show: "Dry run sends nothing and records a simulated email. Test sends only to allowlisted test inboxes. Live sends real email. Changing mode cancels queued mail, and each booking must be enabled again.",
          writes: true,
          adminOnly: true,
        },
        {
          id: "automatic",
          target: "portal-email-automatic",
          say: "Automatic emails is the on/off switch for all notices and deadline reminders. Turning it on enrols no booking and sends no backlog.",
          show: "Automatic emails is the on/off switch for all notices and deadline reminders. Turning it on enrols no booking and sends no backlog.",
          writes: true,
          adminOnly: true,
        },
        {
          id: "timing",
          target: "portal-email-timing",
          say: "Reminders go out on the first scheduled run at or after 9:00 New York time. New-task and change notices wait a few minutes, so several changes share one email.",
          show: "Reminders go out on the first scheduled run at or after 9:00 New York time. New-task and change notices wait a few minutes, so several changes share one email.",
        },
        {
          id: "all-needed",
          target: "portal-email-automatic",
          say: "One tick isn't enough. A reminder needs: a mode that sends, Automatic emails on, the booking enabled and not paused or stopped, a ticked recipient, that reminder ticked, a due date, a task still waiting on the guest, and a retreat that hasn't started.",
          show: "One tick isn't enough. A reminder needs: a mode that sends, Automatic emails on, the booking enabled and not paused or stopped, a ticked recipient, that reminder ticked, a due date, a task still waiting on the guest, and a retreat that hasn't started.",
        },
        {
          id: "readiness",
          target: "portal-email-readiness",
          say: "Server readiness shows what's set up behind the scenes. Live mode also needs the server to allow it, so choosing Live here isn't enough on its own.",
          show: "Server readiness shows what's set up behind the scenes. Live mode also needs the server to allow it, so choosing Live here isn't enough on its own.",
        },
        {
          id: "templates",
          target: "portal-email-templates",
          say: "Templates set the wording of the welcome and update emails for every group.",
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
          say: "Needs staff review means the guest has submitted this. It counts as half until you confirm it.",
          show: "Needs staff review means the guest has submitted this. It counts as half until it's confirmed.",
          needs: {
            check: (ctx) => ctx.visible("portal-item-review"),
            why: "Nothing from this group is waiting for review, so there's nothing to approve right now.",
          },
        },
        {
          id: "inspect",
          target: ["portal-item-inspect", "portal-item-review"],
          say: "Open Upload shows the guest's file in a new tab, and View Info shows what they typed. Try it if you like: looking changes nothing.",
          show: "Open Upload shows the guest's file in a new tab, and View Info shows what they typed. Here's a fictional placeholder, because this group has no real file.",
          explore: true,
          demoEffect: "previewUpload",
        },
        {
          id: "confirm",
          target: ["portal-confirm", "portal-item-review"],
          say: "Confirm marks the task complete. It only appears once the file or answer is there, otherwise you'll see Missing upload or Missing info. It's switched off during practice.",
          show: "Confirm marks the task complete. It only appears once the file or answer is there, otherwise you'll see Missing upload or Missing info.",
          writes: true,
          demoEffect: "confirmItem",
        },
        {
          id: "confirmed",
          demoOnly: true,
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
          say: "If a submission isn't right, send it back. Open Correct… on a task that needs review.",
          show: "If a submission isn't right, it can go back to the guest. Correct… on a task that needs review has the option.",
          done: (ctx) => ctx.visible("portal-send-back"),
          demoClick: true,
          needs: {
            check: (ctx) => ctx.visible("portal-correct-needsReview"),
            why: "Nothing from this group is waiting for review, so there's nothing to send back right now.",
          },
        },
      ]),
      ...inChecklist(
        [
          {
            id: "note",
            target: "portal-note",
            say: "The note is optional, but it tells the guest what to fix. Try typing here if you like: it isn't saved.",
            show: "The note is optional, but it tells the guest what to fix.",
            example: "Please split the total into full-time and part-time guests.",
            explore: true,
          },
          {
            id: "send",
            target: "portal-send-back",
            say: "Send back for changes returns the task to Waiting on guest, and the percentage drops. Their file or answer stays for them to see. It's switched off during practice.",
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
          demoOnly: true,
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
          say: "Confirmed something by mistake? Open Correct… on a completed task.",
          show: "A confirmation can be undone. Correct… on a completed task has the option.",
          done: (ctx) => ctx.visible("portal-reopen"),
          demoClick: true,
          needs: {
            check: (ctx) => ctx.visible("portal-correct-completed"),
            why: "This group has no completed tasks, so there's nothing to reopen right now.",
          },
        },
      ]),
      ...inChecklist(
        [
          {
            id: "reopen",
            target: "portal-reopen",
            say: "Reopen task takes it back to review if the guest submitted something. Otherwise it's waiting on the guest again, or Not started if the guest has no action. It's switched off during practice.",
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
          demoOnly: true,
          target: "portal-progress",
          show: "It's back in review, so it counts as half and the percentage dropped.",
        },
      ]),
      {
        id: "remove",
        target: "portal-remove-task",
        opens: [expandChecklist, { click: "portal-correct", until: (ctx) => ctx.visible("portal-remove-task") }],
        say: "Remove task takes it out of the group's portal after you confirm. If the guest uploaded a file, it's kept for staff but hidden from the guest. It's switched off during practice.",
        show: "Remove task takes it out of the group's portal after you confirm. If the guest uploaded a file, it's kept for staff but hidden from the guest.",
        writes: true,
      },
    ],
  },
];

const { walkthrough, topics } = composeWalkthrough({
  id: "portal",
  title: "How do I manage a group's portal?",
  description: "From finding a group to assigning tasks, emailing the guest and reviewing what comes back.",
  category: "Portals",
  difficulty: "Intermediate",
  keywords: ["portal", "guest", "admin"],
  writeLock: true,
  finished: "Saving and sending are back on. Any practice ticks or dates stay in their panel until you close it, so close it rather than saving them.",
  scenario: { scope: PORTAL_DEMO_GROUP_ID, home: "/portal-admin", show: showPortalDemo, end: endPortalDemo },
  sections: SECTIONS,
  intro: [
    {
      id: "intro",
      target: "nav-portals",
      say: "The portal is where a group sees its tasks and documents. I'll show you how staff run it, one topic at a time. Saving and sending stay off throughout.",
      show: "The portal is where a group sees its tasks and documents. I'll show you how staff run it, using a fictional group. Nothing real is touched.",
    },
  ],
  recap: [
    {
      id: "recap",
            target: "portal-summary",
      say: "That's the whole job: find the group, assign tasks and documents, set dates, reach the guest, then review what comes back. Any topic can be replayed on its own.",
      show: "That's the whole job: find the group, assign tasks and documents, set dates, reach the guest, then review what comes back. Any topic can be replayed on its own.",
    },
  ],
});

export const PORTAL_WALKTHROUGH = walkthrough;
export const PORTAL_TOPICS = topics;
