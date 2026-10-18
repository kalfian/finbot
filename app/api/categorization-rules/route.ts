import { EXPENSE_CATEGORIES } from "@/lib/expense-form";
import { getDatabase } from "@/lib/db";
import { createPortabilityRepository } from "@/lib/portability";
import { requireApi } from "@/lib/auth-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const categories = EXPENSE_CATEGORIES as readonly string[];
const repo = () => createPortabilityRepository(getDatabase());

export async function GET(request: Request): Promise<Response> { const denied = await requireApi(request); if (denied) return denied; try { return Response.json({ rules: repo().listRules() }); } catch { return Response.json({ error: "We couldn't load rules." }, { status: 500 }); } }
export async function POST(request: Request): Promise<Response> {
  const denied = await requireApi(request, true); if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.matchType !== "description" && body.matchType !== "merchant") || typeof body.pattern !== "string" || !body.pattern.trim() || body.pattern.trim().length > 120 || !categories.includes(body.category as string)) return Response.json({ error: "Provide a match type, pattern, and supported category." }, { status: 400 });
  try { return Response.json({ rule: repo().createRule({ matchType: body.matchType, pattern: body.pattern, category: body.category as typeof EXPENSE_CATEGORIES[number] }) }, { status: 201 }); } catch { return Response.json({ error: "We couldn't save this rule." }, { status: 500 }); }
}
export async function PUT(request: Request): Promise<Response> {
  const denied = await requireApi(request, true); if (denied) return denied;
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  if (!body || !Array.isArray(body.ids) || body.ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return Response.json({ error: "ids must be positive integers." }, { status: 400 });
  try { const rules = repo().reorderRules(body.ids as number[]); return Response.json({ rules }); } catch { return Response.json({ error: "We couldn't reorder rules." }, { status: 400 }); }
}
export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireApi(request, true); if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!Number.isSafeInteger(body?.id) || (body?.id as number) <= 0) return Response.json({ error: "id must be a positive integer." }, { status: 400 });
  try { return repo().deleteRule(body!.id as number) ? Response.json({ ok: true }) : Response.json({ error: "Rule not found." }, { status: 404 }); } catch { return Response.json({ error: "We couldn't remove this rule." }, { status: 500 }); }
}
