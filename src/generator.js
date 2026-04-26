// generator.js
// Menu generator. Given world state and seed, returns a deterministic menu.
// Mixes authored dishes and procedural assemblies per slot, ratio controlled by TUNING.

// ---------- tuning ----------
// Edit these to bias generation behavior. All defaults preserve the v1 "authored-first" feel.
const TUNING = {
  // Probability per slot that authored is tried first. 1.0 = always prefer authored (authored-only
  // unless the filtered pool is empty); 0.0 = always prefer procedural; 0.5 = roughly half-and-half.
  // When the preferred source has nothing to offer, the other source fills in.
  authored_ratio: 0.50,

  // Scales how strongly events bias dish and ingredient weighting. 0.0 = events affect only
  // price and notes, not dish selection; 1.0 = default; >1.0 = events dominate the menu.
  event_weight_mult: 1.0,

  // Base boost applied to an authored dish per matching event tag (before event_weight_mult).
  // Same idea for ingredient boosts on the procedural path. These are the v1 numbers; left
  // as knobs for fine-tuning without chasing magic numbers through the file.
  authored_event_tag_boost: 1.7,
  ingredient_event_tag_boost: 1.8,
  ingredient_event_role_boost: 1.6
};

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
    weather: data.modifiers.weather[world.weather],
    tier: data.modifiers.inn_tiers[world.inn_tier],
    tierIdx: TIER_INDEX[world.inn_tier],
    economy: data.modifiers.economy[world.economy],
    condition: data.modifiers.conditions[world.condition],
    event: data.events.events.find(e => e.id === world.event) || data.events.events[0]
  };
}

// ---------- authored dish filter ----------
function filterAuthored(dishes, w) {
  return dishes.filter(d => {
    // Biome: 'any' matches; otherwise must include the current biome.
    if (!d.biomes.includes("any") && !d.biomes.includes(w.biome)) {
      // Not native. Could still appear as import IF conditions allow and tier is fine+.
      if (!w.condition.excludes_imports && w.tierIdx >= 3) {
        // Accept as import — price will be adjusted by a +50% import mult later.
        d._imported = true;
      } else {
        return false;
      }
    } else {
      d._imported = false;
    }

    // Season
    if (!d.seasons.includes("all-seasons") && !d.seasons.includes(w.season)) return false;

    // Tier
    if (d.tier_min && w.tierIdx < d.tier_min) return false;
    if (d.tier_max && w.tierIdx > d.tier_max) return false;

    // Cultural tags must overlap with inn's allowed tags (if dish has any tier-relevant tags)
    const tierTags = ["peasant","common","refined","noble","foreign","exotic"];
    const culturalDishTags = (d.tags || []).filter(t => tierTags.includes(t));
    if (culturalDishTags.length && !culturalDishTags.some(t => w.tier.allowed_tags.includes(t))) return false;

    // Condition excludes (e.g. war excludes foreign/exotic)
    if (w.condition.excludes_tags && w.condition.excludes_tags.length) {
      if ((d.tags || []).some(t => w.condition.excludes_tags.includes(t))) return false;
    }

    // Economy: cost ceiling shrinks under shortage/famine
    if (d.cost > w.economy.remove_above_cost) return false;

    // "unusual" dishes appear only rarely — handled via weighting, not filtering, unless the
    // condition is restrictive. Under war/plague/siege/isolation, unusual stays allowed because
    // those are local poor-food dishes mostly.

    return true;
  });
}

function weightAuthored(d, w) {
  let weight = 1;
  // Native biome gets a big boost
  if (d.biomes.includes(w.biome)) weight *= 2.0;
  // "Any" biome dishes are neutral
  else if (d.biomes.includes("any")) weight *= 1.2;
  // Imports are possible but less likely
  if (d._imported) weight *= 0.35;

  // Seasonal match boost
  if (d.seasons.includes(w.season)) weight *= 1.8;

  // Event boosts: if any dish tag matches a boost tag (scaled by TUNING.event_weight_mult)
  const eventBoost = 1 + (TUNING.authored_event_tag_boost - 1) * TUNING.event_weight_mult;
  for (const t of w.event.boost_tags || []) if ((d.tags || []).includes(t)) weight *= eventBoost;

  // Condition tone: under war/plague/siege, favor peasant/common fare
  if (["war","plague","siege","isolation"].includes(w.condition.label ? w.condition.label.toLowerCase() : "")) {
    if ((d.tags || []).includes("peasant")) weight *= 1.5;
    if ((d.tags || []).includes("noble")) weight *= 0.3;
  }

  // "unusual" dishes get dampened by default
  if ((d.tags || []).includes("unusual")) weight *= 0.3;

  // Roadside inns shouldn't lean noble even if allowed
  if (w.tierIdx <= 2 && (d.tags || []).includes("noble")) weight *= 0.4;
  // Noble inns shouldn't lean peasant
  if (w.tierIdx >= 4 && (d.tags || []).includes("peasant")) weight *= 0.4;

  return weight;
}

function priceAuthoredDish(d, w) {
  const base = COST_BASE[d.cost] || 6;
  const importMult = d._imported ? 1.5 : 1.0;
  const price = base * w.tier.price_mult * w.economy.price_mult * w.condition.price_mult * (w.event.price_mult || 1) * importMult;
  return Math.max(1, Math.round(price));
}

// ---------- procedural fallback (unchanged in spirit from v1) ----------
function filterIngredientPool(ingredients, w) {
  const BIOMES = ["coastal","heartland","highland","arid","frostlands","forest","river","lake","subterranean","plains"];
  const SEASONS = ["spring","summer","autumn","winter"];
  const TIER_TAGS = ["peasant","common","refined","noble","foreign","exotic"];

  return ingredients.filter(ing => {
    const tags = ing.tags || [];

    // Biome: ingredient's biome tags (if any) — we accept if any matches the world biome directly.
    // Sub-biome tags like 'forest', 'river' don't have their own parent selector now, so they pass
    // as long as nothing contradicts.
    const biomeTags = tags.filter(t => BIOMES.includes(t));
    if (biomeTags.length) {
      const worldBiomeMatches = biomeTags.includes(w.biome);
      // Also allow sub-biome tags — they're biases, not gates, so keep them available.
      const subBiomeTags = biomeTags.filter(t => !["coastal","heartland","highland","arid","frostlands"].includes(t));
      if (!worldBiomeMatches && subBiomeTags.length === biomeTags.length) {
        // All tags are sub-biome — treat as ambient, keep.
      } else if (!worldBiomeMatches) return false;
    }

    // Season
    const seasonTags = tags.filter(t => SEASONS.includes(t));
    const allSeason = tags.includes("all-seasons");
    if (seasonTags.length && !seasonTags.includes(w.season) && !allSeason) return false;

    // Tier ceiling (no floor — cheap ingredients are fine anywhere as supporting roles)
    if (ing.cost > w.tier.cost_max) return false;

    // Cultural tag gate
    const cultural = tags.filter(t => TIER_TAGS.includes(t));
    if (cultural.length && !cultural.some(t => w.tier.allowed_tags.includes(t))) return false;

    // Weather sensitivity
    if (w.weather.drops_sensitive && tags.includes("weather-sensitive")) return false;

    // Economy cap
    if (ing.cost > w.economy.remove_above_cost) return false;

    // Condition excludes
    if (w.condition.excludes_tags && w.condition.excludes_tags.length) {
      if (tags.some(t => w.condition.excludes_tags.includes(t))) return false;
    }

    // Famine protein restriction
    if (w.economy.restrict_role && (ing.roles || []).includes(w.economy.restrict_role) && ing.cost > 2) return false;

    // Unusual ingredients get dropped in procedural path — they're reserved for authored dishes
    if (tags.includes("unusual")) return false;

    return true;
  });
}

function weightIngredient(ing, w) {
  let weight = 1;
  const tags = ing.tags || [];
  const roles = ing.roles || [];
  if (tags.includes(w.season)) weight *= 1.8;
  if (tags.includes(w.biome)) weight *= 1.6;
  const tagBoost = 1 + (TUNING.ingredient_event_tag_boost - 1) * TUNING.event_weight_mult;
  const roleBoost = 1 + (TUNING.ingredient_event_role_boost - 1) * TUNING.event_weight_mult;
  for (const t of w.event.boost_tags || []) if (tags.includes(t)) weight *= tagBoost;
  for (const r of w.event.boost_roles || []) if (roles.includes(r)) weight *= roleBoost;
  if (w.weather.drops_sensitive && tags.includes("weather-robust")) weight *= 1.2;
  return weight;
}

function fillTemplate(template, prep, pool, rng, w) {
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
    const chosen = weightedPick(rng, candidates, ing => weightIngredient(ing, w));
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
  const priceCp = (baseCopper + labor) * prep.cost_mult * w.tier.price_mult * w.economy.price_mult * w.condition.price_mult * (w.event.price_mult || 1);

  return {
    source: "procedural",
    section: template.section,
    name: capitalize(name),
    price_cp: Math.max(1, Math.round(priceCp)),
    price_text: formatPrice(priceCp)
  };
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Pick a single procedural dish for the given section, avoiding already-used templates and
// existing dish names. Returns null if nothing valid can be built.
function pickProceduralDish(section, usedTpl, existingNames, pool, rng, w, data) {
  const templates = data.dishes.templates.filter(t => t.section === section);
  if (!templates.length) return null;
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    const available = templates.filter(t => !usedTpl.has(t.id));
    const from = available.length ? available : templates;
    const tpl = pick(rng, from);
    if (!tpl) return null;
    const prepId = pick(rng, tpl.prep_pool);
    const prep = data.preparations.preparations.find(p => p.id === prepId);
    if (!prep) continue;
    const dish = fillTemplate(tpl, prep, pool, rng, w);
    if (dish && !existingNames.has(dish.name)) {
      usedTpl.add(tpl.id);
      return dish;
    }
  }
  return null;
}

// Pick a single authored dish, avoiding already-used ids. Returns null if pool exhausted.
function pickAuthoredDish(sectionAuthored, usedIds, rng, w) {
  const remaining = sectionAuthored.filter(d => !usedIds.has(d.id));
  if (!remaining.length) return null;
  const choice = weightedPick(rng, remaining, d => weightAuthored(d, w));
  if (!choice) return null;
  usedIds.add(choice.id);
  const price = priceAuthoredDish(choice, w);
  return {
    source: "authored",
    section: choice.section,
    name: choice.name + (choice._imported ? " (imported)" : ""),
    flavor: choice.flavor,
    imported: !!choice._imported,
    price_cp: price,
    price_text: formatPrice(price)
  };
}

// ---------- main generator ----------
function generateMenu(world, data, seed) {
  const rng = makeRng(seed || String(Date.now()));
  const w = resolveWorld(world, data);
  const sections = data.modifiers.sections;

  // Clone authored list so we can mark _imported without polluting source data
  const authoredCopy = data.authored_dishes.dishes.map(d => ({ ...d }));
  const authoredPool = filterAuthored(authoredCopy, w);

  // Procedural ingredient pool (for fallback)
  const ingPool = filterIngredientPool(data.ingredients.ingredients, w);

  const menu = {
    world,
    seed,
    biome_label: (data.modifiers.biomes[w.biome] || {}).label,
    event_note: w.event.note,
    condition_note: w.condition.note,
    sections: {}
  };

  for (const sectionId of Object.keys(sections)) {
    const spec = sections[sectionId];
    const count = spec.count_min + Math.floor(rng() * (spec.count_max - spec.count_min + 1));
    const dishes = [];

    if (sectionId === "drink") {
      // Drinks come from ingredients tagged role 'drink'. No authored-dish work here.
      const drinks = ingPool.filter(i => (i.roles || []).includes("drink"));
      const used = new Set();
      let tries = 0;
      while (dishes.length < count && tries < 30 && drinks.length) {
        tries++;
        const pickD = weightedPick(rng, drinks.filter(d => !used.has(d.id)), i => weightIngredient(i, w));
        if (!pickD) break;
        used.add(pickD.id);
        const baseCopper = COST_BASE[pickD.cost] || 2;
        const price = baseCopper * w.tier.price_mult * w.economy.price_mult * w.condition.price_mult;
        dishes.push({
          source: "drink",
          section: "drink",
          name: capitalize(pickD.name),
          price_cp: Math.max(1, Math.round(price)),
          price_text: formatPrice(price)
        });
      }
    } else {
      // Per-slot mix. Each slot rolls authored-first vs procedural-first by TUNING.authored_ratio.
      // Whichever source is preferred is tried first; the other serves as fallback.
      const sectionAuthored = authoredPool.filter(d => d.section === sectionId);
      const usedAuthored = new Set();
      const usedTpl = new Set();
      const names = new Set();
      let safety = 0;
      while (dishes.length < count && safety < count * 8) {
        safety++;
        const preferAuthored = rng() < TUNING.authored_ratio;
        let dish = null;
        if (preferAuthored) {
          dish = pickAuthoredDish(sectionAuthored, usedAuthored, rng, w);
          if (!dish) dish = pickProceduralDish(sectionId, usedTpl, names, ingPool, rng, w, data);
        } else {
          dish = pickProceduralDish(sectionId, usedTpl, names, ingPool, rng, w, data);
          if (!dish) dish = pickAuthoredDish(sectionAuthored, usedAuthored, rng, w);
        }
        if (!dish) break;
        if (names.has(dish.name)) continue;
        names.add(dish.name);
        dishes.push(dish);
      }
    }

    menu.sections[sectionId] = { label: spec.label, dishes };
  }

  return menu;
}

window.InnMenu = { generateMenu, formatPrice };
