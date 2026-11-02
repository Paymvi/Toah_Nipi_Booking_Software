// Run with the local Vite server on 5179 and an isolated headless Chrome on 9225.
// Uses Node's native CDP/WebSocket support; no browser dependency or live data.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const page = await fetch('http://127.0.0.1:9225/json/new', { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  }
  if (message.method === 'Page.javascriptDialogOpening') { cdp('Page.handleJavaScriptDialog', { accept: false }); }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
});
function cdp(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(expression, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error(`Timed out: ${label}\n` + await evaluate('document.body.innerText.slice(-2800)'));
}
async function click(selector) { await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function button(text, root = '.tn-tour-dialogue') {
  const expression = `Array.from(document.querySelectorAll(${JSON.stringify(root + ' button')})).find(b => (b.textContent.trim() === ${JSON.stringify(text)} || b.firstChild?.textContent.trim() === ${JSON.stringify(text)}))`;
  await until(`Boolean(${expression} && !(${expression}).disabled)`, `enabled ${text}`);
  await evaluate(`(${expression}).click()`);
}
async function field(selector, value) {
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const p = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}
async function step(number) { await until(`document.querySelector('.tn-tour-step')?.textContent.includes('Step ${number} of')`, `step ${number}`); }
async function start(title, mode) {
  await click('.tn-tour-launcher');
  await until(`Array.from(document.querySelectorAll('.tn-tour-option')).some(b => b.querySelector('strong').textContent === ${JSON.stringify(title)})`, title);
  await evaluate(`Array.from(document.querySelectorAll('.tn-tour-option')).find(b => b.querySelector('strong').textContent === ${JSON.stringify(title)}).click()`);
  await button(mode === 'demo' ? 'Show me how to do it' : 'Walk me through it while I do it', '.tn-tour-panel');
  await step(1);
}
async function exit() { await click('.tn-tour-dialogue header > button'); await click('.tn-tour-panel header > button'); }
async function load(query = '') {
  await cdp('Page.navigate', { url: `http://127.0.0.1:5179/tests/tutorial-browser.html${query}` });
  await until("Boolean(document.querySelector('.tn-tour-launcher'))", 'staff fixture');
}
await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
try {
  console.log('Browser connected; loading mocked staff app');
  await load();
  await start('Prepare a new booking', 'interactive');
  // Wrong navigation must not advance.
  await click('[data-tutorial="nav-reports"]');
  await sleep(500);
  await step(1);
  await click('[data-tutorial="nav-form"]');
  await step(2); await button('Next'); await step(3);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.tn-tour-dialogue footer button')).find(b => b.textContent === 'Next').disabled"), true);
  await field('.tn-tour-practice input[name="group"]', 'Fictional Sample');
  await field('.tn-tour-practice input[name="contact"]', 'Alex Example');
  await field('.tn-tour-practice select', 'sample');
  await button('Next'); await step(4); await button('Next'); await step(5);
  await field('.tn-tour-practice input[name="arrival"]', '2026-11-12');
  await field('.tn-tour-practice input[name="departure"]', '2026-11-10');
  await field('.tn-tour-practice input[name="guests"]', '24');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.tn-tour-dialogue footer button')).find(b => b.textContent === 'Next').disabled"), true);
  await field('.tn-tour-practice input[name="departure"]', '2026-11-14');
  await button('Next'); await step(6); await button('Next'); await step(7);
  assert.equal(await evaluate("document.querySelector('[data-tutorial=booking-form] input[name=organizationName]').value"), '');
  await button('Finish'); await until("document.querySelector('.tn-tour-finished')?.textContent.includes('Nicely done')", 'practice complete');
  await exit();
  console.log('PASS interactive preparation: wrong navigation, valid practice, no real form writes, completion');

  await start('Navigate the Calendar', 'interactive');
  await click('[data-tutorial="nav-calendar"]'); await step(2);
  for (const [target, number] of [['calendar-week',3], ['calendar-year',4], ['calendar-month',5], ['calendar-next',6], ['calendar-today',7]]) {
    await click(`[data-tutorial="${target}"]`); await step(number);
  }
  await button('Finish'); await until("Boolean(document.querySelector('.tn-tour-finished'))", 'calendar finish'); await exit();
  console.log('PASS interactive calendar: rendered mode and date changes');

  await start('View a booking and its Overview', 'interactive');
  await click('[data-tutorial="nav-spreadsheet"]'); await step(2); await button('Next'); await step(3);
  await click('[data-tutorial="booking-link"]'); await step(5);
  await button('Next'); await step(6); await button('Finish'); await until("Boolean(document.querySelector('.tn-tour-finished'))", 'overview finish'); await exit();
  console.log('PASS interactive profile: actual selected record and Overview state');

  await start('Access and read Reports', 'interactive');
  await click('[data-tutorial="nav-reports"]'); await step(2);
  await field('[data-tutorial="reports-range"]', 'custom'); await step(3);
  await button('Next'); await step(4); await button('Next'); await step(5); await button('Next'); await step(6); await button('Finish');
  await until("Boolean(document.querySelector('.tn-tour-finished'))", 'reports finish'); await exit();
  console.log('PASS interactive reports: actual custom range state');

  for (const [title, total] of [['Prepare a new booking',7], ['View a booking and its Overview',6], ['Navigate the Calendar',7], ['Access and read Reports',6]]) {
    await start(title, 'demo');
    await until("document.querySelector('[data-tutorial=staff-view]').inert", 'inert staff application');
    if (title === 'Prepare a new booking') {
      await button('Pause'); await sleep(8000); await step(1);
      assert.equal(await evaluate("document.querySelector('[data-tutorial=staff-view]').inert"), true);
      await button('Resume');
      await step(2); // Automatic demo navigation and advancement.
      await button('Previous'); await step(1);
    }
    for (let index = 1; index <= total; index++) {
      await step(index);
      await button(index === total ? 'Finish' : 'Next');
    }
    await until("Boolean(document.querySelector('.tn-tour-finished'))", `${title} demo complete`);
    await exit();
    assert.equal(await evaluate("document.querySelector('[data-tutorial=staff-view]').inert"), false);
    console.log(`PASS demo ${title}`);
  }
  assert.deepEqual(await evaluate("window.tutorialRequests.filter(r => r.method !== 'GET' && !r.url.endsWith('/rpc/current_staff_role'))"), []);
  console.log('PASS no database mutations across all tours/modes');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await start('Navigate the Calendar', 'demo');
  await step(1);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await until("(() => {const r=document.querySelector('.tn-tour-dialogue').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()", 'mobile dialogue bounds');
  await evaluate("document.querySelector('.tn-tour-dialogue button:last-child').focus()");
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("Boolean(document.activeElement.closest('.tn-tour-dialogue'))"), true);
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = join(tmpdir(), 'tutorial-gnome-mobile.png');
  await writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));
  console.log(`PASS mobile bounds, reduced motion, demo keyboard isolation; screenshot ${screenshotPath}`);
  await button('Restart'); await step(1); await exit();

  await load('?empty');
  await start('View a booking and its Overview', 'interactive');
  await click('[data-tutorial="nav-spreadsheet"]'); await step(2); await button('Next'); await step(3);
  await button('Skip step (not completed)'); await step(4);
  await button('Skip step (not completed)'); await step(5);
  await button('Skip step (not completed)'); await step(6);
  await button('Skip step (not completed)');
  await until("document.querySelector('.tn-tour-finished')?.textContent.includes('not marked complete')", 'honest skipped completion');
  await exit();
  console.log('PASS empty data recovery and incomplete status');

  await cdp('Page.navigate', { url: 'http://127.0.0.1:5179/tests/tutorial-browser.html?login' });
  await until("Boolean(document.querySelector('.staff-login-page'))", 'login');
  assert.equal(await evaluate("document.querySelector('.tn-tour-launcher') === null"), true);
  assert.deepEqual(errors, []);
  console.log('PASS no gnome before staff authentication; no browser exceptions');
} finally {
  await cdp('Page.close');
  socket.close();
}
