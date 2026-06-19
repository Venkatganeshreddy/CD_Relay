"""Modal entrypoint for Relay's Python agents.

Exposes one authenticated HTTP endpoint per agent graph. Protected by a shared
secret (RELAY_AGENT_SECRET) rather than the Supabase JWT, because the callers
are server-side: the `advisor-cron` edge function (unattended) and a thin authed
edge function that forwards the browser's request. Secrets live in a Modal
secret named "relay-agents".

Deploy:  modal deploy agents/modal_app.py
Test:    curl -X POST $URL/run/advisor -H "x-relay-secret: $RELAY_AGENT_SECRET"
"""
import os
import modal

image = (
    modal.Image.debian_slim()
    .pip_install_from_requirements("requirements.txt")
    .add_local_dir(".", remote_path="/root")  # llm.py + graphs/ importable
)
app = modal.App("relay-agents")
secret = modal.Secret.from_name("relay-agents")  # OPENROUTER_API_KEY, SUPABASE_*, LANGCHAIN_*, RELAY_AGENT_SECRET


def _auth(x_relay_secret: str):
    from fastapi import HTTPException
    if x_relay_secret != os.environ.get("RELAY_AGENT_SECRET"):
        raise HTTPException(status_code=401, detail="bad secret")


@app.function(image=image, secrets=[secret])
@modal.fastapi_endpoint(method="GET")
def health():
    # Unauthenticated liveness check: confirms the app boots and the model slug is set.
    return {"ok": True, "model": os.environ.get("LLM_MODEL_SMART", "anthropic/claude-sonnet-4.6")}


@app.function(image=image, secrets=[secret], timeout=120)
@modal.fastapi_endpoint(method="POST", docs=True)
def run_advisor(item: dict, x_relay_secret: str = ""):
    _auth(x_relay_secret)
    from graphs.advisor import run
    return {"items": run(item.get("kinds"))}


@app.function(image=image, secrets=[secret], timeout=120)
@modal.fastapi_endpoint(method="POST", docs=True)
def run_scribe(item: dict, x_relay_secret: str = ""):
    _auth(x_relay_secret)
    from graphs.scribe import run
    return run(item.get("transcript", ""))


@app.function(image=image, secrets=[secret], timeout=120)
@modal.fastapi_endpoint(method="POST", docs=True)
def run_rollup(item: dict, x_relay_secret: str = ""):
    _auth(x_relay_secret)
    from graphs.rollup import run_rollup, run_weekly_digest
    if item.get("streams") is not None:
        return {"digest": run_weekly_digest(item)}
    return {"sections": run_rollup(item.get("weekly") or {})}


@app.function(image=image, secrets=[secret], timeout=60)
@modal.fastapi_endpoint(method="POST", docs=True)
def run_sentry(item: dict, x_relay_secret: str = ""):
    _auth(x_relay_secret)
    from graphs.sentry import run
    return {"line": run(item)}


@app.function(image=image, secrets=[secret], timeout=180)
@modal.fastapi_endpoint(method="POST", docs=True)
def run_curator(item: dict, x_relay_secret: str = ""):
    _auth(x_relay_secret)
    from graphs.curator import run
    return {"results": run(item.get("agent", ""))}
