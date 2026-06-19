"""Pure-logic check for Advisor's grounding — no LLM, no network.

Run: python -m pytest agents/graphs/test_advisor.py   (or just `python test_advisor.py`)
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # agents/

from langgraph.graph import END

from graphs.advisor import ground_check, needs_retry


def test_ground_check_drops_unknown_refs():
    state = {
        "ref_ids": {"k-1", "t-3"},
        "items": [{"title": "x", "refs": ["k-1", "made-up", "t-3", "missing-reports"]}],
    }
    out = ground_check(state)
    assert state["items"][0]["refs"] == ["k-1", "t-3"]      # bad ids stripped
    assert set(out["_bad_refs"]) == {"made-up", "missing-reports"}


def test_retry_only_when_bad_and_under_cap():
    assert needs_retry({"_bad_refs": ["x"], "attempts": 1}) == "generate"
    assert needs_retry({"_bad_refs": ["x"], "attempts": 2}) == END   # cap reached
    assert needs_retry({"_bad_refs": [], "attempts": 1}) == END      # clean output


if __name__ == "__main__":
    test_ground_check_drops_unknown_refs()
    test_retry_only_when_bad_and_under_cap()
    print("ok")
