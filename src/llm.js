// llm.js: optional flavor text via a bring-your-own-key LLM provider.
// The key is held in a form field and passed per-request. Never stored.
// NOTE: Calling an API directly from a browser with a user-provided key requires
// the API to allow browser CORS. Anthropic supports this with the
// "anthropic-dangerous-direct-browser-access" header for client-side testing;
// the other providers serve CORS headers on their OpenAI-compatible endpoints.
// For production use, proxy through your own backend.

// Every provider except Anthropic speaks the OpenAI chat-completions dialect,
// so they share one request path and differ only in url/model/body tweaks.
// - tokenParam: OpenAI's newer models reject "max_tokens" in favor of
//   "max_completion_tokens"; the rest still expect "max_tokens".
// - supportsEffort: reasoning models that accept reasoning_effort
//   (low/medium/high). Default is low so the token budget goes to menu
//   copy instead of thinking; the UI exposes the knob for these.
const PROVIDERS = {
  anthropic: {
    label: "Anthropic (Claude)",
    host: "api.anthropic.com",
    placeholder: "sk-ant-...",
    model: "claude-sonnet-5"
  },
  google: {
    label: "Google AI Studio (Gemini)",
    host: "generativelanguage.googleapis.com",
    placeholder: "AIza...",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    // Rolling alias for the newest Flash model. Pinned versions get retired
    // for new keys ("gemini-2.5-flash is no longer available to new users").
    model: "gemini-flash-latest",
    supportsEffort: true
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    host: "api.openai.com",
    placeholder: "sk-proj-...",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-5-mini",
    tokenParam: "max_completion_tokens",
    supportsEffort: true
  },
  kimi: {
    // Keys issued by platform.moonshot.cn only work against api.moonshot.cn;
    // this targets the international platform (platform.moonshot.ai).
    label: "Kimi (Moonshot AI)",
    host: "api.moonshot.ai",
    placeholder: "sk-...",
    url: "https://api.moonshot.ai/v1/chat/completions",
    model: "kimi-latest"
  },
  deepseek: {
    label: "DeepSeek",
    host: "api.deepseek.com",
    placeholder: "sk-...",
    url: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat"
  },
  cerebras: {
    // Hosts open-weight models; ids churn as they rotate the lineup, so if
    // this 404s check https://inference-docs.cerebras.ai/models/overview.
    label: "Cerebras",
    host: "api.cerebras.ai",
    placeholder: "csk-...",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "gpt-oss-120b",
    supportsEffort: true
  }
};

// Providers with unambiguous key prefixes; bare "sk-..." could be
// OpenAI, Kimi, or DeepSeek, so those never auto-select.
function guessProvider(key) {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-proj-")) return "openai";
  if (key.startsWith("csk-") || key.startsWith("csk_")) return "cerebras";
  return null;
}

async function polishMenu(menu, apiKey, providerId, effort) {
  const provider = PROVIDERS[providerId] || PROVIDERS.anthropic;
  const prompt = buildPrompt(menu);
  const text = provider === PROVIDERS.anthropic
    ? await callAnthropic(prompt, apiKey)
    : await callOpenAICompatible(provider, prompt, apiKey, effort);
  return extractJson(text);
}

async function callAnthropic(prompt, apiKey) {
  const body = {
    model: PROVIDERS.anthropic.model,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }]
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });
  const data = await checkResponse(res);
  const textBlock = (data.content || []).find(c => c.type === "text");
  if (!textBlock) throw new Error("No text in response");
  return textBlock.text;
}

async function callOpenAICompatible(provider, prompt, apiKey, effort) {
  const body = {
    model: provider.model,
    messages: [{ role: "user", content: prompt }]
  };
  body[provider.tokenParam || "max_tokens"] = 8000;
  if (provider.supportsEffort) body.reasoning_effort = effort || "low";
  Object.assign(body, provider.extraBody || {});
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify(body)
  });
  const data = await checkResponse(res);
  const choice = (data.choices || [])[0];
  const text = choice && choice.message && choice.message.content;
  if (!text) throw new Error("No text in response");
  return text;
}

async function checkResponse(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const TIER_INSTRUCTIONS = {
  roadside: `Rewrite each dish name to sound like it would appear on a hardscrabble roadside inn menu: plain, blunt, unadorned. Names should feel like they were scratched onto a board with a knife. Also add a short flavor text (under 10 words) for each dish. Keep prices unchanged.

Tone for flavor text: bleak, grim, and resigned. The voice of a place where hunger is the seasoning. Channel Cormac McCarthy at his most desolate and the Narrator of Darkest Dungeon in his darkest moments. Mention what is absent as readily as what is present. Acknowledge rot, scarcity, and the indifference of the road. No sentiment. No comfort. Example flavor text: "It fills the belly. That is all that can be said." or "The meat was cheap for a reason."`,

  common: `Rewrite each dish name to sound like it would appear on a working tavern's menu: grounded, evocative, honest. Names should feel like they belong to a place that feeds tradesmen and travelers without pretense. Also add a short flavor text (under 12 words) for each dish. Keep prices unchanged.

Tone for flavor text: austere and observational, with dry humor and quiet philosophy. A literary voice between Cormac McCarthy and the Narrator of Darkest Dungeon, gritty but not without warmth, sometimes wry. Note ingredients, weather, and in some cases, ingredients are absent, just simple truths. Example flavor text: "It smells of the tide." or "Heavy on the salt, as the cook prefers."`,

  fine: `Rewrite each dish name to sound like it would appear on a fine inn's menu: refined, elegant, with a touch of romance. Names may reference techniques, regions, or seasonal poetry. Also add a short flavor text (under 12 words) for each dish. Keep prices unchanged.

Tone for flavor text: appreciative, and quietly proud. The voice of a house that takes care with its work. Lean into pleasing detail: aromas, textures, provenance. Allow a small flourish, a kind observation. Avoid tropes like "no apologies" or "unapologetically". Example flavor text: "The butter is churned at dawn, and you will taste it." or "A favorite among the merchants who pass through in autumn."`,

  noble: `Rewrite each dish name to sound like it would appear on a noble inn's menu: ornate, grandiloquent, unashamedly pompous. Names should drip with epithets, regions of origin, royal allusions, and culinary boast. Also add a short flavor text (under 12 words) for each dish. Keep prices unchanged.

Tone for flavor text: exuberant, celebratory, and self-important. Channel Hemingway in its 1920s visit to Paris, adapted to medieval dark fantasy. The voice of a House Keeper addressing nobility, every dish a triumph, every ingredient the finest of its kind. Reference provenance and prestige. Avoid tropes like "no apologies" or "unapologetically". Example flavor text: "Two inches thick, sputtering on the griddle. Islanded with mushrooms, stung with pepper. A conquest fit for a King." or "Saffron from the southern isles, gold-leafed at the moment of service."`
};

function buildPrompt(menu) {
  const tier = (menu.world && menu.world.inn_tier) || "common";
  const instructions = TIER_INSTRUCTIONS[tier] || TIER_INSTRUCTIONS.common;
  return `You are helping flavor a fantasy tavern menu. Below is a JSON menu with plain dish names. ${instructions}

Return ONLY a JSON object of the same shape with updated "name" and added "description" fields per dish. Do not wrap in markdown.

World context: ${JSON.stringify(menu.world)}
Event note: ${menu.event_note || "none"}
Condition note: ${menu.condition_note || "none"}

Menu:
${JSON.stringify(menu.sections, null, 2)}`;
}

function extractJson(text) {
  // Strip any code fences and find the first {...} block.
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object found in response");
  const slice = cleaned.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    // If model returned the full menu, unwrap; if it returned just {sections:...}, keep.
    if (obj.sections) return obj;
    return { sections: obj };
  } catch (e) {
    throw new Error("Failed to parse JSON: " + e.message);
  }
}

window.InnLLM = { polishMenu, PROVIDERS, guessProvider };
