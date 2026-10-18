import { createInitialAccount, SESSION_COOKIE, signedSessionValue } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { requestIsSecure, validRequestOrigin } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!validRequestOrigin(request)) return Response.json({ error: "Unable to create administrator account." }, { status: 403 });
  const body = await request.json().catch(() => null) as { password?: unknown; confirmation?: unknown } | null;
  const active = createInitialAccount(getDatabase(), body?.password, body?.confirmation);
  const value = active && signedSessionValue(active.id);
  if (!value) return Response.json({ error: "Unable to create administrator account." }, { status: 400 });
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${requestIsSecure(request) ? "; Secure" : ""}`);
  return response;
}
