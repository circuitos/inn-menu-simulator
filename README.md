# Inn Menu Simulator

A system-agnostic fantasy RPG inn menu generator. Feed it a biome, a season, some weather, an inn tier, and an event or two — get back a plausible menu with D&D-style copper/silver/gold prices.

Data-first: the generator is a thin layer over JSON data files. Anyone can fork it, edit ingredients and dishes, and have their own regional cuisine in an afternoon.

## Quick start

Open `index.html` in a browser. That is the whole thing.

To host it live via GitHub Pages, see `docs/SETUP.md`.

## How it works

1. You set world parameters: biome, season, weather, inn tier, economy, condition (war, plague, etc.), optional event.
2. The generator filters an **authored pool** of ~100 hand-written dishes by those tags (no citrus at a sieged mountain inn; no aurochs ribs at a roadside ale-house).
3. It draws dishes using weighted random — native biome beats "any" beats import. Seasonal matches get boosted. Exotic trade goods appear only at fine/noble inns and never during war, plague, isolation, or siege.
4. If an authored dish can't fill a slot, the procedural engine assembles one from ingredients + preparations as a fallback. With the current pool, this rarely fires.
5. Prices compute from `cost × tier × economy × condition × event × (1.5 if imported)`, rendered in cp/sp/gp.
6. Optional "Polish with LLM" sends the raw menu to Anthropic's API (using a key you paste locally — never stored server-side) and returns flavor text.

## Flavor packs

The default content pool is system-agnostic — generic medieval-fantasy fare that should fit most settings. **Flavor packs** are optional opt-in overlays that add setting-specific named dishes (e.g. "Stokvis Bay cod" instead of "cod") on top of the generic pool. Each pack is a single JSON file under `data/flavor_packs/`, listed in `data/flavor_packs/index.json`. Toggle them on or off with the checkboxes under the Seed field — all default off.

The repo ships with **Mog**, the author's campaign setting. Leave it unchecked for a generic pool; check it to add Mog's regional cuisine. Forks can drop their own packs into `data/flavor_packs/` and add an entry to `index.json` — no code changes required. See `docs/DESIGN.md` for the pack schema.

## Project layout

```
inn-menu-simulator/
├── index.html                  # the app
├── src/
│   ├── generator.js            # authored-first generation logic
│   ├── ui.js                   # form wiring + rendering + pack merging
│   └── llm.js                  # optional flavor polish
├── data/
│   ├── authored_dishes.json    # hand-written generic dishes (primary pool)
│   ├── ingredients.json        # for procedural fallback and drinks
│   ├── preparations.json       # stew, roast, grill, etc.
│   ├── dishes.json             # procedural templates (fallback only)
│   ├── modifiers.json          # biomes, tiers, economy, conditions, weather
│   ├── events.json             # transient events
│   └── flavor_packs/           # optional setting-specific overlays
│       ├── index.json          # manifest of available packs
│       └── mog.json            # the Mog setting pack (off by default)
├── docs/
│   ├── DESIGN.md               # architecture, tag taxonomy, decision log
│   └── SETUP.md                # GitHub + Pages walkthrough
├── LICENSE
└── README.md
```

## Smoke testing the corpus

`npm run smoke` sweeps the Cartesian product of biome × season × weather × tier × economy × condition × event (skipping incompatible combos), generates several menus per world with distinct seeds, and writes a frequency report to `out/smoke-report.md`. The report flags authored dishes, ingredients, preparations, and templates that appear too often, too rarely, or never. Useful after editing JSON data to catch dishes that became unreachable, ingredients that no template can pull, or preparations that the weather bias is crowding out. Tune sample size with `SAMPLES=N npm run smoke` (default 5) or cap worlds with `WORLDS=N` for a quick check.

## Contributing

The data files are the actual content. If you want to add ingredients, dishes, or events, edit the JSON. Schema is documented in `docs/DESIGN.md`. For setting-specific contributions (named regional dishes, proper-noun ingredients), add a flavor pack instead of touching the generic pool — see the Flavor packs section above.

Code is MIT licensed. Data files are CC-BY-SA 4.0 — fork and remix freely, credit appreciated.
