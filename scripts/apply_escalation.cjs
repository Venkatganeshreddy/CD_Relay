#!/usr/bin/env node
// Apply supabase/09_escalation.sql to prod via the Management API, then verify.
// Run: SUPABASE_PAT=<personal_access_token> node scripts/apply_escalation.cjs
const fs = require('fs');
const path = require('path');
const REF = process.env.SUPABASE_REF || 'fzwgdiphjehecsizvwyl';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
if (!PAT) { console.error('Set SUPABASE_PAT (Supabase personal access token, sbp_...).'); process.exit(1); }

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
async function run(query, label) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await res.text();
  if (!res.ok) { console.error(`${label} FAILED ${res.status}: ${txt.slice(0, 400)}`); process.exit(1); }
  let out; try { out = JSON.parse(txt); } catch (_) { out = txt; }
  console.log(`${label} OK`, typeof out === 'object' ? JSON.stringify(out) : out);
  return out;
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', '09_escalation.sql'), 'utf8');
  await run(sql, 'apply 09_escalation.sql');
  await run('select app.run_escalations(48) as escalated, app.run_overdue_triggers() as overdue;', 'dry-run automations');
  await run("select jobname, schedule, active from cron.job where jobname = 'relay-task-automations';", 'cron job registered');
})();
