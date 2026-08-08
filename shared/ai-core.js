/* ============================================================================
   Platform-neutral core. Wrapped by netlify/functions/* and functions/api/*.
   Takes (request, env) and returns a Response — works on Node and on Workers.
   Do NOT reference process.env in here; env is passed in by the wrapper.

   [PLUG:AI]  POST /api/ai-summary

   Turns a result set into the "Pilot's Read" using Claude.

   Environment variable:
     ANTHROPIC_API_KEY   from console.anthropic.com

   If the key is absent this returns 503 and the client silently falls back to
   the local analyst in js/domain.js. That fallback is deliberate — a plain read
   beats no read, and the site must never look broken because a model call
   timed out.
   ============================================================================ */

const MODEL = "claude-sonnet-4-6";

export async function handleAiSummary(req, env) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "ANTHROPIC_API_KEY not set" }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const { criteria = {}, results = [], relaxed = [] } = body;
  if (!results.length) return json({ error: "no results to summarize" }, 400);

  // Trim the payload hard. The model needs the shape of the market, not 60 full records.
  const compact = results.slice(0, 25).map((v) => ({
    year: v.year, make: v.make, model: v.model, trim: v.trim,
    price: v.price, msrp: v.msrp, mileage: v.mileage, condition: v.condition,
    color: v.exteriorColor?.name, drivetrain: v.drivetrain,
    dealer: v.dealer?.name, distanceMi: v.dealer?.distanceMi, daysOnLot: v.listedDaysAgo,
  }));

  const prompt = `You are DealPilot, a blunt car-buying advisor who works for the BUYER, never the dealer.

Buyer's stated requirements:
${JSON.stringify(criteria, null, 2)}

${relaxed.length ? `IMPORTANT: no listing matched exactly. These constraints were relaxed to find near-misses: ${relaxed.map((r) => r.label).join(", ")}. Lead with that fact. Do not let the buyer believe they are looking at what they asked for.` : ""}

Matching inventory (${results.length} total, first 25 shown):
${JSON.stringify(compact)}

Write a short, specific read for this buyer. Rules:
- Concrete numbers over adjectives. Name dealers and cars.
- Price spread across comparable cars is the buyer's leverage. Say where it is.
- Days on lot over 60 signals floorplan pressure and softness on price.
- Never invent a listing, a dealer, or a number that is not in the data above.
- No pleasantries, no "I hope this helps".

Return ONLY raw JSON, no markdown fences:
{
  "headline": "one sentence, under 100 chars",
  "body": ["2-3 paragraphs, each a string"],
  "watchOuts": ["3-5 short specific tactical notes"],
  "priceRead": "one paragraph on how this set prices against MSRP and what to open at"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, messages: [{ role: "user", content: prompt }] }),
    });

    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || "").join("").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);

    if (!parsed.headline || !Array.isArray(parsed.body)) throw new Error("unexpected summary shape");
    return json(parsed);
  } catch (err) {
    console.error("[ai-summary]", err);
    return json({ error: String(err.message || err) }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
