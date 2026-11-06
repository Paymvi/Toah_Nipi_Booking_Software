import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { THEME_STORAGE_KEY, readSavedTheme, saveTheme } from "../src/utils/theme.js";

const storageWith = (value) => ({ getItem: () => value, setItem() {} });
const blockedStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

test("only a saved Night choice leaves Light", () => {
  assert.equal(readSavedTheme(storageWith("night")), "night");
  assert.equal(readSavedTheme(storageWith("light")), "light");
  assert.equal(readSavedTheme(storageWith(null)), "light");
  assert.equal(readSavedTheme(storageWith("purple")), "light");
  assert.equal(readSavedTheme(blockedStorage), "light");
  assert.equal(readSavedTheme(undefined), "light");
});

test("saving survives blocked storage", () => {
  assert.doesNotThrow(() => saveTheme(blockedStorage, "night"));
});

// The script in index.html runs before the bundle, so it cannot import the rule above.
function runFirstPaintScript(localStorage) {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(script, { document, localStorage });
  return document.documentElement.dataset.theme;
}

test("the first-paint script agrees with readSavedTheme", () => {
  const stored = new Map([[THEME_STORAGE_KEY, "night"]]);
  assert.equal(runFirstPaintScript({ getItem: (key) => stored.get(key) ?? null }), "night");

  for (const storage of [storageWith(null), storageWith("purple"), blockedStorage]) {
    assert.equal(runFirstPaintScript(storage), readSavedTheme(storage));
  }
});

// A mistyped token fails silently: the color just stays Light in Night mode.
test("every night token in use is defined in theme.css", () => {
  const stylesUrl = new URL("../src/styles/", import.meta.url);
  const css = readdirSync(stylesUrl)
    .map((file) => readFileSync(new URL(file, stylesUrl), "utf8"))
    .join("\n");
  const reports = readFileSync(new URL("../src/pages/ReportsView.jsx", import.meta.url), "utf8");
  const defined = new Set(
    [...readFileSync(new URL("theme.css", stylesUrl), "utf8").matchAll(/^\s*(--n-[a-z0-9-]+):/gm)].map((match) => match[1])
  );
  const used = new Set([...(css + reports).matchAll(/var\((--n-[a-z0-9-]+)/g)].map((match) => match[1]));

  assert.ok(used.size > 40);
  assert.deepEqual([...used].filter((token) => !defined.has(token)), []);
});
