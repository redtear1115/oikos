-- drizzle/0055_recurring_push_cron.sql
-- After recurring pending generation (UTC 16:00/16:05), fire the push
-- notification edge function at UTC 16:10 via pg_net (pre-enabled on Supabase).
-- Both income and expense pending jobs consolidate into one push call.
--
-- Prerequisites (one-time, manual, per DB project):
--   ALTER DATABASE postgres SET app.supabase_service_key = '<service_role_key>';
-- This setting is not managed by migrations — set it out-of-band in both dev and prod.

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
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
    ),
    body := '{}'::jsonb
  );
$$);
