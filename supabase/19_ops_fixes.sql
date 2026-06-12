-- Relay — ops fixes. Run after 01–10 (re-runnable).
--  1. Deadline escalation is IMMEDIATE: a task escalates on the first scan
--     after its due date passes (was: only when overdue > 2 days).
--  2. app_docs becomes admin-writable so L3/Admin can edit the task catalog
--     (products / stacks / output categories) from the new Task-catalog page.
--  3. (Re)schedules the pg_cron jobs in case 09/10 were never applied:
--     escalation scan every 30 min + the 6:00 PM IST daily acknowledgement.

-- ── 1. run_escalations with immediate overdue (keeps the unack reason from 10) ─
create or replace function app.run_escalations(p_block_hours int default 24)
returns int language plpgsql security definer set search_path = public, app as $$
declare r record; nxt_idx int; nxt_mgr text; mgr_name text; v_owner text; n int := 0; aid text;
  reason text; eff text; today date := (now() at time zone 'Asia/Kolkata')::date; od int; bdays numeric; adays numeric;
begin
  for r in select id, status, owner_id as oid, data from tasks where status not in ('DONE','SUGGESTED','REJECTED') loop
    v_owner := coalesce(r.oid, r.data->>'owner');
    reason := null;
    -- Overdue: escalate immediately once the due date has passed.
    if (r.data->>'due') is not null and (r.data->>'due')::date < today then
      od := today - (r.data->>'due')::date;
      reason := 'Overdue ' || od || ' day' || case when od = 1 then '' else 's' end;
    end if;
    eff := case when r.status = 'ESCALATED' then coalesce(r.data->>'escalPrevStatus','') else r.status end;
    if reason is null and eff = 'BLOCKED' then
      bdays := extract(epoch from (now() - coalesce((r.data->>'blockedAt')::timestamptz, (r.data->>'lastEscalatedAt')::timestamptz, now()))) / 86400;
      if bdays > 1 then reason := 'Blocked ' || floor(bdays)::int || ' days'; end if;
    end if;
    if reason is null and eff = 'ACTIVE' then
      adays := extract(epoch from (now() - coalesce((r.data->>'created')::timestamptz, now()))) / 86400;
      if adays > 2 then reason := 'In progress ' || floor(adays)::int || ' days'; end if;
    end if;
    -- Unacknowledged: prompted at a past 6:00 PM check-in and never acknowledged.
    if reason is null and coalesce(r.data->>'ackPending','') = 'true'
       and (r.data->>'ackPromptDate') is not null and (r.data->>'ackPromptDate')::date < today then
      reason := 'Unacknowledged since ' || (r.data->>'ackPromptDate');
    end if;
    if reason is null then continue; end if;
    -- Already escalated for the same reason today? Don't climb more than one
    -- level per day (the scan runs every 30 min).
    if r.status = 'ESCALATED' and (r.data->>'lastEscalatedAt') is not null
       and ((r.data->>'lastEscalatedAt')::timestamptz at time zone 'Asia/Kolkata')::date = today then
      continue;
    end if;
    nxt_idx := coalesce((r.data->>'escalIdx')::int, -1) + 1;
    nxt_mgr := app.manager_at_level(v_owner, nxt_idx + 1);
    update tasks set status = 'ESCALATED',
      data = data || jsonb_build_object(
        'escalPrevStatus', case when r.status = 'ESCALATED' then r.data->>'escalPrevStatus' else r.status end,
        'escalIdx', nxt_idx, 'escalatedTo', coalesce(nxt_mgr, r.data->>'escalatedTo'),
        'escalReason', reason, 'lastEscalatedAt', now()::text),
      updated_at = now() where id = r.id;
    select name into mgr_name from employees where id = nxt_mgr;
    aid := 'act-esc-' || r.id || '-' || floor(extract(epoch from clock_timestamp()))::bigint;
    insert into activity (id, data) values (aid, jsonb_build_object(
      'id', aid, 'kind', 'task_escalated', 'to', nxt_mgr, 'icon', '⏫', 'refId', r.id,
      'text', '⏫ Escalated: "' || coalesce(r.data->>'title','task') || '" — ' || reason || coalesce(' → ' || mgr_name, ''),
      'ts', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'));
    n := n + 1;
  end loop;
  return n;
end; $$;

-- ── 2. Task catalog: L3/Admin write access to app_docs ─────────────────────
drop policy if exists doc_write on app_docs;
create policy doc_write on app_docs for all
  using ( app.is_hod_admin() ) with check ( app.is_hod_admin() );

-- ── 3. Make sure the cron jobs actually exist ──────────────────────────────
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('relay-task-automations'); exception when others then null; end $$;
select cron.schedule('relay-task-automations', '*/30 * * * *', $$select app.run_task_automations()$$);
do $$ begin perform cron.unschedule('relay-daily-acknowledgement'); exception when others then null; end $$;
select cron.schedule('relay-daily-acknowledgement', '30 12 * * *', $$select app.run_daily_acknowledgement()$$);
