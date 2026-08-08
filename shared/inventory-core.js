/* ============================================================================
   Platform-neutral core. Wrapped by netlify/functions/* and functions/api/*.
   Takes (request, env) and returns a Response — works on Node and on Workers.
   Do NOT reference process.env in here; env is passed in by the wrapper.

   [PLUG:LIVE-INVENTORY]  POST /api/inventory-search

   This is the seam between DealPilot and the real world. The browser never
   talks to a provider directly — API keys would be public and providers block
   browser origins anyway.

   Supported providers (pick with the INVENTORY_PROVIDER env var):

     marketcheck  api.marketcheck.com   DEFAULT. 6M+ deduplicated vehicles from
                                        16M+ dealer listings, US and Canada.
                                        Filters new/used/certified UPSTREAM,
                                        which auto.dev cannot do — that alone is
                                        why new-car searches work here.
     autodev      api.auto.dev          Kept as a fallback. Free tier, but the
                                        index skews heavily used and there is no
                                        condition filter. Its one advantage is
                                        vehicle.baseInvoice, which MarketCheck
                                        does not provide.

   Environment variables to set in Netlify
   (Site configuration → Environment variables):
     INVENTORY_PROVIDER   autodev | marketcheck
     AUTODEV_API_KEY      your auto.dev key
     MARKETCHECK_API_KEY  your MarketCheck key

   Adding a third provider = one more entry in PROVIDERS below. Nothing in the
   client changes, because every provider returns the SAME normalized shape.
   ============================================================================ */

const NORMALIZED_SHAPE = `
  { id, vin, stockNumber, condition, year, make, model, trim, bodyStyle,
    price, msrp, mileage, engine, drivetrain, transmission,
    exteriorColor:{name,hex,group}, interiorColor:{name,hex},
    dealer:{ id, name, city, state, distanceMi, rating },
    photos:[], vdpUrl, listedDaysAgo, providerId }`;

/* Feeds give colour as free text. Map it to a group so filters and swatches work. */
const COLOR_GROUPS = [
  [/black|ebony|onyx|midnight/i,            "Black",  "#111318"],
  [/white|pearl|ivory|frost/i,              "White",  "#EDEEEA"],
  [/silver|aluminum|platinum/i,             "Silver", "#B6BABD"],
  [/gray|grey|graphite|magnetic|gunmetal/i, "Gray",   "#6B7178"],
  [/blue|navy|cobalt|azure/i,               "Blue",   "#2F5D9E"],
  [/red|ruby|crimson|maroon|burgundy/i,     "Red",    "#9C2029"],
  [/green|forest|jade|sage/i,               "Green",  "#27473B"],
  [/brown|bronze|copper|tan|beige|khaki/i,  "Brown",  "#6B4F35"],
  [/gold|champagne/i,                       "Gold",   "#B99552"],
  [/orange/i,                               "Orange", "#C4611F"],
  [/yellow/i,                               "Yellow", "#D7B024"],
];

function normalizeColor(raw) {
  const name = (raw || "").trim();
  for (const [re, group, hex] of COLOR_GROUPS) {
    if (re.test(name)) return { name: name || group, hex, group };
  }
  return { name: name || "Not listed", hex: "#8A9096", group: "Other" };
}

function bodyStyleOf(raw) {
  const s = (raw || "").toLowerCase();
  if (/truck|pickup|crew cab|super cab/.test(s)) return "truck";
  if (/suv|crossover|wagon|van|minivan/.test(s)) return "suv";
  return "sedan";
}

function conditionOf(raw, certified) {
  if (certified) return "Certified";
  const s = (raw || "").toLowerCase();
  if (s.includes("new")) return "New";
  if (s.includes("certified")) return "Certified";
  return "Used";
}

const daysSince = (iso) => {
  if (!iso) return null;
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return Number.isFinite(d) && d >= 0 ? d : null;
};


/* ---------------------------------------------------------------- geo helpers --------
   auto.dev returns raw coordinates per listing but no distance, so we compute it.
   The buyer's ZIP is geocoded once per search via Zippopotam (free, no key), then
   every listing gets a great-circle distance from that point.

   If the geocode fails we leave distance at 0 rather than dropping the listing —
   a missing distance should degrade the sort, not hide inventory.
------------------------------------------------------------------------------------- */
const zipCache = new Map();

async function geocodeZip(zip) {
  if (!zip) return null;
  if (zipCache.has(zip)) return zipCache.get(zip);
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!res.ok) throw new Error(`zippopotam ${res.status}`);
    const j = await res.json();
    const place = j.places?.[0];
    const out = place
      ? { lat: parseFloat(place.latitude), lon: parseFloat(place.longitude), label: `${place["place name"]}, ${place["state abbreviation"]}` }
      : null;
    zipCache.set(zip, out);
    return out;
  } catch {
    zipCache.set(zip, null);
    return null;
  }
}

function haversineMi(a, b) {
  if (!a || !b) return 0;
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/* Feeds carry placeholder prices — $1, $500, $123. Sorting price-ascending puts
   them on page one, so a floor is not optional. Anything under this is treated as
   "price not disclosed" and dropped. */
const MIN_CREDIBLE_PRICE = 1000;

/* ------------------------------------------------------------------ auto.dev ----------
   Parameter names verified against docs.auto.dev/v2/products/vehicle-listings.

   Two things about this API that shape the code below:

   1. It REJECTS unknown parameters with a 400 INVALID_PARAMETER naming the
      offender — it does not ignore them. One wrong name fails the whole request.
      So we send a conservative set, and if it still objects we strip the named
      parameter and retry once. Self-healing beats a dead search.

   2. ?limit= is capped by plan (Starter 20, Growth 100, Scale 500) and clamps
      silently rather than erroring.

   Filters we deliberately do NOT send, because the parameter names aren't
   documented and a wrong guess kills the request: condition (new/used) and
   mileage. Both are enforced client-side in domain.js instead, which costs a
   few wasted rows but never costs a failed search.
------------------------------------------------------------------------------------- */
const autodev = {
  id: "auto.dev",

  buildParams(c) {
    const p = new URLSearchParams();
    if (c.make && c.make !== "Any") p.set("vehicle.make", c.make);
    if (c.model && c.model !== "Any") p.set("vehicle.model", c.model);
    if (c.trim && c.trim !== "Any") p.set("vehicle.trim", c.trim);
    if (c.budgetMax) p.set("retailListing.price", `1-${Math.round(c.budgetMax)}`);

    // Location: top-level `zip` and `distance`. NOT namespaced.
    if (c.zip) {
      p.set("zip", String(c.zip));
      p.set("distance", String(c.radiusMi || 50));
    }
    p.set("limit", "100");
    // Deliberately NOT sorting price-ascending: that puts placeholder $1-$500
    // listings on page one. Our own scoring ranks the set after normalization.
    return p;
  },

  /* Pagination.

     ?limit= is capped by plan and CLAMPS SILENTLY — ask for 100 on a plan that
     allows 20 and you get 20 with no error. That is why a broad search used to
     return almost nothing: we were reading one short page and stopping.

     The response carries links.next, a cursor URL. Following it stays fast at
     any depth, whereas ?page=N degrades past 100. We follow the cursor.

     Each page is one call against the monthly quota, so MAX_PAGES is a real
     cost decision, not a performance one. At 5 pages a search, 1,000 calls a
     month is ~200 searches. Raise it if you upgrade the plan; lower it if you
     are burning quota faster than expected.
  */
  async fetchListings(c, key, diag) {
    const MAX_PAGES = 5;
    const TARGET_ROWS = 200; // stop early once we plainly have enough to filter

    let params = this.buildParams(c);
    let nextUrl = `https://api.auto.dev/listings?${params}`;
    const collected = [];
    let pages = 0;

    while (nextUrl && pages < MAX_PAGES && collected.length < TARGET_ROWS) {
      let res, json;

      // Inner loop: retry with an offending parameter stripped. Only ever
      // applies to the first request — cursor URLs carry their own filters.
      for (let attempt = 0; attempt < 4; attempt++) {
        diag.attempts.push(nextUrl.replace(key, "***"));
        res = await fetch(nextUrl, {
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        });
        if (res.ok) { json = await res.json(); break; }

        const text = await res.text();
        let err = {};
        try { err = JSON.parse(text); } catch { /* non-JSON body */ }

        const bad = err.code === "INVALID_PARAMETER" &&
          (err.error || "").match(/Invalid parameter provided:\s*([\w.]+)/)?.[1];
        const key2 = bad && ([...params.keys()].find((k) => k === bad || k.toLowerCase().endsWith(bad.toLowerCase())));
        if (key2) {
          diag.warnings.push(`auto.dev rejected "${bad}" — retried without it.`);
          params.delete(key2);
          nextUrl = `https://api.auto.dev/listings?${params}`;
          continue;
        }
        throw new Error(`auto.dev ${res.status}: ${text.slice(0, 300)}`);
      }
      if (!json) throw new Error("auto.dev: too many parameter rejections; check filter names against current docs");

      const rows = Array.isArray(json.data) ? json.data : [];
      collected.push(...rows);
      pages++;

      // Detect the plan clamp once, so the UI can explain a thin result set.
      if (pages === 1) {
        const asked = Number(params.get("limit"));
        if (rows.length && asked && rows.length < asked) {
          diag.planPageSize = rows.length;
          diag.warnings.push(
            `Your auto.dev plan caps pages at ${rows.length} listings (we asked for ${asked}). ` +
            `Fetching up to ${MAX_PAGES} pages to compensate.`
          );
        }
      }

      // links.next is relative (e.g. /listings?cursor=...). Resolve it.
      const next = json.links?.next;
      nextUrl = next && rows.length ? new URL(next, "https://api.auto.dev").toString() : null;
    }

    diag.pagesFetched = pages;
    diag.rowsCollected = collected.length;
    return collected;
  },

  /* Field map verified against a live auto.dev response (2026-08-05).
     Notable shapes, all different from the obvious guess:
       retailListing.dealer     — a STRING (dealer name), not an object
       retailListing.dealerId   — the id lives separately
       vehicle.baseMsrp         — MSRP is on the vehicle, not the listing
       vehicle.baseInvoice      — invoice estimate, gold for [PLUG:NEGOTIATION]
       retailListing.used       — boolean; there is no "condition" string
       location: [lon, lat]     — GeoJSON order, longitude FIRST
       (no stock number is provided by this API at all) */
  normalize(raw, i, ctx = {}) {
    const v = raw.vehicle || {};
    const r = raw.retailListing || {};
    const coords = Array.isArray(raw.location) ? { lon: raw.location[0], lat: raw.location[1] } : null;

    const photos = [];
    if (r.primaryImage) photos.push(r.primaryImage);

    return {
      id: raw.vin || raw["@id"] || `autodev_${i}`,
      isMock: false,
      providerId: "auto.dev",
      vin: raw.vin || v.vin || null,
      stockNumber: null, // auto.dev does not expose one
      condition: r.cpo === true ? "Certified" : r.used === false ? "New" : "Used",
      year: Number(v.year) || null,
      make: v.make || null,
      model: v.model || null,
      trim: v.trim || null,
      series: v.series || null, // full factory description, e.g. "XLT 4dr SuperCrew 4WD"
      bodyStyle: bodyStyleOf(v.style || v.bodyStyle || v.type),
      price: Number(r.price) || 0,
      msrp: Number(v.baseMsrp) || null,
      invoice: Number(v.baseInvoice) || null, // [PLUG:NEGOTIATION] anchor for offers
      mileage: Number(r.miles) || 0,
      engine: v.engine || null,
      drivetrain: v.drivetrain || null,
      transmission: v.transmission || null,
      fuel: v.fuel || null,
      exteriorColor: normalizeColor(v.exteriorColor),
      interiorColor: normalizeColor(v.interiorColor),
      dealer: {
        id: r.dealerId || `d_${i}`,
        // `dealer` is the name string. Guard anyway in case they ever objectify it.
        name: (typeof r.dealer === "string" ? r.dealer : r.dealer?.name) || "Dealer name not provided",
        city: r.city || null,
        state: r.state || null,
        zip: r.zip || null,
        distanceMi: coords && ctx.origin ? haversineMi(ctx.origin, coords) : 0,
        rating: null, // not provided by this API
      },
      photos,
      photoCount: Number(r.photoCount) || photos.length,
      carfaxUrl: r.carfaxUrl || null,
      vdpUrl: r.vdp || null,
      listedDaysAgo: daysSince(raw.createdAt),
      // auto.dev's own match confidence. Low values mean the trim/spec decode is
      // shaky, which matters when we are enforcing an exact trim.
      sourceConfidence: typeof v.confidence === "number" ? v.confidence : null,
    };
  },
};

/* --------------------------------------------------------------- MarketCheck ----------
   Verified against docs.marketcheck.com (Inventory Search, Aug 2026).

   GET https://api.marketcheck.com/v2/search/car/active
   Auth: api_key as a QUERY PARAMETER (not a header — unlike auto.dev).

   ── Why this provider handles new inventory better ──────────────────────────
   The decisive difference is `car_type`. MarketCheck filters new / used /
   certified UPSTREAM. auto.dev has no documented condition parameter, so we had
   to fetch a mixed page and discard non-new rows client-side — which is exactly
   why a "new King Ranch" search kept coming back empty. Here, asking for new
   means every row returned is new.

   Also filtered upstream now, all of which used to be client-side attrition:
     trim              exact trim, comma-separated
     base_ext_color    MarketCheck's STANDARDIZED colour, so "Agate Black" and
                       "Black" both match a Black search
     zip + radius      and every listing comes back with `dist` already computed,
                       so no geocoding round-trip

   ── Pagination ──────────────────────────────────────────────────────────────
   Offset-based: rows (max 50, default 10) + start. num_found gives the true
   total, so we know when to stop instead of guessing. 50/page beats auto.dev's
   20 by 2.5x, and each page is one call against quota.

   ── One real loss versus auto.dev ───────────────────────────────────────────
   MarketCheck returns msrp but NOT dealer invoice. auto.dev's vehicle.baseInvoice
   was the strongest anchor the negotiation engine had. buildPriceIntel() already
   degrades gracefully — with no invoice it anchors on the lowest comparable
   instead — but new-car offers will be less aggressive than they were.
   `dom` (days on market) partly compensates and is more reliable here.
------------------------------------------------------------------------------------- */
const marketcheck = {
  id: "marketcheck",

  buildParams(c, key) {
    const p = new URLSearchParams({ api_key: key, country: "us" });

    if (c.make && c.make !== "Any") p.set("make", c.make);
    if (c.model && c.model !== "Any") p.set("model", c.model);
    if (c.trim && c.trim !== "Any") p.set("trim", c.trim);

    // The whole reason for switching providers.
    if (c.condition === "New") p.set("car_type", "new");
    else if (c.condition === "Used") { p.set("car_type", "used"); p.set("exclude_certified", "true"); }
    else if (c.condition === "Certified") p.set("car_type", "certified");

    // base_ext_color is MarketCheck's normalized colour bucket, which is what
    // our own colour groups are modelled on. exterior_color would be the raw
    // marketing name ("Agate Black Metallic") and would miss most matches.
    if (c.color && c.color !== "Any") p.set("base_ext_color", c.color);

    if (c.zip) { p.set("zip", String(c.zip)); p.set("radius", String(c.radiusMi || 50)); }
    if (c.maxMileage) p.set("miles_range", `0-${Math.round(c.maxMileage)}`);

    /* [FEATURES] high_value_features is an AND filter — every listing returned
       carries ALL of them. That is what lets the UI print feature chips as
       confirmed fact without decoding a single VIN.

       It also means eight selected features will very likely return nothing,
       so the caller relaxes them one at a time (js/domain.js RELAX_ORDER) and
       tells the buyer what was dropped. We never silently ignore a must-have. */
    if (c.featuresHVF) p.set("high_value_features", c.featuresHVF);

    p.set("has_price", "true");     // skip listings with no advertised price
    p.set("rows", "50");            // documented maximum
    p.set("start", "0");
    if (c.zip) { p.set("sort_by", "dist"); p.set("sort_order", "asc"); }
    return p;
  },

  async fetchListings(c, key, diag) {
    const MAX_PAGES = 4;   // 4 x 50 = up to 200 listings, 4 calls against quota
    const ROWS = 50;
    const params = this.buildParams(c, key);
    const collected = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      params.set("start", String(page * ROWS));
      const url = `https://api.marketcheck.com/v2/search/car/active?${params}`;
      diag.attempts.push(url.replace(key, "***"));

      const res = await fetch(url, { headers: { Accept: "application/json" } });

      if (!res.ok) {
        const text = await res.text();
        // 422 on a later page means we hit the plan's pagination ceiling — that
        // is a limit, not a failure. Keep whatever we already collected.
        if (res.status === 422 && page > 0) {
          diag.warnings.push(`Pagination limit reached after ${collected.length} listings (plan cap).`);
          break;
        }
        let msg = text.slice(0, 300);
        try { msg = JSON.parse(text).message || msg; } catch { /* not JSON */ }
        if (res.status === 401) throw new Error(`MarketCheck rejected the API key (401). Check MARKETCHECK_API_KEY.`);
        if (res.status === 429) throw new Error(`MarketCheck rate limit hit (429). Wait, then retry.`);
        throw new Error(`marketcheck ${res.status}: ${msg}`);
      }

      const json = await res.json();
      const rows = json.listings || [];
      if (page === 0) {
        diag.total = json.num_found ?? null;
        if (json.num_found === 0) diag.warnings.push("MarketCheck matched 0 listings for these filters.");
      }
      collected.push(...rows);

      if (rows.length < ROWS) break;                       // last page
      if (diag.total && collected.length >= diag.total) break;
    }

    diag.pagesFetched = Math.ceil(collected.length / ROWS) || 1;
    diag.rowsCollected = collected.length;
    return collected;
  },

  /* Field map verified against the documented response schema.
     Notable: build{} holds the specs, dealer{} is a real object (unlike
     auto.dev's dealer string), dist is precomputed, and certification is
     is_certified === 1 layered on inventory_type === "used". */
  normalize(raw, i) {
    const b = raw.build || {};
    const d = raw.dealer || raw.mc_dealership || {};

    const condition = raw.is_certified === 1 ? "Certified"
      : String(raw.inventory_type || "").toLowerCase() === "new" ? "New" : "Used";

    // Prefer the standardized colour for grouping, keep the marketing name for display.
    const ext = normalizeColor(raw.base_ext_color || raw.exterior_color);
    if (raw.exterior_color) ext.name = raw.exterior_color;

    const engine = b.engine ||
      [b.engine_size && `${Number(b.engine_size).toFixed(1)}L`,
       b.engine_block && b.cylinders ? `${b.engine_block}${b.cylinders}` : null].filter(Boolean).join(" ") || null;

    return {
      id: String(raw.id || raw.vin || `mc_${i}`),
      isMock: false,
      providerId: "marketcheck",
      vin: raw.vin || null,
      stockNumber: raw.stock_no || null,
      condition,
      year: Number(b.year) || null,
      make: b.make || null,
      model: b.model || null,
      trim: b.trim || null,
      series: b.version || null,
      bodyStyle: bodyStyleOf(b.body_type || b.vehicle_type),
      price: Number(raw.price) || 0,
      msrp: Number(raw.msrp) || null,
      invoice: null, // not provided by MarketCheck — see the note above
      mileage: Number(raw.miles) || 0,
      engine,
      drivetrain: b.drivetrain || null,
      transmission: b.transmission || null,
      fuel: b.fuel_type || null,
      exteriorColor: ext,
      interiorColor: normalizeColor(raw.interior_color || raw.base_int_color),
      dealer: {
        id: String(d.id || `d_${i}`),
        name: d.name || "Dealer name not provided",
        city: d.city || null,
        state: d.state || null,
        zip: d.zip || null,
        phone: d.phone || null,
        // Franchise dealers carry new inventory and factory incentives;
        // independents do not. Useful signal on a new-car search.
        dealerType: d.dealer_type || null,
        distanceMi: raw.dist != null ? Math.round(Number(raw.dist) * 10) / 10 : 0,
        rating: null, // MarketCheck does not return a dealer rating here
      },
      photos: raw.media?.photo_links_cached?.length ? raw.media.photo_links_cached : (raw.media?.photo_links || []),
      photoCount: (raw.media?.photo_links || []).length,
      carfaxUrl: null,
      carfaxOneOwner: raw.carfax_1_owner ?? null,
      carfaxCleanTitle: raw.carfax_clean_title ?? null,
      vdpUrl: raw.vdp_url || null,
      // dom_active is days on market while actively listed — the number that
      // actually reflects floorplan pressure. dom is lifetime across relistings.
      listedDaysAgo: Number(raw.dom_active ?? raw.dom) || null,
      priceChangePercent: raw.price_change_percent ?? null,
      sourceConfidence: null,
    };
  },
};

const PROVIDERS = { autodev, marketcheck };

/* ------------------------------------------------------------------- handler ---------- */
export async function handleInventorySearch(req, env) {
  const url = new URL(req.url);
  let body = {};

  /* ------------------------------------------------------------------ GET debug -----
     Visit this in a browser — no console, no curl:

       /api/inventory-search?debug=1&make=Ford&model=F-150&zip=20147

     Returns the provider's UNTOUCHED first record next to our normalized version,
     plus a field report naming every mapping that came back empty. That report is
     the fastest way to fix a normalizer: it says exactly which guesses were wrong.
  ---------------------------------------------------------------------------------- */
  if (req.method === "GET") {
    const q = url.searchParams;
    if (!q.get("debug")) {
      return json({ error: "POST only, or add ?debug=1 to inspect a live response", normalizedShape: NORMALIZED_SHAPE }, 405);
    }
    body = {
      debug: true,
      provider: q.get("provider") || undefined,
      criteria: {
        make: q.get("make") || undefined,
        model: q.get("model") || undefined,
        trim: q.get("trim") || undefined,
        zip: q.get("zip") || undefined,
        radiusMi: Number(q.get("radius")) || 100,
        budgetMax: Number(q.get("budgetMax")) || undefined,
      },
    };
  } else if (req.method === "POST") {
    try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  } else {
    return json({ error: "GET or POST only" }, 405);
  }

  const criteria = body.criteria || {};

  const name = body.provider || env.INVENTORY_PROVIDER || "marketcheck";
  const provider = PROVIDERS[name];
  if (!provider) return json({ error: `unknown provider "${name}"` }, 400);

  const key = name === "autodev" ? env.AUTODEV_API_KEY : env.MARKETCHECK_API_KEY;
  if (!key) {
    return json({
      error: `Missing API key. Set ${name === "autodev" ? "AUTODEV_API_KEY" : "MARKETCHECK_API_KEY"} ` +
             `as an environment variable (Cloudflare: Settings → Variables and Secrets · ` +
             `Netlify: Site configuration → Environment variables), then redeploy.`,
    }, 503);
  }

  // diag travels with the request so the browser can see exactly what was sent.
  // This is what turns "it silently used sample data" into an actionable error.
  const diag = { attempts: [], warnings: [], total: null };

  try {
    const raw = await provider.fetchListings(criteria, key, diag);

    // MarketCheck returns `dist` per listing, so the geocode round-trip is only
    // needed for providers (auto.dev) that give raw coordinates instead.
    const origin = provider.id === "auto.dev" ? await geocodeZip(criteria.zip) : null;
    if (provider.id === "auto.dev" && criteria.zip && !origin) {
      diag.warnings.push(`Could not geocode ZIP ${criteria.zip} — distances unavailable.`);
    }
    const ctx = { origin };

    const normalized = raw.map((r, i) => provider.normalize(r, i, ctx));
    const results = normalized.filter((v) => v.price >= MIN_CREDIBLE_PRICE);
    const dropped = normalized.length - results.length;
    if (dropped) diag.warnings.push(`${dropped} listing(s) dropped for a placeholder price under $${MIN_CREDIBLE_PRICE}.`);

    // Debug view: POST {"debug":true} to see one untouched provider record
    // alongside our normalized version. Use this to fix field mapping fast.
    if (body.debug) {
      const all = raw.map((r, i) => provider.normalize(r, i, ctx));
      const n = all[0] || {};
      const empty = (v) => v === null || v === undefined || v === "" || v === 0;

      // Which normalized fields came back empty across the whole page? A field
      // that is empty on EVERY record is a wrong guess, not missing data.
      const alwaysEmpty = [
        "vin", "price", "msrp", "mileage", "trim", "engine", "drivetrain", "transmission",
      ].filter((k) => all.length && all.every((v) => empty(v[k])));
      const dealerAlwaysEmpty = ["name", "city", "state", "distanceMi"]
        .filter((k) => all.length && all.every((v) => empty(v.dealer?.[k])));

      return json({
        source: provider.id,
        diag,
        counts: {
          rawReturned: raw.length,
          normalized: all.length,
          survivedPriceFilter: all.filter((v) => v.price >= MIN_CREDIBLE_PRICE).length,
          origin: origin || "geocode failed",
        },
        fieldReport: {
          alwaysEmpty,
          dealerAlwaysEmpty,
          note: alwaysEmpty.length || dealerAlwaysEmpty.length
            ? "These normalized fields are empty on EVERY record — the source field names differ from what the adapter expects. Compare against rawSample below."
            : "All critical fields mapped successfully.",
        },
        rawTopLevelKeys: raw[0] ? Object.keys(raw[0]) : [],
        rawSample: raw[0] ?? null,
        normalizedSample: n,
      }, 200);
    }

    return json({
      results,
      source: provider.id,
      meta: {
        totalScanned: raw.length,
        returned: results.length,
        providerTotal: diag.total,
        pagesFetched: diag.pagesFetched,
        planPageSize: diag.planPageSize || null,
        warnings: diag.warnings,
        requests: diag.attempts,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[inventory-search]", err, diag);
    return json({ error: String(err.message || err), diag }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
