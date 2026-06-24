// Ingests the maintained Non-Payroll Expense sheet into Supabase as the single
// source of truth. Two outputs from one run:
//   1. structured rows  → nonpayroll_expense  (powers the dashboard view)
//   2. a markdown summary → knowledge_docs     (SSOT doc; grounds the Concierge)
//
//   SUPABASE_URL=https://<proj>.supabase.co \
//   SUPABASE_SERVICE_KEY=<service or sb_secret key> \
//   node scripts/import_nonpayroll.cjs "path/to/Non Payroll - <tab>.csv"
//
// With no key set it does a DRY RUN (parses + prints, no writes).
// Mapped to the real sheet headers (Apr'26–Mar'27 FY budget). Amounts are INR.
// NOTE: this sheet carries BUDGETED (planned) amounts only — there is no actual
// column, so `actual` is left null until an actuals source is wired.
const fs = require('fs'), path = require('path');

// One CSV per department tab — pass all of them; rows are concatenated.
const FILES = process.argv.slice(2);
if (!FILES.length) FILES.push(path.join(__dirname, '..', 'data', 'nonpayroll_expense.csv'));
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;

// Real sheet header → row field (case-insensitive exact match).
const COLUMN_MAP = {
  dept: 'Beneficiary Department', sub: 'Beneficiary Sub-Department', type: 'Type',
  tool: 'Vendor', notes: 'Description', category: 'Category',
  planned: 'Budgeted Payment Amount (Exc GST)', gst: 'GST Rate (%)', period: 'Due Month for Payment',
};
// Beneficiary Department label → CD_Relay dept id.
const TEAM_TO_DEPT = {
  'content - fs, genai, csi & co': 'd-fsgci',
  'university partnership': 'd-fsgci',
  'content - ds&ml': 'd-dsml',
  'content - ds&algo': 'd-dsalgo',
  'content - aptitude & english': 'd-aptenglish',
  'assessments pod': 'd-aptenglish',
};
// Beneficiary Sub-Department (raw, lowercased+trimmed) → CD_Relay sub label.
// 'na'/'' → null (dept-level budget, e.g. DS&ML / DS&Algo).
const SUB_NORMALIZE = {
  'content- fullstack': 'Content — Fullstack',
  'content- genai': 'Content — GenAI',
  'content - gen ai': 'Content — GenAI',
  'content- csi&co': 'Central Ops',          // CSI&CO = Central Ops (Vijay; Pavan/L3 sees all)
  'content-aptitude': 'Content — Aptitude',
  'content-english': 'Content — English',
  'assessment intelligence': 'Assessment Intelligence',
  'na': null, '': null,
};
// CD_Relay sub → L2 owner emp id (budget owner).
const SUB_TO_L2 = {
  'Content — Fullstack': 'NW0001771',       // Chanakya Meesala
  'Content — GenAI': 'NW0001778',           // Pushpa Latha Chenna
  'University Partnership': 'NW0006700',     // Sunil Tekale
  'Central Ops': 'NW-VIJAY-CO',             // Vijay (CSI&CO budget)
  'Content — Aptitude': 'NW0002849',         // Poojitha pachava
  'Content — English': 'NW0006195',          // Pratik Bhattacharjee
};
// Dept-level L2 owner — used when a row has no sub (DS&ML / DS&Algo).
const DEPT_TO_L2 = {
  'd-dsml': 'NW0005433',                     // Rushikesh Konapure
  'd-dsalgo': 'NW0002023',                   // Kakarla Pavan Teja
};
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

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
// 'Mar-27' / 'Aug-26' → sortable 'YYYY-MM'.
const toPeriod = (s) => {
  const m = String(s || '').trim().toLowerCase().match(/^([a-z]{3})-?(\d{2})$/);
  return m && MONTHS[m[1]] ? `20${m[2]}-${MONTHS[m[1]]}` : (s || '').trim();
};

function toRows(csv) {
  const grid = parseCsv(csv);
  if (grid.length < 2) return [];
  const head = grid[0].map((h) => h.trim().toLowerCase());
  const col = (label) => head.indexOf(String(label).toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLUMN_MAP).map(([k, v]) => [k, col(v)]));
  return grid.slice(1).map((r, i) => {
    const get = (k) => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
    const dept = TEAM_TO_DEPT[get('dept').toLowerCase().trim()] || null;
    const subRaw = get('sub').toLowerCase().trim();
    const sub = (subRaw in SUB_NORMALIZE) ? SUB_NORMALIZE[subRaw] : (get('sub').trim() || null);
    const period = toPeriod(get('period'));
    return {
      id: `npe-${dept || 'x'}-${period}-${i + 1}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
      period, dept, sub, ownerL2: (sub && SUB_TO_L2[sub]) || DEPT_TO_L2[dept] || null,
      category: get('category'), tool: get('tool'),
      planned: num(get('planned')), actual: null,        // budget sheet has no actuals
      gst: num(get('gst')) || null, currency: 'INR', notes: get('notes') || '',
    };
  });
}

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

// Build the SSOT knowledge doc (per-period budget totals + a sample of lines).
function knowledgeDoc(rows) {
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const grand = rows.reduce((s, r) => s + r.planned, 0);
  let body = `# Non-Payroll Expense — Budget (single source of truth)\n\nBudgeted (planned) non-payroll OpEx, Apr'26–Mar'27. Amounts in INR, excl GST. Ingested from the maintained budget sheet. Total budgeted: ${inr(grand)}.\n`;
  // By category and by sub-team rollups.
  const roll = (key) => {
    const m = {};
    for (const r of rows) { const k = r[key] || '—'; m[k] = (m[k] || 0) + r.planned; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  body += '\n## By category\n' + roll('category').map(([k, v]) => `- ${k}: ${inr(v)}`).join('\n') + '\n';
  body += '\n## By sub-team\n' + roll('sub').map(([k, v]) => `- ${k}: ${inr(v)}`).join('\n') + '\n';
  body += '\n## By vendor/tool\n' + roll('tool').map(([k, v]) => `- ${k}: ${inr(v)}`).join('\n') + '\n';
  body += '\n## Monthly budget\n' + periods.map((p) => `- ${p}: ${inr(rows.filter((r) => r.period === p).reduce((s, r) => s + r.planned, 0))}`).join('\n') + '\n';
  return { id: 'finance/non-payroll-expense', title: 'Non-Payroll Expense (Budget)', type: 'finance',
    tags: ['finance', 'budget', 'expense', 'non-payroll'], path: 'finance/non-payroll-expense.md', source: 'sheet', body: body.slice(0, 8000) };
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
  const rows = [];
  for (const f of FILES) {
    if (!fs.existsSync(f)) { console.error(`No CSV at ${f}.`); process.exit(1); }
    rows.push(...toRows(fs.readFileSync(f, 'utf8')));
  }
  const doc = knowledgeDoc(rows);

  if (!URL || !KEY) {
    const grand = rows.reduce((s, r) => s + r.planned, 0);
    console.log(`DRY RUN — parsed ${rows.length} budget rows · total ${inr(grand)} (set SUPABASE keys to ingest).`);
    const missingDept = rows.filter((r) => !r.dept).length;
    const unmappedSub = [...new Set(rows.filter((r) => r.sub && !SUB_TO_L2[r.sub]).map((r) => r.sub))];
    if (missingDept) console.log(`⚠ ${missingDept} rows have no dept mapping — extend TEAM_TO_DEPT.`);
    if (unmappedSub.length) console.log(`⚠ subs with no L2 owner: ${unmappedSub.join(', ')}`);
    console.log('sample row:', JSON.stringify(rows[0], null, 1));
    console.log('\n' + doc.body.slice(0, 700) + '…');
    process.exit(0);
  }

  await upsert('nonpayroll_expense', rows.map((d) => ({ id: d.id, dept: d.dept, data: d })), 'id');
  await upsert('knowledge_docs', [{ id: doc.id, title: doc.title, type: doc.type, tags: doc.tags, path: doc.path, source: doc.source, body: doc.body, data: doc }], 'id');
  console.log(`Ingested ${rows.length} rows into nonpayroll_expense + 1 SSOT doc into knowledge_docs.`);
})().catch((e) => { console.error('Ingest failed:', e.message); process.exit(1); });
