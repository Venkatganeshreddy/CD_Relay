# Roadmap Planner — Architecture & Implementation Plan

**What it is.** A month-end agent that reads a team's execution data out of Relay,
diffs *planned vs. executed*, surfaces strengths / gaps / risks / opportunities,
and opens a structured conversation with the L2 inside Concierge that ends in a
data-backed next-month roadmap — written straight into `goals`.

("Curator" is already taken by the learning-loop agent, so this ships as
**Planner**: graph `agents/graphs/planner.py`, endpoint `/run/planner`.)

**Design rule: no new machinery.** Every layer reuses an existing, proven path:

| Need | Reused from |
|------|-------------|
| Agent runtime (structured output, retries, guardrail, `ai_runs` logging) | `graphs/common.py` — same spine as Advisor/Rollup |
| Grounding (cite-check → retry) | Rollup's `ground_check` pattern (`rollup.py:54`) |
| Month-end trigger | `advisor-cron` clone + one `pg_cron` line (`17_advisor_cron.sql`) |
| Planning-style memory | `relay_agents.data.memory` + `memory_for("Planner")` — the doc she shares becomes seeded rules, zero new mechanism |
| L2 conversation surface | Concierge (`views-copilot.jsx`) — grounded system prompt + confirm-gated `action` blocks |
| Roadmap writes | Existing `goals` table (`29_goals.sql`), existing RLS (`app.sub_in_scope`) |

The only genuinely new pieces: **one graph file, one table, one cron'd edge
function, one Concierge context block + two action types.**

## Combined diagram

```
════════════════════════════ ROADMAP PLANNER ════════════════════════════

  TRIGGER (last week of month)                    (manual "Run Planner now")
  pg_cron '0 1 25 * *' ──► planner-cron (Edge Fn, x-cron-secret)
                                │  POST /run/planner {sub} per pilot team
                                ▼
  ┌──────────────────── MODAL  graphs/planner.py ────────────────────────┐
  │ fetch ──► analyze ──► ground_check ──► persist                       │
  │                                                                      │
  │ fetch: month window, per sub                                         │
  │   goals            → the PLAN (title + deliverables)                 │
  │   worklogs/tasks   → the EXECUTION (done/blocked/overdue, hours,     │
  │                      output categories)                              │
  │   weekly_digests   → achievement lines, week by week                 │
  │   weekly_summaries → Rollup highlights / risks / asks                │
  │   moms             → Second Brain: decisions + still-open items      │
  │   kpis/dept_health → team performance                                │
  │                                                                      │
  │ analyze (complete_json → PlannerOut, memory_for("Planner") injected):│
  │   • per-goal diff: planned vs executed, evidence cites               │
  │   • strengths / gaps / risks / opportunities                         │
  │   • questions[] — the structured L2 conversation opener              │
  │   • goals[] draft — next month, each with data-backed rationale      │
  │                                                                      │
  │ ground_check: cited ids must exist in fetched rows → retry once      │
  │ persist: roadmap_drafts row (DRAFT) + activity ping                  │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
                    roadmap_drafts (new table, RLS = goals')
                                     │
                     L2 opens Concierge · "Roadmap" category
                                     ▼
  ┌──────────────────── CONCIERGE (existing chat) ───────────────────────┐
  │ system prompt += PLANNING block (open draft in scope: analysis,      │
  │ questions, draft goals) — same pattern as WORKLOGS/BUDGET blocks     │
  │                                                                      │
  │ agent asks the contextual questions ⇄ L2 answers / edits              │
  │ every change = existing confirm-gated ActionCard:                    │
  │   {"type":"update_roadmap_draft", draftId, patch}                    │
  │   {"type":"finalize_roadmap",     draftId}                           │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
              finalize → goals rows for next month (sub-scoped RLS)
                                     │
        next month's execution flows into worklogs/digests/moms …
        ══════════════ LOOP: every cycle grounds the next ══════════════
```

## New components

### 1. `agents/graphs/planner.py` (the analysis graph)

Same shape as Rollup: `fetch → analyze → ground_check → (retry once) → persist`.
One `complete_json` call on `smart`, validated against:

```python
class PlannerFinding(BaseModel):
    kind: str            # strength | gap | risk | opportunity
    text: str
    cites: list[str] = []

class PlannerGoalDraft(BaseModel):
    title: str
    deliverables: list[str] = []
    rationale: str = ""   # data-backed why
    cites: list[str] = []

class PlannerOut(BaseModel):
    executionDiff: list[PlannerFinding] = []   # per current goal: planned vs done
    findings: list[PlannerFinding] = []        # strengths/gaps/risks/opportunities
    questions: list[str] = []                  # opener for the L2 conversation
    goals: list[PlannerGoalDraft] = []         # next-month draft
```

All month-window rows go in with real ids in square brackets (Rollup style);
`ground_check` drops/retries hallucinated cites. Untrusted rows are `fence()`d.
Endpoint added to `modal_app.py` as `/run/planner`.

### 2. `roadmap_drafts` (one table)

```sql
create table if not exists roadmap_drafts (
  id         text primary key,            -- 'rd-2026-08-genai'
  dept       text,
  sub        text,
  month      date,                        -- first day of the month being planned
  status     text default 'DRAFT',        -- DRAFT / IN_REVIEW / FINAL
  data       jsonb not null default '{}', -- PlannerOut + L2 edits + Q&A log
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- RLS identical to goals: read = any signed-in; write = app.sub_in_scope(sub)
```

### 3. `planner-cron` (Edge Function) + schedule

Clone of `advisor-cron`: validates `x-cron-secret`, loops the pilot subs
(Fullstack, GenAI), POSTs `/run/planner` with `x-relay-secret`. Scheduled
`0 1 25 * *` (25th, 06:30 IST — the "last week of the month"). Manual re-run =
same POST. Rollback = `cron.unschedule('planner-monthly')`.

### 4. Concierge: Roadmap category (client only)

- **Category chips** above the composer (Roadmap · Team performance · …) that
  prefill scoped prompts — same mechanic as today's `actionExamples`. This is
  the "one-stop action-trigger categories" surface; adding a future category =
  adding a chip + a context block.
- **PLANNING block** in `buildSystemPrompt`: when an open `roadmap_drafts` row
  is in the user's scope, inject its analysis + questions + draft goals, and
  instruct the agent to drive the structured conversation (ask, don't dump).
- **Two new actions** in `parseActions`/`executeAction` (both behind the
  existing Confirm card):
  - `update_roadmap_draft` — patch `data` (edit goals/deliverables, log answers)
  - `finalize_roadmap` — set `status=FINAL` and insert next month's `goals`
    rows for that sub

### 5. Planning-style seeding (no code)

The department's execution planning-style notes → 3–7 imperative rules stored
on the Planner's `relay_agents` row (`data.memory.rules`). `memory_for("Planner")`
already injects them into every run; later, Curator keeps refining them from
L2 edits (`engram_interactions`) — the Planner joins the standing learning loop
for free.

## Security / trust

- Same trust chain as every agent: browser never holds secrets; cron path is
  `x-cron-secret` → edge → `x-relay-secret` → Modal; service-role key only on Modal.
- All fetched rows are fenced as untrusted data (`SECURITY_SYS` guardrail).
- Nothing writes without a human: the draft is inert until the L2 confirms
  each action; `finalize_roadmap` is gated by `app.sub_in_scope` RLS — an L2
  can only finalize their own sub's roadmap.

## Dependency (called out honestly)

Analysis quality = data density. If a team's worklogs/digests are thin for the
month, the Planner degrades to KPI + Second Brain signals and says so in the
draft. This is why 100% Fullstack + GenAI adoption this window directly feeds
the first real run (Jul 27–31 planning cycle).

## Delivery plan

| Phase | Scope | Done by |
|-------|-------|---------|
| **1 — Analysis** | `planner.py` + schemas, `roadmap_drafts` table, `planner-cron` + schedule, Modal deploy; first end-to-end draft for GenAI + Fullstack visible in Second Brain | **Jul 17** |
| **2 — Conversation** | Concierge Roadmap category: PLANNING block, category chips, `update_roadmap_draft` / `finalize_roadmap` actions; planning-style rules seeded | **Jul 24** |
| **3 — Live cycle** | Pilot L2s run the real Aug planning conversation; finalize writes Aug `goals`; corrections start feeding Curator | **Jul 27–31** |

## Source map

- `agents/graphs/rollup.py` / `advisor.py` — the graph patterns being cloned
- `agents/graphs/common.py` — shared runtime (structured output, memory, fence, logging)
- `supabase/functions/advisor-cron/` + `supabase/17_advisor_cron.sql` — the cron pattern
- `views-copilot.jsx` (`buildSystemPrompt`, `parseActions`, `executeAction`) — the conversation + action surface
- `supabase/29_goals.sql` — the table the finalized roadmap lands in
