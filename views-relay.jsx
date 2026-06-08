// Relay — placeholder views + small new pages used while we rebuild the rest.

const { useState: useStP, useMemo: useMP } = React;

// MOM Loader is restricted to L3 and Admin.
function canUseMomLoader(u) {
  return !!u && (u.role === 'ADMIN' || u.role === 'PRODUCT_OWNER' || u.level === 'L3' || u.level === 'Admin');
}
window.canUseMomLoader = canUseMomLoader;

// Pick the lead of a group: the member others report to, else the highest level.
function pickLead(members) {
  const rank = { Admin: 4, L3: 3, L2: 2, L1: 1, L0: 0 };
  const manager = members.find((m) => members.some((o) => o.managerId === m.id));
  if (manager) return manager;
  return [...members].sort((a, b) => (rank[b.level] || 0) - (rank[a.level] || 0))[0];
}

// ── Placeholder shell for views we'll build out later ──────────────────
function Placeholder({ title, sub, hint }) {
  return (
    <div className="fadein">
      <SectionHeader title={title} subtitle={sub} />
      <div className="card card-pad" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <Icon name="sparkles" size={24} />
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Coming next sprint</div>
        <div style={{ marginTop: 6, fontSize: 12.5 }}>{hint}</div>
      </div>
    </div>
  );
}

function MonthlyView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const logs = CDC.worklogsWithin(currentUser.id, 30);
  const teams = {};
  for (const w of logs) {
    const k = w.sub || (CDC.lookup.dept(w.dept) || {}).name || w.dept || '—';
    (teams[k] = teams[k] || []).push(w);
  }
  const totalHours = logs.reduce((s, w) => s + (w.hours || 0), 0);
  return (
    <div className="fadein">
      <SectionHeader title="Monthly worklogs"
        subtitle={`Ledger consolidation · last 30 days · ${logs.length} entries · ${totalHours.toFixed(0)} hrs · ${new Set(logs.map((w) => w.userId)).size} contributors`} />
      <CategoryBreakdown title="All contributions by output category" worklogs={logs} />
      {Object.entries(teams).map(([team, list]) => (
        <div key={team} style={{ marginTop: 18 }}>
          <CategoryBreakdown title={`${team} · ${list.reduce((s, w) => s + (w.hours || 0), 0).toFixed(0)} hrs`} worklogs={list} />
        </div>
      ))}
      {logs.length === 0 && <div className="empty">No worklogs in the last 30 days for your scope.</div>}
    </div>
  );
}
window.MonthlyView = MonthlyView;

function SecondBrainView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const moms = CDC.MOMS;
  return (
    <div className="fadein">
      <SectionHeader
        title="Second Brain"
        subtitle="Meeting memory graph. Cartographer keeps it fresh."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="search" size={12} /> GraphRAG search</button>
            {canUseMomLoader(currentUser) && <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('mom')}><Icon name="sparkles" size={12} /> Add MOM</button>}
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="kpi-tile">
          <div className="kpi-name">MOMs ingested</div>
          <div className="kpi-value">{moms.length}</div>
          <div className="kpi-meta"><span>this month</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Graph nodes</div>
          <div className="kpi-value">412</div>
          <div className="kpi-meta"><span>87 entities · 325 events</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Graph edges</div>
          <div className="kpi-value">1,084</div>
          <div className="kpi-meta"><span>avg degree 5.3</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Action items extracted</div>
          <div className="kpi-value">{moms.reduce((s, m) => s + (m.actionItems || []).length, 0)}</div>
          <div className="kpi-meta"><span>{moms.reduce((s, m) => s + (m.actionItems || []).filter((a) => a.status === 'approved').length, 0)} approved</span></div>
        </div>
      </div>

      <h2 className="h-section">Recent MOMs</h2>
      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Title</th>
              <th>Date</th>
              <th>Duration</th>
              <th>Attendees</th>
              <th>Action items</th>
              <th>Channel</th>
            </tr>
          </thead>
          <tbody>
            {moms.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{m.title}</div>
                  {m.summary && <div className="muted" style={{ fontSize: 11, lineHeight: 1.35 }}>{m.summary.slice(0, 100)}…</div>}
                </td>
                <td className="mono muted" style={{ fontSize: 11.5 }}>{m.date}</td>
                <td className="num">{m.duration ? `${m.duration} min` : '—'}</td>
                <td>
                  <div className="row" style={{ gap: 2 }}>
                    {(m.attendees || []).slice(0, 4).map((uid) => (
                      <Avatar key={uid} user={window.CDC.lookup.user(uid)} size={20} />
                    ))}
                    {(m.attendees || []).length > 4 && <span className="muted mono" style={{ fontSize: 11 }}>+{m.attendees.length - 4}</span>}
                  </div>
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <Pill tone="green">{(m.actionItems || []).filter((a) => a.status === 'approved').length}</Pill>
                    <Pill tone="amber">{(m.actionItems || []).filter((a) => a.status === 'pending_review').length}</Pill>
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 11.5 }}>{m.channel || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ marginTop: 24, padding: 20, background: 'var(--panel)', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Icon name="sparkles" size={20} />
        <div style={{ marginTop: 8, fontSize: 13 }}><strong>Graph view coming next sprint</strong> — force-directed node-link of people × meetings × decisions × tasks.</div>
      </div>
    </div>
  );
}
window.SecondBrainView = SecondBrainView;

// ── MOM Loader ─────────────────────────────────────────────────────────
function MomLoader({ open, onClose, currentUser, nav }) {
  const [step, setStep] = useStP('paste');  // paste → scribe → dispatcher → review → done
  const [transcript, setTranscript] = useStP('');
  const [agenda, setAgenda] = useStP('');
  const [actionItems, setActionItems] = useStP([]);
  const [decisions, setDecisions] = useStP({});
  const [rejectNotes, setRejectNotes] = useStP({});  // id -> rejection note
  const [bullets, setBullets] = useStP([]);                     // [{ id, text, person }]
  const [momTab, setMomTab] = useStP('summary');                // summary | actions | pipeline

  // Bullet editing helpers (Summary tab) — mirrors the action-item editability.
  const newBullet = (text = '', person = '') => ({ id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, person });
  function addBullet() { setBullets((arr) => [...arr, newBullet('')]); }
  function editBulletText(id, text) { setBullets((arr) => arr.map((b) => b.id === id ? { ...b, text } : b)); }
  function editBulletPerson(id, person) { setBullets((arr) => arr.map((b) => b.id === id ? { ...b, person } : b)); }
  function removeBullet(id) { setBullets((arr) => arr.filter((b) => b.id !== id)); }
  function moveBullet(id, dir) {
    setBullets((arr) => {
      const i = arr.findIndex((b) => b.id === id);
      if (i < 0) return arr;
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return arr;
      const next = arr.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setTranscript(String(e.target.result || ''));
    reader.readAsText(file);
  }

  // Dispatcher — route Scribe's assignee hint to a real employee using the
  // people graph: person → sub-team lead → dept lead → role, then triage fallback.
  function dispatcherAssign(hint) {
    const users = window.CDC.USERS || [];
    const norm = (s) => String(s || '').toLowerCase().trim();
    const h = norm(hint);
    if (!h) return { id: currentUser.id, reason: 'No assignee hint — assigned to you for triage' };

    // 1. Person: exact name wins; then full-name contained in hint; then initials;
    //    then a UNIQUE name-token (skip ambiguous first names like "Pavan" → 2 people).
    const hTokens = h.split(/\s+/).filter((p) => p.length > 2);
    let u = users.find((x) => norm(x.name) === h)
         || users.find((x) => h.includes(norm(x.name)))                              // hint contains a full name
         || (h.length >= 4 ? users.find((x) => norm(x.name).includes(h)) : null)     // hint is a substring of a name
         || users.find((x) => norm(x.initials) === h);
    if (!u) {
      const tokenMatches = users.filter((x) => norm(x.name).split(/\s+/).some((p) => p.length > 2 && hTokens.includes(p)));
      if (tokenMatches.length === 1) u = tokenMatches[0];   // only if unambiguous
    }
    if (u) return { id: u.id, reason: `${u.name} (${u.level}) — matched person "${hint}"` };

    // 2. Sub-team: route to that sub's lead (the manager others report to).
    const subMembers = users.filter((x) => x.sub && (norm(x.sub).includes(h) || h.includes(norm(x.sub))));
    if (subMembers.length) {
      const lead = pickLead(subMembers);
      return { id: lead.id, reason: `${lead.name} — lead of "${lead.sub}" via manager graph (hint "${hint}")` };
    }

    // 3. Department: route to the dept lead.
    const dept = (window.CDC.DEPARTMENTS || []).find((d) => norm(d.name).includes(h) || h.includes(norm(d.name)) || norm(d.id).includes(h));
    if (dept) {
      const deptMembers = users.filter((x) => x.dept === dept.id);
      if (deptMembers.length) { const lead = pickLead(deptMembers); return { id: lead.id, reason: `${lead.name} — ${dept.name} lead via manager graph (hint "${hint}")` }; }
    }

    // 4. Role keyword.
    if (/\badmin\b/.test(h)) { const a = users.find((x) => x.level === 'Admin' || x.role === 'ADMIN'); if (a) return { id: a.id, reason: `${a.name} — Admin (role match)` }; }

    // 5. Fallback: triager.
    return { id: currentUser.id, reason: `No clear owner for "${hint}" — assigned to you for triage` };
  }
  function dueIn(days) { const CDC = window.CDC; const d = CDC.daysAgo ? CDC.daysAgo(-days) : new Date(Date.now() + days * 864e5); return CDC.fmt ? CDC.fmt(d) : d.toISOString().slice(0, 10); }

  async function runPipeline() {
    setStep('scribe');
    let items = null;
    let derivedAgenda = '';
    try {
      if (window.CDC.agents && transcript.trim().length > 20) {
        const raw = await window.CDC.agents.runScribe(transcript); // real Scribe via Edge Function
        setStep('dispatcher');
        derivedAgenda = (raw && raw.agenda) || '';
        const rawBullets = (raw && Array.isArray(raw.bullets)) ? raw.bullets : [];
        setBullets(rawBullets
          .map((b) => {
            if (b && typeof b === 'object') return { text: String(b.text || '').trim(), person: String(b.person || '').trim() };
            return { text: String(b || '').trim(), person: '' };
          })
          .filter((b) => b.text)
          .map((b, i) => ({ id: `b-${Date.now()}-${i}`, text: b.text, person: b.person })));
        const rawItems = (raw && raw.items) || [];
        if (rawItems.length) {
          items = rawItems.map((it, i) => {
            const a = dispatcherAssign(it.assigneeHint);
            return { id: `mi-${i + 1}`, text: it.text, owner: a.id, ownerInferReason: a.reason, due: dueIn(3 + i), confidence: it.confidence || 0.8 };
          });
        }
      }
    } catch (e) { console.warn('[Relay] Scribe failed (deploy relay-agent to enable):', e.message); }
    // Fallback agenda: first substantive transcript line, else a generic label.
    if (!derivedAgenda) {
      const firstLine = transcript.split('\n').map((l) => l.replace(/^[^:]{1,30}:/, '').trim()).find((l) => l.length > 12);
      derivedAgenda = firstLine ? firstLine.slice(0, 90) : 'Team sync — action items';
    }
    setAgenda(derivedAgenda);
    if (!items) {
      // Fallback: heuristic extraction (or canned) so the demo still flows offline.
      setStep('dispatcher');
      items = transcript.trim().length > 50
        ? extractFromTranscript(transcript)
        : [
            { id: 'mi-1', text: 'Schedule Q3 mentor capacity sync with Rushikesh', owner: 'NW0002526', ownerInferReason: 'Pavan G named explicitly · also raised the topic', due: '2026-05-30', confidence: 0.94 },
            { id: 'mi-2', text: 'Pull DS&Algo pass-rate analysis vs target', owner: 'NW0002023', ownerInferReason: 'Pavan Teja owns DS&Algo (manager_id match)', due: '2026-06-02', confidence: 0.88 },
            { id: 'mi-3', text: 'Estimate Pinecone paid-tier rollout impact for GenAI', owner: 'NW0001778', ownerInferReason: 'Pushpa owns GenAI (manager_id match)', due: '2026-05-29', confidence: 0.91 },
          ];
    }
    // Keep the AI's original suggestion (owner/text/due) so we can record what humans changed.
    setActionItems(items.map((it) => ({ ...it, aiOwner: it.aiOwner || it.owner, aiText: it.text, aiDue: it.due })));
    setMomTab('summary');
    setStep('review');
  }

  // Admin / Product Owner (L3) can reassign the owner before committing.
  const canReassign = canUseMomLoader(currentUser);
  function reassign(id, ownerId) { setActionItems((items) => items.map((it) => it.id === id ? { ...it, owner: ownerId } : it)); }
  function editText(id, text) { setActionItems((items) => items.map((it) => it.id === id ? { ...it, text } : it)); }
  function editDue(id, due) { setActionItems((items) => items.map((it) => it.id === id ? { ...it, due } : it)); }
  function setRejectNote(id, note) { setRejectNotes((n) => ({ ...n, [id]: note })); }
  // Manually add an extra action item Scribe missed; owner defaults to the uploader for triage.
  function addActionItem() {
    setActionItems((items) => [...items, {
      id: `mi-manual-${Date.now()}`, text: '', owner: currentUser.id,
      ownerInferReason: 'Added manually by ' + currentUser.name, due: dueIn(3), confidence: 1,
      aiOwner: currentUser.id, aiText: '', aiDue: dueIn(3), manual: true,
    }]);
  }

  function decideItem(id, action) { setDecisions((d) => ({ ...d, [id]: action })); }
  function commitAll() {
    // Approved items → tasks (source = mom). Dispatcher already set the owner.
    const approved = actionItems.filter((it) => decisions[it.id] !== 'rejected');
    const CDC = window.CDC;
    const nm = (id) => (CDC.lookup.user(id) || {}).name || id;
    const momId = `mom-${Date.now()}`;
    approved.forEach((it, i) => {
      const owner = CDC.lookup && CDC.lookup.user(it.owner);
      // Approved action items land on the owner's dashboard as Backlog (status per MoM spec).
      CDC.db && CDC.db.addTask({
        id: `task-mom-${Date.now()}-${i}`, title: it.text, status: 'BACKLOG', reason: 'From MOM',
        sourceReports: [], owner: it.owner, dept: owner ? owner.dept : currentUser.dept,
        created: CDC.fmt ? CDC.fmt(CDC.today) : '', confidence: it.confidence, source: 'mom', due: it.due,
        aiSuggestedOwner: it.aiOwner, ownerInferReason: it.ownerInferReason,
        uploadedBy: currentUser.id, momId,
      });
      // Dispatcher self-evolution signal: record every human change (owner / text / due) vs the AI draft.
      const ownerChanged = it.owner !== it.aiOwner;
      const textChanged = it.text !== it.aiText;
      const dueChanged = it.due !== it.aiDue;
      const changes = [];
      if (ownerChanged) changes.push(`owner ${nm(it.aiOwner)} → ${nm(it.owner)}`);
      if (textChanged) changes.push('text edited');
      if (dueChanged) changes.push(`due ${it.aiDue} → ${it.due}`);
      const anyChange = changes.length > 0;
      CDC.db && CDC.db.logInteraction({
        agent: 'Dispatcher', flow: 'mom_dispatch', inputRef: `MOM action: ${it.aiText.slice(0, 60)}`,
        action: anyChange ? 'edit' : 'accept',
        draft: `${it.aiText} · owner ${nm(it.aiOwner)} · due ${it.aiDue}`,
        final: `${it.text} · owner ${nm(it.owner)} · due ${it.due}`,
        reason: anyChange ? `${changes.join('; ')} by ${currentUser.name}` : 'Accepted as suggested',
        userId: currentUser.id,
      });
    });
    // Track the whole MOM: what AI suggested vs what was concluded/approved, incl. rejection notes.
    const mom = {
      id: momId, title: (agenda || (actionItems[0] ? actionItems[0].text : 'MOM')).slice(0, 60),
      agenda,
      summaryBullets: bullets.filter((b) => b.text && b.text.trim()).map((b) => ({ text: b.text, person: b.person || '' })),
      summary: bullets.map((b) => b.text).filter((t) => t && t.trim()).join(' · ').slice(0, 240),
      date: CDC.fmt ? CDC.fmt(CDC.today) : '', by: currentUser.id, source: 'MOM Loader',
      suggested: actionItems.map((it) => ({ text: it.aiText, owner: it.aiOwner, ownerName: nm(it.aiOwner), reason: it.ownerInferReason, confidence: it.confidence })),
      concluded: approved.map((it) => ({ text: it.text, owner: it.owner, ownerName: nm(it.owner),
        changed: it.owner !== it.aiOwner || it.text !== it.aiText || it.due !== it.aiDue })),
      rejected: actionItems.filter((it) => decisions[it.id] === 'rejected').map((it) => ({ text: it.text, note: rejectNotes[it.id] || '' })),
      actionItems: approved.map((it) => ({ text: it.text, owner: it.owner })),
    };
    CDC.db && CDC.db.addMom(mom);
    setStep('done');
    setTimeout(() => { onClose(); resetState(); nav.go('second-brain'); }, 1200);
  }
  function resetState() {
    setStep('paste'); setTranscript(''); setAgenda(''); setActionItems([]); setDecisions({}); setRejectNotes({});
    setBullets([]); setMomTab('summary');
  }

  if (!open) return null;

  return (
    <Modal open={true} onClose={() => { onClose(); resetState(); }} title="MOM Loader" width={920}>
      <div className="mom-loader-body">
        <div className="mom-paste">
          {step === 'paste' && (
            <>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Paste a meeting transcript. <strong>Scribe</strong> extracts action items; <strong>Dispatcher</strong> proposes owners + due dates using the people knowledge base. You review and approve.
              </div>
              <textarea
                placeholder="Paste transcript here…&#10;&#10;Example:&#10;Pavan G: We need to align on the Q3 mentor capacity. Rushikesh, can you take a look at the current ratio?&#10;Rushikesh: Yes — I'll draft an updated capacity model targeting 1:35.&#10;Pushpa: For GenAI we're going over the Pinecone free tier in 3 weeks — need approval to move to paid…"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="muted" style={{ fontSize: 11.5 }}>{transcript.length} chars · {transcript.split(/\s+/).filter(Boolean).length} words</div>
                <div className="row" style={{ gap: 6 }}>
                  <label className="btn" data-size="sm" data-variant="ghost" style={{ cursor: 'pointer' }}>
                    <Icon name="sheet" size={11} /> Upload .vtt / .txt
                    <input type="file" accept=".vtt,.txt,text/plain,text/vtt" style={{ display: 'none' }}
                      onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
                  </label>
                  <button className="btn" data-size="sm" data-variant="primary" onClick={runPipeline}><Icon name="sparkles" size={11} /> Run pipeline</button>
                </div>
              </div>
            </>
          )}
          {(step === 'scribe' || step === 'dispatcher') && (
            <div className="col" style={{ gap: 12, padding: 20 }}>
              <div className="mom-step" data-state={step === 'scribe' ? 'running' : 'done'}>
                <span className="mom-step-num">{step === 'scribe' ? '1' : <Icon name="check" size={12} stroke={2.4}/>}</span>
                <div style={{ flex: 1 }}>
                  <strong>Scribe</strong> — extracting action items
                  <div className="muted" style={{ fontSize: 11.5 }}>claude-sonnet-4-6 · trace tr-9888</div>
                </div>
                {step !== 'scribe' && <Pill tone="green" dot>done</Pill>}
              </div>
              <div className="mom-step" data-state={step === 'dispatcher' ? 'running' : 'pending'}>
                <span className="mom-step-num">{step === 'dispatcher' ? '2' : '2'}</span>
                <div style={{ flex: 1 }}>
                  <strong>Dispatcher</strong> — matching items to people
                  <div className="muted" style={{ fontSize: 11.5 }}>using manager_id graph · scope: Content dept</div>
                </div>
                {step === 'dispatcher' && <div className="loading-bar"></div>}
              </div>
              <div className="mom-step" data-state="pending">
                <span className="mom-step-num">3</span>
                <div style={{ flex: 1 }}>
                  <strong>Cartographer</strong> — link to graph (deferred until you approve)
                </div>
              </div>
            </div>
          )}
          {step === 'review' && (
            <div className="col" style={{ gap: 12, padding: 4 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04, fontSize: 10.5, color: 'var(--text-faint)' }}>Agenda</span>
                <span style={{ marginLeft: 6 }}>{agenda}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {[
                  { id: 'summary', label: 'Summary' },
                  { id: 'actions', label: 'Action Items', count: actionItems.length },
                  { id: 'pipeline', label: 'Pipeline' },
                ].map((tabInfo) => (
                  <button key={tabInfo.id} className="btn" data-size="sm"
                    data-variant={momTab === tabInfo.id ? 'primary' : 'ghost'}
                    onClick={() => setMomTab(tabInfo.id)}>
                    {tabInfo.label}
                    {tabInfo.count != null && <span className="mono muted" style={{ marginLeft: 6 }}>{tabInfo.count}</span>}
                  </button>
                ))}
              </div>

              {momTab === 'summary' && (
                <div className="col" style={{ gap: 8, maxHeight: 420, overflowY: 'auto', padding: 4 }}>
                  {bullets.length === 0 && (
                    <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      No summary bullets extracted yet. Add one below to start drafting the notes manually.
                    </div>
                  )}
                  <datalist id="mom-bullet-people">
                    {(CDC.USERS || []).map((u) => <option key={`p-${u.id}`} value={u.name} />)}
                    {Array.from(new Set((CDC.USERS || []).map((u) => u.sub).filter(Boolean))).map((s) => <option key={`s-${s}`} value={s} />)}
                    {(CDC.DEPARTMENTS || []).map((d) => <option key={`d-${d.id}`} value={d.name} />)}
                  </datalist>
                  {bullets.map((b, i) => (
                    <div key={b.id} className="col" style={{ gap: 4, padding: '6px 4px 8px', borderBottom: '1px solid var(--border-faint)' }}>
                      <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                        <span style={{ marginTop: 8, fontSize: 14, color: 'var(--text-faint)', userSelect: 'none' }}>•</span>
                        <textarea
                          className="input-text"
                          value={b.text}
                          placeholder="What was discussed / landed / flagged"
                          onChange={(e) => editBulletText(b.id, e.target.value)}
                          rows={1}
                          style={{ flex: 1, fontSize: 13, lineHeight: 1.5, resize: 'vertical', minHeight: 32, padding: '6px 8px' }}
                        />
                        <div className="row" style={{ gap: 2 }}>
                          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => moveBullet(b.id, 'up')} disabled={i === 0} title="Move up" style={{ padding: '2px 6px', fontSize: 12 }}>↑</button>
                          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => moveBullet(b.id, 'down')} disabled={i === bullets.length - 1} title="Move down" style={{ padding: '2px 6px', fontSize: 12 }}>↓</button>
                          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => removeBullet(b.id)} title="Remove bullet">
                            <Icon name="x" size={10} />
                          </button>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6, alignItems: 'center', paddingLeft: 18, fontSize: 11.5, color: 'var(--text-muted)' }}>
                        <Icon name="user" size={10} />
                        <span>Person:</span>
                        <input
                          list="mom-bullet-people"
                          value={b.person || ''}
                          placeholder="name or team (optional)"
                          onChange={(e) => editBulletPerson(b.id, e.target.value)}
                          style={{ flex: 1, maxWidth: 220, fontSize: 11.5, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                  ))}
                  <button className="btn" data-size="sm" data-variant="ghost" onClick={addBullet} style={{ alignSelf: 'flex-start' }}>
                    + Add bullet
                  </button>
                </div>
              )}

              {momTab === 'actions' && (
                <div className="col" style={{ gap: 10, maxHeight: 420, overflowY: 'auto', padding: 4 }}>
                  {actionItems.length === 0 && (
                    <div className="muted" style={{ fontSize: 12 }}>No action items extracted. Add one manually below.</div>
                  )}
                  {actionItems.map((it) => (
                    <ActionItem key={it.id} item={it} state={decisions[it.id]} onDecide={decideItem} canReassign={canReassign} onReassign={reassign} people={CDC.USERS} onEditText={editText} onEditDue={editDue} rejectNote={rejectNotes[it.id] || ''} onRejectNote={setRejectNote} />
                  ))}
                  <button className="btn" data-size="sm" data-variant="ghost" onClick={addActionItem} style={{ alignSelf: 'flex-start' }}>
                    <Icon name="sparkles" size={11} /> Add action item
                  </button>
                </div>
              )}

              {momTab === 'pipeline' && (
                <div className="col" style={{ gap: 8, maxHeight: 420, overflowY: 'auto', padding: 4 }}>
                  {[
                    { id: 'paste', title: '1 · Paste transcript', sub: 'or upload .vtt / .txt' },
                    { id: 'scribe', title: '2 · Scribe extracts', sub: 'claude-sonnet-4-6' },
                    { id: 'dispatcher', title: '3 · Dispatcher routes', sub: 'manager_id graph + role' },
                    { id: 'review', title: '4 · Human review', sub: 'edit, approve, reject' },
                    { id: 'done', title: '5 · Commit', sub: 'Tasks + Second Brain node' },
                  ].map((s, i) => {
                    const order = ['paste', 'scribe', 'dispatcher', 'review', 'done'];
                    const current = order.indexOf(step);
                    const sIdx = order.indexOf(s.id);
                    const state = sIdx < current ? 'done' : sIdx === current ? 'running' : 'pending';
                    return (
                      <div key={s.id} className="mom-step" data-state={state}>
                        <span className="mom-step-num">{state === 'done' ? <Icon name="check" size={11} stroke={2.4} /> : sIdx + 1}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{s.title}</div>
                          <div className="muted" style={{ fontSize: 10.5 }}>{s.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {step === 'done' && (
            <div className="celebrate" style={{ padding: 36 }}>
              <div className="check"><Icon name="check" size={26} stroke={2.5} /></div>
              <h2>MOM committed</h2>
              <p>Stored in Second Brain · {Object.values(decisions).filter((d) => d === 'approved').length} tasks created · graph updated.</p>
            </div>
          )}
        </div>

        <aside style={{ background: 'var(--panel)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {step !== 'review' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.06, color: 'var(--text-faint)' }}>Pipeline</div>
              {[
                { id: 'paste', title: '1 · Paste transcript', sub: 'or upload .vtt / .txt' },
                { id: 'scribe', title: '2 · Scribe extracts', sub: 'claude-sonnet-4-6' },
                { id: 'dispatcher', title: '3 · Dispatcher routes', sub: 'manager_id graph + role' },
                { id: 'review', title: '4 · Human review', sub: 'edit, approve, reject' },
                { id: 'done', title: '5 · Commit', sub: 'Tasks + Second Brain node' },
              ].map((s, i) => {
                const current = ['paste', 'scribe', 'dispatcher', 'review', 'done'].indexOf(step);
                const sIdx = ['paste', 'scribe', 'dispatcher', 'review', 'done'].indexOf(s.id);
                const state = sIdx < current ? 'done' : sIdx === current ? 'running' : 'pending';
                return (
                  <div key={s.id} className="mom-step" data-state={state}>
                    <span className="mom-step-num">{state === 'done' ? <Icon name="check" size={11} stroke={2.4} /> : sIdx + 1}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{s.title}</div>
                      <div className="muted" style={{ fontSize: 10.5 }}>{s.sub}</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {step === 'review' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.06, color: 'var(--text-faint)' }}>Commit</div>
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                Approved action items become tasks for the assigned owner and a Second Brain node is created.
              </div>
              <div className="divider" />
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                <span>Approved</span><span className="mono">{Object.values(decisions).filter((d) => d === 'approved').length}/{actionItems.length}</span>
              </div>
              <button className="btn" data-variant="primary" data-size="sm" onClick={commitAll}><Icon name="check" size={11} /> Commit MOM</button>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}
window.MomLoader = MomLoader;

function ActionItem({ item, state, onDecide, canReassign, onReassign, people, onEditText, onEditDue, rejectNote, onRejectNote }) {
  const owner = window.CDC.lookup.user(item.owner);
  const ownerChanged = item.aiOwner && item.owner !== item.aiOwner;
  const textChanged = item.aiText && item.text !== item.aiText;
  const dueChanged = item.aiDue && item.due !== item.aiDue;
  const [editing, setEditing] = useStP(!item.text);
  return (
    <div className="mom-action-item" data-state={state || 'pending'}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <span className="engram-action" data-action="edit" style={{ display: 'inline-flex', background: state === 'approved' ? 'var(--green-soft)' : state === 'rejected' ? 'var(--red-soft)' : 'var(--accent-soft)', color: state === 'approved' ? 'var(--green)' : state === 'rejected' ? 'var(--red)' : 'var(--accent)' }}>
          {state || 'pending'}
        </span>
        <div style={{ flex: 1, fontSize: 13 }}>
          {editing ? (
            <input className="input-text" value={item.text} placeholder="Describe the action item…" onChange={(e) => onEditText(item.id, e.target.value)} onBlur={() => setEditing(false)} autoFocus />
          ) : (
            <span onClick={() => !state && setEditing(true)} title="Click to edit">{item.text}{textChanged && <span className="pill" data-tone="amber" style={{ fontSize: 9, marginLeft: 6 }}>edited</span>}</span>
          )}
        </div>
        <ConfChip value={item.confidence} show={true} />
      </div>
      <div className="row" style={{ gap: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
        <div className="row" style={{ gap: 4 }}>
          <Avatar user={owner} size={16} />
          {canReassign && !state ? (
            <select value={item.owner} onChange={(e) => onReassign(item.id, e.target.value)}
              style={{ fontSize: 11.5, padding: '2px 4px', borderRadius: 5, border: '1px solid var(--border)', maxWidth: 180 }}
              title="Reassign (Admin / Product Owner)">
              {(people || []).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.level} · {u.sub || u.dept} · {u.id}</option>)}
            </select>
          ) : (
            <span style={{ fontWeight: 500 }}>{owner?.name}</span>
          )}
          {ownerChanged && <span className="pill" data-tone="amber" style={{ fontSize: 9 }}>reassigned · AI: {(window.CDC.lookup.user(item.aiOwner) || {}).name}</span>}
        </div>
        <span className="muted">·</span>
        <span className="row muted" style={{ gap: 4, alignItems: 'center' }}>due
          {!state ? (
            <input type="date" value={item.due} onChange={(e) => onEditDue(item.id, e.target.value)}
              style={{ fontSize: 11.5, padding: '1px 4px', borderRadius: 5, border: '1px solid var(--border)' }} title="Edit due date" />
          ) : (
            <span className="mono">{item.due}</span>
          )}
          {dueChanged && <span className="pill" data-tone="amber" style={{ fontSize: 9 }}>AI: {item.aiDue}</span>}
        </span>
        <span style={{ flex: 1 }} />
        {!state && (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn" data-size="sm" data-variant="danger" onClick={() => onDecide(item.id, 'rejected')}><Icon name="x" size={10} /></button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => onDecide(item.id, 'approved')}><Icon name="check" size={10} /></button>
          </div>
        )}
        {state && (
          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => onDecide(item.id, undefined)}>Undo</button>
        )}
      </div>
      {state === 'rejected' && (
        <input className="input-text" value={rejectNote} onChange={(e) => onRejectNote(item.id, e.target.value)}
          placeholder="Rejection note (why was this dropped?)…" style={{ fontSize: 12, marginTop: 2 }} />
      )}
      <div className="muted" style={{ fontSize: 11, fontStyle: 'italic' }}>
        <Icon name="sparkles" size={10} /> Dispatcher: {item.ownerInferReason}
      </div>
    </div>
  );
}

const SAMPLE_TRANSCRIPT = `Pavan G: Thanks everyone for joining. Let's start with Q3 hiring.
Rushikesh: Capacity ratio is sitting at 1:48 vs the planned 1:35 in DS&ML. Cohort 4 is impacted.
Pavan G: Can you draft an updated capacity model? Let's target 1:35 recovery.
Rushikesh: Yes, I'll have it by next Friday.
Pavan G: Pushpa, where are we on Pinecone?
Pushpa: We'll exceed the free tier in 3 weeks. Need approval for the paid plan, about $340/mo.
Pavan G: Get me the rollout impact analysis. Pavan Teja — DS&Algo pass rate is at 70%, target 78%. What's the plan?
Pavan Teja: I'll pull a curriculum-level analysis vs the target.
Aryaa: Quick admin note — Slack is being retired in 2 weeks, we should coordinate the Teams cutover.`;

function extractFromTranscript(t) {
  // Lightweight heuristic for the demo — match action verbs to lines.
  const lines = t.split('\n').filter((l) => l.trim());
  const actionVerbs = ['draft', 'pull', 'estimate', 'coordinate', 'schedule', 'review', 'investigate'];
  const items = [];
  const idMap = { 'rushikesh': 'NW0005433', 'pushpa': 'NW0001778', 'pavan teja': 'NW0002023', 'chanakya': 'NW0001771', 'aryaa': 'NW0005116', 'pavan g': 'NW0002526', 'vijay': 'NW0001771' };
  let i = 0;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (actionVerbs.some((v) => lower.includes(v))) {
      let owner = 'NW0002526';
      let reason = 'fallback';
      for (const k of Object.keys(idMap)) {
        if (line.toLowerCase().startsWith(k + ':') || line.toLowerCase().includes(', ' + k)) {
          owner = idMap[k]; reason = `Named explicitly: "${k}"`; break;
        }
      }
      items.push({
        id: `mi-${i++}`,
        text: line.split(':').slice(1).join(':').trim() || line,
        owner, ownerInferReason: reason,
        due: '2026-06-' + String(2 + (i * 2)).padStart(2, '0'),
        confidence: 0.78 + Math.random() * 0.15,
      });
      if (items.length >= 6) break;
    }
  }
  if (items.length === 0) return [{ id: 'mi-0', text: 'Review meeting notes', owner: 'NW0002526', ownerInferReason: 'No clear action verbs found — defaulted to organizer', due: '2026-06-02', confidence: 0.5 }];
  return items;
}

// ── Tool Expense Tracker ───────────────────────────────────────────────
function ExpenseView({ tweaks, currentUser, nav }) {
  const exp = window.CDC.EXPENSE;
  const totalMtd = exp.byTool.reduce((s, t) => s + t.mtdUsd, 0);
  const lastMonth = exp.byTool.reduce((s, t) => s + t.lastMonth, 0);
  const pct = (totalMtd / exp.monthlyBudgetUsd) * 100;
  const anomalies = exp.byPerson.filter((p) => p.anomaly);
  const topPerson = [...exp.byPerson].sort((a, b) => b.mtdUsd - a.mtdUsd)[0];

  // Group people by department for the breakdown
  const byDept = useMP(() => {
    const map = new Map();
    for (const p of exp.byPerson) {
      const u = window.CDC.lookup.user(p.userId);
      const d = u?.dept || 'unknown';
      const cur = map.get(d) || { mtdUsd: 0, tokens: 0, count: 0 };
      cur.mtdUsd += p.mtdUsd; cur.tokens += p.tokens; cur.count += 1;
      map.set(d, cur);
    }
    return [...map.entries()].map(([did, v]) => ({
      did, name: window.CDC.lookup.dept(did)?.short || 'Cross-team', ...v,
    })).sort((a, b) => b.mtdUsd - a.mtdUsd);
  }, [exp]);

  return (
    <div className="fadein">
      <SectionHeader
        title="Tool Expense Tracker"
        subtitle="External AI tool spend (separate from Relay's own model cost). Bursar refreshes daily 04:00 IST."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="filter" size={12} /> May 2026</button>
            <button className="btn" data-size="sm"><Icon name="refresh" size={12} /> Re-pull invoices</button>
          </>
        }
      />

      {/* Top tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="kpi-tile" data-tone={pct > 80 ? 'red' : pct > 60 ? 'amber' : 'green'}>
          <div className="kpi-name">MTD spend</div>
          <div className="kpi-value">${totalMtd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="kpi-meta"><span>{pct.toFixed(0)}% of ${exp.monthlyBudgetUsd.toLocaleString()} budget</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Wow change</div>
          <div className="kpi-value">+{Math.round(((totalMtd - lastMonth) / lastMonth) * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>%</span></div>
          <div className="kpi-meta"><span>vs ${lastMonth.toLocaleString()} last month</span></div>
        </div>
        <div className="kpi-tile" data-tone={anomalies.length > 0 ? 'amber' : undefined}>
          <div className="kpi-name">Anomaly flags</div>
          <div className="kpi-value">{anomalies.length}</div>
          <div className="kpi-meta"><span>{anomalies.length > 0 ? 'Bursar flagged ' + anomalies.length : 'all clear'}</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Top spender</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{window.CDC.lookup.user(topPerson?.userId)?.name?.split(' ')[0] || '—'}</div>
          <div className="kpi-meta"><span className="mono">${topPerson?.mtdUsd?.toLocaleString()} · {(topPerson?.tokens / 1e6).toFixed(1)}M tokens</span></div>
        </div>
      </div>

      {/* Budget bar */}
      <Card title="Budget vs actual · May 2026" meta={`${pct.toFixed(0)}% used`}>
        <div style={{ height: 14, background: 'var(--panel-2)', borderRadius: 7, overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct > 80 ? 'var(--red)' : pct > 60 ? 'var(--amber)' : 'var(--green)', borderRadius: 7, transition: 'width 0.5s' }} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
          <span className="mono"><strong>${totalMtd.toLocaleString()}</strong> spent</span>
          <span className="muted">${(exp.monthlyBudgetUsd - totalMtd).toLocaleString()} remaining of ${exp.monthlyBudgetUsd.toLocaleString()} cap</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 8 }}>6-month trend</div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 80 }}>
            {exp.monthlyTrend.map((m, i) => {
              const max = Math.max(...exp.monthlyTrend.map((x) => x.usd));
              const h = (m.usd / max) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>${(m.usd / 1000).toFixed(1)}k</span>
                  <div style={{ width: '100%', height: `${h}%`, background: i === exp.monthlyTrend.length - 1 ? 'var(--accent)' : 'var(--accent-soft)', borderRadius: 4, minHeight: 8 }} />
                  <span className="muted" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Three columns: by tool / by person / by department */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        <Card title="By tool" pad={false}>
          {exp.byTool.map((t) => {
            const max = exp.byTool[0].mtdUsd;
            return (
              <div key={t.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{t.tool}</span>
                  <span className="mono">${t.mtdUsd.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(t.mtdUsd / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                  {((t.mtdUsd - t.lastMonth) / t.lastMonth * 100).toFixed(0)}% wow · {(t.share * 100).toFixed(0)}% share
                </div>
              </div>
            );
          })}
        </Card>

        <Card title="By person" pad={false}>
          {exp.byPerson.slice(0, 10).map((p) => {
            const u = window.CDC.lookup.user(p.userId);
            const max = exp.byPerson[0].mtdUsd;
            return (
              <div key={p.userId} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <Avatar user={u} size={20} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{u?.name}</div>
                      <div className="muted" style={{ fontSize: 10 }}>{(p.tokens / 1e6).toFixed(1)}M tokens</div>
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>${p.mtdUsd.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(p.mtdUsd / max) * 100}%`, height: '100%', background: p.anomaly ? 'var(--amber)' : 'var(--accent)' }} />
                </div>
                {p.anomaly && (
                  <div style={{ fontSize: 10.5, color: 'var(--amber)', marginTop: 3 }}>
                    ⚠ {p.anomalyNote}
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Card title="By department" pad={false}>
          {byDept.map((d) => {
            const max = byDept[0].mtdUsd;
            return (
              <div key={d.did} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <div style={{ fontWeight: 500 }}>{d.name}</div>
                  <span className="mono">${d.mtdUsd.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(d.mtdUsd / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                  {d.count} contributors · {(d.tokens / 1e6).toFixed(1)}M tokens
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {anomalies.length > 0 && (
        <Card title="Bursar anomaly flags" actions={<Pill tone="accent" dot>Bursar</Pill>} className="card" style={{ marginTop: 12 }}>
          <div className="col" style={{ gap: 8 }}>
            {anomalies.map((a) => {
              const u = window.CDC.lookup.user(a.userId);
              return (
                <div key={a.userId} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="item-kind" data-kind="risk">!</div>
                  <div style={{ flex: 1, fontSize: 12.5 }}>
                    <strong>{u?.name}</strong> · <span className="mono">${a.mtdUsd.toLocaleString()}</span> · {a.anomalyNote}
                  </div>
                  <button className="btn" data-size="sm" data-variant="ghost">Investigate →</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
window.ExpenseView = ExpenseView;
