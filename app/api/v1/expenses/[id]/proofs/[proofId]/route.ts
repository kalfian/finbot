import { requireApiAuth } from "@/lib/api-auth";
import { getDatabase } from "@/lib/db";
import { getProofFile } from "@/lib/proof-api";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; proofId: string }> }): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database);
  if ("response" in auth) return auth.response;
  const { id, proofId } = await params;
  return getProofFile(database, auth.user.id, id, proofId);
}
