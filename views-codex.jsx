// Relay — Codex: the system reference.
// Read by all, edit by Admin/L3 only. Three tabs:
//   - Architecture (reuses the diagram from ArchitectureView)
//   - Workflows (one card per core flow, validate-then-activate on edit)
//   - Guidelines (versioned, with edit history)

const { useState: useStCx, useEffect: useEfCx, useRef: useRfCx } = React;

function CodexView({ tweaks, currentUser, nav, initialTab }) {
  const [tab, setTab] = useStCx(initialTab || 'architecture');
  const role = currentUser.role;
  const canEdit = role === 'ADMIN' || role === 'L3' || role === 'PRODUCT_OWNER';

  return (
    <div className="fadein">
      <SectionHeader
        title="Codex"
        subtitle="The in-app source of truth. Architecture · workflows · guidelines. Read-by-all, edit-by-Admin-or-L3."
        actions={
          <>
            <Pill tone={canEdit ? 'green' : 'outline'} dot={canEdit}>{canEdit ? 'edit access' : 'read-only'}</Pill>
            <button className="btn" data-size="sm"><Icon name="sheet" size={12} /> Export</button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('copilot', { prefill: 'Explain the weekly rollup workflow.' })}><Icon name="sparkles" size={12} /> Ask Codex</button>
          </>
        }
      />

      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        {[
          { id: 'architecture', label: 'Architecture' },
          { id: 'flows', label: 'Agent Flows', count: 5 },
          { id: 'workflows', label: 'Workflows', count: window.CDC.CODEX_WORKFLOWS.length },
          { id: 'guidelines', label: 'Guidelines', count: window.CDC.CODEX_GUIDELINES.length },
        ].map((tabInfo) => (
          <button key={tabInfo.id} className="btn" data-size="sm"
            data-variant={tab === tabInfo.id ? 'primary' : 'ghost'}
            onClick={() => setTab(tabInfo.id)}>
            {tabInfo.label}
            {tabInfo.count != null && <span className="mono muted" style={{ marginLeft: 6 }}>{tabInfo.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'architecture' && <ArchitectureView tweaks={tweaks} currentUser={currentUser} nav={nav} embedded />}
      {tab === 'flows' && <AgentFlowsTab canEdit={canEdit} nav={nav} />}
      {tab === 'workflows' && <WorkflowsTab canEdit={canEdit} />}
      {tab === 'guidelines' && <GuidelinesTab canEdit={canEdit} nav={nav} />}
    </div>
  );
}
window.CodexView = CodexView;

// ── Agent Flows tab ───────────────────────────────────────────────────
// Live-renders the Mermaid control-flow sources in diagrams/agents/ so the
// in-app diagram is the same artifact the repo ships. Real prod names:
// Edge Function relay-agent, Claude Sonnet 4.6, the actual tables.

const FLOW_DEFS = [
  {
    id: 'system', label: 'System loop', file: 'producers-combined.mmd',
    blurb: 'The whole cast as a flow-of-flows: which trigger → which agent → which store, and how every store feeds the next agent. Curator closes the learning loop.',
    trigger: 'Daily reports · MOM commit · task goes blocked · user chat',
    input: 'Reports (Rollup) · transcript (Scribe + Cartographer) · blocked tasks (Sentry) · graph + stores (Concierge)',
    output: 'weekly_summaries · tasks · Second Brain graph · activity feed',
    feeds: 'Every human approve / edit / reject → engram_interactions → Curator distils rules → memoryFor injects them into each producer’s NEXT run. Loop closed.',
    model: 'Sonnet 4.6 (producers) · Haiku 4.5 (Dispatcher, Cartographer) via relay-agent',
    source: 'supabase-client.js:311–503 · views-relay.jsx:306–491',
  },
  {
    id: 'scribe', label: 'Scribe', file: 'scribe.mmd',
    blurb: 'Meeting transcript → structured action items.',
    trigger: 'MOM Loader · paste transcript (len > 20, agents available)',
    input: 'Transcript text + roster (USERS → name·level·sub)',
    output: 'agenda · attendees · summary (3 lenses) · items',
    feeds: 'Dispatcher (deterministic 5-tier route) → tasks + engram_interactions → TasksView (MINE filter).',
    model: 'Claude Sonnet 4.6 (smart)',
    source: 'views-relay.jsx · MomLoader',
  },
  {
    id: 'rollup', label: 'Rollup', file: 'rollup.mmd',
    blurb: 'A week of daily reports → consolidated weekly summary.',
    trigger: 'WeeklyView · Regenerate / Generate all',
    input: 'REPORTS where dept == weekly.dept AND not missing',
    output: 'sections: Highlights · Risks · Asks (+ cited source report ids)',
    feeds: 'weekly_summaries draft → human approve / edit → publish.',
    model: 'Claude Sonnet 4.6 (smart)',
    source: 'supabase-client.js · runRollup()',
  },
  {
    id: 'sentry', label: 'Sentry', file: 'sentry.mmd',
    blurb: 'A stuck task → one human-readable escalation line.',
    trigger: 'task blocked / escalate event',
    input: 'task facts: title · status · owner · reason · daysStuck · due · target',
    output: 'one escalation line (routing target stays deterministic in caller)',
    feeds: 'activity feed (escalation). Null result → caller uses a template line.',
    model: 'Claude Sonnet 4.6 (smart)',
    source: 'supabase-client.js · runSentry()',
  },
  {
    id: 'curator', label: 'Curator (loop)', file: 'curator.mmd',
    blurb: 'Human corrections → learned rules. The self-evolving loop that tunes the other three.',
    trigger: 'auto · 5 corrections for an agent · or manual/scheduled pass',
    input: 'engram_interactions where action != accept (only edits / rejects teach)',
    output: 'relay_agents.data.memory: 3–7 imperative rules + distilledFrom + ts',
    feeds: 'memoryFor() injects those rules into that agent’s NEXT run → producers self-correct. LOOP CLOSED.',
    model: 'Claude Sonnet 4.6 (smart)',
    source: 'supabase-client.js · runCurator()',
  },
  {
    id: 'secondbrain', label: 'Second Brain', file: 'second-brain.mmd',
    blurb: 'Meeting memory graph — Cartographer ingests every committed MOM, Concierge queries it for grounded answers.',
    trigger: 'MOM committed (MOM Loader) · nightly refresh',
    input: 'Committed MOM transcript + roster + existing graph nodes',
    output: 'graph nodes + edges (people × meetings × decisions × tasks)',
    feeds: 'GraphRAG recall → Concierge grounded answers (cited). Scribe action items link back to graph nodes.',
    model: 'Claude Haiku 4.5 (fast) via relay-agent',
    source: 'r-cartographer · wf-mom · SecondBrainView (views-relay.jsx:58)',
  },
];

// Substring → explainer, surfaced when a node is clicked. Matched against the
// node's text so it survives Mermaid's id-mangling.
const FLOW_GLOSSARY = [
  { match: ['relay-agent', 'Edge Function'], title: 'Edge Function · relay-agent', detail: 'JWT-gated OpenRouter proxy (verify_jwt on). API key lives in env OPENROUTER_API_KEY, never in the browser. supabase/functions/relay-agent/index.ts' },
  { match: ['Claude Sonnet', 'OpenRouter'], title: 'Model · Claude Sonnet 4.6', detail: 'anthropic/claude-sonnet-4.6 via OpenRouter (LLM_MODEL_SMART). The “fast” alias is Haiku 4.5.' },
  { match: ['memoryFor'], title: 'memoryFor()', detail: 'Pulls the agent’s Curator-distilled rules from relay_agents.data.memory and injects them into the system prompt before each run. This is the loop-closing step.' },
  { match: ['engram', 'ENGRAM'], title: 'engram_interactions', detail: 'AI-draft vs human-kept vs reason. The correction signal Curator learns from — only edits/rejects teach, accepts are ignored.' },
  { match: ['ai_runs', 'activity'], title: 'ai_runs + activity', detail: 'Every run is logged: ai_runs powers the AI runs view, activity powers the feed. Best-effort (local optimistic + remote).' },
  { match: ['tasks'], title: 'tasks (+ engram_interactions)', detail: 'Owner-assigned action items. Created with owner = assignee; visible in TasksView under the MINE filter for that person.' },
  { match: ['weekly_summaries', 'weekly'], title: 'weekly_summaries draft', detail: 'Highlights / Risks / Asks with cited report ids. Human approves / edits → publish.' },
  { match: ['Dispatcher', 'DISPATCHER'], title: 'Dispatcher', detail: 'Deterministic 5-tier routing of each action item to an employee (assigneeHint → person). Code, not an LLM call. Haiku 4.5 only when an inference is needed.' },
  { match: ['Fallback', 'fallback', 'canned', 'template'], title: 'Fail-soft fallback', detail: 'On LLM/parse failure: deterministic extract, canned demo items, or a template line. The flow never hard-fails the UI.' },
  { match: ['parse', 'JSON.parse', 'regex'], title: 'Parse step', detail: 'Regex-extract the JSON block from the model output, JSON.parse it. On failure → fallback (fail-soft).' },
  { match: ['relay_agents', 'memory', 'learned rules'], title: 'relay_agents.data.memory', detail: 'Where Curator writes the distilled rules (+ distilledFrom + ts). memoryFor() reads it back into each producer’s next run. Updated local + remote.' },
  { match: ['ROLLUP'], title: 'Rollup', detail: 'Consolidates the week’s in-scope daily reports into a weekly draft (Highlights / Risks / Asks + cites). Sonnet 4.6. Open the Rollup tab for its control-flow.' },
  { match: ['SCRIBE'], title: 'Scribe', detail: 'Extracts structured action items from a committed MOM transcript. Sonnet 4.6. Open the Scribe tab for its control-flow.' },
  { match: ['SENTRY'], title: 'Sentry', detail: 'Drafts one escalation line for a blocked/overdue task; routing target stays deterministic. Open the Sentry tab.' },
  { match: ['CURATOR'], title: 'Curator', detail: 'Distils human corrections (edits/rejects) into 3–7 imperative rules per agent — the self-evolving loop. Open the Curator tab.' },
  { match: ['CARTOGRAPHER', 'Cartographer'], title: 'Cartographer', detail: 'Builds + maintains the Second Brain memory graph from committed MOMs. Haiku 4.5. Trigger: after Scribe + nightly. Open the Second Brain tab.' },
  { match: ['CONCIERGE', 'Concierge'], title: 'Concierge', detail: 'Permission-scoped grounded chat. Reads scoped reports / KPIs / tasks + the Second Brain graph (GraphRAG) and cites sources.' },
  { match: ['Second Brain', 'graph nodes', 'nodes + edges', 'memory graph'], title: 'Second Brain graph', detail: 'People × meetings × decisions × tasks (≈412 nodes / 1,084 edges). GraphRAG-searchable; grounds Concierge answers.' },
  { match: ['GraphRAG'], title: 'GraphRAG search', detail: 'Embed the query, traverse the memory graph, return the connected sub-graph as cited context for Concierge.' },
];

function lazyScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) return resolve(window[globalName]);
    let s = document.querySelector('script[data-lazy="' + src + '"]');
    if (s) { s.addEventListener('load', () => resolve(window[globalName])); s.addEventListener('error', reject); return; }
    s = document.createElement('script');
    s.src = src; s.async = true; s.setAttribute('data-lazy', src);
    s.onload = () => resolve(window[globalName]);
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

function MermaidFlow({ file, onNode }) {
  const ref = useRfCx(null);
  const graph = useRfCx({ nodes: new Map(), edges: [], pz: null });
  const [err, setErr] = useStCx(null);
  const [loading, setLoading] = useStCx(true);
  const [focused, setFocused] = useStCx(false);

  const cleanLabel = (g) => {
    const l = g.querySelector('.nodeLabel') || g.querySelector('.label') || g;
    return (l.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const clearTrace = () => {
    const { nodes, edges } = graph.current;
    nodes.forEach((n) => { n.g.style.opacity = ''; n.g.style.filter = ''; });
    edges.forEach((e) => { e.path.style.opacity = ''; e.path.style.stroke = ''; e.path.style.strokeWidth = ''; });
    setFocused(false);
  };

  const focusNode = (id) => {
    const { nodes, edges } = graph.current;
    const down = edges.filter((e) => e.src === id);
    const up = edges.filter((e) => e.tgt === id);
    const keep = new Set([id, ...down.map((e) => e.tgt), ...up.map((e) => e.src)]);
    nodes.forEach((n, nid) => {
      n.g.style.transition = 'opacity .2s';
      n.g.style.opacity = keep.has(nid) ? '1' : '0.12';
      n.g.style.filter = nid === id ? 'drop-shadow(0 0 7px rgba(207,227,247,.85))' : '';
    });
    edges.forEach((e) => {
      const on = e.src === id || e.tgt === id;
      e.path.style.transition = 'stroke .2s, opacity .2s';
      e.path.style.opacity = on ? '1' : '0.08';
      e.path.style.stroke = on ? (e.src === id ? '#7aa2f7' : '#34d058') : '';
      e.path.style.strokeWidth = on ? '2.4px' : '';
    });
    setFocused(true);
    if (onNode) onNode({
      id,
      label: nodes.get(id) ? nodes.get(id).label : id,
      upstream: up.map((e) => nodes.get(e.src) && nodes.get(e.src).label).filter(Boolean),
      downstream: down.map((e) => nodes.get(e.tgt) && nodes.get(e.tgt).label).filter(Boolean),
    });
  };

  useEfCx(() => {
    let cancelled = false;
    setErr(null); setLoading(true); setFocused(false);
    (async () => {
      try {
        await lazyScript('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js', 'mermaid');
        await lazyScript('https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js', 'svgPanZoom');
        const res = await fetch('diagrams/agents/' + file, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const src = await res.text();
        if (cancelled) return;
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: true } });
        const { svg } = await window.mermaid.render('mmd-' + file.replace(/\W/g, ''), src);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        const svgEl = ref.current.querySelector('svg');
        const nodes = new Map(); const edges = [];
        if (svgEl) {
          svgEl.removeAttribute('height'); svgEl.style.maxWidth = 'none';
          svgEl.style.width = '100%'; svgEl.style.height = '100%';
          // Build graph from DOM ids: node = "<r>-flowchart-<id>-<n>", edge = "<r>-L_<src>_<tgt>_<n>".
          svgEl.querySelectorAll('.node').forEach((g) => {
            const part = (g.id || '').split('-flowchart-')[1];
            if (!part) return;
            const nid = part.replace(/-\d+$/, '');
            nodes.set(nid, { g, label: cleanLabel(g) });
            g.style.cursor = 'pointer';
            g.addEventListener('click', (ev) => { ev.stopPropagation(); focusNode(nid); });
          });
          svgEl.querySelectorAll('.flowchart-link').forEach((path) => {
            const rest = (path.id || '').split('-L_')[1];
            if (!rest) return;
            const parts = rest.split('_');
            edges.push({ src: parts[0], tgt: parts.slice(1, -1).join('_'), path });
          });
          if (window.svgPanZoom) {
            graph.current.pz = window.svgPanZoom(svgEl, { controlIconsEnabled: false, fit: true, center: true, minZoom: 0.3, maxZoom: 8, zoomScaleSensitivity: 0.35 });
          }
        }
        graph.current.nodes = nodes; graph.current.edges = edges;
        setLoading(false);
      } catch (e) { if (!cancelled) { setErr(e.message || String(e)); setLoading(false); } }
    })();
    return () => { cancelled = true; const pz = graph.current.pz; if (pz) { try { pz.destroy(); } catch (_) {} } graph.current = { nodes: new Map(), edges: [], pz: null }; };
  }, [file]);

  const resetView = () => { const pz = graph.current.pz; if (pz) { try { pz.reset(); pz.fit(); pz.center(); } catch (_) {} } };

  if (err) return (
    <div className="empty" style={{ padding: 24 }}>
      Couldn’t render the diagram ({err}). Source: <span className="code">diagrams/agents/{file}</span>
    </div>
  );
  return (
    <>
      {loading && <div className="muted" style={{ position: 'absolute', top: 14, left: 16, fontSize: 12, zIndex: 2 }}>rendering {file}…</div>}
      <div className="row" style={{ position: 'absolute', top: 10, right: 10, zIndex: 3, gap: 6 }}>
        {focused && <button className="btn" data-size="sm" data-variant="ghost" onClick={() => { clearTrace(); if (onNode) onNode(null); }}>Clear trace</button>}
        <button className="btn" data-size="sm" data-variant="ghost" onClick={resetView}>Reset view</button>
      </div>
      <div ref={ref} style={{ width: '100%', height: '100%' }} onClick={() => { if (focused) { clearTrace(); if (onNode) onNode(null); } }} />
    </>
  );
}

function AgentFlowsTab({ canEdit, nav }) {
  const [active, setActive] = useStCx('system');
  const [node, setNode] = useStCx(null);
  const def = FLOW_DEFS.find((f) => f.id === active) || FLOW_DEFS[0];

  const onNode = (p) => {
    if (!p) { setNode(null); return; }
    const g = FLOW_GLOSSARY.find((e) => e.match.some((m) => p.label.includes(m)));
    setNode({
      title: g ? g.title : (p.label.length > 42 ? p.label.slice(0, 42) + '…' : p.label),
      detail: g ? g.detail : ('Step in the ' + def.label + ' flow.'),
      upstream: p.upstream || [], downstream: p.downstream || [],
    });
  };
  const shortLbl = (s) => (s && s.length > 26 ? s.slice(0, 26) + '…' : s);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 12.5, padding: '0 4px' }}>
        Live-rendered from <span className="code">diagrams/agents/*.mmd</span> — the same control-flow the code runs.
        Trigger → prompt → <span className="code">run()</span> → Edge Function <span className="code">relay-agent</span> → Claude Sonnet 4.6 → parse → output, with fail-soft fallback.
        Drag to pan · scroll to zoom · <strong>click a node to trace it</strong> — green = input from, blue = feeds into.
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {FLOW_DEFS.map((f) => (
          <button key={f.id} className="btn" data-size="sm"
            data-variant={active === f.id ? 'primary' : 'ghost'}
            onClick={() => { setActive(f.id); setNode(null); }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ position: 'relative', height: 600, overflow: 'hidden', background: '#0a1422', borderRadius: 8 }}>
          <MermaidFlow key={def.file} file={def.file} onNode={onNode} />
        </div>

        <div className="col" style={{ gap: 12 }}>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{def.label}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{def.blurb}</div>
            <dl className="kv" style={{ fontSize: 12 }}>
              <dt>Trigger</dt><dd>{def.trigger}</dd>
              <dt>Input</dt><dd>{def.input}</dd>
              <dt>Output</dt><dd>{def.output}</dd>
              <dt>Feeds into</dt><dd>{def.feeds}</dd>
              <dt>Model</dt><dd>{def.model}</dd>
            </dl>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" data-size="sm" data-variant="ghost"
                onClick={() => nav.go('copilot', { prefill: 'Walk me through the ' + def.label + ' agent flow — its trigger, inputs and outputs.' })}>
                <Icon name="sparkles" size={11} /> Ask Concierge
              </button>
            </div>
            <div className="muted mono" style={{ fontSize: 10.5, marginTop: 8 }}>{def.source}</div>
          </Card>

          {node && (
            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: 12.5 }}>{node.title}</strong>
                <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setNode(null)}>✕</button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>{node.detail}</div>
              {node.upstream.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 10.5, marginBottom: 4 }}><span style={{ color: '#34d058' }}>●</span> input from</div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {node.upstream.map((u, i) => <span key={i} className="agent-tool" style={{ fontSize: 10.5 }}>{shortLbl(u)}</span>)}
                  </div>
                </div>
              )}
              {node.downstream.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 10.5, marginBottom: 4 }}><span style={{ color: '#7aa2f7' }}>●</span> feeds into</div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {node.downstream.map((d, i) => <span key={i} className="agent-tool" style={{ fontSize: 10.5 }}>{shortLbl(d)}</span>)}
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.05 }}>Legend</div>
            <div className="col" style={{ gap: 6, fontSize: 11.5 }}>
              {[
                ['#34d058', 'trigger / return / loop closed'],
                ['#6f8cff', 'agent'],
                ['#2b6cb0', 'process step (code)'],
                ['#caa53d', 'decision / loop'],
                ['#9a6cff', 'Edge Function (JWT)'],
                ['#2bb0a8', 'LLM · Claude Sonnet 4.6'],
                ['#f85149', 'stop / fallback / skip'],
                ['#b8860b', 'persisted table'],
              ].map(([c, label]) => (
                <div key={label} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: c, flexShrink: 0 }} />
                  <span className="muted">{label}</span>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="muted" style={{ fontSize: 10.5, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                Edit <span className="code">diagrams/agents/{def.file}</span> in the repo to update this diagram.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Workflows tab ─────────────────────────────────────────────────────
function WorkflowsTab({ canEdit }) {
  // Pin MoM, Task and Escalation flows to the top; keep the rest in place.
  const PINNED = ['wf-mom', 'wf-task', 'wf-escalation'];
  const flows = [...(window.CDC.CODEX_WORKFLOWS || [])].sort((a, b) => {
    const ai = PINNED.indexOf(a.id), bi = PINNED.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const [selected, setSelected] = useStCx(null);
  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, padding: '0 4px' }}>
        Each flow renders from the same <span className="code">workflow_defs</span> record the engine runs. Edit goes through validate-then-activate.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {flows.map((f) => (
          <div key={f.id} className="card card-pad" onClick={() => setSelected(f)} style={{ cursor: 'default' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>{f.name}</strong>
              <Pill tone="outline">{f.version}</Pill>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              <strong>Trigger:</strong> {f.trigger}
            </div>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              <strong style={{ marginRight: 4 }}>Agents:</strong>
              {f.agents.map((a, i) => <span key={i} className="agent-tool">{a}</span>)}
            </div>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
              <strong style={{ marginRight: 4 }}>Outputs:</strong>
              {f.outputs.map((o, i) => <span key={i} className="code" style={{ fontSize: 10.5 }}>{o}</span>)}
            </div>
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <button className="btn" data-size="sm" data-variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(f); }}>View flow →</button>
              {canEdit && <button className="btn" data-size="sm" data-variant="ghost"><Icon name="edit" size={11} /> Edit</button>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || ''} width={680}>
        {selected && (
          <div className="col" style={{ gap: 12 }}>
            <dl className="kv">
              <dt>Version</dt><dd className="mono">{selected.version}</dd>
              <dt>Trigger</dt><dd>{selected.trigger}</dd>
              <dt>Agents</dt><dd>{selected.agents.join(' → ')}</dd>
              <dt>Outputs</dt><dd>{selected.outputs.map((o) => <span key={o} className="code" style={{ marginRight: 6 }}>{o}</span>)}</dd>
            </dl>
            {selected.objective && (
              <div><strong style={{ fontSize: 12.5 }}>Objective:</strong> <span className="muted" style={{ fontSize: 12.5 }}>{selected.objective}</span></div>
            )}
            {selected.steps && (() => {
              const doneCount = selected.steps.filter((s) => s.done).length;
              return (
                <div className="col" style={{ gap: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>Flow steps</strong>
                    <Pill tone={doneCount === selected.steps.length ? 'green' : 'amber'}>{doneCount}/{selected.steps.length} done</Pill>
                  </div>
                  {selected.steps.map((s) => (
                    <div key={s.n} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'var(--panel)', borderRadius: 6, opacity: s.done ? 1 : 0.6 }}>
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, background: s.done ? 'var(--green-soft)' : 'var(--border)', color: s.done ? 'var(--green)' : 'var(--text-muted)' }}>
                        {s.done ? <Icon name="check" size={11} stroke={2.4} /> : s.n}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <strong style={{ fontSize: 12.5 }}>{s.title}</strong>
                          <Pill tone={s.done ? 'green' : 'outline'} dot>{s.done ? 'done' : 'pending'}</Pill>
                        </div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="muted" style={{ fontSize: 12, padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
              <strong>Edit-then-validate flow:</strong> changes to the workflow definition run against a synthetic input in beta first. Passes the smoke test → activate. Fails → diff shown to author, change not applied.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Guidelines tab ─────────────────────────────────────────────────────
function GuidelinesTab({ canEdit, nav }) {
  const items = window.CDC.CODEX_GUIDELINES;
  const [selected, setSelected] = useStCx(items[0]);
  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, padding: '0 4px' }}>
        Versioned rules the agents enforce. Every edit creates a <span className="code">reference_revision</span> row. Curator-proposed edits show <strong>source = Curator proposal gp-X</strong>.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
        <div className="col" style={{ gap: 6 }}>
          {items.map((g) => (
            <div key={g.id} className="list-row" data-active={selected?.id === g.id} onClick={() => setSelected(g)}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                <strong style={{ fontSize: 13 }}>{g.name}</strong>
                <Pill tone="outline">{g.version}</Pill>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>updated {g.updated}</div>
            </div>
          ))}
        </div>

        <Card pad={false}>
          {selected && (
            <>
              <div className="detail-h">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{selected.name}</h3>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      <span className="mono">{selected.id}</span> · {selected.version} · updated {selected.updated} by {window.CDC.lookup.user(selected.updatedBy)?.name}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Pill tone="accent">{selected.source}</Pill>
                  </div>
                </div>
              </div>
              <div className="detail-b">
                <div style={{ fontSize: 13.5, lineHeight: 1.6, padding: '0 0 16px' }}>{selected.summary}</div>

                <div className="detail-section">Version history</div>
                <div className="col" style={{ gap: 8 }}>
                  {generateHistory(selected).map((h, i) => (
                    <div key={i} className="list-row">
                      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <Pill tone="outline">{h.version}</Pill>
                        <span className="mono muted" style={{ fontSize: 11 }}>{h.date}</span>
                        <span style={{ flex: 1 }} />
                        <span className="muted" style={{ fontSize: 11.5 }}>{h.who}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{h.change}</div>
                      <div className="row" style={{ gap: 4, fontSize: 11, marginTop: 4 }}>
                        <span className="muted" style={{ fontSize: 11 }}>source:</span>
                        <Pill tone="outline">{h.source}</Pill>
                      </div>
                    </div>
                  ))}
                </div>

                {canEdit && (
                  <div className="row" style={{ gap: 8, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 18 }}>
                    <button className="btn" data-size="sm"><Icon name="edit" size={11} /> Propose edit</button>
                    <button className="btn" data-size="sm" data-variant="ghost"><Icon name="sheet" size={11} /> Export markdown</button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function generateHistory(g) {
  const v = parseInt(g.version.slice(1), 10);
  const hist = [];
  for (let i = v; i >= 1; i--) {
    hist.push({
      version: `v${i}`,
      date: i === v ? g.updated : `2026-0${5 - (v - i)}-${10 + (v - i) * 4}`,
      who: i === v ? (window.CDC.lookup.user(g.updatedBy)?.name || 'Admin') : (i % 2 === 0 ? 'Pavan G' : 'Curator (proposed)'),
      change: i === v ? g.summary.slice(0, 90) + '…' : i === 1 ? 'Initial version' : `Refined section ${i}: clarified ${i === 2 ? 'scope' : i === 3 ? 'priorities' : 'edge cases'}.`,
      source: i === v ? g.source : (i % 2 === 0 ? 'Manual edit' : `Curator proposal gp-${i}`),
    });
  }
  return hist;
}
