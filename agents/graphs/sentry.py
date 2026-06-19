"""Sentry — draft a one-line escalation brief for a stuck/blocked task.

Routing (who the next manager is) stays deterministic in the caller; Sentry only
writes the human-facing rationale. Graph: generate -> enforce (trim to one line,
strip quotes, cap length) -> regenerate once if it came back empty.
"""
from typing import TypedDict

from langgraph.graph import StateGraph, END

from graphs.common import complete, fence


class S(TypedDict, total=False):
    task: dict
    event: str
    target: str
    targetLevel: str
    daysStuck: int
    reason: str
    line: str
    attempts: int


def generate(state: S) -> S:
    t = state["task"]
    target = state.get("target") or "the manager"
    lvl = f" ({state['targetLevel']})" if state.get("targetLevel") else ""
    prompt = (
        "You are Sentry, the task-escalation agent for an ops team. "
        "A task needs a manager's attention. Write ONE concise line (max 160 chars, no preamble, no quotes) "
        f"that tells {target}{lvl} "
        f"why this is being {state.get('event','escalated')} and what to do next. "
        "Be specific and action-oriented; do not restate the obvious.\n\n"
        + fence(
            f"Task: \"{t.get('title','')}\"\nStatus: {t.get('status','')}\n"
            f"Owner: {t.get('ownerName') or t.get('owner','')}\n"
            f"Why flagged: {state.get('reason') or t.get('blockReason') or 'unspecified'}\n"
            + (f"Stuck for: ~{state['daysStuck']} day(s)\n" if state.get("daysStuck") is not None else "")
            + f"Due: {t.get('due') or 'n/a'}"
        )
    )
    content = complete("Sentry", prompt, "smart", f"{state.get('event','')} {t.get('id','')}")
    line = (content or "").strip().split("\n")[0].strip("\"'")[:200]
    return {"line": line, "attempts": state.get("attempts", 0) + 1}


def needs_retry(state: S) -> str:
    if not state.get("line") and state.get("attempts", 0) < 2:
        return "generate"
    return END


def build():
    g = StateGraph(S)
    g.add_node("generate", generate)
    g.set_entry_point("generate")
    g.add_conditional_edges("generate", needs_retry, {"generate": "generate", END: END})
    return g.compile()


SENTRY = build()


def run(payload: dict) -> str:
    return SENTRY.invoke({
        "task": payload.get("task") or {}, "event": payload.get("event", "escalated"),
        "target": payload.get("target", ""), "targetLevel": payload.get("targetLevel", ""),
        "daysStuck": payload.get("daysStuck"), "reason": payload.get("reason", ""),
    }).get("line") or ""
