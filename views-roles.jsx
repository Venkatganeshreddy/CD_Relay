// Relay — Manager (L2) view, L1 user dashboard, Guideline tour.
// All three share the role-aware data shape from window.CDC.

const { useState: useStR, useMemo: useMR, useRef: useRR, useEffect: useER } = React;

// ════════════════════════════════════════════════════════════════════════
// L2 MANAGER VIEW — Team Overview + Employee Cards (with detail panel)
// ════════════════════════════════════════════════════════════════════════
function ManagerView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  // Pavan G (L3) can use this too, picking from their direct reports.
  // For an L2, their reportees = users where managerId === currentUser.id.
  // Also for an L2 with a sub-team but no listed reportees, synthesize from worklogs.
  const isL3 = currentUser.role === 'L3' || currentUser.role === 'PRODUCT_OWNER';
  const [pickedMgrId, setPickedMgrId] = useStR(isL3 ? null : currentUser.id);

  const myReportees = useMR(() => {
    const mgr = pickedMgrId ? CDC.lookup.user(pickedMgrId) : currentUser;
    // direct reports
    let direct = CDC.USERS.filter((u) => u.managerId === mgr.id);
    // L2 also "owns" their sub-team — show any user in same sub
    if (mgr.sub && direct.length === 0) {
      direct = CDC.USERS.filter((u) => u.sub === mgr.sub && u.id !== mgr.id);
    }
    // If still empty, synthesize people from worklogs filtered to the team
    if (direct.length === 0 && mgr.sub) {
      direct = synthesizeReportees(mgr);
    }
    return direct;
  }, [pickedMgrId, currentUser.id]);

  const mgr = pickedMgrId ? CDC.lookup.user(pickedMgrId) : currentUser;
  const teamWorklogs = useMR(() => {
    if (!mgr.sub) return [];
    return CDC.WORKLOGS.filter((w) => w.sub === mgr.sub);
  }, [mgr]);
  const recentWorklogs = teamWorklogs.filter((w) => w.daysAgo <= 6);

  const [selectedEmployee, setSelectedEmployee] = useStR(null);

  // Compute aggregates
  const overdueTasks = CDC.TASKS.filter((t) => t.dept === mgr.dept && (t.status === 'ACTIVE' || t.status === 'SUGGESTED'));
  const blocked = recentWorklogs.filter((w) => w.status === 'Blocked');
  const blockedByReason = groupBy(blocked, (b) => b.reason || 'No reason given');
  const productSplit = computeProductSplit(recentWorklogs);
  const workflowsUsed = computeWorkflowsUsed(recentWorklogs);
  const reportRate = computeReportRate(mgr, recentWorklogs, myReportees);
  const teamHighlights = computeTeamHighlights(recentWorklogs);

  return (
    <div className="fadein">
      <GreetingHeader
        currentUser={currentUser}
        context={isL3 ? 'Drill into any of your direct L2s' : `Your Sub Department — ${mgr.sub || mgr.title}`}
        actions={
          <>
            {isL3 && (
              <select className="btn" data-size="sm" value={pickedMgrId || ''} onChange={(e) => setPickedMgrId(e.target.value)}>
                <option value="">— pick a manager —</option>
                {CDC.USERS.filter((u) => u.managerId === currentUser.id && u.role === 'L2').map((u) => (
                  <option key={u.id} value={u.id}>{u.name} · {u.sub || u.title}</option>
                ))}
              </select>
            )}
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('weekly')}><Icon name="weekly" size={12} /> Weekly draft</button>
          </>
        }
      />

      {isL3 && !pickedMgrId ? (
        <Card>
          <div className="muted" style={{ textAlign: 'center', padding: 40 }}>
            Pick a manager above to see their Team Overview + Employee Cards.
          </div>
        </Card>
      ) : (
        <>
          {/* ── Section 8.1 — Team Overview ────────────────────────── */}
          <h2 className="h-section">Team overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div className="kpi-tile" data-tone={reportRate >= 0.8 ? 'green' : reportRate >= 0.6 ? 'amber' : 'red'}>
              <div className="kpi-name">Report completion · 7d</div>
              <div className="kpi-value">{Math.round(reportRate * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>%</span></div>
              <div className="kpi-meta"><span>{myReportees.length} reportee{myReportees.length === 1 ? '' : 's'}</span></div>
            </div>
            <div className="kpi-tile" data-tone={overdueTasks.length > 0 ? 'amber' : undefined}>
              <div className="kpi-name">Overdue tasks</div>
              <div className="kpi-value">{overdueTasks.length}</div>
              <div className="kpi-meta"><span>{overdueTasks.filter((t) => t.status === 'SUGGESTED').length} suggested · {overdueTasks.filter((t) => t.status === 'ACTIVE').length} active</span></div>
            </div>
            <div className="kpi-tile" data-tone={blocked.length > 0 ? 'red' : undefined}>
              <div className="kpi-name">Blocked tasks</div>
              <div className="kpi-value">{blocked.length}</div>
              <div className="kpi-meta"><span>{Object.keys(blockedByReason).length} distinct reasons</span></div>
            </div>
            <div className="kpi-tile">
              <div className="kpi-name">Total hours · 7d</div>
              <div className="kpi-value">{recentWorklogs.reduce((s, w) => s + w.hours, 0).toFixed(0)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>h</span></div>
              <div className="kpi-meta"><span>{recentWorklogs.length} entries</span></div>
            </div>
          </div>

          {/* Two-column: highlights + workflows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <Card title="Top accomplishments · this week" meta="auto-summarized" actions={<Pill tone="accent" dot>Rollup</Pill>}>
              {teamHighlights.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>No accomplishments captured yet — Rollup runs Monday 06:00 IST.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  {teamHighlights.map((h, i) => (
                    <li key={i}>
                      <strong>{h.who}:</strong> {h.what} <span className="muted">· {h.when}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Most-used agentic workflows" meta="this week">
              {workflowsUsed.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>No agent workflows logged this week.</div>
              ) : (
                <div className="col" style={{ gap: 10 }}>
                  {workflowsUsed.slice(0, 5).map((w, i) => {
                    const max = workflowsUsed[0].count;
                    return (
                      <div key={i}>
                        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.workflow}</span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{w.count}× · {w.users.length} ppl</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${(w.count / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Product contribution split */}
          <Card title="Product contribution · this week" meta="hours per Product-Audience" style={{ marginTop: 12 }}>
            <div className="col" style={{ gap: 8 }}>
              {productSplit.map((p) => {
                const max = productSplit[0]?.hours || 1;
                return (
                    <div key={p.product}>
                      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.product}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{p.hours.toFixed(1)} hr · {p.pct}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(p.hours / max) * 100}%`, height: '100%', background: PRODUCT_COLORS[p.product] || 'var(--accent)' }} />
                      </div>
                    </div>
                );
              })}
              {productSplit.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No worklogs yet this week.</div>}
            </div>
          </Card>

          {/* Blocked tasks by reason */}
          {Object.keys(blockedByReason).length > 0 && (
            <Card title="Blocked tasks · grouped by reason" style={{ marginTop: 12 }}>
              <div className="col" style={{ gap: 10 }}>
                {Object.entries(blockedByReason).map(([reason, items]) => (
                  <div key={reason} style={{ padding: '8px 10px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 6, fontSize: 12.5 }}>
                    <strong>{reason}</strong>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {items.length} task{items.length === 1 ? '' : 's'} blocked — {items.map((i) => CDC.lookup.user(i.userId)?.name?.split(' ')[0]).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Section 8.2 — Employee Cards ───────────────────────── */}
          <h2 className="h-section">Reportees · {myReportees.length}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {myReportees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                emp={emp}
                worklogs={CDC.WORKLOGS.filter((w) => w.userId === emp.id)}
                onClick={() => setSelectedEmployee(emp)}
              />
            ))}
            {myReportees.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No direct reportees in master data.</div>}
          </div>

          {/* Employee detail modal */}
          {selectedEmployee && (
            <Modal open={true} onClose={() => setSelectedEmployee(null)} title={selectedEmployee.name} width={820}>
              <EmployeeDetail emp={selectedEmployee} />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
window.ManagerView = ManagerView;

const PRODUCT_COLORS = {
  'NxtWave': 'var(--accent)',
  'NIAT - B1': 'var(--green)',
  'NIAT - B2': 'oklch(0.65 0.13 152)',
  'Intensive Offline': 'var(--blue)',
  'Academy': 'var(--amber)',
  'Launchpad': 'var(--red)',
};

function EmployeeCard({ emp, worklogs, onClick }) {
  const last = worklogs.length > 0 ? worklogs[0] : null;
  const last7 = worklogs.filter((w) => w.daysAgo <= 6);
  const hrs7 = last7.reduce((s, w) => s + w.hours, 0);
  const blockers = last7.filter((w) => w.status === 'Blocked').length;
  const expected = 7;
  const submittedDays = new Set(last7.map((w) => w.daysAgo)).size;
  const compPct = Math.round((submittedDays / expected) * 100);
  const tone = compPct >= 85 ? 'green' : compPct >= 60 ? 'amber' : 'red';
  return (
    <div className="card card-pad" onClick={onClick} style={{ cursor: 'default' }}>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Avatar user={emp} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</div>
          <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.title}</div>
        </div>
        <Pill tone="outline">{emp.level}</Pill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--red)' }}>{compPct}%</div>
          <div style={{ fontSize: 10 }}>completion</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{hrs7.toFixed(0)}h</div>
          <div style={{ fontSize: 10 }}>last 7d</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: blockers > 0 ? 'var(--red)' : undefined }}>{blockers}</div>
          <div style={{ fontSize: 10 }}>blocked</div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        {last ? (
          <span>Last: <span className="mono">{last.daysAgo === 0 ? 'today' : last.daysAgo === 1 ? 'yest' : `${last.daysAgo}d ago`}</span></span>
        ) : (
          <span className="muted">no reports yet</span>
        )}
      </div>
    </div>
  );
}

function EmployeeDetail({ emp }) {
  const CDC = window.CDC;
  const [tab, setTab] = useStR('weekly');
  const worklogs = CDC.WORKLOGS.filter((w) => w.userId === emp.id).sort((a, b) => a.daysAgo - b.daysAgo);
  const last30 = worklogs.filter((w) => w.daysAgo <= 30);
  const workflowsUsed = computeWorkflowsUsed(last30);
  // Synthesize weekly contributions — group worklogs by week
  const weekly = groupBy(worklogs, (w) => `Week of ${w.date.slice(0, 7)}`);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar user={emp} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{emp.title} · <span className="mono">{CDC.empIdForUser(emp.id)}</span></div>
        </div>
        <Pill tone="outline">{emp.level}</Pill>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {[
          { id: 'weekly', label: 'Weekly reports' },
          { id: 'history', label: 'Activity history' },
          { id: 'workflows', label: 'Workflow activity' },
        ].map((t) => (
          <button key={t.id} className="btn" data-size="sm" data-variant={tab === t.id ? 'primary' : 'ghost'} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'weekly' && (
        <div className="col" style={{ gap: 8 }}>
          {Object.entries(weekly).length === 0 && <div className="empty">No reports yet.</div>}
          {Object.entries(weekly).map(([wk, items]) => (
            <div key={wk} className="card card-pad" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{wk}</strong>
                <Pill tone="green">approved</Pill>
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {items.length} task{items.length === 1 ? '' : 's'} · {items.reduce((s, i) => s + i.hours, 0).toFixed(1)} hrs
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.5 }}>
                {items.slice(0, 4).map((it, i) => (
                  <li key={i}>{it.outputCategory} <span className="muted">· {it.hours}h · {it.status}</span></li>
                ))}
                {items.length > 4 && <li className="muted">+ {items.length - 4} more</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="col" style={{ gap: 6, maxHeight: 460, overflowY: 'auto' }}>
          {last30.length === 0 && <div className="empty">No activity in last 30 days.</div>}
          {last30.map((w) => (
            <div key={w.id} className="row" style={{ gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--panel)' }}>
              <span className="mono faint" style={{ fontSize: 11, minWidth: 60 }}>{w.date}</span>
              <Pill dot tone={w.status === 'Done' ? 'green' : w.status === 'In-progress' ? 'blue' : w.status === 'Blocked' ? 'red' : 'amber'}>{w.status}</Pill>
              <div style={{ flex: 1, fontSize: 12.5 }}>
                <strong>{w.outputCategory}</strong>
                <div className="muted" style={{ fontSize: 11 }}>{summarizeTemplate(w.template, w.taskCategory)}</div>
              </div>
              <span className="mono" style={{ fontSize: 11.5 }}>{w.hours.toFixed(1)}h</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'workflows' && (
        <div className="col" style={{ gap: 8 }}>
          {workflowsUsed.length === 0 && <div className="empty">No agentic workflows logged.</div>}
          {workflowsUsed.map((w) => {
            const max = workflowsUsed[0].count;
            return (
              <div key={w.workflow} className="card card-pad" style={{ padding: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ fontSize: 13 }}>{w.workflow}</strong>
                  <span className="mono" style={{ fontSize: 12 }}>{w.count}× this month</span>
                </div>
                <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(w.count / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Manager view helpers ───────────────────────────────────────────────
function groupBy(arr, fn) {
  const map = {};
  for (const x of arr) {
    const k = fn(x);
    if (!map[k]) map[k] = [];
    map[k].push(x);
  }
  return map;
}

function synthesizeReportees(mgr) {
  // Fake 4-6 reportees for managers without explicit ones
  const CDC = window.CDC;
  const base = ['Aanya', 'Rohan', 'Sneha', 'Karthik', 'Maya', 'Aditya', 'Riya', 'Vinay'];
  const surnames = ['M.', 'P.', 'S.', 'V.', 'K.', 'R.', 'N.', 'B.'];
  const n = 4 + (mgr.id.charCodeAt(2) % 3);
  return Array.from({ length: n }, (_, i) => ({
    id: `${mgr.id}-r${i}`,
    name: `${base[i % base.length]} ${surnames[i % surnames.length]}`,
    initials: base[i % base.length][0] + surnames[i % surnames.length][0],
    role: 'L0',
    level: 'L0',
    dept: mgr.dept,
    sub: mgr.sub,
    title: `${mgr.sub?.replace('Content — ', '') || mgr.title} · Reporter`,
    managerId: mgr.id,
    synthetic: true,
  }));
}

function computeProductSplit(worklogs) {
  const map = {};
  let total = 0;
  for (const w of worklogs) {
    const ps = w.products || [];
    const splitHrs = w.hours / Math.max(1, ps.length);
    for (const p of ps) {
      map[p] = (map[p] || 0) + splitHrs;
      total += splitHrs;
    }
  }
  return Object.entries(map)
    .map(([product, hours]) => ({ product, hours, pct: Math.round((hours / total) * 100) }))
    .sort((a, b) => b.hours - a.hours);
}

function computeWorkflowsUsed(worklogs) {
  const map = {};
  for (const w of worklogs) {
    const wf = w.template?.workflow || w.template?.tool;
    if (!wf) continue;
    if (!map[wf]) map[wf] = { workflow: wf, count: 0, users: new Set() };
    map[wf].count += 1;
    map[wf].users.add(w.userId);
  }
  return Object.values(map)
    .map((x) => ({ ...x, users: [...x.users] }))
    .sort((a, b) => b.count - a.count);
}

function computeReportRate(mgr, recentLogs, reportees) {
  const expectedPerWeek = reportees.length * 5;
  const submittedDays = new Set();
  for (const r of reportees) {
    const myLogs = recentLogs.filter((w) => w.userId === r.id);
    for (const w of myLogs) submittedDays.add(`${r.id}-${w.date}`);
  }
  return expectedPerWeek > 0 ? Math.min(1, submittedDays.size / expectedPerWeek) : 0.85;
}

function computeTeamHighlights(worklogs) {
  // Take 3 most recent Done items as highlights
  const done = worklogs.filter((w) => w.status === 'Done').slice(0, 5);
  return done.map((d) => {
    const u = window.CDC.lookup.user(d.userId);
    return {
      who: u?.name?.split(' ')[0] || '—',
      what: d.outputCategory + (d.template?.topic ? ` (${d.template.topic})` : ''),
      when: d.daysAgo === 0 ? 'today' : d.daysAgo === 1 ? 'yest' : `${d.daysAgo}d ago`,
    };
  });
}

function summarizeTemplate(t, taskCat) {
  if (!t) return '';
  if (taskCat === 'Content Creation & Review') return `${t.course || ''} · ${t.module || ''} · ${t.topic || ''}`;
  if (taskCat === 'Recording & Production') return `${t.course || ''} · ${t.module || ''} · ${t.stage || ''}`;
  if (taskCat === 'Process & Tooling') return `${t.tool || ''} · impact ${t.impact || '—'}`;
  return Object.values(t).slice(0, 2).filter(Boolean).join(' · ');
}

// ════════════════════════════════════════════════════════════════════════
// L1 USER DASHBOARD (replaces the manager-only landing for L0/L1)
// ════════════════════════════════════════════════════════════════════════
function L1Dashboard({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const my = CDC.WORKLOGS.filter((w) => w.userId === currentUser.id);
  const recent = my.filter((w) => w.daysAgo <= 6);
  const productSplit = computeProductSplit(recent);
  const totalHrs = recent.reduce((s, w) => s + w.hours, 0);
  const submittedToday = my.some((w) => w.daysAgo === 0);

  return (
    <div className="fadein">
      <GreetingHeader
        currentUser={currentUser}
        context={`${currentUser.title} · ${submittedToday ? "today's report is submitted" : "today's report not submitted yet"}`}
        actions={
          <button className="btn" data-variant="primary" data-size="sm" onClick={() => nav.go('submit')}>
            <Icon name="edit" size={12} /> {submittedToday ? 'Edit today' : 'Submit today'}
          </button>
        }
      />

      {/* Daily workflow banner */}
      {!submittedToday && (
        <div className="submit-banner" style={{ marginBottom: 18 }}>
          <div className="banner-icon"><Icon name="clock" size={14} /></div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">6:00 PM snapshot · review status & note your backlog</div>
            <div className="banner-sub">Takes 5 minutes. Logs against {CDC.empIdForUser(currentUser.id)} for tonight's intake.</div>
          </div>
          <button className="btn" data-variant="primary" data-size="sm" onClick={() => nav.go('submit')}>Submit now</button>
        </div>
      )}

      {/* This-week summary */}
      <h2 className="h-section">Your week</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Tasks logged</div>
          <div className="kpi-value">{recent.length}</div>
          <div className="kpi-meta"><span>last 7 days</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Hours logged</div>
          <div className="kpi-value">{totalHrs.toFixed(0)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>h</span></div>
          <div className="kpi-meta"><span>avg {(totalHrs / 7).toFixed(1)} hr/day</span></div>
        </div>
        <div className="kpi-tile" data-tone={recent.filter((w) => w.status === 'Blocked').length > 0 ? 'red' : undefined}>
          <div className="kpi-name">Blocked</div>
          <div className="kpi-value">{recent.filter((w) => w.status === 'Blocked').length}</div>
          <div className="kpi-meta"><span>{recent.filter((w) => w.status === 'In-progress').length} in-progress</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Submission streak</div>
          <div className="kpi-value">{Math.min(7, new Set(recent.map((w) => w.date)).size)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>d</span></div>
          <div className="kpi-meta"><span>of 7 working days</span></div>
        </div>
      </div>

      {/* Weekly highlights + product split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        <Card title="Weekly highlights" meta="auto-summarized">
          {recent.filter((w) => w.status === 'Done').length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>Nothing marked Done yet this week — keep at it.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
              {recent.filter((w) => w.status === 'Done').slice(0, 5).map((w, i) => (
                <li key={i}>
                  <strong>{w.outputCategory}</strong>
                  <span className="muted"> · {summarizeTemplate(w.template, w.taskCategory)} · {w.hours.toFixed(1)}h</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Product contribution" meta="this week">
          <div className="col" style={{ gap: 8 }}>
            {productSplit.length === 0 ? <div className="muted">No data yet.</div> :
              productSplit.map((p) => {
                const max = productSplit[0].hours;
                return (
                  <div key={p.product}>
                    <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 500 }}>{p.product}</span>
                      <span className="mono">{p.hours.toFixed(1)}h · <span className="muted">{p.pct}%</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(p.hours / max) * 100}%`, height: '100%', background: PRODUCT_COLORS[p.product] || 'var(--accent)' }} />
                    </div>
                  </div>
                );
              })
            }
          </div>
        </Card>
      </div>

      {/* Daily Workflow shortcut */}
      <h2 className="h-section">Daily workflow</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="card card-pad" style={{ cursor: 'default' }} onClick={() => nav.go('submit')}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="banner-icon" style={{ width: 32, height: 32 }}><Icon name="edit" size={14} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Submit today</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>5-min chat-style flow. Captures Product-Audience, Stack, Output Category, Hours.</div>
            </div>
          </div>
        </div>
        <div className="card card-pad" onClick={() => nav.go('my-tasks')}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="banner-icon" style={{ width: 32, height: 32, background: 'var(--amber)' }}><Icon name="flag" size={14} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Escalated tasks</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>What Sentry flagged for you — overdue, blocked, or escalated up the chain.</div>
            </div>
          </div>
        </div>
        <div className="card card-pad" onClick={() => nav.go('worklogs')}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="banner-icon" style={{ width: 32, height: 32, background: 'var(--blue)' }}><Icon name="sheet" size={14} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>My worklogs</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Full submission history — filter by date, output category, status.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.L1Dashboard = L1Dashboard;

// ════════════════════════════════════════════════════════════════════════
// GUIDELINE — user-facing tour (System tab visible to everyone)
// ════════════════════════════════════════════════════════════════════════
function GuidelineView({ tweaks, currentUser, nav }) {
  const role = currentUser.role;
  const roleKey = role === 'L3' || role === 'PRODUCT_OWNER' ? 'L3'
    : role === 'ADMIN' ? 'Admin'
    : role === 'L2' || role === 'SUB_LEAD' || role === 'DEPARTMENT_LEAD' || role === 'CENTRAL_OPS' ? 'L2'
    : 'L1';

  const sections = [
    { id: 'overview', label: '1. How Relay works' },
    { id: 'role', label: '2. Your role' },
    { id: 'daily', label: '3. Daily flow' },
    { id: 'weekly', label: '4. Weekly flow' },
    { id: 'agents', label: '5. Agents' },
    { id: 'loop', label: '6. Self-evolving loop' },
    { id: 'reference', label: '7. Where things live' },
    { id: 'glossary', label: '8. Glossary' },
    { id: 'help', label: '9. Need help?' },
  ];
  const [activeId, setActiveId] = useStR('overview');

  useER(() => {
    const handler = () => {
      const main = document.querySelector('.content');
      if (!main) return;
      // Find which section is closest to top of viewport
      let best = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(`gl-${s.id}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < 120) best = s.id;
      }
      setActiveId(best);
    };
    const main = document.querySelector('.content');
    main?.addEventListener('scroll', handler, { passive: true });
    return () => main?.removeEventListener('scroll', handler);
  }, []);

  function scrollTo(id) {
    const el = document.getElementById(`gl-${id}`);
    if (!el) return;
    const main = document.querySelector('.content');
    if (main) {
      main.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
    }
  }

  return (
    <div className="fadein guideline-page">
      <div className="guideline-layout">
        <div className="guideline-main">
          {/* Hero */}
          <div className="guideline-hero">
            <h1 className="h-title" style={{ fontSize: 28, marginBottom: 6 }}>Welcome to Relay.</h1>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
              Here&apos;s how the whole thing fits together. One short page. Read top to bottom — or jump to your role.
            </p>
            <div className="row" style={{ gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
              <RoleHero level="L1" active={roleKey === 'L1'} text="You submit one short report a day. Relay does the rest." />
              <RoleHero level="L2" active={roleKey === 'L2'} text="Your team submits. Relay drafts the weekly. You review and approve." />
              <RoleHero level="L3" active={roleKey === 'L3'} text="You see what needs your attention. The rest stays out of your way." />
              <RoleHero level="Admin" active={roleKey === 'Admin'} text="You configure the system and approve guideline changes proposed by Curator." />
            </div>
          </div>

          <GuideSection id="gl-overview" defaultOpen icon="sparkles" title="1. How Relay works, in one picture">
            <div className="flow-diagram">
              <div className="flow-step">
                <div className="flow-num">1</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>You submit work</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Daily 5-min chat. Or a meeting transcript. Or a Teams message.</div>
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-step">
                <div className="flow-num">2</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Agents organize it</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Scribe + Dispatcher + Rollup + Sentry + 9 others. Each does one thing well.</div>
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-step">
                <div className="flow-num">3</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Pavan sees the right view at the right time</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Dashboard at 9 AM. Weekly draft on Monday. Notifications only when something needs him.</div>
                </div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 14 }}>
              No jargon required. If something's unclear, ask <button className="btn" data-variant="ghost" data-size="sm" style={{ display: 'inline-flex' }} onClick={() => nav.go('copilot')}><Icon name="sparkles" size={11} /> Concierge</button>.
            </p>
          </GuideSection>

          <GuideSection id="gl-role" defaultOpen icon="copilot" title={`2. Your role at a glance — ${roleKey}`}>
            <YourRole roleKey={roleKey} nav={nav} />
          </GuideSection>

          <GuideSection id="gl-daily" defaultOpen icon="edit" title="3. The Daily flow (~5 minutes)">
            <ol className="guide-steps">
              <li><strong>Open Submit today.</strong> Daily Worklog → Submit today. The chat opens with your EmpID pre-filled.</li>
              <li><strong>Pick Product-Audience + Stack.</strong> NxtWave, NIAT (B1/B2), Intensive Offline, Academy, or Launchpad. Multi-select if you spanned more than one.</li>
              <li><strong>Describe what you did.</strong> Free text — Concierge auto-suggests the Output Category from your description. Confirm or override.</li>
              <li><strong>Add hours + status.</strong> Done / In-progress / Blocked / Overdue. If blocked, give the reason. Done.</li>
            </ol>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              The form remembers your last Product-Audience and Stack — most days are 2 taps + a sentence.
            </p>
          </GuideSection>

          <GuideSection id="gl-weekly" icon="weekly" title="4. The Weekly flow">
            <ul className="guide-list">
              <li><strong>Monday 06:00 IST</strong> — Rollup agent drafts your team&apos;s weekly summary from the past 7 days of daily reports.</li>
              <li><strong>L2 manager reviews</strong> the draft, edits inline (margin comments, Google-Slides-style), and approves.</li>
              <li><strong>Approved drafts</strong> become visible to L3 in their Dashboard.</li>
              <li><strong>Edits become learning signal.</strong> Curator reads every correction and proposes guideline improvements.</li>
            </ul>
          </GuideSection>

          <GuideSection id="gl-agents" icon="sparkles" title="5. What each agent does">
            <div className="agent-mini-grid">
              {window.CDC.RELAY_AGENTS.map((a) => {
                const lastRun = (window.CDC.AI_RUNS || []).find((r) => r.agent === a.name);
                return (
                <div key={a.id} className="agent-mini">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="agent-mini-name">{a.name}</div>
                    <span className="pill" data-tone={a.health === 'warning' ? 'amber' : 'outline'} style={{ fontSize: 9 }}>{a.autonomy}</span>
                  </div>
                  <div className="agent-mini-job">{a.job}</div>
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>{a.trigger}</div>
                  <div className="row" style={{ gap: 5, marginTop: 6, fontSize: 10, color: 'var(--text-faint)', alignItems: 'center' }}>
                    <Icon name="runs" size={9} />
                    {lastRun
                      ? <span>last run {lastRun.ts.replace(/^.* /, '') || lastRun.ts} · <span style={{ color: lastRun.outcome === 'OK' ? 'var(--green)' : lastRun.outcome === 'ERROR' ? 'var(--rose)' : 'inherit' }}>{lastRun.outcome}</span></span>
                      : <span>{a.runsToday ? `${a.runsToday} runs today` : 'idle'} · {a.model || ''}</span>}
                  </div>
                  {(() => {
                    // Auto-Curator learning progress: how many corrections have
                    // accrued since this agent's rules were last refreshed, vs the
                    // threshold that auto-fires Curator. Curator itself is excluded.
                    if (a.name === 'Curator') return null;
                    const thr = window.CDC.CURATOR_AUTO_THRESHOLD || 5;
                    const mem = a.memory;
                    const since = (window.CDC.ENGRAM || []).filter((e) =>
                      e.agent === a.name && e.action && e.action !== 'accept' &&
                      (!mem || !mem.ts || e.ts > mem.ts)).length;
                    return (
                      <div className="row" style={{ gap: 5, marginTop: 4, fontSize: 10, color: 'var(--text-faint)', alignItems: 'center' }}>
                        <Icon name="refresh" size={9} />
                        <span>
                          {mem && mem.rules ? `${mem.rules.length} learned rule${mem.rules.length === 1 ? '' : 's'}` : 'no rules yet'}
                          {mem && mem.ts ? ` · refreshed ${mem.ts.replace(/^.* /, '') || mem.ts}` : ''}
                          {' · '}<span style={{ color: since >= thr ? 'var(--green)' : 'inherit' }}>{Math.min(since, thr)}/{thr}</span> to next refresh
                        </span>
                      </div>
                    );
                  })()}
                </div>
                );
              })}
            </div>
          </GuideSection>

          <GuideSection id="gl-loop" icon="refresh" title="6. The self-evolving loop">
            <div className="loop-viz">
              <div className="loop-node">Agent drafts</div>
              <div className="loop-arrow-h">→</div>
              <div className="loop-node">Human corrects</div>
              <div className="loop-arrow-h">→</div>
              <div className="loop-node">Engram stores</div>
              <div className="loop-arrow-h">→</div>
              <div className="loop-node">Curator clusters</div>
              <div className="loop-arrow-h">→</div>
              <div className="loop-node">Admin approves</div>
              <div className="loop-arrow-h">→</div>
              <div className="loop-node accent">Codex versioned</div>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 14, fontStyle: 'italic', color: 'var(--text-muted)' }}>
              &ldquo;Every correction you make today makes Relay smarter next week.&rdquo;
            </p>
          </GuideSection>

          <GuideSection id="gl-reference" icon="search" title="7. Where things live">
            <table className="guide-table">
              <thead><tr><th>I want to…</th><th>Go to</th></tr></thead>
              <tbody>
                <tr><td>Submit today&apos;s work</td><td>Daily Worklog → <span className="code">Submit today</span></td></tr>
                <tr><td>See my escalated tasks</td><td>Daily Worklog → <span className="code">Escalated Tasks</span></td></tr>
                <tr><td>Review my team&apos;s weekly draft</td><td>Department → <span className="code">Weekly drafts</span></td></tr>
                <tr><td>See who didn&apos;t submit today</td><td>Dashboard → <span className="code">Reports Monitoring</span></td></tr>
                <tr><td>Ask a question about a project</td><td>Intelligence → <span className="code">Concierge</span></td></tr>
                <tr><td>See total AI spend</td><td>System → <span className="code">Tool Expense Tracker</span></td></tr>
                <tr><td>Read the architecture</td><td>System → <span className="code">Codex</span></td></tr>
                <tr><td>Propose a guideline change</td><td className="muted">Auto via Curator — happens on its own</td></tr>
              </tbody>
            </table>
          </GuideSection>

          <GuideSection id="gl-glossary" icon="admin" title="8. Glossary">
            <dl className="guide-glossary">
              <dt>Output Category</dt><dd>The kind of thing you produced today (PPT, TR-Doc, Project, etc.)</dd>
              <dt>Metric Category</dt><dd>Auto-tagged business impact bucket. Derived from Output Category.</dd>
              <dt>Engram</dt><dd>The system&apos;s memory of how humans corrected agent drafts.</dd>
              <dt>Codex</dt><dd>The system&apos;s read-only handbook — architecture, workflows, guidelines.</dd>
              <dt>Curator</dt><dd>The agent that proposes guideline improvements from Engram patterns.</dd>
              <dt>Scope</dt><dd>The slice of data you&apos;re allowed to see, based on your role.</dd>
              <dt>Eval set</dt><dd>Historical corrections used to grade an agent&apos;s output quality.</dd>
              <dt>Beta vs. Prod</dt><dd>Beta is the safe sandbox. Prod is the live system.</dd>
            </dl>
          </GuideSection>

          <GuideSection id="gl-help" icon="copilot" title="9. Need help?">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" data-variant="primary" onClick={() => nav.go('copilot')}>
                <Icon name="sparkles" size={12} /> Open Concierge
              </button>
              <button className="btn">View FAQ</button>
              <button className="btn">Report a bug or request a feature</button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>
              Concierge is your first stop for anything — from &ldquo;how do I submit a report&rdquo; to &ldquo;what blockers does my team have open&rdquo;.
              Feedback routes to Admin&apos;s inbox.
            </p>
          </GuideSection>

          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11 }}>
            Relay · v0.7 · <span className="mono">department copilot</span>
          </div>
        </div>

        {/* Sticky TOC */}
        <aside className="guideline-toc">
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>Contents</div>
          <ul>
            {sections.map((s) => (
              <li key={s.id} data-active={activeId === s.id}>
                <a onClick={() => scrollTo(s.id)}>{s.label}</a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
window.GuidelineView = GuidelineView;

function RoleHero({ level, active, text }) {
  return (
    <div className={`role-hero ${active ? 'active' : ''}`}>
      <Pill tone={active ? 'accent' : 'outline'} dot={active}>{level}</Pill>
      <span style={{ fontSize: 12.5 }}>{text}</span>
    </div>
  );
}

function YourRole({ roleKey, nav }) {
  const content = {
    L1: {
      main: 'You submit one short report a day.',
      bullets: [
        'Use Submit today every workday by 22:00 IST.',
        'Captures Product-Audience, Stack, Output Category, hours, status.',
        'You only see your own data — no team-mate visibility.',
        'If you mark Blocked, the reason flows up to your manager via Sentry.',
      ],
      cta: { label: 'Open Submit today', route: 'submit' },
    },
    L2: {
      main: 'Your team submits. Relay drafts the weekly. You review and approve.',
      bullets: [
        'See your Sub Department\'s submissions in your Sub Department view.',
        'Click any employee card to see their weekly + history + workflow activity.',
        'Monday morning: review the Weekly draft Rollup generated for your team.',
        'Your inline edits become learning signal for Curator.',
      ],
      cta: { label: 'Open Weekly drafts', route: 'weekly' },
    },
    L3: {
      main: 'You see what needs your attention. The rest stays out of your way.',
      bullets: [
        'Open Dashboard in the morning. Six sections, top to bottom.',
        'Reports Monitoring, Escalations, Agentic Adoption, Weekly Reports, Department Analytics, Agent Activity.',
        'Drill into any Sub Department via Department Analytics → Sub Department view.',
        'Notifications fire only when something needs you (Sentry).',
      ],
      cta: { label: 'Open Dashboard', route: 'dashboard' },
    },
    Admin: {
      main: 'You configure the system and approve guideline changes.',
      bullets: [
        'Curator proposes guideline edits weekly. You approve / reject / send back.',
        'Configure connectors (Teams, Outlook, SSO) and feature flags.',
        'Beta → Prod promotion is eval-gated; you authorize.',
        'Tool Expense and AI Runs are your operational windows.',
      ],
      cta: { label: 'Open Engram', route: 'engram' },
    },
  };
  const c = content[roleKey];
  return (
    <>
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 12px', fontWeight: 500 }}>{c.main}</p>
      <ul className="guide-list">
        {c.bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
      <button className="btn" data-variant="primary" data-size="sm" style={{ marginTop: 10 }} onClick={() => nav.go(c.cta.route)}>
        {c.cta.label} →
      </button>
    </>
  );
}

function GuideSection({ id, icon, title, defaultOpen, children }) {
  const [open, setOpen] = useStR(!!defaultOpen);
  return (
    <section id={id} className="guide-section">
      <div className="guide-section-head" onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} size={16} />
        <h2>{title}</h2>
        <Icon name={open ? 'chev-down' : 'chev-right'} size={12} />
      </div>
      {open && <div className="guide-section-body">{children}</div>}
    </section>
  );
}
