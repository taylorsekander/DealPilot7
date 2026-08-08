/* ============================================================================
   Platform-neutral core. Wrapped by netlify/functions/* and functions/api/*.
   Takes (request, env) and returns a Response — works on Node and on Workers.
   Do NOT reference process.env in here; env is passed in by the wrapper.

   [PLUG:LEAD-GEN]  POST /api/lead-submit

   Currently: validates, logs, returns a lead id. Nothing is transmitted.

   To make this real, in order:
     1. PERSIST FIRST. Write the lead to your own store (Netlify Blobs, Supabase,
        Postgres) before attempting delivery. The dealer POST is best-effort.
     2. QUEUE THE DELIVERY. Never call the dealer's endpoint inline with the
        user's click — a slow CRM should not become a slow button. Netlify
        Background Functions or a queue handle the retry.
     3. FORMAT. Most automotive CRMs still speak ADF/XML. Build the ADF document
        from this payload, or push directly to VinSolutions / Elead /
        DealerSocket via their APIs.
     4. ATTRIBUTE. Store providerId, dealerId, vehicleId and the originating
        search. Payouts are per-lead or per-sale; without attribution there is
        no billing and no way to prove value to the dealer.
     5. COMPLY. TCPA consent text must be shown on the form, captured verbatim,
        and stored with a timestamp. Honor DNC. This is not optional.

   ADF skeleton for step 3:
     <?ADF VERSION "1.0"?>
     <adf><prospect><requestdate/><vehicle interest="buy" status="used">
     <year/><make/><model/><vin/><stock/></vehicle>
     <customer><contact><name part="full"/><email/><phone/></contact>
     <comments/></customer><vendor><vendorname/></vendor></prospect></adf>
   ============================================================================ */

export async function handleLeadSubmit(req, env) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let lead;
  try { lead = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const { user = {}, vehicleId, dealerId } = lead;
  if (!user.name || !user.email?.includes("@")) return json({ error: "name and a valid email are required" }, 400);
  if (!vehicleId || !dealerId) return json({ error: "vehicleId and dealerId are required" }, 400);

  if (lead.isMock) {
    console.info("[lead-submit] sample-data lead, not delivered:", vehicleId);
    return json({ ok: true, delivered: false, reason: "sample data", leadId: `demo_${Date.now()}` });
  }

  const leadId = `lead_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  // 1. PERSIST — replace with a real write.
  console.info("[lead-submit] received", { leadId, vehicleId, dealerId, email: user.email });

  // 2. QUEUE DELIVERY — replace with the ADF post / CRM call.
  //    await queue.publish("dealer-lead", { leadId, ...lead });

  return json({ ok: true, delivered: false, leadId, note: "stored only; dealer delivery not yet wired" });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
