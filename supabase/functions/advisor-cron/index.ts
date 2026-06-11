// Relay — `advisor-cron` Edge Function (Phase 8).
// Server-side Advisor: builds a grounded brief from Knowledge (org/hierarchy) +
// recent captures (worklogs, flags, KPIs, latest weekly digest, MOM action
// items), asks the model for recommendation cards, and inserts them into the
// `recommendations` table. Invoked WEEKLY by pg_cron (see 17_advisor_cron.sql)
// — no browser needed. The browser "Run Advisor now" button uses the same
// prompt client-side; this is the unattended path.
//
// Deploy (verify_jwt OFF so cron can call it; protected by CRON_SECRET instead):
//   SUPABASE_PAT=sbp_... node scripts/deploy_function.cjs advisor-cron supabase/functions/advisor-cron/index.ts --no-verify-jwt
// Secrets:
//   supabase secrets set OPENROUTER_API_KEY=sk-or-...   (already set for relay-agent)
//   supabase secrets set CRON_SECRET=<a-long-random-string>
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected into the function.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OR_KEY = Deno.env.get("OPENROUTER_API_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const MODEL = Deno.env.get("LLM_MODEL_SMART") || "anthropic/claude-sonnet-4.6";

// Minimal REST helpers (service role bypasses RLS).
async function rest(path: string): Promise<any[]> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (!r.ok) return [];
  return await r.json();
}
async function insertRecs(rows: any[]) {
  if (!rows.length) return true;
  const r = await fetch(`${URL_}/rest/v1/recommendations`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  return r.ok;
}

function buildBrief(d: {
  depts: any[]; emps: any[]; logs: any[]; flags: any[]; kpis: any[]; digest: any | null; moms: any[];
}): string {
  const lines: string[] = [];
  lines.push("# Departments & sub-teams");
  for (const x of d.depts) { const dd = x.data || x; lines.push(`- ${dd.id} "${dd.name}" subs: ${(dd.subs || []).join("; ") || "—"}`); }

  const byUser: Record<string, { name: string; sub: string; hours: number; n: number }> = {};
  for (const w0 of d.logs) {
    const w = w0.data || w0;
    const k = w.userId || w0.owner_id || "?";
    (byUser[k] = byUser[k] || { name: w.userName || k, sub: w.sub || "—", hours: 0, n: 0 });
    byUser[k].hours += (w.hours || 0); byUser[k].n++;
  }
  lines.push("\n# Contributor load (last 14 days)");
  const load = Object.values(byUser).sort((a, b) => b.hours - a.hours).slice(0, 40);
  if (load.length) load.forEach((u) => lines.push(`- ${u.name} (${u.sub}): ${u.hours.toFixed(0)}h across ${u.n} entries`));
  else lines.push("- (no worklogs captured in range)");

  const openFlags = d.flags.map((f) => f.data || f).filter((f: any) => f.state === "open" || !f.state);
  if (openFlags.length) { lines.push("\n# Open flags / blockers"); openFlags.slice(0, 20).forEach((f: any) => lines.push(`- [${f.id}] ${f.title || f.kind || ""} ${f.detail || f.reason || ""}`.trim())); }

  if (d.kpis.length) { lines.push("\n# KPIs"); d.kpis.map((k) => k.data || k).slice(0, 20).forEach((k: any) => lines.push(`- [${k.id}] ${k.name || k.title}: ${k.value ?? "?"}${k.target != null ? " / target " + k.target : ""} ${k.status || ""}`.trim())); }

  if (d.digest) {
    const g = d.digest.data || d.digest;
    lines.push(`\n# Latest weekly digest ${g.weekLabel || ""} (${g.range || g.weekOf || ""})`);
    for (const s of (g.subs || [])) {
      lines.push(`- ${s.sub}: ${s.hours || 0}h, ${(s.rows || []).length} streams`);
      for (const r of (s.rows || []).slice(0, 4)) if (r.achieved) lines.push(`    • ${r.output}: ${r.achieved}`);
    }
  }

  if (d.moms.length) {
    lines.push("\n# Recent meeting action items");
    for (const m0 of d.moms.slice(0, 6)) { const m = m0.data || m0; for (const a of (m.actionItems || []).slice(0, 4)) lines.push(`- ${a.text || a.title} (owner: ${a.owner || a.assignee || "?"}, ${a.status || "open"})`); }
  }
  return lines.join("\n").slice(0, 9000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // Shared-secret gate (function is deployed with verify_jwt = false for cron).
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);
  if (!OR_KEY) return json({ error: "OPENROUTER_API_KEY not set" }, 500);

  try {
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const [depts, emps, logs, flags, kpis, digests, moms] = await Promise.all([
      rest("departments?select=data"),
      rest("employees?select=data"),
      rest(`worklogs?select=data,owner_id&work_date=gte.${since}`),
      rest("flags?select=data"),
      rest("kpis?select=data"),
      rest("weekly_digests?select=data&order=week_of.desc&limit=1"),
      rest("moms?select=data&order=created_at.desc&limit=6"),
    ]);
    const ctx = buildBrief({ depts, emps, logs, flags, kpis, digest: digests[0] || null, moms });

    const allowed = ["operational", "process", "priorities", "people"];
    const prompt = `You are Advisor, the recommendation engine for a Curriculum Development department's operating copilot.\n` +
      `Read the BRIEF below (the department's structure plus its recent captured activity) and propose concrete, actionable suggestions.\n` +
      `Allowed kinds: ${allowed.join(", ")}.\n` +
      `  - operational: risks, missing reports, blocked/overdue work, KPI slips.\n` +
      `  - process: guideline/SOP refinements suggested by recurring patterns.\n` +
      `  - priorities: what to create or prioritise next (coverage gaps, growing backlogs).\n` +
      `  - people: workload balance, reassignment, who is overloaded vs idle.\n` +
      `Rules: ground EVERY suggestion in the brief — never invent names, numbers, or facts not present. ` +
      `Prefer fewer, higher-signal items. Each "detail" is at most 2 sentences and states the so-what + a next step. ` +
      `Set "dept" to the relevant department id from the brief, or "" if cross-department. ` +
      `"severity" is one of low/medium/high. "refs" lists any ids from the brief you used.\n` +
      `Return ONLY JSON: {"items":[{"kind":"operational","title":"...","detail":"...","dept":"","severity":"medium","refs":[]}]}. No preamble.\n\nBRIEF:\n${ctx}`;

    const ai = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://relay.nxtwave.io", "X-Title": "Relay Advisor" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 2048, temperature: 0.3 }),
    });
    const aj = await ai.json();
    if (!ai.ok) return json({ error: aj?.error?.message || "OpenRouter error" }, 502);
    const content: string = aj?.choices?.[0]?.message?.content || "";

    let items: any[] = [];
    try { items = JSON.parse((content.match(/\{[\s\S]*\}/) || ["{}"])[0]).items || []; } catch (_) { /* ignore */ }
    items = items.filter((it) => it && it.title && allowed.includes(it.kind));

    const now = new Date().toISOString();
    const rows = items.map((it, i) => ({
      id: `rec-cron-${Date.now().toString(36)}-${i}`,
      kind: it.kind, dept: it.dept || null, status: "new",
      data: { id: `rec-cron-${Date.now().toString(36)}-${i}`, kind: it.kind, title: it.title, detail: it.detail || "", dept: it.dept || "", severity: it.severity || "medium", refs: it.refs || [], status: "new", agent: "Advisor", ts: now, by: "scheduled" },
    }));
    const ok = await insertRecs(rows);
    return json({ ok, generated: rows.length, model: MODEL });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
