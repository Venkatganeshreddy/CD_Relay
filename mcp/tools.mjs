// Shared core for the per-user Relay task servers:
//   team-server.mjs  — local stdio (Claude Code / Desktop)
//   oauth-server.mjs — hosted Streamable HTTP with OAuth (claude.ai connectors)
// One definition of the gate + the tools, so the two can't drift.
import { z } from 'zod';

export const ALLOWED_SUBS = (process.env.MCP_ALLOWED_SUBS || 'Content — Fullstack')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Named individual grants outside the team gate (comma-separated emails).
export const ALLOWED_EMAILS = (process.env.MCP_ALLOWED_EMAILS || 'yedam.venkatganesh@nxtwave.co.in')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Gate: pilot team members, Admin accounts (cross-team by design, RLS already
// grants full scope), or individually named grants.
export function gateOk(emp, email) {
  return ALLOWED_SUBS.includes(emp.sub || '') || emp.role_level === 'Admin'
    || ALLOWED_EMAILS.includes(String(email || '').toLowerCase());
}

// Resolve the employee row for a signed-in user (by auth link, then email).
// `sb` must be a USER-scoped client so RLS applies.
export async function resolveEmployee(sb, authUserId, email) {
  let emp = (await sb.from('employees').select('id,sub,dept,name,role_level,email')
    .eq('auth_user_id', authUserId).maybeSingle()).data;
  if (!emp && email) emp = (await sb.from('employees')
    .select('id,sub,dept,name,role_level,email').eq('email', email).maybeSingle()).data;
  return emp || null;
}

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD IST

const compact = (t) => ({
  id: t.id, title: t.title, status: t.status, due: t.due || null, owner: t.owner,
  outputCategory: t.outputCategory || null, numbers: t.template || {},
  blockReason: t.blockReason || null, escalReason: t.escalReason || null,
});

// Read-only table tools shared by server.mjs (stdio admin) and
// remote-server.mjs (hosted) — the collections the app exposes (ARRAY_MAP).
const TABLES = [
  'employees', 'departments', 'kpis', 'daily_reports', 'worklogs', 'tasks',
  'flags', 'weekly_summaries', 'moms', 'nonpayroll_expense', 'recommendations',
  'ai_runs', 'activity', 'engram_interactions',
];

export function registerReadTools(server, sb) {
  server.tool(
    'query',
    'Read rows from a CD_Relay table. Returns the JSONB `data` of each row.',
    { table: z.enum(TABLES), limit: z.number().int().min(1).max(500).default(50) },
    async ({ table, limit }) => {
      const { data, error } = await sb.from(table).select('data').limit(limit);
      if (error) return { isError: true, content: [{ type: 'text', text: error.message }] };
      return { content: [{ type: 'text', text: JSON.stringify(data.map((r) => r.data), null, 2) }] };
    },
  );
  server.tool('list_tables', 'List the CD_Relay tables you can query.', {},
    async () => ({ content: [{ type: 'text', text: TABLES.join('\n') }] }));
}

// Register the task tools on an McpServer, bound to one signed-in user.
export function registerTeamTools(server, sb, emp) {
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
}
