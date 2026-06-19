"""Rollup — consolidate a week of daily reports.

Two entrypoints share one graph shape (fetch -> generate -> ground-check cites
-> retry once if the model cited report ids that don't exist):
  run_rollup(weekly)         -> themed sections with citations
  run_weekly_digest(payload) -> one achievement sentence per work-stream
"""
from typing import TypedDict

from langgraph.graph import StateGraph, END

from llm import db_select
from graphs.common import complete, extract_json


class S(TypedDict, total=False):
    weekly: dict            # {id, dept, deptName}
    reports: list
    report_ids: set
    sections: list
    attempts: int
    _bad_cites: list       # report ids the model cited that don't exist (drives retry)


def fetch(state: S) -> S:
    w = state["weekly"]
    rows = [x.get("data", x) for x in db_select("daily_reports?select=data&limit=500")]
    reports = [r for r in rows if r.get("dept") == w.get("dept") and not r.get("missing")]
    return {"reports": reports, "report_ids": {r.get("id") for r in reports if r.get("id")}, "attempts": 0}


def generate(state: S) -> S:
    w = state["weekly"]
    ctx = "\n".join(
        f"[{r.get('id')}] {r.get('sub','')} ({r.get('date','')}): "
        + " | ".join(f"({i.get('kind')}) {i.get('text')}" for i in r.get("items", []))
        for r in state["reports"]
    ) or "(no reports in scope)"
    bad = state.get("_bad_cites", [])
    correction = (f"\nA previous attempt cited report ids not in the list: {bad}. "
                  "Cite ONLY ids shown in square brackets below." if bad else "")
    prompt = (
        f"You are Rollup, consolidating a week of daily reports into a manager-ready summary "
        f"for \"{w.get('deptName', w.get('dept'))}\".\n"
        'Return ONLY JSON: {"sections":[{"h":"Highlights","items":[{"text":"...","cites":["r-1001"]}]},'
        '{"h":"Risks","items":[...]},{"h":"Asks","items":[...]}]}.\n'
        "Cite the source report ids you used. Be concise and specific; no preamble."
        f"{correction}\n\nDaily reports:\n{ctx}"
    )
    sections = (extract_json(complete("Rollup", prompt, "smart", f"Weekly {w.get('id','')}")) or {}).get("sections") or []
    return {"sections": sections, "attempts": state.get("attempts", 0) + 1}


def ground_check(state: S) -> S:
    valid = state["report_ids"]
    bad = []
    for sec in state.get("sections", []):
        for it in sec.get("items", []):
            cites = it.get("cites", []) or []
            it["cites"] = [c for c in cites if c in valid]
            bad += [c for c in cites if c not in valid]
    return {"_bad_cites": bad}


def needs_retry(state: S) -> str:
    if state.get("_bad_cites") and state.get("attempts", 0) < 2:
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


ROLLUP = build()


def run_rollup(weekly: dict) -> list:
    return ROLLUP.invoke({"weekly": weekly}).get("sections") or []


def run_weekly_digest(payload: dict) -> list:
    """One achievement sentence per work-stream, same order. Single grounded call."""
    streams = payload.get("streams") or []
    if not streams:
        return []
    numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(streams))
    prompt = (
        f"You are Rollup, consolidating one week ({payload.get('weekLabel','')}) for sub-department "
        f"\"{payload.get('sub','')}\".\n"
        "For EACH numbered work-stream, write ONE concise sentence (max 24 words) stating what was achieved. "
        "Ground it ONLY in the figures/topics given; reflect open blockers or non-Done status honestly.\n"
        f"Return ONLY a JSON array of exactly {len(streams)} strings, same order. No preamble.\n\n{numbered}"
    )
    arr = extract_json(complete("Rollup", prompt, "smart", f"Digest {payload.get('weekLabel','')}"), "[")
    if isinstance(arr, list):
        return [x if isinstance(x, str) else (x or {}).get("text", "") for x in arr]
    return []
