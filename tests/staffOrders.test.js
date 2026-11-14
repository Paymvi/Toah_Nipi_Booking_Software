import assert from "node:assert/strict";
import test from "node:test";

import { checkOrderForm, isUnprocessed, itemsSummary, newOrderId, orderProgress } from "../src/utils/staffOrders.js";

const item = (status, name = "Soap", quantity = "2") => ({ status, name, quantity });

test("progress only shows when items differ, and ignores cancelled items", () => {
  assert.equal(orderProgress({ items: [item("requested"), item("requested")] }), "");
  assert.equal(orderProgress({ items: [item("received"), item("ordered"), item("requested")] }), "1 of 3 received · 1 ordered · 1 not ordered yet");
  assert.equal(orderProgress({ items: [item("received"), item("cancelled")] }), "");
  assert.equal(orderProgress({ items: [item("received"), item("ordered"), item("cancelled")] }), "1 of 2 received · 1 ordered");
});

test("unprocessed means every item is still requested", () => {
  assert.equal(isUnprocessed({ items: [item("requested"), item("requested")] }), true);
  assert.equal(isUnprocessed({ items: [item("requested"), item("ordered")] }), false);
  assert.equal(isUnprocessed({ items: [item("cancelled")] }), false);
});

test("summary names the first items and counts the rest", () => {
  const request = { items: [item("requested", "Soap", "6 bottles"), item("requested", "Gloves", "2 boxes"), item("requested", "Mop", "1")] };
  assert.equal(itemsSummary(request), "Soap (6 bottles), Gloves (2 boxes) +1 more");
});

test("form check: blank rows are dropped, half-filled rows and missing department are flagged", () => {
  const base = { department: "kitchen", items: [{ name: " Flour ", quantity: "2 bags" }, { name: "", quantity: "" }] };
  assert.deepEqual(checkOrderForm(base), { errors: {}, items: [{ name: "Flour", quantity: "2 bags" }] });

  const { errors } = checkOrderForm({ items: [{ name: "Foil", quantity: "" }, { name: "", quantity: "3" }] });
  assert.deepEqual(Object.keys(errors).sort(), ["department", "item-0-quantity", "item-1-name"]);

  assert.equal(checkOrderForm({ department: "other", items: [{ name: "", quantity: "" }] }).errors.items, "Add at least one item.");
});

test("form check: link must be a web address, name only when required", () => {
  const base = { department: "turnover", items: [{ name: "Towels", quantity: "20" }] };
  assert.ok(checkOrderForm({ ...base, productLink: "javascript:alert(1)" }).errors.productLink);
  assert.ok(checkOrderForm({ ...base, productLink: "www.example.com" }).errors.productLink);
  assert.equal(checkOrderForm({ ...base, productLink: "https://example.com/towels" }).errors.productLink, undefined);
  assert.equal(checkOrderForm(base).errors.actorName, undefined);
  assert.ok(checkOrderForm({ ...base, actorName: "  " }, { nameRequired: true }).errors.actorName);
});

test("new ids are v4 uuids", () => {
  assert.match(newOrderId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
