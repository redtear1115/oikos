-- drizzle/0056_recurring_push_cron_vault.sql
-- Supabase removed end-user `ALTER DATABASE SET` privilege for custom GUCs in
-- 2024; 0055 relied on it and never authenticated. Replace with Supabase Vault.
--
-- Prerequisites (one-time, manual, per DB project):
--   SELECT vault.create_secret(
--     '<service_role_key>',
--     'oikos_service_role_key',
--     'Auth bearer for notify-recurring-push cron'
--   );
-- The secret is stored encrypted; only the database can decrypt it.

DO $$
BEGIN
  PERFORM cron.unschedule('notify-recurring-push');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('notify-recurring-push', '10 16 * * *', $$
  SELECT net.http_post(
    url := 'https://cxbnlahuhdvrbwcnzoqo.supabase.co/functions/v1/send-recurring-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'oikos_service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
$$);
