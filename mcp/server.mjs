#!/usr/bin/env node
// CD_Relay MCP server (local stdio). Wraps the Supabase tables as read tools so
// Claude Desktop/Code can query the app's data. No URL, no hosting, admin scope.
//
// Run:   SUPABASE_SERVICE_KEY=<service-role-key> node mcp/server.mjs
// Deps:  npm i @modelcontextprotocol/sdk @supabase/supabase-js
//
// ponytail: every table is a JSONB `data` column, so ONE generic query tool
// covers them all. Add a bespoke tool only when a raw select stops being enough.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Set SUPABASE_SERVICE_KEY (service-role key) in the env.'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// The collections the app exposes (mirror of ARRAY_MAP in supabase-client.js).
const TABLES = [
  'employees', 'departments', 'kpis', 'daily_reports', 'worklogs', 'tasks',
  'flags', 'weekly_summaries', 'moms', 'nonpayroll_expense', 'recommendations',
  'ai_runs', 'activity', 'engram_interactions',
];

const server = new McpServer({ name: 'cd-relay', version: '0.1.0' });

server.tool(
  'query',
  'Read rows from a CD_Relay table. Returns the JSONB `data` of each row.',
  {
    table: z.enum(TABLES),
    limit: z.number().int().min(1).max(500).default(50),
  },
  async ({ table, limit }) => {
    const { data, error } = await sb.from(table).select('data').limit(limit);
    if (error) return { isError: true, content: [{ type: 'text', text: error.message }] };
    return { content: [{ type: 'text', text: JSON.stringify(data.map((r) => r.data), null, 2) }] };
  },
);

server.tool(
  'list_tables',
  'List the CD_Relay tables you can query.',
  {},
  async () => ({ content: [{ type: 'text', text: TABLES.join('\n') }] }),
);

await server.connect(new StdioServerTransport());
console.error('cd-relay MCP server up (stdio).');
