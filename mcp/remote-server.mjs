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
const TOKEN = process.env.CONNECTOR_TOKEN;
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

// Bearer guard — without this the service-role key is exposed to anyone with the URL.
app.use('/mcp', (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  next();
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
