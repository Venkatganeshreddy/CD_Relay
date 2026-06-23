-- Enable Google SSO for the Aptitude team: set each EMP-ID row's email to the
-- person's real @nxtwave.co.in address so link_auth_user (matches lower(email))
-- links them on sign-in. Same guard as 24_member_emails.sql: only update when no
-- OTHER row already holds that email (unique-email constraint).
update employees e set email = v.email
from (values
  ('NW0004661','vivek.vijayan@nxtwave.co.in'),
  ('NW0004998','pinisetti.srinivas@nxtwave.co.in'),
  ('NW0005117','pinisetti.viswanadh@nxtwave.co.in'),
  ('NW0004785','boosa.manish@nxtwave.co.in'),
  ('NW0004629','vivek.paturi@nxtwave.co.in'),
  ('NW0003323','krishnachakradhar.pasupuleti@nxtwave.co.in')
) as v(id, email)
where e.id = v.id
  and lower(coalesce(e.email,'')) is distinct from lower(v.email)
  and not exists (select 1 from employees x where lower(x.email) = lower(v.email) and x.id <> e.id);
