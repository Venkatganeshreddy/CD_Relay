-- Relay — Phase 7. Daily 6:00 PM (18:00 IST) snapshot / acknowledgement trigger.
-- Each evening every owner is prompted to acknowledge their open tasks. An
-- acknowledged task records lastAckDate = today. A task that stays open and
-- UNacknowledged past the day it was prompted feeds the escalation engine
-- (climbs L1 → L2 → L3, same as blocked/overdue). Run after 01–09.

-- ── Acknowledgement log ───────────────────────────────────────────────────
create table if not exists task_acknowledgements (
  id          text primary key,
  task_id     text,
  owner_id    text references employees(id),
  ack_date    date,
  status      text,          -- xlsx status the owner confirmed (In-progress/Done/Blocked/Overdue)
  note        text,
  created_at  timestamptz default now()
);
create index if not exists ack_owner_idx on task_acknowledgements (owner_id);
create index if not exists ack_task_idx  on task_acknowledgements (task_id);

alter table task_acknowledgements enable row level security;
drop policy if exists ack_select on task_acknowledgements;
drop policy if exists ack_insert on task_acknowledgements;
-- Low-sensitivity; managers need team visibility → readable by any signed-in user.
create policy ack_select on task_acknowledgements for select to authenticated using (true);
create policy ack_insert on task_acknowledgements for insert to authenticated with check (true);

-- ── 6:30 PM prompt: flag every open task as awaiting acknowledgement ───────
create or replace function app.run_daily_acknowledgement()
returns int language plpgsql security definer set search_path = public, app as $$
declare r record; n int := 0; today date := (now() at time zone 'Asia/Kolkata')::date; aid text;
begin
  for r in select id, owner_id as oid, data from tasks
           where status in ('ACTIVE','BLOCKED','ESCALATED') loop
    if coalesce(r.data->>'lastAckDate','') = today::text then continue; end if;   -- already acked today
    update tasks set data = data || jsonb_build_object('ackPending', true, 'ackPromptDate', today::text),
      updated_at = now() where id = r.id;
    aid := 'act-ack-' || r.id || '-' || floor(extract(epoch from clock_timestamp()))::bigint;
    insert into activity (id, data) values (aid, jsonb_build_object(
      'id', aid, 'kind', 'task_ack_request', 'to', coalesce(r.oid, r.data->>'owner'), 'icon', '📋', 'refId', r.id,
      'text', '📋 6:00 PM snapshot — review: "' || coalesce(r.data->>'title','task') || '"',
      'ts', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'));
    n := n + 1;
  end loop;
  return n;
end; $$;

-- ── Escalation, extended: open + prompted-on-a-prior-day + still unacked. ──
-- Redefines app.run_escalations from 09 to add the "Unacknowledged" reason.
create or replace function app.run_escalations(p_block_hours int default 24)
returns int language plpgsql security definer set search_path = public, app as $$
declare r record; nxt_idx int; nxt_mgr text; mgr_name text; v_owner text; n int := 0; aid text;
  reason text; eff text; today date := (now() at time zone 'Asia/Kolkata')::date; od int; bdays numeric; adays numeric;
begin
  for r in select id, status, owner_id as oid, data from tasks where status not in ('DONE','SUGGESTED','REJECTED') loop
    v_owner := coalesce(r.oid, r.data->>'owner');
    reason := null;
    if (r.data->>'due') is not null and (r.data->>'due')::date < today then
      od := today - (r.data->>'due')::date;
      if od > 2 then reason := 'Overdue ' || od || ' days'; end if;
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
    -- Unacknowledged: prompted at a past 6:30 check-in and never acknowledged.
    if reason is null and coalesce(r.data->>'ackPending','') = 'true'
       and (r.data->>'ackPromptDate') is not null and (r.data->>'ackPromptDate')::date < today then
      reason := 'Unacknowledged since ' || (r.data->>'ackPromptDate');
    end if;
    if reason is null then continue; end if;
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

-- Schedule the daily snapshot at 12:30 UTC = 18:00 IST.
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('relay-daily-acknowledgement'); exception when others then null; end $$;
select cron.schedule('relay-daily-acknowledgement', '30 12 * * *', $$select app.run_daily_acknowledgement()$$);
