-- 0059: run the account-deletion processor daily. Pure SQL call (no Vault/HTTP);
-- the processor is project-agnostic so this same migration runs on dev + prod.
DO $$
BEGIN
  PERFORM cron.unschedule('process-account-deletions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
--> statement-breakpoint
SELECT cron.schedule('process-account-deletions', '30 16 * * *', $$
  SELECT public.process_account_deletions();
$$);
