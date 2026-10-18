import { type CustomCategoryRepository, validateCustomCategoryName } from "./custom-categories";

export function getCustomCategories(repository: CustomCategoryRepository): Response {
  return Response.json({ categories: repository.list() });
}

export async function postCustomCategory(request: Request, repository: CustomCategoryRepository): Promise<Response> {
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const validation = validateCustomCategoryName(body?.name);
  if ("error" in validation) return Response.json({ error: validation.error }, { status: 400 });
  try {
    const category = repository.create(validation.value);
    if (!category) return Response.json({ error: "A category with that name already exists." }, { status: 400 });
    return Response.json({ category }, { status: 201 });
  } catch {
    return Response.json({ error: "We couldn't save this category. Please try again." }, { status: 500 });
  }
}
