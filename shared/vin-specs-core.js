/* ============================================================================
   Platform-neutral core. Wrapped by src/index.js. Takes (request, env),
   returns a Response. Never reference process.env here.

   [PLUG:VIN-SPECS]  GET /api/vin-specs?vin=...

   ── What this is for ────────────────────────────────────────────────────────
   Inventory search tells us a truck is an "F-150 XLT". It does not tell us that
   THIS XLT carries the 302A package, the 3.5L EcoBoost, FX4 off-road and a tow
   package — roughly $9,000 of sticker that another XLT down the road doesn't
   have.

   Without that, comparing two XLTs on price is meaningless, and our fair-market
   value math reads an equipment gap as a pricing gap. This endpoint closes that.

   ── Source ──────────────────────────────────────────────────────────────────
   MarketCheck NeoVIN:
     GET https://api.marketcheck.com/v2/decode/car/neovin/{vin}/specs
         ?api_key=***&include_available_options=true

   Note there is NO window-sticker PDF or image in the response — we rebuild the
   Monroney ourselves from base MSRP + itemized options + destination. That is
   deliberate: no hotlinking, no redistribution question, and the layout matches
   the rest of the product.

   ── Cost ────────────────────────────────────────────────────────────────────
   One call per VIN. Decode results never change for a given VIN, so responses
   are cached hard (30 days) at the edge. Do NOT decode a whole search page —
   decode the vehicle being negotiated, and its close comparables, on demand.
   ============================================================================ */

import { val, unavailable } from "./market-analysis.js";

const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* NeoVIN reports confidence per attribute, and marks options verified or not.
   That maps directly onto our provenance contract: a verified option is a fact,
   an unverified one is an inference, and we render them differently rather than
   flattening both into a confident-looking list. */
function optionProvenance(o) {
  if (o.verified === true) return "measured";
  const c = String(o.confidence || "").toLowerCase();
  if (c === "high" || c === "confirmed") return "measured";
  return "estimated";
}

const OPTION_TYPE_ORDER = ["package", "option", "accessory", "color", "other"];

function normalizeOptions(list = []) {
  return list
    .map((o) => ({
      code: o.code || null,
      name: o.name || "Unnamed option",
      msrp: num(o.msrp),
      salePrice: num(o.sale_price),
      type: String(o.type || "other").toLowerCase(),
      provenance: optionProvenance(o),
      verified: o.verified === true,
      confidence: o.confidence || null,
    }))
    .sort((a, b) => {
      const ta = OPTION_TYPE_ORDER.indexOf(a.type), tb = OPTION_TYPE_ORDER.indexOf(b.type);
      if (ta !== tb) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb);
      return (b.msrp || 0) - (a.msrp || 0);   // biggest money first
    });
}

/* features / installed_equipment arrive as { category: [items] }. Flatten to a
   predictable shape the UI can group without knowing the category names. */
function flattenGrouped(obj = {}, pick) {
  const out = [];
  for (const [group, items] of Object.entries(obj || {})) {
    (items || []).forEach((it) => {
      const label = pick(it);
      if (label) out.push({ group: it.category || group, label });
    });
  }
  return out;
}

/* ----------------------------------------------------------------------------
   THE MONRONEY MODEL

   Everything the sticker renderer needs, already reconciled. We do the MSRP
   arithmetic here rather than in the browser so the Worker and any future
   native client agree on the totals.
---------------------------------------------------------------------------- */
function buildSticker(d, options) {
  const base = num(d.msrp);
  const delivery = num(d.delivery_charges);
  const optionsTotal = num(d.installed_options_msrp);
  const combined = num(d.combined_msrp);

  // Prefer the provider's combined figure; reconstruct only if it's absent.
  const reconstructed = [base, optionsTotal, delivery].some((x) => x != null)
    ? (base || 0) + (optionsTotal || 0) + (delivery || 0)
    : null;
  const total = combined ?? reconstructed;

  // If both exist and disagree by more than a rounding error, say so rather
  // than silently picking one. A sticker total that doesn't add up is exactly
  // the kind of thing a buyer would be embarrassed to be holding.
  const mismatch =
    combined != null && reconstructed != null && Math.abs(combined - reconstructed) > 25
      ? Math.round(combined - reconstructed)
      : null;

  const pricedOptions = options.filter((o) => o.msrp && o.msrp > 0);
  const unpricedOptions = options.filter((o) => !o.msrp || o.msrp <= 0);

  return {
    baseMsrp: base != null
      ? val(base, "measured", `Base MSRP for this trim${d.msrp_label ? ` (source: ${d.msrp_label})` : ""}.`)
      : unavailable("Base MSRP was not returned for this VIN."),
    optionsMsrp: optionsTotal != null
      ? val(optionsTotal, "measured", "Manufacturer's total for factory-installed options on this VIN.")
      : pricedOptions.length
        ? val(pricedOptions.reduce((s, o) => s + o.msrp, 0), "derived", "Sum of the itemized options below.")
        : unavailable("No option pricing returned for this VIN."),
    delivery: delivery != null
      ? val(delivery, "measured", "Destination and delivery charge. Non-negotiable — every buyer pays it.")
      : unavailable("Destination charge not returned for this VIN."),
    total: total != null
      ? val(total, combined != null ? "measured" : "derived",
          combined != null ? "Combined MSRP as built, including options and destination."
                           : "Base MSRP plus itemized options plus destination.")
      : unavailable("Not enough pricing data to reconstruct a sticker total."),
    mismatch,
    pricedOptions,
    unpricedOptions,
    taxes: (d.taxes || []).map((t) => ({ name: t.name, amount: num(t.amount) })),
    totalTax: num(d.total_tax),
    discounts: (d.discounts || []).map((t) => ({ name: t.name, amount: num(t.amount) })),
    totalDiscount: num(d.total_discount),
  };
}

/* ----------------------------------------------------------------------------
   NORMALIZE
---------------------------------------------------------------------------- */
export function normalizeSpecs(d) {
  const installed = normalizeOptions(d.installed_options_details);
  const available = normalizeOptions(d.available_options_details);

  return {
    vin: d.vin,
    decoded: true,
    identity: {
      year: d.year ?? null,
      make: d.make ?? null,
      model: d.model ?? null,
      trim: d.trim ?? null,
      version: d.version ?? null,          // "XLT 4dr SuperCrew 4WD 5.5 ft. SB"
      bodyType: d.body_type ?? null,
      bodySubtype: d.body_subtype ?? null,
      packageCode: d.package_code ?? null,
      manufacturerCode: d.manufacturer_code ?? null,
    },
    drivetrain: {
      engine: d.engine ?? null,
      transmission: d.transmission ?? null,
      transmissionDescription: d.transmission_description ?? null,
      drivetrain: d.drivetrain ?? null,
      powertrainType: d.powertrain_type ?? null,
      fuelType: d.fuel_type ?? null,
    },
    economy: {
      city: d.city_mpg ?? null,
      highway: d.highway_mpg ?? null,
      combined: d.combined_mpg ?? null,
    },
    colors: {
      exterior: d.exterior_color ? { name: d.exterior_color.name, code: d.exterior_color.code, base: d.exterior_color.base } : null,
      interior: d.interior_color ? { name: d.interior_color.name, code: d.interior_color.code, base: d.interior_color.base } : null,
    },
    dimensions: { doors: d.doors ?? null, seats: d.seating_capacity ?? null, weight: d.weight ?? null },
    sticker: buildSticker(d, installed),
    options: { installed, available, packagesSummary: d.options_packages || null },
    features: flattenGrouped(d.features, (f) => f.description),
    highValueFeatures: flattenGrouped(d.high_value_features, (f) => f.description),
    equipment: flattenGrouped(d.installed_equipment, (e) =>
      [e.item, e.attribute, e.value].filter(Boolean).join(" — ")),
    warranty: d.warranty || null,
    rating: d.rating || null,

    /* Decode confidence travels with the data. A "King Ranch" match built on a
       low-confidence trim decode should not be presented as certain, and the
       dashboard dims the panel when this is weak. */
    confidence: {
      record: typeof d.record_confidence === "number" ? d.record_confidence : null,
      trim: d.trim_confidence ?? null,
      version: d.version_confidence ?? null,
      transmission: d.transmission_confidence ?? null,
      source: d.record_source ?? null,
    },
    decodedAt: d.updated_at_date || d.created_at_date || null,
  };
}

/* ----------------------------------------------------------------------------
   CONTENT-ADJUSTED VALUE

   The reason this endpoint matters to the negotiation engine.

   Two XLTs at $58,000 and $52,000 are not a $6,000 pricing difference if the
   first carries $7,000 of options. This expresses the vehicle's price as a
   percentage of its as-built sticker, which IS comparable across differently
   equipped units.
---------------------------------------------------------------------------- */
export function contentAdjustment(specs, listingPrice) {
  const total = specs?.sticker?.total;
  if (!total || total.provenance === "unavailable" || !listingPrice) {
    return unavailable(
      "Can't content-adjust without a reconstructed sticker total for this VIN.",
      "Requires a successful NeoVIN decode with option pricing."
    );
  }
  const ratio = listingPrice / total.value;
  return val(Math.round(ratio * 1000) / 10, "derived",
    `Asking price as a percentage of this vehicle's as-built MSRP (${"$" + total.value.toLocaleString()}). Comparable across differently equipped units in a way that raw price is not.`,
    { asBuiltMsrp: total.value, discountFromSticker: Math.round(total.value - listingPrice) });
}

/* ----------------------------------------------------------------------------
   HANDLER
---------------------------------------------------------------------------- */
export async function handleVinSpecs(req, env) {
  const url = new URL(req.url);
  const vin = (url.searchParams.get("vin") || "").trim().toUpperCase();
  const price = Number(url.searchParams.get("price")) || null;

  if (vin.length !== 17) {
    return json({ error: "A 17-character VIN is required.", vin }, 400);
  }
  const key = env.MARKETCHECK_API_KEY;
  if (!key) {
    return json({
      error: "MARKETCHECK_API_KEY is not set, so VIN specs can't be decoded.",
      remedy: "Add it as a secret in your Cloudflare project settings and redeploy.",
    }, 503);
  }

  const api = `https://api.marketcheck.com/v2/decode/car/neovin/${encodeURIComponent(vin)}/specs`
    + `?api_key=${encodeURIComponent(key)}&include_available_options=true`;

  try {
    const res = await fetch(api, { headers: { Accept: "application/json" } });

    if (res.status === 422) {
      // Undecodable is a normal outcome, not an error. Older or grey-market
      // VINs simply aren't in the build database.
      return json({
        vin, decoded: false,
        reason: "NeoVIN has no build record for this VIN.",
        detail: "Common on older vehicles, imports, and some fleet units. Nothing is wrong with the listing.",
      }, 200, 3600);
    }
    if (!res.ok) {
      const text = await res.text();
      let msg = text.slice(0, 240);
      try { msg = JSON.parse(text).message || msg; } catch { /* not JSON */ }
      if (res.status === 401) throw new Error("MarketCheck rejected the API key (401).");
      if (res.status === 403) throw new Error("NeoVIN is not enabled on this MarketCheck plan (403).");
      if (res.status === 429) throw new Error("MarketCheck rate limit hit (429).");
      throw new Error(`neovin ${res.status}: ${msg}`);
    }

    const raw = await res.json();
    const specs = normalizeSpecs(raw);
    const adjustment = price ? contentAdjustment(specs, price) : null;

    // VIN decodes are immutable, so cache hard.
    return json({ vin, decoded: true, specs, adjustment }, 200, 2592000);
  } catch (err) {
    console.error("[vin-specs]", err);
    return json({ vin, decoded: false, error: String(err.message || err) }, 502);
  }
}

function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}
