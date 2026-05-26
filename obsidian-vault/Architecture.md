---
type: architecture
title: Architecture
---

# Architecture

Seven layers, from user-facing to data:

1. **Experience — dashboards, Submit, Concierge, Codex**
2. **Agents — the 13 agents that draft and act**
3. **Orchestration — workflow engine + eval-gated promotion**
4. **Core services — RBAC, citation builder, KPI calculator**
5. **Integration — Teams/Outlook (Graph), OpenRouter, MCP**
6. **Data — Postgres + pgvector (reports, tasks, memory)**
7. **Cross-cutting — auth, audit, cost (Meter)**

## Agents
- [[Scribe]] — Extract action items from a MOM
- [[Dispatcher]] — Match items to people, draft tasks
- [[Cartographer]] — Build & maintain the memory graph
- [[Concierge]] — Chat — how-to, feedback, Second Brain query
- [[Nudge]] — Chase missing daily reports via Teams
- [[Rollup]] — Derive weekly reports
- [[Ledger]] — Compile monthly worklogs
- [[Bursar]] — Pull tool spend, parse invoices, attribute cost
- [[Curator]] — Cluster Engram corrections, propose guideline edits
- [[Sentry]] — Surface blocked + overdue tasks
- [[Quartermaster]] — Draft Agent Farm cards, flag dead links
- [[Meter]] — Log tokens + cost per LLM call
- [[Briefer]] — Compile monthly check-in brief per L2

## Workflows
- [[Daily report flow]]
- [[Weekly rollup flow]]
- [[Monthly worklog flow]]
- [[MOM → tasks flow]]
- [[Missing-report nudge]]
- [[Tool expense flow]]
- [[Eval-gated promotion]]
- [[Guideline evolution]]
