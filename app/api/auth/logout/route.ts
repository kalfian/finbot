import { getDatabase } from "@/lib/db";
import { revoke, SESSION_COOKIE } from "@/lib/auth";
import { requestIsSecure, requestSession, requireApi } from "@/lib/auth-guard";
export async function POST(request: Request): Promise<Response> {
  const denied = requireApi(request, true); if (denied) return denied;
  const active = await requestSession(request); revoke(getDatabase(), active?.id);
  const response = Response.json({ ok: true }); response.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${requestIsSecure(request) ? "; Secure" : ""}`); return response;
}
