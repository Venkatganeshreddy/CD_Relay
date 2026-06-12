-- Relay — self-serve signup gate ("Request access"). Run after 01–05.
--
-- Model: an employee already added in the app (an employees row with their
-- company email) can create their OWN auth account from the login screen and
-- choose their password — no admin-provisioned default password needed. The
-- on_auth_user_created trigger (05_auth.sql) links the new auth user to the
-- employees row by email, so scope/RBAC works immediately.
--
-- Dashboard setting for instant access (no verification step):
--   Authentication → Sign In / Up → Email → turn OFF "Confirm email".
-- If left ON, the UI falls back to "check your inbox, then sign in".

-- Gate: can this email self-register? RLS hides employees from anon, so this
-- is SECURITY DEFINER. Returns only booleans (no names/ids) to keep what an
-- anonymous probe can learn to a minimum.
--   allowed — an employees row with this email exists
--   already — that row is already linked to an auth account (use Sign in)
create or replace function public.email_has_access(p_email text)
returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select jsonb_build_object('allowed', true, 'already', e.auth_user_id is not null)
       from employees e where lower(e.email) = lower(p_email) limit 1),
    jsonb_build_object('allowed', false, 'already', false))
$$;
grant execute on function public.email_has_access(text) to anon, authenticated;
