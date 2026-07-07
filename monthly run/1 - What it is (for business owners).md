# Roadmap Planner — What It Is & Why It Matters

*A plain-language pitch. No technical background needed.*

## The problem today

Every month, each team lead sits down to plan the next month's roadmap. To do
that well, they first have to answer: **"How did last month actually go?"**

Right now that answer is assembled by hand — from memory, old notes, and
scattered updates. The result:

- Planning meetings take **2–3 rounds of iteration** before the roadmap is final.
- The review depends on **who remembers what**, not on what actually happened.
- Wins, gaps, and risks that the data clearly shows often **never make it into the discussion**.

Meanwhile, Relay has been quietly collecting the ground truth all month: what
every team planned, what they worked on each day, what got done, what got
blocked, what was decided in meetings, and how the numbers moved.

**The Roadmap Planner puts that data to work.**

## What the Roadmap Planner does

Think of it as a **monthly review analyst + planning partner** for every team
lead. Here's a month in its life:

**All month** — Relay collects the team's plans, daily work, weekly summaries,
meeting decisions, and performance numbers. (Already happening today — nothing
new to do.)

**On the 25th** — the Planner automatically reviews the month and prepares a
briefing for each team lead:

- **Planned vs. actually delivered** — goal by goal, with the evidence.
- **Strengths** — what the team consistently did well.
- **Gaps and risks** — what slipped, what's blocked, what's trending the wrong way.
- **Opportunities** — what the data suggests the team should double down on.
- **A first draft of next month's roadmap** — with the reasoning behind every proposed goal.

**Last week of the month** — the team lead opens the briefing in Relay's chat
and has a **guided conversation**. The Planner asks pointed questions ("This
goal slipped two weeks in a row — carry it, split it, or drop it?"), the lead
answers and adjusts, and the roadmap takes shape in minutes, not meetings.

**One click to finish** — the lead approves the final version, and next month's
goals are saved into Relay — the same place the team already tracks them.

**And the loop closes** — next month's work flows in against those goals, so
every planning cycle starts smarter than the last one.

## What this changes

| Today | With the Roadmap Planner |
|-------|--------------------------|
| 2–3 planning iterations per team | Target: **one focused conversation** |
| Review built from memory | Review built from **a full month of real data** |
| Insights depend on who's in the room | Every claim comes **with evidence attached** |
| Planning style varies by team | Consistent, structured process — **tuned to how we plan**, and it keeps learning from every correction a lead makes |

## Why this is safe

- **A human approves everything.** The Planner drafts and suggests; only the
  team lead can change or finalize a roadmap, and every change requires an
  explicit confirmation click.
- **Leads only see and control their own team's roadmap** — the same access
  rules Relay already enforces everywhere.
- **It never invents facts.** Every claim in the briefing is checked against
  the actual records before it's shown; anything unverifiable is dropped.
- **It's honest about thin data.** If a team's month is sparsely logged, the
  briefing says so instead of guessing.

## Why this is fast and cheap to build

This is **not a new system**. Roughly 80% of the Planner already exists in
Relay and is running in production today:

- The data it analyzes is already being collected.
- The engine that runs Relay's other AI agents (meeting minutes, weekly
  summaries, escalations) is reused as-is.
- The chat where the conversation happens is Relay's existing assistant —
  the Planner just becomes a new capability inside it, alongside future ones
  like team-performance reviews. **One place for everything.**

The new work is essentially one analysis module and one conversation flow.

## Timeline

| Date | Milestone |
|------|-----------|
| **Jul 17** | Month-end analysis working — first data-backed briefings generated for the pilot teams |
| **Jul 24** | Guided planning conversation live in Relay's chat |
| **Jul 27–31** | Pilot teams (Fullstack + GenAI) plan August with it — the real test |

## The one thing it needs

The Planner is only as sharp as the data flowing in. That's why **100%
adoption by the Fullstack and GenAI teams this window** is the key dependency —
it's what turns the first real planning cycle (Jul 27–31) from a demo into a
genuinely better way to plan.

**Bottom line:** the data is already there, the plumbing is already there, and
the first data-driven planning cycle is four weeks away.
