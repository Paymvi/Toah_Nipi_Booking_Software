import test from "node:test";
import assert from "node:assert/strict";

import {
  getAlreadyAssignedDocumentIds,
  getAlreadyAssignedTaskIds,
  getDueDateWarning,
  getPortalProgress,
  getReopenedPortalItemStatus,
} from "../src/utils/portalRules.js";
import {
  changePortalItemDueDate,
  insertPortalRowsOnce,
  removePortalDocument,
  removePortalItem,
  reopenPortalItem,
  requestPortalItemChanges,
} from "../src/services/portalCorrections.js";

test("needs review counts half; confirmation completes the item", () => {
  const items = [
    { status: "completed" },
    { status: "needsReview" },
    { status: "waitingOnGuest" },
    { status: "notStarted" },
  ];
  const progress = getPortalProgress(items);
  assert.equal(progress.percent, 38); // (1 + 0.5) / 4
  assert.equal(progress.needsReview, 1);
  assert.equal(progress.open, 2);
  assert.equal(getPortalProgress([{ status: "needsReview" }]).percent, 50);
  assert.equal(getPortalProgress([{ status: "completed" }]).percent, 100);
  assert.equal(getPortalProgress([]).percent, 0);
});

test("reopening goes back to review when the guest had submitted something", () => {
  assert.equal(getReopenedPortalItemStatus({ uploadedFileName: "a.pdf", uploadedFilePath: "t/a.pdf" }), "needsReview");
  assert.equal(getReopenedPortalItemStatus({ responseText: "42 guests" }), "needsReview");
  assert.equal(getReopenedPortalItemStatus({ guestAction: "upload_file" }), "waitingOnGuest");
  assert.equal(getReopenedPortalItemStatus({ guestAction: "none" }), "notStarted");
});

test("duplicates and late due dates are flagged, never blocked", () => {
  const tasks = [{ id: "contract", title: "Sign and return contract" }, { id: "insurance", title: "Insurance" }];
  assert.deepEqual([...getAlreadyAssignedTaskIds([{ itemId: "contract", title: "x" }], tasks)], ["contract"]);
  assert.match(getDueDateWarning("2027-06-20", "2027-06-18"), /after the group arrives/);
  assert.equal(getDueDateWarning("2027-06-01", "2027-06-18"), "");

  const options = [{ id: "rules", title: "Water Safety", fileName: "Water.pdf" }];
  const customWithSameName = [{ title: "Our own notes", fileName: "Water.pdf", uploadedByGuest: false }];
  assert.equal(getAlreadyAssignedDocumentIds(customWithSameName, options).size, 0);
  const standard = [{ title: "Water Safety", fileName: "water.pdf", uploadedByGuest: false }];
  assert.equal(getAlreadyAssignedDocumentIds(standard, options).size, 1);
});

/*
  Fake client for portal tables and Storage. Updates and deletes only touch
  rows matching every filter, like PostgREST.
*/
function fakePortal({ items = [], documents = [], removedTable = true, moveFails = false, requestIdColumn = true } = {}) {
  const tables = {
    portal_checklist_items: items.map((row) => ({ ...row })),
    portal_documents: documents.map((row) => ({ ...row })),
    portal_removed_uploads: [],
  };
  const files = new Set(items.map((item) => item.uploaded_file_path).filter(Boolean));
  const client = {
    tables,
    files,
    storage: {
      from: () => ({
        move: async (from, to) => {
          if (moveFails) return { error: { message: "not allowed" } };
          files.delete(from);
          files.add(to);
          return { error: null };
        },
      }),
    },
    from(table) {
      const filters = [];
      let op = "select";
      let payload = null;
      let options = {};
      const builder = {
        update(values) { op = "update"; payload = values; return builder; },
        delete() { op = "delete"; return builder; },
        insert(values) { op = "insert"; payload = values; return builder; },
        upsert(values, opts) { op = "upsert"; payload = values; options = opts; return builder; },
        eq(column, value) { filters.push([column, value]); return builder; },
        select() { return builder; },
        then(resolve) {
          if (table === "portal_removed_uploads" && !removedTable) {
            resolve({ data: null, error: { code: "42P01", message: "relation does not exist" } });
            return;
          }
          const rows = tables[table];
          const matches = rows.filter((row) => filters.every(([c, v]) => String(row[c]) === String(v)));
          if (op === "update") {
            matches.forEach((row) => Object.assign(row, payload));
            resolve({ data: matches.map((row) => ({ id: row.id })), error: null });
          } else if (op === "delete") {
            tables[table] = rows.filter((row) => !matches.includes(row));
            resolve({ data: matches.map((row) => ({ id: row.id })), error: null });
          } else if (op === "insert" || op === "upsert") {
            const values = Array.isArray(payload) ? payload : [payload];
            if (!requestIdColumn && values.some((row) => "client_request_id" in row)) {
              resolve({ data: null, error: { code: "PGRST204", message: "column not found" } });
              return;
            }
            const added = values.filter((row) =>
              !(op === "upsert" && options.ignoreDuplicates &&
                rows.some((existing) => existing.client_request_id && existing.client_request_id === row.client_request_id))
            );
            added.forEach((row) => rows.push({ id: rows.length + 100, ...row }));
            resolve({ data: added, error: null });
          }
        },
      };
      return builder;
    },
  };
  return client;
}

const uploaded = {
  id: 1, booking_id: "b1", itemId: "insurance", title: "Insurance certificate", status: "needsReview",
  uploadedFileName: "coi.pdf", uploadedFilePath: "tok1/items/coi.pdf", uploaded_file_path: "tok1/items/coi.pdf",
};

test("changing a due date is guarded by the status staff saw", async () => {
  const client = fakePortal({ items: [{ id: 1, status: "notStarted" }] });
  await changePortalItemDueDate(client, { id: 1, status: "notStarted" }, "2027-06-01");
  assert.equal(client.tables.portal_checklist_items[0].due_date, "2027-06-01");
  await assert.rejects(changePortalItemDueDate(client, { id: 1, status: "completed" }, "2027-06-02"), /Nothing was changed/);
});

test("request changes sends a submission back and keeps the upload", async () => {
  const client = fakePortal({ items: [{ id: 1, status: "needsReview", uploaded_file_path: "tok1/a.pdf" }] });
  const result = await requestPortalItemChanges(client, { id: 1, status: "needsReview" }, "Please sign page 2");
  assert.equal(result.noteSaved, true);
  const row = client.tables.portal_checklist_items[0];
  assert.equal(row.status, "waitingOnGuest");
  assert.equal(row.staff_review_note, "Please sign page 2");
  assert.equal(row.uploaded_file_path, "tok1/a.pdf");
});

test("reopen returns a confirmed task to review", async () => {
  const client = fakePortal({ items: [{ id: 1, status: "completed" }] });
  const { status } = await reopenPortalItem(client, { id: 1, status: "completed", responseText: "40" });
  assert.equal(status, "needsReview");
  assert.equal(client.tables.portal_checklist_items[0].status, "needsReview");
});

test("removing a task with a guest upload keeps the file and its record, hidden from the guest", async () => {
  const client = fakePortal({ items: [uploaded] });
  const { message } = await removePortalItem(client, { bookingId: "b1", item: uploaded });
  assert.equal(client.tables.portal_checklist_items.length, 0);
  assert.equal(client.tables.portal_removed_uploads.length, 1);
  const archived = client.tables.portal_removed_uploads[0];
  assert.equal(archived.original_file_path, "tok1/items/coi.pdf");
  assert.equal(archived.current_file_path, "removed-uploads/b1/1/coi.pdf");
  assert.ok(client.files.has("removed-uploads/b1/1/coi.pdf"));
  assert.ok(!client.files.has("tok1/items/coi.pdf"));
  assert.match(message, /kept and moved/);
});

test("without the archive table, an uploaded task is not removed and the file is put back", async () => {
  const client = fakePortal({ items: [uploaded], removedTable: false });
  await assert.rejects(removePortalItem(client, { bookingId: "b1", item: uploaded }), /portal corrections migration/);
  assert.equal(client.tables.portal_checklist_items.length, 1);
  assert.ok(client.files.has("tok1/items/coi.pdf"));
});

test("if the file cannot be moved, staff are told it stays reachable by its old link", async () => {
  const client = fakePortal({ items: [uploaded], moveFails: true });
  const { message } = await removePortalItem(client, { bookingId: "b1", item: uploaded });
  assert.match(message, /could not be moved/);
  assert.equal(client.tables.portal_removed_uploads[0].current_file_path, "tok1/items/coi.pdf");
});

test("only staff-shared documents can be removed", async () => {
  const client = fakePortal({ documents: [{ id: 5, uploaded_by_guest: false }, { id: 6, uploaded_by_guest: true }] });
  await removePortalDocument(client, { id: 5, uploadedByGuest: false });
  assert.deepEqual(client.tables.portal_documents.map((row) => row.id), [6]);
  await assert.rejects(removePortalDocument(client, { id: 6, uploadedByGuest: true }), /Guest-uploaded/);
});

test("a retried assignment does not duplicate, an intentional repeat does", async () => {
  const client = fakePortal();
  const first = [{ client_request_id: "req-1", booking_id: "b1", item_id: "contract" }];
  await insertPortalRowsOnce(client, "portal_checklist_items", first, "id");
  await insertPortalRowsOnce(client, "portal_checklist_items", first, "id"); // retry of the same click
  assert.equal(client.tables.portal_checklist_items.length, 1);

  await insertPortalRowsOnce(client, "portal_checklist_items", [{ ...first[0], client_request_id: "req-2" }], "id");
  assert.equal(client.tables.portal_checklist_items.length, 2);
});

test("before the migration, inserts still work without request ids", async () => {
  const client = fakePortal({ requestIdColumn: false });
  await insertPortalRowsOnce(client, "portal_documents", [{ client_request_id: "req-1", booking_id: "b1" }], "id");
  assert.equal(client.tables.portal_documents.length, 1);
  assert.equal("client_request_id" in client.tables.portal_documents[0], false);
});
