import { getDatabase } from "@/lib/db";
import { getProofList, postProof, sameOrigin } from "@/lib/proof-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  return getProofList(getDatabase(), (await params).id);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  return postProof(request, getDatabase(), (await params).id);
}
