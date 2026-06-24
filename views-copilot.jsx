// CD-Copilot — Copilot Q&A view.
// Uses window.claude.complete with a grounded system prompt + scoped context.
// Output stream is parsed for [r-XXXX] / [k-XXXX] / [t-XXXX] / [f-XXXX] citation tokens
// and rendered as Cite chips with hover popovers to the source.

const { useState: useState_c, useRef: useRef_c, useEffect: useEffect_c, useMemo: useMemo_c } = React;

function CopilotView({ tweaks, currentUser, nav, initialPrompt }) {
  const CDC = window.CDC;
  const [messages, setMessages] = useState_c([]);
  const [input, setInput] = useState_c('');
  const [pending, setPending] = useState_c(false);
  const [streamText, setStreamText] = useState_c('');
  const composerRef = useRef_c(null);
  const scrollRef = useRef_c(null);
  const [apiKey, setApiKey] = useState_c(() => localStorage.getItem('relay_openrouter_key') || '');
  const [showKeyInput, setShowKeyInput] = useState_c(false);
  const [actState, setActState] = useState_c({});   // `${msgIdx}-${actIdx}` → { status, msg }
  const hasKey = !!apiKey;

  // Run one proposed action after the user confirms it.
  async function runAction(key, a) {
    setActState((s) => ({ ...s, [key]: { status: 'running' } }));
    try {
      const r = await executeAction(a, currentUser);
      setActState((s) => ({ ...s, [key]: { status: 'done', msg: r.msg } }));
    } catch (e) {
      setActState((s) => ({ ...s, [key]: { status: 'error', msg: e.message || String(e) } }));
    }
  }
  // Signed in with the relay-agent Edge Function available → the key never
  // leaves the server; hide the personal-key fallback entirely (it only
  // exists for offline/demo use).
  const serverLLM = !!(window.__RELAY && window.__RELAY.authed && window.CDC.agents && window.CDC.agents.available());

  function handleKeyChange(val) {
    setApiKey(val);
    if (val) localStorage.setItem('relay_openrouter_key', val);
    else localStorage.removeItem('relay_openrouter_key');
  }

  // Build the in-scope corpus (RBAC applied)
  const corpus = useMemo_c(() => buildCorpus(currentUser), [currentUser]);

  useEffect_c(() => {
    if (initialPrompt && messages.length === 0) {
      setInput(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect_c(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  const suggested = [
    "What needs my attention today?",
    "Any blockers or overdue tasks right now?",
    "How do I submit my daily report?",
    "What does the Rollup agent do?",
    "Walk me through the weekly rollup process",
  ];
  // Example write-commands — prefill the composer so the user edits the names /
  // numbers, then sends. Every change is still Confirm-gated before it runs.
  const actionExamples = [
    "Mark <task> as Done",
    "Create a task for <person>: <what>, due 2026-07-10",
    "Set <task> numbers: iterations 5, accuracy 92, output 120",
    "Set the OpenRouter budget for CSI&CO to ₹40000",
    "Mark <task> as Blocked — waiting on review",
  ];

  async function ask(q) {
    if (!q.trim() || pending) return;
    const userMsg = { role: 'user', content: q, ts: timeNow() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setPending(true);
    setStreamText('');

    const sys = buildSystemPrompt(corpus, currentUser);
    let answer = '';
    const t0 = Date.now();
    try {
      answer = await window.claude.complete({
        messages: [
          { role: 'user', content: `${sys}\n\nUser question: ${q}\n\nRespond now.` },
        ],
      });
    } catch (e) {
      answer = `[error] Could not reach the model right now (${e.message}). Try again in a moment, or ask your L3 if it keeps failing.`;
    }
    const latencyMs = Date.now() - t0;
    // Split any proposed write-actions out of the visible answer.
    const { text: clean, actions } = parseActions(answer);
    await fakeStream(clean, (partial) => setStreamText(partial));

    setMessages((m) => [...m, {
      role: 'assistant', content: clean, actions,
      ts: timeNow(),
      meta: {
        model: 'claude-sonnet-4-6',
        latency: latencyMs,
        confidence: 0.82 + Math.random() * 0.12,
        scopeHash: scopeHashFor(currentUser),
        tokens: { in: 1240, out: Math.round(answer.length / 4) },
      },
    }]);
    setStreamText('');
    setPending(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)' }}>
      <div style={{ padding: '16px 24px 6px', borderBottom: '1px solid var(--border)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <Icon name="sparkles" size={16} />
              <h1 className="h-title" style={{ fontSize: 18 }}>Concierge</h1>
              <Pill tone="accent" dot>claude-sonnet-4-6</Pill>
            </div>
            <div className="h-subtitle" style={{ fontSize: 12 }}>
              Grounded in <strong>{corpus.reportCount}</strong> reports, <strong>{corpus.kpiCount}</strong> KPIs, <strong>{corpus.taskCount}</strong> tasks, <strong>{corpus.flagCount}</strong> flags · scope: <span className="mono code">{scopeLabelFor(currentUser)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5, background: (serverLLM || hasKey) ? 'var(--accent-soft)' : 'var(--panel)', border: '1px solid ' + ((serverLLM || hasKey) ? 'var(--accent-border)' : 'var(--border)'), color: (serverLLM || hasKey) ? 'var(--accent)' : 'var(--text-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: (serverLLM || hasKey) ? 'var(--accent)' : 'var(--text-faint)' }} />
              {serverLLM ? 'LLM connected · server' : hasKey ? 'LLM connected' : 'offline mode'}
            </span>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setShowKeyInput((v) => !v)}>
              <Icon name="plug" size={12} /> API key
            </button>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => { setMessages([]); setStreamText(''); }}>Clear</button>
          </div>
        </div>
      </div>

      {showKeyInput && (
        <div style={{ padding: '6px 24px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>OpenRouter key{serverLLM ? ' (optional — server key in use)' : ''}:</span>
          <input type="password" value={apiKey} onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="sk-or-…" style={{ flex: 1, fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', fontFamily: 'monospace', color: 'var(--text)' }} />
          {apiKey && <button className="btn" data-size="sm" data-variant="ghost" onClick={() => handleKeyChange('')}>Clear</button>}
        </div>
      )}

      <div className="chat" ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        {messages.length === 0 && !pending && (
          <div className="fadein" style={{ maxWidth: 720, alignSelf: 'center', width: '100%', padding: '40px 16px' }}>
            <div className="row" style={{ gap: 10, marginBottom: 4 }}>
              <Icon name="sparkles" size={20} />
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Ask anything about your scope.</div>
            </div>
            <div className="muted" style={{ marginBottom: 24 }}>Every claim cites a report, KPI, task, or flag. Hover a citation to see the source.</div>

            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {suggested.map((q) => (
                <span key={q} className="suggested-q" onClick={() => ask(q)}>{q}</span>
              ))}
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="row" style={{ gap: 7, alignItems: 'center', marginBottom: 8 }}>
                <Icon name="sparkles" size={13} />
                <strong style={{ fontSize: 12.5 }}>…or tell me to make a change</strong>
                <span className="muted" style={{ fontSize: 11.5 }}>— I’ll show a Confirm button before anything is saved</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
                Update task status (the Day-end glance), create &amp; assign tasks, fill in glance numbers, edit budget or roster. Click an example to edit it, then send.
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {actionExamples.map((q) => (
                  <span key={q} className="suggested-q" style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}
                    onClick={() => { setInput(q); if (composerRef.current) composerRef.current.focus(); }}>{q}</span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 28 }} className="card card-pad">
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <Icon name="plug" size={14} />
                <strong style={{ fontSize: 13 }}>Use from Claude Desktop, Code, or Cursor</strong>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                Relay exposes an MCP server with 11 read-only tools. Drop this into your client config:
              </div>
              <pre className="code" style={{ display: 'block', padding: 12, background: 'var(--panel)', borderRadius: 6, fontSize: 11.5, overflow: 'auto', margin: 0 }}>{`{
  "mcpServers": {
    "cd-copilot": {
      "command": "npx",
      "args": ["@cd-copilot/mcp"],
      "env": { "CDC_TOKEN": "pat_••••••••••••" }
    }
  }
}`}</pre>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <React.Fragment key={i}>
            <Msg m={m} confidence={tweaks.confidence} />
            {(m.actions || []).map((a, j) => (
              <ActionCard key={j} action={a} state={actState[`${i}-${j}`]}
                onConfirm={() => runAction(`${i}-${j}`, a)}
                onDismiss={() => setActState((s) => ({ ...s, [`${i}-${j}`]: { status: 'skipped' } }))} />
            ))}
          </React.Fragment>
        ))}

        {pending && (
          <div className="msg msg-asst fadein">
            <CitedText text={streamText} />
            {streamText.length > 0 && <span className="cursor" />}
            {streamText.length === 0 && (
              <div className="row" style={{ gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                <div className="loading-bar"></div>
                Retrieving scoped records · running Sonnet…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="composer">
        <textarea
          ref={composerRef}
          placeholder={`Ask about ${currentUser.role === 'TEAM_MEMBER' ? 'your team' : currentUser.role === 'DEPARTMENT_LEAD' ? 'your department' : 'anything'}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
        />
        <button className="btn" data-variant="primary" disabled={!input.trim() || pending} onClick={() => ask(input)}>
          <Icon name="send" size={12} /> Ask
        </button>
      </div>
    </div>
  );
}
window.CopilotView = CopilotView;

// ── Agentic actions ──────────────────────────────────────────────────────
// The model may append a ```action [ ... ] ``` block when the user asks for a
// change. We split it from the visible answer, show a Confirm card per action,
// and only mutate via CDC.db after the user confirms.
function parseActions(text) {
  const m = /```action\s*([\s\S]*?)```/i.exec(text || '');
  if (!m) return { text: text || '', actions: [] };
  let actions = [];
  try { const j = JSON.parse(m[1].trim()); actions = Array.isArray(j) ? j : [j]; } catch (_) { /* malformed → no action */ }
  const clean = ((text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim()) || 'I’ve proposed the change below — confirm to apply.';
  return { text: clean, actions };
}

function describeAction(a) {
  const CDC = window.CDC;
  const tName = (id) => { const t = (CDC.TASKS || []).find((x) => x.id === id); return t ? `“${t.title}”` : id; };
  const uName = (id) => (CDC.lookup.user(id) || {}).name || id;
  const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join(', ');
  switch (a.type) {
    case 'update_task_status': return `Set task ${tName(a.taskId)} → ${a.status}${a.reason ? ` (${a.reason})` : ''}`;
    case 'create_task': return `Create task “${a.title}” for ${uName(a.owner)}${a.outputCategory ? ` · ${a.outputCategory}` : ''}${a.due ? ` · due ${a.due}` : ''}`;
    case 'fill_task_numbers': return `Update numbers on ${tName(a.taskId)}: ${kv(a.fields)}`;
    case 'update_budget': return `Set budget ${a.id} planned → ₹${Number(a.planned).toLocaleString('en-IN')}`;
    case 'update_employee': return `Update ${uName(a.id)}: ${kv(a.patch)}`;
    default: return `Unsupported action: ${a.type}`;
  }
}

async function executeAction(a, user) {
  const CDC = window.CDC;
  const findTask = (id) => (CDC.TASKS || []).find((x) => x.id === id);
  switch (a.type) {
    case 'update_task_status': {
      if (!findTask(a.taskId)) throw new Error(`task ${a.taskId} not found`);
      await CDC.db.acknowledgeTask(a.taskId, { status: a.status, note: a.reason || '' });
      return { msg: `Status set to ${a.status}.` };
    }
    case 'fill_task_numbers': {
      const t = findTask(a.taskId); if (!t) throw new Error(`task ${a.taskId} not found`);
      await CDC.db.updateTaskFields(a.taskId, { template: { ...(t.template || {}), ...(a.fields || {}) } });
      return { msg: 'Numbers updated.' };
    }
    case 'create_task': {
      const owner = CDC.lookup.user(a.owner); if (!owner) throw new Error(`owner ${a.owner} not found`);
      const m = (CDC.TASK_CATALOG.OUTPUT_MAP || {})[a.outputCategory] || {};
      const today = CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10);
      const ST = { 'In-progress': 'ACTIVE', Done: 'DONE', Blocked: 'BLOCKED', Overdue: 'ACTIVE', Backlog: 'BACKLOG' };
      const id = `task-${Date.now()}`;
      await CDC.db.addTask({
        id, title: a.title, status: ST[a.status] || 'ACTIVE', reason: 'Manual (Concierge)', sourceReports: [],
        owner: a.owner, dept: owner.dept, created: today, due: a.due || null, source: 'manual', createdBy: user.id,
        products: [], stacks: [], outputCategory: a.outputCategory || null, taskCategory: m.task || '',
        activityCategory: m.activity || '', metricCategory: m.metric || '', outputCount: null, template: {},
        desc: a.details || '', estHours: null,
      });
      return { msg: `Task created for ${owner.name}.` };
    }
    case 'update_budget': {
      if (!CDC.db.updateNonpayroll) throw new Error('budget edits unavailable');
      await CDC.db.updateNonpayroll(a.id, { planned: Number(a.planned) });
      return { msg: 'Budget updated.' };
    }
    case 'update_employee': {
      await CDC.db.updateEmployee(a.id, a.patch || {});
      return { msg: 'Employee updated.' };
    }
    default: throw new Error(`unknown action ${a.type}`);
  }
}

function ActionCard({ action, state, onConfirm, onDismiss }) {
  const st = state && state.status;
  return (
    <div className="card card-pad" style={{ margin: '8px 0', borderLeft: '3px solid var(--accent)' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Icon name="sparkles" size={13} />
        <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{describeAction(action)}</span>
        {!st && <>
          <button className="btn" data-size="sm" data-variant="ghost" onClick={onDismiss}>Cancel</button>
          <button className="btn" data-size="sm" data-variant="primary" onClick={onConfirm}>Confirm</button>
        </>}
        {st === 'running' && <span className="muted" style={{ fontSize: 11 }}>applying…</span>}
        {st === 'done' && <Pill tone="green" dot>applied</Pill>}
        {st === 'skipped' && <Pill tone="muted" dot>cancelled</Pill>}
        {st === 'error' && <Pill tone="red" dot>failed</Pill>}
      </div>
      {state && state.msg && <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>{state.msg}</div>}
    </div>
  );
}

function Msg({ m, confidence }) {
  if (m.role === 'user') {
    return (
      <div className="msg msg-user fadein">
        {m.content}
      </div>
    );
  }
  // assistant
  return (
    <div className="msg msg-asst fadein">
      <CitedText text={m.content} />
      <div className="msg-meta">
        <span className="mono">{m.meta?.model}</span>
        <span>·</span>
        <span>{m.meta?.latency} ms</span>
        <span>·</span>
        <span>{m.meta?.tokens?.in} → {m.meta?.tokens?.out} tok</span>
        <span>·</span>
        <span className="mono">scope {m.meta?.scopeHash}</span>
        <span style={{ marginLeft: 'auto' }}>
          <ConfChip value={m.meta?.confidence} show={confidence} />
        </span>
      </div>
    </div>
  );
}

// Parse [r-NNN]/[k-NNN]/[t-NNN]/[f-NNN] citation tokens out of text and
// render as Cite chips. Numbered in order of first appearance.
function CitedText({ text }) {
  const tokenRe = /\[(r-\d+|k-\d+|t-\d+|f-\d+)\]/g;
  const order = [];
  let m; while ((m = tokenRe.exec(text))) { if (!order.includes(m[1])) order.push(m[1]); }
  const numFor = (id) => order.indexOf(id) + 1;

  const parts = [];
  let lastIdx = 0;
  tokenRe.lastIndex = 0;
  while ((m = tokenRe.exec(text))) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push({ id: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));

  return (
    <div className="markdown">
      {renderMarkdownLite(parts)}
    </div>
  );
}

function renderMarkdownLite(parts) {
  // parts is mixed: strings and {id} objects.
  // Split string parts on \n\n into paragraphs, then on **bold**.
  const out = [];
  let buf = [];

  function flush() {
    if (buf.length === 0) return;
    out.push(<p key={`p-${out.length}`}>{buf}</p>);
    buf = [];
  }
  parts.forEach((part, idx) => {
    if (typeof part === 'string') {
      const segs = part.split('\n\n');
      segs.forEach((seg, si) => {
        if (si > 0) flush();
        // bold parse
        const bsegs = seg.split(/(\*\*[^*]+\*\*)/g);
        bsegs.forEach((b, bi) => {
          if (b.startsWith('**') && b.endsWith('**')) {
            buf.push(<strong key={`b-${idx}-${si}-${bi}`}>{b.slice(2, -2)}</strong>);
          } else {
            // newlines inside paragraph become <br/>
            const lines = b.split('\n');
            lines.forEach((ln, li) => {
              if (li > 0) buf.push(<br key={`br-${idx}-${si}-${bi}-${li}`} />);
              buf.push(ln);
            });
          }
        });
      });
    } else {
      buf.push(<CiteInline key={`c-${idx}`} sourceId={part.id} />);
    }
  });
  flush();
  return out;
}

function CiteInline({ sourceId }) {
  return <Cite n={sourceId.split('-')[1]} sourceId={sourceId} lookupFn={(id) => resolveCitation(id)} />;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function buildCorpus(user) {
  const CDC = window.CDC;
  const reports = CDC.filterReports(user.id);
  const kpis = CDC.filterKpis(user.id);
  const tasks = CDC.filterTasks(user.id);
  const flags = CDC.filterFlags(user.id);
  return {
    reports, kpis, tasks, flags,
    reportCount: reports.length, kpiCount: kpis.length,
    taskCount: tasks.length, flagCount: flags.length,
  };
}

function scopeLabelFor(user) {
  const s = window.CDC.scopeForUser(user.id);
  if (s.kind === 'all') return 'all departments';
  if (s.kind === 'dept') return `dept=${window.CDC.lookup.dept(s.dept)?.name || s.dept}`;
  if (s.kind === 'sub') return `dept=${window.CDC.lookup.dept(s.dept)?.name}, sub=${s.sub}`;
  return 'none';
}
function scopeHashFor(user) {
  const s = window.CDC.scopeForUser(user.id);
  // toy stable hash
  const str = `${user.role}-${s.dept || ''}-${s.sub || ''}`;
  let h = 0; for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h).toString(16).slice(0, 6);
}

function buildSystemPrompt(corpus, user) {
  // We pass a compact, structured slice of the data so the LLM can answer with
  // grounded citation tokens. The instructions force [id] format and forbid
  // claims without a citation.
  const reportLines = corpus.reports.slice(0, 14).map((r) => {
    const a = window.CDC.lookup.author(r.author);
    const items = r.items.map((it) => `${it.kind}:${it.text}`).join(' | ');
    return `[${r.id}] ${r.date} ${a?.sub || ''} (${a?.name || ''}) conf=${r.confidence} items: ${items || '(none)'} validation=${r.validation}`;
  }).join('\n');
  const kpiLines = corpus.kpis.map((k) => `[${k.id}] ${k.name} ${k.current}${k.unit || ''}/target ${k.target}${k.unit || ''} status=${k.status} trend=${k.trend?.join(',')}`).join('\n');
  const taskLines = corpus.tasks.map((t) => `[${t.id}] ${t.title} status=${t.status} reason=${t.reason}`).join('\n');
  const flagLines = corpus.flags.map((f) => `[${f.id}] severity=${f.severity} ${f.title}: ${f.detail}`).join('\n');

  // Knowledge layer (Codex) — global how-to / process / agent reference.
  const CDC = window.CDC;
  const glLines = (CDC.CODEX_GUIDELINES || []).map((g) => `- ${g.name} (${g.version}): ${g.summary}`).join('\n');
  const wfLines = (CDC.CODEX_WORKFLOWS || []).map((w) => `- ${w.name}: trigger=${w.trigger}; agents=${(w.agents || []).join(', ')}; outputs=${(w.outputs || []).join(', ')}`).join('\n');
  const agLines = (CDC.RELAY_AGENTS || []).map((a) => `- ${a.name}: ${a.job} (trigger: ${a.trigger}, autonomy ${a.autonomy})`).join('\n');
  // Human-authored vault notes ingested via Obsidian round-trip.
  const noteLines = (CDC.KNOWLEDGE || []).filter((d) => d.type === 'note' || d.source === 'vault' && d.type === 'note')
    .map((d) => `- ${d.title}: ${(d.body || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
  // People (for resolving owners by name → emp id in actions), budget + worklogs.
  const peopleLines = (CDC.USERS || []).map((u) => `[${u.id}] ${u.name} · ${u.level} · ${u.sub || u.dept}`).join('\n');
  const npe = (CDC.filterNonpayroll ? CDC.filterNonpayroll(user.id) : []) || [];
  const npeTotal = npe.reduce((s, r) => s + (Number(r.planned) || 0), 0);
  const budgetLine = npe.length
    ? `Non-payroll budget: ${npe.length} rows, total ₹${npeTotal.toLocaleString('en-IN')}. Sample rows: ${npe.slice(0, 12).map((r) => `[${r.id}] ${r.tool}/${r.category}/${r.period} ₹${r.planned}`).join(' ; ')}`
    : 'No non-payroll budget rows in scope.';
  const wls = (CDC.filterWorklogs ? CDC.filterWorklogs(user.id) : []) || [];
  const wlLine = `Worklogs in scope: ${wls.length} entries.`;

  return `You are Relay, an internal AI assistant for a department operating copilot.
The current user is ${user.name} (role=${user.role}). Their RBAC scope is: ${scopeLabelFor(user)}.

You have ONLY the following records in scope. Do not invent facts. Every claim about reports/KPIs/tasks/flags MUST be supported by a citation token like [r-1001], [k-1], [t-2], [f-3].

REPORTS:
${reportLines}

KPIS:
${kpiLines}

TASKS:
${taskLines}

DATA QUALITY FLAGS:
${flagLines}

PEOPLE (use the [emp-id] when an action needs an owner/employee):
${peopleLines}

WORKLOGS: ${wlLine}

NON-PAYROLL BUDGET:
${budgetLine}

KNOWLEDGE BASE (Codex — use for how-to / process / "what does agent X do" / guideline questions; name the guideline/workflow/agent instead of a [id] token):
GUIDELINES:
${glLines}

WORKFLOWS:
${wfLines}

AGENTS:
${agLines}
${noteLines ? `\nVAULT NOTES (human-authored, from Obsidian):\n${noteLines}\n` : ''}
ACTIONS — you can CHANGE data when the user explicitly asks (e.g. "mark X done", "create a task for Y", "set the budget…"). When (and only when) the user requests a change, write a one-line confirmation sentence, then append a fenced code block whose info string is exactly "action" containing a JSON array. Use EXACT ids from the data above. The app shows the user a Confirm button before anything runs, so NEVER say a change is already done. Supported actions:
- {"type":"update_task_status","taskId":"task-..","status":"In-progress|Done|Blocked|Overdue|Backlog","reason":"required if Blocked/Overdue/Backlog"}
- {"type":"create_task","owner":"NW....","title":"..","outputCategory":"<an output category>","due":"YYYY-MM-DD","status":"In-progress","details":".."}
- {"type":"fill_task_numbers","taskId":"task-..","fields":{"iterations":5,"accuracy":92,"outputs":120}}
- {"type":"update_budget","id":"npe-..","planned":50000}
- {"type":"update_employee","id":"NW....","patch":{"sub":"..","managerId":"NW..","title":"..","email":".."}}
Emit ONE block with an array of the requested actions. For pure questions, do NOT emit an action block. Example:
\`\`\`action
[{"type":"update_task_status","taskId":"task-123","status":"Done"}]
\`\`\`

Format rules:
- Be concise. 3–6 short sentences max, OR a tight bulleted list.
- For data claims (reports/KPIs/tasks/flags), end each with a citation token, e.g. [r-1006]. For process/how-to/agent answers, ground in the Knowledge Base and name the source.
- Use **bold** for key names/values.
- If asked something with no record in scope and not in the Knowledge Base, say so and suggest who to ask (e.g. their L3).
- Do NOT speculate. Do not include preambles like "Based on the data". Get to the point.`;
}

function timeNow() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

async function fakeStream(text, onPartial) {
  // Stream-in animation only; the actual model returned the full text already.
  const chunks = text.match(/.{1,8}/gs) || [];
  let acc = '';
  for (const c of chunks) {
    acc += c;
    onPartial(acc);
    await new Promise((r) => setTimeout(r, 12));
  }
}
