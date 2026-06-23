-- English team restructure + SSO.
--   • Pratik Bhattacharjee (NW0006195) becomes L2 lead of Content — English,
--     reporting to Pavan Gangireddy (NW0002526, L3).
--   • The rest of the English team reports to Pratik; all normalized to the
--     'Content — English' sub.
--   • Tejaswini Venkata (NW0001240) leaves the org (deleted last).
--   • Real @nxtwave.co.in emails set so Google SSO links each member.
--
-- Run statements top-to-bottom. The final DELETE is the only one that can fail
-- (FK RESTRICT) — only if Tejaswini still owns worklogs/tasks/reports. If it
-- errors, everything above has still applied; tell me and I'll reassign her rows.

-- 1. Real emails (Google SSO). Guarded against the unique-email constraint.
update employees e set email = v.email
from (values
  ('NW0006195','pratik.bhattacharjee@nxtwave.co.in'),
  ('NW0005886','namitha.mohasin@nxtwave.co.in'),
  ('NW0003881','renna.fathima@nxtwave.co.in'),
  ('NW0005042','thadigiri.premdeep@nxtwave.co.in'),
  ('NW0004107','sannamuri.srinagapoojitha@nxtwave.co.in'),
  ('NW0004831','bonam.jithendravenkatasai@nxtwave.co.in'),
  ('NW0004881','mariyam.khan@nxtwave.co.in')
) as v(id, email)
where e.id = v.id
  and lower(coalesce(e.email,'')) is distinct from lower(v.email)
  and not exists (select 1 from employees x where lower(x.email) = lower(v.email) and x.id <> e.id);

-- 2. Promote Pratik to L2 lead of Content — English, reporting to Pavan (L3).
update employees set
  role_level = 'L2',
  sub = 'Content — English',
  title = 'L2 · Content — English',
  manager_id = 'NW0002526',
  data = data || jsonb_build_object(
    'role','L2','level','L2','sub','Content — English',
    'title','L2 · Content — English','managerId','NW0002526')
where id = 'NW0006195';

-- 3. Move the rest of the English team under Pratik; normalize sub + title.
update employees set
  sub = 'Content — English',
  title = 'L1 · Content — English',
  manager_id = 'NW0006195',
  data = data || jsonb_build_object(
    'sub','Content — English','title','L1 · Content — English','managerId','NW0006195')
where id in ('NW0005886','NW0003881','NW0005042','NW0004107','NW0004831','NW0004881');

-- 4. Safety net: re-point any other straggler still reporting to Tejaswini.
update employees set
  manager_id = 'NW0006195',
  data = data || jsonb_build_object('managerId','NW0006195')
where manager_id = 'NW0001240' and id <> 'NW0006195';

-- 5. Remove Tejaswini from the org (nothing references her as manager now).
delete from employees where id = 'NW0001240';
