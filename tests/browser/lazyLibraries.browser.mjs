// ExcelJS and JSZip load on first use, in real Chrome against the fictional mock. See README.md here for how to start both servers.
// Opening the office app downloads neither library; export, import and the signed-documents check still work;
// a library that cannot download shows a message instead of failing silently. Nothing leaves localhost.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { APP, ctl, launch, sleep, writes } from "./harness.mjs";

const folder = mkdtempSync(join(tmpdir(), "lazy-libraries-"));

// A fictional Master 2026 sheet with one group.
const sheetBook = new ExcelJS.Workbook();
const sheet = sheetBook.addWorksheet("Master 2026");
sheet.addRow(["Guest Group Name", "Arrival Date", "Departure Date", "Group Leader/Contact Person", "Meals", "Total # of Guests"]);
sheet.addRow(["Fictional Lazy Load Group", "6/5/2026", "6/7/2026", "Fictional Leader", "Fri dinner thru Sun lunch", "40"]);
const masterFile = join(folder, "fictional-master-2026.xlsx");
writeFileSync(masterFile, Buffer.from(await sheetBook.xlsx.writeBuffer()));
const notZipFile = join(folder, "fictional-not-a-zip.zip");
writeFileSync(notZipFile, "this is not a zip file");

let failures = 0;
async function check(name, body) {
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${String(error?.message || error).split("\n").slice(0, 6).join("\n     ")}`);
  }
}

const isLibrary = (url, name) => new RegExp(`node_modules/(\\.vite/deps/)?${name}|/${name}[.-]`, "i").test(url);

async function session({ block = "" } = {}) {
  const s = await launch();
  s.libraryRequests = [];
  s.page.on("request", (request) => {
    for (const name of ["exceljs", "jszip"]) if (isLibrary(request.url(), name)) s.libraryRequests.push(name);
  });
  if (block) await s.context.route((url) => isLibrary(url.href, block), (route) => route.abort());
  s.dialogs = [];
  s.page.on("dialog", (dialog) => {
    s.dialogs.push(dialog.message());
    dialog.type() === "confirm" ? dialog.accept() : dialog.dismiss();
  });
  await s.page.goto(`${APP}/dashboard`);
  await s.page.waitForSelector(".tg-launcher");
  await sleep(1000);
  return s;
}

const waitForDialog = async (s, count) => {
  for (let i = 0; i < 100 && s.dialogs.length < count; i += 1) await sleep(100);
  assert.ok(s.dialogs.length >= count, `expected ${count} dialog(s), saw ${s.dialogs.length}`);
};

await ctl("reset=1&hosting=1");

let main;
await check("opening the office app downloads neither library", async () => {
  main = await session();
  assert.deepEqual(main.libraryRequests, []);
});

await check("Export contact list loads the spreadsheet tool and downloads a workbook", async () => {
  const [download] = await Promise.all([
    main.page.waitForEvent("download"),
    main.page.getByRole("button", { name: "Export contact list" }).click(),
  ]);
  const saved = join(folder, "export.xlsx");
  await download.saveAs(saved);
  assert.equal(readFileSync(saved).subarray(0, 2).toString(), "PK", "an .xlsx (zip) file");
  assert.ok(main.libraryRequests.includes("exceljs"));
  assert.ok(!main.libraryRequests.includes("jszip"));
});

await check("a Master 2026 import reads the workbook and proposes the group", async () => {
  await ctl("clearWrites=1");
  const before = main.dialogs.length;
  await main.page.locator("input.dashboard-file-input").nth(3).setInputFiles(masterFile);
  // A confirm listing what will change, then the result.
  await waitForDialog(main, before + 2);
  const shown = main.dialogs.slice(before).join("\n");
  assert.ok(!/could not be (imported|loaded)/i.test(shown), shown);
  assert.match(shown, /New bookings that will be added: 1/);
  assert.match(shown, /Imported 1 master 2026 booking row/);
  assert.ok((await writes()).some((w) => w.startsWith("POST /rest/v1/bookings") && w.includes('"source_type":"Master 2026"')), "the parsed row was sent to the (mock) database");
});

await check("Hosting export still downloads a workbook", async () => {
  await main.page.goto(`${APP}/hosting`);
  await main.page.waitForSelector(".tg-launcher");
  await main.page.locator('[data-tutorial-target="hosting-mode-sheet"]').click();
  const exportButton = main.page.getByRole("button", { name: /^Export \d+/ });
  const [download] = await Promise.all([main.page.waitForEvent("download"), exportButton.click()]);
  assert.ok(await download.path());
});

await check("the signed-documents check loads the zip tool and reports an unreadable file", async () => {
  await main.page.goto(`${APP}/backup`);
  await main.page.waitForSelector(".signed-documents-backup");
  await main.page.locator('.signed-documents-backup input[type="file"]').setInputFiles(notZipFile);
  const message = await main.page.locator(".signed-documents-result").innerText();
  assert.ok(main.libraryRequests.includes("jszip"));
  assert.ok(!/could not be loaded/.test(message), message);
});
await main.browser.close();

await check("export with the spreadsheet tool unreachable says so, and works again after", async () => {
  const s = await session({ block: "exceljs" });
  await s.page.getByRole("button", { name: "Export contact list" }).click();
  await waitForDialog(s, 1);
  assert.match(s.dialogs.at(-1), /spreadsheet tool could not be loaded/);
  assert.ok(await s.page.getByRole("button", { name: "Export contact list" }).isEnabled());
  await s.browser.close();
});

await check("import with the spreadsheet tool unreachable says so", async () => {
  const s = await session({ block: "exceljs" });
  await s.page.locator("input.dashboard-file-input").nth(3).setInputFiles(masterFile);
  await waitForDialog(s, 1);
  assert.match(s.dialogs.at(-1), /could not be imported[\s\S]*spreadsheet tool could not be loaded/);
  assert.equal(await s.page.locator("input.dashboard-file-input").nth(3).inputValue(), "", "the file picker was reset");
  await s.browser.close();
});

await check("the signed-documents check with the zip tool unreachable says so and is usable again", async () => {
  const s = await session({ block: "jszip" });
  await s.page.goto(`${APP}/backup`);
  await s.page.waitForSelector(".signed-documents-backup");
  const input = s.page.locator('.signed-documents-backup input[type="file"]');
  await input.setInputFiles(notZipFile);
  assert.match(await s.page.locator(".signed-documents-result").innerText(), /zip tool could not be loaded/);
  assert.ok(await input.isEnabled(), "not left busy");
  await s.browser.close();
});

await ctl("reset=1");
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
