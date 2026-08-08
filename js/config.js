/* ============================================================================
   CONFIG — the one file you edit to go live.
   ============================================================================

   dataSource
     'mock'  → seeded sample listings, generated in the browser. No network.
               Dealers, VINs and stock numbers are FICTIONAL. The app says so
               loudly on screen whenever this mode is active.
     'live'  → calls /api/inventory-search, which calls a real
               provider using a key held server-side.
     'auto'  → tries live, falls back to mock if the function returns an error
               (useful while you're still waiting on API approval).

   You can also override per-visit for testing without redeploying:
     https://yoursite.workers.dev/?data=live
     https://yoursite.workers.dev/?data=mock
   ============================================================================ */

const urlOverride = new URLSearchParams(location.search).get("data");

export const CONFIG = {
  // ── FLIP THIS TO 'live' ONCE YOUR API KEY IS SET IN NETLIFY ──────────────
  // "live" — a failed lookup shows a real error instead of quietly substituting
  // sample cars. Use "auto" only if you want the demo to survive an outage.
  dataSource: urlOverride || "live",

  // Which upstream provider the Netlify function should call.
  // 'autodev'     — auto.dev, 1,000 free calls/month, simplest to start with.
  // 'marketcheck' — MarketCheck, larger dealer coverage, paid.
  // Set via the INVENTORY_PROVIDER env var in Netlify; this is only the hint
  // sent from the client so you can A/B without redeploying.
  provider: null,

  // 'local'  → the deterministic analyst written in js/domain.js. No key, no cost.
  // 'claude' → /api/ai-summary, which calls the Anthropic API.
  aiSummary: "auto",

  // Platform-neutral paths. On Cloudflare these are routed by src/index.js.
  // On Netlify a redirect in netlify.toml maps them to /.netlify/functions/*.
  // Same client code either way.
  endpoints: {
    inventorySearch: "/api/inventory-search",
    aiSummary: "/api/ai-summary",
    leadSubmit: "/api/lead-submit",
    vinDecode: "/api/vin-decode",
    negotiate: "/api/negotiate",
    coach: "/api/coach",
    vinSpecs: "/api/vin-specs",
  },

  defaults: {
    radiusMi: 50,
    maxResults: 60,
  },

  // Feature flags. Phase 2 work lands behind these.
  features: {
    negotiation: true,    // [PLUG:NEGOTIATION] phase 1: price intel + offer drafting
    savedSearches: false, // [PLUG:PERSISTENCE]
    priceAlerts: false,
    vinSpecs: true,       // [PLUG:VIN-SPECS] NeoVIN decode; needs MarketCheck NeoVIN access
  },
};
