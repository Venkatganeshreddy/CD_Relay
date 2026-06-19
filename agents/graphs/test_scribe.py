"""Pure-logic checks for Scribe — no LLM, no network.

Run: python -m pytest agents/graphs/test_scribe.py   (or `python test_scribe.py`)
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # agents/

from graphs.scribe import ground_attendees, _resolve

ROSTER = [
    {"id": "u1", "name": "Priya Rao", "sub": "GenAI"},
    {"id": "u2", "name": "Pavan Kumar", "sub": "DS&Algo"},
    {"id": "u3", "name": "Pavan Reddy", "sub": "Aptitude"},
    {"id": "u4", "name": "Ravi Sen", "sub": "GenAI"},
]


def test_ground_attendees_keeps_only_speakers():
    transcript = "Ravi Sen: shipped it.\n[10:02] Priya Rao: I'll review.\nNote: Pavan was absent."
    out = ground_attendees({"transcript": transcript, "attendees": ["Ravi Sen", "Priya Rao", "Pavan Kumar"]})
    assert out["attendees"] == ["Ravi Sen", "Priya Rao"]      # Pavan never speaks -> dropped


def test_resolve_assignees():
    assert _resolve("Priya Rao", ROSTER) == "u1"               # exact name
    assert _resolve("DS&Algo", ROSTER) == "u2"                 # team -> first member
    assert _resolve("Ravi", ROSTER) == "u4"                    # unambiguous first name
    assert _resolve("Pavan", ROSTER) is None                   # two Pavans, no team -> triage
    assert _resolve("", ROSTER) is None                        # blank -> triage


if __name__ == "__main__":
    test_ground_attendees_keeps_only_speakers()
    test_resolve_assignees()
    print("ok")
