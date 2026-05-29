-- Relay — roster sync to latest Team List (CD).
-- Adds Pakala Akshitha + Sunil Tekale, repoints Yedam to Pavan G, removes the
-- Vijay placeholder (not in the official roster). Idempotent. Run after 01–11.

-- 1. Add / update the two new members (upsert).
insert into employees (id, email, name, initials, manager_id, dept, sub, role_level, title, is_cross_dept, data) values
  ('NW1006396', 'pakala.akshitha@nxtwave.co.in', 'Pakala Akshitha', 'PA', 'NW0001240', 'd-fsgci', 'Assessment Intelligence', 'L1', 'L1 · Assessment Intelligence', false,
   $relay${"id":"NW1006396","name":"Pakala Akshitha","initials":"PA","role":"L1","level":"L1","dept":"d-fsgci","sub":"Assessment Intelligence","title":"L1 · Assessment Intelligence","managerId":"NW0001240"}$relay$::jsonb),
  ('NW0006700', 'sunil.tekale@nxtwave.co.in', 'Sunil Tekale', 'ST', 'NW0002526', 'd-fsgci', 'University Partnership', 'L2', 'L2 · University Partnership', false,
   $relay${"id":"NW0006700","name":"Sunil Tekale","initials":"ST","role":"L2","level":"L2","dept":"d-fsgci","sub":"University Partnership","title":"L2 · University Partnership","managerId":"NW0002526"}$relay$::jsonb)
on conflict (id) do update set
  email = excluded.email, name = excluded.name, initials = excluded.initials,
  manager_id = excluded.manager_id, dept = excluded.dept, sub = excluded.sub,
  role_level = excluded.role_level, title = excluded.title, data = excluded.data, updated_at = now();

-- 2. Repoint Yedam to Pavan G (his old manager Vijay is being removed).
update employees
  set manager_id = 'NW0002526',
      data = data || '{"managerId":"NW0002526"}'::jsonb,
      updated_at = now()
  where id = 'NW0006717';

-- 3. Remove the Vijay placeholder. Defensive: clear any operational rows that
--    reference him first so the FK delete can't be blocked (these tables are
--    normally empty). Then drop the employee row.
delete from tasks                  where owner_id  = 'NW-VIJAY-CO';
delete from daily_reports          where author_id = 'NW-VIJAY-CO';
delete from worklogs               where owner_id  = 'NW-VIJAY-CO';
delete from task_acknowledgements  where owner_id  = 'NW-VIJAY-CO';
delete from engram_interactions    where user_id   = 'NW-VIJAY-CO';
update employees set manager_id = 'NW0002526' where manager_id = 'NW-VIJAY-CO';
delete from employees where id = 'NW-VIJAY-CO';

-- 4. Verify.
select id, name, role_level, sub, manager_id from employees
  where id in ('NW1006396','NW0006700','NW0006717') or id = 'NW-VIJAY-CO'
  order by role_level;
