// Exports the Relay system reference (Codex) to an Obsidian-openable vault:
//   obsidian-vault/  — Home, Architecture, Workflows/, Guidelines/, Agents/, Org/, People/
// Cross-linked with [[wikilinks]] + YAML frontmatter. Open the folder in Obsidian.
//   node scripts/export_obsidian.cjs
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const C = (() => { const s = { window: {}, console }; vm.createContext(s); vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), s); return s.window.CDC; })();
const VAULT = path.join(root, 'obsidian-vault');

const safe = (s) => String(s).replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
const userName = (id) => (C.USERS.find((u) => u.id === id) || {}).name || id;
const fm = (o) => '---\n' + Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? '[' + v.join(', ') + ']' : v}`).join('\n') + '\n---\n\n';
function write(rel, content) { const f = path.join(VAULT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }

fs.rmSync(VAULT, { recursive: true, force: true });

// Home
write('Home.md', fm({ type: 'index', title: 'Relay Codex' }) +
  `# Relay — Department Operating Copilot\n\nSystem reference exported from Codex. Open this folder as an Obsidian vault.\n\n` +
  `## Sections\n- [[Architecture]]\n- Workflows: ${C.CODEX_WORKFLOWS.map((w) => `[[${safe(w.name)}]]`).join(', ')}\n` +
  `- Guidelines: ${C.CODEX_GUIDELINES.map((g) => `[[${safe(g.name)}]]`).join(', ')}\n` +
  `- Agents: ${C.RELAY_AGENTS.map((a) => `[[${a.name}]]`).join(', ')}\n- [[Org]]\n`);

// Architecture (7 layers) + agent links
write('Architecture.md', fm({ type: 'architecture', title: 'Architecture' }) +
  `# Architecture\n\nSeven layers, from user-facing to data:\n\n` +
  ['Experience — dashboards, Submit, Concierge, Codex',
   'Agents — the 13 agents that draft and act',
   'Orchestration — workflow engine + eval-gated promotion',
   'Core services — RBAC, citation builder, KPI calculator',
   'Integration — Teams/Outlook (Graph), OpenRouter, MCP',
   'Data — Postgres + pgvector (reports, tasks, memory)',
   'Cross-cutting — auth, audit, cost (Meter)'].map((l, i) => `${i + 1}. **${l}**`).join('\n') +
  `\n\n## Agents\n${C.RELAY_AGENTS.map((a) => `- [[${a.name}]] — ${a.job}`).join('\n')}\n\n` +
  `## Workflows\n${C.CODEX_WORKFLOWS.map((w) => `- [[${safe(w.name)}]]`).join('\n')}\n`);

// Workflows
C.CODEX_WORKFLOWS.forEach((w) => {
  write(`Workflows/${safe(w.name)}.md`, fm({ type: 'workflow', id: w.id, version: w.version, trigger: w.trigger }) +
    `# ${w.name}\n\n**Trigger:** ${w.trigger}\n**Version:** ${w.version}\n\n` +
    `## Agents involved\n${(w.agents || []).map((a) => `- [[${a.replace(/\s*\(.*\)/, '')}]]`).join('\n')}\n\n` +
    `## Outputs\n${(w.outputs || []).map((o) => `- \`${o}\``).join('\n')}\n\nBack to [[Architecture]] · [[Home]]\n`);
});

// Guidelines (versioned)
C.CODEX_GUIDELINES.forEach((g) => {
  write(`Guidelines/${safe(g.name)}.md`, fm({ type: 'guideline', id: g.id, version: g.version, updated: g.updated, source: g.source }) +
    `# ${g.name}\n\n**Version:** ${g.version} · updated ${g.updated} by [[${safe(userName(g.updatedBy))}]]\n` +
    `**Source:** ${g.source}\n\n${g.summary}\n\nBack to [[Home]]\n`);
});

// Agents
C.RELAY_AGENTS.forEach((a) => {
  write(`Agents/${a.name}.md`, fm({ type: 'agent', id: a.id, autonomy: a.autonomy, model: a.model, owner: userName(a.owner) }) +
    `# ${a.name}\n\n${a.job}\n\n**Trigger:** ${a.trigger}\n**Autonomy:** ${a.autonomy}\n**Model:** \`${a.model}\`\n` +
    `**Owner:** [[${safe(userName(a.owner))}]]\n**Health:** ${a.health}\n\nBack to [[Architecture]]\n`);
});

// Org + People
write('Org.md', fm({ type: 'org', title: 'Org' }) +
  `# Org — CD - Curriculum Development\n\nHOD: [[${safe(userName('NW0002526'))}]]\n\n` +
  C.DEPARTMENTS.map((d) => {
    const mgrs = C.USERS.filter((u) => u.dept === d.id && u.level === 'L2');
    return `## ${d.name}\n${mgrs.map((m) => `- ${m.sub || d.name} → [[${safe(m.name)}]]`).join('\n') || '- (no sub-team lead)'}`;
  }).join('\n\n') + '\n');

C.USERS.forEach((u) => {
  write(`People/${safe(u.name)}.md`, fm({ type: 'person', emp_id: u.id, level: u.level, dept: u.dept }) +
    `# ${u.name}\n\n**Level:** ${u.level}\n**Title:** ${u.title}\n` +
    (u.sub ? `**Sub Department:** ${u.sub}\n` : '') +
    (u.managerId ? `**Reports to:** [[${safe(userName(u.managerId))}]]\n` : '') +
    `\nBack to [[Org]]\n`);
});

// Sample human note (demonstrates the round-trip: edit/add notes here → import → agents read).
write('Notes/Onboarding tips.md', fm({ type: 'note', tags: ['onboarding', 'process'] }) +
  `# Onboarding tips\n\nHuman-authored note (not generated). Edit or add files under \`Notes/\`, then run \`scripts/import_obsidian.cjs\` to sync into Supabase so Concierge can answer from them.\n\n` +
  `- New L1s: submit your first daily report the same day you join; the 5:30 PM banner is your cue.\n` +
  `- Blocked tasks need a reason — Sentry escalates anything blocked >72h.\n` +
  `- Ask [[Concierge]] "what's the Daily Report SOP?" if unsure of the format.\n`);

const count = (g) => fs.readdirSync(path.join(VAULT, g)).length;
console.log('Obsidian vault written to obsidian-vault/');
console.log(`  Workflows: ${count('Workflows')} · Guidelines: ${count('Guidelines')} · Agents: ${count('Agents')} · People: ${count('People')}`);
