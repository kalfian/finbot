import { requireSameOrigin, requireSession } from "@/lib/auth";
import { getBudget, putBudget } from "@/lib/budget-api";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const auth = requireSession(request, database);
  return "response" in auth ? auth.response : getBudget(request, database, auth.user.id);
}

export async function PUT(request: Request): Promise<Response> {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  const database = getDatabase();
  const auth = requireSession(request, database);
  return "response" in auth ? auth.response : putBudget(request, database, auth.user.id);
}
