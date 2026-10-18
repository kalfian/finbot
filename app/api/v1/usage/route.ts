import { requireApiAuth } from "@/lib/api-auth";
import { getDatabase } from "@/lib/db";
import { validDate } from "@/lib/expense-filters";
import { usageSnapshot } from "@/lib/usage";
export const runtime = "nodejs";
export function GET(request: Request) {
  const db = getDatabase();
  const auth = requireApiAuth(request, db);
  if ("response" in auth) return auth.response;
  const date = new URL(request.url).searchParams.get("date");
  if (date !== null && !validDate(date))
    return Response.json(
      { error: "date must be YYYY-MM-DD." },
      { status: 400 },
    );
  return Response.json(
    { usage: usageSnapshot(db, auth.user.id, date ?? undefined) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
