-- Relay — scope fix. Managers should see their whole reporting subtree, not
-- only people whose `sub` string matches exactly. Previously an L2 with a
-- different/NULL sub from their L1s (e.g. DS&ML, DS&Algo, or cross-sub
-- Assessment Intelligence) read 0 reportees. Run after 01–12. Idempotent.

-- True if p_owner is the effective user, or reports (transitively) up to them.
create or replace function app.in_my_subtree(p_owner text) returns boolean
language sql stable security definer set search_path = public, app as $$
  with recursive up as (
    select id, manager_id from employees where id = p_owner
    union all
    select e.id, e.manager_id from employees e join up on up.manager_id = e.id
  )
  select exists (select 1 from up where id = app.effective_emp_id());
$$;

-- Row visible if: HOD/Admin (all), I own it, it's in my reporting subtree,
-- or (legacy fallback) it's tagged to my exact sub-team.
create or replace function app.owner_in_scope(p_owner text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_hod_admin()
      or p_owner = app.effective_emp_id()
      or app.in_my_subtree(p_owner)
      or (select sub from employees where id = p_owner) is not distinct from app.eff_sub();
$$;

-- Verify: as the signed-in manager, how many employees are now in read scope.
select count(*) as employees_readable from employees where app.owner_in_scope(id);
