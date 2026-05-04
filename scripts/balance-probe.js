// scripts/balance-probe.js
// Focused balance probe: how often do imports show up on a "boring" common inn,
// and how often do staple ingredients (white bread, potato, carrot, oats) show
// up at lower-tier inns where they ought to be common?
//
// Read-only. Prints to stdout.
"use strict";

const { loadData, loadGenerator } = require("./lib/loader");

const data = loadData();
const { generateMenuTraced } = loadGenerator();

const N = 400;
const STAPLES = ["white-bread", "potato", "carrot", "oats"];
const BIOMES = ["coastal", "heartland", "highland", "arid", "frostlands"];
const SEASONS = ["spring", "summer", "autumn", "winter"];

function blankWorld(over) {
  return Object.assign({
    biome: "heartland", season: "summer", weather: "clear",
    inn_tier: "common", economy: "normal", condition: "peace", event: "none"
  }, over);
}

function probeImports(label, world) {
  let totalDishes = 0;
  let regional = 0;
  let rare = 0;
  let menusWith3plus = 0;
  let menusWith6plus = 0;
  const distHist = {};
  for (let i = 0; i < N; i++) {
    const { menu } = generateMenuTracedSafe(world, `bp:${label}:${i}`);
    let importsHere = 0;
    for (const sec of Object.values(menu.sections)) {
      for (const d of sec.dishes) {
        totalDishes++;
        const dist = d.importDistance || 0;
        if (dist === 1) { regional++; importsHere++; }
        else if (dist >= 2) { rare++; importsHere++; }
      }
    }
    distHist[importsHere] = (distHist[importsHere] || 0) + 1;
    if (importsHere >= 3) menusWith3plus++;
    if (importsHere >= 6) menusWith6plus++;
  }
  console.log(`\n[imports] ${label}`);
  console.log(`  ${N} menus, ${totalDishes} dishes total`);
  console.log(`  regional: ${regional} (${(100*regional/totalDishes).toFixed(1)}%) | rare: ${rare} (${(100*rare/totalDishes).toFixed(1)}%)`);
  console.log(`  menus w/ >=3 imports: ${menusWith3plus} (${(100*menusWith3plus/N).toFixed(0)}%) | >=6: ${menusWith6plus} (${(100*menusWith6plus/N).toFixed(0)}%)`);
  const histKeys = Object.keys(distHist).map(Number).sort((a,b)=>a-b);
  console.log(`  imports/menu histogram: ${histKeys.map(k => `${k}:${distHist[k]}`).join(" ")}`);
}

function generateMenuTracedSafe(world, seed) {
  return generateMenuTraced(world, data, seed);
}

function probeStaple(label, world) {
  const counts = Object.fromEntries(STAPLES.map(id => [id, 0]));
  let totalIngredientPicks = 0;
  for (let i = 0; i < N; i++) {
    const { trace } = generateMenuTracedSafe(world, `sp:${label}:${i}`);
    const seen = new Set();
    for (const id of trace.ingredients) {
      totalIngredientPicks++;
      if (STAPLES.includes(id) && !seen.has(id)) {
        counts[id]++;
        seen.add(id); // count as "appears in this menu"
      }
    }
  }
  console.log(`\n[staples] ${label}  (${N} menus)`);
  for (const id of STAPLES) {
    console.log(`  ${id.padEnd(12)}: appears in ${counts[id]} menus (${(100*counts[id]/N).toFixed(0)}%)`);
  }
}

console.log("====== A. Import frequency on 'boring' inns ======");
probeImports("roadside / heartland / summer / clear / normal / peace / none",
  blankWorld({ inn_tier: "roadside" }));
probeImports("common / heartland / summer / clear / normal / peace / none",
  blankWorld({ inn_tier: "common" }));
probeImports("common / coastal / autumn / clear / normal / peace / none",
  blankWorld({ inn_tier: "common", biome: "coastal", season: "autumn" }));
probeImports("fine / heartland / summer / clear / normal / peace / none",
  blankWorld({ inn_tier: "fine" }));
probeImports("noble / heartland / summer / clear / normal / peace / none",
  blankWorld({ inn_tier: "noble" }));

console.log("\n====== B. Staple ingredient appearance ======");
for (const tier of ["roadside", "common"]) {
  for (const biome of BIOMES) {
    for (const season of SEASONS) {
      probeStaple(`${tier}/${biome}/${season}`,
        blankWorld({ inn_tier: tier, biome, season }));
    }
  }
}
