/* ============================================================================
   Platform-neutral core. Wrapped by netlify/functions/* and functions/api/*.
   Takes (request, env) and returns a Response — works on Node and on Workers.
   Do NOT reference process.env in here; env is passed in by the wrapper.

   GET /api/vin-decode?vin=...

   NHTSA vPIC. Free, no key, no rate limit worth worrying about, and it is the
   authoritative source for what a VIN actually is. Useful for verifying that a
   dealer's listing text matches the vehicle it claims to describe — a listing
   that says "King Ranch" over a VIN that decodes to Lariat is exactly the kind
   of thing DealPilot should catch.
   ============================================================================ */

export async function handleVinDecode(req, env) {
  const vin = new URL(req.url).searchParams.get("vin");
  if (!vin || vin.length !== 17) return json({ error: "vin must be 17 characters" }, 400);

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
    );
    if (!res.ok) throw new Error(`vpic ${res.status}`);
    const data = await res.json();
    const r = data.Results?.[0] || {};

    return json({
      vin,
      year: r.ModelYear || null,
      make: r.Make || null,
      model: r.Model || null,
      trim: r.Trim || r.Series || null,
      bodyClass: r.BodyClass || null,
      driveType: r.DriveType || null,
      engine: [r.DisplacementL && `${Number(r.DisplacementL).toFixed(1)}L`, r.EngineConfiguration, r.EngineCylinders && `${r.EngineCylinders}-cyl`]
        .filter(Boolean).join(" ") || null,
      transmission: [r.TransmissionSpeeds, r.TransmissionStyle].filter(Boolean).join("-spd ") || null,
      plant: [r.PlantCity, r.PlantCountry].filter(Boolean).join(", ") || null,
    });
  } catch (err) {
    console.error("[vin-decode]", err);
    return json({ error: String(err.message || err) }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
  });
}
