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
  const todayStr = CDC.fmt(CDC.today);
  // Scoped tasks (managers see their whole team; L1 sees their own), open
  // statuses only. Always visible — not gated to the 6-8 PM window.
  const scoped = (CDC.filterTasks(currentUser.id) || []).filter((t) =>
    ['ACTIVE', 'BLOCKED', 'ESCALATED', 'BACKLOG'].includes(t.status));
  const mineOwn = scoped.filter((t) => t.owner === currentUser.id);
  const pending = mineOwn.filter((t) => t.lastAckDate !== todayStr).length;

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
    // Honor the owner picked in the modal — hardcoding currentUser silently
    // reassigned tasks a manager created for a reportee (and logged the hours
    // against the manager).
    const owner = CDC.lookup.user(form.owner) || currentUser;
    const task = {
      id: `task-${Date.now()}`, title, status, reason: 'Manual', sourceReports: [],
      owner: owner.id, dept: owner.dept, created: todayStr, due: form.due || null,
      confidence: null, source: 'manual', createdBy: currentUser.id,
      products: form.products || [], stacks: form.stacks || [], stack: (form.stacks || [])[0] || null,
      outputCategory: form.outputCategory || null, taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? null, template: form.template || {},
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : null,
      blockReason: form.reason || '',
      deliverableId: form.deliverableId || null, deliverable: form.deliverable || null,
      agenticScope: form.agenticScope || null,
    };
    if (status === 'BLOCKED') { task.blockedAt = new Date().toISOString(); task.escalIdx = 0; task.escalatedTo = owner.managerId || null; }
    CDC.db.addTask(task);
    // Mirror the task into a worklog so the day's work shows up LIVE in the
    // manager dashboard, the worklogs page, and weekly/monthly rollups — all of
    // which read WORKLOGS. Hours come from the estimate; status keeps the label.
    CDC.db.addWorklog({
      id: `wl-${Date.now()}`, taskId: task.id, userId: owner.id, userName: owner.name, userInitials: owner.initials,
      empId: owner.id, dept: owner.dept, sub: owner.sub || null, date: todayStr, daysAgo: 0,
      products: form.products || [], stacks: form.stacks || [],
      outputCategory: form.outputCategory || 'Other', taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? 0, template: form.template || {},
      // Future-due tasks don't count toward today (see TasksView mirror).
      hours: (form.due && form.due > todayStr) ? 0
        : (form.estHours != null && form.estHours !== '' ? Number(form.estHours) : 0),
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : 0,
      status: form.status || 'In-progress', reason: form.reason || '', submittedAt: 'just now',
    });
    // Nudge: how many hours are left to reach the 8h day — only when logging
    // your OWN work (not when a manager creates a task for a reportee).
    if (owner.id === currentUser.id) {
      const dayHrs = (CDC.WORKLOGS || []).filter((w) => w.userId === currentUser.id && w.daysAgo === 0).reduce((s, w) => s + (Number(w.hours) || 0), 0);
      const target = CDC.DAILY_TARGET_HRS || 8;
      const left = target - dayHrs;
      if (CDC.toast) CDC.toast(
        left > 0.01
          ? `Logged ${dayHrs.toFixed(1)}h today — ${left.toFixed(1)}h left to reach your ${target}h day. Add another task to fill it.`
          : `Logged ${dayHrs.toFixed(1)}h today — you've completed your ${target}h day. 🎉`,
        left > 0.01 ? 'amber' : 'green');
      if (left <= 0.01 && CDC.celebrate8h) CDC.celebrate8h(currentUser.id, dayHrs);
    }
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
        subtitle={`This is the only place to change a task's status. Add a task, then set its status (add a reason if blocked). A task stays here until it's marked Done — once it passes its due date it escalates up the manager graph.`}
        actions={
          <>
            <Pill tone={phase !== 'open' ? 'neutral' : pending ? 'amber' : 'green'} dot>
              {phase === 'before' ? 'opens 6:00 PM IST' : phase === 'after' ? 'closed (8:00 PM)' : pending ? `${pending} awaiting ack` : 'all acknowledged'}
            </Pill>
            {scoped.length > 0 && addBtn('ghost')}
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('my-tasks')}>
              <Icon name="tasks" size={11} /> Open Tasks
            </button>
          </>
        }
      />
      {scoped.length === 0 ? (
        <div className="empty" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📝</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No open tasks</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Add a task, then set its status here — task status is changed only on this Day-end glance.
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
  const todayStr = CDC.fmt(CDC.today);
  // Scoped tasks (managers see the whole team, L1 sees their own), open
  // statuses only. Status is editable on your OWN tasks; others are read-only.
  const visible = () => (CDC.filterTasks(currentUser.id) || []).filter((t) =>
    ['ACTIVE', 'BLOCKED', 'ESCALATED', 'BACKLOG'].includes(t.status));
  const [, force] = useS(0);
  const [draft, setDraft] = useS({});   // taskId -> { status, note }

  // The glance is status-only: owners change task status (and subtask status)
  // here — all other edits live on the Tasks board.

  // Change one subtask's status from the glance (status-only; name/due stay on
  // the Tasks board). Saves straight into the parent's embedded subtasks array.
  async function setSubStatus(t, sid, status) {
    const subs = (t.subtasks || []).map((s) => (s.id === sid ? { ...s, status } : s));
    if (CDC.db && CDC.db.updateTaskFields) await CDC.db.updateTaskFields(t.id, { subtasks: subs });
    force((n) => n + 1);
  }

  const tasks = visible();
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

  const pending = tasks.filter((t) => t.owner === currentUser.id && t.lastAckDate !== todayStr);
  const backlog = tasks.filter((t) => t.status === 'BACKLOG');

  return (
    <div className="card" style={{ marginBottom: 12, padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>Task status — set yours here
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
          const isOwn = t.owner === currentUser.id;
          const ownerName = (CDC.lookup.user(t.owner) || {}).name || '';
          return (
            <div key={t.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', opacity: acked && !dirty ? 0.65 : 1 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {!isOwn && ownerName ? `${ownerName} · ` : ''}{t.status}{t.metricCategory ? ` · ${t.metricCategory}` : ''}{t.due ? ` · due ${window.dmy ? window.dmy(t.due) : t.due}` : ''}
                    {acked && t.lastAckStatus ? ` · acknowledged: ${t.lastAckStatus}` : ''}
                  </div>
                  {/* Full task detail so the whole task is visible at a glance. */}
                  {(t.taskCategory || t.outputCategory || (t.products || []).length || (t.stacks || []).length) ? (
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {[
                        t.taskCategory,
                        t.outputCategory ? `${t.outputCategory}${t.outputCount != null ? ` ×${t.outputCount}` : ''}` : '',
                        (t.products || []).join(', '),
                        (t.stacks || []).join(', '),
                        (t.estHours != null && t.estHours !== '') ? `${t.estHours}h est` : '',
                      ].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                  {(t.desc || t.blockReason || t.backlogNote) ? (
                    <div style={{ fontSize: 11.5, marginTop: 3 }}>{t.desc || t.blockReason || t.backlogNote}</div>
                  ) : null}
                  {t.template && Object.values(t.template).filter(Boolean).length > 0 ? (
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{Object.values(t.template).filter(Boolean).join(' · ')}</div>
                  ) : null}
                </div>
                {isOwn ? (
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <select value={d.status} onChange={(e) => setField(t, { status: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {SNAPSHOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className="btn" data-size="sm" data-variant="primary" onClick={() => save(t)}>Save</button>
                  </div>
                ) : (
                  <Pill tone="outline" dot>{t.status.toLowerCase()}</Pill>
                )}
              </div>
              {isOwn && NOTE_STATUSES.has(d.status) && (
                <input className="field-input" style={{ marginTop: 8, width: '100%' }}
                  placeholder={d.status === 'Backlog' ? 'What is the backlog? (stored, visible later)' : `Reason it's ${d.status.toLowerCase()}…`}
                  value={d.note} onChange={(e) => setField(t, { note: e.target.value })} />
              )}
              {(t.subtasks || []).length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                  <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 }}>
                    Subtasks · {(t.subtasks).filter((s) => s.status === 'Done').length}/{(t.subtasks).length} done
                  </div>
                  <div className="col" style={{ gap: 5 }}>
                    {(t.subtasks).map((s) => (
                      <div key={s.id} className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12 }}><span className="muted" style={{ marginRight: 5 }}>↳</span>{s.title}<span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }}>{(CDC.lookup.user(s.owner || t.owner) || {}).name ? `· ${(CDC.lookup.user(s.owner || t.owner) || {}).name}` : ''}{s.due ? ` · due ${window.dmy ? window.dmy(s.due) : s.due}` : ''}</span></span>
                        {isOwn ? (
                          <select value={s.status} onChange={(e) => setSubStatus(t, s.id, e.target.value)}
                            style={{ fontSize: 11.5, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
                            {SNAPSHOT_STATUSES.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <Pill tone="outline" dot>{s.status}</Pill>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
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
