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
  return out;
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
  for (const id of ["biome","season","weather","inn_tier","economy","condition","event"]) {
    const el = qs(id);
    if (!el || !el.options.length) continue;
    el.value = el.options[Math.floor(Math.random() * el.options.length)].value;
  }
}

function resetSelects() {
  for (const [id, v] of Object.entries(DEFAULTS)) setSelect(id, v);
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
  const menu = window.InnMenu.generateMenu(world, DATA, seed);
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
