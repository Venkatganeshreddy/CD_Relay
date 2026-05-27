# Relay — Department Operating Copilot

Relay is an AI-assisted operating layer for the **CD - Curriculum Development** department. It turns daily reports, weekly roll-ups, tasks, and meeting notes into a single, queryable workspace backed by a roster of purpose-built AI agents.

**Live:** https://venkatganeshreddy.github.io/CD_Relay/

## What it does

- **Daily reporting** — people submit work per task; submissions drive missing-report tracking and weekly/monthly consolidation.
- **Weekly roll-ups** — the *Rollup* agent drafts weekly sections from the department's daily reports, with citations.
- **Task & escalation flow** — hierarchical task visibility (L3 → L2 → L1) plus server-side, tiered auto-escalation of blocked/overdue work.
- **MoM loader** — the *Scribe* agent extracts action items from meeting transcripts and the *Dispatcher* routes them to the right owner.
- **Concierge** — a grounded Q&A assistant that answers how-to/process questions from an embedded knowledge layer (Obsidian vault → `knowledge_docs`).
- **Role-aware access** — L1 / L2 / L3 / Admin, enforced by Supabase Row-Level Security.

## Architecture

Static single-page app (React + Babel via CDN, no build step) talking to a Supabase backend.

| Layer | Where |
|-------|-------|
| UI | `CD-Copilot.html` + `*.jsx` view modules, loaded as in-browser Babel scripts |
| Data / auth | Supabase (Postgres + RLS + Auth), schema in `supabase/` |
| AI agents | Supabase Edge Function `relay-agent` proxying OpenRouter (Claude Haiku / Sonnet) |
| Knowledge | `obsidian-vault/` exported/imported to `knowledge_docs` |

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
views-*.jsx          one module per screen (dashboard, ops, submit, copilot, …)
data.js              bundled fallback data + collection helpers
supabase-client.js   Supabase loader, auth, persistence, agent calls
styles.css           styling
supabase/            SQL schema, RLS, auth, agents, Edge Function
scripts/             seed/auth/Obsidian import-export utilities
obsidian-vault/      knowledge layer (agents, guidelines, people, org)
screenshots/         UI captures
```

## Deployment

Pushing to `main` auto-rebuilds GitHub Pages from the repository root.
