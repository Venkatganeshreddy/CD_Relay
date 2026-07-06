// One-shot setup + smoke test for the monthly Roadmap Planner.
//   1) fetches the project's anon key (Management API)
//   2) reuses the existing CRON_SECRET (recovered from the advisor-weekly cron
//      job's command), or generates + sets a new one if absent
//   3) sets PLANNER_SUBS (+ MODAL_PLANNER_URL when provided) function secrets
//   4) deploys the planner-cron Edge Function with verify_jwt OFF
//   5) applies supabase/33_roadmap_drafts.sql and 34_planner_cron.sql
//      (placeholders filled automatically)
//   6) if MODAL_PLANNER_URL was provided, invokes the function once for one sub
//
// Usage (PowerShell):
//   $env:SUPABASE_PAT="sbp_..."; $env:MODAL_PLANNER_URL="https://…run-planner…"; node scripts/setup_planner_cron.cjs
// Optional: $env:SUPABASE_REF=..., $env:CRON_SECRET=..., $env:PLANNER_SUBS=...
const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const REF = process.env.SUPABASE_REF || 'fzwgdiphjehecsizvwyl';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const MODAL_URL = process.env.MODAL_PLANNER_URL || '';
const SUBS = process.env.PLANNER_SUBS || 'Content — GenAI,Content — Fullstack';

if (!PAT) { console.error('Set SUPABASE_PAT (sbp_...). Get one at https://supabase.com/dashboard/account/tokens'); process.exit(1); }

const api = (p, opts = {}) => fetch(`https://api.supabase.com/v1/projects/${REF}${p}`, {
  ...opts, headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});
const sql = async (query, label) => {
  const r = await api('/database/query', { method: 'POST', body: JSON.stringify({ query }) });
  const text = await r.text();
  if (!r.ok) { console.error(`✗ ${label} failed — HTTP ${r.status}: ${text.slice(0, 400)}`); process.exit(1); }
  console.log(`✓ ${label}`);
  return text;
};

(async () => {
  // 1) anon key
  const kr = await api('/api-keys');
  if (!kr.ok) { console.error('api-keys fetch failed', kr.status, (await kr.text()).slice(0, 200)); process.exit(1); }
  const anon = ((await kr.json()).find((k) => k.name === 'anon') || {}).api_key;
  if (!anon) { console.error('no anon key in response'); process.exit(1); }
  console.log('✓ fetched anon key');

  // 2) CRON_SECRET — reuse the one already wired into the advisor cron job.
  let cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) {
    const rows = JSON.parse(await sql(
      "select command from cron.job where jobname = 'advisor-weekly'", 'read advisor-weekly cron job'));
    const m = /'x-cron-secret',\s*'([^']+)'/.exec((rows[0] || {}).command || '');
    cronSecret = m ? m[1] : '';
    if (cronSecret) console.log('✓ reusing existing CRON_SECRET');
  }
  if (!cronSecret) {
    cronSecret = crypto.randomBytes(24).toString('hex');
    const sr = await api('/secrets', { method: 'POST', body: JSON.stringify([{ name: 'CRON_SECRET', value: cronSecret }]) });
    console.log(`✓ set new CRON_SECRET secret (${sr.status})`);
  }

  // 3) planner secrets
  const secrets = [{ name: 'PLANNER_SUBS', value: SUBS }];
  if (MODAL_URL) secrets.push({ name: 'MODAL_PLANNER_URL', value: MODAL_URL });
  if (process.env.RELAY_AGENT_SECRET) secrets.push({ name: 'RELAY_AGENT_SECRET', value: process.env.RELAY_AGENT_SECRET });
  const sr = await api('/secrets', { method: 'POST', body: JSON.stringify(secrets) });
  console.log(`✓ set ${secrets.map((s) => s.name).join(' + ')} (${sr.status})`);
  if (!MODAL_URL) console.log('  (MODAL_PLANNER_URL not provided — set it after `modal deploy` and re-run, or set the secret manually)');

  // 4) deploy the function (verify_jwt off)
  console.log('→ deploying planner-cron …');
  execFileSync(process.execPath, ['scripts/deploy_function.cjs', 'planner-cron', 'supabase/functions/planner-cron/index.ts', '--no-verify-jwt'],
    { stdio: 'inherit', env: { ...process.env, SUPABASE_PAT: PAT, SUPABASE_REF: REF } });

  // 5) apply the SQL — table+RLS+doctrine seed, then the schedule with real values
  await sql(fs.readFileSync('supabase/33_roadmap_drafts.sql', 'utf8'), 'applied 33_roadmap_drafts.sql');
  const cron34 = fs.readFileSync('supabase/34_planner_cron.sql', 'utf8')
    .replaceAll('<PROJECT_REF>', REF).replaceAll('<ANON_KEY>', anon).replaceAll('<CRON_SECRET>', cronSecret);
  await sql(cron34, 'applied 34_planner_cron.sql (planner-monthly scheduled, 25th 06:30 IST)');

  // 6) smoke test — one real run for the first pilot sub (writes a roadmap_drafts row)
  if (MODAL_URL) {
    await new Promise((r) => setTimeout(r, 7000)); // let the deploy settle
    const sub = SUBS.split(',')[0].trim();
    const url = `https://${REF}.functions.supabase.co/planner-cron`;
    console.log(`→ test-invoking ${url} for "${sub}" (LLM run — may take a minute) …`);
    const tr = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}`, 'x-cron-secret': cronSecret },
      body: JSON.stringify({ sub }),
    });
    console.log(`  ↳ HTTP ${tr.status}: ${(await tr.text()).slice(0, 600)}`);
    console.log('\nCheck: roadmap_drafts row + ai_runs "Planner" row, then open Concierge as the pilot L2 → 🗺 Roadmap chip.');
  }
})().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
