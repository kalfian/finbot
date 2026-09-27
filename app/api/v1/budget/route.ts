import { requireToken } from "@/lib/api-tokens";
import { getBudget, putBudget } from "@/lib/budget-api";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  return requireToken(request, database) ?? getBudget(request, database);
}

export async function PUT(request: Request): Promise<Response> {
  const database = getDatabase();
  return requireToken(request, database) ?? putBudget(request, database);
}
