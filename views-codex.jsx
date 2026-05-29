// Relay — Codex: the system reference.
// Read by all, edit by Admin/L3 only. Three tabs:
//   - Architecture (reuses the diagram from ArchitectureView)
//   - Workflows (one card per core flow, validate-then-activate on edit)
//   - Guidelines (versioned, with edit history)

const { useState: useStCx } = React;

function CodexView({ tweaks, currentUser, nav, initialTab }) {
  const [tab, setTab] = useStCx(initialTab || 'architecture');
  const role = currentUser.role;
  const canEdit = role === 'ADMIN' || role === 'L3' || role === 'PRODUCT_OWNER';

  return (
    <div className="fadein">
      <SectionHeader
        title="Codex"
        subtitle="The in-app source of truth. Architecture · workflows · guidelines. Read-by-all, edit-by-Admin-or-L3."
        actions={
          <>
            <Pill tone={canEdit ? 'green' : 'outline'} dot={canEdit}>{canEdit ? 'edit access' : 'read-only'}</Pill>
            <button className="btn" data-size="sm"><Icon name="sheet" size={12} /> Export</button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('copilot', { prefill: 'Explain the weekly rollup workflow.' })}><Icon name="sparkles" size={12} /> Ask Codex</button>
          </>
        }
      />

      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        {[
          { id: 'architecture', label: 'Architecture' },
          { id: 'workflows', label: 'Workflows', count: window.CDC.CODEX_WORKFLOWS.length },
          { id: 'guidelines', label: 'Guidelines', count: window.CDC.CODEX_GUIDELINES.length },
        ].map((tabInfo) => (
          <button key={tabInfo.id} className="btn" data-size="sm"
            data-variant={tab === tabInfo.id ? 'primary' : 'ghost'}
            onClick={() => setTab(tabInfo.id)}>
            {tabInfo.label}
            {tabInfo.count != null && <span className="mono muted" style={{ marginLeft: 6 }}>{tabInfo.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'architecture' && <ArchitectureView tweaks={tweaks} currentUser={currentUser} nav={nav} embedded />}
      {tab === 'workflows' && <WorkflowsTab canEdit={canEdit} />}
      {tab === 'guidelines' && <GuidelinesTab canEdit={canEdit} nav={nav} />}
    </div>
  );
}
window.CodexView = CodexView;

// ── Workflows tab ─────────────────────────────────────────────────────
function WorkflowsTab({ canEdit }) {
  // Pin MoM, Task and Escalation flows to the top; keep the rest in place.
  const PINNED = ['wf-mom', 'wf-task', 'wf-escalation'];
  const flows = [...(window.CDC.CODEX_WORKFLOWS || [])].sort((a, b) => {
    const ai = PINNED.indexOf(a.id), bi = PINNED.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const [selected, setSelected] = useStCx(null);
  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, padding: '0 4px' }}>
        Each flow renders from the same <span className="code">workflow_defs</span> record the engine runs. Edit goes through validate-then-activate.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {flows.map((f) => (
          <div key={f.id} className="card card-pad" onClick={() => setSelected(f)} style={{ cursor: 'default' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>{f.name}</strong>
              <Pill tone="outline">{f.version}</Pill>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              <strong>Trigger:</strong> {f.trigger}
            </div>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              <strong style={{ marginRight: 4 }}>Agents:</strong>
              {f.agents.map((a, i) => <span key={i} className="agent-tool">{a}</span>)}
            </div>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
              <strong style={{ marginRight: 4 }}>Outputs:</strong>
              {f.outputs.map((o, i) => <span key={i} className="code" style={{ fontSize: 10.5 }}>{o}</span>)}
            </div>
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <button className="btn" data-size="sm" data-variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(f); }}>View flow →</button>
              {canEdit && <button className="btn" data-size="sm" data-variant="ghost"><Icon name="edit" size={11} /> Edit</button>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || ''} width={680}>
        {selected && (
          <div className="col" style={{ gap: 12 }}>
            <dl className="kv">
              <dt>Version</dt><dd className="mono">{selected.version}</dd>
              <dt>Trigger</dt><dd>{selected.trigger}</dd>
              <dt>Agents</dt><dd>{selected.agents.join(' → ')}</dd>
              <dt>Outputs</dt><dd>{selected.outputs.map((o) => <span key={o} className="code" style={{ marginRight: 6 }}>{o}</span>)}</dd>
            </dl>
            {selected.objective && (
              <div><strong style={{ fontSize: 12.5 }}>Objective:</strong> <span className="muted" style={{ fontSize: 12.5 }}>{selected.objective}</span></div>
            )}
            {selected.steps && (() => {
              const doneCount = selected.steps.filter((s) => s.done).length;
              return (
                <div className="col" style={{ gap: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>Flow steps</strong>
                    <Pill tone={doneCount === selected.steps.length ? 'green' : 'amber'}>{doneCount}/{selected.steps.length} done</Pill>
                  </div>
                  {selected.steps.map((s) => (
                    <div key={s.n} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'var(--panel)', borderRadius: 6, opacity: s.done ? 1 : 0.6 }}>
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, background: s.done ? 'var(--green-soft)' : 'var(--border)', color: s.done ? 'var(--green)' : 'var(--text-muted)' }}>
                        {s.done ? <Icon name="check" size={11} stroke={2.4} /> : s.n}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <strong style={{ fontSize: 12.5 }}>{s.title}</strong>
                          <Pill tone={s.done ? 'green' : 'outline'} dot>{s.done ? 'done' : 'pending'}</Pill>
                        </div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="muted" style={{ fontSize: 12, padding: 12, background: 'var(--panel)', borderRadius: 6 }}>
              <strong>Edit-then-validate flow:</strong> changes to the workflow definition run against a synthetic input in beta first. Passes the smoke test → activate. Fails → diff shown to author, change not applied.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Guidelines tab ─────────────────────────────────────────────────────
function GuidelinesTab({ canEdit, nav }) {
  const items = window.CDC.CODEX_GUIDELINES;
  const [selected, setSelected] = useStCx(items[0]);
  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, padding: '0 4px' }}>
        Versioned rules the agents enforce. Every edit creates a <span className="code">reference_revision</span> row. Curator-proposed edits show <strong>source = Curator proposal gp-X</strong>.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
        <div className="col" style={{ gap: 6 }}>
          {items.map((g) => (
            <div key={g.id} className="list-row" data-active={selected?.id === g.id} onClick={() => setSelected(g)}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                <strong style={{ fontSize: 13 }}>{g.name}</strong>
                <Pill tone="outline">{g.version}</Pill>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>updated {g.updated}</div>
            </div>
          ))}
        </div>

        <Card pad={false}>
          {selected && (
            <>
              <div className="detail-h">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{selected.name}</h3>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      <span className="mono">{selected.id}</span> · {selected.version} · updated {selected.updated} by {window.CDC.lookup.user(selected.updatedBy)?.name}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Pill tone="accent">{selected.source}</Pill>
                  </div>
                </div>
              </div>
              <div className="detail-b">
                <div style={{ fontSize: 13.5, lineHeight: 1.6, padding: '0 0 16px' }}>{selected.summary}</div>

                <div className="detail-section">Version history</div>
                <div className="col" style={{ gap: 8 }}>
                  {generateHistory(selected).map((h, i) => (
                    <div key={i} className="list-row">
                      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <Pill tone="outline">{h.version}</Pill>
                        <span className="mono muted" style={{ fontSize: 11 }}>{h.date}</span>
                        <span style={{ flex: 1 }} />
                        <span className="muted" style={{ fontSize: 11.5 }}>{h.who}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{h.change}</div>
                      <div className="row" style={{ gap: 4, fontSize: 11, marginTop: 4 }}>
                        <span className="muted" style={{ fontSize: 11 }}>source:</span>
                        <Pill tone="outline">{h.source}</Pill>
                      </div>
                    </div>
                  ))}
                </div>

                {canEdit && (
                  <div className="row" style={{ gap: 8, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 18 }}>
                    <button className="btn" data-size="sm"><Icon name="edit" size={11} /> Propose edit</button>
                    <button className="btn" data-size="sm" data-variant="ghost"><Icon name="sheet" size={11} /> Export markdown</button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function generateHistory(g) {
  const v = parseInt(g.version.slice(1), 10);
  const hist = [];
  for (let i = v; i >= 1; i--) {
    hist.push({
      version: `v${i}`,
      date: i === v ? g.updated : `2026-0${5 - (v - i)}-${10 + (v - i) * 4}`,
      who: i === v ? (window.CDC.lookup.user(g.updatedBy)?.name || 'Admin') : (i % 2 === 0 ? 'Pavan G' : 'Curator (proposed)'),
      change: i === v ? g.summary.slice(0, 90) + '…' : i === 1 ? 'Initial version' : `Refined section ${i}: clarified ${i === 2 ? 'scope' : i === 3 ? 'priorities' : 'edge cases'}.`,
      source: i === v ? g.source : (i % 2 === 0 ? 'Manual edit' : `Curator proposal gp-${i}`),
    });
  }
  return hist;
}
