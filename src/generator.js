// generator.js
// Menu generator. Given world state and seed, returns a deterministic menu.
// Mixes authored dishes and procedural assemblies per slot, ratio controlled by TUNING.

// ---------- tuning ----------
// Edit these to bias generation behavior. See "Tuning knobs" in docs/DESIGN.md
// for the full reference; the inline notes here are reminders only.
const TUNING = {
  // Authored-vs-procedural mix per slot.
  authored_ratio: 0.65,

  // Event weighting.
  event_weight_mult: 1.0,
  authored_event_tag_boost: 1.7,
  ingredient_event_tag_boost: 1.8,
  ingredient_event_role_boost: 1.6,

  // Specificity bonus: each extra biome or season listed on an authored dish
  // trims weight by (1 - specificity_step). A dish with one biome and one
  // season keeps its full weight; a `["any"]` + `["all-seasons"]` dish takes
  // the steepest hit. Replaces the old hard-coded "any+all-seasons → 0.7"
  // rule. Lower values make the engine prefer focused dishes more strongly.
  specificity_step: 0.88,

  // Per-menu novelty: each authored tag already represented on the in-progress
  // menu dampens further candidates carrying the same tag by this factor (per
  // overlap). Reads as "the kitchen varies its offerings"; no per-dish flag
  // required.
  novelty_step: 0.92,

  // Ingredient repetition: each prior pick of the same ingredient in the
  // current menu dampens the next pick by this factor. Stops one herb or root
  // from showing up in three dishes back-to-back.
  ingredient_repeat_step: 0.5,

  // Peculiar items (rat, lichen, megaceront, etc.). The procedural pool no
  // longer hard-filters them; instead the engine keeps them rare via weight.
  // Pity: the first peculiar candidate per menu gets a boost so peculiar
  // content surfaces somewhere; subsequent ones revert to base. Hardship
  // (war/plague/siege/isolation/famine) raises base — desperate kitchens reach
  // for what's nearby and weird. Authored and procedural use separate base
  // weights because authored dishes are pre-curated (a higher floor makes
  // sense) while procedural peculiar should stay quite rare.
  peculiar_authored_base: 0.75,
  peculiar_ingredient_base: 0.1,
  peculiar_hardship_mult: 2,
  peculiar_pity_mult: 2,

  // Tier boosts on procedural ingredients. Lower-tier inns lean peasant; high
  // tiers lean refined. peasant_low_tier_boost was 2.0; relaxed to 1.5 so
  // roadside menus draw from a wider eligible pool.
  peasant_low_tier_boost: 1.5,
  refined_low_tier_dampener: 0.5,
  peasant_high_tier_dampener: 0.7
};

// ---------- condition-based menu caps ----------
// Roadside and Common inns get tightened up by world conditions: a poorer world
// produces a smaller menu, with little or no meat/fish unless a special event
// justifies abundance. See docs/DESIGN.md and the plan in /root/.claude/plans/.
//
// Plentiful events bypass the caps entirely (the cook splurges).
const PLENTIFUL_EVENTS = new Set([
  "harvest-festival", "market-day", "noble-visit",
  "hunting-return", "fishing-good"
]);

// Extreme scarcity is counted independently from `economy === "famine"`. Each
// condition met removes 1 from every numeric cap. War is intentionally NOT
// listed — it disrupts trade but doesn't necessarily empty the larder.
const EXTREME_SCARCITY_CONDITIONS = new Set(["plague", "isolation", "siege"]);

// Hardship conditions that bias dish weighting toward peasant/common fare.
// Compared case-insensitively against `condition.label`.
const HARDSHIP_CONDITION_LABELS = new Set(["war", "plague", "siege", "isolation"]);

// Per-tier base caps. Roadside uses a single combined meat-or-fish cap;
// the others split meat and fish. Fine and Noble are sized so their default
// (0 scarcity) behavior matches the existing count_max for each section —
// the caps only bite once scarcity reductions kick in.
const TIER_CAPS = {
  roadside: { appetizer: 2, main_meatfish: 1, main_meatless: 2, drink: 2 },
  common:   { appetizer: 3, main_meat: 1, main_fish: 1, main_meatless: 2, drink: 3 },
  fine:     { appetizer: 4, main_meat: 2, main_fish: 2, main_meatless: 2, drink: 4 },
  noble:    { appetizer: 4, main_meat: 2, main_fish: 2, main_meatless: 2, drink: 5 }
};

// Under severe scarcity (>= 2 extreme hits) the kitchen's allowed palette is
// rewritten: gilded tags drop out, and plain-fare tags are added in so the
// cellar/larder's basic stock can carry the menu. A noble inn under siege
// shouldn't be locked into refined-only ingredients.
const TAGS_STRIPPED_AT_SEVERE_SCARCITY = new Set(["noble", "exotic"]);
const TAGS_ADDED_AT_SEVERE_SCARCITY = new Set(["peasant", "common"]);

// Cultural-tier tags that gate dishes/ingredients via inn_tier.allowed_tags.
// `exotic` is intentionally NOT here — it's a distance modifier, not a tier
// gate (see resolveImportDistance). Noble inns still list `exotic` in their
// allowed_tags as a coarse signal, but actual gating is via distance.
const TIER_TAGS = ["peasant", "common", "refined", "noble"];

// Effective import distance contributed by the `exotic` tag — items off the
// world map (saffron, sugar, true rare spices) act as if they came from two
// regions away, regardless of their nominal biome. Stacks with biome distance
// via max(): a heartland-native noble dish tagged `exotic` is still distance 2.
const EXOTIC_DISTANCE = 2;

// Protein-role buckets used to classify procedurally-built mains.
const MEAT_ROLES = new Set(["fowl", "ruminant", "game", "offal"]);
const FISH_ROLES = new Set(["fish", "shellfish"]);
// Ingredients whose only role is "protein" but which are unambiguously meat.
const PLAIN_MEAT_IDS = new Set(["pork", "bacon", "sausage"]);

function ingredientMainKind(ing) {
  if (!ing) return null;
  const roles = ing.roles || [];
  if (roles.some(r => FISH_ROLES.has(r))) return "fish";
  if (roles.some(r => MEAT_ROLES.has(r))) return "meat";
  if (PLAIN_MEAT_IDS.has(ing.id)) return "meat";
  return null; // egg, skyr, plant proteins → meatless
}

// classifyMain: "meat" | "fish" | "meatless". Authored mains carry an explicit
// `contains` field; procedural dishes have `_mainKind` stamped at build time.
function classifyMain(dish) {
  if (!dish) return "meatless";
  if (dish.contains === "meat") return "meat";
  if (dish.contains === "fish") return "fish";
  if (dish._mainKind === "meat") return "meat";
  if (dish._mainKind === "fish") return "fish";
  return "meatless";
}

// Compute caps for the given world. Returns null when caps should not apply
// (plentiful event, or tier without caps). Cap values are post-scarcity and
// post-floor; the caller can spend them directly.
function computeCaps(world) {
  if (PLENTIFUL_EVENTS.has(world.event)) return null;
  const base = TIER_CAPS[world.inn_tier];
  if (!base) return null;

  let scarcity = 0;
  if (world.economy === "famine") scarcity++;
  if (EXTREME_SCARCITY_CONDITIONS.has(world.condition)) scarcity++;

  const sub = (n) => Math.max(0, n - scarcity);

  // Floor appetizer and drink at 1 (every section must render at least 1 dish).
  const caps = {
    appetizer: Math.max(1, sub(base.appetizer)),
    drink:     Math.max(1, sub(base.drink)),
    main: {},
    scarcityHits: scarcity
  };

  if ("main_meatfish" in base) {
    caps.main.meatfish = sub(base.main_meatfish);
    caps.main.meatless = sub(base.main_meatless);
  } else {
    caps.main.meat = sub(base.main_meat);
    caps.main.fish = sub(base.main_fish);
    caps.main.meatless = sub(base.main_meatless);
  }

  // Mains floor: if total of all main caps is 0, force meatless ≥ 1.
  const mainTotal = Object.values(caps.main).reduce((a, b) => a + b, 0);
  if (mainTotal === 0) caps.main.meatless = 1;

  return caps;
}

// True if `kind` (meat|fish|meatless) still has room under `caps.main`.
function mainCapHasRoom(caps, kind, used) {
  const m = caps.main;
  if ("meatfish" in m) {
    if (kind === "meat" || kind === "fish") {
      return used.meatfish < m.meatfish;
    }
    return used.meatless < m.meatless;
  }
  if (kind === "meat") return used.meat < m.meat;
  if (kind === "fish") return used.fish < m.fish;
  return used.meatless < m.meatless;
}

function bumpMainCounter(caps, kind, used) {
  const m = caps.main;
  if ("meatfish" in m) {
    if (kind === "meat" || kind === "fish") used.meatfish++;
    else used.meatless++;
  } else {
    if (kind === "meat") used.meat++;
    else if (kind === "fish") used.fish++;
    else used.meatless++;
  }
}

function mainTotalTarget(caps) {
  return Object.values(caps.main).reduce((a, b) => a + b, 0);
}

function makeMainUsed(caps) {
  return "meatfish" in caps.main
    ? { meatfish: 0, meatless: 0 }
    : { meat: 0, fish: 0, meatless: 0 };
}

// ---------- seeded RNG ----------
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeRng(seedStr) {
  let a = hashSeed(String(seedStr));
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr.length ? arr[Math.floor(rng() * arr.length)] : null; }
function weightedPick(rng, items, weightFn) {
  if (!items.length) return null;
  const weights = items.map(weightFn);
  const total = weights.reduce((a,b) => a+b, 0);
  if (total <= 0) return pick(rng, items);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

// ---------- price ----------
function formatPrice(copper) {
  copper = Math.max(1, Math.round(copper));
  const gp = Math.floor(copper / 100);
  const rem = copper - gp * 100;
  const sp = Math.floor(rem / 10);
  const cp = rem - sp * 10;
  const parts = [];
  if (gp) parts.push(`${gp} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (cp) parts.push(`${cp} cp`);
  return parts.length ? parts.join(" ") : "1 cp";
}
const COST_BASE = { 1: 2, 2: 6, 3: 18, 4: 55, 5: 180 };

// ---------- world-context helpers ----------
const TIER_INDEX = { roadside: 1, common: 2, fine: 3, noble: 4 };

function resolveWorld(world, data) {
  return {
    biome: world.biome,
    season: world.season,
    weather: data.modifiers.weather[world.weather] || data.modifiers.weather.clear,
    tier: data.modifiers.inn_tiers[world.inn_tier],
    tierIdx: TIER_INDEX[world.inn_tier],
    economy: data.modifiers.economy[world.economy],
    condition: data.modifiers.conditions[world.condition],
    event: data.events.events.find(e => e.id === world.event) || data.events.events[0],
    biomeRelations: (data.modifiers || {}).biome_relations || {}
  };
}

// Top-level biomes used to identify which ingredient tags are biome-of-origin
// signals (vs. sub-biome / season / cultural tags).
const TOP_BIOMES = ["coastal", "heartland", "highland", "arid", "frostlands"];
// Sub-biome tags that act as biases inside a top biome (forest in heartland,
// river in coastal, etc.) rather than gates of their own.
const SUB_BIOMES = ["forest", "river", "lake", "subterranean", "plains"];
const ALL_BIOME_TAGS = [...TOP_BIOMES, ...SUB_BIOMES];

// ---------- biome-distance helpers ----------
// Returns 0 (native), 1 (regional), 2 (distant), or null (no relation table /
// unrecognized biome — caller should treat as "off the map" / not importable).
function biomeDistance(fromBiome, toBiome, relations) {
  if (fromBiome === toBiome) return 0;
  const rel = relations && relations[fromBiome];
  if (!rel) return null;
  if ((rel.regional || []).includes(toBiome)) return 1;
  if ((rel.distant || []).includes(toBiome)) return 2;
  return null;
}

// Min biome-distance from any biome in `biomes` to `target`. Returns null if
// no biome in the list resolves against the relation table.
function closestBiomeDistance(biomes, target, relations) {
  let best = null;
  for (const b of biomes) {
    const d = biomeDistance(b, target, relations);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

// Effective import-distance ceiling for a world: the lower of (tier ceiling,
// condition ceiling), with the tier ceiling lifted by any event floor. Used
// by both authored and procedural filters.
function effectiveImportMax(w) {
  const eventFloor = w.event.import_distance_floor ?? 0;
  const tierMax = Math.max(w.tier.max_import_distance ?? 2, eventFloor);
  return Math.min(tierMax, w.condition.max_import_distance ?? 2);
}

// Resolves a dish's effective import distance for the world's biome.
// - "any"-biome dishes are native (0) everywhere.
// - Multi-biome dishes use the closest biome (min distance).
// - The `exotic` tag bumps effective distance to at least EXOTIC_DISTANCE,
//   modeling off-map trade goods that always count as far-traded.
// - Returns null if the dish has no biome match in the relation table
//   (filter caller treats null as "exclude").
function resolveImportDistance(dish, w, data) {
  const relations = (data.modifiers || {}).biome_relations || {};
  const biomes = dish.biomes || [];
  const isExotic = (dish.tags || []).includes("exotic");
  let dist = biomes.includes("any") ? 0 : closestBiomeDistance(biomes, w.biome, relations);
  if (dist === null) return null;
  if (isExotic && dist < EXOTIC_DISTANCE) dist = EXOTIC_DISTANCE;
  return dist;
}

// ---------- authored dish filter ----------
function filterAuthored(dishes, w, data) {
  const relations = (data.modifiers || {}).biome_relations || {};
  return dishes.filter(d => {
    // Distance gate: combines biome-relation distance with the `exotic` modifier.
    // Events can lift the tier ceiling (e.g. Merchant Caravan brings regional
    // goods to a common inn that normally allows none). Condition still caps —
    // siege/plague block trade regardless of caravans.
    const dist = resolveImportDistance(d, w, data);
    if (dist === null) return false;
    if (dist > effectiveImportMax(w)) return false;
    // Biome-only distance for pricing/labeling — exotic native items shouldn't
    // pay transport markup, so we keep this separate from the filtering distance.
    d._importDistance = d.biomes.includes("any")
      ? 0
      : (closestBiomeDistance(d.biomes || [], w.biome, relations) ?? 0);

    // Season
    if (!d.seasons.includes("all-seasons") && !d.seasons.includes(w.season)) return false;

    // Tier
    if (d.tier_min && w.tierIdx < d.tier_min) return false;
    if (d.tier_max && w.tierIdx > d.tier_max) return false;

    // Cultural tags must overlap with inn's allowed tags (if dish has any tier-relevant tags)
    const culturalDishTags = (d.tags || []).filter(t => TIER_TAGS.includes(t));
    if (culturalDishTags.length && !culturalDishTags.some(t => w.tier.allowed_tags.includes(t))) return false;

    // Economy: cost ceiling shrinks under shortage/famine
    if (d.cost > w.economy.remove_above_cost) return false;

    // "peculiar" dishes appear only rarely — handled via weighting, not filtering. Under
    // war/plague/siege/isolation, peculiar stays allowed because those are local poor-food
    // dishes mostly.

    return true;
  });
}

// Specificity factor: dishes with broad biome/season lists implicitly compete
// against more worlds, which lets a few generalist dishes dominate every
// menu. Each "extra" biome or season trims weight by (1 - specificity_step).
// `["any"]` is treated as 5 biomes and `["all-seasons"]` as 4 seasons, so the
// most permissive entries take the largest hit.
function specificityFactor(d) {
  const biomes = d.biomes || [];
  const seasons = d.seasons || [];
  const biomeBreadth = biomes.includes("any") ? 5 : Math.max(1, biomes.length);
  const seasonBreadth = seasons.includes("all-seasons") ? 4 : Math.max(1, seasons.length);
  const extras = (biomeBreadth - 1) + (seasonBreadth - 1);
  return Math.pow(TUNING.specificity_step, extras);
}

// Novelty dampener: each tag the candidate carries that has already shown up
// in the in-progress menu trims weight by (1 - novelty_step) per occurrence.
// Reads as "the kitchen varies its offerings" without naming any specific dish.
function noveltyFactor(d, menuState) {
  if (!menuState) return 1;
  let overlap = 0;
  for (const t of (d.tags || [])) overlap += menuState.authoredFamiliarity.get(t) || 0;
  return Math.pow(TUNING.novelty_step, overlap);
}

// Peculiar weighting. Same shape for authored and procedural paths, just a
// different base. Hardship conditions raise weight — desperate kitchens reach
// for the local-weird. The first peculiar candidate per menu gets a pity
// boost so the tag actually surfaces somewhere; once met, subsequent peculiar
// items revert to base.
function peculiarFactor(base, w, menuState) {
  let mult = base;
  const hardship = HARDSHIP_CONDITION_LABELS.has((w.condition.label || "").toLowerCase())
    || (w.economy.label || "").toLowerCase() === "famine";
  if (hardship) mult *= TUNING.peculiar_hardship_mult;
  if (menuState && !menuState.hasPeculiar) mult *= TUNING.peculiar_pity_mult;
  return mult;
}

function weightAuthored(d, w, menuState) {
  let weight = 1;
  // Native biome gets a big boost
  if (d.biomes.includes(w.biome)) weight *= 3.0;
  // "Any" biome dishes are neutral
  else if (d.biomes.includes("any")) weight *= 1.2;
  // Imports get progressively rarer with distance.
  if (d._importDistance === 1) weight *= 0.4;
  else if (d._importDistance >= 2) weight *= 0.2;

  // Events that focus on imports (e.g. Merchant Caravan) reverse the dampening:
  // imported authored dishes get a multiplicative boost so they actually appear
  // even at common tier where the tier-cap was just barely lifted to allow them.
  const importBoost = w.event.import_weight_boost;
  if (importBoost && (d._importDistance || 0) >= 1) weight *= importBoost;

  // Seasonal match boost
  if (d.seasons.includes(w.season)) weight *= 1.8;

  // Event boosts: match boost_tags against the dish's tags or biomes (some events
  // key off biome-style values like "coastal"/"forest"), and treat fish/shellfish/game
  // boost_roles as proxies for the authored `contains` classifier. "protein" is
  // intentionally not mapped — it's too broad to be a useful focus signal.
  const eventBoost = 1 + (TUNING.authored_event_tag_boost - 1) * TUNING.event_weight_mult;
  for (const t of w.event.boost_tags || []) {
    if ((d.tags || []).includes(t) || (d.biomes || []).includes(t)) weight *= eventBoost;
  }
  const ROLE_TO_CONTAINS = { fish: "fish", shellfish: "fish", game: "meat" };
  for (const r of w.event.boost_roles || []) {
    const contains = ROLE_TO_CONTAINS[r];
    if (contains && d.contains === contains) weight *= eventBoost;
  }

  // Condition tone: under war/plague/siege/isolation, favor peasant/common fare.
  if (HARDSHIP_CONDITION_LABELS.has((w.condition.label || "").toLowerCase())) {
    if ((d.tags || []).includes("peasant")) weight *= 1.5;
    if ((d.tags || []).includes("noble")) weight *= 0.3;
  }

  // Peculiar dishes ride the shared peculiar curve (hardship-aware, pity-aware).
  if ((d.tags || []).includes("peculiar")) {
    weight *= peculiarFactor(TUNING.peculiar_authored_base, w, menuState);
  }
  // "exotic" dishes are rare by definition — extra dampening on top of distance.
  if ((d.tags || []).includes("exotic")) weight *= 0.75;

  // Specificity: replaces the old hard-coded any+all-seasons rule with a
  // continuous gradient over biome and season breadth.
  weight *= specificityFactor(d);

  // Per-menu novelty: dampen tags already represented in this menu.
  weight *= noveltyFactor(d, menuState);

  // Roadside inns shouldn't lean noble even if allowed
  if (w.tierIdx <= 2 && (d.tags || []).includes("noble")) weight *= 0.4;
  // Noble inns shouldn't lean peasant
  if (w.tierIdx >= 4 && (d.tags || []).includes("peasant")) weight *= 0.4;

  return weight;
}

// Per-distance price multiplier. Native = 1.0, regional adds ~30%, distant adds ~70%.
// Exotic native dishes (effective filter distance bumped by EXOTIC_DISTANCE) keep
// their biomeDist-based price — the rare ingredient is already priced into the
// dish's `cost`, no transport markup applies on top.
const IMPORT_PRICE_MULT = { 0: 1.0, 1: 1.3, 2: 1.7 };

function priceAuthoredDish(d, w) {
  const base = COST_BASE[d.cost] || 6;
  const importMult = IMPORT_PRICE_MULT[d._importDistance] ?? 1.0;
  const price = base * w.tier.price_mult * w.economy.price_mult * w.condition.price_mult * (w.event.price_mult || 1) * importMult;
  return Math.max(1, Math.round(price));
}

function importLabel(distance) {
  if (distance === 1) return " (imported)";
  if (distance >= 2) return " (rare import)";
  return "";
}

// ---------- procedural fallback (unchanged in spirit from v1) ----------
function filterIngredientPool(ingredients, w, data) {
  const SEASONS = ["spring","summer","autumn","winter"];
  // Procedural ingredients gate on the same cultural-tier tags. `exotic` is
  // now a distance modifier, but in the procedural pipeline we don't have a
  // single "native biome" for an ingredient — most spices have no biome at
  // all. We fall back to the inn-tier allowed_tags check: only noble inns
  // list `exotic`, so exotic ingredients still surface only at noble tier.
  const ING_TIER_TAGS = ["peasant","common","refined","noble","exotic"];

  // Effective import-distance ceiling for this world: same min(tier, condition)
  // rule the authored path uses. Ingredients native to a non-matching biome can
  // pass the gate iff their nearest top-biome is within this distance; the
  // headline-ingredient logic in fillTemplate then labels the dish accordingly.
  const importMax = effectiveImportMax(w);
  const relations = (data && data.modifiers && data.modifiers.biome_relations) || {};

  return ingredients.filter(ing => {
    const tags = ing.tags || [];

    // Biome: native match passes outright. Otherwise, if at least one top-biome
    // tag is within the world's import distance, the ingredient passes as an
    // import. Sub-biome tags (forest, river, etc.) are biases, not gates, and
    // pass through ambiently.
    const biomeTags = tags.filter(t => ALL_BIOME_TAGS.includes(t));
    if (biomeTags.length) {
      const topBiomeTags = biomeTags.filter(t => TOP_BIOMES.includes(t));
      const subBiomeTags = biomeTags.filter(t => !TOP_BIOMES.includes(t));
      const nativeMatch = biomeTags.includes(w.biome);
      if (!nativeMatch) {
        if (topBiomeTags.length) {
          const closest = closestBiomeDistance(topBiomeTags, w.biome, relations);
          if (closest === null || closest > importMax) return false;
        } else if (!subBiomeTags.length) {
          return false;
        }
        // else: only sub-biome tags — ambient, keep.
      }
    }

    // Season
    const seasonTags = tags.filter(t => SEASONS.includes(t));
    const allSeason = tags.includes("all-seasons");
    if (seasonTags.length && !seasonTags.includes(w.season) && !allSeason) return false;

    // Tier ceiling (no floor — cheap ingredients are fine anywhere as supporting roles)
    if (ing.cost > w.tier.cost_max) return false;

    // Cultural tag gate
    const cultural = tags.filter(t => ING_TIER_TAGS.includes(t));
    if (cultural.length && !cultural.some(t => w.tier.allowed_tags.includes(t))) return false;

    // Weather sensitivity: each weather declares which tags it removes from the
    // pool. Snow knocks out crop-sensitives; heatwave adds heat-sensitive on top
    // (fresh dairy, fresh organ meats). Rain doesn't drop anything outright.
    const dropTags = w.weather.drops_tags || [];
    if (dropTags.length && tags.some(t => dropTags.includes(t))) return false;

    // Economy cap
    if (ing.cost > w.economy.remove_above_cost) return false;

    // Condition import gate: under restrictive conditions (war, plague, etc.)
    // exotic ingredients (off-map trade goods) drop out. The `exotic` tag
    // models effective import distance >= 2, so any condition with
    // max_import_distance < 2 excludes them.
    const condMaxDist = w.condition.max_import_distance ?? 2;
    if (tags.includes("exotic") && condMaxDist < 2) return false;

    // Famine protein restriction
    if (w.economy.restrict_role && (ing.roles || []).includes(w.economy.restrict_role) && ing.cost > 2) return false;

    // Peculiar ingredients are no longer hard-filtered. They pass through with
    // a heavy weight dampener (see weightIngredient → peculiarFactor) so they
    // surface rarely under normal conditions and more readily under hardship.

    return true;
  });
}

function weightIngredient(ing, w, menuState) {
  let weight = 1;
  const tags = ing.tags || [];
  const roles = ing.roles || [];
  if (tags.includes(w.season)) weight *= 1.8;
  if (tags.includes(w.biome)) weight *= 1.6;
  // Mirror the authored regional/distant penalty so the procedural pool doesn't
  // silently drown native ingredients in foreign-biome competitors. Without
  // this, foreign-biome staples collectively outweigh the single native biome
  // and `headlineIngredient` then stamps the dish as "(imported)".
  const ingTopBiomes = tags.filter(t => TOP_BIOMES.includes(t));
  if (ingTopBiomes.length && !ingTopBiomes.includes(w.biome)) {
    const best = closestBiomeDistance(ingTopBiomes, w.biome, w.biomeRelations || {});
    if (best === 1) weight *= 0.4;
    else if (best !== null && best >= 2) weight *= 0.2;
  }
  // Tier-aware commonness: at low-tier inns, peasant fare wins over equally-
  // allowed but less-rustic alternatives; at fine/noble, refined leans up.
  if (w.tierIdx <= 2) {
    if (tags.includes("peasant")) weight *= TUNING.peasant_low_tier_boost;
    if (tags.includes("refined") && !tags.includes("common")) weight *= TUNING.refined_low_tier_dampener;
  }
  if (w.tierIdx >= 3 && tags.includes("peasant") && !tags.includes("common")) {
    weight *= TUNING.peasant_high_tier_dampener;
  }
  const tagBoost = 1 + (TUNING.ingredient_event_tag_boost - 1) * TUNING.event_weight_mult;
  const roleBoost = 1 + (TUNING.ingredient_event_role_boost - 1) * TUNING.event_weight_mult;
  for (const t of w.event.boost_tags || []) if (tags.includes(t)) weight *= tagBoost;
  for (const r of w.event.boost_roles || []) if (roles.includes(r)) weight *= roleBoost;
  // Weather tilts: robust_mult boosts shelf-stable ingredients, sensitive_mult
  // softly dampens fresh ones (when not already hard-filtered above). Both
  // default to 1.0 so weathers without these fields stay neutral.
  const robustMult = w.weather.robust_mult ?? 1.0;
  if (tags.includes("weather-robust")) weight *= robustMult;
  const sensitiveMult = w.weather.sensitive_mult ?? 1.0;
  const dropTags = w.weather.drops_tags || [];
  if (sensitiveMult !== 1.0 && tags.includes("weather-sensitive") && !dropTags.includes("weather-sensitive")) {
    weight *= sensitiveMult;
  }

  // Peculiar ingredients: heavy dampener by default, pity boost if the menu
  // hasn't surfaced a peculiar item yet, hardship boost under siege/famine/etc.
  if (tags.includes("peculiar")) {
    weight *= peculiarFactor(TUNING.peculiar_ingredient_base, w, menuState);
  }

  // Per-menu repeat dampener: each prior pick of this ingredient in the same
  // menu shrinks the weight by `ingredient_repeat_step`. Stops one herb or
  // root from headlining four dishes back-to-back.
  if (menuState) {
    const prior = menuState.ingredientUsage.get(ing.id) || 0;
    if (prior > 0) weight *= Math.pow(TUNING.ingredient_repeat_step, prior);
  }

  return weight;
}

// The "headline" ingredient is the one the dish is named after — protein for
// mains, otherwise the first non-optional filled slot. Used to decide whether
// a procedural dish should carry an import label: a stew of native veg with a
// regional fish in it is a regional import; a native dish that merely contains
// an exotic spice is not.
function headlineIngredient(template, picked) {
  if (template.section === "main") {
    const protein = template.slots.find(s => s.role === "protein");
    if (protein && picked[protein.name_key]) return picked[protein.name_key];
  }
  for (const slot of template.slots) {
    if (slot.optional) continue;
    if (picked[slot.name_key]) return picked[slot.name_key];
  }
  return null;
}

// Effective import distance for a single ingredient against the world biome.
// Mirrors resolveImportDistance but operates on one ingredient: `exotic` forces
// EXOTIC_DISTANCE, otherwise we take the min distance across the ingredient's
// top-biome tags. Ingredients with no biome tag are treated as ambient/native.
function ingredientImportDistance(ing, w, data) {
  if (!ing) return 0;
  const tags = ing.tags || [];
  let dist = tags.includes("exotic") ? EXOTIC_DISTANCE : 0;
  const biomeTags = tags.filter(t => TOP_BIOMES.includes(t));
  if (biomeTags.length) {
    const best = closestBiomeDistance(biomeTags, w.biome, (data.modifiers || {}).biome_relations || {});
    if (best !== null && best > dist) dist = best;
  }
  return dist;
}

// Per-menu state used by the novelty / repeat / peculiar-pity dampeners. One
// instance lives for the whole generateMenuInternal call and is passed into
// every weighting decision so picks influence subsequent weights.
function makeMenuState() {
  return {
    authoredFamiliarity: new Map(),  // tag -> count, across already-committed authored dishes
    ingredientUsage: new Map(),       // ingredient id -> count, across already-filled procedural slots
    hasPeculiar: false                // flips once any peculiar item lands; turns off the pity boost
  };
}

function commitAuthoredToMenu(menuState, dish) {
  if (!menuState) return;
  for (const t of (dish.tags || [])) {
    menuState.authoredFamiliarity.set(t, (menuState.authoredFamiliarity.get(t) || 0) + 1);
  }
  if ((dish.tags || []).includes("peculiar")) menuState.hasPeculiar = true;
}

function commitIngredientToMenu(menuState, ing) {
  if (!menuState) return;
  menuState.ingredientUsage.set(ing.id, (menuState.ingredientUsage.get(ing.id) || 0) + 1);
  if ((ing.tags || []).includes("peculiar")) menuState.hasPeculiar = true;
}

function fillTemplate(template, prep, pool, rng, w, data, trace, menuState) {
  if (template.tier_min && w.tierIdx < template.tier_min) return null;
  if (template.tier_max && w.tierIdx > template.tier_max) return null;

  const picked = {};
  const usedIds = new Set();

  for (const slot of template.slots) {
    const candidates = pool.filter(ing => {
      if (usedIds.has(ing.id)) return false;
      if (!(ing.roles || []).includes(slot.role)) return false;
      const affs = ing.affinities || [];
      if (!prep.accepts.some(a => affs.includes(a))) return false;
      return true;
    });
    if (!candidates.length) {
      if (slot.optional) { picked[slot.name_key] = null; continue; }
      return null;
    }
    const chosen = weightedPick(rng, candidates, ing => weightIngredient(ing, w, menuState));
    picked[slot.name_key] = chosen;
    usedIds.add(chosen.id);
  }

  let nameTpl = template.name_template;
  for (const key of Object.keys(picked)) {
    const withKey = `name_template_with_${key}`;
    if (template[withKey] && picked[key]) nameTpl = template[withKey];
  }

  const parts = { prep: prep.verb };
  for (const [k, v] of Object.entries(picked)) parts[k] = v ? v.name : "";
  const name = nameTpl.replace(/\{(\w+)\}/g, (_, k) => parts[k] || "").replace(/\s+/g, " ").trim();

  const ingredientsUsed = Object.values(picked).filter(Boolean);
  const baseCopper = ingredientsUsed.reduce((sum, ing) => sum + (COST_BASE[ing.cost] || 2), 0);
  const labor = prep.labor_add || 0;
  const headline = headlineIngredient(template, picked);
  const importDistance = ingredientImportDistance(headline, w, data);
  const importMult = IMPORT_PRICE_MULT[importDistance] ?? 1.0;
  const priceCp = (baseCopper + labor) * prep.cost_mult * w.tier.price_mult * w.economy.price_mult * w.condition.price_mult * (w.event.price_mult || 1) * importMult;

  // Stamp meat/fish/meatless on mains so the cap loop can classify procedural dishes.
  let mainKind = null;
  if (template.section === "main") {
    const proteinSlot = template.slots.find(s => s.role === "protein");
    const proteinIng = proteinSlot ? picked[proteinSlot.name_key] : null;
    mainKind = ingredientMainKind(proteinIng) || "meatless";
  }

  if (trace) {
    // Drinks route through templates with prep "raw", but a drink isn't really
    // "prepared" — counting it would swamp the prep histogram. Skip the prep
    // log for drink templates; ingredients still get traced.
    if (template.section !== "drink") trace.preparations.push(prep.id);
    for (const ing of ingredientsUsed) trace.ingredients.push(ing.id);
  }

  for (const ing of ingredientsUsed) commitIngredientToMenu(menuState, ing);

  return {
    source: "procedural",
    section: template.section,
    name: capitalize(name) + importLabel(importDistance),
    price_cp: Math.max(1, Math.round(priceCp)),
    price_text: formatPrice(priceCp),
    importDistance,
    _mainKind: mainKind
  };
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Pick a single procedural dish for the given section, avoiding already-used templates and
// existing dish names. Returns null if nothing valid can be built.
function pickProceduralDish(section, usedTpl, existingNames, pool, rng, w, data, trace, menuState) {
  const templates = data.dishes.templates.filter(t => t.section === section);
  if (!templates.length) return null;
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    const available = templates.filter(t => !usedTpl.has(t.id));
    const from = available.length ? available : templates;
    const tpl = pick(rng, from);
    if (!tpl) return null;
    // Weighted by weather's prep_bias (e.g. rain favors stewing/braising over
    // outdoor methods). Missing keys default to 1.0 — i.e. neutral.
    const prepBias = w.weather.prep_bias || {};
    const prepId = weightedPick(rng, tpl.prep_pool, id => prepBias[id] ?? 1);
    const prep = data.preparations.preparations.find(p => p.id === prepId);
    if (!prep) continue;
    const dish = fillTemplate(tpl, prep, pool, rng, w, data, trace, menuState);
    if (dish && !existingNames.has(dish.name)) {
      usedTpl.add(tpl.id);
      if (trace) trace.templates.push(tpl.id);
      return dish;
    }
  }
  return null;
}

// Build a menu-dish payload from an authored choice. Single source of truth so
// the three places that emit authored dishes (normal pick, import-floor swap,
// meatless-floor) stay in lockstep.
function buildAuthoredMenuDish(choice, w) {
  const price = priceAuthoredDish(choice, w);
  return {
    source: "authored",
    section: choice.section,
    name: choice.name + importLabel(choice._importDistance),
    flavor: choice.flavor,
    importDistance: choice._importDistance || 0,
    price_cp: price,
    price_text: formatPrice(price),
    contains: choice.contains,
    _authoredId: choice.id
  };
}

// Pick a single authored dish, avoiding already-used ids. Returns null if pool exhausted.
function pickAuthoredDish(sectionAuthored, usedIds, rng, w, trace, menuState) {
  const remaining = sectionAuthored.filter(d => !usedIds.has(d.id));
  if (!remaining.length) return null;
  const choice = weightedPick(rng, remaining, d => weightAuthored(d, w, menuState));
  if (!choice) return null;
  usedIds.add(choice.id);
  if (trace) trace.authored.push(choice.id);
  commitAuthoredToMenu(menuState, choice);
  return buildAuthoredMenuDish(choice, w);
}

// Drives one section's fill loop with the prefer-authored / fallback-procedural
// pattern. `accept(dish)` is an optional gate that lets the main-with-caps
// branch reject candidates whose kind is already full; if it returns true it
// can also commit side-effects (e.g. bump the cap counter). Returns
// { dishes, state } so the main floor can reuse the loop's used-id sets.
function fillSection({ sectionId, target, authoredPool, ingPool, rng, w, data, trace, safetyMax, accept, menuState }) {
  const state = { usedAuthored: new Set(), usedTpl: new Set(), names: new Set() };
  const dishes = [];
  if (target <= 0) return { dishes, state };
  const sectionAuthored = authoredPool.filter(d => d.section === sectionId);
  const cap = safetyMax ?? (target * 8 + 4);
  let safety = 0;
  while (dishes.length < target && safety < cap) {
    safety++;
    const preferAuthored = rng() < TUNING.authored_ratio;
    let dish = null;
    if (preferAuthored) {
      dish = pickAuthoredDish(sectionAuthored, state.usedAuthored, rng, w, trace, menuState);
      if (!dish) dish = pickProceduralDish(sectionId, state.usedTpl, state.names, ingPool, rng, w, data, trace, menuState);
    } else {
      dish = pickProceduralDish(sectionId, state.usedTpl, state.names, ingPool, rng, w, data, trace, menuState);
      if (!dish) dish = pickAuthoredDish(sectionAuthored, state.usedAuthored, rng, w, trace, menuState);
    }
    if (!dish) break;
    if (state.names.has(dish.name)) continue;
    if (accept && !accept(dish)) continue;
    state.names.add(dish.name);
    dishes.push(dish);
  }
  return { dishes, state };
}

// ---------- main generator ----------
function generateMenu(world, data, seed) {
  return generateMenuInternal(world, data, seed, null);
}

// Same generation pipeline, but returns { menu, trace } where trace lists the
// ids actually committed during this run (authored dish ids, ingredient ids,
// preparation ids, template ids). Used by the smoke runner; UI does not need
// this. Multiplicity is preserved — each emission appends one id.
function generateMenuTraced(world, data, seed) {
  const trace = { authored: [], ingredients: [], preparations: [], templates: [] };
  const menu = generateMenuInternal(world, data, seed, trace);
  return { menu, trace };
}

function generateMenuInternal(world, data, seed, trace) {
  const rng = makeRng(seed || String(Date.now()));
  const w = resolveWorld(world, data);
  const sections = data.modifiers.sections;
  const caps = computeCaps(world);

  // Severe-scarcity tier downgrade: with 2+ extreme scarcity hits, even a
  // noble kitchen can't put on airs. Strip the gilded tags from allowed_tags
  // and add the plain-fare tags so the menu falls back to whatever the
  // cellar still holds. Plentiful events (caps === null) bypass this on
  // the assumption that the event itself replenishes the larder.
  if (caps && caps.scarcityHits >= 2) {
    const tags = new Set(w.tier.allowed_tags);
    for (const t of TAGS_STRIPPED_AT_SEVERE_SCARCITY) tags.delete(t);
    for (const t of TAGS_ADDED_AT_SEVERE_SCARCITY) tags.add(t);
    w.tier = { ...w.tier, allowed_tags: Array.from(tags) };
  }

  // Clone authored list so we can mark _importDistance without polluting source data
  const authoredCopy = data.authored_dishes.dishes.map(d => ({ ...d }));
  const authoredPool = filterAuthored(authoredCopy, w, data);

  // Procedural ingredient pool (for fallback)
  const ingPool = filterIngredientPool(data.ingredients.ingredients, w, data);

  const menu = {
    world,
    seed,
    biome_label: (data.modifiers.biomes[w.biome] || {}).label,
    event_note: w.event.note,
    condition_note: w.condition.note,
    sections: {}
  };

  const menuState = makeMenuState();

  for (const sectionId of Object.keys(sections)) {
    const spec = sections[sectionId];
    const rolledCount = spec.count_min + Math.floor(rng() * (spec.count_max - spec.count_min + 1));

    let dishes;
    if (sectionId === "main" && caps) {
      // Cap-enforced main loop: classify each candidate and only accept it
      // if its kind (meat/fish/meatless) still has room. Total is also
      // clamped to the section's rolled count so that generous tier caps
      // don't blow past the existing count_max for the section.
      const used = makeMainUsed(caps);
      const target = Math.min(rolledCount, mainTotalTarget(caps));
      const result = fillSection({
        sectionId: "main", target, authoredPool, ingPool, rng, w, data, trace, menuState,
        safetyMax: target * 12 + 20,
        accept: (dish) => {
          const kind = classifyMain(dish);
          if (!mainCapHasRoom(caps, kind, used)) return false;
          bumpMainCounter(caps, kind, used);
          return true;
        }
      });
      dishes = result.dishes;
      // Floor: mains must have at least 1 dish; force a meatless if the cap
      // loop produced nothing.
      if (dishes.length === 0) {
        const meatless = forceMeatlessMain(authoredPool, result.state.usedAuthored, ingPool, rng, w, data, result.state.names, trace, menuState);
        if (meatless) dishes.push(meatless);
      }
    } else {
      // Per-slot mix for drink / appetizer / dessert (and main when caps are off).
      let target = rolledCount;
      if (caps) {
        if (sectionId === "drink") target = Math.max(1, Math.min(target, caps.drink));
        else if (sectionId === "appetizer") target = Math.max(1, Math.min(target, caps.appetizer));
      }
      ({ dishes } = fillSection({ sectionId, target, authoredPool, ingPool, rng, w, data, trace, menuState }));
    }

    menu.sections[sectionId] = { label: spec.label, dishes };
  }

  // Event-driven import floor (Merchant Caravan): if generation didn't place
  // enough imports for the tier, swap non-import dishes out for unused
  // authored imports of the same section (and same meat/fish/meatless kind
  // for mains, so caps stay intact).
  enforceImportFloor(menu, world, w, authoredPool, rng, trace, menuState);

  return menu;
}

function enforceImportFloor(menu, world, w, authoredPool, rng, trace, menuState) {
  const floorByTier = w.event.import_floor_by_tier;
  if (!floorByTier) return;
  const target = floorByTier[world.inn_tier] || 0;
  if (target <= 0) return;

  const usedIds = new Set();
  let imports = 0;
  for (const sec of Object.values(menu.sections)) {
    for (const d of sec.dishes) {
      if (d._authoredId) usedIds.add(d._authoredId);
      if ((d.importDistance || 0) > 0) imports++;
    }
  }
  if (imports >= target) return;

  // Try sections in an order that minimizes disruption: dessert/appetizer/drink
  // first (no caps to juggle), mains last (need to match the slot's kind).
  const order = ["dessert", "appetizer", "drink", "main"];
  for (const secId of order) {
    if (imports >= target) break;
    const section = menu.sections[secId];
    if (!section || !section.dishes.length) continue;

    for (let i = 0; i < section.dishes.length && imports < target; i++) {
      const existing = section.dishes[i];
      if ((existing.importDistance || 0) > 0) continue;

      let candidates = authoredPool.filter(d =>
        d.section === secId
        && (d._importDistance || 0) > 0
        && !usedIds.has(d.id)
      );
      if (secId === "main") {
        const kind = classifyMain(existing);
        candidates = candidates.filter(d => classifyMain(d) === kind);
      }
      if (!candidates.length) continue;

      const choice = weightedPick(rng, candidates, d => weightAuthored(d, w, menuState));
      if (!choice) continue;
      usedIds.add(choice.id);
      if (trace) trace.authored.push(choice.id);
      commitAuthoredToMenu(menuState, choice);
      section.dishes[i] = buildAuthoredMenuDish(choice, w);
      imports++;
    }
  }
}

// When caps zero out the mains section, this guarantees at least one meatless
// main. Tries authored meatless mains first (the curated, named ones), then
// falls back to procedural templates whose protein slot can land on plant or
// dairy proteins. As a last resort, accepts any procedurally-built main.
function forceMeatlessMain(authoredPool, usedAuthored, ingPool, rng, w, data, names, trace, menuState) {
  // 1. Authored meatless: those without `contains`.
  const candidates = authoredPool
    .filter(d => d.section === "main" && !d.contains && !usedAuthored.has(d.id));
  if (candidates.length) {
    const choice = weightedPick(rng, candidates, d => weightAuthored(d, w, menuState));
    if (choice && !names.has(choice.name)) {
      usedAuthored.add(choice.id);
      if (trace) trace.authored.push(choice.id);
      commitAuthoredToMenu(menuState, choice);
      return buildAuthoredMenuDish(choice, w);
    }
  }
  // 2. Procedural: try repeatedly; accept only meatless results.
  const usedTpl = new Set();
  for (let i = 0; i < 30; i++) {
    const dish = pickProceduralDish("main", usedTpl, names, ingPool, rng, w, data, trace, menuState);
    if (!dish) break;
    if (classifyMain(dish) === "meatless") return dish;
  }
  // 3. Last resort: any procedural main.
  const fallback = pickProceduralDish("main", new Set(), new Set(), ingPool, rng, w, data, trace, menuState);
  return fallback;
}

window.InnMenu = { generateMenu, generateMenuTraced, formatPrice, filterAuthored, resolveWorld };
