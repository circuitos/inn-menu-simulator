// innname.js: sign-based inn/tavern name generator.
//
// A thin layer over data/inn_names.json. Names follow the structural syntax of
// medieval and Renaissance English tavern signs: a charge (the device painted
// on the sign) optionally dressed with a color, a number, a heraldic posture,
// a second charge, a location phrase, or a figure's body part, plus two
// people-shaped forms: a creature's haunt (The Fox's Den) and guild or royal
// arms (The Miller's Arms, The King's Arms). The charge pool is filtered by
// the world's biome and inn tier, and the whole thing is deterministic for a
// given (seed, biome, tier) so the same inn keeps its name.
//
// See docs/DESIGN.md 'Inn names' for the model and tuning knobs. Public entry
// point is window.InnName.generate(world, seed, data). It returns
// { name, sign, designator }; callers use `name` and may show `sign` (the
// substantive element, i.e. what the board actually depicts) as a subtitle.

(function () {
  // Same FNV-1a + mulberry32 pair the menu generator uses, so name RNG behaves
  // like the rest of the app. Seeding on biome and tier as well as the seed
  // string means changing the world reshapes the name, not just the seed.
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeRng(seedStr) {
    let a = hashSeed(seedStr);
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr.length ? arr[Math.floor(rng() * arr.length)] : null; }
  function weightedPick(rng, items, weightFn) {
    const total = items.reduce((s, it) => s + Math.max(0, weightFn(it)), 0);
    if (total <= 0) return pick(rng, items);
    let r = rng() * total;
    for (const it of items) { r -= Math.max(0, weightFn(it)); if (r < 0) return it; }
    return items[items.length - 1];
  }

  // A charge/figure is reachable when its biome list names this biome (or "any")
  // and its tier list names this tier. Biome filtering falls back to the full
  // tier-eligible pool if a biome has too few charges, so every world resolves.
  function matchBiome(entry, biome) {
    const b = entry.biomes || ["any"];
    return b.includes(biome) || b.includes("any");
  }
  function matchTier(entry, tier) {
    const t = entry.tiers || [];
    return !t.length || t.includes(tier);
  }
  function poolFor(list, biome, tier) {
    const tierOk = list.filter(e => matchTier(e, tier));
    const biomeOk = tierOk.filter(e => matchBiome(e, biome));
    return biomeOk.length ? biomeOk : (tierOk.length ? tierOk : list);
  }

  const HIGH_TIERS = ["fine", "noble"]; // postures are an elite-sign flourish

  // Returns { name, plain }: `name` may be the archaic form (Blake, Gilt) and
  // goes in the inn name; `plain` is the modern word and goes in the sign
  // prose, where "a blake waystone" would read as a typo rather than flavor.
  function chooseColor(rng, cfg) {
    const c = pick(rng, cfg.colors || []);
    if (!c) return null;
    const useArchaic = c.archaic && rng() < (cfg.tuning.archaic_color_chance || 0);
    return { name: useArchaic ? c.archaic : c.word, plain: c.word };
  }

  // Postures only attach to high-tier signs, and only to charges that list one.
  function choosePosture(rng, cfg, charge, tier) {
    if (!HIGH_TIERS.includes(tier)) return null;
    const list = charge.postures || [];
    if (!list.length) return null;
    if (rng() >= (cfg.tuning.posture_chance || 0)) return null;
    const key = pick(rng, list);
    const p = (cfg.postures || {})[key];
    return p ? p.word : null;
  }

  const article = w => (/^[aeiou]/i.test(w) ? "an " : "a ");
  const lc = w => (w ? w.charAt(0).toLowerCase() + w.slice(1) : w);

  // Build the "single charge" name and its sign description, sharing the color
  // and posture logic that the color pattern also uses.
  function dressCharge(rng, cfg, charge, tier, opts) {
    opts = opts || {};
    const color = opts.color || null;
    const posture = choosePosture(rng, cfg, charge, tier);
    const words = ["The"];
    if (color) words.push(color.name);
    if (posture) words.push(posture);
    words.push(charge.name);
    const name = words.join(" ");

    // The posture rides in the name only; the base sign prose already reads as
    // a coherent depiction, so injecting the heraldic term here would double up.
    let sign = charge.sign;
    if (color) sign = color.plain.toLowerCase() + " " + sign;
    sign = article(sign) + sign;
    return { name, sign };
  }

  function build(rng, cfg, world) {
    const tier = world.inn_tier;
    const biome = world.biome;
    const charges = poolFor(cfg.charges || [], biome, tier);
    // Figures and trades respect tier strictly (no full-pool fallback): a
    // roadside alehouse should not sport "The Queen's Head", and a guild-arms
    // sign belongs to its own biome's trades. An empty result just means the
    // dependent patterns drop out for this world.
    const figures = (cfg.figures || []).filter(f => matchTier(f, tier) && matchBiome(f, biome));
    const trades = (cfg.trades || []).filter(t => matchTier(t, tier) && matchBiome(t, biome));
    const royals = figures.filter(f => (f.flavor || []).includes("royal"));

    // Some patterns need a bigger pool than the world offers; fall back to a
    // plain single charge when the chosen pattern can't be satisfied. A pattern
    // with a tiers list additionally only fires at those tiers.
    const feasible = {
      single: charges.length > 0,
      color: charges.some(c => c.color),
      number: charges.length > 0,
      possessive: charges.some(c => (c.haunts || []).length) || trades.some(t => (t.haunts || []).length),
      arms: trades.some(t => t.arms_sign) || (HIGH_TIERS.includes(tier) && royals.length > 0),
      pair: charges.length >= 2,
      on_object: charges.length > 0 &&
        (cfg.objects || []).some(o => !o.subjects || (o.subjects === "figures" && figures.length > 0)),
      body_part: charges.some(c => (c.parts || []).length) || figures.some(f => (f.parts || []).length)
    };
    const usable = (cfg.patterns || []).filter(p =>
      feasible[p.id] && (!p.tiers || p.tiers.includes(tier)));
    const pattern = weightedPick(rng, usable.length ? usable : [{ id: "single", weight: 1 }], p => p.weight);

    if (pattern.id === "color") {
      const colored = charges.filter(c => c.color);
      const charge = pick(rng, colored.length ? colored : charges);
      return dressCharge(rng, cfg, charge, tier, { color: chooseColor(rng, cfg) });
    }

    if (pattern.id === "number") {
      // "Three" carries almost every numbered sign; a couple of numbers are
      // locked to a specific charge ("Seven Stars", "Four Birds").
      const num = weightedPick(rng, cfg.numbers || [], n => n.weight) || { word: "Three" };
      // A locked number ("Seven Stars", "Four Birds") only fires when its charge
      // is actually reachable in this world; otherwise the sign falls back to a
      // plain "Three <charge>" so a low-tier device can't sneak into a grand inn.
      if (num.requires_charge) {
        const locked = charges.find(c => c.name === num.requires_charge);
        if (locked) {
          return {
            name: `The ${num.word} ${locked.plural}`,
            sign: `${num.word.toLowerCase()} ${lc(locked.plural)}`
          };
        }
      }
      const three = (cfg.numbers || []).find(n => n.word === "Three") || { word: "Three" };
      const plain = charges.filter(c => !isNumberLocked(cfg, c.name));
      const charge = pick(rng, plain.length ? plain : charges);
      return {
        name: `The ${three.word} ${charge.plural}`,
        sign: `${three.word.toLowerCase()} ${lc(charge.plural)}`
      };
    }

    if (pattern.id === "possessive") {
      // A creature's haunt (The Fox's Den, The Gull's Perch) or a trade at
      // rest (The Drover's Rest). The board shows the subject; the haunt
      // lives in the name only.
      const subjects = charges.filter(c => (c.haunts || []).length)
        .concat(trades.filter(t => (t.haunts || []).length));
      const subject = pick(rng, subjects);
      const haunt = pick(rng, subject.haunts);
      const sign = subject.sign || lc(subject.name);
      return {
        name: `The ${subject.name}'s ${haunt}`,
        sign: `${article(sign)}${sign}`
      };
    }

    if (pattern.id === "arms") {
      // Guild arms (The Miller's Arms) or, at high tiers, the royal arms
      // (The King's Arms). Guilds paint their blazon; royalty needs none.
      const bearers = trades.filter(t => t.arms_sign)
        .concat(HIGH_TIERS.includes(tier) ? royals : []);
      const bearer = pick(rng, bearers);
      const possessive = bearer.possessive || `${bearer.name}'s`;
      return {
        name: `The ${possessive} Arms`,
        sign: bearer.arms_sign
          ? `${article(bearer.arms_sign)}${bearer.arms_sign}`
          : "the royal arms, quartered and crowned"
      };
    }

    if (pattern.id === "pair") {
      const a = pick(rng, charges);
      const rest = charges.filter(c => c.name !== a.name);
      const b = pick(rng, rest.length ? rest : charges);
      return {
        name: `The ${a.name} and ${b.name}`,
        sign: `${article(a.sign)}${a.sign} beside ${article(b.sign)}${b.sign}`
      };
    }

    if (pattern.id === "on_object") {
      // An object marked subjects:"figures" (on Horseback) takes a rider, not
      // an arbitrary charge; a camel on horseback is not a paintable sign.
      const o = pick(rng, cfg.objects);
      if (o.subjects === "figures" && figures.length) {
        const f = pick(rng, figures);
        const noun = lc(f.name);
        return {
          name: `The ${f.name} ${o.prep} ${o.object}`,
          sign: `${article(noun)}${noun} ${o.prep} ${lc(o.object)}`
        };
      }
      const plainObjects = (cfg.objects || []).filter(x => !x.subjects);
      const obj = o.subjects ? pick(rng, plainObjects) : o;
      const charge = pick(rng, charges);
      return {
        name: `The ${charge.name} ${obj.prep} ${obj.object}`,
        sign: `${article(charge.sign)}${charge.sign} ${obj.prep} ${lc(obj.object)}`
      };
    }

    if (pattern.id === "body_part") {
      // Figures give a Head or Hand; animals give a Head or Horn. Restricting
      // the part to what the subject can plausibly show keeps signs coherent.
      const animals = charges.filter(c => (c.parts || []).length);
      const subjectPool = figures.concat(animals);
      const subject = pick(rng, subjectPool);
      const part = pick(rng, subject.parts);
      const possessive = subject.possessive || `${subject.name}'s`;
      const noun = lc(subject.name);
      return {
        name: `The ${possessive} ${part}`,
        sign: `the ${part.toLowerCase()} of ${article(noun)}${noun}`
      };
    }

    // single (default)
    const charge = pick(rng, charges);
    return dressCharge(rng, cfg, charge, tier, {});
  }

  function isNumberLocked(cfg, chargeName) {
    return (cfg.numbers || []).some(n => n.requires_charge === chargeName);
  }

  function chooseDesignator(rng, cfg, tier) {
    const list = (cfg.designators || {})[tier] || [];
    if (!list.length) return null;
    if (rng() >= (cfg.tuning.designator_chance || 0)) return null;
    const d = weightedPick(rng, list, x => x.weight);
    return d ? d.word : null;
  }

  // Public API. `data` is the loaded inn_names.json; `world` supplies biome and
  // inn_tier; `seed` keeps the result stable. Never throws: on missing data it
  // returns a bare fallback so rendering always has a name.
  function generate(world, seed, data) {
    const cfg = data && (data.inn_names || data);
    if (!cfg || !cfg.charges) {
      return { name: "The Wayside Inn", sign: null, designator: "Inn" };
    }
    const w = world || {};
    const rng = makeRng(`${seed || ""}|${w.biome || ""}|${w.inn_tier || ""}`);
    const core = build(rng, cfg, w);

    const designator = chooseDesignator(rng, cfg, w.inn_tier);
    let name = designator ? `${core.name} ${designator}` : core.name;

    // "on the Hoop" is an archaic-district flourish; skip it when the name
    // already carries an "on/in ..." phrase from the on_object pattern.
    const hasLocation = / (on|in) /.test(core.name);
    if (!hasLocation && rng() < (cfg.tuning.hoop_suffix_chance || 0)) {
      name += " on the Hoop";
    }
    return { name, sign: core.sign, designator };
  }

  const api = { generate };
  if (typeof window !== "undefined") window.InnName = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
