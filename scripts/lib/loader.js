// scripts/lib/loader.js
// Shared Node-side bootstrap: load the JSON data files and the browser
// generator into the current vm context. Keeps each script's top-of-file
// from re-stating the same eight-key fs/vm dance.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");

const DATA_FILES = [
  "authored_dishes",
  "ingredients",
  "preparations",
  "dishes",
  "events",
  "modifiers"
];

function loadData() {
  const out = {};
  for (const name of DATA_FILES) {
    out[name] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"));
  }
  return out;
}

// Evaluate src/generator.js in the current vm context. The browser file ends
// with `window.InnMenu = {...}`, so we stub `window` first and read the API
// off it. Returns the InnMenu surface ({ generateMenu, generateMenuTraced, ... }).
function loadGenerator() {
  globalThis.window = globalThis.window || {};
  const src = fs.readFileSync(path.join(ROOT, "src", "generator.js"), "utf8");
  vm.runInThisContext(src, { filename: "src/generator.js" });
  if (!globalThis.window.InnMenu) {
    throw new Error("loadGenerator: window.InnMenu missing after evaluation");
  }
  return globalThis.window.InnMenu;
}

module.exports = { ROOT, DATA_DIR, loadData, loadGenerator };
