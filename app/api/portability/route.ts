import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";
import { createPortabilityRepository } from "@/lib/portability";
import { requireApi } from "@/lib/auth-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function repositories() {
  const database = getDatabase();
  return { expenses: createExpenseRepository(database), portability: createPortabilityRepository(database) };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireApi(request); if (denied) return denied;
  try {
    const { expenses, portability } = repositories();
    return new Response(portability.exportCsv(expenses.list()), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="expenses.csv"', "cache-control": "no-store" } });
  } catch { return Response.json({ error: "We couldn't export expenses." }, { status: 500 }); }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireApi(request, true); if (denied) return denied;
  try {
    const body = await request.json().catch(() => null) as { action?: unknown; csv?: unknown } | null;
    if (!body || typeof body.csv !== "string" || (body.action !== "preview" && body.action !== "import")) return Response.json({ error: "Provide a CSV string and a preview or import action." }, { status: 400 });
    const { expenses, portability } = repositories();
    const result = body.action === "preview" ? portability.preview(body.csv) : portability.import(body.csv, expense => expenses.create(expense));
    return Response.json(result, { status: body.action === "import" && (result.errors.length || result.duplicates.length) ? 422 : 200 });
  } catch { return Response.json({ error: "We couldn't process this import." }, { status: 500 }); }
}
