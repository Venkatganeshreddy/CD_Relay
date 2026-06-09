-- 10_admin_write.sql — let L3/Admin add & update reference data from the Admin UI.
-- employees already covered by emp_admin (02_rls.sql). This adds KPIs and master
-- data (business directions + departments). Apply after 01-02.

drop policy if exists kpi_write  on kpis;
create policy kpi_write  on kpis                for all
  using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

drop policy if exists bd_write   on business_directions;
create policy bd_write   on business_directions for all
  using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

drop policy if exists dept_write on departments;
create policy dept_write on departments         for all
  using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
