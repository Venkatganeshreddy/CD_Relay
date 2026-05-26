-- Relay — Supabase schema (Phase 1 of the Supabase migration)
-- Pattern: each table promotes its scope/index fields to real columns (for RLS
-- + querying) and keeps the rest of the record in `data jsonb`, so the async
-- client can return rows as {...data, id} — identical to today's window.CDC shape.
--
-- Paste order: 01_schema.sql → 02_rls.sql → 03_seed.sql
-- Run in: Supabase Dashboard → SQL Editor.

create schema if not exists app;

-- ── Org ──────────────────────────────────────────────────────────────────
create table if not exists employees (
  id            text primary key,                 -- e.g. 'u-chanakya'
  email         text unique,                       -- synthesized: <id>@nxtwave.tech
  name          text not null,
  initials      text,
  manager_id    text references employees(id),     -- reporting tree
  dept          text,                              -- 'd-fsgci' etc. (null = cross/admin)
  sub           text,                              -- sub-team label
  role_level    text not null,                     -- L0 / L1 / L2 / L3 / Admin
  title         text,
  is_cross_dept boolean default false,
  auth_user_id  uuid unique,                       -- links to auth.users (set at login)
  data          jsonb not null default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists employees_manager_idx on employees(manager_id);
create index if not exists employees_dept_idx     on employees(dept);
create index if not exists employees_auth_idx      on employees(auth_user_id);

create table if not exists business_directions (
  id text primary key, data jsonb not null default '{}'
);

create table if not exists departments (
  id text primary key, bd_id text, product_id text, data jsonb not null default '{}'
);

create table if not exists dept_health (
  id text primary key,                              -- dept id
  data jsonb not null default '{}', updated_at timestamptz default now()
);

-- ── KPIs ─────────────────────────────────────────────────────────────────
create table if not exists kpis (
  id text primary key, dept text, owner_id text references employees(id),
  data jsonb not null default '{}', updated_at timestamptz default now()
);
create index if not exists kpis_dept_idx on kpis(dept);

-- ── Daily reports ──────────────────────────────────────────────────────────
create table if not exists daily_reports (
  id text primary key,
  author_id   text references employees(id),
  dept        text,
  sub         text,
  report_date date,
  data        jsonb not null default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists daily_reports_author_idx on daily_reports(author_id);
create index if not exists daily_reports_dept_idx   on daily_reports(dept);
create index if not exists daily_reports_date_idx    on daily_reports(report_date);

-- ── Worklogs (derived per-task day entries) ───────────────────────────────
create table if not exists worklogs (
  id text primary key,
  owner_id  text references employees(id),
  dept      text,
  work_date date,
  data      jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists worklogs_owner_idx on worklogs(owner_id);
create index if not exists worklogs_dept_idx  on worklogs(dept);

-- ── Tasks ────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id text primary key,
  owner_id   text references employees(id),
  dept       text,
  status     text,                                 -- SUGGESTED / ACTIVE / DONE
  data       jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tasks_owner_idx  on tasks(owner_id);
create index if not exists tasks_dept_idx   on tasks(dept);
create index if not exists tasks_status_idx on tasks(status);

-- ── Data-quality flags ─────────────────────────────────────────────────────
create table if not exists flags (
  id text primary key,
  dept       text,                                 -- null = global (admin/L3 only)
  state      text,                                 -- open / snoozed / resolved / dismissed
  data       jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists flags_dept_idx on flags(dept);

-- ── Weekly summaries + inline comments ────────────────────────────────────
create table if not exists weekly_summaries (
  id text primary key,
  dept       text,
  status     text,                                 -- DRAFT / IN_REVIEW / APPROVED / REJECTED
  data       jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists weekly_dept_idx on weekly_summaries(dept);

create table if not exists weekly_comments (
  id text primary key,
  weekly_id  text references weekly_summaries(id) on delete cascade,
  author_id  text references employees(id),
  data       jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists weekly_comments_weekly_idx on weekly_comments(weekly_id);

-- ── MOMs (meeting memory) ──────────────────────────────────────────────────
create table if not exists moms (
  id text primary key, dept text, data jsonb not null default '{}',
  created_at timestamptz default now()
);

-- ── Engram: corrections that feed the self-evolving loop ──────────────────
create table if not exists engram_interactions (
  id text primary key,
  agent      text,
  user_id    text references employees(id),
  dept       text,
  human_action text,                               -- accept / edit / reject
  data       jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists engram_agent_idx on engram_interactions(agent);
create index if not exists engram_user_idx  on engram_interactions(user_id);

create table if not exists eval_sets (
  id text primary key, agent text, data jsonb not null default '{}'
);
create table if not exists guideline_proposals (
  id text primary key, agent text, status text default 'pending',
  data jsonb not null default '{}', created_at timestamptz default now()
);

-- ── Agent Farm + Relay agent roster ──────────────────────────────────────
create table if not exists farm_agents (
  id text primary key, owner_id text references employees(id),
  data jsonb not null default '{}'
);
create table if not exists relay_agents (
  id text primary key, data jsonb not null default '{}'
);

-- ── Codex (system reference) ───────────────────────────────────────────────
create table if not exists codex_workflows  ( id text primary key, data jsonb not null default '{}' );
create table if not exists codex_guidelines ( id text primary key, data jsonb not null default '{}' );

-- ── Ops / observability ───────────────────────────────────────────────────
create table if not exists ai_runs (
  id text primary key, agent text, data jsonb not null default '{}',
  created_at timestamptz default now()
);
create table if not exists activity (
  id text primary key, data jsonb not null default '{}', created_at timestamptz default now()
);

-- ── Cost: tool/token expense (singleton dashboard doc + future ledger) ────
create table if not exists expense_doc (
  id text primary key default 'current', data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- ── Singletons / misc lookup docs ─────────────────────────────────────────
create table if not exists app_docs (
  key text primary key, data jsonb not null default '{}', updated_at timestamptz default now()
);

-- ── Admin-set impersonation (Phase 3: L3/Admin can view as a reportee) ────
create table if not exists impersonation (
  auth_user_id uuid primary key,
  emp_id       text references employees(id),
  set_at       timestamptz default now()
);

-- keep updated_at fresh
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','dept_health','kpis','daily_reports','tasks',
                           'flags','weekly_summaries','expense_doc','app_docs'] loop
    execute format(
      'drop trigger if exists touch_%1$s on %1$s; create trigger touch_%1$s before update on %1$s for each row execute function app.touch_updated_at();', t);
  end loop;
end $$;
