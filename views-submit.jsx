// CD-Copilot — User-side end-of-day report submission flow.
// Conversational chat dashboard that captures: emp_id → products → stack →
// (output category → count → template → time → status → reason?) loop → done.

const { useState: useS, useEffect: useE, useRef: useR, useMemo: useM } = React;

// ── Day-end glance view ─────────────────────────────────────────────────
// Lightweight 6:00 PM snapshot: the signed-in user reviews their open tasks,
// updates only the status (and adds a reason if Blocked / Overdue / Backlog),
// and saves. Acknowledgement writes lastAckDate; the server-side escalation
// engine (supabase/09_escalation.sql) walks tasks that miss the daily ack and
// climbs the manager_id graph (L1 → L2 → L3) when the threshold is hit.
// Minutes since midnight in IST, regardless of the viewer's local timezone.
function istMinutesNow() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return (+p.hour) * 60 + (+p.minute);
}
const GLANCE_OPENS_AT = 18 * 60;  // 6:00 PM IST
const GLANCE_CLOSES_AT = 20 * 60; // 8:00 PM IST — window shuts; open tasks escalate

// Shared snapshot-window state so the dashboard banner and the Day-end glance
// agree: 'before' (countdown to 6 PM), 'open' (6–8 PM), 'after' (closed).
function snapshotPhase() {
  const nowMin = istMinutesNow();
  const phase = nowMin < GLANCE_OPENS_AT ? 'before' : nowMin >= GLANCE_CLOSES_AT ? 'after' : 'open';
  return { phase, minsToOpen: GLANCE_OPENS_AT - nowMin };
}
window.CDC.snapshotPhase = snapshotPhase;

function GlanceView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const todayStr = CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10);
  const mine = (CDC.TASKS || []).filter((t) =>
    t.owner === currentUser.id && ['ACTIVE', 'BLOCKED', 'ESCALATED', 'BACKLOG'].includes(t.status));
  const pending = mine.filter((t) => t.lastAckDate !== todayStr).length;

  // A 30s tick keeps the window state (and the unlock/close moment) fresh.
  const [, setTick] = useS(0);
  const [creating, setCreating] = useS(false);
  useE(() => { const id = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(id); }, []);
  const { phase, minsToOpen: minsLeft } = snapshotPhase();
  const fmtH = (mins) => `${Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)}h ` : ''}${mins % 60}m`;

  // L1/L0 contributors add their own tasks here; the new task (owned by them)
  // immediately appears below for the 6 PM status snapshot.
  function createTask(form) {
    const m = (CDC.TASK_CATALOG.OUTPUT_MAP || {})[form.outputCategory] || {};
    const tmplSummary = form.template ? Object.values(form.template).filter(Boolean).join(' · ') : '';
    const title = (form.title && form.title.trim()) ||
      `${form.outputCategory || 'Task'}${form.outputCount ? ` ×${form.outputCount}` : ''}${tmplSummary ? ` — ${tmplSummary}` : ''}`;
    const STATUS_MAP = { 'In-progress': 'ACTIVE', 'Done': 'DONE', 'Blocked': 'BLOCKED', 'Overdue': 'ACTIVE', 'Backlog': 'BACKLOG' };
    const status = STATUS_MAP[form.status] || 'ACTIVE';
    const task = {
      id: `task-${Date.now()}`, title, status, reason: 'Manual', sourceReports: [],
      owner: currentUser.id, dept: currentUser.dept, created: todayStr, due: form.due || null,
      confidence: null, source: 'manual', createdBy: currentUser.id,
      products: form.products || [], stacks: form.stacks || [], stack: (form.stacks || [])[0] || null,
      outputCategory: form.outputCategory || null, taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? null, template: form.template || {},
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : null,
      blockReason: form.reason || '',
    };
    if (status === 'BLOCKED') { task.blockedAt = new Date().toISOString(); task.escalIdx = 0; task.escalatedTo = currentUser.managerId || null; }
    CDC.db.addTask(task);
    // Mirror the task into a worklog so the day's work shows up LIVE in the
    // manager dashboard, the worklogs page, and weekly/monthly rollups — all of
    // which read WORKLOGS. Hours come from the estimate; status keeps the label.
    CDC.db.addWorklog({
      id: `wl-${Date.now()}`, userId: currentUser.id, userName: currentUser.name, userInitials: currentUser.initials,
      empId: currentUser.id, dept: currentUser.dept, sub: currentUser.sub || null, date: todayStr, daysAgo: 0,
      products: form.products || [], stacks: form.stacks || [],
      outputCategory: form.outputCategory || 'Other', taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? 0, template: form.template || {},
      hours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : 0,
      status: form.status || 'In-progress', reason: form.reason || '', submittedAt: 'just now',
    });
    // Nudge: how many hours are left to reach the 8h day.
    const dayHrs = (CDC.WORKLOGS || []).filter((w) => w.userId === currentUser.id && w.daysAgo === 0).reduce((s, w) => s + (Number(w.hours) || 0), 0);
    const target = CDC.DAILY_TARGET_HRS || 8;
    const left = target - dayHrs;
    if (CDC.toast) CDC.toast(
      left > 0.01
        ? `Logged ${dayHrs.toFixed(1)}h today — ${left.toFixed(1)}h left to reach your ${target}h day. Add another task to fill it.`
        : `Logged ${dayHrs.toFixed(1)}h today — you've completed your ${target}h day. 🎉`,
      left > 0.01 ? 'amber' : 'green');
    setCreating(false);
    setTick((x) => x + 1);
  }

  const addBtn = (variant) => (
    <button className="btn" data-size="sm" data-variant={variant} onClick={() => setCreating(true)}>
      <Icon name="check" size={11} /> Add task
    </button>
  );

  return (
    <div className="fadein">
      <SectionHeader
        title="Day-end glance"
        subtitle={`The 6:00 PM check-in (open 6:00–8:00 PM IST). Add your tasks for today, then set each one's status; add a reason if blocked. Tasks left unacknowledged when the window closes escalate up the manager graph.`}
        actions={
          <>
            <Pill tone={phase !== 'open' ? 'neutral' : pending ? 'amber' : 'green'} dot>
              {phase === 'before' ? 'opens 6:00 PM IST' : phase === 'after' ? 'closed (8:00 PM)' : pending ? `${pending} awaiting ack` : 'all acknowledged'}
            </Pill>
            {phase === 'open' && mine.length > 0 && addBtn('ghost')}
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('my-tasks')}>
              <Icon name="tasks" size={11} /> Open Tasks
            </button>
          </>
        }
      />
      {phase === 'before' ? (
        <div className="empty" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🕕</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>The 6:00 PM snapshot isn't open yet</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Opens in {fmtH(minsLeft)} (at 18:00 IST) and closes at 20:00 IST.
            {mine.length > 0 && ` You have ${mine.length} open task${mine.length === 1 ? '' : 's'} to review then.`}
            {' '}Until then you can update tasks anytime from My Tasks.
          </div>
        </div>
      ) : phase === 'after' ? (
        <div className="empty" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🌙</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>The 6:00 PM snapshot has closed for today</div>
          <div className="muted" style={{ fontSize: 13 }}>
            The window was open 6:00–8:00 PM IST.
            {pending > 0
              ? ` ${pending} task${pending === 1 ? '' : 's'} went unacknowledged and will escalate.`
              : ' All your open tasks were acknowledged — nice.'}
            {' '}You can still update tasks from My Tasks; the snapshot reopens at 6:00 PM tomorrow.
          </div>
        </div>
      ) : mine.length === 0 ? (
        <div className="empty" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📝</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No tasks for today yet</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Add the tasks you worked on today — once you add one, the 6:00 PM snapshot opens below so you can set each task's status.
          </div>
          {addBtn('primary')}
        </div>
      ) : (
        <AckPanel currentUser={currentUser} />
      )}
      <CreateTaskModal open={creating} onClose={() => setCreating(false)} onCreate={createTask}
        me={currentUser} people={CDC.USERS} todayStr={todayStr} />
    </div>
  );
}
window.GlanceView = GlanceView;

// Target working hours a contributor is expected to log per day. 8 is the
// floor; overtime is fine and shown without warning. Used by the day-end
// submit flow (progress + soft warning) and the Worklogs under-log flag.
const DAILY_TARGET_HRS = 8;
window.CDC.DAILY_TARGET_HRS = DAILY_TARGET_HRS;

// ── Catalog (shared, defined in data.js → window.CDC.TASK_CATALOG) ────────
// These are LIVE references — applyTaskCatalog() mutates them in place when an
// admin edits the catalog, so always look up OUTPUT_MAP at use time (no
// module-load snapshots like the old OUTPUT_TO_TASK table).
const { PRODUCTS, STACKS, OUTPUT_CATEGORIES, COUNT_NA, STATUSES, TASK_TEMPLATES, OUTPUT_MAP } = window.CDC.TASK_CATALOG;

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

  // Live IST clock — ticks every 30s so the header subtitle stays current.
  const [now, setNow] = useS(() => new Date());
  useE(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    const onVis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const istFmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', ...opts }).format(now);
  const weekdayLabel = `${istFmt({ weekday: 'long' })}, ${istFmt({ month: 'long', day: 'numeric' })}`;
  const timeStr = `${istFmt({ hour: 'numeric', minute: '2-digit', hour12: true })} IST`;

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

  // Kick off intro — EMP ID is taken from the login automatically (no confirm step).
  useE(() => {
    if (transcript.length > 0) return;
    setCurrent((c) => ({ ...c, empId: myEmpId }));
    pushBot(`Hey ${currentUser.name.split(' ')[0]}! Let's capture today's work — should take under a minute.`);
    setTimeout(() => {
      pushBot(`Which product-initiative(s) did you work on today? Multi-select.`);
      setStep('product');
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
    const m = OUTPUT_MAP[cat] || {};
    setCurrent((c) => ({ ...c, outputCategory: cat, taskCategory: m.task, activityCategory: m.activity, metricCategory: m.metric }));
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
      pushBot(`What was achieved? Fill in the template — it's tailored for "${(OUTPUT_MAP[current.outputCategory] || {}).task || current.outputCategory}".`);
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
    const totalHrs = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    const short = DAILY_TARGET_HRS - totalHrs;
    typeThen(() => {
      const base = `Wrapped up. ${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${totalHrs.toFixed(1)} hrs logged against ${myEmpId} for today.`;
      pushBot(short > 0
        ? `${base} That's ${short.toFixed(1)}h under the ${DAILY_TARGET_HRS}h day — it's saved, but if you missed any work add it and resubmit. Managers see days under ${DAILY_TARGET_HRS}h flagged.`
        : base);
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
        activityCategory: t.activityCategory || '', metricCategory: t.metricCategory || '',
        outputCount: t.outputCount || 0, template: t.template || {},
        hours: Number(t.hours) || 0, status: t.status || 'Done', reason: t.reason || '',
        submittedAt: 'just now',
      };
      if (CDC.db) CDC.db.addWorklog(w);
    });
  }

  function restart() {
    setTasks([]); setCurrent({ empId: myEmpId }); setStep('greet'); setTranscript([]);
    setTimeout(() => {
      pushBot(`Hey ${currentUser.name.split(' ')[0]}! Let's capture today's work.`);
      typeThen(() => {
        pushBot(`Which product-initiative(s) did you work on today? Multi-select.`);
        setStep('product');
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
        subtitle={`${weekdayLabel} · ${timeStr} · Logged for ${currentUser.name} (${myEmpId})`}
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
          <div className="banner-title">6:00 PM snapshot · review status & note your backlog</div>
          <div className="banner-sub">Logs against EmpID for tonight's intake. Pavan G sees the rollup in tomorrow's 06:00 IST digest.</div>
        </div>
        <Pill tone="accent" dot>auto-saving</Pill>
      </div>

      <AckPanel currentUser={currentUser} />

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

// ── 6:00 PM daily snapshot ────────────────────────────────────────────────
// Read-only snapshot of the signed-in user's tasks. They can ONLY change the
// status (In-progress / Done / Blocked / Overdue / Backlog) and write a
// backlog/blocked note. Saving records lastAckDate; anything left
// unacknowledged feeds the escalation engine (climbs L1 → L2 → L3). Backlog
// items are stored and stay visible in this snapshot + the Tasks "backlog" tab.
const SNAPSHOT_STATUSES = ['In-progress', 'Done', 'Blocked', 'Overdue', 'Backlog'];
const INTERNAL_TO_LABEL = { ACTIVE: 'In-progress', DONE: 'Done', BLOCKED: 'Blocked', ESCALATED: 'Blocked', BACKLOG: 'Backlog' };
const NOTE_STATUSES = new Set(['Blocked', 'Overdue', 'Backlog']);

function AckPanel({ currentUser }) {
  const CDC = window.CDC;
  const todayStr = CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10);
  const mine = () => (CDC.TASKS || []).filter((t) =>
    t.owner === currentUser.id && ['ACTIVE', 'BLOCKED', 'ESCALATED', 'BACKLOG'].includes(t.status));
  const [, force] = useS(0);
  const [draft, setDraft] = useS({});   // taskId -> { status, note }

  const tasks = mine();
  if (tasks.length === 0) return null;

  const baseOf = (t) => ({ status: INTERNAL_TO_LABEL[t.status] || 'In-progress', note: t.backlogNote || t.blockReason || '' });
  const draftFor = (t) => draft[t.id] || baseOf(t);
  const setField = (t, patch) => setDraft((d) => ({ ...d, [t.id]: { ...baseOf(t), ...(d[t.id] || {}), ...patch } }));

  async function save(t) {
    const d = draftFor(t);
    const note = NOTE_STATUSES.has(d.status) ? (d.note || '').trim() : '';
    if (CDC.db && CDC.db.acknowledgeTask) await CDC.db.acknowledgeTask(t.id, { status: d.status, note });
    setDraft((dd) => { const c = { ...dd }; delete c[t.id]; return c; });
    force((n) => n + 1);
  }

  const pending = tasks.filter((t) => t.lastAckDate !== todayStr);
  const backlog = tasks.filter((t) => t.status === 'BACKLOG');

  return (
    <div className="card" style={{ marginBottom: 12, padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>6:00 PM snapshot — your tasks
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {pending.length} awaiting{backlog.length ? ` · ${backlog.length} in backlog` : ''}</span>
        </div>
        <Pill tone={pending.length ? 'amber' : 'green'} dot>{pending.length ? 'action needed' : 'all acknowledged'}</Pill>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>You can change the status and note the backlog. Tasks left unacknowledged escalate.</div>
      <div className="col" style={{ gap: 8 }}>
        {tasks.map((t) => {
          const acked = t.lastAckDate === todayStr;
          const d = draftFor(t);
          const dirty = !!draft[t.id];
          return (
            <div key={t.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', opacity: acked && !dirty ? 0.65 : 1 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {t.status}{t.metricCategory ? ` · ${t.metricCategory}` : ''}{t.due ? ` · due ${t.due}` : ''}
                    {acked && t.lastAckStatus ? ` · acknowledged: ${t.lastAckStatus}` : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <select value={d.status} onChange={(e) => setField(t, { status: e.target.value })}
                    style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
                    {SNAPSHOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="btn" data-size="sm" data-variant="primary" onClick={() => save(t)}>Save</button>
                </div>
              </div>
              {NOTE_STATUSES.has(d.status) && (
                <input className="field-input" style={{ marginTop: 8, width: '100%' }}
                  placeholder={d.status === 'Backlog' ? 'What is the backlog? (stored, visible later)' : `Reason it's ${d.status.toLowerCase()}…`}
                  value={d.note} onChange={(e) => setField(t, { note: e.target.value })} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
window.AckPanel = AckPanel;

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
        <span className="muted" style={{ fontSize: 11.5 }}>{sel ? `${OUTPUT_MAP[sel].metric} · ${OUTPUT_MAP[sel].task}` : 'Pick one.'}</span>
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
  const fields = TASK_TEMPLATES[currentTask.taskCategory] || (window.CDC.TASK_CATALOG.DEFAULT_TEMPLATE) || [];
  const [vals, setVals] = useS(() => Object.fromEntries(fields.map((f) => [f.id, ''])));
  const filledCount = fields.filter((f) => (vals[f.id] || '').toString().trim()).length;
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <Pill tone="accent" dot>{currentTask.taskCategory}</Pill>
        <span className="muted" style={{ fontSize: 11.5 }}>Output: {currentTask.outputCategory} · optional</span>
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
        <span className="muted" style={{ fontSize: 11.5 }}>{filledCount} of {fields.length} filled · optional</span>
        <button className="btn" data-variant="primary" onClick={() => onTemplateSubmit(vals)}>{filledCount ? 'Next' : 'Skip'} <Icon name="arrow-up" size={11} /></button>
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

// ── Daily-hours progress toward the 8h target ─────────────────────────────
// Soft guidance only: shows progress, turns amber when under 8h, green at/above.
// Overtime (>8h) is fine — bar caps at 100% and never warns for going over.
function DailyHoursBar({ totalHrs, compact }) {
  const target = DAILY_TARGET_HRS;
  const under = totalHrs < target;
  const pct = Math.min(100, target ? (totalHrs / target) * 100 : 0);
  const color = under ? 'var(--amber, #b7791f)' : 'var(--green, #1e7e34)';
  return (
    <div style={{ marginTop: compact ? 4 : 0 }}>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
        <span className="muted">Daily total</span>
        <span className="mono" style={{ color, fontWeight: 600 }}>
          {totalHrs.toFixed(1)} / {target}h
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--panel-2, #eceef1)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .25s ease' }} />
      </div>
      {under && (
        <div style={{ fontSize: 11, color: 'var(--amber, #b7791f)', marginTop: 5 }}>
          {(target - totalHrs).toFixed(1)}h short of the {target}h day — add more tasks, or wrap up if it was a part day.
        </div>
      )}
    </div>
  );
}

// ── Done card ───────────────────────────────────────────────────────────
function DoneCard({ tasks, myEmpId, restart }) {
  const totalHrs = tasks.reduce((s, t) => s + (t.hours || 0), 0);
  const under = totalHrs < DAILY_TARGET_HRS;
  return (
    <div className="celebrate fadein" style={{ alignSelf: 'stretch' }}>
      <div className="check"><Icon name="check" size={28} stroke={2.5} /></div>
      <h2>Logged. See you tomorrow 👋</h2>
      <p>{tasks.length} task{tasks.length === 1 ? '' : 's'} · {totalHrs.toFixed(1)} hrs · against <span className="mono">{myEmpId}</span></p>
      {under && (
        <p className="muted" style={{ fontSize: 12.5, color: 'var(--amber, #b7791f)', marginTop: -4 }}>
          Heads up: that's under the {DAILY_TARGET_HRS}h day — your manager will see it flagged. Resubmit if you missed something.
        </p>
      )}
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
        <div style={{ marginTop: 8 }}><DailyHoursBar totalHrs={totalHrs} /></div>
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

