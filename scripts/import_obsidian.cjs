// Ingests the Obsidian vault into Supabase knowledge_docs so agents can read
// human-authored notes. Round-trips with export_obsidian.cjs: edit/add .md in
// obsidian-vault/, then run this to sync.
//
//   SUPABASE_URL=https://<proj>.supabase.co \
//   SUPABASE_SERVICE_KEY=<service or sb_secret key> \
//   node scripts/import_obsidian.cjs
//
// With no key set it does a DRY RUN (parses + prints, no writes).
const fs = require('fs'), path = require('path');
const VAULT = path.join(__dirname, '..', 'obsidian-vault');
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (e.name.endsWith('.md')) out.push(f);
  }
  return out;
}
function parse(file) {
  const rel = path.relative(VAULT, file).replace(/\.md$/, '');
  let text = fs.readFileSync(file, 'utf8');
  const fm = {};
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    m[1].split('\n').forEach((ln) => { const i = ln.indexOf(':'); if (i > 0) fm[ln.slice(0, i).trim()] = ln.slice(i + 1).trim(); });
    text = text.slice(m[0].length);
  }
  const h = text.match(/^#\s+(.+)$/m);
  const tags = (fm.tags || '').replace(/[\[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    id: rel.replace(/\s+/g, '-').toLowerCase(),
    title: (h && h[1]) || path.basename(rel),
    type: fm.type || 'note',
    tags, path: rel + '.md', source: 'vault',
    body: text.trim().slice(0, 8000),
  };
}

if (!fs.existsSync(VAULT)) { console.error('No vault. Run export_obsidian.cjs first.'); process.exit(1); }
const docs = walk(VAULT).map(parse);

if (!URL || !KEY) {
  console.log(`DRY RUN — parsed ${docs.length} docs (set SUPABASE_URL + SUPABASE_SERVICE_KEY to ingest).`);
  const byType = docs.reduce((a, d) => ((a[d.type] = (a[d.type] || 0) + 1), a), {});
  console.log('by type:', JSON.stringify(byType));
  console.log('sample:', JSON.stringify({ ...docs.find((d) => d.type === 'note') || docs[0], body: (docs[0].body || '').slice(0, 80) + '…' }, null, 1));
  process.exit(0);
}

(async () => {
  const rows = docs.map((d) => ({ id: d.id, title: d.title, type: d.type, tags: d.tags, path: d.path, source: d.source, body: d.body, data: d }));
  const r = await fetch(`${URL}/rest/v1/knowledge_docs?on_conflict=id`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (r.ok) console.log(`Ingested ${rows.length} docs into knowledge_docs.`);
  else console.error('Ingest failed', r.status, (await r.text()).slice(0, 300));
})();
