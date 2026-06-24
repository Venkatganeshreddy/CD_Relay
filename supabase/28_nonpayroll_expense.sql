-- Non-payroll expense ledger: structured planned-vs-actual spend, one row per
-- (period × team × category × tool). Ingested from the maintained Non-Payroll
-- Expense sheet via scripts/import_nonpayroll.cjs; the app loads it into
-- window.CDC.NONPAYROLL_EXPENSE and scopes it per role client-side
-- (filterNonpayroll). Mirrors the knowledge_docs RLS model: readable by any
-- signed-in user, writable only by L3/Admin.
create table if not exists nonpayroll_expense (
  id         text primary key,
  dept       text,
  data       jsonb not null default '{}',   -- { period, dept, sub, ownerL2, category, tool, planned, actual, currency, notes }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists nonpayroll_dept_idx on nonpayroll_expense(dept);

alter table nonpayroll_expense enable row level security;
drop policy if exists npe_read  on nonpayroll_expense;
drop policy if exists npe_write on nonpayroll_expense;
-- Reference/budget data: any signed-in user may read (the app filters by scope);
-- only L3/Admin may write (ingestion uses the service key, which bypasses RLS).
create policy npe_read  on nonpayroll_expense for select using ( auth.uid() is not null );
create policy npe_write on nonpayroll_expense for all    using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
