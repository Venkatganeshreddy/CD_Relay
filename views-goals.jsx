// CD-Copilot — Team Goals → Deliverables + Agentic-execution feedback.
// One page for every user: L2 leads write the deliverables under each team goal
// (L1s pick them when logging a task); everyone sees the goals and the agentic
// execution-scope rollup (how AI-assisted the team's work is). Reads window.CDC.

const { useState: useState_g } = React;

function isLeadRole(u) {
  return ['L2', 'L3', 'Admin'].includes(u.level) ||
    ['L2', 'L3', 'ADMIN', 'PRODUCT_OWNER', 'DEPARTMENT_LEAD', 'SUB_LEAD', 'CENTRAL_OPS'].includes(u.role);
}
const SCOPE_TONE = { L0: 'outline', L1: 'blue', L2: 'blue', L3: 'accent', L4: 'green', L5: 'green' };

function GoalsView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const me = currentUser;
  const seesAll = CDC.scopeForUser(me.id).kind === 'all';
  const [, force] = useState_g(0);
  const refresh = () => force((n) => n + 1);

  // Teams that have goals; L3/Admin can switch, everyone else is locked to their sub.
  const scoped = (CDC.filterGoals ? CDC.filterGoals(me.id) : []) || [];
  const teams = [...new Set(scoped.map((g) => g.sub))].sort();
  const [teamSel, setTeamSel] = useState_g(seesAll ? (teams[0] || '') : (me.sub || teams[0] || ''));
  const team = teamSel || teams[0] || '';

  const goals = scoped.filter((g) => g.sub === team);
  const canEdit = seesAll || (isLeadRole(me) && me.sub === team);

  // Agentic feedback: scope distribution across this team's live tasks.
  const teamTasks = ((CDC.filterTasks ? CDC.filterTasks(me.id) : []) || [])
    .filter((t) => (CDC.lookup.user(t.owner) || {}).sub === team && !['SUGGESTED', 'REJECTED'].includes(t.status));
  const scopes = (CDC.TASK_CATALOG.AGENTIC_SCOPES || []);
  const counts = scopes.map((s) => ({ ...s, n: teamTasks.filter((t) => t.agenticScope === s.v).length }));
  const unset = teamTasks.filter((t) => !t.agenticScope).length;
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  const scored = teamTasks.length - unset;

  async function saveDeliverables(goal, deliverables) {
    if (CDC.db && CDC.db.updateGoal) await CDC.db.updateGoal(goal.id, { deliverables });
    else goal.deliverables = deliverables;   // offline fallback
    refresh();
  }

  return (
    <div className="fadein">
      <SectionHeader
        title="Goals"
        subtitle="Team goals and the deliverables that achieve them. Leads write deliverables; contributors pick one when logging a task."
        actions={teams.length > 1 && seesAll ? (
          <select className="btn" data-size="sm" value={team} onChange={(e) => setTeamSel(e.target.value)}>
            {teams.map((s) => <option key={s} value={s}>{s.replace('Content — ', '')}</option>)}
          </select>
        ) : (
          <Pill tone="accent" dot>{team.replace('Content — ', '') || 'No team'}</Pill>
        )}
      />

      {/* Agentic execution feedback — how much of the team's work is AI-assisted. */}
      <h2 className="h-section">Agentic execution feedback</h2>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Scope chosen across <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>{teamTasks.length}</span> tasks
            {unset > 0 && <> · <span style={{ color: 'var(--amber)' }}>{unset} unscoped</span></>}
          </div>
          <Pill tone={scored === teamTasks.length ? 'green' : 'amber'} dot>{teamTasks.length ? Math.round((scored / teamTasks.length) * 100) : 0}% scored</Pill>
        </div>
        <div className="col" style={{ gap: 8 }}>
          {counts.map((c) => (
            <div key={c.v} className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div style={{ width: 210, fontSize: 12 }}>
                <Pill tone={SCOPE_TONE[c.v] || 'outline'}>{c.v}</Pill>
                <span className="muted" style={{ marginLeft: 6 }}>{c.label}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="progress-track" style={{ height: 8, marginBottom: 0 }}>
                  <div className="progress-fill" style={{ width: `${(c.n / maxN) * 100}%` }} />
                </div>
              </div>
              <div className="mono" style={{ minWidth: 32, textAlign: 'right', fontWeight: 600 }}>{c.n}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Goals + deliverables board. */}
      <h2 className="h-section">Goals & deliverables <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {goals.length}</span></h2>
      {goals.length === 0 ? (
        <div className="empty">No goals for this team yet.</div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} canEdit={canEdit} onSave={(dels) => saveDeliverables(g, dels)} />
          ))}
        </div>
      )}
    </div>
  );
}
window.GoalsView = GoalsView;

// One goal card: title + its deliverables. Leads edit inline (add / edit / remove).
function GoalCard({ goal, canEdit, onSave }) {
  const [adding, setAdding] = useState_g('');
  const dels = goal.deliverables || [];
  const add = () => { const t = adding.trim(); if (!t) return; onSave([...dels, { id: `${goal.id}-d${Date.now()}`, text: t }]); setAdding(''); };
  const editText = (id, text) => onSave(dels.map((d) => (d.id === id ? { ...d, text } : d)));
  const remove = (id) => onSave(dels.filter((d) => d.id !== id));
  const inp = { fontSize: 12.5, padding: '6px 9px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)' };
  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{goal.title}</div>
        <Pill tone="outline">{dels.length} deliverable{dels.length === 1 ? '' : 's'}</Pill>
      </div>
      {dels.length === 0 && !canEdit && <div className="muted" style={{ fontSize: 12 }}>No deliverables yet.</div>}
      <div className="col" style={{ gap: 6 }}>
        {dels.map((d) => (
          <div key={d.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="muted">↳</span>
            {canEdit ? (
              <>
                <input defaultValue={d.text} onBlur={(e) => e.target.value.trim() && e.target.value !== d.text && editText(d.id, e.target.value.trim())}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} style={{ ...inp, flex: 1 }} />
                <button className="btn" data-size="sm" data-variant="danger" title="Remove deliverable" onClick={() => remove(d.id)}>✕</button>
              </>
            ) : (
              <span style={{ fontSize: 12.5 }}>{d.text}</span>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
          <span className="muted">↳</span>
          <input value={adding} placeholder="Add a deliverable to achieve this goal…"
            onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            style={{ ...inp, flex: 1 }} />
          <button className="btn" data-size="sm" data-variant="primary" disabled={!adding.trim()} onClick={add}>
            <Icon name="check" size={11} /> Add
          </button>
        </div>
      )}
    </Card>
  );
}
window.GoalCard = GoalCard;
