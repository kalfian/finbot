import { requireToken } from "@/lib/api-tokens";
import { getDatabase } from "@/lib/db";
import { getProofFile } from "@/lib/proof-api";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; proofId: string }> }): Promise<Response> {
  const database = getDatabase();
  const denied = requireToken(request, database);
  if (denied) return denied;
  const { id, proofId } = await params;
  return getProofFile(database, id, proofId);
}
