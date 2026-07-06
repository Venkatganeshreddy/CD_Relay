-- Relay — Roadmap Planner monthly schedule.
-- pg_cron fires a POST to the `planner-cron` Edge Function on the 25th at
-- 01:00 UTC (06:30 IST — "last week of the month"), which runs the Modal
-- Planner once per pilot sub and writes drafts to `roadmap_drafts`.
-- Run AFTER deploying the function (supabase/functions/planner-cron/index.ts)
-- and setting its secrets (MODAL_PLANNER_URL, PLANNER_SUBS; CRON_SECRET is shared).
--
-- Replace the placeholders (same values as 17_advisor_cron.sql):
--   <PROJECT_REF>  your Supabase project ref
--   <ANON_KEY>     the project's anon/public key
--   <CRON_SECRET>  the same secret set on the function

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('planner-monthly');
exception when others then null;  -- not scheduled yet
end $$;

select cron.schedule(
  'planner-monthly',
  '0 1 25 * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/planner-cron',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'apikey',        '<ANON_KEY>',
                 'Authorization', 'Bearer <ANON_KEY>',
                 'x-cron-secret', '<CRON_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Fire once now to test (optional) — same call the schedule makes:
-- select net.http_post(
--   url     := 'https://<PROJECT_REF>.functions.supabase.co/planner-cron',
--   headers := jsonb_build_object('Content-Type','application/json','apikey','<ANON_KEY>','Authorization','Bearer <ANON_KEY>','x-cron-secret','<CRON_SECRET>'),
--   body    := '{}'::jsonb, timeout_milliseconds := 300000);

-- Inspect: select * from cron.job;  /  select * from cron.job_run_details order by start_time desc limit 5;
