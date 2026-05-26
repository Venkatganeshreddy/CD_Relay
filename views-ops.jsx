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
function TasksView({ tweaks, currentUser }) {
  const CDC = window.CDC;
  const allTasks = CDC.filterTasks(currentUser.id);
  const [decisions, setDecisions] = useState_o({}); // id -> 'approved' | 'rejected'
  const [filter, setFilter] = useState_o('SUGGESTED');
  const [editing, setEditing] = useState_o(null);

  const list = allTasks
    .filter((t) => filter === 'ALL' ? true : t.status === filter)
    .map((t) => ({ ...t, _decision: decisions[t.id] }));

  function approve(id) {
    setDecisions((d) => ({ ...d, [id]: 'approved' }));
    CDC.db.updateTask(id, 'ACTIVE');
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_triage', inputRef: `Task ${id}`, action: 'accept', userId: currentUser.id });
  }
  function reject(id) {
    setDecisions((d) => ({ ...d, [id]: 'rejected' }));
    CDC.db.updateTask(id, 'REJECTED');
    CDC.db.logInteraction({ agent: 'Sentry', flow: 'task_triage', inputRef: `Task ${id}`, action: 'reject', userId: currentUser.id });
  }

  const suggested = allTasks.filter((t) => t.status === 'SUGGESTED');
  const reviewed = Object.keys(decisions).length;

  return (
    <div className="fadein">
      <SectionHeader
        title="Tasks"
        subtitle="Suggested tasks from the Escalation agent. Approve to activate; reject to drop with reason."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Scan now</button>
            <button className="btn" data-size="sm" data-variant="primary"><Icon name="check" size={12} /> Approve all (high conf.)</button>
          </>
        }
      />

      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {['SUGGESTED', 'ACTIVE', 'DONE', 'ALL'].map((f) => (
          <button
            key={f}
            className="btn"
            data-size="sm"
            data-variant={filter === f ? 'primary' : 'ghost'}
            onClick={() => setFilter(f)}
          >
            {f.toLowerCase()}
            <span className="mono muted" style={{ marginLeft: 6 }}>
              {(f === 'ALL' ? allTasks.length : allTasks.filter((t) => t.status === f).length)}
            </span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {filter === 'SUGGESTED' && (
          <span className="muted" style={{ fontSize: 12 }}>{reviewed} of {suggested.length} triaged</span>
        )}
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Task</th>
              <th>Dept</th>
              <th>Owner</th>
              <th>Reason</th>
              <th>Conf.</th>
              <th style={{ width: 200 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const decided = t._decision;
              const dept = CDC.lookup.dept(t.dept);
              const owner = CDC.USERS.find((u) => u.id === t.owner) || CDC.REPORT_AUTHORS.find((a) => a.id === t.owner);
              const ownerName = owner?.name || 'Unassigned';
              return (
                <tr key={t.id} style={decided === 'rejected' ? { opacity: 0.45 } : decided === 'approved' ? { background: 'color-mix(in oklch, var(--green-soft) 40%, transparent)' } : {}}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{t.title}</div>
                    {t.sourceReports.length > 0 && (
                      <div style={{ fontSize: 11, marginTop: 2 }}>
                        {t.sourceReports.map((rid, i) => (
                          <Cite key={i} n={i + 1} sourceId={rid} lookupFn={(id) => resolveCitation(id)} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="muted">{dept?.name || '—'}</td>
                  <td className="muted">{ownerName}</td>
                  <td className="muted" style={{ maxWidth: 280, fontSize: 12 }}>{t.reason}</td>
                  <td><ConfChip value={t.confidence} show={tweaks.confidence} /></td>
                  <td>
                    {t.status === 'SUGGESTED' ? (
                      decided === 'approved' ? <Pill tone="green" dot>approved</Pill> :
                      decided === 'rejected' ? <Pill tone="red" dot>rejected</Pill> :
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setEditing(t)}><Icon name="edit" size={11} /></button>
                        <button className="btn" data-size="sm" data-variant="danger" onClick={() => reject(t.id)}>Reject</button>
                        <button className="btn" data-size="sm" data-variant="primary" onClick={() => approve(t.id)}>Approve</button>
                      </div>
                    ) : (
                      <Pill tone={t.status === 'ACTIVE' ? 'blue' : 'outline'} dot>{t.status.toLowerCase()}</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={7}><div className="empty">No {filter.toLowerCase()} tasks.</div></td></tr>
            )}
          </tbody>
        </table>
      </Card>

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
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 }}>Owner</div>
                <input className="tb-search" defaultValue={editing.owner} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 }}>Due date</div>
                <input className="tb-search" type="date" defaultValue="2026-05-29" style={{ width: '100%' }} />
              </div>
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
