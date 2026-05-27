#!/usr/bin/env node
// Push the updated MOM workflow (steps + version) to live Supabase.
// Run: SUPABASE_SERVICE_KEY=<service_role_key> node scripts/push_wf_mom.cjs
const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Set SUPABASE_SERVICE_KEY (service_role) in env.'); process.exit(1); }

const steps = [
  { n: 1, title: 'Upload meeting transcript',    detail: 'Paste, or upload a .vtt / .txt file. Scribe extracts action items with task description, owner, and due date.', done: true },
  { n: 2, title: 'Review generated action items', detail: 'Each item shows three options: Approve / Reject / Edit.', done: true },
  { n: 3, title: 'Approve',                       detail: "Creates a task and adds it to the owner's task dashboard with status Backlog.", done: true },
  { n: 4, title: 'Reject',                        detail: 'Removes the item from the final task list and stores a rejection note.', done: true },
  { n: 5, title: 'Edit',                          detail: 'Edit task description, owner (L3 / Admin), and due date.', done: true },
  { n: 6, title: 'Save edited action item',       detail: 'Stores the final version plus what changed (owner / text / due) and by whom, as an Engram interaction.', done: true },
  { n: 7, title: 'Mark task as Blocked',          detail: 'Sends a notification to the uploader and the owner’s reporting hierarchy.', done: true },
  { n: 8, title: 'Cartographer — link to graph', detail: 'Link committed items to knowledge-graph nodes.', done: false },
];

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

(async () => {
  // 1. Read current row, preserve other fields in data.
  const getRes = await fetch(`${URL}/rest/v1/codex_workflows?id=eq.wf-mom&select=data`, { headers: H });
  const rows = await getRes.json();
  if (!getRes.ok) { console.error('GET failed', getRes.status, rows); process.exit(1); }
  if (!rows.length) { console.error('No wf-mom row found.'); process.exit(1); }
  const data = { ...rows[0].data, version: 'v4', steps };

  // 2. Patch it back.
  const patchRes = await fetch(`${URL}/rest/v1/codex_workflows?id=eq.wf-mom`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ data }),
  });
  const out = await patchRes.json();
  if (!patchRes.ok) { console.error('PATCH failed', patchRes.status, out); process.exit(1); }
  console.log('Updated wf-mom →', JSON.stringify(out[0].data, null, 2));
})();
