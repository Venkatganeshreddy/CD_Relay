"""Pydantic output schemas — every agent's model call is validated against one.

These replace regex JSON extraction: the model is forced to emit this exact
shape (LangChain .with_structured_output), and the object is validated before it
ever reaches the DB. Defaults make each top-level schema instantiable empty, so
a failed call degrades to a well-formed empty result instead of crashing.
"""
from pydantic import BaseModel, Field


class AdvisorItem(BaseModel):
    kind: str
    title: str
    detail: str = ""
    dept: str = ""
    severity: str = "medium"
    refs: list[str] = Field(default_factory=list)


class AdvisorOut(BaseModel):
    items: list[AdvisorItem] = Field(default_factory=list)


class ScribeItem(BaseModel):
    text: str
    assigneeHint: str = ""
    confidence: float = 0.0


class ScribeSummary(BaseModel):
    businessDirection: str = ""
    alignment: str = ""
    guidelines: str = ""


class ScribeOut(BaseModel):
    agenda: str = ""
    attendees: list[str] = Field(default_factory=list)
    summary: ScribeSummary = Field(default_factory=ScribeSummary)
    items: list[ScribeItem] = Field(default_factory=list)


class RollupItem(BaseModel):
    text: str
    cites: list[str] = Field(default_factory=list)


class RollupSection(BaseModel):
    h: str
    items: list[RollupItem] = Field(default_factory=list)


class RollupOut(BaseModel):
    sections: list[RollupSection] = Field(default_factory=list)


class DigestOut(BaseModel):
    achievements: list[str] = Field(default_factory=list)


class CuratorOut(BaseModel):
    rules: list[str] = Field(default_factory=list)


class PlannerFinding(BaseModel):
    kind: str = ""            # executionDiff: done|partial|missed · findings: strength|gap|risk|opportunity|anti-pattern
    text: str = ""
    consequence: str = ""     # doctrine D1: what happens if it repeats
    decision: str = ""        # doctrine D1: what decision is being asked
    cites: list[str] = Field(default_factory=list)


class PlannerGoalDraft(BaseModel):
    title: str = ""
    deliverables: list[str] = Field(default_factory=list)
    rationale: str = ""       # data-backed why
    cites: list[str] = Field(default_factory=list)


class PlannerOut(BaseModel):
    headline: str = ""        # doctrine E1: why this cycle matters + headline metric trend
    executionDiff: list[PlannerFinding] = Field(default_factory=list)
    findings: list[PlannerFinding] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    goals: list[PlannerGoalDraft] = Field(default_factory=list)
