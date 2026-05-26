# Relay — Supabase backend

Phase 1 of moving the prototype off the static `data.js` onto a real Postgres
(project `https://fzwgdiphjehecsizvwyl.supabase.co`).

## Apply the schema (you run this)

Supabase Dashboard → **SQL Editor** → paste each file's contents **in order** and Run:

1. `01_schema.sql` — tables (jsonb-with-promoted-columns pattern)
2. `02_rls.sql`  — row-level security (L2/L3-only scope; see below)
3. `03_seed.sql` — data translated from `data.js`

All three were validated on Postgres 16; RLS was confirmed to scope an L2
to their own Sub Department and an L3 to the whole department.

Re-running is safe: seed uses `on conflict … do update`. To regenerate the seed
after editing `data.js`: `node scripts/gen_seed.cjs`.

## Access model (now: L2 / L3 / Admin only)

| Role | Who | Scope |
|---|---|---|
| L3 | Pavan Gangireddy | whole Content department |
| L2 | Chanakya, Pushpa, Vijay, Pavan, Prudvi, Tejaswini, Rushikesh, Pavan Teja | their own Sub Department only |
| Admin | Aryaa Sharma | all + config + guideline approvals |

L0 / L1 exist in the `employees` table as **data subjects** so reports roll up
correctly, but they get no login or scope yet. Adding them later = give them
`auth_user_id` + accounts; no policy change needed.

**Impersonation:** an L3/Admin can insert a row into `impersonation` to preview an
L2's exact scope (Phase 3 wires an RPC + UI for this).

## What's next (needs you)

- **Phase 2 — DONE:** `@supabase/supabase-js` (CDN) + async loader into `window.CDC`.
- **Phase 3 — DONE (auth):** email + password login. Run `05_auth.sql` after 01–03.
  Then create the accounts: **Dashboard → Authentication → Users → Add user**
  (tick *Auto Confirm User*), one per manager, `email` = the `employees.email`
  value below, set a default password. The `on_auth_user_created` trigger links
  each to its employee row automatically; users change their password later.

  | Role | Email |
  |---|---|
  | L3 | pavangangireddy@nxtwave.co.in |
  | Admin | aryaa.sharma@nxtwave.co.in |
  | L2 Fullstack | meesala.chanakya@nxtwave.co.in |
  | L2 GenAI | pushpa.chenna@nxtwave.co.in |
  | L2 English | tejaswini.venkata@nxtwave.co.in |
  | L2 Aptitude | poojitha.pachava@nxtwave.co.in |
  | L2 DS&ML | rushikesh.konapure@nxtwave.co.in |
  | L2 DS&Algo | kakarla.pavanteja@nxtwave.co.in |
  | L2 Central Ops | (Vijay — set real email first) |

  L3/Admin can **impersonate** any user (topbar role chip → pick) to preview their
  scope; non-admins can't. "Continue in demo mode" on the login screen bypasses
  auth and uses bundled data (offline demos).
- **Phase 4 — persist writes:** submit report, weekly approve/edit, task triage,
  guideline proposals → INSERT/UPDATE, every reviewed-draft correction writes an
  `engram_interactions` row (the self-evolving loop).
- **Phase 5 — real agents via OpenRouter:** a Supabase **Edge Function**
  (`relay-agent`) holds `OPENROUTER_API_KEY` as a secret and proxies calls,
  re-checking scope server-side. Concierge + MOM Scribe/Dispatcher go live first.
  **Set the key as a Supabase secret — never in the browser, never pasted in chat.**

## DEV note

Before auth is wired, the anon key sees nothing (RLS denies anon). To test the
client early, uncomment the `DEV ONLY` block at the bottom of `02_rls.sql` to add
anon read policies, then remove it before real data goes in.
