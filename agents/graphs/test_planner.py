"""Pure-logic checks for Planner — no LLM, no network.

Run: python -m pytest agents/graphs/test_planner.py   (or just `python test_planner.py`)
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # agents/

from graphs.planner import _month_window, _slug, _digest_rows_for_sub, ground_check_lists, needs_retry


def test_month_window():
    assert _month_window("2026-07") == ("2026-07-01", "2026-07-31", "2026-08-01", "2026-08")
    assert _month_window("2026-12") == ("2026-12-01", "2026-12-31", "2027-01-01", "2027-01")  # year rollover
    assert _month_window("2028-02") == ("2028-02-01", "2028-02-29", "2028-03-01", "2028-03")  # leap year
    first, last, next_first, plan_ym = _month_window("")                                       # defaults to now
    assert first.endswith("-01") and len(plan_ym) == 7


def test_slug():
    assert _slug("Content — GenAI") == "content-genai"      # em-dash + spaces
    assert _slug("Content — Fullstack") == "content-fullstack"
    assert _slug("Central Ops") == "central-ops"


def test_digest_rows_for_sub():
    digests = [{"data": {"id": "wd-2026-W27", "weekLabel": "W27", "subs": [
        {"sub": "Content — GenAI", "rows": [{"output": "MCQs", "achieved": "120 shipped"}]},
        {"sub": "Content — Fullstack", "rows": [{"output": "Labs", "achieved": "8 built"}]},
    ]}}]
    rows = _digest_rows_for_sub(digests, "Content — GenAI")
    assert rows == [("wd-2026-W27", "W27", {"output": "MCQs", "achieved": "120 shipped"})]
    assert _digest_rows_for_sub(digests, "Content — English") == []


def test_ground_check_drops_unknown_cites_across_all_lists():
    out = {
        "executionDiff": [{"kind": "partial", "text": "g1", "cites": ["goal-1", "fake-1"]}],
        "findings": [{"kind": "risk", "text": "r1", "cites": ["wl-1", "fake-2"]}],
        "goals": [{"title": "next", "cites": ["mom-1", "fake-3"]}],
    }
    bad = ground_check_lists(out, {"goal-1", "wl-1", "mom-1"})
    assert out["executionDiff"][0]["cites"] == ["goal-1"]
    assert out["findings"][0]["cites"] == ["wl-1"]
    assert out["goals"][0]["cites"] == ["mom-1"]
    assert set(bad) == {"fake-1", "fake-2", "fake-3"}


def test_retry_only_when_bad_and_under_cap():
    assert needs_retry({"_bad_cites": ["x"], "attempts": 1}) == "analyze"
    assert needs_retry({"_bad_cites": ["x"], "attempts": 2}) == "persist"   # cap reached
    assert needs_retry({"_bad_cites": [], "attempts": 1}) == "persist"      # clean output


if __name__ == "__main__":
    test_month_window()
    test_slug()
    test_digest_rows_for_sub()
    test_ground_check_drops_unknown_cites_across_all_lists()
    test_retry_only_when_bad_and_under_cap()
    print("ok")
