import { getDatabase } from "@/lib/db";
import { getUserSettings } from "@/lib/user-settings";
import DashboardShell from "../dashboard-shell";
import ActivityTracker from "../activity-tracker";
import { requirePageUser } from "@/lib/page-auth";
export default async function ActivityPage() {
  const user = await requirePageUser();
  return (
    <DashboardShell
      user={user}
      initialTimezone={getUserSettings(getDatabase(), user.id).timezone}
    >
      <div className="legacy-surface">
        <ActivityTracker user={user} />
      </div>
    </DashboardShell>
  );
}
