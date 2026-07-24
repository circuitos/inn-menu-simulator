// scripts/lib/sweep.js
// Shared world-sweep helpers for the Node-side probe scripts. smoke.js and
// smoke-deep.js both walk the same Cartesian product of world axes and skip the
// same incompatible weather/biome/season combos; this is the one copy.
"use strict";

// Increment a Map counter.
function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }

// True if `weather` is allowed in the given biome/season per the
// modifiers.json weather_incompatibilities table.
function weatherCompatible(biome, season, weather, incompat) {
  const bad = incompat[weather];
  if (!bad) return true;
  if ((bad.biomes || []).includes(biome)) return false;
  if ((bad.seasons || []).includes(season)) return false;
  return true;
}

// Full Cartesian world sweep, skipping weather/biome/season-incompatible combos.
// Axis values are read from the data files so a new biome/condition/event flows
// in automatically. `opts.biomes` overrides the biome axis (defaults to every
// key in modifiers.biomes, which is the five top biomes).
function buildWorlds(data, opts = {}) {
  const biomes = opts.biomes || Object.keys(data.modifiers.biomes);
  const seasons = ["spring", "summer", "autumn", "winter"];
  const weathers = Object.keys(data.modifiers.weather);
  const tiers = Object.keys(data.modifiers.inn_tiers);
  const economies = Object.keys(data.modifiers.economy);
  const conditions = Object.keys(data.modifiers.conditions);
  const events = data.events.events.map(e => e.id);
  const incompat = data.modifiers.weather_incompatibilities || {};

  // REALISM=1 sweeps every world with Historical mode on, so both smoke
  // scripts can exercise the anachronism filters, fish days, and sumptuary
  // caps without a separate harness.
  const historical = process.env.REALISM === "1";

  const list = [];
  for (const biome of biomes)
    for (const season of seasons)
      for (const weather of weathers) {
        if (!weatherCompatible(biome, season, weather, incompat)) continue;
        for (const inn_tier of tiers)
          for (const economy of economies)
            for (const condition of conditions)
              for (const event of events)
                list.push({ biome, season, weather, inn_tier, economy, condition, event, historical });
      }
  return list;
}

module.exports = { bump, weatherCompatible, buildWorlds };
