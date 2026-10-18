import { requireApiAuth } from "@/lib/api-auth";
import { getDatabase } from "@/lib/db";
import { getProofList, postProof } from "@/lib/proof-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database);
  return "response" in auth ? auth.response : getProofList(database, auth.user.id, (await params).id);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  return "response" in auth ? auth.response : postProof(request, database, auth.user.id, (await params).id);
}
