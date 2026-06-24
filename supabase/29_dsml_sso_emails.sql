-- Enable Google SSO for the DS&ML team: set each EMP-ID row's email to the
-- person's real @nxtwave.co.in address so link_auth_user (matches lower(email))
-- links them on sign-in. Same guard as earlier email migrations: only update
-- when the value changes and no OTHER row already holds that email.
update employees e set email = v.email
from (values
  ('NW0005433','rushikesh.konapure@nxtwave.co.in'),
  ('NW0001429','sreenu.gampala@nxtwave.co.in'),
  ('NW0006190','nangunoori.chandu@nxtwave.co.in'),
  ('NW0005962','bhemana.kavya@nxtwave.co.in'),
  ('NW1006863','damsalapudi.manojkumar@nxtwave.co.in'),
  ('NW0005113','saimanvish.kompella@nxtwave.co.in'),
  ('NW0003727','alka.kumari@nxtwave.co.in'),
  ('NW0004593','srutthisri.g@nxtwave.co.in'),
  ('NW0006237','tejeswararao.n@nxtwave.co.in'),
  ('NW1005903','rentala.lavanyasri@nxtwave.co.in')
) as v(id, email)
where e.id = v.id
  and lower(coalesce(e.email,'')) is distinct from lower(v.email)
  and not exists (select 1 from employees x where lower(x.email) = lower(v.email) and x.id <> e.id);
