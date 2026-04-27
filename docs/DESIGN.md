# Design Notes

Read this before editing data files or changing generation logic. It is the source of truth for how the generator thinks.

## Core principle

The authored pool sets the tone; the procedural engine widens the vocabulary.

A menu in a real medieval inn wasn't assembled from slots. A cook made specific dishes they knew how to make, and served whatever was in the larder that day. Hand-authored dishes (`data/authored_dishes.json`) are the primary pool — filtered by world state, drawn with weighted randomness. The procedural template system (`data/dishes.json` + `data/ingredients.json`) fills any remaining slots by assembling plausible dish names from ingredients and preparations, giving a much larger surface of permutations so repeated generations don't feel same-y.

How much procedural vs authored mixes into any given slot is controlled by `TUNING.authored_ratio` in `src/generator.js` (default `0.75` — roughly three authored for every one procedural, with fallback to the other pool when the preferred source is empty).

The consequence: **to change the stable, named dishes, edit `authored_dishes.json`.** To change the procedural flavor, edit ingredients and templates. To change the mix, edit the tuning block.

## Tuning knobs

At the top of `src/generator.js`:

```js
const TUNING = {
  authored_ratio: 0.75,           // 1.0 authored-only, 0.0 procedural-only
  event_weight_mult: 1.0,         // 0.0 events affect only prices/notes, 1.0 default
  authored_event_tag_boost: 1.7,  // base boost per event tag match on authored dishes
  ingredient_event_tag_boost: 1.8,
  ingredient_event_role_boost: 1.6
};
```

These are edit-in-place. No UI exposure — change the file, reload, see the effect. `authored_ratio` is the main lever for variety: lower it to lean on the 400+ ingredient pool; raise it to pin the menu to curated dishes. `event_weight_mult` lets a campaign where events are narrative centerpieces (Harvest Festival actually changes the menu) coexist with a gritty world where events are incidental.

## World state

A menu is generated from seven parameters. All are user-selected.

| Parameter | Values |
|-----------|--------|
| biome | `coastal`, `heartland`, `highland`, `arid`, `frostlands` |
| season | `spring`, `summer`, `autumn`, `winter` |
| weather | `clear`, `rain`, `snow`, `heatwave` |
| inn_tier | `roadside`, `common`, `fine`, `noble` |
| economy | `plenty`, `normal`, `shortage`, `famine` |
| condition | `peace`, `war`, `plague`, `isolation`, `siege` |
| event | 8 transient events (harvest festival, market day, etc.) |

Plus a `seed` string. Same world + same seed = same menu, always.

## Biomes

Five biomes, chosen to give food a distinct character in each. These are the first-class selector.

| Biome | Climate | Food character |
|-------|---------|----------------|
| Coastal | Temperate maritime | Fish, shellfish, citrus where warm |
| Heartland | Temperate plains and forest | Grain, pork, game, orchard fruit — the "default" medieval palette |
| Highland | Cold mountain | Mutton, dairy, roots, smoked meats, chestnut |
| Arid | Hot, dry (Mediterranean → semi-desert) | Olive, legume, goat, warming spices, citrus |
| Frostlands | Arctic and subarctic | Seal, reindeer, fermented dairy, preserved fish, rye |

Sub-biome nuance — `forest`, `river`, `lake`, `subterranean` — exists only as **tags on ingredients and dishes**, biasing availability rather than gating it. There is no "forest highland" selector; if a dish needs forest mushrooms, it carries a `forest` tag and the weighting handles the rest.

## Weather

Weather is a four-option world dial — `clear`, `rain`, `snow`, `heatwave` — that biases the procedural ingredient pool and (under rain) the cooking method pool. Authored dishes are **not** weather-filtered; the weather effect rides on the procedural side, which is roughly 20–50% of any given menu depending on tier and `authored_ratio`.

The schema lives in `modifiers.json → weather`. Each entry can carry any of these optional fields:

| Field | Meaning |
|-------|---------|
| `drops_tags` | Tags that are **hard-removed** from the procedural ingredient pool. |
| `robust_mult` | Weight multiplier on ingredients tagged `weather-robust` (preserved/shelf-stable items). |
| `sensitive_mult` | Weight multiplier on ingredients tagged `weather-sensitive` *only when not in `drops_tags`*. Lets a weather "soft-dampen" fresh items rather than removing them. |
| `prep_bias` | Map of `prep id → multiplier` used to weight the procedural prep selection (default for missing keys is 1.0). |

A weather with none of these fields (e.g. `clear`) is a true no-op — the pool and weighting behave as if no weather were set.

### What each weather does

| Weather | Behavior |
|---------|----------|
| **Clear** | No filtering, no weighting. Baseline. |
| **Rain** | Soft tilt — no ingredients dropped. `weather-sensitive` items are weighted ×0.5; `weather-robust` items ×1.6. The `prep_bias` favors `stewed`, `braised`, `smoked` and dampens `roasted`, `grilled`, `baked`, `pan-fried` — the kitchen pulls food indoors and reaches for the cauldron. |
| **Snow** | Drops `weather-sensitive` (greens, fruits, fresh fish, fresh organ meats — harvest and trade routes are disrupted). Boosts `weather-robust` ×1.2. Fresh dairy survives — cold preserves it (see split tag below). |
| **Heatwave** | Drops `weather-sensitive` *and* `heat-sensitive` (the latter covers fresh dairy and similar perishables that spoil in heat). Boosts `weather-robust` ×1.2. |

### Two sensitivity tags, not one

Ingredients carry one of:

- `weather-sensitive` — crops, fresh fish, offal. Drops in **snow** (harvest disrupted) and **heatwave** (spoils, wilts).
- `heat-sensitive` — fresh dairy and similar perishables that don't suit heat but are fine in cold. Drops in **heatwave** only; survives **snow**.
- `weather-robust` — preserved/shelf-stable (breads, dried legumes, root vegetables, salted meats, hard cheese). Boosted under any harsh weather.

This split is the reason fresh butter, milk, cream, sheep's milk, mare's milk, soft ripened cheese, and fresh curds appear on a snow menu but not on a heatwave menu. Edit the tag on an ingredient to change which weathers it survives.

### Compatibility with biome and season

Some weathers don't make sense in some biomes or seasons. The rules live next to the weathers in `modifiers.json → weather_incompatibilities`:

| Weather | Incompatible biome | Incompatible season |
|---------|--------------------|---------------------|
| Snow | Arid | Summer |
| Heatwave | Frostlands | Winter |

The UI enforces this at the dropdown layer: the offending weather options are disabled when the user picks an incompatible biome or season, and the Randomize button only picks from the still-allowed set. The generator itself never sees an invalid combo from the UI; if a stored seed or external caller passes one, `resolveWorld` falls back to `clear` rather than throwing.

To add a new incompatibility, append to the appropriate weather's `biomes` or `seasons` array. To soften the rule (e.g. allow snow in arid as a one-off curiosity), remove the entry — no code change needed.

### Authoring guidance

- A new weather is data-only: add an entry to `modifiers.json → weather`, give it whatever combination of `drops_tags` / `robust_mult` / `sensitive_mult` / `prep_bias` fits, add it to `WEATHER_ORDER` in `src/ui.js` so it appears in the dropdown, and (optionally) declare incompatibilities. No generator changes required.
- Tag balance matters: roughly half the ingredient pool is tagged `weather-robust`, ~30% `weather-sensitive`. Aggressive `sensitive_mult` (e.g. ×0.1) on a common weather will visibly thin menus; a value around ×0.5 reads as "noticeable but not dramatic." See the smoke-test methodology in commit history if you want to retune.
- Prep bias only affects procedural dishes whose templates list more than one prep option. Drinks, raw plates, and templates with a single prep are unaffected.

## Events vs conditions

Two different concepts, deliberately separated.

**Events** are transient. Market Day, Harvest Festival, Noble Visit, Good Catch. They add color — an italic note at the top of the menu — and nudge weights (boost certain tags, slight price adjustments). They assume the world is functioning.

**Conditions** are durative and structural. War, Plague, Isolation, Siege. They gate entire categories of goods (no imports during war) and raise baseline prices (rationing). A condition note overrides the mood of the menu; an event decorates it. Both can coexist ("Market Day during the Plague" is a valid, grim scenario).

## Condition-based menu caps

Material conditions don't just nudge prices — they shrink the menu. The cap system in `src/generator.js` enforces tier-specific upper bounds on each section, and tightens those bounds further when the world is in extreme scarcity.

### Base caps (per tier)

When no plentiful event is active, every menu is clamped to a per-tier cap:

| Tier | Starters | Meat main | Fish main | Meatless main | Drinks |
|------|----------|-----------|-----------|---------------|--------|
| Roadside | 2 | combined: 1 (meat OR fish) | — | 2 | 2 |
| Common | 3 | 1 | 1 | 2 | 3 |
| Fine | 4 | 2 | 2 | 2 | 4 |
| Noble | 4 | 2 | 2 | 2 | 5 |

Roadside uses a single combined "meat or fish" cap because at the lowest tier the distinction blurs — you get whatever the cook has. The other tiers split meat and fish so a Common inn can serve one of each.

The caps are *upper* bounds. The section's existing `count_min/count_max` (in `modifiers.json`) still rolls a target inside its range; the final count is `min(rolled, sum-of-caps)`. Under no scarcity, Fine and Noble caps are sized to match `count_max`, so behavior is unchanged from peace-time.

### Plentiful events bypass caps

If the active event is one of `harvest-festival`, `market-day`, `noble-visit`, `hunting-return`, `fishing-good`, **all caps are skipped** for that menu. The cook splurges. This is the scaffolding's escape hatch: when the narrative justifies abundance, the math gets out of the way.

The list of plentiful events lives in `PLENTIFUL_EVENTS` at the top of `src/generator.js`.

### Extreme scarcity reductions

Two world-state flags count as "extreme scarcity":

- `economy === "famine"`
- `condition` ∈ `{plague, isolation, siege}` (war is intentionally **not** counted — it disrupts trade but doesn't necessarily empty the larder)

The number of these active at once (0, 1, or 2) is the **scarcity hits**. Each hit subtracts 1 from every numeric cap. So a Common inn under famine + plague (2 hits) drops to 1 starter / 0 meat / 0 fish / 0 meatless / 1 drink — except for the floor.

### Floors

- Every section renders **at least 1 dish**. After scarcity subtraction, each section's effective total is floored at 1.
- For mains specifically, if all meat/fish/meatless caps reduce to 0, the meatless cap is forced to 1, and the generator falls back to a meatless dish (preferring authored meatless mains, then procedural meatless templates, then any procedural main as a last resort).

### Severe-scarcity tier downgrade

At **2 scarcity hits**, even Fine and Noble kitchens lose access to their gilded options. The inn's `allowed_tags` is rewritten:

- `noble` and `exotic` are stripped out
- `peasant` and `common` are added in

For a Noble inn under famine + siege, that means `["refined","noble","foreign","exotic"]` becomes `["peasant","common","refined","foreign"]` — the kitchen serves whatever's still in the cellar (ale, kvass, pottage), regardless of how rich the inn normally is. The price multipliers from condition + economy still apply, so even the plain food carries a markup.

The strip/add lists live in `TAGS_STRIPPED_AT_SEVERE_SCARCITY` and `TAGS_ADDED_AT_SEVERE_SCARCITY` in `src/generator.js`.

### Meat / fish / meatless classification

Mains are classified into three buckets so the per-kind caps can be enforced:

- **Authored mains** carry an explicit `contains: "meat"` or `contains: "fish"` field (omitted when meatless). See the Authored dishes section below for the schema.
- **Procedural mains** are classified at build time from the chosen protein ingredient's `roles`/id:
  - roles include `fish` or `shellfish` → `fish`
  - roles include `fowl`, `ruminant`, `game`, or `offal` → `meat`
  - id ∈ `{pork, bacon, sausage}` → `meat` (these have only the generic `protein` role)
  - everything else (egg, skyr, chickpea, beans, lentils, broad-beans, no protein at all) → `meatless`

The "meatless" bucket follows the user-facing rule that animal byproducts (lard, butter, cream, eggs, dairy) don't disqualify a dish from counting as meatless.

## Authored dishes

Each dish in `authored_dishes.json` carries:

```json
{
  "id": "cuttlefish-radish",
  "name": "Cuttlefish with roasted radishes",
  "section": "main",
  "biomes": ["coastal"],
  "seasons": ["summer", "autumn"],
  "tier_min": 2,
  "cost": 3,
  "tags": ["refined", "mediterranean"]
}
```

Field notes:

- **biomes** — array of biome IDs OR `"any"`. A dish with `["coastal"]` is native to coastal; a dish with `["any"]` works anywhere (cheese fritters, pickled vegetables).
- **seasons** — array of seasons OR `"all-seasons"`. "Roast pork" is autumn/winter; "pickled cucumber salad" is summer/autumn; "cheese fritters" is all-seasons.
- **tier_min / tier_max** — inn-tier range. A `tier_min: 3` dish only appears at fine or noble inns. A `tier_max: 2` caps it at common or roadside. Defaults: no min, no max.
- **cost** — 1 to 5. Drives base price. Scales through tier/economy/condition/event multipliers.
- **tags** — cultural (`peasant`, `common`, `refined`, `noble`), origin (`foreign`, `exotic`), cuisine (`mediterranean`, `nordic`), and flags (`unusual`). Conditions exclude dishes by tag: war excludes `foreign` and `exotic`.
- **contains** (mains only, optional) — `"meat"` or `"fish"`. Omit for meatless mains (the bucket the cap system treats as the safe fallback under scarcity). Used by the per-kind cap loop; see the Condition-based menu caps section. Animal byproducts (eggs, dairy, lard) do not require this field — they count as meatless.
- **flavor** (optional) — a short description the optional LLM polish can use. Mostly used for dishes whose names don't fully explain themselves ("Hypocras" → "spiced wine").

### Imports

If a dish's native biome doesn't match the world AND the current condition permits imports AND the inn is fine or noble, it can appear as an import. Imports are labeled "(imported)" in the menu and carry a 1.5× price multiplier. Imports are always suppressed under war, plague, isolation, or siege.

## Flavor packs

The generic pool aims to be system-agnostic — recognizable medieval-fantasy fare that fits most worlds. Setting-specific named dishes (proper nouns, regional cuisines, in-fiction beverages) live in **flavor packs** instead, so other DMs forking the project don't inherit one author's setting.

A flavor pack is a single JSON file under `data/flavor_packs/`, registered in `data/flavor_packs/index.json`. Each pack carries the same kinds of records as the generic pool, plus an override hook:

```json
{
  "id": "mog",
  "label": "Mog",
  "description": "...",
  "ingredient_overrides": [
    { "id": "sunchoke", "name": "Altay artichoke" },
    { "id": "red-wine", "name": "Briggan wine" }
  ],
  "ingredients": [
    { "id": "ghostfish", "name": "Sasani ghostfish", "roles": ["protein","fish"], "tags": ["coastal","summer","autumn","refined"], "cost": 4, "affinities": ["bakes-into","grills-well"] }
  ],
  "dishes": [
    { "id": "stokvis-cod-buttermilk", "name": "Stokvis Bay cod in sour buttermilk", "section": "main", "biomes": ["coastal"], "seasons": ["spring","summer","autumn"], "tier_min": 2, "cost": 3, "tags": ["common"] }
  ]
}
```

- **`ingredient_overrides`** — replace a generic ingredient by id. Used to rename `red-wine` → `Briggan wine` without forking the whole entry. Other fields on the override are merged onto the generic record.
- **`ingredients`** — net-new ingredients only the pack introduces (e.g. a fish that doesn't exist in the generic pool). Same schema as `data/ingredients.json` entries.
- **`dishes`** — net-new authored dishes. Same schema as `data/authored_dishes.json` entries. Filter rules (biome, season, tier, condition, imports) apply identically.

### Loading and merging

`src/ui.js → loadFlavorPacks()` reads the manifest at startup; `applyFlavorPacks(base, activeIds)` produces a new data object on each generate by:

1. Concatenating each active pack's `dishes` onto `authored_dishes.dishes`.
2. Concatenating each active pack's `ingredients` onto `ingredients.ingredients`.
3. Replacing generic ingredient entries by id where `ingredient_overrides` apply.

The generator (`src/generator.js`) is unaware of packs — it sees a single merged data object. All filtering, weighting, and pricing rules apply unchanged.

### Toggling a pack reshuffles the whole menu

A consequence of the "merge, don't filter" approach: turning a pack on or off changes the **input** the seeded generator draws from, not just which dishes are eligible at render time. Even on the same seed, slots that don't end up picking a pack dish can still flip to a different generic dish, because weighted random selection over a larger pool lands on different items for the same RNG draw. This is expected, not a bug — packs are first-class participants in selection, not a post-hoc overlay. If you want a pack toggle to leave the rest of the menu untouched, you'd need a different architecture (e.g. reserving slots for pack dishes, or filtering at render time), which is out of scope for v1.

### No deduplication

Generic dishes and pack dishes can share themes ("cod in buttermilk" generic vs. "Stokvis Bay cod in sour buttermilk" Mog) without the generator caring. They are distinct ids; both can appear in the same menu when the pack is active. If a generic twin feels redundant against a pack version, prune by hand — don't add code paths.

### Authoring a new pack

1. Create `data/flavor_packs/<your-id>.json` with the schema above.
2. Add an entry to `data/flavor_packs/index.json` with `{ "id", "label", "file", "description", "default_active": false }`.
3. Reload the page. Your pack appears as a checkbox under the Seed field.

Packs are pure data — no JS changes needed for new packs.

### Unusual dishes

Dishes like rat skewer, seal tail, albatross pie, aurochs ribs, basking shark, mole, lamprey carry the `unusual` tag. They're weighted ×0.3 in selection, so they appear sparingly — in the biome where they're native, they'll show in roughly 1 in 3–5 menus; elsewhere, much less.

## Generation pipeline

```
1. Resolve world → inn tier, economy, condition, event, etc.
2. Clone authored dish pool.
3. Filter authored pool by world:
     biome match (or 'any', or permitted import)
     season match (or 'all-seasons')
     tier within dish's min/max
     cultural tags compatible with inn tier
     not excluded by condition tags
     cost within economy ceiling
4. For each section (appetizer, main, dessert, drink):
     Determine count via (min + rng * range).
     For non-drink sections, per slot:
       Roll rng() < TUNING.authored_ratio → prefer authored this slot; else prefer procedural.
       Try the preferred source first; fall back to the other if empty.
         authored weights: native biome ×2.0, season match ×1.8, event boost ×1.7
                           (scaled by event_weight_mult), 'any' biome ×1.2,
                           imported ×0.35, unusual ×0.3, peasant-under-war ×1.5,
                           noble-at-roadside ×0.4, etc.
         procedural: pick a template for the section, roll a prep from its pool
                     (weighted by current weather's prep_bias if any), fill slots
                     by role + affinity with ingredient weights.
     For drinks:
       Pull from ingredients with role=drink, weighted by world.
5. Compute prices:
     base = COST_BASE[cost]   (2, 6, 18, 55, 180 cp)
     price = base × tier.mult × economy.mult × condition.mult × event.mult × (1.5 if imported)
6. Return menu { sections, event_note, condition_note }.
```

## Price rendering

1 gp = 10 sp = 100 cp.

- Drop zero denominations: `105 cp` renders as `1 gp 5 cp`, not `1 gp 0 sp 5 cp`.
- Items under 100 cp render as `X sp Y cp` or just `X cp`.
- At/above 100 cp, `gp` comes first.
- No decimals. Round to nearest copper.

## Procedural path

Lives in `data/dishes.json` as templates. Each template has a section, optional tier range, a `prep_pool`, slot definitions (role required), and a name template. Uses the ingredient pool (filtered by the same world rules, minus `unusual`) and preparation compatibility to assemble plausible dish names.

Templates are invoked either as fallback when the authored pool is empty for a slot, or proactively when `TUNING.authored_ratio` routes a slot to procedural. The larger the ingredient pool, the more variety procedural delivers across regenerations; the ingredient file is where to add regional nuance.

If procedural fires too often with awkward combinations, adjust in one of three places depending on symptom: add authored dishes (stabilizes specific gaps), add ingredient affinities (expands valid combinations within existing templates), or add templates (new dish shapes).

## Editing data

Common edits and the file to touch:

| Edit | File |
|------|------|
| Add a generic dish you wrote | `authored_dishes.json` |
| Add a setting-specific named dish | a flavor pack under `data/flavor_packs/` |
| New ingredient (so procedural and drinks can use it) | `ingredients.json` |
| Rename an ingredient for a specific setting | `ingredient_overrides` in a flavor pack |
| New condition (e.g. "fey-incursion") | `modifiers.json` → `conditions` |
| New transient event | `events.json` |
| Mark a new condition as "extreme scarcity" | `EXTREME_SCARCITY_CONDITIONS` in `src/generator.js` |
| Mark a new event as "plentiful" (bypasses caps) | `PLENTIFUL_EVENTS` in `src/generator.js` |
| Tune per-tier section caps | `TIER_CAPS` in `src/generator.js` |
| Adjust which tags are stripped/added at -2 scarcity | `TAGS_STRIPPED_AT_SEVERE_SCARCITY` / `TAGS_ADDED_AT_SEVERE_SCARCITY` in `src/generator.js` |
| Change inn-tier pricing | `modifiers.json` → `inn_tiers` |
| Change biome labels or add a biome | `modifiers.json` → `biomes` (and retag dishes/ingredients accordingly) |

Tags are case-sensitive lowercase hyphenated strings. The generator does exact-string matching; a typo in a tag silently makes a dish invisible.

## Open questions for future versions

- **Thematic coherence.** Menus currently sample dishes independently. A coherence pass could bias toward "all-fish menu in a port town tonight" or "every dish uses saffron, the new caravan's boon."
- **Cook's signature.** A per-inn fingerprint seeded by inn name could make specific inns reliably produce certain dishes ("The Weeping Stag always has venison jelly when it's in season").
- **Dietary filtering.** Trivial with the current tag system — add `vegetarian`, `contains-pork`, etc. Not in v1.
- **LLM polish.** Optional `src/llm.js` sends the menu to Anthropic's API for atmospheric descriptions. Requires the user to paste their own API key; nothing is stored server-side.
