import { createSessionRepository, createUserRepository, requireSameOrigin, sessionCookie } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const username = body && typeof body === "object" && "username" in body ? body.username : null;
  const password = body && typeof body === "object" && "password" in body ? body.password : null;
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    return Response.json({ error: "Username and password are required." }, { status: 400 });
  }
  const database = getDatabase();
  const user = createUserRepository(database).authenticate(username, password);
  if (!user) return Response.json({ error: "Invalid username or password." }, { status: 401 });
  const session = createSessionRepository(database).create(user.id);
  return Response.json({ user, accessToken: session.token, tokenType: "Bearer", expiresAt: session.expiresAt.toISOString() }, { headers: {
    "Cache-Control": "no-store",
    "Set-Cookie": sessionCookie(session.token, session.expiresAt, new URL(request.url).protocol === "https:"),
  } });
}
