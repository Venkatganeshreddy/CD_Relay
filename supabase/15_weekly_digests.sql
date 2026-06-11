-- Relay — Phase 7. Weekly Digest: an all-departments structured consolidation of
-- the week's daily worklogs, grouped by Sub-Department (Metric Category ×
-- Product-Audience × Stack × Output Category), with an agent-written
-- "What was achieved?" line and consolidated logged time. Lands in the Second
-- Brain so the whole department reads at a glance. Run after 01–14.

create table if not exists weekly_digests (
  id         text primary key,            -- 'wd-2026-W24'
  week_of    date,                        -- Monday of the ISO week
  status     text default 'DRAFT',        -- DRAFT / GENERATED / PUBLISHED
  data       jsonb not null default '{}', -- full digest doc (subs[].rows[])
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists weekly_digests_week_idx on weekly_digests(week_of);

alter table weekly_digests enable row level security;
drop policy if exists wd_read  on weekly_digests;
drop policy if exists wd_write on weekly_digests;
-- A digest spans every department, so it is reference material readable by any
-- signed-in user; only managers (L2 / L3 / Admin) generate or edit it.
create policy wd_read  on weekly_digests for select using ( auth.uid() is not null );
create policy wd_write on weekly_digests for all
  using      ( coalesce(app.eff_role() in ('L2','L3','Admin'), false) )
  with check ( coalesce(app.eff_role() in ('L2','L3','Admin'), false) );

-- keep updated_at fresh
drop trigger if exists touch_weekly_digests on weekly_digests;
create trigger touch_weekly_digests before update on weekly_digests
  for each row execute function app.touch_updated_at();
