#!/usr/bin/env node
// CD_Relay TEAM MCP server (local stdio) — per-user, write-capable.
//
// Unlike server.mjs (admin, service key, read-only), this one signs in as a
// real Relay user with THEIR OWN login (same email/password as the app), so:
//   • every read/write runs under that user's JWT → Relay's RLS decides what
//     they can see and touch (a member updates only their own tasks; an L2
//     their team's — identical rules to the app),
//   • access is gated to the Fullstack pilot team (MCP_ALLOWED_SUBS),
//   • updates land in the same tables the app polls, so they show up in the
//     Relay UI within ~20 seconds with no extra plumbing.
//
// Run (each member uses their own Relay credentials):
//   RELAY_EMAIL=you@nxtwave.tech RELAY_PASSWORD=... node mcp/team-server.mjs
//
// ponytail: auth = Supabase password sign-in + auto-refreshing JWT, not a
// browser OAuth redirect — same trust rails as the app itself. Build a full
// OAuth 2.1 flow only if this becomes a hosted claude.ai connector.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
// Public anon key (the same one embedded in the app) — real authority comes
// from the user's sign-in below, never from this key.
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d2dkaXBoamVoZWNzaXp2d3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTU3MjYsImV4cCI6MjA5NTMzMTcyNn0.jqMxmf4x1sJc2j8wxfMoW_OsH4nwjtfALk0pCUhinBI';
const EMAIL = process.env.RELAY_EMAIL;
const PASSWORD = process.env.RELAY_PASSWORD;
const ALLOWED_SUBS = (process.env.MCP_ALLOWED_SUBS || 'Content — Fullstack')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Named individual grants outside the team gate (comma-separated emails).
const ALLOWED_EMAILS = (process.env.MCP_ALLOWED_EMAILS || 'yedam.reddy@nxtwave.co.in')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

if (!EMAIL || !PASSWORD) {
  console.error('Set RELAY_EMAIL and RELAY_PASSWORD (your Relay app login).');
  process.exit(1);
}

const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: true } });
const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

// Resolve the employee row (by auth link, falling back to email).
let emp = (await sb.from('employees').select('id,sub,dept,name,role_level,data')
  .eq('auth_user_id', authData.user.id).maybeSingle()).data;
if (!emp) emp = (await sb.from('employees').select('id,sub,dept,name,role_level,data').eq('email', EMAIL).maybeSingle()).data;
if (!emp) { console.error('No employee record found for this login.'); process.exit(1); }
// Gate: pilot team members, Admin accounts (Aryaa — cross-team by design,
// RLS already grants full scope), or individually named grants (Venkat).
if (!ALLOWED_SUBS.includes(emp.sub || '') && emp.role_level !== 'Admin'
    && !ALLOWED_EMAILS.includes(EMAIL.toLowerCase())) {
  console.error(`Access denied: this MCP is enabled only for ${ALLOWED_SUBS.join(', ')} (you are ${emp.sub || 'unassigned'}).`);
  process.exit(1);
}

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST
const compact = (t) => ({
  id: t.id, title: t.title, status: t.status, due: t.due || null, owner: t.owner,
  outputCategory: t.outputCategory || null, numbers: t.template || {},
  blockReason: t.blockReason || null, escalReason: t.escalReason || null,
});

const server = new McpServer({ name: 'cd-relay-team', version: '0.1.0' });

server.tool(
  'my_tasks',
  `List tasks you can see in Relay (you are ${emp.name}, ${emp.sub}). scope "mine" = your own; "team" = everyone in your sub-team that Relay's permissions let you read.`,
  {
    scope: z.enum(['mine', 'team']).default('mine'),
    status: z.enum(['ACTIVE', 'DONE', 'BLOCKED', 'ESCALATED', 'BACKLOG', 'all']).default('all'),
  },
  async ({ scope, status }) => {
    let owners = [emp.id];
    if (scope === 'team') {
      const { data } = await sb.from('employees').select('id').eq('sub', emp.sub);
      owners = (data || []).map((e) => e.id);
    }
    let q = sb.from('tasks').select('data').in('owner_id', owners).limit(200);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return { isError: true, content: [{ type: 'text', text: error.message }] };
    return { content: [{ type: 'text', text: JSON.stringify((data || []).map((r) => compact(r.data)), null, 2) }] };
  },
);

server.tool(
  'update_task',
  'Update one of your Relay tasks: status (with a note when Blocked/Backlog), due date, and/or the numbers on it (iterations, accuracy, outputs, ...). The change appears in the Relay app within ~20 seconds. Relay permissions apply — you can only update tasks you own (or your team\'s, if you are the lead).',
  {
    taskId: z.string(),
    status: z.enum(['In-progress', 'Done', 'Blocked', 'Overdue', 'Backlog']).optional(),
    note: z.string().max(500).optional().describe('Required context when Blocked/Backlog'),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    numbers: z.record(z.union([z.number(), z.string()])).optional().describe('Merged into the task\'s number fields (template)'),
  },
  async ({ taskId, status, note, due, numbers }) => {
    const { data: row, error: readErr } = await sb.from('tasks').select('data').eq('id', taskId).maybeSingle();
    if (readErr) return { isError: true, content: [{ type: 'text', text: readErr.message }] };
    if (!row) return { isError: true, content: [{ type: 'text', text: `Task ${taskId} not found (or not visible to you).` }] };
    const t = row.data;

    // Mirror the app's acknowledge semantics (supabase-client.js acknowledgeTask)
    // so dashboards, escalations and the 6 PM snapshot all stay coherent.
    const STATUS_MAP = { 'In-progress': 'ACTIVE', 'Done': 'DONE', 'Blocked': 'BLOCKED', 'Overdue': 'ACTIVE', 'Backlog': 'BACKLOG' };
    if (status) {
      const newStatus = STATUS_MAP[status] || 'ACTIVE';
      t.lastAckDate = today(); t.ackPending = false; t.lastAckStatus = status;
      if (status === 'Blocked' && t.status !== 'BLOCKED' && t.status !== 'ESCALATED') {
        t.blockedAt = new Date().toISOString(); t.escalIdx = 0;
      }
      if (note) { if (status === 'Backlog') t.backlogNote = note; else t.blockReason = note; }
      t.status = newStatus;
    }
    if (due) t.due = due;
    if (numbers && Object.keys(numbers).length) t.template = { ...(t.template || {}), ...numbers };

    const { error: writeErr } = await sb.from('tasks')
      .update({ status: t.status, data: t }).eq('id', taskId).select('id');
    if (writeErr) return { isError: true, content: [{ type: 'text', text: `Update blocked by Relay permissions: ${writeErr.message}` }] };

    if (status) {
      // Ack log row — feeds the daily-snapshot/escalation engine like the app does.
      await sb.from('task_acknowledgements').insert({
        id: 'ack-mcp-' + Date.now().toString(36), task_id: taskId, owner_id: t.owner || emp.id,
        ack_date: today(), status, note: note || null,
      });
    }
    if (numbers && Object.keys(numbers).length) {
      // Keep the mirrored worklog's numbers in sync so rollups match the edit.
      const { data: wl } = await sb.from('worklogs').select('id,data').eq('data->>taskId', taskId).maybeSingle();
      if (wl) await sb.from('worklogs').update({ data: { ...wl.data, template: { ...(wl.data.template || {}), ...numbers } } }).eq('id', wl.id);
    }
    return { content: [{ type: 'text', text: `Updated. Now: ${JSON.stringify(compact(t))}\n(Visible in the Relay app within ~20s.)` }] };
  },
);

server.tool(
  'add_task',
  'Create a new Relay task. Defaults to you as owner; leads/admins can set another owner by employee id (Relay permissions decide). Shows in the app within ~20 seconds.',
  {
    title: z.string().min(3),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    owner: z.string().optional().describe('Employee id (e.g. NW0001771); defaults to yourself'),
    outputCategory: z.string().optional(),
    details: z.string().max(1000).optional(),
  },
  async ({ title, due, owner, outputCategory, details }) => {
    const ownerId = owner || emp.id;
    let od = emp;
    if (ownerId !== emp.id) {
      od = (await sb.from('employees').select('id,dept,name').eq('id', ownerId).maybeSingle()).data;
      if (!od) return { isError: true, content: [{ type: 'text', text: `Owner ${ownerId} not found.` }] };
    }
    // Same shape Concierge's create_task writes (views-copilot.jsx executeAction).
    const id = `task-${Date.now()}`;
    const task = {
      id, title, status: 'ACTIVE', reason: 'Manual (MCP)', sourceReports: [],
      owner: ownerId, dept: od.dept || emp.dept, created: today(), due: due || null,
      source: 'manual', createdBy: emp.id, products: [], stacks: [],
      outputCategory: outputCategory || null, taskCategory: '', activityCategory: '',
      metricCategory: '', outputCount: null, template: {}, desc: details || '', estHours: null,
    };
    const { error } = await sb.from('tasks')
      .insert({ id, owner_id: ownerId, dept: task.dept, status: 'ACTIVE', data: task });
    if (error) return { isError: true, content: [{ type: 'text', text: `Create blocked by Relay permissions: ${error.message}` }] };
    return { content: [{ type: 'text', text: `Created ${id} for ${od.name || ownerId}. ${JSON.stringify(compact(task))}\n(Visible in the Relay app within ~20s.)` }] };
  },
);

server.tool('whoami', 'Show who this MCP session is signed in as and what it may touch.', {},
  async () => ({ content: [{ type: 'text', text: `${emp.name} (${emp.id}) · ${emp.sub} · ${emp.role_level} — updates allowed on tasks Relay lets this account write (RLS).` }] }));

await server.connect(new StdioServerTransport());
console.error(`cd-relay TEAM MCP up (stdio) — ${emp.name} · ${emp.sub}`);
