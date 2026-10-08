import { authenticated } from "@/lib/server";
import { chatTools, runChatTool } from "@/lib/chat-tools";
import { unpackState, payloadJSON } from "@/lib/transport";
export const runtime = "nodejs";
export async function POST(request: Request) {
  // This endpoint currently uses the app's Supabase user session. Host OAuth pairing is separate.
  let auth;
  try {
    auth = await authenticated(request);
  } catch {
    return Response.json(
      { error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    return new Response(null, { status: 415 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 4_000_000)
    return new Response(null, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON" },
    });
  }
  const reply = (result: unknown) =>
    Response.json(
      { jsonrpc: "2.0", id: body.id, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string")
    return Response.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid request" },
    });
  if (body.id === undefined) return new Response(null, { status: 202 });
  if (body.method === "initialize")
    return reply({
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "facebook-scheduler", version: "0.1.0" },
    });
  if (body.method === "tools/list") return reply({ tools: chatTools });
  if (body.method === "ping") return reply({});
  if (body.method !== "tools/call")
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32601, message: "Method not found" },
    });
  try {
    const { db, user } = auth;
    const { data, error } = await db
      .from("scheduler_workspaces")
      .select("state,revision")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar seus dados.");
    const output = runChatTool(
      data?.state ? unpackState(data.state) : null,
      body.params?.name,
      body.params?.arguments ?? {},
    );
    if (output.state) {
      const saved = await db.rpc("scheduler_save", {
        payload: JSON.parse(payloadJSON(output.state)),
        expected_revision: data?.revision ?? 0,
      });
      if (saved.error)
        throw new Error(
          saved.error.message.includes("CONFLICT")
            ? "Conflito: consulte os dados novamente antes de agendar."
            : "Não foi possível salvar.",
        );
    }
    return reply({
      content: [{ type: "text", text: JSON.stringify(output.result) }],
    });
  } catch (e) {
    return reply({
      isError: true,
      content: [
        {
          type: "text",
          text: e instanceof Error ? e.message : "Falha na operação.",
        },
      ],
    });
  }
}
