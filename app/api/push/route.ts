import { z } from "zod";
import { authenticated, apiError } from "@/lib/server";
import { isPushEndpoint } from "@/lib/push";
const schema = z.object({
  endpoint: z
    .string()
    .url()
    .refine(isPushEndpoint, "Serviço de push não suportado."),
  keys: z.object({
    p256dh: z.string().min(40).max(200),
    auth: z.string().min(10).max(100),
  }),
});
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    const subscription = schema.parse(await request.json());
    const { count, error: ce } = await db
      .from("scheduler_push_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (ce) throw new Error("Instale as tabelas de notificações primeiro.");
    const { data: existing } = await db
      .from("scheduler_push_subscriptions")
      .select("endpoint")
      .eq("user_id", user.id)
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if ((count || 0) >= 10 && !existing)
      throw new Error(
        "Limite de 10 dispositivos. Desative um dispositivo antigo.",
      );
    const { error } = await db
      .from("scheduler_push_subscriptions")
      .upsert(
        { user_id: user.id, endpoint: subscription.endpoint, subscription },
        { onConflict: "user_id,endpoint" },
      );
    if (error) throw new Error("Não foi possível ativar as notificações.");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    const { endpoint } = await request.json();
    if (typeof endpoint !== "string") throw new Error("Dispositivo inválido.");
    const { error } = await db
      .from("scheduler_push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
    if (error) throw new Error("Não foi possível remover o dispositivo.");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
