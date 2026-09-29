import { getDatabase } from "@/lib/db";
import { getProofList, postProof, sameOrigin } from "@/lib/proof-api";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireSession(request, database);
  return "response" in auth ? auth.response : getProofList(database, auth.user.id, (await params).id);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const database = getDatabase();
  const auth = requireSession(request, database);
  return "response" in auth ? auth.response : postProof(request, database, auth.user.id, (await params).id);
}
