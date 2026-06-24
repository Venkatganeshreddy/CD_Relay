-- DS&ML roster change: add Sofi Altamsh Yusuf Shah (L1, reports to Rushikesh),
-- remove Aditya Singh (left the org). Sofi gets her real email so Google SSO
-- links her on sign-in.

-- 1. Add Sofi (idempotent — re-run safe).
insert into employees (id, email, name, initials, manager_id, dept, sub, role_level, title, is_cross_dept, data) values
  ('NW0006708','sofi.altamshyusufshah@nxtwave.co.in','Sofi Altamsh Yusuf Shah','SS','NW0005433','d-dsml',NULL,'L1','L1 · Content — DS&ML',false,
   $relay${"id":"NW0006708","name":"Sofi Altamsh Yusuf Shah","initials":"SS","role":"L1","level":"L1","dept":"d-dsml","sub":null,"title":"L1 · Content — DS&ML","managerId":"NW0005433"}$relay$::jsonb)
on conflict (id) do update set
  email = excluded.email, name = excluded.name, manager_id = excluded.manager_id,
  dept = excluded.dept, sub = excluded.sub, role_level = excluded.role_level,
  title = excluded.title, data = excluded.data;

-- 2. Remove Aditya Singh (left). Fails only if he still owns worklogs/tasks/
--    reports (FK RESTRICT) — tell me if so and I'll reassign them first.
delete from employees where id = 'NW0006145';
