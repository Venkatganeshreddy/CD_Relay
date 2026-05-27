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

-- Escalate tasks that have stayed BLOCKED past the threshold — one level per run.
create or replace function app.run_escalations(p_block_hours int default 48)
returns int language plpgsql security definer set search_path = public, app as $$
declare r record; nxt_idx int; nxt_mgr text; mgr_name text; v_owner text; since timestamptz; n int := 0; aid text;
begin
  for r in select id, owner_id as oid, data from tasks where status = 'BLOCKED' loop
    since := coalesce((r.data->>'lastEscalatedAt')::timestamptz, (r.data->>'blockedAt')::timestamptz, now());
    if since > now() - make_interval(hours => p_block_hours) then continue; end if;  -- not old enough
    v_owner := coalesce(r.oid, r.data->>'owner');
    nxt_idx := coalesce((r.data->>'escalIdx')::int, 0) + 1;          -- 0 = immediate already notified at block
    nxt_mgr := app.manager_at_level(v_owner, nxt_idx + 1);           -- escalIdx 1 → level-2 manager, etc.
    if nxt_mgr is null then continue; end if;                        -- already at top of hierarchy
    select name into mgr_name from employees where id = nxt_mgr;
    update tasks set data = data || jsonb_build_object('escalIdx', nxt_idx, 'escalatedTo', nxt_mgr, 'lastEscalatedAt', now()::text), updated_at = now() where id = r.id;
    aid := 'act-esc-' || r.id || '-' || floor(extract(epoch from clock_timestamp()))::bigint;
    insert into activity (id, data) values (aid, jsonb_build_object(
      'id', aid, 'kind', 'task_escalated', 'to', nxt_mgr, 'icon', '⏫', 'refId', r.id,
      'text', '⏫ Auto-escalated: "' || coalesce(r.data->>'title','task') || '" still blocked → ' || coalesce(mgr_name, nxt_mgr),
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
begin perform app.run_escalations(48); perform app.run_overdue_triggers(); end; $$;

-- Schedule every 30 minutes (idempotent: drop any prior job of the same name).
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('relay-task-automations'); exception when others then null; end $$;
select cron.schedule('relay-task-automations', '*/30 * * * *', $$select app.run_task_automations()$$);
