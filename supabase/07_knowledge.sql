-- Relay — Phase 6. Knowledge layer: notes authored in the Obsidian vault are
-- ingested here so agents (Concierge) can ground on human-written context.
-- Run after 01–06. Then ingest with scripts/import_obsidian.cjs.

create table if not exists knowledge_docs (
  id          text primary key,          -- vault-relative slug, e.g. "Notes/onboarding-tips"
  title       text,
  type        text,                       -- workflow / guideline / agent / note / person …
  tags        text[],
  path        text,                       -- original vault path
  source      text default 'vault',
  body        text,
  data        jsonb not null default '{}',
  updated_at  timestamptz default now()
);

alter table knowledge_docs enable row level security;
drop policy if exists kd_read  on knowledge_docs;
drop policy if exists kd_write on knowledge_docs;
-- Readable by any signed-in user (it's reference material); editable by L3/Admin.
create policy kd_read  on knowledge_docs for select using ( auth.uid() is not null );
create policy kd_write on knowledge_docs for all    using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );
