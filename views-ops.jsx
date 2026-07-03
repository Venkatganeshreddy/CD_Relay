// CD-Copilot — Weekly drafts, Task triage, Data Quality, AI Runs.

const { useState: useState_o, useMemo: useMemo_o, useEffect: useEffect_o, useRef: useRef_o } = React;

// Display an ISO date (YYYY-MM-DD) as dd/mm/yyyy; pass through anything else.
function dmy(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '—');
}
window.dmy = dmy;

// Shared filter-select style — matches the small button height (30px) so filter
// rows line up cleanly instead of using ad-hoc smaller inline styles.
const FILTER_SELECT = { height: 30, fontSize: 13, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' };

// ════════════════════════════════════════════════════════════════════════
// WEEKLY VIEW
// ════════════════════════════════════════════════════════════════════════
function WeeklyView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const weekly = CDC.filterWeekly(currentUser.id);
  const [selectedId, setSelectedId] = useState_o(weekly[0]?.id || null);
  const [overrides, setOverrides] = useState_o({}); // id -> { status, edited }
  const [editingItem, setEditingItem] = useState_o(null); // { wId, sIdx, iIdx, text }
  const [statusF, setStatusF] = useState_o('all'); // all | draft | published | rejected
  const [, bump] = useState_o(0);

  const selected = weekly.find((w) => w.id === selectedId);
  const liveStatus = (w) => overrides[w.id]?.status || w.status;
  const liveSections = (w) => overrides[w.id]?.sections || w.sections;
  const shown = weekly.filter((w) => statusF === 'all' || liveStatus(w).toLowerCase() === statusF);

  // Deterministic weekly drafts from this week's worklogs + tasks, one per
  // in-scope department. No server agent needed — Regenerate on a draft still
  // upgrades it via Rollup when the edge function is deployed.
  function generateDrafts() {
    const d = new Date(CDC.today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    const weekOf = CDC.fmt(d);
    const genAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(',', '') + ' IST';
    const item = (text, cites = []) => ({ text, cites });
    let created = 0;
    for (const dept of CDC.filterDepartments(currentUser.id)) {
      if ((CDC.WEEKLY || []).some((x) => x.dept === dept.id && x.weekOf === weekOf)) continue;
      const wls = (CDC.WORKLOGS || []).filter((w) => w.dept === dept.id && w.date >= weekOf);
      const tks = (CDC.TASKS || []).filter((t) => t.dept === dept.id && !['REJECTED', 'SUGGESTED'].includes(t.status));
      if (!wls.length && !tks.length) continue;
      const totalH = wls.reduce((s, w) => s + (Number(w.hours) || 0), 0);
      const people = new Set(wls.map((w) => w.userId)).size;
      const done = wls.filter((w) => /done/i.test(w.status || ''));
      const stuck = wls.filter((w) => /block|overdue/i.test(w.status || ''));
      const sections = [{ h: 'Highlights', items: [
        item(`${people} contributor${people === 1 ? '' : 's'} logged ${totalH.toFixed(1)}h across ${wls.length} entr${wls.length === 1 ? 'y' : 'ies'} this week.`),
        ...done.slice(0, 5).map((w) => item(`${w.userName || w.userId}: ${w.outputCategory}${w.outputCount ? ` ×${w.outputCount}` : ''} · ${w.hours}h — Done`, [w.id])),
      ] }];
      const risks = [
        ...stuck.slice(0, 5).map((w) => item(`${w.userName || w.userId}: ${w.outputCategory} — ${w.status}${w.reason ? ` · ${w.reason}` : ''}`, [w.id])),
        ...tks.filter((t) => t.status === 'BLOCKED').slice(0, 3).map((t) => item(`Blocked task: “${t.title}”${t.blockReason ? ` — ${t.blockReason}` : ''}`, [t.id])),
      ];
      if (risks.length) sections.push({ h: 'Risks', items: risks });
      const asks = tks.filter((t) => t.status === 'ESCALATED').slice(0, 3)
        .map((t) => item(`Escalated: “${t.title}”${t.escalReason ? ` — ${t.escalReason}` : ''}`, [t.id]));
      if (asks.length) sections.push({ h: 'Asks', items: asks });
      const draft = { id: `w-${dept.id}-${weekOf}`, dept: dept.id, deptName: dept.short || dept.name, weekOf,
        status: 'DRAFT', confidence: 0.9, generatedAt: genAt, generatedBy: 'Rollup (deterministic)',
        sections, editedBy: null, publishedAt: null };
      if (CDC.db && CDC.db.addWeekly) CDC.db.addWeekly(draft); else (CDC.WEEKLY || []).unshift(draft);
      if (!created && !selected) setSelectedId(draft.id);
      created++;
    }
    bump((n) => n + 1);
    if (CDC.toast) CDC.toast(created
      ? `${created} weekly draft${created === 1 ? '' : 's'} generated for the week of ${weekOf}.`
      : 'Nothing to generate — drafts for this week already exist (or no work is logged yet).',
      created ? 'green' : 'info');
  }

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
            <button className="btn" data-size="sm" title="Cycle status filter"
              onClick={() => setStatusF((f) => ({ all: 'draft', draft: 'published', published: 'rejected', rejected: 'all' }[f]))}>
              <Icon name="filter" size={12} /> {statusF === 'all' ? 'All status' : statusF}
            </button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={generateDrafts}><Icon name="sparkles" size={12} /> Generate this week</button>
          </>
        }
      />

      <div className="split" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="split-list">
          {shown.length === 0 && (
            <div className="empty" style={{ margin: 12 }}>
              {weekly.length === 0
                ? 'No weekly drafts yet — click “Generate this week” to build them from this week’s logged work.'
                : `No ${statusF} drafts.`}
            </div>
          )}
          {shown.map((w) => {
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
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

// Month-grid calendar for the Tasks board. Days with tasks show a count; click a
// day to filter the list to that date. Toggle counts/filter by Due vs Created.
function TaskCalendar({ tasks, dateMode, setDateMode, dateSel, onPick }) {
  const today = window.CDC.today;
  const [ym, setYm] = useState_o(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const pad = (n) => String(n).padStart(2, '0');
  const mk = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const dateOf = (t) => dateMode === 'due' ? t.due : t.created;
  const counts = {};
  for (const t of tasks) { const d = dateOf(t); if (d) counts[d] = (counts[d] || 0) + 1; }
  const first = new Date(ym.y, ym.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const todayStr = mk(today.getFullYear(), today.getMonth(), today.getDate());
  const monthName = first.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const step = (delta) => setYm((s) => { let m = s.m + delta, y = s.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; });
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="card card-pad" style={{ width: 300 }}>
      <div className="seg" style={{ marginBottom: 8 }}>
        <button data-active={dateMode === 'due'} onClick={() => setDateMode('due')}>Due date</button>
        <button data-active={dateMode === 'created'} onClick={() => setDateMode('created')}>Created</button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => step(-1)}>‹</button>
        <strong style={{ fontSize: 13 }}>{monthName}</strong>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => step(1)}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="muted" style={{ fontSize: 10, fontWeight: 600 }}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ds = mk(ym.y, ym.m, d);
          const n = counts[ds] || 0;
          const sel = dateSel === ds;
          return (
            <div key={i} onClick={() => onPick(sel ? null : ds)} title={n ? `${n} task${n === 1 ? '' : 's'}` : ''}
              style={{ cursor: 'pointer', padding: '3px 0', borderRadius: 6, fontSize: 12, lineHeight: 1.1,
                border: ds === todayStr ? '1px solid var(--accent-border)' : '1px solid transparent',
                background: sel ? 'var(--accent)' : n ? 'var(--accent-soft)' : 'transparent',
                color: sel ? '#fff' : 'var(--text)' }}>
              <div>{d}</div>
              <div style={{ fontSize: 9, height: 11, color: sel ? '#fff' : 'var(--accent)' }}>{n || ''}</div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>Click a day to filter · highlighted = has tasks.</div>
    </div>
  );
}

function TasksView({ tweaks, currentUser, initialFilter }) {
  const CDC = window.CDC;
  const me = currentUser;
  const todayStr = CDC.fmt(CDC.today);
  const allTasks = CDC.filterTasks(me.id);
  const reportees = (CDC.USERS || []).filter((u) => u.managerId === me.id);
  const isManager = me.level === 'L2' || me.level === 'L3' || me.level === 'Admin' ||
    ['L2', 'L3', 'ADMIN', 'PRODUCT_OWNER', 'DEPARTMENT_LEAD', 'SUB_LEAD', 'CENTRAL_OPS'].includes(me.role);
  // L3/Admin only — can hard-delete tasks (clean up test/demo rows). Matches the
  // is_hod_admin server RLS, so the remote delete actually succeeds.
  const isAdmin = me.level === 'L3' || me.level === 'Admin' || ['L3', 'ADMIN', 'PRODUCT_OWNER'].includes(me.role);
  // Full-org scope (L3 / Admin): sees everyone's tasks, so the "team mates" tab
  // applies even with no direct reportees (an Admin typically has none).
  const seesAll = CDC.scopeForUser(me.id).kind === 'all';
  const reporteeIds = new Set(reportees.map((r) => r.id));

  const [decisions, setDecisions] = useState_o({});   // suggested triage: id -> approved|rejected
  const [statusOv, setStatusOv] = useState_o({});      // id -> status (forces re-render after update)
  // Managers open to their direct reports' tasks (L3 → L2s, L2 → their L1s); ICs open to their own.
  // initialFilter (from a dashboard deep-link, e.g. Escalations → ESCALATED tab) wins.
  const [filter, setFilter] = useState_o(initialFilter || ((seesAll && !reportees.length) ? 'ALL' : 'MINE'));
  const [reporteeSel, setReporteeSel] = useState_o(''); // L2/L3 reportee drill-down ('' = all)
  const [teamSel, setTeamSel] = useState_o('');         // team (owner's sub) filter ('' = all)
  const [editing, setEditing] = useState_o(null);
  const editTitleRef = useRef_o(null);                // title input in the suggested-task modal
  const [editTask, setEditTask] = useState_o(null);   // owner full-edit of their own task
  const [expanded, setExpanded] = useState_o({});     // taskId -> subtasks expanded?
  const [creating, setCreating] = useState_o(false);
  const [, setTick] = useState_o(0);   // force re-render after a delete
  const [dateSel, setDateSel] = useState_o(null);       // 'YYYY-MM-DD' or null (calendar pick)
  const [dateMode, setDateMode] = useState_o('due');    // 'due' | 'created'
  const [showCal, setShowCal] = useState_o(false);
  const dateOf = (t) => dateMode === 'due' ? t.due : t.created;

  async function removeTask(id) {
    if (!window.confirm('Delete this task permanently? This cannot be undone.')) return;
    if (CDC.db && CDC.db.deleteTask) await CDC.db.deleteTask(id);
    setTick((n) => n + 1);
  }

  const isOverdue = (t) => t.due && t.due < todayStr && !['DONE', 'SUGGESTED', 'REJECTED'].includes(t.status);
  // Escalated = ONLY tasks at ESCALATED status. Blocked and Overdue have their
  // own tabs, so they are no longer folded into the Escalated count.
  const isEscalated = (t) => t.status === 'ESCALATED';

  // ── Time-based escalation rules (Sentry scan). Climbs L1 → L2 → L3. ─────────
  const DAY_MS = 864e5;
  const fullDaysSince = (d) => { if (!d) return 0; const ms = new Date(d).getTime(); return isNaN(ms) ? 0 : Math.floor((Date.now() - ms) / DAY_MS); };
  const daysOverdue = (t) => (t.due && t.due < todayStr) ? Math.floor((new Date(todayStr) - new Date(t.due)) / DAY_MS) : 0;
  // Returns a human reason if a task crosses a time threshold, else null.
  // Thresholds (the day a trigger fires): in progress > 2 days (3rd day),
  // blocked > 1 day (2nd day), overdue > 2 days (3rd day).
  // Escalation is driven ONLY by the due date: a task escalates once it is past
  // its due date (overdue). No blocked-age / in-progress-age / unack triggers.
  const escalationTrigger = (t) => {
    if (['DONE', 'SUGGESTED', 'REJECTED'].includes(t.status)) return null;
    const od = daysOverdue(t);
    if (od >= 1) return `Overdue ${od} day${od === 1 ? '' : 's'} (due ${t.due})`;
    return null;
  };

  const TAB_LABELS = { MINE: 'self', ALL: 'team mates' };
  const tabs = ['MINE', 'BACKLOG', 'ACTIVE', 'ESCALATED', 'BLOCKED', 'OVERDUE', 'DONE', ...((reportees.length || seesAll) ? ['ALL'] : [])];
  const matchesTab = (t, f) =>
    f === 'ALL' ? true :
    f === 'MINE' ? t.owner === me.id :
    f === 'TEAM' ? reporteeIds.has(t.owner) :
    f === 'OVERDUE' ? isOverdue(t) :
    f === 'ESCALATED' ? isEscalated(t) :
    t.status === f;

  // Team = the owner's sub-department (Content — GenAI, — Fullstack, etc.).
  // Options come from the full roster so every team shows even before it has
  // tasks; filtering still keys off the task owner's sub.
  const teamOf = (t) => (CDC.lookup.user(t.owner) || {}).sub || '';
  const teams = [...new Set((CDC.USERS || []).map((u) => u.sub).filter(Boolean))].sort();

  const list = allTasks
    .filter((t) => t.status !== 'SUGGESTED')
    .filter((t) => matchesTab(t, filter))
    .filter((t) => !reporteeSel || t.owner === reporteeSel)
    .filter((t) => !teamSel || teamOf(t) === teamSel)
    .filter((t) => !dateSel || dateOf(t) === dateSel)
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
  // Refresh: dynamically re-pull the latest scoped data from Supabase, re-render,
  // then run the escalation scan on the fresh data. Backs the "Refresh" button.
  async function refreshNow() {
    if (window.CDC.loadFromSupabase) { try { await window.CDC.loadFromSupabase(); } catch (_) {} }
    setTick((n) => n + 1);
    await scanNow();
  }

  // Scan: tasks crossing a time threshold (in-progress > 2d, blocked > 1d, overdue
  // > 2d) get a trigger, flip to ESCALATED, and climb one level up the chain
  // (L1 → L2 → L3). Each scan advances one more level until the top is reached.
  async function scanNow() {
    // Pass 1 — deterministic: pick which tasks trigger, climb the chain, flip status.
    const hits = [];
    for (const t of allTasks) {
      const reason = escalationTrigger(t);
      if (!reason) continue;
      // One climb + one notification per task per day — without this every
      // Refresh click re-escalated and re-notified all overdue tasks.
      if (t.lastEscalScan === todayStr) continue;
      t.lastEscalScan = todayStr;
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
      hits.push({ t, reason, target });
    }
    // Pass 2 — agent: draft all Sentry briefs in parallel (~one round-trip, not N).
    const briefs = await Promise.all(hits.map(({ t, reason, target }) =>
      (CDC.agents && target)
        ? CDC.agents.runSentry({ task: { ...t, ownerName: nm(t.owner) }, event: 'escalated',
            target: nm(target), targetLevel: (CDC.lookup.user(target) || {}).level, reason }).catch(() => null)
        : Promise.resolve(null)));
    // Pass 3 — notify + log with the resolved briefs.
    hits.forEach(({ t, reason, target }, i) => {
      const brief = briefs[i];
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
    });
    const triggered = hits.length;
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
    const note = (form.details || '').trim();
    const title = (form.title && form.title.trim()) ||
      `${form.outputCategory || 'Task'}${form.outputCount ? ` ×${form.outputCount}` : ''}${(tmplSummary || note) ? ` — ${tmplSummary || note}` : ''}`;
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
      desc: note,
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : null,
      blockReason: form.reason || '',
      deliverableId: form.deliverableId || null, deliverable: form.deliverable || null,
      agenticScope: form.agenticScope || null,
    };
    if (status === 'BLOCKED') {
      const chain = managerChain(form.owner);
      task.blockedAt = new Date().toISOString(); task.escalIdx = 0; task.escalatedTo = chain[0] || null;
    }
    CDC.db.addTask(task);
    // Mirror into a worklog so the owner's work shows up LIVE in the manager
    // dashboard, worklogs page, and rollups (all WORKLOGS-driven). Owned by the
    // selected owner, so a manager creating for a reportee logs against them.
    CDC.db.addWorklog({
      id: `wl-${Date.now()}`, taskId: task.id, userId: form.owner, userName: owner ? owner.name : form.owner, userInitials: owner ? owner.initials : '',
      empId: form.owner, dept: owner ? owner.dept : me.dept, sub: owner ? (owner.sub || null) : (me.sub || null), date: todayStr, daysAgo: 0,
      products: form.products || [], stacks: form.stacks || [],
      outputCategory: form.outputCategory || 'Other', taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? 0, template: form.template || {},
      // Est hours count toward today only when the task is actually today's
      // work (due today or earlier). A task due next week must not instantly
      // "complete" today's 8h and inflate today's KPIs.
      hours: (form.due && form.due > todayStr) ? 0
        : (form.estHours != null && form.estHours !== '' ? Number(form.estHours) : 0),
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : 0,
      status: form.status || 'In-progress', reason: form.reason || '', submittedAt: 'just now',
    });
    // Remaining-hours nudge — only when logging your own work (not when a
    // manager creates a task for a reportee).
    if (form.owner === me.id) {
      const dayHrs = (CDC.WORKLOGS || []).filter((w) => w.userId === me.id && w.daysAgo === 0).reduce((s, w) => s + (Number(w.hours) || 0), 0);
      const target = CDC.DAILY_TARGET_HRS || 8;
      const left = target - dayHrs;
      if (CDC.toast) CDC.toast(
        left > 0.01
          ? `Logged ${dayHrs.toFixed(1)}h today — ${left.toFixed(1)}h left to reach your ${target}h day. Add another task to fill it.`
          : `Logged ${dayHrs.toFixed(1)}h today — you've completed your ${target}h day. 🎉`,
        left > 0.01 ? 'amber' : 'green');
      if (left <= 0.01 && CDC.celebrate8h) CDC.celebrate8h(me.id, dayHrs);
    }
    CDC.db.logInteraction({ agent: '—', flow: 'task_create', inputRef: `Task ${task.id}`, action: 'create',
      reason: `Created "${task.title}" (${m.metric || '—'} · ${m.task || '—'}) for ${owner ? owner.name : form.owner} by ${me.name}`, userId: me.id });
    setStatusOv((s) => ({ ...s, [task.id]: status }));
    setCreating(false);
  }

  // Owner edits their own task's fields any time (status stays glance-only).
  // Reuses the create form; updateTaskFields merges the patch + syncs the worklog.
  async function saveEdit(form) {
    if (!editTask) return;
    const id = editTask.id;
    const m = (CDC.TASK_CATALOG.OUTPUT_MAP || {})[form.outputCategory] || {};
    const note = (form.details || '').trim();
    const tmplSummary = form.template ? Object.values(form.template).filter(Boolean).join(' · ') : '';
    const title = `${form.outputCategory || 'Task'}${form.outputCount ? ` ×${form.outputCount}` : ''}${(tmplSummary || note) ? ` — ${tmplSummary || note}` : ''}`;
    const patch = {
      title, products: form.products || [], stacks: form.stacks || [], stack: (form.stacks || [])[0] || null,
      outputCategory: form.outputCategory || null, taskCategory: m.task || '',
      activityCategory: m.activity || '', metricCategory: m.metric || '',
      outputCount: form.outputCount ?? null, template: form.template || {}, desc: note,
      estHours: form.estHours != null && form.estHours !== '' ? Number(form.estHours) : null,
      due: form.due || null,
      deliverableId: form.deliverableId || null, deliverable: form.deliverable || null,
      agenticScope: form.agenticScope || null,
    };
    if (CDC.db && CDC.db.updateTaskFields) await CDC.db.updateTaskFields(id, patch);
    CDC.db.logInteraction && CDC.db.logInteraction({ agent: '—', flow: 'task_edit', inputRef: `Task ${id}`,
      action: 'edit', reason: `Edited "${title}" by ${me.name}`, userId: me.id });
    setEditTask(null);
    setTick((n) => n + 1);
  }

  // ── Subtasks ──────────────────────────────────────────────────────────
  // Lightweight checklist items embedded in the parent task's `data` JSON:
  // { id, title, status, due }. They never enter the flat TASKS list, so they
  // don't inflate any board/glance/badge counts. Persisted via updateTaskFields
  // (subtasks isn't a mirrored worklog field, so the worklog is untouched).
  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  async function saveSubtasks(parentId, subtasks) {
    if (CDC.db && CDC.db.updateTaskFields) await CDC.db.updateTaskFields(parentId, { subtasks });
    setTick((n) => n + 1);
  }
  // Who a subtask can be assigned to: yourself + your management subtree (full
  // roster for Admin/L3). Mirrors the parent CreateTaskModal owner choices.
  const subOwnerChoices = (() => {
    if (CDC.scopeForUser(me.id).kind === 'all') return CDC.USERS || [];
    const byMgr = {}; (CDC.USERS || []).forEach((u) => { (byMgr[u.managerId] = byMgr[u.managerId] || []).push(u); });
    const out = [me]; const stk = [me.id];
    while (stk.length) { for (const c of (byMgr[stk.pop()] || [])) { out.push(c); stk.push(c.id); } }
    return out;
  })();
  const addSubtask = (parent, sub) => saveSubtasks(parent.id,
    [...(parent.subtasks || []), { id: `sub-${Date.now()}`, title: (sub.title || '').trim(), status: 'In-progress', due: sub.due || '', owner: sub.owner || parent.owner }]);
  const patchSubtask = (parent, sid, patch) => saveSubtasks(parent.id,
    (parent.subtasks || []).map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const removeSubtask = (parent, sid) => saveSubtasks(parent.id,
    (parent.subtasks || []).filter((s) => s.id !== sid));

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
            <button className="btn" data-variant={showCal ? 'primary' : 'ghost'} onClick={() => setShowCal((v) => !v)} title="Toggle the calendar"><Icon name="weekly" size={14} /> Calendar</button>
            <button className="btn" onClick={refreshNow} title="Re-pull the latest data and refresh escalations"><Icon name="refresh" size={14} /> Refresh</button>
            <button className="btn" data-variant="accent" onClick={() => setCreating(true)}><Icon name="check" size={14} /> New task</button>
          </>
        }
      />

      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {tabs.map((f) => (
          <button key={f} className="btn" data-variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
            {TAB_LABELS[f] || f.toLowerCase()}
            <span className="mono" style={{ marginLeft: 7, opacity: 0.6, fontWeight: 700 }}>{tabCount(f)}</span>
          </button>
        ))}
      </div>
      {(teams.length > 0 || reportees.length > 0 || filter === 'SUGGESTED') && (
        <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {teams.length > 0 && (
            <select value={teamSel} onChange={(e) => setTeamSel(e.target.value)} style={FILTER_SELECT} title="Filter by team">
              <option value="">All teams</option>
              {teams.map((s) => <option key={s} value={s}>{s.replace('Content — ', '')}</option>)}
            </select>
          )}
          {reportees.length > 0 && (
            <select value={reporteeSel} onChange={(e) => setReporteeSel(e.target.value)} style={FILTER_SELECT} title="Filter by immediate reportee">
              <option value="">All reportees</option>
              {reportees.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.level} · {r.sub || r.dept}</option>)}
            </select>
          )}
          {filter === 'SUGGESTED' && <span className="muted" style={{ fontSize: 12.5 }}>{reviewed} of {suggested.length} triaged</span>}
        </div>
      )}

      {showCal && (
        <div className="row" style={{ gap: 12, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
          <TaskCalendar tasks={allTasks.filter((t) => t.status !== 'SUGGESTED')} dateMode={dateMode} setDateMode={setDateMode} dateSel={dateSel} onPick={setDateSel} />
        </div>
      )}
      {dateSel && (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 12 }}>
          <span className="muted">Showing tasks {dateMode === 'due' ? 'due on' : 'created on'}</span>
          <Pill tone="accent" dot>{dateSel}</Pill>
          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setDateSel(null)}>Clear date</button>
        </div>
      )}

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Task</th>
              <th>Owner</th>
              <th>Dates</th>
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
              // Only the task's owner may change its status; everyone else
              // (managers included) sees it read-only. SUGGESTED tasks are never
              // status-editable here (they go through approve/reject).
              const isOwner = t.owner === me.id;
              const canSetStatus = status !== 'SUGGESTED' && isOwner;
              const subs = t.subtasks || [];
              const hasSubUI = status !== 'SUGGESTED' && (subs.length > 0 || isOwner);
              const isOpen = !!expanded[t.id];
              return (
                <React.Fragment key={t.id}>
                <tr style={decided === 'rejected' ? { opacity: 0.45 } : decided === 'approved' ? { background: 'color-mix(in oklch, var(--green-soft) 40%, transparent)' } : {}}>
                  <td>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      {hasSubUI ? (
                        <button className="btn" data-size="sm" data-variant="ghost" title={isOpen ? 'Hide subtasks' : 'Show subtasks'}
                          style={{ padding: '0 4px' }} onClick={() => toggleExpand(t.id)}>
                          <Icon name={isOpen ? 'chev-down' : 'chev-right'} size={12} />
                        </button>
                      ) : <span style={{ display: 'inline-block', width: 18 }} />}
                      <span style={{ fontWeight: 500 }}>{t.title}</span>
                      {subs.length > 0 && (
                        <Pill tone="outline" title={`${subs.filter((s) => s.status === 'Done').length}/${subs.length} subtasks done`}>
                          {subs.filter((s) => s.status === 'Done').length}/{subs.length}
                        </Pill>
                      )}
                    </div>
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
                    {(t.deliverable || t.agenticScope) && (
                      <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                        {t.agenticScope && <Pill tone="accent" dot title="Agentic execution scope">⚡ {t.agenticScope}</Pill>}
                        {t.deliverable && <span className="muted" style={{ fontSize: 11 }} title="Deliverable">→ {t.deliverable}</span>}
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
                    <div>due {dmy(t.due)}{overdue && <span className="pill" data-tone="red" style={{ fontSize: 9, marginLeft: 6 }}>{daysOverdue(t)}d overdue</span>}</div>
                    {t.created && <div className="muted" style={{ fontSize: 10, marginTop: 1 }}>created {dmy(t.created)}</div>}
                  </td>
                  <td>
                    {/* Read-only on the board — status is changed only on the
                        Day-end glance (the 6:00 PM check-in). */}
                    {status === 'SUGGESTED' ? (
                      <Pill tone="outline" dot>suggested</Pill>
                    ) : (
                      <Pill tone={meta.tone} dot title="Status is set on the Day-end glance">{meta.label}</Pill>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
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
                      {isOwner && status !== 'SUGGESTED' && (
                        <button className="btn" data-size="sm" data-variant="ghost" title="Edit this task"
                          onClick={() => setEditTask(t)}><Icon name="edit" size={11} /> Edit</button>
                      )}
                      {isAdmin && status !== 'SUGGESTED' && (
                        <button className="btn" data-size="sm" data-variant="danger" title="Delete task (admin)"
                          style={{ marginLeft: 'auto' }} onClick={() => removeTask(t.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && subs.map((s) => (
                  <SubtaskRow key={s.id} sub={s} canEdit={isOwner} people={subOwnerChoices} defaultOwner={t.owner}
                    onPatch={(patch) => patchSubtask(t, s.id, patch)} onRemove={() => removeSubtask(t, s.id)} />
                ))}
                {isOpen && isOwner && (
                  <tr>
                    <td colSpan={5} style={{ background: 'var(--panel-2, #fafafa)', paddingLeft: 30, borderLeft: '2px solid var(--accent-border, #c7d0f5)', borderBottom: '1px solid var(--border)' }}>
                      <SubtaskAdder onAdd={(sub) => addSubtask(t, sub)} people={subOwnerChoices} defaultOwner={t.owner} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
            {list.length === 0 && <tr><td colSpan={5}><div className="tasks-empty">
              <div className="tasks-empty-orb"><Icon name="tasks" size={30} /></div>
              <div className="tasks-empty-title">
                {filter === 'MINE' ? 'No tasks yet' : filter === 'ALL' ? 'No team-mate tasks' : `No ${(TAB_LABELS[filter] || filter).toLowerCase()} tasks`}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {filter === 'MINE' ? 'Create your first task and it’ll show up right here.' : 'Nothing to show in this view yet.'}
              </div>
              {filter === 'MINE' && (
                <button className="btn" data-variant="accent" onClick={() => setCreating(true)} style={{ marginTop: 4 }}>
                  <Icon name="check" size={12} /> New task
                </button>
              )}
            </div></td></tr>}
          </tbody>
        </table>
      </Card>

      <CreateTaskModal open={creating} onClose={() => setCreating(false)} onCreate={createTask} me={me} people={CDC.USERS} todayStr={todayStr} />

      <CreateTaskModal open={!!editTask} onClose={() => setEditTask(null)} onCreate={saveEdit} initial={editTask} me={me} people={CDC.USERS} todayStr={todayStr} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit suggested task"
        footer={<>
          <button className="btn" data-variant="ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn" data-variant="primary" onClick={async () => {
            // Persist the edited title before approving — it was silently dropped.
            const v = (editTitleRef.current && editTitleRef.current.value || '').trim();
            if (v && v !== editing.title && CDC.db.updateTaskFields) await CDC.db.updateTaskFields(editing.id, { title: v });
            approve(editing.id); setEditing(null);
          }}>Save & approve</button>
        </>}
      >
        {editing && (
          <div className="col" style={{ gap: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 }}>Title</div>
              <input ref={editTitleRef} className="tb-search" defaultValue={editing.title} style={{ width: '100%' }} />
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

// One nested subtask row (lightweight: title · status · due date). Read-only by
// default with Edit + Delete actions (mirrors the parent row); the parent task's
// owner can toggle inline editing. Non-owners always see it read-only.
const SUBTASK_TONE = { 'Done': 'green', 'In-progress': 'blue', 'Blocked': 'red', 'Overdue': 'amber', 'Backlog': 'amber' };
const SUB_INP = { fontSize: 12, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' };
const subOwnerName = (id) => (window.CDC.lookup.user(id) || {}).name || '—';
function OwnerSelect({ value, people, onChange }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={{ ...SUB_INP, maxWidth: 150 }}>
      {!value && <option value="">Assign…</option>}
      {(people || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}
function SubtaskRow({ sub, canEdit, people, defaultOwner, onPatch, onRemove }) {
  const STATUSES = (window.CDC.TASK_CATALOG || {}).STATUSES || ['In-progress', 'Done', 'Blocked'];
  const [editing, setEditing] = useState_o(false);
  const [draft, setDraft] = useState_o(sub);
  const open = () => { setDraft({ ...sub, owner: sub.owner || defaultOwner }); setEditing(true); };
  const canSave = (draft.title || '').trim() && draft.due;   // due date is mandatory
  const save = () => { if (!canSave) return; onPatch({ title: draft.title.trim(), status: draft.status, due: draft.due, owner: draft.owner || defaultOwner }); setEditing(false); };
  // Subtle tree connector + tinted band so nested rows read as children.
  const cell = { background: 'var(--panel-2, #fafafa)', borderBottom: '1px solid var(--border)' };
  const firstCell = { ...cell, paddingLeft: 30, borderLeft: '2px solid var(--accent-border, #c7d0f5)' };
  if (editing) {
    return (
      <tr>
        <td style={firstCell}>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="muted">↳</span>
            <input autoFocus value={draft.title || ''} placeholder="Subtask name"
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              style={{ ...SUB_INP, width: '88%', fontWeight: 500 }} />
          </div>
        </td>
        <td style={cell}><OwnerSelect value={draft.owner || defaultOwner} people={people} onChange={(v) => setDraft((d) => ({ ...d, owner: v }))} /></td>
        <td style={cell}>
          <input type="date" required value={draft.due || ''} onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
            style={{ ...SUB_INP, borderColor: draft.due ? 'var(--border)' : 'var(--red, #e5484d)' }} />
        </td>
        <td style={cell}>
          <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} style={SUB_INP}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        <td style={cell}>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn" data-size="sm" data-variant="primary" disabled={!canSave} title={!draft.due ? 'Due date is required' : 'Save'} onClick={save}>Save</button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td style={firstCell}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}><span className="muted" style={{ marginRight: 6 }}>↳</span>{sub.title}</span>
      </td>
      <td style={cell} className="muted">{subOwnerName(sub.owner || defaultOwner)}</td>
      <td className="muted mono" style={{ ...cell, fontSize: 12 }}>due {dmy(sub.due)}</td>
      <td style={cell}><Pill tone={SUBTASK_TONE[sub.status] || 'outline'} dot>{sub.status}</Pill></td>
      <td style={cell}>
        {canEdit && (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" data-size="sm" data-variant="ghost" title="Edit subtask" onClick={open}><Icon name="edit" size={11} /> Edit</button>
            <button className="btn" data-size="sm" data-variant="danger" title="Delete subtask" onClick={onRemove}>Delete</button>
          </div>
        )}
      </td>
    </tr>
  );
}

// Inline "add subtask" — name + assignee + (mandatory) due date, then Add.
function SubtaskAdder({ onAdd, people, defaultOwner }) {
  const [title, setTitle] = useState_o('');
  const [due, setDue] = useState_o('');
  const [owner, setOwner] = useState_o(defaultOwner || '');
  const ready = title.trim() && due;
  const add = () => { if (!ready) return; onAdd({ title, due, owner: owner || defaultOwner }); setTitle(''); setDue(''); setOwner(defaultOwner || ''); };
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="muted">↳</span>
      <input value={title} placeholder="Add a subtask…" onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ ...SUB_INP, width: 220 }} />
      <OwnerSelect value={owner} people={people} onChange={setOwner} />
      <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} title="Due date (required)"
        style={{ ...SUB_INP, borderColor: due ? 'var(--border)' : 'var(--red, #e5484d)' }} />
      <button className="btn" data-size="sm" data-variant="primary" disabled={!ready} title={!due ? 'Due date is required' : 'Add subtask'} onClick={add}>
        <Icon name="check" size={11} /> Add subtask
      </button>
    </div>
  );
}

// Internal task status → form label, for seeding the modal in edit mode.
const TASK_STATUS_LABEL = { ACTIVE: 'In-progress', DONE: 'Done', BLOCKED: 'Blocked', ESCALATED: 'Blocked', BACKLOG: 'Backlog' };

function CreateTaskModal({ open, onClose, onCreate, me, people, todayStr, initial }) {
  const editing = !!initial;
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
  const [details, setDetails] = useState_o('');
  const [deliverableId, setDeliverableId] = useState_o('');   // links task to an L2 deliverable
  const [agenticScope, setAgenticScope] = useState_o('');     // L0..L5 — how much the AI executes (required)
  useEffect_o(() => {
    if (!open) return;
    if (initial) {
      setOwner(initial.owner || me.id); setProducts(initial.products || []); setStacks(initial.stacks || []);
      setOutputCategory(initial.outputCategory || ''); setCatSearch('');
      setOutputCount(initial.outputCount == null ? '' : String(initial.outputCount));
      setTemplate({ ...(initial.template || {}) });
      setEstHours(initial.estHours == null ? '' : String(initial.estHours));
      setStatus(TASK_STATUS_LABEL[initial.status] || 'In-progress'); setDue(initial.due || '');
      setReason(initial.blockReason || ''); setDetails(initial.desc || '');
      setDeliverableId(initial.deliverableId || ''); setAgenticScope(initial.agenticScope || '');
    } else {
      setOwner(me.id); setProducts([]); setStacks([]); setOutputCategory(''); setCatSearch('');
      setOutputCount(''); setTemplate({}); setEstHours(''); setStatus('In-progress'); setDue(''); setReason(''); setDetails('');
      setDeliverableId(''); setAgenticScope('');
    }
  }, [open]);

  // Deliverables the task owner can pick — only the ones assigned to THEM (their
  // L2 assigns deliverables per person), flattened from the owner's team goals.
  const deliverableOpts = (() => {
    const goals = (window.CDC.filterGoals ? window.CDC.filterGoals(owner) : []) || [];
    const out = [];
    for (const g of goals) for (const d of (g.deliverables || [])) {
      if ((d.assignees || []).includes(owner)) out.push({ id: d.id, text: d.text, goal: g.title, products: g.products || [] });
    }
    return out;
  })();
  // Picking a deliverable auto-fills the task's Product-Audience from its goal.
  const onPickDeliverable = (id) => {
    setDeliverableId(id);
    const opt = deliverableOpts.find((d) => d.id === id);
    if (opt && (opt.products || []).length) setProducts([...opt.products]);
  };
  const AGENTIC_SCOPES = CAT.AGENTIC_SCOPES || [];

  const map = outputCategory ? CAT.OUTPUT_MAP[outputCategory] : null;
  const taskCategory = map ? map.task : '';
  const countNA = outputCategory ? CAT.COUNT_NA.has(outputCategory) : false;
  const fields = TASK_TEMPLATES_REF(CAT)[taskCategory] || CAT.DEFAULT_TEMPLATE || [];
  const needsReason = !editing && (status === 'Blocked' || status === 'Overdue');
  const filteredCats = CAT.OUTPUT_CATEGORIES.filter((c) => c.toLowerCase().includes(catSearch.toLowerCase()));

  // Stack, Task (template) and Output count are optional — count defaults to 0.
  // Status, Due date and Agentic execution scope are mandatory.
  const hoursOk = estHours === '' || (Number(estHours) > 0 && Number(estHours) <= 24);
  const valid = products.length > 0 && !!outputCategory &&
    !!status && !!due && (editing || !!agenticScope) &&
    details.trim().length > 0 && hoursOk &&
    (!needsReason || reason.trim().length > 0);

  const label = () => ({ fontSize: 12.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.05, fontWeight: 700, marginBottom: 8, borderLeft: '3px solid var(--accent)', paddingLeft: 9, lineHeight: 1.1 });
  const inp = { width: '100%', fontSize: 14.5, padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', minHeight: 40 };
  const toggle = (set, val) => set((s) => s.includes(val) ? s.filter((x) => x !== val) : [...s, val]);

  // Owner choices: yourself + everyone who reports up to you (your subtree), so
  // an L2 sees their L1s to assign work; an L3 sees their L2s and L1s. A
  // non-manager (no reportees) sees only themselves. Full-scope users (Admin/L3)
  // can assign to ANYONE, so they get the whole roster.
  // ponytail: plain BFS over managerId — the roster is small.
  const ownerSeesAll = window.CDC.scopeForUser(me.id).kind === 'all';
  const myTeam = (() => {
    if (ownerSeesAll) return (people || []).filter((u) => u.id !== me.id);
    const byMgr = {};
    (people || []).forEach((u) => { (byMgr[u.managerId] = byMgr[u.managerId] || []).push(u); });
    const out = []; const stack = [me.id];
    while (stack.length) { for (const c of (byMgr[stack.pop()] || [])) { out.push(c); stack.push(c.id); } }
    return out;
  })();

  const sectionGap = { display: 'flex', flexDirection: 'column', gap: 16 };
  const selCount = (n) => <span className="muted" style={{ textTransform: 'none', fontWeight: 400, fontSize: 11 }}>{n ? `· ${n} selected` : '· multi-select'}</span>;
  return (
    <Modal open={open} onClose={onClose} width={840}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span className="tf-badge"><Icon name={editing ? 'edit' : 'sparkles'} size={14} /></span>
        <span>{editing ? 'Edit task' : 'New task'}<span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>· CD Task flow</span></span>
      </span>}
      footer={<>
        <span className="muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>
          {!outputCategory ? 'Pick a product-audience & output category'
            : !details.trim() ? 'Task details are required'
            : !due ? 'Due date is required'
            : !hoursOk ? 'Est. hours must be between 0 and 24'
            : (!editing && !agenticScope) ? 'Pick an agentic execution scope'
            : needsReason && !reason.trim() ? `Reason required for ${status.toLowerCase()}`
            : `${(map || {}).metric || '—'} · ${(map || {}).task || '—'}`}
        </span>
        <button className="btn" data-variant="ghost" onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={!valid}
          onClick={() => onCreate({ owner, products, stacks, outputCategory, details,
            // Pass loaded values through — hardcoding null/{} wiped an edited
            // task's existing count/template (and its mirrored worklog's).
            outputCount: outputCount === '' ? null : Number(outputCount) || 0,
            template, estHours, status, due: due || null, reason,
            deliverableId: deliverableId || null, deliverable: (deliverableOpts.find((d) => d.id === deliverableId) || {}).text || null,
            agenticScope })}>
          {editing ? 'Save changes' : 'Create task'}
        </button>
      </>}
    >
      <div className="taskform" style={sectionGap}>
        {/* 1. Owner (EMP ID) — fixed when editing an existing task. */}
        {!editing && (
          <div>
            <div style={label()}>Owner <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· EMP ID auto-filled</span></div>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inp}>
              <option value={me.id}>{me.name} (me)</option>
              {myTeam.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.level} · {u.sub || u.dept}</option>)}
            </select>
          </div>
        )}

        {/* Deliverable first — picking it maps the Product-Audience below.
            Agentic execution scope (required) sits alongside. */}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={label()}>Deliverable <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· from your team's goals · sets Product-Audience</span></div>
            <select value={deliverableId} onChange={(e) => onPickDeliverable(e.target.value)} style={inp}>
              <option value="">— none —</option>
              {deliverableOpts.map((d) => <option key={d.id} value={d.id}>{d.text} · {d.goal}</option>)}
            </select>
            {deliverableOpts.length === 0 && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>No deliverables assigned to this owner yet — your L2 assigns them on the Goals page.</div>}
          </div>
          <div style={{ flex: '1 1 320px' }}>
            <div style={label()}>Agentic execution scope <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
            <select value={agenticScope} onChange={(e) => setAgenticScope(e.target.value)} style={{ ...inp, borderColor: agenticScope ? 'var(--border)' : 'var(--red, #e5484d)' }}>
              <option value="">— how much did the AI do? —</option>
              {AGENTIC_SCOPES.map((s) => <option key={s.v} value={s.v}>{s.v} · {s.label}</option>)}
            </select>
          </div>
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
          <div style={label()}>Output category <span style={{ color: 'var(--rose, #c0392b)' }}>*</span></div>
          {/* Persistent "selected" line so the choice stays visible while scrolling. */}
          {outputCategory ? (
            <div className="row" style={{ gap: 8, alignItems: 'center', margin: '2px 0 8px' }}>
              <span className="muted" style={{ fontSize: 12 }}>Selected:</span>
              <span style={{ fontWeight: 600, fontSize: 13, background: 'var(--accent-soft, #eef2ff)', color: 'var(--accent, #4356c0)', border: '1px solid var(--accent-border, #c7d0f5)', borderRadius: 999, padding: '3px 10px' }}>{outputCategory}</span>
              <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={() => { setOutputCategory(''); setTemplate({}); setCatSearch(''); }}>change</button>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 11.5, margin: '2px 0 6px' }}>Search or pick one — it auto-fills the metric, activity and task.</div>
          )}
          <input className="tb-search" placeholder="Search categories…" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} style={inp} />
          <div className="chip-grid" style={{ marginTop: 8, maxHeight: 184, overflowY: 'auto', padding: 10, border: '1px solid var(--border, #d8d9dd)', borderRadius: 8, background: 'var(--panel-2, #fafafa)', alignContent: 'flex-start' }}>
            {filteredCats.map((c) => {
              const sel = outputCategory === c;
              return (
                <div key={c} className="chip" data-selected={sel} onClick={() => { setOutputCategory(c); setTemplate({}); }}
                  style={sel ? { background: 'var(--accent, #4356c0)', color: '#fff', borderColor: 'var(--accent, #4356c0)', fontWeight: 600 } : undefined}>
                  {sel && <Icon name="check" size={10} stroke={2.4} />}<span>{c}</span>
                </div>
              );
            })}
            {filteredCats.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No matches.</div>}
          </div>
          {map && (
            <div className="row" style={{ gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pill tone="accent" dot>{map.metric}</Pill>
              <span className="muted" style={{ fontSize: 11.5 }}>{map.activity} → {map.task}</span>
            </div>
          )}
        </div>

        {/* Task details — the single required description of the work. */}
        {map && (
          <div>
            <div style={label()}>Task details <span style={{ color: 'var(--rose, #c0392b)' }}>*</span> <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· describe what this task is</span></div>
            <textarea className="field-input" style={{ width: '100%', height: 72, padding: 10, resize: 'vertical', fontSize: 14.5 }}
              placeholder="What needs to be done for this output? Be specific."
              value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
        )}

        {/* 5. Status · Reason · Estimated time */}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {/* Status is set only on the Day-end glance — hidden when editing. */}
          {!editing && (
            <div style={{ flex: '1 1 140px' }}>
              <div style={label()}>Status <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
                {CAT.STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div style={{ flex: '1 1 140px' }}>
            <div style={label()}>Due date <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
            <input type="date" value={due} min={editing ? undefined : todayStr} onChange={(e) => setDue(e.target.value)} style={inp} />
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
            <textarea className="field-input" style={{ width: '100%', height: 60, padding: 10, resize: 'vertical', fontSize: 14.5 }}
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
  const [orSpend, setOrSpend] = useState_o(null); // exact spend from OpenRouter auth/key
  useEffect_o(() => {
    let on = true;
    (CDC.fetchOpenRouterSpend ? CDC.fetchOpenRouterSpend() : Promise.reject())
      .then((d) => { if (on && d && typeof d.usage === 'number') setOrSpend(d); })
      .catch(() => {}); // offline/seed mode → tile keeps the computed sum
    return () => { on = false; };
  }, []);

  const agents = ['All', ...new Set(runs.map((r) => r.agent))];
  const list = agentFilter === 'All' ? runs : runs.filter((r) => r.agent === agentFilter);

  // aggregate
  const totalCost = list.reduce((s, r) => s + (r.costUsd || 0), 0);
  const avgLatency = Math.round(list.reduce((s, r) => s + r.latencyMs, 0) / Math.max(list.length, 1));
  const totalTokens = list.reduce((s, r) => s + (r.tokensIn + r.tokensOut), 0);

  // Project monthly spend from the observed span of runs (newest → oldest ts).
  // Falls back to "—" when there's not enough data for a meaningful rate.
  const projectedMonthly = (() => {
    if (list.length < 2 || totalCost <= 0) return null;
    const times = list.map((r) => {
      // `ts` is "YYYY-MM-DD HH:MM IST" — strip the suffix and parse as IST.
      const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(r.ts || '');
      if (!m) return NaN;
      // Treat the stamp as IST (UTC+5:30) so the span is correct regardless of viewer TZ.
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 5, +m[5] - 30);
    }).filter((n) => !isNaN(n));
    if (times.length < 2) return null;
    const spanDays = Math.max(1 / 24, (Math.max(...times) - Math.min(...times)) / 86_400_000);
    return (totalCost / spanDays) * 30;
  })();

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
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
          <div className="kpi-value">${orSpend ? orSpend.usage.toFixed(4) : totalCost.toFixed(3)}</div>
          <div className="kpi-meta">
            {orSpend
              ? `Exact (all-time)${typeof orSpend.usage_weekly === 'number' ? ` · wk $${orSpend.usage_weekly.toFixed(4)}` : ''}${orSpend.limit != null ? ` · $${Number(orSpend.limit_remaining ?? 0).toFixed(2)} left` : ''} · runs $${totalCost.toFixed(3)}`
              : (projectedMonthly != null ? `Projected $${projectedMonthly.toFixed(2)}/mo at this rate` : 'Projection pending — need ≥ 2 runs')}
          </div>
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
