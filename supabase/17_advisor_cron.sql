-- Relay — Phase 8 (scheduling). Weekly auto-run of the Advisor.
-- pg_cron fires a POST to the `advisor-cron` Edge Function, which builds the
-- brief server-side and inserts recommendation cards. Run AFTER deploying the
-- function (see supabase/functions/advisor-cron/index.ts) and setting its
-- secrets (OPENROUTER_API_KEY, CRON_SECRET).
--
-- Before running, replace the three placeholders below:
--   <PROJECT_REF>  e.g. fzwgdiphjehecsizvwyl   (your Supabase project ref)
--   <ANON_KEY>     your project's anon/public key (safe to embed; it's public)
--   <CRON_SECRET>  the SAME long random string you set via
--                  `supabase secrets set CRON_SECRET=...` on the function

-- 1) Extensions (idempotent). Or enable via Dashboard → Database → Extensions.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) (Re)schedule the weekly job. Mon 01:00 UTC = Mon 06:30 IST — just after the
--    Rollup digest window. Unschedule first so re-running this file is safe.
do $$
begin
  perform cron.unschedule('advisor-weekly');
exception when others then null;  -- not scheduled yet
end $$;

select cron.schedule(
  'advisor-weekly',
  '0 1 * * 1',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/advisor-cron',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'apikey',        '<ANON_KEY>',
                 'Authorization', 'Bearer <ANON_KEY>',
                 'x-cron-secret', '<CRON_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- 3) Fire once now to test (optional) — same call the schedule makes:
-- select net.http_post(
--   url     := 'https://<PROJECT_REF>.functions.supabase.co/advisor-cron',
--   headers := jsonb_build_object('Content-Type','application/json','apikey','<ANON_KEY>','Authorization','Bearer <ANON_KEY>','x-cron-secret','<CRON_SECRET>'),
--   body    := '{}'::jsonb, timeout_milliseconds := 120000);

-- Inspect: select * from cron.job;   /   select * from cron.job_run_details order by start_time desc limit 5;
