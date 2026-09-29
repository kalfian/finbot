import { createSessionRepository, createUserRepository, requireSameOrigin, requireSession, sessionCookie } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(request: Request): Promise<Response> {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const database = getDatabase();
  const auth = requireSession(request, database, { allowPasswordChange: true });
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const currentPassword = body && typeof body === "object" && "currentPassword" in body ? body.currentPassword : null;
  const newPassword = body && typeof body === "object" && "newPassword" in body ? body.newPassword : null;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return Response.json({ error: "Current and new passwords are required." }, { status: 400 });
  }
  try {
    const user = createUserRepository(database).changePassword(auth.user.id, currentPassword, newPassword);
    const sessions = createSessionRepository(database);
    sessions.revokeUser(user.id);
    const session = sessions.create(user.id);
    return Response.json({ user }, { headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(session.token, session.expiresAt, new URL(request.url).protocol === "https:"),
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Password could not be changed." }, { status: 400 });
  }
}
