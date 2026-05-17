-- Supabase Security Lint: anon + authenticated can RPC the SECURITY DEFINER
-- migration helper `public.rls_auto_enable()` via /rest/v1/rpc/rls_auto_enable.
--
-- rls_auto_enable() is a migration-time utility (enables RLS on tables);
-- it has no business being callable by client roles. Following the same
-- pattern proven in 0023 for handle_new_user: revoke from PUBLIC (not just
-- anon/authenticated, since both inherit EXECUTE from PUBLIC and a direct
-- revoke is a no-op for the advisor warning), then re-grant explicitly to
-- postgres + service_role so migrations / Supabase tooling keep working.
--
-- Refs:
--   - https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
--   - https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, service_role;
