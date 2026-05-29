// CD-Copilot — Dashboard + Department drilldown.
// Reads window.CDC for data and routing via App context.

const { useState: useState_d, useMemo: useMemo_d, useEffect: useEffect_d } = React;

// ── Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const depts = CDC.filterDepartments(currentUser.id);
  const reports = CDC.filterReports(currentUser.id);
  const tasks = CDC.filterTasks(currentUser.id);
  const flags = CDC.filterFlags(currentUser.id);
  const weekly = CDC.filterWeekly(currentUser.id);
  const worklogs = CDC.filterWorklogs(currentUser.id);

  // 1. Reports today — true %
  const totalExpected = depts.reduce((s, d) => s + (CDC.DEPT_HEALTH[d.id]?.totalExpected || 0), 0);
  const totalReports = depts.reduce((s, d) => s + (CDC.DEPT_HEALTH[d.id]?.activeReports || 0), 0);
  const missingCount = Math.max(0, totalExpected - totalReports);
  const reportPct = totalExpected > 0 ? Math.round((totalReports / totalExpected) * 100) : 0;
  const reportTone = reportPct >= 80 ? 'green' : reportPct >= 60 ? 'amber' : 'red';

  // 2. Flagged reports
  const vagueFlags = flags.filter((f) => f.kind === 'low_content' && f.state === 'open');
  const overdueTasks = tasks.filter((t) => t.status === 'ACTIVE' || t.status === 'SUGGESTED').filter((t) => (t.reason || '').toLowerCase().includes('overdue') || t.status === 'SUGGESTED').slice(0, 12);

  // 3. Escalations (team-level) — derive from flags + missing-report streaks
  const escalations = computeEscalations(CDC, depts);

  // 4. Agentic adoption — % of worklogs in last 7d that have a workflow used (we'll proxy from template.workflow presence)
  const adoption = computeAdoption(CDC, depts, worklogs);

  // 5. Weekly reports grid
  const weeklyRows = depts.map((d) => {
    const w = weekly.find((x) => x.dept === d.id);
    return { dept: d, w };
  });

  // 6. Dept chart (Reports today, Blockers, Overdue, Backlog)
  const deptChart = depts.map((d) => {
    const h = CDC.DEPT_HEALTH[d.id] || {};
    const deptTasks = tasks.filter((t) => t.dept === d.id);
    const backlog = deptTasks.filter((t) => t.status !== 'DONE').length;
    return {
      d, h,
      reportsToday: `${h.activeReports || 0}/${h.totalExpected || 0}`,
      reportsTone: (h.activeReports || 0) / Math.max(1, h.totalExpected || 1) >= 0.8 ? 'green' : 'amber',
      blockers: h.openBlockers || 0,
      blockerReason: topBlockerReason(CDC, d.id),
      overdue: h.overdueTasks || 0,
      backlog,
      completionPct: deptTasks.length > 0 ? Math.round(deptTasks.filter((t) => t.status === 'DONE').length / deptTasks.length * 100) : null,
    };
  });

  // Daily captured work — worklogs submitted today + tasks created today,
  // normalized to the CD Task-flow daily columns.
  const todayStr = CDC.fmt(CDC.today);
  const tmplText = (tmpl) => tmpl && typeof tmpl === 'object' ? Object.values(tmpl).filter(Boolean).join(' · ') : '';
  const STATUS_LABEL = { ACTIVE: 'In-progress', DONE: 'Done', BLOCKED: 'Blocked', ESCALATED: 'Escalated', BACKLOG: 'Backlog', OVERDUE: 'Overdue' };
  const capturedToday = [
    ...worklogs.filter((w) => w.date === todayStr).map((w) => ({
      empId: w.empId || w.userId, metric: w.metricCategory, products: w.products || [], taskCat: w.taskCategory,
      stacks: w.stacks || [], outputCat: w.outputCategory, count: w.outputCount,
      task: tmplText(w.template), status: w.status, reason: w.reason, est: w.hours,
    })),
    // Every captured task in scope (manual, MOM-derived, agent — any source),
    // excluding untriaged suggestions and rejected ones.
    ...tasks.filter((t) => !['SUGGESTED', 'REJECTED'].includes(t.status)).map((t) => {
      const o = CDC.lookup.user(t.owner) || {};
      return { empId: o.empId || t.owner, metric: t.metricCategory, products: t.products || [], taskCat: t.taskCategory,
        stacks: t.stacks || [], outputCat: t.outputCategory, count: t.outputCount,
        task: tmplText(t.template) || t.title, status: STATUS_LABEL[t.status] || t.status,
        reason: t.blockReason || t.escalReason, est: t.estHours, src: t.source === 'manual' ? null : (t.reason || t.source) };
    }),
  ];

  return (
    <div className="fadein">
      {/* Context strip */}
      <GreetingHeader
        currentUser={currentUser}
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Re-run intake</button>
            <button className="btn" data-variant="primary" data-size="sm" onClick={() => nav.go('copilot')}><Icon name="sparkles" size={12} /> Ask Concierge</button>
          </>
        }
      />

      {/* Section 1: Reports today */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="kpi-tile" data-tone={reportTone}>
          <div className="kpi-name">Reports today</div>
          <div className="kpi-value">{totalReports}<span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>/{totalExpected}</span></div>
          <div className="kpi-meta">
            <span>{missingCount} missing</span>
            <Pill tone={reportTone} dot>{reportPct}%</Pill>
          </div>
        </div>

        {/* Section 2: Flagged reports — combined card */}
        <div className="kpi-tile" data-tone={vagueFlags.length + overdueTasks.length > 0 ? 'amber' : undefined}>
          <div className="kpi-name">Flagged reports</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div className="kpi-value">{vagueFlags.length + overdueTasks.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <div><span className="mono">{vagueFlags.length}</span> vague</div>
              <div><span className="mono">{overdueTasks.length}</span> overdue</div>
            </div>
          </div>
          <div className="kpi-meta"><span>flag → task pipeline</span><button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('engram')}>Triage →</button></div>
        </div>

        {/* Section 3: Escalations (team-level rollup) */}
        <div className="kpi-tile" data-tone={escalations.length > 0 ? 'red' : undefined}>
          <div className="kpi-name">Escalations</div>
          <div className="kpi-value">{escalations.length}</div>
          <div className="kpi-meta"><span>team-level</span><button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('tasks')}>Open →</button></div>
        </div>

        {/* Section 4: Agentic workflow adoption (summary tile, full grid below) */}
        <div className="kpi-tile">
          <div className="kpi-name">Agentic adoption</div>
          <div className="kpi-value">{Math.round(adoption.reduce((s, a) => s + a.pct, 0) / Math.max(1, adoption.length))}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>%</span></div>
          <div className="kpi-meta"><span>avg across {adoption.length} sub-teams</span></div>
        </div>
      </div>

      {/* Section 3 expanded — escalations list */}
      {escalations.length > 0 && (
        <>
          <h2 className="h-section">Escalations · team-level</h2>
          <Card pad={false}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sub Department</th>
                  <th>L2</th>
                  <th>Reason</th>
                  <th>Trigger</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((e, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.team}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{e.deptName}</div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <Avatar user={CDC.lookup.user(e.managerId)} size={20} />
                        <span style={{ fontSize: 12.5 }}>{CDC.lookup.user(e.managerId)?.name || '—'}</span>
                      </div>
                    </td>
                    <td><Pill tone={e.tone || 'amber'} dot>{e.reason}</Pill></td>
                    <td className="muted" style={{ fontSize: 12 }}>{e.trigger}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('department', { id: e.deptId })}>Open →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Section 4: Agentic adoption — bar per sub-team */}
      <h2 className="h-section">Agentic workflow adoption · this week</h2>
      <Card pad={false}>
        <div style={{ padding: 4 }}>
          {adoption.map((a) => (
            <div key={a.sub} className="row" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', gap: 14 }}>
              <div style={{ width: 240, fontSize: 12.5, fontWeight: 500 }}>
                {a.sub}
                <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{a.dept}</div>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ height: 8, background: 'var(--panel-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${a.pct}%`, height: '100%', background: a.pct >= 70 ? 'var(--green)' : a.pct >= 40 ? 'var(--amber)' : 'var(--red)' }} />
                </div>
              </div>
              <div className="mono" style={{ minWidth: 50, textAlign: 'right', fontWeight: 600 }}>{a.pct}%</div>
              <div className="muted mono" style={{ width: 80, textAlign: 'right', fontSize: 11 }}>
                {a.workflowUsed}/{a.totalReports} ppl
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Section 5: Weekly reports — team grid */}
      <h2 className="h-section">Weekly reports · team-wise</h2>
      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Sub Department</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Last action</th>
              <th>Approver</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {weeklyRows.map(({ dept: d, w }) => (
              <tr key={d.id} onClick={() => nav.go('weekly')}>
                <td>
                  <div style={{ fontWeight: 500 }}>{d.short || d.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>week of {w?.weekOf || '—'}</div>
                </td>
                <td>{w ? <Pill dot tone={w.status === 'PUBLISHED' ? 'green' : w.status === 'DRAFT' ? 'amber' : 'outline'}>{w.status.toLowerCase()}</Pill> : <Pill tone="outline">no draft</Pill>}</td>
                <td><ConfChip value={w?.confidence} show={tweaks.confidence} /></td>
                <td className="muted mono" style={{ fontSize: 11.5 }}>{w?.generatedAt || '—'}</td>
                <td>
                  {w?.editedBy ? (
                    <div className="row" style={{ gap: 6 }}>
                      <Avatar user={CDC.lookup.user(w.editedBy)} size={18} />
                      <span style={{ fontSize: 12 }}>{CDC.lookup.user(w.editedBy)?.name}</span>
                    </div>
                  ) : <span className="muted" style={{ fontSize: 12 }}>— pending</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn" data-size="sm" data-variant="ghost">Review →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Section 6: Dept chart */}
      <h2 className="h-section">Department chart</h2>
      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Department</th>
              <th>Reports today</th>
              <th>Blockers</th>
              <th>Overdue</th>
              <th>Backlog</th>
              <th>Task completion %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deptChart.map((row) => {
              const ragProps = ragRowProps(tweaks.rag, row.reportsTone);
              return (
                <tr key={row.d.id} {...ragProps} onClick={() => nav.go('department', { id: row.d.id })}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.d.short || row.d.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{row.d.subs.length} sub-team{row.d.subs.length === 1 ? '' : 's'}</div>
                  </td>
                  <td className="num" style={{ color: row.reportsTone === 'amber' ? 'var(--amber)' : undefined, fontWeight: row.reportsTone === 'amber' ? 600 : undefined }}>{row.reportsToday}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <span className="mono" style={{ fontWeight: 600 }}>{row.blockers}</span>
                      {row.blockerReason && <span className="muted" style={{ fontSize: 11 }}>· {row.blockerReason}</span>}
                    </div>
                  </td>
                  <td className="num">{row.overdue}</td>
                  <td className="num">{row.backlog}</td>
                  <td>
                    {row.completionPct == null ? <span className="muted">—</span> :
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ width: 50, height: 4, background: 'var(--panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${row.completionPct}%`, height: '100%', background: row.completionPct >= 70 ? 'var(--green)' : row.completionPct >= 40 ? 'var(--amber)' : 'var(--red)' }} />
                        </div>
                        <span className="mono" style={{ minWidth: 30, textAlign: 'right' }}>{row.completionPct}%</span>
                      </div>
                    }
                  </td>
                  <td style={{ textAlign: 'right' }}><Icon name="chev-right" size={14} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Captured work — CD Task-flow daily format (worklogs today + all tasks) */}
      <h2 className="h-section">Captured work <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {capturedToday.length} entries</span></h2>
      <Card pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th>EMP ID</th><th>Metric</th><th>Product-Audience</th><th>Task Category</th>
                <th>Stack</th><th>Output Category</th><th className="num">Count</th><th>Task</th>
                <th>Status</th><th>Reason</th><th className="num">Est (h)</th>
              </tr>
            </thead>
            <tbody>
              {capturedToday.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 11 }}>{r.empId}</td>
                  <td>{r.metric ? <Pill tone="accent">{r.metric}</Pill> : <span className="muted">—</span>}</td>
                  <td style={{ fontSize: 12 }}>{(r.products || []).join(', ') || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.taskCat || '—'}</td>
                  <td style={{ fontSize: 12 }}>{(r.stacks || []).join(', ') || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.outputCat || '—'}</td>
                  <td className="num">{r.count != null ? r.count : '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 240 }}>
                    {r.task || '—'}
                    {r.src && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{r.src}</div>}
                  </td>
                  <td><Pill tone={r.status === 'Done' ? 'green' : r.status === 'Blocked' || r.status === 'Escalated' ? 'red' : r.status === 'Backlog' ? 'amber' : 'outline'}>{r.status}</Pill></td>
                  <td className="muted" style={{ fontSize: 11.5, maxWidth: 180 }}>{r.reason || '—'}</td>
                  <td className="num">{r.est != null && r.est !== '' ? r.est : '—'}</td>
                </tr>
              ))}
              {capturedToday.length === 0 && <tr><td colSpan={11}><div className="empty">No work captured today yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 7: Agent activity */}
      <h2 className="h-section">Agent activity</h2>
      <Card pad={false} actions={<button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('runs')}>All runs →</button>}>
        <div style={{ padding: 4 }}>
          {CDC.ACTIVITY.map((a) => (
            <div key={a.id} className="row" style={{ padding: '10px 16px', gap: 12, borderBottom: '1px solid var(--border)' }} onClick={() => nav.go('runs')}>
              <div style={{ width: 24, height: 24, borderRadius: 5, background: 'var(--panel-2)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{a.icon}</div>
              <div style={{ flex: 1, fontSize: 12.5 }}>{a.text}</div>
              <span className="mono faint" style={{ fontSize: 11 }}>{a.ts}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
window.Dashboard = Dashboard;

// ── Helpers for the new dashboard ──────────────────────────────────────
function computeEscalations(CDC, depts) {
  const esc = [];
  // Missing reports streak
  if (CDC.DEPT_HEALTH['d-dsalgo']?.reportRate < 0.75) {
    esc.push({ deptId: 'd-dsalgo', deptName: 'Content — DS&Algo', team: 'Content — DS&Algo',
      managerId: 'NW0002023', reason: 'Missing reports 2 days', trigger: '2 of last 5 daily reports missing',
      tone: 'red',
    });
  }
  // Recurring blocker
  esc.push({ deptId: 'd-fsgci', deptName: 'Content — FS, GenAI & CO', team: 'Central Ops',
    managerId: 'NW0001771', reason: 'Recurring blocker 3+ days', trigger: 'NAT throttle blocker cited 3d running',
    tone: 'amber',
  });
  // SLA breach
  esc.push({ deptId: 'd-fsgci', deptName: 'Content — FS, GenAI & CO', team: 'Content — GenAI',
    managerId: 'NW0001778', reason: 'Budget SLA — paid-tier ask aging', trigger: 'Vector-DB free-tier exhaustion in 3w',
    tone: 'amber',
  });
  return esc;
}

function computeAdoption(CDC, depts, worklogs) {
  // Per sub-team: count distinct users who had a workflow in their worklog this week.
  // We treat presence of template.workflow as proxy.
  const result = [];
  for (const d of depts) {
    for (const sub of d.subs) {
      const subLogs = worklogs.filter((w) => w.sub === sub && w.daysAgo <= 6);
      const users = new Set(subLogs.map((w) => w.userId));
      const withWorkflow = new Set(subLogs.filter((w) => (w.template?.workflow || w.template?.tool)).map((w) => w.userId));
      // Synthesize an expected count from DEPT_HEALTH if no data
      const expectedTotal = users.size || 3;
      result.push({
        sub, dept: d.short || d.name,
        totalReports: expectedTotal,
        workflowUsed: withWorkflow.size,
        pct: expectedTotal > 0 ? Math.round((withWorkflow.size / expectedTotal) * 100) : 0,
      });
    }
  }
  return result.sort((a, b) => b.pct - a.pct);
}

function topBlockerReason(CDC, deptId) {
  const reps = CDC.REPORTS.filter((r) => r.dept === deptId);
  const blockers = reps.flatMap((r) => r.items?.filter((it) => it.kind === 'blocker') || []);
  if (blockers.length === 0) return null;
  // Take the shortest distinctive phrase
  const text = blockers[0].text.split('.')[0];
  const short = text.length > 40 ? text.slice(0, 38) + '…' : text;
  return short;
}

function ragRowProps(treatment, status) {
  if (treatment === 'tint') return { 'data-rag-bg': status };
  if (treatment === 'border') return { 'data-rag-border': status };
  return {};
}

function formatNum(n) {
  if (n == null) return '—';
  if (n >= 10000) return n.toLocaleString();
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}
window.formatNum = formatNum;
window.ragRowProps = ragRowProps;

// ── Department drilldown ────────────────────────────────────────────────
function DepartmentView({ deptId, tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const dept = CDC.lookup.dept(deptId);
  const health = CDC.DEPT_HEALTH[deptId];
  if (!dept || !health) return <div className="empty">Department not found</div>;

  // Determine sub-teams shown for this user
  let visibleSubs = dept.subs;
  const scope = CDC.scopeForUser(currentUser.id);
  if (scope.kind === 'sub') visibleSubs = [scope.sub];

  const allReports = CDC.REPORTS.filter((r) => r.dept === deptId && visibleSubs.includes(r.sub));
  const kpis = CDC.KPIS.filter((k) => k.dept === deptId);
  const flags = CDC.FLAGS.filter((f) => f.target?.dept === deptId);

  const [selectedReport, setSelectedReport] = useState_d(allReports.find((r) => !r.missing)?.id || null);
  const selected = allReports.find((r) => r.id === selectedReport);

  return (
    <div className="fadein">
      <div className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => nav.go('dashboard')}>← Dashboard</button>
        <span className="muted">/</span>
        <span className="muted">{dept.bdName}</span>
        <span className="muted">/</span>
        <span className="muted">{dept.productName}</span>
        <span className="muted">/</span>
        <span>{dept.name}</span>
      </div>

      <SectionHeader
        title={dept.name}
        subtitle={`${dept.productName} · Lead: ${dept.lead ? CDC.lookup.user(dept.lead)?.name : '— unassigned'} · ${dept.subs.length} sub-teams`}
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Refresh</button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('copilot', { prefill: `What's happening in ${dept.name} this week?` })}><Icon name="sparkles" size={12} /> Ask about {dept.name}</button>
          </>
        }
      />

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="kpi-tile" data-tone={health.status}>
          <div className="kpi-name">Health score</div>
          <div className="kpi-value">{health.score} <span style={{ fontSize: 13, color: `var(--${health.status})`, fontWeight: 500 }}>{health.trend > 0 ? '+' : ''}{health.trend}</span></div>
          <Sparkline data={health.sparkline} width={140} height={28} color={`var(--${health.status})`} />
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Report rate (7d)</div>
          <div className="kpi-value">{Math.round(health.reportRate * 100)}%</div>
          <div className="kpi-meta"><span>{health.activeReports} of {health.totalExpected} expected</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Open blockers</div>
          <div className="kpi-value">{health.openBlockers}</div>
          <div className="kpi-meta"><span>{health.overdueTasks} overdue tasks</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">KPIs on track</div>
          <div className="kpi-value">{Math.round(health.kpiOnTrack * 100)}%</div>
          <div className="kpi-meta"><span>{kpis.filter((k) => k.status === 'green').length} of {kpis.length}</span></div>
        </div>
      </div>

      <h2 className="h-section">Sub-teams & daily reports</h2>
      <div className="split" style={{ height: 540 }}>
        <div className="split-list">
          {visibleSubs.map((sub) => {
            const subReports = allReports.filter((r) => r.sub === sub);
            const latest = subReports[0];
            return (
              <div key={sub} style={{ marginBottom: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between', padding: '6px 4px', fontSize: 11, color: 'var(--text-faint)', letterSpacing: 0.06, textTransform: 'uppercase', fontWeight: 600 }}>
                  <span>{sub}</span>
                  <span className="mono">{subReports.length}</span>
                </div>
                {subReports.map((r) => {
                  const author = CDC.lookup.author(r.author);
                  return (
                    <div
                      key={r.id}
                      className="list-row"
                      data-active={selectedReport === r.id}
                      onClick={() => setSelectedReport(r.id)}
                    >
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div className="row" style={{ gap: 8 }}>
                          <Avatar user={{ initials: (author?.name || '').split(' ').map((p) => p[0]).join('') }} size={20} />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 12.5 }}>{author?.name}</div>
                            <div className="muted" style={{ fontSize: 11 }}>{r.date} · {r.submittedAt}</div>
                          </div>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <ConfChip value={r.confidence} show={tweaks.confidence} />
                        </div>
                      </div>
                      <div className="row" style={{ gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                        {r.missing ? (
                          <Pill tone="red" dot>missing</Pill>
                        ) : (
                          <>
                            {countKind(r, 'done') > 0 && <Pill tone="green">{countKind(r, 'done')} done</Pill>}
                            {countKind(r, 'blocker') > 0 && <Pill tone="red">{countKind(r, 'blocker')} blocker</Pill>}
                            {countKind(r, 'risk') > 0 && <Pill tone="amber">{countKind(r, 'risk')} risk</Pill>}
                            {r.validation === 'PARTIAL' && <Pill tone="amber">partial</Pill>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {subReports.length === 0 && (
                  <div className="list-row" style={{ background: 'var(--panel)', borderStyle: 'dashed' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Pill tone="red" dot>no report today</Pill>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{sub}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="split-pane">
          {selected ? (
            <ReportDetail report={selected} tweaks={tweaks} />
          ) : (
            <div className="empty">Select a report to view detail.</div>
          )}
        </div>
      </div>
    </div>
  );
}
window.DepartmentView = DepartmentView;

function countKind(r, kind) {
  return r.items?.filter((it) => it.kind === kind).length || 0;
}

function ReportDetail({ report, tweaks }) {
  const CDC = window.CDC;
  const author = CDC.lookup.author(report.author);
  return (
    <>
      <div className="detail-h">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{author?.name} <span className="muted" style={{ fontWeight: 400 }}>· {author?.sub}</span></h3>
              <ConfChip value={report.confidence} show={tweaks.confidence} />
              <Pill tone={report.validation === 'OK' ? 'green' : 'amber'}>{report.validation}</Pill>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              <span className="mono">{report.id}</span> · {report.date} · submitted {report.submittedAt} via Google Sheet · ingested by ReportIntake agent
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" data-size="sm"><Icon name="sheet" size={12} /> Source row</button>
            <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Re-run intake</button>
          </div>
        </div>
      </div>
      <div className="detail-b">
        {report.warnings && report.warnings.length > 0 && (
          <div style={{ background: 'var(--amber-soft)', color: 'var(--amber)', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            <strong>Validation warnings:</strong> {report.warnings.join(' · ')}
          </div>
        )}

        <div className="detail-section">Items ({report.items.length})</div>
        <div className="col" style={{ gap: 8 }}>
          {report.items.map((it, i) => (
            <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span className="item-kind" data-kind={it.kind}>{it.kind[0].toUpperCase()}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.04, marginRight: 6, fontWeight: 500 }}>{it.kind}</span>
                <span>{it.text}</span>
              </div>
            </div>
          ))}
        </div>

        {report.kpiHits && report.kpiHits.length > 0 && (
          <>
            <div className="detail-section">Linked KPIs</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {report.kpiHits.map((kid) => {
                const k = CDC.lookup.kpi(kid);
                if (!k) return null;
                return <Pill key={kid} tone={k.status} dot>{k.name}</Pill>;
              })}
            </div>
          </>
        )}

        <div className="detail-section">Audit</div>
        <dl className="kv">
          <dt>Source</dt><dd className="mono code">google.sheets · CD-DailyReports / {report.date}!A:Z</dd>
          <dt>Intake run</dt><dd className="mono">run-1101 · claude-haiku-4-5 · 412 ms</dd>
          <dt>Scope hash</dt><dd className="mono">7a1f…3e (RBAC: dept=Content, sub={author?.sub})</dd>
          <dt>Cited by</dt><dd>2 tasks · 1 weekly draft</dd>
        </dl>
      </div>
    </>
  );
}
window.ReportDetail = ReportDetail;
