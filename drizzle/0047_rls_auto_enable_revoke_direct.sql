-- Follow-up to 0043: REVOKE FROM PUBLIC was insufficient because Supabase
-- default privileges grant EXECUTE directly to anon/authenticated on new
-- functions in public schema (not via PUBLIC inheritance). 0043's comment
-- assumed the reverse — but the advisor was still flagging the function as
-- callable by anon + authenticated even after 0043 shipped.
--
-- 0023 worked for handle_new_user only because 0022 had already issued the
-- direct revoke (line 34: REVOKE EXECUTE ... FROM anon, authenticated).
-- This migration applies the equivalent direct revoke for rls_auto_enable.
--
-- Idempotent: REVOKE on a non-existent grant is a no-op (Postgres logs a
-- WARNING but does not error).

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
