-- Relay — roster sync to latest Team List (CD).
-- Adds Sunil Tekale (L2, University Partnership), repoints Yedam to Pavan G,
-- removes the Vijay placeholder and Pakala Akshitha (left the org). Idempotent.
-- Run after 01–11.

-- 1. Add / update Sunil Tekale.
insert into employees (id, email, name, initials, manager_id, dept, sub, role_level, title, is_cross_dept, data) values
  ('NW0006700', 'sunil.tekale@nxtwave.co.in', 'Sunil Tekale', 'ST', 'NW0002526', 'd-fsgci', 'University Partnership', 'L2', 'L2 · University Partnership', false,
   jsonb_build_object('id','NW0006700','name','Sunil Tekale','initials','ST','role','L2','level','L2','dept','d-fsgci','sub','University Partnership','title','L2 · University Partnership','managerId','NW0002526'))
on conflict (id) do update set
  email = excluded.email, name = excluded.name, initials = excluded.initials,
  manager_id = excluded.manager_id, dept = excluded.dept, sub = excluded.sub,
  role_level = excluded.role_level, title = excluded.title, data = excluded.data, updated_at = now();

-- 2. Repoint Yedam to Pavan G (his old manager Vijay is being removed).
update employees set manager_id = 'NW0002526', data = data || jsonb_build_object('managerId','NW0002526'), updated_at = now()
  where id = 'NW0006717';

-- 3. Remove leavers / placeholders: Vijay (placeholder) and Akshitha (left).
delete from tasks                  where owner_id  in ('NW-VIJAY-CO','NW1006396');
delete from daily_reports          where author_id in ('NW-VIJAY-CO','NW1006396');
delete from worklogs               where owner_id  in ('NW-VIJAY-CO','NW1006396');
delete from task_acknowledgements  where owner_id  in ('NW-VIJAY-CO','NW1006396');
delete from engram_interactions    where user_id   in ('NW-VIJAY-CO','NW1006396');
update employees set manager_id = 'NW0002526' where manager_id = 'NW-VIJAY-CO';
delete from employees where id in ('NW-VIJAY-CO','NW1006396');

-- 4. Verify.
select id, name, role_level, sub, manager_id from employees
  where id in ('NW0006700','NW0006717','NW1006396','NW-VIJAY-CO') order by role_level;
