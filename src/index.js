/* ============================================================================
   CLOUDFLARE WORKER ENTRY POINT

   Cloudflare has consolidated Pages into Workers Static Assets, so this is the
   current supported shape: ONE Worker that routes /api/* and hands everything
   else to the static asset server.

   The route table replaces Pages' file-based routing in functions/api/*. The
   handlers themselves are untouched — they still live in shared/ and still take
   (request, env), so the Netlify build and this one run identical logic.

   env.ASSETS is the binding declared in wrangler.jsonc. Calling
   env.ASSETS.fetch(request) serves index.html, /js/*, /assets/* exactly as a
   static host would, including the rules in _headers.
   ============================================================================ */

import { handleInventorySearch } from "../shared/inventory-core.js";
import { handleAiSummary } from "../shared/ai-core.js";
import { handleLeadSubmit } from "../shared/lead-core.js";
import { handleVinDecode } from "../shared/vin-core.js";
import { handleNegotiate, handleCoach } from "../shared/negotiation-core.js";
import { handleVinSpecs } from "../shared/vin-specs-core.js";

const ROUTES = {
  "/api/inventory-search": handleInventorySearch,
  "/api/ai-summary": handleAiSummary,
  "/api/lead-submit": handleLeadSubmit,
  "/api/vin-decode": handleVinDecode,
  "/api/negotiate": handleNegotiate, // [PLUG:NEGOTIATION] full dashboard payload
  "/api/coach": handleCoach,         // [PLUG:NEGOTIATION] strategy read on a dealer reply
  "/api/vin-specs": handleVinSpecs,  // [PLUG:VIN-SPECS] NeoVIN build, options, sticker
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const handler = ROUTES[url.pathname];
    if (handler) {
      try {
        return await handler(request, env);
      } catch (err) {
        // A thrown handler must not surface as an opaque 1101 Worker error —
        // the client shows this message in the banner, so make it readable.
        console.error("[worker]", url.pathname, err);
        return new Response(
          JSON.stringify({ error: `Unhandled error in ${url.pathname}: ${err.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Any /api/* path with no handler: answer honestly rather than serving
    // index.html, which would make a typo look like a working page.
    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: `No such endpoint: ${url.pathname}`, available: Object.keys(ROUTES) }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return env.ASSETS.fetch(request);
  },
};
