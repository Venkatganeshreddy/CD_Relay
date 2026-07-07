-- Divya Bodireddy — guest with leadership visibility (sees L3/L2/L1 scopes).
-- Modeled on the existing L3 row (03_seed.sql: Pavan): role L3, cross-dept.
-- SSO: an employees row with her email IS the gate (18_signup_access.sql) —
-- her Google sign-in auto-links via on_auth_user_created (05_auth.sql).
-- Note: Relay has no read-only role; L3 view implies L3 write scope too.
insert into employees (id, email, name, initials, manager_id, dept, sub, role_level, title, is_cross_dept, data) values
  ('NW-DIVYA-GUEST', 'divya.bodreddi@nxtwave.co.in', 'Divya Bodireddy', 'DB', 'NW0002526', 'd-fsgci', 'Central Ops', 'L3', 'Guest - Leadership view', true,
   $relay${"id":"NW-DIVYA-GUEST","name":"Divya Bodireddy","initials":"DB","role":"L3","level":"L3","dept":"d-fsgci","sub":"Central Ops","title":"Guest - Leadership view","managerId":"NW0002526","crossDept":true}$relay$::jsonb)
on conflict (id) do update set
  email = excluded.email, name = excluded.name, role_level = excluded.role_level,
  title = excluded.title, is_cross_dept = excluded.is_cross_dept, data = excluded.data;
