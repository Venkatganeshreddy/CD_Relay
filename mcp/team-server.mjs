#!/usr/bin/env node
// CD_Relay TEAM MCP server (local stdio) — per-user, write-capable.
//
// Unlike server.mjs (admin, service key, read-only), this one signs in as a
// real Relay user with THEIR OWN login (same email/password as the app), so:
//   • every read/write runs under that user's JWT → Relay's RLS decides what
//     they can see and touch (a member updates only their own tasks; an L2
//     their team's — identical rules to the app),
//   • access is gated to the Fullstack pilot team + named grants (tools.mjs),
//   • updates land in the same tables the app polls, so they show up in the
//     Relay UI within ~20 seconds with no extra plumbing.
//
// Run (each member uses their own Relay credentials):
//   RELAY_EMAIL=you@nxtwave.tech RELAY_PASSWORD=... node mcp/team-server.mjs
//
// Hosted / claude.ai variant with real OAuth: oauth-server.mjs (same tools).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { resolveEmployee, gateOk, registerTeamTools, ALLOWED_SUBS } from './tools.mjs';

const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
// Public anon key (the same one embedded in the app) — real authority comes
// from the user's sign-in below, never from this key.
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d2dkaXBoamVoZWNzaXp2d3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTU3MjYsImV4cCI6MjA5NTMzMTcyNn0.jqMxmf4x1sJc2j8wxfMoW_OsH4nwjtfALk0pCUhinBI';
const EMAIL = process.env.RELAY_EMAIL;
const PASSWORD = process.env.RELAY_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Set RELAY_EMAIL and RELAY_PASSWORD (your Relay app login).');
  process.exit(1);
}

const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: true } });
const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

const emp = await resolveEmployee(sb, authData.user.id, EMAIL);
if (!emp) { console.error('No employee record found for this login.'); process.exit(1); }
if (!gateOk(emp, EMAIL)) {
  console.error(`Access denied: this MCP is enabled only for ${ALLOWED_SUBS.join(', ')} (you are ${emp.sub || 'unassigned'}).`);
  process.exit(1);
}

const server = new McpServer({ name: 'cd-relay-team', version: '0.2.0' });
registerTeamTools(server, sb, emp);
await server.connect(new StdioServerTransport());
console.error(`cd-relay TEAM MCP up (stdio) — ${emp.name} · ${emp.sub}`);
