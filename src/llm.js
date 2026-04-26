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

function buildPrompt(menu) {
  return `You are helping flavor a fantasy tavern menu. Below is a JSON menu with plain dish names. Rewrite each dish name to sound like it would appear on a real medieval-fantasy inn menu — evocative but grounded, never twee or pun-based. Also add a short description (under 15 words) for each dish. Keep prices unchanged. Return ONLY a JSON object of the same shape with updated "name" and added "description" fields per dish. Do not wrap in markdown.

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
