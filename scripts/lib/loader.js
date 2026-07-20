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

// Node-side mirror of ui.js applyFlavorPacks: merge one or more packs (by id)
// into a loaded data object. Used by the smoke scripts when REALISM=1 so the
// sweep exercises the historical content layer the way the browser does.
function applyPacks(data, packIds) {
  const ingMap = new Map(data.ingredients.ingredients.map(i => [i.id, i]));
  const dishes = [...data.authored_dishes.dishes];
  for (const id of packIds) {
    const pack = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "flavor_packs", `${id}.json`), "utf8"));
    for (const ing of pack.ingredients || []) ingMap.set(ing.id, ing);
    for (const ov of pack.ingredient_overrides || []) {
      const current = ingMap.get(ov.id);
      if (current) ingMap.set(ov.id, { ...current, ...ov });
    }
    for (const d of pack.dishes || []) dishes.push(d);
  }
  return {
    ...data,
    ingredients: { ingredients: Array.from(ingMap.values()) },
    authored_dishes: { dishes }
  };
}

module.exports = { ROOT, DATA_DIR, loadData, loadGenerator, applyPacks };
