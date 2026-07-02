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

  // 1. Logged today — live: distinct contributors with a worklog today vs members.
  const dashToday = CDC.fmt(CDC.today);
  const deptIdSet = new Set(depts.map((d) => d.id));
  const totalExpected = (CDC.USERS || []).filter((u) => deptIdSet.has(u.dept)).length;
  const totalReports = new Set(worklogs.filter((w) => w.date === dashToday).map((w) => w.userId)).size;
  const missingCount = Math.max(0, totalExpected - totalReports);
  const reportPct = totalExpected > 0 ? Math.round((totalReports / totalExpected) * 100) : 0;
  const reportTone = reportPct >= 80 ? 'green' : reportPct >= 60 ? 'amber' : 'red';

  // 2. Flagged — live: open low-content flags + genuinely overdue tasks.
  const vagueFlags = flags.filter((f) => f.kind === 'low_content' && f.state === 'open');
  const overdueTasks = tasks.filter((t) => t.due && t.due < dashToday && t.status !== 'DONE' && t.status !== 'REJECTED').slice(0, 50);

  // 3. Escalations — live from tasks (status ESCALATED).
  const escalations = computeEscalations(CDC, depts, tasks);

  // 4. Agentic adoption — % of worklogs in last 7d that have a workflow used (we'll proxy from template.workflow presence)
  const adoption = computeAdoption(CDC, depts, worklogs);

  // 5. Weekly reports grid
  const weeklyRows = depts.map((d) => {
    const w = weekly.find((x) => x.dept === d.id);
    return { dept: d, w };
  });

  // 6. Dept chart — all live from worklogs/tasks (no dept_health snapshot).
  const deptChart = depts.map((d) => {
    const deptTasks = tasks.filter((t) => t.dept === d.id);
    const members = (CDC.USERS || []).filter((u) => u.dept === d.id).length;
    const loggedToday = new Set(worklogs.filter((w) => w.dept === d.id && w.date === dashToday).map((w) => w.userId)).size;
    const backlog = deptTasks.filter((t) => t.status !== 'DONE' && t.status !== 'REJECTED').length;
    const blockers = deptTasks.filter((t) => t.status === 'BLOCKED' || t.status === 'ESCALATED').length;
    const overdue = deptTasks.filter((t) => t.due && t.due < dashToday && t.status !== 'DONE' && t.status !== 'REJECTED').length;
    return {
      d,
      reportsToday: `${loggedToday}/${members}`,
      reportsTone: loggedToday / Math.max(1, members) >= 0.8 ? 'green' : 'amber',
      blockers,
      blockerReason: topBlockerReason(CDC, d.id),
      overdue,
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
    // Tasks created TODAY (manual, MOM-derived, agent — any source), excluding
    // untriaged suggestions/rejected — and excluding tasks whose mirrored
    // worklog is already listed above (they'd double-count).
    ...tasks.filter((t) => t.created === todayStr && !['SUGGESTED', 'REJECTED'].includes(t.status)
      && !worklogs.some((w) => w.taskId === t.id && w.date === todayStr)).map((t) => {
      const o = CDC.lookup.user(t.owner) || {};
      return { empId: o.empId || t.owner, metric: t.metricCategory, products: t.products || [], taskCat: t.taskCategory,
        stacks: t.stacks || [], outputCat: t.outputCategory, count: t.outputCount,
        task: tmplText(t.template) || t.title, status: STATUS_LABEL[t.status] || t.status,
        reason: t.blockReason || t.escalReason, est: t.estHours, src: t.source === 'manual' ? null : (t.reason || t.source) };
    }),
  ];

  const adoptionAvg = Math.round(adoption.reduce((s, a) => s + a.pct, 0) / Math.max(1, adoption.length));
  const flaggedTotal = vagueFlags.length + overdueTasks.length;

  return (
    <div className="fadein">
      {/* Signature hero — the team's live daily pulse. */}
      <PulseHero
        currentUser={currentUser}
        eyebrow="Team pulse · live"
        actions={<>
          <button className="btn" data-variant="accent" data-size="sm" onClick={() => nav.go('copilot')}><Icon name="sparkles" size={12} /> Ask Concierge</button>
          <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Re-run intake</button>
        </>}
        ring={{
          pct: reportPct, label: 'logged today', tone: reportTone,
          onClick: () => nav.go('missing'), title: "See who hasn't logged today",
          sub: <><span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{totalReports}/{totalExpected}</span> people · {missingCount} pending</>,
        }}
        stats={[
          { label: 'Flagged', value: flaggedTotal, tone: flaggedTotal > 0 ? 'amber' : 'green', hint: `${vagueFlags.length} vague · ${overdueTasks.length} overdue`,
            onClick: () => (vagueFlags.length >= overdueTasks.length ? nav.go('engram') : nav.go('tasks', { filter: 'OVERDUE' })) },
          { label: 'Escalations', value: escalations.length, tone: escalations.length > 0 ? 'red' : 'green', hint: 'team-level',
            onClick: () => nav.go('tasks', { filter: 'ESCALATED' }) },
          { label: 'Agentic adoption', value: `${adoptionAvg}%`, tone: adoptionAvg >= 70 ? 'green' : adoptionAvg >= 40 ? 'amber' : 'red', hint: `avg · ${adoption.length} sub-teams`,
            onClick: () => nav.go('farm') },
        ]}
      />

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
              <th className="num">Reports today</th>
              <th className="num">Blockers</th>
              <th className="num">Overdue</th>
              <th className="num">Backlog</th>
              <th className="num">Task completion %</th>
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
              <span className="mono faint" style={{ fontSize: 11 }}>{(window.CDC.fmtTs && window.CDC.fmtTs(a.ts)) || a.ts}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
window.Dashboard = Dashboard;

// ── Signature hero: live "pulse" command center (reused by every dashboard) ──
// Generic API so L3/L2/L1 each get the same striking banner with role-relevant
// data: an auto greeting + live IST clock, an optional focal completion ring,
// up to three vital stat cards, and custom action buttons.
const PULSE_TONE = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', accent: 'var(--accent)' };
function PulseHero({ currentUser, eyebrow = 'Live', context, ring, stats = [], actions }) {
  const [now, setNow] = useState_d(new Date());
  useEffect_d(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const ist = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', ...opts }).format(now);
  const hour = Number(ist({ hour: '2-digit', hour12: false }));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  const first = (currentUser && currentUser.name ? currentUser.name.split(' ')[0] : 'there');
  const dateline = `${ist({ weekday: 'long' })} · ${ist({ month: 'long', day: 'numeric' })} · ${ist({ hour: '2-digit', minute: '2-digit', hour12: false })} IST`;
  const hasRing = ring && Number.isFinite(ring.pct);
  return (
    <div className="pulse-hero" data-no-ring={!hasRing}>
      <div className="pulse-main">
        <div className="pulse-eyebrow"><span className="dot" data-tone="green" data-pulse="true" /> {eyebrow}</div>
        <h1 className="pulse-title">{greet}, {first}.</h1>
        <div className="pulse-dateline">{context ? <>{context} · {dateline}</> : dateline}</div>
        {actions && <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>{actions}</div>}
      </div>

      {hasRing && (
        <div className="pulse-ring-wrap" onClick={ring.onClick} style={{ cursor: ring.onClick ? 'pointer' : 'default' }} title={ring.title || ''}>
          <div className="ring" style={{ '--pct': Math.max(0, Math.min(100, ring.pct)), '--ring-color': PULSE_TONE[ring.tone] || 'var(--accent)' }}>
            <div className="ring-center">
              <div className="ring-pct">{ring.pct}<span>%</span></div>
              <div className="ring-lbl">{ring.label}</div>
            </div>
          </div>
          {ring.sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>{ring.sub}</div>}
        </div>
      )}

      {stats.length > 0 && (
        <div className="pulse-stats">
          {stats.map((s, i) => <PulseStat key={i} {...s} />)}
        </div>
      )}
    </div>
  );
}

function PulseStat({ label, value, tone, hint, onClick }) {
  return (
    <div className="pulse-stat" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="pulse-stat-top"><span className="dot" data-tone={tone} /><span className="pulse-stat-label">{label}</span></div>
      <div className="pulse-stat-value">{value}</div>
      <div className="pulse-stat-hint">{hint}</div>
    </div>
  );
}
window.PulseHero = PulseHero;
window.PulseStat = PulseStat;

// ── Helpers for the new dashboard ──────────────────────────────────────
function computeEscalations(CDC, depts, tasks) {
  // Live: one row per task currently ESCALATED, scoped to the visible departments.
  const deptIds = new Set(depts.map((d) => d.id));
  return (tasks || [])
    .filter((t) => t.status === 'ESCALATED' && (!t.dept || deptIds.has(t.dept)))
    .map((t) => {
      const owner = CDC.lookup.user(t.owner) || {};
      const d = CDC.lookup.dept(t.dept) || {};
      return {
        deptId: t.dept, deptName: d.name || t.dept || '—', team: owner.sub || d.name || '—',
        managerId: t.escalatedTo || owner.managerId, reason: t.escalReason || 'Escalated',
        trigger: t.title, tone: 'red',
      };
    });
}

function computeAdoption(CDC, depts, worklogs) {
  // Per sub-team: count distinct users who had a workflow in their worklog this week.
  // We treat presence of template.workflow as proxy.
  const result = [];
  for (const d of depts) {
    for (const sub of d.subs) {
      const subLogs = worklogs.filter((w) => w.sub === sub && (w.daysAgo ?? 0) <= 6);
      const users = new Set(subLogs.map((w) => w.userId));
      const withWorkflow = new Set(subLogs.filter((w) => (w.template?.workflow || w.template?.tool)).map((w) => w.userId));
      // Live denominator: distinct contributors who logged this week (no synthetic fallback).
      const expectedTotal = users.size;
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
  // Live: first blocked task's reason in this department.
  const blocked = (CDC.TASKS || []).find((t) => t.dept === deptId && (t.status === 'BLOCKED' || t.status === 'ESCALATED'));
  const text = blocked && (blocked.blockReason || blocked.escalReason);
  if (!text) return null;
  const first = String(text).split('.')[0];
  return first.length > 40 ? first.slice(0, 38) + '…' : first;
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
  if (!dept) return <div className="empty">Department not found</div>;

  // Determine sub-teams shown for this user
  let visibleSubs = dept.subs;
  const scope = CDC.scopeForUser(currentUser.id);
  if (scope.kind === 'sub') visibleSubs = [scope.sub];

  // Live data for this department — worklogs + tasks (read fresh each render so
  // the 20s poll keeps this live). The old report/dept_health snapshot is gone.
  const kpis = CDC.KPIS.filter((k) => k.dept === deptId);
  const deptWorklogs = (CDC.WORKLOGS || []).filter((w) => w.dept === deptId);
  const deptTasks = (CDC.TASKS || []).filter((t) => t.dept === deptId);
  const todayStr = CDC.fmt(CDC.today);

  const last7 = deptWorklogs.filter((w) => (w.daysAgo ?? 0) <= 6);
  const hours7 = last7.reduce((s, w) => s + (Number(w.hours) || 0), 0);
  const contributors7 = new Set(last7.map((w) => w.userId)).size;
  const deptMembers = (CDC.USERS || []).filter((u) => u.dept === deptId).length;
  const blockers = deptTasks.filter((t) => t.status === 'BLOCKED' || t.status === 'ESCALATED').length;
  const overdue = deptTasks.filter((t) => t.due && t.due < todayStr && t.status !== 'DONE' && t.status !== 'REJECTED').length;
  const kpiGreen = kpis.filter((k) => k.status === 'green').length;
  const kpiPct = kpis.length ? Math.round((kpiGreen / kpis.length) * 100) : 0;

  const [selectedWl, setSelectedWl] = useState_d(null);
  const selected = deptWorklogs.find((w) => w.id === selectedWl) || null;

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

      {/* Stat strip — all live from worklogs/tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Hours logged (7d)</div>
          <div className="kpi-value">{hours7.toFixed(1)}</div>
          <div className="kpi-meta"><span>{last7.length} worklog entries</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Contributors (7d)</div>
          <div className="kpi-value">{contributors7}</div>
          <div className="kpi-meta"><span>of {deptMembers} in department</span></div>
        </div>
        <div className="kpi-tile" data-tone={blockers ? 'red' : 'muted'}>
          <div className="kpi-name">Open blockers</div>
          <div className="kpi-value">{blockers}</div>
          <div className="kpi-meta"><span>{overdue} overdue tasks</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">KPIs on track</div>
          <div className="kpi-value">{kpiPct}%</div>
          <div className="kpi-meta"><span>{kpiGreen} of {kpis.length}</span></div>
        </div>
      </div>

      <h2 className="h-section">Sub-teams & recent worklogs</h2>
      <div className="split" style={{ height: 540 }}>
        <div className="split-list">
          {visibleSubs.map((sub) => {
            const subWl = deptWorklogs.filter((w) => w.sub === sub);
            return (
              <div key={sub} style={{ marginBottom: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between', padding: '6px 4px', fontSize: 11, color: 'var(--text-faint)', letterSpacing: 0.06, textTransform: 'uppercase', fontWeight: 600 }}>
                  <span>{sub}</span>
                  <span className="mono">{subWl.length}</span>
                </div>
                {subWl.map((w) => (
                  <div key={w.id} className="list-row" data-active={selectedWl === w.id} onClick={() => setSelectedWl(w.id)}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Avatar user={{ initials: w.userInitials || (w.userName || '').split(' ').map((p) => p[0]).join('') }} size={20} />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 12.5 }}>{w.userName}</div>
                          <div className="muted" style={{ fontSize: 11 }}>{w.outputCategory || '—'} · {w.date}</div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                        <span className="mono" style={{ fontSize: 11 }}>{(Number(w.hours) || 0).toFixed(1)}h</span>
                        <Pill tone={w.status === 'Blocked' || w.status === 'Overdue' ? 'red' : w.status === 'Done' ? 'green' : 'outline'} dot>{(w.status || '—').toLowerCase()}</Pill>
                      </div>
                    </div>
                  </div>
                ))}
                {subWl.length === 0 && (
                  <div className="list-row" style={{ background: 'var(--panel)', borderStyle: 'dashed' }}>
                    <div className="muted" style={{ fontSize: 11 }}>No worklogs yet · {sub}</div>
                  </div>
                )}
              </div>
            );
          })}
          {deptWorklogs.length === 0 && (
            <div className="empty" style={{ padding: 16 }}>No worklogs logged in this department yet.</div>
          )}
        </div>

        <div className="split-pane">
          {selected ? (
            <div className="detail-b" style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{selected.userName} <span className="muted" style={{ fontWeight: 400 }}>· {selected.sub || dept.name}</span></h3>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 14 }}><span className="mono">{selected.id}</span> · {selected.date}</div>
              <dl className="kv" style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px 12px', fontSize: 13 }}>
                <dt className="muted">Output category</dt><dd>{selected.outputCategory || '—'}{selected.outputCount != null ? ` ×${selected.outputCount}` : ''}</dd>
                <dt className="muted">Products</dt><dd>{(selected.products || []).join(' · ') || '—'}</dd>
                <dt className="muted">Stacks</dt><dd>{(selected.stacks || []).join(' · ') || '—'}</dd>
                <dt className="muted">Hours</dt><dd>{(Number(selected.hours) || 0).toFixed(1)}</dd>
                <dt className="muted">Status</dt><dd>{selected.status || '—'}</dd>
                {selected.reason ? <><dt className="muted">Note</dt><dd>{selected.reason}</dd></> : null}
              </dl>
              {selected.template && Object.keys(selected.template).length > 0 && (
                <>
                  <div className="detail-section" style={{ marginTop: 16 }}>Details</div>
                  <dl className="kv" style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 12px', fontSize: 13 }}>
                    {Object.entries(selected.template).filter(([, v]) => v).map(([k, v]) => (
                      <React.Fragment key={k}><dt className="muted">{k}</dt><dd>{String(v)}</dd></React.Fragment>
                    ))}
                  </dl>
                </>
              )}
            </div>
          ) : (
            <div className="empty">Select a worklog to view detail.</div>
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
