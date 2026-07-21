// historical-coverage.js
// Read-only probe: how much of the ingredient and authored-dish pool does
// Historical mode remove, per biome? A biome losing a large share signals the
// historical pack needs more period additions there before the mode ships.
// Usage: node scripts/historical-coverage.js
"use strict";

const { loadData, loadGenerator } = require("./lib/loader");

const data = loadData();
const { filterAuthored, resolveWorld } = loadGenerator();

const BIOMES = Object.keys(data.modifiers.biomes);
const NEUTRAL = { season: "autumn", weather: "clear", inn_tier: "common", economy: "normal", condition: "peace", event: "none" };

// The generator does not export filterIngredientPool; approximate the mode's
// ingredient removal with the same tag rules it applies (see REALISM in
// src/generator.js). Keep in sync if the tag list changes.
function historicallyExcluded(tags, biome) {
  if (tags.includes("new-world") || tags.includes("post-medieval")) return true;
  if (tags.includes("post-medieval-west") && biome !== "arid") return true;
  return false;
}

console.log("Historical-mode pool removal, per biome");
console.log("(authored dishes measured through the real filter; ingredients via the tag rules)\n");
console.log("| biome | dishes fantasy | dishes historical | removed | ingredients tagged out |");
console.log("|---|---|---|---|---|");

for (const biome of BIOMES) {
  const worldF = { ...NEUTRAL, biome, historical: false };
  const worldH = { ...NEUTRAL, biome, historical: true };
  const copyF = data.authored_dishes.dishes.map(d => ({ ...d }));
  const copyH = data.authored_dishes.dishes.map(d => ({ ...d }));
  const poolF = filterAuthored(copyF, resolveWorld(worldF, data), data);
  const poolH = filterAuthored(copyH, resolveWorld(worldH, data), data);
  const ingOut = data.ingredients.ingredients
    .filter(i => historicallyExcluded(i.tags || [], biome)).length;
  const removed = poolF.length - poolH.length;
  const pct = poolF.length ? Math.round(100 * removed / poolF.length) : 0;
  console.log(`| ${biome} | ${poolF.length} | ${poolH.length} | ${removed} (${pct}%) | ${ingOut} |`);
}
console.log("\nIngredient pool total:", data.ingredients.ingredients.length);
