import { requireApiAuth } from "@/lib/api-auth";
import { createTagRepository, TagConflictError } from "@/lib/tags";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Tag not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try {
    const name = body && typeof body === "object" && "name" in body ? body.name : null;
    const tag = createTagRepository(database, auth.user.id).update(id, name);
    return tag ? Response.json({ tag }) : Response.json({ error: "Tag not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Tag could not be updated." },
      { status: error instanceof TagConflictError ? 409 : 400 });
  }
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Tag not found." }, { status: 404 });
  try {
    const tag = createTagRepository(database, auth.user.id).delete(id);
    return tag ? Response.json({ deleted: true, tag }) : Response.json({ error: "Tag not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Tag could not be deleted." }, { status: 500 });
  }
}
