-- Relay — Phase 6. Time-based auto-escalation + overdue triggers, run by pg_cron.
-- Mirrors the client-side Escalation Flow (block → immediate manager, remains
-- blocked → next level, overdue → originator) but on a schedule, server-side.
-- Writes land in the `activity` feed (same sink the client uses), so they show
-- up wherever notifications are read. Run after 01–08.

-- Nth manager up the reporting line from an employee (1 = immediate manager).
create or replace function app.manager_at_level(p_emp text, p_level int)
returns text language plpgsql stable security definer set search_path = public, app as $$
declare cur text := p_emp; nxt text; i int := 0;
begin
  if p_emp is null or p_level < 1 then return null; end if;
  loop
    select manager_id into nxt from employees where id = cur;
    if nxt is null then return null; end if;
    i := i + 1; cur := nxt;
    if i >= p_level then return cur; end if;
  end loop;
end; $$;

-- Time-based escalation. A task gets a trigger when it crosses a threshold —
-- in progress > 2 days (3rd day), blocked > 1 day (2nd day), overdue > 2 days
-- (3rd day) — at which point its status flips to ESCALATED and it climbs one
-- manager level per run (L1 → L2 → L3) until the top of the chain.
create or replace function app.run_escalations(p_block_hours int default 24)
returns int language plpgsql security definer set search_path = public, app as $$
declare r record; nxt_idx int; nxt_mgr text; mgr_name text; v_owner text; n int := 0; aid text;
  reason text; eff text; today date := (now() at time zone 'Asia/Kolkata')::date; od int; bdays numeric; adays numeric;
begin
  for r in select id, status, owner_id as oid, data from tasks where status not in ('DONE','SUGGESTED','REJECTED') loop
    v_owner := coalesce(r.oid, r.data->>'owner');
    reason := null;
    -- Overdue > 2 days.
    if (r.data->>'due') is not null and (r.data->>'due')::date < today then
      od := today - (r.data->>'due')::date;
      if od > 2 then reason := 'Overdue ' || od || ' days'; end if;
    end if;
    -- When already ESCALATED, evaluate the state it came from so it can climb further.
    eff := case when r.status = 'ESCALATED' then coalesce(r.data->>'escalPrevStatus','') else r.status end;
    if reason is null and eff = 'BLOCKED' then
      bdays := extract(epoch from (now() - coalesce((r.data->>'blockedAt')::timestamptz, (r.data->>'lastEscalatedAt')::timestamptz, now()))) / 86400;
      if bdays > 1 then reason := 'Blocked ' || floor(bdays)::int || ' days'; end if;
    end if;
    if reason is null and eff = 'ACTIVE' then
      adays := extract(epoch from (now() - coalesce((r.data->>'created')::timestamptz, now()))) / 86400;
      if adays > 2 then reason := 'In progress ' || floor(adays)::int || ' days'; end if;
    end if;
    if reason is null then continue; end if;
    nxt_idx := coalesce((r.data->>'escalIdx')::int, -1) + 1;        -- idx 0 → immediate manager
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

-- Overdue tasks → one-time trigger to the originator/uploader.
create or replace function app.run_overdue_triggers()
returns int language plpgsql security definer set search_path = public, app as $$
declare r record; orig text; n int := 0; today date := (now() at time zone 'Asia/Kolkata')::date; aid text;
begin
  for r in select id, owner_id as oid, data from tasks where status not in ('DONE','SUGGESTED','REJECTED') loop
    if (r.data->>'due') is null or (r.data->>'due')::date >= today then continue; end if;
    if coalesce(r.data->>'overdueNotified','') = 'true' then continue; end if;
    orig := coalesce(r.data->>'createdBy', r.data->>'uploadedBy', r.oid, r.data->>'owner');
    update tasks set data = data || jsonb_build_object('overdueNotified', true), updated_at = now() where id = r.id;
    aid := 'act-od-' || r.id || '-' || floor(extract(epoch from clock_timestamp()))::bigint;
    insert into activity (id, data) values (aid, jsonb_build_object(
      'id', aid, 'kind', 'task_overdue', 'to', orig, 'icon', '⏰', 'refId', r.id,
      'text', '⏰ Overdue: "' || coalesce(r.data->>'title','task') || '" (due ' || (r.data->>'due') || ')',
      'ts', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'));
    n := n + 1;
  end loop;
  return n;
end; $$;

create or replace function app.run_task_automations() returns void
language plpgsql security definer set search_path = public, app as $$
begin perform app.run_escalations(); perform app.run_overdue_triggers(); end; $$;

-- Schedule every 30 minutes (idempotent: drop any prior job of the same name).
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('relay-task-automations'); exception when others then null; end $$;
select cron.schedule('relay-task-automations', '*/30 * * * *', $$select app.run_task_automations()$$);
