// ui.js: form wiring and menu rendering

// The deploy workflow stamps a per-branch build id on <html data-build="...">
// (see scripts/build-preview-site.mjs). Appending it to data fetches busts
// the GitHub Pages cache as soon as a new deploy lands. There is no stamp
// when running locally, so paths stay clean.
const BUILD_ID = document.documentElement.dataset.build || "";
function versioned(path) { return BUILD_ID ? `${path}?v=${BUILD_ID}` : path; }

async function loadData() {
  const paths = {
    ingredients: "data/ingredients.json",
    preparations: "data/preparations.json",
    dishes: "data/dishes.json",
    authored_dishes: "data/authored_dishes.json",
    modifiers: "data/modifiers.json",
    events: "data/events.json",
    inn_names: "data/inn_names.json"
  };
  // All fetches go out in parallel; awaiting them one by one would stack a
  // full network round trip per file onto page load.
  const entries = Promise.all(Object.entries(paths).map(async ([k, p]) => {
    const r = await fetch(versioned(p));
    if (!r.ok) throw new Error(`Failed to load ${p}`);
    return [k, await r.json()];
  }));
  const [pairs, flavorPacks] = await Promise.all([entries, loadFlavorPacks()]);
  const out = Object.fromEntries(pairs);
  out.flavor_packs = flavorPacks;
  return out;
}

// Flavor packs are optional opt-in data overlays (e.g. setting-specific named dishes).
// The manifest at data/flavor_packs/index.json lists available packs; each pack file
// holds dishes, optional new ingredients, and optional ingredient_overrides keyed by id.
async function loadFlavorPacks() {
  try {
    const idxRes = await fetch(versioned("data/flavor_packs/index.json"));
    if (!idxRes.ok) return { manifest: { packs: [] }, packs: {} };
    const manifest = await idxRes.json();
    const packs = {};
    for (const entry of manifest.packs || []) {
      const r = await fetch(versioned(`data/flavor_packs/${entry.file}`));
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
// Returns a new data object; the original DATA stays untouched.
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
  const historicalCb = qs("historical-mode");
  return {
    biome: qs("biome").value,
    season: qs("season").value,
    weather: qs("weather").value,
    inn_tier: qs("inn_tier").value,
    economy: qs("economy").value,
    condition: qs("condition").value,
    event: qs("event").value,
    historical: !!(historicalCb && historicalCb.checked)
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
    // Hidden packs (the Historical content layer) are activated by their own
    // control, not the pack list.
    if (entry.hidden) continue;
    const row = document.createElement("div");
    row.className = "option-row";
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
    text.textContent = `Flavor pack: ${entry.label}`;
    wrap.appendChild(cb);
    wrap.appendChild(text);
    row.appendChild(wrap);
    if (entry.description) {
      const info = document.createElement("button");
      info.type = "button";
      info.className = "info-btn";
      info.setAttribute("aria-label", `About the ${entry.label} pack`);
      info.innerHTML = INFO_SVG;
      info.addEventListener("click", () => openPackInfo(entry));
      row.appendChild(info);
    }
    root.appendChild(row);
  }
}

// Same minimal stroke style as the lock icons; a circled question mark.
const INFO_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.2a2.8 2.8 0 0 1 5.44.93c0 1.87-2.8 2.34-2.8 3.74" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </svg>`;

function openPackInfo(entry) {
  const modal = qs("pack-info-modal");
  if (!modal || typeof modal.showModal !== "function") return;
  qs("pack-info-title").textContent = `Flavor pack: ${entry.label}`;
  qs("pack-info-body").textContent = entry.description || "";
  // Packs may cite where their content comes from (link + link_label in the
  // manifest); the line only renders when a link is declared.
  const linkLine = qs("pack-info-link");
  if (linkLine) {
    const a = linkLine.querySelector("a");
    if (entry.link && a) {
      a.href = entry.link;
      a.textContent = entry.link_label || entry.link;
      linkLine.hidden = false;
    } else {
      linkLine.hidden = true;
    }
  }
  modal.showModal();
}

// Seasons and the weather order are intentionally fixed here: modifiers.json
// stores them as objects (insertion-ordered in practice, but not load-bearing
// in the generator). Listing them explicitly keeps dropdown order stable.
const SEASON_ORDER = [
  ["spring","Spring"], ["summer","Summer"], ["autumn","Autumn"], ["winter","Winter"]
];
const WEATHER_ORDER = ["clear","rain","snow","heatwave"];

function populateSelect(selectId, entries, defaultValue) {
  const sel = qs(selectId);
  sel.innerHTML = "";
  for (const { value, label } of entries) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (value === defaultValue) o.selected = true;
    sel.appendChild(o);
  }
}

function populateSelects(data) {
  populateSelect("biome",
    Object.entries(data.modifiers.biomes).map(([id, b]) => ({ value: id, label: b.label })),
    "heartland");
  populateSelect("season",
    SEASON_ORDER.map(([id, label]) => ({ value: id, label })),
    "autumn");
  populateSelect("weather",
    WEATHER_ORDER
      .filter(id => data.modifiers.weather[id])
      .map(id => ({ value: id, label: data.modifiers.weather[id].label })),
    "clear");
  populateSelect("condition",
    Object.entries(data.modifiers.conditions).map(([id, c]) => ({ value: id, label: c.label })),
    "peace");
  populateSelect("event",
    data.events.events.map(e => ({ value: e.id, label: e.label })));
}

// Some weathers don't make sense in some biomes/seasons, e.g. snow in arid or
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

// Defaults used by the Reset button: a calm baseline to start exploration from.
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

// ---------- shareable URLs ----------
// Every dial plus the seed can round-trip through the query string, so a menu
// can be shared, bookmarked, or preset by an external tool (a VTT macro can
// link straight to ?biome=frostlands&season=winter&seed=...). Params are read
// on load; the link itself is only built on demand by the Share link action,
// so the address bar never churns while dialing. Values equal to the Reset
// defaults are omitted to keep links short.
const PARAM_IDS = ["biome","season","weather","inn_tier","economy","condition","event"];
const PARAM_ALIASES = { inn_tier: "tier" };
function paramName(id) { return PARAM_ALIASES[id] || id; }

function readUrlState() {
  const p = new URLSearchParams(location.search);
  const state = {
    seed: p.get("seed"),
    historical: p.get("historical") === "1",
    packs: p.get("packs") !== null ? p.get("packs").split(",").filter(Boolean) : null
  };
  for (const id of PARAM_IDS) state[id] = p.get(paramName(id));
  return state;
}

// setSelect ignores values that don't match an option, so junk params fall
// back to the defaults instead of erroring.
function applyUrlState(state) {
  for (const id of PARAM_IDS) if (state[id]) setSelect(id, state[id]);
  applyWeatherCompatibility();
  if (state.packs) {
    for (const t of document.querySelectorAll(".flavor-pack-toggle")) {
      t.checked = state.packs.includes(t.value);
    }
  }
}

function buildShareUrl(world, seed, packIds) {
  const p = new URLSearchParams();
  for (const id of PARAM_IDS) {
    if (world[id] !== DEFAULTS[id]) p.set(paramName(id), world[id]);
  }
  if (world.historical) p.set("historical", "1");
  if (packIds.length) p.set("packs", packIds.join(","));
  p.set("seed", seed);
  return `${location.origin}${location.pathname}?${p.toString()}`;
}

function lastShareUrl() {
  const s = window.__lastShare;
  return s ? buildShareUrl(s.world, s.seed, s.packIds) : null;
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
    } finally { ta.remove(); }
  });
}

function flashButton(btn, label) {
  if (btn.dataset.flashing) return;
  const original = btn.textContent;
  btn.dataset.flashing = "1";
  btn.textContent = label;
  setTimeout(() => { btn.textContent = original; delete btn.dataset.flashing; }, 1200);
}

// Per-field lock state. Locked fields are skipped by Randomize / New seed.
const LOCK_IDS = ["biome","season","weather","inn_tier","economy","condition","event","seed"];
const locks = Object.fromEntries(LOCK_IDS.map(id => [id, false]));

const LOCK_SVGS = `
  <svg class="icon-unlocked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="1.5" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </svg>
  <svg class="icon-locked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="1.5" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
`;

function installLockButtons() {
  for (const id of LOCK_IDS) {
    const el = qs(id);
    if (!el) continue;
    // index.html authors each field as a .register-line grid row
    // (label | input | lock); the lock button fills the third column.
    // Fields without an authored row get one created around them.
    let row = el.closest(".register-line");
    if (!row) {
      row = document.createElement("div");
      row.className = "register-line";
      el.parentNode.insertBefore(row, el);
      row.appendChild(el);
    }
    if (row.querySelector(".lock-btn")) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lock-btn";
    btn.dataset.lockFor = id;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", `Lock ${id.replace("_", " ")}`);
    btn.innerHTML = LOCK_SVGS;
    btn.addEventListener("click", () => setLock(id, !locks[id]));
    row.appendChild(btn);
  }
}

function setLock(id, value) {
  locks[id] = value;
  const btn = document.querySelector(`.lock-btn[data-lock-for="${id}"]`);
  if (btn) {
    btn.setAttribute("aria-pressed", String(value));
    btn.setAttribute("aria-label", `${value ? "Unlock" : "Lock"} ${id.replace("_", " ")}`);
  }
}

function resetLocks() {
  for (const id of LOCK_IDS) setLock(id, false);
}

function randomizeSelects() {
  // Biome and season first; weather's available set depends on them.
  for (const id of ["biome","season","inn_tier","economy","condition","event"]) {
    if (locks[id]) continue;
    const el = qs(id);
    if (!el || !el.options.length) continue;
    el.value = el.options[Math.floor(Math.random() * el.options.length)].value;
  }
  applyWeatherCompatibility();
  if (!locks.weather) {
    const wsel = qs("weather");
    if (wsel && wsel.options.length) {
      const allowed = Array.from(wsel.options).filter(o => !o.disabled);
      const pool = allowed.length ? allowed : Array.from(wsel.options);
      wsel.value = pool[Math.floor(Math.random() * pool.length)].value;
    }
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
  const incipit = document.createElement("p");
  incipit.className = "incipit";
  incipit.textContent = "here beginneth the bill of fare";
  const inn = document.createElement("h2");
  const named = innNameFor(menu);
  inn.textContent = named.name;
  // The sign (the substantive element: what the board actually depicts) rides
  // along as a tooltip so the header stays terse but the flavor is there.
  if (named.sign) inn.title = `Sign: ${named.sign}`;
  const sub = document.createElement("p");
  sub.className = "menu-sub";
  sub.textContent = describeWorld(menu);
  header.appendChild(incipit);
  header.appendChild(inn);
  header.appendChild(sub);
  root.appendChild(header);

  const notes = [];
  if (menu.condition_note) notes.push(menu.condition_note);
  if (menu.event_note) notes.push(menu.event_note);
  if (menu.calendar_note) notes.push(menu.calendar_note);
  for (const n of notes) {
    const p = document.createElement("p");
    p.className = "event-note";
    p.textContent = n;
    root.appendChild(p);
  }

  const order = ["appetizer","main","dessert","drink"];
  for (const sectionId of order) {
    const section = menu.sections[sectionId];
    if (!section || !section.dishes.length) continue;
    const h = document.createElement("h3");
    h.className = "section-heading";
    const versal = document.createElement("span");
    versal.className = "versal";
    versal.textContent = section.label.charAt(0);
    h.appendChild(versal);
    h.appendChild(document.createTextNode(section.label.slice(1)));
    root.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "dish-list";
    for (const d of section.dishes) {
      const li = document.createElement("li");
      li.className = "dish";
      const name = document.createElement("span");
      name.className = "dish-name";
      if (d.importDistance > 0) {
        const parenIdx = d.name.lastIndexOf(" (");
        const base = document.createTextNode(d.name.slice(0, parenIdx));
        const label = document.createElement("span");
        label.className = "dish-import-label";
        label.textContent = d.name.slice(parenIdx);
        name.appendChild(base);
        name.appendChild(label);
      } else {
        name.textContent = d.name;
      }
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
  footer.textContent = `seed · ${menu.seed}`;
  root.appendChild(footer);
}

// Plain-text rendering of the last menu, for pasting into session notes or a
// VTT journal. Mirrors the on-page order: name, world line, notes, sections.
function menuAsText(menu) {
  const lines = [];
  const named = innNameFor(menu);
  lines.push(named.name);
  lines.push(describeWorld(menu));
  lines.push("");
  const notes = [];
  if (menu.condition_note) notes.push(`${conditionLabel(menu)}: ${menu.condition_note}`);
  if (menu.event_note) notes.push(`${eventLabel(menu)}: ${menu.event_note}`);
  if (menu.calendar_note) notes.push(`Calendar: ${menu.calendar_note}`);
  if (notes.length) { lines.push(...notes, ""); }
  const order = ["appetizer","main","dessert","drink"];
  for (const sectionId of order) {
    const section = menu.sections[sectionId];
    if (!section || !section.dishes.length) continue;
    lines.push(section.label.toUpperCase());
    for (const d of section.dishes) {
      lines.push(`- ${d.name} (${d.price_text})`);
      if (d.flavor) lines.push(`    ${d.flavor}`);
    }
    lines.push("");
  }
  lines.push(`Seed: ${menu.seed}`);
  const url = lastShareUrl();
  if (url) lines.push(url);
  return lines.join("\n");
}

// Sign-based inn name from the world (biome + tier) and seed, via innname.js.
// Falls back to a terse hashed name if the module or its data is unavailable,
// so the header always has a name even before inn_names.json loads.
function innNameFor(menu) {
  if (window.InnName && DATA && DATA.inn_names) {
    return window.InnName.generate(menu.world, menu.seed, DATA.inn_names);
  }
  return { name: innNameFromSeed(menu.seed), sign: null };
}

function innNameFromSeed(seed) {
  const adj = ["Hollow","Silver","Broken","Weeping","Grey","Black","Golden","Crooked","Old","Red","Blue","Green"];
  const noun = ["Stag","Hart","Anchor","Crown","Lantern","Rook","Cask","Horn","Key","Gate","Oak","Boar"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `The ${adj[h % adj.length]} ${noun[(h >>> 8) % noun.length]}`;
}

// Same order as the parameter form (biome, season, weather, tier, economy,
// condition) so the line under the inn name reads as an echo of the dials.
function describeWorld(menu) {
  const w = menu.world;
  const biomeLabel = menu.biome_label || w.biome;
  return `${biomeLabel} · ${w.season} · ${w.weather} · ${w.inn_tier} inn · ${w.economy} year · ${w.condition}`;
}

function conditionLabel(menu) {
  const c = DATA && DATA.modifiers.conditions[menu.world.condition];
  return (c && c.label) || cap(menu.world.condition);
}

function eventLabel(menu) {
  const e = DATA && DATA.events.events.find(ev => ev.id === menu.world.event);
  return (e && e.label) || "Event";
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ---------- init ----------
let DATA = null;

async function init() {
  DATA = await loadData();
  const urlState = readUrlState();
  populateSelects(DATA);
  populateFlavorPacks(DATA);
  applyUrlState(urlState);
  installLockButtons();
  qs("biome").addEventListener("change", applyWeatherCompatibility);
  qs("season").addEventListener("change", applyWeatherCompatibility);
  qs("seed").value = urlState.seed || randomSeed();
  qs("generate").addEventListener("click", generate);
  qs("reroll").addEventListener("click", () => {
    if (!locks.seed) qs("seed").value = randomSeed();
    generate();
  });
  qs("randomize").addEventListener("click", () => {
    randomizeSelects();
    if (!locks.seed) qs("seed").value = randomSeed();
    generate();
  });
  qs("reset").addEventListener("click", () => {
    resetSelects();
    resetLocks();
    qs("seed").value = randomSeed();
    generate();
  });
  qs("share").addEventListener("click", async (e) => {
    e.preventDefault();
    const url = lastShareUrl();
    if (!url) return;
    try {
      await copyToClipboard(url);
      flashButton(qs("share"), "Link copied");
    } catch (err) {
      flashButton(qs("share"), "Copy failed");
    }
  });
  qs("copy-text").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!window.__lastMenu) return;
    try {
      await copyToClipboard(menuAsText(window.__lastMenu));
      flashButton(qs("copy-text"), "Copied");
    } catch (err) {
      flashButton(qs("copy-text"), "Copy failed");
    }
  });
  qs("print").addEventListener("click", (e) => {
    e.preventDefault();
    window.print();
  });
  const howto = qs("howto-link");
  if (howto) howto.addEventListener("click", (e) => {
    e.preventDefault();
    const dlg = qs("howto-modal");
    if (dlg && typeof dlg.showModal === "function") dlg.showModal();
  });
  initHistorical(urlState.historical);
  initPolish();
  qs("polish").addEventListener("click", polish);
  generate();
}

// Historical checkbox: mutually exclusive with fantasy setting packs (the two
// layers claim different worlds). Checking it stores each pack toggle's state,
// unchecks and disables them; unchecking restores what the user had. The modal
// opens on the first activation and from the "what does this do?" link.
function initHistorical(activeFromUrl) {
  const cb = qs("historical-mode");
  const modal = qs("historical-modal");
  if (!cb) return;
  let storedPackState = null;
  let modalSeen = false;
  try { modalSeen = localStorage.getItem("historical-modal-seen") === "1"; } catch (e) {}

  const setPacksDisabled = (disabled) => {
    const toggles = document.querySelectorAll(".flavor-pack-toggle");
    if (disabled) {
      storedPackState = {};
      for (const t of toggles) {
        storedPackState[t.value] = t.checked;
        t.checked = false;
        t.disabled = true;
        t.closest(".flavor-pack-row").classList.add("disabled");
        t.closest(".flavor-pack-row").title = "Disabled while Historical is on";
      }
    } else {
      for (const t of toggles) {
        t.disabled = false;
        if (storedPackState && t.value in storedPackState) t.checked = storedPackState[t.value];
        t.closest(".flavor-pack-row").classList.remove("disabled");
        t.closest(".flavor-pack-row").removeAttribute("title");
      }
      storedPackState = null;
    }
  };

  const openModal = () => { if (modal && typeof modal.showModal === "function") modal.showModal(); };

  cb.addEventListener("change", () => {
    setPacksDisabled(cb.checked);
    if (cb.checked && !modalSeen) {
      modalSeen = true;
      try { localStorage.setItem("historical-modal-seen", "1"); } catch (e) {}
      openModal();
    }
    generate();
  });
  const info = qs("historical-info");
  if (info) info.addEventListener("click", openModal);

  // A shared ?historical=1 link arrives pre-checked, without the first-time
  // modal: the recipient asked for a menu, not an explainer.
  if (activeFromUrl && !cb.checked) {
    cb.checked = true;
    setPacksDisabled(true);
  }

  // Shared dismissal for both info dialogs: the corner X, a click on the
  // backdrop (which registers on the dialog element itself), and Escape
  // (native <dialog> behavior, nothing to wire).
  for (const dlg of document.querySelectorAll("dialog.info-modal")) {
    const x = dlg.querySelector(".modal-x");
    if (x) x.addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) dlg.close();
    });
  }
}

function initPolish() {
  const toggle = qs("polish-enabled");
  toggle.addEventListener("change", () => {
    qs("polish-controls").hidden = !toggle.checked;
    qs("polish-toggle-label").textContent = toggle.checked ? "On" : "Off";
  });
  const sel = qs("llm-provider");
  const providers = window.InnLLM.PROVIDERS;
  for (const [id, p] of Object.entries(providers)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
  let saved = null, savedEffort = null;
  try {
    saved = localStorage.getItem("llm-provider");
    savedEffort = localStorage.getItem("llm-effort");
  } catch (e) {}
  if (saved && providers[saved]) sel.value = saved;
  const effortSel = qs("llm-effort");
  if (savedEffort && ["low", "medium", "high"].includes(savedEffort)) effortSel.value = savedEffort;
  const sync = () => {
    const p = providers[sel.value];
    qs("api-key").placeholder = p.placeholder;
    qs("polish-note").textContent = `Key stays in your browser. Sent only to ${p.host}.`;
    qs("llm-effort-line").style.display = p.supportsEffort ? "" : "none";
    try { localStorage.setItem("llm-provider", sel.value); } catch (e) {}
  };
  sel.addEventListener("change", sync);
  effortSel.addEventListener("change", () => {
    try { localStorage.setItem("llm-effort", effortSel.value); } catch (e) {}
  });
  // Auto-select the provider when the pasted key has an unambiguous prefix.
  qs("api-key").addEventListener("input", () => {
    const guess = window.InnLLM.guessProvider(qs("api-key").value.trim());
    if (guess && guess !== sel.value) { sel.value = guess; sync(); }
  });
  sync();
}

function generate() {
  const world = collectWorld();
  const seed = qs("seed").value.trim() || randomSeed();
  qs("seed").value = seed;
  // Historical mode rides the pack machinery for its content layer: the
  // hidden "historical" pack merges in whenever the checkbox is on.
  const packIds = activeFlavorPackIds();
  window.__lastShare = { world, seed, packIds: packIds.slice() };
  if (world.historical) packIds.push("historical");
  const data = applyFlavorPacks(DATA, packIds);
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
    const flavored = await window.InnLLM.polishMenu(window.__lastMenu, key, qs("llm-provider").value, qs("llm-effort").value);
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
