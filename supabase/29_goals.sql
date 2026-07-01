-- Team goals → deliverables. Each row is one team goal (title) with a nested
-- list of free-text deliverables the L2 lead writes to achieve it. The app loads
-- it into window.CDC.GOALS and scopes it per role client-side (filterGoals).
-- Mirrors the kpis table shape; readable by any signed-in user, writable by the
-- goal's own sub-team (L2 leads) or L3/Admin.
create table if not exists goals (
  id         text primary key,
  dept       text,
  sub        text,
  data       jsonb not null default '{}',   -- { id, sub, dept, title, deliverables:[{id,text}] }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists goals_sub_idx  on goals(sub);
create index if not exists goals_dept_idx on goals(dept);

alter table goals enable row level security;
drop policy if exists goals_read  on goals;
drop policy if exists goals_write on goals;
create policy goals_read  on goals for select using ( auth.uid() is not null );
create policy goals_write on goals for all    using ( app.sub_in_scope(sub) ) with check ( app.sub_in_scope(sub) );
