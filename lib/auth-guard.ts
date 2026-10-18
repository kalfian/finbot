import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";
import { session, sessionIdFromCookie } from "@/lib/auth";
import { authorizeRequest, cookieSessionId, requestIsSecure, sameOrigin, validRequestOrigin } from "@/lib/auth-request";

export { requestIsSecure, sameOrigin, validRequestOrigin };

export async function requestSession(request?: Request) {
  if (request) return session(getDatabase(), cookieSessionId(request));
  const value = (await cookies()).get("ledger_session")?.value;
  return session(getDatabase(), sessionIdFromCookie(value));
}
export function requireApi(request: Request, csrf = false, failure = "Unable to process request."): Response | undefined {
  try { return authorizeRequest(getDatabase(), request, csrf); } catch { return Response.json({ error: failure }, { status: 500 }); }
}
