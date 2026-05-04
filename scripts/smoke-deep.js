// scripts/smoke-deep.js
// Deeper smoke pass: cross-tabulates ingredient/dish/prep frequency by world axis,
// flags scope/setting inconsistencies, and looks for unreachable content.
// Read-only: writes one report to out/smoke-deep.md.

"use strict";
const fs = require("fs");
const path = require("path");
const { ingredientReachable, VALID_BIOME_TOKENS } = require("./lib/checks");
const { ROOT, loadData, loadGenerator } = require("./lib/loader");

const OUT_DIR = path.join(ROOT, "out");
const REPORT_PATH = path.join(OUT_DIR, "smoke-deep.md");

const SAMPLES = parseInt(process.env.SAMPLES || "3", 10);

const data = loadData();
const { generateMenuTraced } = loadGenerator();

const VALID_BIOMES = ["coastal","heartland","highland","arid","frostlands"];
const SUB_BIOMES = ["forest","river","lake","subterranean","plains"];
// VALID_BIOME_TOKENS comes from checks.js and includes the same set plus "any".
const ALL_BIOME_TOKENS = VALID_BIOME_TOKENS;

const biomes = VALID_BIOMES;
const seasons = ["spring","summer","autumn","winter"];
const weathers = Object.keys(data.modifiers.weather);
const tiers = Object.keys(data.modifiers.inn_tiers);
const economies = Object.keys(data.modifiers.economy);
const conditions = Object.keys(data.modifiers.conditions);
const events = data.events.events.map(e => e.id);
const incompat = data.modifiers.weather_incompatibilities || {};

function weatherOk(b, s, w) {
  const bad = incompat[w]; if (!bad) return true;
  if ((bad.biomes || []).includes(b)) return false;
  if ((bad.seasons || []).includes(s)) return false;
  return true;
}

// Build worlds keyed by tag-of-interest for cross-tab. We sweep full Cartesian for
// the per-axis aggregation; this matches scripts/smoke.js scope.
const worlds = [];
for (const biome of biomes)
  for (const season of seasons)
    for (const weather of weathers) {
      if (!weatherOk(biome, season, weather)) continue;
      for (const inn_tier of tiers)
        for (const economy of economies)
          for (const condition of conditions)
            for (const event of events)
              worlds.push({ biome, season, weather, inn_tier, economy, condition, event });
    }

// ---------- per-axis tallies ----------
function emptyAxis(values) {
  const o = {};
  for (const v of values) o[v] = { authored: new Map(), ingredients: new Map(), preparations: new Map(), templates: new Map(), n: 0 };
  return o;
}
const byBiome = emptyAxis(biomes);
const bySeason = emptyAxis(seasons);
const byTier = emptyAxis(tiers);
const byCondition = emptyAxis(conditions);
const byWeather = emptyAxis(weathers);
const byEvent = emptyAxis(events);
// Per-biome × tier ingredient counters (used by §12). Populated in the main
// sweep below so we don't pay for a second full pass.
const biomeTier = {};
for (const b of biomes) for (const t of tiers) biomeTier[`${b}|${t}`] = { ingredients: new Map() };

function bump(map, k) { map.set(k, (map.get(k) || 0) + 1); }
function record(axis, key, trace) {
  const slot = axis[key];
  slot.n++;
  for (const id of trace.authored) bump(slot.authored, id);
  for (const id of trace.ingredients) bump(slot.ingredients, id);
  for (const id of trace.preparations) bump(slot.preparations, id);
  for (const id of trace.templates) bump(slot.templates, id);
}

const t0 = Date.now();
let menus = 0;
for (let i = 0; i < worlds.length; i++) {
  const w = worlds[i];
  for (let s = 0; s < SAMPLES; s++) {
    const seed = `d${i}:${s}`;
    const { trace } = generateMenuTraced(w, data, seed);
    record(byBiome, w.biome, trace);
    record(bySeason, w.season, trace);
    record(byTier, w.inn_tier, trace);
    record(byCondition, w.condition, trace);
    record(byWeather, w.weather, trace);
    record(byEvent, w.event, trace);
    const btSlot = biomeTier[`${w.biome}|${w.inn_tier}`];
    for (const id of trace.ingredients) bump(btSlot.ingredients, id);
    menus++;
  }
}
const elapsedMs = Date.now() - t0;

// ---------- helpers ----------
const dishById = new Map(data.authored_dishes.dishes.map(d => [d.id, d]));
const ingById = new Map(data.ingredients.ingredients.map(i => [i.id, i]));

function topN(map, n, keyFn = id => id) {
  return [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, n).map(([id, c]) => ({ id, count: c, label: keyFn(id) }));
}
function bottomN(map, n, universe, keyFn = id => id) {
  const rows = universe.map(id => ({ id, count: map.get(id) || 0, label: keyFn(id) }));
  rows.sort((a,b) => a.count - b.count);
  return rows.slice(0, n);
}

// ---------- inconsistency scans ----------
const issues = [];

// 1. Authored dishes referencing biome IDs that aren't a real biome and aren't 'any'.
const dishBiomeUsage = new Map();
for (const d of data.authored_dishes.dishes) {
  for (const b of d.biomes || []) bump(dishBiomeUsage, b);
}
const invalidBiomesInDishes = [];
for (const d of data.authored_dishes.dishes) {
  const bad = (d.biomes || []).filter(b => !ALL_BIOME_TOKENS.has(b));
  if (bad.length) invalidBiomesInDishes.push({ id: d.id, name: d.name, bad });
}

// 2. Authored dishes whose ONLY biomes are non-existent / non-'any' (orphaned native).
const dishesOnlyOrphanBiome = data.authored_dishes.dishes.filter(d => {
  const bs = d.biomes || [];
  if (!bs.length) return false;
  return bs.every(b => !VALID_BIOMES.includes(b) && b !== "any");
});

// 3. Ingredients with biome tags that don't match any real biome (would always filter out).
const ingredientBadBiomeTags = [];
for (const ing of data.ingredients.ingredients) {
  const tags = ing.tags || [];
  const biomeLikeTags = tags.filter(t => /^(coastal|heartland|highland|arid|frostlands|forest|river|lake|subterranean|plains|mediterranean|nordic)$/.test(t));
  const realBiomeTags = biomeLikeTags.filter(t => VALID_BIOMES.includes(t));
  // If the ingredient has cuisine tags only (mediterranean/nordic) that isn't a real biome,
  // and no real biome tag, it'd still pass the filter (cuisine tags are not in the BIOMES list
  // in generator.js, so they're treated as ambient). Flag if all biome-like tokens are non-biome:
  if (biomeLikeTags.length && !realBiomeTags.length && !biomeLikeTags.some(t => SUB_BIOMES.includes(t))) {
    ingredientBadBiomeTags.push({ id: ing.id, name: ing.name, tags: biomeLikeTags });
  }
}

// 4. Reachability: which ingredients can no template ever pull?
//    Uses the shared helper in scripts/lib/checks.js. Reachability is computed
//    on role + affinity alone (the curatorial `peculiar` filter is separate);
//    a non-peculiar ingredient that lands here is genuinely orphaned.
const unreachableIngredients = data.ingredients.ingredients.filter(i =>
  !(i.tags || []).includes("peculiar") &&
  !ingredientReachable(i, data.dishes.templates, data.preparations.preparations)
);

// 5. Authored dish name collisions / near-dupes (case-insensitive trimmed).
const nameSeen = new Map();
for (const d of data.authored_dishes.dishes) {
  const k = d.name.toLowerCase().trim();
  if (!nameSeen.has(k)) nameSeen.set(k, []);
  nameSeen.get(k).push(d.id);
}
const dupNames = [...nameSeen.entries()].filter(([_, ids]) => ids.length > 1);

// 6. Section coverage per biome × season — any (biome, season) with very few authored dishes?
function authoredFor(biome, season) {
  return data.authored_dishes.dishes.filter(d => {
    if (!(d.biomes || []).includes("any") && !(d.biomes || []).includes(biome)) return false;
    if (!(d.seasons || []).includes("all-seasons") && !(d.seasons || []).includes(season)) return false;
    return true;
  });
}
const sparseBiomeSeasonCells = [];
for (const biome of biomes) for (const season of seasons) {
  const list = authoredFor(biome, season);
  const sections = { appetizer: 0, main: 0, dessert: 0, drink: 0 };
  for (const d of list) sections[d.section] = (sections[d.section] || 0) + 1;
  for (const sec of ["appetizer","main","dessert","drink"]) {
    if (sections[sec] < 2) sparseBiomeSeasonCells.push({ biome, season, section: sec, count: sections[sec] });
  }
}

// 7. Tier distribution of authored dishes (how many native-only roadside dishes vs noble?)
const dishTierBuckets = { roadside: 0, common: 0, fine: 0, noble: 0, any: 0 };
for (const d of data.authored_dishes.dishes) {
  const min = d.tier_min || 1;
  const max = d.tier_max || 4;
  if (min === 1 && max >= 4) dishTierBuckets.any++;
  else if (max <= 2) dishTierBuckets.roadside++;
  else if (min >= 3) dishTierBuckets.noble++;
  else if (min >= 2) dishTierBuckets.fine++;
  else dishTierBuckets.common++;
}

// 8. "contains" coverage on mains: any main missing the field?
// Mains lacking both `contains` and the meatless-intent `_comment`. Matches the
// assertion in scripts/smoke.js so an explicit meatless dish doesn't get flagged.
const mainsMissingContains = data.authored_dishes.dishes.filter(d =>
  d.section === "main" && d.contains === undefined && !d._comment
);

// 9. Authored biome distribution: dish counts per biome (native).
const dishesPerBiome = {};
for (const b of biomes) dishesPerBiome[b] = 0;
dishesPerBiome.any = 0;
for (const d of data.authored_dishes.dishes) {
  for (const b of d.biomes || []) {
    if (b === "any") dishesPerBiome.any++;
    else if (VALID_BIOMES.includes(b)) dishesPerBiome[b]++;
  }
}

// 10. Section counts in authored pool overall
const sectionDistAuthored = { appetizer: 0, main: 0, dessert: 0, drink: 0 };
for (const d of data.authored_dishes.dishes) sectionDistAuthored[d.section] = (sectionDistAuthored[d.section] || 0) + 1;

// 11. Authored drinks per biome (drinks pool was nearly empty before; check coverage).
const drinksPerBiome = {};
for (const b of biomes) drinksPerBiome[b] = 0;
drinksPerBiome.any = 0;
for (const d of data.authored_dishes.dishes) {
  if (d.section !== "drink") continue;
  for (const b of d.biomes || []) {
    if (b === "any") drinksPerBiome.any++;
    else if (VALID_BIOMES.includes(b)) drinksPerBiome[b]++;
  }
}

// 12. Per-biome top-3 ingredients on roadside vs noble inns — useful for tier/scope checks.
//     `biomeTier` was populated alongside the per-axis tallies in the main sweep above.

// ---------- write report ----------
function ingLabel(id) { const x = ingById.get(id); return x ? `${x.name} [${(x.roles||[]).join(",")}]` : id; }
function dishLabel(id) { const x = dishById.get(id); return x ? x.name : id; }

const lines = [];
lines.push("# Inn Menu Simulator — Deep Smoke Report");
lines.push("");
lines.push(`- worlds: **${worlds.length}**, samples/world: **${SAMPLES}**, total menus: **${menus}**`);
lines.push(`- elapsed: **${(elapsedMs/1000).toFixed(1)}s**`);
lines.push("");

lines.push("## A. Top/bottom by world axis");
lines.push("");

function axisBlock(title, axis, universeIngs, universeDishes, axisKeys) {
  lines.push(`### ${title}`);
  lines.push("");
  for (const k of axisKeys) {
    const slot = axis[k];
    if (!slot.n) continue;
    lines.push(`#### ${k} (n=${slot.n})`);
    lines.push("");
    lines.push(`Top 5 ingredients`);
    for (const r of topN(slot.ingredients, 5, ingLabel))
      lines.push(`- ${r.id} — ${r.label} — ${r.count}`);
    lines.push("");
    lines.push(`Top 5 authored dishes`);
    for (const r of topN(slot.authored, 5, dishLabel))
      lines.push(`- ${r.id} — ${r.label} — ${r.count}`);
    lines.push("");
    const zero = universeIngs.filter(id => !slot.ingredients.has(id));
    lines.push(`Ingredients never appearing in this slice: **${zero.length}** (of ${universeIngs.length})`);
    if (zero.length && zero.length <= 30) {
      for (const id of zero) lines.push(`  - ${id} — ${ingLabel(id)}`);
    }
    lines.push("");
  }
}

const ingUniverse = data.ingredients.ingredients.map(i => i.id);
const dishUniverse = data.authored_dishes.dishes.map(d => d.id);

axisBlock("By biome", byBiome, ingUniverse, dishUniverse, biomes);
axisBlock("By season", bySeason, ingUniverse, dishUniverse, seasons);
axisBlock("By tier", byTier, ingUniverse, dishUniverse, tiers);
axisBlock("By condition", byCondition, ingUniverse, dishUniverse, conditions);
axisBlock("By weather", byWeather, ingUniverse, dishUniverse, weathers);
axisBlock("By event", byEvent, ingUniverse, dishUniverse, events);

// Tier × biome ingredient leaders
lines.push("## B. Top ingredient by biome × tier");
lines.push("");
lines.push("| biome | tier | top ingredient | count |");
lines.push("|---|---|---|---:|");
for (const b of biomes) for (const t of tiers) {
  const top = topN(biomeTier[`${b}|${t}`].ingredients, 1, ingLabel)[0];
  if (top) lines.push(`| ${b} | ${t} | ${top.id} (${top.label}) | ${top.count} |`);
}
lines.push("");

lines.push("## C. Inconsistencies & scope flags");
lines.push("");

lines.push(`### C1. Authored dishes with invalid biome IDs (${invalidBiomesInDishes.length})`);
lines.push("");
lines.push("Valid biomes are coastal, heartland, highland, arid, frostlands, plus 'any'. Sub-biomes (forest, river, lake, subterranean, plains) are tag-only per DESIGN.md but tolerated in dish biomes. Anything else is dead text.");
lines.push("");
if (invalidBiomesInDishes.length) {
  lines.push("| id | name | invalid biome tokens |");
  lines.push("|---|---|---|");
  for (const x of invalidBiomesInDishes) lines.push(`| ${x.id} | ${x.name} | ${x.bad.join(", ")} |`);
} else lines.push("None.");
lines.push("");

lines.push(`### C2. Authored dishes whose only biomes are orphan tokens (${dishesOnlyOrphanBiome.length})`);
lines.push("These dishes have no chance of native match — they only appear as imports at fine+ inns.");
lines.push("");
if (dishesOnlyOrphanBiome.length) {
  for (const d of dishesOnlyOrphanBiome) lines.push(`- ${d.id} — ${d.name} — biomes: ${(d.biomes||[]).join(", ")}`);
} else lines.push("None.");
lines.push("");

lines.push(`### C3. Ingredient biome usage in dish records`);
lines.push("");
lines.push("| biome token | count of authored dishes referencing it |");
lines.push("|---|---:|");
for (const [k, v] of [...dishBiomeUsage.entries()].sort((a,b)=>b[1]-a[1])) lines.push(`| ${k} | ${v} |`);
lines.push("");

lines.push(`### C4. Ingredients with non-biome biome-like tags only (${ingredientBadBiomeTags.length})`);
lines.push("These tags don't gate the ingredient (treated as ambient) but suggest a misspelling or scope drift (e.g. 'mediterranean' is a cuisine tag here, not a biome).");
lines.push("");
if (ingredientBadBiomeTags.length) {
  for (const x of ingredientBadBiomeTags) lines.push(`- ${x.id} — ${x.name} — tags: ${x.tags.join(", ")}`);
} else lines.push("None worth flagging.");
lines.push("");

lines.push(`### C5. Truly orphaned ingredients (${unreachableIngredients.length})`);
lines.push("Non-peculiar ingredients no template+prep combination can pull. The procedural-pool's `peculiar` filter is intentional and excluded from this scan.");
lines.push("");
if (unreachableIngredients.length) {
  for (const ing of unreachableIngredients)
    lines.push(`- ${ing.id} — ${ing.name} — roles: ${(ing.roles||[]).join(",")} — affinities: ${(ing.affinities||[]).join(",")}`);
} else lines.push("All non-peculiar ingredients reachable.");
lines.push("");

lines.push(`### C6. Duplicate dish names (${dupNames.length})`);
lines.push("");
if (dupNames.length) {
  for (const [name, ids] of dupNames) lines.push(`- "${name}" — ${ids.join(", ")}`);
} else lines.push("None.");
lines.push("");

lines.push(`### C7. Sparse biome × season × section cells (count < 2)`);
lines.push("");
lines.push("Cells where the authored pool offers fewer than 2 dishes for that (biome, season) in a given section. Procedural fills the gap, but with the cap system + scarcity reductions, low coverage in mains/desserts is where menus visibly thin out.");
lines.push("");
lines.push(`Total flagged: **${sparseBiomeSeasonCells.length}**`);
lines.push("");
const sparseGrouped = {};
for (const c of sparseBiomeSeasonCells) {
  const k = `${c.biome}/${c.section}`;
  if (!sparseGrouped[k]) sparseGrouped[k] = [];
  sparseGrouped[k].push(`${c.season}=${c.count}`);
}
lines.push("| biome / section | sparse seasons |");
lines.push("|---|---|");
for (const k of Object.keys(sparseGrouped).sort()) lines.push(`| ${k} | ${sparseGrouped[k].join(", ")} |`);
lines.push("");

lines.push(`### C8. Authored mains missing 'contains' field (${mainsMissingContains.length})`);
lines.push("Without `contains`, the cap system treats them as meatless. May or may not be intentional.");
lines.push("");
if (mainsMissingContains.length) for (const d of mainsMissingContains) lines.push(`- ${d.id} — ${d.name} — biomes: ${(d.biomes||[]).join(",")}`);
else lines.push("None.");
lines.push("");

lines.push(`### C9. Authored dish counts per biome (native + 'any')`);
lines.push("");
lines.push("| biome | total native dishes |");
lines.push("|---|---:|");
for (const k of [...biomes, "any"]) lines.push(`| ${k} | ${dishesPerBiome[k]} |`);
lines.push("");

lines.push(`### C10. Authored drink counts per biome`);
lines.push("");
lines.push("| biome | drinks |");
lines.push("|---|---:|");
for (const k of [...biomes, "any"]) lines.push(`| ${k} | ${drinksPerBiome[k]} |`);
lines.push("");

lines.push(`### C11. Authored section distribution`);
lines.push("");
lines.push("| section | count |");
lines.push("|---|---:|");
for (const s of ["appetizer","main","dessert","drink"]) lines.push(`| ${s} | ${sectionDistAuthored[s]||0} |`);
lines.push("");

lines.push(`### C12. Authored tier-bucket distribution`);
lines.push("");
lines.push("| bucket | count |");
lines.push("|---|---:|");
for (const k of ["any","roadside","common","fine","noble"]) lines.push(`| ${k} | ${dishTierBuckets[k]} |`);
lines.push("");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
console.log(`wrote ${path.relative(ROOT, REPORT_PATH)} (${menus} menus, ${(elapsedMs/1000).toFixed(1)}s)`);
console.log("");
console.log(`Inconsistency hits:`);
console.log(`  C1 invalid biome IDs in dishes:        ${invalidBiomesInDishes.length}`);
console.log(`  C2 dishes only-orphan biomes:          ${dishesOnlyOrphanBiome.length}`);
console.log(`  C4 ingredients with bad biome-tags:    ${ingredientBadBiomeTags.length}`);
console.log(`  C5 procedurally unreachable ingreds:   ${unreachableIngredients.length}`);
console.log(`  C6 duplicate dish names:               ${dupNames.length}`);
console.log(`  C7 sparse biome×season×section cells:  ${sparseBiomeSeasonCells.length}`);
console.log(`  C8 mains missing 'contains':           ${mainsMissingContains.length}`);
