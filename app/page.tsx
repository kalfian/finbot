import { getDatabase } from "@/lib/db";
import { getUserSettings } from "@/lib/user-settings";
import ExpenseTracker from "./expense-tracker";
import DashboardShell from "./dashboard-shell";
import { requirePageUser } from "@/lib/page-auth";
export default async function Home() {
  const user = await requirePageUser();
  return (
    <DashboardShell
      user={user}
      initialTimezone={getUserSettings(getDatabase(), user.id).timezone}
    >
      <ExpenseTracker />
    </DashboardShell>
  );
}
