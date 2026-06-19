"""Shared agent runtime — what every graph reuses.

- memory_for(): inject the preference rules Curator distilled (relay_agents.memory)
  so each agent self-corrects, exactly like the TS memoryFor().
- complete(): one model call WITH memory injected, that also logs an ai_runs +
  activity row so the existing dashboards keep seeing agent runs.
- extract_json(): pull the first {...} or [...] blob out of a model reply.
"""
import json
import re
import time
import uuid
from datetime import datetime, timezone, timedelta

from llm import llm, db_select, db_insert

_IST = timezone(timedelta(hours=5, minutes=30))


def _now_ist() -> str:
    return datetime.now(_IST).strftime("%Y-%m-%d %H:%M IST")


def _rid(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:10]


def memory_for(name: str) -> str:
    """Learned preferences for `name`, distilled by Curator from past corrections."""
    for x in db_select(f"relay_agents?select=data"):
        a = x.get("data", x)
        if a.get("name") == name:
            rules = (a.get("memory") or {}).get("rules") or []
            if rules:
                return (f"Learned preferences for {name}, distilled from past human "
                        "corrections — follow these:\n" + "\n".join(f"• {r}" for r in rules))
    return ""


def extract_json(text: str, open_char: str = "{"):
    close = "}" if open_char == "{" else "]"
    m = re.search(rf"\{open_char}[\s\S]*\{close}", text or "")
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def complete(agent: str, prompt: str, model: str = "smart", input_label: str = "") -> str:
    """Model call with learned memory injected + ai_runs/activity logging.

    ponytail: costUsd left 0 here — the dashboard's cost table is TS-side; wire a
    Python cost calc only if these runs need accurate spend, not just visibility.
    """
    t0 = time.time()
    mem = memory_for(agent)
    msgs = ([{"role": "system", "content": mem}] if mem else []) + [{"role": "user", "content": prompt}]
    outcome, content, usage = "OK", "", None
    try:
        resp = llm(model).invoke(msgs)
        content = resp.content or ""
        usage = getattr(resp, "usage_metadata", None)
    except Exception as e:
        outcome, content = "ERROR", str(e)

    run_id = _rid("run-")
    db_insert("ai_runs", [{"id": run_id, "agent": agent, "data": {
        "id": run_id, "agent": agent, "model": model, "latencyMs": int((time.time() - t0) * 1000),
        "tokensIn": (usage or {}).get("input_tokens", 0), "tokensOut": (usage or {}).get("output_tokens", 0),
        "costUsd": 0, "outcome": outcome, "ts": _now_ist(), "scopeHash": "live",
        "input": input_label, "output": content[:240],
    }}])
    act_id = _rid("act-")
    db_insert("activity", [{"id": act_id, "data": {
        "id": act_id, "kind": "agent", "ts": _now_ist(),
        "text": f"{agent} {'ran' if outcome == 'OK' else 'failed'}" + (f" · {input_label}" if input_label else ""),
        "icon": "⚙",
    }}])

    if outcome == "ERROR":
        raise RuntimeError(content)
    return content
