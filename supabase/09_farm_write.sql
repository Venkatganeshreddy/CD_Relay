-- 09_farm_write.sql — let users register agents into the Agent Farm.
-- Read policy (farm_read) already lets any authenticated user see the catalog.
-- This adds write: a user may insert/update agents within their scope
-- (own, own sub-team, or anything for L3/Admin). Apply after 01-02.

drop policy if exists farm_write on farm_agents;
create policy farm_write on farm_agents for all
  using ( app.is_hod_admin() or app.owner_in_scope(owner_id) )
  with check ( app.is_hod_admin() or app.owner_in_scope(owner_id) );
