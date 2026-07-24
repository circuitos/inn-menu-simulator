# Design Notes

Read this before editing data files or changing generation logic. It is the source of truth for how the generator thinks.

## Core principle

The authored pool sets the tone; the procedural engine widens the vocabulary.

A menu in a real medieval inn wasn't assembled from slots. A cook made specific dishes they knew how to make, and served whatever was in the larder that day. Hand-authored dishes (`data/authored_dishes.json`) are the primary pool: filtered by world state, drawn with weighted randomness. The procedural template system (`data/dishes.json` + `data/ingredients.json`) fills any remaining slots by assembling plausible dish names from ingredients and preparations, giving a much larger surface of permutations so repeated generations don't feel same-y.

How much procedural vs authored mixes into any given slot is controlled by `TUNING.authored_ratio` in `src/generator.js` (default `0.65`, roughly two authored for every one procedural, with fallback to the other pool when the preferred source is empty).

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
  peculiar_ingredient_base: 0.1,
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

These three together replace what would otherwise be per-dish "workhorse" flags. They derive their effect from the data shape (`biomes`/`seasons`/`tags` arrays, ingredient ids), so a contributor doesn't need to know which dishes are dominating: the engine notices breadth and repetition automatically.

| Knob | Default | What it does |
|------|--------:|--------------|
| `specificity_step` | 0.88 | Per "extra" biome or season on an authored dish, weight is multiplied by this factor. `["any"]` counts as 5 biomes; `["all-seasons"]` counts as 4 seasons. A 1-biome 1-season dish keeps full weight; a `["any"]` + `["all-seasons"]` dish takes ~0.32×. Lower this to push focused dishes harder; raise it (toward 1.0) to flatten the gradient. Replaces the old hard-coded `any+all-seasons → 0.7` rule. |
| `novelty_step` | 0.92 | Each tag the candidate carries that's already represented in the in-progress menu dampens weight by this factor (per overlap). State lives only inside one menu generation. It does not leak across menus, so determinism is preserved. Reads as "the kitchen varies its offerings"; no per-dish flag involved. |
| `ingredient_repeat_step` | 0.5 | Each prior pick of the same ingredient in the current menu shrinks the weight of the next pick by this factor. Stops one herb or root from headlining four dishes back-to-back. Set to 1.0 to disable. |

### Peculiar knobs

The procedural pool **no longer hard-filters** peculiar ingredients (rat, lichen, megaceront, fern ash, etc.). They pass the filter and ride a heavy weight dampener instead. Authored peculiar dishes are dampened on the same curve. Two reasons to do it this way: (1) the corpus has no other surface for these ingredients except authored dishes, which means even a dozen authored peculiar entries leave most of them invisible; (2) hardship conditions and a per-menu pity boost can lift them organically when the world calls for grim food.

| Knob | Default | What it does |
|------|--------:|--------------|
| `peculiar_authored_base` | 0.75 | Base multiplier on authored dishes tagged `peculiar`. Higher than the ingredient base because authored entries are pre-curated and intentional. |
| `peculiar_ingredient_base` | 0.1 | Base multiplier on procedural ingredients tagged `peculiar`. Very low; these surface rarely under normal play. |
| `peculiar_hardship_mult` | 2 | Multiplier applied on top of `peculiar_*_base` when the world is in war / plague / siege / isolation / famine. Lifts peculiar items toward plausibility because that's exactly the kitchen pulling rats and lichen out when the larder is bare. |
| `peculiar_pity_mult` | 2 | Multiplier applied while the in-progress menu has not yet committed any peculiar item (authored or ingredient). Once the first peculiar lands, this multiplier turns off for the rest of the menu, so peculiar surfaces somewhere but doesn't take over. |

Effective base weights, for reference:

| State | Authored peculiar | Procedural peculiar |
|-------|------------------:|--------------------:|
| Default, menu has peculiar already | 0.75 | 0.10 |
| Default, menu has none yet (pity) | 1.50 | 0.20 |
| Hardship, menu has peculiar already | 1.50 | 0.20 |
| Hardship, menu has none yet | 3.00 | 0.40 |

### Tier-fit knobs

These shape the procedural ingredient pool so low-tier inns lean rustic and high-tier inns lean refined.

| Knob | Default | What it does |
|------|--------:|--------------|
| `peasant_low_tier_boost` | 1.5 | At roadside / common (`tierIdx ≤ 2`), ingredients tagged `peasant` get this multiplier. Was 2.0; relaxed to 1.5 so roadside menus draw from a wider eligible pool instead of collapsing onto the same handful of peasant staples. |
| `refined_low_tier_dampener` | 0.5 | At roadside / common, ingredients tagged `refined` (and not `common`) get this multiplier. Keeps a roadside inn from accidentally serving artichokes and saffron just because they passed the cultural-tag gate. |
| `peasant_high_tier_dampener` | 0.7 | At fine / noble (`tierIdx ≥ 3`), ingredients tagged `peasant` (and not `common`) get this multiplier. Pure-peasant items don't fit a noble inn's table even if technically allowed. |

### Per-menu state

`specificity_step`, `novelty_step`, `ingredient_repeat_step`, and the peculiar pity boost all consult a `menuState` object that lives only inside one `generateMenu` call. After each authored dish is committed, its tags accumulate in `menuState.authoredFamiliarity`; after each procedural slot is filled, the picked ingredient accumulates in `menuState.ingredientUsage`; whenever a peculiar item lands, `menuState.hasPeculiar` flips. The state is discarded at the end of generation, so determinism on the same `(world, seed)` pair is preserved: re-running yields the same menu.

### When to retune

- Smoke run shows an authored dish at >5× uniform expected rate: lower `specificity_step` (more aggressive per-extra-biome dampening) or write more native dishes for the biomes / seasons it's invading.
- Smoke run shows the same ingredient as top-1 across many axis slices: lower `ingredient_repeat_step` and (if it's an herb or staple) re-check its biome and season tags.
- Peculiar ingredients still never appear: raise `peculiar_ingredient_base` further (it already sits at 0.1), or write authored dishes that name them.
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
| Heartland | Temperate plains and forest | Grain, pork, game, orchard fruit: the "default" medieval palette |
| Highland | Cold mountain | Mutton, dairy, roots, smoked meats, chestnut |
| Arid | Hot, dry (Mediterranean → semi-desert) | Olive, legume, goat, warming spices, citrus |
| Frostlands | Arctic and subarctic | Seal, reindeer, fermented dairy, preserved fish, rye |

Sub-biome nuance (`forest`, `river`, `lake`, `subterranean`) exists only as **tags on ingredients and dishes**, biasing availability rather than gating it. There is no "forest highland" selector; if a dish needs forest mushrooms, it carries a `forest` tag and the weighting handles the rest.

## Weather

Weather is a four-option world dial (`clear`, `rain`, `snow`, `heatwave`) that biases the procedural ingredient pool and (under rain) the cooking method pool. Authored dishes are **not** weather-filtered; the weather effect rides on the procedural side, which is roughly 20–50% of any given menu depending on tier and `authored_ratio`.

The schema lives in `modifiers.json → weather`. Each entry can carry any of these optional fields:

| Field | Meaning |
|-------|---------|
| `drops_tags` | Tags that are **hard-removed** from the procedural ingredient pool. |
| `robust_mult` | Weight multiplier on ingredients tagged `weather-robust` (preserved/shelf-stable items). |
| `sensitive_mult` | Weight multiplier on ingredients tagged `weather-sensitive` *only when not in `drops_tags`*. Lets a weather "soft-dampen" fresh items rather than removing them. |
| `prep_bias` | Map of `prep id → multiplier` used to weight the procedural prep selection (default for missing keys is 1.0). |

A weather with none of these fields (e.g. `clear`) is a true no-op: the pool and weighting behave as if no weather were set.

### What each weather does

| Weather | Behavior |
|---------|----------|
| **Clear** | No filtering, no weighting. Baseline. |
| **Rain** | Soft tilt: no ingredients dropped. `weather-sensitive` items are weighted ×0.5; `weather-robust` items ×1.6. The `prep_bias` favors `stewed`, `braised`, `smoked` and dampens `roasted`, `grilled`, `baked`, `pan-fried`: the kitchen pulls food indoors and reaches for the cauldron. |
| **Snow** | Drops `weather-sensitive` (greens, fruits, fresh fish, fresh organ meats; harvest and trade routes are disrupted). Boosts `weather-robust` ×1.2. Fresh dairy survives: cold preserves it (see split tag below). |
| **Heatwave** | Drops `weather-sensitive` *and* `heat-sensitive` (the latter covers fresh dairy and similar perishables that spoil in heat). Boosts `weather-robust` ×1.2. |

### Two sensitivity tags, not one

Ingredients carry one of:

- `weather-sensitive`: crops, fresh fish, offal. Drops in **snow** (harvest disrupted) and **heatwave** (spoils, wilts).
- `heat-sensitive`: fresh dairy and similar perishables that don't suit heat but are fine in cold. Drops in **heatwave** only; survives **snow**.
- `weather-robust`: preserved/shelf-stable (breads, dried legumes, root vegetables, salted meats, hard cheese). Boosted under any harsh weather.

This split is the reason fresh butter, milk, cream, sheep's milk, mare's milk, soft ripened cheese, and fresh curds appear on a snow menu but not on a heatwave menu. Edit the tag on an ingredient to change which weathers it survives.

### Compatibility with biome and season

Some weathers don't make sense in some biomes or seasons. The rules live next to the weathers in `modifiers.json → weather_incompatibilities`:

| Weather | Incompatible biome | Incompatible season |
|---------|--------------------|---------------------|
| Snow | Arid | Summer |
| Heatwave | Frostlands | Winter |

The UI enforces this at the dropdown layer: the offending weather options are disabled when the user picks an incompatible biome or season, and the Randomize button only picks from the still-allowed set. The generator itself never sees an invalid combo from the UI; if a stored seed or external caller passes one, `resolveWorld` falls back to `clear` rather than throwing.

To add a new incompatibility, append to the appropriate weather's `biomes` or `seasons` array. To soften the rule (e.g. allow snow in arid as a one-off curiosity), remove the entry; no code change needed.

### Authoring guidance

- A new weather is data-only: add an entry to `modifiers.json → weather`, give it whatever combination of `drops_tags` / `robust_mult` / `sensitive_mult` / `prep_bias` fits, add it to `WEATHER_ORDER` in `src/ui.js` so it appears in the dropdown, and (optionally) declare incompatibilities. No generator changes required.
- Tag balance matters: roughly half the ingredient pool is tagged `weather-robust`, ~30% `weather-sensitive`. Aggressive `sensitive_mult` (e.g. ×0.1) on a common weather will visibly thin menus; a value around ×0.5 reads as "noticeable but not dramatic." See the smoke-test methodology in commit history if you want to retune.
- Prep bias only affects procedural dishes whose templates list more than one prep option. Drinks, raw plates, and templates with a single prep are unaffected.

## Events vs conditions

Two different concepts, deliberately separated.

**Events** are transient. Market Day, Harvest Festival, Noble Visit, Good Catch. They add color (an italic note at the top of the menu) and nudge weights (boost certain tags, slight price adjustments). They assume the world is functioning.

Events are mostly boost-only, with one hard gate: an event may carry `suppress_contains` (array of `"meat"` / `"fish"`), which removes authored dishes whose `contains` matches and drops matching proteins from the procedural pool. Religious Fast uses it (`["meat"]`) so its "No meat tonight" note is enforced, not just implied. Suppression keys off `contains`, so every authored dish carrying meat or fish must declare it; both mains and non-mains are now tagged and guarded by smoke (`mainsMissingContains` + `nonMainMeatMissingContains`). Remaining gap: opt-in flavor packs (mog, osr-bestiary) are outside that guard, and eggs/dairy are not declared on authored dishes (Lent-strict suppression reaches only the procedural pool).

**Conditions** are durative and structural. War, Plague, Isolation, Siege. They gate entire categories of goods (no imports during war) and raise baseline prices (rationing). A condition note overrides the mood of the menu; an event decorates it. Both can coexist ("Market Day during the Plague" is a valid, grim scenario).

## Condition-based menu caps

Material conditions don't just nudge prices: they shrink the menu. The cap system in `src/generator.js` enforces tier-specific upper bounds on each section, and tightens those bounds further when the world is in extreme scarcity.

### Base caps (per tier)

When no plentiful event is active, every menu is clamped to a per-tier cap:

| Tier | Starters | Meat main | Fish main | Meatless main | Drinks |
|------|----------|-----------|-----------|---------------|--------|
| Roadside | 2 | combined: 1 (meat OR fish) | n/a | 2 | 2 |
| Common | 3 | 1 | 1 | 2 | 3 |
| Fine | 4 | 2 | 2 | 2 | 4 |
| Noble | 4 | 2 | 2 | 2 | 5 |

Roadside uses a single combined "meat or fish" cap because at the lowest tier the distinction blurs: you get whatever the cook has. The other tiers split meat and fish so a Common inn can serve one of each.

The caps are *upper* bounds. The section's existing `count_min/count_max` (in `modifiers.json`) still rolls a target inside its range; the final count is `min(rolled, sum-of-caps)`. Under no scarcity, Fine and Noble caps are sized to match `count_max`, so behavior is unchanged from peace-time.

### Plentiful events bypass caps

If the active event is one of `harvest-festival`, `market-day`, `noble-visit`, `hunting-return`, `fishing-good`, **all caps are skipped** for that menu. The cook splurges. This is the scaffolding's escape hatch: when the narrative justifies abundance, the math gets out of the way.

The list of plentiful events lives in `PLENTIFUL_EVENTS` at the top of `src/generator.js`.

### Extreme scarcity reductions

Two world-state flags count as "extreme scarcity":

- `economy === "famine"`
- `condition` ∈ `{plague, isolation, siege}` (war is intentionally **not** counted: it disrupts trade but doesn't necessarily empty the larder)

The number of these active at once (0, 1, or 2) is the **scarcity hits**. Each hit subtracts 1 from every numeric cap. So a Common inn under famine + plague (2 hits) drops to 1 starter / 0 meat / 0 fish / 0 meatless / 1 drink, except for the floor.

### Floors

- Every section renders **at least 1 dish**. After scarcity subtraction, each section's effective total is floored at 1.
- For mains specifically, if all meat/fish/meatless caps reduce to 0, the meatless cap is forced to 1, and the generator falls back to a meatless dish (preferring authored meatless mains, then procedural meatless templates, then any procedural main as a last resort).

### Severe-scarcity tier downgrade

At **2 scarcity hits**, even Fine and Noble kitchens lose access to their gilded options. The inn's `allowed_tags` is rewritten:

- `noble` and `exotic` are stripped out
- `peasant` and `common` are added in

For a Noble inn under famine + siege, that means `["common","refined","noble","exotic"]` becomes `["peasant","common","refined"]`: the kitchen serves whatever's still in the cellar (ale, kvass, pottage), regardless of how rich the inn normally is. The price multipliers from condition + economy still apply, so even the plain food carries a markup. The condition's `max_import_distance: 0` also clamps imports out independently.

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

- **biomes**: array of biome IDs OR `"any"`. A dish with `["coastal"]` is native to coastal; a dish with `["any"]` works anywhere (cheese fritters, pickled vegetables).
- **seasons**: array of seasons OR `"all-seasons"`. "Roast pork" is autumn/winter; "pickled cucumber salad" is summer/autumn; "cheese fritters" is all-seasons.
- **tier_min / tier_max**: inn-tier range. A `tier_min: 3` dish only appears at fine or noble inns. A `tier_max: 2` caps it at common or roadside. Defaults: no min, no max.
- **cost**: 1 to 5. Drives base price. Scales through tier/economy/condition/event multipliers.
- **tags**: cultural (`peasant`, `common`, `refined`, `noble`), origin (`exotic`), cuisine (`mediterranean`, `nordic`), and flags (`peculiar`). The `exotic` tag means "no fixed origin, off-map trade good" (saffron, sugar, hothouse spices) and is treated as effective import distance 2 (see Imports below). The `peculiar` tag marks weird local items (rat, lamprey, seal); it dampens weight but doesn't gate.
- **contains** (optional): `"meat"` or `"fish"`. On mains it also drives the per-kind cap loop (omit it and the dish joins the meatless bucket the cap system treats as the safe fallback under scarcity; see the Condition-based menu caps section). On every section it drives Religious Fast suppression and the fish-day boost, so any dish carrying meat or fish flesh must declare it. Rendered cooking fats and other byproducts (lard, tallow, eggs, dairy) count as meatless and are not gated; animal tissue eaten as the dish itself (flesh, offal, blood, blubber, marrow) is `"meat"`. Coverage is enforced by smoke: `mainsMissingContains` for mains, `nonMainMeatMissingContains` for the rest (a lard-cooked dish left untagged is flagged until a `_comment` marks the meatless-by-convention call deliberate).
- **flavor** (optional): a short description shown under the dish (and reused by the optional LLM polish). Mostly used for dishes whose names don't fully explain themselves ("Hypocras" → "spiced wine").
- **name_import** (optional): an alternate display name used when the dish is served as an **import** (its home biome isn't the world's biome). The arid scholarly-pass dishes lead with their local name at home (`Sikbaj, lamb braised in vinegar and dates`) but fall back to this plain description when they travel (`Lamb braised in vinegar and date syrup (from the desert)`), so a dish reads as native at home and foreign abroad. Chosen in `buildAuthoredMenuDish` off `_importDistance`; a dish native to two biomes keeps its local name in both.
- **weight** (optional, default 1): a flat multiplier on the dish's selection weight, applied first in `weightAuthored` before every other factor. Use it to foreground a curated set without bending the tag/tier rules. The arid scholarly-pass dishes carry `2`, which lifts them from ~66% to ~76% of committed arid dishes so the biome reads as distinctly its own; the older, more generic arid entries stay in as the minority. (Those dishes also lead with their historical name, e.g. `Sikbaj, lamb braised in vinegar and dates`, so the character shows on the menu; the weight only sets how often.) Prefer tags/tiers/seasons for ordinary tuning and reach for `weight` only to promote a deliberate group.

### Imports

Imports are modeled as **trade distance** between the dish's native biome and the world's biome. Three concepts decide whether a non-native dish can appear:

| Distance | Source | Label | Price multiplier |
|----------|--------|-------|------------------|
| 0 | Native to the world's biome (or `biomes: ["any"]`) | none | ×1.0 |
| 1 | The dish's biome is a **regional** neighbor of the world's biome | `(from the coast)` | ×1.3 |
| 2 | The dish's biome is a **distant** neighbor | `(rare desert delicacy)` | ×1.7 |

Labels name the origin biome: regional imports use its `import_phrase` field ("the coast", "the desert", ...), distant ones its `import_adjective` ("coastal", "desert", ...), both in `modifiers.json → biomes`. When no origin resolves (off-map `exotic` goods, or a custom biome missing the fields), the generic `(imported)` / `(rare import)` labels are used instead.

The distance matrix lives in `modifiers.json → biome_relations`. It's symmetric and per-biome, for the default 5-biome map:

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

So fine inns serve regional imports but not rare ones; noble inns serve everything. War cuts off rare imports but caravans still bring regional goods. Plague/siege/isolation seal the gates entirely: only native items remain.

**The `exotic` tag** is the off-map trade-good signal: saffron, sugar, hothouse spices, true rarities with no biome on the map. It bumps effective filtering distance to 2 regardless of biome (a heartland-native dish tagged `exotic` still requires noble + peace), but pricing uses biome distance only: a native exotic doesn't pay transport markup, since the rarity is already priced into its `cost` field.

When a DM wants to reshape geography (move regions, add a sixth biome, or carve up a 5×5 grid), edit `biome_relations`. The generator never sees coordinates: only the distance table. Symmetry isn't enforced by the code, but breaking it produces strange one-way trade lanes; keep entries reciprocal unless you mean it.

## Historical mode

Opt-in checkbox (rendered with the flavor packs; off by default). Biases generation toward a broadly 14th-16th century Western European frame. Fantasy mode is bit-identical whether or not the feature exists: every mechanism below activates only when `world.historical` is true. The `REALISM` block at the top of `src/generator.js` (next to `TUNING`) holds every knob.

What the mode does:

- **Anachronism filtering.** Ingredients and dishes tagged `new-world` (potato, tomato, maize, squash, turkey...) or `post-medieval` (distilled spirits, stout) drop from both pools. `post-medieval-west` (the pickled-vegetable dishes) drops everywhere EXCEPT the arid biome: vinegar pickles are period in the medieval Islamic world, and the food-historian verdict behind the tag was explicitly Western. The `pickled` prep also refuses vegetable-role ingredients outside arid. These three are **annotation tags**: `META_TAGS` keeps them out of the per-menu novelty ledger so tagging an entry never shifts fantasy-mode output.
- **Fish days.** Rolled per generation at 195/365 on a dedicated seed stream (`seed + "|fishday"`), suppressing meat via the same `suppress_contains` path Religious Fast uses; a nested roll (`lent_share`) makes some days Lent-strict, which also drops eggs and dairy from the procedural pool. Arid skips the roll entirely (Christian-calendar logic). Selecting Religious Fast manually under Historical forces the strict variant. The menu carries a `calendar_note`.
- **Sumptuary caps.** `REALISM.tier_caps` replaces `TIER_CAPS`, tightened in the spirit of the 1363 English statutes.
- **Assize price stability.** Staple drinks (cost ≤ `staple_cost_max`) keep only `staple_swing` of the economy and event price movement. Condition multipliers still apply in full: sieges broke every assize.
- **Content layer.** The hidden `historical` flavor pack (`data/flavor_packs/historical.json`, `hidden: true` in the manifest) adds period items (verjuice, stockfish, perry, metheglin, wafers, gastels, pottages, mortrews, umbles, galantyne, eel pie) and renames via `ingredient_overrides` (white carrots, lingonberries, small ale). The checkbox activates it; it never appears in the pack list.
- **UI.** Checking Historical stores, unchecks, and disables the fantasy setting packs (mutually exclusive world claims), restoring them on uncheck. A modal (first activation, and via the "what does this do?" link) states the mode's claims and limits. The LLM polish prompt is told to stay period-plausible when the mode is on.

Testing: both smoke scripts accept `REALISM=1`, which flips every swept world to historical AND merges the historical pack node-side (`applyPacks` in `scripts/lib/loader.js`). `node scripts/historical-coverage.js` reports how much of each biome's pool the mode removes; a biome losing much more than the current 4-6% of dishes signals the pack needs period additions there.

Known gaps, deliberate for v1:

- `suppress_contains` keys off the `contains` field. Authored dishes now declare it across all sections (guarded by `nonMainMeatMissingContains` / smoke-deep C8b), so the core menu no longer serves untagged meat on a fast night. Opt-in flavor packs (mog, osr-bestiary) are outside that guard and may still carry untagged meat.
- Lent-strict egg/dairy suppression reaches only the procedural pool; authored dishes don't declare dairy or eggs.
- The arid biome's historical layer, once thin, is now drawn from the medieval Islamic culinary corpus: 51 sourced dishes (caravanserai and cookshop fare, mukhallalat pickles, non-alcoholic syrup drinks) with per-dish provenance in [`SOURCES.md`](SOURCES.md). The mode's northwest-European core is still its deepest layer.
- Research round pending, price model: 16th-century French price statutes set itemized per-dish prices, displayed at the door, and could ground per-dish pricing the way the assize grounds bread and ale. Reading list under "Pending reading" in [`SOURCES.md`](SOURCES.md).

## Flavor packs

The generic pool aims to be system-agnostic: recognizable medieval-fantasy fare that fits most worlds. Setting-specific named dishes (proper nouns, regional cuisines, in-fiction beverages) live in **flavor packs** instead, so other DMs forking the project don't inherit one author's setting.

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

- **`ingredient_overrides`**: replace a generic ingredient by id. Used to rename `red-wine` → `Briggan wine` without forking the whole entry. Other fields on the override are merged onto the generic record.
- **`ingredients`**: net-new ingredients only the pack introduces (e.g. a fish that doesn't exist in the generic pool). Same schema as `data/ingredients.json` entries.
- **`dishes`**: net-new authored dishes. Same schema as `data/authored_dishes.json` entries. Filter rules (biome, season, tier, condition, imports) apply identically.

### Loading and merging

`src/ui.js → loadFlavorPacks()` reads the manifest at startup; `applyFlavorPacks(base, activeIds)` produces a new data object on each generate by:

1. Concatenating each active pack's `dishes` onto `authored_dishes.dishes`.
2. Concatenating each active pack's `ingredients` onto `ingredients.ingredients`.
3. Replacing generic ingredient entries by id where `ingredient_overrides` apply.

The generator (`src/generator.js`) is unaware of packs: it sees a single merged data object. All filtering, weighting, and pricing rules apply unchanged.

### Toggling a pack reshuffles the whole menu

A consequence of the "merge, don't filter" approach: turning a pack on or off changes the **input** the seeded generator draws from, not just which dishes are eligible at render time. Even on the same seed, slots that don't end up picking a pack dish can still flip to a different generic dish, because weighted random selection over a larger pool lands on different items for the same RNG draw. This is expected, not a bug: packs are first-class participants in selection, not a post-hoc overlay. If you want a pack toggle to leave the rest of the menu untouched, you'd need a different architecture (e.g. reserving slots for pack dishes, or filtering at render time), which is out of scope for v1.

### No deduplication

Generic dishes and pack dishes can share themes ("cod in buttermilk" generic vs. "Stokvis Bay cod in sour buttermilk" Mog) without the generator caring. They are distinct ids; both can appear in the same menu when the pack is active. If a generic twin feels redundant against a pack version, prune by hand; don't add code paths.

### Authoring a new pack

1. Create `data/flavor_packs/<your-id>.json` with the schema above.
2. Add an entry to `data/flavor_packs/index.json` with `{ "id", "label", "file", "description", "default_active": false }`.
3. Reload the page. Your pack appears as a checkbox under the Seed field.

Packs are pure data: no JS changes needed for new packs.

### Peculiar dishes and ingredients

Dishes and ingredients like rat skewer, seal tail, albatross pie, basking shark, lichen, fern ash, mole, lamprey carry the `peculiar` tag. They surface on a curve rather than as a fixed dampener; see the **Peculiar knobs** subsection under Tuning knobs. Briefly:

- Both authored peculiar dishes and procedural peculiar ingredients pass the world filters (no hard exclusion).
- They're heavily dampened by default (`peculiar_authored_base = 0.75`, `peculiar_ingredient_base = 0.05`).
- A per-menu **pity boost** (`peculiar_pity_mult = 2`) doubles the weight while the menu has no peculiar item yet, so one peculiar entry usually lands per menu when one's available; once it does, subsequent peculiar candidates revert to the base dampener.
- **Hardship** (`condition` ∈ war/plague/siege/isolation, or `economy === "famine"`) doubles the base again (`peculiar_hardship_mult = 2`): the desperate-larder scenario where rats, lichen, and fermented blood are exactly what the kitchen serves.

(`peculiar` is the local-weird signal; for off-map rare-trade goods like saffron or megaceront ribs, see `exotic` in the Imports section. Note that megaceront ribs are tagged both: they're a peculiar local meat that also reads as exotic from any non-Frostlands inn.)

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
         authored weights: per-dish weight ×(d.weight||1), native biome ×3.0,
                           season match ×1.8, event boost ×1.7
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

## Inn names

The name in the menu header (`The White Hart Great Inn`) comes from `src/innname.js`, a thin generator over `data/inn_names.json`. It models the structural syntax of medieval and Renaissance English tavern signs: a name is a **charge** (the device painted on the sign) optionally dressed with a color, a number, a heraldic posture, a second charge, a location phrase, or a figure's body part, or one of two people-shaped forms: a creature's haunt (`The Fox's Den`) or guild and royal arms (`The Miller's Arms`, `The King's Arms`). `generate(world, seed, data)` returns `{ name, sign, designator }`; the header shows `name` and hangs `sign` (the substantive element, i.e. what the board depicts) off the `<h2>` as a tooltip.

### Determinism

The name is seeded on `seed + biome + inn_tier`, so it is stable for a given inn but reshapes when the world changes: a coastal noble inn reliably draws anchors and ships, an arid one draws suns and serpents. This is a deliberate change from the old seed-only hash; changing the biome or tier dropdown now re-signs the inn.

### Patterns

`patterns` weights the recombinatory templates (weights are relative, not percentages):

| Pattern | Example | Weight | Tiers |
|---|---|---|---|
| `single` | The Bell | 56 | all |
| `color` | The White Hart | 16 | all |
| `number` | The Three Tuns, The Two Palms | 8 | all |
| `possessive` | The Fox's Den, The Drover's Rest, The Qadi's Rest | 8 | roadside, common |
| `waypoint` | The Last Shade, The Ninth Milestone | 5 | roadside, common |
| `arms` | The Miller's Arms, The King's Arms | 6 | common, fine, noble |
| `pair` | The Rose and Crown | 5 | all |
| `on_object` | The George on Horseback | 3 | all |
| `body_part` | The Nomad's Head | 2 | all |
| `genitive` | The Khan of the Two Palms, The Caravanserai of the Spicers | 0 (arid 30) | common, fine, noble |

A pattern that the current world can't satisfy (e.g. `pair` when the biome/tier pool has fewer than two charges) is dropped and its weight redistributed, so every world resolves to a name. A pattern with a `tiers` list additionally only fires at those tiers: `possessive` is a low-tier, plainspoken register, while guild and royal `arms` carry prestige. A `possessive` name is a complete establishment (`The Fox's Den`, `The Qadi's Rest`), so it never takes an appended designator.

**Genitive (`genitive`)** inverts the English-signboard syntax: the building word becomes the *head* of the name, followed by a genitive attribute drawn from a charge (`The Khan of the Two Palms`), a trade pluralized (`The Caravanserai of the Spicers`), or a figure (`The Funduq of the Vizier`). It exists for the arid pool, whose real naming grammar is genitive and personal (khans named for a commodity, guild, patron, or feature), not heraldic. Its global weight is 0; only the per-biome table below turns it on. The evidence behind the grammar shift (dish-naming in the source cookbooks, the khan/funduq naming record) is in [`SOURCES.md`](SOURCES.md).

**Per-biome pattern weights.** `pattern_biome_weights` overrides the global weight of any pattern for a given biome; an unlisted pattern keeps its global weight, and a resolved weight of 0 removes the pattern there. Arid uses this to lead with `genitive`, lean on `waypoint` and `possessive` (caravan-route and patron naming), damp the heraldic `color`/`single` register, and drop `on_object` entirely. This is how one biome re-shapes the whole grammar rather than only swapping its vocabulary.

### Biome and tier gating

Each charge, figure, and trade carries `biomes` (concrete members of this project's five biomes) and `tiers` (`roadside`/`common`/`fine`/`noble`). The charge pool is filtered to the world's biome and tier; if biome filtering empties the pool it falls back to the tier-eligible set, then to all charges, so a name always resolves. Figures (`King`, `Nomad`, ...) and trades (`Miller`, `Shipwright`, ...) are filtered **strictly** by biome and tier so royalty stays out of roadside alehouses, the Nomad's Head stays in the desert, and a Furrier's Arms hangs only in the frostlands. `designators` maps each tier to a weighted list of building words (`Alehouse`/`Brewhouse` low, `Inn`/`Tavern` mid, `Great Inn`/`Hospitium` high).

**Biome-keyed designators.** `designators` may nest a biome key whose value is its own tier map; the lookup tries `designators[biome][tier]` first and falls back to the flat `designators[tier]`. Biome names never collide with tier names, so the flat lookup stays unambiguous. Arid overrides all four tiers with its own institution ladder (`Cookshop`/`Wayhouse`/`Rest`/`Khan` roadside, up through `Great Caravanserai`/`Royal Khan` noble), so the tier still reads but through the institution rather than the English building word. The genitive pattern draws its head word from this same table. `Cookshop` at roadside is directly supported by the harisa cookshop evidence and pairs with the tier caps on the arid street food; `Khan` and `Funduq` are the judgment call between flavor and obscurity, with `Rest-house` as the translated fallback if `Funduq` reads too opaque in playtests.

A `number` entry may carry a `biomes` list so a count stays regional: `Two` (`The Two Palms`) is arid-only, while `Three` carries the rest everywhere.

**Keep each biome stocked to the top tier.** Two failure modes make names feel predictable, and both come from thin pools, not from the pattern engine (`single` and `color`, ~82% of names, pick uniformly from the pool, so pool composition *is* the distribution):

- A charge that fits every biome (an old `any` tag, or a device listed under all five) sits in every pool and so appears several times as often as a biome-native one. Give each charge the one or two biomes it actually belongs to; use a second biome only as deliberate connective tissue (e.g. `Bear` in highland and frostlands). For a device that legitimately spans two biomes at every tier, add a `weight` below 1 (default 1; the two-biome all-tier natives such as `Bear`, `Raven`, `Boar` run at 0.4 to 0.6) so it stops dominating the sweep. `weight` also works on figures (`King` and `Queen` are damped so the royal arms and heads do not crowd out the guilds).
- If a biome's native charges are all locked below `noble`, its high-tier pool collapses onto whatever *is* noble-eligible, and every grand inn in that biome ends up drawing from the same few devices. Most charges should span all tiers; reserve tier locks for genuinely elite devices (`Griffin`, `Dragon`, `Phoenix`, `Sphinx`, `Wyvern`, `Pelican`) or genuinely humble ones (`Plough`, `Tun`, `Barge`, `Scorpion`). Tier prestige still reads through the designator, the posture, and those elite charges, so the common devices can stay available everywhere without muddying the tiers.

A quick check: `require('src/innname.js')`, generate a few thousand names for `<biome>/noble`, and confirm the top charges are that biome's own, not a shared set that also tops another biome's noble list.

### Coherence constraints

- **Body parts**: figures show a `Head` or `Hand`; horned animals a `Head` or `Horn`; other animals a `Head` only. Allowed parts live in each entry's `parts` list.
- **Numbers**: `Three` carries almost every numbered sign. `Seven` and `Four` are locked to a specific charge (`Seven Stars`, `Four Birds`) via `requires_charge`, and only fire when that charge is reachable at the world's tier; otherwise the sign falls back to `Three <charge>`.
- **Postures** (`Ramping`, `Spread`, `Flying`, ...) attach only at `fine`/`noble` tiers, only to charges that list them, and only `posture_chance` of the time.
- **Haunts**: the `possessive` pattern draws only from entries with a `haunts` list, and the haunt must fit the subject: birds get `Perch`/`Nest`, den animals `Den`, climbers `Leap`, beasts of burden, trades, and figures `Rest`. Figures with a `haunts` list join the pool so a patron-genitive reads in English clothing (`The Qadi's Rest`). The board shows the subject (the charge's or trade's `sign`, or the figure's lowercased name); the haunt lives in the name only.
- **Genitive attribute**: the `genitive` pattern's attribute is a charge (`the [plural]`, optionally counted), a trade (`the [plural]`, its `arms_sign` or `sign` on the board), or a figure (`the [Name]`). The head designator comes from the biome's designator table and is not appended a second time.
- **Arms**: the `arms` pattern draws from trades with an `arms_sign` (a blazon-flavored shield description), plus royal figures at `fine`/`noble` only, so `The King's Arms` stays a high-tier sign while `The Brewer's Arms` can hang in a market town.
- **Riders**: an object marked `subjects: "figures"` (`on Horseback`) takes a figure, never a charge; the world gets `The Jarl on Horseback`, not `The Camel on Horseback`.
- **Waypoints**: the `waypoint` pattern names an inn by its position on a route: an ordinal from `ordinals` (weighted toward `Last`) plus a biome-tagged stop from `waypoints` (`The Last Shade`, `The Third Well`, `The Ninth Milestone`). Waypoints filter strictly by biome and tier, and the hoop suffix never attaches (a waypoint is already a place).

### Tuning

The `tuning` block holds the flair probabilities: `designator_chance` (append a building word), `archaic_color_chance` (use `Alba`/`Redd`/`Blake`/`Gilt` instead of `White`/`Red`/`Black`/`Golden`), `posture_chance`, `hoop_suffix_chance` (the archaic "on the Hoop" suffix), and `genitive_number_chance` (how often the genitive pattern counts its charge, as in `The Khan of the Two Palms`).

### Adding a charge

Keep the vocabulary **setting-agnostic**: no terms tied to a real-world religion, people, or place. Prefer `Guardian` over `Angel`, `Nomad` over `Saracen`, `Temple` over `Mitre`, `Prelate` over `Pope`. The shared fantasy bestiary (`Griffin`, `Sphinx`, `Phoenix`) and generic ruler titles (`King`, `Sultan`, `Jarl`) are fine; a name a player would place on an Earth map is not.

Append to `charges` with a `name`, a `plural`, and a **bare, color-neutral `sign`** noun phrase (no leading article: `innname.js` adds the article and injects the chosen color, so don't bake a tincture into a `color: true` charge). Tag `biomes`, `tiers`, and `flavor`, set `color`, and optionally add `postures`, `parts`, `haunts`, and a `weight` below 1 to damp an over-familiar device. A new trade goes in `trades` with `biomes`, `tiers`, and an `arms_sign` (for the arms pattern), a `sign` plus `haunts` (for the possessive pattern), or both. A new route stop goes in `waypoints` with a `word`, a `sign`, `biomes`, and `tiers`. There is no smoke script for names; sanity-check by loading the app across biome/tier combinations, or require `src/innname.js` in Node and call `generate` directly.

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
| Change biome labels or add a biome | `modifiers.json` → `biomes` (set `label`, `import_phrase`, `import_adjective`; add an entry in `biome_relations`; retag dishes/ingredients accordingly) |
| Add an inn-name charge, or retune name patterns / flair | `inn_names.json` (see [Inn names](#inn-names)) |
| Mark an ingredient or dish as anachronistic for Historical mode | add `new-world` / `post-medieval` / `post-medieval-west` to its `tags` |
| Add period content or renames for Historical mode | `data/flavor_packs/historical.json` |
| Tune fish-day odds, sumptuary caps, assize damping | `REALISM` block in `src/generator.js` |
| Make an event ban meat or fish outright | `suppress_contains` on the event in `events.json` |

Tags are case-sensitive lowercase hyphenated strings. The generator does exact-string matching; a typo in a tag silently makes a dish invisible.

## Smoke tests

Two Node-only scripts under `scripts/` exercise the corpus end-to-end. They share the same world sweep and seeded generator path; they answer different questions and have separate outputs.

### `scripts/smoke.js`: regression check

`npm run smoke`. Sweeps the Cartesian product of biome × season × weather × tier × economy × condition × event (skipping incompatible biome/weather/season combos), draws `SAMPLES` menus per world (default 5), and classifies every authored dish, ingredient, preparation, and template as `never` / `rare` / `normal` / `overused` against thresholds derived from a uniform-rate baseline.

- Output: `out/smoke-report.md` (overwritten each run) plus a dated copy in `out/history/`.
- Knobs: `SAMPLES=N`, `WORLDS=N` (cap world count, deterministic stride sample), `RARE_FACTOR=` (default 0.2), `OVER_FACTOR=` (default 5).
- Sanity assertions: every preparation appears, every template appears, ≥80% of authored dishes appear, total ingredient slots > 0.
- Anomaly section: lists never-appearing authored dishes whose static filters would have admitted them in some swept world (suggesting weighting suppression or eviction rather than filter exclusion).

When to run: after editing JSON data, to confirm nothing went unreachable and to diff the dated archives across a refactor.

### `scripts/smoke-deep.js`: editorial audit

`SAMPLES=2 node scripts/smoke-deep.js`. Same sweep, but instead of universe-wide histograms it cross-tabulates by world axis (biome, season, tier, condition, weather, event) and runs structural scans on the source data.

- Output: `out/smoke-deep.md` (overwritten each run; no archive: the structural scans are the point, and they are deterministic from the data).
- Per-axis blocks: top-5 ingredients, top-5 authored dishes, and the count of ingredients that never appear under that axis cell. Useful for "what dominates a Frostlands menu?" or "what shows up only at Noble inns?".
- Biome × tier table: top ingredient per (biome, tier) pair.
- Structural scans (C1–C12) include:
  - C1: dishes whose `biomes` field contains tokens that aren't real biomes or `any` (catches `mediterranean` / `nordic` mistakes; these are cuisine tags, not biomes).
  - C2: dishes whose only biomes are orphan tokens (no native biome at all; appear only as imports at fine+ inns).
  - C4: ingredients with non-biome biome-like tags only (treated as ambient, passes everywhere).
  - C5: ingredients no template + prep combination can pull (orphaned procedurally; only authored dishes name them).
  - C6: duplicate authored dish names.
  - C7: sparse (biome × season × section) cells with fewer than 2 native dishes.
  - C8: authored mains missing the `contains` field.
  - C8b: non-main authored dishes that read as meat (flesh word in name/flavor) but omit `contains`, so Religious Fast can't suppress them. Exempts dishes marked meatless/mock in `_comment`.
  - C9–C12: distribution counts (dishes per biome, drinks per biome, sections, tier buckets) for at-a-glance coverage gaps.

When to run: before an editorial pass, to find which biomes / sections / tiers need new content and which existing entries have data-shape bugs that the regression check wouldn't notice.

### Why two scripts

`smoke.js` answers "did I break the corpus?": quantitative, threshold-based, archived for diffs. `smoke-deep.js` answers "what should I write next?": descriptive, conditional, structural. Either one alone is incomplete; together they cover regression and curation. The shared sweep is duplicated by design: the two scripts are independent so a half-broken data file still lets the other run.

## Open questions for future versions

- **Thematic coherence.** Menus currently sample dishes independently. A coherence pass could bias toward "all-fish menu in a port town tonight" or "every dish uses saffron, the new caravan's boon."
- **Cook's signature.** A per-inn fingerprint seeded by inn name could make specific inns reliably produce certain dishes ("The Weeping Stag always has venison jelly when it's in season").
- **Dietary filtering.** Trivial with the current tag system: add `vegetarian`, `contains-pork`, etc. Not in v1.
- **LLM polish.** Optional `src/llm.js` sends the menu to a bring-your-own-key LLM provider (Anthropic, Google AI Studio, OpenAI, Kimi, DeepSeek, or Cerebras) for atmospheric descriptions. Providers other than Anthropic share one OpenAI-compatible request path; adding another is a new entry in the `PROVIDERS` registry. Reasoning-capable providers (`supportsEffort`) get an Effort selector in the sidebar (`reasoning_effort` low/medium/high, default low). Nothing is stored server-side.
