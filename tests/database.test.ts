import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { emptyState } from "../lib/model";
import { packState } from "../lib/transport";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
test("Postgres migration, RLS isolation, atomic conflicts and reminder leases", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;insert into auth.users values('${alice}'),('${bob}');`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261008134008_initial_scheduler.sql",
      "utf8",
    ),
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false)`,
  );
  let r = await db.query<{ scheduler_save: number }>(
    "select public.scheduler_save($1::jsonb,0)",
    [JSON.stringify(packState(emptyState()))],
  );
  assert.equal(Number(r.rows[0].scheduler_save), 1);
  await assert.rejects(
    () =>
      db.query("select public.scheduler_save($1::jsonb,0)", [
        JSON.stringify(packState(emptyState())),
      ]),
    /CONFLICT/,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
  assert.equal(
    (await db.query("select * from scheduler_workspaces")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into scheduler_workspaces(user_id,state) values($1,$2)",
        [alice, JSON.stringify(packState(emptyState()))],
      ),
    /row-level security/,
  );
  await assert.rejects(
    () => db.query("select * from scheduler_reminders"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select * from scheduler_claim_reminders(10)"),
    /permission denied/,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false)`);
  const state = emptyState(),
    gid = crypto.randomUUID(),
    pid = crypto.randomUUID(),
    cid = crypto.randomUUID();
  state.groups.push({
    id: gid,
    name: "Grupo",
    url: "https://www.facebook.com/groups/example",
    category: "",
    rules: "",
    intervalHours: 24,
    active: true,
  });
  state.posts.push({
    id: pid,
    title: "Post",
    text: "Texto",
    link: "",
    image: "",
    tags: "",
    archived: false,
  });
  state.campaigns.push({
    id: cid,
    name: "Campanha",
    groupIds: [gid],
    postIds: [pid],
    startDate: "2030-01-01",
    days: 1,
    dailyLimit: 10,
    startTime: "09:00",
    endTime: "20:00",
    paused: false,
  });
  state.jobs.push({
    id: crypto.randomUUID(),
    campaignId: cid,
    groupId: gid,
    postId: pid,
    scheduledAt: new Date().toISOString(),
    status: "scheduled",
    resultUrl: "",
    note: "",
    completedAt: "",
    groupSnapshot: state.groups[0],
    postSnapshot: state.posts[0],
  });
  await db.query("select scheduler_save($1::jsonb,1)", [
    JSON.stringify(packState(state)),
  ]);
  const over = {
    ...state,
    jobs: Array.from({ length: 11 }, () => ({
      ...state.jobs[0],
      id: crypto.randomUUID(),
    })),
  };
  await assert.rejects(
    () =>
      db.query("select scheduler_save($1::jsonb,2)", [
        JSON.stringify(packState(over)),
      ]),
    /DAILY_LIMIT_EXCEEDED/,
  );
  await db.query(
    "insert into scheduler_push_subscriptions(user_id,endpoint,subscription) values($1,$2,$3)",
    [
      alice,
      "https://fcm.googleapis.com/fcm/send/test",
      JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { auth: "a".repeat(20), p256dh: "b".repeat(80) },
      }),
    ],
  );
  await db.exec("reset role;set role service_role");
  const first = await db.query("select * from scheduler_claim_reminders(10)");
  assert.equal(first.rows.length, 1);
  const second = await db.query("select * from scheduler_claim_reminders(10)");
  assert.equal(second.rows.length, 0);
  await db.exec(
    "update scheduler_reminders set lease_until=now()-interval '1 minute'",
  );
  assert.equal(
    (await db.query("select * from scheduler_claim_reminders(10)")).rows.length,
    1,
  );
  await db.exec("update scheduler_reminders set status='sent'");
  assert.equal(
    (await db.query("select * from scheduler_claim_reminders(10)")).rows.length,
    0,
  );
  await db.close();
});
