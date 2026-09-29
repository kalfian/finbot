import { createTokenRepository } from "@/lib/api-tokens";
import { requireSameOrigin, requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const auth = requireSession(request, database);
  if ("response" in auth) return auth.response;
  return Response.json({ tokens: createTokenRepository(database, auth.user.id).list() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  const database = getDatabase();
  const auth = requireSession(request, database);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const label = body && typeof body === "object" && "label" in body ? body.label : null;
  if (typeof label !== "string" || !label.trim() || label.trim().length > 80) {
    return Response.json({ error: "Token name must contain 1-80 characters." }, { status: 400 });
  }
  return Response.json(createTokenRepository(database, auth.user.id).create(label.trim()), { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  const database = getDatabase();
  const auth = requireSession(request, database);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const id = body && typeof body === "object" && "id" in body ? body.id : null;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) return Response.json({ error: "Valid token ID is required." }, { status: 400 });
  return createTokenRepository(database, auth.user.id).revoke(Number(id))
    ? Response.json({ revoked: true })
    : Response.json({ error: "Token not found." }, { status: 404 });
}
