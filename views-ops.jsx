// CD-Copilot — Weekly drafts, Task triage, Data Quality, AI Runs.

const { useState: useState_o, useMemo: useMemo_o, useEffect: useEffect_o } = React;

// ════════════════════════════════════════════════════════════════════════
// WEEKLY VIEW
// ════════════════════════════════════════════════════════════════════════
function WeeklyView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const weekly = CDC.filterWeekly(currentUser.id);
  const [selectedId, setSelectedId] = useState_o(weekly[0]?.id || null);
  const [overrides, setOverrides] = useState_o({}); // id -> { status, edited }
  const [editingItem, setEditingItem] = useState_o(null); // { wId, sIdx, iIdx, text }

  const selected = weekly.find((w) => w.id === selectedId);
  const liveStatus = (w) => overrides[w.id]?.status || w.status;
  const liveSections = (w) => overrides[w.id]?.sections || w.sections;

  function approve(id) {
    const w = weekly.find((x) => x.id === id);
    const sections = liveSections(w);
    setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), status: 'PUBLISHED', publishedAt: 'just now', sections } }));
    CDC.db.updateWeekly(w, { status: 'PUBLISHED', publishedAt: 'just now', editedBy: currentUser.id, sections });
    CDC.db.logInteraction({ agent: 'Rollup', flow: 'weekly_consolidation', inputRef: `WeeklySummary ${id}`, action: 'accept', userId: currentUser.id });
  }
  function reject(id) {
    const w = weekly.find((x) => x.id === id);
    setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), status: 'REJECTED' } }));
    CDC.db.updateWeekly(w, { status: 'REJECTED' });
    CDC.db.logInteraction({ agent: 'Rollup', flow: 'weekly_consolidation', inputRef: `WeeklySummary ${id}`, action: 'reject', userId: currentUser.id });
  }
  async function regenerate(id) {
    const w = weekly.find((x) => x.id === id);
    setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), status: 'DRAFT', regenerating: true } }));
    let sections = null;
    try { sections = CDC.agents ? await CDC.agents.runRollup(w) : null; }
    catch (e) { console.warn('[Relay] Rollup failed (deploy relay-agent to enable):', e.message); }
    setOverrides((o) => ({ ...o, [id]: { ...(o[id] || {}), regenerating: false, ...(sections ? { sections } : {}) } }));
  }
  function saveEdit() {
    if (!editingItem) return;
    const { wId, sIdx, iIdx, text } = editingItem;
    const w = weekly.find((x) => x.id === wId);
    const before = liveSections(w)[sIdx].items[iIdx].text;
    const sections = JSON.parse(JSON.stringify(liveSections(w)));
    sections[sIdx].items[iIdx].text = text;
    sections[sIdx].items[iIdx].edited = true;
    setOverrides((o) => ({ ...o, [wId]: { ...(o[wId] || {}), sections } }));
    CDC.db.updateWeekly(w, { sections });
    CDC.db.logInteraction({ agent: 'Rollup', flow: 'weekly_consolidation', inputRef: `WeeklySummary ${wId} ${(sections[sIdx] || {}).h || ''}:${iIdx}`, action: 'edit', draft: before, final: text, userId: currentUser.id });
    setEditingItem(null);
  }

  return (
    <div className="fadein">
      <SectionHeader
        title="Weekly summaries"
        subtitle="AI-drafted Mondays at 06:00 IST. Approve, edit, or regenerate before publishing."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="filter" size={12} /> All status</button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => weekly.forEach((w) => regenerate(w.id))}><Icon name="refresh" size={12} /> Generate all</button>
          </>
        }
      />

      <div className="split" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="split-list">
          {weekly.map((w) => {
            const st = liveStatus(w);
            return (
              <div key={w.id} className="list-row" data-active={selectedId === w.id} onClick={() => setSelectedId(w.id)}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 500 }}>{w.deptName}</div>
                  <Pill tone={st === 'PUBLISHED' ? 'green' : st === 'REJECTED' ? 'red' : 'amber'} dot>{st.toLowerCase()}</Pill>
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>Week of {w.weekOf}</div>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <ConfChip value={w.confidence} show={tweaks.confidence} />
                  <span className="faint mono" style={{ fontSize: 10.5 }}>
                    {liveSections(w).reduce((s, sect) => s + sect.items.length, 0)} items
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="split-pane">
          {selected ? (
            <WeeklyDetail
              key={selected.id}
              weekly={selected}
              currentUser={currentUser}
              status={liveStatus(selected)}
              sections={liveSections(selected)}
              regenerating={overrides[selected.id]?.regenerating}
              tweaks={tweaks}
              onApprove={() => approve(selected.id)}
              onReject={() => reject(selected.id)}
              onRegenerate={() => regenerate(selected.id)}
              onEditItem={(sIdx, iIdx) => {
                const text = liveSections(selected)[sIdx].items[iIdx].text;
                setEditingItem({ wId: selected.id, sIdx, iIdx, text });
              }}
            />
          ) : <div className="empty">Select a weekly draft.</div>}
        </div>
      </div>

      {editingItem && (
        <Modal open={true} onClose={() => setEditingItem(null)} title="Edit item"
          footer={<>
            <button className="btn" data-variant="ghost" onClick={() => setEditingItem(null)}>Cancel</button>
            <button className="btn" data-variant="primary" onClick={saveEdit}>Save edit</button>
          </>}>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 6 }}>AI-drafted item · click to revise</div>
          <textarea
            autoFocus
            value={editingItem.text}
            onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
            style={{ width: '100%', minHeight: 100, padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
          />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Edits preserve the underlying citation links and are logged to the AI run.
          </div>
        </Modal>
      )}
    </div>
  );
}
window.WeeklyView = WeeklyView;

// ════════════════════════════════════════════════════════════════════════
// MISSING REPORTS — who filled the day-end report, who didn't (with numbers)
// ════════════════════════════════════════════════════════════════════════
function MissingReportsView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const status = CDC.dailyStatus(currentUser.id, 0);
  const submitted = status.filter((s) => s.submitted);
  const missing = status.filter((s) => !s.submitted);
  const pct = status.length ? Math.round((submitted.length / status.length) * 100) : 0;
  const groups = {};
  for (const s of status) {
    const k = s.user.sub || (CDC.lookup.dept(s.user.dept) || {}).name || s.user.dept || '—';
    (groups[k] = groups[k] || []).push(s);
  }
  return (
    <div className="fadein">
      <SectionHeader title="Missing reports · today" subtitle={`${submitted.length} of ${status.length} reporters submitted. ${missing.length} missing.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        <div className="kpi-tile"><div className="kpi-name">Submitted</div><div className="kpi-value">{submitted.length}</div></div>
        <div className="kpi-tile" data-tone={missing.length ? 'amber' : undefined}><div className="kpi-name">Missing</div><div className="kpi-value">{missing.length}</div></div>
        <div className="kpi-tile" data-tone={pct >= 80 ? 'green' : pct >= 60 ? 'amber' : 'red'}><div className="kpi-name">Completion</div><div className="kpi-value">{pct}%</div></div>
      </div>
      {Object.entries(groups).map(([team, list]) => {
        const sub = list.filter((s) => s.submitted).length;
        return (
          <div key={team} style={{ marginBottom: 12 }}>
            <Card pad={false}>
              <div className="row" style={{ justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 13 }}>{team}</strong>
                <Pill tone={sub === list.length ? 'green' : sub === 0 ? 'red' : 'amber'} dot>{sub}/{list.length} submitted</Pill>
              </div>
              <div style={{ padding: '4px 14px 8px' }}>
                {list.map((s) => (
                  <div key={s.user.id} className="row" style={{ justifyContent: 'space-between', padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid var(--border-soft, transparent)' }}>
                    <span>{s.user.name} <span className="muted" style={{ fontSize: 10.5 }}>· {s.user.level} · {s.stack}</span></span>
                    {s.submitted
                      ? <Pill tone="green" dot>submitted</Pill>
                      : <button className="btn" data-size="sm" onClick={() => nav.go('copilot', { prefill: `Draft a Teams nudge to ${s.user.name} to submit today's daily report` })}><Icon name="copilot" size={11} /> Nudge</button>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
window.MissingReportsView = MissingReportsView;

// Shared: contributions consolidated by Output Category (daily→weekly→monthly).
function CategoryBreakdown({ worklogs, title }) {
  const rows = window.CDC.consolidateByCategory(worklogs);
  const maxH = Math.max(1, ...rows.map((r) => r.hours));
  if (!rows.length) return <div className="muted" style={{ fontSize: 12 }}>No entries in this period.</div>;
  return (
    <div>
      {title && <div className="detail-section">{title}</div>}
      <table className="tbl"><thead><tr><th>Output category</th><th>Outputs</th><th>People</th><th>Hours</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <td style={{ fontWeight: 500 }}>{r.category}</td>
              <td className="mono">{r.units || r.count}</td>
              <td className="mono">{r.people}</td>
              <td className="mono">{r.hours.toFixed(1)}</td>
              <td style={{ width: 120 }}><div style={{ height: 6, borderRadius: 3, background: 'var(--accent)', width: `${Math.round((r.hours / maxH) * 100)}%` }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
window.CategoryBreakdown = CategoryBreakdown;

function WeeklyDetail({ weekly, currentUser, status, sections, regenerating, tweaks, onApprove, onReject, onRegenerate, onEditItem }) {
  const published = status === 'PUBLISHED';
  const rejected = status === 'REJECTED';
  const [commentOpen, setCommentOpen] = useState_o(null); // itemPath string
  const [commentText, setCommentText] = useState_o('');
  const [, bumpComments] = useState_o(0);
  const commentsFor = (path) => (window.CDC.WEEKLY_COMMENTS || []).filter((c) => c.weeklyId === weekly.id && c.itemPath === path);
  function submitComment(path) {
    const text = commentText.trim();
    if (!text) return;
    window.CDC.db.addWeeklyComment({ weeklyId: weekly.id, itemPath: path, author: currentUser ? currentUser.id : null, text });
    // A margin comment is a human correction signal → Engram.
    window.CDC.db.logInteraction({ agent: 'Rollup', flow: 'weekly_consolidation', inputRef: `WeeklySummary ${weekly.id} ${path}`, action: 'comment', reason: text, userId: currentUser ? currentUser.id : null });
    setCommentText(''); setCommentOpen(null); bumpComments((n) => n + 1);
  }
  return (
    <>
      <div className="detail-h">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{weekly.deptName} — Week of {weekly.weekOf}</h3>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Generated {weekly.generatedAt} by {weekly.generatedBy} · <span className="mono">{weekly.id}</span>
              {weekly.editedBy && <> · edited by {window.CDC.lookup.user(weekly.editedBy)?.name}</>}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <ConfChip value={weekly.confidence} show={tweaks.confidence} />
            <Pill tone={status === 'PUBLISHED' ? 'green' : status === 'REJECTED' ? 'red' : 'amber'} dot>{status.toLowerCase()}</Pill>
          </div>
        </div>
      </div>

      <div className="detail-b">
        {regenerating && (
          <div className="row" style={{ gap: 10, padding: '8px 12px', background: 'var(--accent-soft)', borderRadius: 6, marginBottom: 12, color: 'var(--accent)' }}>
            <div className="loading-bar"></div>
            <span style={{ fontSize: 12 }}>Re-running WeeklyConsolidation agent · claude-sonnet-4-6</span>
          </div>
        )}

        {sections.map((sect, sIdx) => (
          <div key={sIdx}>
            <div className="detail-section">{sect.h}</div>
            <div className="col" style={{ gap: 6 }}>
              {sect.items.map((it, iIdx) => {
                const path = `${sect.h}:${iIdx}`;
                const cmts = commentsFor(path);
                return (
                <div key={iIdx} className="draft-block" data-edited={it.edited ? 'true' : 'false'}>
                  <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55 }}>
                      {renderInlineWithCites(it.text)}
                      {it.cites && it.cites.length > 0 && (
                        <span> {it.cites.map((c, i) => (
                          <Cite key={i} n={i + 1} sourceId={c} lookupFn={(id) => resolveCitation(id)} />
                        ))}</span>
                      )}
                      {it.edited && <span className="pill" data-tone="accent" style={{ marginLeft: 6 }}>edited</span>}
                      {cmts.length > 0 && <span className="pill" data-tone="amber" style={{ marginLeft: 6 }}>{cmts.length} comment{cmts.length === 1 ? '' : 's'}</span>}
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn" data-size="sm" data-variant="ghost" title="Comment" onClick={() => { setCommentOpen(commentOpen === path ? null : path); setCommentText(''); }}>
                        <Icon name="copilot" size={11} />
                      </button>
                      {!published && !rejected && (
                        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => onEditItem(sIdx, iIdx)}>
                          <Icon name="edit" size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  {(cmts.length > 0 || commentOpen === path) && (
                    <div style={{ marginTop: 8, marginLeft: 2, borderLeft: '2px solid var(--accent-border)', paddingLeft: 10 }}>
                      {cmts.map((c) => (
                        <div key={c.id} style={{ fontSize: 12, marginBottom: 6 }}>
                          <strong>{window.CDC.lookup.user(c.author)?.name || 'You'}</strong>
                          <span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }}>{c.ts}</span>
                          <div>{c.text}</div>
                        </div>
                      ))}
                      {commentOpen === path && (
                        <div className="row" style={{ gap: 6, marginTop: 4 }}>
                          <input className="input-text" data-size="sm" autoFocus placeholder="Add a comment…" value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') submitComment(path); }}
                            style={{ flex: 1 }} />
                          <button className="btn" data-size="sm" data-variant="primary" onClick={() => submitComment(path)}>Comment</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        ))}

        <CategoryBreakdown
          title="Contributions by output category · this week"
          worklogs={(window.CDC.filterWorklogs(currentUser ? currentUser.id : '') || []).filter((w) => w.dept === weekly.dept && w.daysAgo <= 7)}
        />

        <div className="detail-section">Audit</div>
        <dl className="kv">
          <dt>Agent run</dt>
          <dd className="mono">run-1097 · claude-sonnet-4-6 · 9120 ms · $0.078</dd>
          <dt>Source reports</dt>
          <dd>{sections.flatMap((s) => s.items).flatMap((i) => i.cites || []).filter((c) => c.startsWith('r-')).length} cited</dd>
          <dt>Prompt version</dt>
          <dd className="mono">weekly_consolidation@v3</dd>
        </dl>
      </div>

      <div className="action-bar">
        {published && (
          <>
            <Pill tone="green" dot>Published</Pill>
            <span className="muted" style={{ fontSize: 12 }}>Sent to #ccbp-leads slack and dept-leads email.</span>
            <span style={{ flex: 1 }} />
            <button className="btn" data-size="sm"><Icon name="eye" size={12} /> View published</button>
          </>
        )}
        {rejected && (
          <>
            <Pill tone="red" dot>Rejected</Pill>
            <span className="muted" style={{ fontSize: 12 }}>This draft will not be published. Underlying reports are unaffected.</span>
            <span style={{ flex: 1 }} />
            <button className="btn" data-size="sm" onClick={onRegenerate}>Regenerate</button>
          </>
        )}
        {!published && !rejected && (
          <>
            <button className="btn" data-variant="ghost" onClick={onRegenerate}><Icon name="refresh" size={12} /> Regenerate</button>
            <span style={{ flex: 1 }} />
            <button className="btn" data-variant="danger" onClick={onReject}><Icon name="x" size={12} /> Reject</button>
            <button className="btn" data-variant="primary" onClick={onApprove}><Icon name="check" size={12} /> Approve & publish</button>
          </>
        )}
      </div>
    </>
  );
}

function renderInlineWithCites(text) {
  // bold parse for **x**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
    ? <strong key={i}>{p.slice(2, -2)}</strong>
    : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TASK TRIAGE
// ════════════════════════════════════════════════════════════════════════
// Task board — every person can create, assign, and update tasks; managers
// get team + per-reportee visibility. Mirrors the Task Flow spec.
const TASK_STATUSES = [
  { v: 'BACKLOG', label: 'Backlog', tone: 'amber' },
  { v: 'ACTIVE', label: 'In Progress', tone: 'blue' },
  { v: 'BLOCKED', label: 'Blocked', tone: 'red' },
  { v: 'ESCALATED', label: 'Escalated', tone: 'red' },
  { v: 'DONE', label: 'Done', tone: 'green' },
];
const statusMeta = (s) => TASK_STATUSES.find((x) => x.v === s) || { label: (s || '').toLowerCase(), tone: 'outline' };

function TasksView({ tweaks, currentUser }) {
  const CDC = window.CDC;
  const me = currentUser;
  const todayStr = CDC.fmt(CDC.today);
  const allTasks = CDC.filterTasks(me.id);
  const reportees = (CDC.USERS || []).filter((u) => u.managerId === me.id);
  const isManager = me.level === 'L2' || me.level === 'L3' || me.level === 'Admin' ||
    ['L2', 'L3', 'ADMIN', 'PRODUCT_OWNER', 'DEPARTMENT_LEAD', 'SUB_LEAD', 'CENTRAL_OPS'].includes(me.role);
  const reporteeIds = new Set(reportees.map((r) => r.id));

  const [decisions, setDecisions] = useState_o({});   // suggested triage: id -> approved|rejected
  const [statusOv, setStatusOv] = useState_o({});      // id -> status (forces re-render after update)
  // Managers open to their direct reports' tasks (L3 → L2s, L2 → their L1s); ICs open to their own.
  const [filter, setFilter] = useState_o('MINE');
  const [reporteeSel, setReporteeSel] = useState_o(''); // L2/L3 reportee drill-down ('' = all)
  const [editing, setEditing] = useState_o(null);
  const [creating, setCreating] = useState_o(false);

  const isOverdue = (t) => t.due && t.due < todayStr && t.status !== 'DONE' && t.status !== 'SUGGESTED';
  // Escalation queue = anything escalated, blocked, or overdue (what L3 reviews "separately").
  const isEscalated = (t) => t.status === 'ESCALATED' || t.status === 'BLOCKED' || isOverdue(t);

  // ── Time-based escalation rules (Sentry scan). Climbs L1 → L2 → L3. ─────────
  const DAY_MS = 864e5;
  const fullDaysSince = (d) => { if (!d) return 0; const ms = new Date(d).getTime(); return isNaN(ms) ? 0 : Math.floor((Date.now() - ms) / DAY_MS); };
  const daysOverdue = (t) => (t.due && t.due < todayStr) ? Math.floor((new Date(todayStr) - new Date(t.due)) / DAY_MS) : 0;
  // Returns a human reason if a task crosses a time threshold, else null.
  // Thresholds (the day a trigger fires): in progress > 2 days (3rd day),
  // blocked > 1 day (2nd day), overdue > 2 days (3rd day).
  const escalationTrigger = (t) => {
    if (['DONE', 'SUGGESTED', 'REJECTED'].includes(t.status)) return null;
    const od = daysOverdue(t);
    if (od > 2) return `Overdue ${od} days (due ${t.due})`;
    // When already ESCALATED, keep evaluating the state it came from so it can climb further.
    const eff = t.status === 'ESCALATED' ? (t.escalPrevStatus || '') : t.status;
    if (eff === 'BLOCKED' && fullDaysSince(t.blockedAt || t.created) > 1) return `Blocked ${fullDaysSince(t.blockedAt || t.created)} days`;
    if (eff === 'ACTIVE' && fullDaysSince(t.created) > 2) return `In progress ${fullDaysSince(t.created)} days`;
    // Prompted at a past 6:00 check-in and still not acknowledged.
    if (t.ackPending && t.ackPromptDate && t.ackPromptDate < todayStr) return `Unacknowledged since ${t.ackPromptDate}`;
    return null;
  };

  const TAB_LABELS = { MINE: 'self', ALL: 'team mates' };
  const tabs = ['MINE', 'BACKLOG', 'ACTIVE', 'ESCALATED', 'BLOCKED', 'OVERDUE', 'DONE', ...(reportees.length ? ['ALL'] : [])];
  const matchesTab = (t, f) =>
    f === 'ALL' ? true :
    f === 'MINE' ? t.owner === me.id :
    f === 'TEAM' ? reporteeIds.has(t.owner) :
    f === 'OVERDUE' ? isOverdue(t) :
    f === 'ESCALATED' ? isEscalated(t) :
    t.status === f;

  const list = allTasks
    .filter((t) => t.status !== 'SUGGESTED')
    .filter((t) => matchesTab(t, filter))
    .filter((t) => !reporteeSel || t.owner === reporteeSel)
    .map((t) => ({ ...t, _decision: decisions[t.id] }));

  function approve(id) {
    setDecisions((d) => ({ ...d, [id]: 'approved' }));
    CDC.db.updateTask(id, 'ACTIVE');
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_triage', inputRef: `Task ${id}`, action: 'accept', userId: me.id });
  }
  function reject(id) {
    setDecisions((d) => ({ ...d, [id]: 'rejected' }));
    CDC.db.updateTask(id, 'REJECTED');
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_triage', inputRef: `Task ${id}`, action: 'reject', userId: me.id });
  }
  const nm = (uid) => (CDC.lookup.user(uid) || {}).name || '—';
  // Owner's reporting line, immediate manager first → up to the top.
  const managerChain = (ownerId) => {
    const chain = []; let u = CDC.lookup.user(ownerId), guard = 0;
    while (u && u.managerId && guard++ < 8) { chain.push(u.managerId); u = CDC.lookup.user(u.managerId); }
    return chain;
  };
  // Mark blocked → notify the IMMEDIATE reporting manager (+ originator). Escalation
  // climbs the hierarchy from here via escalate() / scanNow().
  async function block(id) {
    const t = allTasks.find((x) => x.id === id); if (!t) return;
    const chain = managerChain(t.owner);
    const mgr = chain[0] || null;
    t.blockedAt = new Date().toISOString();
    t.escalIdx = 0;            // pointer into chain: 0 = immediate manager notified
    t.escalatedTo = mgr;
    CDC.db.updateTask(id, 'BLOCKED');  // persists data:t incl. escalation fields
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_block', inputRef: `Task ${id}`, action: 'edit',
      reason: `Blocked by ${me.name}; notified manager ${nm(mgr)}`, userId: me.id });
    // Sentry agent drafts the escalation brief; routing (mgr) stays deterministic.
    const brief = CDC.agents ? await CDC.agents.runSentry({
      task: { ...t, ownerName: nm(t.owner) }, event: 'blocked', target: nm(mgr),
      targetLevel: (CDC.lookup.user(mgr) || {}).level, reason: t.blockReason,
    }) : null;
    const recipients = [];
    if (mgr) recipients.push(mgr);
    const originator = t.createdBy || t.uploadedBy;
    if (originator) recipients.push(originator);
    CDC.db.notify && CDC.db.notify(recipients, {
      text: `🚫 Blocked: "${t.title}" (owner ${nm(t.owner)}) — flagged by ${me.name}${brief ? ` · Sentry: ${brief}` : ''}`,
      icon: '🚫', kind: 'task_blocked', refId: id,
    });
    setStatusOv((s) => ({ ...s, [id]: 'BLOCKED' }));
  }
  // Task remains blocked → escalate to the next hierarchy level (L1 → L2 → L3).
  async function escalate(id) {
    const t = allTasks.find((x) => x.id === id); if (!t) return;
    const chain = managerChain(t.owner);
    const nextIdx = (t.escalIdx ?? 0) + 1;
    const target = chain[nextIdx];
    if (!target) {
      CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_escalate', inputRef: `Task ${id}`, action: 'edit',
        reason: `Already at top of hierarchy (${nm(chain[chain.length - 1])})`, userId: me.id });
      setStatusOv((s) => ({ ...s })); return;
    }
    if (t.status !== 'ESCALATED') t.escalPrevStatus = t.status;
    t.escalIdx = nextIdx; t.escalatedTo = target;
    CDC.db.updateTask(id, 'ESCALATED');
    const brief = CDC.agents ? await CDC.agents.runSentry({
      task: { ...t, ownerName: nm(t.owner) }, event: 'escalated', target: nm(target),
      targetLevel: (CDC.lookup.user(target) || {}).level, reason: t.escalReason || t.blockReason,
    }) : null;
    CDC.db.notify && CDC.db.notify([target], {
      text: `⏫ Escalated: "${t.title}" still blocked — escalated to ${nm(target)} (${(CDC.lookup.user(target) || {}).level})${brief ? ` · Sentry: ${brief}` : ''}`,
      icon: '⏫', kind: 'task_escalated', refId: id,
    });
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_escalate', inputRef: `Task ${id}`, action: 'edit',
      reason: `Escalated to ${nm(target)} by ${me.name}`, userId: me.id });
    setStatusOv((s) => ({ ...s }));
  }
  // Scan: tasks crossing a time threshold (in-progress > 2d, blocked > 1d, overdue
  // > 2d) get a trigger, flip to ESCALATED, and climb one level up the chain
  // (L1 → L2 → L3). Each scan advances one more level until the top is reached.
  async function scanNow() {
    let triggered = 0;
    for (const t of allTasks) {
      const reason = escalationTrigger(t);
      if (!reason) continue;
      const chain = managerChain(t.owner);
      const top = chain.length - 1;
      const nextIdx = chain.length ? Math.min((t.escalIdx ?? -1) + 1, top) : -1;
      const target = nextIdx >= 0 ? chain[nextIdx] : null;
      // Once a trigger is received, the task status becomes ESCALATED.
      if (t.status !== 'ESCALATED') t.escalPrevStatus = t.status;
      t.escalIdx = nextIdx;
      t.escalatedTo = target || t.escalatedTo;
      t.escalReason = reason;
      CDC.db.updateTask(t.id, 'ESCALATED');
      const brief = (CDC.agents && target) ? await CDC.agents.runSentry({
        task: { ...t, ownerName: nm(t.owner) }, event: 'escalated', target: nm(target),
        targetLevel: (CDC.lookup.user(target) || {}).level, reason,
      }) : null;
      const recipients = [];
      if (target) recipients.push(target);
      const originator = t.createdBy || t.uploadedBy;
      if (originator && originator !== target) recipients.push(originator);
      CDC.db.notify && CDC.db.notify(recipients, {
        text: `⏫ Escalated: "${t.title}" — ${reason}${target ? ` → ${nm(target)} (${(CDC.lookup.user(target) || {}).level || '—'})` : ''}${brief ? ` · Sentry: ${brief}` : ''}`,
        icon: '⏫', kind: 'task_escalated', refId: t.id,
      });
      CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_escalate', inputRef: `Task ${t.id}`, action: 'edit',
        reason: `${reason}; escalated${target ? ` to ${nm(target)}` : ' (top of chain)'} by Sentry scan`, userId: me.id });
      triggered++;
    }
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_scan', inputRef: 'Tasks scan', action: 'run',
      reason: `Scan: ${triggered} task(s) escalated`, userId: me.id });
    setStatusOv((s) => ({ ...s }));
  }
  function setStatus(id, status) {
    if (status === 'BLOCKED') { block(id); return; }
    CDC.db.updateTask(id, status);
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_status', inputRef: `Task ${id}`, action: 'edit',
      reason: `Status → ${statusMeta(status).label} by ${me.name}`, userId: me.id });
    setStatusOv((s) => ({ ...s, [id]: status }));
  }
  // xlsx status labels → internal board statuses. Overdue is derived from the
  // due date, so it maps to ACTIVE (the overdue pill shows once due < today).
  const STATUS_MAP = { 'In-progress': 'ACTIVE', 'Done': 'DONE', 'Blocked': 'BLOCKED', 'Overdue': 'ACTIVE', 'Backlog': 'BACKLOG' };
  function createTask(form) {
    const owner = CDC.lookup.user(form.owner);
    const m = (CDC.TASK_CATALOG.OUTPUT_MAP || {})[form.outputCategory] || {};
    const tmplSummary = form.template ? Object.values(form.template).filter(Boolean).join(' · ') : '';
    const title = (form.title && form.title.trim()) ||
      `${form.outputCategory || 'Task'}${form.outputCount ? ` ×${form.outputCount}` : ''}${tmplSummary ? ` — ${tmplSummary}` : ''}`;
    const status = STATUS_MAP[form.status] || 'ACTIVE';
    const task = {
      id: `task-${Date.now()}`, title, status,
      reason: 'Manual', sourceReports: [], owner: form.owner,
      dept: owner ? owner.dept : me.dept, created: todayStr, due: form.due,
      confidence: null, source: 'manual', createdBy: me.id,
      // Structured fields from the CD Task-flow sheet:
      products: form.products || [], stacks: form.stacks || [], stack: (form.stacks || [])[0] || null,
      outputCategory: form.outputCategory || null, taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? null, template: form.template || {},
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : null,
      blockReason: form.reason || '',
    };
    if (status === 'BLOCKED') {
      const chain = managerChain(form.owner);
      task.blockedAt = new Date().toISOString(); task.escalIdx = 0; task.escalatedTo = chain[0] || null;
    }
    CDC.db.addTask(task);
    CDC.db.logInteraction({ agent: '—', flow: 'task_create', inputRef: `Task ${task.id}`, action: 'create',
      reason: `Created "${task.title}" (${m.metric || '—'} · ${m.task || '—'}) for ${owner ? owner.name : form.owner} by ${me.name}`, userId: me.id });
    setStatusOv((s) => ({ ...s, [task.id]: status }));
    setCreating(false);
  }

  const suggested = allTasks.filter((t) => t.status === 'SUGGESTED');
  const reviewed = Object.keys(decisions).length;
  const tabCount = (f) =>
    f === 'ALL' ? allTasks.length :
    f === 'MINE' ? allTasks.filter((t) => t.owner === me.id).length :
    f === 'TEAM' ? allTasks.filter((t) => reporteeIds.has(t.owner)).length :
    f === 'OVERDUE' ? allTasks.filter(isOverdue).length :
    f === 'ESCALATED' ? allTasks.filter(isEscalated).length :
    allTasks.filter((t) => t.status === f).length;

  return (
    <div className="fadein">
      <SectionHeader
        title="Tasks"
        subtitle="Your task board. Create tasks, assign to anyone, update status. Managers see their team mates' tasks via the team mates tab + reportee filter."
        actions={
          <>
            <button className="btn" data-size="sm" onClick={scanNow} title="Send overdue triggers to originators; refresh escalations"><Icon name="refresh" size={12} /> Scan now</button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => setCreating(true)}><Icon name="check" size={12} /> New task</button>
          </>
        }
      />

      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map((f) => (
          <button key={f} className="btn" data-size="sm" data-variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
            {TAB_LABELS[f] || f.toLowerCase()}
            <span className="mono muted" style={{ marginLeft: 6 }}>{tabCount(f)}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {reportees.length > 0 && (
          <select value={reporteeSel} onChange={(e) => setReporteeSel(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
            title="Filter by immediate reportee">
            <option value="">All reportees</option>
            {reportees.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.level} · {r.sub || r.dept}</option>)}
          </select>
        )}
        {filter === 'SUGGESTED' && <span className="muted" style={{ fontSize: 12 }}>{reviewed} of {suggested.length} triaged</span>}
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Task</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Status</th>
              <th style={{ width: 210 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const decided = t._decision;
              const status = statusOv[t.id] || t.status;
              const owner = CDC.USERS.find((u) => u.id === t.owner) || CDC.REPORT_AUTHORS.find((a) => a.id === t.owner);
              const ownerName = owner?.name || 'Unassigned';
              const overdue = isOverdue({ ...t, status });
              const meta = statusMeta(status);
              const canSetStatus = status !== 'SUGGESTED';
              return (
                <tr key={t.id} style={decided === 'rejected' ? { opacity: 0.45 } : decided === 'approved' ? { background: 'color-mix(in oklch, var(--green-soft) 40%, transparent)' } : {}}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{t.title}</div>
                    {(t.metricCategory || t.taskCategory) && (
                      <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                        {t.metricCategory && <Pill tone="accent">{t.metricCategory}</Pill>}
                        {t.taskCategory && <span className="muted" style={{ fontSize: 11 }}>{t.taskCategory}</span>}
                        {t.outputCategory && <span className="muted" style={{ fontSize: 11 }}>· {t.outputCategory}{t.outputCount != null ? ` ×${t.outputCount}` : ''}</span>}
                      </div>
                    )}
                    {(((t.products && t.products.length) || (t.stacks && t.stacks.length) || t.estHours != null)) && (
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {[(t.products || []).join(', '), (t.stacks || []).join(', '), t.estHours != null && t.estHours !== '' ? `${t.estHours}h est` : ''].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.source === 'manual' ? 'Manual' : t.reason}</div>
                    {t.sourceReports && t.sourceReports.length > 0 && (
                      <div style={{ fontSize: 11, marginTop: 2 }}>
                        {t.sourceReports.map((rid, i) => <Cite key={i} n={i + 1} sourceId={rid} lookupFn={(id) => resolveCitation(id)} />)}
                      </div>
                    )}
                  </td>
                  <td className="muted">{ownerName}</td>
                  <td className="muted mono" style={{ fontSize: 12 }}>
                    {t.due || '—'}{overdue && <span className="pill" data-tone="red" style={{ fontSize: 9, marginLeft: 6 }}>overdue</span>}
                  </td>
                  <td>
                    {canSetStatus ? (
                      <select value={status} onChange={(e) => setStatus(t.id, e.target.value)}
                        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
                        {TASK_STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                      </select>
                    ) : <Pill tone="outline" dot>suggested</Pill>}
                  </td>
                  <td>
                    {status === 'SUGGESTED' ? (
                      decided === 'approved' ? <Pill tone="green" dot>approved</Pill> :
                      decided === 'rejected' ? <Pill tone="red" dot>rejected</Pill> :
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setEditing(t)}><Icon name="edit" size={11} /></button>
                        <button className="btn" data-size="sm" data-variant="danger" onClick={() => reject(t.id)}>Reject</button>
                        <button className="btn" data-size="sm" data-variant="primary" onClick={() => approve(t.id)}>Approve</button>
                      </div>
                    ) : (status === 'BLOCKED' || status === 'ESCALATED') ? (
                      <div className="row" style={{ gap: 6, alignItems: 'center', fontSize: 11 }}>
                        {t.escalatedTo && <span className="muted" title={t.escalReason || 'Currently escalated to'}>→ {nm(t.escalatedTo)} ({(CDC.lookup.user(t.escalatedTo) || {}).level || '—'})</span>}
                        {isManager && <button className="btn" data-size="sm" data-variant="ghost" onClick={() => escalate(t.id)} title="Escalate to next level"><Icon name="arrow-up" size={11} /> Escalate</button>}
                      </div>
                    ) : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={5}><div className="empty">No {filter.toLowerCase()} tasks.</div></td></tr>}
          </tbody>
        </table>
      </Card>

      <CreateTaskModal open={creating} onClose={() => setCreating(false)} onCreate={createTask} me={me} people={CDC.USERS} todayStr={todayStr} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit suggested task"
        footer={<>
          <button className="btn" data-variant="ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn" data-variant="primary" onClick={() => { approve(editing.id); setEditing(null); }}>Save & approve</button>
        </>}
      >
        {editing && (
          <div className="col" style={{ gap: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 }}>Title</div>
              <input className="tb-search" defaultValue={editing.title} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 }}>Reason (AI-generated)</div>
              <div className="muted" style={{ fontSize: 12 }}>{editing.reason}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
window.TasksView = TasksView;

function CreateTaskModal({ open, onClose, onCreate, me, people, todayStr }) {
  const CAT = window.CDC.TASK_CATALOG;
  const [owner, setOwner] = useState_o(me.id);
  const [products, setProducts] = useState_o([]);
  const [stacks, setStacks] = useState_o([]);
  const [outputCategory, setOutputCategory] = useState_o('');
  const [catSearch, setCatSearch] = useState_o('');
  const [outputCount, setOutputCount] = useState_o('');
  const [template, setTemplate] = useState_o({});
  const [estHours, setEstHours] = useState_o('');
  const [status, setStatus] = useState_o('In-progress');
  const [due, setDue] = useState_o('');
  const [reason, setReason] = useState_o('');
  useEffect_o(() => {
    if (open) {
      setOwner(me.id); setProducts([]); setStacks([]); setOutputCategory(''); setCatSearch('');
      setOutputCount(''); setTemplate({}); setEstHours(''); setStatus('In-progress'); setDue(''); setReason('');
    }
  }, [open]);

  const map = outputCategory ? CAT.OUTPUT_MAP[outputCategory] : null;
  const taskCategory = map ? map.task : '';
  const countNA = outputCategory ? CAT.COUNT_NA.has(outputCategory) : false;
  const fields = TASK_TEMPLATES_REF(CAT)[taskCategory] || [];
  const needsReason = status === 'Blocked' || status === 'Overdue';
  const filteredCats = CAT.OUTPUT_CATEGORIES.filter((c) => c.toLowerCase().includes(catSearch.toLowerCase()));

  // Stack, Task (template) and Output count are optional — count defaults to 0.
  // Status and Due date are mandatory.
  const valid = products.length > 0 && !!outputCategory &&
    !!status && !!due &&
    (!needsReason || reason.trim().length > 0);

  const label = () => ({ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 });
  const inp = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)' };
  const toggle = (set, val) => set((s) => s.includes(val) ? s.filter((x) => x !== val) : [...s, val]);

  const sectionGap = { display: 'flex', flexDirection: 'column', gap: 16 };
  const selCount = (n) => <span className="muted" style={{ textTransform: 'none', fontWeight: 400, fontSize: 11 }}>{n ? `· ${n} selected` : '· multi-select'}</span>;
  return (
    <Modal open={open} onClose={onClose} title="New task — CD Task flow" width={840}
      footer={<>
        <span className="muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>
          {!outputCategory ? 'Pick a product-audience & output category'
            : !due ? 'Due date is required'
            : needsReason && !reason.trim() ? `Reason required for ${status.toLowerCase()}`
            : `${map.metric} · ${map.task}`}
        </span>
        <button className="btn" data-variant="ghost" onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={!valid}
          onClick={() => onCreate({ owner, products, stacks, outputCategory,
            outputCount: countNA ? null : Number(outputCount), template, estHours, status, due: due || null, reason })}>
          Create task
        </button>
      </>}
    >
      <div style={sectionGap}>
        {/* 1. Owner (EMP ID) */}
        <div>
          <div style={label()}>Owner <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· EMP ID auto-filled</span></div>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inp}>
            <option value={me.id}>{me.name} (me)</option>
            {(people || []).filter((u) => u.id !== me.id).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.level} · {u.sub || u.dept}</option>)}
          </select>
        </div>

        {/* 2. Product-Audience + Stack (stack optional) */}
        <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={label()}>Product-Audience {selCount(products.length)}</div>
            <div className="chip-grid">
              {CAT.PRODUCTS.map((p) => (
                <div key={p} className="chip" data-selected={products.includes(p)} onClick={() => toggle(setProducts, p)}>
                  {products.includes(p) && <Icon name="check" size={10} stroke={2.4} />}<span>{p}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <div style={label()}>Stack <span className="muted" style={{ textTransform: 'none', fontWeight: 400, fontSize: 11 }}>· optional{stacks.length ? ` · ${stacks.length} selected` : ''}</span></div>
            <div className="chip-grid">
              {CAT.STACKS.map((s) => (
                <div key={s} className="chip" data-selected={stacks.includes(s)} onClick={() => toggle(setStacks, s)}>
                  {stacks.includes(s) && <Icon name="check" size={10} stroke={2.4} />}<span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Output category → auto Metric/Task + Output count */}
        <div>
          <div style={label()}>Output category</div>
          <input className="tb-search" placeholder="Search categories…" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} style={inp} />
          <div className="chip-grid" style={{ marginTop: 8, maxHeight: 132, overflowY: 'auto' }}>
            {filteredCats.map((c) => (
              <div key={c} className="chip" data-selected={outputCategory === c} onClick={() => { setOutputCategory(c); setTemplate({}); }}>
                {outputCategory === c && <Icon name="check" size={10} stroke={2.4} />}<span>{c}</span>
              </div>
            ))}
            {filteredCats.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No matches.</div>}
          </div>
          {map && (
            <div className="row" style={{ gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pill tone="accent" dot>{map.metric}</Pill>
              <span className="muted" style={{ fontSize: 11.5 }}>{map.activity} → {map.task}</span>
              {!countNA && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={label()}>Count</span>
                  <input type="number" min="0" step="1" value={outputCount} placeholder="0"
                    onChange={(e) => setOutputCount(e.target.value.replace(/[^\d]/g, ''))}
                    style={{ ...inp, width: 80, padding: '5px 8px' }} />
                </span>
              )}
              {countNA && <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>count N/A</span>}
            </div>
          )}
        </div>

        {map && fields.length > 0 && (
          <div>
            <div style={label()}>Task — {taskCategory} <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· optional</span></div>
            <div className="template-form">
              {fields.map((f) => (
                <React.Fragment key={f.id}>
                  <label>{f.label}</label>
                  {f.type === 'text' && (
                    <input className="field-input" placeholder={f.ph} value={template[f.id] || ''}
                      onChange={(e) => setTemplate((v) => ({ ...v, [f.id]: e.target.value }))} />
                  )}
                  {f.type === 'textarea' && (
                    <textarea className="field-input" style={{ height: 56, padding: 8, resize: 'vertical' }} placeholder={f.ph} value={template[f.id] || ''}
                      onChange={(e) => setTemplate((v) => ({ ...v, [f.id]: e.target.value }))} />
                  )}
                  {f.type === 'choice' && (
                    <div className="seg" style={{ justifySelf: 'start' }}>
                      {f.options.map((o) => (
                        <button key={o} type="button" data-active={template[f.id] === o}
                          onClick={() => setTemplate((v) => ({ ...v, [f.id]: o }))}>{o}</button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* 5. Status · Reason · Estimated time */}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <div style={label()}>Status <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
              {CAT.STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <div style={label()}>Due date <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
            <input type="date" value={due} min={todayStr} onChange={(e) => setDue(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <div style={label()}>Est. time (hrs)</div>
            <input type="number" min="0" step="0.25" value={estHours} placeholder="e.g. 2.5"
              onChange={(e) => setEstHours(e.target.value)} style={inp} />
          </div>
        </div>

        {needsReason && (
          <div>
            <div style={label()}>Reason ({status.toLowerCase()})</div>
            <textarea className="field-input" style={{ width: '100%', height: 50, padding: 8, resize: 'vertical' }}
              placeholder={`Why is it ${status.toLowerCase()}?`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
// Templates live on the shared catalog; small accessor keeps JSX tidy.
function TASK_TEMPLATES_REF(CAT) { return CAT.TASK_TEMPLATES; }
window.CreateTaskModal = CreateTaskModal;

// ════════════════════════════════════════════════════════════════════════
// DATA QUALITY (FLAGS) INBOX
// ════════════════════════════════════════════════════════════════════════
function QualityView({ tweaks, currentUser }) {
  const CDC = window.CDC;
  const flags = CDC.filterFlags(currentUser.id);
  const [state, setState] = useState_o({}); // id -> 'resolved'|'snoozed'|'dismissed'
  const [filter, setFilter] = useState_o('open');
  const [selected, setSelected] = useState_o(flags[0]?.id || null);
  function setFlag(id, st) {
    setState((s) => { if (st === null) { const c = { ...s }; delete c[id]; return c; } return { ...s, [id]: st }; });
    if (window.CDC.db) window.CDC.db.updateFlag(id, st === null ? 'open' : st);
  }

  const liveFlags = flags.map((f) => ({ ...f, state: state[f.id] || f.state }));
  const list = liveFlags.filter((f) => filter === 'all' ? true : f.state === filter);
  const sel = liveFlags.find((f) => f.id === selected);

  return (
    <div className="fadein">
      <SectionHeader
        title="Data quality"
        subtitle="Flags raised by the DataQuality agent. Resolve, snooze, or dismiss."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Re-scan</button>
          </>
        }
      />

      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {['open', 'snoozed', 'resolved', 'all'].map((f) => (
          <button key={f} className="btn" data-size="sm" data-variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
            {f} <span className="mono muted" style={{ marginLeft: 6 }}>{liveFlags.filter((x) => f === 'all' || x.state === f).length}</span>
          </button>
        ))}
      </div>

      <div className="split" style={{ height: 'calc(100vh - 250px)' }}>
        <div className="split-list">
          {list.map((f) => (
            <div key={f.id} className="list-row" data-active={selected === f.id} onClick={() => setSelected(f.id)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Pill tone={f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'amber' : 'outline'} dot>{f.severity}</Pill>
                <span className="faint mono" style={{ fontSize: 10.5 }}>{f.created}</span>
              </div>
              <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.35 }}>{f.title}</div>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 500 }}>{f.kind.replace('_', ' ')}</div>
            </div>
          ))}
          {list.length === 0 && <div className="empty">No flags.</div>}
        </div>

        <div className="split-pane">
          {sel ? (
            <>
              <div className="detail-h">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <Pill tone={sel.severity === 'high' ? 'red' : sel.severity === 'medium' ? 'amber' : 'outline'} dot>{sel.severity}</Pill>
                      <Pill tone={sel.state === 'resolved' ? 'green' : sel.state === 'snoozed' ? 'outline' : 'amber'}>{sel.state}</Pill>
                    </div>
                    <h3 style={{ margin: '6px 0 0', fontSize: 15 }}>{sel.title}</h3>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      <span className="mono">{sel.id}</span> · {sel.kind.replace('_', ' ')} · raised {sel.created}
                    </div>
                  </div>
                </div>
              </div>
              <div className="detail-b">
                <div className="detail-section">Detail</div>
                <p style={{ fontSize: 13, margin: 0 }}>{sel.detail}</p>

                <div className="detail-section">Target</div>
                <div className="kv" style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '6px 12px', fontSize: 12.5 }}>
                  <span className="muted">type</span><span className="mono">{sel.target.type}</span>
                  {sel.target.id && (<><span className="muted">id</span><span className="mono">{sel.target.id}</span></>)}
                  {sel.target.dept && (<><span className="muted">department</span><span>{CDC.lookup.dept(sel.target.dept)?.name}</span></>)}
                </div>

                <div className="detail-section">Suggested actions</div>
                <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  {flagActions(sel).map((a, i) => <li key={i}>{a}</li>)}
                </ul>

                <div className="detail-section">Agent run</div>
                <dl className="kv">
                  <dt>Detected by</dt><dd>DataQuality agent</dd>
                  <dt>Run</dt><dd className="mono">run-1099 · claude-haiku-4-5 · 1820 ms</dd>
                  <dt>Confidence</dt><dd><ConfChip value={0.87} show={tweaks.confidence} /></dd>
                </dl>
              </div>
              <div className="action-bar">
                {sel.state === 'open' ? (
                  <>
                    <button className="btn" data-size="sm" onClick={() => setFlag(sel.id, 'snoozed')}>Snooze 24h</button>
                    <span style={{ flex: 1 }} />
                    <button className="btn" data-size="sm" data-variant="danger" onClick={() => setFlag(sel.id, 'dismissed')}>Dismiss</button>
                    <button className="btn" data-size="sm" data-variant="primary" onClick={() => setFlag(sel.id, 'resolved')}><Icon name="check" size={11} /> Mark resolved</button>
                  </>
                ) : (
                  <>
                    <Pill tone={sel.state === 'resolved' ? 'green' : 'outline'} dot>{sel.state}</Pill>
                    <span className="muted" style={{ fontSize: 12 }}>Action logged to audit.</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn" data-size="sm" onClick={() => setFlag(sel.id, null)}>Reopen</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="empty">Select a flag.</div>
          )}
        </div>
      </div>
    </div>
  );
}
window.QualityView = QualityView;

function flagActions(f) {
  switch (f.kind) {
    case 'missing_reports': return [
      'Send a Slack reminder to the sub-team owner.',
      'Tag in next morning standup if not received by 09:30 IST.',
      'Auto-escalate after 3 consecutive misses (already triggered for this one).',
    ];
    case 'recurring_blocker': return [
      'Escalate to dependency owner (already suggested as task t-1).',
      'Create dependency entry on dependency board.',
      'Notify Pavan if unresolved 5d.',
    ];
    case 'low_content': return [
      'Send report author a structured template prompt.',
      'Flag in next data-quality review with their lead.',
    ];
    case 'stale_kpi': return [
      'Re-run KPI sheet import.',
      'Ping KPI owner if sheet is in fact stale.',
    ];
    case 'duplicate': return [
      'Assign single owner; merge cross-team item.',
      'Add to Dependencies board.',
    ];
    default: return ['Review with L3.'];
  }
}

// ════════════════════════════════════════════════════════════════════════
// AI RUNS — observability
// ════════════════════════════════════════════════════════════════════════
function RunsView({ tweaks, currentUser }) {
  const CDC = window.CDC;
  const runs = CDC.AI_RUNS;
  const [agentFilter, setAgentFilter] = useState_o('All');
  const [selected, setSelected] = useState_o(null);

  const agents = ['All', ...new Set(runs.map((r) => r.agent))];
  const list = agentFilter === 'All' ? runs : runs.filter((r) => r.agent === agentFilter);

  // aggregate
  const totalCost = list.reduce((s, r) => s + (r.costUsd || 0), 0);
  const avgLatency = Math.round(list.reduce((s, r) => s + r.latencyMs, 0) / Math.max(list.length, 1));
  const totalTokens = list.reduce((s, r) => s + (r.tokensIn + r.tokensOut), 0);

  return (
    <div className="fadein">
      <SectionHeader
        title="AI runs"
        subtitle="Every agent invocation. Inputs, outputs, model, latency, cost, scope hash."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="filter" size={12} /> Last 7 days</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Total runs (7d)</div>
          <div className="kpi-value">{list.length}</div>
          <div className="kpi-meta">{list.filter((r) => r.outcome === 'OK').length} OK · {list.filter((r) => r.outcome !== 'OK').length} other</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Avg latency</div>
          <div className="kpi-value">{avgLatency}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>ms</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Total tokens</div>
          <div className="kpi-value">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Total cost</div>
          <div className="kpi-value">${totalCost.toFixed(3)}</div>
          <div className="kpi-meta">Projected $4.20/mo at this rate</div>
        </div>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {agents.map((a) => (
          <button key={a} className="btn" data-size="sm" data-variant={agentFilter === a ? 'primary' : 'ghost'} onClick={() => setAgentFilter(a)}>
            {a}
            <span className="mono muted" style={{ marginLeft: 6 }}>
              {a === 'All' ? runs.length : runs.filter((r) => r.agent === a).length}
            </span>
          </button>
        ))}
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Run</th>
              <th>Agent</th>
              <th>Model</th>
              <th>When</th>
              <th>Latency</th>
              <th>Tokens (in / out)</th>
              <th>Cost</th>
              <th>Outcome</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: 'default' }}>
                <td className="mono">{r.id}</td>
                <td>{r.agent}</td>
                <td className="mono muted">{r.model}</td>
                <td className="muted mono" style={{ fontSize: 11 }}>{r.ts}</td>
                <td className="num">{r.latencyMs.toLocaleString()}<span className="muted"> ms</span></td>
                <td className="num">{r.tokensIn.toLocaleString()} / {r.tokensOut.toLocaleString()}</td>
                <td className="num">${r.costUsd.toFixed(4)}</td>
                <td><Pill tone={r.outcome === 'OK' ? 'green' : 'amber'}>{r.outcome}</Pill></td>
                <td className="mono muted" style={{ fontSize: 11 }}>{r.scopeHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.id} — ${selected.agent}` : ''} width={780}>
        {selected && (
          <div className="col" style={{ gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <Metric label="Model" value={<span className="mono">{selected.model}</span>} />
              <Metric label="Latency" value={<><span className="mono">{selected.latencyMs}</span> ms</>} />
              <Metric label="Tokens" value={<span className="mono">{selected.tokensIn}/{selected.tokensOut}</span>} />
              <Metric label="Cost" value={<span className="mono">${selected.costUsd.toFixed(4)}</span>} />
            </div>
            <div>
              <div className="detail-section">Input</div>
              <pre className="code" style={{ display: 'block', padding: 12, background: 'var(--panel)', borderRadius: 6, fontSize: 11.5, whiteSpace: 'pre-wrap', margin: 0 }}>{selected.input}</pre>
            </div>
            <div>
              <div className="detail-section">Output</div>
              <pre className="code" style={{ display: 'block', padding: 12, background: 'var(--panel)', borderRadius: 6, fontSize: 11.5, whiteSpace: 'pre-wrap', margin: 0 }}>{selected.output}</pre>
            </div>
            <div>
              <div className="detail-section">Audit</div>
              <dl className="kv">
                <dt>Scope hash</dt><dd className="mono">{selected.scopeHash}</dd>
                <dt>Outcome</dt><dd><Pill tone={selected.outcome === 'OK' ? 'green' : 'amber'}>{selected.outcome}</Pill></dd>
                <dt>Prompt version</dt><dd className="mono">{selected.agent.toLowerCase()}@v3</dd>
                <dt>Replayable</dt><dd>Yes — input + prompt version preserved</dd>
              </dl>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
window.RunsView = RunsView;

function Metric({ label, value }) {
  return (
    <div className="kpi-tile" style={{ padding: 10 }}>
      <div className="kpi-name" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
