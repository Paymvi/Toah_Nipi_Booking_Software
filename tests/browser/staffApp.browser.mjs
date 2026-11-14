// Staff app in real Chrome against a LOCAL Supabase stack seeded with
// supabase/tests/staff-app-seed.local.mjs (fictional data, real RPCs and RLS).
// Signs in through the login form as each account; nothing leaves localhost.
//
//   APP_URL=http://localhost:5333 node tests/browser/staffApp.browser.mjs [--shots=docs/staff-app/screenshots]
//
// Vite must point at the local stack (see docs/staff-app/IMPLEMENTATION_NOTES.md).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const APP = process.env.APP_URL || "http://localhost:5333";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = (process.argv.find((arg) => arg.startsWith("--shots=")) || "").slice(8);
const PASSWORD = "Local-demo-1!";
const SIZES = [
  { name: "phone360", width: 360, height: 780, touch: true },
  { name: "phone390", width: 390, height: 844, touch: true },
  { name: "tablet", width: 820, height: 1180, touch: true },
  { name: "desktop", width: 1440, height: 900, touch: false },
];

let failures = 0;
let passes = 0;
const fail = (message) => {
  failures += 1;
  console.log(`FAIL ${message}`);
};
const ok = (message) => {
  passes += 1;
  console.log(`ok   ${message}`);
};
const expect = (condition, message) => (condition ? ok(message) : fail(message));

async function session(size) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    ...(size.touch && { isMobile: true, hasTouch: true }),
  });
  const requests = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol === "data:") {
      requests.push(`${route.request().method()} ${url.pathname}`);
      return route.continue();
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(message.text())) errors.push(message.text());
  });
  return { browser, context, page, errors, requests };
}

async function signIn(page, email) {
  await page.goto(`${APP}/staff`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".sa-app, .dashboard-sidebar");
}

async function settle(page) {
  await page.waitForSelector(".sa-app");
  await page.waitForFunction(() => !document.querySelector(".sa-main")?.textContent.includes("Loading…"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
}

// Elements that stick out of the viewport, outside any element that scrolls or clips sideways on purpose.
async function overflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollers = (element) => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) return true;
      }
      return false;
    };
    return [...document.querySelectorAll(".sa-app *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && (rect.right > width + 1 || rect.left < -1) && !scrollers(element);
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} right=${Math.round(element.getBoundingClientRect().right)}`);
  });
}

// Controls smaller than 44px tall (inline text links inside sentences are exempt).
async function smallTargets(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".sa-app button, .sa-app summary, .sa-app input, .sa-nav a, .sa-row, .sa-mywork, .sa-week-day")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height && rect.height < 43.5 && getComputedStyle(element).visibility !== "hidden";
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className} ${Math.round(element.getBoundingClientRect().height)}px "${element.textContent.trim().slice(0, 30)}"`)
  );
}

// Content hidden behind the fixed bottom bar at the end of the page.
async function coveredByNav(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".sa-nav");
    if (!nav || getComputedStyle(nav).position !== "fixed") return false;
    window.scrollTo(0, document.body.scrollHeight);
    document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
    const items = [...document.querySelectorAll(".sa-main > *")];
    const last = items[items.length - 1];
    if (!last) return false;
    return last.getBoundingClientRect().bottom > nav.getBoundingClientRect().top + 1;
  });
}

async function visit(s, size, route, name, checks = {}) {
  await s.page.goto(`${APP}${route}`);
  await settle(s.page);
  const label = `${size.name} ${name}`;
  const wide = await overflow(s.page);
  expect(!wide.length, `${label}: no page-wide horizontal overflow ${wide.join("; ")}`);
  if (size.touch) {
    const small = await smallTargets(s.page);
    expect(!small.length, `${label}: touch targets at least 44px ${small.join("; ")}`);
    expect(!(await coveredByNav(s.page)), `${label}: bottom bar does not cover the end of the page`);
  }
  const fontSize = await s.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".sa-main")).fontSize));
  expect(fontSize >= 16, `${label}: main text is at least 16px (${fontSize})`);
  for (const [text, should] of Object.entries(checks)) {
    const present = (await s.page.locator(".sa-main").innerText()).toLowerCase().includes(text.toLowerCase());
    expect(present === should, `${label}: ${should ? "shows" : "does not show"} "${text}"`);
  }
  if (SHOTS) {
    await s.page.evaluate(() => window.scrollTo(0, 0));
    await s.page.screenshot({ path: path.join(SHOTS, `${name}-${size.name}.png`), fullPage: true });
  }
}

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const tomorrow = await (async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
})();

/* 1. Kitchen account on every size. */
for (const size of SIZES) {
  const s = await session(size);
  await signIn(s.page, "cook@example.test");
  await visit(s, size, "/staff", "today", {
    "Cedar Hill Church Men's Retreat": true,
    "Board Dinner": false,
    "Cancelled Choir": false,
    "Private": false,
    "Changed since yesterday": true,
  });
  await visit(s, size, "/staff/calendar", "calendar", { "Northfield Youth Group": true, "Staff Training Lunch": true });
  await visit(s, size, "/staff/group/demo-cedar", "group", {
    "Tree nut allergy": true,
    "Projector in Bethel meeting room": true,
    "Dinner time": true,
    "private@example.test": false,
    "555-0100": false,
  });
  await visit(s, size, "/staff/kitchen", "kitchen-day", { "Dinner": true, "Maple Grove Quilting Circle": true });
  await visit(s, size, `/staff/kitchen?date=${tomorrow}`, "kitchen-tomorrow", {
    "Includes estimates": true,
    "Internal": true,
    "Day campers": true,
  });
  await visit(s, size, "/staff/kitchen?view=booking&booking=demo-cedar", "kitchen-booking", {
    "Meal Service Plan": true,
    "Dietary Alerts": true,
    "Additional Dietary Note": true,
    "The booking stores one guest count for the stay": true,
  });
  await visit(s, size, "/staff/kitchen?view=booking&booking=demo-riverside", "kitchen-booking-review", { "Needs review": true });
  expect(!s.requests.some((request) => /\/rest\/v1\/(bookings|guest_inquiries|portal_)/.test(request)), `${size.name}: the kitchen account never requests office tables`);
  expect(!s.errors.length, `${size.name}: no console errors ${s.errors.slice(0, 3).join(" | ")}`);
  await s.browser.close();
}

/* 2. Phone layout specifics. */
{
  const size = SIZES[1];
  const s = await session(size);
  await signIn(s.page, "cook@example.test");
  await s.page.goto(`${APP}/staff/kitchen?view=booking&booking=demo-cedar`);
  await settle(s.page);
  const order = await s.page.evaluate(() => {
    const diet = document.querySelector(".sa-diet-panel").getBoundingClientRect().top;
    const plan = document.querySelector(".sa-kb-plan").getBoundingClientRect().top;
    const firstRow = document.querySelector(".sa-diet-table tbody tr");
    return { dietFirst: diet < plan, allergyFirst: firstRow?.classList.contains("is-allergy") };
  });
  expect(order.dietFirst, "phone By Booking: Dietary Alerts sit above the meal table");
  expect(order.allergyFirst, "phone By Booking: the allergy row comes first");
  const headers = await s.page.locator(".sa-plan-table thead th").allInnerTexts();
  expect(/6:30/.test(headers.join(" ")) && /Changed/.test(headers.join(" ")), "phone By Booking: column headers show service times and the changed dinner time");

  // Offline, failed refresh and expired session.
  await s.page.goto(`${APP}/staff`);
  await settle(s.page);
  await s.context.setOffline(true);
  await s.page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await s.page.waitForTimeout(300);
  expect(/Offline · showing/.test(await s.page.locator(".sa-freshness").innerText()), "offline: banner says what time the data is from");
  await s.context.setOffline(false);
  await s.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await s.page.waitForFunction(() => /Up to date/.test(document.querySelector(".sa-freshness")?.textContent || ""));
  ok("back online: refreshes to up to date");
  await s.page.route("**/rest/v1/rpc/staff_app_bookings", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' }));
  await s.page.getByRole("button", { name: "Refresh" }).click();
  await s.page.waitForFunction(() => /Could not refresh/.test(document.querySelector(".sa-freshness")?.textContent || ""));
  expect((await s.page.locator(".sa-main").innerText()).includes("Cedar Hill"), "failed refresh: keeps showing the last data, marked out of date");
  await s.page.unroute("**/rest/v1/rpc/staff_app_bookings");
  await s.page.route("**/rest/v1/rpc/staff_app_bookings", (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"PGRST301","message":"JWT expired"}' }));
  await s.page.getByRole("button", { name: "Refresh" }).first().click();
  await s.page.waitForSelector("text=Your session has ended");
  expect(await s.page.getByRole("button", { name: "Sign in again" }).isVisible(), "expired session: offers Sign in again");
  await s.page.getByRole("button", { name: "Sign in again" }).click();
  await s.page.waitForSelector('input[type="password"]');
  ok("Sign in again returns to the login form");

  // Account switch: the next account sees none of the previous account's data.
  await s.page.unroute("**/rest/v1/rpc/staff_app_bookings");
  await s.page.fill('input[type="email"]', "crew@example.test");
  await s.page.fill('input[type="password"]', PASSWORD);
  await s.page.click('button[type="submit"]');
  await s.page.waitForSelector(".sa-app");
  await s.page.goto(`${APP}/staff/group/demo-cedar`);
  await settle(s.page);
  const text = await s.page.locator(".sa-app").innerText();
  expect(!text.includes("Tree nut allergy") && !text.includes("Dietary needs"), "after switching to a non-kitchen account: no dietary information");
  expect(await s.page.locator(".sa-nav").innerText().then((navText) => !navText.includes("Kitchen")), "non-kitchen account: no Kitchen tab");
  await s.page.goto(`${APP}/staff/kitchen`);
  await settle(s.page);
  expect((await s.page.locator(".sa-main").innerText()).includes("The kitchen view is for kitchen staff"), "non-kitchen account: kitchen route explains instead of showing data");
  await s.page.goto(`${APP}/dashboard`);
  await s.page.waitForURL(/\/staff$/);
  ok("limited account: office routes redirect to the staff app");
  expect(!s.requests.some((request) => /\/rest\/v1\/bookings/.test(request)), "limited accounts never request the bookings table");
  if (SHOTS) {
    await s.page.goto(`${APP}/staff`);
    await settle(s.page);
    await s.page.screenshot({ path: path.join(SHOTS, "crew-today-phone390.png"), fullPage: true });
  }
  expect(!s.errors.length, `phone flows: no console errors ${s.errors.slice(0, 3).join(" | ")}`);
  await s.browser.close();
}

/* 3. Office account: office app unchanged, staff app link, access panel, hosting opt-in. */
{
  const size = SIZES[3];
  const s = await session(size);
  await signIn(s.page, "office@example.test");
  await s.page.goto(`${APP}/dashboard`);
  await s.page.waitForSelector(".dashboard-sidebar");
  expect(await s.page.getByRole("button", { name: "Staff app" }).isVisible(), "office: sidebar has a Staff app link");
  await s.page.getByRole("button", { name: "User Admin" }).click();
  await s.page.waitForSelector(".staff-access-card");
  await s.page.waitForSelector("text=cook@example.test");
  ok("office admin: Sign-in access lists individual accounts");
  if (SHOTS) await s.page.locator(".staff-access-card").screenshot({ path: path.join(SHOTS, "office-user-admin-access-desktop.png") });
  await s.page.getByRole("button", { name: "Calendar" }).first().click();
  await s.page.waitForTimeout(800);
  expect((await s.page.locator("body").innerText()).includes("Cedar Hill"), "office: the existing Calendar still shows bookings");
  await s.page.getByRole("button", { name: "Staff app" }).click();
  await s.page.waitForURL(/\/staff$/);
  await settle(s.page);
  expect((await s.page.locator(".sa-account").innerText()).includes("Office"), "office: staff app opens, labelled Office");
  expect(!s.errors.length, `office: no console errors ${s.errors.slice(0, 3).join(" | ")}`);
  await s.browser.close();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
