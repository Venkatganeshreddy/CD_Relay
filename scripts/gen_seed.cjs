// Generates supabase/03_seed.sql from data.js by loading it in a window shim
// and walking window.CDC. Promoted columns mirror 01_schema.sql; the full
// record is also stored in `data` jsonb so the client returns today's shape.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'data.js'), 'utf8');
const sandbox = { window: {}, console }; vm.createContext(sandbox); vm.runInContext(code, sandbox);
const C = sandbox.window.CDC;

const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const j = (o) => `$relay$${JSON.stringify(o)}$relay$::jsonb`;
// Real login emails (provided by org). Domain @nxtwave.co.in. Convention varies
// per person, so they're an explicit map; everyone else gets a .co.in placeholder.
const EMAILS = {
  'NW0005116': 'aryaa.sharma@nxtwave.co.in',
  'NW0002526': 'pavangangireddy@nxtwave.co.in',
  'NW0001771': 'meesala.chanakya@nxtwave.co.in',
  'NW0001778': 'pushpa.chenna@nxtwave.co.in',
  'NW0002849': 'poojitha.pachava@nxtwave.co.in',
  'NW0005433': 'rushikesh.konapure@nxtwave.co.in',
  'NW0002023': 'kakarla.pavanteja@nxtwave.co.in',
  'NW0001240': 'tejaswini.venkata@nxtwave.co.in',
  'NW-VIJAY-CO': 'vijay.centralops@nxtwave.co.in',
};
const slug = (name) => {
  const t = String(name).toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/);
  const a = t[0] || 'user', b = t.length > 1 ? t[t.length - 1] : '';
  return b ? `${a}.${b}` : a;
};
const email = (u) => EMAILS[u.id] || `${slug(u.name)}@nxtwave.co.in`;

function insertRows(table, cols, rows, toVals) {
  if (!rows || !rows.length) return `-- ${table}: no rows\n`;
  const lines = rows.map((r) => `  (${toVals(r).join(', ')})`);
  return `insert into ${table} (${cols.join(', ')}) values\n${lines.join(',\n')}\non conflict (${cols[0]}) do update set ${cols.slice(1).map(c => `${c} = excluded.${c}`).join(', ')};\n`;
}

const out = [];
out.push('-- Relay seed — generated from data.js. Run after 01_schema.sql + 02_rls.sql.');
out.push('-- Order respects FKs (employees + weekly_summaries first).');
out.push('set session_replication_role = replica; -- defer FK checks during load');
out.push('');

// employees (ALL users; RBAC/login is managers-only but everyone is a data subject)
out.push(insertRows('employees',
  ['id','email','name','initials','manager_id','dept','sub','role_level','title','is_cross_dept','data'],
  C.USERS,
  (u) => [q(u.id), q(email(u)), q(u.name), q(u.initials), q(u.managerId), q(u.dept), q(u.sub),
          q(u.level), q(u.title), u.crossDept ? 'true' : 'false', j(u)]));

out.push(insertRows('business_directions', ['id','data'], C.BUSINESS_DIRECTIONS, (b) => [q(b.id), j(b)]));
out.push(insertRows('departments', ['id','bd_id','product_id','data'], C.DEPARTMENTS,
  (d) => [q(d.id), q(d.bdId), q(d.productId), j(d)]));
out.push(insertRows('dept_health', ['id','data'],
  Object.entries(C.DEPT_HEALTH).map(([id, v]) => ({ id, v })), (r) => [q(r.id), j(r.v)]));
out.push(insertRows('kpis', ['id','dept','owner_id','data'], C.KPIS,
  (k) => [q(k.id), q(k.dept), q(k.owner), j(k)]));

out.push(insertRows('weekly_summaries', ['id','dept','status','data'], C.WEEKLY,
  (w) => [q(w.id), q(w.dept), q(w.status), j(w)]));
out.push(insertRows('daily_reports', ['id','author_id','dept','sub','report_date','data'], C.REPORTS,
  (r) => [q(r.id), q(r.author), q(r.dept), q(r.sub), q(r.date), j(r)]));
out.push(insertRows('worklogs', ['id','owner_id','dept','work_date','data'], C.WORKLOGS,
  (w) => [q(w.id), q(w.userId), q(w.dept), q(w.date), j(w)]));
out.push(insertRows('tasks', ['id','owner_id','dept','status','data'], C.TASKS,
  (t) => [q(t.id), q(t.owner), q(t.dept), q(t.status), j(t)]));
out.push(insertRows('flags', ['id','dept','state','data'], C.FLAGS,
  (f) => [q(f.id), q(f.target && f.target.dept), q(f.state), j(f)]));
out.push(insertRows('weekly_comments', ['id','weekly_id','author_id','data'], C.WEEKLY_COMMENTS,
  (c) => [q(c.id), q(c.weeklyId), q(c.author), j(c)]));
out.push(insertRows('moms', ['id','dept','data'], C.MOMS, (m) => [q(m.id), 'NULL', j(m)]));

out.push(insertRows('engram_interactions', ['id','agent','user_id','human_action','data'], C.ENGRAM,
  (e) => [q(e.id), q(e.agent), q(e.userId), q(e.action), j(e)]));
out.push(insertRows('eval_sets', ['id','agent','data'], C.EVAL_SETS, (e) => [q(e.id), q(e.agent), j(e)]));
out.push(insertRows('guideline_proposals', ['id','agent','data'], C.PROPOSALS, (p) => [q(p.id), q(p.agent), j(p)]));
out.push(insertRows('farm_agents', ['id','owner_id','data'], C.FARM_AGENTS, (a) => [q(a.id), q(a.owner), j(a)]));
out.push(insertRows('relay_agents', ['id','data'], C.RELAY_AGENTS, (a) => [q(a.id), j(a)]));
out.push(insertRows('codex_workflows', ['id','data'], C.CODEX_WORKFLOWS, (w) => [q(w.id), j(w)]));
out.push(insertRows('codex_guidelines', ['id','data'], C.CODEX_GUIDELINES, (g) => [q(g.id), j(g)]));
out.push(insertRows('ai_runs', ['id','agent','data'], C.AI_RUNS, (r) => [q(r.id), q(r.agent), j(r)]));
out.push(insertRows('activity', ['id','data'], C.ACTIVITY, (a) => [q(a.id), j(a)]));

out.push(`insert into expense_doc (id, data) values ('current', ${j(C.EXPENSE)}) on conflict (id) do update set data = excluded.data;`);
out.push(`insert into app_docs (key, data) values ('report_authors', ${j(C.REPORT_AUTHORS)}), ('roles', ${j(C.ROLES)}) on conflict (key) do update set data = excluded.data;`);

out.push('');
out.push('set session_replication_role = origin;');

fs.writeFileSync(path.join(root, 'supabase', '03_seed.sql'), out.join('\n') + '\n');
console.log('wrote supabase/03_seed.sql');
