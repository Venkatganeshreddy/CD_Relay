// Deploy a Supabase Edge Function via the Management API.
// Usage: SUPABASE_PAT=sbp_... node scripts/deploy_function.cjs relay-agent supabase/functions/relay-agent/index.ts
const fs = require('fs');

const REF = process.env.SUPABASE_REF || 'fzwgdiphjehecsizvwyl';
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const slug = process.argv[2];
const file = process.argv[3];

if (!PAT) { console.error('Set SUPABASE_PAT (sbp_...).'); process.exit(1); }
if (!slug || !file) { console.error('Usage: node scripts/deploy_function.cjs <slug> <path/to/index.ts>'); process.exit(1); }

const body = fs.readFileSync(file, 'utf8');

(async () => {
  // Try PATCH (update existing function body)
  const API = `https://api.supabase.com/v1/projects/${REF}/functions/${slug}`;
  const res = await fetch(API, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, verify_jwt: true }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`PATCH ${res.status}: ${text}`);
    // Fallback: try POST create
    const createRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, name: slug, body, verify_jwt: true }),
    });
    const createText = await createRes.text();
    console.log(`POST ${createRes.status}: ${createText}`);
    process.exit(createRes.ok ? 0 : 1);
  }
  console.log(`Deployed ${slug} → ${res.status}`);
  console.log(text);
})();
