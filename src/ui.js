// ui.js — form wiring and menu rendering

async function loadData() {
  const paths = {
    ingredients: "data/ingredients.json",
    preparations: "data/preparations.json",
    dishes: "data/dishes.json",
    authored_dishes: "data/authored_dishes.json",
    modifiers: "data/modifiers.json",
    events: "data/events.json"
  };
  const out = {};
  for (const [k, p] of Object.entries(paths)) {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`Failed to load ${p}`);
    out[k] = await r.json();
  }
  out.flavor_packs = await loadFlavorPacks();
  return out;
}

// Flavor packs are optional opt-in data overlays (e.g. setting-specific named dishes).
// The manifest at data/flavor_packs/index.json lists available packs; each pack file
// holds dishes, optional new ingredients, and optional ingredient_overrides keyed by id.
async function loadFlavorPacks() {
  try {
    const idxRes = await fetch("data/flavor_packs/index.json");
    if (!idxRes.ok) return { manifest: { packs: [] }, packs: {} };
    const manifest = await idxRes.json();
    const packs = {};
    for (const entry of manifest.packs || []) {
      const r = await fetch(`data/flavor_packs/${entry.file}`);
      if (!r.ok) continue;
      packs[entry.id] = await r.json();
    }
    return { manifest, packs };
  } catch (e) {
    console.warn("No flavor packs loaded:", e);
    return { manifest: { packs: [] }, packs: {} };
  }
}

// Apply currently-active packs onto a shallow copy of base data. Pack dishes and
// ingredients are concatenated; ingredient_overrides replace generic entries by id.
// Returns a new data object — the original DATA stays untouched.
function applyFlavorPacks(base, activeIds) {
  if (!activeIds.length) return base;
  const ingMap = new Map(base.ingredients.ingredients.map(i => [i.id, i]));
  const dishes = [...base.authored_dishes.dishes];
  for (const id of activeIds) {
    const pack = base.flavor_packs.packs[id];
    if (!pack) continue;
    for (const ing of pack.ingredients || []) ingMap.set(ing.id, ing);
    for (const ov of pack.ingredient_overrides || []) {
      const current = ingMap.get(ov.id);
      if (current) ingMap.set(ov.id, { ...current, ...ov });
    }
    for (const d of pack.dishes || []) dishes.push(d);
  }
  return {
    ...base,
    ingredients: { ingredients: Array.from(ingMap.values()) },
    authored_dishes: { dishes }
  };
}

function activeFlavorPackIds() {
  return Array.from(document.querySelectorAll(".flavor-pack-toggle:checked")).map(el => el.value);
}

function qs(id) { return document.getElementById(id); }

function randomSeed() {
  const words = ["raven","oak","bramble","ember","hollow","silver","mire","hearth","thistle","stag","wren","coin","stone","rook","pine","ash","barrow","crow","flint","heron"];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 900 + 100);
  return `${w1}-${w2}-${n}`;
}

function collectWorld() {
  return {
    biome: qs("biome").value,
    season: qs("season").value,
    weather: qs("weather").value,
    inn_tier: qs("inn_tier").value,
    economy: qs("economy").value,
    condition: qs("condition").value,
    event: qs("event").value
  };
}

function populateFlavorPacks(data) {
  const root = qs("flavor-packs");
  const fieldset = qs("flavor-packs-fieldset");
  if (!root || !fieldset) return;
  const entries = (data.flavor_packs && data.flavor_packs.manifest.packs) || [];
  if (!entries.length) { fieldset.style.display = "none"; return; }
  root.innerHTML = "";
  for (const entry of entries) {
    const wrap = document.createElement("label");
    wrap.className = "flavor-pack-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "flavor-pack-toggle";
    cb.value = entry.id;
    cb.id = `flavor-pack-${entry.id}`;
    if (entry.default_active) cb.checked = true;
    cb.addEventListener("change", () => generate());
    const text = document.createElement("span");
    text.textContent = entry.label;
    if (entry.description) text.title = entry.description;
    wrap.appendChild(cb);
    wrap.appendChild(text);
    root.appendChild(wrap);
  }
}

// Seasons and the weather order are intentionally fixed here — modifiers.json
// stores them as objects (insertion-ordered in practice, but not load-bearing
// in the generator). Listing them explicitly keeps dropdown order stable.
const SEASON_ORDER = [
  ["spring","Spring"], ["summer","Summer"], ["autumn","Autumn"], ["winter","Winter"]
];
const WEATHER_ORDER = ["clear","rain","snow","heatwave"];

function populateSelects(data) {
  // Biome
  const bsel = qs("biome");
  bsel.innerHTML = "";
  for (const [id, b] of Object.entries(data.modifiers.biomes)) {
    const o = document.createElement("option");
    o.value = id; o.textContent = b.label;
    if (id === "heartland") o.selected = true;
    bsel.appendChild(o);
  }
  // Season
  const ssel = qs("season");
  ssel.innerHTML = "";
  for (const [id, label] of SEASON_ORDER) {
    const o = document.createElement("option");
    o.value = id; o.textContent = label;
    if (id === "autumn") o.selected = true;
    ssel.appendChild(o);
  }
  // Weather
  const wsel = qs("weather");
  wsel.innerHTML = "";
  for (const id of WEATHER_ORDER) {
    const def = data.modifiers.weather[id];
    if (!def) continue;
    const o = document.createElement("option");
    o.value = id; o.textContent = def.label;
    if (id === "clear") o.selected = true;
    wsel.appendChild(o);
  }
  // Condition
  const csel = qs("condition");
  csel.innerHTML = "";
  for (const [id, c] of Object.entries(data.modifiers.conditions)) {
    const o = document.createElement("option");
    o.value = id; o.textContent = c.label;
    if (id === "peace") o.selected = true;
    csel.appendChild(o);
  }
  // Event
  const esel = qs("event");
  esel.innerHTML = "";
  for (const e of data.events.events) {
    const o = document.createElement("option");
    o.value = e.id; o.textContent = e.label;
    esel.appendChild(o);
  }
}

// Some weathers don't make sense in some biomes/seasons — e.g. snow in arid or
// summer, heatwave in frostlands or winter. The rule table lives in
// modifiers.json so it stays adjustable without touching code. We disable the
// offending options in the weather <select>; if the user's current pick just
// became invalid, fall back to "clear".
function applyWeatherCompatibility() {
  const wsel = qs("weather");
  if (!wsel || !DATA) return;
  const rules = DATA.modifiers.weather_incompatibilities || {};
  const biome = qs("biome").value;
  const season = qs("season").value;
  let currentBecameInvalid = false;
  for (const opt of wsel.options) {
    const r = rules[opt.value];
    const bad = r && ((r.biomes || []).includes(biome) || (r.seasons || []).includes(season));
    opt.disabled = !!bad;
    if (bad && opt.value === wsel.value) currentBecameInvalid = true;
  }
  if (currentBecameInvalid) wsel.value = "clear";
}

// Defaults used by the Reset button — a calm baseline to start exploration from.
const DEFAULTS = {
  biome: "heartland",
  season: "spring",
  weather: "clear",
  inn_tier: "common",
  economy: "normal",
  condition: "peace",
  event: "none"
};

function setSelect(id, value) {
  const el = qs(id);
  if (!el) return;
  const option = Array.from(el.options).find(o => o.value === value);
  if (option) el.value = value;
}

function randomizeSelects() {
  // Biome and season first — weather's available set depends on them.
  for (const id of ["biome","season","inn_tier","economy","condition","event"]) {
    const el = qs(id);
    if (!el || !el.options.length) continue;
    el.value = el.options[Math.floor(Math.random() * el.options.length)].value;
  }
  applyWeatherCompatibility();
  const wsel = qs("weather");
  if (wsel && wsel.options.length) {
    const allowed = Array.from(wsel.options).filter(o => !o.disabled);
    const pool = allowed.length ? allowed : Array.from(wsel.options);
    wsel.value = pool[Math.floor(Math.random() * pool.length)].value;
  }
}

function resetSelects() {
  for (const [id, v] of Object.entries(DEFAULTS)) setSelect(id, v);
  applyWeatherCompatibility();
}

function renderMenu(menu) {
  const root = qs("menu-output");
  root.innerHTML = "";

  const header = document.createElement("header");
  header.className = "menu-header";
  const inn = document.createElement("h2");
  inn.textContent = innNameFromSeed(menu.seed);
  const sub = document.createElement("p");
  sub.className = "menu-sub";
  sub.textContent = describeWorld(menu);
  header.appendChild(inn);
  header.appendChild(sub);
  root.appendChild(header);

  const notes = [];
  if (menu.condition_note) notes.push(menu.condition_note);
  if (menu.event_note) notes.push(menu.event_note);
  if (notes.length) {
    for (const n of notes) {
      const p = document.createElement("p");
      p.className = "event-note";
      p.textContent = n;
      root.appendChild(p);
    }
  }

  const order = ["appetizer","main","dessert","drink"];
  for (const sectionId of order) {
    const section = menu.sections[sectionId];
    if (!section || !section.dishes.length) continue;
    const h = document.createElement("h3");
    h.className = "section-heading";
    h.textContent = section.label;
    root.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "dish-list";
    for (const d of section.dishes) {
      const li = document.createElement("li");
      li.className = "dish";
      const name = document.createElement("span");
      name.className = "dish-name";
      name.textContent = d.name;
      const price = document.createElement("span");
      price.className = "dish-price";
      price.textContent = d.price_text;
      li.appendChild(name);
      li.appendChild(price);
      if (d.flavor) {
        const desc = document.createElement("div");
        desc.className = "dish-desc";
        desc.textContent = d.flavor;
        li.appendChild(desc);
      }
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }

  const footer = document.createElement("footer");
  footer.className = "menu-footer";
  footer.textContent = `seed: ${menu.seed}`;
  root.appendChild(footer);
}

function innNameFromSeed(seed) {
  const adj = ["Hollow","Silver","Broken","Weeping","Grey","Black","Golden","Crooked","Old","Red","Blue","Green"];
  const noun = ["Stag","Hart","Anchor","Crown","Lantern","Rook","Cask","Horn","Key","Gate","Oak","Boar"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `The ${adj[h % adj.length]} ${noun[(h >>> 8) % noun.length]}`;
}

function describeWorld(menu) {
  const w = menu.world;
  const biomeLabel = menu.biome_label || w.biome;
  return `${cap(w.season)} · ${w.weather} · ${biomeLabel} · ${w.inn_tier} inn · ${w.economy} year · ${w.condition}`;
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ---------- init ----------
let DATA = null;

async function init() {
  DATA = await loadData();
  populateSelects(DATA);
  populateFlavorPacks(DATA);
  applyWeatherCompatibility();
  qs("biome").addEventListener("change", applyWeatherCompatibility);
  qs("season").addEventListener("change", applyWeatherCompatibility);
  qs("seed").value = randomSeed();
  qs("generate").addEventListener("click", generate);
  qs("reroll").addEventListener("click", () => { qs("seed").value = randomSeed(); generate(); });
  qs("randomize").addEventListener("click", () => { randomizeSelects(); qs("seed").value = randomSeed(); generate(); });
  qs("reset").addEventListener("click", () => { resetSelects(); qs("seed").value = randomSeed(); generate(); });
  qs("polish").addEventListener("click", polish);
  generate();
}

function generate() {
  const world = collectWorld();
  const seed = qs("seed").value.trim() || randomSeed();
  qs("seed").value = seed;
  const data = applyFlavorPacks(DATA, activeFlavorPackIds());
  const menu = window.InnMenu.generateMenu(world, data, seed);
  window.__lastMenu = menu;
  renderMenu(menu);
}

async function polish() {
  const key = qs("api-key").value.trim();
  const status = qs("polish-status");
  if (!window.__lastMenu) { status.textContent = "Generate a menu first."; return; }
  if (!key) { status.textContent = "Paste an API key above. It stays in your browser."; return; }
  status.textContent = "Polishing…";
  try {
    const flavored = await window.InnLLM.polishMenu(window.__lastMenu, key);
    for (const sec of Object.keys(window.__lastMenu.sections)) {
      const orig = window.__lastMenu.sections[sec].dishes;
      const flav = (flavored.sections && flavored.sections[sec] && flavored.sections[sec].dishes) || [];
      for (let i = 0; i < orig.length; i++) {
        if (flav[i] && flav[i].description) orig[i].flavor = flav[i].description;
      }
    }
    renderMenu(window.__lastMenu);
    status.textContent = "Done.";
  } catch (e) {
    console.error(e);
    status.textContent = "Error: " + e.message;
  }
}

window.addEventListener("DOMContentLoaded", init);
