// Capacity warnings in real Chrome against the fictional mock. See README.md here for how to start both servers.
// SHOTS=<folder> also saves the screenshots used in docs/proposals/CAPACITY_WARNINGS.md.
import assert from "node:assert/strict";
import { ctl, launch, open, sleep, target, writes } from "./harness.mjs";

const shots = process.env.SHOTS;
const expected = /Over capacity — Bethel: 80 guests, capacity 70 \(night of \d{4}-\d{2}-\d{2}, shared with Cedar Hill Fellowship\)/;

async function openHousing(page, name) {
  await page.locator(`tr:has-text("${name}") ${target("spreadsheet-open-booking")} >> visible=true`).first().click();
  await page.waitForSelector(target("booking-tabs"));
  await page.locator(`${target("booking-tabs")} button`, { hasText: "Housing" }).click();
  await page.waitForSelector(".booking-housing-tab");
}

for (const [width, height, suffix] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
  await ctl("reset=1&capacity=1&clearWrites=1");
  const session = await launch({ width, height, touch: suffix === "phone" });
  const { page, errors } = session;
  await open(session, "/master-spreadsheet");
  await openHousing(page, "Community Bible Church");

  const card = page.locator(".booking-housing-conflicts");
  assert.match(await card.innerText(), expected);
  assert.equal(await card.getByRole("button", { name: "Open Cedar Hill Fellowship" }).count(), 1);
  if (shots) await page.screenshot({ path: `${shots}/housing-warning-${suffix}.png`, fullPage: false });

  if (suffix === "desktop") {
    // Saving shows the same line in the "Save anyway?" prompt; Cancel saves nothing.
    await page.locator(".booking-housing-tab-actions button").first().click();
    let message = "";
    page.once("dialog", (dialog) => { message = dialog.message(); dialog.dismiss(); });
    await page.getByRole("button", { name: "Save Changes" }).click();
    await sleep(500);
    assert.match(message, /^Lodging problems on some of these nights:/);
    assert.match(message, expected);
    assert.deepEqual((await writes()).filter((line) => line.includes("/rest/v1/bookings")), []);
    if (shots) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(`${shots}/save-prompt.txt`, message);
    }

    // The other group sees the warning too, naming the first group.
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.locator('[data-tutorial-target="booking-back"]').first().click();
    await openHousing(page, "Cedar Hill Fellowship");
    assert.match(await card.innerText(), /shared with Community Bible Church/);
    if (shots) await card.screenshot({ path: `${shots}/housing-warning-other-group.png` });
  }

  assert.deepEqual(errors, []);
  await session.browser.close();
}
console.log("capacity warnings: ok");
