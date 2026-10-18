import { requireApiAuth } from "@/lib/api-auth";
import { getDatabase } from "@/lib/db";
import { getUserSettings, setUserTimezone } from "@/lib/user-settings";
export const runtime = "nodejs";
export function GET(request: Request) {
  const db = getDatabase();
  const auth = requireApiAuth(request, db);
  if ("response" in auth) return auth.response;
  return Response.json(
    { settings: getUserSettings(db, auth.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PUT(request: Request) {
  const db = getDatabase();
  const auth = requireApiAuth(request, db, { write: true });
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Valid JSON is required." }, { status: 400 });
  }
  try {
    const timezone =
      body && typeof body === "object" && "timezone" in body
        ? body.timezone
        : undefined;
    return Response.json(
      { settings: setUserTimezone(db, auth.user.id, timezone) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Settings could not be saved.",
      },
      { status: 400 },
    );
  }
}
