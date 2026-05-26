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
    "What blockers are over 3 days old?",
    "Why is Content health at 78?",
    "Which KPIs are red and getting worse?",
    "Summarize Backend's last week",
    "What needs my attention today?",
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
    try {
      // Real call to Claude Haiku.
      answer = await window.claude.complete({
        messages: [
          { role: 'user', content: `${sys}\n\nUser question: ${q}\n\nRespond now.` },
        ],
      });
    } catch (e) {
      answer = `[error] Could not reach the model: ${e.message}. Falling back to a scripted answer.\n\nBased on the most recent reports, the top items that need attention are the Backend missing-reports streak [f-1] and the Safari 17.4 chart flicker P0 [r-1006]. The Content health score is 78 [t-5].`;
    }
    // Simulate stream-in
    await fakeStream(answer, (partial) => setStreamText(partial));

    setMessages((m) => [...m, {
      role: 'assistant', content: answer,
      ts: timeNow(),
      meta: {
        model: 'claude-haiku-4-5',
        latency: 412 + Math.round(Math.random() * 600),
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
              <Pill tone="accent" dot>claude-haiku-4-5</Pill>
            </div>
            <div className="h-subtitle" style={{ fontSize: 12 }}>
              Grounded in <strong>{corpus.reportCount}</strong> reports, <strong>{corpus.kpiCount}</strong> KPIs, <strong>{corpus.taskCount}</strong> tasks, <strong>{corpus.flagCount}</strong> flags · scope: <span className="mono code">{scopeLabelFor(currentUser)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" data-size="sm"><Icon name="plug" size={12} /> Connect Claude Desktop</button>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => { setMessages([]); setStreamText(''); }}>Clear</button>
          </div>
        </div>
      </div>

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

            <div style={{ marginTop: 32 }} className="card card-pad">
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
          <Msg key={i} m={m} confidence={tweaks.confidence} />
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

KNOWLEDGE BASE (Codex — use for how-to / process / "what does agent X do" / guideline questions; name the guideline/workflow/agent instead of a [id] token):
GUIDELINES:
${glLines}

WORKFLOWS:
${wfLines}

AGENTS:
${agLines}
${noteLines ? `\nVAULT NOTES (human-authored, from Obsidian):\n${noteLines}\n` : ''}
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
