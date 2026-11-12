// Fictional staff workflow only; harness blocks every external request.
import assert from "node:assert/strict";
import { APP, ctl, launch, writes } from "./harness.mjs";

const session = await launch();
const { page } = session;
try {
  for (const mode of ["off", "test", "error", "schema", "noPdf"]) {
    await ctl(`reset=1&signing=${mode}`);
    await page.goto(APP + "/portal-admin", { waitUntil: "domcontentloaded", timeout: 60000 });
    const correction = page.locator(".portal-item-corrections").filter({ has: page.getByText("Due date", { exact: true }) }).first();
    await correction.locator("summary").click();
    if (mode === "schema") {
      await correction.getByText(/unavailable because signing fields/).waitFor();
      await ctl("signing=off");
      await page.getByRole("button", { name: "Refresh", exact: true }).last().click();
      await correction.getByLabel("Sign online with").waitFor();
      console.log("PASS schema recovery on Refresh");
      continue;
    }
    const select = correction.getByLabel("Sign online with");
    await select.waitFor();
    if (mode === "noPdf") {
      await correction.getByText(/Upload the PDF under Assign Documents/).waitFor();
      assert.equal(await select.locator("option").count(), 1);
      console.log("PASS no eligible PDF explains custom upload");
      continue;
    }
    if (mode === "off") await correction.getByText(/Online signing is off for this booking/).waitFor();
    if (mode === "test") await correction.getByText(/eligible for a signing test/).waitFor();
    if (mode === "error") await correction.getByText(/Signing settings could not be read/).waitFor();
    await select.selectOption("d1");
    await correction.getByRole("button", { name: "Save signing choice" }).click();
    await page.waitForFunction(() => document.body.textContent.includes("Sign online:"));
    assert.ok((await writes()).some((w) => w.includes('"sign_document_id":"d1"')));
    assert.ok(!(await writes()).some((w) => w.includes("portal_signing_settings")));
    console.log(`PASS staff PDF linking: ${mode}`);
  }
  assert.deepEqual(session.requests.filter((r) => r.startsWith("BLOCKED")), []);
} catch (error) {
  console.error(await page.locator("body").innerText());
  console.error(session.errors);
  throw error;
} finally {
  await session.browser.close();
}
