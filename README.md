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

## Project layout

```
inn-menu-simulator/
├── index.html                  # the app
├── src/
│   ├── generator.js            # authored-first generation logic
│   ├── ui.js                   # form wiring + rendering
│   └── llm.js                  # optional flavor polish
├── data/
│   ├── authored_dishes.json    # hand-written dishes (primary pool)
│   ├── ingredients.json        # for procedural fallback and drinks
│   ├── preparations.json       # stew, roast, grill, etc.
│   ├── dishes.json             # procedural templates (fallback only)
│   ├── modifiers.json          # biomes, tiers, economy, conditions, weather
│   └── events.json             # transient events
├── docs/
│   ├── DESIGN.md               # architecture, tag taxonomy, decision log
│   └── SETUP.md                # GitHub + Pages walkthrough
├── LICENSE
└── README.md
```

## Contributing

The data files are the actual content. If you want to add ingredients, dishes, or events, edit the JSON. Schema is documented in `docs/DESIGN.md`.

Code is MIT licensed. Data files are CC-BY-SA 4.0 — fork and remix freely, credit appreciated.
