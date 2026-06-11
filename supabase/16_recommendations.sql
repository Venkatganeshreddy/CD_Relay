-- Relay — Phase 8. Recommendations: the emergent layer of the Second Brain.
-- The Advisor agent reads the concrete Knowledge (emp data, hierarchy, task/MOM
-- flow defs, architecture) plus recent captures (daily reports, weekly digests,
-- MOMs, KPIs, blockers) and posts suggestion cards here. Four kinds:
--   operational  — risks, missing reports, blocked/overdue work, KPI slips
--   process      — guideline / SOP refinements (complements the Curator loop)
--   priorities   — what to create / prioritise next
--   people       — workload balance, reassignment
-- Run after 01–15.

create table if not exists recommendations (
  id         text primary key,            -- 'rec-...'
  kind       text,                        -- operational / process / priorities / people
  dept       text,                        -- null = cross-department
  status     text default 'new',          -- new / accepted / dismissed / acted
  data       jsonb not null default '{}', -- { title, detail, kind, dept, refs[], severity, agent, ts }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists recommendations_kind_idx on recommendations(kind);
create index if not exists recommendations_dept_idx on recommendations(dept);

alter table recommendations enable row level security;
drop policy if exists rec_read  on recommendations;
drop policy if exists rec_write on recommendations;
-- Readable by any signed-in user; only managers (L2 / L3 / Admin) generate or triage.
create policy rec_read  on recommendations for select using ( auth.uid() is not null );
create policy rec_write on recommendations for all
  using      ( coalesce(app.eff_role() in ('L2','L3','Admin'), false) )
  with check ( coalesce(app.eff_role() in ('L2','L3','Admin'), false) );

-- keep updated_at fresh
drop trigger if exists touch_recommendations on recommendations;
create trigger touch_recommendations before update on recommendations
  for each row execute function app.touch_updated_at();
