import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, type AppState } from "../lib/model";
import { runChatTool } from "../lib/chat-tools";
function fixture() {
  const state = emptyState();
  state.groups.push({
    id: crypto.randomUUID(),
    name: "Grupo teste",
    url: "https://www.facebook.com/groups/teste",
    category: "",
    rules: "",
    intervalHours: 24,
    active: true,
  });
  const output = runChatTool(
    state,
    "create_post",
    { title: "Oferta", text: "Copy enviada pelo chat" },
    0,
  );
  return output.state!;
}
function schedule(state: AppState, at = "2030-01-15T11:00:00-03:00") {
  return runChatTool(
    state,
    "schedule_post",
    {
      post_id: state.posts[0].id,
      group_id: state.groups[0].id,
      scheduled_at: at,
    },
    0,
  );
}
test("chat schedules snapshots without publishing or mutating original state", () => {
  const state = fixture(),
    output = schedule(state);
  assert.equal(state.jobs.length, 0);
  assert.equal(output.state!.jobs[0].status, "scheduled");
  assert.equal(output.state!.jobs[0].scheduledAt, "2030-01-15T14:00:00.000Z");
  assert.equal(output.state!.jobs[0].postSnapshot.text, state.posts[0].text);
  assert.equal(
    (output.result as { manual_publication_required: boolean })
      .manual_publication_required,
    true,
  );
});
test("chat rejects retries, paused groups, missing timezone and remote image URLs", () => {
  const state = fixture(),
    first = schedule(state).state!;
  assert.throws(() => schedule(first));
  state.groups[0].active = false;
  assert.throws(() => schedule(state));
  assert.throws(() => schedule(fixture(), "2030-01-15T11:00:00"));
  assert.throws(() =>
    runChatTool(null, "create_post", {
      title: "Oferta",
      text: "Copy",
      image: "https://example.com/private.jpg",
    }),
  );
});
test("chat enforces global daily quota", () => {
  let state = fixture();
  for (let i = 0; i < 11; i++)
    state.groups.push({
      ...state.groups[0],
      id: crypto.randomUUID(),
      name: `Grupo ${i}`,
    });
  for (let i = 0; i < 10; i++)
    state = runChatTool(
      state,
      "schedule_post",
      {
        post_id: state.posts[0].id,
        group_id: state.groups[i].id,
        scheduled_at: `2030-01-15T${String(8 + i).padStart(2, "0")}:00:00-03:00`,
      },
      0,
    ).state!;
  assert.throws(
    () =>
      runChatTool(
        state,
        "schedule_post",
        {
          post_id: state.posts[0].id,
          group_id: state.groups[10].id,
          scheduled_at: "2030-01-15T19:00:00-03:00",
        },
        0,
      ),
    /10 publicações/,
  );
});
test("chat cancels only scheduled jobs and read tools omit image payloads", () => {
  const state = schedule(fixture()).state!;
  const result = runChatTool(state, "cancel_schedule", {
    job_id: state.jobs[0].id,
  });
  assert.equal(result.state!.jobs[0].status, "cancelled");
  assert.throws(() =>
    runChatTool(result.state, "cancel_schedule", { job_id: state.jobs[0].id }),
  );
  assert(
    !JSON.stringify(runChatTool(state, "list_schedule", {}).result).includes(
      "postSnapshot",
    ),
  );
  assert.throws(() => runChatTool(state, "publish_to_facebook", {}));
});
