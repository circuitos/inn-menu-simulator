# Design Notes

Read this before editing data files or changing generation logic. It is the source of truth for how the generator thinks.

## Core principle

The authored pool sets the tone; the procedural engine widens the vocabulary.

A menu in a real medieval inn wasn't assembled from slots. A cook made specific dishes they knew how to make, and served whatever was in the larder that day. Hand-authored dishes (`data/authored_dishes.json`) are the primary pool — filtered by world state, drawn with weighted randomness. The procedural template system (`data/dishes.json` + `data/ingredients.json`) fills any remaining slots by assembling plausible dish names from ingredients and preparations, giving a much larger surface of permutations so repeated generations don't feel same-y.

How much procedural vs authored mixes into any given slot is controlled by `TUNING.authored_ratio` in `src/generator.js` (default `0.75` — roughly three authored for every one procedural, with fallback to the other pool when the preferred source is empty).

The consequence: **to change the stable, named dishes, edit `authored_dishes.json`.** To change the procedural flavor, edit ingredients and templates. To change the mix, edit the tuning block.

## Tuning knobs

The `TUNING` block at the top of `src/generator.js` is the single place to bias generation behavior. Edit-in-place; no UI exposure. Reload to see the effect.

```js
const TUNING = {
  authored_ratio: 0.65,
  event_weight_mult: 1.0,
  authored_event_tag_boost: 1.7,
  ingredient_event_tag_boost: 1.8,
  ingredient_event_role_boost: 1.6,

  specificity_step: 0.88,
  novelty_step: 0.92,
  ingredient_repeat_step: 0.5,

  peculiar_authored_base: 0.75,
  peculiar_ingredient_base: 0.05,
  peculiar_hardship_mult: 2,
  peculiar_pity_mult: 2,

  peasant_low_tier_boost: 1.5,
  refined_low_tier_dampener: 0.5,
  peasant_high_tier_dampener: 0.7
};
```

### Mix and event knobs

| Knob | Default | What it does |
|------|--------:|--------------|
| `authored_ratio` | 0.65 | Probability per slot of preferring authored over procedural. 1.0 pins the menu to curated dishes; 0.0 leans on the 400+ ingredient pool. Falls through to the other source when the preferred one is empty. |
| `event_weight_mult` | 1.0 | Scales how aggressively the active event biases dish/ingredient weighting. 0.0 = events only affect prices and notes; >1.0 = events visibly steer the menu (Harvest Festival actually changes what shows up). |
| `authored_event_tag_boost` | 1.7 | Base multiplier applied to an authored dish per matching event boost tag (before `event_weight_mult` scaling). |
| `ingredient_event_tag_boost` | 1.8 | Same idea, for procedural ingredient tag matches. |
| `ingredient_event_role_boost` | 1.6 | Procedural ingredient boost per matching event role (e.g. fish on a Good Catch). |

### Variety knobs

These three together replace what would otherwise be per-dish "workhorse" flags. They derive their effect from the data shape (`biomes`/`seasons`/`tags` arrays, ingredient ids), so a contributor doesn't need to know which dishes are dominating — the engine notices breadth and repetition automatically.

| Knob | Default | What it does |
|------|--------:|--------------|
| `specificity_step` | 0.88 | Per "extra" biome or season on an authored dish, weight is multiplied by this factor. `["any"]` counts as 5 biomes; `["all-seasons"]` counts as 4 seasons. A 1-biome 1-season dish keeps full weight; a `["any"]` + `["all-seasons"]` dish takes ~0.32×. Lower this to push focused dishes harder; raise it (toward 1.0) to flatten the gradient. Replaces the old hard-coded `any+all-seasons → 0.7` rule. |
| `novelty_step` | 0.92 | Each tag the candidate carries that's already represented in the in-progress menu dampens weight by this factor (per overlap). State lives only inside one menu generation — does not leak across menus, so determinism is preserved. Reads as "the kitchen varies its offerings"; no per-dish flag involved. |
| `ingredient_repeat_step` | 0.5 | Each prior pick of the same ingredient in the current menu shrinks the weight of the next pick by this factor. Stops one herb or root from headlining four dishes back-to-back. Set to 1.0 to disable. |

### Peculiar knobs

The procedural pool **no longer hard-filters** peculiar ingredients (rat, lichen, megaceront, fern ash, etc.). They pass the filter and ride a heavy weight dampener instead. Authored peculiar dishes are dampened on the same curve. Two reasons to do it this way: (1) the corpus has no other surface for these ingredients except authored dishes, which means even a dozen authored peculiar entries leave most of them invisible; (2) hardship conditions and a per-menu pity boost can lift them organically when the world calls for grim food.

| Knob | Default | What it does |
|------|--------:|--------------|
| `peculiar_authored_base` | 0.75 | Base multiplier on authored dishes tagged `peculiar`. Higher than the ingredient base because authored entries are pre-curated and intentional. |
| `peculiar_ingredient_base` | 0.05 | Base multiplier on procedural ingredients tagged `peculiar`. Very low — these surface rarely under normal play. |
| `peculiar_hardship_mult` | 2 | Multiplier applied on top of `peculiar_*_base` when the world is in war / plague / siege / isolation / famine. Lifts peculiar items toward plausibility because that's exactly the kitchen pulling rats and lichen out when the larder is bare. |
| `peculiar_pity_mult` | 2 | Multiplier applied while the in-progress menu has not yet committed any peculiar item (authored or ingredient). Once the first peculiar lands, this multiplier turns off for the rest of the menu, so peculiar surfaces somewhere but doesn't take over. |

Effective base weights, for reference:

| State | Authored peculiar | Procedural peculiar |
|-------|------------------:|--------------------:|
| Default, menu has peculiar already | 0.75 | 0.05 |
| Default, menu has none yet (pity) | 1.50 | 0.10 |
| Hardship, menu has peculiar already | 1.50 | 0.10 |
| Hardship, menu has none yet | 3.00 | 0.20 |

### Tier-fit knobs

These shape the procedural ingredient pool so low-tier inns lean rustic and high-tier inns lean refined.

| Knob | Default | What it does |
|------|--------:|--------------|
| `peasant_low_tier_boost` | 1.5 | At roadside / common (`tierIdx ≤ 2`), ingredients tagged `peasant` get this multiplier. Was 2.0; relaxed to 1.5 so roadside menus draw from a wider eligible pool instead of collapsing onto the same handful of peasant staples. |
| `refined_low_tier_dampener` | 0.5 | At roadside / common, ingredients tagged `refined` (and not `common`) get this multiplier. Keeps a roadside inn from accidentally serving artichokes and saffron just because they passed the cultural-tag gate. |
| `peasant_high_tier_dampener` | 0.7 | At fine / noble (`tierIdx ≥ 3`), ingredients tagged `peasant` (and not `common`) get this multiplier. Pure-peasant items don't fit a noble inn's table even if technically allowed. |

### Per-menu state

`specificity_step`, `novelty_step`, `ingredient_repeat_step`, and the peculiar pity boost all consult a `menuState` object that lives only inside one `generateMenu` call. After each authored dish is committed, its tags accumulate in `menuState.authoredFamiliarity`; after each procedural slot is filled, the picked ingredient accumulates in `menuState.ingredientUsage`; whenever a peculiar item lands, `menuState.hasPeculiar` flips. The state is discarded at the end of generation, so determinism on the same `(world, seed)` pair is preserved — re-running yields the same menu.

### When to retune

- Smoke run shows an authored dish at >5× uniform expected rate: lower `specificity_step` (more aggressive per-extra-biome dampening) or write more native dishes for the biomes / seasons it's invading.
- Smoke run shows the same ingredient as top-1 across many axis slices: lower `ingredient_repeat_step` and (if it's an herb or staple) re-check its biome and season tags.
- Peculiar ingredients still never appear: raise `peculiar_ingredient_base` toward 0.1, or write authored dishes that name them.
- Roadside menus feel narrow: raise `peasant_low_tier_boost` and `refined_low_tier_dampener` toward 1.0.
- Events feel weak: raise `event_weight_mult` toward 1.5–2.0, or raise the per-tag/per-role boosts.

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

For a Noble inn under famine + siege, that means `["common","refined","noble","exotic"]` becomes `["peasant","common","refined"]` — the kitchen serves whatever's still in the cellar (ale, kvass, pottage), regardless of how rich the inn normally is. The price multipliers from condition + economy still apply, so even the plain food carries a markup. The condition's `max_import_distance: 0` also clamps imports out independently.

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
- **tags** — cultural (`peasant`, `common`, `refined`, `noble`), origin (`exotic`), cuisine (`mediterranean`, `nordic`), and flags (`peculiar`). The `exotic` tag means "no fixed origin, off-map trade good" — saffron, sugar, hothouse spices — and is treated as effective import distance 2 (see Imports below). The `peculiar` tag marks weird local items (rat, lamprey, seal); it dampens weight but doesn't gate.
- **contains** (mains only, optional) — `"meat"` or `"fish"`. Omit for meatless mains (the bucket the cap system treats as the safe fallback under scarcity). Used by the per-kind cap loop; see the Condition-based menu caps section. Animal byproducts (eggs, dairy, lard) do not require this field — they count as meatless.
- **flavor** (optional) — a short description the optional LLM polish can use. Mostly used for dishes whose names don't fully explain themselves ("Hypocras" → "spiced wine").

### Imports

Imports are modeled as **trade distance** between the dish's native biome and the world's biome. Three concepts decide whether a non-native dish can appear:

| Distance | Source | Label | Price multiplier |
|----------|--------|-------|------------------|
| 0 | Native to the world's biome (or `biomes: ["any"]`) | none | ×1.0 |
| 1 | The dish's biome is a **regional** neighbor of the world's biome | `(imported)` | ×1.3 |
| 2 | The dish's biome is a **distant** neighbor | `(rare import)` | ×1.7 |

The distance matrix lives in `modifiers.json → biome_relations`. It's symmetric and per-biome — for the default 5-biome map:

| Pair | Distance |
|------|----------|
| heartland ↔ any other biome | regional |
| coastal ↔ any other biome | regional |
| highland ↔ heartland / coastal / frostlands | regional |
| highland ↔ arid | distant |
| arid ↔ heartland / coastal | regional |
| arid ↔ highland / frostlands | distant |
| frostlands ↔ heartland / highland / coastal | regional |
| frostlands ↔ arid | distant |

A dish or ingredient passes the import gate when its effective distance is ≤ both:
- the inn-tier's `max_import_distance` (roadside: 0; common: 1; fine: 1; noble: 2), and
- the condition's `max_import_distance` (peace: 2; war: 1; plague/isolation/siege: 0).

So fine inns serve regional imports but not rare ones; noble inns serve everything. War cuts off rare imports but caravans still bring regional goods. Plague/siege/isolation seal the gates entirely — only native items remain.

**The `exotic` tag** is the off-map trade-good signal — saffron, sugar, hothouse spices, true rarities with no biome on the map. It bumps effective filtering distance to 2 regardless of biome (a heartland-native dish tagged `exotic` still requires noble + peace), but pricing uses biome distance only — a native exotic doesn't pay transport markup, since the rarity is already priced into its `cost` field.

When a DM wants to reshape geography (move regions, add a sixth biome, or carve up a 5×5 grid), edit `biome_relations`. The generator never sees coordinates — only the distance table. Symmetry isn't enforced by the code, but breaking it produces strange one-way trade lanes; keep entries reciprocal unless you mean it.

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

### Peculiar dishes and ingredients

Dishes and ingredients like rat skewer, seal tail, albatross pie, basking shark, lichen, fern ash, mole, lamprey carry the `peculiar` tag. They surface on a curve rather than as a fixed dampener — see the **Peculiar knobs** subsection under Tuning knobs. Briefly:

- Both authored peculiar dishes and procedural peculiar ingredients pass the world filters (no hard exclusion).
- They're heavily dampened by default (`peculiar_authored_base = 0.75`, `peculiar_ingredient_base = 0.05`).
- A per-menu **pity boost** (`peculiar_pity_mult = 2`) doubles the weight while the menu has no peculiar item yet, so one peculiar entry usually lands per menu when one's available; once it does, subsequent peculiar candidates revert to the base dampener.
- **Hardship** (`condition` ∈ war/plague/siege/isolation, or `economy === "famine"`) doubles the base again (`peculiar_hardship_mult = 2`) — the desperate-larder scenario where rats, lichen, and fermented blood are exactly what the kitchen serves.

(`peculiar` is the local-weird signal; for off-map rare-trade goods like saffron or megaceront ribs, see `exotic` in the Imports section. Note that megaceront ribs are tagged both — they're a peculiar local meat that also reads as exotic from any non-Frostlands inn.)

## Generation pipeline

```
1. Resolve world → inn tier, economy, condition, event, etc.
2. Clone authored dish pool.
3. Filter authored pool by world:
     import distance (biome relation + exotic) ≤ min(tier.max, condition.max)
     season match (or 'all-seasons')
     tier within dish's min/max
     cultural tags compatible with inn tier
     cost within economy ceiling
4. For each section (appetizer, main, dessert, drink):
     Determine count via (min + rng * range).
     For non-drink sections, per slot:
       Roll rng() < TUNING.authored_ratio → prefer authored this slot; else prefer procedural.
       Try the preferred source first; fall back to the other if empty.
         authored weights: native biome ×3.0, season match ×1.8, event boost ×1.7
                           (scaled by event_weight_mult), 'any' biome ×1.2,
                           regional import ×0.4, distant/exotic-effective import ×0.2,
                           peculiar (per Peculiar knobs), exotic-tag ×0.75,
                           peasant-under-war ×1.5, noble-at-roadside ×0.4,
                           specificity ×0.88^(extra biomes + extra seasons),
                           novelty ×0.92^(tag overlap with already-picked dishes).
         procedural: pick a template for the section, roll a prep from its pool
                     (weighted by current weather's prep_bias if any), fill slots
                     by role + affinity with ingredient weights.
     For drinks:
       Pull from ingredients with role=drink, weighted by world.
5. Compute prices:
     base = COST_BASE[cost]   (2, 6, 18, 55, 180 cp)
     import_mult = {0: 1.0, 1: 1.3, 2: 1.7}[biome_distance]
     price = base × tier.mult × economy.mult × condition.mult × event.mult × import_mult
6. Return menu { sections, event_note, condition_note }.
```

## Price rendering

1 gp = 10 sp = 100 cp.

- Drop zero denominations: `105 cp` renders as `1 gp 5 cp`, not `1 gp 0 sp 5 cp`.
- Items under 100 cp render as `X sp Y cp` or just `X cp`.
- At/above 100 cp, `gp` comes first.
- No decimals. Round to nearest copper.

## Procedural path

Lives in `data/dishes.json` as templates. Each template has a section, optional tier range, a `prep_pool`, slot definitions (role required), and a name template. Uses the ingredient pool (filtered by the same world rules, minus `peculiar`) and preparation compatibility to assemble plausible dish names.

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
| Change which tier serves which import distance | `max_import_distance` per entry in `modifiers.json` → `inn_tiers` |
| Change which condition still permits trade | `max_import_distance` per entry in `modifiers.json` → `conditions` |
| Reshape biome geography (move regions / 5×5 grid) | `modifiers.json` → `biome_relations` |
| Change biome labels or add a biome | `modifiers.json` → `biomes` (and add an entry in `biome_relations`; retag dishes/ingredients accordingly) |

Tags are case-sensitive lowercase hyphenated strings. The generator does exact-string matching; a typo in a tag silently makes a dish invisible.

## Smoke tests

Two Node-only scripts under `scripts/` exercise the corpus end-to-end. They share the same world sweep and seeded generator path; they answer different questions and have separate outputs.

### `scripts/smoke.js` — regression check

`npm run smoke`. Sweeps the Cartesian product of biome × season × weather × tier × economy × condition × event (skipping incompatible biome/weather/season combos), draws `SAMPLES` menus per world (default 5), and classifies every authored dish, ingredient, preparation, and template as `never` / `rare` / `normal` / `overused` against thresholds derived from a uniform-rate baseline.

- Output: `out/smoke-report.md` (overwritten each run) plus a dated copy in `out/history/`.
- Knobs: `SAMPLES=N`, `WORLDS=N` (cap world count, deterministic stride sample), `RARE_FACTOR=` (default 0.2), `OVER_FACTOR=` (default 5).
- Sanity assertions: every preparation appears, every template appears, ≥80% of authored dishes appear, total ingredient slots > 0.
- Anomaly section: lists never-appearing authored dishes whose static filters would have admitted them in some swept world (suggesting weighting suppression or eviction rather than filter exclusion).

When to run: after editing JSON data, to confirm nothing went unreachable and to diff the dated archives across a refactor.

### `scripts/smoke-deep.js` — editorial audit

`SAMPLES=2 node scripts/smoke-deep.js`. Same sweep, but instead of universe-wide histograms it cross-tabulates by world axis (biome, season, tier, condition, weather, event) and runs structural scans on the source data.

- Output: `out/smoke-deep.md` (overwritten each run; no archive — the structural scans are the point, and they are deterministic from the data).
- Per-axis blocks: top-5 ingredients, top-5 authored dishes, and the count of ingredients that never appear under that axis cell. Useful for "what dominates a Frostlands menu?" or "what shows up only at Noble inns?".
- Biome × tier table: top ingredient per (biome, tier) pair.
- Structural scans (C1–C12) include:
  - C1: dishes whose `biomes` field contains tokens that aren't real biomes or `any` (catches `mediterranean` / `nordic` mistakes — these are cuisine tags, not biomes).
  - C2: dishes whose only biomes are orphan tokens (no native biome at all; appear only as imports at fine+ inns).
  - C4: ingredients with non-biome biome-like tags only (treated as ambient — passes everywhere).
  - C5: ingredients no template + prep combination can pull (orphaned procedurally; only authored dishes name them).
  - C6: duplicate authored dish names.
  - C7: sparse (biome × season × section) cells with fewer than 2 native dishes.
  - C8: authored mains missing the `contains` field.
  - C9–C12: distribution counts (dishes per biome, drinks per biome, sections, tier buckets) for at-a-glance coverage gaps.

When to run: before an editorial pass, to find which biomes / sections / tiers need new content and which existing entries have data-shape bugs that the regression check wouldn't notice.

### Why two scripts

`smoke.js` answers "did I break the corpus?" — quantitative, threshold-based, archived for diffs. `smoke-deep.js` answers "what should I write next?" — descriptive, conditional, structural. Either one alone is incomplete; together they cover regression and curation. The shared sweep is duplicated by design — the two scripts are independent so a half-broken data file still lets the other run.

## Open questions for future versions

- **Thematic coherence.** Menus currently sample dishes independently. A coherence pass could bias toward "all-fish menu in a port town tonight" or "every dish uses saffron, the new caravan's boon."
- **Cook's signature.** A per-inn fingerprint seeded by inn name could make specific inns reliably produce certain dishes ("The Weeping Stag always has venison jelly when it's in season").
- **Dietary filtering.** Trivial with the current tag system — add `vegetarian`, `contains-pork`, etc. Not in v1.
- **LLM polish.** Optional `src/llm.js` sends the menu to Anthropic's API for atmospheric descriptions. Requires the user to paste their own API key; nothing is stored server-side.
