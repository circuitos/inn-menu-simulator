// scripts/lib/checks.js
// Shared structural-check helpers used by both smoke.js and smoke-deep.js.
"use strict";

const VALID_BIOME_TOKENS = new Set([
  "coastal", "heartland", "highland", "arid", "frostlands",
  "any",
  "forest", "river", "lake", "subterranean", "plains"
]);

// True if some (template, prep) pair could pull this ingredient on role + affinity
// alone. Independent of the procedural-pool's `peculiar` filter; that's a
// curatorial decision, not a reachability fact.
function ingredientReachable(ing, templates, preparations) {
  const roles = ing.roles || [];
  const affs = ing.affinities || [];
  const prepById = new Map(preparations.map(p => [p.id, p]));
  for (const tpl of templates) {
    for (const slot of tpl.slots) {
      if (!roles.includes(slot.role)) continue;
      for (const prepId of tpl.prep_pool) {
        const p = prepById.get(prepId);
        if (!p) continue;
        if (p.accepts.some(a => affs.includes(a))) return true;
      }
    }
  }
  return false;
}

// Authored dishes whose `biomes` field contains tokens that aren't real
// world biomes, sub-biome tags, or "any".
function dishesWithBadBiomes(dishes) {
  return dishes.filter(d =>
    (d.biomes || []).some(b => !VALID_BIOME_TOKENS.has(b))
  );
}

// Authored mains that don't declare `contains` and don't carry a `_comment`
// noting the meatless intent. The cap system silently treats them as meatless;
// this assertion forces the choice to be deliberate.
function mainsMissingContains(dishes) {
  return dishes.filter(d =>
    d.section === "main" && d.contains === undefined && !d._comment
  );
}

// High-precision flesh/meat word list (land animals, birds, offal, marine
// mammals, animal fat). Deliberately excludes ambiguous terms that recur
// figuratively in flavor copy: "blood" ("heats the blood"), "game", "tongue".
// Blood sausage and the like are still caught via "sausage".
const FLESH_WORDS = /\b(beef|veal|pork|bacon|ham|sausage|mutton|lamb|venison|reindeer|boar|goose|duck|quail|partridge|pheasant|grouse|hare|rabbit|chicken|fowl|liver|kidney|tripe|offal|marrow|oxtail|trotter|suet|lard|tallow|blubber|whale|seal|pemmican)\b/i;

// Non-main dishes that name a flesh ingredient but don't declare `contains`.
// The Religious Fast filter keys off `contains`, so an untagged meat appetizer,
// side, drink, or dessert is served on a declared no-meat night. Mains are
// covered separately by mainsMissingContains. Dishes flagged meatless or mock
// in their `_comment` are exempt (e.g. a mock "fish" paste that is vegetarian).
function nonMainMeatMissingContains(dishes) {
  return dishes.filter(d => {
    if (!d.section || d.section === "main") return false;
    if (d.contains) return false;
    const note = (d._comment || "").toLowerCase();
    if (note.includes("meatless") || note.includes("mock")) return false;
    return FLESH_WORDS.test(d.name || "") || FLESH_WORDS.test(d.flavor || "");
  });
}

// Ingredients that no template + prep combination could ever pull, ignoring
// the `peculiar` curatorial filter. If a non-peculiar ingredient lands here,
// it's truly orphaned in the procedural pool.
function unreachableNonUnusualIngredients(ingredients, templates, preparations) {
  return ingredients.filter(i => {
    if ((i.tags || []).includes("peculiar")) return false;
    return !ingredientReachable(i, templates, preparations);
  });
}

module.exports = {
  VALID_BIOME_TOKENS,
  ingredientReachable,
  dishesWithBadBiomes,
  mainsMissingContains,
  nonMainMeatMissingContains,
  unreachableNonUnusualIngredients,
};
