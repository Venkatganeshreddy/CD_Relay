# Roadmap Planner — Execution PRD

**Owner:** GenAI team · **Status:** Approved for build · **Target: live for the Aug planning cycle (Jul 27–31, 2026)**
Companion doc: [roadmap-planner-architecture.md](roadmap-planner-architecture.md) · Flow image: [diagrams/agents/planner.png](../diagrams/agents/planner.png)

## 1. Problem

Monthly roadmap discussions review last month's execution and plan next month's
goals. Today that takes **2–3 iterations** per team because the review is
assembled by hand from memory and scattered artifacts — even though Relay
already holds the ground truth (goals, worklogs, digests, weekly summaries,
Second Brain, KPIs).

## 2. Outcome & success metrics

| Metric | Baseline | Target (first 2 cycles) |
|--------|----------|------------------------|
| Roadmap iterations to finalize | 2–3 | **≤ 2, trending to 1** |
| Draft-goal acceptance (kept vs. rewritten by L2) | — | **≥ 60% kept/lightly edited** |
| Analysis claims with valid data citations | — | **100% (ground-checked)** |
| Pilot coverage | 0 | **Fullstack + GenAI L2s complete a full cycle in Concierge** |

## 3. Users & pilot scope

- **Primary:** L2 team leads (pilot: Fullstack, GenAI) — receive the analysis, run the curation conversation, finalize the roadmap.
- **Secondary:** L3/Admin — read drafts and finals in scope; can trigger a manual run.
- Out of pilot: all other teams (enable per sub by adding it to the cron list — no code).

## 4. What ships

### Phase 1 — Month-end analysis *(done by Jul 17)*

| # | Deliverable | Where |
|---|-------------|-------|
| 1.1 | `PlannerOut` schemas (executionDiff, findings, questions, draft goals — all with cites) | `agents/graphs/schemas.py` |
| 1.2 | Planner graph: `fetch → analyze → ground_check → (retry once) → persist` | `agents/graphs/planner.py` (new) |
| 1.3 | `/run/planner` endpoint + deploy | `agents/modal_app.py` |
| 1.4 | `roadmap_drafts` table + RLS (read: signed-in; write: `app.sub_in_scope`) | `supabase/33_roadmap_drafts.sql` (new) |
| 1.5 | `planner-cron` Edge Function (advisor-cron clone) + `pg_cron` schedule `0 1 25 * *` | `supabase/functions/planner-cron/`, `supabase/34_planner_cron.sql` (new) |
| 1.6 | Planner row in `relay_agents` roster; planning-style rules seeded into `data.memory.rules` | seed SQL / admin |
| 1.7 | Pure-logic test (fetch filtering + ground-check) | `agents/graphs/test_planner.py` (new) |

**Acceptance:** manual POST to `/run/planner {sub:"GenAI"}` produces a
`roadmap_drafts` row whose every finding cites only real row ids; `ai_runs`
shows the run with tokens/cost; thin-data month degrades to KPI + Second Brain
signals with an explicit "low data density" note in the draft — never an error.

### Phase 2 — Concierge conversation *(done by Jul 24)*

| # | Deliverable | Where |
|---|-------------|-------|
| 2.1 | Category chips row (Roadmap · Team performance · …) prefilling scoped prompts | `views-copilot.jsx` |
| 2.2 | PLANNING context block: open draft in scope → analysis + questions + draft goals injected into `buildSystemPrompt`, with "drive the conversation — ask, don't dump" instruction | `views-copilot.jsx` |
| 2.3 | Action `update_roadmap_draft` (patch goals/deliverables, log Q&A) — confirm-gated | `views-copilot.jsx` (`parseActions`/`executeAction`) |
| 2.4 | Action `finalize_roadmap` — sets `status=FINAL`, inserts next month's `goals` rows — confirm-gated | `views-copilot.jsx` + `supabase-client.js` |
| 2.5 | Draft visible in Second Brain (read-only card linking into Concierge) | `views-relay.jsx` |
| 2.6 | L2 edits logged to `engram_interactions` so Curator refines Planner memory | existing `logInteraction` |

**Acceptance:** an L2 opens Concierge → Roadmap chip → answers the agent's
questions → edits one goal → finalizes; next month's `goals` rows appear for
their sub only (RLS blocks another sub's L2); every write showed a Confirm
card first; the full Q&A survives in `roadmap_drafts.data`.

### Phase 3 — Live cycle *(Jul 27–31)*

Cron fires Jul 25; pilot L2s run the real August planning conversation.
We shadow the first two sessions, collect corrections, and let Curator distill
them into Planner memory. Exit review: metrics table above.

## 5. Data contract

- **Inputs (read-only, month window, per sub):** `goals`, `worklogs`, `tasks`,
  `weekly_digests`, `weekly_summaries`, `moms`, `kpis`, `dept_health`.
- **Output:** `roadmap_drafts.data = PlannerOut + edits + qaLog`; on finalize →
  `goals` rows `{id, dept, sub, title, deliverables[]}` for the next month.
- **States:** `DRAFT` (agent-written) → `IN_REVIEW` (conversation started) →
  `FINAL` (goals written). One draft per sub per month (`rd-<YYYY-MM>-<sub>`).

## 6. Guardrails (non-negotiable)

1. **No autonomous writes** — every mutation goes through the existing Confirm
   ActionCard; the cron only ever writes `roadmap_drafts` + `activity`.
2. **Grounding** — cite-check against fetched ids, one retry, invalid cites
   dropped; claims without citations don't ship in the draft.
3. **Prompt-injection fence** — all DB rows enter prompts inside `fence()`.
4. **RLS** — finalize is scoped by `app.sub_in_scope`; secrets stay server-side
   (`x-cron-secret` → edge, `x-relay-secret` → Modal).
5. **Rollback** — `cron.unschedule('planner-monthly')` kills the trigger;
   unset `MODAL_PLANNER_URL` disables the agent; the table is inert without it.

## 7. Dependencies & risks

| Risk / dependency | Impact | Mitigation |
|-------------------|--------|------------|
| Low adoption → thin execution data | Weak analysis | Adoption drive running now (100% Fullstack + GenAI by Jul 10); draft self-reports data density |
| Planning style mismatch | Drafts rewritten heavily | Style notes seeded as memory rules before Phase 3; Curator loop refines from L2 edits |
| LLM output drift | Broken drafts | Pydantic-validated structured output; fail-soft to empty draft + activity alert |
| Cron misfire on the 25th | No draft | Manual `Run Planner now` path is identical to the cron path |
| Concierge context bloat (draft + corpus) | Token cost/latency | PLANNING block only injected when an open draft exists in scope |

## 8. Explicitly out of scope (v1)

Real-time in-meeting roadmap assistance; cross-department portfolio rollups;
auto-finalize; editing past months; any new chat surface (Concierge is the
one-stop shell — future categories are chips + context blocks, not new UIs).
