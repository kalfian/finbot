import { getDatabase } from "@/lib/db";
import { login, signedSessionValue, SESSION_COOKIE } from "@/lib/auth";
import { requestIsSecure, validRequestOrigin } from "@/lib/auth-guard";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  if (!validRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const result = login(getDatabase(), body?.password, request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local");
  if (!result.session) return Response.json({ error: "Unable to sign in." }, { status: 401 });
  const value = signedSessionValue(result.session.id);
  if (!value) return Response.json({ error: "Unable to sign in." }, { status: 503 });
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${requestIsSecure(request) ? "; Secure" : ""}`);
  return response;
}
