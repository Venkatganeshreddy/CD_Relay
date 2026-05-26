// One-off: create Supabase Auth accounts for the Relay managers via the GoTrue
// admin API. The on_auth_user_created trigger (05_auth.sql) links each to its
// employees row by email; 05's backfill covers any created before the trigger.
//
// Run (key from env, NEVER hardcoded / committed):
//   SUPABASE_URL=https://<proj>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//   RELAY_DEFAULT_PASSWORD='Relay@Nxtwave1' \
//   node scripts/create_auth_users.cjs
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.RELAY_DEFAULT_PASSWORD || 'Relay@Nxtwave1';
if (!URL || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// Manager accounts (Vijay omitted until his real email is provided).
const EMAILS = [
  'pavangangireddy@nxtwave.co.in',
  'aryaa.sharma@nxtwave.co.in',
  'meesala.chanakya@nxtwave.co.in',
  'pushpa.chenna@nxtwave.co.in',
  'tejaswini.venkata@nxtwave.co.in',
  'poojitha.pachava@nxtwave.co.in',
  'rushikesh.konapure@nxtwave.co.in',
  'kakarla.pavanteja@nxtwave.co.in',
];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

(async () => {
  // probe
  const probe = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=1`, { headers: H });
  if (!probe.ok) { console.error('Probe failed', probe.status, (await probe.text()).slice(0, 200)); process.exit(1); }
  console.log('Connectivity OK. Creating', EMAILS.length, 'accounts (password =', JSON.stringify(PW) + ')\n');

  for (const email of EMAILS) {
    const res = await fetch(`${URL}/auth/v1/admin/users`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ email, password: PW, email_confirm: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) console.log('  created  ', email, j.id || '');
    else console.log('  skip/err ', email, '-', (j.msg || j.error_description || j.error || JSON.stringify(j)).toString().slice(0, 90));
  }
})();
