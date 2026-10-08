import { humanError } from "./errors";
import { createClient } from "@supabase/supabase-js";
export async function authenticated(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!url || !key) throw new Error("NOT_CONFIGURED");
  if (!token) throw new Error("UNAUTHORIZED");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { db, user: data.user };
}
export function apiError(error: unknown) {
  const msg = humanError(error);
  return Response.json(
    {
      error:
        msg === "UNAUTHORIZED"
          ? "Sessão expirada. Entre novamente."
          : msg === "NOT_CONFIGURED"
            ? "Supabase ainda não configurado."
            : msg,
    },
    {
      status:
        msg === "UNAUTHORIZED" ? 401 : msg === "NOT_CONFIGURED" ? 503 : 400,
    },
  );
}
export function admin() {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error("NOT_CONFIGURED");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
