import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/mcp/route";
import {
  protectedResourceMetadata,
  authChallenge,
  safeOAuthRedirect,
} from "../lib/mcp-auth";
const request = (body: unknown, origin?: string) =>
  new Request("https://facebook-group-scheduler.vercel.app/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
test("MCP initialization and discovery reveal schemas without private workspace data", async () => {
  const init = await POST(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    }),
  );
  assert.equal((await init.json()).result.protocolVersion, "2025-06-18");
  const discovery = await POST(
    request({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  );
  const body = await discovery.json();
  assert.equal(body.result.tools.length, 5);
  assert(!JSON.stringify(body).includes("access_token"));
  assert.equal(
    body.result.tools.find(
      (t: { name: string }) => t.name === "cancel_schedule",
    ).annotations.destructiveHint,
    true,
  );
});
test("MCP protects reads and writes with OAuth challenge and rejects foreign browser origins", async () => {
  for (const name of ["list_groups", "create_post", "schedule_post"]) {
    const r = await POST(
      request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name, arguments: {} },
      }),
    );
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("WWW-Authenticate"), authChallenge());
  }
  assert.equal(
    (
      await POST(
        request(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          "https://evil.example",
        ),
      )
    ).status,
    403,
  );
});
test("OAuth discovery names the fixed resource, and redirects cannot execute scripts", () => {
  const m = protectedResourceMetadata(
    "https://mpxbbembbzxtwekwwrvw.supabase.co",
  );
  assert.equal(m.resource, "https://facebook-group-scheduler.vercel.app/mcp");
  assert.deepEqual(m.authorization_servers, [
    "https://mpxbbembbzxtwekwwrvw.supabase.co/auth/v1",
  ]);
  assert.throws(() => safeOAuthRedirect("javascript:alert(1)"));
  assert.throws(() => safeOAuthRedirect("http://example.com/callback"));
  assert.throws(() =>
    safeOAuthRedirect("https://user:password@example.com/callback"),
  );
});
