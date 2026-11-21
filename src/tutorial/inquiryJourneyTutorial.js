/*
  "From Guest Inquiry to Guest Portal": the whole journey of one fictional
  group, Community Bible Church, from the public form to staff follow-up.
  Built with composeWalkthrough (tutorialCore.js), so each section is also a
  standalone topic. Field meanings are in tutorials.js and portalTutorial.js;
  this tutorial also uses:

    role     "staff" | "leader" | "system": whose action the step shows.
             Every step has one. The dialogue writes it out and the gnome
             changes outfit (GnomeMascot role).
    preview  a fictional mock-up shown in the dialogue (JourneyPreview.jsx)
             for screens staff can't see, such as the group leader's.
             Such steps have no target: nothing on screen is highlighted.

  Everything on screen is fictional: Guest Inquiries shows inquiryDemo.js
  and Portal Admin shows portalDemo.js while it runs. Save and send buttons
  are guarded, the network write lock refuses writes, and no live form or
  portal is embedded. The behaviour each step describes is traced to its
  source in docs/tutorials/GUEST_INQUIRY_TO_PORTAL.md.
*/

import { endInquiryDemo, showInquiryDemo } from "./inquiryDemo.js";
import { endPortalDemo, PORTAL_DEMO_GROUP_ID, showPortalDemo } from "./portalDemo.js";
import { chooseGroup, openPortals } from "./portalTutorial.js";
import { composeWalkthrough } from "./tutorialCore.js";

const staff = (steps) => steps.map((step) => ({ role: "staff", ...step }));

const openInquiries = {
  id: "open-inquiries",
  role: "staff",
  target: "nav-guest-inquiries",
  show: "Requests from the public form arrive in Guest Inquiries, near the top of the sidebar.",
  done: (ctx) => ctx.visible("inquiry-page"),
  demoClick: true,
};

const openReview = {
  id: "open-review",
  role: "staff",
  target: "inquiry-review",
  show: "Review opens everything the group leader sent. I'll open the fictional Community Bible Church request.",
  done: (ctx) => ctx.visible("inquiry-modal"),
  demoClick: true,
};

const expandChecklist = {
  click: "portal-checklist-more",
  until: (ctx) => !ctx.visible("portal-checklist-more") || ctx.text("portal-checklist-more") === "Show less",
};
const openEmails = { click: "portal-emails", until: (ctx) => ctx.visible("portal-email-panel") };
const asPrep = (step) => ({ role: "staff", ...step, prep: true });

const SECTIONS = [
  {
    id: "form",
    group: "Inquiry",
    title: "The group leader sends the form",
    description: "What the public booking form asks for, and what the group leader sees after sending it.",
    keywords: ["public form", "website", "request", "submit", "group retreat form", "group leader"],
    steps: [
      {
        id: "fill",
        role: "leader",
        preview: "guest-form",
        show: "It starts on the public Group Retreat Form at toah-nipi-guest-booking-form.vercel.app. Starred fields are required. There's no lodging question: staff assign lodging.",
        learnMore:
          "The form also checks that departure isn't before arrival, the stay is at most 60 days, and activity dates fall inside the stay. The Payments & Documents dates are what the group says it sent, not what Toah Nipi received.",
      },
      {
        id: "sent",
        role: "leader",
        preview: "guest-form-sent",
        show: "After Submit Group Form, the group leader sees this. It says plainly that the request isn't a confirmed reservation yet.",
      },
      {
        id: "stored",
        role: "system",
        show: "The request is saved as a New Request in Guest Inquiries. No email goes out, to staff or to the group leader, so check Guest Inquiries regularly.",
      },
    ],
  },

  {
    id: "review",
    group: "Inquiry",
    title: "Review the request in Guest Inquiries",
    description: "Find a request, read what the group sent, and decide what happens next.",
    keywords: ["guest inquiries", "review", "new request", "decline", "converted", "declined"],
    steps: staff([
      openInquiries,
      {
        id: "board",
        target: "inquiry-board",
        show: "Three columns: New Requests are waiting for you, Converted became bookings, and Declined were turned down. These ones are all fictional.",
      },
      {
        id: "workflow",
        target: "inquiry-workflow-note",
        show: "A request stays New until staff either decline it or save a booking from it. Refresh loads anything sent since the page opened.",
      },
      openReview,
      {
        id: "contact",
        target: "inquiry-contact",
        show: "The group leader's contact details come first. You reply outside this software, by email or phone, and the copy buttons help with that.",
      },
      {
        id: "stay",
        target: "inquiry-stay",
        show: "Check the requested dates and guest counts before going further. The Lodging Calendar shows which buildings are free.",
      },
      {
        id: "reported",
        target: "inquiry-reported",
        show: "These are dates the group says it sent things. They aren't proof: staff record official received dates only after checking.",
      },
      {
        id: "decline",
        target: "inquiry-decline",
        show: "If you can't host them, Decline Inquiry asks for an optional reason, then Confirm Decline moves the request to Declined. Nobody is emailed, so tell the group yourself.",
        writes: true,
      },
      {
        id: "still-inquiry",
        target: "inquiry-open-form",
        show: "Reading a request changes nothing and tells the group nothing. It's still only an inquiry, not a booking.",
      },
    ]),
  },

  {
    id: "booking",
    group: "Booking",
    title: "Turn the request into a booking",
    description: "Open the prefilled form, check what still needs doing, and see when the booking really exists.",
    keywords: ["convert", "prefilled", "booking form", "confirmed", "save guest group", "create booking"],
    steps: [
      asPrep(openInquiries),
      asPrep(openReview),
      ...staff([
        {
          id: "open-form",
          target: "inquiry-open-form",
          show: "Open Prefilled Booking Form copies the request into the usual booking form. It doesn't create a booking. I'll open it for the fictional request.",
          done: (ctx) => ctx.visible("booking-form-prefill"),
          demoClick: true,
        },
        {
          id: "prefill",
          target: "booking-form-prefill",
          show: "This note means the form came from a request. Contact details, dates and times, guest counts, meals, allergies, activities, linens and notes are copied in.",
          learnMore: "Contract, deposit and insurance dates the group reports are kept as read-only notes on the Overview. Progress itself is tracked on the group's portal tasks.",
        },
        {
          id: "check",
          target: "booking-form-retreat-type",
          show: "Retreat Type isn't on the public form, so you choose it. Check the dates and guest count too, and add lodging, which the group never asked for.",
          example: "Church",
        },
        {
          id: "save",
          target: "booking-form-save",
          show: "Save Guest Group is the moment the booking exists. It's saved as Confirmed straight away. There's no separate confirmation step, and nothing is sent to the group. Saving is off in this demo.",
          writes: true,
          demoEffect: "inquiryConverted",
        },
        {
          id: "back",
          target: "nav-guest-inquiries",
          show: "Let's go back to Guest Inquiries to see what saving did there.",
          done: (ctx) => ctx.visible("inquiry-page"),
          demoClick: true,
        },
      ]),
      {
        id: "converted",
        role: "system",
        target: "inquiry-column-converted",
        show: "Once the booking saves, the request moves to Converted with its Booking ID, and the booking keeps the request's id. That's how the two stay linked.",
        learnMore:
          "If that marking fails, the booking form says so and offers to try again. A New Request that already has a booking shows Booking already created, with Mark converted to this booking, so a second booking isn't made.",
      },
      {
        id: "portal-link",
        role: "system",
        show: "The new booking also gets its own private portal link automatically. Nobody has been emailed it yet: that's the next part, and it's up to staff.",
      },
    ],
  },

  {
    id: "access",
    group: "Portal",
    title: "Prepare the portal and share the link",
    description: "Assign tasks, then send the private link yourself or let the software email it.",
    keywords: ["portal link", "copy link", "welcome email", "assign tasks", "share", "enable emails"],
    steps: [
      asPrep(openPortals),
      asPrep(chooseGroup),
      ...staff([
        {
          id: "card",
          target: "portal-card",
          show: "Every booking that's going ahead has a card in Portal Progress. Here's the same fictional group as it might look a few weeks on.",
        },
        {
          id: "tasks",
          target: "portal-assign-tasks",
          show: "A new booking has no tasks yet. Assign Tasks asks the group for things like the contract or insurance, each with its own due date. Assign Documents shares files for them to read.",
        },
        {
          id: "link",
          target: "portal-link",
          show: "This is the group's private link on toah-nipi-portal.vercel.app. Anyone who has it can see and submit everything here, so share it only with the group's contacts.",
        },
        {
          id: "copy",
          target: "portal-copy-link",
          show: "To share it yourself, Copy Link and paste it into your own email to the group leader. Nothing is sent for you. This group is fictional, so there's no link to copy.",
        },
        {
          id: "emails",
          target: "portal-emails",
          show: "Or the software can email it. Emails holds this group's settings.",
          done: (ctx) => ctx.visible("portal-email-panel"),
          demoClick: true,
        },
        {
          id: "enable",
          target: "portal-email-enable",
          opens: [openEmails],
          show: "Tick who gets mail, then tick Enable, Save and confirm. That sends the welcome email with the link, following the sending mode an admin sets. Emails are off until you do this.",
          writes: true,
          demoEffect: "enableEmails",
          learnMore:
            "Dry run records emails without sending and Test only reaches test inboxes. Reminders also need Automatic emails switched on, a due date, and that reminder ticked for the task. The Automated emails tutorial covers this.",
        },
      ]),
      {
        id: "sent",
        role: "system",
        target: "portal-email-history",
        opens: [openEmails],
        show: "From here the system sends the welcome, then any reminders you ticked. In this fictional demo it's recorded as Simulated, so nobody got an email.",
      },
    ],
  },

  {
    id: "portal",
    group: "Portal",
    title: "The group leader uses the portal",
    description: "What the group leader sees and does: tasks, documents, and signing where it's on.",
    keywords: ["guest portal", "group leader", "checklist", "upload", "documents", "sign", "review and sign"],
    steps: [
      {
        id: "open",
        role: "leader",
        preview: "portal-checklist",
        show: "They open the link. There's no account or password: the link is the key. The Checklist shows each task, its due date and status. Waiting on You means it's their turn.",
      },
      {
        id: "submit",
        role: "leader",
        preview: "portal-submit",
        show: "Depending on the task they upload a file, type an answer, or press Confirm. It then shows Needs Staff Review. Only staff can make it Complete.",
      },
      {
        id: "documents",
        role: "leader",
        preview: "portal-documents",
        show: "The Documents tab holds files staff shared, such as the welcome information or a campus map. They're for reading and don't change progress.",
      },
      {
        id: "sign",
        role: "leader",
        preview: "portal-sign",
        show: "Review & Sign only appears where staff chose a PDF for that task and online signing is on for the booking. It's off by default, so most groups upload a signed copy instead.",
      },
      {
        id: "theirs",
        role: "staff",
        show: "All of that is the group leader's to do. Staff never fill in their answers, upload for them, or sign on their behalf. If they're stuck, resend the link or talk them through it.",
      },
    ],
  },

  {
    id: "follow-up",
    group: "Portal",
    title: "Review and follow up",
    description: "Find what the group sent, confirm it or send it back, and see what's still open.",
    keywords: ["needs review", "confirm", "send back", "progress", "complete", "follow up"],
    steps: [
      asPrep(openPortals),
      asPrep(chooseGroup),
      ...staff([
        {
          id: "status",
          target: "portal-status",
          show: "Back in the booking software, Status narrows the list to Needs Review, where the group's updates land. Staff aren't emailed when a group submits, so check here.",
        },
        {
          id: "pill",
          target: "portal-status-pill",
          show: "Needs Review means the group sent something and it's your turn. Waiting on Guest means the next move is theirs.",
        },
        {
          id: "item",
          target: "portal-item-review",
          opens: [expandChecklist],
          show: "This task has a submission waiting. Open Upload or View Info shows what they sent.",
        },
        {
          id: "confirm",
          target: ["portal-confirm", "portal-item-review"],
          opens: [expandChecklist],
          show: "Confirm marks it Complete. If it isn't right, Correct… then Send back for changes returns it to the group with a note.",
          writes: true,
          demoEffect: "confirmItem",
        },
        {
          id: "progress",
          target: "portal-progress",
          show: "Complete counts in full and Needs Review counts as half, so 100% means staff confirmed every task. Open still shows what's waiting on the group.",
        },
      ]),
    ],
  },
];

const { walkthrough, topics } = composeWalkthrough({
  id: "guest-journey",
  title: "From Guest Inquiry to Guest Portal",
  description: "Follow one group from the public form to a booking, its portal, and staff follow-up, and see who does each part.",
  category: "Guest journey",
  difficulty: "Beginner",
  keywords: ["inquiry", "guest", "workflow", "booking", "portal", "group leader", "staff"],
  writeLock: true,
  related: ["portal", "automated-emails", "create-booking"],
  scenario: {
    scope: PORTAL_DEMO_GROUP_ID,
    home: "/guest-inquiries",
    pages: ["/guest-inquiries", "/form", "/portal-admin"],
    show: (effects) => {
      showInquiryDemo(effects);
      showPortalDemo(effects);
    },
    end: () => {
      endInquiryDemo();
      endPortalDemo();
    },
  },
  sections: SECTIONS,
  intro: [
    {
      id: "intro",
      role: "staff",
      preview: "journey",
      show: "This follows one fictional group, Community Bible Church, from the public form to its guest portal. A request is only an inquiry until staff save it as a booking.",
    },
    {
      id: "roles",
      role: "staff",
      preview: "roles",
      show: "Every step says whose action it is. When it's the group leader's part, my hat turns blue. Everything here is made up, and saving and sending are switched off.",
    },
  ],
  recap: [
    {
      id: "recap",
      role: "staff",
      preview: "journey",
      show: "That's the journey. The group leader sends the form and works through the portal. Staff review, save the booking, share the link and confirm what comes back.",
    },
  ],
});

export const GUEST_JOURNEY_TUTORIAL = walkthrough;
export const GUEST_JOURNEY_TOPICS = topics;
