import { getCategoryBudgets, putCategoryBudget } from "@/lib/category-budget-api";
import { createCategoryBudgetRepository } from "@/lib/category-budgets";
import { getDatabase } from "@/lib/db";
import { requireApi } from "@/lib/auth-guard";

function budgetRepository() {
  return createCategoryBudgetRepository(getDatabase());
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireApi(request); if (denied) return denied;
  try {
    return getCategoryBudgets(request, budgetRepository());
  } catch {
    return Response.json({ error: "We couldn't load category budgets. Please try again." }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireApi(request, true); if (denied) return denied;
  try {
    return await putCategoryBudget(request, budgetRepository());
  } catch {
    return Response.json({ error: "We couldn't save this category budget. Please try again." }, { status: 500 });
  }
}

export const POST = PUT;
