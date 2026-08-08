/* ============================================================================
   Platform-neutral core. Wrapped by src/index.js. Takes (request, env),
   returns a Response. Never reference process.env here.

   [PLUG:NEGOTIATION]
     POST /api/negotiate   → full dashboard payload for one vehicle
     POST /api/coach       → strategy read on a dealer's response

   ── Design stance ───────────────────────────────────────────────────────────
   DealPilot represents the BUYER. Every number here is computed to serve the
   person spending the money, and anything we can't source is declared missing
   rather than invented. See shared/market-analysis.js for the provenance
   contract that governs both files.
   ============================================================================ */

import { analyze, isKnown } from "./market-analysis.js";
// Shared with the browser — see the header note in js/otd-calc.js.
import { calculateOTD, feesFor } from "../js/otd-calc.js";

const $ = (n) => "$" + Math.round(n).toLocaleString();

/* ----------------------------------------------------------------------------
   MESSAGE GENERATION
---------------------------------------------------------------------------- */
function templateMessage(ctx, kind) {
  const { vehicle, analysis, otdTarget } = ctx;
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`;
  const stock = vehicle.stockNumber ? ` (stock ${vehicle.stockNumber})` : vehicle.vin ? ` (VIN ${vehicle.vin})` : "";

  if (kind === "counter") {
    return [
      `Thanks for getting back to me.`, ``,
      `I appreciate the movement, but that's still above where comparable listings in my area land. I'm ready to sign at ${$(otdTarget)} out the door on the ${name}.`, ``,
      `That number works for me today. If you can meet it, I'll complete the purchase immediately.`, ``,
      `Thanks,`,
    ].join("\n");
  }

  if (kind === "close") {
    return [
      `That works. Let's move forward at ${$(otdTarget)} out the door on the ${name}${stock}.`, ``,
      `Please send the itemized buyer's order showing vehicle price, all dealer fees, taxes, and title and registration so I can confirm the total before I come in. I'm not financing through the dealership and I'm not adding protection or appearance packages.`, ``,
      `Once I have that in writing I can be in to sign.`, ``,
      `Thanks,`,
    ].join("\n");
  }

  const lines = [
    `Hello,`, ``,
    `I'm interested in the ${name}${stock} you have listed at ${$(vehicle.price)}.`, ``,
    `I've reviewed comparable listings in my area and would like to move forward if we can agree on an out-the-door price of ${$(otdTarget)}. If we're able to reach that number today, I'm prepared to complete the purchase immediately.`,
  ];

  const support = [];
  if (isKnown(analysis.fairMarketValue) && analysis.position.delta.value > 300) {
    support.push(`comparable ${vehicle.condition === "New" ? "units" : "units with similar mileage"} in the area are asking between ${$(analysis.fairMarketValue.low)} and ${$(analysis.fairMarketValue.high)}`);
  }
  if (vehicle.listedDaysAgo != null && vehicle.listedDaysAgo >= 60) {
    support.push(`this unit has been listed for ${vehicle.listedDaysAgo} days`);
  }
  if (support.length) lines.push(``, `For context: ${support.join(", and ")}.`);

  lines.push(``,
    `Please send the out-the-door figure itemized — vehicle price, doc fee, any dealer additions, taxes, and title and registration. To be upfront: I'm arranging my own financing and I'm not looking to add protection packages or accessories.`, ``,
    `If that number works, I can be in this week. If not, no hard feelings — just let me know where you land.`, ``,
    `Thanks,`);
  return lines.join("\n");
}

async function claudeMessage(ctx, kind, tone, env) {
  const { vehicle, analysis, otdTarget, history } = ctx;
  const fmv = analysis.fairMarketValue;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content:
`You are drafting an email a CAR BUYER will send to a dealer. You work for the buyer.

Message type: ${kind} (opening = first contact, counter = responding to a dealer counteroffer, close = accepting terms)
Tone: ${tone || "professional and firm"}

Verified data — use ONLY these numbers. Do not introduce any figure not present here:
${JSON.stringify({
  vehicle: { year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim,
             asking: vehicle.price, msrp: vehicle.msrp, stock: vehicle.stockNumber,
             daysOnMarket: vehicle.listedDaysAgo, dealer: vehicle.dealer?.name },
  marketValue: isKnown(fmv) ? fmv.value : null,
  comparableRange: isKnown(fmv) ? [Math.round(fmv.low), Math.round(fmv.high)] : null,
  comparableCount: analysis.comparables.count,
  targetOutTheDoor: otdTarget,
  history: history || [],
}, null, 2)}

Rules:
- Lead with the out-the-door number. Never negotiate on monthly payment.
- Cite at most two concrete facts as justification. Specific, not vague.
- Ask for the OTD price itemized in writing.
- Decline dealer financing and add-on packages briefly and pre-emptively.
- Make walking away credible without being rude or theatrical.
- Never reveal a walk-away figure or a maximum budget.
- No filler openings. Under 200 words. Plain text, no markdown, no subject line.

Return ONLY the email body.` }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("").trim();
  if (!text) throw new Error("empty draft");
  return text;
}

/* ----------------------------------------------------------------------------
   COACHING ENGINE

   Reads the offer timeline and says what to do next. Rules are explicit so the
   advice is inspectable — a buyer should be able to disagree with it.
---------------------------------------------------------------------------- */
export function coach(ctx) {
  const { vehicle, analysis, history = [], otdTarget } = ctx;
  const dealerOffers = history.filter((h) => h.actor === "dealer" && typeof h.amount === "number");
  const myOffers = history.filter((h) => h.actor === "buyer" && typeof h.amount === "number");
  const latest = dealerOffers[dealerOffers.length - 1];
  const rec = analysis.recommendation;

  if (!latest) {
    return {
      stance: "open",
      headline: "Send the opening offer, then wait.",
      body: rec.available
        ? `Your opening number is ${$(rec.target.value)} on the vehicle. Expect a counter — most dealers won't take a first offer, and one accepted instantly usually means you opened too high. Don't move again until they name a number.`
        : `We don't have enough comparable listings to set a confident opening number. Ask for their out-the-door figure itemized first — that costs you nothing and reveals where the fees sit.`,
      actions: ["Send the opening message", "Ask for an itemized out-the-door quote"],
    };
  }

  const prev = dealerOffers.length > 1 ? dealerOffers[dealerOffers.length - 2].amount : vehicle.price;
  const movement = prev - latest.amount;
  const gapToTarget = latest.amount - otdTarget;
  const fmv = analysis.fairMarketValue;
  const belowMarket = isKnown(fmv) && latest.amount < fmv.value;

  if (gapToTarget <= 0) {
    return {
      stance: "accept",
      headline: "Take it.",
      body: `At ${$(latest.amount)} they've met or beaten your target of ${$(otdTarget)}. ${belowMarket ? `That's below the comparable set — pushing further risks the deal for very little.` : `Pushing further risks the deal for marginal gain.`} Get the itemized buyer's order in writing before you go in, and confirm no line items appeared underneath.`,
      actions: ["Accept and request the buyer's order", "Confirm no add-ons were introduced"],
    };
  }

  if (movement <= 0) {
    return {
      stance: "hold",
      headline: "They didn't move. Hold.",
      body: `Their number is unchanged. Restate your figure once, plainly, and give them a reason to act — a date you're deciding by, or a competing listing. ${analysis.comparables.count >= 8 ? `You have ${analysis.comparables.count} comparable units nearby; name a cheaper one specifically.` : `With few comparables nearby your leverage is thin, so be ready to accept a modest concession.`}`,
      actions: ["Restate the offer", "Name a competing listing", "Set a decision deadline"],
    };
  }

  const movePct = movement / vehicle.price;
  if (movePct < 0.01) {
    return {
      stance: "hold",
      headline: `They moved only ${$(movement)}. Hold firm.`,
      body: `A concession that small is a test of whether you'll drift upward. Based on ${vehicle.listedDaysAgo != null ? `${vehicle.listedDaysAgo} days on the lot and ` : ""}${analysis.comparables.count} comparable listings, we recommend holding at ${$(otdTarget)} rather than splitting the difference. Splitting now teaches them every counter earns another step.`,
      actions: ["Hold at your number", "Ask what it would take to close today"],
    };
  }

  if (gapToTarget < vehicle.price * 0.012) {
    const mid = Math.round((latest.amount + otdTarget) / 2 / 25) * 25;
    return {
      stance: "close",
      headline: "You're close. Close it.",
      body: `${$(gapToTarget)} apart. Offer to sign today at the midpoint, ${$(mid)}, and ask them to confirm out the door in writing. At this distance the remaining gap is worth less than the risk of losing a motivated dealer.`,
      actions: ["Propose the midpoint", "Request the itemized buyer's order"],
    };
  }

  return {
    stance: "counter",
    headline: `They moved ${$(movement)}. Counter once more.`,
    body: `Meaningful movement means there's more room. ${belowMarket ? `Their number is already under the comparable set, so the remaining gap is smaller than it looks.` : `They're still above the comparable set.`} Counter at ${$(otdTarget)} and hold. ${myOffers.length >= 2 ? `You've moved ${myOffers.length} times — stop moving and let the number sit.` : ""}`,
    actions: ["Counter at your target", "Ask for the itemized quote"],
  };
}

/* ----------------------------------------------------------------------------
   HANDLERS
---------------------------------------------------------------------------- */
export async function handleNegotiate(req, env) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const { vehicle, pool = [], kind = "opening", tone, otdTarget: providedTarget, history = [] } = body;
  if (!vehicle || !vehicle.price) return json({ error: "vehicle with a price is required" }, 400);

  const analysis = analyze(vehicle, pool);
  const fees = feesFor(vehicle.dealer?.state);

  // Default scenario, seeded from the recommendation. Everything is editable
  // client-side; this is a starting position, not a verdict.
  const basePrice = analysis.recommendation.available ? analysis.recommendation.target.value : vehicle.price;
  const otd = calculateOTD({
    vehiclePrice: vehicle.price,
    dealerDiscount: Math.max(0, vehicle.price - basePrice),
    docFee: fees.docFee, titleReg: fees.titleReg,
    taxRate: fees.taxRate, tradeInCredit: fees.tradeInCredit,
  });

  const otdTarget = providedTarget ?? Math.round(otd.otd);
  const ctx = { vehicle, analysis, otdTarget, history };

  let message, messageSource = "template";
  if (env.ANTHROPIC_API_KEY) {
    try { message = await claudeMessage(ctx, kind, tone, env); messageSource = "claude"; }
    catch (err) { console.warn("[negotiate] draft failed, using template:", err.message); }
  }
  if (!message) message = templateMessage(ctx, kind);

  return json({
    analysis, fees, otd, otdTarget, message, messageSource,
    coaching: coach(ctx),
    generatedAt: new Date().toISOString(),
  });
}

export async function handleCoach(req, env) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const { vehicle, pool = [], history = [], otdTarget } = body;
  if (!vehicle) return json({ error: "vehicle is required" }, 400);

  const analysis = analyze(vehicle, pool);
  return json({ coaching: coach({ vehicle, analysis, history, otdTarget: otdTarget ?? vehicle.price }) });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
