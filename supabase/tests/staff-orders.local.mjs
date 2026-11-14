// Staff app Orders against a LOCAL Supabase stack (Docker). FICTIONAL DATA ONLY.
// Every call goes through the real REST API as each kind of account.
//
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_ROLE_KEY=... \
//   LOCAL_SEEDER_KEY=... node supabase/tests/staff-orders.local.mjs
//
// Needs 20261114000100_staff_orders.sql on the stack (docs/staff-app/IMPLEMENTATION_NOTES.md).
// Refuses to run against anything but 127.0.0.1 / localhost.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL || "";
const anonKey = process.env.LOCAL_ANON_KEY || "";
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY || "";
const seederKey = process.env.LOCAL_SEEDER_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !anonKey || !serviceKey || !seederKey) {
  console.error("LOCAL stack only: set LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY and LOCAL_SEEDER_KEY.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seed = createClient(url, seederKey, options);
const authAdmin = createClient(url, serviceKey, options);
const anon = createClient(url, anonKey, options);
const run = Date.now().toString(36);
let failures = 0;
let passes = 0;

async function check(name, body) {
  try {
    await body();
    passes += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${String(error?.message || error).split("\n").slice(0, 8).join("\n     ")}`);
  }
}

const must = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${error.code || ""} ${error.message}`);
  return data;
};
// Expects the call to fail with this Postgres error code.
const refused = async (promise, code) => {
  const { data, error } = await promise;
  assert.ok(error, `expected error ${code}, got data ${JSON.stringify(data)?.slice(0, 200)}`);
  if (code) assert.equal(error.code, code, error.message);
  return error;
};

async function makeAccount(label, profile) {
  const email = `orders-${label}-${run}@example.test`;
  const password = `pw-${run}-${label}-Local1!`;
  const { user } = await must(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (profile) {
    await must(seed.from("staff_profiles").insert({ user_id: user.id, email, full_name: `Fictional ${label}`, is_active: true, ...profile }));
  }
  const client = createClient(url, anonKey, options);
  await must(client.auth.signInWithPassword({ email, password }));
  return client;
}

const save = (client, request, actorName = "") =>
  client.rpc("staff_app_order_save", {
    p_id: request.id,
    p_department: request.department,
    p_needed_by: request.neededBy ?? null,
    p_notes: request.notes ?? "",
    p_product_link: request.productLink ?? "",
    p_urgent: request.urgent ?? false,
    p_items: request.items,
    p_actor_name: actorName,
  });
const setStatus = (client, itemIds, status, note = "", actorName = "") =>
  client.rpc("staff_app_order_set_status", { p_item_ids: itemIds, p_status: status, p_note: note, p_actor_name: actorName });
const list = async (client, history = false) => must(client.rpc("staff_app_orders", { p_history: history }));
const find = async (client, id, history = false) => (await list(client, history)).requests.find((request) => request.id === id);

const cook = await makeAccount("cook", { role: "limited", departments: ["kitchen"] });
const crew = await makeAccount("crew", { role: "limited", departments: [] });
const office = await makeAccount("office", { role: "staff" });
const viewer = await makeAccount("viewer", { role: "viewer" });
const nobody = await makeAccount("nobody", null);
const former = await makeAccount("former", { role: "limited", departments: ["kitchen"], is_active: false });

const first = {
  id: randomUUID(),
  department: "kitchen",
  neededBy: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  notes: "Brand: any, unscented.",
  productLink: "https://example.test/soap",
  urgent: true,
  items: [
    { name: "Dish soap", quantity: "6 bottles" },
    { name: "Food containers", quantity: "2 cases" },
  ],
};

await check("anonymous (guest portal key) can neither call the functions nor read the tables", async () => {
  await refused(anon.rpc("staff_app_orders", { p_history: false }), "42501");
  await refused(save(anon, first), "42501");
  for (const table of ["staff_order_requests", "staff_order_items", "staff_order_events"]) {
    await refused(anon.from(table).select("*").limit(1));
  }
});

await check("signed-in accounts without active staff access are refused", async () => {
  await refused(nobody.rpc("staff_app_orders", { p_history: false }), "42501");
  await refused(former.rpc("staff_app_orders", { p_history: false }), "42501");
  await refused(save(former, { ...first, id: randomUUID() }), "42501");
});

await check("tables cannot be read or written directly, even by office staff", async () => {
  for (const table of ["staff_order_requests", "staff_order_items", "staff_order_events"]) {
    await refused(office.from(table).select("*").limit(1), "42501");
  }
  await refused(office.from("staff_order_requests").insert({ id: randomUUID(), department: "other", requested_by: randomUUID(), requested_by_name: "x" }), "42501");
  await refused(office.from("staff_order_requests").delete().neq("department", ""), "42501");
});

await check("validation: department, items, link, lengths", async () => {
  await refused(save(cook, { ...first, id: randomUUID(), department: "garden" }), "22023");
  await refused(save(cook, { ...first, id: randomUUID(), items: [] }), "22023");
  await refused(save(cook, { ...first, id: randomUUID(), items: [{ name: "Flour", quantity: "" }] }), "22023");
  await refused(save(cook, { ...first, id: randomUUID(), items: Array.from({ length: 31 }, () => ({ name: "x", quantity: "1" })) }), "22023");
  await refused(save(cook, { ...first, id: randomUUID(), productLink: "javascript:alert(1)" }), "22023");
  await refused(save(cook, { ...first, id: randomUUID(), notes: "x".repeat(1001) }), "22023");
});

await check("limited kitchen account submits a multi-item request; its profile name is recorded, not the typed one", async () => {
  const saved = await must(save(cook, first, "Someone Else"));
  assert.equal(saved.status, "requested");
  assert.equal(saved.requestedByName, "Fictional cook");
  assert.equal(saved.items.length, 2);
  assert.deepEqual(saved.items.map((item) => item.status), ["requested", "requested"]);
  assert.equal(saved.events.length, 1);
});

await check("sending the same request again (double tap, retry) creates no duplicate and no extra history", async () => {
  await must(save(cook, first));
  const again = await find(cook, first.id);
  assert.equal(again.events.length, 1);
  assert.equal((await list(cook)).requests.filter((request) => request.id === first.id).length, 1);
});

await check("another staff session (crew, viewer, office) sees the request", async () => {
  for (const client of [crew, viewer, office]) {
    const seen = await find(client, first.id);
    assert.ok(seen, "not listed");
    assert.equal(seen.mine, false);
    assert.equal(seen.items.length, 2);
  }
  const me = await list(cook);
  assert.equal(me.canPurchase, false);
  assert.equal(me.nameRequired, false);
  assert.equal((await list(office)).canPurchase, true);
  assert.equal((await list(office)).nameRequired, true);
  assert.equal((await list(viewer)).canRequest, false);
});

await check("others cannot edit, cancel or advance someone else's request", async () => {
  const items = (await find(crew, first.id)).items.map((item) => item.id);
  await refused(save(crew, { ...first, notes: "changed by crew" }), "42501");
  await refused(setStatus(crew, items, "cancelled"), "42501");
  await refused(setStatus(cook, items, "ordered"), "42501");
  await refused(save(viewer, { ...first, notes: "viewer" }), "42501");
  await refused(setStatus(viewer, items, "cancelled"), "42501");
});

await check("the requester edits an unprocessed request; an identical save records nothing", async () => {
  const edited = { ...first, urgent: false, items: [...first.items, { name: "Replacement mop", quantity: "1" }] };
  const saved = await must(save(cook, edited));
  assert.equal(saved.items.length, 3);
  assert.equal(saved.urgent, false);
  assert.deepEqual(saved.events.map((event) => event.action), ["requested", "edited"]);
  await must(save(cook, edited));
  assert.equal((await find(cook, first.id)).events.length, 2);
});

await check("purchasing must give a name on the (possibly shared) office login", async () => {
  const items = (await find(office, first.id)).items.map((item) => item.id);
  await refused(setStatus(office, items.slice(0, 1), "ordered", "", "  "), "22023");
});

await check("purchasing updates individual items; overall progress follows the items", async () => {
  const [soap, containers, mop] = (await find(office, first.id)).items.map((item) => item.id);
  await must(setStatus(office, [soap], "ordered", "Arrives Tuesday", "Pat Purchaser"));
  let request = await find(cook, first.id);
  assert.equal(request.status, "requested", "one ordered, two still requested");
  const soapItem = request.items.find((item) => item.id === soap);
  assert.equal(soapItem.status, "ordered");
  assert.equal(soapItem.note, "Arrives Tuesday");
  assert.equal(soapItem.changedBy, "Pat Purchaser");
  assert.ok(soapItem.changedAt);

  await must(setStatus(office, [containers, mop], "ordered", "", "Pat Purchaser"));
  request = await find(cook, first.id);
  assert.equal(request.status, "ordered");

  await must(setStatus(office, [soap], "received", "", "Pat Purchaser"));
  request = await find(cook, first.id);
  assert.equal(request.status, "ordered", "partly received stays open");
  assert.deepEqual(request.items.map((item) => item.status), ["received", "ordered", "ordered"]);
});

await check("once purchasing starts, the requester can no longer edit or cancel", async () => {
  await refused(save(cook, { ...first, notes: "late change" }), "55000");
  const items = (await find(cook, first.id)).items.map((item) => item.id);
  await refused(setStatus(cook, items, "cancelled"), "42501");
});

await check("finished requests leave the open list and appear in history with every event", async () => {
  const [, containers, mop] = (await find(office, first.id)).items.map((item) => item.id);
  await must(setStatus(office, [containers], "received", "", "Pat Purchaser"));
  await must(setStatus(office, [mop], "cancelled", "Out of stock", "Pat Purchaser"));
  assert.equal(await find(cook, first.id), undefined);
  const done = await find(cook, first.id, true);
  assert.equal(done.status, "received");
  assert.equal(done.events.filter((event) => event.action === "status").length, 6);
  assert.equal(done.events.at(-1).note, "Out of stock");
});

await check("a requester cancels their own unprocessed request; it is kept in history as cancelled", async () => {
  const other = { id: randomUUID(), department: "turnover", items: [{ name: "Toilet paper", quantity: "4 cases" }] };
  const saved = await must(save(crew, other));
  assert.equal(saved.requestedByName, "Fictional crew");
  await must(setStatus(crew, saved.items.map((item) => item.id), "cancelled", "Found some in storage"));
  assert.equal(await find(crew, other.id), undefined);
  const done = await find(office, other.id, true);
  assert.equal(done.status, "cancelled");
  assert.equal(done.items[0].changedBy, "Fictional crew");
});

await check("office accounts record the typed name and may edit an unprocessed request", async () => {
  const request = { id: randomUUID(), department: "maintenance", items: [{ name: "Furnace filter", quantity: "2" }] };
  await refused(save(office, request, ""), "22023");
  const saved = await must(save(office, request, "Sam Office"));
  assert.equal(saved.requestedByName, "Sam Office");
  const edited = await must(save(office, { ...request, items: [{ name: "Furnace filter 16x25", quantity: "2" }] }, "Sam Office"));
  assert.equal(edited.items[0].name, "Furnace filter 16x25");
  // Purchasing tidies someone else's unprocessed request too.
  const cookRequest = { id: randomUUID(), department: "kitchen", items: [{ name: "Flur", quantity: "1 bag" }] };
  await must(save(cook, cookRequest));
  const fixed = await must(save(office, { ...cookRequest, items: [{ name: "Flour", quantity: "1 bag" }] }, "Pat Purchaser"));
  assert.equal(fixed.requestedByName, "Fictional cook", "the requester stays the original person");
  assert.equal(fixed.items[0].name, "Flour");
});

await check("unknown item ids are refused", async () => {
  await refused(setStatus(office, [randomUUID()], "ordered", "", "Pat"), "P0002");
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
