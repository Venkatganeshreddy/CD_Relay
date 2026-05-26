-- Relay — Phase 3 auth wiring. Run after 01–03.
--
-- Model: email + password via Supabase Auth. An auth.users row is linked to its
-- employees row by matching email → employees.auth_user_id. RLS keys off that.
--
-- Setup after running this file:
--   Dashboard → Authentication → Users → Add user (auto-confirm), one per manager,
--   email = the employees.email value, set a default password. The trigger links
--   them automatically. Users change their password later.

-- ── Link auth.users → employees by email ──────────────────────────────────
create or replace function app.link_auth_user()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  update employees set auth_user_id = new.id
  where lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.link_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email on auth.users
  for each row execute function app.link_auth_user();

-- Backfill: link any auth users that already exist
update employees e set auth_user_id = u.id
from auth.users u where lower(u.email) = lower(e.email) and e.auth_user_id is null;

-- ── whoami: the EFFECTIVE employee (respects impersonation), as the USER-shaped
--    data jsonb the client already consumes. SECURITY DEFINER bypasses RLS so a
--    fresh session can always resolve itself. ───────────────────────────────
create or replace function public.whoami()
returns jsonb language sql stable security definer set search_path = public, app as $$
  select data from employees where id = app.effective_emp_id()
$$;
grant execute on function public.whoami() to authenticated, anon;

-- ── Impersonation (L3/Admin only): preview a manager's exact scope. ──────────
-- set_impersonation(null) clears it.
create or replace function public.set_impersonation(p_emp_id text)
returns void language plpgsql security definer set search_path = public, app as $$
declare lvl text;
begin
  -- Clearing your own impersonation is always allowed (used on login/sign-out/exit).
  if p_emp_id is null then
    delete from impersonation where auth_user_id = auth.uid();
    return;
  end if;
  -- Setting a target requires L3/Admin.
  select role_level into lvl from employees where auth_user_id = auth.uid();
  if lvl is null or lvl not in ('L3','Admin') then
    raise exception 'not permitted: only L3/Admin may impersonate';
  end if;
  insert into impersonation (auth_user_id, emp_id) values (auth.uid(), p_emp_id)
    on conflict (auth_user_id) do update set emp_id = excluded.emp_id, set_at = now();
end $$;
grant execute on function public.set_impersonation(text) to authenticated;

-- whoami_real: the actual signed-in employee, ignoring impersonation (so the UI
-- can show "viewing as …" and offer an exit).
create or replace function public.whoami_real()
returns jsonb language sql stable security definer set search_path = public, app as $$
  select data from employees where auth_user_id = auth.uid()
$$;
grant execute on function public.whoami_real() to authenticated, anon;
