import assert from "node:assert/strict";
import test from "node:test";

import { getSavedBackupView, saveBackupView } from "../src/utils/backupView.js";

function stubStorage(getStorage) {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: getStorage });
}

test("Backups view defaults to Minimal unless Detailed was saved", () => {
  const saved = new Map();
  stubStorage(() => ({
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  }));

  assert.equal(getSavedBackupView(), "minimal");
  saveBackupView("detailed");
  assert.equal(getSavedBackupView(), "detailed");
  saveBackupView("minimal");
  assert.equal(getSavedBackupView(), "minimal");

  saved.set([...saved.keys()][0], "garbage");
  assert.equal(getSavedBackupView(), "minimal");
});

test("Backups view survives storage that is blocked or full", () => {
  stubStorage(() => {
    throw new Error("blocked");
  });
  assert.equal(getSavedBackupView(), "minimal");
  assert.doesNotThrow(() => saveBackupView("detailed"));

  stubStorage(() => ({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("full");
    },
  }));
  assert.equal(getSavedBackupView(), "minimal");
  assert.doesNotThrow(() => saveBackupView("detailed"));
});
