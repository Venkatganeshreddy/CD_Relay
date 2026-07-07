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
  // Roadmap review wizard (interactive question cards over the open draft).
  const [rmOpen, setRmOpen] = useState_c(false);
  const [corpusTick, setCorpusTick] = useState_c(0);   // bump to re-derive corpus (e.g. after finalize)

  function handleKeyChange(val) {
    setApiKey(val);
    if (val) localStorage.setItem('relay_openrouter_key', val);
    else localStorage.removeItem('relay_openrouter_key');
  }

  // Build the in-scope corpus (RBAC applied)
  const corpus = useMemo_c(() => buildCorpus(currentUser), [currentUser, corpusTick]);

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
  // One-stop trigger categories — each rides the same grounded chat + confirm
  // gate; a future category is one more entry here + its context block.
  const categories = [
    corpus.draft && { label: '🗺 Roadmap review', wizard: true },
    { label: '🧠 Meetings', prompt: 'What did we decide in recent meetings, and which action items are still open?' },
    { label: '📊 Team performance', prompt: 'How did my team perform this month — hours logged, tasks done vs blocked, and KPI status?' },
    { label: '🚧 Blockers', prompt: 'Any blockers or overdue tasks right now?' },
  ].filter(Boolean);
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
    let answer = '', run = null; // run = { content, model, usage, path } from the tier chain
    const t0 = Date.now();
    try {
      run = await window.claude.complete({
        messages: [
          { role: 'user', content: `${sys}\n\nUser question: ${q}\n\nRespond now.` },
        ],
      });
      answer = run.content;
    } catch (e) {
      answer = `[error] Could not reach the model right now (${e.message}). Try again in a moment, or ask your L3 if it keeps failing.`;
    }
    const latencyMs = Date.now() - t0;
    // Split any proposed write-actions out of the visible answer.
    const { text: clean, actions } = parseActions(answer);

    // Real model call (not the offline shim) → log it to AI runs like any agent.
    if (run && (run.path === 'edge' || run.path === 'direct') && CDC.agents && CDC.agents.logRun) {
      CDC.agents.logRun({
        agent: 'Concierge', model: run.model, latencyMs, usage: run.usage,
        input: `Q: ${q.slice(0, 120)}`, output: clean,
      });
    }
    await fakeStream(clean, (partial) => setStreamText(partial));

    setMessages((m) => [...m, {
      role: 'assistant', content: clean, actions,
      ts: timeNow(),
      meta: {
        model: (run && run.model) || 'claude-sonnet-4-6',
        latency: latencyMs,
        confidence: 0.82 + Math.random() * 0.12,
        scopeHash: scopeHashFor(currentUser),
        tokens: {
          in: (run && run.usage && run.usage.prompt_tokens) || 1240,
          out: (run && run.usage && run.usage.completion_tokens) || Math.round(answer.length / 4),
        },
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
              Answers &amp; actions across your scope · <span className="mono code">{scopeLabelFor(currentUser)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span title={serverLLM ? 'Using the shared server key (relay-agent Edge Function) — no personal key needed.' : hasKey ? 'Using your personal OpenRouter key.' : 'No model reachable — add an OpenRouter key.'}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5, background: (serverLLM || hasKey) ? 'var(--accent-soft)' : 'var(--panel)', border: '1px solid ' + ((serverLLM || hasKey) ? 'var(--accent-border)' : 'var(--border)'), color: (serverLLM || hasKey) ? 'var(--accent)' : 'var(--text-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: (serverLLM || hasKey) ? 'var(--accent)' : 'var(--text-faint)' }} />
              {(serverLLM || hasKey) ? 'Connected' : 'Offline'}
            </span>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setShowKeyInput((v) => !v)}>
              <Icon name="plug" size={12} /> API key
            </button>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => { setMessages([]); setStreamText(''); setActState({}); }}>Clear</button>
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
        {rmOpen && corpus.draft && (
          <RoadmapReview draft={corpus.draft} user={currentUser}
            onClose={() => setRmOpen(false)}
            onChanged={() => setCorpusTick((t) => t + 1)}
            onDiscuss={(q) => { setRmOpen(false); setInput(q); if (composerRef.current) composerRef.current.focus(); }} />
        )}
        {messages.length === 0 && !pending && !rmOpen && (
          <div className="fadein" style={{ maxWidth: 720, alignSelf: 'center', width: '100%', padding: '40px 16px' }}>
            <div className="row" style={{ gap: 10, marginBottom: 4 }}>
              <Icon name="sparkles" size={20} />
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Ask anything about your scope.</div>
            </div>
            <div className="muted" style={{ marginBottom: 24 }}>Every claim cites a report, KPI, task, or flag. Hover a citation to see the source.</div>

            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {categories.map((c) => (
                <span key={c.label} className="suggested-q" style={{ fontWeight: 600, borderColor: 'var(--accent-border)' }}
                  onClick={() => (c.wizard ? setRmOpen(true) : ask(c.prompt))}>{c.label}</span>
              ))}
            </div>

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
    case 'update_roadmap_draft': return `Update roadmap draft ${a.draftId} (${Object.keys(a.patch || {}).join(', ') || 'no fields'})`;
    case 'finalize_roadmap': return `Finalize roadmap ${a.draftId} → create next month's goals`;
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
    case 'update_roadmap_draft': {
      const d = (CDC.ROADMAP_DRAFTS || []).find((x) => x.id === a.draftId);
      if (!d) throw new Error(`draft ${a.draftId} not found`);
      if (d.status === 'FINAL') throw new Error('draft already finalized');
      const patch = { ...(a.patch || {}) };
      if (patch.status && patch.status !== 'IN_REVIEW') delete patch.status;   // FINAL only via finalize_roadmap
      if (!patch.status && (d.status || 'DRAFT') === 'DRAFT') patch.status = 'IN_REVIEW';
      const r = await CDC.db.updateRoadmapDraft(a.draftId, patch);
      if (!r.remoteOk) throw new Error('save failed — draft may be outside your scope');
      // L2 edits feed Curator → Planner memory (the standing learning loop).
      CDC.db.logInteraction({ agent: 'Planner', flow: 'roadmap', inputRef: a.draftId, action: 'edit',
        final: JSON.stringify(a.patch || {}).slice(0, 500), userId: user.id });
      return { msg: 'Draft updated.' };
    }
    case 'finalize_roadmap': {
      const d = (CDC.ROADMAP_DRAFTS || []).find((x) => x.id === a.draftId);
      if (!d) throw new Error(`draft ${a.draftId} not found`);
      if (d.status === 'FINAL') throw new Error('already finalized');
      const ym = String(d.month || '').slice(0, 7);
      const base = a.draftId.replace(/^rd-/, 'goal-');
      let n = 0;
      for (let i = 0; i < (d.goals || []).length; i++) {
        const g = d.goals[i];
        if (!g || !g.title) continue;
        const gid = `${base}-${i + 1}`;                                        // deterministic → re-confirm is idempotent
        if ((CDC.GOALS || []).some((x) => x.id === gid)) continue;
        await CDC.db.addGoal({ id: gid, sub: d.sub, dept: d.dept, title: g.title, month: ym,
          deliverables: (g.deliverables || []).map((t, j) => ({ id: `${gid}-d${j + 1}`, text: String(t), assignees: [] })) });
        n++;
      }
      const r = await CDC.db.updateRoadmapDraft(a.draftId, { status: 'FINAL', finalizedBy: user.id });
      if (!r.remoteOk) throw new Error(`${n} goals created but the draft could not be marked FINAL — confirm finalize again`);
      CDC.db.logInteraction({ agent: 'Planner', flow: 'roadmap', inputRef: a.draftId, action: 'accept', userId: user.id });
      return { msg: `${n} goal${n === 1 ? '' : 's'} created for ${ym}; roadmap finalized.` };
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

// ── Roadmap review wizard — interactive question cards over the open draft ──
// Deterministic UI driven by the draft data (no LLM in the loop): recap card →
// one question card at a time (quick-answer buttons + free text) → wrap-up
// with a two-click finalize. Answers persist to roadmap_drafts.qaLog through
// the same db helper the chat actions use; blocked/escalated detail stays
// collapsed to counts (the noise complaint this UI exists to fix).
function RoadmapReview({ draft, user, onClose, onChanged, onDiscuss }) {
  const d = draft;
  const [started, setStarted] = useState_c(false);
  const [text, setText] = useState_c('');
  const [busy, setBusy] = useState_c(false);
  const [err, setErr] = useState_c('');
  const [armFinal, setArmFinal] = useState_c(false);
  const [finMsg, setFinMsg] = useState_c('');
  const [tick, setTick] = useState_c(0);          // re-render after in-place draft mutations

  const qs = (d.questions || [])
    .map((q) => (typeof q === 'string' ? { text: q, options: [] } : { text: q.text || '', options: q.options || [] }))
    .filter((q) => q.text);
  const answered = new Set((d.qaLog || []).map((x) => x.q));
  const open = qs.filter((q) => !answered.has(q.text));
  const q = open[0];
  const diff = d.executionDiff || [];
  const cnt = (k) => diff.filter((f) => String(f.kind || '').toLowerCase() === k).length;
  const topFindings = (d.findings || []).slice(0, 3);
  const month = String(d.month || '').slice(0, 7);

  async function answer(a) {
    const val = String(a || '').trim();
    if (!val || busy || !q) return;
    setBusy(true); setErr('');
    const patch = { qaLog: [...(d.qaLog || []), { q: q.text, a: val }] };
    if ((d.status || 'DRAFT') === 'DRAFT') patch.status = 'IN_REVIEW';
    const r = await window.CDC.db.updateRoadmapDraft(d.id, patch);
    if (!r.remoteOk) setErr('Could not save — the draft may be outside your scope.');
    setText(''); setBusy(false); setTick(tick + 1);
  }

  async function finalize() {
    setBusy(true); setErr('');
    try {
      const r = await executeAction({ type: 'finalize_roadmap', draftId: d.id }, user);
      setFinMsg(r.msg);
    } catch (e) { setErr(e.message || String(e)); setArmFinal(false); }
    setBusy(false);
  }

  const chipBtn = { fontSize: 12.5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)' };
  const statPill = (label, n, tone) => <Pill key={label} tone={tone}>{label} {n}</Pill>;

  return (
    <div className="card card-pad fadein" style={{ margin: '14px 0', borderLeft: '3px solid var(--accent)', maxWidth: 720, alignSelf: 'center', width: '100%' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <Icon name="sparkles" size={14} />
        <strong style={{ fontSize: 13.5, flex: 1 }}>Roadmap review — {month} · {d.sub}</strong>
        <Pill tone={d.status === 'FINAL' ? 'green' : 'accent'} dot>{d.status || 'DRAFT'}</Pill>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={onClose}>Close</button>
      </div>

      {finMsg ? (
        <div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>✅ {finMsg}</div>
          <button className="btn" data-size="sm" data-variant="primary" onClick={() => { onChanged(); onClose(); }}>Done</button>
        </div>
      ) : !started ? (
        <div>
          {d.headline && <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{d.headline}</div>}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {statPill('✓ done', cnt('done'), 'green')}
            {statPill('◐ partial', cnt('partial'), 'amber')}
            {statPill('✗ missed', cnt('missed'), 'red')}
            <Pill tone="outline">{open.length} question{open.length === 1 ? '' : 's'} to review</Pill>
          </div>
          {topFindings.length > 0 && (
            <div className="col" style={{ gap: 5, marginBottom: 12 }}>
              {topFindings.map((f, i) => (
                <div key={i} className="row" style={{ gap: 7, alignItems: 'flex-start', fontSize: 12.5 }} title={f.consequence ? `If it repeats: ${f.consequence}` : ''}>
                  <Pill tone={f.kind === 'strength' ? 'green' : f.kind === 'opportunity' ? 'accent' : 'amber'}>{f.kind || 'finding'}</Pill>
                  <span style={{ flex: 1 }}>{String(f.text || '').slice(0, 160)}</span>
                </div>
              ))}
              {(d.findings || []).length > 3 && <span className="muted" style={{ fontSize: 11.5 }}>+{(d.findings || []).length - 3} more findings — ask in chat for any of them</span>}
            </div>
          )}
          <button className="btn" data-size="sm" data-variant="primary" onClick={() => setStarted(true)}>
            {open.length ? 'Start review →' : 'Review draft goals →'}
          </button>
        </div>
      ) : q ? (
        <div>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Question {qs.length - open.length + 1} of {qs.length}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 12 }}>{q.text}</div>
          {q.options.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {q.options.map((o) => (
                <span key={o} style={{ ...chipBtn, opacity: busy ? 0.5 : 1 }} onClick={() => answer(o)}>{o}</span>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={busy}
              placeholder={q.options.length ? 'or answer in your own words…' : 'Your answer…'}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); answer(text); } }}
              style={{ flex: 1, fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' }} />
            <button className="btn" data-size="sm" data-variant="primary" disabled={busy || !text.trim()} onClick={() => answer(text)}>Send</button>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 11.5, cursor: 'pointer' }} onClick={() => onDiscuss(`About this roadmap question: "${q.text}" — `)}>💬 discuss this one in chat instead</span>
          </div>
          {err && <div style={{ color: 'var(--red, #f85149)', fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>All questions answered. Draft goals for <strong>{month}</strong>:</div>
          <div className="col" style={{ gap: 6, marginBottom: 12 }}>
            {(d.goals || []).map((g, i) => (
              <div key={i} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <strong>{i + 1}. {g.title}</strong>
                {(g.deliverables || []).length > 0 && <span className="muted"> — {(g.deliverables || []).join('; ').slice(0, 140)}</span>}
              </div>
            ))}
            {(d.goals || []).length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>(no draft goals — add them in chat before finalizing)</span>}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            {!armFinal
              ? <button className="btn" data-size="sm" data-variant="primary" onClick={() => setArmFinal(true)} disabled={busy}>Finalize roadmap…</button>
              : <>
                  <button className="btn" data-size="sm" data-variant="primary" onClick={finalize} disabled={busy}>{busy ? 'Finalizing…' : `Confirm — create ${(d.goals || []).length} goals for ${month}`}</button>
                  <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setArmFinal(false)} disabled={busy}>Back</button>
                </>}
            <span className="muted" style={{ fontSize: 11.5, cursor: 'pointer' }} onClick={() => onDiscuss('Before finalizing the roadmap, I want to change: ')}>💬 edit goals in chat first</span>
          </div>
          {err && <div style={{ color: 'var(--red, #f85149)', fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
      )}
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
    draft: openDraftFor(user),
    moms: momsFor(user),
  };
}

// Meetings in the user's scope — mirrors sb_scopeFilter().mom in
// views-relay.jsx (file-local there, so restated: dept match or leadership).
function momsFor(user) {
  const CDC = window.CDC;
  const seesAll = ['L3', 'Admin'].includes(user.level)
    || ['ADMIN', 'PRODUCT_OWNER'].includes(user.role) || user.crossDept;
  const deptIds = new Set((CDC.filterDepartments(user.id) || []).map((d) => d.id));
  return (CDC.MOMS || []).filter((m) => seesAll || !m.dept || deptIds.has(m.dept));
}

// Newest open Roadmap Planner draft in the user's scope (none → no PLANNING
// block, no roadmap actions, no Roadmap chip — zero token cost when idle).
function openDraftFor(user) {
  const s = window.CDC.scopeForUser(user.id);
  return (window.CDC.ROADMAP_DRAFTS || [])
    .filter((d) => ['DRAFT', 'IN_REVIEW'].includes(d.status || 'DRAFT'))
    .filter((d) => s.kind === 'all' || (s.kind === 'dept' && d.dept === s.dept) || (s.kind === 'sub' && d.sub === s.sub))
    .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0] || null;
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
  const todayStr = CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10);
  const wlName = (w) => (CDC.lookup.user(w.userId || w.empId) || {}).name || w.userName || w.userId || '—';
  const wlToday = wls.filter((w) => w.date === todayStr);
  const todayBy = {};
  wlToday.forEach((w) => { const n = wlName(w); todayBy[n] = (todayBy[n] || 0) + (Number(w.hours) || 0); });
  const todayRoll = Object.keys(todayBy).length
    ? Object.entries(todayBy).map(([n, h]) => `${n} (${h}h)`).join(', ')
    : 'nobody has logged today yet';
  const wlRecent = wls.slice(0, 40).map((w) => `${w.date} · ${wlName(w)} · ${w.hours || 0}h · ${w.outputCategory || w.taskCategory || '—'} · ${w.status || ''}`).join('\n');
  const wlBlock = `Worklogs in scope: ${wls.length} total. Logged TODAY (${todayStr}): ${todayRoll}.\nRecent entries (date · person · hours · category · status):\n${wlRecent}`;

  // Meeting memory (Second Brain) — makes meetings queryable in chat:
  // "what did we decide about X", "who owns Y", "what's still open from Z".
  const momLines = (corpus.moms || []).slice(0, 20).map((m) => {
    const summ = typeof m.summary === 'string' ? m.summary : Object.values(m.summary || {}).join(' ');
    // Live shape: {text, status, owner, ownerName, due}. Open items matter most —
    // list them first (up to 12), then compress done items to a count.
    const ai = m.actionItems || [];
    const fmt = (it) => {
      const who = it.ownerName || (CDC.lookup.user(it.ownerId || it.owner) || {}).name || it.owner || '';
      return `[open] ${String(it.text || '').slice(0, 90)}${who ? ` (${who}` : ''}${it.due ? `${who ? ', ' : ' ('}due ${it.due}` : ''}${who || it.due ? ')' : ''}`;
    };
    const openItems = ai.filter((it) => it.status !== 'done');
    const doneCount = ai.length - openItems.length;
    const items = openItems.slice(0, 12).map(fmt).join(' | ')
      + (openItems.length > 12 ? ` | …+${openItems.length - 12} more open` : '')
      + (doneCount ? ` | ${doneCount} done` : '');
    const att = (m.attendeesAll || []).map((a) => a.name).filter(Boolean).join(', ')
      || (m.attendees || []).map((id) => (CDC.lookup.user(id) || {}).name || id).join(', ');
    return `- "${m.title}" (${m.date || '?'})${m.continuesFrom ? ' [continues an earlier thread]' : ''} — attendees: ${att || '—'}\n  summary: ${String(summ).replace(/\s+/g, ' ').slice(0, 350)}${ai.length ? `\n  action items (${openItems.length} open / ${ai.length} total): ${items}` : ''}`;
  }).join('\n');

  // Roadmap Planner — the structured month-end curation conversation, injected
  // only while an open draft is in scope (tone per the department doctrine:
  // context before ask, one question at a time, draft-don't-decide).
  const d = corpus.draft;
  const planningBlock = !d ? '' : `
ROADMAP PLANNING — an open roadmap draft is in this user's scope. When the user wants to work on the roadmap, YOU drive the conversation.
Draft ${d.id} · status=${d.status || 'DRAFT'} · plans ${String(d.month || '').slice(0, 7)} for ${d.sub} · analyzed ${d.analysisMonth || ''}${d.lowData ? ' · LOW-DATA month — findings lean on KPIs and meeting decisions; say so when relevant' : ''}
HEADLINE: ${d.headline || '—'}
EXECUTION DIFF (planned vs done):
${(d.executionDiff || []).slice(0, 12).map((f) => `- (${f.kind}) ${f.text}`).join('\n') || '(none)'}
FINDINGS:
${(d.findings || []).slice(0, 12).map((f) => `- (${f.kind}) ${f.text}${f.consequence ? ` | if it repeats: ${f.consequence}` : ''}${f.decision ? ` | decision asked: ${f.decision}` : ''}`).join('\n') || '(none)'}
OPEN QUESTIONS — ask ONE at a time, in order, skipping any already answered in the QA LOG:
${(d.questions || []).slice(0, 6).map((q, i) => `${i + 1}. ${q.text || q}${(q.options || []).length ? ` [alternatives: ${q.options.join(' / ')}]` : ''}`).join('\n') || '(none)'}
DRAFT GOALS for ${String(d.month || '').slice(0, 7)} (numbered — the user edits these):
${(d.goals || []).slice(0, 12).map((g, i) => `${i + 1}. ${g.title} — ${(g.deliverables || []).join('; ') || '(no deliverables yet)'}${g.rationale ? ` (why: ${g.rationale})` : ''}`).join('\n') || '(none)'}
QA LOG: ${(d.qaLog || []).map((x) => `Q: ${x.q} → A: ${x.a}`).join(' | ') || '(none yet)'}
PLANNING RULES: open with the headline and a 2-3 sentence recap of the execution diff, then ask exactly ONE open question and stop — never dump the whole draft. Never enumerate blocked or escalated task lists — give counts plus the single most important item; the review cards carry the detail. Questions over instructions: make the lead articulate the plan. Direct but constructive; frame every risk as what happened → what happens if it repeats → the decision being asked. Refer to goals by their number/title, never raw ids. After each answer or goal edit, propose ONE update_roadmap_draft action recording it. You draft, the human decides — propose finalize_roadmap ONLY when the user explicitly says the plan is complete.
ADDITIONAL actions supported while this draft is open (same confirm-gated rules as above):
- {"type":"update_roadmap_draft","draftId":"${d.id}","patch":{"goals":[{"title":"..","deliverables":["..",".."],"rationale":".."}],"qaLog":[{"q":"..","a":".."}],"status":"IN_REVIEW"}} — patch keys REPLACE those keys on the draft, so ALWAYS send the FULL goals array / FULL qaLog. status may only be "IN_REVIEW".
- {"type":"finalize_roadmap","draftId":"${d.id}"} — only on explicit confirmation that the plan is complete.
`;

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

WORKLOGS (answer "who logged / what was logged / who logged today" from these):
${wlBlock}

NON-PAYROLL BUDGET:
${budgetLine}

MEETING MEMORY (Second Brain — answer "what did we decide / who owns / what's still pending from meetings" from these; reference meetings by their title and date, never by id tokens):
${momLines || '(no meetings recorded in scope yet)'}

KNOWLEDGE BASE (Codex — use for how-to / process / "what does agent X do" / guideline questions; name the guideline/workflow/agent instead of a [id] token):
GUIDELINES:
${glLines}

WORKFLOWS:
${wfLines}

AGENTS:
${agLines}
${noteLines ? `\nVAULT NOTES (human-authored, from Obsidian):\n${noteLines}\n` : ''}${planningBlock}
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
