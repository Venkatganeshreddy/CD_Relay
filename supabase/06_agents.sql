-- Relay — Phase 5b. Let signed-in users record agent runs to the observability
-- tables (AI Runs + activity feed). Reads stay as defined in 02_rls.sql
-- (ai_runs is L3/Admin-read; activity is read-by-all). Run after 01–05.

drop policy if exists run_insert on ai_runs;
drop policy if exists act_insert on activity;
create policy run_insert on ai_runs   for insert to authenticated with check (true);
create policy act_insert on activity  for insert to authenticated with check (true);
