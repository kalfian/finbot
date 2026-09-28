import { requireToken } from "@/lib/api-tokens";
import { getDatabase } from "@/lib/db";
import { getProofList, postProof } from "@/lib/proof-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  return requireToken(request, database) ?? getProofList(database, (await params).id);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  return requireToken(request, database) ?? postProof(request, database, (await params).id);
}
