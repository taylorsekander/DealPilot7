# DealPilot AI

A buyer's agent for car shopping. Conversational intake, normalized dealer inventory,
and a written read on the set that tells you where your leverage is.

Plain HTML, CSS and ES modules. No framework, no build step. Netlify Functions
handle anything that needs an API key.

---

## Deploy

The app runs unchanged on **Cloudflare Pages** or **Netlify**. Both are static
hosting plus serverless functions, and there is no build step either way.

The client always calls `/api/*`. On Cloudflare those paths are served natively
by `functions/api/*`. On Netlify a redirect in `netlify.toml` maps them onto
`/.netlify/functions/*`. Same client code, no per-platform branching.

### 1. Push to GitHub

```bash
cd dealpilot
git init && git add . && git commit -m "DealPilot AI v1.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/dealpilot.git
git push -u origin main
```

### 2a. Cloudflare Pages

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick the repo.
2. Build settings — **leave the build command empty**:

   | Setting | Value |
   |---|---|
   | Framework preset | None |
   | Build command | *(empty)* |
   | Build output directory | `/` |

   Cloudflare finds `functions/` on its own; there is nothing to configure.
3. **Save and Deploy.**
4. Add secrets: **Settings → Variables and Secrets → Add**. Use type **Secret**,
   not Plaintext, for anything that is a key. Add them to **Production** *and*
   **Preview** — preview deploys have a separate environment, and a missing key
   there looks identical to a broken build.
5. **Deployments → Retry deployment.** Variables are read at runtime, so the
   running deployment will not see them until it restarts.

### 2b. Netlify

1. app.netlify.com → **Add new project** → **Import an existing project** → GitHub.
2. `netlify.toml` fills in the settings. Confirm: build command empty, publish
   directory `.`, functions directory `netlify/functions`.
3. **Deploy**, then add the same variables under **Site configuration →
   Environment variables**, then **Trigger deploy → Clear cache and deploy site**.

### 3. Environment variables (identical on both)

| Variable | Required | What it does |
|---|---|---|
| `INVENTORY_PROVIDER` | for live data | `autodev` or `marketcheck` |
| `AUTODEV_API_KEY` | if using auto.dev | live listings |
| `MARKETCHECK_API_KEY` | if using MarketCheck | live listings |
| `ANTHROPIC_API_KEY` | optional | Claude writes the Pilot's Read instead of the built-in analyst |

### 4. Turn live data on

In `js/config.js`: `dataSource: "live"`. Commit and push.

Test first without committing by visiting `https://yoursite.pages.dev/?data=live`.

### Verifying the connection

Both platforms expose the same debug route in a browser:

```
https://yoursite.pages.dev/api/inventory-search?debug=1&make=Ford&model=F-150&zip=20147
```

It returns the provider's untouched first record next to the normalized version,
plus `fieldReport.alwaysEmpty` — a list of any normalized fields that came back
empty on every record, which means the adapter's field names are wrong for that
provider. That report is the fastest route from "no results" to a fix.

---

## Why the code is split the way it is

Provider logic lives in `shared/*.js` and is imported by **both** platform
wrappers. The wrappers are three lines each and contain no logic:

```js
// netlify/functions/inventory-search.mjs
export default async (req) => handleInventorySearch(req, process.env);

// functions/api/inventory-search.js
export const onRequest = (ctx) => handleInventorySearch(ctx.request, ctx.env);
```

The one real difference between the platforms is how secrets arrive: Node gives
you `process.env`, the Workers runtime gives you `context.env`. Rather than
branch inside the logic, the cores take `env` as an argument and stay ignorant of
where they are running. Nothing in `shared/` may reference `process` — that is
the rule that keeps the Cloudflare build working.

A fix in `shared/` lands on both hosts. Two copies of a provider adapter would
have drifted within a week.

## About the two bugs from the v0.1 test

**"A dealership that doesn't exist."** Correct — none of the v0.1 data was real.
Every listing came from a seeded generator. The prototype never called an
inventory API. That's now impossible to miss:

- mock dealers are named `Sample Motors North`, `Sample Auto Group`, and so on
- an amber banner across the top of the results page says **SAMPLE DATA** with
  the reason and the fix
- every card carries a `SAMPLE DATA` stamp and a dashed border
- in `dataSource: "live"`, a failed API call shows an **error**, never a silent
  fallback to sample cars. Nobody should ever mistake a fixture for a real car
  because a key expired.

**"I searched King Ranch and got a Lariat."** That was a real design error.
Trim was scored (−14 points for a mismatch) rather than filtered, so a Lariat
could still rank high enough to surface. Fixed in `js/domain.js`:

- `make`, `model` and `trim` are **hard filters**. A non-matching trim is
  excluded, not demoted.
- trim matching is containment-based, because feeds write
  `"King Ranch 4WD SuperCrew"` — but it's still a gate, not a preference.
- when a strict search returns nothing, `searchWithRelaxation()` drops **one
  constraint at a time**, in an order that costs the buyer least (color first,
  trim late, make never), and returns exactly what it gave up.
- the results page opens with a banner naming the relaxed constraints, and every
  card lists its own mismatches: *"Not a King Ranch — this is Lariat."*

The test for this product: a buyer should never have to notice a substitution
themselves. If we can't find what they asked for, we say so.

---

## Choosing an inventory provider

| | auto.dev | MarketCheck |
|---|---|---|
| Free tier | 1,000 calls/month | none |
| Auth | `Authorization: Bearer KEY` | `api_key` query param |
| Endpoint | `GET https://api.auto.dev/listings` | `GET https://api.marketcheck.com/v2/search/car/active` |
| Best for | getting to a working demo today | production coverage |

Start with auto.dev. Both adapters are already written in
`netlify/functions/inventory-search.mjs`; switching is one environment variable.

**Verify the filter parameter names against current provider docs before you go
live.** Both APIs evolve, and a silently-ignored `trim` parameter would reintroduce
exactly the bug above. The client re-enforces make/model/trim on whatever comes
back, so a provider that ignores a filter still can't slip a Lariat through — but
you'll be burning quota fetching rows you throw away.

### Adding a third provider

Add an object to `PROVIDERS` in `inventory-search.mjs` with two methods:

```js
const myProvider = {
  id: "my-provider",
  async fetchListings(criteria, key) { /* → raw array */ },
  normalize(raw, i) { /* → the normalized shape */ },
};
```

Nothing in the client changes. That's the point of the normalization contract.

---

## Project structure

```
index.html                       shell; loads one module
assets/css/styles.css            all styling
js/
  config.js                      ← the file you edit to go live
  domain.js                      pure logic: filters, scoring, relaxation, local analyst
  mock-inventory.js              sample data (delete once live)
  services.js                    client-side adapters; screens never fetch directly
  ui.js                          render helpers: cards, vehicle art, chips
  app.js                         state machine + screens + event delegation

shared/                          PLATFORM-NEUTRAL LOGIC — the real implementations
  inventory-core.js              [PLUG:LIVE-INVENTORY] provider fan-out + normalization
  ai-core.js                     [PLUG:AI] Claude-written results read
  lead-core.js                   [PLUG:LEAD-GEN] dealer lead delivery
  vin-core.js                    free NHTSA vPIC decode, no key needed

functions/api/                   Cloudflare Pages wrappers (file-based routing → /api/*)
netlify/functions/               Netlify wrappers (reached via the /api/* redirect)

wrangler.toml, _headers, _redirects    Cloudflare config
netlify.toml                           Netlify config
```

Plug-in points are greppable:

```bash
grep -rn "\[PLUG:" js netlify
```

`[PLUG:LIVE-INVENTORY]` `[PLUG:AUTH]` `[PLUG:AI]` `[PLUG:LEAD-GEN]`
`[PLUG:NEGOTIATION]` `[PLUG:ANALYTICS]` `[PLUG:PERSISTENCE]`

---

## Local development

```bash
npm install
cp .env.example .env      # fill in your keys

npm run dev               # Netlify:    http://localhost:8888
npm run dev:cf            # Cloudflare: http://localhost:8788
```

Both serve the functions alongside the static files. `wrangler pages dev` reads
`.env` for local bindings; deployed secrets are set in the dashboard.

Static-only preview without functions: `npx serve .` — the app falls back to
sample data.

---

## What's still a placeholder

**Auth.** Google, Apple and email buttons resolve to an in-memory user. Nothing is
verified or persisted. For real identity on Netlify, Auth0, Clerk or Supabase Auth
each give you Google and Apple in one integration and handle the parts that are
easy to get wrong — server-side ID token verification, Apple's private-relay
addresses, and the fact that Apple returns the user's name *only* on first
authorization. Session belongs in an httpOnly cookie, not localStorage.

**Lead delivery.** `lead-submit.mjs` validates and logs. Before it's real it needs
to persist first, queue the dealer POST rather than run it inline, format ADF/XML
or call the CRM's API directly, store attribution for billing, and carry TCPA
consent language. The steps are commented in the file.

**Negotiation.** Phase 2. Cards show a disabled affordance and the details drawer
reserves the space. The planned surface — price intel, offer building, counteroffer
evaluation — is documented in `services.js`.

One design constraint worth keeping: lead-gen revenue and buyer advocacy pull
against each other. Keep `leadService` and `negotiationService` independent, and
never let dealer payouts influence ranking. The moment results are for sale, the
negotiation product loses the trust it runs on.

---

## Notes

- **No browser storage.** Saved vehicles live in memory for the session. Wiring
  them to a real account is `[PLUG:PERSISTENCE]`.
- **Listing photos.** Real feeds ship 8–15% of listings without usable
  photography. Cards fall back to a paint-accurate SVG silhouette rather than a
  broken image.
- **VIN verification.** `vin-decode.mjs` hits NHTSA vPIC free, no key. It's the
  authoritative check on what a VIN actually is — a listing claiming "King Ranch"
  over a VIN that decodes to Lariat is exactly what DealPilot should catch. Not
  yet wired into the results flow; a good next task.
