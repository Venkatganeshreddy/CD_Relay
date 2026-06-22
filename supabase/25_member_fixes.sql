-- Fix 1: Yerramilli (NW0006025) -> L2.
update employees set role_level = 'L2', title = 'L2 · Content — Fullstack',
  data = data || jsonb_build_object('role','L2','level','L2','title','L2 · Content — Fullstack')
where id = 'NW0006025';

-- Fix 2: Chittharu already exists under a different EMP ID. Update that row
-- (matched by her company email) to Fullstack L1 so she's on the team + SSO works.
update employees set role_level = 'L1', dept = 'd-fsgci', sub = 'Content — Fullstack',
  title = 'L1 · Content — Fullstack', manager_id = 'NW0001771',
  data = data || jsonb_build_object('role','L1','level','L1','dept','d-fsgci',
                                    'sub','Content — Fullstack','title','L1 · Content — Fullstack','managerId','NW0001771')
where lower(email) = 'chittharu.nagapravallika@nxtwave.co.in';
