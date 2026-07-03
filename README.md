# Relay — Department Operating Copilot

Relay is an AI-assisted operating layer for the **CD - Curriculum Development** department. It turns daily reports, weekly roll-ups, tasks, worklogs, and meeting notes into a single, queryable workspace backed by a roster of purpose-built AI agents.

**Live:** https://venkatganeshreddy.github.io/CD_Relay/

## What it does

- **Daily reporting** — people submit work per task; submissions drive missing-report tracking and weekly/monthly consolidation.
- **Department worklogs** — L2/L3 see every contributor's entries with cascading filters, group-by views, per-person/stack/category breakdowns, AI-suggested insights, and CSV export.
- **Weekly roll-ups** — weekly summary drafts are generated client-side from the department's daily reports; the *Rollup* agent grounds sections with citations.
- **Team goals → deliverables** — L2 leads write deliverables under each team goal and assign them to people in their stack; assignees see only their own when logging.
- **Task & escalation flow** — hierarchical task visibility (L3 → L2 → L1) plus server-side, tiered auto-escalation of blocked/overdue work.
- **MoM loader** — the *Scribe* agent extracts action items from meeting transcripts and the *Dispatcher* routes them to the right owner.
- **Second brain** — stack-specific recommendations routed to the owning L2.
- **Concierge** — a grounded Q&A assistant that answers how-to/process questions from an embedded knowledge layer (Obsidian vault → `knowledge_docs`).
- **Engram** — the self-improving loop: human corrections to agent drafts become eval sets and *Curator*-distilled memory rules.
- **Agent Farm** — catalog of team-built agents with usage stats and an hours-saved leaderboard.
- **Codex & System Map** — editable system reference (architecture, workflows) plus a one-page visualization of data flow, agents, and loops.
- **Feedback** — everyone can submit app feedback and see replies; the owner gets a full dashboard.
- **Role-aware access** — L1 / L2 / L3 / Admin, enforced by Supabase Row-Level Security.

## Architecture

Static single-page app (React + Babel via CDN, no build step) talking to a Supabase backend, with server-side agents on Modal.

| Layer | Where |
|-------|-------|
| UI | `CD-Copilot.html` + `*.jsx` view modules, loaded as in-browser Babel scripts |
| Data / auth | Supabase (Postgres + RLS + Auth), schema in `supabase/` |
| AI agents | Python LangGraph graphs on Modal (`agents/`): *Advisor, Scribe, Rollup, Sentry, Curator* — structured output, injection guardrails, retry + model fallback. *Concierge* chat still goes through the `relay-agent` Edge Function (OpenRouter proxy); *Dispatcher* stays deterministic JS |
| MCP | `mcp/server.mjs` (local stdio) and `mcp/remote-server.mjs` (Streamable HTTP on Render) expose the Supabase tables as read tools for Claude |
| Knowledge | `obsidian-vault/` exported/imported to `knowledge_docs` |
| Voice | `voice-agent/` — daily check-in voice agent config (Hooman Labs + Make.com) |

## Run locally

The app uses in-browser Babel, so it must be served over HTTP (not `file://`):

```bash
python3 -m http.server 8755
# open http://localhost:8755/CD-Copilot.html
```

## Repository layout

```
CD-Copilot.html      app entry (loads every view module)
index.html           redirect → CD-Copilot.html (GitHub Pages root)
app.jsx              boot + routing
components.jsx       shared UI
views-*.jsx          one module per screen (dashboard, ops, worklogs, goals,
                     engram, farm, codex, catalog, architecture, …)
tweaks-panel.jsx     reusable Tweaks shell + form-control helpers
data.js              bundled fallback data + collection helpers
supabase-client.js   Supabase loader, auth, persistence, agent calls
styles.css           styling
supabase/            SQL schema, RLS, auth, agents, Edge Functions
agents/              Python LangGraph agent graphs + Modal entrypoint + tests
mcp/                 MCP servers (local stdio + remote HTTP)
voice-agent/         voice check-in agent config
scripts/             seed/auth/Obsidian import-export utilities
obsidian-vault/      knowledge layer (agents, guidelines, people, org)
diagrams/            Mermaid agent-flow diagrams (+ rendered PNGs)
docs/                architecture write-ups
screenshots/         UI captures
```

## Deployment

- **App** — pushing to `main` auto-rebuilds GitHub Pages from the repository root; `vercel.json` serves the same app on Vercel (`/` → `CD-Copilot.html`).
- **Agents** — `modal deploy agents/modal_app.py` (secrets in the `relay-agents` Modal secret).
- **MCP** — `render.yaml` blueprint deploys `mcp/` as the `cd-relay-mcp` web service on Render.
