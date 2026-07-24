// scripts/import-label-check.js
// Focused before/after probe for procedural import labels.
//
// Counts how many menu dishes carry "(imported)" / "(rare import)" labels,
// split by source (authored vs. procedural). The current paradigm produces
// proc.regional == proc.rare == 0 always; under the headline-ingredient patch
// procedural dishes can also be imports.
//
// Usage: node scripts/import-label-check.js
"use strict";

const { loadData, loadGenerator } = require("./lib/loader");

const data = loadData();
const { generateMenu } = loadGenerator();

const SCENARIOS = [
  { label: "noble / heartland / merchant_caravan",
    world: { biome: "heartland", season: "summer", weather: "clear",
             inn_tier: "noble", economy: "normal", condition: "peace",
             event: "merchant_caravan" } },
  { label: "fine / coastal / none",
    world: { biome: "coastal", season: "autumn", weather: "clear",
             inn_tier: "fine", economy: "normal", condition: "peace",
             event: "none" } },
  { label: "roadside / frostlands / none",
    world: { biome: "frostlands", season: "winter", weather: "snow",
             inn_tier: "roadside", economy: "normal", condition: "peace",
             event: "none" } }
];

const N = 200;
for (const { label, world } of SCENARIOS) {
  const auth = { regional: 0, rare: 0, total: 0 };
  const proc = { regional: 0, rare: 0, total: 0 };
  for (let i = 0; i < N; i++) {
    const menu = generateMenu(world, data, `import-check-${i}`);
    for (const section of Object.values(menu.sections)) {
      for (const d of section.dishes) {
        const bucket = d.source === "authored" ? auth : proc;
        bucket.total++;
        if (d.importDistance === 1) bucket.regional++;
        else if ((d.importDistance || 0) >= 2) bucket.rare++;
      }
    }
  }
  console.log(`\n${label}  (${N} menus)`);
  console.log(`  authored:    ${auth.regional} regional, ${auth.rare} rare  / ${auth.total} dishes`);
  console.log(`  procedural:  ${proc.regional} regional, ${proc.rare} rare  / ${proc.total} dishes`);
}
