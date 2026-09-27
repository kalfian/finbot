import { requireLocalOwner } from "@/lib/api-tokens";
import { getBudget, putBudget } from "@/lib/budget-api";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  return requireLocalOwner(request) ?? getBudget(request, getDatabase());
}

export async function PUT(request: Request): Promise<Response> {
  return requireLocalOwner(request) ?? putBudget(request, getDatabase());
}
