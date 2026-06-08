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
  const nowStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} IST`; };
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // ── Reads: load scoped rows into the existing window.CDC collections ──────
  const ARRAY_MAP = {
    employees: 'USERS', business_directions: 'BUSINESS_DIRECTIONS', departments: 'DEPARTMENTS',
    kpis: 'KPIS', daily_reports: 'REPORTS', worklogs: 'WORKLOGS', tasks: 'TASKS', flags: 'FLAGS',
    weekly_summaries: 'WEEKLY', weekly_comments: 'WEEKLY_COMMENTS', moms: 'MOMS',
    engram_interactions: 'ENGRAM', eval_sets: 'EVAL_SETS', guideline_proposals: 'PROPOSALS',
    farm_agents: 'FARM_AGENTS', relay_agents: 'RELAY_AGENTS', codex_workflows: 'CODEX_WORKFLOWS',
    codex_guidelines: 'CODEX_GUIDELINES', ai_runs: 'AI_RUNS', activity: 'ACTIVITY',
    knowledge_docs: 'KNOWLEDGE',
  };
  if (!Array.isArray(window.CDC.KNOWLEDGE)) window.CDC.KNOWLEDGE = [];
  function fillArray(cdcKey, items) { const a = window.CDC[cdcKey]; if (!Array.isArray(a)) return; a.length = 0; for (const it of items) a.push(it); }
  function fillObject(obj, next) { if (!obj) return; for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, next); }

  async function loadFromSupabase() {
    if (!sb || !window.CDC) return false;
    let loadedAny = false;
    const tables = Object.keys(ARRAY_MAP);
    const settled = await Promise.all(tables.map((t) => sb.from(t).select('data').then((res) => ({ t, res }))));
    for (const { t, res } of settled) {
      if (res.error) { console.warn('[Relay]', t, '—', res.error.message); continue; }
      if (res.data && res.data.length) { fillArray(ARRAY_MAP[t], res.data.map((r) => r.data)); loadedAny = true; }
    }
    const dh = await sb.from('dept_health').select('id,data');
    if (dh.data && dh.data.length) { const o = {}; dh.data.forEach((r) => { o[r.id] = r.data; }); fillObject(window.CDC.DEPT_HEALTH, o); loadedAny = true; }
    const ex = await sb.from('expense_doc').select('data').eq('id', 'current').maybeSingle();
    if (ex.data && ex.data.data) fillObject(window.CDC.EXPENSE, ex.data.data);
    const ad = await sb.from('app_docs').select('key,data');
    if (ad.data) ad.data.forEach((r) => { if (r.key === 'roles') fillObject(window.CDC.ROLES, r.data); });
    window.CDC.__source = loadedAny ? 'supabase' : 'bundled';
    console.log('[Relay] data source:', window.CDC.__source);
    return loadedAny;
  }

  if (sb) {
    window.CDC.auth = {
      signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
      signOut: () => sb.auth.signOut(),
      session: () => sb.auth.getSession(),
      onChange: (cb) => sb.auth.onAuthStateChange(cb),
    };
    window.CDC.whoami = async () => { const { data, error } = await sb.rpc('whoami'); if (error) { console.warn('[Relay] whoami:', error.message); return null; } return data || null; };
    window.CDC.whoamiReal = async () => { const { data, error } = await sb.rpc('whoami_real'); if (error) { return null; } return data || null; };
    window.CDC.setImpersonation = (empId) => sb.rpc('set_impersonation', { p_emp_id: empId ?? null });
    window.CDC.loadFromSupabase = loadFromSupabase;

    // Phase 5 — real agents via the relay-agent Edge Function (OpenRouter proxy).
    window.CDC.askAgent = async ({ messages, model }) => {
      const { data, error } = await sb.functions.invoke('relay-agent', { body: { messages, model: model || 'smart' } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return data; // { content, model, usage }
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
  const offlineShim = (window.claude && window.claude.complete) || null;
  window.claude = window.claude || {};
  window.claude.complete = async ({ messages }) => {
    // Tier 1: Edge Function
    if (window.CDC.askAgent) {
      try {
        const r = await window.CDC.askAgent({ messages, model: 'smart' });
        if (r && r.content) return r.content;
      } catch (e) {
        console.warn('[Relay] askAgent failed, trying OpenRouter:', e.message || e);
      }
    }
    // Tier 2: Direct OpenRouter
    try {
      const r = await directOpenRouter({ messages, model: 'smart' });
      if (r && r.content) return r.content;
    } catch (e) {
      console.warn('[Relay] OpenRouter failed, falling back to offline shim:', e.message || e);
    }
    // Tier 3: Offline keyword shim
    if (offlineShim) return offlineShim({ messages });
    return '[error] No LLM backend available. Paste an OpenRouter API key in the Concierge header to enable real responses.';
  };

  // ── Writes (Phase 4): optimistic-local always; remote when signed in ──────
  async function remote(fn) { if (sb && authed()) { try { const { error } = await fn(); if (error) console.warn('[Relay] write:', error.message); return !error; } catch (e) { console.warn('[Relay] write threw:', e.message); } } return false; }

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
      return row;
    },
    async updateWeekly(weeklyObj, patch) {
      const local = (window.CDC.WEEKLY || []).find((w) => w.id === weeklyObj.id);
      const merged = { ...(local || weeklyObj), ...patch };
      if (local) Object.assign(local, patch);
      await remote(() => sb.from('weekly_summaries').update({ status: merged.status, data: merged }).eq('id', weeklyObj.id));
    },
    async addDailyReport(report) {
      if (Array.isArray(window.CDC.REPORTS)) window.CDC.REPORTS.unshift(report);
      await remote(() => sb.from('daily_reports').insert({ id: report.id, author_id: report.author, dept: report.dept, sub: report.sub, report_date: report.date, data: report }));
    },
    async addWorklog(w) {
      if (Array.isArray(window.CDC.WORKLOGS)) window.CDC.WORKLOGS.unshift(w);
      await remote(() => sb.from('worklogs').insert({ id: w.id, owner_id: w.userId, dept: w.dept, work_date: w.date, data: w }));
    },
    async updateTask(id, status) {
      const t = (window.CDC.TASKS || []).find((x) => x.id === id); if (t) t.status = status;
      await remote(() => sb.from('tasks').update({ status, data: t || { id, status } }).eq('id', id));
    },
    async addTask(task) {
      if (Array.isArray(window.CDC.TASKS)) window.CDC.TASKS.unshift(task);
      await remote(() => sb.from('tasks').insert({ id: task.id, owner_id: task.owner, dept: task.dept, status: task.status, data: task }));
    },
    // 6:30 PM check-in: owner acknowledges an open task. Records lastAckDate so
    // the task drops out of the unacknowledged-escalation path; optional status
    // change maps the xlsx label to the board status (Blocked also arms escalation).
    async acknowledgeTask(id, { status, note } = {}) {
      const STATUS_MAP = { 'In-progress': 'ACTIVE', 'Done': 'DONE', 'Blocked': 'BLOCKED', 'Overdue': 'ACTIVE', 'Backlog': 'BACKLOG' };
      const t = (window.CDC.TASKS || []).find((x) => x.id === id);
      const today = window.CDC.fmt ? window.CDC.fmt(window.CDC.today) : new Date().toISOString().slice(0, 10);
      const newStatus = status ? (STATUS_MAP[status] || 'ACTIVE') : (t ? t.status : 'ACTIVE');
      if (t) {
        t.lastAckDate = today; t.ackPending = false; t.lastAckStatus = status || null;
        if (status === 'Blocked' && t.status !== 'BLOCKED' && t.status !== 'ESCALATED') {
          t.blockedAt = new Date().toISOString(); t.escalIdx = 0;
        }
        if (note) { if (status === 'Backlog') t.backlogNote = note; else t.blockReason = note; }
        t.status = newStatus;
      }
      await remote(() => sb.from('tasks').update({ status: newStatus, data: t || { id, status: newStatus } }).eq('id', id));
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
    async updateFlag(id, state) {
      const f = (window.CDC.FLAGS || []).find((x) => x.id === id); if (f) f.state = state;
      await remote(() => sb.from('flags').update({ state, data: f || { id, state } }).eq('id', id));
    },
    async updateProposal(id, state) {
      const p = (window.CDC.PROPOSALS || []).find((x) => x.id === id); if (p) p.state = state;
      await remote(() => sb.from('guideline_proposals').update({ status: state, data: p || { id, state } }).eq('id', id));
    },
    async addWeeklyComment({ weeklyId, itemPath, author, text }) {
      const row = { id: rid('wc-'), weeklyId, itemPath, author, ts: nowStr(), text };
      if (Array.isArray(window.CDC.WEEKLY_COMMENTS)) window.CDC.WEEKLY_COMMENTS.unshift(row);
      await remote(() => sb.from('weekly_comments').insert({ id: row.id, weekly_id: weeklyId, author_id: author, data: row }));
      return row;
    },
    // Append an entry to the live activity feed (also used as the notification sink).
    async addActivity(act) {
      const row = { id: act.id || rid('act-'), kind: act.kind || 'event', ts: act.ts || nowStr().slice(11, 16),
        text: act.text || '', icon: act.icon || '•', to: act.to || null, refId: act.refId || null };
      if (Array.isArray(window.CDC.ACTIVITY)) window.CDC.ACTIVITY.unshift(row);
      await remote(() => sb.from('activity').insert({ id: row.id, data: row }));
      return row;
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
    // Generic run: calls the model, logs an ai_runs + activity entry.
    async run({ agent, model, messages, inputLabel }) {
      const t0 = Date.now();
      const mem = agent ? this.memoryFor(agent) : '';
      const msgs = mem ? [{ role: 'system', content: mem }, ...messages] : messages;
      let content = '', usage = null, outcome = 'OK', errMsg = null;
      try {
        if (!window.CDC.askAgent) throw new Error('agent endpoint unavailable');
        const r = await window.CDC.askAgent({ messages: msgs, model: model || 'smart' });
        content = r.content || ''; usage = r.usage || null;
      } catch (e) { outcome = 'ERROR'; errMsg = e.message || String(e); }

      const run = {
        id: rid('run-'), agent, model: model || 'smart', latencyMs: Date.now() - t0,
        tokensIn: usage ? (usage.prompt_tokens || 0) : 0, tokensOut: usage ? (usage.completion_tokens || 0) : 0,
        costUsd: 0, outcome, ts: nowStr(), scopeHash: 'live', input: inputLabel || '',
        output: (outcome === 'OK' ? content : errMsg || '').slice(0, 240),
      };
      const act = { id: rid('act-'), kind: 'agent', ts: nowStr().slice(11, 16),
        text: `${agent} ${outcome === 'OK' ? 'ran' : 'failed'}${inputLabel ? ' · ' + inputLabel : ''}`, icon: '⚙' };
      if (Array.isArray(window.CDC.AI_RUNS)) window.CDC.AI_RUNS.unshift(run);
      if (Array.isArray(window.CDC.ACTIVITY)) window.CDC.ACTIVITY.unshift(act);
      remote(() => sb.from('ai_runs').insert({ id: run.id, agent, data: run }));
      remote(() => sb.from('activity').insert({ id: act.id, data: act }));

      if (outcome === 'ERROR') throw new Error(errMsg);
      return content;
    },
    // Rollup — draft a weekly summary from a department's daily reports.
    async runRollup(weekly) {
      const reports = (window.CDC.REPORTS || []).filter((r) => r.dept === weekly.dept && !r.missing);
      const ctx = reports.map((r) => `[${r.id}] ${r.sub} (${r.date}): ` +
        (r.items || []).map((i) => `(${i.kind}) ${i.text}`).join(' | ')).join('\n') || '(no reports in scope)';
      const prompt = `You are Rollup, an agent that consolidates a week of daily reports into a manager-ready weekly summary for "${weekly.deptName}".\n` +
        `Return ONLY JSON: {"sections":[{"h":"Highlights","items":[{"text":"...","cites":["r-1001"]}]},{"h":"Risks","items":[...]},{"h":"Asks","items":[...]}]}.\n` +
        `Cite the source report ids you used. Be concise and specific; no preamble.\n\nDaily reports:\n${ctx}`;
      const content = await this.run({ agent: 'Rollup', model: 'smart', inputLabel: `Weekly ${weekly.id}`, messages: [{ role: 'user', content: prompt }] });
      try { const m = content.match(/\{[\s\S]*\}/); return JSON.parse(m[0]).sections || null; } catch (_) { return null; }
    },
    // Scribe — extract action items from a meeting transcript.
    async runScribe(transcript) {
      // Give Scribe the real roster so it (a) captures every item and (b) returns an
      // EXACT name/team the Dispatcher can map without guessing.
      const roster = (window.CDC.USERS || [])
        .map((u) => `${u.name} — ${u.level} — ${u.sub || u.dept || ''}`).join('\n');
      const prompt = `You are Scribe, summarizing a meeting transcript for the team listed below.\n` +
        `First, write a single crisp one-line meeting agenda (what the meeting was about — under 90 chars, no preamble).\n` +
        `Then write a flat list of SUMMARY BULLETS capturing the substance of the meeting — what was discussed, what landed, what was flagged. Rules:\n` +
        `  - Aim for 5 to 12 bullets total. Each under 25 words. No headings, no grouping — just a flat list in narrative order.\n` +
        `  - Be concrete and specific (mention the area / tool / decision). Mention names only when the speaker matters.\n` +
        `  - Do NOT include action items, TODOs, or assignments — those go in the items array below.\n` +
        `  - Do not invent. Skip anything not substantively in the transcript.\n` +
        `Then extract EVERY action item. Recall matters: capture ALL action items, follow-ups, commitments, and decisions that imply work — including implicit ones ("we need to…", "someone should…", "let's make sure…"). Do not skip or merge distinct tasks.\n` +
        `For each item, set assigneeHint to the person or team RESPONSIBLE for doing the work — the owner, never the person delegating it. Rules:\n` +
        `- Prefer the EXACT name from the team roster below. If a task is for an area/team ("for GenAI", "DS&Algo", "Aptitude"), use that team/sub name from the roster.\n` +
        `- If a speaker volunteers ("I'll…", "I will…", "let me…"), assign that speaker.\n` +
        `- Never default to the meeting chair or whoever is handing out work; pick who must complete it.\n` +
        `- If no one in the roster plausibly fits, set assigneeHint to "" (leave it for human triage) — do NOT guess a random person.\n` +
        `Team roster (name — level — team):\n${roster}\n\n` +
        `Return ONLY JSON: {"agenda":"<one crisp line>","bullets":["...","..."],"items":[{"text":"...","assigneeHint":"<exact roster name, team, or ''>","confidence":0.0}]}. No preamble.\n\nTranscript:\n${transcript}`;
      const content = await this.run({ agent: 'Scribe', model: 'smart', inputLabel: 'MOM extract', messages: [{ role: 'user', content: prompt }] });
      try {
        const m = content.match(/\{[\s\S]*\}/);
        const p = JSON.parse(m[0]);
        const bullets = Array.isArray(p.bullets)
          ? p.bullets.map((b) => String(b || '').trim()).filter(Boolean)
          : [];
        return { agenda: p.agenda || '', bullets, items: p.items || [] };
      } catch (_) { return { agenda: '', bullets: [], items: [] }; }
    },
    // Curator — close the learning loop: read where humans edited/rejected an
    // agent's drafts (engram_interactions), distill the recurring corrections
    // into durable preference rules, and write them to relay_agents.data.memory
    // so memoryFor() injects them into that agent's future runs.
    async runCurator(agentName) {
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
