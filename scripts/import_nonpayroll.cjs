// Ingests the maintained Non-Payroll Expense sheet into Supabase as the single
// source of truth. Two outputs from one run:
//   1. structured rows  → nonpayroll_expense  (powers the dashboard view)
//   2. a markdown summary → knowledge_docs     (SSOT doc; grounds the Concierge)
//
//   SUPABASE_URL=https://<proj>.supabase.co \
//   SUPABASE_SERVICE_KEY=<service or sb_secret key> \
//   node scripts/import_nonpayroll.cjs [path/to/expense.csv]
//
// With no key set it does a DRY RUN (parses + prints, no writes).
// Input: export the Google Sheet tab to CSV (default ./data/nonpayroll_expense.csv).
// NOTE: COLUMN_MAP + TEAM_TO_DEPT below are placeholders — finalize them against
// the real sheet's headers once the xlsx/CSV is provided.
const fs = require('fs'), path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', 'data', 'nonpayroll_expense.csv');
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;

// Sheet header → row field. Left = exact column header in the CSV (case-insensitive).
const COLUMN_MAP = {
  period: 'Period', team: 'Team', sub: 'Sub-team', ownerL2: 'L2 EMP ID',
  category: 'Category', tool: 'Tool', planned: 'Planned', actual: 'Actual', notes: 'Notes',
};
// Team label (as written in the sheet) → CD_Relay dept id.
const TEAM_TO_DEPT = {
  'aptitude': 'd-aptenglish', 'english': 'd-aptenglish', 'apt & english': 'd-aptenglish',
  'ds&ml': 'd-dsml', 'dsml': 'd-dsml', 'ds&algo': 'd-dsalgo', 'dsa': 'd-dsalgo',
  'fullstack': 'd-fsgci', 'genai': 'd-fsgci', 'fs/genai': 'd-fsgci',
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/newlines).
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const num = (s) => Number(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')) || 0;

function toRows(csv) {
  const grid = parseCsv(csv);
  if (grid.length < 2) return [];
  const head = grid[0].map((h) => h.trim().toLowerCase());
  const col = (label) => head.indexOf(String(label).toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLUMN_MAP).map(([k, v]) => [k, col(v)]));
  return grid.slice(1).map((r, i) => {
    const get = (k) => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
    const teamLabel = get('team');
    const dept = TEAM_TO_DEPT[teamLabel.toLowerCase()] || null;
    return {
      id: `npe-${get('period') || 'p'}-${i + 1}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
      period: get('period'), dept, sub: get('sub') || null, ownerL2: get('ownerL2') || null,
      category: get('category'), tool: get('tool'),
      planned: num(get('planned')), actual: num(get('actual')),
      currency: 'USD', notes: get('notes') || '',
    };
  });
}

// Build the SSOT knowledge doc (markdown table + per-period totals).
function knowledgeDoc(rows) {
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  let body = '# Non-Payroll Expense (single source of truth)\n\nPlanned vs actual non-payroll spend by tool, category and team. Ingested from the maintained budget sheet.\n';
  for (const p of periods) {
    const inP = rows.filter((r) => r.period === p);
    const plan = inP.reduce((s, r) => s + r.planned, 0), act = inP.reduce((s, r) => s + r.actual, 0);
    body += `\n## ${p}\nPlanned $${plan.toLocaleString()} · Actual $${act.toLocaleString()} · Variance $${(act - plan).toLocaleString()} (${act > plan ? 'over' : 'under'} budget)\n\n`;
    body += '| Team | Category | Tool | Planned | Actual | Variance |\n|---|---|---|---|---|---|\n';
    for (const r of inP) body += `| ${r.dept || r.sub || '—'} | ${r.category} | ${r.tool} | $${r.planned.toLocaleString()} | $${r.actual.toLocaleString()} | $${(r.actual - r.planned).toLocaleString()} |\n`;
  }
  return { id: 'finance/non-payroll-expense', title: 'Non-Payroll Expense', type: 'finance',
    tags: ['finance', 'budget', 'expense'], path: 'finance/non-payroll-expense.md', source: 'sheet', body: body.slice(0, 8000) };
}

async function upsert(table, rows, conflict) {
  const r = await fetch(`${URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

(async () => {
  if (!fs.existsSync(FILE)) { console.error(`No CSV at ${FILE}. Export the sheet tab to CSV there (or pass a path).`); process.exit(1); }
  const rows = toRows(fs.readFileSync(FILE, 'utf8'));
  const doc = knowledgeDoc(rows);

  if (!URL || !KEY) {
    console.log(`DRY RUN — parsed ${rows.length} expense rows (set SUPABASE_URL + SUPABASE_SERVICE_KEY to ingest).`);
    console.log('sample row:', JSON.stringify(rows[0], null, 1));
    const missing = rows.filter((r) => !r.dept).length;
    if (missing) console.log(`⚠ ${missing} rows have no dept mapping — extend TEAM_TO_DEPT.`);
    console.log('knowledge doc preview:\n' + doc.body.slice(0, 400) + '…');
    process.exit(0);
  }

  await upsert('nonpayroll_expense', rows.map((d) => ({ id: d.id, dept: d.dept, data: d })), 'id');
  await upsert('knowledge_docs', [{ id: doc.id, title: doc.title, type: doc.type, tags: doc.tags, path: doc.path, source: doc.source, body: doc.body, data: doc }], 'id');
  console.log(`Ingested ${rows.length} rows into nonpayroll_expense + 1 SSOT doc into knowledge_docs.`);
})().catch((e) => { console.error('Ingest failed:', e.message); process.exit(1); });
