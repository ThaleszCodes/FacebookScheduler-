import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldReloadWorkspace } from "../lib/auth-workspace";
test("tab-focus sign-in and token refresh preserve forms for the same user", () => {
  assert.equal(shouldReloadWorkspace("user-a", "user-a"), false);
  assert.equal(shouldReloadWorkspace(null, null), false);
});
test("initial load, sign-out and account changes reload private data", () => {
  assert.equal(shouldReloadWorkspace(undefined, "user-a"), true);
  assert.equal(shouldReloadWorkspace(undefined, null), true);
  assert.equal(shouldReloadWorkspace("user-a", null), true);
  assert.equal(shouldReloadWorkspace(null, "user-a"), true);
  assert.equal(shouldReloadWorkspace("user-a", "user-b"), true);
});
