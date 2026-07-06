// Relay — `planner-cron` Edge Function.
// Month-end Roadmap Planner trigger: on the 25th (see 34_planner_cron.sql)
// pg_cron POSTs here; this forwards one run per pilot sub to the Python
// LangGraph Planner on Modal, which writes the draft to `roadmap_drafts`.
// Modal-only by design (no inline fallback) — rollback = unset MODAL_PLANNER_URL
// or `cron.unschedule('planner-monthly')`. Run logging happens Python-side
// (common.py _log -> ai_runs + activity), so this function stays thin.
//
// Deploy (verify_jwt OFF so cron can call it; protected by CRON_SECRET):
//   SUPABASE_PAT=sbp_... node scripts/deploy_function.cjs planner-cron supabase/functions/planner-cron/index.ts --no-verify-jwt
// Secrets:
//   supabase secrets set MODAL_PLANNER_URL=<run_planner URL> \
//     PLANNER_SUBS="Content — GenAI,Content — Fullstack"
//   (CRON_SECRET and RELAY_AGENT_SECRET are already set for advisor-cron/relay-agent.)
// Manual targeted run: POST {"sub":"Content — GenAI","month":"2026-07"}.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const MODAL_URL = Deno.env.get("MODAL_PLANNER_URL");
const RELAY_SECRET = Deno.env.get("RELAY_AGENT_SECRET");
const DEFAULT_SUBS = "Content — GenAI,Content — Fullstack";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);
  if (!MODAL_URL || !RELAY_SECRET) return json({ error: "MODAL_PLANNER_URL / RELAY_AGENT_SECRET not set" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty body = full pilot run */ }
  // Targeted manual run overrides the pilot list.
  const subs: string[] = body.sub
    ? [String(body.sub)]
    : (Deno.env.get("PLANNER_SUBS") || DEFAULT_SUBS).split(",").map((s) => s.trim()).filter(Boolean);
  const month = body.month || "";

  // Per-sub failures never fail the batch — each result is reported.
  const results = await Promise.all(subs.map(async (sub) => {
    try {
      const r = await fetch(MODAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-relay-secret": RELAY_SECRET },
        body: JSON.stringify({ sub, month }),
      });
      if (!r.ok) return { sub, ok: false, error: `modal ${r.status}` };
      const out = await r.json();
      return { sub, ok: true, ...out };
    } catch (e) {
      return { sub, ok: false, error: String(e) };
    }
  }));

  return json({ ok: results.every((r) => r.ok), results });
});
