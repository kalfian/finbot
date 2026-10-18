import type Database from "better-sqlite3";
import { requireToken } from "./api-tokens";
import { requireSameOrigin, requireSession, type AuthUser } from "./auth";

type ApiAuth = { user: AuthUser; credential: "jwt" | "generated" | "session" } | { response: Response };

export function requireApiAuth(
  request: Request,
  database: Database.Database,
  options: { write?: boolean; allowPasswordChange?: boolean } = {},
): ApiAuth {
  if (request.headers.has("authorization")) {
    const auth = requireToken(request, database, { allowPasswordChange: options.allowPasswordChange });
    const token = request.headers.get("authorization")?.slice(7) ?? "";
    return "response" in auth ? auth : { user: auth.user, credential: token.startsWith("et_") ? "generated" : "jwt" };
  }
  if (options.write) {
    const denied = requireSameOrigin(request);
    if (denied) return { response: denied };
  }
  const auth = requireSession(request, database, { allowPasswordChange: options.allowPasswordChange });
  return "response" in auth ? auth : { user: auth.user, credential: "session" };
}
