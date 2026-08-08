/* ============================================================================
   UI — pure render helpers. Take data, return HTML strings. No state.
   ============================================================================ */

import { money, mismatchFlags, dealRating } from "./domain.js";
import { cardFeatures } from "./features.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------- vehicle artwork -------- */
const SHAPES = {
  sedan: {
    body: "M16 118 C20 96 33 87 62 83 L120 51 C134 43 152 40 178 40 L242 40 C268 40 285 46 298 59 L327 85 L366 93 C382 97 388 105 388 115 L388 121 C388 127 384 130 378 130 L26 130 C18 130 14 126 16 118 Z",
    glass: "M133 60 L174 50 L174 80 L120 80 Z M188 50 L240 50 C262 50 274 57 284 68 L295 80 L188 80 Z",
    wheels: [[98, 124, 27], [312, 124, 27]],
  },
  suv: {
    body: "M14 116 C18 92 30 84 58 80 L96 44 C106 36 120 33 146 33 L256 33 C282 33 296 38 308 52 L336 84 L368 92 C383 96 389 104 389 114 L389 121 C389 127 385 130 379 130 L24 130 C16 130 12 125 14 116 Z",
    glass: "M110 54 L166 44 L166 78 L100 78 Z M180 44 L252 44 C272 44 282 50 291 62 L303 78 L180 78 Z",
    wheels: [[96, 124, 29], [314, 124, 29]],
  },
  truck: {
    body: "M14 116 C18 94 30 86 56 82 L92 46 C102 38 116 35 142 35 L216 35 C232 35 240 42 240 58 L240 86 L386 86 C390 86 392 89 392 93 L392 121 C392 127 388 130 382 130 L24 130 C16 130 12 125 14 116 Z",
    glass: "M106 56 L160 46 L160 80 L96 80 Z M174 46 L214 46 C224 46 228 51 228 60 L228 80 L174 80 Z",
    wheels: [[92, 124, 29], [318, 124, 29]],
  },
};

/**
 * Real photo when the feed gives one, stylized paint-accurate silhouette when
 * it doesn't. Roughly 8–15% of real listing volume arrives without usable
 * photography, so this is a production fallback, not just a demo asset.
 */
export function vehicleArt(v, height = 168) {
  if (v.photos && v.photos.length) {
    return `<div class="dp-photo" style="height:${height}px">
      <img class="dp-photo-img" src="${esc(v.photos[0])}" alt="${esc(`${v.year} ${v.make} ${v.model}`)}" loading="lazy"
           onerror="this.closest('.dp-photo').innerHTML='';this.closest('.dp-photo').insertAdjacentHTML('beforeend',this.dataset.fb||'')" />
    </div>`;
  }
  const s = SHAPES[v.bodyStyle] || SHAPES.sedan;
  const paint = v.exteriorColor?.hex || "#8A9096";
  const dark = v.exteriorColor?.group === "Black";
  const gid = `p_${String(v.id).replace(/\W/g, "")}`;
  return `<div class="dp-photo" style="height:${height}px">
    <svg viewBox="0 0 400 168" class="dp-photo-svg" role="img"
         aria-label="${esc(`${v.year} ${v.make} ${v.model} in ${v.exteriorColor?.name || "unlisted colour"}`)}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${paint}"/><stop offset="55%" stop-color="${paint}" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#000" stop-opacity="${dark ? 0.35 : 0.22}"/>
      </linearGradient></defs>
      <ellipse cx="200" cy="150" rx="176" ry="9" fill="rgba(18,23,28,0.16)"/>
      <path d="${s.body}" fill="url(#${gid})" stroke="rgba(18,23,28,0.35)" stroke-width="1.5"/>
      <path d="${s.glass}" fill="rgba(18,23,28,0.55)"/>
      ${s.wheels.map(([cx, cy, r]) => `<g>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#15191E"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.58}" fill="#2C333B"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="#454E58"/>
      </g>`).join("")}
    </svg>
    <span class="dp-photo-tag dp-mono">NO DEALER PHOTO · RENDER</span>
  </div>`;
}

/* ------------------------------------------------------------------------ chips ------- */
export function chip(label, { value, active, swatch, action = "chip" } = {}) {
  return `<button type="button" class="dp-chip${active ? " is-active" : ""}"
    data-action="${action}" data-value="${esc(value ?? label)}" data-label="${esc(label)}">
    ${swatch ? `<span class="dp-swatch" style="background:${esc(swatch)}"></span>` : ""}${esc(label)}
  </button>`;
}

/* ------------------------------------------------------------------ vehicle card ------
   INFORMATION HIERARCHY (revised)

     TIER 1  Price + DealPilot rating      — the decision
     TIER 2  Savings + included features    — why it's that grade
     TIER 3  Specs                          — scanning detail
     TIER 4  Dealer, distance, VIN/stock    — logistics, deliberately quietest

   The old card gave equal weight to all four, which meant a buyer had to read
   it rather than glance at it. Same dark theme, same gold, same paper-sticker
   card treatment — only the emphasis changed.
--------------------------------------------------------------------------------------- */
export function vehicleCard(v, criteria, isSaved, ctx = {}) {
  const { pool = [], appliedFeatures = [], specs = null } = ctx;
  const flags = mismatchFlags(v, criteria);
  const discount = v.msrp ? v.msrp - v.price : 0;
  const rating = dealRating(v, pool);
  const feats = cardFeatures(v, appliedFeatures, specs, criteria.features || [], 8);

  return `<article class="dp-card${v.isMock ? " is-sample" : ""}" data-id="${esc(v.id)}">
    <div class="dp-card-photo">
      ${vehicleArt(v)}
      ${v.isMock ? `<span class="dp-sample-stamp dp-mono">SAMPLE DATA</span>` : ""}
      <div class="dp-card-badges dp-mono">
        <span class="dp-badge cond-${esc(String(v.condition).toLowerCase())}">${esc(v.condition)}</span>
      </div>
      <button class="dp-save${isSaved ? " is-saved" : ""}" data-action="save" data-id="${esc(v.id)}"
        aria-label="${isSaved ? "Remove from saved" : "Save this vehicle"}" aria-pressed="${!!isSaved}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isSaved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>
      </button>
    </div>

    <div class="dp-card-body">
      <h3 class="dp-display dp-card-title">${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</h3>
      <div class="dp-mono dp-card-trim">${esc(v.trim || "Trim not listed")}</div>

      <!-- TIER 1 ------------------------------------------------------------ -->
      <div class="dp-card-headline">
        <div class="dp-headline-price">
          <span class="dp-mono dp-label">Asking</span>
          <span class="dp-price">${money(v.price)}</span>
        </div>
        ${rating.grade ? `
          <div class="dp-rating tone-${rating.tone}" title="${esc(rating.basis)}">
            <span class="dp-rating-grade">${rating.grade}</span>
            <span class="dp-mono dp-rating-label">${esc(rating.label)}</span>
          </div>` : `
          <div class="dp-rating is-unrated" title="Fewer than three comparable listings in these results.">
            <span class="dp-rating-grade">—</span>
            <span class="dp-mono dp-rating-label">Not enough<br>comparables</span>
          </div>`}
      </div>

      <!-- TIER 2 ------------------------------------------------------------ -->
      <div class="dp-card-value">
        ${rating.grade && rating.delta < 0
          ? `<span class="dp-value-save">${money(-rating.delta)} under similar listings</span>`
          : rating.grade && rating.delta > 0
          ? `<span class="dp-value-over">${money(rating.delta)} over similar listings</span>` : ""}
        ${discount > 200 ? `<span class="dp-value-msrp dp-mono">${money(discount)} off MSRP ${money(v.msrp)}</span>` : ""}
        ${discount < -200 ? `<span class="dp-value-over dp-mono">${money(-discount)} above MSRP</span>` : ""}
      </div>

      ${flags.length ? `<ul class="dp-flags dp-mono">
        ${flags.map((f) => `<li>${esc(f)}</li>`).join("")}
      </ul>` : ""}

      ${feats.length ? `<div class="dp-features">
        <span class="dp-mono dp-features-label">Included features</span>
        <div class="dp-feature-chips">
          ${feats.map((f) => `<span class="dp-feat${f.wanted ? " is-wanted" : ""} src-${f.source}"
            title="${esc(featureTitle(f))}">${f.wanted ? "✓ " : ""}${esc(f.label)}</span>`).join("")}
        </div>
      </div>` : ""}

      <!-- TIER 3 ------------------------------------------------------------ -->
      <dl class="dp-spec dp-mono">
        <div><dt>Mileage</dt><dd>${v.mileage < 100 ? "New" : v.mileage.toLocaleString() + " mi"}</dd></div>
        <div><dt>Drivetrain</dt><dd>${esc(v.drivetrain || "—")}</dd></div>
        <div><dt>Engine</dt><dd>${esc(v.engine || "—")}</dd></div>
        <div><dt>Exterior</dt><dd><span class="dp-swatch" style="background:${esc(v.exteriorColor?.hex || "#888")}"></span>${esc(v.exteriorColor?.name || "—")}</dd></div>
      </dl>

      <!-- TIER 4 ------------------------------------------------------------ -->
      <div class="dp-card-foot">
        <div class="dp-dealer">
          <div class="dp-dealer-name">${esc(v.dealer.name)}</div>
          <div class="dp-mono dp-muted">${esc(v.dealer.city || "")}${v.dealer.state ? ", " + esc(v.dealer.state) : ""}${v.dealer.distanceMi ? ` · ${v.dealer.distanceMi} mi` : ""}${v.listedDaysAgo ? ` · ${v.listedDaysAgo}d on lot` : ""}</div>
        </div>
        <div class="dp-ids dp-mono">
          <span>VIN ${esc(v.vin || "—")}</span>${v.stockNumber ? `<span>STOCK ${esc(v.stockNumber)}</span>` : ""}
        </div>
      </div>

      <div class="dp-card-actions">
        <button class="dp-btn dp-btn-negotiate dp-btn-sm" data-action="negotiate" data-id="${esc(v.id)}">Negotiate this car</button>
        ${v.vin ? `<button class="dp-btn dp-btn-ghost dp-btn-sm" data-action="open-sticker" data-id="${esc(v.id)}">Window sticker</button>` : ""}
        <button class="dp-btn dp-btn-ghost dp-btn-sm" data-action="detail" data-id="${esc(v.id)}">Details</button>
      </div>
    </div>
  </article>`;
}

/* Chip tooltips state HOW we know, not just what. "Confirmed" means the
   provider filtered on it; "derived" means we read it off the listing. */
const FEATURE_SOURCE_TEXT = {
  confirmed: "Confirmed — the inventory search filtered on this feature, so this vehicle has it.",
  derived: "Read from this listing's own specifications.",
  decoded: "Confirmed by the factory build record for this VIN.",
};
const featureTitle = (f) => FEATURE_SOURCE_TEXT[f.source] || "";

export function eyebrow(text, tone = "amber") {
  return `<div class="dp-eyebrow dp-mono tone-${tone}">${esc(text)}</div>`;
}
