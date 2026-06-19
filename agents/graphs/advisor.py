"""Advisor — multi-step LangGraph recommendation agent.

This is the TEMPLATE the other agents follow. Unlike the old single-call TS
version, it actually loops: fetch DB slices -> build brief -> generate cards ->
ground-check every ref against the brief -> if too many were hallucinated,
regenerate once with the bad ids called out. That feedback loop is the thing a
plain prompt can't do and the reason this agent (and only this one so far) earns
a graph.
"""
from typing import TypedDict

from langgraph.graph import StateGraph, END

from llm import db_select
from graphs.common import complete, extract_json

KINDS = ["operational", "process", "priorities", "people"]


class S(TypedDict, total=False):
    kinds: list           # allowed recommendation kinds
    brief: str            # grounded text brief
    ref_ids: set          # ids that legitimately appear in the brief
    items: list           # generated recommendation cards
    attempts: int         # regeneration counter (caps the loop)
    _bad_refs: list       # ids the model cited that aren't in the brief (drives retry)


def fetch(state: S) -> S:
    """Pull the recent-activity slices the brief is built from."""
    depts = db_select("departments?select=data")
    emps = db_select("employees?select=data&limit=60")
    logs = db_select("worklogs?select=data&order=ts.desc&limit=200")
    flags = db_select("flags?select=data&limit=100")
    digest = db_select("weekly_digests?select=data&order=ts.desc&limit=1")

    lines, refs = [], set()
    lines.append("# Departments")
    for x in depts:
        d = x.get("data", x)
        lines.append(f"- [{d.get('id')}] {d.get('name')} subs: {'; '.join(d.get('subs', [])) or '—'}")
        refs.add(d.get("id"))
    lines.append("\n# Recent worklogs")
    for x in logs[:80]:
        w = x.get("data", x)
        wid = w.get("id")
        refs.add(wid)
        lines.append(f"- [{wid}] {w.get('who','?')}: {str(w.get('text',''))[:120]}")
    lines.append("\n# Open flags")
    for x in flags:
        f = x.get("data", x)
        fid = f.get("id")
        refs.add(fid)
        lines.append(f"- [{fid}] {str(f.get('text',''))[:120]}")
    if digest:
        d = digest[0].get("data", digest[0])
        lines.append(f"\n# Latest weekly digest\n{str(d.get('summary',''))[:1500]}")

    return {"brief": "\n".join(lines), "ref_ids": {r for r in refs if r}, "attempts": 0}


def generate(state: S) -> S:
    allowed = state.get("kinds") or KINDS
    bad = state.get("_bad_refs", [])
    correction = (
        f"\nA previous attempt cited ids that are NOT in the brief: {bad}. "
        "Use ONLY ids that appear verbatim in square brackets in the BRIEF, or [] if none."
        if bad else ""
    )
    prompt = (
        "You are Advisor for a Curriculum Development department's operating copilot.\n"
        "Read the BRIEF and propose concrete, actionable suggestions.\n"
        f"Allowed kinds (use ONLY these): {', '.join(allowed)}.\n"
        "Ground EVERY suggestion in the brief — never invent names, numbers, or facts. "
        "Prefer fewer, higher-signal items. Each detail is at most 2 sentences (so-what + next step). "
        'refs MUST contain ONLY ids that appear verbatim in square brackets in the BRIEF.'
        f"{correction}\n"
        'Return ONLY JSON: {"items":[{"kind":"operational","title":"...","detail":"...",'
        '"dept":"","severity":"medium","refs":[]}]}. No preamble.\n\nBRIEF:\n'
        + state["brief"]
    )
    content = complete("Advisor", prompt, model="smart", input_label="Recommendations")
    parsed = extract_json(content) or {}
    items = [it for it in parsed.get("items", [])
             if it.get("title") and it.get("kind") in allowed]
    return {"items": items, "attempts": state.get("attempts", 0) + 1}


def ground_check(state: S) -> S:
    """Drop refs that aren't real brief ids; record them so a retry can fix."""
    valid = state["ref_ids"]
    bad = []
    for it in state.get("items", []):
        kept = [r for r in it.get("refs", []) if r in valid]
        bad += [r for r in it.get("refs", []) if r not in valid]
        it["refs"] = kept
    return {"_bad_refs": bad}


def needs_retry(state: S) -> str:
    # Retry once if the model leaned on hallucinated ids; otherwise finish.
    bad = state.get("_bad_refs", [])
    if bad and state.get("attempts", 0) < 2:
        return "generate"
    return END


def build():
    g = StateGraph(S)
    g.add_node("fetch", fetch)
    g.add_node("generate", generate)
    g.add_node("ground_check", ground_check)
    g.set_entry_point("fetch")
    g.add_edge("fetch", "generate")
    g.add_edge("generate", "ground_check")
    g.add_conditional_edges("ground_check", needs_retry, {"generate": "generate", END: END})
    return g.compile()


ADVISOR = build()


def run(kinds: list | None = None) -> list:
    out = ADVISOR.invoke({"kinds": kinds or KINDS})
    return out.get("items", [])
