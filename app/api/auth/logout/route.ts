import { clearSessionCookie, createSessionRepository, requireSameOrigin, sessionToken } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function POST(request: Request): Response {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  const token = sessionToken(request);
  if (token) createSessionRepository(getDatabase()).revoke(token);
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
  return new Response(null, { status: 303, headers: {
    Location: `${protocol}://${host}/login`,
    "Cache-Control": "no-store",
    "Set-Cookie": clearSessionCookie(new URL(request.url).protocol === "https:"),
  } });
}
