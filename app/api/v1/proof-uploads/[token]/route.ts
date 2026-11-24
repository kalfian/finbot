import { getDatabase } from "@/lib/db";
import { postProofUpload } from "@/lib/proof-api";

export const runtime = "nodejs";

// No bearer token or session: the signed, single-use path token (from the MCP tool
// create_proof_upload) is the credential and is bound to one user and one expense.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  return postProofUpload(request, getDatabase(), (await params).token);
}
