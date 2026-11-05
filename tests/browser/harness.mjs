// Real Chrome, a fake session, and every non-localhost request blocked, so production is never reached.
import { chromium } from "playwright-core";

export const APP = process.env.APP_URL || "http://localhost:5297";
const MOCK = `http://127.0.0.1:${process.env.MOCK_PORT || 54419}`;
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const ctl = async (query) => (await fetch(`${MOCK}/__ctl?${query}`)).json();
export const writes = async () => (await ctl("x=1")).writes;

export const NEXT = ".tg-controls .tg-button:last-child";
export const target = (id) => `[data-tutorial-target~="${id}"]`;

export async function launch({ width = 1440, height = 900, reducedMotion = "no-preference" } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });

  const requests = [];
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol === "data:") {
      if (url.port !== new URL(APP).port) requests.push(`${request.method()} ${url.pathname}`);
      return route.continue();
    }
    if (!url.hostname.startsWith("fonts.")) requests.push(`BLOCKED ${url.href}`);
    return route.abort();
  });

  await context.addInitScript(() => {
    if (window !== window.top) return; // the email preview is a sandboxed frame with no storage
    const expiresAt = Math.floor(Date.now() / 1000) + 36000;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: "mock", refresh_token: "mock", expires_at: expiresAt, expires_in: 36000, token_type: "bearer",
      user: { id: "u1", email: "staff@example.org", aud: "authenticated", role: "authenticated" },
    }));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|Blocked by the tutorial/.test(message.text())) errors.push(`console: ${message.text()}`);
  });

  return { browser, context, page, errors, requests };
}

export async function open(session, path) {
  await session.page.goto(APP + path);
  await session.page.waitForSelector(".tg-launcher");
  await sleep(700);
}

export async function openLibrary(page) {
  await page.getByRole("button", { name: /Tutorial gnome/ }).click();
  await page.waitForSelector(".tg-library");
}

// Starts a tutorial from the library. Topics live under the walkthrough's disclosure.
export async function start(page, title, mode) {
  await openLibrary(page);
  const summary = page.locator(".tg-topics summary");
  const item = page.locator(".tg-tutorial-item", { hasText: title }).first();
  if (!(await item.isVisible()) && (await summary.count())) await summary.click();
  await item.click();
  await page.getByRole("button", { name: mode === "demo" ? /Show me how/ : /Walk me through it/ }).click();
}

export const stepId = (page) => page.locator(".tg-dialog").getAttribute("data-tutorial-step", { timeout: 2000 }).catch(() => "");
export const dialog = async (page) => (await page.locator(".tg-dialog-body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
export const isReady = (page) => page.evaluate((next) => {
  const button = document.querySelector(next);
  return Boolean(button) && button.getAttribute("aria-disabled") !== "true";
}, NEXT);

export async function waitForStep(page, id, timeout = 20000) {
  await page.waitForFunction((id) => document.querySelector(".tg-dialog")?.dataset.tutorialStep === id, id, { timeout });
  await sleep(450);
}

// The dialogue must be on screen and the highlighted control must not be hidden behind it.
export function checkPlacement(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector(".tg-dialog")?.getBoundingClientRect();
    const spot = document.querySelector(".tg-spotlight")?.getBoundingClientRect();
    if (!dialog) return "no dialogue";
    if (dialog.top < 0 || dialog.left < 0 || dialog.bottom > innerHeight + 1 || dialog.right > innerWidth + 1) return "dialogue off screen";
    if (!spot) return "no spotlight";
    if (document.documentElement.scrollWidth > innerWidth + 1) return "page scrolls sideways";
    const width = Math.min(dialog.right, spot.right) - Math.max(dialog.left, spot.left);
    const height = Math.min(dialog.bottom, spot.bottom) - Math.max(dialog.top, spot.top);
    const covered = width > 0 && height > 0 ? (width * height) / (spot.width * spot.height) : 0;
    return covered > 0.4 ? `dialogue covers ${Math.round(covered * 100)}% of the target` : "";
  });
}
