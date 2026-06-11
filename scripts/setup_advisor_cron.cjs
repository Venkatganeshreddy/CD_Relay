// One-shot setup + smoke test for the weekly Advisor.
//   1) fetches the project's anon key (Management API)
//   2) sets the CRON_SECRET function secret (generates one if not provided)
//   3) deploys the advisor-cron Edge Function with verify_jwt OFF
//   4) invokes it once and prints the result
//   5) prints the three values to paste into supabase/17_advisor_cron.sql
//
// Usage (PowerShell):
//   $env:SUPABASE_PAT="sbp_..."; node scripts/setup_advisor_cron.cjs
// Optional: $env:SUPABASE_REF=... (defaults to the project ref below),
//           $env:CRON_SECRET=... (otherwise a strong one is generated).
//
// OPENROUTER_API_KEY must already be a function secret (it is, from relay-agent).
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const REF = process.env.SUPABASE_REF || 'fzwgdiphjehecsizvwyl';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET || crypto.randomBytes(24).toString('hex');

if (!PAT) { console.error('Set SUPABASE_PAT (sbp_...). Get one at https://supabase.com/dashboard/account/tokens'); process.exit(1); }

const api = (p, opts = {}) => fetch(`https://api.supabase.com/v1/projects/${REF}${p}`, {
  ...opts, headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

(async () => {
  // 1) anon key
  const kr = await api('/api-keys');
  if (!kr.ok) { console.error('api-keys fetch failed', kr.status, (await kr.text()).slice(0, 200)); process.exit(1); }
  const keys = await kr.json();
  const anon = (keys.find((k) => k.name === 'anon') || {}).api_key;
  if (!anon) { console.error('no anon key in response'); process.exit(1); }
  console.log('✓ fetched anon key');

  // 2) set CRON_SECRET secret
  const sr = await api('/secrets', { method: 'POST', body: JSON.stringify([{ name: 'CRON_SECRET', value: CRON_SECRET }]) });
  console.log(`✓ set CRON_SECRET secret (${sr.status})`);

  // 3) deploy the function (verify_jwt off) via the existing deploy script
  console.log('→ deploying advisor-cron …');
  execFileSync(process.execPath, ['scripts/deploy_function.cjs', 'advisor-cron', 'supabase/functions/advisor-cron/index.ts', '--no-verify-jwt'], { stdio: 'inherit', env: process.env });

  // 4) smoke test — invoke once
  await new Promise((r) => setTimeout(r, 7000)); // let the deploy settle
  const url = `https://${REF}.functions.supabase.co/advisor-cron`;
  console.log(`→ test-invoking ${url} …`);
  const tr = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}`, 'x-cron-secret': CRON_SECRET },
    body: '{}',
  });
  console.log(`  ↳ HTTP ${tr.status}: ${(await tr.text()).slice(0, 500)}`);

  // 5) values for the cron SQL
  console.log('\n=== Paste these into supabase/17_advisor_cron.sql, then run it in the SQL editor ===');
  console.log('  <PROJECT_REF> =', REF);
  console.log('  <ANON_KEY>    =', anon);
  console.log('  <CRON_SECRET> =', CRON_SECRET);
  console.log('\nThen open the app → Second Brain → Recommendations to see the cards.');
})().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
