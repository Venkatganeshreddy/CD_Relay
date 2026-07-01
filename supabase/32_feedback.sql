-- Application feedback (idea / bug / praise / annoyance). Anyone signed-in can
-- submit via the floating ✎ button; the Feedback page lists them all.
create table if not exists app_feedback (
  id         text primary key,
  user_id    text,
  kind       text,
  status     text default 'open',
  data       jsonb not null default '{}',   -- { id, kind, text, page, userId, userName, ts, status }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists app_feedback_kind_idx on app_feedback(kind);
alter table app_feedback enable row level security;
drop policy if exists fb_read  on app_feedback;
drop policy if exists fb_write on app_feedback;
create policy fb_read  on app_feedback for select using ( auth.uid() is not null );
create policy fb_write on app_feedback for all    using ( auth.uid() is not null ) with check ( auth.uid() is not null );
