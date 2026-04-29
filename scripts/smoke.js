// scripts/smoke.js
// Exhaustive smoke test for the menu generator.
// Sweeps a Cartesian product of world axes, generates many menus per world,
// and reports which authored dishes / ingredients / preparations / templates
// appear too often, too rarely, or never.
//
// Usage:
//   node scripts/smoke.js
//   SAMPLES=10 node scripts/smoke.js          # 10 menus per world
//   WORLDS=200 node scripts/smoke.js          # cap world count (random subset)
//   RARE_FACTOR=0.2 OVER_FACTOR=5 node scripts/smoke.js
//
// Output:
//   stdout: condensed summary
//   out/smoke-report.md: latest full report (overwritten each run)
//   out/history/smoke-report-YYYY-MM-DDTHHMMSS.md: dated archive copy

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "out");
const HISTORY_DIR = path.join(OUT_DIR, "history");
const REPORT_PATH = path.join(OUT_DIR, "smoke-report.md");
// Compact ISO-ish timestamp: 2026-04-27T143015. Sortable, filesystem-safe.
const RUN_STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "")
  .replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4$5$6");
const ARCHIVE_PATH = path.join(HISTORY_DIR, `smoke-report-${RUN_STAMP}.md`);

const SAMPLES = parseInt(process.env.SAMPLES || "5", 10);
const WORLDS_CAP = process.env.WORLDS ? parseInt(process.env.WORLDS, 10) : null;
const RARE_FACTOR = parseFloat(process.env.RARE_FACTOR || "0.2");
const OVER_FACTOR = parseFloat(process.env.OVER_FACTOR || "5");

// ---------- load data ----------
function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name + ".json"), "utf8"));
}
const data = {
  authored_dishes: loadJson("authored_dishes"),
  ingredients: loadJson("ingredients"),
  preparations: loadJson("preparations"),
  dishes: loadJson("dishes"),
  events: loadJson("events"),
  modifiers: loadJson("modifiers")
};

// ---------- load generator into Node ----------
// generator.js targets the browser; it ends with `window.InnMenu = {...}`.
// Stub a window object, then evaluate the source in this context.
globalThis.window = {};
const generatorSrc = fs.readFileSync(path.join(ROOT, "src", "generator.js"), "utf8");
vm.runInThisContext(generatorSrc, { filename: "src/generator.js" });
const { generateMenuTraced } = globalThis.window.InnMenu;
if (typeof generateMenuTraced !== "function") {
  console.error("generateMenuTraced not found on window.InnMenu");
  process.exit(1);
}

// ---------- world sweep ----------
const biomes = Object.keys(data.modifiers.biomes);
const seasons = ["spring", "summer", "autumn", "winter"];
const weathers = Object.keys(data.modifiers.weather);
const tiers = Object.keys(data.modifiers.inn_tiers);
const economies = Object.keys(data.modifiers.economy);
const conditions = Object.keys(data.modifiers.conditions);
const events = data.events.events.map(e => e.id);
const incompat = data.modifiers.weather_incompatibilities || {};

function isWeatherCompatible(biome, season, weather) {
  const bad = incompat[weather];
  if (!bad) return true;
  if ((bad.biomes || []).includes(biome)) return false;
  if ((bad.seasons || []).includes(season)) return false;
  return true;
}

function buildWorlds() {
  const list = [];
  for (const biome of biomes)
    for (const season of seasons)
      for (const weather of weathers) {
        if (!isWeatherCompatible(biome, season, weather)) continue;
        for (const inn_tier of tiers)
          for (const economy of economies)
            for (const condition of conditions)
              for (const event of events)
                list.push({ biome, season, weather, inn_tier, economy, condition, event });
      }
  return list;
}

let worlds = buildWorlds();
if (WORLDS_CAP && worlds.length > WORLDS_CAP) {
  // Deterministic stride sampling so a small cap still spans all axes.
  const stride = worlds.length / WORLDS_CAP;
  const picked = [];
  for (let i = 0; i < WORLDS_CAP; i++) picked.push(worlds[Math.floor(i * stride)]);
  worlds = picked;
}

// ---------- run ----------
const authoredCount = new Map();   // id -> n
const ingredientCount = new Map(); // id -> n
const prepCount = new Map();       // id -> n
const templateCount = new Map();   // id -> n
let totalDishes = 0, totalAuthoredEmitted = 0, totalProceduralEmitted = 0;
let totalIngredientSlots = 0, totalPrepSlots = 0;

const t0 = Date.now();
for (let w = 0; w < worlds.length; w++) {
  const world = worlds[w];
  for (let s = 0; s < SAMPLES; s++) {
    const seed = `${w}:${s}`;
    const { menu, trace } = generateMenuTraced(world, data, seed);
    for (const sec of Object.values(menu.sections)) {
      for (const d of sec.dishes) {
        totalDishes++;
        if (d.source === "authored") totalAuthoredEmitted++;
        else totalProceduralEmitted++;
      }
    }
    for (const id of trace.authored)     bump(authoredCount, id);
    for (const id of trace.ingredients)  { bump(ingredientCount, id); totalIngredientSlots++; }
    for (const id of trace.preparations) { bump(prepCount, id); totalPrepSlots++; }
    for (const id of trace.templates)    bump(templateCount, id);
  }
}
const elapsedMs = Date.now() - t0;

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }

// ---------- analysis ----------
const allAuthored = data.authored_dishes.dishes;
const allIngredients = data.ingredients.ingredients;
const allPreps = data.preparations.preparations;
const allTemplates = data.dishes.templates;

function classify(count, expectedRate, total) {
  if (count === 0) return "never";
  const rate = count / total;
  if (rate < expectedRate * RARE_FACTOR) return "rare";
  if (rate > expectedRate * OVER_FACTOR) return "overused";
  return "normal";
}

function rowsForUniverse(universe, counts, total, expectedRate, idKey, labelFn) {
  return universe.map(item => {
    const id = item[idKey];
    const count = counts.get(id) || 0;
    const rate = total > 0 ? count / total : 0;
    return {
      id,
      label: labelFn(item),
      count,
      rate,
      bucket: classify(count, expectedRate, total)
    };
  });
}

const authoredRows = rowsForUniverse(
  allAuthored, authoredCount, totalAuthoredEmitted, 1 / allAuthored.length,
  "id", d => d.name
);
const ingredientRows = rowsForUniverse(
  allIngredients, ingredientCount, totalIngredientSlots, 1 / allIngredients.length,
  "id", i => `${i.name} [${(i.roles || []).join(",")}]`
);
const prepRows = rowsForUniverse(
  allPreps, prepCount, totalPrepSlots, 1 / allPreps.length,
  "id", p => p.name
);
const templateRows = rowsForUniverse(
  allTemplates, templateCount, totalProceduralEmitted, 1 / allTemplates.length,
  "id", t => `${t.id} (${t.section})`
);

function fmtPct(r) { return (r * 100).toFixed(2) + "%"; }
function byCount(a, b) { return b.count - a.count; }

function summarize(name, rows) {
  const never = rows.filter(r => r.bucket === "never");
  const rare = rows.filter(r => r.bucket === "rare").sort(byCount);
  const overused = rows.filter(r => r.bucket === "overused").sort(byCount).reverse();
  return { name, total: rows.length, never, rare, overused };
}

const authoredSum = summarize("authored dishes", authoredRows);
const ingredientSum = summarize("ingredients", ingredientRows);
const prepSum = summarize("preparations", prepRows);
const templateSum = summarize("templates", templateRows);

// ---------- anomaly check: authored dishes that *could* match some world ----------
// If a never-appeared authored dish has at least one world in our sweep where
// the static filters would let it through, that's a coverage anomaly worth
// flagging. We run filterAuthored via the loaded generator's own logic by
// re-invoking generateMenu on candidate worlds, but cheaper: replicate the
// minimal static check here (biome/season/tier/economy/condition).
function staticallyReachable(dish) {
  const tierTags = new Set(["peasant","common","refined","noble","foreign","exotic"]);
  const culturalDishTags = (dish.tags || []).filter(t => tierTags.has(t));
  for (const world of worlds) {
    const tier = data.modifiers.inn_tiers[world.inn_tier];
    const tierIdx = { roadside: 1, common: 2, fine: 3, noble: 4 }[world.inn_tier];
    const econ = data.modifiers.economy[world.economy];
    const cond = data.modifiers.conditions[world.condition];

    // Biome (allow imports for fine+ when condition does not exclude imports)
    const biomeOk = dish.biomes.includes("any")
      || dish.biomes.includes(world.biome)
      || (!cond.excludes_imports && tierIdx >= 3);
    if (!biomeOk) continue;
    // Season
    if (!dish.seasons.includes("all-seasons") && !dish.seasons.includes(world.season)) continue;
    // Tier
    if (dish.tier_min && tierIdx < dish.tier_min) continue;
    if (dish.tier_max && tierIdx > dish.tier_max) continue;
    // Cultural tags vs allowed_tags
    if (culturalDishTags.length && !culturalDishTags.some(t => tier.allowed_tags.includes(t))) continue;
    // Condition excludes
    if ((cond.excludes_tags || []).some(t => (dish.tags || []).includes(t))) continue;
    // Economy cost ceiling
    if (dish.cost > econ.remove_above_cost) continue;
    return true;
  }
  return false;
}

const reachableNeverAuthored = authoredSum.never
  .map(r => {
    const dish = allAuthored.find(d => d.id === r.id);
    return { row: r, dish, reachable: staticallyReachable(dish) };
  })
  .filter(x => x.reachable);

// ---------- report ----------
function tableRows(rows, opts = {}) {
  const limit = opts.limit || rows.length;
  const lines = ["| id | label | count | share | bucket |", "|---|---|---:|---:|---|"];
  for (const r of rows.slice(0, limit)) {
    lines.push(`| ${r.id} | ${r.label} | ${r.count} | ${fmtPct(r.rate)} | ${r.bucket} |`);
  }
  return lines.join("\n");
}

function buildReport() {
  const lines = [];
  lines.push("# Inn Menu Simulator — Smoke Report");
  lines.push("");
  lines.push("## Run config");
  lines.push("");
  lines.push(`- worlds swept: **${worlds.length}** (after weather/biome/season pruning${WORLDS_CAP ? `, capped to ${WORLDS_CAP}` : ""})`);
  lines.push(`- samples per world: **${SAMPLES}**`);
  lines.push(`- total menus generated: **${worlds.length * SAMPLES}**`);
  lines.push(`- total dishes emitted: **${totalDishes}** (authored: ${totalAuthoredEmitted}, procedural: ${totalProceduralEmitted})`);
  lines.push(`- total ingredient slots filled: **${totalIngredientSlots}**`);
  lines.push(`- total preparations applied: **${totalPrepSlots}**`);
  lines.push(`- thresholds: rare < ${RARE_FACTOR}× expected uniform rate, overused > ${OVER_FACTOR}× expected uniform rate`);
  lines.push(`- elapsed: **${(elapsedMs / 1000).toFixed(1)}s**`);
  lines.push("");

  for (const sum of [authoredSum, ingredientSum, prepSum, templateSum]) {
    lines.push(`## ${sum.name}`);
    lines.push("");
    lines.push(`Universe: **${sum.total}**. Never appeared: **${sum.never.length}**, rare: **${sum.rare.length}**, overused: **${sum.overused.length}**.`);
    lines.push("");

    if (sum.never.length) {
      lines.push("### Never appeared");
      lines.push("");
      lines.push(tableRows(sum.never));
      lines.push("");
    }
    if (sum.rare.length) {
      lines.push(`### Rare (${sum.rare.length})`);
      lines.push("");
      lines.push(tableRows(sum.rare, { limit: 50 }));
      lines.push("");
    }
    if (sum.overused.length) {
      lines.push(`### Overused (${sum.overused.length})`);
      lines.push("");
      lines.push(tableRows(sum.overused, { limit: 50 }));
      lines.push("");
    }

    const allRows = (sum === authoredSum ? authoredRows
      : sum === ingredientSum ? ingredientRows
      : sum === prepSum ? prepRows
      : templateRows).slice().sort(byCount).reverse();
    lines.push(`### Top 20 by count`);
    lines.push("");
    lines.push(tableRows(allRows, { limit: 20 }));
    lines.push("");
  }

  lines.push("## Anomalies");
  lines.push("");
  if (reachableNeverAuthored.length === 0) {
    lines.push("No authored dish that should have been reachable was missed.");
  } else {
    lines.push(`**${reachableNeverAuthored.length}** authored dishes never appeared even though at least one swept world's static filters would admit them. Likely causes: weighting suppression, scarcity tag stripping, or section-cap eviction.`);
    lines.push("");
    lines.push("| id | name | section | biomes | seasons | tags |");
    lines.push("|---|---|---|---|---|---|");
    for (const x of reachableNeverAuthored) {
      const d = x.dish;
      lines.push(`| ${d.id} | ${d.name} | ${d.section} | ${(d.biomes || []).join(",")} | ${(d.seasons || []).join(",")} | ${(d.tags || []).join(",")} |`);
    }
  }
  lines.push("");

  // Sanity assertions
  lines.push("## Sanity checks");
  lines.push("");
  const checks = [];
  checks.push(["all 9 preparations appear at least once", prepSum.never.length === 0]);
  checks.push(["all 22 templates appear at least once", templateSum.never.length === 0]);
  checks.push(["total ingredient slots > 0", totalIngredientSlots > 0]);
  checks.push(["≥ 80% authored dishes appear at least once",
    (allAuthored.length - authoredSum.never.length) / allAuthored.length >= 0.8]);
  for (const [label, ok] of checks) {
    lines.push(`- ${ok ? "[x]" : "[ ]"} ${label}`);
  }
  lines.push("");

  return lines.join("\n");
}

const report = buildReport();
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, report, "utf8");
fs.writeFileSync(ARCHIVE_PATH, report, "utf8");

// ---------- stdout summary ----------
console.log(`\nSmoke run complete in ${(elapsedMs / 1000).toFixed(1)}s`);
console.log(`Worlds: ${worlds.length} | Samples/world: ${SAMPLES} | Menus: ${worlds.length * SAMPLES} | Dishes: ${totalDishes}`);
console.log("");
function lineFor(sum) {
  console.log(`${sum.name.padEnd(18)} universe=${String(sum.total).padStart(4)}  never=${String(sum.never.length).padStart(3)}  rare=${String(sum.rare.length).padStart(3)}  overused=${String(sum.overused.length).padStart(3)}`);
}
lineFor(authoredSum);
lineFor(ingredientSum);
lineFor(prepSum);
lineFor(templateSum);
console.log("");
if (authoredSum.never.length) {
  console.log("Authored never-appeared (first 10):");
  for (const r of authoredSum.never.slice(0, 10)) console.log(`  - ${r.id}: ${r.label}`);
  if (authoredSum.never.length > 10) console.log(`  ... and ${authoredSum.never.length - 10} more`);
  console.log("");
}
if (ingredientSum.never.length) {
  console.log(`Ingredients never-appeared: ${ingredientSum.never.length}`);
  for (const r of ingredientSum.never.slice(0, 10)) console.log(`  - ${r.id}: ${r.label}`);
  if (ingredientSum.never.length > 10) console.log(`  ... and ${ingredientSum.never.length - 10} more`);
  console.log("");
}
console.log(`Full report: ${path.relative(ROOT, REPORT_PATH)}`);
console.log(`Archived to: ${path.relative(ROOT, ARCHIVE_PATH)}`);
