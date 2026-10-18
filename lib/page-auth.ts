import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionRepository, SESSION_COOKIE, type AuthUser } from "./auth";
import { getDatabase } from "./db";

export async function currentPageUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? createSessionRepository(getDatabase()).verify(token) : null;
}

export async function requirePageUser(options: { allowPasswordChange?: boolean; admin?: boolean } = {}): Promise<AuthUser> {
  const user = await currentPageUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowPasswordChange) redirect("/account");
  if (options.admin && user.role !== "admin") redirect("/");
  return user;
}
