import ExpenseTracker from "./expense-tracker";
import DashboardShell from "./dashboard-shell";
import { requirePageUser } from "@/lib/page-auth";
export default async function Home() {
  const user = await requirePageUser();
  return (
    <DashboardShell user={user}>
      <ExpenseTracker />
    </DashboardShell>
  );
}
