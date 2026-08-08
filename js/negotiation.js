/* ============================================================================
   NEGOTIATION CENTER — the control room for a single purchase.

   Opens automatically when a vehicle is selected. Five zones, top to bottom:

     1. COMMAND BAR     stage progress, deal status
     2. VEHICLE + INTEL what it is, what it's worth, what we don't know
     3. RECOMMENDATION  the hero card — target, settlement, probability
     4. OTD CALCULATOR  every line item, live, editable
     5. WORKSPACE       timeline, message composer, AI coaching

   ── The rule that shapes everything here ────────────────────────────────────
   Every figure renders through `stat()`, which requires a provenance. There is
   no code path that prints a bare number. If the data is missing the UI shows
   a dashed gap explaining why and what would fill it — never a zero, never a
   dash, never a confident-looking guess.

   That constraint is the product. A buyer takes these numbers into a room with
   someone who knows the real ones.
   ============================================================================ */

import { calculateOTD, feesFor } from "./otd-calc.js";
import { esc, vehicleArt } from "./ui.js";
import { optionsPanel } from "./window-sticker.js";

const $ = (n) => "$" + Math.round(n).toLocaleString();
const $0 = (n) => (n == null ? "—" : $(n));

/* ----------------------------------------------------------------------------
   SESSION PERSISTENCE

   [PLUG:PERSISTENCE] localStorage keyed by vehicle id. A negotiation that
   evaporates on refresh is unusable, and this is a deployed site rather than a
   sandboxed preview, so browser storage is appropriate here.

   Migrating to accounts: swap these three functions for calls against
   /api/deals and key on user id + vehicle id. Nothing else changes.
---------------------------------------------------------------------------- */
const KEY = (id) => `dealpilot:negotiation:${id}`;

export function loadSession(vehicleId) {
  try {
    const raw = localStorage.getItem(KEY(vehicleId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveSession(vehicleId, session) {
  try { localStorage.setItem(KEY(vehicleId), JSON.stringify(session)); } catch { /* quota or private mode */ }
}
export function newSession(vehicle) {
  return {
    vehicleId: vehicle.id,
    status: "preparing",              // preparing → offered → negotiating → agreed | walked
    createdAt: new Date().toISOString(),
    timeline: [],                     // { id, actor, type, amount?, note?, at }
    otdInputs: null,                  // populated on first render from server defaults
    draft: null,
  };
}

const STAGES = [
  { id: "preparing", label: "Prepare" },
  { id: "offered", label: "Offer sent" },
  { id: "negotiating", label: "Negotiating" },
  { id: "agreed", label: "Agreed" },
];

/* ----------------------------------------------------------------------------
   PROVENANCE RENDERING — the honesty primitive
---------------------------------------------------------------------------- */
const PROV_LABEL = {
  measured: "From listing",
  derived: "Calculated",
  estimated: "Estimated",
  input: "Your input",
  unavailable: "Not available",
};

/**
 * The only way a number reaches the screen.
 * @param label   what it is
 * @param v       a value object from market-analysis.js, or a raw number
 * @param opts    { format, size, tone, id }
 */
function stat(label, v, opts = {}) {
  const { format = $0, size = "md", tone = "", id = "" } = opts;

  if (!v || v.provenance === "unavailable") {
    return `<div class="np-stat is-unavailable" ${id ? `data-stat="${esc(id)}"` : ""}>
      <div class="np-stat-label">${esc(label)}</div>
      <div class="np-stat-gap">Not available</div>
      ${v?.basis ? `<div class="np-stat-basis">${esc(v.basis)}</div>` : ""}
      ${v?.remedy ? `<div class="np-stat-remedy">${esc(v.remedy)}</div>` : ""}
    </div>`;
  }

  const value = typeof v === "object" ? v.value : v;
  const prov = typeof v === "object" ? v.provenance : "measured";
  const basis = typeof v === "object" ? v.basis : null;

  return `<div class="np-stat size-${size} ${tone}" ${id ? `data-stat="${esc(id)}"` : ""}>
    <div class="np-stat-label">${esc(label)}
      <span class="np-prov prov-${prov}" ${basis ? `title="${esc(basis)}"` : ""}>${PROV_LABEL[prov]}</span>
    </div>
    <div class="np-stat-value">${format(value)}</div>
    ${basis && size === "lg" ? `<div class="np-stat-basis">${esc(basis)}</div>` : ""}
  </div>`;
}

/* ----------------------------------------------------------------------------
   1 · COMMAND BAR
---------------------------------------------------------------------------- */
function commandBar(vehicle, session) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === session.status));
  return `<header class="np-command">
    <button class="np-back" data-action="close-negotiation" aria-label="Back to results">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      <span>Results</span>
    </button>
    <div class="np-command-title">
      <span class="np-mono np-eyebrow">Negotiation center</span>
      <h1>${esc(`${vehicle.year} ${vehicle.make} ${vehicle.model}`)}${vehicle.trim ? ` <em>${esc(vehicle.trim)}</em>` : ""}</h1>
    </div>
    <ol class="np-stages" aria-label="Deal progress">
      ${STAGES.map((s, i) => `<li class="${i < idx ? "is-done" : i === idx ? "is-current" : ""}">
        <span class="np-stage-dot"></span><span class="np-stage-label">${s.label}</span>
      </li>`).join("")}
    </ol>
  </header>`;
}

/* ----------------------------------------------------------------------------
   2 · VEHICLE + MARKET INTELLIGENCE
---------------------------------------------------------------------------- */
function vehiclePanel(vehicle, analysis) {
  const d = vehicle.dealer || {};
  const m = analysis.measured;

  return `<section class="np-vehicle glass">
    <div class="np-vehicle-media">
      ${vehicleArt(vehicle, 260)}
      <div class="np-badges">
        ${analysis.badges.map((b) => `<span class="np-badge tone-${b.tone}" title="${esc(b.why)}">${esc(b.label)}</span>`).join("")}
      </div>
    </div>

    <div class="np-vehicle-facts">
      <div class="np-dealer">
        <div class="np-dealer-name">${esc(d.name || "Dealer not named")}</div>
        <div class="np-mono np-dealer-meta">
          ${[d.city && d.state ? `${esc(d.city)}, ${esc(d.state)}` : null,
             d.distanceMi ? `${d.distanceMi} mi away` : null,
             d.dealerType ? esc(d.dealerType) : null].filter(Boolean).join(" · ")}
        </div>
      </div>

      <div class="np-stat-grid">
        ${stat("Dealer asking price", m.asking, { size: "lg", tone: "accent" })}
        ${stat("MSRP", m.msrp)}
        ${stat("Estimated market value", analysis.fairMarketValue, { size: "lg" })}
        ${stat("Days on market", m.daysOnMarket, { format: (n) => `${n} days` })}
      </div>

      <div class="np-stat-grid np-stat-grid-3">
        ${stat("Estimated invoice", analysis.costBasis.invoice)}
        ${stat("Dealer holdback", analysis.costBasis.holdback)}
        ${stat("Manufacturer incentives", analysis.costBasis.incentives)}
      </div>
    </div>
  </section>`;
}

function confidencePanel(analysis) {
  const c = analysis.confidence;
  const comps = analysis.comparables;
  return `<section class="np-confidence glass">
    <div class="np-confidence-head">
      <div>
        <span class="np-mono np-eyebrow">Pricing confidence</span>
        <div class="np-confidence-score">
          <span class="np-confidence-num">${c.value}</span>
          <span class="np-confidence-band band-${c.band.toLowerCase()}">${c.band}</span>
        </div>
      </div>
      <div class="np-confidence-meter" role="img" aria-label="Confidence ${c.value} of 100">
        <div class="np-confidence-fill" style="width:${c.value}%"></div>
      </div>
    </div>
    <ul class="np-factors">
      ${c.factors.map((f) => `<li>
        <div class="np-factor-top">
          <span>${esc(f.label)}</span>
          <span class="np-mono">${f.points}/${f.max}</span>
        </div>
        <div class="np-factor-bar"><span style="width:${(f.points / f.max) * 100}%"></span></div>
        <div class="np-factor-detail">${esc(f.detail)}</div>
      </li>`).join("")}
    </ul>

    <div class="np-comps">
      <div class="np-comps-head np-mono">
        <span>${comps.count} comparable listing${comps.count === 1 ? "" : "s"}</span>
        <span class="np-muted">${esc(comps.tier)}</span>
      </div>
      ${comps.sample.length ? `<ul class="np-comp-list np-mono">
        ${comps.sample.map((c2) => `<li>
          <span class="np-comp-trim">${esc(c2.year || "")} ${esc(c2.trim || "—")}</span>
          <span class="np-comp-meta">${c2.mileage ? `${c2.mileage.toLocaleString()} mi` : "new"}${c2.distanceMi != null ? ` · ${c2.distanceMi} mi` : ""}</span>
          <span class="np-comp-price">${$(c2.price)}</span>
        </li>`).join("")}
      </ul>` : `<p class="np-empty-note">No comparable listings were found nearby, so there's no market baseline to price against.</p>`}
    </div>
  </section>`;
}

/* ----------------------------------------------------------------------------
   3 · THE RECOMMENDATION — hero card
---------------------------------------------------------------------------- */
function recommendationPanel(vehicle, analysis, otdTarget) {
  const r = analysis.recommendation;

  if (!r.available) {
    return `<section class="np-rec glass is-unavailable">
      <span class="np-mono np-eyebrow">AI recommendation</span>
      <h2 class="np-rec-headline">We won't recommend a number on this little data.</h2>
      <p class="np-rec-narrative">${esc(analysis.narrative)}</p>
      <div class="np-rec-remedy">
        <strong>What would fix it</strong>
        <p>${esc(r.reason.remedy || "Gather more comparable listings.")}</p>
      </div>
    </section>`;
  }

  // Settlement band positions, expressed against the target→asking span.
  const lo = r.target.value, hi = vehicle.price, span = Math.max(1, hi - lo);
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const p = r.probability.value;

  return `<section class="np-rec glass">
    <div class="np-rec-main">
      <span class="np-mono np-eyebrow">AI recommendation</span>
      <div class="np-rec-hero">
        <div class="np-rec-target">
          <span class="np-mono np-stat-label">Open your offer at</span>
          <span class="np-rec-big">${$(otdTarget)}</span>
          <span class="np-mono np-rec-sub">out the door · ${$(r.target.value)} on the vehicle</span>
        </div>
        <div class="np-rec-savings">
          <span class="np-mono np-stat-label">Projected saving</span>
          <span class="np-rec-save">${$(r.savings.value)}</span>
          <span class="np-mono np-rec-sub">vs. asking price</span>
        </div>
      </div>

      <div class="np-range" role="img" aria-label="Expected settlement between ${$(r.settlement.low)} and ${$(r.settlement.high)}">
        <div class="np-range-track">
          <div class="np-range-band" style="left:${pos(r.settlement.low)}%;width:${pos(r.settlement.high) - pos(r.settlement.low)}%"></div>
          <div class="np-range-marker is-target" style="left:${pos(r.target.value)}%"><span>Your offer</span></div>
          <div class="np-range-marker is-settle" style="left:${pos(r.settlement.value)}%"><span>Likely settle</span></div>
          <div class="np-range-marker is-ask" style="left:100%"><span>Their ask</span></div>
        </div>
        <div class="np-range-scale np-mono">
          <span>${$(r.target.value)}</span><span>${$(vehicle.price)}</span>
        </div>
      </div>

      <p class="np-rec-narrative">${esc(analysis.narrative)}</p>
    </div>

    <aside class="np-rec-side">
      <div class="np-gauge">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" class="np-gauge-track"/>
          <circle cx="60" cy="60" r="52" class="np-gauge-fill"
            style="stroke-dasharray:${(p / 100) * 326.7} 326.7"/>
        </svg>
        <div class="np-gauge-center">
          <span class="np-gauge-num">${p}<i>%</i></span>
          <span class="np-mono np-gauge-label">acceptance</span>
        </div>
      </div>
      <div class="np-rec-meta">
        ${stat("Expected settlement", r.settlement, { size: "sm" })}
        ${stat("Difficulty", r.difficulty, { size: "sm", format: (v) => `${r.difficulty.label} · ${v}/100` })}
      </div>
      <p class="np-caveat np-mono">${esc(r.probability.basis)}</p>
    </aside>
  </section>`;
}

/* ----------------------------------------------------------------------------
   4 · OUT-THE-DOOR CALCULATOR
---------------------------------------------------------------------------- */
const OTD_FIELDS = [
  { key: "vehiclePrice", label: "Vehicle price", hint: "Negotiated price before anything else" },
  { key: "dealerDiscount", label: "Dealer discount", hint: "What you've talked them down", negative: true },
  { key: "incentives", label: "Manufacturer incentives", hint: "Rebates you qualify for — confirm with the dealer", negative: true },
  { key: "dealerAccessories", label: "Dealer accessories", hint: "Pinstripes, nitrogen, paint sealant. Refusable.", warn: true },
  { key: "otherDealerFees", label: "Other dealer fees", hint: "Anything else on the buyer's order", warn: true },
  { key: "docFee", label: "Documentation fee", hint: "Capped in some states — see note below" },
  { key: "titleReg", label: "Title & registration", hint: "State DMV charges" },
];

function otdPanel(otd, fees, inputs) {
  const warn = otd.lines.filter((l) => l.warn && l.amount > 0);
  return `<section class="np-otd glass">
    <div class="np-section-head">
      <div>
        <span class="np-mono np-eyebrow">Out-the-door cost</span>
        <h2>Every line, before you're in the chair</h2>
      </div>
      <div class="np-otd-total">
        <span class="np-mono np-stat-label">Out the door</span>
        <span class="np-otd-big" data-otd="otd">${$(otd.otd)}</span>
      </div>
    </div>

    <div class="np-otd-body">
      <div class="np-otd-fields">
        ${OTD_FIELDS.map((f) => `<label class="np-field${f.warn && inputs[f.key] > 0 ? " is-warn" : ""}">
          <span class="np-field-label">${esc(f.label)}<i>${esc(f.hint)}</i></span>
          <span class="np-field-input">
            <span class="np-field-sign">${f.negative ? "−" : ""}$</span>
            <input type="number" inputmode="numeric" min="0" step="25"
              data-otd-input="${f.key}" value="${Math.round(inputs[f.key] || 0)}" />
          </span>
        </label>`).join("")}

        <div class="np-field-group">
          <span class="np-mono np-group-label">Trade-in</span>
          <label class="np-field">
            <span class="np-field-label">Trade value<i>What they'll give you</i></span>
            <span class="np-field-input"><span class="np-field-sign">$</span>
              <input type="number" inputmode="numeric" min="0" step="100" data-otd-input="tradeValue" value="${Math.round(inputs.tradeValue || 0)}" /></span>
          </label>
          <label class="np-field">
            <span class="np-field-label">Loan payoff<i>What you still owe on it</i></span>
            <span class="np-field-input"><span class="np-field-sign">$</span>
              <input type="number" inputmode="numeric" min="0" step="100" data-otd-input="tradePayoff" value="${Math.round(inputs.tradePayoff || 0)}" /></span>
          </label>
        </div>

        <div class="np-field-group">
          <span class="np-mono np-group-label">Financing <em>estimate only</em></span>
          <label class="np-field">
            <span class="np-field-label">Down payment</span>
            <span class="np-field-input"><span class="np-field-sign">$</span>
              <input type="number" inputmode="numeric" min="0" step="500" data-otd-input="downPayment" value="${Math.round(inputs.downPayment || 0)}" /></span>
          </label>
          <label class="np-field">
            <span class="np-field-label">APR</span>
            <span class="np-field-input">
              <input type="number" inputmode="decimal" min="0" max="30" step="0.1" data-otd-input="apr" value="${inputs.apr}" />
              <span class="np-field-sign">%</span></span>
          </label>
          <label class="np-field">
            <span class="np-field-label">Term</span>
            <span class="np-field-input">
              <select data-otd-input="termMonths">
                ${[36, 48, 60, 72, 84].map((t) => `<option value="${t}"${t === inputs.termMonths ? " selected" : ""}>${t} mo</option>`).join("")}
              </select></span>
          </label>
        </div>
      </div>

      <div class="np-otd-summary">
        <ul class="np-ledger">
          ${otd.lines.map((l) => `<li class="${l.amount < 0 ? "is-credit" : ""}${l.warn && l.amount > 0 ? " is-warn" : ""}">
            <span class="np-ledger-label">${esc(l.label)}
              <span class="np-prov prov-${l.provenance}">${PROV_LABEL[l.provenance]}</span></span>
            <span class="np-ledger-amount">${l.amount < 0 ? "−" : ""}${$(Math.abs(l.amount))}</span>
            ${l.sub ? `<span class="np-ledger-sub">${esc(l.sub)}</span>` : ""}
          </li>`).join("")}
        </ul>

        <div class="np-ledger-total">
          <span>Out-the-door price</span><span data-otd="otd2">${$(otd.otd)}</span>
        </div>

        ${otd.tradeEquity !== 0 ? `<div class="np-ledger-line${otd.negativeEquity ? " is-danger" : ""}">
          <span>Trade equity</span><span data-otd="equity">${otd.tradeEquity < 0 ? "−" : ""}${$(Math.abs(otd.tradeEquity))}</span>
        </div>` : ""}
        ${otd.negativeEquity ? `<p class="np-danger-note">You owe more on your trade than it's worth. That gap gets rolled into the new loan and you pay interest on it. Consider selling the trade separately or holding off.</p>` : ""}

        <div class="np-finance">
          <div class="np-finance-main">
            <span class="np-mono np-stat-label">Estimated monthly <span class="np-prov prov-estimated">Estimated</span></span>
            <span class="np-finance-big" data-otd="monthly">${$(otd.monthlyPayment)}</span>
          </div>
          <div class="np-finance-rows np-mono">
            <div><span>Amount financed</span><span data-otd="financed">${$(otd.amountFinanced)}</span></div>
            <div><span>Interest over term</span><span data-otd="interest">${$(otd.totalFinanceCost)}</span></div>
            <div class="is-total"><span>Total cost of ownership</span><span data-otd="total">${$(otd.totalCost)}</span></div>
          </div>
        </div>

        <div class="np-fee-note">
          <span class="np-mono">${esc(fees.state === "DEFAULT" ? "No state rate table" : fees.state + " rates")}</span>
          <p>${esc(fees.note)}</p>
          ${warn.length ? `<p class="np-fee-warn">${warn.map((w) => esc(w.label)).join(" and ")} ${warn.length === 1 ? "is" : "are"} dealer-added and refusable. Ask for ${warn.length === 1 ? "it" : "them"} to be removed before you discuss anything else.</p>` : ""}
          <p class="np-fee-caveat">Tax, doc and registration figures are estimates from a state table. Confirm against the dealer's itemized buyer's order before signing.</p>
        </div>
      </div>
    </div>
  </section>`;
}

/* ----------------------------------------------------------------------------
   5 · WORKSPACE — timeline, composer, coaching
---------------------------------------------------------------------------- */
function workspacePanel(vehicle, session, coaching, draft, messageSource) {
  const t = session.timeline;
  return `<section class="np-workspace">
    <div class="np-work-main glass">
      <div class="np-section-head">
        <div>
          <span class="np-mono np-eyebrow">Negotiation workspace</span>
          <h2>Offer timeline</h2>
        </div>
        <span class="np-status status-${session.status}">${esc(STAGES.find((s) => s.id === session.status)?.label || session.status)}</span>
      </div>

      ${t.length === 0 ? `<p class="np-empty-note">Nothing sent yet. Your opening message is drafted below — edit anything you like before it goes out.</p>` : `
      <ol class="np-timeline">
        ${t.map((e) => `<li class="actor-${e.actor} type-${e.type}">
          <div class="np-tl-dot"></div>
          <div class="np-tl-body">
            <div class="np-tl-head">
              <span class="np-tl-actor">${e.actor === "buyer" ? "You" : esc(vehicle.dealer?.name || "Dealer")}</span>
              <span class="np-mono np-tl-time">${new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
            ${typeof e.amount === "number" ? `<div class="np-tl-amount">${$(e.amount)} <em>out the door</em></div>` : ""}
            ${e.note ? `<p class="np-tl-note">${esc(e.note)}</p>` : ""}
          </div>
        </li>`).join("")}
      </ol>`}

      <div class="np-composer">
        <div class="np-composer-head">
          <span class="np-mono np-eyebrow">Your message${messageSource === "claude" ? "" : " · template"}</span>
          <div class="np-tone-picker">
            ${["firmer", "warmer", "shorter"].map((t2) => `<button class="np-tone" data-action="retone-message" data-tone="${t2}">${t2}</button>`).join("")}
          </div>
        </div>
        <textarea class="np-draft" id="np-draft" rows="14" aria-label="Message to the dealer">${esc(draft || "")}</textarea>
        <div class="np-composer-actions">
          <button class="np-btn np-btn-primary" data-action="copy-message">Copy message</button>
          <button class="np-btn np-btn-ghost" data-action="mark-sent">Mark as sent</button>
          <span class="np-mono np-composer-note">Sending happens in your own email for now — dealer messaging is on the roadmap below.</span>
        </div>
      </div>

      <div class="np-log">
        <span class="np-mono np-eyebrow">Log the dealer's response</span>
        <div class="np-log-row">
          <label class="np-field np-field-inline">
            <span class="np-field-label">Their out-the-door number</span>
            <span class="np-field-input"><span class="np-field-sign">$</span>
              <input type="number" inputmode="numeric" step="25" id="np-dealer-amount" placeholder="0" /></span>
          </label>
          <input type="text" class="np-input" id="np-dealer-note" placeholder="What did they say? (optional)" />
          <button class="np-btn np-btn-primary" data-action="log-dealer">Log response</button>
        </div>
      </div>
    </div>

    <aside class="np-coach glass">
      <div class="np-coach-head">
        <span class="np-coach-pulse"></span>
        <span class="np-mono np-eyebrow">Live coaching</span>
      </div>
      <div class="np-coach-body stance-${coaching.stance}">
        <h3>${esc(coaching.headline)}</h3>
        <p>${esc(coaching.body)}</p>
        ${coaching.actions?.length ? `<ul class="np-coach-actions">
          ${coaching.actions.map((a) => `<li>${esc(a)}</li>`).join("")}
        </ul>` : ""}
      </div>
      ${session.timeline.length ? `<button class="np-btn np-btn-ghost np-btn-block" data-action="regenerate-message">Draft my reply</button>` : ""}
    </aside>
  </section>`;
}

/* ----------------------------------------------------------------------------
   6 · ROADMAP — honest placeholders, not fake buttons

   Everything here is deliberately inert and labelled. A disabled control that
   states what it will do builds more trust than a live one that silently does
   nothing.
---------------------------------------------------------------------------- */
const ROADMAP = [
  { group: "Dealer connection", items: [
    ["Dealer portal", "Two-way messaging with the dealership inside DealPilot", "[PLUG:DEALER-PORTAL]"],
    ["CRM integration", "Offers delivered straight into VinSolutions, Elead or DealerSocket", "[PLUG:LEAD-GEN]"],
    ["Live messaging", "Real-time chat with the salesperson, logged to this timeline", "[PLUG:MESSAGING]"],
  ]},
  { group: "Autonomous negotiation", items: [
    ["AI negotiation", "DealPilot negotiates on your behalf within limits you set", "[PLUG:AUTO-NEGOTIATE]"],
    ["Buyer verification", "Pre-verified buyer status so dealers take your offer seriously", "[PLUG:VERIFICATION]"],
  ]},
  { group: "Closing the purchase", items: [
    ["Financing", "Pre-approval offers to beat the dealer's rate", "[PLUG:FINANCING]"],
    ["Trade-in valuation", "Real offers on your trade, not the dealer's number", "[PLUG:TRADE-IN]"],
    ["Deposit", "Hold the vehicle with a refundable deposit", "[PLUG:DEPOSIT]"],
    ["Scheduling", "Book delivery or pickup without another phone call", "[PLUG:SCHEDULING]"],
  ]},
];

function roadmapPanel() {
  return `<section class="np-roadmap">
    <span class="np-mono np-eyebrow">Coming to the negotiation center</span>
    <div class="np-roadmap-grid">
      ${ROADMAP.map((g) => `<div class="np-roadmap-group">
        <h4 class="np-mono">${esc(g.group)}</h4>
        <ul>${g.items.map(([name, desc, tag]) => `<li>
          <span class="np-roadmap-name">${esc(name)}</span>
          <span class="np-roadmap-desc">${esc(desc)}</span>
          <span class="np-mono np-roadmap-tag">${esc(tag)}</span>
        </li>`).join("")}</ul>
      </div>`).join("")}
    </div>
  </section>`;
}

/* ----------------------------------------------------------------------------
   COMPOSE
---------------------------------------------------------------------------- */
export function renderNegotiation(state) {
  const { vehicle, data, session } = state;

  if (state.loading) {
    return `<div class="np-root"><div class="np-loading">
      <div class="np-loading-ring"></div>
      <h2>Reading the market</h2>
      <p class="np-mono">Comparing against listings in your search radius</p>
    </div></div>`;
  }
  if (state.error) {
    return `<div class="np-root"><div class="np-loading">
      <h2>We couldn't build the analysis</h2>
      <p class="np-mono np-muted">${esc(state.error)}</p>
      <button class="np-btn np-btn-ghost" data-action="close-negotiation">Back to results</button>
    </div></div>`;
  }

  const inputs = session.otdInputs;
  const otd = calculateOTD(inputs);
  const otdTarget = Math.round(otd.otd);

  return `<div class="np-root">
    ${commandBar(vehicle, session)}
    <div class="np-grid">
      ${recommendationPanel(vehicle, data.analysis, otdTarget)}
      ${vehiclePanel(vehicle, data.analysis)}
      ${optionsPanel(state.specs, vehicle)}
      ${confidencePanel(data.analysis)}
      ${otdPanel(otd, data.fees, inputs)}
      ${workspacePanel(vehicle, session, state.coaching || data.coaching, session.draft ?? data.message, data.messageSource)}
      ${roadmapPanel()}
    </div>
  </div>`;
}

/* Live recalculation without a full re-render — typing in a price field should
   feel instant, and re-rendering would steal focus on every keystroke. */
export function patchOTD(session) {
  const otd = calculateOTD(session.otdInputs);
  const set = (k, v) => {
    document.querySelectorAll(`[data-otd="${k}"]`).forEach((el) => { el.textContent = v; });
  };
  set("otd", $(otd.otd));
  set("otd2", $(otd.otd));
  set("monthly", $(otd.monthlyPayment));
  set("financed", $(otd.amountFinanced));
  set("interest", $(otd.totalFinanceCost));
  set("total", $(otd.totalCost));
  set("equity", (otd.tradeEquity < 0 ? "−" : "") + $(Math.abs(otd.tradeEquity)));

  document.querySelectorAll(".np-ledger li").forEach((li, i) => {
    const line = otd.lines[i];
    if (!line) return;
    const amt = li.querySelector(".np-ledger-amount");
    if (amt) amt.textContent = (line.amount < 0 ? "−" : "") + $(Math.abs(line.amount));
    li.classList.toggle("is-credit", line.amount < 0);
    li.classList.toggle("is-warn", !!line.warn && line.amount > 0);
  });
  return otd;
}

export function defaultOTDInputs(vehicle, data) {
  const fees = data.fees;
  const rec = data.analysis.recommendation;
  const targetVehiclePrice = rec.available ? rec.target.value : vehicle.price;
  return {
    vehiclePrice: vehicle.price,
    dealerDiscount: Math.max(0, vehicle.price - targetVehiclePrice),
    incentives: 0,
    dealerAccessories: 0,
    otherDealerFees: 0,
    docFee: fees.docFee,
    titleReg: fees.titleReg,
    taxRate: fees.taxRate,
    tradeInCredit: fees.tradeInCredit,
    tradeValue: 0,
    tradePayoff: 0,
    downPayment: 0,
    apr: 6.9,
    termMonths: 60,
  };
}
