import ExpenseTracker from "./expense-tracker";
import AuthScreen from "./auth-screen";
import DashboardShell from "./dashboard-shell";
import { accountExists, authConfigured } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { requestSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export default async function Home() {
  const database = getDatabase();
  if (!authConfigured(database)) return <AuthScreen mode="configuration" />;
  if (!accountExists(database)) return <AuthScreen mode="setup" />;
  const active = await requestSession();
  if (!active) return <AuthScreen mode="login" />;
  return <DashboardShell csrfToken={active.csrf_token}><ExpenseTracker /></DashboardShell>;
}
