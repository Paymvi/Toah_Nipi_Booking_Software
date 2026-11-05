/*
  Portal tutorial edge cases: starting points, missing state, roles, loading,
  safety, demo cleanup, unsaved work, continuing and progress.
  See tests/browser/README.md.

  node tests/browser/portalEdges.browser.mjs [name filter]
*/
import { PORTAL_WALKTHROUGH } from "../../src/tutorial/portalTutorial.js";
import { TUTORIAL_PROGRESS_STORAGE_KEY } from "../../src/tutorial/tutorialCore.js";
import { ctl, dialog, launch, NEXT, open, openLibrary, sleep, start, stepId, target, waitForStep, writes } from "./harness.mjs";

const filter = process.argv[2] || "";
const results = [];
const DEMO_BANNER = ".portal-demo-banner";
const END = '.tg-dialog button[aria-label="End tutorial"]';
const PAUSE = '.tg-controls button:has-text("Pause")';
const BACK = '.tg-controls button:has-text("Back")';
const RESTART = '.tg-controls button[aria-label="Restart tutorial"]';
const pick = (page, name) => page.locator(".tg-choices-list .tg-button", { hasText: name }).click();
const visible = (page, id) => page.locator(`${target(id)} >> visible=true`).first();
const next = (page) => page.locator(NEXT).click({ force: true });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function test(name, run, { path = "/dashboard", size } = {}) {
  if (!name.includes(filter)) return;
  await ctl("reset=1");
  const session = await launch(size);

  try {
    await open(session, path);
    await run(session);
    const leaked = await writes();
    assert(session.allowWrites || leaked.length === 0, `writes reached the mock: ${leaked.join("; ")}`);
    assert(session.errors.length === 0, session.errors.join(" | ").slice(0, 300));
    results.push(true);
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL ${name}: ${String(error.message).split("\n")[0].slice(0, 260)} | step=${await stepId(session.page)} | ${(await dialog(session.page)).slice(0, 120)}`);
  }

  await session.browser.close();
}

// To the Assign Tasks panel, in practice, on the first group.
async function practiseToPanel(page) {
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.open-portals");
  await visible(page, "nav-portals").click();
  await waitForStep(page, "tasks.choose-group");
  await pick(page, "Community Bible Church");
  await waitForStep(page, "tasks.open-tasks");
  await visible(page, "portal-assign-tasks").click();
  await waitForStep(page, "tasks.catalog");
}

// Runs a request through the app's own Supabase client, as a bug that bypassed the screens would.
const tryWrites = (page) =>
  page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabaseClient.js");
    const results = [];
    const record = (label, value) => results.push(`${label}:${value?.error ? "refused" : "SENT"}`);

    record("update", await supabase.from("portal_checklist_items").update({ status: "completed" }).eq("id", "t2"));
    record("insert", await supabase.from("portal_documents").insert({ booking_id: "b1", title: "x" }));
    record("delete", await supabase.from("portal_documents").delete().eq("id", "d1"));
    record("upload", await supabase.storage.from("portal-uploads").upload("a/b.txt", new Blob(["x"])));
    record("email", await supabase.functions.invoke("portal-email", { body: { action: "send", bookingId: "b1", kind: "reminder" } }));
    return results;
  });

/* ---------- Starting points ---------- */

await test("starts outside Portal Admin, demo returns there", async ({ page }) => {
  await start(page, "Set or change a due date", "demo");
  await page.waitForSelector(DEMO_BANNER);
  assert((await page.evaluate(() => location.pathname)) === "/portal-admin", "did not open Portals");
  await page.locator(END).click();
  await page.waitForFunction(() => location.pathname === "/contacts");
  assert((await page.locator(DEMO_BANNER).count()) === 0, "demo left behind");
}, { path: "/contacts" });

await test("reuses the booking already open", async ({ page }) => {
  await page.locator(target("nav-master-spreadsheet")).first().click();
  await page.locator(`${target("spreadsheet-open-booking")} >> visible=true`).first().click();
  await page.waitForSelector(target("booking-profile"));
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.open-portals");
  await visible(page, "nav-portals").click();
  await waitForStep(page, "tasks.open-tasks");
  assert((await dialog(page)).includes("Community Bible Church, the group you already had open"), "did not say which group");
}, { path: "/master-spreadsheet" });

await test("reuses the group whose panel is open, and a list searched to one", async ({ page }) => {
  await page.locator(`[data-tutorial-scope="b2"] ${target("portal-assign-documents")}`).click();
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.open-tasks");
  await visible(page, "portal-assign-tasks").click();
  await waitForStep(page, "tasks.catalog");
  const inB2 = await page.locator(`[data-tutorial-scope="b2"] ${target("portal-task-panel")}`).count();
  assert(inB2 === 1, "worked on the wrong group");
  await page.locator(END).click();

  await page.locator(`[data-tutorial-scope="b2"] ${target("portal-assign-tasks")}`).click();
  await page.locator(`${target("portal-search")} input`).fill("Lakeside");
  await sleep(300);
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.open-tasks");
  assert((await dialog(page)).includes("Lakeside"), "did not reuse the only group listed");
}, { path: "/portal-admin" });

await test("with no selection it asks, and never picks a group by itself", async ({ page }) => {
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.choose-group");
  await sleep(1500);
  assert((await stepId(page)) === "tasks.choose-group", "moved on without a choice");
  assert((await page.locator(NEXT).getAttribute("aria-disabled")) === "true", "Next can skip the choice");
  assert((await page.locator(".tg-choices-list .tg-button").count()) === 3, "did not list the groups");
}, { path: "/portal-admin" });

await test("other groups' controls stay blocked once one is chosen", async ({ page }) => {
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.choose-group");
  await pick(page, "Community Bible Church");
  await waitForStep(page, "tasks.open-tasks");
  await page.locator(`[data-tutorial-scope="b3"] ${target("portal-assign-tasks")}`).click({ force: true });
  await sleep(500);
  assert((await page.locator(target("portal-task-panel")).count()) === 0, "opened another group's panel");
  assert((await dialog(page)).includes("highlighted"), "no hint");
}, { path: "/portal-admin" });

/* ---------- Missing state ---------- */

await test("a filter hiding every group is explained and can be fixed in place", async ({ page }) => {
  await page.locator(`${target("portal-search")} input`).fill("zzz");
  await start(page, "Assign tasks", "guided");
  await page.waitForSelector(".tg-choices");
  assert((await dialog(page)).includes("Clear Search"), "no explanation");
  await page.locator(`${target("portal-search")} input`).fill("");
  await waitForStep(page, "tasks.choose-group");
  await page.waitForSelector(".tg-choices-list");
}, { path: "/portal-admin" });

await test("no portal groups at all offers the demo", async ({ page }) => {
  await ctl("empty=1");
  await page.reload();
  await page.waitForSelector(".tg-launcher");
  await start(page, "Review and approve a submission", "guided");
  await page.getByRole("button", { name: "Watch the demo instead" }).click();
  await page.waitForSelector(DEMO_BANNER);
  await waitForStep(page, "review.item");
  assert((await page.locator(".tg-mode-chip").innerText()).toLowerCase().includes("fictional"), "not labelled");
}, { path: "/portal-admin" });

await test("a group with nothing to review explains and offers each way on", async ({ page }) => {
  await start(page, "Review and approve a submission", "guided");
  await waitForStep(page, "review.choose-group");
  await pick(page, "Grace Fellowship Youth");
  await page.getByRole("button", { name: "Choose another group" }).waitFor();
  assert((await dialog(page)).includes("Nothing from this group is waiting for review"), "no reason given");
  await page.getByRole("button", { name: "Choose another group" }).click();
  await waitForStep(page, "review.choose-group");
  await pick(page, "Community Bible Church");
  await waitForStep(page, "review.item");
}, { path: "/portal-admin" });

await test("a completed portal can be reopened but not reviewed", async ({ page }) => {
  await start(page, "Reopen or remove a task", "guided");
  await waitForStep(page, "corrections.choose-group");
  await pick(page, "Lakeside");
  await waitForStep(page, "corrections.correct");
  await visible(page, "portal-correct-completed").click();
  await waitForStep(page, "corrections.reopen");
  assert((await dialog(page)).includes("switched off"), "doesn't say it's off");
}, { path: "/portal-admin" });

await test("in the full walkthrough an unmet topic can be skipped", async ({ page }) => {
  await page.evaluate(([key, step]) => localStorage.setItem(key, JSON.stringify({ completed: {}, unfinished: { id: "portal", step, mode: "guided" } })),
    [TUTORIAL_PROGRESS_STORAGE_KEY, PORTAL_WALKTHROUGH.sections.find((section) => section.id === "review").start + 3]);
  await page.reload();
  await page.waitForSelector(".tg-launcher");
  await openLibrary(page);
  await page.locator(".tg-resume .tg-button-primary").click();
  await waitForStep(page, "review.choose-group");
  await pick(page, "Grace Fellowship Youth");
  await page.getByRole("button", { name: "Skip this topic" }).click();
  await waitForStep(page, "send-back.correct").catch(async () => {
    await page.getByRole("button", { name: "Skip this topic" }).waitFor();
  });
  assert((await page.locator(".tg-section-label").innerText()).includes("Send a submission back"), "didn't move on");
}, { path: "/portal-admin" });

await test("email topics explain when emails aren't set up", async ({ page }) => {
  await ctl("emailMissing=1");
  await page.reload();
  await page.waitForSelector(".tg-launcher");
  await start(page, "Check the sending mode and reminders", "guided");
  await page.getByRole("button", { name: "Watch the demo instead" }).waitFor({ timeout: 8000 });
  assert((await dialog(page)).includes("aren't set up"), "no reason given");
}, { path: "/portal-admin" });

/* ---------- Roles ---------- */

for (const [role, text, expected] of [
  ["viewer", "view-only", true],
  ["staff", "Only admins", true],
  ["admin", "Only admins", false],
]) {
  await test(`${role}: role notes on the sending controls`, async ({ page }) => {
    await ctl(`role=${role}`);
    await page.reload();
    await page.waitForSelector(".tg-launcher");
    await start(page, "Check the sending mode and reminders", "guided");
    await waitForStep(page, "sending.open-card");
    await visible(page, "portal-email-summary").click();
    await waitForStep(page, "sending.mode");
    assert((await dialog(page)).includes(text) === expected, `note ${expected ? "missing" : "shown"}`);
  }, { path: "/portal-admin" });
}

/* ---------- Loading and refresh ---------- */

await test("a slow list waits, and the choice appears when it loads", async ({ page }) => {
  await ctl("delay=3500");
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.open-portals");
  await visible(page, "nav-portals").click();
  await page.waitForSelector(target("portal-loading"));
  assert((await page.locator(".tg-choices").count()) === 0, "said there were no groups while loading");
  await page.waitForSelector(".tg-choices-list .tg-button", { timeout: 12000 });
});

await test("a target that disappears is explained and comes back", async ({ page }) => {
  await practiseToPanel(page);
  await page.locator(PAUSE).click();
  await visible(page, "portal-assign-tasks").click();
  await page.waitForSelector(target("portal-task-panel"), { state: "detached" });
  await page.locator(".tg-paused .tg-button-primary").click();
  await waitForStep(page, "tasks.catalog");
  await page.waitForSelector(target("portal-task-panel"));
}, { path: "/portal-admin" });

await test("typing is not interrupted by the step moving on", async ({ page }) => {
  await start(page, "Find a group and read its progress", "guided");
  await waitForStep(page, "find.summary");
  await next(page);
  await waitForStep(page, "find.search");
  const box = page.locator(`${target("portal-search")} input`);
  await box.click();
  await box.pressSequentially("Comm", { delay: 200 });
  assert((await stepId(page)) === "find.search", "moved on mid-word");
  await box.pressSequentially("unity", { delay: 200 });
  assert((await box.inputValue()) === "Community", "letters were lost");
}, { path: "/portal-admin" });

/* ---------- Nothing reaches the services ---------- */

const GUARDED_IN_CARD = ["portal-confirm", "portal-copy-link", "portal-open-portal"];

await test("every guarded control refuses click, keyboard and script in practice", async ({ context, page }) => {
  await practiseToPanel(page);
  await visible(page, "portal-task-table").locator("input[type=checkbox]").first().check({ force: true }).catch(() => {});
  await page.locator(NEXT).click({ force: true });
  await sleep(1200);

  const pagesBefore = context.pages().length;
  const guards = await page.locator("[data-tutorial-guard]").count();
  assert(guards >= 6, `only ${guards} guards on screen`);

  for (let index = 0; index < guards; index += 1) {
    const control = page.locator("[data-tutorial-guard]").nth(index);
    await control.click({ force: true, timeout: 1000 }).catch(() => {});
    await control.evaluate((element) => element.click()).catch(() => {});
    await control.focus().catch(() => {});
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await control.click({ button: "middle", force: true, timeout: 1000 }).catch(() => {});
  }

  await sleep(600);
  assert(context.pages().length === pagesBefore, "a new tab opened");
  for (const id of GUARDED_IN_CARD) assert((await page.locator(target(id)).count()) > 0, `${id} not exercised`);
}, { path: "/portal-admin" });

await test("mode, automatic emails and enable can't be changed in practice", async ({ page }) => {
  await start(page, "Check the sending mode and reminders", "guided");
  await waitForStep(page, "sending.open-card");
  await visible(page, "portal-email-summary").click();
  await waitForStep(page, "sending.mode");

  await page.getByRole("radio", { name: /Live/ }).click({ force: true });
  await page.locator(`${target("portal-email-mode")} input`).first().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.getByRole("checkbox", { name: /Automatic emails/ }).click({ force: true });
  await sleep(400);
  assert(await page.getByRole("radio", { name: /Test/ }).isChecked(), "mode moved");
  assert(!(await page.getByRole("checkbox", { name: /Automatic emails/ }).isChecked()), "automatic emails ticked");
}, { path: "/portal-admin" });

await test("no email goes out from the group's Emails panel in practice", async ({ page }) => {
  await start(page, "Set up a group's emails", "guided");
  await waitForStep(page, "group-emails.choose-group");
  await pick(page, "Community Bible Church");
  await waitForStep(page, "group-emails.open-emails");
  await visible(page, "portal-emails").click();
  await waitForStep(page, "group-emails.state");

  const panel = page.locator(target("portal-email-panel"));
  await panel.getByRole("button", { name: "Save", exact: true }).click({ force: true });
  await panel.getByRole("button", { name: /Resend welcome/ }).click({ force: true });
  await panel.getByRole("button", { name: /Send reminder now/ }).click({ force: true });
  await panel.locator('form input[type="email"]').fill("x@example.org", { force: true }).catch(() => {});
  await page.keyboard.press("Enter");
  await sleep(500);
  assert((await panel.getByText("x@example.org").count()) === 0, "the add form ran");
}, { path: "/portal-admin" });

await test("the network lock refuses writes in practice, and lifts on Pause", async (session) => {
  const { page } = session;
  await practiseToPanel(page);
  const locked = await tryWrites(page);
  assert(locked.every((entry) => entry.endsWith("refused")), locked.join(" "));
  assert((await writes()).length === 0, "reached the mock");

  await page.locator(PAUSE).click();
  assert((await page.locator(".tg-paused").innerText()).includes("Anything you save now is real"), "pause doesn't say it's real");
  const paused = await tryWrites(page);
  assert(paused.every((entry) => entry.endsWith("SENT")), `pause should give control back: ${paused.join(" ")}`);
  session.allowWrites = true;
}, { path: "/portal-admin" });

await test("the fictional demo refuses writes, even paused, and only reads", async ({ page, requests }) => {
  await start(page, "Set up a group's emails", "demo");
  await waitForStep(page, "group-emails.state", 30000);
  const running = await tryWrites(page);
  assert(running.every((entry) => entry.endsWith("refused")), running.join(" "));

  await page.locator(PAUSE).click();
  const paused = await tryWrites(page);
  assert(paused.every((entry) => entry.endsWith("refused")), paused.join(" "));

  const note = await page.locator(".tg-paused").innerText();
  assert(note.includes("still the fictional demo"), "pause doesn't say it's still fictional");

  for (const id of ["portal-copy-link", "portal-open-portal", "portal-open-booking"]) await visible(page, id).click({ force: true });
  const panel = page.locator(target("portal-email-panel"));
  await panel.getByRole("button", { name: "Save", exact: true }).click({ force: true });
  await sleep(400);
  assert((await page.locator(".tg-paused").innerText()).includes("nothing here can be saved"), "no explanation on a blocked click");
  assert((await page.locator(DEMO_BANNER).count()) === 1, "left the demo");

  const leaked = requests.filter((entry) => !entry.startsWith("GET") && !/auth|current_staff_role/.test(entry));
  assert(leaked.length === 0, `requests: ${leaked.join("; ")}`);
}, { path: "/portal-admin" });

/* ---------- Demo cleanup ---------- */

const fictionalStored = (page) =>
  page.evaluate(() => /Riverside|Maple Grove|fictional-demo|example\.org\b.*jordan\.smith/i.test(JSON.stringify({ ...localStorage, ...sessionStorage })));

await test("demo cleans up on End and keeps the real filter and panel", async ({ page }) => {
  await page.locator(`${target("portal-search")} input`).fill("Lakeside");
  await page.locator(`[data-tutorial-scope="b3"] ${target("portal-assign-tasks")}`).click();
  await visible(page, "portal-task-table").locator("input[type=checkbox]").first().check();
  await sleep(300);

  await start(page, "Review and approve a submission", "demo");
  await page.waitForSelector(DEMO_BANNER);
  assert((await page.getByText("Riverside Youth Fellowship").count()) > 0, "scene not shown");
  await waitForStep(page, "review.item");
  await page.locator(END).click();
  await page.waitForSelector(DEMO_BANNER, { state: "detached" });

  assert((await page.locator(`${target("portal-search")} input`).inputValue()) === "Lakeside", "search lost");
  assert(await visible(page, "portal-task-table").locator("input[type=checkbox]").first().isChecked(), "draft lost");
  assert((await page.getByText("Riverside Youth Fellowship").count()) === 0, "fictional group left behind");
  assert(!(await fictionalStored(page)), "fictional data stored");
}, { path: "/portal-admin" });

await test("demo cleans up on completion and on Restart", async ({ page }) => {
  await start(page, "Copy the portal link or open the portal", "demo");
  await waitForStep(page, "link.token", 30000);
  await page.locator(RESTART).click();
  await waitForStep(page, "link.token", 30000);
  assert((await page.locator(DEMO_BANNER).count()) === 1, "restart lost the scene");

  for (const id of ["link.token", "link.copy", "link.open"]) {
    await waitForStep(page, id, 30000);
    await next(page);
  }
  await page.waitForSelector(".tg-complete");
  assert((await page.locator(DEMO_BANNER).count()) === 0, "scene left on the complete card");
  assert((await page.locator(".tg-complete").innerText()).includes("fictional group is gone"), "doesn't say it ended");
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForFunction(() => location.pathname === "/contacts");
}, { path: "/contacts" });

await test("leaving the page during a paused demo ends it", async ({ page }) => {
  await start(page, "Assign tasks", "demo");
  await waitForStep(page, "tasks.open-tasks", 30000);
  await page.locator(PAUSE).click();
  await page.locator(target("nav-contacts")).first().click();
  await page.waitForFunction(() => location.pathname === "/contacts");
  await page.waitForSelector(".tg-paused", { state: "detached" });
  await sleep(600);
  assert((await page.evaluate(() => location.pathname)) === "/contacts", "pulled back");
  assert((await page.locator(".tg-launcher-bubble").innerText()).includes("fictional group is gone"), "no message");

  await page.locator(target("nav-portals")).click();
  await page.waitForSelector(target("portal-card"));
  assert((await page.locator(DEMO_BANNER).count()) === 0, "demo still on");
}, { path: "/portal-admin" });

await test("browser Back during a demo ends it", async ({ page }) => {
  await page.locator(target("nav-portals")).click();
  await page.waitForSelector(target("portal-card"));
  await start(page, "Assign tasks", "demo");
  await waitForStep(page, "tasks.open-tasks", 30000);
  await page.goBack();
  await page.waitForSelector(".tg-runner", { state: "detached" });
  assert((await page.locator(DEMO_BANNER).count()) === 0, "demo still on");
});

await test("a reload forgets the demo and resumes at the topic's start", async ({ page }) => {
  await start(page, "Assign tasks", "demo");
  await waitForStep(page, "tasks.assign", 60000);
  await page.reload();
  await page.waitForSelector(target("portal-card"));
  assert((await page.locator(DEMO_BANNER).count()) === 0, "demo survived a reload");
  assert(!(await fictionalStored(page)), "fictional data stored");
  await openLibrary(page);
  await page.locator(".tg-resume .tg-button-primary").click();
  await page.waitForSelector(DEMO_BANNER);
  await waitForStep(page, "tasks.open-tasks", 30000);
}, { path: "/portal-admin" });

await test("fictional groups never reach real lists", async ({ page }) => {
  await start(page, "Assign tasks", "demo");
  await waitForStep(page, "tasks.open-tasks", 30000);
  await page.locator(END).click();
  for (const path of ["/master-spreadsheet", "/contacts", "/calendar", "/reports"]) {
    await page.goto(new URL(path, page.url()).href);
    await page.waitForSelector(".tg-launcher");
    await sleep(800);
    assert(!(await page.locator("body").innerText()).includes("Riverside Youth"), `found on ${path}`);
  }
}, { path: "/portal-admin" });

/* ---------- Unsaved work ---------- */

async function expectWarning(page, title, text) {
  await start(page, title, "guided");
  await page.getByRole("alert").waitFor();
  assert((await page.getByRole("alert").innerText()).includes(text), "wrong work named");
}

await test("Housing edits are detected, and going back keeps them", async ({ page }) => {
  await page.locator(`${target("spreadsheet-open-booking")} >> visible=true`).first().click();
  await page.waitForSelector(target("booking-tabs"));
  await page.locator(`${target("booking-tabs")} button`, { hasText: "Housing" }).click();
  await page.getByRole("button", { name: /Edit/ }).first().click();
  await expectWarning(page, "Assign tasks", "Housing edits");
  await page.getByRole("button", { name: "Go back and save it" }).click();
  await sleep(300);
  assert((await page.getByRole("button", { name: "Save Changes" }).count()) === 1, "left editing");
  assert((await page.locator(".tg-runner").count()) === 0, "started anyway");
}, { path: "/master-spreadsheet" });

await test("Checklist edits are detected", async ({ page }) => {
  await page.locator(`${target("spreadsheet-open-booking")} >> visible=true`).first().click();
  await page.waitForSelector(target("booking-tabs"));
  await page.locator(`${target("booking-tabs")} button`, { hasText: "Checklists" }).click();
  await page.locator(".booking-checklist-add-form input").first().fill("Practice list");
  await expectWarning(page, "Assign tasks", "a checklist item");
}, { path: "/master-spreadsheet" });

await test("the Form is only flagged once something is typed, in every tutorial", async ({ page }) => {
  await start(page, "Navigate the Calendar", "guided");
  await waitForStep(page, "open-calendar");
  await page.locator(END).click();
  await sleep(300);
  await page.locator(`${target("nav-form")}`).first().click();
  await page.waitForSelector(`${target("booking-form-group-name")}`);
  await page.locator(`${target("booking-form-group-name")} input, input${target("booking-form-group-name")}`).first().fill("My own group");
  await expectWarning(page, "Navigate the Calendar", "the booking form");
  await page.getByRole("button", { name: "Start anyway" }).click();
  await waitForStep(page, "open-calendar");
});

await test("Portal choices are detected for practice but stay safe under a demo", async ({ page }) => {
  await visible(page, "portal-assign-tasks").click();
  await visible(page, "portal-task-table").locator("input[type=checkbox]").first().check();
  await sleep(300);
  await expectWarning(page, "Assign tasks", "task choices");
  await page.getByRole("button", { name: "Go back and save it" }).click();
  await start(page, "Assign tasks", "demo");
  await page.waitForSelector(DEMO_BANNER);
  assert((await page.getByRole("alert").count()) === 0, "needless warning");
}, { path: "/portal-admin" });

await test("work begun during a pause stops Resume until it's dealt with", async ({ page }) => {
  await start(page, "Find a group and read its progress", "guided");
  await waitForStep(page, "find.summary");
  await page.locator(PAUSE).click();
  await page.locator(target("nav-form")).first().click();
  await page.locator(`${target("booking-form-group-name")} input, input${target("booking-form-group-name")}`).first().fill("Real work");
  await page.locator(".tg-paused .tg-button-primary").click();
  await sleep(300);
  assert((await page.locator(".tg-paused").innerText()).includes("the booking form"), "didn't stop");
}, { path: "/portal-admin" });

/* ---------- Navigation and progress ---------- */

await test("Back in a topic never reaches another topic", async ({ page }) => {
  await start(page, "Share documents", "guided");
  await waitForStep(page, "documents.choose-group");
  await pick(page, "Community Bible Church");
  await waitForStep(page, "documents.open-documents");
  assert((await page.locator(BACK).getAttribute("aria-disabled")) === "true", "Back leaves the topic");
}, { path: "/portal-admin" });

await test("Next can't skip a required navigation step", async ({ page }) => {
  await start(page, "Assign tasks", "guided");
  await waitForStep(page, "tasks.open-portals");
  await next(page);
  await sleep(400);
  assert((await stepId(page)) === "tasks.open-portals", "skipped");
  assert((await dialog(page)).includes("Portals in the sidebar"), "no hint");
});

await test("Restart returns to the chosen topic and forgets the group", async ({ page }) => {
  await practiseToPanel(page);
  await page.locator(RESTART).click();
  await waitForStep(page, "tasks.choose-group");
  assert((await page.locator(".tg-section-label").count()) === 0, "standalone topic shows walkthrough position");
}, { path: "/portal-admin" });

await test("topic finishes with Done or Continue, and continues without restarting", async ({ page }) => {
  await start(page, "Copy the portal link or open the portal", "guided");
  await waitForStep(page, "link.choose-group");
  await pick(page, "Community Bible Church");
  for (const id of ["link.token", "link.copy", "link.open"]) {
    await waitForStep(page, id);
    await next(page);
  }
  await page.waitForSelector(".tg-complete");
  await page.getByRole("button", { name: "Done" }).waitFor();
  await page.getByRole("button", { name: "Continue the full walkthrough" }).click();
  await waitForStep(page, "group-emails.open-emails");
  const label = await page.locator(".tg-section-label").innerText();
  assert(label.includes("Topic 6 of 10"), label);

  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), TUTORIAL_PROGRESS_STORAGE_KEY);
  assert(stored.completed["portal/link"], "topic not recorded");
  assert(!stored.completed.portal, "walkthrough marked complete");
  assert(stored.unfinished.id === "portal", "not in the walkthrough");

  await page.waitForFunction((back) => document.querySelector(".tg-controls button")?.getAttribute("aria-disabled") !== "true", BACK);
  await page.locator(BACK).click();
  await waitForStep(page, "link.open");
  assert((await page.locator(".tg-section-label").innerText()).includes("Topic 5 of 10"), "Back didn't cross into the topic before");
}, { path: "/portal-admin" });

await test("Back crosses into a closed panel in the demo and the outcome rewinds", async ({ page }) => {
  await page.evaluate(([key, step]) => localStorage.setItem(key, JSON.stringify({ completed: {}, unfinished: { id: "portal", step, mode: "demo" } })),
    [TUTORIAL_PROGRESS_STORAGE_KEY, PORTAL_WALKTHROUGH.sections.find((section) => section.id === "documents").start]);
  await page.reload();
  await page.waitForSelector(".tg-launcher");
  await openLibrary(page);
  await page.locator(".tg-resume .tg-button-primary").click();
  await waitForStep(page, "documents.custom", 30000);
  const before = await page.locator(target("portal-doc-panel")).count();
  assert(before === 1, "documents panel not open");

  await page.locator(PAUSE).click();
  await page.locator(".tg-paused .tg-button-primary").click();
  await page.locator(BACK).click();
  await waitForStep(page, "documents.open-documents", 30000);
  await page.locator(BACK).click();
  await waitForStep(page, "tasks.assigned", 30000);
  assert((await page.getByText("Submit Schedule").count()) > 0, "the earlier outcome is missing");
  await page.locator(BACK).click();
  await waitForStep(page, "tasks.assign", 30000);
  await page.waitForSelector(target("portal-task-panel"));
  assert((await page.locator(`${target("portal-checklist")}`).getByText("Submit Schedule").count()) === 0, "the outcome didn't rewind");
}, { path: "/portal-admin" });

await test("an outdated saved step resumes safely", async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ completed: {}, unfinished: { id: "portal", step: 9999, mode: "guided" } })), TUTORIAL_PROGRESS_STORAGE_KEY);
  await page.reload();
  await page.waitForSelector(".tg-launcher");
  await openLibrary(page);
  await page.locator(".tg-resume .tg-button-primary").click();
  await waitForStep(page, "recap");
}, { path: "/portal-admin" });

await test("the library shows the walkthrough with grouped topics, and search finds one", async ({ page }) => {
  await openLibrary(page);
  await page.locator(".tg-tutorial-item", { hasText: "How do I manage a group's portal?" }).waitFor();
  assert(!(await page.locator(".tg-tutorial-item", { hasText: "Assign tasks" }).isVisible()), "topics aren't tucked away");
  await page.locator(".tg-topics summary").click();
  for (const group of ["Set up a portal", "Reach the guest", "Review what comes back"]) {
    await page.locator(".tg-topics h4", { hasText: group }).waitFor();
  }
  await page.locator(".tg-search input").fill("send back");
  await page.locator(".tg-tutorial-item", { hasText: "Send a submission back" }).waitFor();
  assert((await page.locator(".tg-topics .tg-tutorial-item").count()) === 1, "search didn't narrow the topics");
});

await test("keyboard alone can pick a group and move on", async ({ page }) => {
  await start(page, "Copy the portal link or open the portal", "guided");
  await waitForStep(page, "link.choose-group");
  await page.locator(".tg-choices-list .tg-button").first().focus();
  await page.keyboard.press("Enter");
  await waitForStep(page, "link.token");
  await page.locator(NEXT).focus();
  await page.keyboard.press("Enter");
  await waitForStep(page, "link.copy");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".tg-paused");
}, { path: "/portal-admin" });

await test("reduced motion runs the demo", async ({ page }) => {
  await start(page, "Copy the portal link or open the portal", "demo");
  await waitForStep(page, "link.token", 30000);
}, { path: "/portal-admin", size: { reducedMotion: "reduce" } });

await test("a narrow screen keeps the panel and dialogue usable", async ({ page }) => {
  await start(page, "Assign tasks", "demo");
  await waitForStep(page, "tasks.catalog", 40000);
  const fits = await page.evaluate(() => {
    const dialog = document.querySelector(".tg-dialog").getBoundingClientRect();
    return dialog.left >= 0 && dialog.right <= innerWidth && dialog.bottom <= innerHeight;
  });
  assert(fits, "dialogue off screen");
}, { path: "/portal-admin", size: { width: 360, height: 640 } });

const failed = results.filter((passed) => !passed).length;
console.log(`\n${results.length - failed} of ${results.length} passed`);
process.exit(failed ? 1 : 0);
