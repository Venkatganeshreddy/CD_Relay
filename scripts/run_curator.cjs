// Headless Curator: distill engram_interactions -> relay_agents.data.memory.
// Mirrors window.CDC.agents.runCurator() in supabase-client.js.
// Run: SUPABASE_SERVICE_KEY=<service_role> node scripts/run_curator.cjs [AgentName]
const URL = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ONLY = process.argv[2] || null;
if (!KEY) { console.error('Set SUPABASE_SERVICE_KEY (service_role).'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = (p, opt = {}) => fetch(`${URL}/rest/v1/${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });

async function ask(messages) {
  const r = await fetch(`${URL}/functions/v1/relay-agent`, {
    method: 'POST', headers: H, body: JSON.stringify({ messages, model: 'smart' }),
  });
  if (!r.ok) throw new Error(`relay-agent ${r.status}: ${await r.text()}`);
  return r.json(); // { content, model, usage }
}

(async () => {
  const eng = await (await rest('engram_interactions?select=id,agent,human_action,data')).json();
  console.log(`engram_interactions rows: ${eng.length}`);

  const byAgent = {};
  for (const e of eng) {
    const d = e.data || {};
    const action = d.action || e.human_action;
    if (action === 'accept') continue;            // edits/rejects = teaching signal
    const name = e.agent || d.agent;
    if (ONLY && name !== ONLY) continue;
    (byAgent[name] = byAgent[name] || []).push({ ...d, action });
  }
  const names = Object.keys(byAgent);
  console.log('agents with corrections:', names.length ? names.map(n => `${n}(${byAgent[n].length})`).join(', ') : 'none');
  if (!names.length) { console.log('Nothing to distill. Exiting.'); return; }

  const agents = await (await rest('relay_agents?select=id,data')).json();
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
      const { content } = await ask([{ role: 'user', content: prompt }]);
      rules = (JSON.parse(content.match(/\{[\s\S]*\}/)[0]).rules || []).slice(0, 7);
    } catch (err) { console.error(`  ${name}: distill failed — ${err.message}`); continue; }
    if (!rules.length) { console.log(`  ${name}: no rules produced`); continue; }

    const row = agents.find(a => (a.data && a.data.name) === name);
    if (!row) { console.error(`  ${name}: no relay_agents row — skip write`); continue; }
    const data = { ...row.data, memory: { rules, distilledFrom: items.length, ts: new Date().toISOString() } };
    const w = await rest(`relay_agents?id=eq.${row.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ data }),
    });
    console.log(`  ${name}: wrote ${rules.length} rules -> relay_agents/${row.id} (${w.status})`);
    results.push({ agent: name, rules, distilledFrom: items.length });
  }

  console.log('\n=== distilled ===');
  for (const r of results) console.log(`\n${r.agent} (from ${r.distilledFrom}):\n• ` + r.rules.join('\n• '));
})();
