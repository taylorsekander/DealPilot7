/* ============================================================================
   DESIRED FEATURES

   Two jobs:
     1. Give buyers a short, human list of things they actually care about.
     2. Map each one to a MarketCheck High Value Feature (HVF) string so the
        filtering happens UPSTREAM rather than in the browser.

   ── Why upstream matters ────────────────────────────────────────────────────
   MarketCheck's Inventory Search accepts `high_value_features` as a filter.
   That has a useful consequence: if we ask for "Heated Seats" and the API
   returns a listing, that listing HAS heated seats. We can therefore print the
   chip on the card as a confirmed fact with no extra call and no VIN decode.

   The alternative — decoding every listing to find out what's on it — would
   cost one API call per card. This costs nothing.

   ── The trap we're avoiding ─────────────────────────────────────────────────
   `high_value_features` is an AND filter. Select eight features and you will
   very likely get zero results, which is exactly the failure mode that made
   early searches look broken. So features feed the existing relaxation ladder:
   strict first, then drop the least-important feature one at a time, and always
   tell the buyer what was given up. See RELAX_ORDER in js/domain.js.

   ── ⚠️ Verify the `mc` strings ──────────────────────────────────────────────
   The HVF values below are our best mapping to MarketCheck's taxonomy. They
   should be validated against the live taxonomy before launch:

       GET /v2/search/car/auto-complete?field=high_value_features
       GET /v2/taxonomy/terms?field=high_value_features

   A wrong string silently matches nothing. `probe()` at the bottom of this file
   exists to check them in one pass.
   ============================================================================ */

/**
 * id       stable key stored in criteria.features
 * label    what the buyer sees
 * mc       MarketCheck high_value_features value sent upstream (null = local only)
 * group    used to organise the picker
 * weight   how much losing this hurts, 1–3. Drives relaxation order: we give up
 *          weight-1 features before weight-3 ones.
 * derive   optional: detect the feature from listing fields we already have,
 *          for listings that came back without an upstream feature filter
 */
export const FEATURES = [
  // ── Comfort ──────────────────────────────────────────────────────────────
  { id: "heated_seats", label: "Heated seats", mc: "Heated Seats", group: "Comfort", weight: 2 },
  { id: "ventilated_seats", label: "Ventilated seats", mc: "Cooled Seats", group: "Comfort", weight: 1 },
  { id: "heated_wheel", label: "Heated steering wheel", mc: "Heated Steering Wheel", group: "Comfort", weight: 1 },
  { id: "leather", label: "Leather seats", mc: "Leather Seats", group: "Comfort", weight: 2 },
  { id: "sunroof", label: "Sunroof / moonroof", mc: "Sunroof/Moonroof", group: "Comfort", weight: 2 },
  { id: "remote_start", label: "Remote start", mc: "Remote Start", group: "Comfort", weight: 1 },
  { id: "power_liftgate", label: "Power liftgate", mc: "Power Liftgate", group: "Comfort", weight: 1 },

  // ── Technology ───────────────────────────────────────────────────────────
  { id: "carplay", label: "Apple CarPlay", mc: "Apple CarPlay", group: "Technology", weight: 3 },
  { id: "android_auto", label: "Android Auto", mc: "Android Auto", group: "Technology", weight: 3 },
  { id: "navigation", label: "Built-in navigation", mc: "Navigation System", group: "Technology", weight: 1 },
  { id: "premium_audio", label: "Premium audio", mc: "Premium Sound System", group: "Technology", weight: 1 },
  { id: "wireless_charging", label: "Wireless charging", mc: "Wireless Charging", group: "Technology", weight: 1 },

  // ── Safety & driver assist ───────────────────────────────────────────────
  { id: "adaptive_cruise", label: "Adaptive cruise", mc: "Adaptive Cruise Control", group: "Safety", weight: 3 },
  { id: "blind_spot", label: "Blind spot monitor", mc: "Blind Spot Monitor", group: "Safety", weight: 3 },
  { id: "lane_assist", label: "Lane keep assist", mc: "Lane Departure Warning", group: "Safety", weight: 2 },
  { id: "backup_camera", label: "Backup camera", mc: "Backup Camera", group: "Safety", weight: 2 },
  { id: "camera_360", label: "360° camera", mc: "360 Degree Camera", group: "Safety", weight: 1 },
  { id: "parking_sensors", label: "Parking sensors", mc: "Parking Sensors", group: "Safety", weight: 1 },

  // ── Capability ───────────────────────────────────────────────────────────
  { id: "tow_package", label: "Tow package", mc: "Tow Package", group: "Capability", weight: 3 },
  { id: "third_row", label: "Third-row seating", mc: "Third Row Seating", group: "Capability", weight: 3 },
  {
    id: "awd", label: "AWD / 4WD", mc: null, group: "Capability", weight: 3,
    // Drivetrain is already on every listing, so this never needs a feature filter.
    derive: (v) => /awd|4wd|4x4|all.?wheel|four.?wheel/i.test(v.drivetrain || ""),
  },
];

export const FEATURE_GROUPS = [...new Set(FEATURES.map((f) => f.group))];
export const featureById = (id) => FEATURES.find((f) => f.id === id) || null;
export const featureLabel = (id) => featureById(id)?.label || id;

/** Selected ids → the comma-separated value MarketCheck expects. */
export function toMarketCheckHVF(ids = []) {
  return ids.map(featureById).filter((f) => f && f.mc).map((f) => f.mc).join(",");
}

/** Sorted so the cheapest concession is relaxed first. */
export function byRelaxPriority(ids = []) {
  return [...ids]
    .map(featureById)
    .filter(Boolean)
    .sort((a, b) => a.weight - b.weight || a.label.localeCompare(b.label));
}

/* ----------------------------------------------------------------------------
   WHAT A LISTING IS KNOWN TO HAVE

   Three tiers of certainty, and the UI distinguishes them:

     confirmed  We filtered upstream on it, so its presence is a fact.
     derived    Read from a field already on the listing (drivetrain, fuel).
     decoded    Came back from a NeoVIN decode for this VIN.

   Anything we merely hope is on the car does not appear. A chip on a card is a
   claim about a specific vehicle, and buyers will act on it.
---------------------------------------------------------------------------- */
export function knownFeatures(vehicle, appliedFeatureIds = [], decodedSpecs = null) {
  const out = new Map();

  // 1. Confirmed by the upstream filter.
  appliedFeatureIds.forEach((id) => {
    const f = featureById(id);
    if (f && f.mc) out.set(id, { id, label: f.label, source: "confirmed" });
  });

  // 2. Derived from fields already present on the listing.
  FEATURES.forEach((f) => {
    if (out.has(f.id) || !f.derive) return;
    if (f.derive(vehicle)) out.set(f.id, { id: f.id, label: f.label, source: "derived" });
  });

  // 3. Anything a NeoVIN decode confirmed.
  if (decodedSpecs?.highValueFeatures?.length) {
    const text = decodedSpecs.highValueFeatures.map((h) => h.label.toLowerCase()).join(" | ");
    FEATURES.forEach((f) => {
      if (out.has(f.id) || !f.mc) return;
      if (text.includes(f.mc.toLowerCase()) || text.includes(f.label.toLowerCase())) {
        out.set(f.id, { id: f.id, label: f.label, source: "decoded" });
      }
    });
  }
  return [...out.values()];
}

/**
 * Card chips: the buyer's own must-haves first (that's what they're scanning
 * for), then everything else, capped so the card stays readable.
 */
export function cardFeatures(vehicle, appliedFeatureIds = [], decodedSpecs = null, wanted = [], limit = 8) {
  const all = knownFeatures(vehicle, appliedFeatureIds, decodedSpecs);
  const want = new Set(wanted);
  return all
    .sort((a, b) => (want.has(b.id) ? 1 : 0) - (want.has(a.id) ? 1 : 0))
    .slice(0, limit)
    .map((f) => ({ ...f, wanted: want.has(f.id) }));
}

/** Fraction of the buyer's must-haves this vehicle is known to satisfy. */
export function featureMatch(vehicle, wanted = [], appliedFeatureIds = [], decodedSpecs = null) {
  if (!wanted.length) return null;
  const have = new Set(knownFeatures(vehicle, appliedFeatureIds, decodedSpecs).map((f) => f.id));
  const matched = wanted.filter((id) => have.has(id));
  return { matched, missing: wanted.filter((id) => !have.has(id)), ratio: matched.length / wanted.length };
}

/* ----------------------------------------------------------------------------
   TAXONOMY PROBE  (dev utility)

   Paste into the browser console on the live site to check every `mc` string
   against real inventory. Any feature returning 0 across a broad search is
   almost certainly a wrong string rather than genuinely absent.

       import("/js/features.js").then(m => m.probe("Ford", "F-150", "20147"))
---------------------------------------------------------------------------- */
export async function probe(make = "Ford", model = "F-150", zip = "20147") {
  const results = [];
  for (const f of FEATURES.filter((x) => x.mc)) {
    try {
      const res = await fetch("/api/inventory-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: { make, model, zip, radiusMi: 250, features: [f.id] } }),
      });
      const d = await res.json();
      results.push({ feature: f.label, mc: f.mc, found: d.results?.length ?? 0 });
    } catch (err) {
      results.push({ feature: f.label, mc: f.mc, found: "error: " + err.message });
    }
  }
  console.table(results);
  return results;
}
