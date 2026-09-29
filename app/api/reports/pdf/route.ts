import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";
import { buildExpensePdf } from "@/lib/expense-report";
import { validateReportRange } from "@/lib/expense-filters";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const database = getDatabase();
  const auth = requireSession(request, database);
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("from") ?? "";
  const end = searchParams.get("to") ?? "";
  const query = searchParams.get("q") ?? "";
  if (!validateReportRange(start, end)) return Response.json({ error: "Choose a valid date range." }, { status: 400 });
  const pdf = await buildExpensePdf(createExpenseRepository(database, auth.user.id).list(), { query, start, end });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="expense-tracker_${start || "all"}_${end || "all"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
