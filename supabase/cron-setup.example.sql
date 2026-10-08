-- Optional alternative to Vercel Pro Cron. Run only in the chosen project.
-- Add two secrets with the Supabase Vault UI first:
-- scheduler_origin = https://your-production-domain
-- scheduler_cron_secret = same CRON_SECRET configured in Vercel
-- Do not put secret values in this file or in source control.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('scheduler-push-every-minute','* * * * *',$job$
 select net.http_get(
   url := (select decrypted_secret from vault.decrypted_secrets where name='scheduler_origin') || '/api/cron',
   headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='scheduler_cron_secret')),
   timeout_milliseconds := 55000
 );
$job$);
-- Disable later: select cron.unschedule('scheduler-push-every-minute');
