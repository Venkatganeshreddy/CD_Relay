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

## Layout
- `llm.py` — model client (OpenRouter, LangSmith-traced) + Supabase REST (select/insert/update)
- `graphs/common.py` — memory injection + `ai_runs` logging shared by every agent
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

## Wire it up (not done yet)
The graphs run; the browser/cron still call the old TS agents. To switch over:
- **Cron path:** point `advisor-cron` at the Modal `/run/advisor` URL (send `x-relay-secret`).
- **Browser path:** have the authed `relay-agent` edge function forward to the matching
  Modal endpoint with the secret, so the browser never holds it (Supabase JWT still gates).
- Repoint `window.CDC.agents.run*` callers from the inline prompts to those endpoints.

## Test (pure logic — no network)
```
cd agents && pip install -r requirements.txt
python graphs/test_advisor.py && python graphs/test_scribe.py
```

## Run a real agent locally
```
cd agents
OPENROUTER_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
python -c "from graphs.advisor import run; print(run())"
```
