// Relay — Task catalog admin (System → Task catalog). L3/Admin edit the
// Product-Audience, Stack, and Output-category lists that drive the New-task
// modal and the Day-end submit flow. Saved to app_docs (key 'task_catalog')
// and applied in memory via CDC.applyTaskCatalog, so changes reach everyone
// on their next load — no redeploy.

const { useState: useStTC, useMemo: useMTC } = React;

function TaskCatalogView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  const CAT = CDC.TASK_CATALOG;
  const TASK_KEYS = Object.keys(CAT.TASK_TEMPLATES);
  const ACTIVITIES = ['Planned Content Creation', 'Initiatives / Upgrades', 'Executive Ops', 'Hiring & Developing the best',
    'Academic Governance & Compliance', 'Legal & Risk', 'Academic Program Operations', 'Process & Systems Optimization'];
  const METRICS = ['Content Velocity', 'Content Effectiveness', 'Content Efficiency', 'Content Relevance', 'Business Impact',
    'Stakeholder Alignment', 'Executive Ops', 'System Effectiveness', 'System Efficiency'];

  const [products, setProducts] = useStTC(() => [...CAT.PRODUCTS]);
  const [stacks, setStacks] = useStTC(() => [...CAT.STACKS]);
  const [outputMap, setOutputMap] = useStTC(() => JSON.parse(JSON.stringify(CAT.OUTPUT_MAP)));
  const [dirty, setDirty] = useStTC(false);
  const [busy, setBusy] = useStTC(false);
  const [msg, setMsg] = useStTC('');
  const [newCat, setNewCat] = useStTC({ name: '', task: TASK_KEYS[0], activity: ACTIVITIES[0], metric: METRICS[0] });

  function touch() { setDirty(true); setMsg(''); }

  async function save() {
    const cleanProducts = products.map((p) => p.trim()).filter(Boolean);
    const cleanStacks = stacks.map((s) => s.trim()).filter(Boolean);
    if (!cleanProducts.length || !cleanStacks.length || !Object.keys(outputMap).length) {
      setMsg('Each list needs at least one entry.'); return;
    }
    setBusy(true);
    const { remoteOk } = await CDC.db.saveTaskCatalog({ products: cleanProducts, stacks: cleanStacks, outputMap });
    setProducts(cleanProducts); setStacks(cleanStacks);
    setBusy(false); setDirty(false);
    setMsg(remoteOk ? 'Saved — live for everyone on their next load.' : 'Saved locally; server write failed (still demo/unauthenticated?).');
    CDC.db.addActivity && CDC.db.addActivity({ kind: 'admin', icon: '🗂', text: `${currentUser.name} updated the task catalog` });
  }

  function addOutputCat() {
    const name = newCat.name.trim();
    if (!name || outputMap[name]) return;
    setOutputMap({ ...outputMap, [name]: { task: newCat.task, activity: newCat.activity, metric: newCat.metric } });
    setNewCat({ ...newCat, name: '' });
    touch();
  }

  return (
    <div className="fadein">
      <SectionHeader
        title="Task catalog"
        subtitle="The Product-Audience, Stack and Output-category lists used by the New-task and Day-end forms. Renaming here does not rewrite already-logged work."
        actions={
          <>
            {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
            <button className="btn" data-variant="primary" data-size="sm" disabled={!dirty || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save catalog'}
            </button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ListEditorCard title="Product-Audience" items={products}
          onChange={(next) => { setProducts(next); touch(); }} placeholder="e.g. NIAT - B6" />
        <ListEditorCard title="Stack" items={stacks}
          onChange={(next) => { setStacks(next); touch(); }} placeholder="e.g. FS - Go" />
      </div>

      <Card title="Output categories" meta="Each category maps to a task template, activity bucket and metric — the mapping drives which fill-in template the form shows.">
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Category</th><th>Task template</th><th>Activity</th><th>Metric</th><th /></tr></thead>
          <tbody>
            {Object.entries(outputMap).map(([name, m]) => (
              <tr key={name}>
                <td style={{ fontSize: 12.5, fontWeight: 500 }}>{name}</td>
                <td>
                  <select value={m.task} onChange={(e) => { setOutputMap({ ...outputMap, [name]: { ...m, task: e.target.value } }); touch(); }} style={selSt}>
                    {TASK_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td>
                  <select value={m.activity} onChange={(e) => { setOutputMap({ ...outputMap, [name]: { ...m, activity: e.target.value } }); touch(); }} style={selSt}>
                    {ACTIVITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td>
                  <select value={m.metric} onChange={(e) => { setOutputMap({ ...outputMap, [name]: { ...m, metric: e.target.value } }); touch(); }} style={selSt}>
                    {METRICS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </td>
                <td>
                  <button className="btn" data-size="sm" data-variant="ghost" title="Remove category"
                    onClick={() => { const next = { ...outputMap }; delete next[name]; setOutputMap(next); touch(); }}>✕</button>
                </td>
              </tr>
            ))}
            <tr>
              <td><input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                placeholder="New category name…" style={{ ...selSt, width: '100%' }}
                onKeyDown={(e) => { if (e.key === 'Enter') addOutputCat(); }} /></td>
              <td><select value={newCat.task} onChange={(e) => setNewCat({ ...newCat, task: e.target.value })} style={selSt}>
                {TASK_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}</select></td>
              <td><select value={newCat.activity} onChange={(e) => setNewCat({ ...newCat, activity: e.target.value })} style={selSt}>
                {ACTIVITIES.map((a) => <option key={a} value={a}>{a}</option>)}</select></td>
              <td><select value={newCat.metric} onChange={(e) => setNewCat({ ...newCat, metric: e.target.value })} style={selSt}>
                {METRICS.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
              <td><button className="btn" data-size="sm" disabled={!newCat.name.trim() || !!outputMap[newCat.name.trim()]} onClick={addOutputCat}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const selSt = {
  fontSize: 12, padding: '4px 6px', border: '1px solid var(--border, #d8d9dd)',
  borderRadius: 6, background: 'var(--panel-2, #fafafa)', color: 'var(--text, #111)',
};

// Simple editable string-list card: edit in place, remove, append.
function ListEditorCard({ title, items, onChange, placeholder }) {
  const [draft, setDraft] = useStTC('');
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]); setDraft('');
  }
  return (
    <Card title={title} meta={`${items.length} entries`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            <input value={it} style={{ ...selSt, flex: 1 }}
              onChange={(e) => { const next = [...items]; next[i] = e.target.value; onChange(next); }} />
            <button className="btn" data-size="sm" data-variant="ghost" title="Remove"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          <input value={draft} placeholder={placeholder} style={{ ...selSt, flex: 1 }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn" data-size="sm" disabled={!draft.trim() || items.includes(draft.trim())} onClick={add}>Add</button>
        </div>
      </div>
    </Card>
  );
}

window.TaskCatalogView = TaskCatalogView;
