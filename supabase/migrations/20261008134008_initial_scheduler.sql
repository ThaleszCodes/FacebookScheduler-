-- Independent workspace per authenticated user. No Facebook token is collected.
create table public.scheduler_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null,
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.scheduler_workspaces enable row level security;
create policy scheduler_workspace_owner on public.scheduler_workspaces for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.scheduler_workspaces to authenticated;
grant all on public.scheduler_workspaces to service_role;

create function public.scheduler_validate_workspace() returns trigger language plpgsql security invoker
set search_path='' as $$
declare j jsonb; g jsonb; c jsonb; p jsonb; arr jsonb; key text;
begin
 if octet_length(new.state::text)>4000000 then raise exception 'WORKSPACE_TOO_LARGE'; end if;
 if new.state->>'version' is distinct from '1' then raise exception 'INVALID_VERSION'; end if;
 foreach key in array array['groups','posts','campaigns','jobs','logs'] loop
   arr:=new.state->key;
   if jsonb_typeof(arr) is distinct from 'array' then raise exception 'INVALID_ARRAY'; end if;
   if jsonb_array_length(arr) > (case key when 'groups' then 200 when 'posts' then 200 when 'campaigns' then 100 when 'jobs' then 5000 else 10000 end) then raise exception 'TOO_MANY_RECORDS'; end if;
   if exists(select 1 from jsonb_array_elements(arr) e where coalesce(e->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'INVALID_ID'; end if;
   if exists(select 1 from jsonb_array_elements(arr) e group by e->>'id' having count(*)>1) then raise exception 'DUPLICATE_ID'; end if;
 end loop;
 for g in select * from jsonb_array_elements(new.state->'groups') loop
   if (g->>'url') !~ '^https://(www\.|m\.)?facebook\.com/groups/[^/?#]+/?$' or (g->>'intervalHours')::int not between 1 and 720 then raise exception 'INVALID_GROUP'; end if;
 end loop;
 for j in select * from jsonb_array_elements(new.state->'jobs') loop
  if coalesce(j->>'scheduledAt','') !~ '^\d{4}-\d{2}-\d{2}T' then raise exception 'INVALID_TIME'; end if;
  perform (j->>'scheduledAt')::timestamptz;
  if coalesce(j->>'status','') not in ('scheduled','published','pending','failed','skipped','cancelled') then raise exception 'INVALID_STATUS'; end if;
  select value into g from jsonb_array_elements(new.state->'groups') where value->>'id'=j->>'groupId';
  select value into c from jsonb_array_elements(new.state->'campaigns') where value->>'id'=j->>'campaignId';
  select value into p from jsonb_array_elements(new.state->'posts') where value->>'id'=j->>'postId';
  if g is null or c is null or p is null or j->'groupSnapshot'->>'id' is distinct from j->>'groupId' or j->'postSnapshot'->>'id' is distinct from j->>'postId' then raise exception 'INVALID_REFERENCE'; end if;
  if nullif(j->>'resultUrl','') is not null and (j->>'resultUrl') !~ '^https://(www\.|m\.)?facebook\.com/' then raise exception 'INVALID_RESULT_URL'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(new.state->'jobs') rec where rec->>'status' not in ('cancelled','skipped') group by ((rec->>'scheduledAt')::timestamptz at time zone 'America/Sao_Paulo')::date having count(*)>10) then raise exception 'DAILY_LIMIT_EXCEEDED'; end if;
 new.updated_at:=now();
 return new;
end; $$;
create trigger scheduler_validate before insert or update on public.scheduler_workspaces for each row execute function public.scheduler_validate_workspace();
revoke execute on function public.scheduler_validate_workspace() from public,anon,authenticated;

-- Atomic compare-and-swap. Lost updates become an explicit conflict.
create function public.scheduler_save(payload jsonb,expected_revision bigint) returns bigint
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); current_revision bigint; result bigint;
begin
 if uid is null then raise exception 'UNAUTHORIZED'; end if;
 -- advisory lock protects first creation as well as subsequent writes
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
 select revision into current_revision from public.scheduler_workspaces where user_id=uid for update;
 if coalesce(current_revision,0)<>expected_revision then raise exception 'CONFLICT'; end if;
 if current_revision is null then
  insert into public.scheduler_workspaces(user_id,state,revision) values(uid,payload,1) returning revision into result;
 else
  update public.scheduler_workspaces set state=payload,revision=revision+1 where user_id=uid returning revision into result;
 end if;
 return result;
end; $$;
revoke execute on function public.scheduler_save(jsonb,bigint) from public,anon;
grant execute on function public.scheduler_save(jsonb,bigint) to authenticated;

create table public.scheduler_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<2048),
 subscription jsonb not null,
 created_at timestamptz not null default now(),
 unique(user_id,endpoint)
);
alter table public.scheduler_push_subscriptions enable row level security;
create policy scheduler_subscription_owner on public.scheduler_push_subscriptions for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.scheduler_push_subscriptions to authenticated;
grant all on public.scheduler_push_subscriptions to service_role;
create index scheduler_subscriptions_user_idx on public.scheduler_push_subscriptions(user_id);
create function public.scheduler_validate_subscription() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,1));
 if new.endpoint is distinct from new.subscription->>'endpoint' or new.endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)/' then raise exception 'INVALID_PUSH_ENDPOINT'; end if;
 if coalesce(length(new.subscription->'keys'->>'p256dh'),0) not between 40 and 200 or coalesce(length(new.subscription->'keys'->>'auth'),0) not between 10 and 100 then raise exception 'INVALID_PUSH_KEYS'; end if;
 if (select count(*) from public.scheduler_push_subscriptions where user_id=new.user_id and id<>new.id)>=10 then raise exception 'DEVICE_LIMIT'; end if;
 return new;
end; $$;
create trigger scheduler_subscription_validate before insert or update on public.scheduler_push_subscriptions for each row execute function public.scheduler_validate_subscription();
revoke execute on function public.scheduler_validate_subscription() from public,anon,authenticated;


create table public.scheduler_reminders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 subscription_id uuid not null references public.scheduler_push_subscriptions(id) on delete cascade,
 job_id uuid not null,
 scheduled_at text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','discarded')),
 attempts int not null default 0,
 lease_until timestamptz,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 unique(subscription_id,job_id,scheduled_at)
);
alter table public.scheduler_reminders enable row level security;
-- Internal queue: no user grants or permissive policies.
revoke all on public.scheduler_reminders from anon,authenticated;
grant all on public.scheduler_reminders to service_role;
create index scheduler_reminders_pending_idx on public.scheduler_reminders(status,lease_until);
create index scheduler_reminders_user_idx on public.scheduler_reminders(user_id);

create function public.scheduler_claim_reminders(batch_size int default 40)
returns setof public.scheduler_reminders language plpgsql security invoker set search_path='' as $$
begin
 insert into public.scheduler_reminders(user_id,subscription_id,job_id,scheduled_at)
 select w.user_id,s.id,(j->>'id')::uuid,j->>'scheduledAt'
 from public.scheduler_workspaces w
 join public.scheduler_push_subscriptions s on s.user_id=w.user_id
 cross join lateral jsonb_array_elements(w.state->'jobs') j
 where j->>'status'='scheduled'
 and (j->>'scheduledAt')::timestamptz between now()-interval '30 minutes' and now()+interval '5 minutes'
 and exists(select 1 from jsonb_array_elements(w.state->'campaigns') c where c->>'id'=j->>'campaignId' and c->>'paused'='false')
 and exists(select 1 from jsonb_array_elements(w.state->'groups') g where g->>'id'=j->>'groupId' and g->>'active'='true')
 on conflict(subscription_id,job_id,scheduled_at) do nothing;
 return query
 with available as (
  select id from public.scheduler_reminders
  where status in ('pending','sending') and coalesce(lease_until,'epoch'::timestamptz)<now() and attempts<3
  and scheduled_at::timestamptz between now()-interval '30 minutes' and now()+interval '5 minutes'
  order by scheduled_at limit least(greatest(batch_size,1),100) for update skip locked
 ) update public.scheduler_reminders r set status='sending',attempts=r.attempts+1,lease_until=now()+interval '2 minutes'
 from available a where r.id=a.id returning r.*;
end; $$;
revoke execute on function public.scheduler_claim_reminders(int) from public,anon,authenticated;
grant execute on function public.scheduler_claim_reminders(int) to service_role;
