// Relay — Supabase client, data loader (Phase 2), auth (Phase 3), writes (Phase 4).
// Reads load scoped rows into window.CDC; writes go through window.CDC.db, which
// updates the in-memory collections optimistically AND persists to Supabase when
// signed in. In demo mode (no Supabase / not authed) writes are local-only, so the
// prototype still works offline.
(function () {
  const SUPABASE_URL = 'https://fzwgdiphjehecsizvwyl.supabase.co';
  // Publishable anon key — safe in the browser; RLS is the security boundary.
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d2dkaXBoamVoZWNzaXp2d3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTU3MjYsImV4cCI6MjA5NTMzMTcyNn0.jqMxmf4x1sJc2j8wxfMoW_OsH4nwjtfALk0pCUhinBI';

  const hasSb = !!(window.supabase && window.supabase.createClient);
  const sb = hasSb ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  if (!sb) console.warn('[Relay] supabase-js not loaded; running local/demo only.');
  if (sb) window.RELAY_SB = sb;

  const authed = () => !!(window.__RELAY && window.__RELAY.authed);
  const pad = (n) => String(n).padStart(2, '0');
  // Format the current moment in IST regardless of where the runtime lives
  // (Supabase Edge Functions run in UTC; users' browsers can be anywhere).
  const IST_FMT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const nowStr = () => {
    const parts = IST_FMT.formatToParts(new Date()).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} IST`;
  };
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // ── Reads: load scoped rows into the existing window.CDC collections ──────
  const ARRAY_MAP = {
    employees: 'USERS', business_directions: 'BUSINESS_DIRECTIONS', departments: 'DEPARTMENTS',
    kpis: 'KPIS', daily_reports: 'REPORTS', worklogs: 'WORKLOGS', tasks: 'TASKS', flags: 'FLAGS',
    weekly_summaries: 'WEEKLY', weekly_comments: 'WEEKLY_COMMENTS', moms: 'MOMS',
    engram_interactions: 'ENGRAM', eval_sets: 'EVAL_SETS', guideline_proposals: 'PROPOSALS',
    farm_agents: 'FARM_AGENTS', relay_agents: 'RELAY_AGENTS', codex_workflows: 'CODEX_WORKFLOWS',
    codex_guidelines: 'CODEX_GUIDELINES', ai_runs: 'AI_RUNS', activity: 'ACTIVITY',
    knowledge_docs: 'KNOWLEDGE', weekly_digests: 'WEEKLY_DIGESTS',
    recommendations: 'RECOMMENDATIONS', nonpayroll_expense: 'NONPAYROLL_EXPENSE',
    goals: 'GOALS',
    roadmap_drafts: 'ROADMAP_DRAFTS',
    app_feedback: 'FEEDBACK',
  };
  if (!Array.isArray(window.CDC.GOALS)) window.CDC.GOALS = [];
  if (!Array.isArray(window.CDC.ROADMAP_DRAFTS)) window.CDC.ROADMAP_DRAFTS = [];
  if (!Array.isArray(window.CDC.FEEDBACK)) window.CDC.FEEDBACK = [];
  if (!Array.isArray(window.CDC.NONPAYROLL_EXPENSE)) window.CDC.NONPAYROLL_EXPENSE = [];
  if (!Array.isArray(window.CDC.KNOWLEDGE)) window.CDC.KNOWLEDGE = [];
  if (!Array.isArray(window.CDC.WEEKLY_DIGESTS)) window.CDC.WEEKLY_DIGESTS = [];
  if (!Array.isArray(window.CDC.RECOMMENDATIONS)) window.CDC.RECOMMENDATIONS = [];
  function fillArray(cdcKey, items) { const a = window.CDC[cdcKey]; if (!Array.isArray(a)) return; a.length = 0; for (const it of items) a.push(it); }
  function fillObject(obj, next) { if (!obj) return; for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, next); }
  // Recompute each row's `daysAgo` from its real date relative to today, so the
  // stored (creation-time) value can't keep an old entry looking like "today".
  function reAge(rows) {
    if (!Array.isArray(rows)) return;
    const todayStr = window.CDC.fmt(window.CDC.today);
    const t0 = new Date(todayStr).getTime();
    for (const r of rows) {
      const d = r.date || r.work_date;
      if (d) r.daysAgo = Math.round((t0 - new Date(d).getTime()) / 86400000);
    }
  }

  // Tables observed (this session) to lack created_at — see selectAll.
  const noOrderTables = new Set();

  async function loadFromSupabase() {
    if (!sb || !window.CDC) return false;
    let loadedAny = false;
    const tables = Object.keys(ARRAY_MAP);
    // Newest-first: the UI relies on array order (everything unshifts on write),
    // but an unordered select returns rows arbitrarily after a reload — which is
    // how Engram/AI-run timestamps ended up looking shuffled. Fall back to an
    // unordered read for any table without created_at.
    // PostgREST silently caps un-ranged selects at 1000 rows — page until a
    // short page so big tables (worklogs, activity) aren't silently truncated.
    const PAGE = 1000;
    const selectAll = async (t) => {
      const fetchPage = (ordered, from) => {
        let q = sb.from(t).select('data');
        if (ordered) q = q.order('created_at', { ascending: false });
        return q.range(from, from + PAGE - 1);
      };
      // Tables without created_at 400 on the ordered query — remember them so
      // every 20s poll doesn't re-fire a known-failing request (console noise).
      let ordered = !noOrderTables.has(t);
      let res = await fetchPage(ordered, 0);
      if (res.error && ordered) { ordered = false; noOrderTables.add(t); res = await fetchPage(false, 0); }
      if (res.error) return res;
      const rows = res.data || [];
      while (res.data && res.data.length === PAGE) {
        res = await fetchPage(ordered, rows.length);
        if (res.error) break;
        rows.push(...(res.data || []));
      }
      return { data: rows, error: null };
    };
    const settled = await Promise.all(tables.map(async (t) => ({ t, res: await selectAll(t) })));
    for (const { t, res } of settled) {
      if (res.error) { console.warn('[Relay]', t, '—', res.error.message); continue; }
      if (res.data && res.data.length) { fillArray(ARRAY_MAP[t], res.data.map((r) => r.data)); loadedAny = true; }
    }
    // Worklogs/reports persist a STATIC daysAgo (0 at creation), but the
    // dashboard's today/7-day windows filter on daysAgo — so without this an
    // old entry keeps counting as "today". Recompute daysAgo from the real date
    // so day-wise metrics only show what was actually logged that day.
    reAge(window.CDC.WORKLOGS);
    reAge(window.CDC.REPORTS);
    const dh = await sb.from('dept_health').select('id,data');
    if (dh.data && dh.data.length) { const o = {}; dh.data.forEach((r) => { o[r.id] = r.data; }); fillObject(window.CDC.DEPT_HEALTH, o); loadedAny = true; }
    const ex = await sb.from('expense_doc').select('data').eq('id', 'current').maybeSingle();
    if (ex.data && ex.data.data) fillObject(window.CDC.EXPENSE, ex.data.data);
    const ad = await sb.from('app_docs').select('key,data');
    if (ad.data) ad.data.forEach((r) => {
      if (r.key === 'roles') fillObject(window.CDC.ROLES, r.data);
      // Admin-edited task catalog (products / stacks / output categories).
      if (r.key === 'task_catalog' && window.CDC.applyTaskCatalog) window.CDC.applyTaskCatalog(r.data);
    });
    window.CDC.__source = loadedAny ? 'supabase' : 'bundled';
    console.log('[Relay] data source:', window.CDC.__source);
    return loadedAny;
  }

  // Capture the password-recovery deep link BEFORE supabase-js consumes the URL
  // hash (it strips #access_token…&type=recovery while establishing the session).
  // app.jsx reads this flag at mount to show the "set a new password" screen.
  if (/type=recovery/.test(location.hash)) window.__RELAY_RECOVERY = true;
  if (sb) sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') window.__RELAY_RECOVERY = true; });

  if (sb) {
    window.CDC.auth = {
      signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
      // Microsoft (Azure AD) SSO. Supabase creates the auth.users row with the
      // user's MS email; the link_auth_user trigger (05_auth.sql) matches it to
      // employees.email — so SSO users must already be on the roster with that
      // exact email. Redirects to the provider, then back to this page.
      signInWithMicrosoft: () => sb.auth.signInWithOAuth({
        provider: 'azure',
        options: { scopes: 'email openid profile', redirectTo: location.origin + location.pathname },
      }),
      // Google Workspace SSO ("company Gmail"). Same roster gate as Microsoft:
      // the link_auth_user trigger (05_auth.sql) matches the Google email to an
      // employees.email row, so the user must already be on the roster.
      // hd= hints Google to pre-pick the nxtwave.co.in domain; it's a UX nudge, NOT
      // the security boundary (the roster trigger is). ponytail: hardcoded hd, lift
      // to a config value only if a second workspace domain ever appears.
      signInWithGoogle: () => sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'email openid profile',
          queryParams: { hd: 'nxtwave.co.in', prompt: 'select_account' },
          redirectTo: location.origin + location.pathname,
        },
      }),
      signOut: () => sb.auth.signOut(),
      session: () => sb.auth.getSession(),
      onChange: (cb) => sb.auth.onAuthStateChange(cb),
      // Signed-in user sets a new password (no email round-trip needed).
      changePassword: (password) => sb.auth.updateUser({ password }),
      // Forgot-password: emails a recovery link that lands back on this page,
      // where the __RELAY_RECOVERY flag routes to the set-new-password screen.
      resetPassword: (email) => sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname,
      }),
      // Self-serve signup ("Request access"): gated to rostered employees via
      // the email_has_access RPC (18_signup_access.sql) — the email must exist
      // on an employees row added in the app. With "Confirm email" OFF in the
      // dashboard, signUp returns a live session immediately (instant access).
      signUp: async (email, password) => {
        const { data: gate, error: gateErr } = await sb.rpc('email_has_access', { p_email: email });
        if (gateErr) return { error: gateErr };
        if (!gate || !gate.allowed) return { error: { message: 'This email is not in the employee roster yet — ask your admin to add you under Roles & Master data first.' } };
        if (gate.already) return { error: { message: 'An account already exists for this email — use Sign in (or "Forgot password?").' } };
        return sb.auth.signUp({ email, password });
      },
      // Audit trail: account-activation / password-change events land in the
      // activity feed (admin-visible). Only the event is recorded — the
      // password itself lives hashed in Supabase Auth, never in plaintext.
      logAuthEvent: async (text) => {
        try {
          const me = window.CDC.whoami ? await window.CDC.whoami() : null;
          const row = { id: rid('act-'), kind: 'auth', ts: nowStr(),
            text: `${(me && me.name) || 'A user'} ${text}`, icon: '🔐' };
          if (Array.isArray(window.CDC.ACTIVITY)) window.CDC.ACTIVITY.unshift(row);
          await sb.from('activity').insert({ id: row.id, data: row });
        } catch (e) { console.warn('[Relay] auth audit:', e.message || e); }
      },
    };
    window.CDC.whoami = async () => { const { data, error } = await sb.rpc('whoami'); if (error) { console.warn('[Relay] whoami:', error.message); return null; } return data || null; };
    window.CDC.whoamiReal = async () => { const { data, error } = await sb.rpc('whoami_real'); if (error) { return null; } return data || null; };
    window.CDC.setImpersonation = (empId) => sb.rpc('set_impersonation', { p_emp_id: empId ?? null });
    window.CDC.loadFromSupabase = loadFromSupabase;

    // Phase 5 — real agents via the relay-agent Edge Function (OpenRouter proxy).
    window.CDC.askAgent = async ({ messages, model, agent }) => {
      const { data, error } = await sb.functions.invoke('relay-agent', { body: { messages, model: model || 'smart', agent } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return data; // { content, model, usage }
    };
    // Exact key spend from OpenRouter (proxied server-side; key never reaches the browser).
    window.CDC.fetchOpenRouterSpend = async () => {
      const { data, error } = await sb.functions.invoke('relay-agent', { body: { action: 'spend' } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return data; // { usage, limit, limit_remaining, ... }
    };
  }

  // ── Direct OpenRouter fallback (tier 2) — works without Supabase ────
  // Calls OpenRouter's chat/completions API from the browser (CORS supported).
  // Key is stored in localStorage under 'relay_openrouter_key'.
  async function directOpenRouter({ messages, model }) {
    const key = localStorage.getItem('relay_openrouter_key');
    if (!key) throw new Error('no OpenRouter key');
    const modelMap = { smart: 'anthropic/claude-sonnet-4-20250514', fast: 'anthropic/claude-3-5-haiku-20241022' };
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'HTTP-Referer': location.origin, 'X-Title': 'Relay Concierge' },
      body: JSON.stringify({ model: modelMap[model] || modelMap.smart, messages }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 120)}`); }
    const data = await res.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) throw new Error('empty OpenRouter response');
    return { content: choice.message.content, model: data.model, usage: data.usage };
  }
  window.CDC.directOpenRouter = directOpenRouter;

  // ── Concierge completion: 3-tier fallback chain ─────────────────────
  // 1. Edge Function (askAgent) — authed users with Supabase
  // 2. Direct browser-to-OpenRouter — demo users with API key
  // 3. Offline keyword shim — always works, canned responses
  // ── Per-million-token pricing (USD) for the models we call via OpenRouter.
  // Keep aligned with the modelMap above and Anthropic's published rates.
  // 'in' = prompt tokens, 'out' = completion tokens.
  // Rates verified against OpenRouter (Jun 2026). The Edge Function routes
  // 'smart'→sonnet-4.6 ($3/$15) and 'fast'→haiku-4.5 ($1/$5); run() prices by
  // the alias. Slug keys cover the direct-OpenRouter fallback path.
  const MODEL_PRICES = {
    smart:                                  { in: 3.00, out: 15.00 }, // Claude Sonnet 4.6
    fast:                                   { in: 1.00, out:  5.00 }, // Claude Haiku 4.5
    'anthropic/claude-sonnet-4.6':          { in: 3.00, out: 15.00 },
    'anthropic/claude-haiku-4.5':           { in: 1.00, out:  5.00 },
    'anthropic/claude-sonnet-4-20250514':   { in: 3.00, out: 15.00 },
    'anthropic/claude-3-5-haiku-20241022':  { in: 0.80, out:  4.00 },
  };
  // Served model ids can be dated variants (e.g. anthropic/claude-4.5-haiku-20251001)
  // that aren't literal keys in the table — classify by family before defaulting.
  const priceFor = (m) => MODEL_PRICES[m] || (/haiku/i.test(m || '') ? MODEL_PRICES.fast : MODEL_PRICES.smart);
  const computeCost = (model, tokensIn, tokensOut) => {
    const p = priceFor(model);
    return ((tokensIn || 0) * p.in + (tokensOut || 0) * p.out) / 1_000_000;
  };
  window.CDC.computeCost = computeCost;

  // Lightweight, theme-friendly toast for transient confirmations (e.g. the
  // remaining-hours nudge after logging a task). tone: amber | green | info | red.
  window.CDC.toast = function (msg, tone) {
    try {
      // Theme-token surface + a colored accent border so dark mode isn't
      // blasted with light-mode hex chips.
      const accent = {
        amber: 'var(--amber, #b7791f)',
        green: 'var(--green, #1e7e34)',
        red:   'var(--red, #b3261e)',
        info:  'var(--accent, #1d4ed8)',
      }[tone] || 'var(--accent, #1d4ed8)';
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;' +
        `background:var(--surface, #fff);color:var(--text, #222);border:1px solid var(--border, #ddd);border-left:3px solid ${accent};border-radius:10px;` +
        'padding:11px 18px;font:13px/1.45 system-ui,sans-serif;font-weight:500;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.16);max-width:92vw;text-align:center';
      document.body.appendChild(el);
      setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 4200);
      setTimeout(() => el.remove(), 4700);
    } catch (_) { /* headless/test contexts */ }
  };

  const offlineShim = (window.claude && window.claude.complete) || null;
  window.claude = window.claude || {};
  // Returns { content, model, usage, path } so callers can log/display real
  // token usage. path: 'edge' | 'direct' | 'offline' | 'none'.
  window.claude.complete = async ({ messages }) => {
    // Tier 1: Edge Function
    if (window.CDC.askAgent) {
      try {
        const r = await window.CDC.askAgent({ messages, model: 'smart' });
        if (r && r.content) return { content: r.content, model: r.model || 'smart', usage: r.usage || null, path: 'edge' };
      } catch (e) {
        console.warn('[Relay] askAgent failed, trying OpenRouter:', e.message || e);
      }
    }
    // Tier 2: Direct OpenRouter
    try {
      const r = await directOpenRouter({ messages, model: 'smart' });
      if (r && r.content) return { content: r.content, model: r.model || 'smart', usage: r.usage || null, path: 'direct' };
    } catch (e) {
      console.warn('[Relay] OpenRouter failed, falling back to offline shim:', e.message || e);
    }
    // Tier 3: Offline keyword shim
    if (offlineShim) return { content: await offlineShim({ messages }), model: 'offline-shim', usage: null, path: 'offline' };
    return { content: '[error] No LLM backend available. Paste an OpenRouter API key in the Concierge header to enable real responses.', model: 'none', usage: null, path: 'none' };
  };

  // ── Writes (Phase 4): optimistic-local always; remote when signed in ──────
  // A failed server write used to be console-only; now it also shows a small
  // toast so the user knows their change is local-only. Rate-limited so a burst
  // of failing writes doesn't stack toasts. Demo/unauth mode never toasts
  // (skipping remote is normal there, not a failure).
  let lastWriteToast = 0;
  function writeFailToast() {
    const now = Date.now();
    if (now - lastWriteToast < 5000) return;
    lastWriteToast = now;
    try {
      const el = document.createElement('div');
      el.textContent = 'Server write failed — change kept locally (it will not survive a reload).';
      el.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9999;' +
        'background:#5a1722;color:#ffe9ec;border:1px solid #f85149;border-radius:8px;' +
        'padding:8px 14px;font:12.5px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 5000);
    } catch (_) { /* headless/test contexts have no DOM body yet */ }
  }
  // A missing table (a migration not yet applied, e.g. `goals`) shouldn't alarm
  // the user — the change is kept in memory and the seed still shows. Real write
  // failures (RLS, network, constraint) still surface the toast.
  const isMissingTable = (msg) => /relation .* does not exist|does not exist|schema cache|could not find the table|42p01|pgrst205/i.test(msg || '');
  async function remote(fn) {
    if (sb && authed()) {
      try {
        const { error } = await fn();
        if (error) { console.warn('[Relay] write:', error.message); if (!isMissingTable(error.message)) writeFailToast(); }
        return !error;
      } catch (e) { console.warn('[Relay] write threw:', e.message); if (!isMissingTable(e.message)) writeFailToast(); }
    }
    return false;
  }

  // Auto-Curator: once CURATOR_AUTO_THRESHOLD human corrections (edits/rejects)
  // accumulate for an agent, run the Curator for it in the background so its
  // learned rules refresh without a manual pass. Counter resets on trigger;
  // curatorRunning guards against overlapping runs. Gated on authed() so we use
  // the real Edge Function (and don't log ERROR runs in offline demo mode).
  const CURATOR_AUTO_THRESHOLD = 5;
  window.CDC.CURATOR_AUTO_THRESHOLD = CURATOR_AUTO_THRESHOLD;   // read by agent cards UI
  const curatorPending = {};   // agent → corrections since its last auto-run
  const curatorRunning = {};   // agent → run in flight?
  function maybeRunCurator(agent) {
    if (!agent || !authed()) return;
    if (!(window.CDC.agents && window.CDC.agents.runCurator)) return;
    curatorPending[agent] = (curatorPending[agent] || 0) + 1;
    if (curatorPending[agent] < CURATOR_AUTO_THRESHOLD || curatorRunning[agent]) return;
    curatorPending[agent] = 0;
    curatorRunning[agent] = true;
    Promise.resolve()
      .then(() => window.CDC.agents.runCurator(agent))
      .catch((e) => console.warn('[Relay] auto-Curator failed:', e.message || e))
      .finally(() => { curatorRunning[agent] = false; });
  }

  window.CDC.db = {
    authed,
    // Records a human review of an agent draft — the Engram learning signal.
    async logInteraction({ agent, flow, inputRef, action, draft, final, reason, userId }) {
      const row = {
        id: rid('eng-'), traceId: rid('tr-'), agent: agent || 'Rollup', flow: flow || '',
        ts: nowStr(), action, inputRef: inputRef || '', draft: draft || '', final: final || '',
        diff: (draft && final) ? `− ${draft}\n+ ${final}` : '', reason: reason || '', userId: userId || null,
      };
      if (Array.isArray(window.CDC.ENGRAM)) window.CDC.ENGRAM.unshift(row);
      await remote(() => sb.from('engram_interactions').insert({ id: row.id, agent: row.agent, user_id: userId || null, human_action: action, data: row }));
      // Only corrections carry a teaching signal; accepts don't move the counter.
      if (action && action !== 'accept') maybeRunCurator(row.agent);
      return row;
    },
    // Create a weekly draft (client-generated — see WeeklyView generateDrafts).
    async addWeekly(w) {
      if (Array.isArray(window.CDC.WEEKLY)) window.CDC.WEEKLY.unshift(w);
      await remote(() => sb.from('weekly_summaries').upsert({ id: w.id, dept: w.dept || null, status: w.status || 'DRAFT', data: w }));
    },
    async updateWeekly(weeklyObj, patch) {
      const local = (window.CDC.WEEKLY || []).find((w) => w.id === weeklyObj.id);
      const merged = { ...(local || weeklyObj), ...patch };
      if (local) Object.assign(local, patch);
      await remote(() => sb.from('weekly_summaries').update({ status: merged.status, data: merged }).eq('id', weeklyObj.id));
    },
    // Upsert a consolidated weekly digest (one row per ISO week, all departments).
    async saveWeeklyDigest(digest) {
      const arr = (window.CDC.WEEKLY_DIGESTS = window.CDC.WEEKLY_DIGESTS || []);
      const i = arr.findIndex((d) => d.id === digest.id);
      if (i >= 0) arr[i] = digest; else arr.unshift(digest);
      await remote(() => sb.from('weekly_digests').upsert({ id: digest.id, week_of: digest.weekOf, status: digest.status || 'GENERATED', data: digest }));
    },
    // Insert a batch of Advisor recommendation cards (the emergent Second Brain layer).
    async addRecommendations(list) {
      const arr = (window.CDC.RECOMMENDATIONS = window.CDC.RECOMMENDATIONS || []);
      for (const rec of list) arr.unshift(rec);
      if (list.length) await remote(() => sb.from('recommendations').insert(
        list.map((rec) => ({ id: rec.id, kind: rec.kind, dept: rec.dept || null, status: rec.status || 'new', data: rec }))));
    },
    // Triage a recommendation card: accepted / dismissed / acted.
    async updateRecommendation(id, status) {
      const rec = (window.CDC.RECOMMENDATIONS || []).find((r) => r.id === id);
      if (rec) rec.status = status;
      await remote(() => sb.from('recommendations').update({ status, data: rec || { id, status } }).eq('id', id));
    },
    async addDailyReport(report) {
      if (Array.isArray(window.CDC.REPORTS)) window.CDC.REPORTS.unshift(report);
      await remote(() => sb.from('daily_reports').insert({ id: report.id, author_id: report.author, dept: report.dept, sub: report.sub, report_date: report.date, data: report }));
    },
    async addWorklog(w) {
      if (Array.isArray(window.CDC.WORKLOGS)) window.CDC.WORKLOGS.unshift(w);
      await remote(() => sb.from('worklogs').insert({ id: w.id, owner_id: w.userId, dept: w.dept, work_date: w.date, data: w }));
    },
    // Day-end chat submit is REPLACE semantics: re-submitting the same day
    // (edit & resubmit, or a reload + re-log) must not append a second report
    // and a second set of worklogs — that double-counted every hours KPI.
    // Only rows from this flow are replaced (report source 'native_form',
    // worklog source 'day_end'); task-mirrored worklogs are untouched.
    async replaceDayReport(report, worklogs) {
      const R = window.CDC.REPORTS || [], W = window.CDC.WORKLOGS || [];
      for (let i = R.length - 1; i >= 0; i--) {
        if (R[i].author === report.author && R[i].date === report.date && R[i].source === 'native_form') R.splice(i, 1);
      }
      for (let i = W.length - 1; i >= 0; i--) {
        if (W[i].userId === report.author && W[i].date === report.date && W[i].source === 'day_end') W.splice(i, 1);
      }
      await remote(() => sb.from('daily_reports').delete()
        .eq('author_id', report.author).eq('report_date', report.date)
        .contains('data', { source: 'native_form' }));
      await remote(() => sb.from('worklogs').delete()
        .eq('owner_id', report.author).eq('work_date', report.date)
        .contains('data', { source: 'day_end' }));
      await this.addDailyReport(report);
      for (const w of worklogs) await this.addWorklog(w);
    },
    async updateTask(id, status) {
      const t = (window.CDC.TASKS || []).find((x) => x.id === id); if (t) t.status = status;
      // No local copy → update the status column only; writing a stub into the
      // data jsonb would wipe the server row's title/owner/template.
      await remote(() => sb.from('tasks').update(t ? { status, data: t } : { status }).eq('id', id));
    },
    // Owner fills in execution data (template fields like iterations/accuracy,
    // and the task description) on a task assigned to them. Merges the patch into
    // the task and keeps the mirrored worklog's template in sync so rollups match.
    async updateTaskFields(id, patch) {
      const t = (window.CDC.TASKS || []).find((x) => x.id === id);
      if (!t) return; // no local copy — a partial stub would clobber the server row
      Object.assign(t, patch);
      await remote(() => sb.from('tasks').update({ data: t }).eq('id', id));
      const wl = (window.CDC.WORKLOGS || []).find((w) => w.taskId === id);
      if (wl) {
        // Keep the mirrored worklog in sync so rollups/dashboards match the edit.
        for (const k of ['products', 'stacks', 'outputCategory', 'taskCategory', 'activityCategory', 'metricCategory', 'outputCount', 'template']) {
          if (patch[k] !== undefined) wl[k] = patch[k];
        }
        if (patch.estHours !== undefined) {
          // Same rule as task creation: future-due work doesn't count today.
          const today = window.CDC.fmt(window.CDC.today);
          const due = patch.due !== undefined ? patch.due : t.due;
          wl.estHours = Number(patch.estHours) || 0;
          wl.hours = (due && due > today) ? 0 : Number(patch.estHours) || 0;
        }
        await remote(() => sb.from('worklogs').update({ data: wl }).eq('id', wl.id));
      }
    },
    // Update a non-payroll budget row (e.g. Concierge edits planned amount).
    async updateNonpayroll(id, patch) {
      const r = (window.CDC.NONPAYROLL_EXPENSE || []).find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      const remoteOk = await remote(() => sb.from('nonpayroll_expense').update({ dept: (r || patch).dept || null, data: r || { id, ...patch } }).eq('id', id));
      return { item: r, remoteOk };
    },
    // Add a new non-payroll budget row (Sheet view, L3/Admin only — RLS rejects others).
    async addNonpayroll(row) {
      const arr = window.CDC.NONPAYROLL_EXPENSE || (window.CDC.NONPAYROLL_EXPENSE = []);
      arr.unshift(row);
      const remoteOk = await remote(() => sb.from('nonpayroll_expense').insert({ id: row.id, dept: row.dept || null, data: row }));
      return { item: row, remoteOk };
    },
    async addTask(task) {
      if (Array.isArray(window.CDC.TASKS)) window.CDC.TASKS.unshift(task);
      await remote(() => sb.from('tasks').insert({ id: task.id, owner_id: task.owner, dept: task.dept, status: task.status, data: task }));
    },
    // Hard-delete a task (admin clean-up of test/demo rows). RLS task_write
    // (is_hod_admin or owner_in_scope) gates the server delete; in-memory is
    // always removed so it disappears immediately. Also removes the worklog that
    // was mirrored from this task (linked by data.taskId) so the Worklogs view
    // stays consistent. Demo worklogs created before the link won't carry a
    // taskId — delete those directly via deleteWorklog.
    async deleteTask(id) {
      const arr = window.CDC.TASKS; const i = arr ? arr.findIndex((x) => x.id === id) : -1;
      if (i >= 0) arr.splice(i, 1);
      // Cascade to the mirrored worklog(s).
      const wl = window.CDC.WORKLOGS;
      if (Array.isArray(wl)) for (let j = wl.length - 1; j >= 0; j--) if (wl[j] && wl[j].taskId === id) wl.splice(j, 1);
      const remoteOk = await remote(() => sb.from('tasks').delete().eq('id', id));
      await remote(() => sb.from('worklogs').delete().eq('data->>taskId', id));
      return { remoteOk };
    },
    // Hard-delete a single worklog entry (admin clean-up). RLS worklog_write
    // (owner or is_hod_admin) gates the server delete.
    async deleteWorklog(id) {
      const arr = window.CDC.WORKLOGS; const i = arr ? arr.findIndex((x) => x.id === id) : -1;
      if (i >= 0) arr.splice(i, 1);
      const remoteOk = await remote(() => sb.from('worklogs').delete().eq('id', id));
      return { remoteOk };
    },
    // 6:30 PM check-in: owner acknowledges an open task. Records lastAckDate so
    // the task drops out of the unacknowledged-escalation path; optional status
    // change maps the xlsx label to the board status (Blocked also arms escalation).
    async acknowledgeTask(id, { status, note } = {}) {
      const STATUS_MAP = { 'In-progress': 'ACTIVE', 'Done': 'DONE', 'Blocked': 'BLOCKED', 'Overdue': 'ACTIVE', 'Backlog': 'BACKLOG' };
      const t = (window.CDC.TASKS || []).find((x) => x.id === id);
      const today = window.CDC.fmt(window.CDC.today);
      const newStatus = status ? (STATUS_MAP[status] || 'ACTIVE') : (t ? t.status : 'ACTIVE');
      if (t) {
        t.lastAckDate = today; t.ackPending = false; t.lastAckStatus = status || null;
        if (status === 'Blocked' && t.status !== 'BLOCKED' && t.status !== 'ESCALATED') {
          t.blockedAt = new Date().toISOString(); t.escalIdx = 0;
        }
        if (note) { if (status === 'Backlog') t.backlogNote = note; else t.blockReason = note; }
        t.status = newStatus;
      }
      await remote(() => sb.from('tasks').update(t ? { status: newStatus, data: t } : { status: newStatus }).eq('id', id));
      const ackId = rid('ack-');
      await remote(() => sb.from('task_acknowledgements').insert({
        id: ackId, task_id: id, owner_id: t ? t.owner : null, ack_date: today, status: status || null, note: note || null,
      }));
      this.logInteraction({ agent: 'Sentry', flow: 'task_ack', inputRef: `Task ${id}`, action: 'edit',
        reason: `Acknowledged${status ? ` as ${status}` : ''}${note ? ` — ${note}` : ''}`, userId: t ? t.owner : null });
      return ackId;
    },
    async addMom(mom) {
      if (Array.isArray(window.CDC.MOMS)) window.CDC.MOMS.unshift(mom);
      await remote(() => sb.from('moms').insert({ id: mom.id, dept: mom.dept || null, data: mom }));
    },
    async addFarmAgent(agent) {
      if (Array.isArray(window.CDC.FARM_AGENTS)) window.CDC.FARM_AGENTS.unshift(agent);
      await remote(() => sb.from('farm_agents').insert({ id: agent.id, owner_id: agent.owner, data: agent }));
      return agent;
    },
    // ── Admin reference-data writes (L3/Admin via 10_admin_write.sql RLS) ──────
    async updateEmployee(id, patch) {
      const u = (window.CDC.USERS || []).find((x) => x.id === id);
      if (u) Object.assign(u, patch);
      const cols = {};
      if (patch.name != null) cols.name = patch.name;
      // Email is the SSO match key (link_auth_user → employees.email), so it must
      // persist to its own column, not just data jsonb. Empty string clears it.
      if (patch.email !== undefined) cols.email = patch.email || null;
      if (patch.level != null) { cols.role_level = patch.level; }
      if (patch.dept !== undefined) cols.dept = patch.dept;
      if (patch.sub !== undefined) cols.sub = patch.sub;
      if (patch.managerId !== undefined) cols.manager_id = patch.managerId;
      if (patch.title != null) cols.title = patch.title;
      cols.data = u || { id, ...patch };
      const ok = await remote(() => sb.from('employees').update(cols).eq('id', id));
      return { ok, user: u };
    },
    async addKpi(kpi) {
      if (Array.isArray(window.CDC.KPIS)) window.CDC.KPIS.push(kpi);
      const remoteOk = await remote(() => sb.from('kpis').insert({ id: kpi.id, dept: kpi.dept || null, owner_id: kpi.owner || null, data: kpi }));
      return { item: kpi, remoteOk };
    },
    async updateKpi(id, patch) {
      const k = (window.CDC.KPIS || []).find((x) => x.id === id);
      if (k) Object.assign(k, patch);
      const remoteOk = await remote(() => sb.from('kpis').update({ dept: (k || patch).dept || null, owner_id: (k || patch).owner || null, data: k || { id, ...patch } }).eq('id', id));
      return { item: k, remoteOk };
    },
    async deleteKpi(id) {
      const arr = window.CDC.KPIS; const i = arr ? arr.findIndex((x) => x.id === id) : -1;
      if (i >= 0) arr.splice(i, 1);
      const remoteOk = await remote(() => sb.from('kpis').delete().eq('id', id));
      return { remoteOk };
    },
    // Team goals + deliverables. L2 leads edit `deliverables` here; persisted like KPIs.
    async addGoal(goal) {
      const arr = window.CDC.GOALS || (window.CDC.GOALS = []);
      arr.push(goal);
      const remoteOk = await remote(() => sb.from('goals').insert({ id: goal.id, dept: goal.dept || null, sub: goal.sub || null, data: goal }));
      return { item: goal, remoteOk };
    },
    async updateGoal(id, patch) {
      const g = (window.CDC.GOALS || []).find((x) => x.id === id);
      if (g) Object.assign(g, patch);
      const remoteOk = await remote(() => sb.from('goals').update({ dept: (g || patch).dept || null, sub: (g || patch).sub || null, data: g || { id, ...patch } }).eq('id', id));
      return { item: g, remoteOk };
    },
    async deleteGoal(id) {
      const arr = window.CDC.GOALS; const i = arr ? arr.findIndex((x) => x.id === id) : -1;
      if (i >= 0) arr.splice(i, 1);
      const remoteOk = await remote(() => sb.from('goals').delete().eq('id', id));
      return { remoteOk };
    },
    // Roadmap Planner drafts. Patch keys REPLACE (Concierge sends full arrays);
    // the status column is kept in sync with data.status so RLS/agent skip
    // logic (Planner never overwrites IN_REVIEW/FINAL) sees the L2's state.
    async updateRoadmapDraft(id, patch) {
      const d = (window.CDC.ROADMAP_DRAFTS || []).find((x) => x.id === id);
      if (d) Object.assign(d, patch);
      const row = d || { id, ...patch };
      const remoteOk = await remote(() => sb.from('roadmap_drafts')
        .update({ status: row.status || 'DRAFT', data: row }).eq('id', id));
      return { item: row, remoteOk };
    },
    // Application feedback (idea / bug / praise / annoyance) — anyone can submit.
    // Refetch feedback on demand (the Feedback page mounts) so submitters see
    // owner replies/status and the owner sees new submissions without a reload.
    async refreshFeedback() {
      if (!sb) return false;
      const res = await sb.from('app_feedback').select('data').order('created_at', { ascending: false });
      if (res.error || !res.data) return false;
      fillArray('FEEDBACK', res.data.map((r) => r.data));
      return true;
    },
    async addFeedback(fb) {
      const arr = window.CDC.FEEDBACK || (window.CDC.FEEDBACK = []);
      arr.unshift(fb);
      const remoteOk = await remote(() => sb.from('app_feedback').insert({ id: fb.id, user_id: fb.userId || null, kind: fb.kind || null, status: fb.status || 'open', data: fb }));
      return { item: fb, remoteOk };
    },
    async updateFeedback(id, patch) {
      const f = (window.CDC.FEEDBACK || []).find((x) => x.id === id);
      if (f) Object.assign(f, patch);
      const remoteOk = await remote(() => sb.from('app_feedback').update({ status: (f || patch).status || 'open', data: f || { id, ...patch } }).eq('id', id));
      return { item: f, remoteOk };
    },
    // Master data: persist a department's edited fields into BOTH the
    // departments table (drives lookup.dept) and the nested business_directions
    // jsonb (drives the Master-data tree), and mirror both in-memory arrays.
    async updateDepartment(deptId, patch) {
      const d = (window.CDC.DEPARTMENTS || []).find((x) => x.id === deptId);
      if (d) Object.assign(d, patch);
      const okDept = await remote(() => sb.from('departments').update({ data: d || { id: deptId, ...patch } }).eq('id', deptId));
      // Reflect into the nested BD tree + persist that BD record.
      let touchedBd = null;
      for (const bd of (window.CDC.BUSINESS_DIRECTIONS || [])) {
        for (const p of (bd.products || [])) {
          const nd = (p.departments || []).find((x) => x.id === deptId);
          if (nd) { Object.assign(nd, patch); touchedBd = bd; }
        }
      }
      const okBd = touchedBd ? await remote(() => sb.from('business_directions').update({ data: touchedBd }).eq('id', touchedBd.id)) : true;
      return { item: d, remoteOk: okDept && okBd };
    },
    async updateFlag(id, state) {
      const f = (window.CDC.FLAGS || []).find((x) => x.id === id); if (f) f.state = state;
      await remote(() => sb.from('flags').update({ state, data: f || { id, state } }).eq('id', id));
    },
    async updateProposal(id, state) {
      const p = (window.CDC.PROPOSALS || []).find((x) => x.id === id); if (p) p.state = state;
      await remote(() => sb.from('guideline_proposals').update({ status: state, data: p || { id, state } }).eq('id', id));
    },
    // Create a guideline proposal — used to promote an accepted process-kind
    // recommendation into the Curator/Engram review surface (single source).
    async addGuidelineProposal(p) {
      const row = { evidence: [], state: 'pending', ...p };
      if (Array.isArray(window.CDC.PROPOSALS)) window.CDC.PROPOSALS.unshift(row);
      await remote(() => sb.from('guideline_proposals').insert({ id: row.id, agent: row.agent, status: row.state, data: row }));
      return row;
    },
    async addWeeklyComment({ weeklyId, itemPath, author, text }) {
      const row = { id: rid('wc-'), weeklyId, itemPath, author, ts: nowStr(), text };
      if (Array.isArray(window.CDC.WEEKLY_COMMENTS)) window.CDC.WEEKLY_COMMENTS.unshift(row);
      await remote(() => sb.from('weekly_comments').insert({ id: row.id, weekly_id: weeklyId, author_id: author, data: row }));
      return row;
    },
    // Append an entry to the live activity feed (also used as the notification sink).
    // ts keeps the FULL date+time (server-side inserts already do) — renderers
    // shorten via CDC.fmtTs, so yesterday's events no longer masquerade as today's.
    async addActivity(act) {
      const row = { id: act.id || rid('act-'), kind: act.kind || 'event', ts: act.ts || nowStr(),
        text: act.text || '', icon: act.icon || '•', to: act.to || null, refId: act.refId || null };
      if (Array.isArray(window.CDC.ACTIVITY)) window.CDC.ACTIVITY.unshift(row);
      await remote(() => sb.from('activity').insert({ id: row.id, data: row }));
      return row;
    },
    // Persist the admin-edited task catalog (products / stacks / output map) and
    // apply it in memory so every open form picks it up immediately.
    async saveTaskCatalog(cat) {
      if (window.CDC.applyTaskCatalog) window.CDC.applyTaskCatalog(cat);
      const remoteOk = await remote(() => sb.from('app_docs').upsert({ key: 'task_catalog', data: cat }));
      return { remoteOk };
    },
    // Fan out a notification (e.g. task blocked) to one feed entry per recipient.
    async notify(recipients, { text, icon, kind, refId }) {
      const list = [...new Set((recipients || []).filter(Boolean))];
      for (const to of list) await this.addActivity({ kind: kind || 'notify', text, icon: icon || '🔔', to, refId });
      return list;
    },
  };

  // ── Agents (Phase 5): real LLM work via the relay-agent Edge Function. Each
  //    run is recorded to AI Runs + the activity feed (live observability). ──
  window.CDC.agents = {
    available: () => !!(sb),
    // Distilled learned preferences for an agent (written by runCurator),
    // injected as a system message so the agent self-corrects on its next run.
    memoryFor(name) {
      const a = (window.CDC.RELAY_AGENTS || []).find((x) => x.name === name);
      const rules = a && a.memory && a.memory.rules;
      return (rules && rules.length)
        ? `Learned preferences for ${name}, distilled from past human corrections — follow these:\n` +
          rules.map((r) => `• ${r}`).join('\n')
        : '';
    },
    // Log one model invocation as an ai_runs + activity entry (local + remote).
    // Reused by run() below and by Concierge (views-copilot) which calls the
    // model through the claude.complete tier chain instead of run().
    logRun({ agent, model, latencyMs, usage, outcome = 'OK', input = '', output = '' }) {
      const tokensIn = usage ? (usage.prompt_tokens || 0) : 0;
      const tokensOut = usage ? (usage.completion_tokens || 0) : 0;
      const run = {
        id: rid('run-'), agent, model, latencyMs,
        tokensIn, tokensOut,
        costUsd: computeCost(model, tokensIn, tokensOut),
        outcome, ts: nowStr(), scopeHash: 'live', input,
        output: String(output || '').slice(0, 240),
      };
      const act = { id: rid('act-'), kind: 'agent', ts: nowStr(),
        text: `${agent} ${outcome === 'OK' ? 'ran' : 'failed'}${input ? ' · ' + input : ''}`, icon: '⚙' };
      if (Array.isArray(window.CDC.AI_RUNS)) window.CDC.AI_RUNS.unshift(run);
      if (Array.isArray(window.CDC.ACTIVITY)) window.CDC.ACTIVITY.unshift(act);
      remote(() => sb.from('ai_runs').insert({ id: run.id, agent, data: run }));
      remote(() => sb.from('activity').insert({ id: act.id, data: act }));
      return run;
    },
    // Generic run: calls the model, logs an ai_runs + activity entry.
    async run({ agent, model, messages, inputLabel }) {
      const t0 = Date.now();
      const mem = agent ? this.memoryFor(agent) : '';
      const msgs = mem ? [{ role: 'system', content: mem }, ...messages] : messages;
      let content = '', usage = null, outcome = 'OK', errMsg = null, servedModel = model || 'smart';
      try {
        if (!window.CDC.askAgent) throw new Error('agent endpoint unavailable');
        const r = await window.CDC.askAgent({ messages: msgs, model: model || 'smart', agent });
        content = r.content || ''; usage = r.usage || null;
        servedModel = r.model || servedModel; // actual OpenRouter model, not the smart/fast alias
      } catch (e) { outcome = 'ERROR'; errMsg = e.message || String(e); }

      this.logRun({
        agent, model: servedModel, latencyMs: Date.now() - t0, usage, outcome,
        input: inputLabel || '', output: outcome === 'OK' ? content : errMsg || '',
      });

      if (outcome === 'ERROR') throw new Error(errMsg);
      return content;
    },
    // Try the Modal-hosted LangGraph agent via the relay-agent proxy (which holds
    // the MODAL_<AGENT>_URL + secret server-side; the browser is JWT-gated). Returns
    // the Modal response when path==='modal', else null so the caller falls back to
    // its inline prompt. Rollback: unset MODAL_<AGENT>_URL on the relay-agent function.
    async _tryModal(agent, payload) {
      if (!sb) return null;
      try {
        const { data, error } = await sb.functions.invoke('relay-agent', { body: { modal: agent, payload } });
        if (error || !data || data.path !== 'modal') return null;
        return data;
      } catch (_) { return null; }
    },
    // Rollup — draft a weekly summary from a department's daily reports.
    async runRollup(weekly) {
      const m = await this._tryModal('rollup', { weekly: { id: weekly.id, dept: weekly.dept, deptName: weekly.deptName } });
      if (m) return m.sections || null;
      const reports = (window.CDC.REPORTS || []).filter((r) => r.dept === weekly.dept && !r.missing);
      const ctx = reports.map((r) => `[${r.id}] ${r.sub} (${r.date}): ` +
        (r.items || []).map((i) => `(${i.kind}) ${i.text}`).join(' | ')).join('\n') || '(no reports in scope)';
      const prompt = `You are Rollup, an agent that consolidates a week of daily reports into a manager-ready weekly summary for "${weekly.deptName}".\n` +
        `Return ONLY JSON: {"sections":[{"h":"Highlights","items":[{"text":"...","cites":["r-1001"]}]},{"h":"Risks","items":[...]},{"h":"Asks","items":[...]}]}.\n` +
        `Cite the source report ids you used. Be concise and specific; no preamble.\n\nDaily reports:\n${ctx}`;
      const content = await this.run({ agent: 'Rollup', model: 'smart', inputLabel: `Weekly ${weekly.id}`, messages: [{ role: 'user', content: prompt }] });
      try { const m = content.match(/\{[\s\S]*\}/); return JSON.parse(m[0]).sections || null; } catch (_) { return null; }
    },
    // Weekly Digest — for ONE sub-department, write a grounded "what was achieved"
    // line per consolidated work-stream. `streams` is an ordered array of plain
    // strings describing each row (metric/product/stack/output/count/hours/topics).
    // Returns an array of achievement sentences in the SAME order, or null.
    async runWeeklyDigest({ sub, weekLabel, streams }) {
      if (!Array.isArray(streams) || !streams.length) return null;
      const m = await this._tryModal('rollup', { sub, weekLabel, streams });
      if (m) return Array.isArray(m.digest) ? m.digest : null;
      const numbered = streams.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const prompt = `You are Rollup, consolidating one week (${weekLabel}) of daily reports for the sub-department "${sub}".\n` +
        `For EACH numbered work-stream below, write ONE concise sentence (max 24 words) stating what was achieved that week. ` +
        `Ground it ONLY in the figures and topics given (counts, hours, status, topics, blockers); do not invent specifics. ` +
        `If a stream has open blockers or non-Done status, reflect that honestly.\n` +
        `Return ONLY a JSON array of exactly ${streams.length} strings, in the same order as the list. No preamble.\n\n${numbered}`;
      const content = await this.run({ agent: 'Rollup', model: 'smart', inputLabel: `Digest ${weekLabel} · ${sub}`, messages: [{ role: 'user', content: prompt }] });
      try {
        const m = content.match(/\[[\s\S]*\]/);
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr.map((x) => (typeof x === 'string' ? x : (x && x.text) || ''));
      } catch (_) {}
      return null;
    },
    // Advisor — the emergent Second Brain layer. Reads concrete Knowledge
    // (org/hierarchy + flow defs) plus recent captures and proposes suggestion
    // cards across four kinds. `ctx` is a pre-built, compact text brief assembled
    // by the caller (so we don't ship raw tables to the model). Returns an array
    // of { kind, title, detail, dept, severity, refs[] }, or null.
    async runAdvisor({ ctx, kinds }) {
      const allowed = (kinds && kinds.length) ? kinds : ['operational', 'process', 'priorities', 'people'];
      const prompt = `You are Advisor, the recommendation engine for a Curriculum Development department's operating copilot.\n` +
        `Read the BRIEF below (the department's structure plus its recent captured activity) and propose concrete, actionable suggestions.\n` +
        `Allowed kinds (you may use ONLY these): ${allowed.join(', ')}.\n` +
        `  - operational: risks, missing reports, blocked/overdue work, KPI slips.\n` +
        `  - process: guideline/SOP refinements suggested by recurring patterns.\n` +
        `  - priorities: what to create or prioritise next (coverage gaps, growing backlogs).\n` +
        `  - people: workload balance, reassignment, who is overloaded vs idle.\n` +
        `HARD kind filter: every item's "kind" MUST be exactly one of [${allowed.join(', ')}]. ` +
        `Discard any suggestion that does not fit one of those kinds, even if it seems useful — do NOT relabel it to sneak it in.\n` +
        `Rules: ground EVERY suggestion in the brief — never invent names, numbers, or facts not present. ` +
        `Prefer fewer, higher-signal items. Each "detail" is at most 2 sentences and states the so-what + a next step. ` +
        `Set "dept" to the relevant department id from the brief, or "" if cross-department. ` +
        `"severity" is one of low/medium/high. ` +
        `"refs" MUST contain ONLY ids that appear verbatim inside square brackets in the BRIEF (e.g. [k-1], [t-3], [r-1009]). ` +
        `Never put a word, label, team name, or section heading (like "missing-reports") in refs — only real bracketed ids. If you used no specific id, return refs as [].\n` +
        `Return ONLY JSON: {"items":[{"kind":"operational","title":"...","detail":"...","dept":"","severity":"medium","refs":[]}]}. No preamble.\n\nBRIEF:\n${ctx}`;
      const content = await this.run({ agent: 'Advisor', model: 'smart', inputLabel: 'Recommendations', messages: [{ role: 'user', content: prompt }] });
      try {
        const m = content.match(/\{[\s\S]*\}/);
        const items = JSON.parse(m[0]).items;
        if (Array.isArray(items)) return items.filter((it) => it && it.title && allowed.includes(it.kind));
      } catch (_) {}
      return null;
    },
    // Sentry — draft a short escalation brief for a stuck/blocked task. Routing
    // (who the next manager is) stays deterministic in the caller; Sentry only
    // writes the human-facing rationale + recommended action. Returns a one-line
    // string, or null on failure so the caller can fall back to a template.
    async runSentry({ task, event, target, targetLevel, daysStuck, reason }) {
      const m = await this._tryModal('sentry', { task, event, target, targetLevel, daysStuck, reason });
      if (m) return m.line || null;
      const prompt = `You are Sentry, the task-escalation agent for an ops team. ` +
        `A task needs a manager's attention. Write ONE concise line (max 160 chars, no preamble, no quotes) ` +
        `that tells ${target || 'the manager'}${targetLevel ? ` (${targetLevel})` : ''} why this is being ${event} and what to do next. ` +
        `Be specific and action-oriented; do not restate the obvious.\n\n` +
        `Task: "${task.title}"\nStatus: ${task.status}\nOwner: ${task.ownerName || task.owner}\n` +
        `Why flagged: ${reason || task.blockReason || 'unspecified'}\n` +
        (daysStuck != null ? `Stuck for: ~${daysStuck} day(s)\n` : '') +
        `Due: ${task.due || 'n/a'}`;
      try {
        const content = await this.run({ agent: 'Sentry', model: 'smart', inputLabel: `${event} ${task.id}`, messages: [{ role: 'user', content: prompt }] });
        const line = (content || '').trim().split('\n')[0].replace(/^["']|["']$/g, '').slice(0, 200);
        return line || null;
      } catch (_) { return null; }
    },
    // Scribe — extract action items from a meeting transcript.
    async runScribe(transcript) {
      // Modal-first (prompt-injection hardening + grounding live in the Python graph).
      // Same {agenda, attendees, summary, items} shape; falls back to the inline prompt.
      const m = await this._tryModal('scribe', { transcript });
      if (m) return {
        agenda: m.agenda || '',
        attendees: Array.isArray(m.attendees) ? m.attendees : [],
        summary: m.summary || { businessDirection: '', alignment: '', guidelines: '' },
        items: Array.isArray(m.items) ? m.items : [],
      };
      // Give Scribe the real roster so it (a) captures every item and (b) returns an
      // EXACT name/team the Dispatcher can map without guessing.
      const roster = (window.CDC.USERS || [])
        .map((u) => `${u.name} — ${u.level} — ${u.sub || u.dept || ''}`).join('\n');
      const prompt = `You are Scribe, summarizing a meeting transcript for the team listed below.\n` +
        `Produce FOUR things in this exact order: agenda, attendees, summary, items.\n\n` +
        `1) agenda — a single crisp one-line meeting agenda (what the meeting was about — under 90 chars, no preamble).\n\n` +
        `2) attendees — array of ONLY the distinct people who actually SPEAK in the transcript. A person counts as an attendee solely if there is a speaker line for them (e.g. "Ravi: ...", "[10:02] Priya:"). Include a name ONLY when it has such a speaking line. Do NOT add anyone from the team roster who does not speak — the roster is for assigning tasks, NEVER a source of attendees. You may normalize a speaker's name to its roster spelling when they clearly match, but never introduce a roster name that has no speaking line. Skip generic labels like "Team" or "Everyone".\n\n` +
        `3) summary — an OBJECT with THREE short paragraphs, one per outcome lens. Each paragraph is 2 to 5 sentences, written as flowing prose (NOT bullets), and outcome-oriented (focus on conclusions, not chat). Do not restate action items — those live in the items array. Do not invent. Skip any lens that wasn't substantively discussed by setting it to "".\n` +
        `  - "businessDirection": the strategic intent the meeting set or reinforced — the "why this matters" thread, the direction the team is heading.\n` +
        `  - "alignment": what everyone aligned on — the decisions reached, the shared understanding, what is now settled.\n` +
        `  - "guidelines": guidelines & insights that emerged — principles, learnings, things to remember going forward.\n\n` +
        `4) items — extract EVERY action item. Recall matters: capture ALL action items, follow-ups, commitments, and decisions that imply work — including implicit ones ("we need to…", "someone should…", "let's make sure…"). Do not skip or merge distinct tasks.\n` +
        `For each item, set assigneeHint to the person or team RESPONSIBLE for doing the work — the owner, never the person delegating it. Apply these rules IN ORDER, first match wins:\n` +
        `1. Speaker volunteers ("I'll…", "I will…", "let me…") → assign that speaker.\n` +
        `2. A specific FULL name or unambiguous person is named → that exact roster name.\n` +
        `3. A team/area is referenced ("for GenAI", "DS&Algo", "Aptitude", or the speaker is reporting for their team) → use that team/sub name. A team reference ALWAYS resolves — never blank a team-scoped ask.\n` +
        `4. Only a bare first name/token that matches MORE THAN ONE roster person (e.g. two people called "Pavan", two "Poojitha"), with no team context → set assigneeHint to "" for triage. Do NOT guess one of them, and do NOT invent a full name.\n` +
        `5. No plausible roster owner and no team → set assigneeHint to "".\n` +
        `Never default to the meeting chair or whoever is handing out work.\n` +
        `AMBIGUITY EXAMPLE: if the roster has two people whose first name is "Pavan" and the transcript only says "Pavan should pull the numbers" (no team, no full name), set that item's assigneeHint to "" — never pick one Pavan or invent a full name.\n\n` +
        `EXAMPLE:\n` +
        `Transcript: "Ravi: GenAI module shipped Friday but quiz scores dipped to 62%. Priya: I'll review the rubric. Pavan: we should tighten the eval pack for DS&Algo next sprint — that's where retention is leaking."\n` +
        `Output: {"agenda":"GenAI launch review and DS&Algo eval planning","attendees":["Ravi","Priya","Pavan"],"summary":{"businessDirection":"Quality-of-learning is the headline direction this quarter. Shipping is necessary but not sufficient if assessment outcomes slip — the team is steering toward measurable learner outcomes as the leading metric.","alignment":"The team agreed the 62% GenAI quiz scores are a leading signal that the rubric needs another pass before the next cohort. They also aligned that DS&Algo is now the larger retention risk and warrants a tightened eval pack in the next sprint.","guidelines":"Any module that ships should be paired with a rubric audit within a week. Eval packs are not optional polish — they are the early-warning system. Evaluation health travels with launch readiness, not after."},"items":[{"text":"Review the GenAI rubric to investigate quiz score dip","assigneeHint":"Priya","confidence":0.9},{"text":"Tighten the DS&Algo eval pack next sprint","assigneeHint":"DS&Algo","confidence":0.7}]}\n\n` +
        `Team roster (name — level — team):\n${roster}\n\n` +
        `Return ONLY JSON in this exact shape: {"agenda":"<one crisp line>","attendees":["Name", ...],"summary":{"businessDirection":"<paragraph or \\"\\">","alignment":"<paragraph or \\"\\">","guidelines":"<paragraph or \\"\\">"},"items":[{"text":"...","assigneeHint":"<exact roster name, team, or ''>","confidence":0.0}]}. No preamble.\n\nTranscript:\n${transcript}`;
      const content = await this.run({ agent: 'Scribe', model: 'smart', inputLabel: 'MOM extract', messages: [{ role: 'user', content: prompt }] });
      try {
        const m = content.match(/\{[\s\S]*\}/);
        const p = JSON.parse(m[0]);
        const items = Array.isArray(p.items) ? p.items : [];
        let attendees = Array.isArray(p.attendees)
          ? p.attendees.map((a) => String(a || '').trim()).filter(Boolean)
          : [];
        // summary may be the new object shape {businessDirection,alignment,guidelines}
        // or, for back-compat, a plain string. Normalize to the object.
        let summary = { businessDirection: '', alignment: '', guidelines: '' };
        if (p.summary && typeof p.summary === 'object') {
          summary.businessDirection = String(p.summary.businessDirection || '').trim();
          summary.alignment = String(p.summary.alignment || '').trim();
          summary.guidelines = String(p.summary.guidelines || '').trim();
        } else if (typeof p.summary === 'string' && p.summary.trim()) {
          summary.alignment = p.summary.trim(); // treat legacy paragraph as the alignment lens
        } else if (Array.isArray(p.bullets) && p.bullets.length) {
          // even older shape — fold bullets into the alignment lens
          summary.alignment = p.bullets
            .map((b) => (b && typeof b === 'object') ? b.text : String(b || ''))
            .map((t) => String(t).trim()).filter(Boolean).join(' ');
        }
        // Safety net: if all three lenses are empty but items exist, synthesize alignment.
        const hasAny = summary.businessDirection || summary.alignment || summary.guidelines;
        if (!hasAny && items.length > 0) {
          summary.alignment = 'The meeting captured the following commitments: ' +
            items.slice(0, 6).map((i) => String(i.text || '').trim()).filter(Boolean).join('; ') + '.';
        }
        return { agenda: p.agenda || '', attendees, summary, items };
      } catch (_) { return { agenda: '', attendees: [], summary: { businessDirection: '', alignment: '', guidelines: '' }, items: [] }; }
    },
    // Curator — close the learning loop: read where humans edited/rejected an
    // agent's drafts (engram_interactions), distill the recurring corrections
    // into durable preference rules, and write them to relay_agents.data.memory
    // so memoryFor() injects them into that agent's future runs.
    async runCurator(agentName) {
      const m = await this._tryModal('curator', { agent: agentName || '' });
      if (m) {
        const results = Array.isArray(m.results) ? m.results : [];
        // Modal already persisted memory to relay_agents; mirror it into the live
        // session so memoryFor() injects the new rules without a reload.
        for (const r of results) {
          const a = (window.CDC.RELAY_AGENTS || []).find((x) => x.name === r.agent);
          if (a) a.memory = { rules: r.rules, distilledFrom: r.distilledFrom, ts: nowStr() };
        }
        return results;
      }
      const byAgent = {};
      (window.CDC.ENGRAM || []).forEach((e) => {
        if (!e || e.action === 'accept') return;          // edits/rejects carry the teaching signal
        if (agentName && e.agent !== agentName) return;
        (byAgent[e.agent] = byAgent[e.agent] || []).push(e);
      });
      const results = [];
      for (const [name, items] of Object.entries(byAgent)) {
        const cases = items.slice(0, 40).map((e, i) =>
          `${i + 1}. flow=${e.flow || '?'} verdict=${e.action}\n` +
          `   AI draft: ${(e.draft || '').slice(0, 300)}\n` +
          `   Human kept: ${(e.final || '').slice(0, 300)}\n` +
          `   Reason: ${e.reason || '(none given)'}`).join('\n\n');
        const prompt = `You are Curator. Below are cases where ${name}'s AI suggestion was edited or rejected by a human reviewer.\n` +
          `Find the RECURRING ways humans correct ${name} and turn them into durable, imperative preference rules the agent should follow next time. ` +
          `Ignore one-off corrections; keep only patterns that repeat. Be specific and actionable.\n` +
          `Return ONLY JSON: {"rules":["...","..."]} with 3-7 short rules. No preamble.\n\nCases:\n${cases}`;
        let rules = [];
        try {
          const content = await this.run({ agent: 'Curator', model: 'smart',
            inputLabel: `Distill ${name} (${items.length} corrections)`,
            messages: [{ role: 'user', content: prompt }] });
          const m = content.match(/\{[\s\S]*\}/); rules = (JSON.parse(m[0]).rules || []).slice(0, 7);
        } catch (_) { continue; }
        if (!rules.length) continue;
        const a = (window.CDC.RELAY_AGENTS || []).find((x) => x.name === name);
        if (a) {
          a.memory = { rules, distilledFrom: items.length, ts: nowStr() };
          if (a.id) remote(() => sb.from('relay_agents').update({ data: a }).eq('id', a.id));
        }
        results.push({ agent: name, rules, distilledFrom: items.length });
      }
      return results;
    },
  };
})();
