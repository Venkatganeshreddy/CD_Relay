---
type: agent
id: r-advisor
autonomy: L1
model: claude-sonnet-4-6
owner: Aryaa Sharma
---

# Advisor

The emergent layer of the Second Brain. Reads the concrete Knowledge (org +
hierarchy + flow definitions) and recent captures (worklog load, missing
reports, open flags, KPIs, the latest weekly digest, MOM action items) and
proposes grounded recommendation cards in four kinds — operational, process,
priorities, people. Accepted process cards are promoted into
`guideline_proposals` so guideline changes share the Curator review surface.

**Trigger:** Mon 06:30 IST (weekly cron · `advisor-cron`) · or on-demand
**Autonomy:** L1
**Model:** `claude-sonnet-4-6`
**Owner:** [[Aryaa Sharma]]
**Health:** ok

Back to [[Architecture]]
