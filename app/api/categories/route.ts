import { getCustomCategories, postCustomCategory } from "@/lib/custom-category-api";
import { createCustomCategoryRepository } from "@/lib/custom-categories";
import { getDatabase } from "@/lib/db";
import { requireApi } from "@/lib/auth-guard";

export const runtime = "nodejs";

function repository() { return createCustomCategoryRepository(getDatabase()); }

export function GET(request: Request): Response {
  const denied = requireApi(request, false, "We couldn't load categories. Please try again.");
  if (denied) return denied;
  try { return getCustomCategories(repository()); }
  catch { return Response.json({ error: "We couldn't load categories. Please try again." }, { status: 500 }); }
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireApi(request, true, "We couldn't save this category. Please try again.");
  if (denied) return denied;
  return postCustomCategory(request, repository());
}
