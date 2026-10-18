import { requireApiAuth } from "@/lib/api-auth";
import { CategoryConflictError, CategoryInUseError, createCategoryRepository } from "@/lib/categories";
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
  if (!id) return Response.json({ error: "Category not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try {
    const name = body && typeof body === "object" && "name" in body ? body.name : null;
    const category = createCategoryRepository(database, auth.user.id).update(id, name);
    return category ? Response.json({ category }) : Response.json({ error: "Category not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Category could not be updated." },
      { status: error instanceof CategoryConflictError ? 409 : 400 });
  }
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Category not found." }, { status: 404 });
  try {
    const category = createCategoryRepository(database, auth.user.id).delete(id);
    return category ? Response.json({ deleted: true, category }) : Response.json({ error: "Category not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Category could not be deleted." },
      { status: error instanceof CategoryInUseError ? 409 : 500 });
  }
}
