-- Add 12 Content team members (name, EMP ID, company email). Roster gate for SSO
-- + task assignment. Inserts ONLY people not already present (by id OR email),
-- so anyone already on the roster is left untouched (no overwrite, no error).
-- dept/sub/manager left null — set them via Admin > Employees.
insert into employees (id, email, name, initials, manager_id, dept, sub, role_level, title, is_cross_dept, data)
select v.id, v.email, v.name, v.initials, null, null, null, 'L1', 'L1 · Content', false,
       jsonb_build_object('id', v.id, 'name', v.name, 'initials', v.initials,
                          'role', 'L1', 'level', 'L1', 'dept', null, 'sub', null,
                          'title', 'L1 · Content', 'managerId', null)
from (values
  ('NW0001771','meesala.chanakya@nxtwave.co.in','Chanakya Meesala','CM'),
  ('NW0006025','yerramilli.phaniyeshwanth@nxtwave.co.in','Yerramilli Phani Yeshwanth','YP'),
  ('NW0005795','nurubasha.janibasha@nxtwave.co.in','Nurubasha Jani Basha','NJ'),
  ('NW0003056','khushi.jain@nxtwave.co.in','Khushi Jain','KJ'),
  ('NW0003057','vipparthi.angel@nxtwave.co.in','Vipparthi Angel','VA'),
  ('NW0003857','jeevansravanth.parisa@nxtwave.co.in','Jeevan Sravanth Parisa','JS'),
  ('NW0004570','priya.khairate@nxtwave.co.in','Priya Mallikarjun Khairate','PK'),
  ('NW0006123','prashantkumar.jha@nxtwave.co.in','Prashant Kumar Jha','PJ'),
  ('NW0006496','chittharu.nagapravallika@nxtwave.co.in','Chittharu Nagapravallika','CN'),
  ('NW1006940','rishuraj.singh@nxtwave.co.in','Rishu Raj Singh','RS'),
  ('NW1006983','dasari.pallavi@nxtwave.co.in','Dasari Pallavi','DP'),
  ('NW0002531','soumya.esampally@nxtwave.co.in','Esampally Soumya','ES')
) as v(id, email, name, initials)
where not exists (
  select 1 from employees e where e.id = v.id or lower(e.email) = lower(v.email)
);
