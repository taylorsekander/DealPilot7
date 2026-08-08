/* ============================================================================
   MARKET ANALYSIS — pure functions. No DOM, no network, no I/O.
   Runs identically in the Worker and (for live recalculation) in the browser.
   ============================================================================

   ── THE PROVENANCE CONTRACT ─────────────────────────────────────────────────

   Every number this module emits is wrapped in a value object:

       { value, provenance, basis, ...extras }

   provenance is one of:

     "measured"     Came straight from the inventory provider. Asking price,
                    MSRP, days on market, dealer, mileage. We are repeating a
                    fact, not producing one.

     "derived"      Computed from measured values by arithmetic we can show.
                    Fair market value from comparables, spread, savings.
                    `basis` always names the inputs.

     "estimated"    Modeled with stated assumptions. Taxes, doc fees, monthly
                    payment. Directionally right, not authoritative.

     "unavailable"  WE DO NOT HAVE IT. `basis` explains why and what would be
                    required to get it. The UI renders these as an explicit
                    gap, never as a zero, a dash, or a plausible-looking guess.

   This exists because a negotiation tool that invents an invoice price is
   actively dangerous — the buyer carries our fabrication into a room with
   someone who knows the real number. Saying "we don't know" is the feature.
   ============================================================================ */

export const val = (value, provenance, basis, extra = {}) => ({ value, provenance, basis, ...extra });

export const unavailable = (basis, remedy = null) =>
  ({ value: null, provenance: "unavailable", basis, remedy });

export const isKnown = (v) => v && v.provenance !== "unavailable" && v.value != null;

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const round25 = (n) => Math.round(n / 25) * 25;
const $$ = (n) => "$" + Math.round(n).toLocaleString();

/* ----------------------------------------------------------------------------
   COMPARABLE SET

   A comparable is not "the same model." Trim changes price by thousands, and
   mileage dominates on used units. We tier the set so the UI can be honest
   about how close the matches really are.
---------------------------------------------------------------------------- */
export function buildComparables(vehicle, pool) {
  const others = pool.filter((v) => v.id !== vehicle.id && v.price > 0);

  const sameModel = others.filter(
    (v) => v.make === vehicle.make && v.model === vehicle.model
  );
  const sameTrim = sameModel.filter(
    (v) => norm(v.trim) && norm(v.trim) === norm(vehicle.trim)
  );

  // Used cars: only compare against similar mileage. A 12k-mile truck and a
  // 90k-mile truck are different products wearing the same badge.
  const mileageBand = vehicle.condition === "New" ? null : [vehicle.mileage * 0.6, vehicle.mileage * 1.4];
  const inBand = (v) => !mileageBand || (v.mileage >= mileageBand[0] && v.mileage <= mileageBand[1]);

  const tight = sameTrim.filter(inBand);
  const loose = sameModel.filter(inBand);

  // Prefer the tight set, but it needs enough members to mean anything.
  const set = tight.length >= 3 ? tight : loose.length >= 3 ? loose : sameModel;
  const tier = tight.length >= 3 ? "same trim" : loose.length >= 3 ? "same model, similar mileage" : "same model";

  return {
    list: set,
    tier,
    counts: { sameModel: sameModel.length, sameTrim: sameTrim.length, used: set.length },
  };
}

const norm = (s) => String(s || "").trim().toLowerCase();

/* ----------------------------------------------------------------------------
   FAIR MARKET VALUE

   The median asking price of the comparable set. Deliberately NOT a
   transaction-price model: we observe what dealers ASK, not what buyers PAY,
   and pretending otherwise would be the exact fabrication this module exists
   to prevent. The UI says "asking prices" everywhere for the same reason.

   Below three comparables we return unavailable rather than computing a median
   of two. A confident number from a sample of two is a lie with a decimal point.
---------------------------------------------------------------------------- */
export function fairMarketValue(vehicle, comps) {
  if (comps.list.length < 3) {
    return unavailable(
      `Only ${comps.list.length} comparable listing${comps.list.length === 1 ? "" : "s"} found nearby — too few to establish a market value.`,
      "Widen the search radius or relax the trim requirement to gather more comparables."
    );
  }
  const prices = comps.list.map((c) => c.price);
  const mid = median(prices);
  return val(round25(mid), "derived",
    `Median asking price of ${comps.list.length} comparable listings (${comps.tier}) within your search radius.`,
    { low: pct(prices, 0.15), high: pct(prices, 0.85), sampleSize: comps.list.length, tier: comps.tier });
}

/* ----------------------------------------------------------------------------
   PRICING CONFIDENCE

   How much weight should the buyer put on our numbers? Four inputs, shown
   openly so the score is auditable rather than magic.
---------------------------------------------------------------------------- */
export function pricingConfidence(vehicle, comps, fmv) {
  const factors = [];
  let score = 0;

  const n = comps.list.length;
  const samplePts = n >= 25 ? 40 : n >= 12 ? 32 : n >= 6 ? 22 : n >= 3 ? 12 : 0;
  score += samplePts;
  factors.push({
    label: "Comparable sample",
    detail: n ? `${n} similar listings (${comps.tier})` : "No comparable listings found",
    points: samplePts, max: 40,
  });

  // Tight spread = a real market price. Wide spread = the "market" is noise.
  let spreadPts = 0, spreadDetail = "Not enough comparables to measure spread";
  if (isKnown(fmv) && n >= 3) {
    const rel = (fmv.high - fmv.low) / fmv.value;
    spreadPts = rel < 0.06 ? 25 : rel < 0.12 ? 18 : rel < 0.2 ? 11 : 5;
    spreadDetail = `Middle 70% of asking prices span ${(rel * 100).toFixed(1)}% of value`;
  }
  score += spreadPts;
  factors.push({ label: "Price agreement", detail: spreadDetail, points: spreadPts, max: 25 });

  const domPts = vehicle.listedDaysAgo != null ? 15 : 0;
  score += domPts;
  factors.push({
    label: "Days on market",
    detail: vehicle.listedDaysAgo != null ? `${vehicle.listedDaysAgo} days reported` : "Not reported by the provider",
    points: domPts, max: 15,
  });

  const specKeys = ["trim", "drivetrain", "transmission", "engine", "exteriorColor"];
  const have = specKeys.filter((k) => vehicle[k] && (typeof vehicle[k] !== "object" || vehicle[k].name)).length;
  const specPts = Math.round((have / specKeys.length) * 20);
  score += specPts;
  factors.push({ label: "Listing completeness", detail: `${have} of ${specKeys.length} key specs present`, points: specPts, max: 20 });

  score = Math.max(0, Math.min(100, score));
  const band = score >= 75 ? "High" : score >= 50 ? "Moderate" : score >= 30 ? "Low" : "Insufficient";

  return val(score, "derived", `Composite of ${factors.length} measurable inputs.`, { band, factors });
}

/* ----------------------------------------------------------------------------
   MARKET POSITION + BADGES
---------------------------------------------------------------------------- */
export function marketPosition(vehicle, fmv) {
  if (!isKnown(fmv)) {
    return { delta: unavailable("Fair market value could not be established, so we can't say whether this price is high or low."), verdict: "unknown" };
  }
  const delta = vehicle.price - fmv.value;
  const relative = delta / fmv.value;
  const verdict =
    relative <= -0.06 ? "excellent" :
    relative <= -0.02 ? "good" :
    relative < 0.03 ? "fair" :
    relative < 0.08 ? "above" : "overpriced";

  return {
    delta: val(Math.round(delta), "derived",
      `Asking price minus the median of ${fmv.sampleSize} comparable listings.`,
      { relative }),
    verdict,
  };
}

export function badges(vehicle, comps, fmv, position) {
  const out = [];
  const push = (id, label, tone, why) => out.push({ id, label, tone, why });

  switch (position.verdict) {
    case "excellent": push("excellent-deal", "Excellent deal", "good", `Asking ${fmtAbs(position.delta.value)} below comparable listings.`); break;
    case "good": push("good-deal", "Good deal", "good", `Priced modestly under comparable listings.`); break;
    case "fair": push("fair-deal", "Fair deal", "neutral", `Within a few percent of comparable listings.`); break;
    case "above": push("above-market", "Above market", "warn", `Asking ${fmtAbs(position.delta.value)} more than comparable listings.`); break;
    case "overpriced": push("overpriced", "Overpriced", "bad", `Asking ${fmtAbs(position.delta.value)} more than comparable listings.`); break;
  }

  const d = vehicle.listedDaysAgo;
  if (d != null && d >= 90) push("highly-negotiable", "Highly negotiable", "good", `${d} days on the lot. Floorplan interest has been accruing the whole time.`);
  else if (d != null && d >= 60) push("negotiable", "Negotiable", "good", `${d} days on the lot — past the point most dealers start discounting.`);
  else if (d != null && d <= 10) push("fresh-inventory", "Fresh inventory", "warn", `Listed ${d} day${d === 1 ? "" : "s"} ago. Expect firm pricing.`);

  const n = comps.list.length;
  if (n >= 20) push("high-inventory", "High inventory", "good", `${n} comparable units nearby. Supply favours you.`);
  else if (n > 0 && n <= 3) push("low-inventory", "Low inventory", "warn", `Only ${n} comparable unit${n === 1 ? "" : "s"} nearby. Limited leverage.`);

  if (typeof vehicle.priceChangePercent === "number" && vehicle.priceChangePercent < -0.5) {
    push("price-drop", "Recent price reduction", "good",
      `Price moved ${vehicle.priceChangePercent.toFixed(1)}% recently — the dealer is already adjusting.`);
  }
  if (vehicle.msrp && vehicle.price > vehicle.msrp) {
    push("over-msrp", "Priced above MSRP", "bad", `${fmtAbs(vehicle.price - vehicle.msrp)} market adjustment over sticker.`);
  }
  if (vehicle.dealer?.dealerType === "franchise" && vehicle.condition === "New") {
    push("franchise", "Franchise dealer", "neutral", `Factory incentives and manufacturer financing may apply here.`);
  }
  return out;
}

const fmtAbs = (n) => "$" + Math.abs(Math.round(n)).toLocaleString();

/* ----------------------------------------------------------------------------
   COST-BASIS INPUTS WE CANNOT SOURCE

   Called out explicitly so the dashboard can show the gap rather than hide it.
   Each carries a concrete remedy, because "unavailable" without a path forward
   is just a dead end.
---------------------------------------------------------------------------- */
export function costBasis(vehicle) {
  const invoice = vehicle.invoice
    ? val(vehicle.invoice, "measured", "Reported by the inventory provider for this vehicle.")
    : unavailable(
        "Dealer invoice is not published by this inventory provider.",
        "auto.dev returns an invoice estimate per listing. Running both providers and merging would populate this."
      );

  // Holdback is real, but manufacturers do not publish it per VIN. Estimating
  // it from a rule of thumb would be inventing a number, so we don't.
  const holdback = unavailable(
    "Dealer holdback is not published per vehicle by any manufacturer.",
    "Typically 1–3% of MSRP by brand, but we won't estimate it — an invented figure would collapse under a dealer's actual numbers."
  );

  // [PLUG:INCENTIVES] MarketCheck sells an OEM Incentive API
  // (/v2/search/car/incentive/oem and incentive-by-make-and-ZIP). When that
  // subscription is active, wire it into shared/incentives-core.js and replace
  // this with measured data keyed on make + ZIP + model year.
  const incentives = unavailable(
    "Manufacturer incentives require a separate data subscription.",
    "MarketCheck's OEM Incentive API returns active rebates and APR offers by make and ZIP. Add it to populate this automatically."
  );

  return { invoice, holdback, incentives };
}

/* ----------------------------------------------------------------------------
   THE RECOMMENDATION

   Target, settlement range, and acceptance probability.

   The model is intentionally simple and legible. A buyer about to spend $60,000
   deserves reasoning they can follow and challenge, not a black box that says
   "our AI recommends $59,500."
---------------------------------------------------------------------------- */
export function recommendation(vehicle, comps, fmv, position) {
  const days = vehicle.listedDaysAgo;
  const n = comps.list.length;
  const prices = comps.list.map((c) => c.price);

  if (!isKnown(fmv)) {
    return {
      available: false,
      reason: unavailable(
        `We can't recommend an offer without a market baseline. Only ${n} comparable listing${n === 1 ? "" : "s"} were found.`,
        "Widen your radius or drop the trim requirement, then reopen this dashboard."
      ),
    };
  }

  /* Aggression scales with observable pressure on the dealer, nothing else.
     Each component is bounded so no single input can run away with the number. */
  let aggression = 0.04;                                   // baseline ask-down
  const notes = [];
  if (days != null) {
    if (days >= 90) { aggression += 0.035; notes.push(`${days} days on the lot is well past the point where floorplan cost bites`); }
    else if (days >= 60) { aggression += 0.025; notes.push(`${days} days on the lot puts real pressure on the dealer`); }
    else if (days >= 30) { aggression += 0.012; notes.push(`${days} days on the lot is moderate pressure`); }
    else { aggression -= 0.01; notes.push(`only ${days} days on the lot, so expect firm pricing`); }
  }
  if (n >= 20) { aggression += 0.015; notes.push(`${n} comparable units nearby means you can credibly walk`); }
  else if (n <= 4) { aggression -= 0.015; notes.push(`only ${n} comparable units nearby, which limits your leverage`); }
  if (position.verdict === "overpriced" || position.verdict === "above") {
    aggression += 0.02; notes.push(`it is already priced above the comparable set`);
  }
  aggression = Math.max(0.015, Math.min(0.11, aggression));

  // Anchor on the market, not on the dealer's ask — otherwise an inflated
  // sticker drags our "discount" upward and we flatter a bad price.
  const anchor = Math.min(fmv.value, vehicle.price);
  const target = round25(anchor * (1 - aggression));

  /* Settlement sits BETWEEN the opening offer and the anchor — a negotiation
     converges, it doesn't land outside its own bounds. How far it converges is
     the whole question, and dealer pressure decides it:

       heavy pressure (aged unit, deep supply)  → settles nearer YOUR number
       light pressure (fresh unit, thin supply) → settles nearer THEIR number

     Expressed as the fraction of the target→anchor gap the buyer gives back. */
  let concession = 0.5;
  if (days != null) {
    if (days >= 90) concession -= 0.16;
    else if (days >= 60) concession -= 0.10;
    else if (days >= 30) concession -= 0.03;
    else concession += 0.12;
  }
  if (n >= 20) concession -= 0.05; else if (n <= 4) concession += 0.07;
  if (position.verdict === "overpriced" || position.verdict === "above") concession -= 0.05;
  concession = Math.max(0.18, Math.min(0.82, concession));

  const gap = Math.max(0, anchor - target);
  const expected = round25(target + gap * concession);
  const settleLow = round25(target + gap * Math.max(0, concession - 0.18));
  const settleHigh = round25(target + gap * Math.min(1, concession + 0.18));

  return {
    available: true,
    target: val(target, "derived",
      `${(aggression * 100).toFixed(1)}% below the lower of asking price and market value, scaled by days on market and local supply.`,
      { aggression }),
    settlement: val(expected, "derived",
      `Where a negotiation between ${$$(target)} and ${$$(anchor)} typically converges, given ${days != null ? `${days} days on the lot` : "this dealer's position"} and ${n} comparable listings nearby.`,
      { low: settleLow, high: settleHigh, concession }),
    savings: val(Math.max(0, vehicle.price - expected), "derived",
      `Asking price minus the expected settlement. Not a guarantee — it is the outcome our inputs point to.`),
    probability: acceptanceProbability(target, vehicle, fmv, days, n),
    difficulty: difficulty(vehicle, comps, position, days),
    notes,
  };
}

/* Logistic on how far below market the offer sits, shifted by dealer pressure.
   Calibrated to be conservative: we would rather understate the odds than send
   someone into a negotiation over-confident. */
function acceptanceProbability(offer, vehicle, fmv, days, n) {
  const below = (fmv.value - offer) / fmv.value;   // how aggressive, relative to market
  let z = 2.4 - below * 26;
  if (days != null) z += days >= 90 ? 0.9 : days >= 60 ? 0.55 : days >= 30 ? 0.15 : -0.35;
  if (n >= 20) z += 0.25; else if (n <= 4) z -= 0.3;
  if (vehicle.condition !== "New") z += 0.2;      // used pricing carries more slack
  const p = 1 / (1 + Math.exp(-z));
  const pctVal = Math.round(Math.max(0.05, Math.min(0.92, p)) * 100);

  return val(pctVal, "estimated",
    `Modeled from how far the target sits below market, days on market, and local supply. This is a calibrated estimate, not an observed rate — we have no record of what this dealer has actually accepted.`);
}

function difficulty(vehicle, comps, position, days) {
  let s = 50;
  if (days != null) s -= days >= 90 ? 25 : days >= 60 ? 15 : days >= 30 ? 5 : -12;
  if (comps.list.length >= 20) s -= 10; else if (comps.list.length <= 4) s += 12;
  if (position.verdict === "overpriced") s -= 8;
  if (position.verdict === "excellent") s += 15;     // already cheap: little room left
  if (vehicle.condition === "New") s += 5;
  s = Math.max(5, Math.min(95, s));
  const label = s <= 30 ? "Easy" : s <= 55 ? "Moderate" : s <= 75 ? "Hard" : "Very hard";
  return val(s, "derived", `Scaled from days on market, local supply, and how the price already sits against the market.`, { label });
}

/* ----------------------------------------------------------------------------
   NARRATIVE

   One paragraph a person can read aloud. Every figure in it is traceable to a
   value object above; nothing is asserted that isn't computed.
---------------------------------------------------------------------------- */
export function narrative(vehicle, comps, fmv, position, rec) {
  const $ = (n) => "$" + Math.round(n).toLocaleString();
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`;

  if (!isKnown(fmv)) {
    return `We found ${comps.list.length} comparable listing${comps.list.length === 1 ? "" : "s"} for this ${name} in your search area — not enough to establish what the vehicle is worth. ` +
      `We won't recommend an offer on a sample this thin. Widen your radius or relax the trim filter and reopen this dashboard.`;
  }

  const parts = [];
  parts.push(
    `Based on ${fmv.sampleSize} comparable ${fmv.tier === "same trim" ? "listings of the same trim" : "listings"} within your search radius, ` +
    `this ${name} is priced ${position.delta.value > 0 ? `approximately ${$(position.delta.value)} above` : position.delta.value < 0 ? `approximately ${$(-position.delta.value)} below` : `right at`} the market.`
  );
  if (vehicle.listedDaysAgo != null) {
    parts.push(`The vehicle has been listed for ${vehicle.listedDaysAgo} days.`);
  }
  parts.push(
    `Comparable ${vehicle.condition === "New" ? "vehicles" : "vehicles with similar mileage"} are currently asking between ${$(fmv.low)} and ${$(fmv.high)}.`
  );
  if (rec.available) {
    parts.push(
      `Our recommendation is to open at ${$(rec.target.value)}, with a likely settlement near ${$(rec.settlement.value)}.`
    );
  }
  parts.push(
    `These are asking prices, not recorded sale prices — we can see what dealers advertise, not what buyers finally paid.`
  );
  return parts.join(" ");
}

/* ----------------------------------------------------------------------------
   FULL ANALYSIS — the single entry point.
---------------------------------------------------------------------------- */
export function analyze(vehicle, pool = []) {
  const comps = buildComparables(vehicle, pool);
  const fmv = fairMarketValue(vehicle, comps);
  const position = marketPosition(vehicle, fmv);
  const confidence = pricingConfidence(vehicle, comps, fmv);
  const rec = recommendation(vehicle, comps, fmv, position);

  return {
    fairMarketValue: fmv,
    position,
    confidence,
    badges: badges(vehicle, comps, fmv, position),
    costBasis: costBasis(vehicle),
    recommendation: rec,
    narrative: narrative(vehicle, comps, fmv, position, rec),
    comparables: {
      count: comps.list.length,
      tier: comps.tier,
      sample: comps.list.slice(0, 8).map((c) => ({
        id: c.id, year: c.year, trim: c.trim, price: c.price, mileage: c.mileage,
        dealer: c.dealer?.name, distanceMi: c.dealer?.distanceMi, daysOnLot: c.listedDaysAgo,
      })),
    },
    measured: {
      asking: val(vehicle.price, "measured", "Dealer's advertised price from the inventory feed."),
      msrp: vehicle.msrp
        ? val(vehicle.msrp, "measured", "Manufacturer's suggested retail price as listed by the dealer.")
        : unavailable("MSRP is not published on this listing.", "Common on used vehicles, where dealers rarely list original sticker."),
      daysOnMarket: vehicle.listedDaysAgo != null
        ? val(vehicle.listedDaysAgo, "measured", "Days this listing has been actively posted.")
        : unavailable("Days on market not reported for this listing."),
    },
  };
}
