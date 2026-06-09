// CD-Copilot — root App.

const { useState: useState_a, useEffect: useEffect_a, useMemo: useMemo_a } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accent": "indigo",
  "rag": "numeric",
  "density": "cozy",
  "confidence": true,
  "mononum": true,
  "userId": "NW0002526",
  "env": "prod",
  "openrouterKey": ""
}/*EDITMODE-END*/;

const ACCENT_COLORS = {
  indigo: 'oklch(0.55 0.16 265)',
  emerald: 'oklch(0.58 0.13 152)',
  amber:   'oklch(0.65 0.14 70)',
  rose:    'oklch(0.6 0.16 15)',
};
const ACCENT_BORDER = {
  indigo: 'oklch(0.85 0.07 265)',
  emerald: 'oklch(0.85 0.07 152)',
  amber:   'oklch(0.85 0.08 70)',
  rose:    'oklch(0.85 0.08 15)',
};
const ACCENT_SOFT = {
  indigo: 'oklch(0.95 0.04 265)',
  emerald: 'oklch(0.95 0.04 152)',
  amber:   'oklch(0.95 0.04 70)',
  rose:    'oklch(0.95 0.04 15)',
};
const ACCENT_SOFT_DARK = {
  indigo: 'oklch(0.32 0.08 265)',
  emerald: 'oklch(0.32 0.08 152)',
  amber:   'oklch(0.32 0.08 70)',
  rose:    'oklch(0.32 0.08 15)',
};
const ACCENT_DARK = {
  indigo: 'oklch(0.72 0.17 265)',
  emerald: 'oklch(0.72 0.15 152)',
  amber:   'oklch(0.78 0.16 70)',
  rose:    'oklch(0.72 0.16 15)',
};

// Map a user.role to whether they're an L0/L1 contributor (defaults to submit view)
function isContributorRole(role) {
  return ['L0', 'L1', 'TEAM_MEMBER'].includes(role);
}

function App({ authMode = 'demo', me = null, realUser = null, impersonating = false }) {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState_a({ name: 'dashboard', params: {} });
  const [copilotPrefill, setCopilotPrefill] = useState_a(null);
  const [momOpen, setMomOpen] = useState_a(false);

  // Authed → the logged-in (or impersonated) employee drives scope; demo → tweak switch.
  const currentUser = useMemo_a(
    () => (authMode === 'authed' && me) ? me
      : (window.CDC.USERS.find((u) => u.id === t.userId) || window.CDC.USERS[0]),
    [t.userId, authMode, me]
  );

  // Expose auth-aware actions for the role switcher / tweaks "Acting as" / sign-out.
  useEffect_a(() => {
    window.__RELAY = {
      authed: authMode === 'authed',
      impersonate: (id) => Promise.resolve(window.CDC.setImpersonation && window.CDC.setImpersonation(id))
        .then(() => location.reload()),
      exitImpersonation: () => Promise.resolve(window.CDC.setImpersonation && window.CDC.setImpersonation(null))
        .then(() => location.reload()),
      // Clear any impersonation before signing out so the next login starts clean.
      signOut: () => Promise.resolve(window.CDC.setImpersonation && window.CDC.setImpersonation(null)).catch(() => {})
        .then(() => window.CDC.auth && window.CDC.auth.signOut())
        .then(() => location.reload()),
    };
  }, [authMode]);

  // Hydrate openrouterKey from localStorage on mount
  useEffect_a(() => {
    const stored = localStorage.getItem('relay_openrouter_key');
    if (stored && !t.openrouterKey) setTweak('openrouterKey', stored);
  }, []);

  // Mirror openrouterKey tweak to localStorage
  useEffect_a(() => {
    if (t.openrouterKey) localStorage.setItem('relay_openrouter_key', t.openrouterKey);
    else localStorage.removeItem('relay_openrouter_key');
  }, [t.openrouterKey]);

  // Apply theme to <html>
  useEffect_a(() => {
    const root = document.documentElement;
    root.dataset.theme = t.dark ? 'dark' : 'light';
    root.dataset.density = t.density;
    document.body.dataset.mononum = t.mononum ? 'on' : 'off';
    root.style.setProperty('--accent', t.dark ? ACCENT_DARK[t.accent] : ACCENT_COLORS[t.accent]);
    root.style.setProperty('--accent-border', ACCENT_BORDER[t.accent]);
    root.style.setProperty('--accent-soft', t.dark ? ACCENT_SOFT_DARK[t.accent] : ACCENT_SOFT[t.accent]);
  }, [t.dark, t.accent, t.density, t.mononum]);

  // When user switches role, jump to a sensible route they can see
  useEffect_a(() => {
    const isContributor = isContributorRole(currentUser.role);
    if (route.name === 'department') {
      const visible = window.CDC.filterDepartments(currentUser.id).map((d) => d.id);
      if (!visible.includes(route.params.id)) {
        setRoute({ name: isContributor ? 'dashboard' : 'dashboard', params: {} });
        return;
      }
    }
    // L1/L0 users now have a dashboard too (own dashboard) — don't auto-redirect them
  }, [currentUser.id]);

  const nav = {
    go: (name, params = {}) => {
      if (name === 'copilot' && params.prefill) {
        setCopilotPrefill(params.prefill);
      } else if (name !== 'copilot') {
        setCopilotPrefill(null);
      }
      if (name === 'mom') { if (window.canUseMomLoader(currentUser)) setMomOpen(true); return; }
      setRoute({ name, params });
    },
  };

  const visibleDepts = window.CDC.filterDepartments(currentUser.id);
  const role = currentUser.role;
  const isContributor = isContributorRole(role);
  const isL2 = role === 'L2' || role === 'SUB_LEAD' || role === 'DEPARTMENT_LEAD' || role === 'CENTRAL_OPS';
  const isL3orAdmin = role === 'L3' || role === 'ADMIN' || role === 'PRODUCT_OWNER';
  const isAdmin = role === 'ADMIN';

  // ── Sidebar groups (Daily Worklog / Department / Intelligence / System) ─
  const groupDaily = [
    { id: 'my-tasks', label: 'Tasks', icon: 'tasks', badge: window.CDC.filterTasks(currentUser.id).filter((tt) => tt.owner === currentUser.id && tt.status !== 'DONE' && tt.status !== 'REJECTED').length || null, badgeTone: 'amber' },
    { id: 'submit', label: 'Day-end glance', icon: 'sheet', badge: '6:00', badgeTone: 'accent' },
    { id: 'worklogs', label: 'Worklogs', icon: 'sheet' },
  ];
  const groupDept = (isL2 || isL3orAdmin) ? [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'missing', label: 'Missing reports', icon: 'tasks', badge: window.CDC.dailyStatus(currentUser.id).filter((s) => !s.submitted).length || null, badgeTone: 'amber' },
    { id: 'weekly', label: 'Weekly drafts', icon: 'weekly', badge: window.CDC.filterWeekly(currentUser.id).filter((w) => w.status === 'DRAFT').length, badgeTone: 'amber' },
    { id: 'monthly', label: 'Monthly worklogs', icon: 'weekly' },
    { id: 'second-brain', label: 'Second Brain', icon: 'sparkles' },
  ] : [];
  const groupIntel = [
    { id: 'copilot', label: 'Concierge', icon: 'copilot' },
    // Agent Farm is L3/Admin only (L1/L2 don't manage the agent catalog).
    ...(isL3orAdmin ? [{ id: 'farm', label: 'Agent Farm', icon: 'plug' }] : []),
  ];
  const groupSystem = (isL3orAdmin) ? [
    { id: 'codex', label: 'Codex', icon: 'admin' },
    { id: 'engram', label: 'Engram', icon: 'sparkles', badge: window.CDC.PROPOSALS.filter((p) => p.state === 'pending').length, badgeTone: 'amber' },
    { id: 'expense', label: 'Tool Expense Tracker', icon: 'runs' },
    { id: 'runs', label: 'AI runs', icon: 'runs' },
    { id: 'guideline', label: 'Guideline', icon: 'sheet' },
    { id: 'admin', label: 'Admin', icon: 'admin' },
  ] : [
    { id: 'guideline', label: 'Guideline', icon: 'sheet' },
  ];

  return (
    <div className="app" data-sidebar="open" data-env={t.env}>
      <Sidebar
        groupDaily={groupDaily}
        groupDept={groupDept}
        groupIntel={groupIntel}
        groupSystem={groupSystem}
        route={route}
        nav={nav}
        depts={visibleDepts}
        currentUser={currentUser}
        isContributor={isContributor}
      />
      <div className="main">
        <Topbar
          route={route}
          nav={nav}
          currentUser={currentUser}
          tweaks={t}
          setTweak={setTweak}
          authMode={authMode}
          impersonating={impersonating}
          realName={realUser && realUser.name}
          openMom={() => setMomOpen(true)}
        />
        <div className="content">
          <div className="content-inner">
            <RouteView route={route} tweaks={t} currentUser={currentUser} nav={nav} initialPrompt={copilotPrefill} />
          </div>
        </div>
      </div>

      <CDCTweaksPanel t={t} setTweak={setTweak} />
      <FeedbackFab />
      {momOpen && <MomLoader open={momOpen} onClose={() => setMomOpen(false)} currentUser={currentUser} nav={nav} />}
    </div>
  );
}

function RouteView({ route, tweaks, currentUser, nav, initialPrompt }) {
  const role = currentUser.role;
  const isL1 = role === 'L0' || role === 'L1' || role === 'TEAM_MEMBER';
  const isL2 = role === 'L2' || role === 'SUB_LEAD' || role === 'DEPARTMENT_LEAD' || role === 'CENTRAL_OPS';
  // L1/L0 users see L1Dashboard when they hit "dashboard"; L2 sees ManagerView.
  switch (route.name) {
    case 'dashboard': return isL1 ? <L1Dashboard tweaks={tweaks} currentUser={currentUser} nav={nav} /> : isL2 ? <ManagerView tweaks={tweaks} currentUser={currentUser} nav={nav} /> : <Dashboard tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'department': return <DepartmentView deptId={route.params.id} tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'copilot': return <CopilotView tweaks={tweaks} currentUser={currentUser} nav={nav} initialPrompt={initialPrompt} />;
    case 'weekly': return <WeeklyView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'missing': return <MissingReportsView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'monthly': return <MonthlyView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'tasks': return <TasksView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'my-tasks': return <TasksView tweaks={tweaks} currentUser={currentUser} nav={nav} myOnly />;
    case 'second-brain': return <SecondBrainView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'quality': return <EngramView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'runs': return <RunsView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'admin': return <AdminView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'submit': return <GlanceView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'worklogs': return <WorklogsView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'architecture': return <CodexView tweaks={tweaks} currentUser={currentUser} nav={nav} initialTab="architecture" />;
    case 'codex': return <CodexView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'expense': return <ExpenseView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'engram': return <EngramView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'farm': return <FarmView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'guideline': return <GuidelineView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    case 'team': return <ManagerView tweaks={tweaks} currentUser={currentUser} nav={nav} />;
    default: return <Dashboard tweaks={tweaks} currentUser={currentUser} nav={nav} />;
  }
}

// ── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ groupDaily, groupDept, groupIntel, groupSystem, route, nav, depts, currentUser, isContributor }) {
  const [expanded, setExpanded] = useState_a({ depts: false });

  const item = (it) => (
    <div
      key={it.id}
      className="sb-item"
      data-active={route.name === it.id}
      onClick={() => nav.go(it.id)}
    >
      <Icon name={it.icon} size={14} />
      <span>{it.label}</span>
      {it.badge ? <span className="badge" data-tone={it.badgeTone || 'accent'}>{it.badge}</span> : null}
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">re</div>
        <div className="sb-name">
          Relay
          <small>department copilot · v0.7</small>
        </div>
      </div>

      <div className="sb-nav">
        {groupDaily && groupDaily.length > 0 && (
          <>
            <div className="sb-group-title">Daily Worklog</div>
            {groupDaily.map(item)}
          </>
        )}

        {groupDept && groupDept.length > 0 && (
          <>
            <div className="sb-group-title">Department</div>
            {groupDept.map(item)}
            <div className="sb-group-title row" style={{ justifyContent: 'space-between', cursor: 'default', paddingLeft: 16 }} onClick={() => setExpanded((e) => ({ ...e, depts: !e.depts }))}>
              <span style={{ flex: 1, fontSize: 10 }}>Departments</span>
              <Icon name={expanded.depts ? 'chev-down' : 'chev-right'} size={10} />
            </div>
            {expanded.depts && depts.map((d) => (
              <div
                key={d.id}
                className="sb-item"
                data-active={route.name === 'department' && route.params.id === d.id}
                onClick={() => nav.go('department', { id: d.id })}
                style={{ paddingLeft: 18 }}
              >
                <span className="dot" />
                <span style={{ flex: 1, fontSize: 12 }}>{d.short || d.name}</span>
              </div>
            ))}
          </>
        )}

        {groupIntel && groupIntel.length > 0 && (
          <>
            <div className="sb-group-title">Intelligence</div>
            {groupIntel.map(item)}
          </>
        )}

        {groupSystem && groupSystem.length > 0 && (
          <>
            <div className="sb-group-title">System</div>
            {groupSystem.map(item)}
          </>
        )}
      </div>

      <div className="sb-foot">
        <span className="dot" data-tone="green" data-pulse="true" />
        <span>13 agents nominal</span>
        <span className="mono" style={{ marginLeft: 'auto' }}>v0.7.0</span>
      </div>
    </div>
  );
}

// ── Topbar ──────────────────────────────────────────────────────────────
function Topbar({ route, nav, currentUser, tweaks, setTweak, openMom, authMode, impersonating, realName }) {
  const [roleOpen, setRoleOpen] = useState_a(false);
  const [searchOpen, setSearchOpen] = useState_a(false);
  const authed = authMode === 'authed';
  const isAdminish = ['L3', 'ADMIN', 'Admin', 'PRODUCT_OWNER'].includes(currentUser.role) || currentUser.level === 'L3' || currentUser.level === 'Admin';
  const canSwitch = !authed || isAdminish; // non-admins can't impersonate

  const crumbs = useMemo_a(() => buildCrumbs(route, currentUser), [route, currentUser]);
  const role = currentUser.role;
  const lvl = currentUser.level || (role === 'L3' || role === 'PRODUCT_OWNER' ? 'L3' : role === 'ADMIN' ? 'Admin' : 'L2');
  const scopeLbl = window.CDC.scopeForUser(currentUser.id);
  const scopeText = scopeLbl.kind === 'all' ? 'all departments' : scopeLbl.kind === 'dept' ? (window.CDC.lookup.dept(scopeLbl.dept)?.short || 'department') : (scopeLbl.sub || 'sub-team');

  useEffect_a(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="topbar">
      <div className="tb-crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span className="tb-crumb" data-last={i === crumbs.length - 1}>{c}</span>
            {i < crumbs.length - 1 && <span className="tb-crumb-sep">/</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="tb-spacer" />
      <div className="tb-search" onClick={() => setSearchOpen(true)}>
        <Icon name="search" size={12} />
        <input placeholder="Search reports, tasks, KPIs…" readOnly />
        <kbd>⌘K</kbd>
      </div>

      <button className="btn" data-size="sm" onClick={openMom} title="Upload meeting transcript and run Scribe">
        <Icon name="sheet" size={12} /> MOM Loader
      </button>

      <span className={`env-pill`} data-env={tweaks.env}>{tweaks.env}</span>

      {impersonating && (
        <span className="row" style={{ gap: 6, fontSize: 11.5, color: 'var(--amber, #b7791f)', background: 'var(--amber-soft, #fdf6e3)', border: '1px solid var(--amber, #e8c887)', borderRadius: 8, padding: '3px 8px' }}>
          Viewing as <strong>{currentUser.name}</strong>{realName ? ` · you: ${realName}` : ''}
          <button className="btn" data-size="sm" data-variant="ghost" onClick={() => window.__RELAY && window.__RELAY.exitImpersonation()} style={{ marginLeft: 4 }}>Exit</button>
        </span>
      )}

      <button className="role-chip" onClick={() => canSwitch && setRoleOpen(true)} style={canSwitch ? undefined : { cursor: 'default' }}
        title={authed ? (canSwitch ? 'View as another user (impersonate)' : 'Signed in') : 'Switch user / role to see RBAC scope'}>
        <Avatar user={currentUser} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{currentUser.name}</span>
          <span className="role-lbl" style={{ fontSize: 10.5 }}>{lvl} · {scopeText}</span>
        </div>
        {canSwitch && <Icon name="chev-down" size={10} />}
      </button>

      {authed && (
        <button className="btn" data-size="sm" data-variant="ghost" onClick={() => window.__RELAY && window.__RELAY.signOut()} title="Sign out">
          Sign out
        </button>
      )}

      <RoleSwitcher open={roleOpen} onClose={() => setRoleOpen(false)} currentId={currentUser.id} onPick={(id) => { relayPickUser(setTweak, id); setRoleOpen(false); }} />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} nav={nav} currentUser={currentUser} />
    </div>
  );
}

function buildCrumbs(route, currentUser) {
  const CDC = window.CDC;
  switch (route.name) {
    case 'dashboard': return ['Department', 'Dashboard'];
    case 'submit': return ['Daily work', 'Day-end glance'];
    case 'my-tasks': return ['Daily work', 'My tasks'];
    case 'worklogs': return ['Daily work', 'Worklogs'];
    case 'codex': return ['System', 'Codex'];
    case 'architecture': return ['System', 'Codex', 'Architecture'];
    case 'expense': return ['System', 'Tool Expense Tracker'];
    case 'engram': return ['System', 'Engram'];
    case 'guideline': return ['System', 'Guideline'];
    case 'team': return ['Department', 'Sub Department'];
    case 'farm': return ['Intelligence', 'Agent Farm'];
    case 'copilot': return ['Intelligence', 'Concierge'];
    case 'missing': return ['Department', 'Missing reports'];
    case 'weekly': return ['Department', 'Weekly drafts'];
    case 'monthly': return ['Department', 'Monthly worklogs'];
    case 'tasks': return ['Department', 'Tasks board'];
    case 'second-brain': return ['Department', 'Second Brain'];
    case 'quality': return ['System', 'Engram'];
    case 'runs': return ['System', 'AI runs'];
    case 'admin': return ['System', 'Admin'];
    case 'department': {
      const d = CDC.lookup.dept(route.params.id);
      if (!d) return ['Department'];
      return ['Department', 'Departments', d.short || d.name];
    }
    default: return ['Relay'];
  }
}

// ── Role switcher ───────────────────────────────────────────────────────
function RoleSwitcher({ open, onClose, currentId, onPick }) {
  if (!open) return null;
  return (
    <Modal open={true} onClose={onClose} title="Switch user — preview RBAC scope" width={560}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Each role sees only data within its scope. The dashboard, Copilot context, and search results all change.
      </div>
      <div className="col" style={{ gap: 6 }}>
        {window.CDC.USERS.map((u) => {
          const scope = window.CDC.scopeForUser(u.id);
          const desc = scope.kind === 'all' ? 'All departments' :
                       scope.kind === 'dept' ? `Department: ${window.CDC.lookup.dept(scope.dept)?.name}` :
                       `Sub-team: ${scope.sub} (in ${window.CDC.lookup.dept(scope.dept)?.name})`;
          return (
            <div key={u.id} className="list-row" data-active={u.id === currentId} onClick={() => onPick(u.id)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 10 }}>
                  <Avatar user={u} size={28} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{u.name} <span className="muted" style={{ fontWeight: 400 }}>· {u.title}</span></div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{window.CDC.ROLES[u.role]?.label || u.role}</div>
                  </div>
                </div>
                <Pill tone={u.id === currentId ? 'accent' : 'outline'} dot={u.id === currentId}>{desc}</Pill>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Cmd-K Search palette ────────────────────────────────────────────────
function SearchPalette({ open, onClose, nav, currentUser }) {
  const [q, setQ] = useState_a('');
  useEffect_a(() => { if (open) setQ(''); }, [open]);
  if (!open) return null;
  const CDC = window.CDC;
  const reports = CDC.filterReports(currentUser.id);
  const tasks = CDC.filterTasks(currentUser.id);
  const kpis = CDC.filterKpis(currentUser.id);
  const depts = CDC.filterDepartments(currentUser.id);

  const lower = q.trim().toLowerCase();
  const matches = lower.length === 0 ? null : {
    depts: depts.filter((d) => d.name.toLowerCase().includes(lower)),
    reports: reports.filter((r) => {
      const a = CDC.lookup.author(r.author);
      return (a?.name + ' ' + a?.sub + ' ' + r.items.map((i) => i.text).join(' ')).toLowerCase().includes(lower);
    }).slice(0, 6),
    tasks: tasks.filter((t) => t.title.toLowerCase().includes(lower)).slice(0, 4),
    kpis: kpis.filter((k) => k.name.toLowerCase().includes(lower)).slice(0, 4),
  };

  function pick(action) { onClose(); action(); }

  return (
    <Modal open={true} onClose={onClose} title="Search" width={620}>
      <div className="row" style={{ gap: 8, marginBottom: 12, height: 38, padding: '0 12px', background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <Icon name="search" size={14} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports, tasks, KPIs, departments…" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 14, color: 'var(--text)', fontFamily: 'inherit' }} />
      </div>
      {!matches && (
        <div className="muted" style={{ fontSize: 12 }}>
          Try: <span className="code">backend</span>, <span className="code">heap-sort</span>, <span className="code">curriculum</span>, <span className="code">P0</span>, <span className="code">NAT</span>
        </div>
      )}
      {matches && (
        <div className="col" style={{ gap: 14, maxHeight: 480, overflowY: 'auto' }}>
          {matches.depts.length > 0 && (
            <div>
              <div className="detail-section" style={{ margin: '0 0 6px' }}>Departments</div>
              <div className="col" style={{ gap: 4 }}>
                {matches.depts.map((d) => (
                  <div key={d.id} className="list-row" onClick={() => pick(() => nav.go('department', { id: d.id }))}>
                    <div className="row" style={{ gap: 8 }}>
                      <Icon name="dashboard" size={12} /><span>{d.name}</span>
                      <span className="muted" style={{ fontSize: 11 }}>{d.productName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {matches.reports.length > 0 && (
            <div>
              <div className="detail-section" style={{ margin: '0 0 6px' }}>Reports ({matches.reports.length})</div>
              <div className="col" style={{ gap: 4 }}>
                {matches.reports.map((r) => {
                  const a = CDC.lookup.author(r.author);
                  return (
                    <div key={r.id} className="list-row" onClick={() => pick(() => nav.go('department', { id: r.dept }))}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div><strong>{a?.name}</strong> <span className="muted">· {a?.sub} · {r.date}</span></div>
                        <span className="mono faint" style={{ fontSize: 10.5 }}>{r.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {matches.tasks.length > 0 && (
            <div>
              <div className="detail-section" style={{ margin: '0 0 6px' }}>Tasks</div>
              <div className="col" style={{ gap: 4 }}>
                {matches.tasks.map((t) => (
                  <div key={t.id} className="list-row" onClick={() => pick(() => nav.go('tasks'))}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Pill tone={t.priority === 'P0' ? 'red' : 'amber'}>{t.priority}</Pill>
                        <span>{t.title}</span>
                      </div>
                      <Pill tone={t.status === 'SUGGESTED' ? 'amber' : 'green'}>{t.status.toLowerCase()}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {matches.kpis.length > 0 && (
            <div>
              <div className="detail-section" style={{ margin: '0 0 6px' }}>KPIs</div>
              <div className="col" style={{ gap: 4 }}>
                {matches.kpis.map((k) => (
                  <div key={k.id} className="list-row">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span>{k.name}</span>
                      <span className="mono">{k.current}{k.unit || ''} / {k.target}{k.unit || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.values(matches).every((arr) => arr.length === 0) && (
            <div className="empty">No matches in your scope.</div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Admin (placeholder) ─────────────────────────────────────────────────
function AdminView({ tweaks, currentUser }) {
  const CDC = window.CDC;
  const [view, setView] = useState_a(null);          // null | 'employees'
  const [rows, setRows] = useState_a(null);
  const [sel, setSel] = useState_a(null);
  const [loading, setLoading] = useState_a(false);
  const [source, setSource] = useState_a('');
  const [empSearch, setEmpSearch] = useState_a('');
  const [adding, setAdding] = useState_a(false);
  const isManagerAdmin = ['L3', 'Admin'].includes(currentUser.level) || ['L3', 'ADMIN', 'PRODUCT_OWNER'].includes(currentUser.role);

  // Insert a new employee. Writes to Supabase (RLS allows L3/Admin via
  // emp_admin) when signed in; always mirrors into CDC.USERS so it shows
  // immediately across the app. Returns an error string or null.
  async function saveEmployee(f) {
    const deptName = (CDC.lookup.dept(f.dept) || {}).name || f.dept || '';
    const initials = (f.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();
    const title = `${f.role_level} · ${f.sub || deptName}`;
    const data = { id: f.id, name: f.name, initials, role: f.role_level, level: f.role_level,
      dept: f.dept || null, sub: f.sub || null, title, managerId: f.manager_id || null };
    if (window.RELAY_SB) {
      const { error } = await window.RELAY_SB.from('employees').insert({
        id: f.id, email: f.email || null, name: f.name, initials, manager_id: f.manager_id || null,
        dept: f.dept || null, sub: f.sub || null, role_level: f.role_level, title,
        is_cross_dept: !!f.is_cross_dept, data,
      });
      if (error) return error.message || 'Insert failed';
    }
    // Mirror into the in-memory roster so it appears without a reload.
    (CDC.USERS || []).push({ id: f.id, name: f.name, initials, role: f.role_level, level: f.role_level,
      dept: f.dept || null, sub: f.sub || null, title, managerId: f.manager_id || null, crossDept: !!f.is_cross_dept });
    setRows((prev) => [{ id: f.id, name: f.name, email: f.email || '(no login yet)', role_level: f.role_level,
      dept: f.dept, sub: f.sub, title, manager_id: f.manager_id || null, is_cross_dept: !!f.is_cross_dept }, ...(prev || [])]);
    return null;
  }

  async function openEmployees() {
    setView('employees'); setSel(null); setLoading(true);
    const fallback = () => CDC.USERS.map((u) => ({ id: u.id, name: u.name, email: '(sign in to load)', role_level: u.level, dept: u.dept, sub: u.sub, title: u.title, manager_id: u.managerId, is_cross_dept: u.crossDept }));
    try {
      if (window.RELAY_SB) {
        const { data, error } = await window.RELAY_SB.from('employees')
          .select('id,email,name,role_level,dept,sub,title,manager_id,is_cross_dept').order('role_level');
        if (!error && data && data.length) { setRows(data); setSource('Supabase (live)'); }
        else { setRows(fallback()); setSource('bundled'); }
      } else { setRows(fallback()); setSource('bundled'); }
    } catch (e) { setRows(fallback()); setSource('bundled'); }
    setLoading(false);
  }

  const nameOf = (id) => (rows || []).find((r) => r.id === id)?.name || (CDC.lookup.user(id) || {}).name || '—';

  if (view === 'employees') {
    return (
      <div className="fadein">
        <SectionHeader title="Employees" subtitle={`Pulled from the Supabase employees table · ${rows ? rows.length : 0} records · source: ${source || '…'}`}
          actions={<>
            {isManagerAdmin && <button className="btn" data-size="sm" data-variant="primary" onClick={() => setAdding(true)}><Icon name="check" size={12} /> Add employee</button>}
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => setView(null)}>← Admin</button>
          </>} />
        {loading && <div className="muted">Loading…</div>}
        <div className="split" style={{ height: 'calc(100vh - 200px)' }}>
          <div className="split-list">
            <div style={{ padding: 8, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <input className="tb-search" placeholder="Search name, EMP ID, sub-dept, level…" value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                style={{ width: '100%', fontSize: 12.5, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)' }} />
            </div>
            {(rows || [])
              .filter((r) => {
                const q = empSearch.trim().toLowerCase();
                if (!q) return true;
                return [r.name, r.id, r.sub, r.role_level, r.title, (CDC.lookup.dept(r.dept) || {}).name, r.dept]
                  .filter(Boolean).join(' ').toLowerCase().includes(q);
              })
              .map((r) => (
              <div key={r.id} className="list-row" data-active={sel === r.id} onClick={() => setSel(r.id)}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                  <Pill tone={r.role_level === 'L3' ? 'accent' : r.role_level === 'Admin' ? 'amber' : 'outline'}>{r.role_level}</Pill>
                </div>
                <div className="muted mono" style={{ fontSize: 10.5 }}>{r.id} · {r.sub || (CDC.lookup.dept(r.dept) || {}).name || r.dept}</div>
              </div>
            ))}
          </div>
          <div className="split-pane">
            {sel ? (() => {
              const r = rows.find((x) => x.id === sel);
              return (
                <div className="detail-b">
                  <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>{r.name}</h3>
                  <dl className="kv" style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 13 }}>
                    <dt className="muted">EMP ID</dt><dd className="mono">{r.id}</dd>
                    <dt className="muted">Email</dt><dd className="mono">{r.email}</dd>
                    <dt className="muted">Role level</dt><dd>{r.role_level}</dd>
                    <dt className="muted">Title</dt><dd>{r.title}</dd>
                    <dt className="muted">Department</dt><dd>{(CDC.lookup.dept(r.dept) || {}).name || r.dept || '—'}</dd>
                    <dt className="muted">Sub Department</dt><dd>{r.sub || '—'}</dd>
                    <dt className="muted">Reports to</dt><dd>{r.manager_id ? nameOf(r.manager_id) : '—'}</dd>
                    <dt className="muted">Cross-dept</dt><dd>{r.is_cross_dept ? 'yes' : 'no'}</dd>
                  </dl>
                </div>
              );
            })() : <div className="empty">Select an employee.</div>}
          </div>
        </div>
        <AddEmployeeModal open={adding} onClose={() => setAdding(false)} onSave={saveEmployee}
          people={CDC.USERS} depts={CDC.DEPARTMENTS} live={!!window.RELAY_SB} />
      </div>
    );
  }

  if (view === 'masterdata') return <AdminMasterData CDC={CDC} onBack={() => setView(null)} />;
  if (view === 'kpis') return <AdminKpiCatalog CDC={CDC} onBack={() => setView(null)} />;
  if (view === 'audit') return <AdminAuditLog CDC={CDC} onBack={() => setView(null)} />;
  if (view === 'imports') return <AdminImports CDC={CDC} onBack={() => setView(null)} />;
  if (view === 'mcp') return <AdminMcpTokens CDC={CDC} me={currentUser} onBack={() => setView(null)} />;

  return (
    <div className="fadein">
      <SectionHeader title="Admin" subtitle="Master data, employees, system settings." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { t: 'Employees', d: `${CDC.USERS.length} users · click to view details from Supabase`, action: openEmployees },
          { t: 'Master data', d: 'Business directions, products, departments, sub-teams', action: () => setView('masterdata') },
          { t: 'KPI catalog', d: 'KPIs · formulas versioned server-side', action: () => setView('kpis') },
          { t: 'Imports', d: 'Daily reports + monthly KPIs · nightly @ 23:30 IST', action: () => setView('imports') },
          { t: 'MCP tokens', d: 'Personal access tokens for Claude Desktop / Cursor', action: () => setView('mcp') },
          { t: 'Audit log', d: 'Every read & write · ranged search', action: () => setView('audit') },
        ].map((c, i) => (
          <Card key={i} title={c.t}>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{c.d}</div>
            <button className="btn" data-size="sm" onClick={c.action || undefined}>Open →</button>
          </Card>
        ))}
      </div>
    </div>
  );
}
window.AdminView = AdminView;

// Shared header for an Admin sub-view: title + "← Admin" back button.
function AdminSubHeader({ title, subtitle, onBack, actions }) {
  return (
    <SectionHeader title={title} subtitle={subtitle}
      actions={<>{actions}<button className="btn" data-size="sm" data-variant="ghost" onClick={onBack}>← Admin</button></>} />
  );
}

// Master data — read-only tree of business directions → products → departments → sub-teams.
function AdminMasterData({ CDC, onBack }) {
  const bds = CDC.BUSINESS_DIRECTIONS || [];
  const deptCount = (CDC.DEPARTMENTS || []).length;
  const subCount = (CDC.DEPARTMENTS || []).reduce((s, d) => s + ((d.subs || []).length), 0);
  return (
    <div className="fadein">
      <AdminSubHeader title="Master data" onBack={onBack}
        subtitle={`${bds.length} business direction(s) · ${deptCount} departments · ${subCount} sub-teams`} />
      <div className="col" style={{ gap: 12 }}>
        {bds.map((bd) => (
          <Card key={bd.id} title={bd.name}>
            <div className="col" style={{ gap: 10 }}>
              {(bd.products || []).map((p) => (
                <div key={p.id}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 4 }}>{p.name}</div>
                  <div className="col" style={{ gap: 4, paddingLeft: 10 }}>
                    {(p.departments || []).map((d) => (
                      <div key={d.id} style={{ fontSize: 12.5 }}>
                        <span className="mono muted" style={{ fontSize: 10.5 }}>{d.id}</span>{' '}
                        <strong>{d.name}</strong>
                        <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                          {(d.subs || []).map((s) => <span key={s} className="agent-tool" style={{ fontSize: 10.5 }}>{s}</span>)}
                          {!(d.subs || []).length && <span className="muted" style={{ fontSize: 11 }}>flat — no sub-teams</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {!bds.length && <div className="empty">No master data loaded.</div>}
      </div>
    </div>
  );
}

// KPI catalog — read-only table of KPIs with target/current/status/owner.
function AdminKpiCatalog({ CDC, onBack }) {
  const kpis = CDC.KPIS || [];
  const dept = (id) => (CDC.lookup.dept(id) || {}).short || (CDC.lookup.dept(id) || {}).name || id;
  const owner = (id) => (CDC.lookup.user(id) || {}).name || id || '—';
  return (
    <div className="fadein">
      <AdminSubHeader title="KPI catalog" onBack={onBack} subtitle={`${kpis.length} KPIs · formulas versioned server-side`} />
      {kpis.length ? (
        <table className="tbl">
          <thead><tr><th>KPI</th><th>Department</th><th className="num">Target</th><th className="num">Current</th><th>Status</th><th>Owner</th></tr></thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>{dept(k.dept)}</td>
                <td className="num mono">{k.target}{k.unit}</td>
                <td className="num mono">{k.current}{k.unit}</td>
                <td><Pill tone={k.status === 'green' ? 'green' : k.status === 'amber' ? 'amber' : 'red'} dot>{k.status}</Pill></td>
                <td>{owner(k.owner)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">No KPIs loaded.</div>}
    </div>
  );
}

// Audit log — unified, searchable feed of activity + engram (read & write) events.
function AdminAuditLog({ CDC, onBack }) {
  const [q, setQ] = useState_a('');
  const [kind, setKind] = useState_a('all');
  const events = useMemo_a(() => {
    const acts = (CDC.ACTIVITY || []).map((a) => ({ id: a.id, ts: a.ts, kind: a.kind || 'event', text: a.text, src: 'activity' }));
    const eng = (CDC.ENGRAM || []).map((e) => ({ id: e.id, ts: (e.ts || '').slice(11) || e.ts, kind: 'engram', text: `${e.agent || 'agent'} · ${e.action}${e.inputRef ? ` · ${e.inputRef}` : ''}${e.reason ? ` — ${e.reason}` : ''}`, src: 'engram' }));
    return [...eng, ...acts];
  }, [CDC.ACTIVITY, CDC.ENGRAM]);
  const kinds = ['all', ...new Set(events.map((e) => e.kind))];
  const filtered = events.filter((e) => {
    if (kind !== 'all' && e.kind !== kind) return false;
    const s = q.trim().toLowerCase();
    return !s || (e.text || '').toLowerCase().includes(s);
  });
  return (
    <div className="fadein">
      <AdminSubHeader title="Audit log" onBack={onBack} subtitle={`${events.length} events · activity + engram (reads & writes)`} />
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="tb-search" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200, fontSize: 12.5, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <div className="seg">{kinds.map((k) => <button key={k} data-active={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
      </div>
      {filtered.length ? (
        <div className="col" style={{ gap: 2 }}>
          {filtered.map((e) => (
            <div key={e.id} className="row" style={{ gap: 10, padding: '7px 4px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span className="mono muted" style={{ width: 56, flexShrink: 0 }}>{e.ts || '—'}</span>
              <Pill tone="outline">{e.kind}</Pill>
              <span style={{ flex: 1, minWidth: 0 }}>{e.text}</span>
            </div>
          ))}
        </div>
      ) : <div className="empty">No events match. The log fills as people submit reports and agents run.</div>}
    </div>
  );
}

// Imports — show data source + collection counts; re-pull from Supabase on demand.
function AdminImports({ CDC, onBack }) {
  const [busy, setBusy] = useState_a(false);
  const [msg, setMsg] = useState_a('');
  const counts = [
    ['Employees', (CDC.USERS || []).length], ['Daily reports', (CDC.REPORTS || []).length],
    ['Worklogs', (CDC.WORKLOGS || []).length], ['Tasks', (CDC.TASKS || []).length],
    ['KPIs', (CDC.KPIS || []).length], ['Weekly summaries', (CDC.WEEKLY || []).length],
  ];
  async function reload() {
    if (!CDC.loadFromSupabase) { setMsg('No Supabase client — running on bundled data.'); return; }
    setBusy(true); setMsg('');
    try { const ok = await CDC.loadFromSupabase(); setMsg(ok ? 'Reloaded from Supabase ✓' : 'Nothing returned (check sign-in / RLS).'); }
    catch (e) { setMsg('Reload failed: ' + (e.message || e)); }
    setBusy(false);
  }
  return (
    <div className="fadein">
      <AdminSubHeader title="Imports" onBack={onBack} subtitle="Daily reports + monthly KPIs · nightly @ 23:30 IST"
        actions={<button className="btn" data-size="sm" data-variant="primary" disabled={busy} onClick={reload}><Icon name="runs" size={12} /> {busy ? 'Reloading…' : 'Reload now'}</button>} />
      <Card title="Current data source">
        <div className="row" style={{ gap: 8 }}>
          <Pill tone={CDC.__source === 'supabase' ? 'green' : 'amber'} dot>{CDC.__source || 'unknown'}</Pill>
          <span className="muted" style={{ fontSize: 12.5 }}>{CDC.__source === 'supabase' ? 'Live rows loaded via RLS-scoped queries.' : 'Bundled seed data (not signed in or RLS returned nothing).'}</span>
        </div>
        {msg && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{msg}</div>}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        {counts.map(([label, n]) => (
          <div key={label} className="kpi-tile"><div className="kpi-name">{label}</div><div className="kpi-value">{n}</div></div>
        ))}
      </div>
    </div>
  );
}

// MCP tokens — personal access tokens for Claude Desktop / Cursor. Issuance needs
// a backend; until then these are local demo tokens stored in this browser only.
function AdminMcpTokens({ CDC, me, onBack }) {
  const KEY = 'relay_mcp_tokens';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const [tokens, setTokens] = useState_a(read);
  const [label, setLabel] = useState_a('');
  const save = (list) => { localStorage.setItem(KEY, JSON.stringify(list)); setTokens(list); };
  const rand = () => 'relay_pat_' + Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  function create() {
    const t = { id: rand().slice(0, 12), label: label.trim() || 'Claude Desktop', token: rand(), owner: me.id, created: (window.CDC.fmt ? window.CDC.fmt(window.CDC.today) : new Date().toISOString().slice(0, 10)) };
    save([t, ...tokens]); setLabel('');
  }
  const revoke = (id) => save(tokens.filter((t) => t.id !== id));
  return (
    <div className="fadein">
      <AdminSubHeader title="MCP tokens" onBack={onBack} subtitle="Personal access tokens for Claude Desktop / Cursor" />
      <Card title="Demo tokens (local to this browser)">
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Real PAT issuance needs a backend token service. These tokens are generated and stored in <span className="mono">localStorage</span> for demo only — they don't authenticate against any server yet.
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input-text" style={{ flex: 1 }} placeholder="Label (e.g. My laptop · Cursor)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn" data-size="sm" data-variant="primary" onClick={create}><Icon name="check" size={12} /> Generate token</button>
        </div>
      </Card>
      <div className="col" style={{ gap: 6, marginTop: 12 }}>
        {tokens.map((t) => (
          <div key={t.id} className="row" style={{ gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{t.label}</div>
              <div className="mono muted" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.token}</div>
            </div>
            <span className="muted mono" style={{ fontSize: 10.5 }}>{t.created}</span>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(t.token); }}>Copy</button>
            <button className="btn" data-size="sm" data-variant="ghost" onClick={() => revoke(t.id)}>Revoke</button>
          </div>
        ))}
        {!tokens.length && <div className="empty">No tokens yet. Generate one above.</div>}
      </div>
    </div>
  );
}

// ── Add-employee modal (Admin / L3) ───────────────────────────────────────
function AddEmployeeModal({ open, onClose, onSave, people, depts, live }) {
  const blank = { id: '', name: '', email: '', role_level: 'L1', dept: '', sub: '', manager_id: '', is_cross_dept: false };
  const [f, setF] = useState_a(blank);
  const [err, setErr] = useState_a('');
  const [busy, setBusy] = useState_a(false);
  useEffect_a(() => { if (open) { setF(blank); setErr(''); setBusy(false); } }, [open]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const managers = (people || []).filter((u) => ['L2', 'L3', 'Admin'].includes(u.level));
  const valid = /^\S+$/.test(f.id.trim()) && f.name.trim() && f.role_level;
  const lbl = () => ({ fontSize: 11.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, fontWeight: 600, marginBottom: 4 });
  const inp = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)' };

  async function submit() {
    setBusy(true); setErr('');
    const error = await onSave({ ...f, id: f.id.trim(), name: f.name.trim(), email: f.email.trim() });
    setBusy(false);
    if (error) { setErr(error); return; }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add employee" width={620}
      footer={<>
        <span className="muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>
          {err ? <span style={{ color: 'var(--red, #e5484d)' }}>{err}</span>
            : live ? 'Saves to Supabase (live)' : 'Demo mode — saved locally only'}
        </span>
        <button className="btn" data-variant="ghost" onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Saving…' : 'Add employee'}</button>
      </>}
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={lbl()}>EMP ID <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
            <input value={f.id} onChange={(e) => set('id', e.target.value)} placeholder="e.g. NW0006701" style={inp} />
          </div>
          <div style={{ flex: '2 1 220px' }}>
            <div style={lbl()}>Name <span style={{ color: 'var(--red, #e5484d)' }}>*</span></div>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" style={inp} />
          </div>
        </div>
        <div>
          <div style={lbl()}>Email <span className="muted" style={{ textTransform: 'none', fontWeight: 400 }}>· used for login link</span></div>
          <input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="first.last@nxtwave.co.in" style={inp} />
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px' }}>
            <div style={lbl()}>Role level</div>
            <select value={f.role_level} onChange={(e) => set('role_level', e.target.value)} style={inp}>
              {['L0', 'L1', 'L2', 'L3', 'Admin'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={lbl()}>Department</div>
            <select value={f.dept} onChange={(e) => set('dept', e.target.value)} style={inp}>
              <option value="">—</option>
              {(depts || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={lbl()}>Sub-department</div>
            <input value={f.sub} onChange={(e) => set('sub', e.target.value)} placeholder="e.g. Content — Fullstack" style={inp} />
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <div style={lbl()}>Reports to</div>
            <select value={f.manager_id} onChange={(e) => set('manager_id', e.target.value)} style={inp}>
              <option value="">—</option>
              {managers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.level} · {u.sub || u.dept}</option>)}
            </select>
          </div>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 13, alignItems: 'center' }}>
          <input type="checkbox" checked={f.is_cross_dept} onChange={(e) => set('is_cross_dept', e.target.checked)} />
          Cross-department (sees all teams)
        </label>
      </div>
    </Modal>
  );
}
window.AddEmployeeModal = AddEmployeeModal;

// ── Tweaks panel ────────────────────────────────────────────────────────
function CDCTweaksPanel({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Theme" />
      <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
      <TweakColor
        label="Accent"
        value={t.accent === 'indigo' ? '#6366f1' : t.accent === 'emerald' ? '#10b981' : t.accent === 'amber' ? '#d97706' : '#e11d48'}
        options={['#6366f1', '#10b981', '#d97706', '#e11d48']}
        onChange={(hex) => {
          const map = { '#6366f1': 'indigo', '#10b981': 'emerald', '#d97706': 'amber', '#e11d48': 'rose' };
          setTweak('accent', map[hex] || 'indigo');
        }}
      />

      <TweakSection label="Layout" />
      <TweakRadio label="Density" value={t.density} options={['compact', 'cozy', 'comfortable']} onChange={(v) => setTweak('density', v)} />
      <TweakToggle label="Mono numerals" value={t.mononum} onChange={(v) => setTweak('mononum', v)} />

      <TweakSection label="RAG treatment" />
      <TweakRadio label="Style" value={t.rag} options={['numeric', 'border', 'tint', 'dot']} onChange={(v) => setTweak('rag', v)} />

      <TweakSection label="AI surfaces" />
      <TweakToggle label="Show confidence chips" value={t.confidence} onChange={(v) => setTweak('confidence', v)} />

      <TweakSection label="Environment" />
      <TweakRadio label="Active env" value={t.env} options={['beta', 'prod']} onChange={(v) => setTweak('env', v)} />

      <TweakSection label="Concierge" />
      <TweakText label="OpenRouter key" value={t.openrouterKey} placeholder="sk-or-…" onChange={(v) => setTweak('openrouterKey', v)} />

      <TweakSection label="User scope (RBAC)" />
      <TweakSelect label="Acting as" value={t.userId}
        options={window.CDC.USERS.map((u) => ({ value: u.id, label: `${u.name} — ${(window.CDC.ROLES[u.role] || {}).label || u.level}` }))}
        onChange={(v) => relayPickUser(setTweak, v)}
      />
    </TweaksPanel>
  );
}

// Route impersonation (authed) vs demo role switch in one place.
function relayPickUser(setTweak, id) {
  if (window.__RELAY && window.__RELAY.authed) { window.__RELAY.impersonate(id); }
  else { setTweak('userId', id); }
}

// Mount — gate on a Supabase session: signed in → real scoped data + login as that
// employee; otherwise show the login screen (with a demo-mode bypass).
(async () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  let me = null, real = null, authMode = 'demo';
  try {
    if (window.CDC && window.CDC.auth) {
      const { data } = await window.CDC.auth.session();
      if (data && data.session) {
        me = await window.CDC.whoami();
        real = window.CDC.whoamiReal ? await window.CDC.whoamiReal() : me;
        if (me) { authMode = 'authed'; await window.CDC.loadFromSupabase(); }
      }
    }
  } catch (e) { console.warn('[Relay] session check failed', e); }

  if (authMode === 'authed') {
    const impersonating = !!(me && real && me.id !== real.id);
    root.render(<App authMode="authed" me={me} realUser={real} impersonating={impersonating} />);
  } else {
    root.render(<LoginScreen onAuthed={() => location.reload()} onDemo={() => root.render(<App authMode="demo" me={null} />)} />);
  }
})();
