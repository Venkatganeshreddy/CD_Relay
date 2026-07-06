"""Planner — month-end execution diff -> next-month roadmap draft.

Reads one sub-team's month out of Relay (goals = the plan; worklogs/tasks/
digests/summaries/moms/kpis = the execution), reasons from the department's
Execution & Leadership Doctrine (relay_agents r-planner data.doctrine — DB-held
so it's versionable without redeploy), and writes a cited draft to
roadmap_drafts: headline, planned-vs-executed diff, findings (consequence +
decision per doctrine D1), L2 questions, and draft goals for next month.

Graph: fetch -> analyze -> ground_check -> (retry once) -> persist.
Never clobbers a draft the L2 has started reviewing (IN_REVIEW/FINAL -> skip).
"""
import calendar
import re
import urllib.parse
from datetime import datetime
from typing import TypedDict

from langgraph.graph import StateGraph, END

from llm import db_select, db_insert, db_update
from graphs.common import complete_json, fence, _IST, _now_ist, _rid
from graphs.schemas import PlannerOut


class S(TypedDict, total=False):
    sub: str
    dept: str
    month: str            # analysis month 'YYYY-MM' ('' = current IST month)
    window: tuple         # (first, last, next_first, plan_ym)
    brief: str
    valid_ids: set
    counts: dict
    low_data: bool
    doctrine: str
    out: dict             # PlannerOut as dict
    attempts: int
    _bad_cites: list
    draft_id: str
    persisted: bool
    skipped: str


# ── Pure helpers (unit-tested, no network) ──────────────────────────────────

def _month_window(month: str = "") -> tuple:
    """'2026-07' -> ('2026-07-01', '2026-07-31', '2026-08-01', '2026-08')."""
    ym = month or datetime.now(_IST).strftime("%Y-%m")
    y, m = int(ym[:4]), int(ym[5:7])
    last_day = calendar.monthrange(y, m)[1]
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    return (f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{last_day:02d}",
            f"{ny:04d}-{nm:02d}-01", f"{ny:04d}-{nm:02d}")


def _slug(sub: str) -> str:
    """'Content — GenAI' -> 'content-genai' (id-safe)."""
    return re.sub(r"[^a-z0-9]+", "-", str(sub).lower()).strip("-")


def _digest_rows_for_sub(digests: list, sub: str) -> list:
    """Pick this sub's rows out of org-wide digest docs -> [(digest_id, week, row)]."""
    out = []
    for d in digests:
        doc = d.get("data", d)
        week = doc.get("weekLabel") or str(doc.get("weekOf") or doc.get("week_of") or "")
        for s in doc.get("subs", []) or []:
            if s.get("sub") != sub:
                continue
            for row in s.get("rows", []) or []:
                out.append((doc.get("id"), week, row))
    return out


def _row_line(row: dict, limit: int = 220) -> str:
    """Generic one-line rendering of a jsonb row's scalar fields."""
    parts = [str(v) for v in row.values() if isinstance(v, (str, int, float)) and str(v).strip()]
    return " · ".join(parts)[:limit]


def ground_check_lists(out: dict, valid: set) -> list:
    """Drop cites that aren't real brief ids across all three cited lists."""
    bad = []
    for key in ("executionDiff", "findings", "goals"):
        for it in out.get(key, []) or []:
            cites = it.get("cites", []) or []
            it["cites"] = [c for c in cites if c in valid]
            bad += [c for c in cites if c not in valid]
    return bad


# ── Graph nodes ──────────────────────────────────────────────────────────────

def fetch(state: S) -> S:
    sub = state.get("sub") or ""
    q = urllib.parse.quote(sub)
    first, last, next_first, plan_ym = _month_window(state.get("month") or "")

    roster = [x.get("data", x) for x in db_select(f"employees?select=id,data&sub=eq.{q}")]
    names = {e.get("id"): e.get("name", e.get("id")) for e in roster}
    ids = ",".join(i for i in names if i)
    goals = [x.get("data", x) for x in db_select(f"goals?select=data&sub=eq.{q}")]
    dept = state.get("dept") or (goals[0].get("dept") if goals else "") or \
           (roster[0].get("dept") if roster else "") or ""
    qd = urllib.parse.quote(dept)

    logs = [x.get("data", x) for x in db_select(
        f"worklogs?select=data&work_date=gte.{first}&work_date=lte.{last}"
        f"&owner_id=in.({ids})&order=work_date.desc&limit=1000")] if ids else []
    reports = [x.get("data", x) for x in db_select(
        f"daily_reports?select=data&sub=eq.{q}&report_date=gte.{first}"
        f"&report_date=lte.{last}&order=report_date.desc&limit=200")]
    tasks = [x.get("data", x) for x in db_select(
        f"tasks?select=data&owner_id=in.({ids})&order=created_at.desc&limit=300")] if ids else []
    digest_rows = _digest_rows_for_sub(db_select(
        f"weekly_digests?select=data&week_of=gte.{first}&week_of=lte.{last}&order=week_of.asc"), sub)
    summaries = [x.get("data", x) for x in db_select(
        f"weekly_summaries?select=data&dept=eq.{qd}&created_at=gte.{first}"
        f"&created_at=lt.{next_first}&order=created_at.desc&limit=8")] if dept else []
    moms = [x.get("data", x) for x in db_select(
        f"moms?select=data&dept=eq.{qd}&created_at=gte.{first}"
        f"&created_at=lt.{next_first}&order=created_at.desc&limit=12")] if dept else []
    kpis = [x.get("data", x) for x in db_select(f"kpis?select=data&dept=eq.{qd}&limit=40")] if dept else []
    health = db_select(f"dept_health?select=id,data&id=eq.{qd}") if dept else []
    agent_rows = db_select("relay_agents?select=data&id=eq.r-planner")
    doctrine = (agent_rows[0].get("data", {}) or {}).get("doctrine", "") if agent_rows else ""

    valid: set = set()
    lines = [f"# PLAN — {sub}'s goals on record (the baseline for the execution diff)"]
    if goals:
        for g in goals:
            gid = g.get("id")
            valid.add(gid)
            dels = []
            for d in g.get("deliverables", []) or []:
                did = d.get("id")
                if did:
                    valid.add(did)
                dels.append(f"[{did}] {str(d.get('text', ''))[:100]}")
            lines.append(f"- [{gid}] {g.get('title', '')} — deliverables: " + ("; ".join(dels) or "(none)"))
    else:
        lines.append("(no goals recorded — treat the month's execution as unplanned)")

    lines.append(f"\n# EXECUTION — worklogs {first}..{last} ({len(logs)} entries)")
    by_person: dict = {}
    by_cat: dict = {}
    for w in logs:
        who = names.get(w.get("userId") or w.get("empId") or w.get("owner"), None) or \
              w.get("userName") or w.get("who") or "?"
        h = float(w.get("hours") or 0)
        by_person[who] = by_person.get(who, 0) + h
        cat = w.get("outputCategory") or w.get("taskCategory") or "—"
        by_cat[cat] = by_cat.get(cat, 0) + h
    if by_person:
        lines.append("Hours by person: " + "; ".join(f"{k} {v:g}h" for k, v in sorted(by_person.items())))
        lines.append("Hours by category: " + "; ".join(f"{k} {v:g}h" for k, v in sorted(by_cat.items())))
    for w in logs[:60]:
        wid = w.get("id")
        valid.add(wid)
        who = names.get(w.get("userId") or w.get("empId") or w.get("owner"), None) or \
              w.get("userName") or w.get("who") or "?"
        lines.append(f"- [{wid}] {w.get('date', '')} · {who} · {w.get('hours', 0)}h · "
                     f"{w.get('outputCategory') or w.get('taskCategory') or '—'} · {w.get('status', '')}")
    if not logs:
        lines.append("(none this month)")

    lines.append(f"\n# Daily report items ({len(reports)} reports)")
    for r in reports[:40]:
        rid = r.get("id")
        valid.add(rid)
        items = " | ".join(f"({i.get('kind')}) {str(i.get('text', ''))[:80]}" for i in (r.get("items") or [])[:4])
        lines.append(f"- [{rid}] {r.get('date', '')} ({names.get(r.get('author'), r.get('author', ''))}): {items or '(empty)'}")
    if not reports:
        lines.append("(none this month)")

    no_due = sum(1 for t in tasks if not t.get("due"))
    lines.append(f"\n# Tasks ({len(tasks)} in scope · {no_due} have NO due date — doctrine B1 defect)")
    for t in tasks[:60]:
        tid = t.get("id")
        valid.add(tid)
        lines.append(f"- [{tid}] {str(t.get('title', ''))[:90]} status={t.get('status', '')} "
                     f"due={t.get('due') or 'NONE'} owner={names.get(t.get('owner'), t.get('owner', '?'))}")
    if not tasks:
        lines.append("(none in scope)")

    lines.append(f"\n# Weekly digest rows for {sub} ({len(digest_rows)})")
    for did, week, row in digest_rows:
        valid.add(did)
        lines.append(f"- [{did}] {week} · {_row_line(row)}")
    if not digest_rows:
        lines.append("(none this month)")

    lines.append(f"\n# Weekly summaries (Rollup, dept-wide, {len(summaries)})")
    for w in summaries:
        wid = w.get("id")
        valid.add(wid)
        secs = "; ".join(f"{s.get('h')}: " + " | ".join(str(i.get('text', ''))[:80] for i in (s.get("items") or [])[:3])
                         for s in (w.get("sections") or [])[:4])
        lines.append(f"- [{wid}] {str(secs)[:300]}")
    if not summaries:
        lines.append("(none this month)")

    lines.append(f"\n# Meetings — Second Brain ({len(moms)})")
    for m in moms:
        mid = m.get("id")
        valid.add(mid)
        summ = m.get("summary")
        summ = summ if isinstance(summ, str) else " ".join(str(v) for v in (summ or {}).values())
        opens = "; ".join(str(i.get("text", ""))[:60] for i in (m.get("actionItems") or []) if i.get("status") != "done")
        lines.append(f"- [{mid}] {m.get('date', '')} {str(m.get('title', ''))[:60]} — {str(summ)[:200]}"
                     + (f" — open items: {opens[:200]}" if opens else ""))
    if not moms:
        lines.append("(none this month — doctrine D3: silence is a signal, consider under-instrumentation)")

    lines.append(f"\n# KPIs ({len(kpis)}) & dept health")
    for k in kpis:
        kid = k.get("id")
        valid.add(kid)
        lines.append(f"- [{kid}] {k.get('name', '')} {k.get('current', '')}{k.get('unit', '')}"
                     f"/target {k.get('target', '')}{k.get('unit', '')} status={k.get('status', '')}")
    for h in health:
        lines.append(f"- [{h.get('id')}] health: {_row_line(h.get('data', {}) or {}, 300)}")
        valid.add(h.get("id"))
    if not kpis and not health:
        lines.append("(none)")

    counts = {"goals": len(goals), "worklogs": len(logs), "reports": len(reports),
              "tasks": len(tasks), "digest_rows": len(digest_rows),
              "summaries": len(summaries), "moms": len(moms), "kpis": len(kpis)}
    return {"window": (first, last, next_first, plan_ym), "dept": dept,
            "brief": "\n".join(lines), "valid_ids": {v for v in valid if v},
            "counts": counts, "low_data": counts["worklogs"] + counts["digest_rows"] < 10,
            "doctrine": doctrine, "attempts": 0}


def analyze(state: S) -> S:
    sub = state.get("sub", "")
    first, _, _, plan_ym = state["window"]
    ym = first[:7]
    bad = state.get("_bad_cites", [])
    correction = (f"\nA previous attempt cited ids not present in the DATA: {bad}. "
                  "cites MUST contain ONLY ids that appear verbatim in square brackets below."
                  if bad else "")
    low = ("\nDATA DENSITY IS LOW this month — say so explicitly in the headline and findings, "
           "and lean on KPIs, dept health and meeting decisions rather than guessing."
           if state.get("low_data") else "")
    doctrine = (f"\nDOCTRINE — the department's execution & leadership principles. Reason from "
                f"these for severity, framing, questions and tone:\n{state['doctrine']}\n"
                if state.get("doctrine") else "")
    prompt = (
        f"You are Planner, preparing sub-team \"{sub}\"'s {plan_ym} roadmap from {ym}'s execution data.\n"
        f"{doctrine}"
        "Produce:\n"
        f"1. headline — 2-3 sentences: why this cycle matters and the headline metric trend, before anything else.\n"
        "2. executionDiff — one entry per goal in PLAN (kind: done|partial|missed), planned vs executed, citing evidence.\n"
        "3. findings — strengths, gaps, risks, opportunities, plus any doctrine anti-patterns you can see in the data "
        "(deliverables with no date/owner, blockers recurring across weeks, duplicate builds, silent streams). "
        "For every gap/risk fill `consequence` (what happens if it repeats) and `decision` (the concrete decision being asked).\n"
        f"4. questions — at most 6 for the L2 conversation, consequence-first, each forcing the lead to articulate the "
        "plan themselves; frame trade-offs between named alternatives, never bare yes/no.\n"
        f"5. goals — 3 to 8 draft goals for {plan_ym}, each with concrete deliverables and a data-backed rationale.\n"
        "cites MUST contain ONLY ids that appear verbatim in square brackets in the DATA."
        f"{correction}{low}\n\nDATA:\n" + fence(state["brief"])
    )
    out = complete_json("Planner", prompt, PlannerOut, "smart", f"Roadmap {plan_ym} {sub}")
    return {"out": out, "attempts": state.get("attempts", 0) + 1}


def ground_check(state: S) -> S:
    return {"_bad_cites": ground_check_lists(state.get("out", {}), state["valid_ids"])}


def needs_retry(state: S) -> str:
    if state.get("_bad_cites") and state.get("attempts", 0) < 2:
        return "analyze"
    return "persist"


def persist(state: S) -> S:
    sub, dept = state.get("sub", ""), state.get("dept", "")
    first, _, next_first, plan_ym = state["window"]
    did = f"rd-{plan_ym}-{_slug(sub)}"
    # Client reads ONLY the data jsonb — mirror every column it needs in here.
    doc = {"id": did, "sub": sub, "dept": dept, "month": next_first, "status": "DRAFT",
           "analysisMonth": first[:7], **(state.get("out") or {}),
           "dataDensity": state.get("counts", {}), "lowData": bool(state.get("low_data")),
           "qaLog": [], "ts": _now_ist()}
    existing = db_select(f"roadmap_drafts?select=id,status&id=eq.{did}")
    if not existing:
        ok = db_insert("roadmap_drafts", [{"id": did, "dept": dept, "sub": sub,
                                           "month": next_first, "status": "DRAFT", "data": doc}])
    elif (existing[0].get("status") or "DRAFT") == "DRAFT":
        ok = db_update("roadmap_drafts", did, doc)   # data col only; status col already DRAFT
    else:
        return {"draft_id": did, "persisted": False, "skipped": existing[0]["status"]}
    act_id = _rid("act-")
    db_insert("activity", [{"id": act_id, "data": {
        "id": act_id, "kind": "agent", "ts": _now_ist(),
        "text": f"Planner drafted the {plan_ym} roadmap for {sub}"
                + (" (low data)" if state.get("low_data") else ""), "icon": "⚙"}}])
    return {"draft_id": did, "persisted": bool(ok), "skipped": ""}


def build():
    g = StateGraph(S)
    g.add_node("fetch", fetch)
    g.add_node("analyze", analyze)
    g.add_node("ground_check", ground_check)
    g.add_node("persist", persist)
    g.set_entry_point("fetch")
    g.add_edge("fetch", "analyze")
    g.add_edge("analyze", "ground_check")
    g.add_conditional_edges("ground_check", needs_retry, {"analyze": "analyze", "persist": "persist"})
    g.add_edge("persist", END)
    return g.compile()


PLANNER = build()


def run(sub: str, dept: str = "", month: str = "") -> dict:
    out = PLANNER.invoke({"sub": sub, "dept": dept, "month": month})
    return {"draftId": out.get("draft_id", ""), "persisted": bool(out.get("persisted")),
            "skipped": out.get("skipped", ""), "counts": out.get("counts", {}),
            "lowData": bool(out.get("low_data"))}
