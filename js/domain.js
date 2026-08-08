/* ============================================================================
   DOMAIN — pure functions. No DOM, no network.
   Everything here can be lifted into a Node service unchanged.
   ============================================================================ */

export const EMPTY_CRITERIA = {
  condition: null, make: null, model: null, trim: null,
  color: null, maxMileage: null, location: null, zip: null,
  radiusMi: 50, budgetMin: null, budgetMax: null,
  features: [],          // desired-feature ids, see js/features.js
  featuresHVF: null,     // resolved MarketCheck high_value_features string
  appliedFeatures: [],   // features the provider actually filtered on
};

export const money = (n) => "$" + Math.round(n).toLocaleString();

/* ----------------------------------------------------------------------------
   HARD FILTERS

   BUGFIX (v1.0): make, model and trim are now HARD constraints.

   In v0.1 trim was only a scoring penalty, so a search for an F-150 King Ranch
   could surface a Lariat near the top. That is precisely the bait-and-switch
   behaviour this product exists to counter, and it must never happen silently.

   When a strict search returns nothing, relaxSearch() below drops ONE
   constraint at a time and reports exactly what it dropped, so the user is
   told "no King Ranch in range — here are Lariats" rather than shown a Lariat
   labelled as a match.
---------------------------------------------------------------------------- */

const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const isAny = (v) => !v || v === "Any";

export function matchesHardCriteria(v, c, ignore = []) {
  const skip = (k) => ignore.includes(k);

  if (!skip("condition") && !isAny(c.condition)) {
    if (c.condition === "Used" && v.condition === "New") return false;
    if (c.condition === "New" && v.condition !== "New") return false;
    if (c.condition === "Certified" && v.condition !== "Certified") return false;
  }
  if (!skip("make") && !isAny(c.make) && !eq(v.make, c.make)) return false;
  if (!skip("model") && !isAny(c.model) && !eq(v.model, c.model)) return false;

  // Trim match is fuzzy on containment (feeds write "King Ranch 4WD SuperCrew"),
  // but it is still a HARD gate — a non-matching trim is excluded, not demoted.
  if (!skip("trim") && !isAny(c.trim)) {
    const want = String(c.trim).toLowerCase();
    const got = String(v.trim || "").toLowerCase();
    if (!got.includes(want) && !want.includes(got)) return false;
  }

  if (!skip("budget") && c.budgetMax && v.price > c.budgetMax) return false;
  if (!skip("budget") && c.budgetMin && v.price < c.budgetMin * 0.85) return false;
  if (!skip("mileage") && c.maxMileage && v.mileage > c.maxMileage) return false;
  if (!skip("radius") && c.radiusMi && v.dealer.distanceMi > c.radiusMi) return false;
  if (!skip("color") && !isAny(c.color) && v.exteriorColor.group !== c.color) return false;
  return true;
}

/* Order matters: we give up the things that cost the buyer least, first.
   Color before trim, trim before model, model never before make. */
const RELAX_ORDER = [
  // Features are relaxed FIRST and individually — dropping one nice-to-have is
  // far cheaper for the buyer than dropping the model they want. The per-feature
  // steps are generated at call time from the selection, cheapest weight first.
  { key: "color",   label: "exterior color" },
  { key: "radius",  label: "search radius (widened to 100 mi)" },
  { key: "mileage", label: "mileage ceiling" },
  { key: "budget",  label: "budget ceiling (+10%)" },
  { key: "trim",    label: "trim" },
  { key: "model",   label: "model" },
];

/**
 * Strict first. Only if strict is empty do we relax, one constraint at a time,
 * and we return exactly what was given up so the UI can say it out loud.
 */
export function searchWithRelaxation(inventory, criteria) {
  const strict = inventory.filter((v) => matchesHardCriteria(v, criteria));
  if (strict.length) return { results: strict, relaxed: [], strictCount: strict.length };

  const relaxed = [];
  const working = { ...criteria };
  for (const step of RELAX_ORDER) {
    if (step.key === "color" && isAny(criteria.color)) continue;
    if (step.key === "trim" && isAny(criteria.trim)) continue;
    if (step.key === "model" && isAny(criteria.model)) continue;
    if (step.key === "mileage" && !criteria.maxMileage) continue;

    if (step.key === "radius") working.radiusMi = Math.max(100, criteria.radiusMi || 50);
    if (step.key === "budget" && criteria.budgetMax) working.budgetMax = Math.round(criteria.budgetMax * 1.1);

    relaxed.push(step);
    const ignore = relaxed.map((r) => r.key).filter((k) => k !== "radius" && k !== "budget");
    const found = inventory.filter((v) => matchesHardCriteria(v, working, ignore));
    if (found.length) return { results: found, relaxed: [...relaxed], strictCount: 0 };
  }
  return { results: [], relaxed, strictCount: 0 };
}

/* ----------------------------------------------------------------------------
   SCORING — only ever ranks cars that already passed the hard gate.
---------------------------------------------------------------------------- */
export function scoreVehicle(v, c) {
  let score = 92;
  if (!isAny(c.color) && v.exteriorColor.group !== c.color) score -= 16;
  if (c.budgetMax) {
    const room = (c.budgetMax - v.price) / c.budgetMax;
    score += Math.max(-14, Math.min(7, room * 26));
  }
  if (c.maxMileage && v.mileage > c.maxMileage) score -= 14;
  score -= Math.min(10, v.dealer.distanceMi / 9);
  if (v.msrp > v.price) score += Math.min(8, ((v.msrp - v.price) / v.msrp) * 60);
  if (typeof v.dealer.rating === "number") score += (v.dealer.rating - 4) * 3;
  return Math.max(40, Math.min(99, Math.round(score)));
}

/** Per-card honesty flags: which requested fields does THIS car not satisfy? */
export function mismatchFlags(v, c) {
  const out = [];
  if (!isAny(c.trim)) {
    const want = String(c.trim).toLowerCase();
    const got = String(v.trim || "").toLowerCase();
    if (!got.includes(want) && !want.includes(got)) out.push(`Not a ${c.trim} — this is ${v.trim}`);
  }
  if (!isAny(c.color) && v.exteriorColor.group !== c.color) out.push(`${v.exteriorColor.group}, not ${c.color}`);
  if (c.budgetMax && v.price > c.budgetMax) out.push(`${money(v.price - c.budgetMax)} over your ceiling`);
  if (c.maxMileage && v.mileage > c.maxMileage) out.push(`${(v.mileage - c.maxMileage).toLocaleString()} mi over your limit`);
  if (c.radiusMi && v.dealer.distanceMi > c.radiusMi) out.push(`${Math.round(v.dealer.distanceMi - c.radiusMi)} mi outside your radius`);
  return out;
}

/* ----------------------------------------------------------------------------
   POST-SEARCH FILTERS + SORT
---------------------------------------------------------------------------- */
export function applyFilters(list, f) {
  return list.filter((v) => {
    if (v.price > f.priceMax) return false;
    if (v.mileage > f.mileageMax) return false;
    if (v.dealer.distanceMi > f.distanceMax) return false;
    if (f.conditions.length && !f.conditions.includes(v.condition)) return false;
    if (f.drivetrains.length && !f.drivetrains.includes(v.drivetrain)) return false;
    if (f.colors.length && !f.colors.includes(v.exteriorColor.group)) return false;
    return true;
  });
}

export const SORTS = {
  match:     { label: "Best match",         fn: (a, b) => b._score - a._score },
  priceAsc:  { label: "Price: low to high", fn: (a, b) => a.price - b.price },
  priceDesc: { label: "Price: high to low", fn: (a, b) => b.price - a.price },
  mileage:   { label: "Lowest mileage",     fn: (a, b) => a.mileage - b.mileage },
  distance:  { label: "Closest first",      fn: (a, b) => a.dealer.distanceMi - b.dealer.distanceMi },
  year:      { label: "Newest year",        fn: (a, b) => b.year - a.year || a.mileage - b.mileage },
  savings:   { label: "Biggest discount",   fn: (a, b) => (b.msrp - b.price) - (a.msrp - a.price) },
};

/* ----------------------------------------------------------------------------
   FREE-TEXT PARSING
   [PLUG:AI] Regex today. Swap for a tool-calling model call so a buyer can type
   "something safe for my kid under 25k, not white" and skip the guided flow.
---------------------------------------------------------------------------- */
export function parseFreeText(stepKey, text, catalogMakes = [], catalogModels = [], catalogTrims = []) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();
  switch (stepKey) {
    case "condition":
      if (/\bnew\b/.test(lower)) return "New";
      if (/certified|cpo/.test(lower)) return "Certified";
      if (/used|pre-?owned/.test(lower)) return "Used";
      return "Any";
    case "make":  return catalogMakes.find((m) => lower.includes(m.toLowerCase())) || "Any";
    case "model": return catalogModels.find((m) => lower.includes(m.toLowerCase())) || t || "Any";
    // Longest match first so "Sport Touring Hybrid" doesn't resolve to "Sport".
    case "trim": {
      const hit = [...catalogTrims].sort((a, b) => b.length - a.length)
        .find((x) => lower.includes(x.toLowerCase()));
      return hit || t || "Any";
    }
    case "budget": {
      const nums = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(k)?/gi)]
        .map((m) => { let n = parseFloat(m[1].replace(",", "")); if (m[2] || n < 500) n *= 1000; return Math.round(n); })
        .filter((n) => n >= 3000 && n <= 400000);
      if (nums.length >= 2) return { budgetMin: Math.min(...nums), budgetMax: Math.max(...nums) };
      if (nums.length === 1) return { budgetMin: null, budgetMax: nums[0] };
      return { budgetMin: null, budgetMax: null };
    }
    case "mileage": {
      const m = t.match(/(\d+(?:[.,]\d+)?)\s*(k)?/i);
      if (!m) return null;
      let n = parseFloat(m[1].replace(",", ""));
      if (m[2] || n < 500) n *= 1000;
      return Math.round(n);
    }
    default: return t;
  }
}

export const zipFrom = (s) => (String(s || "").match(/\b\d{5}\b/) || [null])[0];

/* ----------------------------------------------------------------------------
   SEARCH FUNNEL

   The single most useful diagnostic in this app. When a search returns two cars
   it is never obvious whether the provider had nothing or our own filters ate
   everything. This counts survivors at each stage so the answer is on screen
   instead of in a log.
---------------------------------------------------------------------------- */
export function searchFunnel(raw, c) {
  const stages = [];
  let cur = raw;
  const step = (label, key) => {
    const before = cur.length;
    cur = cur.filter((v) => matchesHardCriteria(v, c, allExcept(key)));
    stages.push({ label, before, after: cur.length, cut: before - cur.length });
  };
  const KEYS = ["make", "model", "trim", "condition", "color", "radius"];
  const allExcept = (upTo) => KEYS.slice(KEYS.indexOf(upTo) + 1);

  stages.push({ label: "Listings returned by provider", before: raw.length, after: raw.length, cut: 0 });
  if (!isAny(c.make)) step(`Make is ${c.make}`, "make");
  if (!isAny(c.model)) step(`Model is ${c.model}`, "model");
  if (!isAny(c.trim)) step(`Trim is ${c.trim}`, "trim");
  if (!isAny(c.condition)) step(`Condition is ${c.condition}`, "condition");
  if (!isAny(c.color)) step(`Color is ${c.color}`, "color");
  if (c.radiusMi) step(`Within ${c.radiusMi} mi`, "radius");
  return stages;
}

/* ----------------------------------------------------------------------------
   THE LOCAL ANALYST
   Deterministic. Runs with no API key and no cost, and is also the fallback
   whenever [PLUG:AI] the Claude call fails or times out — an empty read is
   worse than a plain one.
---------------------------------------------------------------------------- */
export function buildLocalSummary(criteria, results, relaxed = []) {
  if (!results.length) {
    return {
      headline: "Nothing in range clears your requirements.",
      body: [
        "Every listing we pulled failed at least one hard constraint, and loosening them one at a time didn't turn anything up either. In practice that means one requirement is doing all the damage — usually the radius or an exact trim.",
        "Widen the radius first. It costs you a drive, not money, and inventory density roughly doubles between 25 and 60 miles in most metros.",
      ],
      watchOuts: [
        "Trim is the most expensive thing to insist on. Dropping it typically multiplies your options.",
        "Certified units price between new and used but carry a manufacturer warranty — worth including.",
      ],
      priceRead: null,
    };
  }

  const prices = results.map((v) => v.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const low = prices[0], high = prices[prices.length - 1], spread = high - low;
  const belowMsrp = results.filter((v) => v.msrp && v.price < v.msrp * 0.97);
  const bestValue = [...results].filter((v) => v.msrp).sort((a, b) => (b.msrp - b.price) - (a.msrp - a.price))[0];
  const closest = [...results].sort((a, b) => a.dealer.distanceMi - b.dealer.distanceMi)[0];
  const top = [...results].sort((a, b) => b._score - a._score)[0];
  const aging = results.filter((v) => v.listedDaysAgo > 60);
  const over = criteria.budgetMax ? results.filter((v) => v.price > criteria.budgetMax) : [];

  const body = [];

  if (relaxed.length) {
    body.push(
      `Nothing matched your search exactly, so this set has had ${relaxed.map((r) => r.label).join(" and ")} relaxed. ` +
      `Read every card's flags before you get attached to one — these are near-misses, not what you asked for.`
    );
  }

  body.push(
    `${results.length} ${results.length === 1 ? "car" : "cars"} within ${criteria.radiusMi} miles of ${criteria.location || "you"}. ` +
    `Asking prices run ${money(low)} to ${money(high)}, middle of the pack at ${money(median)}. ` +
    (spread > 1500
      ? `A ${money(spread)} spread across comparable cars is your leverage — at least one of these dealers is priced to move and the others are not.`
      : `The spread is only ${money(spread)}, which means the market here is tight and your room will come from fees, not the vehicle line.`)
  );

  body.push(
    `Best fit is the ${top.year} ${top.make} ${top.model}${top.trim ? " " + top.trim : ""} at ${top.dealer.name}, ${top.dealer.distanceMi} mi out, ${money(top.price)}` +
    (top.mileage > 100 ? ` with ${top.mileage.toLocaleString()} miles. ` : ` in new condition. `) +
    (bestValue && bestValue.msrp > bestValue.price
      ? `Steepest discount off sticker is the ${bestValue.year} ${bestValue.model} at ${bestValue.dealer.name} — ${money(bestValue.msrp - bestValue.price)} under MSRP.`
      : `Nothing here is discounted off sticker, which tells you supply is running tight on this configuration.`)
  );

  const watchOuts = [];
  if (aging.length) watchOuts.push(`${aging.length} ${aging.length === 1 ? "listing has" : "listings have"} sat over 60 days. Those dealers are paying floorplan interest and are softest on price.`);
  if (belowMsrp.length) watchOuts.push(`${belowMsrp.length} of ${results.length} are already below MSRP. Use the lowest as your anchor with everyone else.`);
  if (over.length) watchOuts.push(`${over.length} ${over.length === 1 ? "car sits" : "cars sit"} above your ${money(criteria.budgetMax)} ceiling and are flagged on the card.`);
  watchOuts.push(`Closest is ${closest.dealer.name} at ${closest.dealer.distanceMi} mi. Distance is worth roughly ${money(400)} of price difference to most buyers — past that, drive.`);
  if (results.some((v) => v.condition === "Certified")) watchOuts.push(`Certified units here carry a manufacturer warranty. Price them against used, not against new.`);

  const withMsrp = results.filter((v) => v.msrp);
  let priceRead = null;
  if (withMsrp.length) {
    const avg = withMsrp.reduce((s, v) => s + (v.price - v.msrp), 0) / withMsrp.length;
    priceRead = avg < -300
      ? `This set averages ${money(Math.abs(avg))} below sticker. Start your offers below the lowest asking price here, not at it.`
      : avg > 300
      ? `This set averages ${money(avg)} above sticker. Expect resistance — widen the radius rather than pay the adjustment.`
      : `This set prices right around sticker on average. Your room is in fees and add-ons, not the vehicle line.`;
  }

  return {
    headline: relaxed.length
      ? `No exact match. ${results.length} near-misses, each flagged with what's different.`
      : !isAny(criteria.model)
        ? `${results.length} ${criteria.make || ""} ${criteria.model} listings, and ${money(spread)} of price spread to work with.`
        : `${results.length} matches, and the spread between them is where your money is.`,
    body, watchOuts, priceRead,
  };
}


/* ----------------------------------------------------------------------------
   DEALPILOT RATING

   The headline judgement on a result card. Deliberately computed from the
   CURRENT RESULT SET rather than a separate API call: the cars on screen are
   the buyer's real alternatives, so they are the honest benchmark.

   Returns null rather than a guess when the sample is too thin. A confident
   grade drawn from two comparables would be worse than no grade at all.
---------------------------------------------------------------------------- */
export function dealRating(vehicle, pool) {
  const comps = pool.filter(
    (v) => v.id !== vehicle.id && v.price > 0 &&
           v.make === vehicle.make && v.model === vehicle.model &&
           (vehicle.condition === "New" ? v.condition === "New" : v.condition !== "New")
  );
  if (comps.length < 3) {
    return { grade: null, label: "Not enough comparables", tone: "unknown", comps: comps.length };
  }

  const prices = comps.map((v) => v.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const rel = (vehicle.price - median) / median;

  // Aged inventory is genuinely a better deal at the same price, because the
  // asking number is more negotiable. Nudge the grade rather than the price.
  let adj = rel;
  if (vehicle.listedDaysAgo != null) {
    if (vehicle.listedDaysAgo >= 90) adj -= 0.02;
    else if (vehicle.listedDaysAgo >= 60) adj -= 0.012;
    else if (vehicle.listedDaysAgo <= 7) adj += 0.008;
  }

  const [grade, label, tone] =
    adj <= -0.07 ? ["A+", "Exceptional deal", "great"] :
    adj <= -0.035 ? ["A", "Excellent deal", "great"] :
    adj <= -0.012 ? ["B", "Good deal", "good"] :
    adj < 0.025 ? ["C", "Fair price", "fair"] :
    adj < 0.07 ? ["D", "Above market", "warn"] :
                 ["F", "Overpriced", "bad"];

  return {
    grade, label, tone,
    comps: comps.length,
    delta: Math.round(vehicle.price - median),
    median,
    basis: `Compared with ${comps.length} similar ${vehicle.make} ${vehicle.model} listings in your results (median ${money(median)}).`,
  };
}
