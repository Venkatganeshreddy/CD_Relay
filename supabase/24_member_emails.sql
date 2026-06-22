-- Ensure each of the 12 content members carries their real @nxtwave.co.in email
-- on their EMP-ID row, so Google SSO (link_auth_user matches lower(email)) links
-- them. Guarded against the unique-email constraint: only updates when no OTHER
-- row already holds that email.
update employees e set email = v.email
from (values
  ('NW0001771','meesala.chanakya@nxtwave.co.in'),
  ('NW0006025','yerramilli.phaniyeshwanth@nxtwave.co.in'),
  ('NW0005795','nurubasha.janibasha@nxtwave.co.in'),
  ('NW0003056','khushi.jain@nxtwave.co.in'),
  ('NW0003057','vipparthi.angel@nxtwave.co.in'),
  ('NW0003857','jeevansravanth.parisa@nxtwave.co.in'),
  ('NW0004570','priya.khairate@nxtwave.co.in'),
  ('NW0006123','prashantkumar.jha@nxtwave.co.in'),
  ('NW0006496','chittharu.nagapravallika@nxtwave.co.in'),
  ('NW1006940','rishuraj.singh@nxtwave.co.in'),
  ('NW1006983','dasari.pallavi@nxtwave.co.in'),
  ('NW0002531','soumya.esampally@nxtwave.co.in')
) as v(id, email)
where e.id = v.id
  and lower(coalesce(e.email,'')) is distinct from lower(v.email)
  and not exists (select 1 from employees x where lower(x.email) = lower(v.email) and x.id <> e.id);
