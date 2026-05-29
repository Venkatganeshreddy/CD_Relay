// Apply a .sql file to the Relay prod DB via the Supabase Management API.
// Run: SUPABASE_PAT=<personal_access_token> node scripts/apply_sql.cjs supabase/11_agent_memory.sql
const fs = require('fs');

const REF = process.env.SUPABASE_REF || 'fzwgdiphjehecsizvwyl';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];

if (!PAT) { console.error('Set SUPABASE_PAT (Supabase personal access token, sbp_...).'); process.exit(1); }
if (!file) { console.error('Usage: node scripts/apply_sql.cjs <path/to/file.sql>'); process.exit(1); }

const query = fs.readFileSync(file, 'utf8');
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

(async () => {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); process.exit(1); }
  console.log(`Applied ${file} → ${res.status}`);
  console.log(text);
})();
