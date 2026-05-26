-- Relay — Row Level Security (Phase 1, MANAGERS-ONLY scope)
-- Roles in play now: L3 (HOD Pavan G — dept-wide), L2 (manager — own sub-team),
-- Admin (Aryaa — config/all). L0/L1 policies are written but no such users log in
-- yet; adding employees later needs no policy change, just more employee rows.
--
-- Scope rule:
--   L3 / Admin → everything.
--   L2         → rows they own/authored, plus rows tagged to their sub-team,
--                plus their own dept's reference rows (dept_health, kpis).
--
-- Impersonation: an L3/Admin row in `impersonation` makes scope resolve as the
-- target employee — lets Pavan preview exactly what a manager sees. (Phase 3 RPC.)

-- ── Scope helper functions (SECURITY DEFINER bypasses RLS on employees) ───
create or replace function app.effective_emp_id()
returns text language plpgsql stable security definer set search_path = public, app as $$
declare real_lvl text; real_id text; imp text;
begin
  select id, role_level into real_id, real_lvl from employees where auth_user_id = auth.uid();
  if real_id is null then return null; end if;
  if real_lvl in ('L3','Admin') then
    select emp_id into imp from impersonation where auth_user_id = auth.uid();
    if imp is not null then return imp; end if;
  end if;
  return real_id;
end $$;

create or replace function app.eff_role() returns text language sql stable security definer set search_path = public, app as $$
  select role_level from employees where id = app.effective_emp_id()
$$;
create or replace function app.eff_sub()  returns text language sql stable security definer set search_path = public, app as $$
  select sub  from employees where id = app.effective_emp_id()
$$;
create or replace function app.eff_dept() returns text language sql stable security definer set search_path = public, app as $$
  select dept from employees where id = app.effective_emp_id()
$$;
create or replace function app.is_hod_admin() returns boolean language sql stable security definer set search_path = public, app as $$
  select coalesce(app.eff_role() in ('L3','Admin'), false)
$$;

-- row visible if I own it, or it's tagged to my sub-team
create or replace function app.owner_in_scope(p_owner text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_hod_admin()
      or p_owner = app.effective_emp_id()
      or (select sub from employees where id = p_owner) is not distinct from app.eff_sub()
$$;
create or replace function app.sub_in_scope(p_sub text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_hod_admin() or p_sub is not distinct from app.eff_sub()
$$;
create or replace function app.dept_in_scope(p_dept text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_hod_admin() or p_dept is not distinct from app.eff_dept()
$$;

-- ── Enable RLS everywhere ─────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'employees','business_directions','departments','dept_health','kpis',
    'daily_reports','worklogs','tasks','flags','weekly_summaries','weekly_comments',
    'moms','engram_interactions','eval_sets','guideline_proposals','farm_agents',
    'relay_agents','codex_workflows','codex_guidelines','ai_runs','activity',
    'expense_doc','app_docs','impersonation'] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- ── Org ────────────────────────────────────────────────────────────────────
create policy emp_read   on employees for select using ( app.owner_in_scope(id) );
create policy emp_self   on employees for update using ( id = app.effective_emp_id() ) with check ( id = app.effective_emp_id() );
create policy emp_admin   on employees for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

-- Reference data readable by any authenticated user
create policy bd_read   on business_directions for select using ( auth.uid() is not null );
create policy dept_read on departments         for select using ( auth.uid() is not null );
create policy doc_read  on app_docs            for select using ( auth.uid() is not null );
create policy farm_read on farm_agents         for select using ( auth.uid() is not null );
create policy act_read  on activity            for select using ( auth.uid() is not null );

-- Dept-scoped reference
create policy dh_read   on dept_health for select using ( app.dept_in_scope(id) );
create policy kpi_read  on kpis        for select using ( app.dept_in_scope(dept) );

-- ── Daily work (scoped) ───────────────────────────────────────────────────
create policy dr_read   on daily_reports for select
  using ( app.owner_in_scope(author_id) or app.sub_in_scope(sub) );
create policy dr_write  on daily_reports for all
  using ( author_id = app.effective_emp_id() or app.is_hod_admin() )
  with check ( author_id = app.effective_emp_id() or app.is_hod_admin() );

create policy wl_read   on worklogs for select using ( app.owner_in_scope(owner_id) );
create policy wl_write  on worklogs for all
  using ( owner_id = app.effective_emp_id() or app.is_hod_admin() )
  with check ( owner_id = app.effective_emp_id() or app.is_hod_admin() );

create policy task_read  on tasks for select using ( app.owner_in_scope(owner_id) or app.dept_in_scope(dept) );
create policy task_write on tasks for all using ( app.is_hod_admin() or app.owner_in_scope(owner_id) )
  with check ( app.is_hod_admin() or app.owner_in_scope(owner_id) );

create policy flag_read  on flags for select using ( app.dept_in_scope(dept) );
create policy flag_write on flags for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

-- ── Weekly drafts + comments ───────────────────────────────────────────────
create policy wk_read  on weekly_summaries for select using ( app.dept_in_scope(dept) );
create policy wk_write on weekly_summaries for all using ( app.dept_in_scope(dept) ) with check ( app.dept_in_scope(dept) );

create policy wc_read  on weekly_comments for select using (
  exists (select 1 from weekly_summaries w where w.id = weekly_id and app.dept_in_scope(w.dept)) );
create policy wc_write on weekly_comments for all
  using ( author_id = app.effective_emp_id() or app.is_hod_admin() )
  with check ( author_id = app.effective_emp_id() or app.is_hod_admin() );

create policy mom_read  on moms for select using ( app.dept_in_scope(dept) );
create policy mom_write on moms for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

-- ── Engram: corrections feed (own + admin/hod) ────────────────────────────
create policy eng_read  on engram_interactions for select using ( app.is_hod_admin() or user_id = app.effective_emp_id() );
create policy eng_write on engram_interactions for insert with check ( user_id = app.effective_emp_id() or app.is_hod_admin() );

-- ── System / observability (Admin + L3 only) ──────────────────────────────
create policy es_admin   on eval_sets           for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
create policy prop_admin on guideline_proposals for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
create policy run_admin   on ai_runs             for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
create policy exp_admin   on expense_doc         for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
create policy ra_admin    on relay_agents        for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
-- Codex: read by all authenticated, edit by Admin/L3
create policy cw_read  on codex_workflows  for select using ( auth.uid() is not null );
create policy cw_write on codex_workflows  for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
create policy cg_read  on codex_guidelines for select using ( auth.uid() is not null );
create policy cg_write on codex_guidelines for all using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

-- Impersonation: a user manages only their own impersonation row, L3/Admin only
create policy imp_own on impersonation for all
  using ( auth_user_id = auth.uid() and app.is_hod_admin() )
  with check ( auth_user_id = auth.uid() and app.is_hod_admin() );

-- ───────────────────────────────────────────────────────────────────────────
-- DEV ONLY — uncomment to let the app read with the anon key BEFORE auth is
-- wired (Phase 2 testing). Remove before exposing real data.
-- do $$ declare t text; begin
--   foreach t in array array['employees','business_directions','departments',
--     'dept_health','kpis','daily_reports','worklogs','tasks','flags',
--     'weekly_summaries','weekly_comments','moms','farm_agents','activity',
--     'codex_workflows','codex_guidelines','app_docs','relay_agents','ai_runs',
--     'eval_sets','guideline_proposals','expense_doc','engram_interactions'] loop
--     execute format('create policy dev_anon_read on %I for select using (true);', t);
--   end loop; end $$;
