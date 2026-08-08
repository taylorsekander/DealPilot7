/* ============================================================================
   Platform-neutral core. Wrapped by src/index.js. Takes (request, env),
   returns a Response. Never reference process.env here.

   GET /api/health

   ── Why this exists ─────────────────────────────────────────────────────────
   "Missing API key" is ambiguous from the outside. The key could be absent,
   misnamed, set on a different project, set only on the Preview environment, or
   wiped by a deploy. All five look identical in the browser.

   This endpoint reports what the RUNNING Worker can actually see, which
   collapses that ambiguity to a single yes/no per variable.

   ── Safety ──────────────────────────────────────────────────────────────────
   It never returns a secret value. Only presence, length, and a masked
   fingerprint (first 2 and last 2 characters) — enough to confirm you pasted
   the right key without exposing it. Length alone catches the two most common
   mistakes: a trailing newline from copy-paste, and pasting a truncated key.
   ============================================================================ */

const EXPECTED = [
  { name: "MARKETCHECK_API_KEY", required: true,
    purpose: "Live inventory search and NeoVIN window-sticker decoding.",
    fix: "Cloudflare → your Worker → Settings → Variables and Secrets → Add → type Secret." },
  { name: "INVENTORY_PROVIDER", required: false,
    purpose: "Which provider to query. Defaults to 'marketcheck' when unset.",
    fix: "Optional. Set to 'marketcheck' or 'autodev' as a plaintext variable." },
  { name: "ANTHROPIC_API_KEY", required: false,
    purpose: "Claude-written market summaries and negotiation messages. Falls back to the built-in analyst.",
    fix: "Optional. Add as a Secret if you want model-written copy." },
  { name: "AUTODEV_API_KEY", required: false,
    purpose: "Only used if INVENTORY_PROVIDER is set to 'autodev'.",
    fix: "Optional." },
];

/** Masked fingerprint — proves identity without revealing the value. */
function fingerprint(v) {
  if (typeof v !== "string" || !v.length) return null;
  if (v.length <= 6) return "•".repeat(v.length);
  return `${v.slice(0, 2)}${"•".repeat(Math.min(v.length - 4, 24))}${v.slice(-2)}`;
}

export async function handleHealth(req, env) {
  const vars = EXPECTED.map((e) => {
    const raw = env?.[e.name];
    const present = typeof raw === "string" && raw.length > 0;
    const trimmed = present ? raw.trim() : "";

    return {
      name: e.name,
      present,
      required: e.required,
      length: present ? raw.length : 0,
      fingerprint: fingerprint(raw),
      // Copy-paste from a dashboard very often carries a trailing newline or
      // space, which some APIs reject with a confusing 401.
      hasWhitespace: present && trimmed.length !== raw.length,
      purpose: e.purpose,
      ...(present ? {} : { fix: e.fix }),
    };
  });

  const missingRequired = vars.filter((v) => v.required && !v.present);
  const whitespace = vars.filter((v) => v.hasWhitespace);

  // Names that look like near-misses of what we expect — catches typos and
  // casing errors, which the dashboard will happily accept.
  const known = new Set(EXPECTED.map((e) => e.name));
  const suspicious = Object.keys(env || {})
    .filter((k) => !known.has(k) && /market|check|anthropic|autodev|api.?key|inventory/i.test(k));

  return new Response(JSON.stringify({
    ok: missingRequired.length === 0 && whitespace.length === 0,
    worker: "dealpilot",
    checkedAt: new Date().toISOString(),
    variables: vars,
    bindingsVisible: Object.keys(env || {}).length,
    suspiciousNames: suspicious.length ? suspicious : undefined,
    verdict: missingRequired.length
      ? `The running Worker cannot see ${missingRequired.map((v) => v.name).join(", ")}. ` +
        `The variable is either absent, named differently, set on a different Worker or project, ` +
        `or was set only on the Preview environment. Adding it does not apply to a deployment that ` +
        `is already running — redeploy after saving.`
      : whitespace.length
      ? `${whitespace.map((v) => v.name).join(", ")} contains leading or trailing whitespace. ` +
        `Re-paste without the stray space or newline.`
      : "All required variables are visible to the Worker.",
  }, null, 2), {
    status: missingRequired.length ? 503 : 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
