-- OPTIONAL — review before running. Kept outside supabase/migrations so
-- `supabase db push` never starts the scheduler by itself.
--
-- Runs the portal-email worker every 15 minutes. Run it only at the
-- rollout step that calls for it (docs/portal-email/SETUP.md). Starting the
-- scheduler sends nothing by itself: the mode, the automatic-emails switch
-- and each booking's own enable all stay as they are.
--
-- Before running, store two Vault secrets (SQL editor, values not in git):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'portal_email_project_url');
--   select vault.create_secret('<same value as PORTAL_EMAIL_CRON_SECRET>', 'portal_email_cron_secret');
-- The cron secret only lets a caller trigger a run; it is not a database key.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'portal-email-worker',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'portal_email_project_url')
           || '/functions/v1/portal-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-portal-email-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'portal_email_cron_secret')
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- To stop the scheduler:
--   select cron.unschedule('portal-email-worker');
