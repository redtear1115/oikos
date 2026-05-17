-- Issue #501 — Pin search_path on compute_next_occurrence and
-- compute_monthly_review_snapshot to silence Supabase advisor warning
-- "Function Search Path Mutable" and harden against search_path hijack.
--
-- Same treatment that 0022 applied to handle_new_user. Using ALTER FUNCTION
-- rather than CREATE OR REPLACE keeps the function body owned by the
-- original migration (0016 and 0026) so there is no risk of body drift.

ALTER FUNCTION public.compute_next_occurrence(date, integer, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.compute_monthly_review_snapshot(uuid, integer, integer)
  SET search_path = public, pg_temp;
