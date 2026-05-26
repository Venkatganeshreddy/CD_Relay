// CD-Copilot — User-side end-of-day report submission flow.
// Conversational chat dashboard that captures: emp_id → products → stack →
// (output category → count → template → time → status → reason?) loop → done.

const { useState: useS, useEffect: useE, useRef: useR, useMemo: useM } = React;

// ── Catalog ─────────────────────────────────────────────────────────────
const PRODUCTS = [
  'NxtWave',
  'NIAT - B1', 'NIAT - B2',
  'Intensive Offline',
  'Academy',
  'Launchpad',
];

const STACKS = [
  'FS — Java', 'FS — Python', 'FS — MERN',
  'DS/ML', 'DSA', 'GenAI', 'English', 'Aptitude',
];

const OUTPUT_CATEGORIES = [
  'Content-Assessment Alignment',
  'Pedagogy Initiative',
  'TR-Doc',
  'PPT',
  'Video Session',
  'Projects',
  'Objective Content (Coding Q, MCQs)',
  'Other content format',
  'Branding Asset',
  'Vernacular Content',
  'Testing & Learning Portal Configurations',
  'Content Issue Resolution',
  'Agentic Workflow Initiative, R&D, Tools',
  'Feedback & Backpropagation',
  'Industry Upgrade',
  'Stakeholder Request Fulfillment',
  'Interviews/Offer roll-out',
  'Executive Reporting',
  'HR & Employee Engagement',
  'Upskilling & Learning hours',
  'Performance-Goal Management',
];

const STATUSES = ['In-progress', 'Done', 'Blocked', 'Overdue'];

// Output category → Task category mapping
const OUTPUT_TO_TASK = {
  'Content-Assessment Alignment': 'Content Creation & Review',
  'Pedagogy Initiative': 'Learning Outcome Initiative',
  'TR-Doc': 'Content Creation & Review',
  'PPT': 'Content Creation & Review',
  'Video Session': 'Recording & Production',
  'Projects': 'Content Creation & Review',
  'Objective Content (Coding Q, MCQs)': 'Content Creation & Review',
  'Other content format': 'Content Creation & Review',
  'Branding Asset': 'Content Creation & Review',
  'Vernacular Content': 'Content Creation & Review',
  'Testing & Learning Portal Configurations': 'Process & Tooling',
  'Content Issue Resolution': 'Content Creation & Review',
  'Agentic Workflow Initiative, R&D, Tools': 'Process & Tooling',
  'Feedback & Backpropagation': 'Process & Tooling',
  'Industry Upgrade': 'Industry Review & Quality Check',
  'Stakeholder Request Fulfillment': 'Business Requests & Coordination',
  'Interviews/Offer roll-out': 'Hiring',
  'Executive Reporting': 'Reporting Analysis',
  'HR & Employee Engagement': 'Employee Engagement',
  'Upskilling & Learning hours': 'Learning Hours',
  'Performance-Goal Management': 'Assessment Analytics',
};

// Categories that DO NOT require output count
const COUNT_NA = new Set(['Executive Reporting', 'Stakeholder Request Fulfillment']);

// Templates per task category. Each field: { id, label, type, options?, placeholder? }
const TASK_TEMPLATES = {
  'Content Creation & Review': [
    { id: 'course', label: 'Course', type: 'text', ph: 'e.g. Fullstack — Java' },
    { id: 'module', label: 'Module', type: 'text', ph: 'e.g. Authentication' },
    { id: 'topic', label: 'Topic', type: 'text', ph: 'e.g. JWT refresh tokens' },
    { id: 'workflow', label: 'Agentic workflow used', type: 'text', ph: 'e.g. TR Doc Generator' },
    { id: 'mode', label: 'Mode', type: 'choice', options: ['Creation', 'Review'] },
  ],
  'Industry Review & Quality Check': [
    { id: 'course', label: 'Course', type: 'text', ph: 'e.g. DS&Algo' },
    { id: 'workflow', label: 'Agentic workflow used', type: 'text', ph: 'e.g. Industry Insight Generator' },
    { id: 'upgrade', label: 'Upgrade scale', type: 'choice', options: ['Patchwork', 'Minor', 'Major', 'Critical'] },
  ],
  'Recording & Production': [
    { id: 'course', label: 'Course', type: 'text', ph: 'e.g. Aptitude' },
    { id: 'module', label: 'Module', type: 'text', ph: 'e.g. Probability' },
    { id: 'topic', label: 'Topic', type: 'text', ph: 'e.g. Bayes theorem' },
    { id: 'workflow', label: 'Agentic workflow used', type: 'text', ph: 'e.g. Video Production Pipeline' },
    { id: 'stage', label: 'Stage', type: 'choice', options: ['Recording', 'Editing', 'Review'] },
  ],
  'Business Requests & Coordination': [
    { id: 'agenda', label: 'Agenda', type: 'text', ph: 'e.g. Q3 hiring forecast review' },
    { id: 'items', label: 'Priority action items', type: 'textarea', ph: 'One per line…' },
    { id: 'urgency', label: 'Urgency', type: 'choice', options: ['Patchwork', 'Minor', 'Major', 'Critical'] },
  ],
  'Process & Tooling': [
    { id: 'work', label: 'Work / feedback description', type: 'textarea', ph: 'What you built / what feedback you resolved…' },
    { id: 'tool', label: 'Tool used', type: 'text', ph: 'e.g. Claude Code' },
    { id: 'impact', label: 'Impact (0–5)', type: 'choice', options: ['0', '1', '2', '3', '4', '5'], hint: 'Only if Agentic Workflow / R&D / Tools output category' },
  ],
  'Hiring': [
    { id: 'role', label: 'Role name', type: 'text', ph: 'e.g. Sr Content Engineer — DS&ML' },
    { id: 'status', label: 'Interview status', type: 'choice', options: ['Sourced', 'Screened', 'Panel', 'Offer', 'Joined', 'Dropped'] },
  ],
  'Reporting Analysis': [
    { id: 'cadence', label: 'Reporting cadence', type: 'choice', options: ['Weekly', 'Monthly'] },
  ],
  'Employee Engagement': [
    { id: 'activity', label: 'Activity name', type: 'text', ph: 'e.g. Friday team lunch' },
    { id: 'purpose', label: 'Purpose', type: 'text', ph: 'e.g. Cross-team bonding' },
  ],
  'Learning Hours': [
    { id: 'skill', label: 'Skill / 1-on-1 / impact', type: 'text', ph: 'e.g. Vector DBs · self-study' },
    { id: 'usecase', label: 'Use-case / agenda', type: 'text', ph: 'e.g. Applying to RAG-lab v2' },
  ],
  'Assessment Analytics': [
    { id: 'bucket', label: 'Assessment bucket', type: 'choice', options: ['Skill', 'Academic', 'Interview Intelligence'] },
    { id: 'metric', label: 'Analysis metric / delta', type: 'text', ph: 'e.g. Pass-rate +4pts wow' },
  ],
  'Learning Outcome Initiative': [
    { id: 'initiative', label: 'Initiative name', type: 'text', ph: 'e.g. Adaptive problem ladder' },
    { id: 'usecase', label: 'Use-case', type: 'text', ph: 'e.g. DS&Algo cohort 4' },
    { id: 'impact', label: 'Impact (0–5)', type: 'choice', options: ['0', '1', '2', '3', '4', '5'] },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────
function empIdFor(user) {
  // The employee's real EMP ID (e.g. NW0002526) — auto-filled from the session.
  return user.empId || user.id;
}

const STEP_ORDER = ['greet', 'emp_id', 'product', 'stack', 'category', 'count', 'template', 'time', 'status', 'reason', 'another', 'done'];

// ── Main view ───────────────────────────────────────────────────────────
function SubmitView({ tweaks, currentUser, nav }) {
  const myEmpId = useM(() => empIdFor(currentUser), [currentUser.id]);
  const myStack = useM(() => window.CDC.stackForUser(currentUser), [currentUser.id]);

  // Session state
  const [tasks, setTasks] = useS([]);              // completed tasks this session
  const [current, setCurrent] = useS({});          // current task under construction
  const [step, setStep] = useS('greet');           // current step
  const [transcript, setTranscript] = useS([]);    // chat entries: { role, kind, text, payload? }
  const [isTyping, setTyping] = useS(false);

  const chatRef = useR(null);

  // Scroll to bottom on new messages
  useE(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [transcript.length, step, isTyping]);

  // Kick off intro
  useE(() => {
    if (transcript.length > 0) return;
    pushBot(`Hey ${currentUser.name.split(' ')[0]}! Let's capture today's work — should take under a minute.`);
    setTimeout(() => {
      pushBot(`First, confirm your EmpID? I've auto-filled it from your login.`);
      setStep('emp_id');
    }, 600);
  }, []);

  function pushBot(text, payload) {
    setTranscript((t) => [...t, { role: 'bot', text, payload }]);
  }
  function pushUser(text, kind = 'text') {
    setTranscript((t) => [...t, { role: 'user', text, kind }]);
  }
  async function typeThen(fn) {
    setTyping(true);
    await new Promise((r) => setTimeout(r, 380));
    setTyping(false);
    fn();
  }

  // Step handlers
  function onEmpIdSubmit() {
    pushUser(myEmpId);
    setCurrent((c) => ({ ...c, empId: myEmpId }));
    typeThen(() => {
      pushBot(`Got it. Which product-initiative(s) did you work on today? Multi-select.`);
      setStep('product');
    });
  }

  function onProductSubmit(selected) {
    pushUser(selected.join(' · '), 'chips');
    setCurrent((c) => ({ ...c, products: selected }));
    typeThen(() => {
      pushBot(`And the stack you worked in?`);
      setStep('stack');
    });
  }

  function onStackSubmit(selected) {
    pushUser(selected.join(' · '), 'chips');
    setCurrent((c) => ({ ...c, stacks: selected }));
    typeThen(() => {
      pushBot(tasks.length === 0 ? `What's the output category for your first task?` : `Logging the next task — what's the output category?`);
      setStep('category');
    });
  }

  function onCategorySubmit(cat) {
    pushUser(cat);
    const taskCategory = OUTPUT_TO_TASK[cat];
    setCurrent((c) => ({ ...c, outputCategory: cat, taskCategory }));
    typeThen(() => {
      if (COUNT_NA.has(cat)) {
        pushBot(`Skipping count — not applicable for "${cat}". What was achieved? Fill in the template below.`);
        setStep('template');
      } else {
        pushBot(`How many units of "${cat}" did you produce today? (Whole number)`);
        setStep('count');
      }
    });
  }

  function onCountSubmit(n) {
    pushUser(String(n));
    setCurrent((c) => ({ ...c, outputCount: n }));
    typeThen(() => {
      pushBot(`What was achieved? Fill in the template — it's tailored for "${OUTPUT_TO_TASK[current.outputCategory]}".`);
      setStep('template');
    });
  }

  function onTemplateSubmit(values) {
    const summary = Object.entries(values).map(([k, v]) => v).filter(Boolean).join(' · ');
    pushUser(summary || '(template completed)');
    setCurrent((c) => ({ ...c, template: values }));
    typeThen(() => {
      pushBot(`How many hours did you log on this task? (Decimals OK)`);
      setStep('time');
    });
  }

  function onTimeSubmit(hrs) {
    pushUser(`${hrs} hrs`);
    setCurrent((c) => ({ ...c, hours: hrs }));
    typeThen(() => {
      pushBot(`Status?`);
      setStep('status');
    });
  }

  function onStatusSubmit(status) {
    pushUser(status);
    setCurrent((c) => ({ ...c, status }));
    typeThen(() => {
      if (status === 'Blocked' || status === 'Overdue') {
        pushBot(`Got it. What's the reason it's ${status.toLowerCase()}?`);
        setStep('reason');
      } else {
        finishTaskAndAsk();
      }
    });
  }

  function onReasonSubmit(reason) {
    pushUser(reason);
    setCurrent((c) => ({ ...c, reason }));
    typeThen(finishTaskAndAsk);
  }

  function finishTaskAndAsk() {
    setCurrent((c) => {
      const finished = { ...c, id: `task-${Date.now()}` };
      // commit to tasks list
      setTasks((prev) => [...prev, finished]);
      return {};
    });
    pushBot(`Task logged. Want to log another or wrap up?`);
    setStep('another');
  }

  function onAnotherTask() {
    pushUser('Log another task');
    typeThen(() => {
      pushBot(`Great — what product-initiative was the next task on?`);
      setStep('product');
    });
  }

  function onWrapUp() {
    pushUser("That's all for today");
    typeThen(() => {
      pushBot(`Wrapped up. ${tasks.length} task${tasks.length === 1 ? '' : 's'} logged against ${myEmpId} for today.`);
      setStep('done');
      persistReport();
    });
  }

  // Assemble the session's tasks into a daily_reports row and persist it.
  function persistReport() {
    if (!tasks.length) return;
    const CDC = window.CDC;
    const today = CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10);
    const items = tasks.map((t) => {
      const s = (t.status || 'In-progress');
      const kind = /block/i.test(s) ? 'blocker' : /done/i.test(s) ? 'done' : /overdue/i.test(s) ? 'risk' : 'progress';
      const tmpl = t.template && typeof t.template === 'object' ? Object.values(t.template).filter(Boolean).join(' · ') : '';
      const text = `${t.outputCategory || 'Work'}${t.outputCount ? ` ×${t.outputCount}` : ''}${tmpl ? ` — ${tmpl}` : ''} · ${t.hours || '?'}h · ${s}${t.reason ? ` — ${t.reason}` : ''}`;
      return { kind, text };
    });
    const report = {
      id: `r-${Date.now()}`, author: currentUser.id, date: today, submittedAt: 'just now',
      sub: currentUser.sub || null, dept: currentUser.dept, validation: 'OK', confidence: 0.9,
      items, kpiHits: [], source: 'native_form',
    };
    if (CDC.db) CDC.db.addDailyReport(report);

    // One worklog per task (today) — drives Missing-reports + weekly/monthly rollups.
    tasks.forEach((t, i) => {
      const w = {
        id: `wl-${Date.now()}-${i}`, userId: currentUser.id, userName: currentUser.name, userInitials: currentUser.initials,
        empId: currentUser.id, dept: currentUser.dept, sub: currentUser.sub || null,
        date: today, daysAgo: 0,
        products: t.products || [], stacks: t.stacks || [myStack],
        outputCategory: t.outputCategory || 'Other', taskCategory: t.taskCategory || '',
        outputCount: t.outputCount || 0, template: t.template || {},
        hours: Number(t.hours) || 0, status: t.status || 'Done', reason: t.reason || '',
        submittedAt: 'just now',
      };
      if (CDC.db) CDC.db.addWorklog(w);
    });
  }

  function restart() {
    setTasks([]); setCurrent({}); setStep('greet'); setTranscript([]);
    setTimeout(() => {
      pushBot(`Hey ${currentUser.name.split(' ')[0]}! Let's capture today's work.`);
      typeThen(() => {
        pushBot(`First, confirm your EmpID?`);
        setStep('emp_id');
      });
    }, 80);
  }

  // ── Render ────────────────────────────────────────────────────────────
  const progressPct = step === 'done' ? 100 :
    step === 'greet' ? 4 :
    step === 'emp_id' ? 10 :
    step === 'product' ? 22 :
    step === 'stack' ? 32 :
    step === 'category' ? 44 :
    step === 'count' ? 54 :
    step === 'template' ? 66 :
    step === 'time' ? 76 :
    step === 'status' ? 84 :
    step === 'reason' ? 90 :
    step === 'another' ? 96 : 0;

  return (
    <div className="fadein">
      <SectionHeader
        title="Day-end check-in"
        subtitle={`${weekdayLabel()} · ${timeStr()} · Logged for ${currentUser.name} (${myEmpId})`}
        actions={
          <>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('dashboard')}>Skip · go to dashboard</button>
            {step === 'done' && <button className="btn" data-size="sm" onClick={restart}><Icon name="refresh" size={12} /> New session</button>}
          </>
        }
      />

      <div className="submit-banner">
        <div className="banner-icon"><Icon name="clock" size={14} /></div>
        <div style={{ flex: 1 }}>
          <div className="banner-title">5:30 PM nudge · capture what you accomplished today</div>
          <div className="banner-sub">Logs against EmpID for tonight's intake. Pavan G sees the rollup in tomorrow's 06:00 IST digest.</div>
        </div>
        <Pill tone="accent" dot>auto-saving</Pill>
      </div>

      <div className="progress-track" style={{ marginBottom: 12 }}>
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="submit-layout">
        {/* Chat column */}
        <div ref={chatRef} className="chat-stream" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', paddingRight: 12 }}>
          {transcript.map((m, i) => (
            <Message key={i} m={m} />
          ))}

          {isTyping && (
            <div className="bot-bubble fadein">
              <div className="bot-avatar">cd</div>
              <div className="bot-content"><div className="typing"><span /><span /><span /></div></div>
            </div>
          )}

          {/* Active input card sits at end of chat */}
          {!isTyping && step !== 'done' && step !== 'greet' && (
            <ActiveInputCard
              step={step}
              currentTask={current}
              myEmpId={myEmpId}
              myStack={myStack}
              onEmpIdSubmit={onEmpIdSubmit}
              onProductSubmit={onProductSubmit}
              onStackSubmit={onStackSubmit}
              onCategorySubmit={onCategorySubmit}
              onCountSubmit={onCountSubmit}
              onTemplateSubmit={onTemplateSubmit}
              onTimeSubmit={onTimeSubmit}
              onStatusSubmit={onStatusSubmit}
              onReasonSubmit={onReasonSubmit}
              onAnotherTask={onAnotherTask}
              onWrapUp={onWrapUp}
            />
          )}

          {step === 'done' && (
            <DoneCard tasks={tasks} myEmpId={myEmpId} restart={restart} />
          )}
        </div>

        {/* Side rail */}
        <SessionRail tasks={tasks} current={current} step={step} currentUser={currentUser} />
      </div>
    </div>
  );
}
window.SubmitView = SubmitView;

// ── Message renderer ────────────────────────────────────────────────────
function Message({ m }) {
  if (m.role === 'bot') {
    return (
      <div className="bot-bubble fadein">
        <div className="bot-avatar">cd</div>
        <div className="bot-content">
          <div className="bot-name">Relay</div>
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className={`user-bubble fadein ${m.kind === 'chips' ? 'user-chips' : ''}`}>
      {m.text}
    </div>
  );
}

// ── Active step input ───────────────────────────────────────────────────
function ActiveInputCard(props) {
  const { step } = props;
  return (
    <div className="bot-bubble fadein">
      <div className="bot-avatar" style={{ background: 'var(--accent)' }}>↳</div>
      <div className="bot-content" style={{ background: 'var(--panel)', borderColor: 'var(--accent-border)' }}>
        {step === 'emp_id' && <EmpIdInput {...props} />}
        {step === 'product' && <ProductInput {...props} />}
        {step === 'stack' && <StackInput {...props} />}
        {step === 'category' && <CategoryInput {...props} />}
        {step === 'count' && <CountInput {...props} />}
        {step === 'template' && <TemplateInput {...props} />}
        {step === 'time' && <TimeInput {...props} />}
        {step === 'status' && <StatusInput {...props} />}
        {step === 'reason' && <ReasonInput {...props} />}
        {step === 'another' && <AnotherInput {...props} />}
      </div>
    </div>
  );
}

// Each input keeps its own local state, calls the parent submit when ready.

function EmpIdInput({ myEmpId, onEmpIdSubmit }) {
  const [v, setV] = useS(myEmpId);
  return (
    <div>
      <div className="input-row">
        <input className="input-text" data-size="lg" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn" data-variant="primary" onClick={onEmpIdSubmit}>Confirm <Icon name="arrow-up" size={12} /></button>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Pre-filled from session. Press Enter to confirm.</div>
    </div>
  );
}

function ProductInput({ onProductSubmit }) {
  const [sel, setSel] = useS([]);
  const toggle = (p) => setSel((s) => s.includes(p) ? s.filter((x) => x !== p) : [...s, p]);
  return (
    <div>
      <div className="chip-grid">
        {PRODUCTS.map((p) => (
          <div key={p} className="chip" data-selected={sel.includes(p)} onClick={() => toggle(p)}>
            {sel.includes(p) && <Icon name="check" size={10} stroke={2.4} />}
            <span>{p}</span>
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{sel.length} selected</span>
        <button className="btn" data-variant="primary" disabled={sel.length === 0} onClick={() => onProductSubmit(sel)}>Next <Icon name="arrow-up" size={11} /></button>
      </div>
    </div>
  );
}

function StackInput({ onStackSubmit, myStack }) {
  // One stack per report — locked to the reporter's sub-team (no cross-team mixing).
  const stack = myStack || 'General';
  return (
    <div>
      <div className="chip-grid">
        <div className="chip" data-selected={true}>
          <Icon name="check" size={10} stroke={2.4} />
          <span>{stack}</span>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>Your stack (from your sub-team)</span>
        <button className="btn" data-variant="primary" onClick={() => onStackSubmit([stack])}>Confirm <Icon name="arrow-up" size={11} /></button>
      </div>
    </div>
  );
}

function CategoryInput({ onCategorySubmit }) {
  const [sel, setSel] = useS(null);
  const [search, setSearch] = useS('');
  const filtered = OUTPUT_CATEGORIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div className="input-row" style={{ marginTop: 0 }}>
        <input className="input-text" placeholder="Search categories…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="chip-grid" style={{ marginTop: 10, maxHeight: 220, overflowY: 'auto', padding: 2 }}>
        {filtered.map((c) => (
          <div key={c} className="chip" data-selected={sel === c} onClick={() => setSel(c)}>
            {sel === c && <Icon name="check" size={10} stroke={2.4} />}
            <span>{c}</span>
          </div>
        ))}
        {filtered.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 4 }}>No matches.</div>}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{sel ? `Task category: ${OUTPUT_TO_TASK[sel]}` : 'Pick one.'}</span>
        <button className="btn" data-variant="primary" disabled={!sel} onClick={() => onCategorySubmit(sel)}>Next <Icon name="arrow-up" size={11} /></button>
      </div>
    </div>
  );
}

function CountInput({ onCountSubmit }) {
  const [v, setV] = useS('');
  const n = parseInt(v, 10);
  return (
    <div className="input-row">
      <input className="input-text" data-size="lg" type="number" min="0" step="1" placeholder="0" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))} />
      <button className="btn" data-variant="primary" disabled={isNaN(n) || n < 0} onClick={() => onCountSubmit(n)}>Next <Icon name="arrow-up" size={12} /></button>
    </div>
  );
}

function TemplateInput({ currentTask, onTemplateSubmit }) {
  const fields = TASK_TEMPLATES[currentTask.taskCategory] || [];
  const [vals, setVals] = useS(() => Object.fromEntries(fields.map((f) => [f.id, ''])));
  const allFilled = fields.every((f) => (vals[f.id] || '').toString().trim().length > 0);
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <Pill tone="accent" dot>{currentTask.taskCategory}</Pill>
        <span className="muted" style={{ fontSize: 11.5 }}>Output: {currentTask.outputCategory}</span>
      </div>
      <div className="template-form">
        {fields.map((f) => (
          <React.Fragment key={f.id}>
            <label>{f.label}</label>
            {f.type === 'text' && (
              <input className="field-input" placeholder={f.ph} value={vals[f.id]} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))} />
            )}
            {f.type === 'textarea' && (
              <textarea className="field-input" style={{ height: 64, padding: 8, resize: 'vertical' }} placeholder={f.ph} value={vals[f.id]} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))} />
            )}
            {f.type === 'choice' && (
              <div className="seg" style={{ justifySelf: 'start' }}>
                {f.options.map((o) => (
                  <button key={o} type="button" data-active={vals[f.id] === o} onClick={() => setVals((v) => ({ ...v, [f.id]: o }))}>{o}</button>
                ))}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{fields.filter((f) => (vals[f.id] || '').toString().trim()).length} of {fields.length} filled</span>
        <button className="btn" data-variant="primary" disabled={!allFilled} onClick={() => onTemplateSubmit(vals)}>Next <Icon name="arrow-up" size={11} /></button>
      </div>
    </div>
  );
}

function TimeInput({ onTimeSubmit }) {
  const [v, setV] = useS('');
  const n = parseFloat(v);
  const quick = [0.5, 1, 2, 4, 6, 8];
  return (
    <div>
      <div className="input-row">
        <input className="input-text" data-size="lg" type="number" min="0" step="0.25" placeholder="e.g. 2.5" value={v} onChange={(e) => setV(e.target.value)} />
        <span className="muted" style={{ fontSize: 12 }}>hours</span>
        <button className="btn" data-variant="primary" disabled={isNaN(n) || n <= 0} onClick={() => onTimeSubmit(n)}>Next <Icon name="arrow-up" size={12} /></button>
      </div>
      <div className="chip-grid" style={{ marginTop: 10 }}>
        {quick.map((q) => (
          <div key={q} className="chip" onClick={() => setV(String(q))}>{q} hr{q === 1 ? '' : 's'}</div>
        ))}
      </div>
    </div>
  );
}

function StatusInput({ onStatusSubmit }) {
  return (
    <div className="chip-grid">
      {STATUSES.map((s) => (
        <div key={s} className="chip" onClick={() => onStatusSubmit(s)} style={{ minWidth: 110, justifyContent: 'center', cursor: 'default' }}>
          <span className="dot" data-tone={
            s === 'Done' ? 'green' : s === 'In-progress' ? 'blue' : s === 'Blocked' ? 'red' : 'amber'
          } />
          {s}
        </div>
      ))}
    </div>
  );
}

function ReasonInput({ onReasonSubmit }) {
  const [v, setV] = useS('');
  return (
    <div>
      <textarea
        autoFocus
        placeholder="What's blocking / making it overdue?"
        value={v}
        onChange={(e) => setV(e.target.value)}
        style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
      />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn" data-variant="primary" disabled={!v.trim()} onClick={() => onReasonSubmit(v.trim())}>Next <Icon name="arrow-up" size={11} /></button>
      </div>
    </div>
  );
}

function AnotherInput({ onAnotherTask, onWrapUp }) {
  return (
    <div className="dual-cta">
      <div className="cta-card" onClick={onAnotherTask}>
        <Icon name="check" size={16} />
        <div className="cta-title">Log another task</div>
        <div className="cta-sub">Start a new task in this session</div>
      </div>
      <div className="cta-card" data-primary="true" onClick={onWrapUp}>
        <Icon name="arrow-up" size={16} />
        <div className="cta-title">That's all for today</div>
        <div className="cta-sub">Wrap up and submit · see you tomorrow</div>
      </div>
    </div>
  );
}

// ── Done card ───────────────────────────────────────────────────────────
function DoneCard({ tasks, myEmpId, restart }) {
  const totalHrs = tasks.reduce((s, t) => s + (t.hours || 0), 0);
  return (
    <div className="celebrate fadein" style={{ alignSelf: 'stretch' }}>
      <div className="check"><Icon name="check" size={28} stroke={2.5} /></div>
      <h2>Logged. See you tomorrow 👋</h2>
      <p>{tasks.length} task{tasks.length === 1 ? '' : 's'} · {totalHrs.toFixed(1)} hrs · against <span className="mono">{myEmpId}</span></p>
      <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: 'center' }}>
        <button className="btn" data-size="sm">View today's report</button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={restart}><Icon name="refresh" size={12} /> Edit & resubmit</button>
      </div>
    </div>
  );
}

// ── Session rail ────────────────────────────────────────────────────────
function SessionRail({ tasks, current, step, currentUser }) {
  const totalHrs = tasks.reduce((s, t) => s + (t.hours || 0), 0);
  const inProgress = step !== 'done' && step !== 'greet' && Object.keys(current).length > 0;
  return (
    <aside className="session-rail">
      <div>
        <h4>This session</h4>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }} className="mono">{tasks.length}</div>
          <span className="muted" style={{ fontSize: 11.5 }}>task{tasks.length === 1 ? '' : 's'} logged</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }} className="mono">{totalHrs.toFixed(1)}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>hrs</span></div>
          <span className="muted" style={{ fontSize: 11.5 }}>logged today</span>
        </div>
      </div>

      <div className="divider" />

      {tasks.length === 0 && !inProgress && (
        <div className="muted" style={{ fontSize: 12 }}>
          Tasks you log will appear here. Pick up where you left off any time during the day.
        </div>
      )}

      {tasks.map((t, i) => (
        <div key={t.id} className="task-card fadein">
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="mono faint" style={{ fontSize: 10.5 }}>#{i + 1}</span>
            <Pill tone={t.status === 'Done' ? 'green' : t.status === 'In-progress' ? 'blue' : t.status === 'Blocked' ? 'red' : 'amber'} dot>{t.status}</Pill>
            <span className="mono faint" style={{ marginLeft: 'auto', fontSize: 10.5 }}>{t.hours} hr</span>
          </div>
          <div className="task-title">{t.outputCategory}</div>
          <div className="task-meta">
            <span>{t.products?.join(' · ') || '—'}</span>
          </div>
          {t.template && (
            <div className="faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
              {Object.entries(t.template).slice(0, 2).map(([k, v]) => v).filter(Boolean).join(' · ')}
            </div>
          )}
          {t.reason && (
            <div style={{ fontSize: 11, marginTop: 4, padding: '4px 6px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 4 }}>
              Reason: {t.reason}
            </div>
          )}
        </div>
      ))}

      {inProgress && step !== 'another' && step !== 'done' && (
        <div className="task-card" style={{ borderStyle: 'dashed', background: 'var(--accent-soft)', borderColor: 'var(--accent-border)' }}>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="mono faint" style={{ fontSize: 10.5 }}>#{tasks.length + 1}</span>
            <Pill tone="accent" dot>in progress</Pill>
          </div>
          <div className="task-title">{current.outputCategory || 'New task'}</div>
          <div className="task-meta">
            {current.products && <span>{current.products.join(' · ')}</span>}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>step: {step}</div>
        </div>
      )}

      <div className="divider" />

      <div>
        <h4>Yesterday</h4>
        <div className="task-card" style={{ background: 'var(--surface)' }}>
          <div className="row" style={{ gap: 6 }}>
            <Pill tone="green">submitted</Pill>
            <span className="mono faint" style={{ fontSize: 10.5, marginLeft: 'auto' }}>3 tasks · 7.5 hrs</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>Logged at 18:14 IST — included in this morning's digest.</div>
        </div>
      </div>

      <div className="divider" />

      <div>
        <h4>Submitting as</h4>
        <div className="row" style={{ gap: 10, marginTop: 6 }}>
          <Avatar user={currentUser} size={28} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{currentUser.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>{currentUser.title}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function weekdayLabel() {
  return 'Thursday, May 22';
}
function timeStr() {
  return '5:32 PM IST';
}
