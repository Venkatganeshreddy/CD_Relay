-- All 12 content members are the Fullstack team (d-fsgci / Content — Fullstack).
-- Chanakya (NW0001771) + Yerramilli (NW0006025) are L2; the other 10 are L1
-- reporting to Chanakya by default (reassign to Yerramilli via Admin as needed).

-- 1) Everyone -> Fullstack.
update employees set dept = 'd-fsgci', sub = 'Content — Fullstack',
  data = data || jsonb_build_object('dept','d-fsgci','sub','Content — Fullstack')
where id in ('NW0001771','NW0006025','NW0005795','NW0003056','NW0003057','NW0003857',
             'NW0004570','NW0006123','NW0006496','NW1006940','NW1006983','NW0002531');

-- 2) The two leads -> L2.
update employees set role_level = 'L2', title = 'L2 · Content — Fullstack',
  data = data || jsonb_build_object('role','L2','level','L2','title','L2 · Content — Fullstack')
where id in ('NW0001771','NW0006025');

-- 3) The other ten -> L1, reporting to Chanakya (NW0001771).
update employees set role_level = 'L1', title = 'L1 · Content — Fullstack', manager_id = 'NW0001771',
  data = data || jsonb_build_object('role','L1','level','L1','title','L1 · Content — Fullstack','managerId','NW0001771')
where id in ('NW0005795','NW0003056','NW0003057','NW0003857','NW0004570','NW0006123',
             'NW0006496','NW1006940','NW1006983','NW0002531');
