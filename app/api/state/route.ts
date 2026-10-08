import { authenticated, apiError } from "@/lib/server";
import { unpackState, packState, payloadJSON } from "@/lib/transport";
export async function GET(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    const { data, error } = await db
      .from("scheduler_workspaces")
      .select("state,revision")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error)
      throw new Error(
        "Não foi possível carregar o espaço. Verifique a instalação do banco.",
      );
    return Response.json(data ?? { state: null, revision: 0 }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 4_000_000)
      return Response.json({ error: "Arquivo muito grande." }, { status: 413 });
    const { db } = await authenticated(request);
    const body = await request.json();
    const state = unpackState(body.state);
    if (!Number.isInteger(body.revision) || body.revision < 0)
      throw new Error("Versão inválida.");
    const { data, error } = await db.rpc("scheduler_save", {
      payload: JSON.parse(payloadJSON(state)),
      expected_revision: body.revision,
    });
    if (error) {
      if (error.message.includes("CONFLICT"))
        return Response.json(
          {
            error:
              "Dados alterados em outro dispositivo. Recarregue antes de continuar.",
          },
          { status: 409 },
        );
      throw new Error("Não foi possível salvar. Tente novamente.");
    }
    return Response.json({ revision: data });
  } catch (e) {
    return apiError(e);
  }
}
