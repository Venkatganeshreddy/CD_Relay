// Applies supabase/17_advisor_cron.sql via the Management API (no SQL editor
// needed). Substitutes <PROJECT_REF>/<ANON_KEY>/<CRON_SECRET> from env.
//   $env:SUPABASE_PAT=...; $env:ANON_KEY=...; $env:CRON_SECRET=...; node scripts/apply_cron.cjs
const fs = require('fs');
const REF = process.env.SUPABASE_REF || 'fzwgdiphjehecsizvwyl';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const ANON = process.env.ANON_KEY;
const SECRET = process.env.CRON_SECRET;
if (!PAT || !ANON || !SECRET) { console.error('need SUPABASE_PAT, ANON_KEY, CRON_SECRET'); process.exit(1); }

const sql = fs.readFileSync('supabase/17_advisor_cron.sql', 'utf8')
  .split('<PROJECT_REF>').join(REF)
  .split('<ANON_KEY>').join(ANON)
  .split('<CRON_SECRET>').join(SECRET);

async function query(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  return { status: r.status, text: await r.text() };
}

(async () => {
  const a = await query(sql);
  console.log('apply cron SQL:', a.status, a.text.slice(0, 600));
  const b = await query('select jobid, jobname, schedule, active from cron.job order by jobid;');
  console.log('cron.job:', b.status, b.text.slice(0, 600));
})().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
