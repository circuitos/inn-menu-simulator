// scripts/tag-origins.js
// One-shot data sweep: adds origin top-biome tags to ingredients that lack
// one, where origin is unambiguous. Edits in place via line-level regex so
// the file's per-ingredient single-line layout is preserved.
//
// Pantry staples that grow/are produced everywhere (bread, milk, eggs, basic
// offal, common roots, common herbs, basic poultry) stay ambient — no biome
// tag — so they continue to pass the procedural pool filter in every world.
"use strict";

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "..", "data", "ingredients.json");
const TOP = ["coastal", "heartland", "highland", "arid", "frostlands"];

const ORIGINS = {
  // Tropical / Mediterranean / East Asian / New World → arid
  cassava: "arid", yam: "arid", "sweet-potato": "arid",
  maize: "arid", amaranth: "arid", semolina: "arid",
  "bok-choy": "arid", enoki: "arid", "bamboo-shoot": "arid",
  shiitake: "arid",
  pomelo: "arid", papaya: "arid", mango: "arid", banana: "arid",
  pineapple: "arid", persimmon: "arid", mulberry: "arid",
  jackfruit: "arid", lychee: "arid", longan: "arid", yuzu: "arid",
  starfruit: "arid", "passion-fruit": "arid", plantain: "arid",
  "coconut-milk": "arid", "palm-oil": "arid", "kola-nut": "arid",
  rum: "arid", molasses: "arid",
  avocado: "arid", tomatillo: "arid",
  "black-beans": "arid", "lima-beans": "arid", "mung-bean": "arid",
  azuki: "arid", tofu: "arid",
  miso: "arid", "soy-sauce": "arid", sake: "arid", mirin: "arid",
  "black-vinegar": "arid", "mustard-oil": "arid",
  ginger: "arid", pepper: "arid", cinnamon: "arid", nutmeg: "arid",
  liquorice: "arid", lemongrass: "arid", galangal: "arid",
  turmeric: "arid", cardamom: "arid", clove: "arid",
  "star-anise": "arid", tamarind: "arid", asafoetida: "arid",
  "black-cardamom": "arid", allspice: "arid", "long-pepper": "arid",
  "fresh-turmeric": "arid",
  pecan: "arid", macadamia: "arid",
  "water-chestnut": "arid", "lotus-root": "arid",
  kefir: "arid", "mare-milk": "arid", "horse-meat": "arid",
  "sunflower-seed": "arid",

  // Temperate forest / river / lake / temperate grassland → heartland
  mushroom: "heartland", berries: "heartland",
  blackberry: "heartland", raspberry: "heartland", elderberry: "heartland",
  pheasant: "heartland", woodcock: "heartland",
  "wild-boar": "heartland", badger: "heartland",
  hedgehog: "heartland", dormouse: "heartland",
  hazelnut: "heartland", "pine-nut": "heartland", walnut: "heartland",
  rosehip: "heartland", hawthorn: "heartland", sloe: "heartland",
  elderflower: "heartland", sorrel: "heartland",
  "wild-garlic": "heartland", ramps: "heartland",
  "truffle-black": "heartland", "truffle-white": "heartland",
  chanterelle: "heartland", porcini: "heartland", morel: "heartland",
  "oyster-shroom": "heartland",
  nettles: "heartland", burdock: "heartland",
  snail: "heartland",
  trout: "heartland", pike: "heartland", carp: "heartland",
  perch: "heartland", zander: "heartland", crawfish: "heartland",
  eel: "heartland", lamprey: "heartland", "frog-legs": "heartland",
  watercress: "heartland", "wild-rice": "heartland",
  duck: "heartland", goose: "heartland",
  snipe: "heartland", swan: "heartland",
  mole: "heartland", salsify: "heartland", sunchoke: "heartland",
  dandelion: "heartland", hare: "heartland", bison: "heartland",
  lark: "heartland", flax: "heartland",
  quail: "heartland", venison: "heartland", squirrel: "heartland",

  // Cold-climate signature → frostlands
  "maple-syrup": "frostlands"
};

const src = fs.readFileSync(FILE, "utf8");
const lines = src.split("\n");
let touched = 0, skipped = 0, missed = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const idMatch = line.match(/"id":\s*"([^"]+)"/);
  if (!idMatch) continue;
  const id = idMatch[1];
  if (!(id in ORIGINS)) continue;

  const tagsMatch = line.match(/"tags":\s*\[([^\]]*)\]/);
  if (!tagsMatch) { missed++; continue; }
  const inner = tagsMatch[1];
  const present = inner.split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (present.some(t => TOP.includes(t))) { skipped++; continue; }

  const want = ORIGINS[id];
  if (present.includes(want)) { skipped++; continue; }

  // Insert immediately after the last existing season/weather tag if present,
  // else at the start of the array. Simplest: append before closing bracket
  // with a leading comma if non-empty.
  const newInner = inner.trim().length
    ? `${inner.trimEnd()},"${want}"`
    : `"${want}"`;
  lines[i] = line.replace(/"tags":\s*\[[^\]]*\]/, `"tags": [${newInner}]`);
  touched++;
}

fs.writeFileSync(FILE, lines.join("\n"), "utf8");
console.log(`tagged ${touched} ingredients, skipped ${skipped} (already top-biome), missed ${missed} (no tags array on line)`);
