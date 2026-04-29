// llm.js — optional flavor text via Anthropic API (bring your own key)
// The key is held in a form field and passed per-request. Never stored.
// NOTE: Calling the API directly from a browser with a user-provided key requires
// the API to allow browser CORS. Anthropic supports this with the
// "anthropic-dangerous-direct-browser-access" header for client-side testing.
// For production use, proxy through your own backend.

async function polishMenu(menu, apiKey) {
  const prompt = buildPrompt(menu);
  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find(c => c.type === "text");
  if (!textBlock) throw new Error("No text in response");
  const json = extractJson(textBlock.text);
  return json;
}

const TIER_INSTRUCTIONS = {
  roadside: `Rewrite each dish name to sound like it would appear on a hardscrabble roadside inn menu — plain, blunt, unadorned. Names should feel like they were scratched onto a board with a knife. Also add a short flavor text (under 15 words) for each dish. Keep prices unchanged.

Tone for flavor text: bleak, grim, and resigned. The voice of a place where hunger is the seasoning. Channel Cormac McCarthy at his most desolate and the Narrator of Darkest Dungeon in his darkest moments. Mention what is absent as readily as what is present. Acknowledge rot, scarcity, and the indifference of the road. No sentiment. No comfort. Example flavor text: "It fills the belly. That is all that can be said." or "The meat was cheap for a reason."`,

  common: `Rewrite each dish name to sound like it would appear on a working tavern's menu — grounded, evocative, honest. Names should feel like they belong to a place that feeds tradesmen and travelers without pretense. Also add a short flavor text (under 15 words) for each dish. Keep prices unchanged.

Tone for flavor text: austere and observational, with dry humor and quiet philosophy. A literary voice between Cormac McCarthy and the Narrator of Darkest Dungeon — gritty but not without warmth, sometimes wry. Note ingredients, weather, simple truths. Example flavor text: "It smells of the tide." or "Heavy on the salt, as the cook prefers."`,

  fine: `Rewrite each dish name to sound like it would appear on a fine inn's menu — refined, elegant, with a touch of romance. Names may reference techniques, regions, or seasonal poetry. Also add a short flavor text (under 15 words) for each dish. Keep prices unchanged.

Tone for flavor text: cheerful, appreciative, and quietly proud. The voice of a house that takes care with its work and expects its guests to notice. Lean into pleasing detail — aromas, textures, provenance. Allow a small flourish, a kind observation. Example flavor text: "The butter is churned at dawn, and you will taste it." or "A favorite among the merchants who pass through in autumn."`,

  noble: `Rewrite each dish name to sound like it would appear on a noble inn's menu — ornate, grandiloquent, unashamedly pompous. Names should drip with epithets, regions of origin, royal allusions, and culinary boast. Also add a short flavor text (under 15 words) for each dish. Keep prices unchanged.

Tone for flavor text: exuberant, celebratory, and theatrically self-important. The voice of a maître d'hôtel addressing nobility, every dish a triumph, every ingredient the finest of its kind. Pile on adjectives. Reference provenance, prestige, the envy of rivals. Example flavor text: "A dish worthy of the Margrave's own table, or so His Grace insisted." or "Saffron from the southern isles, gold-leafed at the moment of service."`
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

window.InnLLM = { polishMenu };
