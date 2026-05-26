-- Relay — security fix. The scope helpers used `is not distinct from`, so an
-- anonymous request (NULL effective user) matched any row whose sub/dept was
-- NULL (DS&ML / DS&Algo). This leaked employees / daily_reports / tasks to anon.
-- Fix: deny when there's no effective user, and use plain `=` (NULL → no match).

create or replace function app.owner_in_scope(p_owner text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.effective_emp_id() is not null and (
    app.is_hod_admin()
    or p_owner = app.effective_emp_id()
    or (select sub from employees where id = p_owner) = app.eff_sub()
  )
$$;

create or replace function app.sub_in_scope(p_sub text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.effective_emp_id() is not null and ( app.is_hod_admin() or p_sub = app.eff_sub() )
$$;

create or replace function app.dept_in_scope(p_dept text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.effective_emp_id() is not null and ( app.is_hod_admin() or p_dept = app.eff_dept() )
$$;
