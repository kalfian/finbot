import type Database from "better-sqlite3";
import { session, sessionIdFromCookie, SESSION_COOKIE } from "./auth";

export function requestIsSecure(request: Request): boolean {
  const forwarded = request.headers.get("forwarded");
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" || /(?:^|[;,\s])proto=https(?:[;,\s]|$)/i.test(forwarded ?? "");
}
function expectedOrigin(request: Request): string {
  const protocol = requestIsSecure(request) ? "https" : new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
  return `${protocol}://${host}`;
}
export function sameOrigin(request: Request): boolean { const origin = request.headers.get("origin"); return !origin || origin === expectedOrigin(request); }
export function validRequestOrigin(request: Request): boolean { return Boolean(request.headers.get("origin")) && sameOrigin(request); }
export function cookieSessionId(request: Request): string | undefined {
  const value = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`))?.[1];
  return sessionIdFromCookie(value);
}
export function authorizeRequest(database: Database.Database, request: Request, csrf = false): Response | undefined {
  const active = session(database, cookieSessionId(request));
  if (!active) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (csrf && (!sameOrigin(request) || request.headers.get("x-csrf-token") !== active.csrf_token)) return Response.json({ error: "Invalid request token." }, { status: 403 });
}
