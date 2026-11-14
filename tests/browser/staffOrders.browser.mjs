// Staff app Orders in real Chrome against a LOCAL Supabase stack seeded with
// supabase/tests/staff-app-seed.local.mjs (fictional accounts, real RPCs).
// Nothing leaves localhost.
//
//   APP_URL=http://localhost:5333 node tests/browser/staffOrders.browser.mjs [--shots=folder]
//
// Workflow: a cook sends a two-item request (with a failed send and a double
// tap), crew sees it from another session, the cook edits it, the office
// updates items one by one until it is finished, the cook cancels a second
// request, and both show under Finished. Then the viewer and signed-out
// cases, and layout at phone, tablet and desktop sizes.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const APP = process.env.APP_URL || "http://localhost:5333";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = (process.argv.find((arg) => arg.startsWith("--shots=")) || "").slice(8);
const PASSWORD = "Local-demo-1!";
const SIZES = {
  phone360: { width: 360, height: 780, touch: true },
  phone390: { width: 390, height: 844, touch: true },
  tablet: { width: 820, height: 1180, touch: true },
  desktop: { width: 1440, height: 900, touch: false },
};
const tag = Date.now().toString(36);
const soap = `Dish soap ${tag}`;
const towels = `Bath towels ${tag}`;

let failures = 0;
let passes = 0;
const expect = (condition, message) => {
  if (condition) passes += 1;
  else failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
};

const sessions = [];
async function session(sizeName, email) {
  const size = SIZES[sizeName];
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    ...(size.touch && { isMobile: true, hasTouch: true }),
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol === "data:" ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(message.text())) errors.push(message.text());
  });
  const s = { browser, page, errors, size, sizeName, email };
  sessions.push(s);
  if (email) {
    await page.goto(`${APP}/staff/orders`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector(".sa-app");
    await page.goto(`${APP}/staff/orders`);
    await settle(page);
  }
  return s;
}

async function settle(page) {
  await page.waitForSelector(".sa-app");
  await page.waitForFunction(() => !document.querySelector(".sa-main")?.textContent.includes("Loading…"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

const card = (page, text) => page.locator(".sa-order").filter({ hasText: text });
async function openCard(page, text) {
  const summary = card(page, text).locator(".sa-order-summary");
  if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
  await card(page, text).locator(".sa-order-detail").waitFor();
}
const mainText = async (page) => (await page.locator(".sa-main").innerText()).replace(/\s+/g, " ");

async function layout(s, name) {
  const label = `${s.sizeName} ${name}`;
  const result = await s.page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = (element) => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(node).overflowX)) return true;
      }
      return false;
    };
    const wide = [...document.querySelectorAll(".sa-app *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && (rect.right > width + 1 || rect.left < -1) && !clipped(element);
      })
      .map((element) => `${element.tagName}.${element.className}`);
    // Checkboxes count by their whole label row; radios fill their pill.
    const small = [...document.querySelectorAll(".sa-main button, .sa-main summary, .sa-main a.sa-button, .sa-main select, .sa-main input:not([type=checkbox]):not([type=radio]), .sa-main .sa-choice, .sa-main .sa-check, .sa-main .sa-order-item.is-checkable, .sa-nav a")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height && rect.height < 43.5;
      })
      .map((element) => `${element.tagName}.${element.className} ${Math.round(element.getBoundingClientRect().height)}px "${element.textContent.trim().slice(0, 24)}"`);
    const nav = document.querySelector(".sa-nav");
    let covered = false;
    if (nav && getComputedStyle(nav).position === "fixed") {
      document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
      const last = [...document.querySelectorAll(".sa-main > *")].at(-1);
      covered = Boolean(last) && last.getBoundingClientRect().bottom > nav.getBoundingClientRect().top + 1;
      document.scrollingElement.scrollTop = 0;
    }
    return { wide: wide.slice(0, 4), small: small.slice(0, 4), covered };
  });
  expect(!result.wide.length, `${label}: no horizontal overflow ${result.wide.join("; ")}`);
  if (s.size.touch) {
    expect(!result.small.length, `${label}: touch targets at least 44px ${result.small.join("; ")}`);
    expect(!result.covered, `${label}: bottom bar does not cover the end of the page`);
  }
  if (SHOTS) await s.page.screenshot({ path: path.join(SHOTS, `orders-${name}-${s.sizeName}.png`), fullPage: true });
}

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

try {
  /* 1. Cook sends a two-item request on a phone. */
  const cook = await session("phone390", "cook@example.test");
  expect(await cook.page.locator(".sa-nav").getByText("Orders").isVisible(), "Orders is in the bottom navigation");
  await layout(cook, "list");
  await cook.page.getByRole("link", { name: "New request" }).click();
  await settle(cook.page);
  expect(await cook.page.getByRole("radio", { name: "Kitchen" }).isChecked(), "kitchen account: Kitchen is preselected");
  await layout(cook, "form-empty");

  const rows = cook.page.locator(".sa-item-row");
  await rows.nth(0).locator("input").nth(0).fill(soap);
  await rows.nth(0).locator("input").nth(1).fill("6 bottles");
  await cook.page.getByRole("button", { name: "Add another item" }).click();
  expect(await rows.nth(1).locator("input").nth(0).evaluate((el) => el === document.activeElement), "Add another item focuses the new item name");
  await rows.nth(1).locator("input").nth(0).fill(`Food containers ${tag}`);
  // Leave the quantity empty: the form must say so and keep everything typed.
  await cook.page.getByLabel("Notes (optional)").fill("Unscented if possible.");
  await cook.page.getByLabel("Product link (optional)").fill("example.com/soap");
  await cook.page.locator(".sa-check-urgent").click();
  await cook.page.getByRole("button", { name: "Send request" }).click();
  let text = await mainText(cook.page);
  expect(text.includes("Check the highlighted fields") && text.includes("How many?") && text.includes("starting with https://"), "missing quantity and a bad link are flagged");
  expect((await rows.nth(0).locator("input").nth(0).inputValue()) === soap, "typed input is kept after a validation error");
  await layout(cook, "form-errors");
  await rows.nth(1).locator("input").nth(1).fill("2 cases");
  await cook.page.getByLabel("Product link (optional)").fill("https://example.com/soap");

  // A failed send keeps the form; the retry uses the same id.
  await cook.page.route("**/rest/v1/rpc/staff_app_order_save", (route) => route.abort("internetdisconnected"));
  await cook.page.getByRole("button", { name: "Send request" }).click();
  await cook.page.locator(".sa-form-message-error").waitFor();
  text = await mainText(cook.page);
  expect(text.includes("Not sent") && text.includes("still here"), "a network failure says so and keeps the request");
  expect((await rows.nth(1).locator("input").nth(1).inputValue()) === "2 cases", "input is kept after a failed send");
  await cook.page.unroute("**/rest/v1/rpc/staff_app_order_save");

  // Double tap.
  let saveCalls = 0;
  cook.page.on("request", (request) => request.url().includes("staff_app_order_save") && (saveCalls += 1));
  await cook.page.getByRole("button", { name: "Send request" }).dblclick();
  await cook.page.locator(".sa-form-message-ok").waitFor();
  await settle(cook.page);
  expect(saveCalls === 1, `a double tap sends once (${saveCalls} calls)`);
  expect((await mainText(cook.page)).includes("Request sent"), "success message after sending");
  expect((await card(cook.page, soap).count()) === 1, "the request is listed once");
  text = await card(cook.page, soap).innerText();
  expect(/Urgent/.test(text) && /Kitchen/.test(text) && /Fictional|cook/i.test(text) && /Requested/.test(text), "card shows urgent, department, requester and status");
  await layout(cook, "list-sent");

  /* 2. Crew sees it from another session; no purchasing or edit controls. */
  const crew = await session("phone360", "crew@example.test");
  expect((await card(crew.page, soap).count()) === 1, "another staff session sees the request");
  await openCard(crew.page, soap);
  const crewCard = card(crew.page, soap);
  expect((await crewCard.locator(".sa-order-panel").count()) === 0, "crew gets no status controls");
  expect((await crewCard.getByRole("link", { name: "Edit request" }).count()) === 0, "crew cannot edit someone else's request");
  expect((await crewCard.innerText()).includes("6 bottles") && (await crewCard.innerText()).includes("Unscented"), "details show quantities and notes");
  await layout(crew, "detail");

  /* 3. Cook edits the unprocessed request. */
  await openCard(cook.page, soap);
  await card(cook.page, soap).getByRole("link", { name: "Edit request" }).click();
  await settle(cook.page);
  expect((await rows.nth(0).locator("input").nth(0).inputValue()) === soap, "edit form is prefilled");
  await rows.nth(0).locator("input").nth(1).fill("8 bottles");
  await cook.page.getByRole("button", { name: "Save changes" }).click();
  await cook.page.locator(".sa-form-message-ok").waitFor();
  await settle(cook.page);
  expect((await card(cook.page, soap).innerText()).includes("8 bottles"), "edited quantity is shown");

  /* 4. Office (purchasing) updates items one at a time. */
  const office = await session("desktop", "office@example.test");
  await office.page.getByLabel("Your name").first().fill("Pat Purchaser");
  await openCard(office.page, soap);
  const officeCard = card(office.page, soap);
  await officeCard.getByLabel(`Select Food containers ${tag}`).uncheck();
  await officeCard.getByRole("radio", { name: "Ordered" }).check();
  await officeCard.getByLabel("Note (optional)").fill("Arrives Tuesday");
  await officeCard.getByRole("button", { name: /Mark 1 item ordered/ }).click();
  await officeCard.getByText("Saved: 1 item marked ordered").waitFor();
  await officeCard.getByText("1 not ordered yet").waitFor().catch(() => {}); // the refresh lands just after the save
  text = await officeCard.innerText();
  expect(text.includes("1 ordered") && text.includes("1 not ordered yet"), "partial progress is shown on the request");
  expect(text.includes("Ordered by Pat Purchaser") && text.includes("Arrives Tuesday"), "who changed it, when and the note are shown");
  await layout(office, "purchasing");

  await cook.page.reload();
  await settle(cook.page);
  await openCard(cook.page, soap);
  expect((await card(cook.page, soap).getByRole("link", { name: "Edit request" }).count()) === 0, "requester cannot edit once purchasing started");
  expect((await card(cook.page, soap).innerText()).includes("can no longer be edited"), "requester is told why");

  // After the refresh every open item is ticked again.
  await officeCard.getByRole("radio", { name: "Received" }).check();
  await officeCard.getByRole("button", { name: /Mark 2 items received/ }).click();
  await office.page.getByText("now under Finished").waitFor();
  expect((await card(office.page, soap).count()) === 0, "finished request leaves the open list");
  await office.page.getByRole("tab", { name: "Finished" }).click();
  await settle(office.page);
  expect((await card(office.page, soap).innerText()).includes("Received"), "it is listed under Finished as Received");
  await openCard(office.page, soap);
  await card(office.page, soap).locator(".sa-order-history summary").click();
  text = await card(office.page, soap).innerText();
  expect(text.includes("Requested") && text.includes("Edited") && text.includes("Pat Purchaser"), "history keeps every step");

  /* 5. Cook cancels a second, unprocessed request. */
  await cook.page.goto(`${APP}/staff/orders/new`);
  await settle(cook.page);
  await cook.page.getByRole("radio", { name: "Turnover" }).check();
  await rows.nth(0).locator("input").nth(0).fill(towels);
  await rows.nth(0).locator("input").nth(1).fill("20");
  await cook.page.getByRole("button", { name: "Send request" }).click();
  await cook.page.locator(".sa-form-message-ok").waitFor();
  await settle(cook.page);
  await cook.page.getByLabel("Department").selectOption("turnover");
  expect((await cook.page.locator(".sa-order").count()) >= 1 && !(await mainText(cook.page)).includes(soap), "department filter narrows the list");
  await openCard(cook.page, towels);
  await card(cook.page, towels).getByRole("button", { name: "Cancel request" }).click();
  await card(cook.page, towels).getByRole("button", { name: "Yes, cancel it" }).click();
  await cook.page.getByText("Request cancelled").waitFor();
  await cook.page.getByRole("tab", { name: "Finished" }).click();
  await settle(cook.page);
  expect((await card(cook.page, towels).innerText()).includes("Cancelled"), "cancelled request is kept under Finished");
  await layout(cook, "finished");

  /* 6. Viewer can look but not request; signed out sees the sign-in form. */
  const viewer = await session("tablet", "viewer@example.test");
  expect((await viewer.page.getByRole("link", { name: "New request" }).count()) === 0, "viewer has no New request button");
  await viewer.page.goto(`${APP}/staff/orders/new`);
  await settle(viewer.page);
  expect((await mainText(viewer.page)).includes("cannot make or change"), "viewer cannot open the form");
  await viewer.page.goto(`${APP}/staff/orders`);
  await settle(viewer.page);
  await layout(viewer, "viewer");

  const signedOut = await session("phone360", null);
  await signedOut.page.goto(`${APP}/staff/orders`);
  await signedOut.page.waitForSelector('input[type="password"]');
  expect((await signedOut.page.locator(".sa-order").count()) === 0, "signed out: sign-in form, no requests");

  /* 7. The form at the remaining sizes. */
  for (const sizeName of ["phone360", "tablet", "desktop"]) {
    const s = sizeName === "phone360" ? crew : sizeName === "tablet" ? viewer : office;
    if (s === viewer) continue;
    await s.page.goto(`${APP}/staff/orders/new`);
    await settle(s.page);
    await s.page.getByRole("button", { name: "Add another item" }).click();
    await layout(s, "form");
  }

  for (const s of sessions) expect(!s.errors.length, `${s.sizeName} ${s.email || "signed out"}: no console errors ${s.errors.slice(0, 2).join(" | ")}`);
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error.stack || error}`);
} finally {
  await Promise.all(sessions.map((s) => s.browser.close()));
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
