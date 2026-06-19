"""Scribe — meeting transcript -> agenda, attendees, summary, action items.

Real multi-step graph:
  fetch_roster -> extract (LLM) -> ground_attendees (keep only real speakers)
  -> resolve_assignees (deterministic roster mapping — the Dispatcher logic).

The grounding + resolution steps are pure logic the old single prompt couldn't
enforce: the model proposes, the graph verifies.
"""
import re
from typing import TypedDict

from langgraph.graph import StateGraph, END

from llm import db_select
from graphs.common import complete, extract_json


class S(TypedDict, total=False):
    transcript: str
    roster: list          # [{name, level, sub, dept, id}]
    agenda: str
    attendees: list
    summary: dict
    items: list


def fetch_roster(state: S) -> S:
    roster = [x.get("data", x) for x in db_select("employees?select=data&limit=200")]
    return {"roster": [r for r in roster if r.get("name")]}


def extract(state: S) -> S:
    roster_txt = "\n".join(
        f"{u.get('name')} — {u.get('level','')} — {u.get('sub') or u.get('dept') or ''}"
        for u in state["roster"]
    )
    prompt = (
        "You are Scribe, summarizing a meeting transcript for the team listed below.\n"
        "Produce FOUR things in this exact order: agenda, attendees, summary, items.\n\n"
        "1) agenda — a single crisp one-line meeting agenda (under 90 chars, no preamble).\n\n"
        "2) attendees — array of ONLY the distinct people who actually SPEAK in the transcript "
        "(a speaker line like \"Ravi: ...\"). Never add a roster name that has no speaking line. "
        "Skip generic labels like \"Team\" or \"Everyone\".\n\n"
        "3) summary — an OBJECT with THREE short paragraphs, one per outcome lens, flowing prose, "
        "outcome-oriented; set a lens to \"\" if not substantively discussed.\n"
        "  - businessDirection: the strategic intent the meeting set or reinforced.\n"
        "  - alignment: what everyone aligned on — decisions reached, shared understanding.\n"
        "  - guidelines: guidelines & insights that emerged.\n\n"
        "4) items — extract EVERY action item, including implicit ones. For each, set assigneeHint to "
        "the person/team RESPONSIBLE (never the delegator), first match wins: "
        "(1) speaker volunteers -> that speaker; (2) a specific full name -> that exact roster name; "
        "(3) a team/area referenced -> that team/sub name; (4) a bare first name matching MORE THAN ONE "
        "roster person with no team -> \"\" for triage; (5) no plausible owner -> \"\". "
        "Never default to the meeting chair.\n\n"
        f"Team roster (name — level — team):\n{roster_txt}\n\n"
        'Return ONLY JSON: {"agenda":"...","attendees":["Name"],"summary":{"businessDirection":"",'
        '"alignment":"","guidelines":""},"items":[{"text":"...","assigneeHint":"","confidence":0.0}]}. '
        "No preamble.\n\nTranscript:\n" + state["transcript"]
    )
    content = complete("Scribe", prompt, model="smart", input_label="MOM extract")
    p = extract_json(content) or {}
    summary = {"businessDirection": "", "alignment": "", "guidelines": ""}
    s = p.get("summary")
    if isinstance(s, dict):
        for k in summary:
            summary[k] = str(s.get(k, "") or "").strip()
    elif isinstance(s, str) and s.strip():
        summary["alignment"] = s.strip()
    return {
        "agenda": p.get("agenda", ""),
        "attendees": [str(a).strip() for a in p.get("attendees", []) if str(a).strip()],
        "summary": summary,
        "items": p.get("items", []) if isinstance(p.get("items"), list) else [],
    }


def ground_attendees(state: S) -> S:
    """Keep only attendees that actually have a speaker line in the transcript."""
    text = state["transcript"]
    kept = []
    for name in state.get("attendees", []):
        # speaker line = name followed by ':' near a line start (allow timestamps)
        if re.search(rf"(^|\n)\s*(\[[^\]]*\]\s*)?{re.escape(name)}\s*:", text, re.IGNORECASE):
            kept.append(name)
    return {"attendees": kept}


def _resolve(hint: str, roster: list):
    """Map an assigneeHint to a roster id. Ambiguous/blank -> None (triage)."""
    if not hint:
        return None
    h = hint.strip().lower()
    exact = [r for r in roster if r.get("name", "").lower() == h]
    if len(exact) == 1:
        return exact[0].get("id")
    team = [r for r in roster if h in (str(r.get("sub", "")) + " " + str(r.get("dept", ""))).lower()]
    if team:                       # a team reference always resolves (to first team member)
        return team[0].get("id")
    first = [r for r in roster if r.get("name", "").lower().split(" ")[0] == h]
    if len(first) == 1:            # unambiguous bare first name
        return first[0].get("id")
    return None                    # ambiguous or unknown -> triage


def resolve_assignees(state: S) -> S:
    roster = state["roster"]
    items = []
    for it in state.get("items", []):
        owner = _resolve(it.get("assigneeHint", ""), roster)
        items.append({**it, "owner": owner,
                      "ownerInferReason": "" if owner else f"No clear owner for \"{it.get('assigneeHint','')}\" — triage"})
    # Safety net: synthesize an alignment summary if all lenses came back empty.
    summ = state["summary"]
    if not any(summ.values()) and items:
        summ = {**summ, "alignment": "The meeting captured the following commitments: " +
                "; ".join(str(i.get("text", "")).strip() for i in items[:6]) + "."}
    return {"items": items, "summary": summ}


def build():
    g = StateGraph(S)
    g.add_node("fetch_roster", fetch_roster)
    g.add_node("extract", extract)
    g.add_node("ground_attendees", ground_attendees)
    g.add_node("resolve_assignees", resolve_assignees)
    g.set_entry_point("fetch_roster")
    g.add_edge("fetch_roster", "extract")
    g.add_edge("extract", "ground_attendees")
    g.add_edge("ground_attendees", "resolve_assignees")
    g.add_edge("resolve_assignees", END)
    return g.compile()


SCRIBE = build()


def run(transcript: str) -> dict:
    out = SCRIBE.invoke({"transcript": transcript or ""})
    return {k: out.get(k) for k in ("agenda", "attendees", "summary", "items")}
