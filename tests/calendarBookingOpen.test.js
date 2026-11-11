import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getBookingOpenProps } from "../src/utils/bookingOpenProps.js";

const booking = {
  id: "booking-2",
  organizationName: "Grace Church",
  startDate: "2026-11-06",
  endDate: "2026-11-08",
};

function setSelection(isCollapsed) {
  globalThis.window = { getSelection: () => ({ isCollapsed }) };
}

test("a click opens the entry's booking by id, even when names repeat", () => {
  setSelection(true);
  const opened = [];
  const open = (id) => opened.push(id);

  getBookingOpenProps(booking, open).onClick({ detail: 1 });
  getBookingOpenProps({ ...booking, id: "booking-3" }, open).onClick({ detail: 1 });

  assert.deepEqual(opened, ["booking-2", "booking-3"]);
});

test("identical names stay distinguishable to screen readers by date", () => {
  const label = getBookingOpenProps(booking, () => {})["aria-label"];

  assert.match(label, /^Open booking: Grace Church, /);
  assert.match(label, /2026/);
});

test("finishing a text selection does not open the booking", () => {
  setSelection(false);
  const opened = [];
  const { onClick } = getBookingOpenProps(booking, (id) => opened.push(id));

  onClick({ detail: 1 });
  assert.deepEqual(opened, []);

  // Keyboard clicks have detail 0 and ignore a selection left elsewhere.
  onClick({ detail: 0 });
  assert.deepEqual(opened, ["booking-2"]);
});

test("Enter and Space become a real click so the tutorial guard sees them", () => {
  const { onKeyDown } = getBookingOpenProps(booking, () => {
    assert.fail("the key handler must not open the booking directly");
  });
  let clicks = 0;
  let prevented = 0;
  const press = (key) =>
    onKeyDown({
      key,
      currentTarget: { click: () => (clicks += 1) },
      preventDefault: () => (prevented += 1),
    });

  press("Enter");
  press(" ");
  press("Tab");
  press("ArrowDown");

  assert.equal(clicks, 2);
  assert.equal(prevented, 2);
});

test("Back and delete leave a detail view through the remembered origin", () => {
  const source = readFileSync("src/pages/Dashboard.jsx", "utf8");

  // Booking, inquiry and hosting details.
  assert.equal(source.match(/onBack=\{closeBookingDetail\}/g)?.length, 3);
  assert.doesNotMatch(source, /navigate\("\/master-spreadsheet"\)/);
  assert.doesNotMatch(source, /navigate\("\/inquiry-spreadsheet"\)/);
});

test("both calendars and Reports stay mounted behind the record they opened", () => {
  const source = readFileSync("src/pages/Dashboard.jsx", "utf8");

  assert.match(source, /keptCalendarView === "Calendar View"/);
  assert.match(source, /keptCalendarView === "Lodging Calendar"/);
  assert.match(source, /keptCalendarView === "Reports"/);
  assert.equal(source.match(/onOpenBooking=\{openCalendarBooking\}/g)?.length, 3);
});
