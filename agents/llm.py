"""Shared LLM + Supabase access for every Relay agent graph.

One place for: the model client (OpenRouter via the OpenAI-compatible API, so
LangSmith tracing works for free), and read helpers against Supabase's REST API
using the service-role key (bypasses RLS — these run server-side only).
"""
import os
import httpx
from langchain_openai import ChatOpenAI

# Models — same slugs the TS edge functions use, kept in sync via env.
FAST = os.environ.get("LLM_MODEL_FAST", "anthropic/claude-haiku-4.5")
SMART = os.environ.get("LLM_MODEL_SMART", "anthropic/claude-sonnet-4.6")


def llm(model: str = "smart", temperature: float = 0.3) -> ChatOpenAI:
    """A LangChain chat model pointed at OpenRouter.

    LangSmith tracing turns on automatically when LANGCHAIN_TRACING_V2=true and
    LANGCHAIN_API_KEY are set in the Modal secret — no code changes needed.
    """
    slug = {"fast": FAST, "smart": SMART}.get(model, model or SMART)
    return ChatOpenAI(
        model=slug,
        temperature=temperature,
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
        default_headers={"HTTP-Referer": "https://relay.nxtwave.io", "X-Title": "Relay Agents"},
    )


# ── Supabase REST (service role; server-side only) ──────────────────────────
_URL = os.environ.get("SUPABASE_URL", "")
_SVC = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def db_select(path: str) -> list:
    """GET /rest/v1/<path> — e.g. 'worklogs?select=data&order=ts.desc&limit=200'.

    Service role bypasses RLS, so callers must scope explicitly in the query.
    """
    if not _URL or not _SVC:
        return []
    r = httpx.get(
        f"{_URL}/rest/v1/{path}",
        headers={"apikey": _SVC, "Authorization": f"Bearer {_SVC}"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def db_insert(table: str, rows: list) -> bool:
    if not rows:
        return True
    r = httpx.post(
        f"{_URL}/rest/v1/{table}",
        headers={"apikey": _SVC, "Authorization": f"Bearer {_SVC}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        json=rows, timeout=30,
    )
    return r.is_success


def db_update(table: str, row_id: str, data: dict) -> bool:
    """PATCH one row by id — used by Curator to persist distilled memory."""
    if not _URL or not _SVC:
        return False
    r = httpx.patch(
        f"{_URL}/rest/v1/{table}?id=eq.{row_id}",
        headers={"apikey": _SVC, "Authorization": f"Bearer {_SVC}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        json={"data": data}, timeout=30,
    )
    return r.is_success
