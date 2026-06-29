# CD Daily Check-in — Voice Agent Config (paste-ready)

Build it with the NxtWave doc (Hooman Labs + Make.com), but use the values below
instead of the placement-call ones. Only the prompts/outcomes/columns change.

---

## STAGE 1 — Google Sheet headers (row 1)
```
Timestamp | Employee Name | Emp ID | Tasks Done | Blockers | Status | Call Outcome | Summary
```

## STAGE 3.3 — First Message (paste into "First Message")
```
Hi, am I speaking with {name}? This is the CD check-in assistant calling for your quick daily work update. Do you have two minutes?
```

## STAGE 3.3 — System Prompt (paste into "System Prompt")
```
## Identity
You are the CD Check-in Assistant, an AI that calls NxtWave Content-Development team members each evening to capture what they worked on that day. You are calling {name}.

## Objective
Collect a short, accurate daily work update: (1) what tasks they completed today, (2) anything blocking them, (3) the overall status of their work. Confirm what you heard, then close. You are recording an update — you are NOT assigning work or giving feedback.

## Conversation flow
Step 1 — Confirm you reached the right person and that now is okay. If they are busy, ask when to call back, note it, and close politely.
Step 2 — Ask: "What did you work on today?" Let them list tasks. If vague, ask one clarifying follow-up like "Anything else you finished or made progress on?"
Step 3 — Ask: "Is anything blocking you or slowing you down?" Note it (it's fine if the answer is none).
Step 4 — Ask: "How would you describe today's status overall — on track, partial, or blocked?"
Step 5 — Briefly read back what you captured ("So today you... and you're blocked on..."), let them correct it, then close.

## Tone & Behaviour
- Warm, brief, professional. This is a friendly check-in, not an interrogation.
- No filler words ("umm", "ahh").
- Do not evaluate, judge, or advise on their work — just capture it.
- If they ask something you can't answer: "I'll pass that to the team to follow up."
- Never go beyond 4 minutes.

## Language
Respond in the same language the person uses. If they mix English and Hindi/Telugu, match their style.
```

## STAGE 3.4 — Closing Message (Call End tab → Fixed)
```
Thanks {name}, that's all I needed. Have a great evening!
```

## STAGE 3.5 — Voice / Transcription
- Provider: ElevenLabs · Language: English · pick a natural Indian-English voice
- Stability 0.7 · Similarity 1.0 · Speed 1.0
- Pronunciation dictionary: add `NxtWave` → "next wave"
- Transcription: Deepgram → Nova 3

## STAGE 3 (Advanced) — Call Settings
- Voicemail detection ON (5s) · Inactivity timeout 6s · Check-in tries 2 · Duration limit 4 min

---

## STAGE 5 — Call Outcomes (exact names)
| Name | Description |
|---|---|
| completed | Member gave a full update (tasks + status captured). |
| partial_update | Call connected but the update was incomplete or cut short. |
| busy_callback | Member was busy and gave a time to call back. |
| no_answer | Nobody picked up. |
| voicemail | Call went to voicemail. |

## STAGE 5 — Parameters (Structured Data Extraction)
| Name | Type | Description |
|---|---|---|
| tasks_done | String | The tasks the person said they completed today, as a clear list separated by new lines. |
| blockers | String | Anything the person said is blocking them. Empty if none. |
| status | String | Overall status in one word: on_track, partial, or blocked. |
Plus: enable **Call Summary** toggle.

---

## STAGE 4 / 7 — Where to send the data

### Option A (doc default, MVP): Google Sheet
Follow the doc as-is. Map: Timestamp→Current Date/Time, Employee Name→name,
Emp ID→emp_id, Tasks Done→tasks_done, Blockers→blockers, Status→status,
Call Outcome→call_outcome, Summary→call_summary.

### Option B (recommended): write into the app
In Make.com, replace the "Google Sheets → Add a Row" node with an **HTTP → Make a request**:
- Method: POST
- URL: `https://cd-relay-mcp.onrender.com/ingest?k=NXTWAVENXTWAVENXTWAVE`
- Body type: Raw / JSON, Content-Type application/json
- Body (map the call fields into this exact shape):
```json
{
  "emp_id": "{{emp_id}}",
  "name": "{{name}}",
  "tasks_done": "{{tasks_done}}",
  "blockers": "{{blockers}}",
  "status": "{{status}}",
  "summary": "{{call_summary}}",
  "outcome": "{{call_outcome}}"
}
```
The endpoint writes a `daily_reports` row so the update shows up in the dashboard.
(You can keep BOTH nodes — Sheet for a flat log, app for the live data.)

---

## STAGE 8 — Contact CSV (columns Hooman expects)
```
phone,name,emp_id
+919876543210,Sreenu Gampala,NW0001429
```
`emp_id` is the NxtWave id from your roster — include it so the update maps to the
right person in the app. (Ask me to generate the full roster CSV — names + emp_ids
filled in, you just add phone numbers.)

---

## Recurring at 6 PM
The doc launches a campaign manually. For a daily 6 PM run, check Hooman Labs for a
**scheduled/recurring campaign** option. If it doesn't have one, trigger the campaign
daily via Hooman's API from Supabase `pg_cron` (already used for escalations).

## Keys/accounts YOU set up (none needed by me)
- Hooman Labs account + a phone number to call from
- ElevenLabs voice + Deepgram transcription — configured inside Hooman
- Make.com account
- The `/ingest` endpoint needs no new key (reuses the Supabase key already on Render).
