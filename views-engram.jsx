// CD-Copilot — Engram view (interaction memory + eval sets + Curator proposals).
// The self-improving loop made tangible:
//  - Stream of human corrections to agent drafts
//  - Eval sets auto-built from those corrections
//  - Curator-proposed guideline edits for Admin review

const { useState: useStE, useMemo: useME, useEffect: useEE } = React;

function EngramView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const interactions = CDC.filterEngram(currentUser.id);
  const evalSets = CDC.EVAL_SETS;
  const proposals = CDC.PROPOSALS;

  const [tab, setTab] = useStE('interactions');  // interactions | evals | proposals
  const [agentFilter, setAgentFilter] = useStE('All');
  const [actionFilter, setActionFilter] = useStE('all');
  const [selected, setSelected] = useStE(null);
  const [proposalDecisions, setProposalDecisions] = useStE({});

  const agents = useME(() => ['All', ...new Set(interactions.map((e) => e.agent))], [interactions]);

  const filteredInteractions = useME(() => {
    return interactions.filter((e) => {
      if (agentFilter !== 'All' && e.agent !== agentFilter) return false;
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      return true;
    });
  }, [interactions, agentFilter, actionFilter]);

  // Aggregates
  const totalReviews = interactions.length;
  const editRate = totalReviews > 0 ? interactions.filter((e) => e.action === 'edit').length / totalReviews : 0;
  const rejectRate = totalReviews > 0 ? interactions.filter((e) => e.action === 'reject').length / totalReviews : 0;
  const pendingProposals = proposals.filter((p) => p.state === 'pending' && !proposalDecisions[p.id]).length;

  function decide(pid, action) {
    setProposalDecisions((d) => ({ ...d, [pid]: action }));
    CDC.db.updateProposal(pid, action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action);
  }

  return (
    <div className="fadein">
      <SectionHeader
        title="Engram"
        subtitle="Interaction memory. Every human correction to an agent draft becomes eval data + signal for the Curator to propose better rules."
        actions={
          <>
            <button className="btn" data-size="sm" data-variant="ghost"><Icon name="sheet" size={12} /> Export eval set</button>
            <button className="btn" data-size="sm" data-variant="primary"><Icon name="sparkles" size={12} /> Run Curator now</button>
          </>
        }
      />

      {/* Top tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Interactions captured</div>
          <div className="kpi-value">{totalReviews}</div>
          <div className="kpi-meta"><span>last 7 days · across {agents.length - 1} agents</span></div>
        </div>
        <div className="kpi-tile" data-tone={editRate > 0.5 ? 'amber' : undefined}>
          <div className="kpi-name">Edit rate</div>
          <div className="kpi-value">{Math.round(editRate * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>%</span></div>
          <div className="kpi-meta"><span>humans modify {Math.round(editRate * 100)}% of drafts</span></div>
        </div>
        <div className="kpi-tile" data-tone={rejectRate > 0.15 ? 'red' : undefined}>
          <div className="kpi-name">Reject rate</div>
          <div className="kpi-value">{Math.round(rejectRate * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>%</span></div>
          <div className="kpi-meta"><span>{interactions.filter((e) => e.action === 'reject').length} rejected</span></div>
        </div>
        <div className="kpi-tile" data-tone={pendingProposals > 0 ? 'amber' : undefined}>
          <div className="kpi-name">Curator proposals</div>
          <div className="kpi-value">{pendingProposals}</div>
          <div className="kpi-meta"><span>awaiting Admin review</span></div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {[
          { id: 'interactions', label: 'Interaction stream', count: interactions.length },
          { id: 'evals', label: 'Eval sets', count: evalSets.length },
          { id: 'proposals', label: 'Curator proposals', count: proposals.length, badge: pendingProposals },
        ].map((t) => (
          <button key={t.id}
            className="btn" data-size="sm"
            data-variant={tab === t.id ? 'primary' : 'ghost'}
            onClick={() => setTab(t.id)}>
            {t.label}
            <span className="mono muted" style={{ marginLeft: 6 }}>{t.count}</span>
            {t.badge > 0 && tab !== t.id && <span className="badge" data-tone="amber" style={{ marginLeft: 4, minWidth: 16, height: 14, fontSize: 10 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'interactions' && (
        <InteractionStream
          interactions={filteredInteractions}
          agents={agents}
          agentFilter={agentFilter} setAgentFilter={setAgentFilter}
          actionFilter={actionFilter} setActionFilter={setActionFilter}
          onSelect={setSelected}
          selectedId={selected?.id}
        />
      )}

      {tab === 'evals' && <EvalSets evalSets={evalSets} />}

      {tab === 'proposals' && (
        <Proposals proposals={proposals} decisions={proposalDecisions} onDecide={decide} interactions={interactions} />
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.id} · ${selected.agent}` : ''} width={760}>
        {selected && <InteractionDetail e={selected} />}
      </Modal>
    </div>
  );
}
window.EngramView = EngramView;

// ── Interaction stream ─────────────────────────────────────────────────
function InteractionStream({ interactions, agents, agentFilter, setAgentFilter, actionFilter, setActionFilter, onSelect, selectedId }) {
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600 }}>Agent</span>
        <div className="seg">
          {agents.map((a) => (
            <button key={a} data-active={agentFilter === a} onClick={() => setAgentFilter(a)}>{a}</button>
          ))}
        </div>
        <span style={{ width: 12 }} />
        <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600 }}>Action</span>
        <div className="seg">
          {['all', 'accept', 'edit', 'reject'].map((a) => (
            <button key={a} data-active={actionFilter === a} onClick={() => setActionFilter(a)}>{a}</button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Action</th>
              <th style={{ width: 120 }}>Agent · flow</th>
              <th>Input</th>
              <th>Diff preview</th>
              <th style={{ width: 140 }}>Reviewer · when</th>
            </tr>
          </thead>
          <tbody>
            {interactions.map((e) => {
              const u = window.CDC.lookup.user(e.userId);
              return (
                <tr key={e.id} data-active={selectedId === e.id} onClick={() => onSelect(e)}>
                  <td><span className="engram-action" data-action={e.action}>{e.action}</span></td>
                  <td>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.agent}</div>
                    <div className="muted mono" style={{ fontSize: 10.5 }}>{e.flow}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>{e.inputRef}</div>
                    <div className="muted mono" style={{ fontSize: 10.5 }}>{e.traceId}</div>
                  </td>
                  <td>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: e.action === 'accept' ? 'var(--text-muted)' : e.action === 'edit' ? 'var(--amber)' : 'var(--red)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>
                      {e.diff}
                    </div>
                    {e.reason && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{e.reason}</div>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Avatar user={u} size={20} />
                      <div>
                        <div style={{ fontSize: 11.5 }}>{u?.name || e.userId}</div>
                        <div className="muted mono" style={{ fontSize: 10.5 }}>{e.ts.slice(11)}</div>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {interactions.length === 0 && (
              <tr><td colSpan={5}><div className="empty">No interactions match the filters.</div></td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function InteractionDetail({ e }) {
  const u = window.CDC.lookup.user(e.userId);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="engram-action" data-action={e.action}>{e.action}</span>
          <span className="mono code">{e.agent}</span>
          <span className="muted">·</span>
          <span className="muted mono code">{e.flow}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Avatar user={u} size={22} />
          <span style={{ fontSize: 12.5 }}>{u?.name}</span>
        </div>
      </div>

      <dl className="kv">
        <dt>Trace</dt><dd className="mono">{e.traceId}</dd>
        <dt>Captured</dt><dd className="mono">{e.ts}</dd>
        <dt>Input ref</dt><dd>{e.inputRef}</dd>
      </dl>

      <div>
        <div className="detail-section">Agent draft</div>
        <div className="diff-block">{e.draft}</div>
      </div>

      <div>
        <div className="detail-section">Human final</div>
        <div className="diff-block" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-border)' }}>{e.final}</div>
      </div>

      <div>
        <div className="detail-section">Diff</div>
        <div className="diff-block">
          {renderDiff(e.diff)}
        </div>
      </div>

      {e.reason && (
        <div>
          <div className="detail-section">Reason given</div>
          <div className="muted" style={{ fontSize: 13, fontStyle: 'italic' }}>"{e.reason}"</div>
        </div>
      )}

      <div>
        <div className="detail-section">Eval impact</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Becomes 1 of 47 examples in <span className="code">eval_set:{e.agent}@v3.2</span>. Counted as <strong>{e.action === 'accept' ? 'pass' : e.action === 'reject' ? 'fail' : 'partial (1 — similarity)'}</strong>.
        </div>
      </div>
    </div>
  );
}

function renderDiff(diff) {
  return diff.split('\n').map((line, i) => {
    let cls = '';
    if (line.startsWith('+')) cls = 'diff-add';
    else if (line.startsWith('-')) cls = 'diff-del';
    else if (line.startsWith('~')) cls = 'diff-mod';
    return <div key={i} className={cls}>{line}</div>;
  });
}

// ── Eval sets ──────────────────────────────────────────────────────────
function EvalSets({ evalSets }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {evalSets.map((s) => {
        const delta = s.passRate - s.prevPassRate;
        return (
          <Card key={s.id} title={`${s.agent}@${s.version}`} meta={`${s.size} examples`}
            actions={<span className="env-pill" data-env={s.gates.current}>{s.gates.current}</span>}>
            <div className="row" style={{ gap: 14, alignItems: 'center' }}>
              <EvalRing value={s.passRate} passing={s.gates.passing} />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{Math.round(s.passRate * 100)}%</span>
                  <span className={`mono ${delta >= 0 ? '' : ''}`} style={{ fontSize: 12, color: delta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                    {delta >= 0 ? '↑' : '↓'} {Math.abs(delta * 100).toFixed(1)} pts
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  pass rate · vs {Math.round(s.prevPassRate * 100)}% last week
                </div>
                <div style={{ marginTop: 8 }}>
                  <Sparkline data={s.trend} width={180} height={28} color={delta >= 0 ? 'var(--green)' : 'var(--red)'} />
                </div>
              </div>
            </div>
            <div className="divider" />
            <div className="row" style={{ gap: 12 }}>
              <Pill tone="green">{s.breakdown.accept} accept</Pill>
              <Pill tone="amber">{s.breakdown.edit} edit</Pill>
              <Pill tone="red">{s.breakdown.reject} reject</Pill>
            </div>
            <div style={{ marginTop: 12, padding: '8px 10px', background: s.gates.passing ? 'var(--green-soft)' : 'var(--amber-soft)', borderRadius: 6, fontSize: 12 }}>
              <strong>{s.gates.passing ? '✓ Passing gate' : '⚠ Below promotion threshold'}</strong> ·
              threshold: <span className="mono">{Math.round(s.gates.threshold * 100)}%</span> ·
              required to promote to <span className="env-pill" data-env="prod" style={{ marginLeft: 4 }}>prod</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function EvalRing({ value, passing }) {
  const r = 24; const c = 2 * Math.PI * r;
  const offset = c - value * c;
  const color = passing ? 'var(--green)' : 'var(--amber)';
  return (
    <div className="eval-ring">
      <svg width="56" height="56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="eval-pct" style={{ color }}>{Math.round(value * 100)}</div>
    </div>
  );
}

// ── Curator proposals ───────────────────────────────────────────────────
function Proposals({ proposals, decisions, onDecide, interactions }) {
  const ordered = [...proposals].sort((a, b) => {
    const sa = decisions[a.id] || a.state;
    const sb = decisions[b.id] || b.state;
    if (sa === 'pending' && sb !== 'pending') return -1;
    if (sb === 'pending' && sa !== 'pending') return 1;
    return 0;
  });
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 12, padding: '0 4px' }}>
        Curator scans the last 7 days of Engram corrections, clusters patterns, and proposes guideline edits with citations. Admin approves or rejects; approved edits are versioned in the Codex.
      </div>
      {ordered.map((p) => {
        const state = decisions[p.id] || p.state;
        return (
          <div key={p.id} className="proposal-card" data-state={state}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <Pill tone="accent" dot>{p.agent}</Pill>
                  <Pill tone={state === 'approved' ? 'green' : state === 'rejected' ? 'red' : 'amber'}>{state}</Pill>
                  <span className="muted mono" style={{ fontSize: 10.5 }}>by {p.proposedBy} · {p.ts}</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{p.title}</h3>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              {p.rationale}
            </div>
            <div className="rule-pair">
              <div className="rule" data-kind="current">
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 4, textDecoration: 'none' }}>Current rule</div>
                {p.currentRule}
              </div>
              <div className="rule" data-kind="proposed">
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>Proposed rule</div>
                {renderInlineBold(p.proposedRule)}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 11.5 }}>Evidence:</span>
              {p.evidence.map((eid, i) => {
                const e = interactions.find((x) => x.id === eid);
                return (
                  <span key={i} className="cite" title={e?.reason || e?.inputRef}>{eid}</span>
                );
              })}
            </div>
            {state === 'pending' && (
              <div className="row" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <button className="btn" data-size="sm" data-variant="danger" onClick={() => onDecide(p.id, 'rejected')}>
                  <Icon name="x" size={11} /> Reject
                </button>
                <span style={{ flex: 1 }} />
                <button className="btn" data-size="sm" data-variant="ghost"><Icon name="eye" size={11} /> Preview impact</button>
                <button className="btn" data-size="sm" data-variant="primary" onClick={() => onDecide(p.id, 'approved')}>
                  <Icon name="check" size={11} /> Approve · stage to beta
                </button>
              </div>
            )}
            {state !== 'pending' && (
              <div className="row" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <Pill tone={state === 'approved' ? 'green' : 'red'} dot>{state}</Pill>
                {p.decidedBy && (
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    by {window.CDC.lookup.user(p.decidedBy)?.name || p.decidedBy} · {p.decidedAt}
                  </span>
                )}
                {state === 'approved' && <span className="muted" style={{ fontSize: 11.5 }}> · running in <span className="env-pill" data-env="beta">beta</span> eval gate</span>}
                <span style={{ flex: 1 }} />
                {decisions[p.id] && <button className="btn" data-size="sm" data-variant="ghost" onClick={() => onDecide(p.id, undefined)}>Undo</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>);
}
