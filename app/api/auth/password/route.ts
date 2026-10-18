import { getDatabase } from "@/lib/db";
import { changePassword, SESSION_COOKIE } from "@/lib/auth";
import { requestIsSecure, requireApi } from "@/lib/auth-guard";
export async function POST(request: Request): Promise<Response> {
  const denied = await requireApi(request, true); if (denied) return denied;
  const body = await request.json().catch(() => null) as { current?: unknown; next?: unknown } | null;
  const updated = changePassword(getDatabase(), body?.current, body?.next);
  if (!updated) return Response.json({ error: "Unable to update password." }, { status: 400 });
  const response = Response.json({ ok: true }); response.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${requestIsSecure(request) ? "; Secure" : ""}`); return response;
}
