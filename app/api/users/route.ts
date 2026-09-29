import { createUserRepository, requireSameOrigin, requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const auth = requireSession(request, database, { admin: true });
  if ("response" in auth) return auth.response;
  return Response.json({ users: createUserRepository(database).list() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const database = getDatabase();
  const auth = requireSession(request, database, { admin: true });
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const username = body && typeof body === "object" && "username" in body ? body.username : null;
  const password = body && typeof body === "object" && "password" in body ? body.password : null;
  if (typeof username !== "string" || typeof password !== "string") {
    return Response.json({ error: "Username and temporary password are required." }, { status: 400 });
  }
  try {
    return Response.json({ user: createUserRepository(database).create(username, password) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "User could not be created.";
    return Response.json({ error: message }, { status: message.includes("already in use") ? 409 : 400 });
  }
}
