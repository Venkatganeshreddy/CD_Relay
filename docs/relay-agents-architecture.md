# Relay Agents — Combined Architecture

The four Relay agents (**Scribe, Rollup, Sentry, Curator**) share one execution
spine and are linked by a learning loop. Producers draft → humans edit/reject →
those corrections feed the Curator → distilled rules are re-injected into the
producers, which self-correct on their next run.

## Combined diagram

```
══════════════════════════════ RELAY AGENTS ══════════════════════════════

  TRIGGERS (views-relay.jsx / views-ops.jsx)
  ┌──────────────┬──────────────┬───────────────┬────────────────────────┐
  │ MOM Loader   │ WeeklyView   │ task block/    │ (scheduled / manual)   │
  │ paste txn    │ Regenerate   │ escalate event │ learning pass          │
  └──────┬───────┴──────┬───────┴───────┬────────┴──────────┬─────────────┘
         ▼              ▼               ▼                   ▼
  ┌────────────┐ ┌────────────┐ ┌────────────┐    ┌──────────────────┐
  │  SCRIBE    │ │  ROLLUP    │ │  SENTRY    │    │     CURATOR      │
  │ transcript │ │ weekly +   │ │ stuck task │    │ reads ENGRAM     │
  │ + roster   │ │ dept rpts  │ │ + context  │    │ (edits/rejects)  │
  │            │ │            │ │            │    │ group by agent   │
  │ build      │ │ gather +   │ │ build      │    │ N prompts (≤40   │
  │ prompt     │ │ build      │ │ 1-line     │    │ cases each)      │
  │ (4 outputs │ │ prompt     │ │ prompt     │    │                  │
  │ +1-shot ex)│ │ (cite ids) │ │            │    │                  │
  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘    └────────┬─────────┘
        │              │              │                    │
        └──────────────┴──────┬───────┴────────────────────┘
                              ▼
              ┌───────────────────────────────────┐
              │  run()  SHARED CORE                │  supabase-client.js:324
              │  • memoryFor(agent) → system msg ◄─┼──── learned rules
              │  • askAgent({messages, model})     │
              │  • time, price, log ai_runs+activity│
              └─────────────────┬─────────────────┘
                                │ sb.functions.invoke (JWT)
              ┌─────────────────┴─────────────────┐
              │  EDGE FUNCTION  relay-agent (Deno) │  verify_jwt ON
              │  OPENROUTER_API_KEY (server secret)│
              │  alias smart→Sonnet-4.6 / fast→Haiku│
              └─────────────────┬─────────────────┘
                                ▼
                  OpenRouter ──► Claude Sonnet 4.6
                                │ raw text
              ┌─────────────────┴─────────────────┐
              │  PER-AGENT PARSE (fail-soft)        │
              │  Scribe  → {agenda,attendees,       │
              │             summary,items}  | empty │
              │  Rollup  → {sections[] +cites} | null│
              │  Sentry  → "one line"          | null│
              │  Curator → {rules[]}           | skip│
              └─────────────────┬─────────────────┘
                                ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  CONSUMERS / WRITES                                                  │
   │  Scribe → Dispatcher(code) → tasks ─┐                               │
   │  Rollup → weekly_summaries draft    │                               │
   │  Sentry → escalation line in feed   │ human reviews / edits         │
   │  Curator→ relay_agents.data.memory ─┼──────────────┐                │
   └─────────────────────────────────────┼──────────────┼────────────────┘
                                          ▼              │
                          logInteraction(edit/reject)    │
                                          ▼              │
                          engram_interactions  ──────────┘
                          │                    Curator reads these
                          └──► Curator distills ──► memory ──► memoryFor()
                          ═══════════ LEARNING LOOP CLOSED ═══════════
```

## How they relate

| Agent | Position in the system | Output → consumer |
|-------|------------------------|-------------------|
| **Scribe** | producer | minutes → **Dispatcher** (code) → `tasks` |
| **Rollup** | producer | sections → `weekly_summaries` draft |
| **Sentry** | producer | one line → escalation in `activity` feed |
| **Curator** | meta / learner | rules → `relay_agents.memory` → re-injected into the other three |

## The shared spine (identical for all 4)

1. **`run()` core** — injects `memoryFor(agent)`, calls `askAgent`, logs `ai_runs` + `activity`. One funnel = uniform cost/latency observability.
2. **Edge Function** — Deno, holds the OpenRouter key server-side, JWT-gated. Routes `smart`→Sonnet-4.6.
3. **OpenRouter → Claude Sonnet 4.6** — single gateway, model swappable by alias.
4. **Fail-soft parse** — each agent degrades to empty/null/skip, never crashes the UI.

## What's unique per agent

- **Scribe / Rollup / Sentry** = one-shot transformers (input → LLM → output, no state change). Differ only in prompt shape + output contract.
- **Curator** = the only one that **reads agent exhaust** (`engram_interactions`), runs **N calls** (one per agent), and **writes back** to `relay_agents.memory`.
- **The loop**: producers draft → humans edit/reject → `logInteraction` → `engram_interactions` → Curator distills → `memory` → `memoryFor()` re-injects → producers self-correct. That feedback arc is the architecture's core mechanism, not any single agent.

## Tech stack

| Layer | Tech |
|-------|------|
| Client / engine | Vanilla JS (IIFE in `supabase-client.js`), React-via-Babel static app, no build step |
| Supabase SDK | `supabase-js` UMD (CDN) → `sb.functions.invoke()`, JWT from auth session |
| Transport | HTTPS POST `{messages, model}`; Supabase `verify_jwt` before invoke |
| Edge Function | Deno runtime (`Deno.serve`), TypeScript, Supabase Edge; `OPENROUTER_API_KEY` env secret |
| LLM gateway | OpenRouter (`/api/v1/chat/completions`) |
| Model | Anthropic Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`), alias `smart`, temp 0.3, max_tokens 4096 |
| Observability | `ai_runs` + `activity` rows → Supabase Postgres (jsonb), RLS-scoped |
| State source | `window.CDC.USERS` (roster) + `relay_agents.data.memory` (Curator rules), loaded from Postgres at boot |

## Per-agent flow diagrams

Each agent's real code path: trigger → prompt → `run()` core → Edge Function →
Claude Sonnet 4.6 → parse → output (with fail-soft fallback). Sources +
regeneration command in [`diagrams/agents/`](../diagrams/agents/README.md).

### Scribe — meeting transcript → action items
![Scribe flow](../diagrams/agents/scribe.png)

### Rollup — daily reports → weekly summary
![Rollup flow](../diagrams/agents/rollup.png)

### Sentry — stuck task → escalation line
![Sentry flow](../diagrams/agents/sentry.png)

### Curator — corrections → learned rules (self-evolving loop)
![Curator flow](../diagrams/agents/curator.png)

## Source

- `supabase-client.js:311-481` — agents engine (`run`, `runRollup`, `runSentry`, `runScribe`, `runCurator`, `memoryFor`)
- `supabase/functions/relay-agent/index.ts` — Deno → OpenRouter proxy
- `views-relay.jsx:306-491` — MOM Loader pipeline, Dispatcher, commit/learning writes
