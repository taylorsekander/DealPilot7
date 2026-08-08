/* ============================================================================
   WINDOW STICKER + OPTIONS PANEL

   Renders a Monroney-style label from NeoVIN data. We build it rather than
   embedding an OEM PDF: the API returns no sticker file, hotlinking one would
   be fragile, and redistributing a manufacturer document raises a question we
   don't need to answer.

   ── Visual logic ────────────────────────────────────────────────────────────
   The negotiation center is dark glass. This panel is deliberately NOT — it's
   printed white paper with hairline rules and monospaced figures, the way the
   real thing looks taped to the glass on the lot. That contrast is the point:
   it reads as a document, not a UI, and it's the same paper language the search
   result cards use.

   ── Honesty ─────────────────────────────────────────────────────────────────
   NeoVIN marks each option verified or inferred. Verified options print
   normally; inferred ones carry a mark and are called out in the footer. We
   never present an inferred build as confirmed fact — the buyer may be about to
   argue about a $4,000 package.
   ============================================================================ */

import { esc } from "./ui.js";

const $ = (n) => "$" + Math.round(n).toLocaleString();
const known = (v) => v && v.provenance !== "unavailable" && v.value != null;

/* ----------------------------------------------------------------- sticker -- */
export function windowSticker(specs, vehicle) {
  const s = specs.sticker;
  const id = specs.identity;

  const title = [id.year, id.make, id.model].filter(Boolean).join(" ");
  const sub = id.version || [id.trim, id.bodyType].filter(Boolean).join(" · ");

  const optionRows = s.pricedOptions.map((o) => `
    <tr class="${o.provenance === "estimated" ? "is-inferred" : ""}">
      <td class="ws-opt-code">${esc(o.code || "—")}</td>
      <td class="ws-opt-name">${esc(o.name)}${o.provenance === "estimated" ? `<span class="ws-mark" title="NeoVIN inferred this option rather than confirming it">inferred</span>` : ""}</td>
      <td class="ws-opt-price">${$(o.msrp)}</td>
    </tr>`).join("");

  const standard = s.unpricedOptions.length
    ? `<div class="ws-standard">
         <h4>Included at no extra charge</h4>
         <p>${s.unpricedOptions.map((o) => esc(o.name)).join(" · ")}</p>
       </div>`
    : "";

  const mpg = specs.economy;
  const hasMpg = mpg.city || mpg.highway || mpg.combined;

  return `<div class="ws-sheet">
    <div class="ws-head">
      <div class="ws-head-brand">
        <span class="ws-mono ws-kicker">Monroney reconstruction</span>
        <h3>${esc(title)}</h3>
        ${sub ? `<p class="ws-sub">${esc(sub)}</p>` : ""}
      </div>
      <div class="ws-head-vin">
        <span class="ws-mono ws-kicker">VIN</span>
        <span class="ws-mono ws-vin">${esc(specs.vin)}</span>
      </div>
    </div>

    <div class="ws-body">
      <div class="ws-col">
        <h4>Vehicle</h4>
        <dl class="ws-spec ws-mono">
          ${[
            ["Engine", specs.drivetrain.engine],
            ["Transmission", specs.drivetrain.transmissionDescription || specs.drivetrain.transmission],
            ["Drivetrain", specs.drivetrain.drivetrain],
            ["Fuel", specs.drivetrain.fuelType],
            ["Exterior", specs.colors.exterior?.name],
            ["Interior", specs.colors.interior?.name],
            ["Seating", specs.dimensions.seats ? `${specs.dimensions.seats} passengers` : null],
          ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
        </dl>

        ${hasMpg ? `<div class="ws-mpg">
          <h4>Fuel economy</h4>
          <div class="ws-mpg-row">
            ${[["City", mpg.city], ["Highway", mpg.highway], ["Combined", mpg.combined]]
              .filter(([, v]) => v).map(([k, v]) => `
              <div><span class="ws-mpg-num">${v}</span><span class="ws-mono">${k} MPG</span></div>`).join("")}
          </div>
        </div>` : ""}

        ${specs.highValueFeatures.length ? `<div class="ws-features">
          <h4>Notable equipment</h4>
          <ul>${specs.highValueFeatures.slice(0, 14).map((f) => `<li>${esc(f.label)}</li>`).join("")}</ul>
        </div>` : ""}
      </div>

      <div class="ws-col ws-col-pricing">
        <h4>Optional equipment</h4>
        ${optionRows ? `<table class="ws-options ws-mono">
          <tbody>${optionRows}</tbody>
        </table>` : `<p class="ws-none">No priced factory options returned for this VIN.</p>`}
        ${standard}

        <table class="ws-totals ws-mono">
          <tbody>
            <tr><td>Base MSRP</td><td>${known(s.baseMsrp) ? $(s.baseMsrp.value) : "not returned"}</td></tr>
            <tr><td>Options total</td><td>${known(s.optionsMsrp) ? $(s.optionsMsrp.value) : "not returned"}</td></tr>
            <tr><td>Destination &amp; delivery</td><td>${known(s.delivery) ? $(s.delivery.value) : "not returned"}</td></tr>
            ${s.totalDiscount ? `<tr class="is-credit"><td>Manufacturer discounts</td><td>−${$(Math.abs(s.totalDiscount))}</td></tr>` : ""}
            ${s.totalTax ? `<tr><td>Taxes &amp; levies</td><td>${$(s.totalTax)}</td></tr>` : ""}
          </tbody>
          <tfoot>
            <tr class="ws-grand">
              <td>Total MSRP as built</td>
              <td>${known(s.total) ? $(s.total.value) : "unavailable"}</td>
            </tr>
          </tfoot>
        </table>

        ${s.mismatch ? `<p class="ws-warn">
          The provider's combined MSRP differs from the sum of its own line items by ${$(Math.abs(s.mismatch))}.
          We're showing their combined figure. Ask the dealer for the printed sticker before relying on this total.
        </p>` : ""}

        ${vehicle && known(s.total) ? (() => {
          const diff = s.total.value - vehicle.price;
          return `<div class="ws-vs-ask ${diff > 0 ? "is-under" : diff < 0 ? "is-over" : ""}">
            <span class="ws-mono">Dealer asking</span>
            <strong>${$(vehicle.price)}</strong>
            <span class="ws-vs-delta">${diff > 0 ? `${$(diff)} below sticker` : diff < 0 ? `${$(-diff)} above sticker` : "at sticker"}</span>
          </div>`;
        })() : ""}
      </div>
    </div>

    <div class="ws-foot ws-mono">
      <span>Reconstructed by DealPilot from manufacturer build data · not an official Monroney label</span>
      ${specs.confidence.record != null ? `<span>Decode confidence ${(specs.confidence.record * 100).toFixed(0)}%</span>` : ""}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ modal -- */
/**
 * The sticker as an Apple-style overlay: blurred backdrop, spring-in scale,
 * independent scroll, and no navigation away from the page.
 *
 * States are explicit rather than a spinner-or-nothing, because a VIN decode is
 * a network call the buyer just asked for and silence reads as broken.
 */
export function stickerModal(modal) {
  if (!modal) return "";
  const { vehicle, state } = modal;
  const heading = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`;

  let inner;
  if (state.loading) {
    inner = `<div class="wsm-state">
      <div class="wsm-ring"></div>
      <h3>Pulling the factory build record</h3>
      <p class="ws-mono">Decoding VIN ${esc(vehicle.vin || "")}</p>
    </div>`;
  } else if (!state.decoded) {
    inner = `<div class="wsm-state">
      <h3>No build record for this VIN</h3>
      <p>${esc(state.reason || state.error || "This VIN could not be decoded.")}</p>
      ${state.detail ? `<p class="wsm-detail">${esc(state.detail)}</p>` : ""}
      <p class="wsm-detail">Everything else on this listing is unaffected — only the factory options
        breakdown is unavailable.</p>
    </div>`;
  } else {
    inner = windowSticker(state.specs, vehicle);
  }

  return `<div class="wsm-backdrop" data-action="close-sticker" role="presentation">
    <div class="wsm-shell" role="dialog" aria-modal="true" aria-label="Window sticker for ${esc(heading)}">
      <button class="wsm-close" data-action="close-sticker" aria-label="Close window sticker">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="wsm-scroll">${inner}</div>
    </div>
  </div>`;
}

/* --------------------------------------------------------- options panel -- */
/**
 * The negotiation-relevant view of the build: what's on it, what it cost, and
 * how the asking price compares to the as-built sticker rather than to a
 * generic trim price.
 */
export function optionsPanel(specsState, vehicle) {
  if (!specsState) return "";

  if (specsState.loading) {
    return `<section class="np-specs glass">
      <span class="np-mono np-eyebrow">Build &amp; packages</span>
      <p class="np-specs-loading np-mono">Decoding VIN…</p>
    </section>`;
  }

  if (!specsState.decoded) {
    return `<section class="np-specs glass">
      <span class="np-mono np-eyebrow">Build &amp; packages</span>
      <div class="np-stat is-unavailable">
        <div class="np-stat-label">Factory build data</div>
        <div class="np-stat-gap">Not available</div>
        <div class="np-stat-basis">${esc(specsState.reason || specsState.error || "This VIN could not be decoded.")}</div>
        ${specsState.detail ? `<div class="np-stat-remedy">${esc(specsState.detail)}</div>` : ""}
      </div>
      <p class="np-specs-note">Without the build record, comparable pricing treats every ${esc(vehicle.trim || "unit")} as
        identically equipped — which usually isn't true. Read the market numbers with that in mind.</p>
    </section>`;
  }

  const s = specsState.specs;
  const st = s.sticker;
  const adj = specsState.adjustment;
  const packages = s.options.installed.filter((o) => o.type === "package" && o.msrp);
  const inferred = s.options.installed.filter((o) => o.provenance === "estimated").length;

  return `<section class="np-specs glass">
    <div class="np-section-head">
      <div>
        <span class="np-mono np-eyebrow">Build &amp; packages</span>
        <h2>What's actually on this one</h2>
      </div>
      <button class="np-btn np-btn-ghost np-btn-sm" data-action="open-sticker" data-id="${esc(vehicle.id)}">
        View full window sticker
      </button>
    </div>

    <div class="np-specs-grid">
      ${statBlock("As-built MSRP", st.total, "Base + options + destination for this exact VIN.")}
      ${statBlock("Factory options", st.optionsMsrp, "What the previous configuration decisions added.")}
      ${adj && adj.provenance !== "unavailable" ? `
        <div class="np-stat">
          <div class="np-stat-label">Asking vs. sticker
            <span class="np-prov prov-derived">Calculated</span></div>
          <div class="np-stat-value">${adj.value}%</div>
          <div class="np-stat-basis">${adj.discountFromSticker > 0
            ? `${$(adj.discountFromSticker)} below as-built MSRP`
            : `${$(-adj.discountFromSticker)} above as-built MSRP`}</div>
        </div>` : ""}
    </div>

    ${packages.length ? `<div class="np-packages">
      <h4 class="np-mono">Option packages</h4>
      <ul>
        ${packages.map((p) => `<li class="${p.provenance === "estimated" ? "is-inferred" : ""}">
          <span class="np-pkg-code np-mono">${esc(p.code || "—")}</span>
          <span class="np-pkg-name">${esc(p.name)}</span>
          <span class="np-pkg-price np-mono">${$(p.msrp)}</span>
        </li>`).join("")}
      </ul>
    </div>` : ""}

    ${s.highValueFeatures.length ? `<div class="np-hvf">
      <h4 class="np-mono">Equipment worth naming in a negotiation</h4>
      <div class="np-chips">
        ${s.highValueFeatures.slice(0, 18).map((f) => `<span>${esc(f.label)}</span>`).join("")}
      </div>
    </div>` : ""}

    ${inferred ? `<p class="np-specs-note">
      ${inferred} of ${s.options.installed.length} options were inferred rather than confirmed by the build record.
      Verify anything you plan to argue about against the dealer's printed sticker.
    </p>` : ""}

  </section>`;
}

function statBlock(label, v, fallbackBasis) {
  if (!v || v.provenance === "unavailable") {
    return `<div class="np-stat is-unavailable">
      <div class="np-stat-label">${esc(label)}</div>
      <div class="np-stat-gap">Not available</div>
      <div class="np-stat-basis">${esc(v?.basis || fallbackBasis)}</div>
    </div>`;
  }
  const PROV = { measured: "From build data", derived: "Calculated", estimated: "Estimated" };
  return `<div class="np-stat">
    <div class="np-stat-label">${esc(label)}
      <span class="np-prov prov-${v.provenance}" title="${esc(v.basis)}">${PROV[v.provenance] || v.provenance}</span></div>
    <div class="np-stat-value">${$(v.value)}</div>
  </div>`;
}
