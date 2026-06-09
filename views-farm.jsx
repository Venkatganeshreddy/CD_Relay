// CD-Copilot — Agent Farm + Agentic Gains.
// Catalog of team-built agents with usage stats and hours-saved leaderboard.

const { useState: useStF, useMemo: useMF } = React;

function FarmView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const agents = CDC.FARM_AGENTS;
  const [filter, setFilter] = useStF('all');
  const [tagFilter, setTagFilter] = useStF('all');
  const [selected, setSelected] = useStF(null);
  const [registerOpen, setRegisterOpen] = useStF(false);
  const [version, setVersion] = useStF(0); // bump to recompute memos after in-place mutation

  const tags = useMF(() => ['all', ...new Set(agents.flatMap((a) => a.tags))], [agents, version]);

  const filtered = agents.filter((a) => {
    if (filter !== 'all' && a.health !== filter) return false;
    if (tagFilter !== 'all' && !a.tags.includes(tagFilter)) return false;
    return true;
  });

  // Aggregates
  const totalSaved = agents.reduce((s, a) => s + a.gains.hoursSaved, 0);
  const totalUnits = agents.reduce((s, a) => s + a.usage.unitsProcessed, 0);
  const healthy = agents.filter((a) => a.health === 'ok').length;

  // Leaderboards
  const byOwner = useMF(() => {
    const map = new Map();
    for (const a of agents) {
      const cur = map.get(a.owner) || { hoursSaved: 0, count: 0, agents: [] };
      cur.hoursSaved += a.gains.hoursSaved;
      cur.count += 1;
      cur.agents.push(a.name);
      map.set(a.owner, cur);
    }
    return [...map.entries()].map(([uid, v]) => ({
      uid, user: CDC.lookup.user(uid), ...v,
    })).sort((a, b) => b.hoursSaved - a.hoursSaved);
  }, [agents, version]);

  const byDept = useMF(() => {
    const map = new Map();
    for (const a of agents) {
      const u = CDC.lookup.user(a.owner);
      const deptId = u?.dept || 'unknown';
      const cur = map.get(deptId) || { hoursSaved: 0, count: 0 };
      cur.hoursSaved += a.gains.hoursSaved;
      cur.count += 1;
      map.set(deptId, cur);
    }
    return [...map.entries()].map(([did, v]) => ({
      did, name: CDC.lookup.dept(did)?.short || CDC.lookup.dept(did)?.name || did,
      ...v,
    })).sort((a, b) => b.hoursSaved - a.hoursSaved);
  }, [agents, version]);

  return (
    <div className="fadein">
      <SectionHeader
        title="Agent Farm"
        subtitle="Catalog of agents the team built. Hours-saved math drives the Agentic Gains leaderboard."
        actions={
          <>
            <button className="btn" data-size="sm"><Icon name="sheet" size={12} /> Export report</button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => setRegisterOpen(true)}><Icon name="sparkles" size={12} /> Register new agent</button>
          </>
        }
      />

      {/* Top tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Agents in farm</div>
          <div className="kpi-value">{agents.length}</div>
          <div className="kpi-meta"><span>{healthy} healthy · {agents.filter((a) => a.health === 'warning').length} warning · {agents.filter((a) => a.health === 'idle').length} idle</span></div>
        </div>
        <div className="kpi-tile" data-tone="green">
          <div className="kpi-name">Hours saved · this month</div>
          <div className="kpi-value">{totalSaved.toFixed(0)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>hrs</span></div>
          <div className="kpi-meta"><span>≈ {(totalSaved / 160).toFixed(1)} FTE-months</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Units processed · this month</div>
          <div className="kpi-value">{totalUnits.toLocaleString()}</div>
          <div className="kpi-meta"><span>across {agents.length} agents</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Top contributor</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{byOwner[0]?.user?.name?.split(' ')[0] || '—'}</div>
          <div className="kpi-meta"><span><span className="mono">{byOwner[0]?.hoursSaved.toFixed(0)}</span> hrs · {byOwner[0]?.count} agent{byOwner[0]?.count === 1 ? '' : 's'}</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600 }}>Health</span>
        <div className="seg">
          {['all', 'ok', 'warning', 'idle'].map((f) => (
            <button key={f} data-active={filter === f} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <span style={{ width: 12 }} />
        <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600 }}>Tag</span>
        <div className="seg">
          {tags.map((t) => (
            <button key={t} data-active={tagFilter === t} onClick={() => setTagFilter(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Main grid: cards + leaderboards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {filtered.map((a) => (
            <FarmCard key={a.id} agent={a} onClick={() => setSelected(a)} />
          ))}
          {filtered.length === 0 && (
            <div className="empty" style={{ gridColumn: 'span 2' }}>No agents match the filter.</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="Agentic Gains · by owner" meta="hrs/mo" pad={false}>
            <div>
              {byOwner.map((row, i) => {
                const pct = byOwner[0] ? (row.hoursSaved / byOwner[0].hoursSaved) * 100 : 0;
                return (
                  <div key={row.uid} className="leaderboard-row" data-rank={i + 1}>
                    <span className="leaderboard-rank">#{i + 1}</span>
                    <div className="row" style={{ gap: 6, minWidth: 0 }}>
                      <Avatar user={row.user} size={20} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.user?.name}</div>
                        <div className="muted" style={{ fontSize: 10.5 }}>{row.count} agent{row.count === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{row.hoursSaved.toFixed(0)}</span>
                    <div className="leaderboard-bar"><div style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="By department" pad={false}>
            <div>
              {byDept.map((row, i) => {
                const pct = byDept[0] ? (row.hoursSaved / byDept[0].hoursSaved) * 100 : 0;
                return (
                  <div key={row.did} className="leaderboard-row" data-rank={i + 1}>
                    <span className="leaderboard-rank">#{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                      <div className="muted" style={{ fontSize: 10.5 }}>{row.count} agent{row.count === 1 ? '' : 's'}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{row.hoursSaved.toFixed(0)}</span>
                    <div className="leaderboard-bar"><div style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="How is this computed?">
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
              The Gains service multiplies <strong>units processed</strong> by the delta between the manual baseline and agent-assisted time per unit:
            </div>
            <pre className="code" style={{ display: 'block', padding: 8, fontSize: 11, whiteSpace: 'pre-wrap', background: 'var(--panel)', margin: 0 }}>{`hours_saved =
  Σ (baseline_hrs/unit − agent_hrs/unit)
    × units_done`}</pre>
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              No LLM call — this is computation, not judgment. Baselines come from your unit-economics config.
            </div>
          </Card>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || ''} width={720}>
        {selected && <FarmDetail a={selected} />}
      </Modal>

      <RegisterAgentModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        currentUser={currentUser}
        onCreated={(a) => { setFilter('all'); setTagFilter('all'); setVersion((v) => v + 1); setSelected(a); }}
      />
    </div>
  );
}
window.FarmView = FarmView;

function RegisterAgentModal({ open, onClose, currentUser, onCreated }) {
  const CDC = window.CDC;
  const blank = {
    name: '', description: '', level: 'L1', scope: 'sub', stack: '',
    deployUrl: '', tags: '', unitsProcessed: '', baselineHrsPerUnit: '', agentHrsPerUnit: '',
  };
  const [f, setF] = useStF(blank);
  const [saving, setSaving] = useStF(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const canSave = f.name.trim() && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const units = num(f.unitsProcessed);
    const baseline = num(f.baselineHrsPerUnit);
    const agentPer = num(f.agentHrsPerUnit);
    const today = CDC.fmt ? CDC.fmt(CDC.today) : new Date().toISOString().slice(0, 10);
    const period = today.slice(0, 7);
    const agent = {
      id: `fa-${Date.now()}`,
      name: f.name.trim(),
      owner: currentUser.id,
      description: f.description.trim(),
      level: f.level,
      scope: f.scope,
      deployUrl: f.deployUrl.trim(),
      health: 'ok',
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      stack: f.stack.trim(),
      usage: { period, unitsProcessed: units, agentTime: +(agentPer * units).toFixed(1) },
      gains: { baselineHrsPerUnit: baseline, agentHrsPerUnit: agentPer, hoursSaved: +Math.max(0, (baseline - agentPer) * units).toFixed(1) },
      createdAt: today,
    };
    try {
      if (CDC.db && CDC.db.addFarmAgent) await CDC.db.addFarmAgent(agent);
      else if (Array.isArray(CDC.FARM_AGENTS)) CDC.FARM_AGENTS.unshift(agent);
    } finally {
      setSaving(false);
      setF(blank);
      onClose();
      onCreated && onCreated(agent);
    }
  }

  const lbl = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.06, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };
  return (
    <Modal open={open} onClose={onClose} title="Register new agent" width={560}>
      <div className="col" style={{ gap: 12 }}>
        <div>
          <label style={lbl}>Name *</label>
          <input className="input-text" style={{ width: '100%' }} placeholder="e.g. TR-Doc Generator" value={f.name} onChange={set('name')} />
        </div>
        <div>
          <label style={lbl}>Description</label>
          <textarea className="input-text" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} placeholder="What it does + rough impact" value={f.description} onChange={set('description')} />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Autonomy level</label>
            <select className="input-text" style={{ width: '100%' }} value={f.level} onChange={set('level')}>
              <option value="L0">L0 · suggest only</option>
              <option value="L1">L1 · act with approval</option>
              <option value="L2">L2 · auto within guardrails</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Scope</label>
            <select className="input-text" style={{ width: '100%' }} value={f.scope} onChange={set('scope')}>
              <option value="sub">sub</option>
              <option value="dept">dept</option>
              <option value="org">org</option>
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Stack</label>
          <input className="input-text" style={{ width: '100%' }} placeholder="e.g. Claude Sonnet · LangGraph" value={f.stack} onChange={set('stack')} />
        </div>
        <div>
          <label style={lbl}>Deploy URL</label>
          <input className="input-text" style={{ width: '100%' }} placeholder="https://…" value={f.deployUrl} onChange={set('deployUrl')} />
        </div>
        <div>
          <label style={lbl}>Tags <span style={{ fontWeight: 400, textTransform: 'none' }}>(comma-separated)</span></label>
          <input className="input-text" style={{ width: '100%' }} placeholder="content, fullstack" value={f.tags} onChange={set('tags')} />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Units / month</label>
            <input className="input-text" type="number" min="0" style={{ width: '100%' }} placeholder="0" value={f.unitsProcessed} onChange={set('unitsProcessed')} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Baseline hrs/unit</label>
            <input className="input-text" type="number" min="0" step="0.01" style={{ width: '100%' }} placeholder="0" value={f.baselineHrsPerUnit} onChange={set('baselineHrsPerUnit')} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Agent hrs/unit</label>
            <input className="input-text" type="number" min="0" step="0.01" style={{ width: '100%' }} placeholder="0" value={f.agentHrsPerUnit} onChange={set('agentHrsPerUnit')} />
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          Hours saved auto-computes as (baseline − agent) × units. Owner: <strong>{currentUser.name}</strong>.
        </div>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button className="btn" data-size="sm" data-variant="ghost" onClick={onClose}>Cancel</button>
          <button className="btn" data-size="sm" data-variant="primary" disabled={!canSave} onClick={save}>
            <Icon name="sparkles" size={12} /> {saving ? 'Saving…' : 'Register agent'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FarmCard({ agent: a, onClick }) {
  const u = window.CDC.lookup.user(a.owner);
  return (
    <div className="farm-card" data-health={a.health} onClick={onClick}>
      <div className="farm-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, marginBottom: 2 }}>
            <div className="farm-name">{a.name}</div>
            <Pill tone="outline">{a.level}</Pill>
          </div>
          <div className="farm-owner">
            <Avatar user={u} size={16} />
            <span>{u?.name}</span>
            <span className="muted">·</span>
            <span className="muted">{a.scope} scope</span>
          </div>
        </div>
        <Pill tone={a.health === 'ok' ? 'green' : a.health === 'warning' ? 'amber' : 'outline'} dot>{a.health}</Pill>
      </div>

      <div className="farm-desc">{a.description}</div>

      {a.note && (
        <div style={{ fontSize: 11.5, color: 'var(--amber)', background: 'var(--amber-soft)', padding: '4px 8px', borderRadius: 4 }}>
          {a.note}
        </div>
      )}

      <div className="farm-stats">
        <div>
          <div className="farm-stat-l">Units · {a.usage.period}</div>
          <div className="farm-stat-v">{a.usage.unitsProcessed}</div>
        </div>
        <div>
          <div className="farm-stat-l">Agent time</div>
          <div className="farm-stat-v">{a.usage.agentTime.toFixed(1)}h</div>
        </div>
        <div>
          <div className="farm-stat-l">Hours saved</div>
          <div className="farm-stat-v savings">+{a.gains.hoursSaved.toFixed(1)}</div>
        </div>
      </div>

      <div className="farm-foot">
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {a.tags.map((t) => (
            <span key={t} className="agent-tool" style={{ fontSize: 10 }}>{t}</span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn" data-size="sm" data-variant="ghost" onClick={(e) => { e.stopPropagation(); window.open(a.deployUrl, '_blank'); }}>
          <Icon name="plug" size={11} /> Open
        </button>
      </div>
    </div>
  );
}

function FarmDetail({ a }) {
  const u = window.CDC.lookup.user(a.owner);
  const baselineMonthlyHrs = a.gains.baselineHrsPerUnit * a.usage.unitsProcessed;
  const actualMonthlyHrs = baselineMonthlyHrs - a.gains.hoursSaved;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar user={u} size={32} />
        <div>
          <div style={{ fontWeight: 600 }}>{u?.name}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Owner · {u?.title}</div>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Pill tone={a.health === 'ok' ? 'green' : a.health === 'warning' ? 'amber' : 'outline'} dot>{a.health}</Pill>
        </span>
      </div>

      <div style={{ fontSize: 13 }}>{a.description}</div>

      <dl className="kv">
        <dt>Level</dt><dd><Pill tone="outline">{a.level}</Pill> <span className="muted" style={{ fontSize: 11.5 }}>{a.level === 'L0' ? 'suggest only' : a.level === 'L1' ? 'act with approval' : 'auto within guardrails'}</span></dd>
        <dt>Scope</dt><dd>{a.scope}</dd>
        <dt>Stack</dt><dd className="mono">{a.stack}</dd>
        <dt>Tags</dt>
        <dd>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {a.tags.map((t) => <span key={t} className="agent-tool">{t}</span>)}
          </div>
        </dd>
        <dt>Deploy URL</dt><dd className="mono code">{a.deployUrl}</dd>
        <dt>Registered</dt><dd>{a.createdAt}</dd>
      </dl>

      <div>
        <div className="detail-section">Agentic Gains math</div>
        <div style={{ background: 'var(--panel)', padding: 12, borderRadius: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span>Baseline manual time/unit</span>
            <span className="mono">{a.gains.baselineHrsPerUnit.toFixed(2)} hr</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span>Agent-assisted time/unit</span>
            <span className="mono">{a.gains.agentHrsPerUnit.toFixed(2)} hr</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span>Units done this month</span>
            <span className="mono">{a.usage.unitsProcessed}</span>
          </div>
          <div className="divider" style={{ margin: '8px 0' }} />
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span className="muted">Baseline cost (manual)</span>
            <span className="mono muted">{baselineMonthlyHrs.toFixed(1)} hr</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span className="muted">With agent</span>
            <span className="mono muted">{actualMonthlyHrs.toFixed(1)} hr</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
            <span style={{ color: 'var(--green)' }}>Hours saved · this month</span>
            <span className="mono" style={{ color: 'var(--green)' }}>+{a.gains.hoursSaved.toFixed(1)} hr</span>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 8, paddingTop: 8 }}>
        <button className="btn" data-size="sm"><Icon name="plug" size={11} /> Open agent</button>
        <button className="btn" data-size="sm"><Icon name="runs" size={11} /> Usage logs</button>
        <span style={{ flex: 1 }} />
        <button className="btn" data-size="sm" data-variant="ghost"><Icon name="edit" size={11} /> Edit card</button>
      </div>
    </div>
  );
}
