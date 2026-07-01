// CD-Copilot — Team Goals → Deliverables + Agentic-execution feedback.
// One page for every user: L2 leads write deliverables under each team goal and
// assign each to specific people in their stack (multi-select); those people see
// only their own deliverables when logging a task. Everyone sees the goals and
// the agentic execution-scope rollup. Reads window.CDC.

const { useState: useState_g } = React;

function isLeadRole(u) {
  return ['L2', 'L3', 'Admin'].includes(u.level) ||
    ['L2', 'L3', 'ADMIN', 'PRODUCT_OWNER', 'DEPARTMENT_LEAD', 'SUB_LEAD', 'CENTRAL_OPS'].includes(u.role);
}
const SCOPE_TONE = { L0: 'outline', L1: 'blue', L2: 'blue', L3: 'accent', L4: 'green', L5: 'green' };
const shortName = (u) => (u && u.name ? u.name.split(' ')[0] : '—');

function GoalsView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const CAT = CDC.TASK_CATALOG || {};
  const me = currentUser;
  const seesAll = CDC.scopeForUser(me.id).kind === 'all';
  const [, force] = useState_g(0);
  const refresh = () => force((n) => n + 1);

  // Teams that have goals; L3/Admin can switch, everyone else is locked to their sub.
  const scoped = (CDC.filterGoals ? CDC.filterGoals(me.id) : []) || [];
  const teams = [...new Set(scoped.map((g) => g.sub))].sort();
  // L3/Admin start on the stack picker (teamSel = ''); L2/L1 are locked to their team.
  const [teamSel, setTeamSel] = useState_g(seesAll ? '' : (me.sub || teams[0] || ''));
  const team = teamSel || (seesAll ? '' : (teams[0] || ''));

  const goals = scoped.filter((g) => g.sub === team);
  const canEdit = seesAll || (isLeadRole(me) && me.sub === team);
  // Assignable people = the team's stack (same sub).
  const teamPeople = (CDC.USERS || []).filter((u) => u.sub === team);

  // Filters shown in the goal interface.
  const [prodFilter, setProdFilter] = useState_g('');
  const [assigneeFilter, setAssigneeFilter] = useState_g('');
  // Product filter options = the full catalog + anything already tagged on goals,
  // so the filter is always available next to the assignee filter.
  const allProducts = [...new Set([...(CAT.PRODUCTS || []), ...goals.flatMap((g) => g.products || [])])].sort();
  const visibleGoals = goals
    .filter((g) => !prodFilter || (g.products || []).includes(prodFilter))
    .filter((g) => !assigneeFilter || (g.deliverables || []).some((d) => (d.assignees || []).includes(assigneeFilter)));

  // Agentic feedback: scope distribution across this team's live tasks.
  const teamTasks = ((CDC.filterTasks ? CDC.filterTasks(me.id) : []) || [])
    .filter((t) => (CDC.lookup.user(t.owner) || {}).sub === team && !['SUGGESTED', 'REJECTED'].includes(t.status));
  const scopes = (CAT.AGENTIC_SCOPES || []);
  const counts = scopes.map((s) => ({ ...s, n: teamTasks.filter((t) => t.agenticScope === s.v).length }));
  const unset = teamTasks.filter((t) => !t.agenticScope).length;
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  const scored = teamTasks.length - unset;

  async function saveGoal(goal, patch) {
    if (CDC.db && CDC.db.updateGoal) await CDC.db.updateGoal(goal.id, patch);
    else Object.assign(goal, patch);   // offline fallback
    refresh();
  }
  async function deleteGoal(goal) {
    if (!window.confirm(`Delete goal “${goal.title}” and its deliverables? This cannot be undone.`)) return;
    if (CDC.db && CDC.db.deleteGoal) await CDC.db.deleteGoal(goal.id);
    else { const arr = CDC.GOALS || []; const i = arr.findIndex((x) => x.id === goal.id); if (i >= 0) arr.splice(i, 1); }
    refresh();
  }

  // Add a new goal to the selected team (leads/admin) with a product-audience.
  const teamDept = (goals[0] && goals[0].dept) || (CDC.USERS.find((u) => u.sub === team) || {}).dept || me.dept;
  const [newGoal, setNewGoal] = useState_g('');
  const [newProducts, setNewProducts] = useState_g([]);
  const toggleNewProduct = (p) => setNewProducts((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  async function addGoal() {
    const title = newGoal.trim();
    if (!title || !team) return;
    const goal = { id: `goal-${Date.now()}`, sub: team, dept: teamDept, title, products: newProducts, deliverables: [] };
    if (CDC.db && CDC.db.addGoal) await CDC.db.addGoal(goal);
    else (CDC.GOALS = CDC.GOALS || []).push(goal);
    setNewGoal(''); setNewProducts([]);
    refresh();
  }

  const selStyle = { height: 30, fontSize: 13, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' };

  // L3/Admin landing: pick a stack (team) first, then open its board (L2 view).
  if (seesAll && !teamSel) {
    const allSubs = [...new Set((CDC.USERS || []).map((u) => u.sub).filter(Boolean))].sort();
    return (
      <div className="fadein">
        <SectionHeader title="Goals" subtitle="Pick a stack to open its goals & deliverables — the same board that team's L2 sees." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {allSubs.map((s) => {
            const gc = (CDC.GOALS || []).filter((g) => g.sub === s).length;
            const mc = (CDC.USERS || []).filter((u) => u.sub === s).length;
            return (
              <div key={s} className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => { setTeamSel(s); setProdFilter(''); setAssigneeFilter(''); }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.replace('Content — ', '')}</div>
                  <Icon name="chev-right" size={16} />
                </div>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <Pill tone={gc ? 'accent' : 'outline'} dot>{gc} goal{gc === 1 ? '' : 's'}</Pill>
                  <span className="muted" style={{ fontSize: 12 }}>{mc} member{mc === 1 ? '' : 's'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fadein">
      <SectionHeader
        title={seesAll ? `Goals · ${team.replace('Content — ', '')}` : 'Goals'}
        subtitle="Team goals and their deliverables. Leads assign each deliverable to people in their stack; those people see only their own when logging a task."
        actions={seesAll ? (
          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setTeamSel('')}>← All stacks</button>
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

      {/* Goals + deliverables board with product-audience + assignee filters. */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '26px 0 12px' }}>
        <h2 className="h-section" style={{ margin: 0 }}>Goals & deliverables <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {visibleGoals.length}</span></h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {allProducts.length > 0 && (
            <select style={selStyle} value={prodFilter} onChange={(e) => setProdFilter(e.target.value)} title="Filter by product-audience">
              <option value="">All product-audience</option>
              {allProducts.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {teamPeople.length > 0 && (
            <select style={selStyle} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} title="Filter by assignee">
              <option value="">All assignees</option>
              {teamPeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {canEdit && team && (
        <Card>
          <div className="col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Icon name="check" size={14} />
              <input value={newGoal} placeholder="Add a new goal for this team…"
                onChange={(e) => setNewGoal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addGoal(); }}
                style={{ flex: 1, fontSize: 14, padding: '9px 11px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <button className="btn" data-variant="primary" data-size="sm" disabled={!newGoal.trim()} onClick={addGoal}>
                <Icon name="check" size={11} /> Add goal
              </button>
            </div>
            {(CAT.PRODUCTS || []).length > 0 && (
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.05, fontWeight: 600, marginBottom: 6 }}>Product-Audience</div>
                <div className="chip-grid">
                  {(CAT.PRODUCTS || []).map((p) => (
                    <div key={p} className="chip" data-selected={newProducts.includes(p)} onClick={() => toggleNewProduct(p)}>
                      {newProducts.includes(p) && <Icon name="check" size={10} stroke={2.4} />}<span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {visibleGoals.length === 0 ? (
        <div className="empty" style={{ marginTop: 12 }}>No goals{prodFilter || assigneeFilter ? ' match the filters' : ' for this team yet'}.{canEdit && !prodFilter && !assigneeFilter ? ' Add one above.' : ''}</div>
      ) : (
        <div className="col" style={{ gap: 12, marginTop: 12 }}>
          {visibleGoals.map((g) => (
            <GoalCard key={g.id} goal={g} canEdit={canEdit} people={teamPeople} assigneeFilter={assigneeFilter}
              onSave={(patch) => saveGoal(g, patch)} onDelete={() => deleteGoal(g)} />
          ))}
        </div>
      )}
    </div>
  );
}
window.GoalsView = GoalsView;

// One goal card: title + product-audience + its deliverables, each with assignees.
function GoalCard({ goal, canEdit, people, assigneeFilter, onSave, onDelete }) {
  const CDC = window.CDC;
  const CAT = CDC.TASK_CATALOG || {};
  const [adding, setAdding] = useState_g('');
  const dels = goal.deliverables || [];
  const shown = assigneeFilter ? dels.filter((d) => (d.assignees || []).includes(assigneeFilter)) : dels;
  const saveDels = (next) => onSave({ deliverables: next });
  const add = () => { const t = adding.trim(); if (!t) return; saveDels([...dels, { id: `${goal.id}-d${Date.now()}`, text: t, assignees: [] }]); setAdding(''); };
  const editText = (id, text) => saveDels(dels.map((d) => (d.id === id ? { ...d, text } : d)));
  const setAssignees = (id, assignees) => saveDels(dels.map((d) => (d.id === id ? { ...d, assignees } : d)));
  const remove = (id) => saveDels(dels.filter((d) => d.id !== id));
  const products = goal.products || [];
  const remainingProducts = (CAT.PRODUCTS || []).filter((p) => !products.includes(p));
  const setProducts = (next) => onSave({ products: next });
  const inp = { fontSize: 13, padding: '7px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' };
  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{goal.title}</div>
          {goal.workflowLevels && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>⚡ Agentic levels · {goal.workflowLevels}</div>
          )}
          {/* Product-Audience — editable on existing goals for leads/admin. */}
          <div className="row" style={{ gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {products.map((p) => (
              canEdit
                ? <span key={p} className="pill" data-tone="accent" style={{ gap: 4 }}>{p}
                    <span style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.8 }} title="Remove" onClick={() => setProducts(products.filter((x) => x !== p))}>×</span>
                  </span>
                : <Pill key={p} tone="accent">{p}</Pill>
            ))}
            {canEdit && remainingProducts.length > 0 && (
              <select value="" onChange={(e) => e.target.value && setProducts([...products, e.target.value])}
                style={{ height: 24, fontSize: 11.5, padding: '0 6px', borderRadius: 'var(--radius)', border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-muted)' }}
                title="Add product-audience">
                <option value="">+ product-audience</option>
                {remainingProducts.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <Pill tone="outline">{dels.length} deliverable{dels.length === 1 ? '' : 's'}</Pill>
          {canEdit && onDelete && <button className="btn" data-size="sm" data-variant="danger" title="Delete goal" onClick={onDelete}>Delete</button>}
        </div>
      </div>

      {shown.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>{assigneeFilter ? 'No deliverables for this person.' : 'No deliverables yet.'}</div>}
      <div className="col" style={{ gap: 8 }}>
        {shown.map((d) => (
          <div key={d.id} className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span className="muted" style={{ marginTop: 7 }}>↳</span>
            {canEdit ? (
              <input defaultValue={d.text} onBlur={(e) => e.target.value.trim() && e.target.value !== d.text && editText(d.id, e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} style={{ ...inp, flex: '1 1 260px' }} />
            ) : (
              <span style={{ fontSize: 13, flex: '1 1 260px' }}>{d.text}</span>
            )}
            <AssigneeControl assignees={d.assignees || []} people={people} canEdit={canEdit}
              onChange={(next) => setAssignees(d.id, next)} />
            {canEdit && <button className="btn" data-size="sm" data-variant="danger" title="Remove deliverable" onClick={() => remove(d.id)}>✕</button>}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 10 }}>
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

// Multi-select assignees for one deliverable: pills (removable) + an add-select
// of the remaining stack members. Read-only shows the assigned names.
function AssigneeControl({ assignees, people, canEdit, onChange }) {
  const CDC = window.CDC;
  const nameOf = (id) => shortName(CDC.lookup.user(id));
  const remaining = (people || []).filter((u) => !assignees.includes(u.id));
  if (!canEdit) {
    return assignees.length
      ? <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{assignees.map((id) => <Pill key={id} tone="blue" dot>{nameOf(id)}</Pill>)}</div>
      : <span className="muted" style={{ fontSize: 11.5 }}>unassigned</span>;
  }
  return (
    <div className="row" style={{ gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
      {assignees.map((id) => (
        <span key={id} className="pill" data-tone="blue" style={{ gap: 4 }}>
          {nameOf(id)}
          <span style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.8 }} title="Unassign"
            onClick={() => onChange(assignees.filter((x) => x !== id))}>×</span>
        </span>
      ))}
      {remaining.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...assignees, e.target.value])}
          style={{ height: 26, fontSize: 12, padding: '0 6px', borderRadius: 'var(--radius)', border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-muted)' }}
          title="Assign a person">
          <option value="">+ assign</option>
          {remaining.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
    </div>
  );
}
window.AssigneeControl = AssigneeControl;
