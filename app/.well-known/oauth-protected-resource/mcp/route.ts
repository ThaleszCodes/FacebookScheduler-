import { protectedResourceMetadata } from "@/lib/mcp-auth";
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url)
    return Response.json({ error: "OAuth not configured" }, { status: 503 });
  return Response.json(protectedResourceMetadata(url), {
    headers: { "Cache-Control": "no-store" },
  });
}
