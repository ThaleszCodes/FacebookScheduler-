import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  type Campaign,
  type AppState,
  dayKey,
  validateState,
  canPrepare,
} from "../lib/model";
import { planCampaign, reschedule } from "../lib/scheduler";
import { packState, unpackState, payloadJSON } from "../lib/transport";
import { isPushEndpoint } from "../lib/push";
export function fixture() {
  const state = emptyState();
  for (let i = 0; i < 12; i++)
    state.groups.push({
      id: crypto.randomUUID(),
      name: "Grupo " + i,
      url: "https://www.facebook.com/groups/" + i,
      category: "Local",
      rules: "Sem spam",
      intervalHours: 24,
      active: true,
    });
  state.posts.push({
    id: crypto.randomUUID(),
    title: "Oferta real",
    text: "Confira nosso produto",
    link: "https://example.com",
    image: "",
    tags: "",
    archived: false,
  });
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    name: "Semana",
    groupIds: state.groups.map((g) => g.id),
    postIds: state.posts.map((p) => p.id),
    startDate: "2030-01-15",
    days: 7,
    dailyLimit: 10,
    startTime: "09:00",
    endTime: "20:00",
    paused: false,
  };
  return { state, campaign };
}
test("rotates groups, respects day quota and group cooldown over 7 days", () => {
  const { state, campaign } = fixture();
  const { jobs } = planCampaign(state, campaign, 0);
  assert(jobs.length >= 50);
  for (const date of new Set(jobs.map((j) => dayKey(j.scheduledAt))))
    assert(jobs.filter((j) => dayKey(j.scheduledAt) === date).length <= 10);
  for (const g of state.groups) {
    const list = jobs
      .filter((j) => j.groupId === g.id)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    for (let i = 1; i < list.length; i++)
      assert(
        Date.parse(list[i].scheduledAt) - Date.parse(list[i - 1].scheduledAt) >=
          24 * 3600000,
      );
  }
});
test("daily limit combines all campaigns, never silently overfills", () => {
  const { state, campaign } = fixture();
  const jobs = planCampaign(state, { ...campaign, days: 1 }, 0).jobs;
  const s = { ...state, campaigns: [campaign], jobs };
  assert.throws(
    () => planCampaign(s, { ...campaign, id: crypto.randomUUID(), days: 1 }, 0),
    /Nenhum horário/,
  );
  assert.throws(
    () =>
      validateState({
        ...s,
        jobs: [...jobs, { ...jobs[0], id: crypto.randomUUID() }],
      }),
    /10 publicações/,
  );
});
test("limited groups produce explicit warnings rather than violate cooldown", () => {
  const { state, campaign } = fixture();
  const result = planCampaign(
    state,
    { ...campaign, groupIds: [state.groups[0].id], days: 1 },
    0,
  );
  assert.equal(result.jobs.length, 1);
  assert(result.warnings.length);
});
test("past times are excluded; Brasília day differs from UTC", () => {
  assert.equal(dayKey("2030-01-16T01:00:00Z"), "2030-01-15");
  const { state, campaign } = fixture();
  const r = planCampaign(
    state,
    { ...campaign, days: 1 },
    Date.parse("2030-01-15T20:00:00Z"),
  );
  assert(
    r.jobs.every(
      (j) => Date.parse(j.scheduledAt) >= Date.parse("2030-01-15T20:00:00Z"),
    ),
  );
});
test("rejects empty selections and reversed window", () => {
  const { state, campaign } = fixture();
  assert.throws(() => planCampaign(state, { ...campaign, groupIds: [] }, 0));
  assert.throws(() =>
    planCampaign(state, { ...campaign, endTime: "08:00" }, 0),
  );
});
test("reschedule checks past times, proximity, cooldown and quota", () => {
  const { state, campaign } = fixture();
  const jobs = planCampaign(state, { ...campaign, days: 1 }, 0).jobs;
  const s = { ...state, campaigns: [campaign], jobs };
  assert.throws(
    () => reschedule(s, jobs[0].id, jobs[1].scheduledAt, 0),
    /15 minutos/,
  );
  assert.throws(
    () => reschedule(s, jobs[0].id, "2020-01-01T12:00:00Z", Date.now()),
    /futuro/,
  );
  assert.equal(
    reschedule(s, jobs[0].id, "2030-01-20T12:00:00Z", 0).jobs[0].scheduledAt,
    "2030-01-20T12:00:00Z",
  );
});
test("snapshot survives library edits and paused campaigns disable preparation", () => {
  const { state, campaign } = fixture();
  const jobs = planCampaign(state, campaign, 0).jobs;
  state.posts[0].text = "Alterado";
  assert.equal(jobs[0].postSnapshot.text, "Confira nosso produto");
  const s = { ...state, jobs, campaigns: [{ ...campaign, paused: true }] };
  assert.equal(canPrepare(s, jobs[0]), false);
});
test("image deduplication roundtrips without changing immutable snapshots", () => {
  const { state, campaign } = fixture();
  state.posts[0].image = "data:image/jpeg;base64,YWJj";
  const jobs = planCampaign(state, campaign, 0).jobs;
  const s = { ...state, jobs, campaigns: [campaign] };
  const packed = packState(s);
  assert.equal(Object.keys(packed.images).length, 1);
  assert.deepEqual(unpackState(packed), s);
  assert(payloadJSON(s).length < JSON.stringify(s).length);
});
test("validation rejects unsafe Facebook links and invalid references", () => {
  const { state, campaign } = fixture();
  assert.throws(() =>
    validateState({
      ...state,
      groups: [
        { ...state.groups[0], url: "https://facebook.com.evil.test/groups/x" },
      ],
    }),
  );
  const jobs = planCampaign(state, campaign, 0).jobs;
  assert.throws(() => validateState({ ...state, jobs, campaigns: [] }));
  assert.throws(() =>
    validateState({
      ...state,
      posts: [{ ...state.posts[0], link: "javascript:alert(1)" }],
    }),
  );
});
test("push endpoints cannot target internal or arbitrary hosts", () => {
  assert(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  for (const url of [
    "http://fcm.googleapis.com/test",
    "https://localhost/test",
    "https://169.254.169.254/latest",
    "https://fcm.googleapis.com.evil.test/a",
    "https://user:pass@fcm.googleapis.com/a",
    "https://fcm.googleapis.com:4433/a",
  ])
    assert.equal(isPushEndpoint(url), false);
});

test("retention preserves scheduled jobs and pending approvals even when old", async () => {
  const { cleanupClosedHistory } = await import("../lib/retention");
  const { state, campaign } = fixture();
  const jobs = planCampaign(state, { ...campaign, days: 1 }, 0).jobs.slice(
    0,
    3,
  );
  jobs[0].status = "published";
  jobs[1].status = "pending";
  const result = cleanupClosedHistory(
    { ...state, jobs, campaigns: [campaign] },
    "2030-12-01",
  );
  assert.equal(result.removed, 1);
  assert(result.state.jobs.some((j) => j.status === "pending"));
  assert(result.state.jobs.some((j) => j.status === "scheduled"));
  assert.equal(result.state.campaigns.length, 1);
});
