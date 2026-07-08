// Relay — Codex / System architecture map.
// One end-to-end diagram of the whole application: people → SPA → agents →
// models → data → surfaces, plus the Engram learning loop, the knowledge
// round-trip, MCP servers and the adjacent voice flow. Hover any node for
// what/tech/flows; click an agent node for live stats from window.CDC.AI_RUNS.

const { useState: useStA, useMemo: useMA, useEffect: useEA, useRef: useRA } = React;

// ── Diagram spec ────────────────────────────────────────────────────────
// Absolute px coords on a 1080×1600 stage. Nodes default to 200×76.
// Groups are dashed containers and are also valid edge endpoints.
const ARCH_GROUPS = [
  { id: 'g-voice',     label: 'Voice check-ins',           x: 8,   y: 4,    w: 224, h: 232, tone: '--green-soft' },
  { id: 'g-ui',        label: 'Relay SPA',                 x: 396, y: 180,  w: 248, h: 242 },
  { id: 'g-client',    label: 'In-browser agents',         x: 284, y: 470,  w: 472, h: 132 },
  { id: 'g-knowledge', label: 'Knowledge',                 x: 838, y: 430,  w: 224, h: 232, tone: '--blue-soft' },
  { id: 'g-edge',      label: 'Edge Functions',            x: 284, y: 640,  w: 472, h: 132 },
  { id: 'g-engram',    label: 'Engram — learning loop',    x: 8,   y: 740,  w: 224, h: 232, tone: '--accent-soft' },
  { id: 'g-modal',     label: 'Modal — LangGraph agents',  x: 284, y: 810,  w: 472, h: 332 },
  { id: 'g-data',      label: 'Supabase — Postgres · RLS', x: 284, y: 1200, w: 472, h: 132 },
  { id: 'g-mcp',       label: 'MCP — read-only',           x: 838, y: 1090, w: 224, h: 332, tone: '--blue-soft' },
  { id: 'g-surfaces',  label: 'Surfaces',                  x: 156, y: 1440, w: 728, h: 132 },
];

const ARCH_NODES = [
  { id: 'users',        kind: 'source',   x: 420, y: 44,   title: 'L1 · L2 · L3 · Admin',    sub: 'Browser sign-in — RBAC-scoped everything', ico: '👥' },
  { id: 'voice',        kind: 'external', x: 20,  y: 44,   title: 'Hooman Labs + Make.com',  sub: 'Daily check-in calls to the team', ico: '📞' },
  { id: 'gsheet',       kind: 'external', x: 20,  y: 144,  title: 'Google Sheet',            sub: 'Call responses land here (not Supabase)', ico: '📄' },
  { id: 'spa',          kind: 'ui',       x: 420, y: 220,  title: 'Relay UI — React + Babel', sub: 'CD-Copilot.html · views-*.jsx · no build step', ico: '🖥️' },
  { id: 'sbclient',     kind: 'service',  x: 420, y: 330,  title: 'supabase-client.js',      sub: 'Paged RLS reads · auth · optimistic writes · agent funnel', ico: '🔌' },
  { id: 'dispatcher',   kind: 'agent',    x: 300, y: 510,  title: 'Dispatcher',              sub: 'Deterministic routing of MoM action items — no LLM', ico: '🧭' },
  { id: 'concierge',    kind: 'agent',    x: 540, y: 510,  title: 'Concierge',               sub: 'Grounded RBAC chat · citation chips · logs runs', ico: '💬' },
  { id: 'obsidian',     kind: 'source',   x: 850, y: 470,  title: 'Obsidian vault',          sub: 'agents · guidelines · people · org docs', ico: '📚' },
  { id: 'kdocs',        kind: 'storage',  x: 850, y: 570,  title: 'knowledge_docs',          sub: 'Supabase table — grounds Concierge', ico: '📖' },
  { id: 'advisor-cron', kind: 'service',  x: 300, y: 680,  title: 'advisor-cron',            sub: 'Weekly digest — Modal-first, inline fallback · logs ai_runs', ico: '⏰' },
  { id: 'relay',        kind: 'service',  x: 540, y: 680,  title: 'relay-agent',             sub: 'JWT-verified OpenRouter proxy · Modal forwarder · exact spend', ico: '⚡' },
  { id: 'openrouter',   kind: 'external', x: 850, y: 730,  title: 'OpenRouter',              sub: 'Sonnet 4.6 smart · Haiku 4.5 fast · usage + spend API', ico: '🧠' },
  { id: 'engram-store', kind: 'storage',  x: 20,  y: 780,  title: 'engram_interactions',     sub: 'Human corrections + eval sets — edits/rejects teach', ico: '🧬' },
  { id: 'agent-memory', kind: 'storage',  x: 20,  y: 880,  title: 'relay_agents.memory',     sub: 'Curator-distilled rules per agent', ico: '💾' },
  { id: 'scribe',       kind: 'agent',    x: 300, y: 850,  title: 'Scribe',                  sub: 'MoM transcript → structured action items', ico: '✍️' },
  { id: 'rollup',       kind: 'agent',    x: 540, y: 850,  title: 'Rollup',                  sub: 'Week of reports → cited weekly digest', ico: '📋' },
  { id: 'curator',      kind: 'agent',    x: 300, y: 950,  title: 'Curator',                 sub: 'Distills corrections into 3–7 rules', ico: '🎓' },
  { id: 'sentry',       kind: 'agent',    x: 540, y: 950,  title: 'Sentry',                  sub: 'Blocked/overdue task → escalation line', ico: '🚨' },
  { id: 'advisor',      kind: 'agent',    x: 420, y: 1050, title: 'Advisor',                 sub: 'Knowledge + captures → recommendation cards', ico: '💡' },
  { id: 'postgres',     kind: 'storage',  x: 300, y: 1240, title: 'Postgres + RLS + Auth',   sub: 'worklogs · reports · digests · tasks · flags · kpis · moms …', ico: '🗄️' },
  { id: 'telemetry',    kind: 'storage',  x: 540, y: 1240, title: 'Run telemetry',           sub: 'ai_runs · activity — model · tokens · cost per call', ico: '📈' },
  { id: 'claude-mcp',   kind: 'external', x: 850, y: 1130, title: 'Claude Desktop / Code',   sub: 'MCP clients', ico: '🤖' },
  { id: 'mcp-local',    kind: 'service',  x: 850, y: 1230, title: 'server.mjs',              sub: 'Local stdio transport', ico: '🔗' },
  { id: 'mcp-remote',   kind: 'service',  x: 850, y: 1330, title: 'remote-server.mjs',       sub: 'Render HTTP · bearer CONNECTOR_TOKEN', ico: '🌐' },
  { id: 's-ops',        kind: 'ui',       x: 180, y: 1480, title: 'Team surfaces',           sub: 'Dashboard · Worklogs · Weekly · Goals → Deliverables', ico: '📊' },
  { id: 's-review',     kind: 'output',   x: 420, y: 1480, title: 'Review queues',           sub: 'Digest approvals · MoM tasks · recs → owning L2 · escalations', ico: '✅' },
  { id: 's-observ',     kind: 'ui',       x: 660, y: 1480, title: 'AI observability',        sub: 'AI runs + exact spend · Engram · Agent Farm · Feedback', ico: '👁️' },
];

// kind: data (solid) · memory (blue dashed) · loop (accent dashed) · approval (amber).
// viaX routes an orthogonal elbow through a reserved vertical corridor;
// labelAt places an elbow's label on its 'start' or 'end' stub instead of mid-corridor.
const ARCH_EDGES = [
  // Spine
  { from: 'users',        to: 'spa',          label: 'sign in · submit · review' },
  { from: 'spa',          to: 'sbclient',     label: 'reads · writes · agent calls' },
  { from: 'sbclient',     to: 'dispatcher',   label: 'MoM action items' },
  { from: 'sbclient',     to: 'concierge',    label: 'chat turns' },
  { from: 'concierge',    to: 'relay',        label: 'claude.complete' },
  { from: 'sbclient',     to: 'relay',        label: 'agents.run() · JWT', viaX: 800, toDy: -14, labelAt: 'start' },
  { from: 'relay',        to: 'openrouter',   label: 'chat + spend API' },
  { from: 'relay',        to: 'g-modal',      label: 'forward → Modal' },
  { from: 'advisor-cron', to: 'g-modal',      label: 'Modal-first' },
  { from: 'g-modal',      to: 'openrouter',   label: 'retry · tier fallback' },
  { from: 'g-modal',      to: 'postgres',     label: 'structured writes' },
  { from: 'g-modal',      to: 'telemetry',    label: 'logs every run' },
  { from: 'sbclient',     to: 'postgres',     label: 'CRUD', viaX: 240, toDy: -18, labelAt: 'end' },
  { from: 'postgres',     to: 's-ops',        label: 'RLS-scoped rows' },
  { from: 'postgres',     to: 's-review',     label: 'drafts · suggestions' },
  { from: 'telemetry',    to: 's-observ',     label: 'runs · exact cost' },
  // Side flows
  { from: 'voice',        to: 'users',        label: 'daily call' },
  { from: 'voice',        to: 'gsheet',       label: 'responses' },
  { from: 'obsidian',     to: 'kdocs',        label: 'import · export', kind: 'memory' },
  { from: 'kdocs',        to: 'concierge',    label: 'grounds · cites', kind: 'memory' },
  { from: 'claude-mcp',   to: 'mcp-local',    label: 'stdio', kind: 'memory' },
  { from: 'claude-mcp',   to: 'mcp-remote',   kind: 'memory', viaX: 1066 },
  { from: 'mcp-local',    to: 'g-data',       label: 'read-only tools', kind: 'memory' },
  { from: 'mcp-remote',   to: 'g-data',       kind: 'memory' },
  // Loops
  { from: 'g-surfaces',   to: 'g-engram',     label: 'approve · edit · reject', kind: 'approval' },
  { from: 'engram-store', to: 'curator',      kind: 'loop' },
  { from: 'curator',      to: 'agent-memory', kind: 'loop', viaX: 264 },
  { from: 'agent-memory', to: 'g-modal',      label: 'memoryFor()', kind: 'loop' },
  { from: 'postgres',     to: 'advisor-cron', label: 'pg_cron', kind: 'loop', viaX: 276 },
];

// Hover popover content. In/out flows are derived from ARCH_EDGES, not authored.
const ARCH_DETAILS = {
  users:          { what: 'Everyone in CD signs into the same SPA; roles (L1/L2/L3/Admin) scope every read and write through Supabase RLS — the same query returns different rows per person.', tech: ['views-auth.jsx', 'Supabase Auth', 'RLS policies'] },
  voice:          { what: 'Semi-detached daily check-in voice agent: Hooman Labs places the calls, a Make.com scenario orchestrates; results do not enter Supabase.', tech: ['voice-agent/hooman-config.md'] },
  gsheet:         { what: 'Ledger for voice call outcomes — timestamp, tasks done, blockers, status, summary.', tech: ['Google Sheets via Make.com'] },
  spa:            { what: 'Static single-page app — React 18 + in-browser Babel, no build step. Deployed from main to GitHub Pages, mirrored on Vercel. One view module per screen.', tech: ['CD-Copilot.html', 'app.jsx · views-*.jsx', 'vercel.json'] },
  sbclient:       { what: 'The data spine: paged RLS-scoped loads into window.CDC, auth session, optimistic local+remote writes, the agents funnel (run → logRun), and the claude.complete 3-tier chain (Edge Function → direct OpenRouter → offline shim).', tech: ['supabase-client.js', 'window.CDC.db · CDC.agents', 'computeCost · fetchOpenRouterSpend'] },
  dispatcher:     { what: 'Deterministic JS — routes each Scribe action item to an owner via tiered name matching and drafts tasks. Code, not an LLM; that is why it has no run cost.', tech: ['views-relay.jsx (MoM loader)', 'CDC.db.addTask'] },
  concierge:      { what: 'Permission-scoped grounded chat over reports, KPIs, tasks and knowledge docs; answers carry citation chips; every real model turn is logged to ai_runs.', tech: ['views-copilot.jsx', 'claude.complete tier chain', 'agents.logRun'] },
  obsidian:       { what: 'Knowledge source of truth, edited in Obsidian; round-trips to the knowledge_docs table via import/export scripts.', tech: ['obsidian-vault/', 'scripts/import · export_obsidian.cjs'] },
  kdocs:          { what: 'Imported knowledge layer that grounds Concierge answers — how-tos, SOPs, agent docs, people and org pages, all citable.', tech: ['knowledge_docs table'] },
  'advisor-cron': { what: 'Weekly recommendations job — pg_cron fires it Mon 06:30 IST with x-cron-secret; tries the Modal Advisor first, falls back to an inline prompt; logs its run to ai_runs either way.', tech: ['supabase/functions/advisor-cron', 'scripts/setup_advisor_cron.cjs'] },
  relay:          { what: 'JWT-verified Edge Function: OpenRouter chat proxy (the key never reaches the browser), forwarder to Modal agents, and action:"spend" returning the exact OpenRouter cost. Optional Helicone tracing.', tech: ['supabase/functions/relay-agent/index.ts', 'OPENROUTER_API_KEY · MODAL_<AGENT>_URL secrets'] },
  openrouter:     { what: 'Model gateway: Claude Sonnet 4.6 (smart) and Haiku 4.5 (fast). The served model id and token usage flow back into every logged run; usage buckets power the exact-cost tile on AI runs.', tech: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5', 'auth/key spend API'] },
  'engram-store': { what: 'The correction signal: AI draft vs what the human kept, plus the reason. Only edits and rejects teach — accepts are ignored. Corrections also become eval sets.', tech: ['engram interactions · eval sets', 'views-engram.jsx'] },
  'agent-memory': { what: 'Where Curator writes its distilled rules; memoryFor() injects them into each agent’s next system prompt — the step that closes the learning loop.', tech: ['relay_agents.data.memory', 'CDC.agents.memoryFor'] },
  scribe:         { what: 'Extracts agenda, attendees, summary and action items from committed MoM transcripts. Pydantic-structured output, prompt-injection fencing, retry with model-tier fallback.', tech: ['agents/graphs/scribe.py', 'Modal · LangGraph'] },
  rollup:         { what: 'Consolidates a week of daily reports into a manager-ready digest with citations, ground-checked and retried if weak. Also writes per-sub weekly digest lines.', tech: ['agents/graphs/rollup.py', 'Modal · LangGraph'] },
  curator:        { what: 'Reads accumulated human corrections, groups them per agent, distills 3–7 standing rules and persists them to relay_agents.memory.', tech: ['agents/graphs/curator.py', 'Modal · LangGraph'] },
  sentry:         { what: 'Turns a blocked or overdue task event into a crisp one-line escalation brief for the right level, with length enforcement.', tech: ['agents/graphs/sentry.py', 'Modal · LangGraph'] },
  advisor:        { what: 'Reads the org brief (roster, load, flags, KPIs, digest, MoMs) and proposes grounded recommendation cards by kind: operational, process, priorities, people.', tech: ['agents/graphs/advisor.py', 'Modal · LangGraph'] },
  postgres:       { what: 'System of record behind RLS: worklogs, reports, weekly digests, tasks, flags, KPIs, MoMs, recommendations, knowledge docs, agent memory, catalog, feedback.', tech: ['supabase/ schema + policies'] },
  telemetry:      { what: 'Every model call logged: agent, served model, tokens in/out, cost, latency, outcome, scope. Written by the client funnel, the Modal agents and advisor-cron alike.', tech: ['ai_runs · activity tables', 'agents.logRun'] },
  'claude-mcp':   { what: 'Claude Desktop and Claude Code connect as MCP clients to browse Relay data read-only — ask questions about worklogs, runs or tasks from outside the app.', tech: ['Model Context Protocol'] },
  'mcp-local':    { what: 'Local stdio MCP server wrapping the Supabase tables as read tools. One generic query tool covers every JSONB table.', tech: ['mcp/server.mjs'] },
  'mcp-remote':   { what: 'Same tools over Streamable HTTP hosted on Render, gated by a bearer CONNECTOR_TOKEN — reachable from claude.ai.', tech: ['mcp/remote-server.mjs', 'render.yaml → cd-relay-mcp'] },
  's-ops':        { what: 'Day-to-day team surfaces rendered from RLS-scoped rows: dashboard health, department worklogs with cascading filters, weekly summaries, goals → deliverables.', tech: ['views-dashboard · worklogs · relay · goals'] },
  's-review':     { what: 'Human-in-the-loop queues: approve/edit/publish weekly digests, triage MoM-suggested tasks, Second-Brain recommendations routed to the owning L2, tiered escalations.', tech: ['views-ops.jsx · views-relay.jsx'] },
  's-observ':     { what: 'Cost and quality observability: AI runs with exact OpenRouter spend and range filters, Engram corrections, the Agent Farm leaderboard, app feedback.', tech: ['RunsView · views-engram · views-farm'] },
};

// Clickable agent nodes → live-stats modal. `agent` matches ai_runs rows.
const AGENT_META = {
  scribe:     { agent: 'Scribe',     runtime: 'Modal · LangGraph',       trigger: 'MoM transcript committed',        source: 'agents/graphs/scribe.py' },
  rollup:     { agent: 'Rollup',     runtime: 'Modal · LangGraph',       trigger: 'Weekly view · generate draft',    source: 'agents/graphs/rollup.py' },
  sentry:     { agent: 'Sentry',     runtime: 'Modal · LangGraph',       trigger: 'task blocked / escalated',        source: 'agents/graphs/sentry.py' },
  curator:    { agent: 'Curator',    runtime: 'Modal · LangGraph',       trigger: '5+ corrections · manual pass',    source: 'agents/graphs/curator.py' },
  advisor:    { agent: 'Advisor',    runtime: 'Modal · LangGraph',       trigger: 'Run now (L2+) · weekly cron',     source: 'agents/graphs/advisor.py' },
  concierge:  { agent: 'Concierge',  runtime: 'Client JS · tier chain',  trigger: 'user opens chat',                 source: 'views-copilot.jsx' },
  dispatcher: { agent: 'Dispatcher', runtime: 'Deterministic client JS — no LLM runs', trigger: 'after Scribe extract', source: 'views-relay.jsx' },
};

const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
// Live stats from the runs log; ts is 'YYYY-MM-DD HH:MM IST' so it sorts lexicographically.
function agentLive(name) {
  const runs = ((window.CDC && window.CDC.AI_RUNS) || []).filter((r) => r.agent === name)
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  const today = runs.filter((r) => String(r.ts || '').startsWith(istToday()));
  return {
    lastRun: (runs[0] && runs[0].ts) || '—',
    runsToday: today.length,
    costToday: today.reduce((s, r) => s + (r.costUsd || 0), 0),
    model: (runs[0] && runs[0].model) || '—',
    total: runs.length,
  };
}

function ArchitectureView({ tweaks, currentUser, nav, embedded }) {
  const [selected, setSelected] = useStA(null); // agent node id → live-stats modal
  const [hov, setHov] = useStA(null);           // { id, x, y } → hover popover

  const titleOf = (id) => {
    const n = ARCH_NODES.find((x) => x.id === id);
    if (n) return n.title;
    const g = ARCH_GROUPS.find((x) => x.id === id);
    return g ? g.label.split(' — ')[0] : id;
  };
  const hovNode = hov ? ARCH_NODES.find((n) => n.id === hov.id) : null;
  const det = hov ? ARCH_DETAILS[hov.id] : null;
  const flowsIn = hov ? ARCH_EDGES.filter((e) => e.to === hov.id) : [];
  const flowsOut = hov ? ARCH_EDGES.filter((e) => e.from === hov.id) : [];
  const meta = selected ? AGENT_META[selected] : null;
  const live = meta ? agentLive(meta.agent) : null;

  const legend = (
    <div className="arch-legend">
      <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--panel)', border: '1px dashed var(--border-strong)' }} />source</span>
      <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--blue-soft)' }} />storage</span>
      <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--surface)', borderTop: '3px solid var(--accent)' }} />agent</span>
      <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--surface)', borderLeft: '3px solid var(--blue)' }} />service</span>
      <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--accent-soft)' }} />UI</span>
      <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--green-soft)' }} />external</span>
      <span className="arch-legend-item"><span style={{ width: 16, borderTop: '2px solid var(--text-faint)', display: 'inline-block' }} />data</span>
      <span className="arch-legend-item"><span style={{ width: 16, borderTop: '2px dashed var(--blue)', display: 'inline-block' }} />knowledge</span>
      <span className="arch-legend-item"><span style={{ width: 16, borderTop: '2px dashed var(--accent)', display: 'inline-block' }} />loop</span>
      <span className="arch-legend-item"><span style={{ width: 16, borderTop: '2px dashed var(--amber)', display: 'inline-block' }} />approval</span>
    </div>
  );

  return (
    <div className="fadein">
      {!embedded && (
        <SectionHeader
          title="System architecture"
          subtitle="End to end: people → SPA → agents → models → data → surfaces. Hover any node; click an agent for live runs."
          actions={
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('runs')}>
              <Icon name="runs" size={12} /> AI runs
            </button>
          }
        />
      )}

      <Card title="System map" meta="hover a node · click an agent for live stats" actions={legend} pad={false}>
        <div className="arch-canvas" style={{ height: 'calc(100vh - 240px)', minHeight: 520 }}>
          <div className="arch-stage" style={{ width: 1080, height: 1600 }}>
            {ARCH_GROUPS.map((g) => (
              <div key={g.id} className="arch-group"
                style={{ left: g.x, top: g.y, width: g.w, height: g.h,
                  ...(g.tone ? { background: `color-mix(in oklch, var(${g.tone}) 45%, transparent)` } : {}) }}>
                <div className="arch-group-label">{g.label}</div>
              </div>
            ))}
            <ArchEdges nodes={ARCH_NODES} groups={ARCH_GROUPS} edges={ARCH_EDGES} />
            {ARCH_NODES.map((n) => (
              <div key={n.id}
                className="arch-node"
                data-kind={n.kind}
                data-agent={AGENT_META[n.id] ? 'true' : undefined}
                style={{ left: n.x, top: n.y }}
                onMouseEnter={(ev) => {
                  const r = ev.currentTarget.getBoundingClientRect();
                  setHov({ id: n.id, x: r.right + 380 < window.innerWidth ? r.right + 10 : r.left - 390, y: Math.min(r.top, window.innerHeight - 320) });
                }}
                onMouseLeave={() => setHov(null)}
                onClick={() => { if (AGENT_META[n.id]) setSelected(n.id); }}
              >
                <div className="node-head"><span className="node-ico">{n.ico}</span><div className="node-title">{n.title}</div></div>
                <div className="node-sub">{n.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Hover popover — portal to body, same pattern as Cite */}
      {hov && det && ReactDOM.createPortal(
        <div className="cite-pop arch-pop" style={{ left: hov.x, top: hov.y }}>
          <div className="pop-sec" style={{ margin: 0 }}>{hovNode ? hovNode.kind : ''}</div>
          <div style={{ fontWeight: 600, fontSize: 13, margin: '2px 0 5px' }}>{hovNode ? `${hovNode.ico} ${hovNode.title}` : hov.id}</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.45 }}>{det.what}</div>
          {det.tech && det.tech.length > 0 && (
            <>
              <div className="pop-sec">Tech</div>
              {det.tech.map((t) => <div key={t} className="pop-tech">{t}</div>)}
            </>
          )}
          {flowsIn.length > 0 && (
            <>
              <div className="pop-sec">In</div>
              <div className="pop-flow">
                {flowsIn.map((e, i) => <span key={i}>{titleOf(e.from)}{e.label ? ` — ${e.label}` : ''}</span>)}
              </div>
            </>
          )}
          {flowsOut.length > 0 && (
            <>
              <div className="pop-sec">Out</div>
              <div className="pop-flow">
                {flowsOut.map((e, i) => <span key={i}>{titleOf(e.to)}{e.label ? ` — ${e.label}` : ''}</span>)}
              </div>
            </>
          )}
          {AGENT_META[hov.id] && <div className="pop-sec" style={{ marginTop: 8 }}>click for live runs</div>}
        </div>,
        document.body
      )}

      {/* Agent inspector — live stats from ai_runs */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={meta ? meta.agent : ''} width={560}>
        {meta && live && (
          <div className="col" style={{ gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13 }}>{(ARCH_DETAILS[selected] || {}).what}</p>
            <dl className="kv">
              <dt>Runtime</dt><dd>{meta.runtime}</dd>
              <dt>Trigger</dt><dd>{meta.trigger}</dd>
              <dt>Source</dt><dd className="mono">{meta.source}</dd>
            </dl>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div className="kpi-tile" style={{ padding: 10 }}>
                <div className="kpi-name" style={{ fontSize: 10 }}>Last run</div>
                <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{live.lastRun}</div>
              </div>
              <div className="kpi-tile" style={{ padding: 10 }}>
                <div className="kpi-name" style={{ fontSize: 10 }}>Runs today</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{live.runsToday}</div>
              </div>
              <div className="kpi-tile" style={{ padding: 10 }}>
                <div className="kpi-name" style={{ fontSize: 10 }}>Cost today</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>${live.costToday.toFixed(4)}</div>
              </div>
              <div className="kpi-tile" style={{ padding: 10 }}>
                <div className="kpi-name" style={{ fontSize: 10 }}>Served model</div>
                <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{String(live.model).replace('anthropic/', '')}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span className="muted" style={{ fontSize: 11 }}>{live.total} run{live.total === 1 ? '' : 's'} logged in your scope</span>
              <span style={{ flex: 1 }} />
              <button className="btn" data-size="sm" data-variant="primary" onClick={() => { setSelected(null); nav.go('runs'); }}>
                <Icon name="runs" size={11} /> View runs
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
window.ArchitectureView = ArchitectureView;

// ── Edge router ─────────────────────────────────────────────────────────
// Three route shapes: orthogonal elbow via a reserved corridor (viaX),
// horizontal bezier between facing sides, vertical bezier bottom→top.
function ArchEdges({ nodes, groups, edges }) {
  const byId = useMA(() => {
    const m = {};
    (groups || []).forEach((g) => { m[g.id] = { x: g.x, y: g.y, w: g.w, h: g.h }; });
    nodes.forEach((n) => { m[n.id] = { x: n.x, y: n.y, w: n.w || 200, h: n.h || 76 }; });
    return m;
  }, [nodes, groups]);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const bezMid = (p) => [(p[0] + 3 * p[2] + 3 * p[4] + p[6]) / 8, (p[1] + 3 * p[3] + 3 * p[5] + p[7]) / 8];

  function route(e) {
    const A = byId[e.from], B = byId[e.to];
    if (!A || !B) return null;
    const acx = A.x + A.w / 2, acy = A.y + A.h / 2;
    const bcx = B.x + B.w / 2, bcy = B.y + B.h / 2;
    if (e.viaX != null) {
      const v = e.viaX;
      const ay = acy + (e.fromDy || 0), by = bcy + (e.toDy || 0);
      const ax = v < acx ? A.x : A.x + A.w;
      const bx = v < bcx ? B.x : B.x + B.w;
      const dir = by > ay ? 1 : -1;
      const r = Math.min(20, Math.abs(by - ay) / 2 || 1);
      const sA = ax > v ? r : -r;
      const sB = bx > v ? r : -r;
      let lx = v, ly = (ay + by) / 2;
      if (e.labelAt === 'start') { lx = (ax + v) / 2; ly = ay; }
      if (e.labelAt === 'end') { lx = (v + bx) / 2; ly = by; }
      return {
        d: `M ${ax},${ay} L ${v + sA},${ay} Q ${v},${ay} ${v},${ay + dir * r} L ${v},${by - dir * r} Q ${v},${by} ${v + sB},${by} L ${bx},${by}`,
        lx, ly,
      };
    }
    if (Math.abs(bcx - acx) > Math.abs(bcy - acy)) {
      const ltr = bcx > acx;
      const ax = ltr ? A.x + A.w : A.x, bx = ltr ? B.x : B.x + B.w;
      const ay = acy + (e.fromDy || 0), by = bcy + (e.toDy || 0);
      const h = clamp(Math.abs(bx - ax) / 2, 30, 120) * (ltr ? 1 : -1);
      const p = [ax, ay, ax + h, ay, bx - h, by, bx, by];
      const m = bezMid(p);
      return { d: `M ${ax},${ay} C ${ax + h},${ay} ${bx - h},${by} ${bx},${by}`, lx: m[0], ly: m[1] };
    }
    const down = bcy > acy;
    const ax = clamp(bcx, A.x + 24, A.x + A.w - 24), ay = down ? A.y + A.h : A.y;
    const bx = clamp(acx, B.x + 24, B.x + B.w - 24), by = down ? B.y : B.y + B.h;
    const k = clamp(Math.abs(by - ay) / 2, 24, 90) * (down ? 1 : -1);
    const p = [ax, ay, ax, ay + k, bx, by - k, bx, by];
    const m = bezMid(p);
    return { d: `M ${ax},${ay} C ${ax},${ay + k} ${bx},${by - k} ${bx},${by}`, lx: m[0], ly: m[1] };
  }

  return (
    <svg className="arch-edges" width="1080" height="1600" style={{ minWidth: 1080, minHeight: 1600 }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const r = route(e);
        if (!r) return null;
        const kind = e.kind || 'data';
        const color = kind === 'memory' ? 'var(--blue)' : kind === 'approval' ? 'var(--amber)' : kind === 'loop' ? 'var(--accent)' : 'var(--text-faint)';
        return (
          <g key={i} style={{ color }}>
            <path d={r.d} data-kind={kind} />
            {e.label && <text x={r.lx} y={r.ly - 4}>{e.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── Feedback FAB (global) ──────────────────────────────────────────────
// Floating action button on every page — jumps straight to the Feedback page.
function FeedbackFab({ currentUser, nav }) {
  return (
    <button className="fab" title="Give feedback about the app"
      onClick={() => (nav && nav.go ? nav.go('feedback') : (location.hash = '#/feedback'))}>
      <Icon name="send" size={16} />
    </button>
  );
}
window.FeedbackFab = FeedbackFab;

// ── Feedback page (everyone) — all app feedback submitted via the FAB ──────
const FB_KINDS = ['Performance', 'UI', 'UX', 'Data / DB', 'Feature', 'Bug', 'Other'];
const FB_TONE = {
  'Performance': 'amber', 'UI': 'accent', 'UX': 'blue', 'Data / DB': 'red',
  'Feature': 'green', 'Bug': 'red', 'Other': 'outline',
  // tones for any legacy entries
  idea: 'accent', praise: 'green', annoyance: 'amber',
};
const FB_STATUSES = ['open', 'reviewed', 'done'];
// Only Yedam Venkat Ganesh Reddy sees the full feedback dashboard; everyone else
// gets a submit form + their own submissions.
const FEEDBACK_OWNER_ID = 'NW0006717';
function FeedbackView({ currentUser, nav }) {
  if (currentUser.id !== FEEDBACK_OWNER_ID) return <FeedbackSubmit currentUser={currentUser} />;
  return <FeedbackDashboard currentUser={currentUser} nav={nav} />;
}
window.FeedbackView = FeedbackView;

// Regular-user view: give feedback + see your own.
function FeedbackSubmit({ currentUser }) {
  const CDC = window.CDC;
  const [kind, setKind] = useStA(FB_KINDS[0]); // must be a real kind — 'idea' vanished from the owner's kind filters
  const [text, setText] = useStA('');
  const [, force] = useStA(0);
  // Pull the latest feedback (status/comment updates from the owner) on mount.
  useEA(() => {
    if (CDC.db && CDC.db.refreshFeedback) CDC.db.refreshFeedback().then((ok) => { if (ok) force((n) => n + 1); });
  }, []);
  const mine = (CDC.FEEDBACK || []).filter((f) => f.userId === currentUser.id);
  function submit() {
    const t = text.trim(); if (!t) return;
    const fb = { id: `fb-${Date.now()}`, kind, text: t, page: 'feedback', userId: currentUser.id, userName: currentUser.name, status: 'open', ts: CDC.fmt(CDC.today) };
    if (CDC.db && CDC.db.addFeedback) CDC.db.addFeedback(fb); else (CDC.FEEDBACK = CDC.FEEDBACK || []).unshift(fb);
    setText(''); force((n) => n + 1);
    if (CDC.toast) CDC.toast('Thanks — your feedback was sent!', 'green');
  }
  return (
    <div className="fadein">
      <SectionHeader title="Feedback" subtitle="Tell us what would make Relay better — performance, UI/UX, data, a feature idea, or a bug. It goes to the working group." />
      <Card>
        <div className="col" style={{ gap: 12 }}>
          <div className="seg">{FB_KINDS.map((k) => <button key={k} data-active={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
          <textarea className="field-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="What's on your mind?"
            style={{ minHeight: 110, padding: 12, fontSize: 14, resize: 'vertical', width: '100%' }} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" data-variant="accent" disabled={!text.trim()} onClick={submit}><Icon name="send" size={13} /> Send feedback</button>
          </div>
        </div>
      </Card>

      <h2 className="h-section">Your feedback <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {mine.length}</span></h2>
      {mine.length === 0 ? (
        <div className="empty">You haven't submitted any feedback yet — share the first one above.</div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {mine.map((f) => (
            <Card key={f.id}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                <Pill tone={FB_TONE[f.kind] || 'outline'} dot>{f.kind}</Pill>
                <Pill tone={(f.status || 'open') === 'done' ? 'green' : (f.status || 'open') === 'reviewed' ? 'blue' : 'outline'}>{f.status || 'open'}</Pill>
                <span className="muted" style={{ fontSize: 11.5 }}>{f.ts || ''}</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{f.text}</div>
              {f.comment && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2, rgba(127,127,127,.08))', borderRadius: 'var(--radius)', fontSize: 12.5, lineHeight: 1.5 }}>
                  <span className="muted" style={{ fontSize: 11 }}>Response from the team:</span><br />{f.comment}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
window.FeedbackSubmit = FeedbackSubmit;

// Owner-only dashboard: all feedback + triage.
function FeedbackDashboard({ currentUser, nav }) {
  const CDC = window.CDC;
  const isAdmin = true;   // this view only renders for the feedback owner
  const [, force] = useStA(0);
  const [kindF, setKindF] = useStA('all');
  const [statusF, setStatusF] = useStA('all');
  // Pull submissions that landed after this session's boot load.
  useEA(() => {
    if (CDC.db && CDC.db.refreshFeedback) CDC.db.refreshFeedback().then((ok) => { if (ok) force((n) => n + 1); });
  }, []);
  const all = CDC.FEEDBACK || [];
  const list = all.filter((f) => (kindF === 'all' || f.kind === kindF) && (statusF === 'all' || (f.status || 'open') === statusF));
  const countKind = (k) => all.filter((f) => f.kind === k).length;
  async function setStatus(f, s) {
    if (CDC.db && CDC.db.updateFeedback) await CDC.db.updateFeedback(f.id, { status: s });
    else f.status = s;
    force((n) => n + 1);
  }
  async function saveComment(f, c) {
    if (CDC.db && CDC.db.updateFeedback) await CDC.db.updateFeedback(f.id, { comment: c });
    else f.comment = c;
    force((n) => n + 1);
    if (CDC.toast) CDC.toast('Comment saved — visible to the submitter', 'green');
  }
  const chip = (val, cur, set, label) => (
    <button key={val} className="btn" data-size="sm" data-variant={cur === val ? 'primary' : 'ghost'} onClick={() => set(val)}>{label}</button>
  );
  return (
    <div className="fadein">
      <SectionHeader title="Feedback"
        subtitle="Ideas, bugs, praise and annoyances from across the team. Add yours with the ✎ button at the bottom-right of any page." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {FB_KINDS.map((k) => (
          <div key={k} className="kpi-tile" data-tone={FB_TONE[k]} style={{ cursor: 'pointer' }} onClick={() => setKindF(kindF === k ? 'all' : k)}>
            <div className="kpi-name">{k}</div>
            <div className="kpi-value">{countKind(k)}</div>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {chip('all', kindF, setKindF, 'all kinds')}
        {FB_KINDS.map((k) => chip(k, kindF, setKindF, k))}
        <span style={{ flex: 1 }} />
        {chip('all', statusF, setStatusF, 'any status')}
        {FB_STATUSES.map((s) => chip(s, statusF, setStatusF, s))}
      </div>

      {list.length === 0 ? (
        <div className="empty">No feedback{kindF !== 'all' || statusF !== 'all' ? ' matches the filters' : ' yet'}.</div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {list.map((f) => (
            <Card key={f.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <Pill tone={FB_TONE[f.kind] || 'outline'} dot>{f.kind}</Pill>
                    <Pill tone={(f.status || 'open') === 'done' ? 'green' : (f.status || 'open') === 'reviewed' ? 'blue' : 'outline'}>{f.status || 'open'}</Pill>
                    <span className="muted" style={{ fontSize: 11.5 }}>{f.userName || 'Someone'} · {f.ts || ''}{f.page ? ` · ${f.page}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{f.text}</div>
                </div>
                {isAdmin && (
                  <select value={f.status || 'open'} onChange={(e) => setStatus(f, e.target.value)}
                    style={{ height: 28, fontSize: 12, padding: '0 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                    {FB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <FbComment f={f} onSave={(c) => saveComment(f, c)} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
window.FeedbackDashboard = FeedbackDashboard;

// Owner's reply box on a feedback card — saved comment is shown to the submitter.
function FbComment({ f, onSave }) {
  const [v, setV] = useStA(f.comment || '');
  const dirty = v.trim() !== (f.comment || '');
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      <input className="field-input" value={v} onChange={(e) => setV(e.target.value)}
        placeholder="Reply to the submitter…"
        style={{ flex: 1, height: 30, fontSize: 12.5, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
      <button className="btn" data-size="sm" data-variant="accent" disabled={!dirty} onClick={() => onSave(v.trim())}>Save</button>
    </div>
  );
}
window.FbComment = FbComment;
