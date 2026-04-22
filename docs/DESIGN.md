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
| weather | `clear`, `rain`, `storm`, `snow`, `heatwave` |
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

## Events vs conditions

Two different concepts, deliberately separated.

**Events** are transient. Market Day, Harvest Festival, Noble Visit, Good Catch. They add color — an italic note at the top of the menu — and nudge weights (boost certain tags, slight price adjustments). They assume the world is functioning.

**Conditions** are durative and structural. War, Plague, Isolation, Siege. They gate entire categories of goods (no imports during war) and raise baseline prices (rationing). A condition note overrides the mood of the menu; an event decorates it. Both can coexist ("Market Day during the Plague" is a valid, grim scenario).

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
- **flavor** (optional) — a short description the optional LLM polish can use. Mostly used for dishes whose names don't fully explain themselves ("Hypocras" → "spiced wine").

### Imports

If a dish's native biome doesn't match the world AND the current condition permits imports AND the inn is fine or noble, it can appear as an import. Imports are labeled "(imported)" in the menu and carry a 1.5× price multiplier. Imports are always suppressed under war, plague, isolation, or siege.

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
         procedural: pick a template for the section, roll a prep from its pool,
                     fill slots by role + affinity with ingredient weights.
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
| Add a dish you wrote | `authored_dishes.json` |
| New ingredient (so procedural and drinks can use it) | `ingredients.json` |
| New condition (e.g. "fey-incursion") | `modifiers.json` → `conditions` |
| New transient event | `events.json` |
| Change inn-tier pricing | `modifiers.json` → `inn_tiers` |
| Change biome labels or add a biome | `modifiers.json` → `biomes` (and retag dishes/ingredients accordingly) |

Tags are case-sensitive lowercase hyphenated strings. The generator does exact-string matching; a typo in a tag silently makes a dish invisible.

## Open questions for future versions

- **Thematic coherence.** Menus currently sample dishes independently. A coherence pass could bias toward "all-fish menu in a port town tonight" or "every dish uses saffron, the new caravan's boon."
- **Cook's signature.** A per-inn fingerprint seeded by inn name could make specific inns reliably produce certain dishes ("The Weeping Stag always has venison jelly when it's in season").
- **Dietary filtering.** Trivial with the current tag system — add `vegetarian`, `contains-pork`, etc. Not in v1.
- **LLM polish.** Optional `src/llm.js` sends the menu to Anthropic's API for atmospheric descriptions. Requires the user to paste their own API key; nothing is stored server-side.
