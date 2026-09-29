import { requireToken } from "@/lib/api-tokens";
import { getBudget, putBudget } from "@/lib/budget-api";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const auth = requireToken(request, database);
  return "response" in auth ? auth.response : getBudget(request, database, auth.user.id);
}

export async function PUT(request: Request): Promise<Response> {
  const database = getDatabase();
  const auth = requireToken(request, database);
  return "response" in auth ? auth.response : putBudget(request, database, auth.user.id);
}
