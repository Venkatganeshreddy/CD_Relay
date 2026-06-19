"""Curator — close the learning loop.

Reads where humans edited/rejected an agent's drafts (engram_interactions),
distills the RECURRING corrections into durable preference rules, and writes them
to relay_agents.data.memory so common.memory_for() injects them into that agent's
future runs.

Graph: fetch corrections -> group by agent -> distill each (LLM) -> persist.
"""
from typing import TypedDict

from langgraph.graph import StateGraph, END

from llm import db_select, db_update
from graphs.common import complete, extract_json


class S(TypedDict, total=False):
    agent_name: str        # optional filter; "" = all agents
    by_agent: dict         # {name: [correction, ...]}
    results: list          # [{agent, rules, distilledFrom}]


def fetch(state: S) -> S:
    only = state.get("agent_name") or ""
    by_agent: dict = {}
    for x in db_select("engram_interactions?select=data&limit=500"):
        e = x.get("data", x)
        if not e or e.get("action") == "accept":     # edits/rejects carry the signal
            continue
        if only and e.get("agent") != only:
            continue
        by_agent.setdefault(e.get("agent"), []).append(e)
    return {"by_agent": by_agent}


def distill(state: S) -> S:
    by_name = {x.get("data", x).get("name"): x for x in db_select("relay_agents?select=id,data")}
    results = []
    for name, items in state["by_agent"].items():
        cases = "\n\n".join(
            f"{i + 1}. flow={e.get('flow','?')} verdict={e.get('action')}\n"
            f"   AI draft: {str(e.get('draft',''))[:300]}\n"
            f"   Human kept: {str(e.get('final',''))[:300]}\n"
            f"   Reason: {e.get('reason') or '(none given)'}"
            for i, e in enumerate(items[:40])
        )
        prompt = (
            f"You are Curator. Below are cases where {name}'s AI suggestion was edited or rejected "
            f"by a human reviewer.\nFind the RECURRING ways humans correct {name} and turn them into "
            "durable, imperative preference rules the agent should follow next time. Ignore one-off "
            "corrections; keep only patterns that repeat. Be specific and actionable.\n"
            'Return ONLY JSON: {"rules":["...","..."]} with 3-7 short rules. No preamble.\n\nCases:\n'
            + cases
        )
        try:
            rules = (extract_json(complete(
                "Curator", prompt, "smart", f"Distill {name} ({len(items)} corrections)")) or {}).get("rules", [])[:7]
        except Exception:
            continue
        if not rules:
            continue
        # Persist into that agent's memory so future runs self-correct.
        row = by_name.get(name)
        if row and row.get("id"):
            data = {**row.get("data", {}), "memory": {"rules": rules, "distilledFrom": len(items)}}
            db_update("relay_agents", row["id"], data)
        results.append({"agent": name, "rules": rules, "distilledFrom": len(items)})
    return {"results": results}


def build():
    g = StateGraph(S)
    g.add_node("fetch", fetch)
    g.add_node("distill", distill)
    g.set_entry_point("fetch")
    g.add_edge("fetch", "distill")
    g.add_edge("distill", END)
    return g.compile()


CURATOR = build()


def run(agent_name: str = "") -> list:
    return CURATOR.invoke({"agent_name": agent_name}).get("results") or []
