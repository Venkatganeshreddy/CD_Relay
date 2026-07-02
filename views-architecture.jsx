// CD-Copilot — Architecture / System Map.
// One-page visualization of the platform: data flow, agents, loops, memory,
// knowledge layer, tool/token expense — the "story of how it works" surface
// the leadership team can review.

const { useState: useStA, useMemo: useMA, useEffect: useEA, useRef: useRA } = React;

// ── Architecture spec ─────────────────────────────────────────────────
// Nodes laid out on a virtual grid (x,y in px from top-left).
const ARCH_NODES = [
  // Data sources (left column)
  { id: 'submit',   kind: 'source', x: 30,  y: 30,  title: 'Submit flow',   sub: 'Chat-based EOD daily report', icon: 'edit' },
  { id: 'mom',      kind: 'source', x: 30,  y: 130, title: 'MOM upload', sub: 'Meeting transcripts → action items', icon: 'weekly' },
  { id: 'teams',    kind: 'external', x: 30, y: 230, title: 'Microsoft Teams', sub: 'Nudge chases · notifications', icon: 'plug' },
  { id: 'mcp-in',   kind: 'external', x: 30, y: 330, title: 'External MCPs', sub: 'JIRA · Drive · HRMS (Phase 4)', icon: 'plug' },

  // Storage middle column
  { id: 'pg',       kind: 'storage', x: 290, y: 30, title: 'Supabase', sub: 'Postgres + RLS · employees · reports · tasks', icon: 'admin' },
  { id: 'redis',    kind: 'storage', x: 290, y: 130, title: 'Edge Function', sub: 'relay-agent · OpenRouter proxy (JWT)', icon: 'refresh' },
  { id: 'knowledge',kind: 'storage', x: 290, y: 230, title: 'Knowledge layer', sub: 'knowledge_docs · Obsidian vault round-trip', icon: 'admin' },
  { id: 'memory',   kind: 'storage', x: 290, y: 330, title: 'Memory graph', sub: 'Engram interactions · Cartographer', icon: 'admin' },

  // Agents (third column, vertically arranged)
  { id: 'a-intake', kind: 'agent', x: 560, y: 10,  title: 'Scribe', sub: 'Extract action items from MOM', icon: 'sparkles' },
  { id: 'a-dq',     kind: 'agent', x: 560, y: 100, title: 'Sentry', sub: 'Surface blocked + overdue tasks', icon: 'flag' },
  { id: 'a-cop',    kind: 'agent', x: 560, y: 190, title: 'Concierge', sub: 'Grounded chat — how-to, Q&A, feedback', icon: 'copilot' },
  { id: 'a-week',   kind: 'agent', x: 560, y: 280, title: 'Rollup', sub: 'Per-dept weekly report draft', icon: 'weekly' },
  { id: 'a-month',  kind: 'agent', x: 560, y: 370, title: 'Ledger', sub: 'Monthly worklog compile', icon: 'weekly' },
  { id: 'a-esc',    kind: 'agent', x: 560, y: 460, title: 'Dispatcher', sub: 'Match items → people, draft tasks', icon: 'sparkles' },

  // Output surfaces (right column)
  { id: 'o-dash',   kind: 'ui',     x: 830, y: 30,  title: 'Dashboard', sub: 'Pavan G · per-dept health' },
  { id: 'o-draft',  kind: 'output', x: 830, y: 130, title: 'Weekly drafts', sub: 'Approve · edit · publish' },
  { id: 'o-tasks',  kind: 'output', x: 830, y: 230, title: 'Suggested tasks', sub: 'Triage queue' },
  { id: 'o-copilot',kind: 'ui',     x: 830, y: 330, title: 'Copilot UI / MCP', sub: 'Web + Claude Desktop' },
  { id: 'o-notif',  kind: 'output', x: 830, y: 430, title: 'Notifications', sub: 'Teams · email · in-app (Phase 3)' },
];

const ARCH_EDGES = [
  // Sources → Storage
  { from: 'submit', to: 'pg', label: 'write', kind: 'data' },
  { from: 'mom', to: 'pg', label: 'upload', kind: 'data' },
  { from: 'teams', to: 'pg', label: 'sync', kind: 'data' },
  { from: 'mcp-in', to: 'pg', label: '(Phase 4)', kind: 'data' },

  // Agents run via Edge Function (OpenRouter)
  { from: 'pg', to: 'redis', kind: 'data', label: 'invoke' },

  // Storage → Agents (RBAC scoped)
  { from: 'pg', to: 'a-intake', kind: 'data', label: 'rows' },
  { from: 'pg', to: 'a-dq', kind: 'data' },
  { from: 'pg', to: 'a-cop', kind: 'data', label: 'scoped' },
  { from: 'pg', to: 'a-week', kind: 'data' },
  { from: 'pg', to: 'a-month', kind: 'data' },
  { from: 'pg', to: 'a-esc', kind: 'data' },

  // Knowledge feed
  { from: 'knowledge', to: 'a-intake', kind: 'memory' },
  { from: 'knowledge', to: 'a-cop', kind: 'memory' },
  { from: 'knowledge', to: 'a-week', kind: 'memory' },

  // Memory loops
  { from: 'memory', to: 'a-cop', kind: 'memory', label: 'recall' },
  { from: 'a-cop', to: 'memory', kind: 'memory', label: 'write' },
  { from: 'a-week', to: 'memory', kind: 'memory' },

  // Agents → UI/Output
  { from: 'pg', to: 'o-dash', label: 'dept health' },
  { from: 'a-intake', to: 'o-tasks' },
  { from: 'a-dq', to: 'o-tasks' },
  { from: 'a-week', to: 'o-draft' },
  { from: 'a-month', to: 'o-draft' },
  { from: 'a-esc', to: 'o-tasks' },
  { from: 'a-cop', to: 'o-copilot' },
  { from: 'a-dq', to: 'o-notif' },

  // Approval loop back
  { from: 'o-draft', to: 'a-week', kind: 'approval', label: 'edit → re-run' },
  { from: 'o-tasks', to: 'a-esc', kind: 'approval', label: 'approve' },
];

// Agents catalog with deployment links + tool list + costs
const AGENTS = [
  {
    id: 'a-intake', name: 'Scribe', status: 'ok',
    purpose: 'Extracts decisions + action items from an uploaded MOM transcript into structured items.',
    model: 'claude-sonnet-4-6', trigger: 'new MOM uploaded',
    lastRun: '2026-05-26 11:14', avgLatency: 4100, costPerRun: 0.024, runsToday: 7,
    deployUrl: 'edge:relay-agent',
    tools: ['mom.read', 'items.extract', 'knowledge.lookup'],
  },
  {
    id: 'a-dq', name: 'Sentry', status: 'ok',
    purpose: 'Continuous scan surfacing blocked + overdue tasks. Deterministic, no LLM call.',
    model: 'deterministic', trigger: 'continuous (5-min)',
    lastRun: '2026-05-26 11:30', avgLatency: 142, costPerRun: 0, runsToday: 288,
    deployUrl: 'edge:relay-agent',
    tools: ['pg.scan', 'flags.emit', 'tasks.suggest'],
  },
  {
    id: 'a-cop', name: 'Concierge', status: 'ok',
    purpose: 'Permission-scoped grounded chat — how-to, feedback, cited Q&A over reports / KPIs / tasks / vault.',
    model: 'claude-sonnet-4-6', trigger: 'user opens chat (web + MCP)',
    lastRun: '2026-05-26 11:32', avgLatency: 2310, costPerRun: 0.018, runsToday: 43,
    deployUrl: 'edge:relay-agent',
    tools: ['pg.scoped-read', 'knowledge.search', 'cite.builder'],
  },
  {
    id: 'a-week', name: 'Rollup', status: 'warning',
    purpose: 'Per-dept weekly draft (highlights/risks/asks) from last 7 days of reports. Human approval required.',
    model: 'claude-sonnet-4-6', trigger: 'cron Mon 06:00 IST · manual',
    lastRun: '2026-05-25 06:02', avgLatency: 9120, costPerRun: 0.078, runsToday: 0,
    deployUrl: 'edge:relay-agent',
    tools: ['pg.dept-window', 'kpi.compute', 'cite.builder'],
    note: 'DS&Algo draft confidence 0.62 — flagged for review.',
  },
  {
    id: 'a-month', name: 'Ledger', status: 'idle',
    purpose: 'Compiles monthly worklogs + carryforward task suggestions on first of month.',
    model: 'claude-sonnet-4-6', trigger: 'cron 1st 07:00 IST · manual',
    lastRun: '2026-05-01 07:00', avgLatency: 14200, costPerRun: 0.14, runsToday: 0,
    deployUrl: 'edge:relay-agent',
    tools: ['pg.month-window', 'worklog.compile', 'cite.builder'],
  },
  {
    id: 'a-esc', name: 'Dispatcher', status: 'warning',
    purpose: 'Matches Scribe action items to people, drafts tasks with owner + reason.',
    model: 'claude-haiku-4-5', trigger: 'after Scribe',
    lastRun: '2026-05-26 11:15', avgLatency: 1100, costPerRun: 0.012, runsToday: 7,
    deployUrl: 'edge:relay-agent',
    tools: ['pg.scoped-read', 'owner.infer', 'tasks.draft'],
    note: 'Owner inference accuracy below threshold this week.',
  },
];

// Loops to surface explicitly
const LOOPS = [
  {
    id: 'l-approval',
    title: 'Approval loop (writes)',
    icon: 'check',
    sub: 'Any AI-drafted write goes through a human approve / edit / reject before persisting.',
    steps: [
      'Agent emits draft (e.g. weekly summary).',
      'Surfaces in approval inbox with confidence + citations.',
      'Human approves, edits, or rejects.',
      'On approve → published; on edit → diff saved + re-cited; on reject → drop with reason.',
      'Decision logged to AIAgentRun for replay.',
    ],
  },
  {
    id: 'l-escalation',
    title: 'Escalation loop',
    icon: 'flag',
    sub: 'How a blocker becomes a task becomes a notification becomes resolved.',
    steps: [
      'Blocker mentioned in report → tagged on item (deterministic).',
      'Escalation agent scans: > 72h old? cited 3+ times? owner missing?',
      'Emits Task with status=SUGGESTED + reason + citations.',
      'Pavan G or lead approves → status=ACTIVE.',
      'Notifications fire (Slack + email) if still open at 24h.',
    ],
  },
  {
    id: 'l-mom',
    title: 'MOM / meeting loop',
    icon: 'weekly',
    sub: 'Recorded meetings flow back as Action Items and feed weekly drafts.',
    steps: [
      'Meeting recorded → transcript ingested (Phase 4 via Drive MCP).',
      'Intake agent extracts decisions + action items.',
      'Action items appear as suggested tasks; decisions feed weekly Highlights.',
      'Owners get a Slack DM with their items.',
    ],
  },
  {
    id: 'l-tool-expense',
    title: 'Tool & token expense loop',
    icon: 'runs',
    sub: 'Every agent run records model, tokens, cost, scopeHash. Aggregates feed cost dashboard.',
    steps: [
      'Agent invocation starts → AIAgentRun row created.',
      'Provider call returns tokens_in / tokens_out / model.',
      'Cost computed server-side from a versioned price table.',
      'Daily rollup → cost-by-agent, cost-by-user. Alert if budget > 80%.',
      'Per-token-budget caps stop runaway agents.',
    ],
  },
  {
    id: 'l-memory',
    title: 'Memory loop (episodic ↔ semantic)',
    icon: 'sparkles',
    sub: 'Each Copilot answer writes back a compressed episodic memory; weekly distills semantic facts.',
    steps: [
      'Copilot answer → episodic write (Q, citations, scope, ts).',
      'Nightly: cluster recent episodes by topic.',
      'Weekly distillation extracts stable semantic facts ("DS&Algo blocker pattern").',
      'Future questions retrieve from semantic first, episodic for novelty.',
      'Archive episodes > 90d unless cited.',
    ],
  },
];

const KNOWLEDGE = [
  { label: 'Hierarchy', count: '1 BD · 4 depts · 8 subs', children: [
    { label: 'Business Direction', count: 'CD' },
    { label: 'Products', count: 'Content (sole)' },
    { label: 'Departments', count: '4' },
    { label: 'Sub-teams', count: '8' },
  ]},
  { label: 'People', count: '10 users · 5 roles · 10 EmpIDs', children: [
    { label: 'L3', count: 'Pavan G' },
    { label: 'L2s', count: 'Rushikesh · Pavan Teja' },
    { label: 'L2 · Sub Departments', count: '6' },
  ]},
  { label: 'Catalog', count: '10 KPIs · 21 output cats · 11 task templates', children: [
    { label: 'Stacks', count: '8' },
    { label: 'Products', count: '15' },
    { label: 'Status types', count: '4' },
  ]},
  { label: 'Process artifacts', count: '8 worklogs/day avg · 4 weekly drafts', children: [
    { label: 'Daily reports', count: '10' },
    { label: 'Worklogs', count: '57' },
    { label: 'Weekly summaries', count: '4' },
    { label: 'Tasks (active+suggested)', count: '8' },
    { label: 'Feedback flags', count: '6' },
  ]},
];

const MEMORY_TYPES = [
  {
    kind: 'episodic',
    title: 'Episodic',
    sub: 'Time-stamped, indexed by user + scope. Q&A turns, approval decisions, blocker mentions.',
    size: '1,408 entries', retention: '90 days',
    example: 'Q "What blockers are over 3 days old?" → ans + cites → ts 2026-05-21 22:14',
  },
  {
    kind: 'semantic',
    title: 'Semantic',
    sub: 'Distilled facts extracted weekly. Stable. Backed by citations.',
    size: '127 facts', retention: 'until contradicted',
    example: '"DS&Algo has had Central Ops heap-allocation blocker since 2026-05-19"',
  },
  {
    kind: 'working',
    title: 'Working',
    sub: 'Per-request transient — citation slate, scope hash, retrieval results.',
    size: 'request-scoped', retention: 'TTL 5 min',
    example: 'Within one Copilot turn: pulled 14 reports, 6 KPIs into context.',
  },
  {
    kind: 'archived',
    title: 'Archived',
    sub: 'Cold storage for episodic past retention, kept for compliance audit.',
    size: '21,422 entries', retention: '5 years (compliance)',
    example: 'Compressed by month; rehydratable on legal hold.',
  },
];

function ArchitectureView({ tweaks, currentUser, nav, embedded }) {
  const [selectedAgent, setSelectedAgent] = useStA(null);
  const stageRef = useRA(null);

  // Total cost / token visibility
  const dailyCost = AGENTS.reduce((s, a) => s + (a.costPerRun || 0) * (a.runsToday || 0), 0);
  const projectedMonthly = (dailyCost * 30).toFixed(2);

  return (
    <div className="fadein">
      {!embedded && (
        <SectionHeader
          title="System architecture"
          subtitle="Visibility into agents, loops, memory, and tool expense. Updated continuously from runtime."
          actions={
            <>
              <button className="btn" data-size="sm"><Icon name="sheet" size={12} /> Export PNG</button>
              <button className="btn" data-size="sm"><Icon name="edit" size={12} /> Open in docs</button>
              <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('runs')}><Icon name="runs" size={12} /> AI runs</button>
            </>
          }
        />
      )}
      {/* High-level numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Active agents</div>
          <div className="kpi-value">{AGENTS.length}</div>
          <div className="kpi-meta">
            <span>{AGENTS.filter((a) => a.status === 'ok').length} healthy · {AGENTS.filter((a) => a.status === 'warning').length} warning · {AGENTS.filter((a) => a.status === 'idle').length} idle</span>
          </div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Runs today</div>
          <div className="kpi-value">{AGENTS.reduce((s, a) => s + a.runsToday, 0)}</div>
          <div className="kpi-meta"><span>across 6 agents</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Daily LLM cost</div>
          <div className="kpi-value">${dailyCost.toFixed(2)}</div>
          <div className="kpi-meta"><span>~${projectedMonthly}/mo at this rate</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Loops</div>
          <div className="kpi-value">{LOOPS.length}</div>
          <div className="kpi-meta"><span>approval · escalation · MOM · expense · memory</span></div>
        </div>
      </div>

      {/* Workflow canvas */}
      <Card title="Workflow map" meta="data → agents → surfaces" actions={
        <div className="arch-legend">
          <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--panel)', border: '1px dashed var(--border-strong)' }} />sources</span>
          <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--blue-soft)' }} />storage</span>
          <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--surface)', borderTop: '3px solid var(--accent)' }} />agent</span>
          <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--accent-soft)' }} />UI</span>
          <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--panel-2)' }} />output</span>
          <span className="arch-legend-item"><span className="arch-legend-swatch" style={{ background: 'var(--green-soft)' }} />external</span>
        </div>
      } pad={false}>
        <div className="arch-canvas" ref={stageRef} style={{ height: 600 }}>
          <div className="arch-stage" style={{ width: 1080, height: 560 }}>
            <ArchEdges nodes={ARCH_NODES} edges={ARCH_EDGES} />
            {ARCH_NODES.map((n) => (
              <div key={n.id}
                className="arch-node"
                data-kind={n.kind}
                style={{ left: n.x, top: n.y }}
                onClick={() => {
                  if (n.kind === 'agent') setSelectedAgent(AGENTS.find((a) => a.id === n.id));
                }}
              >
                <div className="node-kind">{n.kind}</div>
                <div className="node-title">{n.title}</div>
                <div className="node-sub">{n.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Agents grid */}
      <h2 className="h-section">Agents · deployable</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {AGENTS.map((a) => (
          <div key={a.id} className="agent-card" data-status={a.status}>
            <div className="agent-head">
              <div>
                <div className="agent-name">{a.name}</div>
                <div className="muted" style={{ fontSize: 10.5 }}>{a.trigger}</div>
              </div>
              <Pill tone={a.status === 'ok' ? 'green' : a.status === 'warning' ? 'amber' : a.status === 'error' ? 'red' : 'outline'} dot>{a.status}</Pill>
            </div>
            <div className="agent-purpose">{a.purpose}</div>
            {a.note && (
              <div style={{ fontSize: 11.5, color: 'var(--amber)', background: 'var(--amber-soft)', padding: '4px 8px', borderRadius: 4 }}>
                {a.note}
              </div>
            )}
            <div className="agent-stats">
              <div>
                <div className="agent-stat-label">Model</div>
                <div className="agent-stat-value mono" style={{ fontSize: 11 }}>{a.model.replace('claude-', '')}</div>
              </div>
              <div>
                <div className="agent-stat-label">Latency</div>
                <div className="agent-stat-value">{a.avgLatency.toLocaleString()} ms</div>
              </div>
              <div>
                <div className="agent-stat-label">Cost / run</div>
                <div className="agent-stat-value">${a.costPerRun.toFixed(4)}</div>
              </div>
            </div>
            <div className="agent-tools">
              {a.tools.map((t) => <span key={t} className="agent-tool">{t}</span>)}
            </div>
            <div className="agent-actions">
              <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setSelectedAgent(a)}><Icon name="eye" size={11} /> Inspect</button>
              <button className="btn" data-size="sm" data-variant="ghost"><Icon name="refresh" size={11} /> Run now</button>
              <span style={{ flex: 1 }} />
              <span className="mono faint" style={{ fontSize: 10, alignSelf: 'center' }}>{a.runsToday}× today</span>
            </div>
          </div>
        ))}
      </div>

      {/* Loops */}
      <h2 className="h-section">Loops & flow visibility</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {LOOPS.map((l) => (
          <div key={l.id} className="loop-card">
            <div className="loop-title"><Icon name={l.icon} size={14} /> {l.title}</div>
            <div className="loop-sub">{l.sub}</div>
            <div className="loop-steps">
              {l.steps.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="loop-step">
                    <span className="step-num">{i + 1}</span>
                    <span style={{ flex: 1 }}>{step}</span>
                  </div>
                  {i < l.steps.length - 1 && <div className="loop-arrow"><Icon name="chev-down" size={10} /></div>}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Memory & Knowledge */}
      <h2 className="h-section">Memory & knowledge layer</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {MEMORY_TYPES.map((m) => (
              <div key={m.kind} className="memory-tile" data-kind={m.kind}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</div>
                  <span className="mono faint" style={{ fontSize: 10 }}>{m.size}</span>
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>{m.sub}</div>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <Pill tone="outline">retention: {m.retention}</Pill>
                </div>
                <div className="code" style={{ fontSize: 10.5, padding: 6, marginTop: 4 }}>{m.example}</div>
              </div>
            ))}
          </div>
        </div>
        <Card title="Knowledge layer" meta="stable context shared across agents">
          <div className="knowledge-graph">
            {KNOWLEDGE.map((root) => (
              <React.Fragment key={root.label}>
                <div className="kg-node">
                  <Icon name="admin" size={12} />
                  <strong>{root.label}</strong>
                  <span className="kg-count">{root.count}</span>
                </div>
                {root.children?.map((c) => (
                  <div key={c.label} className="kg-node" data-depth="1">
                    <Icon name="chev-right" size={9} />
                    <span>{c.label}</span>
                    <span className="kg-count">{c.count}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </Card>
      </div>

      {/* Tool & token expense */}
      <h2 className="h-section">Tool & token expense</h2>
      <Card title="Cost-of-day by agent" meta={`Total $${dailyCost.toFixed(2)} today · projected $${projectedMonthly}/mo`}>
        <CostBar agents={AGENTS} total={dailyCost} />
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Model</th>
              <th>Runs (today)</th>
              <th>Cost/run</th>
              <th>Day total</th>
              <th>Projected /mo</th>
              <th>Budget</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => {
              const today = a.costPerRun * a.runsToday;
              const monthly = today * 30;
              const budget = a.id === 'a-cop' ? 60 : a.id === 'a-week' ? 8 : a.id === 'a-month' ? 5 : 4;
              const pct = budget > 0 ? Math.min(100, (monthly / budget) * 100) : 0;
              return (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td className="mono muted" style={{ fontSize: 11.5 }}>{a.model.replace('claude-', '')}</td>
                  <td className="num">{a.runsToday}</td>
                  <td className="num">${a.costPerRun.toFixed(4)}</td>
                  <td className="num">${today.toFixed(2)}</td>
                  <td className="num">${monthly.toFixed(2)}</td>
                  <td style={{ width: 160 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--green)' }} />
                      </div>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
                        ${monthly.toFixed(0)} / ${budget}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Hierarchy snapshot */}
      <h2 className="h-section">Permission hierarchy</h2>
      <Card title="RBAC scope tree">
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Every agent invocation carries a <span className="code">permissionScopeHash</span> derived from the caller's role. The same query returns different rows for Pavan G vs Pavan Teja vs Chanakya.
        </div>
        <div className="knowledge-graph">
          <div className="kg-node">
            <Icon name="admin" size={12} />
            <strong>L3</strong>
            <span className="muted" style={{ fontSize: 11.5 }}>scope: all</span>
            <span className="kg-count">1 user</span>
          </div>
          <div className="kg-node" data-depth="1">
            <Icon name="dashboard" size={11} />
            <span>L2 · DS&ML</span>
            <span className="muted" style={{ fontSize: 11 }}>scope: d-dsml</span>
            <span className="kg-count">Rushikesh</span>
          </div>
          <div className="kg-node" data-depth="1">
            <Icon name="dashboard" size={11} />
            <span>L2 · DS&Algo</span>
            <span className="muted" style={{ fontSize: 11 }}>scope: d-dsalgo</span>
            <span className="kg-count">Pavan Teja</span>
          </div>
          <div className="kg-node" data-depth="1">
            <Icon name="dashboard" size={11} />
            <span>L2 · FS, GenAI, CSI & CO</span>
            <span className="muted" style={{ fontSize: 11 }}>scope: d-fsgci</span>
            <span className="kg-count">— vacant</span>
          </div>
          {['Chanakya / Fullstack', 'Pushpa / GenAI', 'Vijay / Central Ops', 'Pavan / Central Ops'].map((s) => (
            <div key={s} className="kg-node" data-depth="2">
              <Icon name="chev-right" size={9} />
              <span>L1 · {s}</span>
            </div>
          ))}
          <div className="kg-node" data-depth="1">
            <Icon name="dashboard" size={11} />
            <span>L2 · Aptitude & English</span>
            <span className="muted" style={{ fontSize: 11 }}>scope: d-aptenglish</span>
            <span className="kg-count">— vacant</span>
          </div>
          {['Prudvi / Aptitude', 'Tejaswini / English'].map((s) => (
            <div key={s} className="kg-node" data-depth="2">
              <Icon name="chev-right" size={9} />
              <span>L1 · {s}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Agent inspector modal */}
      <Modal open={!!selectedAgent} onClose={() => setSelectedAgent(null)} title={selectedAgent?.name || ''} width={680}>
        {selectedAgent && (
          <div className="col" style={{ gap: 14 }}>
            <div>
              <Pill tone={selectedAgent.status === 'ok' ? 'green' : 'amber'} dot>{selectedAgent.status}</Pill>
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>{selectedAgent.purpose}</p>
            </div>
            <dl className="kv">
              <dt>Model</dt><dd className="mono">{selectedAgent.model}</dd>
              <dt>Trigger</dt><dd>{selectedAgent.trigger}</dd>
              <dt>Last run</dt><dd className="mono">{selectedAgent.lastRun}</dd>
              <dt>Avg latency</dt><dd className="mono">{selectedAgent.avgLatency.toLocaleString()} ms</dd>
              <dt>Cost / run</dt><dd className="mono">${selectedAgent.costPerRun.toFixed(4)}</dd>
              <dt>Runs today</dt><dd className="mono">{selectedAgent.runsToday}</dd>
              <dt>Deploy URL</dt><dd className="mono code">{selectedAgent.deployUrl}</dd>
              <dt>Tools</dt>
              <dd>
                <div className="agent-tools">
                  {selectedAgent.tools.map((t) => <span key={t} className="agent-tool">{t}</span>)}
                </div>
              </dd>
            </dl>
            <div className="row" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <button className="btn" data-size="sm"><Icon name="refresh" size={11} /> Run now</button>
              <button className="btn" data-size="sm"><Icon name="runs" size={11} /> View runs</button>
              <span style={{ flex: 1 }} />
              <button className="btn" data-size="sm" data-variant="ghost"><Icon name="edit" size={11} /> Edit prompt</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
window.ArchitectureView = ArchitectureView;

// ── Edges renderer ──────────────────────────────────────────────────────
function ArchEdges({ nodes, edges }) {
  const NODE_W = 200; const NODE_H = 76;
  const byId = useMA(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  function path(from, to, kind) {
    const A = byId[from]; const B = byId[to];
    if (!A || !B) return '';
    // Always connect from right edge of A to left edge of B
    let ax = A.x + NODE_W; let ay = A.y + NODE_H / 2;
    let bx = B.x; let by = B.y + NODE_H / 2;
    // For approval/memory loops going right-to-left, route them differently
    if (B.x < A.x) {
      ax = A.x; ay = A.y + NODE_H / 2;
      bx = B.x + NODE_W; by = B.y + NODE_H / 2;
      // bow up to avoid overlap
      const midY = Math.min(ay, by) - 28;
      return `M ${ax},${ay} C ${ax - 30},${midY} ${bx + 30},${midY} ${bx},${by}`;
    }
    const dx = (bx - ax) / 2;
    return `M ${ax},${ay} C ${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`;
  }

  return (
    <svg className="arch-edges" width="100%" height="100%" style={{ minWidth: 1080, minHeight: 560 }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const A = byId[e.from]; const B = byId[e.to];
        if (!A || !B) return null;
        const d = path(e.from, e.to, e.kind);
        // Label position — midpoint
        const midX = (A.x + B.x + NODE_W) / 2;
        const midY = (A.y + B.y + NODE_H) / 2;
        return (
          <g key={i} style={{ color: e.kind === 'memory' ? 'var(--blue)' : e.kind === 'approval' ? 'var(--amber)' : 'var(--text-faint)' }}>
            <path d={d} data-kind={e.kind === 'memory' ? 'memory' : e.kind === 'approval' ? 'approval' : 'data'} />
            {e.label && <text x={midX} y={midY - 4}>{e.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── Cost bar component ─────────────────────────────────────────────────
function CostBar({ agents, total }) {
  const palette = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--blue)', 'var(--red)', 'var(--text-faint)'];
  return (
    <div>
      <div className="cost-bar">
        {agents.map((a, i) => {
          const today = a.costPerRun * a.runsToday;
          const pct = total > 0 ? (today / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div key={a.id} className="cost-seg" style={{ width: `${pct}%`, background: palette[i % palette.length] }} title={`${a.name}: $${today.toFixed(2)}`} />
          );
        })}
      </div>
      <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: 11 }}>
        {agents.map((a, i) => {
          const today = a.costPerRun * a.runsToday;
          return (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: palette[i % palette.length], display: 'inline-block' }} />
              {a.name} · <span className="mono">${today.toFixed(2)}</span>
            </span>
          );
        })}
      </div>
    </div>
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
  const [kind, setKind] = useStA('idea');
  const [text, setText] = useStA('');
  const [, force] = useStA(0);
  const mine = (CDC.FEEDBACK || []).filter((f) => f.userId === currentUser.id);
  function submit() {
    const t = text.trim(); if (!t) return;
    const fb = { id: `fb-${Date.now()}`, kind, text: t, page: 'feedback', userId: currentUser.id, userName: currentUser.name, status: 'open', ts: CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10) };
    if (CDC.db && CDC.db.addFeedback) CDC.db.addFeedback(fb); else (CDC.FEEDBACK = CDC.FEEDBACK || []).unshift(fb);
    setText(''); force((n) => n + 1);
    if (CDC.toast) CDC.toast('Thanks — your feedback was sent!', 'green');
  }
  return (
    <div className="fadein">
      <SectionHeader title="Feedback" subtitle="Tell us what would make Relay better — an idea, a bug, praise, or an annoyance. It goes to the working group." />
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
  const chip = (val, cur, set, label, tone) => (
    <button className="btn" data-size="sm" data-variant={cur === val ? 'primary' : 'ghost'} onClick={() => set(val)}>{label}</button>
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
