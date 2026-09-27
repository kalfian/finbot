import { requireToken } from "@/lib/api-tokens";
import { getDatabase } from "@/lib/db";
import { handleExpenseMcp } from "@/lib/expense-mcp";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
    } catch {
      return new Response(null, { status: 403 });
    }
  }
  const database = getDatabase();
  const denied = requireToken(request, database);
  if (denied) return denied;
  return handleExpenseMcp(request, database);
}

export function GET(request: Request): Response {
  const denied = requireToken(request, getDatabase());
  return denied ?? new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE(request: Request): Response {
  const denied = requireToken(request, getDatabase());
  return denied ?? new Response(null, { status: 405, headers: { Allow: "POST" } });
}
