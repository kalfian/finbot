import { requireApiAuth } from "@/lib/api-auth";
import { createTagRepository, TagConflictError } from "@/lib/tags";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const auth = requireApiAuth(request, database);
  if ("response" in auth) return auth.response;
  return Response.json({ tags: createTagRepository(database, auth.user.id).list() },
    { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try {
    const name = body && typeof body === "object" && "name" in body ? body.name : null;
    return Response.json({ tag: createTagRepository(database, auth.user.id).create(name) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Tag could not be created." },
      { status: error instanceof TagConflictError ? 409 : 400 });
  }
}
