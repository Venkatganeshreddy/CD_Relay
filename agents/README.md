# Relay agents — Python / LangGraph on Modal

Server-side agent graphs (LangGraph), one HTTP endpoint each on Modal. Every
agent injects Curator-distilled memory and logs `ai_runs`/`activity` so the
existing dashboards keep working. **Dispatcher stays in JS** — deterministic
routing, no LLM, nothing to move. **Concierge** is interactive chat and still
runs through the `relay-agent` proxy.

## Agents
| Graph | Shape |
|-------|-------|
| `advisor` | fetch DB → generate → ground-check refs → retry-if-weak |
| `scribe`  | fetch roster → extract → ground attendees to real speakers → resolve assignees |
| `rollup`  | fetch reports → generate sections → ground-check cites → retry-if-weak (+ `weekly_digest`) |
| `sentry`  | generate → enforce one-line/length → regenerate-if-empty |
| `curator` | fetch corrections → group by agent → distill rules → persist to `relay_agents.memory` |

## Reliability & safety
- **Structured output:** every agent call is forced into a Pydantic schema
  (`graphs/schemas.py`) via `.with_structured_output` and validated before any DB
  write — no regex JSON parsing.
- **Prompt-injection guardrail:** untrusted input (transcripts, DB rows, human
  drafts) is wrapped with `fence()` and a standing system message tells the model
  to treat it as data, never instructions. `fence()` strips injected markers.
- **Resilience:** each call retries with exponential backoff, then falls back to
  the other model tier (smart↔fast) before degrading to an empty result.

## Layout
- `llm.py` — model client (OpenRouter, LangSmith-traced) + Supabase REST (select/insert/update)
- `graphs/common.py` — structured/text model calls, memory injection, guardrail, `ai_runs` logging
- `graphs/schemas.py` — Pydantic output schemas (one per agent)
- `graphs/<agent>.py` — one graph each; `graphs/test_*.py` — pure-logic checks
- `modal_app.py` — Modal endpoints (`/run/advisor`, `/run/scribe`, `/run/rollup`, `/run/sentry`, `/run/curator`)

## Deploy
1. `pip install modal && modal token new`
2. Create the Modal secret `relay-agents` with:
   - `OPENROUTER_API_KEY`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RELAY_AGENT_SECRET` (long random string — callers send it as `x-relay-secret`)
   - optional: `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY` (LangSmith)
   - optional: `LLM_MODEL_FAST`, `LLM_MODEL_SMART`
   ```
   modal secret create relay-agents OPENROUTER_API_KEY=... SUPABASE_URL=... \
     SUPABASE_SERVICE_ROLE_KEY=... RELAY_AGENT_SECRET=... LANGCHAIN_TRACING_V2=true LANGCHAIN_API_KEY=...
   ```
3. `modal deploy agents/modal_app.py` → note the endpoint URL.

## Cut-over status

All five LLM agents run on Modal with the **same safe pattern**: try Modal first →
auto-fallback to the original inline path → instant rollback by unsetting the agent's
URL. Every response/run carries a `path` (`modal`|`inline`) for monitoring.

| Agent | Trigger | Enable secret | Endpoint | Fallback |
|-------|---------|---------------|----------|----------|
| **Advisor** | cron (server→server) | `MODAL_ADVISOR_URL` on `advisor-cron` | `/run/advisor` | inline OpenRouter |
| **Rollup** (+ digest) | browser → `relay-agent` proxy | `MODAL_ROLLUP_URL` on `relay-agent` | `/run/rollup` | inline prompt |
| **Scribe** | browser → `relay-agent` proxy | `MODAL_SCRIBE_URL` on `relay-agent` | `/run/scribe` | inline prompt |
| **Sentry** | browser → `relay-agent` proxy | `MODAL_SENTRY_URL` on `relay-agent` | `/run/sentry` | inline template |
| **Curator** | browser → `relay-agent` proxy | `MODAL_CURATOR_URL` on `relay-agent` | `/run/curator` | inline distill |
| **Dispatcher** | — | — (stays in JS, deterministic routing, no LLM) | — | — |

Notes:
- **Advisor** is the only cron path — server-to-server, shared secret only (no JWT).
  The browser "Run Advisor now" button still uses the inline prompt; wire it via the
  proxy later if wanted.
- **Browser-path agents** go through `relay-agent`, which is JWT-gated by Supabase, so
  the shared secret never leaves the server. `RELAY_AGENT_SECRET` must match Modal's.
- **Curator** writes distilled rules to `relay_agents` on Modal; the client mirrors them
  into the live session so `memoryFor()` applies them without a reload.

### First cut-over (you run these)
```
modal deploy agents/modal_app.py                 # note the printed URLs
curl "$HEALTH_URL"                                # GET /health -> {"ok":true,...}
# point the cron at Modal:
supabase secrets set MODAL_ADVISOR_URL=<run_advisor URL> RELAY_AGENT_SECRET=<same secret as Modal>
# smoke-test Advisor end-to-end (expects {"path":"modal",...}):
curl -X POST "$CRON_URL" -H "x-cron-secret: $CRON_SECRET"
# rollback if needed:  supabase secrets unset MODAL_ADVISOR_URL
```

### Rollup cut-over (browser path)
```
# relay-agent holds the Modal URL + secret; the browser only sends {modal,payload}.
supabase secrets set MODAL_ROLLUP_URL=<run_rollup URL> RELAY_AGENT_SECRET=<same secret as Modal>
# then in the app: open a weekly (runRollup) / generate a digest (runWeeklyDigest).
# verify Modal ran: ai_runs shows a Rollup row with no client-side duplicate.
# rollback:  supabase secrets unset MODAL_ROLLUP_URL   (client falls back to inline)
```

### Scribe / Sentry / Curator cut-over (browser path)
```
supabase secrets set MODAL_SCRIBE_URL=<run_scribe URL> \
  MODAL_SENTRY_URL=<run_sentry URL> MODAL_CURATOR_URL=<run_curator URL> \
  RELAY_AGENT_SECRET=<same secret as Modal>
# exercise each in the app: MOM loader (Scribe), an escalation (Sentry), a Curator run.
# rollback any one:  supabase secrets unset MODAL_<AGENT>_URL
```

`ai_runs` now records real token counts, a rough `costUsd`, the resolved model
slug, and `via:"modal"` for every agent run on the Python service.

## Test (pure logic — no network)
```
cd agents && pip install -r requirements.txt
python graphs/test_advisor.py && python graphs/test_scribe.py && python graphs/test_common.py
```

## Run a real agent locally
```
cd agents
OPENROUTER_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
python -c "from graphs.advisor import run; print(run())"
```

## Production cut-over checklist
Do these in order. Each agent can be enabled (and rolled back) independently.

1. **Deploy Modal.** `modal deploy agents/modal_app.py` → note the per-endpoint URLs.
   Create the `relay-agents` Modal secret (see "Deploy" above): `OPENROUTER_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RELAY_AGENT_SECRET`, optional
   `LANGCHAIN_*` / `LLM_MODEL_*`.
2. **Health check.** `curl "$HEALTH_URL"` → `{"ok":true,...}`.
3. **Deploy the edge functions** (they now contain the Modal-forward branches):
   `supabase functions deploy relay-agent` and the `advisor-cron` deploy script.
   Confirm `relay-agent` keeps **`verify_jwt` ON** (the browser-path security basis).
4. **Enable agents one at a time** by setting the secret, then exercising it:
   - Advisor: `supabase secrets set MODAL_ADVISOR_URL=...` on `advisor-cron`; trigger the cron.
   - Rollup / Scribe / Sentry / Curator: `supabase secrets set MODAL_<AGENT>_URL=...` +
     `RELAY_AGENT_SECRET=...` on `relay-agent`; exercise in the app.
5. **Verify each** in `ai_runs`: a row per run with the correct `agent`, `model` slug,
   `via:"modal"`, non-zero `tokensIn/Out`, and a `costUsd`. Cron/Advisor responses show
   `"path":"modal"`.
6. **Test fallback** for one agent: unset its `MODAL_<AGENT>_URL` → confirm it still
   works (inline path) with no user-visible error. Re-set to re-enable.
7. **Rollback** anytime: `supabase secrets unset MODAL_<AGENT>_URL` — no redeploy.
