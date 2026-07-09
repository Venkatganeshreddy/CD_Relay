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

// Log the inline model call to ai_runs + activity, mirroring the shape the
// client (logRun) and Modal (common.py _log) write, so scheduled Advisor runs
// show on the AI runs page. Best-effort: logging must never fail the cron.
// (The Modal path logs its own runs Python-side — this covers the fallback.)
const PRICES: Record<string, [number, number]> = { // $/M tokens, in/out — keep aligned with supabase-client.js MODEL_PRICES
  "anthropic/claude-sonnet-4.6": [3, 15],
  "anthropic/claude-haiku-4.5": [1, 5],
};
function nowIst(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16) + " IST";
}
async function logAiRun(tin: number, tout: number, latencyMs: number, output: string) {
  const [pin, pout] = PRICES[MODEL] || [3, 15];
  const id = "run-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const run = {
    id, agent: "Advisor", model: MODEL, latencyMs, tokensIn: tin, tokensOut: tout,
    costUsd: (tin * pin + tout * pout) / 1e6, outcome: "OK", ts: nowIst(), scopeHash: "live",
    via: "cron", input: "Weekly cron", output: output.slice(0, 240), by: "scheduled",
  };
  const actId = "act-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const act = { id: actId, kind: "agent", ts: run.ts, text: "Advisor ran · Weekly cron", icon: "⚙" };
  const post = (table: string, body: unknown) => fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify([body]),
  });
  await Promise.all([
    post("ai_runs", { id: run.id, agent: "Advisor", data: run }),
    post("activity", { id: actId, data: act }),
  ]).catch(() => {});
}

function buildBrief(d: {
  depts: any[]; emps: any[]; logs: any[]; flags: any[]; kpis: any[]; digest: any | null; moms: any[];
}): string {
  const lines: string[] = [];
  lines.push("# Departments & sub-teams");
  for (const x of d.depts) { const dd = x.data || x; lines.push(`- ${dd.id} "${dd.name}" subs: ${(dd.subs || []).join("; ") || "—"}`); }

  // Roster — grounds 'people' recommendations in real names/levels/teams.
  const roster = d.emps.map((e) => e.data || e).filter((e: any) => e.name);
  if (roster.length) {
    lines.push("\n# Team roster (name — level — team)");
    roster.slice(0, 60).forEach((e: any) => lines.push(`- ${e.name} — ${e.level || e.role || "?"} — ${e.sub || e.dept || "—"}`));
  }

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

  const allowed = ["operational", "process", "priorities", "people"];
  // Map Advisor items -> recommendation rows and insert. Shared by the Modal and
  // inline paths so the persisted DB shape is identical either way.
  async function persist(rawItems: any[]): Promise<{ ok: boolean; count: number }> {
    const items = (rawItems || []).filter((it) => it && it.title && allowed.includes(it.kind));
    const now = new Date().toISOString();
    const batch = Date.now().toString(36); // row.id must equal data.id (triage matches on it)
    const rows = items.map((it, i) => {
      const id = `rec-cron-${batch}-${i}`;
      return {
        id, kind: it.kind, dept: it.dept || null, status: "new",
        data: { id, kind: it.kind, title: it.title, detail: it.detail || "", dept: it.dept || "", severity: it.severity || "medium", refs: it.refs || [], status: "new", agent: "Advisor", ts: now, by: "scheduled" },
      };
    });
    const ok = rows.length ? await insertRecs(rows) : true;
    return { ok, count: rows.length };
  }

  // ── Cut-over: delegate to the Python LangGraph Advisor on Modal when wired.
  // Unset MODAL_ADVISOR_URL to instantly roll back to the inline path below.
  const MODAL_URL = Deno.env.get("MODAL_ADVISOR_URL");
  const RELAY_SECRET = Deno.env.get("RELAY_AGENT_SECRET");
  if (MODAL_URL && RELAY_SECRET) {
    try {
      const mr = await fetch(MODAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-relay-secret": RELAY_SECRET },
        body: JSON.stringify({ kinds: allowed }),
      });
      if (!mr.ok) throw new Error(`Modal ${mr.status}`);
      const mj = await mr.json();
      const r = await persist(mj.items || []);
      return json({ ok: r.ok, generated: r.count, model: "modal:advisor", path: "modal" });
    } catch (e) {
      console.error("[advisor-cron] Modal path failed, falling back to inline:", String((e as Error)?.message || e));
      // fall through to the inline OpenRouter path
    }
  }

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

    // Trace through Helicone when configured (tag: advisor); else direct.
    const HELI = Deno.env.get("HELICONE_API_KEY");
    const t0 = Date.now();
    const ai = await fetch(
      HELI ? "https://openrouter.helicone.ai/api/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json",
        "HTTP-Referer": "https://relay.nxtwave.io", "X-Title": "Relay Advisor",
        ...(HELI ? { "Helicone-Auth": `Bearer ${HELI}`, "Helicone-Property-Agent": "advisor" } : {}),
      },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 2048, temperature: 0.3 }),
    });
    const aj = await ai.json();
    const latencyMs = Date.now() - t0;
    if (!ai.ok) return json({ error: aj?.error?.message || "OpenRouter error" }, 502);
    // OpenRouter can soft-fail: HTTP 200 with an {error} body. Surface it
    // instead of silently returning ok:true with 0 cards (cron would never know).
    if (aj?.error) return json({ error: aj.error.message || String(aj.error) }, 502);
    const content: string = aj?.choices?.[0]?.message?.content || "";

    let items: any[] = [];
    try { items = JSON.parse((content.match(/\{[\s\S]*\}/) || ["{}"])[0]).items || []; } catch (_) { /* ignore */ }

    const r = await persist(items);
    const u = aj?.usage || {};
    await logAiRun(u.prompt_tokens || 0, u.completion_tokens || 0, latencyMs, `${r.count} recommendations generated`);
    return json({ ok: r.ok, generated: r.count, model: MODEL, path: "inline" });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
