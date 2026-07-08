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
import { registerReadTools } from './tools.mjs';

const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Set SUPABASE_SERVICE_KEY (service-role key) in the env.'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const server = new McpServer({ name: 'cd-relay', version: '0.1.0' });
registerReadTools(server, sb);

await server.connect(new StdioServerTransport());
console.error('cd-relay MCP server up (stdio).');
