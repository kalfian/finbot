import { createTokenRepository, requireLocalOwner } from "@/lib/api-tokens";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const denied = requireLocalOwner(request);
  if (denied) return denied;
  return Response.json({ tokens: createTokenRepository(getDatabase()).list() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireLocalOwner(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const label = body && typeof body === "object" && "label" in body ? body.label : null;
  if (typeof label !== "string" || !label.trim() || label.trim().length > 80) {
    return Response.json({ error: "Token name must contain 1-80 characters." }, { status: 400 });
  }
  return Response.json(createTokenRepository(getDatabase()).create(label.trim()), { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireLocalOwner(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const id = body && typeof body === "object" && "id" in body ? body.id : null;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) return Response.json({ error: "Valid token ID is required." }, { status: 400 });
  return createTokenRepository(getDatabase()).revoke(Number(id))
    ? Response.json({ revoked: true })
    : Response.json({ error: "Token not found." }, { status: 404 });
}
