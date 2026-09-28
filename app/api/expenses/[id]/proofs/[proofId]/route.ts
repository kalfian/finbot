import { getDatabase } from "@/lib/db";
import { getProofFile } from "@/lib/proof-api";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; proofId: string }> }): Promise<Response> {
  const { id, proofId } = await params;
  return getProofFile(getDatabase(), id, proofId);
}
