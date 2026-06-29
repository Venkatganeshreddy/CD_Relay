#!/usr/bin/env node
// CD_Relay remote MCP server (Streamable HTTP) for hosting on Render.
// Same tools as server.mjs, but over HTTP so claude.ai / Desktop can reach it.
//
// Env (set in Render dashboard):
//   SUPABASE_SERVICE_KEY  - Supabase service-role key (required)
//   CONNECTOR_TOKEN       - shared secret; callers must send Authorization: Bearer <token> (required)
//   SUPABASE_URL          - optional, defaults to the project URL
//   PORT                  - set by Render automatically
//
// ponytail: stateless transport (no sessions) — simplest thing that works on a
// single Render instance. Add session handling only if a tool needs streaming state.
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
// Trim — Render env values often pick up a trailing newline/space on paste,
// which would break an exact-match guard.
const TOKEN = (process.env.CONNECTOR_TOKEN || '').trim();
if (!KEY) { console.error('Set SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!TOKEN) { console.error('Set CONNECTOR_TOKEN (the shared secret callers must send)'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const TABLES = [
  'employees', 'departments', 'kpis', 'daily_reports', 'worklogs', 'tasks',
  'flags', 'weekly_summaries', 'moms', 'nonpayroll_expense', 'recommendations',
  'ai_runs', 'activity', 'engram_interactions',
];

// Build a fresh server per request (stateless transport wants no shared state).
function makeServer() {
  const server = new McpServer({ name: 'cd-relay', version: '0.1.0' });
  server.tool(
    'query', 'Read rows from a CD_Relay table. Returns the JSONB `data` of each row.',
    { table: z.enum(TABLES), limit: z.number().int().min(1).max(500).default(50) },
    async ({ table, limit }) => {
      const { data, error } = await sb.from(table).select('data').limit(limit);
      if (error) return { isError: true, content: [{ type: 'text', text: error.message }] };
      return { content: [{ type: 'text', text: JSON.stringify(data.map((r) => r.data), null, 2) }] };
    },
  );
  server.tool('list_tables', 'List the CD_Relay tables you can query.', {},
    async () => ({ content: [{ type: 'text', text: TABLES.join('\n') }] }));
  return server;
}

const app = express();
app.use(express.json({ limit: '4mb' }));

app.get('/', (_req, res) => res.send('cd-relay MCP server. POST /mcp'));

// Guard — accept the secret either as `Authorization: Bearer <token>` (clients
// that can set headers) OR as a `?k=<token>` query param (claude.ai custom
// connector, which can't set a custom header). Without this the service-role
// key is exposed to anyone with the URL.
// ponytail: token-in-URL is obscurity, not real auth — fine for a read-only
// internal tool; swap to OAuth if this ever holds write tools or leaves the org.
app.use('/mcp', (req, res, next) => {
  const given = (req.query.k || (req.headers.authorization || '').replace(/^Bearer /, '')).trim();
  if (given !== TOKEN) {
    // Safe diagnostic: lengths only, never the secret itself.
    return res.status(401).json({ error: 'unauthorized', expectedLen: TOKEN.length, gotLen: given.length });
  }
  next();
});

// ── Voice check-in ingestion ──────────────────────────────────────────────
// Make.com POSTs a clean JSON here after each call; we write a daily_report so
// the voice update shows up in the app (not just a Google Sheet).
// Body: { emp_id, name?, tasks_done, hours_per_task?, total_hours?, blockers?, status?, summary?, outcome?, date? }
// Auth: same ?k= token as /mcp.
app.post('/ingest', async (req, res) => {
  if ((req.query.k || '').trim() !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const b = req.body || {};
  // Resolve the employee (exact by emp_id, else first name match) to get dept/sub.
  let emp = null;
  if (b.emp_id) { const r = await sb.from('employees').select('data').eq('id', b.emp_id).maybeSingle(); emp = r.data?.data || null; }
  if (!emp && b.name) { const r = await sb.from('employees').select('data').ilike('name', b.name); emp = r.data?.[0]?.data || null; }
  if (!emp) return res.status(422).json({ error: 'employee not found', got: { emp_id: b.emp_id, name: b.name } });

  const date = (b.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const items = [];
  String(b.tasks_done || '').split(/\r?\n|;|·/).map((s) => s.trim()).filter(Boolean)
    .forEach((t) => items.push({ kind: 'done', text: t }));
  if (b.blockers && String(b.blockers).trim()) items.push({ kind: 'blocker', text: String(b.blockers).trim() });

  // Hours: keep the spoken breakdown as text; coerce total to a number (first number found).
  const hoursPerTask = String(b.hours_per_task || '').trim();
  const totalHours = b.total_hours != null && String(b.total_hours).trim()
    ? Number(String(b.total_hours).match(/[\d.]+/)?.[0] || 0) : null;

  const id = `r-voice-${emp.id}-${date}`;
  const report = {
    id, author: emp.id, date, submittedAt: 'voice call', sub: emp.sub || null, dept: emp.dept || null,
    source: 'voice-call', outcome: b.outcome || null, status: b.status || null,
    summary: b.summary || '', items, missing: items.length === 0,
    hoursPerTask: hoursPerTask || null, totalHours,
  };
  // Upsert so a re-run of the same day overwrites rather than duplicates.
  const { error } = await sb.from('daily_reports').upsert(
    { id, author_id: emp.id, dept: emp.dept || null, sub: emp.sub || null, report_date: date, data: report }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, id, author: emp.name, items: items.length, totalHours });
});

app.post('/mcp', async (req, res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.error(`cd-relay MCP (HTTP) on :${PORT}`));
