// CD-Copilot — Department Worklogs view.
// L2/L3/Admin see every contributor's
// daily task entries across the dept, with filters, group-by toggles,
// breakdown panels and AI-suggested insights at the top.

const { useState: useStWL, useMemo: useMWL, useEffect: useEffWL, useRef: useRefWL } = React;

function WorklogsView({ tweaks, currentUser, nav }) {
  const CDC = window.CDC;
  // Recompute every render (not memoized on currentUser.id) so the live-refresh
  // poll picks up added/deleted worklogs — otherwise a stale cached array hides
  // changes until reload. filterWorklogs is a cheap array filter.
  const all = CDC.filterWorklogs(currentUser.id);

  // Title mirrors the viewer's actual scope: L3/Admin see the whole department,
  // a manager (L2 or anyone with reportees) sees their team, an L1/L0 sees only
  // their own entries — so don't call it "Department worklogs" for everyone.
  const pageTitle = useMWL(() => {
    const lvl = currentUser.level || currentUser.role;
    if (lvl === 'L3' || lvl === 'Admin' || currentUser.role === 'ADMIN'
      || currentUser.role === 'PRODUCT_OWNER' || currentUser.crossDept) return 'Department worklogs';
    const hasReportees = (CDC.USERS || []).some((u) => u.managerId === currentUser.id);
    return (lvl === 'L2' || hasReportees) ? 'Team worklogs' : 'My worklogs';
  }, [currentUser.id]);

  // Filter state
  const [range, setRange] = useStWL('week');           // today | week | month | all
  const [groupBy, setGroupBy] = useStWL('person');     // person | category | stack | day
  const [filterUser, setFilterUser] = useStWL('all');
  const [filterProduct, setFilterProduct] = useStWL('all');
  const [filterStack, setFilterStack] = useStWL('all');
  const [filterCat, setFilterCat] = useStWL('all');
  const [filterStatus, setFilterStatus] = useStWL('all');
  const [search, setSearch] = useStWL('');
  const [selected, setSelected] = useStWL(null);
  const [, setWlTick] = useStWL(0);   // force re-render after a delete
  const isAdmin = currentUser.level === 'L3' || currentUser.level === 'Admin' ||
    ['L3', 'ADMIN', 'PRODUCT_OWNER'].includes(currentUser.role);

  async function removeWorklog(id) {
    if (!window.confirm('Delete this worklog entry permanently? This cannot be undone.')) return;
    if (CDC.db && CDC.db.deleteWorklog) await CDC.db.deleteWorklog(id);
    setSelected(null);
    setWlTick((n) => n + 1);
  }

  const filtered = useMWL(() => {
    const cutoff = range === 'today' ? 0 : range === 'week' ? 6 : range === 'month' ? 30 : 999;
    return all.filter((w) => {
      if (w.daysAgo > cutoff) return false;
      if (filterUser !== 'all' && w.userId !== filterUser) return false;
      if (filterProduct !== 'all' && !(w.products || []).includes(filterProduct)) return false;
      if (filterStack !== 'all' && !w.stacks.includes(filterStack)) return false;
      if (filterCat !== 'all' && w.outputCategory !== filterCat) return false;
      if (filterStatus !== 'all' && w.status !== filterStatus) return false;
      if (search.trim()) {
        const blob = (w.userName + ' ' + w.outputCategory + ' ' + w.products.join(' ') + ' ' + Object.values(w.template || {}).join(' ')).toLowerCase();
        if (!blob.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [all, range, filterUser, filterProduct, filterStack, filterCat, filterStatus, search]);

  // Aggregates
  const totalHrs = filtered.reduce((s, w) => s + (w.hours || 0), 0);
  const contributors = new Set(filtered.map((w) => w.userId)).size;
  const blocked = filtered.filter((w) => w.status === 'Blocked' || w.status === 'Overdue').length;
  const inProgress = filtered.filter((w) => w.status === 'In-progress').length;

  // Breakdowns
  const byStack = breakdown(filtered, 'stacks', 'hours');
  const byCategory = breakdown(filtered, 'outputCategory', 'hours');
  const byPerson = breakdownByPerson(filtered);

  // AI insights computed from data
  const insights = useMWL(() => computeInsights(filtered, all), [filtered, all]);

  // Available filter options
  const users = useMWL(() => {
    const ids = [...new Set(all.map((w) => w.userId))];
    return ids.map((id) => CDC.lookup.user(id)).filter(Boolean);
  }, [all]);
  // Full product catalog (Product-Audience), so every product is selectable even
  // before it has a logged worklog. Falls back to products present in the data.
  const products = useMWL(() => {
    const cat = (window.CDC.TASK_CATALOG || {}).PRODUCTS || [];
    return cat.length ? cat : [...new Set(all.flatMap((w) => w.products || []))].sort();
  }, [all]);
  const stacks = useMWL(() => [...new Set(all.flatMap((w) => w.stacks))], [all]);
  const categories = useMWL(() => [...new Set(all.map((w) => w.outputCategory))].sort(), [all]);

  // Group filtered worklogs for the table
  const grouped = useMWL(() => groupWorklogs(filtered, groupBy), [filtered, groupBy]);

  // Export the currently-filtered worklogs to a CSV the browser downloads.
  function exportCsv() {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols = ['Date', 'Person', 'EMP ID', 'Department', 'Sub-team', 'Stacks', 'Output category', 'Count', 'Hours', 'Status', 'Details'];
    const rows = filtered.map((w) => {
      const u = CDC.lookup.user(w.userId) || {};
      const dept = (CDC.lookup.dept(w.dept) || {}).name || w.dept || '';
      const details = w.template && typeof w.template === 'object'
        ? Object.values(w.template).filter(Boolean).join(' · ') : (w.reason || '');
      return [w.date || '', w.userName || u.name || w.userId, w.userId, dept, w.sub || '',
        (w.stacks || []).join('; '), w.outputCategory || '', w.outputCount ?? '',
        w.hours ?? '', w.status || '', details].map(esc).join(',');
    });
    const csv = [cols.join(','), ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worklogs-${rangeLabel(range).replace(/\s+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div className="fadein">
      <SectionHeader
        title={pageTitle}
        subtitle={`${filtered.length} entries · ${totalHrs.toFixed(1)} hrs · ${contributors} contributor${contributors === 1 ? '' : 's'} · ${rangeLabel(range)}`}
        actions={
          <>
            <button className="btn" data-size="sm" onClick={exportCsv} disabled={!filtered.length}
              title={filtered.length ? 'Download the filtered rows as CSV' : 'Nothing to export'}>
              <Icon name="filter" size={12} /> Export CSV
            </button>
            <button className="btn" data-size="sm" data-variant="primary" onClick={() => nav.go('copilot', { prefill: 'Summarize this week\u2019s worklog patterns and call out anything concerning.' })}>
              <Icon name="sparkles" size={12} /> Ask Copilot
            </button>
          </>
        }
      />

      {/* AI insights */}
      {insights.length > 0 && (
        <Card title="Suggested insights" meta="from this week's worklogs" actions={<Pill tone="accent" dot>claude-sonnet</Pill>}>
          <div className="col" style={{ gap: 8 }}>
            {insights.map((ins, i) => (
              <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '6px 0' }}>
                <div className="item-kind" data-kind={ins.tone}>{ins.icon}</div>
                <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
                  <strong>{ins.title}</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{ins.detail}</div>
                </div>
                <button className="btn" data-size="sm" data-variant="ghost" onClick={() => ins.cta?.(setFilterUser, setFilterCat, setFilterStatus)}>
                  {ins.ctaLabel || 'View'} →
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        <div className="kpi-tile">
          <div className="kpi-name">Total hours logged</div>
          <div className="kpi-value">{totalHrs.toFixed(1)}<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>hrs</span></div>
          <div className="kpi-meta"><span>{filtered.length} entries</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Contributors</div>
          <div className="kpi-value">{contributors}</div>
          <div className="kpi-meta"><span>of {users.length} expected</span></div>
        </div>
        <div className="kpi-tile" data-tone={blocked > 0 ? 'amber' : undefined}>
          <div className="kpi-name">Blocked / overdue</div>
          <div className="kpi-value">{blocked}</div>
          <div className="kpi-meta"><span>{inProgress} in-progress</span></div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-name">Avg hrs / person / day</div>
          <div className="kpi-value">
            {contributors > 0 ? (totalHrs / contributors / Math.max(1, daysForRange(range))).toFixed(1) : '0.0'}
          </div>
          <div className="kpi-meta"><span>{daysForRange(range)} day window</span></div>
        </div>
      </div>

      {/* Filter strip */}
      <div className="card" style={{ marginTop: 16, padding: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <FilterChips label="Range" value={range} options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'all', label: 'All' },
          ]} onChange={setRange} />
          <FilterChips label="Group by" value={groupBy} options={[
            { value: 'person', label: 'Person' },
            { value: 'category', label: 'Output category' },
            { value: 'stack', label: 'Stack' },
            { value: 'day', label: 'Day' },
          ]} onChange={setGroupBy} />
          <div style={{ flex: 1 }} />
          <div className="tb-search" style={{ width: 260, height: 28 }}>
            <Icon name="search" size={12} />
            <input placeholder="Filter…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <DropdownFilter label="Person" value={filterUser} setValue={setFilterUser}
            options={[{ value: 'all', label: 'All people' }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
          <DropdownFilter label="Product" value={filterProduct} setValue={setFilterProduct}
            options={[{ value: 'all', label: 'All products' }, ...products.map((p) => ({ value: p, label: p }))]} />
          <DropdownFilter label="Stack" value={filterStack} setValue={setFilterStack}
            options={[{ value: 'all', label: 'All stacks' }, ...stacks.map((s) => ({ value: s, label: s }))]} />
          <DropdownFilter label="Category" value={filterCat} setValue={setFilterCat}
            options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <DropdownFilter label="Status" value={filterStatus} setValue={setFilterStatus}
            options={[{ value: 'all', label: 'All status' }, ...['Done', 'In-progress', 'Blocked', 'Overdue'].map((s) => ({ value: s, label: s }))]} />
          {(filterUser !== 'all' || filterStack !== 'all' || filterCat !== 'all' || filterStatus !== 'all' || search) && (
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => {
              setFilterUser('all'); setFilterStack('all'); setFilterCat('all'); setFilterStatus('all'); setSearch('');
            }}>Clear filters</button>
          )}
        </div>
      </div>

      {/* Main split: table + breakdown panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginTop: 16 }}>
        <div>
          <Card pad={false} title={`${grouped.length} ${groupBy === 'person' ? 'people' : groupBy === 'category' ? 'categories' : groupBy === 'stack' ? 'stacks' : 'days'}`} meta={`${filtered.length} entries`}>
            {grouped.length === 0 ? (
              <div className="empty">No worklogs match the filters.</div>
            ) : (
              <div>
                {grouped.map((g) => (
                  <WorklogGroup
                    key={g.key}
                    group={g}
                    groupBy={groupBy}
                    tweaks={tweaks}
                    onSelect={setSelected}
                    selectedId={selected?.id}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="By person" pad={false}>
            <BreakdownList items={byPerson} max={Math.max(...byPerson.map((p) => p.value), 1)} />
          </Card>
          <Card title="By stack" pad={false}>
            <BreakdownList items={byStack} max={Math.max(...byStack.map((p) => p.value), 1)} />
          </Card>
          <Card title="By output category" pad={false}>
            <BreakdownList items={byCategory.slice(0, 8)} max={Math.max(...byCategory.map((p) => p.value), 1)} />
          </Card>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Worklog ${selected.id}` : ''} width={680}
        footer={isAdmin && selected ? (
          <button className="btn" data-variant="danger" onClick={() => removeWorklog(selected.id)}>Delete entry</button>
        ) : undefined}>
        {selected && <WorklogDetail w={selected} />}
      </Modal>
    </div>
  );
}
window.WorklogsView = WorklogsView;

// ── Filter helpers ─────────────────────────────────────────────────────
function FilterChips({ label, value, options, onChange }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginRight: 4 }}>{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o.value} data-active={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function DropdownFilter({ label, value, setValue, options }) {
  const sel = options.find((o) => o.value === value);
  return (
    <div className="row" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginRight: 2 }}>{label}</span>
      <select className="btn" data-size="sm" value={value} onChange={(e) => setValue(e.target.value)} style={{ padding: '0 22px 0 10px', minWidth: 120 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Group rendering ────────────────────────────────────────────────────
function WorklogGroup({ group, groupBy, tweaks, onSelect, selectedId }) {
  const [open, setOpen] = useStWL(true);
  const totalHrs = group.items.reduce((s, w) => s + w.hours, 0);
  const blockedCount = group.items.filter((w) => w.status === 'Blocked' || w.status === 'Overdue').length;
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="row" style={{ padding: '10px 16px', cursor: 'default', background: 'var(--panel)' }} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? 'chev-down' : 'chev-right'} size={12} />
        <GroupHeader group={group} groupBy={groupBy} />
        <div style={{ marginLeft: 'auto' }} className="row">
          {blockedCount > 0 && <Pill tone="red" dot>{blockedCount} blocked</Pill>}
          <Pill tone="outline">{group.items.length} entries</Pill>
          <span className="mono" style={{ fontWeight: 600, minWidth: 50, textAlign: 'right' }}>{totalHrs.toFixed(1)} hr</span>
        </div>
      </div>
      {open && (
        <table className="tbl">
          <thead>
            <tr>
              {groupBy !== 'person' && <th style={{ width: 140 }}>Person</th>}
              {groupBy !== 'category' && <th>Output Category</th>}
              {groupBy !== 'stack' && <th style={{ width: 100 }}>Stack</th>}
              {groupBy !== 'day' && <th style={{ width: 90 }}>Date</th>}
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 60, textAlign: 'right' }}>Hrs</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((w) => (
              <tr key={w.id} data-active={selectedId === w.id} onClick={() => onSelect(w)}>
                {groupBy !== 'person' && (
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Avatar user={{ initials: w.userInitials }} size={18} />
                      <span style={{ fontSize: 12.5 }}>{w.userName}</span>
                    </div>
                  </td>
                )}
                {groupBy !== 'category' && (
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{w.outputCategory}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {summarizeTemplate(w.template, w.taskCategory)}
                    </div>
                  </td>
                )}
                {groupBy !== 'stack' && <td className="mono muted" style={{ fontSize: 11.5 }}>{w.stacks.join(' · ')}</td>}
                {groupBy !== 'day' && <td className="mono muted" style={{ fontSize: 11.5 }}>{w.daysAgo === 0 ? 'today' : w.daysAgo === 1 ? 'yest' : w.date.slice(5)}</td>}
                <td>
                  <Pill dot tone={
                    w.status === 'Done' ? 'green' : w.status === 'In-progress' ? 'blue' : w.status === 'Blocked' ? 'red' : 'amber'
                  }>{w.status}</Pill>
                </td>
                <td className="num">{w.hours.toFixed(1)}</td>
                <td><Icon name="chev-right" size={12} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupHeader({ group, groupBy }) {
  if (groupBy === 'person') {
    const u = window.CDC.lookup.user(group.key);
    return (
      <div className="row" style={{ gap: 10 }}>
        <Avatar user={u} size={22} />
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{u?.name || group.key}</div>
          <div className="muted" style={{ fontSize: 11 }}>{u?.title || ''}</div>
        </div>
      </div>
    );
  }
  if (groupBy === 'day') {
    const d = group.items[0]?.date;
    const days = group.items[0]?.daysAgo;
    return <div style={{ fontWeight: 500, fontSize: 13 }}>{days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d}</div>;
  }
  return <div style={{ fontWeight: 500, fontSize: 13 }}>{group.key}</div>;
}

// ── Breakdown panel ────────────────────────────────────────────────────
function BreakdownList({ items, max }) {
  if (items.length === 0) return <div className="empty">No data.</div>;
  const amber = 'var(--amber, #b7791f)';
  return (
    <div style={{ padding: '4px 0' }}>
      {items.map((it) => (
        <div key={it.key} style={{ padding: '6px 14px' }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
              {it.under && <span title={`Avg ${it.avgPerDay.toFixed(1)}h/day over ${it.nDays} day${it.nDays === 1 ? '' : 's'} — under the ${window.CDC.DAILY_TARGET_HRS || 8}h target`} style={{ color: amber, marginRight: 4 }}>⚠</span>}
              {it.label}
            </span>
            <span className="mono" style={{ fontWeight: 500, color: it.under ? amber : undefined }}>
              {it.value.toFixed(1)} hr{it.avgPerDay != null ? ` · ${it.avgPerDay.toFixed(1)}/day` : ''}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.under ? amber : 'var(--accent)', borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Worklog detail modal body ──────────────────────────────────────────
function WorklogDetail({ w }) {
  const u = window.CDC.lookup.user(w.userId);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar user={u} size={32} />
        <div>
          <div style={{ fontWeight: 600 }}>{u?.name}</div>
          <div className="muted" style={{ fontSize: 11.5 }}><span className="mono">{w.empId}</span> · {u?.title}</div>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Pill dot tone={
            w.status === 'Done' ? 'green' : w.status === 'In-progress' ? 'blue' : w.status === 'Blocked' ? 'red' : 'amber'
          }>{w.status}</Pill>
        </span>
      </div>

      <dl className="kv">
        <dt>Logged at</dt><dd className="mono">{w.date} · {w.submittedAt}</dd>
        <dt>Stack</dt><dd>{w.stacks.join(' · ')}</dd>
        <dt>Products</dt><dd>{w.products.join(' · ')}</dd>
        <dt>Output category</dt><dd>{w.outputCategory}</dd>
        <dt>Task category</dt><dd><Pill tone="accent">{w.taskCategory}</Pill></dd>
        <dt>Output count</dt><dd className="mono">{w.outputCount ?? 'N/A'}</dd>
        <dt>Hours logged</dt><dd className="mono">{w.hours.toFixed(1)}</dd>
      </dl>

      <div>
        <div className="detail-section">What was achieved</div>
        <dl className="kv">
          {Object.entries(w.template || {}).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt style={{ textTransform: 'capitalize' }}>{k}</dt>
              <dd>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>

      {w.reason && (
        <div style={{ padding: '10px 12px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 6, fontSize: 12.5 }}>
          <strong>Blocked reason:</strong> {w.reason}
        </div>
      )}

      <div>
        <div className="detail-section">Audit</div>
        <dl className="kv">
          <dt>Source</dt><dd className="mono code">chat-submit · {w.submittedAt || '—'}</dd>
          <dt>Worklog ID</dt><dd className="mono">{w.id}</dd>
          <dt>Cited by</dt><dd className="muted">— (cross-references appear after weekly run)</dd>
        </dl>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
function breakdown(items, key, valueKey) {
  const map = new Map();
  for (const it of items) {
    const v = it[valueKey] || 0;
    if (Array.isArray(it[key])) {
      for (const k of it[key]) map.set(k, (map.get(k) || 0) + v);
    } else {
      const k = it[key];
      map.set(k, (map.get(k) || 0) + v);
    }
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value);
}

function breakdownByPerson(items) {
  const target = window.CDC.DAILY_TARGET_HRS || 8;
  const map = new Map();   // uid → { hours, days:Set }
  for (const it of items) {
    const e = map.get(it.userId) || { hours: 0, days: new Set() };
    e.hours += it.hours; if (it.date) e.days.add(it.date);
    map.set(it.userId, e);
  }
  return [...map.entries()].map(([uid, e]) => {
    const u = window.CDC.lookup.user(uid);
    const nDays = e.days.size || 1;
    const avgPerDay = e.hours / nDays;
    // Flag people averaging under the daily target across the days they logged.
    return { key: uid, label: u?.name || uid, value: e.hours, avgPerDay, nDays, under: avgPerDay < target - 0.01 };
  }).sort((a, b) => b.value - a.value);
}

function groupWorklogs(items, by) {
  const map = new Map();
  for (const it of items) {
    let key;
    if (by === 'person') key = it.userId;
    else if (by === 'category') key = it.outputCategory;
    else if (by === 'stack') key = it.stacks[0] || 'Unspecified';
    else if (by === 'day') key = it.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  const arr = [...map.entries()].map(([k, v]) => ({ key: k, items: v }));
  if (by === 'day') {
    arr.sort((a, b) => a.items[0].daysAgo - b.items[0].daysAgo);
  } else {
    arr.sort((a, b) => b.items.reduce((s, w) => s + w.hours, 0) - a.items.reduce((s, w) => s + w.hours, 0));
  }
  return arr;
}

function summarizeTemplate(t, taskCat) {
  if (!t) return '';
  if (taskCat === 'Content Creation & Review') return `${t.course || ''} · ${t.module || ''} · ${t.topic || ''}`;
  if (taskCat === 'Recording & Production') return `${t.course || ''} · ${t.module || ''} · ${t.stage || ''}`;
  if (taskCat === 'Process & Tooling') return `${t.tool || ''} · impact ${t.impact || '—'}`;
  if (taskCat === 'Industry Review & Quality Check') return `${t.course || ''} · ${t.upgrade || ''}`;
  if (taskCat === 'Business Requests & Coordination') return t.agenda || '';
  return Object.values(t).slice(0, 2).filter(Boolean).join(' · ');
}

function rangeLabel(r) {
  return r === 'today' ? 'today' : r === 'week' ? 'last 7 days' : r === 'month' ? 'last 30 days' : 'all time';
}

function daysForRange(r) {
  return r === 'today' ? 1 : r === 'week' ? 7 : r === 'month' ? 30 : 60;
}

// ── Insight generator (deterministic from data) ────────────────────────
function computeInsights(filtered, all) {
  const out = [];
  const byPerson = breakdownByPerson(filtered);
  const byCategory = breakdown(filtered, 'outputCategory', 'hours');
  const byTaskCat = breakdown(filtered, 'taskCategory', 'hours');
  const blocked = filtered.filter((w) => w.status === 'Blocked' || w.status === 'Overdue');

  // 1) Blocked / overdue surface
  if (blocked.length > 0) {
    const reasons = [...new Set(blocked.map((b) => b.reason).filter(Boolean))];
    out.push({
      tone: 'blocker', icon: '!',
      title: `${blocked.length} blocked / overdue task${blocked.length === 1 ? '' : 's'} this week`,
      detail: reasons.length > 0 ? `Reasons: ${reasons.slice(0, 2).join(' · ')}` : 'No reasons provided.',
      ctaLabel: 'Show',
      cta: (setUser, setCat, setStatus) => setStatus('Blocked'),
    });
  }

  // 2) Concentration risk — top person owns > 35% of total time on one category
  if (byPerson.length > 0) {
    const top = byPerson[0];
    const topUserItems = filtered.filter((w) => w.userId === top.key);
    const topUserHrs = top.value;
    const totalHrs = filtered.reduce((s, w) => s + w.hours, 0);
    if (totalHrs > 0 && topUserHrs / totalHrs > 0.25) {
      // their biggest category
      const personCat = breakdown(topUserItems, 'outputCategory', 'hours')[0];
      if (personCat && personCat.value / topUserHrs > 0.5) {
        out.push({
          tone: 'risk', icon: '⊙',
          title: `${window.CDC.lookup.user(top.key)?.name?.split(' ')[0]} logged ${Math.round((personCat.value / topUserHrs) * 100)}% of their time on "${personCat.key}"`,
          detail: `${personCat.value.toFixed(1)} of ${topUserHrs.toFixed(1)} hrs. Consider redistribution.`,
          ctaLabel: 'Filter',
          cta: (setUser, setCat) => { setUser(top.key); setCat(personCat.key); },
        });
      }
    }
  }

  // 3) High-impact agentic workflow output
  const agentic = filtered.filter((w) => w.outputCategory === 'Agentic Workflow Initiative, R&D, Tools');
  if (agentic.length >= 2) {
    const topImpact = agentic.filter((w) => parseInt(w.template?.impact || '0', 10) >= 4).length;
    if (topImpact > 0) {
      out.push({
        tone: 'done', icon: '★',
        title: `${agentic.length} Agentic Workflow outputs shipped — ${topImpact} rated impact ≥ 4`,
        detail: 'Worth featuring at the next leadership review.',
        ctaLabel: 'See entries',
        cta: (setUser, setCat) => setCat('Agentic Workflow Initiative, R&D, Tools'),
      });
    }
  }

  // 4) Categories not touched this week
  const allCats = [...new Set(all.map((w) => w.outputCategory))];
  const seenCats = new Set(filtered.map((w) => w.outputCategory));
  const missingHigh = ['Performance-Goal Management', 'Stakeholder Request Fulfillment', 'Executive Reporting']
    .filter((c) => !seenCats.has(c) && allCats.includes(c));
  if (missingHigh.length > 0) {
    out.push({
      tone: 'note', icon: '○',
      title: `No entries this week for: ${missingHigh.slice(0, 2).join(', ')}`,
      detail: 'Either intentional or a coverage gap — worth confirming.',
      ctaLabel: 'Acknowledge',
      cta: () => {},
    });
  }

  return out.slice(0, 4);
}
